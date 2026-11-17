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
- `cuentas` (id uuid pk, email text unique (guardado en minúsculas), pass_hash text, email_verificado timestamptz null, estado text default 'activa' check in (activa, suspendida, baja), creado, ultimo_login, acepto_terminos timestamptz, mayor_edad_declarada boolean, nombre_completo text (desde 240: el aprobado con la verificación; interno, nunca se publica)).
- `sesiones` (token_hash bytea pk, cuenta_id fk, creado, expira, ua text).
- `tokens_email` (token_hash bytea pk, cuenta_id fk, tipo text check in (verificar, restablecer), expira, usado timestamptz null).
- `perfiles` (cuenta_id pk fk, slug text unique, datos jsonb not null default '{}', estado text default 'borrador' check in (borrador, en_revision, publicado, rechazado, pausado, suspendido), motivo_rechazo text, verificacion text default 'sin_enviar' check in (sin_enviar, pendiente, verificada, rechazada), oculto boolean default false, creado, actualizado, publicado_en timestamptz).
  - `datos` (lo edita la acompañante; el servidor valida y descarta todo lo demás): displayName (2–30), genero (mujer|trans|hombre), fechaNacimiento (YYYY-MM-DD, ≥18 años; se publica solo la edad), nacionalidad, pais, provincia, ciudad, zona, titular (≤80), bio (≤1500), titularEn, bioEn, idiomas[], alturaCm, contextura (clave del MVP HH.BUILDS), intereses[] (ids de la tabla intereses, máx 6), salidas[] (ids de categorías), tarifaDesde (USD, entero ≥0 o null), whatsapp (E.164), telegram (usuario), links[{label,url}] (máx 4, https).
- `fotos` (id uuid pk, cuenta_id fk, orden int, clave text, url text, url_mini text, ancho, alto, creado). Límite por plan (LEVELS del MVP: E 8, D 15, C 30, B 50, A 500, S 1000).
- `verificaciones` (id uuid pk, cuenta_id fk, selfie_ruta text, documento_ruta text (frente), dorso_ruta text (desde 230), formato smallint (1 = selfie + frente, 2 = frente + dorso + selfie; desde 230), estado text check in (pendiente, aprobada, rechazada), motivo text, creado, revisado timestamptz, revisado_por text, nombre_completo text (desde 240; NULL en los envíos anteriores)).
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
- `GET yo` → `Yo` = {id, email, emailVerificado, estado, perfil:{slug, estado, motivoRechazo, verificacion, oculto, datos, fotos:[{id,url,urlMini,orden}], completo:bool, faltantes:[...], faltantesClaves:[...]}, plan:{efectivo, suscripciones:[...], pedidos:[...]} (este bloque lo completa B vía función exportada de lib/planes.js `resumenPlan(cuentaId)`; si no existe todavía, A devuelve plan:{efectivo:'E', suscripciones:[], pedidos:[]}), limites:{fotos, historiasDia}, historias:[...]}.
- `PUT perfil` {datos parciales} → valida y guarda; slug se genera del displayName la primera vez (único, con sufijo numérico) y no cambia después.
- `POST perfil/enviar-revision` → si está completo (≥3 fotos, datos obligatorios, email verificado, verificación enviada) pasa a en_revision.
- `POST perfil/ocultar` {oculto:bool}.
- `POST fotos` (multipart, campo `foto`, máx 12 MB, jpeg/png/webp/heic si sharp lo soporta) → procesa y guarda → foto. `DELETE fotos/:id`. `PUT fotos/orden` {ids:[...]}. La primera foto es la principal.
- `POST verificacion` (multipart: `frente` (o `documento`), `dorso`, `selfie`, `consentimiento`, `nombreCompleto`; las tres fotos y el nombre obligatorios, si falta algo → 400) → guarda privado, estado pendiente.
- `POST historias` (multipart `foto` + `texto`) / `DELETE historias/:id`.
- Pedidos y planes (agente B, routes/cuenta-planes.js montado bajo /api/cuenta): `GET planes` → {precios, plan efectivo, suscripciones, pedidos, transferencia (texto de ajustes), cupoStar:{provincia, libres}}; `POST pedidos` {plan, periodo} → pedido pendiente con referencia y monto; `POST pedidos/:id/informar` (multipart opcional `comprobante` + nota) → informado; `POST pedidos/:id/cancelar`.

### Admin (agente B) — routes/admin-fase1.js bajo `${A}/api/` (mismo Basic Auth y reglas de POST de Fase 0: JSON + X-SR-Admin: 1 + mismo origen)
- `GET acompanantes?estado=&q=` → lista {cuentaId, email, emailVerificado, slug, displayName, ciudad, provincia, estado perfil, verificacion, plan efectivo, creado, fotos (n), fotoPrincipal, nombreCompleto, nombreCompletoVerificado}. `q` también busca por nombre completo.
- `GET acompanantes/:id` → detalle completo (datos, fotos, verificaciones con ids, pedidos, suscripciones, historias).
- `GET verificaciones/:id/selfie`, `/documento` (frente) y `/dorso` → transmite el archivo privado (no-store).
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

| Código | Nombre | Mes (USD = créditos) | Semana | Fotos | Videos | Historias/día | Destacadas (historias) | Packs a la venta | Clip 5 s en la tarjeta | Destacado (semana / mes) |
|---|---|---|---|---|---|---|---|---|---|---|
| E | Bronce | 0 (gratis) | — | 8 | 2 | 1 | 1 | 0 | no | 5 / 17 |
| D | Plata | 35 | — | 30 | 10 | 3 | 2 | 1 | sí | 9 / 30 |
| C | Oro | 90 | 27 | 500 | 200 | ∞ | 5 | 5 | sí | 20 / 67 |
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
  "precios": { "E": {"semana": Monto, "mes": Monto}, "D": {…}, "C": {…} },
  "precio": { "semana": Monto, "mes": Monto },
  "cupo": { "cupo": 2, "activos": 7, "ocupadosAhora": 1, "porcentaje": 20 },
  "proximaFechaLibre": { "semana": "ISO", "mes": "ISO" },
  "mios": [ Destacado ], "saldo": Monto }
