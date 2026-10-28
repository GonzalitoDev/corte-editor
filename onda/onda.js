/* Onda — editor de audio multipista. Todo el procesamiento se hace en JS en el navegador. */
'use strict';
const { $, $$, clamp, esc, uid, wait, el, toast, busy, download, pickFiles, loadScript, store, safeName } = T;
const LAME = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.all.js';
const RUL = 28, TH = 120, PAD = 6, HDR = 16;

/* ───────────── estado ───────────── */
const bufs = new Map();          // id -> { ch: Float32Array[], len }
const peaksCache = new Map();
let state = { v: 1, name: 'Sin título', sr: 44100, tracks: [] };
const ui = { active: null, pps: 60, tool: 'select', loop: false, pausedAt: null, playing: null, recording: null, clipboard: null };
let sel = { a: 0, b: 0, tr: [] };
const H = T.history(50);

const tlEl = $('#tl'), lanes = $('#lanes'), cv = $('#tlc'), g = cv.getContext('2d');
const fmt = (t, ms = true) => { t = Math.max(0, t); const m = Math.floor(t / 60), s = t - m * 60; return String(m).padStart(2, '0') + ':' + (ms ? s.toFixed(3).padStart(6, '0') : String(Math.floor(s)).padStart(2, '0')); };
const dbToG = d => Math.pow(10, d / 20), gToDb = v => 20 * Math.log10(Math.max(v, 1e-9));
const track = id => state.tracks.find(t => t.id === id);
const trackEnd = tr => tr.clips.reduce((m, c) => Math.max(m, c.start + c.dur), 0);
const projEnd = () => state.tracks.reduce((m, t) => Math.max(m, trackEnd(t)), 0);
const hasRange = () => sel.b - sel.a > 1e-4;
const selTracks = () => { const l = sel.tr.map(track).filter(Boolean); if (l.length) return l; const a = track(ui.active); return a ? [a] : []; };

function addBuf(ch) { const id = uid('b'); bufs.set(id, { ch, len: ch[0].length }); return id; }
function newTrack(name, at) {
  const t = { id: uid('t'), name: name || 'Pista ' + (state.tracks.length + 1), vol: 1, pan: 0, mute: false, solo: false, clips: [] };
  if (at == null) state.tracks.push(t); else state.tracks.splice(at, 0, t);
  ui.active = t.id; return t;
}
function newClip(buf, start, name) { const b = bufs.get(buf); return { id: uid('c'), buf, off: 0, dur: b.len / state.sr, start, gain: 1, fin: 0, fout: 0, name: name || '' }; }

/* ───────────── deshacer ───────────── */
const snap = () => JSON.stringify({ name: state.name, tracks: state.tracks, sel, active: ui.active });
function restore(s) {
  const o = JSON.parse(s); state.tracks = o.tracks; state.name = o.name; sel = o.sel; ui.active = o.active;
  $('#docName').value = state.name; changed(true);
}
function commit(fn) { const pre = snap(); const r = fn(); H.push(pre); changed(true); return r; }
function undo() { const s = H.undo(snap()); if (s) restore(s); else toast('No hay nada para deshacer'); }
function redo() { const s = H.redo(snap()); if (s) restore(s); }
function changed(struct) { if (struct) renderHeads(); updateUi(); requestDraw(); scheduleSave(); }

/* ───────────── edición de clips ───────────── */
const EPS = 1e-6;
function splitAt(tr, t) {
  for (const c of [...tr.clips]) {
    if (c.start < t - EPS && t < c.start + c.dur - EPS) {
      const d = t - c.start;
      tr.clips.push({ ...c, id: uid('c'), start: t, off: c.off + d, dur: c.dur - d, fin: 0, fout: Math.min(c.fout, c.dur - d) });
      c.dur = d; c.fout = 0; c.fin = Math.min(c.fin, d);
    }
  }
}
function removeRange(tr, a, b, ripple) {
  splitAt(tr, a); splitAt(tr, b);
  tr.clips = tr.clips.filter(c => !(c.start >= a - EPS && c.start + c.dur <= b + EPS));
  if (ripple) tr.clips.forEach(c => { if (c.start >= b - EPS) c.start -= b - a; });
}
function copyRange(tr, a, b) {
  const out = [];
  for (const c of tr.clips) {
    const s = Math.max(c.start, a), e = Math.min(c.start + c.dur, b);
    if (e - s > EPS) out.push({ ...c, id: uid('c'), start: s - a, off: c.off + (s - c.start), dur: e - s, fin: s === c.start ? Math.min(c.fin, e - s) : 0, fout: e === c.start + c.dur ? Math.min(c.fout, e - s) : 0 });
  }
  return out;
}
function insertGap(tr, t, len) { splitAt(tr, t); tr.clips.forEach(c => { if (c.start >= t - EPS) c.start += len; }); }

function needRange() { if (!hasRange()) { toast('Primero seleccioná un tramo arrastrando sobre la pista'); return false; } if (!selTracks().length) { toast('No hay pistas'); return false; } return true; }
function copySel(cut) {
  if (!needRange()) return;
  const { a, b } = sel, trs = selTracks();
  ui.clipboard = { len: b - a, tracks: trs.map(t => copyRange(t, a, b)) };
  if (cut) commit(() => { trs.forEach(t => removeRange(t, a, b, true)); sel = { a, b: a, tr: sel.tr }; });
  toast(cut ? 'Cortado' : 'Copiado');
}
function paste() {
  const cb = ui.clipboard; if (!cb) return toast('El portapapeles está vacío');
  commit(() => {
    const t0 = sel.a;
    if (!state.tracks.length) newTrack();
    let i = Math.max(0, state.tracks.findIndex(t => t.id === (selTracks()[0] || {}).id));
    const ids = [];
    cb.tracks.forEach(clips => {
      const tr = state.tracks[i] || newTrack(); i++;
      if (hasRange()) removeRange(tr, sel.a, sel.b, true);
      insertGap(tr, t0, cb.len);
      clips.forEach(c => tr.clips.push({ ...c, id: uid('c'), start: c.start + t0 }));
      ids.push(tr.id);
    });
    sel = { a: t0, b: t0 + cb.len, tr: ids };
  });
}
function delSel() { if (!needRange()) return; commit(() => { selTracks().forEach(t => removeRange(t, sel.a, sel.b, true)); sel.b = sel.a; }); }
function silenceSel() { if (!needRange()) return; commit(() => selTracks().forEach(t => removeRange(t, sel.a, sel.b, false))); }
function trimSel() { if (!needRange()) return; commit(() => selTracks().forEach(t => { removeRange(t, sel.b, Math.max(sel.b, trackEnd(t)) + 1, false); removeRange(t, 0, sel.a, false); })); }
function splitCmd() {
  const trs = selTracks(); if (!trs.length) return;
  commit(() => trs.forEach(t => { splitAt(t, sel.a); if (hasRange()) splitAt(t, sel.b); }));
  toast('Clip dividido');
}
function duplicate() {
  if (!needRange()) return;
  commit(() => { const ids = []; selTracks().forEach(t => { const cl = copyRange(t, sel.a, sel.b); const n = newTrack(t.name + ' (copia)', state.tracks.indexOf(t) + 1 + ids.length); cl.forEach(c => { c.start += sel.a; n.clips.push(c); }); ids.push(n.id); }); sel.tr = ids; });
}
function selectAll() { const e = projEnd(); sel = { a: 0, b: e, tr: state.tracks.map(t => t.id) }; changed(); }
function deselect() { sel = { a: sel.a, b: sel.a, tr: sel.tr }; changed(); }

/* ───────────── render de audio (mezcla en JS) ───────────── */
function envAt(c, t) { // ganancia del clip en tiempo de proyecto t
  const l = t - c.start; if (l < 0 || l > c.dur) return 0;
  let v = c.gain;
  if (c.fin > 0 && l < c.fin) v *= l / c.fin;
  if (c.fout > 0 && l > c.dur - c.fout) v *= (c.dur - l) / c.fout;
  return v;
}
function renderRange(tr, a, b, forceCh) {
  const sr = state.sr, n = Math.max(1, Math.round((b - a) * sr));
  let nch = forceCh || 1;
  if (!forceCh) for (const c of tr.clips) if (c.start < b && c.start + c.dur > a && bufs.get(c.buf)?.ch.length > 1) nch = 2;
  const out = Array.from({ length: nch }, () => new Float32Array(n));
  for (const c of tr.clips) {
    const B = bufs.get(c.buf); if (!B) continue;
    const s = Math.max(c.start, a), e = Math.min(c.start + c.dur, b); if (e <= s) continue;
    const o0 = Math.round((s - a) * sr), o1 = Math.min(n, Math.round((e - a) * sr));
    const src0 = Math.round((c.off + (s - c.start)) * sr);
    const simple = c.fin === 0 && c.fout === 0;
    for (let ch = 0; ch < nch; ch++) {
      const S = B.ch[Math.min(ch, B.ch.length - 1)], O = out[ch];
      for (let i = o0; i < o1; i++) {
        const si = src0 + i - o0; if (si >= S.length) break;
        O[i] += S[si] * (simple ? c.gain : envAt(c, a + i / sr));
      }
    }
  }
  return out;
}
function audible(tr) { const solo = state.tracks.some(t => t.solo); return !tr.mute && (!solo || tr.solo); }
function panGains(p) { const x = (p <= 0 ? p + 1 : p) * Math.PI / 2; return [Math.cos(x), Math.sin(x)]; }
function mixdown(a, b) {
  const n = Math.max(1, Math.round((b - a) * state.sr)), L = new Float32Array(n), R = new Float32Array(n);
  for (const tr of state.tracks) {
    if (!audible(tr) || !tr.clips.length) continue;
    const [l, r] = renderRange(tr, a, b, 2), [gl, gr] = panGains(tr.pan), v = tr.vol;
    for (let i = 0; i < n; i++) {
      let x = l[i] * v, y = r[i] * v;
      if (tr.pan <= 0) { L[i] += x + y * gl; R[i] += y * gr; } else { L[i] += x * gl; R[i] += y + x * gr; }
    }
  }
  return [L, R];
}

