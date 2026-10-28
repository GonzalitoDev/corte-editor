/* Corte — editor de video en el navegador. Todo gratis, todo local. */
(() => {
'use strict';
const SCRIPT_BASE = document.currentScript ? new URL('.', document.currentScript.src).href : new URL('js/', location.href).href;

/* =========================================================
   Utilidades
   ========================================================= */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const PREVIEW_FPS = 30;
const pad = n => String(n).padStart(2, '0');
const tc = t => { t = Math.max(0, t || 0); return `${pad(Math.floor(t / 60))}:${pad(Math.floor(t % 60))}:${pad(Math.floor((t % 1) * PREVIEW_FPS + 1e-6))}`; };
const tcs = t => { t = Math.max(0, t || 0); return `${pad(Math.floor(t / 60))}:${pad(Math.floor(t % 60))}`; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let nid = 0; const uid = p => p + (++nid).toString(36) + Math.random().toString(36).slice(2, 7);
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const easeOut = k => 1 - Math.pow(1 - k, 3);
const easeInOut = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const easeBack = k => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
const easeBounce = k => { const n = 7.5625, d = 2.75; if (k < 1 / d) return n * k * k; if (k < 2 / d) return n * (k -= 1.5 / d) * k + .75; if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + .9375; return n * (k -= 2.625 / d) * k + .984375; };
const hexRgb = hex => { const n = parseInt((hex || '#000000').slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const hexA = (hex, a) => { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const once = (el, ev, ms = 12000) => new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error('timeout')), ms);
  el.addEventListener(ev, () => { clearTimeout(to); res(); }, { once: true });
  el.addEventListener('error', () => { clearTimeout(to); rej(new Error('error')); }, { once: true });
});
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
let toastT; function toast(msg, ms = 3000) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms); }
const safeName = s => (s || 'video').trim().replace(/[^\w\-áéíóúñü ]+/gi, '').replace(/\s+/g, '-').toLowerCase() || 'video';

/* =========================================================
   Catálogos
   ========================================================= */
const ASPECTS = { '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1], '4:5': [4, 5], '4:3': [4, 3], '21:9': [21, 9] };
function dims(aspect, q) {
  const [a, b] = ASPECTS[aspect] || [16, 9];
  const even = v => Math.round(v / 2) * 2;
  return a >= b ? [even(q * a / b), q] : [q, even(q * b / a)];
}
const FONTS = [['Figtree', 'Figtree'], ['Bricolage Grotesque', 'Bricolage'], ['Anton', 'Anton'], ['Bebas Neue', 'Bebas Neue'], ['Instrument Serif', 'Instrument Serif'], ['Pacifico', 'Pacifico'], ['Permanent Marker', 'Marcador'], ['JetBrains Mono', 'Mono'], ['Impact', 'Impact'], ['Georgia', 'Georgia'], ['Arial', 'Arial']];
const fontStack = f => `"${f}", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif`;

const ANIM_IN = [['none', 'Ninguna'], ['fade', 'Aparecer'], ['zoomIn', 'Acercar'], ['zoomOut', 'Alejar'], ['slideL', 'Entrar ←'], ['slideR', 'Entrar →'], ['slideU', 'Subir'], ['slideD', 'Bajar'], ['pop', 'Rebote'], ['drop', 'Caer'], ['spin', 'Girar'], ['swing', 'Balanceo'], ['blur', 'Enfocar']];
const ANIM_OUT = [['none', 'Ninguna'], ['fade', 'Desvanecer'], ['zoomIn', 'Achicar'], ['zoomOut', 'Agrandar'], ['slideL', 'Salir ←'], ['slideR', 'Salir →'], ['slideU', 'Subir'], ['slideD', 'Bajar'], ['pop', 'Encoger'], ['spin', 'Girar'], ['swing', 'Balanceo'], ['blur', 'Desenfocar']];
const LOOPS = [['none', 'Ninguno'], ['kenIn', 'Zoom lento (Ken Burns)'], ['kenOut', 'Alejar lento'], ['panL', 'Paneo ←'], ['panR', 'Paneo →'], ['pulse', 'Latido'], ['sway', 'Vaivén'], ['float', 'Flotar'], ['shake', 'Temblor']];
const TEXT_IN = [['none', 'Ninguna'], ['fade', 'Aparecer'], ['typewriter', 'Máquina de escribir'], ['wave', 'Letras en ola'], ['bounceL', 'Letras que caen'], ['pop', 'Rebote'], ['zoomIn', 'Acercar'], ['zoomOut', 'Alejar'], ['slideU', 'Subir'], ['slideD', 'Bajar'], ['slideL', 'Entrar ←'], ['slideR', 'Entrar →'], ['blur', 'Enfocar'], ['spin', 'Girar']];
const TEXT_OUT = [['none', 'Ninguna'], ['fade', 'Desvanecer'], ['typewriter', 'Borrar letras'], ['zoomIn', 'Achicar'], ['zoomOut', 'Agrandar'], ['slideU', 'Subir'], ['slideD', 'Bajar'], ['slideL', 'Salir ←'], ['slideR', 'Salir →'], ['blur', 'Desenfocar']];
const TEXT_LOOPS = [['none', 'Ninguno'], ['pulse', 'Latido'], ['sway', 'Vaivén'], ['float', 'Flotar'], ['waveLoop', 'Ondear letras'], ['shake', 'Temblor']];
const PER_LETTER = new Set(['typewriter', 'wave', 'bounceL']);
const BLENDS = [['source-over', 'Normal'], ['multiply', 'Multiplicar'], ['screen', 'Trama'], ['overlay', 'Superponer'], ['lighten', 'Aclarar'], ['darken', 'Oscurecer'], ['color-dodge', 'Sobreexponer'], ['difference', 'Diferencia'], ['soft-light', 'Luz suave'], ['hard-light', 'Luz fuerte']];
const MASKS = [['none', 'Sin máscara'], ['circle', 'Círculo'], ['ellipse', 'Óvalo'], ['rounded', 'Bordes redondeados'], ['heart', 'Corazón'], ['star', 'Estrella'], ['diamond', 'Rombo'], ['split', 'Mitad']];

const ANIM_BASE = () => ({ animIn: 'none', animInDur: .5, animOut: 'none', animOutDur: .5, loop: 'none' });
const VIS = () => ({ x: .5, y: .5, scale: 1, rotation: 0, opacity: 1, flipX: false, flipY: false, cropL: 0, cropT: 0, cropR: 0, cropB: 0, fit: 'contain', blend: 'source-over', mask: 'none', brightness: 100, contrast: 100, saturate: 100, blur: 0, sepia: 0, hue: 0, grayscale: 0, filter: 'Original', fadeIn: 0, fadeOut: 0, volume: 1, speed: 1, chroma: false, chromaColor: '#00ff00', chromaTol: .32, chromaSoft: .12, removeBg: false, ...ANIM_BASE() });
const TEXT_BASE = () => ({ text: 'Tu texto', font: 'Figtree', weight: 700, size: .08, color: '#ffffff', align: 'center', letterSpacing: 0, lineHeight: 1.18, italic: false, upper: false, box: false, boxColor: '#000000', boxAlpha: .6, stroke: 0, strokeColor: '#000000', shadow: true, glow: false, glowColor: '#e8a33d', x: .5, y: .5, rotation: 0, opacity: 1, fadeIn: 0, fadeOut: 0, blend: 'source-over', ...ANIM_BASE(), animIn: 'fade', animInDur: .4, animOut: 'fade', animOutDur: .3 });
const SHAPE_BASE = () => ({ shape: 'rect', w: .35, h: .35, fill: '#e8a33d', fillOn: true, stroke: '#ffffff', strokeW: 0, radius: .12, x: .5, y: .5, scale: 1, rotation: 0, opacity: 1, fadeIn: 0, fadeOut: 0, blend: 'source-over', ...ANIM_BASE(), animIn: 'pop' });
const COLOR_BASE = () => ({ mode: 'linear', c1: '#ff7a59', c2: '#6c2a86', angle: 35, drift: true, opacity: 1, fadeIn: 0, fadeOut: 0, ...ANIM_BASE() });
const FX_BASE = () => ({ type: 'vignette', intensity: .6, fadeIn: 0, fadeOut: 0 });

const TEXT_PRESETS = [
  { name: 'Título', p: { font: 'Bricolage Grotesque', weight: 800, size: .12, animIn: 'pop' }, sample: 'Tu título' },
  { name: 'Subtítulo', p: { font: 'Figtree', weight: 600, size: .052, box: true, boxColor: '#000000', boxAlpha: .6, shadow: false, y: .84 }, sample: 'Escribí tu subtítulo' },
  { name: 'Cinta', p: { font: 'Figtree', weight: 800, size: .06, color: '#1b1306', box: true, boxColor: '#e8a33d', boxAlpha: 1, shadow: false, animIn: 'slideR' }, sample: 'NUEVO' },
  { name: 'Contorno', p: { font: 'Anton', weight: 400, size: .12, stroke: 9, strokeColor: '#111111', shadow: false, upper: true, animIn: 'pop' }, sample: 'Contorno' },
  { name: 'Neón', p: { font: 'Bricolage Grotesque', weight: 800, size: .11, color: '#fff3e0', glow: true, glowColor: '#ff3cac', shadow: false, animIn: 'fade' }, sample: 'Neón' },
  { name: 'Póster', p: { font: 'Bebas Neue', weight: 400, size: .16, letterSpacing: .08, upper: true, animIn: 'wave' }, sample: 'PÓSTER' },
  { name: 'Impacto', p: { font: 'Anton', weight: 400, size: .1, color: '#ffe14d', stroke: 7, strokeColor: '#000000', upper: true, animIn: 'bounceL' }, sample: '¡IMPACTO!' },
  { name: 'Elegante', p: { font: 'Instrument Serif', weight: 400, size: .12, color: '#f5ead8', italic: true }, sample: 'Elegante' },
  { name: 'Firma', p: { font: 'Pacifico', weight: 400, size: .09, color: '#ffffff', animIn: 'typewriter' }, sample: 'Firma' },
  { name: 'Marcador', p: { font: 'Permanent Marker', weight: 400, size: .09, color: '#ffffff', rotation: -4, animIn: 'pop' }, sample: 'Marcador' },
  { name: 'Máquina', p: { font: 'JetBrains Mono', weight: 500, size: .055, color: '#d8f3e3', animIn: 'typewriter' }, sample: 'Máquina' },
  { name: 'Burbuja', p: { font: 'Figtree', weight: 900, size: .07, color: '#ffffff', box: true, boxColor: '#2457d6', boxAlpha: 1, shadow: true, animIn: 'pop', loop: 'float' }, sample: 'Burbuja' },
];
const CAPTION_STYLES = [
  { name: 'Caja negra', p: { font: 'Figtree', weight: 700, size: .05, box: true, boxColor: '#000000', boxAlpha: .65, shadow: false, y: .84, animIn: 'fade', animInDur: .15, animOut: 'none' } },
  { name: 'Contorno blanco', p: { font: 'Figtree', weight: 900, size: .058, stroke: 7, strokeColor: '#000000', shadow: true, y: .82, animIn: 'pop', animInDur: .2, animOut: 'none' } },
  { name: 'Amarillo viral', p: { font: 'Anton', weight: 400, size: .07, color: '#ffe14d', stroke: 8, strokeColor: '#000000', upper: true, y: .72, animIn: 'pop', animInDur: .2, animOut: 'none' } },
  { name: 'Minimal', p: { font: 'Figtree', weight: 600, size: .045, shadow: true, y: .88, animIn: 'fade', animInDur: .15, animOut: 'fade', animOutDur: .15 } },
];
const EMOJIS = ['😀', '😂', '🥹', '😍', '😎', '🤯', '😱', '🥳', '😡', '🤔', '👀', '🙌', '👏', '👍', '👎', '🙏', '💪', '🔥', '✨', '⭐', '💯', '❤️', '💔', '💥', '💬', '🎉', '🎬', '🎵', '📍', '⚡', '☀️', '🌙', '🌈', '🍕', '☕', '🚀', '💰', '🎁', '⚽', '🏆', '🎮', '📱', '💡', '✅', '❌', '⚠️', '➡️', '⬇️'];
const SHAPES = [['rect', 'Rectángulo'], ['circle', 'Círculo'], ['triangle', 'Triángulo'], ['star', 'Estrella'], ['heart', 'Corazón'], ['arrow', 'Flecha'], ['line', 'Línea'], ['bubble', 'Globo']];
const FX_LIST = [
  ['vignette', 'Viñeta', 'radial-gradient(circle,#c98a4a 30%,#000 100%)'], ['grain', 'Grano', 'repeating-radial-gradient(#777 0 1px,#444 1px 3px)'], ['glitch', 'Glitch', 'linear-gradient(90deg,#f0f 0 30%,#0ff 30% 60%,#222 60%)'],
  ['rgb', 'Separar RGB', 'linear-gradient(90deg,#f33,#3f3,#33f)'], ['shake', 'Sacudida', 'linear-gradient(115deg,#555,#999,#555)'], ['flash', 'Destellos', 'radial-gradient(circle,#fff,#888)'],
  ['blur', 'Desenfoque', 'radial-gradient(circle,#9ab 0,#456 80%)'], ['cinema', 'Barras de cine', 'linear-gradient(#000 0 20%,#7a6 20% 80%,#000 80%)'], ['oldfilm', 'Película vieja', 'linear-gradient(#a8865a,#5c4630)'],
  ['zoompulse', 'Pulso', 'radial-gradient(circle,#e8a33d 0 25%,#333 26%)'], ['leak', 'Luz cálida', 'radial-gradient(circle at 30% 30%,#ffb35a,#a23 60%,#111)'], ['glow', 'Brillo', 'radial-gradient(circle,#fff6c9,#e8a33d 50%,#222)'],
  ['bw', 'Blanco y negro', 'linear-gradient(90deg,#000,#fff)'], ['invert', 'Negativo', 'linear-gradient(90deg,#0ff,#f0f)'], ['pixel', 'Pixelado', 'conic-gradient(#6a4 0 25%,#264 0 50%,#6a4 0 75%,#264 0)'],
  ['mirror', 'Espejo', 'linear-gradient(90deg,#357,#79b 50%,#357)'], ['vhs', 'VHS', 'repeating-linear-gradient(#333 0 2px,#555 2px 4px)'], ['confetti', 'Confeti', 'radial-gradient(#f55 2px,transparent 3px) 0 0/12px 12px,radial-gradient(#5cf 2px,#222 3px) 6px 6px/12px 12px'],
  ['snow', 'Nieve', 'radial-gradient(#fff 1.5px,transparent 2px) 0 0/10px 10px,#234'], ['hearts', 'Corazones', 'radial-gradient(#f5a 3px,#311 4px) 0 0/14px 14px'],
];
const FX_NAME = Object.fromEntries(FX_LIST.map(f => [f[0], f[1]]));
const TRANS_LIST = [['fade', 'Fundido'], ['black', 'Fundido a negro'], ['white', 'Fundido a blanco'], ['slideL', 'Deslizar ←'], ['slideR', 'Deslizar →'], ['slideU', 'Deslizar ↑'], ['push', 'Empujar'], ['zoom', 'Zoom'], ['zoomOut', 'Alejar'], ['wipe', 'Barrido'], ['wipeV', 'Barrido vertical'], ['circle', 'Círculo'], ['blur', 'Desenfoque'], ['spin', 'Giro'], ['flash', 'Flash'], ['glitchT', 'Glitch']];
const TRANS_NAME = Object.fromEntries(TRANS_LIST);
const FILTERS = {
  'Original': { brightness: 100, contrast: 100, saturate: 100, sepia: 0, hue: 0, grayscale: 0 },
  'Cálido': { brightness: 105, contrast: 105, saturate: 120, sepia: 20, hue: -8, grayscale: 0 },
  'Frío': { brightness: 100, contrast: 106, saturate: 90, sepia: 0, hue: 14, grayscale: 0 },
  'Cine': { brightness: 98, contrast: 115, saturate: 88, sepia: 12, hue: -6, grayscale: 0 },
  'Vívido': { brightness: 102, contrast: 115, saturate: 165, sepia: 0, hue: 0, grayscale: 0 },
  'Mate': { brightness: 108, contrast: 84, saturate: 82, sepia: 6, hue: 0, grayscale: 0 },
  'Vintage': { brightness: 106, contrast: 90, saturate: 78, sepia: 45, hue: 0, grayscale: 0 },
  'Dorado': { brightness: 106, contrast: 108, saturate: 130, sepia: 30, hue: -12, grayscale: 0 },
  'Noche': { brightness: 80, contrast: 122, saturate: 70, sepia: 0, hue: 190, grayscale: 0 },
  'Pastel': { brightness: 112, contrast: 85, saturate: 80, sepia: 8, hue: 0, grayscale: 0 },
  'B/N': { brightness: 100, contrast: 118, saturate: 100, sepia: 0, hue: 0, grayscale: 100 },
  'Noir': { brightness: 92, contrast: 150, saturate: 100, sepia: 0, hue: 0, grayscale: 100 },
};
const BG_PRESETS = [
  { name: 'Atardecer', c1: '#ff7a59', c2: '#6c2a86', angle: 35 }, { name: 'Océano', c1: '#0f4c81', c2: '#38c7c4', angle: 120 },
  { name: 'Bosque', c1: '#0f2e22', c2: '#7fb069', angle: 70 }, { name: 'Neón', c1: '#1b1464', c2: '#ff3cac', angle: 200 },
  { name: 'Arena', c1: '#f3d9b1', c2: '#c47b4a', angle: 15 }, { name: 'Tormenta', c1: '#1d2433', c2: '#6b7a99', angle: 160 },
  { name: 'Aurora', c1: '#0b3d2e', c2: '#7b5cff', angle: 250 }, { name: 'Durazno', c1: '#ffd3a5', c2: '#fd6585', angle: 90 },
];
const SOLIDS = [['Negro', '#000000'], ['Blanco', '#ffffff'], ['Carbón', '#1c1f26'], ['Ámbar', '#e8a33d'], ['Rojo', '#c9342f'], ['Azul', '#2457d6'], ['Verde croma', '#00ff00'], ['Crema', '#f4ecdc']];
const SFX_LIST = [['pop', 'Pop'], ['whoosh', 'Whoosh'], ['ding', 'Ding'], ['click', 'Clic'], ['boom', 'Boom'], ['coin', 'Moneda'], ['error', 'Error'], ['riser', 'Subida'], ['applause', 'Aplausos'], ['shutter', 'Cámara'], ['typing', 'Teclado'], ['notify', 'Notificación'], ['drum', 'Redoble'], ['swish', 'Swish'], ['laser', 'Láser'], ['bell', 'Campana']];
const MUSIC_LIST = [['lofi', 'Lo-fi tranquilo', '75 bpm · relajado'], ['pulse', 'Pulso electrónico', '120 bpm · enérgico'], ['calm', 'Calma', 'ambiente suave'], ['happy', 'Alegre', '104 bpm · positivo'], ['epic', 'Épico', '90 bpm · tráiler']];

/* =========================================================
   Estado
   ========================================================= */
function defaultTracks() {
  return [
    { id: 'tx1', kind: 'text', name: 'Texto 1', hidden: false, muted: false, locked: false, role: '' },
    { id: 'fx1', kind: 'fx', name: 'Efectos', hidden: false, muted: false, locked: false, role: '' },
    { id: 'ov1', kind: 'visual', name: 'Capa 1', hidden: false, muted: false, locked: false, role: '' },
    { id: 'main', kind: 'visual', name: 'Principal', hidden: false, muted: false, locked: false, role: 'main' },
    { id: 'au1', kind: 'audio', name: 'Audio 1', hidden: false, muted: false, locked: false, role: '' },
  ];
}
const state = { id: null, name: 'Proyecto sin título', aspect: '16:9', bg: '#000000', quality: 720, W: 1280, H: 720, tracks: defaultTracks(), clips: [], media: [], selected: null, time: 0, playing: false, pps: 64, snap: true };
const cv = $('#cv'), ctx = cv.getContext('2d');
let dirty = true, lastTs = 0;
const boxes = new Map(); let drawn = [];
const elMap = new Map(), gainMap = new Map(), keyCanvases = new Map(), segCache = new Map(), audioBufCache = new Map();
let actx = null, master = null, speaker = null, recDest = null;
const undoStack = [], redoStack = [];
let clipboard = null;

const mediaById = id => state.media.find(m => m.id === id);
const clipById = id => state.clips.find(c => c.id === id);
const trackById = id => state.tracks.find(t => t.id === id);
function catOf(c) {
  if (c.kind === 'text') return 'text';
  if (c.kind === 'fx') return 'fx';
  if (c.kind === 'media') { const m = mediaById(c.mediaId); if (c.audioOnly || m?.type === 'audio') return 'audio'; }
  return 'visual';
}
const styleCat = c => c.kind === 'color' ? 'color' : c.kind === 'shape' ? 'shape' : catOf(c);
const accepts = (trackId, cat) => trackById(trackId)?.kind === cat;
const totalDur = () => state.clips.reduce((m, c) => Math.max(m, c.start + c.dur), 0);
const base = () => Math.min(state.W, state.H);
const mainTrack = () => state.tracks.find(t => t.role === 'main') || state.tracks.find(t => t.kind === 'visual');
const hasAudio = c => c.kind === 'media' && (() => { const m = mediaById(c.mediaId); return m && m.type !== 'image'; })();

function addTrack(kind, opts = {}) {
  const names = { visual: 'Capa', text: 'Texto', fx: 'Efectos', audio: 'Audio' };
  const n = state.tracks.filter(t => t.kind === kind).length + 1;
  const tr = { id: uid('t'), kind, name: opts.name || `${names[kind]} ${n}`, hidden: false, muted: false, locked: false, role: opts.role || '' };
  let idx;
  const firstVis = state.tracks.findIndex(t => t.kind === 'visual');
  if (kind === 'audio') idx = state.tracks.length;
  else if (kind === 'text') idx = 0;
  else if (kind === 'fx') { const firstFx = state.tracks.findIndex(t => t.kind === 'fx'); idx = firstFx >= 0 ? firstFx : (firstVis >= 0 ? firstVis : state.tracks.length); }
  else idx = firstVis >= 0 ? firstVis : state.tracks.length;
  state.tracks.splice(idx, 0, tr);
  return tr;
}
function ensureTrack(kind, role = '') {
  let tr = role ? state.tracks.find(t => t.role === role) : state.tracks.find(t => t.kind === kind && !t.locked && t.role !== 'subs');
  if (!tr) tr = addTrack(kind, role === 'subs' ? { role, name: 'Subtítulos' } : {});
  return tr;
}

/* =========================================================
   Deshacer / rehacer
   ========================================================= */
const snapshot = () => JSON.stringify({ tracks: state.tracks, clips: state.clips });
function pushUndo(s) { undoStack.push(s ?? snapshot()); if (undoStack.length > 150) undoStack.shift(); redoStack.length = 0; updateButtons(); markDirty(); }
function restore(s) {
  const o = JSON.parse(s); state.tracks = o.tracks; state.clips = o.clips;
  if (!clipById(state.selected)) state.selected = null;
  prune(); renderTimeline(); renderInspector(); dirty = true; updateButtons(); markDirty();
}
function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); }
function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); }

