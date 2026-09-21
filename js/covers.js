/* =====================================================================
   js/covers.js — Verificación y obtención de portadas
   ===================================================================== */
BB.Covers = (() => {
  const cache = new Map(); // url → Promise<{ok, w, h, motivo}>

  function verificar(url) {
    if (!url) return Promise.resolve({ ok: false, motivo: 'Sin URL de portada' });
    if (cache.has(url)) return cache.get(url);
    const cfg = BB.CONFIG.portadas;
    const p = new Promise(resolver => {
      const img = new Image();
      let terminado = false;
      const fin = r => { if (!terminado) { terminado = true; clearTimeout(t); resolver(r); } };
      const t = setTimeout(() => fin({ ok: false, motivo: 'La imagen no respondió a tiempo' }), cfg.timeoutMs);
      img.onload = () => {
        const ok = img.naturalWidth >= cfg.ladoMinimo && img.naturalHeight >= cfg.ladoMinimo;
        fin({ ok, w: img.naturalWidth, h: img.naturalHeight, motivo: ok ? '' : 'La fuente devolvió una imagen vacía (marcador sin portada)' });
      };
      img.onerror = () => fin({ ok: false, motivo: 'Imagen inaccesible o inexistente' });
      img.referrerPolicy = 'no-referrer';
      img.src = url;
    });
    cache.set(url, p);
    return p;
  }

  /** Verifica la portada de un candidato y actualiza su estado. Devuelve la URL utilizable o ''. */
  async function obtenerPortada(cand) {
    const ed = cand.edicion;
    if (!ed.portadaUrl) { ed.portadaEstado = 'sin portada'; return ''; }
    if (ed.portadaEstado === 'verificada') return ed.portadaUrl;
    const r = await verificar(ed.portadaUrl);
    ed.portadaEstado = r.ok ? 'verificada' : 'inaccesible';
    ed.portadaMotivo = r.motivo || '';
    return r.ok ? ed.portadaUrl : '';
  }

  /** URL de tamaño grande para la vista ampliada (sin inventar imágenes). */
  function urlGrande(url) {
    if (!url) return '';
    if (url.includes('covers.openlibrary.org')) return url.replace(/-M\.jpg/, '-L.jpg');
    if (url.includes('books.google')) return url.replace(/zoom=\d/, 'zoom=0');
    return url;
  }

  /**
   * Descarga una portada como JPEG base64 para incrustarla en XLSX.
   * Requiere que el servidor de imágenes permita CORS; si no, devuelve null.
   */
  async function aBase64(url, altoMax = 240) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), BB.CONFIG.portadas.timeoutMs);
      const r = await fetch(url, { mode: 'cors', signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) return null;
      const blob = await r.blob();
      if (!blob.type.startsWith('image/')) return null;
      const bmp = await createImageBitmap(blob);
      const escala = Math.min(1, altoMax / bmp.height);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bmp.width * escala));
      c.height = Math.max(1, Math.round(bmp.height * escala));
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      return { base64: c.toDataURL('image/jpeg', 0.85), w: c.width, h: c.height };
    } catch (_) {
      return null;
    }
  }

  return { verificar, obtenerPortada, urlGrande, aBase64 };
})();
