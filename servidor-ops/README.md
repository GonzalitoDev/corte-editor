# Servidor de GonzaOps (online 5 contra 5)

Un servidor propio para jugar GonzaOps con tus amigos: salas con código, elección de escuadra y bots que completan los lugares vacíos.

- Corre la misma simulación que el juego (`../gonzaops/jugar/js/sim-*.js`) a 30 pasos por segundo y le manda el estado a cada jugador 20 veces por segundo.
- El daño se calcula en el servidor, con los rivales «rebobinados» al momento en que el jugador vio el disparo. También controla que nadie se mueva más rápido de lo permitido ni atraviese paredes.
- Si alguien se desconecta, un bot sigue jugando por él; si vuelve con el mismo nombre y el código de la sala, recupera su lugar.
- Sirve el juego web: abriendo la dirección en el navegador ya se puede jugar.
- Contraseña opcional y límite de salas.

## Instalar en un VPS (Ubuntu o Debian)

```bash
curl -fsSL https://raw.githubusercontent.com/GonzalitoDev/corte-editor/main/servidor-ops/instalar.sh | sudo bash
```

Opciones (antes de `bash`): `NOMBRE="Mi servidor"`, `CLAVE="secreta"`, `DOMINIO=ops.midominio.com`, `PUERTO=7781`, `SIN_HTTPS=1`.

Al terminar te muestra la dirección (por ejemplo `ops.1-2-3-4.sslip.io`). En el juego: **Jugar online** → pegá la dirección → **Crear sala**.

## Probar en tu PC

```bash
npm install
node server.js        # http://localhost:7781
```

Configuración: `config.json` (copiá `config.example.json`): nombre, puerto, contraseña, salas máximas y frecuencia de envío.
