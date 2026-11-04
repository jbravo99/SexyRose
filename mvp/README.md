# SexyRose — MVP (prototipo front-end)

## Correr localmente
Requisitos: Python 3 (solo para el build). No hay backend: todo corre en el navegador con datos de demo en localStorage.

1. Descomprimí el zip y entrá a la carpeta.
2. Generá el HTML: `python3 build.py` → crea `build/index.html` (el artefacto) y `build/full.html` (página completa para abrir local).
3. Abrí `build/full.html` en el navegador (doble clic alcanza). Si preferís un servidor local: `python3 -m http.server 8080` y entrá a http://localhost:8080/build/full.html

Cuentas demo (contraseña `demo1234`): vale@sexyrose.demo (acompañante plan A, Star), juli@sexyrose.demo (acompañante nueva), admin@sexyrose.demo. Los clientes no se registran.
Para volver a los datos iniciales: menú de usuario → "Reiniciar datos de demo", o `localStorage.clear()` en la consola.

## Estructura
- `src/app.css` sistema de diseño (tema oscuro, paleta rosa / rosa frutilla / rosa crema / blanco)
- `src/core.js` estado, router por hash, helpers, lógica de negocio (planes, Stars, cuota de chat, pagos simulados, historias)
- `src/data.js` datos semilla
- `src/views-public.js` landing, swipe, cerca de mí, perfil, shorts, stars, login/registro
- `src/views-dashboard.js` panel de acompañante · `src/views-client.js` actividad del cliente y chat · `src/views-admin.js` panel admin
- `build.py` concatena todo en un único HTML · `CONTRACT.md` contrato de módulos
- Pruebas (Playwright Python, Chromium): `python3 fullcheck.py` (todas las rutas, 390 y 1280 px) y `python3 flows_final.py` (flujos de punta a punta)
