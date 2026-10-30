# Jarvis for Windows

Jarvis is a voice assistant. It lives in the system tray, controls your PC and answers with its own voice. Its AI runs on your assistant hosted on Vercel (`asistente/`).

- **Talk to it:** press **Ctrl+Alt+J** from anywhere, or click the microphone. With hands-free mode on, just say "Jarvis, …".
- **Controls your PC:**
  - Opens programs, including any app in the Start menu.
  - Opens your folders.
  - Sets the volume and pauses or skips music.
  - Closes programs.
  - Takes screenshots.
  - Locks, suspends, restarts or shuts down the PC. These ask for confirmation first.
- **Runs in an Edge window.** Edge recognizes spoken Spanish and has natural voices, including Tomás from Argentina.

## How it works

`main.js` (Electron) creates the tray icon and the hotkey. It also starts `agente.js`, a server that only listens on `127.0.0.1:47800`. That server does three things:

- Serves the interface, which is a copy of `asistente/jarvis`.
- Forwards questions to `https://YOUR-ASSISTANT.vercel.app/api/chat`. Set that address in Ajustes and the program saves it.
- Runs the PC actions in `acciones.js`. It only accepts requests from its own page.

## Build the installer

```bash
npm install
npm run dist:win   # → dist/Jarvis-Setup.exe
```

To test without Electron: `npm run probar` (opens http://127.0.0.1:47800). Set `JARVIS_DRY=1` to log the actions instead of running them.