/* =========================================================
   Elementos multimedia y audio
   ========================================================= */
function elFor(c) {
  let el = elMap.get(c.id); if (el) return el;
  const m = mediaById(c.mediaId);
  el = document.createElement(c.audioOnly || m.type === 'audio' ? 'audio' : 'video');
  el.src = m.url; el.preload = 'auto'; el.playsInline = true; el.crossOrigin = 'anonymous';
  el.addEventListener('seeked', () => dirty = true);
  el.addEventListener('loadeddata', () => dirty = true);
  elMap.set(c.id, el);
  if (actx) connectEl(c.id, el);
  return el;
}
function connectEl(id, el) {
  try { const src = actx.createMediaElementSource(el); const g = actx.createGain(); src.connect(g); g.connect(master); gainMap.set(id, g); } catch (e) { /* ya conectado */ }
}
function ensureAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain(); speaker = actx.createGain();
    master.connect(speaker); speaker.connect(actx.destination);
    recDest = actx.createMediaStreamDestination(); master.connect(recDest);
    for (const [id, el] of elMap) connectEl(id, el);
  } catch (e) { actx = null; }
}
function disposeEl(id) {
  const el = elMap.get(id); if (!el) return;
  el.pause(); const g = gainMap.get(id); if (g) { try { g.disconnect(); } catch (e) {} gainMap.delete(id); }
  el.removeAttribute('src'); el.load(); elMap.delete(id);
}
function prune() {
  for (const id of [...elMap.keys()]) if (!clipById(id)) disposeEl(id);
  for (const id of [...keyCanvases.keys()]) if (!clipById(id)) keyCanvases.delete(id);
  for (const id of [...segCache.keys()]) if (!clipById(id)) segCache.delete(id);
}
function env(c, lt) {
  const p = c.props; let a = 1;
  if (p.fadeIn > 0) a = Math.min(a, lt / p.fadeIn);
  if (p.fadeOut > 0) a = Math.min(a, (c.dur - lt) / p.fadeOut);
  return clamp(a, 0, 1);
}
function syncMedia() {
  const t = state.time;
  for (const c of state.clips) {
    if (c.kind !== 'media') continue;
    const m = mediaById(c.mediaId); if (!m || m.type === 'image') continue;
    const el = elFor(c);
    const cat = catOf(c);
    let active, lt, frozen = false;
    if (cat === 'visual') {
      const [a, b] = visWindow(c);
      active = t >= a && t < b;
      lt = clamp(t - c.start, 0, Math.max(0, c.dur - 1e-3));
      frozen = t < c.start || t >= c.start + c.dur;
    } else { active = t >= c.start && t < c.start + c.dur; lt = t - c.start; }
    if (!active) { if (!el.paused) el.pause(); continue; }
    const sp = c.props.speed || 1, want = c.in + lt * sp;
    if (el.playbackRate !== sp) { try { el.playbackRate = sp; } catch (e) {} }
    if (state.playing && !frozen) {
      if (Math.abs(el.currentTime - want) > 0.3) el.currentTime = want;
      if (el.paused) el.play().catch(() => {});
    } else {
      if (!el.paused) el.pause();
      if (Math.abs(el.currentTime - want) > 0.02) el.currentTime = want;
    }
    const tr = trackById(c.track);
    const P = evalProps(c, lt);
    const vol = tr?.muted ? 0 : (P.volume ?? 1) * env(c, lt);
    const g = gainMap.get(c.id);
    if (g) { g.gain.value = vol; el.volume = 1; } else el.volume = clamp(vol, 0, 1);
  }
}

/* =========================================================
   Transiciones y visibilidad
   ========================================================= */
const ADJ = 0.06;
const prevOf = c => state.clips.find(k => k !== c && k.track === c.track && Math.abs(k.start + k.dur - c.start) < ADJ);
const nextOf = c => state.clips.find(k => k !== c && k.track === c.track && Math.abs(c.start + c.dur - k.start) < ADJ);
function transDur(c) {
  if (!c.trans || c.trans.type === 'none') return 0;
  const p = prevOf(c); if (!p) return 0;
  return Math.min(c.trans.dur, c.dur * .5, p.dur * .5);
}
function visWindow(c) {
  if (catOf(c) !== 'visual') return [c.start, c.start + c.dur];
  const pre = transDur(c) / 2, n = nextOf(c), post = n ? transDur(n) / 2 : 0;
  return [c.start - pre, c.start + c.dur + post];
}
function transMods(type, k, role) {
  const W = state.W, H = state.H, e = easeInOut(clamp(k, 0, 1));
  const m = { a: 1, dx: 0, dy: 0, s: 1, r: 0, blur: 0, clip: null, overlay: null };
  const isIn = role === 'in';
  switch (type) {
    case 'fade': if (isIn) m.a = e; break;
    case 'black': case 'white': {
      const col = type === 'black' ? '#000' : '#fff';
      if (isIn) { if (e < .5) { m.a = 0; m.overlay = { c: col, a: e * 2 }; } else m.overlay = { c: col, a: 2 - e * 2 }; }
      else if (e >= .5) m.a = 0;
      break;
    }
    case 'flash': if (isIn) { m.a = e; m.overlay = { c: '#fff', a: Math.max(0, 1 - Math.abs(e - .5) * 2.4) }; } break;
    case 'slideL': if (isIn) m.dx = (1 - e) * W; break;
    case 'slideR': if (isIn) m.dx = -(1 - e) * W; break;
    case 'slideU': if (isIn) m.dy = (1 - e) * H; break;
    case 'push': if (isIn) m.dx = (1 - e) * W; else m.dx = -e * W; break;
    case 'zoom': if (isIn) { m.s = 1.5 - .5 * e; m.a = e; } else m.s = 1 + .35 * e; break;
    case 'zoomOut': if (isIn) { m.s = .5 + .5 * e; m.a = e; } else { m.s = 1 - .3 * e; } break;
    case 'wipe': if (isIn) m.clip = g => g.rect(0, 0, W * e, H); break;
    case 'wipeV': if (isIn) m.clip = g => g.rect(0, 0, W, H * e); break;
    case 'circle': if (isIn) m.clip = g => { g.arc(W / 2, H / 2, Math.max(1, e * Math.hypot(W, H) / 2), 0, Math.PI * 2); }; break;
    case 'blur': if (isIn) { m.blur = (1 - e) * 22; m.a = e; } else m.blur = e * 22; break;
    case 'spin': if (isIn) { m.r = (1 - e) * -Math.PI / 2; m.s = .3 + .7 * e; m.a = e; } break;
    case 'glitchT': { const f = Math.floor(k * 20); if (isIn) { m.a = hash(f) < e ? 1 : 0; m.dx = (hash(f + 3) - .5) * W * .08 * (1 - e); } else m.dx = (hash(f + 9) - .5) * W * .08 * e; break; }
    default: if (isIn) m.a = e;
  }
  return m;
}
function frameMods(c, t) {
  if (catOf(c) !== 'visual') return null;
  let fm = null;
  const d = transDur(c);
  if (d > 0 && t >= c.start - d / 2 && t < c.start + d / 2) fm = transMods(c.trans.type, (t - (c.start - d / 2)) / d, 'in');
  const n = nextOf(c);
  if (n) {
    const dn = transDur(n);
    if (dn > 0 && t >= n.start - dn / 2 && t < n.start + dn / 2) {
      const o = transMods(n.trans.type, (t - (n.start - dn / 2)) / dn, 'out');
      if (!fm) fm = o; else { fm.a *= o.a; fm.dx += o.dx; fm.dy += o.dy; fm.s *= o.s; fm.blur += o.blur; }
    }
  }
  return fm;
}

/* =========================================================
   Fotogramas clave y animaciones
   ========================================================= */
const KF_KEYS = ['x', 'y', 'scale', 'rotation', 'opacity', 'size', 'volume'];
function kfKeysFor(c) {
  const cat = catOf(c);
  if (cat === 'audio') return ['volume'];
  if (c.kind === 'text') return ['x', 'y', 'size', 'rotation', 'opacity'];
  if (c.kind === 'color') return ['opacity'];
  const ks = ['x', 'y', 'scale', 'rotation', 'opacity'];
  if (hasAudio(c)) ks.push('volume');
  return ks;
}
function evalProps(c, lt) {
  const p = c.props; if (!c.kf || !c.kf.length) return p;
  const out = Object.assign({}, p);
  for (const k of KF_KEYS) {
    const pts = c.kf.filter(f => f[k] !== undefined); if (!pts.length) continue;
    if (lt <= pts[0].t) out[k] = pts[0][k];
    else if (lt >= pts[pts.length - 1].t) out[k] = pts[pts.length - 1][k];
    else for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (lt >= a.t && lt <= b.t) { const u = (lt - a.t) / ((b.t - a.t) || 1), e = u * u * (3 - 2 * u); out[k] = a[k] + (b[k] - a[k]) * e; break; }
    }
  }
  return out;
}
const localT = c => clamp(state.time - c.start, 0, c.dur);
const kfAt = (c, lt) => (c.kf || []).find(f => Math.abs(f.t - lt) < .5 / PREVIEW_FPS);
function setProp(c, k, v) {
  if (k === 'speed') {
    const m = mediaById(c.mediaId), old = c.props.speed || 1;
    let nd = c.dur * old / v; if (m && m.type !== 'image') nd = Math.min(nd, (m.duration - c.in) / v);
    c.dur = Math.max(.1, nd);
    if (c.kf) c.kf.forEach(f => f.t *= old / v);
  }
  if (c.kf && c.kf.length && KF_KEYS.includes(k)) {
    const lt = localT(c);
    let f = kfAt(c, lt);
    if (!f) {
      const cur = evalProps(c, lt); f = { t: lt };
      for (const kk of kfKeysFor(c)) f[kk] = cur[kk];
      c.kf.push(f); c.kf.sort((a, b) => a.t - b.t);
    }
    f[k] = v; return;
  }
  c.props[k] = v;
}
function addKeyframe(c) {
  const lt = localT(c), cur = evalProps(c, lt);
  c.kf = c.kf || [];
  let f = kfAt(c, lt);
  if (!f) { f = { t: lt }; c.kf.push(f); c.kf.sort((a, b) => a.t - b.t); }
  for (const k of kfKeysFor(c)) f[k] = cur[k];
}
function animMods(p, lt, dur) {
  const W = state.W, H = state.H;
  const m = { a: 1, dx: 0, dy: 0, s: 1, r: 0, blur: 0 };
  const apply = (type, k, isIn) => {
    const e = easeOut(k), inv = 1 - e, dir = isIn ? 1 : -1;
    switch (type) {
      case 'fade': m.a *= k; break;
      case 'zoomIn': m.s *= .5 + .5 * e; m.a *= k; break;
      case 'zoomOut': m.s *= 1.6 - .6 * e; m.a *= k; break;
      case 'slideL': m.dx += inv * W * .6 * dir; m.a *= k; break;
      case 'slideR': m.dx -= inv * W * .6 * dir; m.a *= k; break;
      case 'slideU': m.dy += inv * H * .45 * dir; m.a *= k; break;
      case 'slideD': m.dy -= inv * H * .45 * dir; m.a *= k; break;
      case 'spin': m.r += inv * (isIn ? -1 : 1) * Math.PI; m.s *= .3 + .7 * e; m.a *= k; break;
      case 'pop': m.s *= isIn ? Math.max(.01, .3 + .7 * easeBack(k)) : .3 + .7 * e; m.a *= Math.min(1, k * 3); break;
      case 'blur': m.blur += inv * 24; m.a *= k; break;
      case 'drop': if (isIn) m.dy -= (1 - easeBounce(k)) * H * .5; else m.dy += inv * H * .5; m.a *= Math.min(1, k * 4); break;
      case 'swing': m.r += inv * (isIn ? .7 : -.7); m.a *= k; break;
    }
  };
  if (p.animIn && p.animIn !== 'none' && !PER_LETTER.has(p.animIn) && lt < p.animInDur) apply(p.animIn, clamp(lt / p.animInDur, 0, 1), true);
  if (p.animOut && p.animOut !== 'none' && !PER_LETTER.has(p.animOut) && lt > dur - p.animOutDur) apply(p.animOut, clamp((dur - lt) / p.animOutDur, 0, 1), false);
  const u = dur > 0 ? lt / dur : 0;
  switch (p.loop) {
    case 'kenIn': m.s *= 1 + .18 * u; break;
    case 'kenOut': m.s *= 1.18 - .18 * u; break;
    case 'panL': m.s *= 1.15; m.dx += (.5 - u) * W * .12; break;
    case 'panR': m.s *= 1.15; m.dx -= (.5 - u) * W * .12; break;
    case 'pulse': m.s *= 1 + .04 * Math.sin(lt * Math.PI * 2); break;
    case 'sway': m.r += .06 * Math.sin(lt * 2.2); break;
    case 'float': m.dy += Math.sin(lt * 2.4) * H * .012; break;
    case 'shake': { const f = Math.floor(lt * 24); m.dx += (hash(f) - .5) * W * .012; m.dy += (hash(f + 7) - .5) * H * .012; break; }
  }
  return m;
}

/* =========================================================
   Dibujo
   ========================================================= */
