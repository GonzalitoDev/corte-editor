/* GonzaOps · partida contra bots en un hilo aparte (la misma simulación que usa el servidor online). */
importScripts('sim-mapa.js', 'sim-juego.js', 'sim-bots.js');
let g = null, yo = 0, loop = null, pausa = false, n = 0;
onmessage = e => {
  const m = e.data;
  if (m.t === 'start') {
    const jug = [];
    const nombres = ['Toro', 'Pampa', 'Gaucho', 'Yaguar', 'Halcón', 'Puma', 'Zorro', 'Cóndor', 'Lobo', 'Ñandú', 'Carancho', 'Tatú'];
    let k = 0;
    for (let sq = 0; sq < 2; sq++) for (let i = 0; i < 5; i++) {
      if (sq === m.squad && i === 0) jug.push({ nombre: m.nombre || 'Vos', squad: sq, bot: false });
      else jug.push({ nombre: nombres[k++ % nombres.length] + ' (bot)', squad: sq, bot: true });
    }
    g = new Ops.Juego({ jugadores: jug, dificultad: m.dif, paraGanar: m.paraGanar, semilla: (Math.random() * 1e9) | 0 });
    yo = g.jug.find(p => !p.bot).id;
    postMessage({ t: 'inicio', yo, info: g.info(), para: g.paraGanar });
    clearInterval(loop); n = 0;
    loop = setInterval(() => {
      if (pausa || !g) return;
      g.step(); n++;
      postMessage({ t: 'foto', s: g.foto(yo), ev: g.vaciarEventos() });
      if (n % 15 === 0) postMessage({ t: 'tabla', d: g.tabla() });
    }, 1000 / 30);
  } else if (m.t === 'in') { if (g) g.entrada(g.porId.get(yo), m.m); }
  else if (m.t === 'pausa') pausa = !!m.v;
  else if (m.t === 'stop') { clearInterval(loop); g = null; }
};
