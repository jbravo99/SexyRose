#!/usr/bin/env bash
# SexyRose — instala en la PC de casa (Linux con systemd) el script y el timer que traen las copias.
#
#   sudo bash instalar-en-casa.sh
#
# Copia traer-copias.sh a /usr/local/bin/sexyrose-traer-copias e instala sexyrose-traer-copias.timer
# (todos los días 05:15 UTC). Corre con tu usuario, no como root. Idempotente.
set -euo pipefail

[[ "$(id -u)" -eq 0 ]] || { echo "ERROR: correr con sudo" >&2; exit 1; }
TARGET_USER="${SUDO_USER:-}"
[[ -n "$TARGET_USER" && "$TARGET_USER" != "root" ]] || { echo "ERROR: correr desde tu usuario con sudo" >&2; exit 1; }
TARGET_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF="$TARGET_HOME/.config/sexyrose-copias/config"

missing=()
for c in rsync ssh age curl flock sha256sum; do command -v "$c" >/dev/null || missing+=("$c"); done
if [[ ${#missing[@]} -gt 0 ]]; then
  if command -v apt-get >/dev/null; then
    echo "Instalando: rsync openssh-client age curl util-linux"
    DEBIAN_FRONTEND=noninteractive apt-get install -y -q rsync openssh-client age curl util-linux >/dev/null
  else
    echo "ERROR: faltan ${missing[*]}. Instalalos con el gestor de paquetes de tu distribución." >&2; exit 1
  fi
fi

install -m 0755 "$HERE/traer-copias.sh" /usr/local/bin/sexyrose-traer-copias
sed -e "s|@USER@|$TARGET_USER|g" -e "s|@CONF@|$CONF|g" "$HERE/sexyrose-traer-copias.service" > /etc/systemd/system/sexyrose-traer-copias.service
install -m 0644 "$HERE/sexyrose-traer-copias.timer" /etc/systemd/system/sexyrose-traer-copias.timer
chmod 0644 /etc/systemd/system/sexyrose-traer-copias.service

install -d -m 0700 -o "$TARGET_USER" -g "$(id -gn "$TARGET_USER")" "$TARGET_HOME/.config/sexyrose-copias"
if [[ ! -f "$CONF" ]]; then
  sed "s|/home/USUARIO|$TARGET_HOME|g" "$HERE/config.example" > "$CONF"
  chown "$TARGET_USER": "$CONF"; chmod 0600 "$CONF"
  echo "Creé $CONF a partir de config.example: revisalo (VPS, LLAVE, DESTINO)."
fi

systemctl daemon-reload
systemctl enable --now sexyrose-traer-copias.timer
echo
systemctl list-timers sexyrose-traer-copias.timer --no-pager || true
echo
echo "Probar ya:  sudo systemctl start sexyrose-traer-copias.service && journalctl -u sexyrose-traer-copias.service -n 30 --no-pager"
