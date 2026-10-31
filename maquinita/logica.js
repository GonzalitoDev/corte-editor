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
  ];
  M.MINISTERIOS = [
    { id: 'relato', n: 'Ministerio del Relato', d: 'Las operaciones de prensa rinden el doble.', costo: 2500, cargo: 1 },
    { id: 'tinta', n: 'Secretaría de Tinta y Papel', d: 'Todas las imprentas producen el doble.', costo: 4e4, cargo: 2 },
    { id: 'felicidad', n: 'Ministerio de la Felicidad', d: 'La aprobación sube un poco cada mes.', costo: 5e5, cargo: 3 },
    { id: 'secretos', n: 'Secretaría de Asuntos Reservados', d: '+6 puntos de «retorno» a tu bolsillo.', costo: 6e6, cargo: 4 },
    { id: 'celeste', n: 'Ministerio del Dólar Celeste', d: 'Cambiás tus pesos a un dólar 30 % más barato.', costo: 9e7, cargo: 5 },
    { id: 'tinta2', n: 'Ministerio de la Maquinita', d: 'Todas las imprentas producen el triple.', costo: 1.5e9, cargo: 6 },
    { id: 'estadistica', n: 'Instituto de Estadísticas Creativas', d: 'La inflación «medida» enoja la mitad a la gente.', costo: 2.5e10, cargo: 7 },
  ];
  M.IMPUESTOS = ['Tasa al viento del sur', 'Impuesto al mate compartido', 'Contribución por mirar el río', 'Tasa a los domingos lindos', 'Impuesto a la sobremesa', 'Tasa por tener razón', 'Gravamen al asado de los sábados', 'Impuesto a las vacaciones imaginadas', 'Tasa por respirar fuerte', 'Impuesto al chiste repetido', 'Contribución solidaria al tío que opina', 'Tasa a la siesta prolongada'];
  M.RIVALES = [
    { n: 'Cacho Balbuena', usd0: 2, crece: 1.06 }, { n: 'Doña Chela Montero', usd0: 20, crece: 1.055 }, { n: 'El Rulo Iturbe', usd0: 200, crece: 1.05 },
    { n: 'Pocho Ferreyra', usd0: 3e3, crece: 1.048 }, { n: 'Toto Zamudio', usd0: 4e4, crece: 1.045 }, { n: 'La Nena Garbarino', usd0: 6e5, crece: 1.042 },
    { n: 'Don Anselmo Quiroga', usd0: 9e6, crece: 1.04 }, { n: 'Los Hermanos Peralta', usd0: 1.5e8, crece: 1.038 },
  ];

  M.nuevo = function (contactos) {
    return {
      v: 1, t: 0, mes: 0, caja: 0, usd: 0, usdTotal: 0, impresoMes: 0, impresoTotal: 0, clicks: 0,
      infl: 2, precios: 1, aprob: 62, cargo: 0, imp: {}, min: {}, noquis: 0, impuestos: 0, subsidios: 0,
      congelado: 0, prensa: 0, ultEvento: 0, evento: null, histInfl: [2], noticias: [], logros: {}, mandatos: 0,
      contactos: contactos || 0, fin: null, ceros: 0, prox: 25 + Math.random() * 20, mejorUsd: 0,
    };
  };

  /* ───── números derivados ───── */
  const multCargo = s => Math.pow(2.4, s.cargo);
  M.multProd = s => multCargo(s) * (1 + 0.03 * s.contactos) * (s.min.tinta ? 2 : 1) * (s.min.tinta2 ? 3 : 1) * Math.pow(s.precios, 0.75);
  M.prodBase = s => M.IMPRENTAS.reduce((a, g) => a + (s.imp[g.id] || 0) * g.prod, 0);
  M.porSeg = s => M.prodBase(s) * M.multProd(s) * (1 + s.impuestos * 0.06);
  M.porClick = s => Math.max(1, (1 + M.prodBase(s) * 0.05) * multCargo(s) * (1 + 0.03 * s.contactos) * Math.pow(s.precios, 0.75));
  M.costo = (s, g) => Math.ceil(g.costo * Math.pow(1.15, s.imp[g.id] || 0) * s.precios);
  M.costoMin = (s, m) => Math.ceil(m.costo * s.precios);
  M.retorno = s => Math.min(0.3, 0.02 + s.noquis * 0.0025 + (s.min.secretos ? 0.06 : 0));   // parte que va a tu bolsillo
  M.dolar = s => 100 * s.precios * (s.min.celeste ? 0.7 : 1);
  M.costoNoqui = s => Math.ceil(80 * Math.pow(1.1, s.noquis) * s.precios);
  M.costoPlan = s => Math.ceil((40 + M.porSeg(s) * 25) * 1);
  M.costoPrensa = s => Math.ceil((60 + M.porSeg(s) * 18));
  M.costoCongelar = s => Math.ceil((150 + M.porSeg(s) * 40));
  M.costoSubsidio = s => Math.ceil((200 + M.porSeg(s) * 60));
  M.costoImpuesto = s => Math.ceil((100 + M.porSeg(s) * 10));
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
    if (s.prensa > 0) s.prensa = Math.max(0, s.prensa - dt * 0.15);
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
    // aprobación
    const ip = M.inflPercibida(s);
    let d = -Math.max(0, ip - 1.5) * 0.2 - s.noquis * 0.006 + s.subsidios * 0.55 + (s.min.felicidad ? 0.6 : 0) + s.prensa * 0.12 + (Math.random() - .5) * 0.6;
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
  M.renacer = s => { const c = s.contactos + (s.fin ? s.fin.contactos : M.contactosGanados(s)); const n = M.nuevo(c); n.logros = s.logros; n.mandatosTotales = (s.mandatosTotales || 0) + s.mandatos; noticia(n, `Volvés a la política con ${c} contactos: todo rinde un ${Math.round(c * 3)} % más.`, 'bueno'); return n; };

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
    const costos = { plan: M.costoPlan(s), prensa: M.costoPrensa(s), congelar: M.costoCongelar(s), subsidio: M.costoSubsidio(s), impuesto: M.costoImpuesto(s) };
    const c = costos[tipo]; if (c == null || s.caja < c) return false;
    if (tipo === 'congelar' && s.congelado > 0) return false;
    s.caja -= c;
    if (tipo === 'plan') { s.aprob = Math.min(100, s.aprob + 9); s.impresoMes += c * 4; noticia(s, 'Lanzaste el «Plan Platita»: bono para todos. La gente sonríe; los precios también.', 'bueno'); }
    if (tipo === 'prensa') { s.prensa = Math.min(60, s.prensa + (s.min.relato ? 20 : 10)); s.aprob = Math.min(100, s.aprob + (s.min.relato ? 8 : 4)); noticia(s, ['Los canales amigos dicen que la inflación es «una sensación».', 'Un panel de expertos explica que los precios en realidad bajaron.', 'Encuesta propia: 9 de cada 10 están chochos.'][Math.floor(Math.random() * 3)]); if (Math.random() < 0.12) { s.aprob -= 8; noticia(s, 'Se filtró que pagaste la nota: escándalo en las redes.', 'malo'); } }
    if (tipo === 'congelar') { s.congelado = 6; noticia(s, 'Precios congelados por 6 meses. Las góndolas, misteriosamente vacías.', 'bueno'); }
    if (tipo === 'subsidio') { s.subsidios++; s.aprob = Math.min(100, s.aprob + 2); noticia(s, ['Subsidio a la luz: la boleta llega en blanco.', 'Subsidio al colectivo: viaja hasta el perro.', 'Subsidio al gas: hasta los asados salen más baratos.'][s.subsidios % 3], 'bueno'); }
    if (tipo === 'impuesto') { const n = M.IMPUESTOS[s.impuestos % M.IMPUESTOS.length]; s.impuestos++; s.aprob = Math.max(0, s.aprob - 4); s.infl = Math.max(0.3, s.infl - 1.5); noticia(s, `Nuevo impuesto: «${n}». La recaudación sube y el humor baja.`, 'malo'); }
    return true;
  };
  M.ascender = function (s) {
    const sig = M.CARGOS[s.cargo + 1]; if (!sig || s.usd < sig.usd || s.fin) return false;
    s.usd -= sig.usd; s.cargo++; s.aprob = Math.min(100, s.aprob + 5);
    noticia(s, `¡Asumiste como ${sig.n}! Jura con la mano en el bolsillo.`, 'bueno');
    if (s.cargo === M.CARGOS.length - 1) M.logro(s, 'procer');
    return true;
  };
  M.quitarCeros = function (s) {
    if (s.cargo < 4 || s.precios < 1000 || s.fin) return false;
    const k = Math.pow(10, Math.floor(Math.log10(s.precios) / 3) * 3);
    s.precios /= k; s.caja /= k; s.ceros++; s.infl = Math.max(2, s.infl * 0.4); s.aprob = Math.min(100, s.aprob + 8);
    noticia(s, `Moneda nueva: le sacaste ${Math.round(Math.log10(k))} ceros. Billetes con próceres nuevos (vos).`, 'bueno'); M.logro(s, 'ceros'); return true;
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
  };
  M.logro = (s, id) => { if (s.logros[id]) return false; s.logros[id] = Date.now(); noticia(s, `🏆 Logro: ${M.LOGROS[id]}`, 'logro'); return true; };
  M.revisarLogros = s => {
    if (s.impresoTotal >= 1) M.logro(s, 'primero'); if (s.impresoTotal >= 1e3) M.logro(s, 'mil'); if (s.impresoTotal >= 1e6) M.logro(s, 'millon');
    if (s.noquis >= 100) M.logro(s, 'noquis100'); if (s.clicks >= 1000) M.logro(s, 'clicker');
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
})();
