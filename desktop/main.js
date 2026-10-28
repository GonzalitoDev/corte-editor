// Taller para escritorio: abre las apps de la suite en una ventana propia.
const { app, BrowserWindow, protocol, net, shell, session, desktopCapturer, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const SCHEME = 'taller';
const ROOT = path.join(__dirname, 'app');
const HOME = `${SCHEME}://app/index.html`;

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 960, minHeight: 620,
    backgroundColor: '#0f1115', title: 'Taller', show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadURL(HOME);

  // Los enlaces externos (GitHub, etc.) se abren en el navegador.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`${SCHEME}://`)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`${SCHEME}://`)) { e.preventDefault(); shell.openExternal(url); }
  });
  win.on('page-title-updated', (e, title) => { e.preventDefault(); win.setTitle(title === 'Taller' ? 'Taller' : `${title} · Taller`); });
}

function go(p) { if (win) win.loadURL(`${SCHEME}://app/${p}`); }

function buildMenu() {
  const tpl = [
    { label: 'Archivo', submenu: [
      { label: 'Inicio', accelerator: 'Alt+Home', click: () => go('index.html') },
      { type: 'separator' },
      { label: 'Corte · video', accelerator: 'Alt+1', click: () => go('corte/') },
      { label: 'Lienzo · fotos', accelerator: 'Alt+2', click: () => go('lienzo/') },
      { label: 'Trazo · vectores', accelerator: 'Alt+3', click: () => go('trazo/') },
      { label: 'Folio · PDF', accelerator: 'Alt+4', click: () => go('folio/') },
      { type: 'separator' },
      { role: 'quit', label: 'Salir' },
    ] },
    { label: 'Ver', submenu: [
      { role: 'reload', label: 'Recargar' },
      { role: 'togglefullscreen', label: 'Pantalla completa' },
      { type: 'separator' },
      { role: 'resetZoom', label: 'Tamaño normal' },
      { role: 'zoomIn', label: 'Agrandar interfaz' },
      { role: 'zoomOut', label: 'Achicar interfaz' },
      { type: 'separator' },
      { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
    ] },
    { label: 'Ayuda', submenu: [
      { label: 'Código en GitHub', click: () => shell.openExternal('https://github.com/GonzalitoDev/corte-editor') },
      { label: `Versión ${app.getVersion()}`, enabled: false },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(() => {
  // Sirve los archivos de la suite desde taller://app/...
  protocol.handle(SCHEME, req => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT)) return new Response('No permitido', { status: 403 });
    try {
      if (fs.statSync(file).isDirectory()) return Response.redirect(u.href.replace(/\/?$/, '/'), 301);
    } catch (e) {
      return new Response('No encontrado', { status: 404 });
    }
    return net.fetch(pathToFileURL(file).toString());
  });

  // Micrófono, cámara y pantalla para grabar en Corte; portapapeles para copiar y pegar.
  const allowed = new Set(['media', 'display-capture', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'notifications']);
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(allowed.has(perm)));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => allowed.has(perm));
  session.defaultSession.setDisplayMediaRequestHandler((req, cb) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] })
      .then(sources => cb(sources.length ? { video: sources[0], audio: process.platform === 'win32' ? 'loopback' : undefined } : {}))
      .catch(() => cb({}));
  });

  buildMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
