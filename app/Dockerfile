# syntax=docker/dockerfile:1
#
# Imagen única del sitio SexyRose (app Node 22 + demo generada desde mvp/).
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

# ---------- Etapa 1: demo (HTML de un solo archivo, independiente de la arquitectura) ----------
# Corre en la plataforma del que construye (más rápido en builds cruzados amd64/arm64).
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS demo
ARG DEMO_BUILD_SCRIPT
ARG DEMO_OUTPUT_DIR
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

# ---------- Etapa 2: runtime ----------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false
WORKDIR /app

# Dependencias primero (cache). Si no hay package-lock.json se usa npm install.
COPY app/package.json app/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
 && npm cache clean --force

COPY app/ ./
COPY --from=demo /out/ ./public/demo/

# Todo es del root y solo lectura para el proceso; corre como el usuario "node" (uid 1000).
# hadolint ignore=DL3066
USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "server.js"]
