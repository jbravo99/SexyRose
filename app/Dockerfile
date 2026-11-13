# syntax=docker/dockerfile:1
#
# Imagen única del sitio SexyRose (app Node 22 + demo y panel de administración generados desde mvp/).
#
# Contexto de build: la RAIZ del repo (necesita mvp/ y app/).
#   docker build -f app/Dockerfile .
# docker-compose (infra/docker-compose.yml) ya lo hace así.
#
# Script que genera la demo: un solo lugar para cambiarlo.
#   DEMO_BUILD_SCRIPT vacío = autodetectar el primero que exista de
#   app/scripts/build-demo.sh, app/scripts/build-demo.py, app/scripts/build-demo.mjs
#   Se ejecuta desde la raíz del repo y debe dejar $DEMO_OUTPUT_DIR/index.html.
ARG DEMO_BUILD_SCRIPT=""
ARG DEMO_OUTPUT_DIR=app/public/demo
# Panel de administración (SPA del MVP): app/scripts/build-admin.py deja app/admin-spa/index.html.
ARG ADMIN_BUILD_SCRIPT=app/scripts/build-admin.py
ARG ADMIN_OUTPUT_DIR=app/admin-spa

# ---------- Etapa 1: demo y panel (HTML de un solo archivo, independientes de la arquitectura) ----------
# Corre en la plataforma del que construye (más rápido en builds cruzados amd64/arm64).
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS demo
ARG DEMO_BUILD_SCRIPT
ARG DEMO_OUTPUT_DIR
ARG ADMIN_BUILD_SCRIPT
ARG ADMIN_OUTPUT_DIR
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
# hadolint ignore=DL3008
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /src
# esbuild minimiza el JS y el CSS del sitio y de la demo (versión fija; solo en esta etapa, no queda en la imagen final).
ARG ESBUILD_VERSION=0.24.2
RUN npm install -g --no-audit --no-fund "esbuild@${ESBUILD_VERSION}" && esbuild --version
# Fuentes del sitio (Poppins y Manrope) servidas desde el propio dominio: se copian los .woff2 de @fontsource
# (versión fija; solo en esta etapa). build-sitio.py falla si no las encuentra (REQUIRE_FONTS=1).
ARG FONTSOURCE_VERSION=5.3.0
RUN npm install --prefix /fuentes --no-audit --no-fund --no-save \
      "@fontsource/poppins@${FONTSOURCE_VERSION}" "@fontsource/manrope@${FONTSOURCE_VERSION}"
ENV FONTSOURCE_DIR=/fuentes/node_modules/@fontsource REQUIRE_FONTS=1
# Vista "Mapa" de Cerca de mí: MapLibre GL + PMTiles + estilo de Protomaps (versiones fijas; solo en esta etapa).
# build-sitio.py arma con esbuild assets/mapa.<hash>.js/.css y el worker, que el sitio baja solo al abrir el mapa.
ARG MAPLIBRE_VERSION=6.16.0
ARG PMTILES_VERSION=4.5.0
ARG PROTOMAPS_BASEMAPS_VERSION=5.7.2
RUN npm install --prefix /mapa --no-audit --no-fund --no-save \
      "maplibre-gl@${MAPLIBRE_VERSION}" "pmtiles@${PMTILES_VERSION}" "@protomaps/basemaps@${PROTOMAPS_BASEMAPS_VERSION}"
