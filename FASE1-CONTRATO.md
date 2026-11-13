# Fase 1+2 — Contrato de trabajo (lanzamiento 15/11/2026)

Objetivo: desde el 15/11 las acompañantes crean su cuenta en sexyrose.net, arman su perfil con fotos, suben selfie + documento, Juan aprueba desde el admin y el perfil aparece en el sitio público real. Planes por mes y por semana pagados por transferencia, activados desde el admin. Stars con cupo. Historias con foto.

> **11/11/2026 — Planes v2.** Los planes pasaron de 6 a 4 y se pagan con **créditos**; los créditos se compran por WhatsApp. Lo que dice este documento sobre pedidos de plan por transferencia, Platino/Diamante y el ajuste `transferencia` queda reemplazado por la sección [Planes v2, créditos y destacado](#planes-v2-créditos-y-destacado) (al final).
Fuera del 15: videos y shorts, destacadas, venta de contenido, packs, pedidos, chat pago, reservas, estadísticas avanzadas, cuentas de clientes (los clientes NUNCA tienen cuenta). **Cambió el 12/11/2026:** para comprar packs y hacer pedidos personalizados el interesado crea una cuenta simple (ver [Cuentas de interesados y pedidos personalizados](#cuentas-de-interesados-y-pedidos-personalizados--desde-el-12112026)).

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
  Desde `075-historias-video.sql`: `tipo` ('foto' | 'video'), `estado` ('listo' | 'procesando' | 'error'), `segundos`, `ancho`, `alto`, `error`; en un video `url` = MP4 y `url_mini` = portada (WebP), y las 24 h corren desde que queda listo. Ver "Historias en video".
- `ubicaciones` (id text pk (slug), nombre, tipo (pais|provincia|ciudad|zona), padre text null, activa boolean, orden int), `categorias` (id text pk, nombre, icono, orden, activa), `intereses` (id text pk, nombre, nombre_en, nombre_pt, orden). Se siembran (INSERT … ON CONFLICT DO NOTHING) con los valores del MVP: ubicaciones de Argentina (todas las provincias + ciudades principales que tenga mvp/src/geo.js o data.js), categorías HH.ACTIVITIES, 16 intereses iniciales.
- `ajustes` (clave text pk, valor jsonb, actualizado). Claves: `precios`, `transferencia` (**quitada en Planes v2**: no se muestran datos bancarios en la web), `portada` (título, subtítulo), `promo` (texto). Planes v2 suma `packs`, `destacado`, `contacto`, `cotizacion`, `comision`, `mensajes`.

### 020-planes.sql (agente B)
- `pedidos` (id uuid pk, cuenta_id fk, plan text check in (D,C,B,A,S) (códigos del MVP: S Star, A Diamante, B Platino, C Oro, D Plata, E Bronce), periodo text check in (mes, semana), monto_usd numeric, estado text check in (pendiente, informado, confirmado, rechazado, cancelado, vencido), referencia text (código corto para poner en la transferencia, ej. SR-7K3Q), comprobante_ruta text null, nota text, creado, informado timestamptz, confirmado timestamptz, confirmado_por text, provincia_star text null).
- `suscripciones` (id uuid pk, cuenta_id fk, pedido_id fk null (null = asignado a mano por el admin), plan text, periodo text, desde timestamptz, hasta timestamptz, estado text check in (activa, vencida, cancelada), creado).
- Plan efectivo de una cuenta = el de mayor rango entre sus suscripciones activas con desde ≤ ahora < hasta; si no hay, E (Bronce, gratis). Así una "semana de Diamante" sobre un Platino mensual sube 7 días y después vuelve sola a Platino.
- Precios por defecto (ajustes.precios, editables en admin): mes {E:0, D:20, C:45, B:70, A:150, S:350}; semana solo {B:21, A:45, S:105} (cuarta parte del mes + 20 %). Plata/Oro/Bronce no tienen semana.
- Star: cupo 10 por provincia contando suscripciones Star activas (mes o semana) cuya cuenta tenga esa provincia. El pedido Star guarda provincia_star; al confirmar se vuelve a chequear el cupo (si no hay, el admin ve el aviso y puede rechazar).
- Vencimientos: tarea cada 10 min (setInterval dentro del proceso, y al arrancar) que marca vencidas las suscripciones con hasta < ahora y pedidos pendientes > 7 días como vencidos; envía email "tu plan vence en 3 días" y "tu plan venció" una sola vez (columna o tabla de avisos enviados). El agente B usa lib/mail.js del agente A (interfaz: `await sendMail({to, subject, text, html})`).

## API

### Pública (agente A) — routes/sitio.js
- `GET /api/sitio/estado` → `{ahora, ajustes:{portada, promo, precios}, ubicaciones:[...], intereses:[...], perfiles:[PerfilPublico], historias:[{id, cuentaId, url, urlMini, texto, creado, expira}]}`. Solo perfiles con estado publicado, verificacion verificada, no ocultos, cuenta activa.
  - `PerfilPublico` = {cuentaId, slug, displayName, edad, genero, nacionalidad, pais, provincia, ciudad, zona, titular, bio, titularEn, bioEn, idiomas, alturaCm, contextura, intereses, tarifaDesde, fotos:[{url, urlMini, ancho, alto}], plan (código efectivo), star (bool), verificada: true, actualizado, publicadoEn, contacto:{whatsapp, telegram} , links}. (WhatsApp va en el estado público porque el MVP lo muestra tras "Me interesa"; es decisión de producto existente.)
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

## Planes v2, créditos y destacado

Decidido por Juan el 11/11/2026 (detalle en el proyecto: `claude/sexyrose-planes-v2-propuesta.md`). Backend: `lib/creditos.js`, `lib/planes.js`, `lib/planes-ref.js`, `routes/cuenta-planes.js`, `routes/admin-creditos.js`, `routes/admin-fase1.js` (ajustes), migraciones `db/050-planes-v2.sql` y `db/060-creditos.sql`. Pruebas: `test/fase1-planes.test.js`, `test/planes-v2.test.js`.

### Planes

| Código | Nombre | Mes (USD = créditos) | Semana | Fotos | Videos | Historias/día | Destacadas (historias) | Packs a la venta | Clip 5 s en la tarjeta | Destacado (1 día / 7 días) |
|---|---|---|---|---|---|---|---|---|---|---|
| E | Bronce | 0 (gratis) | — | 8 | 2 | 1 | 1 | 0 | no | 1 / 5 |
| D | Plata | 35 | — | 30 | 10 | 3 | 2 | 1 | sí | 2 / 9 |
| C | Oro | 90 | 27 | 500 | 200 | ∞ | 5 | 5 | sí | 4 / 20 |
| S | Star | 350 | 105 | 1000 | 500 | ∞ | ∞ | ∞ | sí | — (ya va arriba; cupo 10 por provincia) |

- `null` = ilimitado en la API (`limites.historiasDia`, `limites.destacadas`, `limites.packs`). Destacadas y packs por plan: decisión de Juan del 12/11/2026. `lib/planes-ref.js` exporta `LIMITES`, `PLANES_PREVIEW` (D, C, S) y `limitesDe(plan)`.
- Platino (B) y Diamante (A) **no existen más**. `050-planes-v2.sql` **frena el arranque** (`RAISE EXCEPTION`, el sitio queda en 503 y el log muestra el mensaje) si hay suscripciones activas vigentes o pedidos abiertos con B/A: se decide con Juan cómo pasarlos y se vuelve a desplegar. El historial con B/A (vencido, cancelado, confirmado) se conserva; las restricciones nuevas son `NOT VALID` y ninguna fila nueva puede usar B/A (ni Plata por semana). Si `ajustes.precios` era la semilla vieja, pasa sola a la de v2.
- Precios en `ajustes.precios` = `{"mes": {"E": 0, "D": 35, "C": 90, "S": 350}, "semana": {"C": 27, "S": 105}}`. El PUT del admin rechaza claves B/A, exige E = 0 y Plata < Oro < Star.
- **Plan efectivo** = el de mayor rango entre las suscripciones activas vigentes; sin ninguna, E. **Plan mensual (cadena base)** = suscripciones activas por `mes` o `manual`. Encima se apilan semanas (solo Oro y Star) que suben el plan 7 días y después vuelve solo al mensual.
- Pre-registro de la portada: acepta `bronce, plata, oro, star, no_se`; un formulario viejo con `platino`/`diamante` se guarda como `oro`.

### Créditos (reglas)

- 1 crédito = USD 1 de lista. Se guardan en **centésimos enteros** (`bigint`). **En la API todo importe sale como `{ "centavos": 3500, "creditos": "35.00" }`** (lo llamamos *Monto*). En los POST se mandan créditos enteros (packs/carga) o, en el ajuste del admin, `creditos` con hasta 2 decimales (`"2,5"` o `2.5`) o `centavos` enteros.
- Libro `creditos_movimientos` (tipo ∈ `compra`, `pack_bonus`, `renovacion_plan`, `semana`, `subida_temporal`, `destacado`, `ajuste_admin`, `comision_venta`; positivo acredita, negativo debita; guarda `saldo_despues`). Saldo = suma de movimientos = `creditos_cuentas.centavos` (fila bloqueada con `FOR UPDATE` en cada movimiento: dos débitos simultáneos nunca se pasan del saldo).
- Sin saldo negativo, salvo `comision_venta` hasta −`ajustes.comision.saldoNegativoMax` (20). No vencen, no se devuelven en dinero y **no se transfieren entre cuentas** (no hay endpoint).
- Error de saldo (cualquier compra): **402** `{ "error": "No te alcanzan los créditos: necesitás 35.00 y tenés 10.00.", "codigo": "saldo_insuficiente", "faltan": Monto, "saldo": Monto }`.

### Cuenta — `routes/cuenta-planes.js` bajo `/api/cuenta`

Sesión de acompañante (401 sin sesión). POST/PUT: mismo origen + `X-SR: 1` + JSON (multipart solo en comprobantes). Errores `{ error, codigo?, faltan?, saldo?, proximaFechaLibre?, cupo? }` en castellano. Respuestas `Cache-Control: no-store`.

**`GET /yo`** (routes/cuenta.js) suma: `creditos: { saldo: Monto }`, `notificaciones: { noLeidas }`, `limites.destacadas`, `perfil.pausadoPorSaldo` (bool). `previewHabilitado` ahora es desde Plata (`PUT /preview` responde 403 "Disponible desde Plata."). `POST /perfil/enviar-revision` responde **409** si el perfil está pausado por saldo.

**`GET /planes`** →
```json
{
  "precios": { "mes": {"E":0,"D":35,"C":90,"S":350}, "semana": {"C":27,"S":105} },
  "planes": [ { "codigo":"D", "nombre":"Plata", "mes":35, "semana":null,
                "limites": {"fotos":30,"videos":10,"historiasDia":3,"destacadas":4},
                "preview": true, "destacado": {"dia":2,"semana":9}, "cupoProvincia": null } ],
  "efectivo": "C",
  "base": { "plan":"D", "planNombre":"Plata", "hasta":"…", "suscripcionId":"uuid",
            "renovacionAuto": true, "cambioProgramado": null,
            "proximaRenovacion": { "fecha":"…", "plan":"D", "planNombre":"Plata", "costo": Monto, "alcanza": true, "faltan": Monto } },
  "semanas": [ Suscripcion ],
  "saldo": Monto,
  "pausa": { "plan":"D", "planNombre":"Plata", "desde":"…", "costo": Monto, "perfilPausado": true },
  "suscripciones": [ Suscripcion ], "pedidos": [ PedidoViejo ],
  "cupoStar": { "provincia":"provincia-de-cordoba", "libres": 3, "total": 10 }
}
```
`base` es `null` sin plan mensual; `proximaRenovacion` es `null` si la renovación está apagada o el cambio programado es `E`; `pausa` es `null` salvo que una renovación no se pudo cobrar. `planes` trae siempre E, D, C, S en ese orden. Ya **no** viene `transferencia`.
*Suscripcion* = `{ id, cuentaId, pedidoId, plan, planNombre, periodo: "mes"|"semana"|"manual", desde, hasta, estado: "activa"|"vencida"|"cancelada", nota, creado, vigente, renovacionAuto, cambioProgramado, origen: "pedido"|"manual"|"creditos", costo: Monto|null }`.

**`GET /plan/cotizar?plan=C&periodo=mes`** → vista previa sin cobrar:
`{ tipo, plan, planNombre, periodo, planAnterior, costo: Monto, desde, hasta, diasRestantes, detalle, saldo: Monto, alcanza, faltan: Monto }`. Mismos errores que comprar (400/409), sin el 402.

**`POST /plan/comprar` `{ plan: "D"|"C"|"S", periodo: "mes"|"semana" }`** → **201** `{ ok, tipo, suscripcion: Suscripcion, costo: Monto, movimiento: Movimiento|null, saldo: Monto, plan: <efectivo>, reanudado: bool, devueltoDestacado: Monto }`. Qué hace según `tipo`:
- `nuevo` (sin plan mensual): 30 días desde ahora, renovación automática **encendida**.
- `renovacion_anticipada` (mismo plan que el mensual): 30 días más pegados al final; mantiene renovación y cambio programado.
- `subida` (plan mensual superior): empieza ya y termina el mismo día que el plan anterior; se paga la **diferencia prorrateada**: `ceil((precioNuevo − precioActual) × díasRestantes / 30)` en centésimos. Los tramos del plan anterior quedan `cancelada` (nota "pasó a Oro el …"). Los Destacados del plan anterior se cancelan y se devuelve en créditos lo no usado (`devueltoDestacado`).
- `semana` (Bronce compra una semana de Oro/Star) y `subida_temporal` (Plata u Oro compra la semana de un plan superior): 7 días, se apilan si ya tenía otra semana del mismo plan; sin renovación automática.
- Errores: 400 (`E` es gratis, plan inválido incluidos B/A, Plata por semana, período inválido, Star sin provincia); **409** `codigo: "usar_cambio_programado"` (comprar por mes un plan **inferior** al mensual: se programa), `"semana_no_sube"` (semana de un plan igual o inferior al mensual), `"cupo_star"` (10 Stars vigentes en su provincia); **402** saldo. No se cobra nada si falla.
- Comprar un plan mensual borra una renovación pendiente y **reanuda** el perfil pausado por saldo (`reanudado: true`).

**`PUT /plan/renovacion` `{ activa: true|false }`** (también POST) → `{ ok, renovacionAuto, base, reanudado }`. 409 sin plan mensual. Si estaba **pausada por saldo** y manda `false`: se borra la renovación pendiente y el perfil vuelve a verse con Bronce (`reanudado: true`).

**`PUT /plan/cambio` `{ plan: "E"|"D"|"C"|null }`** (también POST) → `{ ok, cambioProgramado, base }`. Baja de plan **en la próxima renovación** (`"E"` = no renovar y pasar a Bronce al vencer; `null` o el mismo plan = sin cambio). 409 `codigo: "usar_subida"` si es un plan superior; 409 sin plan mensual.

**`GET /creditos[?limite=50&antesDe=<idMovimiento>]`** →
```json
{ "saldo": Monto,
  "movimientos": [ Movimiento ], "siguiente": "id-para-paginar|null",
  "packs": [ { "id":"trimestre-plata", "nombre":"Trimestre Plata", "pagaUsd":95, "recibe":105, "bonus":10,
               "alcanzaPara":"3 meses de Plata, o 1 de Oro + 15", "masElegido":true } ],
  "cargaMinima": 10, "cargaMaxima": 10000, "horasPedido": 48,
  "pedidos": [ PedidoCreditos ],
  "canales": { "whatsapp": true, "telegram": false } }
```
*Movimiento* = `{ id, tipo, centavos, creditos, saldoDespues: Monto, refTipo, refId, motivo, creado, creadoPor }`. Si el admin dejó `alcanzaPara` vacío, viene la sugerencia automática (el plan más alto que entra al menos un mes + el resto, ej. "1 mes de Oro + 15"; si no entra ninguno, "Destacados sueltos"). `canales.whatsapp` falso = el admin todavía no cargó el número (el front muestra "Muy pronto").

**`POST /creditos/pedidos` `{ packId }` o `{ creditos: <entero 10..10000> }`, más `lang: "es"|"en"|"pt"`** (idioma del panel) → **201** `{ ok, pedido: PedidoCreditos }`:
```json
{ "id":"uuid", "codigo":"SR-4821", "cuentaId":"uuid", "packId":"trimestre-plata", "packNombre":"Trimestre Plata",
  "pagaUsd":95, "base": Monto, "bonus": Monto, "total": Monto, "estado":"pendiente", "lang":"es",
  "tieneComprobante":false, "nota":null, "motivo":null, "creado":"…", "vence":"… (+48 h)", "confirmado":null, "reaperturas":0,
  "mensaje":"Hola, quiero comprar Trimestre Plata (105 créditos, USD 95). Pedido SR-4821",
  "whatsappUrl":"https://wa.me/5491122334455?text=…", "telegramUrl":"https://t.me/usuario" }
```
Carga a medida: `packId: null`, sin bonificación, nombre "Carga a medida" / "Custom top-up" / "Recarga personalizada". `mensaje`, `whatsappUrl` y `telegramUrl` solo vienen mientras el pedido está `pendiente`; `whatsappUrl`/`telegramUrl` son `null` si no hay número/Telegram activo. Código `SR-####` (4 dígitos), único entre los pendientes. Errores: 400 (pack inexistente o inactivo, carga fuera de rango o con decimales), 409 (ya tiene 3 pedidos pendientes), 403 (cuenta no activa). **Nunca hay datos bancarios en la web**: el monto en pesos y la cuenta los pasa el responsable por WhatsApp.

**`POST /creditos/pedidos/:id/comprobante`** (multipart: `comprobante` JPG/PNG/WebP/HEIC/PDF ≤ 8 MB y/o `nota`; o JSON `{nota}`) → `{ ok, pedido }`. 400 sin archivo ni nota o archivo inválido; 409 si ya no está pendiente; 404 si no es suyo.
**`POST /creditos/pedidos/:id/cancelar`** → `{ ok, pedido }` (409 si no está pendiente).

**`GET /destacado`** →
```json
{ "plan":"D", "planNombre":"Plata", "provincia":"provincia-de-cordoba", "disponible":true, "motivo":null,
  "precios": { "E": {"dia": Monto, "semana": Monto}, "D": {…}, "C": {…} },
  "precio": { "dia": Monto, "semana": Monto },
  "cupo": { "cupo": 2, "activos": 7, "ocupadosAhora": 1, "porcentaje": 20 },
  "proximaFechaLibre": { "dia": "ISO", "semana": "ISO" },
  "mios": [ Destacado ], "saldo": Monto }
```
`disponible: false` con `motivo` ("Con Star ya aparecés arriba de todo.", perfil sin publicar, sin provincia). Para Star `precio`, `cupo` y `proximaFechaLibre` son `null`.
*Destacado* = `{ id, cuentaId, plan, planNombre, provincia, dias: 1|7, desde, hasta, estado: "activo"|"programado"|"vencido"|"cancelado", costo: Monto, creado, vigente }`.

**`POST /destacado` `{ dias: 1|7, desde?: ISO }`** → **201** `{ ok, destacado, saldo }`.
- Sin `desde`: empieza ahora, o cuando termina el Destacado que ya tiene (se encadena). Con `desde` (reserva): de ahora a 60 días; 409 si se superpone con uno suyo.
- Cupo por plan y provincia = 20 % de los perfiles **publicados** con ese plan efectivo en la provincia, redondeado hacia arriba, mínimo 1. Si en algún momento del período se pasa del cupo: **409** `{ error, codigo: "cupo_lleno", proximaFechaLibre: ISO, cupo, activos }` (el front ofrece reservar esa fecha con el mismo POST + `desde`).
- 409 Star, 409 perfil no publicado, 400 sin provincia o `dias`/`desde` inválidos, 402 saldo.
- **Atado al plan**: solo cuenta mientras su plan efectivo sea el mismo con el que lo compró y siga en la misma provincia. Durante una semana de subida temporal no se ve (no se devuelve); al **subir de plan mensual** se cancela y se devuelve lo no usado.

**`GET /notificaciones[?limite=30]`** → `{ items: [{ id, tipo, texto, leida, creado }], noLeidas }`. Tipos: `creditos_acreditados`, `pedido_rechazado`, `plan_comprado`, `plan_renovado`, `plan_asignado`, `plan_vence`, `plan_vencio`, `saldo_insuficiente`, `perfil_pausado`, `renovacion_pendiente`, `destacado`. Los textos vienen en castellano (el front puede traducir por `tipo`).
**`POST /notificaciones/leer` `{ ids?: [id] }`** → `{ ok, noLeidas }` (sin `ids` marca todas).

**Pedidos viejos por transferencia**: `POST /pedidos` → **410** "Los planes ahora se pagan con créditos…". `POST /pedidos/:id/informar` y `/cancelar` siguen andando solo para pedidos abiertos de antes.

### Renovación automática, avisos y pausa (tarea cada 10 min, `planes.ejecutarVencimientos()`)

1. Plan mensual con renovación encendida que termina en ≤ 15 min (o ya terminó y sigue activo): se cobra el precio del plan (o del `cambioProgramado`) y se crea el tramo siguiente pegado (30 días). Email "Renovamos tu plan …" + notificación.
2. Si no alcanza el saldo cuando llega la fecha: el perfil publicado pasa a `pausado` con `perfiles.pausado_por = 'sin_saldo'`, queda una fila en `renovaciones_pendientes` y se avisa (email + notificación). **Apenas entran créditos** (pedido confirmado o ajuste positivo del admin) se reintenta solo: si alcanza, se cobra, se crea el plan por 30 días desde ese momento y el perfil vuelve a `publicado`. Si era Star y ya no hay cupo, queda pendiente y se le avisa que elija otro plan. La pausa del admin (`pausado_por = 'admin'`) nunca se levanta sola.
3. Avisos de saldo insuficiente **7 y 2 días antes** de la renovación (una sola vez cada uno): email + notificación con cuánto falta.
4. Lo que **no** se renueva solo (renovación apagada, semanas, planes manuales) recibe el aviso de "vence en 3 días" y el de "venció" (como antes).
5. Pedidos de créditos pendientes con más de 48 h → `vencido`. Pedidos viejos por transferencia sin informar con más de 7 días → `vencido`.
6. Destacados: `programado` → `activo` al empezar; `activo`/`programado` → `vencido` al terminar.

### Admin — `routes/admin-creditos.js` y `routes/admin-fase1.js` bajo `${A}/api/`

Mismo Basic Auth; POST con `X-SR-Admin: 1` + mismo origen + JSON. `adminUser` queda como autor (`creadoPor`, `confirmado_por`).

- **`GET /creditos[?q=]`** → `{ items: [{ cuentaId, email, slug, displayName, perfilEstado, pausadoPorSaldo, plan, saldo: Monto, actualizado }], total }` (ordenado por saldo).
- **`GET /creditos/:cuentaId[?limite&antesDe]`** → `{ cuentaId, cuenta: {email, slug, displayName}, saldo, plan, base, movimientos, siguiente, pedidos: [PedidoCreditos] }`.
- **`POST /creditos/:cuentaId/ajuste` `{ creditos: "-5,50" | 10 } o { centavos: -550 }, motivo`** (motivo obligatorio, ≥ 3 letras) → `{ ok, movimiento, saldo }`. Un ajuste negativo no puede dejar saldo negativo (402). Un ajuste positivo dispara el reintento de renovación pendiente.
- **`GET /pedidos-creditos[?estado=pendiente|confirmado|vencido|cancelado|rechazado][&q=]`** — `q` busca por código (`4821`, `SR-4821`), email o nombre → `{ items: [PedidoCreditos + { cuenta: {email, slug, displayName}, arsSugerido, mensajeSugerido }], total, pendientes, conComprobante, cotizacion }`. `arsSugerido` = USD × `cotizacion.arsPorUsd` **redondeado hacia arriba a la centena** (null sin cotización); `mensajeSugerido` = plantilla `ajustes.mensajes.admin` lista para copiar y pegar en WhatsApp (sin datos bancarios: la cuenta la agrega el responsable a mano).
- **`GET /pedidos-creditos/:id/comprobante`** → el archivo (no-store, inline, sandbox).
- **`POST /pedidos-creditos/:id/confirmar`** → acredita `compra` (lo pagado) + `pack_bonus` (el regalo, si hay), marca confirmado, email "Acreditamos N créditos…" + notificación, y reintenta la renovación pendiente → `{ ok, pedido, movimientos, saldo, total }`. También confirma un pedido `vencido` (pagó tarde). 409 si ya estaba confirmado/rechazado/cancelado.
- **`POST /pedidos-creditos/:id/rechazar` `{ motivo? }`** → email + notificación. **`POST /pedidos-creditos/:id/reabrir`** → un `vencido` o `cancelado` vuelve a `pendiente` por 48 h más (`reaperturas` + 1; si su código ya lo usa otro pendiente, recibe uno nuevo).
- **`GET /planes/vencen[?dias=7]`** → `{ items: [Suscripcion + { cuenta, saldo, renueva, costoRenovacion, alcanza }], total, sinSaldo }` (último tramo de cada plan que termina en esos días).
- **`GET /planes/pausadas`** → `{ items: [{ cuentaId, plan, planNombre, desde, perfilEstado, pausado, cuenta, saldo, costo, faltan }], total }`.
- **`GET /destacados[?estado=todos]`** → `{ items: [Destacado + { cuenta }], zonas: [{ plan, planNombre, provincia, cupo, activos, ocupadosAhora, reservas }], porcentaje }`. **`POST /destacados/:id/cancelar` `{ devolver?: true }`** → devuelve todo si no empezó o la parte no usada → `{ ok, destacado, devuelto }`.
- **`GET /resumen`** suma `pedidosCreditos: { pendientes, conComprobante }`, `pausadasSinSaldo`, `vencen7: { total, sinSaldo }`.
- **`GET /acompanantes/:id`** suma `saldo`, `base`, `pausadoPorSaldo`. **`POST /acompanantes/:id/estado`** guarda `pausado_por = 'admin'` al pausar (y lo limpia al cambiar a otro estado).
- **`POST /acompanantes/:id/plan` `{ plan: D|C|S, dias, nota }`** (plan manual, sin cobrar créditos, sin renovación automática; borra una renovación pendiente y reanuda la pausa por saldo).
- **Ajustes** `GET /ajustes`, `GET|PUT /ajustes/:clave` con `{ valor }`. Claves: `precios`, `portada`, `promo`, y nuevas:
  - `packs`: lista `[{ id?, nombre, pagaUsd ≥ 10, recibe ≥ pagaUsd, alcanzaPara ("" = sugerencia automática), masElegido, orden, activo }]` (máx. 12; `id` se arma del nombre si falta). El GET devuelve además `bonus` y `alcanzaParaSugerido`.
  - `destacado`: `{ "E": {"dia":1,"semana":5}, "D": {"dia":2,"semana":9}, "C": {"dia":4,"semana":20} }` (precios en créditos, > 0).
  - `contacto`: `{ whatsapp: "5491122334455" (con código de país; se guardan solo dígitos), telegram: "usuario", telegramActivo: bool }` — segundo canal por si bloquean el número.
  - `cotizacion`: `{ arsPorUsd: 1450 | null, nota }` (la `fecha` la pone el servidor al guardar).
  - `comision`: `{ porcentaje: 10, saldoNegativoMax: 20 }`.
  - `mensajes`: `{ whatsapp: { es, en, pt }, admin }` — plantillas con `{pack}`, `{creditos}`, `{monto}`, `{codigo}` (obligatorio) y, en `admin`, `{ars}`, `{cotizacion}`, `{fecha}`.
  - `transferencia` **se quitó** (404): no se muestran datos bancarios en la web.

### Sitio público

- `GET /api/sitio/estado`: `ajustes` = `{ portada, promo, precios (solo E/D/C/S), destacado }`. Cada perfil suma **`destacado: bool`** (nunca para Star). Orden sugerido para el front en cada listado de su provincia: Star primero, después las destacadas de cada plan (rotando el orden en cada visita), después el resto. El clip de 5 s (`preview`) se publica desde Plata.

### Venta de contenido (Mercado Pago, modelo marketplace)

Ver la sección "Venta de contenido con Mercado Pago" más abajo. `creditos.registrarComisionVenta` queda sin uso: la
comisión la retiene Mercado Pago en el cobro (marketplace_fee), así que NO se descuenta de los créditos.

## Demo pública (/demo/) — desde el 11/11/2026

- La demo es el MISMO SPA del sitio real (`HH_TARGET=sitio`) en modo demostración: todo cambio del sitio se ve también en la demo (QR de los folletos). La vieja (MVP de un solo archivo) ya no se genera.
- Build: `python3 app/scripts/build-demo.py` → llama a `build-sitio.py --demo` → `app/public/demo/` con `index.html` (cáscara con `<!--SR:DEMO-->`), `assets/` (JS/CSS/diccionario/fuentes con hash), `estado.<hash>.json` y `media/<hash>.svg`. Suma `mvp/src/prod-demo.js` (solo en la demo; `build.py` lo agrega con `HH_SITIO_DEMO=1`).
- Datos: `app/scripts/demo/perfiles.json` (16 perfiles ficticios, basados en la semilla del MVP, en ciudades de Argentina) + catálogos y precios de las semillas `app/db/010-cuentas.sql` y `060-creditos.sql` (`app/scripts/demo_datos.py`). Imágenes abstractas (rosa de línea), sin personas. Las fechas se corren a la hora de la visita.
- Sin `/api`: `prod-demo.js` reemplaza `fetch` (el estado sale del JSON; el resto responde 403 sin salir). Publicar/Ingresar/Panel muestran una tarjeta con botón al sitio real (`/registro`, `/ingresar` y sus versiones en/pt). WhatsApp/Telegram y Reportar solo avisan que es una demostración. Favoritos aparte (`sr_demo_favs`).
- Direcciones con `#` (`/demo/#/perfil/valentina`, `/demo/#/en/`); el servidor (`routes/demo-sitio.js`) solo entrega `/demo/` (no-cache, CSP `script-src 'self'`, noindex) y los archivos con hash (un año, immutable; los SVG con CSP `sandbox`). Si en la carpeta queda la demo vieja, sigue sirviéndola `server.js`.
- Cartel arriba "Demostración: perfiles ficticios." + "Ver el sitio real" (es/en/pt), `noindex,nofollow`, canonical a `https://sexyrose.net/` (`DEMO_REAL_URL` para cambiarlo).

## Shorts, barra inferior y logo — desde el 11/11/2026

- **Shorts** (`/shorts`, `/en/shorts`, `/pt/shorts`; `mvp/src/prod-shorts.js`, sitio y demo). Feed vertical a pantalla
  completa con los videos públicos de la galería de las acompañantes visibles (los mismos de `GET /api/sitio/estado`,
  `perfiles[].videos[]`, que ahora traen `creado`) y las historias en video activas (`historias[]` con `tipo: 'video'`).
  No hay endpoint aparte: el estado ya trae los videos (y la demo funciona igual).
  - Videos de cada acompañante (`videosDePerfil(p, stories, ahora)`, pura, con tests): los de la galería y sus
    historias en video activas, sin repetidos.
  - Orden (`shortsOrden(items, semilla)`, pura, con tests): por acompañante del video más nuevo al más viejo; las
    acompañantes por el día de su video más nuevo y, dentro del mismo día, mezcladas con una semilla por visita;
    se reparte de a uno por acompañante (nadie acapara el feed).
  - Filtros: tipo de perfil elegido y la ubicación actual; si en esa ubicación no hay videos, muestra todos con aviso.
  - Reproducción: solo el que está en pantalla (sin sonido hasta tocar), el siguiente precargado (`metadata`), los que
    quedan a más de 2 de distancia sueltan el video. Tandas de 8. No indexado (`noindex,follow`).
- **Barra inferior (teléfono)**: Inicio, Swipe, Cerca, **Shorts** (ícono de reproducir) y **usuario**: con sesión, la
  foto de la acompañante → su panel; sin sesión → "Tu espacio" (`/favoritos`: favoritos + Publicá tu perfil + Ingresar).
  En escritorio: Shorts en el menú y el ícono de usuario arriba a la derecha (→ "Tu espacio"); con sesión, Favoritos
  está en el menú de la cuenta.
- **Logo único**: `app/public/favicon.svg` = el del encabezado (cuadrado rosa con el corazón). De ahí salen
  `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` y `logo-email.png` (`node app/scripts/generar-logos.mjs`, se
  suben al repo) y `site.webmanifest`. Lo usan el sitio, la demo, el panel, las páginas del servidor y los emails.
- **Fuentes propias en las páginas del servidor** (/terminos, /privacidad…): `build-sitio.py` deja
  `assets/fuentes.<hash>.css` y server.js cambia `<!--sr:fuentes-->` por esa hoja. Sin Google Fonts (CSP sin
  googleapis/gstatic). Sin build, fuentes del sistema.
- **Demo**: videos abstractos (`app/scripts/demo/clips/*.mp4`, degradés, sin personas) desde Plata, también como clip de
  la tarjeta; `/demo/media/<hash>.mp4` con respuesta por rangos.

## Historias en video — desde el 11/11/2026

- Como las de Instagram: la acompañante sube una historia con foto **o video** desde el mismo formulario del panel
  (Historias). Video: hasta **60 s** (si dura más se rechaza con el motivo; no se corta solo) y 95 MB; MP4, MOV, WebM o
  3GP. Solo con almacenamiento externo (`videosHabilitados`), igual que los videos de la galería.
- Reglas de plan: las mismas de las historias (cupo por día `limites.historiasDia`: E 1, D 3, C/S ilimitado; foto y
  video cuentan igual; las que quedan con error no cuentan). Los videos de historias no usan el cupo de videos de la galería.
- `POST /api/cuenta/historias/video` (multipart `video` + `texto`) → 202 `{ historia }` con `estado: 'procesando'`.
  Se procesa en la cola de `lib/videos.js` (mismo proceso que la galería: H.264 hasta 720 px, marca de agua, sin
  metadatos, +faststart, portada WebP) y se publica en `h/<id>.mp4` + `h/<id>.webp`. Recién al quedar `listo` aparece en
  el sitio y desde ahí corren sus 24 h. Si falla: `estado: 'error'` + `error` (motivo); la acompañante la borra.
  Al arrancar, las que quedaron `procesando` vuelven a la cola (o pasan a error si se perdió el temporal).
- `GET /api/cuenta/yo` → `historias[]` = `{ id, tipo, estado, url, urlMini, texto, segundos, ancho, alto, error, creado, expira }`
  (las activas y las que se están procesando o fallaron). `DELETE /api/cuenta/historias/:id` sirve para las dos.
- `GET /api/sitio/estado` → `historias[]` solo `estado = 'listo'` y sin vencer; las de video suman `tipo: 'video'`,
  `segundos`, `ancho`, `alto` (`url` = MP4, `urlMini` = portada).
- Visor (core.js `HH.openStories`, sitio y demo): el video arranca sin sonido y hay un botón para activarlo (queda
  elegido mientras dure la visita); la barra sigue la duración real del video y pasa a la siguiente al terminar; las
  fotos duran 5 s. Mantener apretado pausa (fotos y videos) y al soltar sigue; tocar a los costados avanza o vuelve
  como antes; el botón "atrás" cierra el visor. De la siguiente historia solo se precarga la portada (o la foto).
- Admin → ficha de la acompañante: las historias en video se ven con su portada y se abren en un reproductor; las que
  se están procesando o fallaron se muestran con su estado.
- Historias destacadas: ver "Historias destacadas" (12/11/2026): se suben aparte, no salen de las historias.
- Demo: dos historias en video con los clips abstractos de la demo (`"video": true` en `app/scripts/demo/perfiles.json`).

## Venta de contenido con Mercado Pago — desde el 11/11/2026

- **Modelo**: Checkout Pro, marketplace. Cada acompañante conecta SU cuenta de Mercado Pago por OAuth a la
  "cuenta de comisión" activa (= una aplicación de Mercado Pago de SexyRose). El cobro va a la acompañante y la
  comisión (`ajustes.comision.porcentaje`, la de siempre) va como `marketplace_fee` a la dueña de la aplicación.
  El comprador no tiene cuenta.
- **Cuentas de comisión** (`.env`): `MP_CUENTA_<n>_NOMBRE`, `_CLIENT_ID`, `_CLIENT_SECRET`, `_WEBHOOK_SECRET` (n = 1..9;
  id = client_id). Activa: ajuste `venta_contenido = {cuenta}` (Admin → Ajustes) o, si no hay, la primera. Sin los
  tres datos de la activa, la función no se muestra (panel: "todavía no está disponible"; perfil: sin sección).
- **Cambio de cuenta activa**: los tokens están atados a cada aplicación (`mp_conexiones` por cuenta_id + app_id). Las
  vendedoras sin conexión con la nueva ven "Volvé a conectar Mercado Pago" y sus contenidos no se pueden comprar.
- **Tokens**: cifrados (AES-256-GCM, clave HKDF del client_secret de cada aplicación). Tarea cada 12 h: renueva los
  que vencen en menos de 30 días (refresh_token); si Mercado Pago lo rechaza, la conexión queda `revocada`.
- **API acompañante** (`/api/cuenta`, mismo origen + X-SR: 1): `GET /contenido` → `{disponible, comisionPct,
  conexion: {estado: conectada|reconectar|sin_conectar, desde}, items, ventas, max}` · `POST /contenido/mp/conectar`
  → `{url}` · `GET /contenido/mp/callback?code&state` → 303 a `/panel/contenido?mp=ok|error|cancelado` ·
  `POST /contenido/mp/desconectar` · `POST|PUT|DELETE /contenido/items[/:id]` `{titulo (3-80), descripcion (≤300),
  precio (pesos, 100..10.000.000), link (https)}`; cantidad según el plan (ver "Packs por plan", 12/11/2026).
- **API pública** (`/api/sitio`): `GET /contenido/perfil/:slug` → `{disponible, items: [{id, titulo, descripcion,
  precio}]}` (sin el link) · `POST /contenido/:id/comprar` (mismo origen + X-SR) → `{url, token}`: crea la venta y la
  preferencia con el token de la vendedora (`marketplace_fee`, `external_reference` = id de la venta, `back_urls` =
  `/compra/<token>`, `notification_url` = `/api/mp/webhook?venta=<id>&source_news=webhooks`) · `GET /compra/:token
  [?payment_id=]` → `{estado, titulo, monto, vendedora, link}` (link solo si `aprobada`).
- **Verificación automática**: `POST /api/mp/webhook` valida `x-signature` (HMAC-SHA256 con `_WEBHOOK_SECRET`; plantilla
  `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`) y consulta el pago a Mercado Pago con el token de la vendedora:
  controla `external_reference` y monto. `/compra/<token>` también consulta (como mucho cada 10 s por venta) con el
  `payment_id` de la vuelta o buscando por `external_reference`. Estados: pendiente → en_proceso | aprobada |
  rechazada | reembolsada (una aprobada solo cambia si ESE pago se devuelve).
- **Admin** (`${A}/api`): `GET /contenido/resumen` (cuentas, activa, conectadas por cuenta, URLs para configurar),
  `PUT /contenido/cuenta-activa {cuenta}`, `GET /contenido/ventas?estado=` (+ totales de aprobadas). Pestaña
  "Ventas de contenido"; tarjeta "Venta de contenido" en Ajustes (comisión % + cuenta que la recibe).
- **Front**: `mvp/src/prod-contenido.js` (solo sitio real; en la demo no hace nada). Panel → Contenido; sección
  "Contenido" al final del perfil; `/compra/<token>` (noindex). El navegador guarda `{itemId: token}` en
  `localStorage.sr_compras` y el perfil muestra "Ver contenido".
- Tablas: `db/080-contenido.sql` (`mp_conexiones`, `mp_oauth_estados`, `contenido_items`, `ventas_contenido`).

## Cambios del 12/11/2026 (decisiones de Juan)

- **Sin chat en vivo en la web** (sitio y demo): `chat.js` no entra en el build del sitio (`mvp/build.py`, `SIN_SITIO`);
  `prod-sitio.js` deja apagadas las funciones de chat por si algún módulo las consulta. Se sacaron el botón "Chat en
  vivo" del visor de historias (core.js), los botones/links de chat del perfil, de la hoja de WhatsApp, de la página de
  links y de los shorts del MVP (views-public.js), la línea "Chat en vivo por sesiones" de los planes, las semillas de
  chat de data.js y las 16 traducciones de "chat en vivo" (i18n/dict.json → i18n-dict.js). Términos y Contenido ya no
  nombran el chat. Queda el chat del prototipo del MVP (chat.js, panel de la demo vieja y cuenta de clientes) y del
  admin de la demo vieja, que no se publican en la web.
- **Admin: borrar una historia** (foto o video): `DELETE ${A}/api/acompanantes/:id/historias/:hid` (JSON + X-SR-Admin)
  → `{ ok }`; borra la fila y los archivos (foto/MP4 + portada). Botón con papelera sobre cada historia en la ficha.
  Sin aviso a la acompañante. `lib/historias.js` (`borrar`, `borrarVencidas`).
- **Historias vencidas se borran**: al arrancar y cada hora, todas las que pasaron `expira` (menos las que se están
  procesando) se borran con sus archivos. No quedan guardadas: si la acompañante quiere algo fijo lo sube aparte.
- **Mercado Pago, título neutro**: a la preferencia va `items[0].title = "Contenido digital #<8 caracteres de la venta>"`,
  `description = "Contenido digital"` y `statement_descriptor = "CONT DIGITAL"`; nunca el título ni la descripción de
  la vendedora (en el sitio y en las ventas sigue el título de ella).
- **Una cuenta de Mercado Pago por acompañante**: en el callback de OAuth, si esa cuenta de Mercado Pago (`user_id`) ya
  está conectada a otra acompañante (en cualquier aplicación) → 303 a `/panel/contenido?mp=en_uso` ("Esa cuenta de
  Mercado Pago ya está conectada a otra acompañante."). Índice único `(app_id, mp_user_id)` (`db/085-mp-una-cuenta.sql`).
  La renovación de tokens no cambia `mp_user_id`.

## Historias destacadas y packs por plan — desde el 12/11/2026 (decisiones de Juan)

- **Historias destacadas** (como Instagram; `lib/destacadas.js`, `db/090-destacadas.sql`): como las historias vencidas
  se borran, una destacada no se arma con historias viejas: la acompañante sube directamente desde su dispositivo lo que
  quiere mostrar (foto o video). No vencen. Cantidad por plan `limites.destacadas`: Bronce 1, Plata 2, Oro 5, Star ∞.
  Nombre hasta 16 caracteres; portada = primer elemento; hasta 100 elementos por destacada, en el orden en que se
  subieron (sin reordenar). Si baja de plan, en el perfil se ven las primeras que entran (por fecha de creación) y el
  resto queda guardado (`visible: false` en su panel, "no se ve: supera el límite de tu plan").
  - Fotos: el mismo proceso que las fotos de las historias (`d/<id>.webp` + `d/<id>-m.webp`). Videos: la misma cola y
    el mismo tope que las historias en video (hasta 60 s, 95 MB, solo con almacenamiento externo; `d/<id>.mp4` +
    `d/<id>.webp`); mientras se procesan no se ven. Borrar una destacada o un elemento borra sus archivos.
  - API (`/api/cuenta`, mismo origen + X-SR: 1): `GET /destacadas` → `{ limite, usadas, destacadas: [{ id, titulo,
    creado, visible, items: [{ id, tipo, estado, url, urlMini, segundos, ancho, alto, error, creado }] }] }` ·
    `POST /destacadas {titulo}` → 201 (400 si llegó al límite del plan) · `PUT /destacadas/:id {titulo}` ·
    `DELETE /destacadas/:id` · `POST /destacadas/:id/fotos` (multipart `foto`) → 201 `{ item }` ·
    `POST /destacadas/:id/videos` (multipart `video`) → 202 `{ item }` con `estado: 'procesando'` (409 sin almacenamiento
    externo) · `DELETE /destacadas/items/:itemId`. `GET /yo` suma `destacadas` (la misma lista).
  - Sitio: `GET /api/sitio/estado` → `perfiles[].destacadas = [{ id, titulo, creado, items: [{ id, tipo, url, urlMini,
    creado, (video: segundos, ancho, alto) }] }]`, solo las que entran en el plan y con elementos listos (las vacías no
    van). En el perfil, fila de círculos debajo de la cabecera (visual de `highlights.js`); al tocar, el visor de
    historias sobre esa destacada (video sin sonido con botón, barra según la duración, mantener apretado pausa, "atrás"
    cierra). Sin edición desde el perfil. No entran en Shorts.
  - Panel → Historias → bloque "Destacadas": crear (nombre), renombrar, borrar, subir foto o video, borrar elementos;
    "Tu plan permite N destacadas · usás M".
  - Demo: destacadas en Valentina (3), Camila (2) y Martina (1) con imágenes abstractas y los clips de la demo.
- **Packs por plan** (venta de contenido = solo packs; los pedidos a medida están pendientes de definición):
  `limites.packs` Bronce 0, Plata 1, Oro 5, Star ∞ (reemplaza el tope fijo de 50). `GET /api/cuenta/contenido` → `max`
  = los que permite su plan (`null` ilimitados, `0` su plan no incluye la venta de packs) e `items[].aLaVenta`.
  `POST /contenido/items` → 409 "Tu plan no incluye la venta de packs." / "Tu plan permite N packs a la venta.". Si baja
  de plan, los primeros que entran (por fecha de carga) siguen a la venta; el resto queda guardado, no aparece en el
  perfil y `comprar` responde 404. En el panel: "Tu plan permite N packs" y "No está a la venta: supera el límite de tu
  plan" en los que no entran.

## Cuentas de interesados y pedidos personalizados — desde el 12/11/2026

Decisiones de Juan: para comprar packs y hacer pedidos personalizados el interesado se registra (simple: usuario, email y
contraseña) y confirma el email con un link. Pedidos estilo OnlyFans con chat; el contenido se sube al sitio y vence a
1 mes; calidad máxima 720p. Pedidos: planes Oro y Star (recomendación de Claude, aceptada).

- **Cuenta del interesado** (`db/095-clientes-pedidos.sql`: `clientes`, `sesiones_clientes`, `tokens_email_clientes`;
  `lib/clientes.js`; `routes/cliente.js` bajo `/api/cliente`). Tipo de cuenta APARTE de las acompañantes: cookie propia
  `sr_cliente` (mismo mecanismo que `sr_sesion`), tablas propias. Un cliente nunca entra a `/api/cuenta` ni al revés.
  - Registro `{usuario (3–20: letras, números, . _ -; único sin importar mayúsculas), email, password (≥ 10), mayorEdad,
    aceptaTerminos}` → 201 + cookie + email `/cliente/verificar?token=` (48 h). `POST /login`, `/logout`,
    `/verificar-email {token}`, `/reenviar-verificacion`, `/olvide {email}`, `/restablecer {token, password}` (1 h; cierra
    las otras sesiones). `GET /yo` → `{ cliente: {usuario, email, emailVerificado, pedidosNoLeidos} }`.
  - Para comprar o pedir: sesión (si no, 401 `requiereLogin`) y email confirmado (si no, 403 `requiereVerificacion`).
  - La acompañante ve solo el nombre de usuario (nunca el email). Baja de la cuenta: por email a contacto@sexyrose.net.
- **Packs**: `POST /api/sitio/contenido/:id/comprar` exige cliente verificado; la venta guarda `cliente_id`.
  `GET /api/sitio/compra/:token` solo para su dueño (otro cliente: 404; sin sesión: 401). `GET /api/cliente/compras` →
  Mis compras (`{token, itemId, titulo, monto, estado, vendedora, link (aprobada)}`). Ya no se guardan tokens en el
  navegador (`sr_compras` quedó sin uso).
- **Pedidos personalizados** (`lib/solicitudes.js`; tablas `solicitudes`, `solicitud_items`, `solicitud_mensajes`; en la
  API de la acompañante se llaman "solicitudes" porque `/api/cuenta/pedidos` ya existe para los pedidos viejos de créditos).
  - Disponibles en el perfil de acompañantes de plan Oro (C) o Star (S) con Mercado Pago conectado a la cuenta de
    comisión activa (`contenido.tomaPedidos`); `GET /api/sitio/contenido/perfil/:slug` suma `pedidos: bool`.
  - Cliente: `POST /api/cliente/pedidos {slug, texto ≤ 500}` (uno sin responder por acompañante; 10 por día) →
    `{id}` · `GET /pedidos` · `GET /pedidos/:id?since=<id>` (detalle + mensajes nuevos; marca leído) ·
    `POST /pedidos/:id/mensajes {texto ≤ 1000}` (30 por minuto) · `POST /pedidos/:id/cerrar` ·
    `POST /pedidos/items/:item/pagar` → `{url}` · `POST /pedidos/:id/verificar-pagos {paymentId}` (al volver de
    Mercado Pago) · `GET /pedidos/items/:item/archivo[?preview=1]`.
  - Acompañante (`routes/cuenta-solicitudes.js` bajo `/api/cuenta`): `GET /solicitudes` · `GET /solicitudes/:id?since=` ·
    `POST /solicitudes/:id/aceptar|rechazar|cerrar|mensajes` · `POST /solicitudes/:id/items` (multipart `archivo` +
    `precio`) · `GET /solicitudes/items/:item/archivo[?preview=1]`. `GET /api/cuenta/yo` suma `pedidosNoLeidos`.
  - Estados: pendiente → aceptada (se abre el chat) | rechazada (termina ahí); aceptada → cerrada (cualquiera de los dos;
    solo lectura). Mensajes del sistema: `aceptada`, `rechazada`, `cerrada:<rol>`.
  - Contenido bloqueado: foto (≤ 12 MB) o video (≤ 60 s, ≤ 95 MB, cola de ffmpeg con prefijo `x:`), sin marca de agua,
    a 720p como máximo (lado largo 1280, lado corto 720), guardado en el disco privado (`privado/pedidos/…`, nunca en el
    CDN) y servido por la API con Range y `Cache-Control: no-store, private`. Vista previa borrosa (48 px agrandada,
    WebP) para los dos. El original: la acompañante siempre; el cliente solo con la venta aprobada.
  - Pago: venta `tipo = 'pedido'` (`ventas_contenido.solicitud_item_id`, `item_id` NULL), mismo Checkout Pro marketplace
    (título neutro, `marketplace_fee`, webhook firmado); vuelve a `/cliente/pedido/<id>`. Al aprobarse:
    `solicitud_items.pagado` y `vence = pagado + 1 mes`.
  - Vencimiento (al arrancar y cada hora, `solicitudes.vencer()`): a 1 mes del pago (sin pagar: a 1 mes de enviado) se
    borran los archivos; el chat muestra "Este contenido venció".
  - Ventas: el panel de la acompañante (Contenido → Ventas) y Admin → Ventas de contenido muestran el tipo (Pack/Pedido).
- **Front** (`mvp/src/prod-clientes.js`, solo sitio real): `/cliente/ingresar`, `/cliente/registro`,
  `/cliente/verificar`, `/cliente/restablecer`, `/cliente/compras`, `/cliente/pedidos`, `/cliente/pedido/<id>` (noindex).
  Tu espacio muestra la cuenta del interesado (Mis compras, Mis pedidos, Cerrar sesión, cómo dar de baja). Comprar y
  Hacer un pedido llevan a ingresar si no hay sesión y vuelven al perfil. Panel de la acompañante → Pedidos (contador).
  El chat consulta `?since=` cada 4 s con la pestaña visible (15 s en segundo plano). Demo: sin cuentas ni compras
  (prod-clientes.js no corre en la demo; la demo no muestra la sección de contenido).

## Textos sin actividades ni garantías — desde el 12/11/2026 (decisión de Juan, criterio de su abogado)

- Criterio: SexyRose es un sitio de anuncios, solo publica; cada parte es responsable; ninguna garantía más allá de
  "Edad e identidad verificadas al publicar"; nunca describir ni sugerir actividades o servicios. Frases tipo:
  "Avisos de acompañantes en {lugar}", "Contacto directo con cada anunciante", "Cada anunciante es responsable de su aviso".
- **Actividades (tabla `categorias`) fuera de todo lo público**: `GET /api/sitio/estado` ya no trae `categorias` ni
  `PerfilPublico.salidas`; el sitio y la demo arman `HH.db.activities = []` (sin filtro de categorías en el inicio,
  Cerca ni Swipe, sin etiquetas en tarjetas ni perfiles, sin "Salidas que te gustan" en el panel: el panel ya no manda
  `salidas`, así que lo guardado queda intacto en `datos.salidas` y se puede volver atrás). El admin sigue teniendo
  Categorías (interno). En el build del sitio, `HH.DEFAULT_ACTIVITIES` y `HH.ACTIVITY_ICONS` van vacíos y
  `data.js` (semilla del prototipo) se reemplaza por `data-sitio.js` (forma vacía); tampoco van `bookings.js` ni
  `activity.js`. Del diccionario en/pt no viajan las entradas que mencionan actividades si su texto no está en el sitio
  (`build-sitio.py`, `sin_restos`).
- **Sin páginas por actividad**: `/<pais>/<lugar>/<cualquier cosa que no sea "hombres">` (y `/en/…`, `/pt/…`) responde
  **301** a `/<pais>/<lugar>` en el mismo idioma (con la consulta). Más de 3 tramos sigue siendo 404. No hay
  lugar × actividad en el mapa del sitio, ni plantilla `placeAct` en SEO, ni enlaces "Búsquedas frecuentes". En la
  demo (rutas con #) la dirección vieja abre la página del lugar.
- Plantillas SEO por defecto: "Acompañantes en {pais|lugar}", "Hombres acompañantes en {…}", perfil
  "{nombre}, {edad} años, acompañante en {lugar}. {bio}" (sin `{salidas}`/`{actividad}`).
- `ajustes.portada`: el valor viejo por defecto (salidas / perfiles verificados) se cambia en `db/100-textos-sin-actividades.sql`
  solo si sigue igual al de siempre.


## Filtro por intereses — desde el 12/11/2026 (decisión de Juan)

- El filtro del inicio (desplegable "Intereses" con contador o el elegido, chips, "Quitar"), el de Cerca (ventana
  Filtros, varios a la vez, junto con la edad) y el de Swipe (chips "Todos" + intereses; en el teléfono se abren con el
  botón de filtros) usan los **intereses** en lugar de las categorías: mismo lugar y mismo comportamiento que tenía el
  filtro de categorías. Selección simple en el inicio y en Swipe (el inicio pasa el elegido a Swipe y viceversa).
- Lista = `GET /api/sitio/estado` → `intereses[]` `{id, nombre, nombreEn, nombrePt, orden}` (la que define el admin,
  en su orden; se muestran todos) y cada perfil filtra por `perfiles[].intereses` (ids). Nombres por idioma.
- Front: `HH.FILTRO_INTERESES = true` en `prod-sitio.js` (sitio real y demo); `views-public.js` usa la lista de
  intereses cuando está prendido y las categorías en el prototipo. Sin páginas SEO por interés, sin intereses en las
  tarjetas, sin parámetro en la dirección (el elegido queda en el estado de la sesión, como antes). Máximo 6 por
  acompañante (sin cambios).
- Admin: la sección se titula "Intereses y categorías", con Intereses primero ("los eligen las acompañantes (hasta 6) y
  se usan como filtro en el sitio") y Salidas después ("No se muestran en el sitio").

## Admin: moderación, créditos e interesados — desde el 13/11/2026 (decisiones de Juan)

Migración `app/db/110-admin-moderacion.sql`: `solicitudes.motivo_cierre`, `cerrada_por` acepta `'admin'`, `clientes.bloqueado` + `motivo_bloqueo`, tabla `admin_acciones` (registro de solo agregado: quién, acción, objeto, detalle). Router `app/routes/admin-moderacion.js` bajo `${A}/api` (Basic Auth + `X-SR-Admin: 1` en escrituras, como el resto del admin). No se avisa nada a nadie.

**Pedidos personalizados y chats**
- `GET /solicitudes?estado=` lista con fecha, acompañante, usuario, estado, último mensaje y contenidos pagados; filtros por estado.
- `GET /solicitudes/:id` chat completo, contenidos bloqueados (pagado o no) y registro del admin. Los archivos privados solo salen por `GET /solicitudes/items/:item/archivo[?preview=1]` (autenticado; 410 si venció).
- `POST /solicitudes/:id/cerrar {motivo}`: motivo obligatorio; queda de solo lectura (`cerrada_por='admin'`, mensaje de sistema `cerrada:admin`).
- `DELETE /solicitudes/:id/mensajes/:mid` (los de sistema no se borran) y `DELETE /solicitudes/items/:item` (borra los archivos del almacenamiento privado).

**Bloqueo de interesados** — `POST /clientes/:id/bloquear {motivo}` / `desbloquear`: estado `suspendida`, se cierran sus sesiones, el login responde 403 (`suspendida: true`), no puede comprar ni pedir, y sus chats quedan de solo lectura para los dos (409 al escribir o subir contenido; la acompañante no puede aceptar).

**Interesados** — `GET /clientes?q=` (usuario, email, verificado, alta, compras cantidad/total, pedidos, bloqueado), `GET /clientes/:id`, `POST /clientes/:id/reenviar-verificacion`. Nunca se muestran contraseñas; el email solo se ve en el admin.

**Créditos** — sección propia con todas las acompañantes (saldo, plan, último movimiento, búsqueda) y `GET /creditos-resumen?dias=` (emitidos, consumidos, comprados y ajustes del período; saldo total). El ajuste manual reutiliza la API y reglas existentes. El bloque de créditos de la ficha se mantiene.

**Ficha de la acompañante** — `GET /acompanantes/:id/extra`: Destacadas (ver, borrar historia o elemento), Packs (si su plan permite venderlos; borrar), Mercado Pago (conectada / reconectar / sin conectar y qué cuenta recibe la comisión) y cantidad de pedidos personalizados con enlace a moderación. Borrados registrados en `admin_acciones`.

**Limpieza del menú** — sin Pre-registros (ni sus números en Resumen), sin Soporte ni «WhatsApp / Avisos automáticos», sin la tarjeta Promoción de Ajustes (el valor queda en la base). «Categorías» pasa a «Intereses» (la lista de salidas se oculta; datos y API quedan). «Clientes — Próximamente» pasa a «Interesados». La tarjeta «Migración a producción» se reemplaza por «Para revisar»: verificaciones, pedidos de créditos, denuncias abiertas y pedidos personalizados abiertos.

## Admin → SEO — desde el 13/11/2026 (decisión de Juan)

- Títulos y descripciones para Google editables desde el admin, guardados en el servidor (ajuste `seo`). Pisan, campo
  por campo, las plantillas por defecto de `mvp/src/seo.js` (→ `app/sitio-spa/seo-datos.json`); un campo vacío o igual
  al por defecto no se guarda (sigue el por defecto). Formato (`app/lib/seo-ajustes.js`, el mismo que `HH.settings().seo`):
  `{ minProfiles?, home?: { es|en|pt: { title, description, blockTitle, blockText } }, tpl?: { es|en|pt: { country|place|countryMen|placeMen: { title, description, intro }, profile: { title, description } } } }`.
  Variables por plantilla (otras se rechazan): lugar/país/hombres `{pais} {lugar} {ciudad} {cantidad}`; perfil
  `{nombre} {edad} {lugar} {ciudad} {pais} {bio}`; portada ninguna. Largos: título recomendado 70 / máx. 90; descripción
  160 / 300; presentación 300 / 800; bloque al pie 80 / 100 y 1200 / 2000. Mínimo de perfiles para indexar: 1..20.
- API admin (`${A}/api`, `routes/admin-seo.js`): `GET /seo` → `{ valor, defaults: { home, tpl, minProfiles, siteUrl },
  actualizado, reglas: { vars, largo, tipos, home, campos, minProfiles } }` · `PUT /seo { valor }` (valida; todo vacío =
  borra el ajuste) · `DELETE /seo` (todo por defecto). Al guardar se invalidan catálogos y estado del sitio.
- Servidor (`lib/seo-sitio.js`): `<title>`, meta description, robots (mínimo de perfiles) y `sitemap.xml` usan lo
  editado (el sitemap se rearma si cambia el ajuste). Las direcciones viejas de actividad siguen con 301 al lugar.
- Sitio: `/api/sitio/estado` → `ajustes.seo`; `mvp/src/prod-sitio-seo.js` se lo entrega a `seo.js`, así el navegador
  muestra los mismos textos (título, descripción, presentación de país/lugar, bloque al pie) que arma el servidor.
- Pantalla: `mvp/src/prod-admin-seo.js` (reemplaza el "Próximamente"): idioma, contador de caracteres, marca
  Editado / Por defecto, "Volver al texto por defecto" por campo, vista previa tipo Google con datos de ejemplo,
  "Guardar cambios" y "Volver todo a los textos por defecto". El título grande de la portada sigue en Ajustes → Textos del inicio.

## Integraciones del admin (Telegram, Mercado Pago, WhatsApp) — desde el 13/11/2026

Admin → Ajustes. API bajo `${A}/api` (`routes/admin-integraciones.js`; lo que modifica, con `apiPost`).

- **Avisos por Telegram** (`lib/telegram.js`). El token del bot queda en el servidor (`TELEGRAM_BOT_TOKEN`). El chat se
  vincula desde el admin: `POST /integraciones/telegram/vincular` → código de un solo uso (8 caracteres, vence a los
  10 min) y link `https://t.me/<bot>?start=<código>` (bot leído con `getMe`). Mientras hay un código pendiente, el
  servidor consulta `getUpdates` cada 3 s (sin webhook público); al llegar `/start <código>` guarda el chat en
  `ajustes.telegram = { chatId, chatNombre, chatUsuario, vinculado, avisos }` y contesta "Listo". Un código
  equivocado o vencido no vincula (el bot lo avisa). Si el bot tiene un webhook configurado, vincular responde 409.
  `TELEGRAM_CHAT_ID` del servidor queda de respaldo si no hay un chat vinculado.
  `GET /integraciones/telegram` (estado), `POST …/cancelar`, `…/desvincular`, `…/probar`, `PUT …/avisos {avisos}`.
- **Tipos de aviso** (`notify(texto, tipo)`; cada uno se apaga desde el admin): `cuenta_nueva`, `perfil_revisar`,
  `verificacion`, `denuncia` (denuncias y reportes urgentes), `cotizacion`, `pedido_creditos` (pedido SR nuevo:
  código y pack), `pedido_personalizado` (sin el texto), `venta` (pack o pedido pagado: tipo y monto). Se sacó el
  aviso de pre-registro. Ningún aviso lleva datos de contacto.
- **Cuentas de comisión de Mercado Pago** (`lib/mp-cuentas.js`, tabla `mp_cuentas`, `db/130-integraciones.sql`).
  Se cargan desde el admin: nombre, Client ID, Client Secret y la clave secreta de las notificaciones. Los dos
  secretos se guardan cifrados (AES-256-GCM, `lib/secretos.js`, clave derivada de `SECRETS_KEY` del servidor). Sin
  `SECRETS_KEY` el formulario se deshabilita; con otra clave, las guardadas quedan "ilegibles" (se pueden borrar).
  Nunca se devuelven al navegador: solo los últimos 4 caracteres. `GET /integraciones/mp`, `POST /integraciones/mp`,
  `PUT /integraciones/mp/:id` (secretos vacíos = se conservan; el Client ID no cambia), `DELETE …/:id`,
  `POST …/:id/probar` (pide un token `client_credentials` a Mercado Pago). Las del `.env` (`MP_CUENTA_<n>_*`) siguen
  funcionando, de solo lectura, como "desde el servidor". La lista que usa `lib/contenido.js` es la misma (primero
  las del admin): cuenta activa, OAuth de las vendedoras, renovación de tokens y firma del webhook ven los cambios
  sin reiniciar. `GET /contenido/resumen` suma `origen`, `clientId`, `secretoFin` y `webhookFin`. Cambiar el Client
  Secret de una cuenta obliga a reconectar a sus vendedoras (sus tokens se cifran con ese secreto).
- **WhatsApp del sitio**: "Probar" en Contacto abre `wa.me/<número del campo>` con el mismo mensaje que arma un pedido
  de créditos real (`GET /integraciones/whatsapp/ejemplo`, primer pack activo y código `SR-0000`; no crea nada).
- Front: `mvp/src/prod-admin-integraciones.js` (solo el paquete del admin; `HH.adminInt`).

## Tipo de perfil: Acompañante / Virtual / Ambas — desde el 13/11/2026 (decisiones de Juan)

- Lo elige la acompañante: obligatorio al registrarse (`POST /api/cuenta/registro` → `tipo`: `acompanante` | `virtual` | `ambas`;
  si falta o no es de la lista, 400 "Elegí si sos acompañante, virtual o ambas.") y editable en Mi perfil (`PUT /api/cuenta/perfil { tipo }`).
  Se guarda en `perfiles.datos.tipo`. Migración `140-tipo-perfil.sql`: los perfiles existentes (o con valor inválido) quedan `acompanante`.
  Texto de ayuda en los formularios: "Virtual: sin encuentros en persona." (nada más).
- Ubicación igual para todos los tipos (ciudad, Cerca y páginas de lugar como siempre). Planes y precios: los mismos.
- `GET /api/sitio/estado` → `perfiles[].tipo`.
- Sitio y demo (`HH.FILTRO_TIPO`, prod-sitio.js): etiqueta "Virtual" en las tarjetas (`.pc2-virt`, junto al Destacado A), en la
  tarjeta de Swipe y en la cabecera del perfil, para `virtual` y `ambas`. Filtro "Todas / Acompañantes / Virtuales" (`HH.ui.tipo`,
  uno solo para inicio, Swipe y Shorts): en el inicio arriba de Intereses, en Swipe dentro de Filtros y en Shorts arriba del video.
  `ambas` entra en Acompañantes y en Virtuales. EN: All / Companions / Virtual; PT: Todas / Acompanhantes / Virtuais.
- Demo: Sofía y Martina virtuales, Camila e Isabella ambas (`app/scripts/demo/perfiles.json`).

## Cerca de mí: Radar y Mapa — desde el 13/11/2026 (decisión de Juan)

- **Radar** (`mvp/src/radar.js`, funciones puras; `views-public.js` lo dibuja): con la ubicación compartida, anillos a
  escala real del rango elegido (5 km → 1/2/5; 10 → 2/5/10; 15 → 2/5/10/15; 25 → 5/10/25; 50 → 10/25/50; 100 → 25/50/100),
  burbujas por distancia (escala raíz cuadrada) y dirección desde "Vos", sin pisarse ni salirse, con "a X km" abajo.
  Star con borde dorado; foto un poco más grande en los planes más altos (S > A/B/C > D > E). Hasta 18 burbujas en
  escritorio y 10 en el teléfono (el resto en la lista de abajo). Igual en el teléfono.
  Tocar una burbuja abre una tarjeta chica (foto, nombre y edad, ciudad · distancia, "Ver perfil"): accesible con teclado,
  se cierra con Escape, tocando afuera o con el botón Atrás. Sin ubicación compartida: como antes (grilla).
- **Mapa** (botón "Radar | Mapa" en la cabecera de Cerca; se recuerda en la sesión, `sessionStorage sr_cerca_vista`):
  MapLibre GL 6.16.0 + PMTiles 4.5.0 + estilo oscuro de @protomaps/basemaps 5.7.2, empaquetados por `build-sitio.py`
  (esbuild) en `assets/mapa.<hash>.js/.css` y `assets/mapa-worker.<hash>.js`; se bajan **solo al abrir la vista Mapa**
  (`mvp/src/prod-mapa.js`). Fotos como marcadores con grupos (cluster) que se abren al tocarlos; tocar una foto abre la misma
  tarjeta. El visitante es un punto que late. Zoom máximo 14. Créditos © OpenStreetMap · Protomaps.
- Las acompañantes van siempre en su ubicación **aproximada** (`HH.profileCoords`); la del visitante no sale del navegador.
- Configuración (`app/lib/mapa.js`): `MAP_TILES_URL` (https, termina en `.pmtiles`; en local también http://localhost),
  `MAP_GLYPHS_URL` (plantilla con `{fontstack}` y `{range}`) y `MAP_SPRITE_URL` (las dos juntas o ninguna: sin ellas el mapa
  no lleva nombres). Sin `MAP_TILES_URL` no hay botón Mapa. `GET /api/sitio/estado` → `mapa: { tiles, glyphs, sprite }`
  solo si está configurado. La CSP del sitio y de la demo suma esos orígenes a `connect-src` (el worker sale del mismo sitio:
  `script-src 'self'`, sin `blob:`).
- Demo: el mapa aparece solo si se arma con `MAP_TILES_URL` (argumentos de build del Dockerfile); si no, solo el radar.
- Generar y subir el mapa: `infra/mapa/README.md` y `infra/mapa/generar-mapa.sh`. Imagen: el Dockerfile instala los
  paquetes del mapa en `/mapa` y arma el sitio con `REQUIRE_MAPA=1`.
- Textos nuevos en ES/EN/PT: Radar, Mapa, Cargando mapa…, No se pudo cargar el mapa…, Acompañantes a menos de {n} km,
  Acercar / Alejar / Créditos del mapa. Tests: `app/test/cerca-radar-mapa.test.js`.

## Selector de ubicación al estilo distintas.net — desde el 13/11/2026

- Mismo componente en todo el sitio y la demo (`HH.openPlacePicker`, `mvp/src/views-public.js`); lógica pura en
  `mvp/src/ubicaciones.js` (`HH.ubic`: `ordenar`, `camino`, `hijos`, `vista`; tests en `app/test/ubicaciones.test.js`).
- Arriba el camino elegido con ✓ (país, provincia, ciudad…); tocar uno vuelve a ese nivel. Abajo los lugares de ese
  nivel en orden alfabético sin importar el nivel ni los acentos (antes "Ciudad de Buenos Aires" quedaba última), con
  la cantidad de perfiles (género y tipo elegidos) y la flecha si tienen lugares adentro. Los lugares sin perfiles no
  se muestran (salvo los del camino). Tocar un lugar lo elige y entra; "Confirmar" (junto a la búsqueda) aplica.
  "Volver" sube un nivel; en la raíz está "Todas las ubicaciones". La búsqueda (2+ letras) lista los lugares con
  perfiles y su camino; elegir uno lo pone en el camino.

## Ubicaciones oficiales (Georef) — desde el 13/11/2026 (decisión de Juan)

- **Datos**: base completa de Georef (datos.gob.ar) + los 48 barrios oficiales de la Ciudad de Buenos Aires, en la
  misma tabla `ubicaciones` (migración `app/db/160-georef.sql`): columnas `georef_id` (id de Georef, o
  `gcba:<barrio>`; único), `fuente` (`georef` | `manual`) y `departamento` (solo para distinguir nombres repetidos);
  tipo nuevo `barrio` (hijos de `ciudad-de-buenos-aires`); `nombre` deja de ser único. Historial en
  `georef_importaciones` (inicio, fin, ok, origen, motivo, conteos, error).
- **Importador** `app/lib/georef.js` (`createGeoref`, `planificar` puro): provincias por código INDEC (tabla
  `PROVINCIAS`, conservan su id); localidades tipo `ciudad` bajo su provincia; las de los 24 partidos del GBA (tabla
  `GBA`, por nombre de partido) bajo Zona Norte / Oeste / Sur (GBA); una ciudad ya cargada con el mismo nombre en la
  misma provincia se **vincula** (mismo id y nombre) en vez de duplicarse; coordenadas = centroide del área. Nunca
  borra, renombra, mueve ni reactiva nada; se puede correr las veces que haga falta. Nombres de BAHRA (vienen en
  MAYÚSCULAS) → nombre normal con acentos tomados de los nombres oficiales de departamentos/municipios.
- **Cuándo corre**: al arrancar el servidor si nunca salió bien (en segundo plano: el sitio atiende mientras tanto),
  y una vez por semana; si falla reintenta a los 5 min, 30 min, 2 h 30 y después cada 6 h. Admin → Ubicaciones →
  "Importar ahora". A mano: `cd app && DATABASE_URL=… node scripts/importar-georef.js` (o `--dir=carpeta` con
  `provincias.json`, `departamentos.json`, `localidades.json`, `barrios.geojson` para importar sin internet).
- **Fuentes**: `https://infra.datos.gob.ar/georef/{provincias,departamentos,localidades}.json` (confirmadas en el código
  de datosgobar/georef-ar-api y georef-ar-etl) y el GeoJSON de barrios del GCBA (`URLS.barrios`, sin confirmar; si no
  baja, se usan los 48 nombres oficiales con un centro aproximado).
- **API para el panel** (`app/routes/ubicaciones.js`, límite por IP): `GET /api/ubicaciones/provincias`,
  `GET /api/ubicaciones/buscar?provincia=&q=` (hasta 10, sin acentos, primero los que empiezan con lo escrito,
  `{id, nombre, tipo, camino: "Oberá, Misiones", detalle?}`), `GET /api/ubicaciones/barrios` (CABA).
  `GET /api/cuenta/yo` → `perfil.ubicacion: { provincia: {id, nombre}, ciudad: {id, nombre, tipo, camino} }`.
- **Panel → Mi perfil → Dónde estás**: Provincia (lista) + Localidad (se escribe y se elige de la lista; flechas,
  Enter, Escape) y, en Capital Federal, Barrio (opcional). Escribirla sin elegirla no se guarda. El servidor valida que
  el lugar exista, esté activo (él y los que lo contienen) y sea de la provincia (`validarDatos`, tipos `ciudad`,
  `barrio` o Capital Federal).
- **Sitio público**: `/api/sitio/estado` → `ubicaciones` trae solo los lugares con perfiles publicados y sus
  antepasados, con `slug` (dirección pública). Si dos lugares dan el mismo slug, lo conserva el que tiene ese mismo
  id; los demás usan su id (`santa-rosa-mendoza`) (`slugsPublicos` en `lib/catalogos.js`). Un lugar sin perfiles no
  tiene página (404). Barrio = nivel ciudad para SEO.
- **Nombres repetidos** (dos "Santa Rosa" con perfiles): el estado manda `aclaracion` (la provincia; si también se
  repite, provincia y departamento) y el sitio usa el nombre "Santa Rosa · Mendoza" (`HH.ubic.lugarDeEstado`; en el
  selector la aclaración va como texto secundario). La ciudad de cada perfil sale de sus ids (`HH.ubic.lugarDePerfil`),
  así el selector, los contadores, Cerca, los filtros y el SEO (títulos y "2 ciudades distintas") nunca juntan dos
  lugares distintos.
- **Admin → Ubicaciones**: tarjeta "Lugares oficiales (Georef)" (última importación, conteos, "Importar ahora"),
  fuente de cada lugar (Georef / Manual / Manual · Georef), cantidad de perfiles, filtros (Con perfiles, tipo, Georef,
  Manuales), Ocultar (interruptor), Editar (renombrar) y **Unir con…** (`POST /ubicaciones/:id/unir {destino}`: los
  perfiles pasan al destino —ciudad, barrio o Capital Federal— con su provincia y país, y el lugar queda oculto).
  `GET /georef` (estado) y `POST /georef/importar` (202, corre en segundo plano).
- Tests: `app/test/georef.test.js` (fixtures sintéticos con la forma real en `app/test/fixtures/georef/`).
