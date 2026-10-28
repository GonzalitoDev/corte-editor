// Copia el juego web dentro de desktop-gonzacraft/app antes de empaquetar.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'gonzacraft');
const DEST = path.join(__dirname, 'app');
fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
fs.cpSync(path.join(SRC, 'jugar'), path.join(DEST, 'jugar'), { recursive: true });
fs.copyFileSync(path.join(SRC, 'icon.svg'), path.join(DEST, 'icon.svg'));
console.log(`GonzaCraft copiado en ${DEST}`);
