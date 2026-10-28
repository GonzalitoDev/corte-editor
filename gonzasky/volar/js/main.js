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
        this.horn = c.createOscillator(); this.horn.type = 'square'; this.horn.frequency.value = 880; this.hornG = c.createGain(); this.hornG.gain.value = 0; this.horn.connect(this.hornG); this.hornG.connect(this.master); this.horn.start();
      } catch (e) { this.ctx = null; }
    },
    update(a, active) {
      if (!this.ctx) return; const t = this.ctx.currentTime, s = a && a.spec, set = (p, v) => p.setTargetAtTime(v, t, .08);
      this.master.gain.value = S.vol;
      if (!active || !a || a.crashed) { [this.oscG, this.jetG, this.whG, this.windG, this.hornG].forEach(g => set(g.gain, 0)); return; }
      const rpm = a.engineOn ? a.rpm : 0, V = a.vel.length(), cab = G.view === 'cabina' ? 1 : .7;
      if (s.prop) { set(this.osc.frequency, 38 + rpm * 95); set(this.oscLp.frequency, 300 + rpm * 900); set(this.oscG.gain, (a.engineOn ? .05 + rpm * .12 : 0) * cab); set(this.jetG.gain, 0); set(this.whG.gain, 0); }
      else { set(this.oscG.gain, 0); set(this.jetBp.frequency, 400 + rpm * 1800 + (a.ab ? 600 : 0)); set(this.jetG.gain, (a.engineOn ? .06 + rpm * .2 + (a.ab ? .12 : 0) : 0) * cab); set(this.whine.frequency, 1800 + rpm * 2600); set(this.whG.gain, a.engineOn ? .006 + rpm * .012 : 0); }
      set(this.windLp.frequency, 300 + V * 8); set(this.windG.gain, Math.min(.25, V * V / 90000));
      set(this.hornG.gain, a.stall && (t * 4 | 0) % 2 ? .05 : 0);
    },
    blip(kind) {
      if (!this.ctx) return; const c = this.ctx, t = c.currentTime, g = c.createGain(); g.connect(this.master);
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
  function explode(p) {
    for (let i = 0; i < 46; i++) {
      const fire = i < 22, m = new THREE.SpriteMaterial({ map: glowTex, color: fire ? 0xff8a2a : 0x2b2b2b, transparent: true, depthWrite: false, blending: fire ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: fire ? 1 : .8 });
      const s = new THREE.Sprite(m); s.position.copy(p); s.scale.setScalar(fire ? 8 : 12);
      s.userData = { v: new THREE.Vector3((Math.random() - .5) * (fire ? 30 : 10), Math.random() * (fire ? 25 : 12) + 4, (Math.random() - .5) * (fire ? 30 : 10)), life: fire ? 1.4 : 6, max: fire ? 1.4 : 6, grow: fire ? 22 : 9, fire };
      scene.add(s); fx.push(s);
    }
    G.shake = 1.2; SND.blip('boom');
  }
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
    else { const [x, z] = apWorld(port, -port.len / 2 - 1500, 0); a.place(x, port.e + (st.alt || 900), z, port.hdg, st.speed || spec.cruise * .85, false); }
    if (st.engineOff) { a.engineOn = false; a.throttle = 0; a.rpm = 0; }
    G.hour = cfg.hour ?? 13; G.weather = cfg.weather || 'despejado'; world.setWeather(G.weather); world.setTime(G.hour);
    const wa = Math.random() * Math.PI * 2, ws = cfg.wind || 0; G.wind.set(Math.sin(wa) * ws, 0, Math.cos(wa) * ws);
    if (cfg.mission && cfg.mission.id === 'noche') { const n = ap('SUR'); G.wind.set(Math.cos(n.hdg) * 7, 0, Math.sin(n.hdg) * 7); }
    G.ap = null; G.destAp = cfg.dest ? ap(cfg.dest) : (st.kind === 'final' ? port : null);
    G.mission = cfg.mission ? { def: cfg.mission, t: 0, td: null, ringIdx: 0, rings: null, hud: '' } : null;
    ringMeshes.forEach(m => scene.remove(m)); ringMeshes = [];
    if (G.mission && cfg.mission.rings) { const r = makeRings(a.pos.x, a.pos.z, port.hdg, cfg.mission.rings); G.mission.rings = r; showRings(r); }
    G.view = 'persecucion'; G.orbit.dist = spec.chase * 1.6; G.landing = null; G.tdShown = 0;
    G.mode = 'loading'; show('sLoad'); $('#loadBar').style.width = '0'; G.loadT = performance.now(); G.camInit = false;
    fx.forEach(s => scene.remove(s)); fx.length = 0;
  }
  function endFlight() {
    if (G.model) scene.remove(G.model.root); G.model = null; G.plane = null; G.mission = null; ringMeshes.forEach(m => scene.remove(m)); ringMeshes = [];
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
      case 'KeyI': G.showHud = !G.showHud; break;
      case 'KeyH': go.help(); break;
      case 'KeyP': case 'Escape': pause(); break;
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e => { K[e.code] = false; });
  addEventListener('blur', () => { for (const k in K) K[k] = false; if (G.mode === 'fly' && !G.ui) pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.mode === 'fly' && !G.ui) pause(); });
  function pause() { if (G.mode !== 'fly') return; if (document.pointerLockElement) document.exitPointerLock(); show('sPause'); }
  function cycleView() { const v = ['persecucion', 'cabina', 'orbita', 'torre']; G.view = v[(v.indexOf(G.view) + 1) % v.length]; toast({ persecucion: 'Cámara de atrás', cabina: 'Cabina', orbita: 'Cámara libre: arrastrá para girar', torre: 'Vista desde la torre' }[G.view], 1400); }
  function toggleAP() { const a = G.plane; if (a.onGround) return toast('El piloto automático se usa en el aire'); if (G.ap) { G.ap = null; toast('Piloto automático apagado', 1400); } else { const at = a.attitude(); G.ap = { alt: a.pos.y, hdg: at.hdg }; toast('Piloto automático: mantiene altura y rumbo', 1800); } }
  // mouse: girar la cámara en órbita, rueda para el motor, y volar con el mouse si está activado
  let drag = null; const mstick = { x: 0, y: 0 };
  $('#c').addEventListener('pointerdown', e => { if (G.mode !== 'fly' || G.ui || e.pointerType === 'touch') return; if (S.mouseFly && !document.pointerLockElement) { try { $('#c').requestPointerLock(); } catch (_) { } return; } drag = { x: e.clientX, y: e.clientY }; });
  addEventListener('pointermove', e => {
    if (document.pointerLockElement && S.mouseFly) { mstick.x = clamp(mstick.x + e.movementX * .004 * S.sens, -1, 1); mstick.y = clamp(mstick.y + e.movementY * .004 * S.sens, -1, 1); return; }
    if (drag) { G.orbit.yaw -= (e.clientX - drag.x) * .006; G.orbit.pitch = clamp(G.orbit.pitch + (e.clientY - drag.y) * .005, -1.2, 1.4); drag = { x: e.clientX, y: e.clientY }; if (G.view === 'persecucion') G.view = 'orbita'; }
  });
  addEventListener('pointerup', () => drag = null);
  addEventListener('contextmenu', e => { if (G.mode === 'fly') { e.preventDefault(); mstick.x = mstick.y = 0; } });
  addEventListener('wheel', e => { if (G.mode !== 'fly' || G.ui) return; if (G.view === 'orbita') G.orbit.dist = clamp(G.orbit.dist * (e.deltaY > 0 ? 1.12 : .89), 8, 600); else G.plane.throttle = clamp(G.plane.throttle - Math.sign(e.deltaY) * .05, 0, 1); }, { passive: true });

  // táctil: volante, acelerador y botones
  const touch = { x: 0, y: 0, rud: 0 };
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
        const on = v => { b.classList.toggle('on', v); if (k === 'brakes') K.Space = v; if (k === 'rudL') touch.rud = v ? -1 : 0; if (k === 'rudR') touch.rud = v ? 1 : 0; };
        b.addEventListener('pointerdown', e => { e.preventDefault(); on(true); }); ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => b.addEventListener(t, () => on(false)));
      } else b.addEventListener('click', () => {
        const a = G.plane; if (!a || G.mode !== 'fly') return;
        if (k === 'flaps') { a.flaps = (a.flaps + 1) % 4; toast('Flaps ' + ['0', '1', '2', 'total'][a.flaps], 900); }
        if (k === 'gear') { if (a.spec.fixedGear) toast('Este avión tiene tren fijo', 1200); else { a.gearDown = !a.gearDown; toast(a.gearDown ? 'Bajando el tren' : 'Subiendo el tren', 1000); } }
        if (k === 'cam') cycleView(); if (k === 'map') openMap(); if (k === 'ap') toggleAP(); if (k === 'pause') pause();
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
      if (edge(0) && !a.spec.fixedGear) a.gearDown = !a.gearDown; if (pr(1)) K.PadBrake = true; else K.PadBrake = false;
      if (edge(2)) a.flaps = (a.flaps + 1) % 4; if (edge(3)) cycleView(); if (edge(9)) pause(); if (edge(4)) toggleAP();
    }
    if (S.invert) pitch = -pitch;
    pitch = clamp(pitch * S.sens, -1, 1); roll = clamp(roll * S.sens, -1, 1); yaw = clamp(yaw, -1, 1);
    const k = v => Math.min(1, dt * (v ? 3.5 : 5));
    a.elev += (pitch - a.elev) * k(pitch); a.ail += (roll - a.ail) * k(roll); a.rud += (yaw - a.rud) * k(yaw);
    if (K.ShiftLeft || K.ShiftRight || K.Equal || K.NumpadAdd || K.PageUp) a.throttle = Math.min(1, a.throttle + dt * .5);
    if (K.KeyZ || K.Minus || K.NumpadSubtract || K.PageDown) a.throttle = Math.max(0, a.throttle - dt * .5);
    a.brakes = !!(K.KeyB || K.Space || K.PadBrake);
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
        if (left === 0 || performance.now() - G.loadT > 12000) { G.mode = 'fly'; hideScreens(); if (G.mission) toast(G.mission.def.desc, 5000); else toast('Apretá H o mirá Controles si no sabés por dónde empezar', 3500); }
      } else if (G.mode === 'fly' && !G.ui && !G.mapOpen) {
        readControls(dt);
        acc += dt; let n = 0; while (acc >= 1 / 120 && n++ < 24) { a.step(1 / 120, G.wind); acc -= 1 / 120; } if (n >= 24) acc = 0;
        world.update(a.pos, 5);
        for (const ev of a.events.splice(0)) handleEvent(ev);
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
      updateCamera(dt);
    }
    // niebla y luz según la hora
    const [n, f] = world.fogRange(); scene.fog.near = n; scene.fog.far = f; if (world.fogColor) scene.fog.color.copy(world.fogColor);
    camera.far = Math.max(f * 1.3, 20000); camera.updateProjectionMatrix();
    updFx(dt);
    SND.update(G.plane, G.mode === 'fly' && !G.ui);
    renderer.render(scene, camera);
    // instrumentos
    if (G.mapOpen) bigmap.draw(G.plane, G.destAp, G.mission && G.mission.rings, G.mission ? G.mission.ringIdx : 0);
    let dest = null;
    if (G.plane && G.destAp) { const dx = G.destAp.x - G.plane.pos.x, dz = G.destAp.z - G.plane.pos.z; dest = { x: G.destAp.x, z: G.destAp.z, dist: Math.hypot(dx, dz), brg: (Math.atan2(dx, -dz) + Math.PI * 2) % (Math.PI * 2), label: G.destAp.code }; }
    if (G.plane && G.mission && G.mission.rings && G.mission.ringIdx < G.mission.rings.length) { const r = G.mission.rings[G.mission.ringIdx], dx = r.x - G.plane.pos.x, dz = r.z - G.plane.pos.z; dest = { x: r.x, z: r.z, dist: Math.hypot(dx, dz), brg: (Math.atan2(dx, -dz) + Math.PI * 2) % (Math.PI * 2), label: 'Aro ' + (G.mission.ringIdx + 1) }; }
    hud.draw({ S, touch: TOUCH, plane: G.mode === 'fly' || G.mode === 'over' ? G.plane : null, hidden: !G.showHud || G.mapOpen || (G.ui && G.ui !== 'sOver'), view: G.view, fov: camera.fov, ap: !!G.ap, pullUp: G.pullUp, dest, destAp: G.destAp, mission: G.mission, rings: G.mission && G.mission.rings, ringIdx: G.mission ? G.mission.ringIdx : 0 });
    $('#touch').hidden = !(TOUCH && G.mode === 'fly' && !G.ui && !G.mapOpen);
  }
  function handleEvent(ev) {
    const a = G.plane;
    if (ev.t === 'crash') { explode(ev.pos); G.ap = null; setTimeout(() => { if (G.plane === a) over(false, '¡Te estrellaste!', ev.why + '.', false); }, 2200); }
    if (ev.t === 'touchdown') {
      SND.blip('touch'); if (G.mission) G.mission.td = ev;
      const s = landingScore(ev); if (s && !G.mission) toast(ev.onRunway ? `Aterrizaje ${s.word} · ${hud.units(-s.vs, 'vs', S)} ${hud.label('vs', S)} · ${s.score}/100` : `Tocaste el suelo fuera de la pista (${s.word})`, 3500);
      G.ap = null;
    }
    if (ev.t === 'liftoff' && !G.mission) toast('¡Despegaste! Subí el tren con G cuando estés subiendo', 2600);
  }

  /* inicio */
  world.setWeather('despejado'); world.setTime(16.5); go.title();
  requestAnimationFrame(frame);
  window.__gs = { G, S, K, world, camera, scene, act, go, startFlight, endFlight, MISSIONS, SPECS, touch, get plane() { return G.plane; } };
})();
