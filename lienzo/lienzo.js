/* Lienzo — editor de fotos en el navegador. */
(() => {
'use strict';
const { $, $$, clamp, esc, uid, el, icon, toast, busy, download, pickFiles, fileToImage, store, safeName, history } = T;

/* ---------- utilidades ---------- */
const newCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const cloneCanvas = c => { const n = newCanvas(c.width, c.height); n.getContext('2d').drawImage(c, 0, 0); return n; };
const hexRgb = hex => { const n = parseInt((hex || '#000000').slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const rgbHex = (r, g, b) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
const toBlob = (c, type = 'image/png', q) => new Promise(r => c.toBlob(r, type, q));
const FONTS = ['Figtree', 'Bricolage Grotesque', 'Anton', 'Bebas Neue', 'Playfair Display', 'Instrument Serif', 'Pacifico', 'Permanent Marker', 'JetBrains Mono', 'Arial', 'Georgia', 'Impact'];
const BLENDS = [['source-over', 'Normal'], ['multiply', 'Multiplicar'], ['screen', 'Trama'], ['overlay', 'Superponer'], ['darken', 'Oscurecer'], ['lighten', 'Aclarar'], ['color-dodge', 'Sobreexponer color'], ['color-burn', 'Subexponer color'], ['hard-light', 'Luz fuerte'], ['soft-light', 'Luz suave'], ['difference', 'Diferencia'], ['exclusion', 'Exclusión'], ['hue', 'Tono'], ['saturation', 'Saturación'], ['color', 'Color'], ['luminosity', 'Luminosidad']];

/* ---------- documento ---------- */
const D = { w: 1080, h: 1080, layers: [], active: null, sel: null, name: 'Sin título', pristine: true };
const layerById = id => D.layers.find(l => l.id === id);
const AL = () => layerById(D.active);
function makeLayer(name, w, h, extra = {}) {
  return Object.assign({ id: uid('l'), name, type: 'raster', canvas: newCanvas(w ?? D.w, h ?? D.h), x: 0, y: 0, visible: true, opacity: 1, blend: 'source-over', locked: false, text: null }, extra);
}
function insertLayer(L, above = true) {
  const i = D.layers.indexOf(AL());
  if (above && i >= 0) D.layers.splice(i + 1, 0, L); else D.layers.push(L);
  D.active = L.id;
}
let compDirty = true, viewDirty = true;
function changed(structure) {
  compDirty = true; viewDirty = true; D.pristine = false;
  if (structure) { renderLayers(); renderProps(); } else scheduleThumbs();
  scheduleSave();
}

/* ---------- historial ---------- */
const H = history(30);
function snap() {
  return {
    w: D.w, h: D.h, active: D.active,
    sel: D.sel ? { shapes: D.sel.shapes.map(s => s.type === 'mask' ? { ...s, canvas: cloneCanvas(s.canvas) } : JSON.parse(JSON.stringify(s))) } : null,
    layers: D.layers.map(L => ({ ...L, canvas: cloneCanvas(L.canvas), text: L.text ? { ...L.text } : null })),
  };
}
function restoreSnap(s) {
  tf = null; crop = null; stroke = null;
  D.w = s.w; D.h = s.h; D.active = s.active; D.layers = s.layers;
  D.sel = s.sel ? { shapes: s.sel.shapes } : null; if (D.sel) rebuildSel();
  resizeComp(); changed(true); updateUndo(); renderOpts();
}
function pushUndo() { H.push(snap()); updateUndo(); }
function undo() { if (tf) return cancelTransform(); const s = H.undo(snap()); if (s) restoreSnap(s); }
function redo() { const s = H.redo(snap()); if (s) restoreSnap(s); }
function updateUndo() { $('#undoBtn').disabled = !H.canUndo; $('#redoBtn').disabled = !H.canRedo; }

/* ---------- vista ---------- */
const vp = $('#vp'), cv = $('#view'), vx = cv.getContext('2d');
const view = { z: 1, ox: 0, oy: 0, dpr: 1, fitted: false };
let comp = newCanvas(D.w, D.h), cctx = comp.getContext('2d');
let mouse = null;
function resizeView() {
  const r = vp.getBoundingClientRect(); view.dpr = window.devicePixelRatio || 1;
  cv.width = Math.max(1, Math.round(r.width * view.dpr)); cv.height = Math.max(1, Math.round(r.height * view.dpr));
  viewDirty = true;
}
function fit() {
  const r = vp.getBoundingClientRect(); if (!r.width) return;
  const z = Math.min((r.width - 48) / D.w, (r.height - 48) / D.h, 2);
  view.z = Math.max(.02, z); view.ox = (r.width - D.w * view.z) / 2; view.oy = (r.height - D.h * view.z) / 2;
  view.fitted = true; viewDirty = true; updZoom();
}
function zoomAt(z, sx, sy) {
  const r = vp.getBoundingClientRect();
  if (sx == null) { sx = r.width / 2; sy = r.height / 2; }
  z = clamp(z, .02, 32);
  const dx = (sx - view.ox) / view.z, dy = (sy - view.oy) / view.z;
  view.z = z; view.ox = sx - dx * z; view.oy = sy - dy * z; viewDirty = true; updZoom();
}
function updZoom() { $('#zoomLbl').textContent = Math.round(view.z * 100) + '%'; }
new ResizeObserver(() => { resizeView(); if (!view.fitted) fit(); }).observe(vp);
function toDoc(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left - view.ox) / view.z, (e.clientY - r.top - view.oy) / view.z]; }
function resizeComp() { if (comp.width !== D.w || comp.height !== D.h) { comp.width = D.w; comp.height = D.h; } compDirty = true; $('#stSize').textContent = `${D.w} × ${D.h} px`; }

let checker = null;
function checkerPattern() {
  if (!checker) {
    const c = newCanvas(16, 16), g = c.getContext('2d');
    g.fillStyle = '#d9d9d9'; g.fillRect(0, 0, 16, 16); g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, 8, 8); g.fillRect(8, 8, 8, 8);
    checker = vx.createPattern(c, 'repeat');
  }
  return checker;
}

/* ---------- composición ---------- */
function layerSource(L) {
  if (stroke && stroke.L === L) return strokePreview();
  return L.canvas;
}
function drawLayers(g, { preview = true } = {}) {
  for (const L of D.layers) {
    if (!L.visible) continue;
    g.globalAlpha = L.opacity; g.globalCompositeOperation = L.blend || 'source-over';
    if (preview && tf && tf.L === L) {
      g.save(); g.translate(tf.cx, tf.cy); g.rotate(tf.rot); g.scale(tf.sx, tf.sy);
      g.drawImage(L.canvas, -L.canvas.width / 2, -L.canvas.height / 2); g.restore();
    } else g.drawImage(preview ? layerSource(L) : L.canvas, L.x, L.y);
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}
function composite() {
  cctx.setTransform(1, 0, 0, 1, 0, 0); cctx.clearRect(0, 0, D.w, D.h);
  drawLayers(cctx); compDirty = false;
}
function flatten(scale = 1, bg = null) {
  const c = newCanvas(D.w * scale, D.h * scale), g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); }
  g.imageSmoothingQuality = 'high'; g.scale(scale, scale); drawLayers(g, { preview: false });
  return c;
}

/* ---------- dibujo de la vista ---------- */
let antsT = 0;
function draw() {
  if (compDirty) composite();
  const dpr = view.dpr, z = view.z;
  vx.setTransform(1, 0, 0, 1, 0, 0); vx.fillStyle = '#0b0d10'; vx.fillRect(0, 0, cv.width, cv.height);
  vx.setTransform(dpr * z, 0, 0, dpr * z, dpr * view.ox, dpr * view.oy);
  vx.shadowColor = 'rgba(0,0,0,.5)'; vx.shadowBlur = 24 / z * dpr; vx.fillStyle = '#000'; vx.fillRect(0, 0, D.w, D.h); vx.shadowBlur = 0; vx.shadowColor = 'transparent';
  const pat = checkerPattern(); if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(1 / z));
  vx.fillStyle = pat; vx.fillRect(0, 0, D.w, D.h);
  vx.imageSmoothingEnabled = z < 2; vx.drawImage(comp, 0, 0);
  vx.imageSmoothingEnabled = true;
  drawOverlay(z);
  viewDirty = false;
}
function antsPath(g, s) {
  if (s.type === 'rect') g.rect(s.x, s.y, s.w, s.h);
  else if (s.type === 'ellipse') g.ellipse(s.x + s.w / 2, s.y + s.h / 2, Math.abs(s.w / 2), Math.abs(s.h / 2), 0, 0, Math.PI * 2);
  else if (s.type === 'poly' && s.pts.length > 2) { g.moveTo(s.pts[0][0], s.pts[0][1]); s.pts.forEach(p => g.lineTo(p[0], p[1])); g.closePath(); }
}
function ants(g, z, drawFn) {
  g.lineWidth = 1 / z; g.setLineDash([5 / z, 5 / z]);
  g.strokeStyle = '#000'; g.lineDashOffset = 0; g.beginPath(); drawFn(); g.stroke();
  g.strokeStyle = '#fff'; g.lineDashOffset = 5 / z + (antsT / 60) / z; g.beginPath(); drawFn(); g.stroke();
  g.setLineDash([]);
}
let selTint = null;
function drawOverlay(z) {
  const g = vx;
  // selección
  if (D.sel) {
    const vec = D.sel.shapes.filter(s => s.type !== 'mask');
    if (D.sel.shapes.some(s => s.type === 'mask' || s.mode === 'sub')) {
      if (!selTint || selTint.width !== D.w || selTint.height !== D.h || D.sel.tintDirty) {
        selTint = selTint && selTint.width === D.w && selTint.height === D.h ? selTint : newCanvas(D.w, D.h);
        const tg = selTint.getContext('2d'); tg.clearRect(0, 0, D.w, D.h); tg.drawImage(D.sel.mask, 0, 0);
        tg.globalCompositeOperation = 'source-in'; tg.fillStyle = 'rgba(54,194,180,.28)'; tg.fillRect(0, 0, D.w, D.h); tg.globalCompositeOperation = 'source-over';
        D.sel.tintDirty = false;
      }
      g.drawImage(selTint, 0, 0);
    }
    if (vec.length) ants(g, z, () => vec.forEach(s => antsPath(g, s)));
  }
  // forma temporal de selección
  if (act && act.selShape) ants(g, z, () => antsPath(g, act.selShape));
  // capa activa con herramienta mover
  const L = AL();
  if (L && tool === 'move' && !tf && L.visible) {
    g.strokeStyle = 'rgba(54,194,180,.8)'; g.lineWidth = 1 / z; g.setLineDash([4 / z, 3 / z]);
    g.strokeRect(L.x, L.y, L.canvas.width, L.canvas.height); g.setLineDash([]);
  }
  // transformar
  if (tf) {
    const pts = tfCorners();
    g.strokeStyle = '#36c2b4'; g.lineWidth = 1.5 / z; g.beginPath(); pts.forEach((p, i) => g[i ? 'lineTo' : 'moveTo'](p[0], p[1])); g.closePath(); g.stroke();
    const rh = tfRotHandle();
    g.beginPath(); g.moveTo((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2); g.lineTo(rh[0], rh[1]); g.stroke();
    [...pts, rh].forEach((p, i) => { g.fillStyle = i === 4 ? '#36c2b4' : '#fff'; g.beginPath(); g.arc(p[0], p[1], 5 / z, 0, Math.PI * 2); g.fill(); g.stroke(); });
  }
  // recorte
  if (crop) {
    const { x, y, w, h } = normRect(crop);
    g.fillStyle = 'rgba(0,0,0,.55)';
    g.beginPath(); g.rect(-1e5, -1e5, 2e5, 2e5); g.rect(x, y, w, h); g.fill('evenodd');
    g.strokeStyle = '#fff'; g.lineWidth = 1 / z; g.strokeRect(x, y, w, h);
    g.strokeStyle = 'rgba(255,255,255,.35)';
    for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo(x + w * i / 3, y); g.lineTo(x + w * i / 3, y + h); g.moveTo(x, y + h * i / 3); g.lineTo(x + w, y + h * i / 3); g.stroke(); }
  }
  // degradado y forma en curso
  if (act && act.type === 'gradient') { g.strokeStyle = '#fff'; g.lineWidth = 1.5 / z; g.beginPath(); g.moveTo(act.p0[0], act.p0[1]); g.lineTo(act.p1[0], act.p1[1]); g.stroke(); [act.p0, act.p1].forEach(p => { g.beginPath(); g.arc(p[0], p[1], 4 / z, 0, 7); g.fillStyle = '#fff'; g.fill(); }); }
  if (act && act.type === 'shape') { g.save(); g.globalAlpha = .85; shapeDraw(g, act.p0, act.p1, act.shift); g.restore(); }
  if (act && act.type === 'lasso' && act.pts.length > 1) ants(g, z, () => { g.moveTo(act.pts[0][0], act.pts[0][1]); act.pts.forEach(p => g.lineTo(p[0], p[1])); });
  // cursor del pincel
  if (mouse && ['brush', 'eraser', 'clone'].includes(tool) && !tf) {
    g.lineWidth = 1 / z; g.strokeStyle = 'rgba(0,0,0,.7)'; g.beginPath(); g.arc(mouse[0], mouse[1], opt.size / 2, 0, 7); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(mouse[0], mouse[1], opt.size / 2 + 1 / z, 0, 7); g.stroke();
  }
  if (tool === 'clone' && cloneSrc) { const [x, y] = stroke && stroke.off ? [mouse[0] + stroke.off[0], mouse[1] + stroke.off[1]] : cloneSrc; g.strokeStyle = '#fff'; g.lineWidth = 1.5 / z; g.beginPath(); g.moveTo(x - 8 / z, y); g.lineTo(x + 8 / z, y); g.moveTo(x, y - 8 / z); g.lineTo(x, y + 8 / z); g.stroke(); }
}
function loop(ts) {
  if (D.sel && ts - antsT > 120) { antsT = ts; viewDirty = true; }
  if (viewDirty || compDirty) draw();
  requestAnimationFrame(loop);
}

