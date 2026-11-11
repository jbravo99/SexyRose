#!/usr/bin/env python3
"""Genera la demostración pública (/demo/) en app/public/demo/.

Desde el 11/11/2026 la demo es el MISMO sitio que sexyrose.net (build del SPA en modo "sitio") con perfiles ficticios:
así cada cambio del sitio real se ve también en la demo (la del QR de los folletos). La arma
app/scripts/build-sitio.py --demo (ver ahí qué genera); este script solo la llama, para que el Dockerfile y
`npm run build:demo` sigan igual. La sirve app/routes/demo-sitio.js.

Uso (desde cualquier carpeta):  python3 app/scripts/build-demo.py
Variables opcionales (las mismas de build-sitio.py):
  REPO_ROOT       raíz del repo (por defecto: dos niveles arriba de este script)
  DEMO_OUT        archivo de salida (por defecto: <REPO_ROOT>/app/public/demo/index.html); el resto va al lado
  DEMO_REAL_URL   dirección del sitio real para el cartel y los botones (por defecto: https://sexyrose.net)
  ESBUILD, NO_MINIFY, FONTSOURCE_DIR, REQUIRE_FONTS   como en build-sitio.py
"""
import os
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent


def main() -> int:
    env = dict(os.environ, SITIO_DEMO='1')
    r = subprocess.run([sys.executable, str(HERE / 'build-sitio.py'), '--demo'], env=env)
    return r.returncode


if __name__ == '__main__':
    sys.exit(main())
