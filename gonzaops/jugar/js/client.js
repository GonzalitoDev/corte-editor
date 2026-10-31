/* GonzaOps · cliente: controles, movimiento propio, disparos, red (bots en un Worker u online), sonido, HUD y menús. */
(function () {
  'use strict';
  const Ops = globalThis.Ops, R = globalThis.Render;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const MAPA = Ops.crearMapa();
  const ahora = () => performance.now() / 1000;
  const LS = { get(k, d) { try { const v = localStorage.getItem('gonzaops:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('gonzaops:' + k, JSON.stringify(v)); } catch (e) { } } };
  const AJ = Object.assign({ sens: 1, fov: 80, vol: 0.8, calidad: 'auto', nombre: '', invertir: false }, LS.get('ajustes', {}));
  const TOUCH = matchMedia('(pointer: coarse)').matches;
  if (TOUCH) document.body.classList.add('tactil');
  const NOMBRE_LADO = ['Asalto', 'Guardia'], COLOR_LADO = ['#f39a3d', '#5aa9ff'];
  const GRAN = ['he', 'humo', 'flash'], GRAN_N = { he: 'Granada', humo: 'Humo', flash: 'Cegadora' };

  /* ───────── estado ───────── */
  const S = { jugando: false, modo: null, red: null, yo: 0, info: new Map(), fotos: [], ult: null, off: null, para: 8, tabla: new Map(), menu: false, compra: false, muerto: false, espectar: 0, fin: false };
  const YO = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, suelo: true, yaw: 0, pitch: 0, ag: false, agK: 0, ca: false, gen: 0, vivo: false, sel: 1, armas: [null, null, [0, -1, -1]], gran: { he: 0, humo: 0, flash: 0 }, gs: 'he', ultTiro: -9, recHasta: 0, cambioHasta: 0, cambioT: 0, acum: 0, kick: 0, retro: 0, mira: false, usando: false, ultEnvio: 0, ultTiroLocal: -9, selAnt: 0, hp: 100 };
  const teclas = new Set(); let disparando = false, clicPend = false;

  /* ───────── sonido sintetizado ───────── */
  const Snd = (() => {
    let ctx = null, master, ruido;
    const init = () => {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      master = ctx.createGain(); master.gain.value = AJ.vol; master.connect(ctx.destination);
      ruido = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = ruido.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    };
    const salida = (pos, vol) => {
      const g = ctx.createGain(); g.gain.value = vol;
      if (!pos) { g.connect(master); return g; }
      const p = ctx.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 3; p.rolloffFactor = 1.1; p.maxDistance = 120;
      if (p.positionX) { p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2]; } else p.setPosition(pos[0], pos[1], pos[2]);
      g.connect(p).connect(master); return g;
    };
    const golpe = (pos, vol, f, q, dur, tipo) => {
      if (!ctx) return; const t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = ruido; s.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = tipo || 'bandpass'; fl.frequency.value = f; fl.Q.value = q;
      const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(1, t + .003); e.gain.exponentialRampToValueAtTime(.001, t + dur);
      s.connect(fl).connect(e).connect(salida(pos, vol)); s.start(t, Math.random()); s.stop(t + dur + .05);
    };
    const tono = (pos, vol, f, dur, tipo, f2) => {
      if (!ctx) return; const t = ctx.currentTime, o = ctx.createOscillator(); o.type = tipo || 'sine'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(1, t + .005); e.gain.exponentialRampToValueAtTime(.001, t + dur);
      o.connect(e).connect(salida(pos, vol)); o.start(t); o.stop(t + dur + .05);
    };
    const ARMA = { pampa: [1800, .9, .12, .5], halcon: [900, .8, .3, .9], tero: [2200, 1, .09, .55], tala: [700, .6, .35, 1], ombu: [1300, .9, .16, .8], condor: [600, .7, .5, 1.1] };
    return {
      init, vol(v) { if (master) master.gain.value = v; },
      escucha(x, y, z, yaw) {
        if (!ctx) return; const l = ctx.listener, fx = Math.sin(yaw), fz = -Math.cos(yaw);
        if (l.positionX) { l.positionX.value = x; l.positionY.value = y; l.positionZ.value = z; l.forwardX.value = fx; l.forwardY.value = 0; l.forwardZ.value = fz; l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0; }
        else { l.setPosition(x, y, z); l.setOrientation(fx, 0, fz, 0, 1, 0); }
      },
      disparo(arma, pos) {
        if (!ctx) return; if (arma === 'cuchillo') { golpe(pos, .35, 3000, 2, .12, 'highpass'); return; }
        const a = ARMA[arma] || ARMA.ombu, v = pos ? 1.6 : .55;
        golpe(pos, v * a[3], a[0], .9, a[2]); golpe(pos, v * a[3] * .7, 300, .7, a[2] * 1.6, 'lowpass'); tono(pos, v * .5 * a[3], 140, .12, 'sine', 50);
      },
      paso(pos, vol) { golpe(pos, vol, 900 + Math.random() * 400, 1.4, .07); },
      recarga() { golpe(null, .25, 2500, 4, .05); setTimeout(() => golpe(null, .3, 1800, 4, .06), 380); },
      vacio() { golpe(null, .3, 3500, 6, .03); },
      hit(cab) { tono(null, .22, cab ? 1900 : 1300, cab ? .25 : .08, 'triangle'); },
      herido() { golpe(null, .45, 400, .8, .18, 'lowpass'); },
      explosion(pos, grande) { golpe(pos, grande ? 4 : 2.2, 120, .5, grande ? 2.2 : 1.1, 'lowpass'); golpe(pos, grande ? 1.5 : .9, 900, .5, .4); tono(pos, 1, 60, 1, 'sine', 25); },
      flashPop(pos) { golpe(pos, 1.4, 4000, .5, .2, 'highpass'); },
      rebote(pos) { tono(pos, .25, 1500, .05, 'triangle'); },
      beep(pos, f) { tono(pos, .55, f || 2200, .1, 'square'); },
      pitido(seg) { if (!ctx) return; const t = ctx.currentTime, o = ctx.createOscillator(); o.frequency.value = 3100; const e = ctx.createGain(); e.gain.setValueAtTime(.12, t); e.gain.exponentialRampToValueAtTime(.001, t + seg); o.connect(e).connect(master); o.start(t); o.stop(t + seg); },
      compra() { tono(null, .2, 880, .06, 'triangle'); setTimeout(() => tono(null, .2, 1320, .08, 'triangle'), 60); },
      lanza(pos) { golpe(pos, .3, 600, 1, .15); },
      clic() { tono(null, .12, 700, .04, 'triangle'); },
      ronda(gana) { tono(null, .3, gana ? 660 : 330, .25, 'triangle'); setTimeout(() => tono(null, .3, gana ? 990 : 247, .35, 'triangle'), 200); },
    };
  })();

  /* ───────── red: bots locales (Worker) u online (WebSocket) ───────── */
  function redLocal(cfg) {
    let w = null;
    try { w = new Worker('js/worker.js'); } catch (e) { }
    if (!w) { alert('Tu navegador no pudo iniciar la partida (Worker).'); return null; }
    w.onmessage = e => recibir(e.data);
    w.postMessage({ t: 'start', ...cfg });
    return { enviar: m => w.postMessage(m), pausa: v => w.postMessage({ t: 'pausa', v }), cerrar: () => { w.postMessage({ t: 'stop' }); w.terminate(); }, local: true };
  }
  function entrada(m) { if (S.red) S.red.enviar(S.modo === 'online' ? { t: 'in', m } : { t: 'in', m }); }

  /* ───────── recepción ───────── */
  function recibir(m) {
    switch (m.t) {
      case 'inicio':
        S.yo = m.yo; S.para = m.para || 8; S.info = new Map(m.info.map(i => [i.id, i])); S.fotos = []; S.off = null; S.fin = false; S.tabla = new Map();
        empezarJuego(); break;
      case 'info': S.info = new Map(m.info.map(i => [i.id, i])); break;
      case 'foto': nuevaFoto(m.s, m.ev || []); break;
      case 'tabla': S.tabla = new Map(m.d.map(r => [r[0], r])); if (!$('#sTabla').hidden) pintarTabla(); break;
      case 'chat': feed(`<b style="color:${COLOR_LADO[m.lado] || '#ddd'}">${esc(m.n)}:</b> ${esc(m.m)}`, 8); break;
      default: if (Online.recibir) Online.recibir(m);
    }
  }
  function nuevaFoto(s, ev) {
    const t = ahora();
    const est = s.t - t; S.off = S.off == null ? est : (est > S.off ? S.off * .8 + est * .2 : S.off * .98 + est * .02);
    s.mapa = new Map(s.jug.map(j => [j[0], j]));
    S.fotos.push(s); if (S.fotos.length > 40) S.fotos.shift();
    const prev = S.ult; S.ult = s;
    const me = s.mapa.get(S.yo);
    if (s.yo) sincronizarYo(s.yo, me, prev);
    for (const e of ev) evento(e, s);
    if (me) { const vivo = !!(me[6] & 1); if (YO.vivo && !vivo) morir(); YO.vivo = vivo; YO.hp = me[7]; YO.team = me[9]; }
    if (prev && prev.fase !== s.fase) cambioFase(s.fase, prev.fase);
  }
  function sincronizarYo(y, me, prev) {
    YO.dinero = y.dinero; YO.armor = y.armor; YO.casco = y.casco; YO.kit = y.kit; YO.bomba = y.bomba; YO.puedeComprar = y.compra; YO.prog = y.prog; YO.flashSrv = y.flash;
    const antes = YO.armas;
    // munición: confiar en el servidor si no estamos disparando ni recargando
    const quieto = ahora() - YO.ultTiroLocal > 0.45 && ahora() > YO.recHasta;
    YO.armas = y.armas.map((a, i) => { if (!a) return null; if (!quieto && antes[i] && antes[i][0] === a[0]) return antes[i]; return a.slice(); });
    // si apareció un arma principal nueva (compra o levantó del piso), la saca
    if (y.armas[0] && (!antes[0] || antes[0][0] !== y.armas[0][0])) cambiarA(0);
    if (!YO.armas[YO.sel] && YO.sel !== 3) cambiarA(YO.armas[0] ? 0 : YO.armas[1] ? 1 : 2);
    const g = y.gran; if (ahora() - (YO.ultGranada || 0) > .6) YO.gran = { ...g };
    if (YO.sel === 3 && !(YO.gran.he + YO.gran.humo + YO.gran.flash)) cambiarA(YO.armas[0] ? 0 : 1);
    if (YO.gen !== y.gen && prev) { /* se teletransportó: lo maneja el evento spawn */ }
  }
  function evento(e, s) {
    const yo = S.yo;
    switch (e.e) {
      case 'spawn': if (e.id === yo) { Object.assign(YO, { x: e.x, y: e.y, z: e.z, vx: 0, vy: 0, vz: 0, yaw: e.yaw, pitch: 0, gen: e.gen, vivo: true, recHasta: 0, mira: false, acum: 0, kick: 0, usando: false }); S.muerto = false; S.espectar = 0; $('#muerte').hidden = true; } break;
      case 'corr': if (e.id === yo) { YO.x = e.x; YO.y = e.y; YO.z = e.z; YO.vx = YO.vz = 0; } break;
      case 'ronda_ini': R.limpiarRonda(); limpiarFeed(); mensaje(`Ronda ${e.n}`, 'Comprá tu equipo (B)', 2.5); break;
      case 'vamos': mensaje('¡Vamos!', '', 1.2); break;
      case 'tiro': {
        const arma = Ops.ARMA_ID[e.a];
        if (e.id === yo) break;
        Snd.disparo(arma, e.o);
        if (arma !== 'cuchillo') R.fogonazoMundo(e.o[0], e.o[1], e.o[2]);
        for (const f of e.f) {
          R.trazo([e.o[0], e.o[1] - .15, e.o[2]], [f[0], f[1], f[2]]);
          if (f[3] === 0) { const dx = f[0] - e.o[0], dy = f[1] - e.o[1], dz = f[2] - e.o[2], d = Math.hypot(dx, dy, dz) || 1; const h = Ops.rayo(MAPA, e.o[0], e.o[1], e.o[2], dx / d, dy / d, dz / d, d + .5); if (h.t < d + .5) R.impacto(f[0], f[1], f[2], h.nx, h.ny, h.nz); }
        }
        break;
      }
      case 'herido':
        R.impacto(e.x, e.y, e.z, 0, 1, 0, 'sangre');
        if (e.por === yo && e.id !== yo) { hitmarker(e.cab); Snd.hit(e.cab); }
        if (e.id === yo) { Snd.herido(); daño(e.por, e.dmg); }
        break;
      case 'muerte': {
        const k = S.info.get(e.k), v = S.info.get(e.v), arma = e.a >= 0 ? Ops.ARMAS[Ops.ARMA_ID[e.a]].n : (e.a === -1 ? 'Explosión' : '');
        const col = id => COLOR_LADO[(s.mapa.get(id) || [])[9] ?? 0];
        feed(`${k ? `<b style="color:${col(e.k)}">${esc(k.n)}</b>` : ''} <span class="arma">${esc(arma || '✸')}${e.cab ? ' ◎' : ''}</span> <b style="color:${col(e.v)}">${esc(v ? v.n : '?')}</b>`, 6, e.k === yo || e.v === yo);
        if (e.k === yo && e.v !== yo) { Snd.hit(true); }
        break;
      }
      case 'granada':
        if (e.tipo === 'he') { R.explosion(e.x, e.y, e.z); Snd.explosion([e.x, e.y, e.z]); sacudir(e.x, e.z, 10, .5); }
        else { R.destello(e.x, e.y, e.z); Snd.flashPop([e.x, e.y, e.z]); }
        break;
      case 'flash': if (e.id === yo) { YO.flashHasta = ahora() + e.s; YO.flashTotal = e.s; Snd.pitido(e.s); } break;
      case 'humo': R.humo(e.x, e.y, e.z, 17); Snd.lanza([e.x, e.y, e.z]); break;
      case 'rebote': Snd.rebote([e.x, e.y, e.z]); break;
      case 'lanza': if (e.id !== yo) { const p = s.mapa.get(e.id); if (p) Snd.lanza([p[1], p[2] + 1.4, p[3]]); } break;
      case 'plantada': mensaje('¡Carga plantada!', `Sitio ${e.sitio} · 40 segundos`, 3); Snd.beep([e.x, e.y + .2, e.z], 1600); break;
      case 'desactivada': mensaje('Carga desactivada', '', 2.5); Snd.beep(null, 900); break;
      case 'explota': R.explosion(e.x, e.y, e.z, true); Snd.explosion([e.x, e.y, e.z], true); sacudir(e.x, e.z, 30, 1.2); break;
      case 'plantando': case 'desactivando': { const p = s.mapa.get(e.id); if (p) Snd.beep([p[1], p[2] + .3, p[3]], 1200); break; }
      case 'bomba_cae': if (YO.team === 0) feed('<span class="arma">La carga quedó en el piso</span>', 4); break;
      case 'bomba_toma': if (e.id === yo) mensaje('Tenés la carga', 'Plantala en el sitio A o B (mantené E)', 3); break;
      case 'toma': if (e.id === yo) Snd.compra(); break;
      case 'compra': if (e.id === yo) { Snd.compra(); if (!$('#sCompra').hidden) setTimeout(pintarCompra, 60); } break;
      case 'recarga': if (e.id !== yo) { const p = s.mapa.get(e.id); if (p) Snd.paso([p[1], p[2] + 1, p[3]], .3); } break;
      case 'ronda_fin': {
        const yoLado = YO.team, gano = e.gana === yoLado;
        const motivo = { eliminados: e.gana === 0 ? 'Eliminaron a la Guardia' : 'Eliminaron al Asalto', tiempo: 'Se acabó el tiempo', desactivada: 'Desactivaron la carga', explota: 'La carga explotó' }[e.motivo] || '';
        mensaje(`Ganó ${e.gana === 0 ? 'el Asalto' : 'la Guardia'}`, motivo, 4, COLOR_LADO[e.gana]); Snd.ronda(gano); break;
      }
      case 'medio': mensaje('Medio tiempo', 'Cambian de lado: ahora jugás del otro equipo', 5.5); break;
      case 'fin': finPartida(e); break;
    }
  }
  function cambioFase(f, antes) {
    if (f === 'compra') { if (YO.vivo) cambiarA(YO.armas[0] ? 0 : 1); }
    if (f !== 'compra' && f !== 'juego' && !$('#sCompra').hidden) cerrarCompra();
  }

  /* ───────── controles ───────── */
  const canvas = $('#c');
  function bloquear() { if (!TOUCH && S.jugando && !S.menu && !S.compra && document.pointerLockElement !== canvas) canvas.requestPointerLock && canvas.requestPointerLock(); }
  canvas.addEventListener('click', () => { Snd.init(); bloquear(); });
  document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== canvas && S.jugando && !S.compra && !S.fin && !$('#sTabla').dataset.forzado && !TOUCH && !S.chat) abrirMenu(); });
  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas || !S.jugando) return;
    if (Math.abs(e.movementX) > 350 || Math.abs(e.movementY) > 350) return; // saltos raros del navegador al tomar el mouse
    const k = 0.0022 * AJ.sens * (YO.mira ? 0.32 : 1);
    if (YO.vivo || S.muerto) { YO.yaw += e.movementX * k; YO.pitch -= e.movementY * k * (AJ.invertir ? -1 : 1); YO.pitch = Math.max(-1.5, Math.min(1.5, YO.pitch)); YO.swX = (YO.swX || 0) + e.movementX * .00005; YO.swY = (YO.swY || 0) + e.movementY * .00005; }
  });
  document.addEventListener('mousedown', e => {
    if (document.pointerLockElement !== canvas || !S.jugando) return;
    if (e.button === 0) { disparando = true; clicPend = true; if (S.muerto) cambiarEspectado(1); }
    if (e.button === 2) clicDerecho();
  });
  document.addEventListener('mouseup', e => { if (e.button === 0) disparando = false; });
  document.addEventListener('contextmenu', e => { if (S.jugando) e.preventDefault(); });
  document.addEventListener('wheel', e => { if (document.pointerLockElement === canvas && YO.vivo) { const orden = [0, 1, 2, 3].filter(i => i === 3 ? tieneGranada() : YO.armas[i]); const k = orden.indexOf(YO.sel); if (orden.length) cambiarA(orden[(k + (e.deltaY > 0 ? 1 : -1) + orden.length) % orden.length]); } }, { passive: true });
  addEventListener('keydown', e => {
    if (S.chat) return;
    if (!S.jugando) return;
    if (e.code === 'Tab') { e.preventDefault(); mostrarTabla(true); return; }
    if (e.code === 'Escape') { if (S.compra) cerrarCompra(); return; }
    if (e.repeat) return;
    teclas.add(e.code);
    switch (e.code) {
      case 'Digit1': cambiarA(0); break; case 'Digit2': cambiarA(1); break; case 'Digit3': cambiarA(2); break;
      case 'Digit4': ciclarGranada(); break;
      case 'KeyQ': cambiarA(YO.selAnt); break;
      case 'KeyR': recargar(); break;
      case 'KeyG': soltar(); break;
      case 'KeyE': usar(true); break;
      case 'KeyB': S.compra ? cerrarCompra() : abrirCompra(); break;
      case 'Enter': if (S.modo === 'online') abrirChat(); break;
      case 'KeyC': case 'ControlLeft': YO.ag = true; break;
    }
    if (S.compra && /^Digit[1-9]$/.test(e.code)) { }
  });
  addEventListener('keyup', e => {
    teclas.delete(e.code);
    if (e.code === 'Tab') mostrarTabla(false);
    if (e.code === 'KeyE') usar(false);
    if (e.code === 'KeyC' || e.code === 'ControlLeft') YO.ag = false;
  });
  addEventListener('blur', () => { teclas.clear(); disparando = false; usar(false); YO.ag = false; });
  function clicDerecho() {
    if (!YO.vivo) return;
    if (YO.sel === 3) { lanzarGranada(true); return; }
    const a = armaNombre(); if (a && Ops.ARMAS[a].mira) { YO.mira = !YO.mira; Snd.clic(); }
  }
  function usar(on) { if (YO.usando === on) return; YO.usando = on; entrada({ t: 'u', on }); }

  /* ───────── armas ───────── */
  function armaNombre() { if (YO.sel === 3) return null; const a = YO.armas[YO.sel]; return a ? Ops.ARMA_ID[a[0]] : null; }
  function tieneGranada() { return YO.gran.he + YO.gran.humo + YO.gran.flash > 0; }
  function cambiarA(i) {
    if (i === YO.sel || (i === 3 ? !tieneGranada() : !YO.armas[i])) return;
    if (i === 3 && !YO.gran[YO.gs]) YO.gs = GRAN.find(g => YO.gran[g] > 0);
    YO.selAnt = YO.sel; YO.sel = i; YO.recHasta = 0; YO.mira = false; YO.cambioT = ahora(); YO.cambioHasta = ahora() + .45; YO.acum = 0;
    Snd.clic();
  }
  function ciclarGranada() {
    if (!tieneGranada()) return;
    if (YO.sel !== 3) { cambiarA(3); return; }
    const disp = GRAN.filter(g => YO.gran[g] > 0); const k = disp.indexOf(YO.gs); YO.gs = disp[(k + 1) % disp.length]; Snd.clic();
  }
  function recargar() {
    const n = armaNombre(); if (!n) return; const A = Ops.ARMAS[n], a = YO.armas[YO.sel];
    if (!A.carg || ahora() < YO.recHasta || a[1] >= A.carg || a[2] <= 0 || !YO.vivo) return;
    YO.recHasta = ahora() + A.recarga; YO.recIni = ahora(); YO.mira = false; entrada({ t: 'r' }); Snd.recarga();
    setTimeout(() => { if (YO.recHasta && ahora() >= YO.recHasta - .01 && YO.armas[YO.sel] === a) { const falta = A.carg - a[1], pone = Math.min(falta, a[2]); a[1] += pone; a[2] -= pone; } }, A.recarga * 1000);
  }
  function soltar() { if (YO.sel > 1 || !YO.armas[YO.sel] || !YO.vivo) return; entrada({ t: 'x' }); YO.armas[YO.sel] = null; cambiarA(YO.armas[0] ? 0 : YO.armas[1] ? 1 : 2); }
  function ojoY() { return YO.y + Ops.OJO + (Ops.OJO_AG - Ops.OJO) * YO.agK; }
  function puedeActuar() { const s = S.ult; return S.jugando && YO.vivo && s && s.fase !== 'compra' && s.fase !== 'fin' && !S.menu && !S.compra; }
  function intentarDisparo() {
    if (!puedeActuar()) return;
    if (YO.sel === 3) { if (clicPend) lanzarGranada(false); return; }
    const n = armaNombre(); if (!n) return; const A = Ops.ARMAS[n], a = YO.armas[YO.sel], t = ahora();
    if (t < YO.cambioHasta || t < YO.recHasta) return;
    if (!A.auto && !clicPend) return;
    if (t - YO.ultTiro < A.cad) return;
    if (!A.mele && a[1] <= 0) { if (clicPend) { Snd.vacio(); recargar(); } return; }
    YO.ultTiro = t; YO.ultTiroLocal = t; if (!A.mele) a[1]--;
    const ox = YO.x, oy = ojoY(), oz = YO.z;
    if (A.mele) { YO.corte = 1; Snd.disparo('cuchillo'); entrada({ t: 'f', d: [Ops.dirVista(YO.yaw, YO.pitch).map(r4)], rt: tiempoVista() }); return; }
    // dispersión y retroceso
    if (t - (YO.ultRafaga || 0) > .35) YO.acum = 0; YO.ultRafaga = t;
    const vel = Math.hypot(YO.vx, YO.vz);
    let sp = A.mira ? (YO.mira ? A.spMira : A.sp) : A.sp;
    sp += A.spMov * Math.min(1, vel / 3.5) + (YO.suelo ? 0 : .09); if (YO.ag) sp *= .7;
    sp += Math.min(.06, YO.acum * A.rec * .35);
    const rx = Math.sin(YO.acum * .7) * YO.acum * A.rec * .18, ry = Math.min(.22, YO.acum * A.rec * .55);
    const dirs = [];
    for (let k = 0; k < (A.perdigones || 1); k++) { const ang = Math.random() * 6.283, r = Math.sqrt(Math.random()) * sp; dirs.push(Ops.dirVista(YO.yaw + rx + Math.cos(ang) * r, YO.pitch + ry + Math.sin(ang) * r).map(r4)); }
    entrada({ t: 'f', d: dirs, rt: tiempoVista() });
    YO.acum++; YO.kick += A.rec * (A.auto ? .5 : 1.4) + (n === 'condor' ? .03 : 0); YO.retro = 1; YO.fog = .05;
    if (YO.mira && n === 'condor') YO.mira = false;
    Snd.disparo(n); R.fogonazoMundo(ox + Math.sin(YO.yaw) * .8, oy, oz - Math.cos(YO.yaw) * .8);
    // efectos locales: trazos y marcas en la pared
    const fx = Math.cos(YO.yaw) * .14, fz = Math.sin(YO.yaw) * .14;
    for (const d of dirs) {
      const w = Ops.rayo(MAPA, ox, oy, oz, d[0], d[1], d[2], 120);
      let tp = Infinity; for (const [id, j] of posVista) { if (id === S.yo || !j.vivo || j.team === YO.team) continue; const h = Ops.golpeCuerpo(ox, oy, oz, d, j.x, j.y, j.z, j.ag); if (h && h.t < tp) tp = h.t; }
      const fin = Math.min(w.t, tp, 120);
      if (Math.random() < (A.auto ? .5 : 1)) R.trazo([ox + fx + d[0] * .6, oy - .12 + d[1] * .6, oz + fz + d[2] * .6], [ox + d[0] * fin, oy + d[1] * fin, oz + d[2] * fin]);
      if (w.t < tp && w.t < 120) R.impacto(ox + d[0] * w.t, oy + d[1] * w.t, oz + d[2] * w.t, w.nx, w.ny, w.nz);
    }
    if (a[1] === 0) setTimeout(recargar, 250);
  }
  function lanzarGranada(suave) {
    if (!puedeActuar() || !YO.gran[YO.gs] || ahora() - (YO.ultGranada || 0) < .8) return;
    YO.ultGranada = ahora(); YO.gran[YO.gs]--; entrada({ t: 'g', tipo: YO.gs, d: Ops.dirVista(YO.yaw, YO.pitch).map(r4), suave }); YO.corte = 1; Snd.lanza(null);
    setTimeout(() => { if (YO.sel === 3 && !YO.gran[YO.gs]) { const otra = GRAN.find(g => YO.gran[g] > 0); if (otra) YO.gs = otra; else cambiarA(YO.armas[0] ? 0 : YO.armas[1] ? 1 : 2); } }, 300);
  }
  const r4 = v => Math.round(v * 10000) / 10000;
  function tiempoVista() { return ahora() + (S.off || 0) - retraso(); }
  function retraso() { return S.modo === 'online' ? 0.1 : 0.04; }

  /* ───────── movimiento propio ───────── */
  const joy = { x: 0, y: 0 };
  function moverYo(dt) {
    const s = S.ult; if (!s) return;
    const libre = YO.vivo && s.fase !== 'compra' && s.fase !== 'fin' && !S.menu && !(YO.usando && YO.prog > 0);
    let f = 0, l = 0;
    if (libre && !S.chat) { if (teclas.has('KeyW')) f++; if (teclas.has('KeyS')) f--; if (teclas.has('KeyD')) l++; if (teclas.has('KeyA')) l--; f += -joy.y; l += joy.x; }
    const m = Math.hypot(f, l); if (m > 1) { f /= m; l /= m; }
    YO.ca = teclas.has('ShiftLeft') || teclas.has('ShiftRight');
    const n = armaNombre(); let v = Ops.VEL * (n ? Ops.ARMAS[n].vel : 1); if (YO.ca) v *= .52; if (YO.ag) v *= .36; if (YO.mira) v *= .6;
    const sy = Math.sin(YO.yaw), cy = Math.cos(YO.yaw);
    const dx = (sy * f + cy * l) * v, dz = (-cy * f + sy * l) * v;
    const saltar = libre && (teclas.has('Space') || joy.saltar);
    joy.saltar = false;
    if (YO.vivo) {
      const ax = YO.x, az = YO.z;
      Ops.mover(MAPA, YO, dx, dz, dt, saltar && !YO.ag);
      if (s.fase === 'compra') { YO.x = ax; YO.z = az; }
      // pasos propios
      const d = Math.hypot(YO.x - ax, YO.z - az); YO.dist = (YO.dist || 0) + d;
      if (YO.dist > 2.3 && YO.suelo && !YO.ca && !YO.ag) { YO.dist = 0; Snd.paso(null, .18); }
      YO.bob = (YO.bob || 0) + d * 2.2;
    }
    YO.agK += ((YO.ag ? 1 : 0) - YO.agK) * Math.min(1, dt * 12);
  }
  function enviarEstado(t) {
    if (!S.red || t - YO.ultEnvio < 1 / 30) return; YO.ultEnvio = t;
    entrada({ t: 'st', gen: YO.gen, x: r3(YO.x), y: r3(YO.y), z: r3(YO.z), yaw: r4(YO.yaw), pitch: r4(YO.pitch), ag: YO.ag, ca: YO.ca, mira: YO.mira, sel: YO.sel, gs: YO.gs, su: YO.suelo });
  }
  const r3 = v => Math.round(v * 1000) / 1000;

  /* ───────── otros jugadores (interpolados) ───────── */
  const posVista = new Map(); const pasosOtros = new Map();
  function interpolar(dt) {
    const fotos = S.fotos; if (!fotos.length) return;
    const rt = tiempoVista();
    let a = fotos[0], b = fotos[fotos.length - 1];
    for (let i = fotos.length - 1; i > 0; i--) if (fotos[i - 1].t <= rt) { a = fotos[i - 1]; b = fotos[i]; break; }
    const k = b.t > a.t ? Math.max(0, Math.min(1.2, (rt - a.t) / (b.t - a.t))) : 1;
    for (const jb of b.jug) {
      const id = jb[0], ja = a.mapa.get(id) || jb;
      const lerpA = (x, y) => { let d = y - x; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return x + d * k; };
      const o = { x: ja[1] + (jb[1] - ja[1]) * k, y: ja[2] + (jb[2] - ja[2]) * k, z: ja[3] + (jb[3] - ja[3]) * k, yaw: lerpA(ja[4], jb[4]), pitch: ja[5] + (jb[5] - ja[5]) * k, vivo: !!(jb[6] & 1), ag: !!(jb[6] & 2), ca: !!(jb[6] & 4), bomba: !!(jb[6] & 32), team: jb[9], arma: jb[8], hp: jb[7], flags: jb[6] };
      const prev = posVista.get(id); o.vel = prev ? Math.hypot(o.x - prev.x, o.z - prev.z) / Math.max(dt, 1e-3) : 0; o.vel = Math.min(8, o.vel);
      posVista.set(id, o);
      if (id === S.yo) continue;
      const info = S.info.get(id) || { n: '?' };
      R.jugador(id, o.team);
      const mismo = o.team === YO.team;
      R.etiqueta(id, info.n, mismo ? COLOR_LADO[o.team] : '#ff7b6b');
      R.pose(id, { ...o, nombreVisible: mismo, visible: !(S.muerto && S.espectar === id) }, dt);
      // pasos de los demás
      if (o.vivo && o.vel > 2.6 && !(o.flags & 64)) { const acc = (pasosOtros.get(id) || 0) + o.vel * dt; if (acc > 2.3) { pasosOtros.set(id, 0); Snd.paso([o.x, o.y + .1, o.z], mismo ? .35 : .7); } else pasosOtros.set(id, acc); }
    }
  }

  /* ───────── cámara, espectador y HUD ───────── */
  let sacudida = 0;
  function sacudir(x, z, rango, f) { const d = Math.hypot(YO.x - x, YO.z - z); if (d < rango) sacudida = Math.max(sacudida, f * (1 - d / rango)); }
  function morir() { S.muerto = true; YO.mira = false; usar(false); disparando = false; S.espectar = 0; setTimeout(() => { if (S.muerto) cambiarEspectado(1); }, 1800); $('#muerte').hidden = false; }
  function cambiarEspectado(dir) {
    const vivos = [...posVista.entries()].filter(([id, o]) => id !== S.yo && o.vivo && o.team === YO.team).map(([id]) => id);
    if (!vivos.length) { S.espectar = 0; return; }
    const k = vivos.indexOf(S.espectar); S.espectar = vivos[(k + dir + vivos.length) % vivos.length];
  }
  function camara(dt) {
    let x, y, z, yaw, pitch;
    if (window.__camLibre) { const c = window.__camLibre; R.camara(c.x, c.y, c.z, c.yaw, c.pitch, AJ.fov, 0); return; }
    if (S.muerto && S.espectar && posVista.get(S.espectar) && posVista.get(S.espectar).vivo) {
      const o = posVista.get(S.espectar); x = o.x; y = o.y + (o.ag ? Ops.OJO_AG : Ops.OJO); z = o.z; yaw = o.yaw; pitch = o.pitch;
      setT('#muerteT', `Mirando a ${(S.info.get(S.espectar) || {}).n || ''} · clic para cambiar`);
    } else if (S.muerto) {
      const o = posVista.get(S.yo) || YO; x = o.x - Math.sin(YO.yaw) * 4; y = (o.y || 0) + 3.5; z = o.z + Math.cos(YO.yaw) * 4; yaw = YO.yaw; pitch = -.5;
      setT('#muerteT', 'Esperando la próxima ronda');
    } else { x = YO.x; y = ojoY(); z = YO.z; yaw = YO.yaw; pitch = YO.pitch + YO.kick; }
    sacudida *= Math.pow(.02, dt); const sh = sacudida > .01 ? (Math.random() - .5) * sacudida * .06 : 0;
    const fov = YO.mira && !S.muerto ? 22 : AJ.fov;
    R.camara(x, y, z, yaw + sh, pitch, fov, sh);
    Snd.escucha(x, y, z, yaw);
  }
  const cacheT = new Map();
  function setT(sel, txt) { if (cacheT.get(sel) === txt) return; cacheT.set(sel, txt); const el = $(sel); if (el) el.textContent = txt; }
  function setH(sel, html) { if (cacheT.get(sel) === html) return; cacheT.set(sel, html); const el = $(sel); if (el) el.innerHTML = html; }
  function hud() {
    const s = S.ult; if (!s) return;
    const t = ahora();
    // marcador y reloj
    const ladoSq = sq => sq === 0 ? s.lado0 : 1 - s.lado0;
    const sqA = ladoSq(0) === 0 ? 0 : 1; // escuadra que ataca
    setT('#mA', s.marc[sqA]); setT('#mG', s.marc[1 - sqA]);
    const b = s.bomba;
    if (b.e === 'plantada') { setT('#reloj', '💣'); $('#reloj').classList.add('bomba'); }
    else { $('#reloj').classList.remove('bomba'); const tf = Math.ceil(s.tf); setT('#reloj', `${Math.floor(tf / 60)}:${String(tf % 60).padStart(2, '0')}`); }
    setT('#fase', s.fase === 'compra' ? 'COMPRA' : s.fase === 'medio' ? 'MEDIO TIEMPO' : `RONDA ${s.ronda}`);
    // vivos por lado
    let va = 0, vg = 0; for (const j of s.jug) if (j[6] & 1) { if (j[9] === 0) va++; else vg++; }
    setH('#vivosA', '●'.repeat(va) + '<i>' + '●'.repeat(Math.max(0, s.jug.filter(j => j[9] === 0).length - va)) + '</i>');
    setH('#vivosG', '<i>' + '●'.repeat(Math.max(0, s.jug.filter(j => j[9] === 1).length - vg)) + '</i>' + '●'.repeat(vg));
    // vida, chaleco, plata
    setT('#hp', YO.vivo ? YO.hp : 0); $('#hpB').style.width = (YO.vivo ? YO.hp : 0) + '%'; $('#hp').parentNode.classList.toggle('bajo', YO.hp <= 25);
    setT('#ar', YO.armor || 0); setT('#casco', YO.casco ? '⛑' : ''); setT('#plata', '$ ' + (YO.dinero || 0));
    $('#plata').classList.toggle('compra', !!YO.puedeComprar);
    // arma
    const n = armaNombre();
    if (YO.sel === 3) { setT('#armaN', GRAN_N[YO.gs] + ` ×${YO.gran[YO.gs]}`); setT('#muni', ''); setT('#res', ''); }
    else if (n) { const A = Ops.ARMAS[n], a = YO.armas[YO.sel]; setT('#armaN', A.n); setT('#muni', A.carg ? a[1] : '—'); setT('#res', A.carg ? '/ ' + a[2] : ''); $('#muni').classList.toggle('bajo', A.carg && a[1] <= A.carg * .25); }
    setT('#grans', GRAN.map(g => YO.gran[g] ? `${{ he: '●', humo: '◍', flash: '◌' }[g]}${YO.gran[g] > 1 ? YO.gran[g] : ''}` : '').join(' '));
    setT('#extras', (YO.bomba ? '💣 ' : '') + (YO.kit ? '🔧' : ''));
    // progreso de plantar/desactivar
    const pr = YO.prog || 0, max = YO.team === 0 ? 3.2 : (YO.kit ? 5 : 10);
    $('#prog').hidden = !(pr > 0 && YO.vivo); if (pr > 0) { $('#progB').style.width = Math.min(100, pr / max * 100) + '%'; setT('#progT', YO.team === 0 ? 'Plantando la carga…' : 'Desactivando…'); }
    // pista contextual
    let pista = '';
    if (YO.vivo && s.fase === 'juego') {
      const z = Ops.zonaEn(MAPA, YO.x, YO.z);
      if (YO.bomba && (z === 3 || z === 4) && !pr) pista = 'Mantené E para plantar la carga';
      else if (YO.team === 1 && b.e === 'plantada' && Math.hypot(YO.x - b.x, YO.z - b.z) < 1.7 && !pr) pista = 'Mantené E para desactivar';
    }
    if (s.fase === 'compra' || (YO.puedeComprar && s.fase === 'juego')) pista = pista || (S.compra ? '' : 'B: comprar');
    setT('#pista', pista);
    // ceguera
    const fl = YO.flashHasta ? Math.max(0, YO.flashHasta - t) : 0; $('#flash').style.opacity = fl > 0 ? Math.min(1, fl / Math.min(1.2, YO.flashTotal || 1)) : 0;
    // mira del Cóndor
    $('#mira').hidden = !(YO.mira && !S.muerto); $('#cruz').hidden = !!(YO.mira || S.muerto || n === 'condor' && !YO.mira && false);
    // cruz dinámica
    if (n && Ops.ARMAS[n].carg) { const A = Ops.ARMAS[n]; const gap = 4 + (A.spMov * Math.min(1, Math.hypot(YO.vx, YO.vz) / 3.5) + (YO.suelo ? 0 : .09) + Math.min(.06, YO.acum * A.rec * .35)) * 260; $('#cruz').style.setProperty('--g', Math.min(40, gap) + 'px'); }
    $('#cruz').classList.toggle('oculta', n === 'condor');
    // radar
    if (!hud.radarT || t - hud.radarT > .1) { hud.radarT = t; radar(s); }
    $('#hitm').classList.toggle('on', t < (S.hitHasta || 0));
    // daño recibido
    $('#dano').style.opacity = Math.max(0, ((S.danoHasta || 0) - t) / .6);
  }
  function hitmarker(cab) { S.hitHasta = ahora() + .18; $('#hitm').classList.toggle('cab', !!cab); }
  function daño(por, dmg) {
    S.danoHasta = ahora() + .6;
    const o = posVista.get(por); if (!o) return;
    const ang = Math.atan2(o.x - YO.x, -(o.z - YO.z)) - YO.yaw;
    const el = document.createElement('i'); el.className = 'dir'; el.style.transform = `rotate(${ang}rad)`; $('#dirs').appendChild(el); setTimeout(() => el.remove(), 1400);
  }

  /* radar */
  const radarFondo = (() => {
    const c = document.createElement('canvas'), k = 4; c.width = MAPA.W * k; c.height = MAPA.H * k; const x = c.getContext('2d');
    for (let z = 0; z < MAPA.H; z++) for (let w = 0; w < MAPA.W; w++) { const h = MAPA.h[z * MAPA.W + w], zn = MAPA.zona[z * MAPA.W + w]; x.fillStyle = h === 0 ? (zn === 3 || zn === 4 ? 'rgba(232,196,58,.28)' : 'rgba(200,210,220,.22)') : h < 3 ? 'rgba(200,210,220,.5)' : 'rgba(0,0,0,0)'; x.fillRect(w * k, z * k, k, k); }
    x.fillStyle = '#e8c43a'; x.font = 'bold 16px sans-serif'; x.textAlign = 'center'; for (const [n, s] of Object.entries(MAPA.sitios)) x.fillText(n, s.x / MAPA.CELL * k, s.z / MAPA.CELL * k + 6);
    return c;
  })();
  function radar(s) {
    const c = $('#radar'), x = c.getContext('2d'), W = c.width, k = W / (MAPA.W * MAPA.CELL) * 1;
    x.clearRect(0, 0, W, c.height); x.drawImage(radarFondo, 0, 0, W, c.height);
    const sx = v => v * W / (MAPA.W * MAPA.CELL), sz = v => v * c.height / (MAPA.H * MAPA.CELL);
    const vistos = new Set();
    for (const [id, o] of posVista) {
      if (!o.vivo) continue;
      if (o.team !== YO.team) {
        // visible si yo o un compañero lo ve
        let ve = false; for (const [id2, a] of posVista) { if (!a.vivo || a.team !== YO.team) continue; const ax = id2 === S.yo ? YO.x : a.x, az = id2 === S.yo ? YO.z : a.z, ay = (id2 === S.yo ? YO.y : a.y) + 1.6; if (Math.hypot(ax - o.x, az - o.z) < 60 && Ops.libre(MAPA, ax, ay, az, o.x, o.y + 1.4, o.z)) { ve = true; break; } }
        if (!ve) continue;
      }
      vistos.add(id);
      const yo = id === S.yo; const px = sx(yo ? YO.x : o.x), pz = sz(yo ? YO.z : o.z);
      x.fillStyle = yo ? '#fff' : o.team === YO.team ? COLOR_LADO[o.team] : '#ff5a4a';
      x.beginPath(); x.arc(px, pz, yo ? 4 : 3.2, 0, 7); x.fill();
      if (yo || o.team === YO.team) { const yw = yo ? YO.yaw : o.yaw; x.strokeStyle = x.fillStyle; x.lineWidth = 1.5; x.beginPath(); x.moveTo(px, pz); x.lineTo(px + Math.sin(yw) * 9, pz - Math.cos(yw) * 9); x.stroke(); }
      if (o.bomba && YO.team === 0) { x.fillStyle = '#ff3b2b'; x.fillRect(px - 2, pz - 9, 4, 4); }
    }
    const b = s.bomba;
    if ((b.e === 'suelo' && YO.team === 0) || b.e === 'plantada') { x.fillStyle = b.e === 'plantada' && (ahora() % .6) < .3 ? '#fff' : '#ff3b2b'; x.fillRect(sx(b.x) - 3, sz(b.z) - 3, 6, 6); }
  }

  /* ───────── mensajes, feed, tabla ───────── */
  function mensaje(t1, t2, seg, color) { const m = $('#msg'); m.querySelector('b').textContent = t1; m.querySelector('b').style.color = color || ''; m.querySelector('span').textContent = t2 || ''; m.hidden = false; clearTimeout(mensaje.t); mensaje.t = setTimeout(() => m.hidden = true, seg * 1000); }
  function feed(html, seg, destacar) { const d = document.createElement('div'); d.innerHTML = html; if (destacar) d.className = 'yo'; $('#feed').appendChild(d); while ($('#feed').children.length > 6) $('#feed').firstChild.remove(); setTimeout(() => d.remove(), seg * 1000); }
  function limpiarFeed() { }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function mostrarTabla(v) { $('#sTabla').hidden = !v; if (v) pintarTabla(); }
  function pintarTabla() {
    const s = S.ult; if (!s) return;
    const filas = sq => [...S.info.values()].filter(i => i.sq === sq).map(i => { const r = S.tabla.get(i.id) || [i.id, 0, 0, 0, 0]; const j = s.mapa.get(i.id); return { i, r, vivo: j && (j[6] & 1), lado: j ? j[9] : 0 }; }).sort((a, b) => b.r[1] - a.r[1] || a.r[2] - b.r[2]);
    let html = '';
    for (const sq of [0, 1]) {
      const f = filas(sq); if (!f.length) continue; const lado = f[0].lado;
      html += `<div class="eq"><h3 style="color:${COLOR_LADO[lado]}">${NOMBRE_LADO[lado]} <b>${s.marc[sq]}</b></h3><table><tr><th>Jugador</th><th>Bajas</th><th>Muertes</th><th>Asist.</th><th>Plata</th></tr>`;
      for (const { i, r, vivo } of f) html += `<tr class="${i.id === S.yo ? 'yo' : ''} ${vivo ? '' : 'muerto'}"><td>${esc(i.n)}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${lado === YO.team ? '$' + r[4] : ''}</td></tr>`;
      html += '</table></div>';
    }
    $('#tabla').innerHTML = html + `<p class="hint">Primero en llegar a ${s.para} rondas gana · ronda ${s.ronda}</p>`;
  }

  /* ───────── compra ───────── */
  const MENU_COMPRA = [
    ['Pistolas', ['pampa', 'halcon']], ['Subfusil y escopeta', ['tero', 'tala']], ['Rifles', ['ombu', 'condor']],
    ['Equipo', ['chaleco', 'casco', 'kit']], ['Granadas', ['he', 'humo', 'flash']],
  ];
  function abrirCompra() {
    if (!YO.puedeComprar || !YO.vivo) { if (S.ult && S.ult.fase === 'juego') mensaje('No podés comprar', 'Solo en tu base y al principio de la ronda', 1.5); return; }
    S.compra = true; $('#sCompra').hidden = false; if (document.pointerLockElement) document.exitPointerLock(); pintarCompra();
  }
  function cerrarCompra() { S.compra = false; $('#sCompra').hidden = true; bloquear(); }
  function pintarCompra() {
    setT('#compraPlata', '$ ' + YO.dinero);
    let html = '', n = 0;
    for (const [cat, items] of MENU_COMPRA) {
      html += `<div class="cat"><h4>${cat}</h4>`;
      for (const it of items) {
        const A = Ops.ARMAS[it], E = Ops.EQUIPO[it]; n++;
        if (it === 'kit' && YO.team !== 1) continue;
        const precio = A ? A.precio : (it === 'casco' && YO.armor >= 100 && !YO.casco ? 350 : E.precio);
        const tiene = A ? YO.armas.some(a => a && Ops.ARMA_ID[a[0]] === it) : it === 'chaleco' ? YO.armor >= 100 : it === 'casco' ? YO.casco : it === 'kit' ? YO.kit : YO.gran[it] >= E.max;
        const det = A ? (A.mele ? '' : `${A.dmg}${A.perdigones ? '×' + A.perdigones : ''} daño · ${A.carg} balas${A.auto ? ' · automática' : ''}${A.mira ? ' · mira' : ''}`) : { chaleco: 'Reduce el daño al cuerpo', casco: 'Protege también la cabeza', kit: 'Desactivás en 5 s', he: 'Daño en área', humo: 'Tapa la visión 17 s', flash: 'Ciega a quien la mira' }[it];
        html += `<button class="it ${tiene ? 'tiene' : ''}" data-item="${it}" ${YO.dinero < precio || tiene ? 'disabled' : ''}><span>${(A || E).n}</span><small>${det}</small><b>$${precio}</b></button>`;
      }
      html += '</div>';
    }
    $('#compraLista').innerHTML = html;
    $$('#compraLista .it').forEach(b => b.onclick = () => { entrada({ t: 'c', item: b.dataset.item }); setTimeout(pintarCompra, 120); });
  }

  /* ───────── chat online ───────── */
  function abrirChat() { S.chat = true; if (document.pointerLockElement) document.exitPointerLock(); $('#chatBox').hidden = false; $('#chatIn').value = ''; $('#chatIn').focus(); }
  $('#chatBox').onsubmit = e => { e.preventDefault(); const m = $('#chatIn').value.trim(); if (m && S.red) S.red.enviar({ t: 'chat', m }); cerrarChat(); };
  $('#chatIn').onkeydown = e => { if (e.key === 'Escape') cerrarChat(); };
  function cerrarChat() { S.chat = false; $('#chatBox').hidden = true; bloquear(); }

  /* ───────── menús y pantallas ───────── */
  function pantalla(id) { $$('.screen').forEach(s => s.hidden = s.id !== id); }
  function empezarJuego() {
    S.jugando = true; S.menu = false; S.muerto = false; S.fin = false;
    pantalla(null); $('#hud').hidden = false; $('#touch').hidden = !TOUCH;
    YO.armas = [null, [Ops.ID_ARMA.pampa, 12, 36], [Ops.ID_ARMA.cuchillo, -1, -1]]; YO.sel = 1; YO.gran = { he: 0, humo: 0, flash: 0 };
    for (const id of [...posVista.keys()]) { R.quitarJugador(id); posVista.delete(id); }
    mensaje('GonzaOps', TOUCH ? 'Mové con el círculo · mirá arrastrando a la derecha' : 'Hacé clic para tomar el mouse', 3);
    bloquear();
  }
  function abrirMenu() { if (!S.jugando || S.fin) return; S.menu = true; $('#sMenu').hidden = false; if (S.red && S.red.local) S.red.pausa(true); setT('#menuNota', S.modo === 'bots' ? 'Partida en pausa' : 'La partida sigue mientras estás en el menú'); disparando = false; teclas.clear(); }
  function cerrarMenu() { S.menu = false; $('#sMenu').hidden = true; if (S.red && S.red.local) S.red.pausa(false); bloquear(); }
  function salir() {
    if (S.red) { S.red.cerrar(); S.red = null; }
    S.jugando = false; S.menu = false; S.fin = false; $('#hud').hidden = true; $('#touch').hidden = true; $('#sMenu').hidden = true; $('#sFin').hidden = true; $('#sCompra').hidden = true;
    if (document.pointerLockElement) document.exitPointerLock();
    for (const id of [...posVista.keys()]) { R.quitarJugador(id); posVista.delete(id); }
    pantalla('sec-titulo');
  }
  function finPartida(e) {
    S.fin = true; if (document.pointerLockElement) document.exitPointerLock();
    const miSq = (S.info.get(S.yo) || {}).sq; const gane = e.gana === miSq;
    setT('#finT', gane ? '¡VICTORIA!' : 'DERROTA'); $('#finT').className = 'fin ' + (gane ? 'gano' : 'perdio');
    setT('#finM', `${e.marc[miSq]} a ${e.marc[1 - miSq]}`);
    setTimeout(() => { $('#sFin').hidden = false; pintarTabla(); $('#finTabla').innerHTML = $('#tabla').innerHTML; $('#bRevancha').hidden = S.modo !== 'bots'; }, 2500);
  }

  // botones de pantallas
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-ir],[data-accion]'); if (!b) return; Snd.init();
    if (b.dataset.ir) { pantalla(b.dataset.ir === 'atras' ? (S.atras || 'sec-titulo') : 'sec-' + b.dataset.ir); if (b.dataset.ir === 'online') Online.mostrar(); return; }
    const a = b.dataset.accion;
    if (a === 'jugarBots') jugarBots();
    if (a === 'seguir') cerrarMenu();
    if (a === 'salir') salir();
    if (a === 'revancha') { $('#sFin').hidden = true; salir(); jugarBots(); }
    if (a === 'volver') { $('#sFin').hidden = true; salir(); }
    if (a === 'cerrarCompra') cerrarCompra();
    if (a === 'ajustes') { pintarAjustes(); $('#sAjustes').hidden = false; }
    if (a === 'cerrarAjustes') { $('#sAjustes').hidden = true; }
  });
  $$('.screen').forEach(s => { if (s.id.startsWith('sec-')) return; });
  function jugarBots() {
    const nombre = ($('#bNombre').value.trim() || AJ.nombre || 'Vos').slice(0, 16); AJ.nombre = nombre; LS.set('ajustes', AJ);
    const lado = $('#bLado').value, dif = $('#bDif').value, largo = $('#bLargo').value;
    S.modo = 'bots'; Snd.init();
    S.red = redLocal({ nombre, squad: lado === 'azar' ? (Math.random() < .5 ? 0 : 1) : +lado, dif, paraGanar: largo === 'corto' ? 5 : 8 });
  }

  /* ajustes */
  function pintarAjustes() {
    $('#aSens').value = AJ.sens; $('#aFov').value = AJ.fov; $('#aVol').value = AJ.vol; $('#aCal').value = AJ.calidad; $('#aInv').checked = AJ.invertir;
    setT('#oSens', (+AJ.sens).toFixed(2)); setT('#oFov', AJ.fov); setT('#oVol', Math.round(AJ.vol * 100) + '%');
  }
  $('#aSens').oninput = e => { AJ.sens = +e.target.value; setT('#oSens', AJ.sens.toFixed(2)); LS.set('ajustes', AJ); };
  $('#aFov').oninput = e => { AJ.fov = +e.target.value; setT('#oFov', AJ.fov); LS.set('ajustes', AJ); };
  $('#aVol').oninput = e => { AJ.vol = +e.target.value; Snd.vol(AJ.vol); setT('#oVol', Math.round(AJ.vol * 100) + '%'); LS.set('ajustes', AJ); };
  $('#aCal').onchange = e => { AJ.calidad = e.target.value; LS.set('ajustes', AJ); $('#aCalNota').hidden = false; };
  $('#aInv').onchange = e => { AJ.invertir = e.target.checked; LS.set('ajustes', AJ); };

  /* ───────── online ───────── */
  const Online = {
    ws: null, dir: '', sala: null, miId: null,
    norm(a) { a = String(a || '').trim().replace(/\/+$/, ''); if (!a) return null; if (!/^https?:\/\//.test(a)) a = (/^[\d.]+(:\d+)?$/.test(a) || /:\d+$/.test(a) ? 'http://' : 'https://') + a; return a; },
    mostrar() {
      $('#oNombre').value = AJ.nombre || ''; const guard = LS.get('servidores', []); $('#oLista').innerHTML = guard.map(s => `<option value="${esc(s)}">`).join(''); if (!$('#oDir').value && guard[0]) $('#oDir').value = guard[0];
      if (location.protocol.startsWith('http') && !location.hostname.endsWith('vercel.app') && location.hostname !== 'localhost' && !$('#oDir').value && /ops\./.test(location.hostname)) $('#oDir').value = location.host;
      Online.vistaPrevia();
    },
    async vistaPrevia() {
      const base = Online.norm($('#oDir').value); if (!base) { setT('#oInfo', 'Escribí la dirección que te dio el instalador del servidor.'); $('#salas').innerHTML = ''; return; }
      setT('#oInfo', 'Buscando el servidor…');
      try { const r = await fetch(base + '/estado', { cache: 'no-store' }); const j = await r.json(); if (j.game !== 'gonzaops') throw new Error('otro'); setT('#oInfo', `Servidor «${j.name}» · ${j.players.length} conectados${j.password ? ' · pide contraseña' : ''}`); $('#salas').innerHTML = j.rooms.length ? j.rooms.map(r => `<button class="sala" data-codigo="${r.code}"><b>${r.code}</b> · ${esc(r.host)} · ${r.humans} jugador${r.humans === 1 ? '' : 'es'} · ${r.state === 'game' ? 'jugando' : 'esperando'}</button>`).join('') : '<p class="hint">No hay salas abiertas: creá una.</p>'; $$('#salas .sala').forEach(b => b.onclick = () => Online.conectar('join', b.dataset.codigo)); }
      catch (e) { setT('#oInfo', 'No encuentro un servidor de GonzaOps en esa dirección.'); $('#salas').innerHTML = ''; }
    },
    conectar(accion, codigo) {
      const base = Online.norm($('#oDir').value); if (!base) { setT('#oInfo', 'Falta la dirección del servidor.'); return; }
      const nombre = ($('#oNombre').value.trim() || 'Jugador').slice(0, 16); AJ.nombre = nombre; LS.set('ajustes', AJ);
      const lista = LS.get('servidores', []).filter(s => s !== $('#oDir').value.trim()); lista.unshift($('#oDir').value.trim()); LS.set('servidores', lista.slice(0, 5));
      if (Online.ws) try { Online.ws.close(); } catch (e) { }
      const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws'); Online.ws = ws;
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name: nombre, pass: $('#oClave').value }));
      ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (er) { return; } if (m.t === 'welcome') { Online.miId = m.id; ws.send(JSON.stringify(accion === 'join' ? { t: 'join', code: codigo } : { t: 'create' })); } else recibir(m); };
      ws.onclose = () => { if (S.jugando && S.modo === 'online') { mensaje('Se cortó la conexión', 'Volviendo al menú', 3); setTimeout(salir, 2500); } else if (Online.ws === ws) setT('#oInfo', 'Se cerró la conexión con el servidor.'); };
      S.modo = 'online';
      S.red = { enviar: m => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); }, cerrar: () => { try { ws.close(); } catch (e) { } }, local: false };
    },
    recibir(m) {
      if (m.t === 'err') { setT('#oInfo', m.msg); mensaje('Ups', m.msg, 3); }
      if (m.t === 'lobby') { Online.sala = m; pintarSala(m); if (!S.jugando) pantalla('sec-sala'); }
      if (m.t === 'lchat') { const d = document.createElement('div'); d.innerHTML = `<b>${esc(m.n)}</b> ${esc(m.m)}`; $('#sChat').appendChild(d); $('#sChat').scrollTop = 1e9; }
      if (m.t === 'rooms' && !S.jugando && !Online.sala) Online.vistaPrevia();
    },
  };
  function pintarSala(m) {
    setT('#sCodigo', m.code);
    for (const sq of [0, 1]) {
      const cont = $(sq === 0 ? '#slots0' : '#slots1'); let html = '';
      for (let i = 0; i < 5; i++) { const s = m.slots.find(x => x.sq === sq && x.idx === i); html += s ? `<div class="slot lleno ${s.pid === Online.miId ? 'yo' : ''}">${esc(s.name)}${s.pid === m.host ? ' ★' : ''}</div>` : `<button class="slot" data-sq="${sq}" data-idx="${i}">Libre (bot)</button>`; }
      cont.innerHTML = html;
    }
    $$('#sec-sala .slot[data-sq]').forEach(b => b.onclick = () => S.red.enviar({ t: 'slot', sq: +b.dataset.sq, idx: +b.dataset.idx }));
    const host = m.host === Online.miId;
    $('#sDif').value = m.dif; $('#sLargo').value = m.largo; $('#sDif').disabled = !host; $('#sLargo').disabled = !host; $('#bEmpezar').hidden = !host;
    setT('#sEstado', m.state === 'game' ? 'Partida en curso…' : host ? 'Cuando estén todos, tocá Empezar.' : 'Esperando que el anfitrión empiece.');
  }
  $('#oDir').addEventListener('change', () => Online.vistaPrevia());
  $('#oCrear').onclick = () => Online.conectar('create');
  $('#oUnirse').onclick = () => { const c = $('#oCodigo').value.trim().toUpperCase(); if (c.length === 5) Online.conectar('join', c); else setT('#oInfo', 'El código tiene 5 letras.'); };
  $('#sDif').onchange = e => S.red && S.red.enviar({ t: 'diff', d: e.target.value });
  $('#sLargo').onchange = e => S.red && S.red.enviar({ t: 'largo', v: e.target.value });
  $('#bEmpezar').onclick = () => S.red && S.red.enviar({ t: 'start' });
  $('#bSalirSala').onclick = () => { if (S.red) S.red.enviar({ t: 'leave' }); if (S.red) S.red.cerrar(); S.red = null; Online.sala = null; pantalla('sec-online'); Online.vistaPrevia(); };
  $('#sMsg').onkeydown = e => { if (e.key === 'Enter' && e.target.value.trim()) { S.red.enviar({ t: 'chat', m: e.target.value.trim() }); e.target.value = ''; } };

  /* ───────── controles táctiles ───────── */
  if (TOUCH) {
    const J = $('#joy'), Jb = J.querySelector('i'); let jid = null, jx = 0, jy = 0, lid = null, lx = 0, ly = 0;
    J.addEventListener('touchstart', e => { const t = e.changedTouches[0]; jid = t.identifier; const r = J.getBoundingClientRect(); jx = r.left + r.width / 2; jy = r.top + r.height / 2; e.preventDefault(); }, { passive: false });
    addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === jid) { let dx = (t.clientX - jx) / 50, dy = (t.clientY - jy) / 50; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; } joy.x = dx; joy.y = dy; Jb.style.transform = `translate(${dx * 40}px,${dy * 40}px)`; }
        if (t.identifier === lid) { const k = .006 * AJ.sens * (YO.mira ? .32 : 1); YO.yaw += (t.clientX - lx) * k; YO.pitch = Math.max(-1.5, Math.min(1.5, YO.pitch - (t.clientY - ly) * k)); lx = t.clientX; ly = t.clientY; }
      }
    }, { passive: true });
    const fin = e => { for (const t of e.changedTouches) { if (t.identifier === jid) { jid = null; joy.x = joy.y = 0; Jb.style.transform = ''; } if (t.identifier === lid) lid = null; } };
    addEventListener('touchend', fin); addEventListener('touchcancel', fin);
    canvas.addEventListener('touchstart', e => { const t = e.changedTouches[0]; if (t.clientX > innerWidth * .35 && lid == null) { lid = t.identifier; lx = t.clientX; ly = t.clientY; } if (S.muerto) cambiarEspectado(1); Snd.init(); }, { passive: true });
    $$('#touch [data-t]').forEach(b => {
      const k = b.dataset.t;
      b.addEventListener('touchstart', e => {
        e.preventDefault(); Snd.init(); const t = e.changedTouches[0];
        if (lid == null && k === 'fuego') { lid = t.identifier; lx = t.clientX; ly = t.clientY; }
        if (k === 'fuego') { disparando = true; clicPend = true; }
        if (k === 'mira') clicDerecho(); if (k === 'rec') recargar(); if (k === 'salto') joy.saltar = true; if (k === 'ag') YO.ag = !YO.ag;
        if (k === 'arma') { const orden = [0, 1, 2, 3].filter(i => i === 3 ? tieneGranada() : YO.armas[i]); cambiarA(orden[(orden.indexOf(YO.sel) + 1) % orden.length]); }
        if (k === 'usar') usar(true); if (k === 'compra') S.compra ? cerrarCompra() : abrirCompra(); if (k === 'menu') abrirMenu(); if (k === 'tabla') mostrarTabla($('#sTabla').hidden);
      }, { passive: false });
      b.addEventListener('touchend', e => { e.preventDefault(); if (k === 'fuego') disparando = false; if (k === 'usar') usar(false); }, { passive: false });
    });
  }

  /* ───────── bucle principal ───────── */
  let ultimo = ahora(), fpsAcc = 0, fpsN = 0, calAuto = AJ.calidad === 'auto';
  function cuadro() {
    requestAnimationFrame(cuadro);
    const t = ahora(), dt = Math.min(.05, t - ultimo); ultimo = t;
    if (!S.jugando) { const cx = 40 + Math.sin(t * .04) * 30, cz = 35 + Math.cos(t * .04) * 26; R.camara(cx, 16, cz, Math.atan2(40 - cx, -(35 - cz)), -.42, 70); R.dibujar(dt, false); return; }
    moverYo(dt);
    if (disparando || clicPend) intentarDisparo(); clicPend = false;
    YO.kick *= Math.pow(.004, dt); YO.retro *= Math.pow(.0001, dt); YO.corte = Math.max(0, (YO.corte || 0) - dt * 4);
    YO.swX = (YO.swX || 0) * Math.pow(.001, dt); YO.swY = (YO.swY || 0) * Math.pow(.001, dt);
    enviarEstado(t);
    interpolar(dt);
    camara(dt);
    // arma en mano
    const n = armaNombre(), armaId = YO.sel === 3 ? 100 + GRAN.indexOf(YO.gs) : n ? Ops.ID_ARMA[n] : Ops.ID_ARMA.cuchillo;
    R.vista(armaId, YO.team || 0);
    const cambio = Math.max(0, (YO.cambioHasta - t) / .45), rec = YO.recHasta > t ? (t - YO.recIni) / (YO.recHasta - YO.recIni) : 0;
    R.animarVista({ bob: YO.bob || 0, swayX: -(YO.swX || 0), swayY: (YO.swY || 0), retro: YO.retro, recarga: rec, cambio, fog: YO.fog > 0, corte: YO.corte, oculta: S.muerto || YO.mira });
    YO.fog = Math.max(0, (YO.fog || 0) - dt);
    // bomba y su pitido
    const s = S.ult;
    if (s) {
      R.bomba(s.bomba, t); R.granadas(s.gran); R.items(s.items);
      if (s.bomba.e === 'plantada') { const per = Math.max(.12, s.bomba.resta / 40 * 1.1); if (t - (S.ultBeep || 0) > per) { S.ultBeep = t; Snd.beep([s.bomba.x, s.bomba.y + .2, s.bomba.z], s.bomba.resta < 5 ? 2900 : 2300); } }
    }
    R.dibujar(dt, !S.muerto);
    hud();
    // calidad automática según los cuadros por segundo
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 4) { const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; if (calAuto && fps < 32 && !S.bajada) { S.bajada = true; LS.set('calAuto', 'baja'); } }
  }

  /* ───────── arranque ───────── */
  const cal = AJ.calidad === 'auto' ? (LS.get('calAuto', null) || (TOUCH ? 'baja' : 'alta')) : AJ.calidad;
  R.init(canvas, cal); R.mapa(MAPA);
  $('#bNombre').value = AJ.nombre || '';
  pantalla('sec-titulo');
  requestAnimationFrame(cuadro);
  window.__ops = { S, YO, R, recibir, Online, MAPA, entrada };
})();
