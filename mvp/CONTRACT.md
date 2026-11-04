# SexyRose MVP — contrato para módulos de vistas

Producto: directorio web de acompañantes para salidas SIN contenido sexual (café, helado, paseo, museo, cine, evento, idiomas…). Modelo japonés de compañía. La plataforma cobra a las acompañantes un plan mensual por publicar el perfil (A/B/C/D) y slots "Stars". Las acompañantes venden fotos/videos/shorts (sueltos, packs o a pedido) de sus salidas o de su rutina diaria (estilo Instagram). Los clientes pagan por contenido puntual o acceso al chat en vivo. Nada de contenido sexual, nunca; el tono es cálido, profesional y seguro. Idioma: español rioplatense (vos), claro y directo. Sin emojis.

Paleta ya resuelta en app.css (rosa, rosa frutilla, rosa crema, blanco) con modo oscuro. **No escribas CSS nuevo salvo estilos inline mínimos o reglas muy puntuales dentro de un `<style>` al inicio de tu módulo (como string inyectado una sola vez).** Preferí las clases existentes.

## Estructura
- Todo se concatena en un solo HTML: `core.js` → `data.js` → `views-public.js` → `views-dashboard.js` → `views-client.js` → `views-admin.js` → `boot.js`.
- Sin módulos ES, sin imports. Todo cuelga de `window.HH`. Cada archivo de vistas es un IIFE que registra rutas y acciones.
- Mobile-first (390px) y desktop (1280px). Nada debe desbordar horizontalmente.
- Build y prueba: `python3 build.py` genera `build/index.html` y `build/full.html` (con doctype, para Playwright). Probá con Playwright Python (`from playwright.async_api import async_playwright`, chromium ya instalado) cargando `file:///home/claude/happyhouse/build/full.html`, navegando con `page.evaluate("HH.go('#ruta')")`, y capturando screenshots en `shots/`. Revisá `console` errors y `document.documentElement.scrollWidth <= innerWidth`.

## Router
- Rutas por hash con segmentos separados por punto: `HH.route('perfil.:slug', (params) => html)`. Ej.: `#perfil.valentina`, `#panel.contenido`, `#admin.stars`.
- Solo letras, números, `.`, `_`, `-` en los hashes (restricción del visor). Nunca `/` ni `?`.
- `HH.route(pattern, handler, { optional: true })` permite que el último `:param` falte (`#panel` ≡ `#panel.resumen`).
- El handler devuelve un string HTML (o un Node). Si redirige (p. ej. `HH.requireRole('worker')` devolvió false), devolvé `false`.
- `HH.go('#ruta')` navega. `HH.refresh()` re-renderiza la ruta actual (usalo después de mutar datos). `HH.current = {path, params}`.
- `HH.afterRender = () => {...}`: callback de una sola vez que corre después del próximo render (para enganchar listeners de drag, scroll, etc.). También se dispara `document` evento `hh:rendered`.

## Eventos (delegación global; no uses onclick inline)
- `data-go="#ruta"` en cualquier elemento → navega.
- `data-action="nombre"` → llama `HH.actions.nombre(el, ev)`. Registrá tus acciones con `Object.assign(HH.actions, { nombre(el, ev) {...} })`. Usá `data-*` en el elemento para pasar ids (`el.dataset.id`).
- `<form data-submit="nombre">` → `HH.actions.nombre(form, ev, values)` (values = objeto de FormData). Ya hace preventDefault.
- `data-change="nombre"` / `data-input="nombre"` → `HH.actions.nombre(el, ev)`.
- Nombres de acciones: prefijá con tu módulo para evitar choques: `pub*`, `dash*`, `cli*`, `adm*`.