/* ---------- herramientas ---------- */
const TOOLS = [
  ['move', 'Mover', 'V', '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>'],
  ['rect', 'Selección rectangular', 'M', '<rect x="4" y="5" width="16" height="14" stroke-dasharray="3 2.5"/>'],
  ['ellipse', 'Selección elíptica', 'O', '<ellipse cx="12" cy="12" rx="8.5" ry="7" stroke-dasharray="3 2.5"/>'],
  ['lasso', 'Lazo', 'L', '<path d="M7 18c-2-1-3-3-3-5 0-4 4-8 9-8s7 3 7 6-3 6-8 6c-2 0-3 1-3 2.5S10 22 11 21" stroke-dasharray="3 2.5"/>'],
  ['wand', 'Varita mágica', 'W', '<path d="m4 20 11-11M15 4v2M19 8h2M18 5l1.5-1.5M15 9l2 2"/>'],
  ['crop', 'Recortar', 'C', '<path d="M6 2v16h16M2 6h16v16"/>'],
  ['brush', 'Pincel', 'B', '<path d="M18 3 9 12M9 12c-3 0-5 2-5 5 0 2-1 3-2 4 4 0 9-1 9-6"/>'],
  ['eraser', 'Borrador', 'E', '<path d="m7 21-4-4L14 6l6 6-9 9zM9 21h12M10 10l6 6"/>'],
  ['clone', 'Tampón de clonar', 'S', '<path d="M9 3h6v5H9zM12 8v4M5 12h14v4H5zM7 16v5h10v-5"/>'],
  ['fill', 'Bote de pintura', 'G', '<path d="m5 11 7-7 8 8-7 7a2 2 0 0 1-2.8 0L5 13.8A2 2 0 0 1 5 11zM5 12h15M20 16s2 2.2 2 3.5a2 2 0 0 1-4 0c0-1.3 2-3.5 2-3.5z"/>'],
  ['gradient', 'Degradado', 'R', '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 5v14M13 5v14M18 5v14" opacity=".5"/>'],
  ['shape', 'Formas', 'U', '<rect x="3" y="10" width="11" height="11" rx="1"/><circle cx="16" cy="8" r="5"/>'],
  ['text', 'Texto', 'T', '<path d="M5 5h14M12 5v15M9 20h6"/>'],
  ['picker', 'Cuentagotas', 'I', '<path d="m2 22 1-4 9-9 3 3-9 9zM14 4l6 6M16.5 2.5a2.1 2.1 0 0 1 3 3L17 8l-3-3z"/>'],
  ['hand', 'Mano', 'H', '<path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4L2.4 16a2 2 0 0 1 3-2.9L7 14.5"/>'],
  ['zoom', 'Zoom', 'Z', '<circle cx="11" cy="11" r="7"/><path d="m21 21-5-5M8 11h6M11 8v6"/>'],
];
const opt = { size: 30, hardness: .8, opacity: 1, tol: 32, contiguous: true, selMode: 'new', gradType: 'linear', gradTransparent: false, shape: 'rect', shapeFill: true, shapeStroke: 0, shapeNewLayer: true, font: 'Bricolage Grotesque', fontSize: 96, cropRatio: 'free', autoSelect: true, sampleAll: false };
const colors = { fg: '#1d2b3a', bg: '#ffffff' };
let tool = 'brush', act = null, stroke = null, tf = null, crop = null, cloneSrc = null, spaceDown = false;
function setTool(t) {
  if (tf && t !== 'move') applyTransform();
  if (crop && t !== 'crop') crop = null;
  tool = t; $$('.tool').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === t));
  vp.style.cursor = { hand: 'grab', zoom: 'zoom-in', text: 'text', picker: 'crosshair', move: 'move', brush: 'none', eraser: 'none', clone: 'none' }[t] || 'crosshair';
  renderOpts(); viewDirty = true;
}
$('#toolbar').innerHTML = TOOLS.map(([id, name, k, ic]) => `<button class="tool" data-tool="${id}" title="${name} (${k})" aria-label="${name}">${icon(ic)}<span class="k">${k}</span></button>`).join('');
$('#toolbar').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });

