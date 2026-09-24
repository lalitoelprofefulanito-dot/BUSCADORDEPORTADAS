/* =====================================================================
   js/sources/upn.js — Adaptador Biblioteca UPN «Gregorio Torres Quintero» (Koha)
   El catálogo (sibi.upn.mx) no permite consultas directas desde el navegador (CORS),
   así que se consulta a través del proxy de proxy/upn-proxy-worker.js.
   ISBN:   opac-search.pl?idx=nb&q=…  → números de registro → ficha MARCXML
   Título: opac-search.pl?idx=ti&q=… → números de registro → ficha MARCXML
   ===================================================================== */
(() => {
  const BASE = 'https://sibi.upn.mx/cgi-bin/koha';
  const cfg = () => BB.CONFIG.fuentes.upn;
  const via = url => `${cfg().proxy.replace(/\/+$/, '')}/?u=${encodeURIComponent(url)}`;

  /** Números de registro (biblionumber) que aparecen en una página de resultados o de detalle. */
  function registros(html) {
    const vistos = [];
    (html.match(/biblionumber=(\d+)/g) || []).forEach(m => { const n = m.split('=')[1]; if (!vistos.includes(n)) vistos.push(n); });
    return vistos.slice(0, cfg().maxRegistros);
  }

  const limpiarMarc = s => BB.Utils.limpio(s).replace(/[\s/:;,.=]+$/, '').replace(/^\[|\]$/g, '').trim();

  function subcampos(doc, tag, codigos) {
    return Array.from(doc.getElementsByTagName('datafield')).filter(f => f.getAttribute('tag') === tag).map(f =>
      Array.from(f.getElementsByTagName('subfield')).filter(s => codigos.includes(s.getAttribute('code')))
        .map(s => s.textContent).join(' '));
  }

  /** Primer subcampo con ese código (algunas fichas repiten el $b del título). */
  function primero(doc, tag, codigo) {
    const f = Array.from(doc.getElementsByTagName('datafield')).find(x => x.getAttribute('tag') === tag);
    const s = f && Array.from(f.getElementsByTagName('subfield')).find(x => x.getAttribute('code') === codigo);
    return s ? s.textContent : '';
  }

  async function ficha(num) {
    const xml = await BB.Utils.fetchTexto(via(`${BASE}/opac-export.pl?op=export&bib=${num}&format=marcxml`));
    if (!xml) return null;
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const isbns = subcampos(doc, '020', ['a']).map(x => x.replace(/[^0-9Xx]/g, '')).filter(Boolean);
    const [titulo, subtitulo] = [primero(doc, '245', 'a'), primero(doc, '245', 'b')].map(limpiarMarc);
    const autores = subcampos(doc, '100', ['a']).concat(subcampos(doc, '110', ['a']), subcampos(doc, '700', ['a'])).map(limpiarMarc).filter(Boolean);
    const pub = subcampos(doc, '260', ['b']).concat(subcampos(doc, '264', ['b'])).map(limpiarMarc).filter(Boolean);
    const anio = subcampos(doc, '260', ['c']).concat(subcampos(doc, '264', ['c'])).join(' ');
    return BB.Fuentes.crearCandidato({
      fuente: 'Biblioteca UPN',
      titulo, subtitulo, autores, editorial: pub, anio,
      isbn13: isbns.filter(x => x.length === 13), isbn10: isbns.filter(x => x.length === 10),
      urlFuente: `${BASE}/opac-detail.pl?biblionumber=${num}`, idEdicion: `upn:${num}`
    });
  }

  async function consultar(indice, q) {
    const html = await BB.Utils.fetchTexto(via(`${BASE}/opac-search.pl?idx=${indice}&q=${encodeURIComponent(q)}`));
    if (!html) return [];
    const fichas = await Promise.all(registros(html).map(n => ficha(n).catch(() => null)));
    return fichas.filter(Boolean);
  }

  BB.Fuentes.registrar({
    id: 'upn', nombre: 'Biblioteca UPN',
    activa: () => cfg().activa && !!cfg().proxy,
    // El catálogo guarda sobre todo ISBN-10 (ediciones anteriores a 2007): se prueba primero ese y luego el ISBN-13.
    buscarPorISBN: async info => {
      for (const q of [info.isbn10, info.isbn13].filter(Boolean)) {
        const r = await consultar('nb', q);
        if (r.length) return r;
      }
      return [];
    },
    buscarPorTitulo: ({ titulo, autor }) => (titulo ? consultar('kw', [titulo, autor].filter(Boolean).join(' ')) : Promise.resolve([]))
  });
})();
