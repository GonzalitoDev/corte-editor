// Copia el simulador web dentro de desktop-gonzasky/app antes de empaquetar.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'gonzasky');
const DEST = path.join(__dirname, 'app');
fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
fs.cpSync(path.join(SRC, 'volar'), path.join(DEST, 'volar'), { recursive: true });
fs.copyFileSync(path.join(SRC, 'icon.svg'), path.join(DEST, 'icon.svg'));
console.log(`GonzaSky copiado en ${DEST}`);