function filterStr(P, extraBlur = 0) {
  const b = base(), blur = (P.blur || 0) * b / 720 + extraBlur * b / 720;
  const plain = P.brightness == 100 && P.contrast == 100 && P.saturate == 100 && !P.sepia && !P.hue && !P.grayscale;
  if (plain && !blur) return 'none';
  return `brightness(${P.brightness}%) contrast(${P.contrast}%) saturate(${P.saturate}%) sepia(${P.sepia}%) hue-rotate(${P.hue}deg) grayscale(${P.grayscale || 0}%)${blur ? ` blur(${blur}px)` : ''}`;
}
function maskPath(g, mask, w, h) {
  const r = Math.min(w, h) / 2;
  switch (mask) {
    case 'circle': g.arc(0, 0, r, 0, Math.PI * 2); break;
    case 'ellipse': g.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); break;
    case 'rounded': if (g.roundRect) g.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) * .12); else g.rect(-w / 2, -h / 2, w, h); break;
    case 'heart': heartPath(g, r * 2, r * 2); break;
    case 'star': starPath(g, r, r * .45, 5); break;
    case 'diamond': g.moveTo(0, -h / 2); g.lineTo(w / 2, 0); g.lineTo(0, h / 2); g.lineTo(-w / 2, 0); g.closePath(); break;
    case 'split': g.rect(-w / 2, -h / 2, w / 2, h); break;
    default: g.rect(-w / 2, -h / 2, w, h);
  }
}
function heartPath(g, w, h) {
  const x = 0, y = -h * .25;
  g.moveTo(x, y + h * .2);
  g.bezierCurveTo(x, y - h * .1, x - w * .5, y - h * .1, x - w * .5, y + h * .25);
  g.bezierCurveTo(x - w * .5, y + h * .55, x - w * .15, y + h * .65, x, y + h * .75);
  g.bezierCurveTo(x + w * .15, y + h * .65, x + w * .5, y + h * .55, x + w * .5, y + h * .25);
  g.bezierCurveTo(x + w * .5, y - h * .1, x, y - h * .1, x, y + h * .2);
  g.closePath();
}
function starPath(g, ro, ri, n) {
  for (let i = 0; i < n * 2; i++) { const r = i % 2 ? ri : ro, a = -Math.PI / 2 + i * Math.PI / n; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath();
}
function shapePath(g, shape, w, h, rad) {
  switch (shape) {
    case 'circle': g.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); break;
    case 'triangle': g.moveTo(0, -h / 2); g.lineTo(w / 2, h / 2); g.lineTo(-w / 2, h / 2); g.closePath(); break;
    case 'star': starPath(g, Math.min(w, h) / 2, Math.min(w, h) * .22, 5); break;
    case 'heart': heartPath(g, w, h); break;
    case 'arrow': { const t = h * .38; g.moveTo(-w / 2, -t / 2); g.lineTo(w * .15, -t / 2); g.lineTo(w * .15, -h / 2); g.lineTo(w / 2, 0); g.lineTo(w * .15, h / 2); g.lineTo(w * .15, t / 2); g.lineTo(-w / 2, t / 2); g.closePath(); break; }
    case 'bubble': { const bh = h * .8; if (g.roundRect) g.roundRect(-w / 2, -h / 2, w, bh, Math.min(w, bh) * .25); else g.rect(-w / 2, -h / 2, w, bh); g.moveTo(-w * .2, -h / 2 + bh - 1); g.lineTo(-w * .3, h / 2); g.lineTo(-w * .02, -h / 2 + bh - 1); g.closePath(); break; }
    default: if (g.roundRect && rad > 0) g.roundRect(-w / 2, -h / 2, w, h, Math.min(rad, w / 2, h / 2)); else g.rect(-w / 2, -h / 2, w, h);
  }
}
function keyed(c, src, srcW, srcH, P) {
  let kc = keyCanvases.get(c.id);
  if (!kc) { kc = document.createElement('canvas'); keyCanvases.set(c.id, kc); }
  const kw = Math.max(1, Math.min(srcW, 960)), kh = Math.max(1, Math.round(srcH * kw / srcW));
  if (kc.width !== kw || kc.height !== kh) { kc.width = kw; kc.height = kh; }
  const kx = kc.getContext('2d', { willReadFrequently: true });
  kx.clearRect(0, 0, kw, kh); kx.drawImage(src, 0, 0, kw, kh);
  const img = kx.getImageData(0, 0, kw, kh), d = img.data;
  const [kr, kg, kb] = hexRgb(P.chromaColor);
  const tol = P.chromaTol, soft = Math.max(.001, P.chromaSoft), spill = kg > kr && kg > kb;
  for (let i = 0; i < d.length; i += 4) {
    const dr = d[i] - kr, dg = d[i + 1] - kg, db = d[i + 2] - kb;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db) / 441.7;
    if (dist < tol) d[i + 3] = 0;
    else if (dist < tol + soft) d[i + 3] = d[i + 3] * (dist - tol) / soft;
    if (spill && dist < tol + soft + .25) { const mx = Math.max(d[i], d[i + 2]); if (d[i + 1] > mx) d[i + 1] = mx; }
  }
  kx.putImageData(img, 0, 0);
  return kc;
}
let segmenter = null, segLoading = false;
function loadSegmenter() {
  if (segmenter || segLoading) return;
  segLoading = true;
  const st = $('#segStatus'); st.hidden = false; st.textContent = 'Cargando el modelo para quitar fondo…';
  import(new URL('ai.js', SCRIPT_BASE).href).then(ai => ai.getSegmenter(s => { if (s) st.textContent = s; }))
    .then(s => { segmenter = s; st.hidden = true; dirty = true; })
    .catch(() => { st.textContent = 'No se pudo cargar el modelo. Revisá tu conexión.'; setTimeout(() => st.hidden = true, 4000); })
    .finally(() => { segLoading = false; });
}
function bgRemoved(c, src, srcW, srcH) {
  if (!segmenter) { loadSegmenter(); return null; }
  let o = segCache.get(c.id);
  if (!o) { o = { inC: document.createElement('canvas'), outC: document.createElement('canvas') }; segCache.set(c.id, o); }
  const k = Math.min(1, 512 / Math.max(srcW, srcH)), w = Math.max(1, Math.round(srcW * k)), h = Math.max(1, Math.round(srcH * k));
  if (o.inC.width !== w || o.inC.height !== h) { o.inC.width = o.outC.width = w; o.inC.height = o.outC.height = h; }
  const ix = o.inC.getContext('2d', { willReadFrequently: true });
  ix.drawImage(src, 0, 0, w, h);
  let r = null; try { r = segmenter.run(o.inC); } catch (e) { r = null; }
  if (!r) return o.ready ? o.outC : null;
  const img = ix.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    const my = Math.min(r.h - 1, Math.floor(y * r.h / h));
    for (let x = 0; x < w; x++) {
      const mx = Math.min(r.w - 1, Math.floor(x * r.w / w));
      const v = r.data[my * r.w + mx];
      const a = clamp((v - .3) / .4, 0, 1);
      d[(y * w + x) * 4 + 3] = a * a * (3 - 2 * a) * 255;
    }
  }
  o.outC.getContext('2d').putImageData(img, 0, 0);
  o.ready = true;
  return o.outC;
}
function drawMedia(c, P, lt, alpha, fm) {
  const m = mediaById(c.mediaId); if (!m) return;
  const W = state.W, H = state.H;
  let src, sw, sh;
  if (m.type === 'image') { src = m.el; sw = m.w; sh = m.h; }
  else { src = elFor(c); if (src.readyState < 2) return; sw = src.videoWidth; sh = src.videoHeight; }
  if (!src || !sw || !sh) return;
  let srcW = sw, srcH = sh;
  if (P.removeBg) { const o = bgRemoved(c, src, sw, sh); if (o) { src = o; srcW = o.width; srcH = o.height; } }
  else if (P.chroma) { const k = keyed(c, src, sw, sh, P); src = k; srcW = k.width; srcH = k.height; }
  const A = animMods(P, lt, c.dur);
  const cl = clamp(P.cropL, 0, .9), ct = clamp(P.cropT, 0, .9), cr = clamp(P.cropR, 0, .9 - cl), cb = clamp(P.cropB, 0, .9 - ct);
  const cw = sw * (1 - cl - cr), ch = sh * (1 - ct - cb);
  const fit = P.fit === 'cover' ? Math.max(W / cw, H / ch) : Math.min(W / cw, H / ch);
  const s = fit * P.scale * A.s, dw = cw * s, dh = ch * s;
  const cx = P.x * W + A.dx, cy = P.y * H + A.dy;
  const a = clamp(P.opacity * env(c, lt) * alpha * A.a, 0, 1);
  boxes.set(c.id, { cx: P.x * W, cy: P.y * H, w: cw * fit * P.scale, h: ch * fit * P.scale, rot: P.rotation });
  if (a <= 0.001) return;
  ctx.globalAlpha = a;
  if (P.fit === 'blurfill') {
    ctx.save(); ctx.filter = `blur(${base() * .045}px) brightness(.72) saturate(1.1)`;
    const bs = Math.max(W / sw, H / sh) * 1.12;
    ctx.drawImage(src, 0, 0, srcW, srcH, W / 2 - sw * bs / 2, H / 2 - sh * bs / 2, sw * bs, sh * bs);
    ctx.restore();
  }
  ctx.globalCompositeOperation = P.blend || 'source-over';
  ctx.filter = filterStr(P, A.blur + (fm ? fm.blur : 0));
  ctx.translate(cx, cy); ctx.rotate(P.rotation * Math.PI / 180 + A.r);
  ctx.scale(P.flipX ? -1 : 1, P.flipY ? -1 : 1);
  if (P.mask && P.mask !== 'none') { ctx.beginPath(); maskPath(ctx, P.mask, dw, dh); ctx.clip(); }
  ctx.drawImage(src, cl * srcW, ct * srcH, Math.max(1, srcW * (1 - cl - cr)), Math.max(1, srcH * (1 - ct - cb)), -dw / 2, -dh / 2, dw, dh);
}
function drawColor(c, P, lt, alpha) {
  const W = state.W, H = state.H, A = animMods(P, lt, c.dur);
  ctx.globalAlpha = clamp(P.opacity * env(c, lt) * alpha * A.a, 0, 1);
  if (P.mode === 'solid') ctx.fillStyle = P.c1;
  else if (P.mode === 'radial') {
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 2 * (P.drift ? 1 + .15 * Math.sin(lt) : 1));
    g.addColorStop(0, P.c1); g.addColorStop(1, P.c2); ctx.fillStyle = g;
  } else {
    const ang = (P.angle + (P.drift ? lt * 14 : 0)) * Math.PI / 180, r = Math.hypot(W, H) / 2;
    const dx = Math.cos(ang) * r, dy = Math.sin(ang) * r;
    const g = ctx.createLinearGradient(W / 2 - dx, H / 2 - dy, W / 2 + dx, H / 2 + dy);
    g.addColorStop(0, P.c1); g.addColorStop(1, P.c2); ctx.fillStyle = g;
  }
  ctx.fillRect(0, 0, W, H);
  boxes.set(c.id, { cx: W / 2, cy: H / 2, w: W, h: H, rot: 0 });
}
function drawShape(c, P, lt, alpha, fm) {
  const W = state.W, H = state.H, b = base(), A = animMods(P, lt, c.dur);
  const w = P.w * b * P.scale, h = (P.shape === 'line' ? Math.max(.004, P.h * .08) : P.h) * b * P.scale;
  boxes.set(c.id, { cx: P.x * W, cy: P.y * H, w, h, rot: P.rotation });
  const a = clamp(P.opacity * env(c, lt) * alpha * A.a, 0, 1); if (a <= .001) return;
  ctx.globalAlpha = a; ctx.globalCompositeOperation = P.blend || 'source-over';
  const bl = A.blur + (fm ? fm.blur : 0); if (bl) ctx.filter = `blur(${bl * b / 720}px)`;
  ctx.translate(P.x * W + A.dx, P.y * H + A.dy); ctx.rotate(P.rotation * Math.PI / 180 + A.r); ctx.scale(A.s, A.s);
  ctx.beginPath(); shapePath(ctx, P.shape, w, h, P.radius * Math.min(w, h));
  if (P.fillOn !== false) { ctx.fillStyle = P.fill; ctx.fill(); }
  if (P.strokeW > 0) { ctx.lineJoin = 'round'; ctx.lineWidth = P.strokeW * b / 720; ctx.strokeStyle = P.stroke; ctx.stroke(); }
}
function drawText(c, P, lt, alpha, fm) {
  const W = state.W, H = state.H, b = base();
  const A = animMods(P, lt, c.dur);
  const txt = P.upper ? (P.text || '').toUpperCase() : (P.text || '');
  const fs = Math.max(1, P.size * b);
  ctx.font = `${P.italic ? 'italic ' : ''}${P.weight} ${fs}px ${fontStack(P.font)}`;
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const ls = (P.letterSpacing || 0) * fs;
  const lines = txt.split('\n'), lh = fs * (P.lineHeight || 1.18);
  const chars = lines.map(l => [...l]);
  const cw = chars.map(cs => cs.map(ch => ctx.measureText(ch).width));
  const perChar = ls !== 0 || PER_LETTER.has(P.animIn) || PER_LETTER.has(P.animOut) || P.loop === 'waveLoop';
  const lineW = lines.map((l, i) => perChar ? cw[i].reduce((s, w) => s + w, 0) + ls * Math.max(0, cw[i].length - 1) : ctx.measureText(l).width);
  const bw = Math.max(1, ...lineW), bh = lh * lines.length;
  const padX = fs * .34, padY = fs * .2;
  boxes.set(c.id, { cx: P.x * W, cy: P.y * H, w: bw + padX * 2, h: bh + padY * 2, rot: P.rotation });
  const a = clamp(P.opacity * env(c, lt) * alpha * A.a, 0, 1); if (a <= .001) return;
  ctx.globalAlpha = a; ctx.globalCompositeOperation = P.blend || 'source-over';
  const bl = A.blur + (fm ? fm.blur : 0); if (bl) ctx.filter = `blur(${bl * b / 720}px)`;
  ctx.translate(P.x * W + A.dx, P.y * H + A.dy); ctx.rotate(P.rotation * Math.PI / 180 + A.r); ctx.scale(A.s, A.s);
  if (P.box) {
    ctx.fillStyle = hexA(P.boxColor, P.boxAlpha); ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-bw / 2 - padX, -bh / 2 - padY, bw + padX * 2, bh + padY * 2, fs * .18); else ctx.rect(-bw / 2 - padX, -bh / 2 - padY, bw + padX * 2, bh + padY * 2);
    ctx.fill();
  }
  const N = chars.reduce((s, cs) => s + cs.length, 0);
  let visibleN = N;
  if (P.animIn === 'typewriter') { const d = Math.min(c.dur * .7, Math.max(P.animInDur, N * .045)); visibleN = Math.floor(clamp(lt / d, 0, 1) * N); }
  if (P.animOut === 'typewriter') { const d = Math.min(c.dur * .3, Math.max(P.animOutDur, N * .03)); visibleN = Math.min(visibleN, Math.ceil(clamp((c.dur - lt) / d, 0, 1) * N)); }
  const paint = (s, x, y) => {
    if (P.glow) { ctx.shadowColor = P.glowColor; ctx.shadowBlur = fs * .45; ctx.fillStyle = P.color; ctx.fillText(s, x, y); ctx.shadowBlur = fs * .2; }
    else if (P.shadow) { ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = fs * .25; ctx.shadowOffsetY = fs * .04; }
    if (P.stroke > 0) { ctx.lineJoin = 'round'; ctx.lineWidth = P.stroke * b / 720; ctx.strokeStyle = P.strokeColor; ctx.strokeText(s, x, y); if (!P.glow) ctx.shadowColor = 'transparent'; }
    ctx.fillStyle = P.color; ctx.fillText(s, x, y);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  };
  let gi = 0;
  lines.forEach((l, li) => {
    const y = -bh / 2 + lh * (li + .5);
    const x0 = P.align === 'left' ? -bw / 2 : P.align === 'right' ? bw / 2 - lineW[li] : -lineW[li] / 2;
    if (!perChar) { if (visibleN >= N) paint(l, x0, y); gi += chars[li].length; return; }
    let x = x0;
    chars[li].forEach((ch, ci) => {
      const i = gi++;
      if (i < visibleN) {
        let dy = 0, ca = 1;
        if (P.animIn === 'wave') { const k = clamp((lt - i * .04) / .35, 0, 1); dy = (1 - easeOut(k)) * fs * .7; ca = k; }
        if (P.animIn === 'bounceL') { const k = clamp((lt - i * .05) / .5, 0, 1); dy = -(1 - easeBounce(k)) * fs * 1.3; ca = Math.min(1, k * 3); }
        if (P.loop === 'waveLoop') dy += Math.sin(lt * 5 - i * .55) * fs * .09;
        if (ca > 0) { const pa = ctx.globalAlpha; ctx.globalAlpha = pa * ca; paint(ch, x, y + dy); ctx.globalAlpha = pa; }
      }
      x += cw[li][ci] + ls;
    });
  });
}
const fxc = document.createElement('canvas'), fxx = fxc.getContext('2d', { willReadFrequently: true });
const pxc = document.createElement('canvas');
let noiseC = null;
function fxSnap() {
  if (fxc.width !== state.W || fxc.height !== state.H) { fxc.width = state.W; fxc.height = state.H; }
  fxx.globalCompositeOperation = 'copy'; fxx.drawImage(cv, 0, 0); fxx.globalCompositeOperation = 'source-over';
}
function grain(I, frame) {
  if (!noiseC) {
    noiseC = document.createElement('canvas'); noiseC.width = noiseC.height = 256;
    const nx = noiseC.getContext('2d'), img = nx.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    nx.putImageData(img, 0, 0);
  }
  ctx.save();
  ctx.globalAlpha = I * .55; ctx.globalCompositeOperation = 'overlay';
  ctx.translate(-hash(frame) * 256, -hash(frame + 1) * 256);
  ctx.fillStyle = ctx.createPattern(noiseC, 'repeat'); ctx.fillRect(0, 0, state.W + 256, state.H + 256);
  ctx.restore();
}
function rgbSplit(sh) {
  if (sh < 1) return;
  const W = state.W, H = state.H, img = ctx.getImageData(0, 0, W, H), d = img.data, s = new Uint8ClampedArray(d);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const i = (row + x) * 4;
      d[i] = s[(row + Math.min(W - 1, x + sh)) * 4];
      d[i + 2] = s[(row + Math.max(0, x - sh)) * 4 + 2];
    }
  }
  ctx.putImageData(img, 0, 0);
}
function particles(kind, lt, I) {
  const W = state.W, H = state.H, b = base(), n = Math.round(30 + 90 * I);
  const cols = ['#ff5a5a', '#ffd23f', '#3ec1ff', '#7cf29c', '#ff7ae0', '#ffffff'];
  for (let i = 0; i < n; i++) {
    const sp = .15 + hash(i * 3 + 1) * .35;
    const x = hash(i * 7) * W + Math.sin(lt * (1 + hash(i)) + i) * b * .02;
    const y = ((hash(i * 11) + lt * sp) % 1.1 - .05) * H;
    ctx.save(); ctx.translate(x, y);
    if (kind === 'confetti') { ctx.rotate(lt * 3 * (hash(i) - .5) * 4); ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(-b * .006, -b * .012, b * .012, b * .024); }
    else if (kind === 'snow') { ctx.globalAlpha = .6 + .4 * hash(i + 5); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, b * (.003 + hash(i + 2) * .006), 0, Math.PI * 2); ctx.fill(); }
    else { const r = b * (.01 + hash(i + 4) * .012); ctx.fillStyle = i % 3 ? '#ff4f8b' : '#ff9ec2'; ctx.globalAlpha = .85; ctx.beginPath(); heartPath(ctx, r * 2, r * 2); ctx.fill(); }
    ctx.restore();
  }
}
function drawFx(c, t) {
  const P = c.props, lt = t - c.start, W = state.W, H = state.H, b = base();
  const I = clamp(P.intensity, 0, 1) * env(c, lt); if (I <= .001) return;
  const frame = Math.floor(t * 24);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  switch (P.type) {
    case 'vignette': { const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * (.62 - .35 * I) * .6, W / 2, H / 2, Math.hypot(W, H) / 2); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${.35 + .6 * I})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); break; }
    case 'grain': grain(I, frame); break;
    case 'glitch': {
      fxSnap(); const n = 3 + Math.floor(I * 9);
      for (let i = 0; i < n; i++) { if (hash(frame * 13 + i) > .3 + .6 * I) continue; const y = hash(frame * 7 + i * 3) * H, h = (.01 + hash(i + frame) * .08) * H, dx = (hash(frame + i * 11) - .5) * W * .14 * I; ctx.drawImage(fxc, 0, y, W, h, dx, y, W, h); }
      if (hash(frame * 3) < I * .7) rgbSplit(Math.round(I * 14 * b / 720));
      break;
    }
    case 'rgb': rgbSplit(Math.max(1, Math.round(I * 18 * b / 720))); break;
    case 'shake': { fxSnap(); const s = I * .035; ctx.fillStyle = state.bg; ctx.fillRect(0, 0, W, H); ctx.translate(W / 2 + (hash(frame) - .5) * W * s, H / 2 + (hash(frame + 99) - .5) * H * s); ctx.rotate((hash(frame + 5) - .5) * .025 * I); ctx.scale(1 + s, 1 + s); ctx.drawImage(fxc, -W / 2, -H / 2); break; }
    case 'flash': { const ph = (lt % .5) / .5; ctx.fillStyle = `rgba(255,255,255,${I * Math.max(0, 1 - ph * 3)})`; ctx.fillRect(0, 0, W, H); break; }
    case 'blur': fxSnap(); ctx.filter = `blur(${I * 24 * b / 720}px)`; ctx.drawImage(fxc, 0, 0); break;
    case 'cinema': { const k = clamp(Math.min(lt / .5, (c.dur - lt) / .5), 0, 1); const bh = H * (.05 + .1 * I) * easeOut(k); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh); break; }
    case 'oldfilm': {
      fxSnap(); ctx.filter = `sepia(${.75 * I}) contrast(${1 + .15 * I}) brightness(${.9 + hash(frame) * .14})`; ctx.drawImage(fxc, 0, 0); ctx.filter = 'none';
      grain(I * .9, frame);
      ctx.strokeStyle = `rgba(30,20,10,${.5 * I})`; ctx.lineWidth = Math.max(1, b / 720);
      for (let i = 0; i < 3; i++) if (hash(frame + i * 17) < .5) { const x = hash(frame * 5 + i) * W; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (hash(i + frame) - .5) * 20, H); ctx.stroke(); }
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.hypot(W, H) / 2); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(20,10,0,${.6 * I})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'zoompulse': { fxSnap(); const s = 1 + I * .12 * Math.abs(Math.sin(lt * Math.PI * 2)); ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.drawImage(fxc, -W / 2, -H / 2); break; }
    case 'leak': { ctx.globalCompositeOperation = 'screen'; const x = W * (.2 + .6 * (.5 + .5 * Math.sin(lt * .9))); const g = ctx.createRadialGradient(x, H * .3, 0, x, H * .3, Math.max(W, H) * .7); g.addColorStop(0, `rgba(255,170,80,${.75 * I})`); g.addColorStop(.5, `rgba(255,80,60,${.25 * I})`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); break; }
    case 'glow': fxSnap(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = I * .7; ctx.filter = `blur(${18 * b / 720}px) brightness(1.2)`; ctx.drawImage(fxc, 0, 0); break;
    case 'bw': fxSnap(); ctx.globalAlpha = I; ctx.filter = 'grayscale(1) contrast(1.1)'; ctx.drawImage(fxc, 0, 0); break;
    case 'invert': fxSnap(); ctx.globalAlpha = I; ctx.filter = 'invert(1)'; ctx.drawImage(fxc, 0, 0); break;
    case 'pixel': { fxSnap(); const s = Math.max(2, (4 + I * 36) * b / 720); const w = Math.max(1, Math.round(W / s)), h = Math.max(1, Math.round(H / s)); pxc.width = w; pxc.height = h; pxc.getContext('2d').drawImage(fxc, 0, 0, w, h); ctx.imageSmoothingEnabled = false; ctx.drawImage(pxc, 0, 0, w, h, 0, 0, W, H); break; }
    case 'mirror': fxSnap(); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(fxc, 0, 0, W / 2, H, 0, 0, W / 2, H); break;
    case 'vhs': { const lh = Math.max(2, Math.round(H / 240)); ctx.fillStyle = `rgba(0,0,0,${.2 * I})`; for (let y = 0; y < H; y += lh * 2) ctx.fillRect(0, y, W, lh); ctx.fillStyle = `rgba(255,255,255,${.07 * I})`; ctx.fillRect(0, ((lt * .25) % 1) * H, W, H * .04); if (I > .3) rgbSplit(Math.round(I * 6 * b / 720)); break; }
    case 'confetti': case 'snow': case 'hearts': particles(P.type, lt, I); break;
  }
  ctx.restore();
}
function drawClip(c, t, lt, fm) {
  const W = state.W, H = state.H;
  const P = evalProps(c, lt);
  ctx.save();
  let alpha = 1;
  if (fm) {
    alpha = fm.a;
    if (fm.clip) { ctx.beginPath(); fm.clip(ctx); ctx.clip(); }
    if (fm.dx || fm.dy || fm.s !== 1 || fm.r) { ctx.translate(W / 2 + fm.dx, H / 2 + fm.dy); ctx.rotate(fm.r); ctx.scale(fm.s, fm.s); ctx.translate(-W / 2, -H / 2); }
  }
  if (alpha > 0) {
    if (c.kind === 'media') drawMedia(c, P, lt, alpha, fm);
    else if (c.kind === 'color') drawColor(c, P, lt, alpha);
    else if (c.kind === 'shape') drawShape(c, P, lt, alpha, fm);
    else if (c.kind === 'text') drawText(c, P, lt, alpha, fm);
  }
  ctx.restore();
  if (fm && fm.overlay && fm.overlay.a > 0) { ctx.save(); ctx.globalAlpha = clamp(fm.overlay.a, 0, 1); ctx.fillStyle = fm.overlay.c; ctx.fillRect(0, 0, W, H); ctx.restore(); }
}
function render() {
  const t = state.time, W = state.W, H = state.H;
  boxes.clear(); drawn = [];
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none'; ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = state.bg; ctx.fillRect(0, 0, W, H);
  for (let i = state.tracks.length - 1; i >= 0; i--) {
    const tr = state.tracks[i];
    if (tr.kind === 'audio' || tr.hidden) continue;
    const list = state.clips.filter(c => c.track === tr.id && (() => { const [a, b] = visWindow(c); return t >= a && t < b; })()).sort((a, b) => a.start - b.start);
    for (const c of list) {
      if (tr.kind === 'fx') { drawFx(c, t); continue; }
      const lt = clamp(t - c.start, 0, Math.max(0, c.dur - 1e-3));
      drawClip(c, t, lt, frameMods(c, t));
      drawn.push(c.id);
    }
  }
  updateSelBox();
}
function updateSelBox() {
  const sb = $('#selbox'), b = boxes.get(state.selected);
  const c = clipById(state.selected);
  if (!b || exporting || !c || c.kind === 'color' || catOf(c) === 'fx') { sb.hidden = true; return; }
  const k = cv.clientWidth / state.W;
  sb.hidden = false;
  Object.assign(sb.style, { left: (b.cx - b.w / 2) * k + 'px', top: (b.cy - b.h / 2) * k + 'px', width: b.w * k + 'px', height: b.h * k + 'px', transform: `rotate(${b.rot}deg)` });
}

/* =========================================================
   Reproducción
   ========================================================= */
function tick(ts) {
  if (state.playing) {
    state.time += Math.min(.25, (ts - lastTs) / 1000); lastTs = ts;
    const end = exporting ? exportEnd : totalDur();
    if (state.time >= end) { state.time = end; if (exporting) finishExport(); pause(); }
    if (exporting) { $('#expBar').style.width = (state.time / Math.max(end, .01) * 100) + '%'; $('#expTime').textContent = `${tcs(state.time)} / ${tcs(end)}`; }
  }
  if (state.playing || dirty) { dirty = false; syncMedia(); render(); updatePlayhead(); }
  requestAnimationFrame(tick);
}
function play() {
  if (!state.clips.length) return;
  if (state.time >= totalDur() - 0.01) state.time = 0;
  ensureAudio();
  state.playing = true; lastTs = performance.now();
  $('#playIco').innerHTML = '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>'; $('#playBtn').setAttribute('aria-label', 'Pausar');
}
function pause() {
  state.playing = false;
  for (const el of elMap.values()) el.pause();
  $('#playIco').innerHTML = '<path d="M7 5v14l12-7z"/>'; $('#playBtn').setAttribute('aria-label', 'Reproducir');
  dirty = true;
  const c = clipById(state.selected); if (c?.kf?.length) scheduleInspector();
}
function seek(t) {
  state.time = clamp(t, 0, Math.max(totalDur(), 0)); dirty = true;
  if (state.playing) lastTs = performance.now();
  const c = clipById(state.selected); if (c?.kf?.length) scheduleInspector();
}
let inspT = null;
function scheduleInspector() {
  clearTimeout(inspT);
  inspT = setTimeout(() => { if (!$('#inspector').contains(document.activeElement)) renderInspector(); }, 140);
}

/* =========================================================
   Lienzo
   ========================================================= */