function rng(key, label, min, max, step, fmt = v => v) {
  return `<label class="o">${label}<input type="range" data-opt="${key}" min="${min}" max="${max}" step="${step}" value="${opt[key]}"><output>${fmt(opt[key])}</output></label>`;
}
const pct = v => Math.round(v * 100) + '%';
function renderOpts() {
  const name = (TOOLS.find(t => t[0] === tool) || [0, ''])[1];
  let h = `<span class="tname">${tf ? 'Transformar' : name}</span>`;
  if (tf) h += `<span class="hint">Arrastrá las esquinas para escalar (Mayús: libre), afuera para rotar y adentro para mover.</span><button class="btn small primary" data-cmd="applyTransform">Aplicar (Enter)</button><button class="btn small" data-cmd="cancelTransform">Cancelar (Esc)</button>`;
  else switch (tool) {
    case 'brush': case 'eraser': case 'clone':
      h += rng('size', 'Tamaño', 1, 500, 1, v => v + ' px') + rng('hardness', 'Dureza', 0, 1, .01, pct) + rng('opacity', 'Opacidad', .01, 1, .01, pct);
      if (tool === 'clone') h += `<span class="hint">${cloneSrc ? 'Origen elegido. Pintá para clonar.' : 'Alt + clic para elegir el origen.'}</span>`;
      break;
    case 'fill': h += rng('tol', 'Tolerancia', 0, 255, 1) + rng('opacity', 'Opacidad', .01, 1, .01, pct) + `<label class="o"><input type="checkbox" data-opt="contiguous" ${opt.contiguous ? 'checked' : ''}>Contiguo</label>`; break;
    case 'wand': h += rng('tol', 'Tolerancia', 0, 255, 1) + `<label class="o"><input type="checkbox" data-opt="contiguous" ${opt.contiguous ? 'checked' : ''}>Contiguo</label>` + selModeHTML(); break;
    case 'rect': case 'ellipse': case 'lasso': h += selModeHTML() + `<button class="btn small" data-cmd="selAll">Todo</button><button class="btn small" data-cmd="deselect">Deseleccionar</button><button class="btn small" data-cmd="invertSel">Invertir</button>`; break;
    case 'gradient': h += `<label class="o">Tipo <select class="sel" data-opt="gradType"><option value="linear"${opt.gradType === 'linear' ? ' selected' : ''}>Lineal</option><option value="radial"${opt.gradType === 'radial' ? ' selected' : ''}>Radial</option></select></label>` + `<label class="o"><input type="checkbox" data-opt="gradTransparent" ${opt.gradTransparent ? 'checked' : ''}>Hacia transparente</label>` + rng('opacity', 'Opacidad', .01, 1, .01, pct) + `<span class="hint">Arrastrá sobre la imagen.</span>`; break;
    case 'shape': h += `<label class="o">Forma <select class="sel" data-opt="shape">${[['rect', 'Rectángulo'], ['round', 'Redondeado'], ['ellipse', 'Elipse'], ['triangle', 'Triángulo'], ['star', 'Estrella'], ['line', 'Línea'], ['arrow', 'Flecha']].map(([v, n]) => `<option value="${v}"${opt.shape === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label><label class="o"><input type="checkbox" data-opt="shapeFill" ${opt.shapeFill ? 'checked' : ''}>Relleno</label>` + rng('shapeStroke', 'Borde', 0, 60, 1, v => v + ' px') + `<label class="o"><input type="checkbox" data-opt="shapeNewLayer" ${opt.shapeNewLayer ? 'checked' : ''}>En capa nueva</label><span class="hint">Relleno: color principal · borde: secundario</span>`; break;
    case 'text': h += `<label class="o">Fuente <select class="sel" data-opt="font">${FONTS.map(f => `<option${f === opt.font ? ' selected' : ''}>${f}</option>`).join('')}</select></label>` + rng('fontSize', 'Tamaño', 8, 400, 1, v => v + ' px') + `<span class="hint">Hacé clic en la imagen para escribir.</span>`; break;
    case 'crop': h += `<label class="o">Proporción <select class="sel" data-opt="cropRatio">${[['free', 'Libre'], ['1', '1:1'], ['0.8', '4:5'], ['1.7778', '16:9'], ['0.5625', '9:16'], ['1.3333', '4:3'], ['0.7071', 'A4 vertical']].map(([v, n]) => `<option value="${v}"${opt.cropRatio === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label>` + (crop ? `<button class="btn small primary" data-cmd="applyCrop">Recortar (Enter)</button><button class="btn small" data-cmd="cancelCrop">Cancelar</button>` : `<span class="hint">Arrastrá para marcar el área que querés conservar.</span>`); break;
    case 'move': h += `<label class="o"><input type="checkbox" data-opt="autoSelect" ${opt.autoSelect ? 'checked' : ''}>Elegir capa con el clic</label><button class="btn small" data-cmd="transform">Transformar (Ctrl+T)</button><button class="btn small" data-cmd="centerLayer">Centrar</button><button class="btn small" data-cmd="layerFlipH">Voltear ↔</button><button class="btn small" data-cmd="layerFlipV">Voltear ↕</button>`; break;
    case 'picker': h += `<span class="hint">Clic: color principal · Alt + clic: secundario</span>`; break;
    case 'hand': h += `<span class="hint">Arrastrá para moverte. También podés mantener Espacio con cualquier herramienta.</span>`; break;
    case 'zoom': h += `<span class="hint">Clic: acercar · Alt + clic: alejar · rueda del mouse en cualquier momento</span><button class="btn small" data-cmd="zoomFit">Ajustar</button><button class="btn small" data-cmd="zoom100">100%</button>`; break;
  }
  $('#optbar').innerHTML = h;
}
function selModeHTML() { return `<div class="chips">${[['new', 'Nueva'], ['add', 'Sumar'], ['sub', 'Restar']].map(([v, n]) => `<button class="chip" data-selmode="${v}" aria-pressed="${opt.selMode === v}">${n}</button>`).join('')}</div>`; }
$('#optbar').addEventListener('input', e => {
  const k = e.target.dataset.opt; if (!k) return;
  opt[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'range' ? parseFloat(e.target.value) : e.target.value;
  const out = e.target.parentElement.querySelector('output');
  if (out) out.textContent = k === 'size' || k === 'shapeStroke' || k === 'fontSize' ? opt[k] + ' px' : ['hardness', 'opacity'].includes(k) ? pct(opt[k]) : opt[k];
  if (k === 'cropRatio' && crop) { constrainCrop(); }
  viewDirty = true;
});
$('#optbar').addEventListener('click', e => { const m = e.target.closest('[data-selmode]'); if (m) { opt.selMode = m.dataset.selmode; renderOpts(); } });

/* colores */
function renderSwatches() { $('#fgSw').style.background = colors.fg; $('#bgSw').style.background = colors.bg; $('#fgIn').value = colors.fg; $('#bgIn').value = colors.bg; }
$('#fgSw').onclick = () => $('#fgIn').click(); $('#bgSw').onclick = () => $('#bgIn').click();
$('#fgIn').oninput = e => { colors.fg = e.target.value; renderSwatches(); };
$('#bgIn').oninput = e => { colors.bg = e.target.value; renderSwatches(); };
$('#swapSw').onclick = () => { [colors.fg, colors.bg] = [colors.bg, colors.fg]; renderSwatches(); };

/* ---------- pincel ---------- */
let tipCache = null;
function getTip(size, hardness, color) {
  const key = `${size}|${hardness}|${color}`;
  if (tipCache && tipCache.key === key) return tipCache.c;
  const d = Math.max(1, Math.ceil(size)) + 2, c = newCanvas(d, d), g = c.getContext('2d'), r = size / 2;
  const [R, G, B] = hexRgb(color);
  if (hardness >= .99) { g.fillStyle = color; g.beginPath(); g.arc(d / 2, d / 2, Math.max(.5, r), 0, Math.PI * 2); g.fill(); }
  else {
    const gr = g.createRadialGradient(d / 2, d / 2, r * hardness, d / 2, d / 2, Math.max(.5, r));
    gr.addColorStop(0, `rgba(${R},${G},${B},1)`); gr.addColorStop(1, `rgba(${R},${G},${B},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, d, d);
  }
  tipCache = { key, c }; return c;
}
const editable = (L, allowText) => {
  if (!L) { toast('Primero creá o elegí una capa'); return false; }
  if (L.locked) { toast('La capa está bloqueada'); return false; }
  if (!L.visible) { toast('La capa está oculta'); return false; }
  if (L.type === 'text' && !allowText) { toast('Es una capa de texto. Usá Capa → Rasterizar texto para pintar encima.'); return false; }
  return true;
};
let prevC = null, maskedC = null;
function strokePreview() {
  const L = stroke.L, w = L.canvas.width, h = L.canvas.height;
  if (!prevC || prevC.width !== w || prevC.height !== h) prevC = newCanvas(w, h);
  const g = prevC.getContext('2d');
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, w, h); g.drawImage(L.canvas, 0, 0);
  let sc = stroke.canvas;
  if (D.sel) {
    if (!maskedC || maskedC.width !== w || maskedC.height !== h) maskedC = newCanvas(w, h);
    const mg = maskedC.getContext('2d'); mg.globalCompositeOperation = 'source-over'; mg.clearRect(0, 0, w, h); mg.drawImage(sc, 0, 0);
    mg.globalCompositeOperation = 'destination-in'; mg.drawImage(D.sel.mask, -L.x, -L.y); mg.globalCompositeOperation = 'source-over';
    sc = maskedC;
  }
  g.globalAlpha = opt.opacity; g.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  g.drawImage(sc, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  return prevC;
}
const dabC = newCanvas(2, 2);
function dab(x, y, pressure) {
  const s = stroke, size = Math.max(1, opt.size * pressure);
  const g = s.canvas.getContext('2d');
  if (s.tool === 'clone') {
    const tip = getTip(size, opt.hardness, '#000000'), d = tip.width;
    if (dabC.width !== d) { dabC.width = d; dabC.height = d; }
    const dg = dabC.getContext('2d'); dg.globalCompositeOperation = 'source-over'; dg.clearRect(0, 0, d, d);
    dg.drawImage(s.snap, x + s.off[0] - d / 2, y + s.off[1] - d / 2, d, d, 0, 0, d, d);
    dg.globalCompositeOperation = 'destination-in'; dg.drawImage(tip, 0, 0);
    g.drawImage(dabC, x - d / 2, y - d / 2);
  } else {
    const tip = getTip(size, opt.hardness, s.tool === 'eraser' ? '#000000' : colors.fg);
    g.drawImage(tip, x - tip.width / 2, y - tip.height / 2);
  }
}
function strokeTo(lx, ly, pressure) {
  const s = stroke, [px, py] = s.last;
  const dist = Math.hypot(lx - px, ly - py), spacing = Math.max(1, opt.size * pressure * .12);
  const n = Math.floor(dist / spacing);
  for (let i = 1; i <= n; i++) { const k = i * spacing / dist; dab(px + (lx - px) * k, py + (ly - py) * k, pressure); }
  if (n > 0) s.last = [px + (lx - px) * n * spacing / dist, py + (ly - py) * n * spacing / dist];
  compDirty = true;
}
function commitStroke() {
  const L = stroke.L, res = cloneCanvas(strokePreview());
  L.canvas = res; stroke = null; changed();
}

/* ---------- selección ---------- */
function rebuildSel() {
  if (!D.sel) return;
  if (!D.sel.mask || D.sel.mask.width !== D.w || D.sel.mask.height !== D.h) D.sel.mask = newCanvas(D.w, D.h);
  const g = D.sel.mask.getContext('2d'); g.clearRect(0, 0, D.w, D.h); g.fillStyle = '#000';
  for (const s of D.sel.shapes) {
    g.globalCompositeOperation = s.mode === 'sub' ? 'destination-out' : 'source-over';
    if (s.type === 'mask') g.drawImage(s.canvas, 0, 0);
    else { g.beginPath(); antsPath(g, s); g.fill(); }
  }
  g.globalCompositeOperation = 'source-over';
  D.sel.tintDirty = true; viewDirty = true;
}
function addSelShape(shape, mode) {
  if (mode === 'new' || !D.sel) D.sel = { shapes: [{ ...shape, mode: 'add' }] };
  else D.sel.shapes.push({ ...shape, mode });
  rebuildSel();
}
function selBBox() {
  if (!D.sel) return null;
  const m = D.sel.mask, d = m.getContext('2d').getImageData(0, 0, m.width, m.height).data;
  let x0 = m.width, y0 = m.height, x1 = -1, y1 = -1;
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) if (d[(y * m.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
function maskCanvas(c, offX, offY) { if (!D.sel) return c; const g = c.getContext('2d'); g.globalCompositeOperation = 'destination-in'; g.drawImage(D.sel.mask, -offX, -offY); g.globalCompositeOperation = 'source-over'; return c; }
function deselect() { if (!D.sel) return; D.sel = null; viewDirty = true; }
function selectAll() { D.sel = { shapes: [{ type: 'rect', x: 0, y: 0, w: D.w, h: D.h, mode: 'add' }] }; rebuildSel(); }
function invertSel() {
  const inv = newCanvas(D.w, D.h), g = inv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, D.w, D.h);
  if (D.sel) { g.globalCompositeOperation = 'destination-out'; g.drawImage(D.sel.mask, 0, 0); }
  D.sel = { shapes: [{ type: 'mask', canvas: inv, mode: 'add' }] }; rebuildSel();
}

/* ---------- relleno por inundación ---------- */
function floodMask(img, w, h, x0, y0, tol, contiguous) {
  const d = img.data, m = new Uint8Array(w * h), i0 = (y0 * w + x0) * 4;
  const r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2], a0 = d[i0 + 3];
  const match = i => { const p = i * 4, a = d[p + 3]; if (a0 === 0 && a === 0) return true; return Math.abs(d[p] - r0) <= tol && Math.abs(d[p + 1] - g0) <= tol && Math.abs(d[p + 2] - b0) <= tol && Math.abs(a - a0) <= tol; };
  if (!contiguous) { for (let i = 0; i < w * h; i++) if (match(i)) m[i] = 1; return m; }
  const stack = [x0, y0];
  while (stack.length) {
    const y = stack.pop(); let x = stack.pop();
    let i = y * w + x;
    while (x >= 0 && !m[i] && match(i)) { x--; i--; }
    x++; i++;
    let up = false, dn = false;
    while (x < w && !m[i] && match(i)) {
      m[i] = 1;
      if (y > 0) { const u = i - w; if (!m[u] && match(u)) { if (!up) { stack.push(x, y - 1); up = true; } } else up = false; }
      if (y < h - 1) { const v = i + w; if (!m[v] && match(v)) { if (!dn) { stack.push(x, y + 1); dn = true; } } else dn = false; }
      x++; i++;
    }
  }
  return m;
}
function maskToCanvas(m, w, h, color = '#000000') {
  const c = newCanvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), [r, gg, b] = hexRgb(color);
  for (let i = 0; i < m.length; i++) if (m[i]) { const p = i * 4; img.data[p] = r; img.data[p + 1] = gg; img.data[p + 2] = b; img.data[p + 3] = 255; }
  g.putImageData(img, 0, 0); return c;
}
function bucket(p) {
  const L = AL(); if (!editable(L)) return;
  const lx = Math.floor(p[0] - L.x), ly = Math.floor(p[1] - L.y), w = L.canvas.width, h = L.canvas.height;
  if (lx < 0 || ly < 0 || lx >= w || ly >= h) { toast('Hacé clic dentro de la capa'); return; }
  const img = L.canvas.getContext('2d').getImageData(0, 0, w, h);
  const fc = maskToCanvas(floodMask(img, w, h, lx, ly, opt.tol, opt.contiguous), w, h, colors.fg);
  maskCanvas(fc, L.x, L.y);
  pushUndo();
  const g = L.canvas.getContext('2d'); g.globalAlpha = opt.opacity; g.drawImage(fc, 0, 0); g.globalAlpha = 1;
  changed();
}
function wand(p, mode) {
  if (compDirty) composite();
  const x = Math.floor(p[0]), y = Math.floor(p[1]);
  if (x < 0 || y < 0 || x >= D.w || y >= D.h) return;
  const img = cctx.getImageData(0, 0, D.w, D.h);
  addSelShape({ type: 'mask', canvas: maskToCanvas(floodMask(img, D.w, D.h, x, y, opt.tol, opt.contiguous), D.w, D.h) }, mode);
}

/* ---------- formas y degradado ---------- */
function normRect(r) { return { x: Math.min(r.x0, r.x1), y: Math.min(r.y0, r.y1), w: Math.abs(r.x1 - r.x0), h: Math.abs(r.y1 - r.y0) }; }
function shapeDraw(g, p0, p1, shift) {
  let x0 = p0[0], y0 = p0[1], x1 = p1[0], y1 = p1[1];
  if (shift && !['line', 'arrow'].includes(opt.shape)) { const s = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); x1 = x0 + Math.sign(x1 - x0 || 1) * s; y1 = y0 + Math.sign(y1 - y0 || 1) * s; }
  const x = Math.min(x0, x1), y = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.fillStyle = colors.fg; g.strokeStyle = colors.bg; g.lineWidth = opt.shapeStroke;
  g.beginPath();
  switch (opt.shape) {
    case 'round': if (g.roundRect) g.roundRect(x, y, w, h, Math.min(w, h) * .18); else g.rect(x, y, w, h); break;
    case 'ellipse': g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); break;
    case 'triangle': g.moveTo(x + w / 2, y); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath(); break;
    case 'star': { const cx = x + w / 2, cy = y + h / 2; for (let i = 0; i < 10; i++) { const r = i % 2 ? .4 : 1, a = -Math.PI / 2 + i * Math.PI / 5; g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * w / 2 * r, cy + Math.sin(a) * h / 2 * r); } g.closePath(); break; }
    case 'line': case 'arrow': {
      g.strokeStyle = colors.fg; g.lineWidth = Math.max(2, opt.shapeStroke || 8);
      g.moveTo(x0, y0); g.lineTo(x1, y1);
      if (opt.shape === 'arrow') { const a = Math.atan2(y1 - y0, x1 - x0), L = Math.max(14, g.lineWidth * 3.5); g.moveTo(x1, y1); g.lineTo(x1 - L * Math.cos(a - .45), y1 - L * Math.sin(a - .45)); g.moveTo(x1, y1); g.lineTo(x1 - L * Math.cos(a + .45), y1 - L * Math.sin(a + .45)); }
      g.stroke(); return;
    }
    default: g.rect(x, y, w, h);
  }
  if (opt.shapeFill) g.fill();
  if (opt.shapeStroke > 0) g.stroke();
}
function commitShape(p0, p1, shift) {
  if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 3) return;
  pushUndo();
  let L = AL();
  if (opt.shapeNewLayer || !L || L.type === 'text' || L.locked) { L = makeLayer('Forma'); insertLayer(L); }
  const g = L.canvas.getContext('2d'); g.save(); g.translate(-L.x, -L.y); shapeDraw(g, p0, p1, shift); g.restore();
  changed(true);
}
function commitGradient(p0, p1) {
  const L = AL(); if (!editable(L)) return;
  if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 2) return;
  const w = L.canvas.width, h = L.canvas.height, c = newCanvas(w, h), g = c.getContext('2d');
  const a = [p0[0] - L.x, p0[1] - L.y], b = [p1[0] - L.x, p1[1] - L.y];
  const gr = opt.gradType === 'radial' ? g.createRadialGradient(a[0], a[1], 0, a[0], a[1], Math.hypot(b[0] - a[0], b[1] - a[1])) : g.createLinearGradient(a[0], a[1], b[0], b[1]);
  gr.addColorStop(0, colors.fg);
  const [r, gg, bb] = hexRgb(opt.gradTransparent ? colors.fg : colors.bg);
  gr.addColorStop(1, `rgba(${r},${gg},${bb},${opt.gradTransparent ? 0 : 1})`);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  maskCanvas(c, L.x, L.y);
  pushUndo();
  const lg = L.canvas.getContext('2d'); lg.globalAlpha = opt.opacity; lg.drawImage(c, 0, 0); lg.globalAlpha = 1;
  changed();
}

/* ---------- texto ---------- */
function renderText(L) {
  const t = L.text, g0 = newCanvas(2, 2).getContext('2d');
  const font = `${t.italic ? 'italic ' : ''}${t.weight} ${t.size}px "${t.font}", system-ui, sans-serif`;
  g0.font = font;
  const lines = String(t.text || ' ').split('\n'), lh = t.size * (t.lineHeight || 1.2);
  const widths = lines.map(l => g0.measureText(l).width);
  const pad = Math.ceil(t.size * .3 + (t.stroke || 0) + (t.shadow ? t.size * .2 : 0));
  const W = Math.ceil(Math.max(1, ...widths) + pad * 2), Hh = Math.ceil(lh * lines.length + pad * 2);
  const c = newCanvas(W, Hh), g = c.getContext('2d');
  g.font = font; g.textBaseline = 'middle'; g.lineJoin = 'round';
  lines.forEach((l, i) => {
    const y = pad + lh * (i + .5);
    const x = t.align === 'center' ? (W - widths[i]) / 2 : t.align === 'right' ? W - pad - widths[i] : pad;
    if (t.shadow) { g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = t.size * .18; g.shadowOffsetY = t.size * .05; }
    if (t.stroke > 0) { g.lineWidth = t.stroke * 2; g.strokeStyle = t.strokeColor; g.strokeText(l, x, y); g.shadowColor = 'transparent'; }
    g.fillStyle = t.color; g.fillText(l, x, y); g.shadowColor = 'transparent';
  });
  const old = L.canvas;
  if (t.align === 'center' && old && old.width > 2) L.x += (old.width - W) / 2;
  else if (t.align === 'right' && old && old.width > 2) L.x += old.width - W;
  L.canvas = c;
  if (document.fonts && !renderText.loaded.has(font)) {
    renderText.loaded.add(font);
    document.fonts.load(font).then(() => { if (L.type === 'text') { renderText(L); changed(); } }).catch(() => {});
  }
}
renderText.loaded = new Set();
function newTextLayer(p) {
  pushUndo();
  const L = makeLayer('Texto', 2, 2, { type: 'text', text: { text: 'Escribí acá', font: opt.font, size: opt.fontSize, color: colors.fg, weight: 700, italic: false, align: 'left', stroke: 0, strokeColor: '#ffffff', shadow: false, lineHeight: 1.2 } });
  renderText(L);
  L.x = Math.round(p[0]); L.y = Math.round(p[1] - L.canvas.height / 2);
  insertLayer(L); changed(true);
  setTimeout(() => { const ta = $('#pText'); if (ta) { ta.focus(); ta.select(); } }, 30);
}

/* ---------- transformar ---------- */
function startTransform() {
  const L = AL(); if (!L) { toast('Elegí una capa'); return; }
  if (L.locked) { toast('La capa está bloqueada'); return; }
  pushUndo();
  tf = { L, cx: L.x + L.canvas.width / 2, cy: L.y + L.canvas.height / 2, sx: 1, sy: 1, rot: 0 };
  if (tool !== 'move') setTool('move'); else renderOpts();
  compDirty = true;
}
function tfCorners() {
  const w = tf.L.canvas.width / 2 * tf.sx, h = tf.L.canvas.height / 2 * tf.sy, c = Math.cos(tf.rot), s = Math.sin(tf.rot);
  return [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => [tf.cx + x * c - y * s, tf.cy + x * s + y * c]);
}
function tfRotHandle() { const p = tfCorners(), mx = (p[0][0] + p[1][0]) / 2, my = (p[0][1] + p[1][1]) / 2, d = 28 / view.z; return [mx + Math.sin(tf.rot) * d, my - Math.cos(tf.rot) * d]; }
function applyTransform() {
  if (!tf) return;
  const { L } = tf;
  if (Math.abs(tf.sx - 1) < 1e-4 && Math.abs(tf.sy - 1) < 1e-4 && Math.abs(tf.rot) < 1e-4) {
    L.x = Math.round(tf.cx - L.canvas.width / 2); L.y = Math.round(tf.cy - L.canvas.height / 2);
  } else if (L.type === 'text' && Math.abs(tf.rot) < 1e-4) {
    const cx = tf.cx, cy = tf.cy; L.text.size = Math.max(4, Math.round(L.text.size * (tf.sx + tf.sy) / 2));
    L.canvas = newCanvas(2, 2); renderText(L); L.x = Math.round(cx - L.canvas.width / 2); L.y = Math.round(cy - L.canvas.height / 2);
  } else {
    if (L.type === 'text') { L.type = 'raster'; L.text = null; }
    const pts = tfCorners(), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const bx = Math.floor(Math.min(...xs)), by = Math.floor(Math.min(...ys)), bw = Math.ceil(Math.max(...xs)) - bx, bh = Math.ceil(Math.max(...ys)) - by;
    const c = newCanvas(bw, bh), g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.translate(tf.cx - bx, tf.cy - by); g.rotate(tf.rot); g.scale(tf.sx, tf.sy); g.drawImage(L.canvas, -L.canvas.width / 2, -L.canvas.height / 2);
    L.canvas = c; L.x = bx; L.y = by;
  }
  tf = null; changed(true); renderOpts();
}
function cancelTransform() { if (!tf) return; tf = null; const s = H.undo(snap()); if (s) restoreSnap(s); renderOpts(); }

/* ---------- recorte ---------- */
function constrainCrop() {
  if (!crop || opt.cropRatio === 'free') return;
  const r = parseFloat(opt.cropRatio), w = crop.x1 - crop.x0, h = crop.y1 - crop.y0;
  const nh = Math.abs(w) / r; crop.y1 = crop.y0 + Math.sign(h || 1) * nh; viewDirty = true;
}
function applyCrop() {
  if (!crop) return;
  const r = normRect(crop), x = Math.round(Math.max(-1e6, r.x)), y = Math.round(r.y), w = Math.round(r.w), h = Math.round(r.h);
  if (w < 2 || h < 2) { crop = null; renderOpts(); return; }
  pushUndo(); doCrop(x, y, w, h); crop = null; renderOpts();
}
function doCrop(x, y, w, h) {
  D.layers.forEach(L => { L.x -= x; L.y -= y; });
  D.w = w; D.h = h; D.sel = null; resizeComp(); fit(); changed(true);
}

/* ---------- eventos del puntero ---------- */
const pressureOf = e => e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 1;
function hitLayer(p) {
  for (let i = D.layers.length - 1; i >= 0; i--) {
    const L = D.layers[i]; if (!L.visible) continue;
    const x = Math.floor(p[0] - L.x), y = Math.floor(p[1] - L.y);
    if (x < 0 || y < 0 || x >= L.canvas.width || y >= L.canvas.height) continue;
    if (L.type === 'text') return L;
    try { if (L.canvas.getContext('2d').getImageData(x, y, 1, 1).data[3] > 10) return L; } catch (e) { return L; }
  }
  return null;
}
function selModeFor(e) { return e.shiftKey ? 'add' : e.altKey ? 'sub' : opt.selMode; }
cv.addEventListener('pointerdown', e => {
  if (e.button === 1 || spaceDown || tool === 'hand') { act = { type: 'pan', sx: e.clientX, sy: e.clientY, ox: view.ox, oy: view.oy }; cv.setPointerCapture(e.pointerId); vp.style.cursor = 'grabbing'; return; }
  if (e.button !== 0) return;
  const p = toDoc(e);
  cv.setPointerCapture(e.pointerId);
  if (tf) {
    const pts = tfCorners(), rh = tfRotHandle(), tol = 9 / view.z, near = q => Math.hypot(q[0] - p[0], q[1] - p[1]) < tol;
    const ci = pts.findIndex(near);
    if (near(rh)) act = { type: 'tfRot', a0: Math.atan2(p[1] - tf.cy, p[0] - tf.cx), r0: tf.rot };
    else if (ci >= 0) act = { type: 'tfScale', d0: Math.hypot(pts[ci][0] - tf.cx, pts[ci][1] - tf.cy), sx0: tf.sx, sy0: tf.sy };
    else if (insidePoly(p, pts)) act = { type: 'tfMove', p0: p, c0: [tf.cx, tf.cy] };
    else act = { type: 'tfRot', a0: Math.atan2(p[1] - tf.cy, p[0] - tf.cx), r0: tf.rot };
    return;
  }
  switch (tool) {
    case 'move': {
      let L = AL();
      if (opt.autoSelect) { const h = hitLayer(p); if (h) { L = h; if (D.active !== h.id) { D.active = h.id; renderLayers(); renderProps(); } } }
      if (!L) return; if (L.locked) { toast('La capa está bloqueada'); return; }
      act = { type: 'move', L, p0: p, o: [L.x, L.y], undo: snap(), moved: false };
      break;
    }
    case 'brush': case 'eraser': case 'clone': {
      if (tool === 'clone' && e.altKey) { cloneSrc = p; renderOpts(); viewDirty = true; return; }
      if (tool === 'clone' && !cloneSrc) { toast('Primero hacé Alt + clic donde querés copiar'); return; }
      const L = AL(); if (!editable(L)) return;
      pushUndo();
      stroke = { L, tool, canvas: newCanvas(L.canvas.width, L.canvas.height), last: [p[0] - L.x, p[1] - L.y] };
      if (tool === 'clone') { stroke.snap = cloneCanvas(L.canvas); stroke.off = [cloneSrc[0] - p[0], cloneSrc[1] - p[1]]; }
      dab(stroke.last[0], stroke.last[1], pressureOf(e)); compDirty = true; act = { type: 'stroke' };
      break;
    }
    case 'rect': case 'ellipse': act = { type: 'sel', mode: selModeFor(e), p0: p, selShape: null }; break;
    case 'lasso': act = { type: 'lasso', mode: selModeFor(e), pts: [p] }; break;
    case 'wand': wand(p, selModeFor(e)); break;
    case 'fill': bucket(p); break;
    case 'gradient': act = { type: 'gradient', p0: p, p1: p }; break;
    case 'shape': act = { type: 'shape', p0: p, p1: p, shift: e.shiftKey }; break;
    case 'text': {
      const h = hitLayer(p);
      if (h && h.type === 'text') { D.active = h.id; renderLayers(); renderProps(); setTimeout(() => $('#pText')?.focus(), 20); }
      else newTextLayer(p);
      break;
    }
    case 'picker': {
      if (compDirty) composite();
      const x = Math.floor(p[0]), y = Math.floor(p[1]); if (x < 0 || y < 0 || x >= D.w || y >= D.h) return;
      const d = cctx.getImageData(x, y, 1, 1).data; const hex = rgbHex(d[0], d[1], d[2]);
      if (e.altKey) colors.bg = hex; else colors.fg = hex; renderSwatches();
      act = { type: 'pick', alt: e.altKey };
      break;
    }
    case 'zoom': { const r = cv.getBoundingClientRect(); zoomAt(view.z * (e.altKey ? 1 / 1.6 : 1.6), e.clientX - r.left, e.clientY - r.top); break; }
    case 'crop': {
      if (crop) { const r = normRect(crop); if (p[0] > r.x && p[0] < r.x + r.w && p[1] > r.y && p[1] < r.y + r.h) { act = { type: 'cropMove', p0: p, c0: { ...crop } }; break; } }
      crop = { x0: p[0], y0: p[1], x1: p[0], y1: p[1] }; act = { type: 'crop' }; renderOpts();
      break;
    }
  }
  viewDirty = true;
});
function insidePoly(p, pts) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if (((yi > p[1]) !== (yj > p[1])) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; }
cv.addEventListener('pointermove', e => {
  const p = toDoc(e); mouse = p;
  $('#stPos').textContent = `x ${Math.round(p[0])} · y ${Math.round(p[1])}`;
  if (['brush', 'eraser', 'clone'].includes(tool)) viewDirty = true;
  if (!act) return;
  switch (act.type) {
    case 'pan': view.ox = act.ox + e.clientX - act.sx; view.oy = act.oy + e.clientY - act.sy; viewDirty = true; break;
    case 'stroke': {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of (evs.length ? evs : [e])) { const q = toDoc(ev); strokeTo(q[0] - stroke.L.x, q[1] - stroke.L.y, pressureOf(ev)); }
      break;
    }
    case 'move': {
      let dx = p[0] - act.p0[0], dy = p[1] - act.p0[1];
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      act.L.x = Math.round(act.o[0] + dx); act.L.y = Math.round(act.o[1] + dy); act.moved = true; compDirty = true;
      break;
    }
    case 'sel': {
      let x1 = p[0], y1 = p[1];
      if (e.shiftKey && act.mode !== 'add') { const s = Math.max(Math.abs(x1 - act.p0[0]), Math.abs(y1 - act.p0[1])); x1 = act.p0[0] + Math.sign(x1 - act.p0[0] || 1) * s; y1 = act.p0[1] + Math.sign(y1 - act.p0[1] || 1) * s; }
      const r = normRect({ x0: act.p0[0], y0: act.p0[1], x1, y1 });
      act.selShape = { type: tool === 'ellipse' ? 'ellipse' : 'rect', ...r }; viewDirty = true;
      break;
    }
    case 'lasso': { const l = act.pts[act.pts.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 2 / view.z) act.pts.push(p); viewDirty = true; break; }
    case 'gradient': act.p1 = p; viewDirty = true; break;
    case 'shape': act.p1 = p; act.shift = e.shiftKey; viewDirty = true; break;
    case 'pick': { if (compDirty) composite(); const x = Math.floor(p[0]), y = Math.floor(p[1]); if (x >= 0 && y >= 0 && x < D.w && y < D.h) { const d = cctx.getImageData(x, y, 1, 1).data; const hex = rgbHex(d[0], d[1], d[2]); if (act.alt) colors.bg = hex; else colors.fg = hex; renderSwatches(); } break; }
    case 'crop': crop.x1 = p[0]; crop.y1 = p[1]; constrainCrop(); viewDirty = true; break;
    case 'cropMove': { const dx = p[0] - act.p0[0], dy = p[1] - act.p0[1]; crop = { x0: act.c0.x0 + dx, y0: act.c0.y0 + dy, x1: act.c0.x1 + dx, y1: act.c0.y1 + dy }; viewDirty = true; break; }
    case 'tfMove': tf.cx = act.c0[0] + p[0] - act.p0[0]; tf.cy = act.c0[1] + p[1] - act.p0[1]; compDirty = true; break;
    case 'tfRot': { let r = act.r0 + Math.atan2(p[1] - tf.cy, p[0] - tf.cx) - act.a0; if (e.shiftKey) r = Math.round(r / (Math.PI / 12)) * Math.PI / 12; tf.rot = r; compDirty = true; break; }
    case 'tfScale': {
      if (e.shiftKey) {
        const c = Math.cos(-tf.rot), s = Math.sin(-tf.rot), dx = p[0] - tf.cx, dy = p[1] - tf.cy;
        const lx = dx * c - dy * s, ly = dx * s + dy * c;
        tf.sx = Math.max(.01, Math.abs(lx) / (tf.L.canvas.width / 2)); tf.sy = Math.max(.01, Math.abs(ly) / (tf.L.canvas.height / 2));
      } else { const k = Math.hypot(p[0] - tf.cx, p[1] - tf.cy) / act.d0; tf.sx = Math.max(.01, act.sx0 * k); tf.sy = Math.max(.01, act.sy0 * k); }
      compDirty = true; break;
    }
  }
});
cv.addEventListener('pointerleave', () => { mouse = null; viewDirty = true; });
function pointerEnd(e) {
  if (!act) return;
  const a = act; act = null;
  switch (a.type) {
    case 'pan': setTool(tool); break;
    case 'stroke': if (stroke) commitStroke(); break;
    case 'move': if (a.moved) { H.push(a.undo); updateUndo(); changed(); } break;
    case 'sel': if (a.selShape && a.selShape.w > 1 && a.selShape.h > 1) addSelShape(a.selShape, a.mode); else if (a.mode === 'new') deselect(); break;
    case 'lasso': if (a.pts.length > 3) addSelShape({ type: 'poly', pts: a.pts }, a.mode); else if (a.mode === 'new') deselect(); break;
    case 'gradient': commitGradient(a.p0, a.p1); break;
    case 'shape': commitShape(a.p0, a.p1, a.shift); break;
    case 'crop': { const r = normRect(crop); if (r.w < 3 || r.h < 3) crop = null; renderOpts(); break; }
  }
  viewDirty = true;
}
cv.addEventListener('pointerup', pointerEnd); cv.addEventListener('pointercancel', pointerEnd);
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const r = cv.getBoundingClientRect();
  if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 0 && !e.shiftKey) zoomAt(view.z * Math.pow(1.0015, -e.deltaY * (e.deltaMode === 1 ? 30 : 1)), e.clientX - r.left, e.clientY - r.top);
  else { view.ox -= e.deltaX || e.deltaY; viewDirty = true; }
}, { passive: false });
cv.addEventListener('dblclick', e => { if (tool === 'hand') fit(); });

/* ---------- panel de capas ---------- */
let thumbT = null;
function drawThumb(c, L) {
  const g = c.getContext('2d'), s = Math.min(c.width / D.w, c.height / D.h);
  g.clearRect(0, 0, c.width, c.height); g.save();
  g.translate((c.width - D.w * s) / 2, (c.height - D.h * s) / 2); g.scale(s, s);
  g.drawImage(L.canvas, L.x, L.y); g.restore();
}
function scheduleThumbs() { clearTimeout(thumbT); thumbT = setTimeout(() => { $$('.lrow').forEach(r => { const L = layerById(r.dataset.id); const c = r.querySelector('canvas'); if (L && c) drawThumb(c, L); }); }, 300); }
const EYE = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';
const LOCK = '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>';
function renderLayers() {
  const box = $('#layers');
  box.innerHTML = '';
  [...D.layers].reverse().forEach(L => {
    const r = el(`<div class="lrow${L.id === D.active ? ' on' : ''}" data-id="${L.id}" draggable="true" role="listitem">
      <button class="ib${L.visible ? '' : ' off'}" data-lact="vis" title="${L.visible ? 'Ocultar' : 'Mostrar'}" aria-label="${L.visible ? 'Ocultar capa' : 'Mostrar capa'}">${icon(EYE)}</button>
      <canvas width="80" height="80"></canvas>
      <div class="ln">${esc(L.name)}<small>${L.type === 'text' ? 'Texto' : BLENDS.find(b => b[0] === L.blend)?.[1] || 'Normal'} · ${Math.round(L.opacity * 100)}%</small></div>
      <button class="ib${L.locked ? '' : ' off'}" data-lact="lock" title="${L.locked ? 'Desbloquear' : 'Bloquear'}" aria-label="Bloquear capa">${icon(LOCK)}</button></div>`);
    drawThumb(r.querySelector('canvas'), L);
    box.appendChild(r);
  });
  if (!D.layers.length) box.innerHTML = '<p class="hint" style="padding:8px">No hay capas. Creá una con el botón +.</p>';
}
let dragId = null;
$('#layers').addEventListener('click', e => {
  const row = e.target.closest('.lrow'); if (!row) return;
  const L = layerById(row.dataset.id); const b = e.target.closest('[data-lact]');
  if (b) { pushUndo(); if (b.dataset.lact === 'vis') L.visible = !L.visible; else L.locked = !L.locked; changed(true); return; }
  if (D.active !== L.id) { if (tf) applyTransform(); D.active = L.id; renderLayers(); renderProps(); viewDirty = true; }
});
$('#layers').addEventListener('dblclick', e => {
  const row = e.target.closest('.lrow'); if (!row || e.target.closest('[data-lact]')) return;
  const L = layerById(row.dataset.id), ln = row.querySelector('.ln');
  const inp = el(`<input value="${esc(L.name)}" aria-label="Nombre de la capa">`); ln.replaceWith(inp); inp.focus(); inp.select();
  const done = () => { const v = inp.value.trim(); if (v && v !== L.name) { pushUndo(); L.name = v; } renderLayers(); renderProps(); scheduleSave(); };
  inp.addEventListener('blur', done); inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') inp.blur(); if (ev.key === 'Escape') { inp.value = L.name; inp.blur(); } });
});
$('#layers').addEventListener('dragstart', e => { const row = e.target.closest('.lrow'); if (!row) return; dragId = row.dataset.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); });
$('#layers').addEventListener('dragover', e => { if (!dragId) return; e.preventDefault(); $$('.lrow').forEach(r => r.classList.remove('drop-before')); e.target.closest('.lrow')?.classList.add('drop-before'); });
$('#layers').addEventListener('drop', e => {
  if (!dragId) return; e.preventDefault();
  const row = e.target.closest('.lrow'); const L = layerById(dragId); dragId = null;
  if (!row || !L || row.dataset.id === L.id) { renderLayers(); return; }
  pushUndo();
  D.layers.splice(D.layers.indexOf(L), 1);
  const target = layerById(row.dataset.id); D.layers.splice(D.layers.indexOf(target) + 1, 0, L);
  changed(true);
});
$('#layers').addEventListener('dragend', () => { dragId = null; $$('.lrow').forEach(r => r.classList.remove('drop-before')); });

/* ---------- propiedades ---------- */
function renderProps() {
  const box = $('#props'), L = AL();
  if (!L) { box.innerHTML = `<div class="sec"><h3>Documento</h3><p class="hint">${D.w} × ${D.h} px · ${D.layers.length} capas</p></div>`; return; }
  let h = '';
  if (L.type === 'text') {
    const t = L.text;
    h += `<div class="sec"><h3>Texto</h3>
      <textarea id="pText" rows="3" aria-label="Texto" style="width:100%;background:var(--panel-2);border:1px solid var(--line);border-radius:6px;padding:6px 8px">${esc(t.text)}</textarea>
      <div class="f wide"><label for="pFont">Fuente</label><select id="pFont">${FONTS.map(f => `<option${f === t.font ? ' selected' : ''}>${f}</option>`).join('')}</select></div>
      <div class="f"><label for="pSize">Tamaño</label><input type="range" id="pSize" min="6" max="500" value="${t.size}"><output>${t.size}</output></div>
      <div class="f wide"><label for="pColor">Color</label><input type="color" id="pColor" value="${t.color}"></div>
      <div class="f wide"><label for="pWeight">Grosor</label><select id="pWeight">${[[400, 'Normal'], [600, 'Semi'], [700, 'Negrita'], [900, 'Black']].map(([v, n]) => `<option value="${v}"${+t.weight === v ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="chips">${[['left', 'Izq.'], ['center', 'Centro'], ['right', 'Der.']].map(([v, n]) => `<button class="chip" data-talign="${v}" aria-pressed="${t.align === v}">${n}</button>`).join('')}<button class="chip" data-titalic aria-pressed="${t.italic}"><i>Cursiva</i></button><button class="chip" data-tshadow aria-pressed="${t.shadow}">Sombra</button></div>
      <div class="f"><label for="pStroke">Contorno</label><input type="range" id="pStroke" min="0" max="40" value="${t.stroke}"><output>${t.stroke}</output></div>
      <div class="f wide"><label for="pStrokeC">Color borde</label><input type="color" id="pStrokeC" value="${t.strokeColor}"></div>
      <button class="btn small" data-cmd="rasterize">Rasterizar texto</button></div>`;
  }
  h += `<div class="sec"><h3>Capa</h3>
    <div class="f wide"><label for="pName">Nombre</label><input type="text" id="pName" value="${esc(L.name)}"></div>
    <div class="f"><label for="pOp">Opacidad</label><input type="range" id="pOp" min="0" max="1" step=".01" value="${L.opacity}"><output>${Math.round(L.opacity * 100)}%</output></div>
    <div class="f wide"><label for="pBlend">Fusión</label><select id="pBlend">${BLENDS.map(([v, n]) => `<option value="${v}"${L.blend === v ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="f wide"><label>Posición</label><div class="row-btns"><input type="number" id="pX" value="${Math.round(L.x)}" class="inp" style="width:76px" aria-label="X"><input type="number" id="pY" value="${Math.round(L.y)}" class="inp" style="width:76px" aria-label="Y"></div></div>
    <p class="hint">${L.canvas.width} × ${L.canvas.height} px</p>
    <div class="row-btns"><button class="btn small" data-cmd="transform">Transformar</button><button class="btn small" data-cmd="centerLayer">Centrar</button>${L.type !== 'text' ? '<button class="btn small" data-cmd="removeBg">Quitar fondo (IA)</button>' : ''}</div></div>`;
  box.innerHTML = h;
}
let propPre = null;
$('#props').addEventListener('focusin', () => { propPre = snap(); });
$('#props').addEventListener('pointerdown', () => { if (!propPre) propPre = snap(); });
$('#props').addEventListener('input', e => {
  const L = AL(); if (!L) return; const id = e.target.id, v = e.target.value;
  if (!propPre) propPre = snap();
  const t = L.text;
  switch (id) {
    case 'pText': t.text = v; renderText(L); break;
    case 'pFont': t.font = v; renderText(L); break;
    case 'pSize': t.size = +v; renderText(L); e.target.nextElementSibling.textContent = v; break;
    case 'pColor': t.color = v; renderText(L); break;
    case 'pWeight': t.weight = +v; renderText(L); break;
    case 'pStroke': t.stroke = +v; renderText(L); e.target.nextElementSibling.textContent = v; break;
    case 'pStrokeC': t.strokeColor = v; renderText(L); break;
    case 'pName': L.name = v; break;
    case 'pOp': L.opacity = +v; e.target.nextElementSibling.textContent = Math.round(v * 100) + '%'; break;
    case 'pBlend': L.blend = v; break;
    case 'pX': L.x = +v || 0; break;
    case 'pY': L.y = +v || 0; break;
  }
  compDirty = true; scheduleThumbs(); scheduleSave();
});
$('#props').addEventListener('change', () => { if (propPre) { H.push(propPre); propPre = null; updateUndo(); renderLayers(); } });
$('#props').addEventListener('click', e => {
  const L = AL(); if (!L || !L.text) return;
  const a = e.target.closest('[data-talign]'), it = e.target.closest('[data-titalic]'), sh = e.target.closest('[data-tshadow]');
  if (!a && !it && !sh) return;
  propPre = null; pushUndo();
  if (a) L.text.align = a.dataset.talign; if (it) L.text.italic = !L.text.italic; if (sh) L.text.shadow = !L.text.shadow;
  renderText(L); changed(true);
});

/* ---------- ajustes y filtros ---------- */
function cssOp(src, css) { const c = newCanvas(src.width, src.height), g = c.getContext('2d'); g.filter = css; g.drawImage(src, 0, 0); return c; }
function pixOp(src, fn) {
  const c = cloneCanvas(src), g = c.getContext('2d'), img = g.getImageData(0, 0, c.width, c.height);
  fn(img.data, c.width, c.height); g.putImageData(img, 0, 0); return c;
}
function convolve(src, k, mix = 1) {
  return pixOp(src, (d, w, h) => {
    const s = new Uint8ClampedArray(d), n = Math.sqrt(k.length) | 0, half = n >> 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let ky = 0; ky < n; ky++) for (let kx = 0; kx < n; kx++) {
        const yy = clamp(y + ky - half, 0, h - 1), xx = clamp(x + kx - half, 0, w - 1), p = (yy * w + xx) * 4, kv = k[ky * n + kx];
        r += s[p] * kv; g += s[p + 1] * kv; b += s[p + 2] * kv;
      }
      const p = (y * w + x) * 4;
      d[p] = s[p] + (r - s[p]) * mix; d[p + 1] = s[p + 1] + (g - s[p + 1]) * mix; d[p + 2] = s[p + 2] + (b - s[p + 2]) * mix;
    }
  });
}
const LOOKS = [['Original', 'none'], ['Cálido', 'sepia(.25) saturate(1.25) brightness(1.04)'], ['Frío', 'hue-rotate(12deg) saturate(.9) contrast(1.05)'], ['Vívido', 'saturate(1.65) contrast(1.12)'], ['Vintage', 'sepia(.45) contrast(.9) brightness(1.06) saturate(.8)'], ['Noir', 'grayscale(1) contrast(1.5) brightness(.92)'], ['Mate', 'contrast(.84) brightness(1.08) saturate(.82)'], ['Dorado', 'sepia(.3) saturate(1.3) hue-rotate(-10deg) contrast(1.08)'], ['Noche', 'brightness(.8) contrast(1.2) saturate(.7) hue-rotate(190deg)'], ['Pastel', 'brightness(1.12) contrast(.85) saturate(.8)'], ['Cine', 'contrast(1.15) saturate(.88) sepia(.12) hue-rotate(-6deg)'], ['Drama', 'contrast(1.4) saturate(1.2) brightness(.95)']];
const ADJ = {
  bc: { name: 'Brillo y contraste', p: [['b', 'Brillo', -100, 100, 0], ['c', 'Contraste', -100, 100, 0]], fn: (s, p) => cssOp(s, `brightness(${100 + p.b}%) contrast(${100 + p.c}%)`) },
  hs: { name: 'Tono y saturación', p: [['h', 'Tono', -180, 180, 0], ['s', 'Saturación', -100, 100, 0], ['l', 'Luminosidad', -100, 100, 0]], fn: (s, p) => cssOp(s, `hue-rotate(${p.h}deg) saturate(${100 + p.s}%) brightness(${100 + p.l * .6}%)`) },
  temp: { name: 'Temperatura y tinte', p: [['t', 'Temperatura', -100, 100, 0], ['g', 'Tinte', -100, 100, 0]], fn: (s, p) => pixOp(s, d => { const t = p.t * .5, g = p.g * .4; for (let i = 0; i < d.length; i += 4) { d[i] += t; d[i + 2] -= t; d[i + 1] -= g; } }) },
  levels: { name: 'Niveles', p: [['lo', 'Negros', 0, 200, 0], ['hi', 'Blancos', 55, 255, 255], ['ga', 'Medios (gamma)', .2, 3, 1, .01]], fn: (s, p) => pixOp(s, d => { const lut = new Uint8ClampedArray(256), rng = Math.max(1, p.hi - p.lo); for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(clamp((v - p.lo) / rng, 0, 1), 1 / p.ga); for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; } }) },
  vibrance: { name: 'Intensidad', p: [['v', 'Intensidad', -100, 100, 0]], fn: (s, p) => pixOp(s, d => { const a = p.v / 100; for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), avg = (r + g + b) / 3, amt = (Math.abs(mx - avg) * 2 / 255) * -3 * a; d[i] += r !== mx ? (mx - r) * amt : 0; d[i + 1] += g !== mx ? (mx - g) * amt : 0; d[i + 2] += b !== mx ? (mx - b) * amt : 0; } }) },
  posterize: { name: 'Posterizar', p: [['n', 'Niveles', 2, 32, 5]], fn: (s, p) => pixOp(s, d => { const st = 255 / (p.n - 1); for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = Math.round(d[i + c] / st) * st; }) },
  threshold: { name: 'Umbral', p: [['t', 'Umbral', 1, 254, 128]], fn: (s, p) => pixOp(s, d => { for (let i = 0; i < d.length; i += 4) { const v = (d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114) >= p.t ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; } }) },
  blur: { name: 'Desenfocar', p: [['r', 'Radio', 0, 80, 4, .5]], fn: (s, p) => cssOp(s, `blur(${p.r}px)`) },
  sharpen: { name: 'Enfocar', p: [['a', 'Cantidad', 0, 200, 60]], fn: (s, p) => convolve(s, [0, -1, 0, -1, 5, -1, 0, -1, 0], p.a / 100) },
  noise: { name: 'Ruido', p: [['a', 'Cantidad', 0, 100, 20], ['m', 'Monocromático (0/1)', 0, 1, 1]], fn: (s, p) => pixOp(s, d => { const a = p.a * 1.6; for (let i = 0; i < d.length; i += 4) { if (p.m >= .5) { const n = (Math.random() - .5) * a; d[i] += n; d[i + 1] += n; d[i + 2] += n; } else { d[i] += (Math.random() - .5) * a; d[i + 1] += (Math.random() - .5) * a; d[i + 2] += (Math.random() - .5) * a; } } }) },
  pixelate: { name: 'Pixelar', p: [['s', 'Tamaño del bloque', 2, 120, 12]], fn: (s, p) => { const w = Math.max(1, Math.round(s.width / p.s)), h = Math.max(1, Math.round(s.height / p.s)), sm = newCanvas(w, h); sm.getContext('2d').drawImage(s, 0, 0, w, h); const c = newCanvas(s.width, s.height), g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(sm, 0, 0, s.width, s.height); return c; } },
  vignette: { name: 'Viñeta', p: [['a', 'Intensidad', 0, 100, 55], ['r', 'Tamaño', 10, 100, 60]], fn: (s, p) => { const c = cloneCanvas(s), g = c.getContext('2d'), w = c.width, h = c.height, R = Math.hypot(w, h) / 2; const gr = g.createRadialGradient(w / 2, h / 2, R * p.r / 100 * .6, w / 2, h / 2, R); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${p.a / 100})`); g.globalCompositeOperation = 'source-atop'; g.fillStyle = gr; g.fillRect(0, 0, w, h); return c; } },
  emboss: { name: 'Relieve', p: [['a', 'Cantidad', 0, 100, 100]], fn: (s, p) => convolve(s, [-2, -1, 0, -1, 1, 1, 0, 1, 2], p.a / 100) },
  edges: { name: 'Detectar bordes', p: [['a', 'Cantidad', 0, 100, 100]], fn: (s, p) => convolve(s, [-1, -1, -1, -1, 8, -1, -1, -1, -1], p.a / 100) },
  look: { name: 'Filtros rápidos', looks: true, p: [['i', 'Intensidad', 0, 100, 100]], fn: (s, p) => { const out = cloneCanvas(s), g = out.getContext('2d'); if (p.css === 'none') return out; g.globalAlpha = p.i / 100; g.drawImage(cssOp(s, p.css), 0, 0); g.globalCompositeOperation = 'destination-in'; g.globalAlpha = 1; g.drawImage(s, 0, 0); return out; } },
};
function withSelection(orig, processed, L) {
  if (!D.sel) return processed;
  const out = cloneCanvas(orig), g = out.getContext('2d');
  const part = maskCanvas(cloneCanvas(processed), L.x, L.y);
  g.globalCompositeOperation = 'destination-out'; g.drawImage(D.sel.mask, -L.x, -L.y);
  g.globalCompositeOperation = 'source-over'; g.drawImage(part, 0, 0);
  return out;
}
function adjustable() { const L = AL(); if (!L) { toast('Elegí una capa'); return null; } if (L.type === 'text') { toast('Es una capa de texto. Rasterizala primero.'); return null; } if (L.locked) { toast('La capa está bloqueada'); return null; } return L; }
function openAdjust(key) {
  const A = ADJ[key], L = adjustable(); if (!A || !L) return;
  const orig = L.canvas, before = snap(), p = {};
  A.p.forEach(([k, , , , v]) => p[k] = v); if (A.looks) p.css = 'none';
  let raf = 0, live = true;
  const run = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { L.canvas = live ? withSelection(orig, A.fn(orig, p), L) : orig; compDirty = true; }); };
  let body = `<h3>${A.name}</h3>`;
  if (A.looks) {
    body += `<div class="looks" id="looks">${LOOKS.map(([n, css], i) => `<button data-look="${i}" class="${i === 0 ? 'on' : ''}"><canvas width="96" height="96"></canvas><em>${n}</em></button>`).join('')}</div>`;
  }
  body += A.p.map(([k, l, mn, mx, v, st]) => `<div class="f"><label for="a_${k}">${l}</label><input type="range" id="a_${k}" data-k="${k}" min="${mn}" max="${mx}" step="${st || 1}" value="${v}"><output>${v}</output></div>`).join('');
  body += `<label class="row-btns hint"><input type="checkbox" id="aLive" checked> Vista previa</label><div class="row-btns"><button class="btn primary" id="aOk">Aplicar</button><button class="btn" id="aReset">Restablecer</button><button class="btn" id="aCancel">Cancelar</button></div>`;
  openDialog(body);
  if (A.looks) {
    const th = newCanvas(96, 96), s = Math.min(96 / orig.width, 96 / orig.height);
    th.getContext('2d').drawImage(orig, (96 - orig.width * s) / 2, (96 - orig.height * s) / 2, orig.width * s, orig.height * s);
    $$('#looks canvas').forEach((c, i) => { const g = c.getContext('2d'); g.filter = LOOKS[i][1]; g.drawImage(th, 0, 0); });
    $('#looks').addEventListener('click', e => { const b = e.target.closest('[data-look]'); if (!b) return; $$('#looks button').forEach(x => x.classList.toggle('on', x === b)); p.css = LOOKS[+b.dataset.look][1]; run(); });
  }
  $('#dlgBody').addEventListener('input', e => { const k = e.target.dataset.k; if (k) { p[k] = parseFloat(e.target.value); e.target.nextElementSibling.textContent = e.target.value; run(); } if (e.target.id === 'aLive') { live = e.target.checked; run(); } });
  $('#aOk').onclick = () => { cancelAnimationFrame(raf); L.canvas = withSelection(orig, A.fn(orig, p), L); H.push(before); updateUndo(); closeDialog(); changed(); };
  $('#aReset').onclick = () => { A.p.forEach(([k, , , , v]) => { p[k] = v; const i = $('#a_' + k); i.value = v; i.nextElementSibling.textContent = v; }); if (A.looks) { p.css = 'none'; $$('#looks button').forEach((x, i) => x.classList.toggle('on', i === 0)); } run(); };
  $('#aCancel').onclick = () => { cancelAnimationFrame(raf); L.canvas = orig; compDirty = true; closeDialog(); };
  run();
}
function quick(key) {
  const L = adjustable(); if (!L) return;
  const o = L.canvas;
  let out;
  if (key === 'gray') out = cssOp(o, 'grayscale(1)');
  else if (key === 'sepia') out = cssOp(o, 'sepia(1)');
  else if (key === 'invert') out = pixOp(o, d => { for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; } });
  else if (key === 'auto') out = pixOp(o, d => {
    const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)]; let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) { hist[0][d[i]]++; hist[1][d[i + 1]]++; hist[2][d[i + 2]]++; n++; }
    const lo = [], hi = [];
    for (let c = 0; c < 3; c++) { let acc = 0, l = 0, h = 255; for (let v = 0; v < 256; v++) { acc += hist[c][v]; if (acc > n * .005) { l = v; break; } } acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[c][v]; if (acc > n * .005) { h = v; break; } } lo.push(l); hi.push(Math.max(l + 1, h)); }
    for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = (d[i + c] - lo[c]) * 255 / (hi[c] - lo[c]);
  });
  pushUndo(); L.canvas = withSelection(o, out, L); changed();
  if (key === 'auto') toast('Mejora automática aplicada');
}

