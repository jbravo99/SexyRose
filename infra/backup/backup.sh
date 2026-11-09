#!/usr/bin/env bash
# SexyRose — copia diaria de la base (pg_dump -> gzip -> age).
#
#   bash ~/SexyRose/infra/backup/backup.sh
#
# Deja ~/backups/sexyrose-db-AAAAMMDDTHHMMSSZ.sql.gz.age (o .sql.gz si no hay AGE_RECIPIENT en .env)
# y conserva las últimas 14. Lo corre el timer systemd sexyrose-backup.timer (infra/server/install-timers.sh).
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
COMPOSE_FILE="$REPO_DIR/infra/docker-compose.yml"
ENV_FILE="$REPO_DIR/.env"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP="${KEEP:-14}"

die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
warn() { printf 'AVISO: %s\n' "$*" >&2; }
env_get() { grep -m1 "^$1=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true; }

[[ -f "$ENV_FILE" ]] || die "falta $ENV_FILE"
PG_USER="$(env_get POSTGRES_USER)"; PG_USER="${PG_USER:-sexyrose}"
PG_DB="$(env_get POSTGRES_DB)";     PG_DB="${PG_DB:-sexyrose}"
AGE_RECIPIENT="$(env_get AGE_RECIPIENT)"

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

CID="$(docker compose -f "$COMPOSE_FILE" ps -q db 2>/dev/null || true)"
[[ -n "$CID" ]] || die "el contenedor db no está corriendo"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
BASE="$BACKUP_DIR/sexyrose-db-$TS.sql.gz"
if [[ -n "$AGE_RECIPIENT" ]]; then
  command -v age >/dev/null || die "AGE_RECIPIENT está configurado pero falta 'age' (sudo apt install age)"
  OUT="$BASE.age"
else
  OUT="$BASE"
  warn "AGE_RECIPIENT vacío en .env: la copia queda SIN cifrar en $BACKUP_DIR. Configurá una clave pública age."
fi
TMP="$OUT.partial"
trap 'rm -f "$TMP"' EXIT

dump() {
  # --clean --if-exists: el .sql se puede restaurar sobre una base existente.
  docker exec "$CID" pg_dump -U "$PG_USER" -d "$PG_DB" --no-owner --clean --if-exists
}

if [[ -n "$AGE_RECIPIENT" ]]; then
  dump | gzip -9 | age -r "$AGE_RECIPIENT" > "$TMP"
else
  dump | gzip -9 > "$TMP"
  gzip -t "$TMP"
fi
[[ -s "$TMP" ]] || die "la copia salió vacía"
mv "$TMP" "$OUT"
trap - EXIT
echo "Copia OK: $OUT ($(du -h "$OUT" | cut -f1))"

# Archivos subidos (volumen srdata del app: fotos, historias y privado/ con selfies, documentos y comprobantes).
ACID="$(docker compose -f "$COMPOSE_FILE" ps -q app 2>/dev/null || true)"
if [[ -n "$ACID" ]]; then
  FBASE="$BACKUP_DIR/sexyrose-files-$TS.tar.gz"
  if [[ -n "$AGE_RECIPIENT" ]]; then FOUT="$FBASE.age"; else FOUT="$FBASE"; fi
  FTMP="$FOUT.partial"
  trap 'rm -f "$FTMP"' EXIT
  if [[ -n "$AGE_RECIPIENT" ]]; then
    docker exec "$ACID" tar -C /data -cf - . | gzip -6 | age -r "$AGE_RECIPIENT" > "$FTMP"
  else
    docker exec "$ACID" tar -C /data -cf - . | gzip -6 > "$FTMP"
  fi
  [[ -s "$FTMP" ]] || die "la copia de archivos salió vacía"
  mv "$FTMP" "$FOUT"
  trap - EXIT
  echo "Copia de archivos OK: $FOUT ($(du -h "$FOUT" | cut -f1))"
  mapfile -t FOLD < <(find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'sexyrose-files-*.tar.gz' -o -name 'sexyrose-files-*.tar.gz.age' \) -printf '%T@ %p\n' \
    | sort -rn | tail -n +"$((KEEP + 1))" | cut -d' ' -f2-)
  [[ ${#FOLD[@]} -gt 0 ]] && rm -f -- "${FOLD[@]}"
else
  warn "el contenedor app no está corriendo: no se copiaron los archivos subidos"
fi

# Retención: conservar las últimas $KEEP (cifradas o no).
mapfile -t OLD < <(find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'sexyrose-db-*.sql.gz' -o -name 'sexyrose-db-*.sql.gz.age' \) -printf '%T@ %p\n' \
  | sort -rn | tail -n +"$((KEEP + 1))" | cut -d' ' -f2-)
if [[ ${#OLD[@]} -gt 0 ]]; then
  rm -f -- "${OLD[@]}"
  echo "Borradas ${#OLD[@]} copia(s) vieja(s)."
fi

# ---------------------------------------------------------------------------
# TODO (copia fuera del servidor): falta elegir proveedor (Storj o Backblaze B2).
# Gancho: si existe infra/backup/offsite.sh y es ejecutable, se llama con la ruta de la copia.
# Ejemplo futuro con rclone:  rclone copy "$1" remoto:sexyrose-backups/
# Subir SOLO copias cifradas (.age).
# ---------------------------------------------------------------------------
OFFSITE="$REPO_DIR/infra/backup/offsite.sh"
if [[ -x "$OFFSITE" ]]; then
  if [[ "$OUT" != *.age ]]; then
    warn "no subo copias sin cifrar fuera del servidor. Configurá AGE_RECIPIENT."
  else
    "$OFFSITE" "$OUT"
  fi
else
  echo "Copia externa: pendiente (TODO, ver infra/backup/restore.md)."
fi