function fitCanvas() {
  const st = $('#stage'), r = st.getBoundingClientRect();
  const padd = document.fullscreenElement === st ? 0 : 24;
  const aw = r.width - padd, ah = r.height - padd; if (aw <= 0 || ah <= 0) return;
  const s = Math.min(aw / state.W, ah / state.H);
  cv.style.width = Math.floor(state.W * s) + 'px'; cv.style.height = Math.floor(state.H * s) + 'px';
  updateSelBox();
}
new ResizeObserver(fitCanvas).observe($('#stage'));
function applyDims() {
  [state.W, state.H] = dims(state.aspect, state.quality);
  cv.width = state.W; cv.height = state.H;
  fitCanvas(); dirty = true;
}
function setAspect(a, silent) {
  state.aspect = a; applyDims();
  $('#aspectSel').value = a;
  if (!silent) { markDirty(); if (!state.selected) renderInspector(); }
}

/* =========================================================
   Importar medios
   ========================================================= */
function makeThumb(src, w, h) {
  const c = document.createElement('canvas'), s = 160 / Math.max(w, h);
  c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', .7);
}
async function waveform(blob) {
  const buf = await blob.arrayBuffer();
  const off = new OfflineAudioContext(1, 44100, 44100);
  const ab = await off.decodeAudioData(buf);
  const data = ab.getChannelData(0), N = 800, step = Math.floor(data.length / N) || 1;
  const c = document.createElement('canvas'); c.width = N; c.height = 60; const g = c.getContext('2d');
  g.fillStyle = 'rgba(190,240,215,.9)';
  for (let i = 0; i < N; i++) { let mx = 0; for (let j = i * step; j < (i + 1) * step && j < data.length; j += 8) mx = Math.max(mx, Math.abs(data[j])); const h = Math.max(1, mx * 56); g.fillRect(i, 30 - h / 2, 1, h); }
  return c.toDataURL();
}
async function realDuration(el, hint) {
  if (isFinite(el.duration) && el.duration > 0) return el.duration;
  try { el.currentTime = 1e7; await once(el, 'durationchange', 4000); } catch (e) {}
  if (isFinite(el.duration) && el.duration > 0) { el.currentTime = 0; return el.duration; }
  return hint || 10;
}
async function importOne(file, durHint) {
  const type = file.type.startsWith('video') ? 'video' : file.type.startsWith('image') ? 'image' : file.type.startsWith('audio') ? 'audio' : null;
  if (!type) { toast(`${file.name}: ese formato no se puede importar`); return null; }
  const m = { id: uid('m'), name: file.name, type, blob: file, url: URL.createObjectURL(file), duration: 0, thumb: '', wave: '', w: 0, h: 0, loading: true };
  state.media.push(m); if (curTab === 'media' || curTab === 'audio') renderTab();
  try {
    if (type === 'image') {
      const img = new Image(); img.src = m.url; await img.decode();
      m.el = img; m.w = img.naturalWidth; m.h = img.naturalHeight; m.thumb = makeThumb(img, m.w, m.h); m.duration = Infinity;
    } else if (type === 'video') {
      const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = m.url;
      await once(v, 'loadedmetadata');
      m.duration = await realDuration(v, durHint); m.w = v.videoWidth; m.h = v.videoHeight;
      v.currentTime = Math.min(.6, m.duration / 3); await once(v, 'seeked').catch(() => {});
      m.thumb = makeThumb(v, m.w || 16, m.h || 9);
      v.removeAttribute('src'); v.load();
    } else {
      const a = document.createElement('audio'); a.preload = 'metadata'; a.src = m.url;
      await once(a, 'loadedmetadata'); m.duration = await realDuration(a, durHint);
      m.wave = await waveform(file).catch(() => '');
    }
    m.loading = false;
    if (db) idb('blobs', 'readwrite', st => st.put({ id: m.id, blob: file })).catch(() => toast('Tu navegador no tiene más espacio para guardar este archivo.'));
    markDirty();
  } catch (e) {
    state.media = state.media.filter(x => x !== m); URL.revokeObjectURL(m.url);
    toast(`No se pudo leer ${file.name}. Probá con MP4, MOV, WEBM, JPG, PNG o MP3.`); return null;
  } finally { if (curTab === 'media' || curTab === 'audio') renderTab(); renderTimeline(); }
  return m;
}
async function importFiles(files) { const out = []; for (const f of files) { const m = await importOne(f); if (m) out.push(m); } return out; }
function removeMedia(id) {
  if (state.clips.some(c => c.mediaId === id)) { toast('Ese archivo está en uso en la línea de tiempo. Sacalo primero.'); return; }
  const m = mediaById(id); if (!m) return;
  state.media = state.media.filter(x => x !== m); URL.revokeObjectURL(m.url); audioBufCache.delete(id);
  if (db) idb('blobs', 'readwrite', st => st.delete(id)).catch(() => {});
  markDirty(); renderTab();
}

/* =========================================================
   Agregar elementos
   ========================================================= */
const trackEnd = trackId => state.clips.filter(c => c.track === trackId).reduce((mx, c) => Math.max(mx, c.start + c.dur), 0);
function pushClip(c) { state.clips.push(c); state.selected = c.id; renderTimeline(); renderInspector(); dirty = true; }
function addMedia(m, trackId, start) {
  if (!m) return;
  if (m.loading) { toast('Esperá a que termine de cargar'); return; }
  pushUndo();
  const isA = m.type === 'audio';
  const tr = trackId ? trackById(trackId) : (isA ? ensureTrack('audio') : mainTrack());
  if (start == null) start = isA ? state.time : trackEnd(tr.id);
  const props = VIS();
  if (tr.role !== 'main' && !isA) { props.scale = .5; props.animIn = 'fade'; props.animInDur = .3; }
  pushClip({ id: uid('c'), kind: 'media', mediaId: m.id, track: tr.id, start: Math.max(0, start), in: 0, dur: m.type === 'image' ? 4 : m.duration, props, kf: [], trans: null });
}
function addText(preset, overrides = {}) {
  pushUndo();
  const p = Object.assign(TEXT_BASE(), preset.p, overrides);
  if (!overrides.text) p.text = preset.sample || preset.name;
  const tr = ensureTrack('text');
  pushClip({ id: uid('c'), kind: 'text', track: tr.id, start: state.time, dur: 3, in: 0, props: p, kf: [], trans: null });
}
function addSticker(emoji) {
  pushUndo();
  const p = Object.assign(TEXT_BASE(), { text: emoji, size: .18, shadow: false, animIn: 'pop', animOut: 'fade', loop: 'pulse', x: .5 + (Math.random() - .5) * .2, y: .45 + (Math.random() - .5) * .2 });
  const tr = ensureTrack('text');
  pushClip({ id: uid('c'), kind: 'text', track: tr.id, start: state.time, dur: 3, in: 0, props: p, kf: [], trans: null, name: 'Sticker' });
}
function addShape(shape) {
  pushUndo();
  const p = Object.assign(SHAPE_BASE(), { shape });
  if (shape === 'line') { p.w = .5; p.h = .5; p.radius = 0; }
  if (shape === 'arrow') { p.w = .4; p.h = .22; }
  if (shape === 'bubble') { p.fill = '#ffffff'; p.w = .4; p.h = .26; }
  let tr = state.tracks.find(t => t.kind === 'visual' && t.role !== 'main' && !t.locked) || addTrack('visual');
  pushClip({ id: uid('c'), kind: 'shape', track: tr.id, start: state.time, dur: 3, in: 0, props: p, kf: [], trans: null });
}
function addColor(name, props) {
  pushUndo();
  const tr = mainTrack();
  pushClip({ id: uid('c'), kind: 'color', name, track: tr.id, start: trackEnd(tr.id), dur: 5, in: 0, props: Object.assign(COLOR_BASE(), props), kf: [], trans: null });
}
function addFx(type) {
  pushUndo();
  const tr = ensureTrack('fx');
  pushClip({ id: uid('c'), kind: 'fx', track: tr.id, start: state.time, dur: 3, in: 0, props: Object.assign(FX_BASE(), { type }), kf: [], trans: null });
}
function applyTransition(type, all) {
  const dur = parseFloat($('#transDur')?.value || '.6');
  if (all) {
    const cuts = state.clips.filter(c => catOf(c) === 'visual' && prevOf(c));
    if (!cuts.length) { toast('No hay clips pegados entre sí. Poné dos clips uno detrás del otro en la misma pista.'); return; }
    pushUndo(); cuts.forEach(c => c.trans = type === 'none' ? null : { type, dur });
    toast(`Transición aplicada a ${cuts.length} cortes`);
  } else {
    let c = clipById(state.selected);
    if (c && catOf(c) === 'visual' && !prevOf(c)) { const n = nextOf(c); if (n) c = n; }
    if (!c || catOf(c) !== 'visual' || !prevOf(c)) { toast('Elegí un clip que esté pegado a otro. La transición va en el corte entre los dos.'); return; }
    pushUndo(); c.trans = type === 'none' ? null : { type, dur };
    state.selected = c.id;
    if (type !== 'none') seek(Math.max(0, c.start - Math.min(1.2, dur + .6)));
  }
  renderTimeline(); renderInspector(); dirty = true; renderTab();
}
function applyFilter(name) {
  const c = clipById(state.selected);
  if (!c || c.kind !== 'media' || catOf(c) !== 'visual') { toast('Elegí un video o una foto para aplicarle el filtro'); return; }
  pushUndo(); Object.assign(c.props, FILTERS[name], { filter: name }); dirty = true; renderInspector(); renderTab();
}

/* =========================================================
   Panel izquierdo
   ========================================================= */
