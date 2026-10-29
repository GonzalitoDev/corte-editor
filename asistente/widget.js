/* Asistente de Gonzadev — burbuja de chat para pegar en cualquier sitio.
 * <script src="https://TU-ASISTENTE.vercel.app/widget.js" data-sitio="zonahack" defer></script>
 * Atributos opcionales: data-color="#7cff4f" data-posicion="izquierda" data-titulo="…" data-saludo="…"
 */
(function () {
  if (window.__gonzaAsistente) return; window.__gonzaAsistente = true;
  var me = document.currentScript || (function () { var s = document.querySelectorAll('script[src*="widget.js"]'); return s[s.length - 1]; })();
  if (!me) return;
  var API = new URL(me.src, location.href).origin;
  var D = me.dataset || {};
  var SITIO = D.sitio || 'general';
  var KEY = 'gonza-asistente:' + SITIO;
  var cfg = { titulo: D.titulo || 'Asistente', color: D.color || '#7c5cff', saludo: D.saludo || '¡Hola! ¿En qué te ayudo?', sugerencias: [] };
  var izq = /izq|left/i.test(D.posicion || '');
  var hist = []; try { hist = JSON.parse(localStorage.getItem(KEY) || '[]').slice(-20); } catch (e) { }
  var ocupado = false, abierto = false, ctrl = null;

  var host = document.createElement('div'); host.id = 'gonza-asistente';
  host.style.cssText = 'position:fixed;z-index:2147483000;bottom:0;' + (izq ? 'left:0' : 'right:0');
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
  root.innerHTML = '<style>' +
    ':host{all:initial}*{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
    '.fab{position:fixed;bottom:20px;' + (izq ? 'left' : 'right') + ':20px;width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;background:var(--c);color:#111;box-shadow:0 8px 26px rgba(0,0,0,.35);display:grid;place-items:center;transition:transform .18s}' +
    '.fab:hover{transform:scale(1.07)}.fab svg{width:28px;height:28px}.fab .x{display:none}.open .fab .x{display:block}.open .fab .b{display:none}' +
    '.pan{position:fixed;bottom:90px;' + (izq ? 'left' : 'right') + ':20px;width:370px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 120px);background:#15161b;color:#eceef3;border:1px solid #2a2c35;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.5);display:none;flex-direction:column;overflow:hidden}' +
    '.open .pan{display:flex;animation:in .18s ease-out}@keyframes in{from{opacity:0;transform:translateY(10px)}}' +
    'header{display:flex;align-items:center;gap:10px;padding:12px 12px 12px 16px;border-bottom:1px solid #262832;background:#1b1c23}' +
    'header .dot{width:10px;height:10px;border-radius:50%;background:var(--c);box-shadow:0 0 10px var(--c)}header b{flex:1;font-size:15px}' +
    'header button{background:none;border:0;color:#9aa0ad;cursor:pointer;font-size:13px;padding:6px 8px;border-radius:8px}header button:hover{background:#262832;color:#fff}' +
    '.log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}' +
    '.m{max-width:86%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.45;word-wrap:break-word;white-space:normal}' +
    '.m.a{background:#22242d;align-self:flex-start;border-bottom-left-radius:4px}.m.u{background:var(--c);color:#111;align-self:flex-end;border-bottom-right-radius:4px}' +
    '.m.e{background:#3a1d22;color:#ffc9cf;align-self:flex-start}.m a{color:var(--c)}.m.u a{color:#111}.m code{background:#0f1014;padding:1px 5px;border-radius:5px;font-size:13px}.m ul{margin:4px 0;padding-left:18px}.m p{margin:0 0 6px}.m p:last-child{margin:0}' +
    '.dots span{display:inline-block;width:6px;height:6px;margin:0 2px;border-radius:50%;background:#8a8f9c;animation:d 1s infinite}.dots span:nth-child(2){animation-delay:.15s}.dots span:nth-child(3){animation-delay:.3s}@keyframes d{50%{opacity:.25;transform:translateY(-3px)}}' +
    '.sug{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 8px}.sug button{background:#1f2129;color:#d6d9e0;border:1px solid #30333e;border-radius:999px;padding:6px 11px;font-size:13px;cursor:pointer}.sug button:hover{border-color:var(--c)}' +
    'form{display:flex;gap:8px;padding:10px;border-top:1px solid #262832;background:#1b1c23}' +
    'textarea{flex:1;resize:none;background:#101116;color:#eceef3;border:1px solid #30333e;border-radius:12px;padding:10px 12px;font-size:14px;max-height:110px;outline:none}textarea:focus{border-color:var(--c)}' +
    'form button{background:var(--c);border:0;border-radius:12px;width:44px;cursor:pointer;color:#111;display:grid;place-items:center}form button:disabled{opacity:.45;cursor:default}form button svg{width:20px;height:20px}' +
    'small{display:block;text-align:center;color:#6d7280;font-size:11px;padding:0 10px 8px;background:#1b1c23}' +
    '@media (max-width:520px){.pan{inset:0;width:100%;max-width:none;height:100%;max-height:none;border-radius:0;bottom:0}.open .fab{display:none}}' +
    '</style>' +
    '<div class="w"><button class="fab" aria-label="Abrir asistente"><svg class="b" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.5 3 2 6.8 2 11.5c0 2.4 1.2 4.6 3.1 6.1L4 21l4.3-2c1.2.4 2.4.5 3.7.5 5.5 0 10-3.8 10-8.5S17.5 3 12 3zm-4 9.5a1.3 1.3 0 110-2.6 1.3 1.3 0 010 2.6zm4 0a1.3 1.3 0 110-2.6 1.3 1.3 0 010 2.6zm4 0a1.3 1.3 0 110-2.6 1.3 1.3 0 010 2.6z"/></svg><svg class="x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
    '<div class="pan" role="dialog" aria-label="Asistente"><header><i class="dot"></i><b class="t"></b><button class="rst" title="Empezar de nuevo">Nueva charla</button><button class="cls" aria-label="Cerrar">✕</button></header>' +
    '<div class="log" aria-live="polite"></div><div class="sug"></div>' +
    '<form><textarea rows="1" maxlength="1200" placeholder="Escribí tu pregunta…"></textarea><button type="submit" aria-label="Enviar"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4l17.4-7.5c.8-.4.8-1.5 0-1.8L3.4 3.6c-.7-.3-1.4.3-1.2 1l1.7 6.1c.1.4.5.7.9.7l7.2.6-7.2.6c-.4 0-.8.3-.9.7l-1.7 6.1c-.2.7.5 1.3 1.2 1z"/></svg></button></form>' +
    '<small>Respuestas generadas por IA: pueden tener errores.</small></div></div>';
  var $ = function (s) { return root.querySelector(s); };
  var W = $('.w'), LOG = $('.log'), SUG = $('.sug'), TA = $('textarea'), BTN = $('form button');
  function color(c) { W.style.setProperty('--c', c); }
  color(cfg.color); $('.t').textContent = cfg.titulo;

  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function md(t) {
    var h = esc(t)
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|[\s(])((?:https?:\/\/)[^\s<)]+[^\s<).,;:!?])/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
      .replace(/(^|[\s(])([\w.+-]+@[\w-]+\.[\w.]+[a-z])/gi, '$1<a href="mailto:$2">$2</a>');
    var out = [], lista = false;
    h.split('\n').forEach(function (l) {
      var m = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
      if (m) { if (!lista) { out.push('<ul>'); lista = true; } out.push('<li>' + m[1] + '</li>'); return; }
      if (lista) { out.push('</ul>'); lista = false; }
      if (l.trim()) out.push('<p>' + l + '</p>');
    });
    if (lista) out.push('</ul>');
    return out.join('');
  }
  function burbuja(rol, txt) { var d = document.createElement('div'); d.className = 'm ' + rol; if (rol === 'u') d.textContent = txt; else d.innerHTML = md(txt); LOG.appendChild(d); LOG.scrollTop = LOG.scrollHeight; return d; }
  function guardar() { try { localStorage.setItem(KEY, JSON.stringify(hist.slice(-20))); } catch (e) { } }
  function pintar() {
    LOG.innerHTML = ''; burbuja('a', cfg.saludo);
    hist.forEach(function (m) { burbuja(m.role === 'user' ? 'u' : 'a', m.content); });
    SUG.innerHTML = '';
    if (!hist.length) cfg.sugerencias.forEach(function (s) { var b = document.createElement('button'); b.type = 'button'; b.textContent = s; b.onclick = function () { enviar(s); }; SUG.appendChild(b); });
  }

  function enviar(texto) {
    texto = (texto || '').trim(); if (!texto || ocupado) return;
    ocupado = true; BTN.disabled = true; SUG.innerHTML = ''; TA.value = ''; TA.style.height = '';
    hist.push({ role: 'user', content: texto.slice(0, 1200) }); guardar(); burbuja('u', texto);
    var d = burbuja('a', ''); d.innerHTML = '<span class="dots"><span></span><span></span><span></span></span>';
    var acum = '';
    ctrl = window.AbortController ? new AbortController() : null;
    fetch(API + '/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl && ctrl.signal,
      body: JSON.stringify({ sitio: SITIO, mensajes: hist.slice(-10), pagina: { titulo: document.title, url: location.origin + location.pathname } }),
    }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) { throw new Error(j.error || 'No pude responder (error ' + r.status + ').'); });
      if (!r.body || !r.body.getReader) return r.text().then(function (t) { acum = t; d.innerHTML = md(acum); });
      var rd = r.body.getReader(), dec = new TextDecoder();
      return (function leer() {
        return rd.read().then(function (x) {
          if (x.done) return;
          acum += dec.decode(x.value, { stream: true }); d.innerHTML = md(acum);
          var cerca = LOG.scrollHeight - LOG.scrollTop - LOG.clientHeight < 80; if (cerca) LOG.scrollTop = LOG.scrollHeight;
          return leer();
        });
      })();
    }).then(function () {
      acum = acum.trim() || 'No recibí respuesta. Probá de nuevo.';
      d.innerHTML = md(acum); hist.push({ role: 'assistant', content: acum }); guardar();
    }).catch(function (e) {
      if (e && e.name === 'AbortError') { d.remove(); return; }
      d.className = 'm e'; d.textContent = (e && e.message && !/fetch|network/i.test(e.message)) ? e.message : 'No me pude conectar. Revisá tu internet y probá de nuevo.';
      if (acum) { hist.push({ role: 'assistant', content: acum }); guardar(); } else { hist.pop(); guardar(); }
    }).then(function () { ocupado = false; BTN.disabled = false; ctrl = null; LOG.scrollTop = LOG.scrollHeight; if (abierto && matchMedia('(pointer:fine)').matches) TA.focus(); });
  }

  function abrir(v) { abierto = v; W.classList.toggle('open', v); if (v) { LOG.scrollTop = LOG.scrollHeight; if (matchMedia('(pointer:fine)').matches) setTimeout(function () { TA.focus(); }, 50); } }
  $('.fab').onclick = function () { abrir(!abierto); };
  $('.cls').onclick = function () { abrir(false); };
  $('.rst').onclick = function () { if (ctrl) ctrl.abort(); hist = []; guardar(); pintar(); };
  $('form').onsubmit = function (e) { e.preventDefault(); enviar(TA.value); };
  TA.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(TA.value); } if (e.key === 'Escape') abrir(false); });
  TA.addEventListener('input', function () { TA.style.height = 'auto'; TA.style.height = Math.min(TA.scrollHeight, 110) + 'px'; });

  function montar() { document.body.appendChild(host); pintar(); }
  if (document.body) montar(); else document.addEventListener('DOMContentLoaded', montar);
  // presentación del sitio (saludo, color, sugerencias) desde el servidor
  fetch(API + '/api/salud?sitio=' + encodeURIComponent(SITIO)).then(function (r) { return r.json(); }).then(function (j) {
    var s = j.sitio || {};
    cfg.titulo = D.titulo || s.titulo || cfg.titulo; cfg.saludo = D.saludo || s.saludo || cfg.saludo; cfg.sugerencias = s.sugerencias || [];
    color(D.color || s.color || cfg.color); $('.t').textContent = cfg.titulo; if (!ocupado) pintar();
  }).catch(function () { });
  window.GonzaAsistente = { abrir: function () { abrir(true); }, cerrar: function () { abrir(false); }, preguntar: function (t) { abrir(true); enviar(t); } };
})();
