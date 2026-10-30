# Asistente de Gonzadev

This is an AI chat that runs on **OpenRouter** and is hosted on **Vercel**. It answers visitor questions about ZonaHack, the Taller and the portfolio.

- `api/chat.js` is the server function:
  - It keeps the OpenRouter key and streams the answers back as they're written.
  - It switches to another free model if one fails.
  - It limits how many messages each visitor can send.
- `api/salud.js` reports the status and each site's greeting.
- `lib/conocimiento.js` holds **what the assistant knows** about each site. Edit it to teach it new things.
- `widget.js` is the chat bubble you paste into your sites.
- `index.html` is a demo page with the code to copy for each site.

## Paste it into a site

```html
<script src="https://YOUR-PROJECT.vercel.app/widget.js" data-sitio="zonahack" defer></script>
```

`data-sitio` can be `zonahack`, `taller`, `portfolio` or `general`. Optional attributes: `data-color`, `data-posicion="izquierda"`, `data-titulo` and `data-saludo`.

## Environment variables (Vercel → Settings → Environment Variables)

| Variable | What it does |
|---|---|
| `OPENROUTER_API_KEY` | **Required.** Your key from openrouter.ai/keys. |
| `ASISTENTE_ORIGENES` | Domains allowed to use it, separated by commas. Empty means anyone can. |
| `ASISTENTE_MODELOS` | OpenRouter models to use, separated by commas. Defaults to free Gemma 4 models and backups. |
| `ASISTENTE_LIMITE` | Messages allowed per visitor every 10 minutes. Default: 20. |

After changing a variable, go to Deployments → Redeploy.

## Jarvis (`/jarvis/`)

Jarvis is a voice assistant that runs on this same server: open `https://YOUR-PROJECT.vercel.app/jarvis/` in Chrome or Edge, either on a PC or on Android. You can install it like an app.

- **Talk to it:** tap the microphone or press Space. With hands-free mode on, say "Jarvis, …".
- **It answers out loud** and handles these on its own, without asking the AI:
  - time and date
  - weather
  - timers and reminders
  - notes
  - opening sites and searches
- **Everything else** it asks the AI, through the `jarvis` site in `lib/conocimiento.js`.
- **To control the PC** (programs, volume, music, shutting down), use **Jarvis for Windows** (`desktop-jarvis/`).
