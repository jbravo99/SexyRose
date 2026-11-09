#!/usr/bin/env python3
"""Concatena los módulos de src/ en build/index.html (single-file, sin doctype: el Artifact tool agrega el esqueleto)."""
import pathlib, sys, os
SRC = pathlib.Path(__file__).parent / 'src'
ONLY = os.environ.get('HH_ONLY')  # p. ej. HH_ONLY=views-public.js → build aislado de ese módulo
OUT = pathlib.Path(__file__).parent / 'build' / ('index.html' if not ONLY else 'only-' + ONLY.replace('.js', '') + '.html')
JS_ORDER = ['core.js', 'i18n-dict.js', 'i18n.js', 'urls.js', 'geo.js', 'bookings.js', 'chat.js', 'activity.js', 'data.js', 'views-public.js', 'views-dashboard.js', 'views-client.js', 'views-admin.js', 'stats.js', 'ops.js', 'seo.js', 'interests.js', 'billing.js', 'agegate.js', 'highlights.js', 'boot.js']
if ONLY:
    JS_ORDER = ['core.js', 'i18n-dict.js', 'i18n.js', 'urls.js', 'geo.js', 'bookings.js', 'chat.js', 'activity.js', 'data.js', ONLY, 'stats.js', 'ops.js', 'seo.js', 'interests.js', 'billing.js', 'agegate.js', 'highlights.js', 'boot.js']
# HH_TARGET=admin → build/admin.html: el panel de administración de producción (datos reales por la API,
# sin datos de demo). Sin HH_TARGET, la salida (index.html y full.html) no cambia.
TARGET = os.environ.get('HH_TARGET')
if TARGET == 'admin':
    JS_ORDER = [n for n in JS_ORDER if n != 'boot.js'] + ['prod-admin.js', 'boot.js']
elif TARGET:
    sys.exit('HH_TARGET desconocido: ' + TARGET)
parts = []
parts.append((SRC / 'head.html').read_text())
parts.append('<style>\n' + (SRC / 'app.css').read_text() + '\n</style>')
parts.append((SRC / 'shell.html').read_text())
js = []
for name in JS_ORDER:
    p = SRC / name
    if p.exists():
        js.append(f'/* ===== {name} ===== */\n' + p.read_text())
    else:
        print('aviso: falta', name, file=sys.stderr)
parts.append('<script>\n' + '\n'.join(js) + '\n</script>')
if TARGET == 'admin':
    import re
    head = re.sub(r'<title>[^<]*</title>\s*', '', parts[0])
    ADMIN = pathlib.Path(__file__).parent / 'build' / 'admin.html'
    ADMIN.parent.mkdir(exist_ok=True)
    ADMIN.write_text('<!doctype html><html lang="es-AR" data-prod="admin"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="same-origin"><title>SexyRose — Admin</title>\n'
                     + head + '\n<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>\n'
                     + parts[1] + '\n</head><body>\n' + parts[2] + '\n<script>window.HH_PROD = \'admin\';</script>\n' + parts[3] + '\n</body></html>')
    print('ok', ADMIN, ADMIN.stat().st_size, 'bytes')
    sys.exit(0)
OUT.parent.mkdir(exist_ok=True)
OUT.write_text('\n'.join(parts))
# Página completa para pruebas locales (con doctype/head), imita el esqueleto del viewer
FULL = OUT.parent / ('full.html' if not ONLY else 'full-' + ONLY.replace('.js', '') + '.html')
FULL.write_text('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>\n' + OUT.read_text() + '\n</body></html>')
print('ok', OUT, OUT.stat().st_size, 'bytes')
