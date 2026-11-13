/* ============================================================
   SexyRose MVP — core.js
   Estado, router, helpers de UI, lógica de negocio compartida.
   Todo vive en window.HH. Sin módulos: los archivos se concatenan.
   ============================================================ */
window.HH = (function () {
  'use strict';
  const HH = {};
  // true cuando la página la arma el servidor (ssr/): no cuenta visitas, no pide ubicación ni mueve el scroll
  HH.SSR = !!window.HH_SSR;

  /* ---------- Capas a pantalla completa y el botón "atrás" del celular ----------
     Al abrir el visor de fotos o de historias se agrega una entrada al historial con la misma dirección:
     "atrás" cierra la capa en vez de cambiar de página. Si la capa se cierra con la X, se consume esa entrada.
     El listener va en captura y se registra antes que el del router, así el router no vuelve a dibujar la página. */
  HH._ov = []; HH._ovIgnore = 0;
  HH.overlayOpen = function (closeFn) {
    const id = 'ov' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    try { history.pushState({ hhOv: id }, '', location.href); } catch (e) { /* */ }
    HH._ov.push({ id, closeFn }); return id;
  };
  // nav: el que cierra va a navegar enseguida con HH.go(..., { replace: true }), que reemplaza la entrada de la capa
  HH.overlayClosed = function (id, opts = {}) {
    const k = HH._ov.findIndex(o => o.id === id); if (k < 0) return;
    HH._ov.splice(k, 1);
    if (opts.nav) return;
    if (history.state && history.state.hhOv === id) { HH._ovIgnore++; history.back(); }
  };
  window.addEventListener('popstate', (ev) => {
    if (HH._ovIgnore > 0) { HH._ovIgnore--; ev.stopImmediatePropagation(); return; }
    const top = HH._ov[HH._ov.length - 1];
    if (top && !(ev.state && ev.state.hhOv === top.id)) { HH._ov.pop(); ev.stopImmediatePropagation(); try { top.closeFn(); } catch (e) { /* */ } }
  }, true);

  /* ---------- Constantes de negocio (CLAUDE.md) ---------- */
  // Planes mensuales (de mayor a menor). Star = plan con cupo de 10 por estado/provincia e incluye todo lo de A.
  // photos/videos: límite de la galería del perfil (videos de hasta 30 s). stories_per_day: null = ilimitadas.
  // highlights: historias destacadas que se muestran en el perfil (null = ilimitadas).
  // chat_limit_per_day: null = chat por sesiones habilitado, 0 = sin chat. premium_content = venta de fotos y videos individuales.
  HH.LEVELS = {
    S: { price_usd: 255, label: 'Star', rank: 6, photos: 1000, videos: 500, stories_per_day: null, highlights: null, shorts: true, premium_content: true, packs: true, requests: true, bookings: true, chat: true, trips: true, zone: true, stats: true, chat_limit_per_day: null, priority_ranking: true, desc: 'Lugar fijo arriba del inicio en tu provincia o estado. Solo 10 por estado/provincia. Incluye todo lo de Diamante.' },
    A: { price_usd: 102, label: 'Diamante', rank: 5, photos: 500, videos: 200, stories_per_day: null, highlights: 10, shorts: true, premium_content: true, packs: true, requests: true, bookings: true, chat: true, trips: true, zone: true, stats: true, chat_limit_per_day: null, priority_ranking: true, desc: 'Sección Diamante, la primera debajo de Stars, con tarjetas grandes. Todas las herramientas y estadísticas detalladas.' },
    B: { price_usd: 60, label: 'Platino', rank: 4, photos: 50, videos: 15, stories_per_day: null, highlights: 6, shorts: true, premium_content: true, packs: true, requests: true, bookings: true, chat: true, trips: true, zone: true, stats: false, chat_limit_per_day: null, priority_ranking: false, desc: 'Viajes y novedades por zona.' },
    C: { price_usd: 38, label: 'Oro', rank: 3, photos: 30, videos: 10, stories_per_day: null, highlights: 4, shorts: true, premium_content: true, packs: true, requests: true, bookings: true, chat: false, trips: false, zone: false, stats: false, chat_limit_per_day: 0, priority_ranking: false, desc: 'Packs, pedidos a medida y agenda de reservas.' },
    D: { price_usd: 21, label: 'Plata', rank: 2, photos: 15, videos: 5, stories_per_day: 3, highlights: 2, shorts: true, premium_content: true, packs: false, requests: false, bookings: false, chat: false, trips: false, zone: false, stats: false, chat_limit_per_day: 0, priority_ranking: false, desc: 'Vendé fotos y videos individuales y publicá shorts.' },
    E: { price_usd: 10, label: 'Bronce', rank: 1, photos: 8, videos: 2, stories_per_day: 1, highlights: 1, shorts: false, premium_content: false, packs: false, requests: false, bookings: false, chat: false, trips: false, zone: false, stats: false, chat_limit_per_day: 0, priority_ranking: false, desc: 'Tu perfil publicado y verificado, para empezar.' },
  };
  HH.PLAN_ORDER = ['S', 'A', 'B', 'C', 'D', 'E'];
  HH.planName = (lv) => (HH.LEVELS[lv] || {}).label || 'Sin plan';
  // Presentación para acompañantes (se muestra recién después de registrarse y verificar el email, antes de pagar)
  HH.COMPANION_BENEFITS = [
    ['shield', 'Vos ponés las reglas', 'Cada anunciante es responsable de su aviso. Decidís qué publicás y con quién hablás. Podés reportar a quien no respete las reglas.'],
    ['dollar', 'Cobrás en USD', 'Tu tarifa la definís vos y la acordás directamente con quien te escribe. El contenido se paga en la plataforma y lo ves acreditado en tu panel.'],
    ['camera', 'Contenido que vende', 'Fotos, videos y shorts: sueltos, en packs o a pedido. Vos fijás el precio.'],
    ['whatsapp', 'Contacto con filtro', 'Tu WhatsApp solo lo ve quien deslizó a la derecha.'],
  ];
  HH.PROFILE_VIDEO_MAX_S = 30;
  // Capacidad del plan vigente (sin plan = límites del plan E para poder armar el perfil)
  HH.planFeat = (workerId, key) => { const lv = HH.levelOf(workerId); return (HH.LEVELS[lv || 'E'] || {})[key]; };
  HH.galleryLimits = (workerId) => ({ photos: HH.planFeat(workerId, 'photos'), videos: HH.planFeat(workerId, 'videos') });
  // Stars: 10 lugares por provincia/estado (slots_per_region), cada uno dura un mes. slots_per_country/slots_total quedan como alias.
  HH.STARS = { slots_per_region: 10, slots_per_country: 10, slots_total: 10, price_usd: 255, days: 30 }; // el precio es el del plan Star
  HH.DEFAULT_ACTIVITIES = [
    { id: 'cafe', label: 'Café', icon: 'coffee' },
    { id: 'helado', label: 'Helado', icon: 'icecream' },
    { id: 'paseo', label: 'Paseo', icon: 'walk' },
    { id: 'museo', label: 'Museo', icon: 'museum' },
    { id: 'cine', label: 'Cine', icon: 'cine' },
    { id: 'cena', label: 'Cena', icon: 'dinner' },
    { id: 'evento', label: 'Evento', icon: 'ticket' },
    { id: 'idiomas', label: 'Idiomas', icon: 'languages' },
    { id: 'compras', label: 'Compras', icon: 'bag' },
    { id: 'deporte', label: 'Deporte', icon: 'dumbbell' },
    { id: 'musica', label: 'Música', icon: 'music' },
  ];
  // Categorías editables desde admin: viven en HH.db.activities. HH.ACTIVITIES siempre devuelve la lista actual.
  Object.defineProperty(HH, 'ACTIVITIES', { get: () => (HH.db && HH.db.activities) ? HH.db.activities : HH.DEFAULT_ACTIVITIES });
  HH.ACTIVITY_ICONS = ['coffee', 'icecream', 'walk', 'museum', 'cine', 'dinner', 'ticket', 'languages', 'bag', 'dumbbell', 'music', 'sparkles', 'heart', 'star', 'camera', 'gift', 'globe', 'pin', 'calendar', 'smile', 'rocket', 'bulb', 'activity', 'film', 'image'];
  HH.addActivity = function ({ label, icon }) { const id = HH.uniqueActivityId(HH.slugify(label)); const a = { id, label: String(label).trim(), icon: icon || 'sparkles' }; HH.db.activities.push(a); HH.save(); return a; };
  HH.updateActivity = function (id, patch) { const a = HH.db.activities.find(x => x.id === id); if (!a) return null; Object.assign(a, patch); HH.save(); return a; };
  HH.removeActivity = function (id) { HH.db.activities = HH.db.activities.filter(a => a.id !== id); HH.db.profiles.forEach(p => { p.activities = (p.activities || []).filter(x => x !== id); }); HH.save(); };
  HH.uniqueActivityId = function (base) { let s = base || 'cat', i = 2; while (HH.db.activities.some(a => a.id === s)) s = base + '-' + (i++); return s; };
  HH.activityUsage = (id) => HH.db.profiles.filter(p => (p.activities || []).includes(id)).length;
  // Ajustes del sitio editables desde admin (portada de inicio, etc.)
  HH.DEFAULT_SETTINGS = { hero: { eyebrow: 'Sitio de anuncios', title: 'Acompañantes en tu *ciudad*.', subtitle: 'Avisos de acompañantes en tu ciudad. Mirá los perfiles y contactá directo a quien elijas por WhatsApp o Telegram.', image: null, ctaPrimary: 'Explorar perfiles', ctaSecondary: 'Cerca de mí' }, nearby: { defaultCity: 'Ciudad de Buenos Aires' } };
  HH.settings = () => { if (!HH.db.settings) HH.db.settings = JSON.parse(JSON.stringify(HH.DEFAULT_SETTINGS)); return HH.db.settings; };
  HH.saveSettings = (patch) => { const st = HH.settings(); Object.keys(patch).forEach(k => { st[k] = Object.assign({}, st[k] || {}, patch[k]); }); HH.save(); return st; };
  // Ficha del perfil (datos neutros: nada de medidas ni datos del cuerpo)
  HH.BUILDS = { delgada: 'Delgada', atletica: 'Atlética', mediana: 'Mediana', robusta: 'Robusta' };
  HH.INTERESTS = ['Arte', 'Música', 'Cine', 'Teatro', 'Lectura', 'Historia', 'Gastronomía', 'Vinos', 'Viajes', 'Naturaleza', 'Deporte', 'Fotografía', 'Moda', 'Tecnología', 'Idiomas', 'Negocios'];
  HH.GENDERS = [
    { id: 'mujer', label: 'Mujer', plural: 'Mujeres', icon: 'venus' },
    { id: 'trans', label: 'Trans', plural: 'Trans', icon: 'transgender' },
    { id: 'hombre', label: 'Hombre', plural: 'Hombres', icon: 'mars' },
  ];
  HH.gender = (id) => HH.GENDERS.find(g => g.id === id) || null;
  // Tipos de perfil que ve el visitante (afecta inicio, swipe, Cerca de mí, historias, Stars y páginas de lugar).
  // Por defecto mujeres y trans: quien busca hombres lo elige en la ventana de entrada o en la barra (v56).
  HH.DEFAULT_GENDERS = ['mujer', 'trans'];
  HH.genderSet = () => {
    const u = HH.ui || {}; const ids = HH.GENDERS.map(g => g.id);
    const s = Array.isArray(u.genders) && u.genders.length ? u.genders : (u.gender ? [u.gender] : HH.DEFAULT_GENDERS);
    const out = ids.filter(g => s.includes(g)); return out.length ? out : HH.DEFAULT_GENDERS.slice();
  };
  HH.setGenders = (list) => { const ids = HH.GENDERS.map(g => g.id); const s = ids.filter(g => (list || []).includes(g)); if (!s.length) return false; HH.ui.genders = s; HH.ui.gender = ''; HH.save(); return true; };
  // Un solo tipo elegido (paleta celeste para Hombres) o '' si son varios
  HH.genderFilter = () => { const s = HH.genderSet(); return s.length === 1 ? s[0] : ''; };
  HH.genderOk = (p) => HH.genderSet().includes(p.gender || 'mujer');
  // "Mujeres y Trans", "Hombres"… ('' si ve todos)
  HH.genderLabel = () => { const s = HH.genderSet(); return s.length === HH.GENDERS.length ? '' : s.map(g => HH.gender(g).plural).join(' y '); };
  HH.activity = (id) => HH.ACTIVITIES.find(a => a.id === id) || { id, label: id, icon: 'sparkles' };
  // Pedido a medida: el cliente elige foto, video o pack, paga al enviarlo y la acompañante acepta enviando el contenido o rechaza (se reembolsa)
  HH.REQUEST_KINDS = {
    photo: { label: 'Foto', icon: 'image', hint: 'Una foto pensada para vos' },
    video: { label: 'Video', icon: 'video', hint: 'Un video corto: un saludo o una recomendación' },
    pack: { label: 'Pack', icon: 'pack', hint: 'Varias fotos y/o videos sobre lo que pidas' },
  };
  HH.DEFAULT_REQUEST_PRICES = { photo: 8, video: 15, pack: 25 };
  HH.requestPrices = (p) => Object.assign({}, HH.DEFAULT_REQUEST_PRICES, (p && p.requestPrices) || {});
  HH.REQUEST_STATES = {
    pendiente: { label: 'Pagado · esperando respuesta', badge: 'warn' },
    solicitado: { label: 'Solicitado', badge: 'info' },
    aceptado: { label: 'Aceptado · esperando pago', badge: 'warn' },
    pagado: { label: 'Pagado · en producción', badge: 'warn' },
    entregado: { label: 'Entregado', badge: 'ok' },
    rechazado: { label: 'Rechazado · reembolsado', badge: 'danger' },
  };

  /* ---------- Utilidades ---------- */
  HH.uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9);
  HH.now = () => new Date().toISOString();
  HH.localDay = (iso) => { const d = iso ? new Date(iso) : new Date(); const z = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); };
  HH.today = () => HH.localDay();
  HH.daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString();
  HH.daysFromNow = (n) => new Date(Date.now() + n * 864e5).toISOString();
  HH.money = (n) => 'USD ' + (Math.round(Number(n) * 100) / 100).toLocaleString(HH.loc(), { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  HH.fmtDate = (iso, opts) => { try { return new Date(iso).toLocaleDateString(HH.loc(), opts || { day: 'numeric', month: 'short' }); } catch (e) { return iso; } };
  HH.fmtDateTime = (iso) => { try { const d = new Date(iso); return d.toLocaleDateString(HH.loc(), { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString(HH.loc(), { hour: '2-digit', minute: '2-digit', hour12: false }); } catch (e) { return iso; } };
  HH.timeAgo = (iso) => { const s = (Date.now() - new Date(iso).getTime()) / 1000; if (s < 60) return 'ahora'; if (s < 3600) return Math.floor(s / 60) + ' min'; if (s < 86400) return Math.floor(s / 3600) + ' h'; const d = Math.floor(s / 86400); return d === 1 ? 'ayer' : d + ' días'; };
  HH.daysLeft = (iso) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5));
  HH.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  HH.slugify = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  HH.clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  HH.plural = (n, s, p) => n === 1 ? s : (p || s + 's');
  HH.sum = (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0);
  HH.by = (key, dir = -1) => (a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * dir;
  HH.el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  // Telegram: acepta @usuario, usuario o número de teléfono
  HH.telegramLink = (t) => { const v = String(t || '').trim(); if (!v) return ''; const digits = v.replace(/[^0-9]/g, ''); if (/^[+\d\s()-]+$/.test(v) && digits.length >= 8) return 'https://t.me/+' + digits; const u = v.replace(/^@/, '').replace(/[^A-Za-z0-9_]/g, ''); return u.length >= 5 ? 'https://t.me/' + u : ''; };
  HH.whatsappLink = (phone, text) => 'https://wa.me/' + String(phone || '').replace(/[^0-9]/g, '') + (text ? '?text=' + encodeURIComponent(text) : '');
  HH.initials = (name) => String(name || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

  /* ---------- Iconos (trazo, 24x24) ---------- */
  const I = {
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    video: '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
    film: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    unlock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
    arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    bolt: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    edit: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
    menu: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
    sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/>',
    pin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    coffee: '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
    icecream: '<path d="m7 11 4.08 10.35a1 1 0 0 0 1.84 0L17 11"/><path d="M17 7A5 5 0 0 0 7 7"/><path d="M17 7a2 2 0 0 1 0 4H7a2 2 0 0 1 0-4"/>',
    walk: '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/>',
    museum: '<path d="M10 18v-7"/><path d="M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.886c.476.235.324.91-.204.91H3.458c-.528 0-.68-.675-.204-.91z"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M3 22h18"/><path d="M6 18v-7"/>',
    cine: '<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
    dinner: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
    languages: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
    bag: '<path d="M16 10a4 4 0 0 1-8 0"/><path d="M3.103 6.034h17.794"/><path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"/>',
    dumbbell: '<path d="M14.4 14.4 9.6 9.6"/><path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"/><path d="m21.5 21.5-1.4-1.4"/><path d="M3.9 3.9 2.5 2.5"/><path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    phone: '<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>',
    card: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
    trending: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    crown: '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    pack: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7"/><path d="m7.5 4.27 9 5.15"/>',
    inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    dollar: '<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    verified: '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    filter: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
    ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    xCircle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    key: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
    grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    list: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    flag: '<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c2 0 3.3 1.3 4.9 2.3S16.9 6 19 6a4.7 4.7 0 0 1 2.6-.8 1 1 0 0 1 .4.8v10a1 1 0 0 1-.4.8A6 6 0 0 1 19 18c-2 0-3.3-1.3-4.9-2.3S10.1 14 8 14a4.7 4.7 0 0 0-2.6.8"/>',
    venus: '<path d="M12 15v7"/><path d="M9 19h6"/><circle cx="12" cy="9" r="6"/>',
    // mars y transgender corridos para que se vean centrados en su círculo (centro óptico, 12/11/2026)
    mars: '<g transform="translate(-0.6 0.7)"><path d="M16 3h5v5"/><path d="m21 3-6.75 6.75"/><circle cx="10" cy="14" r="6"/></g>',
    transgender: '<g transform="translate(0 1.2) translate(12 12) scale(0.88) translate(-12 -12)"><path d="M12 16v6"/><path d="M14 20h-4"/><path d="M18 2h4v4"/><path d="m2 2 7.17 7.17"/><path d="M2 5.355V2h3.357"/><path d="m22 2-7.17 7.17"/><path d="M8 5 5 8"/><circle cx="12" cy="12" r="4"/></g>',
    whatsapp: '<path fill="currentColor" stroke="none" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>',
  };
  HH.icon = (name, cls) => `<svg class="ico${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name] || I.sparkles}</svg>`;

  /* ---------- Estado / persistencia ---------- */
  const STORAGE_KEY = 'hh_mvp_v1';
  HH.db = null;
  HH.session = null;
  HH.ui = { gender: '', theme: 'dark', swipeFilters: {}, lastDashTab: null };

  HH.save = function () {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ db: HH.db, session: HH.session, ui: HH.ui })); } catch (e) { /* storage no disponible */ }
  };
  HH.load = function () {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !data.db || !data.db.users) return false;
      HH.db = data.db; HH.session = data.session || null; HH.ui = Object.assign(HH.ui, data.ui || {});
      return true;
    } catch (e) { return false; }
  };
  HH.reset = function () {
    HH.db = HH.seed();
    HH.session = null;
    HH.save();
  };
  HH.resetDemo = function () {
    HH.db = HH.seed();
    HH.session = null;
    HH.save();
    HH.toast('Datos de demo reiniciados', { type: 'ok' });
    HH.go('#inicio');
  };

  /* ---------- Sesión ---------- */
  // Cliente invitado: quien consume no se registra. Se identifica con un id anónimo local (g_xxx).
  HH.guestId = function () { if (!HH.ui.guestId) { HH.ui.guestId = 'g_' + Math.random().toString(36).slice(2, 8); HH.save(); } return HH.ui.guestId; };
  HH.guestUser = (id) => ({ id, name: 'Cliente anónimo', shortName: 'Cliente ' + String(id).slice(2, 6).toUpperCase(), email: '', role: 'client', guest: true, hue: 215, createdAt: HH.now() });
  HH.isGuestId = (id) => typeof id === 'string' && id.startsWith('g_');
  HH.me = () => HH.session ? HH.db.users.find(u => u.id === HH.session.userId) || null : null;
  // viewer(): el usuario logueado o el invitado anónimo (siempre hay alguien que navega)
  HH.viewer = () => HH.me() || HH.guestUser(HH.guestId());
  HH.viewerId = () => HH.viewer().id;
  HH.role = () => (HH.me() || {}).role || null;
  HH.userById = (id) => HH.db.users.find(u => u.id === id) || (HH.isGuestId(id) ? HH.guestUser(id) : null);
  HH.profileOf = (userId) => HH.db.profiles.find(p => p.userId === userId) || null;
  HH.profileBySlug = (slug) => HH.db.profiles.find(p => p.slug === slug) || null;
  HH.myProfile = () => HH.session ? HH.profileOf(HH.session.userId) : null;
  HH.login = function (userId) {
    const u = HH.userById(userId); if (!u) return false;
    if (u.blocked) { HH.toast('Esta cuenta está bloqueada. Escribinos a ayuda@sexyrose.net', { type: 'danger' }); return false; }
    HH.session = { userId: u.id, role: u.role, at: HH.now() };
    HH.save(); HH.renderShell();
    return true;
  };
  HH.logout = function () { HH.session = null; HH.save(); HH.renderShell(); HH.go('#inicio'); HH.toast('Sesión cerrada'); };
  HH.requireRole = function (role) {
    const me = HH.me();
    if (!me) { HH.ui.next = HH.currentHash(); HH.save(); HH.go('#login'); return false; }
    if (role && me.role !== role) { HH.toast('Esa sección es para ' + (role === 'worker' ? 'acompañantes' : role === 'admin' ? 'administradores' : 'clientes'), { type: 'warn' }); HH.go(HH.homeFor(me.role)); return false; }
    return true;
  };
  HH.homeFor = (role) => role === 'worker' ? '#panel' : role === 'admin' ? '#admin' : role === 'client' ? '#cuenta' : '#inicio';
  HH.register = function ({ name, email, password, role, whatsapp, telegram, city, country, mainActivity, gender }) {
    if (HH.db.users.some(u => u.email.toLowerCase() === String(email).toLowerCase())) return { error: 'Ya existe una cuenta con ese email.' };
    const u = { id: HH.uid('u'), email, password, name, role, createdAt: HH.now() };
    HH.db.users.push(u);
    if (role === 'worker') {
      const display = String(name).trim().split(' ')[0];
      const slug = HH.uniqueSlug(HH.slugify(display || 'perfil'));
      HH.db.profiles.push({ userId: u.id, slug, displayName: display, age: null, city: city || '', country: country || HH.CITY_COUNTRY[city] || '', headline: '', bio: '', activities: mainActivity ? [mainActivity] : [], gender: gender || 'mujer', languages: ['Español'], rateFrom: null, whatsapp: whatsapp || '', telegram: telegram || '', photos: [null, null, null, null], hue: Math.floor(Math.random() * 360), verified: 'none', emailVerified: false, whatsappVerified: false, status: 'pending', online: false, createdAt: HH.now(), stats: { views: 0, rightSwipes: 0 }, chatPriceUsd: 5 });
    }
    HH.save();
    return { user: u };
  };
  HH.uniqueSlug = function (base) { let s = base || 'perfil', i = 2; while (HH.db.profiles.some(p => p.slug === s)) s = base + '-' + (i++); return s; };

  /* ---------- Consultas de negocio ---------- */
  HH.activeSubscription = (workerId) => HH.db.subscriptions.find(s => s.userId === workerId && s.status === 'active' && new Date(s.expiresAt) > new Date()) || null;
  // Plan efectivo: Star si tiene suscripción vigente y lugar Star activo; una suscripción S sin lugar cuenta como A.
  HH.subLevelOf = (workerId) => { const s = HH.activeSubscription(workerId); return s ? s.level : null; };
  HH.levelOf = (workerId) => { const l = HH.subLevelOf(workerId); if (!l) return null; if (HH.isStar(workerId)) return 'S'; return l === 'S' ? 'A' : l; };
  HH.activeStars = () => HH.db.stars.filter(s => new Date(s.activeUntil) > new Date());
  HH.isStar = (workerId) => HH.activeStars().some(s => s.workerId === workerId);
  HH.countryOf = (workerId) => { const p = HH.profileOf(workerId); return p ? (p.country || '') : ''; };
  // Stars: cupo de 10 por estado/provincia (región), contado por la región de ORIGEN de cada acompañante.
  // Una Star de otra región que viaja a una región llena se muestra igual ahí: en ese caso la región tiene 11 o más.
  HH.regionOfCity = (city) => { if (!city) return ''; const loc = HH.locByName && HH.locByName(city); if (!loc) return city; const path = HH.locPath(loc); return (path[1] || path[0] || loc).name; };
  HH.regionCountry = (region) => { const loc = HH.locByName && HH.locByName(region); return loc ? HH.locCountry(loc) : ''; };
  HH.regionLabel = (region) => { const c = HH.regionCountry(region); return region ? region + (c && c !== region ? ', ' + c : '') : ''; };
  HH.starRegionOf = (workerId) => { const p = HH.profileOf(workerId); return p ? HH.regionOfCity(p.homeCity || p.city) : ''; };
  HH.currentRegionOf = (workerId) => { const p = HH.profileOf(workerId); return p ? HH.regionOfCity(p.city) : ''; };
  HH.activeStarsIn = (region) => HH.activeStars().filter(s => !region || HH.starRegionOf(s.workerId) === region);
  HH.starSlotsFree = (region) => Math.max(0, HH.STARS.slots_per_region - HH.activeStarsIn(region).length);
  // Stars visibles en una región: las que están ahí ahora (de origen o de viaje) y las que llegan de viaje pronto
  HH.starsShownIn = (region) => HH.activeStars().filter(s => { if (!region) return true; if (HH.currentRegionOf(s.workerId) === region) return true; const p = HH.profileOf(s.workerId); const t = p && HH.upcomingTrip && HH.upcomingTrip(p); return !!(t && HH.regionOfCity(t.city) === region); });
  HH.starVisitorsIn = (region) => HH.starsShownIn(region).filter(s => HH.starRegionOf(s.workerId) !== region);
  HH.starRegions = () => [...new Set(HH.publishedProfiles().map(p => HH.starRegionOf(p.userId)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  HH.starCountries = () => [...new Set(HH.publishedProfiles().map(p => p.country).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  // País del visitante: el de su ubicación, o el de la ciudad elegida
  // HH.CITY_COUNTRY y HH.CITY_COORDS se derivan de HH.db.locations (ver geo.js)
  // Lugar por defecto al entrar: el país del visitante (por su ubicación o por la ciudad por defecto de ajustes)
  HH.defaultPlace = () => { const g = HH.geo && HH.geo(); const c = (g && g.city) || ((HH.settings().nearby || {}).defaultCity); return (c && HH.CITY_COUNTRY[c]) || ''; };
  HH.currentPlace = () => (HH.ui.city === undefined || HH.ui.city === null ? HH.defaultPlace() : HH.ui.city);
  HH.starsInPlace = (place) => HH.activeStars().filter(s => { const p = HH.profileOf(s.workerId); return p && HH.inCity(p, place); });
  HH.viewerCity = () => { const g = HH.geo && HH.geo(); return (g && g.city) || (HH.ui.city === undefined ? ((HH.settings().nearby || {}).defaultCity) : HH.ui.city) || ''; };
  HH.viewerRegion = () => HH.regionOfCity(HH.viewerCity());
  HH.viewerCountry = () => { const g = HH.geo && HH.geo(); const city = (g && g.city) || (HH.ui.city === undefined ? ((HH.settings().nearby || {}).defaultCity) : HH.ui.city); return HH.CITY_COUNTRY[city] || ''; };
  HH.publishedProfiles = function () {
    return HH.db.profiles.filter(p => p.status === 'active' && !p.hidden && HH.levelOf(p.userId) && HH.requirementsOf(p).ok);
  };
  HH.rankList = function (list) {
    const score = p => ((HH.LEVELS[HH.levelOf(p.userId)] || { rank: 0 }).rank * 100) + (p.verified === 'verified' ? 10 : 0) + (p.stats.views || 0) / 1000;
    return list.slice().sort((a, b) => score(b) - score(a));
  };
  HH.rankedProfiles = () => HH.rankList(HH.publishedProfiles().filter(HH.genderOk));
  HH.contentOf = (workerId) => HH.db.content.filter(c => c.workerId === workerId).sort(HH.by('createdAt'));
  HH.packsOf = (workerId) => HH.db.packs.filter(c => c.workerId === workerId).sort(HH.by('createdAt'));
  HH.requestsOf = (workerId) => HH.db.requests.filter(r => r.workerId === workerId).sort(HH.by('updatedAt'));
  HH.requestsByClient = (clientId) => HH.db.requests.filter(r => r.clientId === clientId).sort(HH.by('updatedAt'));
  HH.paymentsOf = (userId) => HH.db.payments.filter(p => p.userId === userId).sort(HH.by('createdAt'));
  HH.earningsOf = (workerId) => HH.db.payments.filter(p => p.workerId === workerId && p.status === 'approved').sort(HH.by('createdAt'));
  HH.purchasesOf = (clientId) => HH.db.purchases.filter(p => p.clientId === clientId).sort(HH.by('createdAt'));
  // Vencimiento de compras: lo define la acompañante por pieza o pack (accessDays; 0 = sin vencimiento).
  // Se fija al momento de la compra: si después cambia la duración, no afecta a quien ya compró.
  HH.ACCESS_OPTIONS = [{ v: 0, l: 'Sin vencimiento' }, { v: 1, l: '24 horas' }, { v: 3, l: '3 días' }, { v: 7, l: '7 días' }, { v: 15, l: '15 días' }, { v: 30, l: '30 días' }];
  HH.accessLabel = (days) => { const o = HH.ACCESS_OPTIONS.find(x => x.v === Number(days || 0)); return o ? o.l : days + ' días'; };
  HH.accessShort = (days) => !Number(days) ? '' : Number(days) === 1 ? 'Acceso 24 h' : 'Acceso ' + days + ' días';
  HH.PACK_ACCESS = [0, 30]; // packs: sin vencimiento o un mes
  HH.purchaseExpiry = (days) => Number(days) > 0 ? HH.daysFromNow(Number(days)) : null;
  HH.purchaseActive = (p) => !p.expiresAt || new Date(p.expiresAt) > new Date();
  HH.timeLeft = (iso) => { const ms = new Date(iso) - new Date(); if (ms <= 0) return 'vencido'; const h = Math.ceil(ms / 3600e3); return h < 48 ? h + ' h' : Math.ceil(h / 24) + ' días'; };
  HH.activePurchase = (clientId, kind, refId) => HH.db.purchases.filter(p => p.clientId === clientId && p.kind === kind && p.refId === refId && HH.purchaseActive(p)).sort((a, b) => (a.expiresAt === null || a.expiresAt === undefined ? -1 : b.expiresAt === null || b.expiresAt === undefined ? 1 : (a.expiresAt < b.expiresAt ? 1 : -1)))[0] || null;
  // Piezas de un pack comprado: se guardan al comprar, así borrar o editar el pack no le quita acceso al cliente
  HH.packItemsOf = (purchase) => purchase.itemIds || ((HH.db.packs.find(k => k.id === purchase.refId) || {}).itemIds) || [];
  HH.hasPurchased = (clientId, kind, refId) => !!HH.activePurchase(clientId, kind, refId);
  HH.canView = function (item, viewerId) {
    if (!item.isPremium) return true;
    if (!viewerId) return false;
    if (viewerId === item.workerId) return true;
    if (HH.hasPurchased(viewerId, 'content', item.id)) return true;
    return HH.db.purchases.some(p => p.clientId === viewerId && p.kind === 'pack' && HH.purchaseActive(p) && HH.packItemsOf(p).includes(item.id));
  };
  // HH.hasChatAccess y HH.buyChat: ver chat.js (sesiones de 10/15/30 min)
  HH.chatQuota = function (workerId) {
    const level = HH.levelOf(workerId);
    const limit = level ? HH.LEVELS[level].chat_limit_per_day : 0;
    const today = HH.today();
    const used = HH.db.messages.filter(m => m.senderId === workerId && HH.localDay(m.createdAt) === today).length;
    return { level, limit, used, remaining: limit === null ? Infinity : Math.max(0, limit - used), unlimited: limit === null, blocked: limit !== null && used >= limit };
  };
  HH.threadsOf = function (userId) {
    const map = new Map();
    HH.db.messages.filter(m => m.senderId === userId || m.receiverId === userId).sort(HH.by('createdAt', 1)).forEach(m => {
      const other = m.senderId === userId ? m.receiverId : m.senderId;
      const t = map.get(other) || { otherId: other, messages: [], unread: 0 };
      t.messages.push(m); if (m.receiverId === userId && !m.read) t.unread++;
      map.set(other, t);
    });
    return [...map.values()].map(t => ({ ...t, last: t.messages[t.messages.length - 1] })).sort((a, b) => a.last.createdAt < b.last.createdAt ? 1 : -1);
  };
  HH.sendMessage = function (senderId, receiverId, content) {
    const sender = HH.userById(senderId);
    if (sender && sender.blocked) return { error: 'Tu cuenta está bloqueada.' };
    if (sender && sender.role === 'worker') {
      const q = HH.chatQuota(senderId);
      if (q.blocked) return { error: q.limit === 0 ? 'Tu plan no incluye chat. Pasá a Estándar o superior para responder.' : 'Llegaste al límite diario de ' + q.limit + ' respuestas. Mañana a las 00:00 se renueva.' };
    }
    if (HH.chatBlocked && HH.chatBlocked(content)) return { error: 'Por seguridad no se pueden compartir teléfonos, links, mails ni usuarios de otras redes en el chat.' };
    const m = { id: HH.uid('m'), senderId, receiverId, content: String(content).trim(), createdAt: HH.now(), read: false };
    if (!m.content) return { error: 'Escribí un mensaje.' };
    HH.db.messages.push(m); HH.save();
    return { message: m };
  };
  HH.markRead = function (userId, otherId) { HH.db.messages.forEach(m => { if (m.receiverId === userId && m.senderId === otherId) m.read = true; }); HH.save(); };
  HH.swipe = function (clientId, workerId, dir) {
    HH.db.swipes.push({ clientId: clientId || 'anon', workerId, dir, at: HH.now() });
    const p = HH.profileOf(workerId); if (p && dir === 'right') p.stats.rightSwipes = (p.stats.rightSwipes || 0) + 1;
    HH.save();
  };
  HH.hasSwiped = (clientId, workerId, dir) => HH.db.swipes.some(sw => sw.clientId === (clientId || 'anon') && sw.workerId === workerId && (!dir || sw.dir === dir));
  HH.view = function (workerId) { if (HH.SSR) return; const p = HH.profileOf(workerId); if (p) { p.stats.views = (p.stats.views || 0) + 1; HH.save(); } };
  // Requisitos obligatorios para activar el perfil (se publican recién cuando están los 5)
  HH.PHOTOS_REQUIRED = 4;
  HH.requirementsOf = function (p) {
    const photos = (p.photos || []).filter(Boolean).length;
    const items = [
      (() => { const loc = HH.locByName && HH.locByName(p.homeCity || p.city); const locPending = !!loc && loc.status === 'pending';
        return { key: 'identity', label: 'Verificar identidad' + (locPending ? ' y ubicación' : ''), done: p.verified === 'verified' && !locPending && !!loc, pending: p.verified === 'pending' || (p.verified === 'verified' && locPending), go: '#panel.verificacion', hint: locPending ? 'Documento, selfie y un video corto. Tu localidad nueva (' + HH.esc(loc.name) + ') se suma al sitio al verificar tu cuenta.' : 'Documento, selfie y un video corto de 5 segundos.' }; })(),
      { key: 'email', label: 'Verificar email', done: p.emailVerified !== false, action: 'verifyContact', kind: 'email', hint: 'Te mandamos un código de 6 dígitos.' },
      { key: 'whatsapp', label: 'Verificar WhatsApp', done: p.whatsappVerified !== false && /\d{8,}/.test((p.whatsapp || '').replace(/\D/g, '')), action: 'verifyContact', kind: 'whatsapp', hint: 'Es el número al que te escriben los clientes.' },
      { key: 'avatar', label: 'Subir foto de perfil', done: !!(p.photos || [])[0], go: '#panel.perfil', hint: 'La que se ve en el swipe y en las historias.' },
      { key: 'photos', label: `Subir fotos (${Math.min(photos, HH.PHOTOS_REQUIRED)}/${HH.PHOTOS_REQUIRED})`, done: photos >= HH.PHOTOS_REQUIRED, go: '#panel.perfil', hint: 'Fotos reales, de cara visible.' },
    ];
    const done = items.filter(i => i.done).length;
    return { items, done, total: items.length, ok: done === items.length };
  };
  HH.profileCompleteness = function (p) {
    const items = [
      { key: 'bio', label: 'Escribí tu presentación', done: (p.bio || '').length >= 40, go: '#panel.perfil' },
      ...(HH.ACTIVITIES.length ? [{ key: 'activities', label: 'Elegí tus categorías', done: (p.activities || []).length >= 2, go: '#panel.perfil' }] : []),
      { key: 'city', label: 'Indicá tu ciudad', done: !!p.city, go: '#panel.perfil' },
      { key: 'plan', label: 'Activá un plan', done: !!HH.levelOf(p.userId), go: '#panel.suscripcion' },
      { key: 'content', label: 'Publicá tu primer contenido', done: HH.contentOf(p.userId).length > 0, go: '#panel.contenido' },
    ];
    const done = items.filter(i => i.done).length;
    return { items, done, total: items.length, pct: Math.round(done / items.length * 100) };
  };

  /* ---------- Cuenta de cliente: alias + email + contraseña, sin verificación de identidad ---------- */
  // Lo que el visitante hizo como invitado (swipes, chats, pedidos) pasa a su cuenta nueva.
  HH.adoptGuest = function (userId) {
    const g = HH.ui.guestId; if (!g) return;
    HH.db.swipes.forEach(x => { if (x.clientId === g) x.clientId = userId; });
    HH.db.purchases.forEach(x => { if (x.clientId === g) x.clientId = userId; });
    HH.db.requests.forEach(x => { if (x.clientId === g) x.clientId = userId; });
    HH.db.messages.forEach(x => { if (x.senderId === g) x.senderId = userId; if (x.receiverId === g) x.receiverId = userId; });
    HH.db.payments.forEach(x => { if (x.userId === g) x.userId = userId; });
    (HH.db.reports || []).forEach(x => { if (x.byId === g) x.byId = userId; });
    HH.save();
  };
  HH.registerClient = function ({ alias, email, password }) {
    const r = HH.register({ name: alias, email, password, role: 'client' });
    if (r.user) { HH.adoptGuest(r.user.id); }
    return r;
  };
  HH.clientAuth = function ({ reason, onDone, mode } = {}) {
    let m = mode || 'signup';
    const render = () => {
      HH.modal({ title: m === 'signup' ? 'Creá tu cuenta de cliente' : 'Entrá a tu cuenta', body: `
        ${reason ? `<p class="small">${HH.esc(reason)}</p>` : ''}
        <div class="chips" role="tablist"><button type="button" class="chip${m === 'signup' ? ' active' : ''}" data-ca="signup">Crear cuenta</button><button type="button" class="chip${m === 'login' ? ' active' : ''}" data-ca="login">Ya tengo cuenta</button></div>
        <form id="caForm" class="stack" novalidate>
          ${m === 'signup' ? `<div class="field"><label for="caAlias">Alias</label><input class="input" id="caAlias" maxlength="24" autocomplete="nickname" placeholder="Ej.: Viajero BA"><span class="hint">Es lo único que ven las acompañantes. Puede no ser tu nombre real.</span></div>` : ''}
          <div class="field"><label for="caEmail">Email</label><input class="input" id="caEmail" type="email" inputmode="email" autocomplete="email" placeholder="vos@ejemplo.com"><span class="hint">${m === 'signup' ? 'Para recuperar tus compras. No se muestra a nadie.' : ''}</span></div>
          <div class="field"><label for="caPass">Contraseña</label><input class="input" id="caPass" type="password" autocomplete="${m === 'signup' ? 'new-password' : 'current-password'}">${m === 'signup' ? '<span class="hint">Mínimo 8 caracteres.</span>' : ''}</div>
          ${m === 'signup' ? `<label class="row nowrap small" style="gap:8px;align-items:flex-start"><input type="checkbox" id="caTerms" style="margin-top:3px"><span>Soy mayor de 18 años y acepto los términos.</span></label>
          <div class="notice info">${HH.icon('shield')}<span>Sin documento ni selfie: no verificamos tu identidad. Tus compras, chats y pedidos quedan en tu cuenta.</span></div>` : ''}
          <div id="caErr"></div>
        </form>`,
        actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: m === 'signup' ? 'Crear cuenta y seguir' : 'Entrar y seguir', onClick: submit }] });
      const box = document.getElementById('modalBox');
      box.querySelectorAll('[data-ca]').forEach(b => b.addEventListener('click', () => { m = b.dataset.ca; render(); }));
      const f = document.getElementById('caForm'); if (f) f.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
    };
    const err = (t) => { const e = document.getElementById('caErr'); if (e) e.innerHTML = `<div class="notice warn">${HH.icon('alert')}<span>${HH.esc(t)}</span></div>`; };
    const submit = () => {
      const email = (document.getElementById('caEmail').value || '').trim(); const pass = document.getElementById('caPass').value || '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err('Ingresá un email válido.');
      if (m === 'login') {
        const u = HH.db.users.find(x => x.email.toLowerCase() === email.toLowerCase());
        if (!u || u.password !== pass) return err('Email o contraseña incorrectos.');
        if (u.role !== 'client') return err('Esa cuenta no es de cliente. Usá "Iniciar sesión".');
        HH.adoptGuest(u.id); HH.login(u.id);
      } else {
        const alias = (document.getElementById('caAlias').value || '').trim();
        if (alias.length < 2) return err('Elegí un alias de al menos 2 letras.');
        if (pass.length < 8) return err('La contraseña tiene que tener al menos 8 caracteres.');
        if (!document.getElementById('caTerms').checked) return err('Tenés que confirmar que sos mayor de 18 y aceptar los términos.');
        const r = HH.registerClient({ alias, email, password: pass }); if (r.error) return err(r.error);
        HH.login(r.user.id);
      }
      HH.closeModal(); HH.toast(m === 'signup' ? 'Cuenta creada' : 'Hola de nuevo', { type: 'ok' });
      if (onDone) setTimeout(onDone, 120); else HH.refresh();
    };
    render();
  };

  /* ---------- Verificación por código (email / WhatsApp) ---------- */
  // Demo: el código se muestra en pantalla. En producción se envía por email (p. ej. Resend) o WhatsApp (API de Meta / Twilio).
  HH.verifyContact = function (kind) {
    const u = HH.me(); const p = u && HH.profileOf(u.id); if (!p) return;
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const target = kind === 'email' ? u.email : (p.whatsapp || '');
    if (kind === 'whatsapp' && !/\d{8,}/.test(target.replace(/\D/g, ''))) { HH.toast('Primero cargá tu WhatsApp en Mi perfil.', { type: 'warn' }); HH.go('#panel.perfil'); return; }
    HH.modal({ title: kind === 'email' ? 'Verificar email' : 'Verificar WhatsApp', body: `
      <p class="small">Te enviamos un código de 6 dígitos a <strong>${HH.esc(target)}</strong>.</p>
      <div class="notice info">${HH.icon('info')}<span>Modo demo: tu código es <strong class="num">${code}</strong>.</span></div>
      <div class="field"><label for="vcCode">Código</label><input class="input num" id="vcCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000" style="letter-spacing:.3em;font-size:20px;text-align:center"></div>
      <div id="vcErr"></div>`,
      actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: 'Verificar', onClick: () => {
        const v = (document.getElementById('vcCode').value || '').replace(/\D/g, '');
        if (v !== code) { document.getElementById('vcErr').innerHTML = `<div class="notice warn">${HH.icon('alert')}<span>El código no coincide. Revisalo e intentá de nuevo.</span></div>`; return; }
        if (kind === 'email') p.emailVerified = true; else p.whatsappVerified = true;
        HH.save(); HH.closeModal(); HH.toast(kind === 'email' ? 'Email verificado' : 'WhatsApp verificado', { type: 'ok' });
        if (kind === 'email' && !HH.subLevelOf(u.id) && HH.currentHash() !== 'panel.suscripcion') HH.go('#panel.suscripcion'); else HH.refresh();
      } }] });
  };
  /* ---------- Passkeys (WebAuthn) ---------- */
  // Demo front-end: crea la credencial en el dispositivo y guarda su id. En producción el desafío y la verificación los hace el servidor.
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  HH.passkeySupported = () => !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
  HH.createPasskey = async function (user) {
    if (!HH.passkeySupported()) return { ok: false, reason: 'unsupported' };
    try {
      const cred = await navigator.credentials.create({ publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: 'SexyRose' },
        user: { id: new TextEncoder().encode(user.id), name: user.email, displayName: user.name },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' }, timeout: 60000,
      } });
      if (!cred) return { ok: false, reason: 'cancelled' };
      user.passkeys = (user.passkeys || []).concat([{ id: cred.id || b64(cred.rawId), createdAt: HH.now() }]); HH.save();
      return { ok: true };
    } catch (e) { return { ok: false, reason: e && e.name === 'NotAllowedError' ? 'cancelled' : 'error' }; }
  };
  HH.loginWithPasskey = async function () {
    if (!HH.passkeySupported()) return { ok: false, reason: 'unsupported' };
    try {
      const cred = await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), userVerification: 'preferred', timeout: 60000 } });
      const id = cred && (cred.id || b64(cred.rawId));
      const u = HH.db.users.find(x => (x.passkeys || []).some(k => k.id === id));
      if (!u) return { ok: false, reason: 'unknown' };
      HH.login(u.id); return { ok: true, user: u };
    } catch (e) { return { ok: false, reason: e && e.name === 'NotAllowedError' ? 'cancelled' : 'error' }; }
  };

  /* ---------- Pagos (simulados: procesador por definir) ---------- */
  // Comisión de la plataforma: solo packs y pedidos a medida; el % lo fija el admin y queda guardado en cada venta
  HH.COMMISSION_TYPES = { pack: 'Packs', request: 'Pedidos a medida' };
  HH.commissionPct = (type) => { if (!HH.COMMISSION_TYPES[type]) return 0; const c = HH.settings().commission || {}; return Math.max(0, Math.min(80, Number(c[type]) || 0)); };
  HH.netOf = (p) => (p && p.netUsd != null ? p.netUsd : (p ? p.amountUsd : 0));
  HH.feeOf = (p) => (p && p.feeUsd) || 0;
  HH.commissionHint = (type) => { const pct = HH.commissionPct(type); return pct ? `<span class="hint">SexyRose retiene el ${pct}% como comisión; el resto es tuyo.</span>` : ''; };
  HH.pay = function ({ userId, amountUsd, type, description, workerId, ref }) {
    const p = { id: HH.uid('pay'), userId, amountUsd: Number(amountUsd), currency: 'USD', type, status: 'approved', description, workerId: workerId || null, ref: ref || null, createdAt: HH.now() };
    if (p.workerId && HH.COMMISSION_TYPES[type]) { const pct = HH.commissionPct(type); p.feePct = pct; p.feeUsd = Math.round(p.amountUsd * pct) / 100; p.netUsd = Math.round((p.amountUsd - p.feeUsd) * 100) / 100; }
    HH.db.payments.push(p); HH.save(); return p;
  };
  HH.checkout = function (opts) {
    const cur = HH.me();
    if (!cur) { HH.clientAuth({ reason: 'Para comprar necesitás una cuenta de cliente. No pedimos documento ni verificación de identidad.', onDone: () => HH.checkout(opts) }); return; }
    if (cur.role === 'admin' || (cur.role === 'worker' && !(opts.meta && ['subscription', 'star'].includes(opts.meta.type)))) { HH.toast('Para comprar contenido usá una cuenta de cliente.', { type: 'warn' }); return; }
    return HH._checkout(opts);
  };
  HH._checkout = function ({ title, amount, description, meta, onSuccess }) {
    const me = HH.viewer();
    if (me.blocked) { HH.toast('Tu cuenta está bloqueada. No podés realizar pagos.', { type: 'danger' }); return; }
    const body = `
      <div class="stack">
        <div class="card soft pad-sm">
          <div class="row between"><span class="muted small">Detalle</span><span class="small">${HH.esc(description || title)}</span></div>
          <div class="row between" style="margin-top:6px"><strong>Total</strong><strong class="num" style="font-size:20px">${HH.money(amount)}</strong></div>
        </div>
        <div class="stack" style="gap:10px">
          <div class="field"><label for="ckName">Nombre en la tarjeta</label><input class="input" id="ckName" value="" placeholder="Como figura en la tarjeta" autocomplete="cc-name"></div>
          <div class="field"><label for="ckNum">Número de tarjeta</label><input class="input num" id="ckNum" value="4509 9535 6623 3704" inputmode="numeric" autocomplete="cc-number"></div>
          <div class="grid-2" style="gap:10px">
            <div class="field"><label for="ckExp">Vence</label><input class="input" id="ckExp" value="11/29" inputmode="numeric"></div>
            <div class="field"><label for="ckCvv">CVV</label><input class="input" id="ckCvv" value="123" inputmode="numeric"></div>
          </div>
        </div>
        ${me.role === 'client' ? `<div class="notice ok">${HH.icon('shield')}<span>La acompañante solo ve tu alias, <strong>${HH.esc(me.name)}</strong>. Nunca tu email ni los datos de tu tarjeta.</span></div>` : ''}
        <div class="notice info">${HH.icon('info')}<span>Checkout de demostración. El procesador de pagos global está por definir (Stripe, dLocal u otro). No se cobra nada.</span></div>
      </div>`;
    HH.modal({
      title: title || 'Pagar',
      body,
      actions: [
        { label: 'Cancelar', cls: 'ghost', action: 'closeModal' },
        { label: 'Pagar ' + HH.money(amount), cls: '', onClick: () => {
          const btn = document.getElementById('ckPayBtn'); if (btn) { btn.disabled = true; btn.textContent = 'Procesando…'; }
          setTimeout(() => {
            const pay = HH.pay({ userId: me.id, amountUsd: amount, type: (meta && meta.type) || 'one_time', description: description || title, workerId: meta && meta.workerId, ref: meta && meta.ref });
            HH.closeModal();
            HH.toast('Pago aprobado · ' + HH.money(amount), { type: 'ok' });
            if (onSuccess) onSuccess(pay);
          }, 700);
        }, id: 'ckPayBtn' },
      ],
    });
  };
  // Compras del cliente
  HH.buyContent = function (item, onDone) {
    HH.checkout({ title: 'Desbloquear ' + (item.type === 'video' ? 'video' : item.type === 'short' ? 'short' : 'foto'), amount: item.priceUsd, description: item.title + (Number(item.accessDays) ? ' · acceso por ' + HH.accessLabel(item.accessDays) : ''), meta: { type: 'one_time', workerId: item.workerId, ref: item.id }, onSuccess: (pay) => {
      HH.db.purchases.push({ id: HH.uid('pu'), clientId: pay.userId, kind: 'content', refId: item.id, workerId: item.workerId, amountUsd: item.priceUsd, accessDays: Number(item.accessDays) || 0, expiresAt: HH.purchaseExpiry(item.accessDays), createdAt: HH.now() });
      item.sales = (item.sales || 0) + 1; HH.save(); if (onDone) onDone();
    } });
  };
  HH.buyPack = function (pack, onDone) {
    HH.checkout({ title: 'Comprar pack', amount: pack.priceUsd, description: pack.title + ' · ' + pack.itemIds.length + ' ítems' + (Number(pack.accessDays) ? ' · acceso por ' + HH.accessLabel(pack.accessDays) : ''), meta: { type: 'pack', workerId: pack.workerId, ref: pack.id }, onSuccess: (pay) => {
      HH.db.purchases.push({ id: HH.uid('pu'), clientId: pay.userId, kind: 'pack', refId: pack.id, workerId: pack.workerId, itemIds: pack.itemIds.slice(), title: pack.title, amountUsd: pack.priceUsd, accessDays: Number(pack.accessDays) || 0, expiresAt: HH.purchaseExpiry(pack.accessDays), createdAt: HH.now() });
      pack.sales = (pack.sales || 0) + 1; HH.save(); if (onDone) onDone();
    } });
  };
  HH.createRequest = function (clientId, workerId, description, kind, priceUsd) {
    const r = { id: HH.uid('rq'), clientId, workerId, kind: kind || 'photo', description: String(description).trim(), status: kind ? 'pendiente' : 'solicitado', priceUsd: priceUsd == null ? null : priceUsd, createdAt: HH.now(), updatedAt: HH.now(), deliveredItemId: null, deliveredItemIds: [] };
    HH.db.requests.push(r); HH.save(); return r;
  };
  // El cliente paga al enviar el pedido; si la acompañante lo rechaza, se reembolsa
  HH.sendPaidRequest = function (profile, kind, description, onDone) {
    if (!HH.planFeat(profile.userId, 'requests')) { HH.toast(profile.displayName + ' no toma pedidos a medida', { type: 'warn' }); return; }
    const price = HH.requestPrices(profile)[kind]; const K = HH.REQUEST_KINDS[kind];
    HH.checkout({ title: 'Pedido a medida · ' + K.label, amount: price, description: K.label + ' a medida de ' + profile.displayName, meta: { type: 'request', workerId: profile.userId }, onSuccess: (pay) => {
      const r = HH.createRequest(pay.userId, profile.userId, description, kind, price); r.accessDays = Number(profile.requestAccessDays) || 0;
      pay.ref = r.id; HH.db.purchases.push({ id: HH.uid('pu'), clientId: pay.userId, kind: 'request', refId: r.id, workerId: profile.userId, amountUsd: price, createdAt: HH.now() });
      HH.save(); if (onDone) onDone(r);
    } });
  };
  HH.refundRequest = function (r, note) {
    HH.db.payments.forEach(x => { if (x.type === 'request' && x.ref === r.id) x.status = 'refunded'; });
    HH.db.purchases = HH.db.purchases.filter(x => !(x.kind === 'request' && x.refId === r.id));
    HH.updateRequest(r.id, { status: 'rechazado', note: note || r.note, refunded: true, refundedAt: HH.now() });
  };
  /* ---------- Baja de cuentas por incumplimiento ---------- */
  HH.POLICY_REASONS = {
    contenido: 'Contenido no permitido',
    sexual: 'Ofrecimiento de servicios sexuales',
    identidad: 'Identidad falsa o fotos de otra persona',
    menores: 'Contenido o datos que involucran a menores',
    fraude: 'Fraude o cobros indebidos',
    acoso: 'Acoso o trato abusivo a clientes',
    otro: 'Otro incumplimiento de las políticas',
  };
  // Emails salientes. Demo: quedan en HH.db.emails. Producción: proveedor transaccional (Resend, SES, Postmark…).
  HH.sendEmail = function ({ to, subject, body, kind }) {
    if (!HH.db.emails) HH.db.emails = [];
    const m = { id: HH.uid('em'), to, subject, body, kind: kind || 'general', status: 'enviado', createdAt: HH.now() };
    HH.db.emails.push(m); HH.save(); return m;
  };
  HH.removalEmail = function (p, u, reasonKey, text) {
    const name = (p && p.displayName) || (u && u.name) || '';
    return {
      to: (u && u.email) || '',
      subject: 'SexyRose: eliminamos tu cuenta',
      body: `Hola ${name}:\n\nEliminamos tu cuenta de SexyRose por incumplir nuestras políticas.\n\nMotivo: ${HH.POLICY_REASONS[reasonKey] || reasonKey}\n\n${String(text || '').trim()}\n\nTu perfil, tus fotos, tus videos y tu contenido ya no están publicados. Los pedidos pagos que tenías pendientes se reembolsaron a los clientes.\n\nEquipo de SexyRose`,
    };
  };
  // Elimina la cuenta de una acompañante, deja registro y le envía el email con el escrito del admin
  HH.deleteWorkerAccount = function (userId, { reason, text, adminId }) {
    const p = HH.profileOf(userId); const u = HH.userById(userId); if (!u) return { error: 'No existe la cuenta' };
    if (!String(text || '').trim()) return { error: 'Falta el escrito' };
    const mail = HH.removalEmail(p, u, reason, text);
    const email = HH.sendEmail(Object.assign({ kind: 'baja' }, mail));
    const db = HH.db;
    // Pedidos pagos pendientes → reembolso
    db.requests.filter(r => r.workerId === userId && (r.status === 'pendiente' || r.status === 'pagado')).forEach(r => HH.refundRequest(r, 'Cuenta dada de baja'));
    const contentIds = new Set(db.content.filter(c => c.workerId === userId).map(c => c.id));
    db.content = db.content.filter(c => c.workerId !== userId);
    db.packs = db.packs.filter(x => x.workerId !== userId);
    db.stories = (db.stories || []).filter(x => x.workerId !== userId);
    db.stars = db.stars.filter(x => x.workerId !== userId);
    db.subscriptions = db.subscriptions.filter(x => x.userId !== userId && x.workerId !== userId);
    db.swipes = db.swipes.filter(x => x.workerId !== userId && x.targetId !== userId);
    db.messages = db.messages.filter(m => m.senderId !== userId && m.receiverId !== userId && m.toId !== userId);
    db.reports.forEach(r => { if (r.targetId === userId && r.status === 'abierto') { r.status = 'resuelto'; r.resolvedAt = HH.now(); } });
    (db.bookings || []).forEach(b => { if (b.workerId === userId && (b.status === 'solicitada' || b.status === 'confirmada')) { b.status = 'cancelada'; b.cancelledBy = 'admin'; b.updatedAt = HH.now(); } });
    db.profiles = db.profiles.filter(x => x.userId !== userId);
    db.users = db.users.filter(x => x.id !== userId);
    // Registro mínimo para auditoría (pagos y compras quedan por contabilidad)
    if (!db.removals) db.removals = [];
    const rec = { id: HH.uid('rm'), userId, name: (p && p.displayName) || u.name, email: u.email, country: p && p.country, reason, text: String(text).trim(), emailId: email.id, contentRemoved: contentIds.size, byId: adminId || null, createdAt: HH.now() };
    db.removals.push(rec);
    if (HH.session && HH.session.userId === userId) HH.session = null;
    HH.save();
    return { ok: true, removal: rec, email };
  };
  // Formulario de pedido (lo usan el perfil público y "Mi cuenta")
  HH.openRequestModal = function (profile, onDone) {
    if (!HH.planFeat(profile.userId, 'requests')) { HH.toast(profile.displayName + ' no toma pedidos a medida', { type: 'warn' }); return; }
    const prices = HH.requestPrices(profile); let kind = 'photo';
    const kinds = Object.entries(HH.REQUEST_KINDS);
    const render = () => {
      HH.modal({ title: 'Pedir contenido a ' + profile.displayName, body: `
        <div class="field"><span class="label">¿Qué querés?</span><div class="req-kinds">${kinds.map(([k, K]) => `<button type="button" class="radio-card${k === kind ? ' active' : ''}" data-rk="${k}" aria-pressed="${k === kind}">${HH.icon(K.icon)}<span class="grow"><strong>${K.label}</strong><span class="tiny muted">${K.hint}</span></span><strong class="num">${HH.money(prices[k])}</strong></button>`).join('')}</div></div>
        <div class="field"><label for="rqText">Contale qué querés</label><textarea class="textarea" id="rqText" maxlength="400" placeholder="${kind === 'video' ? 'Ej.: un video corto recomendando tres cafeterías de Palermo para una visita de dos días.' : kind === 'pack' ? 'Ej.: fotos y un video del recorrido por el Malba con la muestra nueva.' : 'Ej.: una foto en la heladería de la costanera.'}"></textarea><span class="hint">Nada de contenido sexual: la acompañante puede rechazarlo y te devolvemos el dinero.</span></div>
        <div class="notice info">${HH.icon('info')}<span>Pagás ahora ${HH.money(prices[kind])}. Si ${HH.esc(profile.displayName)} acepta, te envía el contenido directo a tu cuenta${Number(profile.requestAccessDays) ? ` y lo podés ver durante <strong>${HH.accessLabel(profile.requestAccessDays)}</strong> desde la entrega` : ''}. Si lo rechaza, te reembolsamos el total.</span></div>`,
        actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: 'Pagar ' + HH.money(prices[kind]) + ' y enviar', onClick: () => {
          const t = (document.getElementById('rqText').value || '').trim();
          if (t.length < 10) { HH.toast('Contale un poco más: mínimo 10 caracteres.', { type: 'warn' }); return; }
          HH.closeModal(); HH.sendPaidRequest(profile, kind, t, (r) => { HH.toast('Pedido enviado. Te avisamos cuando ' + profile.displayName + ' responda.', { type: 'ok' }); if (onDone) onDone(r); });
        } }] });
      document.querySelectorAll('#modalBox [data-rk]').forEach(b => b.addEventListener('click', () => { const t = document.getElementById('rqText').value; kind = b.dataset.rk; render(); document.getElementById('rqText').value = t; }));
    };
    render();
  };
  HH.updateRequest = function (id, patch) { const r = HH.db.requests.find(x => x.id === id); if (!r) return null; Object.assign(r, patch, { updatedAt: HH.now() }); HH.save(); return r; };
  HH.payRequest = function (r, onDone) {
    HH.checkout({ title: 'Pagar pedido a medida', amount: r.priceUsd, description: r.description.slice(0, 60), meta: { type: 'request', workerId: r.workerId, ref: r.id }, onSuccess: (pay) => {
      HH.db.purchases.push({ id: HH.uid('pu'), clientId: pay.userId, kind: 'request', refId: r.id, workerId: r.workerId, amountUsd: r.priceUsd, createdAt: HH.now() });
      HH.updateRequest(r.id, { status: 'pagado' }); if (onDone) onDone();
    } });
  };
  // Suscripciones y Stars (acompañante)
  HH.subscribe = function (workerId, level, onDone) {
    const L = HH.LEVELS[level];
    if (level === 'S' && !HH.isStar(workerId) && HH.starSlotsFree(HH.starRegionOf(workerId)) <= 0) { HH.toast('No quedan lugares Star este mes en ' + (HH.starRegionOf(workerId) || 'tu provincia') + '. Te avisamos cuando se libere uno.', { type: 'warn' }); return; }
    HH.checkout({ title: 'Plan ' + L.label, amount: L.price_usd, description: 'Suscripción mensual · se renueva cada 30 días', meta: { type: 'subscription', ref: level }, onSuccess: () => {
      HH.db.subscriptions.forEach(s => { if (s.userId === workerId && s.status === 'active') s.status = 'cancelled'; });
      HH.db.subscriptions.push({ id: HH.uid('sub'), userId: workerId, level, status: 'active', startedAt: HH.now(), expiresAt: HH.daysFromNow(30), providerRef: 'demo' });
      if (level === 'S' && !HH.isStar(workerId)) HH.db.stars.push({ id: HH.uid('st'), workerId, activeUntil: HH.daysFromNow(HH.STARS.days), createdAt: HH.now() });
      if (level !== 'S') HH.db.stars.forEach(x => { if (x.workerId === workerId && new Date(x.activeUntil) > new Date()) x.activeUntil = HH.now(); });
      const p = HH.profileOf(workerId); if (p && p.status === 'pending') p.status = 'active';
      HH.save(); if (onDone) onDone();
    } });
  };
  HH.buyStar = function (workerId, onDone) {
    if (HH.starSlotsFree(HH.starRegionOf(workerId)) <= 0) { HH.toast('No hay lugares Star libres en ' + (HH.starRegionOf(workerId) || 'tu provincia') + ' este mes. Te avisamos cuando se libere uno.', { type: 'warn' }); return; }
    HH.checkout({ title: 'Slot Stars', amount: HH.STARS.price_usd, description: 'Destacada en todo el sitio por ' + HH.STARS.days + ' días', meta: { type: 'star', ref: workerId }, onSuccess: () => {
      HH.db.stars.push({ id: HH.uid('st'), workerId, activeUntil: HH.daysFromNow(HH.STARS.days), createdAt: HH.now() });
      HH.save(); if (onDone) onDone();
    } });
  };

  /* ---------- Ubicación del visitante ---------- */
  // Centros de ciudad (aprox.). Las acompañantes se ubican con precisión de barrio, nunca exacta.
  HH.NEAR_CITY_KM = 80; // si estás a menos de esto del centro de una ciudad, se toma esa ciudad
  HH.geo = () => (HH.ui.geo && typeof HH.ui.geo.lat === 'number') ? HH.ui.geo : null;
  HH.haversine = (a, b) => { const R = 6371, r = x => x * Math.PI / 180; const dLat = r(b[0] - a[0]), dLng = r(b[1] - a[1]); const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const hashNum = (str) => { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
  // Coordenadas aproximadas del perfil: las que cargó (redondeadas a ~1 km) o el centro de su ciudad con un desplazamiento fijo de hasta ~4 km
  HH.profileCoords = function (p) {
    if (p && !p.traveling && typeof p.lat === 'number' && typeof p.lng === 'number') return [p.lat, p.lng];
    const c = p && HH.locCoords && HH.locCoords(HH.locByName(p.city)); if (!c) return null;
    const a = hashNum(p.userId) * 2 * Math.PI, d = 0.006 + hashNum(p.userId + 'd') * 0.03;
    return [c[0] + Math.sin(a) * d, c[1] + Math.cos(a) * d];
  };
  HH.distanceKm = function (p) { const g = HH.geo(); const c = HH.profileCoords(p); return g && c ? HH.haversine([g.lat, g.lng], c) : null; };
  HH.fmtKm = function (km) {
    if (km == null) return '';
    if (km < 1) return 'a menos de 1 km';
    if (km < 10) return 'a ' + km.toLocaleString(HH.loc(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km';
    return 'a ' + Math.round(km).toLocaleString(HH.loc()) + ' km';
  };
  HH.byDistance = (list) => { if (!HH.geo()) return list; return list.slice().sort((a, b) => (HH.distanceKm(a) ?? 1e9) - (HH.distanceKm(b) ?? 1e9)); };
  HH.nearestCity = function (lat, lng) {
    let best = null;
    Object.entries(HH.CITY_COORDS).forEach(([city, c]) => { const km = HH.haversine([lat, lng], c); if (!best || km < best.km) best = { city, km }; });
    return best;
  };
  // Pide la ubicación al navegador. Resuelve { ok, city, km } o { ok:false, reason: 'denied'|'unavailable'|'timeout'|'unsupported' }
  HH.locate = function ({ silent } = {}) {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { HH.ui.geoStatus = 'unsupported'; HH.save(); resolve({ ok: false, reason: 'unsupported' }); return; }
      navigator.geolocation.getCurrentPosition((pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        const near = HH.nearestCity(lat, lng);
        HH.ui.geo = { lat, lng, acc: Math.round(pos.coords.accuracy || 0), at: HH.now(), city: near && near.km <= HH.NEAR_CITY_KM ? near.city : null };
        HH.ui.geoStatus = 'ok';
        // Se mantiene el alcance elegido (por defecto, el país); con ubicación se ordena por distancia
        HH.save();
        resolve({ ok: true, city: HH.ui.geo.city, km: near ? near.km : null });
      }, (err) => {
        const reason = err && err.code === 1 ? 'denied' : err && err.code === 3 ? 'timeout' : 'unavailable';
        HH.ui.geoStatus = reason; HH.save(); resolve({ ok: false, reason });
      }, { enableHighAccuracy: false, timeout: 10000, maximumAge: silent ? 10 * 60 * 1000 : 0 });
    });
  };
  HH.forgetLocation = function () { HH.ui.geo = null; HH.ui.geoStatus = 'off'; HH.ui.city = undefined; HH.save(); };
  // Al abrir el sitio: si el permiso ya estaba concedido, actualiza la ubicación sin preguntar
  HH.autoLocate = function () {
    if (HH.SSR) return;
    if (!navigator.permissions || !navigator.permissions.query || HH.ui.geoStatus === 'off') return;
    navigator.permissions.query({ name: 'geolocation' }).then((st) => {
      if (st.state !== 'granted') return;
      const g = HH.geo(); const fresh = g && (Date.now() - new Date(g.at).getTime()) < 30 * 60 * 1000;
      if (fresh) return;
      HH.locate({ silent: true }).then(r => { if (r.ok) HH.refresh(); });
    }).catch(() => {});
  };
  // Bloque reutilizable para pedir / mostrar la ubicación
  HH.locationBar = function (opts = {}) {
    const g = HH.geo(); const st = HH.ui.geoStatus;
    if (g) return `<div class="loc-bar ok">${HH.icon('pin')}<span class="grow">${g.city ? 'Estás cerca de <strong>' + HH.esc(g.city) + '</strong>' : 'Usando tu ubicación'}<span class="tiny muted"> · ordenamos por distancia</span></span><button type="button" class="btn ghost sm" data-action="locateMe">${HH.icon('refresh')} Actualizar</button><button type="button" class="btn ghost sm" data-action="forgetLocation" aria-label="Dejar de usar mi ubicación">${HH.icon('x')}</button></div>`;
    if (st === 'denied') return `<div class="loc-bar warn">${HH.icon('alert')}<span class="grow">No tenemos permiso para ver tu ubicación. Podés habilitarlo en el navegador (ícono de candado de la barra de direcciones) o elegir la ciudad a mano.</span><button type="button" class="btn ghost sm" data-action="locateMe">Reintentar</button></div>`;
    if (st === 'unsupported' || st === 'unavailable' || st === 'timeout') return `<div class="loc-bar warn">${HH.icon('alert')}<span class="grow">No pudimos obtener tu ubicación${st === 'timeout' ? ' a tiempo' : ''}. Elegí la ciudad a mano o probá de nuevo.</span><button type="button" class="btn ghost sm" data-action="locateMe">Reintentar</button></div>`;
    return `<div class="loc-bar ask">${HH.icon('pin')}<span class="grow"><strong>Mirá quién está cerca tuyo.</strong><span class="tiny muted"> Usamos tu ubicación solo en este dispositivo para ordenar por distancia; no se guarda ni se comparte.</span></span><button type="button" class="btn sm" data-action="locateMe">${HH.icon('pin')} Usar mi ubicación</button></div>`;
  };

  /* ---------- Viajes: la acompañante sigue trabajando en otro destino entre dos fechas ---------- */
  HH.TRIP_PREVIEW_DAYS = 7;   // aparece en los listados del destino desde 7 días antes de llegar
  HH.TRIP_MAX_DAYS = 60;
  const dayStr = (d) => HH.localDay(d);
  HH.tripsOf = (p) => (p && p.trips ? p.trips.slice().sort((a, b) => a.from < b.from ? -1 : 1) : []);
  HH.activeTrip = (p) => { const t = dayStr(); return HH.tripsOf(p).find(tr => tr.from <= t && t <= tr.to) || null; };
  HH.upcomingTrip = (p) => { const t = dayStr(), lim = dayStr(new Date(Date.now() + HH.TRIP_PREVIEW_DAYS * 864e5)); return HH.tripsOf(p).find(tr => tr.from > t && tr.from <= lim) || null; };
  HH.fmtDay = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(HH.loc(), { day: 'numeric', month: 'short' }); };
  // Aplica los viajes: durante un viaje activo, la ciudad y el país del perfil pasan a ser los del destino.
  HH.applyTrips = function () {
    (HH.db.profiles || []).forEach(p => {
      if (p.homeCity === undefined) { p.homeCity = p.city; p.homeCountry = p.country; }
      if (Array.isArray(p.photos) && p.photos.some(x => !x)) p.photos = p.photos.filter(Boolean);
      const tr = HH.activeTrip(p);
      if (tr) { p.city = tr.city; p.country = tr.country || HH.CITY_COUNTRY[tr.city] || p.homeCountry; p.traveling = true; }
      else { p.city = p.homeCity; p.country = p.homeCountry; p.traveling = false; }
    });
  };
  // ¿Aparece en los listados de esa ciudad? Sí si está ahí (o de viaje ahí) o si llega en los próximos días.
  HH.tripBadge = function (p) {
    const a = HH.activeTrip(p); if (a) return `<span class="badge info">${HH.icon('globe')} De visita hasta el ${HH.fmtDay(a.to)}</span>`;
    const u = HH.upcomingTrip(p); if (u) return `<span class="badge warn">${HH.icon('calendar')} En ${HH.esc(u.city)} desde el ${HH.fmtDay(u.from)}</span>`;
    return '';
  };
  HH.addTrip = function (p, { city, from, to }) {
    const today = dayStr();
    if (!city) return { error: 'Elegí el destino.' };
    if (!from || !to) return { error: 'Elegí las fechas de llegada y de regreso.' };
    if (from < today) return { error: 'La fecha de llegada no puede ser anterior a hoy.' };
    if (to < from) return { error: 'La fecha de regreso tiene que ser igual o posterior a la de llegada.' };
    const days = Math.round((new Date(to) - new Date(from)) / 864e5) + 1;
    if (days > HH.TRIP_MAX_DAYS) return { error: 'Un viaje puede durar hasta ' + HH.TRIP_MAX_DAYS + ' días. Si te mudás, cambiá tu ciudad en Mi perfil.' };
    if (city === p.homeCity) return { error: 'Ese destino es tu ciudad. Elegí otra.' };
    if (HH.tripsOf(p).some(t => !(to < t.from || from > t.to))) return { error: 'Esas fechas se superponen con otro viaje.' };
    p.trips = (p.trips || []).concat([{ id: HH.uid('tr'), city, country: HH.CITY_COUNTRY[city] || '', from, to, createdAt: HH.now() }]);
    HH.applyTrips(); HH.save(); return { ok: true };
  };
  HH.removeTrip = function (p, id) { p.trips = (p.trips || []).filter(t => t.id !== id); HH.applyTrips(); HH.save(); };

  /* ---------- Galería del perfil: hasta 15 fotos y 5 videos públicos. El contenido privado (pago) no tiene límite ---------- */
  // Fuente de imagen válida: dataURL (demo local) o URL https (Cloudinary)
  // Marca de agua impresa por Cloudinary (overlay del logo subido con el public id configurado en admin)
  HH.cdnWatermark = (url) => { const m = HH.mediaConfig ? HH.mediaConfig() : {}; if (!url || !/res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\//.test(url) || /\/l_/.test(url)) return url; const id = (m.watermarkId || 'sexyrose_watermark').replace(/\//g, ':'); return url.replace('/upload/', `/upload/l_${id},fl_relative,w_0.6,o_38,g_center/`); };
  HH.isImgSrc = (x) => typeof x === 'string' && (x.startsWith('data:') || x.startsWith('https://'));
  HH.PROFILE_LIMITS = { photos: 1000, videos: 500 }; // máximo absoluto; el límite real depende del plan (HH.galleryLimits)
  HH.profileVideos = (p) => (p && Array.isArray(p.videos) ? p.videos : []);
  HH.videoMedia = function (v, opts = {}) {
    if (v && v.src) return `<video src="${v.src}" ${opts.controls ? 'controls' : 'muted'} playsinline preload="metadata" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video>`;
    const hue = (v && v.hue) || 300;
    return `<div class="ph" style="background:${HH.hueGradient(hue, true)}">${HH.icon('video')}</div>`;
  };

  /* ---------- Archivos: Cloudinary si está configurado; si no, se guardan en el navegador (demo) ---------- */
  HH.mediaConfig = () => { const m = (HH.settings().media) || {}; return { cloudName: (m.cloudName || '').trim(), uploadPreset: (m.uploadPreset || '').trim(), folder: (m.folder || 'sexyrose').trim(), watermarkId: (m.watermarkId || 'sexyrose_watermark').trim() }; };
  HH.cloudinaryOn = () => { const m = HH.mediaConfig(); return !!(m.cloudName && m.uploadPreset); };
  // Sube a Cloudinary (upload sin firma, con un upload preset). Devuelve la URL segura.
  HH.cloudinaryUpload = async function (file, kind, subfolder) {
    const m = HH.mediaConfig(); const fd = new FormData();
    fd.append('file', file); fd.append('upload_preset', m.uploadPreset); fd.append('folder', m.folder + (subfolder ? '/' + subfolder : ''));
    const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(m.cloudName)}/${kind === 'video' ? 'video' : 'image'}/upload`, { method: 'POST', body: fd });
    const json = await res.json(); if (!res.ok || !json.secure_url) throw new Error((json.error && json.error.message) || 'Error al subir');
    return json.secure_url;
  };
  // Sube una imagen o un video y devuelve una URL usable en <img>/<video>
  HH.uploadMedia = async function (file, { kind, folder } = {}) {
    kind = kind || (file.type.startsWith('video/') ? 'video' : 'image');
    if (HH.cloudinaryOn()) { try { return { url: await HH.cloudinaryUpload(file, kind, folder), remote: true }; } catch (e) { HH.toast('No se pudo subir a Cloudinary: ' + e.message + '. Se guarda en este navegador.', { type: 'warn', ms: 5000 }); } }
    if (kind === 'image') return new Promise(r => HH.compressImage(file, (src) => r({ url: src, remote: false })));
    if (file.size <= 600 * 1024) return new Promise(r => { const fr = new FileReader(); fr.onload = () => r({ url: fr.result, remote: false }); fr.readAsDataURL(file); });
    return { url: null, remote: false, tooBig: true };
  };

  /* ---------- Historias (24 h) ---------- */
  HH.STORY_HOURS = 24;
  HH.storiesOf = (workerId) => (HH.db.stories || []).filter(st => st.workerId === workerId && new Date(st.expiresAt) > new Date()).sort(HH.by('createdAt', 1));
  HH.profilesWithStories = () => HH.rankedProfiles().filter(p => HH.storiesOf(p.userId).length);
  HH.storiesToday = (workerId) => (HH.db.stories || []).filter(st => st.workerId === workerId && HH.localDay(st.createdAt) === HH.localDay()).length;
  HH.storiesLeftToday = (workerId) => { const lim = HH.planFeat(workerId, 'stories_per_day'); return lim === null || lim === undefined ? Infinity : Math.max(0, lim - HH.storiesToday(workerId)); };
  HH.addStory = function (workerId, { src, caption, hue }) {
    if (!HH.db.stories) HH.db.stories = [];
    if (HH.storiesLeftToday(workerId) <= 0) return null;
    const st = { id: HH.uid('st'), workerId, src: src || null, caption: String(caption || '').trim(), hue: hue == null ? Math.floor(Math.random() * 360) : hue, views: 0, createdAt: HH.now(), expiresAt: new Date(Date.now() + HH.STORY_HOURS * 3600e3).toISOString() };
    HH.db.stories.push(st); HH.save(); return st;
  };
  HH.removeStory = function (id) { HH.db.stories = (HH.db.stories || []).filter(s => s.id !== id); HH.save(); };
  HH.seenStories = () => { HH.ui.seen = HH.ui.seen || {}; return HH.ui.seen; };
  HH.storyRing = function (profile, size = 64, opts = {}) {
    const n = HH.storiesOf(profile.userId).length;
    const seen = n && HH.storiesOf(profile.userId).every(s => HH.seenStories()[s.id]);
    const cls = 'story-ring' + (n ? (seen ? ' seen' : ' live') : ' none');
    return `<button type="button" class="${cls}" style="--s:${size}px" data-action="openStories" data-id="${profile.userId}" aria-label="${n ? 'Ver ' + n + ' ' + HH.plural(n, 'historia') + ' de ' : 'Perfil de '}${HH.esc(profile.displayName)}"${opts.go ? ` data-go="${opts.go}"` : ''}>${HH.avatar(profile, size - 8)}</button>`;
  };
  HH.storyMedia = function (st, p) {
    const hue = st.hue || 330;
    // Historia en video: arranca sin sonido (como en Instagram); el visor la reproduce y maneja el sonido
    if (st.video && st.src) {
      const horiz = st.w && st.h && st.w > st.h * 1.05;
      return `${st.poster ? `<img src="${HH.esc(st.poster)}" alt="">` : ''}<video class="story-vid${horiz ? ' h' : ''}" src="${HH.esc(st.src)}"${st.poster ? ` poster="${HH.esc(st.poster)}"` : ''} muted playsinline preload="auto" disablepictureinpicture disableremoteplayback controlslist="nodownload noplaybackrate"></video>`;
    }
    return st.src ? `<img src="${st.src}" alt="">` : `<div class="ph" style="background:${HH.hueGradient(hue, true)}"><span class="deco" style="width:60%;height:60%;left:-15%;top:-10%;background:hsl(${(hue + 50) % 360} 90% 85%)"></span><span class="deco" style="width:45%;height:45%;right:-10%;bottom:-5%;background:hsl(${(hue + 310) % 360} 80% 70%)"></span><svg class="silhouette" viewBox="0 0 100 125" aria-hidden="true"><circle cx="50" cy="42" r="20"/><path d="M8 125c2-30 20-46 42-46s40 16 42 46Z"/></svg></div>`;
  };
  // Visor de historias: modal propio a pantalla completa con barras de progreso y toque para avanzar
  // Visor de historias. Recorre una cola de acompañantes: al terminar las de una, sigue con la siguiente.
  // queue: lista de workerIds en el orden en que se muestran (por defecto, la fila de historias del inicio).
  // Historias: solo las del lugar elegido (por defecto, el país del visitante; incluye a las que llegan de viaje),
  // ordenadas por categoría del plan (Star, Diamante, Platino, Oro, Plata, Bronce); dentro de cada una,
  // por cercanía si el visitante compartió su ubicación, o verificadas y más vistas primero.
  HH.storyOrder = () => {
    const place = HH.currentPlace();
    const ws = HH.byDistance(HH.profilesWithStories()).filter(p => !place || HH.inCity(p, place));
    const rank = (p) => { const l = HH.levelOf(p.userId); return l && HH.LEVELS[l] ? HH.LEVELS[l].rank : 0; };
    return ws.map((p, i) => ({ p, i })).sort((a, b) => rank(b.p) - rank(a.p) || a.i - b.i).map(x => x.p);
  };
  HH.storyQueue = () => HH.storyOrder().map(p => p.userId);
  // Sin cola: solo las historias de esa acompañante. La fila "Historias" del inicio pasa la cola completa.
  HH.storyQueueFor = (el) => (el && el.closest && el.closest('.stories-row') ? HH.storyQueue() : null);
  // opts.items: lista fija de historias (destacadas: no vencen y no pasan a otra acompañante); opts.title, opts.highlightId.
  HH.openStories = function (workerId, startIndex = 0, queue, opts = {}) {
    const hl = !!opts.items;
    const q = hl ? [workerId] : (queue || [workerId]).filter(id => HH.storiesOf(id).length);
    if (!q.includes(workerId)) q.unshift(workerId);
    let w = q.indexOf(workerId);
    let p = HH.profileOf(workerId); let list = hl ? opts.items.slice() : HH.storiesOf(workerId);
    if (p && p.hidden && !(HH.me() && HH.me().id === workerId)) return;
    if (!p || !list.length) { if (p && !hl) HH.go('#perfil.' + p.slug); return; }
    // Si ya vio todas las de esta acompañante, arranca desde la primera; si no, desde la primera sin ver
    const firstUnseen = hl ? 0 : list.findIndex(s => !HH.seenStories()[s.id]);
    let i = startIndex || (firstUnseen > 0 ? firstUnseen : 0);
    const SND_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>';
    const SND_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/></svg>';
    const root = document.getElementById('storyRoot') || (() => { const d = document.createElement('div'); d.id = 'storyRoot'; d.className = 'story-root'; document.body.appendChild(d); return d; })();
    const load = (k, fromEnd) => { w = k; p = HH.profileOf(q[w]); list = HH.storiesOf(q[w]); i = fromEnd ? list.length - 1 : 0; };
    const render = () => {
      const st = list[i]; if (!hl) HH.seenStories()[st.id] = true; st.views = (st.views || 0) + 1; HH.save();
      const next = q[w + 1] ? HH.profileOf(q[w + 1]) : null;
      const muted = HH.storyMuted !== false;
      root.innerHTML = `<div class="story-view jsbar${st.video ? ' es-video' : ''}">
        <div class="story-bars">${list.map((x, k) => `<span class="${k < i ? 'done' : k === i ? 'cur' : ''}"><i></i></span>`).join('')}</div>
        <div class="story-head"><button type="button" class="story-who" data-story="profile" aria-label="Ver perfil de ${HH.esc(p.displayName)}">${HH.avatar(p, 36)}<span class="grow"><span class="story-name">${HH.esc(p.displayName)}</span><span class="tiny story-sub">${hl ? `<span data-noi18n>${HH.esc(opts.title || '')}</span> · ${HH.fmtDate(st.createdAt)}` : `${HH.timeAgo(st.createdAt)}${p.city ? ' · ' + HH.esc(p.city) : ''}`}</span></span></button>${q.length > 1 ? `<span class="tiny" style="opacity:.7">${w + 1} de ${q.length}</span>` : ''}${st.video ? `<button type="button" class="icon-btn sm story-snd" data-story="sound" aria-label="${muted ? 'Activar sonido' : 'Silenciar'}" aria-pressed="${!muted}">${muted ? SND_OFF : SND_ON}</button>` : ''}<button type="button" class="icon-btn sm" data-story="close" aria-label="Cerrar">${HH.icon('x')}</button></div>
        <div class="story-media wm">${HH.storyMedia(st, p)}</div>
        ${st.caption ? `<div class="story-caption"><span data-noi18n>${HH.esc(st.caption)}</span></div>` : ''}
        <div class="story-foot">${hl && opts.highlightId && HH.me() && HH.me().id === q[w] ? `<button type="button" class="btn secondary sm" data-story="hledit">${HH.icon('edit')} Editar destacada</button>` : `<button type="button" class="btn secondary sm" data-story="profile">${HH.icon('user')} Ver perfil</button>`}${HH.canTakeBookings && HH.canTakeBookings(p) && !(HH.me() && HH.me().id === q[w]) ? `<button type="button" class="btn secondary sm" data-story="book">${HH.icon('calendar')} Reservar</button>` : ''}</div>
        ${next && i === list.length - 1 ? `<div class="story-next tiny">Sigue: ${HH.esc(next.displayName)}</div>` : ''}
        <button type="button" class="story-tap prev" data-story="prev" aria-label="Anterior"></button><button type="button" class="story-tap next" data-story="next" aria-label="Siguiente"></button>
      </div>`;
      arrancar(st);
      precargar();
    };
    // Avance: las fotos duran 5 s; los videos, lo que dura el video (la barra sigue al video y pasa al terminar).
    // Mantener apretado pausa (fotos y videos); al soltar sigue. La barra la mueve este reloj, no una animación.
    const FOTO_MS = 5000;
    let raf = 0; let ultimo = 0; let hecho = 0; let pausada = false; let vid = null; let barra = null;
    let holdT = null; let sostenida = false; let tragarClick = false;
    const parar = () => { cancelAnimationFrame(raf); raf = 0; if (vid) { vid.onended = null; vid.onerror = null; try { vid.pause(); } catch (e) { /* */ } } vid = null; };
    const tick = (t) => {
      raf = requestAnimationFrame(tick);
      const dt = ultimo ? Math.min(100, t - ultimo) : 0; ultimo = t;
      if (pausada) return;
      let frac;
      if (vid) { const d = vid.duration && isFinite(vid.duration) ? vid.duration : 0; frac = d ? vid.currentTime / d : 0; }
      else { hecho += dt; frac = hecho / FOTO_MS; }
      if (barra) barra.style.width = Math.min(100, frac * 100) + '%';
      if (!vid && frac >= 1) { parar(); step(1); }
    };
    const arrancar = (st) => {
      parar(); hecho = 0; ultimo = 0; pausada = false; sostenida = false;
      barra = root.querySelector('.story-bars span.cur i');
      const v = st.video ? root.querySelector('video.story-vid') : null;
      if (v) {
        vid = v; v.muted = HH.storyMuted !== false;
        v.onended = () => { if (vid === v) { parar(); step(1); } };
        // Si el video no carga, sigue como una foto (con su portada)
        v.onerror = () => { if (vid === v) { vid = null; v.remove(); } };
        const pr = v.play();
        if (pr && pr.catch) pr.catch(() => { if (vid === v && !v.muted) { v.muted = true; HH.storyMuted = true; pintarSonido(); const p2 = v.play(); if (p2 && p2.catch) p2.catch(() => {}); } });
      }
      raf = requestAnimationFrame(tick);
    };
    // Lo siguiente: solo la portada (o la foto), nada de video
    const precargar = () => {
      const nx = list[i + 1] || (q[w + 1] ? HH.storiesOf(q[w + 1])[0] : null);
      const src = nx ? (nx.video ? nx.poster : nx.src) : '';
      if (src && HH.isImgSrc && HH.isImgSrc(src)) { const im = new Image(); im.decoding = 'async'; im.src = src; }
    };
    const pausar = (on) => {
      pausada = on;
      const view = root.querySelector('.story-view'); if (view) view.classList.toggle('paused', on);
      if (vid) { if (on) vid.pause(); else { const pr = vid.play(); if (pr && pr.catch) pr.catch(() => {}); } }
    };
    const pintarSonido = () => {
      const b = root.querySelector('.story-snd'); if (!b) return;
      const m = HH.storyMuted !== false;
      const lab = m ? 'Activar sonido' : 'Silenciar';
      b.innerHTML = m ? SND_OFF : SND_ON; b.setAttribute('aria-label', HH.t ? HH.t(lab) : lab); b.setAttribute('aria-pressed', String(!m));
    };
    root.onpointerdown = (ev) => {
      if (!ev.target.closest('.story-tap, .story-media')) return;
      clearTimeout(holdT); holdT = setTimeout(() => { sostenida = true; pausar(true); }, 200);
    };
    const soltar = () => {
      clearTimeout(holdT);
      if (sostenida) { sostenida = false; pausar(false); tragarClick = true; setTimeout(() => { tragarClick = false; }, 400); }
    };
    root.onpointerup = soltar; root.onpointercancel = soltar; root.onpointerleave = soltar;
    root.oncontextmenu = (ev) => { if (ev.target.closest('.story-view')) ev.preventDefault(); };
    let ovId = null;
    // fromHistory: la cerró el botón "atrás"; nav: después se navega con replace
    const close = (o = {}) => { parar(); clearTimeout(holdT); root.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); HH.renderStoryRings && HH.renderStoryRings(); if (!o.fromHistory) HH.overlayClosed(ovId, o); };
    const step = (d) => {
      i += d;
      if (i >= list.length) { if (w + 1 < q.length) load(w + 1, false); else { close(); return; } }
      else if (i < 0) { if (w > 0) load(w - 1, true); else i = 0; }
      render();
    };
    const onKey = (ev) => { if (ev.key === 'ArrowRight') step(1); else if (ev.key === 'ArrowLeft') step(-1); else if (ev.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    root.onclick = (ev) => { const b = ev.target.closest('[data-story]'); if (!b) return; const a = b.dataset.story; const id = q[w];
      if (tragarClick && (a === 'prev' || a === 'next')) { tragarClick = false; return; }
      if (a === 'sound') { HH.storyMuted = HH.storyMuted === false; if (vid) { vid.muted = HH.storyMuted; if (!vid.muted && vid.paused && !pausada) { const pr = vid.play(); if (pr && pr.catch) pr.catch(() => {}); } } pintarSonido(); return; }
      if (a === 'close') close(); else if (a === 'prev') step(-1); else if (a === 'next') step(1);
      else if (a === 'profile') { close({ nav: true }); HH.go('#perfil.' + p.slug, { replace: true }); }
      else if (a === 'hledit') { close(); HH.openHighlightEditor && HH.openHighlightEditor(opts.highlightId); }
      else if (a === 'book') { close(); HH.actions.pubBook({ dataset: { id } }); }
      };
    document.body.style.overflow = 'hidden'; ovId = HH.overlayOpen(() => close({ fromHistory: true })); render();
  };
  HH.renderStoryRings = function () { document.querySelectorAll('.story-ring[data-id]').forEach(el => { const id = el.dataset.id; const list = HH.storiesOf(id); const seen = list.length && list.every(s => HH.seenStories()[s.id]); el.classList.toggle('live', !!list.length && !seen); el.classList.toggle('seen', !!list.length && !!seen); el.classList.toggle('none', !list.length); }); };

  /* ---------- Media (placeholders con gradiente) ---------- */
  HH.hueGradient = (hue, alt) => `linear-gradient(${alt ? 160 : 135}deg, hsl(${hue} 85% 78%), hsl(${(hue + 40) % 360} 80% 62%) 60%, hsl(${(hue + 300) % 360} 75% 55%))`;
  HH.avatar = function (profile, size = 40, cls = '') {
    const photo = profile && (profile.photos || []).find(x => HH.isImgSrc(x));
    const hue = (profile && profile.hue) || 330;
    const txt = profile ? HH.initials(profile.displayName || profile.name) : '?';
    return `<span class="avatar ${cls}" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px;background:${HH.hueGradient(hue)}">${photo ? `<img src="${photo}" alt="">` : txt}</span>`;
  };
  HH.userAvatar = function (user, size = 40) { const p = HH.profileOf(user.id); if (p) return HH.avatar(p, size); return `<span class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px;background:${HH.hueGradient(user.hue || 200)}">${HH.initials(user.name)}</span>`; };
  // Foto de perfil grande (index = posición en photos)
  HH.photo = function (profile, index = 0, opts = {}) {
    const raw = (profile.photos || [])[index]; const src = HH.isImgSrc(raw) ? (opts.noWm ? raw : HH.cdnWatermark(raw)) : null;
    const hue = ((profile.hue || 330) + index * 25) % 360;
    const cls = 'media ' + (opts.cls || '') + (opts.fit && src ? ' fit' : '');
    // opts.fit: foto entera sin recorte (cualquier formato) sobre la misma foto desenfocada de fondo
    const inner = src ? `${opts.fit ? `<img class="ph-bg" src="${src}" alt="" aria-hidden="true">` : ''}<img src="${src}" alt="${HH.esc(profile.displayName)}">` :
      `<div class="ph" style="background:${HH.hueGradient(hue, index % 2)}">
         <span class="deco" style="width:55%;height:55%;left:-10%;top:-10%;background:hsl(${(hue + 60) % 360} 90% 85%)"></span>
         <span class="deco" style="width:40%;height:40%;right:-8%;bottom:10%;background:hsl(${(hue + 320) % 360} 80% 70%)"></span>
         <svg class="silhouette" viewBox="0 0 100 125" aria-hidden="true"><circle cx="50" cy="42" r="20"/><path d="M8 125c2-30 20-46 42-46s40 16 42 46Z"/></svg>
         <span class="initial">${HH.initials(profile.displayName)}</span>
       </div>`;
    return `<div class="${cls}${opts.noWm ? '' : ' wm'}" style="${opts.style || ''}">${inner}${opts.children || ''}</div>`;
  };
  // Miniatura de contenido (foto/video/short)
  HH.contentThumb = function (item, opts = {}) {
    const hue = item.hue || 330;
    const viewer = HH.viewerId();
    const locked = item.isPremium && !HH.canView(item, viewer) && !opts.noLock;
    const cls = 'media ' + (opts.cls !== undefined ? opts.cls : (item.type === 'short' ? 'tall' : item.type === 'video' ? 'wide' : ''));
    const inner = item.src ? `<img src="${opts.noWm ? item.src : HH.cdnWatermark(item.src)}" alt="${HH.esc(item.title)}">` :
      `<div class="ph" style="background:${HH.hueGradient(hue, item.type === 'video')}">
         <span class="deco" style="width:60%;height:60%;left:-15%;top:-15%;background:hsl(${(hue + 50) % 360} 90% 85%)"></span>
         <span class="deco" style="width:45%;height:45%;right:-10%;bottom:-5%;background:hsl(${(hue + 310) % 360} 80% 70%)"></span>
         ${HH.icon(item.type === 'photo' ? 'image' : item.type === 'video' ? 'video' : 'film')}
       </div>`;
    const dur = item.type !== 'photo' && item.duration ? `<span class="dur">${item.duration}</span>` : '';
    const lock = locked ? `<div class="lock"><div>${HH.icon('lock')}${opts.lockIcon ? '' : `<div class="small" style="font-weight:800">${HH.money(item.priceUsd)}</div>`}</div></div>` : '';
    const tag = item.isPremium && !locked && !opts.noTag ? `<span class="badge tag">${HH.icon('sparkles')} Premium</span>` : (!item.isPremium && opts.freeTag ? `<span class="badge ok tag">Gratis</span>` : '');
    return `<div class="${cls}${opts.noWm ? '' : ' wm'}${locked ? ' is-locked' : ''}" style="${opts.style || ''}">${inner}${dur}${tag}${lock}${locked && opts.premiumTag ? `<span class="badge tag">${HH.icon('sparkles')} Premium</span>` : ''}${opts.children || ''}</div>`;
  };
  HH.levelBadge = (level, short) => level ? `<span class="badge level-${level}">${short ? HH.planName(level) : 'Plan ' + HH.planName(level)}</span>` : '<span class="badge neutral">Sin plan</span>';
  HH.starBadge = () => `<span class="badge gold">${HH.icon('star')} Star</span>`;
  HH.verifiedBadge = () => `<span class="badge info">${HH.icon('verified')} Verificada</span>`;
  HH.activityChips = (ids, cls = '') => (ids || []).map(id => { const a = HH.activity(id); return `<span class="chip ${cls}" style="cursor:default">${HH.icon(a.icon)} ${a.label}</span>`; }).join('');
  // opts.private: documentos/selfies de verificación → nunca a Cloudinary público
  HH.readFile = function (file, cb, opts = {}) {
    if (!file) return;
    if (!opts.private && HH.cloudinaryOn() && file.type.startsWith('image/')) { HH.uploadMedia(file, { kind: 'image' }).then(r => cb(r.url, file)); return; }
    if (file.size > 2.5 * 1024 * 1024 && file.type.startsWith('image/')) { HH.compressImage(file, cb); return; }
    const r = new FileReader(); r.onload = () => cb(r.result, file); r.readAsDataURL(file);
  };
  HH.compressImage = function (file, cb) {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => { const max = 1200; const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); cb(c.toDataURL('image/jpeg', 0.85), file); };
    img.src = url;
  };

  /* ---------- Router ---------- */
  const routes = [];
  HH.route = function (pattern, handler, opts = {}) { routes.push({ pattern, handler, opts, parts: pattern.split('.') }); };
  // Modo de direcciones: "path" cuando lo sirve el servidor (/argentina/…), "hash" en la demo de un solo archivo (#/argentina/…). Ver urls.js
  HH.ROUTING = document.documentElement.getAttribute('data-routing') === 'path' ? 'path' : 'hash';
  HH.currentHash = () => HH.keyFromLocation ? HH.keyFromLocation() : ((location.hash || '#inicio').replace(/^#/, '') || 'inicio');
  HH.current = { path: 'inicio', params: {} };
  HH.go = function (target, opts = {}) {
    const key = HH.keyOf ? HH.keyOf(target) : String(target || '#inicio').replace(/^#/, '');
    // una dirección con idioma (/en/…) lo conserva; una clave usa el idioma actual
    const lang = HH.parseUrl && /^#?\//.test(String(target || '')) ? HH.parseUrl(String(target).replace(/^#/, '')).lang : undefined;
    const url = HH.urlOf ? HH.urlOf(key, lang) : key;
    if (HH.ROUTING === 'path') {
      if (location.pathname !== url) history[opts.replace ? 'replaceState' : 'pushState'](null, '', url);
      HH.render(); return;
    }
    const h = '#' + url;
    if (location.hash === h) { HH.render(); return; }
    try { if (opts.replace) { history.replaceState(null, '', h); HH.render(); } else location.hash = h; } catch (e) { HH.render(key); }
  };
  function match(path) {
    const segs = path.split('.');
    for (const r of routes) {
      if (r.parts.length !== segs.length && !(r.opts.optional && segs.length === r.parts.length - 1)) continue;
      const params = {}; let ok = true;
      for (let i = 0; i < r.parts.length; i++) {
        const p = r.parts[i], s = segs[i];
        if (p.startsWith(':')) { if (s === undefined && !r.opts.optional) { ok = false; break; } params[p.slice(1)] = s === undefined ? null : decodeURIComponent(s); }
        else if (p !== s) { ok = false; break; }
      }
      if (ok) return { r, params };
    }
    return null;
  }
  HH.render = function (forcePath) {
    if (!forcePath && HH.syncLangFromUrl) HH.syncLangFromUrl();
    const path = forcePath || HH.currentHash();
    if (HH.db) HH.applyTrips();
    const m = match(path) || match('inicio');
    if (!m) { document.getElementById('app').innerHTML = '<div class="container section"><div class="empty">' + HH.icon('alert') + '<h4>No encontramos esa sección</h4></div></div>'; return; }
    HH.current = { path, params: m.params, name: m.r.pattern };
    const app = document.getElementById('app');
    let out;
    try { out = m.r.handler(m.params); } catch (e) { console.error(e); out = `<div class="container section"><div class="empty">${HH.icon('alert')}<h4>Algo falló al mostrar esta sección</h4><p class="small">${HH.esc(e.message)}</p><button class="btn secondary sm" data-go="#inicio">Volver al inicio</button></div></div>`; }
    if (out === false) return; // handler redirigió
    app.innerHTML = '';
    if (typeof out === 'string') app.innerHTML = out; else if (out) app.appendChild(out);
    if (HH.linkify) HH.linkify(app);
    app.classList.remove('fade-in'); void app.offsetWidth; app.classList.add('fade-in');
    if (!forcePath && !HH.SSR) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    HH.renderShell();
    document.dispatchEvent(new CustomEvent('hh:rendered', { detail: HH.current }));
    if (m.r.opts.after) m.r.opts.after(m.params);
    if (HH.afterRender) { const f = HH.afterRender; HH.afterRender = null; try { f(); } catch (e) { console.error(e); } }
    if (HH.startCountdowns) HH.startCountdowns();
  };
  HH.refresh = () => HH.render(HH.currentHash());

  /* ---------- Shell: header + bottom nav ---------- */
  HH.renderShell = function () {
    const me = HH.me(); const role = me ? me.role : null; const path = HH.currentHash(); const top = path.split('.')[0];
    const nav = [
      { h: '#inicio', l: 'Inicio', i: 'home' }, { h: '#swipe', l: 'Swipe', i: 'heart' }, { h: '#cerca', l: 'Cerca', i: 'pin' }, { h: '#shorts', l: 'Shorts', i: 'film' },
    ];
    const active = (h) => (('#' + top) === h ? ' class="active"' : '');
    // Paleta por género: celeste en la versión "Hombre" (solo en páginas públicas)
    const privateArea = ['panel', 'admin', 'cuenta', 'chat'].includes(top.replace('#', ''));
    // Paleta celeste: si eligió solo Hombres o si está en una página de hombres (/…/hombres)
    const menPage = /\.hombres$/.test(String((HH.current && HH.current.path) || HH.keyFromLocation && HH.keyFromLocation() || ''));
    document.documentElement.setAttribute('data-gender', !privateArea && (HH.genderFilter() === 'hombre' || menPage) ? 'hombre' : '');
    const headerInner = document.getElementById('headerInner');
    headerInner.innerHTML = `
      <a class="brand" href="#inicio" data-go="#inicio" aria-label="SexyRose, inicio"><span class="mark">${HH.icon('heart')}</span><span>SexyRose</span></a>
      <nav class="topnav" aria-label="Principal">${nav.map(n => `<a href="${n.h}" data-go="${n.h}"${active(n.h)}>${n.l}</a>`).join('')}<a href="#stars" data-go="#stars"${active('#stars')}>Stars</a>${role === 'worker' ? `<a href="#panel" data-go="#panel"${active('#panel')}>Mi panel</a>` : ''}${role === 'admin' ? `<a href="#admin" data-go="#admin"${active('#admin')}>Admin</a>` : ''}${role === 'client' ? `<a href="#cuenta" data-go="#cuenta"${active('#cuenta')}>Mi cuenta</a>` : ''}</nav>
      ${['panel', 'admin', 'cuenta', 'chat'].includes(top.replace('#', '')) ? '<span class="hdr-spacer"></span>' : `<div class="hdr-genders" role="group" aria-label="Tipo de acompañante">${HH.GENDERS.map(g => `<button type="button" class="hdr-g${HH.genderSet().includes(g.id) ? ' on' : ''}" data-action="setGender" data-g="${g.id}" aria-pressed="${HH.genderSet().includes(g.id)}" aria-label="${g.plural}" title="${g.plural}">${HH.icon(g.icon)}</button>`).join('')}</div>`}
      <div class="header-actions">
        ${HH.langSelect ? HH.langSelect('hide-mobile') : ''}
        ${me ? `<button class="icon-btn" data-action="openUserMenu" aria-label="Mi cuenta" style="padding:0;overflow:hidden;border-radius:50%">${HH.userAvatar(me, 38)}</button>`
             : `<a class="btn secondary sm hide-mobile" href="#login" data-go="#login">Iniciar sesión</a><a class="btn sm hdr-reg" href="#registro" data-go="#registro"><span class="hide-mobile">${HH.icon('user')}</span>Registrate</a>`}
      </div>`;
    const bn = document.getElementById('bottomNav');
    const last = me ? (role === 'worker' ? { h: '#panel', l: 'Mi panel', i: 'dashboard' } : role === 'admin' ? { h: '#admin', l: 'Admin', i: 'shield' } : { h: '#cuenta', l: 'Mi cuenta', i: 'user' }) : { h: '#login', l: 'Iniciar sesión', i: 'user' };
    bn.innerHTML = [...nav, last].map(n => `<a href="${n.h}" data-go="${n.h}"${active(n.h)}>${HH.icon(n.i)}<span>${n.l}</span></a>`).join('');
    if (HH.linkify) { HH.linkify(headerInner); HH.linkify(bn); }
  };
  HH.setTheme = function () { HH.ui.theme = 'dark'; document.documentElement.setAttribute('data-theme', 'dark'); };

  /* ---------- Modal / toast ---------- */
  HH.modal = function ({ title, body, actions = [], wide }) {
    const root = document.getElementById('modalRoot'); const box = document.getElementById('modalBox');
    box.style.maxWidth = wide ? '760px' : '';
    box.innerHTML = `<div class="modal-head"><h3>${HH.esc(title || '')}</h3><button class="icon-btn sm" data-action="closeModal" aria-label="Cerrar">${HH.icon('x')}</button></div><div class="modal-body stack">${typeof body === 'string' ? body : ''}</div>${actions.length ? `<div class="modal-actions">${actions.map((a, i) => `<button class="btn ${a.cls || ''}" ${a.id ? `id="${a.id}"` : ''} data-modal-action="${i}" ${a.action ? `data-action="${a.action}"` : ''}>${a.label}</button>`).join('')}</div>` : ''}`;
    if (body && typeof body !== 'string') box.querySelector('.modal-body').appendChild(body);
    box._actions = actions;
    root.classList.add('open'); root.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden';
    box.scrollTop = 0;
    const first = box.querySelector('.modal-body input:not([type=hidden]):not([type=file]), .modal-body textarea, .modal-body select') || box.querySelector('.modal-head .icon-btn'); if (first && window.innerWidth > 640) setTimeout(() => first.focus({ preventScroll: true }), 50);
  };
  HH.closeModal = function () { const root = document.getElementById('modalRoot'); root.classList.remove('open'); root.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; };
  HH.confirm = function ({ title, text, okLabel = 'Confirmar', cls = '', onOk }) {
    HH.modal({ title, body: `<p>${text}</p>`, actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: okLabel, cls, onClick: () => { HH.closeModal(); onOk && onOk(); } }] });
  };
  HH.toast = function (msg, { type = '', ms = 2800 } = {}) {
    const root = document.getElementById('toastRoot'); const t = document.createElement('div'); t.className = 'toast ' + type;
    t.innerHTML = HH.icon(type === 'ok' ? 'checkCircle' : type === 'warn' ? 'alert' : type === 'danger' ? 'xCircle' : 'info') + '<span>' + HH.esc(msg) + '</span>';
    root.appendChild(t); setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, ms);
  };

  /* ---------- Delegación de eventos ---------- */
  HH.actions = {
    closeModal: () => HH.closeModal(),
    openStories: (el) => HH.openStories(el.dataset.id, 0, HH.storyQueueFor(el)),
    verifyContact: (el) => HH.verifyContact(el.dataset.kind),
    clientSignup: () => HH.clientAuth({ onDone: () => HH.go('#cuenta') }),
    clientLogin: () => HH.clientAuth({ mode: 'login', onDone: () => HH.go('#cuenta') }),
    // Cada ícono suma o saca ese tipo; siempre queda al menos uno
    setGender: (el) => { const g = el.dataset.g; const s = HH.genderSet(); const next = s.includes(g) ? s.filter(x => x !== g) : s.concat([g]); if (!HH.setGenders(next)) { HH.toast('Elegí al menos un tipo de perfil', { type: 'warn' }); return; } HH.refresh(); },
    locateMe: (el) => {
      if (el) { el.disabled = true; el.innerHTML = HH.icon('clock') + ' Buscando…'; }
      HH.locate().then(r => {
        if (r.ok) HH.toast(r.city ? 'Te ubicamos cerca de ' + r.city : 'Ubicación lista. No hay perfiles en tu ciudad todavía: te mostramos los más cercanos.', { type: 'ok' });
        else HH.toast(r.reason === 'denied' ? 'Permiso de ubicación denegado. Podés elegir la ciudad a mano.' : 'No pudimos obtener tu ubicación.', { type: 'warn' });
        HH.refresh();
      });
    },
    forgetLocation: () => { HH.forgetLocation(); HH.toast('Dejamos de usar tu ubicación'); HH.refresh(); },
    toggleTheme: () => HH.setTheme(),
    logout: () => { HH.closeModal(); HH.logout(); },
    msgSearch(el) { const q = el.value.trim().toLowerCase(); document.querySelectorAll('.threads-wrap .thread').forEach(t => { t.hidden = !!q && !t.textContent.toLowerCase().includes(q); }); },
    resetDemo: () => { HH.closeModal(); HH.resetDemo(); },
    openUserMenu: () => {
      const me = HH.me(); if (!me) return;
      const p = HH.profileOf(me.id);
      HH.modal({ title: me.name, body: `
        <div class="row" style="gap:12px">${HH.userAvatar(me, 48)}<div><div style="font-weight:700">${HH.esc(me.email)}</div><div class="small muted">${me.role === 'worker' ? 'Acompañante' : me.role === 'admin' ? 'Administración' : 'Cliente'}</div></div></div>
        ${HH.langSelect ? `<div class="row between" style="gap:8px"><span class="small" style="font-weight:700">Idioma</span>${HH.langSelect()}</div>` : ''}
        <div class="list">
          ${me.role === 'worker' ? `<button class="list-item" data-go="#panel" data-action="closeModal" style="cursor:pointer;text-align:left;width:100%">${HH.icon('dashboard')}<span class="grow title">Mi panel</span>${HH.icon('chevronRight')}</button><button class="list-item" data-go="#perfil.${p ? p.slug : ''}" data-action="closeModal" style="cursor:pointer;text-align:left;width:100%">${HH.icon('eye')}<span class="grow title">Ver mi perfil público</span>${HH.icon('chevronRight')}</button>` : ''}
          ${me.role === 'client' ? `<button class="list-item" data-go="#cuenta" data-action="closeModal" style="cursor:pointer;text-align:left;width:100%">${HH.icon('user')}<span class="grow title">Mi cuenta</span>${HH.icon('chevronRight')}</button>` : ''}
          ${me.role === 'admin' ? `<button class="list-item" data-go="#admin" data-action="closeModal" style="cursor:pointer;text-align:left;width:100%">${HH.icon('shield')}<span class="grow title">Panel admin</span>${HH.icon('chevronRight')}</button>` : ''}
          <button class="list-item" data-action="resetDemo" style="cursor:pointer;text-align:left;width:100%">${HH.icon('refresh')}<span class="grow title">Reiniciar datos de demo</span></button>
          <button class="list-item" data-action="logout" style="cursor:pointer;text-align:left;width:100%;color:var(--danger)">${HH.icon('logout')}<span class="grow title">Cerrar sesión</span></button>
        </div>` });
    },
  };
  document.addEventListener('click', (ev) => {
    const go = ev.target.closest('[data-go]');
    if (go && go.tagName === 'A' && (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button === 1) && !go.getAttribute('data-action')) return;
    if (go) { ev.preventDefault(); const act = go.getAttribute('data-action'); if (act === 'openStories') { if (HH.storiesOf(go.dataset.id).length) { HH.openStories(go.dataset.id, 0, HH.storyQueueFor(go)); return; } } else if (act && HH.actions[act]) HH.actions[act](go, ev); HH.go(go.getAttribute('data-go')); return; }
    const ma = ev.target.closest('[data-modal-action]');
    if (ma) { const box = document.getElementById('modalBox'); const a = box._actions && box._actions[Number(ma.getAttribute('data-modal-action'))]; if (a && a.onClick) { a.onClick(ma, ev); return; } }
    const el = ev.target.closest('[data-action]');
    if (el) { const name = el.getAttribute('data-action'); const fn = HH.actions[name]; if (fn) { ev.preventDefault(); fn(el, ev); } else console.warn('Acción sin handler:', name); }
  });
  document.addEventListener('submit', (ev) => {
    const f = ev.target.closest('form[data-submit]'); if (!f) return; ev.preventDefault();
    const fn = HH.actions[f.getAttribute('data-submit')]; if (fn) fn(f, ev, Object.fromEntries(new FormData(f).entries())); else console.warn('Submit sin handler:', f.getAttribute('data-submit'));
  });
  document.addEventListener('change', (ev) => { const el = ev.target.closest('[data-change]'); if (!el) return; const fn = HH.actions[el.getAttribute('data-change')]; if (fn) fn(el, ev); });
  document.addEventListener('input', (ev) => { const el = ev.target.closest('[data-input]'); if (!el) return; const fn = HH.actions[el.getAttribute('data-input')]; if (fn) fn(el, ev); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && document.getElementById('modalRoot').classList.contains('open')) HH.closeModal(); });
  window.addEventListener('hashchange', () => HH.render());

  /* ---------- Boot ---------- */
  HH.boot = function () {
    if (HH._booted) return; HH._booted = true;
    if (!HH.load()) { HH.db = HH.seed(); HH.save(); }
    if (HH.db.version !== HH.SEED_VERSION) { HH.db = HH.seed(); HH.session = null; HH.save(); }
    HH.setTheme();
    HH.renderShell();
    HH.render();
    HH.autoLocate();
  };
  return HH;
})();
