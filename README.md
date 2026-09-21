# Buscador Bibliográfico y de Portadas — versión 1.0

Aplicación web (HTML, CSS y JavaScript sin frameworks) que identifica libros por **ISBN-10, ISBN-13 o título**, contrasta autor, editorial y año, localiza metadatos y portadas en **Open Library** y **Google Books**, calcula un porcentaje de coincidencia, permite validación manual y exporta un **XLSX real con las portadas insertadas**.

## 1. Arquitectura

```
buscador-bibliografico/
├── index.html                  Interfaz (carga los módulos en orden de dependencia)
├── buscador-bibliografico.html Versión de un solo archivo (generada por construir.py)
├── construir.py                Une los módulos en un único HTML
├── css/styles.css              Estilos (responsive, modo oscuro, foco visible)
└── js/
    ├── config.js               Pesos, umbrales, red, fuentes (configuración central)
    ├── utils.js                normalizarTexto(), fetch con reintentos, escape HTML
    ├── isbn.js                 normalizarISBN(), validarISBN10/13(), convertirISBN10a13/13a10()
    ├── sources/
    │   ├── registry.js         Registro de adaptadores + modelo OBRA / EDICIÓN
    │   ├── openlibrary.js      Adaptador Open Library
    │   ├── googlebooks.js      Adaptador Google Books
    │   └── _plantilla-fuente.js Plantilla para nuevas fuentes (no se carga)
    ├── matcher.js              Motor de coincidencia y clasificación
    ├── covers.js               obtenerPortada(): verificación, tamaño grande, base64 para Excel
    ├── search.js               buscarPorISBN(), buscarPorTitulo(), buscarPorTituloAutor(),
    │                           consultarOpenLibrary(), consultarGoogleBooks(), caché, cola por lotes
    ├── results.js              Estado de la sesión, tabla, detalle, filtros, contadores
    ├── excel.js                Importación XLSX/CSV, plantilla, exportación XLSX
    └── app.js                  Controlador de la interfaz
```

Flujo: **Captura → Normalización → Fuentes → Coincidencia → Portada → Validación → Exportación.**

Los módulos son scripts clásicos que cuelgan de un espacio de nombres global `BB` (no módulos ES), porque los navegadores bloquean `import` cuando la página se abre con doble clic (`file://`). Así la aplicación funciona sin servidor. Migrar a módulos ES solo exige cambiar `BB.X = ...` por `export`.

### Modelo de datos (obra frente a edición)

Cada fuente devuelve candidatos con esta forma, sin excepción:

```js
{
  fuente: 'Open Library',
  obra:    { titulo, subtitulo, autores: [], idObra },
  edicion: { isbn10, isbn13, isbns13: [], editorial, anio, idEdicion,
             portadaUrl, portadaNivel: 'edición' | 'obra' | 'volumen',
             portadaEstado: 'verificada' | 'inaccesible' | 'sin portada' },
  urlFuente, fechaConsulta, ev: { score, det }
}
```

Por título, Open Library se consulta en dos pasos: primero las **obras** (`/search.json`) y luego sus **ediciones** (`/works/{id}/editions.json`). Así cada portada queda ligada a una edición concreta. Si una obra no tiene ediciones disponibles, su portada se marca como «portada de la obra, no verificada para esta edición».

## 2. Cómo ejecutarla

1. Abra `buscador-bibliografico.html` (o `index.html` de la versión modular) con doble clic en Chrome, Edge, Firefox o Safari actuales.
2. Se requiere Internet: las fuentes son servicios en línea, y la biblioteca de Excel (ExcelJS 4.4.0) se carga desde jsDelivr.
3. Opcional: sírvala con un servidor local (`python3 -m http.server 8000`) o publíquela en GitHub Pages. Funciona igual.

Si modifica los archivos de `js/` o `css/`, ejecute `python3 construir.py` para regenerar la versión de un solo archivo.

## 3. Ejemplo de búsqueda individual

