#!/usr/bin/env node
/* Servidor de GonzaArena: partidas online 5 contra 5.
 * - Salas con código de 5 letras; en la sala cada uno elige equipo y campeón; los lugares vacíos son bots.
 * - Corre la misma simulación que el juego (../arena/jugar/js/sim-*.js) a 30 pasos por segundo
 *   y le manda a cada jugador lo que ve su equipo (con niebla de guerra) unas 10 veces por segundo.
 * - Si alguien se desconecta, un bot juega por él; si vuelve a entrar con el mismo nombre, recupera su campeón.
 * - Sirve el juego web: con abrir la dirección en el navegador ya se puede jugar.
 * Uso: node server.js [--config config.json]
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const GAME_DIR = path.resolve(__dirname, '..', 'arena', 'jugar');
const ICON = path.resolve(__dirname, '..', 'arena', 'icon.svg');
for (const f of ['sim-map', 'sim-core', 'sim-champs', 'sim-bots']) require(path.join(GAME_DIR, 'js', f + '.js'));
const Arena = globalThis.Arena;

const VERSION = 1;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CONFIG_FILE = arg('--config', path.join(__dirname, 'config.json'));
const CFG = { name: 'Arena de GonzaArena', host: '0.0.0.0', port: 7779, password: '', maxRooms: 6, snapshotHz: 10 };
try { Object.assign(CFG, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))); } catch (e) { if (fs.existsSync(CONFIG_FILE)) { console.error('config inválida:', e.message); process.exit(1); } }
CFG.port = +process.env.PORT || CFG.port;
const log = (...a) => console.log(new Date().toISOString().slice(0, 19).replace('T', ' '), ...a);

const clients = new Map(), rooms = new Map();
const status = () => ({ name: CFG.name, version: VERSION, game: 'gonzaarena', players: [...clients.values()].filter(c => c.ok).map(c => c.name), rooms: [...rooms.values()].map(r => ({ code: r.code, state: r.state, humans: r.members.size, host: (clients.get(r.host) || {}).name || '' })), password: !!CFG.password });

/* ───── archivos del juego web ───── */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (code, type, body, extra = {}) => { res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff', ...extra }); res.end(body); };
  if (u.pathname === '/estado') return send(200, MIME['.json'], JSON.stringify(status()), { 'Cache-Control': 'no-store' });
  if (u.pathname === '/arena-servidor.json') return send(200, MIME['.json'], JSON.stringify({ name: CFG.name, ws: '/ws' }), { 'Cache-Control': 'no-store' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'text/plain', 'No permitido');
  let file = u.pathname === '/icon.svg' ? ICON : path.join(GAME_DIR, decodeURIComponent(u.pathname));
  if (!file.startsWith(GAME_DIR) && file !== ICON) return send(403, 'text/plain', 'No permitido');
  try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch (e) { return send(404, 'text/plain', 'No encontrado'); }
  fs.readFile(file, (err, data) => err ? send(404, 'text/plain', 'No encontrado') : send(200, MIME[path.extname(file)] || 'application/octet-stream', data, { 'Cache-Control': 'no-cache' }));
});

/* ───── utilidades ───── */
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 32 * 1024, perMessageDeflate: { zlibDeflateOptions: { level: 1 }, threshold: 1024 } });
const nameOk = n => String(n || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 16);
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const sendTo = (c, m) => { if (c && c.ws.readyState === 1) c.ws.send(typeof m === 'string' ? m : JSON.stringify(m)); };
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
const CHAMPS = Arena.CHAMP_ORDER;
const newCode = () => { const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let c; do { c = Array.from({ length: 5 }, () => L[crypto.randomInt(L.length)]).join(''); } while (rooms.has(c)); return c; };
const roomList = () => [...rooms.values()].map(r => ({ code: r.code, host: (clients.get(r.host) || {}).name || '¿?', humans: r.members.size, state: r.state }));
const broadcastRooms = () => { const m = JSON.stringify({ t: 'rooms', list: roomList() }); for (const c of clients.values()) if (c.ok && !c.room) sendTo(c, m); };

