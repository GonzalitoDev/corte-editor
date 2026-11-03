/* La Garita — interfaz (DOM). Usa globalThis.Garita. Todo ficticio. */
(function () {
  "use strict";
  const M = globalThis.Garita;
  const $ = (id) => document.getElementById(id);
  const CLAVE = "garita_save";

  let s = cargar() || M.nuevo();
  let def = null, cola = [], idx = 0, sol = null, decidido = false;
  try { window.__garita = { M, get s() { return s; }, get sol() { return sol; }, get def() { return def; } }; } catch (e) {}

  function cargar() { try { const t = localStorage.getItem(CLAVE); return t ? M.cargar(t) : null; } catch (e) { return null; } }
  function guardar() { try { localStorage.setItem(CLAVE, M.serializar(s)); } catch (e) {} }

  let avisoT;
  function aviso(t) { const a = $("aviso"); a.textContent = t; a.hidden = false; clearTimeout(avisoT); avisoT = setTimeout(() => a.hidden = true, 2400); }

  // ---------- arranque ----------
  function arrancar() {
    if (s.terminado) return mostrarFinal();
    mostrarBoletin();
  }

  function mostrarBoletin() {
    const d = M.diaDef(s.dia);
    $("boT").textContent = "Día " + d.n + " · " + d.titulo;
    $("boReglas").innerHTML = d.boletin.map((l) => `<li>${l}</li>`).join("");
    $("jornada").textContent = "Día " + d.n;
    $("mBoletin").hidden = false;
  }

  function empezarDia() {
    $("mBoletin").hidden = true;
    const r = M.iniciarDia(s); def = r.def; cola = r.cola; idx = 0;
    $("hoyFecha").textContent = "HOY: " + M.fecha(M.HOY0 + (def.n - 1));
    pintarReglamento();
    siguientePersona();
    guardar();
  }

  function pintarReglamento() {
    const html = def.boletin.map((l) => `<li>${l}</li>`).join("");
    $("regLista").innerHTML = html;
  }

  // ---------- persona ----------
  function siguientePersona() {
    $("feedback").hidden = true;
    decidido = false;
    if (idx >= cola.length) return finDelDia();
    sol = cola[idx];
    $("cara").textContent = sol.persona.emoji;
    $("quien").innerHTML = "En la ventanilla<small>" + (sol.persona.ciudadano ? "dice ser de Tramitania" : "viene de afuera") + "</small>";
    $("globo").innerHTML = sol.guion.map((l) => l.startsWith("(") ? `<span class="susurro">${l}</span>` : l).join("<br>");
    $("progreso").textContent = "Día " + def.n + " · persona " + (idx + 1) + "/" + cola.length;
    $("jornal").textContent = "Hoy: $ " + s.ganadoHoy;
    pintarDocs(sol);
    // sellos
    $("bAprobar").disabled = false; $("bDenegar").disabled = false;
    $("bDetener").hidden = !def.reglas.buscados; $("bDetener").disabled = false;
    $("bSiguiente").hidden = true;
  }

  function campo(k, v) { return `<div class="campo"><span>${k}</span><b>${v}</b></div>`; }

  function pintarDocs(sol) {
    const d = sol.docs; const ban = $("bandeja");
    if (!Object.keys(d).length) { ban.innerHTML = '<div class="sinpapeles">No entrega ningún documento.</div>'; return; }
    let html = "";
    for (const k in d) html += docCard(k, d[k], sol);
    ban.innerHTML = html;
    ban.querySelectorAll(".dtit").forEach((t) =>
      t.addEventListener("click", () => { const c = t.nextElementSibling; c.hidden = !c.hidden; }));
  }

  function docCard(k, doc, sol) {
    const esPas = k === "pasaporte";
    let cuerpo = "";
    if (esPas) {
      cuerpo += `<div class="foto">${sol.persona.emoji}</div>`;
      cuerpo += campo("País", doc.pais);
      cuerpo += campo("Nombre", doc.nombre);
      cuerpo += campo("N°", doc.numero);
      cuerpo += campo("Nacimiento", M.fecha(doc.nacimiento));
      cuerpo += campo("Vence", M.fecha(doc.vencimiento));
      cuerpo += campo("Sexo", doc.sexo === "M" ? "Masculino" : "Femenino");
    } else if (k === "cedula") {
      cuerpo += campo("Nombre", doc.nombre) + campo("N°", doc.numero) + campo("Ciudad", doc.ciudad) + campo("Nacimiento", M.fecha(doc.nacimiento));
    } else if (k === "permiso") {
      cuerpo += campo("Nombre", doc.nombre) + campo("Motivo", doc.motivo) + campo("Vence", M.fecha(doc.vencimiento)) + campo("Sello", doc.sello ? "✔ válido" : "— sin sello");
    } else if (k === "trabajo") {
      cuerpo += campo("Nombre", doc.nombre) + campo("Oficio", doc.oficio) + campo("Vence", M.fecha(doc.vencimiento)) + campo("Sello", doc.sello ? "✔ válido" : "— sin sello");
    } else if (k === "vacuna") {
      cuerpo += campo("Nombre", doc.nombre) + campo("Vence", M.fecha(doc.vencimiento));
    }
    const cls = (doc.pais === M.PAIS) ? "doc citizen" : "doc";
    return `<div class="${cls}"><div class="dtit">${doc.tipo} <span>▾</span></div><div class="dcuerpo">${cuerpo}</div></div>`;
  }

  // ---------- decisión ----------
  function decidir(accion) {
    if (!sol || decidido) return;
    decidido = true;
    $("bAprobar").disabled = true; $("bDenegar").disabled = true; $("bDetener").disabled = true;
    const r = M.resolver(s, sol, accion);
    const fb = $("feedback"); fb.hidden = false;
    if (r.especial === "coima") { fb.className = "feedback esp"; fb.innerHTML = "<b>💵 Aceptaste la coima</b>Lo dejaste pasar y te guardaste los billetes. El Ministerio no lo sabe… por ahora."; }
    else if (r.especial === "resistencia") { fb.className = "feedback esp"; fb.innerHTML = "<b>🕯️ Favor a los del sótano</b>Lo dejaste pasar. Un día te lo van a devolver."; }
    else if (r.correcto) { fb.className = "feedback ok"; fb.innerHTML = "<b>✔ Bien sellado</b>" + (accion === "detener" ? "Detuviste a un buscado. El Ministerio lo agradece." : "Decisión correcta."); }
    else {
      fb.className = "feedback mal";
      let txt = "<b>" + (r.aviso ? "⚠ Aviso del Ministerio" : "✖ Citación (−$" + r.multa + ")") + "</b>";
      txt += "La decisión correcta era <b>" + r.correcta.toUpperCase() + "</b>.";
      if (r.motivos && r.motivos.length) txt += "<ul>" + r.motivos.map((m) => `<li>${m}</li>`).join("") + "</ul>";
      else txt += "<br>Estaba todo en regla.";
      fb.innerHTML = txt;
    }
    $("jornal").textContent = "Hoy: $ " + s.ganadoHoy;
    $("bDetener").hidden = true;
    $("bSiguiente").hidden = false;
    guardar();
  }

  function siguiente() { idx++; siguientePersona(); }

  // ---------- fin del día / noche ----------
  let compra = {};
  function finDelDia() {
    $("bSiguiente").hidden = true;
    $("globo").innerHTML = '<span class="vacia">Cerraste la ventanilla por hoy.</span>';
    $("cara").textContent = "—"; $("quien").textContent = "Fin de la jornada";
    $("bandeja").innerHTML = '<div class="sinpapeles">—</div>';
    // ledger
    $("nocheT").textContent = "Fin del día " + def.n;
    $("nocheLedger").innerHTML =
      `<li><span>Atendidos hoy</span><b>${s.correctosHoy + s.erroresHoy}</b></li>` +
      `<li><span>Correctos / errores</span><b>${s.correctosHoy} / ${s.erroresHoy}</b></li>` +
      `<li class="plus"><span>Ganado hoy</span><b>+$ ${s.ganadoHoy}</b></li>` +
      `<li><span>Plata en mano</span><b>$ ${s.dinero}</b></li>`;
    // defaults de compra por prioridad
    compra = { alquiler: false, comida: false, calefaccion: false, medicina: false };
    const hayEnfermo = s.familia.some((f) => f.estado === "enfermo");
    let libre = s.dinero;
    const costo = { alquiler: M.COSTOS.alquiler, comida: M.gastoComida(s), calefaccion: M.COSTOS.calefaccion, medicina: M.COSTOS.medicina };
    [hayEnfermo ? "medicina" : null, "comida", "alquiler", "calefaccion"].filter(Boolean).forEach((k) => {
      if (libre >= costo[k]) { compra[k] = true; libre -= costo[k]; }
    });
    pintarNoche();
    $("bDormir").textContent = "DORMIR ▶";
    $("bDormir").onclick = dormir;
    $("mNoche").hidden = false;
  }

  function pintarNoche() {
    const hayEnfermo = s.familia.some((f) => f.estado === "enfermo");
    const items = [
      { k: "alquiler", n: "Alquiler", c: M.COSTOS.alquiler },
      { k: "comida", n: "Comida (familia)", c: M.gastoComida(s) },
      { k: "calefaccion", n: "Calefacción", c: M.COSTOS.calefaccion },
      { k: "medicina", n: "Medicina" + (hayEnfermo ? " (¡hay enfermo!)" : ""), c: M.COSTOS.medicina },
    ];
    $("nocheCompra").innerHTML = items.map((it) =>
      `<button data-k="${it.k}" class="${compra[it.k] ? "on" : ""}"><span>${compra[it.k] ? "✔ " : "○ "}${it.n}</span><b>$ ${it.c}</b></button>`).join("");
    $("nocheCompra").querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => { const k = b.dataset.k; compra[k] = !compra[k]; pintarNoche(); }));
    const total = (compra.alquiler ? M.COSTOS.alquiler : 0) + (compra.comida ? M.gastoComida(s) : 0) + (compra.calefaccion ? M.COSTOS.calefaccion : 0) + (compra.medicina ? M.COSTOS.medicina : 0);
    const rest = s.dinero - total;
    const r = $("nocheRestante"); r.textContent = "Te quedarían: $ " + rest; r.className = "restante" + (rest < 0 ? " neg" : "");
    $("bDormir").disabled = rest < 0;
    $("nocheFamilia").innerHTML = s.familia.map(famCard).join("");
  }

  function famCard(f) {
    const et = { bien: "bien", hambriento: "con hambre", enfermo: "enfermo/a", muerto: "✝" }[f.estado];
    const em = f.estado === "muerto" ? "⚰️" : f.emoji;
    return `<div class="fam ${f.estado}"><span class="fe">${em}</span><small>${f.nombre}<br>${et}</small></div>`;
  }

  function dormir() {
    const res = M.aplicarNoche(s, compra);
    guardar();
    // fase resultado
    $("nocheT").textContent = "Amaneció…";
    $("nocheLedger").innerHTML = res.log.length ? res.log.map((l) => `<li><span>${l}</span></li>`).join("") : '<li><span>Noche tranquila.</span></li>';
    $("nocheLedger").innerHTML += `<li><span>Plata en mano</span><b>$ ${s.dinero}</b></li>`;
    $("nocheCompra").innerHTML = ""; $("nocheRestante").textContent = "";
    $("nocheFamilia").innerHTML = s.familia.map(famCard).join("");
    $("bDormir").textContent = s.terminado ? "VER FINAL ▶" : "EMPEZAR EL DÍA " + (s.dia + 1) + " ▶";
    $("bDormir").disabled = false;
    $("bDormir").onclick = () => {
      $("mNoche").hidden = true;
      if (s.terminado) return mostrarFinal();
      M.siguienteDia(s); guardar();
      if (s.terminado) return mostrarFinal();
      mostrarBoletin();
    };
  }

  // ---------- final ----------
  function mostrarFinal() {
    const f = M.FINALES[s.terminado] || M.FINALES.sobrevivir;
    $("finalT").textContent = f.t;
    $("finalD").textContent = f.d;
    $("finalStats").innerHTML =
      `<li><span>Días sobrevividos</span><b>${s.dia}</b></li>` +
      `<li><span>Aciertos / errores</span><b>${s.aciertos} / ${s.errores}</b></li>` +
      `<li><span>Buscados detenidos</span><b>${s.detenidos}</b></li>` +
      `<li><span>Coimas aceptadas</span><b>${s.corrupto}</b></li>` +
      `<li><span>Favores a la resistencia</span><b>${s.resistencia}</b></li>` +
      `<li><span>Plata final</span><b>$ ${s.dinero}</b></li>`;
    $("mFinal").hidden = false;
  }

  function reiniciar() {
    s = M.nuevo(); guardar();
    $("mFinal").hidden = true; $("mMenu").hidden = true;
    $("feedback").hidden = true;
    arrancar();
  }

  // ---------- botones ----------
  $("bAprobar").addEventListener("click", () => decidir("aprobar"));
  $("bDenegar").addEventListener("click", () => decidir("denegar"));
  $("bDetener").addEventListener("click", () => decidir("detener"));
  $("bSiguiente").addEventListener("click", siguiente);
  $("bAbrir").addEventListener("click", empezarDia);
  $("bReglamento").addEventListener("click", () => { if (def) { pintarReglamento(); $("mReglamento").hidden = false; } });
  $("bReglas2").addEventListener("click", () => { if (def) { pintarReglamento(); $("mReglamento").hidden = false; } else mostrarBoletin(); });
  $("bAyuda").addEventListener("click", () => $("mAyuda").hidden = false);
  $("bMenu").addEventListener("click", () => $("mMenu").hidden = false);
  $("bReiniciar").addEventListener("click", reiniciar);
  $("bReiniciar2").addEventListener("click", () => { if (confirm("¿Reiniciar la partida desde el día 1?")) reiniciar(); });
  document.querySelectorAll("[data-cerrar]").forEach((b) => b.addEventListener("click", () => b.closest(".modal").hidden = true));

  // primera vez: ayuda
  if (!localStorage.getItem(CLAVE + "_visto")) { try { localStorage.setItem(CLAVE + "_visto", "1"); } catch (e) {} setTimeout(() => $("mAyuda").hidden = false, 300); }
  arrancar();
})();
