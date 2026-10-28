#!/usr/bin/env node
/* Servidor de GonzaSky: dogfight online 24/7.
 * - Reenvía la posición de cada avión, los disparos, los impactos y los derribos.
 * - Lleva la tabla de derribos de la partida y la guarda (por nombre) para la próxima vez.
 * - Sirve el juego web: con abrir la dirección en el navegador ya se puede jugar.
 * Uso: node server.js [--config config.json] [--data carpeta]
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const VERSION = 1;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CONFIG_FILE = arg('--config', path.join(__dirname, 'config.json'));
const DATA = path.resolve(arg('--data', path.join(__dirname, 'datos')));
const CFG = { name: 'Dogfight de GonzaSky', motd: '¡Bienvenidos al cielo!', host: '0.0.0.0', port: 7778, password: '', maxPlayers: 16, airport: 'GZA', hour: 15, weather: 'despejado' };
try { Object.assign(CFG, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))); } catch (e) { if (fs.existsSync(CONFIG_FILE)) { console.error('config inválida:', e.message); process.exit(1); } }
CFG.port = +process.env.PORT || CFG.port;
fs.mkdirSync(DATA, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(0, 19).replace('T', ' '), ...a);

/* récords históricos por nombre */
const RANK_FILE = path.join(DATA, 'ranking.json');
const RANK = (() => { try { return JSON.parse(fs.readFileSync(RANK_FILE, 'utf8')); } catch (e) { return {}; } })();
let rdirty = false;
const saveRank = () => { if (!rdirty) return; const tmp = RANK_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(RANK)); fs.renameSync(tmp, RANK_FILE); rdirty = false; };