## Sesión y roles
- `HH.me()` usuario actual o null. Roles: `worker` (acompañante), `client`, `admin`.
- `HH.requireRole('worker')` → redirige a login si no hay sesión (y guarda `HH.ui.next`) o a su home si el rol no coincide. Devuelve boolean.
- `HH.login(userId)`, `HH.logout()`, `HH.register({name,email,password,role})` → `{user}` o `{error}`.
- Cuentas demo (password `demo1234`): `u_vale` (acompañante, plan A, Star, verificada, mucha actividad), `u_juli` (acompañante nueva, plan C, verificación pendiente, perfil incompleto), `u_cliente` (cliente con compras y chat activo con Valentina), `u_admin`.
- `HH.myProfile()`, `HH.profileOf(userId)`, `HH.profileBySlug(slug)`, `HH.userById(id)`.
- `HH.ui` guarda preferencias del visor (`theme`, `swipeFilters`, `next`). `HH.save()` persiste todo en localStorage.

## Datos (`HH.db`)
- `users[]`: `{id, email, password, name, role, createdAt, hue}`
- `profiles[]`: `{userId, slug, displayName, age, city, country, headline, bio, activities[ids], languages[], rateFrom (USD/h orientativa, puede ser null), chatPriceUsd, whatsapp, photos[4] (dataURL|null), hue, verified: 'none'|'pending'|'verified'|'rejected', status: 'pending'|'active'|'suspended', createdAt, stats:{views,rightSwipes}}`
- `subscriptions[]`: `{id, userId, level 'A'|'B'|'C'|'D', status 'active'|'cancelled'|'expired', startedAt, expiresAt}`
- `stars[]`: `{id, workerId, activeUntil}` — máximo 3 activos en todo el sitio.
- `content[]`: `{id, workerId, type 'photo'|'video'|'short', title, caption, isPremium, priceUsd, duration ('2:10' en video/short), views, sales, createdAt, hue, src (dataURL|null)}`
- `packs[]`: `{id, workerId, title, description, itemIds[], priceUsd, sales, createdAt}`
- `requests[]` (pedidos a medida): `{id, clientId, workerId, description, status 'solicitado'|'aceptado'|'pagado'|'entregado'|'rechazado', priceUsd|null, note, deliveredItemId, createdAt, updatedAt}`. Flujo: cliente solicita → acompañante acepta con precio (o rechaza) → cliente paga → acompañante entrega (sube/elige un contenido) → entregado.
- `messages[]`: `{id, senderId, receiverId, content, createdAt, read}`
- `payments[]`: `{id, userId (quien paga), amountUsd, type 'subscription'|'one_time'|'pack'|'chat'|'request'|'star', status, description, workerId (quien cobra, null si cobra la plataforma), ref, createdAt}`
- `purchases[]`: `{id, clientId, kind 'content'|'pack'|'chat'|'request', refId, workerId, amountUsd, expiresAt (solo chat), createdAt}`
- `reports[]`: `{id, targetId, byId, reason, status, createdAt}`

## Constantes
- `HH.LEVELS[level] = {price_usd, label, chat_limit_per_day (null=sin límite, 0=sin chat), priority_ranking, premium_content, desc}`
- `HH.STARS = {slots_total:3, price_usd:150, days:30}`; `HH.CHAT_ACCESS_DAYS = 7`
- `HH.ACTIVITIES[] = {id,label,icon}`; `HH.activity(id)`; `HH.REQUEST_STATES[status] = {label, badge}`

