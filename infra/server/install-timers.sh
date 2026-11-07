#!/usr/bin/env bash
# SexyRose — instala los timers de systemd (copia diaria y monitoreo cada 5 min).
#
#   sudo bash ~/SexyRose/infra/server/install-timers.sh
#
# Idempotente. Los servicios corren con tu usuario (el que llama a sudo), no como root.
set -euo pipefail

[[ "$(id -u)" -eq 0 ]] || { echo "ERROR: correr con sudo" >&2; exit 1; }
TARGET_USER="${SUDO_USER:-}"
[[ -n "$TARGET_USER" && "$TARGET_USER" != "root" ]] || { echo "ERROR: correr desde tu usuario con sudo" >&2; exit 1; }

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$REPO_DIR/infra/systemd"
[[ -d "$SRC" ]] || { echo "ERROR: no encuentro $SRC" >&2; exit 1; }
[[ "$REPO_DIR" != *[[:space:]]* ]] || { echo "ERROR: la ruta del repo no puede tener espacios: $REPO_DIR" >&2; exit 1; }

for unit in sexyrose-backup.service sexyrose-backup.timer sexyrose-monitor.service sexyrose-monitor.timer; do
  sed -e "s|@USER@|$TARGET_USER|g" -e "s|@REPO_DIR@|$REPO_DIR|g" "$SRC/$unit" > "/etc/systemd/system/$unit"
  chmod 0644 "/etc/systemd/system/$unit"
done

systemctl daemon-reload
systemctl enable --now sexyrose-backup.timer sexyrose-monitor.timer
echo
systemctl list-timers 'sexyrose-*' --no-pager
echo
echo "Probar a mano:  sudo systemctl start sexyrose-backup.service && journalctl -u sexyrose-backup.service -n 20 --no-pager"
