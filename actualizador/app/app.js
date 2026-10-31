'use strict';
const $ = s => document.querySelector(s);
const el = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtBytes = b => !b ? '' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
const fmtFecha = f => { if (!f) return ''; const d = new Date(f); return isNaN(d) ? '' : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }); };

let sistema = { dpkg: true, pkexec: true };
const S = new Map();            // id -> estado de cada juego
const cards = new Map();        // id -> elemento

const CHIP = { nueva: 'Actualización disponible', 'al-dia': 'Al día', 'no-instalado': 'No instalado', error: 'Sin conexión', desconocido: 'Desconocido', cargando: 'Buscando…' };

function botones(a) {
  if (a.busy) return `<span class="estado-txt"><span class="spin"></span> ${esc(a.faseTxt || 'Trabajando…')}</span>`;
  const out = [];
  if (a.estado === 'nueva') out.push(`<button class="btn primary" data-act="actualizar" data-id="${a.id}">Actualizar</button>`);
  else if (a.estado === 'no-instalado') out.push(`<button class="btn primary" data-act="actualizar" data-id="${a.id}">Instalar</button>`);
  else if (a.estado === 'error' || a.estado === 'desconocido') out.push(`<button class="btn" data-act="reintentar" data-id="${a.id}">Reintentar</button>`);
  if (a.instalada) out.push(`<button class="btn sec" data-act="jugar" data-id="${a.id}">Jugar</button>`);
  return out.join('');
}

function cardHtml(a) {
  const ch = a.estado || 'cargando';
  const inst = a.instalada ? `<b>${esc(a.instalada)}</b>` : '<b style="color:var(--muted)">—</b>';
  const ult = a.latest ? `<b>${esc(a.latest.version)}</b>` : (ch === 'error' ? '<b style="color:var(--danger)">?</b>' : '<span class="spin"></span>');
  return `
    <div class="cab">
      <div class="ic" style="color:${a.color}">${esc(a.nombre[0])}</div>
      <div><h2>${esc(a.nombre)}</h2><p class="res">${esc(a.resumen)}</p></div>
      <div class="acc">${botones(a)}</div>
    </div>
    <div class="vers">
      <div><span class="lab">Instalada</span>${inst}</div>
      <div><span class="lab">Última</span>${ult}</div>
      <span class="chip ${ch}">${CHIP[ch] || ch}</span>
      ${a.latest && a.latest.fecha ? `<span class="estado-txt">publicada ${esc(fmtFecha(a.latest.fecha))}</span>` : ''}
    </div>
    ${a.estado === 'nueva' && a.latest && a.latest.notas ? `<div class="notas">${esc(a.latest.notas)}</div>` : ''}
    <div class="progwrap" hidden><div class="prog"><i></i></div><div class="estado-txt dl"></div></div>
    <div class="msg estado-txt" hidden></div>`;
}

function render(id) {
  const a = S.get(id); let c = cards.get(id);
  if (!c) { c = el(`<section class="card" style="--c:${a.color}"></section>`); cards.set(id, c); $('#lista').appendChild(c); }
  c.style.setProperty('--c', a.color);
  c.innerHTML = cardHtml(a);
}

function setProgreso(id, { fase, pct, bajado, total }) {
  const c = cards.get(id); if (!c) return;
  const w = c.querySelector('.progwrap'), bar = c.querySelector('.prog i'), txt = c.querySelector('.dl');
  w.hidden = false;
  if (fase === 'descargando') { bar.style.width = Math.round((pct || 0) * 100) + '%'; txt.textContent = `Descargando… ${Math.round((pct || 0) * 100)}%${total ? ' (' + fmtBytes(bajado) + ' de ' + fmtBytes(total) + ')' : ''}`; }
  else if (fase === 'instalando') { bar.style.width = '100%'; txt.innerHTML = '<span class="spin"></span> Instalando… (puede pedirte la contraseña)'; }
}

async function buscar(id) {
  const a = S.get(id); a.estado = a.estado === 'no-instalado' ? a.estado : 'cargando'; a.latest = null; render(id);
  const r = await window.updater.buscar(id);
  if (r.error) { a.estado = 'error'; }
  else { a.latest = r.latest; if (r.instalada != null) a.instalada = r.instalada; a.estado = r.estado; }
  render(id);
}

async function buscarTodos() {
  $('#buscar').disabled = true;
  await Promise.all([...S.keys()].map(buscar));
  $('#buscar').disabled = false;
}

async function actualizar(id) {
  const a = S.get(id); if (a.busy) return;
  a.busy = true; a.faseTxt = 'Descargando…'; render(id);
  const r = await window.updater.actualizar(id);
  a.busy = false;
  const c = cards.get(id);
  if (r.ok) {
    if (r.version) a.instalada = r.version;
    a.estado = 'al-dia'; render(id);
    const msg = c.querySelector('.msg'); msg.hidden = false; msg.classList.add('ok');
    msg.textContent = r.tipo === 'appimage' ? `¡Listo! Quedó en ${r.ruta}` : `¡Listo! ${a.nombre} ${r.version} instalado.`;
  } else {
    render(id);
    const msg = c.querySelector('.msg'); msg.hidden = false; msg.classList.add('mal');
    msg.textContent = 'No se pudo: ' + (r.error || 'error desconocido');
  }
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = b.dataset.id;
  if (b.dataset.act === 'actualizar') actualizar(id);
  else if (b.dataset.act === 'reintentar') buscar(id);
  else if (b.dataset.act === 'jugar') window.updater.jugar(id);
});
$('#buscar').addEventListener('click', buscarTodos);

window.updater.onProgreso(d => { const a = S.get(d.id); if (a) { a.faseTxt = d.fase === 'instalando' ? 'Instalando…' : 'Descargando…'; } setProgreso(d.id, d); });

(async () => {
  const { apps, dpkg, pkexec } = await window.updater.cargar();
  sistema = { dpkg, pkexec };
  apps.forEach(a => { S.set(a.id, Object.assign({ busy: false }, a, { estado: a.instalada ? 'al-dia' : 'no-instalado' })); render(a.id); });
  if (!dpkg) { const v = $('#aviso'); v.hidden = false; v.textContent = 'No encontré dpkg en tu sistema. En Linux Mint ya viene; si estás en otra distro, el actualizador va a ofrecer la versión AppImage.'; }
  else if (!pkexec) { const v = $('#aviso'); v.hidden = false; v.textContent = 'Falta pkexec (PolicyKit) para instalar sin consola. Instalalo con: sudo apt install policykit-1'; }
  buscarTodos();
})();
