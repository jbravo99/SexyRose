# Fase 1+2 — Contrato de trabajo (lanzamiento 15/11/2026)

Objetivo: desde el 15/11 las acompañantes crean su cuenta en sexyrose.net, arman su perfil con fotos, suben selfie + documento, Juan aprueba desde el admin y el perfil aparece en el sitio público real. Planes por mes y por semana pagados por transferencia, activados desde el admin. Stars con cupo. Historias con foto.

> **11/11/2026 — Planes v2.** Los planes pasaron de 6 a 4 y se pagan con **créditos**; los créditos se compran por WhatsApp. Lo que dice este documento sobre pedidos de plan por transferencia, Platino/Diamante y el ajuste `transferencia` queda reemplazado por la sección [Planes v2, créditos y destacado](#planes-v2-créditos-y-destacado) (al final).
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

## Planes v2, créditos y destacado

Decidido por Juan el 11/11/2026 (detalle en el proyecto: `claude/sexyrose-planes-v2-propuesta.md`). Backend: `lib/creditos.js`, `lib/planes.js`, `lib/planes-ref.js`, `routes/cuenta-planes.js`, `routes/admin-creditos.js`, `routes/admin-fase1.js` (ajustes), migraciones `db/050-planes-v2.sql` y `db/060-creditos.sql`. Pruebas: `test/fase1-planes.test.js`, `test/planes-v2.test.js`.

### Planes

| Código | Nombre | Mes (USD = créditos) | Semana | Fotos | Videos | Historias/día | Destacadas (historias) | Clip 5 s en la tarjeta | Destacado (1 día / 7 días) |
|---|---|---|---|---|---|---|---|---|---|
| E | Bronce | 0 (gratis) | — | 8 | 2 | 1 | 1 | no | 1 / 5 |
| D | Plata | 35 | — | 30 | 10 | 3 | 4 | sí | 2 / 9 |
| C | Oro | 90 | 27 | 500 | 200 | ∞ | 10 | sí | 4 / 20 |
| S | Star | 350 | 105 | 1000 | 500 | ∞ | ∞ | sí | — (ya va arriba; cupo 10 por provincia) |

- `null` = ilimitado en la API (`limites.historiasDia`, `limites.destacadas`). `lib/planes-ref.js` exporta `LIMITES`, `PLANES_PREVIEW` (D, C, S) y `limitesDe(plan)`.
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

### Venta de contenido (solo preparado, sin UI)

`creditos.registrarComisionVenta(cuentaId, ventaCentavos, ref)` descuenta `ajustes.comision.porcentaje` % de la venta como movimiento `comision_venta`; puede dejar el saldo hasta −`saldoNegativoMax`; más allá responde 402 (a definir con el procesador: pausar la venta o cobrar al liquidar).

## Demo pública (/demo/) — desde el 11/11/2026

- La demo es el MISMO SPA del sitio real (`HH_TARGET=sitio`) en modo demostración: todo cambio del sitio se ve también en la demo (QR de los folletos). La vieja (MVP de un solo archivo) ya no se genera.
- Build: `python3 app/scripts/build-demo.py` → llama a `build-sitio.py --demo` → `app/public/demo/` con `index.html` (cáscara con `<!--SR:DEMO-->`), `assets/` (JS/CSS/diccionario/fuentes con hash), `estado.<hash>.json` y `media/<hash>.svg`. Suma `mvp/src/prod-demo.js` (solo en la demo; `build.py` lo agrega con `HH_SITIO_DEMO=1`).
- Datos: `app/scripts/demo/perfiles.json` (16 perfiles ficticios, basados en la semilla del MVP, en ciudades de Argentina) + catálogos y precios de las semillas `app/db/010-cuentas.sql` y `060-creditos.sql` (`app/scripts/demo_datos.py`). Imágenes abstractas (rosa de línea), sin personas. Las fechas se corren a la hora de la visita.
- Sin `/api`: `prod-demo.js` reemplaza `fetch` (el estado sale del JSON; el resto responde 403 sin salir). Publicar/Ingresar/Panel muestran una tarjeta con botón al sitio real (`/registro`, `/ingresar` y sus versiones en/pt). WhatsApp/Telegram y Reportar solo avisan que es una demostración. Favoritos aparte (`sr_demo_favs`).
- Direcciones con `#` (`/demo/#/perfil/valentina`, `/demo/#/en/`); el servidor (`routes/demo-sitio.js`) solo entrega `/demo/` (no-cache, CSP `script-src 'self'`, noindex) y los archivos con hash (un año, immutable; los SVG con CSP `sandbox`). Si en la carpeta queda la demo vieja, sigue sirviéndola `server.js`.
- Cartel arriba "Demostración: perfiles ficticios." + "Ver el sitio real" (es/en/pt), `noindex,nofollow`, canonical a `https://sexyrose.net/` (`DEMO_REAL_URL` para cambiarlo).
