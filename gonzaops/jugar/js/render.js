/* GonzaOps · dibujo 3D con three.js: mapa con texturas hechas en código, jugadores, arma en mano y efectos. */
(function () {
  'use strict';
  const Ops = globalThis.Ops;
  const R = globalThis.Render = {};
  let ren, escena, cam, escenaV, camV, sol, luzFogonazo, reloj = 0;
  const jugadores = new Map();
  let calidad = 'alta';

  /* ───── texturas procedurales ───── */
  function lienzo(n, dibujar) { const c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d'); dibujar(x, n); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace; return t; }
  function ruido(x, n, a, col) { const d = x.getImageData(0, 0, n, n); for (let i = 0; i < d.data.length; i += 4) { const r = (Math.random() - .5) * a; d.data[i] += r; d.data[i + 1] += r; d.data[i + 2] += r * (col || 1); } x.putImageData(d, 0, 0); }
  const TEX = {};
  function crearTexturas() {
    TEX.arenisca = lienzo(256, (x, n) => { x.fillStyle = '#c8a46c'; x.fillRect(0, 0, n, n); x.strokeStyle = 'rgba(90,60,30,.35)'; x.lineWidth = 3; for (let f = 0; f < 8; f++) { const y = f * 32; x.beginPath(); x.moveTo(0, y); x.lineTo(n, y); x.stroke(); for (let k = 0; k < 4; k++) { const xx = (k * 64 + (f % 2) * 32) % n; x.beginPath(); x.moveTo(xx, y); x.lineTo(xx, y + 32); x.stroke(); } } for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(${Math.random() < .5 ? '255,240,210' : '110,80,40'},.08)`; x.fillRect(Math.random() * n, Math.random() * n, 20 + Math.random() * 40, 10 + Math.random() * 20); } ruido(x, n, 26); });
    TEX.concreto = lienzo(256, (x, n) => { x.fillStyle = '#a3a7aa'; x.fillRect(0, 0, n, n); x.strokeStyle = 'rgba(40,45,50,.35)'; x.lineWidth = 2; x.strokeRect(1, 1, n - 2, n - 2); x.beginPath(); x.moveTo(0, n / 2); x.lineTo(n, n / 2); x.stroke(); for (let i = 0; i < 6; i++) { const g = x.createLinearGradient(0, 0, 0, n); g.addColorStop(0, 'rgba(60,55,50,0)'); g.addColorStop(1, 'rgba(60,55,50,.18)'); x.fillStyle = g; x.fillRect(Math.random() * n, 0, 8 + Math.random() * 30, n); } ruido(x, n, 22); });
    TEX.piso = lienzo(256, (x, n) => { x.fillStyle = '#8d7d64'; x.fillRect(0, 0, n, n); for (let f = 0; f < 8; f++) for (let k = 0; k < 8; k++) { const s = 30 + Math.random() * 10; x.fillStyle = `hsl(${30 + Math.random() * 8},${18 + Math.random() * 10}%,${40 + Math.random() * 10}%)`; x.fillRect(k * 32 + 2 + (f % 2) * 16, f * 32 + 2, s - 4, 28); } ruido(x, n, 18); });
    TEX.pisoBase = lienzo(256, (x, n) => { x.fillStyle = '#7c8086'; x.fillRect(0, 0, n, n); x.strokeStyle = 'rgba(30,30,30,.35)'; x.lineWidth = 2; for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64, n); x.stroke(); x.beginPath(); x.moveTo(0, i * 64); x.lineTo(n, i * 64); x.stroke(); } ruido(x, n, 16); });
    TEX.madera = lienzo(128, (x, n) => { x.fillStyle = '#9a6a35'; x.fillRect(0, 0, n, n); for (let i = 0; i < 6; i++) { x.fillStyle = i % 2 ? 'rgba(70,40,15,.15)' : 'rgba(255,220,160,.08)'; x.fillRect(0, i * n / 6, n, n / 6); } x.strokeStyle = '#5b3a17'; x.lineWidth = 10; x.strokeRect(5, 5, n - 10, n - 10); x.beginPath(); x.moveTo(8, 8); x.lineTo(n - 8, n - 8); x.moveTo(n - 8, 8); x.lineTo(8, n - 8); x.stroke(); ruido(x, n, 20); });
    TEX.maderaOsc = lienzo(128, (x, n) => { x.fillStyle = '#6e4a26'; x.fillRect(0, 0, n, n); x.strokeStyle = '#3d2711'; x.lineWidth = 8; x.strokeRect(4, 4, n - 8, n - 8); for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(0, i * n / 4); x.lineTo(n, i * n / 4); x.stroke(); } ruido(x, n, 20); });
    const cont = col => lienzo(128, (x, n) => { x.fillStyle = col; x.fillRect(0, 0, n, n); for (let i = 0; i < n; i += 10) { x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(i, 0, 4, n); x.fillStyle = 'rgba(255,255,255,.08)'; x.fillRect(i + 5, 0, 2, n); } for (let i = 0; i < 20; i++) { x.fillStyle = 'rgba(90,50,20,.25)'; x.fillRect(Math.random() * n, Math.random() * n, 3 + Math.random() * 10, 2 + Math.random() * 14); } ruido(x, n, 14); });
    TEX.contRojo = cont('#a9442d'); TEX.contAzul = cont('#2d5f9c'); TEX.contVerde = cont('#3d7d4c');
    TEX.baranda = lienzo(64, (x, n) => { x.fillStyle = '#5d6166'; x.fillRect(0, 0, n, n); for (let i = -n; i < n * 2; i += 16) { x.fillStyle = '#d6a72a'; x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 8, 0); x.lineTo(i + 8 - n * .5, n * .25); x.lineTo(i - n * .5, n * .25); x.fill(); } ruido(x, n, 10); });
    TEX.humo = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.5, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    TEX.agujero = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); const g = x.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(10,10,10,.95)'); g.addColorStop(.35, 'rgba(25,22,20,.8)'); g.addColorStop(1, 'rgba(40,35,30,0)'); x.fillStyle = g; x.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
    TEX.fogonazo = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(.3, 'rgba(255,200,90,.9)'); g.addColorStop(1, 'rgba(255,120,20,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); for (let i = 0; i < 6; i++) { x.save(); x.translate(32, 32); x.rotate(i * Math.PI / 3); x.fillStyle = 'rgba(255,230,150,.7)'; x.fillRect(0, -2, 30, 4); x.restore(); } return new THREE.CanvasTexture(c); })();
  }
  function textoTex(txt, col, fondo) { const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d'); if (fondo) { x.fillStyle = fondo; x.fillRect(0, 0, 256, 256); } x.fillStyle = col; x.font = '900 210px Arial Black, Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.globalAlpha = .85; x.fillText(txt, 128, 140); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

  /* ───── iniciar ───── */
  R.init = function (canvas, cal) {
    calidad = cal || 'alta';
    ren = new THREE.WebGLRenderer({ canvas, antialias: calidad !== 'baja', powerPreference: 'high-performance' });
    ren.setPixelRatio(Math.min(devicePixelRatio || 1, calidad === 'alta' ? 1.75 : calidad === 'media' ? 1.25 : 0.85));
    ren.outputColorSpace = THREE.SRGBColorSpace; ren.toneMapping = THREE.ACESFilmicToneMapping; ren.toneMappingExposure = 1.05;
    ren.shadowMap.enabled = calidad === 'alta'; ren.shadowMap.type = THREE.PCFSoftShadowMap; ren.autoClear = false;
    escena = new THREE.Scene();
    escena.fog = new THREE.Fog(0xcfd9e0, 45, 140);
    cam = new THREE.PerspectiveCamera(78, 1, 0.05, 300); cam.rotation.order = 'YXZ';
    escenaV = new THREE.Scene(); camV = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
    escenaV.add(new THREE.HemisphereLight(0xfff4e0, 0x55504a, 1.5)); const lv = new THREE.DirectionalLight(0xffffff, 1.4); lv.position.set(1, 2, 1); escenaV.add(lv);
    crearTexturas();
    // cielo
    const cielo = lienzo(256, (x, n) => { const g = x.createLinearGradient(0, 0, 0, n); g.addColorStop(0, '#5f9ad6'); g.addColorStop(.55, '#a9cbe8'); g.addColorStop(1, '#e8d9c0'); x.fillStyle = g; x.fillRect(0, 0, n, n); });
    cielo.wrapS = THREE.ClampToEdgeWrapping; cielo.wrapT = THREE.ClampToEdgeWrapping;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 24, 12), new THREE.MeshBasicMaterial({ map: cielo, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.geometry.attributes.uv.array.forEach((v, i, a) => { }); escena.add(sky); R._cielo = sky;
    escena.add(new THREE.HemisphereLight(0xdde8ff, 0x8a7558, 1.05));
    sol = new THREE.DirectionalLight(0xfff1d6, 2.1); sol.position.set(30, 60, 20);
    if (calidad === 'alta') { sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048); const s = sol.shadow.camera; s.left = -50; s.right = 50; s.top = 50; s.bottom = -50; s.near = 1; s.far = 160; sol.shadow.bias = -0.0005; sol.shadow.normalBias = 0.03; }
    escena.add(sol); escena.add(sol.target);
    luzFogonazo = new THREE.PointLight(0xffc070, 0, 9, 2); escena.add(luzFogonazo);
    crearEfectos();
    R.tamaño();
    addEventListener('resize', R.tamaño);
  };
  R.tamaño = function () { const w = innerWidth, h = innerHeight; ren.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); camV.aspect = w / h; camV.updateProjectionMatrix(); };
  R.calidad = c => calidad;

  /* ───── mapa ───── */
  R.mapa = function (m) {
    const C = m.CELL;
    const grupos = {};
    const g = k => grupos[k] || (grupos[k] = { p: [], n: [], uv: [], c: [] });
    const quad = (k, a, b, c2, d, n, uvs, ao) => { const G = g(k); for (const v of [a, b, c2, a, c2, d]) G.p.push(v[0], v[1], v[2]); for (let i = 0; i < 6; i++) G.n.push(n[0], n[1], n[2]); for (const i of [0, 1, 2, 0, 2, 3]) { G.uv.push(uvs[i][0], uvs[i][1]); const s = ao ? ao[i] : 1; G.c.push(s, s, s); } };
    const H = (x, z) => (x < 0 || z < 0 || x >= m.W || z >= m.H) ? 99 : m.h[z * m.W + x];
    const T = (x, z) => m.tipo[z * m.W + x];
    const matPared = (x, z) => z <= 11 ? 'concreto' : 'arenisca';
    const matCaja = (x, z) => { const t = T(x, z); return t === 2 ? 'madera' : t === 3 ? 'maderaOsc' : t === 4 ? ['contRojo', 'contAzul', 'contVerde'][(x * 7 + z * 3) % 3] : t === 5 ? 'baranda' : matPared(x, z); };
    for (let z = 0; z < m.H; z++) for (let x = 0; x < m.W; x++) {
      const h = H(x, z), x0 = x * C, x1 = x0 + C, z0 = z * C, z1 = z0 + C;
      if (h === 0) {
        const zn = m.zona[z * m.W + x]; const mat = zn === 1 || zn === 2 ? 'pisoBase' : 'piso';
        quad(mat, [x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], [0, 1, 0], [[x0 / 4, z1 / 4], [x1 / 4, z1 / 4], [x1 / 4, z0 / 4], [x0 / 4, z0 / 4]]);
        continue;
      }
      const mat = matCaja(x, z), esCaja = T(x, z) >= 2 && T(x, z) <= 5;
      const sc = esCaja ? 1 / Math.max(1, h) : .25, su = esCaja ? .5 : .25; // los cajones muestran una cara entera por lado
      if (h < 99 && h < Ops.PARED) quad(mat, [x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
      // caras laterales donde el vecino es más bajo
      const lados = [[x, z + 1, [x0, z1], [x1, z1], [0, 0, 1]], [x, z - 1, [x1, z0], [x0, z0], [0, 0, -1]], [x + 1, z, [x1, z1], [x1, z0], [1, 0, 0]], [x - 1, z, [x0, z0], [x0, z1], [-1, 0, 0]]];
      for (const [nx, nz, a, b, n] of lados) {
        const hn = H(nx, nz); if (hn >= h) continue;
        const y0 = hn, y1 = h;
        const u0 = esCaja ? 0 : (a[0] + a[1]) * su, u1 = esCaja ? 1 : u0 + C * su, v0 = esCaja ? 0 : y0 * sc, v1 = esCaja ? 1 : y1 * sc;
        const ao = y0 === 0 ? [.62, .62, 1, 1] : [1, 1, 1, 1];
        quad(mat, [a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], n, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], [ao[0], ao[1], ao[2], ao[0], ao[2], ao[3]].length ? ao : null);
      }
    }
    const raiz = new THREE.Group();
    for (const k in grupos) {
      const G = grupos[k], geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(G.p, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(G.n, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(G.uv, 2));
      // ao por vértice (oscurece la base de las paredes)
      const col = new Float32Array(G.p.length); for (let i = 0; i < G.p.length / 3; i++) { const y = G.p[i * 3 + 1]; const s = k.startsWith('piso') ? 1 : (y < 0.01 ? 0.62 : 1); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = s; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: TEX[k], vertexColors: true }));
      mesh.receiveShadow = true; mesh.castShadow = !k.startsWith('piso'); raiz.add(mesh);
    }
    // letras de los sitios pintadas en el piso
    for (const [nombre, s] of Object.entries(m.sitios)) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshLambertMaterial({ map: textoTex(nombre, '#e8c43a'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      pl.rotation.x = -Math.PI / 2; pl.position.set(s.x, 0.02, s.z + 3.2); raiz.add(pl);
      // líneas de la zona
      const borde = new THREE.Mesh(new THREE.RingGeometry(4.2, 4.45, 48), new THREE.MeshBasicMaterial({ color: 0xd9b440, transparent: true, opacity: .5, depthWrite: false })); borde.rotation.x = -Math.PI / 2; borde.position.set(s.x, 0.025, s.z); raiz.add(borde);
    }
    escena.add(raiz);
    sol.position.set(m.W * C / 2 + 30, 60, m.H * C / 2 + 20); sol.target.position.set(m.W * C / 2, 0, m.H * C / 2);
    R._centro = { x: m.W * C / 2, z: m.H * C / 2 };
  };

  /* ───── jugadores (modelos de cajas) ───── */
  const GEO = {}, MAT = {};
  function caja(w, h, d, oy) { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, oy || 0, 0); return g; }
  function mat(c) { return MAT[c] || (MAT[c] = new THREE.MeshLambertMaterial({ color: c })); }
  function crearJugador(team) {
    if (!GEO.torso) { GEO.torso = caja(.5, .62, .28, .31); GEO.cabeza = caja(.26, .28, .27, .14); GEO.casco = caja(.3, .12, .31, .06); GEO.pierna = caja(.18, .82, .2, -.41); GEO.brazo = caja(.14, .62, .15, -.28); GEO.arma = caja(.07, .1, .7, 0); GEO.chaleco = caja(.54, .4, .32, .22); }
    const col = team === 0 ? { ropa: 0x6b5a42, chaleco: 0xc4682a, casco: 0x3b3326 } : { ropa: 0x2b3a52, chaleco: 0x2f6bc4, casco: 0x1d2633 };
    const gr = new THREE.Group(), cuerpo = new THREE.Group(); gr.add(cuerpo);
    const piel = mat(0xc89a74);
    const torso = new THREE.Mesh(GEO.torso, mat(col.ropa)); torso.position.y = .86; cuerpo.add(torso);
    const chaleco = new THREE.Mesh(GEO.chaleco, mat(col.chaleco)); chaleco.position.y = .9; cuerpo.add(chaleco);
    const cab = new THREE.Group(); cab.position.y = 1.5; cuerpo.add(cab);
    cab.add(new THREE.Mesh(GEO.cabeza, piel)); const casco = new THREE.Mesh(GEO.casco, mat(col.casco)); casco.position.y = .22; cab.add(casco);
    const pi = new THREE.Mesh(GEO.pierna, mat(0x3a3a36)); pi.position.set(-.13, .84, 0); const pd = pi.clone(); pd.position.x = .13; cuerpo.add(pi, pd);
    const bi = new THREE.Mesh(GEO.brazo, mat(col.ropa)); bi.position.set(-.33, 1.42, 0); const bd = bi.clone(); bd.position.x = .33; cuerpo.add(bi, bd);
    const arma = new THREE.Mesh(GEO.arma, mat(0x222222)); arma.position.set(.12, 1.18, -.38); cuerpo.add(arma);
    const bomba = new THREE.Mesh(caja(.34, .24, .14, 0), mat(0xb52a1e)); bomba.position.set(0, 1.0, .22); bomba.visible = false; cuerpo.add(bomba);
    gr.traverse(o => { if (o.isMesh) { o.castShadow = calidad === 'alta'; } });
    escena.add(gr);
    return { gr, cuerpo, cab, pi, pd, bi, bd, arma, bomba, team, fase: 0, caida: 0, nombre: null };
  }
  R.jugador = function (id, team) {
    let j = jugadores.get(id);
    if (!j || j.team !== team) { if (j) escena.remove(j.gr); j = crearJugador(team); jugadores.set(id, j); }
    return j;
  };
  R.quitarJugador = id => { const j = jugadores.get(id); if (j) { escena.remove(j.gr); jugadores.delete(id); } };
  R.etiqueta = function (id, texto, color) {
    const j = jugadores.get(id); if (!j) return;
    if (j.nombre && j.nombre.userData.txt === texto) return;
    if (j.nombre) j.cuerpo.remove(j.nombre);
    const c = document.createElement('canvas'); c.width = 256; c.height = 48; const x = c.getContext('2d'); x.font = '600 26px system-ui, sans-serif'; x.textAlign = 'center'; x.fillStyle = 'rgba(0,0,0,.45)'; const w = x.measureText(texto).width + 20; x.fillRect(128 - w / 2, 6, w, 36); x.fillStyle = color; x.fillText(texto, 128, 33);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); sp.scale.set(1.3, .25, 1); sp.position.y = 2.15; sp.renderOrder = 5; sp.userData.txt = texto; j.cuerpo.add(sp); j.nombre = sp;
  };
  // o: {x,y,z,yaw,pitch,ag,vivo,vel,bomba,visible,nombreVisible}
  R.pose = function (id, o, dt) {
    const j = jugadores.get(id); if (!j) return;
    j.gr.visible = o.visible !== false;
    j.gr.position.set(o.x, o.y, o.z); j.gr.rotation.y = -o.yaw;
    if (!o.vivo) {
      j.caida = Math.min(1, j.caida + dt * 2.5);
      j.cuerpo.rotation.x = -Math.PI / 2 * easeOut(j.caida); j.cuerpo.position.y = .15 * j.caida;
      if (j.nombre) j.nombre.visible = false; j.bomba.visible = false; return;
    }
    j.caida = 0; j.cuerpo.rotation.x = 0; j.cuerpo.position.y = 0;
    if (j.nombre) j.nombre.visible = !!o.nombreVisible;
    const v = Math.min(1, o.vel / 5); j.fase += dt * (4 + o.vel * 1.6);
    const s = Math.sin(j.fase) * .7 * v;
    j.pi.rotation.x = s; j.pd.rotation.x = -s;
    const agach = o.ag ? 1 : 0;
    j.cuerpo.scale.y = 1 - agach * .25;
    j.bi.rotation.x = -1.2 + o.pitch * .6; j.bd.rotation.x = -1.3 + o.pitch * .6;
    j.cab.rotation.x = o.pitch * .7;
    j.arma.position.y = 1.2 + Math.sin(o.pitch) * .25; j.arma.rotation.x = o.pitch;
    j.bomba.visible = !!o.bomba;
  };
  function easeOut(t) { return 1 - (1 - t) * (1 - t); }

  /* ───── arma en mano (vista en primera persona) ───── */
  let vista = null, vistaArma = -2, vistaTeam = -1;
  const VM = {
    pampa: [[.05, .055, .26, 0, .025, 0, 0x55595f], [.045, .045, .22, 0, -.02, .02, 0x2b2d31], [.04, .13, .06, 0, -.1, .09, 0x232427], [.012, .02, .02, 0, .06, -.11, 0x111111]],
    halcon: [[.06, .065, .32, 0, .03, 0, 0xa8acb2], [.055, .05, .26, 0, -.025, .02, 0x6d7177], [.05, .14, .07, 0, -.11, .1, 0x2b2420], [.014, .022, .02, 0, .072, -.14, 0x111111]],
    tero: [[.09, .13, .5, 0, 0, 0, 0x2b2b2b], [.06, .22, .07, 0, -.17, -.02, 0x1a1a1a], [.04, .04, .22, 0, .02, -.34, 0x333333], [.06, .1, .2, 0, -.02, .3, 0x2b2b2b]],
    tala: [[.1, .12, .8, 0, 0, -.1, 0x3d2b1a], [.05, .05, .7, 0, .07, -.2, 0x2a2a2a], [.08, .1, .28, 0, -.04, .32, 0x5a3a20]],
    ombu: [[.09, .14, .62, 0, 0, 0, 0x30332a], [.07, .24, .09, 0, -.18, -.05, 0x1f1f1f], [.035, .035, .32, 0, .03, -.45, 0x222222], [.08, .12, .28, 0, -.03, .38, 0x4a3f2f], [.03, .05, .12, 0, .1, .05, 0x222222]],
    condor: [[.09, .13, .9, 0, 0, -.1, 0x3b4430], [.05, .05, .5, 0, .02, -.7, 0x222222], [.07, .07, .32, 0, .13, -.02, 0x111111], [.08, .13, .3, 0, -.02, .38, 0x3b4430]],
    cuchillo: [[.03, .06, .3, 0, 0, -.12, 0xc9cfd6], [.04, .07, .13, 0, -.01, .1, 0x222222]],
    granada: [[.11, .13, .11, 0, 0, 0, 0x4f5a3a]],
  };
  R.vista = function (armaId, team) {
    if (armaId === vistaArma && team === vistaTeam) return;
    vistaArma = armaId; vistaTeam = team;
    if (vista) escenaV.remove(vista);
    const nombre = armaId >= 100 ? 'granada' : Ops.ARMA_ID[armaId] || 'cuchillo';
    const g = new THREE.Group(), arma = new THREE.Group();
    for (const p of VM[nombre]) { const m = new THREE.Mesh(new THREE.BoxGeometry(p[0], p[1], p[2]), new THREE.MeshLambertMaterial({ color: p[6] })); m.position.set(p[3], p[4], p[5]); arma.add(m); }
    if (nombre === 'granada') arma.children[0].material.color.set(armaId === 101 ? 0x8a8f93 : armaId === 102 ? 0xd0d4d8 : 0x4f5a3a);
    g.add(arma);
    const manga = new THREE.MeshLambertMaterial({ color: team === 0 ? 0x6b5a42 : 0x2b3a52 }), piel = new THREE.MeshLambertMaterial({ color: 0xc89a74 }), guante = new THREE.MeshLambertMaterial({ color: 0x262626 });
    const brazoD = new THREE.Mesh(new THREE.BoxGeometry(.09, .09, .5), manga); brazoD.position.set(.05, -.12, .38); brazoD.rotation.x = .25; g.add(brazoD);
    const manoD = new THREE.Mesh(new THREE.BoxGeometry(.08, .09, .1), guante); manoD.position.set(0, -.1, .12); g.add(manoD);
    if (!['pampa', 'halcon', 'cuchillo', 'granada'].includes(nombre)) { const brazoI = new THREE.Mesh(new THREE.BoxGeometry(.09, .09, .55), manga); brazoI.position.set(-.16, -.15, -.05); brazoI.rotation.set(.3, -.55, 0); g.add(brazoI); const manoI = new THREE.Mesh(new THREE.BoxGeometry(.08, .09, .1), guante); manoI.position.set(-.04, -.08, -.22); g.add(manoI); }
    const fog = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.fogonazo, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); fog.scale.set(.32, .32, 1);
    const largo = { pampa: .17, halcon: .2, tero: .55, tala: .62, ombu: .62, condor: .95 }[nombre] || .4; fog.position.set(0, .02, -largo); fog.visible = false; g.add(fog);
    g.userData = { fog, base: nombre === 'cuchillo' ? [.22, -.22, -.45] : nombre === 'granada' ? [.2, -.2, -.42] : ['pampa', 'halcon'].includes(nombre) ? [.16, -.16, -.5] : [.15, -.165, -.46], nombre };
    vista = g; escenaV.add(g);
  };
  // a: {bob, swayX, swayY, retro, recarga(0..1), cambio(0..1), fog, apuntando, oculta, corte}
  R.animarVista = function (a) {
    if (!vista) return; const b = vista.userData.base;
    vista.visible = !a.oculta;
    const rec = a.recarga > 0 ? Math.sin(Math.min(1, a.recarga) * Math.PI) : 0, cam2 = a.cambio || 0;
    vista.position.set(b[0] + Math.sin(a.bob * 2) * .012 + a.swayX, b[1] + Math.abs(Math.cos(a.bob * 2)) * .012 + a.swayY - rec * .18 - cam2 * .3, b[2] + a.retro * .07);
    vista.rotation.set(a.retro * .12 + rec * .6 - (a.corte || 0) * .9, (a.corte || 0) * .5, rec * .4);
    vista.userData.fog.visible = !!a.fog; if (a.fog) vista.userData.fog.material.rotation = Math.random() * 6;
  };

  /* ───── efectos ───── */
  const PART = 600; let part, partPos, partCol, partVel = [], partVida = new Float32Array(PART), partI = 0;
  const trazos = [], agujeros = [], humos = [], destellos = [];
  let agujeroI = 0, granadasMesh = new Map(), itemsMesh = new Map(), bombaMesh;
  function crearEfectos() {
    const geo = new THREE.BufferGeometry(); partPos = new Float32Array(PART * 3).fill(-999); partCol = new Float32Array(PART * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(partPos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(partCol, 3));
    part = new THREE.Points(geo, new THREE.PointsMaterial({ size: .09, vertexColors: true, transparent: true, depthWrite: false })); part.frustumCulled = false; escena.add(part);
    for (let i = 0; i < PART; i++) partVel.push([0, 0, 0, 0]);
    const ag = new THREE.PlaneGeometry(.13, .13); const am = new THREE.MeshBasicMaterial({ map: TEX.agujero, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    for (let i = 0; i < 90; i++) { const m = new THREE.Mesh(ag, am); m.visible = false; escena.add(m); agujeros.push(m); }
    bombaMesh = new THREE.Group(); const cuerpoB = new THREE.Mesh(new THREE.BoxGeometry(.42, .16, .3), new THREE.MeshLambertMaterial({ color: 0x8a2a1e })); cuerpoB.position.y = .08; bombaMesh.add(cuerpoB);
    const pant = new THREE.Mesh(new THREE.BoxGeometry(.16, .02, .1), new THREE.MeshBasicMaterial({ color: 0x1a1a1a })); pant.position.set(.06, .17, 0); bombaMesh.add(pant);
    const luz = new THREE.Mesh(new THREE.SphereGeometry(.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a1a })); luz.position.set(-.12, .18, .06); bombaMesh.add(luz); bombaMesh.userData.luz = luz;
    bombaMesh.visible = false; escena.add(bombaMesh);
  }
  function particula(x, y, z, vx, vy, vz, r, g, b, vida) {
    const i = partI; partI = (partI + 1) % PART;
    partPos[i * 3] = x; partPos[i * 3 + 1] = y; partPos[i * 3 + 2] = z; partCol[i * 3] = r; partCol[i * 3 + 1] = g; partCol[i * 3 + 2] = b;
    partVel[i][0] = vx; partVel[i][1] = vy; partVel[i][2] = vz; partVel[i][3] = vida; partVida[i] = vida;
  }
  R.trazo = function (a, b, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
    const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: color || 0xffe9a8, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false }));
    escena.add(l); trazos.push({ l, vida: .07 });
  };
  R.impacto = function (x, y, z, nx, ny, nz, tipo) {
    if (tipo === 'sangre') { for (let i = 0; i < 12; i++) particula(x, y, z, (Math.random() - .5) * 2.4, Math.random() * 2, (Math.random() - .5) * 2.4, .55 + Math.random() * .2, .04, .04, .5); return; }
    for (let i = 0; i < 7; i++) particula(x + nx * .02, y + ny * .02, z + nz * .02, nx * 2 + (Math.random() - .5) * 2.5, ny * 2 + Math.random() * 2, nz * 2 + (Math.random() - .5) * 2.5, .75, .68, .55, .45);
    particula(x, y, z, nx, ny, nz, 1, .85, .45, .08);
    const m = agujeros[agujeroI]; agujeroI = (agujeroI + 1) % agujeros.length;
    m.visible = true; m.position.set(x + nx * .012, y + ny * .012, z + nz * .012); m.lookAt(x + nx, y + ny, z + nz); m.rotation.z = Math.random() * 6;
  };
  R.explosion = function (x, y, z, grande) {
    const n = grande ? 160 : 70;
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, e = Math.random() * 1.4, v = (grande ? 9 : 6) * Math.random(); particula(x, y + .3, z, Math.cos(a) * Math.cos(e) * v, Math.sin(e) * v + 1, Math.sin(a) * Math.cos(e) * v, 1, .55 + Math.random() * .35, .15, .9); }
    for (let i = 0; i < n / 2; i++) particula(x, y + .4, z, (Math.random() - .5) * 3, Math.random() * 3, (Math.random() - .5) * 3, .25, .23, .21, 1.6);
    const s = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.position.set(x, y + .5, z); escena.add(s); destellos.push({ m: s, vida: .45, max: .45, r: grande ? 9 : 4 });
    const l = new THREE.PointLight(0xffb060, grande ? 60 : 25, grande ? 40 : 18, 2); l.position.set(x, y + 1.5, z); escena.add(l); destellos.push({ m: l, vida: .3, max: .3, luz: true });
  };
  R.destello = function (x, y, z) { const l = new THREE.PointLight(0xffffff, 40, 25, 2); l.position.set(x, y + .3, z); escena.add(l); destellos.push({ m: l, vida: .25, max: .25, luz: true }); for (let i = 0; i < 30; i++) particula(x, y, z, (Math.random() - .5) * 6, Math.random() * 4, (Math.random() - .5) * 6, 1, 1, .9, .3); };
  R.humo = function (x, y, z, dur) {
    const g = new THREE.Group(); const n = calidad === 'baja' ? 10 : 18;
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.humo, color: 0xb9bcbf, transparent: true, opacity: 0, depthWrite: false }));
      const a = Math.random() * 6.28, r = Math.random() * 2.8; sp.position.set(Math.cos(a) * r, .6 + Math.random() * 2.6, Math.sin(a) * r); sp.userData.s = 3.5 + Math.random() * 2.5; sp.scale.setScalar(.5); g.add(sp);
    }
    g.position.set(x, y, z); escena.add(g); humos.push({ g, t: 0, dur: dur || 17 });
  };
  R.fogonazoMundo = function (x, y, z) { luzFogonazo.position.set(x, y, z); luzFogonazo.intensity = 6; };
  R.granadas = function (lista) {
    const vistos = new Set();
    for (const [id, tipo, x, y, z] of lista) {
      vistos.add(id); let m = granadasMesh.get(id);
      if (!m) { m = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), new THREE.MeshLambertMaterial({ color: tipo === 'he' ? 0x4f5a3a : tipo === 'humo' ? 0x8a8f93 : 0xd0d4d8 })); escena.add(m); granadasMesh.set(id, m); }
      m.position.set(x, y + .05, z);
    }
    for (const [id, m] of granadasMesh) if (!vistos.has(id)) { escena.remove(m); granadasMesh.delete(id); }
  };
  R.items = function (lista) {
    const vistos = new Set();
    for (const [id, a, x, y, z] of lista) {
      vistos.add(id); let m = itemsMesh.get(id);
      if (!m) { m = new THREE.Group(); const nombre = Ops.ARMA_ID[a]; for (const p of VM[nombre] || VM.ombu) { const b = new THREE.Mesh(new THREE.BoxGeometry(p[0], p[1], p[2]), new THREE.MeshLambertMaterial({ color: p[6] })); b.position.set(p[3], p[4], p[5]); m.add(b); } m.rotation.set(Math.PI / 2, 0, Math.random() * 6); m.scale.setScalar(1.3); escena.add(m); itemsMesh.set(id, m); }
      m.position.set(x, y + .06, z); m.rotation.z += .01;
    }
    for (const [id, m] of itemsMesh) if (!vistos.has(id)) { escena.remove(m); itemsMesh.delete(id); }
  };
  R.bomba = function (b, t) {
    bombaMesh.visible = b && (b.e === 'suelo' || b.e === 'plantada' || b.e === 'desactivada');
    if (!bombaMesh.visible) return;
    bombaMesh.position.set(b.x, b.y, b.z);
    const per = b.e === 'plantada' ? Math.max(.12, b.resta / 40) : 1;
    bombaMesh.userData.luz.material.color.set(b.e === 'desactivada' ? 0x2aff4a : ((t % per) < per * .3 ? 0xff2a1a : 0x330000));
  };
  R.limpiarRonda = function () { for (const m of agujeros) m.visible = false; for (const h of humos) escena.remove(h.g); humos.length = 0; };

  function actualizarEfectos(dt) {
    for (let i = 0; i < PART; i++) {
      if (partVida[i] <= 0) continue; const v = partVel[i];
      partVida[i] -= dt; if (partVida[i] <= 0) { partPos[i * 3 + 1] = -999; continue; }
      v[1] -= 6 * dt; partPos[i * 3] += v[0] * dt; partPos[i * 3 + 1] += v[1] * dt; partPos[i * 3 + 2] += v[2] * dt;
      if (partPos[i * 3 + 1] < 0.01) { partPos[i * 3 + 1] = 0.01; v[0] *= .5; v[2] *= .5; v[1] = 0; }
    }
    part.geometry.attributes.position.needsUpdate = true; part.geometry.attributes.color.needsUpdate = true;
    for (let i = trazos.length - 1; i >= 0; i--) { const t = trazos[i]; t.vida -= dt; t.l.material.opacity = Math.max(0, t.vida / .07) * .75; if (t.vida <= 0) { escena.remove(t.l); t.l.geometry.dispose(); t.l.material.dispose(); trazos.splice(i, 1); } }
    for (let i = destellos.length - 1; i >= 0; i--) {
      const d = destellos[i]; d.vida -= dt; const k = Math.max(0, d.vida / d.max);
      if (d.luz) d.m.intensity *= Math.pow(.02, dt); else { d.m.scale.setScalar(d.r * (1 - k * k) + .3); d.m.material.opacity = k * .9; }
      if (d.vida <= 0) { escena.remove(d.m); if (d.m.geometry) d.m.geometry.dispose(); if (d.m.material) d.m.material.dispose(); destellos.splice(i, 1); }
    }
    for (let i = humos.length - 1; i >= 0; i--) {
      const h = humos[i]; h.t += dt; const ent = Math.min(1, h.t / 1.2), sal = h.t > h.dur - 2 ? Math.max(0, (h.dur - h.t) / 2) : 1;
      for (const sp of h.g.children) { sp.scale.setScalar(sp.userData.s * (.4 + .6 * ent)); sp.material.opacity = .92 * Math.min(ent, sal); sp.material.rotation += dt * .05; }
      if (h.t > h.dur) { escena.remove(h.g); humos.splice(i, 1); }
    }
    luzFogonazo.intensity *= Math.pow(.0005, dt);
  }

  /* ───── cuadro ───── */
  R.camara = function (x, y, z, yaw, pitch, fov, sacudida) {
    cam.position.set(x, y, z); cam.rotation.y = -yaw; cam.rotation.x = pitch + (sacudida || 0); cam.rotation.z = 0;
    if (Math.abs(cam.fov - fov) > .01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    R._cielo.position.set(x, 0, z);
  };
  R.dibujar = function (dt, conVista) {
    reloj += dt; actualizarEfectos(dt);
    ren.clear(); ren.render(escena, cam);
    if (conVista && vista && vista.visible) { ren.clearDepth(); ren.render(escenaV, camV); }
  };
  R.info = () => ren.info;
})();