let curTab = 'media';
let recState = null;
const icon = d => `<svg class="i" viewBox="0 0 24 24">${d}</svg>`;
const ICO = {
  plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', play: '<path d="M7 5v14l12-7z" fill="currentColor" stroke="none"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>', screen: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>', cam: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
};
function renderTab() {
  const box = $('#tabBody'); const c = clipById(state.selected);
  let h = '';
  switch (curTab) {
    case 'media': {
      h += `<button class="drop" id="dropzone" data-act="import">${icon('<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>')}<strong>Importar archivos</strong><span>Arrastrá videos, fotos o audio, o tocá para elegir</span></button>`;
      h += `<div class="row-btns" style="margin-top:10px">${recBtn('screen', 'Grabar pantalla', ICO.screen)}${recBtn('camera', 'Grabar cámara', ICO.cam)}</div>`;
      const vis = state.media.filter(m => m.type !== 'audio');
      h += `<div class="label">Tus archivos</div>`;
      h += vis.length ? `<div class="grid2">${vis.map(tileHTML).join('')}</div>` : `<p class="hint">Todavía no importaste nada. Tus archivos quedan en este navegador, no se suben a ningún lado.</p>`;
      break;
    }
    case 'audio': {
      h += `<div class="row-btns">${recBtn('voice', 'Grabar voz en off', ICO.mic)}<button class="btn" data-act="import">${icon(ICO.plus)}Importar audio</button></div>`;
      h += `<p class="hint" style="margin-top:8px">La voz se graba mientras se reproduce el video, y queda sincronizada desde el cabezal.</p>`;
      const au = state.media.filter(m => m.type === 'audio');
      if (au.length) h += `<div class="label">Tus audios</div><div class="grid2">${au.map(tileHTML).join('')}</div>`;
      h += `<div class="label">Música gratis</div><div class="stack" style="gap:6px">${MUSIC_LIST.map(([k, n, d]) => `<div class="proj"><button class="btn icon" data-act="play-sound" data-name="${k}" aria-label="Escuchar ${n}">${icon(ICO.play)}</button><div class="pi"><b>${n}</b><span>${d} · 24 s, en bucle</span></div><button class="btn small" data-act="add-sound" data-name="${k}">${icon(ICO.plus)}Usar</button></div>`).join('')}</div>`;
      h += `<div class="label">Efectos de sonido</div><div class="grid2">${SFX_LIST.map(([k, n]) => `<div class="proj" style="padding:5px"><button class="btn icon small" data-act="play-sound" data-name="${k}" aria-label="Escuchar ${n}">${icon(ICO.play)}</button><div class="pi"><b style="font-size:12px">${n}</b></div><button class="btn icon small" data-act="add-sound" data-name="${k}" aria-label="Agregar ${n}">${icon(ICO.plus)}</button></div>`).join('')}</div>`;
      h += `<p class="hint" style="margin-top:10px">La música y los efectos se generan en tu navegador: son tuyos y libres de derechos.</p>`;
      break;
    }
    case 'text': {
      h += `<button class="btn primary" data-act="text" data-i="-1" style="width:100%;justify-content:center">${icon(ICO.plus)}Agregar texto</button>`;
      h += `<div class="label">Estilos</div><div class="grid2">${TEXT_PRESETS.map((p, i) => presetHTML(p, i)).join('')}</div>`;
      h += `<p class="hint" style="margin-top:10px">El texto aparece en el cabezal. Arrastralo en el visor para moverlo y usá el punto naranja para cambiar el tamaño.</p>`;
      break;
    }
    case 'stickers': {
      h += `<div class="label">Stickers</div><div class="grid4">${EMOJIS.map(e => `<button class="emoji" data-act="emoji" data-e="${e}" aria-label="Sticker ${e}">${e}</button>`).join('')}</div>`;
      h += `<div class="label">Formas</div><div class="grid4">${SHAPES.map(([k, n]) => `<button class="shape" data-act="shape" data-s="${k}" title="${n}" aria-label="${n}">${shapeIcon(k)}</button>`).join('')}</div>`;
      break;
    }
    case 'fx': {
      h += `<p class="hint" style="margin-bottom:10px">Los efectos van en su propia pista y afectan todo lo que está debajo. Estiralos en la línea de tiempo para que duren más.</p>`;
      h += `<div class="grid3">${FX_LIST.map(([k, n, bg]) => `<button class="card" data-act="fx" data-type="${k}"><span class="pv" style="background:${bg}"></span><em>${n}</em></button>`).join('')}</div>`;
      break;
    }
    case 'trans': {
      const cut = c && catOf(c) === 'visual' ? (prevOf(c) ? c : nextOf(c)) : null;
      const cur = cut?.trans?.type || 'none';
      h += `<div class="notice">${cut ? `Corte seleccionado en <b>${tc(cut.start)}</b>. Elegí una transición.` : 'Seleccioná un clip pegado a otro en la misma pista. También podés tocar el rombo que aparece entre dos clips.'}</div>`;
      h += `<div class="f wide" style="margin-top:12px"><label for="transDur">Duración</label><select id="transDur">${[.3, .5, .6, .8, 1, 1.5, 2].map(v => `<option value="${v}"${v === (cut?.trans?.dur ?? .6) ? ' selected' : ''}>${v} s</option>`).join('')}</select></div>`;
      h += `<div class="grid3" style="margin-top:12px"><button class="card${cur === 'none' ? ' on' : ''}" data-act="trans" data-type="none"><span class="pv" style="background:linear-gradient(90deg,#2c5a78 50%,#77602f 50%)"></span><em>Corte directo</em></button>${TRANS_LIST.map(([k, n]) => `<button class="card${cur === k ? ' on' : ''}" data-act="trans" data-type="${k}"><span class="pv" style="${transPreview(k)}"></span><em>${n}</em></button>`).join('')}</div>`;
      h += `<div class="row-btns" style="margin-top:12px"><button class="btn" data-act="trans-all">Aplicar la última a todos los cortes</button></div>`;
      break;
    }
    case 'filters': {
      const ok = c && c.kind === 'media' && catOf(c) === 'visual';
      const m = ok ? mediaById(c.mediaId) : null;
      h += ok ? '' : `<div class="notice">Seleccioná un video o una foto en la línea de tiempo para aplicarle un filtro.</div>`;
      h += `<div class="grid3" style="margin-top:10px">${Object.entries(FILTERS).map(([n, f]) => `<button class="card${ok && c.props.filter === n ? ' on' : ''}" data-act="filter" data-name="${esc(n)}"><span class="pv" style="background:${m?.thumb ? `url(${m.thumb}) center/cover` : 'linear-gradient(135deg,#ff7a59,#6c2a86 60%,#38c7c4)'};filter:brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturate}%) sepia(${f.sepia}%) hue-rotate(${f.hue}deg) grayscale(${f.grayscale}%)"></span><em>${n}</em></button>`).join('')}</div>`;
      h += `<p class="hint" style="margin-top:10px">Para ajustar brillo, contraste y más, abrí la pestaña Color en el panel de la derecha.</p>`;
      break;
    }
    case 'bg': {
      h += `<div class="f wide"><label for="canvasBg">Color del lienzo</label><input type="color" id="canvasBg" value="${state.bg}"></div>`;
      h += `<div class="row-btns" style="margin-top:10px"><button class="btn" data-act="blurfill">Fondo desenfocado al clip elegido</button></div>`;
      h += `<div class="label">Degradados</div><div class="grid2">${BG_PRESETS.map((p, i) => `<button class="sw" data-act="bg" data-i="${i}" style="background:linear-gradient(${p.angle + 90}deg,${p.c1},${p.c2})">${p.name}</button>`).join('')}</div>`;
      h += `<div class="label">Colores sólidos</div><div class="grid2">${SOLIDS.map(([n, col], i) => `<button class="sw" data-act="solid" data-i="${i}" style="background:${col};${['#ffffff', '#e8a33d', '#f4ecdc', '#00ff00'].includes(col) ? 'color:#111;text-shadow:none' : ''}">${n}</button>`).join('')}</div>`;
      break;
    }
    case 'subs': {
      h += `<button class="btn primary" data-act="caps" style="width:100%;justify-content:center">${icon('<path d="m12 3 1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z"/>')}Subtítulos automáticos</button>`;
      h += `<div class="row-btns" style="margin-top:8px"><button class="btn" data-act="sub-add">${icon(ICO.plus)}Agregar a mano</button><button class="btn" data-act="srt-in">Importar .srt</button><button class="btn" data-act="srt-out">Exportar .srt</button></div>`;
      const subs = subClips();
      h += `<div class="label">Subtítulos (${subs.length})</div>`;
      h += subs.length ? `<div class="stack" style="gap:8px">${subs.map(s => `<div class="proj" style="align-items:flex-start"><button class="btn small" data-act="sub-seek" data-id="${s.id}" style="font-family:var(--f-mono)">${tcs(s.start)}</button><textarea data-sub="${s.id}" rows="2" style="flex:1;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:5px 7px" aria-label="Texto del subtítulo">${esc(s.props.text)}</textarea></div>`).join('')}</div>` : `<p class="hint">Generalos automáticamente desde la voz del video, importá un archivo .srt o agregalos a mano.</p>`;
      break;
    }
  }
  box.innerHTML = h;
}
function recBtn(kind, label, ico) {
  if (recState && recState.kind === kind) return `<button class="btn rec" data-act="rec-stop"><span class="rec-dot"></span>Detener <span class="tcode" id="recTime" style="color:#fff">00:00</span></button>`;
  return `<button class="btn" data-act="rec" data-kind="${kind}"${recState ? ' disabled' : ''}>${icon(ico)}${label}</button>`;
}
function tileHTML(m) {
  const inner = m.thumb ? `<img src="${m.thumb}" alt="">` : m.wave ? `<div class="wave" style="background-image:url(${m.wave})"></div>` : `<div class="ph">${m.loading ? 'Cargando…' : '♪'}</div>`;
  const d = m.type === 'image' ? 'Foto' : tcs(m.duration);
  return `<div class="tile" draggable="true" data-mid="${m.id}" title="${esc(m.name)}">${inner}<span class="dur">${d}</span><button class="add" data-act="add-media" data-id="${m.id}" aria-label="Agregar ${esc(m.name)}">${icon(ICO.plus)}</button><button class="rm" data-act="rm-media" data-id="${m.id}" aria-label="Quitar ${esc(m.name)} de la biblioteca">${icon(ICO.x)}</button><span class="nm">${esc(m.name)}</span></div>`;
}
function presetHTML(p, i) {
  const s = Object.assign(TEXT_BASE(), p.p);
  const bg = s.box ? `background:${hexA(s.boxColor, s.boxAlpha)};padding:2px 8px;border-radius:4px;` : '';
  const st = s.stroke ? `-webkit-text-stroke:${Math.min(3, s.stroke / 3)}px ${s.strokeColor};paint-order:stroke fill;` : '';
  const gl = s.glow ? `text-shadow:0 0 8px ${s.glowColor},0 0 16px ${s.glowColor};` : '';
  const big = ['Instrument Serif', 'Bebas Neue', 'Anton'].includes(s.font) ? 21 : 16;
  return `<button class="preset" data-act="text" data-i="${i}" title="${p.name}"><span style="font-family:${fontStack(s.font)};font-weight:${s.weight};color:${s.color};font-size:${big}px;${s.italic ? 'font-style:italic;' : ''}${s.letterSpacing ? `letter-spacing:${s.letterSpacing}em;` : ''}${bg}${st}${gl}">${esc(s.upper ? p.name.toUpperCase() : p.name)}</span></button>`;
}
function shapeIcon(k) {
  const d = { rect: '<rect x="4" y="6" width="16" height="12" rx="2" fill="currentColor"/>', circle: '<circle cx="12" cy="12" r="8" fill="currentColor"/>', triangle: '<path d="M12 4 21 20H3z" fill="currentColor"/>', star: '<path d="m12 3 2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 17l-5.6 3 1.3-6.2L3 9.5l6.3-.7z" fill="currentColor"/>', heart: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z" fill="currentColor"/>', arrow: '<path d="M3 9h11V5l7 7-7 7v-4H3z" fill="currentColor"/>', line: '<path d="M3 12h18" stroke-width="3"/>', bubble: '<path d="M4 5h16v11H9l-4 4v-4H4z" fill="currentColor"/>' }[k];
  return `<svg class="i" viewBox="0 0 24 24" style="width:26px;height:26px;color:var(--accent)">${d}</svg>`;
}
function transPreview(k) {
  const A = '#2c5a78', B = '#b9853a';
  const map = {
    fade: `background:linear-gradient(90deg,${A},${B})`, black: `background:linear-gradient(90deg,${A},#000 50%,${B})`, white: `background:linear-gradient(90deg,${A},#fff 50%,${B})`,
    slideL: `background:linear-gradient(90deg,${A} 40%,${B} 40%)`, slideR: `background:linear-gradient(270deg,${A} 40%,${B} 40%)`, slideU: `background:linear-gradient(0deg,${B} 45%,${A} 45%)`,
    push: `background:linear-gradient(90deg,${A} 30%,#111 30% 33%,${B} 33%)`, zoom: `background:radial-gradient(circle,${B} 30%,${A} 31%)`, zoomOut: `background:radial-gradient(circle,${A} 45%,${B} 46%)`,
    wipe: `background:linear-gradient(90deg,${B} 55%,${A} 55%)`, wipeV: `background:linear-gradient(${B} 55%,${A} 55%)`, circle: `background:radial-gradient(circle,${B} 38%,${A} 39%)`,
    blur: `background:linear-gradient(90deg,${A},${B});filter:blur(2px)`, spin: `background:conic-gradient(${B} 0 25%,${A} 0)`, flash: `background:radial-gradient(circle,#fff,${A} 70%)`, glitchT: `background:repeating-linear-gradient(${A} 0 5px,${B} 5px 9px)`,
  };
  return map[k] || `background:${A}`;
}
$('#tabBody').addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'import') $('#fileIn').click();
  else if (act === 'add-media') addMedia(mediaById(b.dataset.id));
  else if (act === 'rm-media') removeMedia(b.dataset.id);
  else if (act === 'rec') startRecording(b.dataset.kind);
  else if (act === 'rec-stop') stopRecording();
  else if (act === 'play-sound') previewSound(b.dataset.name, b);
  else if (act === 'add-sound') addSound(b.dataset.name);
  else if (act === 'text') addText(+b.dataset.i < 0 ? { name: 'Texto', p: {}, sample: 'Tu texto' } : TEXT_PRESETS[+b.dataset.i]);
  else if (act === 'emoji') addSticker(b.dataset.e);
  else if (act === 'shape') addShape(b.dataset.s);
  else if (act === 'fx') addFx(b.dataset.type);
  else if (act === 'trans') { lastTrans = b.dataset.type; applyTransition(b.dataset.type, false); }
  else if (act === 'trans-all') applyTransition(lastTrans || 'fade', true);
  else if (act === 'filter') applyFilter(b.dataset.name);
  else if (act === 'bg') { const p = BG_PRESETS[+b.dataset.i]; addColor(p.name, { mode: 'linear', c1: p.c1, c2: p.c2, angle: p.angle }); }
  else if (act === 'solid') { const [n, col] = SOLIDS[+b.dataset.i]; addColor(n, { mode: 'solid', c1: col, c2: col, drift: false }); }
  else if (act === 'blurfill') {
    const c = clipById(state.selected);
    if (!c || c.kind !== 'media' || catOf(c) !== 'visual') { toast('Elegí un video o una foto en la línea de tiempo'); return; }
    pushUndo(); c.props.fit = 'blurfill'; dirty = true; renderInspector(); toast('Listo: el espacio vacío se llena con el mismo video desenfocado');
  }
  else if (act === 'caps') openCaptions();
  else if (act === 'sub-add') addCaption();
  else if (act === 'srt-in') $('#srtIn').click();
  else if (act === 'srt-out') exportSrt();
  else if (act === 'sub-seek') { const c = clipById(b.dataset.id); if (c) { seek(c.start + .01); select(c.id); } }
});
let lastTrans = 'fade';
$('#tabBody').addEventListener('input', e => {
  if (e.target.id === 'canvasBg') { state.bg = e.target.value; dirty = true; markDirty(); }
  const sid = e.target.dataset?.sub;
  if (sid) { const c = clipById(sid); if (c) { c.props.text = e.target.value; dirty = true; const l = document.querySelector(`.clip[data-id="${sid}"] .lbl`); if (l) l.textContent = clipLabel(c); markDirty(); } }
});
let subPre = null;
$('#tabBody').addEventListener('focusin', e => { if (e.target.dataset?.sub) subPre = snapshot(); });
$('#tabBody').addEventListener('change', e => { if (e.target.dataset?.sub && subPre && subPre !== snapshot()) { pushUndo(subPre); subPre = null; } });
$('#tabBody').addEventListener('dragstart', e => { const t = e.target.closest('.tile'); if (t) { e.dataTransfer.setData('text/x-media', t.dataset.mid); e.dataTransfer.effectAllowed = 'copy'; } });
$$('.rtab').forEach(t => t.addEventListener('click', () => { curTab = t.dataset.tab; $$('.rtab').forEach(x => x.setAttribute('aria-selected', x === t)); renderTab(); }));
$('#fileIn').addEventListener('change', e => { importFiles([...e.target.files]); e.target.value = ''; });
['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); $('#dropzone')?.classList.add('over'); } }));
document.addEventListener('dragleave', e => { if (!e.relatedTarget) $('#dropzone')?.classList.remove('over'); });
document.addEventListener('drop', e => { if (e.dataTransfer?.files.length) { e.preventDefault(); $('#dropzone')?.classList.remove('over'); importFiles([...e.dataTransfer.files]); } });

/* =========================================================
   Línea de tiempo
   ========================================================= */
const tlInner = $('#tlInner'), tlScroll = $('#tlScroll');
const headW = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--headw')) || 150;
function niceStep() { for (const s of [.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]) if (s * state.pps >= 64) return s; return 600; }
function rulerHTML(total) {
  const step = niceStep(), minor = step / (step >= 5 ? 5 : 2); let h = '';
  for (let t = 0; t <= total + 1e-6; t += minor) {
    const mj = Math.abs(t / step - Math.round(t / step)) < 1e-6;
    h += `<div class="tick${mj ? ' mj' : ''}" style="left:${t * state.pps}px">${mj ? `<b>${tcs(t)}</b>` : ''}</div>`;
  }
  return h;
}
function clipStyle(c) {
  const pps = state.pps, m = c.mediaId ? mediaById(c.mediaId) : null; let bg = '';
  if (c.kind === 'color') bg = `background-image:${c.props.mode === 'solid' ? `linear-gradient(${c.props.c1},${c.props.c1})` : `linear-gradient(90deg,${c.props.c1},${c.props.c2})`};background-size:100% 100%;`;
  else if (m && (catOf(c) === 'audio') && m.wave) bg = `background-image:url(${m.wave});background-size:${m.duration / (c.props.speed || 1) * pps}px 100%;background-position:${-c.in / (c.props.speed || 1) * pps}px 0;background-repeat:no-repeat;`;
  else if (m && m.thumb && catOf(c) === 'visual') bg = `background-image:url(${m.thumb});`;
  return `left:${c.start * pps}px;width:${Math.max(4, c.dur * pps)}px;${bg}`;
}
function clipLabel(c) {
  if (c.kind === 'text') return (c.props.text || '').split('\n')[0] || 'Texto';
  if (c.kind === 'color') return c.name || 'Fondo';
  if (c.kind === 'shape') return (SHAPES.find(s => s[0] === c.props.shape) || [0, 'Forma'])[1];
  if (c.kind === 'fx') return FX_NAME[c.props.type] || 'Efecto';
  const m = mediaById(c.mediaId);
  let s = (m ? m.name : 'Clip');
  if (c.props.speed !== 1) s += ` · ${c.props.speed}×`;
  if (catOf(c) === 'visual' && hasAudio(c) && c.props.volume === 0) s += ' · sin sonido';
  return s;
}
function clipHTML(c) {
  const pps = state.pps;
  const kf = (c.kf || []).map(f => `<i class="kfd" style="left:${f.t * pps}px"></i>`).join('');
  const fi = c.props.fadeIn > 0 ? `<i class="fadeL" style="width:${c.props.fadeIn * pps}px"></i>` : '';
  const fo = c.props.fadeOut > 0 ? `<i class="fadeR" style="width:${c.props.fadeOut * pps}px"></i>` : '';
  return `<div class="clip k-${styleCat(c)}${c.id === state.selected ? ' sel' : ''}" data-id="${c.id}" style="${clipStyle(c)}">${fi}${fo}<div class="h l"></div><span class="lbl">${esc(clipLabel(c))}</span>${kf}<div class="h r"></div></div>`;
}
const TB = {
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.9 8.3 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.2-.9"/>',
  vol: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6"/>', mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="m17 9 5 6M22 9l-5 6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  del: '<path d="M6 6l12 12M18 6 6 18"/>',
  visual: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="m10 9 5 3-5 3z"/>', text: '<path d="M5 6h14M12 6v13"/>', fx: '<path d="m12 3 1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z"/>', audio: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
};
function trackHeadHTML(tr) {
  const btn = (act, on, a, b, title) => `<button class="tb${on ? ' off' : ''}" data-tact="${act}" data-tid="${tr.id}" title="${title}" aria-label="${title}">${icon(on ? b : a)}</button>`;
  let h = `<div class="head"><span class="tn" title="${esc(tr.name)}">${icon(TB[tr.kind])}${esc(tr.name)}</span>`;
  if (tr.kind !== 'audio') h += btn('hide', tr.hidden, TB.eye, TB.eyeOff, tr.hidden ? 'Mostrar pista' : 'Ocultar pista');
  if (tr.kind === 'audio' || tr.kind === 'visual') h += btn('mute', tr.muted, TB.vol, TB.mute, tr.muted ? 'Activar sonido' : 'Silenciar pista');
  h += btn('lock', tr.locked, TB.unlock, TB.lock, tr.locked ? 'Desbloquear pista' : 'Bloquear pista');
  if (tr.role !== 'main') h += `<button class="tb" data-tact="del" data-tid="${tr.id}" title="Eliminar pista" aria-label="Eliminar pista">${icon(TB.del)}</button>`;
  return h + '</div>';
}
function renderTimeline() {
  const total = Math.max(totalDur() + 10, 30), laneW = total * state.pps;
  let h = `<div class="trow r-ruler"><div class="head"></div><div class="lane ruler" id="ruler" style="width:${laneW}px">${rulerHTML(total)}</div></div>`;
  for (const tr of state.tracks) {
    const clips = state.clips.filter(c => c.track === tr.id);
    let marks = '';
    if (tr.kind === 'visual') marks = clips.filter(c => prevOf(c)).map(c => `<button class="tmark${c.trans && c.trans.type !== 'none' ? ' on' : ''}" data-cut="${c.id}" style="left:${c.start * state.pps}px" title="${c.trans ? TRANS_NAME[c.trans.type] : 'Agregar transición'}" aria-label="Transición">${icon('<path d="m12 4 8 8-8 8-8-8z"/>')}</button>`).join('');
    h += `<div class="trow k-${tr.kind}${tr.role === 'main' ? ' main' : ''}">${trackHeadHTML(tr)}<div class="lane${tr.locked ? ' locked' : ''}${tr.hidden ? ' hiddenT' : ''}" data-track="${tr.id}" style="width:${laneW}px">${clips.map(clipHTML).join('')}${marks}</div></div>`;
  }
  h += `<div class="playhead" id="playhead"><span></span></div>`;
  tlInner.innerHTML = h; tlInner.style.width = (headW() + laneW) + 'px';
  updatePlayhead(); updateButtons();
}
function updatePlayhead() {
  const ph = $('#playhead'); if (ph) ph.style.left = (headW() + state.time * state.pps) + 'px';
  $('#tNow').textContent = tc(state.time); $('#tTotal').textContent = tc(totalDur());
  if (state.playing) {
    const x = headW() + state.time * state.pps, vw = tlScroll.clientWidth;
    if (x > tlScroll.scrollLeft + vw - 40 || x < tlScroll.scrollLeft + headW()) tlScroll.scrollLeft = x - headW() - 40;
  }
  if (recState) { const el = $('#recTime'); if (el) el.textContent = tcs((performance.now() - recState.t0) / 1000); }
}
function positionClip(el, c) { el.setAttribute('style', clipStyle(c)); }
const timeFromX = x => (x - tlInner.getBoundingClientRect().left - headW()) / state.pps;
function snapPts(ex) { const p = [0, state.time]; for (const k of state.clips) if (k.id !== ex) p.push(k.start, k.start + k.dur); return p; }
function snapPoint(t, ex) { if (!state.snap) return t; let best = t, bd = 8 / state.pps; for (const p of snapPts(ex)) { const d = Math.abs(p - t); if (d < bd) { bd = d; best = p; } } return best; }
function snapMove(s, dur, ex) {
  if (!state.snap) return s;
  const a = snapPoint(s, ex), b = snapPoint(s + dur, ex) - dur;
  const da = a !== s ? Math.abs(a - s) : Infinity, db = b !== s ? Math.abs(b - s) : Infinity;
  return Math.max(0, da <= db ? (da < Infinity ? a : s) : b);
}
let drag = null;
tlInner.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  const tb = e.target.closest('[data-tact]'); if (tb) return;
  const mk = e.target.closest('[data-cut]');
  if (mk) { select(mk.dataset.cut); curTab = 'trans'; $$('.rtab').forEach(x => x.setAttribute('aria-selected', x.dataset.tab === 'trans')); renderTab(); return; }
  if (e.target.closest('#ruler') || e.target.closest('#playhead')) { drag = { mode: 'seek' }; seek(timeFromX(e.clientX)); tlInner.setPointerCapture(e.pointerId); return; }
  const ce = e.target.closest('.clip');
  if (!ce) { if (e.target.closest('.lane')) { select(null); seek(timeFromX(e.clientX)); } return; }
  const c = clipById(ce.dataset.id); if (!c) return;
  select(c.id);
  if (trackById(c.track)?.locked) { toast('La pista está bloqueada'); return; }
  const mode = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'move';
  drag = { mode, c, el: ce, x0: e.clientX, o: { start: c.start, dur: c.dur, in: c.in, track: c.track, kf: JSON.parse(JSON.stringify(c.kf || [])) }, snap: snapshot(), moved: false };
  tlInner.setPointerCapture(e.pointerId); e.preventDefault();
});
tlInner.addEventListener('pointermove', e => {
  if (!drag) return;
  if (drag.mode === 'seek') { seek(timeFromX(e.clientX)); return; }
  const { c, o } = drag;
  if (!drag.moved && Math.abs(e.clientX - drag.x0) < 3) {
    if (drag.mode !== 'move') return;
    const ln = document.elementFromPoint(e.clientX, e.clientY)?.closest('.lane[data-track]');
    if (!ln || ln.dataset.track === c.track) return;
  }
  drag.moved = true;
  const dx = (e.clientX - drag.x0) / state.pps, sp = c.props.speed || 1, m = c.mediaId ? mediaById(c.mediaId) : null, timed = m && m.type !== 'image';
  if (drag.mode === 'move') {
    c.start = snapMove(Math.max(0, o.start + dx), c.dur, c.id);
    const lane = document.elementFromPoint(e.clientX, e.clientY)?.closest('.lane[data-track]');
    if (lane && lane.dataset.track !== c.track && accepts(lane.dataset.track, catOf(c)) && !trackById(lane.dataset.track).locked) { c.track = lane.dataset.track; lane.appendChild(drag.el); }
  } else if (drag.mode === 'l') {
    const minS = timed ? Math.max(0, o.start - o.in / sp) : 0, maxS = o.start + o.dur - .1;
    const s = clamp(snapPoint(clamp(o.start + dx, minS, maxS), c.id), minS, maxS);
    c.start = s; c.dur = o.dur - (s - o.start); if (timed) c.in = o.in + (s - o.start) * sp;
    c.kf = o.kf.map(f => ({ ...f, t: f.t - (s - o.start) })).filter(f => f.t >= -1e-3 && f.t <= c.dur + 1e-3);
  } else {
    const maxD = timed ? (m.duration - o.in) / sp : 36000;
    const end = snapPoint(o.start + clamp(o.dur + dx, .1, maxD), c.id);
    c.dur = clamp(end - o.start, .1, maxD);
    c.kf = o.kf.filter(f => f.t <= c.dur + 1e-3);
  }
  positionClip(drag.el, c); dirty = true;
  $('#tTotal').textContent = tc(totalDur());
});
const endDrag = () => {
  if (!drag) return;
  if (drag.mode !== 'seek' && drag.moved) { pushUndo(drag.snap); renderTimeline(); renderInspector(); }
  drag = null;
};
tlInner.addEventListener('pointerup', endDrag); tlInner.addEventListener('pointercancel', endDrag);
tlInner.addEventListener('click', e => {
  const tb = e.target.closest('[data-tact]'); if (!tb) return;
  const tr = trackById(tb.dataset.tid); if (!tr) return;
  const act = tb.dataset.tact;
  if (act === 'del') {
    if (state.clips.some(c => c.track === tr.id)) { toast('Vaciá la pista antes de eliminarla'); return; }
    if (state.tracks.filter(t => t.kind === tr.kind).length <= 1 && tr.kind !== 'fx') { toast('Tiene que quedar al menos una pista de este tipo'); return; }
    pushUndo(); state.tracks = state.tracks.filter(t => t !== tr);
  } else { pushUndo(); if (act === 'hide') tr.hidden = !tr.hidden; if (act === 'mute') tr.muted = !tr.muted; if (act === 'lock') tr.locked = !tr.locked; }
  renderTimeline(); dirty = true;
});
tlInner.addEventListener('dragover', e => { const lane = e.target.closest('.lane[data-track]'); if (lane && e.dataTransfer.types.includes('text/x-media')) { e.preventDefault(); $$('.lane.dropok').forEach(l => l.classList.remove('dropok')); lane.classList.add('dropok'); } });
tlInner.addEventListener('dragleave', e => { e.target.closest?.('.lane')?.classList.remove('dropok'); });
tlInner.addEventListener('drop', e => {
  const id = e.dataTransfer.getData('text/x-media'); if (!id) return;
  e.preventDefault(); e.stopPropagation();
  $$('.lane.dropok').forEach(l => l.classList.remove('dropok'));
  const m = mediaById(id), lane = e.target.closest('.lane[data-track]'); if (!m) return;
  const cat = m.type === 'audio' ? 'audio' : 'visual';
  const tr = lane && accepts(lane.dataset.track, cat) && !trackById(lane.dataset.track).locked ? lane.dataset.track : null;
  addMedia(m, tr, Math.max(0, timeFromX(e.clientX)));
});
tlScroll.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(state.pps * (e.deltaY < 0 ? 1.15 : .87)); } }, { passive: false });
function setZoom(v) { state.pps = clamp(v, 8, 300); $('#zoom').value = state.pps; renderTimeline(); }
$('#zoom').addEventListener('input', e => setZoom(+e.target.value));
$('#fitBtn').onclick = () => setZoom((tlScroll.clientWidth - headW() - 40) / Math.max(5, totalDur()));

/* =========================================================
   Operaciones de edición
   ========================================================= */
