/* GonzaArena — motor de la partida: unidades, combate, minions, torres, jungla, oro, niveles, tienda y visión.
 * Corre a 30 pasos por segundo. En modo "contra bots" corre en el navegador; en línea, en el servidor.
 */
(function (root) {
  'use strict';
  const A = root.Arena = root.Arena || {};
  const M = A.MAP, TICK = 1 / 30;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const D2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  /* ── objetos de la tienda ── */
  const ITEMS = {
    pocion: { name: 'Poción de vida', cost: 50, desc: 'Cura 150 de vida en 12 s. Se gasta.', use: true, stack: 5 },
    espada: { name: 'Espada larga', cost: 350, ad: 10, desc: '+10 de ataque' },
    tomo: { name: 'Tomo de aprendiz', cost: 435, ap: 20, desc: '+20 de poder' },
    botas: { name: 'Botas ligeras', cost: 300, ms: .6, desc: '+12% de velocidad' },
    daga: { name: 'Daga veloz', cost: 300, asP: .12, desc: '+12% de vel. de ataque' },
    cota: { name: 'Cota de malla', cost: 300, armor: 15, desc: '+15 de armadura' },
    capa: { name: 'Capa antimagia', cost: 450, mr: 25, desc: '+25 de resistencia mágica' },
    cristal: { name: 'Cristal rubí', cost: 400, hp: 150, desc: '+150 de vida' },
    gema: { name: 'Gema del tiempo', cost: 900, hp: 150, cdr: .1, desc: '+150 de vida · 10% menos enfriamiento' },
    botasR: { name: 'Botas del viento', cost: 1100, ms: .9, cdr: .1, desc: '+18% de velocidad · 10% menos enfriamiento', boots: true },
    hoja: { name: 'Hoja del ocaso', cost: 3400, ad: 65, crit: .25, desc: '+65 de ataque · 25% de crítico' },
    arco: { name: 'Arco huracán', cost: 2800, ad: 25, asP: .4, ms: .3, desc: '+25 de ataque · +40% vel. de ataque' },
    sangre: { name: 'Sedienta', cost: 3000, ad: 55, ls: .15, desc: '+55 de ataque · 15% de robo de vida' },
    hacha: { name: 'Hacha del coloso', cost: 3100, ad: 40, hp: 400, cdr: .15, desc: '+40 de ataque · +400 de vida · 15% menos enfriamiento' },
    sombrero: { name: 'Sombrero del brujo', cost: 3600, ap: 110, apP: .3, desc: '+110 de poder · +30% de poder' },
    baculo: { name: 'Báculo de savia', cost: 2400, ap: 55, hp: 200, cdr: .15, desc: '+55 de poder · +200 de vida · 15% menos enfriamiento' },
    espinas: { name: 'Coraza de espinas', cost: 2700, armor: 70, hp: 350, thorns: .15, desc: '+70 de armadura · +350 de vida · devuelve daño' },
    manto: { name: 'Manto del espíritu', cost: 2900, mr: 65, hp: 400, desc: '+65 de res. mágica · +400 de vida' },
    corazon: { name: 'Corazón de piedra', cost: 3000, hp: 800, desc: '+800 de vida' },
  };
  const SHOP_ORDER = ['pocion', 'espada', 'tomo', 'botas', 'daga', 'cota', 'capa', 'cristal', 'gema', 'botasR', 'hoja', 'arco', 'sangre', 'hacha', 'sombrero', 'baculo', 'espinas', 'manto', 'corazon'];

  /* ── minions y monstruos ── */
  const MINION = {
    melee: { hp: 470, ad: 13, range: 1.6, as: .8, ms: 4.1, r: .75, gold: 21, xp: 60, armor: 0, mr: 0 },
    caster: { hp: 300, ad: 24, range: 6.5, as: .67, ms: 4.1, r: .65, gold: 14, xp: 30, armor: 0, mr: 0, ranged: true },
    siege: { hp: 900, ad: 42, range: 8, as: .5, ms: 4.1, r: 1.05, gold: 60, xp: 90, armor: 10, mr: 0, ranged: true },
    super: { hp: 1600, ad: 90, range: 1.8, as: .85, ms: 4.4, r: 1.15, gold: 40, xp: 90, armor: 30, mr: 0 },
  };
  const MONSTER = {
    golem: [{ hp: 1900, ad: 52, r: 1.6, gold: 95, xp: 160 }],
    brasero: [{ hp: 1900, ad: 55, r: 1.5, gold: 95, xp: 160 }],
    lobos: [{ hp: 1100, ad: 38, r: 1.2, gold: 55, xp: 90 }, { hp: 380, ad: 14, r: .8, gold: 15, xp: 30, off: [2.2, 1.4] }, { hp: 380, ad: 14, r: .8, gold: 15, xp: 30, off: [-1.4, 2.2] }],
    cuervos: [{ hp: 850, ad: 30, r: 1.1, gold: 45, xp: 80, ranged: true }, { hp: 300, ad: 12, r: .7, gold: 12, xp: 20, off: [2, 0], ranged: true }, { hp: 300, ad: 12, r: .7, gold: 12, xp: 20, off: [0, 2], ranged: true }, { hp: 300, ad: 12, r: .7, gold: 12, xp: 20, off: [-2, -.5], ranged: true }],
    rocosos: [{ hp: 1500, ad: 45, r: 1.5, gold: 70, xp: 120 }, { hp: 500, ad: 20, r: .9, gold: 18, xp: 30, off: [2.4, -1] }],
    dragon: [{ hp: 4200, ad: 120, r: 2.6, gold: 0, xp: 400, armor: 40, mr: 40, ranged: true }],
    coloso: [{ hp: 9500, ad: 210, r: 3.2, gold: 0, xp: 800, armor: 70, mr: 70 }],
  };

  let NEXT_ID = 1;
  class Game {
    /** opts: { players: [{ team: 0|1, champ, name, bot, pid }], difficulty, seed } */
    constructor(opts) {
      this.t = 0; this.units = []; this.byId = new Map(); this.projs = []; this.delayed = []; this.events = [];
      this.rnd = M.rng(opts.seed || (Date.now() & 0xffff)); this.diff = opts.difficulty || 'normal';
      this.team = [0, 1].map(() => ({ kills: 0, dragons: 0, colosoUntil: 0, towers: 0 }));
      this.winner = -1; this.firstBlood = false; this.wave = 0; this.nextWave = 25; this.champs = [];
      this.feed = []; this.visible = [new Set(), new Set()];
      this.setupStructures(); this.setupCamps();
      for (const p of opts.players) this.addChamp(p);
      this.computeVision();
    }
    /* ───── creación ───── */
    add(u) { u.id = NEXT_ID++; u.dead = false; u.st = { stun: 0, root: 0, silence: 0, stealth: 0, slow: [], haste: [], shield: [], dot: [], asb: [] }; u.atkT = 0; u.lastHit = null; this.units.push(u); this.byId.set(u.id, u); return u; }
    setupStructures() {
      for (let team = 0; team < 2; team++) {
        for (const lane of ['top', 'mid', 'bot']) {
          for (const [t, tier] of M.TOWER_T) { const [x, z] = M.lanePoint(lane, team ? 1 - t : t); this.add({ kind: 'tower', team, lane, tier, x, z, r: 1.6, maxHp: tier === 1 ? 3500 : tier === 2 ? 3300 : 3100, armor: 40, mr: 40, range: 8.6, ad: 150, as: .83, shots: 0 }); }
          const [x, z] = M.lanePoint(lane, team ? 1 - M.INHIB_T : M.INHIB_T); this.add({ kind: 'inhib', team, lane, x, z, r: 1.9, maxHp: 2600, armor: 20, mr: 20 });
        }
        for (const [x, z] of M.NEXUS_TOWERS[team]) this.add({ kind: 'tower', team, lane: 'base', tier: 4, x, z, r: 1.6, maxHp: 2800, armor: 40, mr: 40, range: 8.6, ad: 170, as: .83, shots: 0 });
        const [x, z] = M.NEXUS[team]; this.add({ kind: 'nexus', team, x, z, r: 3.2, maxHp: 5500, armor: 0, mr: 0, regen: 6 });
      }
      for (const u of this.units) u.hp = u.maxHp;
    }
    setupCamps() {
      this.camps = M.CAMPS.map(c => ({ ...c, respawn: 70, alive: [], at: c.at, spawnAt: 70 }));
      this.camps.push({ key: 'dragon', name: 'Dragón del río', at: M.DRAGON, side: 2, respawn: 240, spawnAt: 240, alive: [], epic: true });
      this.camps.push({ key: 'coloso', name: 'Coloso', at: M.COLOSO, side: 2, respawn: 300, spawnAt: 600, alive: [], epic: true });
    }
    spawnCamp(c) {
      const scale = 1 + Math.min(1.5, this.t / 900);
      c.alive = MONSTER[c.key].map((m, i) => {
        const off = m.off || [0, 0], x = c.at[0] + off[0], z = c.at[1] + off[1];
        return this.add({ kind: 'monster', team: 2, sub: c.key, big: i === 0, camp: c, x, z, hx: x, hz: z, r: m.r, maxHp: Math.round(m.hp * scale), hp: Math.round(m.hp * scale), ad: Math.round(m.ad * (1 + (scale - 1) * .6)), armor: m.armor || 15, mr: m.mr || 15, range: m.ranged ? 6 : m.r + 1, as: .8, ms: 4.4, gold: m.gold, xp: Math.round(m.xp * (1 + (scale - 1) * .3)), ranged: !!m.ranged, facing: 0 });
      });
      if (c.epic) this.ev({ t: 'msg', m: c.key === 'dragon' ? '¡Apareció el Dragón del río!' : '¡El Coloso despertó!' });
    }
    addChamp(p) {
      const def = A.CHAMPS[p.champ] || A.CHAMPS.brasa, [x, z] = M.FOUNTAIN[p.team];
      const c = this.add({
        kind: 'champ', team: p.team, champ: def.key, name: p.name || def.name, bot: !!p.bot, pid: p.pid || null, role: p.role || null,
        x: x + (this.champs.length % 5 - 2) * 1.5, z: z + (this.champs.length % 5 - 2) * -1.5, r: .9, level: 1, xp: 0, gold: 500, items: [], ranks: [0, 0, 0, 0], points: 1, cd: [0, 0, 0, 0], spells: [0, 0], kills: 0, deaths: 0, assists: 0, cs: 0, respawnAt: 0,
        ranged: def.ranged, path: [], order: null, facing: p.team ? 2.36 : -.79, buffs: {}, streak: 0, attackCount: 0, recall: 0, potions: [], autoLevel: p.bot || p.autoLevel !== false,
      });
      c.def = def; this.calc(c); c.hp = c.maxHp; c.mp = c.maxMp; this.champs.push(c);
      if (c.autoLevel) this.autoLevel(c);
      return c;
    }
    /* ───── estadísticas ───── */
    calc(c) {
      const d = c.def.stats, L = c.level - 1, it = c.items.map(k => ITEMS[k]).filter(Boolean), sum = k => it.reduce((s, i) => s + (i[k] || 0), 0);
      const tm = this.team[c.team], coloso = tm.colosoUntil > this.t;
      c.maxHp = Math.round(d.hp + d.hpL * L + sum('hp')); c.maxMp = Math.round(d.mp + d.mpL * L);
      c.ad = d.ad + d.adL * L + sum('ad') + (coloso ? 25 : 0);
      c.ap = (sum('ap') + (coloso ? 40 : 0)) * (1 + sum('apP'));
      c.armor = d.armor + d.armorL * L + sum('armor'); c.mr = d.mr + d.mrL * L + sum('mr');
      c.asBase = d.as * (1 + d.asL * L + sum('asP')); c.range = d.range; c.msBase = d.ms + sum('ms');
      c.crit = Math.min(1, sum('crit')); c.ls = sum('ls'); c.thorns = sum('thorns');
      c.cdr = Math.min(.4, sum('cdr') + (c.buffs.azul > this.t ? .15 : 0));
      c.dmgMul = 1 + tm.dragons * .06;
      c.bonusAd = c.ad - (d.ad + d.adL * L);
      if (c.hp > c.maxHp) c.hp = c.maxHp; if (c.mp > c.maxMp) c.mp = c.maxMp;
    }
    xpNeed(l) { return 180 + 100 * l; }
    giveXp(c, n) {
      if (c.level >= 18) return; c.xp += n;
      while (c.level < 18 && c.xp >= this.xpNeed(c.level)) {
        c.xp -= this.xpNeed(c.level); const hpR = c.hp / c.maxHp, mpR = c.mp / (c.maxMp || 1);
        c.level++; c.points++; this.calc(c); c.hp = Math.round(c.maxHp * hpR + 40); c.mp = Math.round(c.maxMp * mpR + 20); if (c.hp > c.maxHp) c.hp = c.maxHp; if (c.mp > c.maxMp) c.mp = c.maxMp;
        this.ev({ t: 'lvl', id: c.id, l: c.level });
        if (c.autoLevel) this.autoLevel(c);
      }
    }
    canRank(c, s) { const r = c.ranks[s]; if (c.points <= 0) return false; if (s === 3) return r < 3 && c.level >= [6, 11, 16][r]; return r < 5 && r < Math.ceil(c.level / 2); }
    levelUp(c, s) { if (!this.canRank(c, s)) return false; c.ranks[s]++; c.points--; return true; }
    autoLevel(c) {
      const order = c.def.levelOrder || [0, 1, 2];
      let guard = 20;
      while (c.points > 0 && guard--) {
        if (this.levelUp(c, 3)) continue;
        // primero una de cada, después subir en el orden preferido
        let done = false; for (const s of [0, 1, 2]) if (c.ranks[s] === 0 && this.levelUp(c, s)) { done = true; break; }
        if (done) continue; for (const s of order) if (this.levelUp(c, s)) { done = true; break; }
        if (!done) break;
      }
    }
    /* ───── consultas ───── */
    alive(u) { return u && !u.dead; }
    isEnemy(a, b) { return a.team !== b.team; }
    targetable(u, by) {
      if (!u || u.dead) return false;
      if (u.kind === 'champ' && u.st.stealth > this.t && by && by.team !== u.team && dist(u, by) > 2.5) return false;
      if (u.kind === 'tower' || u.kind === 'inhib' || u.kind === 'nexus') return this.structureOpen(u);
      return true;
    }
    /** las estructuras se pueden atacar en orden: exterior → interior → inhibidor → base */
    structureOpen(u) {
      if (u._openT === this.t) return u._open;
      u._openT = this.t; return (u._open = this._structureOpen(u));
    }
    _structureOpen(u) {
      const same = k => this.units.filter(v => v.team === u.team && k(v));
      if (u.kind === 'tower') {
        if (u.tier === 1) return true;
        if (u.tier <= 3) return same(v => v.kind === 'tower' && v.lane === u.lane && v.tier === u.tier - 1 && !v.dead).length === 0;
        return same(v => v.kind === 'inhib' && v.dead).length > 0;
      }
      if (u.kind === 'inhib') return same(v => v.kind === 'tower' && v.lane === u.lane && !v.dead).length === 0;
      if (u.kind === 'nexus') return same(v => v.kind === 'tower' && v.tier === 4 && !v.dead).length === 0;
      return true;
    }
    inRange(x, z, r, filter) { const out = []; for (const u of this.units) if (!u.dead && (u.x - x) ** 2 + (u.z - z) ** 2 <= (r + (u.r || 0)) ** 2 && (!filter || filter(u))) out.push(u); return out; }
    enemiesIn(x, z, r, team, opts = {}) { return this.inRange(x, z, r, u => u.team !== team && (u.kind === 'champ' || u.kind === 'minion' || u.kind === 'monster' || (opts.structures && (u.kind === 'tower' || u.kind === 'inhib' || u.kind === 'nexus') && this.structureOpen(u))) && (opts.champsOnly ? u.kind === 'champ' : true) && (u.kind !== 'champ' || u.st.stealth <= this.t || opts.reveal)); }
    alliesIn(x, z, r, team, champsOnly) { return this.inRange(x, z, r, u => u.team === team && (champsOnly ? u.kind === 'champ' : (u.kind === 'champ' || u.kind === 'minion'))); }
    ev(e) { this.events.push(e); }
    log(m) { this.feed.push({ t: this.t, m }); this.ev({ t: 'feed', m }); }

    /* ───── estados ───── */
    status(u, kind, dur, val) {
      if (u.dead) return; const until = this.t + dur;
      if (kind === 'stun' || kind === 'root' || kind === 'silence' || kind === 'stealth') { u.st[kind] = Math.max(u.st[kind], until); if (kind === 'stun') { u.windup = 0; if (u.recall) this.cancelRecall(u); if (u.dash && u.dash.interruptible) u.dash = null; } }
      else if (kind === 'slow') u.st.slow.push({ v: val, until });
      else if (kind === 'haste') u.st.haste.push({ v: val, until });
      else if (kind === 'asb') u.st.asb.push({ v: val, until });
      this.ev({ t: 'st', id: u.id, k: kind, d: dur });
    }
    shield(u, amt, dur) { if (u.dead) return; u.st.shield.push({ v: amt, until: this.t + dur }); this.ev({ t: 'fx', k: 'shield', id: u.id, d: dur }); }
    dot(src, u, total, dur, type) { u.st.dot.push({ src: src.id, per: total / dur, until: this.t + dur, type }); }
    heal(src, u, amt) {
      if (u.dead) return; const n = Math.min(amt, u.maxHp - u.hp); if (n <= 0) return; u.hp += n;
      if (amt >= 15) this.ev({ t: 'heal', id: u.id, n: Math.round(n) });
    }
    /** daño con armadura/res. mágica, escudos, robo de vida y muertes */
    dmg(src, u, amount, type, opts = {}) {
      if (!u || u.dead || amount <= 0) return 0;
      if ((u.kind === 'tower' || u.kind === 'inhib' || u.kind === 'nexus') && !this.structureOpen(u)) return 0;
      if (src && src.kind === 'champ') amount *= src.dmgMul || 1;
      let res = type === 'phys' ? u.armor : type === 'magic' ? u.mr : 0;
      if (src && type === 'phys' && src.def && src.def.armorPen) res *= 1 - src.def.armorPen;
      if (u.kind === 'champ' && u.def.passive === 'piel' && u.hp < u.maxHp * .5) res += 25;
      let d = type === 'true' ? amount : amount * 100 / (100 + Math.max(0, res));
      if (u.kind === 'tower' && src && src.kind === 'minion' && src.sub === 'siege') d *= 1.5;
      if (u.kind === 'minion' && src && src.kind === 'minion') d *= .55; // las oleadas duran más: hay tiempo para rematar
      if (u.kind === 'champ' && src && src.kind === 'tower') d *= 1;
      for (const s of u.st.shield) { if (s.until <= this.t || s.v <= 0) continue; const k = Math.min(s.v, d); s.v -= k; d -= k; if (d <= 0) break; }
      u.hp -= d;
      if (src && src.kind === 'champ' && opts.attack && src.ls) this.heal(src, src, d * src.ls);
      if (src && u.thorns && opts.attack && type === 'phys') this.dmg(u, src, d * u.thorns + 10, 'magic');
      if (src) { u.lastHit = { id: src.id, t: this.t }; if (src.kind === 'champ' && u.kind === 'champ') { (u.assist = u.assist || {})[src.id] = this.t; src.combatT = this.t; } }
      if (u.kind === 'champ') { u.combatT = this.t; u.hurtT = this.t; if (u.recall) this.cancelRecall(u); }
      if (src && src.kind === 'champ' && u.kind === 'champ') src.aggroT = this.t; // las torres y minions defienden a sus campeones
      if (u.kind === 'monster' && src) u.aggro = src.id;
      if ((src && src.kind === 'champ') || u.kind === 'champ') {
        // el daño que va de a poquito (quemaduras, fuente) se junta antes de mostrarlo
        if (opts.dot || !src) { u.dotAcc = (u.dotAcc || 0) + d; if (u.dotAcc >= 30 || u.hp <= 0) { this.ev({ t: 'dmg', id: u.id, n: Math.round(u.dotAcc), ty: type === 'phys' ? 0 : type === 'magic' ? 1 : 2, c: 0, s: src ? src.team : -1 }); u.dotAcc = 0; } }
        else this.ev({ t: 'dmg', id: u.id, n: Math.round(d), ty: type === 'phys' ? 0 : type === 'magic' ? 1 : 2, c: opts.crit ? 1 : 0, s: src ? src.team : -1 });
      }
      if (u.hp <= 0) this.kill(u, src);
      return d;
    }
    /* ───── muertes, oro y experiencia ───── */
    kill(u, src) {
      if (u.dead) return; u.dead = true; u.hp = 0; u.path = []; u.order = null; u.dash = null;
      const killer = src && (src.kind === 'champ' ? src : null);
      const champsNear = (team, r) => this.champs.filter(c => !c.dead && c.team === team && dist(c, u) <= r);
      this.ev({ t: 'die', id: u.id, k: u.kind, x: u.x, z: u.z });
      if (u.kind === 'minion') {
        const m = MINION[u.sub]; if (killer && killer.team !== u.team) { killer.gold += m.gold; killer.cs++; this.ev({ t: 'gold', id: killer.id, n: m.gold, x: u.x, z: u.z }); }
        const near = champsNear(1 - u.team, 15); for (const c of near) this.giveXp(c, m.xp * (near.length > 1 ? 1.3 / near.length : 1));
      } else if (u.kind === 'monster') {
        const team = killer ? killer.team : src && src.team < 2 ? src.team : -1;
        if (killer) { killer.gold += u.gold; killer.cs += u.big ? 4 : 1; if (u.gold) this.ev({ t: 'gold', id: killer.id, n: u.gold, x: u.x, z: u.z }); }
        if (team >= 0) { const near = champsNear(team, 15); for (const c of near) this.giveXp(c, u.xp / Math.max(1, near.length * .8)); }
        const c = u.camp; c.alive = c.alive.filter(v => v !== u);
        if (!c.alive.some(v => !v.dead)) { c.spawnAt = this.t + c.respawn; c.alive = []; }
        if (u.big && c.buff && killer) { killer.buffs[c.buff] = this.t + 90; this.calc(killer); this.ev({ t: 'msg', m: `${killer.name} consiguió el buff ${c.buff}`, team: killer.team }); }
        if (u.sub === 'dragon' && team >= 0) { this.team[team].dragons++; for (const c2 of this.champs) if (c2.team === team) { c2.gold += 100; this.calc(c2); } this.log(`${killer ? killer.name : 'El equipo ' + (team ? 'rojo' : 'azul')} mató al Dragón (+6% de daño para su equipo)`); this.ev({ t: 'epic', k: 'dragon', team }); }
        if (u.sub === 'coloso' && team >= 0) { this.team[team].colosoUntil = this.t + 150; for (const c2 of this.champs) if (c2.team === team) { c2.gold += 250; this.calc(c2); } this.log(`¡El equipo ${team ? 'rojo' : 'azul'} venció al Coloso! Ataque y poder extra por 2:30`); this.ev({ t: 'epic', k: 'coloso', team }); }
      } else if (u.kind === 'champ') {
        u.deaths++; u.respawnAt = this.t + 5 + u.level * 2.2 + Math.max(0, this.t - 900) / 90; u.recall = 0; u.streakDeaths = (u.streakDeaths || 0) + 1;
        const bounty = Math.min(500, 300 + Math.max(0, u.streak - 2) * 60) * (u.streakDeaths > 2 ? .6 : 1);
        u.streak = 0;
        const assisters = this.champs.filter(c => c.team !== u.team && c !== killer && u.assist && u.assist[c.id] > this.t - 10);
        if (killer && killer.team !== u.team) {
          let g = bounty; if (!this.firstBlood) { this.firstBlood = true; g += 100; this.ev({ t: 'msg', m: '¡Primera sangre!', big: true }); }
          killer.gold += Math.round(g); killer.kills++; killer.streak++; killer.streakDeaths = 0; this.team[killer.team].kills++;
          this.ev({ t: 'gold', id: killer.id, n: Math.round(g), x: u.x, z: u.z });
          for (const c of assisters) { c.assists++; c.gold += Math.round(150 / Math.max(1, assisters.length)); }
          for (const c of [killer, ...assisters]) this.giveXp(c, (120 + u.level * 40) / (1 + assisters.length * .5));
          const sp = ['', '', '¡Doble asesinato!', '¡Triple asesinato!', '¡Cuádruple asesinato!', '¡PENTA!'];
          killer.multi = killer.multiT > this.t - 10 ? (killer.multi || 1) + 1 : 1; killer.multiT = this.t;
          if (killer.multi >= 2) this.ev({ t: 'msg', m: `${killer.name}: ${sp[Math.min(5, killer.multi)]}`, big: true });
          else if (killer.streak === 3) this.ev({ t: 'msg', m: `${killer.name} está en racha` }); else if (killer.streak === 5) this.ev({ t: 'msg', m: `${killer.name} es imparable` }); else if (killer.streak === 8) this.ev({ t: 'msg', m: `¡${killer.name} es LEGENDARIO!`, big: true });
        } else if (assisters.length) { this.team[1 - u.team].kills++; for (const c of assisters) { c.assists++; c.gold += Math.round(bounty / assisters.length); } }
        else this.team[1 - u.team].kills++;
        this.ev({ t: 'kill', k: killer ? killer.id : (src ? -1 : 0), v: u.id, a: assisters.map(c => c.id), src: src ? src.kind : '' });
        u.assist = {};
      } else if (u.kind === 'tower' || u.kind === 'inhib') {
        const team = 1 - u.team; this.team[team].towers++;
        for (const c of this.champs) if (c.team === team) c.gold += u.kind === 'tower' ? 150 : 100;
        if (killer) { killer.gold += 100; }
        this.log(`${u.kind === 'tower' ? 'Cayó una torre' : 'Cayó un inhibidor'} del equipo ${u.team ? 'rojo' : 'azul'}`);
        if (u.kind === 'inhib') u.respawnAt = this.t + 240;
      } else if (u.kind === 'nexus') { this.winner = 1 - u.team; this.ev({ t: 'win', team: this.winner }); }
      if (u.kind === 'minion' || u.kind === 'monster') this.byId.delete(u.id);
    }
    /* ───── órdenes de los jugadores ───── */
    input(c, o) {
      if (!c || !o) return;
      if (o.t === 'level') { this.levelUp(c, o.s | 0); return; }
      if (o.t === 'auto') { c.autoLevel = !!o.v; if (c.autoLevel) this.autoLevel(c); return; }
      if (o.t === 'buy') return this.buy(c, o.item);
      if (o.t === 'sell') return this.sell(c, o.slot | 0);
      if (o.t === 'use') return this.usePotion(c);
      if (c.dead) return;
      if (o.t === 'recall') { if (!c.recall && !c.dash && c.st.stun <= this.t) { c.order = null; c.path = []; c.windup = 0; c.recall = this.t + (this.team[c.team].colosoUntil > this.t ? 4 : 8); this.ev({ t: 'recall', id: c.id, d: c.recall - this.t }); } return; }
      if (o.t === 'spell') return this.castSpell(c, o.s | 0, o.x, o.z);
      if (c.recall && o.t !== 'stop') this.cancelRecall(c);
      if (o.t === 'stop') { c.order = null; c.path = []; c.windup = 0; return; }
      if (o.t === 'move') { c.order = { t: 'move', x: clamp(+o.x, 2, 198), z: clamp(+o.z, 2, 198) }; c.path = M.findPath(c.x, c.z, c.order.x, c.order.z); c.windup = 0; return; }
      if (o.t === 'attack') { const u = this.byId.get(o.id); if (u && u.team !== c.team && this.targetable(u, c)) { if (!c.order || c.order.t !== 'attack' || c.order.id !== u.id) c.windup = 0; c.order = { t: 'attack', id: u.id }; c.path = []; } return; }
      if (o.t === 'amove') { c.order = { t: 'amove', x: clamp(+o.x, 2, 198), z: clamp(+o.z, 2, 198) }; c.path = M.findPath(c.x, c.z, c.order.x, c.order.z); return; }
      if (o.t === 'cast') return this.tryCast(c, o.s | 0, +o.x, +o.z, o.id);
    }
    cancelRecall(c) { if (c.recall) { c.recall = 0; this.ev({ t: 'recall', id: c.id, d: 0 }); } }
    inShop(c) { const [fx, fz] = M.FOUNTAIN[c.team]; return c.dead || Math.hypot(c.x - fx, c.z - fz) < 16; }
    buy(c, key) {
      const it = ITEMS[key]; if (!it || !this.inShop(c) || c.gold < it.cost) return false;
      if (it.use) { if (c.potions.length >= it.stack || c.items.length >= 6 && !c.items.includes('pocion')) return false; }
      if (it.boots || key === 'botas') { if (c.items.includes('botasR')) return false; if (key === 'botasR' && c.items.includes('botas')) { c.items.splice(c.items.indexOf('botas'), 1); c.gold += 0; } else if (key === 'botas' && c.items.includes('botas')) return false; }
      if (!it.use && c.items.filter(k => k !== 'pocion').length >= 6) return false;
      c.gold -= it.cost;
      if (it.use) { c.potions.push(1); if (!c.items.includes('pocion')) c.items.push('pocion'); }
      else c.items.push(key);
      this.calc(c); this.ev({ t: 'buy', id: c.id, item: key }); return true;
    }
    sell(c, slot) { const k = c.items[slot]; if (!k || !this.inShop(c)) return; if (k === 'pocion') { c.potions.pop(); c.gold += 20; if (!c.potions.length) c.items.splice(slot, 1); } else { c.items.splice(slot, 1); c.gold += Math.round(ITEMS[k].cost * .6); } this.calc(c); }
    usePotion(c) { if (c.dead || !c.potions.length || c.potionUntil > this.t) return; c.potions.pop(); if (!c.potions.length) c.items = c.items.filter(k => k !== 'pocion'); c.potionUntil = this.t + 12; this.ev({ t: 'fx', k: 'potion', id: c.id }); }
    /* hechizos de invocador: 0 = Destello, 1 = Curar */
    castSpell(c, s, x, z) {
      if (c.dead || c.spells[s] > this.t || c.st.stun > this.t) return;
      if (c.recall) this.cancelRecall(c);
      if (s === 0) { this.blink(c, x, z, 4.5); c.spells[0] = this.t + 150; this.ev({ t: 'fx', k: 'flash', id: c.id, x: c.x, z: c.z }); }
      else { const amt = 90 + 15 * c.level; this.heal(c, c, amt); this.status(c, 'haste', 1.5, .3); const ally = this.alliesIn(c.x, c.z, 8, c.team, true).filter(a => a !== c).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; if (ally) { this.heal(c, ally, amt); this.status(ally, 'haste', 1.5, .3); } c.spells[1] = this.t + 120; this.ev({ t: 'fx', k: 'healspell', id: c.id }); }
    }
    /* ───── habilidades ───── */
    tryCast(c, s, x, z, id) {
      const ab = c.def.abilities[s], rank = c.ranks[s];
      if (!ab || rank <= 0 || c.cd[s] > this.t || c.st.stun > this.t || c.st.silence > this.t || c.dash) return false;
      const cost = ab.cost ? ab.cost[rank - 1] : 0; if (c.mp < cost) return false;
      let target = null;
      if (ab.type === 'target' || ab.type === 'ally') {
        target = this.byId.get(id);
        if (!target || target.dead || (ab.champsOnly && target.kind !== 'champ') || (ab.type === 'target' ? target.team === c.team || !this.targetable(target, c) : target.team !== c.team)) {
          // sin blanco válido: el más cercano al punto
          const list = ab.type === 'target' ? this.enemiesIn(x, z, 3, c.team, { champsOnly: !!ab.champsOnly }) : this.alliesIn(x, z, 3, c.team, true);
          target = list.sort((a, b) => D2(a, { x, z }) - D2(b, { x, z }))[0]; if (!target) return false;
        }
        if (dist(c, target) > ab.range + target.r) { c.order = { t: 'castq', s, id: target.id }; c.path = M.findPath(c.x, c.z, target.x, target.z); return false; }
        x = target.x; z = target.z;
      }
      if (c.recall) this.cancelRecall(c);
      c.mp -= cost; c.cd[s] = this.t + ab.cd[rank - 1] * (1 - c.cdr);
      const ang = Math.atan2(x - c.x, z - c.z); if (isFinite(ang) && (x !== c.x || z !== c.z)) c.facing = ang;
      if (c.st.stealth > this.t && !ab.keepStealth) c.st.stealth = 0;
      this.ev({ t: 'cast', id: c.id, s, x, z });
      ab.cast(this, c, { x, z, target, rank, ang });
      if (c.order && c.order.t === 'castq') c.order = null;
      return true;
    }
    abilityDmg(c, base, rank, ratios) { let d = base[rank - 1]; if (ratios) { d += (ratios.ap || 0) * c.ap + (ratios.ad || 0) * c.ad + (ratios.bad || 0) * c.bonusAd + (ratios.hp || 0) * c.maxHp; } return d; }
    /** proyectil en línea recta que golpea al primer enemigo (o a todos si atraviesa) */
    skillshot(c, ang, o) {
      const p = { id: NEXT_ID++, line: true, x: c.x, z: c.z, dx: Math.sin(ang), dz: Math.cos(ang), speed: o.speed, range: o.range, travel: 0, width: o.width || 1, team: c.team, owner: c.id, pierce: !!o.pierce, champsOnly: !!o.champsOnly, hits: new Set(), hit: o.hit, vis: o.vis || 'orb', onEnd: o.onEnd };
      this.projs.push(p); this.ev({ t: 'p', id: p.id, v: p.vis, x: p.x, z: p.z, dx: p.dx, dz: p.dz, s: p.speed, r: p.range, w: p.width, tm: c.team }); return p;
    }
    homing(src, tgt, o) {
      const p = { id: NEXT_ID++, line: false, x: src.x, z: src.z, target: tgt.id, speed: o.speed, team: src.team, owner: src.id, hit: o.hit, vis: o.vis || 'bolt' };
      this.projs.push(p); this.ev({ t: 'ph', id: p.id, v: p.vis, from: src.id, to: tgt.id, s: p.speed, tm: src.team }); return p;
    }
    after(sec, fn) { this.delayed.push({ at: this.t + sec, fn }); }
    /** área en el piso: aviso visual, y después de 'delay' segundos golpea a los enemigos dentro */
    area(c, x, z, o) {
      this.ev({ t: 'fx', k: o.vis || 'circle', x, z, r: o.radius, d: o.delay || .3, tm: c.team, dur: o.dur || 0 });
      const go = () => { if (o.hit) for (const u of (o.allies ? this.alliesIn(x, z, o.radius, c.team) : this.enemiesIn(x, z, o.radius, c.team))) o.hit(u); if (o.after) o.after(); };
      if (o.delay) this.after(o.delay, go); else go();
    }
    /** desplazamiento rápido; no atraviesa paredes */
    dash(c, x, z, o) {
      const d = Math.hypot(x - c.x, z - c.z), max = o.max || d, k = d > max ? max / d : 1;
      let tx = c.x + (x - c.x) * k, tz = c.z + (z - c.z) * k;
      if (!M.lineFree(c.x, c.z, tx, tz)) { const n = 24; for (let i = n; i >= 0; i--) { const px = c.x + (tx - c.x) * i / n, pz = c.z + (tz - c.z) * i / n; if (M.lineFree(c.x, c.z, px, pz)) { tx = px; tz = pz; break; } } }
      c.dash = { tx, tz, speed: o.speed || 25, onEnd: o.onEnd, hit: o.hit, hits: new Set(), interruptible: o.interruptible };
      c.path = []; c.windup = 0; if (c.recall) this.cancelRecall(c);
      this.ev({ t: 'dash', id: c.id, x: tx, z: tz, s: o.speed || 25, v: o.vis || '' });
    }
    blink(c, x, z, max) {
      const d = Math.hypot(x - c.x, z - c.z) || 1, k = Math.min(1, max / d); let tx = c.x + (x - c.x) * k, tz = c.z + (z - c.z) * k;
      [tx, tz] = M.nearestFree(tx, tz); this.ev({ t: 'blink', id: c.id, x0: c.x, z0: c.z, x: tx, z: tz });
      c.x = tx; c.z = tz; c.path = []; if (c.order && c.order.t === 'move') c.order = null;
    }

    /* ───── paso de simulación ───── */
    step() {
      if (this.winner >= 0) return;
      this.t += TICK; const t = this.t;
      // oleadas de minions cada 30 s
      if (t >= this.nextWave) { this.spawnWave(); this.nextWave += 30; }
      for (const c of this.camps) if (!c.alive.length && t >= c.spawnAt) this.spawnCamp(c);
      // inhibidores que reviven
      for (const u of this.units) if (u.kind === 'inhib' && u.dead && t >= u.respawnAt) { u.dead = false; u.hp = u.maxHp; this.log(`Volvió el inhibidor ${u.lane} del equipo ${u.team ? 'rojo' : 'azul'}`); }
      this.computeVision();
      if (A.bots) for (const c of this.champs) if (c.bot) A.bots.think(this, c);
      for (let i = this.delayed.length - 1; i >= 0; i--) if (this.delayed[i].at <= t) { const d = this.delayed[i]; this.delayed.splice(i, 1); d.fn(); }
      for (const u of this.units) {
        if (u.dead) { if (u.kind === 'champ' && t >= u.respawnAt) this.respawn(u); continue; }
        this.updStatus(u);
        if (u.kind === 'champ') this.updChamp(u);
        else if (u.kind === 'minion') this.updMinion(u);
        else if (u.kind === 'monster') this.updMonster(u);
        else if (u.kind === 'tower') this.updTower(u);
        else if (u.kind === 'nexus' && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.regen * TICK);
      }
      this.updProjs();
      this.separate();
      this.fountain();
      // limpiar muertos (minions y monstruos)
      if ((this.t * 30 | 0) % 30 === 0) this.units = this.units.filter(u => !(u.dead && (u.kind === 'minion' || u.kind === 'monster')));
    }
    respawn(c) {
      const [x, z] = M.FOUNTAIN[c.team]; c.dead = false; c.x = x + (this.rnd() - .5) * 3; c.z = z + (this.rnd() - .5) * 3; c.hp = c.maxHp; c.mp = c.maxMp; c.order = null; c.path = []; c.st.slow = []; c.st.dot = []; c.st.shield = []; c.windup = 0;
      this.ev({ t: 'respawn', id: c.id });
    }
    spawnWave() {
      this.wave++; const supers = [0, 1].map(team => ['top', 'mid', 'bot'].filter(l => this.units.some(u => u.kind === 'inhib' && u.team === 1 - team && u.lane === l && u.dead)));
      const scale = 1 + this.t / 600 * .35;
      for (let team = 0; team < 2; team++) for (const lane of ['top', 'mid', 'bot']) {
        const list = ['melee', 'melee', 'melee', 'caster', 'caster', 'caster']; if (this.wave % 3 === 0) list.splice(3, 0, 'siege'); if (supers[team].includes(lane)) list.unshift('super');
        list.forEach((sub, i) => {
          const base = MINION[sub], t0 = team ? 1 - .02 : .02, [x, z] = M.lanePoint(lane, t0), back = i * 1.3;
          const pt = M.lanePoint(lane, team ? t0 + back / M.LANE[lane].len : t0 - back / M.LANE[lane].len);
          this.add({ kind: 'minion', sub, team, lane, x: pt[0], z: pt[1], r: base.r, maxHp: Math.round(base.hp * scale), hp: Math.round(base.hp * scale), ad: base.ad * (1 + (scale - 1) * .7), armor: base.armor, mr: base.mr, range: base.range, as: base.as, ms: base.ms, ranged: !!base.ranged, prog: team ? 1 : 0, facing: 0 });
        });
      }
    }
    updStatus(u) {
      const t = this.t, s = u.st;
      if (s.slow.length) s.slow = s.slow.filter(x => x.until > t); if (s.haste.length) s.haste = s.haste.filter(x => x.until > t); if (s.shield.length) s.shield = s.shield.filter(x => x.until > t && x.v > 0); if (s.asb.length) s.asb = s.asb.filter(x => x.until > t);
      if (s.dot.length) { s.dot = s.dot.filter(x => x.until > t); for (const d of s.dot) { if (u.dead) break; this.dmg(this.byId.get(d.src), u, d.per * TICK, d.type || 'magic', { dot: true }); } }
      if (u.kind === 'champ') {
        const inBase = Math.hypot(u.x - M.FOUNTAIN[u.team][0], u.z - M.FOUNTAIN[u.team][1]) < 14;
        u.hp = Math.min(u.maxHp, u.hp + (u.def.stats.hpR + u.level * .15 + (u.potionUntil > t ? 12.5 : 0)) * TICK);
        u.mp = Math.min(u.maxMp, u.mp + (u.def.stats.mpR + u.level * .1 + (u.buffs.azul > t ? 5 : 0)) * TICK);
        if (inBase) { u.hp = Math.min(u.maxHp, u.hp + u.maxHp * .1 * TICK); u.mp = Math.min(u.maxMp, u.mp + u.maxMp * .1 * TICK); }
        if ((t * 30 | 0) % 15 === 0) { if (t > 40) u.gold += 1; this.calc(u); } // 2 de oro por segundo
        if (u.def.tick) u.def.tick(this, u);
      }
    }
    msOf(u) {
      let ms = u.kind === 'champ' ? u.msBase : u.ms; let slow = 0; for (const s of u.st.slow) slow = Math.max(slow, s.v); let haste = 0; for (const h of u.st.haste) haste += h.v;
      if (u.kind === 'champ' && u.st.stealth > this.t) haste += .25;
      return ms * (1 - slow) * (1 + haste);
    }
    asOf(u) { let b = 0; for (const s of u.st.asb) b += s.v; return Math.min(2.5, (u.kind === 'champ' ? u.asBase : u.as) * (1 + b)); }
    canAct(u) { return u.st.stun <= this.t && !u.dash; }
    canMove(u) { return this.canAct(u) && u.st.root <= this.t; }
    /** mover hacia (x, z) a velocidad de la unidad, deslizando contra las paredes */
    moveToward(u, x, z, stopAt = 0) {
      if (!this.canMove(u)) return false;
      const dx = x - u.x, dz = z - u.z, d = Math.hypot(dx, dz); if (d <= stopAt + .05) return true;
      const step = Math.min(d - stopAt, this.msOf(u) * TICK), nx = u.x + dx / d * step, nz = u.z + dz / d * step;
      if (!M.blocked(nx, nz)) { u.x = nx; u.z = nz; } else if (!M.blocked(nx, u.z)) u.x = nx; else if (!M.blocked(u.x, nz)) u.z = nz;
      u.facing = Math.atan2(dx, dz); u.moving = true;
      return d - step <= stopAt + .05;
    }
    followPath(u) {
      if (!u.path || !u.path.length) return true;
      const [x, z] = u.path[0]; if (this.moveToward(u, x, z)) u.path.shift();
      return !u.path.length;
    }
    /** ataque básico: preparación (windup) y golpe o proyectil */
    basicAttack(u, tgt) {
      if (!this.canAct(u)) return;
      const t = this.t, as = this.asOf(u);
      u.facing = Math.atan2(tgt.x - u.x, tgt.z - u.z);
      if (u.windup) {
        if (t < u.windup) return; u.windup = 0;
        if (!this.targetable(tgt, u)) return;
        let dmg = u.ad, crit = false;
        if (u.kind === 'champ') {
          u.attackCount++;
          if (u.def.passive === 'ojo' && u.attackCount % 4 === 0) crit = true; else if (u.crit && this.rnd() < u.crit) crit = true;
          if (crit) dmg *= 1.75;
          if (u.empower) { dmg += u.empower; u.empower = 0; }
          if (u.def.passive === 'golpe' && tgt.hp < tgt.maxHp * .4) dmg *= 1.15;
          if (tgt.kind === 'minion' && tgt.sub !== 'super') dmg += 0;
        }
        if (u.kind === 'tower' && tgt.kind === 'champ') { u.shots = (u.shots || 0) + 1; dmg *= Math.min(2.2, 1 + (u.shots - 1) * .4); }
        if (u.kind === 'tower') dmg += this.t / 60 * 4;
        const onHit = () => {
          if (!this.targetable(tgt, u) && tgt.kind !== 'champ') return; if (tgt.dead) return;
          this.dmg(u, tgt, dmg, 'phys', { attack: true, crit });
          if (u.kind === 'champ' && u.buffs.rojo > this.t && tgt.kind !== 'tower') { this.dot(u, tgt, 10 + u.level * 3, 3, 'true'); this.status(tgt, 'slow', 1, .15); }
          if (u.kind === 'champ' && u.def.onHit) u.def.onHit(this, u, tgt);
        };
        if (u.ranged || u.kind === 'tower') this.homing(u, tgt, { speed: u.kind === 'tower' ? 26 : 22, vis: u.kind === 'tower' ? 'tower' : u.kind === 'champ' ? (u.def.atkVis || 'bolt') : u.kind === 'monster' ? 'fire' : 'small', hit: onHit });
        else { onHit(); this.ev({ t: 'swing', id: u.id }); }
        return;
      }
      if (u.atkT > t) return;
      u.atkT = t + 1 / as; u.windup = t + Math.min(.3, .25 / as);
      this.ev({ t: 'atk', id: u.id, to: tgt.id });
    }
    inAttackRange(u, tgt) { return dist(u, tgt) <= u.range + (tgt.r || 0) + (u.r || 0) * .5; }
    updChamp(c) {
      const t = this.t; c.moving = false;
      if (c.dash) {
        const d = c.dash, dx = d.tx - c.x, dz = d.tz - c.z, L = Math.hypot(dx, dz), step = d.speed * TICK;
        if (d.hit) for (const u of this.enemiesIn(c.x, c.z, 1.2, c.team)) if (!d.hits.has(u.id)) { d.hits.add(u.id); if (d.hit(u) === 'stop') { c.dash = null; if (d.onEnd) d.onEnd(); return; } }
        if (L <= step) { c.x = d.tx; c.z = d.tz; c.dash = null; if (d.onEnd) d.onEnd(); } else { c.x += dx / L * step; c.z += dz / L * step; c.facing = Math.atan2(dx, dz); }
        return;
      }
      if (c.st.stun > t) return;
      if (c.recall) { if (t >= c.recall) { const [x, z] = M.FOUNTAIN[c.team]; c.x = x; c.z = z; c.recall = 0; c.path = []; this.ev({ t: 'recalled', id: c.id }); } return; }
      const o = c.order; if (!o) return;
      if (o.t === 'move') { if (this.followPath(c)) c.order = null; return; }
      if (o.t === 'amove') {
        const near = this.enemiesIn(c.x, c.z, c.range + 3, c.team, { structures: true }).filter(u => this.targetable(u, c)).sort((a, b) => D2(a, c) - D2(b, c))[0];
        if (near) { c.order = { t: 'attack', id: near.id, then: o }; return; }
        if (this.followPath(c)) c.order = null; return;
      }
      if (o.t === 'attack' || o.t === 'castq') {
        const tgt = this.byId.get(o.id);
        if (!tgt || tgt.dead || (o.t === 'attack' && !this.targetable(tgt, c)) || !this.visible[c.team].has(tgt.id)) { c.order = o.then || null; c.windup = 0; if (c.order) c.path = M.findPath(c.x, c.z, c.order.x, c.order.z); return; }
        if (o.t === 'castq') { const ab = c.def.abilities[o.s]; if (dist(c, tgt) <= ab.range + tgt.r) { this.tryCast(c, o.s, tgt.x, tgt.z, tgt.id); c.order = null; return; } }
        else if (this.inAttackRange(c, tgt)) { c.path = []; this.basicAttack(c, tgt); return; }
        if (c.windup) c.windup = 0;
        // perseguir: recalcular el camino de vez en cuando
        if (!c.path.length || (t - (c.repathT || 0) > .35)) { c.repathT = t; c.path = M.findPath(c.x, c.z, tgt.x, tgt.z); }
        this.followPath(c);
      }
    }
    /* minions: caminan por su carril y pelean con lo primero que encuentran */
    updMinion(m) {
      const t = this.t; m.moving = false;
      if (m.st.stun > t) return;
      let tgt = m.target ? this.byId.get(m.target) : null;
      if (tgt && (tgt.dead || !this.targetable(tgt, m) || dist(m, tgt) > 11)) { tgt = null; m.target = null; }
      if (!tgt || (t - (m.acqT || 0) > .5)) {
        m.acqT = t;
        // si un campeón enemigo atacó a un campeón aliado cerca, van por él
        const help = this.champs.find(c => !c.dead && c.team !== m.team && c.aggroT > t - 2 && dist(c, m) < 9 && this.targetable(c, m));
        if (help) tgt = help;
        else if (!tgt) {
          let best = null, bd = 1e9;
          for (const u of this.units) {
            if (u.dead || u.team === m.team || u.team === 2 || u.kind === 'monster') continue;
            const d = D2(u, m); if (d > 9 * 9 && !((u.kind === 'tower' || u.kind === 'inhib' || u.kind === 'nexus') && d < (9 + u.r) ** 2)) continue;
            if (!this.targetable(u, m)) continue;
            const pri = u.kind === 'minion' ? 0 : u.kind === 'champ' ? 40 : 10; // prefieren minions
            if (d + pri < bd) { bd = d + pri; best = u; }
          }
          tgt = best;
        }
        m.target = tgt ? tgt.id : null;
      }
      if (tgt) {
        if (this.inAttackRange(m, tgt)) { this.basicAttack(m, tgt); return; }
        m.windup = 0; this.moveToward(m, tgt.x, tgt.z, m.range * .8); return;
      }
      // avanzar por el carril
      const L = M.LANE[m.lane], dir = m.team ? -1 : 1;
      m.prog = clamp(m.prog + dir * .02, 0, 1);
      const pr = M.laneProgress(m.lane, m.x, m.z); const goal = M.lanePoint(m.lane, clamp(pr.t + dir * 6 / L.len, 0, 1));
      this.moveToward(m, goal[0], goal[1]);
    }
    updMonster(u) {
      const t = this.t; u.moving = false; if (u.st.stun > t) return;
      const home = Math.hypot(u.x - u.hx, u.z - u.hz);
      let tgt = u.aggro ? this.byId.get(u.aggro) : null;
      if (tgt && (tgt.dead || tgt.kind === 'monster' || Math.hypot(tgt.x - u.hx, tgt.z - u.hz) > 13 || !this.targetable(tgt, u))) tgt = null;
      if (!tgt) { u.aggro = null; u.windup = 0; if (home > .5) { this.moveToward(u, u.hx, u.hz); u.hp = Math.min(u.maxHp, u.hp + u.maxHp * .08 * TICK); } else u.hp = Math.min(u.maxHp, u.hp + u.maxHp * .02 * TICK); return; }
      // los del mismo campamento pelean juntos
      for (const v of u.camp.alive) if (!v.dead && !v.aggro) v.aggro = tgt.id;
      if (this.inAttackRange(u, tgt)) this.basicAttack(u, tgt); else { u.windup = 0; this.moveToward(u, tgt.x, tgt.z, u.range * .8); }
    }
    updTower(w) {
      const t = this.t; let tgt = w.target ? this.byId.get(w.target) : null;
      const valid = u => u && !u.dead && u.team !== w.team && u.team !== 2 && dist(u, w) <= w.range + u.r && this.targetable(u, w);
      if (!valid(tgt)) { tgt = null; w.shots = 0; }
      // un campeón que ataca a un campeón aliado bajo la torre pasa a ser el blanco
      const agg = this.champs.find(c => !c.dead && c.team !== w.team && c.aggroT > t - 1.5 && valid(c) && this.champs.some(a => a.team === w.team && !a.dead && dist(a, w) <= w.range + 3));
      if (agg && (!tgt || tgt.kind !== 'champ')) { tgt = agg; w.shots = 0; }
      if (!tgt) {
        let best = null, bd = 1e9;
        for (const u of this.units) { if (!valid(u)) continue; const d = D2(u, w) + (u.kind === 'champ' ? 400 : 0); if (d < bd) { bd = d; best = u; } }
        tgt = best; if (tgt) w.shots = 0;
      }
      w.target = tgt ? tgt.id : null;
      if (tgt) this.basicAttack(w, tgt); else w.windup = 0;
    }
    updProjs() {
      for (let i = this.projs.length - 1; i >= 0; i--) {
        const p = this.projs[i]; let done = false;
        if (p.line) {
          const step = p.speed * TICK; p.x += p.dx * step; p.z += p.dz * step; p.travel += step;
          for (const u of this.units) {
            if (u.dead || u.team === p.team || p.hits.has(u.id)) continue;
            if (!(u.kind === 'champ' || (!p.champsOnly && (u.kind === 'minion' || u.kind === 'monster')))) continue;
            if (u.kind === 'champ' && u.st.stealth > this.t && false) continue;
            if ((u.x - p.x) ** 2 + (u.z - p.z) ** 2 <= (u.r + p.width * .5) ** 2) { p.hits.add(u.id); if (p.hit) p.hit(u, p); if (!p.pierce) { done = true; break; } }
          }
          if (p.travel >= p.range) { done = true; if (p.onEnd) p.onEnd(p); }
        } else {
          const tgt = this.byId.get(p.target);
          if (!tgt || tgt.dead) done = true;
          else { const dx = tgt.x - p.x, dz = tgt.z - p.z, d = Math.hypot(dx, dz), step = p.speed * TICK; if (d <= step + (tgt.r || 0) * .5) { done = true; if (p.hit) p.hit(tgt, p); } else { p.x += dx / d * step; p.z += dz / d * step; } }
        }
        if (done) { this.projs.splice(i, 1); this.ev({ t: 'pe', id: p.id }); }
      }
    }
    /** las unidades no se apilan: se empujan un poco entre ellas */
    separate() {
      const mov = this.units.filter(u => !u.dead && (u.kind === 'minion' || u.kind === 'champ' || u.kind === 'monster'));
      for (let i = 0; i < mov.length; i++) { const a = mov[i]; for (let j = i + 1; j < mov.length; j++) { const b = mov[j]; const dx = b.x - a.x, dz = b.z - a.z, rr = (a.r + b.r) * .85; if (Math.abs(dx) > rr || Math.abs(dz) > rr) continue; const d = Math.hypot(dx, dz) || .01; if (d >= rr) continue; const push = (rr - d) * .25, ux = dx / d, uz = dz / d; const wa = a.kind === 'champ' ? .3 : 1, wb = b.kind === 'champ' ? .3 : 1; if (!a.dash && !M.blocked(a.x - ux * push * wa, a.z - uz * push * wa)) { a.x -= ux * push * wa; a.z -= uz * push * wa; } if (!b.dash && !M.blocked(b.x + ux * push * wb, b.z + uz * push * wb)) { b.x += ux * push * wb; b.z += uz * push * wb; } } }
      // las estructuras no se atraviesan
      for (const u of mov) for (const s of this.units) { if (s.dead || !(s.kind === 'tower' || s.kind === 'inhib' || s.kind === 'nexus')) continue; const dx = u.x - s.x, dz = u.z - s.z, d = Math.hypot(dx, dz), rr = s.r + u.r * .6; if (d < rr && d > .01) { u.x = s.x + dx / d * rr; u.z = s.z + dz / d * rr; } }
    }
    /** la fuente de cada base cura a los suyos y castiga a los enemigos */
    fountain() {
      for (let team = 0; team < 2; team++) { const [x, z] = M.FOUNTAIN[team]; for (const c of this.champs) if (!c.dead && c.team !== team && Math.hypot(c.x - x, c.z - z) < 16) this.dmg(null, c, 600 * TICK, 'true'); }
    }
    /* ───── visión (niebla de guerra) ───── */
    computeVision() {
      for (let team = 0; team < 2; team++) {
        const src = this.units.filter(u => !u.dead && u.team === team && (u.kind !== 'inhib'));
        const vis = new Set();
        for (const u of this.units) {
          if (u.dead) continue;
          if (u.team === team) { vis.add(u.id); continue; }
          if (u.kind === 'tower' || u.kind === 'inhib' || u.kind === 'nexus') { vis.add(u.id); continue; } // las estructuras siempre se ven
          if (u.kind === 'champ' && u.st.stealth > this.t) { if (src.some(s => s.kind === 'champ' && D2(s, u) < 2.5 * 2.5)) vis.add(u.id); continue; }
          for (const s of src) { const r = s.kind === 'champ' ? 13 : s.kind === 'minion' ? 9 : s.kind === 'nexus' ? 14 : 12; if (D2(s, u) <= r * r) { vis.add(u.id); break; } }
        }
        // ver un poco alrededor de la fuente siempre
        this.visible[team] = vis;
      }
    }
    /* ───── foto del estado para dibujar (y para mandar por la red) ───── */
    snapshot(team, meId) {
      const KIND = { champ: 0, minion: 1, tower: 2, inhib: 3, nexus: 4, monster: 5 }, SUB = { melee: 0, caster: 1, siege: 2, super: 3 };
      const vis = this.visible[team] || new Set(), e = [], r1 = v => Math.round(v * 10) / 10;
      for (const u of this.units) {
        if (u.dead && u.kind !== 'tower' && u.kind !== 'inhib' && u.kind !== 'nexus') continue;
        if (!vis.has(u.id) && !(u.dead)) continue;
        const flags = (u.st.stun > this.t ? 1 : 0) | (u.recall ? 2 : 0) | (u.st.stealth > this.t ? 4 : 0) | (u.dash ? 8 : 0) | (u.windup ? 16 : 0) | (u.moving ? 32 : 0) | (u.dead ? 64 : 0) | (u.st.shield.length ? 128 : 0) | (u.st.root > this.t ? 256 : 0) | (u.st.slow.length ? 512 : 0) | (u.kind !== 'champ' && u.kind !== 'minion' && u.kind !== 'monster' && !this.structureOpen(u) ? 1024 : 0);
        e.push([u.id, KIND[u.kind], u.kind === 'minion' ? SUB[u.sub] : u.kind === 'monster' ? u.sub : u.kind === 'champ' ? u.champ : u.tier || 0, u.team, r1(u.x), r1(u.z), Math.max(0, Math.round(u.hp)), u.maxHp, Math.round((u.facing || 0) * 100) / 100, flags, u.kind === 'champ' ? u.level : u.kind === 'monster' ? (u.big ? 1 : 0) : 0, u.st.shield.reduce((s, x) => s + x.v, 0) | 0]);
      }
      const champs = this.champs.map(c => {
        const o = { id: c.id, ch: c.champ, n: c.name, tm: c.team, lv: c.level, k: c.kills, d: c.deaths, a: c.assists, cs: c.cs, it: c.items, dead: c.dead, rs: c.dead ? Math.max(0, Math.ceil(c.respawnAt - this.t)) : 0, bot: c.bot };
        if (c.team === team) Object.assign(o, { mp: Math.round(c.mp), mmp: c.maxMp, hp: Math.round(c.hp), mhp: c.maxHp });
        if (c.id === meId) Object.assign(o, { g: Math.floor(c.gold), xp: Math.round(c.xp), xpn: this.xpNeed(c.level), rk: c.ranks, pts: c.points, cd: c.cd.map(v => Math.max(0, Math.round((v - this.t) * 10) / 10)), sp: c.spells.map(v => Math.max(0, Math.round(v - this.t))), ad: Math.round(c.ad), ap: Math.round(c.ap), ar: Math.round(c.armor), mr: Math.round(c.mr), as: Math.round(this.asOf(c) * 100) / 100, ms: Math.round(this.msOf(c) * 100) / 100, cdr: Math.round(c.cdr * 100), pot: c.potions.length, bf: Object.keys(c.buffs).filter(k => c.buffs[k] > this.t), shop: this.inShop(c), rec: c.recall ? Math.round((c.recall - this.t) * 10) / 10 : 0, auto: c.autoLevel });
        return o;
      });
      return { t: Math.round(this.t * 100) / 100, e, c: champs, s: { k: [this.team[0].kills, this.team[1].kills], dr: [this.team[0].dragons, this.team[1].dragons], tw: [this.team[0].towers, this.team[1].towers], col: [this.team[0].colosoUntil > this.t, this.team[1].colosoUntil > this.t] }, w: this.winner, ep: this.camps.filter(c => c.epic).map(c => [c.key, c.alive.some(u => !u.dead), Math.max(0, Math.round(c.spawnAt - this.t))]) };
    }
    drainEvents() { const e = this.events; this.events = []; return e; }
  }

  Object.assign(A, { Game, ITEMS, SHOP_ORDER, MINION, MONSTER, TICK, dist });
})(typeof globalThis !== 'undefined' ? globalThis : this);