ENV MAPA_NODE_MODULES=/mapa/node_modules
# La demo (estática) muestra el mapa solo si se arma con estas direcciones (infra/mapa/README.md). Vacías = solo radar.
# (El sitio real no las necesita acá: las lee del .env al arrancar.)
ARG MAP_TILES_URL=""
ARG MAP_GLYPHS_URL=""
ARG MAP_SPRITE_URL=""
COPY mvp/ mvp/
COPY app/scripts/ app/scripts/
# La demo (/demo/) usa las semillas de la base (ubicaciones, salidas, intereses, precios) para sus datos ficticios
COPY app/db/ app/db/
# Demo = el mismo sitio en modo demostración (build-sitio.py --demo): index.html + assets/ + media/ + estado.<hash>.json
RUN set -e; \
    script="${DEMO_BUILD_SCRIPT}"; \
    if [ -z "$script" ]; then \
      for c in app/scripts/build-demo.sh app/scripts/build-demo.py app/scripts/build-demo.mjs; do \
        if [ -f "$c" ]; then script="$c"; break; fi; \
      done; \
    fi; \
    if [ -z "$script" ] || [ ! -f "$script" ]; then \
      echo "ERROR: no encuentro el script de la demo (app/scripts/build-demo.*)" >&2; exit 1; \
    fi; \
    echo "Generando demo con: $script"; \
    mkdir -p "${DEMO_OUTPUT_DIR}"; \
    case "$script" in \
      *.py)       python3 "$script" ;; \
      *.mjs|*.js) node "$script" ;; \
      *)          bash "$script" ;; \
    esac; \
    test -s "${DEMO_OUTPUT_DIR}/index.html" || { echo "ERROR: falta ${DEMO_OUTPUT_DIR}/index.html" >&2; exit 1; }; \
    grep -q 'SR:DEMO' "${DEMO_OUTPUT_DIR}/index.html" || { echo "ERROR: la demo no es el build nuevo (build-sitio.py --demo)" >&2; exit 1; }; \
    ls "${DEMO_OUTPUT_DIR}"/estado.*.json "${DEMO_OUTPUT_DIR}"/assets/app.*.js "${DEMO_OUTPUT_DIR}"/media/*.svg >/dev/null; \
    mkdir -p /out && cp -a "${DEMO_OUTPUT_DIR}/." /out/
# El panel va después de la demo (los dos usan mvp/build/ como carpeta de trabajo).
RUN set -e; \
    test -f "${ADMIN_BUILD_SCRIPT}" || { echo "ERROR: no encuentro ${ADMIN_BUILD_SCRIPT}" >&2; exit 1; }; \
    echo "Generando panel con: ${ADMIN_BUILD_SCRIPT}"; \
    mkdir -p "${ADMIN_OUTPUT_DIR}"; \
    python3 "${ADMIN_BUILD_SCRIPT}"; \
    test -s "${ADMIN_OUTPUT_DIR}/index.html" || { echo "ERROR: falta ${ADMIN_OUTPUT_DIR}/index.html" >&2; exit 1; }; \
    mkdir -p /out-admin && cp -a "${ADMIN_OUTPUT_DIR}/." /out-admin/
# Sitio público real (SPA del MVP en modo producción): app/scripts/build-sitio.py deja app/sitio-spa/index.html
# (cáscara chica) y app/sitio-spa/assets/ (JS, CSS y diccionario con hash en el nombre).
# esbuild minimiza el JS y el CSS (versión fija; solo en esta etapa, no queda en la imagen final).
# (esbuild y las fuentes se instalaron arriba, antes de la demo)
RUN REQUIRE_MAPA=1 python3 app/scripts/build-sitio.py \
    && test -s app/sitio-spa/index.html \
    && test -s app/sitio-spa/seo-datos.json \
    && ls app/sitio-spa/assets/app.*.js app/sitio-spa/assets/app.*.css app/sitio-spa/assets/i18n.*.js app/sitio-spa/assets/fonts/*.woff2 \
       app/sitio-spa/assets/mapa.*.js app/sitio-spa/assets/mapa.*.css app/sitio-spa/assets/mapa-worker.*.js \
    && mkdir -p /out-sitio && cp -a app/sitio-spa/. /out-sitio/

# ---------- Etapa 2: runtime ----------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false
WORKDIR /app

# Fuente para la marca de agua de las fotos y videos (sharp dibuja el texto "SexyRose" con fontconfig)
# y ffmpeg/ffprobe para procesar los videos de la galería (lib/videos.js).
# hadolint ignore=DL3008
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-dejavu-core ffmpeg \
 && rm -rf /var/lib/apt/lists/*

# Dependencias primero (cache). Si no hay package-lock.json se usa npm install.
COPY app/package.json app/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
 && npm cache clean --force

COPY app/ ./
COPY --from=demo /out/ ./public/demo/
# server.js lee el panel de ./admin-spa/index.html (ADMIN_SPA_PATH para cambiarlo).
COPY --from=demo /out-admin/ ./admin-spa/
COPY --from=demo /out-sitio/ ./sitio-spa/

# Archivos subidos (fotos, historias y, en privado/, verificaciones): volumen srdata montado en /data.
# El directorio es del usuario "node" para que el volumen nuevo herede el dueño.
ENV DATA_DIR=/data
RUN mkdir -p /data/media /data/privado /data/tmp/videos && chown -R node:node /data && chmod 750 /data/privado /data/tmp

# El resto es del root y solo lectura para el proceso; corre como el usuario "node" (uid 1000).
# hadolint ignore=DL3066
USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "server.js"]
