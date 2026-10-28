/* Trazo — editor vectorial en el navegador, sobre paper.js. */
(() => {
'use strict';
const { $, $$, clamp, esc, el, icon, toast, busy, download, pickFiles, readAsDataURL, store, safeName, history, loadScript } = T;
const P = window.paper;
if (!P) { document.body.insertAdjacentHTML('beforeend', '<div class="modal"><div class="sheet"><h3>No se pudo cargar el motor vectorial</h3><p>Revisá tu conexión a internet y recargá la página.</p></div></div>'); return; }

const cv = $('#cv'), vp = $('#vp');
P.setup(cv);
P.settings.handleSize = 8;
const board = { w: 1080, h: 1080, bg: '#ffffff', name: 'Sin título' };
let boardLayer = new P.Layer({ name: 'board' });
let content = new P.Layer({ name: 'content' });
let ui = new P.Layer({ name: 'ui' });
content.activate();
const style = { fillOn: true, fill: '#9d83ff', strokeOn: false, stroke: '#1d1a2e', strokeWidth: 4, font: 'Bricolage Grotesque', radius: 0, sides: 6, points: 5 };
let showGrid = false, snapOn = true;
const FONTS = ['Bricolage Grotesque', 'Figtree', 'Anton', 'Bebas Neue', 'Playfair Display', 'Instrument Serif', 'Pacifico', 'JetBrains Mono', 'Arial', 'Georgia'];
const BLENDS = [['normal', 'Normal'], ['multiply', 'Multiplicar'], ['screen', 'Trama'], ['overlay', 'Superponer'], ['darken', 'Oscurecer'], ['lighten', 'Aclarar'], ['difference', 'Diferencia'], ['soft-light', 'Luz suave'], ['hard-light', 'Luz fuerte'], ['color', 'Color'], ['luminosity', 'Luminosidad']];
const z = () => P.view.zoom;

/* ---------- mesa de trabajo ---------- */
function drawBoard() {
  boardLayer.removeChildren();
  const r = new P.Path.Rectangle({ rectangle: [0, 0, board.w, board.h], insert: false });
  r.fillColor = board.bg === 'transparent' ? '#e9e9ee' : board.bg;
  r.name = 'artboard'; r.locked = true;
  boardLayer.addChild(r);
  if (board.bg === 'transparent') {
    const t = new P.PointText({ point: [8, -10], content: 'Fondo transparente', fontSize: 14, fillColor: '#8a91a0', insert: false });
    t.locked = true; boardLayer.addChild(t);
  }
  boardLayer.sendToBack(); drawUI();
}

/* ---------- vista ---------- */
function resize() {
  const r = vp.getBoundingClientRect(); if (!r.width) return;
  P.view.viewSize = new P.Size(r.width, r.height);
  drawUI();
}
let fitted = false;
new ResizeObserver(() => { resize(); if (!fitted) fit(); }).observe(vp);
function fit() {
  const r = vp.getBoundingClientRect(); if (!r.width) return;
  P.view.zoom = Math.max(.05, Math.min((r.width - 60) / board.w, (r.height - 60) / board.h, 4));
  P.view.center = new P.Point(board.w / 2, board.h / 2);
  fitted = true; updZoom(); drawUI();
}
function zoomAt(nz, vpt) {
  const r = vp.getBoundingClientRect(); vpt = vpt || new P.Point(r.width / 2, r.height / 2);
  const p = P.view.viewToProject(vpt);
  P.view.zoom = clamp(nz, .05, 50);
  const p2 = P.view.viewToProject(vpt);
  P.view.center = P.view.center.add(p.subtract(p2));
  updZoom(); drawUI();
}
function updZoom() { $('#zoomLbl').textContent = Math.round(z() * 100) + '%'; }
function evPoint(e) { const r = cv.getBoundingClientRect(); return P.view.viewToProject(new P.Point(e.clientX - r.left, e.clientY - r.top)); }

/* ---------- historial y guardado ---------- */
const H = history(60);
const snapshot = () => JSON.stringify({ board: { ...board }, content: content.exportJSON({ asString: false }) });
function restore(s) {
  const o = JSON.parse(s);
  Object.assign(board, o.board);
  content.remove(); content = new P.Layer({ name: 'content' }); content.importJSON(o.content);
  ui.bringToFront(); content.activate();
  $('#docName').value = board.name || 'Sin título';
  pen = null; sel = []; drawBoard(); afterChange(true);
}
function pushUndo(pre) { H.push(pre || snapshot()); updUndo(); }
function undo() { if (pen) finishPen(); const s = H.undo(snapshot()); if (s) restore(s); updUndo(); }
function redo() { const s = H.redo(snapshot()); if (s) restore(s); updUndo(); }
function updUndo() { $('#undoBtn').disabled = !H.canUndo; $('#redoBtn').disabled = !H.canRedo; }
let saveT = null;
function afterChange(structure) {
  if (structure) { sel = sel.filter(i => i.isInserted && i.isInserted()); renderLayers(); }
  renderProps(); drawUI();
  clearTimeout(saveT); $('#savedLbl').textContent = 'Guardando…';
  saveT = setTimeout(async () => { try { await store.set('trazo:doc', snapshot()); $('#savedLbl').textContent = 'Guardado'; } catch (e) { $('#savedLbl').textContent = 'Sin guardado automático'; } }, 1500);
}

/* ---------- selección ---------- */
let sel = [];
const isContent = it => { let p = it; while (p && p.parent) { if (p.parent === content) return true; p = p.parent; } return false; };
function topLevel(it) { while (it && it.parent && it.parent !== content) it = it.parent; return it && it.parent === content ? it : null; }
function setSel(items) {
  sel = [...new Set(items.filter(Boolean))].filter(i => !i.locked);
  P.project.deselectAll();
  if (tool === 'direct') sel.forEach(i => { if (i instanceof P.Path || i instanceof P.CompoundPath) i.fullySelected = false, i.selected = true; });
  renderProps(); renderLayers(); drawUI();
}
function selBounds() { if (!sel.length) return null; let b = sel[0].bounds.clone(); for (let i = 1; i < sel.length; i++) b = b.unite(sel[i].bounds); return b; }
function hit(p, opts = {}) {
  return P.project.hitTest(p, Object.assign({ fill: true, stroke: true, tolerance: 6 / z(), match: h => isContent(h.item) && !h.item.locked && h.item.visible }, opts));
}
function handleAt(p) {
  if (!sel.length || tool !== 'select') return null;
  const b = selBounds(), t = 9 / z();
  const corners = [b.topLeft, b.topRight, b.bottomRight, b.bottomLeft];
  const rot = b.topCenter.subtract([0, 26 / z()]);
  if (rot.getDistance(p) < t) return { type: 'rotate' };
  const i = corners.findIndex(c => c.getDistance(p) < t);
  if (i >= 0) return { type: 'scale', corner: corners[i], anchor: corners[(i + 2) % 4] };
  return null;
}

/* ---------- capa de interfaz (manijas, guías, cuadrícula) ---------- */
let guides = [];
function drawUI() {
  ui.removeChildren(); ui.activate();
  const zz = z(), acc = new P.Color('#9d83ff');
  if (showGrid) {
    const step = board.w >= 2000 ? 100 : 50;
    for (let x = step; x < board.w; x += step) new P.Path.Line({ from: [x, 0], to: [x, board.h], strokeColor: new P.Color(0, 0, 0, .08), strokeWidth: 1 / zz });
    for (let y = step; y < board.h; y += step) new P.Path.Line({ from: [0, y], to: [board.w, y], strokeColor: new P.Color(0, 0, 0, .08), strokeWidth: 1 / zz });
  }
  guides.forEach(g => new P.Path.Line({ from: g[0], to: g[1], strokeColor: '#ff4fa3', strokeWidth: 1 / zz, dashArray: [4 / zz, 3 / zz] }));
  if (sel.length && tool === 'select') {
    const b = selBounds();
    new P.Path.Rectangle({ rectangle: b, strokeColor: acc, strokeWidth: 1.2 / zz });
    if (sel.length > 1) sel.forEach(i => new P.Path.Rectangle({ rectangle: i.bounds, strokeColor: new P.Color(.6, .5, 1, .5), strokeWidth: 1 / zz }));
    const rot = b.topCenter.subtract([0, 26 / zz]);
    new P.Path.Line({ from: b.topCenter, to: rot, strokeColor: acc, strokeWidth: 1.2 / zz });
    new P.Path.Circle({ center: rot, radius: 5 / zz, fillColor: acc, strokeColor: '#fff', strokeWidth: 1.2 / zz });
    [b.topLeft, b.topRight, b.bottomRight, b.bottomLeft].forEach(c => new P.Path.Rectangle({ rectangle: new P.Rectangle(c.subtract(4.5 / zz), new P.Size(9 / zz, 9 / zz)), fillColor: '#fff', strokeColor: acc, strokeWidth: 1.2 / zz }));
  }
  if (act && act.type === 'marquee' && act.rect) new P.Path.Rectangle({ rectangle: act.rect, strokeColor: acc, fillColor: new P.Color(.6, .5, 1, .1), strokeWidth: 1 / zz, dashArray: [4 / zz, 3 / zz] });
  if (pen && penPreview && pen.path.lastSegment) new P.Path.Line({ from: pen.path.lastSegment.point, to: penPreview, strokeColor: acc, strokeWidth: 1 / zz, dashArray: [4 / zz, 3 / zz] });
  if (pen && pen.path.firstSegment && pen.path.segments.length > 1 && penPreview && pen.path.firstSegment.point.getDistance(penPreview) < 9 / zz) new P.Path.Circle({ center: pen.path.firstSegment.point, radius: 7 / zz, strokeColor: acc, strokeWidth: 2 / zz });
  content.activate();
}

/* ---------- herramientas ---------- */
const TOOLS = [
  ['select', 'Selección', 'V', '<path d="M5 3l14 8-6 2-3 6z"/>'],
  ['direct', 'Selección directa (nodos)', 'A', '<path d="M5 3l14 8-6 2-3 6z" fill="currentColor"/>'],
  ['pen', 'Pluma', 'P', '<path d="M12 19l7-7 3 3-7 7zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18zM2 2l7.6 7.6"/><circle cx="11" cy="11" r="2"/>'],
  ['pencil', 'Lápiz', 'N', '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>'],
  ['rect', 'Rectángulo', 'M', '<rect x="3" y="5" width="18" height="14" rx="1.5"/>'],
  ['ellipse', 'Elipse', 'L', '<ellipse cx="12" cy="12" rx="9" ry="7"/>'],
  ['polygon', 'Polígono', 'Y', '<path d="M12 3l8 6-3 10H7L4 9z"/>'],
  ['star', 'Estrella', 'S', '<path d="m12 3 2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 17l-5.6 3 1.3-6.2L3 9.5l6.3-.7z"/>'],
  ['line', 'Línea', 'K', '<path d="M4 20 20 4"/>'],
  ['text', 'Texto', 'T', '<path d="M5 5h14M12 5v15M9 20h6"/>'],
  ['picker', 'Cuentagotas', 'I', '<path d="m2 22 1-4 9-9 3 3-9 9zM14 4l6 6M16.5 2.5a2.1 2.1 0 0 1 3 3L17 8l-3-3z"/>'],
  ['hand', 'Mano', 'H', '<path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4L2.4 16a2 2 0 0 1 3-2.9L7 14.5"/>'],
  ['zoom', 'Zoom', 'Z', '<circle cx="11" cy="11" r="7"/><path d="m21 21-5-5M8 11h6M11 8v6"/>'],
];
const HINTS = {
  select: 'Clic para elegir, Mayús para sumar. Arrastrá las esquinas para escalar y el círculo para rotar.',
  direct: 'Arrastrá nodos y manijas. Doble clic en un nodo: curva ↔ esquina. Alt + clic en el borde: agregar nodo.',
  pen: 'Clic: esquina · clic y arrastrar: curva · clic en el primer punto: cerrar · Enter: terminar.',
  pencil: 'Dibujá a mano alzada. El trazo se suaviza al soltar.',
  rect: 'Arrastrá para dibujar. Mayús: cuadrado.', ellipse: 'Arrastrá para dibujar. Mayús: círculo.', polygon: 'Arrastrá desde el centro.', star: 'Arrastrá desde el centro.', line: 'Arrastrá. Mayús: ángulos de 45°.',
  text: 'Clic para escribir. Editá el texto en el panel Diseño.', picker: 'Clic en un objeto para copiar su estilo a la selección.',
  hand: 'Arrastrá para moverte. También: Espacio + arrastrar.', zoom: 'Clic para acercar, Alt + clic para alejar.',
};
let tool = 'select', act = null, pen = null, penPreview = null, spaceDown = false, clip = null;
function setTool(t) {
  if (pen && t !== 'pen') finishPen();
  tool = t; $$('.tool').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === t));
  vp.style.cursor = { hand: 'grab', zoom: 'zoom-in', text: 'text', select: 'default', direct: 'default' }[t] || 'crosshair';
  $('#stHint').textContent = HINTS[t] || '';
  setSel(sel);
}
$('#toolbar').innerHTML = TOOLS.map(([id, n, k, ic]) => `<button class="tool" data-tool="${id}" title="${n} (${k})" aria-label="${n}">${icon(ic)}<span class="k">${k}</span></button>`).join('');
$('#toolbar').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });

