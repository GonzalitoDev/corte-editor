#!/usr/bin/env node
/* Servidor dedicado de GonzaCraft: mantiene el mundo abierto 24/7.
 * - Guarda los bloques cambiados, la hora y lo de cada jugador (posición, vida, inventario).
 * - Reenvía posiciones, chat, bloques y criaturas entre los jugadores.
 * - Sirve el juego web, así tus amigos pueden jugar desde el navegador en la misma dirección.
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

const CFG = {
  name: 'Servidor de GonzaCraft', motd: '¡Bienvenidos!', host: '0.0.0.0', port: 7777,
  password: '', mode: 'survival', seed: null, maxPlayers: 20, cheats: true,
};
try { Object.assign(CFG, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))); } catch (e) { if (fs.existsSync(CONFIG_FILE)) { console.error('config inválida:', e.message); process.exit(1); } }
CFG.port = +process.env.PORT || CFG.port;
fs.mkdirSync(DATA, { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(0, 19).replace('T', ' '), ...a);

/* ───────── mundo guardado ───────── */
const WORLD_FILE = path.join(DATA, 'mundo.json'), PLAYERS_FILE = path.join(DATA, 'jugadores.json');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const W = readJson(WORLD_FILE, null) || { seed: CFG.seed ?? (crypto.randomInt(2 ** 31)), time: .08, created: Date.now(), edits: {} };
if (CFG.seed != null && !fs.existsSync(WORLD_FILE)) W.seed = CFG.seed >>> 0;
W.seed = W.seed >>> 0;
const edits = new Map(Object.entries(W.edits || {}).map(([k, a]) => { const m = new Map(); for (let i = 0; i < a.length; i += 2) m.set(a[i], a[i + 1]); return [k, m]; }));
const PLAYERS = readJson(PLAYERS_FILE, {});
let dirty = false, pdirty = false;

function saveAll() {
  const write = (f, obj) => { const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(obj)); fs.renameSync(tmp, f); };
  if (dirty) { const out = {}; for (const [k, m] of edits) { const a = []; for (const [i, v] of m) a.push(i, v); out[k] = a; } write(WORLD_FILE, { seed: W.seed, time: W.time, created: W.created, edits: out }); dirty = false; }
  if (pdirty) { write(PLAYERS_FILE, PLAYERS); pdirty = false; }
}
const CH = 112, NB = 40;
function setBlock(x, y, z, id) {
  if (![x, y, z, id].every(Number.isInteger) || y < 0 || y >= CH || id < 0 || id >= NB || Math.abs(x) > 3e7 || Math.abs(z) > 3e7) return false;
  const k = (x >> 4) + ',' + (z >> 4), idx = (y * 16 + (z & 15)) * 16 + (x & 15);
  let m = edits.get(k); if (!m) { m = new Map(); edits.set(k, m); }
  m.set(idx, id); dirty = true; return true;
}

/* ───────── archivos del juego web ───────── */
const GAME = path.resolve(__dirname, '..', 'gonzacraft', 'jugar');
const ICON = path.resolve(__dirname, '..', 'gonzacraft', 'icon.svg');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };
const clients = new Map();
const status = () => ({ name: CFG.name, motd: CFG.motd, version: VERSION, mode: CFG.mode, players: [...clients.values()].filter(c => c.ok).map(c => c.name), max: CFG.maxPlayers, password: !!CFG.password });

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (code, type, body, extra = {}) => { res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff', ...extra }); res.end(body); };
  if (u.pathname === '/estado') return send(200, MIME['.json'], JSON.stringify(status()), { 'Cache-Control': 'no-store' });
  if (u.pathname === '/gc-servidor.json') return send(200, MIME['.json'], JSON.stringify({ name: CFG.name, ws: '/ws' }), { 'Cache-Control': 'no-store' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'text/plain', 'No permitido');
  let file = u.pathname === '/icon.svg' ? ICON : path.join(GAME, decodeURIComponent(u.pathname));
  if (!file.startsWith(GAME) && file !== ICON) return send(403, 'text/plain', 'No permitido');
  try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch (e) { return send(404, 'text/plain', 'No encontrado'); }
  fs.readFile(file, (err, data) => err ? send(404, 'text/plain', 'No encontrado') : send(200, MIME[path.extname(file)] || 'application/octet-stream', data, { 'Cache-Control': 'no-cache' }));
});

/* ───────── jugadores ───────── */
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 512 * 1024 });
const nameOk = n => String(n || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 16);
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
let mobAuth = null;
const sendTo = (c, m) => { if (c && c.ws.readyState === 1) c.ws.send(JSON.stringify(m)); };
const others = (c, m) => { const s = JSON.stringify(m); for (const o of clients.values()) if (o !== c && o.ok && o.ws.readyState === 1) o.ws.send(s); };
const everyone = m => others(null, m);
function pickMobAuth() {
  if (mobAuth && clients.has(mobAuth.id)) return;
  mobAuth = [...clients.values()].find(c => c.ok) || null;
  if (mobAuth) sendTo(mobAuth, { t: 'auth', mob: true });
}
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);

