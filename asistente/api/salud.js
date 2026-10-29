/* GET /api/salud — estado del asistente (sin datos secretos) y la presentación de cada sitio para el widget */
import { SITIOS, publico } from '../lib/conocimiento.js';

export function GET(req) {
  const url = new URL(req.url), sitio = url.searchParams.get('sitio');
  const body = {
    ok: true,
    clave: !!process.env.OPENROUTER_API_KEY,
    origenesRestringidos: !!(process.env.ASISTENTE_ORIGENES || '').trim(),
    sitios: Object.keys(SITIOS),
    ...(sitio ? { sitio: publico(SITIOS[sitio] ? sitio : 'general') } : {}),
  };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=60' } });
}
