/* GonzaArena — mapa: bases, 3 carriles, río, jungla con rocas y búsqueda de caminos (A*).
 * Este archivo (y los demás sim-*.js) corren igual en el navegador y en el servidor (Node).
 * Coordenadas: el mapa va de 0 a 200 en x y z. Azul abajo a la izquierda, rojo arriba a la derecha.
 */
(function (root) {
  'use strict';
  const A = root.Arena = root.Arena || {};
  const W = 200, CELL = 2, N = W / CELL;

  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const mirror = ([x, z]) => [W - x, W - z];

  /* ── carriles (de la base azul a la roja) ── */
  const LANES = {
    top: [[30, 170], [21, 148], [20, 46], [27, 27], [46, 20], [148, 21], [170, 30]],
    mid: [[32, 168], [100, 100], [168, 32]],
    bot: [[30, 170], [52, 179], [154, 180], [173, 173], [180, 154], [179, 52], [170, 30]],
  };
  function polyInfo(pts) {
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, cum, len: cum[cum.length - 1] };
  }
  const LANE = {}; for (const k in LANES) LANE[k] = polyInfo(LANES[k]);
  /** punto del carril a una fracción t (0 = base azul, 1 = base roja) */
  function lanePoint(lane, t) {
    const L = LANE[lane], d = Math.max(0, Math.min(1, t)) * L.len;
    for (let i = 1; i < L.pts.length; i++) if (d <= L.cum[i] || i === L.pts.length - 1) { const k = (d - L.cum[i - 1]) / (L.cum[i] - L.cum[i - 1] || 1); return [L.pts[i - 1][0] + (L.pts[i][0] - L.pts[i - 1][0]) * k, L.pts[i - 1][1] + (L.pts[i][1] - L.pts[i - 1][1]) * k]; }
  }
  /** fracción del carril más cercana al punto (x, z) y distancia al carril */
  function laneProgress(lane, x, z) {
    const L = LANE[lane]; let best = 1e9, bt = 0;
    for (let i = 1; i < L.pts.length; i++) {
      const [ax, az] = L.pts[i - 1], [bx, bz] = L.pts[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
      let k = l2 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0; k = Math.max(0, Math.min(1, k));
      const px = ax + dx * k, pz = az + dz * k, d = Math.hypot(x - px, z - pz);
      if (d < best) { best = d; bt = (L.cum[i - 1] + k * (L.cum[i] - L.cum[i - 1])) / L.len; }
    }
    return { t: bt, d: best };
  }
  function distToLanes(x, z) { let d = 1e9; for (const k in LANE) d = Math.min(d, laneProgress(k, x, z).d); return d; }

  /* ── bases, estructuras, campamentos ── */
  const FOUNTAIN = [[14, 186], [186, 14]];
  const NEXUS = [[30, 170], [170, 30]];
  const NEXUS_TOWERS = [[[37, 172], [28, 163]], [[163, 28], [172, 37]]];
  // torres por carril: [fracción desde la base propia, nivel]  (nivel 1 = exterior, 2 = interior, 3 = la del inhibidor)
  const TOWER_T = [[.36, 1], [.22, 2], [.12, 3]], INHIB_T = .075;
  const CAMPS_BLUE = [
    { key: 'golem', name: 'Gólem de cristal', at: [46, 104], buff: 'azul' },
    { key: 'lobos', name: 'Lobos grises', at: [64, 124] },
    { key: 'cuervos', name: 'Cuervos', at: [76, 90] },
    { key: 'brasero', name: 'Fénix del brasero', at: [98, 150], buff: 'rojo' },
    { key: 'rocosos', name: 'Rocosos', at: [116, 160] },
  ];
  const CAMPS = CAMPS_BLUE.map(c => Object.assign({}, c, { side: 0 })).concat(CAMPS_BLUE.map(c => Object.assign({}, c, { side: 1, at: mirror(c.at) })));
  const DRAGON = [138, 138], COLOSO = [62, 62];

  /* ── rocas de la jungla (simétricas) ── */
  const ROCKS = [];
  (function placeRocks() {
    const r = rng(1234);
    const ok = (x, z, rad) => {
      if (x < 8 + rad || z < 8 + rad || x > W - 8 - rad || z > W - 8 - rad) return false;
      if (distToLanes(x, z) < 7.5 + rad) return false;
      if (Math.abs(x - z) / Math.SQRT2 < 7 + rad) return false;                        // río
      for (const c of CAMPS) if (Math.hypot(x - c.at[0], z - c.at[1]) < 8 + rad) return false;
      for (const p of [DRAGON, COLOSO]) if (Math.hypot(x - p[0], z - p[1]) < 11 + rad) return false;
      for (const b of NEXUS) if (Math.hypot(x - b[0], z - b[1]) < 34) return false;
      for (const q of ROCKS) if (Math.hypot(x - q.x, z - q.z) < q.r + rad + 2.8) return false; // dejar pasillos
      return true;
    };
    for (let i = 0; i < 4000 && ROCKS.length < 120; i++) {
      const x = 10 + r() * 180, z = 10 + r() * 180; if (x >= z) continue; // solo del lado azul; después espejamos
      const rad = 2.2 + r() * 3.3;
      if (ok(x, z, rad)) { ROCKS.push({ x, z, r: rad }); const [mx, mz] = mirror([x, z]); ROCKS.push({ x: mx, z: mz, r: rad }); }
    }
  })();

  /* ── grilla de navegación ── */
  const BLOCK = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i + .5) * CELL, z = (j + .5) * CELL;
    let b = x < 5 || z < 5 || x > W - 5 || z > W - 5;
    if (!b) for (const q of ROCKS) if (Math.hypot(x - q.x, z - q.z) < q.r + .9) { b = true; break; }
    BLOCK[j * N + i] = b ? 1 : 0;
  }
  const cellOf = v => Math.max(0, Math.min(N - 1, Math.floor(v / CELL)));
  const blocked = (x, z) => x < 0 || z < 0 || x >= W || z >= W || BLOCK[cellOf(z) * N + cellOf(x)] === 1;
  function lineFree(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / (CELL * .5));
    for (let i = 1; i <= n; i++) { const k = i / n; if (blocked(ax + (bx - ax) * k, az + (bz - az) * k)) return false; }
    return true;
  }
  /** celda libre más cercana a (x, z) */
  function nearestFree(x, z) {
    if (!blocked(x, z)) return [x, z];
    for (let r = 1; r < 12; r++) for (let a = 0; a < 16; a++) { const px = x + Math.cos(a / 16 * 6.283) * r * CELL * .7, pz = z + Math.sin(a / 16 * 6.283) * r * CELL * .7; if (!blocked(px, pz)) return [px, pz]; }
    return [x, z];
  }
  /** mapa de distancias hacia cada fuente (se calcula una vez): volver a la base no necesita A* */
  const HOME = [0, 1].map(team => {
    const dist = new Float32Array(N * N).fill(1e9), [fx, fz] = FOUNTAIN[team], s = cellOf(fz) * N + cellOf(fx), q = [s]; dist[s] = 0;
    // Dijkstra simple con cola ordenada por anillos (los costos son 1 y √2)
    const heap = [s], push = n => { heap.push(n); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (dist[heap[p]] <= dist[heap[i]]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (; ;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && dist[heap[l]] < dist[heap[m]]) m = l; if (r < heap.length && dist[heap[r]] < dist[heap[m]]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const done = new Uint8Array(N * N);
    while (heap.length) {
      const c = pop(); if (done[c]) continue; done[c] = 1; const cx = c % N, cz = (c / N) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue; const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const n = nz * N + nx; if (BLOCK[n] || (dx && dz && (BLOCK[cz * N + nx] || BLOCK[nz * N + cx]))) continue;
        const d = dist[c] + (dx && dz ? Math.SQRT2 : 1); if (d < dist[n]) { dist[n] = d; push(n); }
      }
    }
    return dist;
  });
  function pathHome(team, sx, sz) {
    const D = HOME[team], [fx, fz] = FOUNTAIN[team]; let c = cellOf(sz) * N + cellOf(sx); if (D[c] >= 1e9) return null;
    const raw = []; let guard = N * 4;
    while (D[c] > 0 && guard--) {
      const cx = c % N, cz = (c / N) | 0; let best = c;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue; const n = nz * N + nx; if (D[n] < D[best]) best = n; }
      if (best === c) break; c = best; raw.push([((c % N) + .5) * CELL, (((c / N) | 0) + .5) * CELL]);
    }
    raw.push([fx, fz]);
    const out = []; let px = sx, pz = sz, i = 0;
    while (i < raw.length) { let j = Math.min(raw.length - 1, i + 40); while (j > i && !lineFree(px, pz, raw[j][0], raw[j][1])) j--; out.push(raw[j]); [px, pz] = raw[j]; i = j + 1; }
    return out;
  }
  /** A* en la grilla, con atajos en línea recta. Devuelve una lista de puntos [x, z] */
  const G = new Float32Array(N * N), F = new Float32Array(N * N), FROM = new Int32Array(N * N), STAMP = new Uint32Array(N * N), CLOSED = new Uint32Array(N * N);
  let stamp = 0;
  function findPath(sx, sz, tx, tz) {
    [tx, tz] = nearestFree(tx, tz);
    if (lineFree(sx, sz, tx, tz)) return [[tx, tz]];
    for (let team = 0; team < 2; team++) if (Math.hypot(tx - FOUNTAIN[team][0], tz - FOUNTAIN[team][1]) < 3) { const p = pathHome(team, sx, sz); if (p) return p; }
    stamp++;
    const s = cellOf(sz) * N + cellOf(sx), t = cellOf(tz) * N + cellOf(tx);
    const heap = [], push = n => { heap.push(n); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (F[heap[p]] <= F[heap[i]]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (; ;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && F[heap[l]] < F[heap[m]]) m = l; if (r < heap.length && F[heap[r]] < F[heap[m]]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const h = n => { const dx = Math.abs((n % N) - (t % N)), dz = Math.abs(((n / N) | 0) - ((t / N) | 0)); return (dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz)); };
    G[s] = 0; F[s] = h(s); STAMP[s] = stamp; FROM[s] = -1; push(s);
    let found = false, iter = 0;
    while (heap.length && iter++ < 12000) {
      const c = pop(); if (CLOSED[c] === stamp) continue; CLOSED[c] = stamp;
      if (c === t) { found = true; break; }
      const cx = c % N, cz = (c / N) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue; const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const n = nz * N + nx; if (BLOCK[n] && n !== t) continue;
        if (dx && dz && (BLOCK[cz * N + nx] || BLOCK[nz * N + cx])) continue; // no cortar esquinas
        const g = G[c] + (dx && dz ? Math.SQRT2 : 1);
        if (STAMP[n] !== stamp || g < G[n]) { STAMP[n] = stamp; G[n] = g; F[n] = g + h(n); FROM[n] = c; push(n); }
      }
    }
    if (!found) return [[tx, tz]];
    const cells = []; for (let c = t; c !== -1 && c !== s; c = FROM[c]) cells.push(c); cells.reverse();
    const raw = cells.map(c => [((c % N) + .5) * CELL, (((c / N) | 0) + .5) * CELL]); raw[raw.length - 1] = [tx, tz];
    // atajos: saltar puntos mientras haya línea recta libre
    const out = []; let px = sx, pz = sz, i = 0;
    while (i < raw.length) { let j = raw.length - 1; while (j > i && !lineFree(px, pz, raw[j][0], raw[j][1])) j--; out.push(raw[j]); [px, pz] = raw[j]; i = j + 1; }
    return out;
  }

  /* ── colores y zonas para dibujar el piso ── */
  const RIVER_W = 9;
  function zoneAt(x, z) {
    for (let k = 0; k < 2; k++) if (Math.hypot(x - FOUNTAIN[k][0], z - FOUNTAIN[k][1]) < 34 || (k === 0 ? (x < 44 && z > 156) : (x > 156 && z < 44))) return 'base' + k;
    if (distToLanes(x, z) < 4.2) return 'lane';
    if (Math.abs(x - z) / Math.SQRT2 < RIVER_W / 2 || Math.hypot(x - DRAGON[0], z - DRAGON[1]) < 9 || Math.hypot(x - COLOSO[0], z - COLOSO[1]) < 9) return 'river';
    return 'jungle';
  }

  A.MAP = { W, CELL, N, LANES, LANE, lanePoint, laneProgress, distToLanes, FOUNTAIN, NEXUS, NEXUS_TOWERS, TOWER_T, INHIB_T, CAMPS, DRAGON, COLOSO, ROCKS, BLOCK, blocked, lineFree, nearestFree, findPath, zoneAt, RIVER_W, rng, mirror };
})(typeof globalThis !== 'undefined' ? globalThis : this);
