"""Datos de la demostración (/demo/): arma el "estado" ficticio (misma forma que GET /api/sitio/estado) y las imágenes.

- Perfiles: app/scripts/demo/perfiles.json (ficticios, basados en la semilla del MVP, en ciudades de Argentina).
- Ubicaciones, salidas, intereses, precios y Destacado: las semillas de la base (app/db/010-cuentas.sql y
  060-creditos.sql), así la demo usa los mismos catálogos que el sitio real recién instalado.
- Imágenes: SVG abstractos (degradé + rosa de línea), sin personas. Se nombran por su contenido (caché de un año).
- "ahora" es fijo (el build es reproducible); el navegador corre todas las fechas a la hora de la visita (prod-demo.js).

Lo usa app/scripts/build-sitio.py --demo. Se puede probar solo: python3 app/scripts/demo_datos.py → imprime el estado.
"""
import hashlib
import json
import pathlib
import re
from datetime import datetime, timedelta, timezone

AHORA = datetime(2026, 11, 15, 12, 0, 0, tzinfo=timezone.utc)


def _iso(d: datetime) -> str:
    return d.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')


def _sql_valores(sql: str, tabla: str):
    """Filas de los INSERT INTO <tabla> (...) VALUES (...), (...) del archivo (strings, NULL, números, ::jsonb)."""
    filas = []
    for m in re.finditer(r'INSERT INTO ' + re.escape(tabla) + r' \(([^)]*)\) VALUES([\s\S]*?)ON CONFLICT', sql):
        cols = [c.strip() for c in m.group(1).split(',')]
        cuerpo = m.group(2)
        i, n = 0, len(cuerpo)
        while i < n:
            if cuerpo[i] == '-' and cuerpo[i:i + 2] == '--':  # comentario hasta fin de línea
                i = cuerpo.find('\n', i)
                i = n if i < 0 else i
                continue
            if cuerpo[i] != '(':
                i += 1
                continue
            i += 1
            vals, tok = [], None
            while i < n and cuerpo[i] != ')':
                c = cuerpo[i]
                if c == "'":
                    j, s = i + 1, []
                    while True:
                        if cuerpo[j] == "'" and cuerpo[j + 1:j + 2] == "'":
                            s.append("'"); j += 2
                        elif cuerpo[j] == "'":
                            break
                        else:
                            s.append(cuerpo[j]); j += 1
                    tok = ''.join(s); i = j + 1
                    if cuerpo.startswith('::jsonb', i):
                        tok = json.loads(tok); i += len('::jsonb')
                    vals.append(tok)
                elif c in ' \n\t,':
                    i += 1
                else:
                    m2 = re.match(r'NULL|TRUE|FALSE|-?\d+(?:\.\d+)?', cuerpo[i:])
                    if not m2:
                        raise SystemExit(f'error: no entiendo la semilla de {tabla} cerca de: {cuerpo[i:i + 40]!r}')
                    t = m2.group(0)
                    vals.append(None if t == 'NULL' else True if t == 'TRUE' else False if t == 'FALSE' else (float(t) if '.' in t else int(t)))
                    i += len(t)
            i += 1
            filas.append(dict(zip(cols, vals)))
    return filas


def _slug(s: str) -> str:
    import unicodedata
    s = unicodedata.normalize('NFD', s or '')
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


# Rosa de línea (sin personas): pétalos, tallo y una hoja
ROSA = ('<path d="M0-46C25-46 38-26 33-6C29 14 9 23-7 17C-21 11-21-7-9-14C3-21 14-11 11 0"/>'
        '<path d="M-38-12C-50 22-23 50 0 50C23 50 50 22 38-12"/><path d="M-24-34C-40-28-44-14-38-12M24-34C40-28 44-14 38-12"/>'
        '<path d="M0 50V128"/><path d="M0 96C18 80 38 84 46 92C34 108 14 108 0 96Z"/>')


