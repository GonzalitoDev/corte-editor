/* Folio — herramientas PDF en el navegador (pdf-lib + pdf.js). */
(() => {
'use strict';
const { $, $$, clamp, esc, uid, el, icon, toast, busy, download, pickFiles, fileToImage, store, safeName, history, loadScript, fmtBytes } = T;
if (!window.pdfjsLib || !window.PDFLib) { document.body.insertAdjacentHTML('beforeend', '<div class="modal"><div class="sheet"><h3>No se pudieron cargar las herramientas PDF</h3><p>Revisá tu conexión a internet y recargá la página.</p></div></div>'); return; }
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
const { PDFDocument, StandardFonts, rgb, degrees } = PDFLib;
const JSZIP = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
const A4 = [595.28, 841.89];

/* ---------- estado ---------- */
const defaultSettings = () => ({ title: '', author: '', subject: '', keywords: '', wm: { on: false, text: 'CONFIDENCIAL', size: 60, opacity: .15, angle: 45, color: '#ef6b57' }, num: { on: false, pos: 'bc', fmt: '{n}', size: 10, start: 1 }, imgFit: 'fit' });
const S = { name: 'Documento', pages: [], settings: defaultSettings() };
const sources = new Map(), images = new Map(), imgCache = new Map();
let selected = new Set(), lastClicked = null, cur = 0, view = 'grid', tab = 'pages', annTool = 'select', selAnn = null, pendingSig = null;
const pageById = id => S.pages.find(p => p.id === id);
const totRot = p => ((p.baseRot || 0) + (p.rot || 0)) % 360;
const dispSize = p => totRot(p) % 180 ? [p.h, p.w] : [p.w, p.h];
const hexRgb = h => { const n = parseInt((h || '#000000').slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

/* ---------- historial y guardado ---------- */
const H = history(60);
const snap = () => JSON.stringify({ name: S.name, pages: S.pages, settings: S.settings });
function restore(s) { const o = JSON.parse(s); S.name = o.name; S.pages = o.pages; S.settings = o.settings; $('#docName').value = S.name; selected = new Set([...selected].filter(id => pageById(id))); selAnn = null; cur = clamp(cur, 0, Math.max(0, S.pages.length - 1)); renderAll(); }
function pushUndo(pre) { H.push(pre || snap()); updUndo(); }
function undo() { const s = H.undo(snap()); if (s) restore(s); updUndo(); scheduleSave(); }
function redo() { const s = H.redo(snap()); if (s) restore(s); updUndo(); scheduleSave(); }
function updUndo() { $('#undoBtn').disabled = !H.canUndo; $('#redoBtn').disabled = !H.canRedo; }
let saveT = null;
function scheduleSave() { clearTimeout(saveT); $('#savedLbl').textContent = 'Guardando…'; saveT = setTimeout(autosave, 1800); }
async function autosave() {
  try {
    const sids = new Set(), iids = new Set();
    S.pages.forEach(p => { if (p.src.kind === 'pdf') sids.add(p.src.sid); if (p.src.kind === 'img') iids.add(p.src.iid); });
    await store.set('folio:doc', { name: S.name, pages: S.pages, settings: S.settings, sources: [...sids].map(id => ({ id, name: sources.get(id).name, bytes: sources.get(id).bytes })), images: [...iids].map(id => { const im = images.get(id); return { id, blob: im.blob, w: im.w, h: im.h, type: im.type }; }) });
    $('#savedLbl').textContent = 'Guardado';
  } catch (e) { $('#savedLbl').textContent = 'Sin guardado automático'; }
}
function changed() { renderAll(); scheduleSave(); }

/* ---------- carga de archivos ---------- */
const pjs = sid => { const s = sources.get(sid); if (!s.pjs) s.pjs = pdfjsLib.getDocument({ data: s.bytes.slice() }).promise; return s.pjs; };
const lib = sid => { const s = sources.get(sid); if (!s.lib) s.lib = PDFDocument.load(s.bytes, { ignoreEncryption: true }); return s.lib; };
async function addPdfBytes(bytes, name, at) {
  const sid = uid('s'); sources.set(sid, { id: sid, name, bytes });
  let pdf;
  try { pdf = await pjs(sid); }
  catch (e) { sources.delete(sid); toast(e && e.name === 'PasswordException' ? `${name} tiene contraseña. Quitásela y volvé a intentar.` : `No se pudo leer ${name}`); return []; }
  const out = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const pg = await pdf.getPage(i); const [x0, y0, x1, y1] = pg.view;
    out.push({ id: uid('p'), src: { kind: 'pdf', sid, index: i - 1 }, baseRot: pg.rotate || 0, rot: 0, w: x1 - x0, h: y1 - y0, annots: [] });
  }
  return out;
}
async function addImageFile(file) {
  let blob = file, type = file.type;
  const img = await fileToImage(file);
  if (!['image/png', 'image/jpeg'].includes(type)) {
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0);
    blob = await new Promise(r => c.toBlob(r, 'image/png')); type = 'image/png';
  }
  const iid = uid('i'); images.set(iid, { id: iid, blob, w: img.naturalWidth, h: img.naturalHeight, type }); imgCache.set(iid, img);
  const fit = S.settings.imgFit;
  const [w, h] = fit === 'a4p' ? A4 : fit === 'a4l' ? [A4[1], A4[0]] : (() => { const k = Math.min(1, 1440 / Math.max(img.naturalWidth * .75, img.naturalHeight * .75)); return [img.naturalWidth * .75 * k, img.naturalHeight * .75 * k]; })();
  return { id: uid('p'), src: { kind: 'img', iid, fit }, baseRot: 0, rot: 0, w, h, annots: [] };
}
async function addFiles(files) {
  files = [...files]; if (!files.length) return;
  const pre = snap(); busy('Leyendo archivos…');
  const added = [];
  try {
    for (const f of files) {
      if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) added.push(...await addPdfBytes(new Uint8Array(await f.arrayBuffer()), f.name));
      else if (f.type.startsWith('image/')) { try { added.push(await addImageFile(f)); } catch (e) { toast(`No se pudo leer ${f.name}`); } }
      else toast(`${f.name}: solo PDF o imágenes`);
    }
  } finally { busy(false); }
  if (!added.length) return;
  pushUndo(pre);
  const sel = S.pages.map((p, i) => selected.has(p.id) ? i : -1).filter(i => i >= 0);
  const at = sel.length ? Math.max(...sel) + 1 : S.pages.length;
  S.pages.splice(at, 0, ...added);
  if (S.name === 'Documento' || S.name === 'Documento de ejemplo') { const f = files.find(x => /\.pdf$/i.test(x.name)) || files[0]; S.name = f.name.replace(/\.[^.]+$/, ''); $('#docName').value = S.name; }
  selected = new Set(added.map(p => p.id));
  changed(); toast(`${added.length} página${added.length > 1 ? 's' : ''} agregada${added.length > 1 ? 's' : ''}`);
}

/* ---------- dibujar páginas ---------- */
function imgFor(iid) {
  if (imgCache.has(iid)) return Promise.resolve(imgCache.get(iid));
  const im = images.get(iid); if (!im) return Promise.reject(new Error('img'));
  return fileToImage(im.blob).then(i => { imgCache.set(iid, i); return i; });
}
const annImg = new Map();
function annImage(src) { if (!annImg.has(src)) { const i = new Image(); i.src = src; annImg.set(src, i); } return annImg.get(src); }
async function renderPageTo(canvas, p, scale) {
  const [dw, dh] = dispSize(p), r = totRot(p);
  const W = Math.max(1, Math.round(dw * scale)), Hh = Math.max(1, Math.round(dh * scale));
  if (p.src.kind === 'pdf') {
    const pdf = await pjs(p.src.sid), pg = await pdf.getPage(p.src.index + 1);
    const vp = pg.getViewport({ scale, rotation: r });
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    const g = canvas.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
    await pg.render({ canvasContext: g, viewport: vp }).promise;
  } else {
    canvas.width = W; canvas.height = Hh;
    const g = canvas.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, Hh);
    if (p.src.kind === 'img') {
      const img = await imgFor(p.src.iid);
      g.save(); g.translate(W / 2, Hh / 2); g.rotate(r * Math.PI / 180);
      const pw = p.w * scale, ph = p.h * scale;
      const m = p.src.fit === 'fit' ? 0 : 36 * scale, s = Math.min((pw - m * 2) / img.naturalWidth, (ph - m * 2) / img.naturalHeight);
      g.drawImage(img, -img.naturalWidth * s / 2, -img.naturalHeight * s / 2, img.naturalWidth * s, img.naturalHeight * s);
      g.restore();
    }
  }
  return canvas;
}
function drawAnnots(g, p, W, Hh) {
  const [dw] = dispSize(p), k = W / dw;
  for (const a of p.annots) {
    g.save();
    if (a.type === 'text') { g.fillStyle = a.color; g.font = `${a.bold ? 'bold ' : ''}${a.size * k}px ${cssFont(a.font)}`; g.textBaseline = 'top'; String(a.text).split('\n').forEach((l, i) => g.fillText(l, a.u * W, a.v * Hh + i * a.size * k * 1.15)); }
    else if (a.type === 'image') { const im = annImage(a.src); if (im.complete) { g.globalAlpha = a.opacity ?? 1; g.drawImage(im, a.u * W, a.v * Hh, a.w * W, a.h * Hh); } }
    else { g.globalAlpha = a.type === 'highlight' ? .45 : a.opacity ?? 1; g.fillStyle = a.type === 'cover' ? '#ffffff' : a.color; if (a.type === 'highlight') g.globalCompositeOperation = 'multiply'; g.fillRect(a.u * W, a.v * Hh, a.w * W, a.h * Hh); }
    g.restore();
  }
}
const cssFont = f => ({ Helvetica: 'Helvetica, Arial, sans-serif', Times: '"Times New Roman", Times, serif', Courier: '"Courier New", Courier, monospace' }[f] || 'Helvetica, Arial, sans-serif');

