/* GonzaOps · reglas del juego: jugadores, armas, economía, rondas, carga explosiva y granadas.
 * Es la «verdad» de la partida: corre en el servidor online (Node) o en un Worker para jugar contra bots.
 * Los jugadores humanos mandan su posición (con controles anti-trampa simples) y sus disparos;
 * el daño se calcula acá, con los rivales «rebobinados» al momento en que el jugador los vio.
 */
(function () {
  'use strict';
  const Ops = globalThis.Ops;
  const { mover, choca, rayo, libre, zonaEn, OJO, OJO_AG, ALTO, ALTO_AG } = Ops;

  const ARMAS = {
    cuchillo: { n: 'Cuchillo', slot: 2, precio: 0, dmg: 45, cad: 0.45, mele: true, vel: 1.04, recomp: 1500 },
    pampa: { n: 'Pampa 9', slot: 1, precio: 200, dmg: 30, cad: 0.15, carg: 12, res: 36, pen: 0.5, dec: 0.9, sp: 0.009, spMov: 0.03, rec: 0.014, vel: 1, recomp: 300, recarga: 2.1 },
    halcon: { n: 'Halcón .50', slot: 1, precio: 700, dmg: 58, cad: 0.32, carg: 7, res: 28, pen: 0.85, dec: 0.86, sp: 0.007, spMov: 0.06, rec: 0.045, vel: 0.97, recomp: 300, recarga: 2.2 },
    tero: { n: 'Tero SMG', slot: 0, precio: 1200, dmg: 26, cad: 0.078, carg: 30, res: 90, pen: 0.6, dec: 0.8, sp: 0.016, spMov: 0.035, rec: 0.008, vel: 0.98, recomp: 600, recarga: 2.1, auto: true },
    tala: { n: 'Tala 12', slot: 0, precio: 1100, dmg: 20, perdigones: 8, cad: 0.85, carg: 7, res: 28, pen: 0.6, dec: 0.55, sp: 0.055, spMov: 0.06, rec: 0.05, vel: 0.94, recomp: 900, recarga: 2.8 },
    ombu: { n: 'Ombú R4', slot: 0, precio: 2700, dmg: 34, cad: 0.1, carg: 30, res: 90, pen: 0.78, dec: 0.97, sp: 0.005, spMov: 0.09, rec: 0.011, vel: 0.88, recomp: 300, recarga: 2.4, auto: true },
    condor: { n: 'Cóndor L', slot: 0, precio: 4700, dmg: 118, cad: 1.45, carg: 5, res: 20, pen: 0.97, dec: 0.99, sp: 0.075, spMira: 0.0008, spMov: 0.2, rec: 0, vel: 0.82, recomp: 100, recarga: 3.4, mira: true },
  };
  const EQUIPO = { chaleco: { n: 'Chaleco', precio: 650 }, casco: { n: 'Chaleco + casco', precio: 1000 }, he: { n: 'Granada', precio: 300, max: 1 }, humo: { n: 'Humo', precio: 300, max: 1 }, flash: { n: 'Cegadora', precio: 200, max: 2 }, kit: { n: 'Kit para desactivar', precio: 400 } };
  const ARMA_ID = Object.keys(ARMAS); const ID_ARMA = Object.fromEntries(ARMA_ID.map((k, i) => [k, i]));
  const T = { compra: 7, ronda: 115, compraHasta: 22, finRonda: 5, medio: 6, bomba: 40, plantar: 3.2, desactivar: 10, desactivarKit: 5 };
  const DINERO = { inicio: 800, max: 16000, gana: 3250, pierde: 1400, racha: 500, plantar: 300, perdioPlantada: 800 };
  const VEL = 5.4;

  let sigId = 1;
  class Juego {
    constructor(o) {
      this.m = Ops.crearMapa();
      this.dif = o.dificultad || 'normal';
      this.paraGanar = o.paraGanar || 8;              // primero a 8 (o 5 en partida corta)
      this.medioEn = this.paraGanar - 1;              // cambio de lado
      this.rng = semilla(o.semilla || 1234);
      this.t = 0; this.ronda = 0; this.marc = [0, 0]; this.racha = [0, 0]; this.lado0 = 0; // lado de la escuadra 0 (0 Asalto · 1 Guardia)
      this.ev = []; this.sonidos = []; this.granadas = []; this.humos = []; this.items = []; this.hist = [];
      this.jug = (o.jugadores || []).map((j, i) => this.crearJugador(j, i));
      this.porId = new Map(this.jug.map(p => [p.id, p]));
      this.ganador = -1;
      this.nuevaRonda(true);
    }
    crearJugador(j, i) {
      return {
        id: i + 1, nombre: j.nombre || 'Jugador', squad: j.squad | 0, team: j.squad | 0, bot: !!j.bot, pid: j.pid || null, dueño: j.dueño || null,
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, suelo: true, yaw: 0, pitch: 0, ag: false, ca: false, mira: false,
        vivo: false, hp: 100, armor: 0, casco: false, dinero: DINERO.inicio, armas: [null, null, { a: 'cuchillo' }], sel: 1, gran: { he: 0, humo: 0, flash: 0 }, kit: false, bomba: false,
        kills: 0, muertes: 0, asist: 0, daño: new Map(), ultimoTiro: -9, recargando: 0, usando: false, prog: 0, flash: 0, gen: 0, presu: 0, ultSt: 0,
        bot_: {},
      };
    }
    emitir(e) { this.ev.push(e); }
    vaciarEventos() { const e = this.ev; this.ev = []; return e; }
    lado(p) { return p.squad === 0 ? this.lado0 : 1 - this.lado0; }
    vivos(team) { return this.jug.filter(p => p.vivo && p.team === team); }

    /* ───── rondas ───── */
    nuevaRonda(primera) {
      this.ronda++;
      for (const p of this.jug) p.team = this.lado(p);
      this.fase = 'compra'; this.tf = T.compra; this.inicioRonda = this.t;
      this.granadas = []; this.humos = []; this.items = []; this.sonidos = [];
      this.bomba = { estado: 'carga', quien: 0, x: 0, y: 0, z: 0, resta: 0, plantadaPor: 0 };
      const usados = [[], []];
      for (const p of this.jug) {
        const sobrevivio = p.vivo && !primera;
        if (!sobrevivio) { p.armas = [null, { a: 'pampa', c: 12, r: 36 }, { a: 'cuchillo' }]; p.gran = { he: 0, humo: 0, flash: 0 }; p.kit = false; if (!p.vivo) { p.armor = 0; p.casco = false; } }
        else for (const a of p.armas) if (a && ARMAS[a.a].carg) { a.c = ARMAS[a.a].carg; }
        if (primera) { p.armor = 0; p.casco = false; }
        const lista = this.m.spawns[p.team]; let k = usados[p.team].length % lista.length; usados[p.team].push(k);
        const s = lista[k];
        Object.assign(p, { x: s.x + (this.rng() - .5) * .4, y: 0, z: s.z + (this.rng() - .5) * .4, vx: 0, vy: 0, vz: 0, suelo: true, vivo: true, hp: 100, yaw: p.team === 0 ? 0 : Math.PI, pitch: 0, sel: p.armas[0] ? 0 : 1, recargando: 0, usando: false, prog: 0, flash: 0, bomba: false, ag: false, mira: false, presu: 0 });
        p.daño = new Map(); p.gen++; p.bot_ = {};
        this.emitir({ e: 'spawn', id: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, gen: p.gen });
      }
      const asalto = this.jug.filter(p => p.team === 0);
      if (asalto.length) { const humanos = asalto.filter(p => !p.bot); const pool = humanos.length && this.rng() < .5 ? humanos : asalto; const q = pool[Math.floor(this.rng() * pool.length)]; q.bomba = true; this.bomba.quien = q.id; }
      this.emitir({ e: 'ronda_ini', n: this.ronda });
    }
    terminarRonda(ganaLado, motivo) {
      if (this.fase !== 'juego') return;
      this.fase = 'fin_ronda'; this.tf = T.finRonda;
      const sq = this.lado0 === ganaLado ? 0 : 1; this.marc[sq]++;
      const pierde = 1 - ganaLado;
      for (const p of this.jug) {
        if (p.team === ganaLado) p.dinero += DINERO.gana;
        else { const r = Math.min(4, this.racha[pierde]); p.dinero += DINERO.pierde + r * DINERO.racha + (pierde === 0 && (this.bomba.estado === 'plantada' || this.bomba.estado === 'desactivada') ? DINERO.perdioPlantada : 0); }
        p.dinero = Math.min(DINERO.max, p.dinero);
      }
      this.racha[ganaLado] = 0; this.racha[pierde]++;
      this.emitir({ e: 'ronda_fin', gana: ganaLado, motivo, marc: this.marc.slice() });
      if (this.marc[sq] >= this.paraGanar) { this.ganador = sq; this.fase = 'fin'; this.tf = 12; this.emitir({ e: 'fin', gana: sq, marc: this.marc.slice() }); }
    }

    /* ───── paso de simulación (30 por segundo) ───── */
    step(dt = 1 / 30) {
      this.t += dt; this.tf -= dt;
      if (this.fase === 'compra' && this.tf <= 0) { this.fase = 'juego'; this.tf = T.ronda; this.emitir({ e: 'vamos' }); }
      else if (this.fase === 'juego' && this.tf <= 0 && this.bomba.estado !== 'plantada') this.terminarRonda(1, 'tiempo');
      else if (this.fase === 'fin_ronda' && this.tf <= 0) {
        const jugadas = this.marc[0] + this.marc[1];
        if (jugadas === this.medioEn && this.lado0 === 0 && !this.medioHecho) { this.medioHecho = true; this.fase = 'medio'; this.tf = T.medio; this.emitir({ e: 'medio' }); }
        else this.nuevaRonda();
      } else if (this.fase === 'medio' && this.tf <= 0) {
        this.lado0 = 1 - this.lado0; this.racha = [0, 0];
        for (const p of this.jug) { p.dinero = DINERO.inicio; p.vivo = false; p.armor = 0; p.casco = false; }
        this.nuevaRonda();
      }
      if (this.fase === 'fin') return;

      const congelado = this.fase === 'compra';
      for (const p of this.jug) {
        if (!p.vivo) continue;
        if (p.flash > 0) p.flash -= dt;
        if (p.recargando && this.t >= p.recargando) this.finRecarga(p);
        if (p.bot) Ops.Bots.pensar(this, p, dt, congelado);
        else { p.presu = Math.min(3, p.presu + VEL * 1.7 * dt); if (congelado) { /* el cliente no se mueve */ } }
        this.levantar(p);
        this.usar(p, dt);
      }
      this.pasoGranadas(dt);
      for (let i = this.humos.length - 1; i >= 0; i--) if ((this.humos[i].resta -= dt) <= 0) this.humos.splice(i, 1);
      if (this.bomba.estado === 'plantada') {
        this.bomba.resta -= dt;
        if (this.bomba.resta <= 0) this.explotarBomba();
      }
      if (this.fase === 'juego') {
        if (!this.vivos(1).length && this.jug.some(p => p.team === 1)) this.terminarRonda(0, 'eliminados');
        else if (!this.vivos(0).length && this.bomba.estado !== 'plantada' && this.jug.some(p => p.team === 0)) this.terminarRonda(1, 'eliminados');
      }
      // historial de posiciones (1 s) para el rebobinado de disparos
      const pos = new Float32Array(this.jug.length * 4);
      this.jug.forEach((p, i) => { pos[i * 4] = p.x; pos[i * 4 + 1] = p.y; pos[i * 4 + 2] = p.z; pos[i * 4 + 3] = p.ag ? 1 : 0; });
      this.hist.push({ t: this.t, pos }); if (this.hist.length > 32) this.hist.shift();
      this.sonidos = this.sonidos.filter(s => this.t - s.t < 1.5);
    }

    /* ───── mensajes de jugadores humanos ───── */
    entrada(p, m) {
      if (!p || !m) return;
      switch (m.t) {
        case 'st': {
          if (m.gen !== p.gen) return;
          p.yaw = num(m.yaw, p.yaw); p.pitch = Math.max(-1.5, Math.min(1.5, num(m.pitch, p.pitch)));
          p.ag = !!m.ag; p.ca = !!m.ca; p.mira = !!m.mira && p.sel === 0 && p.armas[0] && ARMAS[p.armas[0].a].mira;
          const sel = m.sel | 0; if (sel >= 0 && sel <= 3 && sel !== p.sel && (sel === 3 ? this.tieneGranada(p) : p.armas[sel])) { p.sel = sel; p.recargando = 0; }
          if (sel === 3 && ['he', 'humo', 'flash'].includes(m.gs)) p.gs = m.gs;
          if (!p.vivo || this.fase === 'compra' || this.fase === 'fin') { if (p.vivo && this.fase === 'compra') this.corregir(p, false); return; }
          const x = num(m.x, p.x), y = num(m.y, p.y), z = num(m.z, p.z);
          const d = Math.hypot(x - p.x, z - p.z);
          if (d > p.presu + 0.1 || y < -0.1 || y > 3.4 || choca(this.m, x, z, y)) { this.corregir(p, true); return; }
          p.presu -= d; p.vx = (x - p.x) * 30; p.vz = (z - p.z) * 30; p.x = x; p.y = y; p.z = z; p.suelo = !!m.su;
          if (d > 0.08 && !p.ca && !p.ag && p.suelo) this.ruido(p, 0.6);
          break;
        }
        case 'f': if (Array.isArray(m.d)) this.disparar(p, m.d.slice(0, 8).map(v => Array.isArray(v) ? v.map(Number) : [0, 0, 1]), num(m.rt, this.t)); break;
        case 'r': this.recargar(p); break;
        case 'g': if (Array.isArray(m.d)) this.lanzar(p, m.tipo, m.d.map(Number), !!m.suave); break;
        case 'u': p.usando = !!m.on; break;
        case 'c': this.comprar(p, String(m.item || '')); break;
        case 'x': this.soltar(p); break;
      }
    }
    corregir(p, mover) { if (mover !== false) this.emitir({ e: 'corr', id: p.id, x: p.x, y: p.y, z: p.z }); }
    ruido(p, fuerza) { this.sonidos.push({ x: p.x, z: p.z, t: this.t, team: p.team, id: p.id, f: fuerza }); }

    /* ───── armas ───── */
    armaEnMano(p) { return p.sel === 3 ? null : p.armas[p.sel]; }
    tieneGranada(p) { return p.gran.he + p.gran.humo + p.gran.flash > 0; }
    velMax(p) { const a = this.armaEnMano(p); let v = VEL * (a ? ARMAS[a.a].vel : 1); if (p.ca) v *= .52; if (p.ag) v *= .36; if (p.mira) v *= .6; return v; }
    recargar(p) {
      const a = this.armaEnMano(p); if (!p.vivo || !a || !ARMAS[a.a].carg || p.recargando || a.c >= ARMAS[a.a].carg || a.r <= 0) return;
      p.recargando = this.t + ARMAS[a.a].recarga; p.mira = false; this.emitir({ e: 'recarga', id: p.id });
    }
    finRecarga(p) {
      p.recargando = 0; const a = this.armaEnMano(p); if (!a || !ARMAS[a.a].carg) return;
      const falta = ARMAS[a.a].carg - a.c, pone = Math.min(falta, a.r); a.c += pone; a.r -= pone;
    }
    ojo(p, ag) { return p.y + (ag ? OJO_AG : OJO); }
    // dirs: lista de direcciones (una por perdigón). rt: momento del servidor que vio el jugador.
    disparar(p, dirs, rt) {
      if (!p.vivo || this.fase === 'compra' || this.fase === 'fin' || p.recargando) return false;
      const a = this.armaEnMano(p); if (!a) return false; const A = ARMAS[a.a];
      if (this.t - p.ultimoTiro < A.cad * (p.bot ? 1 : 0.75)) return false;
      p.ultimoTiro = this.t;
      const ox = p.x, oy = this.ojo(p, p.ag), oz = p.z;
      if (A.mele) {
        const d = norm(dirs[0]); let mejor = null, md = 2.0;
        for (const q of this.jug) {
          if (!q.vivo || q.team === p.team) continue;
          const dx = q.x - ox, dz = q.z - oz, dist = Math.hypot(dx, dz); if (dist > md) continue;
          if ((dx * d[0] + dz * d[2]) / (dist || 1) < 0.75) continue; md = dist; mejor = q;
        }
        this.emitir({ e: 'tiro', id: p.id, a: ID_ARMA[a.a], o: [ox, oy, oz], f: [] });
        if (mejor) { const espalda = Math.cos(mejor.yaw - p.yaw) > .5; this.herir(mejor, p, espalda ? 120 : A.dmg, a.a, false, 1, mejor.x, oy - .3, mejor.z); }
        return true;
      }
      if (a.c <= 0) { this.recargar(p); return false; }
      a.c--;
      const n = A.perdigones || 1, fines = [];
      const rew = p.bot ? null : this.rebobinar(rt);
      const golpes = new Map();
      for (let k = 0; k < n; k++) {
        const d = norm(dirs[Math.min(k, dirs.length - 1)] || [0, 0, 1]);
        const w = rayo(this.m, ox, oy, oz, d[0], d[1], d[2], 120); const tw = w.t;
        let best = null, bt = tw;
        for (let j = 0; j < this.jug.length; j++) {
          const q = this.jug[j]; if (!q.vivo || q === p || q.team === p.team) continue;
          const pos = rew ? rew(j) : [q.x, q.y, q.z, q.ag];
          const h = golpeCuerpo(ox, oy, oz, d, pos[0], pos[1], pos[2], pos[3]);
          if (h && h.t < bt) { bt = h.t; best = { q, h }; }
        }
        const fin = Math.min(bt, 120);
        fines.push([ox + d[0] * fin, oy + d[1] * fin, oz + d[2] * fin, best ? 1 : (tw < 120 ? 0 : -1)]);
        if (best) {
          const dist = best.h.t; const g = golpes.get(best.q) || { dmg: 0, cabeza: false, x: 0, y: 0, z: 0 };
          const mult = best.h.parte === 'cabeza' ? 4 : best.h.parte === 'piernas' ? 0.75 : 1;
          g.dmg += A.dmg * Math.pow(A.dec, dist / 10) * mult; g.cabeza = g.cabeza || best.h.parte === 'cabeza';
          g.x = ox + d[0] * dist; g.y = oy + d[1] * dist; g.z = oz + d[2] * dist; golpes.set(best.q, g);
        }
      }
      this.emitir({ e: 'tiro', id: p.id, a: ID_ARMA[a.a], o: [round2(ox), round2(oy), round2(oz)], f: fines.map(f => f.map(round2)) });
      this.ruido(p, 1);
      for (const [q, g] of golpes) this.herir(q, p, g.dmg, a.a, g.cabeza, A.pen, g.x, g.y, g.z);
      return true;
    }
    rebobinar(rt) {
      const h = this.hist; if (!h.length) return null;
      const t = Math.max(this.t - 0.3, Math.min(this.t, rt));
      let i = h.length - 1; while (i > 0 && h[i - 1].t > t) i--;
      const b = h[i], a = h[Math.max(0, i - 1)]; const k = b.t === a.t ? 1 : Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
      return j => { const n = j * 4; if (n >= a.pos.length || n >= b.pos.length) { const q = this.jug[j]; return [q.x, q.y, q.z, q.ag]; } return [a.pos[n] + (b.pos[n] - a.pos[n]) * k, a.pos[n + 1] + (b.pos[n + 1] - a.pos[n + 1]) * k, a.pos[n + 2] + (b.pos[n + 2] - a.pos[n + 2]) * k, (k < .5 ? a.pos[n + 3] : b.pos[n + 3]) > .5]; };
    }
    herir(q, p, dmg, arma, cabeza, pen, x, y, z) {
      if (!q.vivo) return;
      let hp = dmg;
      if (q.armor > 0 && (!cabeza || q.casco) && pen != null) { hp = dmg * pen; q.armor = Math.max(0, q.armor - Math.round(dmg * (1 - pen) * .5)); }
      hp = Math.max(1, Math.round(hp));
      q.hp -= hp; if (p) q.daño.set(p.id, (q.daño.get(p.id) || 0) + hp);
      this.emitir({ e: 'herido', id: q.id, por: p ? p.id : 0, dmg: hp, cab: !!cabeza, x: round2(x), y: round2(y), z: round2(z), hp: Math.max(0, q.hp) });
      if (q.bot) { q.bot_.atacadoPor = p ? p.id : 0; q.bot_.atacadoT = this.t; }
      if (q.usando) q.prog = 0;
      if (q.hp <= 0) this.matar(q, p, arma, cabeza);
    }
    matar(q, p, arma, cabeza) {
      q.vivo = false; q.hp = 0; q.muertes++; q.usando = false; q.prog = 0; q.recargando = 0;
      if (p && p !== q && p.team !== q.team) { p.kills++; p.dinero = Math.min(DINERO.max, p.dinero + (arma && ARMAS[arma] ? ARMAS[arma].recomp : 300)); }
      for (const [id, d] of q.daño) if (d >= 40 && (!p || id !== p.id)) { const a = this.porId.get(id); if (a && a.team !== q.team) a.asist++; }
      // tira el arma principal (o la pistola) y la carga
      const prim = q.armas[0] || (q.armas[1] && q.armas[1].a !== 'pampa' ? q.armas[1] : null);
      if (prim) this.items.push({ id: sigId++, a: prim.a, c: prim.c, r: prim.r, x: q.x, y: q.y, z: q.z, t: this.t });
      if (q.bomba) { q.bomba = false; Object.assign(this.bomba, { estado: 'suelo', quien: 0, x: q.x, y: q.y, z: q.z }); this.emitir({ e: 'bomba_cae' }); }
      this.emitir({ e: 'muerte', v: q.id, k: p ? p.id : 0, a: arma ? ID_ARMA[arma] ?? -1 : -1, cab: !!cabeza });
    }
    soltar(p) {
      const a = p.armas[p.sel]; if (!p.vivo || !a || p.sel > 1) return;
      const fx = Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      this.items.push({ id: sigId++, a: a.a, c: a.c, r: a.r, x: p.x + fx * 1.4, y: p.y, z: p.z + fz * 1.4, t: this.t, de: p.id });
      p.armas[p.sel] = null; p.sel = p.armas[0] ? 0 : p.armas[1] ? 1 : 2;
    }
    levantar(p) {
      if (this.bomba.estado === 'suelo' && p.team === 0 && Math.hypot(p.x - this.bomba.x, p.z - this.bomba.z) < 1.2) { p.bomba = true; Object.assign(this.bomba, { estado: 'carga', quien: p.id }); this.emitir({ e: 'bomba_toma', id: p.id }); }
      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i]; if (Math.hypot(p.x - it.x, p.z - it.z) > 1.1 || Math.abs(p.y - it.y) > 1.5) continue;
        if (it.de === p.id && this.t - it.t < 2) continue;
        const s = ARMAS[it.a].slot; if (p.armas[s]) continue;
        p.armas[s] = { a: it.a, c: it.c, r: it.r }; this.items.splice(i, 1);
        this.emitir({ e: 'toma', id: p.id, a: ID_ARMA[it.a] });
      }
    }
    comprar(p, item) {
      if (!p.vivo || !this.puedeComprar(p)) return;
      const A = ARMAS[item], E = EQUIPO[item];
      if (A && A.precio && p.dinero >= A.precio) {
        if (p.armas[A.slot] && p.armas[A.slot].a === item) return;
        if (p.armas[A.slot] && A.slot === 0) this.items.push({ id: sigId++, ...p.armas[A.slot], x: p.x, y: p.y, z: p.z, t: this.t, de: p.id });
        p.dinero -= A.precio; p.armas[A.slot] = { a: item, c: A.carg, r: A.res }; p.sel = A.slot; p.recargando = 0;
      } else if (E && p.dinero >= E.precio) {
        if (item === 'chaleco') { if (p.armor >= 100) return; p.armor = 100; }
        else if (item === 'casco') { if (p.armor >= 100 && p.casco) return; const precio = p.armor >= 100 ? 350 : E.precio; if (p.dinero < precio) return; p.dinero -= precio - E.precio; p.armor = 100; p.casco = true; }
        else if (item === 'kit') { if (p.team !== 1 || p.kit) return; p.kit = true; }
        else { if (p.gran[item] >= E.max || p.gran.he + p.gran.humo + p.gran.flash >= 4) return; p.gran[item]++; }
        p.dinero -= E.precio;
      } else return;
      this.emitir({ e: 'compra', id: p.id, item });
    }
    puedeComprar(p) { return (this.fase === 'compra' || (this.fase === 'juego' && this.t - this.inicioRonda < T.compra + T.compraHasta)) && zonaEn(this.m, p.x, p.z) === (p.team === 0 ? 1 : 2); }

    /* ───── carga explosiva ───── */
    usar(p, dt) {
      const b = this.bomba, quieto = Math.hypot(p.vx, p.vz) < 0.8 && p.suelo;
      if (p.team === 0 && p.bomba && p.usando && quieto && this.fase === 'juego') {
        const z = zonaEn(this.m, p.x, p.z);
        if (z === 3 || z === 4) {
          if (!p.prog) this.emitir({ e: 'plantando', id: p.id });
          p.prog += dt;
          if (p.prog >= T.plantar) {
            p.bomba = false; p.prog = 0; p.usando = false; p.dinero = Math.min(DINERO.max, p.dinero + DINERO.plantar);
            Object.assign(b, { estado: 'plantada', quien: 0, x: p.x, y: p.y, z: p.z, resta: T.bomba, sitio: z === 3 ? 'A' : 'B', plantadaPor: p.id });
            this.tf = Math.max(this.tf, 0); this.emitir({ e: 'plantada', id: p.id, x: p.x, y: p.y, z: p.z, sitio: b.sitio });
          }
          return;
        }
      }
      if (p.team === 1 && p.usando && quieto && b.estado === 'plantada' && Math.hypot(p.x - b.x, p.z - b.z) < 1.7 && Math.abs(p.y - b.y) < 1.6) {
        const otro = this.jug.find(o => o !== p && o.vivo && o.team === 1 && o.prog > 0); if (otro) return;
        if (!p.prog) this.emitir({ e: 'desactivando', id: p.id, kit: p.kit });
        p.prog += dt;
        if (p.prog >= (p.kit ? T.desactivarKit : T.desactivar)) { b.estado = 'desactivada'; p.prog = 0; this.emitir({ e: 'desactivada', id: p.id }); this.terminarRonda(1, 'desactivada'); }
        return;
      }
      p.prog = 0;
    }
    explotarBomba() {
      const b = this.bomba; b.estado = 'explotada';
      this.emitir({ e: 'explota', x: b.x, y: b.y, z: b.z });
      for (const q of this.jug) { if (!q.vivo) continue; const d = Math.hypot(q.x - b.x, q.z - b.z); if (d < 18) this.herir(q, null, d < 8 ? 500 : 500 * (1 - (d - 8) / 10), null, false, 1, q.x, q.y + 1, q.z); }
      if (this.fase === 'juego') this.terminarRonda(0, 'explota');
    }

    /* ───── granadas ───── */
    lanzar(p, tipo, d, suave) {
      if (!p.vivo || !['he', 'humo', 'flash'].includes(tipo) || p.gran[tipo] <= 0 || this.fase === 'compra' || this.fase === 'fin') return false;
      if (this.t - (p.ultimaGranada || -9) < 0.8) return false;
      p.ultimaGranada = this.t; p.gran[tipo]--;
      if (p.sel === 3 && !this.tieneGranada(p)) p.sel = p.armas[0] ? 0 : 1;
      d = norm(d); const v = suave ? 7 : 15;
      this.granadas.push({ id: sigId++, tipo, x: p.x + d[0] * .4, y: this.ojo(p, p.ag) - .1, z: p.z + d[2] * .4, vx: d[0] * v + p.vx * .5, vy: d[1] * v + 2, vz: d[2] * v + p.vz * .5, t: 0, de: p.id, team: p.team, quieta: 0 });
      this.emitir({ e: 'lanza', id: p.id, tipo });
      return true;
    }
    pasoGranadas(dt) {
      const m = this.m;
      for (let i = this.granadas.length - 1; i >= 0; i--) {
        const g = this.granadas[i]; g.t += dt;
        for (let s = 0; s < 2; s++) {
          const h = dt / 2; g.vy -= 20 * h;
          const sp = Math.hypot(g.vx, g.vy, g.vz); if (sp > 0.01) {
            const dx = g.vx / sp, dy = g.vy / sp, dz = g.vz / sp, paso = sp * h;
            const w = rayo(m, g.x, g.y, g.z, dx, dy, dz, paso + 0.08);
            if (w.t <= paso + 0.08) {
              g.x += dx * Math.max(0, w.t - 0.08); g.y += dy * Math.max(0, w.t - 0.08); g.z += dz * Math.max(0, w.t - 0.08);
              const nx = w.nx, ny = w.ny, nz = w.nz, dot = g.vx * nx + g.vy * ny + g.vz * nz;
              g.vx = (g.vx - 2 * dot * nx) * .45; g.vy = (g.vy - 2 * dot * ny) * .35; g.vz = (g.vz - 2 * dot * nz) * .45;
              if (ny > .5 && Math.abs(g.vy) < 1) { g.vy = 0; g.vx *= .7; g.vz *= .7; }
              if (Math.abs(g.vx) + Math.abs(g.vy) + Math.abs(g.vz) > 2) this.emitir({ e: 'rebote', x: round2(g.x), y: round2(g.y), z: round2(g.z) });
            } else { g.x += dx * paso; g.y += dy * paso; g.z += dz * paso; }
          }
          if (g.y < 0.05) { g.y = 0.05; if (g.vy < 0) g.vy = 0; }
        }
        const quieta = Math.hypot(g.vx, g.vy, g.vz) < 0.4;
        if (g.tipo === 'he' && g.t > 1.6) { this.explotarHE(g); this.granadas.splice(i, 1); }
        else if (g.tipo === 'flash' && g.t > 1.5) { this.explotarFlash(g); this.granadas.splice(i, 1); }
        else if (g.tipo === 'humo' && ((quieta && g.t > 0.6) || g.t > 3)) { this.humos.push({ x: g.x, y: g.y, z: g.z, resta: 17, de: g.de }); this.emitir({ e: 'humo', x: round2(g.x), y: round2(g.y), z: round2(g.z) }); this.granadas.splice(i, 1); }
      }
    }
    explotarHE(g) {
      this.emitir({ e: 'granada', tipo: 'he', x: round2(g.x), y: round2(g.y), z: round2(g.z) });
      const p = this.porId.get(g.de);
      for (const q of this.jug) {
        if (!q.vivo) continue; if (p && q.team === p.team && q !== p) continue;
        const d = Math.hypot(q.x - g.x, q.y + 1 - g.y, q.z - g.z); if (d > 7.5) continue;
        if (!libre(this.m, g.x, g.y + .2, g.z, q.x, q.y + 1, q.z)) continue;
        this.herir(q, p, 98 * (1 - d / 7.5), 'he', false, .5, q.x, q.y + 1, q.z);
      }
      this.ruidoEn(g.x, g.z, g.team);
    }
    explotarFlash(g) {
      this.emitir({ e: 'granada', tipo: 'flash', x: round2(g.x), y: round2(g.y), z: round2(g.z) });
      for (const q of this.jug) {
        if (!q.vivo) continue; const oy = this.ojo(q, q.ag);
        const dx = g.x - q.x, dy = g.y - oy, dz = g.z - q.z, d = Math.hypot(dx, dy, dz); if (d > 28) continue;
        if (!libre(this.m, q.x, oy, q.z, g.x, g.y + .1, g.z) || this.humoEntre(q.x, oy, q.z, g.x, g.y, g.z)) continue;
        const f = dirVista(q.yaw, q.pitch), dot = (f[0] * dx + f[1] * dy + f[2] * dz) / (d || 1);
        const fuerza = (dot > .4 ? 1 : dot > -.2 ? .45 : .15) * Math.max(0, 1 - d / 28);
        const seg = 4.2 * fuerza; if (seg < .3) continue;
        q.flash = Math.max(q.flash, seg); this.emitir({ e: 'flash', id: q.id, s: round2(seg) });
      }
    }
    ruidoEn(x, z, team) { this.sonidos.push({ x, z, t: this.t, team, id: 0, f: 1.4 }); }
    humoEntre(ax, ay, az, bx, by, bz) {
      for (const h of this.humos) { if (h.resta < 1 && h.resta > 0) continue; if (distSegmento(ax, ay, az, bx, by, bz, h.x, h.y + 1.3, h.z) < 3.9) return true; }
      return false;
    }
    // ¿p ve a q? (paredes, humo y ceguera) — lo usan los bots
    ve(p, q) {
      if (p.flash > 0.6) return false;
      const oy = this.ojo(p, p.ag);
      for (const hy of [q.y + (q.ag ? 1.0 : 1.5), q.y + .9]) if (libre(this.m, p.x, oy, p.z, q.x, hy, q.z) && !this.humoEntre(p.x, oy, p.z, q.x, hy, q.z)) return true;
      return false;
    }

    /* ───── lo que se manda a cada jugador ───── */
    info() { return this.jug.map(p => ({ id: p.id, n: p.nombre, sq: p.squad, bot: p.bot })); }
    foto(paraId) {
      const yo = this.porId.get(paraId);
      const jug = this.jug.map(p => [p.id, round2(p.x), round2(p.y), round2(p.z), round3(p.yaw), round3(p.pitch),
        (p.vivo ? 1 : 0) | (p.ag ? 2 : 0) | (p.ca ? 4 : 0) | (p.prog && p.team === 0 ? 8 : 0) | (p.prog && p.team === 1 ? 16 : 0) | (p.bomba ? 32 : 0) | (!p.suelo ? 64 : 0) | (p.mira ? 128 : 0) | (p.recargando ? 256 : 0) | (p.kit ? 512 : 0),
        p.hp, p.sel === 3 ? 100 + ['he', 'humo', 'flash'].indexOf(p.gs || 'he') : ID_ARMA[(p.armas[p.sel] || { a: 'cuchillo' }).a], p.team]);
      const b = this.bomba;
      const s = {
        t: round3(this.t), fase: this.fase, tf: round2(Math.max(0, this.tf)), ronda: this.ronda, marc: this.marc, lado0: this.lado0, para: this.paraGanar,
        jug, bomba: { e: b.estado, x: round2(b.x), y: round2(b.y), z: round2(b.z), q: b.quien, resta: round2(b.resta), sitio: b.sitio || '' },
        gran: this.granadas.map(g => [g.id, g.tipo, round2(g.x), round2(g.y), round2(g.z)]),
        humos: this.humos.map(h => [round2(h.x), round2(h.y), round2(h.z), round2(h.resta)]),
        items: this.items.map(i => [i.id, ID_ARMA[i.a], round2(i.x), round2(i.y), round2(i.z)]),
      };
      if (yo) s.yo = { id: yo.id, dinero: yo.dinero, armor: yo.armor, casco: yo.casco, sel: yo.sel, armas: yo.armas.map(a => a ? [ID_ARMA[a.a], a.c ?? -1, a.r ?? -1] : null), gran: yo.gran, kit: yo.kit, bomba: yo.bomba, compra: yo.vivo && this.puedeComprar(yo), prog: round2(yo.prog), rec: yo.recargando ? round2(yo.recargando - this.t) : 0, gen: yo.gen, flash: round2(Math.max(0, yo.flash)) };
      return s;
    }
    tabla() { return this.jug.map(p => [p.id, p.kills, p.muertes, p.asist, p.dinero]); }
  }

  /* ───── utilidades ───── */
  function golpeCuerpo(ox, oy, oz, d, x, y, z, ag) {
    const alto = ag ? ALTO_AG : ALTO, cabY = y + alto - 0.17;
    let mejor = null;
    // cabeza (esfera)
    const cx = ox - x, cy = oy - cabY, cz = oz - z, b = cx * d[0] + cy * d[1] + cz * d[2], c = cx * cx + cy * cy + cz * cz - 0.2 * 0.2, disc = b * b - c;
    if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t > 0) mejor = { t, parte: 'cabeza' }; }
    // cuerpo (cilindro vertical)
    const r = 0.32, a2 = d[0] * d[0] + d[2] * d[2];
    if (a2 > 1e-8) {
      const px = ox - x, pz = oz - z, b2 = px * d[0] + pz * d[2], c2 = px * px + pz * pz - r * r, disc2 = b2 * b2 - a2 * c2;
      if (disc2 >= 0) {
        for (const t of [(-b2 - Math.sqrt(disc2)) / a2, (-b2 + Math.sqrt(disc2)) / a2]) {
          if (t <= 0) continue; const hy = oy + d[1] * t;
          if (hy >= y && hy <= cabY - 0.18) { if (!mejor || t < mejor.t) mejor = { t, parte: hy - y < 0.8 * (alto / ALTO) ? 'piernas' : 'cuerpo' }; break; }
        }
      }
    }
    return mejor;
  }
  function dirVista(yaw, pitch) { const cp = Math.cos(pitch); return [Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp]; }
  function norm(d) { const l = Math.hypot(d[0], d[1], d[2]) || 1; return [d[0] / l, d[1] / l, d[2] / l]; }
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function round2(v) { return Math.round(v * 100) / 100; }
  function round3(v) { return Math.round(v * 1000) / 1000; }
  function semilla(s) { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function distSegmento(ax, ay, az, bx, by, bz, px, py, pz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, l2 = dx * dx + dy * dy + dz * dz || 1;
    const k = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / l2));
    return Math.hypot(ax + dx * k - px, ay + dy * k - py, az + dz * k - pz);
  }

  Object.assign(Ops, { ARMAS, EQUIPO, ARMA_ID, ID_ARMA, T, DINERO, VEL, Juego, golpeCuerpo, dirVista, norm, semilla, distSegmento });
})();
