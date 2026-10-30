// Copia la interfaz web de Jarvis (jarvis/app) dentro de desktop-jarvis/app antes de empaquetar.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'jarvis', 'app');
const DEST = path.join(__dirname, 'app');
fs.rmSync(DEST, { recursive: true, force: true });
fs.cpSync(SRC, DEST, { recursive: true, filter: f => !/sw\.js$/.test(f) }); // en la PC no hace falta el modo sin conexión
console.log(`Jarvis copiado en ${DEST}`);
