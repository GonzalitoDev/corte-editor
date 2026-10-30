# Taller

Suite de apps creativas que funcionan en el navegador. Gratis, sin marca de agua, sin cuenta y sin subir tus archivos a ningún servidor: todo se procesa en tu computadora.

| App | Para qué sirve | Carpeta |
|---|---|---|
| **Corte** | Editor de video multipista | [`corte/`](corte/) |
| **Lienzo** | Editor de fotos con capas | [`lienzo/`](lienzo/) |
| **Trazo** | Editor vectorial | [`trazo/`](trazo/) |
| **Folio** | Herramientas PDF | [`folio/`](folio/) |
| **Onda** | Editor de audio multipista | [`onda/`](onda/) |
| **GonzaCraft** | Juego de bloques (Windows, Linux Mint, Android y navegador) | [`gonzacraft/`](gonzacraft/) |
| **GonzaSky** | Simulador de vuelo (Windows, Linux Mint, Android y navegador) | [`gonzasky/`](gonzasky/) |
| **GonzaArena** | MOBA 5 contra 5 en el navegador (bots y online) | [`arena/`](arena/) |
| **Asistente** | Chat con IA (OpenRouter) para tus sitios, alojado en Vercel | [`asistente/`](asistente/) |
| **Jarvis** | Asistente personal por voz: web (`jarvis/`) y programa de Windows que maneja la PC | [`desktop-jarvis/`](desktop-jarvis/) |

La página de inicio (`index.html`) muestra todas las apps.

## Corte · video
Multipista ilimitada, transiciones, animaciones, fotogramas clave, filtros, efectos, stickers, pantalla verde, quitar fondo con IA, subtítulos automáticos con Whisper, grabar voz/pantalla/cámara, música y efectos de sonido libres, exportación MP4/WebM hasta 1440p a 60 fps.

## Lienzo · fotos
- Capas con opacidad, 16 modos de fusión, bloqueo, reordenar arrastrando, combinar y acoplar
- Pincel con dureza y presión, borrador, tampón de clonar, bote de pintura, degradado, formas, texto editable
- Selección rectangular, elíptica, lazo y varita mágica (sumar, restar, invertir)
- Transformar libremente (escalar y rotar), recortar con proporciones, rotar y voltear
- Ajustes: brillo y contraste, tono y saturación, temperatura, niveles, intensidad, posterizar, umbral, mejora automática
- Filtros: desenfocar, enfocar, ruido, pixelar, viñeta, relieve, bordes y 12 filtros rápidos
- **Quitar fondo y seleccionar sujeto con IA**
- Exporta PNG, JPG y WebP; guarda proyectos `.lienzo`

## Trazo · vectores
- Pluma Bézier, lápiz, rectángulo, elipse, polígono, estrella, línea y texto
- Edición de nodos, curvas y esquinas
- Unir, restar, intersección, excluir y dividir formas
- Alinear, distribuir, agrupar, ordenar, voltear e imán con guías
- Rellenos sólidos y degradados, bordes con guiones, sombras y modos de fusión
- Importa SVG e imágenes; exporta SVG, PNG, JPG y PDF vectorial

## Folio · PDF
- Unir PDF e imágenes, reordenar arrastrando, rotar, duplicar, eliminar e insertar páginas en blanco
- Firmar (dibujada, escrita o desde una imagen), agregar texto, imágenes, rectángulos, resaltar y tapar
- Marca de agua, numeración de páginas y metadatos
- Comprimir, PDF a imágenes, dividir y extraer páginas, imágenes a PDF

## Onda · audio
- Multipista con volumen, paneo, silenciar y solo; clips que se mueven entre pistas, se recortan desde los bordes y tienen ganancia y fundidos
- Cortar, copiar, pegar, borrar y juntar, silenciar, recortar a la selección, dividir y duplicar
- Efectos: amplificar, normalizar, fundidos, ecualizador con preajustes, compresor, **reducción de ruido**, puerta de ruido, quitar silencios, eco, reverberación, distorsión, velocidad, al revés, invertir fase y mono
- Vista previa de cada efecto antes de aplicarlo
- Grabar con el micrófono mientras suenan las otras pistas
- Generar tonos, ruido blanco/rosa/marrón, silencio y metrónomo
- Importa cualquier audio y el sonido de videos; exporta MP3 (hasta 320 kbps) y WAV

## GonzaCraft · juego
Juego de bloques original con mundo infinito (llanuras, bosques, desiertos, tundra, montañas, océanos, cuevas y minerales), 38 bloques con texturas dibujadas por código, supervivencia con vida y fabricación, modo creativo con vuelo, día y noche, lámparas que iluminan, guardado automático y multijugador con código (PeerJS).

