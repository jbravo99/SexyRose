#!/usr/bin/env python3
"""Uso: python3 shot.py '#ruta' [userId|-] [width] [nombre]  → captura build/full.html en shots/<nombre>.png y reporta errores/overflow."""
import asyncio, sys, subprocess, os
from playwright.async_api import async_playwright
route = sys.argv[1] if len(sys.argv) > 1 else '#inicio'
user = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != '-' else None
width = int(sys.argv[3]) if len(sys.argv) > 3 else 390
name = sys.argv[4] if len(sys.argv) > 4 else (route.strip('#').replace('.', '_') + '_' + str(width))
subprocess.run(['python3', 'build.py'], check=True, capture_output=True)
only = os.environ.get('HH_ONLY')
full = 'build/full.html' if not only else 'build/full-' + only.replace('.js','') + '.html'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(locale='es-AR', viewport={'width': width, 'height': 844 if width < 700 else 800})
        errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'ERR_TUNNEL' not in m.text and 'net::' not in m.text else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        await pg.goto('file:///home/claude/happyhouse/' + full)
        await pg.wait_for_timeout(300)
        if user:
            await pg.evaluate(f"HH.login('{user}')")
        await pg.evaluate(f"HH.go('{route}')")
        await pg.wait_for_timeout(500)
        over = await pg.evaluate("document.documentElement.scrollWidth > window.innerWidth")
        await pg.screenshot(path=f'shots/{name}.png', full_page=True)
        print('shot', f'shots/{name}.png', '| overflow:', over, '| errors:', errs or 'none')
        await b.close()
asyncio.run(main())
