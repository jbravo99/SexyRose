#!/usr/bin/env bash
# Crea .env (raíz del repo) a partir de .env.example generando claves fuertes.
#
#   bash infra/gen-env.sh            # crea ./.env (no muestra las claves)
#   bash infra/gen-env.sh --show     # además imprime las claves generadas
#   bash infra/gen-env.sh --dev      # SITE_URL=http://localhost:3000 (para la Mac)
#   bash infra/gen-env.sh --output /ruta/.env
#
# Genera: POSTGRES_PASSWORD, IP_HASH_SALT, ADMIN_PASSWORD, ADMIN_PATH (dirección secreta del admin)
# y arma DATABASE_URL coherente. La dirección completa del admin: bash infra/server/admin-path.sh
# TUNNEL_TOKEN queda vacío: lo pega el dueño a mano.
# Nunca pisa un .env existente.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXAMPLE="$REPO_DIR/.env.example"
OUTPUT="$REPO_DIR/.env"
SHOW=0
DEV=0

usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --show) SHOW=1 ;;
    --dev) DEV=1 ;;
    --output) OUTPUT="${2:?falta la ruta después de --output}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Opción desconocida: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

command -v openssl >/dev/null || { echo "ERROR: falta openssl" >&2; exit 1; }
[[ -f "$EXAMPLE" ]] || { echo "ERROR: no encuentro $EXAMPLE" >&2; exit 1; }
if [[ -e "$OUTPUT" ]]; then
  echo "ERROR: $OUTPUT ya existe. No lo piso. Si querés regenerarlo, movelo/borralo vos primero." >&2
  exit 1
fi

# Valor de una clave en .env.example (primera aparición).
example_value() { grep -m1 "^$1=" "$EXAMPLE" | cut -d= -f2- || true; }

PG_USER="$(example_value POSTGRES_USER)"; PG_USER="${PG_USER:-sexyrose}"
PG_DB="$(example_value POSTGRES_DB)";     PG_DB="${PG_DB:-sexyrose}"

# Solo [A-Za-z0-9]: seguro dentro de una URL y en env_file sin comillas.
gen_hex() { openssl rand -hex 32; }
gen_alnum() {
  local s
  s="$(openssl rand -base64 48 | tr -d '/+=\n')"
  printf '%s' "${s:0:32}"
}

export GEN_POSTGRES_PASSWORD GEN_IP_HASH_SALT GEN_ADMIN_PASSWORD GEN_ADMIN_PATH GEN_DATABASE_URL GEN_SITE_URL
GEN_POSTGRES_PASSWORD="$(gen_hex)"
GEN_IP_HASH_SALT="$(gen_hex)"
GEN_ADMIN_PASSWORD="$(gen_alnum)"
# Dirección secreta del admin: "/p-" + 24 caracteres hexadecimales (misma regla que valida el app).
GEN_ADMIN_PATH="/p-$(openssl rand -hex 12)"
GEN_DATABASE_URL="postgres://${PG_USER}:${GEN_POSTGRES_PASSWORD}@db:5432/${PG_DB}"
GEN_SITE_URL=""
[[ "$DEV" -eq 1 ]] && GEN_SITE_URL="http://localhost:3000"

umask 077
OUT_DIR="$(dirname "$OUTPUT")"
TMP="$(mktemp "$OUT_DIR/.env.tmp.XXXXXX")"
trap 'rm -f "$TMP"' EXIT

# Los secretos pasan por el entorno (ENVIRON), no por argumentos visibles en ps.
awk '
  BEGIN { FS = "=" }
  /^POSTGRES_PASSWORD=/ { print "POSTGRES_PASSWORD=" ENVIRON["GEN_POSTGRES_PASSWORD"]; next }
  /^IP_HASH_SALT=/      { print "IP_HASH_SALT="      ENVIRON["GEN_IP_HASH_SALT"];      next }
  /^ADMIN_PASSWORD=/    { print "ADMIN_PASSWORD="    ENVIRON["GEN_ADMIN_PASSWORD"];    next }
  /^ADMIN_PATH=/        { print "ADMIN_PATH="        ENVIRON["GEN_ADMIN_PATH"];        next }
  /^DATABASE_URL=/      { print "DATABASE_URL="      ENVIRON["GEN_DATABASE_URL"];      next }
  /^TUNNEL_TOKEN=/      { print "TUNNEL_TOKEN=";                                         next }
  /^SITE_URL=/ && ENVIRON["GEN_SITE_URL"] != "" { print "SITE_URL=" ENVIRON["GEN_SITE_URL"]; next }
  { print }
' "$EXAMPLE" > "$TMP"

# Chequeo: ninguna clave quedó con el valor de ejemplo.
if grep -q 'cambiar-por' "$TMP"; then
  echo "ERROR: quedó algún valor de ejemplo sin reemplazar en el .env generado:" >&2
  grep -n 'cambiar-por' "$TMP" | cut -d= -f1 >&2
  exit 1
fi
if ! grep -Eq '^ADMIN_PATH=/[a-z0-9-]{16,}$' "$TMP"; then
  echo "ERROR: no quedó una ADMIN_PATH válida en el .env generado (¿falta la línea ADMIN_PATH= en .env.example?)." >&2
  exit 1
fi

chmod 600 "$TMP"
if [[ -e "$OUTPUT" ]]; then
  echo "ERROR: $OUTPUT apareció mientras generaba. No lo piso." >&2
  exit 1
fi
mv "$TMP" "$OUTPUT"
trap - EXIT

echo "Listo: $OUTPUT (permisos 600)."
echo "Generados: POSTGRES_PASSWORD, IP_HASH_SALT, ADMIN_PASSWORD, ADMIN_PATH, DATABASE_URL."
echo "Falta completar a mano: TUNNEL_TOKEN (y opcionales: OPERATOR_NAME, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, AGE_RECIPIENT)."
echo "Usuario del admin: $(grep -m1 '^ADMIN_USER=' "$OUTPUT" | cut -d= -f2-)"
if [[ "$SHOW" -eq 1 ]]; then
  echo
  echo "--- Claves generadas (guardalas en tu gestor de contraseñas) ---"
  echo "ADMIN_PASSWORD=$GEN_ADMIN_PASSWORD"
  echo "ADMIN_PATH=$GEN_ADMIN_PATH"
  echo "POSTGRES_PASSWORD=$GEN_POSTGRES_PASSWORD"
  echo "IP_HASH_SALT=$GEN_IP_HASH_SALT"
else
  echo "Las claves no se muestran. Para ver la del admin:  grep ^ADMIN_PASSWORD= $OUTPUT"
  echo "Dirección del admin (es secreta):  bash infra/server/admin-path.sh"
fi
