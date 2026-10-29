/* GonzaArena — la partida contra bots corre en un hilo aparte (Web Worker), así el dibujo no espera a la simulación */
importScripts('sim-map.js', 'sim-core.js', 'sim-champs.js', 'sim-bots.js');
const A = self.Arena;
let g = null, me = null, timer = null, last = 0, acc = 0, paused = false, evBuf = [];
function tick() {
  const now = performance.now(); let dt = (now - last) / 1000; last = now;
  if (paused || !g) return;
  acc += Math.min(dt, .25); let stepped = false, n = 0;
  while (acc >= A.TICK && n++ < 8) { g.step(); for (const e of g.drainEvents()) evBuf.push(e); acc -= A.TICK; stepped = true; }
  if (stepped) { postMessage({ t: 'snap', s: g.snapshot(me.team, me.id), ev: evBuf }); evBuf = []; }
}
onmessage = e => {
  const m = e.data;
  if (m.t === 'start') {
    g = new A.Game({ players: m.players, difficulty: m.diff, seed: m.seed }); me = g.champs.find(c => !c.bot);
    postMessage({ t: 'ready', me: me.id, team: me.team }); postMessage({ t: 'snap', s: g.snapshot(me.team, me.id), ev: [] });
    last = performance.now(); acc = 0; clearInterval(timer); timer = setInterval(tick, 1000 / 60);
  } else if (m.t === 'in') { if (g && me) g.input(me, m.o); }
  else if (m.t === 'pause') { paused = !!m.v; last = performance.now(); }
  else if (m.t === 'stop') { clearInterval(timer); g = null; close(); }
};