/* ───────────── DSP ───────────── */
function biquad(x, sr, type, f, Q = 0.707, gdb = 0) {
  const A = Math.pow(10, gdb / 40), w = 2 * Math.PI * clamp(f, 10, sr / 2 - 10) / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * Q);
  let b0, b1, b2, a0, a1, a2; const sA = 2 * Math.sqrt(A) * (sn / 2) * Math.SQRT2;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
  else if (type === 'ls') { b0 = A * ((A + 1) - (A - 1) * cs + sA); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - sA); a0 = (A + 1) + (A - 1) * cs + sA; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - sA; }
  else { b0 = A * ((A + 1) + (A - 1) * cs + sA); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - sA); a0 = (A + 1) - (A - 1) * cs + sA; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - sA; }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const xi = x[i], y = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = xi; y2 = y1; y1 = y; x[i] = y; }
  return x;
}
function fft(re, im, inv) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = 2 * Math.PI / len * (inv ? 1 : -1), wr0 = Math.cos(ang), wi0 = Math.sin(ang), h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let wr = 1, wi = 0;
      for (let j = 0; j < h; j++) {
        const a = i + j, b = a + h, vr = re[b] * wr - im[b] * wi, vi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - vr; im[b] = im[a] - vi; re[a] += vr; im[a] += vi;
        const t = wr * wr0 - wi * wi0; wi = wr * wi0 + wi * wr0; wr = t;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
const FN = 2048, HOP = 512;
const HANN = (() => { const w = new Float32Array(FN); for (let i = 0; i < FN; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / FN); return w; })();
function spectra(x, each) { // recorre cuadros con ventana; each(re, im, pos)
  const re = new Float64Array(FN), im = new Float64Array(FN);
  for (let p = -FN + HOP; p < x.length; p += HOP) {
    for (let i = 0; i < FN; i++) { const k = p + i; re[i] = (k >= 0 && k < x.length ? x[k] : 0) * HANN[i]; im[i] = 0; }
    fft(re, im, false); each(re, im, p);
  }
}
function noiseProfile(x) { // magnitud media por banda; si no se pasa un tramo de ruido, usa el 10% de cuadros más silenciosos
  const frames = [];
  spectra(x, (re, im) => { const m = new Float32Array(FN / 2 + 1); let e = 0; for (let k = 0; k <= FN / 2; k++) { m[k] = Math.hypot(re[k], im[k]); e += m[k]; } frames.push([e, m]); });
  return frames;
}
function avgProfile(frames, frac) {
  frames.sort((p, q) => p[0] - q[0]); const use = frames.slice(0, Math.max(1, Math.floor(frames.length * frac)));
  const out = new Float32Array(FN / 2 + 1); use.forEach(([, m]) => { for (let k = 0; k < out.length; k++) out[k] += m[k] / use.length; }); return out;
}
let NOISE = null;
function denoise(x, prof, redDb, sens) {
  const floor = dbToG(-redDb), out = new Float32Array(x.length + FN), nb = FN / 2 + 1, gPrev = new Float32Array(nb).fill(1), gk = new Float32Array(nb);
  spectra(x, (re, im, p) => {
    for (let k = 0; k < nb; k++) { const m = Math.hypot(re[k], im[k]) + 1e-12; gk[k] = clamp((m - sens * prof[k]) / m, floor, 1); }
    for (let k = 0; k < nb; k++) { const s = (gk[Math.max(0, k - 1)] + gk[k] * 2 + gk[Math.min(nb - 1, k + 1)]) / 4; const v = Math.max(s, gPrev[k] * 0.6, floor); gPrev[k] = v; re[k] *= v; im[k] *= v; if (k > 0 && k < FN / 2) { re[FN - k] *= v; im[FN - k] *= v; } }
    fft(re, im, true);
    for (let i = 0; i < FN; i++) { const k = p + i; if (k >= 0 && k < x.length) out[k] += re[i] * HANN[i] / 1.5; }
  });
  return out.subarray(0, x.length);
}
const peakOf = chs => { let p = 0; for (const c of chs) for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > p) p = v; } return p; };
const mapCh = (chs, fn) => chs.map((c, i) => fn(Float32Array.from(c), i));
function freeverb(chs, sr, room, damp, wet) {
  const sc = sr / 44100, combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], aps = [556, 441, 341, 225];
  const inL = chs[0], inR = chs[1] || chs[0], n = inL.length, out = [new Float32Array(n), new Float32Array(n)], fb = 0.7 + room * 0.28;
  for (let side = 0; side < 2; side++) {
    const sp = side ? 23 : 0, cb = combs.map(l => ({ b: new Float32Array(Math.round((l + sp) * sc)), i: 0, f: 0 })), ab = aps.map(l => ({ b: new Float32Array(Math.round((l + sp) * sc)), i: 0 }));
    const O = out[side];
    for (let i = 0; i < n; i++) {
      const x = (inL[i] + inR[i]) * 0.015; let s = 0;
      for (const c of cb) { const y = c.b[c.i]; c.f = y * (1 - damp) + c.f * damp; c.b[c.i] = x + c.f * fb; if (++c.i >= c.b.length) c.i = 0; s += y; }
      for (const a of ab) { const bo = a.b[a.i], y = -s + bo; a.b[a.i] = s + bo * 0.5; if (++a.i >= a.b.length) a.i = 0; s = y; }
      O[i] = s;
    }
  }
  const dry = 1 - wet * 0.5;
  return out.map((O, k) => { const I = k ? inR : inL; for (let i = 0; i < n; i++) O[i] = I[i] * dry + O[i] * wet * 3; return O; });
}
function resample(x, f) { const n = Math.max(1, Math.floor(x.length / f)), o = new Float32Array(n); for (let i = 0; i < n; i++) { const p = i * f, k = Math.floor(p), t = p - k; o[i] = (x[k] || 0) * (1 - t) + (x[k + 1] ?? x[k] ?? 0) * t; } return o; }
function envFollow(chs, sr, atkMs, relMs, fn) {
  const n = chs[0].length, at = Math.exp(-1 / (sr * atkMs / 1000)), rl = Math.exp(-1 / (sr * relMs / 1000)); let env = 0;
  for (let i = 0; i < n; i++) { let l = 0; for (const c of chs) { const v = Math.abs(c[i]); if (v > l) l = v; } env = l > env ? l + at * (env - l) : l + rl * (env - l); const gv = fn(env, i); for (const c of chs) c[i] *= gv; }
  return chs;
}
const EQ_PRESETS = {
  plano: { bass: 0, mid: 0, treble: 0, hp: 0, lp: 20000 }, graves: { bass: 8, mid: 0, treble: 0, hp: 0, lp: 20000 },
  voz: { bass: -3, mid: 3, treble: 4, hp: 90, lp: 20000 }, brillo: { bass: 0, mid: 0, treble: 7, hp: 0, lp: 20000 },
  telefono: { bass: 0, mid: 6, treble: 0, hp: 400, lp: 3200 }, radio: { bass: -6, mid: 8, treble: -4, hp: 250, lp: 5000 },
  sinGraves: { bass: 0, mid: 0, treble: 0, hp: 150, lp: 20000 }, apagado: { bass: 0, mid: 0, treble: -12, hp: 0, lp: 3000 },
};

