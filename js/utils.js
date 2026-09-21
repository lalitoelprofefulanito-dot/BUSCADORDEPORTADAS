/* =====================================================================
   js/utils.js — Utilidades generales: texto, red, fechas, escape HTML
   ===================================================================== */
BB.Utils = (() => {
  const VACIAS = new Set(['el','la','los','las','lo','un','una','unos','unas','de','del','y','e','o','u',
    'en','a','al','con','por','para','the','an','of','and','le','les','des','du','et','il','di']);

  /** Devuelve '' para null, undefined, NaN, "undefined", "null". Nunca muestra valores técnicos. */
  function limpio(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number' && !isFinite(v)) return '';
    const s = String(v).trim();
    return /^(undefined|null|nan)$/i.test(s) ? '' : s;
  }

  /** Normaliza para comparar: minúsculas, sin acentos, sin puntuación, espacios simples. */
  function normalizarTexto(s) {
    return limpio(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/&/g, ' y ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  }

  /** Tokens normalizados, opcionalmente sin palabras vacías. */
  function tokens(s, sinVacias = true) {
    return normalizarTexto(s).split(' ').filter(t => t && (!sinVacias || !VACIAS.has(t)));
  }

  function extraerAnio(s) {
    const m = limpio(s).match(/\b(1[4-9]\d{2}|20\d{2})\b/);
    return m ? m[1] : '';
  }

  const esperar = ms => new Promise(r => setTimeout(r, ms));

  function esc(s) {
    return limpio(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  let contador = 0;
  const uid = (p = 'id') => `${p}${Date.now().toString(36)}${(contador++).toString(36)}`;

  const fechaISO = () => new Date().toISOString();
  function fechaLegible(iso) {
    const d = iso ? new Date(iso) : new Date();
    return isNaN(d) ? '' : d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  }

  /**
   * fetch con tiempo límite, reintentos y retroceso ante 429/5xx/red.
   * Devuelve JSON, o null si HTTP 404. Lanza Error con .code en otros casos.
   */
  async function fetchJSON(url, opciones = {}) {
    const cfg = Object.assign({}, BB.CONFIG.red, opciones);
    let intento = 0;
    for (;;) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
      try {
        const r = await fetch(url, { signal: ctrl.signal });
        clearTimeout(t);
        if (r.status === 404) return null;
        if (r.status === 429 || r.status >= 500) {
          const e = new Error(r.status === 429 ? 'Límite de solicitudes alcanzado (HTTP 429)' : `La fuente respondió con error (HTTP ${r.status})`);
          e.code = r.status === 429 ? 'LIMITE' : 'HTTP'; e.reintentar = true; throw e;
        }
        if (!r.ok) { const e = new Error(`La fuente rechazó la consulta (HTTP ${r.status})`); e.code = 'HTTP'; throw e; }
        return await r.json();
      } catch (err) {
        clearTimeout(t);
        let e = err;
        if (err.name === 'AbortError') { e = new Error('La fuente no respondió a tiempo'); e.code = 'TIEMPO'; e.reintentar = true; }
        else if (!err.code) { e = new Error('Sin conexión con la fuente (red o CORS)'); e.code = 'RED'; e.reintentar = true; }
        if (e.reintentar && intento < cfg.reintentos) {
          intento++;
          await esperar(cfg.backoffMs * intento * (e.code === 'LIMITE' ? 2 : 1));
          continue;
        }
        throw e;
      }
    }
  }

  function descargar(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  return { limpio, normalizarTexto, tokens, extraerAnio, esperar, esc, uid, fechaISO, fechaLegible, fetchJSON, descargar };
})();
