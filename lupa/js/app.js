/* Lupa · interfaz: agregar archivos o explorar un sitio, ver lo que se filtra por categoría y limpiar. */
(function () {
  'use strict';
  const L = globalThis.Lupa, $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tam = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  const archivos = []; let sigId = 1, vista = 'resumen', detalleId = null;

  const CATS = [
    ['personas', 'Personas y autores', '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'],
    ['usuarios', 'Usuarios de las PC', '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'],
    ['software', 'Programas', '<path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/>'],
    ['rutas', 'Rutas y carpetas', '<path d="M3 6h6l2 2h10v11H3z"/>'],
    ['equipos', 'Servidores y red', '<rect x="4" y="3" width="16" height="7" rx="1.5"/><rect x="4" y="14" width="16" height="7" rx="1.5"/><path d="M8 6.5h.01M8 17.5h.01"/>'],
    ['correos', 'Correos', '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'],
    ['impresoras', 'Impresoras', '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/>'],
    ['gps', 'Ubicaciones GPS', '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>'],
  ];
  const DELICADAS = new Set(['usuarios', 'rutas', 'equipos', 'gps', 'impresoras']);

  function aviso(t, ms) { const a = $('#aviso'); a.textContent = t; a.hidden = false; clearTimeout(aviso.t); aviso.t = setTimeout(() => a.hidden = true, ms || 3500); }
  function cargarScript(src) { return new Promise((ok, mal) => { if ([...document.scripts].some(s => s.src.endsWith(src))) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar ' + src)); document.head.appendChild(s); }); }
  async function asegurarPdf() { if (!globalThis.pdfjsLib) { await cargarScript('vendor/pdf.min.js'); globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'; } }

  /* ───── agregar y analizar ───── */
  let cola = Promise.resolve();
  function agregar(nombre, bytes, origen) {
    const a = { id: sigId++, nombre, bytes, origen: origen || 'local', res: null, estado: 'leyendo' };
    archivos.push(a); pintar();
    cola = cola.then(async () => {
      try { if (L.tipoDe(nombre) === 'pdf' || (bytes[0] === 0x25 && bytes[1] === 0x50)) await asegurarPdf(); a.res = await L.analizar(nombre, bytes); a.estado = 'listo'; }
      catch (e) { a.estado = 'error'; a.res = { nombre, tipo: L.tipoDe(nombre), tam: bytes.length, campos: [], avisos: ['No se pudo analizar: ' + e.message], riesgo: 'limpio', personas: [], usuarios: [], software: [], rutas: [], correos: [], equipos: [], impresoras: [], fechas: {}, embebidos: [] }; }
      pintar();
    });
    return a;
  }
  async function agregarArchivos(lista) {
    const fs = [...lista]; if (!fs.length) return;
    for (const f of fs) { if (f.size > 200 * 1048576) { aviso(`${f.name} es demasiado grande (más de 200 MB).`); continue; } agregar(f.name, new Uint8Array(await f.arrayBuffer()), 'local'); }
    if (vista === 'resumen' && archivos.length > 0) pintar();
  }
  $('#fArchivos').onchange = e => { agregarArchivos(e.target.files); e.target.value = ''; };
  // arrastrar y soltar (también carpetas)
  let arrastre = 0;
  addEventListener('dragenter', e => { if ([...(e.dataTransfer.types || [])].includes('Files')) { arrastre++; $('#soltar').hidden = false; } });
  addEventListener('dragleave', () => { if (--arrastre <= 0) { arrastre = 0; $('#soltar').hidden = true; } });
  addEventListener('dragover', e => e.preventDefault());
  addEventListener('drop', async e => {
    e.preventDefault(); arrastre = 0; $('#soltar').hidden = true;
    const items = [...(e.dataTransfer.items || [])].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    if (!items.length) return agregarArchivos(e.dataTransfer.files);
    const salida = [];
    const recorrer = async (ent, n = 0) => {
      if (salida.length > 2000) return;
      if (ent.isFile) salida.push(await new Promise(ok => ent.file(ok, () => ok(null))));
      else if (ent.isDirectory && n < 6) { const r = ent.createReader(); for (; ;) { const lote = await new Promise(ok => r.readEntries(ok, () => ok([]))); if (!lote.length) break; for (const x of lote) await recorrer(x, n + 1); } }
    };
    for (const it of items) await recorrer(it);
    agregarArchivos(salida.filter(f => f && L.tipoDe(f.name) !== 'otro'));
  });

  /* ───── datos agregados ───── */
  function listos() { return archivos.filter(a => a.res); }
  function valores(cat) {
    const m = new Map();
    for (const a of listos()) {
      if (cat === 'gps') { if (a.res.gps) m.set(`${a.res.gps.lat}, ${a.res.gps.lon}`, { v: `${a.res.gps.lat}, ${a.res.gps.lon}`, de: [a], gps: a.res.gps }); continue; }
      for (const v of a.res[cat] || []) { const k = v.toLowerCase(); const e = m.get(k) || { v, de: [] }; if (!e.de.includes(a)) e.de.push(a); m.set(k, e); }
    }
    return [...m.values()].sort((x, y) => y.de.length - x.de.length || x.v.localeCompare(y.v));
  }

  /* ───── árbol ───── */
  function pintarArbol() {
    const n = archivos.length, ico = p => `<svg class="i" viewBox="0 0 24 24">${p}</svg>`;
    let h = `<button data-vista="resumen" class="${vista === 'resumen' ? 'on' : ''}">${ico('<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>')}Resumen</button>`;
    h += `<button data-vista="docs" class="${vista === 'docs' ? 'on' : ''}">${ico('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>')}Documentos <b>${n}</b></button><h4>Lo que se filtra</h4>`;
    for (const [k, t, p] of CATS) { const c = valores(k).length; h += `<button data-vista="${k}" class="${vista === k ? 'on' : ''} ${c && DELICADAS.has(k) ? 'alerta' : ''}">${ico(p)}${t} <b>${c}</b></button>`; }
    $('#arbol').innerHTML = h;
  }
  $('#arbol').onclick = e => { const b = e.target.closest('[data-vista]'); if (!b) return; vista = b.dataset.vista; pintar(); };

  /* ───── vistas ───── */
  function vacio() {
    return `<div class="vacio"><div class="caja"><h1>¿Qué dicen tus archivos <em>de vos</em>?</h1>
      <p>Los documentos y las fotos guardan datos escondidos: quién los escribió, el usuario de la computadora, rutas de carpetas internas, servidores, impresoras y hasta el lugar exacto donde se sacó una foto. Lupa los encuentra y te ayuda a borrarlos antes de publicar.</p>
      <div class="zona" data-cmd="agregar"><svg class="i" viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg><b>Soltá archivos o carpetas acá, o tocá para elegir</b><small>PDF · Word · Excel · PowerPoint · OpenDocument · JPG · PNG · HEIC · SVG</small></div>
      <div class="botones"><button class="btn" data-cmd="explorar">Explorar un sitio web</button><button class="btn" data-cmd="ejemplo">Probar con archivos de ejemplo</button></div>
      <p class="privado">🔒 Los archivos que agregás se analizan en tu navegador y no se suben a ningún servidor.</p></div></div>`;
  }
  function resumen() {
    const ls = listos(), n = archivos.length;
    if (!n) return vacio();
    const cuenta = { alto: 0, medio: 0, bajo: 0, limpio: 0 }; for (const a of ls) cuenta[a.res.riesgo]++;
    const pend = n - ls.length;
    let h = `<h2 class="t">Resumen <small>${n} archivo${n === 1 ? '' : 's'}${pend ? ` · analizando ${pend}…` : ''}</small></h2>`;
    h += '<div class="tarjetas">' + CATS.map(([k, t]) => { const c = valores(k).length; return `<button class="tarjeta ${c && DELICADAS.has(k) ? 'alerta' : ''}" data-vista="${k}"><b>${c}</b><span>${t}</span></button>`; }).join('') + '</div>';
    const tot = Math.max(1, ls.length), col = { alto: '#e4675c', medio: '#e8b23d', bajo: '#5aa9ff', limpio: '#5fbf8a' };
    h += `<h2 class="t">Nivel de exposición</h2><div class="barra-riesgo">${Object.entries(cuenta).map(([k, v]) => v ? `<i style="width:${v / tot * 100}%;background:${col[k]}" title="${k}: ${v}"></i>` : '').join('')}</div>`;
    h += `<div class="leyenda">${Object.entries(cuenta).map(([k, v]) => `<span style="--c:${col[k]}">${{ alto: 'Alto', medio: 'Medio', bajo: 'Bajo', limpio: 'Sin datos' }[k]}: ${v}</span>`).join('')}</div>`;
    const peores = ls.filter(a => a.res.puntos > 0).sort((a, b) => b.res.puntos - a.res.puntos).slice(0, 8);
    if (peores.length) h += `<h2 class="t">Los que más dicen</h2>` + tablaDocs(peores);
    const destacados = [];
    for (const k of ['usuarios', 'equipos', 'impresoras', 'gps']) { const v = valores(k); if (v.length) destacados.push(`<b>${v.length}</b> ${CATS.find(c => c[0] === k)[1].toLowerCase()}: ${v.slice(0, 4).map(x => `<code>${esc(x.v)}</code>`).join(', ')}${v.length > 4 ? '…' : ''}`); }
    if (destacados.length) h += `<h2 class="t">Para prestar atención</h2><ul class="avisos">${destacados.map(d => `<li>${d}</li>`).join('')}</ul>`;
    return h;
  }
  function tablaDocs(lista) {
    return `<table class="tabla"><tr><th>Archivo</th><th class="ocultable">Tipo</th><th class="ocultable">Tamaño</th><th>Autor</th><th class="ocultable">Programa</th><th>Exposición</th></tr>` + lista.map(a => {
      const r = a.res; const sel = a.id === detalleId ? 'sel' : '';
      return `<tr class="fila ${sel}" data-id="${a.id}"><td class="n" title="${esc(a.nombre)}">${esc(a.nombre)}</td><td class="tipo ocultable">${r ? esc(r.tipo) : ''}</td><td class="m ocultable">${tam(a.bytes.length)}</td><td class="m">${r ? esc((r.personas || [])[0] || '—') : ''}</td><td class="m ocultable">${r ? esc((r.software || [])[0] || '—') : ''}</td><td>${a.estado === 'leyendo' ? '<span class="riesgo leyendo">leyendo…</span>' : `<span class="riesgo ${r.riesgo}">${{ alto: 'alta', medio: 'media', bajo: 'baja', limpio: 'limpio' }[r.riesgo]}</span>`}</td></tr>`;
    }).join('') + '</table>';
  }
  function vistaCategoria(cat) {
    const [, titulo] = CATS.find(c => c[0] === cat); const vs = valores(cat);
    let h = `<h2 class="t">${titulo} <small>${vs.length} distintos</small></h2>`;
    if (!vs.length) return h + `<p class="hint">${archivos.length ? 'No apareció nada de esto en tus archivos. 👍' : 'Agregá archivos para empezar.'}</p>`;
    const expl = { personas: 'Nombres guardados como autor, quien editó por última vez, empresa o autores de comentarios.', usuarios: 'Nombres de usuario de las computadoras, sacados de rutas como C:\\Users\\nombre. Sirven para adivinar cuentas.', software: 'Programas y versiones usados para crear los archivos: muestran qué software (y qué tan viejo) usa la organización.', rutas: 'Carpetas internas de las computadoras o de la red donde se guardaron o enlazaron los archivos.', equipos: 'Servidores, IP privadas y sitios internos: dan pistas de cómo es la red por dentro.', correos: 'Direcciones de correo que aparecen en los archivos.', impresoras: 'Impresoras de la red guardadas en la configuración de impresión.', gps: 'Fotos que guardan dónde fueron tomadas. Es lo más delicado: puede revelar una casa o una oficina.' }[cat];
    h += `<p class="hint" style="margin:-4px 0 12px">${expl}</p><div class="valores">`;
    for (const v of vs.slice(0, 500)) {
      h += `<div class="valor"><span class="k">${v.de.length} archivo${v.de.length === 1 ? '' : 's'}</span><div class="v">${esc(v.v)}</div>`;
      if (v.gps) h += `<iframe class="mapa" loading="lazy" title="Mapa" src="https://www.openstreetmap.org/export/embed.html?bbox=${v.gps.lon - .01},${v.gps.lat - .006},${v.gps.lon + .01},${v.gps.lat + .006}&layer=mapnik&marker=${v.gps.lat},${v.gps.lon}"></iframe>`;
      h += `<div class="de">${v.de.slice(0, 12).map(a => `<button data-id="${a.id}">${esc(a.nombre)}</button>`).join('')}${v.de.length > 12 ? `<span class="hint">y ${v.de.length - 12} más</span>` : ''}</div></div>`;
    }
    return h + '</div>';
  }
  function pintarVista() {
    let h;
    if (vista === 'resumen') h = resumen();
    else if (vista === 'docs') h = archivos.length ? `<h2 class="t">Documentos <small>${archivos.length}</small></h2>` + tablaDocs(archivos) : vacio();
    else h = vistaCategoria(vista);
    const v = $('#vista'), sc = v.scrollTop; v.innerHTML = h; v.scrollTop = sc;
  }
  $('#vista').addEventListener('click', e => {
    const f = e.target.closest('[data-id]'); if (f) { abrirDetalle(+f.dataset.id); return; }
    const t = e.target.closest('[data-vista]'); if (t) { vista = t.dataset.vista; pintar(); }
  });

  /* ───── detalle de un archivo ───── */
  function abrirDetalle(id) { detalleId = id; pintar(); }
  function pintarDetalle() {
    const a = archivos.find(x => x.id === detalleId), d = $('#detalle');
    $('.work').classList.toggle('sin-detalle', !a); d.hidden = !a; if (!a) return;
    const r = a.res;
    let h = `<div class="pbody"><div class="det-cab"><h3>${esc(a.nombre)}</h3><button class="btn icon small" data-det="cerrar" aria-label="Cerrar">✕</button></div>`;
    h += `<p class="hint" style="margin:0 0 10px">${r ? esc(r.tipo.toUpperCase()) : ''} · ${tam(a.bytes.length)}${a.origen !== 'local' ? ` · <a href="${esc(a.origen)}" target="_blank" rel="noopener">ver en el sitio</a>` : ''}</p>`;
    if (!r) return d.innerHTML = h + '<p class="hint">Analizando…</p></div>';
    h += `<ul class="avisos">${r.avisos.length ? r.avisos.map(x => `<li>${esc(x)}</li>`).join('') : '<li class="ok">No encontramos datos delicados.</li>'}</ul>`;
    h += `<div class="det-acc">${L.puedeLimpiar(r.tipo) ? '<button class="btn primary small" data-det="limpiar">Descargar copia limpia</button>' : '<span class="hint">Este formato no se puede limpiar acá: guardalo como .docx/.xlsx/.pptx o PDF y volvé a probar.</span>'}<button class="btn small" data-det="quitar">Quitar de la lista</button></div>`;
    for (const [k, t] of CATS) { if (k === 'gps') continue; const v = r[k] || []; if (v.length) h += `<div class="det-sec">${t}</div><div class="chips2">${v.slice(0, 40).map(x => `<span>${esc(x)}</span>`).join('')}</div>`; }
    if (r.gps) h += `<div class="det-sec">Ubicación</div><a href="https://www.openstreetmap.org/?mlat=${r.gps.lat}&mlon=${r.gps.lon}#map=17/${r.gps.lat}/${r.gps.lon}" target="_blank" rel="noopener">${r.gps.lat}, ${r.gps.lon} — abrir mapa</a>`;
    if (r.campos.length) h += `<div class="det-sec">Todos los metadatos</div><dl class="campos">${r.campos.slice(0, 200).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v.length > 400 ? v.slice(0, 400) + '…' : v)}</dd>`).join('')}</dl>`;
    if (r.embebidos && r.embebidos.length) h += `<div class="det-sec">Imágenes dentro del documento</div>` + r.embebidos.map(e => `<p class="hint" style="margin:0 0 4px"><b>${esc(e.nombre)}</b>: ${esc(e.campos.map(c => c.join(': ')).slice(0, 5).join(' · '))}</p>`).join('');
    d.innerHTML = h + '</div>';
  }
  $('#detalle').addEventListener('click', async e => {
    const b = e.target.closest('[data-det]'); if (!b) return; const a = archivos.find(x => x.id === detalleId); if (!a) return;
    if (b.dataset.det === 'cerrar') { detalleId = null; pintar(); }
    if (b.dataset.det === 'quitar') { archivos.splice(archivos.indexOf(a), 1); detalleId = null; pintar(); }
    if (b.dataset.det === 'limpiar') {
      b.disabled = true; b.textContent = 'Limpiando…';
      try {
        if (a.res.tipo === 'pdf') await cargarScript('vendor/pdf-lib.min.js');
        const l = await L.limpiar(a.nombre, a.bytes, a.res.tipo); if (!l) throw new Error('formato no soportado');
        bajar(l.nombre, l.bytes);
        if (a.res.tipo === 'pdf') await asegurarPdf();
        const despues = await L.analizar(l.nombre, l.bytes);
        aviso(l.cambios.join(' ') + (despues.puntos ? ' Lo que queda está escrito en el contenido: revisalo a mano.' : ' Quedó limpio.'), 7000);
      } catch (er) { aviso('No se pudo limpiar: ' + er.message, 6000); }
      b.disabled = false; b.textContent = 'Descargar copia limpia';
    }
  });
  function bajar(nombre, bytes, tipo) { const u = URL.createObjectURL(new Blob([bytes], { type: tipo || 'application/octet-stream' })); const a = document.createElement('a'); a.href = u; a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }

  /* ───── explorar un sitio ───── */
  let encontrados = [];
  $('#eIr').onclick = async () => {
    const sitio = $('#eSitio').value.trim();
    if (!sitio) return $('#eSitio').focus();
    if (!$('#ePermiso').checked) { $('#eEstado').textContent = 'Marcá que el sitio es tuyo o que tenés permiso para revisarlo.'; return; }
    $('#eEstado').textContent = 'Recorriendo el sitio (puede tardar hasta 30 segundos)…'; $('#eLista').innerHTML = ''; $('#eAnalizar').hidden = true; $('#eIr').disabled = true;
    try {
      const r = await fetch('/api/lupa?accion=explorar&sitio=' + encodeURIComponent(sitio));
      const j = await r.json().catch(() => ({ error: r.status === 404 ? 'La exploración de sitios funciona en la versión publicada del Taller.' : 'Respuesta inválida' }));
      if (!r.ok) throw new Error(j.error || 'Error ' + r.status);
      encontrados = j.documentos;
      $('#eEstado').textContent = `Revisé ${j.paginas} página${j.paginas === 1 ? '' : 's'} de ${j.sitio} y encontré ${encontrados.length} documento${encontrados.length === 1 ? '' : 's'}${j.incompleto ? ' (el sitio es grande: revisé solo una parte)' : ''}.`;
      $('#eLista').innerHTML = encontrados.map((d, i) => `<label><input type="checkbox" data-i="${i}" checked> <span class="tipo">${esc(d.ext)}</span> ${esc(decodeURI(d.url).replace(/^https?:\/\//, ''))}</label>`).join('');
      $('#eAnalizar').hidden = !encontrados.length;
    } catch (er) { $('#eEstado').textContent = 'No se pudo: ' + er.message; }
    $('#eIr').disabled = false;
  };
  $('#eSitio').onkeydown = e => { if (e.key === 'Enter') $('#eIr').click(); };
  $('#eAnalizar').onclick = async () => {
    const sel = $$('#eLista input:checked').map(i => encontrados[+i.dataset.i]); if (!sel.length) return;
    $('#eAnalizar').disabled = true; let hechos = 0, fallas = 0;
    $('#eEstado').innerHTML = `Bajando ${sel.length} documentos… <div class="progreso"><i id="eProg"></i></div>`;
    const trabajar = async d => {
      try {
        const r = await fetch('/api/lupa?accion=bajar&url=' + encodeURIComponent(d.url));
        if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || r.status); }
        const nombre = decodeURIComponent(d.url.split('?')[0].split('/').pop()) || 'documento.' + d.ext;
        agregar(nombre, new Uint8Array(await r.arrayBuffer()), d.url);
      } catch (e) { fallas++; }
      hechos++; const p = $('#eProg'); if (p) p.style.width = (hechos / sel.length * 100) + '%';
    };
    const pend = sel.slice(); await Promise.all([1, 2, 3].map(async () => { while (pend.length) await trabajar(pend.shift()); }));
    $('#eAnalizar').disabled = false; $('#mExplorar').hidden = true; vista = 'resumen'; pintar();
    aviso(`Listo: ${hechos - fallas} documentos agregados${fallas ? `, ${fallas} no se pudieron bajar (muy grandes o bloqueados)` : ''}.`, 6000);
  };

  /* ───── informe ───── */
  function filasCsv() {
    const filas = [['archivo', 'origen', 'tipo', 'exposicion', 'categoria', 'valor']];
    for (const a of listos()) {
      const r = a.res;
      for (const [k] of CATS) { if (k === 'gps') { if (r.gps) filas.push([a.nombre, a.origen, r.tipo, r.riesgo, 'gps', `${r.gps.lat}, ${r.gps.lon}`]); continue; } for (const v of r[k] || []) filas.push([a.nombre, a.origen, r.tipo, r.riesgo, k, v]); }
      for (const [k, v] of r.campos) filas.push([a.nombre, a.origen, r.tipo, r.riesgo, 'metadato: ' + k, v]);
    }
    return filas.map(f => f.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  }
  function informeHtml() {
    const nom = esc($('#proyecto').value || 'Proyecto'), fecha = new Date().toLocaleString('es-AR');
    let h = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Informe de metadatos · ${nom}</title><style>body{font:14px/1.5 system-ui,sans-serif;max-width:900px;margin:30px auto;padding:0 16px;color:#111}h1{margin:0}h2{border-bottom:2px solid #ddd;padding-bottom:4px;margin-top:28px}code{background:#f2f2f2;padding:1px 5px;border-radius:4px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:5px 8px;text-align:left;font-size:13px;vertical-align:top}.alto{color:#b3261e;font-weight:700}.medio{color:#9a6700;font-weight:700}</style>`;
    h += `<h1>Informe de metadatos</h1><p>${nom} · ${fecha} · ${listos().length} archivos analizados con Lupa (Taller).</p>`;
    for (const [k, t] of CATS) { const v = valores(k); if (!v.length) continue; h += `<h2>${t} (${v.length})</h2><ul>${v.map(x => `<li><code>${esc(x.v)}</code> — ${x.de.map(a => esc(a.nombre)).join(', ')}</li>`).join('')}</ul>`; }
    h += `<h2>Archivos</h2><table><tr><th>Archivo</th><th>Tipo</th><th>Exposición</th><th>Avisos</th></tr>${listos().map(a => `<tr><td>${esc(a.nombre)}</td><td>${esc(a.res.tipo)}</td><td class="${a.res.riesgo}">${a.res.riesgo}</td><td>${esc(a.res.avisos.join(' '))}</td></tr>`).join('')}</table>`;
    h += `<h2>Recomendaciones</h2><ul><li>Limpiá los metadatos antes de publicar (Lupa → «Descargar copia limpia» o «Limpiar todo»).</li><li>Configurá Office para no guardar información personal (Archivo → Información → Inspeccionar documento).</li><li>Desactivá la ubicación en la cámara del celular para las fotos que se publican.</li><li>Evitá enlazar archivos con rutas internas (C:\\Users\\…, \\\\servidor\\…) en documentos públicos.</li></ul></html>`;
    return h;
  }

  /* ───── comandos ───── */
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-cmd]'); if (!b) return;
    const c = b.dataset.cmd;
    if (c === 'agregar') $('#fArchivos').click();
    if (c === 'explorar') { $('#mExplorar').hidden = false; setTimeout(() => $('#eSitio').focus(), 50); }
    if (c === 'exportar') $('#mExportar').hidden = false;
    const nom = ($('#proyecto').value || 'lupa').replace(/[^\w\-áéíóúñ ]+/gi, '').trim() || 'lupa';
    if (c === 'csv') bajar(nom + '-metadatos.csv', new TextEncoder().encode('\ufeff' + filasCsv()), 'text/csv');
    if (c === 'json') bajar(nom + '-metadatos.json', new TextEncoder().encode(JSON.stringify(listos().map(a => ({ origen: a.origen, ...a.res })), null, 2)), 'application/json');
    if (c === 'html') bajar(nom + '-informe.html', new TextEncoder().encode(informeHtml()), 'text/html');
    if (c === 'ejemplo') cargarEjemplos();
    if (c === 'limpiarTodo') {
      const ls = listos().filter(a => L.puedeLimpiar(a.res.tipo)); if (!ls.length) return aviso('No hay archivos que se puedan limpiar.');
      b.disabled = true; const z = new JSZip(); let n = 0;
      if (ls.some(a => a.res.tipo === 'pdf')) await cargarScript('vendor/pdf-lib.min.js');
      for (const a of ls) { try { const l = await L.limpiar(a.nombre, a.bytes, a.res.tipo); if (l) { z.file(l.nombre, l.bytes); n++; } } catch (er) { } }
      bajar(nom + '-limpios.zip', await z.generateAsync({ type: 'uint8array' }), 'application/zip'); b.disabled = false;
      aviso(`${n} archivos limpios en un ZIP.${archivos.length - n ? ` ${archivos.length - n} no se pudieron limpiar (formatos viejos o no soportados).` : ''}`, 6000);
    }
  });
  $$('[data-cerrar]').forEach(b => b.onclick = () => b.closest('.modal').hidden = true);
  $$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.hidden = true; }));
  addEventListener('keydown', e => { if (e.key === 'Escape') { $$('.modal').forEach(m => m.hidden = true); if (detalleId) { detalleId = null; pintar(); } } });

  // ejemplos hechos en el momento: un Word con autor, rutas y servidor, y una foto con GPS
  async function cargarEjemplos() {
    const z = new JSZip();
    z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>');
    z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>');
    z.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="file:///C:\\Users\\lmartinez\\Desktop\\presupuesto_2025.xlsx" TargetMode="External"/></Relationships>');
    z.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Licitación 2025 (ejemplo de Lupa)</w:t></w:r></w:p><w:p><w:ins w:id="1" w:author="Carlos Ruiz" w:date="2025-02-01T10:00:00Z"><w:r><w:t>Respaldo en \\\\FS-CONTABLE01\\licitaciones\\2025 y en 10.0.4.12</w:t></w:r></w:ins></w:p></w:body></w:document>');
    z.file('docProps/core.xml', '<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"><dc:title>Licitación 2025</dc:title><dc:creator>Laura Martínez</dc:creator><cp:lastModifiedBy>Carlos Ruiz</cp:lastModifiedBy><cp:revision>14</cp:revision><dcterms:created>2025-01-20T09:12:00Z</dcterms:created><dcterms:modified>2025-02-03T18:40:00Z</dcterms:modified></cp:coreProperties>');
    z.file('docProps/app.xml', '<?xml version="1.0" encoding="UTF-8"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Template>\\\\FS-CONTABLE01\\plantillas\\Membrete.dotx</Template><TotalTime>312</TotalTime><Application>Microsoft Office Word</Application><AppVersion>16.0000</AppVersion><Company>Empresa de Ejemplo S.A.</Company></Properties>');
    agregar('ejemplo-licitacion.docx', await z.generateAsync({ type: 'uint8array' }), 'local');
    agregar('ejemplo-foto.jpg', jpegEjemplo(), 'local');
    vista = 'resumen'; pintar();
  }
  function jpegEjemplo() {
    // JPEG mínimo de 1×1 con EXIF: cámara, programa y GPS (Obelisco de Buenos Aires)
    const c = document.createElement('canvas'); c.width = c.height = 8; const x = c.getContext('2d'); x.fillStyle = '#6a9'; x.fillRect(0, 0, 8, 8);
    const base = atob(c.toDataURL('image/jpeg', .8).split(',')[1]); const img = Uint8Array.from(base, ch => ch.charCodeAt(0));
    const tiff = construirExif(); const app1 = new Uint8Array(4 + 6 + tiff.length);
    app1.set([0xff, 0xe1, ((app1.length - 2) >> 8) & 255, (app1.length - 2) & 255], 0); app1.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4); app1.set(tiff, 10);
    const out = new Uint8Array(img.length + app1.length); out.set(img.subarray(0, 2), 0); out.set(app1, 2); out.set(img.subarray(2), 2 + app1.length); return out;
  }
  function construirExif() {
    // TIFF little-endian: IFD0 (Make, Model, Software, GPS) + IFD GPS
    const b = new Uint8Array(400), dv = new DataView(b.buffer); let p = 8; b.set([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0]);
    const textos = []; let datos = 200;
    const tag = (pos, id, tipo, n, val) => { dv.setUint16(pos, id, true); dv.setUint16(pos + 2, tipo, true); dv.setUint32(pos + 4, n, true); dv.setUint32(pos + 8, val, true); };
    const str = s => { const o = datos; for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); b[o + s.length] = 0; datos += s.length + 1; return o; };
    const rac = (num, den) => { const o = datos; dv.setUint32(o, num, true); dv.setUint32(o + 4, den, true); datos += 8; return o; };
    dv.setUint16(p, 4, true); p += 2;
    let s = 'Samsung'; tag(p, 0x010f, 2, s.length + 1, str(s)); p += 12;
    s = 'Galaxy A54'; tag(p, 0x0110, 2, s.length + 1, str(s)); p += 12;
    s = 'Adobe Lightroom 7.2 (Windows)'; tag(p, 0x0131, 2, s.length + 1, str(s)); p += 12;
    const gpsPos = p + 12 + 4; tag(p, 0x8825, 4, 1, gpsPos); p += 12; dv.setUint32(p, 0, true); p += 4;
    // IFD GPS
    p = gpsPos; dv.setUint16(p, 4, true); p += 2;
    tag(p, 1, 2, 2, 0x53); p += 12; // 'S'
    const lat = datos; rac(34, 1); rac(36, 1); rac(3746, 100); tag(p, 2, 5, 3, lat); p += 12;
    tag(p, 3, 2, 2, 0x57); p += 12; // 'W'
    const lon = datos; rac(58, 1); rac(22, 1); rac(5422, 100); tag(p, 4, 5, 3, lon); p += 12;
    dv.setUint32(p, 0, true);
    return b.subarray(0, datos);
  }

  /* ───── pintar todo ───── */
  function pintar() {
    pintarArbol(); pintarVista(); pintarDetalle();
    $('#bExportar').disabled = !listos().length; $('#bLimpiarTodo').disabled = !listos().some(a => L.puedeLimpiar(a.res.tipo));
  }
  pintar();
  window.__lupa = { archivos, agregar };
})();