/* Cada efecto: params (para el diálogo) y run(chs, sr, p) -> canales nuevos (puede cambiar la duración) */
const FX = {
  amplify: { name: 'Amplificar', params: [{ k: 'db', label: 'Ganancia', min: -24, max: 24, step: .1, def: i => +clamp(gToDb(0.98 / Math.max(i.peak, 1e-6)), -24, 24).toFixed(1), u: 'dB' }], run: (c, sr, p) => mapCh(c, x => { const k = dbToG(p.db); for (let i = 0; i < x.length; i++) x[i] *= k; return x; }) },
  normalize: { name: 'Normalizar', params: [{ k: 'db', label: 'Pico', min: -12, max: 0, step: .1, def: -1, u: 'dB' }, { k: 'dc', label: 'Quitar DC', type: 'select', options: [['1', 'Sí'], ['0', 'No']], def: '1' }],
    run: (c, sr, p) => { const o = mapCh(c, x => { if (p.dc === '1') { let m = 0; for (const v of x) m += v; m /= x.length; for (let i = 0; i < x.length; i++) x[i] -= m; } return x; }); const pk = peakOf(o); if (pk < 1e-6) return o; const k = dbToG(p.db) / pk; o.forEach(x => { for (let i = 0; i < x.length; i++) x[i] *= k; }); return o; } },
  fadein: { name: 'Fundido de entrada', run: c => mapCh(c, x => { const n = x.length; for (let i = 0; i < n; i++) x[i] *= i / n; return x; }) },
  fadeout: { name: 'Fundido de salida', run: c => mapCh(c, x => { const n = x.length; for (let i = 0; i < n; i++) x[i] *= (n - i) / n; return x; }) },
  eq: { name: 'Ecualizador', presets: EQ_PRESETS, params: [
    { k: 'preset', label: 'Preajuste', type: 'select', options: [['plano', 'Plano'], ['graves', 'Refuerzo de graves'], ['voz', 'Voz clara'], ['brillo', 'Más brillo'], ['telefono', 'Teléfono'], ['radio', 'Radio antigua'], ['sinGraves', 'Quitar graves'], ['apagado', 'Apagado (sin agudos)']], def: 'voz' },
    { k: 'bass', label: 'Graves', min: -15, max: 15, step: .5, def: -3, u: 'dB' }, { k: 'mid', label: 'Medios', min: -15, max: 15, step: .5, def: 3, u: 'dB' }, { k: 'treble', label: 'Agudos', min: -15, max: 15, step: .5, def: 4, u: 'dB' },
    { k: 'hp', label: 'Corte bajo', min: 0, max: 1000, step: 10, def: 90, u: 'Hz' }, { k: 'lp', label: 'Corte alto', min: 1000, max: 20000, step: 100, def: 20000, u: 'Hz' }],
    run: (c, sr, p) => mapCh(c, x => { if (p.bass) biquad(x, sr, 'ls', 200, .707, p.bass); if (p.mid) biquad(x, sr, 'peak', 1000, .9, p.mid); if (p.treble) biquad(x, sr, 'hs', 4000, .707, p.treble); if (p.hp > 0) { biquad(x, sr, 'hp', p.hp); biquad(x, sr, 'hp', p.hp); } if (p.lp < 19900) { biquad(x, sr, 'lp', p.lp); biquad(x, sr, 'lp', p.lp); } return x; }) },
  compressor: { name: 'Compresor', params: [{ k: 'thr', label: 'Umbral', min: -60, max: 0, step: 1, def: -20, u: 'dB' }, { k: 'ratio', label: 'Relación', min: 1, max: 20, step: .5, def: 4, u: ':1' }, { k: 'atk', label: 'Ataque', min: 1, max: 200, step: 1, def: 10, u: 'ms' }, { k: 'rel', label: 'Liberación', min: 10, max: 1000, step: 10, def: 150, u: 'ms' }, { k: 'mk', label: 'Ganancia', min: 0, max: 24, step: .5, def: 6, u: 'dB' }],
    run: (c, sr, p) => envFollow(c.map(x => Float32Array.from(x)), sr, p.atk, p.rel, env => { const over = gToDb(env) - p.thr; return dbToG((over > 0 ? -over * (1 - 1 / p.ratio) : 0) + p.mk); }) },
  denoise: { name: 'Reducción de ruido', params: [{ k: 'red', label: 'Reducción', min: 0, max: 40, step: 1, def: 15, u: 'dB' }, { k: 'sens', label: 'Sensibilidad', min: 1, max: 4, step: .1, def: 2, u: '×' }],
    note: 'Para mejores resultados, primero seleccioná un tramo donde solo haya ruido y tocá “Capturar perfil”. Si no, Onda lo estima con las partes más silenciosas.', extra: 'Capturar perfil',
    run: (c, sr, p) => c.map(x => denoise(x, NOISE || avgProfile(noiseProfile(x), 0.1), p.red, p.sens)) },
  gate: { name: 'Puerta de ruido', params: [{ k: 'thr', label: 'Umbral', min: -80, max: 0, step: 1, def: -45, u: 'dB' }, { k: 'floor', label: 'Atenuar', min: -80, max: 0, step: 1, def: -60, u: 'dB' }, { k: 'atk', label: 'Ataque', min: 1, max: 100, step: 1, def: 5, u: 'ms' }, { k: 'rel', label: 'Liberación', min: 10, max: 1000, step: 10, def: 150, u: 'ms' }],
    run: (c, sr, p) => { let gv = 1; const f = dbToG(p.floor), t = dbToG(p.thr), k = Math.exp(-1 / (sr * 0.005)); return envFollow(c.map(x => Float32Array.from(x)), sr, p.atk, p.rel, env => { const tg = env > t ? 1 : f; gv = tg + k * (gv - tg); return gv; }); } },
  desilence: { name: 'Quitar silencios', params: [{ k: 'thr', label: 'Umbral', min: -70, max: -10, step: 1, def: -45, u: 'dB' }, { k: 'min', label: 'Silencio mín.', min: .1, max: 3, step: .05, def: .5, u: 's' }, { k: 'keep', label: 'Dejar', min: 0, max: 1, step: .05, def: .15, u: 's' }],
    run: (c, sr, p) => {
      const w = Math.round(sr * 0.01), n = c[0].length, nw = Math.ceil(n / w), t = dbToG(p.thr), quiet = new Uint8Array(nw);
      for (let j = 0; j < nw; j++) { let s = 0, m = 0; for (let i = j * w; i < Math.min(n, (j + 1) * w); i++) for (const x of c) { s += x[i] * x[i]; m++; } quiet[j] = Math.sqrt(s / Math.max(1, m)) < t ? 1 : 0; }
      const cuts = []; const mw = Math.round(p.min / 0.01), kw = Math.round(p.keep / 0.01);
      for (let j = 0; j < nw;) { if (!quiet[j]) { j++; continue; } let e = j; while (e < nw && quiet[e]) e++; if (e - j >= mw) { const a = (j === 0 ? 0 : j + kw), b = (e === nw ? nw : e - kw); if (b > a) cuts.push([a * w, Math.min(n, b * w)]); } j = e; }
      if (!cuts.length) return c.map(x => Float32Array.from(x));
      const total = n - cuts.reduce((s, [a, b]) => s + b - a, 0);
      return c.map(x => { const o = new Float32Array(Math.max(1, total)); let pos = 0, last = 0; for (const [a, b] of cuts) { o.set(x.subarray(last, a), pos); pos += a - last; last = b; } o.set(x.subarray(last), pos); return o; });
    } },
  echo: { name: 'Eco', params: [{ k: 'ms', label: 'Retardo', min: 20, max: 2000, step: 10, def: 350, u: 'ms' }, { k: 'fb', label: 'Repeticiones', min: 0, max: .9, step: .01, def: .45 }, { k: 'mix', label: 'Mezcla', min: 0, max: 1, step: .01, def: .5 }],
    run: (c, sr, p) => mapCh(c, x => { const d = Math.round(sr * p.ms / 1000), w = new Float32Array(x.length); for (let i = d; i < x.length; i++) w[i] = x[i - d] + p.fb * w[i - d]; for (let i = 0; i < x.length; i++) x[i] += p.mix * w[i]; return x; }) },
  reverb: { name: 'Reverberación', params: [{ k: 'room', label: 'Sala', min: 0, max: 1, step: .01, def: .7 }, { k: 'damp', label: 'Apagado', min: 0, max: 1, step: .01, def: .4 }, { k: 'wet', label: 'Mezcla', min: 0, max: 1, step: .01, def: .35 }],
    run: (c, sr, p) => freeverb(c, sr, p.room, p.damp, p.wet) },
  distortion: { name: 'Distorsión', params: [{ k: 'drive', label: 'Saturación', min: 1, max: 50, step: .5, def: 8 }, { k: 'mix', label: 'Mezcla', min: 0, max: 1, step: .01, def: 1 }, { k: 'out', label: 'Salida', min: -24, max: 0, step: .5, def: -6, u: 'dB' }],
    run: (c, sr, p) => mapCh(c, x => { const n = Math.tanh(p.drive), o = dbToG(p.out); for (let i = 0; i < x.length; i++) x[i] = o * (x[i] * (1 - p.mix) + p.mix * Math.tanh(p.drive * x[i]) / n); return x; }) },
  speed: { name: 'Velocidad', note: 'Cambia la velocidad y el tono a la vez, como un disco.', params: [{ k: 'pct', label: 'Velocidad', min: 25, max: 300, step: 1, def: 125, u: '%' }], run: (c, sr, p) => c.map(x => resample(x, p.pct / 100)) },
  reverse: { name: 'Al revés', run: c => mapCh(c, x => x.reverse()) },
  invert: { name: 'Invertir fase', run: c => mapCh(c, x => { for (let i = 0; i < x.length; i++) x[i] = -x[i]; return x; }) },
  mono: { name: 'Mono', run: c => { if (c.length < 2) return [Float32Array.from(c[0])]; const o = new Float32Array(c[0].length); for (let i = 0; i < o.length; i++) o[i] = (c[0][i] + c[1][i]) / 2; return [o]; } },
};

/* Rangos sobre los que actúa un efecto: la selección, o cada clip completo de las pistas elegidas */
function fxTargets() {
  const out = [];
  for (const tr of selTracks()) {
    if (hasRange()) out.push({ tr, a: sel.a, b: sel.b });
    else [...tr.clips].sort((p, q) => p.start - q.start).forEach(c => out.push({ tr, a: c.start, b: c.start + c.dur, clip: c }));
  }
  return out.filter(t => t.tr.clips.some(c => c.start < t.b && c.start + c.dur > t.a));
}
function applyFx(key, p = {}) {
  const fx = FX[key], tg = fxTargets();
  if (!tg.length) return toast('No hay audio para procesar. Importá o grabá algo primero.');
  commit(() => {
    let newB = sel.b;
    // de derecha a izquierda para que los corrimientos no afecten los rangos pendientes
    tg.sort((p, q) => q.a - p.a).forEach(({ tr, a, b, clip }) => {
      const out = fx.run(renderRange(tr, a, b), state.sr, p), nl = out[0].length / state.sr, delta = nl - (b - a);
      const name = clip ? clip.name : (tr.clips.find(c => c.start < b && c.start + c.dur > a) || {}).name;
      removeRange(tr, a, b, false);
      if (Math.abs(delta) > EPS) tr.clips.forEach(c => { if (c.start >= b - EPS) c.start += delta; });
      tr.clips.push({ ...newClip(addBuf(out), a, name) });
      if (hasRange()) newB = a + nl;
    });
    if (hasRange()) sel.b = newB;
  });
  toast(fx.name + ' aplicado');
}

