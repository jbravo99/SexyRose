#!/usr/bin/env python3
"""Pruebas de idiomas: detección, selector, admin en español y textos bilingües del perfil."""
import asyncio
from playwright.async_api import async_playwright
R = []
def check(n, ok): R.append((n, bool(ok))); print(('OK  ' if ok else 'FAIL'), n)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(locale='pt-BR', viewport={'width': 1280, 'height': 900}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file:///home/claude/happyhouse/build/full.html'); await pg.wait_for_timeout(400)
        check('detecta portugués del navegador', await pg.evaluate("HH.lang") == 'pt')
        check('menú en portugués', 'Perto de mim' in await pg.inner_text('#appHeader'))
        await pg.select_option('#appHeader select[data-change=setLang]', 'es'); await pg.wait_for_timeout(300)
        check('selector cambia a español', 'Cerca' in await pg.inner_text('#appHeader') and await pg.evaluate("localStorage.getItem('hh_lang')") == 'es')
        await pg.select_option('#appHeader select[data-change=setLang]', 'en'); await pg.wait_for_timeout(300)
        check('selector cambia a inglés', 'Nearby' in await pg.inner_text('#appHeader'))
        await pg.evaluate("HH.login('u_admin'); HH.go('#admin.acompanantes')"); await pg.wait_for_timeout(300)
        check('admin queda en español', 'Acompañantes' in await pg.inner_text('#app'))
        await pg.evaluate("(() => { const p = HH.profileOf('u_vale'); p.headlineEn = 'Coffee, museums and long talks'; p.bioEn = 'I love finding new coffee shops.'; HH.save(); HH.logout(); HH.go('#perfil.valentina'); })()"); await pg.wait_for_timeout(400)
        t = await pg.evaluate("document.getElementById('app').textContent")  # la descripción está en una pestaña oculta (v57)
        check('perfil muestra la versión en inglés', 'Coffee, museums and long talks' in t and 'I love finding new coffee shops.' in t)
        await pg.select_option('#appHeader select[data-change=setLang]', 'es'); await pg.wait_for_timeout(300)
        t = await pg.evaluate("document.getElementById('app').textContent")
        check('en español muestra el original', 'Cafés de especialidad' in t)
        await pg.evaluate("HH.login('u_vale'); HH.go('#panel.perfil')"); await pg.wait_for_timeout(300)
        check('editor tiene campos en inglés', await pg.query_selector('#pfHeadlineEn') is not None and await pg.query_selector('#pfBioEn') is not None)
        check('sin errores de JS', not errs)
        await b.close()
    print('OK', sum(1 for _, o in R if o), 'FAIL', [n for n, o in R if not o])
asyncio.run(main())
