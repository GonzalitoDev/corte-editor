/* GonzaSky — modelo de vuelo: sustentación, resistencia, empuje, pérdida, tren, frenos, aterrizajes y choques */
(function () {
  'use strict';
  const GS = window.GS;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const G = 9.81;
  const V3 = () => new THREE.Vector3();
  const _f = V3(), _u = V3(), _r = V3(), _air = V3(), _vl = V3(), _F = V3(), _ld = V3(), _vd = V3(), _qi = new THREE.Quaternion(), _dq = new THREE.Quaternion(), _e = new THREE.Euler();

  class Aircraft {
    constructor(spec) {
      this.spec = spec;
      this.pos = V3(); this.vel = V3(); this.q = new THREE.Quaternion(); this.w = V3();
      this.elev = 0; this.ail = 0; this.rud = 0; this.throttle = 0; this.rpm = 0; this.flaps = 0; this.gearDown = true; this.gearPos = 1; this.brakes = false; this.ab = false;
      this.engineOn = true; this.onGround = false; this.crashed = false; this.events = [];
      this.alpha = 0; this.beta = 0; this.ias = 0; this.vs = 0; this.agl = 0; this.gload = 1; this.stall = false;
    }
    /** coloca el avión: en tierra (sobre la pista) o en el aire con velocidad */
    place(x, y, z, hdg, speed, onGround) {
      this.pos.set(x, y, z); this.q.setFromEuler(new THREE.Euler(onGround ? this.spec.restPitch : 0, -hdg, 0, 'YXZ'));
      const f = V3().set(0, 0, -1).applyQuaternion(this.q); this.vel.copy(f).multiplyScalar(speed);
      this.w.set(0, 0, 0); this.onGround = onGround; this.crashed = false; this.events = [];
      this.gearDown = onGround || this.spec.fixedGear || speed < this.spec.vRot * 1.6; this.gearPos = this.gearDown ? 1 : 0;
      this.flaps = 0; this.brakes = false; this.engineOn = true; this.throttle = onGround ? 0 : .7; this.rpm = this.throttle;
      if (onGround) { const s = GS.surface(x, z); this.pos.y = s.y + this.spec.gearH; }
    }
    axes() { _f.set(0, 0, -1).applyQuaternion(this.q); _u.set(0, 1, 0).applyQuaternion(this.q); _r.set(1, 0, 0).applyQuaternion(this.q); return [_f, _u, _r]; }
    attitude() { _e.setFromQuaternion(this.q, 'YXZ'); return { pitch: _e.x, roll: _e.z, hdg: ((-_e.y) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) }; }
    step(dt, wind) {
      if (this.crashed) return;
      const s = this.spec, [f, u, r] = this.axes();
      const rho = 1.225 * Math.exp(-Math.max(0, this.pos.y) / 8500);
      // motor
      const tgtRpm = this.engineOn ? this.throttle : 0; this.rpm += (tgtRpm - this.rpm) * Math.min(1, dt * (s.jet ? .7 : 2.5));
      this.ab = !!s.ab && this.engineOn && this.throttle > .97;
      if (!s.fixedGear) this.gearPos = clamp(this.gearPos + (this.gearDown ? 1 : -1) * dt / 4, 0, 1);
      // aire relativo
      _air.copy(this.vel); if (wind) _air.sub(wind);
      const V = _air.length(); this.ias = V * Math.sqrt(rho / 1.225);
      _qi.copy(this.q).invert(); _vl.copy(_air).applyQuaternion(_qi);
      const fwd = Math.max(-_vl.z, .5);
      this.alpha = V > 2 ? Math.atan2(-_vl.y, fwd) : 0; this.beta = V > 2 ? Math.atan2(_vl.x, fwd) : 0;
      const flapCL = s.flapCL[this.flaps], CLmax = s.CL0 + flapCL + s.CLa * s.stall;
      let CL;
      if (this.alpha <= s.stall) CL = s.CL0 + flapCL + s.CLa * Math.max(this.alpha, -s.stall * .9);
      else CL = CLmax * Math.max(.35, 1 - (this.alpha - s.stall) * 2.4);
      this.stall = !this.onGround && V > 8 && this.alpha > s.stall * .9;
      const CD = s.CD0 + s.k * CL * CL + s.flapCD[this.flaps] + s.gearCD * this.gearPos + (this.brakes && !this.onGround ? (s.diveBrakeCD || (s.jet ? .03 : 0)) : 0);
      const Q = .5 * rho * V * V;
      _F.set(0, 0, 0);
      if (V > .5) {
        _vd.copy(_air).divideScalar(V); _ld.crossVectors(r, _vd).normalize();
        _F.addScaledVector(_ld, Q * s.S * CL);
        _F.addScaledVector(_vd, -Q * s.S * CD);
        _F.addScaledVector(r, -Q * s.S * .5 * this.beta);
      }
      let T = 0;
      if (s.jet) T = (this.ab ? s.ab : s.thrust * this.rpm) * Math.pow(rho / 1.225, .7);
      else T = s.thrust * this.rpm * Math.max(.1, 1 - V / s.vProp);
      _F.addScaledVector(f, T);
      _F.y -= s.mass * G;
      const acc = _F.divideScalar(s.mass);
      this.gload = this.onGround ? 1 : (acc.dot(u) + G * u.y) / G;
      this.vel.addScaledVector(acc, dt);
      // giros: los mandos piden una velocidad de giro y la estabilidad alinea la nariz con el viento
      const eff = clamp(V / s.vRef, 0, 1.35);
      let tp = this.elev * s.pitchRate * eff - this.alpha * s.stabP * eff;
      if (this.stall) tp -= .55;
      let ty = -this.rud * s.yawRate * eff - this.beta * s.stabY * eff;
      let tr = -this.ail * s.rollRate * eff - r.y * .25 * eff;
      if (this.onGround) { tr = 0; ty += -this.rud * s.steer * clamp(1 - V / 60, .15, 1) - this.ail * s.steer * .3 * clamp(1 - V / 30, 0, 1); }
      const k = Math.min(1, s.resp * dt);
      this.w.x += (tp - this.w.x) * k; this.w.y += (ty - this.w.y) * k; this.w.z += (tr - this.w.z) * k;
      _e.set(this.w.x * dt, this.w.y * dt, this.w.z * dt, 'XYZ'); _dq.setFromEuler(_e); this.q.multiply(_dq).normalize();
      this.pos.addScaledVector(this.vel, dt);
      this.vs = this.vel.y;
      this.ground(dt, V);
    }
    ground(dt, V) {
      const s = this.spec, g = GS.surface(this.pos.x, this.pos.z), [f, u] = this.axes();
      const bottom = this.pos.y - u.y * s.gearH;
      this.agl = bottom - g.y; this.surf = g;
      if (!this.onGround) {
        // ¿tocó el piso con algo que no sea el tren?
        if (this.agl <= 0) return this.touchdown(g, V);
        // alas o nariz contra una montaña
        const nose = this.pos.y - (GS.surface(this.pos.x + f.x * 6, this.pos.z + f.z * 6).y);
        if (nose < 0) return this.crash('Chocaste contra el terreno');
        return;
      }
      // en tierra
      if (g.type === 'water') return this.crash('Caíste al agua');
      const att = this.attitude();
      if (this.vel.y > .3 && this.agl > -.05) { this.onGround = false; this.events.push({ t: 'liftoff' }); return; }
      this.pos.y = g.y + s.gearH; if (this.vel.y < 0) this.vel.y = 0;
      const fh = V3().set(f.x, 0, f.z).normalize();
      let sp = this.vel.x * fh.x + this.vel.z * fh.z;
      const latx = this.vel.x - fh.x * sp, latz = this.vel.z - fh.z * sp, kl = Math.min(1, dt * 9);
      const rough = g.type === 'ground' ? .06 : 0;
      const decel = (this.brakes ? s.brake : 0) + (.02 + rough) * G;
      if (sp > 0) sp = Math.max(0, sp - decel * dt); else sp = Math.min(0, sp + decel * dt);
      this.vel.x = fh.x * sp + latx * (1 - kl); this.vel.z = fh.z * sp + latz * (1 - kl);
      // apoyar las ruedas: sin alabeo y con la cola dentro de lo que permite el tren
      let pitch = clamp(att.pitch, s.restPitch, s.maxPitchGround);
      if (att.pitch < s.restPitch && this.w.x < 0) this.w.x = 0;
      const roll = att.roll * Math.max(0, 1 - dt * 8);
      _e.set(pitch, -att.hdg, roll, 'YXZ'); this.q.setFromEuler(_e);
      if (rough && Math.abs(sp) > 40 && s.id === 'pampa') this.crash('Saliste de la pista a mucha velocidad');
      if (Math.abs(sp) > 1 && !this.rolling) this.rolling = true;
    }
    touchdown(g, V) {
      const s = this.spec, att = this.attitude();
      if (g.type === 'water') return this.crash('Caíste al agua');
      if (this.gearPos < .9) return this.crash('Aterrizaste sin bajar el tren');
      if (this.vel.y < s.crashVS) return this.crash('Aterrizaje demasiado fuerte');
      if (Math.abs(att.roll) > .35) return this.crash('Tocaste el piso con un ala');
      if (att.pitch < -.12) return this.crash('Entraste de nariz');
      if (att.pitch > s.maxPitchGround + .08) return this.crash('Golpeaste la cola');
      this.onGround = true;
      this.events.push({ t: 'touchdown', vs: this.vel.y, onRunway: g.type === 'runway', rw: g.rw, speed: V });
      this.vel.y = 0; this.pos.y = g.y + s.gearH;
    }
    crash(why) { if (this.crashed) return; this.crashed = true; this.events.push({ t: 'crash', why, pos: this.pos.clone() }); this.vel.set(0, 0, 0); this.w.set(0, 0, 0); }
    /** piloto automático: mantiene altura y rumbo */
    autopilot(dt, ap) {
      const att = this.attitude();
      let dh = ap.hdg - att.hdg; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      const bankT = clamp(dh * 1.6, -.45, .45);
      this.ail = clamp((bankT + att.roll) * -2.2 * -1, -1, 1);
      const vsT = clamp((ap.alt - this.pos.y) * .12, -8, 8);
      this.elev = clamp(this.elev + (vsT - this.vs) * .02 * dt * 60 * .5, -.6, .6);
      this.rud = 0;
    }
  }

  GS.Aircraft = Aircraft;
})();