/* archivos del juego web */
const GAME = path.resolve(__dirname, '..', 'gonzasky', 'volar');
const ICON = path.resolve(__dirname, '..', 'gonzasky', 'icon.svg');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const clients = new Map();
const online = () => [...clients.values()].filter(c => c.ok);
const status = () => ({ name: CFG.name, motd: CFG.motd, version: VERSION, players: online().map(c => c.name), max: CFG.maxPlayers, password: !!CFG.password, game: 'gonzasky' });

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (code, type, body, extra = {}) => { res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff', ...extra }); res.end(body); };
  if (u.pathname === '/estado') return send(200, MIME['.json'], JSON.stringify(status()), { 'Cache-Control': 'no-store' });
  if (u.pathname === '/sky-servidor.json') return send(200, MIME['.json'], JSON.stringify({ name: CFG.name, ws: '/ws' }), { 'Cache-Control': 'no-store' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'text/plain', 'No permitido');
  let file = u.pathname === '/icon.svg' ? ICON : path.join(GAME, decodeURIComponent(u.pathname));
  if (!file.startsWith(GAME) && file !== ICON) return send(403, 'text/plain', 'No permitido');
  try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch (e) { return send(404, 'text/plain', 'No encontrado'); }
  fs.readFile(file, (err, data) => err ? send(404, 'text/plain', 'No encontrado') : send(200, MIME[path.extname(file)] || 'application/octet-stream', data, { 'Cache-Control': 'no-cache' }));
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
const nameOk = n => String(n || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 16);
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const PLANES = ['gaucho', 'pampa', 'condor', 'stuka'];
const planeOk = p => PLANES.includes(p) ? p : 'condor';
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
const sendTo = (c, m) => { if (c && c.ws.readyState === 1) c.ws.send(typeof m === 'string' ? m : JSON.stringify(m)); };
const others = (c, m) => { const s = JSON.stringify(m); for (const o of clients.values()) if (o !== c && o.ok) sendTo(o, s); };
const everyone = m => others(null, m);
const scores = () => online().map(c => [c.id, c.k, c.d]);
const info = c => ({ id: c.id, n: c.name, p: c.plane, k: c.k, d: c.d, a: c.alive });

wss.on('connection', (ws, req) => {
  const c = { ws, id: crypto.randomBytes(5).toString('hex'), name: '', ok: false, plane: 'condor', k: 0, d: 0, alive: false, tokens: 300, ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress };
  clients.set(c.id, c);
  const timer = setTimeout(() => { if (!c.ok) ws.close(4000, 'tiempo'); }, 10000);
  ws.on('message', raw => {
    if (--c.tokens < 0) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (!c.ok) {
      if (m.t !== 'hello') return;
      if (CFG.password && !safeEq(m.pass || '', CFG.password)) { sendTo(c, { t: 'err', msg: 'Contraseña incorrecta' }); return ws.close(4001, 'contraseña'); }
      if (online().length >= CFG.maxPlayers) { sendTo(c, { t: 'err', msg: 'El servidor está lleno' }); return ws.close(4002, 'lleno'); }
      let n = nameOk(m.name) || 'Piloto'; const base = n; let i = 2;
      while (online().some(o => o.name.toLowerCase() === n.toLowerCase())) n = base.slice(0, 13) + i++;
      Object.assign(c, { name: n, ok: true, plane: planeOk(m.plane) }); clearTimeout(timer);
      const r = RANK[n.toLowerCase()];
      sendTo(c, { t: 'welcome', v: VERSION, id: c.id, nick: n, name: CFG.name, motd: CFG.motd, arena: { ap: CFG.airport, hour: num(CFG.hour, 15), wx: CFG.weather }, players: online().filter(o => o !== c).map(info), best: r || null });
      others(c, { t: 'join', p: info(c) });
      log(`entró ${n} (${c.ip}) · ${online().length} conectados`);
      return;
    }
    switch (m.t) {
      case 's': // estado del avión, ~15 veces por segundo
        if (Array.isArray(m.d) && m.d.length <= 20) { c.alive = true; others(c, { t: 's', id: c.id, d: m.d.map(v => num(v)) }); }
        break;
      case 'plane': c.plane = planeOk(m.p); others(c, { t: 'plane', id: c.id, p: c.plane }); break;
      case 'mis': others(c, { t: 'mis', id: c.id, to: String(m.to || ''), p: (m.p || []).slice(0, 3).map(v => num(v)), v: (m.v || []).slice(0, 3).map(v => num(v)) }); break;
      case 'hit': { // el que dispara avisa a quién le pegó
        const o = clients.get(String(m.to)); if (!o || !o.ok || o === c) break;
        sendTo(o, { t: 'hit', from: c.id, dmg: Math.min(80, Math.max(0, num(m.dmg))), w: String(m.w || 'gun').slice(0, 8) }); break;
      }
      case 'die': { // me derribaron (o me estrellé)
        c.d++; c.alive = false; const k = clients.get(String(m.by)); const killer = k && k.ok && k !== c ? k : null;
        if (killer) killer.k++;
        for (const p of [c, killer]) if (p) { const key = p.name.toLowerCase(), R = RANK[key] || (RANK[key] = { k: 0, d: 0 }); if (p === c) R.d++; else R.k++; rdirty = true; }
        everyone({ t: 'kill', by: killer ? killer.id : null, victim: c.id, w: String(m.w || '').slice(0, 8), why: String(m.why || '').slice(0, 60), sc: scores() });
        log(killer ? `${killer.name} derribó a ${c.name}` : `${c.name} se estrelló`);
        break;
      }
      case 'c': { const txt = String(m.m || '').slice(0, 160).trim(); if (txt) { everyone({ t: 'c', id: c.id, n: c.name, m: txt }); log(`<${c.name}> ${txt}`); } break; }
      case 'ping': sendTo(c, { t: 'pong', at: m.at }); break;
    }
  });
  ws.on('close', () => {
    clearTimeout(timer); clients.delete(c.id);
    if (c.ok) { others(c, { t: 'leave', id: c.id }); log(`salió ${c.name} · ${online().length} conectados`); }
  });
  ws.on('error', () => { });
});

setInterval(() => { for (const c of clients.values()) c.tokens = 300; }, 1000);
setInterval(saveRank, 20000);
const bye = () => { log('cerrando…'); everyone({ t: 'bye' }); saveRank(); process.exit(0); };
process.on('SIGINT', bye); process.on('SIGTERM', bye);

server.listen(CFG.port, CFG.host, () => {
  log(`GonzaSky · "${CFG.name}" escuchando en ${CFG.host}:${CFG.port} · arena ${CFG.airport} · datos en ${DATA}`);
  if (!fs.existsSync(GAME)) log('Aviso: no encontré el juego web en ' + GAME + '. El servidor funciona igual, pero no se puede jugar desde el navegador en esta dirección.');
});
