/* La Maquinita · pantalla: escena en pixel art, tablero, tienda, eventos, sonido y guardado. */
(function () {
  'use strict';
  const M = globalThis.Maquinita;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const CLAVE = 'maquinita:partida';
  let s = null;
  try { s = M.cargar(localStorage.getItem(CLAVE)); } catch (e) { }
  const nueva = !s;
  if (!s) s = M.nuevo();
  let sonido = (() => { try { return localStorage.getItem('maquinita:sonido') !== 'no'; } catch (e) { return true; } })();

  /* ───── sonido chiptune ───── */
  let AC = null;
  function ac() { if (!AC) try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
  function bip(notas, dur, vol, tipo) {
    if (!sonido) return; const c = ac(); if (!c) return; let t = c.currentTime;
    for (const f of notas) { const o = c.createOscillator(), g = c.createGain(); o.type = tipo || 'square'; o.frequency.value = f; g.gain.setValueAtTime(vol || .05, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur); t += dur * .9; }
  }
  const sClick = () => bip([660 + Math.random() * 80], .05, .035);
  const sCompra = () => bip([523, 659, 784], .07, .04);
  const sNo = () => bip([180, 140], .08, .04);
  const sEvento = () => bip([880, 660, 880, 660], .09, .05);
  const sBueno = () => bip([523, 659, 784, 1047], .1, .05, 'triangle');
  const sMalo = () => bip([392, 330, 262, 196], .16, .05, 'triangle');

  /* ───── aviso ───── */
  function aviso(t, ms) { const a = $('#aviso'); a.textContent = t; a.hidden = false; clearTimeout(aviso.t); aviso.t = setTimeout(() => a.hidden = true, ms || 3500); }

  /* ───── escena en pixel art ───── */
  const cv = $('#escena'), cx = cv.getContext('2d'); cx.imageSmoothingEnabled = false;
  const W = 200, H = 120;
  const billetes = []; let sacudir = 0, frame = 0, pila = 0;
  const P = { pared: '#5b4a8b', pared2: '#4f3f7c', piso: '#3a2d5e', piso2: '#33284f', madera: '#8a5a33', madera2: '#6b4426', metal: '#9aa3b5', metal2: '#6c7488', metal3: '#c9d0de', verde: '#4fbf5a', verde2: '#2f8a3c', piel: '#e2b089', traje: '#2b3350', corbata: '#d94a4a', negro: '#121018', blanco: '#f3eedc', cielo: '#8fd3ff', oro: '#ffd23f', rojo: '#e04848' };
  function rect(c, x, y, w, h) { cx.fillStyle = c; cx.fillRect(x | 0, y | 0, w | 0, h | 0); }
  function dibujarEscena() {
    frame++;
    const sh = sacudir > 0 ? ((frame % 2) ? 1 : -1) : 0; if (sacudir > 0) sacudir--;
    // pared y piso
    rect(P.pared, 0, 0, W, 82); for (let x = 0; x < W; x += 16) rect(P.pared2, x, 0, 8, 82);
    rect(P.piso, 0, 82, W, 38); for (let x = 0; x < W; x += 20) rect(P.piso2, x + ((frame >> 5) % 2) * 0, 82, 10, 38);
    rect('#2a2040', 0, 80, W, 3);
    // ventana con la calle (y la gente cuando se enoja)
    rect(P.negro, 12, 10, 52, 38); rect(P.cielo, 14, 12, 48, 34); rect(P.blanco, 14, 24, 48, 10);
    rect('#ffe08a', 34, 26, 6, 6);
    if (s.aprob < 40) {
      const n = s.aprob < 20 ? 7 : 4;
      for (let i = 0; i < n; i++) { const x = 16 + i * 6.5, y = 36 + ((frame >> 3) + i) % 2; rect('#2b2140', x, y, 4, 10); rect(P.piel, x, y - 3, 4, 3); if (i % 2 === 0) { rect('#cfcfcf', x + 1, y - 7 - ((frame >> 2) + i) % 3, 5, 3); } }
    }
    rect(P.negro, 37, 10, 2, 38); rect(P.negro, 12, 28, 52, 2);
    // cuadro (un prócer genérico... o vos)
    rect(P.oro, 150, 10, 30, 30); rect('#2a2040', 152, 12, 26, 26); rect(P.piel, 160, 17, 10, 11); rect(P.traje, 156, 28, 18, 10); rect(P.negro, 160, 16, 10, 3); rect(P.negro, 162, 21, 2, 2); rect(P.negro, 166, 21, 2, 2);
    // termómetro de inflación
    rect(P.negro, 132, 8, 8, 52); rect(P.blanco, 134, 10, 4, 44); rect(P.rojo, 133, 54, 6, 6);
    const lvl = Math.min(1, Math.log10(1 + s.infl) / 2); rect(P.rojo, 134, 10 + 44 * (1 - lvl), 4, 44 * lvl);
    if (s.infl > 20 && frame % 20 < 10) rect(P.oro, 141, 10, 3, 3);
    // escritorio y político
    rect(P.madera, 120, 74, 60, 8); rect(P.madera2, 124, 82, 6, 20); rect(P.madera2, 170, 82, 6, 20);
    const py = 52 + (frame % 40 < 20 ? 0 : 1);
    rect(P.traje, 146, py + 10, 16, 18); rect(P.blanco, 152, py + 10, 4, 8); rect(P.corbata, 153, py + 11, 2, 8);
    rect(P.piel, 148, py, 12, 11); rect(P.negro, 147, py - 2, 14, 3); rect(P.negro, 149, py + 4, 10, 2); // anteojos de sol
    rect('#ffffff', 151, py + 8, 6, 1); // sonrisa
    rect(P.traje, 142, py + 12, 4, 10); rect(P.traje, 162, py + 12, 4, 10); rect(P.piel, 162, py + 22, 4, 3);
    // billete en la mano si hay plata
    if (s.usd > 1) { rect(P.verde, 165, py + 18, 9, 5); rect(P.verde2, 167, py + 19, 4, 3); }
    // la maquinita
    const mx = 66 + sh, my = 40;
    rect(P.metal2, mx, my, 46, 42); rect(P.metal, mx + 2, my + 2, 42, 38); rect(P.metal3, mx + 4, my + 4, 38, 4);
    rect(P.negro, mx + 6, my + 12, 34, 12); // panel
    const giro = (frame >> 1) % 4;
    for (let i = 0; i < 4; i++) rect(i === giro ? P.oro : '#4f5a70', mx + 9 + i * 8, my + 15, 5, 6);
    rect(P.rojo, mx + 38, my + 4, 4, 4);
    rect(P.metal2, mx + 6, my + 28, 34, 6); rect(P.negro, mx + 8, my + 30, 30, 2); // ranura
    rect(P.metal2, mx + 2, my + 40, 6, 6); rect(P.metal2, mx + 38, my + 40, 6, 6);
    // manivela
    const a = frame * 0.2 * (1 + Math.min(4, Math.log10(1 + M.porSeg(s)) / 2));
    rect(P.metal2, mx + 46, my + 18, 4, 4); rect(P.metal3, mx + 48 + Math.cos(a) * 5, my + 19 + Math.sin(a) * 5, 3, 3);
    // pila de billetes
    const objetivo = Math.min(30, Math.log10(1 + s.caja) * 2.6); pila += (objetivo - pila) * 0.05;
    for (let i = 0; i < pila; i++) { const w = 40 - i * 0.6, x = 66 + (46 - w) / 2 + (i % 2); rect(i % 2 ? P.verde : P.verde2, x, 98 - i * 1.4, w, 2); }
    // billetes que salen
    if (Math.random() < Math.min(0.9, 0.05 + Math.log10(1 + M.porSeg(s)) * 0.08)) billetes.push({ x: mx + 20, y: my + 30, vx: (Math.random() - .5) * 2, vy: -1 - Math.random() * 1.5, t: 0 });
    for (let i = billetes.length - 1; i >= 0; i--) {
      const b = billetes[i]; b.t++; b.x += b.vx; b.y += b.vy; b.vy += 0.12;
      rect(P.verde, b.x, b.y, 7, 4); rect(P.verde2, b.x + 2, b.y + 1, 3, 2);
      if (b.y > 98 - pila * 1.4 || b.t > 80) billetes.splice(i, 1);
    }
    if (billetes.length > 80) billetes.splice(0, billetes.length - 80);
    // congelamiento de precios
    if (s.congelado > 0) { cx.globalAlpha = .18; rect('#bfe8ff', 0, 0, W, H); cx.globalAlpha = 1; for (let i = 0; i < 12; i++) rect('#ffffff', (i * 37 + frame) % W, (i * 23 + frame * .5) % 80, 2, 2); }
    // pantalla roja si se viene el juicio político
    if (s.aprob < 15 && frame % 30 < 15) { cx.globalAlpha = .12; rect(P.rojo, 0, 0, W, H); cx.globalAlpha = 1; }
  }
  function imprimir(ev) {
    ac(); const p = M.click(s); sacudir = 6; sClick();
    for (let i = 0; i < 3; i++) billetes.push({ x: 86, y: 70, vx: (Math.random() - .5) * 3, vy: -2 - Math.random() * 2, t: 0 });
    const caja = $('.escena').getBoundingClientRect(), f = document.createElement('div'); f.className = 'flota';
    const x = ev && ev.clientX ? ev.clientX - caja.left : caja.width * .45, y = ev && ev.clientY ? ev.clientY - caja.top : caja.height * .5;
    f.style.left = (x - 30) + 'px'; f.style.top = (y - 10) + 'px'; f.textContent = '+$ ' + M.fmt(p); $('#flotantes').appendChild(f); setTimeout(() => f.remove(), 1000);
  }
  $('.escena').addEventListener('pointerdown', imprimir);
  $('#bImprimir').addEventListener('pointerdown', e => { e.preventDefault(); imprimir(); });
  addEventListener('keydown', e => { if ((e.code === 'Space' || e.code === 'Enter') && document.activeElement === document.body && $('#mEvento').hidden) { e.preventDefault(); imprimir(); } });

  /* ───── tablero ───── */
  const cache = new Map();
  const setT = (sel, t) => { if (cache.get(sel) === t) return; cache.set(sel, t); $(sel).textContent = t; };
  function grafico() {
    const g = $('#grafico'), c = g.getContext('2d'), w = g.width, h = g.height, d = s.histInfl;
    c.fillStyle = '#120d22'; c.fillRect(0, 0, w, h);
    const max = Math.max(5, ...d), step = w / Math.max(1, 59);
    for (let i = 0; i < d.length; i++) { const v = d[i], bh = Math.max(1, Math.round(v / max * (h - 4))); c.fillStyle = v > 20 ? '#ff5d5d' : v > 6 ? '#ffd23f' : '#7be36a'; c.fillRect(Math.round(i * step), h - bh, Math.max(2, Math.ceil(step) - 1), bh); }
  }
  function tablero() {
    setT('#fecha', M.fecha(s)); setT('#cargo', M.CARGOS[s.cargo].n + (s.contactos ? ` · ${s.contactos} contactos` : ''));
    setT('#caja', '$ ' + M.fmt(s.caja)); setT('#porSeg', '$ ' + M.fmt(M.porSeg(s)) + ' por segundo');
    setT('#usd', M.fmtUsd(s.usd)); setT('#retorno', `${Math.round(M.retorno(s) * 100)} % de «retorno» a tu bolsillo`);
    const ip = M.inflPercibida(s);
    setT('#infl', ip.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' %' + (s.min.estadistica ? ' *' : '') + (s.congelado ? ' ❄' : ''));
    $('#datoInfl').className = 'dato' + (ip > 20 ? ' alta' : ip > 6 ? ' media' : '');
    setT('#precios', '×' + M.fmt(s.precios < 1000 ? Math.round(s.precios * 10) / 10 : s.precios)); setT('#dolar', '$ ' + M.fmt(M.dolar(s)));
    setT('#aprob', Math.round(s.aprob) + ' %'); $('#aprobB').style.width = s.aprob + '%'; $('#aprobB').style.background = s.aprob < 40 ? 'var(--rojo)' : s.aprob < 55 ? 'var(--oro)' : 'var(--verde)';
    const me = M.mesesEleccion(s); setT('#eleccion', `Elecciones en ${me} ${me === 1 ? 'mes' : 'meses'} (necesitás 40 %)`); $('#eleccion').classList.toggle('peligro', me <= 12 && s.aprob < 45);
    setT('#porClick', '+$ ' + M.fmt(M.porClick(s)));
    if (frame % 10 === 0) grafico();
  }

  /* ───── tienda ───── */
  let tab = 'imprentas';
  $$('.tabs button').forEach(b => b.onclick = () => { tab = b.dataset.tab; $$('.tabs button').forEach(x => x.classList.toggle('on', x === b)); $$('.panel').forEach(p => p.hidden = p.id !== 'tab-' + tab); pintarTienda(true); });
  function item(id, n, d, costo, k, ok, extra) {
    return `<button class="item ${extra || ''}" data-id="${id}" ${ok ? '' : 'disabled'}><span class="n">${n}</span><span class="c">${costo}</span><span class="d">${d}</span>${k != null ? `<span class="k">${k}</span>` : ''}</button>`;
  }
  let firmaTienda = '';
  function pintarTienda(forzar) {
    // solo se redibuja si cambió algo que se ve
    const firma = [tab, s.cargo, Math.floor(s.caja / Math.max(1, M.porSeg(s) * .5 + 1)), s.noquis, s.subsidios, s.impuestos, s.congelado, Object.keys(s.min).length, JSON.stringify(s.imp), Math.floor(s.usd), s.mes].join('|');
    if (!forzar && firma === firmaTienda) return; firmaTienda = firma;
    let h = '';
    if (tab === 'imprentas') {
      for (const g of M.IMPRENTAS) {
        if (g.cargo > s.cargo + 1) continue;
        const bloq = s.cargo < g.cargo, c = M.costo(s, g);
        h += item('imp:' + g.id, bloq ? '???' : g.n, bloq ? `Se desbloquea siendo ${M.CARGOS[g.cargo].n}.` : `${g.d} +$ ${M.fmt(g.prod * M.multProd(s))}/s cada una.`, bloq ? '🔒' : '$ ' + M.fmt(c), bloq ? null : `×${s.imp[g.id] || 0}`, !bloq && s.caja >= c, bloq ? 'bloq' : (s.caja < c ? 'caro' : ''));
      }
    } else if (tab === 'programas') {
      const pr = [
        ['plan', 'Plan Platita', 'Bono para todos: +9 de aprobación al instante. Empuja la inflación.', M.costoPlan(s)],
        ['prensa', 'Operación de prensa', `Los medios amigos te defienden: +${s.min.relato ? 8 : 4} ya y un poco más por un tiempo. Puede salir mal.`, M.costoPrensa(s)],
        ['subsidio', `Subsidio (${s.subsidios} activos)`, 'Sube la aprobación todos los meses, pero hay que pagarlo cada mes.', M.costoSubsidio(s)],
        ['congelar', s.congelado ? `Precios congelados (${s.congelado} meses)` : 'Congelar precios', 'Baja mucho la inflación por 6 meses. Después, los precios se descongelan de golpe.', M.costoCongelar(s)],
        ['impuesto', `Inventar un impuesto (${s.impuestos})`, `«${M.IMPUESTOS[s.impuestos % M.IMPUESTOS.length]}»: baja la inflación y sube la recaudación, pero la gente se enoja.`, M.costoImpuesto(s)],
      ];
      for (const [id, n, d, c] of pr) h += item('prog:' + id, n, d, '$ ' + M.fmt(c), null, s.caja >= c && !(id === 'congelar' && s.congelado), s.caja < c ? 'caro' : '');
    } else if (tab === 'gabinete') {
      const cn = M.costoNoqui(s);
      h += `<p class="sub">ÑOQUIS (EMPLEADOS QUE NADIE VIO)</p>`;
      h += item('noqui:1', `Contratar un ñoqui (tenés ${s.noquis})`, 'Te devuelve una parte del sueldo: +0,25 puntos de «retorno». La gente se enoja de a poquito.', '$ ' + M.fmt(cn), null, s.caja >= cn, s.caja < cn ? 'caro' : '');
      h += item('noqui:10', 'Contratar 10 ñoquis', 'Para cuando hay que llenar una oficina.', '$ ' + M.fmt(cn * 15.9), null, s.caja >= cn * 15.9, s.caja < cn * 15.9 ? 'caro' : '');
      h += `<p class="sub">MINISTERIOS</p>`;
      for (const m of M.MINISTERIOS) {
        if (m.cargo > s.cargo + 1) continue;
        const bloq = s.cargo < m.cargo, c = M.costoMin(s, m), hecho = !!s.min[m.id];
        h += item('min:' + m.id, bloq ? '???' : m.n, bloq ? `Se desbloquea siendo ${M.CARGOS[m.cargo].n}.` : m.d, hecho ? 'INAUGURADO' : bloq ? '🔒' : '$ ' + M.fmt(c), null, !bloq && !hecho && s.caja >= c, hecho ? 'hecho' : bloq ? 'bloq' : s.caja < c ? 'caro' : '');
      }
      if (s.cargo >= 4) h += `<p class="sub">MONEDA</p>` + item('ceros', 'Sacarle ceros a la moneda', s.precios >= 1000 ? 'Moneda nueva: los precios vuelven a tener pocos dígitos, la inflación se calma un rato y la gente festeja.' : 'Todavía no hay suficientes ceros para sacar (los precios tienen que multiplicarse por mil).', 'GRATIS', null, s.precios >= 1000);
    } else {
      const sig = M.CARGOS[s.cargo + 1];
      h += `<p class="sub">TU CARRERA POLÍTICA</p>`;
      if (sig) h += item('ascender', `Ascender a ${sig.n}`, 'Todo rinde ×2,4 y se desbloquean imprentas y ministerios nuevos.', M.fmtUsd(sig.usd), null, s.usd >= sig.usd, s.usd < sig.usd ? 'caro' : '');
      else h += `<p>Llegaste a lo más alto: tu cara ya está en los billetes.</p>`;
      h += '<ul class="cargos">' + M.CARGOS.map((c, i) => `<li class="${i === s.cargo ? 'yo' : i < s.cargo ? 'pasado' : ''}"><span>${c.n}</span><span>${i ? M.fmtUsd(c.usd) : '—'}</span></li>`).join('') + '</ul>';
      h += `<p class="sub">RANKING DE FORTUNAS POLÍTICAS</p><ul class="cargos rank">` + M.ranking(s).map((r, i) => `<li class="${r.yo ? 'yo' : ''}"><span>${i + 1}. ${r.n}</span><span>${M.fmtUsd(r.usd)}</span></li>`).join('') + '</ul>';
      h += `<p class="sub">LOGROS</p><div class="logros">` + Object.entries(M.LOGROS).map(([k, n]) => `<span class="${s.logros[k] ? 'ok' : ''}">${n}</span>`).join('') + '</div>';
      h += `<p class="sub">ESTADÍSTICAS</p><ul class="stats"><li><span>Billetes impresos</span><span>$ ${M.fmt(s.impresoTotal)}</span></li><li><span>Mandatos ganados</span><span>${s.mandatos}</span></li><li><span>Ceros quitados</span><span>${s.ceros}</span></li><li><span>Clics</span><span>${s.clicks}</span></li></ul>`;
    }
    const panel = $('#tab-' + tab); const scroll = panel.scrollTop; panel.innerHTML = h; panel.scrollTop = scroll;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('.item'); if (!b || b.disabled) return; ac();
    const [k, v] = b.dataset.id.split(':'); let ok = false;
    if (k === 'imp') ok = M.comprar(s, v);
    if (k === 'prog') ok = M.programa(s, v);
    if (k === 'noqui') ok = M.noqui(s, +v) > 0;
    if (k === 'min') ok = M.ministerio(s, v);
    if (k === 'ceros') ok = M.quitarCeros(s);
    if (k === 'ascender') { ok = M.ascender(s); if (ok) { sBueno(); aviso(`¡Ahora sos ${M.CARGOS[s.cargo].n}!`); } }
    if (ok && k !== 'ascender') sCompra(); else if (!ok) sNo();
    pintarTienda(true); tablero();
  });

  /* ───── noticias ───── */
  let ultNoticia = null;
  function noticias() {
    if (s.noticias[0] === ultNoticia) return; ultNoticia = s.noticias[0];
    $('#noticias').innerHTML = s.noticias.slice(0, 14).map(n => `<li class="${n.tipo}"><small>${M.fecha({ mes: Math.floor(n.t / M.MES) }).replace('Año ', 'A').replace(/, (\w{3})\w*/, ' $1')}</small>${esc(n.txt)}</li>`).join('');
    const t = $('#ticker'); const txt = s.noticias.slice(0, 5).map(n => '★ ' + n.txt).join('   ') || 'Tocá la maquinita para imprimir.'; if (t.textContent !== txt) { t.textContent = txt; t.style.animation = 'none'; void t.offsetWidth; t.style.animation = ''; }
    const n = s.noticias[0]; if (n && n.tipo === 'logro') { sBueno(); aviso(n.txt); }
  }
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ───── eventos ───── */
  let eventoMostrado = null;
  function eventos() {
    if (s.evento && eventoMostrado !== s.evento) {
      eventoMostrado = s.evento; const e = M.EVENTOS.find(x => x.id === s.evento.id);
      $('#evT').textContent = e.t; $('#evD').textContent = e.d;
      $('#evOps').innerHTML = e.op.map((o, i) => `<button data-op="${i}">${esc(o.n)}${i === e.def ? ' <small>(si no elegís)</small>' : ''}</button>`).join('');
      $('#mEvento').hidden = false; sEvento();
    }
    if (s.evento) { const k = Math.max(0, (s.evento.vence - s.t) / (s.evento.vence - s.evento.desde)); $('#evTiempo').style.width = (k * 100) + '%'; }
    else if (eventoMostrado) { eventoMostrado = null; $('#mEvento').hidden = true; }
  }
  $('#evOps').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; ac(); const r = M.elegir(s, +b.dataset.op); if (r) aviso(r, 5000); sCompra(); eventos(); });

  /* ───── fin de carrera ───── */
  let finMostrado = false;
  function fin() {
    if (!s.fin || finMostrado) return; finMostrado = true; sMalo();
    $('#finT').textContent = s.fin.motivo === 'juicio' ? '¡JUICIO POLÍTICO!' : 'PERDISTE LAS ELECCIONES';
    $('#finD').textContent = s.fin.motivo === 'juicio' ? 'La aprobación llegó a cero. Te fuiste en helicóptero desde la terraza.' : `Sacaste ${Math.round(s.aprob)} % y necesitabas 40 %. Te vas a dar conferencias al exterior.`;
    $('#finStats').innerHTML = `<li><span>Cargo alcanzado</span><span>${M.CARGOS[s.fin.cargo].n}</span></li><li><span>Duración</span><span>${Math.floor(s.fin.mes / 12)} años y ${s.fin.mes % 12} meses</span></li><li><span>Mandatos ganados</span><span>${s.fin.mandatos}</span></li><li><span>Dólares acumulados</span><span>${M.fmtUsd(s.fin.usd)}</span></li><li><span>Contactos que ganás</span><span>+${s.fin.contactos}</span></li>`;
    $('#mFin').hidden = false;
  }
  $('#bRenacer').onclick = () => { s = M.renacer(s); finMostrado = false; $('#mFin').hidden = true; guardar(); pintarTienda(true); sBueno(); };

  /* ───── menú, ayuda, sonido ───── */
  $('#bAyuda').onclick = () => $('#mAyuda').hidden = false;
  $('#bMenu').onclick = () => $('#mMenu').hidden = false;
  $$('[data-cerrar]').forEach(b => b.onclick = () => b.closest('.modal').hidden = true);
  $('#bSonido').onclick = () => { sonido = !sonido; $('#bSonido').classList.toggle('off', !sonido); try { localStorage.setItem('maquinita:sonido', sonido ? 'si' : 'no'); } catch (e) { } };
  $('#bSonido').classList.toggle('off', !sonido);
  $('#bExportar').onclick = async () => { const cod = btoa(unescape(encodeURIComponent(M.serializar(s)))); try { await navigator.clipboard.writeText(cod); aviso('Código copiado: pegalo en otro navegador para seguir ahí.'); } catch (e) { prompt('Copiá este código:', cod); } };
  $('#bImportar').onclick = () => { const cod = prompt('Pegá el código de tu partida:'); if (!cod) return; try { const n = M.cargar(decodeURIComponent(escape(atob(cod.trim())))); if (!n) throw 0; s = n; finMostrado = false; guardar(); pintarTienda(true); $('#mMenu').hidden = true; aviso('Partida cargada.'); } catch (e) { aviso('Ese código no es válido.'); } };
  $('#bRetirarse').onclick = () => { if (!confirm(`¿Retirarte ahora? Ganás ${M.contactosGanados(s)} contactos y empezás de nuevo.`)) return; s = M.renacer(s); finMostrado = false; guardar(); pintarTienda(true); $('#mMenu').hidden = true; };
  $('#bBorrar').onclick = () => { if (!confirm('¿Borrar todo, incluidos contactos y logros?')) return; s = M.nuevo(); finMostrado = false; guardar(); pintarTienda(true); $('#mMenu').hidden = true; };

  /* ───── guardar ───── */
  function guardar() { try { s.guardado = Date.now(); localStorage.setItem(CLAVE, M.serializar(s)); } catch (e) { } }
  setInterval(guardar, 5000);
  addEventListener('visibilitychange', () => { if (document.hidden) guardar(); });
  addEventListener('pagehide', guardar);

  /* ───── bucle ───── */
  let ultimo = performance.now(), acc = 0;
  function bucle(t) {
    requestAnimationFrame(bucle);
    let dt = (t - ultimo) / 1000; ultimo = t; if (dt > 1) dt = 1; acc += dt;
    // la lógica avanza en pasos de 0,1 s; si la pestaña estuvo dormida, se pone al día (hasta 1 s por cuadro)
    while (acc >= 0.1) { acc -= 0.1; M.paso(s, 0.1); }
    M.revisarLogros(s);
    dibujarEscena(); tablero(); eventos(); noticias(); fin();
    if (frame % 15 === 0) pintarTienda(false);
  }
  // pestaña en segundo plano: el tiempo sigue corriendo con setInterval (los navegadores frenan requestAnimationFrame)
  setInterval(() => { if (document.hidden) { M.paso(s, 1); } }, 1000);

  /* ───── arranque ───── */
  if (!nueva && s.guardado) {
    const ganado = M.offline(s, (Date.now() - s.guardado) / 1000);
    if (ganado > 0) setTimeout(() => aviso(`Mientras no estabas, la maquinita imprimió $ ${M.fmt(ganado)}.`, 6000), 600);
  }
  if (nueva) { $('#mAyuda').hidden = false; M.noticia(s, 'Asumiste como Puntero barrial. Tenés una maquinita y muchas ganas.'); }
  pintarTienda(true);
  requestAnimationFrame(bucle);
  window.__maq = { get s() { return s; }, M };
})();