```
`disponible: false` con `motivo` ("Con Star ya aparecés arriba de todo.", perfil sin publicar, sin provincia). Para Star `precio`, `cupo` y `proximaFechaLibre` son `null`.
*Destacado* = `{ id, cuentaId, plan, planNombre, provincia, dias: 7|30 (1 = Destacados viejos por día), desde, hasta, estado: "activo"|"programado"|"vencido"|"cancelado", costo: Monto, creado, vigente }`.

**`POST /destacado` `{ dias: 7|30, desde?: ISO }`** → **201** `{ ok, destacado, saldo }`. Por semana (7 días) o por mes (30 días) (Juan, 13/11/2026; antes 1 o 7 días). Precios en Admin → Precios (antes en Ajustes): el mes a mano y la semana calculada sola (cuarta parte del mes + recargo, 20 % por defecto, redondeada a entero) o a mano, siempre sin decimales (Juan, 15/11/2026; lo mismo para la semana de los planes); ajuste `destacado` = `{ E, D, C: {mes, semana}, semanaAuto: {activo, recargo} }` (`mezclarDestacado`/`validarDestacado` en lib/planes.js; la semilla vieja `{dia, semana}` sin tocar cuenta como no guardada). Migración 170-destacado-mes.sql (CHECK dias IN (1, 7, 30)).
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
  foto de la acompañante → Mi perfil (`/panel/mi-perfil`, desde el 17/11; antes su panel); sin sesión → "Tu espacio"
  (`/favoritos`: favoritos + Publicá tu perfil + Ingresar).
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
  Nombre hasta 16 caracteres; portada = la que elige ella (ver "Portada de la destacada" más abajo, 17/11/2026; si no
  eligió, el primer elemento); hasta 100 elementos por destacada, en el orden en que se
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
    cierra). Sin edición desde el perfil (en Mi perfil, «Nueva» crea una: ver «Nueva destacada desde Mi perfil», 17/11).
    No entran en Shorts.
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
  - Ventas: el panel de la acompañante (Contenido → Ventas) y Admin → Contenido → Ventas (antes «Ventas de contenido») muestran el tipo (Pack/Pedido).
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
- Plantillas SEO por defecto: ver «SEO: escorts y acompañantes» (13/11/2026) más abajo (sin `{salidas}`/`{actividad}`).
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
- **13/11/2026 (Juan): en pantalla "Intereses" pasa a ser "Servicios"** (EN "Services", PT "Serviços"): filtro del
  inicio, Cerca y Swipe, perfil (Sobre mí → Servicios), panel de la acompañante, ficha y menú del admin, mensajes de
  error del servidor (`lib/perfiles.js`: "Podés elegir hasta 6 servicios.", "Hay un servicio que no está en la lista.",
  "Formato de servicios inválido."). Ids, tabla `intereses`, campo `datos.intereses`, API (`/intereses`,
  `estado.intereses`) y `HH.FILTRO_INTERESES` siguen igual; ninguna dirección pública usa la palabra. El admin carga
  formas de pago como "Acepta tarjeta" o "Efectivo" (nombre 2–40 letras, id armado con el nombre); siguen siendo
  máximo 6 por acompañante.

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
  `GBA`, por nombre de partido) bajo Zona Norte / Oeste / Sur (GBA); el resto (Pilar, Escobar, La Plata…) queda sin zona
  (Juan, 13/11/2026); una ciudad ya cargada con el mismo nombre en la
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
- **Capital Federal en direcciones** (Juan, 13/11/2026): `/argentina/capital-federal`, título "Capital Federal"
  (`HH.SEO_PLACE_DEFAULTS` en `mvp/src/urls.js`). La dirección anterior `/argentina/buenos-aires` (y `/hombres`, `/en/…`,
  `/pt/…`) responde 301 a la nueva (`oldSlugs`; `parse` en `lib/seo-sitio.js` marca `redirect` cuando el lugar se
  encontró por una dirección que no es la principal).
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

## Home provisoria (pre-lanzamiento) — desde el 13/11/2026 (decisión de Juan)

Mientras el sitio está vacío, en `/` se ve solo una portada que invita a las acompañantes a publicar su perfil. Solo
acompañantes: el registro de interesados queda cerrado hasta abrir el sitio.

- **Ajuste** `prelanzamiento` = `{ activo: bool }` en `ajustes` (`app/lib/prelanzamiento.js`). **Si nunca se guardó,
  está prendida.** `config.prelanzamientoPorDefecto: false` existe solo en las pruebas (las de modo normal la pasan).
- **Admin → Ajustes** (primera tarjeta, «Home provisoria»): interruptor que guarda al tocarlo
  (`PUT ${A}/api/ajustes/prelanzamiento { valor: { activo } }`, mismas reglas que los otros ajustes; invalida
  catálogos y estado), una línea de explicación y «Perfiles publicados ahora» (`GET /ajustes` →
  `prelanzamiento: { activo, publicados }`, mismo criterio que el estado público).
- **Prendida**:
  - `GET /api/sitio/estado`: `perfiles`, `historias` y `ubicaciones` vacíos, `ajustes.prelanzamiento: true` (precios y
    demás ajustes siguen). `GET /api/sitio/perfil/:slug` y `GET /api/sitio/contenido/perfil/:slug` → 404.
  - `routes/spa-sitio.js`: lugares (`/<país>…`, `/hombres`), `/perfil`, `/cerca`, `/swipe`, `/shorts`, `/stars`,
    `/favoritos`, `/links` y `/cliente/registro` (y sus versiones en/pt) → **302** a `/`, `/en/` o `/pt/`
    (`Cache-Control: no-store`). Abiertos: portada, registro, ingreso, `/panel/…`, `/cuenta/…` (confirmar email, nueva
    contraseña), `/compra/…`, `/cliente/…` salvo el registro, páginas legales, admin y `/demo/` (sin cambios).
  - SEO: la portada sale `index,follow` con título y descripción propios (`SEO_PRELANZAMIENTO`, es/en/pt; el resto
    del `<head>` lo arma `lib/seo-sitio.js` como siempre, sin cambios en ese archivo). `/sitemap.xml` (server.js): solo
    `/`, `/en/`, `/pt/` (con hreflang) y las páginas legales.
  - `POST /api/cliente/registro` → 403 `{ error: 'Por ahora no se pueden crear cuentas nuevas. Probá de nuevo más
    adelante.', registroCerrado: true }`. Las cuentas que ya existen ingresan igual. El registro de acompañantes, igual.
  - Front: `mvp/src/prod-prelanzamiento.js` (solo sitio real; la demo no lo usa: su estado nunca trae el ajuste).
    Portada con logo, «Muy pronto», «Acompañantes y escorts en *Argentina*.», texto corto, «Publicá tu perfil»
    (registro) y «Ya tengo cuenta» (ingreso); con sesión de acompañante, «Ir a mi panel». Pie legal de siempre.
    Encabezado solo con logo, idioma, Ingresar y Publicá tu perfil; sin barra inferior (con sesión de acompañante,
    desde el 17/11: la barra solo con Inicio y su foto → Mi perfil). Dentro del sitio, lo oculto
    vuelve al inicio; el ingreso de interesados no ofrece crear cuenta. Traducciones en el mismo archivo
    (`HH.I18N`). Estilos: `.sr-pre` en `mvp/src/sitio.css`.
- **Apagada**: todo como antes.
- Vista previa del perfil de cada acompañante y Mi perfil: funcionan igual con la home prendida (ver «Vista previa
  del perfil» y «Mi perfil»).
- Tests: `app/test/prelanzamiento.test.js`.

## SEO: escorts y acompañantes — desde el 13/11/2026 (decisión de Juan; su abogado aprobó la palabra "escort")

- Plantillas por defecto (`mvp/src/seo.js` `HH.SEO_DEFAULTS` → `seo-datos.json`; Admin → SEO las muestra como "Por
  defecto" y "Volver al texto por defecto" vuelve a ellas):
  - Portada: "Escorts y acompañantes en Argentina | SexyRose" / EN "Escorts and companions in Argentina" / PT
    "Acompanhantes e escorts na Argentina". Bloque al pie: "Avisos de escorts y acompañantes en tu ciudad". El H1 de la
    portada sigue siendo el de Ajustes → Textos del inicio (no cambia).
  - País y lugar: título "Escorts y acompañantes en {lugar} | SexyRose", H1 "Escorts y acompañantes en {lugar}",
    descripción "Avisos de escorts y acompañantes en {lugar}: {cantidad} perfiles con fotos y contacto directo por
    WhatsApp o Telegram." Hombres: "Escorts hombres y acompañantes en {lugar}". EN "Escorts and companions in …" /
    "Male escorts and companions in …"; PT "Acompanhantes e escorts em …" / "Acompanhantes homens e escorts em …" (país:
    "na {pais}").
  - Perfil: "{nombre}, escort en {lugar} | SexyRose" y "{nombre}, {edad} años, escort y acompañante en {lugar}. {bio}"
    (EN "escort in", PT "acompanhante em").
  - Con un solo perfil, "{cantidad} perfiles" sale "1 perfil" (también profiles/perfis) en el servidor y en el sitio.
- Sin "verificados", garantías, precios ni actividades en estos textos (test en `admin-seo.test.js`).
- JSON-LD también en el HTML del servidor (`lib/seo-sitio.js`, `<script type="application/ld+json" data-hh-ld>`, con
  `<` escapado; el SPA los reemplaza por los suyos): portada WebSite (sin SearchAction: no hay búsqueda por texto) +
  Organization con logo `/icon-512.png`; país/lugar/hombres BreadcrumbList + ItemList (hasta 24 perfiles); perfil
  ProfilePage (Person con nombre, foto, lugar e idiomas) + BreadcrumbList. Nunca Product/Offer/Service para personas.
- `og:image`: la foto del perfil (tarjeta grande); en las demás páginas el logo (tarjeta chica).
- `sitemap.xml` con `xmlns:image`: cada perfil lleva hasta 5 fotos (`image:image`).
- Texto alternativo de las fotos (`HH.fotoAlt`, `prod-sitio.js`): "Valentina, escort en Palermo" (+ " · foto 2"),
  EN "escort in", PT "acompanhante em". Las tarjetas que todavía no cargaron la foto la ocultan (no se ve el texto).
- Robots en el navegador igual que en el servidor: /registro, /favoritos, /compra y /cliente `noindex,nofollow`.
- Recuadro de las páginas de lugar: "¿Sos escort o acompañante en {lugar}?".


## Asistente de cuenta por WhatsApp — desde el 15/11/2026 (decisiones de Juan)

Bot que atiende por WhatsApp **solo a acompañantes**: gestión de su cuenta y compra de créditos. Nunca empieza
conversaciones y **nunca acredita créditos**: solo Juan (botón "Acreditar" de Telegram → `creditos.confirmarPedido`
con `por: 'telegram'`, o el admin). Encendido/apagado desde Admin → Mensajería → WhatsApp (antes Admin → Asistente;
apagado = no se conecta a WhatsApp). La única excepción a "nunca empieza": la invitación de captación, que la manda Juan a
mano desde WhatsApp Web (ver "Admin → Mensajería y captación").

**Arquitectura**
- Contenedor aparte `agente` (`app/agente.js`, misma imagen, `node agente.js`, `infra/docker-compose.yml`): si se cae o
  WhatsApp falla, el sitio no se entera. Variables propias en `.env.agente` (`infra/server/separar-env.sh`):
  `DATABASE_URL`, `SECRETS_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (por defecto `claude-haiku-5-5`, verificado en
  la página de modelos de Anthropic el 15/11/2026), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SITE_URL`. `ANTHROPIC_*`
  no van al app. El agente no manda emails (no tiene Mailgun). No aplica migraciones: espera a que el app las cree.
- WhatsApp: conexión no oficial con Baileys (`@whiskeysockets/baileys` **6.7.24**, la última estable sin `-rc`, Node ≥ 20;
  la 6.17.16 que aparece en npm está deprecada por un fallo de seguridad, corregido desde la 6.7.22) vinculada como
  dispositivo al chip prepago (QR escaneado una vez desde el admin). Su dependencia `libsignal` viene de GitHub (fijada
  por commit en el lock): el Dockerfile instala las dependencias en una etapa `deps` con git, que no queda en la imagen.
  Sesión de Baileys en la tabla `asistente_auth`, **cifrada** con `SECRETS_KEY` (`lib/secretos.js`). Reconexión con
  espera creciente (1 → 60 s); si WhatsApp desvincula el dispositivo (401) borra la sesión y vuelve a pedir QR.
  `markOnlineOnConnect: false` (el teléfono sigue recibiendo notificaciones). Solo chats 1:1: ignora grupos, estados,
  difusiones y canales; ignora mensajes de más de 2 h (llegados con el agente apagado). "Escribiendo…" + pausa corta
  antes de cada respuesta. Archivos hasta 10 MB; como comprobante solo imagen (JPG/PNG/WebP/HEIC) o PDF, por firma.
- Telegram: Telegram permite **un solo** lector de `getUpdates`, y es el app (`lib/telegram.js`). Mientras el asistente
  está prendido (`setContinuo`, se revisa cada 15 s) el app lee `getUpdates` sin parar con
  `allowed_updates: [message, callback_query]`; la vinculación con `/start <código>` sigue igual. El agente solo envía
  (`telegram.enviar`: texto o foto/PDF con botones; `sendPhoto`/`sendDocument`). Botones con `callback_data`
  `sr:a:<token>` / `sr:r:<token>`: token al azar de 16 bytes, en la base solo su hash (`asistente_tg_acciones`), uno por
  acción. Se aceptan **solo del chat vinculado** (o `TELEGRAM_CHAT_ID` si no hay uno); otro chat → "No autorizado".
  Idempotentes: un segundo toque (o el pedido ya confirmado desde el admin) responde "El pedido ya está confirmado." y no
  acredita dos veces. Después del toque se edita el mensaje (sin botones, con el resultado). Avisos nuevos (se apagan
  desde Admin → Mensajería → Telegram como los demás): `asistente_comprobante`, `asistente_derivacion`, `asistente_alerta`. Nunca
  llevan teléfonos ni emails (`sinContacto` limpia los motivos que escribe la IA).
- Comunicación entre procesos por la base: tabla `asistente_salida` (destino `whatsapp` | `app`) + trigger que hace
  `NOTIFY sr_asistente_<destino>`; cada proceso escucha con su propia conexión (se reconecta sola) y además revisa la
  tabla cada 30 s (`escucharSalida`, `lib/asistente-comun.js`).
  - app → agente: `mensaje` (créditos acreditados / pedido rechazado; `clave` única evita repetirlo) y `desvincular`.
    `creditos.setAlCambiarPedido` dispara el aviso al confirmar o rechazar **desde Telegram o desde el admin**; va al chat
    donde se nombró el pedido o, si no hay, al último chat identificado con esa cuenta. No se manda si el asistente está
    apagado, si el chat está con una persona o si pasaron más de 24 h.
  - agente → app: `codigo_email`. El **app** genera el código de 6 números, guarda solo su hash
    (`sha256(id:código)`) y manda el email con Mailgun; el agente lo compara. Así el código nunca queda en texto plano y
    la clave de Mailgun no sale del app.

**Flujo determinístico (sin IA)** — `lib/asistente.js`
1. Primera respuesta de cada sesión (sin respuestas del bot a ese chat en 24 h): empieza con
   "Hola, soy el asistente de cuenta AI de SexyRose." (EN "Hi, I'm SexyRose's AI account assistant.", PT "Olá, sou o
   assistente de conta AI da SexyRose."). Idioma del chat por palabras frecuentes (es/en/pt).
2. Código `SR-####` en el texto (el mensaje que arma el panel al pedir créditos): busca el pedido (primero el pendiente
   con ese código), lo asocia al chat (`asistente_conv_pedidos`) y responde pack, créditos, **ARS** (=`arsSugerido`:
   USD × `cotizacion.arsPorUsd` redondeado hacia arriba a la centena, lo mismo que Admin → Créditos → Pedidos), alias,
   titular, el código como referencia y "Una vez que transfieras y se verifique el pago, se acreditan los créditos en tu
   cuenta. Mandame el comprobante por acá." Sin alias, titular o cotización: "En un rato te paso el monto en pesos y los
   datos para transferir" + aviso a Juan. Pedido confirmado / vencido / cancelado / rechazado / inexistente: mensaje propio.
   **Cuenta en dólares** (16/11/2026, Juan: "Me gustaría tener un alias para dólares"; opcional, Admin → Mensajería → WhatsApp): si
   está cargada (alias y titular en dólares), la primera respuesta a un pedido pendiente sin moneda elegida es
   "Pedido SR-1234: Trimestre Plata, 105 créditos.\n¿Vas a transferir en pesos o en dólares?" (EN "Will you transfer in
   pesos or in dollars?", PT "Você vai transferir em pesos ou em dólares?") y el chat queda esperando
   (`asistente_conversaciones.pago_pedido_id` + `pago_esperando_moneda`). La respuesta se detecta sin IA
   (`monedaEnTexto`, sin importar mayúsculas ni tildes: pesos/peso/ars/$ → ARS; dólares/dólar/dollars/usd/u$s/us$ → USD;
   mensajes de hasta 80 caracteres, una sola moneda y sin negación; lo demás lo resuelve la IA con
   `datos_transferencia(moneda)`). Pesos → el mensaje de siempre (ARS + alias y titular en pesos). Dólares → "Monto a
   transferir: USD 95." + alias y titular en dólares, el mismo aviso de revisar el titular, el código como referencia y
   el mismo cierre. Después puede cambiar ("mejor en dólares") y recibe los otros datos (repetir la misma moneda no los
   reenvía; con el comprobante ya mandado tampoco). La moneda queda en `pedidos_creditos.moneda_asistente` ('ARS' |
   'USD'); el mismo código otra vez pasa los datos de esa moneda sin preguntar. Los créditos no cambian (salen del pack).
   Sin cuenta en dólares, todo como antes: pesos directo, sin pregunta y sin guardar moneda. `crear_pedido` por chat y
   `datos_transferencia` sin moneda también preguntan primero.
3. Foto o PDF: se guarda en `DATA_DIR/privado/comprobantes` (el mismo lugar que los de la web) y se adjunta con
   `creditos.adjuntarComprobante` al pedido pendiente del chat (código en el texto de la foto, o el único pendiente del
   chat o de la cuenta identificada). Con varios pendientes pregunta cuál y adjunta cuando responde el código; sin
   ninguno, pide el código. Después, foto/PDF a Juan por Telegram con pedido, pack, créditos, USD, ARS, nombre artístico
   y los botones. Con moneda elegida por el asistente, el monto va en esa moneda ("105 créditos · en dólares: USD 95" o
   "105 créditos · en pesos: ARS 137.800 (USD 95)"); sin moneda, como antes ("USD 95 · ARS 137.800").
4. 6 números con un código de email vigente → verificación (vence a los 15 min, 5 intentos; pedir uno nuevo anula el
   anterior; máximo 3 pedidos de código por hora y chat; la respuesta no dice si el email existe).
5. "¿Sos un bot?" (es/en/pt) → "Soy un asistente de IA (inteligencia artificial), no una persona. Si preferís hablar con
   alguien del equipo, decime y te paso."
6. Más de 20 mensajes en una hora → pasa a una persona.

**IA** (`lib/asistente-llm.js`, Messages API con herramientas, `fetch` inyectable) — instrucciones con las reglas de
Juan (solo temas de cuenta; nunca actividades, recomendar o dar datos de acompañantes, tarifas, promesas, descuentos o
devoluciones, consejos legales o impositivos, funcionamiento interno, pedir contraseñas o tarjetas; interesados que
buscan a una acompañante → contacto directo desde su perfil; fuera de tema o enojo → `derivar_a_juan`). Respuestas
cortas, sin markdown (se limpia igual). Herramientas, con **permisos controlados en el código**:
- `precios`, `ayuda(tema)` (textos fijos en `lib/asistente-ayuda.js`, armados con los del sitio; Juan los edita ahí).
  Contexto de todo el sitio (17/11/2026, Juan: "que tenga contexto de toda la web sin pasar nada vital del negocio ni
  información confidencial"): además de registro, verificacion, publicar, fotos, planes, semanas, creditos, destacado,
  contrasena, email y enlaces (ahora con todas las secciones del panel y /trata), los temas `perfil`, `historias`,
  `videos`, `mis_numeros`, `avisos`, `ocultar_o_baja`, `como_funciona` (inicio, swipe, cerca, shorts, stars, filtros y
  contacto directo por WhatsApp/Telegram), `denuncias`, `idiomas` y `contenido`. Solo con textos que ya son públicos o
  que el panel le muestra a la acompañante; las pruebas revisan que ninguno nombre comisiones, porcentajes, proveedores,
  costos, servidores, captación, admin, alertas, la IA ni otros sitios (Mercado Pago solo en `contenido`). Las
  instrucciones listan estos temas en "Respondé SOLO sobre"; lo que queda afuera sigue yendo a `derivar_a_juan` como antes.
  `contenido` depende de si la venta de contenido se puede usar (Juan: "tendría que decirle 'próximamente'… hasta que no
  vincule una cuenta de MP"): el app guarda `contenido.disponible()` (cuenta de comisión activa completa, del `.env` o del
  admin) en el ajuste `venta_contenido_estado = { disponible }` al arrancar, al cargar/editar/borrar una cuenta de Mercado
  Pago y al elegir la activa (`contenido.publicarEstado`), y el agente lo lee de la base (`ventaContenidoDisponible`; no
  tiene las credenciales de Mercado Pago). Sin fila o `false` → "La venta de contenido todavía no está disponible en
  SexyRose: va a estar próximamente." (sin fechas ni motivos); `true` → cómo empezar con lo que dice el panel (Panel →
  Contenido, conectar su Mercado Pago, "Agregar pack", pedidos personalizados con Oro y Star), sin comisiones.
- `pedido_por_codigo`, `datos_transferencia(codigo, moneda?: 'ARS'|'USD')` (manda el mensaje del punto 2; USD sin
  cuenta en dólares → error "solo se puede transferir en pesos"): solo pedidos cuyo código se escribió en ese chat o de
  la cuenta identificada.
- `enviar_codigo_email(email)`.
- `estado_cuenta` (perfil, verificación, plan efectivo y plan mensual con vencimiento, saldo, últimos pedidos) y
  `crear_pedido` (reusa `creditos.crearPedido`): **solo chat identificado** — por el teléfono del perfil
  (`datos.whatsapp`, comparado sin el 9 de los celulares de Argentina; tiene que coincidir una sola cuenta activa) o por
  el código de email. Sin identificar → `{ error: 'chat_no_identificado' }`.
- `derivar_a_juan(motivo)` → chat `humano` + aviso. `alerta(tipo, motivo)` (menores, trata, abuso, amenazas, legal) →
  aviso urgente, chat `humano`, respuesta neutra.
Sin `ANTHROPIC_API_KEY` o si la API falla: lo determinístico sigue andando y el texto libre recibe "Te va a responder una
persona del equipo." + aviso a Juan (una vez cada 30 min por chat).

**Silencio** — `estado = 'humano'` (botón "Pasar a humano" del admin, `derivar_a_juan`, `alerta`, límite) hasta
"Devolver al asistente". Si Juan escribe desde el teléfono en un chat (mensaje propio que no mandó el bot), el bot calla
12 h en ese chat (`silenciado_hasta`). En silencio no se procesa nada (ni comprobantes): el mensaje solo queda guardado.
Excepción (16/11/2026): la invitación de captación (o cualquier mensaje propio a un contacto de captación "pendiente" o
"abierto") **no** silencia: marca el contacto "enviado" y queda en el chat con origen `captacion`.

**Datos** — migración `db/180-asistente.sql`: `asistente_conversaciones`, `asistente_mensajes` (dir in/out, origen
bot|juan|usuario|captacion (desde la 220), tipo, texto, archivo), `asistente_conv_pedidos`, `asistente_codigos_email`, `asistente_tg_acciones`,
`asistente_salida` (+ trigger NOTIFY), `asistente_whatsapp` (estado, QR, número, latido, IA), `asistente_auth`. Ajuste
`asistente` = `{ activo, alias, titular, aliasUsd, titularUsd }` (sin fila = apagado; alias/titular = cuenta en pesos;
un ajuste viejo `{ activo, alias, titular }` se lee igual, sin cuenta en dólares). Migración `db/190-asistente-dolares.sql`:
`pedidos_creditos.moneda_asistente`, `asistente_conversaciones.pago_pedido_id` y `pago_esperando_moneda`. Limpieza en el app al arrancar y cada 6 h
(`asistenteApp.purgar`): mensajes de más de 90 días y sus archivos (salvo los que quedaron como comprobante de un
pedido), chats sin mensajes y sin actividad en 90 días, códigos de email de más de 2 días, salida procesada de más de 7
días. Logs sin teléfonos, emails ni textos.

**Admin** (`routes/admin-asistente.js` bajo `${A}/api`, `mvp/src/prod-admin-asistente.js`; menú "Asistente" hasta el
16/11/2026, ahora Admin → Mensajería → Conversaciones y WhatsApp)
- `GET /asistente` → `{ ajustes, whatsapp: { estado: apagado|conectando|esperando_qr|conectado|desconectado, agente
  (latido < 90 s), numero (enmascarado), error, qrSvg (data:image/svg+xml, generado en el servidor con `qrcode` 1.5.4,
  solo si el QR tiene menos de 60 s) }, ia: { configurada, modelo }, conversaciones: { total, humano, captacion },
  botonCreditos: { vinculado, guardado, usa: 'vinculado'|'guardado'|null } }` (desde el 16/11/2026).
- `PUT /asistente/ajustes { activo, alias, titular, aliasUsd?, titularUsd? }` (alias 6–20: letras, números, puntos,
  guiones; titular 3–80; las mismas reglas en dólares, con los dos datos o ninguno; sin `aliasUsd`/`titularUsd` quedan
  los guardados). Admin → Mensajería → WhatsApp → "Cuenta para las transferencias": bloques "En pesos" y "En dólares (opcional)".
- Moneda elegida a la vista: `GET /asistente/conversaciones/:id` → `pedidos[].moneda` ("Pedidos nombrados en el chat":
  "· en dólares"), y `GET /pedidos-creditos` → `items[].monedaAsistente` (Admin → Créditos → Pedidos: "Transfiere en
  dólares/pesos").
- `POST /asistente/desvincular` (el agente hace logout, borra la sesión y pide QR nuevo).
- `GET /asistente/conversaciones[?estado=bot|humano|captacion&q=]` → teléfono enmascarado (`+54 9 11 ****-1234`), cuenta,
  último mensaje, estado, `captacion: { id, estado } | null`. `GET /asistente/conversaciones/:id` (chat + pedidos nombrados),
  `GET …/:id/mensajes/:mid/archivo` (privado, no-store), `POST …/:id/humano { humano: bool }`.
- (Hasta el 16/11/2026: Admin → Ajustes → Contacto avisaba que el WhatsApp tenía que ser el del chip. Desde entonces el
  botón usa el número vinculado solo: ver "Admin → Mensajería y captación".)

Pruebas: `app/test/asistente.test.js` (Baileys, Claude y Telegram falsos). Puesta en marcha y costos: `infra/README.md`
→ "Asistente de cuenta por WhatsApp".

## Admin: menú agrupado — desde el 16/11/2026 (decisión de Juan: "me marea un poco cómo está todo distribuido")

Barra lateral con títulos de grupo (en el celular, la misma fila de chips en el mismo orden, sin títulos). Lo arma
`HH.adminMenu` en `mvp/src/prod-admin.js` (`views-admin.js` lo usa si existe; la demo sin menú queda igual).

- **General**: Resumen, Métricas (desde el 16/11/2026, ver "Admin → Métricas"; con Exportar a Excel y "De dónde vienen las visitas").
- **Acompañantes**: Acompañantes (perfiles y verificación), Reportes, Interesados.
- **Cobros**: Créditos [Pedidos | Movimientos], Mensajería [Conversaciones | Captación | WhatsApp | Telegram | Mensajes]
  (antes "Asistente", desde el 16/11/2026), Planes [Suscripciones | Renovaciones],
  Destacados [Destacado | Star], Contenido [Ventas | Pedidos personalizados].
- **Sitio**: Ubicaciones, Servicios, Textos, SEO.
- **Configuración**: Precios (precios de los planes, packs de créditos, precios del Destacado, cotización del dólar y
  comisión de la venta de contenido: descuento total, costo de Mercado Pago, saldo negativo máximo) y Ajustes (Home
  provisoria, cuenta de Mercado Pago que recibe la comisión, textos del inicio; contacto para comprar créditos, avisos
  por Telegram y mensajes pasaron a Mensajería el 16/11/2026). Mismas tarjetas, botones, validaciones y "Actualizado el…"; solo cambiaron de lugar.

Cada pestaña tiene su dirección (`#admin.<sección>.<pestaña>`) y su contador; la sección muestra la suma (Créditos =
pedidos pendientes; Planes = renovaciones con problema; Contenido = pedidos personalizados sin responder). El enlace
del menú abre la primera pestaña. Las direcciones viejas siguen andando (`aliasAdmin`, reemplaza la dirección sin sumar
un paso al historial):

| Antes | Ahora |
| --- | --- |
| `#admin.pedidos` (y `#admin.pagos`) | `#admin.creditos.pedidos` |
| `#admin.creditos` | `#admin.creditos.movimientos` (era la lista de saldos) |
| `#admin.creditos.<cuenta>` | `#admin.creditos.movimientos.<cuenta>` |
| `#admin.suscripciones` / `#admin.renovaciones` | `#admin.planes.suscripciones` / `#admin.planes.renovaciones` |
| `#admin.destacados` / `#admin.stars` | `#admin.destacados.destacado` / `#admin.destacados.star` |
| `#admin.ventas` | `#admin.contenido.ventas` |
| `#admin.solicitudes` / `#admin.solicitudes.<id>` | `#admin.contenido.pedidos` / `#admin.contenido.pedidos.<id>` |
| `#admin.planes`, `#admin.contenido` | su primera pestaña |
| `#admin.asistente` | `#admin.mensajeria.conversaciones` (o `.whatsapp` si ya se sabe que el asistente está apagado o sin conectar) |
| `#admin.asistente.<chat>` | `#admin.mensajeria.conversaciones.<chat>` |
| `#admin.ajustes.contacto` / `.telegram` / `.mensajes` | `#admin.mensajeria.whatsapp` / `.telegram` / `.mensajes` |

Enlaces internos y avisos actualizados: Resumen, ficha de la acompañante, "Pedidos nombrados en el chat", cotización
("revisala en Precios"), Telegram ("Confirmalo en Admin → Créditos → Pedidos", "Revisar en Admin → Contenido → Ventas",
salto de la cotización y falta de datos del asistente → "Admin → Precios").

## Admin → Mensajería y captación — desde el 16/11/2026 (decisiones de Juan)

Una sola sección **Mensajería** (Cobros, donde estaba "Asistente"; ícono de WhatsApp) con pestañas en la dirección
(`#admin.mensajeria.<pestaña>`). No se perdió ningún ajuste ni comportamiento: los ajustes `contacto`, `mensajes` y
`asistente` siguen en la tabla `ajustes` con la misma forma; solo cambiaron de lugar las tarjetas.

| Pestaña | Qué tiene | De dónde vino |
| --- | --- | --- |
| Conversaciones | chats del asistente ("Pasar a humano" / "Devolver al asistente", pedidos nombrados en el chat), chips Todas / Con una persona / Con el asistente / **Captación**; aviso si el asistente está apagado o sin conectar | Admin → Asistente |
| Captación | ver abajo | nuevo |
| WhatsApp | el único chip del asistente: prendido/apagado, estado y QR, "Desvincular", **Botón de comprar créditos** (número que usa + "Probar") y cuenta para las transferencias (pesos y dólares) | Admin → Asistente y Ajustes → Contacto |
| Telegram | vincular tu Telegram (avisos y botones), qué avisos llegan, y "Telegram para comprar créditos" (usuario + "Mostrar también Telegram") | Ajustes |
| Mensajes | mensaje del pedido de créditos (es/en/pt) + "Tu respuesta" (ajuste `mensajes`) y la invitación de captación (ajuste `captacion`) | Ajustes + nuevo |

Contador del menú: el mismo de antes (chats con una persona), en la pestaña Conversaciones; se carga al abrir el panel.
Ajustes muestra una tarjeta "Contacto, Telegram y mensajes" con enlaces a las pestañas nuevas. Los avisos de Telegram
dicen "Admin → Mensajería" (antes "Admin → Asistente").

**Botón de comprar créditos** — `creditos.contacto()` devuelve como `whatsapp` el número del chip **vinculado**
(`asistente_whatsapp.numero`, lo guarda el agente al conectar; queda aunque se corte la conexión) y, hasta que se vincule,
el que estaba cargado a mano en el ajuste `contacto.whatsapp` (no se borra; ya no hay campo para editarlo). Además
`whatsappGuardado` y `whatsappOrigen` ('asistente' | 'guardado' | null). Lo usan el panel de la acompañante (pedido de
créditos y `canales.whatsapp`) y "Probar". `PUT /ajustes/contacto` sin `whatsapp` (Mensajería → Telegram) deja el número
guardado como estaba. La pestaña WhatsApp dice "Usa el número vinculado: …" o "Hasta que vincules el chip, el botón usa
el número que tenías cargado: …".

### Captación (semiautomática: Juan toca Enviar)

Invitar a acompañantes que publican en otros sitios (la planilla `sexyrose-contactos.xlsx` de Juan, hoja "Contactos").
`lib/captacion.js`, `lib/xlsx-lector.js`, `routes/admin-captacion.js`, `mvp/src/prod-admin-captacion.js`.

- **Importar** (`POST /captacion/importar?nombre=…`, cuerpo = el archivo como `application/octet-stream`, con
  `X-SR-Admin: 1` y mismo origen; hasta 8 MB): .xlsx (lector propio sin dependencias: ZIP + `sharedStrings` + la hoja
  "Contactos" o, si no está, la primera; nunca evalúa fórmulas; límites de 40 MB por XML descomprimido, 120 MB en total,
  20.000 filas y 60 columnas) o .csv (`,` `;` o tab, comillas, BOM). Encabezados sin importar mayúsculas ni tildes
  (Nombres, Teléfono/WhatsApp/Celular, Categoría, Ciudad, Sitios, Cantidad de avisos, URL, Fecha, Estado, Nota; "Abrir
  WhatsApp" se ignora). Teléfonos a E.164 de Argentina (`+549…`: acepta +54 9 11…, +54 11…, 011 15…, 11 …); una fila
  por teléfono (se unen nombres, ciudades, categorías, sitios, enlaces; avisos se suman). Volver a subir une sin
  duplicar (avisos = el mayor) y **conserva los estados**. El "Estado" de la planilla solo se toma si evita escribir de
  más (no escribir, descartado, revisar, enviado).
- **Ya está en el sitio**: el teléfono es el WhatsApp de un perfil (`perfiles.datos.whatsapp`, comparado sin el 9; las
  cuentas no tienen otro teléfono) → `en_sitio`, nunca en la cola.
- **Seguridad**: nombres o nota con palabras que sugieren una menor o alguien muy joven (pendeja/pendejita, jovencita,
  nenita, nena, lolita, colegiala, teen, menor, adolescente, niña, pibita, secundaria, 10 a 17 años, "tengo 15",
  "recién cumplidos"…; sin importar mayúsculas ni tildes; "Nina" no cuenta) → `revisar` con el motivo. Igual números
  extranjeros o inválidos, y lo que la planilla marca "Revisar". "Revisar" **nunca** entra en la cola ni puede abrirse
  (409) hasta que Juan lo revise uno por uno: "Revisado: es mayor de edad" (pide confirmar; → pendiente, `revisado`)
  o "Descartar". Una planilla nueva que trae esas palabras para un contacto pendiente no revisado lo pasa a revisar.
- **Estados** (`captacion_contactos.estado`): pendiente, abierto (tocó "Abrir chat"), enviado, respondio, se_registro,
  no_escribir, revisar, descartado, en_sitio. Cambios a mano (`POST /captacion/:id/estado`): enviado (desde
  pendiente/abierto), revisado, descartado, no_escribir, pendiente (deshacer abierto/enviado). "No escribir" no vuelve
  nunca a la cola.
- **Los N del día** (`GET /captacion` → `cola`): N = `ajustes.captacion.porDia` (1–200, por defecto 30) menos los enviados
  hoy (hora de Argentina); primero los "abiertos" sin enviar, después más avisos, después ciudad. Cada fila: nombres,
  ciudad, categoría, sitios y avisos, teléfono enmascarado, "Abrir chat" (`https://wa.me/<número>?text=<invitación>` en
  otra pestaña; Juan tiene WhatsApp Web con el chip del asistente) y "Marcar enviado".
- **Agente** (`lib/asistente.js`): un mensaje propio (no del bot) que es la invitación (mismo texto sin importar
  espacios, mayúsculas ni asteriscos) o cualquier mensaje a un contacto pendiente/abierto → `enviado`, el chat queda con
  `captacion_id` y **no** se silencia. En un chat `@lid` sin número, se asocia al único "Abrir chat" de los últimos 20 min.
  Cuando ella responde → `respondio`, y el asistente contesta con el contexto de la invitación (instrucciones extra:
  la invitaron porque vimos su perfil en otro sitio; registro, Bronce gratis, planes, fotos, verificación,
  `{SITE_URL}/registro`; si pregunta de dónde sacamos el número: de su aviso publicado en otro sitio; no insistir) y la
  presentación como IA al empezar. "No", "no me interesa", "baja", "no me escriban", insultos (sin IA) o la herramienta
  `no_contactar` (solo en estos chats) → una sola respuesta "Perfecto, no te vamos a escribir más. Disculpá la
  molestia." (con "¿quién te dio mi número?": antes "Tu número lo vimos en tu aviso publicado en otro sitio.") y
  `no_escribir`; otro "no" después no se contesta. Si después Juan escribe a mano en ese chat, rige el silencio de 12 h.
- **Se registró**: trigger `captacion_registro` en `perfiles` (al crearse o al cambiar `datos.whatsapp`) → `se_registro`
  con la cuenta.
- **Números** arriba: enviados hoy / esta semana, pendientes, respondieron (y % sobre los contactados), se registraron
  (y cuántos después de la invitación), para revisar, no escribir. "Toda la lista" con chips por estado y búsqueda
  (`GET /captacion/contactos?estado=&q=`, hasta 200). **Vaciar lista** (`POST /captacion/vaciar {confirmar: true}`, con
  confirmación): borra todos los que no se registraron.
- **Invitación** (Mensajería → Mensajes, `PUT /captacion/ajustes { mensaje?, porDia? }`; vacío = el texto aprobado por
  Juan, sin línea de baja por decisión suya): "Hola, ¿cómo estás? Te escribimos de SexyRose (sexyrose.net). Vimos tu
  perfil publicado en otro sitio…".

Datos: migración `db/220-mensajeria-captacion.sql` (`captacion_contactos`, `captacion_comparable()`,
`asistente_conversaciones.captacion_id`, origen `captacion` en `asistente_mensajes`, trigger `captacion_registro`).
Pruebas: `app/test/mensajeria.test.js`.

## Admin → Métricas — desde el 16/11/2026 (decisión de Juan: "En general quiero poder visualizar los KPIs con gráficos en lo posible")

Sección nueva en **General**, debajo de Resumen (Resumen no cambia: sigue con los pendientes). Período en la dirección:
`#admin.metricas.7d` · `.30d` · `.90d` · `.12m` (sin período: 30 días). Tramos en hora Argentina: por día (7 y 30 días),
por semana de lunes a domingo (90 días = 13 semanas) y por mes (12 meses). El período arranca al comienzo de un día,
semana o mes y termina ahora; se compara con la misma duración justo antes. Cada sección tiene un "¿Qué cuenta?" con
las definiciones exactas.

API: `GET ${A}/api/metricas?periodo=7d|30d|90d|12m` (`routes/admin-metricas.js` + `lib/metricas.js`), una consulta
por medida (todas en paralelo; índices en `200-metricas.sql`). Cada medida trae `{ serie, total, anterior }`.
`config.metricasAhora` (solo pruebas) fija el "ahora".

| Sección | Medida | Definición |
| --- | --- | --- |
| Ingresos | Créditos vendidos (US$) | `pedidos_creditos` confirmados, `paga_usd`, por `confirmado`; separado por `moneda_asistente` (ARS / USD / sin dato) |
| | Equivalente en pesos | solo referencia: total × cotización de hoy (los pedidos no guardan los pesos transferidos) |
| | Venta de contenido / comisión ($) | `ventas_contenido` aprobadas, `monto_centavos` y `comision_centavos`, por `pagado` (reembolsadas no) |
| Acompañantes | Registros | `cuentas.creado` |
| | Verificadas | primera verificación aprobada de cada cuenta (`min(revisado)`) |
| | Publicadas / verificadas ahora | foto de hoy (no hay historial exacto de despublicaciones: no se dibuja curva) |
| | Por plan ahora | plan efectivo de cada perfil publicado (sin plan pago = Bronce) |
| | Cuentas con plan pago | Plata/Oro/Star vigente al cierre de cada tramo según `suscripciones` (activas y vencidas; las canceladas no) |
| Créditos | Créditos gastados por tipo | −SUM(centavos) de `renovacion_plan`, `semana`, `subida_temporal`, `destacado` (neto de devoluciones), `comision_venta`; no `ajuste_admin` |
| | Renovaciones automáticas | suscripciones `origen = 'creditos'` con nota "Renovación automática…" o "Renovación al cargar créditos" |
| | Bajas de plan al renovar | renovaciones con nota "Renovación automática (cambio de …)" |
| | Pausas por falta de saldo | `avisos_plan` tipo `pausa` (por `enviado`); "ahora" = filas de `renovaciones_pendientes` |
| | Planes terminados | suscripción mensual o manual vencida en el período sin otra mensual/manual que siga (±1 min) y sin pausa |
| Interesados | Interesados, pedidos personalizados | `clientes.creado`, `solicitudes.creado` |
| | Packs vendidos / contenidos de pedidos pagados | ventas aprobadas `tipo = 'pack'` / `'pedido'` |
| | Asistente | chats nuevos (`asistente_conversaciones.creado`) y mensajes recibidos (`dir = 'in'`; se borran a los 90 días: en períodos más largos se avisa y no se compara) |
| Tráfico | Páginas vistas, visitas a perfiles, clics WhatsApp/Telegram, contacto (clics ÷ visitas), Top 10 por visitas y por clics | tablas `metricas_sitio_dia` y `metricas_perfil_dia`; antes del primer día medido los tramos quedan "sin medición" (no en cero) y, si el período anterior no se midió entero, no se compara |
| | De dónde vienen las visitas (desde el 16/11/2026) | páginas vistas por categoría de llegada (`metricas_origen_dia`), columnas apiladas + un tile por categoría con el total del período y cuántas fueron visitas a perfiles (`metricas_perfil_origen_dia`); "Sin dato" (gris) = páginas vistas − suma de las categorías (lo de antes de medir el origen o sin origen conocido, nunca "Directo"); se compara solo si el origen se midió en todo el período anterior |

Gráficos propios en SVG (`mvp/src/prod-admin-metricas.js`, sin bibliotecas ni CDN), dibujados al ancho real de su caja
(se redibujan al cambiar el ancho): columnas (apiladas con 2 px de separación) para montos y cantidades, líneas para
tendencias de 2–3 series, barras horizontales para la distribución por plan. Paleta categórica validada para la
superficie del panel (`#221F28`). Tooltip con mouse, toque y teclado (flechas, Inicio, Fin, Esc), leyenda con 2+
series, texto para lectores de pantalla y "Ver tabla" con los mismos números (el último tramo dice "en curso": termina
ahora). Sin datos: un aviso por gráfico, sin ejes. Desde el 16/11/2026 el motor de gráficos, los tiles con comparación y
sus estilos están en `mvp/src/graficos.js` (`HH.graficos`), compartido con Mis números del panel de la acompañante
(build del admin y del sitio; en el sitio, números y fechas en el idioma elegido y textos por el diccionario).

### Exportar a Excel — desde el 16/11/2026 (decisión de Juan)

Botón **Exportar** arriba (junto a Actualizar): descarga el período elegido como `.xlsx`
(`GET ${A}/api/metricas/exportar?periodo=7d|30d|90d|12m`, mismo Basic Auth; 400 si el período no existe;
`Content-Disposition: attachment; filename="sexyrose-metricas-<período>-<AAAA-MM-DD>.xlsx"` con la fecha argentina de
generación; `Cache-Control: no-store`). Se arma en el servidor con los mismos datos de `metricasPeriodo`
(`lib/metricas-excel.js`) y un escritor propio sin dependencias (`lib/xlsx.js`: Office Open XML en un ZIP con deflate de
`zlib` y CRC-32 propio; la imagen de Docker no cambia). Hojas:

- **Resumen**: período, desde/hasta, período anterior, granularidad, fecha de generación y cada indicador con Unidad,
  Período, Período anterior y Variación (%) (vacía si el anterior es 0 o no se puede comparar).
- **Ingresos**, **Acompañantes**, **Créditos y renovaciones**, **Interesados y contenido**, **Tráfico** y
  **De dónde vienen**: filas = tramos (Día / Semana desde el lunes / Mes, como fechas de Excel), columnas = las series de
  los gráficos y tiles con la unidad en el encabezado (USD, ARS, créditos, cantidad, %), fila "Total del período" y notas
  (el último tramo está en curso; en Tráfico, antes del primer día medido las celdas quedan vacías). Acompañantes suma
  abajo la foto de ahora (por plan, activas, verificadas, publicadas).
- **Top 10 por visitas** y **Top 10 por clics**.

Números como números (enteros `#,##0`, decimales `#,##0.00`, porcentajes como fracción con `0.0%`), encabezado fijo.
Pruebas: `app/test/numeros.test.js` (lo vuelve a leer con un lector de ZIP propio y, si hay Python con openpyxl, también
con openpyxl).

### Tráfico sin datos personales (`POST /api/sitio/evento`)

- El sitio real (`mvp/src/prod-metricas.js`, solo en el build del sitio; ni la demo ni el admin lo incluyen) manda
  `{ tipo: 'pagina' }` al ver inicio, país o lugar y `{ tipo: 'vista', perfil }` al ver un perfil (una vez por perfil y
  pestaña: `sessionStorage`; si ya lo vio, cuenta como `pagina`), y `{ tipo: 'whatsapp' | 'telegram', perfil }` al
  tocar esos botones (la hoja de contacto). `fetch` con `keepalive`, sin cookies (`credentials: 'omit'`), `X-SR: 1`.
  No manda nada: en la demo, antes de tener datos, en el panel, ni cuando la acompañante con sesión mira su propio perfil.
- Servidor (`routes/sitio.js`): mismo origen + `X-SR`, JSON de hasta 1 KB, robots y navegadores automáticos → 204 sin
  contar (`esBot`), 120 eventos cada 10 min por conexión (429), la misma conexión con el mismo evento sobre el mismo
  perfil cuenta hasta 3 por hora, solo perfiles visibles en el sitio (404), home provisoria → 204 sin contar. La IP se
  usa solo en memoria (con sal y hash) para esos límites, en un limitador propio para no desplazar las claves del general.
- Se guarda solo `metricas_perfil_dia (cuenta_id, dia, vistas, whatsapp, telegram)` y `metricas_sitio_dia (dia,
  vistas)` (`dia` = fecha argentina, suma con upsert). Nunca IP, navegador, cookie ni identificador del visitante. Los
  totales por día se conservan; si la cuenta se borra, los de su perfil se borran con ella.
- **Origen de la visita** (desde el 16/11/2026, solo admin): al cargar el sitio, `prod-metricas.js`
  (`HH.origenTrafico`) clasifica la llegada de la pestaña y guarda solo la categoría en `sessionStorage` (`sr_origen`);
  cada aviso `pagina`/`vista` lleva `origen` (los clics no). Reglas, en orden:
  1. `utm_source` en la dirección de llegada: nombres conocidos → su categoría (google, bing, duckduckgo, yahoo, yandex,
     ecosia, brave… → buscadores; instagram/ig, facebook/fb, x/twitter, tiktok, reddit… → redes; whatsapp/wa,
     telegram/tg → mensajeria; un dominio como `instagram.com` se clasifica como referrer); cualquier otro → `otros`.
  2. Sin referrer → `directo`.
  3. Referrer del propio sitio (o `*.sexyrose.net`) → no es un origen: si la pestaña ya tenía uno guardado se usa ese;
     si no se puede saber, el aviso va sin origen ("sin dato"), nunca "Directo".
  4. Dominio del referrer (o app de Android `android-app://<paquete>`): Google (cualquier `google.*`), Bing,
     DuckDuckGo, Yahoo, Yandex, Ecosia, Brave Search, Baidu, Startpage, Qwant… → `buscadores`; Instagram, Facebook
     (`m.`, `l.`, `lm.`), fb.com/fb.me, Messenger, X/Twitter, t.co, TikTok, Reddit, Threads, LinkedIn, Pinterest,
     YouTube, Snapchat, Tumblr, Bluesky… → `redes`; wa.me, whatsapp.com, t.me, telegram.org/.me → `mensajeria`;
     cualquier otro sitio → `otros`.
  El primer origen de la pestaña queda: la navegación interna y las recargas no lo cambian. Nunca viaja ni se guarda la
  dirección ni el dominio. Servidor: `origen` opcional, si viene tiene que ser uno de
  `buscadores | redes | mensajeria | otros | directo` (si no, 400). Tablas (`210-origen-trafico.sql`):
  `metricas_origen_dia (dia, origen, vistas)` (todas las páginas vistas) y
  `metricas_perfil_origen_dia (cuenta_id, dia, origen, vistas)` (visitas a perfiles; se borran con la cuenta). Lo de
  antes de esta migración no tiene origen. Las acompañantes no ven orígenes.

## Panel de la acompañante agrupado y Mis números — desde el 16/11/2026 (decisiones de Juan)

Panel (`PANEL_GRUPOS` en `mvp/src/prod-sitio.js`), mismos contenidos de antes, solo reordenados: en la computadora,
títulos de grupo en la barra lateral (como el admin, `.dash-nav-h`); en el celular, la misma fila de chips en el mismo
orden, sin títulos. Las direcciones `/panel/<sección>` y los contadores no cambian.

- **Inicio**: Resumen, Mis números (nuevo, `/panel/numeros`, `/panel/numeros/7d|30d|90d`; sin período: 30 días).
- **Mi aviso**: Mi perfil, Fotos, Verificación, Historias.
- **Visibilidad**: Plan, Destacado, Créditos.
- **Ventas**: Contenido, Pedidos.
- **Cuenta**: Avisos, Cuenta.

**Mis números**: `GET /api/cuenta/numeros?periodo=7d|30d|90d` (sesión de la acompañante; 401 sin sesión, 400 con otro
período; `lib/metricas.js → numerosCuenta`). Solo su perfil (`metricas_perfil_dia`): `vistas`, `whatsapp`,
`telegram`, `clics` (WhatsApp + Telegram), cada uno `{ serie, total, anterior }`, y `contacto { total, anterior }`
(toques ÷ visitas, en %, `null` sin visitas). Tramos por día (7 y 30 días) o por semana de lunes a domingo (90 días),
en hora Argentina, comparados con la misma duración justo antes. `desdeMedicion` = el más tardío entre el primer día
medido del sitio y el alta de su cuenta; `comparable` = el período anterior se midió entero (si no, los tiles dicen
"Sin comparación con el período anterior"). `hayDatos` = tiene alguna fila (si no, estado vacío). Sin orígenes, sin
datos de otras cuentas ni posiciones.

Vista: selector 7 / 30 / 90 días, tiles Visitas a tu perfil, Toques en WhatsApp, Toques en Telegram y Tasa de
contacto (con la variación como en el admin), un gráfico de líneas "Visitas y toques" (`graficos.js`, con tooltip y
"Ver tabla") y la línea "¿Qué cuenta?" (se abrió tu perfil y toques en tus botones de WhatsApp y Telegram; no incluye
sus propias visitas; tasa = toques ÷ visitas). Textos nuevos en inglés y portugués. Pruebas: `app/test/numeros.test.js`.

## Arreglos del panel — 17/11/2026 (pedidos de Juan)

**Verificación en tres fotos.** `POST /api/cuenta/verificacion` (multipart) pide `frente` (también vale `documento`),
`dorso` y `selfie` (selfie sosteniendo el documento) + `consentimiento`. Si falta cualquiera de las tres → 400
"Subí las tres fotos: el frente y el dorso de tu documento y una selfie sosteniéndolo." Mismo tratamiento que antes:
`procesarPrivada` (JPEG sin EXIF, máx. 2400 px, sin marca de agua), disco privado `verif/<hex>-doc|dorso|selfie.jpg`,
sin dirección pública, 5 envíos por día, reenviar reemplaza la pendiente y borra sus archivos. Migración
`230-verificacion-tres-fotos.sql`: `dorso_ruta` y `formato` (1 = formato anterior: selfie con el documento + frente;
2 = tres fotos). Las pendientes del formato anterior se revisan igual: el admin muestra lo que hay con la etiqueta
"Formato anterior" y no se le pide a nadie que reenvíe salvo que se rechace. Admin (`GET acompanantes/:id`):
cada verificación trae `tieneDorso` y `formato`; las tres fotos van una al lado de la otra (Frente, Dorso, Selfie),
clic = zoom como antes; aprobar/rechazar sin cambios. Al decidir se recomprimen las tres; la purga de los 90 días
(`retencionVerif`) borra las tres y deja las rutas en NULL. El aviso de Telegram no cambia (no describe el contenido).
Pruebas: `app/test/verificacion-tres-fotos.test.js`.

**"Para publicar te falta" con "Completar".** `GET /api/cuenta/yo` suma `perfil.faltantesClaves` (mismo orden que
`faltantes`; `lib/perfiles.js → faltantesItems`): `email`, `nombre`, `genero`, `nacimiento`, `ubicacion`,
`contacto`, `fotos`, `verificacion`. En Resumen (único lugar donde aparece la lista) cada renglón tiene "Completar"
(EN Complete, PT Completar), que lleva a la sección y deja a la vista y con foco el campo: Mi perfil (nombre, género,
fecha de nacimiento, provincia/localidad/barrio, WhatsApp), Fotos (botón Subir fotos), Verificación (primera foto).
El email se confirma con el link del email: "Completar" lleva al aviso de arriba con "Reenviar".

**Panel en el celular agrupado.** En lugar de la fila de chips: un botón con la sección actual (grupo + nombre) y
"Secciones" que abre las mismas secciones agrupadas que la barra lateral (Inicio, Mi aviso, Visibilidad, Ventas,
Cuenta), con los contadores; un punto en el botón avisa si otra sección tiene contador. Se cierra al elegir, con
Escape o tocando afuera. La computadora no cambia.

**Fotos y videos del panel.** Grilla de mosaicos iguales (4:5, `object-fit: cover`) que no se pisan a ningún ancho;
cada uno con sus controles abajo: "Hacer principal" (la principal muestra "Principal" sobre la foto, borde y
"Se ve primero"), mover antes/después y borrar. Los videos usan el mismo mosaico (sin "Hacer principal").

**Foto en el círculo de arriba.** Con sesión, el círculo del encabezado (antes las iniciales) y la tarjeta de la barra
lateral muestran la miniatura pública (`urlMini`, la procesada con marca de agua) de su foto principal; sin fotos,
las iniciales. Se actualiza al cambiar la principal o subir la primera.

## Vista previa del perfil — desde el 17/11/2026 (pedido de Juan)

"Los acompañantes deberán poder ver su perfil (vista previa) incluso si el home provisorio está habilitado."

- **API** `GET /api/cuenta/vista-previa` (`routes/cuenta.js`, `auth.requireCuenta`; 401 sin sesión). Siempre el perfil
  de la cuenta de la sesión: no recibe slug ni id (otra acompañante solo ve el suyo). En cualquier estado (borrador,
  en revisión, rechazado, oculto, pausado) y con la home provisoria prendida o apagada. Lo último guardado, armado con
  la misma función que el estado público (`routes/sitio.js → perfilesPublicos`: fotos y videos listos dentro del
  límite del plan, clip de la tarjeta desde Plata, Destacado, historias destacadas; historias vigentes con
  `historiaPublica`). → `{ ok, perfil, historias, ubicaciones, publico }` (`perfil` con la forma de
  `/api/sitio/perfil/:slug`; `ubicaciones`: su lugar y los que lo contienen, como `ubicacionesUsadas`; `publico`: hoy lo
  ve cualquiera: publicado, verificado, no oculto, cuenta activa y home provisoria apagada). Nunca email, documento ni
  fecha de nacimiento (solo la edad). `Cache-Control: no-store` y `X-Robots-Tag: noindex, nofollow`.
- **Página** `/panel/vista-previa` (en/pt: `/en/panel/vista-previa`, `/pt/panel/vista-previa`; clave `panel.vista-previa`):
  es del panel, así que sigue abierta con la home provisoria, sale `noindex,nofollow` (meta y X-Robots-Tag), no está
  en el sitemap y su cáscara va con `Cache-Control: no-store`. Sin sesión → ingreso (y vuelve ahí al entrar).
  Dibuja el perfil con la MISMA vista pública (`views-public.js → HH.profileView(slug, { preview: true })`: como lo
  ve un visitante, con tarifa y botones de contacto, sin los avisos de "tu perfil" y sin sumar visitas). Datos
  pedidos de nuevo cada vez que entra. Mientras se ve, `HH.db` es una copia con solo su perfil; al salir vuelve el del
  sitio (`prod-sitio.js`, bloque «Vista previa»).
- **Barra** fija debajo del encabezado: «Vista previa: así se va a ver tu perfil. Solo vos la ves.» + «Con lo último
  que guardaste. Lo que toques acá no suma visitas ni contactos.» (en el celular solo la primera línea) y «Volver al
  panel» (a la sección de donde vino). EN/PT en `HH.I18N`. Estilos `.sp-vp` en `mvp/src/sitio.css`.
- **Contacto**: WhatsApp, Telegram y «Me interesa» funcionan (abren su propio número: sirve para probarlos) y no
  cuentan: la página es del panel (el aviso de tráfico no la cuenta) y el perfil es el suyo (sus propias visitas y
  toques nunca se cuentan). Reportar, Compartir, Links y las migas no hacen nada: avisan «Es una vista previa: esto
  funciona cuando tu perfil esté publicado.» (si ya es público: «… en tu perfil público.»).
- **Solo para mirar** (17/11, Juan: "está mal que desde vista previa pueda hacer eso"; tocar la foto abría el selector
  de archivos): exactamente lo que ve un cliente. Sin el "+" del avatar; el avatar sin historias no es un botón (nunca
  el selector); con historias, el anillo las abre como para un cliente; sus historias y destacadas sin el "⋯"
  (`HH.storyOwnMenu` → null mientras `HH.esVistaPrevia()`). Subir y borrar van en Mi perfil.
- **Entradas**: «Ver vista previa» en Resumen y en Mi perfil del panel (arriba a la derecha) y en el menú de la cuenta.
  La tarjeta de la barra lateral lleva «Ver mi perfil» → Mi perfil (`/panel/mi-perfil`).
- **Sin cambios** para el público: con la home provisoria prendida, `/api/sitio/perfil/:slug` sigue en 404 y
  `/perfil/…` en 302 para todos (sin sesión, con la de otra acompañante o con la suya).
- Tests: `app/test/vista-previa.test.js`.

## Mi perfil (como Instagram) — desde el 17/11/2026 (pedido de Juan)

"Lo que quiero es que abajo en la barra flotante esté el perfil de uno mismo como Instagram."

- **Página** `/panel/mi-perfil` (en/pt: `/en/panel/mi-perfil`, `/pt/panel/mi-perfil`; clave `panel.mi-perfil`). Ruta del
  panel a propósito: queda abierta con la home provisoria, `noindex,nofollow` (meta y X-Robots-Tag), fuera del sitemap,
  sin sesión → ingreso, el aviso de tráfico no cuenta el panel; la cáscara va con `Cache-Control: no-store` como la vista
  previa (`routes/spa-sitio.js`). Título «Mi perfil · SexyRose».
- **Datos**: los de la vista previa (`GET /api/cuenta/vista-previa`: solo su cuenta, en cualquier estado, sin caché;
  `prod-sitio.js` usa la misma copia `VP` de `HH.db`, pedida de nuevo al entrar). Nunca datos de otras; no suma
  visitas ni toques (no llama a `HH.view` y no tiene botones de contacto).
- **Dibujo**: `HH.profileView(slug, { own: true, aviso, acciones })` (`views-public.js`), la misma vista pública con:
  - el "+" del avatar y la hoja «Nueva historia»; el avatar abre sus historias activas o, sin historias, la subida;
  - el "⋯" en sus historias y destacadas (Eliminar historia / Quitar de la destacada / Cambiar portada);
  - «Nueva» primero en la fila de destacadas (ver «Nueva destacada desde Mi perfil» más abajo);
  - debajo de la cabecera, en lugar del contacto, dos botones iguales (`.pf-own`): «Editar perfil» (→ Panel → Mi
    perfil) y «Mi panel» (→ Resumen; con el mismo punto de aviso que la barra). Sin migas, Compartir ni Reportar.
    La tarifa se ve como en el público.
  - arriba, si hoy el público no la ve (`publico: false`), un aviso corto con los textos del panel: oculto «Tu perfil
    está oculto: nadie lo ve en el sitio.»; pausado por saldo; si no está publicado, el texto de su estado (Resumen);
    con la home provisoria, «Todavía no se ve en el sitio: abrimos muy pronto.»; si no, «Tu perfil no se ve en el sitio
    por ahora.». EN/PT en `HH.I18N`.
- **Entradas**: barra inferior (su foto, último ícono, «Mi perfil», marcada en esa página; mismo punto de aviso que
  antes); menú de su foto arriba a la derecha (Mi panel · **Mi perfil** · Ver vista previa · Favoritos · Cerrar
  sesión; es la entrada en la computadora, que no tiene barra inferior); «Ver mi perfil» en la tarjeta de la barra
  lateral del panel. En la computadora «Mi panel» del encabezado no queda marcado en Mi perfil.
- **Barra con la home provisoria**: con sesión de acompañante, solo Inicio y su foto (Swipe, Cerca y Shorts vuelven a la
  portada); sin sesión o con un cliente, sin barra como antes (`prod-prelanzamiento.js`).
- **Su perfil público** (`/perfil/<su-slug>` con su sesión, home provisoria apagada): lleva a Mi perfil (`replace`),
  como Instagram al tocarse a una misma. Visitantes, clientes y otras acompañantes lo ven como siempre.
- Tests: `app/test/mi-perfil.test.js`, `historias-perfil.test.js` (dibujo con `own` y `preview`), `vista-previa.test.js`
  (página sin caché, noindex, fuera del sitemap, sin métricas) y `historia-borrar-proteccion.test.js` (sin "⋯" en la
  vista previa).

### Nueva destacada desde Mi perfil — 17/11/2026 (pedido de Juan)

"En el perfil necesito que esté para agregar historia destacada, como en Instagram, al ir al perfil de uno mismo como
acompañante. Debe ser así como la imagen y decir algo como 'new'."

- **Dónde**: solo en Mi perfil (`HH.profileView(slug, { own: true })`). Nunca en la vista previa, en su perfil público,
  en perfiles ajenos ni para visitantes o clientes (`views-public.js` pasa `{ own }` a `HH.highlightsRow`; en el sitio,
  `prod-sitio.js` agrega el círculo con `HH.highlightNewHtml(p)`, que exige `HH.storyUploadOn(p)`: su sesión y su perfil).
- **Círculo**: primero en la fila de destacadas, el mismo de «Tu historia» del inicio (`.story-add`: círculo vacío con
  borde fino y "+"; 72 px, 80 px desde 720 px como las destacadas) con «Nueva» (EN New, PT Nova) debajo. Aparece aunque
  todavía no tenga destacadas (la fila queda solo con ese círculo). La demo no tiene cuentas: no lo muestra.
- **Tocar**: si ya llegó al límite de su plan (`limites.destacadas` de `/yo` contra `destacadas.length`; `null` =
  ilimitadas), aviso «Llegaste al límite de destacadas de tu plan.» (el texto del panel) y no se abre nada. Si no, la
  hoja «Nueva destacada» (mismo estilo que «Nueva historia»):
  - «Nombre de la destacada» (hasta 16 caracteres, como el panel; vacío → «Ponele un nombre a la destacada.»);
  - «Elegí fotos o videos» («Elegí fotos» si el panel no permite videos): selector del dispositivo con varios archivos,
    mismos tipos que el panel; video solo con `videosHabilitados`, hasta 95 MB y 60 s (mismos mensajes); hasta 100
    por destacada;
  - miniaturas de lo elegido (cada una con "×" para sacarla antes de subir);
  - **Portada** (17/11/2026, Juan: "no me deja elegir la portada, deberá ser 'cover' antes de publicarla"), debajo de
    las miniaturas: círculo con la portada actual, «Portada» y «Automática: la primera foto o video.» o «La elegiste
    vos.»; «Tocá una para usarla de portada». Por defecto, la automática: la primera elegida (cartel «Portada» en esa
    miniatura). Tocar una foto la elige (cartel y borde). «Subir otra imagen»: una imagen aparte del dispositivo (JPG,
    PNG, WebP o HEIC, hasta 12 MB: las reglas de «Cambiar portada»). «Usar la automática» vuelve a la automática. Si
    saca con "×" la foto elegida, vuelve la automática. **Videos**: no se eligen de portada desde la hoja (todavía no
    tienen su imagen): tocar uno avisa y, si hay videos, la hoja dice «Los videos quedan con la portada automática hasta
    que terminen de procesarse.» (después se cambia con «Cambiar portada» del panel o del "⋯" del visor);
  - «Crear destacada».
- **API** (la del panel, sin cambios): `POST /api/cuenta/destacadas { titulo }`, después cada archivo, de a uno, con
  `POST /destacadas/:id/fotos` (multipart `foto`) o `/videos` (multipart `video`), y al final la portada: foto elegida
  → `PUT /destacadas/:id/portada { itemId }` con el `item.id` que devolvió la subida de esa foto; imagen aparte →
  `POST /destacadas/:id/portada` (multipart `foto`); automática → nada (una destacada nueva ya la tiene). Barra de
  progreso y «Subiendo… k/N».
- **Fallas**: si falla alguno, lo subido queda (con un tilde en su miniatura), la hoja muestra «Se subieron X de N.» y
  el mensaje del servidor, el nombre queda fijo y «Crear destacada» reintenta solo lo que falta en la misma destacada;
  Mi perfil ya muestra lo subido. La portada se aplica con lo que ya está subido, también en cada reintento (lo ya
  aplicado no se repite): si la foto elegida no se subió, queda la automática y se avisa «La foto elegida de portada no
  se subió: por ahora queda la automática.»; cuando el reintento la sube, se aplica. Si el servidor rechaza la portada,
  la hoja queda con el error y el reintento solo pide la portada. Si no se subió ninguno, la destacada vacía se borra
  (`DELETE /destacadas/:id`) para que no ocupe el cupo. Si cierra la hoja mientras sube, sigue subiendo y avisa al
  terminar.
- **Al terminar**: aviso «Destacada creada.» (con videos: «Destacada creada. Los videos se suman apenas terminen de
  procesarse.»), se vuelven a pedir sus datos y los de Mi perfil (aparece el círculo nuevo) y queda en la página.
- Textos EN/PT en `HH.I18N` (`prod-sitio.js`). Tests: `app/test/destacada-nueva.test.js` (dibujo solo en Mi perfil,
  cupo lleno, la misma API, falla parcial y total, portada por defecto, elegida, imagen aparte, foto de portada que no
  se subió y videos; en el servidor, crear + elementos + portada y el límite del plan).

## Nombre completo y fecha de nacimiento fijos — 17/11/2026 (decisiones de Juan)

**Nombre completo (legal), aparte del nombre artístico.** Se escribe en Verificación, arriba de las tres fotos:
«Nombre completo» con la ayuda «Como figura en tu documento. No se publica.» (EN/PT en `HH.I18N`). El nombre
artístico de Mi perfil no cambia.

- **API** `POST /api/cuenta/verificacion` suma el campo `nombreCompleto` (obligatorio). Se valida con
  `lib/perfiles.js → validarNombreCompleto`: espacios normalizados (NFC, sin controles), 3 a 80 caracteres, solo letras
  (con tildes), espacios, apóstrofos (' y ’), guiones y puntos, con al menos dos letras. Errores 400: «Escribí tu
  nombre completo, como figura en tu documento.», «Tu nombre completo tiene que tener entre 3 y 80 caracteres.»,
  «Tu nombre completo solo puede tener letras, espacios, apóstrofos, guiones y puntos.» (EN/PT en
  `prod-sitio-errores.js`). Orden de los chequeos: fotos, consentimiento, nombre.
- **Guardado** (migración `240-nombre-completo.sql`): `verificaciones.nombre_completo` (el de cada envío) y
  `cuentas.nombre_completo` (el aprobado: se copia al aprobar la verificación). No está en `perfiles.datos`: `PUT
  perfil` lo ignora.
- **Fijo una vez aprobado**: ella no lo puede cambiar (la verificación aprobada no se reenvía: 409; si alguna vez se
  reabriera, un envío nuevo conserva el aprobado y no hace falta mandarlo). Si la rechazan, manda otra con el nombre
  corregido (el formulario viene con el último que escribió).
- **Ella** lo ve en su panel: `GET yo` → `perfil.nombreCompleto` (el aprobado) y `perfil.ultimaVerificacion.nombreCompleto`.
  En Verificación, ya aprobado: «Nombre completo» + el nombre (texto con candado, no un campo) + «Verificado con tu
  documento. No se publica.».
- **Nunca público**: no está en el estado ni en el perfil público, ni en la vista previa, ni en el HTML/SEO/sitemap, ni
  en lo que lee el asistente de WhatsApp (solo su texto de ayuda «verificacion» dice que se manda el nombre completo
  como figura en el documento).
- **Admin**: `GET acompanantes/:id` → `cuenta.nombreCompleto` (aprobado) y `verificaciones[].nombreCompleto`. En la
  revisión, recuadro «Nombre completo» arriba de Frente / Dorso / Selfie («Comparalo con el documento. No se
  publica.»); los envíos sin nombre (anteriores a la 240): «—» y «Formato anterior: se envió sin nombre. Se revisa
  igual.» (no se le pide a nadie que reenvíe; al aprobarlos la cuenta queda sin nombre). En la tarjeta Cuenta, fila
  «Nombre completo» (Verificado / Sin verificar con el del último envío / —). En el listado, debajo del email; la
  búsqueda también lo encuentra.
- **Retención**: la purga de los 90 días borra solo las imágenes; el nombre queda (en el envío y en la cuenta). Se borra
  con la cuenta (`ON DELETE CASCADE`; no hay otro flujo de borrado ni anonimización de cuentas).
- «Para publicar te falta»: «Enviá tu verificación de identidad (nombre completo, documento y selfie).»; «Completar»
  lleva al campo del nombre.

**Fecha de nacimiento fija.** En Mi perfil → Datos básicos, con la verificación aprobada la fecha ya no es un campo
(`readonly` dejaba abrir el selector en iOS): se muestra como texto `dd/mm/aaaa` con candado y «Ya fue verificada con
tu documento.». El servidor la sigue rechazando (`validarDatos`, bloqueo `fechaNacimiento`).

**Alineación de las fechas.** `mvp/src/app.css`: `.input[type=date|time|datetime-local|month]` sin el aspecto de iOS,
con el mismo alto que los demás campos (`calc(1.5em + 24px)`) y el texto a la izquierda
(`::-webkit-date-and-time-value`). En las filas `.sp-2`/`.sp-3` los campos ya no se estiran hasta el alto del vecino
(el campo sin ayuda quedaba más alto y corrido): `align-content: start`. Vale también para el registro.

Pruebas: `app/test/nombre-completo.test.js`.

## Historias como Instagram en el perfil y el inicio — 17/11/2026 (pedido de Juan)

**Bug arreglado: "ver la historia" de su perfil mostraba la galería.** El avatar del perfil (`views-public.js`,
`.pf-thumb`) tenía siempre un anillo gris (igual al de una historia ya vista y al de las destacadas) y, sin historias
activas, abría la galería (`pubLightbox`, foto 1). Pasaba con una historia vencida, en video todavía procesándose, o
con solo destacadas, en el perfil público y en la vista previa. Ahora:
- Anillo solo con historias activas (`HH.storiesOf`: 24 h, `estado = 'listo'`); abre solo esas (`openStories`).
- Sin historias activas: sin anillo y sin visor; para un visitante el avatar no es un botón. Nunca abre la galería.
- Las destacadas abren solo sus propios elementos (sin cambios). El servidor ya mandaba historias, destacadas y fotos
  por separado; las pruebas lo fijan (`/api/sitio/estado` y `/api/cuenta/vista-previa`).
- Visor (`core.js`): "Ver perfil" / el nombre, si ya está en ese perfil, en la vista previa o en Mi perfil, solo cierra
  el visor (antes navegaba al perfil público y en la vista previa la sacaba de ahí).

**"+" en su propio perfil** (Mi perfil, `/panel/mi-perfil`; desde el 17/11 no en la vista previa, que es solo para
mirar; su perfil público con su sesión lleva a Mi perfil): círculo blanco con "+" abajo a la derecha del
avatar (`.pf-add`). Abre directo el selector del dispositivo (foto; también video si el panel los permite,
`yo.videosHabilitados`) y después una hoja "Nueva historia" con la vista previa, «Texto (opcional)» (120), «Dura 24
horas.» + «Te quedan N hoy» / «Historias ilimitadas con tu plan», el aviso «Tus historias se ven en el sitio cuando tu
perfil esté publicado.» si no está publicado, y «Publicar historia». Tocar el avatar abre sus historias si tiene; si no
tiene, también sube una. Nunca en el perfil de otra ni para visitantes o clientes.

**"Tu historia" en el inicio**: con sesión de acompañante, primer círculo de la fila de historias (círculo vacío con
borde fino y "+"; EN "Your story", PT "Seu story"), aunque no haya otras historias (la fila queda solo con él). Mismo
flujo que el "+". Con la home provisoria prendida el inicio es la portada (sin fila): ahí se sube desde Mi perfil o el
panel.

**Misma API, límites y mensajes que el panel**: `POST /api/cuenta/historias` (`foto` + `texto`) o
`/api/cuenta/historias/video` (`video` + `texto`; 95 MB y 60 s se controlan antes con los mismos textos). Si ya usó el
cupo del día (`yo.limites.historiasDia` − `historiasHoy` = 0) no abre el selector: aviso con el texto del servidor
«Tu plan permite N historia(s) por día. Subí de plan para publicar más.» (inglés y portugués en `prod-sitio-errores.js`).
Los errores del servidor se muestran en la hoja. Al terminar: aviso «Historia publicada por 24 horas.» (video: «Recibimos
el video. Se publica apenas termine de procesarse.»), se vuelven a pedir `GET yo` y el estado del sitio (o
`GET vista-previa` en Mi perfil) y queda en la misma página con su anillo nuevo.

Front: `HH.storyUploadOn(p)` (prod-sitio.js: hay `S.yo` y, con `p`, es su perfil) y la acción `spStoryAdd`. El MVP y la
demo no la definen (sin "+"; la demo no tiene cuentas). Pruebas: `app/test/historias-perfil.test.js`.

## Eliminar su historia desde el visor y fotos difíciles de guardar — 17/11/2026 (pedidos de Juan)

**"Desde la misma historia, al verla el/la acompañante debe poder eliminarla, al igual que en Instagram."**
- Visor de historias (`core.js`, `HH.openStories`): "⋯" en la cabecera, antes de la X (`.story-more`, «Más opciones»),
  solo cuando es suya. Lo decide `HH.storyOwnMenu(st, { workerId, highlight })` (`prod-sitio.js`): acompañante con
  sesión (`S.yo`), la historia y la acompañante del visor son de su cuenta. Nunca para visitantes, clientes ni en
  historias de otra. Sin ese gancho (prototipo, demo) no hay menú.
- Toque en "⋯": hoja abajo dentro del visor «Eliminar historia» / «Cancelar» → confirmación «¿Eliminar esta historia?
  No se puede deshacer.» (Cancelar / Eliminar → «Eliminando…») → `DELETE /api/cuenta/historias/:id` (la del panel) →
  aviso «Historia eliminada.» → el visor sigue con su próxima historia o se cierra si no quedan; se vuelven a pedir sus
  datos y lo que se ve (sitio: fila del inicio; Mi perfil: anillo y destacadas). Vale desde Mi perfil y la fila del
  inicio (si veía la cola del inicio y no le quedan, se cierra); en la vista previa no hay "⋯" (desde el 17/11).
- Sus destacadas: «Quitar de la destacada» → «¿Quitar esto de la destacada? Se borra la foto o el video y no se puede
  deshacer.» (Cancelar / Quitar) → `DELETE /api/cuenta/destacadas/items/:id` (la del panel; el elemento se subió solo
  para esa destacada, así que se borra con su archivo) → «Quitado de la destacada.». Si era el último, se cierra y la
  destacada deja de verse (las vacías no se muestran).
- Con la hoja o la confirmación abiertas la historia queda en pausa (barra y video); los toques no avanzan, mantener
  apretado no la reanuda, Escape cierra la hoja (no el visor). Si el servidor responde error: aviso rojo y sigue.
- El servidor ya exigía que sea suya (`WHERE id = $1 AND cuenta_id = $2` → 404 «Historia no encontrada.» /
  «No encontramos ese elemento.»; sin sesión 401). La hoja va dentro del visor (z 200; el modal del sitio queda
  debajo) y los avisos (`.toast-root`) pasan a z-index 220 para verse encima de los visores.
- Textos en inglés y portugués (`prod-sitio.js`).

**"Que las fotos no se puedan abrir en pestañas aparte ni que se puedan descargar."** (mantener apretado la foto de
perfil la ampliaba y dejaba guardarla). En todo el sitio y la demo (inicio, fila de historias, tarjetas, perfil y su
avatar, visor de fotos, historias y destacadas, shorts, swipe, Cerca, barra inferior, contenido comprado y el panel):
- `sitio.css`: `-webkit-touch-callout:none; -webkit-user-select:none; user-select:none` en `img`, `video`, `picture`
  y sus contenedores (`.media`, `.avatar`, `.story-media`, `.story-view`, `.story-ring`, `.pf-thumb`, `.pf-tile`,
  `.lb-stage`, `.swipe-card`, `.bn-av`, `.hl-c`, `.sh-item`, `.pc2-media`, `.sr-hs-prev`); `-webkit-user-drag:none` en
  fotos y videos; los links con foto (tarjetas) tampoco muestran la vista previa de iOS. `input`, `textarea`, `select`
  y `[contenteditable]` vuelven a lo normal.
- `prod-sitio.js`: un listener en captura cancela `contextmenu` (clic derecho; Android: "Descargar imagen", "Abrir en
  pestaña nueva") y `dragstart` sobre fotos, videos y esos contenedores (`HH.MEDIA_SEL`, los mismos del CSS); nunca en
  campos de texto. No toca `touchstart`/`pointerdown`: tocar, deslizar y desplazarse siguen igual. Un MutationObserver
  pone `draggable="false"` en cada `<img>` y en cada `<video>` `controlslist="nodownload noplaybackrate
  noremoteplayback"`, `disablepictureinpicture` y `disableremoteplayback`, también en lo que se dibuje después.
- Plantillas: todas las `<img>` del sitio llevan `draggable="false"` y todos los `<video>` esos tres atributos (los
  `alt` quedan). Ningún link apunta al archivo de una foto o un video (el visor se abre con botones).
- Admin: no carga `sitio.css` ni este listener; ahí se siguen abriendo las fotos en otra pestaña. Solo cambia que los
  helpers compartidos de `core.js` (avatar, foto, miniatura, video) dibujan `draggable="false"` y el video sin descarga.
- Límite (dicho a Juan): es disuasivo. No evita capturas de pantalla ni que alguien copie la dirección del archivo
  desde el código o la red: las fotos y videos públicos son archivos del CDN con marca de agua. La entrega del
  servidor/CDN no cambió.

Pruebas: `app/test/historia-borrar-proteccion.test.js` (visor en una caja: "⋯" solo con el gancho y en lo suyo;
`HH.storyOwnMenu` con y sin sesión, rutas y textos; servidor: lo de otra → 404 y sigue, sin sesión → 401, lo suyo se
borra; CSS, `draggable`, atributos de video y links a archivos en las plantillas y en el paquete armado).

## Portada de la destacada — 17/11/2026 (pedido de Juan)

**"La persona deberá tener la posibilidad de poner la imagen que quieran de perfil de la historia destacada."** Como
"Editar portada" de Instagram: la acompañante elige la imagen del círculo de cada destacada.
- Tres opciones (`lib/destacadas.js`, `db/250-destacada-portada.sql`: `destacadas.portada_item`, `portada_clave`,
  `portada_url`; nunca las dos a la vez):
  - **Automática** (la de antes y la de siempre si no elige): el primer elemento listo; si es un video, su portada.
  - **Uno de sus elementos**: una foto de ESA destacada, o un video ya listo (se usa su portada `urlMini`). Si ese
    elemento se borra, vuelve la automática (FK `ON DELETE SET NULL`).
  - **Imagen subida aparte**: mismo proceso que las fotos públicas (gira según EXIF, sin metadatos ni ubicación, marca
    de agua, mismos topes: 12 MB, 40 MP, mínimo 200 × 200 px) y recortada al centro en un cuadrado de hasta 480 px
    (`procesarPortada` en `lib/imagenes.js`; no se agranda). Almacenamiento público `d/p-<uuid>.webp`. El archivo se
    borra al cambiar la portada, al volver a la automática y al borrar la destacada (también desde el admin).
  - Sin elección de posición: recorte al centro (el círculo muestra lo mismo que el cuadrado guardado).
- API (`/api/cuenta`, sesión de acompañante activa, mismo origen + X-SR: 1). Todas → `{ ok, portada }`:
  - `PUT /destacadas/:id/portada {itemId}`: el elemento tiene que ser de esa destacada y de su cuenta → si no, 404
    «No encontramos ese elemento.»; sin `itemId` 400 «Elegí una foto de la destacada.»; un video que se procesa o falló
    400 «Elegí una foto o un video que ya esté listo.».
  - `POST /destacadas/:id/portada` (multipart `foto`): mismo límite de subidas por hora que las fotos (60); sin archivo
    400 «Elegí una imagen.»; imagen inválida 400 con el mensaje de siempre; destacada ajena 404 (no se guarda nada).
  - `DELETE /destacadas/:id/portada`: vuelve a la automática.
  - Destacada ajena o inexistente: 404 «No encontramos esa destacada.».
- Datos: `GET /destacadas` y `GET /yo` → cada destacada suma `portada`: `null` (automática) ·
  `{ tipo: 'item', itemId, url }` · `{ tipo: 'subida', url }`. `GET /api/sitio/estado` y `GET /api/cuenta/vista-previa`
  → `perfiles[].destacadas[].portada`: la URL de la elegida o `null` (automática). La demo no la manda: automática.
- Front (`prod-sitio.js`): `buildDb` pone `cover` en cada destacada y `HH.highlightCover` lo usa (si no, el primer
  elemento). Panel → Historias → cada destacada: círculo con la portada actual, «La elegiste vos.» / «Automática: la
  primera foto o video.» y «Cambiar portada» → hoja «Portada de la destacada»: vista previa en el círculo, «Elegí una de
  esta destacada» (sus fotos y videos listos; la subida actual marcada «Actual»), «Subir otra imagen» (se ve en la
  grilla como «Nueva» antes de guardar), «Usar la automática» (solo si eligió una; se aplica en el momento) y
  Cancelar / Guardar. Visor de historias en SUS destacadas: el «⋯» suma «Cambiar portada» (antes de «Quitar de la
  destacada»): cierra el visor y abre la misma hoja con lo que estaba mirando ya elegido (`core.js`: el menú propio
  acepta `extra: [{ label, icon, run }]`). Al guardar se vuelven a pedir sus datos y lo que se ve (sitio o vista previa).
- Textos en inglés y portugués en `prod-sitio.js` (incluidos los mensajes nuevos del servidor).

Pruebas: `app/test/destacada-portada.test.js` (automática por defecto; elegir un elemento → panel, sitio y vista previa;
subida: WebP cuadrado sin EXIF, una chica no se agranda, reemplazar / pasar a un elemento / volver a la automática borra
el archivo, inválida o chica → 400 sin archivo; elemento de otra destacada, de otra acompañante, inexistente, sin
terminar o destacada ajena → 404/400; video listo usa su portada; borrar el elemento elegido → automática; borrar la
destacada con portada de elemento o subida → se borra todo).
