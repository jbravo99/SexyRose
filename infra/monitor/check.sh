#!/usr/bin/env bash
# SexyRose — chequeo de salud cada 5 minutos (timer systemd sexyrose-monitor.timer).
#
#   bash ~/SexyRose/infra/monitor/check.sh
#
# Revisa: app healthy, db y cloudflared corriendo, disco > 80 %, copia (base + archivos) con menos de 26 h.
# Avisa por Telegram solo si TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID están en .env.
# Sin spam: avisa al fallar, recuerda cada 6 h si sigue fallando y avisa cuando se resuelve.
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
COMPOSE_FILE="$REPO_DIR/infra/docker-compose.yml"
ENV_FILE="$REPO_DIR/.env"
STATE_DIR="${STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/sexyrose-monitor}"
# Donde deja las copias infra/backup/backup.sh (si no existe /srv/sexyrose-copias, la vieja ~/backups).
if [[ -z "${BACKUP_DIR:-}" ]]; then
  if [[ -d /srv/sexyrose-copias ]]; then BACKUP_DIR=/srv/sexyrose-copias; else BACKUP_DIR="$HOME/backups"; fi
fi
DISK_THRESHOLD="${DISK_THRESHOLD:-80}"      # %
BACKUP_MAX_AGE_H="${BACKUP_MAX_AGE_H:-26}"  # horas
REMIND_EVERY="${REMIND_EVERY:-21600}"       # segundos (6 h)

env_get() { grep -m1 "^$1=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true; }
TG_TOKEN="$(env_get TELEGRAM_BOT_TOKEN)"
TG_CHAT="$(env_get TELEGRAM_CHAT_ID)"
HOST="$(hostname -s 2>/dev/null || hostname)"
NOW="$(date +%s)"
mkdir -p "$STATE_DIR"

# Devuelve 0 si se entregó (o si Telegram no está configurado y solo se registró en el log).
notify() {
  local text="[SexyRose $HOST] $1"
  echo "$text"
  if [[ -z "$TG_TOKEN" || -z "$TG_CHAT" ]]; then
    return 0
  fi
  # La URL (con el token) va por stdin (-K -) para que no aparezca en la lista de procesos.
  printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$TG_TOKEN" \
    | curl -fsS --max-time 15 -K - \
        --data-urlencode "chat_id=$TG_CHAT" \
        --data-urlencode "text=$text" \
        -o /dev/null \
    || { echo "AVISO: no pude enviar a Telegram" >&2; return 1; }
}

# report <clave> <ok|fail> <mensaje>
report() {
  local key="$1" result="$2" msg="$3" file="$STATE_DIR/$1.fail" last=0
  if [[ "$result" == "fail" ]]; then
    if [[ -f "$file" ]]; then
      last="$(cat "$file" 2>/dev/null || echo 0)"
      [[ "$last" =~ ^[0-9]+$ ]] || last=0
      if (( NOW - last >= REMIND_EVERY )); then
        notify "SIGUE FALLANDO: $msg" && echo "$NOW" > "$file"
      fi
    else
      notify "FALLA: $msg" && echo "$NOW" > "$file"
    fi
  else
    if [[ -f "$file" ]]; then
      notify "RESUELTO: $msg" && rm -f "$file"
    fi
  fi
  return 0
}

container_of() { docker compose -f "$COMPOSE_FILE" ps -q "$1" 2>/dev/null || true; }

# --- Docker en sí ---
if ! docker info >/dev/null 2>&1; then
  report docker fail "no puedo hablar con Docker (¿daemon caído?)"
  exit 0
fi
report docker ok "Docker responde de nuevo"

# --- app: healthcheck ---
cid="$(container_of app)"
if [[ -z "$cid" ]]; then
  report app fail "el contenedor app no está corriendo"
else
  st="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo desconocido)"
  case "$st" in
    healthy)  report app ok "app healthy" ;;
    starting) : ;;  # recién arrancado: no cambiar el estado
    *)        report app fail "app en estado '$st' (docker compose -f infra/docker-compose.yml logs app)" ;;
  esac
fi

# --- db y cloudflared: corriendo ---
for svc in db cloudflared; do
  cid="$(container_of "$svc")"
  st="no existe"
  [[ -n "$cid" ]] && st="$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null || echo desconocido)"
  if [[ "$st" == "running" ]]; then
    report "$svc" ok "$svc corriendo"
  else
    report "$svc" fail "$svc no está corriendo (estado: $st)"
  fi
done

# --- Disco (raíz y directorio de Docker) ---
check_disk() {
  local path="$1" key="$2" pct
  pct="$(df -P "$path" 2>/dev/null | awk 'NR==2 {gsub("%","",$5); print $5}')"
  [[ "$pct" =~ ^[0-9]+$ ]] || return 0
  if (( pct > DISK_THRESHOLD )); then
    report "$key" fail "disco $path al ${pct}% (umbral ${DISK_THRESHOLD}%). Probar: docker system prune"
  else
    report "$key" ok "disco $path al ${pct}%"
  fi
}
check_disk / disk_root
DOCKER_ROOT="$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || true)"
if [[ -n "$DOCKER_ROOT" && -d "$DOCKER_ROOT" ]] && [[ "$(df -P "$DOCKER_ROOT" | awk 'NR==2{print $1}')" != "$(df -P / | awk 'NR==2{print $1}')" ]]; then
  check_disk "$DOCKER_ROOT" disk_docker
fi

# --- Copia de la base reciente ---
# Un juego completo = su .sha256 (backup.sh lo escribe al final). También acepta el formato viejo.
newest="$(find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'sexyrose-*Z.sha256' -o -name 'sexyrose-db-*.sql.gz' -o -name 'sexyrose-db-*.sql.gz.age' \) -printf '%T@\n' 2>/dev/null | sort -rn | head -1 || true)"
if [[ -z "$newest" ]]; then
  report backup fail "no hay ninguna copia completa en $BACKUP_DIR (correr infra/backup/backup.sh)"
else
  age_h=$(( (NOW - ${newest%.*}) / 3600 ))
  if (( age_h >= BACKUP_MAX_AGE_H )); then
    report backup fail "la última copia de la base tiene ${age_h} h (journalctl -u sexyrose-backup.service)"
  else
    report backup ok "copia de la base al día (${age_h} h)"
  fi
fi

exit 0
