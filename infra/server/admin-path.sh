#!/usr/bin/env bash
# SexyRose — dirección secreta del panel de admin (ADMIN_PATH).
#
#   bash infra/server/admin-path.sh     # desde la raíz del repo, en el servidor o en la Mac
#
# Si .env no tiene una ADMIN_PATH válida, agrega al final una nueva ("/p-" + 24 hex) sin tocar
# las demás líneas. Después imprime la dirección completa del admin (SITE_URL + ADMIN_PATH) para
# guardarla en el gestor de contraseñas. Es el único lugar donde se muestra.
# Se puede correr las veces que haga falta: si ya hay una válida, no cambia nada.
# Otro archivo: ENV_FILE=/ruta/.env bash infra/server/admin-path.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env}"
# Misma regla que valida el app (validAdminPath en app/server.js).
VALID_RE='^/[a-z0-9-]{16,}$'

case "${1:-}" in
  "") ;;
  -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) echo "Opción desconocida: $1" >&2; exit 2 ;;
esac

die() { echo "ERROR: $*" >&2; exit 1; }

# Valor efectivo de una clave: la última línea CLAVE=... (como Docker Compose), sin \r ni comillas que la rodeen.
env_get() {
  local v
  v="$(grep "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)"
  v="${v%$'\r'}"
  if [[ "$v" =~ ^\"(.*)\"$ || "$v" =~ ^\'(.*)\'$ ]]; then v="${BASH_REMATCH[1]}"; fi
  printf '%s' "$v"
}

[[ -f "$ENV_FILE" ]] || die "no encuentro $ENV_FILE. Crealo con: bash infra/gen-env.sh"
[[ -w "$ENV_FILE" ]] || die "no puedo escribir $ENV_FILE (revisá el dueño y los permisos)."

admin_path="$(env_get ADMIN_PATH)"
if [[ "$admin_path" =~ $VALID_RE ]]; then
  echo "ADMIN_PATH ya estaba configurada en $ENV_FILE (no se cambió nada)."
else
  command -v openssl >/dev/null || die "falta openssl"
  had_line=0
  grep -q '^ADMIN_PATH=' "$ENV_FILE" && had_line=1
  admin_path="/p-$(openssl rand -hex 12)"
  [[ "$admin_path" =~ $VALID_RE ]] || die "no pude generar una ADMIN_PATH válida."
  # Si el archivo no termina en salto de línea, agregarlo antes para no pegar la línea nueva a la última.
  if [[ -s "$ENV_FILE" && -n "$(tail -c 1 "$ENV_FILE")" ]]; then
    printf '\n' >> "$ENV_FILE"
  fi
  printf 'ADMIN_PATH=%s\n' "$admin_path" >> "$ENV_FILE"
  echo "Se agregó una ADMIN_PATH nueva al final de $ENV_FILE."
  if [[ "$had_line" -eq 1 ]]; then
    echo "Había otra línea ADMIN_PATH= vacía o inválida: queda sin efecto (vale la última). Podés borrarla con nano."
  fi
  echo "Para que el app la tome:  bash infra/server/deploy.sh"
fi

site_url="$(env_get SITE_URL)"
site_url="${site_url:-https://sexyrose.net}"
while [[ "$site_url" == */ ]]; do site_url="${site_url%/}"; done

echo
echo "Dirección del admin (guardala en tu gestor de contraseñas; no la compartas):"
echo "${site_url}${admin_path}"