function applyNewStyle(it) {
  it.fillColor = style.fillOn ? style.fill : null;
  it.strokeColor = style.strokeOn ? style.stroke : null;
  it.strokeWidth = style.strokeWidth; it.strokeJoin = 'round'; it.strokeCap = 'round';
  if (!style.fillOn && !style.strokeOn) { it.strokeColor = style.stroke; it.strokeWidth = Math.max(1, style.strokeWidth); }
}
function makeShape(kind, a, b, shift) {
  let item;
  if (kind === 'rect') {
    let w = b.x - a.x, h = b.y - a.y; if (shift) { const s = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s; }
    const r = new P.Rectangle(a, a.add([w, h]));
    item = new P.Path.Rectangle({ rectangle: r, radius: Math.min(style.radius, r.width / 2, r.height / 2), insert: false }); item.data.kind = 'Rectángulo';
  } else if (kind === 'ellipse') {
    let w = b.x - a.x, h = b.y - a.y; if (shift) { const s = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s; }
    item = new P.Path.Ellipse({ rectangle: new P.Rectangle(a, a.add([w, h])), insert: false }); item.data.kind = 'Elipse';
  } else if (kind === 'polygon') {
    item = new P.Path.RegularPolygon({ center: a, sides: style.sides, radius: Math.max(1, a.getDistance(b)), insert: false }); item.rotate(b.subtract(a).angle + 90, a); item.data.kind = 'Polígono';
  } else if (kind === 'star') {
    const r = Math.max(1, a.getDistance(b));
    item = new P.Path.Star({ center: a, points: style.points, radius1: r, radius2: r * .45, insert: false }); item.rotate(b.subtract(a).angle + 90, a); item.data.kind = 'Estrella';
  } else if (kind === 'line') {
    let e = b; if (shift) { const v = b.subtract(a); const ang = Math.round(v.angle / 45) * 45; e = a.add(new P.Point({ length: v.length, angle: ang })); }
    item = new P.Path.Line({ from: a, to: e, insert: false }); item.data.kind = 'Línea';
    applyNewStyle(item); item.fillColor = null; item.strokeColor = style.strokeOn ? style.stroke : style.fill; item.strokeWidth = Math.max(2, style.strokeWidth);
    return item;
  }
  applyNewStyle(item);
  return item;
}
function finishPen() {
  if (!pen) return;
  const p = pen.path, pre = pen.pre; pen = null; penPreview = null;
  p.selected = false;
  if (p.segments.length < 2) p.remove();
  else { pushUndo(pre); p.data.kind = p.closed ? 'Forma' : 'Trazo'; setSel([p]); }
  afterChange(true);
}

