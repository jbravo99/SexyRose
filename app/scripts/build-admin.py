#!/usr/bin/env python3
"""Genera el panel de administración de producción (app/admin-spa/index.html) a partir del MVP.

Es el mismo admin de la demo (mismo diseño y menú) conectado a la API real del servidor
(ADMIN_PATH + /api/…). Lo arma mvp/build.py con HH_TARGET=admin → mvp/build/admin.html.
Sin datos de demo, sin cartel de demostración y con <meta name="robots" content="noindex,nofollow">.

Uso (desde cualquier carpeta):  python3 app/scripts/build-admin.py
Variables opcionales:
  REPO_ROOT  raíz del repo (por defecto: dos niveles arriba de este script)
  ADMIN_OUT  archivo de salida (por defecto: <REPO_ROOT>/app/admin-spa/index.html)
"""
import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(os.environ.get('REPO_ROOT') or pathlib.Path(__file__).resolve().parents[2]).resolve()
OUT = pathlib.Path(os.environ.get('ADMIN_OUT') or ROOT / 'app' / 'admin-spa' / 'index.html')
BUILD = ROOT / 'mvp' / 'build.py'
SRC = ROOT / 'mvp' / 'build' / 'admin.html'


def main() -> int:
    if not BUILD.is_file():
        print(f'error: no encuentro {BUILD}', file=sys.stderr)
        return 1
    env = dict(os.environ, HH_TARGET='admin')
    env.pop('HH_ONLY', None)
    subprocess.run([sys.executable, str(BUILD)], cwd=str(ROOT), check=True, env=env)
    html = SRC.read_text(encoding='utf-8')
    if "window.HH_PROD = 'admin'" not in html or '/* ===== prod-admin.js ===== */' not in html:
        print('error: el build no es el paquete admin (falta HH_PROD o prod-admin.js)', file=sys.stderr)
        return 1
    # Meta propia de la vista previa de Claude: no hace falta en el servidor
    html = re.sub(r'<meta name="claude:[^"]*"[^>]*>\s*', '', html)
    # El servidor pone un nonce en cada <script>: no puede haber manejadores inline ni javascript:
    bad = re.findall(r'<[a-z][^>]*\son[a-z]+\s*=', html, flags=re.I) + re.findall(r'javascript:', html, flags=re.I)
    if bad:
        print(f'error: el admin tiene manejadores inline o javascript: ({len(bad)}): {bad[:3]}', file=sys.stderr)
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding='utf-8')
    print(f'ok admin: {OUT} ({OUT.stat().st_size} bytes)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
