# Servidor de GonzaArena (online 5 contra 5)

Un servidor propio para jugar GonzaArena con tus amigos: salas con código, elección de equipo y campeón, y bots que completan los lugares vacíos.

- Corre la misma simulación que el juego (`../arena/jugar/js/sim-*.js`) a 30 pasos por segundo. Cada jugador recibe solo lo que ve su equipo (la niebla de guerra se respeta en el servidor).
- Si alguien se desconecta, un bot sigue jugando con su campeón; si vuelve a entrar con el mismo nombre y el código de la sala, lo recupera.
- Sirve el juego web: abriendo la dirección en el navegador ya se puede jugar.
- Contraseña opcional y límite de salas.

## Instalar en un VPS (Ubuntu o Debian)

```bash
curl -fsSL https://raw.githubusercontent.com/GonzalitoDev/corte-editor/main/servidor-arena/instalar.sh | sudo NOMBRE="Arena de Gonza" bash
```

Pone Node.js, crea el servicio `gonzaarena` y configura HTTPS gratis con Caddy en una dirección del tipo `arena.1-2-3-4.sslip.io`. Si ya tenés los servidores de GonzaCraft o GonzaSky, reutiliza el mismo Caddy. Opciones (antes de `bash`): `NOMBRE`, `CLAVE`, `DOMINIO`, `PUERTO` (7779), `SIN_HTTPS=1`.

En el panel de tu proveedor abrí los puertos **80 y 443 TCP**.

## Jugar

1. En el juego: **Jugar online → pegá la dirección → Crear sala**.
2. Pasale el código de 5 letras a tus amigos: **Entrar con código** (o tocan la sala en la lista).
3. Cada uno elige equipo y campeón. El anfitrión (👑) elige la dificultad de los bots y toca **Empezar**.

## Administrar

| Qué | Comando |
|---|---|
| Ver lo que pasa | `journalctl -u gonzaarena -f` |
| Reiniciar | `sudo systemctl restart gonzaarena` |
| Cambiar nombre, contraseña o límite de salas | editá `/etc/gonzaarena/config.json` y reiniciá |
| Actualizar | volvé a correr el comando de instalación |

Consumo aproximado: una partida usa poco procesador (unos 3 ms por paso) y cerca de 50 KB/s por jugador.

## Probarlo en tu compu

```bash
cd servidor-arena && npm install && node server.js
```

Después abrí `http://localhost:7779`.