/* ---------- puntero ---------- */
function snapMove(delta) {
  guides = [];
  if (!snapOn) return delta;
  const sb = selBounds(), b = new P.Rectangle(sb.point.add(delta), sb.size), t = 6 / z();
  let dx = 0, dy = 0;
  const xs = [[b.left, 0], [b.center.x, board.w / 2], [b.right, board.w]], ys = [[b.top, 0], [b.center.y, board.h / 2], [b.bottom, board.h]];
  const others = content.children.filter(i => !sel.includes(i) && i.visible);
  others.forEach(o => { xs.push([b.center.x, o.bounds.center.x], [b.left, o.bounds.left], [b.right, o.bounds.right]); ys.push([b.center.y, o.bounds.center.y], [b.top, o.bounds.top], [b.bottom, o.bounds.bottom]); });
  let bx = t, by = t;
  xs.forEach(([v, target]) => { const d = target - v; if (Math.abs(d) < bx) { bx = Math.abs(d); dx = d; guides[0] = [[target, -1e4], [target, 1e4]]; } });
  ys.forEach(([v, target]) => { const d = target - v; if (Math.abs(d) < by) { by = Math.abs(d); dy = d; guides[1] = [[-1e4, target], [1e4, target]]; } });
  guides = guides.filter(Boolean);
  return delta.add([dx, dy]);
}
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  if (e.button === 1 || spaceDown || tool === 'hand') { act = { type: 'pan', sx: e.clientX, sy: e.clientY, c: P.view.center.clone() }; vp.style.cursor = 'grabbing'; return; }
  if (e.button !== 0) return;
  const p = evPoint(e);
  switch (tool) {
    case 'select': {
      const h = handleAt(p);
      if (h) { act = { type: h.type, pre: snapshot(), last: p, ...h, b0: selBounds(), fx: 1, fy: 1, ang0: p.subtract(selBounds().center).angle, applied: 0 }; return; }
      const r = hit(p); const it = r && topLevel(r.item);
      if (it) {
        if (e.shiftKey) setSel(sel.includes(it) ? sel.filter(x => x !== it) : [...sel, it]);
        else if (!sel.includes(it)) setSel([it]);
        if (e.altKey && sel.length) { const pre = snapshot(); const copies = sel.map(i => { const c = i.clone(); return c; }); sel.forEach((i, k) => copies[k].insertAbove(i)); setSel(copies); act = { type: 'move', pre, last: p, moved: true }; }
        else act = { type: 'move', pre: snapshot(), last: p, moved: false };
      } else { if (!e.shiftKey) setSel([]); act = { type: 'marquee', p0: p, add: e.shiftKey }; }
      break;
    }
    case 'direct': {
      const r = hit(p, { segments: true, handles: true });
      if (!r) { setSel([]); act = { type: 'marquee', p0: p, add: false }; break; }
      const item = r.item;
      if (!sel.includes(item)) setSel([item]);
      const pre = snapshot();
      if (r.type === 'segment') { item.segments.forEach(s => s.selected = false); r.segment.selected = true; act = { type: 'seg', seg: r.segment, pre, last: p }; }
      else if (r.type === 'handle-in' || r.type === 'handle-out') act = { type: 'handle', seg: r.segment, which: r.type === 'handle-in' ? 'handleIn' : 'handleOut', pre, alt: e.altKey };
      else if (r.type === 'stroke' && e.altKey && item.divideAt) { const s = item.divideAt(r.location); if (s) { pushUndo(pre); item.segments.forEach(x => x.selected = false); s.selected = true; afterChange(); } }
      else act = { type: 'move', pre, last: p, moved: false, only: item };
      break;
    }
    case 'pen': {
      if (!pen) {
        const pre = snapshot();
        const path = new P.Path({ insert: false }); applyNewStyle(path); if (!style.strokeOn) { path.strokeColor = style.stroke; path.strokeWidth = Math.max(2, style.strokeWidth); }
        content.addChild(path); path.selected = true; pen = { path, pre };
      }
      const first = pen.path.firstSegment;
      if (pen.path.segments.length > 1 && first.point.getDistance(p) < 9 / z()) { pen.path.closed = true; finishPen(); return; }
      act = { type: 'penDrag', seg: pen.path.add(p) };
      break;
    }
    case 'pencil': {
      const pre = snapshot();
      const path = new P.Path({ insert: false }); path.strokeColor = style.strokeOn ? style.stroke : style.fill; path.strokeWidth = Math.max(2, style.strokeWidth); path.strokeCap = 'round'; path.strokeJoin = 'round';
      path.add(p); content.addChild(path); act = { type: 'pencil', path, pre };
      break;
    }
    case 'rect': case 'ellipse': case 'polygon': case 'star': case 'line': act = { type: 'shape', a: p, item: null, pre: snapshot() }; break;
    case 'text': {
      const r = hit(p); const it = r && topLevel(r.item);
      if (it && it instanceof P.PointText) { setTool('select'); setSel([it]); focusText(); return; }
      pushUndo();
      const t = new P.PointText({ point: p, content: 'Escribí acá', fontFamily: style.font, fontSize: Math.round(64 / Math.max(.5, z())), fontWeight: 700, fillColor: style.fillOn ? style.fill : '#1d1a2e', insert: false });
      content.addChild(t); setTool('select'); setSel([t]); afterChange(true); focusText();
      break;
    }
    case 'picker': {
      const r = hit(p); const src = r && r.item; if (!src) return;
      if (sel.length) { pushUndo(); sel.forEach(i => { i.fillColor = src.fillColor && src.fillColor.clone(); i.strokeColor = src.strokeColor && src.strokeColor.clone(); i.strokeWidth = src.strokeWidth; i.opacity = src.opacity; }); afterChange(); toast('Estilo copiado'); }
      else { if (src.fillColor && src.fillColor.type !== 'gradient') { style.fill = src.fillColor.toCSS(true); style.fillOn = true; } if (src.strokeColor) { style.stroke = src.strokeColor.toCSS(true); style.strokeOn = true; style.strokeWidth = src.strokeWidth; } renderProps(); toast('Estilo copiado para las formas nuevas'); }
      break;
    }
    case 'zoom': { const r = cv.getBoundingClientRect(); zoomAt(z() * (e.altKey ? 1 / 1.6 : 1.6), new P.Point(e.clientX - r.left, e.clientY - r.top)); break; }
  }
});
cv.addEventListener('pointermove', e => {
  const p = evPoint(e);
  $('#stPos').textContent = `x ${Math.round(p.x)} · y ${Math.round(p.y)}`;
  if (pen && !act) { penPreview = p; drawUI(); }
  if (!act) {
    if (tool === 'select') { const h = handleAt(p); cv.style.cursor = h ? (h.type === 'rotate' ? 'alias' : 'nwse-resize') : ''; }
    return;
  }
  switch (act.type) {
    case 'pan': P.view.center = act.c.subtract(new P.Point(e.clientX - act.sx, e.clientY - act.sy).divide(z())); drawUI(); break;
    case 'move': {
      let d = p.subtract(act.last);
      if (!act.moved && d.length < 2 / z()) return;
      if (!act.moved) { act.moved = true; act.start = act.last; act.applied = new P.Point(0, 0); }
      let total = p.subtract(act.start);
      if (e.shiftKey) total = Math.abs(total.x) > Math.abs(total.y) ? new P.Point(total.x, 0) : new P.Point(0, total.y);
      const items = act.only ? [act.only] : sel;
      const prevSel = sel; sel = items; total = snapMove(total.subtract(act.applied)).add(act.applied); sel = prevSel;
      const step = total.subtract(act.applied);
      items.forEach(i => i.position = i.position.add(step));
      act.applied = total; act.last = p; drawUI();
      break;
    }
    case 'scale': {
      const a = act.anchor, oc = act.corner;
      let fx = (p.x - a.x) / ((oc.x - a.x) || 1), fy = (p.y - a.y) / ((oc.y - a.y) || 1);
      if (e.shiftKey || sel.some(i => i instanceof P.PointText)) { const f = Math.max(Math.abs(fx), Math.abs(fy)); fx = Math.sign(fx || 1) * f; fy = Math.sign(fy || 1) * f; }
      if (Math.abs(fx) < .01) fx = .01 * Math.sign(fx || 1); if (Math.abs(fy) < .01) fy = .01 * Math.sign(fy || 1);
      sel.forEach(i => i.scale(fx / act.fx, fy / act.fy, a));
      act.fx = fx; act.fy = fy; drawUI(); renderXYWH();
      break;
    }
    case 'rotate': {
      const c = act.b0.center; let ang = p.subtract(c).angle - act.ang0;
      if (e.shiftKey) ang = Math.round(ang / 15) * 15;
      sel.forEach(i => i.rotate(ang - act.applied, c)); act.applied = ang; drawUI();
      break;
    }
    case 'marquee': act.rect = new P.Rectangle(act.p0, p); drawUI(); break;
    case 'seg': { const d = p.subtract(act.last); act.seg.point = act.seg.point.add(d); act.last = p; act.moved = true; break; }
    case 'handle': {
      const s = act.seg, rel = p.subtract(s.point), other = act.which === 'handleIn' ? 'handleOut' : 'handleIn';
      s[act.which] = rel;
      if (!e.altKey && !act.alt && !s[other].isZero()) s[other] = rel.normalize(-s[other].length);
      act.moved = true;
      break;
    }
    case 'penDrag': { const v = p.subtract(act.seg.point); if (v.length > 2 / z()) { act.seg.handleOut = v; act.seg.handleIn = v.negate(); } penPreview = null; drawUI(); break; }
    case 'pencil': act.path.add(p); break;
    case 'shape': if (act.item) act.item.remove(); act.item = makeShape(tool, act.a, p, e.shiftKey); content.addChild(act.item); break;
  }
});
function pointerEnd(e) {
  if (!act) return;
  const a = act; act = null; guides = [];
  switch (a.type) {
    case 'pan': setTool(tool); break;
    case 'move': if (a.moved) { pushUndo(a.pre); afterChange(); } break;
    case 'scale': case 'rotate': pushUndo(a.pre); afterChange(); break;
    case 'marquee': {
      if (a.rect && a.rect.width * z() > 3) {
        const found = content.children.filter(i => i.visible && !i.locked && a.rect.intersects(i.bounds));
        setSel(a.add ? [...sel, ...found] : found);
      }
      break;
    }
    case 'seg': case 'handle': if (a.moved) { pushUndo(a.pre); afterChange(); } break;
    case 'pencil': if (a.path.segments.length < 3) a.path.remove(); else { pushUndo(a.pre); a.path.simplify(Math.max(1.5, 3 / z())); a.path.data.kind = 'Trazo a mano'; setSel([a.path]); afterChange(true); } break;
    case 'shape': if (a.item && a.item.bounds.width + a.item.bounds.height > 4 / z()) { pushUndo(a.pre); setTool('select'); setSel([a.item]); afterChange(true); } else if (a.item) a.item.remove(); break;
  }
  drawUI();
}
cv.addEventListener('pointerup', pointerEnd); cv.addEventListener('pointercancel', pointerEnd);
cv.addEventListener('dblclick', e => {
  const p = evPoint(e);
  if (tool === 'direct') { const r = hit(p, { segments: true }); if (r && r.type === 'segment') { const pre = snapshot(); const s = r.segment; if (s.hasHandles()) s.clearHandles(); else s.smooth(); pushUndo(pre); afterChange(); } return; }
  if (tool === 'select') { const r = hit(p); const it = r && topLevel(r.item); if (it instanceof P.PointText) focusText(); else if (it instanceof P.Path || it instanceof P.CompoundPath) { setTool('direct'); setSel([it]); } }
});
cv.addEventListener('wheel', e => {
  e.preventDefault(); const r = cv.getBoundingClientRect();
  if (e.shiftKey) { P.view.center = P.view.center.add(new P.Point(e.deltaY, 0).divide(z())); drawUI(); return; }
  zoomAt(z() * Math.pow(1.0015, -e.deltaY * (e.deltaMode === 1 ? 30 : 1)), new P.Point(e.clientX - r.left, e.clientY - r.top));
}, { passive: false });

