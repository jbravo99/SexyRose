# Fase 1+2 — Contrato de trabajo (lanzamiento 15/11/2026)

Objetivo: desde el 15/11 las acompañantes crean su cuenta en sexyrose.net, arman su perfil con fotos, suben selfie + documento, Juan aprueba desde el admin y el perfil aparece en el sitio público real. Planes por mes y por semana pagados por transferencia, activados desde el admin. Stars con cupo. Historias con foto.
Fuera del 15: videos y shorts, destacadas, venta de contenido, packs, pedidos, chat pago, reservas, estadísticas avanzadas, cuentas de clientes (los clientes NUNCA tienen cuenta).

Repo de trabajo: /home/claude/repo (git; commit base = estado del dispositivo de Juan). No tocar el equipo de Juan. Idioma de la interfaz: castellano rioplatense (las acompañantes pueden ver EN/PT con el traductor del MVP); admin solo en castellano.

## Reglas comunes
- Node 22 ESM, Express 4, pg. Dependencias nuevas permitidas: `sharp` (imágenes), `multer` o `busboy` (subidas). Nada más sin necesidad clara.
- Postgres: cada módulo agrega su propio archivo SQL idempotente en app/db/ (orden alfabético): `schema.sql` (existente), `010-cuentas.sql` (agente A), `020-planes.sql` (agente B). El agente A cambia el arranque para aplicar todos los .sql de app/db/ en orden.
- Código nuevo del servidor en módulos, no todo en server.js: app/lib/*.js y app/routes/*.js. server.js solo monta. Agente A: routes/cuenta.js, routes/sitio.js, lib/auth.js, lib/mail.js, lib/storage.js, lib/imagenes.js. Agente B: routes/admin-fase1.js (montado por server.js dentro del router admin existente, bajo `${A}/api/`), lib/planes.js.
- Seguridad: contraseñas con crypto.scrypt (sal propia, parámetros N=2^15 r=8 p=1 o similares, comparación timingSafeEqual). Sesión: cookie `sr_sesion` HttpOnly, Secure (salvo en dev/http), SameSite=Lax, Path=/, 30 días; en la base solo el hash SHA-256 del token. Todo POST/PUT/DELETE de /api/cuenta y /api/admin exige mismo origen (helper sameOrigin existente) + `Content-Type: application/json` (o multipart en subidas) + cabecera `X-SR: 1`. Rate limit en registro, login, olvidé y subidas (helper rl existente). Errores JSON `{error:"mensaje en castellano"}`.
- Datos privados (selfie, documento, comprobantes) en disco privado `${DATA_DIR}/privado/...` (nunca públicos, nunca al CDN); el admin los ve por una ruta autenticada que los transmite.
- Fotos públicas: pipeline sharp → JPEG/WebP, máx 1600 px lado mayor, sin EXIF/GPS, con marca de agua "SexyRose" (texto SVG semitransparente centrado-abajo como en el MVP), más miniatura de 480 px. Driver de almacenamiento: `STORAGE=local` (default; guarda en `${DATA_DIR}/media/...` y Express los sirve en `/media/...` con caché larga) o `STORAGE=bunny` (BUNNY_STORAGE_ZONE, BUNNY_STORAGE_KEY, BUNNY_STORAGE_HOST (ej. storage.bunnycdn.com o br.storage.bunnycdn.com), BUNNY_CDN_URL ej. https://media.sexyrose.net). Misma interfaz: put(key, buffer, contentType) → url pública; del(key).
- Emails: lib/mail.js con Mailgun API HTTP (región EU: https://api.eu.mailgun.net/v3/${MAILGUN_DOMAIN}/messages, Basic auth `api:${MAILGUN_API_KEY}`), MAIL_FROM default `SexyRose <no-responder@sexyrose.net>`, Reply-To `contacto@sexyrose.net`. Sin MAILGUN_API_KEY: no envía, loguea asunto y destinatario (nunca el link completo en producción; en NODE_ENV!=='production' sí) y guarda el último link en memoria para las pruebas.
- Variables nuevas en .env.example (con comentarios en castellano): DATA_DIR (default /data en Docker, ./data en dev), STORAGE, BUNNY_*, MAILGUN_API_KEY, MAILGUN_DOMAIN (mg.sexyrose.net), MAIL_FROM.
- Docker: volumen `srdata:/data` para el app en infra/docker-compose.yml (el proceso corre como usuario node: el directorio tiene que ser escribible). Lo hace el agente A.
- Pruebas: node --test con Postgres 16 (ya corre uno en /tmp/pgsr, puerto 55432, usuario postgres; crear bases propias: agente A `srtestA`, agente B `srtestB`). Las 59 pruebas existentes tienen que seguir pasando.

## Modelo de datos

### 010-cuentas.sql (agente A)
- `cuentas` (id uuid pk, email text unique (guardado en minúsculas), pass_hash text, email_verificado timestamptz null, estado text default 'activa' check in (activa, suspendida, baja), creado, ultimo_login, acepto_terminos timestamptz, mayor_edad_declarada boolean).
- `sesiones` (token_hash bytea pk, cuenta_id fk, creado, expira, ua text).
- `tokens_email` (token_hash bytea pk, cuenta_id fk, tipo text check in (verificar, restablecer), expira, usado timestamptz null).
- `perfiles` (cuenta_id pk fk, slug text unique, datos jsonb not null default '{}', estado text default 'borrador' check in (borrador, en_revision, publicado, rechazado, pausado, suspendido), motivo_rechazo text, verificacion text default 'sin_enviar' check in (sin_enviar, pendiente, verificada, rechazada), oculto boolean default false, creado, actualizado, publicado_en timestamptz).
  - `datos` (lo edita la acompañante; el servidor valida y descarta todo lo demás): displayName (2–30), genero (mujer|trans|hombre), fechaNacimiento (YYYY-MM-DD, ≥18 años; se publica solo la edad), nacionalidad, pais, provincia, ciudad, zona, titular (≤80), bio (≤1500), titularEn, bioEn, idiomas[], alturaCm, contextura (clave del MVP HH.BUILDS), intereses[] (ids de la tabla intereses, máx 6), salidas[] (ids de categorías), tarifaDesde (USD, entero ≥0 o null), whatsapp (E.164), telegram (usuario), links[{label,url}] (máx 4, https).
- `fotos` (id uuid pk, cuenta_id fk, orden int, clave text, url text, url_mini text, ancho, alto, creado). Límite por plan (LEVELS del MVP: E 8, D 15, C 30, B 50, A 500, S 1000).
- `verificaciones` (id uuid pk, cuenta_id fk, selfie_ruta text, documento_ruta text, estado text check in (pendiente, aprobada, rechazada), motivo text, creado, revisado timestamptz, revisado_por text).
- `historias` (id uuid pk, cuenta_id fk, url, url_mini, texto (≤120), creado, expira = creado + 24 h). Límite por día según plan (E 1, D 3, resto ilimitado).
- `ubicaciones` (id text pk (slug), nombre, tipo (pais|provincia|ciudad|zona), padre text null, activa boolean, orden int), `categorias` (id text pk, nombre, icono, orden, activa), `intereses` (id text pk, nombre, nombre_en, nombre_pt, orden). Se siembran (INSERT … ON CONFLICT DO NOTHING) con los valores del MVP: ubicaciones de Argentina (todas las provincias + ciudades principales que tenga mvp/src/geo.js o data.js), categorías HH.ACTIVITIES, 16 intereses iniciales.
- `ajustes` (clave text pk, valor jsonb, actualizado). Claves: `precios`, `transferencia` (texto con los datos bancarios; vacío = "a confirmar"), `portada` (título, subtítulo), `promo` (texto).

### 020-planes.sql (agente B)
- `pedidos` (id uuid pk, cuenta_id fk, plan text check in (D,C,B,A,S) (códigos del MVP: S Star, A Diamante, B Platino, C Oro, D Plata, E Bronce), periodo text check in (mes, semana), monto_usd numeric, estado text check in (pendiente, informado, confirmado, rechazado, cancelado, vencido), referencia text (código corto para poner en la transferencia, ej. SR-7K3Q), comprobante_ruta text null, nota text, creado, informado timestamptz, confirmado timestamptz, confirmado_por text, provincia_star text null).
- `suscripciones` (id uuid pk, cuenta_id fk, pedido_id fk null (null = asignado a mano por el admin), plan text, periodo text, desde timestamptz, hasta timestamptz, estado text check in (activa, vencida, cancelada), creado).
- Plan efectivo de una cuenta = el de mayor rango entre sus suscripciones activas con desde ≤ ahora < hasta; si no hay, E (Bronce, gratis). Así una "semana de Diamante" sobre un Platino mensual sube 7 días y después vuelve sola a Platino.
- Precios por defecto (ajustes.precios, editables en admin): mes {E:0, D:20, C:45, B:70, A:150, S:350}; semana solo {B:21, A:45, S:105} (cuarta parte del mes + 20 %). Plata/Oro/Bronce no tienen semana.
- Star: cupo 10 por provincia contando suscripciones Star activas (mes o semana) cuya cuenta tenga esa provincia. El pedido Star guarda provincia_star; al confirmar se vuelve a chequear el cupo (si no hay, el admin ve el aviso y puede rechazar).
- Vencimientos: tarea cada 10 min (setInterval dentro del proceso, y al arrancar) que marca vencidas las suscripciones con hasta < ahora y pedidos pendientes > 7 días como vencidos; envía email "tu plan vence en 3 días" y "tu plan venció" una sola vez (columna o tabla de avisos enviados). El agente B usa lib/mail.js del agente A (interfaz: `await sendMail({to, subject, text, html})`).

## API

### Pública (agente A) — routes/sitio.js
- `GET /api/sitio/estado` → `{ahora, ajustes:{portada, promo, precios}, ubicaciones:[...], categorias:[...], intereses:[...], perfiles:[PerfilPublico], historias:[{id, cuentaId, url, urlMini, texto, creado, expira}]}`. Solo perfiles con estado publicado, verificacion verificada, no ocultos, cuenta activa.
  - `PerfilPublico` = {cuentaId, slug, displayName, edad, genero, nacionalidad, pais, provincia, ciudad, zona, titular, bio, titularEn, bioEn, idiomas, alturaCm, contextura, intereses, salidas, tarifaDesde, fotos:[{url, urlMini, ancho, alto}], plan (código efectivo), star (bool), verificada: true, actualizado, publicadoEn, contacto:{whatsapp, telegram} , links}. (WhatsApp va en el estado público porque el MVP lo muestra tras "Me interesa"; es decisión de producto existente.)
  - Caché en memoria 30 s, invalidada en cada cambio.
- `GET /api/sitio/perfil/:slug` → PerfilPublico o 404.
- `POST /api/sitio/reporte` → reutiliza la lógica de denuncias (categoría + url del perfil + descripción).

### Cuenta (agente A) — routes/cuenta.js (todas bajo /api/cuenta)
- `POST registro` {email, password (≥10, no igual al email), displayName, fechaNacimiento, genero, aceptaTerminos:true, mayorEdad:true} → crea cuenta + perfil borrador + sesión (cookie) + email de verificación → `{ok, cuenta:Yo}`.
- `POST login` {email, password} → cookie → `{ok, cuenta:Yo}`; `POST logout`.
- `POST verificar-email` {token}; `POST reenviar-verificacion`.
- `POST olvide` {email} (siempre ok, no revela si existe); `POST restablecer` {token, password} (cierra las demás sesiones).
- `POST cambiar-password` {actual, nueva}; `POST cambiar-email` (opcional, puede quedar fuera).
- `GET yo` → `Yo` = {id, email, emailVerificado, estado, perfil:{slug, estado, motivoRechazo, verificacion, oculto, datos, fotos:[{id,url,urlMini,orden}], completo:bool, faltantes:[...]}, plan:{efectivo, suscripciones:[...], pedidos:[...]} (este bloque lo completa B vía función exportada de lib/planes.js `resumenPlan(cuentaId)`; si no existe todavía, A devuelve plan:{efectivo:'E', suscripciones:[], pedidos:[]}), limites:{fotos, historiasDia}, historias:[...]}.
- `PUT perfil` {datos parciales} → valida y guarda; slug se genera del displayName la primera vez (único, con sufijo numérico) y no cambia después.
- `POST perfil/enviar-revision` → si está completo (≥3 fotos, datos obligatorios, email verificado, verificación enviada) pasa a en_revision.
- `POST perfil/ocultar` {oculto:bool}.
- `POST fotos` (multipart, campo `foto`, máx 12 MB, jpeg/png/webp/heic si sharp lo soporta) → procesa y guarda → foto. `DELETE fotos/:id`. `PUT fotos/orden` {ids:[...]}. La primera foto es la principal.
- `POST verificacion` (multipart: `selfie`, `documento`) → guarda privado, estado pendiente.
- `POST historias` (multipart `foto` + `texto`) / `DELETE historias/:id`.
- Pedidos y planes (agente B, routes/cuenta-planes.js montado bajo /api/cuenta): `GET planes` → {precios, plan efectivo, suscripciones, pedidos, transferencia (texto de ajustes), cupoStar:{provincia, libres}}; `POST pedidos` {plan, periodo} → pedido pendiente con referencia y monto; `POST pedidos/:id/informar` (multipart opcional `comprobante` + nota) → informado; `POST pedidos/:id/cancelar`.

### Admin (agente B) — routes/admin-fase1.js bajo `${A}/api/` (mismo Basic Auth y reglas de POST de Fase 0: JSON + X-SR-Admin: 1 + mismo origen)
- `GET acompanantes?estado=&q=` → lista {cuentaId, email, emailVerificado, slug, displayName, ciudad, provincia, estado perfil, verificacion, plan efectivo, creado, fotos (n), fotoPrincipal}.
- `GET acompanantes/:id` → detalle completo (datos, fotos, verificaciones con ids, pedidos, suscripciones, historias).
- `GET verificaciones/:id/selfie` y `/documento` → transmite el archivo privado (no-store).
- `POST acompanantes/:id/verificacion` {decision: aprobar|rechazar, motivo} → actualiza verificaciones + perfiles.verificacion; si aprueba y el perfil estaba en_revision → publicado; email a la acompañante.
- `POST acompanantes/:id/estado` {estado: publicado|pausado|suspendido|rechazado, motivo} (+ email).
- `POST acompanantes/:id/plan` {plan, dias, nota} → suscripción manual (pedido_id null).
- `GET pedidos?estado=` → lista con acompañante, plan, periodo, monto, referencia, estado, comprobante (bool). `GET pedidos/:id/comprobante`. `POST pedidos/:id/confirmar` (crea suscripción: desde = max(ahora, hasta de la última del mismo plan) para renovar sin perder días; 30 días mes, 7 días semana; email) / `POST pedidos/:id/rechazar` {motivo}.
- `GET stars` → cupo por provincia.
- `GET/PUT ajustes/:clave` (precios, transferencia, portada, promo).
- CRUD `ubicaciones`, `categorias`, `intereses` (GET lista, POST crear, PUT :id, DELETE :id con chequeo de uso).
- Resumen (GET resumen existente) suma: acompanantes {total, enRevision, publicadas}, verificacionesPendientes, pedidos {pendientes, informados}.

## Front (segunda ola, agentes C y D)
- C: paquete "sitio" (HH_PROD='sitio') servido en `/` (y rutas del MVP con direcciones reales); portada pública con datos reales, perfil, swipe, cerca, ciudades; registro/login y panel de la acompañante conectados a /api/cuenta; oculta lo que queda fuera del 15. Las páginas legales siguen como HTML del servidor.
- D: admin (prod-admin.js) con Acompañantes (lista, detalle, ver selfie/documento, aprobar/rechazar, estado, plan manual), Pagos/Pedidos (confirmar/rechazar, comprobante), Suscripciones, Stars (cupo), Ubicaciones, Categorías + Intereses, Ajustes (precios, datos de transferencia, portada, promo).
