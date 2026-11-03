/* El Garca — interfaz (DOM). Usa globalThis.Garca. Todo ficticio / parodia. */
(function () {
  "use strict";
  const M = globalThis.Garca;
  const $ = (id) => document.getElementById(id);
  const CLAVE = "garca_save";

  // ---- estado ----
  let s = cargarGuardado() || M.nuevo();
  M.rellenarMarcas(s, 5);
  let modo = "bandeja"; // bandeja | verso | chat
  let marcaSel = null;
  let ocupado = false; // bloquea mientras el NPC "escribe"

  // ---- guardado ----
  function guardar() { try { localStorage.setItem(CLAVE, M.serializar(s)); } catch (e) {} }
  function cargarGuardado() {
    try { const t = localStorage.getItem(CLAVE); if (!t) return null; return M.cargar(t); } catch (e) { return null; }
  }

  // ---- noticias / avisos ----
  function noti(txt, tipo) {
    if (!s.hist) s.hist = [];
    s.hist.unshift({ txt, tipo: tipo || "", t: Date.now() });
    s.hist = s.hist.slice(0, 30);
    pintarNoticias();
  }
  let avisoT;
  function aviso(txt) {
    const a = $("aviso"); a.textContent = txt; a.hidden = false;
    clearTimeout(avisoT); avisoT = setTimeout(() => (a.hidden = true), 2600);
  }
  function pintarNoticias() {
    $("noticias").innerHTML = (s.hist || []).map((n) =>
      `<li class="${n.tipo}">${n.txt}</li>`).join("");
  }

  // ---- tablero ----
  function pintarTablero() {
    $("rango").textContent = M.RANGOS[s.rango].n;
    const sig = M.RANGOS[s.rango + 1];
    $("rangoLbl").textContent = sig ? "Rango (próximo: " + sig.n + ")" : "Rango máximo";
    $("plata").textContent = M.money(s.plata);
    // ingreso pasivo
    let ing = 0; for (const id in s.socios) { const d = M.socioPorId(id); if (d) ing += d.ingreso * s.socios[id]; }
    let opIng = 0; for (const id in (s.operadores || {})) { const d = M.operPorId(id); if (d) opIng += d.ingreso * s.operadores[id]; }
    if (s.herramientas.callcenter) opIng *= 1.35;
    if (s.herramientas.web) opIng *= 1.15;
    ing = (ing + opIng) * M.multRep(s);
    $("ingreso").textContent = ing > 0 ? M.money(ing) + "/s automático" : "sin ingreso pasivo todavía";
    // calor
    const cal = Math.round(s.calor);
    $("calorB").style.width = cal + "%";
    $("calorTxt").textContent = cal + " %";
    const dc = $("datoCana"); dc.classList.remove("media", "alta");
    let hint = "Tranqui, nadie te busca.";
    if (cal >= 75) { dc.classList.add("alta"); hint = "🚨 ¡La cana te pisa los talones!"; }
    else if (cal >= 40) { dc.classList.add("media"); hint = "👀 Te están empezando a marcar."; }
    $("calorHint").textContent = hint;
    $("estafas").textContent = s.estafas;
    $("rep").textContent = s.reputacion || 0;
  }

  // ---- teléfono ----
  const body = () => $("phoneBody");
  const foot = () => $("phoneFoot");

  function pintarTelefono() {
    if (modo === "bandeja") return pintarBandeja();
    if (modo === "verso") return pintarVersos();
    // chat lo maneja el flujo
  }

  function pintarBandeja() {
    $("phoneTitulo").textContent = "📱 WhatsGarca";
    $("phoneSub").textContent = "Elegí a quién engañar";
    M.rellenarMarcas(s, 5);
    let html = '<div class="listahead">VÍCTIMAS DISPONIBLES · tocá una para versearla</div>';
    html += s.marcas.map((m) => {
      const deb = m.debil.map((id) => (M.versoPorId(id) || {}).emoji || "").join("");
      return `<button class="vic${m.quemada ? " quemada" : ""}" data-m="${m.id}">
        <span class="av">${m.emoji}</span>
        <span class="info"><b>${m.nombre}</b><span>${m.etiqueta} · ${m.bio}</span><span class="deb">cae con: ${deb}</span></span>
        <span class="plata">💰 ${M.money(m.plata)}<br><span class="deb">ingenuidad ${m.ingenuidad}</span></span>
      </button>`;
    }).join("");
    body().innerHTML = html;
    body().querySelectorAll(".vic").forEach((b) =>
      b.addEventListener("click", () => { marcaSel = b.dataset.m; modo = "verso"; pintarTelefono(); }));
    foot().innerHTML = '<button class="bsalir" id="bRefrescar">🔄 Buscar otras víctimas</button>';
    $("bRefrescar").addEventListener("click", () => {
      // descarta las no quemadas y trae nuevas (cuesta un poco de calor: andás ofreciendo)
      s.marcas = s.marcas.filter((m) => m.estafada > 0 && !m.quemada);
      M.rellenarMarcas(s, 5); pintarBandeja();
    });
  }

  function pintarVersos() {
    const m = s.marcas.find((x) => x.id === marcaSel);
    if (!m) { modo = "bandeja"; return pintarTelefono(); }
    $("phoneTitulo").textContent = m.emoji + " " + m.nombre;
    $("phoneSub").textContent = m.etiqueta + " · 💰 " + M.money(m.plata);
    let html = `<div class="elegir-verso"><div class="vhead">¿Con qué verso lo/la encarás?</div>`;
    html += M.VERSOS.map((v) => {
      const unlocked = s.plataTotal >= v.min || v.min === 0;
      const debil = m.debil.indexOf(v.id) >= 0;
      if (!unlocked) return `<div class="vcard bloq"><b>${v.emoji} ${v.n} <em>🔒</em></b><span>Se desbloquea con ${M.money(v.min)} robados en total.</span></div>`;
      return `<button class="vcard" data-v="${v.id}"><b>${v.emoji} ${v.n} ${debil ? "<em>★ le pega justo</em>" : ""}</b><span>${v.desc}</span></button>`;
    }).join("");
    html += "</div>";
    body().innerHTML = html;
    body().querySelectorAll(".vcard[data-v]").forEach((b) =>
      b.addEventListener("click", () => iniciarChat(m.id, b.dataset.v)));
    foot().innerHTML = '<button class="bsalir" id="bVolver">◀ Volver a la bandeja</button>';
    $("bVolver").addEventListener("click", () => { modo = "bandeja"; pintarTelefono(); });
  }

  // ---- chat ----
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function burbuja(clase, txt) {
    const d = document.createElement("div");
    d.className = "msg " + clase;
    d.innerHTML = txt + '<small>' + horaFalsa() + (clase === "yo" ? " ✓✓" : "") + "</small>";
    body().appendChild(d); scrollAbajo();
    return d;
  }
  function horaFalsa() { const d = new Date(); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }
  function scrollAbajo() { body().scrollTop = body().scrollHeight; }

  async function escribirNpc(lines) {
    for (const ln of lines) {
      const t = document.createElement("div");
      t.className = "typing"; t.innerHTML = "<i></i><i></i><i></i>";
      body().appendChild(t); scrollAbajo();
      await sleep(Math.min(1100, 350 + ln.length * 22));
      t.remove();
      burbuja("npc", ln);
      await sleep(180);
    }
  }

  async function iniciarChat(marcaId, versoId) {
    const m = s.marcas.find((x) => x.id === marcaId);
    const start = M.empezarChat(s, marcaId, versoId);
    if (!start) { modo = "bandeja"; return pintarTelefono(); }
    modo = "chat";
    $("phoneTitulo").textContent = m.emoji + " " + m.nombre;
    $("phoneSub").textContent = "en línea";
    body().innerHTML = ""; foot().innerHTML = "";
    ocupado = true;
    await escribirNpc(start.npc);
    ocupado = false;
    mostrarOpciones(start.ops);
  }

  function mostrarOpciones(ops) {
    const cont = document.createElement("div"); cont.className = "ops-chat";
    ops.forEach((t, i) => {
      const b = document.createElement("button"); b.textContent = t;
      b.addEventListener("click", () => responder(i, t));
      cont.appendChild(b);
    });
    foot().innerHTML = ""; foot().appendChild(cont);
  }

  async function responder(i, txt) {
    if (ocupado) return;
    ocupado = true; foot().innerHTML = "";
    burbuja("yo", txt);
    await sleep(260);
    const r = M.responder(s, i);
    if (!r) { ocupado = false; return; }
    if (r.cobro) { ocupado = false; return panelCobro(); }
    await escribirNpc(r.npc);
    ocupado = false;
    mostrarOpciones(r.ops);
  }

  function panelCobro() {
    const ch = M.chanceCobro(s);
    const monto = M.montoCobro(s);
    const cls = ch >= 60 ? "alta" : ch >= 35 ? "media" : "baja";
    const c = s.chat;
    const cont = document.createElement("div"); cont.className = "cobro";
    cont.innerHTML =
      `<div class="medidor">Momento de pedirle la plata…</div>
       <div class="chance ${cls}">Chance de éxito: ${ch} %</div>
       <div class="mini"><span>🤝 Confianza: ${Math.round(c.conf)}</span><span>🚩 Sospecha: ${Math.round(c.susp)}</span></div>
       <div class="medidor">Si cae, te lleva hasta ${M.money(monto)}</div>
       <button class="bcobrar" id="bCobrar">💸 COBRAR</button>
       <button class="bsalir" id="bRajar">Rajar sin cobrar</button>`;
    foot().innerHTML = ""; foot().appendChild(cont);
    $("bCobrar").addEventListener("click", ejecutarCobro);
    $("bRajar").addEventListener("click", () => { s.chat = null; modo = "bandeja"; pintarTelefono(); guardar(); });
  }

  async function ejecutarCobro() {
    if (ocupado) return; ocupado = true; foot().innerHTML = "";
    const res = M.cobrar(s);
    await escribirNpc([res.npc]);
    await sleep(200);
    const banner = document.createElement("div");
    banner.className = "resultado " + (res.exito ? "ok" : "mal");
    if (res.exito) banner.innerHTML = `<b>¡CAYÓ! +${M.money(res.monto)}</b>Otro incauto menos. ${res.quemada ? "Ya no cae más, lo quemaste." : ""}`;
    else if (res.denuncia) banner.innerHTML = `<b>TE DENUNCIARON 🚔</b>La cana subió fuerte. Cuidado.`;
    else banner.innerHTML = `<b>NO PICÓ</b>Se dio cuenta. A otra cosa.`;
    body().appendChild(banner); scrollAbajo();

    noti((res.exito ? "💰 Estafaste a " : "❌ Falló con ") +
      (s.marcas.find((m) => m.id === s.chat.marcaId) || {}).nombre +
      (res.exito ? " (+" + M.money(res.monto) + ")" : res.denuncia ? " (¡te denunció!)" : ""),
      res.exito ? "bueno" : "malo");

    pintarTablero(); pintarTienda(tabActual); guardar();

    // logros
    M.chequearLogros(s).forEach((l) => { noti("🏆 Logro: " + l.n, "logro"); aviso("🏆 " + l.n); });

    const foot2 = foot(); foot2.innerHTML = "";
    const volver = document.createElement("button");
    volver.className = "pri"; volver.textContent = "📱 Volver a la bandeja";
    volver.addEventListener("click", () => {
      s.chat = null; ocupado = false; modo = "bandeja"; pintarTelefono();
      if (res.allanado) finAllanado();
      else maybeEvento();
    });
    foot2.appendChild(volver);
    ocupado = false;

    if (res.allanado) { /* se maneja al volver */ }
  }

  // ---- eventos ----
  let ultimoEvento = 0;
  function maybeEvento() {
    if (Date.now() - ultimoEvento < 25000) return;
    if (Math.random() < 0.28) { ultimoEvento = Date.now(); abrirEvento(M.eventoRandom()); }
  }
  function abrirEvento(ev) {
    $("evT").textContent = ev.t; $("evD").textContent = ev.d;
    const cont = $("evOps"); cont.innerHTML = "";
    ev.ops.forEach((op) => {
      const b = document.createElement("button"); b.textContent = op.t;
      b.addEventListener("click", () => {
        op.fx(s); $("mEvento").hidden = true;
        noti("📰 " + ev.t, ""); pintarTablero(); pintarTelefono(); pintarTienda(tabActual); guardar();
      });
      cont.appendChild(b);
    });
    $("mEvento").hidden = false;
  }

  // ---- allanamiento ----
  function finAllanado() {
    $("finT").textContent = "🚔 ¡TE ALLANARON!";
    $("finD").textContent = "La cana llegó a tu puerta. Te quedás sin buena parte de la plata, pero zafaste de la cárcel… por ahora.";
    $("finStats").innerHTML =
      `<li><span>Plata que te quedó</span><b>${M.money(s.plata)}</b></li>
       <li><span>Estafas hechas</span><b>${s.estafas}</b></li>
       <li><span>Allanamientos sufridos</span><b>${s.allanamientos}</b></li>`;
    $("bFinOk").textContent = "SEGUIR EN LA DELINCUENCIA";
    $("mFin").hidden = false;
    pintarTablero(); guardar();
  }

  // ---- tienda ----
  let tabActual = "herr";
  function pintarTienda(tab) {
    tab = tab || tabActual;
    if (tab === "herr") pintarHerr();
    else if (tab === "oper") pintarOperadores();
    else if (tab === "socios") pintarSocios();
    else if (tab === "logros") pintarLogros();
    else if (tab === "carrera") pintarCarrera();
  }
  function pintarHerr() {
    $("tab-herr").innerHTML = M.HERRAMIENTAS.map((h) => {
      const tiene = !!s.herramientas[h.id];
      const puede = !tiene && s.plata >= h.precio;
      return `<button class="item ${tiene ? "hecho" : (!puede ? "caro" : "")}" data-h="${h.id}" ${tiene || !puede ? "disabled" : ""}>
        <span class="em">${h.emoji}</span><span class="n">${h.n}</span>
        <span class="c">${tiene ? "✔ tenés" : M.money(h.precio)}</span>
        <span class="d">${h.desc}</span></button>`;
    }).join("");
    $("tab-herr").querySelectorAll(".item[data-h]").forEach((b) =>
      b.addEventListener("click", () => {
        if (M.comprarHerr(s, b.dataset.h)) { aviso("Comprado ✔"); M.chequearLogros(s).forEach((l) => noti("🏆 Logro: " + l.n, "logro")); pintarTablero(); pintarHerr(); guardar(); }
        else aviso("No te alcanza.");
      }));
  }
  function pintarSocios() {
    $("tab-socios").innerHTML = M.SOCIOS.map((so) => {
      const q = s.socios[so.id] || 0; const costo = M.costoSocio(s, so.id);
      const puede = s.plata >= costo;
      const extra = (so.ingreso ? "+" + M.money(so.ingreso) + "/s " : "") + (so.enfria ? "· enfría " + so.enfria + "/s" : "");
      return `<button class="item ${!puede ? "caro" : ""}" data-s="${so.id}" ${!puede ? "disabled" : ""}>
        <span class="em">${so.emoji}</span><span class="n">${so.n} ${q ? "×" + q : ""}</span>
        <span class="c">${M.money(costo)}</span>
        <span class="d">${so.desc}<br>${extra}</span></button>`;
    }).join("");
    $("tab-socios").querySelectorAll(".item[data-s]").forEach((b) =>
      b.addEventListener("click", () => {
        if (M.comprarSocio(s, b.dataset.s)) { aviso("Sumaste un socio 🤝"); M.chequearLogros(s).forEach((l) => noti("🏆 Logro: " + l.n, "logro")); pintarTablero(); pintarSocios(); guardar(); }
        else aviso("No te alcanza.");
      }));
  }
  function pintarOperadores() {
    let html = '<div class="sub">ASISTENTES DE LLAMADAS · estafan solos por vos (⚠️ generan calor)</div>';
    html += M.OPERADORES.map((o) => {
      const q = s.operadores[o.id] || 0; const costo = M.costoOperador(s, o.id);
      const puede = s.plata >= costo;
      return `<button class="item ${!puede ? "caro" : ""}" data-o="${o.id}" ${!puede ? "disabled" : ""}>
        <span class="em">${o.emoji}</span><span class="n">${o.n} ${q ? "×" + q : ""}</span>
        <span class="c">${M.money(costo)}</span>
        <span class="d">${o.desc}<br>+${M.money(o.ingreso)}/s · 🔥 +${o.calor}/s de calor</span></button>`;
    }).join("");
    $("tab-oper").innerHTML = html;
    $("tab-oper").querySelectorAll(".item[data-o]").forEach((b) =>
      b.addEventListener("click", () => {
        if (M.comprarOperador(s, b.dataset.o)) { aviso("Operador contratado 📞"); M.chequearLogros(s).forEach((l) => noti("🏆 Logro: " + l.n, "logro")); pintarTablero(); pintarOperadores(); guardar(); }
        else aviso("No te alcanza.");
      }));
  }
  function pintarLogros() {
    $("tab-logros").innerHTML = '<div class="logros">' + M.LOGROS.map((l) =>
      `<span class="${s.logros[l.id] ? "ok" : ""}">${s.logros[l.id] ? "🏆 " : "🔒 "}${l.n}</span>`).join("") + "</div>";
  }
  function pintarCarrera() {
    const gan = M.reputacionGanable(s);
    let html = '<div class="sub">TU CARRERA EN EL BAJO MUNDO</div>';
    html += '<ul class="stats">';
    html += `<li><span>Rango</span><b>${M.RANGOS[s.rango].n}</b></li>`;
    html += `<li><span>Robado en total</span><b>${M.money(s.plataTotal)}</b></li>`;
    html += `<li><span>Estafas / intentos</span><b>${s.estafas} / ${s.intentos}</b></li>`;
    html += `<li><span>Reputación actual</span><b>${s.reputacion || 0} (×${M.multRep(s).toFixed(2)})</b></li>`;
    html += "</ul>";
    html += '<div class="sub">RANGOS</div><ul class="stats">';
    M.RANGOS.forEach((r, i) => {
      html += `<li style="${i === s.rango ? "color:var(--oro)" : i < s.rango ? "opacity:.5" : ""}"><span>${r.n}</span><b>${M.money(r.min)}</b></li>`;
    });
    html += "</ul>";
    html += `<div class="sub">RETIRARTE</div><p class="nota" style="font-size:18px;margin:0 0 8px">Si te retirás, empezás de cero pero ganás <b>${gan}</b> de reputación (cada punto hace rendir todo un 4% más para siempre).</p>`;
    $("tab-carrera").innerHTML = html;
  }

  // ---- tabs ----
  document.querySelectorAll(".tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".tabs button").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      ["herr", "oper", "socios", "logros", "carrera"].forEach((t) => $("tab-" + t).hidden = t !== b.dataset.tab);
      tabActual = b.dataset.tab; pintarTienda(tabActual);
    }));

  // ---- botones ----
  $("bLavar").addEventListener("click", () => {
    if (s.calor <= 0) return aviso("No tenés cana que lavar.");
    if (M.lavar(s)) { aviso("Plata lavada, bajó el calor 💵"); pintarTablero(); pintarTienda(tabActual); guardar(); }
    else aviso("No te alcanza para lavar.");
  });
  $("bAyuda").addEventListener("click", () => $("mAyuda").hidden = false);
  $("bMenu").addEventListener("click", () => $("mMenu").hidden = false);
  $("bFinOk").addEventListener("click", () => $("mFin").hidden = true);
  document.querySelectorAll("[data-cerrar]").forEach((b) =>
    b.addEventListener("click", () => b.closest(".modal").hidden = true));
  document.querySelectorAll(".modal").forEach((m) =>
    m.addEventListener("click", (e) => { if (e.target === m && m.id !== "mEvento") m.hidden = true; }));

  $("bExportar").addEventListener("click", () => {
    const code = btoa(unescape(encodeURIComponent(M.serializar(s))));
    navigator.clipboard && navigator.clipboard.writeText(code).then(() => aviso("Código copiado ✔"), () => prompt("Copiá tu código:", code));
    prompt("Tu código de partida (copialo):", code);
  });
  $("bImportar").addEventListener("click", () => {
    const code = prompt("Pegá tu código de partida:");
    if (!code) return;
    try {
      const s2 = M.cargar(decodeURIComponent(escape(atob(code.trim()))));
      if (!s2) return aviso("Código inválido.");
      s = s2; M.rellenarMarcas(s, 5); modo = "bandeja"; $("mMenu").hidden = true;
      refrescarTodo(); guardar(); aviso("Partida cargada ✔");
    } catch (e) { aviso("Código inválido."); }
  });
  $("bRetirarse").addEventListener("click", () => {
    const gan = M.reputacionGanable(s);
    if (!confirm("¿Retirarte del bajo mundo? Empezás de cero pero ganás " + gan + " de reputación para siempre.")) return;
    const r = M.retirarse(s); s = r.estado; M.rellenarMarcas(s, 5); modo = "bandeja"; $("mMenu").hidden = true;
    refrescarTodo(); guardar(); aviso("Te retiraste con +" + r.ganada + " de reputación 🎩");
  });
  $("bBorrar").addEventListener("click", () => {
    if (!confirm("¿Borrar TODO y empezar de cero? No se puede deshacer.")) return;
    try { localStorage.removeItem(CLAVE); } catch (e) {}
    s = M.nuevo(); M.rellenarMarcas(s, 5); modo = "bandeja"; $("mMenu").hidden = true;
    refrescarTodo(); aviso("Borrado. Arrancás de nuevo.");
  });

  function refrescarTodo() { pintarTablero(); pintarTelefono(); pintarTienda(tabActual); pintarNoticias(); }

  // ---- bucle pasivo ----
  let acum = 0, narrAcum = 0;
  setInterval(() => {
    const r = M.paso(s, 1);
    if (r.allanado) { noti("🚔 ¡Te allanaron el call center! Perdiste parte de la plata.", "malo"); aviso("🚔 ¡Allanamiento! Bajá el calor."); }
    // narración de las auto-estafas de los operadores
    const nop = M.totalOperadores(s);
    if (nop > 0) {
      narrAcum++;
      const cada = Math.max(3, 8 - nop);
      if (narrAcum >= cada) { narrAcum = 0; if (Math.random() < 0.7) noti(M.autoNarracion(s), "bueno"); }
    }
    pintarTablero();
    if (modo !== "chat") pintarTienda(tabActual); // actualiza precios alcanzables
    acum++; if (acum % 5 === 0) guardar();
  }, 1000);

  // recuperar tiempo offline
  (function () {
    if (s.guardado) {
      const seg = Math.floor((Date.now() - s.guardado) / 1000);
      if (seg > 30) {
        const o = M.offline(s, seg);
        if (o.ingreso > 0) noti("😴 Mientras no estabas, tus socios juntaron " + M.money(o.ingreso), "bueno");
      }
    }
  })();

  // ---- arranque ----
  if (!localStorage.getItem(CLAVE + "_visto")) {
    try { localStorage.setItem(CLAVE + "_visto", "1"); } catch (e) {}
    setTimeout(() => $("mAyuda").hidden = false, 400);
    noti("Bienvenido al bajo mundo. Elegí una víctima y versealá.", "");
  }
  refrescarTodo();
})();