- Página de descarga: [`gonzacraft/`](gonzacraft/) · jugar en el navegador: [`gonzacraft/jugar/`](gonzacraft/jugar/)
- App de escritorio: [`desktop-gonzacraft/`](desktop-gonzacraft/) (`npm run dist:win` o `npm run dist:linux`)
- Servidor dedicado 24/7: [`servidor-gonzacraft/`](servidor-gonzacraft/) (Node + WebSocket). Se instala en un VPS con `curl -fsSL https://raw.githubusercontent.com/GonzalitoDev/corte-editor/main/servidor-gonzacraft/instalar.sh | sudo bash`.
- App de Android: [`android-gonzacraft/`](android-gonzacraft/), un WebView a pantalla completa con controles táctiles. Se arma sin Gradle con `./android-gonzacraft/build.sh` (necesita `aapt dalvik-exchange zipalign apksigner libandroid-23-java`). El workflow lo firma con los secretos `ANDROID_KEYSTORE` (keystore en base64) y `ANDROID_KEYSTORE_PASSWORD`.
- Cada cambio en el juego dispara el workflow `gonzacraft.yml`, que arma `GonzaCraft-Setup.exe`, `GonzaCraft.deb`, `GonzaCraft.AppImage` y `GonzaCraft.apk` y los publica en el release `gonzacraft`.

## GonzaSky · simulador de vuelo
Simulador original con terreno infinito con niveles de detalle, ocho aeropuertos (pistas con marcas y luces, torres, hangares, ciudades), física de vuelo (sustentación, resistencia, pérdida, flaps, tren, frenos, viento), tres aviones (Gaucho 172, Pampa 320 y Cóndor F-1), día y noche, nubes y niebla, HUD, radar, mapa con GPS, piloto automático, seis desafíos con récords y controles por teclado, mouse, joystick, pantalla táctil o inclinando el celular. Incluye el Stuka Ju 87 (2ª Guerra) con ala de gaviota, texturas de camuflaje generadas en canvas, sirena, frenos de picada, 5 bombas y 6 misiles guiados, tanques de práctica destructibles y los desafíos «Bombardeo en picada» y «Cacería de tanques».

- Página de descarga: [`gonzasky/`](gonzasky/) · volar en el navegador: [`gonzasky/volar/`](gonzasky/volar/)
- Escritorio: [`desktop-gonzasky/`](desktop-gonzasky/) · Android: [`android-gonzasky/`](android-gonzasky/)
- El workflow `gonzasky.yml` publica `GonzaSky-Setup.exe`, `GonzaSky.deb`, `GonzaSky.AppImage` y `GonzaSky.apk` en el release `gonzasky` (el APK usa los mismos secretos de firma que GonzaCraft).
- **Dogfight online:** `servidor-gonzasky/` es un servidor Node (ws) que reenvía aviones, disparos, misiles y derribos y lleva la tabla. Se instala en un VPS con `curl -fsSL https://raw.githubusercontent.com/GonzalitoDev/corte-editor/main/servidor-gonzasky/instalar.sh | sudo bash` y queda en `sky.IP.sslip.io` (convive con el de GonzaCraft).

## App de escritorio para Windows

La carpeta [`desktop/`](desktop/) empaqueta la suite con Electron. Para armar los instaladores:

```bash
cd desktop
npm install
npm run dist   # crea Taller-Setup-x.y.z.exe y Taller-x.y.z-x64.msi en desktop/dist
```

Cada tag `v*` que subas a GitHub arma los dos instaladores en Windows y los publica en Releases automáticamente.

## Uso

Es un sitio estático. Publicalo en Vercel (ya incluye `vercel.json`), Netlify o GitHub Pages, o servilo localmente con `npx serve`. Las librerías y los modelos de IA se cargan desde CDN la primera vez y después quedan en caché.

Librerías de código abierto usadas: paper.js, pdf-lib, pdf.js, JSZip, jsPDF, svg2pdf.js, Transformers.js (Whisper), MediaPipe, @imgly/background-removal, lamejs, three.js y PeerJS.

## GonzaArena · MOBA 5 contra 5

Juego original en el navegador (three.js), con campeones, mapa y nombres propios.

- `arena/jugar/js/sim-*.js`: la simulación (mapa con 3 carriles y A*, combate, minions, torres, jungla, Dragón y Coloso, oro, niveles, tienda, niebla de guerra y bots). Corre igual en el navegador (partidas contra bots) y en Node (servidor online).
- `arena/jugar/js/models.js` y `client.js`: modelos low-poly, efectos, cámara, controles de PC (clic derecho, QWER con indicador) y de celular, interfaz, tienda, minimapa y salas online.
- Cinco campeones: Brasa (maga), Pedrón (tanque), Sombra (asesina), Flecha (tiradora) y Ceibo (soporte).
- **Online:** `servidor-arena/` corre la simulación a 30 pasos por segundo con salas por código; cada jugador recibe solo lo que ve su equipo. Se instala en un VPS con `curl -fsSL https://raw.githubusercontent.com/GonzalitoDev/corte-editor/main/servidor-arena/instalar.sh | sudo bash` y queda en `arena.IP.sslip.io` (convive con los de GonzaCraft y GonzaSky).

