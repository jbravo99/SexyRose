#!/usr/bin/env bash
# SexyRose — desplegar / actualizar en el servidor.
#
#   bash ~/SexyRose/infra/server/deploy.sh            # git pull + build + up + espera healthy
#   bash ~/SexyRose/infra/server/deploy.sh --no-pull  # sin git pull (usa lo que hay en disco)
#
# Requisitos: repo clonado (por defecto en ~/SexyRose), .env en la raíz del repo con TUNNEL_TOKEN.
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
COMPOSE_FILE="$REPO_DIR/infra/docker-compose.yml"
ENV_FILE="$REPO_DIR/.env"
HEALTH_TIMEOUT=180   # segundos
DO_PULL=1

for arg in "$@"; do
  case "$arg" in
    --no-pull) DO_PULL=0 ;;
    -h|--help) sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Opción desconocida: $arg" >&2; exit 2 ;;
  esac
done

die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
env_get() { grep -m1 "^$1=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true; }
compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

cd "$REPO_DIR"
[[ -f "$COMPOSE_FILE" ]] || die "no encuentro $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || die "falta $ENV_FILE. Crealo con: bash infra/gen-env.sh"
chmod 600 "$ENV_FILE"
[[ -n "$(env_get TUNNEL_TOKEN)" ]] || die "TUNNEL_TOKEN está vacío en .env. Pegá el token del túnel (nano .env) y volvé a correr."
docker info >/dev/null 2>&1 || die "no puedo hablar con Docker. ¿Saliste y volviste a entrar por SSH después de setup.sh (grupo docker)?"

if [[ "$DO_PULL" -eq 1 ]]; then
  echo "==> git pull"
  git pull --ff-only
fi
echo "Versión: $(git log -1 --format='%h %s (%cr)' 2>/dev/null || echo 'desconocida')"

echo "==> Bajando imágenes base (postgres, cloudflared)"
if ! compose pull --quiet db cloudflared; then
  die "no pude bajar las imágenes. Si el error es del tag de cloudflared, revisá el último en
       https://hub.docker.com/r/cloudflare/cloudflared/tags y actualizalo en infra/docker-compose.yml."
fi

echo "==> Construyendo y levantando"
compose up -d --build --remove-orphans

echo "==> Esperando que el app quede healthy (hasta ${HEALTH_TIMEOUT}s)"
CID="$(compose ps -q app)"
[[ -n "$CID" ]] || die "el contenedor app no está corriendo"
status=""
for ((i = 0; i < HEALTH_TIMEOUT; i += 3)); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$CID" 2>/dev/null || echo desconocido)"
  [[ "$status" == "healthy" ]] && break
  sleep 3
done
if [[ "$status" != "healthy" ]]; then
  echo
  compose ps
  echo
  echo "--- últimos logs del app ---"
  compose logs --tail 80 app || true
  die "el app no quedó healthy (estado: $status)."
fi
echo "app: healthy"

echo
compose ps
echo
echo "--- cloudflared (últimas líneas; buscar 'Registered tunnel connection') ---"
sleep 5
compose logs --tail 15 cloudflared || true

echo
echo "==> Limpiando imágenes viejas"
docker image prune -f >/dev/null
docker builder prune -f --filter until=168h >/dev/null || true
echo "Deploy OK."
