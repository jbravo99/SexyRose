#!/usr/bin/env python3
"""Genera el sitio público de producción a partir del MVP (mvp/build.py con HH_TARGET=sitio → mvp/build/sitio.html).

Salida (la sirve app/routes/spa-sitio.js en las direcciones reales: /, /argentina/…, /perfil/<slug>, /panel/…):
  app/sitio-spa/index.html              cáscara HTML chica (sin JS ni CSS en línea; se pide en cada visita)
  app/sitio-spa/assets/app.<hash>.js    todo el JS del sitio (nombre con hash: se guarda en caché un año)
  app/sitio-spa/assets/app.<hash>.css   todo el CSS del sitio
  app/sitio-spa/assets/i18n.<hash>.js   el diccionario inglés/portugués (un tercio del JS): solo lo baja quien navega
                                        en /en/ o /pt/ (o cambia de idioma); en español no se pide
  app/sitio-spa/assets/fonts/*.woff2    Poppins 500/600/700 y Manrope 400–800 (latin y latin-ext) con hash en el nombre,
                                        copiadas de @fontsource (sin Google Fonts: nada se pide a otro dominio)
  app/sitio-spa/seo-datos.json          plantillas SEO por defecto (mvp/src/seo.js), nombres de lugares (urls.js) y
                                        traducciones cortas: con eso el servidor arma título, canonical, hreflang y
                                        sitemap igual que el SPA (app/lib/seo-sitio.js)

Si encuentra esbuild (variable ESBUILD, o `esbuild` en el PATH) minimiza el JS y el CSS; si no, los deja tal cual.
El servidor los comprime (brotli/gzip) la primera vez que se piden.

Uso (desde cualquier carpeta):  python3 app/scripts/build-sitio.py
Variables opcionales:
  REPO_ROOT   raíz del repo (por defecto: dos niveles arriba de este script)
  SITIO_OUT   archivo HTML de salida (por defecto: <REPO_ROOT>/app/sitio-spa/index.html); los assets van al lado
  ESBUILD     ruta del ejecutable de esbuild (opcional)
  NO_MINIFY=1 no minimizar aunque haya esbuild
  FONTSOURCE_DIR  carpeta con los paquetes @fontsource/poppins y @fontsource/manrope (por defecto se buscan en
                  node_modules/@fontsource del repo, de app/ y de mvp/). Sin ellos el sitio usa las fuentes del sistema.
  REQUIRE_FONTS=1 fallar si no encuentra las fuentes (el Dockerfile lo usa)

Modo demostración (python3 app/scripts/build-sitio.py --demo, o SITIO_DEMO=1; lo llama app/scripts/build-demo.py):
el mismo sitio con perfiles ficticios para /demo/ (lo sirve app/routes/demo-sitio.js). Suma mvp/src/prod-demo.js,
usa direcciones con # (/demo/#/perfil/valentina), los datos de app/scripts/demo_datos.py (estado.<hash>.json e
imágenes abstractas en media/), el cartel "Demostración: perfiles ficticios", noindex y canonical al sitio real.
  DEMO_OUT       archivo HTML de salida (por defecto: <REPO_ROOT>/app/public/demo/index.html); todo va al lado
  DEMO_REAL_URL  dirección del sitio real (por defecto: https://sexyrose.net)
"""
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(os.environ.get('REPO_ROOT') or pathlib.Path(__file__).resolve().parents[2]).resolve()
DEMO = '--demo' in sys.argv[1:] or os.environ.get('SITIO_DEMO') == '1'
if DEMO:
    OUT = pathlib.Path(os.environ.get('DEMO_OUT') or ROOT / 'app' / 'public' / 'demo' / 'index.html')
else:
    OUT = pathlib.Path(os.environ.get('SITIO_OUT') or ROOT / 'app' / 'sitio-spa' / 'index.html')
# Las direcciones de los archivos: /assets/… en el sitio real, /demo/assets/… en la demo
PFX = '/demo/' if DEMO else '/'
REAL_URL = (os.environ.get('DEMO_REAL_URL') or 'https://sexyrose.net').rstrip('/')
BUILD = ROOT / 'mvp' / 'build.py'
SRC = ROOT / 'mvp' / 'build' / 'sitio.html'
# Fuentes propias (antes Google Fonts): (paquete de @fontsource, familia, pesos). Solo latin y latin-ext.
FUENTES = [('poppins', 'Poppins', [500, 600, 700]), ('manrope', 'Manrope', [400, 500, 600, 700, 800])]
SUBSETS = ['latin-ext', 'latin']
# Las dos que se usan apenas carga la página: el cuerpo (Manrope 400) y los títulos (Poppins 600)
PRECARGA = [('manrope', 'latin', 400), ('poppins', 'latin', 600)]