/* ───── salas ───── */
function lobbyMsg(r) { return { t: 'lobby', code: r.code, host: r.host, diff: r.diff, state: r.state, slots: r.slots.map(s => ({ team: s.team, idx: s.idx, pid: s.pid, name: s.name, ch: s.ch })) }; }
function sendLobby(r) { const m = JSON.stringify(lobbyMsg(r)); for (const id of r.members) sendTo(clients.get(id), m); }
function freeSlot(r, prefTeam) { for (const team of [prefTeam, 1 - prefTeam]) for (let idx = 0; idx < 5; idx++) if (!r.slots.some(s => s.team === team && s.idx === idx)) return { team, idx }; return null; }
function joinRoom(c, r) {
  if (c.room) leaveRoom(c);
  // ¿vuelve a una partida en curso? recupera su campeón
  if (r.state === 'game') {
    const ch = r.game.champs.find(x => x.ownerName === c.name.toLowerCase());
    if (!ch) return sendTo(c, { t: 'err', msg: 'Esa sala ya está jugando una partida.' });
    ch.bot = false; ch.pid = c.id; r.members.add(c.id); c.room = r.code; c.champ = ch.id;
    sendTo(c, lobbyMsg(r)); sendTo(c, { t: 'start', me: ch.id, team: ch.team }); log(`${c.name} volvió a la partida ${r.code}`); return;
  }
  const humans = r.slots.length; if (humans >= 10) return sendTo(c, { t: 'err', msg: 'La sala está llena.' });
  const t0 = r.slots.filter(s => s.team === 0).length <= r.slots.filter(s => s.team === 1).length ? 0 : 1, fs2 = freeSlot(r, t0);
  r.slots.push({ team: fs2.team, idx: fs2.idx, pid: c.id, name: c.name, ch: CHAMPS[crypto.randomInt(CHAMPS.length)] });
  r.members.add(c.id); c.room = r.code;
  sendLobby(r); broadcastRooms(); lobbyChat(r, null, `${c.name} entró a la sala`);
}
function leaveRoom(c) {
  const r = rooms.get(c.room); c.room = null; c.champ = null; if (!r) return;
  r.members.delete(c.id);
  if (r.state === 'lobby') r.slots = r.slots.filter(s => s.pid !== c.id);
  else if (r.game) { const ch = r.game.champs.find(x => x.pid === c.id); if (ch) { ch.bot = true; ch.pid = null; ch.nextThink = 0; ch.role = ch.role || null; } }
  if (r.host === c.id) r.host = [...r.members][0] || null;
  if (!r.members.size) closeRoom(r); else { sendLobby(r); lobbyChat(r, null, `${c.name} salió`); }
  broadcastRooms();
}
function closeRoom(r) { clearInterval(r.loop); rooms.delete(r.code); log(`sala ${r.code} cerrada`); }
function lobbyChat(r, from, m) { const msg = JSON.stringify({ t: 'lchat', n: from ? from.name : '·', m }); for (const id of r.members) sendTo(clients.get(id), msg); }

/* ───── partida ───── */
function startGame(r) {
  const players = [];
  for (let team = 0; team < 2; team++) {
    const taken = r.slots.filter(s => s.team === team).map(s => s.ch);
    for (let idx = 0; idx < 5; idx++) {
      const s = r.slots.find(x => x.team === team && x.idx === idx);
      if (s) players.push({ team, champ: s.ch, name: s.name, bot: false, pid: s.pid, owner: s.name.toLowerCase() });
      else { const pool = CHAMPS.filter(k => !taken.includes(k)); const ch = (pool.length ? pool : CHAMPS)[crypto.randomInt((pool.length ? pool : CHAMPS).length)]; taken.push(ch); players.push({ team, champ: ch, name: Arena.CHAMPS[ch].name + ' (bot)', bot: true }); }
    }
  }
  const g = r.game = new Arena.Game({ players, difficulty: r.diff, seed: crypto.randomInt(1e9) });
  g.champs.forEach((c, i) => { c.ownerName = players[i].owner || null; });
  r.state = 'game'; r.evBuf = []; r.tick = 0; r.endAt = 0;
  for (const id of r.members) { const c = clients.get(id), ch = g.champs.find(x => x.pid === id); if (c && ch) { c.champ = ch.id; sendTo(c, { t: 'start', me: ch.id, team: ch.team }); } }
  const every = Math.max(1, Math.round(30 / CFG.snapshotHz));
  r.loop = setInterval(() => {
    try {
      g.step(); r.evBuf.push(...g.drainEvents()); r.tick++;
      if (r.tick % every === 0) {
        const ev = r.evBuf; r.evBuf = [];
        for (const id of r.members) { const c = clients.get(id); if (!c || !c.champ) continue; const ch = g.byId.get(c.champ); if (!ch) continue; sendTo(c, { t: 'snap', s: g.snapshot(ch.team, ch.id), ev }); }
      }
      if (g.winner >= 0 && !r.endAt) { r.endAt = Date.now(); log(`sala ${r.code}: ganó el equipo ${g.winner ? 'rojo' : 'azul'} a los ${(g.t / 60).toFixed(1)} min`); }
      if (r.endAt && Date.now() - r.endAt > 8000) {
        clearInterval(r.loop); r.loop = null; r.game = null; r.state = 'lobby'; for (const id of r.members) { const c = clients.get(id); if (c) c.champ = null; }
        r.slots = r.slots.filter(s => r.members.has(s.pid)); sendLobby(r); broadcastRooms();
      }
    } catch (e) { log('error en la sala', r.code, e.stack); }
  }, 1000 / 30);
  log(`sala ${r.code}: empezó la partida (${r.members.size} jugadores, bots ${r.diff})`); broadcastRooms();
}

