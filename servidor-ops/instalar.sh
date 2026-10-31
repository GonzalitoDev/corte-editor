#!/usr/bin/env bash
# Instala (o actualiza) el servidor online de GonzaOps (shooter táctico 5 contra 5) en un VPS con Ubuntu o Debian.
# Puede convivir con los servidores de GonzaCraft, GonzaSky y GonzaArena en el mismo VPS (usa otra dirección y otro puerto).
#
#   curl -fsSL https://raw.githubusercontent.com/GonzalitoDev/corte-editor/main/servidor-ops/instalar.sh | sudo bash
#
# Opciones (variables de entorno, antes de "bash"):
#   NOMBRE="Servidor de Gonza"      nombre que ven tus amigos
#   CLAVE="secreta"              contraseña para entrar (vacía = abierto)
#   DOMINIO=ops.midominio.com  tu dominio; si no ponés nada usa ops.IP.sslip.io (gratis)
#   PUERTO=7781                  puerto interno del servidor
#   SIN_HTTPS=1                  no instalar Caddy; se entra con IP:PUERTO (solo navegador/app con ws://)
set -euo pipefail

REPO="https://github.com/GonzalitoDev/corte-editor.git"
DIR="/opt/gonzaops"
DATOS="/var/lib/gonzaops"
CONF_DIR="/etc/gonzaops"
PUERTO="${PUERTO:-7781}"

verde() { printf '\033[1;32m%s\033[0m\n' "$*"; }
aviso() { printf '\033[1;33m%s\033[0m\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "Ejecutalo con sudo (como root)."; exit 1; }
command -v apt-get >/dev/null || { echo "Este instalador es para Ubuntu o Debian."; exit 1; }

verde "1/6 · Paquetes básicos"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https >/dev/null

verde "2/6 · Node.js"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "Node $(node -v)"

verde "3/6 · Código del juego"
if [ -d "$DIR/.git" ]; then git -C "$DIR" fetch -q --depth 1 origin main && git -C "$DIR" reset -q --hard origin/main
else rm -rf "$DIR"; git clone -q --depth 1 "$REPO" "$DIR"; fi
cd "$DIR/servidor-ops" && npm install --omit=dev --no-audit --no-fund --silent

verde "4/6 · Configuración y servicio"
id gonzaops >/dev/null 2>&1 || useradd --system --home "$DATOS" --shell /usr/sbin/nologin gonzaops
mkdir -p "$DATOS" "$CONF_DIR"; chown -R gonzaops:gonzaops "$DATOS"
HOST_BIND="127.0.0.1"; [ -n "${SIN_HTTPS:-}" ] && HOST_BIND="0.0.0.0"
if [ ! -f "$CONF_DIR/config.json" ]; then
  NOMBRE="${NOMBRE:-Servidor de GonzaOps}" CLAVE="${CLAVE:-}" PUERTO="$PUERTO" HOST_BIND="$HOST_BIND" node -e '
    const c = require(process.argv[1]); Object.assign(c, { name: process.env.NOMBRE, password: process.env.CLAVE, port: +process.env.PUERTO, host: process.env.HOST_BIND });
    require("fs").writeFileSync(process.argv[2], JSON.stringify(c, null, 2) + "\n");' "$DIR/servidor-ops/config.example.json" "$CONF_DIR/config.json"
fi
chmod 640 "$CONF_DIR/config.json"; chgrp gonzaops "$CONF_DIR/config.json"
cat > /etc/systemd/system/gonzaops.service <<EOF
[Unit]
Description=Servidor online de GonzaOps
After=network-online.target
Wants=network-online.target

[Service]
User=gonzaops
Group=gonzaops
WorkingDirectory=$DIR/servidor-ops
ExecStart=$(command -v node) $DIR/servidor-ops/server.js --config $CONF_DIR/config.json
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATOS
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable -q gonzaops
systemctl restart gonzaops

verde "5/6 · HTTPS"
IP="$(curl -fsS4 --max-time 8 https://api.ipify.org || hostname -I | awk '{print $1}')"
DOMINIO="${DOMINIO:-ops.$(echo "$IP" | tr . -).sslip.io}"
ocupado() { ss -ltnH "( sport = :$1 )" 2>/dev/null | grep -q . ; }
DIRECCION=""
if [ -n "${SIN_HTTPS:-}" ]; then
  DIRECCION="$IP:$PUERTO"
elif command -v caddy >/dev/null || { ! ocupado 80 && ! ocupado 443; }; then
  if ! command -v caddy >/dev/null; then
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq && apt-get install -y -qq caddy >/dev/null
  fi
  mkdir -p /etc/caddy/sitios
  echo "$DOMINIO {
	encode gzip
	reverse_proxy 127.0.0.1:$PUERTO
}" > /etc/caddy/sitios/gonzaops.caddy
  grep -q 'import /etc/caddy/sitios/\*' /etc/caddy/Caddyfile 2>/dev/null || {
    # si el Caddyfile es el de ejemplo, lo reemplazamos; si ya tenías sitios, solo agregamos la línea
    if grep -q 'root \* /usr/share/caddy' /etc/caddy/Caddyfile 2>/dev/null; then echo 'import /etc/caddy/sitios/*' > /etc/caddy/Caddyfile
    else echo 'import /etc/caddy/sitios/*' >> /etc/caddy/Caddyfile; fi; }
  systemctl enable -q caddy; systemctl reload caddy 2>/dev/null || systemctl restart caddy
  DIRECCION="$DOMINIO"
else
  aviso "Los puertos 80/443 ya los usa otro programa (¿nginx?). Agregá esto a tu nginx para $DOMINIO:"
  echo "  location / { proxy_pass http://127.0.0.1:$PUERTO; proxy_http_version 1.1; proxy_set_header Upgrade \$http_upgrade; proxy_set_header Connection upgrade; proxy_set_header Host \$host; }"
  DIRECCION="$DOMINIO"
fi

verde "6/6 · Firewall"
if command -v ufw >/dev/null && ufw status | grep -q active; then
  if [ -n "${SIN_HTTPS:-}" ]; then ufw allow "$PUERTO"/tcp >/dev/null; else ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; fi
fi

sleep 2
echo
if systemctl is-active -q gonzaops; then verde "¡Listo! El servidor de GonzaOps está prendido."; else aviso "El servicio no arrancó. Mirá: journalctl -u gonzaops -n 50"; fi
echo
echo "  Dirección para tus amigos:  $DIRECCION"
[ -z "${SIN_HTTPS:-}" ] && echo "  Jugar en el navegador:      https://$DIRECCION"
echo "  En el juego: Jugar online → pegá la dirección → Crear sala y pasales el código"
echo
echo "  Ver qué pasa:     journalctl -u gonzaops -f"
echo "  Reiniciar:        systemctl restart gonzaops"
echo "  Configuración:    $CONF_DIR/config.json  (después: systemctl restart gonzaops)"
echo "  Actualizar:       volvé a correr este mismo comando"
echo
PUERTOS="80 y 443"; [ -n "${SIN_HTTPS:-}" ] && PUERTOS="$PUERTO"
aviso "Si tu proveedor (por ejemplo Clouding.io) tiene un firewall en su panel, abrí ahí los puertos $PUERTOS (TCP)."
