/* GonzaCraft — bloques y texturas. Todas las texturas se dibujan por código (arte original). */
(function () {
  'use strict';
  const GC = window.GC;
  const TS = 16, COLS = 16, ROWS = 4;

  /* id: { n: nombre, t: [arriba, abajo, costado], solid, op (opaco), kind, h (dureza), drop, light, mat (sonido) } */
  const B = [];
  const def = (id, n, t, o = {}) => { B[id] = Object.assign({ id, n, t: Array.isArray(t) ? t : [t, t, t], solid: 1, op: 1, kind: 'cube', h: 1, drop: id, light: 0, mat: 'stone' }, o); };
  B[0] = { id: 0, n: 'Aire', solid: 0, op: 0, kind: 'air' };
  def(1, 'Pasto', [0, 2, 1], { h: .6, drop: 2, mat: 'grass' });
  def(2, 'Tierra', 2, { h: .5, mat: 'dirt' });
  def(3, 'Piedra', 3, { h: 1.5, drop: 4 });
  def(4, 'Roca', 4, { h: 2 });
  def(5, 'Arena', 5, { h: .5, mat: 'sand' });
  def(6, 'Grava', 6, { h: .6, mat: 'dirt' });
  def(7, 'Tronco', [8, 8, 7], { h: 2, mat: 'wood' });
  def(8, 'Hojas', 9, { h: .2, op: 0, mat: 'grass' });
  def(9, 'Tablas', 10, { h: 2, mat: 'wood' });
  def(10, 'Vidrio', 11, { h: .3, op: 0, mat: 'glass' });
  def(11, 'Agua', 12, { solid: 0, op: 0, kind: 'water', h: Infinity, mat: 'water' });
  def(12, 'Pasto nevado', [13, 2, 14], { h: .6, mat: 'sand' });
  def(13, 'Hielo', 15, { h: .5, mat: 'glass' });
  def(14, 'Cactus', [17, 17, 16], { h: .4, mat: 'grass' });
  def(15, 'Carbón', 18, { h: 3 });
  def(16, 'Hierro', 19, { h: 3 });
  def(17, 'Oro', 20, { h: 3 });
  def(18, 'Diamante', 21, { h: 3 });
  def(19, 'Lecho de roca', 22, { h: Infinity });
  def(20, 'Ladrillos', 23, { h: 2 });
  def(21, 'Arenisca', [25, 25, 24], { h: .8 });
  def(22, 'Tronco de abedul', [27, 27, 26], { h: 2, mat: 'wood' });
  def(23, 'Hojas de abedul', 28, { h: .2, op: 0, mat: 'grass' });
  def(24, 'Lámpara', 29, { h: .3, light: 1, mat: 'glass' });
  def(25, 'Flor roja', 30, { solid: 0, op: 0, kind: 'cross', h: 0, mat: 'grass' });
  def(26, 'Flor amarilla', 31, { solid: 0, op: 0, kind: 'cross', h: 0, mat: 'grass' });
  def(27, 'Pasto alto', 32, { solid: 0, op: 0, kind: 'cross', h: 0, mat: 'grass' });
  const WOOL = [['blanca', [235, 235, 235]], ['roja', [180, 45, 40]], ['naranja', [230, 125, 40]], ['amarilla', [235, 200, 50]], ['verde', [90, 160, 45]], ['azul', [50, 80, 175]], ['violeta', [130, 60, 170]], ['negra', [35, 35, 40]]];
  WOOL.forEach(([n], i) => def(28 + i, 'Lana ' + n, 33 + i, { h: .8, mat: 'grass' }));
  def(36, 'Obsidiana', 41, { h: 8 });
  def(37, 'Estantería', [10, 10, 42], { h: 1.5, mat: 'wood' });
  def(38, 'Calabaza', [44, 44, 43], { h: 1, mat: 'wood' });
  def(39, 'Musgo', 45, { h: 2 });
  const NB = B.length;
  /* Lo que aparece en el inventario creativo */
  const PALETTE = [1, 2, 3, 4, 39, 5, 6, 21, 7, 22, 9, 8, 23, 10, 13, 12, 14, 20, 24, 37, 38, 36, 15, 16, 17, 18, 19, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35];

  /* ── texturas ── */
  const W = TS * COLS, H = TS * ROWS;
  const img = new Uint8ClampedArray(W * H * 4);
  let tile = 0;
  const put = (x, y, r, g, b, a = 255) => { if (x < 0 || y < 0 || x >= TS || y >= TS) return; const tx = (tile % COLS) * TS + x, ty = Math.floor(tile / COLS) * TS + y, i = (ty * W + tx) * 4; img[i] = r; img[i + 1] = g; img[i + 2] = b; img[i + 3] = a; };
  const R = GC.rng(1234567);
  const jit = (c, v) => { const d = (R() * 2 - 1) * v; return [c[0] + d, c[1] + d, c[2] + d]; };
  const fill = (c, v, a = 255) => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) put(x, y, ...jit(c, v), a); };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const specks = (c, n, size = 1) => { for (let k = 0; k < n; k++) { const x = Math.floor(R() * TS), y = Math.floor(R() * TS); for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) put(x + dx, y + dy, ...jit(c, 12)); } };
  const P = {}; // painters
  P.dirt = () => { fill([134, 96, 67], 16); specks([100, 70, 48], 18); specks([160, 120, 85], 8); };
  P.stone = () => { fill([126, 126, 126], 10); for (let k = 0; k < 6; k++) { const x = R() * TS | 0, y = R() * TS | 0, l = 2 + R() * 4 | 0; for (let i = 0; i < l; i++) put(x + i, y, ...jit([104, 104, 104], 6)); } };
  P.grassTop = () => { fill([94, 157, 52], 18); specks([76, 132, 40], 20); specks([116, 178, 66], 10); };
  P.side = top => { P.dirt(); for (let x = 0; x < TS; x++) { const d = 3 + (R() < .5 ? 1 : 0) + (R() < .2 ? 1 : 0); for (let y = 0; y < d; y++) put(x, y, ...jit(top, 14)); } };
  P.cells = (base, mortar, n) => {
    const cs = Array.from({ length: n }, () => [R() * TS, R() * TS, (R() * 2 - 1) * 18]);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      let d1 = 1e9, d2 = 1e9, c1 = null;
      for (const c of cs) for (const ox of [-TS, 0, TS]) for (const oy of [-TS, 0, TS]) { const d = Math.hypot(x - c[0] - ox, y - c[1] - oy); if (d < d1) { d2 = d1; d1 = d; c1 = c; } else if (d < d2) d2 = d; }
      if (d2 - d1 < 1.1) put(x, y, ...jit(mortar, 6)); else put(x, y, ...jit([base[0] + c1[2], base[1] + c1[2], base[2] + c1[2]], 8));
    }
  };
  P.leaves = (c) => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { if (R() < .17) put(x, y, 0, 0, 0, 0); else put(x, y, ...jit(c, 26)); } };
  P.logTop = (bark, a, b) => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); if (d > 6.6) put(x, y, ...jit(bark, 10)); else put(x, y, ...jit(Math.floor(d) % 2 ? a : b, 6)); } };
  P.ore = c => { P.stone(); for (let k = 0; k < 4; k++) { const x = 1 + R() * 12 | 0, y = 1 + R() * 12 | 0; for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1]]) if (R() < .85) put(x + dx, y + dy, ...jit(c, 14)); } };
  P.cross = fn => { for (let i = 0; i < TS * TS; i++) put(i % TS, i / TS | 0, 0, 0, 0, 0); fn(); };
  P.flower = (pet, mid) => P.cross(() => {
    for (let y = 8; y < 16; y++) put(7, y, 60, 130, 40); put(6, 11, 70, 150, 45); put(5, 10, 70, 150, 45); put(8, 13, 70, 150, 45); put(9, 12, 70, 150, 45);
    for (let y = 2; y < 9; y++) for (let x = 4; x < 11; x++) { const d = Math.hypot(x - 7, y - 5); if (d < 3.2) put(x, y, ...jit(d < 1.2 ? mid : pet, 14)); }
  });
  const T = [
    P.grassTop, () => P.side([94, 157, 52]), P.dirt, P.stone,
    () => P.cells([118, 118, 118], [72, 72, 72], 7), () => { fill([219, 207, 163], 10); specks([200, 186, 140], 14); },
    () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) put(x, y, ...jit([[136, 126, 126], [110, 104, 104], [152, 142, 136], [96, 90, 88]][R() * 4 | 0], 6)); },
    () => { for (let x = 0; x < TS; x++) { const o = (R() * 2 - 1) * 14; for (let y = 0; y < TS; y++) put(x, y, ...jit([102 + o, 79 + o, 48 + o], 7)); } },
    () => P.logTop([102, 79, 48], [176, 140, 88], [154, 120, 72]), () => P.leaves([58, 128, 38]),
    () => { for (let y = 0; y < TS; y++) { const seam = (y >> 2) * 5 % TS; for (let x = 0; x < TS; x++) put(x, y, ...(y % 4 === 3 || x === seam ? jit([118, 92, 54], 5) : jit([166, 132, 80], 9))); } },
    () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const edge = x === 0 || y === 0 || x === 15 || y === 15; const streak = (x - y === 4 || x - y === 5 || x - y === -7) && x > 2 && x < 13; put(x, y, 215, 235, 245, edge ? 255 : streak ? 180 : 0); } },
    () => fill([48, 96, 210], 12), () => { fill([240, 246, 250], 5); specks([222, 232, 240], 10); },
    () => P.side([240, 246, 250]), () => { fill([156, 196, 245], 8); for (let k = 0; k < 3; k++) { let x = R() * TS | 0, y = R() * TS | 0; for (let i = 0; i < 6; i++) { put(x, y, 215, 235, 255); x += R() < .5 ? 1 : 0; y += 1; } } },
    () => { fill([46, 128, 50], 10); for (const x of [2, 6, 10, 13]) for (let y = 0; y < TS; y++) put(x, y, ...jit([30, 96, 36], 6)); for (let k = 0; k < 8; k++) put(R() * TS | 0, R() * TS | 0, 225, 225, 185); },
    () => { P.logTop([46, 128, 50], [80, 160, 72], [66, 146, 60]); },
    () => P.ore([28, 28, 30]), () => P.ore([216, 172, 140]), () => P.ore([250, 212, 64]), () => P.ore([92, 232, 228]),
    () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) put(x, y, ...jit([[50, 50, 50], [80, 80, 82], [34, 34, 36], [100, 100, 100]][R() * 4 | 0], 8)); },
    () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const row = y >> 2, off = row % 2 ? 4 : 0; const mortar = y % 4 === 3 || (x + off) % 8 === 7; put(x, y, ...(mortar ? jit([196, 186, 176], 6) : jit([156, 72, 56], 14))); } },
    () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) put(x, y, ...jit(y < 3 ? [230, 218, 168] : y > 12 ? [196, 182, 128] : (y % 4 === 0 ? [206, 192, 138] : [218, 205, 152]), 6)); },
    () => fill([224, 212, 162], 6),
    () => { fill([224, 224, 214], 8); for (let k = 0; k < 7; k++) { const x = R() * 14 | 0, y = R() * TS | 0, l = 1 + R() * 3 | 0; for (let i = 0; i < l; i++) put(x + i, y, 40, 40, 40); } },
    () => P.logTop([224, 224, 214], [200, 170, 120], [184, 154, 104]), () => P.leaves([112, 162, 62]),
    () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const e = x === 0 || y === 0 || x === 15 || y === 15 || x === 1 || y === 1 || x === 14 || y === 14; const d = Math.hypot(x - 7.5, y - 7.5); put(x, y, ...(e ? jit([110, 84, 50], 8) : jit(mix([255, 238, 170], [240, 180, 70], d / 8), 6))); } },
    () => P.flower([214, 40, 44], [250, 220, 60]), () => P.flower([250, 214, 40], [230, 120, 30]),
    () => P.cross(() => { for (let k = 0; k < 9; k++) { let x = 1 + R() * 13, h = 6 + R() * 8 | 0; const lean = (R() * 2 - 1) * .25, c = [60 + R() * 40, 130 + R() * 50, 40]; for (let i = 0; i < h; i++) { put(Math.round(x), 15 - i, ...c); x += lean; } } }),
    ...WOOL.map(([, c]) => () => { fill(c, 7); for (let y = 0; y < TS; y += 4) for (let x = (y >> 2) % 2 * 2; x < TS; x += 4) put(x, y, ...jit(mix(c, [0, 0, 0], .12), 4)); }),
    () => { fill([24, 18, 36], 8); specks([60, 40, 90], 10); },
    () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const shelf = y === 0 || y === 7 || y === 8 || y === 15; if (shelf) put(x, y, ...jit([166, 132, 80], 8)); else { const book = x >> 1; const cs = [[150, 40, 40], [50, 70, 150], [60, 120, 60], [190, 160, 70], [110, 50, 120], [40, 40, 40], [160, 90, 40], [70, 120, 140]]; put(x, y, ...jit(cs[(book + (y > 7 ? 3 : 0)) % 8], 6)); } } },
    () => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) put(x, y, ...jit(x % 4 === 0 ? [196, 104, 20] : [226, 132, 28], 8)); for (const [x, y] of [[4, 5], [5, 5], [10, 5], [11, 5], [7, 8], [8, 8], [4, 11], [5, 12], [6, 12], [7, 12], [8, 12], [9, 12], [10, 12], [11, 11]]) put(x, y, 60, 30, 8); },
    () => { P.logTop([226, 132, 28], [200, 110, 20], [214, 122, 24]); for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) put(x, y, 90, 120, 40); },
    () => { P.cells([110, 110, 110], [70, 70, 70], 7); specks([70, 130, 50], 26, 1); },
  ];
  T.forEach((fn, i) => { tile = i; fn(); });

  const atlas = document.createElement('canvas'); atlas.width = W; atlas.height = H;
  atlas.getContext('2d').putImageData(new ImageData(img, W, H), 0, 0);
  const uvOf = t => { const u = (t % COLS) * TS, v = Math.floor(t / COLS) * TS, e = 0.12; return [(u + e) / W, 1 - (v + TS - e) / H, (u + TS - e) / W, 1 - (v + e) / H]; };
  const UV = []; for (let t = 0; t < T.length; t++) UV[t] = uvOf(t);

  /* textura de agua (se repite y se mueve) */
  const water = document.createElement('canvas'); water.width = water.height = 32;
  { const c = water.getContext('2d'), d = c.createImageData(32, 32), r = GC.rng(99); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const w = Math.sin((x + y * .6) * .55) * .5 + Math.sin((x * .7 - y) * .35) * .5, i = (y * 32 + x) * 4, v = (r() * 2 - 1) * 6; d.data[i] = 40 + w * 14 + v; d.data[i + 1] = 92 + w * 20 + v; d.data[i + 2] = 205 + w * 24 + v; d.data[i + 3] = 255; } c.putImageData(d, 0, 0); }

  /* íconos isométricos para el inventario */
  const icons = {};
  function icon(id) {
    if (icons[id]) return icons[id];
    const d = B[id], c = document.createElement('canvas'); c.width = c.height = 48; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    const src = t => [(t % COLS) * TS, Math.floor(t / COLS) * TS];
    if (d.kind === 'cross') { const [sx, sy] = src(d.t[0]); g.drawImage(atlas, sx, sy, TS, TS, 8, 8, 32, 32); }
    else {
      const k = 1 / 16, face = (t, m, shade) => { const [sx, sy] = src(t); g.setTransform(...m); g.drawImage(atlas, sx, sy, TS, TS, 0, 0, TS, TS); if (shade) { g.fillStyle = `rgba(0,0,0,${shade})`; g.fillRect(0, 0, TS, TS); } };
      face(d.t[0], [20 * k, -10 * k, 20 * k, 10 * k, 4, 14], 0);
      face(d.t[2], [20 * k, 10 * k, 0, 22 * k, 4, 14], .22);
      face(d.t[2], [20 * k, -10 * k, 0, 22 * k, 24, 24], .4);
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    return (icons[id] = c.toDataURL());
  }

  Object.assign(GC, { B, NB, PALETTE, UV, atlasCanvas: atlas, waterCanvas: water, icon, TILES: T.length });
})();
