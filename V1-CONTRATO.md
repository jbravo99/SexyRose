# Lanzamiento hoy (v1-lanzamiento) — contrato entre módulos

Objetivo: poner sexyrose.net en línea HOY con:
1. Portada de lanzamiento real + formulario de PRE-REGISTRO de acompañantes (datos reales en Postgres).
2. Páginas legales: /terminos, /privacidad, /contenido, /trata (texto del doc de políticas, adaptado a esta etapa).
3. /denunciar (formulario sin cuenta) y enlace "Denunciar" en el pie de TODAS las páginas.
4. El MVP v56 visible como DEMO en /demo/ con un cartel fijo y claro: "Demostración: perfiles ficticios. El sitio abre pronto." + noindex.
5. Admin mínimo en /admin (usuario y contraseña por variables de entorno) para ver/exportar pre-registros y denuncias.

Idioma: castellano (Argentina) para esta etapa. Sin emojis. Público: mayores de 18.
Marca: "SexyRose", paleta oscura con rosa frutilla (ver mvp/src/app.css: --bg #15131A, --surface #221F28, --berry #FF5C8A, --pink #C76F91, --fg #F7F3F6; fuentes Poppins/Manrope desde Google Fonts o system-ui).

## Estructura del repo
- `app/` — UN solo servicio Node 22 (Express + pg). Sirve las páginas, la API y la demo.
  - `app/server.js`, `app/package.json` (dependencias mínimas: express, pg; nada más salvo que sea imprescindible).
  - `app/db/schema.sql` — se aplica al arrancar (idempotente: CREATE TABLE IF NOT EXISTS).
  - `app/public/` — páginas estáticas (las arma el agente web).
  - `app/public/demo/index.html` — se genera en el build de Docker desde `mvp/` (python3 mvp/build.py → mvp/build/full.html) con el cartel inyectado. NO se commitea el generado.
- `infra/` — docker-compose.yml, Dockerfile (en app/ o infra/, ver abajo), cloudflared, scripts del servidor, copias, monitoreo.
- `mvp/` — no se toca salvo para leer.

## Variables de entorno (archivo .env, nunca al repo; `.env.example` sí)
DATABASE_URL, PORT=3000, ADMIN_USER, ADMIN_PASSWORD, IP_HASH_SALT, SITE_URL=https://sexyrose.net,
OPERATOR_NAME (opcional; si falta, las páginas legales muestran solo la marca "SexyRose"),
CONTACT_EMAIL=ayuda@sexyrose.net, REPORT_EMAIL=denuncias@sexyrose.net, PRIVACY_EMAIL=privacidad@sexyrose.net,
TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID (opcionales: aviso al llegar una denuncia o un pre-registro),
TUNNEL_TOKEN (cloudflared), POSTGRES_PASSWORD.

## API (JSON)
- GET /healthz → 200 {"ok":true} (chequea la base).
- POST /api/preregistro → 201 {"ok":true}
  campos: nombre_artistico (2–40), genero (mujer|trans|hombre), provincia, ciudad (texto), contacto_tipo (whatsapp|telegram|email), contacto (texto, validar según tipo), plan_interes (bronce|plata|oro|platino|diamante|star|no_se), mayor_edad (true obligatorio), acepta_terminos (true obligatorio), website (honeypot: si viene con algo → 201 falso y no se guarda).
  400 con {"ok":false,"error":"..."} en castellano si algo falta. Límite: 5 por IP por hora (429).
- POST /api/denuncia → 201 {"ok":true,"id":"..."}
  campos: categoria (abuso_infantil|imagen_sin_consentimiento|trata|otro), url (opcional), descripcion (10–4000), email (opcional), website (honeypot). Límite 10 por IP por hora.
  Si categoria es abuso_infantil o trata o imagen_sin_consentimiento y hay Telegram configurado → aviso inmediato.
- GET /admin (Basic Auth ADMIN_USER/ADMIN_PASSWORD) → HTML simple con dos tablas; /admin/preregistros.csv y /admin/denuncias.csv.
- IP: nunca guardar la IP en claro. Guardar ip_hash = sha256(IP_HASH_SALT + ip). La IP real viene en el header CF-Connecting-IP (detrás de Cloudflare Tunnel); si no está, req.socket.remoteAddress. Borrar ip_hash de filas con más de 30 días (tarea al arrancar y cada 24 h).
- Cabeceras: CSP estricta (self + Google Fonts), X-Content-Type-Options, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy mínima, frame-ancestors 'none'. /admin y /demo con X-Robots-Tag: noindex.
- robots.txt: permitir todo salvo /admin y /demo; sitemap.xml con las páginas públicas.

## Base de datos (schema.sql)
preregistros(id uuid default gen_random_uuid() — usar pgcrypto, creado timestamptz default now(), nombre_artistico, genero, provincia, ciudad, contacto_tipo, contacto, plan_interes, ip_hash, estado text default 'nuevo')
denuncias(id uuid, creado, categoria, url, descripcion, email, ip_hash, estado text default 'nueva', resuelto timestamptz null)

## Páginas (app/public)
/index.html (portada + formulario), /terminos.html, /privacidad.html, /contenido.html, /trata.html, /denunciar.html, /gracias.html opcional, /404.html, /css/site.css, /js/forms.js (fetch a la API, mensajes en castellano, sin dependencias).
Express sirve /terminos → terminos.html, etc. (rutas limpias sin .html).
Pie en todas: Términos · Privacidad · Contenido · Contra la trata · Denunciar · "Sitio de publicidad y contenido" · contacto.
Portada: qué es SexyRose (directorio de acompañantes para salidas + espacio de contenido de creadoras verificadas), "Abre pronto", promo de lanzamiento: plan Bronce gratis y el resto al 50 % hasta febrero de 2027 (precios USD: Star 255→127,50; Diamante 102→51; Platino 60→30; Oro 38→19; Plata 21→10,50; Bronce 10→gratis), verificación de identidad obligatoria, enlace "Ver demostración" a /demo/. Aviso 18+ en la portada (sin contenido explícito en ninguna página pública).
Nada de afirmar cosas no verdaderas (sin cifras de usuarias inventadas, sin testimonios).

## Docker
- Imagen única del app (Node 22 slim) con etapa de build que corre `python3 mvp/build.py` e inyecta el cartel de demo.
- docker-compose: servicios `app`, `db` (postgres:16, volumen persistente, sin puertos publicados), `cloudflared` (cloudflare/cloudflared, `tunnel run` con TUNNEL_TOKEN). El app NO publica puertos al exterior en producción (solo red interna); un override `docker-compose.dev.yml` publica 127.0.0.1:3000 para pruebas locales.
- Debe construir y correr en amd64 (servidor) y arm64 (Mac).

## Anexo (04/11/2026) — acuerdos entre agentes
- Marcadores en HTML: las páginas de app/public pueden usar `{{OPERADOR}}`, `{{CONTACT_EMAIL}}`, `{{REPORT_EMAIL}}`, `{{PRIVACY_EMAIL}}`, `{{SITE_URL}}`, `{{FECHA_LEGAL}}`. El servidor los reemplaza al servir cualquier .html (valores de las variables de entorno; OPERADOR = OPERATOR_NAME o "SexyRose"; FECHA_LEGAL = "4 de noviembre de 2026"). Escapar HTML en el reemplazo.
- La demo (/demo/) es un HTML de un solo archivo con <script> y <style> en línea: su CSP propia permite 'unsafe-inline' en script-src y style-src, e img-src/media-src/connect-src que necesite el MVP (revisar mvp/src para dominios externos de imágenes). El resto del sitio NO usa scripts en línea (CSP estricta: script-src 'self').
- Formularios: forms.js envía JSON con fetch a /api/preregistro y /api/denuncia; espera {"ok":true} o {"ok":false,"error":"..."} y muestra el error tal cual. Los ids de formulario: `#form-preregistro` y `#form-denuncia`; cada campo con name = nombre del campo de la API. Checkboxes mayor_edad / acepta_terminos → booleanos.
- En esta etapa NO se envían emails desde el sitio (sin proveedor de envío). Los avisos van por Telegram si está configurado.
- Ningún agente hace git commit; el coordinador commitea.
- Política de textos: no mencionar proveedores que aún no se usan (Amazon SES, procesadores de pago) como si estuvieran en uso.
- Textos editables (07/11/2026): cada texto visible de las páginas de app/public va entre marcadores `<!--e:pagina.seccion.nombre-->texto<!--/e-->` (con formato: **negrita**, [texto](url), saltos de línea) o `<!--t:...-->texto<!--/t-->` (solo texto: title, option, enlaces, botones, atributos content/aria-label/placeholder y los mensajes de forms.js en `#textos-form`). Las claves `comun.*` (cabecera, pie, mensajes comunes) se repiten idénticas en todas las páginas. El servidor reemplaza con lo guardado en la tabla `textos` (editable en /admin/textos, con historial en `textos_historial`) y quita los marcadores. Al tocar el HTML: no borrar ni renombrar marcadores (se pierde lo editado para esa clave); un texto nuevo necesita su marcador para ser editable. La demo (/demo/) no se edita.