wss.on('connection', (ws, req) => {
  const c = { ws, id: crypto.randomBytes(6).toString('hex'), name: '', ok: false, pos: [0, 80, 0], rot: [0, 0], tokens: 400, ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress };
  clients.set(c.id, c);
  const timer = setTimeout(() => { if (!c.ok) ws.close(4000, 'tiempo'); }, 10000);
  ws.on('message', raw => {
    if (--c.tokens < 0) return; // demasiados mensajes
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (!c.ok) {
      if (m.t !== 'hello') return;
      if (CFG.password && !safeEq(m.pass || '', CFG.password)) { sendTo(c, { t: 'err', msg: 'Contraseña incorrecta' }); return ws.close(4001, 'contraseña'); }
      if ([...clients.values()].filter(o => o.ok).length >= CFG.maxPlayers) { sendTo(c, { t: 'err', msg: 'El servidor está lleno' }); return ws.close(4002, 'lleno'); }
      let n = nameOk(m.name) || 'Jugador'; const base = n; let i = 2;
      while ([...clients.values()].some(o => o.ok && o.name.toLowerCase() === n.toLowerCase())) n = (base.slice(0, 13) + i++);
      c.name = n; c.key = n.toLowerCase(); c.ok = true; clearTimeout(timer);
      const me = PLAYERS[c.key];
      sendTo(c, { t: 'welcome', v: VERSION, id: c.id, name: CFG.name, motd: CFG.motd, seed: W.seed, mode: (me && me.mode) || CFG.mode, time: W.time, cheats: !!CFG.cheats, you: me || null, nick: n, keys: [...edits.keys()], players: [...clients.values()].filter(o => o.ok && o !== c).map(o => [o.id, o.name, o.pos]) });
      others(c, { t: 'pj', id: c.id, n: c.name });
      pickMobAuth(); if (mobAuth === c) sendTo(c, { t: 'auth', mob: true });
      log(`entró ${c.name} (${c.ip}) · ${status().players.length} conectados`);
      return;
    }
    switch (m.t) {
      case 'p': if (Array.isArray(m.p) && m.p.length === 3) { c.pos = m.p.map(v => num(v)); c.rot = Array.isArray(m.r) ? m.r.map(v => num(v)) : [0, 0]; others(c, { t: 'p', id: c.id, n: c.name, p: c.pos, r: c.rot }); } break;
      case 's': if (setBlock(m.x, m.y, m.z, m.b)) others(c, { t: 's', x: m.x, y: m.y, z: m.z, b: m.b }); break;
      case 'chunk': { const e = edits.get(String(m.k)); const a = []; if (e) for (const [i, v] of e) a.push(i, v); sendTo(c, { t: 'chunk', k: String(m.k), e: a }); break; }
      case 'c': { const txt = String(m.m || '').slice(0, 200); if (txt) { others(c, { t: 'c', n: c.name, m: txt }); log(`<${c.name}> ${txt}`); } break; }
      case 'time': if (CFG.cheats && typeof m.v === 'number') { W.time = ((m.v % 1) + 1) % 1; others(c, { t: 'time', v: W.time }); } break;
      case 'boom': {
        const r = Math.min(9, Math.max(1, m.r | 0)), x = m.x | 0, y = m.y | 0, z = m.z | 0; if (!CFG.cheats) break;
        for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy + dz * dz <= r * r + .5 && y + dy >= 3) setBlock(x + dx, y + dy, z + dz, 0);
        others(c, { t: 'boom', x, y, z, r }); break;
      }
      case 'mobs': if (c === mobAuth && Array.isArray(m.l)) others(c, { t: 'mobs', l: m.l.slice(0, 40) }); break;
      case 'hm': if (mobAuth && mobAuth !== c) sendTo(mobAuth, { t: 'hm', id: String(m.id), d: Math.min(60, num(m.d, 1)), dir: m.dir, by: c.id }); break;
      case 'dmg': if (c === mobAuth) sendTo(clients.get(String(m.to)), { t: 'dmg', n: Math.min(20, num(m.n, 1)), why: String(m.why || '').slice(0, 80), dir: m.dir }); break;
      case 'save': if (m.d && typeof m.d === 'object') { const d = m.d, pl = d.player || {}; PLAYERS[c.key] = { mode: d.mode === 'creative' ? 'creative' : 'survival', player: { x: num(pl.x), y: num(pl.y, 80), z: num(pl.z), yaw: num(pl.yaw), pitch: num(pl.pitch), health: Math.min(20, num(pl.health, 20)), sel: num(pl.sel) | 0, flying: !!pl.flying, inv: Array.isArray(pl.inv) ? pl.inv.slice(0, 36).map(it => it && Number.isInteger(it.id) && it.id > 0 && it.id < NB ? { id: it.id, n: Math.min(64, Math.max(1, it.n | 0)) } : null) : [] }, seen: Date.now() }; pdirty = true; } break;
    }
  });
  ws.on('close', () => {
    clearTimeout(timer); clients.delete(c.id);
    if (c.ok) { others(c, { t: 'pl', id: c.id }); log(`salió ${c.name} · ${status().players.length} conectados`); }
    if (mobAuth === c) { mobAuth = null; pickMobAuth(); }
  });
  ws.on('error', () => { });
});

/* hora del día, límites de mensajes y guardado */
setInterval(() => { W.time = (W.time + 1 / 720) % 1; for (const c of clients.values()) c.tokens = 400; }, 1000);
setInterval(() => everyone({ t: 'time', v: W.time }), 10000);
setInterval(() => { dirty = true; saveAll(); }, 30000);
const bye = () => { log('guardando y cerrando…'); everyone({ t: 'bye' }); dirty = true; saveAll(); process.exit(0); };
process.on('SIGINT', bye); process.on('SIGTERM', bye);

server.listen(CFG.port, CFG.host, () => {
  log(`GonzaCraft · "${CFG.name}" escuchando en ${CFG.host}:${CFG.port} · semilla ${W.seed} · ${edits.size} chunks modificados · datos en ${DATA}`);
  if (!fs.existsSync(GAME)) log('Aviso: no encontré el juego web en ' + GAME + '. El servidor funciona igual, pero no se puede jugar desde el navegador en esta dirección.');
});
