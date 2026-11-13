#!/usr/bin/env bash
# SexyRose — copia diaria en el servidor: base (pg_dump) + archivos privados (/data), cifradas con age.
#
#   bash ~/SexyRose/infra/backup/backup.sh
#
# Cada corrida deja un juego de 3 archivos en BACKUP_DIR (por defecto /srv/sexyrose-copias):
#   sexyrose-AAAAMMDDTHHMMSSZ-db.dump.age        pg_dump en formato custom, cifrado
#   sexyrose-AAAAMMDDTHHMMSSZ-data.tar.gz.age    volumen /data del app (verificaciones, contenido de pedidos…), cifrado
#   sexyrose-AAAAMMDDTHHMMSSZ.sha256             sumas de los dos anteriores (se escribe ÚLTIMO: marca el juego como completo)
# Conserva los últimos KEEP juegos (7). La PC de casa los trae todos los días (infra/backup/casa/).
# Las fotos y videos públicos están en bunny.net: no pasan por acá.
#
# Cifrado obligatorio: AGE_RECIPIENT en .env (clave PÚBLICA age de la PC de casa). Sin eso no copia nada.
# Lo corre el timer systemd sexyrose-backup.timer (infra/server/install-timers.sh), 03:15 UTC.
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
COMPOSE_FILE="$REPO_DIR/infra/docker-compose.yml"
ENV_FILE="$REPO_DIR/.env"
DEFAULT_DIR="/srv/sexyrose-copias"
KEEP="${KEEP:-7}"

die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
warn() { printf 'AVISO: %s\n' "$*" >&2; }
env_get() { grep -m1 "^$1=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true; }

if [[ -z "${BACKUP_DIR:-}" ]]; then
  if [[ -d "$DEFAULT_DIR" ]]; then
    BACKUP_DIR="$DEFAULT_DIR"
  else
    BACKUP_DIR="$HOME/backups"
    warn "no existe $DEFAULT_DIR (la crea infra/backup/servidor/habilitar-copias.sh). Uso $BACKUP_DIR, que la PC de casa NO puede leer."
  fi
fi

[[ -f "$ENV_FILE" ]] || die "falta $ENV_FILE"
[[ "$KEEP" =~ ^[0-9]+$ && "$KEEP" -ge 1 ]] || die "KEEP tiene que ser un número >= 1"
PG_USER="$(env_get POSTGRES_USER)"; PG_USER="${PG_USER:-sexyrose}"
PG_DB="$(env_get POSTGRES_DB)";     PG_DB="${PG_DB:-sexyrose}"
AGE_RECIPIENT="$(env_get AGE_RECIPIENT)"
[[ -n "$AGE_RECIPIENT" ]] || die "AGE_RECIPIENT está vacío en .env. Las copias salen del servidor: sin cifrar no se hacen. Ver infra/backup/README.md (paso 1)."
[[ "$AGE_RECIPIENT" =~ ^age1[0-9a-z]{50,}$ ]] || die "AGE_RECIPIENT no parece una clave pública age (tiene que empezar con age1…)"
command -v age >/dev/null || die "falta 'age' (sudo apt install age)"
command -v sha256sum >/dev/null || die "falta sha256sum"

# Los archivos quedan legibles por el grupo de la carpeta (sr-copias, el usuario que usa la PC de casa).
umask 027
mkdir -p "$BACKUP_DIR"

CID="$(docker compose -f "$COMPOSE_FILE" ps -q db 2>/dev/null || true)"
[[ -n "$CID" ]] || die "el contenedor db no está corriendo"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
PFX="sexyrose-$TS"
DB_OUT="$BACKUP_DIR/$PFX-db.dump.age"
DATA_OUT="$BACKUP_DIR/$PFX-data.tar.gz.age"
SUMS="$BACKUP_DIR/$PFX.sha256"
TMPS=()
# shellcheck disable=SC2329  # la llama el trap EXIT
cleanup() { [[ ${#TMPS[@]} -gt 0 ]] && rm -f -- "${TMPS[@]}"; return 0; }
trap cleanup EXIT

# --- Base: pg_dump formato custom (comprimido, consistente; se restaura con pg_restore) ---
TMPS+=("$DB_OUT.partial")
docker exec "$CID" pg_dump -U "$PG_USER" -d "$PG_DB" -Fc --no-owner \
  | age -r "$AGE_RECIPIENT" > "$DB_OUT.partial"
[[ -s "$DB_OUT.partial" ]] || die "la copia de la base salió vacía"
mv "$DB_OUT.partial" "$DB_OUT"
echo "Base OK: $(basename "$DB_OUT") ($(du -h "$DB_OUT" | cut -f1))"

# --- Archivos privados: volumen /data del app ---
data_tar() {
  local acid img vol
  acid="$(docker compose -f "$COMPOSE_FILE" ps -q app 2>/dev/null || true)"
  if [[ -n "$acid" ]] && [[ "$(docker inspect -f '{{.State.Running}}' "$acid" 2>/dev/null)" == "true" ]]; then
    docker exec "$acid" tar -C /data -cf - .
    return
  fi
  # App frenado: leer el volumen en solo lectura con la misma imagen del app, sin red.
  img="$(docker compose -f "$COMPOSE_FILE" config --images 2>/dev/null | grep -m1 '^sexyrose-app' || echo sexyrose-app:latest)"
  vol="$(docker volume ls -q --filter label=com.docker.compose.project=sexyrose --filter label=com.docker.compose.volume=srdata | head -1)"
  [[ -n "$vol" ]] || { echo "no encuentro el volumen srdata" >&2; return 1; }
  docker run --rm --network none --entrypoint tar -v "$vol:/data:ro" "$img" -C /data -cf - .
}
TMPS+=("$DATA_OUT.partial")
data_tar | gzip -6 | age -r "$AGE_RECIPIENT" > "$DATA_OUT.partial"
[[ -s "$DATA_OUT.partial" ]] || die "la copia de archivos salió vacía"
mv "$DATA_OUT.partial" "$DATA_OUT"
echo "Archivos OK: $(basename "$DATA_OUT") ($(du -h "$DATA_OUT" | cut -f1))"

# --- Sumas (último paso: un .sha256 presente = juego completo) ---
TMPS+=("$SUMS.partial")
(cd "$BACKUP_DIR" && sha256sum "$(basename "$DB_OUT")" "$(basename "$DATA_OUT")") > "$SUMS.partial"
mv "$SUMS.partial" "$SUMS"
TMPS=()
echo "Juego completo: $PFX"

# --- Retención: los últimos $KEEP juegos ---
mapfile -t OLD < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'sexyrose-*Z.sha256' -printf '%f\n' \
  | sort -r | tail -n +"$((KEEP + 1))")
for s in "${OLD[@]}"; do
  p="${s%.sha256}"
  rm -f -- "$BACKUP_DIR/$s" "$BACKUP_DIR/$p-db.dump.age" "$BACKUP_DIR/$p-data.tar.gz.age"
done
[[ ${#OLD[@]} -gt 0 ]] && echo "Borrados ${#OLD[@]} juego(s) viejo(s) (quedan $KEEP)."
# Restos de corridas cortadas a la mitad.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'sexyrose-*.partial' -mmin +360 -delete 2>/dev/null || true
exit 0