/* ───────────── generadores ───────────── */
function synth(kind, p, sr) {
  const n = Math.max(1, Math.round(p.dur * sr)), x = new Float32Array(n);
  if (kind === 'tone') {
    for (let i = 0; i < n; i++) { const ph = (i * p.freq / sr) % 1; let v;
      if (p.wave === 'square') v = ph < .5 ? 1 : -1; else if (p.wave === 'saw') v = 2 * ph - 1; else if (p.wave === 'tri') v = 1 - 4 * Math.abs(ph - .5); else v = Math.sin(2 * Math.PI * ph);
      x[i] = v * p.amp; }
  } else if (kind === 'noise') {
    let b0 = 0, b1 = 0, b2 = 0, br = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; let v = w;
      if (p.color === 'pink') { b0 = .99765 * b0 + w * .099046; b1 = .963 * b1 + w * .2965164; b2 = .57 * b2 + w * 1.0526913; v = (b0 + b1 + b2 + w * .1848) * .2; }
      else if (p.color === 'brown') { br = (br + .02 * w) / 1.02; v = br * 3.5; }
      x[i] = v * p.amp; }
  } else if (kind === 'click') {
    const beat = 60 / p.bpm;
    for (let k = 0; k * beat < p.dur; k++) { const s0 = Math.round(k * beat * sr), f = k % p.bar === 0 ? 1500 : 1000; for (let i = 0; i < sr * .04 && s0 + i < n; i++) x[s0 + i] = Math.sin(2 * Math.PI * f * i / sr) * Math.exp(-i / (sr * .008)) * p.amp; }
  }
  const e = Math.min(n >> 1, Math.round(sr * .005)); if (kind !== 'silence' && kind !== 'click') for (let i = 0; i < e; i++) { x[i] *= i / e; x[n - 1 - i] *= i / e; }
  return [x];
}
const GEN = {
  tone: { name: 'Tono', params: [{ k: 'wave', label: 'Forma', type: 'select', options: [['sine', 'Senoidal'], ['square', 'Cuadrada'], ['saw', 'Diente de sierra'], ['tri', 'Triangular']], def: 'sine' }, { k: 'freq', label: 'Frecuencia', min: 20, max: 8000, step: 1, def: 440, u: 'Hz' }, { k: 'amp', label: 'Volumen', min: 0, max: 1, step: .01, def: .5 }, { k: 'dur', label: 'Duración', min: .1, max: 60, step: .1, def: 3, u: 's' }] },
  noise: { name: 'Ruido', params: [{ k: 'color', label: 'Tipo', type: 'select', options: [['white', 'Blanco'], ['pink', 'Rosa'], ['brown', 'Marrón']], def: 'pink' }, { k: 'amp', label: 'Volumen', min: 0, max: 1, step: .01, def: .4 }, { k: 'dur', label: 'Duración', min: .1, max: 60, step: .1, def: 5, u: 's' }] },
  silence: { name: 'Silencio', params: [{ k: 'dur', label: 'Duración', min: .1, max: 60, step: .1, def: 2, u: 's' }] },
  click: { name: 'Metrónomo', params: [{ k: 'bpm', label: 'Tempo', min: 30, max: 240, step: 1, def: 120, u: 'bpm' }, { k: 'bar', label: 'Compás', min: 2, max: 7, step: 1, def: 4, u: '/4' }, { k: 'amp', label: 'Volumen', min: 0, max: 1, step: .01, def: .7 }, { k: 'dur', label: 'Duración', min: 1, max: 300, step: 1, def: 16, u: 's' }] },
};
function generate(kind, p) {
  commit(() => {
    let tr = selTracks()[0]; if (!tr) tr = newTrack();
    const t0 = sel.a, ch = synth(kind, p, state.sr), len = ch[0].length / state.sr;
    if (hasRange()) removeRange(tr, sel.a, sel.b, true);
    insertGap(tr, t0, len);
    if (kind !== 'silence') tr.clips.push(newClip(addBuf(ch), t0, GEN[kind].name));
    sel = { a: t0, b: t0 + len, tr: [tr.id] };
  });
}

