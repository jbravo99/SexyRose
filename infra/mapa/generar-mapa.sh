#!/usr/bin/env bash
# SexyRose — genera el mapa de Argentina para la vista "Mapa" de Cerca de mí y lo sube a bunny.net.
# Pasos y explicación: infra/mapa/README.md
#
#   bash infra/mapa/generar-mapa.sh                 # recorta el mapa (último build de Protomaps) y baja fuentes y sprites
#   bash infra/mapa/generar-mapa.sh --fecha 20261110 # usa ese build (AAAAMMDD) en vez de buscar el último
#   bash infra/mapa/generar-mapa.sh --subir          # además lo sube a bunny.net (BUNNY_STORAGE_* del .env)
#   bash infra/mapa/generar-mapa.sh --verificar URL  # prueba que el CDN responda bien (CORS y Range) para ese .pmtiles
#
# Deja todo en ./mapa-salida/ (fuera del repo si lo corrés desde otra carpeta con SALIDA=/ruta):
#   argentina.pmtiles   fonts/<fuente>/<rango>.pbf   sprites/v4/dark.{json,png} y dark@2x.{json,png}
# Necesita: pmtiles (brew install pmtiles), curl, unzip.
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env}"
SALIDA="${SALIDA:-$PWD/mapa-salida}"
# Argentina continental + Tierra del Fuego (oeste, sur, este, norte)
BBOX="${BBOX:--73.6,-55.2,-53.5,-21.7}"
# Zoom máximo 14: el sitio no deja acercar más (nadie puede deducir una cuadra) y el archivo queda más chico
MAXZOOM=14
CARPETA_BUNNY="mapa"

die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
info() { printf '· %s\n' "$*"; }
env_get() { grep -m1 "^$1=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true; }

FECHA=""; SUBIR=0; VERIFICAR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --fecha) FECHA="${2:-}"; shift 2 ;;
    --subir) SUBIR=1; shift ;;
    --verificar) VERIFICAR="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,13p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) die "opción desconocida: $1" ;;
  esac
done

