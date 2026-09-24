/* =====================================================================
   proxy/upn-proxy-worker.js — Proxy mínimo para consultar la Biblioteca UPN
   Se publica como Cloudflare Worker (plan gratuito). Solo reenvía consultas
   de lectura al catálogo sibi.upn.mx y añade el encabezado CORS que el
   navegador necesita. No guarda datos ni claves.
   Uso desde la aplicación:  https://SU-WORKER.workers.dev/?u=<URL de sibi.upn.mx>
   ===================================================================== */
const PERMITIDO = /^https:\/\/sibi\.upn\.mx\/cgi-bin\/koha\/opac-(search|detail|export)\.pl\?/;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const destino = new URL(request.url).searchParams.get('u') || '';
    if (request.method !== 'GET' || !PERMITIDO.test(destino)) {
      return new Response('Solo se permiten consultas de lectura al catálogo de la Biblioteca UPN.', { status: 400, headers: CORS });
    }
    const r = await fetch(destino, { headers: { 'User-Agent': 'BuscadorBibliografico/1.1 (Biblioteca Viva)' } });
    return new Response(await r.arrayBuffer(), {
      status: r.status,
      headers: Object.assign({ 'Content-Type': r.headers.get('content-type') || 'text/plain; charset=utf-8' }, CORS)
    });
  }
};
