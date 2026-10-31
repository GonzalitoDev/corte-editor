// Auto-actualización para los juegos de escritorio (Linux).
// Al abrir, chequea el latest.json FIRMADO del release, compara la versión con la
// instalada y, si hay una nueva, ofrece actualizar e instala el .deb con pkexec.
// Falla en silencio: nunca rompe el juego.
'use strict';
const { app, dialog, net } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const run = (cmd, args) => new Promise(res => execFile(cmd, args, { timeout: 20000 }, (err, out) => res({ err, out: (out || '').trim() })));
const existe = cmd => new Promise(res => execFile('sh', ['-c', 'command -v ' + cmd], e => res(!e)));

function cmpVersion(a, b) {
  const pa = String(a || '0').replace(/^v/i, '').split(/[.\-+]/).map(n => parseInt(n, 10) || 0);
  const pb = String(b || '0').replace(/^v/i, '').split(/[.\-+]/).map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d < 0 ? -1 : 1; }
  return 0;
}
function hostConfiable(url) {
  try { const u = new URL(url); if (u.protocol !== 'https:') return false; const h = u.hostname.toLowerCase(); return h === 'github.com' || h === 'githubusercontent.com' || h.endsWith('.githubusercontent.com'); } catch (e) { return false; }
}
function verificar(datos, firmaB64, pubPem) {
  try { const sig = Buffer.from(String(firmaB64 || '').replace(/\s+/g, ''), 'base64'); if (!sig.length) return false; return crypto.verify(null, Buffer.isBuffer(datos) ? datos : Buffer.from(datos), pubPem, sig); } catch (e) { return false; }
}
const nombreSeguro = n => typeof n === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(n) && !n.includes('..');

function traerTexto(url) {
  return new Promise((resolve, reject) => {
    if (!hostConfiable(url)) return reject(new Error('origen'));
    let pedido = url;
    try { if (/(^|\.)github\.com$/.test(new URL(url).hostname)) pedido = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(); } catch (e) {}
    const req = net.request(pedido);
    req.on('response', resp => {
      if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) { const loc = [].concat(resp.headers.location)[0]; resp.resume(); return hostConfiable(loc) ? traerTexto(loc).then(resolve, reject) : reject(new Error('redir')); }
      if (resp.statusCode !== 200) { resp.resume(); return reject(new Error('http ' + resp.statusCode)); }
      let data = '', n = 0; resp.on('data', d => { n += d.length; if (n > 262144) { resp.resume(); return reject(new Error('grande')); } data += d; });
      resp.on('end', () => resolve(data)); resp.on('error', reject);
    });
    req.on('error', reject); req.end();
  });
}
function descargar(url, destino, onProgress) {
  return new Promise((resolve, reject) => {
    if (!hostConfiable(url)) return reject(new Error('origen'));
    const req = net.request(url);
    req.on('response', resp => {
      if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) { const loc = [].concat(resp.headers.location)[0]; resp.resume(); return hostConfiable(loc) ? descargar(loc, destino, onProgress).then(resolve, reject) : reject(new Error('redir')); }
      if (resp.statusCode !== 200) { resp.resume(); return reject(new Error('http ' + resp.statusCode)); }
      const hash = crypto.createHash('sha256'); const f = fs.createWriteStream(destino);
      resp.on('data', d => { hash.update(d); f.write(d); });
      resp.on('end', () => f.end(() => resolve(hash.digest('hex')))); resp.on('error', reject);
    });
    req.on('error', reject); req.end();
  });
}

// cfg: { base: 'https://github.com/.../releases/download/<tag>/', nombre: 'La Maquinita' }
module.exports = function autoActualizar(cfg) {
  let PUB;
  try { PUB = fs.readFileSync(path.join(__dirname, 'clave-publica.pem'), 'utf8'); } catch (e) { return; }

  async function cargarLatest() {
    const crudo = await traerTexto(cfg.base + 'latest.json');
    const firma = await traerTexto(cfg.base + 'latest.json.sig');  // si no está, tira error -> no actualiza
    if (!verificar(crudo, firma, PUB)) throw new Error('firma');
    const j = JSON.parse(crudo);
    if (!j.version) throw new Error('version');
    return j;
  }

  async function revisar() {
    try {
      if (process.platform !== 'linux') return;                 // auto-update solo en Linux por ahora
      if (!(await existe('dpkg-query')) || !(await existe('pkexec'))) return;
      const latest = await cargarLatest();
      if (cmpVersion(latest.version, app.getVersion()) <= 0) return;   // ya estás al día
      const archivo = latest.deb, sha = (latest.sha256 || {}).deb;
      if (!nombreSeguro(archivo) || !sha) return;

      const r = await dialog.showMessageBox({
        type: 'info', buttons: ['Actualizar ahora', 'Ahora no'], defaultId: 0, cancelId: 1,
        title: cfg.nombre, message: `Hay una versión nueva de ${cfg.nombre} (${latest.version}).`,
        detail: (latest.notas ? latest.notas + '\n\n' : '') + 'Se descarga y se instala (te va a pedir la contraseña).',
      });
      if (r.response !== 0) return;

      const destino = path.join(os.tmpdir(), archivo);
      const bajado = await descargar(cfg.base + archivo, destino);
      if (bajado.toLowerCase() !== String(sha).toLowerCase()) { fs.unlink(destino, () => {}); throw new Error('sha'); }

      let inst = await run('pkexec', ['apt-get', 'install', '-y', '--allow-downgrades', destino]);
      if (inst.err) inst = await run('pkexec', ['sh', '-c', `dpkg -i '${destino.replace(/'/g, "'\\''")}' || apt-get -f install -y`]);
      fs.unlink(destino, () => {});
      if (inst.err) return;  // canceló la contraseña o falló: no molestamos

      const r2 = await dialog.showMessageBox({ type: 'info', buttons: ['Reiniciar ahora', 'Después'], defaultId: 0, title: cfg.nombre, message: `¡${cfg.nombre} se actualizó a ${latest.version}!`, detail: 'Reiniciá el juego para usar la versión nueva.' });
      if (r2.response === 0) { app.relaunch(); app.exit(0); }
    } catch (e) { /* sin conexión, sin firma, etc.: en silencio */ }
  }

  app.whenReady().then(() => setTimeout(revisar, 3500));
};
