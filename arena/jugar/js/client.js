/* GonzaArena — cliente: dibujo 3D, cámara, controles (PC y celular), efectos, interfaz, tienda, minimapa y modo online.
 * Recibe "fotos" del estado (de la partida local contra bots o del servidor) y las dibuja.
 */
(function () {
  'use strict';
  const A = Arena, M = A.MAP, AM = AModels, TEAM = AM.TEAM;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, k) => a + (b - a) * k;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TOUCH = (matchMedia && matchMedia('(pointer: coarse)').matches) || /Android|iPhone|iPad/i.test(navigator.userAgent) || /[?&]tactil/.test(location.search);
  if (TOUCH) document.body.classList.add('touch');
  const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
  const S = Object.assign({ sound: true, camLock: true, name: '', champ: 'brasa', diff: 'normal', team: 0 }, store.get('ga_settings', {}));
  const saveS = () => store.set('ga_settings', S);
  let toastT; const toast = (m, ms = 2600) => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms); };

  /* ───── render ───── */
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: $('#c'), antialias: !TOUCH, powerPreference: 'high-performance' }); }
  catch (e) { document.body.innerHTML = '<section class="screen"><div class="panel"><h2>No se pudo iniciar</h2><p>Tu navegador o tu placa de video no soportan WebGL. Probá con Chrome o Edge actualizados.</p></div></section>'; return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, TOUCH ? 1.25 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = !TOUCH; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0a0f14); scene.fog = new THREE.Fog(0x0a0f14, 70, 140);
  const camera = new THREE.PerspectiveCamera(40, 1, .5, 400);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a3020, 1.15));
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.9); sun.position.set(-30, 60, 20); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 150 }); scene.add(sun, sun.target);
  const MAP3D = AM.buildMap(scene);
  const ov = $('#ov'), og = ov.getContext('2d');
  function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); const d = Math.min(devicePixelRatio || 1, 2); ov.width = innerWidth * d; ov.height = innerHeight * d; og.setTransform(d, 0, 0, d, 0, 0); }
  resize(); addEventListener('resize', resize);

  /* niebla de guerra: una textura chica que se oscurece fuera de la visión del equipo */
  const fogCv = document.createElement('canvas'); fogCv.width = fogCv.height = 128; const fg = fogCv.getContext('2d');
  const fogTex = new THREE.CanvasTexture(fogCv);
  const fogMesh = new THREE.Mesh(new THREE.PlaneGeometry(M.W, M.W), new THREE.MeshBasicMaterial({ map: fogTex, transparent: true, depthWrite: false }));
  fogMesh.rotation.x = -Math.PI / 2; fogMesh.position.set(M.W / 2, .35, M.W / 2); fogMesh.renderOrder = 1; scene.add(fogMesh);

  /* ───── sonido sintetizado ───── */
  const SND = {
    ctx: null, init() { if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; } try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.out = this.ctx.createGain(); this.out.gain.value = .5; this.out.connect(this.ctx.destination); const b = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.noise = b; } catch (e) { } },
    play(kind, vol = 1) {
      if (!S.sound || !this.ctx || vol < .03) return; const c = this.ctx, t = c.currentTime, g = c.createGain(); g.connect(this.out);
      const osc = (type, f0, f1, d, v) => { const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d); g.gain.setValueAtTime(v * vol, t); g.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(g); o.start(t); o.stop(t + d + .02); };
      const noise = (f, q, d, v, type = 'bandpass') => { const s = c.createBufferSource(); s.buffer = this.noise; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.setValueAtTime(v * vol, t); g.gain.exponentialRampToValueAtTime(.001, t + d); s.connect(fl); fl.connect(g); s.start(t, Math.random() * .5); s.stop(t + d); };
      if (kind === 'hit') noise(900, 1, .08, .25); else if (kind === 'cast') noise(1800, .7, .25, .2, 'highpass'); else if (kind === 'boom') noise(220, .7, .6, .6, 'lowpass');
      else if (kind === 'coin') osc('square', 1300, 1900, .12, .07); else if (kind === 'level') osc('triangle', 520, 1040, .5, .18); else if (kind === 'death') osc('sawtooth', 300, 60, .7, .12);
      else if (kind === 'click') osc('square', 700, 650, .04, .05); else if (kind === 'win') osc('triangle', 440, 880, 1.2, .2); else if (kind === 'lose') osc('sawtooth', 300, 110, 1.4, .15); else if (kind === 'swing') noise(2500, 2, .07, .12);
    },
  };

  /* ───── estado del cliente ───── */
  const ST = { mode: 'menu', net: null, me: 0, team: 0, ents: new Map(), champs: new Map(), snap: null, snapT: 0, interval: 1 / 30, tgt: { x: 30, z: 170 }, zoom: 1, aim: -1, aimAt: null, hover: null, keys: {}, amove: false, mouse: { x: 0, y: 0, gx: 0, gz: 0, inside: false }, fx: [], parts: [], projs: new Map(), floats: [], marks: [], feed: [], center: false, board: false, ended: false, t: 0, hudT: 0, fogT: 0 };

  /* ───── conexión: partida local contra bots ───── */
  const Local = {
    start(o) {
      const g = this.g = new A.Game({ players: o.players, difficulty: o.diff, seed: (Math.random() * 1e9) | 0 });
      this.me = g.champs.find(c => !c.bot); this.acc = 0; this.paused = false;
      ST.me = this.me.id; ST.team = this.me.team; ST.interval = A.TICK; deliver(g.snapshot(ST.team, ST.me), []);
    },
    input(o) { if (this.g) this.g.input(this.me, o); },
    tick(dt) {
      if (this.paused || !this.g) return; this.acc += Math.min(dt, .25); let n = 0;
      while (this.acc >= A.TICK && n++ < 8) { this.g.step(); this.acc -= A.TICK; const ev = this.g.drainEvents(); if (this.acc < A.TICK) deliver(this.g.snapshot(ST.team, ST.me), ev); else handleEvents(ev); }
    },
    close() { this.g = null; },
  };

  /* ───── fotos del estado ───── */
  const KINDS = ['champ', 'minion', 'tower', 'inhib', 'nexus', 'monster'];
  function deliver(snap, events) {
    const now = performance.now() / 1000, seen = new Set();
    ST.interval = ST.snapT ? clamp(now - ST.snapT, .02, .25) * .3 + ST.interval * .7 : ST.interval; ST.snapT = now; ST.snap = snap;
    for (const e of snap.e) {
      const [id, kind, sub, team, x, z, hp, maxHp, facing, flags, lvl, sh] = e; seen.add(id);
      let m = ST.ents.get(id);
      if (!m) { m = { id, kind: KINDS[kind], sub, team, x, z, x0: x, z0: z, x1: x, z1: z, f: facing, f0: facing, f1: facing, t0: now, model: null, atk: 0, cast: 0 }; ST.ents.set(id, m); makeModel(m, lvl); }
      if (!m.visible && m.model && m.kind !== 'tower') { m.x0 = m.x1 = m.x = x; m.z0 = m.z1 = m.z = z; } // reapareció: sin deslizarse desde lejos
      else { m.x0 = m.x; m.z0 = m.z; m.x1 = x; m.z1 = z; }
      if (Math.hypot(m.x0 - x, m.z0 - z) > 8) { m.x0 = x; m.z0 = z; } // teletransporte (destello, volver a la base)
      m.f0 = m.f; m.f1 = facing; m.t0 = now; m.hp = hp; m.maxHp = maxHp; m.flags = flags; m.lvl = lvl; m.sh = sh; m.visible = true; m.lastSeen = now;
      if (m.kind === 'champ' && m.sub !== m.ch) { m.ch = m.sub; }
    }
    for (const [id, m] of ST.ents) if (!seen.has(id)) { m.visible = false; if ((m.kind === 'minion' || m.kind === 'monster') && now - m.lastSeen > 3) { removeModel(m); ST.ents.delete(id); } }
    ST.champs.clear(); for (const c of snap.c) ST.champs.set(c.id, c);
    if (events && events.length) handleEvents(events);
    if (snap.w >= 0 && !ST.ended) endGame(snap.w);
  }
  function makeModel(m, lvl) {
    if (m.kind === 'champ') m.model = AM.champ(m.sub, m.team);
    else if (m.kind === 'minion') m.model = AM.minion(m.sub, m.team);
    else if (m.kind === 'monster') m.model = AM.monster(m.sub, lvl === 1);
    else if (m.kind === 'tower') m.model = AM.tower(m.team);
    else if (m.kind === 'inhib') m.model = AM.inhib(m.team);
    else if (m.kind === 'nexus') m.model = AM.nexus(m.team);
    m.model.root.position.set(m.x, 0, m.z); scene.add(m.model.root);
  }
  function removeModel(m) { if (m.model) scene.remove(m.model.root); m.model = null; }
  const H = { champ: 3.2, minion: 2, monster: 2.6, tower: 8, inhib: 3.6, nexus: 7.5 };
  function heightOf(m) { if (m.kind === 'monster') return m.sub === 'coloso' ? 8 : m.sub === 'dragon' ? 5 : m.lvl ? 3.4 : 2; if (m.kind === 'minion') return m.sub === 3 ? 3 : m.sub === 2 ? 2.4 : 2; return H[m.kind]; }

  /* ───── efectos visuales ───── */
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  function sprite(color, size, add = true) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending })); s.scale.setScalar(size); return s; }
  function particle(x, y, z, o) {
    if (ST.parts.length > 500) return; const s = sprite(o.color, o.size || 1, o.add !== false); s.position.set(x, y, z); scene.add(s);
    ST.parts.push({ s, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life || .8, max: o.life || .8, grow: o.grow || 0, g: o.g || 0, op: o.op ?? 1 });
  }
  function burst(x, z, color, n = 14, r = 1.5, y = 1) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = Math.random() * r * 3; particle(x, y, z, { color, size: .6 + Math.random() * r, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: Math.random() * 4, life: .5 + Math.random() * .4, grow: 1 }); } }
  function explosion(x, z, r = 1.5) { burst(x, z, 0xff8a2a, 18, r, .8); for (let i = 0; i < 8; i++) particle(x + (Math.random() - .5) * r, .8, z + (Math.random() - .5) * r, { color: 0x333333, add: false, size: r * 1.6, vy: 2, life: 1.4, grow: r, op: .7 }); SND.play('boom', vol(x, z) * Math.min(1, r / 2)); }
  /** decal en el piso: círculo de aviso, llamas, jardín… */
  function decal(x, z, r, color, dur, o = {}) {
    const g = new THREE.Group(); g.position.set(x, .12, z);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(r, 36), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o.fill ?? .25, depthWrite: false })); fill.rotation.x = -Math.PI / 2; g.add(fill);
    const edge = new THREE.Mesh(new THREE.RingGeometry(r * .93, r, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, depthWrite: false })); edge.rotation.x = -Math.PI / 2; edge.position.y = .01; g.add(edge);
    scene.add(g); ST.fx.push({ obj: g, life: dur, max: dur, kind: o.kind || 'decal', x, z, r, color, grow: o.grow }); return g;
  }
  function attachFx(id, obj, dur, y = 0) { scene.add(obj); ST.fx.push({ obj, life: dur, max: dur, kind: 'attach', id, y }); }
  const PROJ_VIS = { fireball: [0xff7a2a, 2.2], fire: [0xff8a3a, 1], bolt: [0xffffff, .9], small: [0xffe08a, .6], tower: [0xffffff, 1.8], orb: [0xffffff, 1.2], seed: [0x7aff6a, 1.2], leaf: [0xff8ab8, .9], shuriken: [0xd8c8ff, 1.3], arrow: [0xfff0c0, .7], bigarrow: [0xffd04a, 2.6] };
  function spawnProj(e) {
    const [color, size] = PROJ_VIS[e.v] || [0xffffff, 1];
    let c = e.v === 'bolt' || e.v === 'tower' ? (e.tm === ST.team ? 0x8fd0ff : 0xff9a8a) : color;
    const obj = new THREE.Group(), s = sprite(c, size); obj.add(s);
    if (e.v === 'arrow' || e.v === 'bigarrow') { const shaft = new THREE.Mesh(new THREE.BoxGeometry(.08 * size * 2, .08 * size * 2, 1.4 * size), AM.mat(e.v === 'bigarrow' ? 0xffd04a : 0xe0d0b0)); obj.add(shaft); }
    if (e.v === 'shuriken') { const st = new THREE.Mesh(new THREE.OctahedronGeometry(.45, 0), AM.mat(0xe0e0f0, { metalness: .7, roughness: .2 })); st.scale.set(1, .2, 1); obj.add(st); obj.userData.spin = st; }
    let x, z; if (e.t === 'p') { x = e.x; z = e.z; } else { const f = ST.ents.get(e.from); if (!f) return; x = f.x; z = f.z; }
    obj.position.set(x, 1.3, z); scene.add(obj);
    ST.projs.set(e.id, { obj, e, x, z, d: 0 });
  }
  function updProjs(dt) {
    for (const [id, p] of ST.projs) {
      const e = p.e;
      if (e.t === 'p') { const st = e.s * dt; p.x += e.dx * st; p.z += e.dz * st; p.d += st; if (p.d > e.r + 1) { scene.remove(p.obj); ST.projs.delete(id); continue; } p.obj.rotation.y = Math.atan2(e.dx, e.dz); }
      else { const t = ST.ents.get(e.to); if (!t) { scene.remove(p.obj); ST.projs.delete(id); continue; } const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz), st = e.s * dt; if (d < st) { p.x = t.x; p.z = t.z; } else { p.x += dx / d * st; p.z += dz / d * st; } p.obj.rotation.y = Math.atan2(dx, dz); }
      p.obj.position.set(p.x, 1.3, p.z); if (p.obj.userData.spin) p.obj.userData.spin.rotation.y += dt * 20;
      if (e.v === 'fireball' && Math.random() < .5) particle(p.x, 1.3, p.z, { color: 0xff6a1a, size: 1, life: .35, grow: -1 });
      if (e.v === 'bigarrow' && Math.random() < .7) particle(p.x, 1.3, p.z, { color: 0xffd04a, size: 1.2, life: .4 });
    }
  }
  const vol = (x, z) => clamp(1 - Math.hypot(x - ST.tgt.x, z - ST.tgt.z) / 45, 0, 1);
  function floatText(x, z, text, color, size = 15, y = 3) { ST.floats.push({ x, z, y, text, color, size, life: 1.1 }); }
  function pushFeed(html) { const d = document.createElement('div'); d.innerHTML = html; $('#feed').prepend(d); setTimeout(() => d.remove(), 7000); while ($('#feed').children.length > 5) $('#feed').lastChild.remove(); }
  let bannerT; function banner(m, ms = 2400) { const b = $('#banner'); b.textContent = m; b.hidden = false; clearTimeout(bannerT); bannerT = setTimeout(() => b.hidden = true, ms); }
  const nameOf = id => { const c = ST.champs.get(id); return c ? `<b class="${c.tm === 0 ? 'blue' : 'red'}">${esc(c.n)}</b>` : '¿?'; };

  function handleEvents(list) {
    for (const e of list) {
      const u = e.id != null ? ST.ents.get(e.id) : null;
      switch (e.t) {
        case 'p': case 'ph': spawnProj(e); if (e.t === 'p') SND.play('cast', vol(e.x, e.z) * .6); break;
        case 'pe': { const p = ST.projs.get(e.id); if (p) { scene.remove(p.obj); ST.projs.delete(e.id); if (p.e.v === 'fireball') explosion(p.x, p.z, 1); else burst(p.x, p.z, (PROJ_VIS[p.e.v] || [0xffffff])[0], 5, .5, 1.3); } break; }
        case 'atk': if (u) u.atk = .35; break;
        case 'swing': if (u) { SND.play('swing', vol(u.x, u.z) * .5); } break;
        case 'cast': if (u) { u.cast = .4; SND.play('cast', vol(u.x, u.z) * .7); } break;
        case 'dmg': if (u && (e.s === ST.team || u.team === ST.team || u.id === ST.me)) { const own = u.id === ST.me, col = e.ty === 2 ? '#ffffff' : e.ty === 1 ? '#c08aff' : own ? '#ff5a5a' : '#ffb04a'; if (u.kind === 'champ' || e.n >= 40 || e.c) floatText(u.x + (Math.random() - .5), u.z, (e.c ? '¡' + e.n + '!' : e.n), col, e.c ? 20 : u.kind === 'champ' ? 15 : 12); if (u.kind !== 'tower') SND.play('hit', vol(u.x, u.z) * .35); } break;
        case 'heal': if (u && u.team === ST.team) floatText(u.x, u.z, '+' + e.n, '#6aff8a', 14); break;
        case 'gold': if (e.id === ST.me) { floatText(e.x, e.z, '+' + e.n + ' oro', '#ffd04a', 13, 2); SND.play('coin', .7); } break;
        case 'lvl': if (u) { const r = decal(u.x, u.z, 1.8, 0xffd04a, .8, { kind: 'grow' }); burst(u.x, u.z, 0xffd04a, 10, .6, 1); if (e.id === ST.me) { SND.play('level'); toast(`¡Nivel ${e.l}!` + (ST.champs.get(ST.me) && !ST.champs.get(ST.me).auto ? ' Subí una habilidad con Ctrl + Q/W/E/R o con el +' : ''), 1800); } } break;
        case 'fx': fxEvent(e, u); break;
        case 'st': if (u && e.k === 'stun') burst(u.x, u.z, 0xffe08a, 6, .4, 3); break;
        case 'dash': if (u) burst(u.x, u.z, 0xffffff, 6, .5, 1); break;
        case 'blink': burst(e.x0, e.z0, 0xd8c8ff, 10, .8, 1.2); burst(e.x, e.z, 0xd8c8ff, 10, .8, 1.2); break;
        case 'recall': break;
        case 'recalled': if (u) burst(u.x, u.z, 0x6ab0ff, 16, 1, 1.5); break;
        case 'die': { const m = ST.ents.get(e.id); if (m) { if (m.kind === 'champ' || m.kind === 'monster') { burst(e.x, e.z, m.kind === 'champ' ? 0xffffff : 0xa0ff80, 16, 1.2, 1.5); } else if (m.kind === 'minion') burst(e.x, e.z, TEAM[m.team], 6, .5, .8); else explosion(e.x, e.z, 3); if (m.kind === 'champ' || m.kind === 'minion' || m.kind === 'monster') { m.visible = false; if (m.kind !== 'champ') { removeModel(m); ST.ents.delete(e.id); } } } break; }
        case 'kill': {
          const killer = e.k > 0 ? nameOf(e.k) : e.src === 'tower' ? 'Una torre' : e.src === 'minion' ? 'Los minions' : 'El entorno';
          pushFeed(`${killer} ⚔ ${nameOf(e.v)}${e.a && e.a.length ? ` <small>(+${e.a.length})</small>` : ''}`);
          if (e.v === ST.me) { banner('Te mataron'); SND.play('death'); } else if (e.k === ST.me) { banner('¡Asesinaste a ' + (ST.champs.get(e.v) || {}).n + '!'); } else if (e.a && e.a.includes(ST.me)) toast('Asistencia', 1200);
          break;
        }
        case 'msg': if (e.big) banner(e.m, 3000); else pushFeed(esc(e.m)); break;
        case 'feed': pushFeed(esc(e.m)); break;
        case 'epic': banner(e.k === 'dragon' ? (e.team === ST.team ? '¡Tu equipo mató al Dragón!' : 'El enemigo mató al Dragón') : (e.team === ST.team ? '¡Tu equipo venció al Coloso!' : 'El enemigo venció al Coloso'), 3000); break;
        case 'buy': if (e.id === ST.me) SND.play('coin'); break;
        case 'win': endGame(e.team); break;
        case 'respawn': break;
      }
    }
  }
  function fxEvent(e, u) {
    const tc = e.tm === ST.team ? 0x4aa3ff : 0xff5a4a;
    switch (e.k) {
      case 'circle': decal(e.x, e.z, e.r, tc, e.d + .2); break;
      case 'flames': decal(e.x, e.z, e.r, 0xff6a1a, e.d, { fill: .3 }); setTimeout(() => { for (let i = 0; i < 18; i++) { const a = Math.random() * 6.28, r = Math.random() * e.r; particle(e.x + Math.cos(a) * r, .4, e.z + Math.sin(a) * r, { color: i % 2 ? 0xff7a1a : 0xffd04a, size: 1.4, vy: 6 + Math.random() * 4, life: .7, grow: -1 }); } SND.play('boom', vol(e.x, e.z) * .5); }, e.d * 1000); break;
      case 'meteor': decal(e.x, e.z, e.r, 0xff6a1a, e.d, { fill: .18 }); for (let i = 0; i < 4; i++) { const a = Math.random() * 6.28, r = Math.random() * e.r * .8, x = e.x + Math.cos(a) * r, z = e.z + Math.sin(a) * r; const s = sprite(0xff8a2a, 2.2); s.position.set(x - 6, 22, z - 6); scene.add(s); ST.fx.push({ obj: s, life: e.d, max: e.d, kind: 'fall', from: [x - 6, 22, z - 6], to: [x, .5, z] }); } setTimeout(() => explosion(e.x, e.z, e.r * .6), e.d * 1000); break;
      case 'quake': case 'quake_big': decal(e.x, e.z, e.r, 0xc8a070, .5 + (e.d || 0), { kind: 'grow', fill: .35 }); setTimeout(() => { burst(e.x, e.z, 0xb8a080, 22, e.r * .5, .5); SND.play('boom', vol(e.x, e.z)); }, (e.d || 0) * 1000); break;
      case 'garden': { const g = decal(e.x, e.z, e.r, 0x5fe07a, e.d, { fill: .22 }); for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28, r = Math.random() * e.r; const f = new THREE.Mesh(new THREE.ConeGeometry(.25, .6, 5), AM.mat(i % 2 ? 0xff4f8b : 0xffd04a)); f.position.set(Math.cos(a) * r, .3, Math.sin(a) * r); g.add(f); } break; }
      case 'boom': explosion(e.x, e.z, e.r || 1.5); break;
      case 'impact': burst(e.x, e.z, 0xd8c8a0, 12, .9, 1); SND.play('boom', vol(e.x, e.z) * .6); break;
      case 'smoke': for (let i = 0; i < 10; i++) particle(e.x + (Math.random() - .5) * 2, 1, e.z + (Math.random() - .5) * 2, { color: 0x999999, add: false, size: 2, vy: 1.5, life: 1, grow: 2, op: .6 }); break;
      case 'shield': if (u) { const b = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 10), new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: .22, depthWrite: false })); attachFx(u.id, b, e.d, 1.3); } break;
      case 'heal': case 'healspell': case 'potion': if (u) for (let i = 0; i < (e.k === 'potion' ? 5 : 12); i++) particle(u.x + (Math.random() - .5) * 1.6, .5 + Math.random(), u.z + (Math.random() - .5) * 1.6, { color: e.k === 'potion' ? 0xff6a6a : 0x6aff8a, size: .6, vy: 3, life: .9 }); break;
      case 'flash': break;
      case 'mark': if (u) { const r = new THREE.Mesh(new THREE.TorusGeometry(1.4, .12, 6, 24), new THREE.MeshBasicMaterial({ color: 0xff3a6a })); r.rotation.x = Math.PI / 2; attachFx(u.id, r, e.d, .15); } break;
      case 'rage': if (u) { const r = new THREE.Mesh(new THREE.RingGeometry(1, 1.4, 24), new THREE.MeshBasicMaterial({ color: 0xff4a2a, transparent: true, opacity: .6, side: THREE.DoubleSide, depthWrite: false })); r.rotation.x = -Math.PI / 2; attachFx(u.id, r, e.d, .1); } break;
    }
  }
  function updFx(dt) {
    for (let i = ST.parts.length - 1; i >= 0; i--) { const p = ST.parts[i]; p.life -= dt; p.vy -= p.g * dt; p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt; p.s.scale.addScalar(p.grow * dt); if (p.s.scale.x < .05) p.s.scale.setScalar(.05); p.s.material.opacity = Math.max(0, p.life / p.max) * p.op; if (p.life <= 0) { scene.remove(p.s); p.s.material.dispose(); ST.parts.splice(i, 1); } }
    for (let i = ST.fx.length - 1; i >= 0; i--) {
      const f = ST.fx[i]; f.life -= dt; const k = 1 - f.life / f.max;
      if (f.kind === 'grow') f.obj.scale.setScalar(.3 + k * .9);
      if (f.kind === 'fall') f.obj.position.set(lerp(f.from[0], f.to[0], k), lerp(f.from[1], f.to[1], k), lerp(f.from[2], f.to[2], k));
      if (f.kind === 'attach') { const u = ST.ents.get(f.id); if (u && u.visible) { f.obj.visible = true; f.obj.position.set(u.x, f.y, u.z); } else f.obj.visible = false; }
      if (f.kind === 'decal' || f.kind === 'grow') f.obj.children.forEach(c => { if (c.material && c.material.opacity != null) c.material.opacity = (c.geometry.type === 'RingGeometry' ? .8 : .28) * Math.min(1, f.life * 3); });
      if (f.life <= 0) { scene.remove(f.obj); ST.fx.splice(i, 1); }
    }
  }

  /* ───── cámara y punto bajo el mouse ───── */
  function updateCamera(dt) {
    const me = ST.ents.get(ST.me);
    if ((S.camLock || ST.center || TOUCH) && me && me.visible) { ST.tgt.x = lerp(ST.tgt.x, me.x, 1 - Math.exp(-dt * 10)); ST.tgt.z = lerp(ST.tgt.z, me.z, 1 - Math.exp(-dt * 10)); }
    else if (!TOUCH && ST.mouse.inside && ST.mode === 'game' && !document.querySelector('.screen:not([hidden])')) { // mover la cámara con los bordes
      const m = 14, sp = 45 * dt * ST.zoom; if (ST.mouse.x < m) ST.tgt.x -= sp; if (ST.mouse.x > innerWidth - m) ST.tgt.x += sp; if (ST.mouse.y < m) ST.tgt.z -= sp; if (ST.mouse.y > innerHeight - m) ST.tgt.z += sp;
    }
    if (ST.keys.ArrowLeft) ST.tgt.x -= 40 * dt; if (ST.keys.ArrowRight) ST.tgt.x += 40 * dt; if (ST.keys.ArrowUp) ST.tgt.z -= 40 * dt; if (ST.keys.ArrowDown) ST.tgt.z += 40 * dt;
    ST.tgt.x = clamp(ST.tgt.x, 8, 192); ST.tgt.z = clamp(ST.tgt.z, 8, 192);
    const z = ST.zoom * (TOUCH ? .92 : 1);
    camera.position.set(ST.tgt.x, 34 * z, ST.tgt.z + 21 * z); camera.lookAt(ST.tgt.x, 0, ST.tgt.z + 1.5);
    sun.position.set(ST.tgt.x - 30, 60, ST.tgt.z + 20); sun.target.position.set(ST.tgt.x, 0, ST.tgt.z);
  }
  const _ray = new THREE.Raycaster(), _v2 = new THREE.Vector2();
  function groundAt(sx, sy) {
    _v2.set(sx / innerWidth * 2 - 1, -(sy / innerHeight) * 2 + 1); _ray.setFromCamera(_v2, camera);
    const o = _ray.ray.origin, d = _ray.ray.direction; if (Math.abs(d.y) < 1e-4) return null; const t = -o.y / d.y; return { x: o.x + d.x * t, z: o.z + d.z * t, ray: _ray.ray };
  }
  /** la unidad bajo el cursor: distancia del rayo a su "cuerpo" */
  const _p = new THREE.Vector3();
  function pickAt(sx, sy, filter) {
    const g = groundAt(sx, sy); if (!g) return null; let best = null, bd = 1e9;
    for (const m of ST.ents.values()) {
      if (!m.visible || !m.model || (m.flags & 64)) continue; if (filter && !filter(m)) continue;
      const r = m.kind === 'champ' ? 1.6 : m.kind === 'tower' || m.kind === 'nexus' ? 3 : m.kind === 'inhib' ? 2.4 : m.kind === 'monster' ? (m.lvl ? 2.2 : 1.3) : 1.1;
      _p.set(m.x, heightOf(m) * .45, m.z); const d = g.ray.distanceToPoint(_p);
      const score = d - (m.kind === 'champ' ? .6 : 0); if (d < r && score < bd) { bd = score; best = m; }
    }
    return best;
  }

  /* ───── indicadores al apuntar ───── */
  const ind = new THREE.Group(); ind.visible = false; scene.add(ind);
  const indMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: .3, depthWrite: false }), indEdge = new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: .7, depthWrite: false });
  const rangeRing = new THREE.Mesh(new THREE.RingGeometry(.97, 1, 64), indEdge); rangeRing.rotation.x = -Math.PI / 2; ind.add(rangeRing);
  const rect = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), indMat); rect.rotation.x = -Math.PI / 2; ind.add(rect);
  const spot = new THREE.Mesh(new THREE.CircleGeometry(1, 36), indMat); spot.rotation.x = -Math.PI / 2; ind.add(spot);
  const fan = new THREE.Mesh(new THREE.CircleGeometry(1, 24, 0, 1), indMat); fan.rotation.x = -Math.PI / 2; ind.add(fan);
  const atkRing = new THREE.Mesh(new THREE.RingGeometry(.97, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .25, depthWrite: false })); atkRing.rotation.x = -Math.PI / 2; atkRing.visible = false; scene.add(atkRing);
  function myDef() { const me = ST.ents.get(ST.me); return me ? A.CHAMPS[me.sub] : null; }
  function aimPoint() { return TOUCH && ST.touchAim ? ST.touchAim : { x: ST.mouse.gx, z: ST.mouse.gz }; }
  function updIndicator() {
    const me = ST.ents.get(ST.me), def = myDef(); ind.visible = false;
    if (!me || !def || ST.aim < 0 || !me.visible) return;
    const ab = def.abilities[ST.aim]; if (!ab) return; ind.visible = true; ind.position.set(me.x, .14, me.z);
    const p = aimPoint(), dx = p.x - me.x, dz = p.z - me.z, d = Math.hypot(dx, dz) || 1, ang = Math.atan2(dx, dz);
    rangeRing.scale.setScalar(Math.min(ab.range, 40)); rangeRing.visible = ab.range > 0 && ab.range < 40;
    rect.visible = spot.visible = fan.visible = false;
    if (ab.type === 'skillshot' && ab.fan) { fan.visible = true; fan.geometry.dispose(); fan.geometry = new THREE.CircleGeometry(ab.range, 24, -ab.fan / 2, ab.fan); fan.rotation.set(-Math.PI / 2, 0, ang - Math.PI / 2 + Math.PI); fan.rotation.z = -ang + Math.PI / 2; }
    else if (ab.type === 'skillshot' || (ab.type === 'dash' && !ab.radius)) { const L = ab.type === 'dash' ? Math.min(d, ab.range) : Math.min(ab.range, 60); rect.visible = true; rect.scale.set(ab.w || 1, L, 1); rect.rotation.set(-Math.PI / 2, 0, ang + Math.PI); rect.position.set(Math.sin(ang) * L / 2, 0, Math.cos(ang) * L / 2); }
    else if (ab.type === 'ground') { const k = Math.min(1, ab.range / d); spot.visible = true; spot.scale.setScalar(ab.radius || 2); spot.position.set(dx * k, 0, dz * k); }
    else if (ab.type === 'self') { spot.visible = !!ab.radius || ab.range > 0; spot.scale.setScalar(ab.radius || ab.range || 1); spot.position.set(0, 0, 0); }
    else if (ab.type === 'target' || ab.type === 'ally') { spot.visible = false; }
  }

  /* ───── órdenes ───── */
  function send(o) { if (ST.net) ST.net.input(o); }
  function castAt(s, x, z, forceId) {
    const def = myDef(); if (!def) return; const ab = def.abilities[s];
    let id = forceId;
    if (!id && (ab.type === 'target' || ab.type === 'ally')) { const h = ST.hover; if (h && (ab.type === 'target' ? h.team !== ST.team : h.team === ST.team)) id = h.id; }
    send({ t: 'cast', s, x, z, id });
  }
  function clickMark(x, z, color) { const r = decal(x, z, .7, color, .45, { kind: 'grow', fill: .1 }); }
  function rightClick(sx, sy) {
    const g = groundAt(sx, sy); if (!g) return;
    const u = pickAt(sx, sy, m => m.team !== ST.team && !(m.flags & 1024));
    if (u) { send({ t: 'attack', id: u.id }); clickMark(u.x, u.z, 0xff4a4a); }
    else { send({ t: 'move', x: g.x, z: g.z }); clickMark(g.x, g.z, 0x6aff8a); }
  }
  function nearestEnemy(range, champsFirst = true) {
    const me = ST.ents.get(ST.me); if (!me) return null; let best = null, bd = 1e9;
    for (const m of ST.ents.values()) { if (!m.visible || m.team === ST.team || (m.flags & 64) || (m.flags & 1024)) continue; const d = Math.hypot(m.x - me.x, m.z - me.z); if (d > range) continue; const score = d - (champsFirst && m.kind === 'champ' ? 100 : 0) + (m.kind === 'tower' || m.kind === 'inhib' || m.kind === 'nexus' ? 30 : 0); if (score < bd) { bd = score; best = m; } }
    return best;
  }

  /* ───── teclado y mouse (PC) ───── */
  const ABK = { KeyQ: 0, KeyW: 1, KeyE: 2, KeyR: 3 };
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    SND.init(); ST.keys[e.code] = true;
    if (ST.mode !== 'game') return;
    if (e.code === 'Escape') { if (ST.aim >= 0) { ST.aim = -1; return; } if (!$('#sShop').hidden) { closeShop(); return; } toggleMenu(); return; }
    if (!$('#sMenu').hidden || !$('#sEnd').hidden) return;
    if (e.code in ABK) { if (e.ctrlKey || e.metaKey) { send({ t: 'level', s: ABK[e.code] }); e.preventDefault(); return; } if (!e.repeat) ST.aim = ABK[e.code]; e.preventDefault(); return; }
    switch (e.code) {
      case 'KeyD': send({ t: 'spell', s: 0, x: ST.mouse.gx, z: ST.mouse.gz }); break;
      case 'KeyF': send({ t: 'spell', s: 1, x: ST.mouse.gx, z: ST.mouse.gz }); break;
      case 'KeyA': ST.amove = true; send({ t: 'amove', x: ST.mouse.gx, z: ST.mouse.gz }); clickMark(ST.mouse.gx, ST.mouse.gz, 0xffb04a); break;
      case 'KeyS': send({ t: 'stop' }); break;
      case 'KeyB': send({ t: 'recall' }); break;
      case 'Digit1': case 'Digit2': send({ t: 'use' }); break;
      case 'KeyP': toggleShop(); break;
      case 'Tab': ST.board = true; renderBoard(); $('#sBoard').hidden = false; e.preventDefault(); break;
      case 'KeyY': S.camLock = !S.camLock; saveS(); toast(S.camLock ? 'Cámara fija en tu campeón' : 'Cámara libre: mové el mouse a los bordes', 1500); break;
      case 'Space': ST.center = true; e.preventDefault(); break;
      case 'Enter': if (ST.online) openChat(); break;
    }
  });
  addEventListener('keyup', e => {
    ST.keys[e.code] = false; if (ST.mode !== 'game') return;
    if (e.code in ABK && ST.aim === ABK[e.code]) { const p = aimPoint(); castAt(ST.aim, p.x, p.z); ST.aim = -1; }
    if (e.code === 'Tab') { ST.board = false; $('#sBoard').hidden = true; }
    if (e.code === 'Space') ST.center = false;
  });
  addEventListener('blur', () => { ST.keys = {}; ST.aim = -1; ST.center = false; ST.board = false; $('#sBoard').hidden = true; });
  const cv = $('#c');
  cv.addEventListener('contextmenu', e => e.preventDefault());
  let rmb = false, rmbT = 0;
  cv.addEventListener('mousemove', e => { ST.mouse.x = e.clientX; ST.mouse.y = e.clientY; ST.mouse.inside = true; });
  document.addEventListener('mouseleave', () => ST.mouse.inside = false);
  cv.addEventListener('mousedown', e => {
    SND.init(); if (ST.mode !== 'game') return;
    if (e.button === 2) { if (ST.aim >= 0) { ST.aim = -1; return; } rmb = true; rmbT = 0; rightClick(e.clientX, e.clientY); }
    else if (e.button === 0) { if (ST.aim >= 0) { const p = aimPoint(); castAt(ST.aim, p.x, p.z); ST.aim = -1; } }
  });
  addEventListener('mouseup', e => { if (e.button === 2) rmb = false; });
  cv.addEventListener('wheel', e => { ST.zoom = clamp(ST.zoom * (e.deltaY > 0 ? 1.08 : .93), .7, 1.35); }, { passive: true });

  /* ───── controles táctiles ───── */
  const joy = { x: 0, y: 0, on: false };
  if (TOUCH) {
    const J = $('#joy'), knob = J.firstElementChild; let jid = null;
    const jm = e => { const r = J.getBoundingClientRect(), R = r.width / 2; let dx = e.clientX - r.left - R, dy = e.clientY - r.top - R; const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; } joy.x = dx / R; joy.y = dy / R; knob.style.transform = `translate(${dx}px,${dy}px)`; };
    J.addEventListener('pointerdown', e => { SND.init(); jid = e.pointerId; J.setPointerCapture(jid); joy.on = true; jm(e); });
    J.addEventListener('pointermove', e => { if (e.pointerId === jid) jm(e); });
    const je = () => { jid = null; joy.on = false; joy.x = joy.y = 0; knob.style.transform = ''; send({ t: 'stop' }); }; J.addEventListener('pointerup', je); J.addEventListener('pointercancel', je);
    $$('#tAct button').forEach(b => {
      const k = b.dataset.tk; let st = null;
      b.addEventListener('pointerdown', e => { e.preventDefault(); SND.init(); b.setPointerCapture(e.pointerId); st = { x: e.clientX, y: e.clientY, aiming: false }; if (k === 'atk') { ST.atkHold = true; autoAttack(); } if (/^[0-3]$/.test(k)) { ST.aim = +k; ST.touchAim = null; } });
      b.addEventListener('pointermove', e => { if (!st || !/^[0-3]$/.test(k)) return; const dx = e.clientX - st.x, dy = e.clientY - st.y, d = Math.hypot(dx, dy); if (d > 16) { st.aiming = true; const me = ST.ents.get(ST.me), ab = myDef().abilities[+k]; if (!me) return; const L = ab.type === 'self' ? 0 : Math.min(ab.range > 40 ? 30 : ab.range, d / 70 * ab.range); ST.touchAim = { x: me.x + dx / d * L, z: me.z + dy / d * L }; } });
      const up = () => {
        if (!st) return; const s0 = st; st = null;
        if (k === 'atk') { ST.atkHold = false; return; }
        if (/^[0-3]$/.test(k)) { const s = +k; if (s0.aiming && ST.touchAim) castAt(s, ST.touchAim.x, ST.touchAim.z); else autoCast(s); ST.aim = -1; ST.touchAim = null; return; }
        const me = ST.ents.get(ST.me); if (!me) return; const dir = joy.on ? [joy.x, joy.y] : [Math.sin(me.f || 0), Math.cos(me.f || 0)];
        if (k === 'd') send({ t: 'spell', s: 0, x: me.x + dir[0] * 5, z: me.z + dir[1] * 5 }); if (k === 'f') send({ t: 'spell', s: 1, x: me.x, z: me.z }); if (k === 'b') send({ t: 'recall' });
      };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', () => { st = null; ST.aim = -1; ST.atkHold = false; });
    });
    $$('#tTop button').forEach(b => b.addEventListener('click', () => { const k = b.dataset.tk; if (k === 'menu') toggleMenu(); if (k === 'shop') toggleShop(); if (k === 'board') { ST.board = !ST.board; renderBoard(); $('#sBoard').hidden = !ST.board; } if (k === 'pot') send({ t: 'use' }); }));
    $('#sBoard').addEventListener('click', () => { if (TOUCH) { ST.board = false; $('#sBoard').hidden = true; } });
  }
  function autoAttack() { const me = ST.ents.get(ST.me); if (!me) return; const c = ST.champs.get(ST.me); const rng = (A.CHAMPS[me.sub].stats.range) + 4; const t = nearestEnemy(rng); if (t) send({ t: 'attack', id: t.id }); }
  function autoCast(s) {
    const me = ST.ents.get(ST.me), ab = myDef().abilities[s]; if (!me) return;
    if (ab.type === 'self') return castAt(s, me.x, me.z);
    if (ab.type === 'ally') { let best = null, bh = 2; for (const m of ST.ents.values()) { if (m.kind !== 'champ' || m.team !== ST.team || !m.visible) continue; if (Math.hypot(m.x - me.x, m.z - me.z) > ab.range) continue; const h = m.hp / m.maxHp; if (h < bh) { bh = h; best = m; } } return castAt(s, (best || me).x, (best || me).z, (best || me).id); }
    const t = nearestEnemy(Math.min(ab.range * 1.1, 30));
    if (t) return castAt(s, t.x, t.z, t.id);
    const dir = joy.on ? [joy.x, joy.y] : [Math.sin(me.f || 0), Math.cos(me.f || 0)]; castAt(s, me.x + dir[0] * Math.min(ab.range, 8), me.z + dir[1] * Math.min(ab.range, 8));
  }
  let touchT = 0;
  function touchTick(dt) {
    if (!TOUCH || ST.mode !== 'game') return; touchT -= dt; if (touchT > 0) return; touchT = .12;
    const me = ST.ents.get(ST.me); if (!me || !me.visible) return;
    if (joy.on && Math.hypot(joy.x, joy.y) > .2) send({ t: 'move', x: me.x + joy.x * 4, z: me.z + joy.y * 4 });
    else if (ST.atkHold) autoAttack();
  }

  /* ───── HUD ───── */
  function buildHud() {
    const me = ST.ents.get(ST.me), def = myDef(); if (!def) return;
    const face = $('#face').getContext('2d'); face.clearRect(0, 0, 96, 96); face.drawImage(AM.portrait(renderer, def.key), 0, 0, 96, 96);
    $('#abil').innerHTML = def.abilities.map((ab, i) => `<button class="abtn" data-ab="${i}" title="${esc(ab.key + ' · ' + ab.name + ': ' + ab.desc)}"><canvas width="96" height="96"></canvas><span class="k">${ab.key}</span><div class="cd" hidden></div><div class="pips">${'<i></i>'.repeat(i === 3 ? 3 : 5)}</div><span class="up" data-up="${i}" hidden>+</span></button>`).join('');
    $$('#abil .abtn').forEach((b, i) => AM.icon(b.querySelector('canvas'), def.key, i));
    $('#spells').innerHTML = ['Destello (D): salto corto hacia el cursor', 'Curar (F): cura y acelera a vos y a un aliado cerca'].map((t, i) => `<button class="abtn" data-sp="${i}" title="${t}"><canvas width="64" height="64"></canvas><span class="k">${'DF'[i]}</span><div class="cd" hidden></div></button>`).join('');
    $$('#spells .abtn').forEach((b, i) => AM.spellIcon(b.querySelector('canvas'), i));
    $$('#tAct .ab').forEach((b, i) => { b.innerHTML = `<canvas width="64" height="64" style="width:100%;height:100%;border-radius:50%"></canvas><span class="tcd" hidden></span>`; AM.icon(b.querySelector('canvas'), def.key, i); });
  }
  document.addEventListener('click', e => {
    const up = e.target.closest('[data-up]'); if (up) { e.stopPropagation(); send({ t: 'level', s: +up.dataset.up }); return; }
    const ab = e.target.closest('#abil [data-ab]'); if (ab && ST.mode === 'game') { if (TOUCH) autoCast(+ab.dataset.ab); else ST.aim = +ab.dataset.ab; return; }
    const sp = e.target.closest('#spells [data-sp]'); if (sp) { send({ t: 'spell', s: +sp.dataset.sp, x: ST.mouse.gx, z: ST.mouse.gz }); return; }
  });
  const fmtT = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function updHud() {
    const snap = ST.snap; if (!snap) return; const c = ST.champs.get(ST.me); if (!c) return; const def = A.CHAMPS[c.ch];
    if (!$('#abil').children.length) buildHud();
    $('#kB').textContent = snap.s.k[0]; $('#kR').textContent = snap.s.k[1]; $('#clock').textContent = fmtT(snap.t);
    $('#drag').textContent = (snap.s.dr[0] || snap.s.dr[1] ? `🐉 ${snap.s.dr[0]}-${snap.s.dr[1]}` : '') + (snap.s.col[ST.team] ? ' · Coloso' : '');
    $('#lvl').textContent = c.lv; $('#xp i').style.width = (c.xpn ? c.xp / c.xpn * 100 : 100) + '%';
    $('#hpbar i').style.width = (c.hp / c.mhp * 100) + '%'; $('#hpbar span').textContent = `${Math.max(0, c.hp)} / ${c.mhp}`;
    $('#mpbar i').style.width = (c.mmp ? c.mp / c.mmp * 100 : 0) + '%'; $('#mpbar span').textContent = `${c.mp} / ${c.mmp}`;
    $('#goldN').textContent = c.g;
    $('#stats').innerHTML = `<span>ATQ</span><b>${c.ad}</b><span>POD</span><b>${c.ap}</b><span>ARM</span><b>${c.ar}</b><span>RM</span><b>${c.mr}</b><span>VA</span><b>${c.as}</b><span>VM</span><b>${Math.round(c.ms * 75)}</b>`;
    $$('#abil .abtn').forEach((b, i) => {
      const ab = def.abilities[i], rk = c.rk[i], cd = c.cd[i], cost = ab.cost ? ab.cost[Math.max(0, rk - 1)] : 0;
      b.classList.toggle('off', rk === 0); b.classList.toggle('nomana', rk > 0 && c.mp < cost);
      const d = b.querySelector('.cd'); d.hidden = !(cd > 0); if (cd > 0) d.textContent = cd >= 10 ? Math.ceil(cd) : cd.toFixed(1);
      b.querySelectorAll('.pips i').forEach((p, j) => p.classList.toggle('on', j < rk));
      const canUp = c.pts > 0 && (i === 3 ? rk < 3 && c.lv >= [6, 11, 16][rk] : rk < 5 && rk < Math.ceil(c.lv / 2)); b.querySelector('.up').hidden = !canUp;
    });
    $$('#spells .abtn').forEach((b, i) => { const d = b.querySelector('.cd'); d.hidden = !(c.sp[i] > 0); d.textContent = c.sp[i]; });
    $$('#tAct .ab').forEach((b, i) => { const t = b.querySelector('.tcd'); if (!t) return; const cd = c.cd[i], rk = c.rk[i]; t.hidden = !(cd > 0 || rk === 0); t.textContent = rk === 0 ? '·' : cd >= 10 ? Math.ceil(cd) : cd.toFixed(1); });
    $('#items').innerHTML = Array.from({ length: 6 }, (_, i) => { const k = c.it[i]; return k ? `<div style="background:${AM.ITEM_COLOR[k]}" title="${esc(A.ITEMS[k].name + ': ' + A.ITEMS[k].desc)}">${AM.ITEM_ABBR(k)}${k === 'pocion' ? `<small>${c.pot}</small>` : ''}</div>` : '<div></div>'; }).join('');
    $('#dead').hidden = !c.dead; $('#deadT').textContent = c.rs;
    $('#recallBar').hidden = !c.rec; if (c.rec) $('#recallBar i').style.width = (100 - c.rec / 8 * 100) + '%';
    if (!$('#sShop').hidden) renderShop();
    if (ST.board) renderBoard();
  }

  /* ───── tienda ───── */
  function toggleShop() { if ($('#sShop').hidden) { renderShop(); $('#sShop').hidden = false; } else closeShop(); }
  function closeShop() { $('#sShop').hidden = true; }
  function renderShop() {
    const c = ST.champs.get(ST.me); if (!c) return; const def = A.CHAMPS[c.ch];
    $('#shopGold').textContent = `· ${c.g} de oro`; $('#shopNote').textContent = c.shop ? 'Estás en tu base: podés comprar y vender.' : 'Solo se compra en tu base (o mientras estás muerto). Apretá B para volver.';
    const rec = new Set(def.items);
    const html = A.SHOP_ORDER.map(k => { const it = A.ITEMS[k]; return `<button data-buy="${k}" class="${rec.has(k) ? 'rec' : ''}" ${!c.shop || c.g < it.cost ? 'disabled' : ''}><b><span class="itm" style="background:${AM.ITEM_COLOR[k]}">${AM.ITEM_ABBR(k)}</span> ${esc(it.name)}</b><small>${esc(it.desc)}</small><em>${it.cost} oro${rec.has(k) ? ' · recomendado' : ''}</em></button>`; }).join('');
    if ($('#shopList').dataset.h !== html) { $('#shopList').innerHTML = html; $('#shopList').dataset.h = html; }
    const inv = c.it.map((k, i) => `<button data-sell="${i}" ${c.shop ? '' : 'disabled'}><span class="itm" style="background:${AM.ITEM_COLOR[k]}">${AM.ITEM_ABBR(k)}</span> ${esc(A.ITEMS[k].name)}${k === 'pocion' ? ' ×' + c.pot : ''}</button>`).join('') || '<span class="hint">Vacío</span>';
    if ($('#shopInv').dataset.h !== inv) { $('#shopInv').innerHTML = inv; $('#shopInv').dataset.h = inv; }
  }
  $('#shopList').addEventListener('click', e => { const b = e.target.closest('[data-buy]'); if (b) { send({ t: 'buy', item: b.dataset.buy }); SND.play('click'); } });
  $('#shopInv').addEventListener('click', e => { const b = e.target.closest('[data-sell]'); if (b) send({ t: 'sell', slot: +b.dataset.sell }); });
  $('#btnShop').addEventListener('click', toggleShop);

  /* ───── tabla de puntos ───── */
  function renderBoard() {
    const snap = ST.snap; if (!snap) return;
    const row = c => `<tr class="${c.id === ST.me ? 'me' : ''}"><td><img src="${AM.portrait(renderer, c.ch).toDataURL()}" width="26" height="26" style="border-radius:50%;vertical-align:middle"> ${esc(c.n)}${c.bot ? ' <small class="hint">bot</small>' : ''}</td><td>${c.lv}</td><td>${c.k}/${c.d}/${c.a}</td><td>${c.cs}</td><td>${(c.it || []).map(k => `<span class="itm" style="background:${AM.ITEM_COLOR[k]}">${AM.ITEM_ABBR(k)}</span>`).join('')}</td><td>${c.dead ? '☠ ' + c.rs + 's' : ''}</td></tr>`;
    const team = t => `<h3 class="${t ? 'red' : 'blue'}">Equipo ${t ? 'rojo' : 'azul'} · ${snap.s.k[t]} asesinatos · ${snap.s.tw[t]} estructuras</h3><table><tr><th>Campeón</th><th>Nv</th><th>A/M/A</th><th>Min.</th><th>Objetos</th><th></th></tr>${snap.c.filter(c => c.tm === t).map(row).join('')}</table>`;
    $('#board').innerHTML = team(ST.team) + team(1 - ST.team);
  }

  /* ───── minimapa ───── */
  const mini = $('#mini'), mg = mini.getContext('2d');
  const miniBg = (() => { const c = document.createElement('canvas'); c.width = c.height = 220; const g = c.getContext('2d'); g.drawImage(MAP3D.tex, 0, 0, 220, 220); g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(0, 0, 220, 220); for (const q of M.ROCKS) { g.fillStyle = '#1a2a14'; g.beginPath(); g.arc(q.x * 1.1, q.z * 1.1, q.r * 1.1, 0, 7); g.fill(); } return c; })();
  function drawMini() {
    const W = mini.width, k = W / M.W; mg.drawImage(miniBg, 0, 0, W, W);
    mg.save(); mg.globalAlpha = .5; mg.drawImage(fogCv, 0, 0, W, W); mg.restore();
    for (const m of ST.ents.values()) {
      if (!m.visible && m.kind !== 'tower' && m.kind !== 'inhib' && m.kind !== 'nexus') continue;
      const x = m.x * k, y = m.z * k, col = m.team === 2 ? '#ffd04a' : m.team === ST.team ? '#4aa3ff' : '#ff4a4a';
      if (m.kind === 'tower' || m.kind === 'inhib' || m.kind === 'nexus') { if (m.flags & 64) continue; mg.fillStyle = col; const s = m.kind === 'nexus' ? 6 : 4; mg.fillRect(x - s / 2, y - s / 2, s, s); mg.strokeStyle = '#000'; mg.strokeRect(x - s / 2, y - s / 2, s, s); }
      else if (m.kind === 'minion') { mg.fillStyle = col; mg.fillRect(x - 1.2, y - 1.2, 2.4, 2.4); }
      else if (m.kind === 'monster') { mg.fillStyle = '#ffd04a'; mg.beginPath(); mg.arc(x, y, m.lvl ? 3 : 1.8, 0, 7); mg.fill(); }
    }
    for (const m of ST.ents.values()) { if (m.kind !== 'champ' || !m.visible) continue; const x = m.x * k, y = m.z * k, r = TOUCH ? 6 : 8; mg.save(); mg.beginPath(); mg.arc(x, y, r, 0, 7); mg.clip(); mg.drawImage(AM.portrait(renderer, m.sub), x - r, y - r, r * 2, r * 2); mg.restore(); mg.strokeStyle = m.id === ST.me ? '#ffd04a' : m.team === ST.team ? '#4aa3ff' : '#ff4a4a'; mg.lineWidth = 2; mg.beginPath(); mg.arc(x, y, r, 0, 7); mg.stroke(); }
    // lo que ve la cámara
    const c = [[0, 0], [innerWidth, 0], [innerWidth, innerHeight], [0, innerHeight]].map(([sx, sy]) => groundAt(sx, sy)).filter(Boolean);
    if (c.length === 4) { mg.strokeStyle = 'rgba(255,255,255,.7)'; mg.lineWidth = 1; mg.beginPath(); c.forEach((p, i) => i ? mg.lineTo(p.x * k, p.z * k) : mg.moveTo(p.x * k, p.z * k)); mg.closePath(); mg.stroke(); }
  }
  const miniPos = e => { const r = mini.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * M.W, z: (e.clientY - r.top) / r.height * M.W }; };
  let miniDrag = false;
  mini.addEventListener('contextmenu', e => e.preventDefault());
  mini.addEventListener('pointerdown', e => { const p = miniPos(e); if (e.button === 2) { send({ t: 'move', x: p.x, z: p.z }); return; } miniDrag = true; S.camLock = false; ST.tgt.x = p.x; ST.tgt.z = p.z; });
  mini.addEventListener('pointermove', e => { if (miniDrag) { const p = miniPos(e); ST.tgt.x = p.x; ST.tgt.z = p.z; } });
  addEventListener('pointerup', () => miniDrag = false);

  /* ───── niebla ───── */
  function drawFog() {
    fg.globalCompositeOperation = 'source-over'; fg.clearRect(0, 0, 128, 128); fg.fillStyle = 'rgba(4,6,14,.62)'; fg.fillRect(0, 0, 128, 128);
    fg.globalCompositeOperation = 'destination-out'; const k = 128 / M.W;
    const hole = (x, z, r) => { const gr = fg.createRadialGradient(x * k, z * k, r * k * .55, x * k, z * k, r * k); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); fg.fillStyle = gr; fg.beginPath(); fg.arc(x * k, z * k, r * k, 0, 7); fg.fill(); };
    for (const m of ST.ents.values()) { if (m.team !== ST.team || !m.visible || (m.flags & 64)) continue; const r = m.kind === 'champ' ? 13 : m.kind === 'minion' ? 9 : m.kind === 'nexus' ? 14 : m.kind === 'inhib' ? 0 : 12; if (r) hole(m.x, m.z, r + 1); }
    hole(M.FOUNTAIN[ST.team][0], M.FOUNTAIN[ST.team][1], 16);
    fogTex.needsUpdate = true;
  }

  /* ───── barras de vida y textos (capa 2D) ───── */
  const _s = new THREE.Vector3();
  function drawOverlay(dt) {
    og.clearRect(0, 0, innerWidth, innerHeight); if (ST.mode !== 'game') return;
    const now = performance.now() / 1000;
    for (const m of ST.ents.values()) {
      if (!m.visible || !m.model || (m.flags & 64)) continue;
      _s.set(m.x, heightOf(m), m.z).project(camera); if (_s.z > 1) continue;
      const x = (_s.x + 1) / 2 * innerWidth, y = (1 - _s.y) / 2 * innerHeight; if (x < -80 || x > innerWidth + 80 || y < -40 || y > innerHeight + 40) continue;
      const mine = m.id === ST.me, ally = m.team === ST.team, w = m.kind === 'champ' ? 74 : m.kind === 'tower' ? 90 : m.kind === 'nexus' ? 120 : m.kind === 'inhib' ? 80 : m.kind === 'monster' ? (m.lvl ? 64 : 40) : m.sub === 3 ? 44 : 32, h = m.kind === 'champ' ? 9 : 5;
      const hpk = clamp(m.hp / m.maxHp, 0, 1), shk = clamp((m.sh || 0) / m.maxHp, 0, 1 - hpk);
      if (m.kind !== 'champ' && hpk >= .999 && m.kind !== 'tower' && m.kind !== 'nexus' && m.kind !== 'inhib' && !(m.flags & 512)) { if (m.kind === 'minion') continue; }
      og.fillStyle = 'rgba(0,0,0,.75)'; og.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
      og.fillStyle = mine ? '#5fe07a' : m.team === 2 ? '#e8b04a' : ally ? '#4aa3ff' : '#e84a4a'; og.fillRect(x - w / 2, y, w * hpk, h);
      if (shk > 0) { og.fillStyle = '#e8e8f0'; og.fillRect(x - w / 2 + w * hpk, y, w * shk, h); }
      if (m.kind === 'champ') {
        og.fillStyle = 'rgba(0,0,0,.35)'; for (let i = 1; i < m.maxHp / 250; i++) og.fillRect(x - w / 2 + w * i * 250 / m.maxHp, y, 1, h);
        og.fillStyle = '#1a1405'; og.fillRect(x - w / 2 - 17, y - 2, 16, 13); og.fillStyle = '#f3d98a'; og.font = '700 10px "JetBrains Mono",monospace'; og.textAlign = 'center'; og.textBaseline = 'middle'; og.fillText(m.lvl, x - w / 2 - 9, y + 4.5);
        const c = ST.champs.get(m.id); if (c) { og.font = '700 12px Figtree,sans-serif'; og.fillStyle = 'rgba(0,0,0,.7)'; og.fillText(c.n, x + 1, y - 9); og.fillStyle = mine ? '#f3d98a' : ally ? '#bfe0ff' : '#ffc0c0'; og.fillText(c.n, x, y - 10); }
        if (m.flags & 1) { og.font = '700 14px sans-serif'; og.fillStyle = '#ffe08a'; og.fillText('✦ ✦ ✦', x, y - 24); }
        else if (m.flags & 256) { og.font = '700 11px Figtree'; og.fillStyle = '#7aff6a'; og.fillText('ENRAIZADO', x, y - 24); }
        if (m.flags & 2) { og.font = '700 11px Figtree'; og.fillStyle = '#7fc0ff'; og.fillText('volviendo…', x, y + 20); }
      }
      if ((m.kind === 'tower' || m.kind === 'inhib' || m.kind === 'nexus') && (m.flags & 1024)) { og.font = '600 10px Figtree'; og.fillStyle = 'rgba(255,255,255,.6)'; og.textAlign = 'center'; og.fillText('protegida', x, y + 14); }
    }
    // textos flotantes
    for (let i = ST.floats.length - 1; i >= 0; i--) {
      const f = ST.floats[i]; f.life -= dt; f.y += dt * 2.2; if (f.life <= 0) { ST.floats.splice(i, 1); continue; }
      _s.set(f.x, f.y, f.z).project(camera); if (_s.z > 1) continue; const x = (_s.x + 1) / 2 * innerWidth, y = (1 - _s.y) / 2 * innerHeight;
      og.globalAlpha = Math.min(1, f.life * 2); og.font = `800 ${f.size}px Figtree,sans-serif`; og.textAlign = 'center'; og.fillStyle = 'rgba(0,0,0,.7)'; og.fillText(f.text, x + 1, y + 1); og.fillStyle = f.color; og.fillText(f.text, x, y); og.globalAlpha = 1;
    }
    if (ST.aim >= 0 && !TOUCH) { og.font = '700 13px Figtree'; og.fillStyle = '#cfe8ff'; og.textAlign = 'center'; og.fillText('soltá la tecla o hacé clic para lanzar · clic derecho cancela', innerWidth / 2, innerHeight - 170); }
  }

  /* ───── dibujar unidades ───── */
  function updModels(dt) {
    const now = performance.now() / 1000, iv = ST.interval;
    for (const m of ST.ents.values()) {
      const k = clamp((now - m.t0) / iv, 0, 1.2);
      m.x = lerp(m.x0, m.x1, Math.min(1, k)); m.z = lerp(m.z0, m.z1, Math.min(1, k));
      let df = m.f1 - m.f0; df = Math.atan2(Math.sin(df), Math.cos(df)); m.f = m.f0 + df * Math.min(1, k * 1.5);
      if (!m.model) continue; const r = m.model.root;
      r.visible = m.visible && !(m.kind === 'champ' && (m.flags & 64));
      r.position.set(m.x, 0, m.z);
      if (m.kind === 'champ' || m.kind === 'minion' || m.kind === 'monster') r.rotation.y = m.f;
      m.atk = Math.max(0, m.atk - dt / .35); m.cast = Math.max(0, m.cast - dt / .4);
      if (m.kind === 'champ') AM.animate(m.model, { moving: !!(m.flags & 32), atk: m.atk, cast: m.cast, stun: !!(m.flags & 1) }, now);
      else if (m.kind === 'minion' || m.kind === 'monster') { const b = m.model.p.body; b.position.y = (m.flags & 32) ? Math.abs(Math.sin(now * 10 + m.id)) * .12 : 0; b.rotation.x = m.atk > 0 ? -Math.sin(m.atk * Math.PI) * .35 : 0; if (m.kind === 'monster' && m.sub === 'cuervos') b.position.y = Math.sin(now * 3 + m.id) * .3; }
      else { const dead = !!(m.flags & 64), p = m.model.p; p.whole.visible = !dead; p.rubble.visible = dead; if (p.crystal) { p.crystal.rotation.y += dt * (m.kind === 'nexus' ? .6 : 1.2); p.crystal.position.y += Math.sin(now * 2 + m.id) * .004; } }
      // escudo y sigilo
      if (m.kind === 'champ' && (m.flags & 4)) { r.traverse(o => { if (o.isMesh && o.material) { if (!o.userData.stealthMat) { o.userData.baseMat = o.material; o.userData.stealthMat = o.material.clone(); o.userData.stealthMat.transparent = true; o.userData.stealthMat.opacity = .35; } o.material = o.userData.stealthMat; } }); }
      else if (m.kind === 'champ') r.traverse(o => { if (o.isMesh && o.userData.baseMat) o.material = o.userData.baseMat; });
    }
    // alcance del ataque propio con Alt o mientras apunto
    const me = ST.ents.get(ST.me); atkRing.visible = !!(me && me.visible && (ST.keys.AltLeft || ST.keys.KeyC)); if (atkRing.visible) { const r = A.CHAMPS[me.sub].stats.range + 1; atkRing.scale.setScalar(r); atkRing.position.set(me.x, .15, me.z); }
  }

  /* ───── bucle ───── */
  let last = performance.now(), rmbAcc = 0;
  function frame(nowMs) {
    requestAnimationFrame(frame);
    const dt = Math.min(.1, (nowMs - last) / 1000); last = nowMs; ST.t += dt;
    if (ST.mode === 'game' && ST.net) {
      ST.net.tick(dt);
      const g = groundAt(ST.mouse.x, ST.mouse.y); if (g) { ST.mouse.gx = g.x; ST.mouse.gz = g.z; }
      ST.hover = TOUCH ? null : pickAt(ST.mouse.x, ST.mouse.y);
      cv.style.cursor = ST.hover && ST.hover.team !== ST.team ? 'crosshair' : 'default';
      if (rmb) { rmbAcc += dt; if (rmbAcc > .15) { rmbAcc = 0; const u = pickAt(ST.mouse.x, ST.mouse.y, m => m.team !== ST.team); if (!u) send({ t: 'move', x: ST.mouse.gx, z: ST.mouse.gz }); } }
      touchTick(dt);
      updModels(dt); updProjs(dt); updFx(dt); updIndicator(); updateCamera(dt);
      if ((ST.fogT -= dt) <= 0) { ST.fogT = .15; drawFog(); }
      if ((ST.hudT -= dt) <= 0) { ST.hudT = .1; updHud(); drawMini(); }
    } else if (ST.mode === 'menu') {
      // cámara paseando sobre el mapa en el menú
      const a = ST.t * .05; ST.tgt.x = 100 + Math.cos(a) * 55; ST.tgt.z = 100 + Math.sin(a) * 55; ST.zoom = 1.3; updateCamera(dt); updFx(dt);
    }
    drawOverlay(dt);
    renderer.render(scene, camera);
  }

  /* ───── partidas ───── */
  function clearWorld() {
    for (const m of ST.ents.values()) removeModel(m); ST.ents.clear(); ST.champs.clear();
    for (const p of ST.projs.values()) scene.remove(p.obj); ST.projs.clear();
    for (const f of ST.fx) scene.remove(f.obj); ST.fx = []; for (const p of ST.parts) scene.remove(p.s); ST.parts = []; ST.floats = [];
    $('#feed').innerHTML = ''; ST.snap = null; ST.snapT = 0; ST.ended = false; ST.aim = -1;
  }
  function beginGame() {
    ST.mode = 'game'; showScreen(null); $('#hud').hidden = false; $('#touch').hidden = !TOUCH; buildHud(); ST.zoom = 1;
    const me = ST.ents.get(ST.me); if (me) { ST.tgt.x = me.x; ST.tgt.z = me.z; }
    banner('¡Bienvenidos a la Arena!', 2500); setTimeout(() => { if (ST.mode === 'game' && ST.snap && ST.snap.t < 20) { renderShop(); $('#sShop').hidden = false; } }, 900); setTimeout(() => toast(TOUCH ? 'Mové con el círculo · ⚔ ataca · Q W E R habilidades · los minions salen a los 0:25' : 'Clic derecho para moverte y atacar · Q W E R habilidades · P tienda · los minions salen a los 0:25', 6000), 2600);
  }
  function startBots() {
    const ch = S.champ, team = +S.team, keys = A.CHAMP_ORDER, players = [];
    const others = keys.filter(k => k !== ch), rnd = () => others.slice().sort(() => Math.random() - .5);
    const mates = rnd().slice(0, 4), foes = keys.slice().sort(() => Math.random() - .5);
    players.push({ team, champ: ch, name: S.name || 'Invocador', bot: false });
    mates.forEach((k, i) => players.push({ team, champ: k, name: A.CHAMPS[k].name, bot: true }));
    foes.forEach(k => players.push({ team: 1 - team, champ: k, name: A.CHAMPS[k].name, bot: true }));
    clearWorld(); ST.online = false; ST.net = Local; Local.start({ players, diff: S.diff }); beginGame();
  }
  function endGame(w) {
    if (ST.ended) return; ST.ended = true; const win = w === ST.team; SND.play(win ? 'win' : 'lose');
    setTimeout(() => {
      $('#endTitle').textContent = win ? 'VICTORIA' : 'DERROTA'; $('#endTitle').style.color = win ? '#f3d98a' : '#ff8a8a';
      const snap = ST.snap; const rows = (snap ? snap.c : []).slice().sort((a, b) => a.tm - b.tm || b.k - a.k).map(c => `<tr class="${c.id === ST.me ? 'me' : ''}"><td class="${c.tm ? 'red' : 'blue'}">${esc(c.n)}</td><td>${A.CHAMPS[c.ch].name}</td><td>${c.lv}</td><td>${c.k}/${c.d}/${c.a}</td><td>${c.cs}</td></tr>`).join('');
      $('#endStats').innerHTML = `<p style="text-align:center">Duración: ${fmtT(snap ? snap.t : 0)} · Asesinatos ${snap ? snap.s.k[0] + ' a ' + snap.s.k[1] : ''}</p><table><tr><th>Jugador</th><th>Campeón</th><th>Nivel</th><th>A/M/A</th><th>Minions</th></tr>${rows}</table>`;
      showScreen('sEnd');
    }, 2500);
  }
  function quitGame() { if (ST.net) ST.net.close(); ST.net = null; clearWorld(); ST.mode = 'menu'; $('#hud').hidden = true; $('#touch').hidden = true; showScreen('sTitle'); }
  function toggleMenu() {
    if (!$('#sMenu').hidden) { $('#sMenu').hidden = true; if (ST.net === Local) Local.paused = false; return; }
    $('#camState').textContent = S.camLock ? 'sí' : 'no'; $('#sndState').textContent = S.sound ? 'sí' : 'no';
    $('#menuNote').textContent = ST.online ? 'Estás en línea: la partida sigue mientras mirás este menú.' : 'La partida está en pausa.';
    if (ST.net === Local) Local.paused = true; $('#sMenu').hidden = false;
  }

  /* ───── menús ───── */
  let backTo = 'sTitle';
  function showScreen(id) { $$('.screen').forEach(s => s.hidden = s.id !== id); }
  function renderPick() {
    $('#pickList').innerHTML = A.CHAMP_ORDER.map(k => { const d = A.CHAMPS[k]; return `<button data-champ="${k}" aria-pressed="${k === S.champ}"><canvas width="128" height="128"></canvas><b>${d.name}</b><small>${d.role}</small></button>`; }).join('');
    $$('#pickList button').forEach(b => b.querySelector('canvas').getContext('2d').drawImage(AM.portrait(renderer, b.dataset.champ), 0, 0));
    $('#pickInfo').innerHTML = champDoc(S.champ); $('#pDiff').value = S.diff; $('#pTeam').value = S.team; $('#pName').value = S.name;
  }
  function champDoc(k) { const d = A.CHAMPS[k]; return `<h4>${d.name}<small>${d.title} · ${d.role}${d.ranged ? ' · a distancia' : ' · cuerpo a cuerpo'}</small></h4><div class="ab"><kbd>P</kbd><span><b>${d.passiveName}:</b> ${d.passiveDesc}</span></div>` + d.abilities.map(a => `<div class="ab"><kbd>${a.key}</kbd><span><b>${a.name}:</b> ${a.desc}</span></div>`).join(''); }
  const GO = {
    title: () => { showScreen('sTitle'); }, pick: () => { showScreen('sPick'); renderPick(); }, online: () => { showScreen('sOnline'); Online.render(); },
    help: () => { backTo = ST.mode === 'game' ? null : 'sTitle'; showScreen('sHelp'); if (ST.mode === 'game') $('#sMenu').hidden = true; },
    back: () => { if (backTo) showScreen(backTo); else { showScreen(null); $('#sMenu').hidden = false; } },
    champs: () => { showScreen('sChamps'); $('#champsAll').innerHTML = A.CHAMP_ORDER.map(k => `<div class="cinfo">${champDoc(k)}</div>`).join(''); },
  };
  const ACT = {
    startBots: () => { S.diff = $('#pDiff').value; S.team = +$('#pTeam').value; S.name = $('#pName').value.trim(); saveS(); startBots(); },
    resume: () => toggleMenu(), quit: () => { $('#sMenu').hidden = true; if (ST.online) Online.leave(); quitGame(); },
    toggleCam: () => { S.camLock = !S.camLock; saveS(); $('#camState').textContent = S.camLock ? 'sí' : 'no'; }, toggleSound: () => { S.sound = !S.sound; saveS(); $('#sndState').textContent = S.sound ? 'sí' : 'no'; },
    closeShop: () => closeShop(), toTitle: () => { if (ST.online) Online.backToLobby(); else quitGame(); },
  };
  document.addEventListener('click', e => {
    SND.init(); const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.go && GO[b.dataset.go]) { SND.play('click'); GO[b.dataset.go](); }
    else if (b.dataset.act && ACT[b.dataset.act]) { SND.play('click'); ACT[b.dataset.act](); }
    else if (b.dataset.champ && b.closest('#pickList')) { S.champ = b.dataset.champ; saveS(); renderPick(); }
  });

  /* ───── en línea ───── */
  function urls(addr) {
    let a = String(addr || '').trim().replace(/\/+$/, ''), sec;
    if (/^(wss|https):\/\//i.test(a)) { sec = true; a = a.replace(/^\w+:\/\//, ''); } else if (/^(ws|http):\/\//i.test(a)) { sec = false; a = a.replace(/^\w+:\/\//, ''); }
    else sec = !/:\d+$/.test(a) && !/^(localhost|\d+\.\d+\.\d+\.\d+)$/i.test(a);
    a = a.replace(/\/ws$/, ''); return { ws: (sec ? 'wss://' : 'ws://') + a + '/ws', http: (sec ? 'https://' : 'http://') + a };
  }
  const here = /^https?:$/.test(location.protocol) ? fetch('arena-servidor.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null);
  const Online = {
    ws: null, id: null, lobby: null,
    render() {
      $('#oName').value = S.name || ''; const list = store.get('ga_servers', []); $('#oList').innerHTML = list.map(a => `<option value="${esc(a)}">`).join('');
      if (!$('#oAddr').value) $('#oAddr').value = list[0] || '';
      here.then(j => { if (j && j.ws) $('#oAddr').value = location.host; this.status(); });
      clearInterval(this.poll); this.poll = setInterval(() => { if ($('#sOnline').hidden) clearInterval(this.poll); else this.status(true); }, 4000);
    },
    /** consulta el servidor por HTTP: nombre, jugadores y salas abiertas */
    status(quiet) {
      const addr = $('#oAddr').value.trim(); if (!addr) return this.info('Escribí la dirección que te dio el instalador del servidor.');
      const ctl = new AbortController(); setTimeout(() => ctl.abort(), 5000);
      fetch(urls(addr).http + '/estado', { signal: ctl.signal, cache: 'no-store' }).then(r => r.json()).then(st => {
        if (st.game !== 'gonzaarena') return this.info('Esa dirección es de otro juego. El servidor de GonzaArena empieza con «arena.».', 'bad');
        this.info(`«${st.name}» · ${st.players.length} conectado${st.players.length === 1 ? '' : 's'}${st.password ? ' · pide contraseña' : ''}`, 'ok');
        this.showRooms(st.rooms);
      }).catch(() => { if (!quiet) this.info('No responde. Fijate la dirección o que el servidor esté prendido.', 'bad'); });
    },
    showRooms(list) { $('#rooms').innerHTML = list.length ? list.map(r => `<button data-room="${r.code}" ${r.state !== 'lobby' ? 'disabled' : ''}><span><b>${r.code}</b> · sala de ${esc(r.host || '¿?')}</span><span>${r.humans} jugador${r.humans === 1 ? '' : 'es'} · ${r.state === 'lobby' ? 'esperando' : 'jugando'}</span></button>`).join('') : '<p class="hint">No hay salas abiertas. ¡Creá una!</p>'; },
    info(t, c) { const e = $('#oInfo'); e.textContent = t; e.className = 'hint ' + (c || ''); },
    connect(cb) {
      const addr = $('#oAddr').value.trim(); if (!addr) return this.info('Escribí la dirección que te dio el instalador del servidor.');
      const name = $('#oName').value.trim() || S.name || 'Invocador';
      if (this.ws && this.ws.readyState === 1 && this.addr === addr && this.nick === name) { if (cb) cb(); return; }
      if (this.ws) try { this.ws.close(); } catch (e) { }
      this.addr = addr; this.info('Conectando…'); let ws; try { ws = new WebSocket(urls(addr).ws); } catch (e) { return this.info('Dirección inválida', 'bad'); }
      this.ws = ws; this.pending = cb;
      this.nick = name;
      ws.onopen = () => { S.name = name; saveS(); this.sendRaw({ t: 'hello', name: S.name, pass: $('#oPass').value, v: 1 }); const l = store.get('ga_servers', []).filter(a => a !== addr); l.unshift(addr); store.set('ga_servers', l.slice(0, 8)); };
      ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } this.onMsg(m); };
      ws.onclose = () => { if (this.ws !== ws) return; this.ws = null; if (ST.online && ST.mode === 'game') { toast('Se cortó la conexión con el servidor', 5000); quitGame(); } else this.info('No hay conexión con el servidor. ¿Está prendido?', 'bad'); ST.online = false; };
    },
    sendRaw(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); },
    onMsg(m) {
      switch (m.t) {
        case 'welcome': this.id = m.id; this.info(`Conectado a «${m.name}» como ${m.nick}.`, 'ok'); this.sendRaw({ t: 'rooms' }); if (this.pending) { const f = this.pending; this.pending = null; f(); } break;
        case 'rooms': this.showRooms(m.list); break;
        case 'lobby': this.lobby = m; ST.online = true; showLobby(m); break;
        case 'lchat': { const d = document.createElement('div'); d.innerHTML = `<b>${esc(m.n)}:</b> ${esc(m.m)}`; $('#lChat').append(d); $('#lChat').scrollTop = 1e6; if (ST.mode === 'game') { pushFeed(`<b>${esc(m.n)}:</b> ${esc(m.m)}`); } break; }
        case 'start': clearWorld(); ST.me = m.me; ST.team = m.team; ST.online = true; ST.net = this.net; ST.interval = .066; beginGame(); break;
        case 'snap': if (ST.mode === 'game' && ST.online) deliver(m.s, m.ev); break;
        case 'err': this.info(m.msg, 'bad'); toast(m.msg, 3500); break;
        case 'ended': break;
      }
    },
    net: { input(o) { Online.sendRaw({ t: 'in', o }); }, tick() { }, close() { } },
    create() { this.connect(() => this.sendRaw({ t: 'create' })); },
    join(code) { this.connect(() => this.sendRaw({ t: 'join', code: String(code || '').toUpperCase() })); },
    leave() { this.sendRaw({ t: 'leave' }); this.lobby = null; ST.online = false; },
    backToLobby() { quitGame(); if (this.lobby) showLobby(this.lobby); },
  };
  function showLobby(L) {
    if (ST.mode === 'game') return; showScreen('sLobby'); $('#lCode').textContent = L.code;
    const slot = (team, i) => { const s = L.slots.find(x => x.team === team && x.idx === i); const me = s && s.pid === Online.id; return `<button data-slot="${team},${i}" class="${me ? 'me' : ''}">${s ? `<img src="${AM.portrait(renderer, s.ch).toDataURL()}" width="26" height="26" style="border-radius:50%"> ${esc(s.name)}${s.pid === L.host ? ' 👑' : ''}<i>${A.CHAMPS[s.ch].name}</i>` : '<span class="hint">Bot</span><i>libre</i>'}</button>`; };
    $('#lBlue').innerHTML = [0, 1, 2, 3, 4].map(i => slot(0, i)).join(''); $('#lRed').innerHTML = [0, 1, 2, 3, 4].map(i => slot(1, i)).join('');
    const mine = L.slots.find(x => x.pid === Online.id);
    $('#lPick').innerHTML = A.CHAMP_ORDER.map(k => `<button data-lch="${k}" aria-pressed="${mine && mine.ch === k}"><canvas width="128" height="128"></canvas><b>${A.CHAMPS[k].name}</b><small>${A.CHAMPS[k].role}</small></button>`).join('');
    $$('#lPick button').forEach(b => b.querySelector('canvas').getContext('2d').drawImage(AM.portrait(renderer, b.dataset.lch), 0, 0));
    const host = L.host === Online.id; $('#btnStart').disabled = !host; $('#btnStart').textContent = host ? 'Empezar' : 'Espera al anfitrión'; $('#lDiff').value = L.diff; $('#lDiff').disabled = !host;
  }
  $('#rooms').addEventListener('click', e => { const b = e.target.closest('[data-room]'); if (b) Online.join(b.dataset.room); });
  $('#oAddr').addEventListener('change', () => Online.status());
  $('#sLobby').addEventListener('click', e => {
    const s = e.target.closest('[data-slot]'); if (s) { const [team, idx] = s.dataset.slot.split(',').map(Number); Online.sendRaw({ t: 'slot', team, idx }); }
    const c = e.target.closest('[data-lch]'); if (c) Online.sendRaw({ t: 'champ', ch: c.dataset.lch });
  });
  $('#lDiff').addEventListener('change', () => Online.sendRaw({ t: 'diff', d: $('#lDiff').value }));
  Object.assign(ACT, {
    createRoom: () => { S.name = $('#oName').value.trim() || S.name; saveS(); Online.create(); },
    joinCode: () => { const c = $('#oCode').value.trim(); if (c.length < 4) return toast('Escribí el código de la sala'); Online.join(c); },
    leaveRoom: () => { Online.leave(); GO.online(); },
    startOnline: () => Online.sendRaw({ t: 'start' }),
    lobbyChat: () => { const v = $('#lMsg').value.trim(); if (v) Online.sendRaw({ t: 'chat', m: v }); $('#lMsg').value = ''; },
  });
  $('#lMsg').addEventListener('keydown', e => { if (e.key === 'Enter') ACT.lobbyChat(); });
  function openChat() { const f = $('#chatBox'); f.hidden = false; $('#chatIn').value = ''; setTimeout(() => $('#chatIn').focus(), 0); ST.keys = {}; }
  $('#chatBox').addEventListener('submit', e => { e.preventDefault(); const v = $('#chatIn').value.trim(); if (v) Online.sendRaw({ t: 'chat', m: v }); $('#chatBox').hidden = true; $('#chatIn').blur(); });
  $('#chatIn').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { $('#chatBox').hidden = true; $('#chatIn').blur(); } });

  /* inicio */
  showScreen('sTitle'); requestAnimationFrame(frame);
  window.__ga = { ST, S, Local, Online, startBots, quitGame, send, handleEvents, deliver, camera };
})();