function select(id) {
  state.selected = id;
  $$('.clip').forEach(el => el.classList.toggle('sel', el.dataset.id === id));
  renderInspector(); updateSelBox(); updateButtons();
  if (['trans', 'filters'].includes(curTab)) renderTab();
}
function splitClipAt(c, t) {
  const left = t - c.start, n = JSON.parse(JSON.stringify(c));
  n.id = uid('c'); n.start = t; n.dur = c.dur - left; n.trans = null;
  if (c.kind === 'media') n.in = c.in + left * (c.props.speed || 1);
  if (c.kf && c.kf.length) {
    const mid = evalProps(c, left), keys = kfKeysFor(c), bf = { t: left }; keys.forEach(k => bf[k] = mid[k]);
    n.kf = c.kf.filter(f => f.t > left).map(f => ({ ...f, t: f.t - left })); n.kf.unshift({ ...bf, t: 0 });
    c.kf = c.kf.filter(f => f.t < left); c.kf.push(bf);
  }
  n.props.fadeIn = 0; n.props.animIn = 'none'; c.dur = left; c.props.fadeOut = 0; c.props.animOut = 'none';
  state.clips.push(n);
  return n;
}
function split() {
  const t = state.time, sel = clipById(state.selected);
  const under = c => t > c.start + .03 && t < c.start + c.dur - .03 && !trackById(c.track)?.locked;
  const targets = sel && under(sel) ? [sel] : state.clips.filter(under);
  if (!targets.length) { toast('Poné el cabezal sobre un clip para dividirlo'); return; }
  pushUndo(); targets.forEach(c => splitClipAt(c, t));
  renderTimeline(); renderInspector(); dirty = true;
}
function duplicate() {
  const c = clipById(state.selected); if (!c) { toast('Elegí un clip para duplicarlo'); return; }
  pushUndo(); const n = JSON.parse(JSON.stringify(c)); n.id = uid('c'); n.start = c.start + c.dur; n.trans = null;
  pushClip(n);
}
function del() {
  const c = clipById(state.selected); if (!c) { toast('Elegí un clip para eliminarlo'); return; }
  if (trackById(c.track)?.locked) { toast('La pista está bloqueada'); return; }
  pushUndo(); state.clips = state.clips.filter(x => x !== c); state.selected = null; prune();
  renderTimeline(); renderInspector(); dirty = true; if (curTab === 'subs') renderTab();
}
function copyClip() { const c = clipById(state.selected); if (c) { clipboard = JSON.parse(JSON.stringify(c)); toast('Clip copiado'); } }
function pasteClip() {
  if (!clipboard) return;
  pushUndo(); const n = JSON.parse(JSON.stringify(clipboard)); n.id = uid('c'); n.start = state.time; n.trans = null;
  if (!trackById(n.track)) n.track = ensureTrack(catOf(n)).id;
  pushClip(n);
}
async function freezeFrame() {
  const t = state.time;
  let c = clipById(state.selected);
  const ok = k => k && k.kind === 'media' && mediaById(k.mediaId)?.type === 'video' && catOf(k) === 'visual' && t >= k.start && t < k.start + k.dur;
  if (!ok(c)) c = state.clips.find(ok);
  if (!c) { toast('Poné el cabezal sobre un video para congelar ese fotograma'); return; }
  pause(); syncMedia();
  const el = elFor(c);
  if (el.seeking || el.readyState < 2) { try { await once(el, el.seeking ? 'seeked' : 'loadeddata', 2000); } catch (e) {} }
  const w = el.videoWidth, h = el.videoHeight; if (!w) { toast('Ese video todavía no cargó'); return; }
  const cc = document.createElement('canvas'); cc.width = w; cc.height = h; cc.getContext('2d').drawImage(el, 0, 0);
  const blob = await new Promise(r => cc.toBlob(r, 'image/png'));
  const m = await importOne(new File([blob], `congelado-${tcs(t).replace(':', 'm')}s.png`, { type: 'image/png' }));
  if (!m) return;
  pushUndo();
  const FD = 2;
  if (t > c.start + .03) splitClipAt(c, t);
  state.clips.filter(k => k.track === c.track && k.start >= t - 1e-3).forEach(k => k.start += FD);
  const props = Object.assign(VIS(), JSON.parse(JSON.stringify(c.props)), { speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, animIn: 'none', animOut: 'none', chroma: c.props.chroma, removeBg: c.props.removeBg });
  pushClip({ id: uid('c'), kind: 'media', mediaId: m.id, track: c.track, start: t, in: 0, dur: FD, props, kf: [], trans: null });
  toast('Fotograma congelado por 2 segundos');
}
function detachAudio() {
  const c = clipById(state.selected);
  if (!c || c.kind !== 'media' || mediaById(c.mediaId)?.type !== 'video' || catOf(c) !== 'visual') { toast('Elegí un video para separarle el audio'); return; }
  pushUndo();
  const tr = ensureTrack('audio');
  const a = { id: uid('c'), kind: 'media', mediaId: c.mediaId, audioOnly: true, track: tr.id, start: c.start, in: c.in, dur: c.dur, props: Object.assign(VIS(), { volume: c.props.volume || 1, speed: c.props.speed, fadeIn: c.props.fadeIn, fadeOut: c.props.fadeOut }), kf: [], trans: null };
  c.props.volume = 0;
  state.clips.push(a);
  const m = mediaById(c.mediaId);
  if (m && !m.wave && m.blob) waveform(m.blob).then(w => { m.wave = w; renderTimeline(); markDirty(); }).catch(() => {});
  renderTimeline(); renderInspector(); dirty = true; toast('Audio separado en su propia pista');
}
function closeGaps() {
  const tr = mainTrack(); const list = state.clips.filter(c => c.track === tr.id).sort((a, b) => a.start - b.start);
  if (!list.length) return;
  pushUndo(); let cur = 0; list.forEach(c => { c.start = cur; cur += c.dur; });
  renderTimeline(); dirty = true; toast('Huecos cerrados en la pista principal');
}
function updateButtons() {
  $('#undoBtn').disabled = !undoStack.length; $('#redoBtn').disabled = !redoStack.length;
  const sel = !!state.selected;
  $('#dupBtn').disabled = $('#delBtn').disabled = !sel;
  $('#exportBtn').disabled = !state.clips.length;
}
$('#splitBtn').onclick = split; $('#dupBtn').onclick = duplicate; $('#delBtn').onclick = del;
$('#freezeBtn').onclick = freezeFrame; $('#detachBtn').onclick = detachAudio; $('#gapBtn').onclick = closeGaps;
$('#undoBtn').onclick = undo; $('#redoBtn').onclick = redo;
$('#snapBtn').onclick = () => { state.snap = !state.snap; $('#snapBtn').setAttribute('aria-pressed', state.snap); };
$('#playBtn').onclick = () => state.playing ? pause() : play();
$('#toStart').onclick = () => seek(0); $('#toEnd').onclick = () => seek(totalDur());
$('#stepBack').onclick = () => seek(state.time - 1 / PREVIEW_FPS); $('#stepFwd').onclick = () => seek(state.time + 1 / PREVIEW_FPS);
$('#aspectSel').onchange = e => setAspect(e.target.value);
$('#guidesBtn').onclick = () => { const g = $('#guides'); g.hidden = !g.hidden; $('#guidesBtn').setAttribute('aria-pressed', !g.hidden); };
$('#fsBtn').onclick = () => { const st = $('#stage'); if (document.fullscreenElement) document.exitFullscreen?.(); else st.requestFullscreen?.().catch(() => toast('Tu navegador no permite pantalla completa acá')); };
document.addEventListener('fullscreenchange', () => setTimeout(fitCanvas, 50));
$('#snapPngBtn').onclick = () => { render(); cv.toBlob(b => b && downloadBlob(b, `${safeName(state.name)}-${tcs(state.time).replace(':', 'm')}s.png`), 'image/png'); };
$('#addTrackBtn').onclick = e => { e.stopPropagation(); const m = $('#addTrackMenu'); m.hidden = !m.hidden; $('#addTrackBtn').setAttribute('aria-expanded', !m.hidden); };
$('#addTrackMenu').onclick = e => { const b = e.target.closest('[data-kind]'); if (!b) return; pushUndo(); addTrack(b.dataset.kind); $('#addTrackMenu').hidden = true; renderTimeline(); };
document.addEventListener('click', e => { if (!e.target.closest('.menu-wrap')) $('#addTrackMenu').hidden = true; });

document.addEventListener('keydown', e => {
  if (e.target.closest?.('input,textarea,select,[contenteditable]')) return;
  if (!$('#exportModal').hidden || !$('#projModal').hidden || !$('#capModal').hidden) return;
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (e.code === 'Space' || k === 'k') { e.preventDefault(); state.playing ? pause() : play(); }
  else if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && k === 'y') { e.preventDefault(); redo(); }
  else if (mod && k === 'd') { e.preventDefault(); duplicate(); }
  else if (mod && k === 'c') { copyClip(); }
  else if (mod && k === 'v') { e.preventDefault(); pasteClip(); }
  else if (mod && k === 's') { e.preventDefault(); saveProject(); toast('Proyecto guardado'); }
  else if (k === 's') split();
  else if (k === 'f') freezeFrame();
  else if (e.key === 'Delete' || e.key === 'Backspace') { if (state.selected) { e.preventDefault(); del(); } }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(state.time - (e.shiftKey ? 1 : 1 / PREVIEW_FPS)); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); seek(state.time + (e.shiftKey ? 1 : 1 / PREVIEW_FPS)); }
  else if (e.key === 'Home') seek(0); else if (e.key === 'End') seek(totalDur());
  else if (e.key === 'Escape') select(null);
  else if (e.key === '+' || e.key === '=') setZoom(state.pps * 1.2);
  else if (e.key === '-') setZoom(state.pps / 1.2);
});

/* =========================================================
   Arrastrar en el visor
   ========================================================= */
let pdrag = null;
function canvasPoint(e) { const r = cv.getBoundingClientRect(), k = state.W / r.width; return [(e.clientX - r.left) * k, (e.clientY - r.top) * k, k]; }
cv.addEventListener('pointerdown', e => {
  const [x, y, k] = canvasPoint(e);
  let hit = null;
  for (let i = drawn.length - 1; i >= 0; i--) { const b = boxes.get(drawn[i]); if (b && Math.abs(x - b.cx) <= b.w / 2 && Math.abs(y - b.cy) <= b.h / 2) { hit = clipById(drawn[i]); break; } }
  if (!hit) { select(null); return; }
  if (hit.id !== state.selected) select(hit.id);
  if (hit.kind === 'color' || trackById(hit.track)?.locked) return;
  const P = evalProps(hit, localT(hit));
  pdrag = { mode: 'move', c: hit, x0: x, y0: y, ox: P.x, oy: P.y, k, snap: snapshot(), moved: false };
  cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing';
});
$('#selbox').addEventListener('pointerdown', e => {
  if (!e.target.closest('.rs')) return;
  const c = clipById(state.selected); if (!c) return;
  e.stopPropagation(); e.preventDefault();
  const b = boxes.get(c.id); if (!b) return;
  const [x, y] = canvasPoint(e);
  const P = evalProps(c, localT(c));
  pdrag = { mode: 'scale', c, d0: Math.max(4, Math.hypot(x - b.cx, y - b.cy)), cx: b.cx, cy: b.cy, s0: c.kind === 'text' ? P.size : P.scale, snap: snapshot(), moved: false };
  $('#selbox').setPointerCapture(e.pointerId);
});
function pmove(e) {
  if (!pdrag) return;
  const [x, y] = canvasPoint(e);
  const c = pdrag.c;
  if (pdrag.mode === 'move') {
    let nx = pdrag.ox + (x - pdrag.x0) / state.W, ny = pdrag.oy + (y - pdrag.y0) / state.H;
    if (Math.abs(nx - .5) < .012) nx = .5; if (Math.abs(ny - .5) < .012) ny = .5;
    setProp(c, 'x', nx); setProp(c, 'y', ny);
  } else {
    const f = Math.hypot(x - pdrag.cx, y - pdrag.cy) / pdrag.d0;
    if (c.kind === 'text') setProp(c, 'size', clamp(pdrag.s0 * f, .01, .5)); else setProp(c, 'scale', clamp(pdrag.s0 * f, .03, 8));
  }
  pdrag.moved = true; dirty = true;
}
function pend() {
  if (!pdrag) return;
  if (pdrag.moved) { pushUndo(pdrag.snap); renderInspector(); if (pdrag.c.kf?.length) renderTimeline(); }
  pdrag = null; cv.style.cursor = '';
}
cv.addEventListener('pointermove', pmove); cv.addEventListener('pointerup', pend); cv.addEventListener('pointercancel', pend);
$('#selbox').addEventListener('pointermove', pmove); $('#selbox').addEventListener('pointerup', pend); $('#selbox').addEventListener('pointercancel', pend);
cv.addEventListener('wheel', e => {
  const c = clipById(state.selected); if (!c || c.kind === 'color' || catOf(c) === 'fx' || catOf(c) === 'audio') return;
  e.preventDefault();
  const P = evalProps(c, localT(c)), f = e.deltaY < 0 ? 1.05 : .95;
  if (c.kind === 'text') setProp(c, 'size', clamp(P.size * f, .01, .5)); else setProp(c, 'scale', clamp(P.scale * f, .03, 8));
  dirty = true; markDirty(); clearTimeout(cv._t); cv._t = setTimeout(renderInspector, 200);
}, { passive: false });

/* =========================================================
   Inspector
   ========================================================= */
const pct = v => Math.round(v * 100) + '%';
const secs = v => (+v).toFixed(1) + ' s';
const deg = v => Math.round(v) + '°';
const D = {
  x: { k: 'x', l: 'Posición X', min: -.5, max: 1.5, step: .005, fmt: pct },
  y: { k: 'y', l: 'Posición Y', min: -.5, max: 1.5, step: .005, fmt: pct },
  scale: { k: 'scale', l: 'Escala', min: .05, max: 4, step: .01, fmt: pct },
  rotation: { k: 'rotation', l: 'Rotación', min: -180, max: 180, step: 1, fmt: deg },
  opacity: { k: 'opacity', l: 'Opacidad', min: 0, max: 1, step: .01, fmt: pct },
  volume: { k: 'volume', l: 'Volumen', min: 0, max: 2, step: .01, fmt: pct },
  speed: { k: 'speed', l: 'Velocidad', min: .1, max: 8, step: .05, fmt: v => (+v).toFixed(2) + '×' },
  fadeIn: { k: 'fadeIn', l: 'Entrada', min: 0, max: 5, step: .1, fmt: secs },
  fadeOut: { k: 'fadeOut', l: 'Salida', min: 0, max: 5, step: .1, fmt: secs },
  blend: { k: 'blend', l: 'Mezcla', type: 'select', opts: BLENDS },
};
const ADJUST = [
  { k: 'brightness', l: 'Brillo', min: 0, max: 200, step: 1, fmt: v => v + '%' }, { k: 'contrast', l: 'Contraste', min: 0, max: 200, step: 1, fmt: v => v + '%' },
  { k: 'saturate', l: 'Saturación', min: 0, max: 300, step: 1, fmt: v => v + '%' }, { k: 'hue', l: 'Tono', min: -180, max: 180, step: 1, fmt: deg },
  { k: 'sepia', l: 'Calidez', min: 0, max: 100, step: 1, fmt: v => v + '%' }, { k: 'grayscale', l: 'Sin color', min: 0, max: 100, step: 1, fmt: v => v + '%' },
  { k: 'blur', l: 'Desenfoque', min: 0, max: 40, step: .5, fmt: v => v },
];
const inspTab = {};
function ctl(c, d) {
  const wrap = document.createElement('div');
  const id = 'f-' + d.k;
  const P = evalProps(c, localT(c));
  const v = P[d.k];
  const isKf = KF_KEYS.includes(d.k) && c.kf?.length;
  if (d.type === 'select') {
    wrap.className = 'f wide';
    wrap.innerHTML = `<label for="${id}">${d.l}</label><select id="${id}">${d.opts.map(([ov, ol]) => `<option value="${esc(ov)}"${String(ov) === String(v) ? ' selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
  } else if (d.type === 'color') {
    wrap.className = 'f wide'; wrap.innerHTML = `<label for="${id}">${d.l}</label><input type="color" id="${id}" value="${esc(v)}">`;
  } else if (d.type === 'check') {
    wrap.className = 'f wide'; wrap.innerHTML = `<label for="${id}">${d.l}</label><input type="checkbox" id="${id}" ${v ? 'checked' : ''} style="justify-self:start;accent-color:var(--accent);width:16px;height:16px">`;
  } else if (d.type === 'textarea') {
    wrap.className = 'f wide'; wrap.innerHTML = `<label for="${id}">${d.l}</label><textarea id="${id}" rows="3">${esc(v)}</textarea>`;
  } else {
    wrap.className = 'f'; wrap.innerHTML = `<label for="${id}">${d.l}${isKf ? ' <i class="diamond' + (kfAt(c, localT(c)) ? ' on' : '') + '" title="Animado con fotogramas clave"></i>' : ''}</label><input type="range" id="${id}" min="${d.min}" max="${d.max}" step="${d.step}" value="${v}"><output>${d.fmt ? d.fmt(v) : v}</output>`;
  }
  const input = wrap.querySelector('input,select,textarea'), out = wrap.querySelector('output');
  let pre = null;
  const take = () => { if (pre == null) pre = snapshot(); };
  input.addEventListener('pointerdown', take); input.addEventListener('focus', take); input.addEventListener('keydown', take);
  input.addEventListener('input', () => {
    take();
    const nv = d.type === 'check' ? input.checked : (d.type === 'range' || !d.type || d.num) ? parseFloat(input.value) : input.value;
    setProp(c, d.k, nv); if (out) out.textContent = d.fmt ? d.fmt(nv) : nv; dirty = true; markDirty();
    if (d.k === 'text') { const el = document.querySelector(`.clip[data-id="${c.id}"] .lbl`); if (el) el.textContent = clipLabel(c); }
    if (d.onInput) d.onInput(nv);
  });
  input.addEventListener('change', () => {
    if (pre != null && pre !== snapshot()) pushUndo(pre); pre = null;
    if (['speed', 'mode', 'c1', 'c2', 'fadeIn', 'fadeOut', 'volume', 'type', 'shape'].includes(d.k) || isKf) renderTimeline();
    if (d.onChange) d.onChange();
    if (d.rerender) renderInspector();
  });
  return wrap;
}
function sec(title, ...nodes) {
  const s = document.createElement('div'); s.className = 'sec';
  if (title) { const h = document.createElement('h3'); if (typeof title === 'string') h.textContent = title; else h.append(...title); s.appendChild(h); }
  nodes.flat().filter(Boolean).forEach(n => s.appendChild(n)); return s;
}
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function chipRow(items) {
  const row = el('<div class="chips"></div>');
  items.forEach(([label, on, fn, title]) => { const b = el(`<button class="chip"${on !== null ? ` aria-pressed="${!!on}"` : ''}${title ? ` title="${esc(title)}"` : ''}>${label}</button>`); b.onclick = fn; row.appendChild(b); });
  return row;
}
function kfSection(c) {
  const lt = localT(c), n = c.kf?.length || 0, on = !!kfAt(c, lt);
  const h3 = [document.createTextNode('Fotogramas clave'), el(`<span class="kf-ind"><i class="diamond${on ? ' on' : ''}"></i>${n}</span>`)];
  const btns = chipRow([
    [on ? 'Actualizar aquí' : 'Agregar en el cabezal', null, () => { pushUndo(); addKeyframe(c); renderTimeline(); renderInspector(); dirty = true; }],
    ['◀', null, () => { const p = (c.kf || []).filter(f => f.t < lt - .01).pop(); if (p) seek(c.start + p.t); }, 'Fotograma clave anterior'],
    ['▶', null, () => { const p = (c.kf || []).find(f => f.t > lt + .01); if (p) seek(c.start + p.t); }, 'Fotograma clave siguiente'],
    ['Quitar', null, () => { const f = kfAt(c, lt); if (!f) { toast('No hay un fotograma clave en el cabezal'); return; } pushUndo(); c.kf = c.kf.filter(x => x !== f); renderTimeline(); renderInspector(); dirty = true; }],
    ['Borrar todos', null, () => { if (!n) return; pushUndo(); const cur = evalProps(c, lt); kfKeysFor(c).forEach(k => c.props[k] = cur[k]); c.kf = []; renderTimeline(); renderInspector(); dirty = true; }],
  ]);
  const hint = el(`<p class="hint">${n ? 'Mové el cabezal y cambiá posición, escala, rotación u opacidad: se crea un fotograma clave solo.' : 'Agregá un fotograma clave, mové el cabezal y cambiá los valores para animar el clip.'}</p>`);
  return sec(h3, btns, hint);
}
function animSection(c, isText) {
  const inOpts = isText ? TEXT_IN : ANIM_IN, outOpts = isText ? TEXT_OUT : ANIM_OUT, loopOpts = isText ? TEXT_LOOPS : LOOPS;
  return [
    sec('Animación de entrada', ctl(c, { k: 'animIn', l: 'Tipo', type: 'select', opts: inOpts }), ctl(c, { k: 'animInDur', l: 'Duración', min: .1, max: 3, step: .05, fmt: secs })),
    sec('Animación de salida', ctl(c, { k: 'animOut', l: 'Tipo', type: 'select', opts: outOpts }), ctl(c, { k: 'animOutDur', l: 'Duración', min: .1, max: 3, step: .05, fmt: secs })),
    sec('Movimiento continuo', ctl(c, { k: 'loop', l: 'Tipo', type: 'select', opts: loopOpts })),
    kfSection(c),
  ];
}
function inspTabs(kind, tabs) {
  const cur = inspTab[kind] && tabs.includes(inspTab[kind]) ? inspTab[kind] : tabs[0];
  const bar = el('<div class="itabs" role="tablist"></div>');
  tabs.forEach(t => { const b = el(`<button class="itab" role="tab" aria-selected="${t === cur}">${t}</button>`); b.onclick = () => { inspTab[kind] = t; renderInspector(); }; bar.appendChild(b); });
  return [bar, cur];
}
function renderInspector() {
  const box = $('#inspector'), c = clipById(state.selected);
  const scroll = box.scrollTop;
  box.innerHTML = '';
  if (!c) {
    box.innerHTML = `<div class="ihead"><span class="kind">Proyecto</span><h2>${esc(state.name)}</h2><div class="meta">${state.W}×${state.H} · ${tc(totalDur())} · ${state.clips.length} clips</div></div>
    <div class="sec"><h3>Formato</h3><div class="chips" id="aspSeg">${Object.keys(ASPECTS).map(a => `<button class="chip" data-a="${a}" aria-pressed="${a === state.aspect}">${a}</button>`).join('')}</div></div>
    <div class="sec"><h3>Color del lienzo</h3><div class="f wide"><label for="pBg">Fondo</label><input type="color" id="pBg" value="${state.bg}"></div></div>
    <div class="sec"><h3>Atajos</h3><div class="keys"><kbd>Espacio</kbd><span>Reproducir / pausar</span><kbd>S</kbd><span>Dividir en el cabezal</span><kbd>F</kbd><span>Congelar fotograma</span><kbd>Supr</kbd><span>Eliminar clip</span><kbd>Ctrl Z</kbd><span>Deshacer</span><kbd>Ctrl C / V</kbd><span>Copiar y pegar clip</span><kbd>Ctrl D</kbd><span>Duplicar</span><kbd>← →</kbd><span>Mover un fotograma</span><kbd>+ −</kbd><span>Zoom de la línea de tiempo</span></div></div>
    <div class="sec"><h3>Cómo empezar</h3><p class="hint">Importá clips en Medios y arrastralos a la línea de tiempo. Tocá un clip para editarlo acá. En el visor podés mover textos y capas, y cambiar su tamaño con la rueda o el punto naranja.</p></div>`;
    box.querySelector('#aspSeg').addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) { setAspect(b.dataset.a); renderInspector(); } });
    box.querySelector('#pBg').addEventListener('input', e => { state.bg = e.target.value; dirty = true; markDirty(); });
    return;
  }
  const m = c.mediaId ? mediaById(c.mediaId) : null, cat = catOf(c);
  const kindName = c.kind === 'text' ? (c.name === 'Sticker' ? 'Sticker' : 'Texto') : c.kind === 'color' ? 'Fondo' : c.kind === 'shape' ? 'Forma' : cat === 'fx' ? 'Efecto' : cat === 'audio' ? 'Audio' : m?.type === 'image' ? 'Foto' : 'Video';
  const head = el(`<div class="ihead"><span class="kind">${kindName}</span><h2>${esc(clipLabel(c))}</h2><div class="meta">Inicio ${tc(c.start)} · Duración ${tc(c.dur)}</div></div>`);
  head.appendChild(chipRow([['Dividir', null, split], ['Duplicar', null, duplicate], ['Eliminar', null, del]]));
  box.appendChild(head);
  const add = (...n) => n.flat().filter(Boolean).forEach(x => box.appendChild(x));
  const durCtl = () => {
    const w = el(`<div class="f"><label for="f-dur">Duración</label><input type="number" id="f-dur" min="0.1" step="0.1" value="${c.dur.toFixed(2)}"><output>s</output></div>`);
    const i = w.querySelector('input');
    i.addEventListener('change', () => {
      let v = parseFloat(i.value); if (!(v > 0)) return;
      if (m && m.type !== 'image') v = Math.min(v, (m.duration - c.in) / (c.props.speed || 1));
      pushUndo(); c.dur = Math.max(.1, v); renderTimeline(); renderInspector(); dirty = true;
    });
    return w;
  };
  if (c.kind === 'text') {
    const [bar, t] = inspTabs('text', ['Texto', 'Estilo', 'Animación']); add(bar);
    if (t === 'Texto') add(
      sec('Contenido', ctl(c, { k: 'text', l: 'Texto', type: 'textarea' }), ctl(c, { k: 'font', l: 'Fuente', type: 'select', opts: FONTS }), ctl(c, { k: 'weight', l: 'Grosor', type: 'select', num: true, opts: [[400, 'Normal'], [600, 'Semi'], [700, 'Negrita'], [800, 'Extra'], [900, 'Black']] }),
        ctl(c, { k: 'size', l: 'Tamaño', min: .01, max: .4, step: .001, fmt: v => Math.round(v * 1000) / 10 }), ctl(c, { k: 'color', l: 'Color', type: 'color' }),
        ctl(c, { k: 'align', l: 'Alineación', type: 'select', opts: [['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']] }),
        ctl(c, { k: 'letterSpacing', l: 'Espaciado', min: -.1, max: .5, step: .005, fmt: v => (+v).toFixed(2) }), ctl(c, { k: 'lineHeight', l: 'Interlineado', min: .8, max: 2.5, step: .02, fmt: v => (+v).toFixed(2) }),
        chipRow([['<i>Cursiva</i>', c.props.italic, () => { pushUndo(); c.props.italic = !c.props.italic; dirty = true; renderInspector(); }], ['MAYÚSCULAS', c.props.upper, () => { pushUndo(); c.props.upper = !c.props.upper; dirty = true; renderInspector(); }]])),
      sec('Posición', ctl(c, D.x), ctl(c, D.y), ctl(c, D.rotation), ctl(c, D.opacity), durCtl()));
    if (t === 'Estilo') add(
      sec('Fondo', ctl(c, { k: 'box', l: 'Mostrar', type: 'check' }), ctl(c, { k: 'boxColor', l: 'Color', type: 'color' }), ctl(c, { k: 'boxAlpha', l: 'Opacidad', min: 0, max: 1, step: .01, fmt: pct })),
      sec('Contorno', ctl(c, { k: 'stroke', l: 'Grosor', min: 0, max: 30, step: .5 }), ctl(c, { k: 'strokeColor', l: 'Color', type: 'color' })),
      sec('Sombra y brillo', ctl(c, { k: 'shadow', l: 'Sombra', type: 'check' }), ctl(c, { k: 'glow', l: 'Neón', type: 'check' }), ctl(c, { k: 'glowColor', l: 'Color neón', type: 'color' })),
      sec('Mezcla', ctl(c, D.blend)), sec('Fundido', ctl(c, D.fadeIn), ctl(c, D.fadeOut)));
    if (t === 'Animación') add(animSection(c, true));
  } else if (c.kind === 'shape') {
    const [bar, t] = inspTabs('shape', ['Forma', 'Animación']); add(bar);
    if (t === 'Forma') add(
      sec('Forma', ctl(c, { k: 'shape', l: 'Tipo', type: 'select', opts: SHAPES }), ctl(c, { k: 'w', l: 'Ancho', min: .02, max: 2, step: .005, fmt: pct }), ctl(c, { k: 'h', l: 'Alto', min: .02, max: 2, step: .005, fmt: pct }), ctl(c, { k: 'radius', l: 'Redondeo', min: 0, max: .5, step: .01, fmt: pct })),
      sec('Relleno y borde', ctl(c, { k: 'fillOn', l: 'Relleno', type: 'check' }), ctl(c, { k: 'fill', l: 'Color', type: 'color' }), ctl(c, { k: 'strokeW', l: 'Borde', min: 0, max: 40, step: .5 }), ctl(c, { k: 'stroke', l: 'Color borde', type: 'color' })),
      sec('Transformar', ctl(c, D.x), ctl(c, D.y), ctl(c, D.scale), ctl(c, D.rotation), ctl(c, D.opacity), ctl(c, D.blend), durCtl()), sec('Fundido', ctl(c, D.fadeIn), ctl(c, D.fadeOut)));
    if (t === 'Animación') add(animSection(c, false));
  } else if (c.kind === 'color') {
    add(sec('Fondo', ctl(c, { k: 'mode', l: 'Tipo', type: 'select', opts: [['linear', 'Degradado'], ['radial', 'Radial'], ['solid', 'Sólido']] }), ctl(c, { k: 'c1', l: 'Color 1', type: 'color' }), ctl(c, { k: 'c2', l: 'Color 2', type: 'color' }), ctl(c, { k: 'angle', l: 'Ángulo', min: 0, max: 360, step: 1, fmt: deg }), ctl(c, { k: 'drift', l: 'Movimiento', type: 'check' }), ctl(c, D.opacity), durCtl()), sec('Fundido', ctl(c, D.fadeIn), ctl(c, D.fadeOut)));
  } else if (cat === 'fx') {
    add(sec('Efecto', ctl(c, { k: 'type', l: 'Tipo', type: 'select', opts: FX_LIST.map(f => [f[0], f[1]]) }), ctl(c, { k: 'intensity', l: 'Intensidad', min: 0, max: 1, step: .01, fmt: pct }), durCtl()), sec('Fundido', ctl(c, D.fadeIn), ctl(c, D.fadeOut)));
  } else if (cat === 'audio') {
    add(sec('Sonido', ctl(c, D.volume), ctl(c, D.speed), durCtl()), sec('Fundido de volumen', ctl(c, D.fadeIn), ctl(c, D.fadeOut)), kfSection(c));
  } else {
    const [bar, t] = inspTabs('media', ['Básico', 'Animación', 'Color', 'Más']); add(bar);
    if (t === 'Básico') {
      add(sec('Encuadre', ctl(c, { k: 'fit', l: 'Modo', type: 'select', opts: [['contain', 'Ajustar'], ['cover', 'Rellenar'], ['blurfill', 'Ajustar con fondo desenfocado']] }), ctl(c, D.scale), ctl(c, D.x), ctl(c, D.y), ctl(c, D.rotation), ctl(c, D.opacity),
        chipRow([['Voltear ↔', c.props.flipX, () => { pushUndo(); c.props.flipX = !c.props.flipX; dirty = true; renderInspector(); }], ['Voltear ↕', c.props.flipY, () => { pushUndo(); c.props.flipY = !c.props.flipY; dirty = true; renderInspector(); }], ['↻ 90°', null, () => { pushUndo(); setProp(c, 'rotation', (((evalProps(c, localT(c)).rotation + 90 + 180) % 360) + 360) % 360 - 180); dirty = true; renderInspector(); }], ['Centrar', null, () => { pushUndo(); setProp(c, 'x', .5); setProp(c, 'y', .5); dirty = true; renderInspector(); }]]),
        ctl(c, D.blend)));
      if (m?.type === 'video') add(sec('Velocidad y sonido', ctl(c, D.speed), chipRow([.5, 1, 1.5, 2, 3].map(v => [v + '×', c.props.speed === v, () => { pushUndo(); setProp(c, 'speed', v); renderTimeline(); renderInspector(); dirty = true; }])), ctl(c, D.volume)));
      add(sec('Duración', durCtl()), sec('Fundido', ctl(c, D.fadeIn), ctl(c, D.fadeOut)));
    }
    if (t === 'Animación') add(animSection(c, false));
    if (t === 'Color') {
      const fs = el('<div class="grid4"></div>');
      fs.innerHTML = Object.entries(FILTERS).map(([n, f]) => `<button class="filt${c.props.filter === n ? ' on' : ''}" data-f="${esc(n)}"><span style="${m?.thumb ? `background-image:url(${m.thumb});` : ''}filter:brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturate}%) sepia(${f.sepia}%) hue-rotate(${f.hue}deg) grayscale(${f.grayscale}%)"></span><em>${n}</em></button>`).join('');
      fs.addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) applyFilter(b.dataset.f); });
      add(sec('Filtros', fs), sec('Ajustes', ...ADJUST.map(d => ctl(c, d)), chipRow([['Restablecer', null, () => applyFilter('Original')]])));
    }
    if (t === 'Más') {
      add(sec('Recortar', ctl(c, { k: 'cropL', l: 'Izquierda', min: 0, max: .9, step: .005, fmt: pct }), ctl(c, { k: 'cropR', l: 'Derecha', min: 0, max: .9, step: .005, fmt: pct }), ctl(c, { k: 'cropT', l: 'Arriba', min: 0, max: .9, step: .005, fmt: pct }), ctl(c, { k: 'cropB', l: 'Abajo', min: 0, max: .9, step: .005, fmt: pct })),
        sec('Máscara', ctl(c, { k: 'mask', l: 'Forma', type: 'select', opts: MASKS })),
        sec('Pantalla verde (croma)', ctl(c, { k: 'chroma', l: 'Activar', type: 'check', onChange: () => { if (c.props.chroma) c.props.removeBg = false; renderInspector(); } }), ctl(c, { k: 'chromaColor', l: 'Color', type: 'color' }), ctl(c, { k: 'chromaTol', l: 'Tolerancia', min: .02, max: .8, step: .01, fmt: pct }), ctl(c, { k: 'chromaSoft', l: 'Suavizado', min: .01, max: .5, step: .01, fmt: pct })),
        sec('Quitar fondo con IA', ctl(c, { k: 'removeBg', l: 'Activar', type: 'check', onChange: () => { if (c.props.removeBg) { c.props.chroma = false; loadSegmenter(); } renderInspector(); } }), el('<p class="hint">Recorta personas automáticamente, sin pantalla verde. Gratis y en tu computadora. La primera vez descarga un modelo chico.</p>')));
      if (m?.type === 'video') add(sec('Herramientas', chipRow([['Congelar fotograma', null, freezeFrame], ['Separar audio', null, detachAudio]])));
    }
  }
  box.scrollTop = scroll;
}
$('#pname').addEventListener('input', () => { state.name = $('#pname').value; markDirty(); if (!state.selected) { const h = $('#inspector h2'); if (h) h.textContent = state.name; } });

