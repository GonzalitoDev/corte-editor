/* GonzaSky — juego: menús, desafíos, cámaras, controles (teclado, mouse, joystick, táctil), sonido y bucle principal */
(function () {
  'use strict';
  const GS = window.GS;
  const { World, Aircraft, SPECS, buildPlane, animatePlane, Hud, BigMap, AIRPORTS, apWorld, apLocal } = GS;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), D = 180 / Math.PI;
  const UA = navigator.userAgent;
  const TOUCH = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || /Android|iPhone|iPad/i.test(UA) || /[?&]tactil/.test(location.search);
  const DESKTOP = /Electron/i.test(UA);
  if (TOUCH) document.body.classList.add('touch'); if (DESKTOP) document.body.classList.add('desktop');

  /* ───── opciones ───── */
  const S = { quality: TOUCH ? 'bajo' : 'medio', units: 'met', vol: .7, sens: 1, invert: false, mouseFly: false, hudAlways: false, tilt: false };
  try { Object.assign(S, JSON.parse(localStorage.getItem('gs_settings') || '{}')); } catch (e) { }
  const saveS = () => { try { localStorage.setItem('gs_settings', JSON.stringify(S)); } catch (e) { } };
  const BEST = (() => { try { return JSON.parse(localStorage.getItem('gs_best') || '{}'); } catch (e) { return {}; } })();
  const saveBest = () => { try { localStorage.setItem('gs_best', JSON.stringify(BEST)); } catch (e) { } };

  /* ───── render ───── */
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: $('#c'), antialias: S.quality !== 'bajo', powerPreference: 'high-performance', logarithmicDepthBuffer: true }); }
  catch (e) { document.body.innerHTML = '<section class="screen"><div class="panel"><h2>No se pudo iniciar</h2><p>Tu navegador o tu placa de video no soportan WebGL. Probá con Chrome o Edge actualizados.</p></div></section>'; return; }
  const setPR = () => renderer.setPixelRatio(Math.min(devicePixelRatio || 1, { bajo: 1, medio: 1.25, alto: 1.75 }[S.quality] || 1.25));
  setPR(); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xa6cdf5, 4000, 14000);
  const camera = new THREE.PerspectiveCamera(65, 1, .5, 80000);
  const world = new World(scene, S.quality);
  const hud = new Hud($('#hud')), bigmap = new BigMap($('#map'));
  function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); hud.resize(); bigmap.resize(); }
  resize(); addEventListener('resize', resize);

  /* ───── estado ───── */
  const G = { mode: 'title', plane: null, model: null, cfg: null, view: 'persecucion', ap: null, destAp: null, mission: null, hour: 13, weather: 'despejado', wind: new THREE.Vector3(), orbit: { yaw: 0, pitch: .25, dist: 0 }, shake: 0, showHud: true, ui: null, back: 'title', mapOpen: false, t: 0 };
  const K = {};
  const ON = () => (GS.online && GS.online.active ? GS.online : null); // modo online (js/online.js)
  let toastT; function toast(m, ms = 2800) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms); }
  function show(id) { $$('.screen').forEach(s => s.hidden = s.id !== id); G.ui = id; $('#touch').hidden = !(TOUCH && !id && G.mode === 'fly'); }
  function hideScreens() { show(null); }

  /* ───── sonido sintetizado ───── */
  const SND = {
    ctx: null,
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      try {
        const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = c.createGain(); this.master.gain.value = S.vol; this.master.connect(c.destination);
        const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.noise = nb;
        const src = () => { const s = c.createBufferSource(); s.buffer = nb; s.loop = true; s.start(); return s; };
        // hélice / motor a pistón
        this.osc = c.createOscillator(); this.osc.type = 'sawtooth'; this.oscLp = c.createBiquadFilter(); this.oscLp.type = 'lowpass'; this.oscLp.frequency.value = 500; this.oscG = c.createGain(); this.oscG.gain.value = 0;
        this.osc.connect(this.oscLp); this.oscLp.connect(this.oscG); this.oscG.connect(this.master); this.osc.start();
        // turbina
        this.jet = src(); this.jetBp = c.createBiquadFilter(); this.jetBp.type = 'bandpass'; this.jetBp.Q.value = 1.4; this.jetG = c.createGain(); this.jetG.gain.value = 0; this.jet.connect(this.jetBp); this.jetBp.connect(this.jetG); this.jetG.connect(this.master);
        this.whine = c.createOscillator(); this.whine.type = 'sine'; this.whG = c.createGain(); this.whG.gain.value = 0; this.whine.connect(this.whG); this.whG.connect(this.master); this.whine.start();
        // viento
        this.wind = src(); this.windLp = c.createBiquadFilter(); this.windLp.type = 'lowpass'; this.windLp.frequency.value = 600; this.windG = c.createGain(); this.windG.gain.value = 0; this.wind.connect(this.windLp); this.windLp.connect(this.windG); this.windG.connect(this.master);
        // bocina de pérdida
        // sirena del Stuka (la "trompeta de Jericó"): dos osciladores que suben con la velocidad
        this.sir = c.createOscillator(); this.sir.type = 'sawtooth'; this.sir2 = c.createOscillator(); this.sir2.type = 'triangle'; this.sirLp = c.createBiquadFilter(); this.sirLp.type = 'lowpass'; this.sirLp.frequency.value = 2200; this.sirG = c.createGain(); this.sirG.gain.value = 0;
        this.sir.connect(this.sirLp); this.sir2.connect(this.sirLp); this.sirLp.connect(this.sirG); this.sirG.connect(this.master); this.sir.start(); this.sir2.start();
        this.horn = c.createOscillator(); this.horn.type = 'square'; this.horn.frequency.value = 880; this.hornG = c.createGain(); this.hornG.gain.value = 0; this.horn.connect(this.hornG); this.hornG.connect(this.master); this.horn.start();
      } catch (e) { this.ctx = null; }
    },
    update(a, active) {
      if (!this.ctx) return; const t = this.ctx.currentTime, s = a && a.spec, set = (p, v) => p.setTargetAtTime(v, t, .08);
      this.master.gain.value = S.vol;
      if (!active || !a || a.crashed) { [this.oscG, this.jetG, this.whG, this.windG, this.hornG, this.sirG].forEach(g => set(g.gain, 0)); return; }
      const rpm = a.engineOn ? a.rpm : 0, V = a.vel.length(), cab = G.view === 'cabina' ? 1 : .7;
      if (s.prop) { set(this.osc.frequency, 38 + rpm * 95); set(this.oscLp.frequency, 300 + rpm * 900); set(this.oscG.gain, (a.engineOn ? .05 + rpm * .12 : 0) * cab); set(this.jetG.gain, 0); set(this.whG.gain, 0); }
      else { set(this.oscG.gain, 0); set(this.jetBp.frequency, 400 + rpm * 1800 + (a.ab ? 600 : 0)); set(this.jetG.gain, (a.engineOn ? .06 + rpm * .2 + (a.ab ? .12 : 0) : 0) * cab); set(this.whine.frequency, 1800 + rpm * 2600); set(this.whG.gain, a.engineOn ? .006 + rpm * .012 : 0); }
      set(this.windLp.frequency, 300 + V * 8); set(this.windG.gain, Math.min(.25, V * V / 90000));
      set(this.hornG.gain, a.stall && (t * 4 | 0) % 2 ? .05 : 0);
      // la sirena suena en picada rápida
      const sirOn = s.siren && !a.onGround ? clamp((V - 55) / 45, 0, 1) * clamp((-a.vel.y - 15) / 25, 0, 1) : 0;
      set(this.sir.frequency, 180 + V * 3.2); set(this.sir2.frequency, (180 + V * 3.2) * 1.5); set(this.sirG.gain, sirOn * .1 * cab);
    },
    blip(kind) {
      if (!this.ctx) return; const c = this.ctx, t = c.currentTime, g = c.createGain(); g.connect(this.master);
      if (kind === 'gun') { if (t - (this.lastGun || 0) < .05) return; this.lastGun = t; const s2 = c.createBufferSource(); s2.buffer = this.noise; const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 900 + Math.random() * 300; f2.Q.value = .8; g.gain.setValueAtTime(.16, t); g.gain.exponentialRampToValueAtTime(.001, t + .09); s2.connect(f2); f2.connect(g); s2.start(t, Math.random()); s2.stop(t + .1); return; }
      if (kind === 'warn') { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 1500; g.gain.setValueAtTime(.06, t); g.gain.setValueAtTime(0, t + .08); o.connect(g); o.start(t); o.stop(t + .1); return; }
      if (kind === 'missile') { const s2 = c.createBufferSource(); s2.buffer = this.noise; const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.setValueAtTime(600, t); f2.frequency.exponentialRampToValueAtTime(2400, t + .9); f2.Q.value = 1.2; g.gain.setValueAtTime(.4, t); g.gain.exponentialRampToValueAtTime(.001, t + 1.4); s2.connect(f2); f2.connect(g); s2.start(t); s2.stop(t + 1.5); return; }
      if (kind === 'ding' || kind === 'click') { const o = c.createOscillator(); o.frequency.value = kind === 'ding' ? 1320 : 700; g.gain.setValueAtTime(kind === 'ding' ? .2 : .08, t); g.gain.exponentialRampToValueAtTime(.001, t + (kind === 'ding' ? .5 : .06)); o.connect(g); o.start(t); o.stop(t + .6); return; }
      const s = c.createBufferSource(); s.buffer = this.noise; const f = c.createBiquadFilter();
      if (kind === 'boom') { f.type = 'lowpass'; f.frequency.value = 300; g.gain.setValueAtTime(1.2, t); g.gain.exponentialRampToValueAtTime(.001, t + 2.5); }
      else if (kind === 'touch') { f.type = 'bandpass'; f.frequency.value = 1600; f.Q.value = 2; g.gain.setValueAtTime(.35, t); g.gain.exponentialRampToValueAtTime(.001, t + .35); }
      else { f.type = 'lowpass'; f.frequency.value = 900; g.gain.setValueAtTime(.12, t); g.gain.exponentialRampToValueAtTime(.001, t + .4); }
      s.connect(f); f.connect(g); s.start(t); s.stop(t + 2.6);
    },
  };

  /* ───── explosión ───── */
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.4, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const fx = [];
  function explode(p, sc = 1) {
    const n = Math.round(46 * Math.min(1, .45 + sc * .45));
    for (let i = 0; i < n; i++) {
      const fire = i < n * .48, m = new THREE.SpriteMaterial({ map: glowTex, color: fire ? 0xff8a2a : 0x2b2b2b, transparent: true, depthWrite: false, blending: fire ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: fire ? 1 : .8 });
      const s = new THREE.Sprite(m); s.position.copy(p); s.scale.setScalar((fire ? 8 : 12) * sc);
      s.userData = { v: new THREE.Vector3((Math.random() - .5) * (fire ? 30 : 10) * sc, (Math.random() * (fire ? 25 : 12) + 4) * Math.sqrt(sc), (Math.random() - .5) * (fire ? 30 : 10) * sc), life: fire ? 1.4 : 6, max: fire ? 1.4 : 6, grow: (fire ? 22 : 9) * sc, fire };
      scene.add(s); fx.push(s);
    }
    const d = camera.position.distanceTo(p); if (d < 700 * sc) G.shake = Math.max(G.shake, Math.min(1.2, sc * .8 * (1 - d / (700 * sc)) + .2)); SND.blip('boom');
  }
  function puff(p, color, size, life, vy) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, opacity: .7 }));
    s.position.copy(p); s.scale.setScalar(size); s.userData = { v: new THREE.Vector3((Math.random() - .5) * 2, vy, (Math.random() - .5) * 2), life, max: life, grow: size * .9, fire: false };
    scene.add(s); fx.push(s);
  }

  /* ───── armas del Stuka: bombas y misiles ───── */
  const shots = [];                // bombas y misiles en el aire
  const _bv = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Vector3();
  const flameMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  function armPlane(a, cfg) {
    const full = { bombs: a.spec.bombs ? 5 : 0, missiles: a.spec.missiles || 0 }, am = Object.assign({}, full, cfg && cfg.ammo);
    a.ammo = { bombs: am.bombs, missiles: am.missiles, maxB: am.bombs, maxM: am.missiles, rB: 0, rM: 0 };
    $$('#touch .bombonly').forEach(b => b.hidden = !a.ammo.maxB); $$('#touch .misonly').forEach(b => b.hidden = !a.ammo.maxM);
    $('#tBtns').classList.toggle('armed', !!(a.ammo.maxB || a.ammo.maxM));
  }
  function worldPos(obj, out) { obj.updateWorldMatrix(true, false); return obj.getWorldPosition(out); }
  function dropBomb() {
    const a = G.plane; if (!a || !a.ammo || !a.ammo.maxB) return;
    if (a.onGround) return toast('Las bombas se sueltan en el aire', 1400);
    const am = a.ammo; if (am.bombs <= 0) return toast(G.mission ? 'No te quedan bombas' : 'Recargando bombas…', 1200);
    // primero la bomba grande de la panza; después las de las alas, alternando lados
    const big = am.bombs === am.maxB, p = G.model.p, from = big ? p.bomb : p.wingBombs.find(b => b.visible); if (!from) return;
    const pos = worldPos(from, new THREE.Vector3());
    const [, u] = a.axes(), m = GS.bombMesh(big ? 1 : .55, from.children[0].material, from.children[3].material);
    m.position.copy(pos); m.quaternion.copy(a.q); scene.add(m);
    shots.push({ kind: 'bomb', m, v: a.vel.clone().addScaledVector(u, big ? -2.5 : -1.2), t: 0, R: big ? 26 : 14, sc: big ? 1.4 : .9 });
    am.bombs--; SND.blip('gear');
    if (G.mission && !G.mission.dropped) G.mission.dropped = { angle: Math.round(-a.attitude().pitch * D), agl: a.agl };
  }
  /** el blanco más cerca del centro de la mira: tanques y aviones enemigos (cono de 30°, hasta 4 km) */
  function lockTarget(pos, f) {
    let target = null, bestA = .52;
    const cands = tanks.filter(t => t.alive).concat(ON() ? ON().targets() : []);
    for (const t of cands) { _d.set(t.x - pos.x, t.y + (t.isPlane ? 0 : 1.5) - pos.y, t.z - pos.z); const dist = _d.length(); if (dist > 4000 || dist < 30) continue; const ang = Math.acos(clamp(_d.dot(f) / dist, -1, 1)); if (ang < bestA) { bestA = ang; target = t; } }
    return target;
  }
  /** misil "de adorno" que disparó otro jugador (el daño lo calcula el que dispara) */
  function cosmeticMissile(pos, vel, target) {
    const m = GS.missileMesh(); m.position.copy(pos); scene.add(m);
    const fl = new THREE.Sprite(flameMat); fl.scale.setScalar(1.6); fl.position.set(0, 0, 1.05); m.add(fl);
    shots.push({ kind: 'missile', m, v: vel.clone(), t: 0, R: 0, sc: .75, target, smokeT: 0, cosmetic: true }); SND.blip('missile');
  }
  function fireMissile() {
    const a = G.plane; if (!a || !a.ammo || !a.ammo.maxM) return;
    const am = a.ammo; if (am.missiles <= 0) return toast(G.mission ? 'No te quedan misiles' : 'Recargando misiles…', 1200);
    const from = G.model.p.missiles.find(m => m.visible); if (!from) return;
    const [f] = a.axes(), m = GS.missileMesh(), pos = worldPos(from, new THREE.Vector3());
    m.position.copy(pos); m.quaternion.copy(a.q); scene.add(m);
    const fl = new THREE.Sprite(flameMat); fl.scale.setScalar(1.6); fl.position.set(0, 0, 1.05); m.add(fl);
    // guiado: el tanque vivo más cerca del centro de la mira (cono de 30°, hasta 4 km)
    let target = null, bestA = .52;
    target = lockTarget(pos, f);
    shots.push({ kind: 'missile', m, v: a.vel.clone().addScaledVector(f, 25), t: 0, R: 11, sc: .75, target, smokeT: 0 });
    am.missiles--; SND.blip('missile');
    if (ON()) ON().sendMissile(pos, shots[shots.length - 1].v, target);
    toast(target ? (target.isPlane ? 'Misil guiado a ' + target.name : 'Misil guiado al tanque') : 'Misil sin blanco: apuntá con la nariz a un tanque o un avión', 1300);
  }
  function blast(p, R) {
    let hits = 0;
    for (const t of tanks) if (t.alive && Math.hypot(t.x - p.x, t.z - p.z) < R && Math.abs(t.y - p.y) < R) { killTank(t); hits++; }
    return hits;
  }
  function impact(s, p, ground) {
    scene.remove(s.m); explode(p, s.sc); if (s.cosmetic) return;
    const hits = blast(p, s.R);
    if (s.kind === 'bomb' && G.mission && G.mission.target && !G.mission.hit) { const t = G.mission.target; G.mission.hit = { d: Math.hypot(p.x - t.x, p.z - t.z), water: ground && ground.type === 'water', at: G.mission.t }; }
    if (hits && !(G.mission && G.mission.target)) toast(hits > 1 ? `¡${hits} tanques destruidos!` : '¡Tanque destruido!', 1500);
  }
  function updShots(dt) {
    // pasos chicos: un misil a 380 m/s avanza casi 40 m por cuadro y podría atravesar el tanque
    const n = Math.max(1, Math.ceil(dt * 120)); for (let i = 0; i < n; i++) stepShots(dt / n);
  }
  function stepShots(dt) {
    const a = G.plane;
    // en vuelo libre se recargan solas a los pocos segundos de vaciarse
    if (a && a.ammo && !G.mission) {
      const am = a.ammo;
      if (am.maxB && am.bombs === 0 && (am.rB += dt) > 5) { am.bombs = am.maxB; am.rB = 0; toast('Bombas recargadas', 1100); }
      if (am.maxM && am.missiles === 0 && (am.rM += dt) > 5) { am.missiles = am.maxM; am.rM = 0; toast('Misiles recargados', 1100); }
    }
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i], m = s.m; s.t += dt;
      if (s.kind === 'bomb') { s.v.y -= 9.81 * dt; s.v.multiplyScalar(1 - dt * .015); }
      else {
        // motor cohete: acelera, y si tiene blanco gira hacia él
        const sp = s.v.length(), want = Math.min(sp + 170 * dt, (a ? a.vel.length() : 100) + 300);
        _d.copy(s.v).divideScalar(sp || 1);
        if (s.target && s.target.alive && s.t > .25) {
          const tp = s.target.isPlane;
          _q.set(s.target.x - m.position.x, s.target.y + (tp ? 0 : 1.4) - m.position.y, s.target.z - m.position.z); const dist = _q.length(); _q.divideScalar(dist || 1);
          if (dist < (tp ? 11 : 6)) s.fuse = s.target; // espoleta de proximidad
          // contra aviones gira menos: se puede esquivar con un viraje cerrado
          const ang = _d.angleTo(_q), mx = (tp ? (dist < 120 ? 3.2 : 1.45) : dist < 250 ? 12 : 2.6) * dt; if (ang > 1e-4) _d.lerp(_q, Math.min(1, mx / ang)).normalize();
          if (tp && ang > 1.6) s.target = null; // se pasó: pierde el blanco
        }
        else _d.y -= .03 * dt;
        s.v.copy(_d).multiplyScalar(want);
        if ((s.smokeT -= dt * want) <= 0) { s.smokeT = 7; puff(m.position, 0xd8d8d8, 2.8, 1.8, .6); } // un puff cada 7 m
      }
      m.position.addScaledVector(s.v, dt);
      if (s.v.lengthSq() > 1) { _bv.copy(m.position).add(s.v); m.lookAt(_bv); m.rotateY(Math.PI); }
      // ¿pegó en un tanque?
      if (s.fuse && s.fuse.isPlane) { shots.splice(i, 1); scene.remove(m); explode(m.position.clone(), .8); if (!s.cosmetic && ON()) ON().planeHit(s.fuse, 70, 'misil'); continue; }
      let hitTank = s.fuse || null; if (!hitTank) for (const t of tanks) if (t.alive && Math.abs(m.position.x - t.x) < 3.4 && Math.abs(m.position.z - t.z) < 3.4 && m.position.y - t.y < 3) { hitTank = t; break; }
      const g = GS.surface(m.position.x, m.position.z);
      if (hitTank || m.position.y <= g.y || s.t > (s.kind === 'bomb' ? 60 : 12)) {
        if (!hitTank) m.position.y = Math.max(m.position.y, g.y + 1);
        shots.splice(i, 1); impact(s, m.position.clone(), g);
      }
    }
  }
  function clearShots() { shots.forEach(s => scene.remove(s.m)); shots.length = 0; }

  /* ───── ametralladoras (todos los aviones) ───── */
  const bullets = [], tracerGeo = new THREE.BoxGeometry(.13, .13, 7), tracerMat = new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracerPool = [];
  const GUNS = { gaucho: [[0, .9, -2.4]], pampa: [[-2.2, -1.2, -12], [2.2, -1.2, -12]], condor: [[-1.1, -.2, -5.5], [1.1, -.2, -5.5]], stuka: [[-3.4, -.75, -1.8], [3.4, -.75, -1.8]] };
  const _g0 = new THREE.Vector3(), _g1 = new THREE.Vector3(), _gv = new THREE.Vector3();
  /** crea una bala trazadora; owner = null para las mías (hacen daño), o el id de otro jugador (solo se ven) */
  function spawnBullet(pos, vel, owner) {
    const m = tracerPool.pop() || new THREE.Mesh(tracerGeo, tracerMat); m.position.copy(pos); _gv.copy(pos).add(vel); m.lookAt(_gv); m.visible = true; scene.add(m);
    bullets.push({ p: pos.clone(), v: vel.clone(), t: 0, m, owner });
  }
  function fireGuns(a, dt) {
    a.gunT = (a.gunT || 0) - dt; a.firing = false;
    if (!a.wantFire || a.crashed || (ON() && ON().spawnSafe())) return;
    a.firing = true; a.lastFire = performance.now();
    const [f] = a.axes(), guns = GUNS[a.spec.id] || GUNS.condor;
    while (a.gunT <= 0) {
      a.gunT += 1 / 14; a.gunIdx = ((a.gunIdx || 0) + 1) % guns.length;
      _g0.set(...guns[a.gunIdx]).applyQuaternion(a.q).add(a.pos);
      _g1.copy(f).multiplyScalar(880).add(a.vel); _g1.x += (Math.random() - .5) * 6; _g1.y += (Math.random() - .5) * 6; _g1.z += (Math.random() - .5) * 6;
      spawnBullet(_g0, _g1, null); SND.blip('gun');
    }
  }
  function updBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i]; b.t += dt; _g0.copy(b.p); b.v.y -= 9.81 * dt; b.p.addScaledVector(b.v, dt); b.m.position.copy(b.p);
      let done = b.t > 1.8, hit = null;
      if (!b.owner && !done) {
        // ¿le pegó a un avión enemigo?
        if (ON()) { const h = ON().hitTest(_g0, b.p); if (h) { hit = h.point; ON().planeHit(h.peer, 6, 'balas'); } }
        // ¿o a un tanque?
        if (!hit) for (const t of tanks) { if (!t.alive) continue; _g1.set(t.x, t.y + 1.5, t.z); if (segDist(_g0, b.p, _g1) < 4.2) { hit = _g1.clone(); t.hp = (t.hp ?? 60) - 5; if (t.hp <= 0) { killTank(t); toast('¡Tanque destruido!', 1300); } break; } }
      }
      if (!hit && !done) { const g = GS.surface(b.p.x, b.p.z); if (b.p.y <= g.y) { done = true; if (g.type !== 'water' && Math.random() < .35) puff(b.p, 0x9a8a6a, 2.5, 1.2, 1.5); else if (g.type === 'water') puff(b.p, 0xe8f2ff, 2, .8, 3); } }
      if (hit) { puff(hit, 0xffd080, 2, .35, 0); puff(hit, 0x444444, 2.6, 1.4, 2); done = true; }
      if (done) { scene.remove(b.m); tracerPool.push(b.m); bullets.splice(i, 1); }
    }
  }
  const _sd = new THREE.Vector3(), _se = new THREE.Vector3();
  /** distancia del punto c al segmento a-b */
  function segDist(a, b, c) { _sd.subVectors(b, a); const L2 = _sd.lengthSq(); let t = L2 ? _se.subVectors(c, a).dot(_sd) / L2 : 0; t = clamp(t, 0, 1); return _se.copy(a).addScaledVector(_sd, t).distanceTo(c); }
  function clearBullets() { bullets.forEach(b => { scene.remove(b.m); tracerPool.push(b.m); }); bullets.length = 0; }

  /* ───── tanques de práctica ───── */
  const tanks = [];
  const burnt = new THREE.MeshStandardMaterial({ color: 0x1e1b18, roughness: 1 });
  function placeTanks(c, n) {
    clearTanks();
    for (let i = 0, tries = 0; tanks.length < n && tries < 200; tries++, i++) {
      const ang = i * 2.39996 + .7, r = 140 + (i % 4) * 110 + Math.random() * 60, x = c.x + Math.cos(ang) * r, z = c.z + Math.sin(ang) * r, sf = GS.surface(x, z);
      if (sf.type === 'water' || sf.type === 'runway') continue;
      if (tanks.some(t => Math.hypot(t.x - x, t.z - z) < 60)) continue;
      const y = GS.height(x, z), mdl = GS.buildTank(); mdl.root.position.set(x, y - .15, z); mdl.root.rotation.y = Math.random() * Math.PI * 2; mdl.turret.rotation.y = (Math.random() - .5) * 2; scene.add(mdl.root);
      tanks.push({ x, y, z, alive: true, mdl, smokeT: 0, burn: 0 });
    }
  }
  function killTank(t) {
    t.alive = false; t.burn = 25;
    t.mdl.root.traverse(o => { if (o.isMesh) o.material = burnt; });
    t.mdl.turret.position.y += .5; t.mdl.turret.rotation.z = .5; t.mdl.turret.rotation.x = .3;
    explode(new THREE.Vector3(t.x, t.y + 2, t.z), .9);
  }
  function updTanks(dt) {
    for (const t of tanks) if (!t.alive && t.burn > 0) { t.burn -= dt; if ((t.smokeT -= dt) <= 0) { t.smokeT = .3; puff(new THREE.Vector3(t.x, t.y + 3, t.z), t.burn > 20 ? 0x3a2a1a : 0x2b2b2b, 6, 4.5, 9); } }
  }
  function clearTanks() { tanks.forEach(t => scene.remove(t.mdl.root)); tanks.length = 0; }
  const nearestTank = p => { let b = null, bd = 1e12; for (const t of tanks) { if (!t.alive) continue; const d = (t.x - p.x) ** 2 + (t.z - p.z) ** 2; if (d < bd) { bd = d; b = t; } } return b; };

  /* ───── blanco en el suelo ───── */
  let targetMesh = null;
  const targetTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'); g.fillStyle = '#6b6152'; g.fillRect(0, 0, 512, 512); [[250, '#f2efe6'], [205, '#c8242b'], [160, '#f2efe6'], [115, '#c8242b'], [70, '#f2efe6'], [28, '#c8242b']].forEach(([r, c2]) => { g.fillStyle = c2; g.beginPath(); g.arc(256, 256, r, 0, Math.PI * 2); g.fill(); }); g.strokeStyle = '#222'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, 256); g.lineTo(512, 256); g.moveTo(256, 0); g.lineTo(256, 512); g.stroke(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  /** busca un lugar en tierra, bastante plano, cerca del aeropuerto pero lejos de la pista */
  function findSpot(port) {
    let best = null;
    for (let i = 0; i < 40; i++) {
      const ang = i * 2.39996, r = 1800 + (i % 5) * 450, x = port.x + Math.cos(ang) * r, z = port.z + Math.sin(ang) * r, s = GS.surface(x, z);
      if (s.type === 'water' || s.type === 'runway') continue;
      let lo = 1e9, hi = -1e9; for (const [dx, dz] of [[-90, 0], [90, 0], [0, -90], [0, 90], [0, 0]]) { const h = GS.height(x + dx, z + dz); lo = Math.min(lo, h); hi = Math.max(hi, h); }
      if (!best || hi - lo < best.slope) best = { x, z, y: GS.height(x, z), slope: hi - lo };
    }
    return best;
  }
  function placeTarget(port) {
    const best = findSpot(port);
    if (targetMesh) scene.remove(targetMesh);
    const R = 75, geo = new THREE.PlaneGeometry(R * 2, R * 2, 20, 20); geo.rotateX(-Math.PI / 2); const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, GS.height(best.x + pos.getX(i), best.z + pos.getZ(i)) - best.y + .6);
    geo.computeVertexNormals();
    targetMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: targetTex, polygonOffset: true, polygonOffsetFactor: -2 })); targetMesh.position.set(best.x, best.y, best.z); scene.add(targetMesh);
    return best;
  }
  function clearTarget() { if (targetMesh) scene.remove(targetMesh); targetMesh = null; }
  function updFx(dt) { for (let i = fx.length - 1; i >= 0; i--) { const s = fx[i], u = s.userData; u.life -= dt; s.position.addScaledVector(u.v, dt); u.v.multiplyScalar(1 - dt * .8); if (!u.fire) u.v.y += dt * 3; s.scale.addScalar(u.grow * dt); s.material.opacity = Math.max(0, u.life / u.max) * (u.fire ? 1 : .8); if (u.life <= 0) { scene.remove(s); s.material.dispose(); fx.splice(i, 1); } } }

  /* ───── aros del desafío ───── */
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd400 }), ringMatOff = new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: .35 }), ringGeo = new THREE.TorusGeometry(28, 1.8, 10, 40);
  let ringMeshes = [];
  function makeRings(x, z, hdg, n) {
    const out = []; let px = x, pz = z, h = hdg;
    for (let i = 0; i < n; i++) {
      h += (Math.sin(i * 1.7) * .45 + (i % 3 === 0 ? .3 : -.15)); const d = 1300 + (i % 4) * 250; px += Math.sin(h) * d; pz -= Math.cos(h) * d;
      const gy = GS.height(px, pz); out.push({ x: px, y: Math.max(gy + 110 + (i % 5) * 60, 140), z: pz, hdg: h });
    }
    return out;
  }
  function showRings(list) {
    ringMeshes.forEach(m => scene.remove(m)); ringMeshes = list.map((r, i) => { const m = new THREE.Mesh(ringGeo, i === 0 ? ringMat : ringMatOff); m.position.set(r.x, r.y, r.z); m.rotation.y = -r.hdg; scene.add(m); return m; });
  }

  /* ───── desafíos ───── */
  const ap = code => AIRPORTS.find(a => a.code === code);
  const fmtT = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function landingScore(td) {
    if (!td) return null;
    const vs = -td.vs, pv = clamp((vs - .6) * 18, 0, 60), pc = td.rw ? clamp((Math.abs(td.rw.v) - 2) * 3, 0, 25) : 40;
    const score = Math.round(clamp(100 - pv - pc, 0, 100));
    const word = vs < 1 ? 'una pluma' : vs < 1.8 ? 'suave' : vs < 2.8 ? 'firme' : 'fuerte';
    return { score, word, vs, center: td.rw ? Math.abs(td.rw.v) : null };
  }
  const MISSIONS = [
    { id: 'despegue', name: 'Primer despegue', desc: 'Con la Gaucho en la cabecera del Aeropuerto Gonza: despegá y subí a 300 m sobre el suelo.', plane: 'gaucho', start: { ap: 'GZA', kind: 'pista' }, hour: 10, best: 'time',
      update(m, a) { m.hud = a.onGround ? 'Motor al máximo (Shift) y tirá suave (S) al pasar los ' + hud.units(a.spec.vRot, 'spd', S) + ' ' + hud.label('spd', S) : `Subí a 300 m · ahora ${Math.round(Math.max(0, a.agl))} m`; if (!a.onGround && a.agl > 300) return { win: true, val: m.t, text: `Despegaste en ${fmtT(m.t)}.` }; } },
    { id: 'aterrizaje', name: 'Aterrizaje perfecto', desc: 'Estás en final a 6 km de la pista con la Gaucho. Bajá alineado, tocá suave y frená.', plane: 'gaucho', start: { ap: 'GZA', kind: 'final', dist: 6000, alt: 380, speed: 42, flaps: 1 }, hour: 17.5, best: 'score',
      update(m, a) { const s = m.td && landingScore(m.td); m.hud = m.td ? 'Frená hasta parar (B)' : 'Seguí las luces de la pista · flaps (F) y velocidad baja'; if (m.td && a.onGround && a.vel.length() < 1.5) { if (!m.td.onRunway) return { win: false, text: 'Aterrizaste fuera de la pista.' }; return { win: true, val: s.score, text: `Aterrizaje ${s.word}: ${s.vs.toFixed(1)} m/s de descenso, a ${s.center.toFixed(1)} m del centro. Puntaje: ${s.score}/100` }; } } },
    { id: 'aros', name: 'Circuito de aros', desc: 'Con el Cóndor F-1: pasá por los 12 aros dorados, en orden, lo más rápido que puedas.', plane: 'condor', start: { ap: 'CDR', kind: 'aire', alt: 450, speed: 170 }, hour: 15, best: 'time', rings: 12,
      update(m, a) { m.hud = `Aro ${m.ringIdx + 1} de ${m.rings.length} · ${fmtT(m.t)}`; if (m.ringIdx >= m.rings.length) return { win: true, val: m.t, text: `¡Pasaste todos los aros en ${fmtT(m.t)}!` }; } },
    { id: 'sinmotor', name: 'Sin motor', desc: 'Se plantó el motor a 1100 m de altura. Planeá hasta el Aeródromo del Valle y aterrizá entero.', plane: 'gaucho', start: { ap: 'VLL', kind: 'final', dist: 8500, alt: 1100, speed: 40, engineOff: true }, hour: 12, best: 'score',
      update(m, a) { m.hud = m.td ? 'Frená hasta parar' : 'Velocidad de planeo: unos ' + hud.units(36, 'spd', S) + ' ' + hud.label('spd', S); if (m.td && a.onGround && a.vel.length() < 1.5) { const s = landingScore(m.td); return { win: true, val: m.td.onRunway ? s.score : 30, text: m.td.onRunway ? `¡Lo lograste en la pista! Aterrizaje ${s.word}. Puntaje: ${s.score}/100` : 'Aterrizaste fuera de la pista, pero entero. Puntaje: 30/100' }; } } },
    { id: 'cabotaje', name: 'Vuelo de cabotaje', desc: 'Llevá el Pampa 320 del Aeropuerto Gonza a Puerto Azul. Usá el GPS (M) y aterrizá ahí.', plane: 'pampa', start: { ap: 'GZA', kind: 'pista' }, dest: 'PAZ', hour: 9, best: 'time',
      update(m, a) { m.hud = `Destino: Puerto Azul · ${fmtT(m.t)}`; if (m.td && a.onGround && a.vel.length() < 2) { if (m.td.rw && m.td.rw.ap.code === 'PAZ') { const s = landingScore(m.td); return { win: true, val: m.t, text: `Llegaste a Puerto Azul en ${fmtT(m.t)}. Aterrizaje ${s.word} (${s.score}/100).` }; } if (m.td.rw && m.td.rw.ap.code !== 'GZA') return { win: false, text: 'Aterrizaste en otro aeropuerto.' }; } } },
    { id: 'noche', name: 'Aterrizaje nocturno', desc: 'De noche y con viento cruzado: aterrizá el Pampa 320 en el Aeropuerto del Sur.', plane: 'pampa', start: { ap: 'SUR', kind: 'final', dist: 11000, alt: 650, speed: 82, flaps: 2 }, hour: 22.5, wind: 7, best: 'score',
      update(m, a) { m.hud = m.td ? 'Frená hasta parar' : 'Tren abajo (G), flaps total (F) y apuntá a las luces'; if (m.td && a.onGround && a.vel.length() < 2) { const s = landingScore(m.td); if (!m.td.onRunway) return { win: false, text: 'Aterrizaste fuera de la pista.' }; return { win: true, val: s.score, text: `Aterrizaje ${s.word} de noche. Puntaje: ${s.score}/100` }; } } },
    { id: 'picada', name: 'Bombardeo en picada', desc: 'Con el Stuka a 1500 m: buscá el blanco rojo y blanco, sacá los frenos de picada (B), tirate en picada, soltá la bomba (X) y recuperá antes del suelo.', plane: 'stuka', start: { ap: 'VLL', kind: 'blanco', alt: 1500, speed: 85 }, ammo: { bombs: 1, missiles: 0 }, hour: 11, best: 'score', target: true,
      update(m, a) {
        const t = m.target, d = Math.hypot(a.pos.x - t.x, a.pos.z - t.z), ang = Math.round(-a.attitude().pitch * D);
        m.hud = m.hit ? 'Recuperá y estabilizá el avión' : m.dropped ? 'Bomba en camino… ¡tirá para arriba!' : `Blanco a ${d > 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'} · picada ${Math.max(0, ang)}°${a.brakes ? '' : ' · frenos de picada: B'}`;
        if (m.hit && m.t - m.hit.at > 2.5 && !a.crashed) {
          if (a.agl < 30 && !a.onGround) return;
          const sc = m.hit.water ? 0 : Math.round(clamp(100 - Math.max(0, m.hit.d - 4) * 1.1, 0, 100));
          const word = m.hit.d < 10 ? '¡En el centro!' : m.hit.d < 30 ? 'Muy cerca.' : m.hit.d < 75 ? 'Dentro del blanco.' : 'Fuera del blanco.';
          return { win: sc > 0, val: sc, text: `${word} La bomba cayó a ${Math.round(m.hit.d)} m del centro, picando a ${m.dropped.angle}° desde ${Math.round(m.dropped.agl)} m. Puntaje: ${sc}/100` };
        }
      } },
    { id: 'tanques', name: 'Cacería de tanques', desc: 'Con el Stuka bien armado (5 bombas y 6 misiles): destruí los 5 tanques de práctica. Apuntá la nariz a un tanque y tirá un misil (V): se guía solo. Las bombas (X) rompen todo lo que esté cerca.', plane: 'stuka', start: { ap: 'ALM', kind: 'tanques', alt: 900, speed: 85, n: 5 }, hour: 16, best: 'time',
      update(m, a) {
        const left = tanks.filter(t => t.alive).length, am = a.ammo;
        m.hud = `Tanques: ${left} de ${tanks.length} · ${fmtT(m.t)} · bombas ${am.bombs} · misiles ${am.missiles}`;
        if (!left && !a.crashed) { if (!m.doneT) m.doneT = m.t; if (m.t - m.doneT > 2) return { win: true, val: m.t, text: `¡Destruiste los ${tanks.length} tanques en ${fmtT(m.t)}! Te sobraron ${am.bombs} bombas y ${am.missiles} misiles.` }; }
        if (left && am.bombs + am.missiles === 0 && !shots.length) { if (!m.emptyT) m.emptyT = m.t; if (m.t - m.emptyT > 3) return { win: false, text: `Te quedaste sin municiones y quedaron ${left} tanques.` }; }
      } },
  ];

  /* ───── menús ───── */
  let selPlane = 'gaucho';
  function renderFree() {
    $('#planes').innerHTML = Object.values(SPECS).map(s => `<button class="card" data-plane="${s.id}" aria-pressed="${s.id === selPlane}"><em>${s.tipo}</em><b>${s.name}</b><p>${s.desc}</p><div class="stars"><span>Velocidad</span><i>${'★'.repeat(s.stars[0])}${'☆'.repeat(5 - s.stars[0])}</i><span>Facilidad</span><i>${'★'.repeat(s.stars[1])}${'☆'.repeat(5 - s.stars[1])}</i><span>Agilidad</span><i>${'★'.repeat(s.stars[2])}${'☆'.repeat(5 - s.stars[2])}</i></div></button>`).join('');
    if (!$('#fAp').options.length) $('#fAp').innerHTML = AIRPORTS.map((a, i) => `<option value="${i}">${a.name} (${a.code}) · pista de ${a.len} m</option>`).join('');
  }
  function renderMissions() {
    $('#missions').innerHTML = MISSIONS.map((m, i) => { const b = BEST[m.id]; return `<button class="mission" data-mission="${i}"><b>${i + 1}. ${m.name}</b><p>${m.desc}</p><small>${SPECS[m.plane].name}${b != null ? ' · récord: ' + (m.best === 'time' ? fmtT(b) : b + '/100') : ''}</small></button>`; }).join('');
  }
  function renderOpt() {
    $('#oQ').value = S.quality; $('#oU').value = S.units; $('#oVol').value = S.vol; $('#oVolV').textContent = Math.round(S.vol * 100) + '%'; $('#oSens').value = S.sens; $('#oSensV').textContent = Math.round(S.sens * 100) + '%';
    $$('[data-t]').forEach(b => b.setAttribute('aria-pressed', !!S[b.dataset.t]));
  }
  const go = {
    title: () => { G.mode = G.mode === 'fly' ? G.mode : 'title'; show('sTitle'); },
    free: () => { show('sFree'); renderFree(); },
    chal: () => { show('sChal'); renderMissions(); },
    opt: () => { G.back = G.ui || 'sTitle'; show('sOpt'); renderOpt(); },
    help: () => { G.back = G.ui || 'sTitle'; show('sHelp'); },
    back: () => show(G.back === 'sOpt' || G.back === 'sHelp' ? 'sTitle' : G.back),
  };
  const act = {
    startFree: () => {
      const a = AIRPORTS[+$('#fAp').value], kind = $('#fStart').value;
      startFlight({ plane: selPlane, start: { ap: a.code, kind, alt: kind === 'aire' ? 900 : 380, dist: kind === 'final' ? 7000 : 0, speed: kind === 'final' ? SPECS[selPlane].vRot * 1.45 : SPECS[selPlane].cruise * .85, flaps: kind === 'final' ? 2 : 0 }, hour: +$('#fHour').value, weather: $('#fWx').value, wind: +$('#fWind').value });
    },
    resume: () => { hideScreens(); G.mode = 'fly'; },
    restart: () => { if (G.cfg) startFlight(G.cfg); },
    quitFlight: () => endFlight(),
    continueFlight: () => { G.mission = null; hideScreens(); G.mode = 'fly'; if (G.plane.crashed) startFlight(G.cfg); },
    optBack: () => { saveS(); show(G.back === 'sPause' ? 'sPause' : 'sTitle'); },
    quit: () => window.close(),
  };
  document.addEventListener('click', e => {
    SND.init();
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.go) { SND.blip('click'); go[b.dataset.go](); }
    else if (b.dataset.act) { SND.blip('click'); act[b.dataset.act](); }
    else if (b.dataset.plane) { selPlane = b.dataset.plane; renderFree(); }
    else if (b.dataset.mission) { const m = MISSIONS[+b.dataset.mission]; startFlight(Object.assign({ mission: m }, m)); }
    else if (b.dataset.t) { S[b.dataset.t] = !S[b.dataset.t]; saveS(); renderOpt(); if (b.dataset.t === 'tilt' && S.tilt) enableTilt(); }
  });
  $('#sOpt').addEventListener('input', e => {
    if (e.target.id === 'oVol') S.vol = +e.target.value; if (e.target.id === 'oSens') S.sens = +e.target.value;
    if (e.target.id === 'oU') S.units = e.target.value;
    if (e.target.id === 'oQ') { S.quality = e.target.value; world.setQuality(S.quality); setPR(); }
    saveS(); renderOpt();
  });

  /* ───── empezar y terminar un vuelo ───── */
  function startFlight(cfg) {
    G.cfg = cfg; SND.init();
    if (G.model) scene.remove(G.model.root);
    const spec = SPECS[cfg.plane], a = new Aircraft(spec), port = ap(cfg.start.ap) || AIRPORTS[0], st = cfg.start;
    G.plane = a; G.model = buildPlane(spec.id); scene.add(G.model.root);
    if (st.kind === 'pista') { const [x, z] = apWorld(port, -port.len / 2 + 70, 0); a.place(x, 0, z, port.hdg, 0, true); }
    else if (st.kind === 'final') { const [x, z] = apWorld(port, -port.len / 2 - st.dist, 0); const glide = port.e + Math.min(st.alt, st.dist * .055 + 40); a.place(x, Math.max(glide, GS.height(x, z) + 150), z, port.hdg, st.speed, false); a.flaps = st.flaps || 0; a.gearDown = true; a.gearPos = 1; a.throttle = a.rpm = st.engineOff ? 0 : .35; }
    else if (st.kind === 'arena') { const ang = Math.random() * Math.PI * 2, r = 2600 + Math.random() * 2200, x = port.x + Math.cos(ang) * r, z = port.z + Math.sin(ang) * r, h = Math.atan2(port.x - x, -(port.z - z)); a.place(x, Math.max(port.e + 700 + Math.random() * 500, GS.height(x, z) + 350), z, h, spec.cruise * .85, false); }
    else if (st.kind === 'tanques') { const c = findSpot(port); placeTanks(c, st.n || 5); G.target = c; const h = Math.random() * Math.PI * 2, x = c.x - Math.sin(h) * 4000, z = c.z + Math.cos(h) * 4000; let top = c.y; for (let i = 0; i <= 12; i++) top = Math.max(top, GS.height(x + (c.x - x) * i / 12, z + (c.z - z) * i / 12)); a.place(x, Math.max(c.y + st.alt, top + 400), z, h, st.speed, false); }
    else if (st.kind === 'blanco') { const t = G.target = placeTarget(port), h = Math.random() * Math.PI * 2, x = t.x - Math.sin(h) * 3800, z = t.z + Math.cos(h) * 3800; let top = t.y; for (let i = 0; i <= 12; i++) top = Math.max(top, GS.height(x + (t.x - x) * i / 12, z + (t.z - z) * i / 12)); a.place(x, Math.max(t.y + st.alt, top + 500), z, h, st.speed, false); }
    else { const [x, z] = apWorld(port, -port.len / 2 - 1500, 0); a.place(x, port.e + (st.alt || 900), z, port.hdg, st.speed || spec.cruise * .85, false); }
    if (st.engineOff) { a.engineOn = false; a.throttle = 0; a.rpm = 0; }
    G.hour = cfg.hour ?? 13; G.weather = cfg.weather || 'despejado'; world.setWeather(G.weather); world.setTime(G.hour);
    const wa = Math.random() * Math.PI * 2, ws = cfg.wind || 0; G.wind.set(Math.sin(wa) * ws, 0, Math.cos(wa) * ws);
    if (cfg.mission && cfg.mission.id === 'noche') { const n = ap('SUR'); G.wind.set(Math.cos(n.hdg) * 7, 0, Math.sin(n.hdg) * 7); }
    G.ap = null; G.destAp = cfg.dest ? ap(cfg.dest) : (st.kind === 'final' ? port : null);
    G.mission = cfg.mission ? { def: cfg.mission, t: 0, td: null, ringIdx: 0, rings: null, hud: '', target: st.kind === 'blanco' ? G.target : null } : null;
    if (st.kind !== 'blanco') clearTarget(); clearShots();
    if (st.kind !== 'tanques') { clearTanks(); if ((spec.bombs || spec.missiles) && !cfg.mission && !cfg.online) { const c = findSpot(port); placeTanks(c, 6); G.freeTanks = true; } }
    armPlane(a, cfg); clearBullets();
    ringMeshes.forEach(m => scene.remove(m)); ringMeshes = [];
    if (G.mission && cfg.mission.rings) { const r = makeRings(a.pos.x, a.pos.z, port.hdg, cfg.mission.rings); G.mission.rings = r; showRings(r); }
    G.view = 'persecucion'; G.orbit.dist = spec.chase * 1.6; G.landing = null; G.tdShown = 0;
    G.mode = 'loading'; show('sLoad'); $('#loadBar').style.width = '0'; G.loadT = performance.now(); G.camInit = false;
    fx.forEach(s => scene.remove(s)); fx.length = 0;
  }
  function endFlight() {
    if (G.model) scene.remove(G.model.root); G.model = null; G.plane = null; G.mission = null; clearTarget(); clearShots(); clearTanks(); clearBullets(); if (GS.online && GS.online.active) GS.online.disconnect(true); ringMeshes.forEach(m => scene.remove(m)); ringMeshes = [];
    G.mode = 'title'; G.mapOpen = false; $('#map').hidden = true; $('#mapHint').hidden = true; world.setWeather('despejado'); world.setTime(16.5); show('sTitle');
  }
  function over(win, title, text, canContinue) {
    G.mode = 'over'; $('#overTitle').textContent = title; $('#overText').textContent = text; $('#btnCont').hidden = !canContinue; show('sOver');
    if (win) SND.blip('ding');
  }

  /* ───── controles ───── */
  addEventListener('keydown', e => {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
    K[e.code] = true; SND.init();
    if (G.mapOpen && (e.code === 'KeyM' || e.code === 'Escape')) { closeMap(); return; }
    if (G.mode !== 'fly' || G.ui) { if (e.code === 'Escape' && G.ui === 'sPause') act.resume(); else if (e.code === 'Escape' && (G.ui === 'sOpt' || G.ui === 'sHelp')) go.back(); return; }
    const a = G.plane;
    switch (e.code) {
      case 'KeyG': if (!a.spec.fixedGear) { a.gearDown = !a.gearDown; SND.blip('gear'); toast(a.gearDown ? 'Bajando el tren' : 'Subiendo el tren', 1200); } else toast('Este avión tiene tren fijo', 1200); break;
      case 'KeyF': a.flaps = Math.min(3, a.flaps + 1); SND.blip('gear'); break;
      case 'KeyR': a.flaps = Math.max(0, a.flaps - 1); SND.blip('gear'); break;
      case 'KeyC': cycleView(); break;
      case 'Digit1': G.view = 'persecucion'; break; case 'Digit2': G.view = 'cabina'; break; case 'Digit3': G.view = 'orbita'; break; case 'Digit4': G.view = 'torre'; break;
      case 'KeyM': openMap(); break;
      case 'KeyU': toggleAP(); break;
      case 'KeyX': dropBomb(); break;
      case 'Tab': if (ON()) ON().board = true; break;
      case 'Enter': case 'KeyT': if (ON()) { ON().openChat(); e.preventDefault(); } break;
      case 'KeyV': fireMissile(); break;
      case 'KeyI': G.showHud = !G.showHud; break;
      case 'KeyH': go.help(); break;
      case 'KeyP': case 'Escape': pause(); break;
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e => { K[e.code] = false; if (e.code === 'Tab' && ON()) ON().board = false; });
  addEventListener('blur', () => { for (const k in K) K[k] = false; mouseFire = false; if (G.mode === 'fly' && !G.ui && !ON()) pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.mode === 'fly' && !G.ui && !ON()) pause(); });
  function pause() { if (G.mode !== 'fly') return; if (document.pointerLockElement) document.exitPointerLock(); $$('#sPause .offlineonly').forEach(b => b.hidden = !!ON()); $('#pauseNote').hidden = !ON(); show('sPause'); }
  function cycleView() { const v = ['persecucion', 'cabina', 'orbita', 'torre']; G.view = v[(v.indexOf(G.view) + 1) % v.length]; toast({ persecucion: 'Cámara de atrás', cabina: 'Cabina', orbita: 'Cámara libre: arrastrá para girar', torre: 'Vista desde la torre' }[G.view], 1400); }
  function toggleAP() { const a = G.plane; if (a.onGround) return toast('El piloto automático se usa en el aire'); if (G.ap) { G.ap = null; toast('Piloto automático apagado', 1400); } else { const at = a.attitude(); G.ap = { alt: a.pos.y, hdg: at.hdg }; toast('Piloto automático: mantiene altura y rumbo', 1800); } }
  // mouse: girar la cámara en órbita, rueda para el motor, y volar con el mouse si está activado
  let drag = null, mouseFire = false; const mstick = { x: 0, y: 0 };
  addEventListener('mousedown', e => { if (e.button === 0 && document.pointerLockElement && S.mouseFly) mouseFire = true; });
  addEventListener('mouseup', e => { if (e.button === 0) mouseFire = false; });
  $('#c').addEventListener('pointerdown', e => { if (G.mode !== 'fly' || G.ui || e.pointerType === 'touch') return; if (S.mouseFly && !document.pointerLockElement) { try { $('#c').requestPointerLock(); } catch (_) { } return; } drag = { x: e.clientX, y: e.clientY }; });
  addEventListener('pointermove', e => {
    if (document.pointerLockElement && S.mouseFly) { mstick.x = clamp(mstick.x + e.movementX * .004 * S.sens, -1, 1); mstick.y = clamp(mstick.y + e.movementY * .004 * S.sens, -1, 1); return; }
    if (drag) { G.orbit.yaw -= (e.clientX - drag.x) * .006; G.orbit.pitch = clamp(G.orbit.pitch + (e.clientY - drag.y) * .005, -1.2, 1.4); drag = { x: e.clientX, y: e.clientY }; if (G.view === 'persecucion') G.view = 'orbita'; }
  });
  addEventListener('pointerup', () => drag = null);
  addEventListener('contextmenu', e => { if (G.mode === 'fly') { e.preventDefault(); mstick.x = mstick.y = 0; } });
  addEventListener('wheel', e => { if (G.mode !== 'fly' || G.ui) return; if (G.view === 'orbita') G.orbit.dist = clamp(G.orbit.dist * (e.deltaY > 0 ? 1.12 : .89), 8, 600); else G.plane.throttle = clamp(G.plane.throttle - Math.sign(e.deltaY) * .05, 0, 1); }, { passive: true });

  // táctil: volante, acelerador y botones
  const touch = { x: 0, y: 0, rud: 0, fire: false };
  if (TOUCH) {
    const yoke = $('#yoke'), knob = yoke.firstElementChild; let yid = null;
    const yMove = e => { const r = yoke.getBoundingClientRect(), R = r.width / 2; let dx = e.clientX - r.left - R, dy = e.clientY - r.top - R; const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; } touch.x = dx / R; touch.y = dy / R; knob.style.transform = `translate(${dx}px,${dy}px)`; };
    yoke.addEventListener('pointerdown', e => { yid = e.pointerId; yoke.setPointerCapture(e.pointerId); yMove(e); SND.init(); });
    yoke.addEventListener('pointermove', e => { if (e.pointerId === yid) yMove(e); });
    const yEnd = () => { yid = null; touch.x = touch.y = 0; knob.style.transform = ''; }; yoke.addEventListener('pointerup', yEnd); yoke.addEventListener('pointercancel', yEnd);
    const tr = $('#thrTrack'), tk = $('#thrKnob');
    const tSet = e => { const r = tr.getBoundingClientRect(); const v = clamp(1 - (e.clientY - r.top - 15) / (r.height - 30), 0, 1); if (G.plane) G.plane.throttle = v; };
    tr.addEventListener('pointerdown', e => { tr.setPointerCapture(e.pointerId); tSet(e); }); tr.addEventListener('pointermove', e => { if (e.buttons || e.pressure) tSet(e); });
    setInterval(() => { if (G.plane) tk.style.bottom = (G.plane.throttle * (tr.clientHeight - 34)) + 'px'; }, 100);
    $$('#touch [data-k]').forEach(b => {
      const k = b.dataset.k;
      if (b.classList.contains('hold')) {
        const on = v => { b.classList.toggle('on', v); if (k === 'brakes') K.KeyB = v; if (k === 'fire') touch.fire = v; if (k === 'rudL') touch.rud = v ? -1 : 0; if (k === 'rudR') touch.rud = v ? 1 : 0; };
        b.addEventListener('pointerdown', e => { e.preventDefault(); on(true); }); ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => b.addEventListener(t, () => on(false)));
      } else b.addEventListener('click', () => {
        const a = G.plane; if (!a || G.mode !== 'fly') return;
        if (k === 'flaps') { a.flaps = (a.flaps + 1) % 4; toast('Flaps ' + ['0', '1', '2', 'total'][a.flaps], 900); }
        if (k === 'gear') { if (a.spec.fixedGear) toast('Este avión tiene tren fijo', 1200); else { a.gearDown = !a.gearDown; toast(a.gearDown ? 'Bajando el tren' : 'Subiendo el tren', 1000); } }
        if (k === 'cam') cycleView(); if (k === 'map') openMap(); if (k === 'ap') toggleAP(); if (k === 'pause') pause(); if (k === 'bomb') dropBomb(); if (k === 'missile') fireMissile(); if (k === 'board' && ON()) ON().toggleBoard(); if (k === 'chat' && ON()) ON().openChat();
      });
    });
  }
  // inclinar el celular
  let tilt = null;
  function enableTilt() {
    const start = () => addEventListener('deviceorientation', e => { if (e.beta == null) return; const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0, s = ang === 270 || ang === -90 ? -1 : 1; if (!tilt) tilt = { b0: e.beta, g0: e.gamma, x: 0, y: 0 }; tilt.x = clamp(s * (e.beta - tilt.b0) / 28, -1, 1); tilt.y = clamp(-s * (e.gamma - tilt.g0) / 22, -1, 1); });
    if (window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().then(r => r === 'granted' && start()).catch(() => { }); else start();
    toast('Sostené el celular cómodo: esa es la posición neutra', 2500); tilt = null;
  }
  if (S.tilt && TOUCH) enableTilt();

  function readControls(dt) {
    const a = G.plane; let pitch = 0, roll = 0, yaw = 0;
    pitch += (K.KeyS || K.ArrowDown ? 1 : 0) - (K.KeyW || K.ArrowUp ? 1 : 0);
    roll += (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0);
    yaw += (K.KeyE ? 1 : 0) - (K.KeyQ ? 1 : 0);
    if (S.mouseFly && document.pointerLockElement) { pitch += mstick.y; roll += mstick.x; }
    if (TOUCH) { pitch += touch.y; roll += touch.x; yaw += touch.rud; if (S.tilt && tilt) { pitch += tilt.y; roll += tilt.x; } }
    // joystick o control
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue; const dz = v => Math.abs(v) < .12 ? 0 : v;
      roll += dz(p.axes[0]); pitch += dz(p.axes[1]); if (p.axes.length > 2) yaw += dz(p.axes[2]);
      const rt = p.buttons[7] ? p.buttons[7].value : 0, lt = p.buttons[6] ? p.buttons[6].value : 0; a.throttle = clamp(a.throttle + (rt - lt) * dt * .6, 0, 1);
      const pr = i => p.buttons[i] && p.buttons[i].pressed, edge = i => { const now = pr(i), was = (G.padPrev || {})[i]; (G.padPrev = G.padPrev || {})[i] = now; return now && !was; };
      K.PadFire = !!pr(0); if (edge(8) && !a.spec.fixedGear) a.gearDown = !a.gearDown; if (pr(1)) K.PadBrake = true; else K.PadBrake = false;
      if (edge(2)) a.flaps = (a.flaps + 1) % 4; if (edge(3)) cycleView(); if (edge(9)) pause(); if (edge(4)) toggleAP(); if (edge(5)) dropBomb(); if (edge(12)) fireMissile();
    }
    if (S.invert) pitch = -pitch;
    pitch = clamp(pitch * S.sens, -1, 1); roll = clamp(roll * S.sens, -1, 1); yaw = clamp(yaw, -1, 1);
    const k = v => Math.min(1, dt * (v ? 3.5 : 5));
    a.elev += (pitch - a.elev) * k(pitch); a.ail += (roll - a.ail) * k(roll); a.rud += (yaw - a.rud) * k(yaw);
    if (K.ShiftLeft || K.ShiftRight || K.Equal || K.NumpadAdd || K.PageUp) a.throttle = Math.min(1, a.throttle + dt * .5);
    if (K.KeyZ || K.Minus || K.NumpadSubtract || K.PageDown) a.throttle = Math.max(0, a.throttle - dt * .5);
    a.brakes = !!(K.KeyB || (K.Space && a.onGround) || K.PadBrake);
    a.wantFire = !!(K.ControlLeft || K.ControlRight || K.KeyK || (K.Space && !a.onGround) || mouseFire || touch.fire || K.PadFire);
    if (G.mission && G.mission.def.start.engineOff) a.throttle = 0;
    if (G.ap) { if (Math.abs(pitch) > .3 || Math.abs(roll) > .3) { G.ap = null; toast('Piloto automático apagado', 1200); } else a.autopilot(dt, G.ap); }
  }

  /* ───── mapa ───── */
  async function openMap() {
    G.mapOpen = true; $('#map').hidden = false; $('#mapHint').hidden = false; if (document.pointerLockElement) document.exitPointerLock();
    bigmap.view.x = G.plane ? G.plane.pos.x : 0; bigmap.view.z = G.plane ? G.plane.pos.z : 0; bigmap.view.scale = 1.6;
    if (!bigmap.img) { $('#mapHint').textContent = 'Dibujando el mapa…'; await bigmap.prepare(p => $('#mapHint').textContent = `Dibujando el mapa… ${Math.round(p * 100)}%`); $('#mapHint').innerHTML = 'Tocá un aeropuerto para que el GPS te lleve · <kbd>M</kbd> para cerrar'; }
  }
  function closeMap() { G.mapOpen = false; $('#map').hidden = true; $('#mapHint').hidden = true; }
  let mdrag = null;
  $('#map').addEventListener('pointerdown', e => { mdrag = { x: e.clientX, y: e.clientY, moved: 0 }; });
  $('#map').addEventListener('pointermove', e => { if (!mdrag) return; const s = Math.min(innerWidth, innerHeight) / bigmap.span * bigmap.view.scale; bigmap.view.x -= (e.clientX - mdrag.x) / s; bigmap.view.z -= (e.clientY - mdrag.y) / s; mdrag.moved += Math.abs(e.clientX - mdrag.x) + Math.abs(e.clientY - mdrag.y); mdrag.x = e.clientX; mdrag.y = e.clientY; });
  $('#map').addEventListener('pointerup', e => { const m = mdrag; mdrag = null; if (m && m.moved < 8) { const a = bigmap.hit(e.clientX, e.clientY); if (a) { G.destAp = a; toast('GPS: rumbo a ' + a.name, 2000); closeMap(); } } });
  $('#map').addEventListener('wheel', e => { bigmap.view.scale = clamp(bigmap.view.scale * (e.deltaY > 0 ? .85 : 1.18), .8, 12); }, { passive: true });

  /* ───── cámara ───── */
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), camUp = new THREE.Vector3(0, 1, 0);
  function updateCamera(dt) {
    const a = G.plane, [f, u] = a.axes(), s = a.spec;
    G.model.root.visible = G.view !== 'cabina' && !a.crashed;
    if (G.view === 'cabina') {
      camera.position.set(...s.eye).applyQuaternion(a.q).add(a.pos); camera.quaternion.copy(a.q); camera.fov = 70;
    } else if (G.view === 'torre') {
      let best = AIRPORTS[0], bd = 1e12; for (const p of AIRPORTS) { const d = (p.x - a.pos.x) ** 2 + (p.z - a.pos.z) ** 2; if (d < bd) { bd = d; best = p; } }
      camera.position.copy(best.tower); camera.up.set(0, 1, 0); camera.lookAt(a.pos); const dist = camera.position.distanceTo(a.pos); camera.fov = clamp(Math.atan(s.chase * 1.2 / dist) * 2 * D, 2, 60);
    } else if (G.view === 'orbita' || a.crashed) {
      const d = G.orbit.dist || s.chase * 1.6, hy = a.attitude().hdg;
      _v.set(Math.sin(hy + G.orbit.yaw) * Math.cos(G.orbit.pitch), Math.sin(G.orbit.pitch), -Math.cos(hy + G.orbit.yaw) * Math.cos(G.orbit.pitch)).multiplyScalar(-d);
      camera.position.copy(a.pos).add(_v); const gy = GS.height(camera.position.x, camera.position.z) + 2; if (camera.position.y < gy) camera.position.y = gy; camera.up.set(0, 1, 0); camera.lookAt(a.pos); camera.fov = 60;
    } else {
      const d = s.chase; _v.copy(a.vel.lengthSq() > 25 ? a.vel : f).normalize();
      _w.copy(_v).multiplyScalar(-d).addScaledVector(u, d * .22).add(a.pos);
      if (!G.camInit) { camera.position.copy(_w); G.camInit = true; }
      camera.position.lerp(_w, 1 - Math.exp(-dt * 7));
      const gy = GS.surface(camera.position.x, camera.position.z).y + 1.5; if (camera.position.y < gy) camera.position.y = gy;
      camUp.lerp(u, 1 - Math.exp(-dt * 3)).normalize(); camera.up.copy(camUp).lerp(_w.set(0, 1, 0), .45).normalize();
      camera.lookAt(_w.copy(a.pos).addScaledVector(f, d * .6)); camera.fov = 62 + Math.min(10, a.vel.length() / 25);
    }
    if (G.shake > 0) { camera.position.x += (Math.random() - .5) * G.shake * 3; camera.position.y += (Math.random() - .5) * G.shake * 3; G.shake = Math.max(0, G.shake - dt); }
    camera.updateProjectionMatrix();
  }

  /* ───── bucle ───── */
  let last = performance.now(), acc = 0, attract = 0;
  const demoModel = buildPlane('pampa'); scene.add(demoModel.root);
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(.1, (now - last) / 1000); last = now; G.t += dt;
    if (G.mode === 'title' || G.mode === 'menu') {
      // vuelo de demostración alrededor del aeropuerto principal
      attract += dt * .045; const p = AIRPORTS[0], R = 2600, cx = p.x, cz = p.z;
      const x = cx + Math.cos(attract) * R, z = cz + Math.sin(attract) * R, y = p.e + 520;
      demoModel.root.visible = true; demoModel.root.position.set(x, y, z);
      demoModel.root.rotation.order = 'YXZ'; demoModel.root.rotation.set(0, Math.PI - attract, -.32);
      const ca = attract - .022 + Math.sin(G.t * .07) * .012; camera.position.set(cx + Math.cos(ca) * (R + 45 + Math.sin(G.t * .05) * 30), y + 12, cz + Math.sin(ca) * (R + 45)); camera.up.set(0, 1, 0); camera.lookAt(x, y, z); camera.fov = 45; camera.updateProjectionMatrix();
      animatePlane(demoModel, { ail: 0, elev: 0, rud: 0, rpm: .7, engineOn: true, spec: SPECS.pampa, ab: false, gearPos: 0 }, dt);
      if (G.mode === 'title' && !world.titleTime) { world.setWeather('despejado'); world.setTime(16.5); world.titleTime = true; }
      world.update(camera.position, 6);
    } else if (G.plane) {
      demoModel.root.visible = false;
      const a = G.plane;
      if (G.mode === 'loading') {
        const left = world.update(a.pos, 40); const total = (world.radius * 2 + 1) ** 2;
        $('#loadBar').style.width = Math.round((1 - left / total) * 100) + '%';
        if (left === 0 || performance.now() - G.loadT > 12000) { G.mode = 'fly'; hideScreens(); if (ON()) ON().onSpawn(); else if (G.mission) toast(G.mission.def.desc, 5000); else if (G.plane.ammo && G.plane.ammo.maxM && tanks.length) toast('Hay tanques de práctica cerca: seguí la flecha violeta · X bombas · V misiles', 4500); else toast('Apretá H o mirá Controles si no sabés por dónde empezar', 3500); }
      } else if (G.mode === 'fly' && ((!G.ui && !G.mapOpen) || ON())) {
        // en línea el mundo no se pausa: con un menú abierto el avión sigue volando solo
        if (!G.ui && !G.mapOpen) readControls(dt); else { a.wantFire = false; a.elev *= .9; a.ail *= .9; a.rud *= .9; }
        fireGuns(a, dt);
        acc += dt; let n = 0; while (acc >= 1 / 120 && n++ < 24) { a.step(1 / 120, G.wind); acc -= 1 / 120; } if (n >= 24) acc = 0;
        world.update(a.pos, 5);
        for (const ev of a.events.splice(0)) handleEvent(ev);
        updShots(dt);
        if (a.ammo && ON()) { const am = a.ammo; if (am.maxM && am.missiles === 0 && (am.rM += dt) > 15) { am.missiles = am.maxM; am.rM = 0; toast('Misiles recargados', 1100); } if (am.maxB && am.bombs === 0 && (am.rB += dt) > 15) { am.bombs = am.maxB; am.rB = 0; } }
        const m = G.mission;
        if (m) {
          m.t += dt;
          if (m.rings && m.ringIdx < m.rings.length) {
            const r = m.rings[m.ringIdx], dn = [Math.sin(r.hdg), -Math.cos(r.hdg)], rel = [a.pos.x - r.x, a.pos.z - r.z], side = rel[0] * dn[0] + rel[1] * dn[1];
            if (m.prevSide != null && m.prevSide < 0 && side >= 0) { const lat = Math.abs(rel[0] * dn[1] - rel[1] * dn[0]), dy = Math.abs(a.pos.y - r.y); if (Math.hypot(lat, dy) < 30) { m.ringIdx++; SND.blip('ding'); ringMeshes.forEach((mm, i) => { mm.visible = i >= m.ringIdx; mm.material = i === m.ringIdx ? ringMat : ringMatOff; }); m.prevSide = null; } }
            if (m.ringIdx < m.rings.length) { const r2 = m.rings[m.ringIdx]; m.prevSide = (a.pos.x - r2.x) * Math.sin(r2.hdg) + (a.pos.z - r2.z) * -Math.cos(r2.hdg); }
          }
          const res = m.def.update(m, a);
          if (res) { if (res.win && res.val != null) { const b = BEST[m.def.id], better = b == null || (m.def.best === 'time' ? res.val < b : res.val > b); if (better) { BEST[m.def.id] = res.val; saveBest(); res.text += ' ¡Nuevo récord!'; } } over(res.win, res.win ? '¡Desafío cumplido!' : 'Casi…', res.text, res.win); }
        }
        // avisos de suelo
        G.pullUp = !a.onGround && a.vs < -6 && a.agl < 450 && a.agl / -a.vs < 9 && !(a.surf && a.surf.type === 'runway' && a.gearPos > .9 && a.vs > -9);
      }
      if (G.model) { G.model.root.position.copy(a.pos); G.model.root.quaternion.copy(a.q); animatePlane(G.model, a, dt); }
      if (ON()) ON().tick(dt);
      updateCamera(dt);
    }
    // niebla y luz según la hora
    const [n, f] = world.fogRange(); scene.fog.near = n; scene.fog.far = f; if (world.fogColor) scene.fog.color.copy(world.fogColor);
    camera.far = Math.max(f * 1.3, 20000); camera.updateProjectionMatrix();
    updFx(dt); updTanks(dt); updBullets(dt);
    SND.update(G.plane, G.mode === 'fly' && (!G.ui || !!ON()));
    renderer.render(scene, camera);
    // instrumentos
    if (G.mapOpen) bigmap.draw(G.plane, G.destAp, G.mission && G.mission.rings, G.mission ? G.mission.ringIdx : 0);
    let dest = null;
    if (G.plane && G.destAp) { const dx = G.destAp.x - G.plane.pos.x, dz = G.destAp.z - G.plane.pos.z; dest = { x: G.destAp.x, z: G.destAp.z, dist: Math.hypot(dx, dz), brg: (Math.atan2(dx, -dz) + Math.PI * 2) % (Math.PI * 2), label: G.destAp.code }; }
    if (G.plane && G.mission && G.mission.rings && G.mission.ringIdx < G.mission.rings.length) { const r = G.mission.rings[G.mission.ringIdx], dx = r.x - G.plane.pos.x, dz = r.z - G.plane.pos.z; dest = { x: r.x, z: r.z, dist: Math.hypot(dx, dz), brg: (Math.atan2(dx, -dz) + Math.PI * 2) % (Math.PI * 2), label: 'Aro ' + (G.mission.ringIdx + 1) }; }
    if (G.plane && G.mission && G.mission.target && !G.mission.hit) { const t = G.mission.target, dx = t.x - G.plane.pos.x, dz = t.z - G.plane.pos.z; dest = { x: t.x, z: t.z, dist: Math.hypot(dx, dz), brg: (Math.atan2(dx, -dz) + Math.PI * 2) % (Math.PI * 2), label: 'Blanco' }; }
    if (G.plane && tanks.length && !(G.mission && G.mission.target && G.mission.def.target) && (G.mission || !G.destAp)) { const t = nearestTank(G.plane.pos); if (t) { const dx = t.x - G.plane.pos.x, dz = t.z - G.plane.pos.z; dest = { x: t.x, z: t.z, dist: Math.hypot(dx, dz), brg: (Math.atan2(dx, -dz) + Math.PI * 2) % (Math.PI * 2), label: 'Tanque' }; } }
    hud.draw({ blips: ON() ? ON().blips() : null, S, touch: TOUCH, plane: G.mode === 'fly' || G.mode === 'over' ? G.plane : null, hidden: !G.showHud || G.mapOpen || (G.ui && G.ui !== 'sOver'), view: G.view, fov: camera.fov, ap: !!G.ap, pullUp: G.pullUp, dest, destAp: G.destAp, mission: G.mission, rings: G.mission && G.mission.rings, ringIdx: G.mission ? G.mission.ringIdx : 0 });
    if (G.plane && G.mode === 'fly' && G.showHud && !G.mapOpen && !G.ui) drawSight(hud.g, G.plane);
    if (ON()) ON().draw(hud.g, hud);
    $('#touch').hidden = !(TOUCH && G.mode === 'fly' && !G.ui && !G.mapOpen);
  }
  /* mira de las ametralladoras y recuadro del misil fijado */
  const _sp = new THREE.Vector3();
  function project(v) { _sp.copy(v).project(camera); return _sp.z < 1 ? { x: (_sp.x + 1) / 2 * innerWidth, y: (1 - _sp.y) / 2 * innerHeight } : null; }
  function drawSight(g, a) {
    const armed = ON() || (a.ammo && (a.ammo.maxM || a.ammo.maxB)) || performance.now() - (a.lastFire || 0) < 3000;
    if (!armed || a.crashed) return;
    const [f] = a.axes(), p = project(_g0.copy(a.pos).addScaledVector(f, 380).addScaledVector(a.vel, 380 / 880));
    if (p) { g.strokeStyle = 'rgba(255,214,120,.9)'; g.lineWidth = 1.6; g.beginPath(); g.arc(p.x, p.y, 13, 0, 7); g.moveTo(p.x - 22, p.y); g.lineTo(p.x - 7, p.y); g.moveTo(p.x + 7, p.y); g.lineTo(p.x + 22, p.y); g.moveTo(p.x, p.y + 7); g.lineTo(p.x, p.y + 18); g.stroke(); g.fillStyle = 'rgba(255,214,120,.9)'; g.fillRect(p.x - 1, p.y - 1, 2, 2); }
    if (a.ammo && a.ammo.maxM && a.ammo.missiles > 0) {
      const t = lockTarget(a.pos, f); if (!t) return; const q = project(_g1.set(t.x, t.y + (t.isPlane ? 0 : 1.5), t.z)); if (!q) return;
      const blink = (performance.now() / 160 | 0) % 2; g.strokeStyle = blink ? '#ff4d4d' : '#ffb0b0'; g.lineWidth = 2; g.strokeRect(q.x - 20, q.y - 20, 40, 40);
      g.font = '700 12px "JetBrains Mono", monospace'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#ff4d4d'; g.fillText('FIJADO · V', q.x + 28, q.y);
    }
  }
  function handleEvent(ev) {
    const a = G.plane;
    if (ev.t === 'crash') { explode(ev.pos); G.ap = null; if (ON()) { ON().onDeath(ev); return; } setTimeout(() => { if (G.plane === a) over(false, '¡Te estrellaste!', ev.why + '.', false); }, 2200); }
    if (ev.t === 'touchdown') {
      SND.blip('touch'); if (G.mission) G.mission.td = ev;
      const s = landingScore(ev); if (s && !G.mission) toast(ev.onRunway ? `Aterrizaje ${s.word} · ${hud.units(-s.vs, 'vs', S)} ${hud.label('vs', S)} · ${s.score}/100` : `Tocaste el suelo fuera de la pista (${s.word})`, 3500);
      G.ap = null;
    }
    if (ev.t === 'liftoff' && !G.mission && !ON()) toast('¡Despegaste! Subí el tren con G cuando estés subiendo', 2600);
  }

  /* inicio */
  world.setWeather('despejado'); world.setTime(16.5); go.title();
  requestAnimationFrame(frame);
  GS.game = { go, act, G, S, K, TOUCH, scene, camera, world, SPECS, AIRPORTS, toast, show, hideScreens, startFlight, endFlight, explode, puff, spawnBullet, cosmeticMissile, segDist, project, SND, GUNS, renderFree: () => renderFree(), pause };
  window.__gs = { tanks: () => tanks, shots: () => shots.length, shotList: () => shots, G, S, K, world, camera, scene, act, go, startFlight, endFlight, MISSIONS, SPECS, touch, get plane() { return G.plane; } };
})();