# Demo: cabecera, cartel fijo arriba (en el flujo de la página: el encabezado sticky queda debajo) y su CSS.
# prod-demo.js cambia el texto del cartel al idioma elegido.
DEMO_HEAD = ('<meta name="robots" content="noindex,nofollow">'
             '<link rel="canonical" href="{REAL}/">')
DEMO_BANNER = ('<div id="srDemoBanner" class="sr-demo" role="note" data-noi18n><span data-k="banner">Demostración: perfiles ficticios.</span> '
               '<a href="{REAL}/">Ver el sitio real</a></div>')
DEMO_CSS = ('.sr-demo{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:2px 10px;margin:0;padding:7px 14px;'
            'background:#FF5C8A;color:#15131A;font:600 13px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center}'
            '.sr-demo a{color:#15131A;font-weight:800;text-decoration:underline;white-space:nowrap}'
            '.sr-demo a:focus-visible{outline:2px solid #15131A;outline-offset:2px;border-radius:4px}'
            '.sr-demo-card .btn{justify-content:center}')


def fontsource_dir():
    cands = [os.environ.get('FONTSOURCE_DIR')] if os.environ.get('FONTSOURCE_DIR') else []
    cands += [ROOT / 'node_modules' / '@fontsource', ROOT / 'app' / 'node_modules' / '@fontsource', ROOT / 'mvp' / 'node_modules' / '@fontsource']
    for c in cands:
        c = pathlib.Path(c)
        if all((c / pkg / 'files').is_dir() for pkg, _, _ in FUENTES):
            return c
    return None


def fuentes(fonts_out: pathlib.Path, h):
    """Copia los .woff2 con hash en el nombre y devuelve (css @font-face, [urls para precargar]) o (None, [])."""
    base = fontsource_dir()
    if not base:
        return None, []
    fonts_out.mkdir(parents=True, exist_ok=True)
    css, urls = [], {}
    for pkg, familia, pesos in FUENTES:
        for w in pesos:
            fuente_css = (base / pkg / f'{w}.css').read_text(encoding='utf-8')
            for sub in SUBSETS:
                nombre = f'{pkg}-{sub}-{w}-normal'
                m = re.search(r'/\* ' + re.escape(nombre) + r' \*/\s*@font-face\s*\{[^}]*?unicode-range:\s*([^;]+);', fuente_css)
                if not m:
                    raise SystemExit(f'error: no encuentro el bloque {nombre} en {base / pkg / f"{w}.css"}')
                data = (base / pkg / 'files' / f'{nombre}.woff2').read_bytes()
                dest = f'{pkg}-{sub}-{w}.{hashlib.sha256(data).hexdigest()[:12]}.woff2'
                (fonts_out / dest).write_bytes(data)
                urls[(pkg, sub, w)] = f'{PFX}assets/fonts/{dest}'
                css.append(f"@font-face{{font-family:'{familia}';font-style:normal;font-display:swap;font-weight:{w};"
                           f"src:url({urls[(pkg, sub, w)]}) format('woff2');unicode-range:{m.group(1).strip()}}}")
    return '\n'.join(css), [urls[k] for k in PRECARGA]


def js_literal(src: str, start: int) -> str:
    """Devuelve el literal {…} de JS que empieza en src[start] (respeta comillas y escapes)."""
    depth, i, q = 0, start, None
    while i < len(src):
        c = src[i]
        if q:
            if c == '\\':
                i += 2
                continue
            if c == q:
                q = None
        elif c in '\'"`':
            q = c
        elif c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return src[start:i + 1]
        i += 1
    raise ValueError('literal sin cerrar')