## Consultas y lógica (ya implementadas; usalas, no las reimplementes)
- `HH.publishedProfiles()` (activas con plan), `HH.rankedProfiles()` (Stars y plan A primero), `HH.levelOf(workerId)`, `HH.activeSubscription(workerId)`, `HH.isStar(workerId)`, `HH.activeStars()`, `HH.starSlotsFree()`
- `HH.contentOf(w)`, `HH.packsOf(w)`, `HH.requestsOf(w)`, `HH.requestsByClient(c)`, `HH.paymentsOf(u)`, `HH.earningsOf(w)` (pagos donde cobra la acompañante), `HH.purchasesOf(c)`, `HH.hasPurchased(c, kind, refId)`, `HH.canView(item, viewerId)`, `HH.hasChatAccess(c, w)`
- `HH.chatQuota(workerId)` → `{level, limit, used, remaining, unlimited, blocked}` (se resetea a medianoche)
- `HH.threadsOf(userId)` → `[{otherId, messages[], unread, last}]`; `HH.sendMessage(from, to, text)` → `{message}` o `{error}` (respeta el límite diario); `HH.markRead(userId, otherId)`
- `HH.swipe(clientId|null, workerId, 'left'|'right')`, `HH.view(workerId)`
- `HH.profileCompleteness(profile)` → `{items:[{label, done, go, pending}], done, total, pct}`
- Pagos (checkout simulado, abre modal y al confirmar ejecuta onSuccess): `HH.buyContent(item, onDone)`, `HH.buyPack(pack, onDone)`, `HH.buyChat(profile, onDone)`, `HH.createRequest(clientId, workerId, text)`, `HH.updateRequest(id, patch)`, `HH.payRequest(request, onDone)`, `HH.subscribe(workerId, level, onDone)`, `HH.buyStar(workerId, onDone)`, `HH.checkout({title, amount, description, meta, onSuccess})`
- `HH.whatsappLink(phone, text)` → URL wa.me. En el swipe a la derecha se abre esta URL (con `<a target="_blank">`).

## Helpers de UI (devuelven strings HTML)
- `HH.icon(name)` — nombres: heart x check plus chat star camera video film lock unlock arrowLeft arrowRight chevronRight chevronLeft chevronDown home search user users settings wallet image bolt shield eye trash edit bell logout menu sun moon send clock gift sparkles pin calendar coffee icecream walk museum cine ticket dinner languages bag dumbbell music phone card trending info alert crown play upload pack inbox dashboard dollar verified external copy filter ban refresh more share globe smile rocket message checkCircle xCircle key mail activity grid list help bulb flag whatsapp
- `HH.avatar(profile, size)`, `HH.userAvatar(user, size)`, `HH.photo(profile, index, {cls, style, children})` (foto grande con placeholder de gradiente), `HH.contentThumb(item, {cls, noLock, noTag, freeTag, children})` (miniatura con candado si es premium y no está comprado)
- `HH.levelBadge(level, short)`, `HH.starBadge()`, `HH.verifiedBadge()`, `HH.activityChips(ids)`
- `HH.modal({title, body(html), actions:[{label, cls, action|onClick, id}]})`, `HH.closeModal()`, `HH.confirm({title, text, okLabel, cls, onOk})`, `HH.toast(msg, {type:'ok'|'warn'|'danger'})`
- `HH.money(n)` → "USD 12", `HH.fmtDate(iso)`, `HH.fmtDateTime(iso)`, `HH.timeAgo(iso)`, `HH.daysLeft(iso)`, `HH.esc(s)` (escapá SIEMPRE texto de usuario), `HH.uid()`, `HH.readFile(file, cb(dataURL))` (para subir fotos con `<input type=file>`)
- `HH.hueGradient(hue)` para fondos decorativos.

