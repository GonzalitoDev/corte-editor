// Actualizador GonzaDev — app de escritorio para mantener al día los juegos en Linux.
const { app, BrowserWindow, ipcMain, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { APPS, parseLatest, estado, elegirFormato, verificarFirma, nombreSeguro, hostConfiable } = require('./lib');

// clave pública que firma las actualizaciones (la privada es secreta, está en GitHub)
const PUB = fs.readFileSync(path.join(__dirname, 'clave-publica.pem'), 'utf8');

app.commandLine.appendSwitch('ignore-gpu-blocklist');
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 760, height: 680, minWidth: 420, minHeight: 480,
    backgroundColor: '#0f1115', title: 'Actualizador GonzaDev', show: false,
    icon: path.join(__dirname, 'build', 'icon.png'), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false },
  });
  win.setMenu(null);
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(createWindow);
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
app.on('window-all-closed', () => app.quit());

// ── utilidades del sistema ──
const run = (cmd, args) => new Promise(res => execFile(cmd, args, { timeout: 15000 }, (err, out) => res({ err, out: (out || '').trim() })));
const existe = cmd => new Promise(res => execFile('sh', ['-c', 'command -v ' + cmd], e => res(!e)));

async function versionInstalada(pkg) {
  if (!(await existe('dpkg-query'))) return null;
  const { err, out } = await run('dpkg-query', ['-W', '-f=${Version}', pkg]);
  if (err || !out) return null;
  return out.replace(/^[0-9]+:/, '');            // saca el "epoch" si lo hubiera
}

