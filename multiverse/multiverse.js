/* Taller Multiverse — motor. Vanilla JS, sin dependencias.
   Todo el estado nuevo vive bajo el prefijo localStorage "tm:" para NO tocar
   ni pisar nada de lo que guardan las apps y juegos existentes. */
(function () {
  "use strict";
  var DIMS = window.TM_DIMS || [], GALS = window.TM_GALAXIES || [];
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var AVATARES = ["🧑‍🚀", "👾", "🛸", "🤖", "🌌", "⭐", "🪐", "🌠", "🧙", "🦾", "👽", "🐉"];
  var KEY = "tm:save";

  /* ===== Apoyo al proyecto =====
     Cambiá SOLO estas dos líneas por tus links reales y el panel ya funciona.
     Si dejás una vacía (o con el texto de ejemplo), ese botón no se muestra. */
  var APOYO = {
    cafecito: "https://cafecito.app/TU_USUARIO",   // ← tu usuario de cafecito.app (cobra en pesos)
    mercadopago: "PEGA_TU_LINK_DE_MERCADO_PAGO"    // ← tu link de cobro o alias de Mercado Pago
  };
  function linkOk(u) { return !!u && u.indexOf("TU_USUARIO") < 0 && u.indexOf("PEGA_TU_LINK") < 0; }

  // ---------- almacenamiento seguro ----------
  function nuevo() {
    return { v: 1, nombre: "Viajero", avatar: "🧑‍🚀", xp: 0, visitados: {}, aperturas: {}, favoritos: [], logros: {}, misionesCobradas: {}, notis: [], notisLeidas: 0, creado: Date.now(), ultimoDia: "", dias: 0 };
  }
  function load() {
    try { var t = localStorage.getItem(KEY); if (!t) return nuevo(); var o = JSON.parse(t); if (!o || o.v !== 1) return nuevo(); var base = nuevo(); for (var k in base) if (!(k in o)) o[k] = base[k]; return o; }
    catch (e) { return nuevo(); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  var S = load();

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function dim(id) { for (var i = 0; i < DIMS.length; i++) if (DIMS[i].id === id) return DIMS[i]; return null; }

  // ---------- niveles / xp ----------
  function cumXP(L) { return 40 * L * (L - 1); }          // xp total para alcanzar el nivel L
  function nivelDe(xp) { var L = 1; while (cumXP(L + 1) <= xp) L++; return L; }
  function progreso() { var L = nivelDe(S.xp), base = cumXP(L), need = cumXP(L + 1) - base; return { nivel: L, cur: S.xp - base, need: need, pct: Math.max(0, Math.min(100, (S.xp - base) / need * 100)) }; }
  function addXP(n) { S.xp += n; }

  // ---------- notificaciones / toasts ----------
  function noti(ic, titulo, texto) {
    S.notis.unshift({ ic: ic, titulo: titulo, texto: texto || "", t: Date.now() });
    if (S.notis.length > 40) S.notis.length = 40;
  }
  function toast(ic, titulo, texto) {
    var cont = $("#toasts"); if (!cont) return;
    var d = document.createElement("div"); d.className = "toast";
    d.innerHTML = '<span class="ti">' + ic + '</span><div><b>' + esc(titulo) + '</b><span>' + esc(texto || "") + '</span></div>';
    cont.appendChild(d);
    setTimeout(function () { d.style.transition = "opacity .4s,transform .4s"; d.style.opacity = "0"; d.style.transform = "translateY(10px)"; setTimeout(function () { d.remove(); }, 400); }, 3200);
  }
  function anunciar(ic, titulo, texto) { noti(ic, titulo, texto); toast(ic, titulo, texto); }

  // ---------- logros ----------
  var visitSet = function () { return Object.keys(S.visitados); };
  var visitEnCat = function (cat) { var n = 0; DIMS.forEach(function (d) { if (d.cat === cat && S.visitados[d.id]) n++; }); return n; };
  var editoresVisitados = function () { return ["corte", "lienzo", "trazo", "folio", "onda"].every(function (id) { return S.visitados[id]; }); };

  var LOGROS = [
    { id: "primer", ic: "🚀", n: "Primer salto", d: "Entrá a tu primera dimensión", ok: function () { return visitSet().length >= 1; } },
    { id: "explorador", ic: "🧭", n: "Explorador", d: "Visitá 5 dimensiones", ok: function () { return visitSet().length >= 5; } },
    { id: "creador", ic: "🎨", n: "Creador", d: "Abrí los 5 editores", ok: function () { return editoresVisitados(); } },
    { id: "jugador", ic: "🎮", n: "Jugador", d: "Entrá a 3 juegos del Arcade", ok: function () { return visitEnCat("arcade") >= 3; } },
    { id: "intruso", ic: "🕵️", n: "Intruso", d: "Visitá CTF y Lupa", ok: function () { return S.visitados.ctf && S.visitados.lupa; } },
    { id: "rata", ic: "🧪", n: "Rata de laboratorio", d: "Visitá 3 dimensiones beta", ok: function () { return visitEnCat("lab") >= 3; } },
    { id: "coleccion", ic: "⭐", n: "Coleccionista", d: "Marcá 3 favoritas", ok: function () { return S.favoritos.length >= 3; } },
    { id: "veterano", ic: "🎖️", n: "Veterano", d: "Llegá al nivel 5", ok: function () { return nivelDe(S.xp) >= 5; } },
    { id: "leyenda", ic: "👑", n: "Leyenda", d: "Llegá al nivel 10", ok: function () { return nivelDe(S.xp) >= 10; } },
    { id: "cartografo", ic: "🗺️", n: "Cartógrafo", d: "Visitá todas las dimensiones", ok: function () { return visitSet().length >= DIMS.length; } },
    { id: "nocturno", ic: "🌙", n: "Nocturno", d: "Explorá de madrugada (0–5 h)", ok: function () { var h = new Date().getHours(); return h >= 0 && h < 5 && visitSet().length >= 1; } },
    { id: "fiel", ic: "📅", n: "Fiel al multiverso", d: "Entrá 3 días distintos", ok: function () { return S.dias >= 3; } },
  ];

  // ---------- misiones ----------
  var MISIONES = [
    { id: "explora3", n: "Primer reconocimiento", d: "Visitá 3 dimensiones", rew: 40, prog: function () { return { cur: visitSet().length, meta: 3 }; } },
    { id: "fav2", n: "Armá tu base", d: "Marcá 2 dimensiones como favoritas", rew: 25, prog: function () { return { cur: S.favoritos.length, meta: 2 }; } },
    { id: "mix", n: "De todo un poco", d: "Entrá a un editor y a un juego", rew: 35, prog: function () { return { cur: (visitEnCat("creacion") > 0 ? 1 : 0) + (visitEnCat("arcade") > 0 ? 1 : 0), meta: 2 }; } },
    { id: "lab", n: "Zona inestable", d: "Animate a una dimensión del Laboratorio", rew: 30, prog: function () { return { cur: Math.min(1, visitEnCat("lab")), meta: 1 }; } },
    { id: "nivel3", n: "Ascenso", d: "Alcanzá el nivel 3", rew: 50, prog: function () { return { cur: Math.min(3, nivelDe(S.xp)), meta: 3 }; } },
  ];

  // revisa logros y misiones; devuelve true si hubo algún premio nuevo
  function revisarUnaVez() {
    var hubo = false;
    LOGROS.forEach(function (l) {
      if (!S.logros[l.id] && l.ok()) { S.logros[l.id] = Date.now(); addXP(20); anunciar(l.ic, "¡Logro! " + l.n, l.d + " · +20 XP"); hubo = true; }
    });
    MISIONES.forEach(function (m) {
      if (S.misionesCobradas[m.id]) return;
      var p = m.prog(); if (p.cur >= p.meta) { S.misionesCobradas[m.id] = Date.now(); addXP(m.rew); anunciar("✅", "Misión cumplida: " + m.n, "+" + m.rew + " XP"); hubo = true; }
    });
    return hubo;
  }
  function revisar() {
    var antes = nivelDe(S.xp);
    for (var i = 0; i < 4; i++) { if (!revisarUnaVez()) break; }
    var ahora = nivelDe(S.xp);
    if (ahora > antes) anunciar("⬆️", "Subiste al nivel " + ahora, "El multiverso te reconoce.");
    save(); renderPlayer(); marcarBadges(); actualizarPip();
  }

  // ---------- acciones ----------
  function registrarVisita(id) {
    var first = !S.visitados[id];
    if (first) { S.visitados[id] = Date.now(); addXP(30); } else addXP(2);
    S.aperturas[id] = (S.aperturas[id] || 0) + 1;
    // guardar YA (la página se va a navegar); revisar sin re-render pesado
    for (var i = 0; i < 4; i++) { if (!revisarUnaVez()) break; }
    save();
  }
  function toggleFav(id) {
    var i = S.favoritos.indexOf(id);
    if (i >= 0) S.favoritos.splice(i, 1);
    else { S.favoritos.push(id); addXP(10); anunciar("⭐", "Favorita agregada", (dim(id) || {}).nombre + " · +10 XP"); }
    revisar(); marcarBadges();
  }
  function diaNuevo() {
    var hoy = new Date().toISOString().slice(0, 10);
    if (S.ultimoDia !== hoy) {
      var primera = !S.ultimoDia;
      S.ultimoDia = hoy; S.dias++;
      if (!primera) { addXP(15); anunciar("🌅", "Día " + S.dias + " en el multiverso", "+15 XP por volver."); }
    }
  }

  // ---------- render del jugador ----------
  function renderPlayer() {
    var p = progreso();
    var pc = $("#playerCard");
    if (pc) pc.innerHTML =
      '<div class="top"><div class="av">' + S.avatar + '</div><div class="who"><b>' + esc(S.nombre) + '</b><span>' + visitSet().length + '/' + DIMS.length + ' dimensiones · ' + S.favoritos.length + ' favoritas</span></div><div class="nivel">' + p.nivel + '<small>NIVEL</small></div></div>' +
      '<div class="xpbar"><i style="width:' + p.pct + '%"></i></div>' +
      '<div class="xprow"><span>' + S.xp + ' XP</span><span>' + p.cur + ' / ' + p.need + ' al nivel ' + (p.nivel + 1) + '</span></div>';
    var nb = $("#navPerfil");
    if (nb) nb.innerHTML = '<span class="av">' + S.avatar + '</span><span class="lvl">Nv ' + p.nivel + '</span>';
  }

  function marcarBadges() {
    DIMS.forEach(function (d) {
      var card = $('[data-portal="' + d.id + '"]'); if (!card) return;
      var fav = $(".fav", card); if (fav) fav.classList.toggle("on", S.favoritos.indexOf(d.id) >= 0);
      var vis = $(".badge.vis", card); if (vis) vis.hidden = !S.visitados[d.id];
    });
  }
  function actualizarPip() {
    var pip = $("#pipNotis"); if (!pip) return;
    var n = Math.max(0, S.notis.length - (S.notisLeidas || 0));
    pip.textContent = n > 9 ? "9+" : n; pip.hidden = n === 0;
  }

  // ---------- render de galaxias/portales ----------
  function flechaSVG() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'; }
  function estrellaSVG() { return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.3 6.9.7-5.1 4.7 1.4 6.8L12 18.8 5.9 20.5l1.4-6.8L2.2 9l6.9-.7z"/></svg>'; }

  function coincide(d, q) {
    if (!q) return true; q = q.toLowerCase();
    return (d.nombre + " " + d.tipo + " " + d.desc).toLowerCase().indexOf(q) >= 0;
  }

  function render(q) {
    var cont = $("#galaxias"); if (!cont) return;
    cont.innerHTML = "";
    var total = 0;
    GALS.forEach(function (g) {
      var ds = DIMS.filter(function (d) { return d.cat === g.cat && coincide(d, q); });
      if (!ds.length) return;
      total += ds.length;
      var sec = document.createElement("section"); sec.className = "galaxy";
      var cards = ds.map(function (d) {
        var ext = d.externo ? ' target="_blank" rel="noopener"' : "";
        return '<a class="portal" data-portal="' + d.id + '" href="' + d.ruta + '"' + ext + ' style="--c:' + d.color + '">' +
          (d.beta ? '<span class="badge beta">Beta</span>' : '') +
          '<span class="badge vis"' + (S.visitados[d.id] ? '' : ' hidden') + '>✓ visitada</span>' +
          '<button class="fav' + (S.favoritos.indexOf(d.id) >= 0 ? ' on' : '') + '" data-fav="' + d.id + '" aria-label="Favorita" title="Favorita">' + estrellaSVG() + '</button>' +
          '<span class="ring">' + d.icon + '</span>' +
          '<h3>' + esc(d.nombre) + '</h3><div class="tipo">' + esc(d.tipo) + '</div>' +
          '<p>' + esc(d.desc) + '</p>' +
          '<div class="foot"><span class="entrar">ENTRAR ' + flechaSVG() + '</span></div></a>';
      }).join("");
      sec.innerHTML = '<div class="ghead" style="--gc:' + g.color + '"><h2>' + esc(g.nombre) + '</h2><span class="gsub">' + esc(g.sub) + '</span></div><div class="portals">' + cards + '</div>';
      cont.appendChild(sec);
    });
    if (!total) cont.innerHTML = '<p class="sinres">No hay dimensiones que coincidan con "' + esc(q) + '".</p>';

    // enganchar eventos (delegación simple por tarjeta)
    Array.prototype.forEach.call(cont.querySelectorAll(".portal"), function (a) {
      a.addEventListener("click", function (e) {
        var fb = e.target.closest ? e.target.closest(".fav") : null;
        if (fb) { e.preventDefault(); e.stopPropagation(); toggleFav(fb.getAttribute("data-fav")); return; }
        registrarVisita(a.getAttribute("data-portal")); // guarda antes de navegar
      });
    });
  }

  // ---------- drawers ----------
  var scrim = null, drawer = null;
  function cerrarDrawer() { if (drawer) drawer.classList.remove("on"); if (scrim) scrim.classList.remove("on"); setTimeout(function () { if (scrim) scrim.hidden = true; }, 300); }
  function abrirDrawer(titulo, bodyHTML, onReady) {
    $("#drawerTit").textContent = titulo;
    $("#drawerBody").innerHTML = bodyHTML;
    scrim.hidden = false; requestAnimationFrame(function () { scrim.classList.add("on"); drawer.classList.add("on"); });
    if (onReady) onReady();
  }

  function vistaPerfil() {
    var p = progreso();
    var avatares = AVATARES.map(function (a) { return '<button data-av="' + a + '" class="' + (a === S.avatar ? "on" : "") + '">' + a + '</button>'; }).join("");
    var totalAp = Object.keys(S.aperturas).reduce(function (s, k) { return s + S.aperturas[k]; }, 0);
    var nLogros = Object.keys(S.logros).length;
    var body =
      '<div class="pf-top"><div class="pf-av" id="pfAv">' + S.avatar + '</div><div><div style="font-family:var(--f-disp);font-weight:800;font-size:18px">' + esc(S.nombre) + '</div><div style="color:var(--mut);font:12px var(--f-mono)">Nivel ' + p.nivel + ' · ' + S.xp + ' XP</div></div></div>' +
      '<div class="avgrid">' + avatares + '</div>' +
      '<label class="field"><span>Nombre de viajero</span><input id="pfNombre" maxlength="24" value="' + esc(S.nombre) + '"></label>' +
      '<div class="statgrid">' +
      stat(visitSet().length + "/" + DIMS.length, "Dimensiones") + stat(nLogros + "/" + LOGROS.length, "Logros") +
      stat(S.favoritos.length, "Favoritas") + stat(S.dias, "Días") +
      stat(totalAp, "Aperturas") + stat("Nv " + p.nivel, "Rango") +
      '</div>';
    abrirDrawer("Perfil", body, function () {
      Array.prototype.forEach.call($("#drawerBody").querySelectorAll("[data-av]"), function (b) {
        b.addEventListener("click", function () { S.avatar = b.getAttribute("data-av"); save(); vistaPerfil(); renderPlayer(); });
      });
      var inp = $("#pfNombre");
      inp.addEventListener("input", function () { S.nombre = inp.value.trim() || "Viajero"; save(); renderPlayer(); });
    });
  }
  function stat(b, s) { return '<div class="stat"><b>' + esc(b) + '</b><span>' + esc(s) + '</span></div>'; }

  function vistaMisiones() {
    var body = MISIONES.map(function (m) {
      var pr = m.prog(), done = !!S.misionesCobradas[m.id] || pr.cur >= pr.meta;
      var pct = Math.max(0, Math.min(100, pr.cur / pr.meta * 100));
      return '<div class="mision' + (done ? " done" : "") + '"><div class="mt"><b>' + (done ? "✓ " : "") + esc(m.n) + '</b><span class="rew">+' + m.rew + ' XP</span></div><p>' + esc(m.d) + '</p><div class="mbar"><i style="width:' + pct + '%"></i></div><div class="mmeta"><span>' + Math.min(pr.cur, pr.meta) + '/' + pr.meta + '</span><span>' + (done ? "completada" : "en curso") + '</span></div></div>';
    }).join("");
    abrirDrawer("Misiones", body);
  }
  function vistaLogros() {
    var body = '<div class="logros">' + LOGROS.map(function (l) {
      var ok = !!S.logros[l.id];
      return '<div class="logro' + (ok ? " ok" : "") + '"><div class="ic">' + (ok ? l.ic : "🔒") + '</div><b>' + esc(l.n) + '</b><span>' + esc(l.d) + '</span></div>';
    }).join("") + '</div>';
    abrirDrawer("Logros", body);
  }
  function vistaNotis() {
    var body = S.notis.length ? S.notis.map(function (n) {
      return '<div class="noti"><span class="ni">' + n.ic + '</span><div class="nb"><b>' + esc(n.titulo) + '</b><span>' + esc(n.texto) + '</span><br><time>' + hace(n.t) + '</time></div></div>';
    }).join("") : '<p class="vacio">Todavía no hay notificaciones. Explorá el multiverso para empezar a sumar.</p>';
    abrirDrawer("Notificaciones", body);
    S.notisLeidas = S.notis.length; save(); actualizarPip();
  }
  function vistaApoyar() {
    var btns = "";
    if (linkOk(APOYO.cafecito))
      btns += '<a class="apoyo-btn" style="--c:#8b5cf6" href="' + esc(APOYO.cafecito) + '" target="_blank" rel="noopener"><span class="em">☕</span><span class="tx"><b>Invitame un cafecito</b><small>Con tarjeta o Mercado Pago, en pesos</small></span></a>';
    if (linkOk(APOYO.mercadopago))
      btns += '<a class="apoyo-btn" style="--c:#22d3ee" href="' + esc(APOYO.mercadopago) + '" target="_blank" rel="noopener"><span class="em">💸</span><span class="tx"><b>Donar con Mercado Pago</b><small>Lo que quieras, de una</small></span></a>';
    // Compartir siempre está: es gratis y también ayuda.
    btns += '<button class="apoyo-btn" id="apoyoCompartir" style="--c:#e879f9"><span class="em">📣</span><span class="tx"><b>Compartir el taller</b><small>Pasáselo a alguien a quien le sirva</small></span></button>';

    var hayDonar = linkOk(APOYO.cafecito) || linkOk(APOYO.mercadopago);
    var intro = hayDonar
      ? 'Todo esto lo hago yo solo y lo mantengo gratis: sin cuentas, sin publicidad y sin vender los datos de nadie. Si algo de acá te sirve o te divierte, podés tirarme una mano para bancar los servidores y seguir sumando cosas. Con lo que sea ya me das una mano enorme. Y si no es el momento, compartirlo también suma un montón.'
      : 'Todo esto lo hago yo solo y lo mantengo gratis: sin cuentas, sin publicidad y sin vender los datos de nadie. Por ahora la mejor forma de dar una mano es compartirlo con alguien a quien le pueda servir. ¡Gracias por pasar!';

    var body = '<p class="apoyo-intro">' + intro + '</p><div class="apoyo-btns">' + btns + '</div>';
    abrirDrawer("Apoyá el proyecto", body, function () {
      var cb = $("#apoyoCompartir");
      if (cb) cb.addEventListener("click", function () {
        var url = location.origin + location.pathname;
        var datos = { title: "Taller Multiverse", text: "Un multiverso de apps y juegos gratis en el navegador. Mirá:", url: url };
        if (navigator.share) { navigator.share(datos).catch(function () {}); }
        else if (navigator.clipboard) {
          navigator.clipboard.writeText(url).then(function () { toast("🔗", "Link copiado", "Pegalo donde quieras."); })
            .catch(function () { toast("🔗", "Compartí este link", url); });
        } else { toast("🔗", "Compartí este link", url); }
      });
    });
  }

  function hace(t) {
    var s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return "hace un momento"; if (s < 3600) return "hace " + Math.floor(s / 60) + " min";
    if (s < 86400) return "hace " + Math.floor(s / 3600) + " h"; return "hace " + Math.floor(s / 86400) + " d";
  }

  // ---------- fondo: estrellas ----------
  function cielo() {
    var c = $("#cielo"); if (!c || !c.getContext) return;
    var ctx = c.getContext("2d"), estrellas = [], fugaces = [], raf = 0, W = 0, H = 0, DPR = Math.min(2, window.devicePixelRatio || 1);
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion:reduce)").matches;
    function resize() {
      W = c.clientWidth; H = c.clientHeight; c.width = W * DPR; c.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      var n = Math.min(window.innerWidth < 720 ? 90 : 170, Math.floor(W * H / 8000)); estrellas = [];
      for (var i = 0; i < n; i++) estrellas.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.3 + .3, a: Math.random(), s: Math.random() * .02 + .004, v: Math.random() * .06 + .02 });
    }
    function paso() {
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < estrellas.length; i++) {
        var e = estrellas[i]; e.a += e.s; var al = .4 + Math.abs(Math.sin(e.a)) * .6;
        if (!reduce) { e.y += e.v; if (e.y > H) { e.y = 0; e.x = Math.random() * W; } }
        ctx.globalAlpha = al; ctx.fillStyle = i % 9 === 0 ? "#8bd3ff" : "#eaf0ff";
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 6.3); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reduce) {
        if (Math.random() < .004 && fugaces.length < 2) fugaces.push({ x: Math.random() * W, y: Math.random() * H * .5, len: 80 + Math.random() * 80, sp: 6 + Math.random() * 5, life: 1 });
        for (var j = fugaces.length - 1; j >= 0; j--) {
          var f = fugaces[j]; f.x += f.sp; f.y += f.sp * .5; f.life -= .02;
          var grad = ctx.createLinearGradient(f.x, f.y, f.x - f.len, f.y - f.len * .5);
          grad.addColorStop(0, "rgba(180,220,255," + Math.max(0, f.life) + ")"); grad.addColorStop(1, "transparent");
          ctx.strokeStyle = grad; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x - f.len, f.y - f.len * .5); ctx.stroke();
          if (f.life <= 0 || f.x > W + 100) fugaces.splice(j, 1);
        }
      }
      raf = requestAnimationFrame(paso);
    }
    resize(); window.addEventListener("resize", function () { cancelAnimationFrame(raf); resize(); if (reduce) paso(); else raf = requestAnimationFrame(paso); });
    if (reduce) paso(); else raf = requestAnimationFrame(paso);
  }

  // ---------- init ----------
  function init() {
    scrim = $("#scrim"); drawer = $("#drawer");
    diaNuevo();
    render("");
    renderPlayer(); actualizarPip();
    revisar(); // por si ya cumplió algo (p.ej. logro de días)

    var bus = $("#buscar");
    if (bus) bus.addEventListener("input", function () { render(bus.value.trim()); });

    $("#navPerfil").addEventListener("click", vistaPerfil);
    $("#navMisiones").addEventListener("click", vistaMisiones);
    $("#navLogros").addEventListener("click", vistaLogros);
    $("#navNotis").addEventListener("click", vistaNotis);
    var na = $("#navApoyar"); if (na) na.addEventListener("click", vistaApoyar);
    var fa = $("#footApoyar"); if (fa) fa.addEventListener("click", function (e) { e.preventDefault(); vistaApoyar(); });
    $("#heroPerfil").addEventListener("click", vistaPerfil);
    $("#heroExplorar").addEventListener("click", function () { var g = $("#galaxias"); if (g) g.scrollIntoView({ behavior: "smooth" }); });
    $("#drawerX").addEventListener("click", cerrarDrawer);
    scrim.addEventListener("click", cerrarDrawer);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") cerrarDrawer(); });

    cielo();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
