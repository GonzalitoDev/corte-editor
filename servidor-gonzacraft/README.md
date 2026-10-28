# Servidor de GonzaCraft (24/7)

Un servidor propio para que tus amigos entren a GonzaCraft cuando quieran, aunque vos no estés jugando.

- Guarda el mundo, la hora y lo de cada jugador (posición, vida, inventario y modo).
- Reenvía posiciones, chat, bloques, explosiones y criaturas. Las criaturas las simula uno de los jugadores conectados; si se va, pasa a otro.
- Sirve el juego web: con solo abrir la dirección en el navegador ya se puede jugar.
- Contraseña opcional, límite de jugadores y trucos activables.

## Instalar en un VPS (Ubuntu o Debian)

Entrá por SSH a tu VPS y corré:

```bash
curl -fsSL https://raw.githubusercontent.com/GonzalitoDev/corte-editor/main/servidor-gonzacraft/instalar.sh | sudo NOMBRE="Servidor de Gonza" bash
```

El instalador pone Node.js, crea el servicio `gonzacraft` (arranca solo si se reinicia el VPS) y configura HTTPS gratis con Caddy usando una dirección del tipo `1-2-3-4.sslip.io`. Al final te muestra la dirección para tus amigos.

Opciones (se ponen antes de `bash`): `NOMBRE`, `CLAVE` (contraseña), `MODO=creative`, `DOMINIO=juego.tudominio.com`, `PUERTO`, `SIN_HTTPS=1`.

En el panel de tu proveedor (por ejemplo Clouding.io), abrí los puertos **80 y 443 TCP**.

## Usarlo

- En el juego: **Multijugador → pegá la dirección → Agregar → Entrar**.
- En el navegador: abrí `https://tu-direccion` y tocá **Entrar a …**.

## Administrar

| Qué | Comando |
|---|---|
| Ver lo que pasa | `journalctl -u gonzacraft -f` |
| Reiniciar | `sudo systemctl restart gonzacraft` |
| Cambiar nombre, contraseña, modo o trucos | editá `/etc/gonzacraft/config.json` y reiniciá |
| Copia del mundo | `/var/lib/gonzacraft/mundo.json` y `jugadores.json` |
| Actualizar | volvé a correr el comando de instalación |
| Mundo nuevo | `sudo systemctl stop gonzacraft && sudo rm /var/lib/gonzacraft/*.json && sudo systemctl start gonzacraft` |

## Probarlo en tu compu

```bash
cd servidor-gonzacraft && npm install && node server.js
```

Después abrí `http://localhost:7777`.