// baja un archivo siguiendo redirecciones, con progreso (solo HTTPS y desde GitHub)
function descargar(url, destino, onProgress) {
  return new Promise((resolve, reject) => {
    if (!hostConfiable(url)) return reject(new Error('Descarga bloqueada: el origen no es GitHub por HTTPS'));
    const req = net.request(url);
    req.on('response', resp => {
      if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
        const loc = [].concat(resp.headers.location)[0];
        resp.resume();
        if (!hostConfiable(loc)) return reject(new Error('Redirección bloqueada: fuera de GitHub'));
        return descargar(loc, destino, onProgress).then(resolve, reject);
      }
      if (resp.statusCode !== 200) { reject(new Error('El servidor respondió ' + resp.statusCode)); resp.resume(); return; }
      const total = parseInt([].concat(resp.headers['content-length'] || '0')[0], 10) || 0;
      let bajado = 0; const hash = crypto.createHash('sha256');
      const f = fs.createWriteStream(destino);
      resp.on('data', d => { bajado += d.length; hash.update(d); f.write(d); if (onProgress) onProgress(total ? bajado / total : 0, bajado, total); });
      resp.on('end', () => f.end(() => resolve(hash.digest('hex'))));
      resp.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

// trae el texto crudo de un archivo chico desde GitHub (con tope de tamaño)
function traerTexto(url) {
  return new Promise((resolve, reject) => {
    if (!hostConfiable(url)) return reject(new Error('Origen no confiable'));
    let pedido = url;
    try { if (/(^|\.)github\.com$/.test(new URL(url).hostname)) pedido = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(); } catch (e) {}
    const req = net.request(pedido);
    req.on('response', resp => {
      if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
        const loc = [].concat(resp.headers.location)[0]; resp.resume();
        if (!hostConfiable(loc)) return reject(new Error('Redirección no confiable'));
        return traerTexto(loc).then(resolve, reject);
      }
      if (resp.statusCode !== 200) { reject(new Error('HTTP ' + resp.statusCode)); resp.resume(); return; }
      let data = '', size = 0;
      resp.on('data', d => { size += d.length; if (size > 512 * 1024) { reject(new Error('Respuesta demasiado grande')); resp.resume(); return; } data += d; });
      resp.on('end', () => resolve(data));
      resp.on('error', reject);
    });
    req.on('error', reject); req.end();
  });
}

// trae el latest.json y su firma, y SOLO lo acepta si la firma es válida
async function cargarLatest(a) {
  const crudo = await traerTexto(a.base + 'latest.json');
  let firma = null;
  try { firma = await traerTexto(a.base + 'latest.json.sig'); }
  catch (e) { throw new Error('La actualización no viene firmada; por seguridad no se instala.'); }
  if (!verificarFirma(crudo, firma, PUB)) throw new Error('La firma de la actualización no coincide; por seguridad no se instala.');
  return parseLatest(JSON.parse(crudo));
}

// ── IPC ──
ipcMain.handle('cargar', async () => {
  const dpkg = await existe('dpkg-query');
  const apps = [];
  for (const a of APPS) apps.push({ id: a.id, nombre: a.nombre, color: a.color, resumen: a.resumen, base: a.base, instalada: await versionInstalada(a.pkg) });
  return { apps, dpkg, pkexec: await existe('pkexec') };
});

ipcMain.handle('buscar', async (_e, id) => {
  const a = APPS.find(x => x.id === id); if (!a) return { error: 'desconocido' };
  try { const latest = await cargarLatest(a); const instalada = await versionInstalada(a.pkg); return { latest, instalada, estado: estado(instalada, latest.version) }; }
  catch (e) { return { error: e.message }; }
});

ipcMain.handle('abrirWeb', (_e, url) => { shell.openExternal(url); });
ipcMain.handle('jugar', async (_e, id) => {
  const a = APPS.find(x => x.id === id); if (!a) return { ok: false };
  execFile(a.bin, [], { detached: true, stdio: 'ignore' }).unref?.();
  return { ok: true };
});

ipcMain.handle('actualizar', async (e, id) => {
  const a = APPS.find(x => x.id === id); if (!a) return { ok: false, error: 'desconocido' };
  const enviar = (fase, extra) => e.sender.send('progreso', Object.assign({ id, fase }, extra));
  try {
    const latest = await cargarLatest(a);
    const dpkg = await existe('dpkg-query');
    const fmt = elegirFormato(latest, dpkg);
    if (!fmt) return { ok: false, error: 'No hay un archivo para tu sistema' };
    if (!nombreSeguro(fmt.archivo)) return { ok: false, error: 'Nombre de archivo inválido' };
    if (!fmt.sha) return { ok: false, error: 'La actualización no trae su huella (sha256); por seguridad no se instala.' };
    const destino = path.join(os.tmpdir(), fmt.archivo);
    enviar('descargando', { pct: 0 });
    const sha = await descargar(a.base + fmt.archivo, destino, (p, b, t) => enviar('descargando', { pct: p, bajado: b, total: t }));
    if (fmt.sha && fmt.sha.toLowerCase() !== sha.toLowerCase()) throw new Error('El archivo descargado no coincide (sha256). Probá de nuevo.');

    if (fmt.tipo === 'deb') {
      if (!(await existe('pkexec'))) throw new Error('Falta pkexec (PolicyKit) para instalar. Instalalo o usá el .deb a mano.');
      enviar('instalando', {});
      // apt-get resuelve dependencias; si falla, probamos dpkg + arreglo
      let r = await run('pkexec', ['apt-get', 'install', '-y', '--allow-downgrades', destino]);
      if (r.err) { r = await run('pkexec', ['sh', '-c', `dpkg -i '${destino.replace(/'/g, "'\\''")}' || apt-get -f install -y`]); }
      fs.unlink(destino, () => {});
      if (r.err) throw new Error('No se pudo instalar. ¿Cancelaste la contraseña?');
      return { ok: true, tipo: 'deb', version: latest.version };
    } else {
      // AppImage: lo dejamos listo para usar en la carpeta de Aplicaciones
      const dir = path.join(os.homedir(), 'Aplicaciones'); fs.mkdirSync(dir, { recursive: true });
      const final = path.join(dir, fmt.archivo);
      fs.renameSync(destino, final); fs.chmodSync(final, 0o755);
      return { ok: true, tipo: 'appimage', ruta: final, version: latest.version };
    }
  } catch (err) { return { ok: false, error: err.message }; }
});
