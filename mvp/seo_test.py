#!/usr/bin/env python3
"""Pruebas de direcciones reales y SEO (modo demo con #/…). El modo servidor se prueba con ssr/ (node server.mjs)."""
import asyncio
from playwright.async_api import async_playwright
ok = 0; fails = []
def check(name, cond):
    global ok
    if cond: ok += 1; print('OK  ', name)
    else: fails.append(name); print('FAIL', name)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(locale='es-AR', viewport={'width': 390, 'height': 844})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file:///home/claude/happyhouse/build/full.html'); await pg.wait_for_timeout(400)
        ev = pg.evaluate
        async def go(t): await ev(f"HH.go({t!r})"); await pg.wait_for_timeout(250)
        check('clave vieja → dirección nueva', (await go('#perfil.valentina')) or await ev("location.hash") == '#/perfil/valentina')
        check('parse ciudad × salida', await ev("HH.parseUrl('/argentina/buenos-aires/cena').key") == 'lugar.argentina.buenos-aires.cena')
        check('parse en inglés', await ev("JSON.stringify(HH.parseUrl('/en/spain/madrid/dinner'))") == '{"key":"lugar.espana.madrid.cena","lang":"en"}')
        check('url en portugués', await ev("HH.urlOf('lugar.argentina.buenos-aires.cena','pt')") == '/pt/argentina/buenos-aires/jantar')
        check('perfil en inglés', await ev("HH.urlOf('perfil.valentina','en')") == '/en/profile/valentina')
        check('dirección desconocida → 404', await ev("HH.parseUrl('/argentina/narnia').key") == '404')
        await go('/argentina/buenos-aires/cena')
        check('página ciudad × salida: H1 y perfiles', await ev("document.querySelector('h1').textContent") == 'Cena en Buenos Aires: acompañantes para tu salida' and await ev("document.querySelectorAll('.seo-page .pcard').length") >= 1)
        check('título y descripción', (await ev("document.title")).startswith('Cena en Buenos Aires') and len(await ev("document.querySelector('meta[name=description]').content")) <= 160)
        check('enlaces con dirección real', await ev("[...document.querySelectorAll('#app a[data-go]')].every(a => a.getAttribute('href').startsWith('#/'))"))
        check('datos estructurados', await ev("document.querySelectorAll('script[data-hh-ld]').length") >= 2)
        await ev("HH.setLang('en')"); await pg.wait_for_timeout(250)
        check('cambiar idioma conserva la página', await ev("location.hash") == '#/en/argentina/buenos-aires/dinner' and (await ev("document.title")).startswith('Dinner in Buenos Aires'))
        await ev("HH.setLang('es')"); await pg.wait_for_timeout(250)
        check('provincia con una sola ciudad: fuera de Google', await ev("HH.seoMeta('lugar.argentina.provincia-de-mendoza').robots") == 'noindex,follow')
        check('mapa del sitio sin provincias repetidas', await ev("!HH.seoSitemap().some(e => e.key === 'lugar.argentina.provincia-de-mendoza')") and await ev("HH.seoSitemap().some(e => e.key === 'lugar.argentina.mendoza')"))
        check('mapa del sitio sin paneles', await ev("!HH.seoSitemap().some(e => /^(panel|admin|cuenta|chat)/.test(e.key))"))
        check('perfil no publicado → noindex', await ev("(() => { const p = HH.db.profiles.find(x => !HH.publishedProfiles().includes(x)); return !p || HH.seoMeta('perfil.' + p.slug).robots.startsWith('noindex'); })()"))
        await go('#inicio')
        check('portada con bloque SEO y enlaces', await ev("!!document.querySelector('.seo-hub h2') && document.querySelectorAll('.seo-hub a').length >= 10"))
        # Admin: cambiar la dirección de un lugar deja la anterior funcionando
        await ev("HH.login('u_admin')"); await go('#admin.seo')
        check('admin SEO abre', await ev("document.body.innerText.includes('Plantillas')"))
        await ev("""(() => { const d = [...document.querySelectorAll('details.seo-place')].find(x => x.textContent.includes('Rosario')); d.open = true; d.querySelector('input[name=slug]').value = 'rosario-santa-fe'; d.querySelector('form').requestSubmit(); })()"""); await pg.wait_for_timeout(300)
        check('slug nuevo', await ev("HH.urlOf(HH.placeKey(HH.locByName('Rosario')))") == '/argentina/rosario-santa-fe')
        check('slug viejo redirige', await ev("HH.parseUrl('/argentina/rosario').key") == 'lugar.argentina.rosario-santa-fe')
        await ev("""(() => { const f = document.querySelector('form[data-submit=seoTplSave]'); f.querySelector('[name="place.h1"]').value = 'Salidas en {lugar}'; f.requestSubmit(); })()"""); await pg.wait_for_timeout(300)
        await go('/argentina/mendoza')
        check('plantilla editada se aplica', await ev("document.querySelector('h1').textContent") == 'Salidas en Mendoza')
        check('sin errores de JS', not errs)
        for e in errs[:5]: print('   ', e[:200])
        await b.close()
    print(f"\n{'OK' if not fails else 'FALLAS'} {ok} FAIL {fails}")
asyncio.run(main())
