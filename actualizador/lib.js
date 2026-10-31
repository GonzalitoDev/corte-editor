// Actualizador GonzaDev — lógica pura (sin Electron), para poder probarla aparte.
'use strict';
const crypto = require('crypto');

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

// verifica la firma Ed25519 del latest.json con la clave pública que trae la app
function verificarFirma(datos, firmaB64, pubPem) {
  try {
    const buf = Buffer.isBuffer(datos) ? datos : Buffer.from(String(datos), 'utf8');
    const sig = Buffer.from(String(firmaB64 || '').replace(/\s+/g, ''), 'base64');
    if (!sig.length) return false;
    return crypto.verify(null, buf, pubPem, sig);
  } catch (e) { return false; }
}

// el nombre del archivo a bajar tiene que ser simple (sin rutas ni trucos)
function nombreSeguro(n) {
  return typeof n === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(n) && !n.includes('..');
}

// solo bajamos por HTTPS y desde GitHub (incluidas sus redirecciones de descarga)
function hostConfiable(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return h === 'github.com' || h === 'githubusercontent.com' || h.endsWith('.githubusercontent.com');
  } catch (e) { return false; }
}

module.exports = { APPS, partes, cmpVersion, parseLatest, estado, elegirFormato, verificarFirma, nombreSeguro, hostConfiable };
