#!/usr/bin/env python3
"""Genera el sitio público de producción a partir del MVP (mvp/build.py con HH_TARGET=sitio → mvp/build/sitio.html).

Salida (la sirve app/routes/spa-sitio.js en las direcciones reales: /, /argentina/…, /perfil/<slug>, /panel/…):
  app/sitio-spa/index.html              cáscara HTML chica (sin JS ni CSS en línea; se pide en cada visita)
  app/sitio-spa/assets/app.<hash>.js    todo el JS del sitio (nombre con hash: se guarda en caché un año)
  app/sitio-spa/assets/app.<hash>.css   todo el CSS del sitio
  app/sitio-spa/assets/i18n.<hash>.js   el diccionario inglés/portugués (un tercio del JS): solo lo baja quien navega
                                        en /en/ o /pt/ (o cambia de idioma); en español no se pide

Si encuentra esbuild (variable ESBUILD, o `esbuild` en el PATH) minimiza el JS y el CSS; si no, los deja tal cual.
El servidor los comprime (brotli/gzip) la primera vez que se piden.

Uso (desde cualquier carpeta):  python3 app/scripts/build-sitio.py
Variables opcionales:
  REPO_ROOT   raíz del repo (por defecto: dos niveles arriba de este script)
  SITIO_OUT   archivo HTML de salida (por defecto: <REPO_ROOT>/app/sitio-spa/index.html); los assets van al lado
  ESBUILD     ruta del ejecutable de esbuild (opcional)
  NO_MINIFY=1 no minimizar aunque haya esbuild
"""
import hashlib
import os
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(os.environ.get('REPO_ROOT') or pathlib.Path(__file__).resolve().parents[2]).resolve()
OUT = pathlib.Path(os.environ.get('SITIO_OUT') or ROOT / 'app' / 'sitio-spa' / 'index.html')
BUILD = ROOT / 'mvp' / 'build.py'
SRC = ROOT / 'mvp' / 'build' / 'sitio.html'
FONTS = 'https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap'


def esbuild_bin():
    if os.environ.get('NO_MINIFY') == '1':
        return None
    cand = os.environ.get('ESBUILD') or shutil.which('esbuild')
    return cand if cand and os.path.exists(cand) else None


def minify(code: str, loader: str, exe):
    if not exe:
        return code, False
    args = [exe, f'--loader={loader}', '--minify', '--legal-comments=none', '--charset=utf8']
    if loader == 'js':
        args.append('--target=es2019')
    r = subprocess.run(args, input=code.encode('utf-8'), capture_output=True)
    if r.returncode != 0:
        print('aviso: esbuild falló, queda sin minimizar:', r.stderr.decode('utf-8', 'replace')[:400], file=sys.stderr)
        return code, False
    return r.stdout.decode('utf-8'), True


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

    head_end = html.index('</head>')
    head, body = html[:head_end], html[head_end:]
    # CSS: todos los <style> del <head> en un archivo
    css = '\n'.join(re.findall(r'<style>([\s\S]*?)</style>', head))
    head = re.sub(r'<style>[\s\S]*?</style>\s*', '', head)
    # Fuentes de Google: sin bloquear el primer dibujo (se cargan con media=print y el JS las activa)
    head = re.sub(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com[^"]*">\s*', '', head)
    # JS: los <script> del <body> en un archivo (primero el que define HH_PROD)
    scripts = re.findall(r'<script>([\s\S]*?)</script>', body)
    if len(scripts) != 2 or 'HH_PROD' not in scripts[0]:
        print(f'error: esperaba 2 <script> en el body (HH_PROD y la app), hay {len(scripts)}', file=sys.stderr)
        return 1
    body = re.sub(r'<script>[\s\S]*?</script>\s*', '', body)
    app = scripts[1]
    # Diccionario en/pt aparte. Al cargarse se combina con lo que ya agregaron otros módulos (que tienen prioridad).
    m = re.search(r'/\* ===== i18n-dict\.js ===== \*/[\s\S]*?HH\.I18N = (\{[\s\S]*?\});\s*(?=/\* ===== )', app)
    if not m:
        print('error: no encuentro el diccionario (i18n-dict.js) en el build', file=sys.stderr)
        return 1
    app = app[:m.start()] + app[m.end():]
    dic = 'HH.I18N=Object.assign(' + m.group(1) + ',HH.I18N||{});HH.I18N_BASE=1;'

    exe = esbuild_bin()

    def h(b: str) -> str:
        return hashlib.sha256(b.encode('utf-8')).hexdigest()[:12]

    dic_min, _ = minify(dic, 'js', exe)
    dic_name = f'i18n.{h(dic_min)}.js'
    js = scripts[0].strip() + '\n' + f'window.HH_I18N_SRC="/assets/{dic_name}";\n' + app
    js = "(function(){var l=document.querySelector('link[data-fonts]');if(l)l.media='all';})();\n" + js
    js_min, ok_js = minify(js, 'js', exe)
    css_min, ok_css = minify(css, 'css', exe)
    for code, nombre in ((js_min, 'JS'), (css_min, 'CSS')):
        bad = re.findall(r'javascript:', code if nombre == 'CSS' else '', flags=re.I)
        if bad:
            print(f'error: {nombre} con javascript:', file=sys.stderr)
            return 1

    assets = OUT.parent / 'assets'
    if assets.exists():
        shutil.rmtree(assets)
    assets.mkdir(parents=True)
    js_name = f'app.{h(js_min)}.js'
    css_name = f'app.{h(css_min)}.css'
    (assets / js_name).write_text(js_min, encoding='utf-8')
    (assets / css_name).write_text(css_min, encoding='utf-8')
    (assets / dic_name).write_text(dic_min, encoding='utf-8')

    links = (
        f'<!--SR:PRECONNECT-->\n'
        f'<!--SR:I18N /assets/{dic_name}-->\n'
        f'<link rel="preload" href="/assets/{js_name}" as="script">\n'
        f'<link rel="preload" href="/api/sitio/estado" as="fetch" crossorigin="anonymous">\n'
        f'<link rel="stylesheet" href="/assets/{css_name}">\n'
        f'<link rel="stylesheet" href="{FONTS}" media="print" data-fonts>\n'
    )
    shell = head + links + body.replace('</body>', f'<script src="/assets/{js_name}" defer></script>\n</body>', 1)
    bad = re.findall(r'<[a-z][^>]*\son[a-z]+\s*=', shell, flags=re.I) + re.findall(r'javascript:', shell, flags=re.I) + re.findall(r'<script>', shell)
    if bad:
        print(f'error: la cáscara tiene JS en línea o manejadores ({len(bad)}): {bad[:3]}', file=sys.stderr)
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(shell, encoding='utf-8')
    print(f'ok sitio: {OUT} ({OUT.stat().st_size} bytes) + assets/{js_name} ({len(js_min.encode())} bytes{", minimizado" if ok_js else ""}) '
          f'+ assets/{css_name} ({len(css_min.encode())} bytes{", minimizado" if ok_css else ""}) '
          f'+ assets/{dic_name} ({len(dic_min.encode())} bytes)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