/* =========================================================
   Guardado (IndexedDB)
   ========================================================= */
let db = null, saveTimer = null;
function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('corte', 1);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' }); if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs', { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function idb(store, mode, fn) {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, mode), req = fn(tx.objectStore(store));
    tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
  });
}
function markDirty() {
  if (!db || !state.id) return;
  $('#savedLbl').textContent = 'Guardando…';
  clearTimeout(saveTimer); saveTimer = setTimeout(saveProject, 900);
}
function projThumb() { try { const c = document.createElement('canvas'), s = 160 / Math.max(state.W, state.H); c.width = Math.round(state.W * s); c.height = Math.round(state.H * s); c.getContext('2d').drawImage(cv, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', .6); } catch (e) { return ''; } }
async function saveProject() {
  if (!db || !state.id || exporting) return;
  clearTimeout(saveTimer);
  try {
    const rec = { id: state.id, name: state.name, updated: Date.now(), aspect: state.aspect, bg: state.bg, tracks: state.tracks, clips: state.clips, media: state.media.filter(m => !m.loading).map(m => ({ id: m.id, name: m.name, type: m.type, duration: m.type === 'image' ? null : m.duration, w: m.w, h: m.h, thumb: m.thumb, wave: m.wave })), thumb: projThumb() };
    await idb('projects', 'readwrite', st => st.put(rec));
    $('#savedLbl').textContent = 'Guardado';
    try { localStorage.setItem('corte:last', state.id); } catch (e) {}
  } catch (e) { $('#savedLbl').textContent = 'No se pudo guardar'; }
}
function cleanupProject() {
  pause();
  for (const id of [...elMap.keys()]) disposeEl(id);
  keyCanvases.clear(); segCache.clear(); audioBufCache.clear();
  state.media.forEach(m => URL.revokeObjectURL(m.url));
  undoStack.length = 0; redoStack.length = 0;
}
async function loadProject(id) {
  if (!db) return false;
  const rec = await idb('projects', 'readonly', st => st.get(id));
  if (!rec) return false;
  cleanupProject();
  const media = [];
  for (const mm of rec.media || []) {
    const b = await idb('blobs', 'readonly', st => st.get(mm.id)).catch(() => null);
    if (!b) continue;
    const m = { ...mm, blob: b.blob, url: URL.createObjectURL(b.blob), loading: false };
    if (m.type === 'image') { m.duration = Infinity; const img = new Image(); img.src = m.url; try { await img.decode(); } catch (e) {} m.el = img; }
    media.push(m);
  }
  Object.assign(state, { id: rec.id, name: rec.name, aspect: rec.aspect || '16:9', bg: rec.bg || '#000000', tracks: rec.tracks?.length ? rec.tracks : defaultTracks(), media, selected: null, time: 0 });
  state.clips = (rec.clips || []).filter(c => c.kind !== 'media' || media.some(m => m.id === c.mediaId)).map(c => ({ kf: [], trans: null, ...c }));
  $('#pname').value = state.name; setAspect(state.aspect, true);
  renderAll(); $('#savedLbl').textContent = 'Guardado';
  try { localStorage.setItem('corte:last', state.id); } catch (e) {}
  return true;
}
function newProject(sample) {
  cleanupProject();
  Object.assign(state, { id: uid('p'), name: sample ? 'Mi primer video' : 'Proyecto sin título', aspect: '16:9', bg: '#000000', tracks: defaultTracks(), clips: [], media: [], selected: null, time: 0 });
  if (sample) {
    state.clips = [
      { id: uid('c'), kind: 'color', name: 'Atardecer', track: 'main', start: 0, dur: 7, in: 0, props: Object.assign(COLOR_BASE(), { c1: '#ff7a59', c2: '#6c2a86', angle: 35, fadeOut: .8 }), kf: [], trans: null },
      { id: uid('c'), kind: 'text', track: 'tx1', start: .3, dur: 3.4, in: 0, props: Object.assign(TEXT_BASE(), TEXT_PRESETS[0].p, { text: 'Tu historia\nempieza acá', y: .46 }), kf: [], trans: null },
      { id: uid('c'), kind: 'text', track: 'tx1', start: 3.9, dur: 2.9, in: 0, props: Object.assign(TEXT_BASE(), TEXT_PRESETS[1].p, { text: 'Importá tus clips y exportá sin marca de agua', y: .82 }), kf: [], trans: null },
      { id: uid('c'), kind: 'fx', track: 'fx1', start: 0, dur: 7, in: 0, props: Object.assign(FX_BASE(), { type: 'leak', intensity: .45 }), kf: [], trans: null },
      { id: uid('c'), kind: 'text', track: 'tx1', start: 4.2, dur: 2.4, in: 0, name: 'Sticker', props: Object.assign(TEXT_BASE(), { text: '🎬', size: .16, shadow: false, animIn: 'pop', loop: 'pulse', x: .5, y: .45 }), kf: [], trans: null },
    ];
  }
  $('#pname').value = state.name; setAspect('16:9', true);
  renderAll(); if (sample) seek(1.2);
  markDirty();
}
async function deleteProject(id) {
  const rec = await idb('projects', 'readonly', st => st.get(id));
  if (rec) for (const m of rec.media || []) await idb('blobs', 'readwrite', st => st.delete(m.id)).catch(() => {});
  await idb('projects', 'readwrite', st => st.delete(id));
}
async function renderProjects() {
  const list = $('#projList');
  if (!db) { list.innerHTML = '<p class="hint">Tu navegador no permite guardar proyectos (puede ser una ventana privada).</p>'; return; }
  await saveProject();
  const all = (await idb('projects', 'readonly', st => st.getAll())).sort((a, b) => b.updated - a.updated);
  list.innerHTML = all.map(p => `<div class="proj${p.id === state.id ? ' cur' : ''}">${p.thumb ? `<img src="${p.thumb}" alt="">` : '<span class="noimg"></span>'}<div class="pi"><b>${esc(p.name)}</b><span>${new Date(p.updated).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })} · ${(p.clips || []).length} clips</span></div>${p.id === state.id ? '<span class="hint">Abierto</span>' : `<button class="btn small" data-open="${p.id}">Abrir</button>`}<button class="btn small danger" data-del="${p.id}">Eliminar</button></div>`).join('') || '<p class="hint">No hay proyectos guardados.</p>';
}
$('#projectsBtn').onclick = () => { $('#projModal').hidden = false; renderProjects(); };
$('#projClose').onclick = () => $('#projModal').hidden = true;
$('#newProjBtn').onclick = async () => { await saveProject(); newProject(false); $('#projModal').hidden = true; toast('Proyecto nuevo creado'); };
$('#projList').addEventListener('click', async e => {
  const o = e.target.closest('[data-open]'), d = e.target.closest('[data-del]');
  if (o) { await saveProject(); const ok = await loadProject(o.dataset.open); $('#projModal').hidden = true; if (!ok) toast('No se pudo abrir el proyecto'); }
  if (d) {
    if (d.dataset.confirm !== '1') { d.dataset.confirm = '1'; d.textContent = '¿Seguro?'; setTimeout(() => { if (d.isConnected) { d.dataset.confirm = ''; d.textContent = 'Eliminar'; } }, 3000); return; }
    const id = d.dataset.del; await deleteProject(id);
    if (id === state.id) newProject(false);
    renderProjects();
  }
});

/* =========================================================
   Grabar voz, pantalla o cámara
   ========================================================= */
function pickType(list) { return list.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || ''; }
async function startRecording(kind) {
  if (recState) return;
  if (!navigator.mediaDevices) { toast('Tu navegador no permite grabar desde acá'); return; }
  let stream;
  try {
    if (kind === 'voice') stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    else if (kind === 'camera') stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
    else stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
  } catch (e) { toast(kind === 'voice' ? 'No se pudo usar el micrófono. Revisá los permisos del navegador.' : 'No se pudo empezar a grabar. Revisá los permisos del navegador.'); return; }
  const mime = kind === 'voice' ? pickType(['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) : pickType(['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']);
  let rec; try { rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); } catch (e) { stream.getTracks().forEach(t => t.stop()); toast('Tu navegador no puede grabar en este formato'); return; }
  const chunks = [], startAt = state.time, t0 = performance.now();
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = async () => {
    stream.getTracks().forEach(t => t.stop());
    const dur = (performance.now() - t0) / 1000;
    const type = rec.mimeType || mime || (kind === 'voice' ? 'audio/webm' : 'video/webm');
    const ext = type.includes('mp4') ? (kind === 'voice' ? 'm4a' : 'mp4') : 'webm';
    const label = { voice: 'voz', screen: 'pantalla', camera: 'camara' }[kind];
    const now = new Date();
    recState = null; renderTab();
    if (state.playing && kind === 'voice') pause();
    const m = await importOne(new File(chunks, `${label}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.${ext}`, { type: type.split(';')[0] }), dur);
    if (m && kind === 'voice') addMedia(m, null, startAt);
    if (m) toast(kind === 'voice' ? 'Voz agregada a la línea de tiempo' : 'Grabación lista en tu biblioteca');
  };
  stream.getVideoTracks()[0]?.addEventListener('ended', () => stopRecording());
  rec.start(250);
  recState = { kind, rec, t0 };
  if (kind === 'voice' && state.clips.length) play();
  renderTab();
  const iv = setInterval(() => { if (!recState) { clearInterval(iv); return; } const el = $('#recTime'); if (el) el.textContent = tcs((performance.now() - t0) / 1000); }, 250);
}
function stopRecording() { if (recState && recState.rec.state !== 'inactive') recState.rec.stop(); }

/* =========================================================
   Música y efectos de sonido generados
   ========================================================= */
const soundCache = new Map();
function encodeWav(buf) {
  const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
  const out = new ArrayBuffer(44 + len * ch * 2), v = new DataView(out);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, 36 + len * ch * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, len * ch * 2, true);
  const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  let o = 44; for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const s = clamp(data[c][i], -1, 1); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Blob([out], { type: 'audio/wav' });
}
function synthKit(ctx) {
  const out = ctx.createDynamicsCompressor(); out.threshold.value = -14; out.ratio.value = 4; out.connect(ctx.destination);
  const master = ctx.createGain(); master.gain.value = .8; master.connect(out);
  const nb = (dur) => { const b = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; };
  const env = (g, t0, a, peak, dur) => { g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(.0002, peak), t0 + a); g.gain.exponentialRampToValueAtTime(.0001, t0 + Math.max(a + .01, dur)); };
  const tone = (type, f, t0, dur, peak, { fEnd, a = .005, dest = master, detune = 0, lp } = {}) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t0); o.detune.value = detune;
    if (fEnd) o.frequency.exponentialRampToValueAtTime(fEnd, t0 + dur);
    const g = ctx.createGain(); env(g, t0, a, peak, dur);
    let node = o; if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); node = fl; }
    node.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + .05);
  };
  const noise = (t0, dur, peak, type, freq, { fEnd, q = 1, a = .003, dest = master } = {}) => {
    const s = ctx.createBufferSource(); s.buffer = nb(dur + .05);
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); if (fEnd) f.frequency.exponentialRampToValueAtTime(fEnd, t0 + dur); f.Q.value = q;
    const g = ctx.createGain(); env(g, t0, a, peak, dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t0); s.stop(t0 + dur + .05);
  };
  const kick = (t, p = 1) => { tone('sine', 150, t, .35, .9 * p, { fEnd: 42 }); noise(t, .02, .3 * p, 'highpass', 1500); };
  const snare = (t, p = 1) => { noise(t, .18, .45 * p, 'bandpass', 1900, { q: .7 }); tone('triangle', 190, t, .1, .3 * p, { fEnd: 140 }); };
  const hat = (t, p = 1) => noise(t, .045, .18 * p, 'highpass', 7500);
  const clap = (t, p = 1) => { for (let i = 0; i < 3; i++) noise(t + i * .012, .09, .3 * p, 'bandpass', 1400, { q: 1.2 }); };
  return { master, tone, noise, kick, snare, hat, clap };
}
const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
async function renderSound(name) {
  if (soundCache.has(name)) return soundCache.get(name);
  const isMusic = MUSIC_LIST.some(m => m[0] === name);
  const sr = 44100, len = isMusic ? 24 : ({ applause: 3.5, riser: 2.5, typing: 2.2, drum: 2.2, boom: 2, ding: 2, bell: 3 }[name] || 1.2);
  const off = new OfflineAudioContext(2, Math.ceil(sr * len), sr);
  const k = synthKit(off), { tone, noise } = k;
  switch (name) {
    case 'pop': tone('sine', 620, 0, .09, .8, { fEnd: 180 }); noise(0, .015, .3, 'highpass', 3000); break;
    case 'whoosh': { const s = off.createBufferSource(), b = off.createBuffer(1, sr, sr), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; s.buffer = b; const f = off.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4; f.frequency.setValueAtTime(300, 0); f.frequency.exponentialRampToValueAtTime(3200, .45); f.frequency.exponentialRampToValueAtTime(600, .9); const g = off.createGain(); g.gain.setValueAtTime(.0001, 0); g.gain.exponentialRampToValueAtTime(.9, .4); g.gain.exponentialRampToValueAtTime(.0001, .95); s.connect(f); f.connect(g); g.connect(k.master); s.start(0); break; }
    case 'swish': noise(0, .35, .7, 'bandpass', 5000, { fEnd: 900, q: 2 }); break;
    case 'ding': tone('sine', 1318.5, 0, 1.8, .6); tone('sine', 2637, 0, 1.2, .2); break;
    case 'bell': [523.25, 1046.5, 1569.8, 2093].forEach((f, i) => tone('sine', f, 0, 2.8 - i * .5, .35 / (i + 1))); break;
    case 'click': noise(0, .02, .7, 'highpass', 2500); tone('square', 1800, 0, .015, .2); break;
    case 'boom': tone('sine', 90, 0, 1.6, 1, { fEnd: 28 }); noise(0, 1.4, .6, 'lowpass', 900, { fEnd: 80 }); break;
    case 'coin': tone('square', 988, 0, .09, .25); tone('square', 1319, .08, .4, .25); break;
    case 'error': tone('square', 220, 0, .16, .25, { lp: 1800 }); tone('square', 175, .18, .3, .25, { lp: 1800 }); break;
    case 'notify': tone('sine', 880, 0, .25, .45); tone('sine', 1320, .14, .5, .45); break;
    case 'laser': tone('sawtooth', 1800, 0, .35, .35, { fEnd: 120, lp: 4000 }); break;
    case 'riser': { noise(0, 2.3, .5, 'bandpass', 200, { fEnd: 7000, q: 3, a: 2 }); tone('sawtooth', 110, 0, 2.3, .15, { fEnd: 880, a: 2, lp: 3000 }); break; }
    case 'shutter': noise(0, .05, .8, 'highpass', 1200); noise(.07, .06, .6, 'bandpass', 2400); break;
    case 'typing': for (let i = 0; i < 16; i++) noise(i * .12 + hash(i) * .05, .025, .4 + hash(i + 3) * .3, 'bandpass', 2500 + hash(i) * 2000, { q: 2 }); break;
    case 'applause': for (let i = 0; i < 320; i++) { const t = hash(i) * 3; noise(t, .05, .12 + hash(i + 1) * .15, 'bandpass', 1200 + hash(i + 2) * 2600, { q: 1.5 }); } break;
    case 'drum': for (let i = 0; i < 26; i++) k.snare(i * (.075 - i * .0012), .35 + i / 40); k.kick(1.95, 1); noise(1.95, .5, .5, 'highpass', 5000); break;
    case 'lofi': {
      const beat = 60 / 75, chords = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]];
      const pad = off.createGain(); pad.gain.value = .5; const lp = off.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; pad.connect(lp); lp.connect(k.master);
      for (let bar = 0; bar * 4 * beat < len; bar++) {
        const t0 = bar * 4 * beat, ch = chords[bar % 4];
        ch.forEach(n => tone('triangle', NOTE(n), t0, 4 * beat - .05, .12, { a: .25, dest: pad, detune: (hash(n + bar) - .5) * 14 }));
        tone('sine', NOTE(ch[0] - 12), t0, 2 * beat, .35, { a: .02 }); tone('sine', NOTE(ch[0] - 12), t0 + 2.5 * beat, 1.4 * beat, .3, { a: .02 });
        for (let b = 0; b < 4; b++) { const t = t0 + b * beat; if (b === 0 || b === 2) k.kick(t, .8); if (b === 2) k.kick(t + beat * .5, .5); if (b === 1 || b === 3) k.snare(t, .5); k.hat(t, .5); k.hat(t + beat * .5 + .03, .35); }
      }
      break;
    }
    case 'pulse': {
      const beat = .5, arp = [57, 60, 64, 69, 64, 60];
      for (let i = 0; i * beat < len; i++) { const t = i * beat; k.kick(t, .9); k.hat(t + beat / 2, .7); if (i % 2) k.clap(t, .5); }
      for (let i = 0; i * beat / 4 < len; i++) { const bar = Math.floor(i / 32), sh = [0, -4, 3, -2][bar % 4]; tone('sawtooth', NOTE(arp[i % arp.length] + sh), i * beat / 4, beat / 4, .1, { lp: 1600 + 800 * Math.sin(i / 20) }); }
      for (let bar = 0; bar * 4 * beat < len; bar++) { const sh = [0, -4, 3, -2][bar % 4]; tone('sawtooth', NOTE(45 + sh), bar * 4 * beat, 4 * beat - .05, .22, { lp: 400, a: .01 }); }
      break;
    }
    case 'calm': {
      const chords = [[60, 64, 67, 71], [57, 60, 64, 67], [65, 69, 72, 76], [62, 65, 69, 72]];
      for (let i = 0; i * 6 < len; i++) chords[i % 4].forEach((n, j) => tone('sine', NOTE(n), i * 6, 7, .1, { a: 2, detune: j * 3 }));
      for (let i = 0; i < 18; i++) { const t = hash(i) * (len - 2); tone('sine', NOTE(72 + [0, 2, 4, 7, 9, 12][Math.floor(hash(i + 9) * 6)]), t, 2.5, .08, { a: .01 }); }
      break;
    }
    case 'happy': {
      const beat = 60 / 104, chords = [[60, 64, 67], [67, 71, 74], [69, 72, 76], [65, 69, 72]];
      for (let bar = 0; bar * 4 * beat < len; bar++) {
        const t0 = bar * 4 * beat, ch = chords[bar % 4];
        for (let s = 0; s < 8; s++) { const t = t0 + s * beat / 2; ch.forEach((n, j) => tone('triangle', NOTE(n), t + j * .012, .28, .1, { a: .003 })); }
        tone('sine', NOTE(ch[0] - 24), t0, beat * 1.8, .35); tone('sine', NOTE(ch[0] - 17), t0 + 2 * beat, beat * 1.8, .3);
        for (let b = 0; b < 4; b++) { const t = t0 + b * beat; k.kick(t, b % 2 ? .4 : .7); if (b % 2) k.clap(t, .45); k.hat(t + beat / 2, .4); }
      }
      break;
    }
    case 'epic': {
      const beat = 60 / 90, roots = [45, 41, 48, 43];
      for (let bar = 0; bar * 4 * beat < len; bar++) {
        const t0 = bar * 4 * beat, r = roots[bar % 4];
        [0, 7, 12, 15, 19].forEach(iv => tone('sawtooth', NOTE(r + iv + (iv === 15 && bar % 4 === 2 ? 1 : 0)), t0, 4 * beat, .07, { a: .4, lp: 1200 }));
        tone('sine', NOTE(r - 12), t0, 4 * beat, .4, { a: .05 });
        k.kick(t0, 1); k.kick(t0 + beat * 1.5, .7); k.kick(t0 + beat * 2, 1); k.snare(t0 + beat * 3, .8);
        if (bar % 2) for (let i = 0; i < 4; i++) k.snare(t0 + 3 * beat + i * beat / 4, .3 + i * .1);
      }
      break;
    }
  }
  const buf = await off.startRendering();
  const blob = encodeWav(buf);
  soundCache.set(name, blob);
  return blob;
}
let previewAudio = null;
async function previewSound(name, btn) {
  if (previewAudio) { previewAudio.pause(); const was = previewAudio.dataset.name; previewAudio = null; if (was === name) return; }
  try {
    const blob = await renderSound(name);
    const a = new Audio(URL.createObjectURL(blob)); a.dataset.name = name; previewAudio = a;
    a.onended = () => { if (previewAudio === a) previewAudio = null; };
    await a.play();
  } catch (e) { toast('No se pudo reproducir el sonido'); }
}
async function addSound(name) {
  const label = (MUSIC_LIST.find(m => m[0] === name) || SFX_LIST.find(s => s[0] === name) || [0, name])[1];
  let m = state.media.find(x => x.genName === name);
  if (!m) {
    toast('Generando…', 1200);
    const blob = await renderSound(name);
    m = await importOne(new File([blob], `${label}.wav`, { type: 'audio/wav' }));
    if (!m) return; m.genName = name;
  }
  addMedia(m, null, state.time);
}