/* ---------- diálogos ---------- */
function openDialog(html) { $('#dlgBody').innerHTML = html; $('#dlg').hidden = false; }
function closeDialog() { $('#dlg').hidden = true; $('#dlgBody').innerHTML = ''; const n = $('#dlgBody').cloneNode(false); $('#dlgBody').replaceWith(n); }
const PRESETS = [['Post de Instagram', 1080, 1080], ['Historia / Reel', 1080, 1920], ['Miniatura de YouTube', 1280, 720], ['Full HD', 1920, 1080], ['Portada de Facebook', 1640, 624], ['A4 a 300 ppp', 2480, 3508], ['Tarjeta 1050×600', 1050, 600], ['Ícono 512', 512, 512]];
function dlgNew() {
  openDialog(`<h3>Documento nuevo</h3>
    <div class="preset-grid">${PRESETS.map(([n, w, h], i) => `<button class="chip" data-pre="${i}">${n}<small>${w} × ${h}</small></button>`).join('')}</div>
    <div class="f wide"><label>Tamaño</label><div class="row-btns"><input type="number" id="nW" class="inp" value="1080" min="1" max="12000" style="width:90px" aria-label="Ancho"> × <input type="number" id="nH" class="inp" value="1080" min="1" max="12000" style="width:90px" aria-label="Alto"> px</div></div>
    <div class="f wide"><label for="nBg">Fondo</label><select id="nBg"><option value="#ffffff">Blanco</option><option value="transparent">Transparente</option><option value="#000000">Negro</option><option value="fg">Color principal</option></select></div>
    <div class="row-btns"><button class="btn primary" id="nOk">Crear</button><button class="btn" id="nCancel">Cancelar</button></div>`);
  $('#dlgBody').addEventListener('click', e => { const b = e.target.closest('[data-pre]'); if (b) { const [, w, h] = PRESETS[+b.dataset.pre]; $('#nW').value = w; $('#nH').value = h; } });
  $('#nCancel').onclick = closeDialog;
  $('#nOk').onclick = () => {
    const w = clamp(+$('#nW').value || 1080, 1, 12000), h = clamp(+$('#nH').value || 1080, 1, 12000), bg = $('#nBg').value;
    pushUndo(); newDoc(w, h, bg === 'fg' ? colors.fg : bg); closeDialog();
  };
}
function newDoc(w, h, bg = '#ffffff', name = 'Sin título') {
  tf = null; crop = null; D.sel = null; D.w = w; D.h = h; D.name = name; $('#docName').value = name;
  const L = makeLayer('Fondo');
  if (bg && bg !== 'transparent') { const g = L.canvas.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  D.layers = [L]; D.active = L.id; resizeComp(); fit(); changed(true); D.pristine = true;
}
function dlgExport() {
  openDialog(`<h3>Exportar imagen</h3>
    <div class="f wide"><label for="eFmt">Formato</label><select id="eFmt"><option value="image/png">PNG (con transparencia)</option><option value="image/jpeg">JPG (más liviano)</option><option value="image/webp">WebP (web)</option></select></div>
    <div class="f"><label for="eQ">Calidad</label><input type="range" id="eQ" min=".3" max="1" step=".01" value=".92"><output>92%</output></div>
    <div class="f"><label for="eS">Escala</label><input type="range" id="eS" min=".1" max="4" step=".05" value="1"><output>100%</output></div>
    <p class="hint" id="eInfo"></p>
    <div class="row-btns"><button class="btn primary" id="eOk">Descargar</button><button class="btn" id="eCopy">Copiar imagen</button><button class="btn" id="eCancel">Cancelar</button></div>`);
  const info = () => { const s = +$('#eS').value; $('#eInfo').textContent = `${Math.round(D.w * s)} × ${Math.round(D.h * s)} px · sin marca de agua`; };
  $('#dlgBody').addEventListener('input', e => { if (e.target.id === 'eQ' || e.target.id === 'eS') e.target.nextElementSibling.textContent = Math.round(e.target.value * 100) + '%'; info(); });
  info();
  const render = () => { const fmt = $('#eFmt').value; return flatten(+$('#eS').value, fmt === 'image/jpeg' ? '#ffffff' : null); };
  $('#eOk').onclick = async () => {
    const fmt = $('#eFmt').value, ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[fmt];
    const b = await toBlob(render(), fmt, +$('#eQ').value); download(b, `${safeName(D.name)}.${ext}`); closeDialog(); toast('Imagen exportada');
  };
  $('#eCopy').onclick = async () => { try { const b = await toBlob(render(), 'image/png'); await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); toast('Imagen copiada'); } catch (e) { toast('Tu navegador no permite copiar imágenes'); } };
  $('#eCancel').onclick = closeDialog;
}
function dlgImageSize(canvasMode) {
  openDialog(`<h3>${canvasMode ? 'Tamaño de lienzo' : 'Tamaño de imagen'}</h3>
    <div class="f wide"><label>Tamaño</label><div class="row-btns"><input type="number" id="sW" class="inp" value="${D.w}" style="width:90px" aria-label="Ancho"> × <input type="number" id="sH" class="inp" value="${D.h}" style="width:90px" aria-label="Alto"> px</div></div>
    <label class="row-btns hint"><input type="checkbox" id="sLock" checked> Mantener proporción</label>
    ${canvasMode ? `<div class="f wide"><label>Anclaje</label><div id="anchor" style="display:grid;grid-template-columns:repeat(3,28px);gap:3px">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => `<button class="chip" data-a="${i}" aria-pressed="${i === 4}" style="padding:4px" aria-label="Anclaje ${i + 1}">·</button>`).join('')}</div></div>` : '<p class="hint">Escala todas las capas.</p>'}
    <div class="row-btns"><button class="btn primary" id="sOk">Aplicar</button><button class="btn" id="sCancel">Cancelar</button></div>`);
  const r = D.w / D.h; let anchor = 4;
  $('#sW').oninput = () => { if ($('#sLock').checked) $('#sH').value = Math.round(+$('#sW').value / r); };
  $('#sH').oninput = () => { if ($('#sLock').checked) $('#sW').value = Math.round(+$('#sH').value * r); };
  if (canvasMode) { $('#sLock').checked = false; $('#anchor').onclick = e => { const b = e.target.closest('[data-a]'); if (b) { anchor = +b.dataset.a; $$('#anchor .chip').forEach(x => x.setAttribute('aria-pressed', x === b)); } }; }
  $('#sCancel').onclick = closeDialog;
  $('#sOk').onclick = () => {
    const w = clamp(Math.round(+$('#sW').value), 1, 12000), h = clamp(Math.round(+$('#sH').value), 1, 12000);
    pushUndo();
    if (canvasMode) {
      const ax = anchor % 3, ay = Math.floor(anchor / 3), dx = (w - D.w) * ax / 2, dy = (h - D.h) * ay / 2;
      D.layers.forEach(L => { L.x += Math.round(dx); L.y += Math.round(dy); });
    } else {
      const sx = w / D.w, sy = h / D.h;
      D.layers.forEach(L => {
        if (L.type === 'text') { L.text.size = Math.max(4, Math.round(L.text.size * (sx + sy) / 2)); L.canvas = newCanvas(2, 2); renderText(L); }
        else { const c = newCanvas(L.canvas.width * sx, L.canvas.height * sy), g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(L.canvas, 0, 0, c.width, c.height); L.canvas = c; }
        L.x = Math.round(L.x * sx); L.y = Math.round(L.y * sy);
      });
    }
    D.w = w; D.h = h; D.sel = null; resizeComp(); fit(); changed(true); closeDialog();
  };
}