/* ---------- cuadrícula ---------- */
const io = new IntersectionObserver(entries => entries.forEach(en => { if (en.isIntersecting) { const c = en.target; io.unobserve(c); drawThumb(c); } }), { root: $('#stage'), rootMargin: '300px' });
async function drawThumb(c) {
  const p = pageById(c.dataset.id); if (!p) return;
  const [dw] = dispSize(p);
  try { const off = document.createElement('canvas'); await renderPageTo(off, p, 300 / dw); drawAnnots(off.getContext('2d'), p, off.width, off.height); c.width = off.width; c.height = off.height; c.getContext('2d').drawImage(off, 0, 0); }
  catch (e) { const g = c.getContext('2d'); g.fillStyle = '#fee'; g.fillRect(0, 0, c.width, c.height); }
}
const ICO = { rotL: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>', rotR: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>', del: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', edit: '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>' };
function renderGrid() {
  const g = $('#grid'); g.innerHTML = '';
  S.pages.forEach((p, i) => {
    const [dw, dh] = dispSize(p);
    const src = p.src.kind === 'pdf' ? sources.get(p.src.sid)?.name : p.src.kind === 'img' ? 'Imagen' : 'En blanco';
    const card = el(`<div class="card${selected.has(p.id) ? ' on' : ''}" data-id="${p.id}" draggable="true" tabindex="0" aria-label="Página ${i + 1}">
      <div class="th" style="--ar:${dw / dh}"><canvas data-id="${p.id}" width="${Math.round(120 * dw / dh)}" height="120"></canvas></div>
      <span class="num">${i + 1}</span>${p.annots.length ? `<span class="badge">${p.annots.length} edición${p.annots.length > 1 ? 'es' : ''}</span>` : ''}
      <div class="acts"><button data-pact="rotL" title="Girar a la izquierda" aria-label="Girar a la izquierda">${icon(ICO.rotL)}</button><button data-pact="rotR" title="Girar a la derecha" aria-label="Girar a la derecha">${icon(ICO.rotR)}</button><button data-pact="edit" title="Editar página" aria-label="Editar página">${icon(ICO.edit)}</button><button data-pact="del" title="Eliminar" aria-label="Eliminar página">${icon(ICO.del)}</button></div></div>`);
    card.title = `${src || ''} · ${Math.round(dw)} × ${Math.round(dh)} pt`;
    g.appendChild(card); io.observe(card.querySelector('canvas'));
  });
  $('#empty').hidden = S.pages.length > 0;
}
$('#grid').addEventListener('click', e => {
  const card = e.target.closest('.card'); if (!card) return;
  const id = card.dataset.id, act = e.target.closest('[data-pact]')?.dataset.pact;
  if (act) {
    if (act === 'edit') { cur = S.pages.findIndex(p => p.id === id); setView('page'); return; }
    pushUndo(); const p = pageById(id);
    if (act === 'rotL') p.rot = (p.rot + 270) % 360; if (act === 'rotR') p.rot = (p.rot + 90) % 360;
    if (act === 'del') { S.pages = S.pages.filter(x => x.id !== id); selected.delete(id); }
    changed(); return;
  }
  if (e.shiftKey && lastClicked) { const a = S.pages.findIndex(p => p.id === lastClicked), b = S.pages.findIndex(p => p.id === id); for (let i = Math.min(a, b); i <= Math.max(a, b); i++) selected.add(S.pages[i].id); }
  else if (e.ctrlKey || e.metaKey) { selected.has(id) ? selected.delete(id) : selected.add(id); lastClicked = id; }
  else { selected = new Set([id]); lastClicked = id; }
  $$('.card').forEach(c => c.classList.toggle('on', selected.has(c.dataset.id))); renderSelInfo(); if (tab === 'pages') renderSide();
});
$('#grid').addEventListener('dblclick', e => { const card = e.target.closest('.card'); if (card && !e.target.closest('[data-pact]')) { cur = S.pages.findIndex(p => p.id === card.dataset.id); setView('page'); } });
let dragIds = null;
$('#grid').addEventListener('dragstart', e => { const card = e.target.closest('.card'); if (!card) return; if (!selected.has(card.dataset.id)) { selected = new Set([card.dataset.id]); } dragIds = S.pages.filter(p => selected.has(p.id)).map(p => p.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'pages'); });
$('#grid').addEventListener('dragover', e => { if (!dragIds) return; e.preventDefault(); $$('.card').forEach(c => c.classList.remove('drop-before')); e.target.closest('.card')?.classList.add('drop-before'); });
$('#grid').addEventListener('drop', e => {
  if (!dragIds) return; e.preventDefault(); e.stopPropagation();
  const card = e.target.closest('.card'); const ids = dragIds; dragIds = null;
  pushUndo();
  const moving = S.pages.filter(p => ids.includes(p.id)), rest = S.pages.filter(p => !ids.includes(p.id));
  let at = card ? rest.findIndex(p => p.id === card.dataset.id) : rest.length; if (at < 0) at = rest.length;
  rest.splice(at, 0, ...moving); S.pages = rest; changed();
});
$('#grid').addEventListener('dragend', () => { dragIds = null; $$('.card').forEach(c => c.classList.remove('drop-before')); });
$('#thumbSize').addEventListener('input', e => $('#grid').style.setProperty('--ts', e.target.value + 'px'));
function renderSelInfo() { $('#selInfo').textContent = view === 'grid' ? `${S.pages.length} páginas${selected.size ? ` · ${selected.size} seleccionada${selected.size > 1 ? 's' : ''}` : ''}` : ''; }

/* ---------- vista de página y ediciones ---------- */
const ANN_TOOLS = [['select', 'Mover', '<path d="M5 3l14 8-6 2-3 6z"/>'], ['text', 'Texto', '<path d="M5 5h14M12 5v15M9 20h6"/>'], ['sign', 'Firma', '<path d="M3 17c3-3 5-9 7-9s-1 9 2 9 4-5 6-5 2 3 3 3"/><path d="M3 21h18"/>'], ['image', 'Imagen', '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>'], ['rect', 'Rectángulo', '<rect x="3" y="6" width="18" height="12" rx="1"/>'], ['highlight', 'Resaltar', '<path d="m9 11-6 6v3h9l3-3M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>'], ['cover', 'Tapar', '<rect x="3" y="6" width="18" height="12" rx="1" fill="currentColor"/>']];
$('#annTools').innerHTML = ANN_TOOLS.map(([k, n, ic]) => `<button class="chip" data-ann="${k}" aria-pressed="${k === annTool}" title="${n}">${icon(ic)}<span class="hide-sm"> ${n}</span></button>`).join('');
$('#annTools').addEventListener('click', e => { const b = e.target.closest('[data-ann]'); if (b) setAnnTool(b.dataset.ann); });
function setAnnTool(t) {
  annTool = t; $$('[data-ann]').forEach(b => b.setAttribute('aria-pressed', b.dataset.ann === t));
  $('#annLayer').classList.toggle('placing', t !== 'select');
  if (t === 'sign' && !pendingSig) openSignature();
  if (tab === 'edit') renderSide();
}
let pageScale = 1;
async function renderPage() {
  const p = S.pages[cur];
  $('#pageNum').textContent = S.pages.length ? `${cur + 1} / ${S.pages.length}` : '0 / 0';
  if (!p) { $('#pagewrap').hidden = true; return; }
  $('#pagewrap').hidden = false;
  const [dw, dh] = dispSize(p), st = $('#stage').getBoundingClientRect();
  pageScale = Math.max(.2, Math.min((st.width - 56) / dw, 2.2, Math.max(.6, (st.height - 56) / dh)));
  const dpr = window.devicePixelRatio || 1, c = $('#pageCanvas');
  const off = document.createElement('canvas');
  try { await renderPageTo(off, p, pageScale * dpr); } catch (e) { toast('No se pudo dibujar la página'); }
  if (S.pages[cur] !== p) return;
  c.width = off.width; c.height = off.height; c.getContext('2d').drawImage(off, 0, 0);
  c.style.width = Math.round(dw * pageScale) + 'px'; c.style.height = Math.round(dh * pageScale) + 'px';
  renderAnnots();
}
function renderAnnots() {
  const p = S.pages[cur], L = $('#annLayer'); if (!p) return;
  const [dw, dh] = dispSize(p), k = pageScale;
  let h = '';
  const st = S.settings;
  if (st.wm.on && st.wm.text) h += `<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(${-st.wm.angle}deg);font:bold ${st.wm.size * k}px Helvetica,Arial,sans-serif;color:${st.wm.color};opacity:${st.wm.opacity};white-space:nowrap;pointer-events:none">${esc(st.wm.text)}</div>`;
  if (st.num.on) { const [u, v, al] = numPos(st.num.pos); h += `<div style="position:absolute;left:${u * 100}%;top:${v * 100}%;transform:translate(${al === 'center' ? '-50%' : al === 'right' ? '-100%' : '0'},-80%);font:${st.num.size * k}px Helvetica,Arial,sans-serif;color:#333;pointer-events:none">${esc(numText(cur, S.pages.length))}</div>`; }
  p.annots.forEach(a => {
    const sel = a.id === selAnn ? ' sel' : '';
    if (a.type === 'text') h += `<div class="ann t${sel}" data-a="${a.id}" style="left:${a.u * 100}%;top:${a.v * 100}%;font:${a.bold ? 'bold ' : ''}${a.size * k}px ${cssFont(a.font)};color:${a.color}">${esc(a.text)}</div>`;
    else if (a.type === 'image') h += `<div class="ann${sel}" data-a="${a.id}" style="left:${a.u * 100}%;top:${a.v * 100}%;width:${a.w * 100}%;height:${a.h * 100}%;opacity:${a.opacity ?? 1}"><img src="${a.src}" alt=""><i class="rz"></i></div>`;
    else h += `<div class="ann${a.type === 'highlight' ? ' hl' : ''}${sel}" data-a="${a.id}" style="left:${a.u * 100}%;top:${a.v * 100}%;width:${a.w * 100}%;height:${a.h * 100}%;background:${a.type === 'cover' ? '#fff' : a.color};opacity:${a.type === 'highlight' ? .45 : a.opacity ?? 1}"><i class="rz"></i></div>`;
  });
  L.innerHTML = h;
  void dw; void dh;
}
const annById = id => S.pages[cur]?.annots.find(a => a.id === id);
let aDrag = null;
$('#annLayer').addEventListener('pointerdown', e => {
  const L = $('#annLayer'), r = L.getBoundingClientRect(), p = S.pages[cur]; if (!p || !r.width || !r.height) return;
  const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
  const node = e.target.closest('.ann');
  if (node && node.isContentEditable) return;
  if (node && annTool === 'select' || node && !['rect', 'highlight', 'cover'].includes(annTool) && annTool !== 'text') {
    const a = annById(node.dataset.a); selAnn = a.id; $$('.ann').forEach(n => n.classList.toggle('sel', n === node));
    aDrag = { a, mode: e.target.classList.contains('rz') ? 'resize' : 'move', u0: u, v0: v, a0: { ...a }, pre: snap(), moved: false };
    L.setPointerCapture(e.pointerId); e.preventDefault(); if (tab === 'edit') renderSide(); return;
  }
  if (node && annTool === 'text') { const a = annById(node.dataset.a); if (a?.type === 'text') { editText(node, a); return; } }
  if (annTool === 'select') { selAnn = null; renderAnnots(); if (tab === 'edit') renderSide(); return; }
  const [dw, dh] = dispSize(p);
  if (annTool === 'text') {
    pushUndo(); const a = { id: uid('a'), type: 'text', u, v: v - 8 / dh, text: 'Texto', size: 14, color: '#111111', font: 'Helvetica', bold: false };
    p.annots.push(a); selAnn = a.id; renderAnnots(); scheduleSave(); const n = $(`.ann[data-a="${a.id}"]`); if (n) editText(n, a); return;
  }
  if (annTool === 'sign' || annTool === 'image') {
    const place = src => { const im = new Image(); im.onload = () => { pushUndo(); const w = annTool === 'sign' ? .32 : .4, h = w * dw / dh * im.naturalHeight / im.naturalWidth; const a = { id: uid('a'), type: 'image', u: clamp(u - w / 2, 0, 1 - w), v: clamp(v - h / 2, 0, 1), w, h, src, opacity: 1 }; p.annots.push(a); selAnn = a.id; setAnnTool('select'); renderAnnots(); renderThumbs(); scheduleSave(); if (tab === 'edit') renderSide(); }; im.src = src; };
    if (annTool === 'sign') { if (pendingSig) place(pendingSig); else openSignature(); }
    else pickFiles('image/*').then(async fs => { if (fs[0]) place(await toDataURL(fs[0])); });
    return;
  }
  const a = { id: uid('a'), type: annTool, u, v, w: .001, h: .001, color: annTool === 'highlight' ? '#ffe14d' : '#ef6b57', opacity: annTool === 'rect' ? .9 : 1 };
  aDrag = { a, mode: 'draw', u0: u, v0: v, pre: snap(), moved: false, isNew: true };
  p.annots.push(a); selAnn = a.id; renderAnnots(); L.setPointerCapture(e.pointerId);
});
$('#annLayer').addEventListener('pointermove', e => {
  if (!aDrag) return;
  const r = $('#annLayer').getBoundingClientRect(); if (!r.width || !r.height) return;
  const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height, a = aDrag.a;
  aDrag.moved = true;
  if (aDrag.mode === 'move') { a.u = aDrag.a0.u + u - aDrag.u0; a.v = aDrag.a0.v + v - aDrag.v0; }
  else if (aDrag.mode === 'resize') { a.w = Math.max(.01, aDrag.a0.w + u - aDrag.u0); a.h = e.shiftKey || a.type !== 'image' ? Math.max(.005, aDrag.a0.h + v - aDrag.v0) : a.w * aDrag.a0.h / aDrag.a0.w; }
  else { a.u = Math.min(u, aDrag.u0); a.v = Math.min(v, aDrag.v0); a.w = Math.abs(u - aDrag.u0); a.h = Math.abs(v - aDrag.v0); }
  const n = $(`.ann[data-a="${a.id}"]`); if (n) Object.assign(n.style, { left: a.u * 100 + '%', top: a.v * 100 + '%', ...(a.type !== 'text' ? { width: a.w * 100 + '%', height: a.h * 100 + '%' } : {}) });
});
function aEnd() {
  if (!aDrag) return; const d = aDrag; aDrag = null;
  if (d.isNew && (d.a.w < .01 || d.a.h < .005)) { Object.assign(d.a, { u: d.u0 - .1, v: d.v0 - .02, w: .2, h: .04 }); }
  if (d.moved || d.isNew) { pushUndo(d.pre); scheduleSave(); renderThumbs(); }
  renderAnnots(); if (tab === 'edit') renderSide();
}
$('#annLayer').addEventListener('pointerup', aEnd); $('#annLayer').addEventListener('pointercancel', aEnd);
$('#annLayer').addEventListener('dblclick', e => { const n = e.target.closest('.ann.t'); if (n) editText(n, annById(n.dataset.a)); });
function editText(node, a) {
  const pre = snap(); node.contentEditable = 'true'; node.focus();
  const range = document.createRange(); range.selectNodeContents(node); const s = getSelection(); s.removeAllRanges(); s.addRange(range);
  node.addEventListener('blur', () => { node.contentEditable = 'false'; const t = node.innerText.replace(/\n$/, ''); if (t !== a.text) { pushUndo(pre); a.text = t || ' '; scheduleSave(); renderThumbs(); } renderAnnots(); if (tab === 'edit') renderSide(); }, { once: true });
  node.addEventListener('keydown', ev => { if (ev.key === 'Escape') node.blur(); });
}
const toDataURL = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
let thumbT = null;
function renderThumbs() { clearTimeout(thumbT); thumbT = setTimeout(() => { if (view === 'grid') renderGrid(); }, 200); }
function setView(v) {
  view = v; $$('[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === v));
  $('#grid').hidden = v !== 'grid'; $('#pageview').hidden = v !== 'page'; $('#gridCtl').hidden = v !== 'grid'; $('#pageCtl').hidden = v !== 'page';
  if (v === 'page') { cur = clamp(cur, 0, Math.max(0, S.pages.length - 1)); renderPage(); if (tab === 'pages') { tab = 'edit'; syncTabs(); } }
  else renderGrid();
  renderSelInfo(); renderSide();
}
$$('[data-view]').forEach(b => b.addEventListener('click', () => { if (b.dataset.view === 'page' && !S.pages.length) return; if (b.dataset.view === 'page' && selected.size) cur = S.pages.findIndex(p => selected.has(p.id)); setView(b.dataset.view); }));
new ResizeObserver(() => { if (view === 'page') renderPage(); }).observe($('#stage'));

/* ---------- firma ---------- */
const sigs = () => { try { return JSON.parse(localStorage.getItem('folio:sigs') || '[]'); } catch (e) { return []; } };
function saveSigs(l) { try { localStorage.setItem('folio:sigs', JSON.stringify(l.slice(0, 6))); } catch (e) {} }
function trimCanvas(c) {
  const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const o = document.createElement('canvas'); o.width = x1 - x0 + 12; o.height = y1 - y0 + 12; o.getContext('2d').drawImage(c, x0 - 6, y0 - 6, o.width, o.height, 0, 0, o.width, o.height);
  return o;
}
function openSignature() {
  const saved = sigs();
  openDialog(`<h3>Tu firma</h3>
    ${saved.length ? `<div class="label">Firmas guardadas</div><div class="siglist">${saved.map((s, i) => `<button data-sig="${i}" aria-label="Usar firma ${i + 1}"><img src="${s}" alt=""></button>`).join('')}</div>` : ''}
    <div class="chips" id="sigTabs"><button class="chip" data-st="draw" aria-pressed="true">Dibujar</button><button class="chip" data-st="type" aria-pressed="false">Escribir</button><button class="chip" data-st="upload" aria-pressed="false">Subir imagen</button></div>
    <div id="sigDraw"><canvas class="sigpad" id="sigPad" width="1000" height="300"></canvas><div class="row-btns" style="margin-top:8px"><label class="hint">Color <select id="sigColor" class="sel"><option value="#111111">Negro</option><option value="#1a3fa8">Azul</option></select></label><button class="btn small" id="sigClear">Borrar</button></div></div>
    <div id="sigType" hidden><input type="text" id="sigName" class="inp" placeholder="Tu nombre" style="width:100%"><div class="row-btns" style="margin-top:8px">${['Pacifico', 'Caveat', 'Permanent Marker'].map((f, i) => `<button class="chip" data-font="${f}" aria-pressed="${i === 0}" style="font-family:'${f}';font-size:16px">Firma</button>`).join('')}</div><canvas class="sigpad" id="sigTypeC" width="1000" height="300" style="margin-top:8px"></canvas></div>
    <div id="sigUp" hidden><button class="btn" id="sigFile">Elegir imagen de tu firma</button><p class="hint" style="margin-top:6px">Mejor un PNG con fondo transparente o una foto con fondo blanco.</p></div>
    <div class="row-btns"><button class="btn primary" id="sigOk">Usar esta firma</button><button class="btn" id="sigCancel">Cancelar</button></div>`);
  let mode = 'draw', font = 'Pacifico', upImg = null;
  const pad = $('#sigPad'), pg = pad.getContext('2d');
  pg.lineCap = 'round'; pg.lineJoin = 'round'; pg.lineWidth = 5;
  let drawing = false, last = null;
  const pt = e => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height]; };
  pad.addEventListener('pointerdown', e => { drawing = true; last = pt(e); pad.setPointerCapture(e.pointerId); });
  pad.addEventListener('pointermove', e => { if (!drawing) return; const p = pt(e); pg.strokeStyle = $('#sigColor').value; pg.lineWidth = 3 + (e.pressure && e.pointerType === 'pen' ? e.pressure * 5 : 2.5); pg.beginPath(); pg.moveTo(last[0], last[1]); pg.quadraticCurveTo(last[0], last[1], (last[0] + p[0]) / 2, (last[1] + p[1]) / 2); pg.lineTo(p[0], p[1]); pg.stroke(); last = p; });
  pad.addEventListener('pointerup', () => drawing = false);
  $('#sigClear').onclick = () => pg.clearRect(0, 0, pad.width, pad.height);
  const drawTyped = () => { const c = $('#sigTypeC'), g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); g.fillStyle = '#111'; g.font = `120px "${font}"`; g.textBaseline = 'middle'; g.fillText($('#sigName').value || 'Tu firma', 30, 150); };
  document.fonts.load(`120px "${font}"`).then(drawTyped).catch(drawTyped);
  $('#sigName').oninput = drawTyped;
  $('#dlgBody').addEventListener('click', async e => {
    const t = e.target.closest('[data-st]'), f = e.target.closest('[data-font]'), s = e.target.closest('[data-sig]');
    if (t) { mode = t.dataset.st; $$('[data-st]').forEach(b => b.setAttribute('aria-pressed', b === t)); $('#sigDraw').hidden = mode !== 'draw'; $('#sigType').hidden = mode !== 'type'; $('#sigUp').hidden = mode !== 'upload'; }
    if (f) { font = f.dataset.font; $$('[data-font]').forEach(b => b.setAttribute('aria-pressed', b === f)); document.fonts.load(`120px "${font}"`).then(drawTyped).catch(drawTyped); }
    if (s) { pendingSig = saved[+s.dataset.sig]; closeDialog(); startPlacingSig(); }
  });
  $('#sigFile').onclick = async () => { const fs = await pickFiles('image/*'); if (fs[0]) { upImg = await fileToImage(fs[0]); $('#sigFile').textContent = fs[0].name; } };
  $('#sigCancel').onclick = () => { closeDialog(); if (annTool === 'sign') setAnnTool('select'); };
  $('#sigOk').onclick = () => {
    let c;
    if (mode === 'draw') c = trimCanvas(pad);
    else if (mode === 'type') { drawTyped(); c = trimCanvas($('#sigTypeC')); }
    else if (upImg) {
      const k = document.createElement('canvas'); k.width = upImg.naturalWidth; k.height = upImg.naturalHeight; const g = k.getContext('2d'); g.drawImage(upImg, 0, 0);
      const img = g.getImageData(0, 0, k.width, k.height); for (let i = 0; i < img.data.length; i += 4) { const lum = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3; if (lum > 225) img.data[i + 3] = 0; } g.putImageData(img, 0, 0);
      c = trimCanvas(k);
    }
    if (!c) { toast('Primero hacé tu firma'); return; }
    pendingSig = c.toDataURL('image/png');
    const l = sigs().filter(x => x !== pendingSig); l.unshift(pendingSig); saveSigs(l);
    closeDialog(); startPlacingSig();
  };
}
function startPlacingSig() { if (!S.pages.length) { toast('Agregá un PDF primero'); return; } if (view !== 'page') setView('page'); annTool = 'sign'; $$('[data-ann]').forEach(b => b.setAttribute('aria-pressed', b.dataset.ann === 'sign')); $('#annLayer').classList.add('placing'); toast('Tocá la página donde va la firma'); }

