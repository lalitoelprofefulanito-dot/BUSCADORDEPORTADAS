/* =====================================================================
   js/sources/googlebooks.js — Adaptador Google Books (API v1 pública)
   La clave es opcional y la aporta el usuario; nunca se guarda en código.
   ===================================================================== */
(() => {
  const BASE = 'https://www.googleapis.com/books/v1/volumes';
  const cfg = () => BB.CONFIG.fuentes.googleBooks;

  function url(q, max) {
    let u = `${BASE}?q=${q}&maxResults=${max}&printType=books`;
    if (cfg().apiKey) u += `&key=${encodeURIComponent(cfg().apiKey)}`;
    return u;
  }

  function mapear(item) {
    const v = item.volumeInfo || {};
    const ids = v.industryIdentifiers || [];
    const i10 = ids.filter(x => x.type === 'ISBN_10').map(x => x.identifier);
    const i13 = ids.filter(x => x.type === 'ISBN_13').map(x => x.identifier);
    let img = (v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail)) || '';
    img = img.replace(/^http:/, 'https:').replace(/&edge=curl/g, '');
    return BB.Fuentes.crearCandidato({
      fuente: 'Google Books',
      titulo: v.title, subtitulo: v.subtitle, autores: v.authors,
      editorial: v.publisher, anio: v.publishedDate, isbn10: i10, isbn13: i13,
      portadaUrl: img, portadaNivel: (i10.length || i13.length) ? 'edición' : 'volumen',
      urlFuente: v.infoLink || v.canonicalVolumeLink || `https://books.google.com/books?id=${item.id}`,
      idEdicion: item.id
    });
  }

  async function buscarPorISBN(info) {
    let d = await BB.Utils.fetchJSON(url(`isbn:${info.isbn13 || info.isbn10}`, 10));
    let items = (d && d.items) || [];
    if (!items.length && info.isbn10 && info.isbn13) {
      d = await BB.Utils.fetchJSON(url(`isbn:${info.isbn10}`, 10));
      items = (d && d.items) || [];
    }
    return items.map(mapear);
  }

  async function buscarPorTitulo({ titulo, autor }) {
    if (!titulo) return [];
    const parte = (pref, s) => `${pref}:${encodeURIComponent(s)}`;
    let q = parte('intitle', titulo);
    if (autor) q += '+' + parte('inauthor', autor);
    let d = await BB.Utils.fetchJSON(url(q, cfg().maxResultados));
    let items = (d && d.items) || [];
    if (!items.length && autor) {
      d = await BB.Utils.fetchJSON(url(parte('intitle', titulo), cfg().maxResultados));
      items = (d && d.items) || [];
    }
    return items.map(mapear);
  }

  BB.Fuentes.registrar({
    id: 'googlebooks', nombre: 'Google Books',
    activa: () => cfg().activa,
    buscarPorISBN, buscarPorTitulo
  });
})();
