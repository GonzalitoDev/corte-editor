/* GonzaCraft — juego: jugador, física, interfaz, guardado, sonido y multijugador */
(function () {
  'use strict';
  const GC = window.GC;
  const { B, World, CH, SEA, SOL, KIND, icon, PALETTE, hashStr, BIONAME } = GC;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const DESKTOP = /Electron/i.test(navigator.userAgent);
  if (DESKTOP) document.body.classList.add('desktop');
  const TOUCH = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || /Android|iPhone|iPad/i.test(navigator.userAgent) || /[?&]tactil/.test(location.search);
  if (TOUCH) document.body.classList.add('touch');
  const APP = /GonzaCraftAndroid/i.test(navigator.userAgent);
  if (APP) document.body.classList.add('android');

  /* ───────── opciones ───────── */
  const S = { rd: 6, fov: 75, sens: 1, vol: .7, fps: false, clouds: true, name: 'Jugador' + (100 + Math.random() * 900 | 0) };
  if (TOUCH) S.rd = 4;
  try { Object.assign(S, JSON.parse(localStorage.getItem('gc_settings') || '{}')); } catch (e) { }
  const saveS = () => { try { localStorage.setItem('gc_settings', JSON.stringify(S)); } catch (e) { } };
  /* mod menu: trucos para tu propio juego */
  const MOD = { fly: false, noclip: false, speed: 1, jump: 1, god: false, strength: 1, instant: false, infinite: false, reach: 5.5, boom: 4, night: false, xray: false, freeze: false, mobs: true, peaceful: false, creativeAtk: false };
  try { Object.assign(MOD, JSON.parse(localStorage.getItem('gc_mods') || '{}')); } catch (e) { }
  MOD.xray = false;
  const saveMod = () => { try { localStorage.setItem('gc_mods', JSON.stringify(MOD)); } catch (e) { } };

  /* ───────── render ───────── */
  const canvas = $('#c');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); }
  catch (e) { document.body.innerHTML = '<section class="screen"><h2>No se pudo iniciar el juego</h2><p>Tu navegador o tu placa de video no soportan WebGL. Probá con Chrome o Edge actualizados.</p></section>'; return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, TOUCH ? 1.25 : 1.5));
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x8ec5ff, 60, 96);
  const camera = new THREE.PerspectiveCamera(S.fov, 1, .05, 1200); camera.rotation.order = 'YXZ';
  const mats = GC.makeMaterials();
  function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
  resize(); addEventListener('resize', resize);

  /* cielo: sol, luna, estrellas y nubes */
  const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; return t; };
  const skyMat = map => new THREE.MeshBasicMaterial({ map, transparent: true, fog: false, depthWrite: false });
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), skyMat(canvasTex(16, 16, (g) => { g.fillStyle = 'rgba(255,240,170,.35)'; g.fillRect(0, 0, 16, 16); g.fillStyle = '#fff6c8'; g.fillRect(3, 3, 10, 10); g.fillStyle = '#fffbe8'; g.fillRect(5, 5, 6, 6); })));
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), skyMat(canvasTex(16, 16, (g) => { g.fillStyle = '#dfe4ee'; g.fillRect(3, 3, 10, 10); g.fillStyle = '#b9c0cf'; g.fillRect(5, 5, 3, 3); g.fillRect(9, 9, 2, 2); g.fillRect(9, 5, 1, 1); })));
  [sun, moon].forEach(m => { m.renderOrder = -2; scene.add(m); });
  const starGeo = new THREE.BufferGeometry(); { const p = [], r = GC.rng(7); for (let i = 0; i < 900; i++) { const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u); p.push(Math.cos(a) * s * 600, Math.abs(u) * 600, Math.sin(a) * s * 600); } starGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); }
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
  stars.renderOrder = -3; scene.add(stars);
  const cloudTex = canvasTex(64, 64, (g) => { const n = new GC.Noise(5); for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const v = n.noise2(x / 9, y / 9) + n.noise2(x / 4, y / 4) * .3; if (v > .35) { g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(x, y, 1, 1); } } });
  cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping; cloudTex.repeat.set(8, 8);
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, fog: false, depthWrite: false, side: THREE.DoubleSide }));
  clouds.rotation.x = -Math.PI / 2; clouds.renderOrder = -1; scene.add(clouds);

  /* selección y grietas */
  const hl = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: .55 }));
  hl.visible = false; scene.add(hl);
  const crack = new THREE.Mesh(new THREE.BoxGeometry(1.01, 1.01, 1.01), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  crack.visible = false; scene.add(crack);

  /* partículas al romper */
  const tileColor = (() => { const c = GC.atlasCanvas.getContext('2d'), cache = {}; return id => { if (cache[id]) return cache[id]; const t = B[id].t[2], d = c.getImageData((t % 16) * 16, (t / 16 | 0) * 16, 16, 16).data; let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 100) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } n = n || 1; return (cache[id] = new THREE.Color(r / n / 255, g / n / 255, b / n / 255)); }; })();
  const partGeo = new THREE.BoxGeometry(.13, .13, .13), parts = [];
  function burst(x, y, z, id) {
    const m = new THREE.MeshBasicMaterial({ color: id > 255 ? id : tileColor(id) });
    for (let i = 0; i < 10; i++) { const p = new THREE.Mesh(partGeo, m); p.position.set(x + .2 + Math.random() * .6, y + .2 + Math.random() * .6, z + .2 + Math.random() * .6); p.userData = { v: new THREE.Vector3((Math.random() - .5) * 4, Math.random() * 4 + 1, (Math.random() - .5) * 4), life: .5 + Math.random() * .4 }; scene.add(p); parts.push(p); }
  }
  function smoke(x, y, z) {
    const m = new THREE.MeshBasicMaterial({ color: 0x3a3a3a, transparent: true, opacity: .7 });
    for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(partGeo, m); p.position.set(x + (Math.random() - .5) * .6, y + Math.random(), z + (Math.random() - .5) * .6); p.userData = { v: new THREE.Vector3((Math.random() - .5), 2 + Math.random(), (Math.random() - .5)), life: .6, smoke: true }; scene.add(p); parts.push(p); }
  }
  function updParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i], u = p.userData; u.life -= dt; if (!u.smoke) u.v.y -= 18 * dt; p.position.addScaledVector(u.v, dt); if (G.world && SOL[G.world.get(Math.floor(p.position.x), Math.floor(p.position.y), Math.floor(p.position.z))]) { u.v.set(0, 0, 0); } if (u.life <= 0) { scene.remove(p); parts.splice(i, 1); } }
  }

  /* ───────── sonido sintetizado ───────── */
  let actx = null, noiseBuf = null;
  function sfx(type, mat = 'stone') {
    if (!S.vol) return;
    try {
      if (!actx) { actx = new (window.AudioContext || window.webkitAudioContext)(); noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime, g = actx.createGain(); g.connect(actx.destination);
      if (type === 'hurt') { const o = actx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(90, t + .25); g.gain.setValueAtTime(.18 * S.vol, t); g.gain.exponentialRampToValueAtTime(.001, t + .28); o.connect(g); o.start(t); o.stop(t + .3); return; }
      if (type === 'hit' || type === 'mob' || type === 'mobdie' || type === 'boom') {
        const o = actx.createOscillator(), F = { sombra: [110, 70, 'sawtooth'], rocoso: [70, 40, 'square'], chispa: [900, 1400, 'triangle'] }[mat] || [180, 60, 'square'];
        if (type === 'boom') { const src = actx.createBufferSource(); src.buffer = noiseBuf; const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; g.gain.setValueAtTime(.9 * S.vol, t); g.gain.exponentialRampToValueAtTime(.001, t + 1.2); src.connect(lp); lp.connect(g); src.start(t); src.stop(t + 1.2); return; }
        const len = type === 'hit' ? .12 : type === 'mobdie' ? .5 : .7;
        o.type = type === 'hit' ? 'square' : F[2]; o.frequency.setValueAtTime(type === 'hit' ? 160 : F[0], t); o.frequency.exponentialRampToValueAtTime(type === 'hit' ? 60 : F[1], t + len);
        g.gain.setValueAtTime((type === 'mob' ? .07 : .16) * S.vol, t); g.gain.exponentialRampToValueAtTime(.001, t + len); o.connect(g); o.start(t); o.stop(t + len + .02); return;
      }
      if (type === 'pop') { const o = actx.createOscillator(); o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(900, t + .06); g.gain.setValueAtTime(.12 * S.vol, t); g.gain.exponentialRampToValueAtTime(.001, t + .1); o.connect(g); o.start(t); o.stop(t + .12); return; }
      const f = { stone: 1700, wood: 820, dirt: 480, grass: 650, sand: 1150, glass: 3200, water: 700 }[mat] || 1000;
      const [vol, len, q] = { break: [.55, .2, 1.2], place: [.4, .11, 2], step: [.12, .07, 1], splash: [.35, .45, .6], dig: [.18, .09, 1.5] }[type] || [.3, .1, 1];
      const src = actx.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = .8 + Math.random() * .4;
      const bp = actx.createBiquadFilter(); bp.type = type === 'splash' ? 'lowpass' : 'bandpass'; bp.frequency.value = f * (.9 + Math.random() * .2); bp.Q.value = q;
      g.gain.setValueAtTime(vol * S.vol, t); g.gain.exponentialRampToValueAtTime(.001, t + len);
      src.connect(bp); bp.connect(g); src.start(t, Math.random() * .5); src.stop(t + len + .02);
    } catch (e) { }
  }

  /* ───────── guardado (IndexedDB) ───────── */
  const DB = (() => {
    let p;
    const open = () => p || (p = new Promise((res, rej) => { const r = indexedDB.open('gonzacraft', 1); r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('worlds')) d.createObjectStore('worlds', { keyPath: 'id' }); if (!d.objectStoreNames.contains('chunks')) d.createObjectStore('chunks'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
    const tx = async (st, mode, fn) => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction(st, mode), q = fn(t.objectStore(st)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
    const range = id => IDBKeyRange.bound(id + '|', id + '|￿');
    return {
      worlds: () => tx('worlds', 'readonly', s => s.getAll()).catch(() => []),
      putWorld: w => tx('worlds', 'readwrite', s => s.put(w)).catch(e => console.warn(e)),
      delWorld: async id => { await tx('worlds', 'readwrite', s => s.delete(id)); await tx('chunks', 'readwrite', s => s.delete(range(id))); },
      chunkKeys: id => tx('chunks', 'readonly', s => s.getAllKeys(range(id))).catch(() => []),
      getChunk: k => tx('chunks', 'readonly', s => s.get(k)),
      putChunks: list => list.length ? tx('chunks', 'readwrite', s => { list.forEach(([k, d]) => s.put(d, k)); }).catch(e => console.warn(e)) : Promise.resolve(),
      allChunks: async id => { const keys = await tx('chunks', 'readonly', s => s.getAllKeys(range(id))), vals = await tx('chunks', 'readonly', s => s.getAll(range(id))); return keys.map((k, i) => [k.split('|')[1], vals[i]]); },
    };
  })();

  /* ───────── estado ───────── */
  const G = { state: 'boot', world: null, meta: null, remote: false, time: .1, ui: null, target: null, breakT: 0, breakKey: '', lastAct: 0, mouse: [false, false, false], saveT: 0, fpsN: 0, fpsT: 0, fps: 0, menuYaw: 0, lockWanted: false };
  const P = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, onGround: false, flying: false, inWater: false, headWater: false, sprint: false, crouch: false, health: 20, air: 10, mode: 'survival', inv: new Array(36).fill(null), sel: 0, fallStart: null, lastHurt: 0, regenT: 0, spawn: [0, 80, 0], step: 0 };
  const K = {};
  const W_ = .3, EYE = 1.62;
  const playing = () => G.state === 'play';

  /* ───────── pantallas ───────── */
  let backFrom = 'title';
  function show(id) { $$('.screen').forEach(s => s.hidden = s.id !== id); G.ui = id; $('#hud').hidden = !(G.state === 'play' || G.state === 'dead'); }
  function hideScreens() { $$('.screen').forEach(s => s.hidden = true); G.ui = null; }
  let toastT; function toast(m, ms = 2600) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms); }
  const go = {
    title: () => { show('sTitle'); },
    worlds: async () => { show('sWorlds'); await renderWorlds(); },
    new: () => { show('sNew'); $('#nName').value = 'Mundo nuevo'; $('#nSeed').value = ''; setMode('survival'); setTimeout(() => $('#nName').select(), 30); },
    multi: () => { show('sMulti'); $('#mName').value = S.name; $('#mCode').focus(); },
    options: () => { backFrom = G.state === 'play' ? 'pause' : 'title'; show('sOptions'); renderOptions(); },
  };
  let selWorld = null, newMode = 'survival';
  function setMode(m) { newMode = m; $$('#nMode button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m)); $('#nModeHelp').textContent = m === 'creative' ? 'Bloques infinitos, volás y no te lastimás.' : 'Juntá bloques, fabricá cosas y cuidá tu vida.'; }
  async function renderWorlds() {
    const list = (await DB.worlds()).sort((a, b) => (b.played || 0) - (a.played || 0)), L = $('#worldList');
    selWorld = list.find(w => w.id === selWorld?.id) || list[0] || null;
    L.innerHTML = list.length ? '' : '<div class="empty">Todavía no tenés mundos.<br>Creá uno nuevo para empezar.</div>';
    const ago = t => { if (!t) return 'nunca'; const m = (Date.now() - t) / 60000; return m < 1 ? 'recién' : m < 60 ? `hace ${m | 0} min` : m < 1440 ? `hace ${m / 60 | 0} h` : new Date(t).toLocaleDateString(); };
    list.forEach(w => {
      const b = document.createElement('button'); b.className = 'w'; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', selWorld && w.id === selWorld.id);
      b.innerHTML = `<img src="${icon(w.mode === 'creative' ? 9 : 1)}" alt=""><div><b></b><span>${w.mode === 'creative' ? 'Creativo' : 'Supervivencia'} · jugado ${ago(w.played)}</span></div>`;
      b.querySelector('b').textContent = w.name;
      b.onclick = () => { selWorld = w; $$('.list .w').forEach(x => x.setAttribute('aria-selected', x === b)); upd(); };
      b.ondblclick = () => startWorld(w);
      L.appendChild(b);
    });
    const upd = () => { $('#btnPlay').disabled = $('#btnDel').disabled = !selWorld; }; upd();
  }
  function renderOptions() {
    const set = (id, v, f) => { $('#' + id).value = v; $('#' + id + 'V').textContent = f(v); };
    set('oRd', S.rd, v => v + ' chunks'); set('oFov', S.fov, v => v + '°'); set('oSens', S.sens, v => Math.round(v * 100) + '%'); set('oVol', S.vol, v => Math.round(v * 100) + '%');
    $('#oClouds').textContent = 'Nubes: ' + (S.clouds ? 'sí' : 'no'); $('#oFps').textContent = 'Mostrar FPS: ' + (S.fps ? 'sí' : 'no');
  }
  $('#sOptions').addEventListener('input', e => {
    const k = { oRd: 'rd', oFov: 'fov', oSens: 'sens', oVol: 'vol' }[e.target.id]; if (!k) return;
    S[k] = +e.target.value; if (k === 'fov') { camera.fov = S.fov; camera.updateProjectionMatrix(); } saveS(); renderOptions();
  });

  /* ───────── hotbar e inventario ───────── */
  const heartImg = (() => { const mk = f => { const c = document.createElement('canvas'); c.width = c.height = 9; const g = c.getContext('2d'); const px = [[0, 1, 1, 0, 0, 0, 1, 1, 0], [1, 2, 2, 1, 0, 1, 2, 2, 1], [1, 2, 2, 2, 1, 2, 2, 2, 1], [1, 2, 2, 2, 2, 2, 2, 2, 1], [0, 1, 2, 2, 2, 2, 2, 1, 0], [0, 0, 1, 2, 2, 2, 1, 0, 0], [0, 0, 0, 1, 2, 1, 0, 0, 0], [0, 0, 0, 0, 1, 0, 0, 0, 0]]; px.forEach((r, y) => r.forEach((v, x) => { if (!v) return; g.fillStyle = v === 1 ? '#1a0000' : (f === 2 || (f === 1 && x < 5)) ? '#e3262a' : '#3a2020'; g.fillRect(x, y, 1, 1); })); return c.toDataURL(); }; return [mk(0), mk(1), mk(2)]; })();
  const bubbleImg = (() => { const c = document.createElement('canvas'); c.width = c.height = 9; const g = c.getContext('2d'); g.fillStyle = '#9cd2ff'; g.beginPath(); g.arc(4.5, 4.5, 3.5, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillRect(3, 2, 2, 2); return c.toDataURL(); })();
  const slotHtml = (it, on) => `<div class="slot${on ? ' on' : ''}">${it ? `<img src="${icon(it.id)}" alt="${B[it.id].n}">${P.mode === 'survival' && it.n > 1 ? `<b>${it.n}</b>` : ''}` : ''}</div>`;
  let lastHud = '';
  function renderHud() {
    const s = P.inv.slice(0, 9).map(i => i ? i.id + ':' + i.n : '-').join() + P.sel + P.mode + Math.ceil(P.health) + (P.headWater ? Math.ceil(P.air) : 'x');
    if (s === lastHud) return; lastHud = s;
    $('#hotbar').innerHTML = P.inv.slice(0, 9).map((it, i) => slotHtml(it, i === P.sel)).join('');
    const surv = P.mode === 'survival';
    $('#hearts').innerHTML = surv ? Array.from({ length: 10 }, (_, i) => `<img class="ht" src="${heartImg[P.health >= (i + 1) * 2 ? 2 : P.health >= i * 2 + 1 ? 1 : 0]}" alt="">`).join('') : '';
    $('#air').innerHTML = surv && P.headWater ? Array.from({ length: Math.ceil(P.air) }, () => `<img class="ht" src="${bubbleImg}" alt="">`).join('') : '';
  }
  let nameT;
  function selectSlot(i) { P.sel = (i + 9) % 9; renderHud(); const it = P.inv[P.sel], n = $('#slotName'); n.textContent = it ? B[it.id].n : ''; n.classList.add('on'); clearTimeout(nameT); nameT = setTimeout(() => n.classList.remove('on'), 1400); }
  function addItem(id, n = 1) {
    if (P.mode === 'creative' || !id) return true;
    for (const it of P.inv) if (it && it.id === id && it.n < 64) { const k = Math.min(n, 64 - it.n); it.n += k; n -= k; if (!n) break; }
    for (let i = 0; i < 36 && n > 0; i++) if (!P.inv[i]) { const k = Math.min(n, 64); P.inv[i] = { id, n: k }; n -= k; }
    renderHud(); if (G.ui === 'sInv') renderInv(); return n === 0;
  }
  const count = id => P.inv.reduce((s, it) => s + (it && it.id === id ? it.n : 0), 0);
  function take(id, n) { for (let i = 35; i >= 0 && n > 0; i--) { const it = P.inv[i]; if (it && it.id === id) { const k = Math.min(n, it.n); it.n -= k; n -= k; if (!it.n) P.inv[i] = null; } } }
  const RECIPES = [
    { in: [[7, 1]], out: [9, 4] }, { in: [[22, 1]], out: [9, 4] }, { in: [[5, 2]], out: [10, 1] }, { in: [[5, 4]], out: [21, 1] },
    { in: [[4, 4]], out: [20, 2] }, { in: [[15, 1], [10, 1]], out: [24, 1] }, { in: [[9, 3]], out: [37, 1] }, { in: [[4, 3], [8, 1]], out: [39, 3] },
    { in: [[8, 4]], out: [28, 1] }, { in: [[28, 1], [25, 1]], out: [29, 1] }, { in: [[28, 1], [26, 1]], out: [31, 1] },
  ];
  let carry = null;
  function renderInv() {
    const cre = P.mode === 'creative';
    $('#invTitle').textContent = cre ? 'Todos los bloques' : 'Inventario';
    $('#invGrid').innerHTML = cre ? PALETTE.map(id => slotHtml({ id, n: 1 }, false)).join('') : P.inv.slice(9).map(it => slotHtml(it, false)).join('');
    $('#invBar').innerHTML = P.inv.slice(0, 9).map((it, i) => slotHtml(it, cre && i === P.sel)).join('');
    $('#craft').hidden = cre;
    if (!cre) $('#recipes').innerHTML = RECIPES.map((r, i) => `<button class="rec" data-rec="${i}" ${r.in.every(([id, n]) => count(id) >= n) ? '' : 'disabled'} title="${r.in.map(([id, n]) => n + ' ' + B[id].n).join(' + ')} → ${r.out[1]} ${B[r.out[0]].n}">${r.in.map(([id, n]) => `${n}<img src="${icon(id)}" alt="${B[id].n}">`).join('+')} → ${r.out[1]}<img src="${icon(r.out[0])}" alt="${B[r.out[0]].n}"></button>`).join('');
    $('#invHelp').textContent = cre ? 'Tocá un bloque para ponerlo en el casillero elegido de la barra rápida. Tocá un casillero de la barra para elegirlo.' : 'Tocá un casillero para agarrar ese bloque y otro para dejarlo. Con lo que juntás podés fabricar bloques nuevos.';
    const c = $('#carry'); c.hidden = !carry; if (carry) c.src = icon(carry.id);
  }
  function openInv() { if (!playing()) return; G.ui = 'sInv'; unlock(); $('#sInv').hidden = false; renderInv(); }
  function closeInv() { if (carry) { addItem(carry.id, carry.n); carry = null; } $('#sInv').hidden = true; G.ui = null; renderHud(); lock(); }
  $('#sInv').addEventListener('click', e => {
    const r = e.target.closest('[data-rec]');
    if (r) { const R = RECIPES[+r.dataset.rec]; if (R.in.every(([id, n]) => count(id) >= n)) { R.in.forEach(([id, n]) => take(id, n)); addItem(R.out[0], R.out[1]); sfx('pop'); renderInv(); } return; }
    const s = e.target.closest('.slot'); if (!s) { if (e.target === $('#sInv')) closeInv(); return; }
    const inBar = s.parentElement.id === 'invBar', idx = [...s.parentElement.children].indexOf(s);
    if (P.mode === 'creative') {
      if (inBar) { P.sel = idx; renderInv(); renderHud(); return; }
      P.inv[P.sel] = { id: PALETTE[idx], n: 64 }; sfx('pop'); renderInv(); renderHud(); return;
    }
    const i = inBar ? idx : idx + 9, it = P.inv[i];
    if (carry && it && it.id === carry.id) { const k = Math.min(64 - it.n, carry.n); it.n += k; carry.n -= k; if (!carry.n) carry = null; }
    else { P.inv[i] = carry; carry = it; }
    renderInv(); renderHud();
  });
  addEventListener('mousemove', e => { if (carry) { const c = $('#carry'); c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; } });

  /* ───────── chat ───────── */
  function chat(text, color) { const d = document.createElement('div'); d.textContent = text; if (color) d.style.color = color; $('#chatLog').appendChild(d); while ($('#chatLog').children.length > 12) $('#chatLog').firstChild.remove(); }
  function openChat(prefix = '') { if (!playing()) return; G.ui = 'chat'; unlock(); const i = $('#chatIn'); i.hidden = false; i.value = prefix; $('#hud').classList.add('chat'); setTimeout(() => i.focus(), 0); }
  function closeChat() { $('#chatIn').hidden = true; $('#hud').classList.remove('chat'); G.ui = null; lock(); }
  $('#chatIn').addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') { closeChat(); return; }
    if (e.key !== 'Enter') return;
    const v = e.target.value.trim(); closeChat(); if (!v) return;
    if (v.startsWith('/')) command(v.slice(1).split(/\s+/)); else { chat('<' + S.name + '> ' + v); NET.send({ t: 'c', n: S.name, m: v }); }
  });
  function command([c, ...a]) {
    c = (c || '').toLowerCase();
    if (c === 'ayuda' || c === 'help') chat('Comandos: /tp x y z · /tiempo dia|noche · /modo creativo|supervivencia · /semilla · /curar · /spawn', '#ffe46b');
    else if (c === 'tp' && a.length === 3) { const [x, y, z] = a.map(Number); if ([x, y, z].every(isFinite)) { P.pos.set(x, y, z); P.vel.set(0, 0, 0); chat('Teletransportado.', '#aaa'); } }
    else if (c === 'tiempo' || c === 'time') { G.time = /noche|night/.test(a[0]) ? .55 : /tarde/.test(a[0]) ? .42 : .08; NET.send({ t: 'time', v: G.time }); chat('Hora cambiada.', '#aaa'); }
    else if (c === 'modo' || c === 'gamemode') { const m = /crea/.test(a[0]) ? 'creative' : /super|surv/.test(a[0]) ? 'survival' : null; if (m) setPlayMode(m); }
    else if (c === 'semilla' || c === 'seed') chat('Semilla: ' + G.world.seed, '#aaa');
    else if (c === 'curar' || c === 'heal') { P.health = 20; renderHud(); }
    else if (c === 'spawn') { P.pos.set(...P.spawn); P.vel.set(0, 0, 0); }
    else chat('Comando desconocido. Escribí /ayuda', '#f88');
  }
  function setPlayMode(m) { P.mode = m; if (m === 'survival') P.flying = false; if (G.meta) G.meta.mode = m; chat('Modo: ' + (m === 'creative' ? 'creativo' : 'supervivencia'), '#aaa'); lastHud = ''; renderHud(); }

  /* ───────── mouse y teclado ───────── */
  function lock() { if (!playing() || G.ui) return; if (TOUCH) { $('#hud').hidden = false; return; } G.lockWanted = true; try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch (e) { } }
  function unlock() { G.lockWanted = false; if (document.pointerLockElement) document.exitPointerLock(); }
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) { if (G.ui === 'sPause' || G.ui === 'sClick') hideScreens(); return; }
    if (playing() && !G.ui && G.lockWanted) pause();
  });
  function pause() { if (!playing()) return; unlock(); show('sPause'); $('#hud').hidden = false; $('#btnInvite').hidden = G.remote; $('#inviteBox').hidden = !NET.code; if (NET.code) $('#inviteCode').textContent = NET.code; saveGame(); }
  function resume() { hideScreens(); lock(); }
  canvas.addEventListener('click', () => { if (!TOUCH && playing() && !G.ui && !document.pointerLockElement) lock(); });
  $('#sClick').addEventListener('click', () => { hideScreens(); lock(); });
  addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas || !playing() || G.ui) return;
    const k = .0022 * S.sens; P.yaw -= e.movementX * k; P.pitch = clamp(P.pitch - e.movementY * k, -1.55, 1.55);
  });
  addEventListener('mousedown', e => {
    if (!playing() || G.ui || document.pointerLockElement !== canvas) return;
    G.mouse[e.button] = true;
    if (e.button === 0) { G.breakT = 0; if (G.targetMob) { G.mouse[0] = false; attackMob(); return; } if (P.mode === 'creative') { breakTarget(); G.lastAct = performance.now(); } }
    if (e.button === 2) { place(); G.lastAct = performance.now(); }
    if (e.button === 1) { e.preventDefault(); pick(); }
  });
  addEventListener('mouseup', e => { G.mouse[e.button] = false; if (e.button === 0) { G.breakT = 0; crack.visible = false; } });
  addEventListener('contextmenu', e => { if (playing()) e.preventDefault(); });
  addEventListener('wheel', e => { if (playing() && !G.ui) selectSlot(P.sel + (e.deltaY > 0 ? 1 : -1)); }, { passive: true });
  let lastW = 0, lastSpace = 0;
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' && e.target.id !== 'chatIn') { if (e.key === 'Enter') { if (G.ui === 'sNew') act.create(); if (G.ui === 'sMulti') act.join(); } return; }
    if (e.code === 'F2') { e.preventDefault(); shot(); return; }
    if (!playing()) { if (e.key === 'Escape' && ['sWorlds', 'sMulti', 'sOptions', 'sNew'].includes(G.ui)) G.ui === 'sOptions' ? act.optBack() : G.ui === 'sNew' ? go.worlds() : go.title(); return; }
    if (G.ui === 'sInv') { if (e.code === 'KeyE' || e.key === 'Escape') { e.preventDefault(); closeInv(); } return; }
    if (G.ui === 'sPause') { if (e.key === 'Escape') { e.preventDefault(); resume(); } return; }
    if (G.ui === 'sOptions') { if (e.key === 'Escape') act.optBack(); return; }
    if (G.ui === 'sMod') { if (e.key === 'Escape' || e.code === 'KeyM') { e.preventDefault(); closeMod(); } return; }
    if (G.ui) return;
    if (e.code === 'KeyW' && !K.KeyW) { const n = performance.now(); if (n - lastW < 280) P.sprint = true; lastW = n; }
    if (e.code === 'Space' && !K.Space) { const n = performance.now(); if (P.mode === 'creative' && n - lastSpace < 280) { P.flying = !P.flying; P.vel.y = 0; } lastSpace = n; }
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') P.sprint = true;
    K[e.code] = true;
    if (/^Digit[1-9]$/.test(e.code)) selectSlot(+e.code.slice(5) - 1);
    else if (e.code === 'KeyE') openInv();
    else if (e.code === 'KeyM') { e.preventDefault(); openMod(); }
    else if (e.code === 'KeyT' || e.code === 'Enter') { e.preventDefault(); openChat(); }
    else if (e.code === 'Slash') { e.preventDefault(); openChat('/'); }
    else if (e.code === 'F3') { e.preventDefault(); G.f3 = !G.f3; debugText(); }
    if (['Space', 'Tab', 'F3'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e => { K[e.code] = false; if (e.code === 'KeyW') P.sprint = false; });
  addEventListener('blur', () => { for (const k in K) K[k] = false; G.mouse = [false, false, false]; });
  function shot() { renderer.render(scene, camera); const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = 'gonzacraft-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.png'; a.click(); toast('Captura guardada'); }

  /* ───────── física ───────── */
  const boxHit = (x, y, z, h) => { const w = G.world; for (let bx = Math.floor(x - W_); bx <= Math.floor(x + W_); bx++) for (let by = Math.floor(y); by <= Math.floor(y + h - 1e-6); by++) for (let bz = Math.floor(z - W_); bz <= Math.floor(z + W_); bz++) if (SOL[w.get(bx, by, bz)]) return true; return false; };
  function moveAxis(a, d, h) {
    if (!d) return; const p = P.pos; p[a] += d;
    if (MOD.noclip && P.flying) return;
    if (!boxHit(p.x, p.y, p.z, h)) return;
    if (a === 'y') { if (d < 0) { p.y = Math.floor(p.y) + 1; landed(); } else p.y = Math.floor(p.y + h) - h - 1e-3; P.vel.y = 0; }
    else { p[a] = d > 0 ? Math.floor(p[a] + W_) - W_ - 1e-3 : Math.floor(p[a] - W_) + 1 + W_ + 1e-3; P.vel[a] = 0; }
  }
  function landed() {
    if (!P.onGround && P.fallStart !== null && P.mode === 'survival' && !P.inWater) { const d = P.fallStart - P.pos.y; if (d > 3.4) hurt(Math.floor(d - 3), 'Te caíste de muy alto.'); }
    P.onGround = true; P.fallStart = null; if (P.flying && !MOD.fly) P.flying = false;
  }
  function step(dt) {
    const w = G.world, p = P.pos;
    if (!w.loaded(Math.floor(p.x), Math.floor(p.z))) return;
    if (MOD.fly && !P.flying) P.flying = true;
    P.crouch = !!(K.ShiftLeft || K.ShiftRight) && !P.flying;
    const h = P.crouch ? 1.5 : 1.8;
    const feet = w.get(Math.floor(p.x), Math.floor(p.y + .3), Math.floor(p.z)), head = w.get(Math.floor(p.x), Math.floor(p.y + EYE), Math.floor(p.z));
    const wasWater = P.inWater; P.inWater = feet === 11 || head === 11; P.headWater = head === 11;
    if (P.inWater && !wasWater && P.vel.y < -6) sfx('splash', 'water');
    let fx = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0), fz = (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0), mag = 1;
    if (G.joy) { fx = G.joy.x; fz = -G.joy.y; mag = Math.min(1, Math.hypot(fx, fz)); if (mag < .15) { fx = fz = 0; mag = 0; } P.sprint = mag > .92 && fz > .7 * mag; }
    const len = Math.hypot(fx, fz) || 1; fx /= len; fz /= len;
    if ((K.ControlLeft || K.ControlRight) && fz > 0) P.sprint = true;
    if (fz <= 0) P.sprint = false;
    const s = Math.sin(P.yaw), c = Math.cos(P.yaw);
    const wx = c * fx - s * fz, wz = -s * fx - c * fz;
    const sp = (P.flying ? (P.sprint ? 22 : 11) : P.inWater ? 2.6 : P.crouch ? 1.4 : P.sprint ? 5.8 : 4.3) * MOD.speed;
    const acc = P.flying ? 10 : P.onGround ? 14 : P.inWater ? 6 : 3;
    const kk = Math.min(1, acc * dt);
    P.vel.x += (wx * sp * mag - P.vel.x) * kk; P.vel.z += (wz * sp * mag - P.vel.z) * kk;
    if (P.flying) { const t = ((K.Space ? 1 : 0) - (K.ShiftLeft || K.ShiftRight ? 1 : 0)) * 9; P.vel.y += (t - P.vel.y) * Math.min(1, 10 * dt); }
    else if (P.inWater) { P.vel.y -= 10 * dt; P.vel.y *= 1 - Math.min(1, 2.2 * dt); if (K.Space) P.vel.y = Math.min(P.vel.y + 26 * dt, 3.4); P.vel.y = Math.max(P.vel.y, -4.5); P.fallStart = null; }
    else { P.vel.y = Math.max(P.vel.y - 28 * dt, -55); if (K.Space && P.onGround) { P.vel.y = 8.7 * Math.sqrt(MOD.jump); P.onGround = false; } }
    if (!P.onGround && !P.flying && !P.inWater) { if (P.fallStart === null || p.y > P.fallStart) P.fallStart = p.y; }
    P.onGround = false;
    moveAxis('y', P.vel.y * dt, h);
    // agachado: no te caés de los bordes
    const edge = (x, z) => P.crouch && P.vel.y <= 0 && !boxHit(x, p.y - .05, z, .05) && boxHit(p.x, p.y - .05, p.z, .05);
    const dx = P.vel.x * dt, dz = P.vel.z * dt;
    if (edge(p.x + dx, p.z)) P.vel.x = 0; else moveAxis('x', dx, h);
    if (edge(p.x, p.z + dz)) P.vel.z = 0; else moveAxis('z', dz, h);
    if (!P.onGround && boxHit(p.x, p.y - .02, p.z, .02) && P.vel.y <= 0) P.onGround = true;
    // pasos
    if (P.onGround && !P.flying) { P.step += Math.hypot(P.vel.x, P.vel.z) * dt; if (P.step > 1.7) { P.step = 0; const b = w.get(Math.floor(p.x), Math.floor(p.y - .1), Math.floor(p.z)); if (b) sfx('step', B[b].mat); } }
    if (p.y < -40) { if (P.mode === 'survival') hurt(100, 'Te caíste del mundo.'); else { p.set(...P.spawn); P.vel.set(0, 0, 0); } }
    // aire y salud
    const now = performance.now();
    if (P.mode === 'survival') {
      if (P.headWater) { P.air -= dt; if (P.air <= 0) { P.air = 1; hurt(2, 'Te quedaste sin aire.'); } } else P.air = Math.min(10, P.air + dt * 4);
      if (w.get(Math.floor(p.x), Math.floor(p.y + .5), Math.floor(p.z)) === 14 || [[.35, 0], [-.35, 0], [0, .35], [0, -.35]].some(([a, b]) => w.get(Math.floor(p.x + a), Math.floor(p.y + .5), Math.floor(p.z + b)) === 14)) if (now - P.lastHurt > 700) hurt(1, 'Abrazaste un cactus.');
      if (P.health < 20 && now - P.lastHurt > 4000) { P.regenT += dt; if (P.regenT > 2.5) { P.regenT = 0; P.health = Math.min(20, P.health + 1); } }
    }
    renderHud();
  }
  function hurt(n, why, kb) {
    if (P.mode !== 'survival' || G.state !== 'play') return;
    if (kb) { P.vel.x += kb[0] * 7; P.vel.z += kb[1] * 7; P.vel.y = Math.max(P.vel.y, 5); P.onGround = false; }
    if (MOD.god) { if (P.pos.y < -40) { P.pos.set(...P.spawn); P.vel.set(0, 0, 0); } return; }
    P.health -= n; P.lastHurt = performance.now(); sfx('hurt');
    const h = $('#hurt'); h.classList.add('on'); setTimeout(() => h.classList.remove('on'), 120);
    renderHud();
    if (P.health <= 0) { P.health = 0; unlock(); G.state = 'dead'; $('#deadWhy').textContent = why || ''; show('sDead'); $('#hud').hidden = false; }
  }
  function respawn() { P.health = 20; P.air = 10; P.pos.set(...P.spawn); P.vel.set(0, 0, 0); P.fallStart = null; G.state = 'play'; hideScreens(); lock(); renderHud(); }

  /* ───────── romper y poner ───────── */
  const eyePos = () => new THREE.Vector3(P.pos.x, P.pos.y + (P.crouch ? EYE - .25 : EYE), P.pos.z);
  const lookDir = () => new THREE.Vector3(-Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), -Math.cos(P.yaw) * Math.cos(P.pitch));
  function breakTarget() {
    const t = G.target; if (!t) return; const d = B[t.id]; if (d.h === Infinity && P.mode !== 'creative') return;
    if (t.id === 19 && P.mode !== 'creative') return;
    G.world.set(t.x, t.y, t.z, 0); sfx('break', d.mat); burst(t.x, t.y, t.z, t.id);
    if (P.mode === 'survival') { if (!addItem(d.drop)) toast('Tu inventario está lleno'); }
    const up = G.world.get(t.x, t.y + 1, t.z); if (KIND[up] === 2) { G.world.set(t.x, t.y + 1, t.z, 0); if (P.mode === 'survival') addItem(up); }
    G.target = null;
  }
  function place() {
    const t = G.target, it = P.inv[P.sel]; if (!t || !it) return;
    let x = t.x + t.n[0], y = t.y + t.n[1], z = t.z + t.n[2];
    if (KIND[t.id] === 2) { x = t.x; y = t.y; z = t.z; }
    const cur = G.world.get(x, y, z); if (cur && cur !== 11 && KIND[cur] !== 2) return;
    if (y < 0 || y >= CH) return;
    const id = it.id;
    if (SOL[id]) { const h = P.crouch ? 1.5 : 1.8, p = P.pos; if (x + 1 > p.x - W_ && x < p.x + W_ && y + 1 > p.y && y < p.y + h && z + 1 > p.z - W_ && z < p.z + W_) return; }
    if (KIND[id] === 2 && ![1, 2, 12].includes(G.world.get(x, y - 1, z))) return;
    if (!G.world.set(x, y, z, id)) return;
    sfx('place', B[id].mat);
    if (P.mode === 'survival' && !MOD.infinite) { it.n--; if (!it.n) P.inv[P.sel] = null; renderHud(); }
  }
  function pick() {
    const t = G.target; if (!t) return;
    const has = P.inv.slice(0, 9).findIndex(i => i && i.id === t.id); if (has >= 0) { selectSlot(has); return; }
    if (P.mode === 'creative') { P.inv[P.sel] = { id: t.id, n: 64 }; selectSlot(P.sel); }
  }
  function interact(dt) {
    const eye = eyePos(), dir = lookDir();
    let t = G.world.raycast(eye, dir, MOD.reach);
    const mh = G.mobs && G.mobs.raycast(eye, dir, Math.min(MOD.reach, 4));
    G.targetMob = mh && (!t || mh.t < t.t) ? mh.mob : null; if (G.targetMob) t = null;
    G.target = t;
    hl.visible = !!t; if (t) hl.position.set(t.x + .5, t.y + .5, t.z + .5);
    const now = performance.now();
    if (G.mouse[0] && t) {
      if (P.mode === 'creative' || MOD.instant) { if (now - G.lastAct > (MOD.instant ? 120 : 230)) { breakTarget(); G.lastAct = now; } crack.visible = false; }
      else {
        const k = t.x + ',' + t.y + ',' + t.z; if (k !== G.breakKey) { G.breakKey = k; G.breakT = 0; }
        const hard = B[t.id].h; if (hard === Infinity) return;
        const need = MOD.instant ? 0 : hard * .7 + .05; G.breakT += dt;
        crack.visible = true; crack.position.copy(hl.position); crack.material.opacity = Math.min(.6, G.breakT / need * .6);
        if (Math.random() < dt * 5) sfx('dig', B[t.id].mat);
        if (G.breakT >= need) { breakTarget(); G.breakT = 0; G.breakKey = ''; crack.visible = false; }
      }
    } else crack.visible = false;
    if (G.mouse[2] && now - G.lastAct > 250) { place(); G.lastAct = now; }
  }

  /* ───────── criaturas y combate ───────── */
  const mobDeps = {
    world: () => G.world, burst, smoke, sfx,
    players: () => [{ id: NET.id, pos: P.pos, attackable: G.state === 'play' && (P.mode === 'survival' || MOD.creativeAtk), local: true }, ...[...remotes].map(([id, a]) => ({ id, pos: a.to, attackable: true }))],
    attack: (pl, n, why, dir) => { if (pl.local) { if (P.mode === 'creative' && MOD.creativeAtk) { P.vel.x += dir[0] * 7; P.vel.z += dir[1] * 7; P.vel.y = 5; sfx('hurt'); } else hurt(n, why, dir); } else { const c = NET.conns.get(pl.id); if (c && c.open) c.send({ t: 'dmg', n, why, dir }); } },
    onKill: (m, by) => { if (!by && P.mode === 'survival') addItem(...m.T.drop); },
  };
  let atkT = 0;
  function attackMob() {
    const m = G.targetMob; if (!m || performance.now() - atkT < 350) return; atkT = performance.now();
    const d = lookDir(), l = Math.hypot(d.x, d.z) || 1, dir = [d.x / l, d.z / l], dmg = 4 * MOD.strength;
    if (G.remote) { NET.send({ t: 'hm', id: m.id, d: dmg, dir }); m.flash = .2; sfx('hit'); }
    else G.mobs.hit(m, dmg, dir);
  }
  function explode(x, y, z, r, remote) {
    const w = G.world; if (!w) return;
    for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy + dz * dz > r * r + .5) continue; const b = w.get(x + dx, y + dy, z + dz);
      if (b && b !== 19) w.set(x + dx, y + dy, z + dz, 0, true);
    }
    for (let i = 0; i < 4; i++) burst(x + (Math.random() - .5) * r, y + (Math.random() - .5) * r, z + (Math.random() - .5) * r, 0x5a5a5a);
    sfx('boom');
    if (G.mobs) for (const m of [...G.mobs.list]) { const d = m.pos.distanceTo(new THREE.Vector3(x, y, z)); if (d < r + 1.5) G.mobs.hit(m, 30, [(m.pos.x - x) / (d || 1), (m.pos.z - z) / (d || 1)]); }
    if (!remote) NET.send({ t: 'boom', x, y, z, r });
  }

  /* ───────── mod menu ───────── */
  const hourOf = t => Math.floor(((t * 24 + 6) % 24 + 24) % 24), timeOf = h => (((h - 6) / 24) % 1 + 1) % 1;
  const MODSPEC = [
    ['Movimiento', [['t', 'fly', 'Volar siempre'], ['t', 'noclip', 'Atravesar paredes (volando)'], ['r', 'speed', 'Velocidad', 1, 6, .5, v => 'x' + v], ['r', 'jump', 'Súper salto', 1, 8, .5, v => 'x' + v]]],
    ['Vida y combate', [['t', 'god', 'Inmortal'], ['r', 'strength', 'Fuerza de golpe', 1, 10, 1, v => 'x' + v], ['a', 'heal', 'Curarme']]],
    ['Construcción', [['t', 'instant', 'Romper al instante'], ['t', 'infinite', 'Bloques infinitos'], ['r', 'reach', 'Alcance', 4, 30, .5, v => v + ' bloques'], ['r', 'boom', 'Tamaño de explosión', 2, 9, 1, v => v], ['a', 'explode', 'Explotar donde miro']]],
    ['Vista y hora', [['t', 'night', 'Visión nocturna'], ['t', 'xray', 'Rayos X (ver minerales)'], ['t', 'freeze', 'Congelar la hora'], ['h', 'hour', 'Hora del día']]],
    ['Criaturas', [['t', 'mobs', 'Aparecen de noche'], ['t', 'peaceful', 'Pacíficas (no atacan)'], ['t', 'creativeAtk', 'Te atacan en creativo'], ['a', 'spawn:sombra', 'Aparecer Sombra'], ['a', 'spawn:rocoso', 'Aparecer Rocoso'], ['a', 'spawn:chispa', 'Aparecer Chispa'], ['a', 'kill', 'Eliminar todas']]],
    ['Jugador', [['a', 'creative', 'Modo creativo'], ['a', 'survival', 'Modo supervivencia'], ['a', 'fill', 'Llenar el inventario'], ['a', 'top', 'Subir a la superficie'], ['a', 'spawn', 'Volver al spawn'], ['a', 'reset', 'Apagar todos los trucos']]],
  ];
  const MODACT = {
    heal: () => { P.health = 20; P.air = 10; renderHud(); toast('Vida completa'); },
    explode: () => { const t = G.world.raycast(eyePos(), lookDir(), 60); if (!t) return toast('Mirá hacia un bloque'); closeMod(); explode(t.x, t.y, t.z, MOD.boom); },
    kill: () => { if (G.remote) return toast('Solo el anfitrión controla las criaturas'); const n = G.mobs.count; [...G.mobs.list].forEach(m => G.mobs.remove(m, true)); toast(n ? `Se fueron ${n} criaturas` : 'No hay criaturas cerca'); },
    creative: () => setPlayMode('creative'), survival: () => setPlayMode('survival'),
    fill: () => { if (P.mode === 'creative') { PALETTE.slice(0, 9).forEach((id, i) => P.inv[i] = { id, n: 64 }); } else { for (let i = 0; i < 36; i++) P.inv[i] = { id: PALETTE[i % PALETTE.length], n: 64 }; } lastHud = ''; renderHud(); toast('Inventario lleno'); },
    top: () => { const x = Math.floor(P.pos.x), z = Math.floor(P.pos.z); let y = CH - 1; while (y > 0 && !SOL[G.world.get(x, y, z)]) y--; P.pos.y = y + 1.01; P.vel.set(0, 0, 0); closeMod(); },
    spawn: () => { P.pos.set(...P.spawn); P.vel.set(0, 0, 0); closeMod(); },
    reset: () => { Object.assign(MOD, { fly: false, noclip: false, speed: 1, jump: 1, god: false, strength: 1, instant: false, infinite: false, reach: 5.5, night: false, freeze: false, peaceful: false, creativeAtk: false }); if (MOD.xray) { MOD.xray = false; G.world.setXray(false); } P.flying = false; saveMod(); renderMod(); toast('Trucos apagados'); },
  };
  function renderMod() {
    $('#modBody').innerHTML = MODSPEC.map(([title, items]) => `<h4>${title}</h4>` + items.map(([kind, k, label, mn, mx, st, f]) => {
      if (kind === 't') return `<button class="mt" data-mod="${k}" aria-pressed="${!!MOD[k]}"><span>${label}</span><i></i></button>`;
      if (kind === 'r') return `<label class="mr"><span>${label}<output>${f(MOD[k])}</output></span><input type="range" data-modr="${k}" min="${mn}" max="${mx}" step="${st}" value="${MOD[k]}"></label>`;
      if (kind === 'h') return `<label class="mr"><span>${label}<output>${String(hourOf(G.time)).padStart(2, '0')}:00</output></span><input type="range" data-modh="1" min="0" max="23" step="1" value="${hourOf(G.time)}"></label>`;
      return `<button class="ma" data-mact="${k}">${label}</button>`;
    }).join('')).join('');
  }
  function openMod() { if (!playing() || G.ui) return; unlock(); show('sMod'); renderMod(); }
  function closeMod() { if (G.ui !== 'sMod') return; hideScreens(); lock(); }
  $('#sMod').addEventListener('click', e => {
    if (e.target === $('#sMod')) return closeMod();
    const t = e.target.closest('[data-mod]'), a = e.target.closest('[data-mact]');
    if (t) {
      const k = t.dataset.mod; MOD[k] = !MOD[k]; t.setAttribute('aria-pressed', MOD[k]); sfx('pop');
      if (k === 'fly' && !MOD.fly) P.flying = false;
      if (k === 'xray') G.world.setXray(MOD.xray);
      if (k === 'noclip' && MOD.noclip) { MOD.fly = true; $('[data-mod="fly"]').setAttribute('aria-pressed', true); }
      saveMod();
    } else if (a) {
      const k = a.dataset.mact; sfx('pop');
      if (k.startsWith('spawn:')) { if (G.remote) return toast('Solo el anfitrión puede hacer aparecer criaturas'); const m = G.mobs.trySpawn(P.pos.x, P.pos.z, k.slice(6)); toast(m ? 'Apareció: ' + m.T.name : 'No hay lugar cerca para que aparezca'); }
      else MODACT[k]();
    }
  });
  $('#sMod').addEventListener('input', e => {
    const r = e.target.dataset.modr;
    if (r) { MOD[r] = +e.target.value; const spec = MODSPEC.flatMap(x => x[1]).find(x => x[1] === r); e.target.previousElementSibling.querySelector('output').textContent = spec[6](MOD[r]); saveMod(); }
    if (e.target.dataset.modh) { G.time = timeOf(+e.target.value); NET.send({ t: 'time', v: G.time }); e.target.previousElementSibling.querySelector('output').textContent = String(e.target.value).padStart(2, '0') + ':00'; }
  });
  let lastTag = '';
  function modTag() {
    const on = [MOD.fly && 'volar', MOD.noclip && 'paredes', MOD.speed > 1 && 'velocidad x' + MOD.speed, MOD.jump > 1 && 'salto x' + MOD.jump, MOD.god && 'inmortal', MOD.strength > 1 && 'fuerza x' + MOD.strength, MOD.instant && 'romper rápido', MOD.infinite && 'infinitos', MOD.reach > 5.5 && 'alcance', MOD.night && 'visión nocturna', MOD.xray && 'rayos X', MOD.freeze && 'hora fija', MOD.peaceful && 'pacíficas', !MOD.mobs && 'sin criaturas'].filter(Boolean).join(' · ');
    if (on !== lastTag) { lastTag = on; const el = $('#modTag'); el.hidden = !on; el.textContent = 'MOD · ' + on; }
  }

  /* ───────── día y noche ───────── */
  const C_DAY = new THREE.Color(0x87bfff), C_NIGHT = new THREE.Color(0x070b1d), C_SET = new THREE.Color(0xf0915a), C_WATER = new THREE.Color(0x1d3f8f), tmpC = new THREE.Color();
  function sky(t, eye) {
    const a = t * Math.PI * 2, sh = Math.sin(a);
    const day = clamp((sh + .12) / .4, 0, 1), dl = day * day * (3 - 2 * day);
    tmpC.copy(C_NIGHT).lerp(C_DAY, dl);
    const set = Math.max(0, 1 - Math.abs(sh) / .28); tmpC.lerp(C_SET, set * .45);
    const under = G.world && G.world.get(Math.floor(eye.x), Math.floor(eye.y), Math.floor(eye.z)) === 11;
    $('#water').hidden = !under;
    const fogC = under ? C_WATER.clone().multiplyScalar(.3 + .7 * dl) : tmpC;
    scene.background = fogC; scene.fog.color.copy(fogC); mats.common.fogColor.value.copy(fogC);
    const far = under ? 18 : S.rd * 16, near = under ? 1 : Math.max(8, far - 36);
    mats.common.fogNear.value = near; mats.common.fogFar.value = far; scene.fog.near = near; scene.fog.far = far;
    mats.common.day.value = .16 + .84 * dl; mats.common.nv.value = MOD.night ? 1 : 0; G.dl = dl;
    if (G.mobs) G.mobs.shade(MOD.night ? 1 : .16 + .84 * dl);
    const d = new THREE.Vector3(Math.cos(a), sh, .25).normalize();
    sun.position.copy(eye).addScaledVector(d, 500); sun.lookAt(eye);
    moon.position.copy(eye).addScaledVector(d, -500); moon.lookAt(eye);
    stars.position.copy(eye); stars.material.opacity = clamp(1 - dl * 1.6, 0, 1); stars.rotation.z = a;
    clouds.visible = S.clouds && !under; clouds.position.set(eye.x, 126, eye.z); cloudTex.offset.set((eye.x / 300) + performance.now() / 600000, -(eye.z / 300));
    clouds.material.color.setScalar(.25 + .75 * dl);
    mats.water.uniforms.off.value.set(performance.now() / 9000, performance.now() / 13000);
  }

  /* ───────── mundos ───────── */
  let menuWorld = null;
  function startMenuWorld() {
    if (menuWorld) return;
    menuWorld = new World(hashStr('GonzaCraft'), scene, mats);
    const [x, y, z] = menuWorld.findSpawn(); menuWorld.cam = new THREE.Vector3(x, y + 14, z);
    G.world = menuWorld;
  }
  function stopMenuWorld() { if (menuWorld) { menuWorld.dispose(); menuWorld = null; } }
  async function startWorld(meta, opt = {}) {
    stopMenuWorld(); if (G.world && G.world !== menuWorld) G.world.dispose();
    G.state = 'loading'; show('sLoading'); $('#loadMsg').textContent = opt.remote ? 'Entrando a la partida…' : 'Generando el mundo…'; $('#loadBar').style.width = '0';
    G.remote = !!opt.remote; G.meta = meta; G.time = meta.time ?? .08;
    const saved = new Set();
    if (!G.remote) (await DB.chunkKeys(meta.id)).forEach(k => saved.add(k.split('|')[1]));
    G.world = new World(meta.seed, scene, mats, {
      savedKeys: saved, override: opt.override,
      loadChunk: G.remote ? null : k => DB.getChunk(meta.id + '|' + k),
      saveChunk: G.remote ? null : (k, d) => DB.putChunks([[meta.id + '|' + k, d]]),
      onEdit: (x, y, z, id) => NET.send({ t: 's', x, y, z, b: id }),
    });
    const pl = meta.player;
    P.mode = meta.mode; P.flying = false; P.health = 20; P.air = 10; P.vel.set(0, 0, 0); P.fallStart = null; P.sel = 0; carry = null;
    P.spawn = meta.spawn || G.world.findSpawn(); meta.spawn = P.spawn;
    if (pl) { P.pos.set(pl.x, pl.y, pl.z); P.yaw = pl.yaw; P.pitch = pl.pitch; P.health = pl.health ?? 20; P.inv = (pl.inv || []).concat(new Array(36).fill(null)).slice(0, 36); P.sel = pl.sel || 0; P.flying = !!pl.flying && P.mode === 'creative'; }
    else { P.pos.set(...(opt.pos || P.spawn)); P.yaw = Math.PI * .75; P.pitch = -.15; P.inv = new Array(36).fill(null); if (P.mode === 'creative') [1, 2, 3, 4, 9, 7, 8, 10, 24].forEach((id, i) => P.inv[i] = { id, n: 64 }); }
    G.needFit = !pl; lastHud = ''; $('#chatLog').innerHTML = ''; G.loadStart = performance.now();
    if (G.mobs) G.mobs.clear();
    G.mobs = new GC.Mobs(scene, mobDeps);
    if (MOD.xray) G.world.setXray(true);
  }
  function finishLoading() {
    if (G.needFit) { let n = 0; while (boxHit(P.pos.x, P.pos.y, P.pos.z, 1.8) && n++ < CH) P.pos.y += 1; }
    G.state = 'play'; $('#hud').hidden = false; renderHud(); selectSlot(P.sel);
    show('sClick'); $('#hud').hidden = false; $('#clickTitle').textContent = G.meta.name; $('#clickMsg').textContent = TOUCH ? 'Tocá la pantalla para jugar' : 'Hacé clic para jugar';
    if (!G.remote) chat('Bienvenido a ' + G.meta.name + '. Escribí /ayuda para ver los comandos.', '#ffe46b');
  }
  async function saveGame() {
    if (!G.meta || G.remote || !G.world || G.world === menuWorld) return;
    const m = G.meta;
    m.time = G.time; m.played = Date.now(); m.mode = P.mode;
    m.player = { x: P.pos.x, y: P.pos.y, z: P.pos.z, yaw: P.yaw, pitch: P.pitch, health: P.health, inv: P.inv, sel: P.sel, flying: P.flying };
    const list = G.world.flush().map(([k, d]) => [m.id + '|' + k, d]);
    await Promise.all([DB.putWorld(m), DB.putChunks(list)]);
  }
  async function quitWorld() {
    if (G.state === 'boot' || G.state === 'title') return;
    await saveGame();
    if (NET.peer && !NET.conn) { NET.send({ t: 'bye' }); await new Promise(r => setTimeout(r, 200)); }
    NET.close(); clearRemotes(); if (G.mobs) { G.mobs.clear(); G.mobs = null; }
    if (G.world && G.world !== menuWorld) { const w = G.world; w.flush(); w.dispose(); }
    G.world = null; G.meta = null; G.state = 'title'; G.remote = false; unlock();
    $('#hud').hidden = true; hl.visible = crack.visible = false;
    startMenuWorld(); go.title();
  }
  setInterval(() => { if (playing()) saveGame(); }, 20000);
  addEventListener('beforeunload', () => { saveGame(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { saveGame(); if (TOUCH && playing() && !G.ui) pause(); } });

  /* ───────── controles táctiles ───────── */
  if (TOUCH) {
    const tl = $('#tLayer'), stick = $('#stick'), knob = stick.firstElementChild, tp = new Map(); stick.hidden = true;
    const R = 56;
    tl.addEventListener('pointerdown', e => {
      if (!playing() || G.ui) return; e.preventDefault(); try { tl.setPointerCapture(e.pointerId); } catch (_) { }
      const left = e.clientX < innerWidth * .42 && ![...tp.values()].some(t => t.kind === 'stick');
      const t = { kind: left ? 'stick' : 'look', x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), moved: 0, brk: false };
      tp.set(e.pointerId, t);
      if (left) { stick.hidden = false; stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; knob.style.transform = ''; G.joy = { x: 0, y: 0 }; }
      else t.hold = setTimeout(() => { if (t.moved < 14 && tp.get(e.pointerId) === t) { t.brk = true; G.mouse[0] = true; G.breakT = 0; if (P.mode === 'creative') { breakTarget(); G.lastAct = performance.now(); } } }, 260);
    });
    tl.addEventListener('pointermove', e => {
      const t = tp.get(e.pointerId); if (!t) return; e.preventDefault();
      const dx = e.clientX - t.x, dy = e.clientY - t.y; t.x = e.clientX; t.y = e.clientY; t.moved += Math.abs(dx) + Math.abs(dy);
      if (t.kind === 'stick') { let jx = e.clientX - t.x0, jy = e.clientY - t.y0; const d = Math.hypot(jx, jy); if (d > R) { jx *= R / d; jy *= R / d; } knob.style.transform = `translate(${jx}px,${jy}px)`; G.joy = { x: jx / R, y: jy / R }; }
      else { const k = .0055 * S.sens; P.yaw -= dx * k; P.pitch = clamp(P.pitch - dy * k, -1.55, 1.55); }
    });
    const end = e => {
      const t = tp.get(e.pointerId); if (!t) return; tp.delete(e.pointerId);
      if (t.kind === 'stick') { G.joy = null; stick.hidden = true; return; }
      clearTimeout(t.hold);
      if (t.brk) { G.mouse[0] = false; G.breakT = 0; crack.visible = false; }
      else if (t.moved < 14 && performance.now() - t.t0 < 260 && e.type === 'pointerup') { if (G.targetMob) attackMob(); else place(); }
    };
    tl.addEventListener('pointerup', end); tl.addEventListener('pointercancel', end);
    const hold = (id, code, extra) => { const b = $(id); b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (extra) extra(); K[code] = true; b.classList.add('on'); }); const up = () => { K[code] = false; b.classList.remove('on'); }; b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up); };
    let lastJ = 0;
    hold('#tJump', 'Space', () => { const n = performance.now(); if (P.mode === 'creative' && n - lastJ < 300) { P.flying = !P.flying; P.vel.y = 0; } lastJ = n; });
    hold('#tSneak', 'ShiftLeft');
    $('#tFly').addEventListener('click', () => { P.flying = !P.flying; P.vel.y = 0; });
    $('#tMod').addEventListener('click', openMod); $('#tInv').addEventListener('click', openInv); $('#tPause').addEventListener('click', pause); $('#tChat').addEventListener('click', () => openChat());
    $('#hotbar').addEventListener('pointerdown', e => { const s = e.target.closest('.slot'); if (s) { e.preventDefault(); selectSlot([...s.parentElement.children].indexOf(s)); } });
    setInterval(() => { const f = $('#tFly'); f.hidden = P.mode !== 'creative'; f.setAttribute('aria-pressed', P.flying); }, 300);
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('contextmenu', e => e.preventDefault());
  }
  /* botón Atrás de Android */
  window.__gcBack = () => {
    if (G.ui === 'sInv') { closeInv(); return true; }
    if (G.ui === 'sMod') { closeMod(); return true; }
    if (G.ui === 'chat') { closeChat(); return true; }
    if (G.ui === 'sOptions') { act.optBack(); return true; }
    if (G.ui === 'sPause') { resume(); return true; }
    if (G.ui === 'sNew') { go.worlds(); return true; }
    if (G.ui === 'sWorlds' || G.ui === 'sMulti') { go.title(); return true; }
    if (playing()) { pause(); return true; }
    if (G.state === 'dead' || G.state === 'loading') return true;
    return false;
  };

  /* ───────── multijugador (PeerJS) ───────── */
  const remotes = new Map();
  function avatar(name, id) {
    const g = new THREE.Group(), h = hashStr(id), shirt = new THREE.Color().setHSL((h % 360) / 360, .6, .45), skin = new THREE.Color(0xd9a27a), pants = new THREE.Color(0x2c3a66);
    const box = (w, hh, d, col, x, y, z) => { const geo = new THREE.BoxGeometry(w, hh, d); geo.translate(0, -hh / 2, 0); const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col })); const piv = new THREE.Group(); piv.position.set(x, y, z); piv.add(m); g.add(piv); return piv; };
    const head = box(.5, .5, .5, skin, 0, 1.8, 0); box(.5, .7, .26, shirt, 0, 1.3, 0);
    const la = box(.22, .7, .22, shirt.clone().multiplyScalar(.85), -.36, 1.3, 0), ra = box(.22, .7, .22, shirt.clone().multiplyScalar(.85), .36, 1.3, 0);
    const ll = box(.24, .6, .24, pants, -.13, .6, 0), rl = box(.24, .6, .24, pants.clone().multiplyScalar(.85), .13, .6, 0);
    const hair = new THREE.Mesh(new THREE.BoxGeometry(.54, .14, .54), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(((h >> 8) % 40) / 360, .5, .18) })); hair.position.set(0, -.04, .01); head.add(hair);
    const back = new THREE.Mesh(new THREE.BoxGeometry(.54, .3, .1), hair.material); back.position.set(0, -.18, .24); head.add(back);
    const eyes = new THREE.Mesh(new THREE.PlaneGeometry(.3, .07), new THREE.MeshBasicMaterial({ color: 0x1b1b2a })); eyes.position.set(0, -.22, -.252); eyes.rotation.y = Math.PI; head.add(eyes);
    const c = document.createElement('canvas'), cx = c.getContext('2d'); cx.font = '28px sans-serif'; const tw = cx.measureText(name).width + 16; c.width = tw; c.height = 40; const x2 = c.getContext('2d'); x2.fillStyle = 'rgba(0,0,0,.45)'; x2.fillRect(0, 0, tw, 40); x2.font = '28px sans-serif'; x2.fillStyle = '#fff'; x2.textBaseline = 'middle'; x2.fillText(name, 8, 21);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false })); tag.scale.set(tw / 80, .5, 1); tag.position.y = 2.25; tag.renderOrder = 5; g.add(tag);
    scene.add(g);
    return { g, head, la, ra, ll, rl, name, to: new THREE.Vector3(), yaw: 0, pitch: 0, ph: 0, seen: performance.now() };
  }
  function remoteMove(id, name, p, r) {
    let a = remotes.get(id); if (!a) { a = avatar(name || 'Jugador', id); remotes.set(id, a); a.g.position.set(...p); }
    a.to.set(...p); a.yaw = r[0]; a.pitch = r[1]; a.seen = performance.now();
  }
  function remoteGone(id) { const a = remotes.get(id); if (a) { scene.remove(a.g); remotes.delete(id); chat(a.name + ' salió de la partida', '#ffe46b'); } }
  function clearRemotes() { remotes.forEach(a => scene.remove(a.g)); remotes.clear(); }
  function updRemotes(dt) {
    remotes.forEach(a => {
      const before = a.g.position.clone(); a.g.position.lerp(a.to, Math.min(1, dt * 12));
      const v = before.distanceTo(a.g.position) / Math.max(dt, 1e-3); a.ph += dt * Math.min(v, 6) * 2.2; const sw = Math.sin(a.ph) * Math.min(1, v / 3) * .7;
      a.g.rotation.y = a.yaw; a.head.rotation.x = -a.pitch; a.ll.rotation.x = sw; a.rl.rotation.x = -sw; a.la.rotation.x = -sw; a.ra.rotation.x = sw;
    });
  }
  const NET = {
    peer: null, conns: new Map(), conn: null, code: null, id: Math.random().toString(36).slice(2, 10), sendT: 0,
    send(m) { if (!this.peer) return; if (this.conn) { if (this.conn.open) this.conn.send(m); } else this.conns.forEach(c => c.open && c.send(m)); },
    relay(m, except) { this.conns.forEach((c, id) => { if (id !== except && c.open) c.send(m); }); },
    close() { try { this.peer && this.peer.destroy(); } catch (e) { } this.peer = null; this.conn = null; this.conns.clear(); this.code = null; },
  };
  async function loadPeer() { if (window.Peer) return; await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/peerjs.min.js'; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar el multijugador')); document.head.appendChild(s); }); }
  const CODE_CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  async function host() {
    if (NET.code) return; if (!navigator.onLine) return toast('Necesitás internet para invitar amigos');
    $('#inviteBox').hidden = false; $('#inviteCode').textContent = '…';
    try { await loadPeer(); } catch (e) { return toast(e.message); }
    const code = Array.from({ length: 5 }, () => CODE_CH[Math.random() * CODE_CH.length | 0]).join('');
    const peer = new Peer('gonzacraft-' + code.toLowerCase(), { debug: 0 }); NET.peer = peer;
    peer.on('open', () => { NET.code = code; $('#inviteCode').textContent = code; chat('Partida abierta. Código: ' + code, '#7ec850'); });
    peer.on('error', e => { if (e.type === 'unavailable-id') { NET.close(); host(); } else if (!NET.code) { toast('No se pudo abrir la partida. Revisá tu conexión.'); NET.close(); $('#inviteBox').hidden = true; } });
    peer.on('connection', conn => {
      const meta = conn.metadata || {}, id = String(meta.id || conn.peer), name = String(meta.name || 'Jugador').slice(0, 16);
      conn.on('open', async () => {
        NET.conns.set(id, conn);
        const saved = await DB.allChunks(G.meta.id); const mod = new Map(saved); G.world.modified().forEach(([k, d]) => mod.set(k, d));
        conn.send({ t: 'hi', seed: G.world.seed, mode: G.meta.mode === 'creative' ? 'creative' : 'survival', time: G.time, name: G.meta.name, spawn: [P.pos.x, P.pos.y + .5, P.pos.z], n: mod.size });
        for (const [k, d] of mod) conn.send({ t: 'ch', k, d: GC.rle(d) });
        conn.send({ t: 'go', players: [[NET.id, S.name, [P.pos.x, P.pos.y, P.pos.z]], ...[...remotes].map(([rid, a]) => [rid, a.name, a.to.toArray()])] });
        NET.relay({ t: 'pj', id, n: name }, id); chat(name + ' entró a la partida', '#ffe46b');
      });
      conn.on('data', m => onNet(m, id, name));
      conn.on('close', () => { NET.conns.delete(id); remoteGone(id); NET.relay({ t: 'pl', id }); });
    });
  }
  async function join(code, name) {
    code = (code || '').trim().toUpperCase(); if (code.length < 4) return toast('Escribí el código que te pasaron');
    S.name = (name || S.name).trim().slice(0, 16) || S.name; saveS();
    show('sLoading'); $('#loadMsg').textContent = 'Buscando la partida ' + code + '…'; $('#loadBar').style.width = '5%';
    try { await loadPeer(); } catch (e) { toast(e.message); return go.multi(); }
    NET.close();
    const peer = new Peer(undefined, { debug: 0 }); NET.peer = peer;
    const fail = msg => { if (G.state === 'play') return; NET.close(); toast(msg, 4000); go.multi(); };
    const timer = setTimeout(() => fail('No se encontró la partida. Revisá el código y que tu amigo siga jugando.'), 15000);
    let hi = null; const over = new Map();
    peer.on('error', e => { clearTimeout(timer); fail(e.type === 'peer-unavailable' ? 'No existe una partida con ese código.' : 'Error de conexión: ' + e.type); });
    peer.on('open', () => {
      const conn = peer.connect('gonzacraft-' + code.toLowerCase(), { reliable: true, serialization: 'json', metadata: { id: NET.id, name: S.name } }); NET.conn = conn;
      conn.on('data', async m => {
        if (m.t === 'hi') { hi = m; $('#loadMsg').textContent = 'Descargando el mundo de ' + m.name + '…'; return; }
        if (m.t === 'ch') { over.set(m.k, GC.unrle(m.d)); if (hi) $('#loadBar').style.width = (10 + 80 * over.size / Math.max(1, hi.n)) + '%'; return; }
        if (m.t === 'go') {
          clearTimeout(timer); stopMenuWorld();
          await startWorld({ id: null, name: hi.name, seed: hi.seed, mode: hi.mode, time: hi.time, spawn: hi.spawn }, { remote: true, override: over, pos: hi.spawn });
          m.players.forEach(([id, n, p]) => remoteMove(id, n, p, [0, 0]));
          chat('Entraste a la partida de ' + hi.name, '#7ec850');
          return;
        }
        onNet(m, 'host');
      });
      conn.on('close', () => { if (G.remote && G.state !== 'title') { toast('El anfitrión cerró la partida', 4000); quitWorld(); } });
    });
  }
  function onNet(m, from, fname) {
    if (!m || !G.world) return;
    if (m.t === 'p') { const id = m.id || from; if (id === NET.id) return; remoteMove(id, m.n || fname, m.p, m.r); if (!NET.conn) NET.relay({ ...m, id, n: m.n || fname }, from); }
    else if (m.t === 's') { G.world.set(m.x, m.y, m.z, m.b, true); if (!NET.conn) NET.relay(m, from); }
    else if (m.t === 'c') { chat('<' + String(m.n).slice(0, 16) + '> ' + String(m.m).slice(0, 200)); if (!NET.conn) NET.relay(m, from); }
    else if (m.t === 'time') { G.time = +m.v || 0; if (!NET.conn) NET.relay(m, from); }
    else if (m.t === 'pj') chat(m.n + ' entró a la partida', '#ffe46b');
    else if (m.t === 'pl') remoteGone(m.id);
    else if (m.t === 'mobs' && G.remote && G.mobs) G.mobs.applyNet(m.l, .125);
    else if (m.t === 'hm' && !NET.conn && G.mobs) { const mb = G.mobs.list.find(q => q.id === m.id); if (mb) G.mobs.hit(mb, +m.d || 1, m.dir, from); }
    else if (m.t === 'dmg' && G.remote) hurt(+m.n || 1, m.why, m.dir);
    else if (m.t === 'boom') { explode(m.x, m.y, m.z, m.r, true); if (!NET.conn) NET.relay(m, from); }
    else if (m.t === 'bye' && G.remote) { toast('El anfitrión cerró la partida', 4000); quitWorld(); }
  }

  /* ───────── botones ───────── */
  const act = {
    playWorld: () => selWorld && startWorld(selWorld),
    delWorld: async () => { if (!selWorld) return; if (!confirm('¿Borrar "' + selWorld.name + '" para siempre?')) return; await DB.delWorld(selWorld.id); selWorld = null; renderWorlds(); },
    create: () => {
      const name = $('#nName').value.trim() || 'Mundo nuevo', st = $('#nSeed').value.trim();
      const seed = !st ? (Math.random() * 2 ** 31) | 0 : /^-?\d+$/.test(st) ? (+st) | 0 : hashStr(st);
      startWorld({ id: 'w' + Date.now().toString(36), name, seed: seed >>> 0, mode: newMode, created: Date.now(), played: Date.now() });
    },
    join: () => join($('#mCode').value, $('#mName').value),
    optBack: () => { if (backFrom === 'pause' && playing()) { show('sPause'); $('#hud').hidden = false; } else go.title(); },
    resume, invite: host,
    copyCode: () => { navigator.clipboard?.writeText(NET.code || '').then(() => toast('Código copiado')).catch(() => { }); },
    quitWorld, respawn, quit: () => window.close(), closeMod: () => closeMod(),
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.go) { sfx('pop'); go[b.dataset.go](); }
    else if (b.dataset.act) { sfx('pop'); act[b.dataset.act](); }
    else if (b.dataset.mode) setMode(b.dataset.mode);
    else if (b.dataset.toggle) { S[b.dataset.toggle] = !S[b.dataset.toggle]; saveS(); renderOptions(); debugText(); }
  });

  /* ───────── bucle principal ───────── */
  let last = performance.now(), acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    const w = G.world;
    if (G.state === 'title' && menuWorld) {
      G.menuYaw += dt * .05; const c = menuWorld.cam;
      camera.position.copy(c); camera.rotation.set(-.18, G.menuYaw, 0);
      menuWorld.update(c.x, c.z, Math.min(S.rd, 6), 10); sky(.1, camera.position);
    } else if (w && (G.state === 'loading' || G.state === 'play' || G.state === 'dead')) {
      if (G.state === 'loading') {
        w.update(P.pos.x, P.pos.z, S.rd, 40);
        let done = 0; const r = 2; for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (w.ready(P.pos.x + dx * 16, P.pos.z + dz * 16, 0)) done++;
        $('#loadBar').style.width = Math.round(done / 25 * 100) + '%';
        if (w.ready(P.pos.x, P.pos.z, 2)) finishLoading();
      } else {
        const frozen = (G.ui === 'sPause' || G.ui === 'sMod') && !NET.peer;
        if (!frozen && G.state === 'play') {
          acc += dt; let n = 0; while (acc >= 1 / 60 && n++ < 6) { step(1 / 60); acc -= 1 / 60; } if (n >= 6) acc = 0;
          if (!MOD.freeze) G.time = (G.time + dt / 720) % 1;
          if (G.mobs && !G.remote) G.mobs.update(dt, { spawn: MOD.mobs, dark: (G.dl ?? 1) < .3, day: (G.dl ?? 1) > .55, peaceful: MOD.peaceful, max: 10 });
        }
        if (G.mobs && G.remote) G.mobs.follow(dt);
        if (G.mobs && NET.peer && !NET.conn && now - (NET.mobT || 0) > 125) { NET.mobT = now; NET.send({ t: 'mobs', l: G.mobs.pack() });
        }
        w.update(P.pos.x, P.pos.z, S.rd, 6);
        if (G.state === 'play' && !G.ui) interact(dt); else hl.visible = crack.visible = false;
        modTag();
        if (NET.peer && now - NET.sendT > 100) { NET.sendT = now; NET.send({ t: 'p', id: NET.id, n: S.name, p: [+P.pos.x.toFixed(2), +P.pos.y.toFixed(2), +P.pos.z.toFixed(2)], r: [+P.yaw.toFixed(3), +P.pitch.toFixed(3)] }); }
        if (NET.peer && !NET.conn && now - (NET.timeT || 0) > 10000) { NET.timeT = now; NET.send({ t: 'time', v: G.time }); }
      }
      const eyeH = P.crouch ? EYE - .25 : EYE;
      camera.position.set(P.pos.x, P.pos.y + eyeH, P.pos.z); camera.rotation.set(P.pitch, P.yaw, 0);
      const fovT = S.fov * (P.sprint && (Math.abs(P.vel.x) + Math.abs(P.vel.z)) > 3 ? 1.1 : 1); if (Math.abs(camera.fov - fovT) > .1) { camera.fov += (fovT - camera.fov) * Math.min(1, dt * 10); camera.updateProjectionMatrix(); }
      sky(G.time, camera.position);
      updParts(dt); updRemotes(dt);
    }
    renderer.render(scene, camera);
    G.fpsN++; if (now - G.fpsT > 500) { G.fps = Math.round(G.fpsN * 1000 / (now - G.fpsT)); G.fpsN = 0; G.fpsT = now; debugText(); }
  }
  function debugText() {
    const d = $('#debug'), w = G.world, full = G.f3 && playing() && w;
    d.hidden = !(full || S.fps); if (d.hidden) return;
    if (!full) { d.textContent = G.fps + ' FPS'; return; }
    const p = P.pos, [, b] = w.terrain(Math.floor(p.x), Math.floor(p.z));
    d.textContent = `GonzaCraft · ${G.fps} FPS\nXYZ: ${p.x.toFixed(1)} / ${p.y.toFixed(1)} / ${p.z.toFixed(1)}\nChunk: ${Math.floor(p.x / 16)}, ${Math.floor(p.z / 16)} · cargados ${w.chunks.size}\nBioma: ${BIONAME[b]}\nHora: ${String(Math.floor((G.time * 24 + 6) % 24)).padStart(2, '0')}:00\n` + (G.target ? `Mirando: ${B[G.target.id].n} (${G.target.x}, ${G.target.y}, ${G.target.z})` : '') + (NET.code ? `\nCódigo: ${NET.code} · ${NET.conns.size} amigos` : '');
  }

  /* inicio */
  const SPL = ['¡Gratis para siempre!', '¡Hecho en Argentina!', '¡Mundo infinito!', '¡Con multijugador!', '¡Sin marca de agua!', '¡Ahora con lámparas!', '¡Bloques artesanales!', '¡Cuidado con los cactus!', '¡Ojo con las Sombras!', '¡Apretá M!'];
  $('#splash').textContent = SPL[Math.random() * SPL.length | 0];
  startMenuWorld(); G.state = 'title'; go.title();
  requestAnimationFrame(frame);
  window.__gc = { MOD, openMod, closeMod, explode, attackMob, get mobs() { return G.mobs; }, G, P, S, K, act, go, DB, NET, startWorld, quitWorld, saveGame, step, place, breakTarget, selectSlot, openInv, closeInv, command, hideScreens, camera, renderer, scene, get world() { return G.world; } };
})();