/* ───────────── diálogos ───────────── */
function openDialog(html) { $('#dlgBody').innerHTML = html; $('#dlg').hidden = false; }
function closeDialog() { stopPreview(); $('#dlg').hidden = true; const n = $('#dlgBody').cloneNode(false); $('#dlgBody').replaceWith(n); }
function paramForm(params, info) {
  return params.map(p => {
    const v = typeof p.def === 'function' ? p.def(info) : p.def;
    if (p.type === 'select') return `<div class="f wide"><label for="p_${p.k}">${p.label}</label><select id="p_${p.k}" data-k="${p.k}">${p.options.map(([k, l]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
    return `<div class="f"><label for="p_${p.k}">${p.label}</label><input type="range" id="p_${p.k}" data-k="${p.k}" min="${p.min}" max="${p.max}" step="${p.step}" value="${v}"><output>${v}${p.u ? ' ' + p.u : ''}</output></div>`;
  }).join('');
}
function readParams(params) {
  const p = {}; params.forEach(d => { const i = $('#p_' + d.k); p[d.k] = d.type === 'select' ? i.value : parseFloat(i.value); }); return p;
}
function wireForm(params, def) {
  $('#dlgBody').addEventListener('input', e => {
    const d = params.find(q => q.k === e.target.dataset.k); if (!d) return;
    if (d.type !== 'select') e.target.nextElementSibling.textContent = e.target.value + (d.u ? ' ' + d.u : '');
    if (d.k === 'preset' && def.presets) { const pr = def.presets[e.target.value]; Object.entries(pr).forEach(([k, v]) => { const i = $('#p_' + k); if (i) { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); } }); }
  });
}
function dlgFx(key) {
  const fx = FX[key];
  if (!fx.params) return applyFx(key);
  const tg = fxTargets(); if (!tg.length) return toast('No hay audio para procesar. Importá o grabá algo primero.');
  const info = { peak: peakOf(renderRange(tg[0].tr, tg[0].a, Math.min(tg[0].b, tg[0].a + 120))) };
  const where = hasRange() ? `la selección (${(sel.b - sel.a).toFixed(2)} s)` : (tg.length === 1 ? 'el clip' : `${tg.length} clips`);
  openDialog(`<h3>${fx.name}</h3><p>Se aplica a ${where}.${fx.note ? ' ' + fx.note : ''}</p>${paramForm(fx.params, info)}
    <div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap"><div class="fxprev"><button class="btn" id="pPrev">Escuchar</button>${fx.extra ? `<button class="btn" id="pExtra">${fx.extra}</button>` : ''}</div>
    <div class="row" style="gap:8px"><button class="btn" id="aCancel">Cancelar</button><button class="btn primary" id="pOk">Aplicar</button></div></div>`);
  wireForm(fx.params, fx);
  $('#pPrev').onclick = () => { const t = tg[0], b = Math.min(t.b, t.a + 8); previewChannels(fx.run(renderRange(t.tr, t.a, b), state.sr, readParams(fx.params))); };
  if (fx.extra) $('#pExtra').onclick = () => {
    if (!hasRange()) return toast('Seleccioná un tramo con solo ruido');
    const ch = renderRange(tg[0].tr, sel.a, sel.b); const m = new Float32Array(ch[0].length); ch.forEach(c => c.forEach((v, i) => m[i] += v / ch.length));
    NOISE = avgProfile(noiseProfile(m), 1); toast('Perfil de ruido capturado. Ahora seleccioná lo que querés limpiar.');
    closeDialog();
  };
  $('#aCancel').onclick = closeDialog;
  $('#pOk').onclick = () => { const p = readParams(fx.params); closeDialog(); busy(fx.name + '…'); setTimeout(() => { try { applyFx(key, p); } catch (e) { console.error(e); toast('No se pudo aplicar el efecto'); } busy(false); }, 30); };
}
function dlgGen(kind) {
  const d = GEN[kind];
  openDialog(`<h3>Generar ${d.name.toLowerCase()}</h3><p>Se inserta en el cursor (${fmt(sel.a)}) de la pista elegida y corre lo que sigue.</p>${paramForm(d.params, {})}
    <div class="row" style="justify-content:flex-end;gap:8px">${kind !== 'silence' ? '<button class="btn" id="pPrev" style="margin-right:auto">Escuchar</button>' : ''}<button class="btn" id="aCancel">Cancelar</button><button class="btn primary" id="pOk">Generar</button></div>`);
  wireForm(d.params, d);
  if ($('#pPrev')) $('#pPrev').onclick = () => { const p = readParams(d.params); p.dur = Math.min(p.dur, 4); previewChannels(synth(kind, p, state.sr)); };
  $('#aCancel').onclick = closeDialog;
  $('#pOk').onclick = () => { const p = readParams(d.params); closeDialog(); generate(kind, p); };
}
function dlgClip(tr, c) {
  openDialog(`<h3>Clip</h3>
    <div class="f wide"><label for="cN">Nombre</label><input type="text" id="cN" value="${esc(c.name)}"></div>
    <div class="f"><label for="cG">Ganancia</label><input type="range" id="cG" min="-24" max="12" step=".5" value="${gToDb(c.gain).toFixed(1)}"><output>${gToDb(c.gain).toFixed(1)} dB</output></div>
    <div class="f"><label for="cI">Fundido entrada</label><input type="range" id="cI" min="0" max="${(c.dur / 2).toFixed(2)}" step=".01" value="${c.fin}"><output>${c.fin.toFixed(2)} s</output></div>
    <div class="f"><label for="cO">Fundido salida</label><input type="range" id="cO" min="0" max="${(c.dur / 2).toFixed(2)}" step=".01" value="${c.fout}"><output>${c.fout.toFixed(2)} s</output></div>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn danger" id="cDel" style="margin-right:auto">Eliminar clip</button><button class="btn" id="aCancel">Cancelar</button><button class="btn primary" id="cOk">Listo</button></div>`);
  $('#dlgBody').addEventListener('input', e => { if (e.target.type === 'range') e.target.nextElementSibling.textContent = (+e.target.value).toFixed(e.target.id === 'cG' ? 1 : 2) + (e.target.id === 'cG' ? ' dB' : ' s'); });
  $('#aCancel').onclick = closeDialog;
  $('#cDel').onclick = () => { closeDialog(); commit(() => { tr.clips = tr.clips.filter(x => x !== c); }); };
  $('#cOk').onclick = () => { const n = $('#cN').value, gg = dbToG(+$('#cG').value), fi = +$('#cI').value, fo = +$('#cO').value; closeDialog(); commit(() => { Object.assign(c, { name: n, gain: gg, fin: fi, fout: fo }); }); };
}
function dlgExport() {
  if (!projEnd()) return toast('El proyecto está vacío');
  openDialog(`<h3>Exportar audio</h3><p>Se mezclan todas las pistas que suenan (respeta silenciar y solo). Sin marcas de agua.</p>
    <div class="f wide"><label for="xF">Formato</label><select id="xF"><option value="mp3">MP3</option><option value="wav">WAV (sin pérdida)</option></select></div>
    <div class="f wide" id="xBr"><label for="xB">Calidad</label><select id="xB"><option value="128">128 kbps</option><option value="192" selected>192 kbps</option><option value="256">256 kbps</option><option value="320">320 kbps</option></select></div>
    <div class="f wide"><label for="xR">Qué exportar</label><select id="xR"><option value="all">Todo el proyecto (${fmt(projEnd())})</option>${hasRange() ? `<option value="sel" selected>Solo la selección (${(sel.b - sel.a).toFixed(2)} s)</option>` : ''}</select></div>
    <div class="f wide"><label for="xC">Canales</label><select id="xC"><option value="2">Estéreo</option><option value="1">Mono</option></select></div>
    <div class="f wide"><label for="xN">Nombre</label><input type="text" id="xN" value="${esc(safeName(state.name))}"></div>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" id="aCancel">Cancelar</button><button class="btn primary" id="xOk">Exportar</button></div>`);
  $('#xF').onchange = () => { $('#xBr').hidden = $('#xF').value !== 'mp3'; };
  $('#aCancel').onclick = closeDialog;
  $('#xOk').onclick = async () => {
    const o = { fmt: $('#xF').value, kbps: +$('#xB').value, range: $('#xR').value, ch: +$('#xC').value, name: $('#xN').value || 'audio' };
    closeDialog(); await exportAudio(o);
  };
}
async function exportAudio(o) {
  busy('Mezclando…'); await wait(30);
  try {
    const [a, b] = o.range === 'sel' && hasRange() ? [sel.a, sel.b] : [0, projEnd()];
    let ch = mixdown(a, b);
    if (o.ch === 1) { const m = new Float32Array(ch[0].length); for (let i = 0; i < m.length; i++) m[i] = (ch[0][i] + ch[1][i]) / 2; ch = [m]; }
    let blob;
    if (o.fmt === 'wav') blob = encodeWav(ch, state.sr);
    else { busy('Cargando codificador MP3…'); await loadScript(LAME); blob = await encodeMp3(ch, state.sr, o.kbps, pct => busy(`Codificando MP3… ${pct}%`)); }
    download(blob, safeName(o.name) + '.' + o.fmt);
    toast('Listo: ' + T.fmtBytes(blob.size));
  } catch (e) { console.error(e); toast('No se pudo exportar: ' + e.message); }
  busy(false);
}
function encodeWav(ch, sr) {
  const nc = ch.length, n = ch[0].length, buf = new ArrayBuffer(44 + n * nc * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * nc * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * nc * 2, true);
  let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { const s = clamp(ch[c][i], -1, 1); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Blob([buf], { type: 'audio/wav' });
}
const toI16 = x => { const o = new Int16Array(x.length); for (let i = 0; i < x.length; i++) { const s = clamp(x[i], -1, 1); o[i] = s < 0 ? s * 0x8000 : s * 0x7fff; } return o; };
async function encodeMp3(ch, sr, kbps, prog) {
  const enc = new lamejs.Mp3Encoder(ch.length, sr, kbps), I = ch.map(toI16), out = [], step = 1152, n = I[0].length;
  for (let i = 0, k = 0; i < n; i += step, k++) {
    const d = ch.length > 1 ? enc.encodeBuffer(I[0].subarray(i, i + step), I[1].subarray(i, i + step)) : enc.encodeBuffer(I[0].subarray(i, i + step));
    if (d.length) out.push(new Uint8Array(d));
    if (k % 300 === 0) { prog && prog(Math.round(i / n * 100)); await wait(0); }
  }
  const f = enc.flush(); if (f.length) out.push(new Uint8Array(f));
  return new Blob(out, { type: 'audio/mpeg' });
}

/* ───────────── reproducción (Web Audio) ───────────── */
let actx = null, master, anL, anR, abCache = new Map(), prevSrc = null;
function getCtx() {
  if (actx) return actx;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  actx = new AC(); master = actx.createGain(); master.gain.value = +$('#masterVol').value;
  const sp = actx.createChannelSplitter(2); anL = actx.createAnalyser(); anR = actx.createAnalyser(); anL.fftSize = anR.fftSize = 1024;
  master.connect(actx.destination); master.connect(sp); sp.connect(anL, 0); sp.connect(anR, 1);
  return actx;
}
function audioBufOf(id) {
  if (abCache.has(id)) return abCache.get(id);
  const B = bufs.get(id), ab = actx.createBuffer(2, B.len, state.sr);
  ab.copyToChannel(B.ch[0], 0); ab.copyToChannel(B.ch[1] || B.ch[0], 1); abCache.set(id, ab); return ab;
}
function play(from, opts = {}) {
  stop(true);
  const c = getCtx(); if (!c) return toast('Este navegador no puede reproducir audio');
  c.resume();
  const T0 = c.currentTime + 0.05, nodes = [], tnodes = new Map();
  for (const tr of state.tracks) {
    const tg = c.createGain(); tg.gain.value = audible(tr) ? tr.vol : 0;
    let out = tg; if (c.createStereoPanner) { const pn = c.createStereoPanner(); pn.pan.value = tr.pan; tg.connect(pn); out = pn; tnodes.set(tr.id, { tg, pn }); } else tnodes.set(tr.id, { tg });
    out.connect(master);
    for (const cl of tr.clips) {
      const end = cl.start + cl.dur; if (end <= from) continue;
      const inOff = Math.max(0, from - cl.start), when = T0 + Math.max(0, cl.start - from);
      const src = c.createBufferSource(); src.buffer = audioBufOf(cl.buf);
      const gn = c.createGain(), t0 = Math.max(cl.start, from);
      gn.gain.setValueAtTime(envAt(cl, t0 + 1e-4), when);
      [cl.start + cl.fin, end - cl.fout, end].filter(t => t > t0).sort((p, q) => p - q).forEach(t => gn.gain.linearRampToValueAtTime(envAt(cl, Math.min(t, end - 1e-4)), T0 + t - from));
      src.connect(gn); gn.connect(tg); src.start(when, cl.off + inOff, cl.dur - inOff); nodes.push(src);
    }
  }
  const loop = ui.loop && hasRange() && !opts.record;
  const end = opts.record ? Infinity : loop ? sel.b : projEnd();
  if (loop && (from < sel.a || from >= sel.b)) { from = sel.a; }
  ui.playing = { from, T0, nodes, tnodes, end, loop };
  $('#playIco').innerHTML = '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>';
  tick();
}
function stop(silent) {
  const p = ui.playing; if (!p) return;
  p.nodes.forEach(n => { try { n.stop(); } catch (e) { } });
  p.tnodes.forEach(({ tg, pn }) => { try { tg.disconnect(); pn && pn.disconnect(); } catch (e) { } });
  ui.playing = null; $('#playIco').innerHTML = '<path d="M7 5v14l12-7z"/>';
  if (!silent) requestDraw();
}
const playPos = () => ui.playing ? ui.playing.from + Math.max(0, actx.currentTime - ui.playing.T0) : null;
function togglePlay() {
  if (ui.recording) return toggleRecord();
  if (ui.playing) { ui.pausedAt = playPos(); stop(); updateUi(); return; }
  const from = ui.pausedAt != null ? ui.pausedAt : sel.a;
  play(from >= projEnd() - 0.01 && !ui.loop ? 0 : from);
}
function liveTrack(tr) { const n = ui.playing && ui.playing.tnodes.get(tr.id); if (!n) return; n.tg.gain.value = audible(tr) ? tr.vol : 0; if (n.pn) n.pn.pan.value = tr.pan; }
function liveAll() { state.tracks.forEach(liveTrack); }
function tick() {
  if (!ui.playing) return;
  const p = playPos();
  if (p >= ui.playing.end) { if (ui.playing.loop) { play(sel.a); return; } stop(); ui.pausedAt = null; updateUi(); drawMeter(true); return; }
  followPlayhead(p); $('#tNow').textContent = fmt(p); drawMeter(); requestDraw();
  requestAnimationFrame(tick);
}
function followPlayhead(t) { const x = t * ui.pps, sl = lanes.scrollLeft, w = lanes.clientWidth; if (w && (x > sl + w - 30 || x < sl)) lanes.scrollLeft = Math.max(0, x - 40); }
const mctx = $('#meter').getContext('2d'), mbuf = new Float32Array(1024);
function drawMeter(clear) {
  const W = 140, Hh = 14; mctx.clearRect(0, 0, W, Hh); if (clear || !anL) return;
  [anL, anR].forEach((an, k) => {
    an.getFloatTimeDomainData(mbuf); let pk = 0; for (const v of mbuf) pk = Math.max(pk, Math.abs(v));
    const w = clamp((gToDb(pk) + 60) / 60, 0, 1) * W, gr = mctx.createLinearGradient(0, 0, W, 0);
    gr.addColorStop(0, '#2fc28a'); gr.addColorStop(.75, '#e8c53d'); gr.addColorStop(1, '#ef5b5b'); mctx.fillStyle = gr; mctx.fillRect(0, k * 7 + 1, w, 5);
  });
}
function stopPreview() { if (prevSrc) { try { prevSrc.stop(); } catch (e) { } prevSrc = null; } }
function previewChannels(ch) {
  stopPreview(); const c = getCtx(); if (!c) return; c.resume();
  const ab = c.createBuffer(2, ch[0].length, state.sr); ab.copyToChannel(ch[0], 0); ab.copyToChannel(ch[1] || ch[0], 1);
  prevSrc = c.createBufferSource(); prevSrc.buffer = ab; prevSrc.connect(master); prevSrc.start();
}

/* ───────────── grabación ───────────── */
async function toggleRecord() {
  if (ui.recording) { ui.recording.mr.stop(); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('Este navegador no permite grabar');
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
  catch (e) { return toast('No hay permiso para usar el micrófono'); }
  const mr = new MediaRecorder(stream), parts = [], at = sel.a;
  mr.ondataavailable = e => e.data.size && parts.push(e.data);
  mr.onstop = async () => {
    stream.getTracks().forEach(t => t.stop()); ui.recording = null; stop(); $('#recBtn').classList.remove('on');
    try {
      const ch = await decodeFile(new Blob(parts, { type: mr.mimeType }));
      commit(() => { const n = state.tracks.filter(t => /^Grabación/.test(t.name)).length + 1; const tr = newTrack('Grabación ' + n); tr.clips.push(newClip(addBuf(ch), at, 'Grabación ' + n)); sel = { a: at, b: at + ch[0].length / state.sr, tr: [tr.id] }; });
      toast('Grabación agregada');
    } catch (e) { console.error(e); toast('No se pudo leer la grabación'); }
  };
  mr.start(250); ui.recording = { mr, at }; $('#recBtn').classList.add('on');
  play(at, { record: true });
}

/* ───────────── importar ───────────── */
async function decodeFile(file) {
  const c = getCtx(); if (!c) throw new Error('sin audio');
  const ab = await c.decodeAudioData(await file.arrayBuffer());
  let ch = []; for (let i = 0; i < Math.min(2, ab.numberOfChannels); i++) ch.push(Float32Array.from(ab.getChannelData(i)));
  if (ab.sampleRate !== state.sr) ch = ch.map(x => resample(x, ab.sampleRate / state.sr));
  return ch;
}
async function importFiles(files) {
  files = files.filter(f => /^(audio|video)\//.test(f.type) || /\.(mp3|wav|ogg|oga|flac|m4a|aac|opus|webm|mp4|mov|mkv)$/i.test(f.name));
  if (!files.length) return;
  const pre = snap(); let ok = 0;
  for (const f of files) {
    busy('Abriendo ' + f.name + '…');
    try { const ch = await decodeFile(f), nm = f.name.replace(/\.[^.]+$/, ''); const tr = newTrack(nm); tr.clips.push(newClip(addBuf(ch), 0, nm)); ok++; }
    catch (e) { console.error(e); toast('No se pudo abrir ' + f.name); }
  }
  busy(false);
  if (ok) { H.push(pre); if (state.name === 'Sin título' && files.length === 1) { state.name = files[0].name.replace(/\.[^.]+$/, ''); $('#docName').value = state.name; } changed(true); zoomFit(); toast(ok === 1 ? 'Audio importado' : ok + ' archivos importados'); }
}

/* ───────────── dibujo ───────────── */
let drawQ = false;
function requestDraw() { if (drawQ) return; drawQ = true; requestAnimationFrame(() => { drawQ = false; draw(); }); }
function layout() {
  const w = Math.max(lanes.clientWidth, Math.ceil((projEnd() + 30) * ui.pps));
  $('#spacerW').style.width = w + 'px';
}
function peaksOf(id) {
  let p = peaksCache.get(id); if (p) return p;
  const B = bufs.get(id), bs = 256, nb = Math.ceil(B.len / bs), mn = new Float32Array(nb), mx = new Float32Array(nb);
  for (let k = 0; k < nb; k++) { let a = 0, b = 0; for (const c of B.ch) for (let i = k * bs, e = Math.min(B.len, i + bs); i < e; i++) { const v = c[i]; if (v < a) a = v; if (v > b) b = v; } mn[k] = a; mx[k] = b; }
  p = { bs, mn, mx }; peaksCache.set(id, p); return p;
}
function colMinMax(B, P, s0, s1) {
  let a = 0, b = 0;
  if (s1 - s0 >= P.bs * 2) { for (let k = Math.floor(s0 / P.bs), e = Math.min(P.mn.length, Math.ceil(s1 / P.bs)); k < e; k++) { if (P.mn[k] < a) a = P.mn[k]; if (P.mx[k] > b) b = P.mx[k]; } }
  else for (const c of B.ch) for (let i = s0; i < s1 && i < B.len; i++) { const v = c[i]; if (v < a) a = v; if (v > b) b = v; }
  return [a, b];
}
function roundRect(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function draw() {
  layout();
  const dpr = window.devicePixelRatio || 1, W = lanes.clientWidth || 800, Hh = Math.max(RUL + state.tracks.length * TH + 40, tlEl.clientHeight || 300);
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(Hh * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); cv.style.width = W + 'px'; cv.style.height = Hh + 'px'; }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sl = lanes.scrollLeft, pps = ui.pps, X = t => t * pps - sl, sr = state.sr;
  g.fillStyle = '#0d1015'; g.fillRect(0, 0, W, Hh);
  state.tracks.forEach((tr, i) => {
    const y = RUL + i * TH;
    g.fillStyle = tr.id === ui.active ? '#121a24' : (i % 2 ? '#0f1318' : '#0d1015'); g.fillRect(0, y, W, TH);
    g.fillStyle = '#1d222b'; g.fillRect(0, y + TH - 1, W, 1);
    const dim = !audible(tr);
    for (const c of tr.clips) {
      const x0 = X(c.start), x1 = X(c.start + c.dur); if (x1 < -2 || x0 > W + 2) continue;
      const B = bufs.get(c.buf), top = y + PAD, h = TH - PAD * 2, bodyT = top + HDR, bodyH = h - HDR, mid = bodyT + bodyH / 2;
      g.globalAlpha = dim ? .45 : 1;
      roundRect(x0, top, Math.max(2, x1 - x0), h, 6); g.fillStyle = '#132a44'; g.fill(); g.strokeStyle = '#2f5f93'; g.lineWidth = 1; g.stroke();
      g.save(); roundRect(x0, top, Math.max(2, x1 - x0), h, 6); g.clip();
      g.fillStyle = '#1d4672'; g.fillRect(x0, top, x1 - x0, HDR);
      g.fillStyle = '#d8e9ff'; g.font = '600 11px Figtree, system-ui, sans-serif'; g.textBaseline = 'middle';
      g.fillText((c.name || 'Clip') + (Math.abs(c.gain - 1) > .01 ? `  ${gToDb(c.gain) > 0 ? '+' : ''}${gToDb(c.gain).toFixed(1)} dB` : ''), Math.max(x0, 0) + 6, top + HDR / 2 + 1);
      if (B) {
        const P = peaksOf(c.buf), cx0 = Math.max(0, Math.floor(x0)), cx1 = Math.min(W, Math.ceil(x1)), sMax = Math.round((c.off + c.dur) * sr);
        g.fillStyle = '#7fc0ff';
        for (let x = cx0; x < cx1; x++) {
          const t = (x + sl) / pps - c.start, s0 = Math.max(0, Math.floor((c.off + t) * sr)), s1 = Math.min(sMax, Math.max(s0 + 1, Math.floor((c.off + t + 1 / pps) * sr)));
          if (s0 >= sMax) break;
          const [a, b] = colMinMax(B, P, s0, s1), e = envAt(c, c.start + t + .5 / pps), k = bodyH / 2 * .95;
          const ya = mid - clamp(b * e, -1, 1) * k, yb = mid - clamp(a * e, -1, 1) * k; g.fillRect(x, ya, 1, Math.max(1, yb - ya));
        }
        g.fillStyle = 'rgba(127,192,255,.25)'; g.fillRect(x0, mid, x1 - x0, 1);
      }
      // fundidos
      g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.2;
      if (c.fin > 0) { g.beginPath(); g.moveTo(x0, top + h); g.lineTo(X(c.start + c.fin), bodyT); g.stroke(); }
      if (c.fout > 0) { g.beginPath(); g.moveTo(X(c.start + c.dur - c.fout), bodyT); g.lineTo(x1, top + h); g.stroke(); }
      g.restore();
      g.fillStyle = '#fff'; [[X(c.start + c.fin), 1], [X(c.start + c.dur - c.fout), -1]].forEach(([hx]) => { if (x1 - x0 > 30) g.fillRect(hx - 3, bodyT - 3, 6, 6); });
      g.globalAlpha = 1;
    }
  });
  // selección
  if (hasRange()) {
    const xa = X(sel.a), xb = X(sel.b);
    g.fillStyle = 'rgba(90,169,255,.18)';
    sel.tr.forEach(id => { const i = state.tracks.findIndex(t => t.id === id); if (i >= 0) g.fillRect(xa, RUL + i * TH, xb - xa, TH - 1); });
    g.fillStyle = 'rgba(90,169,255,.35)'; g.fillRect(xa, 0, xb - xa, RUL);
  }
  // regla
  g.fillStyle = '#0f1115'; g.fillRect(0, 0, W, RUL); g.fillStyle = '#262b35'; g.fillRect(0, RUL - 1, W, 1);
  if (hasRange()) { g.fillStyle = 'rgba(90,169,255,.3)'; g.fillRect(X(sel.a), 0, X(sel.b) - X(sel.a), RUL - 1); }
  const steps = [.01, .02, .05, .1, .2, .5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600], st = steps.find(s => s * pps >= 70) || 600;
  g.fillStyle = '#8b93a1'; g.font = '10px JetBrains Mono, monospace'; g.textBaseline = 'top';
  for (let t = Math.floor(sl / pps / st) * st; X(t) < W; t += st) {
    const x = Math.round(X(t)) + .5; g.fillRect(x, 14, 1, RUL - 15);
    for (let k = 1; k < 5; k++) { const xm = Math.round(X(t + st * k / 5)); g.fillRect(xm, RUL - 6, 1, 5); }
    const m = Math.floor(t / 60 + 1e-9), s = t - m * 60; g.fillText(m + ':' + (st < 1 ? s.toFixed(st < .1 ? 2 : 1).padStart(st < .1 ? 5 : 4, '0') : String(Math.round(s)).padStart(2, '0')), x + 3, 3);
  }
  // cursor y cabezal
  const cx = Math.round(X(sel.a)) + .5;
  g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(cx - .5, RUL, 1, Hh);
  g.beginPath(); g.moveTo(cx - 5, RUL - 7); g.lineTo(cx + 5, RUL - 7); g.lineTo(cx, RUL - 1); g.fill();
  if (hasRange()) g.fillRect(Math.round(X(sel.b)), RUL, 1, Hh);
  const pp = ui.playing ? playPos() : ui.pausedAt;
  if (pp != null) {
    const px = Math.round(X(pp)); g.fillStyle = ui.recording ? '#ef5b5b' : '#5aa9ff'; g.fillRect(px - 1, 0, 2, Hh);
    if (ui.recording) { g.fillStyle = 'rgba(239,91,91,.18)'; g.fillRect(X(ui.recording.at), RUL + state.tracks.length * TH, px - X(ui.recording.at), TH); }
  }
  if (!state.tracks.length) {
    g.fillStyle = '#8b93a1'; g.font = '15px Figtree, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Soltá un audio o video acá, tocá Importar, o grabá con el micrófono', W / 2, RUL + 80); g.textAlign = 'left';
  }
}

/* ───────────── encabezados de pista ───────────── */
function renderHeads() {
  const h = $('#heads');
  h.innerHTML = `<div class="rul"><span class="hint">${state.tracks.length} pista${state.tracks.length === 1 ? '' : 's'}</span></div>` + state.tracks.map(t => `
    <div class="th${t.id === ui.active ? ' on' : ''}" data-id="${t.id}">
      <div class="r1"><input value="${esc(t.name)}" data-a="name" aria-label="Nombre de la pista">
        <button class="tb m" data-a="mute" aria-pressed="${t.mute}" title="Silenciar">M</button>
        <button class="tb s" data-a="solo" aria-pressed="${t.solo}" title="Solo">S</button>
        <button class="tb x" data-a="del" title="Eliminar pista" aria-label="Eliminar pista">×</button></div>
      <div class="sl"><span>Vol</span><input type="range" min="0" max="2" step=".01" value="${t.vol}" data-a="vol" aria-label="Volumen"><output>${Math.round(t.vol * 100)}%</output></div>
      <div class="sl"><span>Pan</span><input type="range" min="-1" max="1" step=".05" value="${t.pan}" data-a="pan" aria-label="Paneo"><output>${panLbl(t.pan)}</output></div>
    </div>`).join('') + `<button class="btn addtrack" data-a="add">+ Pista vacía</button>`;
}
const panLbl = p => Math.abs(p) < .01 ? 'C' : (p < 0 ? 'I' : 'D') + Math.round(Math.abs(p) * 100);
let sliderPre = null;
$('#heads').addEventListener('click', e => {
  const a = e.target.closest('[data-a]')?.dataset.a, th = e.target.closest('.th'), tr = th && track(th.dataset.id);
  if (a === 'add') return commit(() => newTrack());
  if (!tr) return;
  if (a === 'mute' || a === 'solo') { commit(() => { tr[a] = !tr[a]; }); liveAll(); return; }
  if (a === 'del') { commit(() => { state.tracks = state.tracks.filter(t => t !== tr); sel.tr = sel.tr.filter(id => id !== tr.id); if (ui.active === tr.id) ui.active = state.tracks[0]?.id || null; }); return; }
  if (!a && ui.active !== tr.id) { ui.active = tr.id; sel.tr = [tr.id]; changed(true); }
});
$('#heads').addEventListener('input', e => {
  const a = e.target.dataset.a, tr = track(e.target.closest('.th')?.dataset.id); if (!tr || (a !== 'vol' && a !== 'pan')) return;
  if (!sliderPre) sliderPre = snap();
  tr[a] = +e.target.value; e.target.nextElementSibling.textContent = a === 'vol' ? Math.round(tr.vol * 100) + '%' : panLbl(tr.pan);
  liveTrack(tr); requestDraw();
});
$('#heads').addEventListener('change', e => {
  const a = e.target.dataset.a, tr = track(e.target.closest('.th')?.dataset.id); if (!tr) return;
  if (a === 'name') { const pre = snap(); tr.name = e.target.value.trim() || tr.name; H.push(pre); changed(); }
  else if (sliderPre) { H.push(sliderPre); sliderPre = null; changed(); }
});

/* ───────────── interacción con la línea de tiempo ───────────── */
function hit(e) {
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, t = Math.max(0, (x + lanes.scrollLeft) / ui.pps);
  const ti = Math.floor((y - RUL) / TH), tr = y >= RUL ? state.tracks[ti] : null;
  const o = { x, y, t, ti, tr, zone: y < RUL ? 'ruler' : tr ? 'lane' : 'empty' };
  if (tr) {
    const top = RUL + ti * TH + PAD, bot = top + TH - PAD * 2;
    const cs = [...tr.clips].reverse();
    for (const c of cs) {
      const x0 = c.start * ui.pps - lanes.scrollLeft, x1 = (c.start + c.dur) * ui.pps - lanes.scrollLeft;
      if (x < x0 - 5 || x > x1 + 5 || y < top || y > bot) continue;
      o.clip = c;
      if (Math.hypot(x - (x0 + c.fin * ui.pps), y - (top + HDR)) < 8 && x1 - x0 > 30) o.part = 'fin';
      else if (Math.hypot(x - (x1 - c.fout * ui.pps), y - (top + HDR)) < 8 && x1 - x0 > 30) o.part = 'fout';
      else if (Math.abs(x - x0) < 6) o.part = 'l';
      else if (Math.abs(x - x1) < 6) o.part = 'r';
      else if (y < top + HDR || ui.tool === 'move') o.part = 'move';
      else if (x >= x0 && x <= x1) o.part = 'body';
      else { o.clip = null; continue; }
      break;
    }
  }
  return o;
}
const CURS = { fin: 'ew-resize', fout: 'ew-resize', l: 'col-resize', r: 'col-resize', move: 'grab', body: 'text' };
function snapT(t, skip) {
  const lim = 8 / ui.pps; let best = t, bd = lim;
  const cands = [0, sel.a]; state.tracks.forEach(tr => tr.clips.forEach(c => { if (c !== skip) cands.push(c.start, c.start + c.dur); }));
  for (const c of cands) { const d = Math.abs(c - t); if (d < bd) { bd = d; best = c; } }
  return best;
}
let drag = null;
cv.addEventListener('pointerdown', e => {
  if (e.button === 2) return;
  const h = hit(e); try { cv.setPointerCapture(e.pointerId); } catch (_) { }
  if (h.zone === 'ruler') { ui.pausedAt = null; sel = { a: h.t, b: h.t, tr: sel.tr }; drag = { kind: 'seek' }; if (ui.playing) play(h.t); changed(); return; }
  if (h.zone === 'empty') { sel = { a: h.t, b: h.t, tr: [] }; ui.pausedAt = null; changed(); return; }
  if (ui.active !== h.tr.id) { ui.active = h.tr.id; renderHeads(); }
  const c = h.clip;
  if (c && h.part && h.part !== 'body') {
    drag = { kind: h.part, c, tr: h.tr, pre: snap(), t0: h.t, o: { ...c }, moved: false };
    if (h.part === 'move') cv.style.cursor = 'grabbing';
    return;
  }
  ui.pausedAt = null;
  if (e.shiftKey) { const anchor = Math.abs(h.t - sel.a) < Math.abs(h.t - sel.b) ? sel.b : sel.a; drag = { kind: 'sel', anchor, ti0: Math.max(0, state.tracks.findIndex(t => t.id === sel.tr[0])) }; extendSel(h); }
  else { sel = { a: h.t, b: h.t, tr: [h.tr.id] }; drag = { kind: 'sel', anchor: h.t, ti0: h.ti }; }
  changed();
});
function extendSel(h) {
  sel.a = Math.min(drag.anchor, h.t); sel.b = Math.max(drag.anchor, h.t);
  const i0 = Math.min(drag.ti0, clamp(h.ti, 0, state.tracks.length - 1)), i1 = Math.max(drag.ti0, clamp(h.ti, 0, state.tracks.length - 1));
  sel.tr = state.tracks.slice(i0, i1 + 1).map(t => t.id);
}
cv.addEventListener('pointermove', e => {
  const h = hit(e);
  if (!drag) { cv.style.cursor = h.zone === 'ruler' ? 'pointer' : h.clip ? CURS[h.part] || 'text' : 'text'; return; }
  const c = drag.c, o = drag.o, dt = h.t - drag.t0;
  if (drag.kind === 'seek') { sel = { a: h.t, b: h.t, tr: sel.tr }; changed(); return; }
  if (drag.kind === 'sel') { extendSel(h); changed(); return; }
  drag.moved = true;
  if (drag.kind === 'move') {
    let s = Math.max(0, o.start + dt); const ss = snapT(s, c);
    if (ss !== s) s = ss; else { const se = snapT(s + o.dur, c); if (se !== s + o.dur) s = se - o.dur; }
    c.start = Math.max(0, s);
    const nt = state.tracks[clamp(h.ti, 0, state.tracks.length - 1)];
    if (nt && nt !== drag.tr) { drag.tr.clips = drag.tr.clips.filter(x => x !== c); nt.clips.push(c); drag.tr = nt; ui.active = nt.id; }
  } else if (drag.kind === 'l') {
    let ns = snapT(clamp(o.start + dt, o.start - o.off, o.start + o.dur - 0.01), c); ns = Math.max(0, ns);
    const d = ns - o.start; c.start = ns; c.off = Math.max(0, o.off + d); c.dur = o.dur - d; c.fin = Math.min(c.fin, c.dur);
  } else if (drag.kind === 'r') {
    const B = bufs.get(c.buf), maxDur = B.len / state.sr - o.off;
    c.dur = clamp(snapT(o.start + o.dur + dt, c) - o.start, 0.01, maxDur); c.fout = Math.min(c.fout, c.dur);
  } else if (drag.kind === 'fin') c.fin = clamp(o.fin + dt, 0, c.dur - c.fout);
  else if (drag.kind === 'fout') c.fout = clamp(o.fout - dt, 0, c.dur - c.fin);
  requestDraw(); layout();
});
function endDrag() {
  if (!drag) return;
  if (drag.pre && drag.moved) { H.push(drag.pre); changed(true); }
  drag = null; cv.style.cursor = '';
}
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
cv.addEventListener('dblclick', e => { const h = hit(e); if (h.clip) { sel = { a: h.clip.start, b: h.clip.start + h.clip.dur, tr: [h.tr.id] }; changed(); } });
cv.addEventListener('contextmenu', e => { const h = hit(e); if (h.clip) { e.preventDefault(); dlgClip(h.tr, h.clip); } });
lanes.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - r.left); } }, { passive: false });
lanes.addEventListener('scroll', requestDraw);
window.addEventListener('resize', requestDraw);