/* ---------- operaciones de imagen y capas ---------- */
function rasterize(L) { if (L && L.type === 'text') { L.type = 'raster'; L.text = null; } }
function transformCanvas(c, kind) {
  const rot = kind === 'rotR' || kind === 'rotL';
  const n = newCanvas(rot ? c.height : c.width, rot ? c.width : c.height), g = n.getContext('2d');
  if (kind === 'rotR') { g.translate(n.width, 0); g.rotate(Math.PI / 2); }
  else if (kind === 'rotL') { g.translate(0, n.height); g.rotate(-Math.PI / 2); }
  else if (kind === 'rot180') { g.translate(n.width, n.height); g.rotate(Math.PI); }
  else if (kind === 'flipH') { g.translate(n.width, 0); g.scale(-1, 1); }
  else if (kind === 'flipV') { g.translate(0, n.height); g.scale(1, -1); }
  g.drawImage(c, 0, 0); return n;
}
function docTransform(kind) {
  pushUndo();
  const W = D.w, Hh = D.h;
  D.layers.forEach(L => {
    rasterize(L);
    const w = L.canvas.width, h = L.canvas.height, x = L.x, y = L.y;
    L.canvas = transformCanvas(L.canvas, kind);
    if (kind === 'rotR') { L.x = Hh - (y + h); L.y = x; }
    else if (kind === 'rotL') { L.x = y; L.y = W - (x + w); }
    else if (kind === 'rot180') { L.x = W - (x + w); L.y = Hh - (y + h); }
    else if (kind === 'flipH') L.x = W - (x + w);
    else if (kind === 'flipV') L.y = Hh - (y + h);
  });
  if (kind === 'rotR' || kind === 'rotL') { D.w = Hh; D.h = W; }
  D.sel = null; resizeComp(); fit(); changed(true);
}
function layerFlip(kind) { const L = AL(); if (!L || L.locked) return; pushUndo(); rasterize(L); L.canvas = transformCanvas(L.canvas, kind); changed(true); }
function mergeDown() {
  const L = AL(), i = D.layers.indexOf(L); if (!L || i <= 0) { toast('No hay una capa debajo'); return; }
  const B = D.layers[i - 1];
  pushUndo();
  const x0 = Math.min(L.x, B.x), y0 = Math.min(L.y, B.y), x1 = Math.max(L.x + L.canvas.width, B.x + B.canvas.width), y1 = Math.max(L.y + L.canvas.height, B.y + B.canvas.height);
  const c = newCanvas(x1 - x0, y1 - y0), g = c.getContext('2d');
  g.globalAlpha = B.opacity; g.drawImage(B.canvas, B.x - x0, B.y - y0);
  g.globalAlpha = L.opacity; g.globalCompositeOperation = L.blend; g.drawImage(L.canvas, L.x - x0, L.y - y0);
  Object.assign(B, { canvas: c, x: x0, y: y0, opacity: 1, type: 'raster', text: null });
  D.layers.splice(i, 1); D.active = B.id; changed(true);
}
function flattenImage() { pushUndo(); const L = makeLayer('Fondo'); L.canvas = flatten(1); D.layers = [L]; D.active = L.id; changed(true); }
let clip = null;
function copySel(cut) {
  const L = AL(); if (!L) return;
  let x = L.x, y = L.y, c = cloneCanvas(L.canvas);
  if (D.sel) {
    const bb = selBBox(); if (!bb) return;
    const m = newCanvas(bb.w, bb.h), g = m.getContext('2d');
    g.drawImage(L.canvas, L.x - bb.x, L.y - bb.y);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(D.sel.mask, -bb.x, -bb.y);
    c = m; x = bb.x; y = bb.y;
  }
  clip = { canvas: c, x, y };
  toBlob(c).then(b => navigator.clipboard?.write?.([new ClipboardItem({ 'image/png': b })])).catch(() => {});
  if (cut) clearSel(); else toast('Copiado');
}
function pasteClip() {
  if (!clip) { toast('No hay nada copiado. También podés pegar una imagen con Ctrl+V.'); return; }
  pushUndo(); const L = makeLayer('Pegado', clip.canvas.width, clip.canvas.height); L.canvas = cloneCanvas(clip.canvas); L.x = clip.x; L.y = clip.y; insertLayer(L); changed(true); setTool('move');
}
function clearSel() {
  const L = AL(); if (!editable(L)) return;
  if (!D.sel) { toast('Seleccioná el área que querés borrar'); return; }
  pushUndo(); const g = L.canvas.getContext('2d'); g.globalCompositeOperation = 'destination-out'; g.drawImage(D.sel.mask, -L.x, -L.y); g.globalCompositeOperation = 'source-over'; changed();
}
function fillSel() {
  const L = AL(); if (!editable(L)) return;
  pushUndo(); const c = newCanvas(L.canvas.width, L.canvas.height), g = c.getContext('2d'); g.fillStyle = colors.fg; g.fillRect(0, 0, c.width, c.height);
  maskCanvas(c, L.x, L.y); L.canvas.getContext('2d').drawImage(c, 0, 0); changed();
}
function addImageLayer(img, name) {
  const s = Math.min(1, D.w / img.width, D.h / img.height);
  const L = makeLayer(name || 'Imagen', img.width * s, img.height * s);
  const g = L.canvas.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, L.canvas.width, L.canvas.height);
  L.x = Math.round((D.w - L.canvas.width) / 2); L.y = Math.round((D.h - L.canvas.height) / 2);
  insertLayer(L);
}
async function openFiles(files, asLayers) {
  if (!files.length) return;
  const proj = files.find(f => /\.lienzo$/i.test(f.name) || f.type === 'application/json');
  if (proj) { try { busy('Abriendo proyecto…'); pushUndo(); await deserialize(JSON.parse(await proj.text())); toast('Proyecto abierto'); } catch (e) { toast('No se pudo abrir el proyecto'); } finally { busy(false); } return; }
  const imgs = files.filter(f => f.type.startsWith('image/'));
  if (!imgs.length) { toast('Elegí una imagen JPG, PNG, WebP, GIF o un proyecto .lienzo'); return; }
  pushUndo();
  for (let i = 0; i < imgs.length; i++) {
    let img; try { img = await fileToImage(imgs[i]); } catch (e) { toast(`No se pudo leer ${imgs[i].name}`); continue; }
    const name = imgs[i].name.replace(/\.[^.]+$/, '');
    if (i === 0 && !asLayers && D.pristine) {
      tf = null; crop = null; D.sel = null; D.w = img.naturalWidth; D.h = img.naturalHeight; D.name = name; $('#docName').value = name;
      const L = makeLayer('Fondo'); L.canvas.getContext('2d').drawImage(img, 0, 0); D.layers = [L]; D.active = L.id; resizeComp(); fit();
    } else addImageLayer(img, name);
  }
  changed(true);
}

