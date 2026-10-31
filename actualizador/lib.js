// Actualizador GonzaDev — lógica pura (sin Electron), para poder probarla aparte.
'use strict';

// Qué juegos conoce el actualizador. Cada uno publica un latest.json en su release.
const APPS = [
  {
    id: 'gonzacraft', nombre: 'GonzaCraft', pkg: 'gonzacraft', bin: 'gonzacraft',
    color: '#6cbf4b', tag: 'gonzacraft',
    base: 'https://github.com/GonzalitoDev/corte-editor/releases/download/gonzacraft/',
    resumen: 'Juego de bloques con mundo infinito, supervivencia, creativo y multijugador.',
  },
  {
    id: 'gonzasky', nombre: 'GonzaSky', pkg: 'gonzasky', bin: 'gonzasky',
    color: '#5aa9ff', tag: 'gonzasky',
    base: 'https://github.com/GonzalitoDev/corte-editor/releases/download/gonzasky/',
    resumen: 'Simulador de vuelo con dogfight online, varios aviones y desafíos.',
  },
];

// separa una versión "1.0.42" en números; tolera prefijos tipo "v1.2"
function partes(v) {
  return String(v || '0').trim().replace(/^v/i, '').split(/[.\-+]/).map(n => {
    const x = parseInt(n, 10); return isNaN(x) ? 0 : x;
  });
}

// compara dos versiones: -1 si a<b, 0 si iguales, 1 si a>b
function cmpVersion(a, b) {
  const pa = partes(a), pb = partes(b), n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d < 0 ? -1 : 1; }
  return 0;
}

// valida y normaliza el latest.json que publica el workflow
function parseLatest(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('metadata inválida');
  if (!obj.version) throw new Error('falta la versión');
  return {
    version: String(obj.version),
    fecha: obj.fecha || null,
    notas: obj.notas || '',
    deb: obj.deb || null,
    appimage: obj.appimage || null,
    exe: obj.exe || null,
    sha256: obj.sha256 || {},
  };
}

// decide el estado de un juego comparando lo instalado con lo último publicado
function estado(instalada, ultima) {
  if (!instalada) return 'no-instalado';
  if (!ultima) return 'desconocido';
  return cmpVersion(ultima, instalada) > 0 ? 'nueva' : 'al-dia';
}

// elige qué archivo bajar según el sistema (deb en Mint/Ubuntu, si no AppImage)
function elegirFormato(latest, tieneDpkg) {
  if (tieneDpkg && latest.deb) return { tipo: 'deb', archivo: latest.deb, sha: (latest.sha256 || {}).deb || null };
  if (latest.appimage) return { tipo: 'appimage', archivo: latest.appimage, sha: (latest.sha256 || {}).appimage || null };
  if (latest.deb) return { tipo: 'deb', archivo: latest.deb, sha: (latest.sha256 || {}).deb || null };
  return null;
}

module.exports = { APPS, partes, cmpVersion, parseLatest, estado, elegirFormato };
