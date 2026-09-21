/* =====================================================================
   js/sources/_plantilla-fuente.js — PLANTILLA para una fuente nueva
   (no se carga por defecto). Copie, renombre y agregue su <script>.
   Si la fuente no permite CORS o requiere credenciales, consulte a través
   de un proxy propio (backend) y NUNCA ponga claves secretas aquí.
   ===================================================================== */
(() => {
  const PROXY = 'https://su-servidor.example/api/catalogo'; // backend propio

  async function buscarPorISBN(info) {
    const d = await BB.Utils.fetchJSON(`${PROXY}?isbn=${info.isbn13 || info.isbn10}`);
    return (d && d.registros || []).map(mapear);
  }

  async function buscarPorTitulo({ titulo, autor }) {
    const p = new URLSearchParams({ titulo, autor: autor || '' });
    const d = await BB.Utils.fetchJSON(`${PROXY}?${p}`);
    return (d && d.registros || []).map(mapear);
  }

  function mapear(r) {
    return BB.Fuentes.crearCandidato({
      fuente: 'Catálogo institucional',
      titulo: r.titulo, autores: r.autores, editorial: r.editorial, anio: r.anio,
      isbn10: r.isbn10, isbn13: r.isbn13,
      portadaUrl: r.portada, portadaNivel: 'edición',
      urlFuente: r.url, idEdicion: r.id
    });
  }

  BB.Fuentes.registrar({
    id: 'institucional', nombre: 'Catálogo institucional',
    activa: () => true, buscarPorISBN, buscarPorTitulo
  });
})();
