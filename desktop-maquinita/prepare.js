// Copia el juego web dentro de desktop-maquinita/app antes de empaquetar.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'maquinita');
const DEST = path.join(__dirname, 'app');
fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
for (const f of fs.readdirSync(SRC)) {
  if (f === 'node_modules' || f === 'descargar') continue; // la página de descarga no va en la app
  fs.cpSync(path.join(SRC, f), path.join(DEST, f), { recursive: true });
}
console.log(`La Maquinita copiada en ${DEST}`);