/* ---------- operaciones ---------- */
const needSel = (n = 1) => { if (sel.length < n) { toast(n > 1 ? `Elegí al menos ${n} objetos` : 'Elegí un objeto'); return false; } return true; };
const sorted = () => [...sel].sort((a, b) => a.index - b.index);
function op(fn, structure = true) { const pre = snapshot(); const r = fn(); if (r === false) return; pushUndo(pre); afterChange(structure); }
const CMD = {
  undo, redo,
  selectAll: () => setSel(content.children.filter(i => i.visible && !i.locked)), deselect: () => setSel([]),
  delete: () => { if (!needSel()) return; op(() => { sel.forEach(i => i.remove()); sel = []; }); },
  duplicate: () => { if (!needSel()) return; op(() => { const c = sorted().map(i => { const k = i.clone(); k.position = k.position.add([20, 20]); return k; }); setSel(c); }); },
  copy: () => { if (!needSel()) return; clip = sorted().map(i => i.exportJSON()); toast('Copiado'); try { navigator.clipboard?.writeText(exportSVGString(true)); } catch (e) {} },
  cut: () => { if (!needSel()) return; CMD.copy(); CMD.delete(); },
  paste: () => { if (!clip) { toast('No hay nada copiado'); return; } op(() => { const items = clip.map(j => { const it = content.importJSON(j); it.position = it.position.add([20, 20]); return it; }); clip = items.map(i => i.exportJSON()); setSel(items); }); },
  group: () => { if (!needSel(2)) return; op(() => { const s = sorted(), idx = s[0].index; const g = new P.Group({ insert: false }); g.addChildren(s); content.insertChild(idx, g); g.data.kind = 'Grupo'; setSel([g]); }); },
  ungroup: () => { const gs = sel.filter(i => i instanceof P.Group); if (!gs.length) { toast('Elegí un grupo'); return; } op(() => { const out = []; gs.forEach(g => { const ch = g.removeChildren(); content.insertChildren(g.index, ch); out.push(...ch); g.remove(); }); setSel(out); }); },
  front: () => needSel() && op(() => sorted().forEach(i => i.bringToFront())),
  back: () => needSel() && op(() => sorted().reverse().forEach(i => i.sendToBack())),
  forward: () => needSel() && op(() => sorted().reverse().forEach(i => { const n = i.nextSibling; if (n && !sel.includes(n)) i.insertAbove(n); })),
  backward: () => needSel() && op(() => sorted().forEach(i => { const p = i.previousSibling; if (p && !sel.includes(p)) i.insertBelow(p); })),
  flipH: () => needSel() && op(() => { const c = selBounds().center; sel.forEach(i => i.scale(-1, 1, c)); }, false),
  flipV: () => needSel() && op(() => { const c = selBounds().center; sel.forEach(i => i.scale(1, -1, c)); }, false),
  simplify: () => { const ps = sel.filter(i => i instanceof P.Path); if (!ps.length) { toast('Elegí un trazo'); return; } op(() => ps.forEach(p => p.simplify(2.5)), false); },
  smooth: () => { const ps = sel.filter(i => i instanceof P.Path); if (!ps.length) { toast('Elegí un trazo'); return; } op(() => ps.forEach(p => p.smooth({ type: 'continuous' })), false); },
  rot90: () => needSel() && op(() => { const c = selBounds().center; sel.forEach(i => i.rotate(90, c)); }, false),
  rot90l: () => needSel() && op(() => { const c = selBounds().center; sel.forEach(i => i.rotate(-90, c)); }, false),
  new: dlgNew, open: () => openFiles(false), place: () => openFiles(true), saveProject, export: dlgExport,
  zoomFit: fit, zoom100: () => zoomAt(1), zoomIn: () => zoomAt(z() * 1.25), zoomOut: () => zoomAt(z() / 1.25),
  toggleGrid: () => { showGrid = !showGrid; drawUI(); }, toggleSnap: () => { snapOn = !snapOn; toast(snapOn ? 'Imán activado' : 'Imán desactivado'); },
};
function align(kind) {
  if (!needSel()) return;
  const T0 = sel.length > 1 ? selBounds() : new P.Rectangle(0, 0, board.w, board.h);
  op(() => sel.forEach(i => {
    const b = i.bounds; let dx = 0, dy = 0;
    if (kind === 'left') dx = T0.left - b.left; if (kind === 'hcenter') dx = T0.center.x - b.center.x; if (kind === 'right') dx = T0.right - b.right;
    if (kind === 'top') dy = T0.top - b.top; if (kind === 'vcenter') dy = T0.center.y - b.center.y; if (kind === 'bottom') dy = T0.bottom - b.bottom;
    i.position = i.position.add([dx, dy]);
  }), false);
}
function distribute(axis) {
  if (!needSel(3)) return;
  const s = [...sel].sort((a, b) => a.bounds.center[axis] - b.bounds.center[axis]);
  const first = s[0].bounds.center[axis], last = s[s.length - 1].bounds.center[axis], step = (last - first) / (s.length - 1);
  op(() => s.forEach((i, k) => { const d = first + step * k - i.bounds.center[axis]; i.position = i.position.add(axis === 'x' ? [d, 0] : [0, d]); }), false);
}
function bool(kind) {
  const paths = sorted().filter(i => i instanceof P.Path || i instanceof P.CompoundPath);
  if (paths.length < 2) { toast('Elegí al menos dos formas (no grupos ni textos)'); return; }
  op(() => {
    const base = paths[0], idx = base.index;
    let res = base;
    for (let k = 1; k < paths.length; k++) {
      const next = res[kind === 'subtract' ? 'subtract' : kind](paths[k], { insert: false });
      if (res !== base) res.remove();
      res = next;
    }
    paths.forEach(p => p.remove());
    content.insertChild(Math.min(idx, content.children.length), res);
    res.data.kind = { unite: 'Unión', subtract: 'Resta', intersect: 'Intersección', exclude: 'Exclusión', divide: 'División' }[kind];
    setSel([res]);
  });
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-cmd]'); if (!b) return;
  const c = b.dataset.cmd;
  if (c.startsWith('bool:')) bool(c.slice(5));
  else if (c.startsWith('align:')) align(c.slice(6));
  else if (c.startsWith('dist:')) distribute(c.slice(5));
  else if (CMD[c]) CMD[c]();
});