/* ---------- construir el PDF ---------- */
function mapPt(u, v, r, W, Hh, ox, oy) {
  switch (r) {
    case 90: return [ox + v * W, oy + u * Hh];
    case 180: return [ox + (1 - u) * W, oy + v * Hh];
    case 270: return [ox + (1 - v) * W, oy + (1 - u) * Hh];
    default: return [ox + u * W, oy + (1 - v) * Hh];
  }
}
function safeText(font, s) { let o = ''; for (const ch of String(s)) { if (ch === '\n') { o += ch; continue; } try { font.encodeText(ch); o += ch; } catch (e) { o += '?'; } } return o; }
function numPos(pos) { return { bl: [.06, .965, 'left'], bc: [.5, .965, 'center'], br: [.94, .965, 'right'], tl: [.06, .05, 'left'], tc: [.5, .05, 'center'], tr: [.94, .05, 'right'] }[pos] || [.5, .965, 'center']; }
function numText(i, total) { const n = i + (S.settings.num.start || 1); return S.settings.num.fmt.replace('{n}', n).replace('{t}', total + (S.settings.num.start || 1) - 1); }
async function buildPdf(pages = S.pages, { annotations = true, extras = true } = {}) {
  const out = await PDFDocument.create();
  const fonts = {};
  const font = async (name, bold) => { const k = name + (bold ? 'B' : ''); if (!fonts[k]) fonts[k] = await out.embedFont({ Helvetica: bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica, Times: bold ? StandardFonts.TimesRomanBold : StandardFonts.TimesRoman, Courier: bold ? StandardFonts.CourierBold : StandardFonts.Courier }[name] || StandardFonts.Helvetica); return fonts[k]; };
  const embedded = new Map();
  const st = S.settings;
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]; let page;
    if (p.src.kind === 'pdf') { const src = await lib(p.src.sid); const [cp] = await out.copyPages(src, [p.src.index]); page = out.addPage(cp); page.setRotation(degrees(totRot(p))); }
    else {
      page = out.addPage([p.w, p.h]);
      if (p.src.kind === 'img') {
        const im = images.get(p.src.iid); let e = embedded.get(p.src.iid);
        if (!e) { const bytes = new Uint8Array(await im.blob.arrayBuffer()); e = im.type === 'image/png' ? await out.embedPng(bytes) : await out.embedJpg(bytes); embedded.set(p.src.iid, e); }
        const m = p.src.fit === 'fit' ? 0 : 36, s = Math.min((p.w - m * 2) / e.width, (p.h - m * 2) / e.height);
        page.drawImage(e, { x: (p.w - e.width * s) / 2, y: (p.h - e.height * s) / 2, width: e.width * s, height: e.height * s });
      }
      page.setRotation(degrees(totRot(p)));
    }
    const r = page.getRotation().angle % 360;
    const cb = page.getCropBox ? page.getCropBox() : { x: 0, y: 0, ...page.getSize() };
    const W = cb.width, Hh = cb.height, ox = cb.x, oy = cb.y;
    const dW = r % 180 ? Hh : W, dH = r % 180 ? W : Hh;
    if (annotations) for (const a of p.annots) {
      if (a.type === 'text') {
        const f = await font(a.font, a.bold), [cr, cg, cbb] = hexRgb(a.color);
        const [x, y] = mapPt(a.u, a.v + a.size * .82 / dH, r, W, Hh, ox, oy);
        page.drawText(safeText(f, a.text), { x, y, size: a.size, font: f, color: rgb(cr, cg, cbb), lineHeight: a.size * 1.15, rotate: degrees(r) });
      } else if (a.type === 'image') {
        let e = embedded.get(a.src);
        if (!e) { const bytes = await (await fetch(a.src)).arrayBuffer(); e = a.src.startsWith('data:image/png') ? await out.embedPng(bytes) : await out.embedJpg(bytes); embedded.set(a.src, e); }
        const [x, y] = mapPt(a.u, a.v + a.h, r, W, Hh, ox, oy);
        page.drawImage(e, { x, y, width: a.w * dW, height: a.h * dH, rotate: degrees(r), opacity: a.opacity ?? 1 });
      } else {
        const [x, y] = mapPt(a.u, a.v + a.h, r, W, Hh, ox, oy), [cr, cg, cbb] = hexRgb(a.type === 'cover' ? '#ffffff' : a.color);
        page.drawRectangle({ x, y, width: a.w * dW, height: a.h * dH, color: rgb(cr, cg, cbb), opacity: a.type === 'highlight' ? .4 : a.opacity ?? 1, rotate: degrees(r), ...(a.type === 'highlight' ? { blendMode: PDFLib.BlendMode ? PDFLib.BlendMode.Multiply : undefined } : {}) });
      }
    }
    if (extras && st.wm.on && st.wm.text) {
      const f = await font('Helvetica', true), txt = safeText(f, st.wm.text), tw = f.widthOfTextAtSize(txt, st.wm.size), [cr, cg, cbb] = hexRgb(st.wm.color);
      const th = (st.wm.angle + r) * Math.PI / 180, cx = ox + W / 2, cy = oy + Hh / 2;
      page.drawText(txt, { x: cx - Math.cos(th) * tw / 2 + Math.sin(th) * st.wm.size * .35, y: cy - Math.sin(th) * tw / 2 - Math.cos(th) * st.wm.size * .35, size: st.wm.size, font: f, color: rgb(cr, cg, cbb), opacity: st.wm.opacity, rotate: degrees(st.wm.angle + r) });
    }
    if (extras && st.num.on) {
      const f = await font('Helvetica', false), txt = safeText(f, numText(i, pages.length)), tw = f.widthOfTextAtSize(txt, st.num.size);
      const [u, v, al] = numPos(st.num.pos), us = al === 'center' ? u - tw / dW / 2 : al === 'right' ? u - tw / dW : u;
      const [x, y] = mapPt(us, v, r, W, Hh, ox, oy);
      page.drawText(txt, { x, y, size: st.num.size, font: f, color: rgb(.2, .2, .2), rotate: degrees(r) });
    }
  }
  if (st.title) out.setTitle(st.title); if (st.author) out.setAuthor(st.author); if (st.subject) out.setSubject(st.subject);
  if (st.keywords) out.setKeywords(st.keywords.split(',').map(s => s.trim()).filter(Boolean));
  out.setProducer('Folio · Taller'); out.setCreator('Folio');
  return out.save();
}
async function downloadPdf(pages, suffix = '') {
  if (!pages.length) { toast('No hay páginas'); return; }
  busy('Armando el PDF…');
  try { const bytes = await buildPdf(pages); download(new Blob([bytes], { type: 'application/pdf' }), `${safeName(S.name)}${suffix}.pdf`); toast(`PDF listo · ${fmtBytes(bytes.length)}`); }
  catch (e) { console.error(e); toast('No se pudo armar el PDF. Probá quitando la página que da problemas.'); }
  finally { busy(false); }
}
async function renderBytesPages(bytes, scale, cb) {
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  for (let i = 1; i <= pdf.numPages; i++) {
    busy(`Procesando página ${i} de ${pdf.numPages}…`);
    const pg = await pdf.getPage(i), vp = pg.getViewport({ scale });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: g, viewport: vp }).promise;
    await cb(c, i, vp);
  }
  pdf.destroy();
}
async function compress(level) {
  if (!S.pages.length) return;
  const cfg = { low: [72, .5], mid: [110, .65], high: [150, .8] }[level];
  busy('Comprimiendo…');
  try {
    const orig = await buildPdf();
    const out = await PDFDocument.create();
    await renderBytesPages(orig, cfg[0] / 72, async (c, i, vp) => {
      const jpg = await new Promise(r => c.toBlob(r, 'image/jpeg', cfg[1]));
      const e = await out.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
      const w = vp.width / (cfg[0] / 72), h = vp.height / (cfg[0] / 72);
      out.addPage([w, h]).drawImage(e, { x: 0, y: 0, width: w, height: h });
    });
    const bytes = await out.save();
    const res = $('#compRes');
    if (res) res.innerHTML = `Antes <b>${fmtBytes(orig.length)}</b> → después <b>${fmtBytes(bytes.length)}</b> (${bytes.length < orig.length ? '−' + Math.round((1 - bytes.length / orig.length) * 100) + '%' : 'no se achicó; probá un nivel más bajo'})`;
    if (bytes.length < orig.length) download(new Blob([bytes], { type: 'application/pdf' }), `${safeName(S.name)}-comprimido.pdf`);
    else toast('El PDF ya estaba bien comprimido');
  } catch (e) { console.error(e); toast('No se pudo comprimir'); }
  finally { busy(false); }
}
async function toImages(fmt, dpi) {
  if (!S.pages.length) return;
  busy('Convirtiendo…');
  try {
    const bytes = await buildPdf(); const files = [];
    await renderBytesPages(bytes, dpi / 72, async (c, i) => { files.push([`${safeName(S.name)}-pagina-${String(i).padStart(3, '0')}.${fmt}`, await new Promise(r => c.toBlob(r, fmt === 'png' ? 'image/png' : 'image/jpeg', .92))]); });
    if (files.length === 1) download(files[0][1], files[0][0]);
    else { await loadScript(JSZIP); const zip = new JSZip(); files.forEach(([n, b]) => zip.file(n, b)); download(await zip.generateAsync({ type: 'blob' }), `${safeName(S.name)}-imagenes.zip`); }
    toast(`${files.length} imagen${files.length > 1 ? 'es' : ''} lista${files.length > 1 ? 's' : ''}`);
  } catch (e) { console.error(e); toast('No se pudo convertir'); }
  finally { busy(false); }
}
async function splitPdf(mode, n) {
  if (!S.pages.length) return;
  if (mode === 'selected') { const pages = S.pages.filter(p => selected.has(p.id)); if (!pages.length) { toast('Seleccioná las páginas en la cuadrícula'); return; } return downloadPdf(pages, '-extracto'); }
  busy('Dividiendo…');
  try {
    await loadScript(JSZIP); const zip = new JSZip(); const step = mode === 'each' ? 1 : Math.max(1, n | 0);
    for (let i = 0; i < S.pages.length; i += step) { busy(`Parte ${Math.floor(i / step) + 1}…`); const part = S.pages.slice(i, i + step); zip.file(`${safeName(S.name)}-${step === 1 ? 'pagina' : 'parte'}-${String(Math.floor(i / step) + 1).padStart(3, '0')}.pdf`, await buildPdf(part)); }
    download(await zip.generateAsync({ type: 'blob' }), `${safeName(S.name)}-dividido.zip`); toast('Listo');
  } catch (e) { console.error(e); toast('No se pudo dividir'); }
  finally { busy(false); }
}

