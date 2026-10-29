/* POST /api/chat — recibe la charla del widget, le pregunta a OpenRouter y devuelve la respuesta en vivo (texto plano por partes).
 * La clave de OpenRouter vive en la variable de entorno OPENROUTER_API_KEY: nunca llega al navegador.
 *
 * Variables de entorno (Vercel → Settings → Environment Variables):
 *   OPENROUTER_API_KEY   (obligatoria) tu clave de https://openrouter.ai/keys
 *   ASISTENTE_MODELOS    (opcional) modelos separados por coma; el primero que responda gana. Por defecto, modelos gratis.
 *   ASISTENTE_ORIGENES   (opcional) dominios que pueden usar el asistente, separados por coma (ej: https://offlinevideoplayer.vercel.app). Vacío = cualquiera.
 *   ASISTENTE_LIMITE     (opcional) mensajes por visitante cada 10 minutos (por defecto 20).
 */
import { SITIOS, sistema } from '../lib/conocimiento.js';

const MODELOS = (process.env.ASISTENTE_MODELOS || 'google/gemma-4-31b-it:free,google/gemma-4-26b-a4b-it:free,nvidia/nemotron-3.5-super-vl:free,thinkingmachines/inkling-small:free')
  .split(',').map(s => s.trim()).filter(Boolean).slice(0, 4);
const ORIGENES = (process.env.ASISTENTE_ORIGENES || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
const LIMITE = Math.max(1, +process.env.ASISTENTE_LIMITE || 20), VENTANA = 10 * 60 * 1000;
const golpes = new Map(); // ip → marcas de tiempo (por instancia; frena el abuso básico)

function origenOk(origin) {
  if (!ORIGENES.length || !origin) return true;
  const o = origin.replace(/\/+$/, '');
  return ORIGENES.some(p => p === o || (p.startsWith('*.') && o.endsWith(p.slice(1))) || /^https?:\/\/localhost(:\d+)?$/.test(o));
}
function cors(origin) {
  return { 'Access-Control-Allow-Origin': origin && origenOk(origin) ? origin : (ORIGENES.length ? ORIGENES[0] : '*'), 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
}
const json = (status, obj, origin) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(origin) } });

export function OPTIONS(req) { return new Response(null, { status: 204, headers: cors(req.headers.get('origin')) }); }

export async function POST(req) {
  const origin = req.headers.get('origin');
  if (!origenOk(origin)) return json(403, { error: 'Este sitio no tiene permiso para usar el asistente.' }, origin);
  // límite por visitante
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'anon', now = Date.now();
  const lista = (golpes.get(ip) || []).filter(t => now - t < VENTANA);
  if (lista.length >= LIMITE) return json(429, { error: 'Mandaste muchos mensajes seguidos. Esperá unos minutos y seguimos.' }, origin);
  lista.push(now); golpes.set(ip, lista); if (golpes.size > 5000) golpes.clear();

  let body; try { body = await req.json(); } catch (e) { return json(400, { error: 'Pedido inválido.' }, origin); }
  const sitio = SITIOS[body && body.sitio] ? body.sitio : 'general';
  const mensajes = (Array.isArray(body && body.mensajes) ? body.mensajes : [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-10).map(m => ({ role: m.role, content: m.content.slice(0, 1500) }));
  if (!mensajes.length || mensajes[mensajes.length - 1].role !== 'user') return json(400, { error: 'Falta tu pregunta.' }, origin);

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return json(503, { error: 'El asistente todavía no está configurado (falta la clave de OpenRouter en Vercel).' }, origin);

  let r;
  try {
    r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer': origin || 'https://github.com/GonzalitoDev', 'X-Title': 'Asistente de Gonzadev' },
      body: JSON.stringify({ models: MODELOS, model: MODELOS[0], stream: true, max_tokens: 700, temperature: .5, messages: [{ role: 'system', content: sistema(sitio, body.pagina) }, ...mensajes] }),
      signal: AbortSignal.timeout(28000),
    });
  } catch (e) { return json(502, { error: 'No pude conectarme con la IA. Probá de nuevo en un momento.' }, origin); }
  if (!r.ok || !r.body) {
    const txt = await r.text().catch(() => ''); console.error('openrouter', r.status, txt.slice(0, 300));
    const msg = r.status === 401 ? 'La clave de OpenRouter no es válida.' : r.status === 402 ? 'La cuenta de OpenRouter se quedó sin crédito.' : r.status === 429 ? 'La IA gratis está muy pedida en este momento. Probá en un minuto.' : 'La IA no respondió. Probá de nuevo en un momento.';
    return json(502, { error: msg }, origin);
  }
  // convertir el stream de OpenRouter (SSE) en texto plano por partes
  const reader = r.body.getReader(), dec = new TextDecoder(), enc = new TextEncoder();
  let buf = '', escrito = false;
  const stream = new ReadableStream({
    async pull(ctrl) {
      try {
        for (; ;) {
          const { value, done } = await reader.read();
          if (done) { if (!escrito) ctrl.enqueue(enc.encode('No recibí respuesta. Probá de nuevo.')); ctrl.close(); return; }
          buf += dec.decode(value, { stream: true });
          let i, salida = '';
          while ((i = buf.indexOf('\n')) >= 0) {
            const linea = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
            if (!linea.startsWith('data:')) continue;
            const data = linea.slice(5).trim(); if (data === '[DONE]') continue;
            try { const j = JSON.parse(data); if (j.error) salida += '\n\n(La IA tuvo un problema: probá de nuevo.)'; const t = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content; if (t) salida += t; } catch (e) { }
          }
          if (salida) { escrito = true; ctrl.enqueue(enc.encode(salida)); return; }
        }
      } catch (e) { ctrl.enqueue(enc.encode(escrito ? '' : 'Se cortó la respuesta. Probá de nuevo.')); ctrl.close(); }
    },
    cancel() { reader.cancel().catch(() => { }); },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', ...cors(origin) } });
}
