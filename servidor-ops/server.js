#!/usr/bin/env node
/* Servidor de GonzaOps: partidas online 5 contra 5 (shooter táctico).
 * - Salas con código de 5 letras; en la sala cada uno elige escuadra; los lugares vacíos los ocupan bots.
 * - Corre la misma simulación que el juego (../gonzaops/jugar/js/sim-*.js) 30 veces por segundo y le manda
 *   a cada jugador el estado de la partida unas 20 veces por segundo. El daño se calcula acá (con rebobinado).
 * - Si alguien se desconecta, un bot juega por él; si vuelve a entrar con el mismo nombre, recupera su lugar.
 * - Sirve el juego web: con abrir la dirección en el navegador ya se puede jugar.
 * Uso: node server.js [--config config.json]
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const GAME_DIR = path.resolve(__dirname, '..', 'gonzaops', 'jugar');
const ICON = path.resolve(__dirname, '..', 'gonzaops', 'icon.svg');
for (const f of ['sim-mapa', 'sim-juego', 'sim-bots']) require(path.join(GAME_DIR, 'js', f + '.js'));
const Ops = globalThis.Ops;

const VERSION = 1;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CONFIG_FILE = arg('--config', path.join(__dirname, 'config.json'));
const CFG = { name: 'Servidor de GonzaOps', host: '0.0.0.0', port: 7781, password: '', maxRooms: 4, snapshotHz: 20 };
try { Object.assign(CFG, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))); } catch (e) { if (fs.existsSync(CONFIG_FILE)) { console.error('config inválida:', e.message); process.exit(1); } }
CFG.port = +process.env.PORT || CFG.port;
const log = (...a) => console.log(new Date().toISOString().slice(0, 19).replace('T', ' '), ...a);

const clients = new Map(), rooms = new Map();
const status = () => ({ name: CFG.name, version: VERSION, game: 'gonzaops', players: [...clients.values()].filter(c => c.ok).map(c => c.name), rooms: [...rooms.values()].map(r => ({ code: r.code, state: r.state, humans: r.members.size, host: (clients.get(r.host) || {}).name || '' })), password: !!CFG.password });

/* ───── archivos del juego web ───── */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (code, type, body, extra = {}) => { res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff', ...extra }); res.end(body); };
  if (u.pathname === '/estado') return send(200, MIME['.json'], JSON.stringify(status()), { 'Cache-Control': 'no-store' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'text/plain', 'No permitido');
  let file = u.pathname === '/icon.svg' ? ICON : path.join(GAME_DIR, decodeURIComponent(u.pathname));
  if (!file.startsWith(GAME_DIR) && file !== ICON) return send(403, 'text/plain', 'No permitido');
  try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch (e) { return send(404, 'text/plain', 'No encontrado'); }
  fs.readFile(file, (err, data) => err ? send(404, 'text/plain', 'No encontrado') : send(200, MIME[path.extname(file)] || 'application/octet-stream', data, { 'Cache-Control': 'no-cache' }));
});

/* ───── utilidades ───── */
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024, perMessageDeflate: { zlibDeflateOptions: { level: 1 }, threshold: 512 } });
const nameOk = n => String(n || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 16);
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const sendTo = (c, m) => { if (c && c.ws.readyState === 1) c.ws.send(typeof m === 'string' ? m : JSON.stringify(m)); };
const newCode = () => { const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let c; do { c = Array.from({ length: 5 }, () => L[crypto.randomInt(L.length)]).join(''); } while (rooms.has(c)); return c; };
const roomList = () => [...rooms.values()].map(r => ({ code: r.code, host: (clients.get(r.host) || {}).name || '¿?', humans: r.members.size, state: r.state }));
const broadcastRooms = () => { const m = JSON.stringify({ t: 'rooms', list: roomList() }); for (const c of clients.values()) if (c.ok && !c.room) sendTo(c, m); };
const BOTS = ['Toro', 'Pampa', 'Gaucho', 'Yaguar', 'Halcón', 'Puma', 'Zorro', 'Cóndor', 'Lobo', 'Ñandú'];

