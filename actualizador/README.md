# Actualizador GonzaDev

App de escritorio para Linux (pensada para **Linux Mint**) que mantiene al día los
juegos de GonzaDev: busca la última versión publicada y la instala por vos.

## Qué hace

- Lista tus juegos (GonzaCraft, GonzaSky) con la **versión instalada** y la **última**.
- Si hay una versión nueva, descarga el `.deb` con una barra de progreso, verifica el
  `sha256` y lo instala (te pide la contraseña con el diálogo del sistema, vía `pkexec`).
- En distros sin `dpkg` ofrece la versión **AppImage**.
- Botón **Jugar** para abrir el juego.

## Cómo sabe la versión

Cada juego publica, en su release de GitHub, un `latest.json` con la versión, la fecha,
las novedades y el `sha256` de cada archivo (lo arma el workflow al compilar). El
actualizador lee ese archivo y lo compara con lo instalado (`dpkg-query`).

## Desarrollo

```bash
cd actualizador
npm install
npm start          # abre la app
npm run dist:linux # arma el .deb y el AppImage en dist/
```

Los instaladores se publican solos (GitHub Actions) en el release **actualizador**:

- Linux Mint / Ubuntu: `Actualizador-GonzaDev.deb`
- Otras distros: `Actualizador-GonzaDev.AppImage`
