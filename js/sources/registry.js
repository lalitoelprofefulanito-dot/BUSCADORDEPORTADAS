/* =====================================================================
   js/sources/registry.js — Registro de adaptadores y modelo normalizado
   MODELO:  OBRA   → título + autores
            EDICIÓN → ISBN-10 + ISBN-13 + editorial + año + portada + fuente
   Contrato de un adaptador:
     { id, nombre, activa(): boolean,
       buscarPorISBN(infoISBN)            → Promise<Candidato[]>,
       buscarPorTitulo({titulo, autor, editorial, anio}) → Promise<Candidato[]> }
   ===================================================================== */
BB.Fuentes = (() => {
  const registro = [];
  const U = () => BB.Utils;

  function registrar(adaptador) {
    if (registro.some(a => a.id === adaptador.id)) return;
    registro.push(adaptador);
  }
  const activas = () => registro.filter(a => a.activa());
  const todas = () => registro.slice();
  const porId = id => registro.find(a => a.id === id);

  /** Construye el objeto bibliográfico normalizado que toda fuente debe devolver. */
  function crearCandidato(d) {
    const { limpio, extraerAnio, uid, fechaISO } = U();
    const lista10 = [], lista13 = [];
    [].concat(d.isbn13 || [], d.isbn10 || []).forEach(x => {
      const a = BB.ISBN.analizar(x);
      if (!a.valido) return;
      if (a.isbn13 && !lista13.includes(a.isbn13)) lista13.push(a.isbn13);
      if (a.isbn10 && !lista10.includes(a.isbn10)) lista10.push(a.isbn10);
    });
    const portadaUrl = limpio(d.portadaUrl);
    const editorial = Array.isArray(d.editorial) ? d.editorial.map(limpio).filter(Boolean).join(' / ') : limpio(d.editorial);
    return {
      id: uid('c'),
      fuente: d.fuente,
      obra: {
        titulo: limpio(d.titulo),
        subtitulo: limpio(d.subtitulo),
        autores: (d.autores || []).map(limpio).filter(Boolean),
        idObra: limpio(d.idObra)
      },
      edicion: {
        isbn10: lista10[0] || '',
        isbn13: lista13[0] || '',
        isbns13: lista13,              // todas las equivalencias ISBN-13 de esta edición
        editorial,
        anio: extraerAnio(d.anio),
        idEdicion: limpio(d.idEdicion),
        portadaUrl,
        portadaNivel: portadaUrl ? (d.portadaNivel || 'edición') : '',   // 'edición' | 'obra' | 'volumen'
        portadaEstado: portadaUrl ? 'sin verificar' : 'sin portada',       // 'verificada' | 'inaccesible'
        portadaMotivo: ''
      },
      urlFuente: limpio(d.urlFuente),
      fechaConsulta: fechaISO(),
      ev: null
    };
  }

  return { registrar, activas, todas, porId, crearCandidato };
})();
