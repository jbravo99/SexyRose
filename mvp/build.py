#!/usr/bin/env python3
"""Concatena los módulos de src/ en build/index.html (single-file, sin doctype: el Artifact tool agrega el esqueleto)."""
import pathlib, sys, os
SRC = pathlib.Path(__file__).parent / 'src'
ONLY = os.environ.get('HH_ONLY')  # p. ej. HH_ONLY=views-public.js → build aislado de ese módulo
OUT = pathlib.Path(__file__).parent / 'build' / ('index.html' if not ONLY else 'only-' + ONLY.replace('.js', '') + '.html')
JS_ORDER = ['core.js', 'i18n-dict.js', 'i18n.js', 'urls.js', 'geo.js', 'ubicaciones.js', 'radar.js', 'bookings.js', 'chat.js', 'activity.js', 'data.js', 'views-public.js', 'views-dashboard.js', 'views-client.js', 'views-admin.js', 'stats.js', 'ops.js', 'seo.js', 'interests.js', 'billing.js', 'agegate.js', 'highlights.js', 'boot.js']
if ONLY:
    JS_ORDER = ['core.js', 'i18n-dict.js', 'i18n.js', 'urls.js', 'geo.js', 'ubicaciones.js', 'radar.js', 'bookings.js', 'chat.js', 'activity.js', 'data.js', ONLY, 'stats.js', 'ops.js', 'seo.js', 'interests.js', 'billing.js', 'agegate.js', 'highlights.js', 'boot.js']
# HH_TARGET=admin → build/admin.html: el panel de administración de producción (datos reales por la API,
# sin datos de demo). Sin HH_TARGET, la salida (index.html y full.html) no cambia.
TARGET = os.environ.get('HH_TARGET')
if TARGET == 'admin':
    JS_ORDER = [n for n in JS_ORDER if n != 'boot.js'] + ['prod-admin.js', 'prod-admin-mod.js', 'prod-admin-seo.js', 'prod-admin-integraciones.js', 'boot.js']
elif TARGET == 'sitio':
    # HH_TARGET=sitio → build/sitio.html: el sitio público real (datos de /api/sitio/estado, panel de la acompañante
    # contra /api/cuenta), con direcciones reales (data-routing="path"). Lo sirve app/routes/spa-sitio.js.
    # Sin las vistas que el sitio real no usa (panel y admin de la demo, cuenta de clientes, asistente simulado):
    # prod-sitio.js trae su propio panel. Todos sus usos desde otros módulos están protegidos (if (HH.adminTabs) …).
    # Sin chat.js: el chat en vivo no existe en la web (decisión de Juan, 12/11/2026).
    # Sin bookings.js (reservas de salidas) ni activity.js (actividad de cuentas de la demo): el sitio no los usa
    # (prod-sitio.js apaga HH.canTakeBookings) y sus textos describían salidas (12/11/2026).
    SIN_SITIO = {'views-dashboard.js', 'views-admin.js', 'views-client.js', 'ops.js', 'chat.js', 'bookings.js', 'activity.js'}
    JS_ORDER = [n for n in JS_ORDER if n != 'boot.js' and n not in SIN_SITIO] + ['prod-sitio-errores.js', 'prod-sitio.js', 'prod-sitio-seo.js', 'prod-shorts.js', 'prod-contenido.js', 'prod-clientes.js', 'prod-mapa.js', 'boot.js']
    # La semilla del prototipo (data.js: perfiles, mensajes y compras de ejemplo) no viaja al sitio: data-sitio.js
    # da la misma forma vacía (el sitio solo muestra datos reales o el estado ficticio de la demo).
    JS_ORDER = ['data-sitio.js' if n == 'data.js' else n for n in JS_ORDER]
    # HH_SITIO_DEMO=1 → el mismo sitio en modo demostración (/demo/, perfiles ficticios): suma prod-demo.js.
    # Lo usa app/scripts/build-sitio.py --demo (no cambia nada del sitio real).
    if os.environ.get('HH_SITIO_DEMO') == '1':
        JS_ORDER.insert(JS_ORDER.index('boot.js'), 'prod-demo.js')
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
        txt = p.read_text()
        if TARGET == 'sitio' and name == 'core.js':
            # El sitio no muestra actividades (12/11/2026): la lista por defecto del prototipo no viaja al navegador
            import re as _re
            txt, n = _re.subn(r'HH\.DEFAULT_ACTIVITIES = \[[\s\S]*?\n  \];', 'HH.DEFAULT_ACTIVITIES = [];', txt, count=1)
            if n != 1:
                sys.exit('error: no encuentro HH.DEFAULT_ACTIVITIES en core.js')
            txt, n = _re.subn(r"HH\.ACTIVITY_ICONS = \[[^\]]*\];", 'HH.ACTIVITY_ICONS = [];', txt, count=1)  # solo para el admin
            if n != 1:
                sys.exit('error: no encuentro HH.ACTIVITY_ICONS en core.js')
        js.append(f'/* ===== {name} ===== */\n' + txt)
    else:
        print('aviso: falta', name, file=sys.stderr)
parts.append('<script>\n' + '\n'.join(js) + '\n</script>')
if TARGET == 'admin':
    import re
    head = re.sub(r'<title>[^<]*</title>\s*', '', parts[0])
    ADMIN = pathlib.Path(__file__).parent / 'build' / 'admin.html'
    ADMIN.parent.mkdir(exist_ok=True)
    ADMIN.write_text('<!doctype html><html lang="es-AR" data-prod="admin"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="same-origin"><title>SexyRose — Admin</title><link rel="icon" href="/favicon.svg" type="image/svg+xml">\n'
                     + head + '\n<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>\n'
                     + parts[1] + '\n</head><body>\n' + parts[2] + '\n<script>window.HH_PROD = \'admin\';</script>\n' + parts[3] + '\n</body></html>')
    print('ok', ADMIN, ADMIN.stat().st_size, 'bytes')
    sys.exit(0)
if TARGET == 'sitio':
    import re
    head = re.sub(r'<title>[^<]*</title>\s*', '', parts[0])
    head = re.sub(r'<meta name="claude:[^>]*>\s*', '', head)
    SITIO = pathlib.Path(__file__).parent / 'build' / 'sitio.html'
    SITIO.parent.mkdir(exist_ok=True)
    SITIO.write_text('<!doctype html><html lang="es-AR" data-prod="sitio" data-routing="path"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="referrer" content="strict-origin-when-cross-origin"><title>SexyRose — Acompañantes en Argentina</title><meta name="description" content="Avisos de acompañantes en tu ciudad. Contacto directo con cada anunciante por WhatsApp o Telegram."><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/site.webmanifest"><meta name="theme-color" content="#15131A">\n'
                     + head + '\n<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>\n'
                     + parts[1] + '\n<style>\n' + (SRC / 'sitio.css').read_text() + '\n</style>\n</head><body>\n' + parts[2] + '\n<script>window.HH_PROD = \'sitio\';</script>\n' + parts[3] + '\n</body></html>')
    print('ok', SITIO, SITIO.stat().st_size, 'bytes')
    sys.exit(0)
OUT.parent.mkdir(exist_ok=True)
OUT.write_text('\n'.join(parts))
# Página completa para pruebas locales (con doctype/head), imita el esqueleto del viewer
FULL = OUT.parent / ('full.html' if not ONLY else 'full-' + ONLY.replace('.js', '') + '.html')
FULL.write_text('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>\n' + OUT.read_text() + '\n</body></html>')
print('ok', OUT, OUT.stat().st_size, 'bytes')
