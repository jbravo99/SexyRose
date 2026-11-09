#!/usr/bin/env python3
"""Genera el sitio público de producción (app/sitio-spa/index.html) a partir del MVP.

Es el mismo sitio de la demo (mismo diseño) con datos reales de la API (/api/sitio/estado) y el panel
de las acompañantes contra /api/cuenta. Lo arma mvp/build.py con HH_TARGET=sitio → mvp/build/sitio.html.
Lo sirve app/routes/spa-sitio.js en las direcciones reales (/, /argentina/…, /perfil/<slug>, /panel/…).

Uso (desde cualquier carpeta):  python3 app/scripts/build-sitio.py
Variables opcionales:
  REPO_ROOT  raíz del repo (por defecto: dos niveles arriba de este script)
  SITIO_OUT  archivo de salida (por defecto: <REPO_ROOT>/app/sitio-spa/index.html)
"""
import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(os.environ.get('REPO_ROOT') or pathlib.Path(__file__).resolve().parents[2]).resolve()
OUT = pathlib.Path(os.environ.get('SITIO_OUT') or ROOT / 'app' / 'sitio-spa' / 'index.html')
BUILD = ROOT / 'mvp' / 'build.py'
SRC = ROOT / 'mvp' / 'build' / 'sitio.html'


def main() -> int:
    if not BUILD.is_file():
        print(f'error: no encuentro {BUILD}', file=sys.stderr)
        return 1
    env = dict(os.environ, HH_TARGET='sitio')
    env.pop('HH_ONLY', None)
    subprocess.run([sys.executable, str(BUILD)], cwd=str(ROOT), check=True, env=env)
    html = SRC.read_text(encoding='utf-8')
    if "window.HH_PROD = 'sitio'" not in html or '/* ===== prod-sitio.js ===== */' not in html or 'data-routing="path"' not in html:
        print('error: el build no es el paquete sitio (falta HH_PROD, prod-sitio.js o data-routing)', file=sys.stderr)
        return 1
    html = re.sub(r'<meta name="claude:[^"]*"[^>]*>\s*', '', html)
    # El servidor pone un nonce en cada <script>: no puede haber manejadores inline ni javascript:
    bad = re.findall(r'<[a-z][^>]*\son[a-z]+\s*=', html, flags=re.I) + re.findall(r'javascript:', html, flags=re.I)
    if bad:
        print(f'error: el sitio tiene manejadores inline o javascript: ({len(bad)}): {bad[:3]}', file=sys.stderr)
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding='utf-8')
    print(f'ok sitio: {OUT} ({OUT.stat().st_size} bytes)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
