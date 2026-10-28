# Servidor de GonzaSky (dogfight online 24/7)

Un servidor propio para pelear en el aire con tus amigos en GonzaSky, prendido siempre aunque vos no estés jugando.

- Reenvía la posición de cada avión, los disparos, los misiles, los impactos y los derribos.
- Lleva la tabla de derribos y guarda el historial de cada piloto (por nombre) en `ranking.json`.
- Sirve el juego web: con abrir la dirección en el navegador ya se puede jugar.
- Contraseña opcional, límite de pilotos y aeropuerto/hora/clima de la arena configurables.
- Puede vivir en el mismo VPS que el servidor de GonzaCraft: usa otro puerto (7778) y otra dirección (`sky.…`).

## Instalar en un VPS (Ubuntu o Debian)

Entrá por SSH a tu VPS y corré:

```bash
curl -fsSL https://raw.githubusercontent.com/GonzalitoDev/corte-editor/main/servidor-gonzasky/instalar.sh | sudo NOMBRE="Dogfight de Gonza" bash
```

El instalador pone Node.js, crea el servicio `gonzasky` (arranca solo si se reinicia el VPS) y configura HTTPS gratis con Caddy usando una dirección del tipo `sky.1-2-3-4.sslip.io`. Si ya instalaste el servidor de GonzaCraft, reutiliza el mismo Caddy. Al final te muestra la dirección para tus amigos.

Opciones (se ponen antes de `bash`): `NOMBRE`, `CLAVE` (contraseña), `AEROPUERTO` (GZA, VLL, CMB, CDR, PAZ, ALM, SRA o SUR), `DOMINIO=sky.tudominio.com`, `PUERTO`, `SIN_HTTPS=1`.

En el panel de tu proveedor (por ejemplo Clouding.io), abrí los puertos **80 y 443 TCP**.

## Usarlo

- En el juego (PC, celular o navegador): **Dogfight online → pegá la dirección → Entrar**.
- En el navegador: abrí `https://tu-direccion`, tocá **Dogfight online** y la dirección ya aparece puesta.
- Controles: `Espacio`/`Ctrl` ametralladoras · `V` misil guiado · `X` bomba · `Tab` tabla · `Enter` chat. En el celular: botón **FUEGO**, 🏆 y 💬.

## Administrar

| Qué | Comando |
|---|---|
| Ver lo que pasa | `journalctl -u gonzasky -f` |
| Reiniciar | `sudo systemctl restart gonzasky` |
| Cambiar nombre, contraseña, aeropuerto, hora o clima | editá `/etc/gonzasky/config.json` y reiniciá |
| Ranking histórico | `/var/lib/gonzasky/ranking.json` |
| Actualizar | volvé a correr el comando de instalación |

## Cómo funciona

Cada jugador simula su propio avión y manda su estado unas 15 veces por segundo; los demás lo ven interpolado (con 120 ms de retraso para que se mueva suave). El que dispara decide si le pegó a alguien y el servidor le avisa al otro, que se resta la vida. Es simple y se siente justo para el que apunta, pero confía en los jugadores: está pensado para jugar entre amigos.

## Probarlo en tu compu

```bash
cd servidor-gonzasky && npm install && node server.js
```

Después abrí `http://localhost:7778`.