/* ---------- IA: quitar fondo ---------- */
const IMGLY = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';
const VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
async function mediapipeCutout(canvas) {
  const vision = await import(`${VISION}/vision_bundle.mjs`);
  const fs = await vision.FilesetResolver.forVisionTasks(`${VISION}/wasm`);
  const seg = await vision.ImageSegmenter.createFromOptions(fs, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite' }, runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false });
  const res = seg.segment(canvas); const m = res.confidenceMasks[0], data = m.getAsFloat32Array(), mw = m.width, mh = m.height;
  const out = cloneCanvas(canvas), g = out.getContext('2d'), img = g.getImageData(0, 0, out.width, out.height);
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) { const v = data[Math.min(mh - 1, Math.floor(y * mh / out.height)) * mw + Math.min(mw - 1, Math.floor(x * mw / out.width))]; const a = clamp((v - .3) / .4, 0, 1); img.data[(y * out.width + x) * 4 + 3] *= a; }
  g.putImageData(img, 0, 0); res.close?.(); seg.close?.();
  return out;
}
async function aiCutout(canvas) {
  const blob = await toBlob(canvas);
  try {
    const mod = await import(IMGLY);
    const fn = mod.removeBackground || mod.default;
    const out = await fn(blob, { progress: (k, cur, total) => { if (total) busy(`Descargando el modelo de IA… ${Math.round(cur / total * 100)}%`); }, output: { format: 'image/png' } });
    busy('Recortando…');
    const img = await fileToImage(out);
    const c = newCanvas(canvas.width, canvas.height); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  } catch (e) {
    console.warn('Modelo general no disponible, probando el de personas', e);
    busy('Probando el modelo de personas…');
    return mediapipeCutout(canvas);
  }
}
async function removeBg() {
  const L = adjustable(); if (!L) return;
  busy('Preparando la IA (la primera vez descarga el modelo)…');
  try { const c = await aiCutout(L.canvas); pushUndo(); L.canvas = c; changed(true); toast('Fondo quitado'); }
  catch (e) { console.error(e); toast('No se pudo quitar el fondo. Revisá tu conexión e intentá de nuevo.'); }
  finally { busy(false); }
}
async function selectSubject() {
  busy('Buscando el sujeto…');
  try {
    const c = await aiCutout(flatten(1));
    const m = newCanvas(D.w, D.h), g = m.getContext('2d'); g.drawImage(c, 0, 0);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = '#000'; g.fillRect(0, 0, D.w, D.h);
    D.sel = { shapes: [{ type: 'mask', canvas: m, mode: 'add' }] }; rebuildSel(); toast('Sujeto seleccionado');
  } catch (e) { toast('No se pudo seleccionar el sujeto'); }
  finally { busy(false); }
}

