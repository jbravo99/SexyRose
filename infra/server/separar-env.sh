#!/usr/bin/env bash
# SexyRose — arma un archivo de variables por contenedor a partir de .env (raíz del repo).
#
#   bash infra/server/separar-env.sh             # escribe .env.app, .env.db, .env.tunnel y .env.agente
#   bash infra/server/separar-env.sh --dry-run   # muestra qué variables irían a cada archivo (sin valores)
#   bash infra/server/separar-env.sh --env /ruta/.env
#
# .env sigue siendo el único archivo que se edita a mano. Este script lo reparte:
#   .env.db      → solo POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB        (contenedor db)
#   .env.tunnel  → solo TUNNEL_TOKEN                                          (contenedor cloudflared)
#   .env.agente  → solo DATABASE_URL, SECRETS_KEY, ANTHROPIC_API_KEY, ANTHROPIC_MODEL, TELEGRAM_BOT_TOKEN,
#                  TELEGRAM_CHAT_ID, SITE_URL                                 (contenedor agente: asistente de WhatsApp)
#   .env.app     → todo lo demás, menos lo de arriba, ANTHROPIC_* y AGE_RECIPIENT (contenedor app)
# Así Postgres y cloudflared no reciben SECRETS_KEY, la clave del admin, Mercado Pago, Mailgun, etc., el agente no
# recibe la clave del admin, Mercado Pago ni Mailgun, y el app no recibe la clave de la API de Claude.
#
# Idempotente: si nada cambió no reescribe. Permisos 600, dueño el usuario que lo corre.
# Nunca imprime valores. deploy.sh lo corre solo antes de levantar los contenedores.
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
ENV_FILE="$REPO_DIR/.env"
DRY=0

usage() { sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; }
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --env) ENV_FILE="${2:?falta la ruta después de --env}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Opción desconocida: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || die "no encuentro $ENV_FILE (crealo con: bash infra/gen-env.sh)"
OUT_DIR="$(cd "$(dirname "$ENV_FILE")" && pwd)"

DB_KEYS=(POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB)
TUNNEL_KEYS=(TUNNEL_TOKEN)
# Asistente de cuenta por WhatsApp (app/agente.js). ANTHROPIC_* van solo a este contenedor.
AGENTE_KEYS=(DATABASE_URL SECRETS_KEY ANTHROPIC_API_KEY ANTHROPIC_MODEL TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID SITE_URL)
AGENTE_ONLY_KEYS=(ANTHROPIC_API_KEY ANTHROPIC_MODEL)
# Variables que no necesita ningún contenedor (las leen solo los scripts del servidor).
HOST_ONLY_KEYS=(AGE_RECIPIENT)

in_list() { local k="$1"; shift; local x; for x in "$@"; do [[ "$x" == "$k" ]] && return 0; done; return 1; }

# Lee .env y reparte las líneas KEY=valor. Ignora comentarios y líneas vacías.
# Si una variable aparece dos veces, gana la última (igual que docker compose).
declare -A VAL=()
declare -a ORDER=()
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"
  [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
  if [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
    key="${BASH_REMATCH[2]}"
    [[ -v "VAL[$key]" ]] || ORDER+=("$key")
    VAL[$key]="${BASH_REMATCH[3]}"
  fi
done < "$ENV_FILE"

declare -a APP=() DB=() TUN=() AGE=()
for key in "${ORDER[@]}"; do
  if in_list "$key" "${AGENTE_KEYS[@]}"; then AGE+=("$key"); fi
  if in_list "$key" "${DB_KEYS[@]}"; then DB+=("$key")
  elif in_list "$key" "${TUNNEL_KEYS[@]}"; then TUN+=("$key")
  elif in_list "$key" "${HOST_ONLY_KEYS[@]}"; then :
  elif in_list "$key" "${AGENTE_ONLY_KEYS[@]}"; then :
  else APP+=("$key")
  fi
done

for key in "${DB_KEYS[@]}"; do
  [[ -n "${VAL[$key]:-}" ]] || die "$key falta o está vacío en $ENV_FILE (Postgres no arrancaría)"
done
[[ -n "${VAL[DATABASE_URL]:-}" ]] || die "DATABASE_URL falta o está vacío en $ENV_FILE"

# write_env <archivo> <claves...>
write_env() {
  local out="$1"; shift
  local tmp key changed
  tmp="$(mktemp "$OUT_DIR/.env.sep.XXXXXX")"
  chmod 600 "$tmp"
  {
    echo "# Generado por infra/server/separar-env.sh a partir de .env. NO EDITAR: se pisa en cada deploy."
    for key in "$@"; do printf '%s=%s\n' "$key" "${VAL[$key]}"; done
  } > "$tmp"
  if [[ -f "$out" ]] && cmp -s "$tmp" "$out"; then
    rm -f "$tmp"; changed="sin cambios"
  else
    mv "$tmp" "$out"; changed="actualizado"
  fi
  chmod 600 "$out"
  printf '  %-12s %2d variable(s), %s\n' "$(basename "$out")" "$#" "$changed"
}

if [[ "$DRY" -eq 1 ]]; then
  echo "Prueba (no escribe nada). Variables por archivo, sin valores:"
  echo "  .env.db:     ${DB[*]:-(ninguna)}"
  echo "  .env.tunnel: ${TUN[*]:-(ninguna)}"
  echo "  .env.app:    ${APP[*]:-(ninguna)}"
  echo "  .env.agente: ${AGE[*]:-(ninguna)}"
  echo "  (no van a ningún contenedor: ${HOST_ONLY_KEYS[*]})"
  [[ -n "${VAL[TUNNEL_TOKEN]:-}" ]] || echo "  Aviso: TUNNEL_TOKEN está vacío; cloudflared no va a conectar."
  [[ -n "${VAL[ANTHROPIC_API_KEY]:-}" ]] || echo "  Aviso: sin ANTHROPIC_API_KEY el asistente de WhatsApp responde solo lo automático."
  exit 0
fi

umask 077
echo "Separando $ENV_FILE por contenedor:"
write_env "$OUT_DIR/.env.db" "${DB[@]}"
write_env "$OUT_DIR/.env.tunnel" "${TUN[@]}"
write_env "$OUT_DIR/.env.app" "${APP[@]}"
write_env "$OUT_DIR/.env.agente" "${AGE[@]}"
chmod 600 "$ENV_FILE"
