#!/bin/bash
# Atajos desde la Mac al servidor. Uso:
#   bash infra/local/srv.sh subir USUARIO   -> copia infra/server/setup.sh al servidor
#   bash infra/local/srv.sh entrar USUARIO  -> abre una sesión SSH en el servidor
set -euo pipefail
SERVIDOR="213.218.161.153"
LLAVE="$HOME/.ssh/sexyrose_srv1b"
ACCION="${1:-}"; USUARIO="${2:-}"
if [[ -z "$ACCION" || -z "$USUARIO" ]]; then
  echo "Uso: bash infra/local/srv.sh subir|entrar USUARIO"; exit 1
fi
cd "$(dirname "$0")/../.."
case "$ACCION" in
  subir)  scp -o IdentitiesOnly=yes -i "$LLAVE" infra/server/setup.sh "$USUARIO@$SERVIDOR:~/" && echo "OK: setup.sh copiado al servidor." ;;
  entrar) exec ssh -o IdentitiesOnly=yes -i "$LLAVE" "$USUARIO@$SERVIDOR" ;;
  *) echo "Acción desconocida: $ACCION (usá subir o entrar)"; exit 1 ;;
esac