function zoomAt(f, px) {
  const W = lanes.clientWidth || 800; if (px == null) px = ui.playing ? playPos() * ui.pps - lanes.scrollLeft : clamp(sel.a * ui.pps - lanes.scrollLeft, 0, W);
  const t = (px + lanes.scrollLeft) / ui.pps; ui.pps = clamp(ui.pps * f, 1, state.sr / 2); layout(); lanes.scrollLeft = Math.max(0, t * ui.pps - px); requestDraw();
}
function zoomFit() { const W = lanes.clientWidth || 800; ui.pps = clamp((W - 40) / Math.max(projEnd(), 5), 1, state.sr / 2); layout(); lanes.scrollLeft = 0; requestDraw(); }
function zoomSel() { if (!hasRange()) return zoomFit(); const W = lanes.clientWidth || 800; ui.pps = clamp((W - 40) / (sel.b - sel.a), 1, state.sr / 2); layout(); lanes.scrollLeft = Math.max(0, sel.a * ui.pps - 20); requestDraw(); }

/* ───────────── UI general ───────────── */
function updateUi() {
  $('#undoBtn').disabled = !H.canUndo; $('#redoBtn').disabled = !H.canRedo;
  if (!ui.playing) $('#tNow').textContent = fmt(ui.pausedAt != null ? ui.pausedAt : sel.a);
  $('#selLbl').textContent = hasRange() ? `${fmt(sel.a)} – ${fmt(sel.b)} · ${(sel.b - sel.a).toFixed(3)} s` : 'Sin selección';
  $('#loopBtn').setAttribute('aria-pressed', ui.loop);
  $$('[data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === ui.tool));
}
function setTool(t) { ui.tool = t; updateUi(); }
const CMD = {
  new: () => { stop(); commit(() => { state.tracks = []; state.name = 'Sin título'; sel = { a: 0, b: 0, tr: [] }; ui.active = null; $('#docName').value = state.name; }); toast('Proyecto nuevo. Podés deshacer con Ctrl+Z.'); },
  import: async () => importFiles(await pickFiles('audio/*,video/*', true)), export: dlgExport,
  undo, redo, cut: () => copySel(true), copy: () => copySel(false), paste, delete: delSel, silence: silenceSel, trim: trimSel, split: splitCmd, duplicate, selAll: selectAll, deselect,
  zoomIn: () => zoomAt(1.5), zoomOut: () => zoomAt(1 / 1.5), zoomFit, zoomSel,
  play: togglePlay, stop: () => { stop(); ui.pausedAt = null; updateUi(); drawMeter(true); }, record: toggleRecord,
  toStart: () => { ui.pausedAt = null; sel = { a: 0, b: 0, tr: sel.tr }; lanes.scrollLeft = 0; if (ui.playing) play(0); changed(); },
  toEnd: () => { const e = projEnd(); ui.pausedAt = null; sel = { a: e, b: e, tr: sel.tr }; followPlayhead(e); stop(); changed(); },
  loop: () => { ui.loop = !ui.loop; updateUi(); toast(ui.loop ? 'Repetir la selección: activado' : 'Repetir: desactivado'); },
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-cmd],[data-fx],[data-gen],[data-tool]'); if (!b || b.disabled) return;
  if (b.dataset.cmd) CMD[b.dataset.cmd]?.(); else if (b.dataset.fx) dlgFx(b.dataset.fx); else if (b.dataset.gen) dlgGen(b.dataset.gen); else setTool(b.dataset.tool);
});
$('#masterVol').addEventListener('input', e => { if (master) master.gain.value = +e.target.value; });
$('#docName').addEventListener('change', e => { const pre = snap(); state.name = e.target.value.trim() || 'Sin título'; H.push(pre); changed(); });
document.addEventListener('keydown', e => {
  if (!$('#dlg').hidden) { if (e.key === 'Escape') closeDialog(); return; }
  if (e.target.closest?.('input,textarea,select,[contenteditable]')) return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod) {
    const map = { z: e.shiftKey ? redo : undo, y: redo, x: CMD.cut, c: CMD.copy, v: paste, a: selectAll, d: duplicate, l: silenceSel, t: trimSel, o: CMD.import, e: e.shiftKey ? dlgExport : null };
    if (map[k]) { e.preventDefault(); map[k](); } return;
  }
  const map = { ' ': togglePlay, home: CMD.toStart, end: CMD.toEnd, s: splitCmd, delete: delSel, backspace: delSel, r: toggleRecord, l: CMD.loop, escape: deselect, '+': CMD.zoomIn, '=': CMD.zoomIn, '-': CMD.zoomOut, '1': () => setTool('select'), '2': () => setTool('move'),
    arrowleft: () => { sel = { a: Math.max(0, sel.a - (e.shiftKey ? 1 : .1)), b: Math.max(0, sel.a - (e.shiftKey ? 1 : .1)), tr: sel.tr }; ui.pausedAt = null; changed(); },
    arrowright: () => { sel = { a: sel.a + (e.shiftKey ? 1 : .1), b: sel.a + (e.shiftKey ? 1 : .1), tr: sel.tr }; ui.pausedAt = null; changed(); } };
  if (map[k]) { e.preventDefault(); map[k](); }
});
// arrastrar y soltar archivos
let dragN = 0;
window.addEventListener('dragenter', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { dragN++; $('#dropMsg').hidden = false; } });
window.addEventListener('dragleave', () => { if (--dragN <= 0) { dragN = 0; $('#dropMsg').hidden = true; } });
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => { e.preventDefault(); dragN = 0; $('#dropMsg').hidden = true; importFiles([...(e.dataTransfer?.files || [])]); });