/* ---------- panel de diseño ---------- */
const colorOf = c => { try { return c ? c.toCSS(true) : null; } catch (e) { return null; } };
function fillInfo(it) {
  const f = it.fillColor;
  if (!f) return { type: 'none', c1: '#9d83ff', c2: '#36c2b4' };
  if (f.type === 'gradient') { const st = f.gradient.stops; return { type: f.gradient.radial ? 'radial' : 'linear', c1: colorOf(st[0].color), c2: colorOf(st[st.length - 1].color) }; }
  return { type: 'solid', c1: colorOf(f), c2: '#36c2b4' };
}
function setFill(it, type, c1, c2) {
  if (it instanceof P.Group) { it.children.forEach(ch => setFill(ch, type, c1, c2)); return; }
  if (type === 'none') it.fillColor = null;
  else if (type === 'solid') it.fillColor = c1;
  else { const b = it.bounds; it.fillColor = new P.Color({ gradient: { stops: [c1, c2], radial: type === 'radial' }, origin: type === 'radial' ? b.center : b.leftCenter, destination: type === 'radial' ? b.rightCenter : b.rightCenter }); }
}
const ARR = {
  'align:left': '<path d="M4 3v18M8 7h10v4H8zM8 14h6v4H8z"/>', 'align:hcenter': '<path d="M12 3v18M6 7h12v4H6zM8 14h8v4H8z"/>', 'align:right': '<path d="M20 3v18M6 7h10v4H6zM10 14h6v4h-6z"/>',
  'align:top': '<path d="M3 4h18M7 8h4v10H7zM14 8h4v6h-4z"/>', 'align:vcenter': '<path d="M3 12h18M7 6h4v12H7zM14 8h4v8h-4z"/>', 'align:bottom': '<path d="M3 20h18M7 6h4v10H7zM14 10h4v6h-4z"/>',
  'dist:x': '<path d="M4 4v16M20 4v16M10 8h4v8h-4z"/>', 'dist:y': '<path d="M4 4h16M4 20h16M8 10h8v4H8z"/>',
  front: '<path d="M8 8h12v12H8z" fill="currentColor"/><path d="M4 4h12v3M4 4v12h3"/>', forward: '<path d="M12 19V5M5 12l7-7 7 7"/>', backward: '<path d="M12 5v14M5 12l7 7 7-7"/>', back: '<path d="M4 4h12v12H4z" fill="currentColor"/><path d="M20 8v12H8v-3"/>',
  flipH: '<path d="M12 3v18M8 7 3 12l5 5zM16 7l5 5-5 5z"/>', flipV: '<path d="M3 12h18M7 8l5-5 5 5zM7 16l5 5 5-5z"/>', rot90l: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>', rot90: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>',
  group: '<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 2"/><rect x="7" y="7" width="5" height="5"/><rect x="12" y="12" width="5" height="5"/>', ungroup: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
  'bool:unite': '<path d="M3 3h11v6h7v12H10v-6H3z" fill="currentColor"/>', 'bool:subtract': '<path d="M3 3h11v6h-4v6H3z" fill="currentColor"/><path d="M10 9h11v12H10z"/>', 'bool:intersect': '<path d="M3 3h11v12H3zM10 9h11v12H10z"/><path d="M10 9h4v6h-4z" fill="currentColor"/>', 'bool:exclude': '<path d="M3 3h11v6h-4v6H3zM14 9h7v12H10v-6h4z" fill="currentColor"/>', 'bool:divide': '<path d="M3 3h11v12H3zM10 9h11v12H10z"/>',
  duplicate: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>', delete: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
};
const ARR_NAME = { 'align:left': 'Alinear a la izquierda', 'align:hcenter': 'Centrar horizontal', 'align:right': 'Alinear a la derecha', 'align:top': 'Alinear arriba', 'align:vcenter': 'Centrar vertical', 'align:bottom': 'Alinear abajo', 'dist:x': 'Distribuir horizontal', 'dist:y': 'Distribuir vertical', front: 'Traer al frente', forward: 'Traer adelante', backward: 'Enviar atrás', back: 'Enviar al fondo', flipH: 'Voltear horizontal', flipV: 'Voltear vertical', rot90l: 'Girar 90° a la izquierda', rot90: 'Girar 90° a la derecha', group: 'Agrupar', ungroup: 'Desagrupar', 'bool:unite': 'Unir', 'bool:subtract': 'Restar', 'bool:intersect': 'Intersección', 'bool:exclude': 'Excluir', 'bool:divide': 'Dividir', duplicate: 'Duplicar', delete: 'Eliminar' };
const ib = k => `<button class="ib" data-cmd="${k}" title="${ARR_NAME[k]}" aria-label="${ARR_NAME[k]}">${icon(ARR[k])}</button>`;
function renderXYWH() {
  const b = selBounds(); if (!b) return;
  [['pxX', b.x], ['pxY', b.y], ['pxW', b.width], ['pxH', b.height]].forEach(([id, v]) => { const i = $('#' + id); if (i && document.activeElement !== i) i.value = Math.round(v * 10) / 10; });
}
function renderProps() {
  const box = $('#props');
  if (!sel.length) {
    box.innerHTML = `<div class="sec"><h3>Mesa de trabajo</h3>
      <div class="xywh"><label>An <input type="number" id="bW" value="${board.w}" min="1"></label><label>Al <input type="number" id="bH" value="${board.h}" min="1"></label></div>
      <div class="f wide"><label for="bBg">Fondo</label><div class="colrow"><input type="color" id="bBg" value="${board.bg === 'transparent' ? '#ffffff' : board.bg}"><label class="hint" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="bTr" ${board.bg === 'transparent' ? 'checked' : ''}>Transparente</label></div></div>
      <button class="btn small" data-cmd="new">Elegir un tamaño…</button></div>
      <div class="sec"><h3>Estilo para formas nuevas</h3>
      <div class="f wide"><label>Relleno</label><div class="colrow"><input type="checkbox" id="sFillOn" ${style.fillOn ? 'checked' : ''} aria-label="Usar relleno"><input type="color" id="sFill" value="${style.fill}"></div></div>
      <div class="f wide"><label>Borde</label><div class="colrow"><input type="checkbox" id="sStrokeOn" ${style.strokeOn ? 'checked' : ''} aria-label="Usar borde"><input type="color" id="sStroke" value="${style.stroke}"></div></div>
      <div class="f"><label for="sSW">Grosor</label><input type="range" id="sSW" min="0" max="60" step=".5" value="${style.strokeWidth}"><output>${style.strokeWidth}</output></div>
      <div class="f"><label for="sR">Esquinas</label><input type="range" id="sR" min="0" max="200" value="${style.radius}"><output>${style.radius}</output></div>
      <div class="f"><label for="sSides">Lados</label><input type="range" id="sSides" min="3" max="12" value="${style.sides}"><output>${style.sides}</output></div>
      <div class="f"><label for="sPts">Puntas</label><input type="range" id="sPts" min="3" max="20" value="${style.points}"><output>${style.points}</output></div>
      <div class="f wide"><label for="sFont">Fuente</label><select id="sFont">${FONTS.map(f => `<option${f === style.font ? ' selected' : ''}>${f}</option>`).join('')}</select></div></div>
      <div class="sec"><h3>Atajos</h3><p class="hint"><kbd>V</kbd> selección · <kbd>A</kbd> nodos · <kbd>P</kbd> pluma · <kbd>M</kbd> rectángulo · <kbd>T</kbd> texto · <kbd>Ctrl G</kbd> agrupar · <kbd>Alt</kbd> + arrastrar duplica · flechas mueven 1 px (Mayús: 10)</p></div>`;
    return;
  }
  const it = sel[0], fi = fillInfo(it), sc = colorOf(it.strokeColor), txt = sel.find(i => i instanceof P.PointText);
  let h = `<div class="sec"><h3>${sel.length > 1 ? `${sel.length} objetos` : esc(it.name || typeName(it))}</h3>
    <div class="xywh"><label>X <input type="number" id="pxX" step=".1"></label><label>Y <input type="number" id="pxY" step=".1"></label><label>An <input type="number" id="pxW" step=".1" min=".1"></label><label>Al <input type="number" id="pxH" step=".1" min=".1"></label></div>
    <div class="grid6">${['align:left', 'align:hcenter', 'align:right', 'align:top', 'align:vcenter', 'align:bottom'].map(ib).join('')}</div>
    <div class="grid6">${['dist:x', 'dist:y', 'rot90l', 'rot90', 'flipH', 'flipV'].map(ib).join('')}</div></div>`;
  h += `<div class="sec"><h3>Relleno</h3><div class="colrow"><select id="pFillT" class="sel"><option value="none"${fi.type === 'none' ? ' selected' : ''}>Ninguno</option><option value="solid"${fi.type === 'solid' ? ' selected' : ''}>Sólido</option><option value="linear"${fi.type === 'linear' ? ' selected' : ''}>Degradado lineal</option><option value="radial"${fi.type === 'radial' ? ' selected' : ''}>Degradado radial</option></select><input type="color" id="pFill1" value="${fi.c1 || '#9d83ff'}"${fi.type === 'none' ? ' disabled' : ''}>${fi.type === 'linear' || fi.type === 'radial' ? `<input type="color" id="pFill2" value="${fi.c2 || '#36c2b4'}">` : ''}</div></div>`;
  h += `<div class="sec"><h3>Borde</h3><div class="colrow"><input type="checkbox" id="pStrokeOn" ${sc ? 'checked' : ''} aria-label="Usar borde"><input type="color" id="pStroke" value="${sc || '#1d1a2e'}"></div>
    <div class="f"><label for="pSW">Grosor</label><input type="range" id="pSW" min="0" max="80" step=".5" value="${it.strokeWidth || 0}"><output>${it.strokeWidth || 0}</output></div>
    <div class="f wide"><label for="pDash">Estilo</label><select id="pDash"><option value="solid">Continuo</option><option value="dash"${it.dashArray && it.dashArray.length && it.dashArray[0] > it.strokeWidth ? ' selected' : ''}>Guiones</option><option value="dot"${it.dashArray && it.dashArray.length && it.dashArray[0] <= it.strokeWidth ? ' selected' : ''}>Puntos</option></select></div>
    <div class="f wide"><label for="pCap">Extremos</label><select id="pCap">${[['round', 'Redondos'], ['butt', 'Rectos'], ['square', 'Cuadrados']].map(([v, n]) => `<option value="${v}"${it.strokeCap === v ? ' selected' : ''}>${n}</option>`).join('')}</select></div></div>`;
  h += `<div class="sec"><h3>Apariencia</h3>
    <div class="f"><label for="pOp">Opacidad</label><input type="range" id="pOp" min="0" max="1" step=".01" value="${it.opacity}"><output>${Math.round(it.opacity * 100)}%</output></div>
    <div class="f wide"><label for="pBlend">Fusión</label><select id="pBlend">${BLENDS.map(([v, n]) => `<option value="${v}"${it.blendMode === v ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="f"><label for="pShadow">Sombra</label><input type="range" id="pShadow" min="0" max="60" value="${it.shadowBlur || 0}"><output>${it.shadowBlur || 0}</output></div></div>`;
  if (txt) h += `<div class="sec"><h3>Texto</h3>
    <textarea id="pText" rows="3" aria-label="Texto" style="width:100%;background:var(--panel-2);border:1px solid var(--line);border-radius:6px;padding:6px 8px">${esc(txt.content)}</textarea>
    <div class="f wide"><label for="pFont">Fuente</label><select id="pFont">${FONTS.map(f => `<option${f === txt.fontFamily ? ' selected' : ''}>${f}</option>`).join('')}</select></div>
    <div class="f"><label for="pFS">Tamaño</label><input type="range" id="pFS" min="6" max="400" value="${Math.round(txt.fontSize)}"><output>${Math.round(txt.fontSize)}</output></div>
    <div class="f wide"><label for="pFW">Grosor</label><select id="pFW">${[[400, 'Normal'], [600, 'Semi'], [700, 'Negrita'], [900, 'Black']].map(([v, n]) => `<option value="${v}"${String(txt.fontWeight) === String(v) ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="f wide"><label for="pJust">Alineación</label><select id="pJust">${[['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']].map(([v, n]) => `<option value="${v}"${txt.justification === v ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="f"><label for="pLead">Interlineado</label><input type="range" id="pLead" min=".6" max="3" step=".05" value="${(txt.leading / txt.fontSize).toFixed(2)}"><output>${(txt.leading / txt.fontSize).toFixed(2)}</output></div></div>`;
  h += `<div class="sec"><h3>Organizar</h3><div class="grid6">${['front', 'forward', 'backward', 'back', 'group', 'ungroup'].map(ib).join('')}</div>
    <div class="grid6">${['bool:unite', 'bool:subtract', 'bool:intersect', 'bool:exclude', 'bool:divide', 'duplicate'].map(ib).join('')}</div>
    <button class="btn small danger" data-cmd="delete">Eliminar</button></div>`;
  box.innerHTML = h; renderXYWH();
}
function focusText() { $$('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.ptab === 'props')); $('#props').hidden = false; $('#layers').hidden = true; setTimeout(() => { const t = $('#pText'); if (t) { t.focus(); t.select(); } }, 30); }
let propPre = null;
$('#props').addEventListener('focusin', () => { propPre = snapshot(); });
$('#props').addEventListener('pointerdown', e => { if (!propPre && e.target.matches('input,select,textarea')) propPre = snapshot(); });
$('#props').addEventListener('input', e => {
  const id = e.target.id, v = e.target.value, t = e.target;
  const out = t.nextElementSibling && t.nextElementSibling.tagName === 'OUTPUT' ? t.nextElementSibling : null;
  if (!sel.length) {
    if (id === 'bW' || id === 'bH') { const n = clamp(Math.round(+v || 1), 1, 20000); if (id === 'bW') board.w = n; else board.h = n; drawBoard(); }
    if (id === 'bBg' || id === 'bTr') { board.bg = $('#bTr').checked ? 'transparent' : $('#bBg').value; drawBoard(); }
    if (id === 'sFillOn') style.fillOn = t.checked; if (id === 'sFill') { style.fill = v; style.fillOn = true; $('#sFillOn').checked = true; }
    if (id === 'sStrokeOn') style.strokeOn = t.checked; if (id === 'sStroke') { style.stroke = v; style.strokeOn = true; $('#sStrokeOn').checked = true; }
    if (id === 'sSW') style.strokeWidth = +v; if (id === 'sR') style.radius = +v; if (id === 'sSides') style.sides = +v; if (id === 'sPts') style.points = +v; if (id === 'sFont') style.font = v;
    if (out) out.textContent = v;
    return;
  }
  if (!propPre) propPre = snapshot();
  const txts = sel.filter(i => i instanceof P.PointText);
  switch (id) {
    case 'pxX': case 'pxY': { const b = selBounds(); const d = id === 'pxX' ? [(+v || 0) - b.x, 0] : [0, (+v || 0) - b.y]; sel.forEach(i => i.position = i.position.add(d)); break; }
    case 'pxW': case 'pxH': { const b = selBounds(); const n = Math.max(.1, +v || .1); const f = id === 'pxW' ? n / b.width : n / b.height; sel.forEach(i => i.scale(id === 'pxW' ? f : 1, id === 'pxH' ? f : 1, b.topLeft)); break; }
    case 'pFillT': case 'pFill1': case 'pFill2': { const type = $('#pFillT').value, c1 = $('#pFill1').value, c2 = $('#pFill2') ? $('#pFill2').value : '#36c2b4'; sel.forEach(i => setFill(i, type, c1, c2)); if (id === 'pFillT') { renderProps(); return; } break; }
    case 'pStrokeOn': case 'pStroke': { const on = $('#pStrokeOn').checked || id === 'pStroke'; $('#pStrokeOn').checked = on; sel.forEach(i => { i.strokeColor = on ? $('#pStroke').value : null; if (on && !i.strokeWidth) i.strokeWidth = 2; }); break; }
    case 'pSW': sel.forEach(i => { i.strokeWidth = +v; if (+v > 0 && !i.strokeColor) i.strokeColor = $('#pStroke').value; }); break;
    case 'pDash': sel.forEach(i => { const w = Math.max(1, i.strokeWidth); i.dashArray = v === 'dash' ? [w * 3, w * 2] : v === 'dot' ? [0.01, w * 2] : []; if (v === 'dot') i.strokeCap = 'round'; }); break;
    case 'pCap': sel.forEach(i => i.strokeCap = v); break;
    case 'pOp': sel.forEach(i => i.opacity = +v); if (out) out.textContent = Math.round(v * 100) + '%'; return;
    case 'pBlend': sel.forEach(i => i.blendMode = v); break;
    case 'pShadow': sel.forEach(i => { i.shadowBlur = +v; i.shadowColor = +v > 0 ? new P.Color(0, 0, 0, .35) : null; i.shadowOffset = new P.Point(0, +v / 4); }); break;
    case 'pText': txts.forEach(i => i.content = v); break;
    case 'pFont': txts.forEach(i => i.fontFamily = v); loadFont(v); break;
    case 'pFS': txts.forEach(i => { const r = i.leading / i.fontSize; i.fontSize = +v; i.leading = +v * r; }); break;
    case 'pFW': txts.forEach(i => i.fontWeight = v); break;
    case 'pJust': txts.forEach(i => { const b = i.bounds; i.justification = v; i.position = b.center; }); break;
    case 'pLead': txts.forEach(i => i.leading = i.fontSize * +v); break;
  }
  if (out) out.textContent = v;
  drawUI(); if (!['pxX', 'pxY', 'pxW', 'pxH'].includes(id)) renderXYWH();
});
$('#props').addEventListener('change', e => {
  if (!sel.length) { if (['bW', 'bH', 'bBg', 'bTr'].includes(e.target.id)) { pushUndo(propPre); propPre = null; afterChange(); fit(); } return; }
  if (propPre && propPre !== snapshot()) { pushUndo(propPre); afterChange(); } propPre = null;
});
function loadFont(f) { document.fonts?.load(`700 40px "${f}"`).then(() => P.view.requestUpdate && P.view.requestUpdate()).catch(() => {}); }

/* ---------- capas ---------- */
function typeName(i) { return i.data?.kind || (i instanceof P.PointText ? 'Texto' : i instanceof P.Group ? 'Grupo' : i instanceof P.CompoundPath ? 'Forma compuesta' : i instanceof P.Raster ? 'Imagen' : 'Trazo'); }
const EYE = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', LOCK = '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>';
function renderLayers() {
  const box = $('#layers'); if (box.hidden) return;
  const items = [...content.children].reverse();
  box.innerHTML = items.length ? items.map(i => { const f = i.fillColor && i.fillColor.type !== 'gradient' ? colorOf(i.fillColor) : i.fillColor ? 'linear-gradient(90deg,#9d83ff,#36c2b4)' : 'transparent'; return `<div class="lrow${sel.includes(i) ? ' on' : ''}" data-id="${i.id}" draggable="true"><span class="sw" style="background:${f}"></span><span class="ln">${esc(i.name || typeName(i))}</span><button class="lb${i.visible ? '' : ' off'}" data-l="vis" aria-label="Mostrar u ocultar">${icon(EYE)}</button><button class="lb${i.locked ? '' : ' off'}" data-l="lock" aria-label="Bloquear">${icon(LOCK)}</button></div>`; }).join('') : '<p class="hint">Todavía no hay objetos. Dibujá algo con las herramientas de la izquierda.</p>';
}
const byId = id => content.children.find(i => i.id === +id);
$('#layers').addEventListener('click', e => {
  const row = e.target.closest('.lrow'); if (!row) return; const it = byId(row.dataset.id); if (!it) return;
  const b = e.target.closest('[data-l]');
  if (b) { op(() => { if (b.dataset.l === 'vis') it.visible = !it.visible; else { it.locked = !it.locked; if (it.locked) sel = sel.filter(x => x !== it); } }); return; }
  if (it.locked) { toast('El objeto está bloqueado'); return; }
  setSel(e.shiftKey ? (sel.includes(it) ? sel.filter(x => x !== it) : [...sel, it]) : [it]);
});
$('#layers').addEventListener('dblclick', e => {
  const row = e.target.closest('.lrow'); if (!row || e.target.closest('[data-l]')) return; const it = byId(row.dataset.id);
  const ln = row.querySelector('.ln'), inp = el(`<input class="inp" value="${esc(it.name || typeName(it))}" aria-label="Nombre">`); ln.replaceWith(inp); inp.focus(); inp.select();
  const done = () => { const v = inp.value.trim(); if (v && v !== it.name) op(() => { it.name = v; }); else renderLayers(); };
  inp.addEventListener('blur', done); inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') inp.blur(); });
});
let dragId = null;
$('#layers').addEventListener('dragstart', e => { const r = e.target.closest('.lrow'); if (r) { dragId = r.dataset.id; e.dataTransfer.setData('text/plain', dragId); } });
$('#layers').addEventListener('dragover', e => { if (!dragId) return; e.preventDefault(); $$('.lrow').forEach(r => r.classList.remove('drop-before')); e.target.closest('.lrow')?.classList.add('drop-before'); });
$('#layers').addEventListener('drop', e => {
  e.preventDefault(); const r = e.target.closest('.lrow'); const it = byId(dragId); dragId = null;
  if (!r || !it || r.dataset.id === String(it.id)) { renderLayers(); return; }
  op(() => it.insertAbove(byId(r.dataset.id)));
});
$$('.tab').forEach(t => t.addEventListener('click', () => { $$('.tab').forEach(x => x.setAttribute('aria-selected', x === t)); $('#props').hidden = t.dataset.ptab !== 'props'; $('#layers').hidden = t.dataset.ptab !== 'layers'; renderLayers(); }));

/* ---------- archivos ---------- */
function exportSVGString(onlySel) {
  ui.remove();
  const hideBoard = board.bg === 'transparent' || onlySel; boardLayer.visible = !hideBoard;
  let svg;
  if (onlySel && sel.length) { const g = new P.Group({ children: sel.map(i => i.clone({ insert: false })), insert: false }); svg = g.exportSVG({ asString: true, embedImages: true }); }
  else svg = P.project.exportSVG({ asString: true, bounds: new P.Rectangle(0, 0, board.w, board.h), embedImages: true });
  boardLayer.visible = true; P.project.addLayer(ui);
  if (onlySel && sel.length) { const b = selBounds(); svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.width} ${b.height}" width="${b.width}" height="${b.height}">${svg}</svg>`; }
  return svg;
}
function rasterize(scale, bg) {
  ui.remove();
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(board.w * scale)); c.height = Math.max(1, Math.round(board.h * scale));
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); }
  const layers = board.bg === 'transparent' ? [content] : [boardLayer, content];
  try {
    for (const L of layers) {
      const vis = L.children.filter(i => i.visible); if (!vis.length) continue;
      const r = L.rasterize(72 * scale, false); const b = r.bounds;
      if (b.width && b.height) g.drawImage(r.canvas, b.x * scale, b.y * scale, b.width * scale, b.height * scale);
    }
  } finally { P.project.addLayer(ui); }
  return c;
}
function dlgExport() {
  openDialog(`<h3>Exportar</h3>
    <div class="f wide"><label for="xF">Formato</label><select id="xF"><option value="svg">SVG (vectorial, editable)</option><option value="png">PNG (con transparencia)</option><option value="jpg">JPG</option><option value="pdf">PDF (vectorial)</option></select></div>
    <div class="f"><label for="xS">Escala</label><input type="range" id="xS" min=".25" max="6" step=".25" value="2"><output>2×</output></div>
    <label class="row-btns hint"><input type="checkbox" id="xSel"${sel.length ? '' : ' disabled'}> Solo la selección (SVG y PNG)</label>
    <p class="hint" id="xInfo"></p>
    <div class="row-btns"><button class="btn primary" id="xOk">Descargar</button><button class="btn" id="xCancel">Cancelar</button></div>`);
  const info = () => { const f = $('#xF').value, s = +$('#xS').value; $('#xInfo').textContent = f === 'svg' || f === 'pdf' ? `${board.w} × ${board.h} · se mantiene vectorial` : `${Math.round(board.w * s)} × ${Math.round(board.h * s)} px`; };
  $('#dlgBody').addEventListener('input', e => { if (e.target.id === 'xS') e.target.nextElementSibling.textContent = e.target.value + '×'; info(); }); info();
  $('#xCancel').onclick = closeDialog;
  $('#xOk').onclick = async () => {
    const f = $('#xF').value, s = +$('#xS').value, only = $('#xSel').checked, name = safeName(board.name);
    try {
      if (f === 'svg') download(new Blob([exportSVGString(only)], { type: 'image/svg+xml' }), `${name}.svg`);
      else if (f === 'png' || f === 'jpg') {
        let c;
        if (only && sel.length) { const b = selBounds(); const g = new P.Group({ children: sel.map(i => i.clone({ insert: false })), insert: false }); const r = g.rasterize(72 * s, false); c = r.canvas; if (f === 'jpg') { const k = document.createElement('canvas'); k.width = c.width; k.height = c.height; const kg = k.getContext('2d'); kg.fillStyle = '#fff'; kg.fillRect(0, 0, k.width, k.height); kg.drawImage(c, 0, 0); c = k; } void b; }
        else c = rasterize(s, f === 'jpg' ? '#ffffff' : null);
        const blob = await new Promise(r => c.toBlob(r, f === 'jpg' ? 'image/jpeg' : 'image/png', .92));
        download(blob, `${name}.${f}`);
      } else await exportPDF(name);
      closeDialog(); toast('Archivo exportado');
    } catch (err) { console.error(err); toast('No se pudo exportar. Probá con otro formato.'); }
  };
}
async function exportPDF(name) {
  busy('Generando PDF…');
  try {
    await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: board.w > board.h ? 'l' : 'p', unit: 'pt', format: [board.w, board.h] });
    try {
      await loadScript('https://cdn.jsdelivr.net/npm/svg2pdf.js@2.2.4/dist/svg2pdf.umd.min.js');
      const holder = document.createElement('div'); holder.style.cssText = 'position:fixed;left:-99999px;top:0'; holder.innerHTML = exportSVGString(false); document.body.appendChild(holder);
      const svgEl = holder.querySelector('svg');
      await doc.svg(svgEl, { x: 0, y: 0, width: board.w, height: board.h });
      holder.remove();
    } catch (e) {
      console.warn('PDF vectorial no disponible, uso imagen', e);
      doc.addImage(rasterize(3, '#ffffff').toDataURL('image/png'), 'PNG', 0, 0, board.w, board.h);
    }
    doc.save(`${name}.pdf`);
  } finally { busy(false); }
}
function dlgNew() {
  const PRE = [['Post de Instagram', 1080, 1080], ['Historia', 1080, 1920], ['Logo / ícono', 1000, 1000], ['Miniatura de YouTube', 1280, 720], ['Póster A3 (pt)', 842, 1191], ['Hoja A4 (pt)', 595, 842], ['Tarjeta personal', 1050, 600], ['Banner web', 1500, 500]];
  openDialog(`<h3>Documento nuevo</h3><div class="preset-grid">${PRE.map(([n, w, h], i) => `<button class="chip" data-pre="${i}">${n}<small>${w} × ${h}</small></button>`).join('')}</div>
    <div class="f wide"><label>Tamaño</label><div class="row-btns"><input type="number" id="nW" class="inp" value="${board.w}" style="width:90px" aria-label="Ancho"> × <input type="number" id="nH" class="inp" value="${board.h}" style="width:90px" aria-label="Alto"></div></div>
    <label class="row-btns hint"><input type="checkbox" id="nKeep"> Conservar el dibujo actual (solo cambiar el tamaño)</label>
    <div class="row-btns"><button class="btn primary" id="nOk">Crear</button><button class="btn" id="nCancel">Cancelar</button></div>`);
  $('#dlgBody').addEventListener('click', e => { const b = e.target.closest('[data-pre]'); if (b) { const [, w, h] = PRE[+b.dataset.pre]; $('#nW').value = w; $('#nH').value = h; } });
  $('#nCancel').onclick = closeDialog;
  $('#nOk').onclick = () => {
    pushUndo(); board.w = clamp(+$('#nW').value || 1080, 1, 20000); board.h = clamp(+$('#nH').value || 1080, 1, 20000);
    if (!$('#nKeep').checked) { content.removeChildren(); board.name = 'Sin título'; $('#docName').value = board.name; }
    sel = []; drawBoard(); fit(); afterChange(true); closeDialog();
  };
}
async function saveProject() { download(new Blob([snapshot()], { type: 'application/json' }), `${safeName(board.name)}.trazo`); toast('Proyecto descargado'); }
async function placeFile(f, asDoc) {
  if (/\.trazo$/i.test(f.name)) { pushUndo(); restore(await f.text()); fit(); return; }
  if (f.type === 'image/svg+xml' || /\.svg$/i.test(f.name)) {
    const text = await f.text();
    const item = P.project.importSVG(text, { insert: false, expandShapes: true });
    if (!item) throw new Error('svg');
    pushUndo();
    if (asDoc) { content.removeChildren(); const b = item.bounds; board.w = Math.max(1, Math.round(b.width || 1000)); board.h = Math.max(1, Math.round(b.height || 1000)); item.position = new P.Point(board.w / 2, board.h / 2); board.name = f.name.replace(/\.svg$/i, ''); $('#docName').value = board.name; drawBoard(); fit(); }
    else { const s = Math.min(1, board.w * .8 / item.bounds.width, board.h * .8 / item.bounds.height); if (s < 1) item.scale(s); item.position = new P.Point(board.w / 2, board.h / 2); }
    item.data.kind = 'SVG importado'; content.addChild(item); setTool('select'); setSel([item]); afterChange(true);
    return;
  }
  if (f.type.startsWith('image/')) {
    const url = await readAsDataURL(f);
    await new Promise((res, rej) => {
      const r = new P.Raster({ source: url, insert: false });
      r.onLoad = () => { pushUndo(); const s = Math.min(1, board.w * .8 / r.width, board.h * .8 / r.height); r.scale(s); r.position = new P.Point(board.w / 2, board.h / 2); r.data.kind = 'Imagen'; content.addChild(r); setTool('select'); setSel([r]); afterChange(true); res(); };
      r.onError = rej;
    });
    return;
  }
  toast(`No se puede abrir ${f.name}`);
}
async function openFiles(place) {
  const files = await pickFiles(place ? 'image/*,.svg' : '.trazo,.svg,image/svg+xml,application/json', place);
  for (const f of files) { try { await placeFile(f, !place); } catch (e) { toast(`No se pudo abrir ${f.name}`); } }
}

