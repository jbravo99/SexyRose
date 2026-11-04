# Proyecto (versión 1)

Repositorio privado. Fuente única del código: cada equipo (Mac, Linux) es una copia.

## Estructura
- `mvp/` — MVP navegable (v56). `python3 build.py` arma `mvp/build/index.html` y `full.html`.
  - `mvp/src/` módulos de la interfaz; `mvp/ssr/` render en el servidor (Node).
  - Pruebas con Playwright: `fullcheck.py`, `flows_final.py`, `ops_test.py`, `i18n_test.py`, `seo_test.py`
    (rutas fijas del sandbox; desde v56 necesitan `sessionStorage hh_age_ok=1`).
- Próximos: `api/`, `worker/`, `infra/` (Docker Compose y scripts del servidor).

## Retomar desde cualquier equipo
1. `git pull` antes de empezar; `git push` al terminar.
2. Secretos en `.env` (no se sube). Copiar de `.env.example` y completar desde el gestor de contraseñas.
3. La bitácora y los pendientes están en el doc del proyecto en Claude (`claude/happyhouse-estado.md`).