/* ───────────── guardado automático (IndexedDB) ───────────── */
let saveT = null, savedBufs = new Set();
function scheduleSave() { clearTimeout(saveT); $('#savedLbl').textContent = ''; saveT = setTimeout(save, 900); }
async function save() {
  try {
    const refs = new Set(); state.tracks.forEach(t => t.clips.forEach(c => refs.add(c.buf)));
    for (const id of refs) if (!savedBufs.has(id) && bufs.has(id)) { const B = bufs.get(id); await store.set('onda:buf:' + id, { ch: B.ch, len: B.len }); savedBufs.add(id); }
    for (const id of [...savedBufs]) if (!refs.has(id)) { await store.del('onda:buf:' + id); savedBufs.delete(id); }
    await store.set('onda:doc', { v: 1, name: state.name, sr: state.sr, tracks: state.tracks, bufs: [...savedBufs] });
    $('#savedLbl').textContent = 'Guardado';
  } catch (e) { console.warn('No se pudo guardar', e); $('#savedLbl').textContent = 'Sin guardar'; }
}
async function load() {
  try {
    const d = await store.get('onda:doc');
    if (d && d.tracks) {
      for (const id of d.bufs || []) { const b = await store.get('onda:buf:' + id); if (b) { bufs.set(id, b); savedBufs.add(id); } }
      d.tracks.forEach(t => t.clips = t.clips.filter(c => bufs.has(c.buf)));
      state = { v: 1, name: d.name || 'Sin título', sr: d.sr || 44100, tracks: d.tracks };
      ui.active = state.tracks[0]?.id || null; return true;
    }
  } catch (e) { console.warn('No se pudo leer el proyecto guardado', e); }
  return false;
}

