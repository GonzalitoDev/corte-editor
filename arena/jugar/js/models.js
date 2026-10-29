/* GonzaArena — modelos 3D (todos hechos con figuras simples, estilo low-poly), piso del mapa, íconos y retratos */
(function () {
  'use strict';
  const M = Arena.MAP;
  const TEAM = [0x3d8bff, 0xff4848], TEAM_DARK = [0x1d3f8a, 0x8a1d1d];
  const mats = {};
  const mat = (color, o = {}) => { const k = color + JSON.stringify(o); return mats[k] || (mats[k] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: .75, metalness: .05, flatShading: true }, o))); };
  const vmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .75, metalness: .05, flatShading: true });
  const glow = (color, i = 1.4) => mat(color, { emissive: color, emissiveIntensity: i });

  /** junta varias piezas en una sola geometría con colores por vértice (1 llamada de dibujo) */
  function merge(parts) {
    const pos = [], nor = [], col = [], c = new THREE.Color(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (const p of parts) {
      let g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
      e.set(...(p.rot || [0, 0, 0])); q.setFromEuler(e); m.compose(new THREE.Vector3(...(p.at || [0, 0, 0])), q, new THREE.Vector3(...(p.s || [1, 1, 1])));
      g.applyMatrix4(m); g.computeVertexNormals();
      c.set(p.c); const P = g.attributes.position.array, Nn = g.attributes.normal.array;
      for (let i = 0; i < P.length; i++) { pos.push(P[i]); nor.push(Nn[i]); }
      for (let i = 0; i < P.length / 3; i++) col.push(c.r, c.g, c.b);
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return out;
  }
  const G = {
    box: (w, h, d) => new THREE.BoxGeometry(w, h, d), cyl: (a, b, h, n = 8) => new THREE.CylinderGeometry(a, b, h, n), cone: (r, h, n = 8) => new THREE.ConeGeometry(r, h, n),
    sph: (r, n = 8) => new THREE.SphereGeometry(r, n, Math.max(4, n - 2)), ico: (r, d = 0) => new THREE.IcosahedronGeometry(r, d), dod: (r) => new THREE.DodecahedronGeometry(r, 0), oct: (r) => new THREE.OctahedronGeometry(r, 0), tor: (r, t, n = 6, m = 12, arc) => new THREE.TorusGeometry(r, t, n, m, arc),
  };
  const ring = (team, r) => { const m = new THREE.Mesh(new THREE.RingGeometry(r * .95, r * 1.12, 28), new THREE.MeshBasicMaterial({ color: TEAM[team] ?? 0xffcc66, transparent: true, opacity: .75, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = .06; return m; };

  /* ───────── campeones ───────── */
  function champ(key, team) {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const p = { body, team };
    const add = (geo, m, at, rot, parent = body) => { const o = new THREE.Mesh(geo, m); o.position.set(...at); if (rot) o.rotation.set(...rot); parent.add(o); return o; };
    if (key === 'brasa') {
      add(G.cone(.85, 2, 9), mat(0xc2361c), [0, 1, 0]);
      add(G.cone(.9, .5, 9), mat(0x5a1a12), [0, .25, 0]);
      add(G.sph(.42, 9), mat(0xf0c09a), [0, 2.15, 0]);
      add(G.cone(.5, .9, 8), mat(0x8a2416), [0, 2.55, .05], [-.25, 0, 0]);
      add(G.box(.9, .12, .6), mat(0xe8b040), [0, 1.35, 0]);
      p.armR = new THREE.Group(); p.armR.position.set(.55, 1.6, 0); body.add(p.armR); add(G.cyl(.12, .1, .9, 6), mat(0xc2361c), [0, -.4, 0], null, p.armR);
      p.flame = add(G.ico(.32, 0), glow(0xff8a2a, 2.4), [0, -.95, -.15], null, p.armR);
      p.weapon = p.armR;
    } else if (key === 'pedron') {
      add(G.dod(1.05), mat(0x8b8170), [0, 1.35, 0]);
      add(G.dod(.55), mat(0x7a705f), [0, 2.45, .05]);
      add(G.box(.12, .08, .05), glow(0x66e0ff, 3), [-.18, 2.5, -.48]); add(G.box(.12, .08, .05), glow(0x66e0ff, 3), [.18, 2.5, -.48]);
      p.armL = new THREE.Group(); p.armL.position.set(-1.05, 1.75, 0); body.add(p.armL); add(G.dod(.55), mat(0x6f6656), [0, -.55, 0], null, p.armL);
      p.armR = new THREE.Group(); p.armR.position.set(1.05, 1.75, 0); body.add(p.armR); add(G.dod(.6), mat(0x6f6656), [0, -.6, 0], null, p.armR);
      add(G.cyl(.35, .45, .7, 7), mat(0x5d5446), [-.45, .35, 0]); add(G.cyl(.35, .45, .7, 7), mat(0x5d5446), [.45, .35, 0]);
      add(G.cone(.25, .5, 5), mat(0x9fd8e0, { emissive: 0x2a6070 }), [.4, 2.1, .5], [.5, 0, .3]);
      p.weapon = p.armR;
    } else if (key === 'sombra') {
      add(G.cyl(.32, .42, 1.4, 8), mat(0x2a1f45), [0, 1.15, 0]);
      add(G.cyl(.16, .2, .9, 6), mat(0x1a1430), [-.2, .4, 0]); add(G.cyl(.16, .2, .9, 6), mat(0x1a1430), [.2, .4, 0]);
      add(G.sph(.36, 9), mat(0x3a2c60), [0, 2.1, 0]);
      add(G.box(.5, .1, .1), glow(0xb38bff, 3), [0, 2.12, -.3]);
      add(G.cone(.5, .7, 3), mat(0x7a3cff), [0, 1.75, .25], [.6, 0, 0]); // bufanda
      p.armR = new THREE.Group(); p.armR.position.set(.42, 1.65, 0); body.add(p.armR); add(G.box(.08, .9, .06), mat(0xd0d4e0, { metalness: .6, roughness: .3 }), [0, -.4, -.35], [-.9, 0, 0], p.armR);
      p.armL = new THREE.Group(); p.armL.position.set(-.42, 1.65, 0); body.add(p.armL); add(G.box(.08, .9, .06), mat(0xd0d4e0, { metalness: .6, roughness: .3 }), [0, -.4, -.35], [-.9, 0, 0], p.armL);
      p.weapon = p.armR;
    } else if (key === 'flecha') {
      add(G.cyl(.34, .44, 1.3, 8), mat(0x2f7a3a), [0, 1.1, 0]);
      add(G.cyl(.15, .18, .8, 6), mat(0x5a3d22), [-.2, .38, 0]); add(G.cyl(.15, .18, .8, 6), mat(0x5a3d22), [.2, .38, 0]);
      add(G.sph(.36, 9), mat(0xe9c3a0), [0, 2.05, 0]);
      add(G.cone(.55, .55, 8), mat(0x24602e), [0, 2.42, 0], [.15, 0, 0]);
      add(G.box(.3, .9, .3), mat(0x7a4a22), [0, 1.3, .38], [.2, 0, 0]); // carcaj
      p.armL = new THREE.Group(); p.armL.position.set(-.45, 1.6, 0); body.add(p.armL);
      const bow = add(G.tor(.75, .05, 4, 14, Math.PI), mat(0x8a5a2a), [0, -.2, -.45], [0, Math.PI / 2, Math.PI / 2], p.armL); bow.scale.set(1, 1, 1);
      add(G.cyl(.01, .01, 1.5, 3), mat(0xffffff), [0, -.2, -.45], null, p.armL);
      p.weapon = p.armL;
    } else if (key === 'ceibo') {
      add(G.cone(.75, 1.8, 8), mat(0x3a8a4a), [0, .9, 0]);
      add(G.sph(.4, 9), mat(0xd9a07a), [0, 2.05, 0]);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(G.sph(.22, 6), mat(0xff4f8b), [Math.cos(a) * .42, 2.38, Math.sin(a) * .42]); }
      add(G.sph(.16, 6), glow(0xffd84a, 1.5), [0, 2.45, 0]);
      p.armR = new THREE.Group(); p.armR.position.set(.5, 1.55, 0); body.add(p.armR);
      add(G.cyl(.05, .06, 2.2, 5), mat(0x6a4a2a), [0, -.3, -.2], null, p.armR);
      p.flame = add(G.ico(.22, 0), glow(0xff7aa8, 2), [0, .85, -.2], null, p.armR);
      p.weapon = p.armR;
    }
    root.add(ring(team, 1.05)); p.ring = root.children[1];
    root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return { root, p, key };
  }
  /** animación: caminar (balanceo), atacar (golpe) y lanzar */
  function animate(m, st, t) {
    const p = m.p, b = p.body;
    b.position.y = st.moving ? Math.abs(Math.sin(t * 9)) * .12 : Math.sin(t * 2) * .03;
    b.rotation.x = st.moving ? .08 : 0;
    const a = st.atk > 0 ? Math.sin((1 - st.atk) * Math.PI) : 0, c = st.cast > 0 ? Math.sin((1 - st.cast) * Math.PI) : 0;
    if (p.armR) p.armR.rotation.x = -a * 1.6 - c * 1.2 + (st.moving ? Math.sin(t * 9) * .4 : 0);
    if (p.armL) p.armL.rotation.x = (m.key === 'flecha' ? -1.2 - a * .3 : -a * 1.2) + (st.moving && m.key !== 'flecha' ? -Math.sin(t * 9) * .4 : 0);
    if (p.flame) p.flame.scale.setScalar(1 + Math.sin(t * 14) * .15 + c * .8);
    if (st.stun) b.rotation.z = Math.sin(t * 6) * .12; else b.rotation.z = 0;
  }

  /* ───────── minions ───────── */
  const minionGeo = {};
  function minion(sub, team) {
    const key = sub + team;
    if (!minionGeo[key]) {
      const T = TEAM[team], D = TEAM_DARK[team], metal = 0xb8bcc8;
      let parts;
      if (sub === 0 || sub === 3) parts = [{ g: G.box(.8, .8, .55), c: T, at: [0, .85, 0] }, { g: G.sph(.3, 7), c: metal, at: [0, 1.45, 0] }, { g: G.box(.08, .7, .08), c: metal, at: [.5, .9, -.25], rot: [-.6, 0, 0] }, { g: G.box(.5, .55, .1), c: D, at: [-.48, .85, -.05] }, { g: G.cyl(.14, .14, .5, 5), c: D, at: [-.2, .25, 0] }, { g: G.cyl(.14, .14, .5, 5), c: D, at: [.2, .25, 0] }];
      else if (sub === 1) parts = [{ g: G.cone(.5, 1.2, 7), c: T, at: [0, .6, 0] }, { g: G.sph(.28, 7), c: 0xe8d0b0, at: [0, 1.35, 0] }, { g: G.cone(.32, .5, 6), c: D, at: [0, 1.7, 0] }, { g: G.cyl(.04, .04, 1.3, 4), c: 0x6a4a2a, at: [.4, .8, 0] }, { g: G.ico(.15, 0), c: 0xfff0a0, at: [.4, 1.5, 0] }];
      else parts = [{ g: G.box(1.4, .7, 1.8), c: D, at: [0, .7, 0] }, { g: G.box(1.1, .5, 1.2), c: T, at: [0, 1.25, .1] }, { g: G.cyl(.22, .26, 1.4, 7), c: 0x555a66, at: [0, 1.45, -.6], rot: [Math.PI / 2 - .25, 0, 0] }, ...[[-.8, -.6], [.8, -.6], [-.8, .6], [.8, .6]].map(([x, z]) => ({ g: G.cyl(.32, .32, .16, 8), c: 0x3a2a1a, at: [x, .32, z], rot: [0, 0, Math.PI / 2] }))];
      minionGeo[key] = merge(parts);
    }
    const root = new THREE.Group(), mesh = new THREE.Mesh(minionGeo[key], vmat); root.add(mesh);
    if (sub === 3) mesh.scale.setScalar(1.55);
    return { root, p: { body: mesh }, key: 'minion' };
  }

  /* ───────── monstruos ───────── */
  const monGeo = {};
  function monster(sub, big) {
    const key = sub + (big ? 'B' : 's');
    if (!monGeo[key]) {
      let parts;
      if (sub === 'golem') parts = [{ g: G.dod(1.3), c: 0x4a5a7a, at: [0, 1.5, 0] }, { g: G.oct(.6), c: 0x5fd0ff, at: [0, 3, 0] }, { g: G.dod(.6), c: 0x3a4a6a, at: [-1.3, 1.3, 0] }, { g: G.dod(.6), c: 0x3a4a6a, at: [1.3, 1.3, 0] }, { g: G.oct(.35), c: 0x8fe8ff, at: [.6, 2.4, -.6] }];
      else if (sub === 'brasero') parts = [{ g: G.cyl(.9, .6, 1.2, 8), c: 0x5a3a2a, at: [0, .6, 0] }, { g: G.cone(.9, 1.8, 7), c: 0xff6a2a, at: [0, 2, 0] }, { g: G.cone(.5, 1.2, 6), c: 0xffd04a, at: [0, 2.2, 0] }, { g: G.box(2.6, .1, .7), c: 0xff8a3a, at: [0, 2, .2], rot: [0, 0, .2] }];
      else if (sub === 'lobos') parts = big ? [{ g: G.box(.9, .8, 1.8), c: 0x6a6a72, at: [0, .9, 0] }, { g: G.box(.6, .6, .7), c: 0x7a7a82, at: [0, 1.2, -1.1] }, { g: G.cone(.15, .35, 4), c: 0x6a6a72, at: [-.2, 1.6, -1.1] }, { g: G.cone(.15, .35, 4), c: 0x6a6a72, at: [.2, 1.6, -1.1] }, { g: G.box(.2, .2, .1), c: 0xffd04a, at: [0, 1.25, -1.48] }, ...[[-.3, -.6], [.3, -.6], [-.3, .6], [.3, .6]].map(([x, z]) => ({ g: G.box(.2, .6, .2), c: 0x55555c, at: [x, .3, z] }))] : [{ g: G.box(.5, .45, 1), c: 0x7a7a82, at: [0, .5, 0] }, { g: G.box(.35, .35, .4), c: 0x8a8a92, at: [0, .7, -.6] }, ...[[-.18, -.35], [.18, -.35], [-.18, .35], [.18, .35]].map(([x, z]) => ({ g: G.box(.12, .35, .12), c: 0x55555c, at: [x, .17, z] }))];
      else if (sub === 'cuervos') parts = [{ g: G.oct(big ? .7 : .45), c: 0x26262e, at: [0, big ? 1.8 : 1.4, 0], s: [1, .8, 1.4] }, { g: G.box(big ? 2.2 : 1.4, .06, .5), c: 0x1a1a22, at: [0, big ? 1.9 : 1.45, .1] }, { g: G.cone(.12, .4, 4), c: 0xffb02a, at: [0, big ? 1.8 : 1.4, big ? -1 : -.7], rot: [-Math.PI / 2, 0, 0] }];
      else if (sub === 'rocosos') parts = big ? [{ g: G.dod(1.2), c: 0x7a6a5a, at: [0, 1.2, 0] }, { g: G.dod(.5), c: 0x8a7a6a, at: [0, 2.3, -.2] }, { g: G.box(.25, .1, .05), c: 0xff8a3a, at: [0, 2.35, -.65] }] : [{ g: G.dod(.65), c: 0x8a7a6a, at: [0, .65, 0] }];
      else if (sub === 'dragon') parts = [{ g: G.box(2, 1.6, 4), c: 0x2f8a6a, at: [0, 2, 0] }, { g: G.box(1.2, 1, 1.6), c: 0x3aa07a, at: [0, 3, -2.6] }, { g: G.cone(.25, .8, 4), c: 0xe8e0c0, at: [-.4, 3.8, -2.4], rot: [.4, 0, 0] }, { g: G.cone(.25, .8, 4), c: 0xe8e0c0, at: [.4, 3.8, -2.4], rot: [.4, 0, 0] }, { g: G.box(5.5, .1, 2.2), c: 0x226a52, at: [0, 2.8, .3], rot: [0, 0, 0] }, { g: G.cone(.6, 3, 5), c: 0x2f8a6a, at: [0, 1.7, 3.2], rot: [Math.PI / 2, 0, 0] }, { g: G.box(.3, .2, .1), c: 0xffd04a, at: [-.35, 3.2, -3.42] }, { g: G.box(.3, .2, .1), c: 0xffd04a, at: [.35, 3.2, -3.42] }, ...[[-.8, -1.2], [.8, -1.2], [-.8, 1.2], [.8, 1.2]].map(([x, z]) => ({ g: G.box(.4, 1.3, .4), c: 0x226a52, at: [x, .65, z] }))];
      else parts = [{ g: G.box(3, 3.4, 2.2), c: 0x5a3a8a, at: [0, 3.6, 0] }, { g: G.dod(1.1), c: 0x6a4a9a, at: [0, 6, -.2] }, { g: G.box(1, .25, .1), c: 0xff5aff, at: [0, 6.1, -1.1] }, { g: G.box(1.1, 3, 1.1), c: 0x4a2a7a, at: [-2.1, 3.6, 0], rot: [0, 0, .15] }, { g: G.box(1.1, 3, 1.1), c: 0x4a2a7a, at: [2.1, 3.6, 0], rot: [0, 0, -.15] }, { g: G.box(1.1, 2, 1.1), c: 0x3a1a6a, at: [-.8, 1, 0] }, { g: G.box(1.1, 2, 1.1), c: 0x3a1a6a, at: [.8, 1, 0] }, { g: G.oct(.7), c: 0xff7aff, at: [0, 4, -1.2] }];
      monGeo[key] = merge(parts);
    }
    const root = new THREE.Group(), mesh = new THREE.Mesh(monGeo[key], vmat); root.add(mesh);
    return { root, p: { body: mesh }, key: 'monster' };
  }

  /* ───────── estructuras ───────── */
  function tower(team) {
    const root = new THREE.Group(), stone = mat(0x8c8a90), dark = mat(0x5a5862);
    const whole = new THREE.Group(); root.add(whole);
    const add = (g, m, at, par = whole) => { const o = new THREE.Mesh(g, m); o.position.set(...at); par.add(o); o.castShadow = true; return o; };
    add(G.cyl(1.7, 1.9, .8, 8), dark, [0, .4, 0]); add(G.cyl(1.05, 1.35, 4.2, 8), stone, [0, 2.9, 0]); add(G.cyl(1.5, 1.2, .7, 8), dark, [0, 5.2, 0]);
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + .4; add(G.box(.4, .6, .4), stone, [Math.cos(a) * 1.3, 5.8, Math.sin(a) * 1.3]); }
    const crystal = add(G.oct(.75), glow(TEAM[team], 1.8), [0, 6.6, 0]); crystal.scale.y = 1.5;
    const band = add(G.cyl(1.1, 1.1, .25, 8), glow(TEAM[team], .8), [0, 3.6, 0]);
    const rubble = new THREE.Group(); rubble.visible = false; root.add(rubble);
    add(G.cyl(1.2, 1.9, 1.3, 7), dark, [0, .65, 0], rubble); for (let i = 0; i < 6; i++) { const a = i; add(G.dod(.5 + (i % 3) * .2), stone, [Math.cos(a) * 2, .3, Math.sin(a) * 2], rubble); }
    return { root, p: { whole, crystal, rubble, band }, key: 'tower' };
  }
  function inhib(team) {
    const root = new THREE.Group(), whole = new THREE.Group(); root.add(whole);
    const base = new THREE.Mesh(G.cyl(2, 2.3, .5, 10), mat(0x5a5862)); base.position.y = .25; whole.add(base);
    const r1 = new THREE.Mesh(G.tor(1.4, .18, 6, 20), glow(TEAM[team], 1)); r1.position.y = 1.8; r1.rotation.x = Math.PI / 2; whole.add(r1);
    const cr = new THREE.Mesh(G.oct(.8), glow(TEAM[team], 2)); cr.position.y = 2.4; cr.scale.y = 1.4; whole.add(cr);
    const rubble = new THREE.Mesh(G.cyl(1.6, 2.2, .7, 7), mat(0x45434c)); rubble.position.y = .35; rubble.visible = false; root.add(rubble);
    return { root, p: { whole, crystal: cr, ring: r1, rubble }, key: 'inhib' };
  }
  function nexus(team) {
    const root = new THREE.Group(), whole = new THREE.Group(); root.add(whole);
    const add = (g, m, at) => { const o = new THREE.Mesh(g, m); o.position.set(...at); whole.add(o); return o; };
    add(G.cyl(3.6, 4.2, 1, 10), mat(0x5a5862), [0, .5, 0]); add(G.cyl(2.6, 3.2, 1.2, 10), mat(0x7a7882), [0, 1.6, 0]);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(G.box(.5, 2.2, .5), mat(0x8c8a90), [Math.cos(a) * 3, 2.2, Math.sin(a) * 3]); }
    const cr = add(G.oct(1.8), glow(TEAM[team], 1.8), [0, 5, 0]); cr.scale.y = 1.6;
    const rubble = new THREE.Mesh(G.dod(2.5), mat(0x2a2830)); rubble.position.y = 1; rubble.visible = false; root.add(rubble);
    return { root, p: { whole, crystal: cr, rubble }, key: 'nexus' };
  }

  /* ───────── mapa ───────── */
  function buildMap(scene) {
    const S = 2048, k = S / M.W, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
    // jungla
    g.fillStyle = '#2d5a2a'; g.fillRect(0, 0, S, S);
    const rnd = M.rng(99);
    for (let i = 0; i < 26000; i++) { const x = rnd() * S, y = rnd() * S, r = 2 + rnd() * 9; g.fillStyle = `rgba(${rnd() < .5 ? '70,120,50' : '25,60,25'},${.12 + rnd() * .18})`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    // río
    g.lineCap = 'round'; g.lineJoin = 'round';
    const stroke = (pts, w, col) => { g.strokeStyle = col; g.lineWidth = w * k; g.beginPath(); pts.forEach(([x, z], i) => i ? g.lineTo(x * k, z * k) : g.moveTo(x * k, z * k)); g.stroke(); };
    stroke([[0, 0], [200, 200]], M.RIVER_W + 4, '#3b6a3a'); stroke([[0, 0], [200, 200]], M.RIVER_W + 1, '#7a6a48'); stroke([[0, 0], [200, 200]], M.RIVER_W, '#2f6f9e');
    for (const [x, z] of [M.DRAGON, M.COLOSO]) { g.fillStyle = '#7a6a48'; g.beginPath(); g.arc(x * k, z * k, 10.5 * k, 0, 7); g.fill(); g.fillStyle = '#2b638e'; g.beginPath(); g.arc(x * k, z * k, 9.5 * k, 0, 7); g.fill(); }
    for (let i = 0; i < 900; i++) { const t = rnd() * 200, off = (rnd() - .5) * M.RIVER_W * .8; g.fillStyle = `rgba(160,210,240,${.08 + rnd() * .12})`; g.fillRect((t + off / 1.41) * k, (t - off / 1.41) * k, 6 + rnd() * 14, 2); }
    // carriles
    for (const l in M.LANES) { stroke(M.LANES[l], 9.5, '#5d5236'); stroke(M.LANES[l], 8, '#8f7c55'); stroke(M.LANES[l], 5, '#a08b62'); }
    for (let i = 0; i < 7000; i++) { const x = rnd() * 200, z = rnd() * 200; if (M.distToLanes(x, z) > 3.8) continue; g.fillStyle = `rgba(${rnd() < .5 ? '60,50,30' : '200,180,140'},.25)`; g.fillRect(x * k, z * k, 3 + rnd() * 4, 2 + rnd() * 3); }
    // claros de los campamentos
    for (const c of M.CAMPS) { g.fillStyle = 'rgba(110,95,60,.55)'; g.beginPath(); g.arc(c.at[0] * k, c.at[1] * k, 6 * k, 0, 7); g.fill(); }
    // bases
    for (let t = 0; t < 2; t++) {
      const [x, z] = M.NEXUS[t], [fx, fz] = M.FOUNTAIN[t];
      g.fillStyle = '#5d5a62'; g.beginPath(); g.arc(x * k, z * k, 20 * k, 0, 7); g.fill(); g.beginPath(); g.arc(fx * k, fz * k, 13 * k, 0, 7); g.fill();
      stroke([[fx, fz], [x, z]], 14, '#5d5a62');
      g.strokeStyle = t ? 'rgba(255,72,72,.5)' : 'rgba(61,139,255,.5)'; g.lineWidth = 6; g.beginPath(); g.arc(x * k, z * k, 19 * k, 0, 7); g.stroke();
      for (let i = 0; i < 260; i++) { const a = rnd() * 7, r = rnd() * 19; g.fillStyle = `rgba(${rnd() < .5 ? '40,38,46' : '120,118,128'},.18)`; g.fillRect((x + Math.cos(a) * r) * k, (z + Math.sin(a) * r) * k, 8 + rnd() * 10, 8 + rnd() * 10); }
      g.fillStyle = t ? 'rgba(255,72,72,.65)' : 'rgba(61,139,255,.65)'; g.beginPath(); g.arc(fx * k, fz * k, 6 * k, 0, 7); g.fill();
    }
    // sombras de las rocas
    for (const q of M.ROCKS) { g.fillStyle = 'rgba(10,25,10,.45)'; g.beginPath(); g.arc(q.x * k, q.z * k, (q.r + 1.6) * k, 0, 7); g.fill(); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(M.W, M.W), new THREE.MeshStandardMaterial({ map: tex, roughness: .95 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(M.W / 2, 0, M.W / 2); ground.receiveShadow = true; scene.add(ground);
    // agua con brillo
    const water = new THREE.Mesh(new THREE.PlaneGeometry(M.W * Math.SQRT2, M.RIVER_W - .5), new THREE.MeshStandardMaterial({ color: 0x4aa0e0, transparent: true, opacity: .32, roughness: .1, metalness: .3 }));
    water.rotation.x = -Math.PI / 2; water.rotation.z = -Math.PI / 4; water.position.set(100, .05, 100); scene.add(water);
    // rocas y árboles (instanciados para que sea liviano)
    const rocks = M.ROCKS, trees = [];
    for (const q of rocks) { const n = Math.round(q.r * 1.6); for (let i = 0; i < n; i++) { const a = rnd() * 7, r = rnd() * q.r * .9; trees.push([q.x + Math.cos(a) * r, q.z + Math.sin(a) * r, .8 + rnd() * .7]); } }
    for (let i = 0; i < 260; i++) { const side = i % 4, t = rnd() * 200, d = rnd() * 4; const x = side === 0 ? d : side === 1 ? 200 - d : t, z = side === 2 ? d : side === 3 ? 200 - d : t; trees.push([x, z, 1 + rnd() * .8]); }
    const rockMesh = new THREE.InstancedMesh(G.dod(1), mat(0x6e6a64), rocks.length), m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler();
    rocks.forEach((q, i) => { e4.set(rnd(), rnd() * 6, rnd()); q4.setFromEuler(e4); m4.compose(new THREE.Vector3(q.x, q.r * .25, q.z), q4, new THREE.Vector3(q.r * .65, q.r * .45, q.r * .65)); rockMesh.setMatrixAt(i, m4); });
    rockMesh.castShadow = true; scene.add(rockMesh);
    const treeGeo = merge([{ g: G.cyl(.25, .32, 1.2, 5), c: 0x5a3d22, at: [0, .6, 0] }, { g: G.cone(1.5, 2.6, 7), c: 0x1f4d24, at: [0, 2.2, 0] }, { g: G.cone(1.1, 2, 7), c: 0x2a6a2e, at: [0, 3.4, 0] }]);
    const treeMesh = new THREE.InstancedMesh(treeGeo, vmat, trees.length);
    trees.forEach(([x, z, s], i) => { e4.set(0, rnd() * 6, 0); q4.setFromEuler(e4); m4.compose(new THREE.Vector3(x, 0, z), q4, new THREE.Vector3(s, s * (.9 + rnd() * .4), s)); treeMesh.setMatrixAt(i, m4); });
    treeMesh.castShadow = true; scene.add(treeMesh);
    // fuentes
    for (let t = 0; t < 2; t++) { const [fx, fz] = M.FOUNTAIN[t]; const plat = new THREE.Mesh(G.cyl(5, 5.6, .5, 14), mat(0x6a6772)); plat.position.set(fx, .25, fz); scene.add(plat); const pool = new THREE.Mesh(G.cyl(3.6, 3.6, .2, 14), glow(TEAM[t], .9)); pool.position.set(fx, .6, fz); scene.add(pool); }
    return { ground, tex: cv };
  }

  /* ───────── íconos de habilidades (dibujados) ───────── */
  function icon(cv, ck, s) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, def = Arena.CHAMPS[ck], col = def.color;
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, col); gr.addColorStop(1, '#141628'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.save(); g.translate(W / 2, H / 2); g.scale(W / 64, H / 64); g.lineCap = 'round'; g.lineJoin = 'round';
    const white = '#fff8e8', P = (f) => { g.beginPath(); f(); };
    const star = (n, r1, r2, c) => { P(() => { for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * Math.PI * 2, r = i % 2 ? r2 : r1; i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); }); g.fillStyle = c; g.fill(); };
    const arrow = (x1, y1, x2, y2, w, c) => { g.strokeStyle = c; g.lineWidth = w; P(() => { g.moveTo(x1, y1); g.lineTo(x2, y2); }); g.stroke(); const a = Math.atan2(y2 - y1, x2 - x1); P(() => { g.moveTo(x2 + Math.cos(a) * 6, y2 + Math.sin(a) * 6); g.lineTo(x2 + Math.cos(a + 2.5) * 9, y2 + Math.sin(a + 2.5) * 9); g.lineTo(x2 + Math.cos(a - 2.5) * 9, y2 + Math.sin(a - 2.5) * 9); g.closePath(); }); g.fillStyle = c; g.fill(); };
    const id = ck + s;
    if (id === 'brasa0') { star(9, 16, 9, '#ffd04a'); P(() => g.arc(0, 0, 8, 0, 7)); g.fillStyle = '#fff4c0'; g.fill(); }
    else if (id === 'brasa1') { for (const x of [-10, 0, 10]) { P(() => { g.moveTo(x - 6, 20); g.quadraticCurveTo(x - 7, -4, x, -20); g.quadraticCurveTo(x + 7, -4, x + 6, 20); }); g.fillStyle = x ? '#ff8a3a' : '#ffd04a'; g.fill(); } }
    else if (id === 'brasa2') { for (const [x, y, r] of [[-10, 6, 10], [4, -2, 12], [14, 10, 8]]) { P(() => g.arc(x, y, r, 0, 7)); g.fillStyle = 'rgba(220,220,230,.75)'; g.fill(); } arrow(-18, 18, 18, -14, 3, white); }
    else if (id === 'brasa3') { for (const [x, y] of [[-12, -8], [6, -14], [-2, 8], [14, 6]]) { arrow(x - 10, y - 12, x, y, 3, '#ffb04a'); P(() => g.arc(x, y, 5, 0, 7)); g.fillStyle = '#ffd04a'; g.fill(); } }
    else if (id === 'pedron0') { arrow(-20, 10, 16, -6, 7, white); for (const [x, y] of [[-16, 18], [-6, 20], [-22, 2]]) { P(() => g.arc(x, y, 4, 0, 7)); g.fillStyle = '#b8ab92'; g.fill(); } }
    else if (id === 'pedron1') { P(() => { g.moveTo(0, -22); g.lineTo(18, -12); g.lineTo(15, 10); g.lineTo(0, 22); g.lineTo(-15, 10); g.lineTo(-18, -12); g.closePath(); }); g.fillStyle = '#c8bca4'; g.fill(); g.strokeStyle = '#6a5f4c'; g.lineWidth = 3; g.stroke(); }
    else if (id === 'pedron2') { for (const r of [8, 15, 22]) { g.strokeStyle = `rgba(255,248,232,${1 - r / 30})`; g.lineWidth = 3; P(() => g.ellipse(0, 6, r, r * .45, 0, 0, 7)); g.stroke(); } P(() => g.arc(0, -8, 7, 0, 7)); g.fillStyle = '#b8ab92'; g.fill(); }
    else if (id === 'pedron3') { g.strokeStyle = '#ffd04a'; g.lineWidth = 4; P(() => { g.moveTo(-22, 0); g.lineTo(-10, -6); g.lineTo(-4, 6); g.lineTo(6, -8); g.lineTo(12, 4); g.lineTo(22, -2); }); g.stroke(); g.strokeStyle = '#ff8a3a'; g.lineWidth = 2; P(() => { g.moveTo(-6, 14); g.lineTo(0, 4); g.lineTo(8, 16); }); g.stroke(); }
    else if (id === 'sombra0') { star(4, 20, 5, '#e8e8f8'); P(() => g.arc(0, 0, 4, 0, 7)); g.fillStyle = '#2a1f45'; g.fill(); }
    else if (id === 'sombra1') { P(() => g.ellipse(0, 0, 20, 12, 0, 0, 7)); g.fillStyle = 'rgba(255,255,255,.2)'; g.fill(); P(() => g.arc(0, 0, 7, 0, 7)); g.fillStyle = '#b38bff'; g.fill(); }
    else if (id === 'sombra2') { arrow(-20, 16, 4, -10, 4, '#b38bff'); g.strokeStyle = white; g.lineWidth = 4; P(() => { g.moveTo(8, -18); g.lineTo(20, 10); }); g.stroke(); }
    else if (id === 'sombra3') { g.strokeStyle = '#ff5a8a'; g.lineWidth = 4; P(() => g.arc(0, 0, 17, 0, 7)); g.stroke(); P(() => { g.moveTo(-12, -12); g.lineTo(12, 12); g.moveTo(12, -12); g.lineTo(-12, 12); }); g.stroke(); }
    else if (id === 'flecha0') { for (const y of [-12, 0, 12]) arrow(-20, y, 16, y, 3, white); }
    else if (id === 'flecha1') { for (const a of [-.5, -.25, 0, .25, .5]) arrow(-16, 16, -16 + Math.cos(a - .8) * 36, 16 + Math.sin(a - .8) * 36, 2.5, white); }
    else if (id === 'flecha2') { g.strokeStyle = white; g.lineWidth = 4; P(() => g.arc(-4, 4, 12, .4, 5.3)); g.stroke(); arrow(4, 10, 20, -8, 3, '#ffd04a'); }
    else if (id === 'flecha3') { arrow(-22, 18, 16, -14, 7, '#ffd04a'); }
    else if (id === 'ceibo0') { P(() => g.ellipse(0, 0, 9, 13, .5, 0, 7)); g.fillStyle = '#8a5a2a'; g.fill(); g.strokeStyle = '#5fe07a'; g.lineWidth = 3; for (const a of [0, 2, 4]) { P(() => { g.moveTo(0, 8); g.quadraticCurveTo(Math.cos(a) * 20, 14, Math.cos(a) * 22, 22); }); g.stroke(); } }
    else if (id === 'ceibo1') { P(() => { g.moveTo(0, 18); g.bezierCurveTo(-26, -4, -10, -24, 0, -10); g.bezierCurveTo(10, -24, 26, -4, 0, 18); }); g.fillStyle = '#5fe07a'; g.fill(); g.fillStyle = white; g.fillRect(-2, -6, 4, 14); g.fillRect(-7, -1, 14, 4); }
    else if (id === 'ceibo2') { for (let i = 0; i < 12; i++) { const a = i * 2.4, r = 4 + i * 1.5; P(() => g.arc(Math.cos(a) * r, Math.sin(a) * r, 3, 0, 7)); g.fillStyle = i % 2 ? '#ffd04a' : '#ff9ac0'; g.fill(); } }
    else if (id === 'ceibo3') { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; P(() => g.ellipse(Math.cos(a) * 11, Math.sin(a) * 11, 8, 5, a, 0, 7)); g.fillStyle = '#ff4f8b'; g.fill(); } P(() => g.arc(0, 0, 6, 0, 7)); g.fillStyle = '#ffd04a'; g.fill(); }
    g.restore();
  }
  function spellIcon(cv, s) {
    const g = cv.getContext('2d'), W = cv.width; const gr = g.createRadialGradient(W / 2, W / 2, 2, W / 2, W / 2, W * .7); gr.addColorStop(0, s ? '#7aff9a' : '#fff4a0'); gr.addColorStop(1, s ? '#1d5a2a' : '#7a5a10'); g.fillStyle = gr; g.fillRect(0, 0, W, W);
    g.fillStyle = '#fff'; g.font = `800 ${W * .5}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s ? '+' : '✦', W / 2, W / 2 + 1);
  }
  const ITEM_COLOR = { pocion: '#ff6a6a', espada: '#e86a4a', tomo: '#a07cff', botas: '#b08a5a', daga: '#ffd04a', cota: '#9aa4b4', capa: '#6ab0ff', cristal: '#ff4f6a', gema: '#4ae0d0', botasR: '#d8b45a', hoja: '#ff8a3a', arco: '#f0e070', sangre: '#d8303a', hacha: '#c86a3a', sombrero: '#8a5aff', baculo: '#5fe07a', espinas: '#7a8a6a', manto: '#5a8aff', corazon: '#ff3a6a' };
  const ITEM_ABBR = k => ({ pocion: 'Po', espada: 'Es', tomo: 'To', botas: 'Bo', daga: 'Da', cota: 'Co', capa: 'Ca', cristal: 'Cr', gema: 'Ge', botasR: 'BV', hoja: 'HO', arco: 'AH', sangre: 'SE', hacha: 'HC', sombrero: 'SB', baculo: 'BS', espinas: 'CE', manto: 'ME', corazon: 'CP' }[k] || '?');

  /** retrato: dibuja el modelo 3D del campeón en un canvas (una vez) */
  const portraits = {};
  function portrait(renderer, key) {
    if (portraits[key]) return portraits[key];
    const S = 128, rt = new THREE.WebGLRenderTarget(S, S), sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, .1, 50);
    sc.add(new THREE.HemisphereLight(0xfff4e0, 0x404060, 1.4)); const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(2, 4, -3); sc.add(dl);
    const m = champ(key, 0); m.p.ring.visible = false; m.root.rotation.y = Math.PI + .5; sc.add(m.root);
    cam.position.set(0, 2.2, -4.2); cam.lookAt(0, 1.75, 0);
    const prev = renderer.getRenderTarget(); renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(sc, cam); renderer.setRenderTarget(prev);
    const px = new Uint8Array(S * S * 4); renderer.readRenderTargetPixels(rt, 0, 0, S, S, px); rt.dispose();
    const cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d'), img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) img.data.set(px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
    const bg = document.createElement('canvas'); bg.width = bg.height = S; const b = bg.getContext('2d'); const gr = b.createRadialGradient(S / 2, S * .4, 4, S / 2, S / 2, S * .7); gr.addColorStop(0, Arena.CHAMPS[key].color); gr.addColorStop(1, '#0d0f22'); b.fillStyle = gr; b.fillRect(0, 0, S, S);
    g.putImageData(img, 0, 0); b.drawImage(cv, 0, 0); portraits[key] = bg; return bg;
  }

  window.AModels = { champ, animate, minion, monster, tower, inhib, nexus, buildMap, icon, spellIcon, portrait, ITEM_COLOR, ITEM_ABBR, TEAM, ring, glow, mat, G };
})();