/* =========================================================
   Subtítulos
   ========================================================= */
const subClips = () => { const tr = state.tracks.find(t => t.role === 'subs'); return tr ? state.clips.filter(c => c.track === tr.id).sort((a, b) => a.start - b.start) : []; };
function capStyle() { return CAPTION_STYLES[+($('#capStyle')?.value || 0)] || CAPTION_STYLES[0]; }
function makeCaption(text, start, dur, style) {
  const tr = ensureTrack('text', 'subs');
  return { id: uid('c'), kind: 'text', track: tr.id, start, dur: Math.max(.3, dur), in: 0, props: Object.assign(TEXT_BASE(), style.p, { text }), kf: [], trans: null };
}
function addCaption() {
  pushUndo();
  const prev = subClips().slice(-1)[0];
  const style = prev ? { p: Object.fromEntries(Object.entries(prev.props).filter(([k]) => k !== 'text')) } : CAPTION_STYLES[0];
  pushClip(makeCaption('Nuevo subtítulo', state.time, 2.5, style));
  renderTab();
}
function wrapCaption(text, maxChars = 42) {
  const words = text.split(/\s+/); const lines = []; let cur = '';
  words.forEach(w => { if ((cur + ' ' + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
  if (cur) lines.push(cur);
  return lines.slice(0, 2).join('\n') + (lines.length > 2 ? '\n' + lines.slice(2).join(' ') : '');
}
function captionSource() {
  const sel = clipById(state.selected);
  if (sel && hasAudio(sel)) return sel;
  return state.clips.filter(c => hasAudio(c) && !(catOf(c) === 'visual' && c.props.volume === 0)).sort((a, b) => a.start - b.start)[0] || null;
}
function openCaptions() {
  const src = captionSource();
  if (!src) { toast('Primero agregá un video o audio con voz a la línea de tiempo'); return; }
  $('#capStyle').innerHTML = CAPTION_STYLES.map((s, i) => `<option value="${i}">${s.name}</option>`).join('');
  $('#capSource').textContent = `Se va a transcribir: ${mediaById(src.mediaId)?.name || 'clip'} (${tcs(src.dur)}).`;
  $('#capStatus').textContent = 'Todo se procesa en tu computadora. La primera vez descarga el modelo y después queda guardado.';
  $('#capGo').disabled = false;
  $('#capModal').hidden = false;
}
$('#capClose').onclick = () => $('#capModal').hidden = true;
$('#capGo').onclick = async () => {
  const src = captionSource(); if (!src) return;
  const m = mediaById(src.mediaId); if (!m?.blob) { toast('No encuentro el archivo original'); return; }
  const st = $('#capStatus'); $('#capGo').disabled = true;
  try {
    const ai = await import(new URL('ai.js', SCRIPT_BASE).href);
    const chunks = await ai.transcribe(m.blob, { language: $('#capLang').value, model: $('#capModel').value, onStatus: s => st.textContent = s });
    const sp = src.props.speed || 1, style = capStyle();
    const made = [];
    for (const ch of chunks) {
      if (ch.end <= src.in || ch.start >= src.in + src.dur * sp) continue;
      const s0 = Math.max(ch.start, src.in), e0 = Math.min(ch.end, src.in + src.dur * sp);
      const words = ch.text.split(/\s+/).filter(Boolean);
      const total = (e0 - s0) / sp, parts = Math.max(1, Math.ceil(total / 3.2), Math.ceil(words.length / 9));
      for (let i = 0; i < parts; i++) {
        const w = words.slice(Math.floor(i * words.length / parts), Math.floor((i + 1) * words.length / parts)); if (!w.length) continue;
        const st0 = src.start + (s0 - src.in) / sp + total * i / parts;
        made.push(makeCaption(wrapCaption(w.join(' ')), st0, total / parts, style));
      }
    }
    if (!made.length) { st.textContent = 'No se detectó voz en ese clip.'; $('#capGo').disabled = false; return; }
    pushUndo(); state.clips.push(...made);
    renderTimeline(); dirty = true; $('#capModal').hidden = true;
    curTab = 'subs'; $$('.rtab').forEach(x => x.setAttribute('aria-selected', x.dataset.tab === 'subs')); renderTab();
    toast(`Listo: ${made.length} subtítulos. Podés corregirlos en la lista.`);
  } catch (e) {
    console.error(e);
    st.textContent = 'No se pudo generar. Revisá tu conexión (la primera vez descarga el modelo) y probá con la precisión Rápida.';
    $('#capGo').disabled = false;
  }
};
function parseTime(s) { const m = s.trim().replace(',', '.').match(/(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)/); if (!m) return 0; return (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + parseFloat(m[3]); }
function parseSrt(txt) {
  const out = [];
  txt.replace(/\r/g, '').split(/\n\s*\n/).forEach(block => {
    const lines = block.split('\n').filter(l => l.trim() !== '');
    const i = lines.findIndex(l => l.includes('-->')); if (i < 0) return;
    const [a, b] = lines[i].split('-->');
    const text = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').trim();
    if (text) out.push({ start: parseTime(a), end: parseTime(b.split(' ').filter(Boolean)[0] || b), text });
  });
  return out;
}
$('#srtIn').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const items = parseSrt(await f.text());
  if (!items.length) { toast('No encontré subtítulos en ese archivo'); return; }
  pushUndo(); items.forEach(it => state.clips.push(makeCaption(it.text, it.start, it.end - it.start, CAPTION_STYLES[0])));
  renderTimeline(); renderTab(); dirty = true; toast(`${items.length} subtítulos importados`);
});
function srtTime(t) { const ms = Math.round((t % 1) * 1000); t = Math.floor(t); return `${pad(Math.floor(t / 3600))}:${pad(Math.floor(t / 60) % 60)}:${pad(t % 60)},${String(ms).padStart(3, '0')}`; }
function exportSrt() {
  let list = subClips(); if (!list.length) list = state.clips.filter(c => c.kind === 'text' && c.name !== 'Sticker').sort((a, b) => a.start - b.start);
  if (!list.length) { toast('No hay subtítulos para exportar'); return; }
  const srt = list.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.start + c.dur)}\n${c.props.text}\n`).join('\n');
  downloadBlob(new Blob([srt], { type: 'text/plain' }), `${safeName(state.name)}.srt`);
}

/* =========================================================
   Exportar
   ========================================================= */
let exporting = false, exportEnd = 0, rec = null, chunks = [], outBlob = null, outName = '';
function pickMime() { return pickType(['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']); }
function showExport(step) { ['expSetup', 'expRun', 'expDone'].forEach(id => $('#' + id).hidden = id !== step); $('#exportModal').hidden = false; }
$('#exportBtn').onclick = () => {
  const mime = pickMime();
  $('#expInfo').textContent = `Duración ${tcs(totalDur())} · formato ${mime.includes('mp4') ? 'MP4' : 'WebM'} · sin marca de agua.${mime.includes('mp4') ? '' : ' Para MP4 usá Chrome o Edge actualizados.'}`;
  showExport('expSetup');
};
$('#expCloseA').onclick = () => $('#exportModal').hidden = true;
$('#expSrt').onclick = exportSrt;
$('#expAudio').onclick = exportAudioWav;
$('#expGo').onclick = startExport;
async function startExport() {
  if (!state.clips.length) return;
  if (!window.MediaRecorder || !cv.captureStream) { toast('Este navegador no puede grabar video. Probá con Chrome, Edge o Firefox.'); return; }
  const q = +$('#expRes').value, fps = +$('#expFps').value, mbps = +$('#expQ').value;
  pause(); select(null); ensureAudio();
  try { await actx?.resume(); } catch (e) {}
  state.quality = q; applyDims();
  exportEnd = totalDur();
  seek(0); syncMedia(); render();
  await wait(600);
  const stream = cv.captureStream(fps);
  if (recDest) recDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  const mime = pickMime();
  const bps = mbps * 1e6 * Math.max(.5, (state.W * state.H) / (1280 * 720)) * (fps > 30 ? 1.4 : 1);
  try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: Math.round(bps) } : undefined); }
  catch (e) { toast('No se pudo iniciar la grabación en este navegador'); state.quality = 720; applyDims(); return; }
  chunks = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => onExported(new Blob(chunks, { type: (rec.mimeType || mime || 'video/webm').split(';')[0] }));
  showExport('expRun'); $('#expBar').style.width = '0';
  if (speaker) speaker.gain.value = 0;
  exporting = true; rec.start(250); play();
}
function restoreAfterExport() { exporting = false; if (speaker) speaker.gain.value = 1; state.quality = 720; applyDims(); }
function finishExport() { const r = rec; restoreAfterExport(); if (r && r.state !== 'inactive') r.stop(); }
function onExported(blob) {
  outBlob = blob;
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  outName = `${safeName(state.name)}.${ext}`;
  const v = $('#expVideo'); if (v.src) URL.revokeObjectURL(v.src); v.src = URL.createObjectURL(blob);
  $('#expMeta').textContent = `${outName} · ${dims(state.aspect, +$('#expRes').value).join('×')} · ${(blob.size / 1048576).toFixed(1)} MB · sin marca de agua`;
  $('#expStatus').textContent = '';
  showExport('expDone'); seek(0);
}
$('#expCancel').onclick = () => { const r = rec; if (r) r.onstop = null; restoreAfterExport(); if (r && r.state !== 'inactive') r.stop(); pause(); seek(0); $('#exportModal').hidden = true; toast('Exportación cancelada'); };
$('#expClose').onclick = () => { $('#expVideo').pause(); $('#exportModal').hidden = true; };
$('#expSave').onclick = () => { if (!outBlob) return; downloadBlob(outBlob, outName); $('#expStatus').textContent = 'Descarga iniciada. Revisá tu carpeta de descargas.'; };
async function decodeFor(m) {
  if (audioBufCache.has(m.id)) return audioBufCache.get(m.id);
  const p = (async () => { const buf = await m.blob.arrayBuffer(); return new OfflineAudioContext(2, 44100, 44100).decodeAudioData(buf); })();
  audioBufCache.set(m.id, p);
  try { return await p; } catch (e) { audioBufCache.delete(m.id); throw e; }
}
async function exportAudioWav() {
  const len = totalDur(); if (!len) return;
  const btn = $('#expAudio'); btn.disabled = true; btn.textContent = 'Mezclando…';
  try {
    const sr = 44100, off = new OfflineAudioContext(2, Math.ceil(len * sr), sr);
    let n = 0;
    for (const c of state.clips) {
      if (!hasAudio(c)) continue;
      if (trackById(c.track)?.muted) continue;
      const m = mediaById(c.mediaId); let buf; try { buf = await decodeFor(m); } catch (e) { continue; }
      const sp = c.props.speed || 1, src = off.createBufferSource(); src.buffer = buf; src.playbackRate.value = sp;
      const g = off.createGain(); src.connect(g); g.connect(off.destination);
      for (let tt = 0; tt <= c.dur + 1e-6; tt += .05) { const P = evalProps(c, Math.min(tt, c.dur)); g.gain.setValueAtTime(Math.max(0, (P.volume ?? 1) * env(c, Math.min(tt, c.dur))), c.start + tt); }
      src.start(c.start, c.in, c.dur * sp); n++;
    }
    if (!n) { toast('El proyecto no tiene audio'); return; }
    const out = await off.startRendering();
    downloadBlob(encodeWav(out), `${safeName(state.name)}-audio.wav`);
    toast('Audio exportado en WAV');
  } catch (e) { toast('No se pudo exportar el audio'); }
  finally { btn.disabled = false; btn.textContent = 'Solo audio'; }
}

/* =========================================================
   Inicio
   ========================================================= */
function renderAll() { renderTab(); renderTimeline(); renderInspector(); updateButtons(); dirty = true; }
renderAll(); applyDims();
Promise.all(['800 40px "Bricolage Grotesque"', '600 40px Figtree', '700 40px Figtree', '900 40px Figtree', '40px "Instrument Serif"', '500 40px "JetBrains Mono"', '40px Anton', '40px "Bebas Neue"', '40px Pacifico', '40px "Permanent Marker"'].map(f => document.fonts.load(f).catch(() => {}))).then(() => dirty = true);
requestAnimationFrame(t => { lastTs = t; requestAnimationFrame(tick); });
window.addEventListener('beforeunload', () => { if (db) saveProject(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && db) saveProject(); });
(async () => {
  try { db = await idbOpen(); navigator.storage?.persist?.().catch(() => {}); }
  catch (e) { db = null; $('#savedLbl').textContent = 'Sin guardado automático'; }
  let loaded = false;
  try { const last = localStorage.getItem('corte:last'); if (db && last) loaded = await loadProject(last); } catch (e) { loaded = false; }
  if (!loaded) newProject(true);
})();
window.__corte = { state, render, renderAll, newProject };
})();
