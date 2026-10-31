/* CTF del Taller — tablero, laboratorios, envío de flags y ranking.
   Las flags se verifican en el servidor (funciones ctf_* en Supabase). */
(() => {
  const { $, esc, el, toast } = window.T;
  const URL_SB = "https://xfwolaurpeofysnymqle.supabase.co";
  const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhmd29sYXVycGVvZnlzbnltcWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMjI3MjMsImV4cCI6MjEwMDU5ODcyM30.V9-9_q_sbUEWN91NOoEnDd1sjuhVpBUpmqPo36bboIY";
  const LAB = URL_SB + "/functions/v1/ctf-lab";
  const RETOS = window.RETOS, CATS = window.CATS;
  const ORDEN = ["web", "cripto", "forense", "reversing"];

  const vista = $("#vista");
  let token = localStorage.getItem("ctf.token") || "";
  let yo = null;                 // {apodo, puntos, resueltos:[]}
  let retosInfo = {};            // id -> {resueltos, primera}

  // llama una función ctf_* por la API REST de Supabase (PostgREST rpc)
  const rpc = async (fn, args) => {
    const r = await fetch(`${URL_SB}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: "Bearer " + ANON, "Content-Type": "application/json" },
      body: JSON.stringify(args || {}),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  };
  const avisar = (msg, mal) => { const a = $("#aviso"); a.textContent = msg; a.className = "aviso" + (mal ? " mal" : ""); a.hidden = false; clearTimeout(a._t); a._t = setTimeout(() => a.hidden = true, 3500); };
  const resuelto = id => yo && yo.resueltos && yo.resueltos.includes(id);

  // ---------------- sesión ----------------
  async function refrescarYo() {
    if (!token) { yo = null; return; }
    try { const r = await rpc("ctf_yo", { p_token: token }); yo = r && r.ok ? r : null; if (!yo) { token = ""; localStorage.removeItem("ctf.token"); } }
    catch { yo = null; }
  }
  function pintarSesion() {
    const s = $("#sesion");
    if (yo) { s.hidden = false; $("#miApodo").textContent = yo.apodo; $("#misPuntos").textContent = (yo.puntos || 0) + " pts"; }
    else s.hidden = true;
  }

  async function entrar(apodo) {
    try {
      const r = await rpc("ctf_registrar", { p_apodo: apodo });
      if (!r.ok) return avisar(r.error, true);
      token = r.token; localStorage.setItem("ctf.token", token); localStorage.setItem("ctf.apodo", r.apodo);
      await refrescarYo(); pintarSesion(); tablero();
      toast("¡Adentro! Suerte, " + r.apodo + ".");
    } catch (e) { avisar("No se pudo entrar: " + (e.message || e), true); }
  }
  function salir() { token = ""; yo = null; localStorage.removeItem("ctf.token"); pintarSesion(); pantallaEntrar(); }

  // ---------------- pantallas ----------------
  function pantallaEntrar() {
    const apodoPrev = localStorage.getItem("ctf.apodo") || "";
    vista.innerHTML = `
      <div class="entrar"><div class="caja">
        <h1>Capturá las <em>flags</em></h1>
        <p class="sub">Laboratorios reales de seguridad: rompés el sistema, encontrás una flag con forma <code>GONZA{…}</code> y la entregás para sumar puntos. Hay web, criptografía, forense y reversing.</p>
        <form id="fEntrar">
          <input id="iApodo" maxlength="20" placeholder="tu apodo" value="${esc(apodoPrev)}" autocomplete="off" spellcheck="false" aria-label="Apodo">
          <button class="btn primary" type="submit">Entrar</button>
        </form>
        <div class="cats-mini">${ORDEN.map(c => `<span class="cat-mini"><svg class="i" viewBox="0 0 24 24" style="stroke:${CATS[c].color}"><path d="${CATS[c].icono}"/></svg>${CATS[c].nombre}</span>`).join("")}</div>
        <p class="nota-ética">Los laboratorios son entornos de práctica aislados, hechos vulnerables a propósito para aprender a defenderte. Lo que aprendas acá usalo sólo en sistemas propios o con permiso.</p>
      </div></div>`;
    $("#fEntrar").addEventListener("submit", e => { e.preventDefault(); const v = $("#iApodo").value.trim(); if (v) entrar(v); });
  }

  async function tablero() {
    vista.innerHTML = `<div class="tablero"><p class="barra-top">Cargando retos…</p></div>`;
    try {
      const lista = await rpc("ctf_retos");
      retosInfo = {}; lista.forEach(r => retosInfo[r.id] = r);
    } catch (e) { vista.innerHTML = `<div class="tablero"><p class="barra-top">No se pudieron cargar los retos. Recargá la página.</p></div>`; return; }
    const total = RETOS.reduce((a, r) => a + r.puntos, 0);
    const hechos = yo ? (yo.resueltos || []) : [];
    const ganados = RETOS.filter(r => hechos.includes(r.id)).reduce((a, r) => a + r.puntos, 0);
    let html = `<div class="tablero">
      <div class="barra-top">
        <span><b>${hechos.length}</b>/${RETOS.length} retos · <b>${ganados}</b>/${total} pts</span>
        <span class="prog"><i style="width:${total ? ganados / total * 100 : 0}%"></i></span>
      </div>`;
    for (const cat of ORDEN) {
      const rs = RETOS.filter(r => r.cat === cat);
      if (!rs.length) continue;
      const C = CATS[cat];
      html += `<div class="grupo" style="--c:${C.color}"><h2><span class="pico"></span>${C.nombre} <small>${rs.length} retos</small></h2><div class="retos">`;
      for (const r of rs) {
        const info = retosInfo[r.id] || {};
        html += `<button class="reto ${resuelto(r.id) ? "resuelto" : ""}" style="--c:${C.color}" data-reto="${r.id}">
          <div class="cab"><h3>${esc(r.nombre)}</h3><span class="pz">${r.puntos}</span></div>
          <div class="dsc">${r.desc.replace(/<[^>]+>/g, "")}</div>
          <div class="pie">
            <span class="dif" title="dificultad">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= r.dif ? "on" : ""}"></i>`).join("")}</span>
            <span>${info.resueltos || 0} ${info.resueltos === 1 ? "resuelto" : "resueltos"}</span>
            <span class="tick">✓ resuelto</span>
          </div></button>`;
      }
      html += `</div></div>`;
    }
    html += `</div>`;
    vista.innerHTML = html;
    vista.querySelectorAll("[data-reto]").forEach(b => b.addEventListener("click", () => abrirReto(b.dataset.reto)));
  }

  // ---------------- modal de reto ----------------
  function abrirReto(id) {
    const r = RETOS.find(x => x.id === id); if (!r) return;
    const C = CATS[r.cat];
    const info = retosInfo[id] || {};
    const ya = resuelto(id);
    const dler = [];
    if (r.archivo) dler.push(`<a class="btn" href="retos/${r.archivo}" download>⬇ ${r.exe ? "Descargar binario" : "Descargar archivo"}</a>`);
    if (r.extra) dler.push(`<a class="btn" href="retos/${r.extra}" target="_blank">📄 Instrucciones</a>`);

    const cont = el(`<div class="modal" id="mReto"><div class="sheet ventana" style="--c:${C.color}">
      <div class="rhead">
        <span class="cat-tag"><svg class="i" viewBox="0 0 24 24" style="stroke:${C.color};width:15px;height:15px"><path d="${C.icono}"/></svg>${C.nombre}</span>
        <span class="pzb">${r.puntos} pts</span>
      </div>
      <h3 style="margin-top:6px">${esc(r.nombre)} ${ya ? '<span style="color:var(--accent)">✓</span>' : ""}</h3>
      <p class="cuerpo">${r.desc}</p>
      ${dler.length ? `<div class="descargas">${dler.join("")}</div>` : ""}
      <div id="labSlot"></div>
      <details class="pista"><summary>Ver pista</summary><div>${r.pista}</div></details>
      ${ya ? `<p class="resultado ok">Ya resolviste este reto. 🎉</p>`
           : `<form class="flagform" id="fFlag"><input id="iFlag" placeholder="GONZA{...}" autocomplete="off" spellcheck="false"><button class="btn primary" type="submit">Enviar</button></form>
              <p class="resultado" id="rFlag"></p>`}
      <div class="row-btns" style="justify-content:flex-end;margin-top:4px"><button class="btn" data-cerrar>Cerrar</button></div>
    </div></div>`);
    document.body.appendChild(cont);
    const cerrar = () => cont.remove();
    cont.addEventListener("click", e => { if (e.target === cont || e.target.closest("[data-cerrar]")) cerrar(); });
    if (r.lab) montarLab(r.lab, cont.querySelector("#labSlot"));
    const f = cont.querySelector("#fFlag");
    if (f) f.addEventListener("submit", async e => {
      e.preventDefault();
      const val = cont.querySelector("#iFlag").value.trim(); if (!val) return;
      await enviarFlag(r, val, cont);
    });
  }

  async function enviarFlag(r, flag, cont) {
    const out = cont.querySelector("#rFlag"), inp = cont.querySelector("#iFlag");
    try {
      const res = await rpc("ctf_enviar", { p_token: token, p_reto: r.id, p_flag: flag });
      if (!res.ok) { out.className = "resultado mal"; out.textContent = res.error; return; }
      if (res.ya) { out.className = "resultado ok"; out.textContent = "Ya lo tenías resuelto."; return; }
      if (res.correcta) {
        inp.className = "ok";
        out.className = "resultado ok";
        out.textContent = (res.primera ? "¡Primera sangre! 🩸 " : "¡Correcta! ") + "+" + res.puntos + " pts";
        if (!yo.resueltos) yo.resueltos = [];
        yo.resueltos.push(r.id); yo.puntos = (yo.puntos || 0) + res.puntos;
        pintarSesion();
        avisar("✓ " + r.nombre + " — +" + res.puntos + " pts");
        setTimeout(() => { cont.remove(); tablero(); }, 1200);
      } else { inp.className = "mal"; out.className = "resultado mal"; out.textContent = "No es la flag. Seguí intentando."; }
    } catch (e) { out.className = "resultado mal"; out.textContent = "Error al enviar: " + (e.message || e); }
  }

  // ---------------- consolas de laboratorio ----------------
  async function pedirLab(params, opt) {
    const u = new window.URL(LAB);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    const r = await fetch(u, Object.assign({ headers: { apikey: ANON } }, opt || {}));
    return r.json();
  }
  const pinta = (o) => {
    let s = JSON.stringify(o, null, 2);
    s = esc(s).replace(/"(GONZA\{[^"]*\})"/g, '"<span class="flag">$1</span>"');
    return s;
  };

  function montarLab(tipo, slot) {
    if (tipo === "login") {
      slot.appendChild(el(`<div class="lab"><div class="lh"><span class="pelota"></span><span class="pelota y"></span><span class="pelota g"></span>login.php — Panel de acceso</div>
        <div class="lb">
          <div class="fila"><label>Usuario<input id="lu" placeholder="usuario"></label><label>Clave<input id="lc" placeholder="clave"></label><button class="btn primary" id="lb">Entrar</button></div>
          <pre class="salida" id="lo">La consulta se arma pegando tus datos. Probá entrar como admin…</pre>
        </div></div>`));
      slot.querySelector("#lb").addEventListener("click", async () => {
        const o = slot.querySelector("#lo"); o.textContent = "…";
        try { o.innerHTML = pinta(await pedirLab({ lab: "login", usuario: slot.querySelector("#lu").value, clave: slot.querySelector("#lc").value })); }
        catch (e) { o.textContent = "Error: " + e; }
      });
    }
    else if (tipo === "factura") {
      slot.appendChild(el(`<div class="lab"><div class="lh"><span class="pelota"></span><span class="pelota y"></span><span class="pelota g"></span>GET /factura?id=</div>
        <div class="lb">
          <div class="fila"><label>Número de factura<input id="lid" value="1" inputmode="numeric"></label><button class="btn primary" id="lb">Ver factura</button></div>
          <pre class="salida" id="lo">Tus facturas son la 1 y la 2.</pre>
        </div></div>`));
      slot.querySelector("#lb").addEventListener("click", async () => {
        const o = slot.querySelector("#lo"); o.textContent = "…";
        try { o.innerHTML = pinta(await pedirLab({ lab: "factura", id: slot.querySelector("#lid").value })); }
        catch (e) { o.textContent = "Error: " + e; }
      });
    }
    else if (tipo === "token") {
      slot.appendChild(el(`<div class="lab"><div class="lh"><span class="pelota"></span><span class="pelota y"></span><span class="pelota g"></span>Panel admin — autenticación por JWT</div>
        <div class="lb">
          <button class="btn" id="lget">1 · Pedir token de invitado</button>
          <label>2 · Token (pegá acá el que forjaste como admin)<textarea id="ltok" placeholder="eyJ..."></textarea></label>
          <button class="btn primary" id="lb">3 · Entrar al panel</button>
          <pre class="salida" id="lo">Conseguí el token de invitado, descubrí el secreto y cambiá el rol a admin.</pre>
        </div></div>`));
      slot.querySelector("#lget").addEventListener("click", async () => {
        const o = slot.querySelector("#lo"); o.textContent = "…";
        try { const r = await pedirLab({ lab: "token" }); slot.querySelector("#ltok").value = r.token; o.innerHTML = pinta(r); }
        catch (e) { o.textContent = "Error: " + e; }
      });
      slot.querySelector("#lb").addEventListener("click", async () => {
        const o = slot.querySelector("#lo"); o.textContent = "…";
        try { o.innerHTML = pinta(await pedirLab({ lab: "panel", token: slot.querySelector("#ltok").value.trim() })); }
        catch (e) { o.textContent = "Error: " + e; }
      });
    }
    else if (tipo === "archivo") {
      slot.appendChild(el(`<div class="lab"><div class="lh"><span class="pelota"></span><span class="pelota y"></span><span class="pelota g"></span>GET /ver?f=</div>
        <div class="lb">
          <div class="fila"><label>Archivo<input id="lf" value="notas.txt"></label><button class="btn primary" id="lb">Pedir archivo</button></div>
          <pre class="salida" id="lo">Arrancás en /var/www/publico/. Probá salir de ahí.</pre>
        </div></div>`));
      slot.querySelector("#lb").addEventListener("click", async () => {
        const o = slot.querySelector("#lo"); o.textContent = "…";
        try { o.innerHTML = pinta(await pedirLab({ lab: "archivo", f: slot.querySelector("#lf").value })); }
        catch (e) { o.textContent = "Error: " + e; }
      });
    }
  }

  // ---------------- ranking ----------------
  async function verRanking() {
    vista.innerHTML = `<div class="rank"><h1>Cargando…</h1></div>`;
    let filas = [];
    try { filas = await rpc("ctf_ranking"); } catch { }
    const medalla = i => ["🥇", "🥈", "🥉"][i] || "";
    let html = `<div class="rank">
      <h1><svg class="i" viewBox="0 0 24 24" style="width:22px;height:22px;stroke:var(--accent)"><path d="M4 20h16M8 20V9M16 20V5M12 20v-7"/></svg>Ranking</h1>`;
    if (!filas.length) html += `<p class="vacio">Todavía nadie resolvió nada. ¡Sé el primero!</p>`;
    else {
      html += `<table><thead><tr><th>#</th><th>Jugador</th><th>Retos</th><th style="text-align:right">Puntos</th></tr></thead><tbody>`;
      filas.forEach((f, i) => {
        const esYo = yo && f.apodo === yo.apodo;
        html += `<tr class="${esYo ? "yo" : ""}"><td class="n">${medalla(i) ? `<span class="medalla">${medalla(i)}</span>` : (i + 1)}</td><td>${esc(f.apodo)}</td><td>${f.resueltos}</td><td class="p">${f.puntos}</td></tr>`;
      });
      html += `</tbody></table>`;
    }
    html += `<div class="row-btns" style="margin-top:16px"><button class="btn" data-cmd="volver">← Volver a los retos</button></div></div>`;
    vista.innerHTML = html;
  }

  // ---------------- arranque ----------------
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-cmd]"); if (!b) return;
    const c = b.dataset.cmd;
    if (c === "ranking") verRanking();
    if (c === "volver") tablero();
    if (c === "salir") salir();
  });

  (async () => {
    await refrescarYo(); pintarSesion();
    if (yo) tablero(); else pantallaEntrar();
  })();
})();