def svg(tono: int, variante: int, ancho: int, alto: int) -> str:
    # Paleta de la marca: violeta → rosa → rojo (290° a 370°), cada perfil con su tono
    h1 = (290 + (tono % 80)) % 360
    d = 24 + (variante % 3) * 8
    h2, hm = (h1 + d) % 360, (h1 + d // 2) % 360
    v = variante % 5
    # Círculos de luz y la rosa en lugares distintos según la variante
    luces = [((0.22, 0.25), 0.55), ((0.8, 0.3), 0.45), ((0.5, 0.85), 0.6), ((0.15, 0.75), 0.4), ((0.85, 0.8), 0.5)]
    circ = ''.join(
        f'<circle cx="{ancho * x:.0f}" cy="{alto * y:.0f}" r="{min(ancho, alto) * r:.0f}" fill="url(#l)"/>'
        for (x, y), r in (luces[(v + k) % 5] for k in range(3))
    )
    esc_rosa = min(ancho, alto) / 260
    rx, ry = [(0.5, 0.45), (0.62, 0.42), (0.4, 0.5), (0.55, 0.38), (0.48, 0.52)][v]
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {ancho} {alto}" width="{ancho}" height="{alto}">'
        f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0" stop-color="hsl({h1},45%,22%)"/><stop offset=".55" stop-color="hsl({hm},55%,40%)"/>'
        f'<stop offset="1" stop-color="hsl({h2},65%,58%)"/></linearGradient>'
        f'<radialGradient id="l"><stop offset="0" stop-color="#fff" stop-opacity=".32"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>'
        f'<rect width="{ancho}" height="{alto}" fill="url(#g)"/>{circ}'
        f'<g transform="translate({ancho * rx:.0f} {alto * ry:.0f}) scale({esc_rosa:.3f})" fill="none" stroke="#fff" '
        f'stroke-opacity=".34" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">{ROSA}</g></svg>'
    )


