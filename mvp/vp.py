import asyncio, sys
from playwright.async_api import async_playwright
# uso: python3 vp.py '#ruta' user|- width name [scrollY]
route, user, width, name = sys.argv[1], (sys.argv[2] if sys.argv[2] != '-' else None), int(sys.argv[3]), sys.argv[4]
scroll = int(sys.argv[5]) if len(sys.argv) > 5 else 0
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(locale='es-AR', viewport={'width': width, 'height': 844 if width < 700 else 820}, device_scale_factor=2)
        await pg.goto('file:///home/claude/happyhouse/build/full.html'); await pg.wait_for_timeout(300)
        if user: await pg.evaluate(f"HH.login('{user}')")
        await pg.evaluate(f"HH.go('{route}')"); await pg.wait_for_timeout(400)
        if scroll: await pg.evaluate(f"window.scrollTo(0,{scroll})"); await pg.wait_for_timeout(200)
        await pg.screenshot(path=f'shots/vp_{name}.png')
        await b.close()
asyncio.run(main())
