// Jarvis para Windows: vive en la bandeja del sistema, maneja la PC y abre la interfaz en una ventana de Edge
// (Edge trae reconocimiento de voz en español y voces naturales, que una ventana de Electron no tiene).
const { app, Tray, Menu, globalShortcut, shell, nativeImage, Notification, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { iniciar } = require('./agente');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.setAppUserModelId('dev.gonzalito.jarvis');

const DATOS = app.getPath('userData');
const PERFIL = path.join(DATOS, 'JarvisPerfil');
const CONFIG = path.join(DATOS, 'config.json');
const ICONO = path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const ATAJO = 'CommandOrControl+Alt+J';
let agente = null, tray = null, base = '';

function navegadores() {
  if (process.platform !== 'win32') return [['chromium', 'Chromium'], ['google-chrome', 'Chrome'], ['microsoft-edge', 'Edge']];
  const pf = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
  const edge = pf.map(p => [path.join(p, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), 'Edge']);
  const chrome = pf.map(p => [path.join(p, 'Google', 'Chrome', 'Application', 'chrome.exe'), 'Chrome']);
  const pref = (agente && agente.config().navegador) || 'edge';
  return (pref === 'chrome' ? chrome.concat(edge) : edge.concat(chrome)).filter(([f]) => fs.existsSync(f));
}

function abrirUI(extra) {
  const url = base + (extra ? '?' + extra : '');
  const lista = navegadores();
  for (const [exe] of lista) {
    try {
      const p = spawn(exe, ['--app=' + url, '--user-data-dir=' + PERFIL, '--no-first-run', '--no-default-browser-check', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--window-size=1220,780', '--disable-features=msEdgeSidebarV2,msHubApps'], { detached: true, stdio: 'ignore' });
      p.on('error', () => { }); p.unref(); return;
    } catch (e) { }
  }
  shell.openExternal(url);
  if (!abrirUI.avisado) { abrirUI.avisado = true; dialog.showMessageBox({ type: 'info', title: 'Jarvis', message: 'No encontré Microsoft Edge ni Google Chrome.', detail: 'Abrí Jarvis en tu navegador. Para hablarle con la voz, usá Edge o Chrome.' }); }
}

function hablar() { if (agente.clientes() > 0) agente.enviar({ tipo: 'escuchar' }); else abrirUI('escuchar=1'); }

function menu() {
  const c = agente.config();
  const login = app.getLoginItemSettings();
  return Menu.buildFromTemplate([
    { label: 'Abrir Jarvis', click: () => abrirUI(), type: 'normal' },
    { label: 'Hablar ahora', accelerator: ATAJO, click: hablar },
    { type: 'separator' },
    { label: 'Ajustes (voz, nombre, servidor de IA)', click: () => abrirUI('ajustes=1') },
    { label: 'Abrir en', submenu: [
      { label: 'Microsoft Edge (recomendado)', type: 'radio', checked: (c.navegador || 'edge') === 'edge', click: () => { agente.setConfig({ navegador: 'edge' }); } },
      { label: 'Google Chrome', type: 'radio', checked: c.navegador === 'chrome', click: () => { agente.setConfig({ navegador: 'chrome' }); } },
    ] },
    { label: 'Iniciar con Windows', type: 'checkbox', checked: !!login.openAtLogin, click: (it) => { app.setLoginItemSettings({ openAtLogin: it.checked, args: ['--oculto'] }); } },
    { type: 'separator' },
    { label: 'Jarvis ' + app.getVersion() + ' · GonzalitoDev', enabled: false },
    { label: 'Salir', click: () => { app.isQuiting = true; app.quit(); } },
  ]);
}

app.whenReady().then(async () => {
  agente = iniciar({
    raiz: path.join(__dirname, 'app'), configPath: CONFIG, perfilNavegador: PERFIL, version: app.getVersion(),
    abrirExterno: (u) => shell.openExternal(u), alCambiarConfig: () => { if (tray) tray.setContextMenu(menu()); },
  });
  let puerto;
  try { puerto = await agente.listo; }
  catch (e) { dialog.showErrorBox('Jarvis', 'No pude iniciar el servidor local: ' + e.message); app.quit(); return; }
  base = `http://127.0.0.1:${puerto}/`;

  tray = new Tray(nativeImage.createFromPath(ICONO));
  tray.setToolTip('Jarvis · ' + ATAJO.replace('CommandOrControl', 'Ctrl') + ' para hablar');
  tray.setContextMenu(menu());
  tray.on('click', () => abrirUI());
  tray.on('double-click', () => abrirUI());

  if (!globalShortcut.register(ATAJO, hablar)) console.warn('No pude registrar el atajo', ATAJO);

  const oculto = process.argv.includes('--oculto');
  const primera = !fs.existsSync(path.join(DATOS, '.ya-abierto'));
  if (primera) { try { fs.writeFileSync(path.join(DATOS, '.ya-abierto'), new Date().toISOString()); } catch (e) { } app.setLoginItemSettings({ openAtLogin: true, args: ['--oculto'] }); tray.setContextMenu(menu()); }
  if (!oculto) abrirUI();
  if (Notification.isSupported() && (primera || oculto)) new Notification({ title: 'Jarvis está listo', body: 'Está en la bandeja (al lado del reloj). Apretá Ctrl+Alt+J en cualquier momento para hablarle.', icon: ICONO }).show();
});

app.on('second-instance', () => abrirUI());
app.on('window-all-closed', e => e.preventDefault()); // no tiene ventanas propias: sigue en la bandeja
app.on('will-quit', () => { globalShortcut.unregisterAll(); if (agente) agente.cerrar(); });
