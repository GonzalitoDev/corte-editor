/* GonzaSky — instrumentos: HUD, panel, radar y mapa */
(function () {
  'use strict';
  const GS = window.GS;
  const TAU = Math.PI * 2, D = 180 / Math.PI;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const GREEN = '#7dff9a', AMBER = '#ffcf4a', RED = '#ff4d4d', WHITE = '#f4f7fb';

  class Hud {
    constructor(canvas) { this.c = canvas; this.g = canvas.getContext('2d'); this.radarRange = 12000; this.resize(); }
    resize() { const dpr = Math.min(window.devicePixelRatio || 1, 2); this.dpr = dpr; this.c.width = innerWidth * dpr; this.c.height = innerHeight * dpr; this.W = innerWidth; this.H = innerHeight; }
    units(v, kind, S) { if (kind === 'spd') return S.units === 'imp' ? Math.round(v * 1.944) : Math.round(v * 3.6); if (kind === 'alt') return S.units === 'imp' ? Math.round(v * 3.281) : Math.round(v); if (kind === 'vs') return S.units === 'imp' ? Math.round(v * 196.85 / 10) * 10 : Math.round(v * 10) / 10; }
    label(kind, S) { return S.units === 'imp' ? { spd: 'kt', alt: 'ft', vs: 'ft/min' }[kind] : { spd: 'km/h', alt: 'm', vs: 'm/s' }[kind]; }
    text(t, x, y, col = WHITE, size = 14, align = 'left', bold) { const g = this.g; g.font = `${bold ? '700 ' : '600 '}${size}px "JetBrains Mono", ui-monospace, monospace`; g.textAlign = align; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillText(t, x + 1, y + 1); g.fillStyle = col; g.fillText(t, x, y); }
    draw(st) {
      const g = this.g, W = this.W, H = this.H, S = st.S, a = st.plane;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.clearRect(0, 0, W, H);
      if (!a || st.hidden) return;
      const att = a.attitude(), small = W < 700, T = st.touch;
      g.lineWidth = 1.5; g.textBaseline = 'middle';
      // ── HUD central (cabina o si está activado) ──
      if (st.view === 'cabina' || S.hudAlways) this.pitchLadder(att, st, a);
      // ── cinta de rumbo ──
      const hdg = att.hdg * D, cx = W / 2, ty = small || T ? 22 : 28, tw = Math.min(420, W * (T ? .34 : .5));
      g.save(); g.beginPath(); g.rect(cx - tw / 2, ty - 16, tw, 34); g.clip();
      g.fillStyle = 'rgba(8,14,22,.45)'; g.fillRect(cx - tw / 2, ty - 16, tw, 34);
      for (let d = Math.floor((hdg - 60) / 5) * 5; d <= hdg + 60; d += 5) {
        const x = cx + (d - hdg) * tw / 120, dd = ((d % 360) + 360) % 360; g.strokeStyle = WHITE; g.beginPath(); g.moveTo(x, ty + 16); g.lineTo(x, ty + (dd % 10 ? 11 : 7)); g.stroke();
        if (dd % 30 === 0) this.text({ 0: 'N', 90: 'E', 180: 'S', 270: 'O' }[dd] || String(dd / 10).padStart(2, '0'), x, ty - 4, dd % 90 ? WHITE : AMBER, 13, 'center', true);
      }
      if (st.dest) { const x = cx + clamp(((st.dest.brg * D - hdg + 540) % 360) - 180, -60, 60) * tw / 120; g.fillStyle = '#d18bff'; g.beginPath(); g.moveTo(x, ty + 16); g.lineTo(x - 6, ty + 8); g.lineTo(x + 6, ty + 8); g.fill(); }
      g.restore(); g.strokeStyle = AMBER; g.beginPath(); g.moveTo(cx, ty - 18); g.lineTo(cx, ty + 18); g.stroke();
      this.text(String(Math.round(hdg) % 360).padStart(3, '0') + '°', cx, ty + 30, AMBER, 13, 'center', true);
      // ── velocidad y altura ──
      const bx = small || T ? 10 : 22, by = T ? H * .36 : H * .42, ias = this.units(a.ias, 'spd', S), alt = this.units(a.pos.y, 'alt', S), vs = a.vs;
      const box = (x, y, w, val, unit, col, align) => { g.fillStyle = 'rgba(8,14,22,.55)'; g.fillRect(x, y - 24, w, 48); g.strokeStyle = col; g.strokeRect(x, y - 24, w, 48); this.text(val, align === 'right' ? x + w - 8 : x + 8, y - 4, col, 22, align, true); this.text(unit, align === 'right' ? x + w - 8 : x + 8, y + 15, '#b9c4cf', 11, align); };
      box(bx, by, 104, String(ias), this.label('spd', S) + (a.stall ? ' · PÉRDIDA' : ''), a.stall ? RED : GREEN, 'left');
      box(W - bx - 120 - (T ? 80 : 0), by, 120, String(alt), this.label('alt', S) + ' · ' + (a.agl < 760 ? 'suelo ' + this.units(Math.max(0, a.agl), 'alt', S) : 'mar'), GREEN, 'right');
      this.text('V/S ' + (vs >= 0 ? '+' : '') + this.units(vs, 'vs', S) + ' ' + this.label('vs', S), W - bx - 8 - (T ? 80 : 0), by + 40, Math.abs(vs) > 12 && a.agl < 300 ? AMBER : WHITE, 12, 'right');
      this.text('G ' + a.gload.toFixed(1), bx + 8, by + 40, a.gload > 6 ? RED : WHITE, 12);
      // ── panel inferior izquierdo (en el celular, una línea debajo de la velocidad) ──
      const gearTxt = a.spec.fixedGear ? 'TREN FIJO' : a.gearPos >= .99 ? 'TREN ABAJO' : a.gearPos <= .01 ? 'TREN ARRIBA' : 'TREN ···';
      if (T) {
        this.text(`${Math.round(a.throttle * 100)}%${a.ab ? ' POSC.' : ''} · FLAPS ${['0', '1', '2', 'T'][a.flaps]}${a.spec.fixedGear ? '' : ' · ' + gearTxt.replace('TREN ', 'TREN ')}${a.brakes ? ' · FRENOS' : ''}${st.ap ? ' · AUTO' : ''}${a.engineOn ? '' : ' · SIN MOTOR'}`, bx, by + 60, a.engineOn ? WHITE : RED, 12, 'left', true);
      } else {
      const px = bx, py = H - (small ? 120 : 132);
      g.fillStyle = 'rgba(8,14,22,.55)'; g.fillRect(px, py, small ? 150 : 176, small ? 108 : 118);
      const thr = a.throttle; g.fillStyle = '#26323f'; g.fillRect(px + 10, py + 12, 16, 90); g.fillStyle = a.ab ? '#ff8a3a' : GREEN; g.fillRect(px + 10, py + 12 + 90 * (1 - thr), 16, 90 * thr);
      this.text(Math.round(thr * 100) + '%', px + 34, py + 20, WHITE, 13, 'left', true); this.text(a.engineOn ? (a.ab ? 'POSCOMB.' : 'MOTOR') : 'MOTOR APAGADO', px + 34, py + 38, a.engineOn ? '#b9c4cf' : RED, 11);
      this.text('FLAPS ' + ['0', '1', '2', 'TOTAL'][a.flaps], px + 34, py + 58, a.flaps ? AMBER : '#b9c4cf', 12);
      this.text(gearTxt, px + 34, py + 76, a.gearPos >= .99 ? GREEN : a.gearPos <= .01 ? '#b9c4cf' : AMBER, 12);
      this.text((a.brakes ? 'FRENOS ' : '') + (st.ap ? 'PILOTO AUTO' : ''), px + 34, py + 94, st.ap ? '#d18bff' : AMBER, 12, 'left', true);
      // horizonte artificial chico (fuera de la cabina)
      if (st.view !== 'cabina' && !small) this.attBall(att, px + 230, H - 74, 54);
      }
      // ── avisos ──
      const warn = [];
      if (a.stall) warn.push(['PÉRDIDA', RED]);
      if (st.pullUp) warn.push(['¡SUBÍ!', RED]);
      if (!a.spec.fixedGear && a.gearPos < .99 && !a.onGround && a.agl < 250 && a.vs < -1 && a.flaps >= 2) warn.push(['TREN ARRIBA', AMBER]);
      if (a.flaps && a.ias > a.spec.maxFlapSpeed) warn.push(['VELOCIDAD ALTA CON FLAPS', AMBER]);
      if (!a.engineOn) warn.push(['SIN MOTOR', AMBER]);
      warn.forEach(([t, c], i) => { if (t === 'PÉRDIDA' || t === '¡SUBÍ!') { if ((performance.now() / 300 | 0) % 2) return; } this.text(t, cx, ty + 62 + i * 26, c, 20, 'center', true); });
      // ── GPS / objetivo ──
      if (st.dest) { const d = st.dest; this.text(`${d.label} · ${(d.dist / 1000).toFixed(1)} km · ${String(Math.round(d.brg * D) % 360).padStart(3, '0')}°` + (a.vel.length() > 20 ? ` · ${Math.max(1, Math.round(d.dist / a.vel.length() / 60))} min` : ''), cx, T ? ty + 34 : H - (small ? 104 : 24), '#e2c4ff', 13, 'center', true); }
      if (st.mission && st.mission.hud) this.text(st.mission.hud, cx, ty + (T && st.dest ? 58 : 52) + warn.length * 26 + (warn.length ? 10 : 0), WHITE, T ? 13 : 15, 'center', true);
      // ── radar ──
      if (!S.noRadar) this.radar(st, a, att, small, T);
    }
    pitchLadder(att, st, a) {
      const g = this.g, W = this.W, H = this.H, cx = W / 2, cy = H / 2, ppd = H / (st.fov || 70); // pixeles por grado
      g.save(); g.translate(cx, cy); g.rotate(att.roll); g.strokeStyle = GREEN; g.fillStyle = GREEN; g.lineWidth = 1.6;
      const p = att.pitch * D;
      for (let d = -90; d <= 90; d += 5) {
        const y = (p - d) * ppd; if (Math.abs(y) > H * .38) continue;
        const w = d === 0 ? W * .28 : d % 10 ? 26 : 52; g.setLineDash(d < 0 ? [6, 5] : []);
        g.beginPath(); g.moveTo(-w, y); g.lineTo(-18, y); g.moveTo(18, y); g.lineTo(w, y); g.stroke();
        if (d && d % 10 === 0) { g.setLineDash([]); g.font = '600 11px ui-monospace,monospace'; g.textAlign = 'right'; g.fillText(String(d), -w - 6, y + 4); g.textAlign = 'left'; g.fillText(String(d), w + 6, y + 4); }
      }
      g.setLineDash([]); g.restore();
      // marcador de trayectoria (hacia dónde va el avión)
      const v = a.vel; if (v.length() > 5) {
        const q = a.q.clone().invert(), vl = v.clone().applyQuaternion(q), fx = Math.atan2(vl.x, -vl.z) * D, fy = Math.atan2(vl.y, -vl.z) * D;
        const x = cx + clamp(fx * ppd, -W * .3, W * .3), y = cy - clamp(fy * ppd, -H * .3, H * .3);
        g.strokeStyle = GREEN; g.beginPath(); g.arc(x, y, 7, 0, TAU); g.moveTo(x - 17, y); g.lineTo(x - 7, y); g.moveTo(x + 7, y); g.lineTo(x + 17, y); g.moveTo(x, y - 7); g.lineTo(x, y - 14); g.stroke();
      }
      g.strokeStyle = AMBER; g.beginPath(); g.moveTo(cx - 24, cy); g.lineTo(cx - 8, cy); g.lineTo(cx, cy + 7); g.lineTo(cx + 8, cy); g.lineTo(cx + 24, cy); g.stroke();
    }
    attBall(att, x, y, r) {
      const g = this.g; g.save(); g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
      g.translate(x, y); g.rotate(att.roll); const off = att.pitch * D * r / 40;
      g.fillStyle = '#3a7bd5'; g.fillRect(-r * 2, -r * 2 + off, r * 4, r * 2); g.fillStyle = '#8a5a2b'; g.fillRect(-r * 2, off, r * 4, r * 2);
      g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-r * 2, off); g.lineTo(r * 2, off); g.stroke();
      for (const d of [-20, -10, 10, 20]) { const yy = off - d * r / 40; g.beginPath(); g.moveTo(-r * .25, yy); g.lineTo(r * .25, yy); g.stroke(); }
      g.restore(); g.strokeStyle = AMBER; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x - r * .55, y); g.lineTo(x - r * .15, y); g.lineTo(x, y + 6); g.lineTo(x + r * .15, y); g.lineTo(x + r * .55, y); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
    }
    radar(st, a, att, small, T) {
      const g = this.g, R = T ? 50 : small ? 62 : 82, x = this.W - R - (small || T ? 10 : 22), y = T ? R + 10 : this.H - R - (small ? 10 : 22), rng = this.radarRange, k = R / rng;
      g.save(); g.beginPath(); g.arc(x, y, R, 0, TAU); g.fillStyle = 'rgba(8,14,22,.6)'; g.fill(); g.clip();
      g.translate(x, y); g.rotate(-att.hdg);
      g.strokeStyle = 'rgba(125,255,154,.18)'; for (const f of [.33, .66]) { g.beginPath(); g.arc(0, 0, R * f, 0, TAU); g.stroke(); }
      const px = a.pos.x, pz = a.pos.z;
      for (const ap of GS.AIRPORTS) {
        const dx = (ap.x - px) * k, dz = (ap.z - pz) * k; if (Math.hypot(dx, dz) > R * 1.4) continue;
        const L = Math.max(4, ap.len * k / 2); g.strokeStyle = ap === st.destAp ? '#d18bff' : WHITE; g.lineWidth = 3; g.beginPath(); g.moveTo(dx - ap.dir[0] * L, dz - ap.dir[1] * L); g.lineTo(dx + ap.dir[0] * L, dz + ap.dir[1] * L); g.stroke();
        g.save(); g.translate(dx, dz); g.rotate(att.hdg); g.font = '600 10px ui-monospace,monospace'; g.fillStyle = '#cfd8e3'; g.textAlign = 'center'; g.fillText(ap.code, 0, -8); g.restore();
      }
      if (st.rings) st.rings.forEach((r, i) => { if (i < st.ringIdx) return; const dx = (r.x - px) * k, dz = (r.z - pz) * k; g.fillStyle = i === st.ringIdx ? '#ffd400' : 'rgba(255,212,0,.4)'; g.beginPath(); g.arc(dx, dz, i === st.ringIdx ? 4 : 2.5, 0, TAU); g.fill(); });
      if (st.dest) { const dx = (st.dest.x - px) * k, dz = (st.dest.z - pz) * k, d = Math.hypot(dx, dz), s = d > R - 6 ? (R - 6) / d : 1; g.fillStyle = '#d18bff'; g.beginPath(); g.arc(dx * s, dz * s, 4, 0, TAU); g.fill(); }
      g.fillStyle = AMBER; g.font = '700 11px ui-monospace,monospace'; g.textAlign = 'center'; g.fillText('N', 0, -R + 10);
      g.restore();
      g.fillStyle = AMBER; g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x - 5, y + 6); g.lineTo(x, y + 3); g.lineTo(x + 5, y + 6); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, R, 0, TAU); g.stroke();
      this.text((rng / 1000) + ' km', x, y + R - 10, '#9fb0c0', 10, 'center');
    }
  }

  /* ── mapa grande ── */
  class BigMap {
    constructor(canvas) { this.c = canvas; this.g = canvas.getContext('2d'); this.span = 130000; this.img = null; this.view = { x: 0, z: 0, scale: 1 }; }
    async prepare(onProgress) {
      if (this.img) return;
      const N = 320, img = new ImageData(N, N), half = this.span / 2, step = this.span / N;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const x = -half + i * step, z = -half + j * step, h = GS.height(x, z), c = GS.mapColor(x, z, h), o = (j * N + i) * 4;
          img.data[o] = c[0] * 255; img.data[o + 1] = c[1] * 255; img.data[o + 2] = c[2] * 255; img.data[o + 3] = 255;
        }
        if (j % 16 === 15) { onProgress && onProgress(j / N); await new Promise(r => setTimeout(r, 0)); }
      }
      const cv = document.createElement('canvas'); cv.width = cv.height = N; cv.getContext('2d').putImageData(img, 0, 0); this.img = cv;
    }
    resize() { const dpr = Math.min(devicePixelRatio || 1, 2); this.dpr = dpr; this.c.width = innerWidth * dpr; this.c.height = innerHeight * dpr; }
    toScreen(x, z) { const s = Math.min(innerWidth, innerHeight) / this.span * this.view.scale; return [innerWidth / 2 + (x - this.view.x) * s, innerHeight / 2 + (z - this.view.z) * s]; }
    toWorld(sx, sy) { const s = Math.min(innerWidth, innerHeight) / this.span * this.view.scale; return [(sx - innerWidth / 2) / s + this.view.x, (sy - innerHeight / 2) / s + this.view.z]; }
    draw(plane, destAp, rings, ringIdx) {
      const g = this.g; g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.fillStyle = '#0b1f2e'; g.fillRect(0, 0, innerWidth, innerHeight);
      if (this.img) { const [x0, y0] = this.toScreen(-this.span / 2, -this.span / 2), [x1, y1] = this.toScreen(this.span / 2, this.span / 2); g.imageSmoothingEnabled = true; g.drawImage(this.img, x0, y0, x1 - x0, y1 - y0); }
      g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1;
      for (let v = -60000; v <= 60000; v += 10000) { const [a1, b1] = this.toScreen(v, -65000), [a2, b2] = this.toScreen(v, 65000); g.beginPath(); g.moveTo(a1, b1); g.lineTo(a2, b2); g.stroke(); const [c1, d1] = this.toScreen(-65000, v), [c2, d2] = this.toScreen(65000, v); g.beginPath(); g.moveTo(c1, d1); g.lineTo(c2, d2); g.stroke(); }
      if (rings) { g.fillStyle = '#ffd400'; rings.forEach((r, i) => { if (i < ringIdx) return; const [x, y] = this.toScreen(r.x, r.z); g.beginPath(); g.arc(x, y, i === ringIdx ? 5 : 3, 0, TAU); g.fill(); }); }
      this.hits = [];
      for (const ap of GS.AIRPORTS) {
        const [x, y] = this.toScreen(ap.x, ap.z), s = Math.min(innerWidth, innerHeight) / this.span * this.view.scale, L = Math.max(6, ap.len * s / 2);
        g.strokeStyle = ap === destAp ? '#d18bff' : '#fff'; g.lineWidth = 4; g.beginPath(); g.moveTo(x - ap.dir[0] * L, y - ap.dir[1] * L); g.lineTo(x + ap.dir[0] * L, y + ap.dir[1] * L); g.stroke();
        g.font = '700 13px Figtree, sans-serif'; g.textAlign = 'left'; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(ap.name + ' (' + ap.code + ')', x + 11, y + 1); g.fillStyle = ap === destAp ? '#e2c4ff' : '#fff'; g.fillText(ap.name + ' (' + ap.code + ')', x + 10, y);
        g.font = '12px Figtree, sans-serif'; g.fillStyle = '#c9d6e2'; g.fillText(`${ap.len} m · ${ap.e} m de altura`, x + 10, y + 16);
        this.hits.push([x, y, ap]);
      }
      if (plane) { const [x, y] = this.toScreen(plane.pos.x, plane.pos.z), h = plane.attitude().hdg; g.save(); g.translate(x, y); g.rotate(h); g.fillStyle = '#ffcf4a'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -12); g.lineTo(-8, 9); g.lineTo(0, 5); g.lineTo(8, 9); g.closePath(); g.fill(); g.stroke(); g.restore(); if (destAp) { const [dx, dy] = this.toScreen(destAp.x, destAp.z); g.setLineDash([8, 6]); g.strokeStyle = '#d18bff'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(dx, dy); g.stroke(); g.setLineDash([]); } }
    }
    hit(sx, sy) { let best = null, bd = 30; for (const [x, y, ap] of this.hits || []) { const d = Math.hypot(sx - x, sy - y); if (d < bd) { bd = d; best = ap; } } return best; }
  }

  Object.assign(GS, { Hud, BigMap });
})();
