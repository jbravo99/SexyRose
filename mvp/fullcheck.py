import asyncio, json
from playwright.async_api import async_playwright
ROUTES = [
 ('#inicio', None), ('#swipe', None), ('#swipe', 'u_cliente'), ('#perfil.valentina', None), ('#perfil.valentina', 'u_cliente'), ('#perfil.julieta', 'u_juli'), ('#perfil.micaela', 'u_mica'),
 ('#shorts', None), ('#stars', None), ('#login', None), ('#registro', None),
 ('#panel', 'u_juli'), ('#panel', 'u_vale'), ('#panel.perfil', 'u_vale'), ('#panel.contenido', 'u_vale'), ('#panel.pedidos', 'u_vale'), ('#panel.mensajes', 'u_vale'), ('#panel.mensajes.u_cliente', 'u_vale'), ('#panel.suscripcion', 'u_juli'), ('#panel.ingresos', 'u_vale'), ('#panel.ajustes', 'u_juli'),
 ('#cuenta', 'u_cliente'), ('#cuenta.pedidos', 'u_cliente'), ('#cuenta.mensajes', 'u_cliente'), ('#cuenta.ajustes', 'u_cliente'), ('#chat.u_vale', 'u_cliente'), ('#chat.u_cami', 'u_cliente'),
 ('#admin', 'u_admin'), ('#admin.acompanantes', 'u_admin'), ('#admin.stars', 'u_admin'), ('#admin.pagos', 'u_admin'), ('#admin.reportes', 'u_admin'), ('#admin.clientes', 'u_admin'), ('#admin.ubicaciones', 'u_admin'), ('#panel.viajes', 'u_vale'), ('#panel.agenda', 'u_vale'), ('#panel.agenda', 'u_agus'), ('#cuenta.reservas', 'u_cliente'), ('#links.valentina', None), ('#panel.actividad', 'u_vale'), ('#cuenta.actividad', 'u_cliente'), ('#chat.u_vale', 'u_cliente'), ('#panel.mensajes', 'u_vale'), ('#panel.verificacion', 'u_juli'), ('#cerca', None),
 ('#pais.argentina', None), ('#lugar.argentina.buenos-aires', None), ('#lugar.argentina.buenos-aires.cena', None), ('#lugar.espana.barcelona.museo', None), ('#admin.seo', 'u_admin'),
]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        bad = 0
        for width in (390, 1280):
            ctx = await b.new_context(locale='es-AR', viewport={'width': width, 'height': 844 if width < 700 else 820})
            pg = await ctx.new_page()
            errs = []
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'net::' not in m.text else None)
            pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
            await pg.goto('file:///home/claude/happyhouse/build/full.html'); await pg.wait_for_timeout(300)
            for route, user in ROUTES:
                errs.clear()
                await pg.evaluate("HH.logout && (HH.session=null)")
                if user: await pg.evaluate(f"HH.login('{user}')")
                await pg.evaluate(f"HH.go('{route}')"); await pg.wait_for_timeout(350)
                over = await pg.evaluate("document.documentElement.scrollWidth > window.innerWidth")
                landed = await pg.evaluate("'#'+HH.currentHash()")
                txt = (await pg.inner_text('#app'))[:60].replace('\n',' ')
                name = f"full_{route.strip('#').replace('.','_')}_{user or 'anon'}_{width}"
                await pg.screenshot(path=f'shots/{name}.png', full_page=True)
                flag = '' if (not over and not errs and landed == route) else '  <-- REVISAR'
                if flag: bad += 1
                print(f"{width} {route:28} {user or '-':10} landed={landed:28} overflow={over} errs={len(errs)} | {txt}{flag}")
                for e in errs[:3]: print('    ', e[:200])
            await ctx.close()
        print('PROBLEMAS:', bad)
        await b.close()
asyncio.run(main())
