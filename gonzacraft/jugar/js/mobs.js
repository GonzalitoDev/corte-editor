/* GonzaCraft — criaturas nocturnas (diseños originales): Sombra, Rocoso y Chispa */
(function () {
  'use strict';
  const GC = window.GC;
  const { SOL, KIND } = GC;

  const TYPES = {
    sombra: { name: 'Sombra', hp: 20, speed: 2.7, dmg: 3, w: .3, h: 1.95, reach: 1.5, burns: true, drop: [35, 1], why: 'Una Sombra te atrapó.' },
    rocoso: { name: 'Rocoso', hp: 40, speed: 1.6, dmg: 5, w: .45, h: 1.45, reach: 1.7, drop: [4, 3], why: 'Un Rocoso te aplastó.' },
    chispa: { name: 'Chispa', hp: 8, speed: 4.4, dmg: 1, w: .26, h: .62, reach: 1.1, hop: true, drop: [24, 1], why: 'Las Chispas te picaron hasta el final.' },
  };
  const WEIGHTS = [['sombra', .5], ['chispa', .3], ['rocoso', .2]];

  /* ── modelos (cajas) ── */
  function part(g, w, h, d, col, x, y, z, glow) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: col }));
    m.position.set(x, y, z); m.userData.base = new THREE.Color(col); m.userData.glow = !!glow; g.add(m); return m;
  }
  function pivot(g, x, y, z) { const p = new THREE.Group(); p.position.set(x, y, z); g.add(p); return p; }
  function model(type) {
    const g = new THREE.Group(), r = {};
    if (type === 'sombra') {
      part(g, .5, .8, .28, 0x1d1830, 0, 1.1, 0);
      const head = pivot(g, 0, 1.5, 0); part(head, .46, .46, .46, 0x14111f, 0, .23, 0);
      part(head, .1, .06, .02, 0xc77dff, -.11, .27, -.235, true); part(head, .1, .06, .02, 0xc77dff, .11, .27, -.235, true);
      part(head, .5, .08, .5, 0x2a2245, 0, .5, 0);
      r.la = pivot(g, -.34, 1.48, 0); part(r.la, .16, .95, .16, 0x241d3a, 0, -.47, 0);
      r.ra = pivot(g, .34, 1.48, 0); part(r.ra, .16, .95, .16, 0x241d3a, 0, -.47, 0);
      r.ll = pivot(g, -.12, .72, 0); part(r.ll, .18, .72, .18, 0x15111f, 0, -.36, 0);
      r.rl = pivot(g, .12, .72, 0); part(r.rl, .18, .72, .18, 0x15111f, 0, -.36, 0);
      r.la.rotation.x = r.ra.rotation.x = -1.2; r.head = head;
    } else if (type === 'rocoso') {
      part(g, .9, .8, .7, 0x6f6f72, 0, .85, 0);
      part(g, .92, .14, .72, 0x4f7a3a, 0, 1.28, 0);
      const head = pivot(g, 0, 1.25, -.1); part(head, .5, .32, .4, 0x5d5d61, 0, .02, -.2);
      part(head, .1, .07, .02, 0xff9a3c, -.12, .05, -.41, true); part(head, .1, .07, .02, 0xff9a3c, .12, .05, -.41, true);
      part(g, .06, .4, .02, 0xff7b2e, .2, .9, -.36, true); part(g, .3, .05, .02, 0xff7b2e, -.15, .75, -.36, true);
      r.la = pivot(g, -.58, 1.15, 0); part(r.la, .26, .8, .3, 0x626266, 0, -.4, 0);
      r.ra = pivot(g, .58, 1.15, 0); part(r.ra, .26, .8, .3, 0x626266, 0, -.4, 0);
      r.ll = pivot(g, -.22, .45, 0); part(r.ll, .3, .45, .32, 0x58585c, 0, -.22, 0);
      r.rl = pivot(g, .22, .45, 0); part(r.rl, .3, .45, .32, 0x58585c, 0, -.22, 0);
      r.head = head;
    } else {
      const body = pivot(g, 0, .3, 0);
      part(body, .5, .46, .5, 0x52f0d0, 0, 0, 0, true); part(body, .34, .3, .34, 0xc8fff2, 0, .02, 0, true);
      part(body, .08, .1, .02, 0x0b2a2a, -.1, .05, -.26, true); part(body, .08, .1, .02, 0x0b2a2a, .1, .05, -.26, true);
      part(body, .1, .1, .1, 0x9ffff0, 0, .32, 0, true);
      r.body = body;
    }
    g.traverse(o => { if (o.isMesh) o.userData.mob = true; });
    return { g, r };
  }

  /* ── sistema de criaturas ── */
  class Mobs {
    constructor(scene, deps) { this.scene = scene; this.d = deps; this.list = []; this.n = 0; this.spawnT = 0; this.soundT = 0; }
    get count() { return this.list.length; }
    spawn(type, x, y, z, id) {
      const T = TYPES[type]; if (!T) return null;
      const { g, r } = model(type); g.position.set(x, y, z); this.scene.add(g);
      const m = { id: id || 'm' + (++this.n) + Math.random().toString(36).slice(2, 5), type, T, g, r, pos: g.position, vel: new THREE.Vector3(), hp: T.hp, yaw: Math.random() * 6.28, onGround: false, cd: 0, wander: 0, wdir: 0, flash: 0, ph: Math.random() * 6, burnT: 0, to: new THREE.Vector3(x, y, z) };
      this.list.push(m); return m;
    }
    remove(m, poof) { this.scene.remove(m.g); m.g.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); this.list.splice(this.list.indexOf(m), 1); if (poof) this.d.burst(m.pos.x - .5, m.pos.y, m.pos.z - .5, m.type === 'chispa' ? 0x52f0d0 : m.type === 'rocoso' ? 0x6f6f72 : 0x1d1830); }
    clear() { [...this.list].forEach(m => this.remove(m)); }
    /* golpe del jugador */
    hit(m, dmg, dir, by) {
      m.hp -= dmg; m.flash = .25; this.d.sfx('hit');
      if (dir) { m.vel.x += dir[0] * 7; m.vel.z += dir[1] * 7; m.vel.y = 4.5; m.onGround = false; }
      if (m.hp <= 0) { this.d.sfx('mobdie', m.type); this.d.onKill && this.d.onKill(m, by); this.remove(m, true); return true; }
      return false;
    }
    raycast(o, dir, max) {
      let best = null, bt = max;
      for (const m of this.list) {
        const w = m.T.w + .1, mn = [m.pos.x - w, m.pos.y, m.pos.z - w], mx = [m.pos.x + w, m.pos.y + m.T.h, m.pos.z + w];
        let t0 = 0, t1 = bt; const oo = [o.x, o.y, o.z], dd = [dir.x, dir.y, dir.z]; let ok = true;
        for (let i = 0; i < 3; i++) {
          if (Math.abs(dd[i]) < 1e-9) { if (oo[i] < mn[i] || oo[i] > mx[i]) { ok = false; break; } continue; }
          let a = (mn[i] - oo[i]) / dd[i], b = (mx[i] - oo[i]) / dd[i]; if (a > b) [a, b] = [b, a];
          t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) { ok = false; break; }
        }
        if (ok && t0 < bt) { bt = t0; best = m; }
      }
      return best ? { mob: best, t: bt } : null;
    }
    collide(m, x, y, z) {
      const w = this.d.world(), W = m.T.w;
      for (let bx = Math.floor(x - W); bx <= Math.floor(x + W); bx++) for (let by = Math.floor(y); by <= Math.floor(y + m.T.h - 1e-6); by++) for (let bz = Math.floor(z - W); bz <= Math.floor(z + W); bz++) if (SOL[w.get(bx, by, bz)]) return true;
      return false;
    }
    move(m, a, d) {
      if (!d) return false; const p = m.pos; p[a] += d;
      if (!this.collide(m, p.x, p.y, p.z)) return false;
      const W = m.T.w;
      if (a === 'y') { if (d < 0) { p.y = Math.floor(p.y) + 1; m.onGround = true; } else p.y = Math.floor(p.y + m.T.h) - m.T.h - 1e-3; m.vel.y = 0; }
      else { p[a] = d > 0 ? Math.floor(p[a] + W) - W - 1e-3 : Math.floor(p[a] - W) + 1 + W + 1e-3; m.vel[a] = 0; }
      return true;
    }
    surfaceY(x, z) { const w = this.d.world(); for (let y = 108; y > 2; y--) { const b = w.get(x, y, z); if (b) { if (!SOL[b] || b === 8 || b === 23 || b === 14) return -1; return w.get(x, y + 1, z) === 0 && w.get(x, y + 2, z) === 0 ? y + 1 : -1; } } return -1; }
    trySpawn(px, pz, type) {
      const w = this.d.world();
      for (let k = 0; k < 8; k++) {
        const a = Math.random() * Math.PI * 2, r = type ? 6 + Math.random() * 4 : 18 + Math.random() * 20;
        const x = Math.floor(px + Math.cos(a) * r), z = Math.floor(pz + Math.sin(a) * r);
        if (!w.loaded(x, z)) continue;
        const y = this.surfaceY(x, z); if (y < 0) continue;
        let t = type; if (!t) { let q = Math.random(); for (const [n, p] of WEIGHTS) { if ((q -= p) <= 0) { t = n; break; } } t = t || 'sombra'; }
        return this.spawn(t, x + .5, y, z + .5);
      }
      return null;
    }
    /* simulación (solo en el que juega solo o en el anfitrión) */
    update(dt, o) {
      const w = this.d.world(); if (!w) return;
      const players = this.d.players(), me = players[0];
      // aparecer de noche
      this.spawnT -= dt;
      if (o.spawn && o.dark && this.spawnT <= 0 && this.list.length < o.max) { this.spawnT = 1.2; this.trySpawn(me.pos.x, me.pos.z); }
      this.soundT -= dt;
      for (const m of [...this.list]) {
        const T = m.T, p = m.pos;
        if (!w.loaded(Math.floor(p.x), Math.floor(p.z))) { this.remove(m); continue; }
        // jugador más cercano
        let tgt = null, td = 1e9;
        for (const pl of players) { if (!pl.attackable) continue; const d = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z, (pl.pos.y - p.y) * .5); if (d < td) { td = d; tgt = pl; } }
        const near = Math.min(...players.map(pl => Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z)));
        if (near > 80) { this.remove(m); continue; }
        // de día: las sombras se queman al sol y el resto se va
        if (o.day) {
          if (T.burns) { const top = this.surfaceTop(p.x, p.z); if (p.y + 1 >= top) { m.burnT -= dt; if (m.burnT <= 0) { m.burnT = .5; if (this.hit(m, 2, null, 'sol')) continue; this.d.smoke(p.x, p.y + 1, p.z); } } }
          else if (near > 20 && Math.random() < dt * .05) { this.remove(m, true); continue; }
        }
        const hunt = !o.peaceful && tgt && td < 32;
        let dx = 0, dz = 0, sp = T.speed;
        if (hunt) { dx = tgt.pos.x - p.x; dz = tgt.pos.z - p.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; if (l < .6) dx = dz = 0; }
        else { m.wander -= dt; if (m.wander <= 0) { m.wander = 2 + Math.random() * 4; m.wdir = Math.random() < .35 ? NaN : Math.random() * Math.PI * 2; } if (!isNaN(m.wdir)) { dx = Math.sin(m.wdir); dz = Math.cos(m.wdir); sp *= .45; } }
        if (dx || dz) m.yaw = Math.atan2(-dx, -dz);
        const water = w.get(Math.floor(p.x), Math.floor(p.y + .4), Math.floor(p.z)) === 11;
        const kk = Math.min(1, (m.onGround ? 10 : 2) * dt);
        m.vel.x += (dx * sp - m.vel.x) * kk; m.vel.z += (dz * sp - m.vel.z) * kk;
        if (water) { m.vel.y = Math.min(m.vel.y + 20 * dt, 2.5); } else m.vel.y = Math.max(m.vel.y - 28 * dt, -50);
        if (T.hop && m.onGround && (dx || dz)) { m.vel.y = 6.5; m.onGround = false; }
        m.onGround = false;
        this.move(m, 'y', m.vel.y * dt);
        const bx = this.move(m, 'x', m.vel.x * dt), bz = this.move(m, 'z', m.vel.z * dt);
        if ((bx || bz) && (m.onGround || water) && (dx || dz)) { m.vel.y = 7.6; }
        if (!m.onGround && this.collide(m, p.x, p.y - .03, p.z) && m.vel.y <= 0) m.onGround = true;
        if (p.y < -30) { this.remove(m); continue; }
        // atacar
        m.cd -= dt;
        if (hunt && m.cd <= 0) {
          const hd = Math.hypot(tgt.pos.x - p.x, tgt.pos.z - p.z), vd = Math.abs(tgt.pos.y + .9 - (p.y + T.h / 2));
          if (hd < T.reach && vd < 1.8) { m.cd = 1.1; this.d.attack(tgt, T.dmg, T.why, [dx, dz]); if (m.r.ra) m.r.ra.rotation.x = -2; }
        }
        if (this.soundT <= 0 && td < 14 && Math.random() < dt * .4) { this.soundT = 2.5; this.d.sfx('mob', m.type); }
        this.animate(m, dt);
      }
    }
    surfaceTop(x, z) { const w = this.d.world(); for (let y = 110; y > 0; y--) { const b = w.get(Math.floor(x), y, Math.floor(z)); if (b && (SOL[b] || b === 11)) return y + 1; } return 0; }
    animate(m, dt) {
      const v = Math.hypot(m.vel.x, m.vel.z); m.ph += dt * Math.min(v, 5) * 2.4; const s = Math.sin(m.ph) * Math.min(1, v / 2) * .8;
      m.g.rotation.y += ((m.yaw - m.g.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 10);
      const r = m.r;
      if (r.ll) { r.ll.rotation.x = s; r.rl.rotation.x = -s; }
      if (m.type === 'sombra') { r.la.rotation.x += (-1.25 + s * .2 - r.la.rotation.x) * Math.min(1, dt * 8); r.ra.rotation.x += (-1.25 - s * .2 - r.ra.rotation.x) * Math.min(1, dt * 8); }
      else if (r.la) { r.la.rotation.x = -s * .8; r.ra.rotation.x += (s * .8 - r.ra.rotation.x) * Math.min(1, dt * 8); }
      if (r.body) { r.body.scale.y = m.onGround ? 1 - .15 * Math.max(0, Math.sin(m.ph * 3)) : 1.12; r.body.rotation.y += dt * 2; }
      m.flash = Math.max(0, m.flash - dt);
    }
    /* luz: las partes normales se oscurecen de noche; ojos y brillos no */
    shade(bright) {
      for (const m of this.list) m.g.traverse(o => {
        if (!o.isMesh) return; const u = o.userData;
        if (m.flash > 0) o.material.color.setRGB(1, .25, .25);
        else if (u.glow) o.material.color.copy(u.base);
        else o.material.color.copy(u.base).multiplyScalar(Math.max(.35, bright) * 1.15);
      });
    }
    /* red: el anfitrión manda el estado; los demás solo lo dibujan */
    pack() { return this.list.map(m => [m.id, m.type, +m.pos.x.toFixed(2), +m.pos.y.toFixed(2), +m.pos.z.toFixed(2), +m.yaw.toFixed(2), m.flash > 0 ? 1 : 0]); }
    applyNet(arr, dt) {
      const seen = new Set();
      for (const [id, type, x, y, z, yaw, fl] of arr) {
        seen.add(id); let m = this.list.find(q => q.id === id);
        if (!m) m = this.spawn(type, x, y, z, id);
        if (!m) continue;
        const prev = m.to.clone(); m.to.set(x, y, z); m.vel.set((x - prev.x) / Math.max(dt, .05), 0, (z - prev.z) / Math.max(dt, .05)); m.yaw = yaw; if (fl) m.flash = .2;
      }
      for (const m of [...this.list]) if (!seen.has(m.id)) this.remove(m, true);
    }
    follow(dt) { for (const m of this.list) { m.pos.lerp(m.to, Math.min(1, dt * 10)); m.onGround = true; this.animate(m, dt); } }
  }

  GC.Mobs = Mobs; GC.MOB_TYPES = TYPES;
})();
