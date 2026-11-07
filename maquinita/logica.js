/* La Maquinita · lógica del juego (sin pantalla, se puede probar en Node).
 * Imprimís billetes para «hacer andar» el país, la inflación sube, los precios suben y la gente se enoja.
 * Una parte de todo lo que imprimís termina en tu bolsillo (en dólares) y con eso subís de cargo.
 * Todo es ficción: los personajes, partidos y situaciones son inventados.
 */
(function () {
  'use strict';
  const M = globalThis.Maquinita = {};
  const MES = 10;          // segundos por mes del juego
  const ELECCIONES = 48;   // meses entre elecciones

  M.CARGOS = [
    { n: 'Puntero barrial', usd: 0 },
    { n: 'Concejal', usd: 12 },
    { n: 'Intendente', usd: 250 },
    { n: 'Diputado', usd: 6000 },
    { n: 'Senador', usd: 150000 },
    { n: 'Gobernador', usd: 4e+06 },
    { n: 'Ministro de Economía', usd: 1.2e+08 },
    { n: 'Presidente', usd: 4e+09 },
    { n: 'Prócer en un billete', usd: 1.5e+11 },
  ];
  M.IMPRENTAS = [
    { id: 'manivela', n: 'Maquinita a manivela', d: 'Un sobrino le da a la manija.', costo: 12, prod: 0.6, cargo: 0 },
    { id: 'turno', n: 'Turno noche en la Casa de Moneda', d: 'Horas extra, sin preguntas.', costo: 140, prod: 5, cargo: 0 },
    { id: 'fotocopia', n: 'Fotocopiadora del ministerio', d: 'Imprime billetes y, de paso, apuntes.', costo: 1600, prod: 34, cargo: 1 },
    { id: 'extranjera', n: 'Imprenta en el exterior', d: 'Los billetes llegan en avión. Caro, pero rinde.', costo: 2.1e4, prod: 240, cargo: 2 },
    { id: 'rotativa', n: 'Rotativa del diario oficialista', d: 'Imprime el diario a la mañana y billetes a la tarde.', costo: 3e5, prod: 1800, cargo: 3 },
    { id: 'digital', n: 'Emisión digital', d: 'Ni papel hace falta: un clic y listo.', costo: 4.5e6, prod: 1.5e4, cargo: 4 },
    { id: 'helicoptero', n: 'Helicóptero monetario', d: 'Tira billetes desde el aire. Muy popular.', costo: 7e7, prod: 1.3e5, cargo: 5 },
    { id: 'bancoParalelo', n: 'Banco Central paralelo', d: 'Uno imprime, el otro firma.', costo: 1.2e9, prod: 1.2e6, cargo: 6 },
    { id: 'satelite', n: 'Maquinita satelital', d: 'Emite desde la órbita. Fuera de la ley de gravedad.', costo: 2e10, prod: 1.2e7, cargo: 7 },
    { id: 'cuantica', n: 'Imprenta cuántica', d: 'Imprime el billete y su antibillete al mismo tiempo.', costo: 3e11, prod: 1.1e8, cargo: 7 },
    { id: 'lunar', n: 'Base lunar de emisión', d: 'En la Luna no hay inflación… por ahora.', costo: 5e12, prod: 1e9, cargo: 8 },
    { id: 'multiverso', n: 'Maquinita del multiverso', d: 'Emite en todos los universos. En todos hay inflación.', costo: 8e13, prod: 9e9, cargo: 8 },
  ];
  M.MINISTERIOS = [
    { id: 'relato', n: 'Ministerio del Relato', d: 'Las operaciones de prensa rinden el doble.', costo: 2500, cargo: 1 },
    { id: 'tinta', n: 'Secretaría de Tinta y Papel', d: 'Todas las imprentas producen el doble.', costo: 4e4, cargo: 2 },
    { id: 'felicidad', n: 'Ministerio de la Felicidad', d: 'La aprobación sube un poco cada mes.', costo: 5e5, cargo: 3 },
    { id: 'secretos', n: 'Secretaría de Asuntos Reservados', d: '+6 puntos de «retorno» a tu bolsillo.', costo: 6e6, cargo: 4 },
    { id: 'celeste', n: 'Ministerio del Dólar Celeste', d: 'Cambiás tus pesos a un dólar 30 % más barato.', costo: 9e7, cargo: 5 },
    { id: 'tinta2', n: 'Ministerio de la Maquinita', d: 'Todas las imprentas producen el triple.', costo: 1.5e9, cargo: 6 },
    { id: 'estadistica', n: 'Instituto de Estadísticas Creativas', d: 'La inflación «medida» enoja la mitad a la gente.', costo: 2.5e10, cargo: 7 },
    { id: 'propaganda', n: 'Ministerio de la Propaganda Alegre', d: 'Las operaciones de prensa duran mucho más.', costo: 4e8, cargo: 6 },
    { id: 'cripto', n: 'Secretaría de Innovación Blockchain', d: 'GonzaCoin tiene más chances de irse a la Luna.', costo: 1e11, cargo: 7 },
    { id: 'patria', n: 'Ministerio de la Patria Financiera', d: 'Todas las imprentas producen el doble (otra vez).', costo: 4e12, cargo: 8 },
    { id: 'trolls', n: 'Granja de Trolls Oficiales', d: 'La prensa y las cadenas suben un 50 % más la aprobación.', costo: 3e7, cargo: 4 },
    { id: 'lealtad', n: 'Ministerio de Lealtades', d: 'La aprobación sube un poco más cada mes.', costo: 8e9, cargo: 6 },
  ];
  // mejoras VIP: lujos que te comprás con tus DÓLARES del bolsillo. Son fuertes y permanentes (por carrera).
  M.VIP = [
    { id: 'auto0km', n: 'Auto 0km importado', d: 'Toda la producción rinde un 15 % más.', usd: 40, cargo: 0 },
    { id: 'rolex', n: 'Reloj de lujo', d: 'Tus clics en la maquinita valen el triple.', usd: 180, cargo: 1 },
    { id: 'yate', n: 'Yate en el río', d: '+8 puntos de «retorno» a tu bolsillo (más dólares).', usd: 900, cargo: 2 },
    { id: 'mansion', n: 'Mansión en un country', d: 'La aprobación sube sola un poco cada mes.', usd: 3500, cargo: 3 },
    { id: 'offshore', n: 'Cuenta en el exterior', d: 'Comprás dólares un 25 % más baratos.', usd: 2e4, cargo: 4 },
    { id: 'barra', n: 'Barra brava propia', d: 'La inflación enoja mucho menos a la gente.', usd: 1.5e5, cargo: 5 },
    { id: 'jet', n: 'Jet privado', d: 'Toda la producción se duplica.', usd: 2e6, cargo: 6 },
    { id: 'estatua', n: 'Estatua tuya (en vida)', d: 'Tus contactos rinden un 50 % más.', usd: 3e7, cargo: 7 },
    { id: 'isla', n: 'Isla privada', d: 'Toda la producción se vuelve a duplicar.', usd: 5e8, cargo: 8 },
  ];
  M.IMPUESTOS = ['Tasa al viento del sur', 'Impuesto al mate compartido', 'Contribución por mirar el río', 'Tasa a los domingos lindos', 'Impuesto a la sobremesa', 'Tasa por tener razón', 'Gravamen al asado de los sábados', 'Impuesto a las vacaciones imaginadas', 'Tasa por respirar fuerte', 'Impuesto al chiste repetido', 'Contribución solidaria al tío que opina', 'Tasa a la siesta prolongada', 'Impuesto al “te lo dije”', 'Tasa por hacer la cola bien', 'Gravamen al primer mate amargo', 'Contribución por el feriado puente', 'Impuesto a las ojeras del lunes', 'Tasa al optimismo injustificado'];
  M.RIVALES = [
    { n: 'Cacho Balbuena', usd0: 2, crece: 1.06 }, { n: 'Doña Chela Montero', usd0: 20, crece: 1.055 }, { n: 'El Rulo Iturbe', usd0: 200, crece: 1.05 },
    { n: 'Pocho Ferreyra', usd0: 3e3, crece: 1.048 }, { n: 'Toto Zamudio', usd0: 4e4, crece: 1.045 }, { n: 'La Nena Garbarino', usd0: 6e5, crece: 1.042 },
    { n: 'Don Anselmo Quiroga', usd0: 9e6, crece: 1.04 }, { n: 'Los Hermanos Peralta', usd0: 1.5e8, crece: 1.038 },
  ];
  // Etapa 2: partidos de oposición (ficticios) y nombres posibles para tu propio espacio
  M.PARTIDOS = [
    { n: 'Frente Cambio Real', ideo: 'centro-derecha', peso: 0.34 },
    { n: 'Unión Popular Federal', ideo: 'centro-izquierda', peso: 0.27 },
    { n: 'Movimiento Libertad Total', ideo: 'liberal', peso: 0.23 },
    { n: 'Vecinos Autoconvocados', ideo: 'vecinalista', peso: 0.16 },
  ];
  M.NOMBRES_PARTIDO = ['Partido de la Maquinita', 'Frente Billete Feliz', 'Unión Imprenta Nacional', 'Movimiento Patria y Emisión', 'Frente de la Gente Contenta', 'Espacio Siempre Presente'];
  M.nombrePartido = () => M.NOMBRES_PARTIDO[Math.floor(Math.random() * M.NOMBRES_PARTIDO.length)];
  // Etapa 3: las 23 provincias + CABA (datos ficticios: población en millones, gobernador inventado, apoyo inicial)
  M.PROVINCIAS = [
    { id: 'ba', n: 'Buenos Aires', reg: 'Centro', pob: 17.5, gob: 'Rubén Sosa', apoyo0: 44 },
    { id: 'caba', n: 'CABA', reg: 'Centro', pob: 3.1, gob: 'Marta Vignola', apoyo0: 30 },
    { id: 'cba', n: 'Córdoba', reg: 'Centro', pob: 3.9, gob: 'Nino Carranza', apoyo0: 28 },
    { id: 'sfe', n: 'Santa Fe', reg: 'Centro', pob: 3.5, gob: 'Delia Juárez', apoyo0: 34 },
    { id: 'er', n: 'Entre Ríos', reg: 'Centro', pob: 1.4, gob: 'Beto Almada', apoyo0: 40 },
    { id: 'lp', n: 'La Pampa', reg: 'Centro', pob: 0.36, gob: 'Chino Leiva', apoyo0: 46 },
    { id: 'mza', n: 'Mendoza', reg: 'Cuyo', pob: 2.0, gob: 'Tito Funes', apoyo0: 32 },
    { id: 'sj', n: 'San Juan', reg: 'Cuyo', pob: 0.82, gob: 'Nelly Paz', apoyo0: 42 },
    { id: 'sl', n: 'San Luis', reg: 'Cuyo', pob: 0.51, gob: 'Cacho Ponce', apoyo0: 38 },
    { id: 'juj', n: 'Jujuy', reg: 'NOA', pob: 0.77, gob: 'Ramón Quispe', apoyo0: 36 },
    { id: 'sal', n: 'Salta', reg: 'NOA', pob: 1.4, gob: 'Pocha Vega', apoyo0: 40 },
    { id: 'tuc', n: 'Tucumán', reg: 'NOA', pob: 1.7, gob: 'Lito Argañaraz', apoyo0: 48 },
    { id: 'cat', n: 'Catamarca', reg: 'NOA', pob: 0.42, gob: 'Nora Brizuela', apoyo0: 44 },
    { id: 'lr', n: 'La Rioja', reg: 'NOA', pob: 0.39, gob: 'Juan de la Fuente', apoyo0: 50 },
    { id: 'sde', n: 'Santiago del Estero', reg: 'NOA', pob: 1.0, gob: 'Coca Ibáñez', apoyo0: 52 },
    { id: 'mis', n: 'Misiones', reg: 'NEA', pob: 1.3, gob: 'Walter Báez', apoyo0: 46 },
    { id: 'ctes', n: 'Corrientes', reg: 'NEA', pob: 1.1, gob: 'Ñato Medina', apoyo0: 34 },
    { id: 'cha', n: 'Chaco', reg: 'NEA', pob: 1.2, gob: 'Susana Ojeda', apoyo0: 42 },
    { id: 'for', n: 'Formosa', reg: 'NEA', pob: 0.61, gob: 'Tincho Galeano', apoyo0: 54 },
    { id: 'neu', n: 'Neuquén', reg: 'Patagonia', pob: 0.72, gob: 'Lucho Peña', apoyo0: 30 },
    { id: 'rn', n: 'Río Negro', reg: 'Patagonia', pob: 0.75, gob: 'Any Ferrari', apoyo0: 32 },
    { id: 'chu', n: 'Chubut', reg: 'Patagonia', pob: 0.62, gob: 'Toto Vera', apoyo0: 34 },
    { id: 'scz', n: 'Santa Cruz', reg: 'Patagonia', pob: 0.37, gob: 'Gringa Soto', apoyo0: 40 },
    { id: 'tdf', n: 'Tierra del Fuego', reg: 'Patagonia', pob: 0.19, gob: 'Fito Cárcamo', apoyo0: 36 },
  ];
  M.REGMOD = { Centro: 0.9, Cuyo: 1.0, NOA: 1.15, NEA: 1.2, Patagonia: 0.85 };  // modificador regional de desempleo/pobreza

  M.nuevo = function (contactos) {
    return {
      v: 1, t: 0, mes: 0, caja: 0, usd: 0, usdTotal: 0, impresoMes: 0, impresoTotal: 0, clicks: 0,
      infl: 2, precios: 1, aprob: 62, cargo: 0, imp: {}, min: {}, noquis: 0, impuestos: 0, subsidios: 0,
      congelado: 0, prensa: 0, ultEvento: 0, evento: null, histInfl: [2], noticias: [], logros: {}, mandatos: 0,
      contactos: contactos || 0, fin: null, ceros: 0, prox: 25 + Math.random() * 20, mejorUsd: 0,
      deuda: 0, deudaCuota: 0, cripto: null, cadenas: 0, autoOn: false, vip: {},
      partido: M.nombrePartido(), actos: 0, debates: 0, debateMes: -1,  // Etapa 2: política
      prov: {},  // Etapa 3: estado dinámico por provincia (lo que vos invertís)
      minist: {},  // Etapa 4: presupuesto y decisiones por cartera ministerial
    };
  };

  /* ───── números derivados ───── */
  const multCargo = s => Math.pow(2.4, s.cargo);
  const vip = (s, id) => s.vip && s.vip[id];
  M.multProd = s => multCargo(s) * (1 + 0.03 * s.contactos * (vip(s, 'estatua') ? 1.5 : 1)) * (s.min.tinta ? 2 : 1) * (s.min.tinta2 ? 3 : 1) * (s.min.patria ? 2 : 1) * (vip(s, 'auto0km') ? 1.15 : 1) * (vip(s, 'jet') ? 2 : 1) * (vip(s, 'isla') ? 2 : 1) * Math.pow(s.precios, 0.75);
  M.prodBase = s => M.IMPRENTAS.reduce((a, g) => a + (s.imp[g.id] || 0) * g.prod, 0);
  M.porSeg = s => M.prodBase(s) * M.multProd(s) * (1 + s.impuestos * 0.06);
  M.porClick = s => Math.max(1, (1 + M.prodBase(s) * 0.05) * multCargo(s) * (1 + 0.03 * s.contactos) * (vip(s, 'rolex') ? 3 : 1) * Math.pow(s.precios, 0.75));
  M.costo = (s, g) => Math.ceil(g.costo * Math.pow(1.15, s.imp[g.id] || 0) * s.precios);
  M.costoMin = (s, m) => Math.ceil(m.costo * s.precios);
  M.retorno = s => Math.min(0.35, 0.02 + s.noquis * 0.0025 + (s.min.secretos ? 0.06 : 0) + (vip(s, 'yate') ? 0.08 : 0));   // parte que va a tu bolsillo
  M.dolar = s => 100 * s.precios * (s.min.celeste ? 0.7 : 1) * (vip(s, 'offshore') ? 0.75 : 1);
  M.costoNoqui = s => Math.ceil(80 * Math.pow(1.1, s.noquis) * s.precios);
  M.costoPlan = s => Math.ceil((40 + M.porSeg(s) * 25) * 1);
  M.costoPrensa = s => Math.ceil((60 + M.porSeg(s) * 18));
  M.costoCongelar = s => Math.ceil((150 + M.porSeg(s) * 40));
  M.costoSubsidio = s => Math.ceil((200 + M.porSeg(s) * 60));
  M.costoImpuesto = s => Math.ceil((100 + M.porSeg(s) * 10));
  M.costoCadena = s => Math.ceil((120 + M.porSeg(s) * 30));
  M.costoCripto = s => Math.ceil((300 + M.porSeg(s) * 80));
  M.montoDeuda = s => Math.ceil((500 + M.porSeg(s) * 400));
  M.mesesEleccion = s => ELECCIONES - (s.mes % ELECCIONES);
  M.fecha = s => { const a = 1 + Math.floor(s.mes / 12), m = s.mes % 12; return `Año ${a}, ${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][m]}`; };
  M.inflPercibida = s => s.min.estadistica ? s.infl * 0.5 : s.infl;

  function noticia(s, txt, tipo) { s.noticias.unshift({ txt, tipo: tipo || '', t: s.t }); if (s.noticias.length > 30) s.noticias.pop(); }
  M.noticia = noticia;

  /* ───── ingresos ───── */
  function ingresar(s, pesos) {
    const ret = pesos * M.retorno(s);
    s.caja += pesos - ret; s.impresoMes += pesos; s.impresoTotal += pesos;
    const usd = ret / M.dolar(s); s.usd += usd; s.usdTotal += usd; if (s.usd > s.mejorUsd) s.mejorUsd = s.usd;
  }
  M.click = function (s) { if (s.fin) return 0; const p = M.porClick(s); ingresar(s, p); s.clicks++; return p; };

  /* ───── paso de tiempo ───── */
  M.paso = function (s, dt) {
    if (s.fin) return;
    s.t += dt;
    ingresar(s, M.porSeg(s) * dt);
    if (s.prensa > 0) s.prensa = Math.max(0, s.prensa - dt * (s.min.propaganda ? 0.07 : 0.15));
    s._acMes = (s._acMes || 0) + dt;
    while (s._acMes >= MES) { s._acMes -= MES; finDeMes(s); if (s.fin) return; }
    // eventos
    if (!s.evento && s.t >= s.prox) M.lanzarEvento(s);
    if (s.evento && s.t >= s.evento.vence) M.elegir(s, s.evento.def);
  };

  function finDeMes(s) {
    s.mes++;
    // inflación: cuanto más imprimís respecto del tamaño de la economía, más sube
    const escala = 900 * s.precios * Math.pow(2.75, s.cargo) * (1 + s.impuestos * 0.25);
    const presion = s.impresoMes / escala;
    let obj = 1.2 + 7 * Math.log10(1 + presion) - s.impuestos * 0.6;
    if (s.congelado > 0) { obj *= 0.35; s.congelado--; if (!s.congelado) { noticia(s, 'Se terminó el congelamiento de precios: los comerciantes remarcan todo.', 'malo'); s.infl += 3; } }
    obj = Math.max(0.3, obj);
    s.infl += (obj - s.infl) * 0.35 + (Math.random() - .5) * 0.4;
    s.infl = Math.max(0.2, Math.min(999, s.infl));
    s.precios *= 1 + s.infl / 100;
    s.impresoMes = 0;
    s.histInfl.push(Math.round(s.infl * 10) / 10); if (s.histInfl.length > 60) s.histInfl.shift();
    // subsidios: se pagan todos los meses
    if (s.subsidios) { const c = M.costoSubsidio(s) * 0.08 * s.subsidios; if (s.caja >= c) s.caja -= c; else { s.subsidios = Math.max(0, s.subsidios - 1); noticia(s, 'No alcanzó la plata: se cortó un subsidio y hay cacerolazo.', 'malo'); s.aprob -= 4; } }
    // deuda con el Fondo: cuota todos los meses
    if (s.deuda > 0) {
      const cuota = s.deudaCuota;
      if (s.caja >= cuota) { s.caja -= cuota; s.deuda = Math.max(0, s.deuda - cuota); if (s.deuda <= 0) { s.deudaCuota = 0; noticia(s, 'Saldaste la deuda con el Fondo. Aplausos (de ellos).', 'bueno'); } }
      else { s.aprob = Math.max(0, s.aprob - 3); s.infl += 0.6; noticia(s, 'No llegaste a pagarle al Fondo: sube el riesgo país y la bronca.', 'malo'); }
    }
    // GonzaCoin: la cripto nacional se resuelve a los pocos meses
    if (s.cripto) {
      s.cripto.meses--;
      if (s.cripto.meses <= 0) {
        if (Math.random() < (s.min.cripto ? 0.62 : 0.5)) { s.caja += M.porSeg(s) * 500; s.aprob = Math.min(100, s.aprob + 6); noticia(s, '¡GonzaCoin se fue a la Luna! Los que vendieron a tiempo te aman.', 'bueno'); M.logro(s, 'cripto'); }
        else { s.aprob = Math.max(0, s.aprob - 9); noticia(s, 'GonzaCoin se fue a cero: hay escrache, memes y una canción.', 'malo'); }
        s.cripto = null;
      }
    }
    // aprobación
    const ip = M.inflPercibida(s);
    let d = -Math.max(0, ip - 1.5) * 0.2 * (vip(s, 'barra') ? 0.5 : 1) - s.noquis * 0.006 + s.subsidios * 0.55 + (s.min.felicidad ? 0.6 : 0) + (s.min.lealtad ? 0.4 : 0) + (vip(s, 'mansion') ? 0.5 : 0) + s.prensa * 0.12 + (Math.random() - .5) * 0.6;
    if (s.aprob < 30) d += 0.3; // la gente se acostumbra
    s.aprob = Math.max(0, Math.min(100, s.aprob + d));
    if (ip > 15 && Math.random() < 0.25) noticia(s, ['Las etiquetas de precios ya se venden con lápiz y goma.', 'Un kiosco cambió los precios tres veces mientras un cliente elegía un alfajor.', 'Los billetes se pesan en vez de contarse.', 'Récord: el changuito cuesta más que el auto del año pasado.'][Math.floor(Math.random() * 4)], 'malo');
    if (s.mes % 12 === 0) noticia(s, `Cierre del ${M.fecha(s).replace(', enero', '')}: inflación de ${ip.toFixed(1)} % mensual y ${Math.round(s.aprob)} % de aprobación.`);
    // elecciones
    if (s.mes % ELECCIONES === 0) {
      if (s.aprob >= 40) { s.mandatos++; const premio = Math.max(1, s.usd * 0.1); s.usd += premio; s.usdTotal += premio; s.aprob = Math.min(100, s.aprob + 6); noticia(s, `¡Ganaste las elecciones con el ${Math.round(48 + s.aprob / 3)} %! Festejo en el búnker y bono para los amigos.`, 'bueno'); M.logro(s, 'reelecto'); }
      else return terminar(s, 'elecciones');
    }
    if (s.aprob <= 0) return terminar(s, 'juicio');
    if (s.infl >= 200 && !s.logros.hiper) M.logro(s, 'hiper');
  }

  function terminar(s, motivo) {
    s.fin = { motivo, contactos: M.contactosGanados(s), mes: s.mes, cargo: s.cargo, usd: s.usdTotal, mandatos: s.mandatos };
    noticia(s, motivo === 'juicio' ? 'Juicio político: te tuviste que ir en helicóptero.' : 'Perdiste las elecciones. Te vas a dar clases a una universidad del exterior.', 'malo');
  }
  M.contactosGanados = s => Math.floor(s.cargo * 3 + s.mandatos * 2 + Math.log10(s.usdTotal + 1) * 2);
  M.renacer = s => { const c = s.contactos + (s.fin ? s.fin.contactos : M.contactosGanados(s)); const n = M.nuevo(c); n.logros = s.logros; n.mandatosTotales = (s.mandatosTotales || 0) + s.mandatos; n.autoOn = s.autoOn; noticia(n, `Volvés a la política con ${c} contactos: todo rinde un ${Math.round(c * 3)} % más.`, 'bueno'); return n; };

  /* ───── acciones ───── */
  M.comprar = function (s, id) {
    const g = M.IMPRENTAS.find(x => x.id === id); if (!g || s.cargo < g.cargo || s.fin) return false;
    const c = M.costo(s, g); if (s.caja < c) return false;
    s.caja -= c; s.imp[id] = (s.imp[id] || 0) + 1; return true;
  };
  M.ministerio = function (s, id) {
    const m = M.MINISTERIOS.find(x => x.id === id); if (!m || s.min[id] || s.cargo < m.cargo || s.fin) return false;
    const c = M.costoMin(s, m); if (s.caja < c) return false;
    s.caja -= c; s.min[id] = true; noticia(s, `Se inauguró el ${m.n}. Hubo corte de cinta y choripán.`, 'bueno'); return true;
  };
  M.noqui = function (s, n) {
    let k = 0; for (let i = 0; i < (n || 1); i++) { const c = M.costoNoqui(s); if (s.caja < c) break; s.caja -= c; s.noquis++; k++; }
    if (k && s.noquis % 25 === 0) noticia(s, `Ya tenés ${s.noquis} empleados que nadie vio nunca. Cobran el 29 de cada mes.`);
    return k;
  };
  M.programa = function (s, tipo) {
    if (s.fin) return false;
    const costos = { plan: M.costoPlan(s), prensa: M.costoPrensa(s), congelar: M.costoCongelar(s), subsidio: M.costoSubsidio(s), impuesto: M.costoImpuesto(s), cadena: M.costoCadena(s), cripto: M.costoCripto(s), deuda: 0 };
    const c = costos[tipo]; if (c == null || s.caja < c) return false;
    if (tipo === 'congelar' && s.congelado > 0) return false;
    if (tipo === 'cripto' && s.cripto) return false;
    s.caja -= c;
    if (tipo === 'plan') { s.aprob = Math.min(100, s.aprob + 9); s.impresoMes += c * 4; noticia(s, 'Lanzaste el «Plan Platita»: bono para todos. La gente sonríe; los precios también.', 'bueno'); }
    if (tipo === 'prensa') { s.prensa = Math.min(60, s.prensa + (s.min.relato ? 20 : 10)); s.aprob = Math.min(100, s.aprob + (s.min.relato ? 8 : 4) * (s.min.trolls ? 1.5 : 1)); noticia(s, ['Los canales amigos dicen que la inflación es «una sensación».', 'Un panel de expertos explica que los precios en realidad bajaron.', 'Encuesta propia: 9 de cada 10 están chochos.'][Math.floor(Math.random() * 3)]); if (Math.random() < 0.12) { s.aprob -= 8; noticia(s, 'Se filtró que pagaste la nota: escándalo en las redes.', 'malo'); } }
    if (tipo === 'congelar') { s.congelado = 6; noticia(s, 'Precios congelados por 6 meses. Las góndolas, misteriosamente vacías.', 'bueno'); }
    if (tipo === 'subsidio') { s.subsidios++; s.aprob = Math.min(100, s.aprob + 2); noticia(s, ['Subsidio a la luz: la boleta llega en blanco.', 'Subsidio al colectivo: viaja hasta el perro.', 'Subsidio al gas: hasta los asados salen más baratos.'][s.subsidios % 3], 'bueno'); }
    if (tipo === 'impuesto') { const n = M.IMPUESTOS[s.impuestos % M.IMPUESTOS.length]; s.impuestos++; s.aprob = Math.max(0, s.aprob - 4); s.infl = Math.max(0.3, s.infl - 1.5); noticia(s, `Nuevo impuesto: «${n}». La recaudación sube y el humor baja.`, 'malo'); if (s.impuestos >= 10) M.logro(s, 'impuestazo'); }
    if (tipo === 'cadena') { s.cadenas++; s.prensa = Math.min(80, s.prensa + (s.min.propaganda ? 22 : 14)); const sale = s.cadenas % 4 !== 0 || Math.random() < 0.5; if (sale) { s.aprob = Math.min(100, s.aprob + 11 * (s.min.trolls ? 1.5 : 1)); noticia(s, 'Cadena nacional: hablaste 40 minutos sin parar. La aprobación sube (el rating no).', 'bueno'); } else { s.aprob = Math.max(0, s.aprob - 5); noticia(s, 'Otra cadena nacional… la gente se cansó de que le cortes la novela.', 'malo'); } M.logro(s, 'cadena'); }
    if (tipo === 'deuda') { const monto = M.montoDeuda(s); s.caja += monto; s.deuda += monto; s.deudaCuota = Math.ceil(s.deuda * 0.03); s.aprob = Math.max(0, s.aprob - 4); noticia(s, `Pediste plata al Fondo: entraron $ ${M.fmt(monto)}. Ahora pagás una cuota todos los meses.`, 'malo'); M.logro(s, 'deuda'); }
    if (tipo === 'cripto') { s.cripto = { meses: 2 + Math.floor(Math.random() * 3) }; noticia(s, 'Lanzaste GonzaCoin, la cripto nacional. En unos meses se sabrá si fue una genialidad o un papelón.'); }
    return true;
  };
  M.ascender = function (s) {
    const sig = M.CARGOS[s.cargo + 1]; if (!sig || s.usd < sig.usd || s.fin) return false;
    s.usd -= sig.usd; s.cargo++; s.aprob = Math.min(100, s.aprob + 5);
    noticia(s, `¡Asumiste como ${sig.n}! Jura con la mano en el bolsillo.`, 'bueno');
    if (s.cargo === M.CARGOS.length - 1) M.logro(s, 'procer');
    return true;
  };
  M.vip = function (s, id) {
    const v = M.VIP.find(x => x.id === id); if (!v || s.vip[id] || s.cargo < (v.cargo || 0) || s.fin) return false;
    if (s.usd < v.usd) return false;
    s.usd -= v.usd; s.vip[id] = true; noticia(s, `Te diste un lujo: ${v.n}. La oposición tomó nota.`, 'bueno'); M.logro(s, 'vip');
    if (M.LOGROS[id]) M.logro(s, id);                 // logros de jet / isla
    if (M.VIP.every(x => s.vip[x.id])) M.logro(s, 'vipTotal');
    return true;
  };
  M.quitarCeros = function (s) {
    if (s.cargo < 4 || s.precios < 1000 || s.fin) return false;
    const k = Math.pow(10, Math.floor(Math.log10(s.precios) / 3) * 3);
    s.precios /= k; s.caja /= k; s.ceros++; s.infl = Math.max(2, s.infl * 0.4); s.aprob = Math.min(100, s.aprob + 8);
    noticia(s, `Moneda nueva: le sacaste ${Math.round(Math.log10(k))} ceros. Billetes con próceres nuevos (vos).`, 'bueno'); M.logro(s, 'ceros'); return true;
  };

  /* ───── modo automático (AFK): el juego se juega solo ───── */
  // elige la mejor opción de un evento probándolas sobre una copia del estado
  M.autoEvento = function (s) {
    if (!s.evento) return;
    const e = M.EVENTOS.find(x => x.id === s.evento.id); if (!e) { s.evento = null; return; }
    let best = e.def, bestScore = -Infinity;
    for (let k = 0; k < e.op.length; k++) {
      let clon; try { clon = JSON.parse(JSON.stringify(s)); } catch (err) { break; }
      clon.evento = null;
      try { e.op[k].f(clon); } catch (err) { continue; }
      const ap = Math.max(0, Math.min(100, clon.aprob));
      const score = (s.aprob < 50 ? ap * 4 : ap) + Math.log10(1 + Math.max(0, clon.caja)) + Math.log10(1 + Math.max(0, clon.usd)) * 2;
      if (score > bestScore) { bestScore = score; best = k; }
    }
    M.elegir(s, best);
  };

  M.auto = function (s, dt) {
    if (s.fin || !s.autoOn) return;
    // imprime solo (unos 5 clics por segundo)
    s._ac = (s._ac || 0) + dt;
    while (s._ac >= 0.2) { s._ac -= 0.2; M.click(s); }
    // toma decisiones cada ~0,8 s
    s._at = (s._at || 0) + dt;
    if (s._at < 0.8) return; s._at = 0;

    if (s.evento) M.autoEvento(s);
    while (M.ascender(s)) { }                           // asciende todo lo que pueda
    if (s.cargo >= 4 && s.precios >= 1000) M.quitarCeros(s);
    // lujos VIP con los dólares que sobran
    { let mv = null; for (const v of M.VIP) if (!s.vip[v.id] && s.cargo >= (v.cargo || 0) && s.usd >= v.usd && (!mv || v.usd > mv.usd)) mv = v; if (mv) M.vip(s, mv.id); }

    // cuida la aprobación para no perder las elecciones
    const me = M.mesesEleccion(s);
    if (s.aprob < 42 || (me <= 10 && s.aprob < 50)) {
      if (!(s.subsidios < 6 && M.programa(s, 'subsidio'))) { if (!M.programa(s, 'plan')) M.programa(s, 'prensa'); }
    }
    const reserva = M.costoPlan(s) * (s.aprob < 55 ? 2 : 0.5);   // guarda más si la aprobación flojea

    // ministerios: siempre convienen
    for (const m of M.MINISTERIOS) if (!s.min[m.id] && s.cargo >= m.cargo) { const c = M.costoMin(s, m); if (s.caja - c >= reserva) M.ministerio(s, m.id); }
    // imprentas: compra la de mejor rendimiento por peso que pueda pagar
    for (let k = 0; k < 8; k++) {
      let mejor = null, mejorVal = 0;
      for (const g of M.IMPRENTAS) { if (s.cargo < g.cargo) continue; const c = M.costo(s, g); const val = g.prod / c; if (s.caja - c >= reserva && val > mejorVal) { mejor = g; mejorVal = val; } }
      if (!mejor) break; M.comprar(s, mejor.id);
    }
    // ñoquis baratos: suben el «retorno» a dólares
    if (M.costoNoqui(s) < M.porSeg(s) * 3 && s.caja - M.costoNoqui(s) >= reserva) M.noqui(s, 1);
  };

  /* ───── eventos al azar ───── */
  M.EVENTOS = [
    { id: 'periodista', t: 'Un periodista encontró a tus ñoquis', d: 'Tiene fotos de 40 empleados cobrando en una oficina vacía.', min: s => s.noquis >= 10,
      op: [{ n: 'Pagarle una pauta', f: s => { s.caja -= M.costoPrensa(s); return 'La nota salió en la sección de horóscopo.'; } }, { n: 'Negar todo', f: s => { s.aprob -= 7; return '«Son trabajadores de la mística», dijiste. No convenció.'; } }], def: 1 },
    { id: 'paro', t: 'Paro de transporte', d: 'Los choferes piden aumento porque el boleto no les alcanza ni para el boleto.',
      op: [{ n: 'Imprimir el aumento', f: s => { s.impresoMes += M.porSeg(s) * 60; s.aprob += 3; return 'Aumento otorgado. La maquinita tosió un poco.'; } }, { n: 'Decir que es político', f: s => { s.aprob -= 5; return 'Tres días sin colectivos. La gente caminó y se acordó de vos.'; } }], def: 1 },
    { id: 'mundial', t: '¡Ganamos el campeonato!', d: 'La selección salió campeona y el país es una fiesta.',
      op: [{ n: 'Feriado nacional', f: s => { s.aprob += 12; return 'Todos felices. Nadie se acordó de los precios por una semana.'; } }, { n: 'Sacarse la foto con la copa', f: s => { s.aprob += Math.random() < .5 ? 15 : -6; return Math.random() < .5 ? 'La foto se hizo viral (para bien).' : 'Los jugadores no te dejaron tocar la copa.'; } }], def: 0 },
    { id: 'fmi', t: 'Llaman del Fondo Internacional', d: 'Ofrecen un préstamo enorme a cambio de que dejes de imprimir.',
      op: [{ n: 'Aceptar', f: s => { s.caja += M.porSeg(s) * 300; s.infl = Math.max(0.5, s.infl * 0.6); s.aprob -= 5; return 'Llegó la plata. Prometiste ajuste «con sensibilidad».'; } }, { n: 'Cortarles el teléfono', f: s => { s.aprob += 4; return '«¡Patria sí!», gritaste. La maquinita siguió andando.'; } }], def: 1 },
    { id: 'apagon', t: 'Se cortó la luz en la Casa de Moneda', d: 'La maquinita está parada y los billetes no salen.',
      op: [{ n: 'Comprar un generador', f: s => { s.caja -= Math.min(s.caja, M.porSeg(s) * 40); return 'Volvió la emisión. El generador era usado.'; } }, { n: 'Imprimir a mano', f: s => { s.caja -= Math.min(s.caja, M.porSeg(s) * 90); return 'Tus asesores dibujaron billetes toda la noche. Algunos tienen faltas de ortografía.'; } }], def: 1 },
    { id: 'quinta', t: 'Escándalo: fiesta en la quinta', d: 'Se filtraron fotos de un asado con 200 invitados en plena crisis.',
      op: [{ n: 'Pedir disculpas en cadena', f: s => { s.aprob -= 4; return 'Lloraste en televisión. Algunos se conmovieron.'; } }, { n: 'Decir que era una reunión de trabajo', f: s => { s.aprob -= 10; return 'Nadie te creyó, pero el asado estaba bueno.'; } }], def: 1 },
    { id: 'rival', t: 'Un rival te denuncia', d: 'Dice que tu fortuna creció 4000 % en un año.', min: s => s.usd > 5,
      op: [{ n: 'Pagar buenos abogados', f: s => { const c = s.usd * 0.12; s.usd -= c; return `Te salió ${fmtUsd(c)}, pero la causa se archivó.`; } }, { n: 'Decir que es persecución', f: s => { s.aprob -= 6; if (Math.random() < .3) { s.usd *= 0.75; return 'El juez no te creyó: te embargaron una parte.'; } return 'Organizaste un acto de apoyo. Fueron tus ñoquis.'; } }], def: 1 },
    { id: 'cosecha', t: 'Cosecha récord', d: 'El campo tuvo un año espectacular y entran divisas.',
      op: [{ n: 'Ponerle retenciones', f: s => { s.caja += M.porSeg(s) * 120; s.aprob -= 2; return 'Ingresaron fondos. Los productores sacaron los tractores a la ruta.'; } }, { n: 'Dejarlos en paz', f: s => { s.infl = Math.max(0.5, s.infl - 1.5); s.aprob += 3; return 'Entraron dólares y la economía respiró.'; } }], def: 0 },
    { id: 'billete', t: 'Proponen un billete nuevo', d: 'Los billetes actuales ya no alcanzan ni para comprar billeteras.',
      op: [{ n: 'Billete con tu cara', f: s => { s.aprob -= 3; s.usd += Math.max(1, s.usd * 0.03); return 'Hay quejas, pero te queda lindo el perfil.'; } }, { n: 'Billete con animales', f: s => { s.aprob += 4; return 'El billete del carpincho es un éxito.'; } }], def: 1 },
    { id: 'encuesta', t: 'Sale una encuesta', d: 'Tu consultor ofrece «ajustar» los números antes de publicarlos.',
      op: [{ n: 'Publicarla tal cual', f: s => { s.aprob += s.aprob > 50 ? 3 : -2; return 'La verdad, a veces, sirve.'; } }, { n: 'Ajustarla', f: s => { s.prensa += 10; s.caja -= Math.min(s.caja, M.costoPrensa(s) * .5); return 'Salió que te aprueba el 87 %. Nadie conoce a nadie que te apruebe.'; } }], def: 0 },
    { id: 'dolar', t: 'El dólar celeste se dispara', d: 'En las cuevas lo cambian al doble que ayer.',
      op: [{ n: 'Poner un cepo', f: s => { s.aprob -= 5; s.infl = Math.max(0.5, s.infl - 2); return 'Nadie puede comprar dólares. Salvo vos, por supuesto.'; } }, { n: 'Mirar para otro lado', f: s => { s.infl += 4; return 'El dólar sigue subiendo. Los precios lo siguen de cerca.'; } }], def: 1 },
    { id: 'obra', t: 'Inauguración de obra', d: 'Terminaron un puente (que todavía no lleva a ningún lado).',
      op: [{ n: 'Inaugurarlo igual', f: s => { s.aprob += 5; s.caja -= Math.min(s.caja, M.porSeg(s) * 20); return 'Cortaste la cinta. El puente da a un campo de soja.'; } }, { n: 'Esperar a terminarlo', f: s => { s.aprob += 1; return 'Prudente. Aburrido, pero prudente.'; } }], def: 0 },
    { id: 'jubilados', t: 'Marcha de jubilados', d: 'Piden que la jubilación alcance para algo más que el boleto.', min: s => s.mes > 6,
      op: [{ n: 'Darles un bono', f: s => { s.caja -= Math.min(s.caja, M.costoPlan(s)); s.aprob += 6; s.infl += 0.5; return 'Bono otorgado. Te aplaudieron, con bastón.'; } }, { n: 'Mandarlos a esperar', f: s => { s.aprob -= 8; return 'Mala idea: los jubilados votan todos.'; } }], def: 1 },
    { id: 'inversor', t: 'Un inversor extranjero quiere venir', d: 'Promete una fábrica, pero pide reglas claras.',
      op: [{ n: 'Prometer reglas claras', f: s => { s.caja += M.porSeg(s) * 80; s.aprob += 2; return 'Vino, sacó una foto y se fue. Dejó algo de plata.'; } }, { n: 'Pedirle una «colaboración»', f: s => { s.usd += Math.max(0.5, s.usd * 0.05); s.aprob -= 3; return 'Colaboró. No volvió nunca más.'; } }], def: 0 },
    { id: 'famoso', t: 'Un famoso te banca en vivo', d: 'Un cantante muy conocido dice que sos “lo mejor que le pasó al país”.',
      op: [{ n: 'Subirlo al escenario', f: s => { s.aprob += Math.random() < .65 ? 9 : -5; return Math.random() < .65 ? 'El recital terminó con tu nombre coreado.' : 'Al otro día lo cancelaron y te arrastró.'; } }, { n: 'Agradecer de lejos', f: s => { s.aprob += 3; return 'Prudente: un tuit y nada más.'; } }], def: 1 },
    { id: 'nafta', t: 'Aumenta la nafta', d: 'Las petroleras quieren subir el combustible un 20 %.',
      op: [{ n: 'Congelar el precio', f: s => { s.caja -= Math.min(s.caja, M.porSeg(s) * 70); s.aprob += 4; return 'La nafta no sube. El subsidio, sí.'; } }, { n: 'Dejar que suba', f: s => { s.infl += 2; s.aprob -= 5; return 'Subió todo lo que viaja en camión, o sea, todo.'; } }], def: 1 },
    { id: 'hacker', t: 'Hackearon el Banco Central', d: 'Un adolescente entró a los sistemas y pide un rescate en cripto.',
      op: [{ n: 'Pagar el rescate', f: s => { s.caja -= Math.min(s.caja, M.porSeg(s) * 50); return 'Pagaste. El pibe devolvió todo y dejó una reseña de 5 estrellas.'; } }, { n: 'Ofrecerle trabajo', f: s => { s.aprob += 3; return 'Ahora es tu secretario de Ciberseguridad. Tiene 15 años.'; } }], def: 1 },
    { id: 'temporal', t: 'Temporal en el litoral', d: 'Se inundaron varios pueblos y piden ayuda urgente.', min: s => s.mes > 4,
      op: [{ n: 'Mandar ayuda ya', f: s => { s.caja -= Math.min(s.caja, M.porSeg(s) * 60); s.aprob += 7; return 'Fuiste con botas de goma y repartiste colchones. Buena imagen.'; } }, { n: 'Mandar un tuit', f: s => { s.aprob -= 6; return '«Fuerza» pusiste. No alcanzó.'; } }], def: 1 },
    { id: 'viaje', t: 'Gira por el exterior', d: 'Te invitan a una cumbre de presidentes muy importante.',
      op: [{ n: 'Ir a buscar inversiones', f: s => { s.caja += M.porSeg(s) * 100; s.aprob -= 2; return 'Volviste con fotos, un acuerdo y nueve valijas.'; } }, { n: 'Quedarte a gobernar', f: s => { s.aprob += 3; return '«Primero los problemas de casa», dijiste. Quedó bien.'; } }], def: 0 },
    { id: 'gremio', t: 'Paritarias con el gremio más duro', d: 'Piden un aumento que no entra en ninguna planilla.',
      op: [{ n: 'Darles el aumento', f: s => { s.impresoMes += M.porSeg(s) * 50; s.aprob += 2; return 'Firmaron contentos. La maquinita, menos.'; } }, { n: 'Ofrecer un bono único', f: s => { s.aprob -= 3; if (Math.random() < .4) { s.aprob -= 4; return 'No aceptaron: paro por 48 horas.'; } return 'A regañadientes, firmaron.'; } }], def: 1 },
    { id: 'loteria', t: 'Un jubilado ganó la lotería', d: 'Ganó un premio enorme y la prensa quiere tu reacción.',
      op: [{ n: 'Felicitarlo en persona', f: s => { s.aprob += 5; return 'Fuiste a su casa a tomar mate. La foto fue un éxito.'; } }, { n: 'Ponerle un impuesto al premio', f: s => { s.caja += M.porSeg(s) * 40; s.aprob -= 7; return 'Recaudaste, pero quedaste como el malo de la película.'; } }], def: 0 },
    { id: 'feria', t: 'Furor por el dólar en la feria', d: 'En una feria del pueblo empezaron a vender todo en dólares.',
      op: [{ n: 'Prohibirlo', f: s => { s.aprob -= 4; s.infl = Math.max(0.5, s.infl - 1); return 'Mandaste inspectores. Ahora venden en “puntos”.'; } }, { n: 'Dejar hacer', f: s => { s.infl += 2; return 'La feria dolarizada quedó más ordenada que la economía.'; } }], def: 0 },
    { id: 'mascota', t: 'Eligen la mascota nacional', d: 'Una encuesta quiere que adoptes un animal como símbolo del país.',
      op: [{ n: 'El carpincho', f: s => { s.aprob += 6; return 'El carpincho es un fenómeno. Hay peluches, remeras y memes.'; } }, { n: 'El hornero', f: s => { s.aprob += 2; return 'Clásico y tranquilo. A nadie le molesta.'; } }], def: 0 },
  ];
  M.lanzarEvento = function (s) {
    const pool = M.EVENTOS.filter(e => (!e.min || e.min(s)) && e.id !== s.ultEventoId);
    const e = pool[Math.floor(Math.random() * pool.length)];
    s.evento = { id: e.id, desde: s.t, vence: s.t + 14, def: e.def };
    s.ultEventoId = e.id; s.prox = s.t + 32 + Math.random() * 30;
  };
  M.elegir = function (s, k) {
    if (!s.evento) return null;
    const e = M.EVENTOS.find(x => x.id === s.evento.id); const ignorado = s.t >= s.evento.vence;
    s.evento = null; if (!e) return null;
    const txt = e.op[k].f(s); s.caja = Math.max(0, s.caja); s.usd = Math.max(0, s.usd); s.aprob = Math.max(0, Math.min(100, s.aprob));
    noticia(s, (ignorado ? '(No decidiste a tiempo) ' : '') + txt, '');
    return txt;
  };

  /* ───── logros ───── */
  M.LOGROS = {
    primero: 'Primer billete', mil: 'Mil pesos impresos', millon: 'Millonario (en pesos)', reelecto: 'Reelecto', hiper: 'Hiperinflación', ceros: 'Le sacaste los ceros',
    procer: 'Prócer en un billete', noquis100: 'Cien ñoquis', clicker: 'Mil clics en la maquinita',
    cadena: 'Cadena nacional', deuda: 'Fuiste al Fondo', cripto: 'GonzaCoin a la Luna', impuestazo: 'Diez impuestos nuevos', ejercito: 'Trescientos ñoquis', ricacho: 'Un palo verde (US$ 1 millón)',
    vip: 'Primer lujo VIP', vipTotal: 'Vida de lujo completa', jet: 'Jet privado', isla: 'Isla privada',
    campania: 'Diez actos de campaña', debatidor: 'Cinco debates presidenciales',
    federal: 'Un gobernador aliado', obrero: 'Primera obra pública',
    gestion: 'Un ministerio en nivel 5', gabinetazo: 'Todo el gabinete con presupuesto', decisor: 'Primera decisión ministerial',
  };
  M.logro = (s, id) => { if (s.logros[id]) return false; s.logros[id] = Date.now(); noticia(s, `🏆 Logro: ${M.LOGROS[id]}`, 'logro'); return true; };
  M.revisarLogros = s => {
    if (s.impresoTotal >= 1) M.logro(s, 'primero'); if (s.impresoTotal >= 1e3) M.logro(s, 'mil'); if (s.impresoTotal >= 1e6) M.logro(s, 'millon');
    if (s.noquis >= 100) M.logro(s, 'noquis100'); if (s.clicks >= 1000) M.logro(s, 'clicker');
    if (s.noquis >= 300) M.logro(s, 'ejercito'); if (s.usdTotal >= 1e6) M.logro(s, 'ricacho');
  };

  /* ───── ranking contra otros políticos (inventados) ───── */
  M.ranking = s => {
    const lista = M.RIVALES.map(r => ({ n: r.n, usd: r.usd0 * Math.pow(r.crece, s.mes) }));
    lista.push({ n: 'Vos', usd: s.usd, yo: true });
    return lista.sort((a, b) => b.usd - a.usd);
  };

  /* ───── formato ───── */
  const SUF = [[1e18, ' trillones'], [1e15, ' mil billones'], [1e12, ' billones'], [1e9, ' mil millones'], [1e6, ' millones']];
  function fmt(n) {
    if (!isFinite(n)) return '∞';
    const a = Math.abs(n);
    for (const [v, t] of SUF) if (a >= v) return (n / v).toLocaleString('es-AR', { maximumFractionDigits: n / v < 100 ? 2 : 0 }) + t;
    if (a < 100 && a % 1) return n.toLocaleString('es-AR', { maximumFractionDigits: 1 });
    return Math.floor(n).toLocaleString('es-AR');
  }
  function fmtUsd(n) { return 'US$ ' + (n < 100 ? n.toLocaleString('es-AR', { maximumFractionDigits: 2 }) : fmt(n)); }
  M.fmt = fmt; M.fmtUsd = fmtUsd; M.MES = MES; M.ELECCIONES = ELECCIONES;

  /* ───── guardar ───── */
  M.serializar = s => JSON.stringify(s);
  M.cargar = txt => { try { const s = JSON.parse(txt); if (!s || s.v !== 1) return null; return Object.assign(M.nuevo(), s); } catch (e) { return null; } };
  M.offline = function (s, seg) {
    seg = Math.min(seg, 2 * 3600); if (seg < 30 || s.fin) return 0;
    const g = M.porSeg(s) * seg * 0.4; const ret = g * M.retorno(s); s.caja += g - ret; s.usd += ret / M.dolar(s); s.usdTotal += ret / M.dolar(s); s.impresoTotal += g;
    return g;
  };

  /* ───── Etapa 1: economía argentina avanzada (indicadores derivados y conectados) ─────
     Son de SOLO LECTURA: se calculan a partir del estado real (inflación, precios, impuestos,
     subsidios, deuda, aprobación, cargo, actividad). Reflejan tus decisiones en vivo, sin tocar
     ninguna mecánica existente. */
  M.macro = function (s) {
    const cl = (v, a, b) => Math.max(a, Math.min(b, v));
    const im = s.infl;                                   // inflación mensual (%)
    const ia = (Math.pow(1 + im / 100, 12) - 1) * 100;   // inflación anual (%)
    const dolar = M.dolar(s);
    const act = M.porSeg(s) + 1;                          // proxy del tamaño de la economía
    const pbi = Math.max(1, (Math.log10(act + 10)) * (1 + s.cargo * 0.4) * (1 - cl(im * 0.012, 0, 0.5)));
    const crecimiento = cl(3.6 - im * 0.28 + s.subsidios * 0.15 - s.impuestos * 0.22 + (s.aprob - 50) * 0.03, -14, 9);
    const recaudacion = cl(20 + s.impuestos * 2.4 + pbi * 0.4, 10, 58);     // % del PBI
    const gasto = cl(24 + s.subsidios * 1.9 + s.noquis * 0.02 + (s.deuda > 0 ? 4 : 0), 15, 75);
    const fiscal = recaudacion - gasto;                  // + superávit · − déficit (% PBI)
    const riesgo = Math.round(cl(480 + im * 62 + (s.deuda > 0 ? 850 : 0) + Math.max(0, 60 - s.aprob) * 22 - crecimiento * 25, 180, 7500));
    const reservas = cl(42 + crecimiento * 2.5 - ia * 0.05 - (s.deuda > 0 ? 12 : 0) - Math.max(0, im - 8) * 1.2 + Math.max(0, fiscal), 0.3, 130);
    const desempleo = cl(6.5 + s.impuestos * 0.7 + Math.max(0, im - 5) * 0.3 - crecimiento * 0.5, 3, 38);
    const salarioReal = cl(100 - ia * 0.11 - desempleo * 0.4 + s.subsidios * 1.4, 28, 135);  // índice de poder de compra (100 = base)
    const pobreza = cl(24 + Math.max(0, ia - 30) * 0.07 + desempleo * 0.7 - s.subsidios * 0.6 - (salarioReal - 100) * 0.2, 5, 72);
    const salario = Math.round(350000 * s.precios * (salarioReal / 100));
    const jubilacion = Math.round(salario * 0.52);
    const brecha = dolar / (100 * s.precios);            // dólar vs "oficial"
    const expo = cl(5 + Math.log10(act) * 1.2 + (brecha - 1) * 3, 2, 32);   // US$ mil millones / mes aprox
    const impo = cl(6 + Math.log10(act) * 1.1 - (brecha - 1) * 2 + crecimiento * 0.4, 2, 32);
    const deudaUsd = s.deuda / dolar + Math.pow(10, Math.max(0, s.cargo - 2)) * 0.8;
    return { im, ia, dolar, pbi, crecimiento, recaudacion, gasto, fiscal, riesgo, reservas, desempleo, salarioReal, pobreza, salario, jubilacion, expo, impo, balanza: expo - impo, deudaUsd };
  };

  /* ───── Etapa 2: política, oposición y elecciones ─────
     M.politica es de SOLO LECTURA: calcula la intención de voto propia y de la oposición,
     la composición del Congreso, la gobernabilidad y el clima político a partir del estado real
     (aprobación, economía, mandatos). Las acciones M.acto y M.debate sí cambian la partida, pero
     son funciones nuevas que no tocan ninguna mecánica existente: operan sobre la aprobación, que
     es la que decide las elecciones del juego. */
  M.politica = function (s) {
    const cl = (v, a, b) => Math.max(a, Math.min(b, v));
    const mac = M.macro(s);
    if (!s.partido) s.partido = M.nombrePartido();
    // intención de voto propia: parte de la aprobación y la castiga la economía (inflación/pobreza), la ayuda el crecimiento
    let propia = cl(s.aprob * 0.74 + 6 - Math.max(0, mac.ia - 40) * 0.035 - Math.max(0, mac.pobreza - 25) * 0.22 + mac.crecimiento * 0.5, 3, 72);
    const resto = Math.max(0, 100 - propia);
    // la oposición se reparte el resto según su peso, con una oscilación suave por mes (determinística)
    let opo = M.PARTIDOS.map((p, i) => ({ n: p.n, ideo: p.ideo, bruto: p.peso * (1 + 0.14 * Math.sin((s.mes + i * 2) * 0.45)) }));
    const suma = opo.reduce((a, o) => a + o.bruto, 0) || 1;
    opo = opo.map(o => ({ n: o.n, ideo: o.ideo, voto: +(resto * o.bruto / suma).toFixed(1) }));
    propia = +propia.toFixed(1);
    const lider = opo.slice().sort((a, b) => b.voto - a.voto)[0];
    // Congreso: tu bloque crece con los mandatos ganados y la aprobación
    const oficialismo = Math.round(cl(22 + s.mandatos * 7 + (s.aprob - 50) * 0.26, 6, 70));
    const gobernabilidad = oficialismo >= 50 ? 'mayoría propia' : oficialismo >= 38 ? 'gobierna con aliados' : 'en minoría';
    const faltan = M.mesesEleccion(s);
    const gana = propia >= 40;
    const clima = mac.ia > 180 ? 'crisis' : s.aprob < 35 ? 'tensión' : s.aprob > 66 ? 'luna de miel' : 'normal';
    return { partido: s.partido, propia, oposicion: opo, lider, oficialismo, oposicionBancas: 100 - oficialismo, gobernabilidad, faltan, gana, clima };
  };
  M.costoActo = s => Math.ceil((300 + M.porSeg(s) * 130));
  M.acto = function (s) {
    if (s.fin) return false;
    const c = M.costoActo(s); if (s.caja < c) return false;
    s.caja -= c; s.actos = (s.actos || 0) + 1;
    const faltan = M.mesesEleccion(s);
    const bump = faltan <= 12 ? 7 : 4;                 // la campaña rinde más cerca de la elección
    s.aprob = Math.min(100, s.aprob + bump);
    s.impresoMes += c * 2;                              // financiar la campaña imprimiendo empuja la inflación
    noticia(s, ['Acto de campaña a estadio lleno: bombos, choripán y un escenario gigante.', 'Caravana por el centro: la militancia copó cinco cuadras.', 'Lanzaste la campaña con un spot tan pegadizo que ya nadie se lo saca de la cabeza.'][s.actos % 3], 'bueno');
    if (s.actos >= 10) M.logro(s, 'campania');
    return true;
  };
  M.costoDebate = s => Math.ceil((200 + M.porSeg(s) * 70));
  M.debate = function (s) {
    if (s.fin || M.mesesEleccion(s) > 6 || s.debateMes === s.mes) return false;  // solo cerca de la elección y uno por mes
    const c = M.costoDebate(s); if (s.caja < c) return false;
    s.caja -= c; s.debateMes = s.mes; s.debates = (s.debates || 0) + 1;
    const prob = Math.max(0.2, Math.min(0.86, 0.36 + (s.aprob - 45) * 0.008));   // te va mejor si venís bien
    if (Math.random() < prob) { s.aprob = Math.min(100, s.aprob + 9); s.prensa = Math.min(80, s.prensa + 12); noticia(s, 'Ganaste el debate: una frase tuya quedó de meme (del bueno) y la repiten en todos lados.', 'bueno'); }
    else { s.aprob = Math.max(0, s.aprob - 6); noticia(s, 'Te fue flojo en el debate: te quedaste sin respuestas y se notó en vivo.', 'malo'); }
    if (s.debates >= 5) M.logro(s, 'debatidor');
    return true;
  };

  /* ───── Etapa 3: provincias y federalismo ─────
     M.provincias es de SOLO LECTURA: arma la foto de las 24 jurisdicciones combinando sus datos
     fijos, lo que vos invertiste (s.prov) y la macro nacional (desempleo/pobreza regionales).
     Las acciones (transferir, negociar, obra) sí cambian la partida, pero son funciones nuevas:
     mueven la aprobación nacional (que define las elecciones) y el apoyo de cada gobernador. */
  M.provincias = function (s) {
    const cl = (v, a, b) => Math.max(a, Math.min(b, v));
    const mac = M.macro(s);
    if (!s.prov) s.prov = {};
    let aliados = 0, sumApoyo = 0, sumPob = 0, obrasTot = 0;
    const lista = M.PROVINCIAS.map(p => {
      const d = s.prov[p.id];
      const apoyo = cl(d ? d.apoyo : p.apoyo0, 0, 100);
      const invApro = d ? Math.min(20, d.aprob || 0) : 0;
      const obras = d ? (d.obras || 0) : 0;
      const mod = M.REGMOD[p.reg] || 1;
      const desempleo = cl(mac.desempleo * mod, 2, 45);
      const pobreza = cl(mac.pobreza * mod, 4, 82);
      const aprobProv = Math.round(cl(s.aprob * 0.6 + 18 + invApro - Math.max(0, mac.ia - 50) * 0.03, 3, 96));
      if (apoyo >= 60) aliados++;
      sumApoyo += apoyo * p.pob; sumPob += p.pob; obrasTot += obras;
      return { id: p.id, n: p.n, reg: p.reg, pob: p.pob, gob: p.gob, apoyo: Math.round(apoyo), aprobProv, desempleo, pobreza, obras };
    });
    const federal = Math.round(sumApoyo / (sumPob || 1));
    return { lista, aliados, federal, obrasTot, total: M.PROVINCIAS.length };
  };
  M.costoProvTransf = (s, p) => Math.ceil((150 + M.porSeg(s) * 22) * (1 + p.pob * 0.15));
  M.costoProvNego = (s, p) => Math.ceil((80 + M.porSeg(s) * 9) * (1 + p.pob * 0.1));
  M.costoProvObra = (s, p) => Math.ceil((400 + M.porSeg(s) * 60) * (1 + p.pob * 0.2));
  M.accionProv = function (s, id, accion) {
    if (s.fin) return false;
    const p = M.PROVINCIAS.find(x => x.id === id); if (!p) return false;
    if (!s.prov) s.prov = {};
    const d = s.prov[id] || (s.prov[id] = { apoyo: p.apoyo0, aprob: 0, obras: 0 });
    if (accion === 'transferir') {
      const c = M.costoProvTransf(s, p); if (s.caja < c) return false; s.caja -= c;
      d.apoyo = Math.min(100, d.apoyo + 8); d.aprob = Math.min(30, (d.aprob || 0) + 5); s.aprob = Math.min(100, s.aprob + 0.6);
      noticia(s, `Girás fondos a ${p.n}: el gobernador ${p.gob} te lo agradece en cadena.`, 'bueno');
      if (d.apoyo >= 60) M.logro(s, 'federal');
      return true;
    }
    if (accion === 'nego') {
      const c = M.costoProvNego(s, p); if (s.caja < c) return false; s.caja -= c;
      d.apoyo = Math.min(100, d.apoyo + 14); s.aprob = Math.max(0, s.aprob - 0.8);   // rosca: te cuesta imagen
      noticia(s, `Rosca con ${p.gob} (${p.n}): acordaron cargos y obras. Alguien filtró la foto.`, '');
      if (d.apoyo >= 60) M.logro(s, 'federal');
      return true;
    }
    if (accion === 'obra') {
      const c = M.costoProvObra(s, p); if (s.caja < c) return false; s.caja -= c;
      d.obras = (d.obras || 0) + 1; d.aprob = Math.min(30, (d.aprob || 0) + 9); d.apoyo = Math.min(100, d.apoyo + 4);
      s.aprob = Math.min(100, s.aprob + 1.4); s.impresoMes += c * 0.5;
      noticia(s, [`Inauguraste una ruta en ${p.n}: cortaste la cinta con casco.`, `Hospital nuevo en ${p.n}: foto con guardapolvo.`, `Escuela flamante en ${p.n}, con acto y bombos.`][d.obras % 3], 'bueno');
      M.logro(s, 'obrero');
      return true;
    }
    return false;
  };

  /* ───── Etapa 4: ministerios (carteras con presupuesto y decisiones propias) ─────
     Capa nueva, aparte de los "ministerios" que ya existían en el Gabinete (que son mejoras
     pasivas y NO se tocan). Cada cartera tiene un indicador derivado (0-100) que mejora con el
     presupuesto que le asignás y sigue a la macro nacional, más una decisión propia con efecto
     inmediato sobre la aprobación / caja / inflación (nada de esto altera el bucle del juego). */
  M.CARTERAS = [
    { id: 'eco', n: 'Economía', ic: '💵', ind: 'Gestión económica', calc: (s, n, m) => 40 + n * 5 - Math.max(0, m.im - 5) * 2 + m.fiscal * 0.8, dec: { n: 'Plan de estabilización', d: 'Baja la inflación de golpe, pero el ajuste te cuesta imagen.', k: s => { s.infl = Math.max(0.3, s.infl * 0.6); s.aprob -= 5; } } },
    { id: 'seg', n: 'Seguridad', ic: '🚔', ind: 'Seguridad', calc: (s, n, m) => 45 + n * 5 - Math.max(0, m.pobreza - 25) * 0.6, dec: { n: 'Operativo de saturación', d: 'Más patrullas en la calle: sube la aprobación un tiempo.', k: s => { s.aprob += 5; } } },
    { id: 'def', n: 'Defensa', ic: '🎖️', ind: 'Poder militar', calc: (s, n, m) => 35 + n * 6, dec: { n: 'Desfile militar', d: 'Aviones, tanques y banda. Queda bien en la foto.', k: s => { s.aprob += 3; } } },
    { id: 'sal', n: 'Salud', ic: '🏥', ind: 'Salud pública', calc: (s, n, m) => 42 + n * 5 - Math.max(0, m.pobreza - 25) * 0.4, dec: { n: 'Campaña de vacunación', d: 'Operativo sanitario nacional: la gente lo valora.', k: s => { s.aprob += 6; } } },
    { id: 'edu', n: 'Educación', ic: '📚', ind: 'Nivel educativo', calc: (s, n, m) => 44 + n * 5, dec: { n: 'Netbooks para todos', d: 'Una compu por alumno. Caro, pero muy popular.', k: s => { s.aprob += 6; s.impresoMes += M.porSeg(s) * 40; } } },
    { id: 'inf', n: 'Infraestructura', ic: '🏗️', ind: 'Infraestructura', calc: (s, n, m) => 38 + n * 6, dec: { n: 'Plan nacional de rutas', d: 'Asfalto por todo el país. Obra y votos.', k: s => { s.aprob += 5; } } },
    { id: 'tra', n: 'Transporte', ic: '🚌', ind: 'Transporte', calc: (s, n, m) => 40 + n * 5 + s.subsidios * 1.2, dec: { n: 'Subsidio al boleto', d: 'El colectivo sale dos pesos. La gente feliz, la caja no.', k: s => { s.aprob += 4; s.impresoMes += M.porSeg(s) * 50; } } },
    { id: 'ene', n: 'Energía', ic: '⚡', ind: 'Energía', calc: (s, n, m) => 40 + n * 6 - Math.max(0, m.im - 8) * 0.5, dec: { n: 'Tarifazo', d: 'Suben las tarifas: entra plata ya, pero bronca asegurada.', k: s => { s.caja += M.porSeg(s) * 120; s.aprob -= 6; } } },
    { id: 'des', n: 'Desarrollo Social', ic: '🤝', ind: 'Contención social', calc: (s, n, m) => 40 + n * 5 + s.subsidios * 1.5 - Math.max(0, m.pobreza - 25) * 0.5, dec: { n: 'Plan social de emergencia', d: 'Ayuda directa a los que menos tienen: sube la aprobación e imprime.', k: s => { s.aprob += 7; s.impresoMes += M.porSeg(s) * 60; } } },
    { id: 'rrss', n: 'Relaciones Exteriores', ic: '🌎', ind: 'Imagen internacional', calc: (s, n, m) => 40 + n * 6 - (m.riesgo > 2000 ? 15 : 0), dec: { n: 'Gira internacional', d: 'Buscás inversiones afuera: entra plata, pero te critican por viajar.', k: s => { s.caja += M.porSeg(s) * 100; s.aprob -= 2; } } },
    { id: 'jus', n: 'Justicia', ic: '⚖️', ind: 'Independencia judicial', calc: (s, n, m) => 36 + n * 5, dec: { n: 'Reforma judicial', d: 'Acomodás un par de jueces amigos: menos escándalos, más polémica.', k: s => { s.aprob -= 4; s.prensa = Math.min(80, s.prensa + 8); } } },
    { id: 'trab', n: 'Trabajo', ic: '👷', ind: 'Empleo', calc: (s, n, m) => 42 + n * 5 - m.desempleo * 0.6, dec: { n: 'Paritarias generosas', d: 'Aumento para todos los gremios: contentos, pero empuja precios.', k: s => { s.aprob += 5; s.impresoMes += M.porSeg(s) * 50; s.infl += 0.6; } } },
    { id: 'prod', n: 'Producción', ic: '🏭', ind: 'Producción', calc: (s, n, m) => 40 + n * 6 + m.crecimiento * 0.8, dec: { n: 'Incentivo a la industria', d: 'Créditos blandos para fábricas: más actividad a cambio de un costo.', k: s => { s.caja = Math.max(0, s.caja - M.porSeg(s) * 30); s.aprob += 3; } } },
  ];
  M.DEC_COOLDOWN = 6;   // meses entre decisiones de una misma cartera
  M.ministerios = function (s) {
    const mac = M.macro(s); if (!s.minist) s.minist = {};
    let sum = 0, totPres = 0;
    const lista = M.CARTERAS.map(c => {
      const d = s.minist[c.id]; const nivel = d ? d.nivel : 0;
      const val = Math.max(3, Math.min(100, Math.round(c.calc(s, nivel, mac))));
      const decMes = d && d.decMes != null ? d.decMes : -99;
      sum += val; totPres += nivel;
      return { id: c.id, n: c.n, ic: c.ic, ind: c.ind, nivel, val, decN: c.dec.n, decD: c.dec.d, espera: Math.max(0, M.DEC_COOLDOWN - (s.mes - decMes)) };
    });
    return { lista, gestion: Math.round(sum / M.CARTERAS.length), presupuesto: totPres, total: M.CARTERAS.length };
  };
  M.costoCartInv = (s, nivel) => Math.ceil((500 + M.porSeg(s) * 110) * Math.pow(1.6, nivel));
  M.costoCartDec = s => Math.ceil(300 + M.porSeg(s) * 60);
  M.invertirCartera = function (s, id) {
    if (s.fin) return false; const c = M.CARTERAS.find(x => x.id === id); if (!c) return false;
    if (!s.minist) s.minist = {}; const d = s.minist[id] || (s.minist[id] = { nivel: 0, decMes: -99 });
    if (d.nivel >= 10) return false;
    const cost = M.costoCartInv(s, d.nivel); if (s.caja < cost) return false; s.caja -= cost;
    d.nivel++; s.aprob = Math.min(100, s.aprob + 0.8);
    noticia(s, `Reforzaste el presupuesto del Ministerio de ${c.n} (nivel ${d.nivel}).`, 'bueno');
    if (d.nivel >= 5) M.logro(s, 'gestion');
    if (M.CARTERAS.every(x => s.minist[x.id] && s.minist[x.id].nivel >= 1)) M.logro(s, 'gabinetazo');
    return true;
  };
  M.decisionCartera = function (s, id) {
    if (s.fin) return false; const c = M.CARTERAS.find(x => x.id === id); if (!c) return false;
    if (!s.minist) s.minist = {}; const d = s.minist[id] || (s.minist[id] = { nivel: 0, decMes: -99 });
    if (d.nivel < 1) return false;                                   // hay que asignarle presupuesto primero
    if (s.mes - (d.decMes != null ? d.decMes : -99) < M.DEC_COOLDOWN) return false;   // en cooldown
    const cost = M.costoCartDec(s); if (s.caja < cost) return false; s.caja -= cost;
    d.decMes = s.mes; c.dec.k(s); s.caja = Math.max(0, s.caja); s.aprob = Math.max(0, Math.min(100, s.aprob));
    noticia(s, `${c.ic} Ministerio de ${c.n}: ${c.dec.n}.`, '');
    M.logro(s, 'decisor');
    return true;
  };

  // ponerse al día tras suspender/cerrar la PC: simula de golpe el tiempo que pasó.
  // con el modo automático, el bot juega ese rato (compra, asciende, gana elecciones y vuelve a empezar).
  M.avanzar = function (s, seg, auto) {
    if (!auto) return M.offline(s, seg);           // sin auto: solo la plata offline, no te morís estando afuera
    seg = Math.min(seg, 12 * 3600);                // tope: 12 horas por recuperación
    if (seg < 2) return 0;
    const paso = 2;                                // simula en pasos de 2 segundos
    let total = 0, prev = s.impresoTotal;
    for (let acc = 0; acc < seg; acc += paso) {
      if (s.fin) { Object.assign(s, M.renacer(s)); prev = 0; }   // si se le terminó la carrera, arranca otra
      M.paso(s, paso); M.auto(s, paso);
      total += Math.max(0, s.impresoTotal - prev); prev = s.impresoTotal;
    }
    return total;
  };
})();
