/* GonzaSky — aviones (diseños originales): datos de vuelo y modelos 3D */
(function () {
  'use strict';
  const GS = window.GS;

  /* Datos de vuelo. Unidades: kg, m², N, m/s, rad/s */
  const SPECS = {
    gaucho: {
      id: 'gaucho', name: 'Gaucho 172', tipo: 'Avioneta', desc: 'Fácil de volar, despega en pistas cortas y aterriza lento. Ideal para aprender.',
      hp: 60, mass: 1100, S: 16.2, CL0: .3, CLa: 5.2, stall: .27, CD0: .031, k: .06, thrust: 3700, prop: true, vProp: 100,
      pitchRate: 1.25, rollRate: 1.7, yawRate: .55, resp: 3.2, stabP: 3.2, stabY: 2.2, vRef: 42,
      flapCL: [0, .25, .45, .7], flapCD: [0, .008, .025, .055], gearCD: 0, fixedGear: true,
      gearH: 1.28, restPitch: .03, maxPitchGround: .2, crashVS: -4.5, brake: 4.5, steer: .9,
      eye: [0, .75, -1.1], chase: 13, cruise: 52, vRot: 28, maxFlapSpeed: 50, stars: [1, 5, 5],
    },
    pampa: {
      id: 'pampa', name: 'Pampa 320', tipo: 'Avión de línea', desc: 'Grande y pesado. Necesita pistas largas, pero vuela rápido y alto. Tren retráctil.',
      hp: 170, mass: 62000, S: 122, CL0: .22, CLa: 5.4, stall: .25, CD0: .021, k: .045, thrust: 235000, jet: true,
      pitchRate: .5, rollRate: .75, yawRate: .22, resp: 1.6, stabP: 2.2, stabY: 1.6, vRef: 120,
      flapCL: [0, .35, .6, .95], flapCD: [0, .01, .03, .06], gearCD: .018,
      gearH: 3.55, restPitch: 0, maxPitchGround: .2, crashVS: -3.6, brake: 3.2, steer: .35,
      eye: [0, 1.1, -15.2], chase: 52, cruise: 220, vRot: 72, maxFlapSpeed: 120, stars: [4, 2, 2],
    },
    condor: {
      id: 'condor', name: 'Cóndor F-1', tipo: 'Caza', desc: 'Rapidísimo y muy ágil, con 4 misiles (V). Con el motor al máximo se prende la poscombustión.',
      missiles: 4, hp: 100, mass: 10500, S: 38, CL0: .08, CLa: 4.6, stall: .42, CD0: .019, k: .11, thrust: 95000, ab: 150000, jet: true,
      pitchRate: 2.2, rollRate: 4.4, yawRate: .5, resp: 5.5, stabP: 3.6, stabY: 2.6, vRef: 95,
      flapCL: [0, .18, .3, .45], flapCD: [0, .008, .02, .04], gearCD: .02,
      gearH: 2.25, restPitch: 0, maxPitchGround: .26, crashVS: -5, brake: 4, steer: .5,
      eye: [0, 1.05, -4.6], chase: 22, cruise: 250, vRot: 75, maxFlapSpeed: 130, stars: [5, 1, 3],
    },
    stuka: {
      id: 'stuka', name: 'Stuka Ju 87', tipo: 'Bombardero · 2ª Guerra', desc: 'El clásico de la Segunda Guerra Mundial, con sirena y frenos de picada (B en el aire). Lleva 5 bombas (X) y 6 misiles guiados (V).',
      mass: 4300, S: 31.9, CL0: .25, CLa: 5, stall: .26, CD0: .036, k: .065, thrust: 36000, prop: true, vProp: 145,
      pitchRate: 1.1, rollRate: 1.5, yawRate: .5, resp: 3, stabP: 3, stabY: 2.2, vRef: 75,
      flapCL: [0, .2, .35, .5], flapCD: [0, .01, .03, .05], gearCD: .012, fixedGear: true, diveBrakeCD: .1, siren: true, bombs: true, missiles: 6, hp: 110,
      gearH: 1.9, restPitch: .1, maxPitchGround: .22, crashVS: -4.2, brake: 4, steer: .8,
      eye: [0, 1.05, -1.6], chase: 18, cruise: 80, vRot: 40, maxFlapSpeed: 70, stars: [2, 3, 3],
    },
  };

  /* ── utilidades de modelado ── */
  const M = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: .55, metalness: .15 }, o));
  function mesh(geo, mat, x = 0, y = 0, z = 0, parent) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (parent) parent.add(m); return m; }
  function tube(rFront, rBack, len, mat, z, y = 0, parent, seg = 18) { const g = new THREE.CylinderGeometry(rFront, rBack, len, seg); g.rotateX(Math.PI / 2); return mesh(g, mat, 0, y, z, parent); } // eje en Z; rFront hacia -Z
  /** placa con planta dada en el plano XZ (puntos [x,z]) y espesor */
  function planform(pts, thick, mat, parent, y = 0) {
    const sh = new THREE.Shape(); pts.forEach(([x, z], i) => i ? sh.lineTo(x, -z) : sh.moveTo(x, -z));
    const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, -thick / 2 + y, 0);
    return mesh(g, mat, 0, 0, 0, parent);
  }
  function fin(pts, thick, mat, parent, x = 0) { // planta en el plano YZ (puntos [y,z])
    const m = planform(pts.map(([y, z]) => [y, z]), thick, mat, null); m.geometry.rotateZ(Math.PI / 2); m.position.x = x; if (parent) parent.add(m); return m;
  }
  function pivot(parent, x, y, z) { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; }
  function wheel(parent, x, y, z, r, w, mat) { const g = new THREE.CylinderGeometry(r, r, w, 14); g.rotateZ(Math.PI / 2); return mesh(g, mat, x, y, z, parent); }
  function gearLeg(parent, x, z, top, bottom, r, mats, pair) {
    const g = pivot(parent, x, top, z), len = top - bottom - r;
    const leg = new THREE.CylinderGeometry(.06 + r * .15, .06 + r * .15, len, 6); leg.translate(0, -len / 2, 0); mesh(leg, mats.metal, 0, 0, 0, g);
    if (pair) { wheel(g, -r * .55, -len, 0, r, r * .8, mats.tire); wheel(g, r * .55, -len, 0, r, r * .8, mats.tire); } else wheel(g, 0, -len, 0, r, r * .8, mats.tire);
    return g;
  }
  function navLights(parent, l, r, tail) {
    const mk = c => new THREE.MeshBasicMaterial({ color: c });
    mesh(new THREE.SphereGeometry(.12, 8, 6), mk(0xff2a2a), ...l, parent); mesh(new THREE.SphereGeometry(.12, 8, 6), mk(0x2aff5a), ...r, parent);
    const s = mesh(new THREE.SphereGeometry(.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), ...tail, parent); return s;
  }
  function textPanel(text, w, h, color, bg) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 64; const g = c.getContext('2d');
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, 512, 64); }
    g.font = 'italic bold 44px sans-serif'; g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(text, 10, 34);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: t, transparent: !bg, side: THREE.DoubleSide, toneMapped: false });
  }

  /* ── modelos ── */
  function buildGaucho() {
    const root = new THREE.Group(), p = {};
    const white = M(0xf2f2ee), red = M(0xc8242b), dark = M(0x23262b), glass = M(0x2a3f55, { roughness: .1, metalness: .6 }), metal = M(0x9aa0a6, { metalness: .6 }), tire = M(0x151515, { roughness: .9 });
    tube(.62, .62, 2.6, white, -1.2, .2, root); tube(.6, .22, 4.4, white, 2.3, .25, root); tube(.45, .62, 1.0, white, -3, .15, root);
    tube(.18, .45, .5, dark, -3.75, .15, root);
    const sp = new THREE.ConeGeometry(.2, .45, 12); sp.rotateX(-Math.PI / 2); mesh(sp, red, 0, .15, -4.15, root);
    p.prop = pivot(root, 0, .15, -4.05); mesh(new THREE.BoxGeometry(.18, 1.85, .05), dark, 0, 0, 0, p.prop); mesh(new THREE.BoxGeometry(.18, 1.85, .05), dark, 0, 0, 0, p.prop).rotation.z = Math.PI / 2;
    p.disc = mesh(new THREE.CircleGeometry(.95, 24), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }), 0, .15, -4.02, root);
    mesh(new THREE.BoxGeometry(1.08, .55, 1.9), glass, 0, .72, -1.05, root);
    mesh(new THREE.BoxGeometry(1.26, .08, 4.8), red, 0, -.05, .2, root); // franja
    planform([[-5.6, -1.55], [5.6, -1.55], [5.6, -.1], [-5.6, -.1]], .14, white, root, 1.05);
    p.ailL = pivot(root, -4.2, 1.05, -.1); mesh(new THREE.BoxGeometry(2.4, .08, .4), red, 0, 0, .2, p.ailL);
    p.ailR = pivot(root, 4.2, 1.05, -.1); mesh(new THREE.BoxGeometry(2.4, .08, .4), red, 0, 0, .2, p.ailR);
    for (const sx of [-1, 1]) { const st = new THREE.CylinderGeometry(.04, .04, 2.3, 5); const m = mesh(st, metal, sx * 1.4, .25, -.8, root); m.rotation.z = sx * .9; }
    planform([[-1.8, 3.4], [1.8, 3.4], [1.5, 4.1], [-1.5, 4.1]], .08, white, root, .3);
    p.elev = pivot(root, 0, .3, 4.1); mesh(new THREE.BoxGeometry(3, .06, .5), red, 0, 0, .25, p.elev);
    fin([[.3, 3.3], [1.8, 4.0], [1.8, 4.5], [.3, 4.5]], .08, white, root);
    p.rud = pivot(root, 0, 1.1, 4.5); mesh(new THREE.BoxGeometry(.06, 1.5, .45), red, 0, 0, .22, p.rud);
    const mats = { metal, tire };
    p.gear = [gearLeg(root, -1.15, -.1, -.3, -1.28, .3, mats), gearLeg(root, 1.15, -.1, -.3, -1.28, .3, mats), gearLeg(root, 0, -2.6, -.3, -1.28, .24, mats)];
    p.strobe = navLights(root, [-5.6, 1.05, -.8], [5.6, 1.05, -.8], [0, 1.9, 4.5]);
    return { root, p };
  }
  function buildPampa() {
    const root = new THREE.Group(), p = {};
    const white = M(0xf4f5f7), blue = M(0x1f4aa8), sky = M(0x5fb3ff), dark = M(0x1c2026), glass = M(0x14222f, { roughness: .1, metalness: .7 }), metal = M(0xa8aeb4, { metalness: .7 }), tire = M(0x111111, { roughness: .9 }), belly = M(0xc9ccd1);
    tube(2, 2, 26, white, 0, 0, root, 24);
    const nose = new THREE.SphereGeometry(2, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2); nose.rotateX(-Math.PI / 2); nose.scale(1, 1, 2.2); mesh(nose, white, 0, 0, -13, root);
    tube(2, .6, 9, white, 17.5, .6, root, 20);
    mesh(new THREE.BoxGeometry(3.2, .5, .8), glass, 0, .75, -16.2, root).rotation.x = -.35;
    for (const sx of [-1, 1]) { const w = mesh(new THREE.BoxGeometry(.05, .25, 22), dark, sx * 1.99, .55, 0, root); }
    mesh(new THREE.BoxGeometry(4.02, .55, 30), blue, 0, -.35, 1, root).scale.set(1, 1, 1);
    const lw = textPanel('Aerolíneas Gonza', 1, 1, '#1f4aa8');
    for (const sx of [-1, 1]) { const m = mesh(new THREE.PlaneGeometry(12, 1.5), lw, sx * 2.03, 1.15, -4, root); m.rotation.y = sx * Math.PI / 2; if (sx < 0) m.scale.x = -1; }
    mesh(new THREE.BoxGeometry(4.2, 1.5, 9), belly, 0, -1.3, -1, root);
    planform([[-17, 3], [-2, -4.5], [2, -4.5], [17, 3], [17, 5], [2, 3], [-2, 3], [-17, 5]], .45, white, root, -.9);
    p.ailL = pivot(root, -13.5, -.9, 4.3); mesh(new THREE.BoxGeometry(4.5, .2, .8), metal, 0, 0, .4, p.ailL);
    p.ailR = pivot(root, 13.5, -.9, 4.3); mesh(new THREE.BoxGeometry(4.5, .2, .8), metal, 0, 0, .4, p.ailR);
    for (const sx of [-1, 1]) { tube(1.15, 1, 4.2, sky, -2.5, -2.1, null).position.x = 0; const n = tube(1.15, .95, 4.4, metal, -2.6, -2.2, root); n.position.x = sx * 6.5; const d = mesh(new THREE.CircleGeometry(1, 20), dark, sx * 6.5, -2.2, -4.82, root); d.rotation.y = Math.PI; mesh(new THREE.BoxGeometry(.3, 1.1, 2.5), metal, sx * 6.5, -1.3, -1.9, root); }
    planform([[-6.2, 17.5], [-1, 15], [1, 15], [6.2, 17.5], [6.2, 19], [1, 18.6], [-1, 18.6], [-6.2, 19]], .25, white, root, 1.1);
    p.elev = pivot(root, 0, 1.1, 18.9); mesh(new THREE.BoxGeometry(11, .15, .8), metal, 0, 0, .4, p.elev);
    fin([[1.5, 14.5], [8.5, 19.8], [8.5, 21.6], [1.5, 21]], .3, blue, root);
    p.rud = pivot(root, 0, 5, 21.3); mesh(new THREE.BoxGeometry(.25, 6.2, 1), sky, 0, 0, .3, p.rud);
    const mats = { metal, tire };
    p.gear = [gearLeg(root, -3, 1.5, -1.6, -3.55, .55, mats, true), gearLeg(root, 3, 1.5, -1.6, -3.55, .55, mats, true), gearLeg(root, 0, -11.5, -1.6, -3.55, .42, mats, true)];
    p.strobe = navLights(root, [-17, -.9, 4], [17, -.9, 4], [0, 1, 22.2]);
    return { root, p };
  }
  function buildCondor() {
    const root = new THREE.Group(), p = {};
    const gray = M(0x7d8790, { roughness: .45, metalness: .35 }), dgray = M(0x555d65, { roughness: .5, metalness: .35 }), dark = M(0x1d2024), glass = M(0x6b5a2a, { roughness: .05, metalness: .8, transparent: true, opacity: .85 }), metal = M(0x9aa0a6, { metalness: .7 }), tire = M(0x111111, { roughness: .9 });
    tube(.95, .8, 9, gray, .5, 0, root, 18); tube(.3, .95, 4, gray, -6, 0, root, 18);
    const tip = new THREE.ConeGeometry(.3, 1.6, 16); tip.rotateX(-Math.PI / 2); mesh(tip, dgray, 0, 0, -8.8, root);
    const can = new THREE.SphereGeometry(.62, 16, 10); can.scale(1, .75, 3.2); mesh(can, glass, 0, .72, -4.4, root);
    tube(.85, .75, 1.6, dark, 5.6, 0, root, 18);
    p.flame = mesh((() => { const g = new THREE.ConeGeometry(.65, 4, 16, 1, true); g.rotateX(Math.PI / 2); g.translate(0, 0, 2); return g; })(), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 0, 0, 6.4, root);
    for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(.7, 1, 4), dgray, sx * 1.1, -.25, -1.8, root);
    planform([[-5.2, 3.2], [-1, -3.5], [1, -3.5], [5.2, 3.2], [5.2, 4.2], [-5.2, 4.2]], .22, gray, root, -.1);
    p.ailL = pivot(root, -3.6, -.1, 4.2); mesh(new THREE.BoxGeometry(2.6, .14, .7), dgray, 0, 0, .35, p.ailL);
    p.ailR = pivot(root, 3.6, -.1, 4.2); mesh(new THREE.BoxGeometry(2.6, .14, .7), dgray, 0, 0, .35, p.ailR);
    planform([[-2.8, 5.8], [-.6, 4.4], [.6, 4.4], [2.8, 5.8], [2.8, 6.5], [-2.8, 6.5]], .12, gray, root, .1);
    p.elev = pivot(root, 0, .1, 6.5); mesh(new THREE.BoxGeometry(5.4, .1, .5), dgray, 0, 0, .2, p.elev);
    fin([[.6, 2.8], [3.6, 5.6], [3.6, 6.6], [.6, 6.2]], .15, gray, root);
    p.rud = pivot(root, 0, 2.2, 6.5); mesh(new THREE.BoxGeometry(.12, 2.6, .55), dgray, 0, 0, .2, p.rud);
    for (const sx of [-1, 1]) { const r = mesh(new THREE.CircleGeometry(.55, 20), new THREE.MeshBasicMaterial({ color: 0x5fb3ff }), sx * 3.2, .03, 1.2, root); r.rotation.x = -Math.PI / 2; const r2 = mesh(new THREE.CircleGeometry(.28, 20), new THREE.MeshBasicMaterial({ color: 0xffffff }), sx * 3.2, .04, 1.2, root); r2.rotation.x = -Math.PI / 2; }
    // 4 misiles bajo las alas
    p.missiles = [];
    for (const [x, z] of [[2.6, 1.5], [3.9, 2.6]]) for (const sx of [-1, 1]) { const m = missileMesh(); m.position.set(sx * x, -.38, z); root.add(m); mesh(new THREE.BoxGeometry(.06, .16, .9), metal, sx * x, -.24, z, root); p.missiles.push(m); }
    const mats = { metal, tire };
    p.gear = [gearLeg(root, -1.6, 1, -.5, -2.25, .38, mats), gearLeg(root, 1.6, 1, -.5, -2.25, .38, mats), gearLeg(root, 0, -5.6, -.5, -2.25, .3, mats)];
    p.strobe = navLights(root, [-5.2, -.1, 3.7], [5.2, -.1, 3.7], [0, 3.6, 6.6]);
    return { root, p };
  }
  /* ── texturas pintadas a mano en un canvas: camuflaje de astillas, paneles, remaches y desgaste ── */
  function rng(seed) { let x = seed >>> 0 || 1; return () => ((x = Math.imul(x ^ (x >>> 15), 2246822507) ^ Math.imul(x ^ (x >>> 13), 3266489909), (x ^= x >>> 16) >>> 0) / 4294967296); }
  const texCache = {};
  function paintTex(key, o) {
    if (!texCache[key]) {
      const N = 512, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), r = rng(o.seed || 7);
      g.fillStyle = o.base; g.fillRect(0, 0, N, N);
      // manchas angulosas (camuflaje de astillas), repetidas en los bordes para que la textura empalme
      if (o.splinter) for (let i = 0; i < o.splinter.n; i++) {
        const cx = r() * N, cy = r() * N, pts = []; let ang = r() * 6.28; const k = 4 + (r() * 3 | 0);
        for (let j = 0; j < k; j++) { ang += 6.28 / k * (.6 + r() * .8); const rad = o.splinter.size * (.5 + r()); pts.push([Math.cos(ang) * rad, Math.sin(ang) * rad]); }
        g.fillStyle = o.splinter.colors[i % o.splinter.colors.length];
        for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) { g.beginPath(); pts.forEach(([x, y], j) => j ? g.lineTo(cx + x + ox, cy + y + oy) : g.moveTo(cx + x + ox, cy + y + oy)); g.closePath(); g.fill(); }
      }
      // desgaste: puntitos y rayas claras/oscuras
      for (let i = 0; i < 2600; i++) { g.fillStyle = r() < .5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)'; const w = 1 + r() * 3; g.fillRect(r() * N, r() * N, w, r() < .2 ? w * 6 : w); }
      // líneas de paneles y remaches
      const step = o.panel || 64;
      g.strokeStyle = 'rgba(0,0,0,.42)'; g.lineWidth = 1.6;
      for (let x = 0; x <= N; x += step) { g.beginPath(); g.moveTo(x + .5, 0); g.lineTo(x + .5, N); g.stroke(); }
      for (let y = 0; y <= N; y += step * 1.5) { const off = (y / (step * 1.5)) % 2 ? step / 2 : 0; for (let x = 0; x < N; x += step) { g.beginPath(); g.moveTo(x + off, y + .5); g.lineTo(x + off + step, y + .5); g.stroke(); } }
      g.fillStyle = 'rgba(0,0,0,.28)'; for (let x = 0; x <= N; x += step) for (let y = 4; y < N; y += 9) g.fillRect(x + 3, y, 1.6, 1.6);
      g.fillStyle = 'rgba(255,255,255,.12)'; for (let x = 0; x <= N; x += step) for (let y = 4; y < N; y += 9) g.fillRect(x + 3.6, y - .6, 1, 1);
      texCache[key] = c;
    }
    const t = new THREE.CanvasTexture(texCache[key]); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (o.repeat) t.repeat.set(o.repeat[0], o.repeat[1]); return t;
  }
  const CAMO = { base: '#56674a', splinter: { n: 26, size: 70, colors: ['#3a4934', '#4b5c41', '#33402d'] }, seed: 11, panel: 64 };
  const BLUE = { base: '#8fb0c4', seed: 3, panel: 64 };
  const TAN = { base: '#a08e62', splinter: { n: 22, size: 60, colors: ['#7d6d48', '#8f7b52', '#6b5a3c'] }, seed: 29, panel: 96 };

  /** panel de ala que arranca en (x0,y0) y sale hacia afuera con un ángulo diedro; devuelve el grupo y el punto final */
  function wingPanel(parent, side, x0, y0, span, ang, zle0, c0, zle1, c1, mat, thick) {
    const g = new THREE.Group(); g.position.set(side * x0, y0, 0); g.rotation.z = side * ang; parent.add(g);
    planform([[0, zle0], [side * span, zle1], [side * span, zle1 + c1], [0, zle0 + c0]], thick, mat, g);
    return { g, x: x0 + span * Math.cos(ang), y: y0 + span * Math.sin(ang) };
  }
  function buildStuka() {
    const root = new THREE.Group(), p = {};
    // texturas: en el fuselaje (cilindros) la imagen se envuelve; en las alas se mide en metros
    const tx = (o, r) => paintTex(o === CAMO ? 'camo' : 'blue', Object.assign({ repeat: r }, o));
    const green = M(0xffffff, { map: tx(CAMO, [2, 1.6]), bumpMap: tx(CAMO, [2, 1.6]), bumpScale: .015, roughness: .82, metalness: .05 });
    const greenW = M(0xffffff, { map: tx(CAMO, [.22, .22]), bumpMap: tx(CAMO, [.22, .22]), bumpScale: .015, roughness: .82, metalness: .05 });
    const dgreen = M(0x9aaa92, { map: tx(CAMO, [.6, .6]), roughness: .8, metalness: .05 });
    const under = M(0xffffff, { map: tx(BLUE, [1, 4]), roughness: .75, metalness: .05 }), underW = M(0xffffff, { map: tx(BLUE, [.22, .22]), roughness: .75, metalness: .05 }), yellow = M(0xd6ae3c, { roughness: .7 });
    const glass = M(0xaac4d4, { roughness: .08, metalness: .4, transparent: true, opacity: .8 }), frame = M(0x3b4a35), dark = M(0x1b1d1f), metal = M(0x8a9096, { metalness: .6 }), tire = M(0x151515, { roughness: .9 });
    // fuselaje: motor, cabina larga y cola
    tube(.62, .78, 2.4, green, -4.4, .1, root); tube(.78, .8, 3.8, green, -1.3, .1, root); tube(.8, .26, 6.2, green, 3.7, .22, root);
    mesh(new THREE.BoxGeometry(1.5, .1, 13.5), under, 0, -.55, 0, root).scale.set(.9, 1, 1); // panza clara
    mesh(new THREE.BoxGeometry(.9, .55, 1.5), dgreen, 0, -.62, -4.1, root); // radiador bajo la nariz
    for (let i = 0; i < 6; i++) mesh(new THREE.BoxGeometry(.16, .1, .5), dark, (i % 2 ? .35 : -.35), .05 + (i >> 1) * .22 - .2, -4.6 + (i >> 1) * .05, root); // escapes
    const sp = new THREE.ConeGeometry(.4, .7, 14); sp.rotateX(-Math.PI / 2); mesh(sp, dgreen, 0, .1, -5.95, root);
    p.prop = pivot(root, 0, .1, -5.7);
    for (let i = 0; i < 3; i++) { const b = new THREE.Group(); b.rotation.z = i * Math.PI * 2 / 3; p.prop.add(b); mesh(new THREE.BoxGeometry(.24, 1.7, .06), dark, 0, .95, 0, b); mesh(new THREE.BoxGeometry(.25, .14, .07), yellow, 0, 1.75, 0, b); }
    p.disc = mesh(new THREE.CircleGeometry(1.75, 28), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }), 0, .1, -5.66, root);
    // cabina tipo invernadero con dos tripulantes
    const can = new THREE.BoxGeometry(.86, .62, 3.9); mesh(can, glass, 0, .98, -1.35, root);
    for (let i = 0; i < 6; i++) { mesh(new THREE.BoxGeometry(.04, .64, .05), frame, -.44, .98, -3.2 + i * .74, root); mesh(new THREE.BoxGeometry(.04, .64, .05), frame, .44, .98, -3.2 + i * .74, root); mesh(new THREE.BoxGeometry(.9, .04, .05), frame, 0, 1.3, -3.2 + i * .74, root); }
    mesh(new THREE.BoxGeometry(.06, .06, 3.9), frame, 0, 1.3, -1.35, root);
    for (const z of [-2.1, -.3]) { mesh(new THREE.SphereGeometry(.2, 10, 8), dark, 0, .82, z, root); }
    const gun = new THREE.CylinderGeometry(.03, .03, 1, 6); gun.rotateX(Math.PI / 2); mesh(gun, dark, 0, 1.05, .9, root).rotation.x = -.25;
    mesh(new THREE.BoxGeometry(1.62, 1.62, .55), yellow, 0, .22, 4.1, root).scale.set(.32, .34, 1); // franja amarilla en la cola
    // ala de gaviota invertida: tramo interno hacia abajo y externo hacia arriba
    p.dive = []; const wb = [], ms = [];
    const mount = (par, x, y, z, mat) => mesh(new THREE.BoxGeometry(.06, .2, .9), mat, x, y, z, par);
    for (const side of [-1, 1]) {
      const inner = wingPanel(root, side, .55, -.42, 2.45, -.27, -1.75, 2.75, -1.6, 2.45, greenW, .3);
      const outer = wingPanel(root, side, inner.x, inner.y, 5.1, .17, -1.6, 2.45, -1.0, 1.35, greenW, .2);
      planform([[0, -1.6], [side * 5.1, -1.0], [side * 5.1, .35], [0, .85]], .02, underW, outer.g, -.11);
      planform([[0, -1.75], [side * 2.45, -1.6], [side * 2.45, .85], [0, 1]], .02, underW, inner.g, -.16);
      planform([[side * 4.4, -1.1], [side * 5.1, -1.0], [side * 5.1, .35], [side * 4.4, .45]], .03, yellow, outer.g, -.13); // puntas amarillas abajo
      const ail = pivot(outer.g, side * 3.8, 0, .55); mesh(new THREE.BoxGeometry(2.4, .08, .5), dgreen, 0, 0, .25, ail);
      if (side < 0) p.ailL = ail; else p.ailR = ail;
      const db = pivot(outer.g, side * 1.5, -.2, -1.0); mesh(new THREE.BoxGeometry(1.5, .05, .32), metal, 0, 0, .16, db); p.dive.push(db); // freno de picada
      // tren fijo con polainas en el quiebre del ala
      const gx = side * inner.x, gy = inner.y;
      const leg = new THREE.CylinderGeometry(.13, .16, gy + 1.6, 8); leg.translate(0, -(gy + 1.6) / 2, 0); mesh(leg, green, gx, gy, -1.0, root);
      const spat = new THREE.SphereGeometry(.5, 14, 10); spat.scale(.5, 1.05, 1.45); mesh(spat, green, gx, -1.48, -1.0, root);
      wheel(root, gx, -1.61, -1.0, .4, .2, tire);
      // 2 bombas chicas y 3 misiles bajo cada ala (se ven mientras queden)
      for (const k of [0, 1]) { const b = bombMesh(.55, dgreen, dark); b.position.set(side * (1.0 + k * .95), -.42, -.55); outer.g.add(b); wb[k * 2 + (side < 0 ? 0 : 1)] = b; }
      for (const k of [0, 1, 2]) { const m = missileMesh(); m.position.set(side * (2.55 + k * .6), -.36, -.9); outer.g.add(m); mount(outer.g, side * (2.55 + k * .6), -.2, -.9, metal); ms[k * 2 + (side < 0 ? 0 : 1)] = m; }
    }
    p.wingBombs = wb; p.missiles = ms;
    // bomba grande bajo el fuselaje (se suelta con X)
    p.bomb = bombMesh(1, dgreen, dark); p.bomb.position.set(0, -1.05, -.8); root.add(p.bomb);
    mesh(new THREE.BoxGeometry(.06, .5, .2), dark, 0, .3, 0, p.bomb);
    // cola
    planform([[-2.8, 6.2], [-.4, 5.6], [.4, 5.6], [2.8, 6.2], [2.8, 7.1], [-2.8, 7.1]], .12, green, root, .55);
    p.elev = pivot(root, 0, .55, 7.1); mesh(new THREE.BoxGeometry(5.4, .08, .5), dgreen, 0, 0, .25, p.elev);
    for (const sx of [-1, 1]) { const st = new THREE.CylinderGeometry(.035, .035, 1.25, 5); const m = mesh(st, metal, sx * .75, .02, 6.5, root); m.rotation.z = sx * .7; }
    fin([[.4, 5.4], [2.25, 6.6], [2.25, 7.3], [.4, 7.3]], .12, green, root);
    p.rud = pivot(root, 0, 1.35, 7.3); mesh(new THREE.BoxGeometry(.08, 1.9, .55), dgreen, 0, 0, .27, p.rud);
    // rueda de cola
    const tl = new THREE.CylinderGeometry(.05, .05, .85, 6); tl.translate(0, -.43, 0); mesh(tl, metal, 0, -.13, 7, root);
    wheel(root, 0, -1.03, 7, .18, .12, tire);
    // manchas de camuflaje arriba
    for (const [z, w, d, r] of [[-3.9, .7, 1.1, .4], [2.4, .62, 1.8, -.3], [5.2, .4, 1.2, .2]]) { const m = mesh(new THREE.BoxGeometry(w, .03, d), dgreen, 0, z > 3 ? .52 : z > 0 ? .78 : .76, z, root); m.rotation.y = r; }
    p.strobe = navLights(root, [-7.95, -.24, -.4], [7.95, -.24, -.4], [0, 2.3, 7.4]);
    p.strobe.visible = false; p.noStrobe = true;
    return { root, p };
  }
  /** bomba con aletas (escala 1 = la grande de 2 m) */
  function bombMesh(sc, mat, finMat) {
    const g = new THREE.Group();
    const b = new THREE.CylinderGeometry(.24, .24, 1.6, 12); b.rotateX(Math.PI / 2); mesh(b, mat, 0, 0, 0, g);
    const n = new THREE.SphereGeometry(.24, 12, 8); n.scale(1, 1, 1.6); mesh(n, mat, 0, 0, -.8, g);
    const t = new THREE.ConeGeometry(.24, .5, 12); t.rotateX(Math.PI / 2); mesh(t, mat, 0, 0, 1.05, g);
    mesh(new THREE.BoxGeometry(.6, .03, .3), finMat || mat, 0, 0, 1.2, g); mesh(new THREE.BoxGeometry(.03, .6, .3), finMat || mat, 0, 0, 1.2, g);
    const ring = new THREE.CylinderGeometry(.247, .247, .08, 12); ring.rotateX(Math.PI / 2); mesh(ring, ringMat || (ringMat = M(0xd6ae3c)), 0, 0, -.35, g); // anillo amarillo
    g.scale.setScalar(sc); return g;
  }
  let missileMats, ringMat;
  function missileMesh() {
    missileMats = missileMats || { body: M(0xd9dcd6, { roughness: .4, metalness: .3 }), red: M(0xc8242b), dark: M(0x2a2d30) };
    const g = new THREE.Group();
    const b = new THREE.CylinderGeometry(.09, .09, 1.5, 10); b.rotateX(Math.PI / 2); mesh(b, missileMats.body, 0, 0, 0, g);
    const n = new THREE.ConeGeometry(.09, .32, 10); n.rotateX(-Math.PI / 2); mesh(n, missileMats.red, 0, 0, -.91, g);
    for (let i = 0; i < 4; i++) { const f = mesh(new THREE.BoxGeometry(.32, .02, .26), missileMats.dark, 0, 0, .62, g); f.rotation.z = i * Math.PI / 4 * 2 + Math.PI / 4; }
    const nz = new THREE.CylinderGeometry(.07, .08, .1, 10); nz.rotateX(Math.PI / 2); mesh(nz, missileMats.dark, 0, 0, .79, g);
    return g;
  }
  /** tanque de práctica para los desafíos */
  function buildTank() {
    const root = new THREE.Group(), body = M(0xffffff, { map: paintTex('tan', Object.assign({ repeat: [1, 1] }, TAN)), roughness: .9 }), dark = M(0x2a2620, { roughness: .95 }), metal = M(0x55524a, { metalness: .4 });
    mesh(new THREE.BoxGeometry(3.4, 1.1, 6.6), body, 0, 1.25, 0, root);
    const glacis = mesh(new THREE.BoxGeometry(3.4, .9, 1.4), body, 0, 1.15, -3.5, root); glacis.rotation.x = .6;
    for (const sx of [-1, 1]) { mesh(new THREE.BoxGeometry(.9, 1.15, 7), dark, sx * 1.75, .6, 0, root); for (let i = 0; i < 6; i++) wheel(root, sx * 1.75, .45, -2.6 + i * 1.04, .42, .95, metal); }
    const tur = new THREE.Group(); tur.position.set(0, 2.15, .4); root.add(tur);
    const tg = new THREE.CylinderGeometry(1.25, 1.5, .85, 8); mesh(tg, body, 0, 0, 0, tur);
    const gun = new THREE.CylinderGeometry(.13, .16, 4.2, 10); gun.rotateX(Math.PI / 2); mesh(gun, metal, 0, .05, -3.3, tur);
    mesh(new THREE.CylinderGeometry(.35, .35, .3, 10), body, -.5, .55, .3, tur);
    // cruz blanca de "blanco de práctica" en el techo para verlo desde el aire
    mesh(new THREE.BoxGeometry(2.2, .03, .35), M(0xf2efe6), 0, .44, 0, tur); mesh(new THREE.BoxGeometry(.35, .03, 2.2), M(0xf2efe6), 0, .44, 0, tur);
    return { root, turret: tur };
  }
  const BUILD = { gaucho: buildGaucho, pampa: buildPampa, condor: buildCondor, stuka: buildStuka };
  function buildPlane(id) {
    const m = BUILD[id](); m.root.traverse(o => { if (o.isMesh) { o.castShadow = false; } });
    return m;
  }
  /* animación de superficies de control, hélice, tren y llama */
  function animatePlane(m, a, dt) {
    const p = m.p;
    if (p.ailL) { p.ailL.rotation.x = a.ail * .35; p.ailR.rotation.x = -a.ail * .35; }
    if (p.elev) p.elev.rotation.x = -a.elev * .4;
    if (p.rud) p.rud.rotation.y = -a.rud * .4;
    if (p.prop) { p.prop.rotation.z += dt * (5 + a.rpm * 160) * (a.engineOn ? 1 : 0); p.disc.material.opacity = a.engineOn ? Math.min(.35, a.rpm * .5) : 0; p.prop.visible = !(a.engineOn && a.rpm > .45); }
    if (p.flame) { const on = a.spec.ab && a.ab; p.flame.visible = a.engineOn && a.rpm > .6; p.flame.scale.set(1, 1, on ? 1 + Math.random() * .25 : .35); p.flame.material.color.setHex(on ? 0xff9a3a : 0x6ab0ff); p.flame.material.opacity = on ? .85 : .35; }
    if (p.gear && !a.spec.fixedGear) p.gear.forEach(g => { g.scale.y = Math.max(.01, a.gearPos); g.visible = a.gearPos > .02; });
    if (p.strobe) p.strobe.visible = !p.noStrobe && (performance.now() % 1200) < 90;
    if (p.dive) { const t = a.brakes && !a.onGround ? 1.45 : 0; p.diveA = (p.diveA || 0) + (t - (p.diveA || 0)) * Math.min(1, dt * 4); p.dive.forEach(d => d.rotation.x = p.diveA); }
    // armas: se ven solo las que todavía no se usaron
    const am = a.ammo;
    if (p.bomb) p.bomb.visible = !!am && am.maxB > 0 && am.bombs === am.maxB;
    if (p.wingBombs) { const w = !am ? 0 : am.bombs === am.maxB ? am.maxB - 1 : am.bombs; p.wingBombs.forEach((b, i) => b.visible = i >= 4 - w); }
    if (p.missiles) { const L = p.missiles.length; p.missiles.forEach((m, j) => m.visible = !!am && j >= L - am.missiles); }
  }

  Object.assign(GS, { SPECS, buildPlane, animatePlane, bombMesh, missileMesh, buildTank });
})();
