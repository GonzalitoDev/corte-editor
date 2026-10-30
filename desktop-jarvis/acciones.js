// Lo que Jarvis puede hacer en la PC. En Windows usa comandos del sistema y PowerShell; en Linux, equivalentes básicos (para probar).
const { spawn, execFile } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const WIN = process.platform === 'win32';
const DRY = !!process.env.JARVIS_DRY; // modo prueba: no ejecuta nada, solo anota
const registro = [];

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+ ]/g, ' ').replace(/\s+/g, ' ').trim();

function correr(cmd, args, opts) {
  registro.push([cmd, ...(args || [])].join(' '));
  if (DRY) return Promise.resolve({ ok: true, out: '' });
  return new Promise(res => {
    execFile(cmd, args || [], Object.assign({ windowsHide: true, timeout: 20000, maxBuffer: 8 << 20 }, opts), (err, out, errOut) => res({ ok: !err, out: String(out || ''), err: err ? String(errOut || err.message) : '' }));
  });
}
function lanzar(cmd, args) {
  registro.push('lanzar ' + [cmd, ...(args || [])].join(' '));
  if (DRY) return true;
  try { const p = spawn(cmd, args || [], { detached: true, stdio: 'ignore', windowsHide: false }); p.on('error', () => { }); p.unref(); return true; } catch (e) { return false; }
}
const ps = (script) => correr('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]);

/* ── apps del menú Inicio (Get-StartApps incluye las de la Tienda) ── */
let startApps = [], startAppsT = 0;
async function cargarApps() {
  if (!WIN || DRY) return startApps;
  if (Date.now() - startAppsT < 10 * 60e3 && startApps.length) return startApps;
  const r = await ps('[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress');
  if (r.ok && r.out.trim()) {
    try { let j = JSON.parse(r.out); if (!Array.isArray(j)) j = [j]; startApps = j.filter(a => a && a.Name && a.AppID).map(a => ({ nombre: a.Name, n: norm(a.Name), id: a.AppID })); startAppsT = Date.now(); } catch (e) { }
  }
  return startApps;
}

// apps que siempre existen o se abren con un protocolo
const APPS = {
  'bloc de notas': ['notepad.exe'], notepad: ['notepad.exe'], 'block de notas': ['notepad.exe'],
  calculadora: ['calc.exe'], explorador: ['explorer.exe'], 'explorador de archivos': ['explorer.exe'], archivos: ['explorer.exe'],
  paint: ['mspaint.exe'], cmd: ['cmd.exe', ['/c', 'start', 'cmd.exe']], consola: ['cmd.exe', ['/c', 'start', 'cmd.exe']], 'simbolo del sistema': ['cmd.exe', ['/c', 'start', 'cmd.exe']],
  terminal: ['cmd.exe', ['/c', 'start', 'wt.exe']], powershell: ['cmd.exe', ['/c', 'start', 'powershell.exe']],
  'administrador de tareas': ['taskmgr.exe'], 'panel de control': ['control.exe'],
  configuracion: ['uri', 'ms-settings:'], ajustes: ['uri', 'ms-settings:'], 'configuracion de windows': ['uri', 'ms-settings:'],
  'configuracion de sonido': ['uri', 'ms-settings:sound'], wifi: ['uri', 'ms-settings:network-wifi'], bluetooth: ['uri', 'ms-settings:bluetooth'], 'windows update': ['uri', 'ms-settings:windowsupdate'],
  camara: ['uri', 'microsoft.windows.camera:'], reloj: ['uri', 'ms-clock:'], alarmas: ['uri', 'ms-clock:'], fotos: ['uri', 'ms-photos:'], tienda: ['uri', 'ms-windows-store:'], 'microsoft store': ['uri', 'ms-windows-store:'],
  recortes: ['uri', 'ms-screenclip:'], 'herramienta de recortes': ['uri', 'ms-screenclip:'],
  edge: ['cmd.exe', ['/c', 'start', '', 'msedge']], chrome: ['cmd.exe', ['/c', 'start', '', 'chrome']], 'google chrome': ['cmd.exe', ['/c', 'start', '', 'chrome']], firefox: ['cmd.exe', ['/c', 'start', '', 'firefox']], opera: ['cmd.exe', ['/c', 'start', '', 'opera']], brave: ['cmd.exe', ['/c', 'start', '', 'brave']],
  word: ['cmd.exe', ['/c', 'start', '', 'winword']], excel: ['cmd.exe', ['/c', 'start', '', 'excel']], powerpoint: ['cmd.exe', ['/c', 'start', '', 'powerpnt']], outlook: ['cmd.exe', ['/c', 'start', '', 'outlook']],
  spotify: ['uri', 'spotify:', 'Spotify'], discord: ['uri', 'discord://', 'Discord'], steam: ['uri', 'steam://open/main', 'Steam'], whatsapp: ['uri', 'whatsapp:', 'WhatsApp'], telegram: ['uri', 'tg://', 'Telegram'],
  'visual studio code': ['uri', 'vscode://', 'Visual Studio Code'], vscode: ['uri', 'vscode://', 'Visual Studio Code'], 'vs code': ['uri', 'vscode://', 'Visual Studio Code'],
};
// procesos para cerrar
const PROCESOS = {
  chrome: 'chrome.exe', 'google chrome': 'chrome.exe', edge: 'msedge.exe', firefox: 'firefox.exe', opera: 'opera.exe', brave: 'brave.exe', spotify: 'Spotify.exe', discord: 'Discord.exe', steam: 'steam.exe',
  word: 'WINWORD.EXE', excel: 'EXCEL.EXE', powerpoint: 'POWERPNT.EXE', outlook: 'OUTLOOK.EXE', 'bloc de notas': 'notepad.exe', notepad: 'notepad.exe', calculadora: 'CalculatorApp.exe',
  paint: 'mspaint.exe', whatsapp: 'WhatsApp.exe', telegram: 'Telegram.exe', 'visual studio code': 'Code.exe', vscode: 'Code.exe', 'vs code': 'Code.exe', obs: 'obs64.exe', vlc: 'vlc.exe',
  'administrador de tareas': 'Taskmgr.exe', cmd: 'cmd.exe', fortnite: 'FortniteClient-Win64-Shipping.exe', minecraft: 'javaw.exe', roblox: 'RobloxPlayerBeta.exe', 'epic games': 'EpicGamesLauncher.exe',
  gonzacraft: 'GonzaCraft.exe', gonzasky: 'GonzaSky.exe', corte: 'Corte.exe',
};
const PROTEGIDOS = /^(explorer|svchost|csrss|winlogon|lsass|system|dwm|smss|services|wininit|jarvis|electron|fontdrvhost|registry)(\.exe)?$/i;

function mejorCoincidencia(q, lista) {
  const n = norm(q); if (!n) return null;
  let best = null, bs = 0;
  for (const a of lista) {
    let s = 0;
    if (a.n === n) s = 100;
    else if (a.n.startsWith(n + ' ') || a.n.startsWith(n)) s = 80 - Math.min(20, a.n.length - n.length);
    else if (a.n.includes(' ' + n) || a.n.includes(n)) s = 60 - Math.min(20, a.n.length - n.length);
    else { const pq = n.split(' '), pa = a.n.split(' '); const comun = pq.filter(w => w.length > 2 && pa.includes(w)).length; if (comun) s = 30 * comun / pq.length; }
    if (s > bs) { bs = s; best = a; }
  }
  return bs >= 40 ? best : null;
}

const CARPETAS = { descargas: 'shell:Downloads', documentos: 'shell:Personal', escritorio: 'shell:Desktop', imagenes: 'shell:My Pictures', musica: 'shell:My Music', videos: 'shell:My Video' };
const CARPETAS_LINUX = { descargas: 'Downloads', documentos: 'Documents', escritorio: 'Desktop', imagenes: 'Pictures', musica: 'Music', videos: 'Videos' };

function teclas(codigo, veces) { // teclas multimedia virtuales: 173 silencio, 174 bajar, 175 subir, 176 siguiente, 177 anterior, 179 pausa
  return ps(`$w=New-Object -ComObject WScript.Shell; for($i=0;$i -lt ${veces};$i++){ $w.SendKeys([char]${codigo}); Start-Sleep -Milliseconds 15 }`);
}

function crear({ abrirExterno, perfilNavegador } = {}) {
  const abrir = (url) => { if (abrirExterno && !DRY) { registro.push('externo ' + url); abrirExterno(url); return true; } return WIN ? lanzar('rundll32.exe', ['url.dll,FileProtocolHandler', url]) : lanzar('xdg-open', [url]); };

  async function ejecutar(a) {
    a = a || {};
    switch (a.tipo) {
      case 'abrir_web': {
        const url = String(a.url || ''); if (!/^https?:\/\//i.test(url)) return { ok: false, mensaje: 'Esa dirección no es válida.' };
        abrir(url); return { ok: true };
      }
      case 'abrir_carpeta': {
        const c = norm(a.carpeta); if (!CARPETAS[c]) return { ok: false, mensaje: 'No conozco esa carpeta.' };
        if (WIN) lanzar('explorer.exe', [CARPETAS[c]]); else lanzar('xdg-open', [path.join(os.homedir(), CARPETAS_LINUX[c])]);
        return { ok: true };
      }
      case 'abrir_app': {
        const q = norm(a.app); if (!q) return { ok: false, mensaje: '¿Qué programa abro?' };
        if (!WIN) { lanzar(q.split(' ')[0], []); return { ok: true }; }
        const fijo = APPS[q];
        // primero lo instalado (menú Inicio), así «spotify» abre la app y no falla si no existe el protocolo
        const lista = await cargarApps();
        const enInicio = mejorCoincidencia(fijo && fijo[2] ? fijo[2] : q, lista);
        if (fijo && fijo[0] !== 'uri') { lanzar(fijo[0], fijo[1] || []); return { ok: true }; }
        if (enInicio) { lanzar('explorer.exe', ['shell:AppsFolder\\' + enInicio.id]); return { ok: true, decir: '' }; }
        if (fijo && fijo[0] === 'uri' && !fijo[2]) { abrir(fijo[1]); return { ok: true }; }
        return { ok: false, mensaje: `No encontré ${a.app} instalado en esta computadora.` };
      }
      case 'cerrar_app': {
        const q = norm(a.app); let exe = PROCESOS[q];
        if (!exe) { const enInicio = mejorCoincidencia(q, Object.keys(PROCESOS).map(k => ({ n: k, k }))); if (enInicio) exe = PROCESOS[enInicio.k]; }
        if (!exe) exe = q.replace(/\s+/g, '') + '.exe';
        if (PROTEGIDOS.test(exe)) return { ok: false, mensaje: 'Ese programa es del sistema: mejor no lo cierro.' };
        if (!WIN) { await correr('pkill', ['-f', exe.replace(/\.exe$/i, '')]); return { ok: true, decir: `Cerré ${a.app}.` }; }
        if (/^msedge\.exe$/i.test(exe)) { // sin cerrar la ventana de Jarvis (que vive en Edge con su propio perfil)
          const r = await ps(`$n=0; Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -notlike '*${perfilNavegador ? path.basename(perfilNavegador) : 'JarvisPerfil'}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $n++ }; $n`);
          return +r.out.trim() > 0 || DRY ? { ok: true, decir: 'Cerré Edge.' } : { ok: false, mensaje: 'Edge no estaba abierto.' };
        }
        let r = await correr('taskkill.exe', ['/IM', exe, '/T']);
        if (!r.ok && /no se encontr|not found/i.test(r.err)) return { ok: false, mensaje: `${a.app} no estaba abierto.` };
        if (!r.ok) r = await correr('taskkill.exe', ['/IM', exe, '/T', '/F']);
        return r.ok ? { ok: true, decir: `Cerré ${a.app}.` } : { ok: false, mensaje: `No pude cerrar ${a.app}.` };
      }
      case 'volumen': {
        const acc = norm(a.accion);
        if (!WIN) { const v = acc === 'subir' ? '+10%' : acc === 'bajar' ? '-10%' : acc === 'fijar' ? Math.round(+a.valor || 0) + '%' : null; if (v) await correr('pactl', ['set-sink-volume', '@DEFAULT_SINK@', v]); else await correr('pactl', ['set-sink-mute', '@DEFAULT_SINK@', 'toggle']); return { ok: true }; }
        if (acc === 'subir') await teclas(175, 5);
        else if (acc === 'bajar') await teclas(174, 5);
        else if (acc === 'silenciar') await teclas(173, 1);
        else if (acc === 'fijar') { const v = Math.max(0, Math.min(100, Math.round(+a.valor || 0))); await teclas(174, 50); if (v) await teclas(175, Math.round(v / 2)); }
        else return { ok: false, mensaje: 'No entendí qué hacer con el volumen.' };
        return { ok: true };
      }
      case 'multimedia': {
        const k = { pausa: 179, siguiente: 176, anterior: 177 }[norm(a.accion)]; if (!k) return { ok: false, mensaje: 'No entendí.' };
        if (!WIN) { await correr('playerctl', [{ 179: 'play-pause', 176: 'next', 177: 'previous' }[k]]); return { ok: true }; }
        await teclas(k, 1); return { ok: true };
      }
      case 'captura': {
        const dir = path.join(os.homedir(), 'Pictures', 'Jarvis'); const nombre = 'captura-' + new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-') + '.png'; const archivo = path.join(dir, nombre);
        try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { }
        if (!WIN) { const r = await correr('gnome-screenshot', ['-f', archivo]); return r.ok ? { ok: true, decir: 'Listo, guardé la captura en Imágenes, carpeta Jarvis.' } : { ok: false, mensaje: 'No pude sacar la captura.' }; }
        const r = await ps(`Add-Type -AssemblyName System.Windows.Forms,System.Drawing; Add-Type -Name D -Namespace W -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();'; [W.D]::SetProcessDPIAware() | Out-Null; $b=[System.Windows.Forms.SystemInformation]::VirtualScreen; $bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height; $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Left,$b.Top,0,0,$bmp.Size); $bmp.Save('${archivo.replace(/'/g, "''")}',[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()`);
        return r.ok ? { ok: true, decir: 'Listo, guardé la captura en Imágenes, carpeta Jarvis.', archivo } : { ok: false, mensaje: 'No pude sacar la captura.' };
      }
      case 'energia': {
        const acc = norm(a.accion);
        if (!a.confirmado && acc !== 'bloquear') return { ok: false, mensaje: 'Necesito que lo confirmes.' };
        if (!WIN) { const m = { bloquear: ['loginctl', ['lock-session']], suspender: ['systemctl', ['suspend']], reiniciar: ['systemctl', ['reboot']], apagar: ['systemctl', ['poweroff']] }[acc]; if (!m) return { ok: false, mensaje: 'No entendí.' }; await correr(m[0], m[1]); return { ok: true }; }
        if (acc === 'bloquear') { lanzar('rundll32.exe', ['user32.dll,LockWorkStation']); return { ok: true, decir: '' }; }
        if (acc === 'apagar') { await correr('shutdown.exe', ['/s', '/t', '5']); return { ok: true, decir: 'Apagando en cinco segundos. Hasta luego.' }; }
        if (acc === 'reiniciar') { await correr('shutdown.exe', ['/r', '/t', '5']); return { ok: true, decir: 'Reiniciando en cinco segundos.' }; }
        if (acc === 'suspender') { setTimeout(() => ps("Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState('Suspend',$false,$false)"), 2500); return { ok: true, decir: 'Suspendiendo. Buenas noches.' }; }
        return { ok: false, mensaje: 'No entendí qué hacer con la computadora.' };
      }
      default: return { ok: false, mensaje: 'No sé hacer eso todavía.' };
    }
  }

  async function nombresApps() {
    const l = await cargarApps().catch(() => []);
    return Array.from(new Set(Object.keys(APPS).concat(l.map(a => a.n)))).filter(Boolean);
  }
  return { ejecutar, nombresApps, cargarApps };
}

module.exports = { crear, registro, norm, mejorCoincidencia };