1. Elija **ISBN-10** y escriba `0-14-032872-6`. La ayuda confirma en vivo: «ISBN-10 válido. Equivale a ISBN-13 9780140328721». Si escribe un ISBN-13 en el modo ISBN-10, el modo cambia solo.
2. Opcionalmente añada título, autor, editorial o año para contrastar la edición.
3. Pulse **Buscar**. Aparece una fila con estado, portada, datos, fuente y confianza, y su detalle abierto con la comparación «dato solicitado / dato encontrado», los candidatos y las portadas disponibles.

Por título: elija **Título**, escriba `El llano en llamas`, autor `Juan Rulfo`, editorial `FCE`, año `1953`. Las siglas editoriales se reconocen («FCE» = «Fondo de Cultura Económica», «SEP» = «Secretaría de Educación Pública»).

## 4. Ejemplo de procesamiento masivo

**Lista pegada**, un libro por línea, en cualquiera de estas formas:

```
9786070123456
0140328726
El llano en llamas | Juan Rulfo | FCE | 1953
9780140328721 | Fantastic Mr. Fox | Roald Dahl | Puffin | 1988
Pedro Páramo
```

También puede copiar columnas desde Excel (con encabezados) y pegarlas.

**Archivo Excel o CSV:** arrastre el archivo a la zona de importación. Se reconocen encabezados como `ISBN`, `ISBN-10`, `ISBN-13`, `Título`, `Autor`, `Editorial`, `Año` (con o sin acentos, en español o inglés). El botón «Descargar plantilla de Excel» genera un archivo listo para llenar. Si Excel convirtió un ISBN-10 en número y perdió el cero inicial, se repone.

Durante el lote se muestra «57 de 294 procesados», con **Pausar/Reanudar** y **Cancelar**. La interfaz no se bloquea. Se procesan 3 registros a la vez (configurable de 1 a 6) con pausas de 300 ms, y un error en un registro no detiene el resto.

## 5. Motor de coincidencia

Pesos por defecto en `js/config.js` (editables también desde el panel Configuración):

| Campo | Peso | Cálculo de similitud (0–1) |
|---|---|---|
| ISBN | 35 | 1 si el ISBN-13 solicitado (o su equivalente del ISBN-10) está entre los ISBN de la edición |
| Título | 25 | Máximo entre Dice de palabras, contención y bigramas de caracteres, sin acentos ni palabras vacías |
| Autor | 20 | Proporción de palabras del autor solicitado presentes (tolera «Rulfo, Juan» y erratas) |
| Editorial | 12 | Similitud tras quitar «Editorial», «S.A. de C.V.», etc.; reconoce siglas |
| Año | 8 | 1 si es igual; 0.6 a un año; 0.3 hasta tres años |

La confianza es el promedio ponderado **solo sobre los campos que usted aportó**. Si la fuente no informa un campo solicitado, cuenta como 0 y queda anotado en observaciones.

Clasificación:

| Estado | Regla principal |
|---|---|
| CONFIRMADO | ISBN exacto con datos concordantes; o, sin ISBN, título, autor, editorial y año concordantes y confianza ≥ 85 % |
| COINCIDENCIA PROBABLE | La obra coincide y la confianza es ≥ 60 %, pero falta confirmar la edición |
| EDICIÓN DIFERENTE | La obra coincide, pero el ISBN, la editorial o el año solicitados no aparecen |
| REVISIÓN MANUAL | Varias ediciones plausibles con puntuación similar, o ISBN que coincide con un título muy distinto |
| NO ENCONTRADO | Sin resultados o sin coincidencia mínima (35 %) |

## 6. Estructura del XLSX generado

**Hoja «Resultados»**: Estado, Portada (imagen incrustada), Título, Autor, Editorial, ISBN-10, ISBN-13, Año, Fuente, Confianza (%), URL de fuente, URL de portada, Observaciones; seguidas de N.º registro, Origen, Solicitado: ISBN / Título / Autor / Editorial / Año y Validación (automática o manual con fecha). Tiene encabezado fijo, autofiltro, estado coloreado, hipervínculos y la URL de portada se conserva aunque la imagen esté insertada.

