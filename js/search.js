/* =====================================================================
   js/search.js — Orquestación: búsqueda, caché de sesión, lote
   ===================================================================== */
BB.Search = (() => {
  const U = BB.Utils, E = BB.ESTADOS;
  const cache = new Map(); // clave de consulta → Promise<Candidato[]>

  /** Memoriza la PROMESA: dos registros iguales en paralelo comparten una sola solicitud. */
  function memo(clave, fn) {
    if (!cache.has(clave)) {
      const p = fn().catch(e => { cache.delete(clave); throw e; });
      cache.set(clave, p);
    }
    return cache.get(clave);
  }

  const clonar = c => Object.assign({}, c, { id: U.uid('c'), obra: Object.assign({}, c.obra), edicion: c.edicion, ev: null });
  // Nota: "edicion" se comparte a propósito para que la verificación de portada valga para todos.

  // Enfriamiento: si una fuente devuelve HTTP 429, se deja de consultar durante un tiempo.
  const enfriamiento = new Map(); // id de fuente → marca de tiempo hasta la que se omite
  const ENFRIAMIENTO_MS = 60000;

  async function consultarFuente(adaptador, tipo, params) {
    const hasta = enfriamiento.get(adaptador.id) || 0;
    if (Date.now() < hasta) {
      const e = new Error(`En pausa por límite de solicitudes; se reanuda en ${Math.ceil((hasta - Date.now()) / 1000)} s`);
      e.code = 'LIMITE'; throw e;
    }
    try { return await consultarFuenteMemo(adaptador, tipo, params); }
    catch (e) { if (e.code === 'LIMITE') enfriamiento.set(adaptador.id, Date.now() + ENFRIAMIENTO_MS); throw e; }
  }

  function consultarFuenteMemo(adaptador, tipo, params) {
    const clave = tipo === 'isbn'
      ? `${adaptador.id}|isbn|${params.isbn13 || params.isbn10}`
      : `${adaptador.id}|titulo|${U.normalizarTexto(params.titulo)}|${U.normalizarTexto(params.autor)}`;
    return memo(clave, () => (tipo === 'isbn' ? adaptador.buscarPorISBN(params) : adaptador.buscarPorTitulo(params)));
  }

  /** Consulta todas las fuentes activas; los errores de una fuente no detienen a las demás. */
  async function consultarFuentes(tipo, params) {
    const r = { candidatos: [], errores: [], consultas: [] };
    await Promise.all(BB.Fuentes.activas().map(async f => {
      const fecha = U.fechaISO();
      try {
        const lista = await consultarFuente(f, tipo, params);
        lista.forEach(c => r.candidatos.push(clonar(c)));
        r.consultas.push({ fuente: f.nombre, tipo: tipo === 'isbn' ? 'ISBN' : 'Título/autor', resultado: `${lista.length} resultado(s)`, fecha });
      } catch (e) {
        r.errores.push({ fuente: f.nombre, mensaje: e.message, code: e.code });
        r.consultas.push({ fuente: f.nombre, tipo: tipo === 'isbn' ? 'ISBN' : 'Título/autor', resultado: 'Error: ' + e.message, fecha });
      }
    }));
    return r;
  }

  // Funciones con nombre solicitadas en la especificación
  const consultarOpenLibrary = (tipo, p) => consultarFuente(BB.Fuentes.porId('openlibrary'), tipo, p);
  const consultarGoogleBooks = (tipo, p) => consultarFuente(BB.Fuentes.porId('googlebooks'), tipo, p);
  const buscarPorISBN = info => consultarFuentes('isbn', info);
  const buscarPorTitulo = titulo => consultarFuentes('titulo', { titulo });
  const buscarPorTituloAutor = (titulo, autor, editorial, anio) => consultarFuentes('titulo', { titulo, autor, editorial, anio });

  function unir(a, b) {
    return { candidatos: a.candidatos.concat(b.candidatos), errores: a.errores.concat(b.errores), consultas: a.consultas.concat(b.consultas) };
  }

  /** Convierte la entrada original en una solicitud normalizada (sin alterar la entrada). */
  function construirSolicitud(entrada) {
    const obs = [];
    let isbn = null;
    if (entrada.isbn) {
      const a = BB.ISBN.analizar(entrada.isbn);
      if (a.valido) isbn = a; else obs.push(`ISBN inválido (${a.normal || entrada.isbn}): ${a.error}`);
    }
    const anio = U.extraerAnio(entrada.anio);
    if (U.limpio(entrada.anio) && !anio) obs.push(`Año no reconocible en la entrada: «${entrada.anio}»`);
    (entrada.notas || []).forEach(n => obs.push(n));
    return {
      req: { isbn, titulo: U.limpio(entrada.titulo), autor: U.limpio(entrada.autor), editorial: U.limpio(entrada.editorial), anio },
      obs
    };
  }

  function ordenar(cands) {
    return cands.sort((a, b) =>
      b.ev.score - a.ev.score ||
      (b.edicion.portadaUrl ? 1 : 0) - (a.edicion.portadaUrl ? 1 : 0) ||
      a.fuente.localeCompare(b.fuente));
  }

  /** Re-evalúa candidatos y estado (tras cambiar pesos o selección manual). */
  function reevaluar(reg) {
    if (!reg.candidatos) return;
    reg.candidatos.forEach(c => { c.ev = BB.Matcher.evaluar(reg.req, c); });
    ordenar(reg.candidatos);
    if (!reg.seleccionManual) reg.seleccion = reg.candidatos[0] ? reg.candidatos[0].id : null;
    const forzado = reg.seleccionManual ? reg.candidatos.find(c => c.id === reg.seleccion) : null;
    const cls = BB.Matcher.clasificar(reg.req, reg.candidatos, forzado);
    reg.estadoAuto = cls.estado;
    reg.motivo = cls.motivo;
    if (reg.validadoManual) reg.estado = E.CONFIRMADO;
    else if (reg.marcadoNoEncontrado) reg.estado = E.NO_ENCONTRADO;
    else reg.estado = cls.estado;
  }

  /** Si la portada elegida falla, usa otra portada VERIFICADA de la MISMA edición (mismo ISBN-13). */
  function portadaMismaEdicion(reg) {
    reg.portadaOverride = reg.portadaManual || null;
    if (reg.portadaManual) return;
    const sel = reg.candidatos.find(c => c.id === reg.seleccion);
    if (!sel || sel.edicion.portadaEstado === 'verificada' || !sel.edicion.isbn13) return;
    const alt = reg.candidatos.find(c => c !== sel && c.edicion.portadaEstado === 'verificada' && c.edicion.isbns13.includes(sel.edicion.isbn13));
    if (alt) reg.portadaOverride = { url: alt.edicion.portadaUrl, fuente: alt.fuente, nota: `Portada de la misma edición (ISBN-13 ${sel.edicion.isbn13}) obtenida de ${alt.fuente}` };
  }

  async function verificarPortadas(reg, cuantos) {
    const lista = reg.candidatos.slice(0, cuantos);
    const sel = reg.candidatos.find(c => c.id === reg.seleccion);
    if (sel && !lista.includes(sel)) lista.push(sel);
    await Promise.all(lista.map(c => BB.Covers.obtenerPortada(c)));
    portadaMismaEdicion(reg);
  }

  /** Procesa un registro completo. Nunca lanza: los errores quedan en el registro. */
  async function procesarRegistro(reg) {
    reg.estado = E.PROCESANDO;
    const { req, obs } = construirSolicitud(reg.entrada);
    reg.req = req; reg.obsEntrada = obs; reg.reintentable = false;
    let r = { candidatos: [], errores: [], consultas: [] };
    try {
      if (req.isbn) r = unir(r, await buscarPorISBN(req.isbn));
      const hayISBNExacto = req.isbn && r.candidatos.some(c => c.edicion.isbns13.includes(req.isbn.isbn13));
      if (req.titulo && !hayISBNExacto) {
        if (req.isbn) reg.obsEntrada.push('El ISBN no dio resultado exacto; se buscó también por título');
        r = unir(r, req.autor ? await buscarPorTituloAutor(req.titulo, req.autor, req.editorial, req.anio) : await buscarPorTitulo(req.titulo));
      }
    } catch (e) {
      r.errores.push({ fuente: 'Aplicación', mensaje: e.message });
    }

    // Deduplicar resultados repetidos de la misma fuente
    const vistos = new Set();
    reg.candidatos = r.candidatos.filter(c => {
      const k = `${c.fuente}|${c.edicion.idEdicion || c.edicion.isbn13 || c.obra.titulo}`;
      if (vistos.has(k)) return false; vistos.add(k); return true;
    }).slice(0, 80);
    reg.errores = r.errores;
    reg.consultas = r.consultas;
    reg.fechaConsulta = U.fechaISO();
    reg.seleccionManual = false; reg.validadoManual = ''; reg.marcadoNoEncontrado = false; reg.portadaManual = null;

    reevaluar(reg);

    const fuentesActivas = BB.Fuentes.activas().length;
    const fuentesConError = new Set(r.errores.map(e => e.fuente)).size;
    if (!reg.candidatos.length && fuentesActivas && fuentesConError >= fuentesActivas) {
      reg.estado = E.REVISION;
      reg.motivo = 'Ninguna fuente respondió; conviene reintentar más tarde';
      reg.reintentable = true;
    } else if (fuentesConError) {
      reg.reintentable = true;
    }
    if (reg.candidatos.length) await verificarPortadas(reg, BB.CONFIG.portadas.verificarPrimeros);
    return reg;
  }

  /** Cola con concurrencia controlada, pausas, pausa/reanudar y cancelar. */
  function crearLote(registros, alAvanzar) {
    const lote = { total: registros.length, hechos: 0, pausado: false, cancelado: false, promesa: null };
    let i = 0;
    const trabajador = async () => {
      while (i < registros.length && !lote.cancelado) {
        while (lote.pausado && !lote.cancelado) await U.esperar(200);
        if (lote.cancelado) break;
        const reg = registros[i++];
        try { await procesarRegistro(reg); }
        catch (e) { reg.estado = E.REVISION; reg.motivo = 'Error inesperado: ' + e.message; reg.reintentable = true; }
        lote.hechos++;
        alAvanzar(lote, reg);
        await U.esperar(BB.CONFIG.red.pausaMs);
      }
    };
    const n = Math.max(1, Math.min(BB.CONFIG.red.concurrencia, registros.length));
    lote.promesa = Promise.all(Array.from({ length: n }, trabajador));
    return lote;
  }

  return { procesarRegistro, crearLote, reevaluar, verificarPortadas, construirSolicitud,
    buscarPorISBN, buscarPorTitulo, buscarPorTituloAutor, consultarOpenLibrary, consultarGoogleBooks,
    limpiarCache: () => { cache.clear(); enfriamiento.clear(); } };
})();
