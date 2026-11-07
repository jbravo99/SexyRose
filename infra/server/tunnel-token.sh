#!/usr/bin/env bash
# Guarda el token del túnel de Cloudflare en .env sin mostrarlo en pantalla.
# Uso (en el servidor, desde la raíz del repo):  bash infra/server/tunnel-token.sh
# Pegá el comando completo que muestra Cloudflare (docker run ... --token XXXX) o solo el token.
set -euo pipefail
cd "$(dirname "$0")/../.."
ENV_FILE="${ENV_FILE:-.env}"
[[ -f "$ENV_FILE" ]] || { echo "ERROR: no existe $ENV_FILE. Corré primero: bash infra/gen-env.sh" >&2; exit 1; }
printf 'Pegá el comando de Cloudflare (no se ve al pegar) y dale Enter: '
IFS= read -r -s LINEA
echo
LINEA="${LINEA//$'\r'/}"
TOKEN="${LINEA##*--token}"
TOKEN="${TOKEN#"${TOKEN%%[![:space:]]*}"}"
TOKEN="${TOKEN%%[[:space:]]*}"
if [[ ! "$TOKEN" =~ ^[A-Za-z0-9_=-]{100,}$ ]]; then
  echo "ERROR: eso no parece un token válido (largo ${#TOKEN}). No cambié nada." >&2; exit 1
fi
TMP="$(mktemp "${ENV_FILE}.XXXXXX")"
chmod 600 "$TMP"
if grep -q '^TUNNEL_TOKEN=' "$ENV_FILE"; then
  awk -v t="$TOKEN" '/^TUNNEL_TOKEN=/{print "TUNNEL_TOKEN=" t; next} {print}' "$ENV_FILE" > "$TMP"
else
  cat "$ENV_FILE" > "$TMP"; printf 'TUNNEL_TOKEN=%s\n' "$TOKEN" >> "$TMP"
fi
mv "$TMP" "$ENV_FILE"
echo "OK: TUNNEL_TOKEN guardado en $ENV_FILE (${#TOKEN} caracteres). Siguiente: bash infra/server/deploy.sh"