/* ───── salas ───── */
function lobbyMsg(r) { return { t: 'lobby', code: r.code, host: r.host, dif: r.dif, largo: r.largo, state: r.state, slots: r.slots.map(s => ({ sq: s.sq, idx: s.idx, pid: s.pid, name: s.name })) }; }
function sendLobby(r) { const m = JSON.stringify(lobbyMsg(r)); for (const id of r.members) sendTo(clients.get(id), m); }
function freeSlot(r, pref) { for (const sq of [pref, 1 - pref]) for (let idx = 0; idx < 5; idx++) if (!r.slots.some(s => s.sq === sq && s.idx === idx)) return { sq, idx }; return null; }
function joinRoom(c, r) {
  if (c.room) leaveRoom(c);
  if (r.state === 'game') {
    const p = r.game.jug.find(x => x.dueño === c.name.toLowerCase());
    if (!p) return sendTo(c, { t: 'err', msg: 'Esa sala ya está jugando una partida.' });
    p.bot = false; p.pid = c.id; p.bot_ = {}; r.members.add(c.id); c.room = r.code; c.pj = p.id;
    sendTo(c, lobbyMsg(r)); sendTo(c, { t: 'inicio', yo: p.id, info: r.game.info(), para: r.game.paraGanar }); broadcastInfo(r);
    log(`${c.name} volvió a la partida ${r.code}`); return;
  }
  if (r.slots.length >= 10) return sendTo(c, { t: 'err', msg: 'La sala está llena.' });
  const pref = r.slots.filter(s => s.sq === 0).length <= r.slots.filter(s => s.sq === 1).length ? 0 : 1, fs2 = freeSlot(r, pref);
  r.slots.push({ sq: fs2.sq, idx: fs2.idx, pid: c.id, name: c.name });
  r.members.add(c.id); c.room = r.code;
  sendLobby(r); broadcastRooms(); lobbyChat(r, null, `${c.name} entró a la sala`);
}
function leaveRoom(c) {
  const r = rooms.get(c.room); c.room = null; c.pj = null; if (!r) return;
  r.members.delete(c.id);
  if (r.state === 'lobby') r.slots = r.slots.filter(s => s.pid !== c.id);
  else if (r.game) { const p = r.game.jug.find(x => x.pid === c.id); if (p) { p.bot = true; p.pid = null; p.bot_ = {}; p.usando = false; broadcastInfo(r); } }
  if (r.host === c.id) r.host = [...r.members][0] || null;
  if (!r.members.size) closeRoom(r); else { sendLobby(r); lobbyChat(r, null, `${c.name} salió`); }
  broadcastRooms();
}
function closeRoom(r) { clearInterval(r.loop); rooms.delete(r.code); log(`sala ${r.code} cerrada`); }
function lobbyChat(r, from, m) { const msg = JSON.stringify({ t: 'lchat', n: from ? from.name : '·', m }); for (const id of r.members) sendTo(clients.get(id), msg); }
function broadcastInfo(r) { if (!r.game) return; const m = JSON.stringify({ t: 'info', info: r.game.info() }); for (const id of r.members) sendTo(clients.get(id), m); }

/* ───── partida ───── */
function startGame(r) {
  const jugadores = []; let b = 0;
  for (let sq = 0; sq < 2; sq++) for (let idx = 0; idx < 5; idx++) {
    const s = r.slots.find(x => x.sq === sq && x.idx === idx);
    if (s) jugadores.push({ nombre: s.name, squad: sq, bot: false, pid: s.pid, dueño: s.name.toLowerCase() });
    else jugadores.push({ nombre: BOTS[b++ % BOTS.length] + ' (bot)', squad: sq, bot: true });
  }
  const g = r.game = new Ops.Juego({ jugadores, dificultad: r.dif, paraGanar: r.largo === 'corto' ? 5 : 8, semilla: crypto.randomInt(1e9) });
  r.state = 'game'; r.evBuf = []; r.tick = 0; r.endAt = 0; r.acc = 0;
  for (const id of r.members) { const c = clients.get(id), p = g.jug.find(x => x.pid === id); if (c && p) { c.pj = p.id; sendTo(c, { t: 'inicio', yo: p.id, info: g.info(), para: g.paraGanar }); } }
  const paso = 1 / 30, cada = 1 / Math.max(5, Math.min(30, CFG.snapshotHz));
  r.loop = setInterval(() => {
    try {
      g.step(paso); r.evBuf.push(...g.vaciarEventos()); r.tick++; r.acc += paso;
      if (r.acc >= cada - 1e-6) {
        r.acc -= cada; const ev = r.evBuf; r.evBuf = [];
        for (const id of r.members) { const c = clients.get(id); if (!c || !c.pj) continue; sendTo(c, { t: 'foto', s: g.foto(c.pj), ev }); }
      }
      if (r.tick % 15 === 0) { const m = JSON.stringify({ t: 'tabla', d: g.tabla() }); for (const id of r.members) sendTo(clients.get(id), m); }
      if (g.fase === 'fin' && !r.endAt) { r.endAt = Date.now(); log(`sala ${r.code}: terminó ${g.marc.join(' a ')}`); }
      if (r.endAt && Date.now() - r.endAt > 12000) {
        clearInterval(r.loop); r.loop = null; r.game = null; r.state = 'lobby'; for (const id of r.members) { const c = clients.get(id); if (c) c.pj = null; }
        r.slots = r.slots.filter(s => r.members.has(s.pid)); sendLobby(r); broadcastRooms();
      }
    } catch (e) { log('error en la sala', r.code, e.stack); }
  }, 1000 / 30);
  log(`sala ${r.code}: empezó la partida (${r.members.size} jugadores, bots ${r.dif}, ${r.largo})`); broadcastRooms();
}

