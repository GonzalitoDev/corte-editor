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

## Seguridad

El actualizador instala paquetes con permisos de administrador, así que verifica
que cada actualización sea **auténtica** antes de tocar nada:

1. **Firma digital (Ed25519).** El `latest.json` se firma en el servidor con una
   clave privada secreta, y la app lo verifica con la **clave pública** que lleva
   adentro (`clave-publica.pem`). Si la firma falta o no coincide, **no instala** —
   aunque alguien hubiera alterado el release o la conexión.
2. **Huella sha256.** El `.deb`/AppImage descargado se compara con el `sha256` que
   viene dentro del `latest.json` ya verificado.
3. **Origen cerrado.** Solo descarga por **HTTPS** y solo desde `github.com` /
   `githubusercontent.com` (también en las redirecciones). El nombre del archivo
   se valida para que no pueda escaparse a otra carpeta.

### Clave de firma (una sola vez)

Para que las actualizaciones queden firmadas hay que cargar la **clave privada**
como secreto del repo (igual que la firma de Android):

1. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**.
2. Nombre: `UPDATE_SIGNING_KEY`. Valor: el contenido del archivo `update-signing-key.pem`
   (incluidas las líneas `-----BEGIN/END PRIVATE KEY-----`).
3. Guardá ese archivo en un lugar seguro y **no lo subas al repositorio**.

Sin ese secreto, el workflow publica el `latest.json` **sin firmar** y el
actualizador lo rechaza por seguridad (no instala nada).
