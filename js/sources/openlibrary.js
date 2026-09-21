/* =====================================================================
   js/sources/openlibrary.js — Adaptador Open Library
   ISBN:   /api/books?bibkeys=ISBN:…&jscmd=data  (registro de edición)
   Título: /search.json (obras) → /works/{id}/editions.json (ediciones)
   ===================================================================== */
(() => {
  const BASE = 'https://openlibrary.org';
  const COVERS = 'https://covers.openlibrary.org/b';
  const cfg = () => BB.CONFIG.fuentes.openLibrary;
  const crear = d => BB.Fuentes.crearCandidato(Object.assign({ fuente: 'Open Library' }, d));
  const portadaPorId = id => (id && id > 0 ? `${COVERS}/id/${id}-M.jpg` : '');
  const portadaPorISBN = isbn => (isbn ? `${COVERS}/isbn/${isbn}-M.jpg?default=false` : '');

  async function buscarPorISBN(info) {
    const claves = [info.isbn13, info.isbn10].filter(Boolean);
    if (!claves.length) return [];
    const url = `${BASE}/api/books?bibkeys=${claves.map(k => 'ISBN:' + k).join(',')}&format=json&jscmd=data`;
    const data = await BB.Utils.fetchJSON(url);
    if (!data) return [];
    const vistos = new Set(), salida = [];
    Object.entries(data).forEach(([clave, b]) => {
      if (!b || vistos.has(b.key)) return;
      vistos.add(b.key);
      const ids = b.identifiers || {};
      const consultado = clave.replace('ISBN:', '');
      const i13 = [].concat(ids.isbn_13 || []), i10 = [].concat(ids.isbn_10 || []);
      // Open Library devolvió este registro para ese ISBN: el ISBN pertenece a la edición.
      (consultado.length === 13 ? i13 : i10).push(consultado);
      const portada = b.cover ? (b.cover.medium || b.cover.large || b.cover.small) : portadaPorISBN(info.isbn13 || info.isbn10);
      salida.push(crear({
        titulo: b.title, subtitulo: b.subtitle,
        autores: (b.authors || []).map(a => a.name),
        editorial: (b.publishers || []).map(p => p.name),
        anio: b.publish_date, isbn10: i10, isbn13: i13,
        portadaUrl: portada, portadaNivel: 'edición',
        urlFuente: b.url || `${BASE}${b.key}`, idEdicion: b.key
      }));
    });
    return salida;
  }

  async function buscarObras(titulo, autor) {
    const p = new URLSearchParams({ title: titulo, limit: '8',
      fields: 'key,title,subtitle,author_name,first_publish_year,cover_i,edition_count' });
    if (autor) p.set('author', autor);
    let data = await BB.Utils.fetchJSON(`${BASE}/search.json?${p}`);
    let docs = (data && data.docs) || [];
    if (!docs.length && autor) {           // reintento sin autor por si está escrito distinto
      p.delete('author');
      data = await BB.Utils.fetchJSON(`${BASE}/search.json?${p}`);
      docs = (data && data.docs) || [];
    }
    return docs;
  }

  async function buscarPorTitulo({ titulo, autor }) {
    if (!titulo) return [];
    const obras = (await buscarObras(titulo, autor)).slice(0, cfg().maxObras);
    const salida = [];
    for (const w of obras) {
      let ediciones = [];
      try {
        const e = await BB.Utils.fetchJSON(`${BASE}${w.key}/editions.json?limit=${cfg().maxEdicionesPorObra}`);
        ediciones = (e && e.entries) || [];
      } catch (_) { /* si falla, se conserva el registro a nivel de obra */ }

      if (ediciones.length) {
        ediciones.forEach(ed => {
          const cov = (ed.covers || []).find(c => c > 0);
          const isbnPortada = (ed.isbn_13 || [])[0] || (ed.isbn_10 || [])[0];
          salida.push(crear({
            titulo: ed.title || w.title, subtitulo: ed.subtitle,
            autores: w.author_name, editorial: ed.publishers,
            anio: ed.publish_date, isbn10: ed.isbn_10, isbn13: ed.isbn_13,
            portadaUrl: cov ? portadaPorId(cov) : portadaPorISBN(isbnPortada),
            portadaNivel: 'edición',
            urlFuente: `${BASE}${ed.key}`, idObra: w.key, idEdicion: ed.key
          }));
        });
      } else {
        salida.push(crear({
          titulo: w.title, subtitulo: w.subtitle, autores: w.author_name,
          anio: w.first_publish_year, portadaUrl: portadaPorId(w.cover_i),
          portadaNivel: 'obra', urlFuente: `${BASE}${w.key}`, idObra: w.key
        }));
      }
    }
    return salida;
  }

  BB.Fuentes.registrar({
    id: 'openlibrary', nombre: 'Open Library',
    activa: () => cfg().activa,
    buscarPorISBN, buscarPorTitulo
  });
})();