# ---------- Verificación del CDN ----------
if [[ -n "$VERIFICAR" ]]; then
  [[ "$VERIFICAR" == https://*.pmtiles ]] || die "pasá la dirección completa del .pmtiles (https://…/argentina.pmtiles)"
  ORIGEN="${ORIGEN:-https://sexyrose.net}"
  info "Pidiendo los primeros 127 bytes como lo hace el navegador (Range + Origin: $ORIGEN)"
  cab="$(curl -sS -D - -o /dev/null -r 0-126 -H "Origin: $ORIGEN" "$VERIFICAR")"
  printf '%s\n' "$cab" | grep -iE '^(HTTP/|content-range|access-control-allow-origin|content-length)' || true
  printf '%s' "$cab" | grep -qE '^HTTP/[0-9.]+ 206' || die "el CDN no respondió 206 (Range): revisá la Pull Zone (README, paso 4)"
  printf '%s' "$cab" | grep -qi '^access-control-allow-origin:' || die "falta Access-Control-Allow-Origin: activá los headers CORS para pmtiles (README, paso 4)"
  info "OK: el CDN sirve el mapa con Range y CORS."
  exit 0
fi

command -v pmtiles >/dev/null || die "falta el programa pmtiles: en la Mac, brew install pmtiles"
command -v curl >/dev/null || die "falta curl"
command -v unzip >/dev/null || die "falta unzip"
mkdir -p "$SALIDA"

# ---------- 1) Recorte de Argentina desde el build diario de Protomaps ----------
if [[ -z "$FECHA" && ! -s "$SALIDA/argentina.pmtiles" ]]; then
  info "Buscando el último build de Protomaps (build.protomaps.com)…"
  for i in $(seq 0 14); do
    d="$(date -u -v-"${i}"d +%Y%m%d 2>/dev/null || date -u -d "-$i day" +%Y%m%d)"
    if curl -sfI "https://build.protomaps.com/$d.pmtiles" >/dev/null; then FECHA="$d"; break; fi
  done
  [[ -n "$FECHA" ]] || die "no encontré un build reciente: elegí uno en https://maps.protomaps.com/builds/ y pasalo con --fecha AAAAMMDD"
fi
[[ -z "$FECHA" || "$FECHA" =~ ^[0-9]{8}$ ]] || die "--fecha tiene que ser AAAAMMDD"
if [[ -s "$SALIDA/argentina.pmtiles" ]]; then
  info "Ya existe $SALIDA/argentina.pmtiles: no lo vuelvo a recortar (borralo para generarlo de nuevo)."
else
  info "Build $FECHA → $SALIDA/argentina.pmtiles (bbox $BBOX, zoom hasta $MAXZOOM). Tarda varios minutos."
  pmtiles extract "https://build.protomaps.com/$FECHA.pmtiles" "$SALIDA/argentina.pmtiles" --bbox="$BBOX" --maxzoom="$MAXZOOM"
fi
pmtiles show "$SALIDA/argentina.pmtiles" || true
ls -lh "$SALIDA/argentina.pmtiles"

# ---------- 2) Fuentes y sprites (nombres de calles y lugares) ----------
info "Bajando fuentes y sprites de protomaps/basemaps-assets…"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
curl -sSfL -o "$tmp/assets.zip" "https://github.com/protomaps/basemaps-assets/archive/refs/heads/main.zip"
unzip -q "$tmp/assets.zip" -d "$tmp"
base="$(find "$tmp" -maxdepth 1 -type d -name 'basemaps-assets-*' | head -1)"
[[ -d "$base/fonts" && -d "$base/sprites/v4" ]] || die "el zip de basemaps-assets no trae fonts/ y sprites/v4/"
rm -rf "$SALIDA/fonts" "$SALIDA/sprites"
mkdir -p "$SALIDA/fonts" "$SALIDA/sprites/v4"
# Solo las fuentes que usa el estilo (Noto Sans Regular, Medium e Italic)
for f in "Noto Sans Regular" "Noto Sans Medium" "Noto Sans Italic"; do
  [[ -d "$base/fonts/$f" ]] || die "falta la fuente $f"
  cp -R "$base/fonts/$f" "$SALIDA/fonts/"
done
cp "$base"/sprites/v4/dark.json "$base"/sprites/v4/dark.png "$base"/sprites/v4/dark@2x.json "$base"/sprites/v4/dark@2x.png "$SALIDA/sprites/v4/"
info "Fuentes: $(find "$SALIDA/fonts" -type f | wc -l | tr -d ' ') archivos. Sprites: $(ls "$SALIDA/sprites/v4" | wc -l | tr -d ' ') archivos."

# ---------- 3) Subida a bunny.net (opcional) ----------
if [[ "$SUBIR" -eq 1 ]]; then
  ZONA="${BUNNY_STORAGE_ZONE:-$(env_get BUNNY_STORAGE_ZONE)}"
  CLAVE="${BUNNY_STORAGE_KEY:-$(env_get BUNNY_STORAGE_KEY)}"
  HOST="${BUNNY_STORAGE_HOST:-$(env_get BUNNY_STORAGE_HOST)}"; HOST="${HOST:-storage.bunnycdn.com}"
  CDN="${BUNNY_CDN_URL:-$(env_get BUNNY_CDN_URL)}"
  [[ -n "$ZONA" && -n "$CLAVE" ]] || die "faltan BUNNY_STORAGE_ZONE y BUNNY_STORAGE_KEY (en $ENV_FILE o exportadas)"
  subir() { # $1 = archivo local, $2 = ruta dentro de la zona
    local destino; destino="$(printf '%s' "$2" | sed 's/ /%20/g')"
    curl -sSf -X PUT -H "AccessKey: $CLAVE" -H "Content-Type: application/octet-stream" \
      --upload-file "$1" "https://$HOST/$ZONA/$destino" >/dev/null || die "no se pudo subir $2"
  }
  info "Subiendo argentina.pmtiles a $ZONA/$CARPETA_BUNNY/ (puede tardar)…"
  subir "$SALIDA/argentina.pmtiles" "$CARPETA_BUNNY/argentina.pmtiles"
  info "Subiendo fuentes y sprites…"
  n=0
  while IFS= read -r -d '' f; do
    subir "$f" "$CARPETA_BUNNY/${f#"$SALIDA"/}"; n=$((n + 1))
    if (( n % 100 == 0 )); then info "$n archivos…"; fi
  done < <(find "$SALIDA/fonts" "$SALIDA/sprites" -type f -print0)
  info "Listo: $n archivos de fuentes y sprites."
  if [[ -n "$CDN" ]]; then
    printf '\nCargá en el .env del servidor (y reiniciá el app):\n'
    printf '  MAP_TILES_URL=%s/%s/argentina.pmtiles\n' "$CDN" "$CARPETA_BUNNY"
    printf '  MAP_GLYPHS_URL=%s/%s/fonts/{fontstack}/{range}.pbf\n' "$CDN" "$CARPETA_BUNNY"
    printf '  MAP_SPRITE_URL=%s/%s/sprites/v4/dark\n' "$CDN" "$CARPETA_BUNNY"
    printf '\nDespués probá el CDN: bash infra/mapa/generar-mapa.sh --verificar %s/%s/argentina.pmtiles\n' "$CDN" "$CARPETA_BUNNY"
  fi
else
  info "No subí nada. Para subirlo: bash infra/mapa/generar-mapa.sh --subir  (o subí la carpeta $SALIDA a mano, README paso 3)"
fi