## Clases CSS disponibles (ver app.css)
Layout: `.container` `.container.narrow` `.section` `.band` `.band-white` `.row` `.row.between` `.col` `.grow` `.stack` `.stack-lg` `.grid-2/3/4` `.hide-mobile` `.hide-desktop`
Texto: `.eyebrow` `.lead` `.muted` `.small` `.tiny` `.num` `.center` `.ellipsis`
Botones: `.btn` + `.secondary .ghost .soft .dark .ok .danger .wa .sm .lg .block .round`; `.icon-btn` (+`.sm`)
Cards: `.card` (+`.pad-lg .pad-sm .soft .flat .lift`), `.card-title`, `.divider`, `.list` + `.list-item` (`.title` `.sub`), `.stat` (`.k .v .d`, `.accent`), `.notice` (+`.ok .warn .info`), `.empty`
Badges: `.badge` (+`.gold .ok .warn .danger .info .neutral .level-A/B/C/D`), `.chip` (+`.active`), `.chips` (+`.scroll`), `.pill-row`
Forms: `.field` (label + `.hint`), `.input` `.select` `.textarea` `.input-group` + `.addon`, `.switch[aria-checked]`, `.radio-card` (+`.active`), `.dropzone`
Tablas: `.table-wrap > table.table` (`td.num`)
Media: `.media` (+`.wide .square .tall`), `.media-grid`, `.pcard` (card de perfil: `.media` + `.body` con `.name .meta`)
Swipe: `.swipe-stage > .swipe-card` (`.info`, `.stamp.like/.nope`), `.swipe-actions`
Shorts: `.shorts > .short` (`.overlay`, `.side`)
Dashboard: `.dash > .dash-side (.who, .dash-nav a.active .count) + .dash-main`, `.dash-tabs` (móvil, usar `.chips.scroll` adentro), `.page-head`
Mensajes: `.msg-list .bubble.me/.them .t`, `.thread (.preview)`
Otros: `.checklist .check.done (.box .txt .go)`, `.steps .step .n`, `.plans .plan.featured (.price .ribbon ul li.no)`, `.hero .hero-grid .hero-cards .float .blob`, `.progress > span`, `.bars .bar(.cur) i b span`, `.auth-wrap .auth-card .demo-accounts`, `.kbd`

## Reglas de calidad
- Cada vista debe verse completa y pulida en 390px y 1280px. Nada de placeholders "lorem". Copys reales, útiles y cortos.
- Escapá todo texto de datos con `HH.esc`.
- Después de mutar datos: `HH.save()` (los helpers de negocio ya lo hacen) y `HH.refresh()` o re-render parcial.
- Estados vacíos con `.empty` y una acción clara.
- Botones dicen lo que hacen ("Publicar", "Aceptar y cotizar", "Abrir WhatsApp").
- Accesibilidad básica: labels en inputs, `aria-label` en botones de ícono, foco visible (ya en CSS).

## Adiciones (v2)
- Categorías editables: `HH.ACTIVITIES` (getter) devuelve `HH.db.activities` (`{id,label,icon}`). CRUD: `HH.addActivity({label,icon})`, `HH.updateActivity(id,{label,icon})`, `HH.removeActivity(id)` (también la quita de los perfiles), `HH.activityUsage(id)` (cuántos perfiles la usan), `HH.ACTIVITY_ICONS` (nombres de ícono disponibles para elegir).
- Ajustes del sitio: `HH.settings()` → `{ hero: {eyebrow, title, subtitle, image(dataURL|null), ctaPrimary, ctaSecondary}, nearby: {defaultCity} }`; `HH.saveSettings({hero:{...}})` mergea y guarda. `HH.DEFAULT_SETTINGS` tiene los valores por defecto.
- `profile.online` (boolean, demo) para el punto verde "en línea".

## Adiciones (v3): ubicaciones anidadas — src/geo.js
- `HH.db.locations[]`: `{id, name (único en todo el sitio), level 'country'|'region'|'zone'|'city', parentId, lat, lng, status 'active'|'pending'|'rejected', source, createdBy}`.
- Perfiles siguen usando `p.city` (nombre de ciudad) y `p.homeCity` (residencia; los viajes cambian `p.city`). `p.pendingCity` = mudanza pedida a una localidad pendiente.
- `HH.inCity(p, lugar)` acepta cualquier nivel (país, provincia, zona o ciudad). `HH.placeOptions()` / `HH.placeSelectOptions(sel)` dan el árbol de lugares activos con perfiles publicados.
- Alta: `HH.searchPlaces(q)` (sitio + base de referencia `HH.GEO_REF`), `HH.resolvePlace({name, parent}, userId)` crea la ciudad como pendiente si no existe.
- Admin: `HH.approveLocation`, `HH.mergeLocation`, `HH.rejectLocation`, `HH.addLocation`, `HH.approveProfileVerification(p)` (verifica identidad y aprueba la ubicación pendiente).
- `HH.CITY_COORDS` y `HH.CITY_COUNTRY` son getters derivados de las ubicaciones.
