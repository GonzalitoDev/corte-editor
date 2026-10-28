// GonzaCraft para escritorio (Windows y Linux).
const { app, BrowserWindow, protocol, net, shell, session, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const SCHEME = 'gonzacraft';
const ROOT = path.join(__dirname, 'app');
const HOME = `${SCHEME}://app/jugar/index.html`;

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } },
]);
// Mejor rendimiento en placas de video viejas
app.commandLine.appendSwitch('ignore-gpu-blocklist');

if (!app.requestSingleInstanceLock()) app.quit();
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 760, minWidth: 800, minHeight: 500,
    backgroundColor: '#000000', title: 'GonzaCraft', show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false, backgroundThrottling: false },
  });
  win.setMenu(null);
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadURL(HOME);
  win.webContents.setWindowOpenHandler(({ url }) => { if (!url.startsWith(`${SCHEME}://`)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(HOME.split('index.html')[0])) { e.preventDefault(); if (!url.startsWith(`${SCHEME}://`)) shell.openExternal(url); } });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.key === 'F12' && input.control && input.shift) win.webContents.toggleDevTools();
  });
  win.on('page-title-updated', e => e.preventDefault());
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(() => {
  protocol.handle(SCHEME, req => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT)) return new Response('No permitido', { status: 403 });
    try { if (fs.statSync(file).isDirectory()) return Response.redirect(u.href.replace(/\/?$/, '/'), 301); }
    catch (e) { return new Response('No encontrado', { status: 404 }); }
    return net.fetch(pathToFileURL(file).toString());
  });
  const allowed = new Set(['pointerLock', 'fullscreen', 'clipboard-sanitized-write', 'keyboardLock']);
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(allowed.has(perm)));
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => app.quit());
