/* NEXUS WORLD — mundo abierto 3D (Babylon.js). Módulo independiente del Taller.
   Un único universo continuo. Guardado en namespace "nexus:" (no toca nada más). */
(function () {
  "use strict";
  var B = window.BABYLON;
  var $ = function (id) { return document.getElementById(id); };
  var V3 = function (x, y, z) { return new B.Vector3(x, y, z); };
  var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  var ri = function (a, b) { return Math.floor(rnd(a, b + 1)); };
  var KEY = "nexus:save";
  var esTactil = (window.matchMedia && matchMedia("(pointer:coarse)").matches) || "ontouchstart" in window;

  if (!B) { fallo("No se pudo cargar el motor 3D (Babylon)."); return; }

  // paletas de personalización
  var PIEL = ["#f1c7a3", "#e0a579", "#c68642", "#8d5524", "#5c3a21", "#f6ddc3"];
  var PELO = ["#1b1b1f", "#5a3a22", "#caa14a", "#b0b0b8", "#e04b4b", "#3b6fd4"];
  var ROPA = ["#2f6bff", "#8b5cf6", "#22d3ee", "#ff5d6c", "#5ee08a", "#ffd23f", "#e5e7eb", "#111827"];

  // ---------- estado / guardado ----------
  function nuevo() {
    return { v: 1, px: 8, pz: 14, yaw: 0, dinero: 0, xp: 0, nivel: 1,
      sexo: "M", piel: 0, pelo: 0, ropa: 0,
      mision: 0, paquetes: 0, inv: {}, hora: 8, clima: "sol", creado: Date.now() };
  }
  function load() { try { var t = localStorage.getItem(KEY); if (!t) return nuevo(); var o = JSON.parse(t); if (!o || o.v !== 1) return nuevo(); var b = nuevo(); for (var k in b) if (!(k in o)) o[k] = b[k]; return o; } catch (e) { return nuevo(); } }
  function save() { try { S.px = player.pos.x; S.pz = player.pos.z; S.yaw = cam.yaw; localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  var S = load();

  function fallo(msg) { var e = $("cargaErr"); if (e) e.textContent = msg + " Probá recargar la página."; }
  function prog(p, txt) { var b = $("cargaBar"); if (b) b.style.width = (p * 100) + "%"; if (txt) $("cargaPista").textContent = txt; }

  // ---------- Babylon: engine + scene ----------
  var canvas = $("c");
  var engine;
  try {
    engine = new B.Engine(canvas, true, { adaptToDeviceRatio: true, antialias: !esTactil, powerPreference: "high-performance", preserveDrawingBuffer: false, stencil: true });
  } catch (e) { fallo("Tu navegador no soporta WebGL."); return; }
  engine.setHardwareScalingLevel(esTactil ? 1.5 : 1);

  var scene = new B.Scene(engine);
  scene.clearColor = new B.Color4(0.52, 0.66, 0.86, 1);
  scene.collisionsEnabled = true; scene.skipPointerMovePicking = true;
  scene.ambientColor = new B.Color3(.35, .4, .5);
  scene.fogMode = B.Scene.FOGMODE_EXP2; scene.fogDensity = 0.0012; scene.fogColor = new B.Color3(.6, .72, .88);
  scene.autoClearDepthAndStencil = true;

  // luces
  var hemi = new B.HemisphericLight("hemi", V3(0, 1, 0), scene); hemi.intensity = 0.8; hemi.groundColor = new B.Color3(.25, .28, .33);
  var sun = new B.DirectionalLight("sun", V3(-0.5, -1, -0.4), scene); sun.position = V3(200, 400, 200); sun.intensity = 1.6;
  var shadow = null;
  try { shadow = null; } catch (e) {}

  var glow = null; try { glow = null; } catch (e) {}

  // cámara (la manejamos nosotros)
  var camera = new B.UniversalCamera("cam", V3(0, 5, -10), scene);
  camera.minZ = 0.15; camera.maxZ = 2600; camera.fov = 0.9;
  camera.checkCollisions = false;
  scene.activeCamera = camera;

  // linterna
  var torch = new B.SpotLight("torch", V3(0, 2, 0), V3(0, 0, 1), Math.PI / 3.2, 8, scene);
  torch.intensity = 0; torch.range = 55;

  // ---------- materiales ----------
  function mat(name, r, g, b, opts) { var m = new B.StandardMaterial(name, scene); m.diffuseColor = new B.Color3(r, g, b); m.specularColor = new B.Color3(.08, .08, .1); if (opts) for (var k in opts) m[k] = opts[k]; return m; }
  function hex(c) { return B.Color3.FromHexString(c); }

  var matPasto = mat("pasto", .22, .42, .2); matPasto.specularColor = new B.Color3(0, 0, 0);
  var matRuta = mat("ruta", .09, .1, .13); matRuta.specularColor = new B.Color3(.05, .05, .06);
  var matArena = mat("arena", .83, .76, .54); matArena.specularColor = new B.Color3(0, 0, 0);
  var matMont = mat("mont", .34, .32, .36);
  var matInd = mat("ind", .4, .42, .46);
  var matFence = mat("fence", .55, .58, .62);

  // ventanas de edificios (textura dinámica emisiva)
  function texVentanas(cols, rows) {
    var dt = new B.DynamicTexture("win", { width: 128, height: 256 }, scene, false);
    var ctx = dt.getContext(); ctx.fillStyle = "#0c1020"; ctx.fillRect(0, 0, 128, 256);
    var cw = 128 / cols, rh = 256 / rows;
    for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
      var on = Math.random() < 0.5; ctx.fillStyle = on ? "#ffe9a8" : "#0f1428";
      ctx.fillRect(x * cw + 2, y * rh + 2, cw - 4, rh - 4);
    }
    dt.update(); return dt;
  }
  var winTex = texVentanas(5, 10);
  function matEdif(tint) {
    var m = new B.StandardMaterial("ed", scene);
    m.diffuseColor = tint; m.specularColor = new B.Color3(.12, .14, .18);
    m.emissiveTexture = winTex; m.diffuseTexture = winTex; m.emissiveColor = new B.Color3(0, 0, 0);
    return m;
  }
  var tintes = [hex("#2b3350"), hex("#394063"), hex("#22304d"), hex("#2f3a57"), hex("#283b55")];
  var matsEdif = tintes.map(matEdif);

  var colisionables = []; // para colisión de cámara (edificios/montañas)

  // ---------- MUNDO ----------
  var MAP = 900; // semimapa
  function construirMundo() {
    // suelo (pasto)
    var g = B.MeshBuilder.CreateGround("piso", { width: MAP * 2, height: MAP * 2, subdivisions: 1 }, scene);
    g.material = matPasto; g.checkCollisions = true; g.isPickable = false; g.receiveShadows = true; g.freezeWorldMatrix();

    // límite invisible (pared)
    [[0, MAP, MAP * 2, 10], [0, -MAP, MAP * 2, 10], [MAP, 0, 10, MAP * 2], [-MAP, 0, 10, MAP * 2]].forEach(function (w, i) {
      var b = B.MeshBuilder.CreateBox("borde" + i, { width: w[2], height: 80, depth: w[3] }, scene);
      b.position = V3(w[0], 40, w[1]); b.checkCollisions = true; b.isVisible = false; b.isPickable = false;
    });

    // RUTAS: grilla de avenidas en la ciudad (centro)
    var cityR = 420, paso = 70;
    var rutas = [];
    for (var x = -cityR; x <= cityR; x += paso) rutas.push(["v", x]);
    for (var z = -cityR; z <= cityR; z += paso) rutas.push(["h", z]);
    rutas.forEach(function (r, i) {
      var road = r[0] === "v"
        ? B.MeshBuilder.CreateGround("rv" + i, { width: 16, height: cityR * 2 + paso }, scene)
        : B.MeshBuilder.CreateGround("rh" + i, { width: cityR * 2 + paso, height: 16 }, scene);
      road.position = r[0] === "v" ? V3(r[1], 0.03, 0) : V3(0, 0.03, r[1]);
      road.material = matRuta; road.isPickable = false; road.freezeWorldMatrix();
    });
    // anillo (carretera) exterior
    [[-cityR - 40, 0, 18, (cityR + 40) * 2], [cityR + 40, 0, 18, (cityR + 40) * 2], [0, -cityR - 40, (cityR + 40) * 2, 18], [0, cityR + 40, (cityR + 40) * 2, 18]].forEach(function (a, i) {
      var ro = B.MeshBuilder.CreateGround("anillo" + i, { width: a[2], height: a[3] }, scene);
      ro.position = V3(a[0], 0.03, a[1]); ro.material = matRuta; ro.isPickable = false; ro.freezeWorldMatrix();
    });

    // EDIFICIOS: en cada manzana entre avenidas
    var nbuild = 0;
    for (var bx = -cityR + paso / 2; bx < cityR; bx += paso) {
      for (var bz = -cityR + paso / 2; bz < cityR; bz += paso) {
        if (Math.random() < 0.12) continue; // plazas vacías
        var w = rnd(26, 42), d = rnd(26, 42), h = rnd(24, 150);
        var e = B.MeshBuilder.CreateBox("ed" + nbuild, { width: w, height: h, depth: d }, scene);
        e.position = V3(bx + rnd(-6, 6), h / 2, bz + rnd(-6, 6));
        e.material = matsEdif[nbuild % matsEdif.length];
        e.checkCollisions = true; e.isPickable = true; e.freezeWorldMatrix();
        
        colisionables.push(e); nbuild++;
      }
    }

    // BOSQUE (noreste)
    var tronco = B.MeshBuilder.CreateCylinder("tk", { height: 6, diameterTop: 1, diameterBottom: 1.6, tessellation: 6 }, scene);
    tronco.material = mat("tronco", .3, .2, .12); tronco.position.y = 3;
    var copa = B.MeshBuilder.CreateSphere("copa", { diameter: 8, segments: 4 }, scene);
    copa.material = mat("copa", .16, .4, .18); copa.position.y = 8; copa.parent = tronco;
    var arbol = B.Mesh.MergeMeshes([tronco, copa], true, true, undefined, false, false);
    arbol.isPickable = false; arbol.registerInstancedBuffer; arbol.isVisible = false;
    for (var t = 0; t < 160; t++) {
      var ix = rnd(520, 860), iz = rnd(-860, -200);
      var inst = arbol.createInstance("ar" + t); inst.position = V3(ix, 0, iz);
      var s = rnd(.8, 1.7); inst.scaling = V3(s, s, s); inst.freezeWorldMatrix();
    }

    // MONTAÑAS (sur y oeste, borde)
    for (var mm = 0; mm < 14; mm++) {
      var mo = B.MeshBuilder.CreateIcoSphere("mo" + mm, { radius: rnd(70, 160), subdivisions: 2, flat: true }, scene);
      var side = mm % 2 === 0;
      mo.position = side ? V3(rnd(-860, -500), -20, rnd(-860, 860)) : V3(rnd(-860, 860), -20, rnd(560, 860));
      mo.scaling.y = rnd(1.1, 2); mo.material = matMont; mo.checkCollisions = true; mo.isPickable = true; mo.freezeWorldMatrix();
      colisionables.push(mo);
    }

    // LAGO + PLAYA (noroeste)
    var arena = B.MeshBuilder.CreateDisc("playa", { radius: 220, tessellation: 40 }, scene);
    arena.rotation.x = Math.PI / 2; arena.position = V3(-560, 0.02, 560); arena.material = matArena; arena.isPickable = false; arena.freezeWorldMatrix();
    var agua = B.MeshBuilder.CreateDisc("lago", { radius: 150, tessellation: 40 }, scene);
    agua.rotation.x = Math.PI / 2; agua.position = V3(-560, 0.12, 560);
    var matAgua = new B.StandardMaterial("agua", scene); matAgua.diffuseColor = hex("#1b6ea8"); matAgua.alpha = 0.72; matAgua.specularColor = new B.Color3(.6, .7, .8); matAgua.specularPower = 64;
    agua.material = matAgua; agua.isPickable = false; world.agua = agua;
    // río (franja hacia la ciudad)
    var rio = B.MeshBuilder.CreateGround("rio", { width: 40, height: 420 }, scene);
    rio.position = V3(-420, 0.1, 360); rio.rotation.y = -0.7; rio.material = matAgua; rio.isPickable = false; rio.freezeWorldMatrix();

    // ZONA INDUSTRIAL (sureste): galpones + tanques
    for (var gi = 0; gi < 10; gi++) {
      var gw = rnd(40, 70), gh = rnd(14, 24), gd = rnd(40, 70);
      var gal = B.MeshBuilder.CreateBox("gal" + gi, { width: gw, height: gh, depth: gd }, scene);
      gal.position = V3(rnd(500, 820), gh / 2, rnd(-820, -500)); gal.material = matInd; gal.checkCollisions = true; gal.isPickable = true; gal.freezeWorldMatrix();
      colisionables.push(gal);
    }
    for (var tq = 0; tq < 8; tq++) {
      var tk = B.MeshBuilder.CreateCylinder("tq" + tq, { height: rnd(18, 30), diameter: rnd(16, 26), tessellation: 16 }, scene);
      tk.position = V3(rnd(520, 800), 12, rnd(-820, -520)); tk.material = mat("tk", .7, .72, .75); tk.checkCollisions = true; tk.isPickable = true; tk.freezeWorldMatrix();
      colisionables.push(tk);
    }
    world.industrial = V3(660, 0, -660);

    // INSTALACIÓN SECRETA (lejos, sur-oeste), cercada + domo
    var base = V3(-660, 0, -660);
    for (var f = 0; f < 4; f++) {
      var vert = f < 2;
      var fen = B.MeshBuilder.CreateBox("fen" + f, { width: vert ? 4 : 160, height: 10, depth: vert ? 160 : 4 }, scene);
      fen.position = base.add(V3(vert ? (f === 0 ? -80 : 80) : 0, 5, vert ? 0 : (f === 2 ? -80 : 80)));
      fen.material = matFence; fen.checkCollisions = true; fen.isPickable = true; fen.freezeWorldMatrix(); colisionables.push(fen);
    }
    var domo = B.MeshBuilder.CreateSphere("domo", { diameter: 70, segments: 12, slice: 0.5 }, scene);
    domo.position = base.add(V3(0, 0, 0)); var md = mat("domo", .3, .35, .42); md.alpha = .9; domo.material = md; domo.checkCollisions = true; domo.isPickable = true; domo.freezeWorldMatrix(); colisionables.push(domo);
    world.secreta = base;

    // faroles (postes con luz emisiva) a lo largo de avenidas — baratos
    world.faroles = [];
    for (var lp = -cityR; lp <= cityR; lp += paso) {
      var poste = B.MeshBuilder.CreateCylinder("po", { height: 9, diameter: .6 }, scene);
      poste.position = V3(lp + 8, 4.5, 8); poste.material = mat("po", .2, .2, .22); poste.isPickable = false;
      var luz = B.MeshBuilder.CreateSphere("luz", { diameter: 1.6 }, scene); luz.position = V3(lp + 8, 9, 8);
      var ml = new B.StandardMaterial("ml", scene); ml.emissiveColor = new B.Color3(0, 0, 0); ml.diffuseColor = hex("#ffd98a"); luz.material = ml;
      poste.freezeWorldMatrix(); luz.freezeWorldMatrix(); world.faroles.push(ml);
    }
  }

  // ---------- HUMANOIDE (personaje y NPCs) ----------
  function humanoide(opts) {
    opts = opts || {};
    var root = new B.TransformNode("hu", scene);
    var piel = hex(opts.piel || PIEL[0]), pelo = hex(opts.pelo || PELO[0]), ropa = hex(opts.ropa || ROPA[0]);
    var mPiel = mat("pi", piel.r, piel.g, piel.b), mPelo = mat("pe", pelo.r, pelo.g, pelo.b), mRopa = mat("ro", ropa.r, ropa.g, ropa.b), mPant = mat("pa", .15, .17, .22);
    var fem = opts.sexo === "F";
    function box(w, h, d, y, m, px) { var b = B.MeshBuilder.CreateBox("b", { width: w, height: h, depth: d }, scene); b.material = m; b.position = V3(px || 0, y, 0); b.parent = root; return b; }
    var torso = box(fem ? .62 : .72, .78, .36, 1.18, mRopa);
    var cadera = box(.56, .3, .34, .72, mPant);
    var cabeza = B.MeshBuilder.CreateBox("ca", { width: .34, height: .36, depth: .34 }, scene); cabeza.material = mPiel; cabeza.position = V3(0, 1.78, 0); cabeza.parent = root;
    var peloM = B.MeshBuilder.CreateBox("pl", { width: .38, height: fem ? .34 : .16, depth: .4 }, scene); peloM.material = mPelo; peloM.position = V3(0, fem ? 1.9 : 1.96, fem ? -.02 : 0); peloM.parent = root;
    // brazos y piernas como pivotes
    function miembro(w, h, d, x, y, m) { var piv = new B.TransformNode("pv", scene); piv.parent = root; piv.position = V3(x, y, 0); var seg = B.MeshBuilder.CreateBox("sg", { width: w, height: h, depth: d }, scene); seg.material = m; seg.position = V3(0, -h / 2, 0); seg.parent = piv; return piv; }
    var bI = miembro(.17, .72, .2, -(torso._scaling ? 0 : (fem ? .42 : .48)), 1.5, mRopa);
    var bD = miembro(.17, .72, .2, (fem ? .42 : .48), 1.5, mRopa);
    var pI = miembro(.2, .72, .22, -.17, .72, mPant);
    var pD = miembro(.2, .72, .22, .17, .72, mPant);
    root.getChildMeshes().forEach(function (m) { m.isPickable = false; }); // la cámara nunca choca con el cuerpo
    return { root: root, cabeza: cabeza, bI: bI, bD: bD, pI: pI, pD: pD, mRopa: mRopa, mPiel: mPiel, mPelo: mPelo, peloM: peloM, torso: torso, fem: fem, phase: 0 };
  }
  function animarPiernas(h, vel, dt) {
    h.phase += dt * (6 + vel * 1.5);
    var amp = clamp(vel * 0.12, 0, 0.7);
    if (vel < 0.15) { amp = 0; h.phase *= 0; }
    var s = Math.sin(h.phase) * amp;
    h.pI.rotation.x = s; h.pD.rotation.x = -s; h.bI.rotation.x = -s; h.bD.rotation.x = s;
  }

  // ---------- JUGADOR ----------
  var world = {};
  var player = { pos: V3(S.px, 1, S.pz), vy: 0, grounded: true, h: null, vida: 100, ene: 100, crouch: false, enVehiculo: null, velVis: 0, flash: false };
  var cam = { yaw: S.yaw || 0, pitch: 0.15, dist: 7, fp: false };

  function construirJugador() {
    player.h = humanoide({ sexo: S.sexo, piel: PIEL[S.piel], pelo: PELO[S.pelo], ropa: ROPA[S.ropa] });
    if (shadow) { player.h.root.getChildMeshes().forEach(function (m) { shadow.addShadowCaster(m); }); }
  }
  function aplicarPerso() {
    var h = player.h; if (!h) return;
    h.mPiel.diffuseColor = hex(PIEL[S.piel]); h.mPelo.diffuseColor = hex(PELO[S.pelo]); h.mRopa.diffuseColor = hex(ROPA[S.ropa]);
  }

  // ---------- VEHÍCULOS ----------
  var vehiculos = [];
  function crearVehiculo(tipo, x, z, color) {
    var root = new B.TransformNode("veh", scene);
    var body = B.MeshBuilder.CreateBox("vb", tipo === "moto" ? { width: .9, height: .8, depth: 2.4 } : { width: 2.1, height: 1.0, depth: 4.4 }, scene);
    body.material = mat("vcol", 0, 0, 0); body.material.diffuseColor = hex(color); body.material.specularColor = new B.Color3(.4, .4, .45); body.position.y = tipo === "moto" ? .9 : .85; body.parent = root;
    if (tipo !== "moto") { var cabina = B.MeshBuilder.CreateBox("cab", { width: 1.8, height: .7, depth: 2.2 }, scene); var mc = mat("mc", .1, .12, .18); mc.alpha = .7; cabina.material = mc; cabina.position = V3(0, 1.5, -.2); cabina.parent = root; }
    var ruedas = [];
    var pw = tipo === "moto" ? [[0, .45, 1], [0, .45, -1]] : [[.95, .45, 1.4], [-.95, .45, 1.4], [.95, .45, -1.4], [-.95, .45, -1.4]];
    pw.forEach(function (p, i) { var r = B.MeshBuilder.CreateCylinder("w" + i, { height: .35, diameter: .95, tessellation: 14 }, scene); r.rotation.z = Math.PI / 2; r.material = mat("w", .06, .06, .07); r.position = V3(p[0], p[1], p[2]); r.parent = root; ruedas.push(r); });
    root.position = V3(x, 0, z);
    var col = B.MeshBuilder.CreateBox("vcolid", tipo === "moto" ? { width: 1, height: 1.4, depth: 2.4 } : { width: 2.1, height: 1.6, depth: 4.4 }, scene);
    col.isVisible = false; col.position = V3(x, .9, z); col.checkCollisions = true; col.ellipsoid = new B.Vector3(tipo === "moto" ? .6 : 1.1, .8, tipo === "moto" ? 1.3 : 2.3);
    root.getChildMeshes().forEach(function(m){m.isPickable=false;}); col.isPickable=false; var v = { tipo: tipo, root: root, col: col, ruedas: ruedas, speed: 0, heading: 0 };
    vehiculos.push(v); return v;
  }

  // ---------- NPCs ----------
  var npcs = [];
  function crearNPCs() {
    for (var i = 0; i < 12; i++) {
      var h = humanoide({ sexo: Math.random() < .5 ? "M" : "F", piel: PIEL[ri(0, PIEL.length - 1)], pelo: PELO[ri(0, PELO.length - 1)], ropa: ROPA[ri(0, ROPA.length - 1)] });
      var x = rnd(-380, 380), z = rnd(-380, 380);
      h.root.position = V3(x, 0, z);
      var npc = { h: h, pos: V3(x, 0, z), objetivo: V3(rnd(-400, 400), 0, rnd(-400, 400)), vel: rnd(1.3, 2.3), giver: false, mision: -1, marca: null, nombre: ["Vera", "Dmitri", "Lena", "Pavel", "Nadia", "Goran", "Mira", "Emil", "Roza", "Boris", "Petra", "Ivor"][i] };
      npcs.push(npc);
    }
    // dar misiones a 3 NPCs (contactos)
    [[npcs[0], 0, V3(12, 0, 20)], [npcs[1], 1, world.industrial.add(V3(-30, 0, 30))], [npcs[2], 3, V3(620, 0, -350)]].forEach(function (g) {
      var npc = g[0]; npc.giver = true; npc.mision = g[1]; npc.pos = g[2]; npc.h.root.position = g[2].clone(); npc.objetivo = g[2].clone(); npc.vel = 0;
      var m = B.MeshBuilder.CreatePolyhedron("mk", { type: 1, size: .5 }, scene); var mm = new B.StandardMaterial("mm", scene); mm.emissiveColor = hex("#ffd23f"); mm.disableLighting = true; m.material = mm; m.position = V3(0, 2.6, 0); m.parent = npc.h.root; m.isPickable=false; npc.marca = m;
    });
  }

  // ---------- PICKUPS (paquetes + dinero) ----------
  var pickups = [];
  function crearPickups() {
    for (var i = 0; i < 3; i++) { // paquetes (misión 1)
      var p = B.MeshBuilder.CreateBox("pk" + i, { size: 1 }, scene); var mp = new B.StandardMaterial("mp", scene); mp.diffuseColor = hex("#c8903a"); mp.emissiveColor = hex("#3a2a0a"); p.material = mp;
      p.position = V3(rnd(-350, 350), 1, rnd(-350, 350)); p.isPickable = false; pickups.push({ mesh: p, tipo: "paquete", valor: 1 });
    }
    for (var j = 0; j < 14; j++) { // dinero
      var d = B.MeshBuilder.CreateCylinder("cn" + j, { height: .1, diameter: .9, tessellation: 16 }, scene); d.rotation.x = Math.PI / 2;
      var mdc = new B.StandardMaterial("mdc", scene); mdc.emissiveColor = hex("#ffd23f"); mdc.disableLighting = true; d.material = mdc;
      d.position = V3(rnd(-420, 420), 1, rnd(-420, 420)); d.isPickable = false; pickups.push({ mesh: d, tipo: "dinero", valor: ri(20, 80) });
    }
  }

  // ---------- MISIONES ----------
  var MIS = [
    { t: "Primer contacto", o: "Buscá al contacto (marcador dorado) y hablale.", meta: null, destino: function () { return npcs[0].pos; } },
    { t: "Reparto exprés", o: "Recogé 3 paquetes repartidos por la ciudad.", destino: null },
    { t: "Sobre ruedas", o: "Subite a un vehículo (E) y llegá a la Zona Industrial.", destino: function () { return world.industrial; } },
    { t: "Señal en el bosque", o: "Llegá al claro del bosque y recuperá la señal.", destino: function () { return V3(700, 0, -480); } },
    { t: "Instalación secreta", o: "Infiltrate en la instalación secreta del suroeste.", destino: function () { return world.secreta; } },
    { t: "Ciudad libre", o: "Completaste la campaña. Explorá NEXUS WORLD a tu ritmo.", destino: null },
  ];
  var beacon = null, bosqueChip = null;
  function faroMision() {
    beacon = B.MeshBuilder.CreateCylinder("beacon", { height: 120, diameter: 4, tessellation: 10 }, scene);
    var mb = new B.StandardMaterial("mb", scene); mb.emissiveColor = hex("#22d3ee"); mb.alpha = .3; mb.disableLighting = true; beacon.material = mb; beacon.isPickable = false; beacon.position.y = 60;
    bosqueChip = B.MeshBuilder.CreateBox("chip", { size: 1.2 }, scene); var mch = new B.StandardMaterial("mch", scene); mch.emissiveColor = hex("#22d3ee"); bosqueChip.material = mch; bosqueChip.position = V3(700, 1.2, -480); bosqueChip.isVisible = false;
  }
  function destinoMision() { var m = MIS[S.mision]; return m && m.destino ? m.destino() : null; }
  function completarMision(dinero, xp) {
    darDinero(dinero); darXp(xp);
    banner("✔ Misión completada: <b>" + MIS[S.mision].t + "</b>  +$" + dinero + "  +" + xp + " XP");
    S.mision = Math.min(S.mision + 1, MIS.length - 1); S.paquetes = 0; save(); refrescarMision();
  }
  function refrescarMision() {
    var m = MIS[S.mision]; $("misTit").textContent = m.t;
    var o = m.o; if (S.mision === 1) o = "Paquetes: " + S.paquetes + "/3 — " + m.o;
    $("misObj").textContent = o;
    bosqueChip.isVisible = S.mision === 3;
  }

  // ---------- ECONOMÍA / XP ----------
  function darDinero(n) { S.dinero += n; $("txtDinero").textContent = S.dinero; }
  function xpNivel(L) { return 100 * L; }
  function darXp(n) { S.xp += n; while (S.xp >= xpNivel(S.nivel)) { S.xp -= xpNivel(S.nivel); S.nivel++; banner("⬆️ Subiste al nivel <b>" + S.nivel + "</b>"); } $("txtNivel").textContent = S.nivel; $("txtXp").textContent = S.xp + "/" + xpNivel(S.nivel) + " XP"; }

  // ---------- HUD ----------
  var bannerT;
  function banner(html) { var b = $("banner"); b.innerHTML = html; b.classList.add("on"); clearTimeout(bannerT); bannerT = setTimeout(function () { b.classList.remove("on"); }, 3200); }
  function setPrompt(txt, key) { var p = $("prompt"); if (txt) { $("promptTxt").textContent = txt; $("promptKey").textContent = key || "E"; p.classList.add("on"); } else p.classList.remove("on"); }

  var miniC = $("mini").getContext("2d");
  function dibujarMini() {
    var w = 170, esc = 0.09; miniC.clearRect(0, 0, w, w); miniC.fillStyle = "#0a0f20"; miniC.fillRect(0, 0, w, w);
    function toMap(p) { return [w / 2 + (p.x - player.pos.x) * esc, w / 2 + (p.z - player.pos.z) * esc]; }
    // edificios (pocos, como puntos tenues) — muestreo
    miniC.fillStyle = "#1c2748";
    for (var i = 0; i < colisionables.length; i += 1) { var c = colisionables[i].position; var mp = toMap(c); if (mp[0] > 2 && mp[0] < w - 2 && mp[1] > 2 && mp[1] < w - 2) miniC.fillRect(mp[0] - 1, mp[1] - 1, 2, 2); }
    // destino
    var d = destinoMision(); if (d) { var dm = toMap(d); miniC.fillStyle = "#ffd23f"; miniC.beginPath(); miniC.arc(clamp(dm[0], 6, w - 6), clamp(dm[1], 6, w - 6), 4, 0, 6.3); miniC.fill(); }
    // npcs
    npcs.forEach(function (n) { var nm = toMap(n.pos); if (nm[0] > 0 && nm[0] < w && nm[1] > 0 && nm[1] < w) { miniC.fillStyle = n.giver ? "#ffd23f" : "#6fd3ff"; miniC.fillRect(nm[0] - 1, nm[1] - 1, 3, 3); } });
    // vehiculos
    vehiculos.forEach(function (v) { var vm = toMap(v.root.position); if (vm[0] > 0 && vm[0] < w) { miniC.fillStyle = "#5ee08a"; miniC.fillRect(vm[0] - 1.5, vm[1] - 1.5, 3, 3); } });
    // jugador (flecha)
    miniC.save(); miniC.translate(w / 2, w / 2); miniC.rotate(-cam.yaw); miniC.fillStyle = "#fff"; miniC.beginPath(); miniC.moveTo(0, -6); miniC.lineTo(4, 5); miniC.lineTo(-4, 5); miniC.closePath(); miniC.fill(); miniC.restore();
  }

  // ---------- CONTROLES ----------
  var keys = {};
  window.addEventListener("keydown", function (e) {
    var k = e.key.toLowerCase(); keys[k] = true;
    if (k === "escape") togglePausa();
    if (k === "i") toggleOverlay("inv", true);
    if (k === "m") toggleOverlay("mapa", true);
    if (k === "v") { cam.fp = !cam.fp; $("cross").classList.toggle("on", cam.fp); }
    if (k === "f") { player.flash = !player.flash; }
    if (k === "e") interactuar();
    if ([" ", "w", "a", "s", "d"].indexOf(k) >= 0) e.preventDefault();
  });
  window.addEventListener("keyup", function (e) { keys[e.key.toLowerCase()] = false; });

  // mouse look (pointer lock)
  canvas.addEventListener("click", function () { if (!pausado && !cualquierOverlay() && !esTactil) canvas.requestPointerLock && canvas.requestPointerLock(); });
  document.addEventListener("mousemove", function (e) {
    if (document.pointerLockElement === canvas) { cam.yaw -= e.movementX * 0.0022; cam.pitch = clamp(cam.pitch + e.movementY * 0.0022, -0.5, 0.95); }
  });

  // táctil
  var touchMove = { x: 0, y: 0 };
  function setupTactil() {
    $("touch").classList.add("on");
    var stick = $("stick"), base = $("stickBase"), nub = $("stickNub"), ori = null, id = null;
    stick.addEventListener("pointerdown", function (e) { id = e.pointerId; ori = { x: e.clientX, y: e.clientY }; base.style.display = nub.style.display = "block"; base.style.left = nub.style.left = e.clientX + "px"; base.style.top = nub.style.top = e.clientY + "px"; });
    stick.addEventListener("pointermove", function (e) { if (e.pointerId !== id || !ori) return; var dx = e.clientX - ori.x, dy = e.clientY - ori.y; var d = Math.min(60, Math.hypot(dx, dy)); var a = Math.atan2(dy, dx); nub.style.left = (ori.x + Math.cos(a) * d) + "px"; nub.style.top = (ori.y + Math.sin(a) * d) + "px"; touchMove.x = Math.cos(a) * (d / 60); touchMove.y = Math.sin(a) * (d / 60); });
    function end(e) { if (e.pointerId !== id) return; id = null; ori = null; base.style.display = nub.style.display = "none"; touchMove.x = touchMove.y = 0; }
    stick.addEventListener("pointerup", end); stick.addEventListener("pointercancel", end);
    // cámara con arrastre en la mitad derecha
    var look = { id: null, lx: 0, ly: 0 };
    canvas.addEventListener("pointerdown", function (e) { if (e.clientX > window.innerWidth / 2) { look.id = e.pointerId; look.lx = e.clientX; look.ly = e.clientY; } });
    canvas.addEventListener("pointermove", function (e) { if (e.pointerId === look.id) { cam.yaw -= (e.clientX - look.lx) * 0.005; cam.pitch = clamp(cam.pitch + (e.clientY - look.ly) * 0.005, -0.5, 0.95); look.lx = e.clientX; look.ly = e.clientY; } });
    canvas.addEventListener("pointerup", function (e) { if (e.pointerId === look.id) look.id = null; });
    $("tJump").addEventListener("pointerdown", function () { keys[" "] = true; setTimeout(function () { keys[" "] = false; }, 120); });
    $("tRun").addEventListener("pointerdown", function () { keys.shift = true; }); $("tRun").addEventListener("pointerup", function () { keys.shift = false; });
    $("tAct").addEventListener("pointerdown", interactuar);
  }

  // ---------- OVERLAYS / PAUSA ----------
  var pausado = false;
  function cualquierOverlay() { return ["menu", "perso", "inv", "ctrl", "dlg", "mapa"].some(function (id) { return $(id).classList.contains("on"); }); }
  function toggleOverlay(id, on) { var el = $(id); var vis = on === undefined ? !el.classList.contains("on") : on; el.classList.toggle("on", vis); if (id === "inv" && vis) pintarInv(); if (id === "mapa" && vis) pintarMapaBig(); }
  function togglePausa() {
    if (cualquierOverlay()) { ["menu", "perso", "inv", "ctrl", "dlg", "mapa"].forEach(function (id) { $(id).classList.remove("on"); }); pausado = false; return; }
    pausado = !pausado; $("menu").classList.toggle("on", pausado); if (pausado) { save(); } else if (document.exitPointerLock) {}
  }

  function pintarInv() {
    var g = $("invGrid"), items = Object.keys(S.inv).filter(function (k) { return S.inv[k] > 0; });
    if (!items.length) { g.innerHTML = '<div class="vacio" style="grid-column:1/-1">Vacío. Recogé objetos en el mundo.</div>'; return; }
    g.innerHTML = items.map(function (k) { return '<div class="inv-it">' + k + '<span class="q">×' + S.inv[k] + '</span></div>'; }).join("");
  }
  function pintarMapaBig() {
    var c = $("mapaBig"), ctx = c.getContext("2d"), W = 520, H = 420, esc = 0.26, cx = W / 2 + 70, cy = H / 2;
    ctx.fillStyle = "#0a0f20"; ctx.fillRect(0, 0, W, H);
    function tm(p) { return [cx + p.x * esc, cy + p.z * esc]; }
    ctx.fillStyle = "#1c2748"; colisionables.forEach(function (c2) { var m = tm(c2.position); ctx.fillRect(m[0] - 1, m[1] - 1, 2, 2); });
    ctx.fillStyle = "#2a6fb0"; var l = tm(V3(-560, 0, 560)); ctx.beginPath(); ctx.arc(l[0], l[1], 150 * esc, 0, 6.3); ctx.fill();
    ctx.fillStyle = "#1b5c2a"; var f = tm(V3(690, 0, -530)); ctx.beginPath(); ctx.arc(f[0], f[1], 170 * esc, 0, 6.3); ctx.fill();
    var d = destinoMision(); if (d) { var dm = tm(d); ctx.fillStyle = "#ffd23f"; ctx.beginPath(); ctx.arc(dm[0], dm[1], 6, 0, 6.3); ctx.fill(); }
    var pm = tm(player.pos); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(pm[0], pm[1], 5, 0, 6.3); ctx.fill();
    ctx.fillStyle = "#9fb0d8"; ctx.font = "11px monospace"; ctx.fillText("Lago", tm(V3(-560, 0, 560))[0] - 14, tm(V3(-560, 0, 560))[1]); ctx.fillText("Bosque", f[0] - 20, f[1]); ctx.fillText("Industrial", tm(V3(660, 0, -660))[0] - 24, tm(V3(660, 0, -660))[1]); ctx.fillText("Secreto", tm(V3(-660, 0, -660))[0] - 20, tm(V3(-660, 0, -660))[1]);
  }

  // diálogo NPC
  var dlgActual = null;
  function abrirDialogo(npc) {
    dlgActual = npc; var m = MIS[npc.mision];
    $("dlgNom").textContent = npc.nombre;
    $("dlgTxt").textContent = npc.mision === S.mision ? "Necesito una mano: " + m.o.toLowerCase() + " ¿Te sumás?" : (npc.mision < S.mision ? "Gracias por lo de antes. Seguí con lo tuyo." : "Todavía no es tu momento para esto. Volvé más adelante.");
    $("dlgOk").style.display = npc.mision === S.mision ? "flex" : "none";
    toggleOverlay("dlg", true);
  }

  function interactuar() {
    if (cualquierOverlay()) return;
    // ¿subir/bajar vehículo?
    if (player.enVehiculo) { bajarVehiculo(); return; }
    var vcerca = vehiculoCerca(); if (vcerca) { subirVehiculo(vcerca); return; }
    // ¿NPC contacto?
    var npc = npcCerca(); if (npc && npc.giver) { abrirDialogo(npc); return; }
  }
  function vehiculoCerca() { for (var i = 0; i < vehiculos.length; i++) if (B.Vector3.Distance(vehiculos[i].root.position, player.pos) < 3.5) return vehiculos[i]; return null; }
  function npcCerca() { var best = null, bd = 3.2; npcs.forEach(function (n) { var d = B.Vector3.Distance(n.pos, player.pos); if (d < bd) { bd = d; best = n; } }); return best; }
  function subirVehiculo(v) { player.enVehiculo = v; player.h.root.setEnabled(false); banner("Conduciendo " + (v.tipo === "moto" ? "la moto" : "el auto") + " · E para bajar"); }
  function bajarVehiculo() { var v = player.enVehiculo; player.enVehiculo = null; player.h.root.setEnabled(true); player.pos = v.root.position.add(V3(2.5, 0, 0)); player.vy = 0; v.speed = 0; }

  // ---------- LOOP ----------
  var mundoListo = false;
  function update() {
    var dt = Math.min(0.05, engine.getDeltaTime() / 1000) || 0.016;
    if (!mundoListo) return;
    // tiempo / día-noche
    S.hora += dt * 0.12; if (S.hora >= 24) S.hora -= 24;
    cicloDia();
    if (!pausado && !cualquierOverlay()) { if (player.enVehiculo) conducir(dt); else moverJugador(dt); }
    actualizarCamara();
    actualizarNPCs(dt);
    chequearPickups();
    chequearMisiones();
    // energía
    var corriendo = (keys.shift) && !player.crouch;
    if (corriendo && (keys.w || keys.a || keys.s || keys.d || touchMove.x || touchMove.y)) S.eneDrain = true; else S.eneDrain = false;
    player.ene = clamp(player.ene + (S.eneDrain ? -22 : 14) * dt, 0, 100);
    player.vida = clamp(player.vida + 4 * dt, 0, 100);
    // HUD
    $("barVida").style.width = player.vida + "%"; $("txtVida").textContent = Math.round(player.vida);
    $("barEne").style.width = player.ene + "%"; $("txtEne").textContent = Math.round(player.ene);
    $("txtReloj").textContent = ("0" + Math.floor(S.hora)).slice(-2) + ":" + ("0" + Math.floor((S.hora % 1) * 60)).slice(-2);
    // prompts
    if (!cualquierOverlay()) {
      if (player.enVehiculo) setPrompt("Bajar del vehículo", "E");
      else { var v = vehiculoCerca(); var n = npcCerca(); if (v) setPrompt("Conducir " + (v.tipo === "moto" ? "moto" : "auto"), "E"); else if (n && n.giver) setPrompt("Hablar con " + n.nombre, "E"); else setPrompt(null); }
    } else setPrompt(null);
    dibujarMini();
    // flash
    torch.intensity = (player.flash && S.hora > 19 || player.flash && S.hora < 6) ? 2.2 : (player.flash ? 1.2 : 0);
    // autosave
    S._t = (S._t || 0) + dt; if (S._t > 20) { S._t = 0; save(); }
  }

  function moverJugador(dt) {
    player.crouch = !!keys.c;
    var run = keys.shift && player.ene > 1 && !player.crouch;
    var sp = player.crouch ? 2.2 : (run ? 8.5 : 4.2);
    var f = V3(Math.sin(cam.yaw), 0, Math.cos(cam.yaw)), r = V3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
    var mx = (keys.d ? 1 : 0) - (keys.a ? 1 : 0) + touchMove.x;
    var mz = (keys.w ? 1 : 0) - (keys.s ? 1 : 0) - touchMove.y;
    var dir = f.scale(mz).add(r.scale(mx));
    var moving = dir.lengthSquared() > 0.01;
    if (moving) dir.normalize();
    var vel = moving ? sp : 0; player.velVis = lerp(player.velVis, vel, 0.2);
    // gravedad + salto
    if (player.grounded && keys[" "]) { player.vy = 7.5; player.grounded = false; }
    player.vy -= 20 * dt;
    var desp = dir.scale(vel * dt); desp.y = player.vy * dt;
    // colisión con edificios por ellipsoid del root (usamos un mesh colisionador)
    colPlayer.position.copyFrom(player.pos); colPlayer.moveWithCollisions(desp);
    player.pos.copyFrom(colPlayer.position);
    // piso
    if (player.pos.y <= 1) { if (player.vy < -14) player.vida = clamp(player.vida + player.vy * 0.8, 0, 100); player.pos.y = 1; player.vy = 0; player.grounded = true; }
    // avatar
    player.h.root.position.copyFrom(player.pos); player.h.root.position.y -= 1 - (player.crouch ? 0.35 : 0);
    if (moving) { var ang = Math.atan2(dir.x, dir.z); player.h.root.rotation.y = lerpAng(player.h.root.rotation.y, ang, 0.2); }
    player.h.root.scaling.y = player.crouch ? 0.72 : 1;
    animarPiernas(player.h, player.velVis, dt);
  }
  function lerpAng(a, b, t) { var d = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI; return a + d * t; }

  function conducir(dt) {
    var v = player.enVehiculo;
    var accel = (keys.w ? 1 : 0) - (keys.s ? 1 : 0) + (-touchMove.y);
    v.speed += accel * 16 * dt; v.speed *= 0.985; v.speed = clamp(v.speed, -12, 26);
    var steer = ((keys.d ? 1 : 0) - (keys.a ? 1 : 0) + touchMove.x);
    v.heading += steer * dt * 1.6 * clamp(Math.abs(v.speed) / 8, 0, 1) * (v.speed < 0 ? -1 : 1);
    var fwd = V3(Math.sin(v.heading), 0, Math.cos(v.heading));
    var desp = fwd.scale(v.speed * dt);
    v.col.moveWithCollisions(desp);
    v.root.position.copyFrom(v.col.position); v.root.position.y = 0; v.root.rotation.y = v.heading;
    v.ruedas.forEach(function (w) { w.rotation.x += v.speed * dt * 2; });
    player.pos.copyFrom(v.root.position); player.pos.y = 1;
    if (Math.abs(v.speed) > 0.5) darXp(0); // sin premio falso
  }

  function actualizarCamara() {
    var head = (player.enVehiculo ? player.enVehiculo.root.position : player.pos).add(V3(0, player.crouch ? 1.1 : 1.55, 0));
    var look = V3(Math.sin(cam.yaw) * Math.cos(cam.pitch), -Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
    if (cam.fp && !player.enVehiculo) {
      camera.position.copyFrom(head); camera.setTarget(head.add(look));
      player.h.cabeza.visibility = 0; player.h.peloM.visibility = 0;
    } else {
      player.h.cabeza.visibility = 1; player.h.peloM.visibility = 1;
      var dist = player.enVehiculo ? 11 : 7;
      // colisión de cámara: solo contra geometría del mundo (edificios/montañas), nunca el personaje
      var dirCam = look.scale(-1);
      var ray = new B.Ray(head, dirCam, dist);
      var hit = scene.pickWithRay(ray, function (m) { return m.isPickable; });
      if (hit && hit.hit && hit.distance < dist) dist = Math.max(2.8, hit.distance * 0.85);
      var pos = head.add(dirCam.scale(dist));
      if (pos.y < 0.6) pos.y = 0.6; // que no se meta bajo el piso
      camera.position.copyFrom(pos);
      camera.setTarget(head.subtract(V3(0, 0.6, 0)));
    }
    torch.position.copyFrom(camera.position); torch.direction = look;
  }

  function actualizarNPCs(dt) {
    npcs.forEach(function (n) {
      if (n.marca) n.marca.rotation.y += dt * 2;
      if (n.giver) { // mira al jugador si está cerca
        if (B.Vector3.Distance(n.pos, player.pos) < 8) { var a = Math.atan2(player.pos.x - n.pos.x, player.pos.z - n.pos.z); n.h.root.rotation.y = lerpAng(n.h.root.rotation.y, a, 0.1); }
        return;
      }
      var to = n.objetivo.subtract(n.pos); to.y = 0;
      if (to.length() < 3) { n.objetivo = V3(rnd(-400, 400), 0, rnd(-400, 400)); return; }
      to.normalize(); n.pos.addInPlace(to.scale(n.vel * dt)); n.pos.y = 0;
      n.h.root.position.copyFrom(n.pos);
      n.h.root.rotation.y = lerpAng(n.h.root.rotation.y, Math.atan2(to.x, to.z), 0.1);
      animarPiernas(n.h, n.vel, dt);
    });
  }

  function chequearPickups() {
    for (var i = pickups.length - 1; i >= 0; i--) {
      var p = pickups[i]; p.mesh.rotation.y += 0.03; p.mesh.position.y = (p.tipo === "paquete" ? 1 : 1) + Math.sin(performance.now() / 400 + i) * 0.15;
      if (B.Vector3.Distance(p.mesh.position, player.pos) < 2.2) {
        if (p.tipo === "dinero") { darDinero(p.valor); banner("💰 +$" + p.valor); }
        else { S.inv["Paquete"] = (S.inv["Paquete"] || 0) + 1; if (S.mision === 1) { S.paquetes++; refrescarMision(); } banner("📦 Paquete recogido (" + S.paquetes + "/3)"); }
        p.mesh.dispose(); pickups.splice(i, 1); save();
      }
    }
  }

  function chequearMisiones() {
    var d = destinoMision(); if (!d) return;
    var dist = B.Vector3.Distance(player.pos, d);
    if (beacon) { beacon.position.x = d.x; beacon.position.z = d.z; beacon.setEnabled(S.mision !== 0 && S.mision < 5); }
    if (S.mision === 1 && S.paquetes >= 3) { completarMision(300, 60); }
    else if (S.mision === 2 && dist < 40 && player.enVehiculo) { completarMision(400, 90); }
    else if (S.mision === 3 && dist < 20) { S.inv["Chip de señal"] = 1; completarMision(350, 80); }
    else if (S.mision === 4 && dist < 70) { completarMision(600, 150); banner("🔓 Instalación investigada. <b>Campaña completada.</b>"); }
  }

  // ciclo día/noche
  function cicloDia() {
    var h = S.hora; var t = (h - 6) / 12; // 0 amanecer .. 1 atardecer
    var ang = (h / 24) * Math.PI * 2 - Math.PI / 2;
    sun.direction = V3(-Math.cos(ang), -Math.sin(Math.max(0.05, Math.sin(ang) * 0.9 + 0.1)) - 0.2, -0.4).normalize();
    var dia = clamp(Math.sin((h - 6) / 12 * Math.PI), 0, 1); // 0 noche, 1 mediodía
    sun.intensity = 0.2 + dia * 1.5; hemi.intensity = 0.25 + dia * 0.6;
    var sky = new B.Color3(lerp(0.03, 0.52, dia), lerp(0.04, 0.66, dia), lerp(0.09, 0.86, dia));
    scene.clearColor = new B.Color4(sky.r, sky.g, sky.b, 1); scene.fogColor = sky;
    var noche = dia < 0.25;
    matsEdif.forEach(function (m) { m.emissiveColor = noche ? new B.Color3(.9, .8, .5) : new B.Color3(0, 0, 0); });
    if (world.faroles) world.faroles.forEach(function (ml) { ml.emissiveColor = noche ? hex("#ffd98a") : new B.Color3(0, 0, 0); });
    $("txtClima").textContent = S.clima === "lluvia" ? "🌧" : (noche ? "🌙" : "☀");
    // clima: cambia de a ratos
    if (Math.random() < 0.0008) S.clima = S.clima === "lluvia" ? "sol" : "lluvia";
    aplicarClima();
  }
  var lluvia = null;
  function aplicarClima() {
    var ll = S.clima === "lluvia";
    scene.fogDensity = ll ? 0.004 : 0.0012;
    if (ll && !lluvia) {
      lluvia = new B.ParticleSystem("rain", 1400, scene);
      var rt = new B.DynamicTexture("rt", { width: 4, height: 16 }, scene, false); var rc = rt.getContext(); rc.fillStyle = "rgba(200,220,255,.9)"; rc.fillRect(1, 0, 2, 16); rt.update(); rt.hasAlpha = true;
      lluvia.particleTexture = rt; lluvia.emitter = camera;
      lluvia.minEmitBox = V3(-30, 20, -30); lluvia.maxEmitBox = V3(30, 25, 30);
      lluvia.color1 = new B.Color4(.7, .8, 1, .5); lluvia.color2 = new B.Color4(.6, .7, .9, .4);
      lluvia.minSize = 0.08; lluvia.maxSize = 0.14; lluvia.minLifeTime = .4; lluvia.maxLifeTime = .7;
      lluvia.emitRate = 1600; lluvia.gravity = V3(0, -120, 0); lluvia.direction1 = V3(-2, -20, -2); lluvia.direction2 = V3(2, -20, 2);
      lluvia.minEmitPower = 6; lluvia.maxEmitPower = 10; lluvia.start();
    } else if (!ll && lluvia) { lluvia.stop(); setTimeout(function () { if (lluvia) { lluvia.dispose(); lluvia = null; } }, 800); }
  }

  // ---------- menús ----------
  var colPlayer;
  function wireUI() {
    $("mReanudar").onclick = togglePausa;
    $("mInventario").onclick = function () { $("menu").classList.remove("on"); toggleOverlay("inv", true); };
    $("mControles").onclick = function () { $("menu").classList.remove("on"); toggleOverlay("ctrl", true); };
    $("mGuardar").onclick = function () { save(); banner("💾 Progreso guardado"); };
    $("mPersonalizar").onclick = function () { $("menu").classList.remove("on"); abrirPerso(); };
    $("invCerrar").onclick = function () { toggleOverlay("inv", false); };
    $("ctrlCerrar").onclick = function () { toggleOverlay("ctrl", false); };
    $("mapaCerrar").onclick = function () { toggleOverlay("mapa", false); };
    $("persoOk").onclick = function () { toggleOverlay("perso", false); save(); };
    $("dlgNo").onclick = function () { toggleOverlay("dlg", false); };
    $("dlgOk").onclick = function () { toggleOverlay("dlg", false); if (dlgActual && dlgActual.mision === S.mision && S.mision === 0) { completarMision(150, 40); } };
    // personalización: colores
    function pintarCol(id, arr, cur, set) { var c = $(id); c.innerHTML = arr.map(function (col, i) { return '<button data-i="' + i + '" class="' + (i === cur() ? "on" : "") + '" style="background:' + col + '"></button>'; }).join(""); Array.prototype.forEach.call(c.children, function (b) { b.onclick = function () { set(+b.dataset.i); Array.prototype.forEach.call(c.children, function (x) { x.classList.remove("on"); }); b.classList.add("on"); aplicarPerso(); }; }); }
    $("segSexo").querySelectorAll("button").forEach(function (b) { b.onclick = function () { $("segSexo").querySelectorAll("button").forEach(function (x) { x.classList.remove("on"); }); b.classList.add("on"); S.sexo = b.dataset.s; rehacerAvatar(); }; });
    window._pintarCol = pintarCol;
  }
  function abrirPerso() {
    window._pintarCol("colPiel", PIEL, function () { return S.piel; }, function (i) { S.piel = i; });
    window._pintarCol("colPelo", PELO, function () { return S.pelo; }, function (i) { S.pelo = i; });
    window._pintarCol("colRopa", ROPA, function () { return S.ropa; }, function (i) { S.ropa = i; });
    $("segSexo").querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", b.dataset.s === S.sexo); });
    toggleOverlay("perso", true);
  }
  function rehacerAvatar() { var pos = player.h.root.position.clone(); player.h.root.dispose(); construirJugador(); player.h.root.position.copyFrom(pos); }

  // ---------- INIT ----------
  function init() {
    prog(0.2, "Generando el mundo…");
    construirMundo();
    prog(0.5, "Creando tu personaje…");
    construirJugador();
    // colisionador del jugador
    colPlayer = B.MeshBuilder.CreateBox("colp", { width: .7, height: 1.8, depth: .7 }, scene);
    colPlayer.isVisible = false; colPlayer.checkCollisions = true; colPlayer.ellipsoid = new B.Vector3(.45, .9, .45); colPlayer.position = player.pos.clone(); colPlayer.isPickable = false;
    prog(0.7, "Poblando la ciudad…");
    crearNPCs();
    vehiculos = [];
    crearVehiculo("auto", 14, 10, "#2f6bff"); crearVehiculo("auto", -24, 40, "#ff5d6c"); crearVehiculo("moto", 20, -16, "#22d3ee");
    crearPickups(); faroMision();
    prog(0.9, "Preparando misiones…");
    wireUI(); refrescarMision();
    $("txtDinero").textContent = S.dinero; $("txtNivel").textContent = S.nivel; $("txtXp").textContent = S.xp + "/" + xpNivel(S.nivel) + " XP";
    if (esTactil) setupTactil();
    mundoListo = true;
    prog(1, "¡Listo!");
    setTimeout(function () { var c = $("cargando"); c.style.transition = "opacity .5s"; c.style.opacity = 0; setTimeout(function () { c.remove(); }, 500); $("hud").hidden = false; banner("Bienvenido a <b>NEXUS WORLD</b>. Seguí el marcador dorado para tu primera misión."); }, 300);
  }

  // aviso para activar el mouse (desktop) + hook de depuración
  var _hint = document.createElement("div");
  _hint.innerHTML = "🖱️ Hacé clic para mirar con el mouse · WASD para moverte · E para interactuar";
  _hint.style.cssText = "position:fixed;left:50%;bottom:24%;transform:translateX(-50%);z-index:7;padding:10px 18px;border-radius:12px;background:rgba(8,12,26,.78);border:1px solid rgba(130,160,255,.35);font:600 13px system-ui,sans-serif;color:#eaf0ff;pointer-events:none;display:none;text-align:center;max-width:90vw";
  document.body.appendChild(_hint);
  function _toggleHint() { var show = !esTactil && mundoListo && document.pointerLockElement !== canvas && !pausado && !cualquierOverlay(); _hint.style.display = show ? "block" : "none"; }
  document.addEventListener("pointerlockchange", _toggleHint); setInterval(_toggleHint, 400);
  try { window.NX = { get cam() { return cam; }, get player() { return player; }, scene: scene, engine: engine }; } catch (e) {}

  scene.registerBeforeRender(update);
  engine.runRenderLoop(function () { try { scene.render(); } catch (e) {} });
  window.addEventListener("resize", function () { engine.resize(); });
  window.addEventListener("beforeunload", save);

  // arranque (dar un frame para que pinte la pantalla de carga)
  requestAnimationFrame(function () { setTimeout(function () { try { init(); } catch (e) { fallo("Error al generar el mundo: " + e.message); console.error(e); } }, 60); });
})();