**Hoja «Fuentes»**: una fila por cada consulta realizada: registro, fuente consultada, tipo de consulta (ISBN o título/autor), resultado (número de resultados o error), fecha de consulta, fuente del resultado elegido, URL de fuente, URL de portada y nivel de la portada.

**Hoja «Revisión»**: registros no validados en estado probable, edición diferente, revisión manual o no encontrado, con motivo, datos solicitados, mejor candidato, confianza, número de candidatos, observaciones y acción sugerida.

Nota sobre imágenes: para incrustar una portada, el navegador debe poder descargarla y el servidor de imágenes debe permitirlo (CORS). Las portadas de Open Library lo permiten. Las de Google Books pueden no permitirlo; en ese caso la celda indica «Imagen no insertable (ver URL)» y la URL se conserva.

## 7. Cómo agregar una fuente bibliográfica

1. Copie `js/sources/_plantilla-fuente.js` como, por ejemplo, `js/sources/worldcat.js`.
2. Implemente `buscarPorISBN(info)` y `buscarPorTitulo({titulo, autor, editorial, anio})`. Ambas deben devolver un arreglo creado con `BB.Fuentes.crearCandidato({...})`.
3. Regístrela con `BB.Fuentes.registrar({ id, nombre, activa, buscarPorISBN, buscarPorTitulo })`.
4. Agregue `<script src="js/sources/worldcat.js"></script>` en `index.html` después de `registry.js` y ejecute `construir.py`.

No hay que tocar la interfaz, el motor ni la exportación: la caché, la cola, la puntuación y el Excel funcionan con cualquier adaptador.

Para catálogos sin API pública abierta (SEP, Libros del Rincón, Biblioteca de México, Biblioteca Nacional, WorldCat, Library of Congress), o que requieran credenciales, la consulta debe hacerse a través de un **backend o proxy propio** que guarde las claves y resuelva CORS; el adaptador solo llama a ese proxy. Library of Congress ofrece una API JSON pública (`loc.gov/books/?fo=json`) que puede ser el siguiente adaptador. WorldCat requiere credenciales de OCLC.

## 8. Robustez

| Situación | Comportamiento |
|---|---|
| ISBN inválido | Se explica el error (dígito de control o longitud). Si hay título, se busca por título |
| ISBN no encontrado | Se busca por título si existe; si no, NO ENCONTRADO con motivo |
| API sin respuesta | Tiempo límite de 12 s y 2 reintentos con espera creciente; la fila ofrece «Reintentar» |
| Límite de solicitudes (429) | La fuente se pausa 60 s para no agravar el bloqueo; las demás siguen |
| Sin portada o imagen inaccesible | Se verifica la imagen; si falla se indica, y se usa otra portada solo si es de la misma edición (mismo ISBN-13) |
| Varias ediciones | REVISIÓN MANUAL con la lista de candidatos para elegir |
| Datos incompletos | Se usan solo los campos aportados; lo que falta en la fuente se anota |
| Registros duplicados | Se marcan («duplicado del n.º X») y se consultan una sola vez gracias a la caché |
| Valores técnicos | Nunca se muestra `undefined`, `null` ni `NaN`; se muestra «—» |

## 9. Supuestos y límites de esta versión

- Open Library devuelve hasta 40 ediciones por obra (configurable) y se revisan las 3 obras más pertinentes. En obras con cientos de ediciones, la edición buscada puede no estar entre ellas; en ese caso el estado lo refleja.
- Google Books sin clave comparte una cuota pública que puede agotarse en lotes grandes. Puede introducir su propia clave de API en Configuración; solo se conserva mientras la página esté abierta.
- La aplicación no hace scraping ni inventa datos: todo proviene de las respuestas de las fuentes y cada resultado conserva su fuente y URL.
- Los resultados viven en la sesión del navegador; exporte a Excel antes de cerrar la pestaña.