/* ───────────── proyecto de ejemplo ───────────── */
function demo() {
  const sr = state.sr, bpm = 104, beat = 60 / bpm, bars = 4, len = Math.ceil(bars * 4 * beat * sr) + sr, mel = new Float32Array(len), drm = new Float32Array(len);
  const notes = [0, 3, 5, 7, 10, 7, 5, 3, 0, 5, 7, 12, 10, 7, 5, 7], base = 220;
  notes.forEach((n, k) => { // cuerda pulsada (Karplus-Strong)
    const f = base * Math.pow(2, n / 12), p = Math.round(sr / f), dl = new Float32Array(p); for (let i = 0; i < p; i++) dl[i] = Math.random() * 2 - 1;
    const s0 = Math.round(k * beat * sr); let idx = 0;
    for (let i = 0; i < sr * 1.4 && s0 + i < len; i++) { const a = dl[idx], b = dl[(idx + 1) % p]; dl[idx] = (a + b) * 0.497; idx = (idx + 1) % p; mel[s0 + i] += a * 0.35 * Math.min(1, (sr * 1.4 - i) / (sr * .1)); }
  });
  for (let k = 0; k < bars * 8; k++) {
    const s0 = Math.round(k * beat / 2 * sr), on = k % 2 === 0, b4 = (k / 2) % 4;
    if (on && (b4 === 0 || b4 === 2)) { let ph = 0; for (let i = 0; i < sr * .35; i++) { const f = 45 + 90 * Math.exp(-i / (sr * .03)); ph += 2 * Math.PI * f / sr; drm[s0 + i] += Math.sin(ph) * Math.exp(-i / (sr * .12)) * .8; } }
    if (on && (b4 === 1 || b4 === 3)) for (let i = 0; i < sr * .2; i++) drm[s0 + i] += (Math.random() * 2 - 1) * Math.exp(-i / (sr * .045)) * .4 + Math.sin(2 * Math.PI * 190 * i / sr) * Math.exp(-i / (sr * .03)) * .3;
    let hp = 0, prev = 0; for (let i = 0; i < sr * .05; i++) { const w = Math.random() * 2 - 1; hp = .6 * (hp + w - prev); prev = w; drm[s0 + i] += hp * Math.exp(-i / (sr * .012)) * .18; }
  }
  const m = newTrack('Melodía'), d = newTrack('Ritmo');
  m.clips.push(newClip(addBuf([mel]), 0, 'Guitarra')); d.clips.push(newClip(addBuf([drm]), 0, 'Batería')); d.vol = .8; m.pan = -.15; d.pan = .1;
  state.name = 'Ejemplo'; $('#docName').value = state.name; ui.active = m.id;
}

(async function init() {
  if (!(await load())) demo();
  $('#docName').value = state.name;
  renderHeads(); updateUi(); zoomFit();
  window.__onda = { get state() { return state; }, get sel() { return sel; }, set sel(v) { sel = v; changed(); }, ui, bufs, CMD, FX, GEN, applyFx, generate, mixdown, renderRange, encodeWav, encodeMp3, splitAt, removeRange, undo, redo, dlgFx, dlgGen, dlgExport, exportAudio, save, ready: true };
})();
