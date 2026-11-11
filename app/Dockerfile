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
COPY mvp/ mvp/
COPY app/scripts/ app/scripts/
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
ARG ESBUILD_VERSION=0.24.2
RUN npm install -g --no-audit --no-fund "esbuild@${ESBUILD_VERSION}" && esbuild --version
RUN python3 app/scripts/build-sitio.py \
    && test -s app/sitio-spa/index.html \
    && ls app/sitio-spa/assets/app.*.js app/sitio-spa/assets/app.*.css app/sitio-spa/assets/i18n.*.js \
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