/* ---------- panel derecho ---------- */
function syncTabs() { $$('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.tab === tab)); }
$$('.tab').forEach(t => t.addEventListener('click', () => { tab = t.dataset.tab; syncTabs(); if (tab === 'edit' && view !== 'page' && S.pages.length) { if (selected.size) cur = S.pages.findIndex(p => selected.has(p.id)); setView('page'); } else renderSide(); }));
const card = (ic, title, body) => `<div class="toolcard"><h3>${icon(ic)}${title}</h3>${body}</div>`;
function renderSide() {
  const box = $('#side'); const st = S.settings; let h = '';
  if (tab === 'pages') {
    const n = selected.size;
    h += card('<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="9"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>', 'Organizar páginas', `<p class="hint">${n ? `${n} página${n > 1 ? 's' : ''} seleccionada${n > 1 ? 's' : ''}.` : 'Tocá una página para elegirla. Ctrl para sumar, Mayús para un rango. Arrastralas para reordenar.'}</p>
      <div class="row-btns"><button class="btn small" data-cmd="rotSelL"${n ? '' : ' disabled'}>⟲ Girar</button><button class="btn small" data-cmd="rotSelR"${n ? '' : ' disabled'}>⟳ Girar</button><button class="btn small" data-cmd="dupSel"${n ? '' : ' disabled'}>Duplicar</button><button class="btn small danger" data-cmd="delSel"${n ? '' : ' disabled'}>Eliminar</button></div>
      <div class="row-btns"><button class="btn small" data-cmd="extract"${n ? '' : ' disabled'}>Descargar selección</button><button class="btn small" data-cmd="blank">Insertar página en blanco</button><button class="btn small" data-cmd="reverse">Invertir orden</button></div>`);
    h += card('<path d="M12 5v14M5 12h14"/>', 'Unir documentos', `<p class="hint">Agregá más PDF o imágenes: se suman después de la página seleccionada o al final.</p><button class="btn small primary" data-cmd="add">Agregar archivos</button>`);
  } else if (tab === 'edit') {
    const a = selAnn ? annById(selAnn) : null;
    h += card('<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>', 'Editar la página', `<p class="hint">Elegí una herramienta arriba de la página: texto, firma, imagen, rectángulo, resaltador o tapar. Arrastrá los elementos para moverlos.</p><div class="row-btns"><button class="btn small primary" data-cmd="sign">Firmar</button><button class="btn small" data-cmd="tool:text">Agregar texto</button><button class="btn small" data-cmd="tool:highlight">Resaltar</button></div>`);
    if (a) {
      let body = '';
      if (a.type === 'text') body = `<textarea id="aText" rows="3" style="width:100%;background:var(--panel-2);border:1px solid var(--line);border-radius:6px;padding:6px 8px" aria-label="Texto">${esc(a.text)}</textarea>
        <div class="f"><label for="aSize">Tamaño</label><input type="range" id="aSize" min="6" max="72" value="${a.size}"><output>${a.size}</output></div>
        <div class="f wide"><label for="aColor">Color</label><input type="color" id="aColor" value="${a.color}"></div>
        <div class="f wide"><label for="aFont">Fuente</label><select id="aFont">${['Helvetica', 'Times', 'Courier'].map(f => `<option${a.font === f ? ' selected' : ''}>${f}</option>`).join('')}</select></div>
        <label class="row-btns hint"><input type="checkbox" id="aBold" ${a.bold ? 'checked' : ''}> Negrita</label>`;
      else if (a.type === 'image') body = `<div class="f"><label for="aOp">Opacidad</label><input type="range" id="aOp" min=".1" max="1" step=".01" value="${a.opacity ?? 1}"><output>${Math.round((a.opacity ?? 1) * 100)}%</output></div><p class="hint">Arrastrá el punto de la esquina para cambiar el tamaño.</p>`;
      else if (a.type === 'rect' || a.type === 'highlight') body = `<div class="f wide"><label for="aColor">Color</label><input type="color" id="aColor" value="${a.color}"></div>${a.type === 'rect' ? `<div class="f"><label for="aOp">Opacidad</label><input type="range" id="aOp" min=".05" max="1" step=".01" value="${a.opacity ?? 1}"><output>${Math.round((a.opacity ?? 1) * 100)}%</output></div>` : ''}`;
      else body = `<p class="hint">Tapa el contenido con blanco. Para borrar datos sensibles de verdad, después usá Comprimir: convierte las páginas en imágenes y el texto tapado deja de existir.</p>`;
      h += card('<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2"/>', { text: 'Texto', image: 'Imagen o firma', rect: 'Rectángulo', highlight: 'Resaltado', cover: 'Tapar' }[a.type], body + `<div class="row-btns"><button class="btn small" data-cmd="dupAnn">Duplicar</button><button class="btn small danger" data-cmd="delAnn">Eliminar</button></div>`);
    }
    const saved = sigs();
    if (saved.length) h += card('<path d="M3 17c3-3 5-9 7-9s-1 9 2 9 4-5 6-5 2 3 3 3"/>', 'Firmas guardadas', `<div class="siglist">${saved.map((s, i) => `<button data-usesig="${i}" class="${pendingSig === s ? 'on' : ''}" aria-label="Usar firma ${i + 1}"><img src="${s}" alt=""></button>`).join('')}</div><button class="btn small" data-cmd="clearSigs">Borrar firmas guardadas</button>`);
  } else if (tab === 'doc') {
    h += card('<path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/>', 'Datos del documento', `<div class="f wide"><label for="mTitle">Título</label><input type="text" id="mTitle" value="${esc(st.title)}"></div><div class="f wide"><label for="mAuthor">Autor</label><input type="text" id="mAuthor" value="${esc(st.author)}"></div><div class="f wide"><label for="mSubject">Asunto</label><input type="text" id="mSubject" value="${esc(st.subject)}"></div><div class="f wide"><label for="mKeys">Palabras clave</label><input type="text" id="mKeys" value="${esc(st.keywords)}" placeholder="separadas por coma"></div>`);
    h += card('<path d="M4 20 20 4"/><path d="M7 4h13v13"/>', 'Marca de agua', `<label class="row-btns hint"><input type="checkbox" id="wmOn" ${st.wm.on ? 'checked' : ''}> Agregar en todas las páginas</label><div class="f wide"><label for="wmText">Texto</label><input type="text" id="wmText" value="${esc(st.wm.text)}"></div><div class="f"><label for="wmSize">Tamaño</label><input type="range" id="wmSize" min="12" max="160" value="${st.wm.size}"><output>${st.wm.size}</output></div><div class="f"><label for="wmOp">Opacidad</label><input type="range" id="wmOp" min=".03" max="1" step=".01" value="${st.wm.opacity}"><output>${Math.round(st.wm.opacity * 100)}%</output></div><div class="f"><label for="wmAng">Ángulo</label><input type="range" id="wmAng" min="-90" max="90" value="${st.wm.angle}"><output>${st.wm.angle}°</output></div><div class="f wide"><label for="wmColor">Color</label><input type="color" id="wmColor" value="${st.wm.color}"></div>`);
    h += card('<path d="M4 7h3v10M10 17h4l-4-6a2 2 0 1 1 4-1M17 7h3l-2 4a2.5 2.5 0 1 1-1 4"/>', 'Numerar páginas', `<label class="row-btns hint"><input type="checkbox" id="nOn" ${st.num.on ? 'checked' : ''}> Mostrar números</label><div class="f wide"><label for="nPos">Posición</label><select id="nPos">${[['bc', 'Abajo al centro'], ['br', 'Abajo a la derecha'], ['bl', 'Abajo a la izquierda'], ['tc', 'Arriba al centro'], ['tr', 'Arriba a la derecha'], ['tl', 'Arriba a la izquierda']].map(([v, n]) => `<option value="${v}"${st.num.pos === v ? ' selected' : ''}>${n}</option>`).join('')}</select></div><div class="f wide"><label for="nFmt">Formato</label><select id="nFmt">${[['{n}', '1'], ['Página {n}', 'Página 1'], ['{n} / {t}', '1 / 10'], ['Página {n} de {t}', 'Página 1 de 10'], ['- {n} -', '- 1 -']].map(([v, n]) => `<option value="${esc(v)}"${st.num.fmt === v ? ' selected' : ''}>${n}</option>`).join('')}</select></div><div class="f"><label for="nSize">Tamaño</label><input type="range" id="nSize" min="6" max="24" value="${st.num.size}"><output>${st.num.size}</output></div><div class="f"><label for="nStart">Empezar en</label><input type="number" id="nStart" min="0" value="${st.num.start}" class="inp"></div>`);
  } else {
    h += card('<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>', 'Comprimir PDF', `<p class="hint">Achica el archivo convirtiendo las páginas en imágenes. Ideal para mandar por mail o WhatsApp. El texto deja de poder seleccionarse.</p><div class="row-btns"><button class="btn small" data-cmd="comp:low">Máxima compresión</button><button class="btn small primary" data-cmd="comp:mid">Recomendada</button><button class="btn small" data-cmd="comp:high">Alta calidad</button></div><div class="result" id="compRes" hidden></div>`);
    h += card('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>', 'PDF a imágenes', `<div class="row-btns"><select id="imgFmt" class="sel"><option value="png">PNG</option><option value="jpg">JPG</option></select><select id="imgDpi" class="sel"><option value="96">Pantalla (96 ppp)</option><option value="150" selected>Buena (150 ppp)</option><option value="300">Impresión (300 ppp)</option></select><button class="btn small primary" data-cmd="toImg">Convertir</button></div><p class="hint">Si hay varias páginas, descargás un ZIP.</p>`);
    h += card('<path d="M6 3v18M18 3v18M6 12h12"/>', 'Dividir PDF', `<div class="row-btns"><button class="btn small" data-cmd="split:each">Cada página por separado</button><button class="btn small" data-cmd="split:selected">Solo las seleccionadas</button></div><div class="row-btns"><span class="hint">Cada</span><input type="number" id="splitN" class="inp" value="2" min="1" style="width:64px" aria-label="Páginas por parte"><span class="hint">páginas</span><button class="btn small" data-cmd="split:n">Dividir</button></div>`);
    h += card('<path d="M6 3h8l4 4v14H6z"/><path d="M9 13h6M12 10v6"/>', 'Imágenes a PDF', `<p class="hint">Agregá JPG, PNG o capturas y se convierten en páginas.</p><div class="f wide"><label for="imgFit">Página</label><select id="imgFit"><option value="fit"${st.imgFit === 'fit' ? ' selected' : ''}>Del tamaño de la imagen</option><option value="a4p"${st.imgFit === 'a4p' ? ' selected' : ''}>A4 vertical</option><option value="a4l"${st.imgFit === 'a4l' ? ' selected' : ''}>A4 horizontal</option></select></div><button class="btn small primary" data-cmd="addImages">Elegir imágenes</button>`);
  }
  box.innerHTML = h;
  if (tab === 'convert' && lastComp) { const r = $('#compRes'); r.hidden = false; r.innerHTML = lastComp; }
}
let lastComp = '';
let sidePre = null;
$('#side').addEventListener('focusin', () => { sidePre = snap(); });
$('#side').addEventListener('input', e => {
  const t = e.target, id = t.id, v = t.value, st = S.settings, out = t.nextElementSibling?.tagName === 'OUTPUT' ? t.nextElementSibling : null;
  if (!sidePre) sidePre = snap();
  const a = selAnn ? annById(selAnn) : null;
  switch (id) {
    case 'aText': if (a) a.text = v; break; case 'aSize': if (a) a.size = +v; break; case 'aColor': if (a) a.color = v; break; case 'aFont': if (a) a.font = v; break; case 'aBold': if (a) a.bold = t.checked; break;
    case 'aOp': if (a) a.opacity = +v; if (out) out.textContent = Math.round(v * 100) + '%'; renderAnnots(); return;
    case 'mTitle': st.title = v; break; case 'mAuthor': st.author = v; break; case 'mSubject': st.subject = v; break; case 'mKeys': st.keywords = v; break;
    case 'wmOn': st.wm.on = t.checked; break; case 'wmText': st.wm.text = v; break; case 'wmSize': st.wm.size = +v; break; case 'wmColor': st.wm.color = v; break;
    case 'wmOp': st.wm.opacity = +v; if (out) out.textContent = Math.round(v * 100) + '%'; if (view === 'page') renderAnnots(); return;
    case 'wmAng': st.wm.angle = +v; if (out) out.textContent = v + '°'; if (view === 'page') renderAnnots(); return;
    case 'nOn': st.num.on = t.checked; break; case 'nPos': st.num.pos = v; break; case 'nFmt': st.num.fmt = v; break; case 'nSize': st.num.size = +v; break; case 'nStart': st.num.start = parseInt(v) || 0; break;
    case 'imgFit': st.imgFit = v; break;
    default: return;
  }
  if (out) out.textContent = v;
  if (view === 'page') renderAnnots();
});
$('#side').addEventListener('change', () => { if (sidePre && sidePre !== snap()) { pushUndo(sidePre); scheduleSave(); renderThumbs(); } sidePre = null; });
$('#side').addEventListener('click', e => { const b = e.target.closest('[data-usesig]'); if (b) { pendingSig = sigs()[+b.dataset.usesig]; startPlacingSig(); renderSide(); } });

/* ---------- comandos ---------- */
const selPages = () => S.pages.filter(p => selected.has(p.id));
const CMD = {
  undo, redo, add: async () => addFiles(await pickFiles('application/pdf,.pdf,image/*', true)),
  addImages: async () => addFiles(await pickFiles('image/*', true)),
  download: () => downloadPdf(S.pages),
  selAll: () => { selected = new Set(S.pages.map(p => p.id)); renderGrid(); renderSelInfo(); renderSide(); },
  rotSelL: () => { pushUndo(); selPages().forEach(p => p.rot = (p.rot + 270) % 360); changed(); },
  rotSelR: () => { pushUndo(); selPages().forEach(p => p.rot = (p.rot + 90) % 360); changed(); },
  dupSel: () => { const s = selPages(); if (!s.length) return; pushUndo(); const last = S.pages.indexOf(s[s.length - 1]); const copies = s.map(p => ({ ...JSON.parse(JSON.stringify(p)), id: uid('p') })); copies.forEach(c => c.annots.forEach(a => a.id = uid('a'))); S.pages.splice(last + 1, 0, ...copies); selected = new Set(copies.map(c => c.id)); changed(); },
  delSel: () => { if (!selected.size) return; pushUndo(); S.pages = S.pages.filter(p => !selected.has(p.id)); selected.clear(); changed(); },
  extract: () => downloadPdf(selPages(), '-extracto'),
  blank: () => { pushUndo(); const s = selPages(), ref = s[s.length - 1] || S.pages[S.pages.length - 1]; const [w, h] = ref ? [ref.w, ref.h] : A4; const at = ref ? S.pages.indexOf(ref) + 1 : 0; const p = { id: uid('p'), src: { kind: 'blank' }, baseRot: 0, rot: 0, w, h, annots: [] }; S.pages.splice(at, 0, p); selected = new Set([p.id]); changed(); },
  reverse: () => { if (S.pages.length < 2) return; pushUndo(); S.pages.reverse(); changed(); },
  prevPage: () => { if (cur > 0) { cur--; selAnn = null; renderPage(); } }, nextPage: () => { if (cur < S.pages.length - 1) { cur++; selAnn = null; renderPage(); } },
  sign: () => { if (!S.pages.length) { toast('Agregá un PDF primero'); return; } openSignature(); },
  delAnn: () => { const p = S.pages[cur]; if (!p || !selAnn) return; pushUndo(); p.annots = p.annots.filter(a => a.id !== selAnn); selAnn = null; renderAnnots(); renderSide(); renderThumbs(); scheduleSave(); },
  dupAnn: () => { const a = annById(selAnn); if (!a) return; pushUndo(); const c = { ...a, id: uid('a'), u: a.u + .02, v: a.v + .02 }; S.pages[cur].annots.push(c); selAnn = c.id; renderAnnots(); renderSide(); scheduleSave(); },
  clearSigs: () => { saveSigs([]); pendingSig = null; renderSide(); },
  toImg: () => toImages($('#imgFmt').value, +$('#imgDpi').value),
  clearAll: () => {
    openDialog(`<h3>¿Empezar de cero?</h3><p>Se quitan todas las páginas de este documento. Podés deshacerlo con Ctrl+Z.</p><div class="row-btns"><button class="btn primary" id="caOk">Sí, empezar de cero</button><button class="btn" id="caNo">Cancelar</button></div>`);
    $('#caNo').onclick = closeDialog;
    $('#caOk').onclick = () => { pushUndo(); S.pages = []; S.settings = defaultSettings(); S.name = 'Documento'; $('#docName').value = S.name; selected.clear(); closeDialog(); setView('grid'); changed(); };
  },
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-cmd]'); if (!b || b.disabled) return;
  const c = b.dataset.cmd;
  if (c.startsWith('comp:')) compress(c.slice(5)).then(() => { const r = $('#compRes'); if (r && r.innerHTML) { r.hidden = false; lastComp = r.innerHTML; } });
  else if (c.startsWith('split:')) splitPdf(c.slice(6), +($('#splitN')?.value || 2));
  else if (c.startsWith('tool:')) { if (view !== 'page') setView('page'); setAnnTool(c.slice(5)); }
  else if (CMD[c]) CMD[c]();
});
$('#docName').addEventListener('input', e => { S.name = e.target.value; scheduleSave(); });