/* ---------- guardar y abrir ---------- */
async function serialize(asData) {
  const layers = [];
  for (const L of D.layers) layers.push({ id: L.id, name: L.name, type: L.type, x: L.x, y: L.y, visible: L.visible, opacity: L.opacity, blend: L.blend, locked: L.locked, text: L.text, data: asData ? L.canvas.toDataURL('image/png') : await toBlob(L.canvas) });
  return { app: 'lienzo', v: 1, w: D.w, h: D.h, name: D.name, active: D.active, layers };
}
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); const url = src instanceof Blob ? URL.createObjectURL(src) : src; i.onload = () => res(i); i.onerror = rej; i.src = url; });
}
async function deserialize(o) {
  if (!o || !o.layers) throw new Error('formato');
  const layers = [];
  for (const l of o.layers) {
    const img = await loadImg(l.data); const c = newCanvas(img.width, img.height); c.getContext('2d').drawImage(img, 0, 0);
    const L = { ...l, canvas: c }; delete L.data; layers.push(L);
  }
  tf = null; crop = null; D.sel = null;
  D.w = o.w; D.h = o.h; D.name = o.name || 'Sin título'; D.layers = layers; D.active = o.active && layers.some(l => l.id === o.active) ? o.active : layers[layers.length - 1]?.id;
  $('#docName').value = D.name;
  layers.filter(L => L.type === 'text').forEach(renderText);
  resizeComp(); fit(); changed(true);
}
let saveT = null;
function scheduleSave() { clearTimeout(saveT); $('#savedLbl').textContent = 'Guardando…'; saveT = setTimeout(autosave, 2500); }
async function autosave() {
  if (stroke || act) { scheduleSave(); return; }
  try { await store.set('lienzo:doc', await serialize(false)); $('#savedLbl').textContent = 'Guardado'; }
  catch (e) { $('#savedLbl').textContent = 'Sin guardado automático'; }
}
async function saveProjectFile() {
  busy('Guardando…');
  try { const o = await serialize(true); download(new Blob([JSON.stringify(o)], { type: 'application/json' }), `${safeName(D.name)}.lienzo`); toast('Proyecto descargado. Abrilo después con Archivo → Abrir.'); }
  finally { busy(false); }
}

