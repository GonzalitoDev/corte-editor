/* Lupa · ayuda del servidor para explorar un sitio y bajar sus documentos públicos (el navegador no puede por CORS).
 * GET /api/lupa?accion=explorar&sitio=ejemplo.com  → lista de documentos enlazados en el sitio (mismo dominio)
 * GET /api/lupa?accion=bajar&url=https://…/archivo.pdf → el archivo (hasta 4 MB), para analizarlo en el navegador
 * Protecciones: solo http/https a puertos 80/443, nunca a direcciones privadas o locales (se revisa en cada redirección),
 * solo tipos de documento, tamaño y tiempo limitados, y un límite de pedidos por visitante.
 */
import dns from 'node:dns/promises';
import net from 'node:net';

const DOC = /\.(pdf|docx?|docm|dotx?|xlsx?|xlsm|pptx?|ppsx?|odt|ods|odp|odg|rtf|jpe?g|tiff?|png|heic|webp|svg)$/i;
const MAX_BYTES = 4.2 * 1024 * 1024, MAX_PAGINAS = 35, MAX_DOCS = 200, PRESUPUESTO_MS = 22000;
const UA = 'Mozilla/5.0 (compatible; LupaTaller/1.0; +https://corte-editor-nine.vercel.app/lupa/)';
const golpes = new Map();

