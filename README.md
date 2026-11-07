# Proyecto (versión 1)

Repositorio privado. Fuente única del código: cada equipo (Mac, Linux) es una copia.

## Estructura
- `mvp/` — MVP navegable (v56). `python3 build.py` arma `mvp/build/index.html` y `full.html`.
  - `mvp/src/` módulos de la interfaz; `mvp/ssr/` render en el servidor (Node).
  - Pruebas con Playwright: `fullcheck.py`, `flows_final.py`, `ops_test.py`, `i18n_test.py`, `seo_test.py`
    (rutas fijas del sandbox; desde v56 necesitan `sessionStorage hh_age_ok=1`).
- `app/` — sitio de lanzamiento (v1-lanzamiento): Node 22 + Express + Postgres. Portada con pre-registro,
  páginas legales, /denunciar, /admin y la demo del MVP en /demo/ (se genera en el build). Pruebas: `cd app && npm test`.
- `infra/` — Docker Compose (app, db, cloudflared), scripts del servidor, copias y monitoreo. Guía completa: `infra/README.md`.
- `V1-CONTRATO.md` — especificación del sitio de lanzamiento.

## Probar en la Mac (Docker Desktop abierto)
```
bash infra/gen-env.sh --dev
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up --build
```
Abrir http://127.0.0.1:3000 (admin en /admin; el usuario y la contraseña están en `.env`).

## Retomar desde cualquier equipo
1. `git pull` antes de empezar; `git push` al terminar.
2. Secretos en `.env` (no se sube). Copiar de `.env.example` y completar desde el gestor de contraseñas.
3. La bitácora y los pendientes están en el doc del proyecto en Claude (`claude/happyhouse-estado.md`).