/* ───── mensajes ───── */
wss.on('connection', (ws, req) => {
  const c = { ws, id: crypto.randomBytes(5).toString('hex'), name: '', ok: false, room: null, champ: null, tokens: 120, ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress };
  clients.set(c.id, c);
  const timer = setTimeout(() => { if (!c.ok) ws.close(4000, 'tiempo'); }, 10000);
  ws.on('message', raw => {
    if (--c.tokens < 0) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (!c.ok) {
      if (m.t !== 'hello') return;
      if (CFG.password && !safeEq(m.pass || '', CFG.password)) { sendTo(c, { t: 'err', msg: 'Contraseña incorrecta' }); return ws.close(4001, 'contraseña'); }
      let n = nameOk(m.name) || 'Invocador'; const base = n; let i = 2;
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
        const nr = { code: newCode(), host: c.id, slots: [], members: new Set(), diff: 'normal', state: 'lobby', game: null, loop: null };
        rooms.set(nr.code, nr); log(`${c.name} creó la sala ${nr.code}`); joinRoom(c, nr); break;
      }
      case 'join': { const target = rooms.get(String(m.code || '').toUpperCase().trim()); if (!target) return sendTo(c, { t: 'err', msg: 'No existe una sala con ese código.' }); joinRoom(c, target); break; }
      case 'leave': leaveRoom(c); sendTo(c, { t: 'rooms', list: roomList() }); break;
      case 'slot': { if (!r || r.state !== 'lobby') break; const team = m.team === 1 ? 1 : 0, idx = Math.max(0, Math.min(4, m.idx | 0)); if (r.slots.some(s => s.team === team && s.idx === idx)) break; const s = r.slots.find(s => s.pid === c.id); if (s) { s.team = team; s.idx = idx; sendLobby(r); } break; }
      case 'champ': { if (!r || r.state !== 'lobby' || !Arena.CHAMPS[m.ch]) break; const s = r.slots.find(s => s.pid === c.id); if (s) { s.ch = m.ch; sendLobby(r); } break; }
      case 'diff': if (r && r.host === c.id && r.state === 'lobby' && ['facil', 'normal', 'dificil'].includes(m.d)) { r.diff = m.d; sendLobby(r); } break;
      case 'start': if (r && r.host === c.id && r.state === 'lobby') startGame(r); break;
      case 'chat': if (r) { const txt = String(m.m || '').slice(0, 140).trim(); if (txt) lobbyChat(r, c, txt); } break;
      case 'in': {
        if (!r || !r.game || !c.champ) break; const ch = r.game.byId.get(c.champ); if (!ch || ch.pid !== c.id) break;
        const o = m.o || {}; const t = String(o.t || '');
        const clean = { t, x: num(o.x), z: num(o.z), id: num(o.id) | 0, s: num(o.s) | 0, item: String(o.item || '').slice(0, 20), slot: num(o.slot) | 0, v: !!o.v };
        if (['move', 'attack', 'amove', 'cast', 'spell', 'recall', 'stop', 'buy', 'sell', 'use', 'level', 'auto'].includes(t)) r.game.input(ch, clean);
        break;
      }
    }
  });
  ws.on('close', () => { clearTimeout(timer); if (c.room) leaveRoom(c); clients.delete(c.id); if (c.ok) log(`salió ${c.name}`); });
  ws.on('error', () => { });
});
setInterval(() => { for (const c of clients.values()) c.tokens = 120; }, 1000);
const bye = () => { log('cerrando…'); process.exit(0); };
process.on('SIGINT', bye); process.on('SIGTERM', bye);
server.listen(CFG.port, CFG.host, () => log(`GonzaArena · "${CFG.name}" escuchando en ${CFG.host}:${CFG.port}`));
