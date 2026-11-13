#!/usr/bin/env bash
# SexyRose — trae las copias del servidor a la PC de casa (Linux), las verifica y las rota.
#
#   sexyrose-traer-copias                 # lo instala instalar-en-casa.sh; también: bash traer-copias.sh
#   SR_COPIAS_CONF=/otra/config sexyrose-traer-copias
#
# Config: ~/.config/sexyrose-copias/config (ver config.example). La clave privada age NO hace falta acá:
# las copias quedan cifradas tal cual llegan. Se descifran solo para restaurar.
#
# Carpetas dentro de DESTINO:
#   espejo/       copia exacta de lo que hay en el servidor (últimos 7 juegos)
#   diarias/      un juego por día, verificado (14)
#   semanales/    el primero de cada semana (8)
#   mensuales/    el primero de cada mes (12)
# Los juegos se guardan con enlaces duros: repetir un juego en diarias/semanales/mensuales no ocupa más disco.
# Si algo falla: código de salida distinto de 0, línea en el log y aviso por Telegram (si está configurado).
set -euo pipefail

CONF="${SR_COPIAS_CONF:-$HOME/.config/sexyrose-copias/config}"
CONF_DIR="$(dirname "$CONF")"

# Valores por defecto (la config los pisa).
VPS=""
PUERTO=22
USUARIO_REMOTO="sr-copias"
LLAVE="$HOME/.ssh/sexyrose_copias"
DESTINO="$HOME/sexyrose-copias"
KNOWN_HOSTS="$CONF_DIR/known_hosts"
MAX_HORAS=36
KEEP_DIARIAS=14
KEEP_SEMANALES=8
KEEP_MENSUALES=12
TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""

ts_log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

notify() {
  local text="[SexyRose copias en casa] $1"
  if [[ -n "$TELEGRAM_BOT_TOKEN" && -n "$TELEGRAM_CHAT_ID" ]]; then
    # La URL con el token va por stdin (-K -) para que no aparezca en la lista de procesos.
    printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$TELEGRAM_BOT_TOKEN" \
      | curl -fsS --max-time 15 -K - --data-urlencode "chat_id=$TELEGRAM_CHAT_ID" --data-urlencode "text=$text" -o /dev/null \
      || ts_log "AVISO: no pude avisar por Telegram"
  fi
}

fail() { ts_log "ERROR: $*"; notify "FALLA: $*"; exit 1; }

[[ -f "$CONF" ]] || { ts_log "ERROR: falta $CONF (copiá config.example)"; exit 1; }
# La config solo puede tener asignaciones simples: se valida antes de cargarla.
# shellcheck disable=SC2016  # el patrón es literal a propósito ($ y ` prohibidos en los valores)
if grep -Evq '^[[:space:]]*(#.*)?$|^[A-Z_]+=("[^"`$]*"|[^"`$[:space:];&|]*)$' "$CONF"; then
  ts_log "ERROR: $CONF tiene líneas que no son VARIABLE=valor"; exit 1
fi
# shellcheck disable=SC1090
. "$CONF"

[[ -n "$VPS" ]] || fail "VPS vacío en $CONF"
[[ "$PUERTO" =~ ^[0-9]+$ ]] || fail "PUERTO inválido"
[[ -r "$LLAVE" ]] || fail "no puedo leer la llave SSH $LLAVE"
[[ -s "$KNOWN_HOSTS" ]] || fail "falta $KNOWN_HOSTS (paso 4 del README: ssh-keyscan + comparar la huella)"
for c in rsync ssh sha256sum flock; do command -v "$c" >/dev/null || fail "falta el comando $c"; done
for n in "$MAX_HORAS" "$KEEP_DIARIAS" "$KEEP_SEMANALES" "$KEEP_MENSUALES"; do
  [[ "$n" =~ ^[0-9]+$ && "$n" -ge 1 ]] || fail "los valores KEEP_* y MAX_HORAS tienen que ser números >= 1"
done

umask 077
mkdir -p "$DESTINO"/{espejo,diarias,semanales,mensuales}
exec 9>"$DESTINO/.lock"
flock -n 9 || { ts_log "Ya hay otra corrida en curso; salgo."; exit 0; }

trap 'fail "la corrida se cortó en la línea $LINENO"' ERR

# --- 1. Traer (el servidor solo permite leer; --delete actúa sobre la copia local del espejo) ---
SSH_CMD="ssh -i $LLAVE -p $PUERTO -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$KNOWN_HOSTS -o ConnectTimeout=30 -o ServerAliveInterval=30"
ts_log "Trayendo de $USUARIO_REMOTO@$VPS"
if ! rsync -rt --delete --partial-dir=.parcial --timeout=900 --chmod=F600,D700 \
      --include='sexyrose-*-db.dump.age' --include='sexyrose-*-data.tar.gz.age' --include='sexyrose-*Z.sha256' --exclude='*' \
      -e "$SSH_CMD" "$USUARIO_REMOTO@$VPS:./" "$DESTINO/espejo/"; then
  trap - ERR
  fail "rsync no pudo traer las copias de $VPS"
