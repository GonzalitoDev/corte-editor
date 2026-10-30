// Servidor local de Jarvis (solo 127.0.0.1): sirve la interfaz, pasa las preguntas a la IA en Vercel
// y ejecuta las acciones en la PC. Funciona con Node solo (para probar) o dentro de Electron.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Readable } = require('stream');
const { crear } = require('./acciones');

const SERVIDOR_POR_DEFECTO = 'https://corte-editor-nine.vercel.app'; // el Taller, que también sirve la IA
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.ico': 'image/x-icon' };

function iniciar({ puerto = 47800, raiz, configPath, abrirExterno, perfilNavegador, version = '1.0.0', alCambiarConfig } = {}) {
  let config = {}; try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) { }
  const guardar = () => { try { fs.mkdirSync(path.dirname(configPath), { recursive: true }); fs.writeFileSync(configPath, JSON.stringify(config, null, 2)); } catch (e) { } if (alCambiarConfig) alCambiarConfig(config); };
  const acc = crear({ abrirExterno, perfilNavegador });
  acc.cargarApps().catch(() => { });
  const clientes = new Set();
  let puertoReal = puerto;

  const propio = () => [`127.0.0.1:${puertoReal}`, `localhost:${puertoReal}`];
  const origenOk = (req) => { const o = req.headers.origin; return !o || propio().some(h => o === 'http://' + h); };
  const json = (res, st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const leer = (req) => new Promise((ok, mal) => { const b = []; let n = 0; req.on('data', c => { n += c.length; if (n > 64 * 1024) { mal(new Error('grande')); req.destroy(); } else b.push(c); }); req.on('end', () => ok(Buffer.concat(b))); req.on('error', mal); });

  const srv = http.createServer(async (req, res) => {
    // protección: solo esta PC, solo esta página (evita que otro sitio web le mande órdenes)
    if (!propio().includes(req.headers.host || '')) { res.writeHead(403); return res.end('No permitido'); }
    const u = new URL(req.url, 'http://' + req.headers.host);
    const p = u.pathname;
    try {
      if (p.startsWith('/agente/')) {
        if (!origenOk(req)) return json(res, 403, { ok: false, mensaje: 'Origen no permitido' });
        if (p === '/agente/eventos' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
          res.write('retry: 3000\n\n'); clientes.add(res);
          const ping = setInterval(() => res.write(': ping\n\n'), 25000);
          req.on('close', () => { clearInterval(ping); clientes.delete(res); });
          return;
        }
        if (req.headers['x-jarvis'] !== '1') return json(res, 403, { ok: false, mensaje: 'Falta la cabecera' });
        if (p === '/agente/estado') return json(res, 200, { jarvis: true, version, equipo: os.hostname(), servidor: config.servidor || SERVIDOR_POR_DEFECTO, apps: await acc.nombresApps() });
        if (p === '/agente/accion' && req.method === 'POST') {
          let a; try { a = JSON.parse((await leer(req)).toString('utf8')); } catch (e) { return json(res, 400, { ok: false, mensaje: 'Pedido inválido' }); }
          const r = await acc.ejecutar(a).catch(e => ({ ok: false, mensaje: 'Algo falló: ' + e.message }));
          return json(res, 200, r);
        }
        if (p === '/agente/config' && req.method === 'POST') {
          let c; try { c = JSON.parse((await leer(req)).toString('utf8')); } catch (e) { return json(res, 400, { ok: false }); }
          if (typeof c.servidor === 'string') { const s = c.servidor.trim().replace(/\/+$/, ''); if (s && !/^https?:\/\//i.test(s)) return json(res, 400, { ok: false, mensaje: 'La dirección tiene que empezar con https://' }); config.servidor = s; }
          guardar(); return json(res, 200, { ok: true });
        }
        return json(res, 404, { ok: false });
      }
      if (p === '/api/chat' || p === '/api/salud') {
        if (!origenOk(req)) return json(res, 403, { error: 'Origen no permitido' });
        const base = (config.servidor || SERVIDOR_POR_DEFECTO).replace(/\/+$/, '');
        if (!base) return json(res, 503, { error: 'Falta la dirección del servidor de IA: abrí Ajustes (el engranaje) y pegá la dirección de tu asistente en Vercel.' });
        const body = req.method === 'POST' ? await leer(req) : undefined;
        let r;
        try { r = await fetch(base + p + u.search, { method: req.method, headers: { 'Content-Type': 'application/json', 'User-Agent': 'Jarvis-Windows/' + version }, body, signal: AbortSignal.timeout(40000) }); }
        catch (e) { return json(res, 502, { error: 'No me pude conectar con el servidor de IA (' + base + '). Revisá internet y la dirección.' }); }
        res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        if (!r.body) return res.end();
        Readable.fromWeb(r.body).on('error', () => res.end()).pipe(res);
        return;
      }
      // archivos de la interfaz
      let f = decodeURIComponent(p); if (f.endsWith('/')) f += 'index.html';
      const archivo = path.normalize(path.join(raiz, f));
      if (!archivo.startsWith(path.normalize(raiz))) { res.writeHead(403); return res.end(); }
      fs.readFile(archivo, (err, data) => {
        if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('No encontrado'); }
        res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data);
      });
    } catch (e) { if (!res.headersSent) json(res, 500, { ok: false, mensaje: 'Error interno' }); else res.end(); }
  });

  const listo = new Promise((ok, mal) => {
    let intento = 0;
    const probar = () => { srv.once('error', e => { if (e.code === 'EADDRINUSE' && intento < 5) { intento++; puertoReal = puerto + intento; probar(); } else mal(e); }); srv.listen(puertoReal, '127.0.0.1', () => ok(puertoReal)); };
    probar();
  });
  const enviar = (obj) => { const d = 'data: ' + JSON.stringify(obj) + '\n\n'; clientes.forEach(c => c.write(d)); return clientes.size; };
  return { listo, enviar, clientes: () => clientes.size, config: () => config, setConfig: (c) => { Object.assign(config, c); guardar(); }, cerrar: () => srv.close(), get puerto() { return puertoReal; } };
}

module.exports = { iniciar };

// node agente.js  → prueba sin Electron
if (require.main === module) {
  const raiz = process.argv[2] || path.join(__dirname, 'app');
  const a = iniciar({ raiz, configPath: path.join(os.tmpdir(), 'jarvis-config.json'), puerto: +process.env.PUERTO || 47800 });
  a.listo.then(p => console.log('Jarvis en http://127.0.0.1:' + p + '/'));
}
