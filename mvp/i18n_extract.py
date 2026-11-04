#!/usr/bin/env python3
"""Recorre la web en inglés y junta los textos sin traducir → i18n/missing.json (para completar src/i18n-dict.js)."""
import asyncio, json, re, sys
from playwright.async_api import async_playwright
exec(open('fullcheck.py').read().split('async def main')[0].split('ROUTES =',1)[0])
ROUTES = eval(open('fullcheck.py').read().split('ROUTES =',1)[1].split('\nasync def')[0])
ROUTES = [r for r in ROUTES if not r[0].startswith('#admin')] + [('#panel.contenido', 'u_juli'), ('#panel.agenda', 'u_juli'), ('#stars', 'u_cliente'), ('#cuenta.compras', 'u_cliente'), ('#perfil.camila', None), ('#perfil.tomas', None), ('#panel.resumen', 'u_anto')]
ACTIONS = [  # (ruta, usuario, js que abre algo)
 ('#inicio', None, "HH.openPlacePicker && HH.openPlacePicker()"),
 ('#perfil.valentina', 'u_cliente', "document.querySelector('[data-action^=pubWa],[data-action=pubInterest],[data-action=pubLike]') && document.querySelector('[data-action^=pubWa],[data-action=pubInterest],[data-action=pubLike]').click()"),
 ('#perfil.valentina', 'u_cliente', "HH.openBookingModal(HH.profileOf('u_vale'))"),
 ('#perfil.valentina', 'u_cliente', "HH.buyChat(HH.profileOf('u_vale'))"),
 ('#perfil.valentina', None, "HH.clientAuth && HH.clientAuth({reason:'x'})"),
 ('#panel.agenda', 'u_vale', "HH.actions.dashAgSlot(document.querySelector('[data-action=dashAgSlot]'))"),
 ('#panel.agenda', 'u_vale', "HH.actions.waPreview()"),
 ('#panel.viajes', 'u_vale', "HH.actions.dashTripOpen()"),
 ('#inicio', 'u_vale', "HH.actions.openUserMenu()"),
 ('#inicio', None, "HH.ui.sup={open:true,msgs:[],ticketId:null}; HH.actions.supToggle(); HH.actions.supToggle()"),
]
async def main():
    miss = set()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for width in (1280, 390):
            ctx = await b.new_context(viewport={'width': width, 'height': 900})
            pg = await ctx.new_page()
            await pg.add_init_script("try{localStorage.setItem('hh_lang','en')}catch(e){}")
            await pg.goto('file:///home/claude/happyhouse/build/full.html'); await pg.wait_for_timeout(300)
            await pg.evaluate("HH._i18nMiss = new Set()")
            async def visit(route, user, js=None):
                await pg.evaluate("HH.closeModal && HH.closeModal(); HH.session=null")
                if user: await pg.evaluate(f"HH.login('{user}')")
                await pg.evaluate(f"HH.go('{route}')"); await pg.wait_for_timeout(250)
                if js:
                    try: await pg.evaluate(js); await pg.wait_for_timeout(250)
                    except Exception as e: print('js fail', route, js[:40], str(e)[:80])
            for r, u in ROUTES: await visit(r, u)
            for r, u, js in ACTIONS: await visit(r, u, js)
            # Exploración: abre cada botón (no destructivo) de las pantallas con sesión para juntar textos de modales
            if width == 1280:
                for r, u in [x for x in ROUTES if x[1]] + [('#perfil.valentina', 'u_cliente'), ('#perfil.camila', 'u_cliente')]:
                    await visit(r, u)
                    acts = await pg.evaluate(r"""[...document.querySelectorAll('#app [data-action]')].map((e,i)=>[i,e.getAttribute('data-action')]).filter(([i,a])=>!/(del|remove|quitar|logout|reset|reject|block|suspend|cancel|submit|send|pay|buy|confirm|accept|decline|unlock|sanction|resolve|report)/i.test(a))""")
                    seen = set()
                    for i, a in acts:
                        if a in seen: continue
                        seen.add(a)
                        try:
                            await pg.evaluate(f"(()=>{{const e=[...document.querySelectorAll('#app [data-action]')][{i}]; if(e) e.click();}})()"); await pg.wait_for_timeout(180)
                        except Exception: pass
                        await pg.evaluate("HH.closeModal && HH.closeModal()")
                        if (await pg.evaluate("'#'+HH.currentHash()")) != r: await visit(r, u)
            miss |= set(await pg.evaluate("[...HH._i18nMiss]"))
            await ctx.close()
        await b.close()
    # textos de toasts / confirmaciones / títulos de modales en el código
    src = ''.join(open('src/' + f).read() for f in ['core.js','bookings.js','chat.js','activity.js','views-public.js','views-dashboard.js','views-client.js','ops.js','geo.js'])
    for m in re.finditer(r"HH\.toast\(\s*(['\"])((?:(?!\1).)+)\1", src): miss.add(m.group(2))
    for m in re.finditer(r"(?:title|label|text|okLabel):\s*(['\"])((?:(?!\1)[^$\\])+)\1", src): miss.add(m.group(2))
    miss = sorted(x for x in miss if re.search(r'[a-záéíóúñ]', x, re.I) and len(x) < 400)
    old = {}
    try: old = json.load(open('i18n/dict.json'))
    except Exception: pass
    todo = [x for x in miss if x not in old]
    json.dump(todo, open('i18n/missing.json', 'w'), ensure_ascii=False, indent=0)
    print('faltan', len(todo), 'de', len(miss))
asyncio.run(main())
