// Copia la suite web dentro de desktop/app antes de empaquetar.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..');
const DEST = path.join(__dirname, 'app');
const ITEMS = ['index.html', 'shared', 'corte', 'lienzo', 'trazo', 'folio', 'onda'];

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
for (const item of ITEMS) {
  const from = path.join(SRC, item);
  if (!fs.existsSync(from)) throw new Error(`Falta ${item}`);
  fs.cpSync(from, path.join(DEST, item), { recursive: true });
}
console.log(`Suite copiada en ${DEST}`);
