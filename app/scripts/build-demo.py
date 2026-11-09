#!/usr/bin/env python3
"""Genera app/public/demo/index.html a partir del MVP (mvp/build.py -> mvp/build/full.html).

Inyecta un cartel fijo de demostración, <meta name="robots" content="noindex,nofollow"> y el título.
Uso (desde cualquier carpeta):  python3 app/scripts/build-demo.py
Variables opcionales:
  REPO_ROOT  raíz del repo (por defecto: dos niveles arriba de este script)
  DEMO_OUT   archivo de salida (por defecto: <REPO_ROOT>/app/public/demo/index.html)
"""
import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(os.environ.get('REPO_ROOT') or pathlib.Path(__file__).resolve().parents[2]).resolve()
OUT = pathlib.Path(os.environ.get('DEMO_OUT') or ROOT / 'app' / 'public' / 'demo' / 'index.html')
BUILD = ROOT / 'mvp' / 'build.py'
FULL = ROOT / 'mvp' / 'build' / 'full.html'

BANNER_TEXT = 'Demostración: perfiles ficticios. El sitio abre pronto.'
BANNER = '''<style id="sr-demo-banner-css">
:root{--sr-demo-h:34px}
@media (max-width:600px){:root{--sr-demo-h:46px}}
@media (max-width:359px){:root{--sr-demo-h:62px}}
#sr-demo-banner{position:fixed;top:0;left:0;right:0;z-index:2147483000;box-sizing:border-box;height:var(--sr-demo-h);
  display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:2px 12px;padding:4px 12px;margin:0;
  background:#FF5C8A;color:#15131A;font:600 13px/1.25 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;
  box-shadow:0 2px 8px rgba(0,0,0,.35)}
#sr-demo-banner a{color:#15131A;text-decoration:underline;font-weight:800;white-space:nowrap}
@media (max-width:600px){#sr-demo-banner{font-size:12px}}
html body{padding-top:var(--sr-demo-h)!important}
html body .app-header{top:var(--sr-demo-h)!important}
html body .dash-side{top:calc(var(--header-h) + 16px + var(--sr-demo-h))!important}
html body .dash-tabs{top:calc(var(--header-h) + var(--sr-demo-h))!important}
html body .modal-root,html body .story-root,html body .lb-root{top:var(--sr-demo-h)!important}
</style>
<div id="sr-demo-banner" role="note" aria-label="Aviso de demostración"><span>''' + BANNER_TEXT + '''</span><a href="/">Volver a sexyrose.net</a></div>
'''
HEAD_EXTRA = '<meta name="robots" content="noindex,nofollow">\n<title>SexyRose — Demostración</title>\n'


def main() -> int:
    if not BUILD.is_file():
        print(f'error: no encuentro {BUILD}', file=sys.stderr)
        return 1
    subprocess.run([sys.executable, str(BUILD)], cwd=str(ROOT), check=True)
    html = FULL.read_text(encoding='utf-8')

    # Un solo <title>: se quitan los del MVP y se agrega el de la demo en <head>.
    # Solo en el marcado anterior al primer <script> (el JS del MVP tiene <title> dentro de SVG).
    cut = html.find('<script')
    cut = len(html) if cut < 0 else cut
    html = re.sub(r'<title>[^<]*</title>\s*', '', html[:cut], flags=re.I) + html[cut:]
    html, n_head = re.subn(r'<head[^>]*>', lambda m: m.group(0) + HEAD_EXTRA, html, count=1, flags=re.I)
    html, n_body = re.subn(r'<body[^>]*>', lambda m: m.group(0) + '\n' + BANNER, html, count=1, flags=re.I)
    if n_head != 1 or n_body != 1:
        print('error: full.html no tiene <head> o <body> como se esperaba', file=sys.stderr)
        return 1
    if '<html>' in html:
        html = html.replace('<html>', '<html lang="es-AR">', 1)

    # El SEO del MVP pone <meta name="robots" content="index,follow"> al navegar: en la demo siempre noindex.
    html, n_rob = re.subn(r"setMeta\('name', 'robots', m\.robots\)", "setMeta('name', 'robots', 'noindex,nofollow')", html)
    if n_rob == 0:
        print('aviso: no encontré setMeta(robots) en el MVP; la demo depende solo de X-Robots-Tag', file=sys.stderr)
    # Enlace "Denunciar" en el pie de la demo (el contrato lo pide en todas las páginas).
    ayuda = '<a href="#inicio" data-go="#inicio">Ayuda</a>'
    if ayuda in html:
        html = html.replace(ayuda, ayuda + '<a href="/denunciar">Denunciar</a>')
    else:
        print('aviso: no encontré el pie del MVP para agregar "Denunciar"', file=sys.stderr)

    # Sin panel de administración en la demo (09/11/2026): se bloquea el ingreso con la cuenta admin,
    # la ruta #admin y se oculta el botón de esa cuenta en las listas de cuentas demo.
    sin_admin = r"""/* ===== demo-sin-admin (build-demo.py) ===== */
(function () {
  var aviso = 'El panel de administración no está disponible en la demostración.';
  var esAdmin = function (u) { return !!u && u.role === 'admin'; };
  var loginOrig = HH.login;
  HH.login = function (userId) {
    if (esAdmin(HH.userById(userId))) { HH.toast(aviso, { type: 'warn' }); return false; }
    return loginOrig.apply(this, arguments);
  };
  var reqOrig = HH.requireRole;
  HH.requireRole = function (role) {
    if (role === 'admin') { HH.toast(aviso, { type: 'warn' }); HH.go('#inicio'); return false; }
    return reqOrig.apply(this, arguments);
  };
  var limpiar = function () {
    try {
      if (HH.session && (HH.session.role === 'admin' || esAdmin(HH.me()))) {
        HH.session = null; HH.save(); HH.renderShell(); HH.go('#inicio');
      }
    } catch (e) {}
  };
  window.addEventListener('DOMContentLoaded', limpiar);
  window.addEventListener('load', limpiar);
})();
"""
    marca_boot = '/* ===== boot.js ===== */'
    if marca_boot not in html:
        print('error: no encontré boot.js en el MVP; no puedo bloquear el admin de la demo', file=sys.stderr)
        sys.exit(1)
    html = html.replace(marca_boot, sin_admin + marca_boot, 1)
    html = html.replace('</head>', '<style>[data-id="u_admin"]{display:none!important}</style></head>', 1)

    # Única casilla del sitio desde el 08/11/2026: el MVP menciona ayuda@ en un aviso.
    html = html.replace('ayuda@sexyrose.net', 'contacto@sexyrose.net')

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding='utf-8')
    print(f'ok demo: {OUT} ({OUT.stat().st_size} bytes)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