fi

# --- 2. Verificar y guardar cada juego nuevo ---
nuevos=0; malos=0
while IFS= read -r sums; do
  set_id="$(basename "$sums" .sha256)"            # sexyrose-20261113T031500Z
  dest="$DESTINO/diarias/$set_id"
  [[ -d "$dest" ]] && continue
  if (cd "$DESTINO/espejo" && sha256sum --quiet -c "$set_id.sha256" >/dev/null 2>&1); then
    mkdir -p "$dest.tmp"
    for f in "$set_id.sha256" "$set_id-db.dump.age" "$set_id-data.tar.gz.age"; do
      ln -f "$DESTINO/espejo/$f" "$dest.tmp/$f"
    done
    mv "$dest.tmp" "$dest"
    nuevos=$((nuevos + 1))
    ts_log "Verificado y guardado: $set_id"
  else
    malos=$((malos + 1))
    ts_log "ERROR: $set_id no pasa la verificación (sha256). Lo borro del espejo para que se baje de nuevo."
    rm -f -- "$DESTINO/espejo/$set_id".* "$DESTINO/espejo/$set_id"-*
  fi
done < <(find "$DESTINO/espejo" -maxdepth 1 -type f -name 'sexyrose-*Z.sha256' | sort)

# --- 3. Semanales y mensuales (el primero de cada semana ISO / de cada mes) ---
set_epoch() { # sexyrose-20261113T031500Z -> segundos
  local t="${1#sexyrose-}"
  date -u -d "${t:0:4}-${t:4:2}-${t:6:2}T${t:9:2}:${t:11:2}:${t:13:2}Z" +%s
}
has_period() { # <carpeta> <formato date> <valor>
  local d
  for d in "$1"/sexyrose-*Z; do
    [[ -d "$d" ]] || continue
    [[ "$(date -u -d "@$(set_epoch "$(basename "$d")")" +"$2")" == "$3" ]] && return 0
  done
  return 1
}
for d in "$DESTINO"/diarias/sexyrose-*Z; do
  [[ -d "$d" ]] || continue
  id="$(basename "$d")"; ep="$(set_epoch "$id")"
  wk="$(date -u -d "@$ep" +%G-W%V)"; mo="$(date -u -d "@$ep" +%Y-%m)"
  if ! has_period "$DESTINO/semanales" %G-W%V "$wk"; then cp -al "$d" "$DESTINO/semanales/$id"; ts_log "Semanal $wk: $id"; fi
  if ! has_period "$DESTINO/mensuales" %Y-%m "$mo"; then cp -al "$d" "$DESTINO/mensuales/$id"; ts_log "Mensual $mo: $id"; fi
done

# --- 4. Rotación ---
prune() { # <carpeta> <cuántos quedan>
  local -a sets
  mapfile -t sets < <(find "$1" -mindepth 1 -maxdepth 1 -type d -name 'sexyrose-*Z' -printf '%f\n' | sort -r | tail -n +"$(( $2 + 1 ))")
  local s; for s in "${sets[@]}"; do rm -rf -- "${1:?}/$s"; ts_log "Rotada: $(basename "$1")/$s"; done
}
prune "$DESTINO/diarias" "$KEEP_DIARIAS"
prune "$DESTINO/semanales" "$KEEP_SEMANALES"
prune "$DESTINO/mensuales" "$KEEP_MENSUALES"
find "$DESTINO/diarias" -maxdepth 1 -type d -name '*.tmp' -exec rm -rf {} + 2>/dev/null || true

# --- 5. ¿Está llegando algo? ---
ultimo="$(find "$DESTINO/diarias" -mindepth 1 -maxdepth 1 -type d -name 'sexyrose-*Z' -printf '%f\n' | sort -r | head -1)"
trap - ERR
[[ -n "$ultimo" ]] || fail "no hay ninguna copia verificada todavía"
horas=$(( ($(date -u +%s) - $(set_epoch "$ultimo")) / 3600 ))
[[ "$malos" -eq 0 ]] || fail "$malos juego(s) no pasaron la verificación; se reintentan en la próxima corrida"
(( horas < MAX_HORAS )) || fail "la última copia verificada tiene $horas h (¿se cortó backup.sh en el servidor?)"
ts_log "OK: $nuevos juego(s) nuevo(s). Última copia: $ultimo ($horas h). Espacio usado: $(du -sh "$DESTINO" | cut -f1)"
