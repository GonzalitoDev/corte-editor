/* GonzaArena — bots: juegan su carril, farmean, pelean cuando les conviene, se retiran con poca vida,
 * compran, hacen la jungla, van por el Dragón y el Coloso y, al final, empujan todos juntos.
 */
(function (root) {
  'use strict';
  const A = root.Arena = root.Arena || {};
  const M = A.MAP;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const DIFF = {
    facil: { think: .55, aim: 2.4, aggro: .75, react: .5, farm: .6 },
    normal: { think: .3, aim: 1.1, aggro: 1, react: .25, farm: .85 },
    dificil: { think: .18, aim: .35, aggro: 1.2, react: .12, farm: 1 },
  };

  /** reparte los roles del equipo: arriba, medio, abajo (tirador + soporte) y jungla */
  function assignRoles(g) {
    for (let team = 0; team < 2; team++) {
      const cs = g.champs.filter(c => c.team === team), need = ['mid', 'bot', 'top', 'sup', 'jg'];
      const taken = new Set(cs.filter(c => c.role).map(c => c.role));
      const pick = (c, prefs) => { for (const r of prefs) if (!taken.has(r)) { taken.add(r); c.role = r; return; } };
      for (const c of cs) if (!c.role && c.def.jungler && cs.length >= 5) pick(c, ['jg']);
      for (const c of cs) if (!c.role && c.def.support && cs.length >= 4) pick(c, ['sup']);
      for (const c of cs) if (!c.role && c.def.carry) pick(c, ['bot']);
      for (const c of cs) if (!c.role) pick(c, c.def.lanes.map(l => l === 'jg' ? 'jg' : l).concat(need));
      for (const c of cs) if (!c.role) c.role = 'mid';
    }
    g.rolesSet = true;
  }
  const laneOf = c => c.role === 'sup' ? 'bot' : c.role === 'jg' ? null : c.role;
  const enemyTowerNear = (g, c, x, z, pad = 0) => g.units.find(u => u.kind === 'tower' && !u.dead && u.team !== c.team && Math.hypot(u.x - x, u.z - z) <= u.range + pad);
  const allyMinionsIn = (g, team, tower) => g.units.filter(u => u.kind === 'minion' && !u.dead && u.team === team && dist(u, tower) <= tower.range + 1).length;

  function think(g, c) {
    if (!g.rolesSet) assignRoles(g);
    const D = DIFF[g.diff] || DIFF.normal, t = g.t;
    if (c.dead) { shop(g, c); return; }
    if (t < (c.nextThink || 0)) return;
    c.nextThink = t + D.think * (.8 + g.rnd() * .4);
    const fx = M.FOUNTAIN[c.team][0], fz = M.FOUNTAIN[c.team][1], atBase = Math.hypot(c.x - fx, c.z - fz) < 14;
    const hpR = c.hp / c.maxHp, vis = g.visible[c.team];
    const enemies = g.champs.filter(e => e.team !== c.team && !e.dead && vis.has(e.id) && g.targetable(e, c));
    const near = enemies.filter(e => dist(e, c) < 14).sort((a, b) => dist(a, c) - dist(b, c));
    const allies = g.champs.filter(a => a.team === c.team && !a.dead && a !== c && dist(a, c) < 14);
    if (atBase) { shop(g, c); if (hpR < .95 || c.mp < c.maxMp * .6) { if (c.order) g.input(c, { t: 'stop' }); return; } }
    if (c.recall) { if (near.length && near[0] && dist(near[0], c) < 10) g.input(c, { t: 'stop' }); else return; }
    if (c.potions.length && hpR < .55 && !(c.potionUntil > t)) g.input(c, { t: 'use' });
    // ¿huir?
    const low = hpR < .25 || (hpR < .38 && near.length > allies.length);
    if (low) {
      if (c.spells[1] <= t && hpR < .2 && near.length) g.input(c, { t: 'spell', s: 1, x: c.x, z: c.z });
      const threat = near[0];
      if (threat && dist(threat, c) < 7) {
        // escapar con un desplazamiento o destello hacia la base
        const esc = c.def.abilities.findIndex((ab, i) => ab.ai && (ab.ai.use === 'escape' || ab.ai.use === 'kite') && c.ranks[i] > 0 && c.cd[i] <= t);
        if (esc >= 0) g.input(c, { t: 'cast', s: esc, x: fx, z: fz });
        else if (c.spells[0] <= t && hpR < .15) g.input(c, { t: 'spell', s: 0, x: fx, z: fz });
        // controlar al que persigue
        useAbilities(g, c, threat, D, true);
      }
      if (!near.length && t - (c.hurtT || 0) > 2.5 && !c.recall) { g.input(c, { t: 'recall' }); return; }
      retreat(g, c); return;
    }
    // poco maná y nada que hacer: volver a la base
    if (c.mp < c.maxMp * .12 && !near.length && c.def.stats.mp > 0 && Math.hypot(c.x - fx, c.z - fz) > 40 && t - (c.hurtT || 0) > 3) { g.input(c, { t: 'recall' }); return; }
    // con mucho oro, volver a comprar si no hay peligro
    if (c.gold > 1500 && !near.length && Math.hypot(c.x - fx, c.z - fz) > 50 && t - (c.hurtT || 0) > 4 && nextItemCost(c) <= c.gold) { g.input(c, { t: 'recall' }); return; }

    // ¿estoy bajo una torre enemiga que me apunta (o sin minions propios que la distraigan)? salir
    const tw = g.units.find(u => u.kind === 'tower' && !u.dead && u.team !== c.team && dist(u, c) <= u.range + 1.5 && (u.target === c.id || allyMinionsIn(g, c.team, u) < 2));
    if (tw) {
      const killable = near[0] && near[0].hp < c.ad * 2 + 80 && dist(near[0], c) < c.range + 1 && c.hp > c.maxHp * .4 && tw.target !== c.id;
      if (!killable) { const dx = c.x - tw.x, dz = c.z - tw.z, d = Math.hypot(dx, dz) || 1, k = (tw.range + 4) / d; const [x, z] = M.nearestFree(tw.x + dx * k, tw.z + dz * k); g.input(c, { t: 'move', x, z }); return; }
    }
    // muchos minions enemigos pegándome con poca vida: un paso atrás
    if (hpR < .5) { const hitters = g.units.filter(u => u.kind === 'minion' && !u.dead && u.team !== c.team && u.target === c.id).length; if (hitters >= 3) { retreatStep(g, c); return; } }
    // ¿pelear con un campeón?
    const target = pickFight(g, c, near, allies, D);
    if (target) { fight(g, c, target, D); return; }
    // soporte: curar o escudar
    if (c.role === 'sup' || c.def.support) helpAllies(g, c);
    // objetivos grandes (dragón/coloso) en la segunda mitad
    if (objective(g, c, D)) return;
    if (c.role === 'jg' && t < 900) { jungle(g, c, D); return; }
    lane(g, c, D);
  }

  function retreatStep(g, c) { const [fx, fz] = M.FOUNTAIN[c.team], dx = fx - c.x, dz = fz - c.z, d = Math.hypot(dx, dz) || 1; const [x, z] = M.nearestFree(c.x + dx / d * 6, c.z + dz / d * 6); g.input(c, { t: 'move', x, z }); }
  function retreat(g, c) { const [x, z] = M.FOUNTAIN[c.team]; if (!c.order || c.order.t !== 'move' || Math.hypot(c.order.x - x, c.order.z - z) > 3) g.input(c, { t: 'move', x, z }); }
  function nextItemCost(c) { const k = c.def.items.find((it, i) => !c.items.includes(it) || c.def.items.slice(0, i).filter(x => x === it).length >= c.items.filter(x => x === it).length); return k ? A.ITEMS[k].cost : 1e9; }
  function shop(g, c) {
    if (!g.inShop(c)) return;
    if (c.potions.length < 2 && g.t < 600 && c.gold >= 50 && !c.items.includes('pocion') && c.items.length < 6) g.buy(c, 'pocion');
    for (const it of c.def.items) {
      const want = c.def.items.filter(x => x === it).length, have = c.items.filter(x => x === it).length;
      if (have >= want) continue;
      if (c.gold >= A.ITEMS[it].cost) { g.buy(c, it); continue; }
      // ahorrar para el objeto grande; si falta mucho, comprar algo chico que sume
      if (A.ITEMS[it].cost > 2000 && c.gold >= 350 && c.items.length < 5 && g.t < 1200) { const small = c.def.ranged && c.def.key !== 'ceibo' && c.def.key !== 'brasa' ? 'espada' : c.def.key === 'brasa' || c.def.key === 'ceibo' ? 'tomo' : 'cristal'; if (c.items.filter(x => x === small).length < 2) g.buy(c, small); }
      break;
    }
    // si el inventario está lleno, vender lo chico por algo mejor
    if (c.items.length >= 6 && c.gold > 2500) { const i = c.items.findIndex(k => A.ITEMS[k].cost < 500); if (i >= 0) g.sell(c, i); }
  }
  function power(g, list) { return list.reduce((s, u) => s + u.hp * (1 + u.level * .08) + (u.ad + u.ap) * 8, 0); }
  function pickFight(g, c, near, allies, D) {
    if (!near.length) return null;
    const mine = power(g, [c, ...allies.filter(a => near.some(e => dist(a, e) < 12))]), theirs = power(g, near.filter(e => dist(e, c) < 12));
    const tgt = near.slice().sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp) + (dist(a, c) - dist(b, c)) * .02)[0];
    if (!tgt) return null;
    const killable = tgt.hp < c.ad * 4 + c.ap * 2 + 150;
    const underTower = enemyTowerNear(g, c, tgt.x, tgt.z, 1);
    if (underTower && !(killable && c.hp > c.maxHp * .5) && allyMinionsIn(g, c.team, underTower) < 2) return null;
    const reach = c.range + 4 + (c.ranks.some((r, i) => r && c.cd[i] <= g.t) ? 3 : 0);
    if (dist(tgt, c) > reach && !killable) return null;
    if (mine * D.aggro >= theirs * .95 || killable) return tgt;
    return null;
  }
  function fight(g, c, tgt, D) {
    useAbilities(g, c, tgt, D, false);
    if (!c.order || c.order.t !== 'attack' || c.order.id !== tgt.id) g.input(c, { t: 'attack', id: tgt.id });
  }
  /** usa las habilidades contra un blanco según las pistas de cada una */
  function useAbilities(g, c, tgt, D, fleeing) {
    const t = g.t, d = dist(c, tgt);
    // apuntar con un poco de error y anticipando el movimiento
    const lead = (vSpeed) => { const v = tgt.moving ? g.msOf(tgt) : 0, tt = d / (vSpeed || 20); return [tgt.x + Math.sin(tgt.facing || 0) * v * tt + (g.rnd() - .5) * D.aim * 2, tgt.z + Math.cos(tgt.facing || 0) * v * tt + (g.rnd() - .5) * D.aim * 2]; };
    for (let i = 3; i >= 0; i--) {
      const ab = c.def.abilities[i]; if (!ab.ai || c.ranks[i] <= 0 || c.cd[i] > t) continue;
      const cost = ab.cost ? ab.cost[c.ranks[i] - 1] : 0; if (c.mp < cost) continue;
      const u = ab.ai.use, rr = ab.ai.range || ab.range || 0;
      if (fleeing && !(u === 'cc' || u === 'near' || u === 'ult_near' || u === 'shield' || u === 'stealth' || u === 'area')) continue;
      if ((u === 'poke' || u === 'cc' || u === 'area' || u === 'ult_area') && d <= rr) { const [x, z] = lead(20); g.input(c, { t: 'cast', s: i, x, z }); return; }
      if (u === 'engage' && d <= rr && !fleeing && c.hp > c.maxHp * .4) { g.input(c, { t: 'cast', s: i, x: tgt.x, z: tgt.z }); return; }
      if ((u === 'near' || u === 'ult_near') && d <= rr) { g.input(c, { t: 'cast', s: i, x: c.x, z: c.z }); return; }
      if (u === 'gapclose' && d <= rr && d > c.range + 1 && !fleeing) { g.input(c, { t: 'cast', s: i, x: tgt.x, z: tgt.z, id: tgt.id }); return; }
      if (u === 'ult_kill' && d <= rr && tgt.hp < tgt.maxHp * .55) { g.input(c, { t: 'cast', s: i, x: tgt.x, z: tgt.z, id: tgt.id }); return; }
      if (u === 'ult_snipe' && d <= rr && tgt.hp < tgt.maxHp * .5) { const [x, z] = lead(32); g.input(c, { t: 'cast', s: i, x, z }); return; }
      if (u === 'steroid' && d <= c.range + 2) { g.input(c, { t: 'cast', s: i, x: c.x, z: c.z }); return; }
      if (u === 'shield' && d < 8) { g.input(c, { t: 'cast', s: i, x: c.x, z: c.z }); return; }
      if (u === 'stealth' && (fleeing || d < 9)) { g.input(c, { t: 'cast', s: i, x: c.x, z: c.z }); return; }
      if (u === 'heal' && c.hp < c.maxHp * .6) { g.input(c, { t: 'cast', s: i, x: c.x, z: c.z, id: c.id }); return; }
      if (u === 'kite' && d < c.range * .5 && !fleeing) { const away = Math.atan2(c.x - tgt.x, c.z - tgt.z); g.input(c, { t: 'cast', s: i, x: c.x + Math.sin(away) * 4, z: c.z + Math.cos(away) * 4 }); return; }
    }
    // hechizo de curar en apuros
    if (c.spells[1] <= t && c.hp < c.maxHp * .22) g.input(c, { t: 'spell', s: 1, x: c.x, z: c.z });
  }
  function helpAllies(g, c) {
    const t = g.t;
    for (let i = 0; i < 4; i++) {
      const ab = c.def.abilities[i]; if (!ab.ai || c.ranks[i] <= 0 || c.cd[i] > t || c.mp < (ab.cost ? ab.cost[c.ranks[i] - 1] : 0)) continue;
      if (ab.ai.use === 'heal') { const a = g.champs.filter(a => a.team === c.team && !a.dead && dist(a, c) < ab.range && a.hp < a.maxHp * .6).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0]; if (a) { g.input(c, { t: 'cast', s: i, x: a.x, z: a.z, id: a.id }); return; } }
    }
  }
  /** jungla: limpiar campamentos del lado propio y, de vez en cuando, ir a ayudar a un carril */
  function jungle(g, c, D) {
    const t = g.t;
    // emboscada: un enemigo con poca vida cerca de un carril
    if (c.level >= 3 && t > (c.gankT || 0)) {
      const prey = g.champs.find(e => e.team !== c.team && !e.dead && g.visible[c.team].has(e.id) && e.hp < e.maxHp * .55 && dist(e, c) < 45 && !enemyTowerNear(g, c, e.x, e.z, 2));
      if (prey) { c.gankUntil = t + 12; c.gankT = t + 40; c.gankId = prey.id; }
    }
    if (c.gankUntil > t) { const p = g.byId.get(c.gankId); if (p && !p.dead) { if (!c.order || c.order.t !== 'amove' || dist({ x: c.order.x, z: c.order.z }, p) > 4) g.input(c, { t: 'amove', x: p.x, z: p.z }); return; } }
    // campamento más cercano vivo del lado propio
    const camps = g.camps.filter(k => k.side === c.team && k.alive.some(u => !u.dead));
    if (!camps.length) { lane(g, c, D, 'mid'); return; }
    const camp = camps.sort((a, b) => Math.hypot(a.at[0] - c.x, a.at[1] - c.z) - Math.hypot(b.at[0] - c.x, b.at[1] - c.z))[0];
    const cur = c.order && c.order.t === 'attack' ? g.byId.get(c.order.id) : null;
    const mon = cur && !cur.dead && cur.kind === 'monster' ? cur : camp.alive.filter(u => !u.dead).sort((a, b) => a.hp - b.hp)[0];
    if (dist(mon, c) < 9) { useAbilitiesOnMonster(g, c, mon); if (!c.order || c.order.id !== mon.id) g.input(c, { t: 'attack', id: mon.id }); }
    else if (!c.order || c.order.t !== 'move' || Math.hypot(c.order.x - camp.at[0], c.order.z - camp.at[1]) > 3) g.input(c, { t: 'move', x: camp.at[0], z: camp.at[1] });
  }
  function useAbilitiesOnMonster(g, c, mon) {
    for (let i = 0; i < 3; i++) { const ab = c.def.abilities[i]; if (!ab.ai || c.ranks[i] <= 0 || c.cd[i] > g.t || c.mp < c.maxMp * .35) continue; const u = ab.ai.use; if ((u === 'poke' || u === 'area' || u === 'near' || u === 'steroid' || u === 'gapclose') && dist(c, mon) < (ab.ai.range || 4)) { g.input(c, { t: 'cast', s: i, x: mon.x, z: mon.z, id: mon.id }); return; } }
  }
  /** Dragón y Coloso: si el equipo está entero y no se ve a los enemigos cerca, van juntos */
  function objective(g, c, D) {
    const t = g.t; if (t < 360) return false;
    const team = g.champs.filter(a => a.team === c.team && !a.dead && a.hp > a.maxHp * .5);
    if (team.length < 3) return false;
    for (const k of g.camps) {
      if (!k.epic || !k.alive.some(u => !u.dead)) continue;
      if (k.key === 'coloso' && (team.length < 4 || t < 900)) continue;
      // se decide cada tanto, para todo el equipo a la vez
      const key = 'obj_' + k.key + '_' + c.team; g.objPlan = g.objPlan || {};
      if (!g.objPlan[key] || g.objPlan[key].until < t) {
        const enemiesNear = g.champs.filter(e => e.team !== c.team && !e.dead && g.visible[c.team].has(e.id) && Math.hypot(e.x - k.at[0], e.z - k.at[1]) < 30).length;
        g.objPlan[key] = { go: enemiesNear === 0 && g.rnd() < .5, until: t + 25 };
      }
      if (!g.objPlan[key].go) continue;
      if (c.role === 'top' && c.level < 9 && k.key === 'dragon') continue;
      const mon = k.alive.find(u => !u.dead), d = dist(mon, c);
      const ready = g.champs.filter(a => a.team === c.team && !a.dead && dist(a, mon) < 14).length;
      if (d < 12 && ready >= 3) { if (!c.order || c.order.id !== mon.id) g.input(c, { t: 'attack', id: mon.id }); useAbilitiesOnMonster(g, c, mon); return true; }
      if (d >= 12) { if (!c.order || c.order.t !== 'move' || Math.hypot(c.order.x - k.at[0], c.order.z - k.at[1]) > 6) { const [x, z] = M.nearestFree(k.at[0] + (c.team ? 6 : -6), k.at[1] + (c.team ? 6 : -6)); g.input(c, { t: 'move', x, z }); } return true; }
      return true; // esperando al resto
    }
    return false;
  }
  /** carril: quedarse detrás de los minions propios, farmear, pegarle a las torres cuando es seguro */
  function lane(g, c, D, force) {
    const t = g.t;
    let L = force || laneOf(c) || 'mid';
    if (t > 960 && c.role !== 'top') L = 'mid';      // final: todos juntos por el medio
    if (c.role === 'jg' && t >= 900) L = 'mid';
    const dir = c.team ? -1 : 1, len = M.LANE[L].len;
    // frente de mis minions
    let front = null, fp = c.team ? 2 : -1;
    for (const u of g.units) { if (u.dead || u.kind !== 'minion' || u.team !== c.team || u.lane !== L) continue; const p = M.laneProgress(L, u.x, u.z).t; if (c.team ? p < fp : p > fp) { fp = p; front = u; } }
    // torre propia más adelantada del carril
    const myTowers = g.units.filter(u => u.kind === 'tower' && u.team === c.team && u.lane === L && !u.dead).map(u => M.laneProgress(L, u.x, u.z).t);
    const towerP = myTowers.length ? (c.team ? Math.min(...myTowers) : Math.max(...myTowers)) : (c.team ? .9 : .1);
    let goalP;
    if (front) goalP = fp - dir * (c.ranged ? 7 : 4) / len;
    else goalP = towerP - dir * 3 / len;
    if (c.role === 'sup') { const carry = g.champs.find(a => a.team === c.team && a.role === 'bot' && !a.dead); if (carry && dist(carry, c) > 4) { const p = M.laneProgress(L, carry.x, carry.z).t; goalP = p - dir * 2 / len; } }
    goalP = clamp(goalP, 0, 1);
    // farmear: minion enemigo con menos vida en alcance
    const reach = c.range + 8;
    const foes = g.units.filter(u => !u.dead && u.team !== c.team && u.team !== 2 && (u.kind === 'minion') && dist(u, c) < reach && g.visible[c.team].has(u.id) && !(enemyTowerNear(g, c, u.x, u.z, 1) && allyMinionsIn(g, c.team, enemyTowerNear(g, c, u.x, u.z, 1)) < 3));
    const tower = enemyTowerNear(g, c, c.x, c.z, 2);
    if (tower && allyMinionsIn(g, c.team, tower) < 2) { // bajo torre enemiga sin minions propios: atrás
      const [x, z] = M.lanePoint(L, clamp(M.laneProgress(L, tower.x, tower.z).t - dir * (tower.range + 4) / len, 0, 1)); g.input(c, { t: 'move', x, z }); return;
    }
    const carryNear = c.role === 'sup' && g.champs.some(a => a.team === c.team && a.role === 'bot' && !a.dead && dist(a, c) < 12);
    if (foes.length && g.rnd() < D.farm + .2) {
      const myDmg = c.ad * 100 / (100 + 0) * (1 - (1 - D.farm) * .5);
      // rematar: minions que mueren de un golpe (y los ranged cuentan el viaje de la flecha)
      const lastHit = foes.filter(u => u.hp <= myDmg * (c.ranged ? .95 : 1.05) + (u.hp < 60 ? 10 : 0)).sort((a, b) => dist(a, c) - dist(b, c))[0];
      const cur = c.order && c.order.t === 'attack' ? g.byId.get(c.order.id) : null;
      // seguir con el actual si ya está a medio golpe (cambiar cancela el ataque)
      if (cur && !cur.dead && cur.kind === 'minion' && foes.includes(cur) && (c.windup || (!lastHit && cur.hp > myDmg * 2.4) || cur === lastHit)) return;
      // sin remates a la vista: pegarle a los que tienen mucha vida (empujar sin robar el último golpe a los propios minions)
      const healthy = foes.filter(u => u.hp > myDmg * 2.6).sort((a, b) => dist(a, c) - dist(b, c))[0];
      const tgt = lastHit || (carryNear ? null : healthy);
      if (!tgt && foes.some(u => u.hp <= myDmg * 2.6)) { // esperar el remate cerca, dentro del alcance
        const f0 = foes.sort((a, b) => a.hp - b.hp)[0], d0 = dist(f0, c), want = c.range * .85;
        if (d0 > c.range + f0.r) { const k = (d0 - want) / d0; g.input(c, { t: 'move', x: c.x + (f0.x - c.x) * k, z: c.z + (f0.z - c.z) * k }); }
        else if (c.order && c.order.t === 'attack') g.input(c, { t: 'stop' });
        return;
      }
      if (tgt) {
        // limpiar la oleada con habilidades si sobra maná
        if (foes.length >= 3 && c.mp > c.maxMp * .6) for (let i = 0; i < 3; i++) { const ab = c.def.abilities[i]; if (ab.ai && (ab.ai.farm || ab.ai.use === 'area') && c.ranks[i] > 0 && c.cd[i] <= t) { g.input(c, { t: 'cast', s: i, x: tgt.x, z: tgt.z }); break; } }
        if (!c.order || c.order.id !== tgt.id) g.input(c, { t: 'attack', id: tgt.id }); return;
      }
    }
    // pegarle a estructuras cuando hay minions propios tanqueando
    const st = g.units.filter(u => !u.dead && u.team !== c.team && (u.kind === 'tower' || u.kind === 'inhib' || u.kind === 'nexus') && dist(u, c) < c.range + 8 && g.targetable(u, c)).sort((a, b) => dist(a, c) - dist(b, c))[0];
    if (st && (st.kind !== 'tower' || allyMinionsIn(g, c.team, st) >= 2 || (g.byId.get(st.target) || {}).kind === 'minion')) { if (!c.order || c.order.id !== st.id) g.input(c, { t: 'attack', id: st.id }); return; }
    // posicionarse
    const [x, z] = M.lanePoint(L, goalP), jit = ((c.id * 37) % 10 - 5) * .3;
    if (Math.hypot(c.x - x, c.z - z) > 2.5 && (!c.order || c.order.t !== 'move' || Math.hypot(c.order.x - x, c.order.z - z) > 3)) g.input(c, { t: 'move', x: x + jit, z: z - jit });
  }

  A.bots = { think, assignRoles, DIFF };
})(typeof globalThis !== 'undefined' ? globalThis : this);
