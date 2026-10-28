/* GonzaSky — dogfight online: conexión al servidor, aviones de los demás, daño, derribos, tabla y chat.
 * Cada jugador simula su propio avión y manda su estado ~15 veces por segundo. El que dispara decide
 * si le pegó a alguien (así se siente justo para el que apunta) y el servidor reenvía todo.
 */
(function () {
  'use strict';
  const GS = window.GS, game = GS.game;
  if (!game) return;
  const { G, K, scene, camera, SPECS, AIRPORTS } = game;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
  const RADIUS = { gaucho: 6, pampa: 17, condor: 7.5, stuka: 8.5 };
  const SEND_HZ = 15, DELAY = 120; // ms de retraso para interpolar suave

  const ON = GS.online = {
    active: false, ws: null, id: null, nick: '', srvName: '', arena: null, peers: new Map(),
    hp: 100, maxHp: 100, board: false, feed: [], chat: [], lastAtk: null, lastAtkT: 0, spawnT: 0, sendT: 0, warnT: 0, hurtT: 0, dead: false, k: 0, d: 0, plane: store.get('gs_ol_plane', 'condor'),
  };

  /* ───── direcciones ───── */
  function urls(addr) {
    let a = String(addr || '').trim().replace(/\/+$/, ''), sec;
    if (/^(wss|https):\/\//i.test(a)) { sec = true; a = a.replace(/^\w+:\/\//, ''); } else if (/^(ws|http):\/\//i.test(a)) { sec = false; a = a.replace(/^\w+:\/\//, ''); }
    else sec = !/:\d+$/.test(a) && !/^(localhost|\d+\.\d+\.\d+\.\d+)$/i.test(a);
    a = a.replace(/\/ws$/, '');
    return { ws: (sec ? 'wss://' : 'ws://') + a + '/ws', http: (sec ? 'https://' : 'http://') + a };
  }
  const here = /^https?:$/.test(location.protocol) ? fetch('sky-servidor.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null);

  /* ───── menú ───── */
  function pickHtml(sel) {
    return Object.values(SPECS).map(s => `<button data-olplane="${s.id}" aria-pressed="${s.id === sel}"><small>${esc(s.tipo.split(' · ')[0])} · ${s.hp} de vida</small><b>${esc(s.name)}</b><span class="hint">${s.missiles ? s.missiles + ' misiles' : s.id === 'pampa' ? 'Enorme y resistente' : 'Solo ametralladora'}</span></button>`).join('');
  }
  function renderOnline() {
    $('#olName').value = store.get('gs_ol_name', '');
    const list = store.get('gs_ol_servers', []);
    $('#olList').innerHTML = list.map(a => `<option value="${esc(a)}">`).join('');
    if (!$('#olAddr').value) $('#olAddr').value = list[0] || '';
    $('#olPlanes').innerHTML = pickHtml(ON.plane);
    here.then(j => { if (j && j.ws) { $('#olAddr').value = location.host; info('Estás en el servidor «' + j.name + '». Poné tu nombre y entrá.', 'ok'); } else checkAddr(); });
  }
  let checkT = null;
  function info(t, cls) { const e = $('#olInfo'); e.textContent = t; e.className = 'hint ' + (cls || ''); }
  function checkAddr() {
    clearTimeout(checkT); const a = $('#olAddr').value.trim(); if (!a) return info('Escribí la dirección que te dio el instalador del servidor.');
    checkT = setTimeout(() => {
      const ctl = new AbortController(); setTimeout(() => ctl.abort(), 5000);
      fetch(urls(a).http + '/estado', { signal: ctl.signal, cache: 'no-store' }).then(r => r.json()).then(st => {
        if (st.game !== 'gonzasky') return info('Esa dirección es de otro juego (¿GonzaCraft?). El servidor de GonzaSky empieza con «sky.».', 'bad');
        info(`«${st.name}» · ${st.players.length}/${st.max} pilotos${st.players.length ? ': ' + st.players.join(', ') : ''}${st.password ? ' · pide contraseña' : ''}`, 'ok');
      }).catch(() => info('No responde todavía. Fijate la dirección o que el servidor esté prendido.', 'bad'));
    }, 400);
  }
  $('#olAddr').addEventListener('input', checkAddr);
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-olplane]'); if (!b) return;
    ON.plane = b.dataset.olplane; store.set('gs_ol_plane', ON.plane);
    b.parentElement.querySelectorAll('[data-olplane]').forEach(x => x.setAttribute('aria-pressed', x === b));
  });
  // botones de las pantallas: se suman a los menús de main.js
  game.go.online = () => { game.show('sOnline'); renderOnline(); };
  game.act.olJoin = () => join();
  game.act.olRespawn = () => respawn();
  game.act.olLeave = () => { ON.disconnect(); game.endFlight(); };

  /* ───── conexión ───── */
  function join() {
    const name = $('#olName').value.trim() || 'Piloto', addr = $('#olAddr').value.trim();
    if (!addr) return info('Falta la dirección del servidor.', 'bad');
    store.set('gs_ol_name', name);
    const list = store.get('gs_ol_servers', []).filter(a => a !== addr); list.unshift(addr); store.set('gs_ol_servers', list.slice(0, 8));
    info('Conectando…'); $('#olJoin').disabled = true;
    let ws; try { ws = new WebSocket(urls(addr).ws); } catch (e) { $('#olJoin').disabled = false; return info('Dirección inválida.', 'bad'); }
    ON.ws = ws; let welcomed = false;
    const to = setTimeout(() => { if (!welcomed) { ws.close(); info('No pude conectar. ¿Está prendido el servidor?', 'bad'); $('#olJoin').disabled = false; } }, 9000);
    ws.onopen = () => send({ t: 'hello', name, plane: ON.plane, pass: $('#olPass').value, v: 1 });
    ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (m.t === 'welcome') { welcomed = true; clearTimeout(to); } onMsg(m); };
    ws.onerror = () => { };
    ws.onclose = () => {
      clearTimeout(to); $('#olJoin').disabled = false;
      if (ON.ws !== ws) return;
      if (!welcomed) { if (!ON.err) info('No pude conectar. ¿Está prendido el servidor?', 'bad'); ON.err = null; return; }
      if (ON.active) { const why = ON.err || 'Se cortó la conexión con el servidor.'; ON.disconnect(); game.endFlight(); game.toast(why, 5000); }
    };
  }
  function send(m) { if (ON.ws && ON.ws.readyState === 1) ON.ws.send(JSON.stringify(m)); }
  ON.disconnect = function (silent) {
    const ws = ON.ws; ON.ws = null; ON.active = false; if (ws) try { ws.close(); } catch (e) { }
    for (const p of ON.peers.values()) removePeer(p); ON.peers.clear(); ON.feed = []; ON.chat = []; ON.board = false;
    $$('#touch .onlineonly').forEach(b => b.hidden = true); $('#chatBox').hidden = true;
  };

  function onMsg(m) {
    switch (m.t) {
      case 'err': ON.err = m.msg; info(m.msg, 'bad'); break;
      case 'welcome':
        Object.assign(ON, { active: true, id: m.id, nick: m.nick, srvName: m.name, arena: m.arena, k: 0, d: 0, dead: false });
        (m.players || []).forEach(addPeer);
        $$('#touch .onlineonly').forEach(b => b.hidden = false);
        startPlane(true);
        if (m.motd) pushFeed(m.motd, '#9fd0ff');
        break;
      case 'join': addPeer(m.p); pushFeed(`${m.p.n} entró a pelear`, '#9fd0ff'); break;
      case 'leave': { const p = ON.peers.get(m.id); if (p) { pushFeed(`${p.name} se fue`, '#9fb0c0'); removePeer(p); ON.peers.delete(m.id); } break; }
      case 's': { const p = ON.peers.get(m.id); if (p) snapshot(p, m.d); break; }
      case 'plane': { const p = ON.peers.get(m.id); if (p && p.plane !== m.p) { p.plane = m.p; rebuild(p); } break; }
      case 'mis': {
        const p = ON.peers.get(m.id); if (!p) break;
        const target = m.to === ON.id ? meTarget : (ON.peers.get(m.to) || null);
        game.cosmeticMissile(new THREE.Vector3(...m.p), new THREE.Vector3(...m.v), target);
        if (m.to === ON.id) { ON.warnT = 6; game.toast('¡Misil de ' + p.name + '! Virá fuerte para esquivarlo', 2200); }
        break;
      }
      case 'hit': onHit(m); break;
      case 'kill': onKill(m); break;
      case 'c': ON.chat.push({ n: m.n, m: m.m, t: performance.now(), me: m.id === ON.id }); if (ON.chat.length > 6) ON.chat.shift(); if (m.id !== ON.id) game.SND.blip('click'); break;
      case 'bye': ON.err = 'El servidor se apagó o se está reiniciando.'; break;
    }
  }

  /* ───── los otros aviones ───── */
  function tag(name) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 48; const g = c.getContext('2d');
    g.font = '700 28px Figtree, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(name, 128, 24); g.fillStyle = '#ffd6d6'; g.fillText(name, 128, 24);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.renderOrder = 10; return s;
  }
  function addPeer(i) {
    if (!i || i.id === ON.id || ON.peers.has(i.id)) return;
    const p = { id: i.id, name: i.n, plane: SPECS[i.p] ? i.p : 'condor', k: i.k || 0, d: i.d || 0, buf: [], alive: false, isPlane: true, x: 0, y: -1e5, z: 0, hp: 1, fireT: 0, gunIdx: 0, smokeT: 0 };
    p.fake = { ail: 0, elev: 0, rud: 0, rpm: .7, engineOn: true, ab: false, gearPos: 0, brakes: false, onGround: false, spec: SPECS[p.plane], ammo: { bombs: 0, maxB: 0, missiles: 0 } };
    p.tag = tag(p.name); scene.add(p.tag); rebuild(p); ON.peers.set(p.id, p);
  }
  function rebuild(p) {
    if (p.model) scene.remove(p.model.root);
    p.model = GS.buildPlane(p.plane); p.model.root.visible = false; scene.add(p.model.root);
    p.fake.spec = SPECS[p.plane]; const s = SPECS[p.plane]; p.fake.ammo = { bombs: s.bombs ? 5 : 0, maxB: s.bombs ? 5 : 0, missiles: s.missiles || 0 };
  }
  function removePeer(p) { if (p.model) scene.remove(p.model.root); if (p.tag) { scene.remove(p.tag); p.tag.material.map.dispose(); p.tag.material.dispose(); } }
  function snapshot(p, d) {
    const now = performance.now(), last = p.buf[p.buf.length - 1];
    const pos = new THREE.Vector3(d[0], d[1], d[2]);
    if (!p.alive || (last && last.pos.distanceTo(pos) > 600)) p.buf.length = 0; // reapareció: sin interpolar
    p.alive = true;
    p.buf.push({ at: now, pos, q: new THREE.Quaternion(d[3], d[4], d[5], d[6]), vel: new THREE.Vector3(d[7], d[8], d[9]), thr: d[10], fl: d[11] | 0, ail: d[12], elev: d[13], rud: d[14], hp: d[15], ms: d[16] | 0, bs: d[17] | 0 });
    if (p.buf.length > 30) p.buf.shift();
  }
  const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
  function updPeers(dt) {
    const rt = performance.now() - DELAY;
    for (const p of ON.peers.values()) {
      const b = p.buf, m = p.model; if (!b.length || !p.alive) { m.root.visible = false; p.tag.visible = false; p.x = 0; p.y = -1e5; p.z = 0; continue; }
      let s0 = b[0], s1 = b[0];
      for (let i = 0; i < b.length; i++) { if (b[i].at <= rt) s0 = b[i]; if (b[i].at >= rt) { s1 = b[i]; break; } s1 = b[i]; }
      if (s1 === s0 || s1.at <= s0.at) { // sin dato nuevo: seguir derecho un ratito
        const ex = clamp((rt - s0.at) / 1000, 0, .35); m.root.position.copy(s0.pos).addScaledVector(s0.vel, ex); m.root.quaternion.copy(s0.q);
      } else { const k = clamp((rt - s0.at) / (s1.at - s0.at), 0, 1); m.root.position.lerpVectors(s0.pos, s1.pos, k); m.root.quaternion.slerpQuaternions(s0.q, s1.q, k); }
      const s = s1, f = p.fake; m.root.visible = true;
      Object.assign(f, { ail: s.ail, elev: s.elev, rud: s.rud, rpm: s.thr, ab: !!(s.fl & 4) && !!f.spec.ab, gearDown: !!(s.fl & 1), gearPos: f.spec.fixedGear || (s.fl & 1) ? 1 : 0, brakes: !!(s.fl & 8), onGround: !!(s.fl & 16) });
      f.ammo.missiles = s.ms; f.ammo.bombs = s.bs;
      GS.animatePlane(m, f, dt);
      p.x = m.root.position.x; p.y = m.root.position.y; p.z = m.root.position.z; p.vel = s.vel; p.hp = s.hp;
      // nombre arriba del avión, del mismo tamaño en pantalla a cualquier distancia
      const dist = camera.position.distanceTo(m.root.position);
      p.tag.visible = dist < 9000; p.tag.position.copy(m.root.position); p.tag.position.y += RADIUS[p.plane] * .9 + dist * .018; p.tag.scale.set(dist * .085, dist * .016, 1);
      // disparos (solo se ven: el daño lo calcula el que dispara)
      if (s.fl & 2) {
        p.fireT -= dt; const guns = game.GUNS[p.plane] || game.GUNS.condor;
        _w.set(0, 0, -1).applyQuaternion(m.root.quaternion);
        while (p.fireT <= 0) { p.fireT += 1 / 14; p.gunIdx = (p.gunIdx + 1) % guns.length; _v.set(...guns[p.gunIdx]).applyQuaternion(m.root.quaternion).add(m.root.position); game.spawnBullet(_v, _w.clone().multiplyScalar(880).add(s.vel), p.id); }
        if (dist < 1500) game.SND.blip('gun');
      } else p.fireT = 0;
      // humo si está dañado
      if (s.hp < 40 && (p.smokeT -= dt) <= 0) { p.smokeT = s.hp < 20 ? .07 : .14; game.puff(m.root.position, s.hp < 20 ? 0x222222 : 0x555555, 3.5, 2.5, 2); }
    }
  }

  /* ───── mi avión ───── */
  const meTarget = { isPlane: true, get alive() { return !!G.plane && !G.plane.crashed; }, get x() { return G.plane ? G.plane.pos.x : 0; }, get y() { return G.plane ? G.plane.pos.y : 0; }, get z() { return G.plane ? G.plane.pos.z : 0; } };
  function startPlane(first) {
    const spec = SPECS[ON.plane] || SPECS.condor;
    ON.maxHp = ON.hp = spec.hp || 100; ON.dead = false; ON.lastAtk = null; ON.hurtT = 0;
    const ar = ON.arena || {};
    game.startFlight({ plane: spec.id, online: true, start: { ap: ar.ap || 'GZA', kind: 'arena' }, hour: ar.hour ?? 15, weather: ar.wx || 'despejado', wind: 0 });
    if (!first) send({ t: 'plane', p: spec.id });
  }
  ON.onSpawn = function () { ON.spawnT = 3; game.toast(game.TOUCH ? `¡A pelear en «${ON.srvName}»! FUEGO dispara · 🏆 tabla · 💬 chat` : `¡A pelear en «${ON.srvName}»! Espacio o Ctrl dispara · Tab tabla · Enter chat`, 4200); };
  ON.spawnSafe = () => ON.spawnT > 0;
  function respawn() {
    if (!ON.active) return;
    game.hideScreens(); startPlane(false);
  }
  function onHit(m) {
    if (ON.dead || !G.plane || G.plane.crashed || ON.spawnT > 0) return;
    ON.hp -= m.dmg; ON.hurtT = .35; ON.lastAtk = m.from; ON.lastAtkW = m.w; ON.lastAtkT = performance.now();
    if (m.w === 'misil') { game.explode(G.plane.pos.clone().add(new THREE.Vector3(0, 2, 0)), .7); G.shake = 1; }
    if (ON.hp <= 0) { const p = ON.peers.get(m.from); G.plane.crash(p ? 'Te derribó ' + p.name : 'Te derribaron'); }
  }
  ON.onDeath = function (ev) {
    if (ON.dead) return; ON.dead = true;
    const recent = ON.lastAtk && performance.now() - ON.lastAtkT < 15000 ? ON.lastAtk : null;
    send({ t: 'die', by: recent, w: recent ? ON.lastAtkW : '', why: ev.why });
    setTimeout(() => {
      if (!ON.active) return;
      const p = recent && ON.peers.get(recent);
      $('#deadTitle').textContent = p ? '¡Te derribó ' + p.name + '!' : '¡Te estrellaste!';
      $('#deadText').textContent = (p ? `Con ${ON.lastAtkW === 'misil' ? 'un misil' : 'las ametralladoras'}. ` : ev.why + '. ') + `Vas ${ON.k} derribos y ${ON.d} caídas.`;
      $('#deadPlanes').innerHTML = pickHtml(ON.plane);
      game.show('sDead');
    }, 2200);
  };
  ON.planeHit = function (p, dmg, w) { if (!p || !p.alive || !p.id) return; send({ t: 'hit', to: p.id, dmg, w }); p.hitT = performance.now(); };
  ON.sendMissile = function (pos, vel, target) { send({ t: 'mis', to: target && target.isPlane && target.id ? target.id : '', p: [pos.x, pos.y, pos.z], v: [vel.x, vel.y, vel.z] }); };
  function onKill(m) {
    const name = id => id === ON.id ? ON.nick : (ON.peers.get(id) || {}).name || '¿?';
    for (const [id, k, d] of m.sc || []) { if (id === ON.id) { ON.k = k; ON.d = d; } else { const p = ON.peers.get(id); if (p) { p.k = k; p.d = d; } } }
    const v = ON.peers.get(m.victim); if (v) { if (v.alive) game.explode(new THREE.Vector3(v.x, v.y, v.z), 1); v.alive = false; v.buf.length = 0; }
    const mine = m.by === ON.id, me = m.victim === ON.id;
    pushFeed(m.by ? `${name(m.by)} ${m.w === 'misil' ? '🚀' : '✈'} ${name(m.victim)}` : `${name(m.victim)} se estrelló`, mine ? '#7dff9a' : me ? '#ff8080' : '#f4f7fb');
    if (mine) { game.toast('¡Derribaste a ' + name(m.victim) + '!', 2200); game.SND.blip('ding'); }
  }
  function pushFeed(t, c) { ON.feed.push({ t, c, at: performance.now() }); if (ON.feed.length > 5) ON.feed.shift(); }

  /* ───── por cuadro ───── */
  ON.tick = function (dt) {
    if (!ON.active) return;
    const a = G.plane; ON.spawnT = Math.max(0, ON.spawnT - dt); ON.hurtT = Math.max(0, ON.hurtT - dt); ON.warnT = Math.max(0, ON.warnT - dt);
    updPeers(dt);
    if (ON.warnT > 0 && (performance.now() / 250 | 0) % 2 && !ON.dead) { if (!ON.beep) { ON.beep = true; game.SND.blip('warn'); } } else ON.beep = false;
    if (!a || a.crashed || G.mode !== 'fly') return;
    // humo propio si estoy dañado
    if (ON.hp < ON.maxHp * .4 && (ON.smokeT = (ON.smokeT || 0) - dt) <= 0) { ON.smokeT = .12; game.puff(a.pos, 0x333333, 3, 2.2, 2); }
    if ((ON.sendT -= dt) > 0) return; ON.sendT = 1 / SEND_HZ;
    const fl = (a.gearDown ? 1 : 0) | (a.firing ? 2 : 0) | (a.ab ? 4 : 0) | (a.brakes ? 8 : 0) | (a.onGround ? 16 : 0);
    const r = v => Math.round(v * 100) / 100, am = a.ammo || {};
    send({ t: 's', d: [r(a.pos.x), r(a.pos.y), r(a.pos.z), r(a.q.x * 1e4) / 1e4, r(a.q.y * 1e4) / 1e4, r(a.q.z * 1e4) / 1e4, r(a.q.w * 1e4) / 1e4, r(a.vel.x), r(a.vel.y), r(a.vel.z), r(a.rpm), fl, r(a.ail), r(a.elev), r(a.rud), Math.round(ON.hp), am.missiles | 0, am.bombs | 0] });
  };
  ON.targets = () => [...ON.peers.values()].filter(p => p.alive && p.y > -1e4);
  const _a = new THREE.Vector3();
  ON.hitTest = function (p0, p1) {
    for (const p of ON.peers.values()) {
      if (!p.alive || p.y < -1e4) continue; _a.set(p.x, p.y, p.z);
      if (game.segDist(p0, p1, _a) < RADIUS[p.plane]) return { peer: p, point: _a.clone() };
    }
    return null;
  };
  ON.blips = () => [...ON.peers.values()].filter(p => p.alive && p.y > -1e4).map(p => ({ x: p.x, z: p.z }));
  ON.toggleBoard = () => { ON.boardT = !ON.boardT; };

  /* ───── chat ───── */
  ON.openChat = function () { const f = $('#chatBox'); f.hidden = false; const i = $('#chatIn'); i.value = ''; setTimeout(() => i.focus(), 0); for (const k in K) K[k] = false; };
  $('#chatBox').addEventListener('submit', e => { e.preventDefault(); const v = $('#chatIn').value.trim(); if (v) send({ t: 'c', m: v }); $('#chatBox').hidden = true; $('#chatIn').blur(); });
  $('#chatIn').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { $('#chatBox').hidden = true; $('#chatIn').blur(); } });

  /* ───── dibujo sobre el HUD ───── */
  function txt(g, t, x, y, col, size, align, bold) { g.font = `${bold ? 700 : 600} ${size}px "JetBrains Mono", ui-monospace, monospace`; g.textAlign = align || 'left'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(t, x + 1, y + 1); g.fillStyle = col; g.fillText(t, x, y); }
  ON.draw = function (g, hud) {
    if (!ON.active) return;
    const W = innerWidth, H = innerHeight, a = G.plane, T = game.TOUCH, flying = G.mode === 'fly' && !G.ui && a && !a.crashed;
    // marcas sobre los enemigos
    if (flying && G.showHud) for (const p of ON.peers.values()) {
      if (!p.alive || p.y < -1e4) continue;
      const pos = new THREE.Vector3(p.x, p.y, p.z), d = pos.distanceTo(camera.position), s = game.project(pos), hitRecent = performance.now() - (p.hitT || 0) < 150;
      const col = hitRecent ? '#ffffff' : '#ff5a5a';
      if (s && s.x > 0 && s.x < W && s.y > 0 && s.y < H) {
        const sz = clamp(2400 / Math.max(d, 1) * RADIUS[p.plane] / 7, 10, 60);
        g.strokeStyle = col; g.lineWidth = 2; g.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const cx = s.x + sx * sz, cy = s.y + sy * sz; g.moveTo(cx, cy - sy * sz * .45); g.lineTo(cx, cy); g.lineTo(cx - sx * sz * .45, cy); }
        g.stroke();
        txt(g, `${p.name} · ${d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km'}`, s.x, s.y + sz + 12, col, 12, 'center', true);
        const bw = 44, frac = clamp(p.hp / (SPECS[p.plane].hp || 100), 0, 1); g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(s.x - bw / 2, s.y - sz - 10, bw, 4); g.fillStyle = frac > .5 ? '#7dff9a' : frac > .25 ? '#ffcf4a' : '#ff4d4d'; g.fillRect(s.x - bw / 2, s.y - sz - 10, bw * frac, 4);
      } else {
        // flecha en el borde hacia donde está
        let dx, dy; if (s) { dx = s.x - W / 2; dy = s.y - H / 2; } else { const v = pos.clone().sub(camera.position).applyQuaternion(camera.quaternion.clone().invert()); dx = v.x; dy = -v.y; if (Math.abs(dx) + Math.abs(dy) < 1e-3) dx = 1; }
        const ang = Math.atan2(dy, dx), R = Math.min(W, H) * .42, x = W / 2 + Math.cos(ang) * R, y = H / 2 + Math.sin(ang) * R;
        g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = col; g.beginPath(); g.moveTo(12, 0); g.lineTo(-6, -8); g.lineTo(-6, 8); g.fill(); g.restore();
        txt(g, p.name, x, y + 16, col, 11, 'center', true);
      }
    }
    // mi vida
    if (a && G.mode === 'fly' && !G.ui) {
      const bw = Math.min(260, W * .4), x = W / 2 - bw / 2, y = H - (T ? 132 : 60), frac = clamp(ON.hp / ON.maxHp, 0, 1);
      g.fillStyle = 'rgba(8,14,22,.6)'; g.fillRect(x - 2, y - 2, bw + 4, 12); g.fillStyle = frac > .5 ? '#7dff9a' : frac > .25 ? '#ffcf4a' : '#ff4d4d'; g.fillRect(x, y, bw * frac, 8);
      txt(g, `VIDA ${Math.max(0, Math.round(ON.hp))} · ${ON.k} derribos`, W / 2, y - 12, '#f4f7fb', 12, 'center', true);
      if (ON.spawnT > 0) txt(g, 'PROTEGIDO ' + ON.spawnT.toFixed(0), W / 2, y - 30, '#9fd0ff', 13, 'center', true);
      if (ON.warnT > 0 && (performance.now() / 250 | 0) % 2) txt(g, '¡MISIL ENEMIGO!', W / 2, H * .28, '#ff4d4d', 22, 'center', true);
    }
    if (ON.hurtT > 0) { const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .7); gr.addColorStop(0, 'rgba(255,0,0,0)'); gr.addColorStop(1, `rgba(255,0,0,${ON.hurtT})`); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
    // derribos recientes
    const now = performance.now(); let fy = T ? 104 : 74;
    for (const f of ON.feed) { if (now - f.at > 8000) continue; txt(g, f.t, T ? 12 : 22, fy, f.c, 13, 'left', true); fy += 20; }
    // chat
    let cy = H * (T ? .5 : .58);
    for (const c of ON.chat.slice().reverse()) { if (now - c.t > 15000) continue; txt(g, `${c.n}: ${c.m}`, T ? 12 : 22, cy, c.me ? '#bfe3ff' : '#f4f7fb', 13, 'left'); cy -= 19; }
    // tabla de puntos
    if (ON.board || ON.boardT) {
      const rows = [{ name: ON.nick + ' (vos)', k: ON.k, d: ON.d, me: true }].concat([...ON.peers.values()].map(p => ({ name: p.name, k: p.k, d: p.d }))).sort((x, y) => y.k - x.k || x.d - y.d);
      const w = Math.min(420, W - 40), h = 70 + rows.length * 26, x = W / 2 - w / 2, y = Math.max(60, H / 2 - h / 2);
      g.fillStyle = 'rgba(8,14,26,.88)'; g.fillRect(x, y, w, h); g.strokeStyle = 'rgba(140,180,230,.35)'; g.strokeRect(x, y, w, h);
      txt(g, ON.srvName, x + 16, y + 22, '#ffcf4a', 15, 'left', true); txt(g, 'DERRIBOS  CAÍDAS', x + w - 16, y + 22, '#9fb1c6', 11, 'right', true);
      rows.forEach((r, i) => { const yy = y + 54 + i * 26; txt(g, `${i + 1}. ${r.name}`, x + 16, yy, r.me ? '#7dff9a' : '#f4f7fb', 14, 'left', r.me); txt(g, String(r.k), x + w - 110, yy, '#f4f7fb', 14, 'right', true); txt(g, String(r.d), x + w - 24, yy, '#9fb1c6', 14, 'right'); });
    }
  };
})();