def seo_datos(dic_literal: str) -> dict:
    """Plantillas SEO y nombres de lugares del SPA (evaluados con node) + traducciones cortas del diccionario."""
    src = ROOT / 'mvp' / 'src'
    seo = (src / 'seo.js').read_text(encoding='utf-8')
    urls = (src / 'urls.js').read_text(encoding='utf-8')
    lits = []
    for texto, marca in ((seo, 'HH.SEO_DEFAULTS = '), (urls, 'HH.SEO_PLACE_DEFAULTS = ')):
        i = texto.index(marca) + len(marca)
        lits.append(js_literal(texto, i))
    node = shutil.which('node')
    if not node:
        raise SystemExit('error: hace falta node para generar seo-datos.json')
    code = 'process.stdout.write(JSON.stringify([' + ','.join('(' + x + ')' for x in lits) + ']))'
    r = subprocess.run([node, '-e', code], capture_output=True)
    if r.returncode != 0:
        raise SystemExit('error: node no pudo leer las plantillas SEO: ' + r.stderr.decode('utf-8', 'replace')[:400])
    defaults, lugares = json.loads(r.stdout.decode('utf-8'))
    dic = json.loads(dic_literal)
    corto = {k: v for k, v in dic.items() if len(k) <= 60 and '{' not in k and isinstance(v, list) and len(v) >= 2}
    return {'defaults': defaults, 'lugares': lugares, 'dict': corto}


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
    if DEMO:
        env['HH_SITIO_DEMO'] = '1'
    else:
        env.pop('HH_SITIO_DEMO', None)
    subprocess.run([sys.executable, str(BUILD)], cwd=str(ROOT), check=True, env=env)
    html = SRC.read_text(encoding='utf-8')
    if "window.HH_PROD = 'sitio'" not in html or '/* ===== prod-sitio.js ===== */' not in html or 'data-routing="path"' not in html:
        print('error: el build no es el paquete sitio (falta HH_PROD, prod-sitio.js o data-routing)', file=sys.stderr)
        return 1
    if DEMO != ('/* ===== prod-demo.js ===== */' in html):
        print('error: prod-demo.js tiene que estar solo en la demo', file=sys.stderr)
        return 1
    html = re.sub(r'<meta name="claude:[^"]*"[^>]*>\s*', '', html)
    if DEMO:
        # Direcciones con # (un solo archivo en /demo/), título propio, noindex y canonical al sitio real
        html = html.replace('data-routing="path"', 'data-routing="hash" data-demo="1"', 1)
        html, n = re.subn(r'<title>[^<]*</title>', '<title>SexyRose — Demostración</title>', html, count=1)
        if n != 1:
            print('error: el build del sitio no tiene <title>', file=sys.stderr)
            return 1
        html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">' + DEMO_HEAD.replace('{REAL}', REAL_URL), 1)
        html, n = re.subn(r'<body>', lambda m: m.group(0) + '\n' + DEMO_BANNER.replace('{REAL}', REAL_URL), html, count=1)
        if n != 1:
            print('error: el build del sitio no tiene <body>', file=sys.stderr)
            return 1

    head_end = html.index('</head>')
    head, body = html[:head_end], html[head_end:]
    # CSS: todos los <style> del <head> en un archivo
    css = '\n'.join(re.findall(r'<style>([\s\S]*?)</style>', head))
    head = re.sub(r'<style>[\s\S]*?</style>\s*', '', head)
    # Sin Google Fonts: las fuentes van en /assets/fonts (ver fuentes()); fuera la hoja y los preconnect
    head = re.sub(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com[^"]*">\s*', '', head)
    head = re.sub(r'<link rel="preconnect" href="https://fonts\.(googleapis|gstatic)\.com"[^>]*>\s*', '', head)
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
    dic_literal = m.group(1)
    dic = 'HH.I18N=Object.assign(' + dic_literal + ',HH.I18N||{});HH.I18N_BASE=1;'
    # Mensajes del servidor en en/pt (prod-sitio-errores.js): también van al diccionario, sin pisar lo que ya hay
    m = re.search(r'/\* ===== prod-sitio-errores\.js ===== \*/[\s\S]*?Object\.assign\(HH\.I18N = HH\.I18N \|\| \{\}, (\{[\s\S]*?\})\);\s*\}\)\(\);\s*(?=/\* ===== )', app)
    if not m:
        print('error: no encuentro los mensajes del servidor (prod-sitio-errores.js) en el build', file=sys.stderr)
        return 1
    app = app[:m.start()] + app[m.end():]
    dic += 'HH.I18N=Object.assign(' + m.group(1) + ',HH.I18N);'

    exe = esbuild_bin()

    def h(b: str) -> str:
        return hashlib.sha256(b.encode('utf-8')).hexdigest()[:12]

    dic_min, _ = minify(dic, 'js', exe)
    dic_name = f'i18n.{h(dic_min)}.js'
    assets = OUT.parent / 'assets'
    if assets.exists():
        shutil.rmtree(assets)
    assets.mkdir(parents=True)
    demo_cfg = ''
    if DEMO:
        # Datos ficticios e imágenes de la demo (lo viejo se borra: los nombres llevan hash)
        sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
        import demo_datos
        media = OUT.parent / 'media'
        if media.exists():
            shutil.rmtree(media)
        for viejo in OUT.parent.glob('estado.*.json'):
            viejo.unlink()
        estado = json.dumps(demo_datos.armar(ROOT, media, PFX), ensure_ascii=False, separators=(',', ':'))
        estado_name = f'estado.{h(estado)}.json'
        (OUT.parent / estado_name).write_text(estado, encoding='utf-8')
        demo_cfg = 'window.HH_DEMO=' + json.dumps({'estado': PFX + estado_name, 'real': REAL_URL}) + ';\n'
        css += '\n' + DEMO_CSS
    js = scripts[0].strip() + '\n' + f'window.HH_I18N_SRC="{PFX}assets/{dic_name}";\n' + demo_cfg + app
    css_fuentes, precarga = fuentes(assets / 'fonts', h)
    if css_fuentes is None:
        if os.environ.get('REQUIRE_FONTS') == '1':
            print('error: no encuentro @fontsource/poppins y @fontsource/manrope (FONTSOURCE_DIR)', file=sys.stderr)
            return 1
        print('aviso: sin @fontsource (FONTSOURCE_DIR): el sitio usa las fuentes del sistema', file=sys.stderr)
    else:
        css = css_fuentes + '\n' + css
        if not DEMO:
            # Las páginas informativas del servidor (/terminos, /privacidad…) usan las mismas fuentes propias:
            # server.js cambia su <!--sr:fuentes--> por esta hoja (sin pedir nada a otro dominio).
            (assets / f'fuentes.{h(css_fuentes)}.css').write_text(css_fuentes, encoding='utf-8')
    js_min, ok_js = minify(js, 'js', exe)
    css_min, ok_css = minify(css, 'css', exe)
    for code, nombre in ((js_min, 'JS'), (css_min, 'CSS')):
        bad = re.findall(r'javascript:', code if nombre == 'CSS' else '', flags=re.I)
        if bad:
            print(f'error: {nombre} con javascript:', file=sys.stderr)
            return 1

    js_name = f'app.{h(js_min)}.js'
    css_name = f'app.{h(css_min)}.css'
    (assets / js_name).write_text(js_min, encoding='utf-8')
    (assets / css_name).write_text(css_min, encoding='utf-8')
    (assets / dic_name).write_text(dic_min, encoding='utf-8')

    if DEMO:
        # Sin SEO del servidor: la demo no se indexa. El estado es un archivo más (con hash).
        links = (
            '<!--SR:DEMO-->\n'
            f'<link rel="preload" href="{PFX}assets/{js_name}" as="script">\n'
            f'<link rel="preload" href="{PFX}{estado_name}" as="fetch" crossorigin="anonymous">\n'
        )
    else:
        links = (
            f'<!--SR:SEO-->\n'
            f'<!--SR:PRECONNECT-->\n'
            f'<!--SR:I18N /assets/{dic_name}-->\n'
            f'<link rel="preload" href="/assets/{js_name}" as="script">\n'
            f'<link rel="preload" href="/api/sitio/estado" as="fetch" crossorigin="anonymous">\n'
        )
    links += (''.join(f'<link rel="preload" href="{u}" as="font" type="font/woff2" crossorigin>\n' for u in precarga)
              + f'<link rel="stylesheet" href="{PFX}assets/{css_name}">\n')
    shell = head + links + body.replace('</body>', f'<script src="{PFX}assets/{js_name}" defer></script>\n</body>', 1)
    bad = re.findall(r'<[a-z][^>]*\son[a-z]+\s*=', shell, flags=re.I) + re.findall(r'javascript:', shell, flags=re.I) + re.findall(r'<script>', shell)
    if bad:
        print(f'error: la cáscara tiene JS en línea o manejadores ({len(bad)}): {bad[:3]}', file=sys.stderr)
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(shell, encoding='utf-8')
    if not DEMO:
        (OUT.parent / 'seo-datos.json').write_text(json.dumps(seo_datos(dic_literal), ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'ok {"demo" if DEMO else "sitio"}: {OUT} ({OUT.stat().st_size} bytes) + assets/{js_name} ({len(js_min.encode())} bytes{", minimizado" if ok_js else ""}) '
          f'+ assets/{css_name} ({len(css_min.encode())} bytes{", minimizado" if ok_css else ""}) '
          f'+ assets/{dic_name} ({len(dic_min.encode())} bytes)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