def armar(root: pathlib.Path, media_out: pathlib.Path = None, prefijo: str = '/demo/'):
    """Devuelve el estado (dict). Si media_out no es None, escribe allí los SVG (media/<hash>.svg)."""
    db = root / 'app' / 'db'
    sql010 = (db / '010-cuentas.sql').read_text(encoding='utf-8')
    sql060 = (db / '060-creditos.sql').read_text(encoding='utf-8')
    ubic = _sql_valores(sql010, 'ubicaciones')
    cats = _sql_valores(sql010, 'categorias')
    ints = _sql_valores(sql010, 'intereses')
    aj = {r['clave']: r['valor'] for r in _sql_valores(sql010, 'ajustes') + _sql_valores(sql060, 'ajustes')}
    if not ubic or not cats or not ints or 'precios' not in aj:
        raise SystemExit('error: no encontré las semillas en app/db/010-cuentas.sql')
    por_id = {u['id']: u for u in ubic}
    datos = json.loads((root / 'app' / 'scripts' / 'demo' / 'perfiles.json').read_text(encoding='utf-8'))

    imagenes = {}

    def imagen(tono, variante, ancho, alto):
        s = svg(tono, variante, ancho, alto)
        nombre = hashlib.sha256(s.encode('utf-8')).hexdigest()[:16] + '.svg'
        imagenes[nombre] = s
        return f'{prefijo}media/{nombre}'

    perfiles, historias, slugs = [], [], set()
    for p in datos['perfiles']:
        for k in ('provincia', 'ciudad'):
            if p.get(k) and p[k] not in por_id:
                raise SystemExit(f"error: {p['id']}: la ubicación {p[k]!r} no existe en las semillas")
        for s in p.get('salidas', []):
            if s not in {c['id'] for c in cats}:
                raise SystemExit(f"error: {p['id']}: la salida {s!r} no existe")
        for s in p.get('intereses', []):
            if s not in {i['id'] for i in ints}:
                raise SystemExit(f"error: {p['id']}: el interés {s!r} no existe")
        slug = _slug(p['nombre'])
        n = 2
        while slug in slugs:
            slug = f"{_slug(p['nombre'])}-{n}"; n += 1
        slugs.add(slug)
        tono = int(p.get('tono', 300))
        fotos = []
        for i in range(int(p.get('fotos', 4))):
            # La primera vertical (es la de la tarjeta); después se alternan apaisadas (16:9) y verticales
            ancho, alto = (900, 1200) if i % 2 == 0 else (1600, 900)
            url = imagen(tono + i * 5, i, ancho, alto)
            fotos.append({'url': url, 'urlMini': url, 'ancho': ancho, 'alto': alto})
        publicado = AHORA - timedelta(days=int(p.get('dias', 30)))
        plan = p.get('plan', 'E')
        perfiles.append({
            'cuentaId': p['id'], 'slug': slug, 'displayName': p['nombre'], 'edad': p['edad'], 'genero': p.get('genero', 'mujer'),
            'nacionalidad': p.get('nacionalidad', ''), 'pais': por_id['argentina']['nombre'],
            'provincia': por_id[p['provincia']]['nombre'] if p.get('provincia') else '',
            'ciudad': por_id[p['ciudad']]['nombre'] if p.get('ciudad') else '', 'zona': p.get('zona', ''),
            'ubicacionIds': {'pais': 'argentina', 'provincia': p.get('provincia'), 'ciudad': p.get('ciudad')},
            'titular': p.get('titular', ''), 'bio': p.get('bio', ''), 'titularEn': p.get('titularEn', ''), 'bioEn': p.get('bioEn', ''),
            'idiomas': p.get('idiomas', []), 'alturaCm': p.get('altura'), 'contextura': None,
            'intereses': p.get('intereses', []), 'salidas': p.get('salidas', []), 'tarifaDesde': p.get('tarifa'),
            'fotos': fotos, 'videos': [], 'preview': None, 'plan': plan, 'star': plan == 'S',
            'destacado': plan != 'S' and bool(p.get('destacado')), 'verificada': True,
            'actualizado': _iso(publicado + timedelta(days=min(5, int(p.get('dias', 30)) // 2))), 'publicadoEn': _iso(publicado),
            'contacto': {'whatsapp': p.get('whatsapp', ''), 'telegram': p.get('telegram', '')}, 'links': [],
        })
        for j, hst in enumerate(p.get('historias', [])):
            creado = AHORA - timedelta(hours=float(hst.get('horas', 2)))
            url = imagen(tono + 15 + j * 9, j + 2, 1080, 1920)
            historias.append({'id': f"{p['id']}-h{j + 1}", 'cuentaId': p['id'], 'url': url, 'urlMini': url, 'texto': hst.get('texto', ''),
                              'creado': _iso(creado), 'expira': _iso(creado + timedelta(hours=24))})
    perfiles.sort(key=lambda x: (x['publicadoEn'], x['cuentaId']), reverse=True)
    historias.sort(key=lambda x: x['creado'])

    precios = aj['precios']
    estado = {
        'ahora': _iso(AHORA),
        'ajustes': {
            'portada': aj.get('portada'), 'promo': '',
            'precios': {'mes': dict(precios.get('mes', {}), E=0), 'semana': dict(precios.get('semana', {}))},
            'destacado': aj.get('destacado') or {}, 'textos_sitio': None,
        },
        'ubicaciones': [{'id': u['id'], 'nombre': u['nombre'], 'tipo': u['tipo'], 'padre': u['padre'], 'lat': u['lat'], 'lng': u['lng'], 'orden': u['orden']} for u in ubic],
        'categorias': [{'id': c['id'], 'nombre': c['nombre'], 'icono': c['icono'], 'orden': c['orden']} for c in cats],
        'intereses': [{'id': i['id'], 'nombre': i['nombre'], 'nombreEn': i['nombre_en'], 'nombrePt': i['nombre_pt'], 'orden': i['orden']} for i in ints],
        'perfiles': perfiles,
        'historias': historias,
    }
    if media_out is not None:
        media_out.mkdir(parents=True, exist_ok=True)
        for nombre, s in imagenes.items():
            (media_out / nombre).write_text(s, encoding='utf-8')
    return estado


if __name__ == '__main__':
    import sys
    raiz = pathlib.Path(__file__).resolve().parents[2]
    e = armar(raiz)
    json.dump(e, sys.stdout, ensure_ascii=False, indent=1)
