/* GonzaOps · mapa, física de movimiento, rayos y caminos.
 * Corre igual en el navegador, en un Worker y en Node (servidor online). Todo queda en globalThis.Ops.
 * El mapa es una grilla de celdas de 2 m: cada celda tiene una altura (0 = piso libre, 5 = pared).
 */
(function () {
  'use strict';
  const Ops = globalThis.Ops = globalThis.Ops || {};
  const CELL = 2, W = 40, H = 35, PARED = 5;
  const R = 0.34;          // radio del jugador
  const ALTO = 1.8, ALTO_AG = 1.3, OJO = 1.64, OJO_AG = 1.12;
  const G = 20, SALTO = 6.7, ESCALON = 0.45;

  /* ───── mapa «Puerto» ───── */
  function crearMapa() {
    const h = new Float32Array(W * H).fill(PARED);
    const tipo = new Uint8Array(W * H).fill(1);   // 0 piso · 1 pared · 2 cajón · 3 cajón grande · 4 contenedor · 5 baranda
    const zona = new Uint8Array(W * H);           // 0 nada · 1 base Asalto · 2 base Guardia · 3 sitio A · 4 sitio B
    const idx = (x, z) => z * W + x;
    const abrir = (x0, z0, x1, z1, zn) => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { const i = idx(x, z); h[i] = 0; tipo[i] = 0; if (zn) zona[i] = zn; } };
    const poner = (x, z, t) => { const i = idx(x, z); tipo[i] = t; h[i] = t === 2 ? 1.0 : t === 3 ? 2.2 : t === 4 ? 2.8 : t === 5 ? 1.15 : PARED; };
    const bloque = (x0, z0, x1, z1, t) => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) poner(x, z, t); };

    abrir(14, 1, 25, 5, 2);            // base de la Guardia (arriba)
    abrir(14, 29, 25, 33, 1);          // base del Asalto (abajo)
    abrir(28, 2, 37, 11, 3);           // sitio A
    abrir(2, 2, 11, 11, 4);            // sitio B
    abrir(26, 3, 27, 5); abrir(12, 3, 13, 5);         // de la base de la Guardia a cada sitio
    abrir(19, 6, 20, 11);              // pasillo Guardia → plaza
    abrir(14, 12, 25, 16);             // plaza del medio
    abrir(18, 17, 21, 28);             // medio largo hasta el Asalto
    abrir(26, 13, 29, 14); abrir(28, 12, 29, 12);     // pasarela plaza → A
    abrir(10, 13, 13, 14); abrir(10, 12, 11, 12);     // pasaje plaza → B
    abrir(26, 30, 31, 31);             // salida del Asalto hacia el muelle (A largo)
    abrir(32, 22, 35, 31); abrir(33, 20, 34, 21); abrir(32, 13, 35, 19); abrir(32, 12, 35, 12);   // muelle con puerta angosta
    abrir(8, 30, 13, 31);              // salida del Asalto hacia los túneles (B)
    abrir(4, 22, 7, 31); abrir(5, 20, 6, 21); abrir(4, 13, 7, 19); abrir(4, 12, 7, 12);             // túneles con paso angosto
    abrir(8, 23, 17, 24);              // túnel bajo: túneles ↔ medio
    abrir(22, 18, 31, 19);             // galpón: medio ↔ muelle

    // coberturas
    bloque(31, 5, 32, 6, 3); poner(30, 7, 2); poner(35, 4, 2); poner(36, 8, 2); bloque(28, 9, 29, 9, 5); poner(34, 10, 3);
    bloque(5, 5, 6, 6, 3); poner(8, 4, 2); poner(3, 8, 2); poner(9, 9, 2); bloque(10, 9, 11, 9, 5); poner(3, 10, 3);
    poner(16, 14, 2); poner(23, 13, 3); poner(22, 15, 2); poner(14, 16, 2);
    poner(14, 30, 2); poner(23, 30, 2); poner(15, 2, 3); poner(24, 2, 3);
    bloque(32, 25, 33, 26, 4); poner(35, 15, 2); poner(32, 18, 2);
    poner(4, 26, 2); poner(7, 16, 3); poner(4, 14, 2);
    poner(18, 20, 2); poner(21, 25, 3); bloque(18, 14, 21, 14, 3);
    poner(26, 18, 3); poner(29, 19, 2); poner(12, 24, 2);

    const c = (x, z) => ({ x: (x + .5) * CELL, z: (z + .5) * CELL });
    return {
      W, H, CELL, h, tipo, zona, nombre: 'Puerto',
      spawns: [
        [c(16, 31), c(18, 32), c(20, 31), c(22, 32), c(24, 31), c(17, 33), c(21, 33)],   // Asalto
        [c(16, 3), c(18, 2), c(20, 3), c(22, 2), c(23, 4), c(17, 4), c(21, 1)],          // Guardia
      ],
      sitios: { A: { x0: 28, z0: 2, x1: 37, z1: 11, ...c(33, 7), zona: 3 }, B: { x0: 2, z0: 2, x1: 11, z1: 11, ...c(6, 8), zona: 4 } },
      // posiciones para cubrir cada sitio (Guardia) y rutas de ataque (Asalto)
      vigilar: { A: [c(30, 4), c(36, 10), c(34, 3), c(28, 6), c(29, 13)], B: [c(3, 4), c(9, 10), c(10, 3), c(11, 7), c(10, 13)] },
      rutas: { A: [[c(33, 27), c(33, 16)], [c(20, 22), c(27, 13)], [c(20, 22), c(25, 19), c(33, 16)]], B: [[c(5, 27), c(5, 15)], [c(20, 22), c(11, 13)], [c(20, 25), c(10, 23), c(5, 16)]] },
      medio: c(20, 14),
    };
  }

  const celda = (m, x, z) => { const cx = Math.floor(x / m.CELL), cz = Math.floor(z / m.CELL); return (cx < 0 || cz < 0 || cx >= m.W || cz >= m.H) ? -1 : cz * m.W + cx; };
  const altura = (m, cx, cz) => (cx < 0 || cz < 0 || cx >= m.W || cz >= m.H) ? 99 : m.h[cz * m.W + cx];
  const zonaEn = (m, x, z) => { const i = celda(m, x, z); return i < 0 ? 0 : m.zona[i]; };

  // ¿choca un jugador parado en (x, z) con los pies a la altura y?
  function choca(m, x, z, y) {
    const C = m.CELL, x0 = Math.floor((x - R) / C), x1 = Math.floor((x + R) / C), z0 = Math.floor((z - R) / C), z1 = Math.floor((z + R) / C);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) if (altura(m, cx, cz) > y + 0.02) return true;
    return false;
  }
  // piso más alto debajo del jugador al que puede subir
  function piso(m, x, z, y) {
    const C = m.CELL, x0 = Math.floor((x - R) / C), x1 = Math.floor((x + R) / C), z0 = Math.floor((z - R) / C), z1 = Math.floor((z + R) / C);
    let top = 0;
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) { const a = altura(m, cx, cz); if (a <= y + ESCALON + 0.01 && a > top) top = a; }
    return top;
  }
  /* mueve un cuerpo {x,y,z,vx,vy,vz,suelo}. deseo = velocidad horizontal buscada. */
  function mover(m, b, dx, dz, dt, saltar) {
    const k = b.suelo ? Math.min(1, 14 * dt) : Math.min(1, 2.2 * dt);
    b.vx += (dx - b.vx) * k; b.vz += (dz - b.vz) * k;
    if (saltar && b.suelo) { b.vy = SALTO; b.suelo = false; }
    b.vy -= G * dt;
    // horizontal, un eje a la vez (deja deslizar contra las paredes)
    let nx = b.x + b.vx * dt;
    if (!choca(m, nx, b.z, b.y)) b.x = nx;
    else if (b.suelo && !choca(m, nx, b.z, b.y + ESCALON)) { b.x = nx; b.y = Math.max(b.y, piso(m, nx, b.z, b.y)); }
    else b.vx = 0;
    let nz = b.z + b.vz * dt;
    if (!choca(m, b.x, nz, b.y)) b.z = nz;
    else if (b.suelo && !choca(m, b.x, nz, b.y + ESCALON)) { b.z = nz; b.y = Math.max(b.y, piso(m, b.x, nz, b.y)); }
    else b.vz = 0;
    // vertical
    const top = piso(m, b.x, b.z, b.y);
    const ny = b.y + b.vy * dt;
    if (ny <= top) { b.y = top; b.vy = 0; b.suelo = true; }
    else { b.y = ny; b.suelo = ny - top < 0.04 && b.vy <= 0; }
    return b;
  }

  /* rayo contra el mapa: devuelve la distancia al primer choque (Infinity si no choca antes de max) */
  const golpe = { t: 0, nx: 0, ny: 0, nz: 0 };
  function rayo(m, ox, oy, oz, dx, dy, dz, max) {
    const C = m.CELL;
    let cx = Math.floor(ox / C), cz = Math.floor(oz / C);
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(C / dx) : Infinity, tdz = dz !== 0 ? Math.abs(C / dz) : Infinity;
    let tmx = dx !== 0 ? ((dx > 0 ? (cx + 1) * C - ox : ox - cx * C) / Math.abs(dx)) : Infinity;
    let tmz = dz !== 0 ? ((dz > 0 ? (cz + 1) * C - oz : oz - cz * C) / Math.abs(dz)) : Infinity;
    const tPiso = dy < 0 ? -oy / dy : Infinity;
    let t0 = 0, eje = -1;
    for (let n = 0; n < 200; n++) {
      const t1 = Math.min(tmx, tmz, max);
      const hc = altura(m, cx, cz);
      if (hc > 0) {
        const y0 = oy + dy * t0, y1 = oy + dy * t1;
        if (y0 < hc) { golpe.t = t0; golpe.nx = eje === 0 ? -sx : 0; golpe.nz = eje === 1 ? -sz : 0; golpe.ny = eje < 0 ? 1 : 0; if (eje < 0) { golpe.nx = -dx; golpe.nz = -dz; } return golpe; }
        if (y1 < hc && dy < 0) { golpe.t = (hc - oy) / dy; golpe.nx = 0; golpe.ny = 1; golpe.nz = 0; return golpe; }
      }
      if (tPiso >= t0 && tPiso <= t1) { golpe.t = tPiso; golpe.nx = 0; golpe.ny = 1; golpe.nz = 0; return golpe; }
      if (t1 >= max) break;
      t0 = t1;
      if (tmx < tmz) { cx += sx; tmx += tdx; eje = 0; } else { cz += sz; tmz += tdz; eje = 1; }
    }
    golpe.t = Infinity; return golpe;
  }
  function libre(m, ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz) || 1e-6;
    return rayo(m, ax, ay, az, dx / d, dy / d, dz / d, d).t >= d - 0.05;
  }

  /* ───── caminos (A* en la grilla, para los bots) ───── */
  function caminable(m, cx, cz) { return cx >= 0 && cz >= 0 && cx < m.W && cz < m.H && m.h[cz * m.W + cx] === 0; }
  function camino(m, ax, az, bx, bz) {
    const C = m.CELL, Wm = m.W;
    let sx = Math.floor(ax / C), sz = Math.floor(az / C), tx = Math.floor(bx / C), tz = Math.floor(bz / C);
    const cerca = (x, z) => { if (caminable(m, x, z)) return [x, z]; for (let r = 1; r < 4; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (caminable(m, x + dx, z + dz)) return [x + dx, z + dz]; return [x, z]; };
    [sx, sz] = cerca(sx, sz); [tx, tz] = cerca(tx, tz);
    const N = m.W * m.H, g = new Float32Array(N).fill(Infinity), de = new Int32Array(N).fill(-1), cerrado = new Uint8Array(N);
    const s = sz * Wm + sx, t = tz * Wm + tx;
    const abiertos = [s]; g[s] = 0; const f = new Float32Array(N).fill(Infinity); f[s] = Math.hypot(tx - sx, tz - sz);
    while (abiertos.length) {
      let bi = 0; for (let i = 1; i < abiertos.length; i++) if (f[abiertos[i]] < f[abiertos[bi]]) bi = i;
      const cur = abiertos[bi]; abiertos[bi] = abiertos[abiertos.length - 1]; abiertos.pop();
      if (cur === t) break;
      if (cerrado[cur]) continue; cerrado[cur] = 1;
      const cx = cur % Wm, cz = (cur / Wm) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue; const nx = cx + dx, nz = cz + dz;
        if (!caminable(m, nx, nz)) continue;
        if (dx && dz && (!caminable(m, cx + dx, cz) || !caminable(m, cx, cz + dz))) continue;
        const ni = nz * Wm + nx, ng = g[cur] + (dx && dz ? 1.414 : 1);
        if (ng < g[ni]) { g[ni] = ng; de[ni] = cur; f[ni] = ng + Math.hypot(tx - nx, tz - nz); abiertos.push(ni); }
      }
    }
    if (de[t] < 0 && s !== t) return null;
    const pts = []; for (let i = t; i !== -1 && i !== s; i = de[i]) pts.push(i); pts.reverse();
    // suaviza: saltea puntos si se ve el siguiente sin tocar paredes (con margen para el cuerpo)
    const w = pts.map(i => ({ x: (i % Wm + .5) * C, z: (((i / Wm) | 0) + .5) * C }));
    w.push({ x: bx, z: bz }); if (!caminable(m, Math.floor(bx / C), Math.floor(bz / C))) w.pop();
    const out = []; let px = ax, pz = az, k = 0;
    while (k < w.length) {
      let j = w.length - 1;
      for (; j > k; j--) if (pasilloLibre(m, px, pz, w[j].x, w[j].z)) break;
      out.push(w[j]); px = w[j].x; pz = w[j].z; k = j + 1;
    }
    return out;
  }
  function pasilloLibre(m, ax, az, bx, bz) {
    for (const o of [[0, 0], [R + .1, 0], [-R - .1, 0], [0, R + .1], [0, -R - .1]]) if (!libre(m, ax + o[0], 0.5, az + o[1], bx + o[0], 0.5, bz + o[1])) return false;
    return true;
  }

  Object.assign(Ops, { CELL, PARED, R, ALTO, ALTO_AG, OJO, OJO_AG, G, SALTO, crearMapa, celda, zonaEn, choca, piso, mover, rayo, libre, camino });
})();
