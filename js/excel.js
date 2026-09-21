/* =====================================================================
   js/excel.js — Importación (XLSX/CSV) y exportación XLSX (ExcelJS)
   Se usa ExcelJS porque, a diferencia de SheetJS Community, permite
   insertar imágenes físicamente dentro de la hoja.
   ===================================================================== */
BB.Excel = (() => {
  const U = BB.Utils, E = BB.ESTADOS;

  const ALIAS = {
    isbn13: ['isbn 13', 'isbn13'],
    isbn10: ['isbn 10', 'isbn10'],
    isbn: ['isbn'],
    titulo: ['titulo', 'title', 'obra', 'titulo de la obra', 'nombre del libro', 'libro'],
    autor: ['autor', 'autores', 'author', 'authors', 'autora', 'autor es'],
    editorial: ['editorial', 'editor', 'publisher', 'casa editorial', 'sello', 'sello editorial'],
    anio: ['ano', 'anio', 'year', 'fecha', 'ano de publicacion', 'ano de edicion', 'fecha de publicacion']
  };

  function mapearEncabezados(celdas) {
    const mapa = {};
    celdas.forEach((c, i) => {
      const n = U.normalizarTexto(c);
      for (const [campo, lista] of Object.entries(ALIAS)) {
        if (!(campo in mapa) && lista.includes(n)) { mapa[campo] = i; break; }
      }
    });
    return ('titulo' in mapa || 'isbn' in mapa || 'isbn10' in mapa || 'isbn13' in mapa) ? mapa : null;
  }

  function valorCelda(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return String(v.getFullYear());
    if (typeof v === 'object') {
      if (v.richText) return v.richText.map(t => t.text).join('');
      if ('result' in v) return valorCelda(v.result);
      if (v.text) return valorCelda(v.text);
      return '';
    }
    return U.limpio(v);
  }

  /** Excel guarda ISBN como número y pierde ceros iniciales: se reponen con cautela. */
  function repararISBN(s, campo) {
    const t = U.limpio(s);
    if (/^\d{9}$/.test(t) && campo !== 'isbn13') return '0' + t;
    return t;
  }

  function registroDesdeCeldas(celdas, mapa, fila) {
    const v = campo => (campo in mapa ? U.limpio(celdas[mapa[campo]]) : '');
    const c13 = repararISBN(v('isbn13'), 'isbn13'), c10 = repararISBN(v('isbn10'), 'isbn10'), cg = repararISBN(v('isbn'), 'isbn');
    const notas = [];
    const validos = [c13, cg, c10].filter(x => x && BB.ISBN.analizar(x).valido);
    const isbn = validos[0] || c13 || cg || c10;
    if (c10 && c13) {
      const a10 = BB.ISBN.analizar(c10), a13 = BB.ISBN.analizar(c13);
      if (a10.valido && a13.valido && a10.isbn13 !== a13.isbn13) notas.push('El ISBN-10 y el ISBN-13 de la entrada no son equivalentes; se usó el ISBN-13');
    }
    return { isbn, isbnOriginal10: c10, isbnOriginal13: c13 || (cg && BB.ISBN.normalizarISBN(cg).length === 13 ? cg : ''),
      titulo: v('titulo'), autor: v('autor'), editorial: v('editorial'), anio: v('anio'), fila, notas };
  }

  function filasARegistros(filas, origen) {
    let inicio = -1, mapa = null;
    for (let i = 0; i < Math.min(filas.length, 6); i++) {
      mapa = mapearEncabezados(filas[i].celdas);
      if (mapa) { inicio = i; break; }
    }
    if (!mapa) throw new Error('No se reconocieron encabezados. Use columnas como ISBN, ISBN-10, ISBN-13, Título, Autor, Editorial y Año (descargue la plantilla).');
    return filas.slice(inicio + 1)
      .map(f => registroDesdeCeldas(f.celdas, mapa, `${origen} fila ${f.n}`))
      .filter(r => r.isbn || r.titulo);
  }

  function parsearCSV(texto) {
    const primera = texto.split(/\r?\n/)[0] || '';
    const sep = [';', '\t', ','].sort((a, b) => primera.split(b).length - primera.split(a).length)[0];
    const filas = []; let fila = [], campo = '', comillas = false;
    for (let i = 0; i < texto.length; i++) {
      const ch = texto[i];
      if (comillas) {
        if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
        else if (ch === '"') comillas = false;
        else campo += ch;
      } else if (ch === '"') comillas = true;
      else if (ch === sep) { fila.push(campo); campo = ''; }
      else if (ch === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
      else if (ch !== '\r') campo += ch;
    }
    if (campo || fila.length) { fila.push(campo); filas.push(fila); }
    return filas.map((c, i) => ({ celdas: c, n: i + 1 })).filter(f => f.celdas.some(x => U.limpio(x)));
  }

  async function leerArchivo(file) {
    const nombre = file.name.toLowerCase();
    if (nombre.endsWith('.csv') || nombre.endsWith('.txt')) {
      return filasARegistros(parsearCSV(await file.text()), file.name);
    }
    if (nombre.endsWith('.xls')) throw new Error('El formato .xls antiguo no es compatible. Guarde el archivo como .xlsx desde Excel.');
    if (!window.ExcelJS) throw new Error('No se pudo cargar la biblioteca de Excel (se requiere conexión a Internet).');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) throw new Error('El archivo no contiene hojas.');
    const filas = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      const celdas = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => { celdas[col - 1] = valorCelda(cell.value); });
      for (let i = 0; i < celdas.length; i++) if (celdas[i] === undefined) celdas[i] = '';
      filas.push({ celdas, n });
    });
    return filasARegistros(filas, ws.name);
  }

  /* ---------------------------- Estilos ---------------------------- */
  const COLOR_ESTADO = {
    [E.CONFIRMADO]: 'FFDDF1E4', [E.PROBABLE]: 'FFDCE9F8', [E.DIFERENTE]: 'FFFBEBD2',
    [E.REVISION]: 'FFEDE3F6', [E.NO_ENCONTRADO]: 'FFF6DEDE', [E.PENDIENTE]: 'FFEDEDED', [E.PROCESANDO]: 'FFEDEDED'
  };
  function estiloEncabezado(ws) {
    const fila = ws.getRow(1);
    fila.height = 30;
    fila.eachCell(c => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 11 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2D4A' } };
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      c.border = { bottom: { style: 'medium', color: { argb: 'FFB3262E' } } };
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  }
  function enlace(celda, url) {
    if (!url) { celda.value = ''; return; }
    celda.value = { text: url, hyperlink: url };
    celda.font = { color: { argb: 'FF1F5F9B' }, underline: true };
  }
  const bordeFino = { top: { style: 'thin', color: { argb: 'FFD5DAE1' } }, bottom: { style: 'thin', color: { argb: 'FFD5DAE1' } } };

  /* --------------------------- Plantilla --------------------------- */
  async function descargarPlantilla() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Libros');
    ws.columns = [
      { header: 'ISBN-13', key: 'i13', width: 18 }, { header: 'ISBN-10', key: 'i10', width: 14 },
      { header: 'Título', key: 't', width: 40 }, { header: 'Autor', key: 'a', width: 28 },
      { header: 'Editorial', key: 'e', width: 24 }, { header: 'Año', key: 'y', width: 8 }
    ];
    ws.getColumn(1).numFmt = '@'; ws.getColumn(2).numFmt = '@';
    ws.addRow({ i13: '', i10: '', t: '(Escriba aquí el título si no tiene ISBN)', a: '', e: '', y: '' });
    estiloEncabezado(ws);
    const buf = await wb.xlsx.writeBuffer();
    U.descargar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'plantilla_buscador_bibliografico.xlsx');
  }

  /* --------------------------- Exportación ------------------------- */
  async function exportar(registros, alAvanzar = () => {}) {
    if (!window.ExcelJS) throw new Error('No se pudo cargar la biblioteca de Excel (se requiere conexión a Internet).');
    const R = BB.Results, CX = BB.CONFIG.excel;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Buscador Bibliográfico y de Portadas';
    wb.created = new Date();

    // --- Hoja 1: Resultados ---
    const ws = wb.addWorksheet('Resultados');
    ws.columns = [
      { header: 'Estado', width: 22 }, { header: 'Portada', width: 11 }, { header: 'Título', width: 38 },
      { header: 'Autor', width: 26 }, { header: 'Editorial', width: 24 }, { header: 'ISBN-10', width: 13 },
      { header: 'ISBN-13', width: 16 }, { header: 'Año', width: 7 }, { header: 'Fuente', width: 14 },
      { header: 'Confianza', width: 11 }, { header: 'URL de fuente', width: 34 }, { header: 'URL de portada', width: 34 },
      { header: 'Observaciones', width: 60 },
      { header: 'N.º registro', width: 10 }, { header: 'Origen', width: 20 },
      { header: 'Solicitado: ISBN', width: 16 }, { header: 'Solicitado: Título', width: 30 },
      { header: 'Solicitado: Autor', width: 22 }, { header: 'Solicitado: Editorial', width: 20 },
      { header: 'Solicitado: Año', width: 10 }, { header: 'Validación', width: 22 }
    ];
    estiloEncabezado(ws);
    ws.getColumn(6).numFmt = '@'; ws.getColumn(7).numFmt = '@'; ws.getColumn(16).numFmt = '@';

    const conImagen = [];
    registros.forEach(reg => {
      const c = R.seleccionado(reg), p = R.portadaDe(reg), e = reg.entrada;
      const fila = ws.addRow([
        reg.estado, '', c ? c.obra.titulo : '', c ? c.obra.autores.join('; ') : '', c ? c.edicion.editorial : '',
        c ? c.edicion.isbn10 : '', c ? c.edicion.isbn13 : '', c ? c.edicion.anio : '', c ? c.fuente : '',
        c ? c.ev.score / 100 : '', '', '', R.observaciones(reg).join(' | '),
        reg.num, U.limpio(e.fila), U.limpio(e.isbn), U.limpio(e.titulo), U.limpio(e.autor), U.limpio(e.editorial), U.limpio(e.anio),
        reg.validadoManual ? `Manual (${U.fechaLegible(reg.validadoManual)})` : 'Automática'
      ]);
      fila.height = p ? CX.altoFila : 30;
      fila.eachCell({ includeEmpty: true }, cell => { cell.alignment = { vertical: 'top', wrapText: true }; cell.border = bordeFino; });
      fila.getCell(10).numFmt = '0%';
      fila.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ESTADO[reg.estado] || 'FFFFFFFF' } };
      fila.getCell(1).font = { bold: true };
      enlace(fila.getCell(11), c ? c.urlFuente : '');
      enlace(fila.getCell(12), p ? p.url : '');
      fila.getCell(2).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      if (p) conImagen.push({ fila, url: p.url }); else fila.getCell(2).value = 'Sin portada';
    });

    // Insertar imágenes (con concurrencia limitada)
    let hechas = 0, fallidas = 0, idx = 0;
    const trabajador = async () => {
      while (idx < conImagen.length) {
        const item = conImagen[idx++];
        const img = await BB.Covers.aBase64(item.url);
        if (img) {
          const id = wb.addImage({ base64: img.base64, extension: 'jpeg' });
          const alto = CX.altoImagen, ancho = Math.round(img.w * (alto / img.h));
          ws.addImage(id, { tl: { col: 1.08, row: item.fila.number - 1 + 0.06 }, ext: { width: Math.min(ancho, 76), height: alto }, editAs: 'oneCell' });
        } else {
          fallidas++;
          item.fila.getCell(2).value = 'Imagen no insertable (ver URL)';
          item.fila.getCell(2).font = { size: 8, color: { argb: 'FF666666' } };
        }
        hechas++; alAvanzar(`Insertando portadas: ${hechas} de ${conImagen.length}`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CX.concurrenciaImagenes, conImagen.length) }, trabajador));

    // --- Hoja 2: Fuentes ---
    const wf = wb.addWorksheet('Fuentes');
    wf.columns = [
      { header: 'N.º registro', width: 10 }, { header: 'Título solicitado / ISBN', width: 36 },
      { header: 'Fuente consultada', width: 18 }, { header: 'Tipo de consulta', width: 16 },
      { header: 'Resultado de la consulta', width: 34 }, { header: 'Fecha de consulta', width: 18 },
      { header: 'Fuente del resultado elegido', width: 20 }, { header: 'URL de fuente', width: 40 },
      { header: 'URL de portada', width: 40 }, { header: 'Nivel de la portada', width: 16 }
    ];
    estiloEncabezado(wf);
    registros.forEach(reg => {
      const c = R.seleccionado(reg), p = R.portadaDe(reg);
      const ref = U.limpio(reg.entrada.titulo) || U.limpio(reg.entrada.isbn);
      const consultas = reg.consultas && reg.consultas.length ? reg.consultas : [{ fuente: '', tipo: '', resultado: 'Sin consultas', fecha: '' }];
      consultas.forEach(q => {
        const f = wf.addRow([reg.num, ref, q.fuente, q.tipo, q.resultado, q.fecha ? U.fechaLegible(q.fecha) : '',
          c ? c.fuente : '', '', '', p ? (p.nivel || 'edición') : 'sin portada']);
        f.eachCell({ includeEmpty: true }, cell => { cell.alignment = { vertical: 'top', wrapText: true }; cell.border = bordeFino; });
        enlace(f.getCell(8), c ? c.urlFuente : '');
        enlace(f.getCell(9), p ? p.url : '');
      });
    });

    // --- Hoja 3: Revisión ---
    const wr = wb.addWorksheet('Revisión');
    wr.columns = [
      { header: 'N.º registro', width: 10 }, { header: 'Estado', width: 22 }, { header: 'Motivo', width: 44 },
      { header: 'Solicitado: ISBN', width: 16 }, { header: 'Solicitado: Título', width: 32 }, { header: 'Solicitado: Autor', width: 22 },
      { header: 'Solicitado: Editorial', width: 20 }, { header: 'Solicitado: Año', width: 10 },
      { header: 'Mejor candidato: Título', width: 32 }, { header: 'Mejor candidato: Editorial', width: 22 },
      { header: 'Mejor candidato: Año', width: 10 }, { header: 'Mejor candidato: ISBN-13', width: 16 },
      { header: 'Fuente', width: 14 }, { header: 'Confianza', width: 10 }, { header: 'Candidatos', width: 10 },
      { header: 'Observaciones', width: 60 }, { header: 'Acción sugerida', width: 40 }
    ];
    estiloEncabezado(wr);
    wr.getColumn(4).numFmt = '@'; wr.getColumn(12).numFmt = '@';
    const ACCION = {
      [E.PROBABLE]: 'Confirmar edición con el ejemplar físico (ISBN, editorial, año)',
      [E.DIFERENTE]: 'Verificar si el ejemplar es otra edición; buscar por ISBN del ejemplar',
      [E.REVISION]: 'Elegir manualmente entre las ediciones plausibles',
      [E.NO_ENCONTRADO]: 'Revisar la captura o consultar un catálogo institucional'
    };
    registros.filter(r => !r.validadoManual && ACCION[r.estado]).forEach(reg => {
      const c = R.seleccionado(reg), e = reg.entrada;
      const f = wr.addRow([reg.num, reg.estado, reg.motivo || '', U.limpio(e.isbn), U.limpio(e.titulo), U.limpio(e.autor),
        U.limpio(e.editorial), U.limpio(e.anio), c ? c.obra.titulo : '', c ? c.edicion.editorial : '', c ? c.edicion.anio : '',
        c ? c.edicion.isbn13 : '', c ? c.fuente : '', c ? c.ev.score / 100 : '', (reg.candidatos || []).length,
        R.observaciones(reg).join(' | '), ACCION[reg.estado]]);
      f.eachCell({ includeEmpty: true }, cell => { cell.alignment = { vertical: 'top', wrapText: true }; cell.border = bordeFino; });
      f.getCell(14).numFmt = '0%';
      f.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ESTADO[reg.estado] || 'FFFFFFFF' } };
      f.getCell(2).font = { bold: true };
    });

    alAvanzar('Generando archivo…');
    const buf = await wb.xlsx.writeBuffer();
    const fecha = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    U.descargar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `buscador_bibliografico_${fecha}.xlsx`);
    return { total: registros.length, imagenes: conImagen.length - fallidas, fallidas };
  }

  return { leerArchivo, mapearEncabezados, registroDesdeCeldas, descargarPlantilla, exportar, parsearCSV };
})();