/* ---------- comandos ---------- */
const CMD = {
  new: dlgNew, open: async () => openFiles(await pickFiles('image/*,.lienzo,application/json', true), false), addImage: async () => openFiles(await pickFiles('image/*', true), true),
  saveProject: saveProjectFile, export: dlgExport,
  undo, redo, cut: () => copySel(true), copy: () => copySel(false), paste: async () => {
    try { const items = await navigator.clipboard.read(); for (const it of items) { const t = it.types.find(x => x.startsWith('image/')); if (t) { const b = await it.getType(t); const img = await fileToImage(b); pushUndo(); addImageLayer(img, 'Pegado'); changed(true); return; } } } catch (e) {}
    pasteClip();
  },
  fillSel, clearSel, transform: startTransform, applyTransform, cancelTransform,
  imageSize: () => dlgImageSize(false), canvasSize: () => dlgImageSize(true),
  rotR: () => docTransform('rotR'), rotL: () => docTransform('rotL'), rot180: () => docTransform('rot180'), flipH: () => docTransform('flipH'), flipV: () => docTransform('flipV'),
  cropSel: () => { const bb = selBBox(); if (!bb) { toast('Primero hacé una selección'); return; } pushUndo(); doCrop(bb.x, bb.y, bb.w, bb.h); },
  flatten: flattenImage,
  newLayer: () => { pushUndo(); insertLayer(makeLayer(`Capa ${D.layers.length + 1}`)); changed(true); },
  dupLayer: () => { const L = AL(); if (!L) return; pushUndo(); const n = { ...L, id: uid('l'), name: L.name + ' copia', canvas: cloneCanvas(L.canvas), text: L.text ? { ...L.text } : null }; insertLayer(n); changed(true); },
  delLayer: () => { const L = AL(); if (!L) return; pushUndo(); const i = D.layers.indexOf(L); D.layers.splice(i, 1); D.active = D.layers[Math.max(0, i - 1)]?.id || null; tf = null; changed(true); },
  mergeDown, layerFlipH: () => layerFlip('flipH'), layerFlipV: () => layerFlip('flipV'),
  centerLayer: () => { const L = AL(); if (!L) return; pushUndo(); L.x = Math.round((D.w - L.canvas.width) / 2); L.y = Math.round((D.h - L.canvas.height) / 2); changed(true); },
  removeBg, rasterize: () => { const L = AL(); if (!L || L.type !== 'text') return; pushUndo(); rasterize(L); changed(true); toast('Texto rasterizado'); },
  selAll: selectAll, deselect, invertSel, selSubject: selectSubject,
  zoomIn: () => zoomAt(view.z * 1.25), zoomOut: () => zoomAt(view.z / 1.25), zoomFit: fit, zoom100: () => zoomAt(1),
  applyCrop, cancelCrop: () => { crop = null; renderOpts(); viewDirty = true; },
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-cmd]'); if (!b) return;
  const c = b.dataset.cmd;
  if (c.startsWith('adj:')) openAdjust(c.slice(4));
  else if (c.startsWith('quick:')) quick(c.slice(6));
  else if (CMD[c]) CMD[c]();
  viewDirty = true;
});
$('#docName').addEventListener('input', e => { D.name = e.target.value; scheduleSave(); });

/* ---------- teclado, pegar y soltar ---------- */
document.addEventListener('keydown', e => {
  if (!$('#dlg').hidden) { if (e.key === 'Escape') { const c = $('#aCancel'); if (c) c.click(); else closeDialog(); } return; }
  if (e.target.closest?.('input,textarea,select,[contenteditable]')) return;
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (e.code === 'Space' && !spaceDown) { spaceDown = true; vp.style.cursor = 'grab'; e.preventDefault(); return; }
  if (mod) {
    const map = { z: e.shiftKey ? redo : undo, y: redo, s: saveProjectFile, o: CMD.open, a: selectAll, d: deselect, t: startTransform, j: CMD.dupLayer, e: e.shiftKey ? dlgExport : mergeDown, c: () => copySel(false), x: () => copySel(true) };
    if (k === 'i' && e.shiftKey) { e.preventDefault(); invertSel(); return; }
    if (k === 'n' && e.shiftKey) { e.preventDefault(); CMD.newLayer(); return; }
    if (k === '0') { e.preventDefault(); fit(); return; } if (k === '1') { e.preventDefault(); zoomAt(1); return; }
    if (k === '=' || k === '+') { e.preventDefault(); CMD.zoomIn(); return; } if (k === '-') { e.preventDefault(); CMD.zoomOut(); return; }
    if (map[k]) { e.preventDefault(); map[k](); }
    return;
  }
  if (e.key === 'Enter') { if (tf) applyTransform(); else if (crop) applyCrop(); return; }
  if (e.key === 'Escape') { if (tf) cancelTransform(); else if (crop) CMD.cancelCrop(); else deselect(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clearSel(); return; }
  if (e.key === 'F5' && e.shiftKey) { e.preventDefault(); fillSel(); return; }
  if (e.key === '[') { opt.size = Math.max(1, Math.round(opt.size * .85)); renderOpts(); viewDirty = true; return; }
  if (e.key === ']') { opt.size = Math.min(500, Math.round(opt.size * 1.18 + 1)); renderOpts(); viewDirty = true; return; }
  if (e.key.startsWith('Arrow') && (tool === 'move' || tf)) {
    e.preventDefault(); const L = AL(); if (!L) return; const s = e.shiftKey ? 10 : 1;
    const dx = e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0, dy = e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0;
    if (tf) { tf.cx += dx; tf.cy += dy; compDirty = true; } else { pushUndo(); L.x += dx; L.y += dy; changed(); }
    return;
  }
  if (k === 'x') { [colors.fg, colors.bg] = [colors.bg, colors.fg]; renderSwatches(); return; }
  if (k === 'd') { colors.fg = '#000000'; colors.bg = '#ffffff'; renderSwatches(); return; }
  const t = TOOLS.find(x => x[2].toLowerCase() === k); if (t) setTool(t[0]);
});
document.addEventListener('keyup', e => { if (e.code === 'Space') { spaceDown = false; setTool(tool); } });
document.addEventListener('paste', async e => {
  if (e.target.closest?.('input,textarea')) return;
  const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/'));
  if (f) { e.preventDefault(); const img = await fileToImage(f); pushUndo(); addImageLayer(img, 'Pegado'); changed(true); setTool('move'); return; }
  if (clip) { e.preventDefault(); pasteClip(); }
});
['dragenter', 'dragover'].forEach(ev => vp.addEventListener(ev, e => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); $('#dropMsg').hidden = false; } }));
vp.addEventListener('dragleave', e => { if (!vp.contains(e.relatedTarget)) $('#dropMsg').hidden = true; });
vp.addEventListener('drop', e => { e.preventDefault(); $('#dropMsg').hidden = true; openFiles([...e.dataTransfer.files], !D.pristine); });
window.addEventListener('beforeunload', () => { clearTimeout(saveT); });
document.addEventListener('visibilitychange', () => { if (document.hidden && saveT) { clearTimeout(saveT); autosave(); } });

/* ---------- inicio ---------- */
function sampleDoc() {
  D.w = 1080; D.h = 1080; D.name = 'Mi primer diseño'; $('#docName').value = D.name;
  const bg = makeLayer('Fondo'), g = bg.canvas.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 1080, 1080); gr.addColorStop(0, '#0f3b47'); gr.addColorStop(1, '#1d1442'); g.fillStyle = gr; g.fillRect(0, 0, 1080, 1080);
  const sun = makeLayer('Círculo'), sg = sun.canvas.getContext('2d');
  const rg = sg.createRadialGradient(540, 470, 0, 540, 470, 300); rg.addColorStop(0, '#5fe3d2'); rg.addColorStop(1, 'rgba(54,194,180,0)'); sg.fillStyle = rg; sg.beginPath(); sg.arc(540, 470, 300, 0, 7); sg.fill();
  sun.blend = 'screen';
  const t1 = makeLayer('Título', 2, 2, { type: 'text', text: { text: 'Lienzo', font: 'Bricolage Grotesque', size: 190, color: '#ffffff', weight: 800, italic: false, align: 'center', stroke: 0, strokeColor: '#000000', shadow: true, lineHeight: 1.1 } });
  renderText(t1); t1.x = Math.round((1080 - t1.canvas.width) / 2); t1.y = 330;
  const t2 = makeLayer('Subtítulo', 2, 2, { type: 'text', text: { text: 'Abrí una foto con Ctrl+O o arrastrala acá', font: 'Figtree', size: 38, color: '#d6f5f1', weight: 600, italic: false, align: 'center', stroke: 0, strokeColor: '#000000', shadow: false, lineHeight: 1.2 } });
  renderText(t2); t2.x = Math.round((1080 - t2.canvas.width) / 2); t2.y = 600;
  D.layers = [bg, sun, t1, t2]; D.active = t2.id;
  resizeComp(); fit(); changed(true); D.pristine = true;
}
renderSwatches(); setTool('brush'); updateUndo(); renderProps();
(async () => {
  let ok = false;
  try { const o = await store.get('lienzo:doc'); if (o && o.layers?.length) { await deserialize(o); ok = true; $('#savedLbl').textContent = 'Guardado'; D.pristine = false; } } catch (e) { ok = false; }
  if (!ok) sampleDoc();
  H.clear(); updateUndo();
})();
requestAnimationFrame(loop);
window.__lienzo = { D, CMD, setTool, openAdjust, quick, ADJ };
})();