/* ---------- diálogo genérico ---------- */
function openDialog(html) { $('#dlgBody').innerHTML = html; $('#dlg').hidden = false; }
function closeDialog() { $('#dlg').hidden = true; const n = $('#dlgBody').cloneNode(false); $('#dlgBody').replaceWith(n); }

/* ---------- teclado, pegar y soltar ---------- */
document.addEventListener('keydown', e => {
  if (!$('#dlg').hidden) { if (e.key === 'Escape') closeDialog(); return; }
  if (e.target.closest?.('input,textarea,select,[contenteditable]')) return;
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (e.code === 'Space' && !spaceDown) { spaceDown = true; vp.style.cursor = 'grab'; e.preventDefault(); return; }
  if (mod) {
    const map = { z: e.shiftKey ? redo : undo, y: redo, a: CMD.selectAll, d: CMD.duplicate, g: e.shiftKey ? CMD.ungroup : CMD.group, s: saveProject, o: CMD.open, c: CMD.copy, x: CMD.cut, e: e.shiftKey ? dlgExport : null, '0': fit, '1': CMD.zoom100, '=': CMD.zoomIn, '+': CMD.zoomIn, '-': CMD.zoomOut, ']': e.shiftKey ? CMD.front : CMD.forward, '[': e.shiftKey ? CMD.back : CMD.backward, '}': CMD.front, '{': CMD.back };
    if (map[k]) { e.preventDefault(); map[k](); }
    return;
  }
  if (e.key === 'Enter' && pen) { finishPen(); return; }
  if (e.key === 'Escape') { if (pen) finishPen(); else setSel([]); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    if (tool === 'direct' && sel.length) { const pre = snapshot(); let n = 0; sel.forEach(p => { if (p.segments) p.segments.filter(s => s.selected).forEach(s => { s.remove(); n++; }); if (p.segments && p.segments.length < 2) p.remove(); }); if (n) { pushUndo(pre); afterChange(true); return; } }
    CMD.delete(); return;
  }
  if (e.key.startsWith('Arrow') && sel.length) {
    e.preventDefault(); const s = e.shiftKey ? 10 : 1;
    const d = [e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0, e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0];
    op(() => sel.forEach(i => i.position = i.position.add(d)), false); return;
  }
  const t = TOOLS.find(x => x[2].toLowerCase() === k); if (t) setTool(t[0]);
});
document.addEventListener('keyup', e => { if (e.code === 'Space') { spaceDown = false; setTool(tool); } });
document.addEventListener('paste', async e => {
  if (e.target.closest?.('input,textarea')) return;
  const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/'));
  if (f) { e.preventDefault(); placeFile(f, false); return; }
  const txt = e.clipboardData?.getData('text/plain') || '';
  if (/^\s*<svg[\s>]/i.test(txt) && !clip) { e.preventDefault(); placeFile(new File([txt], 'pegado.svg', { type: 'image/svg+xml' }), false); return; }
  if (clip) { e.preventDefault(); CMD.paste(); }
});
['dragenter', 'dragover'].forEach(ev => vp.addEventListener(ev, e => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); $('#dropMsg').hidden = false; } }));
vp.addEventListener('dragleave', e => { if (!vp.contains(e.relatedTarget)) $('#dropMsg').hidden = true; });
vp.addEventListener('drop', async e => { e.preventDefault(); $('#dropMsg').hidden = true; for (const f of e.dataTransfer.files) { try { await placeFile(f, false); } catch (err) { toast(`No se pudo abrir ${f.name}`); } } });
$('#docName').addEventListener('input', e => { board.name = e.target.value; afterChange(); });