function privada(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224 || (a === 198 && (b === 18 || b === 19));
  }
  const x = ip.toLowerCase();
  if (x.startsWith('::ffff:')) return privada(x.slice(7));
  return x === '::' || x === '::1' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb');
}
const PRUEBA = process.env.LUPA_PRUEBA === '1'; // solo para probar en una PC local
async function urlSegura(u) {
  if (PRUEBA && ['127.0.0.1', 'localhost'].includes(u.hostname)) return true;
  if (!/^https?:$/.test(u.protocol)) return false;
  if (u.port && !['80', '443'].includes(u.port)) return false;
  if (u.username || u.password) return false;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal|.*\.lan)$/i.test(host)) return false;
  if (net.isIP(host)) return !privada(host);
  try { const a = await dns.lookup(host, { all: true, verbatim: true }); return a.length > 0 && a.every(x => !privada(x.address)); } catch (e) { return false; }
}
// fetch que sigue redirecciones a mano, revisando cada salto
async function traer(url, { max = MAX_BYTES, timeout = 9000 } = {}) {
  let u = new URL(url);
  for (let salto = 0; salto < 5; salto++) {
    if (!(await urlSegura(u))) throw Object.assign(new Error('Dirección no permitida'), { codigo: 403 });
    const r = await fetch(u, { redirect: 'manual', headers: { 'User-Agent': UA, Accept: '*/*' }, signal: AbortSignal.timeout(timeout) });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { u = new URL(r.headers.get('location'), u); continue; }
    if (!r.ok) throw Object.assign(new Error('El sitio respondió ' + r.status), { codigo: 502 });
    const largo = +r.headers.get('content-length') || 0;
    if (largo > max) throw Object.assign(new Error('Archivo demasiado grande'), { codigo: 413 });
    const reader = r.body.getReader(); const partes = []; let total = 0;
    for (; ;) { const { value, done } = await reader.read(); if (done) break; total += value.length; if (total > max) { try { reader.cancel(); } catch (e) { } throw Object.assign(new Error('Archivo demasiado grande'), { codigo: 413 }); } partes.push(value); }
    const out = new Uint8Array(total); let k = 0; for (const p of partes) { out.set(p, k); k += p.length; }
    return { bytes: out, tipo: r.headers.get('content-type') || '', url: u.toString() };
  }
  throw Object.assign(new Error('Demasiadas redirecciones'), { codigo: 508 });
}
const json = (st, o) => new Response(JSON.stringify(o), { status: st, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

function limite(req, cupo) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'anon', t = Date.now();
  const l = (golpes.get(ip) || []).filter(x => t - x < 60000); if (l.length >= cupo) return false;
  l.push(t); golpes.set(ip, l); if (golpes.size > 5000) golpes.clear(); return true;
}

async function explorar(sitio) {
  let base = String(sitio || '').trim(); if (!base) throw Object.assign(new Error('Falta el sitio'), { codigo: 400 });
  if (!/^https?:\/\//i.test(base)) base = 'https://' + base;
  let inicio; try { inicio = new URL(base); } catch (e) { throw Object.assign(new Error('Dirección inválida'), { codigo: 400 }); }
  const raiz = inicio.hostname.replace(/^www\./, '');
  const mismoSitio = h => h === raiz || h.endsWith('.' + raiz);
  const t0 = Date.now(), cola = [inicio.toString()], vistas = new Set(), docs = new Map();
  let paginas = 0;
  const agregar = (href, desde) => {
    let u; try { u = new URL(href, desde); } catch (e) { return; }
    if (!/^https?:$/.test(u.protocol) || !mismoSitio(u.hostname)) return;
    u.hash = '';
    const ruta = decodeURIComponent(u.pathname);
    if (DOC.test(ruta)) { if (docs.size < MAX_DOCS && !docs.has(u.toString())) docs.set(u.toString(), { url: u.toString(), ext: ruta.split('.').pop().toLowerCase(), desde }); return; }
    if (/\.(css|js|mjs|json|ico|gif|mp4|mp3|zip|rar|woff2?|ttf|xml|txt)$/i.test(ruta)) return;
    const k = u.origin + u.pathname + u.search; if (!vistas.has(k) && cola.length < 400) cola.push(k);
  };
  // sitemap: muchas veces lista documentos que no están enlazados
  try { const sm = await traer(new URL('/sitemap.xml', inicio).toString(), { max: 2e6, timeout: 6000 }); const x = new TextDecoder().decode(sm.bytes); for (const m of x.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) agregar(m[1], sm.url); } catch (e) { }
  while (cola.length && paginas < MAX_PAGINAS && Date.now() - t0 < PRESUPUESTO_MS) {
    const url = cola.shift(); if (vistas.has(url)) continue; vistas.add(url);
    try {
      const r = await traer(url, { max: 2.5e6, timeout: 7000 });
      if (!/html|xml/i.test(r.tipo)) continue;
      paginas++;
      const html = new TextDecoder().decode(r.bytes);
      for (const m of html.matchAll(/(?:href|src|data-src)\s*=\s*["']([^"'#]+)["']/gi)) agregar(m[1].replace(/&amp;/g, '&'), r.url);
    } catch (e) { if (!paginas && cola.length === 0) throw e; }
  }
  return { sitio: inicio.hostname, paginas, documentos: [...docs.values()], incompleto: cola.length > 0 && (paginas >= MAX_PAGINAS || Date.now() - t0 >= PRESUPUESTO_MS) };
}

export async function GET(req) {
  const u = new URL(req.url), accion = u.searchParams.get('accion');
  try {
    if (accion === 'explorar') {
      if (!limite(req, 6)) return json(429, { error: 'Muchas exploraciones seguidas. Esperá un minuto.' });
      return json(200, await explorar(u.searchParams.get('sitio')));
    }
    if (accion === 'bajar') {
      if (!limite(req, 120)) return json(429, { error: 'Demasiadas descargas seguidas. Esperá un minuto.' });
      const url = u.searchParams.get('url') || ''; let p; try { p = new URL(url); } catch (e) { return json(400, { error: 'Dirección inválida' }); }
      if (!DOC.test(decodeURIComponent(p.pathname))) return json(400, { error: 'Solo se pueden bajar documentos e imágenes.' });
      const r = await traer(url);
      return new Response(r.bytes, { status: 200, headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'attachment' } });
    }
    return json(400, { error: 'Acción desconocida' });
  } catch (e) {
    return json(e.codigo || 502, { error: e.name === 'TimeoutError' ? 'El sitio tardó demasiado en responder.' : e.message || 'No se pudo' });
  }
}
