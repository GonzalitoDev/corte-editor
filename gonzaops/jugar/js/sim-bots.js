/* GonzaOps · bots: compran, eligen un sitio, se mueven por el mapa, plantan, desactivan y pelean.
 * Ven solo lo que su vista permite (paredes, humo, cegadoras), reaccionan con demora y apuntan con error según la dificultad.
 */
(function () {
  'use strict';
  const Ops = globalThis.Ops;
  const DIF = {
    facil: { reac: 0.7, err: 0.085, giro: 4.5, rafaga: 3, cabeza: 0.15, oido: 16 },
    normal: { reac: 0.4, err: 0.045, giro: 7.5, rafaga: 5, cabeza: 0.35, oido: 24 },
    dificil: { reac: 0.22, err: 0.02, giro: 12, rafaga: 8, cabeza: 0.6, oido: 32 },
  };
  const ang = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  function planRonda(g) {
    if (g._planRonda === g.ronda) return; g._planRonda = g.ronda;
    g.plan = { sitio: g.rng() < 0.5 ? 'A' : 'B', rush: g.rng() < 0.3 };
    // la Guardia se reparte entre los dos sitios
    const guardia = g.jug.filter(p => p.team === 1); let i = 0;
    for (const p of guardia) { p.bot_.sitio = i % 2 === 0 ? 'A' : 'B'; i++; }
    const asalto = g.jug.filter(p => p.team === 0); i = 0;
    for (const p of asalto) { const rutas = g.m.rutas[g.plan.sitio]; p.bot_.ruta = rutas[i % rutas.length].slice(); i++; }
  }

  function comprar(g, p) {
    const b = p.bot_; if (b.comprado) return; b.comprado = true;
    const c = it => g.comprar(p, it);
    const tienePrim = !!p.armas[0];
    const pistola = g.ronda === 1 || (g.marc[0] + g.marc[1] === g.medioEn && g.lado0 === 1 && g.ronda === g.medioEn + 1);
    if (!tienePrim) {
      if (pistola) { if (p.dinero >= 650 && g.rng() < .6) c('chaleco'); else if (p.dinero >= 700) c('halcon'); }
      else if (p.dinero >= 5800 && g.dif !== 'facil' && g.rng() < .18) { c('condor'); c('casco'); }
      else if (p.dinero >= 3700) { c('ombu'); c('casco'); }
      else if (p.dinero >= 3350) { c('ombu'); c('chaleco'); }
      else if (p.dinero >= 2000 && g.rng() < .7) { c(g.rng() < .7 ? 'tero' : 'tala'); c('chaleco'); }
      else if (p.dinero >= 1500 && g.rng() < .3) c('tero');
    } else if (p.armor < 100 && p.dinero >= 1000) c('casco');
    if (p.team === 1 && p.dinero >= 400 && g.rng() < .5) c('kit');
    if (p.dinero >= 300 && g.rng() < .6) c(g.rng() < .5 ? 'he' : 'humo');
    if (p.dinero >= 200 && g.rng() < .4) c('flash');
  }

  function irA(g, p, x, z) {
    const b = p.bot_;
    if (b.dest && Math.hypot(b.dest.x - x, b.dest.z - z) < 1 && b.camino && g.t - b.caminoT < 6) return;
    b.dest = { x, z }; b.camino = Ops.camino(g.m, p.x, p.z, x, z) || []; b.paso = 0; b.caminoT = g.t;
  }

  function enemigoVisible(g, p, D) {
    let mejor = null, md = Infinity;
    const f = Ops.dirVista(p.yaw, 0);
    for (const q of g.jug) {
      if (!q.vivo || q.team === p.team) continue;
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz); if (d > 70) continue;
      const enCono = (f[0] * dx + f[2] * dz) / (d || 1) > 0.2 || d < 4 || (p.bot_.atacadoPor === q.id && g.t - p.bot_.atacadoT < 2);
      if (!enCono) continue;
      if (!g.ve(p, q)) continue;
      if (d < md) { md = d; mejor = q; }
    }
    return mejor;
  }

  function pensar(g, p, dt, congelado) {
    const D = DIF[g.dif] || DIF.normal, b = p.bot_;
    planRonda(g);
    if (congelado) { comprar(g, p); b.yawObj = p.yaw; return; }
    if (!b.comprado) comprar(g, p);

    // ─ percepción (10 veces por segundo) ─
    if (!b.proxVista || g.t >= b.proxVista) {
      b.proxVista = g.t + 0.1;
      const q = enemigoVisible(g, p, D);
      if (q) {
        if (b.enemigo !== q.id) { b.enemigo = q.id; b.vistoT = g.t; b.err = [(g.rng() - .5) * D.err * 4, (g.rng() - .5) * D.err * 3]; b.apCabeza = g.rng() < D.cabeza; }
        b.ultVisto = { x: q.x, y: q.y, z: q.z, t: g.t, id: q.id };
      } else if (b.enemigo && g.t - (b.ultVisto ? b.ultVisto.t : 0) > 0.4) b.enemigo = 0;
      // oído: disparos y pasos cercanos de rivales
      if (!b.enemigo) {
        for (const s of g.sonidos) {
          if (s.team === p.team || g.t - s.t > 0.6) continue;
          const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < D.oido * s.f) { b.oir = { x: s.x, z: s.z, t: g.t }; break; }
        }
      }
    }

    let dx = 0, dz = 0, saltar = false, mirarYaw = null, mirarPitch = 0;
    p.usando = false; p.ag = false; p.ca = false; p.mira = false;
    const vmax = g.velMax(p);
    const q = b.enemigo ? g.porId.get(b.enemigo) : null;
    const arma = g.armaEnMano(p);

    // ─ elegir arma ─
    if (p.sel !== 0 && p.armas[0] && p.armas[0].c + p.armas[0].r > 0 && !p.recargando) p.sel = 0;
    else if (p.sel === 0 && (!p.armas[0] || p.armas[0].c + p.armas[0].r <= 0)) p.sel = 1;
    if (p.sel === 2 || p.sel === 3) p.sel = p.armas[0] ? 0 : p.armas[1] ? 1 : 2;

    if (q && q.vivo) {
      // ─ combate ─
      const oy = g.ojo(p, p.ag), ty = q.y + (b.apCabeza ? (q.ag ? 1.15 : 1.62) : (q.ag ? 0.8 : 1.15));
      const ddx = q.x - p.x, ddz = q.z - p.z, ddy = ty - oy, dist = Math.hypot(ddx, ddz);
      const yawObj = Math.atan2(ddx, -ddz) + b.err[0] / Math.max(1, dist / 12), pitchObj = Math.atan2(ddy, dist) + b.err[1] / Math.max(1, dist / 12);
      mirarYaw = yawObj; mirarPitch = pitchObj;
      b.err[0] *= 0.93; b.err[1] *= 0.93; // va corrigiendo la puntería
      const listo = g.t - b.vistoT > D.reac * (p.team === 1 && Math.hypot(p.vx, p.vz) < 0.6 ? 0.65 : 1); // quien espera quieto reacciona antes
      const A = arma ? Ops.ARMAS[arma.a] : null;
      if (A && A.mira && dist > 10) p.mira = true;
      if (listo && A && Math.abs(ang(p.yaw - yawObj)) < 0.09 + 0.6 / Math.max(2, dist) && Math.abs(p.pitch - pitchObj) < 0.12) {
        if (arma.c > 0) {
          if (!b.rafagaHasta || g.t > b.rafagaHasta + 0.35) { b.rafagaHasta = g.t + (A.auto ? D.rafaga * A.cad : 0); }
          if (g.t <= b.rafagaHasta + 0.02 || !A.auto) {
            const disp = (A.mira ? (p.mira ? A.spMira : A.sp) : A.sp) * 1.3 + D.err * 0.25 + (b.tiros || 0) * A.rec * 0.5;
            const dirs = []; for (let k = 0; k < (A.perdigones || 1); k++) { const d = Ops.dirVista(p.yaw + (g.rng() - .5) * disp * 2, p.pitch + (g.rng() - .5) * disp * 2); dirs.push(d); }
            if (g.disparar(p, dirs, g.t)) b.tiros = (b.tiros || 0) + 1;
          } else b.tiros = 0;
        } else if (!p.recargando) { if (p.sel === 0 && p.armas[1] && p.armas[1].c > 0 && dist < 15) p.sel = 1; else g.recargar(p); }
      }
      // moverse mientras pelea: se agacha o hace pasos al costado
      if (g.dif !== 'facil' && A && A.auto && dist > 12 && g.rng() < 0.02) b.agacharse = g.t + 1.2;
      p.ag = b.agacharse > g.t;
      if (!p.ag && !(A && A.mira)) {
        if (!b.ladoHasta || g.t > b.ladoHasta) { b.lado = g.rng() < .5 ? -1 : 1; b.ladoHasta = g.t + .35 + g.rng() * .6; }
        const sx = Math.cos(yawObj), sz = Math.sin(yawObj);
        dx = sx * b.lado * vmax * .55; dz = sz * b.lado * vmax * .55;
      }
      // granada al último lugar donde lo vio, si está lejos
      if (p.gran.he && dist > 9 && dist < 26 && g.rng() < 0.004) lanzarHacia(g, p, 'he', q.x, q.z);
    } else {
      b.tiros = 0;
      // ─ objetivos ─
      const bom = g.bomba;
      let meta = null, quieto = false;
      if (arma && Ops.ARMAS[arma.a].carg && arma.c < Ops.ARMAS[arma.a].carg * 0.4 && !p.recargando && (!b.ultVisto || g.t - b.ultVisto.t > 1.5)) g.recargar(p);
      if (p.team === 0) {
        if (bom.estado === 'suelo') { const yo = cercano(g, 0, bom.x, bom.z); if (yo === p) meta = { x: bom.x, z: bom.z }; }
        if (!meta && p.bomba) {
          const s = g.m.sitios[g.plan.sitio]; const z = Ops.zonaEn(g.m, p.x, p.z);
          if (z === s.zona && Math.hypot(p.x - s.x, p.z - s.z) < 5) { quieto = true; p.usando = true; }
          else meta = rutaSiguiente(g, p, s);
        }
        if (!meta && !quieto) {
          if (bom.estado === 'plantada') { const v = g.m.vigilar[bom.sitio]; const k = p.id % v.length; meta = posCerca(v[k], bom, 0.5); if (Math.hypot(p.x - meta.x, p.z - meta.z) < 1.5) { quieto = true; mirarYaw = Math.atan2(g.m.medio.x - p.x, -(g.m.medio.z - p.z)); } }
          else { const s = g.m.sitios[g.plan.sitio]; meta = rutaSiguiente(g, p, s); if (!meta) { const v = g.m.vigilar[g.plan.sitio]; meta = v[p.id % v.length]; if (Math.hypot(p.x - meta.x, p.z - meta.z) < 1.5) quieto = true; } }
        }
      } else {
        if (bom.estado === 'plantada') {
          const yo = cercano(g, 1, bom.x, bom.z);
          if (yo === p) { if (Math.hypot(p.x - bom.x, p.z - bom.z) < 1.2) { quieto = true; p.usando = true; p.ag = true; } else meta = { x: bom.x, z: bom.z }; }
          else { const v = g.m.vigilar[bom.sitio]; meta = v[p.id % v.length]; if (Math.hypot(p.x - meta.x, p.z - meta.z) < 1.5) quieto = true; }
        } else {
          const s = b.sitio || 'A'; const v = g.m.vigilar[s]; meta = v[(p.id >> 1) % v.length];
          if (Math.hypot(p.x - meta.x, p.z - meta.z) < 1.2) { quieto = true; if (!b.mirarHold || g.t > b.mirarHoldT) { b.mirarHoldT = g.t + 2 + g.rng() * 3; const r = g.m.rutas[s][Math.floor(g.rng() * g.m.rutas[s].length)]; const pt = r[r.length - 1]; b.mirarHold = Math.atan2(pt.x - p.x, -(pt.z - p.z)) + (g.rng() - .5) * .5; } mirarYaw = b.mirarHold; }
        }
      }
      // granadas tácticas: el Asalto ciega/tapa al entrar al sitio; la Guardia tira a lo que escucha
      if (p.team === 0 && !b.granadaUsada && bom.estado !== 'plantada' && b.ruta && b.ruta.length === 0 && Math.hypot(p.x - g.m.sitios[g.plan.sitio].x, p.z - g.m.sitios[g.plan.sitio].z) < 22) {
        b.granadaUsada = true; const s = g.m.sitios[g.plan.sitio], v = g.m.vigilar[g.plan.sitio];
        if (p.gran.flash) lanzarHacia(g, p, 'flash', s.x, s.z); else if (p.gran.humo) { const k = v[p.id % v.length]; lanzarHacia(g, p, 'humo', k.x, k.z); }
      }
      if (p.team === 1 && b.oir && g.t - b.oir.t < 0.5 && !b.granadaUsada) {
        const d = Math.hypot(b.oir.x - p.x, b.oir.z - p.z);
        if (d > 8 && d < 24 && (p.gran.he || p.gran.flash || p.gran.humo)) { b.granadaUsada = true; lanzarHacia(g, p, p.gran.flash ? 'flash' : p.gran.he ? 'he' : 'humo', b.oir.x, b.oir.z); }
      }
      if (b.oir && g.t - b.oir.t < 2.5) { mirarYaw = Math.atan2(b.oir.x - p.x, -(b.oir.z - p.z)); }
      else if (b.ultVisto && g.t - b.ultVisto.t < 3) { mirarYaw = Math.atan2(b.ultVisto.x - p.x, -(b.ultVisto.z - p.z)); }
      if (meta && !quieto) {
        irA(g, p, meta.x, meta.z);
        const c = b.camino; while (c && b.paso < c.length && Math.hypot(c[b.paso].x - p.x, c[b.paso].z - p.z) < 0.7) b.paso++;
        const n = c && c[b.paso];
        if (n) {
          const ex = n.x - p.x, ez = n.z - p.z, d = Math.hypot(ex, ez) || 1;
          dx = ex / d * vmax; dz = ez / d * vmax;
          if (mirarYaw == null) mirarYaw = Math.atan2(ex, -ez);
          // atascado: vuelve a calcular
          if (!b.chk || g.t > b.chk.t + 1.2) { if (b.chk && Math.hypot(p.x - b.chk.x, p.z - b.chk.z) < 0.4) { b.dest = null; saltar = true; } b.chk = { x: p.x, z: p.z, t: g.t }; }
        }
      }
      if (quieto && p.team === 1 && g.dif !== 'facil') p.ag = g.rng() < 0.002 ? !p.ag : p.ag;
    }
    // separarse de los compañeros
    for (const o of g.jug) { if (o === p || !o.vivo) continue; const ex = p.x - o.x, ez = p.z - o.z, d = Math.hypot(ex, ez); if (d < 0.9 && d > 0.01) { dx += ex / d * 2; dz += ez / d * 2; } }

    // ─ girar la vista con velocidad limitada ─
    if (mirarYaw != null) { const dy = ang(mirarYaw - p.yaw); const m = D.giro * dt * (q ? 1 : 0.6); p.yaw = ang(p.yaw + Math.max(-m, Math.min(m, dy))); }
    const dp = mirarPitch - p.pitch, mp = D.giro * dt * 0.6; p.pitch += Math.max(-mp, Math.min(mp, dp));
    // ─ moverse ─
    const vel = Math.hypot(dx, dz); if (vel > vmax) { dx *= vmax / vel; dz *= vmax / vel; }
    if (p.usando) { dx = 0; dz = 0; }
    const ax = p.x, az = p.z;
    Ops.mover(g.m, p, dx, dz, dt, saltar);
    if (Math.hypot(p.x - ax, p.z - az) > 0.05 && !p.ca && !p.ag) g.ruido(p, 0.6);
  }

  function rutaSiguiente(g, p, sitio) {
    const b = p.bot_; const r = b.ruta;
    while (r && r.length && Math.hypot(r[0].x - p.x, r[0].z - p.z) < 2.5) r.shift();
    if (r && r.length) return r[0];
    if (Math.hypot(sitio.x - p.x, sitio.z - p.z) > 3) return { x: sitio.x + ((p.id * 37) % 5 - 2) * .6, z: sitio.z + ((p.id * 53) % 5 - 2) * .6 };
    return null;
  }
  function cercano(g, team, x, z) { let m = null, md = Infinity; for (const o of g.jug) { if (!o.vivo || o.team !== team) continue; const d = Math.hypot(o.x - x, o.z - z); if (d < md) { md = d; m = o; } } return m; }
  function posCerca(v, b, k) { return { x: v.x + (b.x - v.x) * k, z: v.z + (b.z - v.z) * k }; }
  function lanzarHacia(g, p, tipo, x, z) {
    const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    const pitch = Math.min(0.9, 0.15 + d / 60);
    const yaw = Math.atan2(dx, -dz);
    g.lanzar(p, tipo, Ops.dirVista(yaw, pitch), d < 10);
  }

  Ops.Bots = { pensar, DIF };
})();
