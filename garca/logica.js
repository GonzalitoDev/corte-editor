/* El Garca — lógica pura (sin DOM). Todo es ficticio: personajes, marcas y
   situaciones son inventados y de parodia. No sirve para estafar a nadie real.
   Se expone como globalThis.Garca para poder testear en node. */
(function (root) {
  "use strict";
  const G = {};

  // ---- utilidades ----
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const elegir = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const round = Math.round;
  G.clamp = clamp;

  // ---- plata (todo en "$" trucho) ----
  G.money = function (n) {
    n = Math.floor(n);
    if (n < 1e4) return "$ " + n.toLocaleString("es-AR");
    if (n < 1e6) return "$ " + (n / 1e3).toFixed(n < 1e5 ? 1 : 0) + " mil";
    if (n < 1e9) return "$ " + (n / 1e6).toFixed(2) + " M";
    if (n < 1e12) return "$ " + (n / 1e9).toFixed(2) + " mil M";
    return "$ " + (n / 1e12).toFixed(2) + " billones";
  };

  // ---- rangos (por plata total robada) ----
  G.RANGOS = [
    { n: "Ratero de barrio", min: 0 },
    { n: "Cuentero", min: 8000 },
    { n: "Vivo profesional", min: 45000 },
    { n: "Estafador serial", min: 220000 },
    { n: "Gerente de la cueva", min: 1.1e6 },
    { n: "Gurú del coaching financiero", min: 6e6 },
    { n: "Capo de la estafa", min: 30e6 },
    { n: "Prócer del verso", min: 150e6 },
  ];
  G.rangoDe = function (total) {
    let i = 0;
    for (let k = 0; k < G.RANGOS.length; k++) if (total >= G.RANGOS[k].min) i = k;
    return i;
  };

  // ---- arquetipos de marca (víctimas ficticias) ----
  // debil: versos a los que este tipo es más vulnerable (bonus de éxito).
  G.TIPOS = [
    {
      id: "jubilado", emoji: "👴", etiqueta: "jubilado",
      nombres: ["Don Ernesto", "Doña Chela", "Don Rubén", "Doña Pochi", "Don Aníbal", "Doña Beba"],
      ingenuidad: [55, 85], plata: [40000, 120000], debil: ["tio", "soporte", "premio"],
      bio: ["anda medio perdido con el celular nuevo", "contesta todos los llamados", "cobró el aguinaldo"],
    },
    {
      id: "cripto", emoji: "🧑‍💻", etiqueta: "pibe cripto",
      nombres: ["Brian", "Thiago", "Kevin", "Agus", "Lauti", "Dylan"],
      ingenuidad: [35, 65], plata: [15000, 90000], debil: ["cripto", "inversion"],
      bio: ["quiere hacerse rico ya", "mira videos de 'libertad financiera'", "tiene la billetera llena de shitcoins"],
    },
    {
      id: "face", emoji: "👩", etiqueta: "señora de Facebook",
      nombres: ["Gladys", "Marta", "Susana", "Norma", "Mirta", "Estela"],
      ingenuidad: [50, 80], plata: [20000, 70000], debil: ["premio", "rifa", "soporte"],
      bio: ["comparte todo lo que le llega", "ganó tres veces un iPhone (dice)", "le encantan los sorteos"],
    },
    {
      id: "pyme", emoji: "🧔", etiqueta: "dueño de PyME",
      nombres: ["Rolando", "El Turco", "Jorge", "Walter", "Rubén de la ferretería", "Osvaldo"],
      ingenuidad: [20, 45], plata: [150000, 600000], debil: ["factura", "proveedor"],
      bio: ["está tapado de laburo", "no revisa las facturas", "paga para no tener quilombos"],
    },
    {
      id: "influ", emoji: "💅", etiqueta: "influencer",
      nombres: ["Brenda", "Morena", "Jazmín", "Candela", "Melody", "Ruth"],
      ingenuidad: [40, 70], plata: [30000, 160000], debil: ["canje", "inversion"],
      bio: ["quiere más seguidores", "acepta cualquier canje", "sueña con la fama"],
    },
    {
      id: "market", emoji: "🛒", etiqueta: "comprador de Marketplace",
      nombres: ["Fede", "Caro", "Nico", "Vanesa", "Lucho", "Pri"],
      ingenuidad: [35, 65], plata: [12000, 60000], debil: ["venta", "envio"],
      bio: ["busca el celu más barato", "paga por transferencia sin pensar", "cae en cualquier oferta"],
    },
  ];

  // ---- versos / jugadas (cartas de estafa, todo parodia) ----
  // guion: arreglo de "beats". Cada beat tiene mensajes del NPC y opciones tuyas.
  // Cada opción: t (texto), c (confianza ±), s (sospecha ±). El último paso es el cobro.
  G.VERSOS = [
    {
      id: "tio", n: "El cuento del tío", emoji: "📞", min: 0, riesgo: 6, piso: 30, mult: 1,
      desc: "El clásico. Te hacés pasar por un familiar en apuros que necesita plata YA.",
      guion: [
        {
          npc: ["¿Hola? ¿Quién es?"],
          ops: [
            { t: "¡Tío, soy yo! ¿No me reconocés la voz?", c: 14, s: 4 },
            { t: "Hola, le hablo del Banco Nación por un problema.", c: 6, s: 10 },
            { t: "Soy tu sobrino. Me cambié el número.", c: 10, s: 6 },
          ],
        },
        {
          npc: ["Ah… ¿sos vos? Te noto raro…", "¿Pasó algo?"],
          ops: [
            { t: "Tuve un accidente y necesito plata para la grúa, no le digas a nadie.", c: 16, s: 8 },
            { t: "Sí, estoy bien, pero necesito un favor urgente.", c: 8, s: 4 },
            { t: "Me agarró la policía, mandame todo lo que tengas.", c: 4, s: 18 },
          ],
        },
      ],
    },
    {
      id: "premio", n: "El falso premio", emoji: "🎁", min: 0, riesgo: 5, piso: 34, mult: 0.8,
      desc: "«¡Ganaste!» Para cobrar el premio, primero tenés que pagar un 'impuesto'.",
      guion: [
        {
          npc: ["¿Hola?"],
          ops: [
            { t: "¡Felicitaciones! Resultó ganador/a del sorteo anual 🎉", c: 12, s: 5 },
            { t: "Le escribo porque ganó un 0km. Es real, no es joda.", c: 9, s: 9 },
            { t: "Hola, ganaste un premio pero caduca en 10 minutos.", c: 10, s: 10 },
          ],
        },
        {
          npc: ["¿En serio? ¿Y qué gané?", "No me acuerdo de haberme anotado…"],
          ops: [
            { t: "Se anotó automáticamente comprando en el súper. Solo pague el envío.", c: 15, s: 6 },
            { t: "Un auto. Para liberarlo pague el 'impuesto de premios'.", c: 12, s: 12 },
            { t: "No pregunte, pague $5000 y es suyo.", c: 3, s: 20 },
          ],
        },
      ],
    },
    {
      id: "soporte", n: "Soporte técnico «Microsóft»", emoji: "🖥️", min: 8000, riesgo: 8, piso: 32, mult: 1.1,
      desc: "Llamás diciendo que su compu tiene un virus y que vos lo arreglás… por un precio.",
      guion: [
        {
          npc: ["Hola, ¿quién habla?"],
          ops: [
            { t: "Le hablo de Soporte Técnico. Detectamos un virus en su equipo.", c: 13, s: 7 },
            { t: "Soy ingeniero de Microsóft, su Windows está infectado.", c: 11, s: 9 },
            { t: "Su computadora mandó una alerta roja a nuestra central.", c: 10, s: 11 },
          ],
        },
        {
          npc: ["Uy… ¿un virus? ¿Y es grave?", "Yo no sé nada de computadoras…"],
          ops: [
            { t: "Gravísimo, le están robando los datos. Yo lo soluciono ahora mismo.", c: 16, s: 8 },
            { t: "Tranquilo/a, instale esta app y deme acceso, yo me encargo.", c: 12, s: 13 },
            { t: "Pague el soporte premium y listo, nunca más virus.", c: 10, s: 10 },
          ],
        },
      ],
    },
    {
      id: "rifa", n: "La rifa trucha", emoji: "🎟️", min: 8000, riesgo: 5, piso: 36, mult: 0.9,
      desc: "Vendés números de una rifa de un premio enorme… que no existe.",
      guion: [
        {
          npc: ["¿Qué vendés?"],
          ops: [
            { t: "Rifa del Hospital de Niños, el premio es un 0km y una casa.", c: 14, s: 5 },
            { t: "Números para una rifa solidaria, sale re barato.", c: 11, s: 4 },
            { t: "Última chance, quedan dos números del premio gordo.", c: 10, s: 9 },
          ],
        },
        {
          npc: ["Mmm, ¿y cuándo se sortea?", "¿Vos de dónde sos?"],
          ops: [
            { t: "Se sortea por la Lotería, está todo en regla, mirá el flyer.", c: 15, s: 7 },
            { t: "El viernes. Comprá tres y te regalo uno.", c: 12, s: 6 },
            { t: "No preguntes tanto, ¿lo querés o no?", c: 3, s: 17 },
          ],
        },
      ],
    },
    {
      id: "venta", n: "La venta fantasma", emoji: "📱", min: 45000, riesgo: 7, piso: 34, mult: 1.2,
      desc: "Publicás un celular carísimo baratísimo. Cobrás la seña… y desaparecés.",
      guion: [
        {
          npc: ["Hola! Vi el iPhone que publicaste, ¿sigue disponible?"],
          ops: [
            { t: "¡Sí! Está impecable, lo dejo barato porque me voy del país.", c: 14, s: 5 },
            { t: "Sí, pero tengo mil consultas. Señálo con una transferencia.", c: 12, s: 9 },
            { t: "Dale, pero pagá ya que lo tengo reservado a otro.", c: 10, s: 11 },
          ],
        },
        {
          npc: ["Buenísimo! ¿Podemos encontrarnos para verlo?"],
          ops: [
            { t: "Estoy a full, mejor te lo mando por correo apenas señes.", c: 15, s: 8 },
            { t: "Mandá la seña del 50% y coordinamos la entrega.", c: 13, s: 10 },
            { t: "No hago entregas en persona, transferí todo y listo.", c: 4, s: 19 },
          ],
        },
      ],
    },
    {
      id: "inversion", n: "La inversión milagrosa", emoji: "📈", min: 45000, riesgo: 9, piso: 30, mult: 1.6,
      desc: "Prometés multiplicar la plata x10 en una semana. Spoiler: no.",
      guion: [
        {
          npc: ["Vi tu publicación sobre invertir… ¿es verdad lo de los rendimientos?"],
          ops: [
            { t: "Totalmente. Mis clientes ganan 40% mensual, sin riesgo.", c: 13, s: 9 },
            { t: "Mirá las capturas de mis ganancias 💸 ¿querés empezar?", c: 12, s: 7 },
            { t: "Es una oportunidad única, cupos limitados, entrá YA.", c: 11, s: 11 },
          ],
        },
        {
          npc: ["Wow… ¿y cuánto necesito para empezar?", "¿Y si quiero retirar?"],
          ops: [
            { t: "Arrancás con lo que tengas, cuanto más pongas más ganás.", c: 15, s: 8 },
            { t: "Retirás cuando quieras (igual nadie retira, todos reinvierten).", c: 12, s: 10 },
            { t: "Meté todo, hipotecá la casa si hace falta, es seguro.", c: 5, s: 20 },
          ],
        },
      ],
    },
    {
      id: "cripto", n: "El rug pull de GarcaCoin", emoji: "🪙", min: 220000, riesgo: 10, piso: 28, mult: 2.2,
      desc: "Lanzás tu propia cripto, inflás el precio y te escapás con la caja.",
      guion: [
        {
          npc: ["Che, me hablaron de GarcaCoin, ¿es la próxima que explota?"],
          ops: [
            { t: "100%. El equipo es serio, hay auditoría (la hicimos nosotros).", c: 13, s: 9 },
            { t: "Ya subió 300% esta semana, entrá antes de que sea tarde.", c: 12, s: 8 },
            { t: "Es imposible que baje, el gráfico solo va para arriba.", c: 10, s: 12 },
          ],
        },
        {
          npc: ["¿Y no es medio raro que suba tanto?", "¿Dónde la compro?"],
          ops: [
            { t: "Raro sería no entrar. Comprá en mi link, te doy bonus.", c: 15, s: 9 },
            { t: "Hacé la transferencia y yo te la cambio por GarcaCoin.", c: 12, s: 11 },
            { t: "Confiá, hermano. ¿Cuándo te hice quedar mal?", c: 11, s: 13 },
          ],
        },
      ],
    },
    {
      id: "factura", n: "La factura trucha", emoji: "🧾", min: 220000, riesgo: 8, piso: 33, mult: 2.5,
      desc: "Le mandás a una empresa una factura de un servicio que nunca contrató.",
      guion: [
        {
          npc: ["Hola, recibimos su factura pero no reconozco el servicio."],
          ops: [
            { t: "Es el mantenimiento mensual del sistema, ya está vencida.", c: 14, s: 7 },
            { t: "Lo contrató su área de Compras, adjunto la 'orden'.", c: 13, s: 9 },
            { t: "Si no paga hoy le cortamos el servicio y va con recargo.", c: 11, s: 12 },
          ],
        },
        {
          npc: ["Mmm, voy a tener que consultarlo con administración…"],
          ops: [
            { t: "Dale, pero la mora corre. Le paso el CBU para agilizar.", c: 15, s: 8 },
            { t: "Ya hablé con su jefe, dijo que pague y después ve. Acá el CBU.", c: 12, s: 13 },
            { t: "No consulte nada, transfiera y listo.", c: 4, s: 20 },
          ],
        },
      ],
    },
  ];
  G.versoPorId = (id) => G.VERSOS.find((v) => v.id === id);

  // ---- herramientas (se compran una vez) ----
  G.HERRAMIENTAS = [
    { id: "guion", n: "Guión profesional", emoji: "📜", precio: 6000, desc: "Arrancás cada chat con +10 de confianza." },
    { id: "chip", n: "Celular con mil chips", emoji: "📵", precio: 14000, desc: "Cada estafa genera 30% menos calor." },
    { id: "voz", n: "Voz de call center", emoji: "🎧", precio: 32000, desc: "+8% de éxito en todos los cobros." },
    { id: "web", n: "Página trucha", emoji: "🌐", precio: 70000, desc: "Las víctimas confían más: +20% a lo que cobrás." },
    { id: "vpn", n: "VPN trucha", emoji: "🛰️", precio: 130000, desc: "La cana baja el doble de rápido sola." },
    { id: "identidad", n: "Identidad falsa", emoji: "🪪", precio: 260000, desc: "Si fallás, casi nunca te denuncian." },
    { id: "callcenter", n: "Call center propio", emoji: "🏢", precio: 900000, desc: "+35% a todo lo que cobrás." },
    { id: "jet", n: "Jet para fugarte", emoji: "🛩️", precio: 6e6, desc: "Si te allanan, perdés mucho menos." },
  ];
  G.herrPorId = (id) => G.HERRAMIENTAS.find((h) => h.id === id);

  // ---- socios (se compran varios; dan ingreso pasivo y bajan calor) ----
  G.SOCIOS = [
    { id: "campana", n: "Campana", emoji: "👀", base: 4000, ingreso: 0, enfria: 0.5, desc: "Te avisa de la cana. Baja el calor de a poco." },
    { id: "pibe", n: "Pibe que reparte volantes", emoji: "🧒", base: 9000, ingreso: 30, enfria: 0, desc: "Te trae víctimas solas. Ingreso pasivo." },
    { id: "contador", n: "Contador trucho", emoji: "🧮", base: 60000, ingreso: 220, enfria: 0.2, desc: "Lava la plata y suma ingreso." },
    { id: "hacker", n: "Hacker amigo", emoji: "🥷", base: 300000, ingreso: 1500, enfria: 0, desc: "Consigue datos. Ingreso pasivo fuerte." },
    { id: "fiscal", n: "Fiscal amigo", emoji: "⚖️", base: 2.2e6, ingreso: 0, enfria: 2.5, desc: "«Cajonea» las causas. Enfría la cana muy rápido." },
    { id: "banco", n: "El del banco", emoji: "🏦", base: 12e6, ingreso: 14000, enfria: 0.5, desc: "Mueve todo por adentro. Ingreso enorme." },
  ];
  G.socioPorId = (id) => G.SOCIOS.find((s) => s.id === id);
  // costo del próximo socio (sube con la cantidad)
  G.costoSocio = function (s, id) {
    const def = G.socioPorId(id);
    const tengo = (s.socios && s.socios[id]) || 0;
    return round(def.base * Math.pow(1.6, tengo));
  };

  // ---- estado nuevo ----
  G.nuevo = function (reputacion) {
    return {
      v: 1,
      plata: 0,
      plataTotal: 0,
      calor: 0,
      estafas: 0,
      intentos: 0,
      rango: 0,
      reputacion: reputacion || 0,
      herramientas: {},
      socios: {},
      logros: {},
      marcas: [],
      chat: null,
      allanamientos: 0,
      hist: [],
      guardado: Date.now(),
    };
  };

  // multiplicador global por reputación (prestige): +4% por punto
  G.multRep = (s) => 1 + (s.reputacion || 0) * 0.04;

  // ---- generar marcas (víctimas) ----
  let _idm = 1;
  G.nuevaMarca = function (s) {
    const tipo = elegir(G.TIPOS);
    const rep = G.multRep(s);
    return {
      id: "m" + _idm++,
      nombre: elegir(tipo.nombres),
      tipo: tipo.id,
      emoji: tipo.emoji,
      etiqueta: tipo.etiqueta,
      bio: elegir(tipo.bio),
      ingenuidad: round(rnd(tipo.ingenuidad[0], tipo.ingenuidad[1])),
      plata: round(rnd(tipo.plata[0], tipo.plata[1]) * rep),
      debil: tipo.debil,
      estafada: 0,
      quemada: false, // ya no cae más
    };
  };
  G.rellenarMarcas = function (s, n) {
    n = n || 5;
    if (!s.marcas) s.marcas = [];
    s.marcas = s.marcas.filter((m) => !m.quemada && m.plata > 500);
    while (s.marcas.length < n) s.marcas.push(G.nuevaMarca(s));
    return s.marcas;
  };

  // ---- motor de chat ----
  G.empezarChat = function (s, marcaId, versoId) {
    const marca = s.marcas.find((m) => m.id === marcaId);
    const verso = G.versoPorId(versoId);
    if (!marca || !verso) return null;
    let conf = 0;
    if (s.herramientas.guion) conf += 10;
    s.chat = {
      marcaId, versoId, paso: 0,
      conf, susp: 0,
      log: [], terminado: false, resultado: null,
    };
    return { marca, verso, npc: verso.guion[0].npc.slice(), ops: verso.guion[0].ops.map((o) => o.t) };
  };

  // responder una opción; devuelve el siguiente beat o {cobro:true}
  G.responder = function (s, opIndex) {
    const c = s.chat;
    if (!c || c.terminado) return null;
    const verso = G.versoPorId(c.versoId);
    const beat = verso.guion[c.paso];
    const op = beat.ops[opIndex];
    if (!op) return null;
    c.conf = clamp(c.conf + op.c, 0, 100);
    c.susp = clamp(c.susp + op.s, 0, 100);
    c.log.push({ yo: op.t });
    c.paso++;
    if (c.paso < verso.guion.length) {
      const b = verso.guion[c.paso];
      return { npc: b.npc.slice(), ops: b.ops.map((o) => o.t), cobro: false };
    }
    // llegó al momento del cobro
    return { cobro: true };
  };

  // probabilidad de éxito del cobro (0..100)
  G.chanceCobro = function (s) {
    const c = s.chat;
    if (!c) return 0;
    const marca = s.marcas.find((m) => m.id === c.marcaId);
    const verso = G.versoPorId(c.versoId);
    let p = verso.piso;
    p += c.conf * 0.45;
    p -= c.susp * 0.7;
    p += (marca.ingenuidad - 50) * 0.35;
    if (marca.debil.indexOf(verso.id) >= 0) p += 18; // es débil a este verso
    if (s.herramientas.voz) p += 8;
    p -= marca.estafada * 12; // ya la estafaste antes: desconfía
    return clamp(round(p), 4, 96);
  };

  // monto potencial del cobro
  G.montoCobro = function (s) {
    const c = s.chat;
    const marca = s.marcas.find((m) => m.id === c.marcaId);
    const verso = G.versoPorId(c.versoId);
    let f = 0.2 + c.conf / 220;
    let monto = marca.plata * f * verso.mult;
    if (s.herramientas.web) monto *= 1.2;
    if (s.herramientas.callcenter) monto *= 1.35;
    return round(monto);
  };

  // resolver el cobro
  G.cobrar = function (s, forzarExito) {
    const c = s.chat;
    if (!c || c.terminado) return null;
    const marca = s.marcas.find((m) => m.id === c.marcaId);
    const verso = G.versoPorId(c.versoId);
    const chance = G.chanceCobro(s);
    const exito = forzarExito === true ? true : forzarExito === false ? false : Math.random() * 100 < chance;
    s.intentos++;
    let calorBase = verso.riesgo + c.susp * 0.1;
    if (s.herramientas.chip) calorBase *= 0.7;
    let res;
    if (exito) {
      const monto = Math.max(1, Math.min(marca.plata, G.montoCobro(s)));
      s.plata += monto;
      s.plataTotal += monto;
      s.estafas++;
      marca.plata -= monto;
      marca.estafada++;
      if (marca.plata < 800 || marca.estafada >= 3) marca.quemada = true;
      s.calor = clamp(s.calor + calorBase, 0, 100);
      res = { exito: true, monto, chance, npc: elegir(G.REACC_EXITO), denuncia: false, quemada: marca.quemada };
    } else {
      // falló: ¿denuncia? más probable con sospecha alta
      let denuncia = Math.random() * 100 < c.susp * 0.6;
      if (s.herramientas.identidad) denuncia = denuncia && Math.random() < 0.25;
      let calor = calorBase + (denuncia ? 22 : 6);
      s.calor = clamp(s.calor + calor, 0, 100);
      marca.estafada++;
      if (c.susp > 60 || marca.estafada >= 3) marca.quemada = true;
      res = { exito: false, chance, npc: elegir(denuncia ? G.REACC_DENUNCIA : G.REACC_FALLO), denuncia, quemada: marca.quemada };
    }
    c.terminado = true;
    c.resultado = res;
    // ¿te allanaron?
    res.allanado = s.calor >= 100;
    if (res.allanado) G.allanar(s);
    s.rango = G.rangoDe(s.plataTotal);
    return res;
  };

  G.REACC_EXITO = [
    "Listo, ya te transferí. ¡Gracias por todo! 🙏",
    "Dale, te mando la plata ahora mismo.",
    "Uh, menos mal que me avisaste. Ya está, te pasé todo.",
    "Transferencia hecha. Sos un genio, ¿eh?",
  ];
  G.REACC_FALLO = [
    "Mmm… no, me suena raro. Chau.",
    "Pará, voy a consultar con mi hijo primero.",
    "No gracias, no me interesa. 🙄",
    "Me parece que es verso esto. Te bloqueo.",
  ];
  G.REACC_DENUNCIA = [
    "¡Esto es una estafa! Ya hice la denuncia. 🚔",
    "Sos un chanta. Le mando captura de todo a la policía.",
    "Mi sobrino es abogado y te va a hacer juicio. ¡Rata!",
    "Te grabé. Esto va a Defensa del Consumidor.",
  ];

  // ---- allanamiento (perdés parte de la plata) ----
  G.allanar = function (s) {
    s.allanamientos++;
    let perdida = 0.6;
    if (s.herramientas.jet) perdida = 0.2;
    s.plata = round(s.plata * (1 - perdida));
    s.calor = 35;
    return s.plata;
  };

  // ---- paso del tiempo (ingreso pasivo de socios + enfriar calor) ----
  G.paso = function (s, dt) {
    dt = dt || 1;
    let ingreso = 0, enfria = 0.6; // enfría solo de base
    for (const id in s.socios) {
      const def = G.socioPorId(id); if (!def) continue;
      const q = s.socios[id];
      ingreso += def.ingreso * q;
      enfria += def.enfria * q;
    }
    ingreso *= G.multRep(s);
    if (s.herramientas.vpn) enfria *= 2;
    if (ingreso) { const g = ingreso * dt; s.plata += g; s.plataTotal += g; }
    s.calor = clamp(s.calor - enfria * dt, 0, 100);
    s.rango = G.rangoDe(s.plataTotal);
    return { ingreso };
  };

  // ---- comprar ----
  G.comprarHerr = function (s, id) {
    const h = G.herrPorId(id);
    if (!h || s.herramientas[id] || s.plata < h.precio) return false;
    s.plata -= h.precio; s.herramientas[id] = true; return true;
  };
  G.comprarSocio = function (s, id) {
    const costo = G.costoSocio(s, id);
    if (s.plata < costo) return false;
    s.plata -= costo; s.socios[id] = (s.socios[id] || 0) + 1; return true;
  };
  G.lavar = function (s) {
    // gastás plata para enfriar la cana rápido
    const costo = round(Math.max(2000, s.plata * 0.1));
    if (s.plata < costo || s.calor <= 0) return false;
    s.plata -= costo; s.calor = clamp(s.calor - 35, 0, 100); return true;
  };

  // ---- retirarse (prestige): sumás reputación y empezás de nuevo ----
  G.reputacionGanable = function (s) {
    return Math.floor(Math.sqrt(s.plataTotal / 50000));
  };
  G.retirarse = function (s) {
    const gan = G.reputacionGanable(s);
    const nuevaRep = (s.reputacion || 0) + gan;
    const n = G.nuevo(nuevaRep);
    return { estado: n, ganada: gan, total: nuevaRep };
  };

  // ---- logros ----
  G.LOGROS = [
    { id: "primera", n: "Primera estafa", test: (s) => s.estafas >= 1 },
    { id: "diez", n: "Diez incautos", test: (s) => s.estafas >= 10 },
    { id: "cien", n: "Estafador serial", test: (s) => s.estafas >= 100 },
    { id: "millon", n: "Primer millón sucio", test: (s) => s.plataTotal >= 1e6 },
    { id: "cripto", n: "Rug pull maestro", test: (s) => s.herramientas.callcenter || (s.socios.hacker || 0) >= 1 },
    { id: "allanado", n: "Te allanaron (y seguís)", test: (s) => s.allanamientos >= 1 },
    { id: "fiscal", n: "Justicia comprada", test: (s) => (s.socios.fiscal || 0) >= 1 },
    { id: "procer", n: "Prócer del verso", test: (s) => s.rango >= 7 },
    { id: "retiro", n: "Te retiraste rico", test: (s) => s.reputacion >= 5 },
    { id: "banco", n: "Dueño del banco", test: (s) => (s.socios.banco || 0) >= 1 },
  ];
  G.chequearLogros = function (s) {
    const nuevos = [];
    for (const l of G.LOGROS) {
      if (!s.logros[l.id] && l.test(s)) { s.logros[l.id] = Date.now(); nuevos.push(l); }
    }
    return nuevos;
  };

  // ---- eventos (aparecen cada tanto) ----
  G.EVENTOS = [
    {
      id: "viral", t: "Se viralizó tu estafa", d: "Un diario publicó tu último cuento. Cae más gente… pero también te buscan.",
      ops: [
        { t: "Aprovechar la fama (más víctimas, +calor)", fx: (s) => { G.rellenarMarcas(s, 8); s.calor = clamp(s.calor + 15, 0, 100); } },
        { t: "Bajar un cambio (enfriar la cana)", fx: (s) => { s.calor = clamp(s.calor - 25, 0, 100); } },
      ],
    },
    {
      id: "soplon", t: "Un socio te quiere vender", d: "Un contacto amenaza con hablar con la cana si no le pagás.",
      ops: [
        { t: "Pagarle para que calle", fx: (s) => { s.plata = round(s.plata * 0.9); } },
        { t: "Ignorarlo (riesgo)", fx: (s) => { s.calor = clamp(s.calor + 20, 0, 100); } },
      ],
    },
    {
      id: "redada", t: "Operativo antiestafas", d: "La fiscalía anunció una campaña. Todos desconfían por unos días.",
      ops: [
        { t: "Esconderse y lavar plata", fx: (s) => { s.calor = clamp(s.calor - 20, 0, 100); s.plata = round(s.plata * 0.95); } },
        { t: "Seguir como si nada", fx: (s) => { s.calor = clamp(s.calor + 10, 0, 100); } },
      ],
    },
    {
      id: "herencia", t: "Un pez gordo", d: "Apareció un empresario con mucha guita y cero desconfianza.",
      ops: [
        { t: "Mandarle el mejor verso", fx: (s) => { const m = G.nuevaMarca(s); m.plata = round(m.plata * 4); m.ingenuidad = 85; s.marcas.unshift(m); } },
        { t: "Desconfiar, puede ser trampa", fx: (s) => { s.calor = clamp(s.calor - 5, 0, 100); } },
      ],
    },
  ];
  G.eventoRandom = function () { return elegir(G.EVENTOS); };

  // ---- guardado ----
  G.serializar = function (s) { s.guardado = Date.now(); return JSON.stringify(s); };
  G.cargar = function (txt) {
    try {
      const o = JSON.parse(txt);
      if (!o || o.v !== 1) return null;
      const s = Object.assign(G.nuevo(), o);
      if (!s.marcas) s.marcas = [];
      if (!s.herramientas) s.herramientas = {};
      if (!s.socios) s.socios = {};
      if (!s.logros) s.logros = {};
      s.chat = null; // no se guarda un chat a medias
      s.rango = G.rangoDe(s.plataTotal);
      return s;
    } catch (e) { return null; }
  };

  // recuperar tiempo offline (solo ingreso pasivo y enfriar; nunca te allanan estando afuera)
  G.offline = function (s, seg) {
    seg = Math.min(seg, 60 * 60 * 12); // tope 12 h
    if (seg < 5) return { ingreso: 0, seg: 0 };
    const antes = s.plata;
    G.paso(s, seg);
    return { ingreso: s.plata - antes, seg };
  };

  root.Garca = G;
  if (typeof module !== "undefined" && module.exports) module.exports = G;
})(typeof globalThis !== "undefined" ? globalThis : this);