/* ───── mensajes ───── */
const ENTRADAS = new Set(['st', 'f', 'r', 'g', 'u', 'c', 'x']);
wss.on('connection', (ws, req) => {
  const c = { ws, id: crypto.randomBytes(5).toString('hex'), name: '', ok: false, room: null, pj: null, tokens: 200, ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress };
  clients.set(c.id, c);
  const timer = setTimeout(() => { if (!c.ok) ws.close(4000, 'tiempo'); }, 10000);
  ws.on('message', raw => {
    if (--c.tokens < 0) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (!c.ok) {
      if (m.t !== 'hello') return;
      if (CFG.password && !safeEq(m.pass || '', CFG.password)) { sendTo(c, { t: 'err', msg: 'Contraseña incorrecta' }); return ws.close(4001, 'contraseña'); }
      let n = nameOk(m.name) || 'Operador'; const base = n; let i = 2;
      while ([...clients.values()].some(o => o.ok && o !== c && o.name.toLowerCase() === n.toLowerCase())) n = base.slice(0, 13) + i++;
      c.name = n; c.ok = true; clearTimeout(timer);
      sendTo(c, { t: 'welcome', v: VERSION, id: c.id, nick: n, name: CFG.name });
      log(`entró ${n} (${c.ip})`); return;
    }
    const r = c.room ? rooms.get(c.room) : null;
    switch (m.t) {
      case 'rooms': sendTo(c, { t: 'rooms', list: roomList() }); break;
      case 'create': {
        if (rooms.size >= CFG.maxRooms) return sendTo(c, { t: 'err', msg: 'El servidor ya tiene muchas salas abiertas. Probá más tarde.' });
        const nr = { code: newCode(), host: c.id, slots: [], members: new Set(), dif: 'normal', largo: 'largo', state: 'lobby', game: null, loop: null };
        rooms.set(nr.code, nr); log(`${c.name} creó la sala ${nr.code}`); joinRoom(c, nr); break;
      }
      case 'join': { const target = rooms.get(String(m.code || '').toUpperCase().trim()); if (!target) return sendTo(c, { t: 'err', msg: 'No existe una sala con ese código.' }); joinRoom(c, target); break; }
      case 'leave': leaveRoom(c); sendTo(c, { t: 'rooms', list: roomList() }); break;
      case 'slot': { if (!r || r.state !== 'lobby') break; const sq = m.sq === 1 ? 1 : 0, idx = Math.max(0, Math.min(4, m.idx | 0)); if (r.slots.some(s => s.sq === sq && s.idx === idx)) break; const s = r.slots.find(s => s.pid === c.id); if (s) { s.sq = sq; s.idx = idx; sendLobby(r); } break; }
      case 'diff': if (r && r.host === c.id && r.state === 'lobby' && ['facil', 'normal', 'dificil'].includes(m.d)) { r.dif = m.d; sendLobby(r); } break;
      case 'largo': if (r && r.host === c.id && r.state === 'lobby' && ['corto', 'largo'].includes(m.v)) { r.largo = m.v; sendLobby(r); } break;
      case 'start': if (r && r.host === c.id && r.state === 'lobby') startGame(r); break;
      case 'chat': {
        if (!r) break; const txt = String(m.m || '').slice(0, 120).trim(); if (!txt) break;
        if (r.state === 'game' && r.game && c.pj) { const p = r.game.porId.get(c.pj); const msg = JSON.stringify({ t: 'chat', n: c.name, m: txt, lado: p ? p.team : 0 }); for (const id of r.members) sendTo(clients.get(id), msg); }
        else lobbyChat(r, c, txt);
        break;
      }
      case 'in': {
        if (!r || !r.game || !c.pj) break; const p = r.game.porId.get(c.pj); if (!p || p.pid !== c.id) break;
        const o = m.m; if (!o || typeof o !== 'object' || !ENTRADAS.has(o.t)) break;
        r.game.entrada(p, o);
        break;
      }
    }
  });
  ws.on('close', () => { clearTimeout(timer); if (c.room) leaveRoom(c); clients.delete(c.id); if (c.ok) log(`salió ${c.name}`); });
  ws.on('error', () => { });
});
setInterval(() => { for (const c of clients.values()) c.tokens = 200; }, 1000);
const bye = () => { log('cerrando…'); process.exit(0); };
process.on('SIGINT', bye); process.on('SIGTERM', bye);
server.listen(CFG.port, CFG.host, () => log(`GonzaOps · "${CFG.name}" escuchando en ${CFG.host}:${CFG.port}`));
