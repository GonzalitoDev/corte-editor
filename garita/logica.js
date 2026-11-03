/* La Garita — lógica pura (sin DOM). Juego de inspección de documentos
   inspirado en el género de "puesto fronterizo". Ambientación 100% original e
   inventada (la República de Tramitania y sus vecinos no existen). No es ni
   reproduce ningún juego con dueño: es una obra propia con mecánica parecida.
   Se expone como globalThis.Garita para poder testear en node. */
(function (root) {
  "use strict";
  const G = {};
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const elegir = (a) => a[Math.floor(Math.random() * a.length)];
  const chance = (p) => Math.random() < p;
  G.elegir = elegir;

  // ---- fechas (calendario ficticio) ----
  // guardamos las fechas como número de día absoluto; el juego arranca en este "hoy".
  G.HOY0 = 29210; // ~ 1era jornada
  G.fecha = function (d) {
    // convierte día absoluto a DD.MM.AÑO ficticio
    const base = new Date(Date.UTC(1983, 0, 1));
    base.setUTCDate(base.getUTCDate() + (d - G.HOY0) + 300);
    const dd = ("0" + base.getUTCDate()).slice(-2);
    const mm = ("0" + (base.getUTCMonth() + 1)).slice(-2);
    return dd + "." + mm + "." + base.getUTCFullYear();
  };

  // ---- datos del mundo (inventado) ----
  G.PAIS = "Tramitania";
  G.VECINOS = ["Veralta", "Costa Rancia", "Montebajo", "Nortul", "Puerto Fango", "San Sudor"];
  G.CIUDADES = ["Bajo Centro", "Villa Sello", "Puerto Gris", "Altos del Trámite"];
  G.NOMBRES = ["Ivor", "Petra", "Dmitri", "Yelena", "Mikel", "Sara", "Tomas", "Olga", "Boris", "Nadia", "Viktor", "Lena", "Anka", "Pavel", "Mira", "Goran", "Dusan", "Vera", "Emil", "Roza"];
  G.APELLIDOS = ["Kovač", "Brest", "Volkov", "Sarno", "Dretz", "Marnik", "Pulst", "Vornak", "Lescu", "Grod", "Bantu", "Oszek", "Reval", "Tumen", "Yavic"];
  G.OFICIOS = ["albañil", "enfermera", "chofer", "cocinero", "mecánico", "docente", "costurera", "portero"];
  G.MOTIVOS = ["turismo", "trabajo", "tránsito", "mudanza", "visita"];

  function nombreRandom() { return elegir(G.NOMBRES) + " " + elegir(G.APELLIDOS); }
  function numeroRandom() { return "" + rnd(10000, 99999) + "-" + elegir(["A", "B", "C", "T", "K"]); }

  // ---- definición de los días (las reglas se van endureciendo) ----
  // cada regla es acumulativa: el objeto de cada día ya trae TODO lo vigente.
  G.DIAS = [
    {
      n: 1, titulo: "Reapertura del paso",
      boletin: ["Bienvenido al puesto fronterizo de Tramitania.", "HOY: solo pueden entrar CIUDADANOS de Tramitania.", "Exigí el pasaporte. A los extranjeros, rechazalos."],
      reglas: { permitirExtranjeros: false, requierePermiso: false },
      cupo: 8,
    },
    {
      n: 2, titulo: "Se abre a extranjeros",
      boletin: ["Ahora se admiten EXTRANJEROS.", "El extranjero necesita PASAPORTE + PERMISO DE INGRESO.", "El ciudadano, solo el pasaporte."],
      reglas: { permitirExtranjeros: true, requierePermiso: true },
      cupo: 9,
    },
    {
      n: 3, titulo: "Control de vencimientos",
      boletin: ["Rechazá todo documento VENCIDO.", "Mirá bien las fechas de vencimiento contra la fecha de hoy."],
      reglas: { permitirExtranjeros: true, requierePermiso: true, chequearVencimiento: true },
      cupo: 10,
    },
    {
      n: 4, titulo: "Identidades cruzadas",
      boletin: ["Los NOMBRES deben coincidir en todos los documentos.", "El SEXO del pasaporte debe coincidir con la persona.", "El que venga a TRABAJAR necesita PERMISO DE TRABAJO."],
      reglas: { permitirExtranjeros: true, requierePermiso: true, chequearVencimiento: true, chequearNombres: true, chequearSexo: true, requiereTrabajo: true },
      cupo: 10,
    },
    {
      n: 5, titulo: "Frontera cerrada a Puerto Fango",
      boletin: ["CONFLICTO con Puerto Fango.", "Entrada PROHIBIDA a ciudadanos de Puerto Fango.", "Siguen todas las reglas anteriores."],
      reglas: { permitirExtranjeros: true, requierePermiso: true, chequearVencimiento: true, chequearNombres: true, chequearSexo: true, requiereTrabajo: true, prohibidos: ["Puerto Fango"], resistencia: true },
      cupo: 11,
    },
    {
      n: 6, titulo: "Brote y buscados",
      boletin: ["Todos deben presentar CERTIFICADO DE VACUNACIÓN.", "El Ministerio difunde una lista de BUSCADOS: si aparece uno, DETENELO.", "Sigue prohibido Puerto Fango."],
      reglas: { permitirExtranjeros: true, requierePermiso: true, chequearVencimiento: true, chequearNombres: true, chequearSexo: true, requiereTrabajo: true, prohibidos: ["Puerto Fango"], requiereVacuna: true, buscados: true, resistencia: true },
      cupo: 12,
    },
  ];
  G.DIAS_TOTAL = G.DIAS.length;

  // ---- generación de un solicitante ----
  // Devuelve persona, documentos y diálogo. Puede tener 0..1 falla inyectada,
  // siempre del tipo que las reglas del día permiten detectar (juego justo).
  G.generarSolicitante = function (s, diaDef) {
    const r = diaDef.reglas;
    const hoy = G.HOY0 + (diaDef.n - 1);
    const ciudadano = r.permitirExtranjeros ? chance(0.4) : chance(0.72);
    const sexo = chance(0.5) ? "M" : "F";
    const pais = ciudadano ? G.PAIS : elegir(G.VECINOS);
    const nombre = nombreRandom();
    const numero = numeroRandom();
    const nac = hoy - rnd(7000, 20000);
    const motivo = ciudadano ? "regreso" : elegir(G.MOTIVOS);
    const oficio = elegir(G.OFICIOS);

    // documentos "verdaderos" (todos correctos)
    const docs = {};
    docs.pasaporte = { tipo: "Pasaporte", pais, nombre, numero, sexo, nacimiento: nac, vencimiento: hoy + rnd(200, 3000) };
    if (ciudadano) docs.cedula = { tipo: "Cédula tramitana", nombre, numero, ciudad: elegir(G.CIUDADES), nacimiento: nac };
    if (!ciudadano) docs.permiso = { tipo: "Permiso de ingreso", nombre, motivo, vencimiento: hoy + rnd(20, 900), sello: true };
    if (!ciudadano && motivo === "trabajo") docs.trabajo = { tipo: "Permiso de trabajo", nombre, oficio, vencimiento: hoy + rnd(100, 2000), sello: true };
    if (r.requiereVacuna) docs.vacuna = { tipo: "Certificado de vacunación", nombre, vencimiento: hoy + rnd(100, 1500) };

    const sol = {
      id: "s" + rnd(100000, 999999),
      persona: { nombre, sexo, pais, ciudadano, emoji: caraRandom(sexo) },
      docs, hoy, motivo,
      falla: null,
    };

    // ¿buscado? (día con lista de buscados)
    if (r.buscados && s.buscados && s.buscados.length && chance(0.14)) {
      sol.persona.nombre = elegir(s.buscados);
      docs.pasaporte.nombre = sol.persona.nombre;
      if (docs.cedula) docs.cedula.nombre = sol.persona.nombre;
      if (docs.permiso) docs.permiso.nombre = sol.persona.nombre;
      if (docs.trabajo) docs.trabajo.nombre = sol.persona.nombre;
      if (docs.vacuna) docs.vacuna.nombre = sol.persona.nombre;
      sol.falla = "buscado";
    } else if (chance(0.5)) {
      // inyectar una falla detectable hoy
      inyectarFalla(sol, r);
    }

    sol.guion = guionDe(sol, r);
    return sol;
  };

  function caraRandom(sexo) {
    const m = ["🧑", "👨", "🧔", "👨‍🦱", "👱‍♂️", "👨‍🦳"];
    const f = ["👩", "👧", "👩‍🦰", "👱‍♀️", "👩‍🦳", "🧕"];
    return elegir(sexo === "M" ? m : f);
  }

  function inyectarFalla(sol, r) {
    const d = sol.docs, p = sol.persona;
    const posibles = [];
    // falta un documento requerido
    posibles.push("faltaDoc");
    if (r.chequearVencimiento) posibles.push("vencido");
    if (r.chequearNombres) posibles.push("nombre");
    if (r.chequearSexo) posibles.push("sexo");
    if (r.prohibidos && r.prohibidos.length && !p.ciudadano) posibles.push("prohibido");
    if (!r.permitirExtranjeros) posibles.push("extranjero");
    if (r.requiereTrabajo && !p.ciudadano) posibles.push("trabajaSinPermiso");
    const f = elegir(posibles);
    sol.falla = f;
    if (f === "faltaDoc") {
      // sacar un documento requerido (según rol)
      if (!p.ciudadano && d.permiso && r.requierePermiso) delete d.permiso;
      else if (r.requiereVacuna && d.vacuna) delete d.vacuna;
      else delete d.pasaporte;
    } else if (f === "vencido") {
      const cand = [d.pasaporte, d.permiso, d.trabajo, d.vacuna].filter(Boolean);
      elegir(cand).vencimiento = sol.hoy - rnd(10, 400);
    } else if (f === "nombre") {
      const sec = [d.cedula, d.permiso, d.trabajo, d.vacuna].filter(Boolean);
      if (sec.length) {
        const doc = elegir(sec); let nn;
        do { nn = nombreRandom(); } while (nn === doc.nombre);
        doc.nombre = nn;
      } else { sol.falla = null; } // no había doc secundario, no hay falla
    } else if (f === "sexo") {
      d.pasaporte.sexo = p.sexo === "M" ? "F" : "M";
    } else if (f === "prohibido") {
      p.pais = elegir(r.prohibidos); d.pasaporte.pais = p.pais;
    } else if (f === "extranjero") {
      // forzar extranjero en día de solo-ciudadanos
      if (p.ciudadano) {
        p.ciudadano = false; p.pais = elegir(G.VECINOS); d.pasaporte.pais = p.pais;
        delete d.cedula;
      }
    } else if (f === "trabajaSinPermiso") {
      if (!p.ciudadano) {
        sol.motivo = "trabajo";
        if (d.permiso) d.permiso.motivo = "trabajo";
        delete d.trabajo;
      } else sol.falla = null;
    }
  }

  function guionDe(sol, r) {
    const p = sol.persona;
    const saludos = ["Buenos días.", "Hola, jefe.", "Vengo a cruzar.", "Qué frío, ¿no?", "Acá están mis papeles."];
    const l = [elegir(saludos)];
    if (sol.falla === "buscado") l.push(elegir(["Todo en orden, ¿puedo pasar?", "No hay apuro… ¿me deja pasar?"]));
    else if (p.ciudadano) l.push(elegir(["Vuelvo a casa.", "Soy de acá, de " + G.PAIS + ".", "Extrañaba Tramitania."]));
    else l.push(elegir(["Vengo por " + (sol.motivo || "turismo") + ".", "Es mi primera vez acá.", "Solo unos días."]));
    if (sol.falla && sol.falla !== "buscado" && chance(0.35)) l.push(elegir(["Está todo bien, ¿no?", "Apúrese que hace frío.", "Confíe en mí."]));
    return l;
  }

  // ---- evaluación: la LEY. Recalcula todo desde los documentos presentados. ----
  G.evaluar = function (sol, reglas) {
    const d = sol.docs, p = sol.persona, hoy = sol.hoy, motivos = [];
    const pas = d.pasaporte;
    const esCiudadano = pas ? pas.pais === G.PAIS : false;

    if (!pas) motivos.push("Falta el pasaporte.");
    if (!reglas.permitirExtranjeros && pas && !esCiudadano) motivos.push("Hoy no entran extranjeros.");
    if (reglas.permitirExtranjeros && reglas.requierePermiso && pas && !esCiudadano && !d.permiso)
      motivos.push("Falta el permiso de ingreso.");
    // trabajo
    const motivoViaje = d.permiso ? d.permiso.motivo : sol.motivo;
    if (reglas.requiereTrabajo && pas && !esCiudadano && motivoViaje === "trabajo" && !d.trabajo)
      motivos.push("Viene a trabajar sin permiso de trabajo.");
    // vacuna
    if (reglas.requiereVacuna && !d.vacuna) motivos.push("Falta el certificado de vacunación.");
    // vencimientos
    if (reglas.chequearVencimiento) {
      for (const k in d) if (d[k].vencimiento && d[k].vencimiento < hoy) motivos.push("Documento vencido: " + d[k].tipo + ".");
    }
    // nombres coinciden
    if (reglas.chequearNombres) {
      const noms = Object.keys(d).map((k) => d[k].nombre).filter(Boolean);
      if (noms.some((n) => n !== noms[0])) motivos.push("Los nombres no coinciden entre documentos.");
    }
    // sexo
    if (reglas.chequearSexo && pas && pas.sexo !== p.sexo) motivos.push("El sexo del pasaporte no coincide con la persona.");
    // país prohibido
    if (reglas.prohibidos && pas && reglas.prohibidos.indexOf(pas.pais) >= 0) motivos.push("País con entrada prohibida: " + pas.pais + ".");

    const buscado = !!(reglas.buscados && sol.persona.nombre && (G._buscadosActivos || []).indexOf(sol.persona.nombre) >= 0);
    const valido = motivos.length === 0;
    return {
      motivos,
      buscado,
      valido,
      correcta: buscado ? "detener" : valido ? "aprobar" : "denegar",
    };
  };

  // ---- estado del jugador ----
  G.nuevo = function () {
    return {
      v: 1,
      dia: 1,
      dinero: 0,
      aciertos: 0,
      errores: 0,
      atendidos: 0,
      detenidos: 0,
      resistencia: 0,       // simpatía con "los del sótano"
      corrupto: 0,          // coimas aceptadas
      familia: [
        { nombre: "tu madre", emoji: "👵", estado: "bien", enfermoNoches: 0 },
        { nombre: "tu hijo", emoji: "🧒", estado: "bien", enfermoNoches: 0 },
        { nombre: "tu tío", emoji: "👨‍🦳", estado: "bien", enfermoNoches: 0 },
      ],
      muertos: 0,
      deudaAlquiler: 0,
      hist: [],
      terminado: null,
      guardado: Date.now(),
    };
  };

  // lista de buscados (se arma al llegar al día 6)
  G.armarBuscados = function (s) {
    s.buscados = [nombreRandom(), nombreRandom(), nombreRandom()];
    G._buscadosActivos = s.buscados;
    return s.buscados;
  };

  G.diaDef = function (dia) { return G.DIAS[Math.min(dia, G.DIAS_TOTAL) - 1]; };

  // preparar la jornada: genera la cola de solicitantes
  G.iniciarDia = function (s) {
    const def = G.diaDef(s.dia);
    if (def.reglas.buscados) { if (!s.buscados) G.armarBuscados(s); else G._buscadosActivos = s.buscados; }
    else G._buscadosActivos = [];
    const cola = [];
    for (let i = 0; i < def.cupo; i++) cola.push(G.generarSolicitante(s, def));
    // inyectar un buscado garantizado en la cola del día de buscados
    if (def.reglas.buscados && !cola.some((c) => c.falla === "buscado")) {
      const victima = cola[rnd(2, cola.length - 1)];
      victima.persona.nombre = elegir(s.buscados);
      for (const k in victima.docs) if (victima.docs[k].nombre) victima.docs[k].nombre = victima.persona.nombre;
      victima.falla = "buscado";
    }
    // marcar coimas y favores a la resistencia entre los inválidos
    cola.forEach((sol) => {
      const ev = G.evaluar(sol, def.reglas);
      if (!ev.valido && !ev.buscado) {
        if (def.reglas.resistencia && chance(0.28)) { sol.resistencia = true; sol.guion.push("(te susurra) Soy de los del sótano… dejame pasar."); }
        else if (def.n >= 2 && chance(0.2)) { sol.coima = true; sol.guion.push("(bajando la voz) Tengo unos billetes para usted si me deja pasar…"); }
      }
    });
    s.avisosHoy = 0; s.correctosHoy = 0; s.erroresHoy = 0; s.ganadoHoy = 0;
    return { def, cola };
  };

  G.PAGO = 5;      // por persona atendida (bien)
  G.MULTA = 5;     // por error (después del primer aviso del día)

  G.COIMA = 15;
  // resolver una decisión del jugador
  G.resolver = function (s, sol, accion) {
    const def = G.diaDef(s.dia);
    const ev = G.evaluar(sol, def.reglas);
    s.atendidos++;
    if (accion === "detener") s.detenidos++;

    // aprobar a un inválido marcado: coima o favor a la resistencia (no es "error")
    if (accion === "aprobar" && !ev.valido && !ev.buscado) {
      if (sol.coima) {
        s.corrupto++; s.dinero += G.COIMA; s.ganadoHoy += G.COIMA + G.PAGO; s.dinero += G.PAGO;
        return { correcto: true, especial: "coima", correcta: ev.correcta, motivos: ev.motivos, aviso: false, multa: 0, pago: G.COIMA + G.PAGO };
      }
      if (sol.resistencia) {
        s.resistencia++; s.ganadoHoy += G.PAGO; s.dinero += G.PAGO;
        return { correcto: true, especial: "resistencia", correcta: ev.correcta, motivos: ev.motivos, aviso: false, multa: 0, pago: G.PAGO };
      }
    }

    const correcto = accion === ev.correcta;
    let multa = 0, aviso = false;
    if (correcto) { s.aciertos++; s.correctosHoy++; }
    else {
      s.errores++; s.erroresHoy++;
      if (s.avisosHoy === 0) { aviso = true; s.avisosHoy++; }
      else { multa = G.MULTA; }
    }
    const pago = G.PAGO - multa;
    s.ganadoHoy += pago; s.dinero += pago;
    return { correcto, correcta: ev.correcta, motivos: ev.motivos, buscado: ev.buscado, aviso, multa, pago };
  };

  // ---- noche: gastos y familia ----
  G.COSTOS = { alquiler: 14, comida: 4, calefaccion: 8, medicina: 11 };
  G.gastoComida = (s) => G.COSTOS.comida * s.familia.filter((f) => f.estado !== "muerto").length;

  G.aplicarNoche = function (s, compra) {
    // compra: {alquiler, comida, calefaccion, medicina} booleans (lo que el jugador decide pagar)
    const log = [];
    let gasto = 0;
    if (compra.alquiler) { gasto += G.COSTOS.alquiler; log.push("Pagaste el alquiler."); s.deudaAlquiler = 0; }
    else { s.deudaAlquiler++; log.push("No pagaste el alquiler (" + s.deudaAlquiler + " noche/s debiendo)."); }
    if (compra.comida) { gasto += G.gastoComida(s); }
    if (compra.calefaccion) { gasto += G.COSTOS.calefaccion; }
    if (compra.medicina) { gasto += G.COSTOS.medicina; }
    s.dinero -= gasto;

    // efectos sobre la familia
    s.familia.forEach((f) => {
      if (f.estado === "muerto") return;
      // enfermo: necesita medicina o empeora
      if (f.estado === "enfermo") {
        if (compra.medicina) { f.estado = "bien"; f.enfermoNoches = 0; log.push(f.nombre + " se recuperó con la medicina."); }
        else { f.enfermoNoches++; if (f.enfermoNoches >= 2) { f.estado = "muerto"; s.muertos++; log.push("💀 " + f.nombre + " no aguantó la enfermedad."); } else log.push("⚠️ " + f.nombre + " sigue enfermo/a."); }
        return;
      }
      // sin comida: hambre; con hambre + sin comida: enferma
      if (!compra.comida) {
        if (f.estado === "bien") { f.estado = "hambriento"; log.push(f.nombre + " pasa hambre."); }
        else if (f.estado === "hambriento") { f.estado = "enfermo"; log.push("⚠️ " + f.nombre + " se enfermó de debilidad."); }
      } else if (f.estado === "hambriento") { f.estado = "bien"; }
      // sin calefacción: en invierno empeora un escalón al azar
      if (!compra.calefaccion && f.estado === "bien" && chance(0.5)) { f.estado = "hambriento"; log.push(f.nombre + " se enfermará si sigue el frío."); }
    });

    // desalojo: 3 noches sin pagar alquiler = fin
    if (s.deudaAlquiler >= 3) { s.terminado = "desalojo"; }
    if (s.familia.every((f) => f.estado === "muerto")) { s.terminado = "familia"; }
    return { log, gasto };
  };

  // avanzar de día (o terminar)
  G.siguienteDia = function (s) {
    if (s.terminado) return;
    if (s.dia >= G.DIAS_TOTAL) { s.terminado = G.finalBueno(s); return; }
    s.dia++;
    s.guardado = Date.now();
  };

  G.finalBueno = function (s) {
    if (s.corrupto >= 4) return "corrupto";
    if (s.resistencia >= 3) return "resistencia";
    if (s.muertos > 0) return "agridulce";
    if (s.dinero >= 120) return "ascenso";
    return "sobrevivir";
  };

  G.FINALES = {
    desalojo: { t: "TE DESALOJARON", d: "No pudiste pagar el alquiler. Te sacaron a la calle con lo puesto. La garita ya tiene otro inspector." },
    familia: { t: "SOLO", d: "Tu familia no sobrevivió al invierno. Seguís sellando papeles, pero ya nada tiene sentido." },
    corrupto: { t: "INSPECTOR CORRUPTO", d: "Tantas coimas no pasaron desapercibidas. Asuntos Internos te espera en una sala sin ventanas." },
    resistencia: { t: "LOS DEL SÓTANO", d: "Ayudaste a la resistencia una vez de más. Esta noche cruzás la frontera del otro lado… como prófugo o como héroe, el tiempo dirá." },
    ascenso: { t: "ASCENSO", d: "Cumpliste a rajatabla y juntaste plata. El Ministerio te asciende a Supervisor. Más sellos, más poder, el mismo frío." },
    agridulce: { t: "SOBREVIVISTE (a medias)", d: "Llegaste al final, pero la silla vacía en la mesa pesa. Tramitania sigue, indiferente." },
    sobrevivir: { t: "UN INVIERNO MÁS", d: "Ni rico ni preso: sobreviviste la semana con la familia entera. En Tramitania, eso ya es una victoria." },
  };

  // ---- guardado ----
  G.serializar = function (s) { s.guardado = Date.now(); const c = Object.assign({}, s); delete c.buscados2; return JSON.stringify(s); };
  G.cargar = function (txt) {
    try {
      const o = JSON.parse(txt); if (!o || o.v !== 1) return null;
      const s = Object.assign(G.nuevo(), o);
      if (!s.familia) s.familia = G.nuevo().familia;
      if (s.buscados) G._buscadosActivos = s.buscados;
      return s;
    } catch (e) { return null; }
  };

  root.Garita = G;
  if (typeof module !== "undefined" && module.exports) module.exports = G;
})(typeof globalThis !== "undefined" ? globalThis : this);
