/* J.A.R.V.I.S. — asistente personal por voz de Gonzadev.
 * Escucha con el reconocimiento de voz del navegador, responde con voz, resuelve al instante lo simple (hora, timers, notas,
 * abrir páginas, clima) y lo demás se lo pregunta a la IA del asistente en Vercel. En el programa de Windows, además maneja la PC
 * a través del agente local (rutas /agente/...).
 */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('jarvis:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('jarvis:' + k, JSON.stringify(v)); } catch (e) { } },
  };
  const cfg = Object.assign({ nombre: '', voz: '', vel: 1.05, tono: 0.95, manos: false, ciudad: '', servidor: '', sonidos: true }, LS.get('cfg', {}));
  const guardarCfg = () => LS.set('cfg', cfg);
  let hist = LS.get('hist', []);
  let notas = LS.get('notas', []);
  let timers = LS.get('timers', []).filter(t => t.fin > Date.now());
  let AG = null; // agente de Windows (si existe)

  /* ───────── utilidades ───────── */
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,;:"«»()]/g, ' ').replace(/\s+/g, ' ').trim();
  const NUM = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veinticinco: 25, treinta: 30, cuarenta: 40, cuarentaicinco: 45, cincuenta: 50, sesenta: 60, noventa: 90, cien: 100 };
  const numero = w => { if (w == null) return NaN; w = String(w).replace(',', '.'); if (!isNaN(parseFloat(w))) return parseFloat(w); return NUM[w] != null ? NUM[w] : NaN; };
  const dos = n => String(n).padStart(2, '0');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const durTxt = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; const p = []; if (h) p.push(h + (h === 1 ? ' hora' : ' horas')); if (m) p.push(m + (m === 1 ? ' minuto' : ' minutos')); if (ss && !h) p.push(ss + (ss === 1 ? ' segundo' : ' segundos')); return p.join(' y ') || '0 segundos'; };
  const reloj = s => { s = Math.max(0, Math.ceil(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ':' + dos(m) : m) + ':' + dos(s % 60); };
  function aviso(t, ms) { const a = $('#aviso'); a.textContent = t; a.hidden = false; clearTimeout(aviso.t); aviso.t = setTimeout(() => a.hidden = true, ms || 4500); }

  /* ───────── sonidos de la interfaz ───────── */
  let AC = null;
  function ac() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
  function bip(notas_, dur, vol, tipo) {
    if (!cfg.sonidos) return; const c = ac(); if (!c) return; let t = c.currentTime;
    notas_.forEach(f => { const o = c.createOscillator(), g = c.createGain(); o.type = tipo || 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol || .08, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + (dur || .12)); o.connect(g).connect(c.destination); o.start(t); o.stop(t + (dur || .12) + .02); t += (dur || .12) * .8; });
  }
  const sonidoEscucha = () => bip([880, 1320], .09, .07);
  const sonidoFin = () => bip([1100, 740], .08, .05);
  function alarma() { const c = ac(); if (!c) return; for (let i = 0; i < 6; i++) setTimeout(() => bip([988, 1319, 988, 1319], .11, .14, 'square'), i * 900); }

  /* ───────── voz (lo que dice Jarvis) ───────── */
  const TTS = window.speechSynthesis;
  let voces = [], hablando = false, colaVoz = 0, finHablar = null;
  function elegirVoz() {
    if (!TTS) return null;
    voces = TTS.getVoices();
    if (cfg.voz) { const v = voces.find(v => v.voiceURI === cfg.voz); if (v) return v; }
    const es = voces.filter(v => /^es/i.test(v.lang));
    const puntaje = v => (/natural|online|neural/i.test(v.name) ? 8 : 0) + (/tom[aá]s|jorge|alvaro|pablo|ra[uú]l|diego|gonzalo|federico|gerardo|dario|jorge|enrique|carlos|male|hombre/i.test(v.name) ? 6 : 0) + (/AR/i.test(v.lang) ? 4 : /MX|US|419/i.test(v.lang) ? 3 : /ES/i.test(v.lang) ? 2 : 0) + (/google/i.test(v.name) ? 1 : 0);
    es.sort((a, b) => puntaje(b) - puntaje(a));
    return es[0] || voces[0] || null;
  }
  const limpiarVoz = t => t.replace(/\[\[ACCION[\s\S]*?\]\]/g, '').replace(/https?:\/\/\S+/g, 'el enlace').replace(/[*_#`>|~]/g, '').replace(/\s*\n+\s*/g, '. ').replace(/\.\s*\./g, '.').replace(/\s+/g, ' ').trim();
  function partir(t) { return (t.match(/[^.!?…]+[.!?…]*\s*/g) || [t]).map(s => s.trim()).filter(Boolean); }
  function decirFrase(f) {
    if (!TTS || !f) return;
    const u = new SpeechSynthesisUtterance(f); const v = elegirVoz();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'es-AR';
    u.rate = +cfg.vel || 1; u.pitch = +cfg.tono || 1;
    colaVoz++; hablando = true; setEstado('hablando'); pararEscuchaPorVoz();
    u.onend = u.onerror = () => { colaVoz = Math.max(0, colaVoz - 1); if (!colaVoz) { hablando = false; if (estado === 'hablando') setEstado('espera'); const f2 = finHablar; finHablar = null; if (f2) f2(); reanudarEscucha(); } };
    TTS.speak(u);
  }
  function decir(t) {
    t = limpiarVoz(t || ''); if (!t) return Promise.resolve();
    return new Promise(res => { const prev = finHablar; finHablar = () => { if (prev) prev(); res(); }; partir(t).forEach(decirFrase); if (!TTS) { finHablar = null; res(); } });
  }
  function callar() { if (TTS) TTS.cancel(); colaVoz = 0; hablando = false; const f = finHablar; finHablar = null; if (f) f(); if (estado === 'hablando') setEstado('espera'); }
  if (TTS) { TTS.onvoiceschanged = () => { voces = TTS.getVoices(); llenarVoces(); }; voces = TTS.getVoices(); }

  /* ───────── estado + orbe ───────── */
  let estado = 'espera';
  const TXT = { espera: () => cfg.manos && SR ? 'Decí «Jarvis»' : 'En línea', escuchando: () => 'Escuchando', pensando: () => 'Procesando', hablando: () => 'Respondiendo', error: () => 'Error' };
  function setEstado(e, txt) { estado = e; const el = $('#estado'); el.className = 'estado ' + e; el.textContent = txt || TXT[e](); }
  const cv = $('#orbe'), cx = cv.getContext('2d');
  let nivelMic = 0, analizador = null, datosMic = null, streamMic = null, colorMix = 0;
  function tam() { const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2); cv.width = r.width * d; cv.height = r.height * d; }
  addEventListener('resize', tam); tam();
  function dibujar(t) {
    requestAnimationFrame(dibujar);
    if (document.hidden) return;
    const W = cv.width, H = cv.height, R = Math.min(W, H) / 2, X = W / 2, Y = H / 2, s = t / 1000;
    cx.clearRect(0, 0, W, H);
    let nivel = .04 + Math.sin(s * 1.6) * .02;
    if (estado === 'escuchando' && analizador) { analizador.getByteFrequencyData(datosMic); let sum = 0; for (let i = 2; i < 48; i++) sum += datosMic[i]; nivelMic += ((sum / 46 / 255) * 1.6 - nivelMic) * .35; nivel = .08 + nivelMic; }
    else if (estado === 'escuchando') nivel = .14 + Math.sin(s * 5) * .05;
    else if (estado === 'hablando') nivel = .22 + Math.abs(Math.sin(s * 9)) * .18 + Math.sin(s * 23) * .06;
    else if (estado === 'pensando') nivel = .12;
    const ambar = estado === 'pensando' ? 1 : 0; colorMix += (ambar - colorMix) * .08;
    const col = (a) => `rgba(${Math.round(56 + colorMix * 199)},${Math.round(225 - colorMix * 46)},${Math.round(255 - colorMix * 184)},${a})`;
    // halo
    const g = cx.createRadialGradient(X, Y, R * .05, X, Y, R * (.42 + nivel * .25)); g.addColorStop(0, col(.55)); g.addColorStop(.35, col(.18)); g.addColorStop(1, col(0));
    cx.fillStyle = g; cx.beginPath(); cx.arc(X, Y, R * .7, 0, 7); cx.fill();
    cx.lineCap = 'round';
    // barras radiales
    const N = 72, r0 = R * .34;
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2 + s * .15;
      let v = nivel * (.55 + .45 * Math.sin(i * 1.7 + s * 6) * Math.sin(i * .37 + s * 2.3));
      if (estado === 'escuchando' && datosMic) v = .04 + (datosMic[(i % 36) + 3] / 255) * .9 * (nivelMic + .2);
      const l = R * (.03 + Math.max(0, v) * .38);
      cx.strokeStyle = col(.35 + Math.min(.6, v)); cx.lineWidth = Math.max(1.5, R * .012);
      cx.beginPath(); cx.moveTo(X + Math.cos(a) * r0, Y + Math.sin(a) * r0); cx.lineTo(X + Math.cos(a) * (r0 + l), Y + Math.sin(a) * (r0 + l)); cx.stroke();
    }
    // anillos
    const vel = estado === 'pensando' ? 2.6 : 1;
    const arco = (r, w, a0, len, alfa) => { cx.strokeStyle = col(alfa); cx.lineWidth = w; cx.beginPath(); cx.arc(X, Y, r, a0, a0 + len); cx.stroke(); };
    for (let i = 0; i < 3; i++) arco(R * .86, R * .02, s * .25 * vel + i * 2.094, 1.5, .55);
    for (let i = 0; i < 24; i++) arco(R * .93, R * .008, i * .2618 - s * .1, .16, .3);
    for (let i = 0; i < 4; i++) arco(R * .76, R * .035, -s * .6 * vel + i * 1.571, .9, .4);
    arco(R * .68, R * .006, 0, 6.29, .25);
    cx.setLineDash([R * .01, R * .03]); arco(R * .99, R * .006, s * .05, 6.29, .25); cx.setLineDash([]);
    // núcleo
    const rn = R * (.2 + nivel * .05);
    const gn = cx.createRadialGradient(X, Y, 0, X, Y, rn); gn.addColorStop(0, 'rgba(240,253,255,.95)'); gn.addColorStop(.45, col(.85)); gn.addColorStop(1, col(.05));
    cx.fillStyle = gn; cx.beginPath(); cx.arc(X, Y, rn, 0, 7); cx.fill();
    cx.strokeStyle = col(.9); cx.lineWidth = R * .012; cx.beginPath(); cx.arc(X, Y, R * .25, 0, 7); cx.stroke();
    for (let i = 0; i < 3; i++) { const a = i * 2.094 + s * .8 * vel; cx.fillStyle = col(.9); cx.beginPath(); cx.arc(X + Math.cos(a) * R * .25, Y + Math.sin(a) * R * .25, R * .018, 0, 7); cx.fill(); }
  }
  requestAnimationFrame(dibujar);
  async function abrirMedidorMic() {
    if (analizador || !navigator.mediaDevices) return;
    try {
      streamMic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const c = ac(); const src = c.createMediaStreamSource(streamMic); analizador = c.createAnalyser(); analizador.fftSize = 256; analizador.smoothingTimeConstant = .6; src.connect(analizador); datosMic = new Uint8Array(analizador.frequencyBinCount);
    } catch (e) { }
  }

  /* ───────── escuchar (reconocimiento de voz) ───────── */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, recActivo = false, modoPush = false, ventanaHasta = 0, pausaPorVoz = false, errSeguidos = 0, timeoutPush = null;
  const WAKE = /\b(jarvis|yarvis|llarvis|jarbis|yarbis|charvis|harvis|jarvi|yarvi|travis|jarvees)\b[\s,.:]*(.*)$/i;
  function crearRec() {
    rec = new SR(); rec.lang = 'es-AR'; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onstart = () => { recActivo = true; errSeguidos = 0; if (modoPush || Date.now() < ventanaHasta) setEstado('escuchando'); };
    rec.onresult = e => {
      let interino = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) final += r[0].transcript; else interino += r[0].transcript; }
      if (interino) {
        const muestra = modoPush || Date.now() < ventanaHasta || WAKE.test(interino);
        if (muestra) { vivo(interino, true); if (estado !== 'escuchando') setEstado('escuchando'); }
        if (timeoutPush) { clearTimeout(timeoutPush); timeoutPush = setTimeout(cortarPush, 7000); }
      }
      if (final.trim()) alOirFinal(final.trim());
    };
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { cfg.manos = false; guardarCfg(); pintarManos(); modoPush = false; setEstado('error', 'Sin permiso de micrófono'); aviso('Jarvis no tiene permiso para usar el micrófono. Habilitalo en el candado de la barra de direcciones.', 7000); }
      else if (e.error === 'network') { errSeguidos++; if (errSeguidos > 2) { aviso('El reconocimiento de voz necesita internet. Revisá la conexión.', 6000); } }
      else if (e.error === 'audio-capture') aviso('No encuentro un micrófono conectado.', 6000);
    };
    rec.onend = () => { recActivo = false; if (modoPush) { modoPush = false; clearTimeout(timeoutPush); timeoutPush = null; if (estado === 'escuchando') { setEstado('espera'); vivo(''); } } if (debeEscuchar()) setTimeout(iniciarRec, errSeguidos > 2 ? 3000 : 250); else if (estado === 'escuchando') setEstado('espera'); };
  }
  const debeEscuchar = () => SR && cfg.manos && !hablando && !pausaPorVoz && !document.hidden;
  function iniciarRec() {
    if (!SR || recActivo) return; if (!rec) crearRec();
    rec.continuous = !modoPush;
    try { rec.start(); } catch (e) { }
    abrirMedidorMic();
  }
  function pararRec() { if (rec && recActivo) try { rec.abort(); } catch (e) { } }
  function pararEscuchaPorVoz() { if (recActivo) { pausaPorVoz = true; pararRec(); } }
  function reanudarEscucha() { pausaPorVoz = false; if (debeEscuchar()) setTimeout(iniciarRec, 300); }
  function cortarPush() { if (modoPush) { try { rec.stop(); } catch (e) { } } }
  function escucharUnaVez() {
    if (!SR) { aviso('Este navegador no reconoce la voz. Usá Chrome o Edge, o escribí.', 6000); $('#tTexto').focus(); return; }
    ac(); callar();
    if (recActivo && !modoPush) { ventanaHasta = Date.now() + 9000; sonidoEscucha(); setEstado('escuchando'); vivo('Te escucho…', true); return; }
    if (modoPush && recActivo) { cortarPush(); return; }
    modoPush = true; sonidoEscucha(); setEstado('escuchando'); vivo('Te escucho…', true);
    clearTimeout(timeoutPush); timeoutPush = setTimeout(cortarPush, 8000);
    if (recActivo) pararRec(); setTimeout(iniciarRec, recActivo ? 200 : 0);
  }
  function alOirFinal(t) {
    if (modoPush) { modoPush = false; clearTimeout(timeoutPush); timeoutPush = null; try { rec.stop(); } catch (e) { } procesar(t); return; }
    const m = t.match(WAKE);
    if (m) {
      const resto = m[2].trim();
      if (resto.length > 1) { ventanaHasta = 0; procesar(resto); }
      else { ventanaHasta = Date.now() + 8000; sonidoEscucha(); setEstado('escuchando'); vivo('¿Sí?', true); }
      return;
    }
    if (Date.now() < ventanaHasta) { ventanaHasta = 0; procesar(t); return; }
    // ruido de fondo sin la palabra clave: se ignora
  }
  function vivo(t, interino) { const v = $('#vivo'); v.textContent = t || ''; v.className = 'vivo' + (interino ? ' int' : ''); }
  function pintarManos() { const b = $('#bManos'); b.classList.toggle('on', !!cfg.manos); b.querySelector('b').textContent = cfg.manos ? 'sí' : 'no'; if (estado === 'espera') setEstado('espera'); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (recActivo && !modoPush) pararRec(); } else if (debeEscuchar()) iniciarRec(); });

  /* ───────── registro en pantalla ───────── */
  function logMsg(tipo, txt) {
    const L = $('#log'), d = document.createElement('div'); d.className = 'msg ' + tipo;
    const quien = { u: cfg.nombre ? cfg.nombre.toUpperCase() : 'VOS', j: 'JARVIS', s: 'SISTEMA', e: 'ERROR' }[tipo];
    d.innerHTML = '<small></small><span></span>'; d.firstChild.textContent = quien; d.lastChild.textContent = txt;
    L.appendChild(d); while (L.children.length > 80) L.firstChild.remove(); L.scrollTop = L.scrollHeight; return d.lastChild;
  }
  function pintarHist() { $('#log').innerHTML = ''; hist.slice(-16).forEach(m => logMsg(m.role === 'user' ? 'u' : 'j', limpiarVoz(m.content))); }

  /* ───────── comandos sin IA ───────── */
  const WEBS = {
    youtube: 'https://www.youtube.com', google: 'https://www.google.com', gmail: 'https://mail.google.com', correo: 'https://mail.google.com', mail: 'https://mail.google.com',
    spotify: 'https://open.spotify.com', whatsapp: 'https://web.whatsapp.com', instagram: 'https://www.instagram.com', facebook: 'https://www.facebook.com',
    twitter: 'https://x.com', x: 'https://x.com', tiktok: 'https://www.tiktok.com', netflix: 'https://www.netflix.com', twitch: 'https://www.twitch.tv',
    github: 'https://github.com', wikipedia: 'https://es.wikipedia.org', maps: 'https://www.google.com/maps', mapas: 'https://www.google.com/maps', 'google maps': 'https://www.google.com/maps',
    drive: 'https://drive.google.com', 'google drive': 'https://drive.google.com', outlook: 'https://outlook.live.com', linkedin: 'https://www.linkedin.com', reddit: 'https://www.reddit.com',
    'mercado libre': 'https://www.mercadolibre.com.ar', mercadolibre: 'https://www.mercadolibre.com.ar', amazon: 'https://www.amazon.com', discord: 'https://discord.com/app',
    telegram: 'https://web.telegram.org', traductor: 'https://translate.google.com', 'google traductor': 'https://translate.google.com', calendario: 'https://calendar.google.com',
    noticias: 'https://news.google.com', chatgpt: 'https://chatgpt.com', claude: 'https://claude.ai', zonahack: 'https://offlinevideoplayer.vercel.app', 'zona hack': 'https://offlinevideoplayer.vercel.app',
    'mi github': 'https://github.com/GonzalitoDev', kick: 'https://kick.com', 'disney plus': 'https://www.disneyplus.com', 'prime video': 'https://www.primevideo.com', vercel: 'https://vercel.com/dashboard', supabase: 'https://supabase.com/dashboard',
  };
  const CARPETAS = { descargas: 'descargas', documentos: 'documentos', escritorio: 'escritorio', imagenes: 'imagenes', fotos: 'imagenes', musica: 'musica', videos: 'videos' };
  function urlBusqueda(donde, q) {
    q = encodeURIComponent(q || '');
    switch (norm(donde)) {
      case 'youtube': return 'https://www.youtube.com/results?search_query=' + q;
      case 'wikipedia': return 'https://es.wikipedia.org/w/index.php?search=' + q;
      case 'maps': case 'mapas': case 'google maps': return 'https://www.google.com/maps/search/' + q;
      case 'spotify': return 'https://open.spotify.com/search/' + q;
      case 'mercado libre': case 'mercadolibre': return 'https://listado.mercadolibre.com.ar/' + q;
      default: return 'https://www.google.com/search?q=' + q;
    }
  }
  let pendiente = null; // acción que espera un «sí»
  const SI = /^(si|sii+|dale|confirmo|confirmar|hacelo|hazlo|adelante|de una|ok|okay|okey|obvio|claro|afirmativo|si si)\b/;
  const NO = /^(no|nop|cancela|cancelar|mejor no|negativo|deja|nada)\b/;

  function horaTxt(d, conArticulo) {
    d = d || new Date(); const H = d.getHours(), m = d.getMinutes(), h = H % 12 || 12;
    const parte = H < 6 ? ' de la madrugada' : H < 12 ? ' de la mañana' : H < 13 ? ' del mediodía' : H < 20 ? ' de la tarde' : ' de la noche';
    const min = m === 0 ? ' en punto' : m === 15 ? ' y cuarto' : m === 30 ? ' y media' : ' y ' + m;
    return (conArticulo ? (h === 1 ? 'Es la una' : 'Son las ' + h) : (h === 1 ? 'la una' : 'las ' + h)) + min + parte;
  }

  // devuelve {decir, accion} si lo resuelve sin IA, o null
  function comandoLocal(t) {
    const n = norm(t);
    if (/^(callate|silencio|basta|para|pare|stop|frena|ya esta|suficiente|cancela(r)?)$/.test(n)) { callar(); return { decir: '' }; }
    if (/\bque hora\b|\bhora es\b|(decime|dime|deci) la hora/.test(n)) return { decir: horaTxt(null, true) + '.' };
    if (/que (dia|fecha) es|fecha (de )?hoy|que dia estamos/.test(n)) return { decir: 'Hoy es ' + new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '.' };
    if (/^(gracias|muchas gracias|genial gracias|buenisimo gracias)$/.test(n)) return { decir: ['Para eso estoy.', 'Un placer.', 'Cuando quieras.'][Math.floor(Math.random() * 3)] };
    if (/^(activa|activar|pone|prende) (el )?(modo )?manos libres$/.test(n)) return { accion: { tipo: '_manos', valor: true } };
    if (/^(desactiva|desactivar|saca|apaga) (el )?(modo )?manos libres$/.test(n)) return { accion: { tipo: '_manos', valor: false } };

    // temporizadores
    let m = n.match(/(?:temporizador|timer|alarma|cuenta regresiva|avisame|avisa|recordame)\D*?(?:de |en |por |dentro de )?(\d+(?:[.,]\d+)?|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|veinticinco|treinta|cuarenta|cuarentaicinco|cincuenta|sesenta|noventa|media)\s*(segundos?|seg|minutos?|min|horas?|hora)(?:\s*y\s*(media|cuarto))?(?:\s+(?:para|que|de)\s+(.+))?/);
    if (m) {
      let v = m[1] === 'media' ? .5 : numero(m[1]); const u = m[2];
      let seg = v * (/^h/.test(u) ? 3600 : /^m/.test(u) ? 60 : 1);
      if (m[3] === 'media') seg += /^h/.test(u) ? 1800 : 30; if (m[3] === 'cuarto') seg += /^h/.test(u) ? 900 : 15;
      if (seg > 0) return { accion: { tipo: 'temporizador', segundos: seg, texto: (m[4] || '').trim() } };
    }
    if (/media hora/.test(n) && /(temporizador|timer|avisame|alarma)/.test(n)) return { accion: { tipo: 'temporizador', segundos: 1800, texto: '' } };
    m = n.match(/^(?:recordame|recorda(?:me)?|acordate de avisarme)\s+(?:que\s+|de\s+)?(.+?)\s+a las\s+(\d{1,2})(?:\s*(?:y|:)?\s*(\d{1,2}|media|cuarto))?\s*(de la (?:manana|tarde|noche)|am|pm|hs)?$/);
    if (m) {
      let h = +m[2], mi = m[3] === 'media' ? 30 : m[3] === 'cuarto' ? 15 : +(m[3] || 0);
      if (/tarde|noche|pm/.test(m[4] || '') && h < 12) h += 12;
      return { accion: { tipo: 'recordatorio', hora: dos(h) + ':' + dos(mi), texto: m[1] } };
    }
    if (/^(cancela|borra|elimina|saca)(r)? (el |los |todos los )?(temporizador|temporizadores|timer|timers|alarma|alarmas|recordatorio|recordatorios)/.test(n)) return { accion: { tipo: '_cancelar_timers' } };
    if (/(cuanto|que tanto) (le )?falta/.test(n) && timers.length) { const t0 = timers.slice().sort((a, b) => a.fin - b.fin)[0]; return { decir: `Faltan ${durTxt((t0.fin - Date.now()) / 1000)}${t0.texto ? ' para ' + t0.texto : ''}.` }; }

    // notas
    m = t.match(/^\s*(?:anot[aá](?:me)?|tom[aá] nota|guard[aá] (?:una )?nota|apunt[aá])(?:\s*(?::|que|de que))?\s+(.+)$/i);
    if (m) return { accion: { tipo: 'nota', texto: m[1].trim() } };
    if (/(lee|leeme|lei|decime|cuales son|que dicen|que tengo en) (mis |las )?notas/.test(n) || n === 'mis notas') return { accion: { tipo: 'leer_notas' } };
    if (/^(borra|borrar|elimina|limpia) (todas )?(mis |las )?notas$/.test(n)) return { accion: { tipo: '_borrar_notas' } };

    // clima
    if (/\b(clima|tiempo hace|temperatura|llover|llueve|lluvia|pronostico|hace frio|hace calor)\b/.test(n)) {
      m = n.match(/\b(?:en|de|para)\s+([a-z ]{3,40})$/); let ciudad = m ? m[1].replace(/^(la ciudad de|ciudad de)\s+/, '').replace(/\b(hoy|manana|ahora)\b/g, '').trim() : '';
      if (/^(la semana|el dia|este momento|la tarde|la noche|la manana)$/.test(ciudad)) ciudad = '';
      return { accion: { tipo: 'clima', ciudad } };
    }

    // buscar
    m = n.match(/^(?:pone(?:me)?|reproduci|reproduce|reproducime|tira|pasa(?:me)?)\s+(.+?)\s+en\s+(youtube|spotify)$/);
    if (m) return { accion: { tipo: 'buscar', donde: m[2], q: m[1] }, decir: `Buscando ${m[1]} en ${m[2] === 'youtube' ? 'YouTube' : 'Spotify'}.` };
    m = n.match(/^(?:busca(?:me)?|buscar|googlea|investiga|fijate)\s+(?:sobre\s+|acerca de\s+)?(.+?)(?:\s+en\s+(google|youtube|wikipedia|maps|mapas|google maps|spotify|mercado libre|mercadolibre))?$/);
    if (m) return { accion: { tipo: 'buscar', donde: m[2] || 'google', q: m[1] }, decir: `Buscando ${m[1]}.` };
    m = n.match(/^como (?:llego|ir|voy) (?:a|al|hasta) (.+)$/);
    if (m) return { accion: { tipo: 'abrir_web', url: 'https://www.google.com/maps/dir//' + encodeURIComponent(m[1]) }, decir: `Te abro el camino a ${m[1]}.` };

    // PC: volumen, música, energía, captura, cerrar
    if (AG) {
      m = n.match(/volumen (?:al|a|en)\s*(\d{1,3})/);
      if (m) return { accion: { tipo: 'volumen', accion: 'fijar', valor: Math.min(100, +m[1]) }, decir: `Volumen al ${Math.min(100, +m[1])} por ciento.` };
      if (/(sub[ie]|aumenta|mas) (el )?(volumen|sonido)|volumen (mas )?(arriba|alto)|mas fuerte/.test(n)) return { accion: { tipo: 'volumen', accion: 'subir' }, decir: '' };
      if (/(baj[ae]|disminui|menos) (el )?(volumen|sonido)|volumen (mas )?(abajo|bajo)|mas (bajo|despacio)/.test(n)) return { accion: { tipo: 'volumen', accion: 'bajar' }, decir: '' };
      if (/^(silencia|mutea|mute|quita el sonido|saca el sonido|sin sonido|activa el sonido|desmutea)/.test(n)) return { accion: { tipo: 'volumen', accion: 'silenciar' }, decir: '' };
      if (/^(pausa|pausar|pausa la musica|pone pausa|play|reanuda|reanudar|segui|continua|dale play)( (la )?(musica|cancion|video|tema))?$/.test(n)) return { accion: { tipo: 'multimedia', accion: 'pausa' }, decir: '' };
      if (/(siguiente|proxima|pasa(la)?|otra) (cancion|tema|pista)|^siguiente$|^saltea(la)?$/.test(n)) return { accion: { tipo: 'multimedia', accion: 'siguiente' }, decir: '' };
      if (/(anterior|cancion anterior|tema anterior|volve (al tema|a la cancion))/.test(n)) return { accion: { tipo: 'multimedia', accion: 'anterior' }, decir: '' };
      if (/(captura|screenshot|foto) (de )?(la )?pantalla|^(saca|toma) (una )?captura/.test(n)) return { accion: { tipo: 'captura' } };
      m = n.match(/^(apaga|apagar|reinicia|reiniciar|suspende|suspender|bloquea|bloquear)\s+(la |el |mi )?(pc|compu|computadora|ordenador|maquina|equipo|sesion|pantalla)$/);
      if (m) return { accion: { tipo: 'energia', accion: { apaga: 'apagar', apagar: 'apagar', reinicia: 'reiniciar', reiniciar: 'reiniciar', suspende: 'suspender', suspender: 'suspender', bloquea: 'bloquear', bloquear: 'bloquear' }[m[1]] } };
      m = n.match(/^(?:cerra|cierra|cerrar|mata|matar|finaliza)\s+(?:el |la |los |las )?(?:programa |aplicacion |app )?(.+)$/);
      if (m && !/^(sesion|ventana)$/.test(m[1])) return { accion: { tipo: 'cerrar_app', app: m[1] } };
    }

    // abrir
    m = n.match(/^(?:abri|abre|abrime|abrir|abrilo|ejecuta|ejecutar|inicia|iniciar|lanza|arranca|entra a|entra en|anda a|ir a|mostrame)\s+(?:el |la |los |las |mi |mis |un |una )?(?:pagina (?:de )?|sitio (?:de )?|web (?:de )?|carpeta (?:de )?|programa |aplicacion |app )?(.+)$/);
    if (m) {
      const q = m[1].replace(/\s+(por favor|porfa|porfis)$/, '').trim();
      if (AG && CARPETAS[q]) return { accion: { tipo: 'abrir_carpeta', carpeta: CARPETAS[q] }, decir: `Abriendo ${q}.` };
      if (AG && AG.apps && AG.apps.includes(q)) return { accion: { tipo: 'abrir_app', app: q }, decir: `Abriendo ${q}.` };
      if (WEBS[q]) return { accion: { tipo: 'abrir_web', url: WEBS[q], nombre: q }, decir: `Abriendo ${q}.` };
      const dom = (t.toLowerCase().match(/([a-z0-9-]+(?:\.|\s+punto\s+)(?:com|ar|net|org|io|app|dev|gov|edu|tv)(?:(?:\.|\s+punto\s+)[a-z]{2})?)\s*$/) || [])[1];
      if (dom) { const d = dom.replace(/\s+punto\s+/g, '.'); return { accion: { tipo: 'abrir_web', url: 'https://' + d }, decir: `Abriendo ${d}.` }; }
      if (AG) return { accion: { tipo: 'abrir_app', app: q }, decir: `Abriendo ${q}.` };
    }
    return null;
  }

  /* ───────── acciones ───────── */
  const PC = new Set(['abrir_app', 'abrir_carpeta', 'volumen', 'multimedia', 'cerrar_app', 'captura', 'energia']);
  async function agente(a) {
    try {
      const r = await fetch('agente/accion', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Jarvis': '1' }, body: JSON.stringify(a) });
      const j = await r.json().catch(() => ({})); return j.ok ? j : { ok: false, mensaje: j.mensaje || 'No pude hacerlo.' };
    } catch (e) { return { ok: false, mensaje: 'Perdí la conexión con el programa de Windows.' }; }
  }
  function enlace(url, txt) {
    const box = $('#enlaces'); const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = '↗ ' + (txt || url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40));
    a.onclick = () => setTimeout(() => a.remove(), 300); box.prepend(a); while (box.children.length > 3) box.lastChild.remove(); setTimeout(() => a.remove(), 60000);
  }
  async function abrirURL(url, nombre) {
    if (!/^https?:\/\//i.test(url || '')) return { decir: 'Esa dirección no me parece válida.' };
    if (AG) { const r = await agente({ tipo: 'abrir_web', url }); if (r.ok) return {}; }
    const w = window.open(url, '_blank');
    if (w) try { w.opener = null; } catch (e) { }
    if (!w) { enlace(url, nombre && nombre[0].toUpperCase() + nombre.slice(1)); return { decir: 'El navegador bloqueó la ventana: te dejé el enlace en pantalla.', soloSiNoDijo: false }; }
    return {};
  }
  async function ejecutar(a) {
    if (!a || typeof a !== 'object') return {};
    switch (a.tipo) {
      case '_manos': cfg.manos = !!a.valor; guardarCfg(); pintarManos(); if (cfg.manos) { abrirMedidorMic(); reanudarEscucha(); } else pararRec(); return { decir: cfg.manos ? 'Modo manos libres activado. Decí Jarvis y tu pedido.' : 'Modo manos libres desactivado.' };
      case 'abrir_web': return abrirURL(String(a.url || ''), a.nombre);
      case 'buscar': return abrirURL(urlBusqueda(a.donde, String(a.q || '')), 'Resultados de ' + (a.q || ''));
      case 'temporizador': { const s = Math.min(86400, Math.max(1, +a.segundos || 0)); if (!s) return {}; crearTimer(s, String(a.texto || '').slice(0, 60)); return { decir: `Listo, temporizador de ${durTxt(s)}${a.texto ? ' para ' + a.texto : ''}.`, confirma: true }; }
      case 'recordatorio': {
        const mm = String(a.hora || '').match(/^(\d{1,2}):(\d{2})$/); if (!mm) return { decir: 'No entendí la hora del recordatorio.' };
        const d = new Date(); d.setHours(+mm[1], +mm[2], 0, 0); if (d < Date.now()) d.setDate(d.getDate() + 1);
        crearTimer((d - Date.now()) / 1000, String(a.texto || 'tu recordatorio').slice(0, 80), true);
        return { decir: `Te lo recuerdo a ${horaTxt(d)}${d.getDate() !== new Date().getDate() ? ' de mañana' : ''}.`, confirma: true };
      }
      case '_cancelar_timers': { const n = timers.length; timers = []; guardarTimers(); return { decir: n ? 'Cancelé todo.' : 'No hay nada activo.' }; }
      case 'nota': { const tx = String(a.texto || '').trim().slice(0, 200); if (!tx) return {}; notas.push({ t: tx, f: Date.now() }); notas = notas.slice(-50); LS.set('notas', notas); pintarNotas(); return { decir: 'Anotado.', confirma: true }; }
      case 'leer_notas': return { decir: notas.length ? (notas.length === 1 ? 'Tenés una nota: ' : `Tenés ${notas.length} notas. `) + notas.slice(-8).map(x => x.t).join('. ') + '.' : 'No tenés notas guardadas.' };
      case '_borrar_notas': notas = []; LS.set('notas', notas); pintarNotas(); return { decir: 'Borré tus notas.' };
      case 'clima': return clima(a.ciudad, true);
      default:
        if (!PC.has(a.tipo)) return {};
        if (!AG) return { decir: 'Eso lo puedo hacer desde Jarvis para Windows. Acá en el navegador no tengo acceso a tu computadora.' };
        if (a.tipo === 'energia' && a.accion !== 'bloquear' && !a.confirmado) {
          pendiente = Object.assign({}, a, { confirmado: true });
          ventanaHasta = Date.now() + 12000;
          return { decir: `¿Seguro que querés ${{ apagar: 'apagar', reiniciar: 'reiniciar', suspender: 'suspender' }[a.accion] || a.accion} la computadora? Decí sí para confirmar.` };
        }
        const r = await agente(a);
        if (!r.ok && a.tipo === 'abrir_app') { const w = WEBS[norm(a.app)]; if (w) return abrirURL(w, a.app); }
        return { decir: r.ok ? (r.decir || '') : r.mensaje, error: !r.ok };
    }
  }

  /* ───────── temporizadores y recordatorios ───────── */
  function guardarTimers() { LS.set('timers', timers); pintarTimers(); }
  function crearTimer(seg, texto, esRecordatorio) { timers.push({ id: Date.now() + Math.random(), fin: Date.now() + seg * 1000, total: seg, texto, rec: !!esRecordatorio }); guardarTimers(); if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => { }); }
  function pintarTimers() {
    const el = $('#timers'); if (!timers.length) { el.className = 'mut'; el.textContent = 'Ninguno activo'; return; }
    el.className = ''; el.innerHTML = '';
    timers.slice().sort((a, b) => a.fin - b.fin).forEach(t => {
      const d = document.createElement('div'); d.className = 'timer'; d.innerHTML = '<b></b><span></span><button title="Cancelar">✕</button>';
      d.dataset.id = t.id; d.children[1].textContent = t.texto || (t.rec ? 'Recordatorio' : 'Temporizador');
      d.children[2].onclick = () => { timers = timers.filter(x => x.id !== t.id); guardarTimers(); };
      el.appendChild(d);
    });
    tickTimers();
  }
  function tickTimers() {
    const ahora = Date.now();
    document.querySelectorAll('#timers .timer').forEach(d => { const t = timers.find(x => String(x.id) === d.dataset.id); if (t) d.firstChild.textContent = t.rec && t.fin - ahora > 3600e3 ? new Date(t.fin).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : reloj((t.fin - ahora) / 1000); });
    const listos = timers.filter(t => t.fin <= ahora);
    if (listos.length) {
      timers = timers.filter(t => t.fin > ahora); guardarTimers();
      listos.forEach(t => {
        alarma();
        const msg = t.rec ? `Recordatorio: ${t.texto}.` : `Terminó el temporizador${t.texto ? ' de ' + t.texto : ''}.`;
        logMsg('s', msg); setTimeout(() => decir((cfg.nombre ? cfg.nombre + ', ' : 'Señor, ') + msg.charAt(0).toLowerCase() + msg.slice(1)), 1500);
        if ('Notification' in window && Notification.permission === 'granted' && document.hidden) try { new Notification('Jarvis', { body: msg, icon: 'icon.svg' }); } catch (e) { }
      });
    }
  }

  /* ───────── notas ───────── */
  function pintarNotas() {
    const el = $('#notas'); if (!notas.length) { el.className = 'mut'; el.textContent = 'Decí «anotá…»'; return; }
    el.className = ''; const ul = document.createElement('ul'); notas.slice(-6).reverse().forEach(x => { const li = document.createElement('li'); li.textContent = x.t; ul.appendChild(li); }); el.innerHTML = ''; el.appendChild(ul);
  }

  /* ───────── clima (Open-Meteo, sin clave) ───────── */
  const WMO = { 0: 'cielo despejado', 1: 'mayormente despejado', 2: 'parcialmente nublado', 3: 'nublado', 45: 'niebla', 48: 'niebla con escarcha', 51: 'llovizna débil', 53: 'llovizna', 55: 'llovizna intensa', 56: 'llovizna helada', 57: 'llovizna helada', 61: 'lluvia débil', 63: 'lluvia', 65: 'lluvia fuerte', 66: 'lluvia helada', 67: 'lluvia helada', 71: 'nevada débil', 73: 'nieve', 75: 'nevada fuerte', 77: 'granizo fino', 80: 'chaparrones', 81: 'chaparrones', 82: 'chaparrones fuertes', 85: 'nevadas', 86: 'nevadas fuertes', 95: 'tormenta', 96: 'tormenta con granizo', 99: 'tormenta fuerte con granizo' };
  let ubic = LS.get('ubic', null);
  async function ubicar(ciudad) {
    if (ciudad) {
      const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=es&name=' + encodeURIComponent(ciudad)); const j = await r.json();
      if (!j.results || !j.results.length) throw new Error('No encontré ' + ciudad + '.');
      const x = j.results[0]; return { lat: x.latitude, lon: x.longitude, nombre: x.name + (x.admin1 && x.admin1 !== x.name ? ', ' + x.admin1 : '') };
    }
    if (ubic && Date.now() - ubic.f < 6 * 3600e3) return ubic;
    const pos = await new Promise((ok, mal) => { if (!navigator.geolocation) return mal(new Error('sin ubicación')); navigator.geolocation.getCurrentPosition(ok, mal, { timeout: 9000, maximumAge: 3600e3 }); });
    const u = { lat: pos.coords.latitude, lon: pos.coords.longitude, nombre: 'tu zona', f: Date.now() };
    try { const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${u.lat}&longitude=${u.lon}&localityLanguage=es`); const j = await r.json(); u.nombre = j.city || j.locality || j.principalSubdivision || 'tu zona'; } catch (e) { }
    ubic = u; LS.set('ubic', u); return u;
  }
  async function clima(ciudad, hablarlo) {
    try {
      const u = await ubicar(ciudad || cfg.ciudad);
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${u.lat}&longitude=${u.lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&forecast_days=2&timezone=auto`);
      const j = await r.json(); const c = j.current, d = j.daily;
      const T = Math.round(c.temperature_2m), desc = WMO[c.weather_code] || 'tiempo variable';
      $('#clima').className = ''; $('#clima').innerHTML = '<div class="t"></div><div class="d"></div><div class="s"></div>';
      $('#clima .t').textContent = T + '°'; $('#clima .d').textContent = desc.charAt(0).toUpperCase() + desc.slice(1) + ' · ' + u.nombre;
      $('#clima .s').textContent = `Máx ${Math.round(d.temperature_2m_max[0])}° · Mín ${Math.round(d.temperature_2m_min[0])}° · Lluvia ${d.precipitation_probability_max[0] ?? 0}% · Viento ${Math.round(c.wind_speed_10m)} km/h`;
      if (!hablarlo) return {};
      const st = Math.round(c.apparent_temperature), lluvia = d.precipitation_probability_max[0] ?? 0;
      let txt = `En ${u.nombre} hay ${T} grados${Math.abs(st - T) >= 3 ? `, con sensación de ${st}` : ''}, ${desc}. Hoy la máxima es de ${Math.round(d.temperature_2m_max[0])} y la mínima de ${Math.round(d.temperature_2m_min[0])}`;
      txt += lluvia >= 50 ? `, y hay ${lluvia} por ciento de probabilidad de lluvia: llevá paraguas.` : lluvia >= 20 ? `, con ${lluvia} por ciento de probabilidad de lluvia.` : ', sin lluvia a la vista.';
      return { decir: txt };
    } catch (e) {
      return { decir: e && e.message && /encontr/.test(e.message) ? e.message : 'No pude saber dónde estás. Decime la ciudad, por ejemplo: clima en Córdoba, o configurala en ajustes.' };
    }
  }

  /* ───────── IA ───────── */
  let ctrlIA = null;
  function apiChat() { return AG ? '/api/chat' : (cfg.servidor || '').trim().replace(/\/+$/, '') + '/api/chat'; }
  async function preguntarIA(texto) {
    hist.push({ role: 'user', content: texto.slice(0, 1200) }); hist = hist.slice(-12); LS.set('hist', hist);
    setEstado('pensando'); vivo('');
    const out = logMsg('j', '…');
    let acum = '', dicho = 0, accionTxt = '';
    // habla las oraciones completas apenas llegan, sin leer la línea de acción
    const hablarListo = (final) => {
      let visible = acum; const k = visible.indexOf('[['); if (k >= 0) visible = visible.slice(0, k);
      out.textContent = limpiarVoz(visible) || '…';
      const resto = visible.slice(dicho);
      const corte = final ? resto.length : Math.max(resto.lastIndexOf('. '), resto.lastIndexOf('? '), resto.lastIndexOf('! '), resto.lastIndexOf('\n')) + 1;
      if (corte > 0) { const frase = resto.slice(0, corte); dicho += corte; const f = limpiarVoz(frase); if (f) partir(f).forEach(decirFrase); }
    };
    if (ctrlIA) ctrlIA.abort(); ctrlIA = new AbortController();
    try {
      const r = await fetch(apiChat(), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrlIA.signal,
        body: JSON.stringify({ sitio: 'jarvis', mensajes: hist.slice(-10), contexto: { pc: !!AG, nombre: cfg.nombre, hora: new Date().toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }), ciudad: cfg.ciudad || (ubic && ubic.nombre !== 'tu zona' ? ubic.nombre : '') } }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || (r.status === 404 ? 'No encuentro el servidor de IA. Configurá su dirección en ajustes.' : 'El servidor respondió con error ' + r.status + '.')); }
      const rd = r.body.getReader(), dec = new TextDecoder();
      for (; ;) { const { value, done } = await rd.read(); if (done) break; acum += dec.decode(value, { stream: true }); hablarListo(false); }
      hablarListo(true);
      const mA = acum.match(/\[\[ACCION\s*(\{[\s\S]*?\})\s*\]\]/); if (mA) accionTxt = mA[1];
      const limpio = acum.replace(/\[\[ACCION[\s\S]*?\]\]/g, '').trim();
      hist.push({ role: 'assistant', content: acum.trim().slice(0, 2000) }); hist = hist.slice(-12); LS.set('hist', hist);
      if (!limpio && !accionTxt) { out.textContent = 'No recibí respuesta.'; }
      if (accionTxt) {
        let a = null; try { a = JSON.parse(accionTxt); } catch (e) { }
        if (a) { const res = await ejecutar(a); if (res.decir && !res.confirma) { logMsg(res.error ? 'e' : 's', res.decir); decir(res.decir); } }
      }
      if (/\?\s*$/.test(limpio)) ventanaHasta = Date.now() + 12000; // pregunta: escucha la respuesta sin «Jarvis»
      if (!hablando && estado === 'pensando') setEstado('espera');
    } catch (e) {
      if (e.name === 'AbortError') return;
      hist.pop(); LS.set('hist', hist);
      const msg = e.message && !/fetch|network|load failed/i.test(e.message) ? e.message : 'No me pude conectar con mi cerebro en la nube. Revisá internet o la dirección del servidor en ajustes.';
      out.parentNode.className = 'msg e'; out.textContent = msg; setEstado('error'); decir(msg);
    } finally { ctrlIA = null; }
  }

  /* ───────── procesar un pedido ───────── */
  let ocupado = false;
  async function procesar(texto) {
    texto = (texto || '').trim(); if (!texto) return;
    callar(); vivo(texto); logMsg('u', texto); $('#sugs').innerHTML = '';
    const n = norm(texto);
    if (pendiente) {
      const p = pendiente; pendiente = null;
      if (SI.test(n)) { const r = await ejecutar(p); const msg = r.decir || { apagar: 'Apagando. Hasta luego.', reiniciar: 'Reiniciando.', suspender: 'Buenas noches.' }[p.accion] || 'Hecho.'; logMsg('j', msg); decir(msg); return; }
      if (NO.test(n)) { logMsg('j', 'Cancelado.'); decir('Cancelado.'); return; }
    }
    const loc = comandoLocal(texto);
    if (loc) {
      let msg = loc.decir || '';
      if (loc.accion) { const r = await ejecutar(loc.accion); if (r.decir) msg = r.error || !msg || loc.accion.tipo === 'clima' || r.confirma || /bloque|Windows|navegador/.test(r.decir) ? r.decir : msg; }
      if (msg) { logMsg('j', msg); decir(msg); } else { sonidoFin(); if (estado !== 'hablando') setEstado('espera'); }
      return;
    }
    if (ocupado && ctrlIA) ctrlIA.abort();
    ocupado = true; try { await preguntarIA(texto); } finally { ocupado = false; }
  }

  /* ───────── agente de Windows ───────── */
  async function detectarAgente() {
    try {
      const r = await fetch('agente/estado', { headers: { 'X-Jarvis': '1' }, cache: 'no-store' });
      if (!r.ok) return; const j = await r.json(); if (!j || !j.jarvis) return;
      AG = j; $('#modo').textContent = 'Windows · ' + (j.equipo || 'PC'); $('#modo').classList.add('pc');
      $('#ayudaPC').classList.remove('off');
      if (j.servidor != null) { cfg.servidor = j.servidor; }
      $('#hServidor').textContent = 'Por defecto usa el Taller (corte-editor-nine.vercel.app). Cambiala solo si publicaste el asistente en otro lado.';
      // eventos del programa (atajo de teclado global)
      const es = new EventSource('agente/eventos');
      es.onmessage = ev => { let d = {}; try { d = JSON.parse(ev.data); } catch (e) { } if (d.tipo === 'escuchar') { window.focus(); escucharUnaVez(); } if (d.tipo === 'decir' && d.texto) { logMsg('j', d.texto); decir(d.texto); } };
    } catch (e) { }
    if (!AG) $('#ayudaPC').classList.add('off');
  }

  /* ───────── interfaz ───────── */
  function llenarVoces() {
    const s = $('#aVoz'); if (!s) return; const list = (voces || []).slice().sort((a, b) => (/^es/i.test(b.lang) - /^es/i.test(a.lang)) || a.name.localeCompare(b.name));
    s.innerHTML = '<option value="">Automática (la mejor en español)</option>' + list.map(v => `<option value="${v.voiceURI.replace(/"/g, '&quot;')}">${v.name.replace(/</g, '')} (${v.lang})</option>`).join('');
    s.value = cfg.voz || '';
  }
  function abrirModal(id) { $(id).hidden = false; }
  function cerrarModal(id) { $(id).hidden = true; }
  $('#bAjustes').onclick = () => {
    $('#aNombre').value = cfg.nombre; $('#aVel').value = cfg.vel; $('#aTono').value = cfg.tono; $('#oVel').textContent = (+cfg.vel).toFixed(2); $('#oTono').textContent = (+cfg.tono).toFixed(2);
    $('#aCiudad').value = cfg.ciudad; $('#aServidor').value = cfg.servidor; $('#aSonidos').checked = cfg.sonidos; llenarVoces(); abrirModal('#mAjustes');
  };
  $('#aVel').oninput = e => $('#oVel').textContent = (+e.target.value).toFixed(2);
  $('#aTono').oninput = e => $('#oTono').textContent = (+e.target.value).toFixed(2);
  function leerAjustes() { cfg.nombre = $('#aNombre').value.trim(); cfg.voz = $('#aVoz').value; cfg.vel = +$('#aVel').value; cfg.tono = +$('#aTono').value; cfg.ciudad = $('#aCiudad').value.trim(); cfg.servidor = $('#aServidor').value.trim().replace(/\/+$/, ''); cfg.sonidos = $('#aSonidos').checked; guardarCfg(); }
  $('#bProbar').onclick = () => { leerAjustes(); callar(); decir(`Hola${cfg.nombre ? ' ' + cfg.nombre : ''}. Todos los sistemas funcionan correctamente.`); };
  $('#bCerrarAj').onclick = async () => {
    const servAntes = AG ? AG.servidor : null; leerAjustes(); cerrarModal('#mAjustes');
    if (AG && cfg.servidor !== servAntes) { try { await fetch('agente/config', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Jarvis': '1' }, body: JSON.stringify({ servidor: cfg.servidor }) }); AG.servidor = cfg.servidor; aviso('Servidor guardado.'); } catch (e) { } }
    if (cfg.ciudad) clima(cfg.ciudad, false);
  };
  $('#bOlvidar').onclick = () => { hist = []; LS.set('hist', hist); pintarHist(); aviso('Olvidé la charla.'); };
  $('#bBorrarNotas').onclick = () => { notas = []; LS.set('notas', notas); pintarNotas(); aviso('Notas borradas.'); };
  $('#bBorrar').onclick = () => { $('#log').innerHTML = ''; };
  $('#bAyuda').onclick = () => abrirModal('#mAyuda');
  document.querySelectorAll('.modal').forEach(m => { m.addEventListener('click', e => { if (e.target === m || e.target.hasAttribute('data-cerrar')) { if (m.id === 'mAjustes') $('#bCerrarAj').click(); else cerrarModal('#' + m.id); } }); });
  $('#bManos').onclick = () => {
    if (!SR) { aviso('Este navegador no reconoce la voz. Usá Chrome o Edge.', 6000); return; }
    ac(); cfg.manos = !cfg.manos; guardarCfg(); pintarManos();
    if (cfg.manos) { abrirMedidorMic(); iniciarRec(); aviso('Manos libres: decí «Jarvis» y tu pedido. Ej: «Jarvis, ¿qué hora es?»', 5000); } else { pararRec(); setEstado('espera'); }
  };
  $('#bMic').onclick = () => escucharUnaVez();
  $('#fTexto').onsubmit = e => { e.preventDefault(); const t = $('#tTexto').value; $('#tTexto').value = ''; ac(); procesar(t); };
  addEventListener('keydown', e => {
    const enCampo = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (e.code === 'Space' && !enCampo && !e.repeat && document.querySelectorAll('.modal:not([hidden])').length === 0) { e.preventDefault(); escucharUnaVez(); }
    if (e.key === 'Escape') { if (!$('#mAjustes').hidden) $('#bCerrarAj').click(); else if (!$('#mAyuda').hidden) cerrarModal('#mAyuda'); else { callar(); if (ctrlIA) ctrlIA.abort(); if (modoPush) cortarPush(); } }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#tTexto').focus(); }
  });
  function sugerencias() {
    const s = ['¿Qué hora es?', '¿Cómo está el clima?', 'Poné un temporizador de 5 minutos', 'Contame un dato curioso', 'Abrí YouTube'];
    if (AG) s.splice(3, 0, 'Abrí la calculadora', 'Subí el volumen');
    const box = $('#sugs'); box.innerHTML = ''; s.forEach(t => { const b = document.createElement('button'); b.textContent = t; b.onclick = () => { ac(); procesar(t); }; box.appendChild(b); });
  }
  function tickReloj() { const d = new Date(); $('#hora').textContent = dos(d.getHours()) + ':' + dos(d.getMinutes()); $('#fecha').textContent = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }); }
  setInterval(() => { tickReloj(); tickTimers(); }, 1000);

  /* ───────── arranque ───────── */
  (async () => {
    tickReloj(); pintarTimers(); pintarNotas(); pintarHist(); pintarManos(); setEstado('espera');
    await detectarAgente(); sugerencias();
    if (!SR) { $('#bManos').title = 'Este navegador no reconoce la voz (usá Chrome o Edge)'; vivo('Este navegador no reconoce la voz: escribile a Jarvis. Para hablarle usá Chrome o Edge.', true); }
    if (cfg.ciudad) clima(cfg.ciudad, false); else if (ubic) clima('', false);
    if (cfg.manos && SR) iniciarRec();
    if (!hist.length) { const h = new Date().getHours(); const s = (h < 6 ? 'Buenas noches' : h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches') + (cfg.nombre ? ', ' + cfg.nombre : '') + '. Sistemas en línea.'; logMsg('j', s + ' Tocá el micrófono o apretá Espacio para hablarme.'); }
    const qs = new URLSearchParams(location.search);
    if (qs.has('ajustes')) $('#bAjustes').click();
    if (qs.has('escuchar')) setTimeout(escucharUnaVez, 400);
    if (qs.has('ajustes') || qs.has('escuchar')) history.replaceState(null, '', location.pathname);
    // una sola ventana: si se abre otra, esta se cierra
    try { const bc = new BroadcastChannel('jarvis'); bc.onmessage = e => { if (e.data === 'nueva' && AG) { callar(); pararRec(); window.close(); } }; bc.postMessage('nueva'); } catch (e) { }
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
    window.__jarvis = { procesar, comandoLocal, norm, ejecutar, get AG() { return AG; }, get estado() { return estado; } };
  })();
})();