/* ---------- diálogo, teclado y soltar ---------- */
function openDialog(html) { $('#dlgBody').innerHTML = html; $('#dlg').hidden = false; }
function closeDialog() { $('#dlg').hidden = true; const n = $('#dlgBody').cloneNode(false); $('#dlgBody').replaceWith(n); }
document.addEventListener('keydown', e => {
  if (!$('#dlg').hidden) { if (e.key === 'Escape') closeDialog(); return; }
  if (e.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && k === 'y') { e.preventDefault(); redo(); return; }
  if (mod && k === 's') { e.preventDefault(); CMD.download(); return; }
  if (mod && k === 'a' && view === 'grid') { e.preventDefault(); CMD.selAll(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); if (view === 'page' && selAnn) CMD.delAnn(); else if (view === 'grid') CMD.delSel(); return; }
  if (view === 'page' && (e.key === 'ArrowLeft' || e.key === 'PageUp')) CMD.prevPage();
  if (view === 'page' && (e.key === 'ArrowRight' || e.key === 'PageDown')) CMD.nextPage();
  if (e.key === 'Escape') { if (view === 'page') { if (annTool !== 'select') setAnnTool('select'); else { selAnn = null; renderAnnots(); } } else { selected.clear(); renderGrid(); renderSide(); renderSelInfo(); } }
});
const stage = $('#stage');
['dragenter', 'dragover'].forEach(ev => stage.addEventListener(ev, e => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); $('#dropMsg').hidden = false; } }));
stage.addEventListener('dragleave', e => { if (!stage.contains(e.relatedTarget)) $('#dropMsg').hidden = true; });
stage.addEventListener('drop', e => { if (!e.dataTransfer?.files.length) return; e.preventDefault(); $('#dropMsg').hidden = true; addFiles(e.dataTransfer.files); });
document.addEventListener('paste', e => { const fs = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/') || f.type === 'application/pdf'); if (fs.length) { e.preventDefault(); addFiles(fs); } });

/* ---------- inicio ---------- */
function renderAll() { renderSelInfo(); renderSide(); if (view === 'grid') renderGrid(); else renderPage(); $('#empty').hidden = S.pages.length > 0; }
async function samplePdf() {
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.HelveticaBold), r = await d.embedFont(StandardFonts.Helvetica);
  const texts = [['Documento de ejemplo', 'Arrastrá las páginas para cambiar el orden.', 'Doble clic en una página para editarla.'], ['Firmá tus documentos', 'En la pestaña Editar podés dibujar o escribir tu firma', 'y ubicarla donde quieras.'], ['Uní, dividí y comprimí', 'Agregá tus propios PDF con el botón de arriba.', 'Todo se procesa en tu computadora.']];
  const cols = [[.937, .42, .341], [.616, .514, 1], [.212, .761, .706]];
  texts.forEach(([t, a, b], i) => {
    const p = d.addPage(A4); p.drawRectangle({ x: 0, y: A4[1] - 140, width: A4[0], height: 140, color: rgb(...cols[i]) });
    p.drawText(t, { x: 50, y: A4[1] - 90, size: 30, font: f, color: rgb(1, 1, 1) });
    p.drawText(a, { x: 50, y: A4[1] - 210, size: 15, font: r, color: rgb(.15, .15, .2) });
    p.drawText(b, { x: 50, y: A4[1] - 236, size: 15, font: r, color: rgb(.15, .15, .2) });
    for (let k = 0; k < 14; k++) p.drawRectangle({ x: 50, y: A4[1] - 300 - k * 30, width: (A4[0] - 100) * (k % 4 === 3 ? .6 : 1), height: 9, color: rgb(.9, .9, .92) });
    p.drawText(`${i + 1}`, { x: A4[0] / 2 - 4, y: 30, size: 11, font: r, color: rgb(.5, .5, .55) });
  });
  return d.save();
}
updUndo(); setView('grid');
(async () => {
  let ok = false;
  try {
    const o = await store.get('folio:doc');
    if (o && o.pages && o.pages.length) {
      (o.sources || []).forEach(s => sources.set(s.id, { id: s.id, name: s.name, bytes: s.bytes instanceof Uint8Array ? s.bytes : new Uint8Array(s.bytes) }));
      (o.images || []).forEach(im => images.set(im.id, im));
      S.name = o.name; S.pages = o.pages.filter(p => p.src.kind !== 'pdf' || sources.has(p.src.sid)).filter(p => p.src.kind !== 'img' || images.has(p.src.iid)); S.settings = Object.assign(defaultSettings(), o.settings);
      $('#docName').value = S.name; ok = S.pages.length > 0; $('#savedLbl').textContent = 'Guardado';
    }
  } catch (e) { ok = false; }
  if (!ok) { try { S.pages = await addPdfBytes(await samplePdf(), 'ejemplo.pdf'); S.name = 'Documento de ejemplo'; $('#docName').value = S.name; } catch (e) { S.pages = []; } }
  H.clear(); updUndo(); renderAll();
})();
window.__folio = { S, CMD, buildPdf, setView, sources };
})();
