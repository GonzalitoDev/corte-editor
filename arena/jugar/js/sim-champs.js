/* GonzaArena — campeones (todos originales): estadísticas, pasivas y habilidades Q W E R.
 * type: 'skillshot' (dirección), 'ground' (punto en el piso), 'self', 'target' (enemigo), 'ally' (aliado), 'dash' (punto)
 * ai: pistas para los bots (cuándo y cómo usar cada habilidad)
 */
(function (root) {
  'use strict';
  const A = root.Arena = root.Arena || {};
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const R5 = (a, b) => [0, 1, 2, 3, 4].map(i => Math.round(a + (b - a) * i / 4));
  const R3 = (a, b) => [0, 1, 2].map(i => Math.round(a + (b - a) * i / 2));
  const toward = (c, x, z, d) => { const dx = x - c.x, dz = z - c.z, L = Math.hypot(dx, dz) || 1; return [c.x + dx / L * d, c.z + dz / L * d]; };

  const CHAMPS = {
    /* ─── BRASA: maga de fuego, daño en área a distancia ─── */
    brasa: {
      key: 'brasa', name: 'Brasa', title: 'la Llama Errante', role: 'Maga', ranged: true, color: '#ff6a2a', atkVis: 'fire', levelOrder: [0, 1, 2], lanes: ['mid', 'top', 'bot'],
      stats: { hp: 540, hpL: 92, mp: 420, mpL: 30, ad: 50, adL: 3, armor: 21, armorL: 4, mr: 30, mrL: 1.2, as: .64, asL: .015, range: 7.2, ms: 4.55, hpR: 1.2, mpR: 1.6 },
      passive: 'chispa', passiveName: 'Chispa', passiveDesc: 'Sus habilidades queman: el blanco sufre daño mágico extra durante 3 segundos.',
      items: ['tomo', 'botas', 'baculo', 'botasR', 'sombrero', 'manto', 'sombrero', 'corazon'],
      abilities: [
        { key: 'Q', name: 'Bola de fuego', desc: 'Lanza una bola de fuego en línea recta que explota contra el primer enemigo.', type: 'skillshot', range: 13, w: 1.4, cd: [7, 6.5, 6, 5.5, 5], cost: R5(50, 70), ai: { use: 'poke', range: 12.5 },
          cast(g, c, k) { g.skillshot(c, k.ang, { speed: 20, range: 13, width: 1.4, vis: 'fireball', hit: u => { g.dmg(c, u, g.abilityDmg(c, R5(80, 260), k.rank, { ap: .7 }), 'magic'); burn(g, c, u); g.ev({ t: 'fx', k: 'boom', x: u.x, z: u.z, r: 1.6 }); } }); } },
        { key: 'W', name: 'Columna de llamas', desc: 'Tras un instante, una columna de fuego sale del piso: daña y frena a los enemigos en el área.', type: 'ground', range: 11, radius: 3.2, cd: [10, 9.5, 9, 8.5, 8], cost: R5(70, 90), ai: { use: 'area', range: 10.5 },
          cast(g, c, k) { const [x, z] = clampRange(c, k, 11); g.area(c, x, z, { radius: 3.2, delay: .7, vis: 'flames', hit: u => { g.dmg(c, u, g.abilityDmg(c, R5(70, 230), k.rank, { ap: .6 }), 'magic'); g.status(u, 'slow', 1.5, .35); burn(g, c, u); } }); } },
        { key: 'E', name: 'Paso de humo', desc: 'Se desvanece en humo y reaparece unos metros más allá.', type: 'dash', range: 6, cd: R5(16, 10), cost: [60, 60, 60, 60, 60], ai: { use: 'escape' },
          cast(g, c, k) { g.blink(c, k.x, k.z, 6); g.ev({ t: 'fx', k: 'smoke', x: c.x, z: c.z }); } },
        { key: 'R', name: 'Lluvia de meteoros', desc: 'Hace caer tres oleadas de meteoros sobre una zona grande.', type: 'ground', range: 15, radius: 5, cd: [100, 80, 60], cost: [100, 100, 100], ai: { use: 'ult_area', range: 14 },
          cast(g, c, k) { const [x, z] = clampRange(c, k, 15); for (let i = 0; i < 3; i++) g.after(i * .55, () => g.area(c, x, z, { radius: 5, delay: .55, vis: 'meteor', hit: u => { g.dmg(c, u, g.abilityDmg(c, R3(100, 200), k.rank, { ap: .3 }), 'magic'); burn(g, c, u); } })); } },
      ],
    },
    /* ─── PEDRÓN: tanque de piedra, aguanta y controla ─── */
    pedron: {
      key: 'pedron', name: 'Pedrón', title: 'el Guardián de la Cantera', role: 'Tanque', ranged: false, color: '#9a8a74', levelOrder: [2, 0, 1], lanes: ['top', 'bot', 'mid'], support: true,
      stats: { hp: 660, hpL: 112, mp: 330, mpL: 40, ad: 62, adL: 3.6, armor: 36, armorL: 4.4, mr: 32, mrL: 2, as: .63, asL: .02, range: 1.8, ms: 4.5, hpR: 1.8, mpR: 1.4 },
      passive: 'piel', passiveName: 'Piel de roca', passiveDesc: 'Con menos de la mitad de vida gana 25 de armadura.',
      items: ['cristal', 'botas', 'espinas', 'botasR', 'manto', 'corazon', 'hacha', 'corazon'],
      abilities: [
        { key: 'Q', name: 'Embestida', desc: 'Carga en una dirección y aturde al primer enemigo que choca.', type: 'skillshot', range: 8, w: 2.2, cd: R5(12, 8), cost: R5(50, 70), ai: { use: 'engage', range: 7.5 },
          cast(g, c, k) { const [x, z] = toward(c, k.x, k.z, 8); g.dash(c, x, z, { speed: 24, vis: 'rocks', hit: u => { g.dmg(c, u, g.abilityDmg(c, R5(60, 200), k.rank, { hp: .05 }), 'phys'); g.status(u, 'stun', 1, 0); g.ev({ t: 'fx', k: 'impact', x: u.x, z: u.z }); return 'stop'; } }); } },
        { key: 'W', name: 'Muro de piedra', desc: 'Se cubre a sí mismo y a los aliados cercanos con un escudo de roca.', type: 'self', range: 6, cd: R5(16, 12), cost: R5(60, 80), ai: { use: 'shield' },
          cast(g, c, k) { for (const a of g.alliesIn(c.x, c.z, 6, c.team, true)) g.shield(a, g.abilityDmg(c, R5(60, 180), k.rank, { hp: .07 }), 3); } },
        { key: 'E', name: 'Pisotón', desc: 'Golpea el piso: daña y frena mucho a los enemigos alrededor.', type: 'self', range: 4.2, radius: 4.2, cd: R5(9, 6), cost: R5(40, 60), ai: { use: 'near', range: 4 },
          cast(g, c, k) { g.area(c, c.x, c.z, { radius: 4.2, vis: 'quake', hit: u => { g.dmg(c, u, g.abilityDmg(c, R5(50, 170), k.rank, { hp: .03 }), 'magic'); g.status(u, 'slow', 2, .45); } }); } },
        { key: 'R', name: 'Terremoto', desc: 'Parte la tierra a su alrededor: tras un instante aturde a todos los enemigos cerca.', type: 'self', range: 6.5, radius: 6.5, cd: [110, 90, 70], cost: [100, 100, 100], ai: { use: 'ult_near', range: 5.5 },
          cast(g, c, k) { g.area(c, c.x, c.z, { radius: 6.5, delay: .5, vis: 'quake_big', hit: u => { g.dmg(c, u, g.abilityDmg(c, R3(150, 350), k.rank, { ap: .5, hp: .04 }), 'magic'); g.status(u, 'stun', 1.4, 0); } }); } },
      ],
    },
    /* ─── SOMBRA: asesina, entra, mata y se va ─── */
    sombra: {
      key: 'sombra', name: 'Sombra', title: 'la Hoja del Crepúsculo', role: 'Asesina', ranged: false, color: '#8a5cff', levelOrder: [0, 2, 1], lanes: ['mid', 'top', 'jg'], jungler: true, armorPen: .15,
      stats: { hp: 570, hpL: 96, mp: 300, mpL: 35, ad: 64, adL: 3.4, armor: 28, armorL: 4.2, mr: 32, mrL: 1.3, as: .68, asL: .025, range: 1.8, ms: 4.75, hpR: 1.5, mpR: 1.4 },
      passive: 'golpe', passiveName: 'Golpe bajo', passiveDesc: 'Sus ataques hacen 15% más de daño a enemigos con menos del 40% de vida.',
      items: ['espada', 'botas', 'sangre', 'botasR', 'hoja', 'hacha', 'manto', 'espinas'],
      abilities: [
        { key: 'Q', name: 'Estrella de sombra', desc: 'Lanza una estrella filosa que atraviesa a todos los enemigos en línea.', type: 'skillshot', range: 10, w: 1.3, cd: R5(6, 4), cost: R5(40, 50), ai: { use: 'poke', range: 9.5, farm: true },
          cast(g, c, k) { g.skillshot(c, k.ang, { speed: 24, range: 10, width: 1.3, pierce: true, vis: 'shuriken', hit: u => g.dmg(c, u, g.abilityDmg(c, R5(70, 230), k.rank, { bad: .9 }), 'phys') }); } },
        { key: 'W', name: 'Velo', desc: 'Se vuelve invisible por un momento y corre más rápido. Atacar o usar otra habilidad la revela.', type: 'self', range: 0, cd: R5(20, 14), cost: [60, 60, 60, 60, 60], ai: { use: 'stealth' },
          cast(g, c, k) { g.status(c, 'stealth', 1.5 + k.rank * .3, 0); g.status(c, 'haste', 2, .25); c.empower = 30 + 20 * k.rank; } },
        { key: 'E', name: 'Salto a la espalda', desc: 'Salta sobre un enemigo y lo corta. Si lo mata, recupera la habilidad.', type: 'target', range: 7, cd: R5(12, 8), cost: R5(40, 60), ai: { use: 'gapclose', range: 7 },
          cast(g, c, k) { const u = k.target; g.dash(c, u.x, u.z, { speed: 30, vis: 'shadow', onEnd: () => { if (u.dead) return; g.dmg(c, u, g.abilityDmg(c, R5(60, 200), k.rank, { bad: .7 }), 'phys'); if (u.dead) c.cd[2] = g.t + .5; } }); } },
        { key: 'R', name: 'Marca mortal', desc: 'Aparece junto a un campeón enemigo y lo marca: a los 2,5 segundos la marca explota con mucho daño.', type: 'target', range: 7, cd: [90, 70, 50], cost: [0, 0, 0], champsOnly: true, ai: { use: 'ult_kill', range: 7 },
          cast(g, c, k) { const u = k.target; g.blink(c, u.x - Math.sin(u.facing || 0) * 1.5, u.z - Math.cos(u.facing || 0) * 1.5, 9); g.ev({ t: 'fx', k: 'mark', id: u.id, d: 2.5 }); const hp0 = u.hp; g.after(2.5, () => { if (u.dead) return; g.dmg(c, u, g.abilityDmg(c, R3(120, 320), k.rank, { bad: 1 }) + Math.max(0, hp0 - u.hp) * .3, 'phys'); g.ev({ t: 'fx', k: 'boom', x: u.x, z: u.z, r: 2 }); }); } },
      ],
    },
    /* ─── FLECHA: tiradora, daño constante desde lejos ─── */
    flecha: {
      key: 'flecha', name: 'Flecha', title: 'la Cazadora del Monte', role: 'Tiradora', ranged: true, color: '#3fbf6a', atkVis: 'arrow', levelOrder: [0, 1, 2], lanes: ['bot', 'mid', 'top'], carry: true,
      stats: { hp: 520, hpL: 90, mp: 330, mpL: 35, ad: 58, adL: 3.2, armor: 24, armorL: 4.2, mr: 30, mrL: 1, as: .67, asL: .032, range: 8.2, ms: 4.5, hpR: 1.1, mpR: 1.3 },
      passive: 'ojo', passiveName: 'Ojo de halcón', passiveDesc: 'Cada cuarto ataque es un golpe crítico.',
      items: ['daga', 'botas', 'arco', 'botasR', 'hoja', 'sangre', 'manto', 'espinas'],
      abilities: [
        { key: 'Q', name: 'Ráfaga', desc: 'Durante 4 segundos ataca mucho más rápido.', type: 'self', range: 0, cd: R5(12, 8), cost: [40, 40, 40, 40, 40], ai: { use: 'steroid' },
          cast(g, c, k) { g.status(c, 'asb', 4, .3 + k.rank * .1); g.ev({ t: 'fx', k: 'rage', id: c.id, d: 4 }); } },
        { key: 'W', name: 'Abanico', desc: 'Dispara cinco flechas en abanico que dañan y frenan.', type: 'skillshot', range: 10, fan: .56, cd: R5(11, 7), cost: R5(60, 80), ai: { use: 'poke', range: 9.5, farm: true },
          cast(g, c, k) { for (let i = -2; i <= 2; i++) g.skillshot(c, k.ang + i * .14, { speed: 22, range: 10, width: .9, vis: 'arrow', hit: u => { g.dmg(c, u, g.abilityDmg(c, R5(40, 160), k.rank, { ad: .9 }), 'phys'); g.status(u, 'slow', 1.5, .2); } }); } },
        { key: 'E', name: 'Rodar', desc: 'Rueda hacia donde apunta; el próximo ataque hace daño extra.', type: 'dash', range: 4, cd: R5(10, 6), cost: [30, 30, 30, 30, 30], ai: { use: 'kite' },
          cast(g, c, k) { const [x, z] = toward(c, k.x, k.z, 4); g.dash(c, x, z, { speed: 22, vis: 'roll' }); c.empower = 20 + 15 * k.rank; c.atkT = 0; } },
        { key: 'R', name: 'Flecha gigante', desc: 'Dispara una flecha enorme que cruza el mapa y aturde al primer campeón que toca.', type: 'skillshot', range: 70, w: 2.2, cd: [90, 75, 60], cost: [100, 100, 100], ai: { use: 'ult_snipe', range: 30 },
          cast(g, c, k) { g.skillshot(c, k.ang, { speed: 32, range: 70, width: 2.2, champsOnly: true, vis: 'bigarrow', hit: u => { g.dmg(c, u, g.abilityDmg(c, R3(200, 450), k.rank, { bad: 1 }), 'phys'); g.status(u, 'stun', 1.5, 0); } }); } },
      ],
    },
    /* ─── CEIBO: soporte, cura, protege y enraíza ─── */
    ceibo: {
      key: 'ceibo', name: 'Ceibo', title: 'el Brote del Delta', role: 'Soporte', ranged: true, color: '#ff4f8b', atkVis: 'leaf', levelOrder: [1, 0, 2], lanes: ['bot', 'mid', 'top'], support: true,
      stats: { hp: 530, hpL: 88, mp: 400, mpL: 40, ad: 48, adL: 2.8, armor: 22, armorL: 4, mr: 30, mrL: 1.2, as: .63, asL: .02, range: 7.6, ms: 4.5, hpR: 1.3, mpR: 1.8 },
      passive: 'flor', passiveName: 'Floración', passiveDesc: 'Los aliados cerca de Ceibo recuperan vida poco a poco.',
      items: ['tomo', 'botas', 'baculo', 'botasR', 'manto', 'corazon', 'sombrero', 'espinas'],
      abilities: [
        { key: 'Q', name: 'Raíces', desc: 'Lanza una semilla que enraíza al primer enemigo: no se puede mover por un rato.', type: 'skillshot', range: 12, w: 1.4, cd: R5(12, 9), cost: R5(60, 80), ai: { use: 'cc', range: 11.5 },
          cast(g, c, k) { g.skillshot(c, k.ang, { speed: 17, range: 12, width: 1.4, vis: 'seed', hit: u => { g.dmg(c, u, g.abilityDmg(c, R5(60, 220), k.rank, { ap: .5 }), 'magic'); g.status(u, 'root', 1.2 + k.rank * .15, 0); } }); } },
        { key: 'W', name: 'Savia', desc: 'Cura a un aliado (o a sí mismo).', type: 'ally', range: 9, cd: [11, 10, 9, 8, 7], cost: R5(60, 100), ai: { use: 'heal' },
          cast(g, c, k) { const u = k.target || c; g.heal(c, u, g.abilityDmg(c, R5(70, 230), k.rank, { ap: .4 })); g.ev({ t: 'fx', k: 'heal', id: u.id }); } },
        { key: 'E', name: 'Polen', desc: 'Los aliados cercanos corren más rápido y reciben un escudo.', type: 'self', range: 7, cd: R5(18, 14), cost: R5(50, 70), ai: { use: 'shield' },
          cast(g, c, k) { for (const a of g.alliesIn(c.x, c.z, 7, c.team, true)) { g.status(a, 'haste', 2.5, .25); g.shield(a, g.abilityDmg(c, R5(40, 120), k.rank, { ap: .3 }), 2.5); } } },
        { key: 'R', name: 'Jardín', desc: 'Hace crecer un jardín por 4 segundos: cura a los aliados y frena a los enemigos dentro.', type: 'ground', range: 12, radius: 6, cd: [100, 85, 70], cost: [100, 100, 100], ai: { use: 'ult_area', range: 11 },
          cast(g, c, k) { const [x, z] = clampRange(c, k, 12); g.ev({ t: 'fx', k: 'garden', x, z, r: 6, d: 4, tm: c.team }); for (let i = 0; i < 8; i++) g.after(i * .5, () => { for (const a of g.alliesIn(x, z, 6, c.team, true)) g.heal(c, a, g.abilityDmg(c, R3(25, 55), k.rank, { ap: .08 })); for (const u of g.enemiesIn(x, z, 6, c.team)) g.status(u, 'slow', .6, .35); }); } },
      ],
    },
  };
  function clampRange(c, k, r) { const dx = k.x - c.x, dz = k.z - c.z, d = Math.hypot(dx, dz); if (d <= r) return [k.x, k.z]; return [c.x + dx / d * r, c.z + dz / d * r]; }
  function burn(g, c, u) { if (u.dead) return; g.dot(c, u, 15 + c.level * 4 + c.ap * .1, 3, 'magic'); }
  // pasiva de Ceibo: curar a los aliados cerca (se aplica desde el bucle de bots/estado)
  CHAMPS.ceibo.tick = (g, c) => { if ((g.t * 30 | 0) % 15) return; for (const a of g.alliesIn(c.x, c.z, 7, c.team, true)) if (a !== c || true) g.heal(c, a, 2 + c.level * .5); };

  A.CHAMPS = CHAMPS;
  A.CHAMP_ORDER = ['brasa', 'pedron', 'sombra', 'flecha', 'ceibo'];
})(typeof globalThis !== 'undefined' ? globalThis : this);
