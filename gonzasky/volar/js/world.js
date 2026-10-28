/* GonzaSky — mundo: terreno con niveles de detalle, aeropuertos, ciudades, árboles, agua, cielo y nubes */
(function () {
  'use strict';
  const GS = window.GS;
  const { Noise, rng, hash2 } = GS;
  const SEED = 20261028;
  const TILE = 2000;
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const n1 = new Noise(SEED), n2 = new Noise(SEED + 1), n3 = new Noise(SEED + 2), n4 = new Noise(SEED + 3), n5 = new Noise(SEED + 4), n6 = new Noise(SEED + 5);

  /* ───── altura del terreno (sin aeropuertos) ───── */
  function rawHeight(x, z) {
    const c = n1.fbm2(x / 30000 + .3, z / 30000 - .7, 4);
    let h = c * 650 + 140;
    h += n2.fbm2(x / 3600, z / 3600, 4) * 170 * sstep(-.35, .2, c);
    const m = n3.noise2(x / 15000, z / 15000), mt = Math.max(0, (m - .12) / .88);
    const ridge = 1 - Math.abs(n4.noise2(x / 4300, z / 4300));
    h += mt * mt * (950 + ridge * ridge * 1800);
    h += n5.noise2(x / 520, z / 520) * 10;
    return h;
  }

  /* ───── aeropuertos ───── */
  const AP_NAMES = [
    ['Aeropuerto Gonza', 'GZA', 'intl', 3200, 50], ['Aeródromo del Valle', 'VLL', 'regional', 1800, 35], ['Pista La Cumbre', 'CMB', 'strip', 900, 22],
    ['Base Cóndor', 'CDR', 'military', 2800, 45], ['Puerto Azul', 'PAZ', 'regional', 2000, 38], ['Aeroclub Los Álamos', 'ALM', 'strip', 1000, 24],
    ['Aeropuerto Sierra Alta', 'SRA', 'mountain', 1600, 30], ['Aeropuerto del Sur', 'SUR', 'intl', 2900, 45],
  ];
  function findSite(r, ang, test) {
    for (let k = 0; k < 400; k++) {
      const a = ang + (k % 20) * .31, rr = r + Math.floor(k / 20) * 900;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr, h = rawHeight(x, z);
      const s = Math.abs(rawHeight(x + 600, z) - h) + Math.abs(rawHeight(x, z + 600) - h);
      if (test(h, s)) return [x, z, h];
    }
    return [Math.cos(ang) * r, Math.sin(ang) * r, Math.max(20, rawHeight(Math.cos(ang) * r, Math.sin(ang) * r))];
  }
  const R = rng(SEED);
  const AIRPORTS = AP_NAMES.map(([name, code, kind, len, wid], i) => {
    let site;
    if (i === 0) site = findSite(0, 0, (h, s) => h > 25 && h < 320 && s < 50);
    else if (kind === 'mountain') site = findSite(26000, i * 1.7, (h, s) => h > 850 && h < 1700 && s < 220);
    else if (code === 'PAZ') site = findSite(22000, 2.2, (h, s) => h > 6 && h < 60 && s < 60);
    else site = findSite(9000 + i * 6500, i * 2.39, (h, s) => h > 20 && h < 650 && s < 70);
    const [x, z, h] = site, e = Math.max(12, Math.round(h));
    // elegir el rumbo de pista con las aproximaciones más despejadas (pendiente de 3° en ambas cabeceras)
    let hdg = 0, best = -1e9;
    for (let k = 0; k < 18; k++) {
      const hh = (k * 10 + Math.floor(R() * 3)) * Math.PI / 180, s1 = Math.sin(hh), c1 = Math.cos(hh); let worst = 1e9;
      for (const sg of [-1, 1]) for (let d = 400; d <= 9000; d += 300) { const u = sg * (len / 2 + d), px = x + u * s1, pz = z - u * c1; worst = Math.min(worst, e + d * .0524 - rawHeight(px, pz)); }
      if (worst > best) { best = worst; hdg = hh; }
    }
    return { name, code, kind, len, wid, x, z, e, hdg, clear: best, dir: [Math.sin(hdg), -Math.cos(hdg)] };
  });
  // u: a lo largo de la pista (positivo = hacia donde apunta el rumbo), v: hacia la derecha
  const apLocal = (a, x, z) => { const dx = x - a.x, dz = z - a.z, s = Math.sin(a.hdg), c = Math.cos(a.hdg); return [dx * s - dz * c, dx * c + dz * s]; };
  const apWorld = (a, u, v) => { const s = Math.sin(a.hdg), c = Math.cos(a.hdg); return [a.x + u * s + v * c, a.z - u * c + v * s]; };
  function height(x, z) {
    let h = rawHeight(x, z);
    for (const a of AIRPORTS) {
      const dx = x - a.x, dz = z - a.z, r2 = dx * dx + dz * dz; if (r2 > (a.len / 2 + 10500) ** 2) continue;
      const [u, v] = apLocal(a, x, z);
      // corredores de aproximación: el terreno queda por debajo de la senda de 3°
      const da = Math.abs(u) - a.len / 2;
      if (da > 0 && da < 10000) { const w = 380 + da * .12, bl = 1 - sstep(w, w + 700, Math.abs(v)); if (bl > 0) { const cap = a.e + da * .0524 - 35; if (h > cap) h -= (h - cap) * bl * (1 - sstep(8500, 10000, da)); } }
      if (r2 > (a.len + 3000) * (a.len + 3000)) continue;
      const A = a.len / 2 + 450, B = a.wid / 2 + 420;
      const d = Math.hypot(Math.max(0, Math.abs(u) - A), Math.max(0, Math.abs(v - 120) - B - 120));
      const t = sstep(0, 1100, d); h = a.e * (1 - t) + h * t;
    }
    return h;
  }
  function onRunway(x, z) {
    for (const a of AIRPORTS) { const [u, v] = apLocal(a, x, z); if (Math.abs(u) <= a.len / 2 + 30 && Math.abs(v) <= a.wid / 2 + 2) return { ap: a, u, v }; }
    return null;
  }
  function surface(x, z) {
    const rw = onRunway(x, z); if (rw) return { y: rw.ap.e + .35, type: 'runway', rw };
    const h = height(x, z); if (h < 0) return { y: 0, type: 'water' };
    return { y: h, type: 'ground' };
  }

  /* ───── colores del terreno ───── */
  const C = { deep: [.16, .27, .33], sand: [.80, .74, .55], grass: [.36, .55, .22], grass2: [.47, .60, .27], dry: [.62, .60, .36], forest: [.17, .35, .15], rock: [.47, .44, .40], rock2: [.36, .34, .32], snow: [.94, .95, .97], field: [.66, .62, .30], field2: [.42, .58, .20] };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  function forestAt(x, z) { return n6.fbm2(x / 2400, z / 2400, 3); }
  function colorAt(x, z, h, slope) {
    if (h < -2) return mix(C.sand, C.deep, Math.min(1, -h / 40));
    if (h < 7) return C.sand;
    const v = n5.noise2(x / 180, z / 180) * .5 + .5;
    let c = mix(C.grass, C.grass2, v);
    const f = forestAt(x, z);
    if (h < 700) { // campos de cultivo cerca de las llanuras
      const fx = Math.floor(x / 420), fz = Math.floor(z / 330), r = hash2(fx, fz, 7);
      if (r < .55 && f < .05 && h < 450) c = mix(c, r < .2 ? C.field : r < .4 ? C.field2 : C.dry, .65);
    }
    if (f > .12 && h < 1400) c = mix(c, C.forest, sstep(.12, .3, f));
    if (h > 900) c = mix(c, C.dry, sstep(900, 1300, h) * .6);
    const rk = Math.max(sstep(.5, .9, slope), sstep(1300, 1700, h));
    c = mix(c, mix(C.rock, C.rock2, v), rk);
    const sn = sstep(1850, 2100, h + v * 120) * (1 - sstep(.9, 1.4, slope) * .6);
    return mix(c, C.snow, sn);
  }

  /** colores suaves para el mapa grande (sin el detalle que se ve como ruido desde arriba) */
  function mapColor(x, z, h) {
    if (h < 0) return mix([.24, .45, .62], [.10, .22, .38], Math.min(1, -h / 300));
    if (h < 8) return [.83, .78, .6];
    const f = n6.noise2(x / 9000, z / 9000);
    let c = mix([.55, .70, .38], [.36, .52, .25], sstep(0, 500, h));
    if (f > .15) c = mix(c, [.22, .40, .2], .45);
    c = mix(c, [.55, .5, .42], sstep(700, 1300, h));
    return mix(c, [.95, .96, .98], sstep(1800, 2100, h));
  }
  /* ───── texturas por código ───── */
  function canvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }
  const asphaltTex = (() => {
    const t = new THREE.CanvasTexture(canvas(128, 128, (g) => { g.fillStyle = '#3b3d41'; g.fillRect(0, 0, 128, 128); const r = rng(5); for (let i = 0; i < 2500; i++) { const v = r() < .5 ? 255 : 0; g.fillStyle = `rgba(${v},${v},${v},${r() * .07})`; g.fillRect(r() * 128, r() * 128, 1 + r() * 2, 1 + r() * 2); } }));
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  function numberTex(n) {
    const t = new THREE.CanvasTexture(canvas(128, 192, (g) => { g.fillStyle = '#fff'; g.font = 'bold 150px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n).padStart(2, '0'), 64, 100); }));
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }
  /** marcas blancas de la pista como geometría (nítidas desde cualquier distancia). En el grupo: -Z = rumbo de la pista */
  function runwayMarks(a) {
    const pos = [], idx = [], L = a.len, W = a.wid;
    const rect = (x0, x1, z0, z1) => { const n = pos.length / 3; pos.push(x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1); idx.push(n, n + 2, n + 1, n, n + 3, n + 2); };
    rect(-W / 2 + 1, -W / 2 + 1.9, -L / 2, L / 2); rect(W / 2 - 1.9, W / 2 - 1, -L / 2, L / 2);
    for (let z = -L / 2 + 160; z < L / 2 - 160; z += 50) rect(-.45, .45, z, z + 30);
    for (const end of [1, -1]) {
      const z0 = end * (L / 2 - 6), z1 = end * (L / 2 - 36), sw = (W / 2 - 6) / 8;
      for (let k = 0; k < 4; k++) { const x = 3 + k * sw * 2; rect(x, x + sw, Math.min(z0, z1), Math.max(z0, z1)); rect(-x - sw, -x, Math.min(z0, z1), Math.max(z0, z1)); }
      const za = end * (L / 2 - 300), zb = end * (L / 2 - 345); for (const sx of [-1, 1]) rect(sx > 0 ? W / 4 - 3 : -W / 4 - 3, sx > 0 ? W / 4 + 3 : -W / 4 + 3, Math.min(za, zb), Math.max(za, zb));
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  const windowsTex = (() => {
    const day = canvas(64, 64, (g) => { g.fillStyle = '#c9c6bf'; g.fillRect(0, 0, 64, 64); for (let y = 4; y < 64; y += 10) for (let x = 4; x < 64; x += 10) { g.fillStyle = '#3d4a5a'; g.fillRect(x, y, 6, 6); } });
    const night = canvas(64, 64, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64); const r = rng(3); for (let y = 4; y < 64; y += 10) for (let x = 4; x < 64; x += 10) { if (r() < .55) { g.fillStyle = r() < .7 ? '#ffd88a' : '#cfe6ff'; g.fillRect(x, y, 6, 6); } } });
    const a = new THREE.CanvasTexture(day), b = new THREE.CanvasTexture(night); [a, b].forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; });
    return { day: a, night: b };
  })();
  function cloudTexture() {
    return new THREE.CanvasTexture(canvas(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(.5, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    }));
  }
  function glowTexture() {
    return new THREE.CanvasTexture(canvas(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }));
  }

  /* ───── el mundo ───── */
  class World {
    constructor(scene, quality = 'medio') {
      this.scene = scene; this.tiles = new Map(); this.setQuality(quality);
      this.terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
      this.treeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
      this.treeGeo = (() => {
        const cone = new THREE.ConeGeometry(.5, 1, 6); cone.translate(0, 1.15, 0);
        const trunk = new THREE.CylinderGeometry(.08, .1, .7, 5); trunk.translate(0, .35, 0);
        const paint = (g, col) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(col, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g.toNonIndexed ? g.toNonIndexed() : g; };
        const g1 = paint(cone.toNonIndexed(), [.025, .09, .02]), g2 = paint(trunk.toNonIndexed(), [.09, .04, .015]);
        const m = new THREE.BufferGeometry(); ['position', 'normal', 'color'].forEach(k => { const a = g1.attributes[k].array, b = g2.attributes[k].array, c = new Float32Array(a.length + b.length); c.set(a); c.set(b, a.length); m.setAttribute(k, new THREE.BufferAttribute(c, 3)); });
        return m;
      })();
      this.buildWater(); this.buildSky(); this.buildAirports(); this.buildCities(); this.buildClouds();
      this.lights();
      this.queue = []; this.center = null;
    }
    setQuality(q) {
      this.quality = q; this.radius = { bajo: 5, medio: 7, alto: 9 }[q] || 7; this.trees = q !== 'bajo';
      for (const t of this.tiles.values()) this.dropTile(t); this.tiles.clear(); this.center = null;
    }
    lights() {
      this.sun = new THREE.DirectionalLight(0xffffff, 2.2); this.hemi = new THREE.HemisphereLight(0xbfdcff, 0x50442e, .9);
      this.scene.add(this.sun, this.sun.target, this.hemi);
    }
    /* agua */
    buildWater() {
      const g = new THREE.PlaneGeometry(80000, 80000, 1, 1); g.rotateX(-Math.PI / 2);
      this.water = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: 0x1d5679, specular: 0x7799bb, shininess: 90, transparent: true, opacity: .93 }));
      this.water.renderOrder = 1; this.scene.add(this.water);
    }
    /* cielo con gradiente y sol */
    buildSky() {
      const g = new THREE.SphereGeometry(60000, 32, 16);
      this.skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color(1, .95, .8) } },
        vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }',
        fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vD; void main(){ float y = vD.y; vec3 c = y > 0. ? mix(hor, top, pow(clamp(y,0.,1.), .45)) : mix(hor, hor*.55, clamp(-y*4.,0.,1.)); float s = max(dot(normalize(vD), sunDir), 0.); c += sunCol * (pow(s, 900.) * 2.5 + pow(s, 12.) * .25); gl_FragColor = vec4(c, 1.); }',
      });
      this.sky = new THREE.Mesh(g, this.skyMat); this.sky.renderOrder = -10; this.sky.frustumCulled = false; this.scene.add(this.sky);
      const sp = [], r = rng(9); for (let i = 0; i < 1500; i++) { const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u); sp.push(Math.cos(a) * s * 50000, Math.abs(u) * 50000, Math.sin(a) * s * 50000); }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
      this.stars.frustumCulled = false; this.scene.add(this.stars);
    }
    /* aeropuertos: pista, calles de rodaje, plataforma, edificios y luces */
    buildAirports() {
      this.apGroup = new THREE.Group(); this.scene.add(this.apGroup);
      const glow = glowTexture(); this.lightMats = [];
      const asphalt = new THREE.MeshLambertMaterial({ color: 0x4a4c50, polygonOffset: true, polygonOffsetFactor: -2 });
      const concrete = new THREE.MeshLambertMaterial({ color: 0x8b8d8f, polygonOffset: true, polygonOffsetFactor: -1 });
      const grassStrip = new THREE.MeshLambertMaterial({ color: 0x5e8a3a, polygonOffset: true, polygonOffsetFactor: -1 });
      const white = new THREE.MeshLambertMaterial({ color: 0xe9e6df }), glass = new THREE.MeshLambertMaterial({ color: 0x2c4a6b, emissive: 0x0a1a2a });
      const metal = new THREE.MeshLambertMaterial({ color: 0x9aa3ab }), red = new THREE.MeshLambertMaterial({ color: 0xd04a2a }), orange = new THREE.MeshLambertMaterial({ color: 0xff7b1c });
      for (const a of AIRPORTS) {
        const g = new THREE.Group(); g.position.set(a.x, a.e, a.z); g.rotation.y = -a.hdg; this.apGroup.add(g);
        // en el grupo: -Z es la dirección de la pista, +X la derecha
        const plane = (w, l, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); g.add(m); return m; };
        const isStrip = a.kind === 'strip';
        const grassRw = isStrip && a.code === 'CMB';
        const tex = asphaltTex.clone(); tex.needsUpdate = true; tex.repeat.set(a.wid / 25, a.len / 25);
        plane(a.wid, a.len, grassRw ? new THREE.MeshLambertMaterial({ color: 0x7e8f4a, polygonOffset: true, polygonOffsetFactor: -2 }) : new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2 }), 0, .35, 0);
        if (!grassRw) {
          const mk = new THREE.Mesh(runwayMarks(a), new THREE.MeshLambertMaterial({ color: 0xe8e8e2, polygonOffset: true, polygonOffsetFactor: -4 })); mk.position.y = .37; g.add(mk);
          const num = Math.round(((a.hdg * 180 / Math.PI) % 360) / 10) || 36, opp = ((num + 17) % 36) + 1;
          for (const [n, z, rot] of [[num, a.len / 2 - 75, 0], [opp, -a.len / 2 + 75, Math.PI]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(12, 18), new THREE.MeshLambertMaterial({ map: numberTex(n), transparent: true, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false })); m.rotation.set(-Math.PI / 2, 0, rot, 'YXZ'); m.rotation.order = 'YXZ'; m.rotation.set(-Math.PI / 2, rot, 0); m.position.set(0, .38, z); g.add(m); }
        }
        plane(a.wid + 30, a.len + 120, grassStrip, 0, .15, 0);
        const ax = a.wid / 2 + 140;
        if (!isStrip) {
          plane(20, a.len * .9, asphalt, ax - 40, .3, 0);
          for (const zz of [-a.len * .42, 0, a.len * .42]) plane(80, 18, asphalt, ax - 80 + 20, .3, zz);
          plane(220, Math.min(700, a.len * .35), concrete, ax + 110, .25, 0);
        } else plane(60, 120, concrete, ax - 60, .25, a.len * .3);
        const box = (w, h, d, mat, x, z, y = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y + h / 2, z); g.add(m); return m; };
        if (a.kind === 'intl' || a.kind === 'regional') {
          box(60, 18, Math.min(420, a.len * .2), white, ax + 260, 0); box(62, 4, Math.min(424, a.len * .2), glass, ax + 260, 0, 10);
        }
        // torre de control
        const tw = new THREE.Mesh(new THREE.CylinderGeometry(3, 4, isStrip ? 10 : 34, 10), white); tw.position.set(ax + 200, (isStrip ? 10 : 34) / 2, -Math.min(300, a.len * .25)); g.add(tw);
        const cab = new THREE.Mesh(new THREE.CylinderGeometry(7, 5.5, 6, 10), glass); cab.position.set(tw.position.x, tw.position.y * 2 + 3, tw.position.z); g.add(cab);
        a.tower = new THREE.Vector3(); g.updateMatrixWorld(); cab.getWorldPosition(a.tower); a.tower.y += 6;
        // hangares
        const nh = a.kind === 'military' ? 5 : isStrip ? 2 : 3;
        for (let i = 0; i < nh; i++) {
          const hz = Math.min(a.len * .4, 650) - i * 90, hg = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 50, 14, 1, false, 0, Math.PI), a.kind === 'military' ? new THREE.MeshLambertMaterial({ color: 0x6b735c }) : metal);
          hg.rotation.z = Math.PI / 2; hg.rotation.y = Math.PI / 2; hg.position.set(ax + (isStrip ? 40 : 330), 0, hz); g.add(hg);
        }
        // manga de viento
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, 8, 5), white); pole.position.set(a.wid / 2 + 40, 4, -a.len / 2 + 200); g.add(pole);
        const sock = new THREE.Mesh(new THREE.ConeGeometry(.9, 5, 8, 1, true), orange); sock.rotation.z = Math.PI / 2; sock.position.set(a.wid / 2 + 42.5, 7.6, -a.len / 2 + 200); g.add(sock);
        // luces de pista: blancas a los costados, verdes al principio, rojas al final, más luces de aproximación
        const pts = [], cols = [], add = (x, z, c, y = .9) => { pts.push(x, y, z); cols.push(...c); };
        for (let z = -a.len / 2; z <= a.len / 2; z += 60) { add(-a.wid / 2 - 2, z, [1, .95, .8]); add(a.wid / 2 + 2, z, [1, .95, .8]); }
        for (let x = -a.wid / 2; x <= a.wid / 2; x += 4) { add(x, a.len / 2 + 3, [.3, 1, .4]); add(x, -a.len / 2 - 3, [1, .25, .2]); }
        if (!isStrip) for (let z = a.len / 2 + 60; z < a.len / 2 + 900; z += 60) for (const x of [-6, -3, 0, 3, 6]) add(x, z, [1, 1, .9], 2.5);
        const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
        const lm = new THREE.PointsMaterial({ size: 9, map: glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, sizeAttenuation: true });
        this.lightMats.push(lm); g.add(new THREE.Points(lg, lm));
        a.group = g;
      }
    }
    /* ciudades al lado de los aeropuertos grandes */
    buildCities() {
      this.cityMat = new THREE.MeshLambertMaterial({ map: windowsTex.day, emissiveMap: windowsTex.night, emissive: 0xffffff, emissiveIntensity: 0 });
      const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, .5, 0);
      const list = [];
      for (const a of AIRPORTS) {
        if (a.kind !== 'intl' && a.kind !== 'regional') continue;
        const [cx, cz] = apWorld(a, -a.len * .1, a.wid / 2 + 2600), big = a.kind === 'intl', R2 = big ? 1500 : 800, r = rng(a.x | 0);
        for (let gx = -R2; gx <= R2; gx += 70) for (let gz = -R2; gz <= R2; gz += 70) {
          const d = Math.hypot(gx, gz); if (d > R2 * (.8 + r() * .3) || r() < .25) continue;
          const x = cx + gx + (r() - .5) * 20, z = cz + gz + (r() - .5) * 20, h = height(x, z); if (h < 3 || onRunway(x, z)) continue;
          const [u, v] = apLocal(a, x, z); if (Math.abs(u) < a.len / 2 + 900 && Math.abs(v) < 900) continue;
          const t = 1 - d / R2, hh = 8 + r() * 14 + (big ? t * t * 140 * r() : t * 30 * r());
          list.push([x, h - 1, z, 22 + r() * 18, hh, 22 + r() * 18, r()]);
        }
      }
      const im = new THREE.InstancedMesh(box, this.cityMat, list.length), m = new THREE.Matrix4(), col = new THREE.Color();
      list.forEach(([x, y, z, w, h, d, c], i) => { m.makeScale(w, h, d); m.setPosition(x, y, z); im.setMatrixAt(i, m); col.setHSL(.08 + c * .08, .1, .6 + c * .3); im.setColorAt(i, col); });
      im.frustumCulled = false; this.scene.add(im); this.cities = im; this.buildingCount = list.length;
    }
    /* nubes: grupos de sprites que se reciclan alrededor de la cámara */
    buildClouds() {
      const tex = cloudTexture(); this.cloudMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: .9, fog: true });
      this.clouds = []; const r = rng(77);
      for (let i = 0; i < 220; i++) {
        const g = new THREE.Group(), n = 4 + (r() * 5 | 0);
        for (let k = 0; k < n; k++) { const s = new THREE.Sprite(this.cloudMat); const sz = 300 + r() * 500; s.scale.set(sz * 1.6, sz, 1); s.position.set((r() - .5) * 700, (r() - .5) * 120, (r() - .5) * 500); g.add(s); }
        g.userData = { ox: (r() - .5) * 40000, oz: (r() - .5) * 40000, y: 1500 + r() * 900 };
        this.scene.add(g); this.clouds.push(g);
      }
      this.cloudCount = 80;
    }
    setWeather(w) {
      this.weather = w;
      this.cloudCount = w === 'nublado' ? 220 : w === 'niebla' ? 60 : 70;
      this.clouds.forEach((g, i) => { g.visible = i < this.cloudCount; g.userData.y = w === 'nublado' ? 900 + (i % 9) * 110 : 1500 + (i % 9) * 100; });
      this.cloudMat.color.setScalar(w === 'nublado' ? .82 : 1);
    }
    /* hora del día: 0..24 */
    setTime(hour) {
      this.hour = hour;
      const a = (hour - 6) / 24 * Math.PI * 2, el = Math.sin(a);
      const sunDir = new THREE.Vector3(Math.cos(a) * .8, el, .45).normalize(); this.sunDir = sunDir;
      const day = sstep(-.12, .25, el), set = Math.max(0, 1 - Math.abs(el) / .3) * sstep(-.25, 0, el);
      const top = new THREE.Color(0x02040c).lerp(new THREE.Color(0x2c66c9), day).lerp(new THREE.Color(0x2b3d7c), set * .5);
      const hor = new THREE.Color(0x0b1428).lerp(new THREE.Color(0xa6cdf5), day).lerp(new THREE.Color(0xf09a55), set * .75);
      const fogAdd = this.weather === 'niebla' ? .7 : this.weather === 'nublado' ? .25 : 0;
      hor.lerp(new THREE.Color(.62, .65, .68).multiplyScalar(.25 + .75 * day), fogAdd);
      this.skyMat.uniforms.top.value.copy(top).lerp(hor, fogAdd * .6); this.skyMat.uniforms.hor.value.copy(hor); this.skyMat.uniforms.sunDir.value.copy(sunDir);
      this.skyMat.uniforms.sunCol.value.setRGB(1, .9 - set * .3, .75 - set * .4).multiplyScalar(el > -.05 ? 1 - fogAdd * .8 : 0);
      // de noche la luz direccional pasa a ser la luna
      if (el > -.06) { this.lightDir = sunDir; this.sun.intensity = 2.6 * day * (1 - fogAdd * .5) + .45 * (1 - day); this.sun.color.setRGB(1, .93 - set * .35, .82 - set * .5).lerp(new THREE.Color(.6, .7, 1), 1 - day); }
      else { this.lightDir = new THREE.Vector3(-sunDir.x, Math.max(.4, -sunDir.y), -sunDir.z).normalize(); this.sun.intensity = .55 * (1 - fogAdd * .5); this.sun.color.setRGB(.62, .72, 1); }
      this.hemi.intensity = .42 + .7 * day; this.hemi.color.setRGB(.55 + .2 * day, .65 + .2 * day, .85);
      this.night = 1 - day; this.fogColor = hor.clone();
      this.stars.material.opacity = Math.max(0, 1 - day * 1.8) * (1 - fogAdd);
      this.cityMat.emissiveIntensity = this.night * 1.3;
      this.lightMats.forEach(m => { m.opacity = .35 + .65 * this.night; m.size = 6 + 10 * this.night; });
      this.cloudMat.color.setScalar((this.weather === 'nublado' ? .82 : 1) * (.25 + .75 * day)).lerp(new THREE.Color(1, .75, .6), set * .4);
      this.water.material.color.setRGB(.11, .34, .47).multiplyScalar(.3 + .7 * day);
    }
    fogRange() { const far = this.radius * TILE * .92; if (this.weather === 'niebla') return [100, 2600]; if (this.weather === 'nublado') return [far * .25, far * .8]; return [far * .35, far]; }
    /* ── baldosas de terreno ── */
    lodFor(d) { return d <= 1 ? 64 : d <= 3 ? 32 : d <= 6 ? 16 : 8; }
    buildTile(i, j, seg) {
      const x0 = i * TILE, z0 = j * TILE, st = TILE / seg, N = seg + 1;
      const hs = new Float32Array((N + 2) * (N + 2)); // con un borde extra para calcular pendientes
      for (let b = -1; b <= N; b++) for (let a = -1; a <= N; a++) hs[(b + 1) * (N + 2) + a + 1] = height(x0 + a * st, z0 + b * st);
      const H = (a, b) => hs[(b + 1) * (N + 2) + a + 1];
      const pos = [], col = [], idx = [];
      // grilla + polleras (bordes que bajan para tapar grietas entre niveles de detalle)
      const M = N + 2; // -1..N
      for (let b = -1; b <= N; b++) for (let a = -1; a <= N; a++) {
        const aa = Math.min(N - 1, Math.max(0, a)), bb = Math.min(N - 1, Math.max(0, b)), skirt = a !== aa || b !== bb;
        const h = H(aa, bb), x = x0 + aa * st, z = z0 + bb * st;
        pos.push(x, skirt ? h - 60 : h, z);
        const slope = Math.hypot(H(aa + 1, bb) - H(aa - 1, bb), H(aa, bb + 1) - H(aa, bb - 1)) / (2 * st);
        const c = colorAt(x, z, h, slope); col.push(c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2);
      }
      for (let b = 0; b < M - 1; b++) for (let a = 0; a < M - 1; a++) { const p = b * M + a; idx.push(p, p + M, p + 1, p + 1, p + M, p + M + 1); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, this.terrainMat); mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      return mesh;
    }
    buildTrees(i, j) {
      const x0 = i * TILE, z0 = j * TILE, r = rng((i * 73856093) ^ (j * 19349663)), list = [];
      for (let k = 0; k < 1400 && list.length < 650; k++) {
        const x = x0 + r() * TILE, z = z0 + r() * TILE, f = forestAt(x, z); if (f < .14 + r() * .1) continue;
        const h = height(x, z); if (h < 10 || h > 1500) continue;
        if (AIRPORTS.some(a => { const [u, v] = apLocal(a, x, z); return Math.abs(u) < a.len / 2 + 700 && Math.abs(v) < 700; })) continue;
        list.push([x, h - .5, z, 8 + r() * 9]);
      }
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(this.treeGeo, this.treeMat, list.length), m = new THREE.Matrix4();
      list.forEach(([x, y, z, s], k) => { m.makeScale(s * .7, s, s * .7); m.setPosition(x, y, z); im.setMatrixAt(k, m); });
      im.computeBoundingSphere(); return im;
    }
    dropTile(t) { for (const o of [t.mesh, t.trees]) if (o) { this.scene.remove(o); o.geometry !== this.treeGeo && o.geometry.dispose(); } }
    update(cam, budgetMs = 8) {
      const ci = Math.floor(cam.x / TILE), cj = Math.floor(cam.z / TILE), R = this.radius, t0 = performance.now();
      const key = ci + ',' + cj;
      if (key !== this.center) {
        this.center = key; this.queue = [];
        for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
          const d = Math.max(Math.abs(i - ci), Math.abs(j - cj)), seg = this.lodFor(d), t = this.tiles.get(i + ',' + j);
          if (!t || t.seg !== seg || (this.trees && d <= 1 && !t.treesDone)) this.queue.push([i, j, seg, d]);
        }
        this.queue.sort((a, b) => a[3] - b[3]);
        for (const [k, t] of this.tiles) { const [i, j] = k.split(',').map(Number); if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) > R + 1) { this.dropTile(t); this.tiles.delete(k); } }
      }
      let built = 0;
      while (this.queue.length && (performance.now() - t0 < budgetMs || built === 0)) {
        const [i, j, seg, d] = this.queue.shift(), k = i + ',' + j; let t = this.tiles.get(k);
        if (!t || t.seg !== seg) { const mesh = this.buildTile(i, j, seg); if (t) { this.scene.remove(t.mesh); t.mesh.geometry.dispose(); } else { t = { treesDone: false }; this.tiles.set(k, t); } t.mesh = mesh; t.seg = seg; this.scene.add(mesh); }
        if (this.trees && d <= 1 && !t.treesDone) { t.trees = this.buildTrees(i, j); t.treesDone = true; if (t.trees) this.scene.add(t.trees); }
        if (!this.trees && t.trees) { this.scene.remove(t.trees); t.trees = null; t.treesDone = false; }
        built++;
      }
      // agua, cielo y nubes siguen a la cámara
      this.water.position.set(Math.round(cam.x / 1000) * 1000, 0, Math.round(cam.z / 1000) * 1000);
      this.sky.position.copy(cam); this.stars.position.copy(cam);
      const span = 40000;
      for (let k = 0; k < this.cloudCount; k++) {
        const g = this.clouds[k], u = g.userData, wrap = (o, c) => o + Math.round((c - o) / span) * span;
        u.ox += 1.2 * .016; g.position.set(wrap(u.ox, cam.x), u.y, wrap(u.oz, cam.z));
      }
      if (this.lightDir) { this.sun.position.copy(cam).addScaledVector(this.lightDir, 5000); this.sun.target.position.copy(cam); }
      return this.queue.length;
    }
    pending() { return this.queue.length; }
  }

  Object.assign(GS, { World, AIRPORTS, height, rawHeight, surface, onRunway, apLocal, apWorld, colorAt, mapColor, TILE });
})();
