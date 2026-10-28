/* GonzaCraft — mundo infinito: generación por chunks, mallas con oclusión ambiental y raycast */
(function () {
  'use strict';
  const GC = window.GC;
  const { B, UV, Noise, hash2, hash3 } = GC;
  const CS = 16, CH = 112, SEA = 40, N = CS * CS * CH, PW = CS + 2;
  const I = (x, y, z) => (y * CS + z) * CS + x;
  const key = (cx, cz) => cx + ',' + cz;
  const BIO = { OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, DESERT: 4, SNOW: 5, MOUNTAIN: 6 };
  const BIONAME = ['Océano', 'Playa', 'Llanura', 'Bosque', 'Desierto', 'Tundra', 'Montañas'];

  // propiedades rápidas por id
  const OPQ = new Uint8Array(256), SOL = new Uint8Array(256), KIND = new Uint8Array(256), LIT = new Uint8Array(256);
  B.forEach((d, i) => { if (!d) return; OPQ[i] = d.op && d.kind === 'cube' ? 1 : 0; SOL[i] = d.solid ? 1 : 0; KIND[i] = { air: 0, cube: 1, cross: 2, water: 3 }[d.kind]; LIT[i] = d.light ? 1 : 0; });
  // bloquea la luz del cielo: opacos y hojas
  const SHADE = new Uint8Array(256); B.forEach((d, i) => { if (d && (OPQ[i] || i === 8 || i === 23 || i === 11)) SHADE[i] = 1; });

  /* caras: normal y esquinas (abajo-izq, abajo-der, arriba-der, arriba-izq vistas desde afuera) */
  const FACES = [
    { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], s: .8, t: 2 },
    { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], s: .8, t: 2 },
    { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], s: 1, t: 0 },
    { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], s: .5, t: 1 },
    { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], s: .65, t: 2 },
    { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], s: .65, t: 2 },
  ];
  const AOL = [.42, .62, .8, 1];
  // rayos X: estos bloques no se dibujan para ver minerales y cuevas
  const XRAY = new Uint8Array(256); [1, 2, 3, 4, 5, 6, 8, 11, 12, 13, 15, 19, 21, 23, 39].forEach(i => XRAY[i] = 1);

  class Buf {
    constructor(ox, oz) { this.ox = ox; this.oz = oz; this.p = []; this.u = []; this.l = []; this.i = []; this.n = 0; }
    quad(v, uv, lights, flip) {
      const n = this.n;
      for (let k = 0; k < 4; k++) { this.p.push(v[k][0] + this.ox, v[k][1], v[k][2] + this.oz); this.u.push(uv[k][0], uv[k][1]); this.l.push(lights[k][0], lights[k][1], lights[k][2]); }
      if (flip) this.i.push(n + 1, n + 2, n + 3, n + 1, n + 3, n); else this.i.push(n, n + 1, n + 2, n, n + 2, n + 3);
      this.n += 4;
    }
    geometry() {
      if (!this.n) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
      g.setAttribute('light', new THREE.Float32BufferAttribute(this.l, 3));
      g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
      g.computeBoundingSphere();
      return g;
    }
  }

  function makeMaterials() {
    const atlas = new THREE.CanvasTexture(GC.atlasCanvas); atlas.magFilter = atlas.minFilter = THREE.NearestFilter; atlas.generateMipmaps = false;
    const wt = new THREE.CanvasTexture(GC.waterCanvas); wt.magFilter = wt.minFilter = THREE.NearestFilter; wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.generateMipmaps = false;
    const common = { day: { value: 1 }, nv: { value: 0 }, fogColor: { value: new THREE.Color(0x8ec5ff) }, fogNear: { value: 60 }, fogFar: { value: 96 } };
    const vs = `attribute vec3 light; varying vec2 vUv; varying vec3 vL; varying float vD;
      void main(){ vUv = uv; vL = light; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = length(mv.xyz); gl_Position = projectionMatrix * mv; }`;
    const fs = (water) => `uniform sampler2D map; uniform float day; uniform float nv; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; uniform float opacity; uniform vec2 off;
      varying vec2 vUv; varying vec3 vL; varying float vD;
      void main(){ vec4 c = texture2D(map, ${water ? 'vUv * 0.5 + off' : 'vUv'}); ${water ? '' : 'if (c.a < 0.5) discard;'}
        float l = vL.x * max(vL.y * day, vL.z); l = max(max(l, 0.035), vL.x * nv);
        vec3 col = c.rgb * l; float f = smoothstep(fogNear, fogFar, vD);
        gl_FragColor = vec4(mix(col, fogColor, f), ${water ? 'opacity' : '1.0'}); }`;
    const solid = new THREE.ShaderMaterial({ uniforms: { ...common, map: { value: atlas }, opacity: { value: 1 }, off: { value: new THREE.Vector2() } }, vertexShader: vs, fragmentShader: fs(false) });
    const water = new THREE.ShaderMaterial({ uniforms: { ...common, map: { value: wt }, opacity: { value: .78 }, off: { value: new THREE.Vector2() } }, vertexShader: vs, fragmentShader: fs(true), transparent: true, depthWrite: false, side: THREE.DoubleSide });
    return { solid, water, atlas, common };
  }

  class World {
    constructor(seed, scene, mats, opt = {}) {
      this.seed = seed >>> 0; this.scene = scene; this.mats = mats; this.opt = opt;
      this.n1 = new Noise(this.seed); this.n2 = new Noise(this.seed + 11); this.n3 = new Noise(this.seed + 23); this.n4 = new Noise(this.seed + 37); this.n5 = new Noise(this.seed + 51); this.n6 = new Noise(this.seed + 67); this.n7 = new Noise(this.seed + 79);
      this.chunks = new Map(); this.loading = new Set(); this.savedKeys = opt.savedKeys || new Set(); this.pending = new Map(); this.lamps = new Map();
      this.toSave = new Set(); this.list = []; this.listKey = ''; this.lastC = null; this.rd = 6; this.unloadT = 0;
    }
    /* ── terreno ── */
    terrain(wx, wz) {
      const c = this.n1.fbm2(wx / 330, wz / 330, 4), d = this.n2.fbm2(wx / 72, wz / 72, 3);
      const m = this.n3.noise2(wx / 280, wz / 280), r = 1 - Math.abs(this.n6.noise2(wx / 110, wz / 110));
      const temp = this.n4.noise2(wx / 520, wz / 520), hum = this.n5.noise2(wx / 460 + 50, wz / 460 - 50);
      let h = SEA + 3 + c * 17 + d * 5;
      const mt = Math.max(0, (m - .2) / .8);
      h += mt * (14 + r * r * 34);
      h = Math.max(4, Math.min(CH - 14, Math.floor(h)));
      let b;
      if (h < SEA - 1) b = BIO.OCEAN;
      else if (h <= SEA + 1 && mt < .1) b = temp < -.35 ? BIO.SNOW : BIO.BEACH;
      else if (mt > .3 && h > SEA + 24) b = BIO.MOUNTAIN;
      else if (temp > .28 && hum < .1) b = BIO.DESERT;
      else if (temp < -.32) b = BIO.SNOW;
      else if (hum > .12) b = BIO.FOREST;
      else b = BIO.PLAINS;
      return [h, b, temp];
    }
    generate(cx, cz) {
      const data = new Uint8Array(N), x0 = cx * CS, z0 = cz * CS, s = this.seed;
      const hs = new Int16Array(400), bs = new Uint8Array(400);
      const col = (lx, lz) => { const k = (lz + 2) * 20 + (lx + 2); if (!hs[k]) { const [h, b] = this.terrain(x0 + lx, z0 + lz); hs[k] = h + 1; bs[k] = b; } return [hs[k] - 1, bs[k]]; };
      const set = (lx, y, lz, id, soft) => { if (lx < 0 || lz < 0 || lx >= CS || lz >= CS || y < 0 || y >= CH) return; const i = I(lx, y, lz); if (soft && data[i] && data[i] !== 8 && data[i] !== 23) return; data[i] = id; };
      for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
        const [h, b] = col(lx, lz), wx = x0 + lx, wz = z0 + lz;
        const top = b === BIO.DESERT || b === BIO.BEACH ? 5 : b === BIO.SNOW ? 12 : b === BIO.MOUNTAIN ? (h > SEA + 46 ? 12 : 3) : b === BIO.OCEAN ? (hash2(wx, wz, s) < .3 ? 6 : 5) : 1;
        const under = b === BIO.DESERT ? 5 : b === BIO.BEACH || b === BIO.OCEAN ? 5 : b === BIO.MOUNTAIN ? 3 : 2;
        for (let y = 0; y <= h; y++) {
          let id;
          if (y === 0 || (y < 3 && hash3(wx, y, wz, s) < .5)) id = 19;
          else if (y < h - 3) id = b === BIO.DESERT && y > h - 7 ? 21 : 3;
          else if (y < h) id = under;
          else id = top;
          if (id === 3 || id === 21) {
            // cuevas
            if (y > 4 && !(h < SEA + 2 && y > h - 6)) {
              const a = this.n7.noise3(wx / 28, y / 18, wz / 28), c2 = this.n2.noise3(wx / 28 + 100, y / 18, wz / 28);
              if (a * a + c2 * c2 < .012) { id = y < 10 ? 11 : 0; }
            }
            if (id === 3) {
              const r = hash3(wx, y, wz, s + 5);
              if (r < .0018 && y < 16) id = 18; else if (r < .005 && y < 30) id = 17; else if (r < .012 && y < 54) id = 16; else if (r < .024 && y < 80) id = 15;
            }
          }
          if (y >= h - 3 && id && id !== 19 && (y > 4) && h > SEA + 2) {
            const a = this.n7.noise3(wx / 28, y / 18, wz / 28), c2 = this.n2.noise3(wx / 28 + 100, y / 18, wz / 28);
            if (a * a + c2 * c2 < .006) id = 0;
          }
          data[I(lx, y, lz)] = id;
        }
        for (let y = h + 1; y <= SEA; y++) data[I(lx, y, lz)] = (y === SEA && b === BIO.SNOW) ? 13 : 11;
        // plantas
        if (top === 1 && h >= SEA && data[I(lx, h, lz)] === 1 && h + 1 < CH) {
          const r = hash2(wx, wz, s + 9);
          if (r < .012) data[I(lx, h + 1, lz)] = r < .006 ? 25 : 26;
          else if (r < (b === BIO.PLAINS ? .14 : .06)) data[I(lx, h + 1, lz)] = 27;
        }
        if (b === BIO.DESERT && data[I(lx, h, lz)] === 5 && hash2(wx, wz, s + 13) < .006) { const n = 1 + (hash2(wx, wz, s + 14) * 3 | 0); for (let i = 1; i <= n; i++) set(lx, h + i, lz, 14); }
      }
      // árboles (también los que vienen de columnas vecinas)
      for (let lz = -2; lz < CS + 2; lz++) for (let lx = -2; lx < CS + 2; lx++) {
        const wx = x0 + lx, wz = z0 + lz, r = hash2(wx, wz, s + 3), [h, b] = col(lx, lz);
        const p = b === BIO.FOREST ? .045 : b === BIO.PLAINS ? .005 : b === BIO.SNOW ? .008 : 0;
        if (r >= p || h < SEA + 1 || h > CH - 12) continue;
        if (lx >= 0 && lz >= 0 && lx < CS && lz < CS) { const g = data[I(lx, h, lz)]; if (g !== 1 && g !== 12 && g !== 2) continue; }
        const birch = b === BIO.FOREST && hash2(wx, wz, s + 4) < .3, th = 4 + (hash2(wx, wz, s + 6) * 3 | 0), log = birch ? 22 : 7, leaf = birch ? 23 : 8;
        for (let y = h + th - 2; y <= h + th + 1; y++) {
          const rad = y > h + th - 1 ? 1 : 2;
          for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
            if (rad === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2 && hash3(wx + dx, y, wz + dz, s) < .6) continue;
            if (rad === 1 && y === h + th + 1 && Math.abs(dx) + Math.abs(dz) === 2) continue;
            set(lx + dx, y, lz + dz, leaf, true);
          }
        }
        for (let y = h + 1; y <= h + th; y++) set(lx, y, lz, log);
        set(lx, h, lz, 2);
      }
      return data;
    }
    /* ── acceso ── */
    chunkAt(x, z) { const cx = x >> 4, cz = z >> 4, l = this.lastC; if (l && l.cx === cx && l.cz === cz) return l; const c = this.chunks.get(key(cx, cz)); if (c) this.lastC = c; return c; }
    get(x, y, z) { if (y < 0) return 19; if (y >= CH) return 0; const c = this.chunkAt(x, z); return c ? c.data[I(x & 15, y, z & 15)] : 0; }
    loaded(x, z) { return !!this.chunkAt(x, z); }
    solid(x, y, z) { return SOL[this.get(x, y, z)] === 1; }
    set(x, y, z, id, remote) {
      if (y < 0 || y >= CH) return false;
      const c = this.chunkAt(x, z);
      if (!c) { const k = key(x >> 4, z >> 4); if (this.opt.track) this.savedKeys.add(k); if (!this.pending.has(k)) this.pending.set(k, []); this.pending.get(k).push([x, y, z, id]); return false; }
      const i = I(x & 15, y, z & 15), old = c.data[i]; if (old === id) return false;
      c.data[i] = id; c.mod = true; this.toSave.add(c.key); if (this.opt.track) this.savedKeys.add(c.key);
      const lk = x + ',' + y + ',' + z;
      if (id === 24) this.lamps.set(lk, [x, y, z]); else if (old === 24) this.lamps.delete(lk);
      const lx = x & 15, lz = z & 15;
      if (id === 24 || old === 24) { for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) this.dirty(c.cx + dx, c.cz + dz); }
      else { this.dirty(c.cx, c.cz); if (lx === 0) this.dirty(c.cx - 1, c.cz); if (lx === 15) this.dirty(c.cx + 1, c.cz); if (lz === 0) this.dirty(c.cx, c.cz - 1); if (lz === 15) this.dirty(c.cx, c.cz + 1); if (lx === 0 && lz === 0) this.dirty(c.cx - 1, c.cz - 1); if (lx === 15 && lz === 15) this.dirty(c.cx + 1, c.cz + 1); if (lx === 0 && lz === 15) this.dirty(c.cx - 1, c.cz + 1); if (lx === 15 && lz === 0) this.dirty(c.cx + 1, c.cz - 1); }
      if (this.opt.onEdit && !remote) this.opt.onEdit(x, y, z, id);
      return true;
    }
    setXray(on) { this.xray = !!on; for (const c of this.chunks.values()) c.dirty = true; }
    dirty(cx, cz) { const c = this.chunks.get(key(cx, cz)); if (c) c.dirty = true; }
    addChunk(cx, cz, data, mod) {
      const c = { cx, cz, key: key(cx, cz), data, mod: !!mod, dirty: true, mesh: null, wmesh: null };
      this.chunks.set(c.key, c);
      for (let i = 0; i < N; i++) if (data[i] === 24) { const x = i & 15, z = (i >> 4) & 15, y = (i / 256) | 0; this.lamps.set((cx * 16 + x) + ',' + y + ',' + (cz * 16 + z), [cx * 16 + x, y, cz * 16 + z]); }
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dz) this.dirty(cx + dx, cz + dz);
      const p = this.pending.get(c.key); if (p) { this.pending.delete(c.key); p.forEach(([x, y, z, id]) => this.set(x, y, z, id, true)); }
      return c;
    }
    /* ── malla ── */
    buildMesh(c) {
      const pad = new Uint8Array(PW * PW * CH), P = (x, y, z) => (y * PW + z) * PW + x;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const n = dx || dz ? this.chunks.get(key(c.cx + dx, c.cz + dz)) : c; if (!n) continue;
        const xs = dx < 0 ? 15 : 0, xe = dx > 0 ? 0 : 15, zs = dz < 0 ? 15 : 0, ze = dz > 0 ? 0 : 15;
        const XR = this.xray ? XRAY : null;
        for (let y = 0; y < CH; y++) for (let z = zs; z <= ze; z++) for (let x = xs; x <= xe; x++) { const v = n.data[I(x, y, z)]; pad[P(x + 1 + dx * 16, y, z + 1 + dz * 16)] = XR && XR[v] ? 0 : v; }
      }
      const hm = new Int16Array(PW * PW);
      for (let z = 0; z < PW; z++) for (let x = 0; x < PW; x++) { let y = CH - 1; while (y > 0 && !SHADE[pad[P(x, y, z)]]) y--; hm[z * PW + x] = y; }
      const x0 = c.cx * 16, z0 = c.cz * 16;
      const lamps = []; this.lamps.forEach(l => { if (l[0] > x0 - 8 && l[0] < x0 + 24 && l[2] > z0 - 8 && l[2] < z0 + 24) lamps.push(l); });
      const lampAt = (x, y, z) => { let m = 0; for (const l of lamps) { const d = Math.abs(l[0] + .5 - x) + Math.abs(l[1] + .5 - y) + Math.abs(l[2] + .5 - z); if (d < 9) m = Math.max(m, 1 - d / 9); } return m; };
      const sky = (x, y, z) => { if (y >= CH) return 1; const h = hm[(z + 1) * PW + x + 1]; return y > h ? 1 : Math.max(.12, .5 - (h - y) * .03); };
      const sb = new Buf(x0, z0), wb = new Buf(x0, z0);
      for (let y = 0; y < CH; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        const id = pad[P(x + 1, y, z + 1)]; if (!id) continue;
        const k = KIND[id], d = B[id];
        if (k === 2) { // planta en cruz
          const t = UV[d.t[0]], L = [1, sky(x, y + 1, z), lampAt(x0 + x, y, z0 + z)], uv = [[t[0], t[1]], [t[2], t[1]], [t[2], t[3]], [t[0], t[3]]], LL = [L, L, L, L];
          const a = .15, b = .85;
          for (const [p, q] of [[[a, a], [b, b]], [[a, b], [b, a]]]) {
            const v = [[x + p[0], y, z + p[1]], [x + q[0], y, z + q[1]], [x + q[0], y + 1, z + q[1]], [x + p[0], y + 1, z + p[1]]];
            sb.quad(v, uv, LL); sb.quad([v[1], v[0], v[3], v[2]], [uv[0], uv[1], uv[2], uv[3]], LL);
          }
          continue;
        }
        const isW = k === 3, top = isW && pad[P(x + 1, y + 1, z + 1)] !== 11 ? .88 : 1;
        for (let f = 0; f < 6; f++) {
          const F = FACES[f], nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2];
          const nid = ny < 0 ? 19 : ny >= CH ? 0 : pad[P(nx + 1, ny, nz + 1)];
          if (isW) { if (nid === 11 || OPQ[nid] || (f === 3 && nid)) continue; }
          else if (OPQ[nid] || (nid === id && (id === 10 || id === 13))) continue;
          const t = isW ? null : UV[d.t[F.t]];
          const lit = LIT[id], skyL = sky(nx, ny, nz);
          const v = [], uv = [], L = []; let ao = [];
          for (let q = 0; q < 4; q++) {
            const cc = F.c[q];
            let vy = y + cc[1]; if (isW && cc[1] === 1) vy = y + top;
            v.push([x + cc[0], vy, z + cc[2]]);
            if (isW) { const wx = x0 + x + cc[0], wz = z0 + z + cc[2]; uv.push(f === 2 || f === 3 ? [wx, wz] : [f < 2 ? wz : wx, vy]); }
            else { const fu = q === 1 || q === 2, fv = q >= 2; uv.push([fu ? t[2] : t[0], fv ? t[3] : t[1]]); }
            let a = 3;
            if (!lit && !isW) {
              const ax = [0, 1, 2].filter(i => F.n[i] === 0), o = [nx, ny, nz];
              const d1 = cc[ax[0]] ? 1 : -1, d2 = cc[ax[1]] ? 1 : -1;
              const s1 = [...o], s2 = [...o]; s1[ax[0]] += d1; s2[ax[1]] += d2; const cn = [...s1]; cn[ax[1]] += d2;
              const occ = p => p[1] >= 0 && p[1] < CH && OPQ[pad[P(p[0] + 1, p[1], p[2] + 1)]];
              const o1 = occ(s1), o2 = occ(s2), o3 = occ(cn); a = o1 && o2 ? 0 : 3 - (o1 + o2 + o3);
            }
            ao.push(a);
            const lamp = lit ? 1 : lampAt(x0 + x + cc[0], y + cc[1], z0 + z + cc[2]);
            L.push(lit ? [1, 1, 1] : [F.s * AOL[a], skyL, lamp]);
          }
          (isW ? wb : sb).quad(v, uv, L, ao[0] + ao[2] < ao[1] + ao[3]);
        }
      }
      for (const m of [c.mesh, c.wmesh]) if (m) { this.scene.remove(m); m.geometry.dispose(); }
      c.mesh = c.wmesh = null;
      const g1 = sb.geometry(), g2 = wb.geometry();
      if (g1) { c.mesh = new THREE.Mesh(g1, this.mats.solid); c.mesh.matrixAutoUpdate = false; c.mesh.updateMatrix(); this.scene.add(c.mesh); }
      if (g2) { c.wmesh = new THREE.Mesh(g2, this.mats.water); c.wmesh.matrixAutoUpdate = false; c.wmesh.updateMatrix(); c.wmesh.renderOrder = 1; this.scene.add(c.wmesh); }
      c.dirty = false;
    }
    /* ── carga y descarga alrededor del jugador ── */
    update(px, pz, rd, budget = 8) {
      const pcx = Math.floor(px / 16), pcz = Math.floor(pz / 16), lk = pcx + ',' + pcz + ',' + rd, t0 = performance.now();
      if (lk !== this.listKey) {
        this.listKey = lk; this.rd = rd; const L = [];
        for (let dz = -rd - 1; dz <= rd + 1; dz++) for (let dx = -rd - 1; dx <= rd + 1; dx++) { const d = dx * dx + dz * dz; if (d <= (rd + 1.5) * (rd + 1.5)) L.push([pcx + dx, pcz + dz, d]); }
        L.sort((a, b) => a[2] - b[2]); this.list = L;
      }
      let busy = false;
      for (const [cx, cz] of this.list) {
        const k = key(cx, cz); if (this.chunks.has(k) || this.loading.has(k)) continue;
        busy = true;
        if (this.opt.override && this.opt.override.has(k)) { this.addChunk(cx, cz, this.opt.override.get(k), true); this.opt.override.delete(k); }
        else if (this.savedKeys.has(k) && this.opt.loadChunk) {
          this.loading.add(k);
          this.opt.loadChunk(k).then(d => { this.loading.delete(k); if (this.dead || this.chunks.has(k)) return; this.addChunk(cx, cz, d || this.generate(cx, cz), !!d); }).catch(() => { this.loading.delete(k); this.addChunk(cx, cz, this.generate(cx, cz)); });
        } else this.addChunk(cx, cz, this.generate(cx, cz));
        if (performance.now() - t0 > budget) return true;
      }
      const r2 = (rd + .5) * (rd + .5);
      for (const [cx, cz, d] of this.list) {
        if (d > r2) continue;
        const c = this.chunks.get(key(cx, cz)); if (!c || !c.dirty) continue;
        let ok = true; for (let dz = -1; dz <= 1 && ok; dz++) for (let dx = -1; dx <= 1; dx++) if (!this.chunks.has(key(cx + dx, cz + dz))) { ok = false; break; }
        if (!ok) continue;
        busy = true; this.buildMesh(c);
        if (performance.now() - t0 > budget) return true;
      }
      if (t0 - this.unloadT > 1000) {
        this.unloadT = t0; const lim = (rd + 3) * (rd + 3);
        for (const [k, c] of this.chunks) { const dx = c.cx - pcx, dz = c.cz - pcz; if (dx * dx + dz * dz > lim) this.unload(c); }
      }
      return busy;
    }
    unload(c) {
      if (c.mod && this.opt.saveChunk) { this.opt.saveChunk(c.key, c.data); this.savedKeys.add(c.key); }
      if (c.mod && this.opt.keep) this.opt.keep.set(c.key, c.data);
      this.toSave.delete(c.key);
      for (const m of [c.mesh, c.wmesh]) if (m) { this.scene.remove(m); m.geometry.dispose(); }
      this.chunks.delete(c.key); if (this.lastC === c) this.lastC = null;
      for (const [k, l] of this.lamps) if (l[0] >> 4 === c.cx && l[2] >> 4 === c.cz) this.lamps.delete(k);
    }
    /** ¿están listos los chunks alrededor de (x,z)? */
    ready(px, pz, r) { const pcx = Math.floor(px / 16), pcz = Math.floor(pz / 16); for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const c = this.chunks.get(key(pcx + dx, pcz + dz)); if (!c || c.dirty) return false; } return true; }
    flush() { const out = []; for (const k of this.toSave) { const c = this.chunks.get(k); if (c) { out.push([k, c.data]); this.savedKeys.add(k); } } this.toSave.clear(); return out; }
    modified() { const out = []; for (const c of this.chunks.values()) if (c.mod) out.push([c.key, c.data]); return out; }
    dispose() { this.dead = true; for (const c of this.chunks.values()) for (const m of [c.mesh, c.wmesh]) if (m) { this.scene.remove(m); m.geometry.dispose(); } this.chunks.clear(); }
    /* ── rayo (DDA) ── */
    raycast(o, d, max) {
      let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
      const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
      const tdx = Math.abs(1 / d.x), tdy = Math.abs(1 / d.y), tdz = Math.abs(1 / d.z);
      let tx = d.x > 0 ? (x + 1 - o.x) * tdx : (o.x - x) * tdx, ty = d.y > 0 ? (y + 1 - o.y) * tdy : (o.y - y) * tdy, tz = d.z > 0 ? (z + 1 - o.z) * tdz : (o.z - z) * tdz;
      let n = [0, 0, 0], t = 0;
      for (let i = 0; i < 200 && t <= max; i++) {
        const id = this.get(x, y, z);
        if (id && id !== 11) return { x, y, z, id, n, t };
        if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; n = [-sx, 0, 0]; }
        else if (ty < tz) { y += sy; t = ty; ty += tdy; n = [0, -sy, 0]; }
        else { z += sz; t = tz; tz += tdz; n = [0, 0, -sz]; }
      }
      return null;
    }
    findSpawn() {
      for (let r = 0; r < 600; r += 8) for (let a = 0; a < Math.max(1, r / 4); a++) {
        const ang = a / Math.max(1, r / 4) * Math.PI * 2, x = Math.round(Math.cos(ang) * r), z = Math.round(Math.sin(ang) * r), [h, b] = this.terrain(x, z);
        if (h > SEA && b !== BIO.OCEAN && b !== BIO.MOUNTAIN) return [x + .5, h + 1, z + .5];
      }
      return [.5, CH - 10, .5];
    }
  }

  /* compresión simple para enviar chunks por la red */
  function rle(d) { const o = []; for (let i = 0; i < d.length;) { const v = d[i]; let n = 1; while (i + n < d.length && d[i + n] === v && n < 65535) n++; o.push(v, n); i += n; } return o; }
  function unrle(a) { const d = new Uint8Array(N); let p = 0; for (let i = 0; i < a.length; i += 2) { d.fill(a[i], p, p + a[i + 1]); p += a[i + 1]; } return d; }

  Object.assign(GC, { World, makeMaterials, CS, CH, SEA, BIONAME, SOL, KIND, rle, unrle });
})();
