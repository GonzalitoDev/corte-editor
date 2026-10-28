/* Taller — utilidades comunes de las apps. Expone window.T */
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let n = 0; const uid = p => p + (++n).toString(36) + Math.random().toString(36).slice(2, 7);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const el = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const icon = d => `<svg class="i" viewBox="0 0 24 24">${d}</svg>`;
  const safeName = s => (s || 'archivo').trim().replace(/[^\w\-áéíóúñü ]+/gi, '').replace(/\s+/g, '-').toLowerCase() || 'archivo';
  const fmtBytes = b => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB';

  let toastT;
  function toast(msg, ms = 3000) {
    let t = $('#toast'); if (!t) { t = el('<div class="toast" id="toast" role="status" hidden></div>'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms);
  }
  function busy(msg) {
    let b = $('#busy');
    if (msg === false) { if (b) b.hidden = true; return; }
    if (!b) { b = el('<div class="busy" id="busy" hidden><div><span class="spin"></span><span id="busyMsg"></span></div></div>'); document.body.appendChild(b); }
    $('#busyMsg').textContent = msg || 'Procesando…'; b.hidden = false;
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function pickFiles(accept, multiple = false) {
    return new Promise(res => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = multiple; i.style.display = 'none';
      i.onchange = () => { res([...i.files]); i.remove(); };
      document.body.appendChild(i); i.click();
    });
  }
  const scripts = {};
  function loadScript(src) {
    if (!scripts[src]) scripts[src] = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete scripts[src]; rej(new Error('No se pudo cargar ' + src)); };
      document.head.appendChild(s);
    });
    return scripts[src];
  }
  function fileToImage(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => res(img); img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('img')); };
      img.src = url;
    });
  }
  const readAsDataURL = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });

  /* Almacenamiento: un IndexedDB "taller" con un almacén clave/valor por app */
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('sin indexedDB'));
      const r = indexedDB.open('taller', 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function kv(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => { const tx = d.transaction('kv', mode), q = fn(tx.objectStore('kv')); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
  }
  const store = {
    get: k => kv('readonly', s => s.get(k)),
    set: (k, v) => kv('readwrite', s => s.put(v, k)),
    del: k => kv('readwrite', s => s.delete(k)),
  };

  /* Historial simple de deshacer basado en instantáneas */
  function history(limit = 40) {
    const u = [], r = [];
    return {
      push(s) { u.push(s); if (u.length > limit) u.shift(); r.length = 0; },
      undo(cur) { if (!u.length) return null; r.push(cur); return u.pop(); },
      redo(cur) { if (!r.length) return null; u.push(cur); return r.pop(); },
      get canUndo() { return u.length > 0; }, get canRedo() { return r.length > 0; },
      clear() { u.length = 0; r.length = 0; },
    };
  }

  /* Menús desplegables: <div class="menu-wrap"><button data-menu="id"> + <div class="menu" id="id" hidden> */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-menu]');
    $$('.menu').forEach(m => { if (!b || m.id !== b.dataset.menu) m.hidden = true; });
    if (b) { const m = document.getElementById(b.dataset.menu); m.hidden = !m.hidden; b.setAttribute('aria-expanded', !m.hidden); }
    else if (e.target.closest('.menu button')) $$('.menu').forEach(m => m.hidden = true);
  });

  window.T = { $, $$, clamp, esc, uid, wait, el, icon, safeName, fmtBytes, toast, busy, download, pickFiles, loadScript, fileToImage, readAsDataURL, store, history };
})();