/* ---------- inicio ---------- */
function sample() {
  board.w = 1080; board.h = 1080; board.bg = '#f6f3ff'; board.name = 'Mi primera ilustración'; $('#docName').value = board.name;
  drawBoard(); content.activate();
  const blob = new P.Path.Circle({ center: [540, 470], radius: 300, fillColor: { gradient: { stops: ['#9d83ff', '#36c2b4'] }, origin: [240, 470], destination: [840, 470] } }); blob.data.kind = 'Círculo';
  const star = new P.Path.Star({ center: [800, 260], points: 5, radius1: 90, radius2: 40, fillColor: '#ffcf5a' }); star.rotate(-12); star.data.kind = 'Estrella';
  const wave = new P.Path({ segments: [[140, 820], [400, 740], [680, 860], [940, 760]], strokeColor: '#1d1a2e', strokeWidth: 10, strokeCap: 'round' }); wave.smooth({ type: 'continuous' }); wave.data.kind = 'Onda';
  const t = new P.PointText({ point: [540, 500], content: 'Trazo', justification: 'center', fontFamily: 'Bricolage Grotesque', fontWeight: 800, fontSize: 170, fillColor: '#ffffff' }); t.data.kind = 'Título';
  const t2 = new P.PointText({ point: [540, 960], content: 'Dibujá con la pluma, combiná formas y exportá en SVG o PDF', justification: 'center', fontFamily: 'Figtree', fontWeight: 600, fontSize: 30, fillColor: '#4a4560' }); t2.data.kind = 'Subtítulo';
}
updUndo(); setTool('select');
(async () => {
  let ok = false;
  try { const s = await store.get('trazo:doc'); if (s) { restore(s); ok = true; $('#savedLbl').textContent = 'Guardado'; } } catch (e) { ok = false; }
  if (!ok) { sample(); afterChange(true); }
  H.clear(); updUndo(); fit();
  FONTS.forEach(loadFont);
})();
window.__trazo = { P, CMD, setTool, setSel, get sel() { return sel; }, board, align, distribute, bool, rasterize, exportSVGString };
})();
