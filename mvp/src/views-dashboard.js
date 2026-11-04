/* ============================================================
   SexyRose MVP — views-dashboard.js
   Panel de la acompañante: #panel(.tab) y #panel.mensajes.:otherId
   Acciones con prefijo `dash`.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- CSS puntual del panel (se inyecta una sola vez) ---------- */
  const CSS = `
  [hidden]{display:none!important}
  svg.ico{width:18px;height:18px}
  .dash-wrap{padding-block:10px 32px}
  @media (min-width:900px){.dash-wrap{padding-block:28px 48px}}
  .dash{grid-template-columns:minmax(0,1fr)}
  .dash-tabs{min-width:0}
  .dash-tabs .chips.scroll{min-width:0}
  .dash-side .who .nm{font-weight:800;font-size:15px;line-height:1.2}
  .dash-side .who .pub{display:inline-flex;align-items:center;gap:4px;margin-top:6px;font-weight:700}
  .dash-side .who .pub svg{width:14px;height:14px}
  .chip .count{background:var(--bg-2);color:var(--fg-2);font-size:11px;line-height:18px;min-width:18px;padding:0 6px;border-radius:999px;text-align:center;font-weight:800}
  .chip.active .count{background:rgba(255,255,255,.92);color:var(--berry)}
  .dash-tabs .chip{flex:none}
  .il{display:inline-flex;align-items:center;gap:6px}
  .il svg{width:15px;height:15px;flex:none}
  .ic{width:36px;height:36px;border-radius:12px;background:var(--berry-tint);color:var(--berry);display:grid;place-items:center;flex:none}
  .ic svg{width:18px;height:18px}
  .ic.ok{background:var(--ok-tint);color:var(--ok)}
  .ic.warn{background:var(--warn-tint);color:var(--warn)}
  .ic.info{background:var(--info-tint);color:var(--info)}
  a.list-item{color:inherit}
  a.list-item > svg{width:18px;height:18px;color:var(--muted);flex:none}
  .span-m2{grid-column:1/-1}
  @media (min-width:720px){.span-m2{grid-column:auto}}
  .dash-cols{display:grid;gap:18px}
  @media (min-width:1000px){.dash-cols{grid-template-columns:minmax(0,1fr) 320px;align-items:start}.dash-cols>.aside{position:sticky;top:calc(var(--header-h) + 20px)}}
  .lk-row{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr);gap:8px}.lk-url{font-size:12px;padding:4px 8px;border-radius:8px;background:var(--surface-2);word-break:break-all}
  /* Estadísticas */
  .grid-4{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}@media(min-width:1000px){.grid-4{grid-template-columns:repeat(4,minmax(0,1fr))}}
  .st-k{display:grid;gap:4px}.st-k .v{font-size:26px}.st-d{font-weight:800}.st-d.up{color:var(--ok)}.st-d.down{color:var(--danger)}
  .st-chart{width:100%;height:auto;display:block}.st-bar{fill:var(--berry);opacity:.75}.st-line{fill:none;stroke:var(--ok);stroke-width:2}.st-t{fill:var(--muted);font-size:11px}
  .st-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin:0 3px 0 8px;vertical-align:-1px}.st-leg i.b{background:var(--berry)}.st-leg i.l{background:var(--ok);height:3px;vertical-align:2px}
  .st-f{display:grid;gap:5px}
  .st-wd{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;align-items:end;height:92px}.st-wdc{display:grid;justify-items:center;gap:4px;align-self:end}.st-wdc i{display:block;width:70%;background:var(--berry);border-radius:6px 6px 2px 2px;opacity:.8}
  /* Agenda semanal */
  .ag-scroll{overflow-x:auto;margin:0 -4px;padding:0 4px 4px}
  .ag-grid{display:grid;grid-template-columns:44px repeat(7,minmax(92px,1fr));gap:4px;min-width:700px}
  .ag-dh{height:38px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:12px;color:var(--muted);text-transform:capitalize;line-height:1.1}
  .ag-dh strong{font-size:16px;color:var(--fg)}
  .ag-day.today .ag-dh strong{color:var(--berry)}
  .ag-hours span{display:block;height:34px;font-size:11px;color:var(--muted);transform:translateY(-6px);text-align:right;padding-right:6px}
  .ag-col{position:relative;border-radius:10px;overflow:hidden;cursor:copy;background:repeating-linear-gradient(135deg,var(--surface-2) 0 6px,transparent 6px 12px);border:1px solid var(--line)}
  .ag-col > i{display:block;height:34px;border-top:1px dashed color-mix(in srgb,var(--line) 70%,transparent)}
  .ag-col > i:first-child{border-top:0}
  .ag-free{position:absolute;left:0;right:0;background:var(--surface);border-block:1px solid var(--line-2);pointer-events:none}
  .ag-ev{position:absolute;left:3px;right:3px;border-radius:8px;padding:3px 6px;font-size:11px;line-height:1.2;text-align:left;overflow:hidden;display:flex;flex-direction:column;gap:1px;cursor:pointer;border:0;color:var(--fg);min-height:18px}
  .ag-ev span{color:var(--fg-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ag-ev.conf{background:var(--ok-tint);box-shadow:inset 3px 0 0 var(--ok)}
  .ag-ev.req{background:var(--warn-tint);box-shadow:inset 3px 0 0 var(--warn)}
  .ag-ev.busy{background:var(--berry-tint);box-shadow:inset 3px 0 0 var(--berry)}
  .ag-ev.blocked{background:#2b2b31;box-shadow:inset 3px 0 0 var(--muted)}
  .ag-legend{display:flex;flex-wrap:wrap;gap:6px 14px;color:var(--fg-2)}
  .ag-legend i{display:inline-block;width:12px;height:12px;border-radius:4px;margin-right:5px;vertical-align:-2px;border:1px solid var(--line)}
  .lg-free{background:var(--surface)}.lg-off{background:repeating-linear-gradient(135deg,var(--surface-2) 0 3px,transparent 3px 6px)}.lg-req{background:var(--warn)}.lg-conf{background:var(--ok)}.lg-busy{background:var(--berry)}.lg-blocked{background:var(--muted)}
  .ag-optin-ic{width:46px;height:46px;border-radius:14px;background:var(--berry-tint);color:var(--berry);display:grid;place-items:center;flex:none}
  .ag-optin-ic svg{width:24px;height:24px}
  .ag-optin-list{list-style:none;margin:0;padding:0;display:grid;gap:8px}
  .ag-optin-list li{display:flex;gap:8px;align-items:flex-start}.ag-optin-list li span{min-width:0;flex:1}.ag-optin-list svg{width:16px;height:16px;color:var(--ok);flex:none;margin-top:2px}
  .ag-kind input{accent-color:var(--berry)}
  .bk-row.flash{outline:2px solid var(--berry);outline-offset:2px;transition:outline .3s}
  .pf-en{border:1px solid var(--line);border-radius:var(--radius-sm);padding:10px 12px}.pf-en summary{cursor:pointer;font-weight:700;display:flex;gap:8px;align-items:center}.pf-en summary svg{width:16px;height:16px;color:var(--berry)}.pf-en[open] summary{margin-bottom:4px}
  .bk-week{display:grid;gap:8px}.bk-wk{display:grid;grid-template-columns:minmax(84px,1fr) 80px auto 80px;gap:6px;align-items:center}.bk-wk .select{padding:6px 8px;min-height:36px}
  .photo-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
  @media (min-width:720px){.photo-grid{grid-template-columns:repeat(4,1fr)}}
  .dash-action-req{display:grid;gap:14px;padding:18px;border-radius:22px;background:linear-gradient(135deg,var(--berry-tint),var(--surface));border:1px solid var(--line-2)}
  .dash-action-req>.row>svg.ico{width:24px;height:24px;color:var(--berry);flex:none;align-self:flex-start;margin-top:2px}
  .dash-req-list{display:grid;gap:4px}
  .dash-req{display:flex;align-items:center;gap:12px;padding:10px 6px;border:0;border-radius:12px;background:transparent;color:var(--fg);text-align:left;width:100%;font:inherit}
  button.dash-req{cursor:pointer}button.dash-req:hover{background:rgba(255,255,255,.04)}
  .dash-req .box{width:24px;height:24px;border-radius:50%;border:2px solid var(--fg-2);display:grid;place-items:center;flex:none}
  .dash-req.done .box{border-color:var(--ok);background:var(--ok);color:#fff}.dash-req .box svg{width:14px;height:14px}
  .dash-req .grow{display:grid;gap:1px;min-width:0}.dash-req .t{font-weight:700}.dash-req.done .t{color:var(--muted)}.dash-req .h{font-size:12px;color:var(--muted)}
  .dash-req>svg{width:18px;height:18px;color:var(--muted);flex:none}
  .vf h3{font-size:22px}.vf-hero{width:56px;height:56px;border-radius:18px;display:grid;place-items:center;background:var(--berry-tint);color:var(--berry)}.vf-hero svg.ico{width:28px;height:28px}
  .vf-bar{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.vf-bar span{display:grid;gap:5px;font-size:11px;font-weight:700;color:var(--muted)}.vf-bar i{display:block;height:4px;border-radius:4px;background:var(--line-2)}.vf-bar .done i,.vf-bar .cur i{background:var(--berry)}.vf-bar .cur{color:var(--berry)}
  .vf-zone img,.vf-zone video{display:block;max-width:100%}.vf-thumb{display:grid;gap:4px;justify-items:center}.vf-thumb img,.vf-thumb video,.vf-thumb .vf-vid{width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px;background:var(--surface-2);display:grid;place-items:center}
  .photo-grid.gal{grid-template-columns:repeat(3,minmax(0,1fr))}@media(min-width:720px){.photo-grid.gal{grid-template-columns:repeat(5,minmax(0,1fr))}}
  .add-tile{aspect-ratio:1;border:2px dashed var(--line-2);border-radius:var(--radius-sm);display:grid;place-content:center;justify-items:center;gap:4px;color:var(--muted);cursor:pointer;text-align:center}.add-tile:hover{border-color:var(--berry);color:var(--berry)}.add-tile svg.ico{width:24px;height:24px}
  .photo-slot{position:relative}
  .photo-slot .main{position:absolute;left:8px;top:8px;background:rgba(255,255,255,.92);color:var(--berry-deep)}
  .photo-slot .acts{position:absolute;left:8px;right:8px;bottom:8px;display:flex;gap:6px;justify-content:flex-end}
  .photo-slot .acts .icon-btn{background:rgba(255,255,255,.94);border-color:transparent;color:#3A1C2A}
  .photo-slot .acts .icon-btn.del{color:#D23B4A}
  .photo-slot .acts .btn{box-shadow:var(--shadow-sm)}
  .gal .photo-slot .acts{left:4px;right:4px;bottom:4px;gap:3px}.gal .photo-slot .acts .icon-btn{width:28px;height:28px;min-width:28px;padding:0}.gal .photo-slot .acts .icon-btn svg{width:14px;height:14px}.gal .photo-slot .main{left:4px;top:4px;font-size:10.5px;padding:2px 7px}
  .cgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
  @media (min-width:720px){.cgrid{grid-template-columns:repeat(3,1fr);gap:14px}}
  .ctile{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;display:grid}
  .ctile .media{border-radius:0}
  .ctile .cbody{padding:10px 10px 10px;display:grid;gap:3px}
  .ctile .ctitle{font-weight:800;font-size:14px}
  .ctile .cfoot{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:4px}
  .ctile .cfoot .icon-btn{width:30px;height:30px;border-radius:9px}
  .ctile .cfoot .icon-btn svg{width:15px;height:15px}
  .pack-thumbs{display:flex;flex:none}
  .pack-thumbs .media{width:40px;height:40px;aspect-ratio:1;border-radius:10px;border:2px solid var(--surface);flex:none}
  .pack-thumbs .media + .media{margin-left:-14px}
  .pack-thumbs .media .ph svg{width:16px;height:16px}
  .pack-thumbs .media .dur,.pack-thumbs .media .tag{display:none}
  .pack-acts{display:flex;gap:6px;flex:none}
  @media (max-width:719px){.pack-thumbs .media:nth-child(3){display:none}.pack-acts{flex-direction:column}}
  @media (min-width:1100px){.cgrid{grid-template-columns:repeat(4,1fr)}}
  @media (max-width:999px){#dashPreview{max-width:340px}}
  .type-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .type-grid .radio-card{flex-direction:column;align-items:center;text-align:center;padding:10px 6px;gap:6px;font-size:13px}
  .type-grid .radio-card svg{width:20px;height:20px;color:var(--berry)}
  .type-grid .radio-card .tiny{display:block;font-weight:500}
  .mode-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .mode-grid .radio-card{align-items:center;padding:12px;font-size:13px;font-weight:700}
  .mode-grid .radio-card svg{width:20px;height:20px;color:var(--berry);flex:none}
  .pick-list{display:grid;gap:8px;max-height:min(44vh,360px);overflow:auto;padding:2px}
  .pick{position:relative;display:flex;gap:10px;align-items:center;padding:8px 10px 8px 8px;border:1.5px solid var(--line);border-radius:12px;cursor:pointer;background:var(--surface)}
  .pick .media{width:48px;height:48px;aspect-ratio:1;border-radius:9px;flex:none}
  .pick .media .ph svg{width:18px;height:18px}
  .pick .media .dur{display:none}
  .pick > svg.ico{width:20px;height:20px;color:var(--line-2);flex:none}
  .pick.active{border-color:var(--berry);background:var(--berry-tint)}
  .pick.active > svg.ico{color:var(--berry)}
  .dropzone.has{border-style:solid;border-color:var(--berry);color:var(--fg)}
  .dropzone img{max-height:150px;width:auto;margin:0 auto;border-radius:10px}
  .chat{display:grid;gap:14px;align-items:start;grid-template-columns:minmax(0,1fr)}
  @media (min-width:900px){.chat{grid-template-columns:300px minmax(0,1fr)}}
  @media (max-width:899px){.chat.has-convo .threads-wrap{display:none}.chat:not(.has-convo) .convo-wrap{display:none}}
  .threads-wrap{display:grid;gap:4px;align-content:start;grid-template-columns:minmax(0,1fr);min-width:0}
  .convo-wrap{min-width:0}
  .thread{color:inherit;min-width:0}
  .dash-main .stack,.dash-main .list,.dash-main .checklist,.dash-main .msg-list,.dash-main .field{grid-template-columns:minmax(0,1fr)}
  @media (min-width:720px){.dash-main .checklist{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
  .thread .ubadge{background:var(--berry);color:#fff;flex:none}
  .convo{padding:14px}
  .convo .msgs{max-height:clamp(200px,calc(100vh - 440px),520px);min-height:160px;overflow:auto;padding:4px 2px;overscroll-behavior:contain}
  @media (min-width:900px){.convo .msgs{max-height:min(54vh,560px);min-height:240px}}
  .convo .composer{display:flex;gap:8px;align-items:flex-end}
  .convo .composer .textarea{min-height:46px;max-height:140px;resize:none}
  .star-card{border-color:var(--gold);background:linear-gradient(135deg,color-mix(in srgb,var(--gold) 14%,var(--surface)),var(--surface) 70%)}
  .plans .plan{grid-template-rows:auto auto auto 1fr auto}
  .plan-feats{margin:0;padding:0;list-style:none;display:grid;gap:6px;font-size:14px;color:var(--fg-2)}
  .plan-feats li{display:flex;gap:8px;align-items:flex-start}
  .plan-feats li svg{width:16px;height:16px;color:var(--ok);flex:none;margin-top:2px}
  .plan-feats li.no{color:var(--muted)}
  .plan-feats li.no svg{color:var(--line-2)}
  .tips{display:grid;gap:10px}
  .tip{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:start;padding:14px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius)}
  .tip h4{font-size:15px;margin-bottom:4px}
  .tip p{font-size:13px;color:var(--fg-2)}
  @media (min-width:720px){.tips{grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.tip{grid-template-columns:1fr;gap:10px;padding:16px}}
  .threads-wrap .thread{background:var(--surface);border-color:var(--line)}
  .threads-wrap .thread.active{border-color:var(--berry);background:var(--berry-tint)}
  .bars .bar i{transition:height .3s ease}
  .settings-grid>.card{margin-bottom:14px;break-inside:avoid}
  @media (min-width:900px){.settings-grid{columns:2;column-gap:14px}}
  .switch-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)}
  .switch-row:last-child{border-bottom:0;padding-bottom:0}
  .switch-row .t{font-weight:700;font-size:14px}
  .switch-row .s{font-size:12px;color:var(--muted)}
  .switch:disabled{opacity:.5;cursor:not-allowed}
  .verify-grid{display:grid;gap:10px}
  @media (min-width:720px){.verify-grid{grid-template-columns:1fr 1fr}}
  .verify-grid .dropzone{padding:16px 12px;font-size:13px}
  .bubble{overflow-wrap:anywhere}
  .req-desc{font-size:15px;line-height:1.5;overflow-wrap:anywhere}
  .sticky-save{position:sticky;bottom:calc(var(--bottomnav-h) + 10px);z-index:5;background:color-mix(in srgb,var(--surface) 92%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid var(--line);border-radius:var(--radius);padding:10px 14px}
  @media (min-width:900px){.sticky-save{bottom:12px}}
  `;
  let cssDone = false;
  function injectCss() {
    if (cssDone) return; cssDone = true;
    const s = document.createElement('style'); s.id = 'dashCss'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------- Estado local del módulo ---------- */
  const S = { contentFilter: 'all', reqFilter: 'all', upload: null, deliver: null, verify: {}, liveTimer: null };
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const TYPE_LABEL = { photo: 'Foto', video: 'Video', short: 'Short' };
  const TYPE_ICON = { photo: 'image', video: 'video', short: 'film' };
  const PAY_TYPE = { one_time: { label: 'Contenido suelto', icon: 'image' }, pack: { label: 'Packs', icon: 'pack' }, request: { label: 'Pedidos a medida', icon: 'gift' }, chat: { label: 'Chat en vivo', icon: 'chat' } };
  const STATE_SHORT = { pendiente: 'Por responder', solicitado: 'Solicitados', aceptado: 'Aceptados', pagado: 'Pagados', entregado: 'Entregados', rechazado: 'Rechazados' };
  const NOTIF = [
    { k: 'messages', t: 'Nuevos mensajes', s: 'Cuando un cliente te escribe' },
    { k: 'requests', t: 'Pedidos a medida', s: 'Pedidos nuevos y pagos confirmados' },
    { k: 'sales', t: 'Ventas', s: 'Cada vez que alguien compra tu contenido' },
    { k: 'renewal', t: 'Recordatorio de renovación', s: '3 días antes de que venza tu plan' },
  ];

  /* ---------- Helpers ---------- */
  const me = () => HH.me();
  const prof = () => HH.myProfile();
  const val = (id) => { const e = document.getElementById(id); return e ? e.value : ''; };
  const byId = (id) => document.getElementById(id);
  const blocked = (p) => (p && Array.isArray(p.blocked)) ? p.blocked : [];
  const mkey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const monthKey = (iso) => mkey(new Date(iso));
  const thisMonth = () => mkey(new Date());
  const prevMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return mkey(d); };
  const earnMonth = (w, k) => HH.sum(HH.earningsOf(w).filter(p => monthKey(p.createdAt) === k), p => HH.netOf(p));
  const pendingRequests = (w) => HH.requestsOf(w).filter(r => r.status === 'pendiente' || r.status === 'solicitado' || r.status === 'pagado');
  const myThreads = (w, p) => HH.threadsOf(w).filter(t => !blocked(p).includes(t.otherId));
  const unread = (w, p) => HH.sum(myThreads(w, p), t => t.unread);
  const salesCount = (w) => HH.db.purchases.filter(p => p.workerId === w).length;
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const n = (x) => Number(x || 0).toLocaleString(HH.loc());
  const stat = (k, v, d, cls = '') => `<div class="stat ${cls}"><span class="k">${k}</span><span class="v">${v}</span>${d ? `<span class="d">${d}</span>` : ''}</div>`;
  const planFeatures = (lv) => {
    const L = HH.LEVELS[lv];
    return [
      { ok: true, t: lv === 'S' ? 'Lugar fijo arriba del inicio · 10 por estado/provincia' : 'Sección ' + L.label + ' en el inicio (' + (7 - L.rank) + '.ª)'  },
      { ok: true, t: `Galería: ${L.photos} fotos y ${L.videos} videos` },
      { ok: true, t: L.stories_per_day === null ? 'Historias ilimitadas' : L.stories_per_day + ' ' + HH.plural(L.stories_per_day, 'historia', 'historias') + ' por día' },
      { ok: L.shorts, t: 'Shorts' },
      { ok: L.premium_content, t: 'Venta de fotos y videos individuales' },
      { ok: L.packs, t: 'Packs y pedidos a medida' },
      { ok: L.bookings, t: 'Agenda de reservas' },
      { ok: L.chat, t: 'Chat en vivo por sesiones' },
      { ok: L.trips, t: 'Viajes' },
      { ok: L.stats, t: 'Estadísticas detalladas (próximamente)' },
    ];
  };

  /* ---------- Layout común ---------- */
  const TABS = [
    { id: 'resumen', label: 'Resumen', icon: 'dashboard' },
    { id: 'actividad', label: 'Actividad', icon: 'bell', count: (u) => HH.activityUnread(u) },
    { id: 'estadisticas', label: 'Estadísticas', icon: 'trending' },
    { id: 'perfil', label: 'Mi perfil', icon: 'user' },
    { id: 'contenido', label: 'Contenido', icon: 'image' },
    { id: 'pedidos', label: 'Pedidos', icon: 'inbox', count: (u) => pendingRequests(u.id).length },
    { id: 'mensajes', label: 'Mensajes', icon: 'chat', count: (u, p) => unread(u.id, p) + HH.pendingChats(u.id).length },
    { id: 'agenda', label: 'Agenda', icon: 'calendar', count: (u) => HH.pendingBookings(u.id).length },
    { id: 'viajes', label: 'Viajes', icon: 'globe' },
    { id: 'suscripcion', label: 'Suscripción', icon: 'card' },
    { id: 'ingresos', label: 'Ingresos', icon: 'wallet' },
    { id: 'ajustes', label: 'Ajustes', icon: 'settings' },
  ];
  function layout(tab, main) {
    const u = me(), p = prof(); const level = HH.levelOf(u.id);
    const counts = TABS.map(t => t.count ? t.count(u, p) : 0);
    const nav = TABS.map((t, i) => `<a href="#panel.${t.id}" data-go="#panel.${t.id}" class="${t.id === tab ? 'active' : ''}">${HH.icon(t.icon)}<span>${t.label}</span>${counts[i] ? `<span class="count">${counts[i]}</span>` : ''}</a>`).join('');
    const chips = TABS.map((t, i) => `<button type="button" class="chip ${t.id === tab ? 'active' : ''}" data-go="#panel.${t.id}">${t.label}${counts[i] ? `<span class="count">${counts[i]}</span>` : ''}</button>`).join('');
    return `<div class="container dash-wrap"><div class="dash">
      <aside class="dash-side">
        <div class="who" id="dashWho">${HH.avatar(p, 44)}<div class="grow" style="min-width:0"><div class="nm ellipsis">${HH.esc(p.displayName)}</div><div class="row" style="gap:4px;margin-top:4px">${HH.levelBadge(level, true)}${HH.isStar(u.id) ? HH.starBadge() : ''}</div><a class="small pub" href="#perfil.${p.slug}" data-go="#perfil.${p.slug}">${HH.icon('eye')} Ver perfil público</a></div></div>
        <nav class="dash-nav" aria-label="Secciones del panel">${nav}</nav>
      </aside>
      <div class="dash-tabs"><div class="chips scroll" id="dashChips">${chips}</div></div>
      <div class="dash-main" id="dashMain">${HH.chatRequestsBanner(u.id)}${main}</div>
    </div></div>`;
  }
  function pageHead(eyebrow, title, sub, right) {
    return `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h2>${title}</h2>${sub ? `<p class="muted small" style="margin-top:4px;max-width:60ch">${sub}</p>` : ''}</div>${right || ''}</div>`;
  }
  function after(tab, otherId) {
    const strip = byId('dashChips'); const chip = strip && strip.querySelector('.chip.active');
    if (strip && chip) strip.scrollLeft = Math.max(0, chip.offsetLeft - (strip.clientWidth - chip.offsetWidth) / 2);
    if (tab === 'mensajes' && otherId) {
      const box = byId('dashMsgs'); if (box) box.scrollTop = box.scrollHeight;
      const card = document.querySelector('.convo-wrap .convo');
      if (card && window.innerWidth < 900) { const top = card.getBoundingClientRect().top + window.scrollY - 118; if (top > 0) window.scrollTo({ top, behavior: 'instant' in window ? 'instant' : 'auto' }); }
      const ta = byId('dashMsgInput');
      if (ta) {
        ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (ta.form && ta.form.requestSubmit) ta.form.requestSubmit(); } });
        if (!ta.disabled && window.innerWidth >= 900) ta.focus();
      }
    }
  }

  /* ---------- 1. Resumen ---------- */
  function vResumen() {
    const u = me(), p = prof(), w = u.id;
    const comp = HH.profileCompleteness(p);
    const level = HH.levelOf(w), sub = HH.activeSubscription(w), q = HH.chatQuota(w);
    const incMonth = earnMonth(w, thisMonth()), incPrev = earnMonth(w, prevMonth());
    const reqs = HH.requestsOf(w);
    const toAnswer = reqs.filter(r => r.status === 'solicitado' || r.status === 'pendiente').length, toDeliver = reqs.filter(r => r.status === 'pagado').length;
    const unreadN = unread(w, p), sales = salesCount(w);
    const views = p.stats.views || 0, rs = p.stats.rightSwipes || 0;
    const hour = new Date().getHours(); const greet = hour < 13 ? 'Buen día' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
    const today = cap(new Date().toLocaleDateString(HH.loc(), { weekday: 'long', day: 'numeric', month: 'long' }));

    const req = HH.requirementsOf(p);
    const reqRow = (it) => {
      const right = it.done ? '' : it.pending ? `<span class="badge warn">En revisión</span>` : HH.icon('chevronRight');
      const attrs = it.done || it.pending ? '' : it.action ? `data-action="${it.action}" data-kind="${it.kind}"` : `data-go="${it.go}"`;
      return `<${it.done || it.pending ? 'div' : 'button type="button"'} class="dash-req${it.done ? ' done' : ''}" ${attrs}><span class="box">${it.done ? HH.icon('check') : ''}</span><span class="grow"><span class="t">${it.label}</span>${it.done ? '' : `<span class="h">${it.hint}</span>`}</span>${right}</${it.done || it.pending ? 'div' : 'button'}>`;
    };
    const required = req.ok ? '' : `
      <div class="dash-action-req">
        <div class="row nowrap" style="gap:10px">${HH.icon('alert')}<div><div class="card-title" style="font-size:18px">Acción requerida</div><div class="small">Tu cuenta está casi lista. Completá estos ${req.total} pasos para activar tu perfil: hasta entonces no aparecés en el sitio.</div></div><span class="badge" style="margin-left:auto;flex:none">${req.done} de ${req.total}</span></div>
        <div class="dash-req-list">${req.items.map(reqRow).join('')}</div>
      </div>`;
    const hiddenNote = p.hidden ? `<div class="notice warn">${HH.icon('eye')}<span><strong>Tu cuenta está oculta.</strong> Nadie te ve en el sitio. <a href="#panel.ajustes" data-go="#panel.ajustes">Mostrarla</a></span></div>` : '';
    const onboarding = hiddenNote + required + (comp.pct < 100 ? `
      <div class="card">
        <div class="row between nowrap" style="align-items:flex-start"><div style="min-width:0"><div class="card-title">${req.ok ? 'Completá tu perfil' : 'Para vender más'}</div><div class="small muted">Los perfiles completos reciben más swipes a la derecha y más compras.</div></div><span class="badge ${comp.pct >= 70 ? 'ok' : 'warn'}" style="flex:none">${comp.done} de ${comp.total}</span></div>
        <div class="progress" style="margin:12px 0" role="progressbar" aria-valuenow="${comp.pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Perfil ${comp.pct}% completo"><span style="width:${comp.pct}%"></span></div>
        <div class="checklist">${comp.items.map(it => `<div class="check ${it.done ? 'done' : ''}"><span class="box">${it.done ? HH.icon('check') : ''}</span><span class="txt">${it.label}</span>${it.done ? '' : it.pending ? `<span class="badge warn go">En revisión</span>` : `<a class="btn sm soft go" href="${it.go}" data-go="${it.go}">Hacerlo</a>`}</div>`).join('')}</div>
      </div>`
      : !req.ok ? ''
      : p.status === 'active'
        ? `<div class="notice ok">${HH.icon('checkCircle')}<span><strong>Tu perfil está completo y publicado.</strong> Ya aparecés en el swipe y en el listado.</span></div>`
        : `<div class="notice warn">${HH.icon('alert')}<span><strong>Tu perfil está completo pero pausado.</strong> Activalo desde <a href="#panel.ajustes" data-go="#panel.ajustes">Ajustes</a> para volver a aparecer.</span></div>`);

    const delta = incPrev ? Math.round((incMonth - incPrev) / incPrev * 100) : null;
    const stats = `<div class="grid-4">
      ${stat('Ingresos este mes', HH.money(incMonth), delta === null ? (incMonth ? 'Primer mes con cobros' : 'Todavía sin cobros este mes') : (delta >= 0 ? '+' : '') + delta + '% vs. el mes pasado', 'accent')}
      ${stat('Visitas al perfil', n(views), 'desde que publicaste')}
      ${stat('Swipes a la derecha', n(rs), views ? Math.round(rs / views * 100) + '% de las visitas' : 'Todavía sin swipes')}
      ${stat('Ventas', n(sales), 'contenido, packs, chat y pedidos')}
    </div>`;

    const L = level ? HH.LEVELS[level] : null;
    const planCard = sub ? `<div class="card stack" style="gap:12px;align-content:start">
        <div class="row between"><span class="card-title">Tu plan</span>${HH.levelBadge(level)}</div>
        <div><div style="font-size:24px;font-weight:800;line-height:1.1" class="num">${HH.money(L.price_usd)} <span class="small muted" style="font-weight:600">/ mes</span></div><div class="small muted" style="margin-top:2px">Se renueva el ${HH.fmtDate(sub.expiresAt)} · faltan ${HH.daysLeft(sub.expiresAt)} días</div></div>
        <div><div class="row between small"><span>Chat de hoy</span><strong class="num">${q.unlimited ? 'Sin límite' : q.limit === 0 ? 'No incluido' : q.used + ' de ' + q.limit}</strong></div>
        ${q.unlimited || q.limit === 0 ? '' : `<div class="progress ${q.blocked ? 'danger' : q.used / q.limit > .8 ? 'warn' : ''}" style="margin-top:6px"><span style="width:${Math.min(100, q.used / q.limit * 100)}%"></span></div>`}</div>
        <div><a class="btn secondary sm" href="#panel.suscripcion" data-go="#panel.suscripcion">Cambiar plan</a></div>
      </div>` : `<div class="card stack" style="gap:12px;align-content:start"><span class="card-title">Tu plan</span><div class="notice warn">${HH.icon('alert')}<span>Tu perfil no está publicado. Activá un plan para aparecer en el swipe y en el listado.</span></div><div><a class="btn sm" href="#panel.suscripcion" data-go="#panel.suscripcion">Activar un plan</a></div></div>`;

    const pend = [];
    if (toAnswer) pend.push({ icon: 'inbox', cls: 'info', title: `${toAnswer} ${HH.plural(toAnswer, 'pedido', 'pedidos')} por responder`, sub: 'Aceptá con un precio o rechazalo', go: '#panel.pedidos' });
    if (toDeliver) pend.push({ icon: 'gift', cls: 'warn', title: `${toDeliver} ${HH.plural(toDeliver, 'pedido pagado', 'pedidos pagados')} por entregar`, sub: 'El cliente ya pagó: subí o elegí el contenido', go: '#panel.pedidos' });
    if (unreadN) pend.push({ icon: 'chat', cls: '', title: `${unreadN} ${HH.plural(unreadN, 'mensaje sin leer', 'mensajes sin leer')}`, sub: 'Responder rápido vende más', go: '#panel.mensajes' });
    const pendCard = `<div class="card stack" style="gap:12px;align-content:start"><div class="row between"><span class="card-title">Pendientes</span>${pend.length ? `<span class="badge">${pend.length}</span>` : `<span class="badge ok">Al día</span>`}</div>
      ${pend.length ? `<div class="list">${pend.map(x => `<a class="list-item" href="${x.go}" data-go="${x.go}"><span class="ic ${x.cls}">${HH.icon(x.icon)}</span><span class="grow"><span class="title" style="display:block">${x.title}</span><span class="sub">${x.sub}</span></span>${HH.icon('chevronRight')}</a>`).join('')}</div>`
        : `<div class="empty" style="padding:18px 10px">${HH.icon('checkCircle')}<h4>No tenés nada pendiente</h4><p class="small">Cuando llegue un pedido o un mensaje, lo vas a ver acá.</p></div>`}</div>`;

    const tips = [
      { icon: 'film', t: 'Subí shorts gratis', d: 'Aparecen en el feed público y son lo que más visitas trae a tu perfil. Uno por semana alcanza.' },
      { icon: 'pack', t: 'Armá un pack', d: 'Agrupá 3 o 4 piezas premium a un precio redondo. Un pack se vende más fácil que una pieza suelta.' },
      { icon: 'clock', t: 'Respondé en menos de 1 h', d: 'Los clientes compran cuando sienten que hay alguien del otro lado. Activá las notificaciones.' },
    ];
    const tipsHtml = `<div><div class="row between" style="margin-bottom:10px"><span class="card-title">Tips para vender más</span></div><div class="tips">${tips.map(t => `<div class="tip"><span class="ic">${HH.icon(t.icon)}</span><div><h4>${t.t}</h4><p>${t.d}</p></div></div>`).join('')}</div></div>`;

    return pageHead('Resumen', `${greet}, ${HH.esc(p.displayName)}`, today, `<a class="btn secondary sm" href="#perfil.${p.slug}" data-go="#perfil.${p.slug}">${HH.icon('eye')} Ver perfil público</a>`)
      + onboarding + stats
      + `<div class="grid-2" style="align-items:start">${planCard}${pendCard}</div>`
      + tipsHtml
      + `<div class="notice">${HH.icon('shield')}<span><strong>Tu seguridad primero.</strong> Salidas siempre en lugares públicos. Si alguien te incomoda, bloquealo y reportalo desde Mensajes.</span></div>`;
  }

  /* ---------- 2. Mi perfil ---------- */
  function photoSlot(p, i) {
    return `<div class="photo-slot" id="dashSlot${i}">
      ${HH.photo(p, i, { cls: 'square' })}
      ${i === 0 ? `<span class="badge main">Principal</span>` : ''}
      <input type="file" accept="image/*" class="sr-only" id="dashPhoto${i}" data-change="dashPhotoPick" data-idx="${i}" aria-label="Cambiar foto ${i + 1}">
      <div class="acts">${i ? `<button type="button" class="icon-btn sm" data-action="dashPhotoMain" data-idx="${i}" title="Usar como principal" aria-label="Usar foto ${i + 1} como principal">${HH.icon('star')}</button>` : ''}<label class="icon-btn sm" for="dashPhoto${i}" title="Cambiar foto" aria-label="Cambiar foto ${i + 1}">${HH.icon('refresh')}</label><button type="button" class="icon-btn sm del" data-action="dashPhotoRemove" data-idx="${i}" title="Quitar foto" aria-label="Quitar foto ${i + 1}">${HH.icon('trash')}</button></div>
    </div>`;
  }
  function galleryHtml(p) {
    const photos = (p.photos || []).filter(Boolean); const vids = HH.profileVideos(p); const L = HH.galleryLimits(p.userId);
    return `<div class="card stack" style="gap:12px" id="dashGallery">
          <div class="row between"><div><div class="card-title">Fotos <span class="small muted num">${photos.length}/${L.photos}</span></div><div class="small muted">Públicas: las ve cualquiera. La principal es la del swipe. Mínimo 4 para publicar tu perfil.</div></div></div>
          <div class="photo-grid gal">${photos.map((_, i) => photoSlot(p, i)).join('')}${photos.length < L.photos ? `<label class="add-tile" for="dashPhotoAdd">${HH.icon('plus')}<span class="small">Agregar fotos</span><span class="tiny muted">quedan ${L.photos - photos.length}</span></label><input type="file" id="dashPhotoAdd" class="sr-only" accept="image/*" multiple data-change="dashPhotoAdd">` : ''}</div>
          <div class="divider"></div>
          <div><div class="card-title">Videos <span class="small muted num">${vids.length}/${L.videos}</span></div><div class="small muted">Públicos y cortos (hasta ${HH.PROFILE_VIDEO_MAX_S} segundos): una presentación, un paseo, tu lugar favorito.</div></div>
          <div class="photo-grid gal">${vids.map((v, i) => `<div class="photo-slot"><div class="media square">${HH.videoMedia(v)}</div><span class="badge main" style="background:rgba(0,0,0,.55);color:#fff">${v.seconds ? v.seconds + ' s' : 'Video'}</span><div class="acts"><button type="button" class="icon-btn sm del" data-action="dashVideoRemove" data-idx="${i}" aria-label="Quitar video ${i + 1}">${HH.icon('trash')}</button></div></div>`).join('')}${vids.length < L.videos ? `<label class="add-tile" for="dashVideoAdd">${HH.icon('video')}<span class="small">Agregar video</span><span class="tiny muted">quedan ${L.videos - vids.length}</span></label><input type="file" id="dashVideoAdd" class="sr-only" accept="video/*" data-change="dashVideoAdd">` : ''}</div>
          ${HH.cloudinaryOn() ? `<div class="tiny muted">${HH.icon('upload')} Los archivos se suben a Cloudinary.</div>` : ''}
        </div>`;
  }
  function refreshGallery() { const g = byId('dashGallery'); if (g) g.outerHTML = galleryHtml(prof()); }
  function langChips(langs) { return (langs || []).filter(Boolean).map(l => `<span class="badge neutral">${HH.esc(l)}</span>`).join(''); }
  const splitLangs = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 8);
  const chipIds = (f) => [...f.querySelectorAll('#dashActs .chip[aria-pressed="true"]')].map(c => c.dataset.id);
  function previewCard(p) {
    const acts = (p.activities || []).slice(0, 3);
    const where = [p.city, p.country].filter(Boolean).join(', ');
    return `<div class="pcard">${HH.photo(p, 0, {})}<div class="body">
      <div class="name">${HH.esc(p.displayName || 'Tu nombre')}${p.age ? `, ${Number(p.age)}` : ''} ${p.verified === 'verified' ? HH.icon('verified') : ''}</div>
      <div class="meta">${HH.icon('pin')} ${HH.esc(where || 'Tu ciudad')}</div>
      ${p.headline ? `<div class="small" style="color:var(--fg-2)">${HH.esc(p.headline)}</div>` : `<div class="small muted" style="font-style:italic">Tu titular aparece acá</div>`}
      ${acts.length ? `<div class="pill-row">${HH.activityChips(acts)}</div>` : ''}
      <div class="row between small" style="margin-top:2px"><span class="muted">${p.rateFrom ? 'Desde ' + HH.money(p.rateFrom) + ' / h' : 'Tarifa a convenir'}</span>${p.chatPriceUsd ? `<span class="badge">${HH.icon('chat')} Chat ${HH.money(p.chatPriceUsd)}</span>` : ''}</div>
    </div></div>`;
  }
  function liveProfile() {
    const p = prof(); const f = byId('dashProfileForm'); if (!f) return p;
    const v = Object.fromEntries(new FormData(f).entries());
    return Object.assign({}, p, {
      displayName: String(v.displayName || '').trim() || p.displayName,
      age: v.age ? Number(v.age) : null,
      city: String(v.city || '').trim(), country: String(v.country || '').trim(),
      headline: String(v.headline || '').trim(), bio: String(v.bio || '').trim(),
      headlineEn: String(v.headlineEn || '').trim(), bioEn: String(v.bioEn || '').trim(),
      activities: chipIds(f), languages: splitLangs(v.languages),
      nationality: String(v.nationality || '').trim().slice(0, 40),
      heightCm: v.heightCm ? Math.min(220, Math.max(130, Math.round(Number(v.heightCm)))) || null : null,
      build: HH.BUILDS[v.build] ? v.build : '',
      zone: String(v.zone || '').trim().slice(0, 40),
      interests: HH.pickedInterests && byId('dashInts') ? HH.pickedInterests() : (p.interests || []),
      rateFrom: String(v.rateFrom || '').trim() === '' ? null : Math.max(0, Number(v.rateFrom)),
      chatPrices: Object.fromEntries(HH.CHAT_MINUTES.map(m => [m, Math.max(1, Number(v['cp_' + m]) || HH.chatPrices(p)[m])])),
      chatPriceUsd: Math.max(1, Number(v.cp_10) || HH.chatPrices(p)[10]),
      whatsapp: String(v.whatsapp || '').trim(),
      telegram: String(v.telegram || '').trim().slice(0, 40),
      gender: v.gender || p.gender || 'mujer',
      requestAccessDays: Number(v.requestAccessDays) || 0,
      links: [0, 1, 2, 3].map(i => ({ label: String(v['lk_l' + i] || '').trim().slice(0, 40), url: (() => { let u = String(v['lk_u' + i] || '').trim(); if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u; return u.slice(0, 300); })() })),
      requestPrices: Object.fromEntries(Object.keys(HH.REQUEST_KINDS).map(k => [k, Math.max(1, Number(v['rp_' + k]) || HH.requestPrices(p)[k])])),
    });
  }
  function refreshPreview() { const el = byId('dashPreview'); if (el) el.innerHTML = previewCard(liveProfile()); }
  function refreshWho() { const who = byId('dashWho'); if (!who) return; const av = who.querySelector('.avatar'); if (av) av.outerHTML = HH.avatar(prof(), 44); }
  function refreshSlot() { refreshGallery(); }
  function vPerfil() {
    const p = prof(); const act = p.activities || [];
    const bioLen = (p.bio || '').length;
    return pageHead('Mi perfil', 'Así te ven los clientes', 'Todo lo que cargás acá se muestra en tu perfil público. Guardá cuando termines.', `<a class="btn secondary sm" href="#perfil.${p.slug}" data-go="#perfil.${p.slug}">${HH.icon('eye')} Ver como cliente</a>`)
      + `<div class="dash-cols">
      <form class="stack" data-submit="dashSaveProfile" data-input="dashProfileLive" id="dashProfileForm" novalidate>
        ${galleryHtml(p)}
        <div class="card stack" style="gap:12px">
          <div class="card-title">Datos básicos</div>
          <div class="grid-2">
            <div class="field"><label for="pfName">Nombre para mostrar</label><input class="input" id="pfName" name="displayName" value="${HH.esc(p.displayName)}" maxlength="30" autocomplete="nickname" required></div>
            <div class="field"><label for="pfAge">Edad</label><input class="input" id="pfAge" name="age" type="number" min="18" max="99" inputmode="numeric" value="${p.age || ''}" placeholder="18 o más"></div>
            <div class="field"><label for="pfGender">Te presentás como</label><select class="select" id="pfGender" name="gender">${HH.GENDERS.map(g => `<option value="${g.id}"${(p.gender || 'mujer') === g.id ? ' selected' : ''}>${g.label}</option>`).join('')}</select></div>
            <div class="field"><label for="pfCity">Localidad</label><select class="select" id="pfCity" name="city">${(() => { const home = p.homeCity !== undefined ? p.homeCity : p.city; const cities = (HH.db.locations || []).filter(l => l.level === 'city' && (HH.isActiveLoc(l) || l.name === home)); if (!cities.some(c => c.name === home) && home) cities.push({ name: home, level: 'city' }); return cities.map(c => ({ c, lab: HH.locLabel(HH.locByName(c.name), { country: true }) || c.name })).sort((a, b) => a.lab.localeCompare(b.lab)).map(({ c, lab }) => `<option value="${HH.esc(c.name)}"${c.name === home ? ' selected' : ''}>${HH.esc(lab)}${HH.locByName(c.name) && HH.locByName(c.name).status === 'pending' ? ' (en revisión)' : ''}</option>`).join(''); })()}</select>
              ${p.pendingCity ? `<span class="hint"><span class="badge warn">En revisión</span> Pediste sumar <strong>${HH.esc(p.pendingCity)}</strong>. Cuando la aprobemos, tu perfil se muda ahí.</span>` : `<button type="button" class="btn ghost sm" style="justify-self:start;padding-left:0" data-action="dashPlaceRequest">${HH.icon('plus')} Mi localidad no está en la lista</button>`}
              <button type="button" class="btn ghost sm" style="justify-self:start;padding-left:0" data-action="dashDetectCity">${HH.icon('pin')} ${typeof p.lat === 'number' ? 'Ubicación de zona cargada · actualizar' : 'Detectar mi zona'}</button><span class="hint">Los clientes ven la distancia aproximada a tu zona (precisión de ~1 km), nunca tu dirección.</span></div>
            <input type="hidden" name="country" value="${HH.esc(p.homeCountry || p.country || '')}">
          </div>
          <div class="field"><label for="pfHeadline">Titular corto <span class="muted" style="font-weight:600" id="pfHeadlineCount">${(p.headline || '').length}/60</span></label><input class="input" id="pfHeadline" name="headline" maxlength="60" value="${HH.esc(p.headline)}" placeholder="Cafés de especialidad, museos y charlas largas"><span class="hint">Una línea que resuma tus salidas. Aparece debajo de tu nombre.</span></div>
          <div class="field"><label for="pfBio">Presentación <span class="muted" style="font-weight:600" id="pfBioCount">${bioLen} caracteres${bioLen < 40 ? ' · mín. 40 recomendado' : ''}</span></label><textarea class="textarea" id="pfBio" name="bio" rows="5" maxlength="600" placeholder="Contá qué te gusta hacer, qué barrios conocés y qué idiomas hablás.">${HH.esc(p.bio)}</textarea><span class="hint">Escribí en primera persona, como si le contaras a alguien que acaba de llegar a tu ciudad. Mínimo recomendado: 40 caracteres.</span></div>
          <details class="pf-en"${p.headlineEn || p.bioEn ? ' open' : ''}><summary>${HH.icon('languages')} Versión en inglés <span class="muted" style="font-weight:600">(opcional)</span></summary>
            <p class="hint" style="margin:6px 0 10px">Si querés captar público internacional, escribí tu titular y tu presentación también en inglés. Los ven quienes navegan la web en inglés; el resto ve la versión en español.</p>
            <div class="field"><label for="pfHeadlineEn">Titular en inglés</label><input class="input" id="pfHeadlineEn" name="headlineEn" maxlength="60" lang="en" value="${HH.esc(p.headlineEn || '')}" placeholder="Specialty coffee, museums and long talks"></div>
            <div class="field"><label for="pfBioEn">Presentación en inglés</label><textarea class="textarea" id="pfBioEn" name="bioEn" rows="4" maxlength="600" lang="en" placeholder="Tell people what you like to do and which neighborhoods you know.">${HH.esc(p.bioEn || '')}</textarea></div>
          </details>
        </div>
        <div class="card stack" style="gap:12px">
          <div><div class="card-title">Salidas que ofrecés</div><div class="small muted">Elegí al menos 2. Son los filtros que usan los clientes.</div></div>
          <div class="chips" id="dashActs">${HH.ACTIVITIES.map(a => `<button type="button" class="chip" aria-pressed="${act.includes(a.id)}" data-action="dashToggleChip" data-id="${a.id}">${HH.icon(a.icon)} ${a.label}</button>`).join('')}</div>
          <div class="field"><label for="pfLangs">Idiomas</label><input class="input" id="pfLangs" name="languages" value="${HH.esc((p.languages || []).join(', '))}" placeholder="Español, Inglés"><span class="hint">Separados por coma.</span><div class="pill-row" id="pfLangChips">${langChips(p.languages)}</div></div>
        </div>
        <div class="card stack" style="gap:12px">
          <div><div class="card-title">Tu ficha</div><div class="small muted">Datos cortos que se ven en tu perfil. Todo es opcional.</div></div>
          <div class="grid-2">
            <div class="field"><label for="pfNat">Nacionalidad</label><input class="input" id="pfNat" name="nationality" maxlength="40" value="${HH.esc(p.nationality || '')}" placeholder="Argentina"></div>
            <div class="field"><label for="pfZone">Zona o barrio</label><input class="input" id="pfZone" name="zone" maxlength="40" value="${HH.esc(p.zone || '')}" placeholder="Palermo"><span class="hint">Solo el barrio, nunca tu dirección.</span></div>
            <div class="field"><label for="pfHeight">Altura (cm)</label><input class="input num" id="pfHeight" name="heightCm" type="number" min="130" max="220" inputmode="numeric" value="${p.heightCm || ''}" placeholder="168"></div>
            <div class="field"><label for="pfBuild">Contextura</label><select class="select" id="pfBuild" name="build"><option value="">Sin indicar</option>${Object.entries(HH.BUILDS).map(([k, l]) => `<option value="${k}"${p.build === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
          </div>
          ${HH.interestPicker ? HH.interestPicker(p) : ''}
        </div>
        <div class="card stack" style="gap:12px">
          <div class="card-title">Tarifas y contacto</div>
          <div class="grid-2">
            <div class="field"><label for="pfRate">Tarifa orientativa por hora</label><div class="input-group"><input class="input num" id="pfRate" name="rateFrom" type="number" min="0" step="1" inputmode="numeric" value="${p.rateFrom == null ? '' : p.rateFrom}" placeholder="30"><span class="addon">USD / h</span></div><span class="hint">Opcional. La acordás con cada cliente. No es un cobro de la plataforma.</span></div>
            <div class="field"><span class="label">Chat en vivo (precio por sesión)</span><div class="grid-3" style="gap:6px">${HH.CHAT_MINUTES.map(m => `<div class="input-group"><span class="addon" style="border-radius:var(--radius-sm) 0 0 var(--radius-sm);border-left:1px solid var(--line-2);border-right:0">${m}'</span><input class="input num" name="cp_${m}" type="number" min="1" step="1" inputmode="numeric" value="${HH.chatPrices(p)[m]}" aria-label="Precio ${m} minutos"></div>`).join('')}</div><span class="hint">USD por 10, 15 y 30 minutos. El tiempo corre desde que aceptás.</span></div>
          </div>
          <div class="field"><span class="label">Precios de pedidos a medida</span><div class="grid-3" style="gap:8px">${Object.entries(HH.REQUEST_KINDS).map(([k, K]) => `<div class="input-group"><span class="addon" style="border-radius:var(--radius-sm) 0 0 var(--radius-sm);border-left:1px solid var(--line-2);border-right:0">${K.label}</span><input class="input num" name="rp_${k}" type="number" min="1" step="1" inputmode="numeric" value="${HH.requestPrices(p)[k]}" aria-label="Precio ${K.label} en USD" style="border-radius:0 var(--radius-sm) var(--radius-sm) 0"></div>`).join('')}</div><span class="hint">En USD. El cliente elige foto, video o pack, paga ese precio al pedir y vos aceptás enviándolo o lo rechazás (se le reembolsa).</span>${HH.commissionHint('request')}</div>
          <div class="field"><label for="pfReqAccess">Duración del acceso a pedidos a medida</label><select class="select" id="pfReqAccess" name="requestAccessDays" style="max-width:240px">${HH.ACCESS_OPTIONS.map(o => `<option value="${o.v}"${Number(p.requestAccessDays || 0) === o.v ? ' selected' : ''}>${o.l}</option>`).join('')}</select><span class="hint">Cuánto tiempo puede ver el cliente lo que le enviás, desde la entrega. Lo ve antes de pagar.</span></div>
          <div class="field"><label for="pfWa">WhatsApp</label><input class="input" id="pfWa" name="whatsapp" type="tel" value="${HH.esc(p.whatsapp)}" placeholder="+54 9 11 1234 5678" autocomplete="tel"><span class="hint">Solo se muestra a quien desliza tu perfil a la derecha.</span></div>
          <div class="field"><label for="pfTg">Telegram <span class="muted">(opcional)</span></label><input class="input" id="pfTg" name="telegram" value="${HH.esc(p.telegram || '')}" placeholder="@usuario o número" autocomplete="off"><span class="hint">Como WhatsApp, solo se muestra a quien desliza tu perfil a la derecha.</span></div>
        </div>
        <div class="card stack" style="gap:12px">
          <div class="row between" style="gap:8px"><div><div class="card-title">Mis links</div><div class="small muted">Hasta 4 links a tus redes o páginas. Se muestran en tu página de links, junto a tus botones de SexyRose.</div></div>${(p.links || []).length ? `<a class="btn ghost sm" href="#links.${HH.esc(p.slug)}" data-go="#links.${HH.esc(p.slug)}">${HH.icon('eye')} Ver página</a>` : ''}</div>
          ${[0, 1, 2, 3].map(i => { const l = (p.links || [])[i] || {}; return `<div class="lk-row"><input class="input" name="lk_l${i}" maxlength="40" value="${HH.esc(l.label || '')}" placeholder="Nombre (ej.: Instagram)" aria-label="Nombre del link ${i + 1}"><input class="input" name="lk_u${i}" type="url" inputmode="url" maxlength="300" value="${HH.esc(l.url || '')}" placeholder="https://…" aria-label="Dirección del link ${i + 1}"></div>`; }).join('')}
          <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap"><span class="small muted">Tu link para la bio:</span><code class="lk-url" id="lkUrl">${HH.esc(HH.absUrl ? HH.absUrl('#links.' + p.slug) : location.href.split('#')[0] + '#links.' + p.slug)}</code><button type="button" class="btn ghost sm" data-action="dashCopyLinks">${HH.icon('copy')} Copiar</button></div>
          <div class="tiny muted">Los links externos son responsabilidad de cada acompañante. SexyRose no controla ni se hace cargo de su contenido.</div>
        </div>
        <div class="sticky-save row between"><span class="small muted hide-mobile">Los cambios se publican al guardar.</span><div class="row" style="margin-left:auto"><a class="btn ghost sm" href="#perfil.${p.slug}" data-go="#perfil.${p.slug}">Ver como cliente</a><button class="btn" type="submit">${HH.icon('check')} Guardar perfil</button></div></div>
      </form>
      <aside class="aside stack" style="gap:10px">
        <div><div class="card-title">Vista previa</div><div class="small muted">Así aparecés en el listado. Se actualiza mientras escribís.</div></div>
        <div id="dashPreview">${previewCard(p)}</div>
      </aside>
    </div>`;
  }

  /* ---------- 3. Contenido ---------- */
  function packRow(k) {
    const its = k.itemIds.map(id => HH.db.content.find(c => c.id === id)).filter(Boolean);
    return `<div class="list-item pack-row"><div class="pack-thumbs">${its.slice(0, 3).map(it => HH.contentThumb(it, { noLock: true, noTag: true, cls: 'square' })).join('')}</div><div class="grow"><div class="title ellipsis">${HH.esc(k.title)}</div><div class="sub">${its.length} ${HH.plural(its.length, 'pieza', 'piezas')} · ${HH.money(k.priceUsd)} · ${HH.esc(HH.accessLabel(k.accessDays))}</div><div class="sub"><strong style="color:var(--fg-2)">${k.sales || 0} ${HH.plural(k.sales || 0, 'venta', 'ventas')}</strong> · ${HH.money((k.sales || 0) * k.priceUsd)} cobrados</div></div><div class="pack-acts"><button class="icon-btn sm" data-action="dashPackEdit" data-id="${k.id}" aria-label="Editar pack" title="Editar">${HH.icon('edit')}</button><button class="icon-btn sm" data-action="dashPackDelete" data-id="${k.id}" aria-label="Borrar pack" title="Borrar">${HH.icon('trash')}</button></div></div>`;
  }
  function tile(it) {
    const inc = (it.sales || 0) * (it.isPremium ? it.priceUsd : 0);
    return `<div class="ctile" id="ct_${it.id}">${HH.contentThumb(it, { noLock: true, freeTag: true, cls: 'square' })}
      <div class="cbody">
        <div class="ctitle ellipsis" title="${HH.esc(it.title)}"><span data-noi18n>${HH.esc(it.title)}</span></div>
        <div class="tiny muted ellipsis">${TYPE_LABEL[it.type] || it.type}${it.duration ? ' ' + it.duration : ''} · ${n(it.views)} vistas</div>
        <div class="tiny muted ellipsis">${it.isPremium ? `${HH.money(it.priceUsd)} c/u${Number(it.accessDays) ? ' · ' + HH.accessShort(it.accessDays) : ''} · ${n(it.sales)} ${HH.plural(it.sales || 0, 'venta', 'ventas')}` : 'Visible para todos'}</div>
        <div class="cfoot"><span class="small num ellipsis" style="font-weight:800">${it.isPremium ? HH.money(inc) : '<span class="muted">Gratis</span>'}</span><span class="row nowrap" style="gap:4px;flex:none"><button class="icon-btn sm" data-action="dashEditContent" data-id="${it.id}" aria-label="Editar" title="Editar">${HH.icon('edit')}</button><button class="icon-btn sm" data-action="dashDeleteContent" data-id="${it.id}" aria-label="Borrar" title="Borrar">${HH.icon('trash')}</button></span></div>
      </div></div>`;
  }
  function contentGrid(items) {
    const f = S.contentFilter;
    const list = items.filter(i => f === 'all' || (f === 'premium' ? i.isPremium : f === 'free' ? !i.isPremium : i.type === f));
    if (!list.length) return `<div class="empty card">${HH.icon('image')}<h4>${items.length ? 'Nada con este filtro' : 'Todavía no publicaste contenido'}</h4><p class="small">${items.length ? 'Probá con otro filtro o subí algo nuevo.' : 'Subí un short gratis para empezar a recibir visitas y una foto premium para vender.'}</p><button class="btn sm" data-action="dashUploadOpen">${HH.icon('upload')} Subir contenido</button></div>`;
    return `<div class="cgrid">${list.map(tile).join('')}</div>`;
  }
  function vContenido() {
    const w = me().id; const level = HH.levelOf(w);
    const items = HH.contentOf(w), packs = HH.packsOf(w);
    const premiumOk = !!(level && HH.LEVELS[level].premium_content);
    const sales = HH.sum(items, i => i.sales || 0) + HH.sum(packs, k => k.sales || 0);
    const income = HH.sum(items, i => (i.sales || 0) * (i.isPremium ? i.priceUsd : 0)) + HH.sum(packs, k => (k.sales || 0) * k.priceUsd);
    const counts = { all: items.length, photo: items.filter(i => i.type === 'photo').length, video: items.filter(i => i.type === 'video').length, short: items.filter(i => i.type === 'short').length, premium: items.filter(i => i.isPremium).length, free: items.filter(i => !i.isPremium).length };
    const FILTERS = [['all', 'Todo'], ['photo', 'Fotos'], ['video', 'Videos'], ['short', 'Shorts'], ['premium', 'Premium'], ['free', 'Gratis']];
    return pageHead('Contenido', 'Tus fotos, videos y shorts', 'Lo privado se vende suelto o en packs, sin límite. Tus fotos y videos públicos van en Mi perfil.', `<button class="btn" data-action="dashUploadOpen">${HH.icon('upload')} Subir contenido</button>`)
      + (() => { const sts = HH.storiesOf(me().id); return `<div class="card stack" style="gap:12px">
        <div class="row between"><div><div class="card-title">Historias</div><div class="small muted">Duran 24 h y aparecen en el inicio con tu anillo. Lo mejor para mostrar tu día.</div></div><button class="btn secondary sm" data-action="dashStoryOpen">${HH.icon('plus')} Nueva historia</button></div>
        ${sts.length ? `<div class="row" style="gap:10px">${sts.map(st => `<div class="card pad-sm" style="width:150px;display:grid;gap:6px"><div class="media tall" style="border-radius:10px">${HH.storyMedia(st)}</div><div class="tiny ellipsis">${HH.esc(st.caption || 'Sin texto')}</div><div class="row between tiny muted"><span>${HH.icon('eye')} ${st.views || 0}</span><span>vence en ${Math.max(1, Math.round((new Date(st.expiresAt) - Date.now()) / 3600e3))} h</span></div><button class="btn danger sm" data-action="dashStoryDelete" data-id="${st.id}">Borrar</button></div>`).join('')}</div>` : `<div class="small muted">No tenés historias activas. Subí una foto de tu día: café, paseo, lo que estés haciendo.</div>`}
      </div>`; })()
      + `<div class="grid-3">
        ${stat('Publicados', n(items.length), `${counts.free} gratis · ${counts.premium} premium`)}
        ${stat('Ventas', n(sales), 'piezas sueltas y packs')}
        ${stat('Ingresos por contenido', HH.money(income), 'acumulado', 'accent span-m2')}
      </div>`
      + (premiumOk ? '' : `<div class="notice warn">${HH.icon('lock')}<span>Tu plan ${level ? HH.planName(level) : ''} no incluye contenido premium: podés publicar fotos y shorts gratis. <a href="#panel.suscripcion" data-go="#panel.suscripcion">Cambiá de plan</a> para vender.</span></div>`)
      + `<div class="card stack" style="gap:12px">
        <div class="row between"><div><div class="card-title">Packs</div><div class="small muted">Agrupá piezas premium a un precio único.</div></div><button class="btn secondary sm" data-action="dashPackOpen">${HH.icon('plus')} Nuevo pack</button></div>
        ${packs.length ? `<div class="list">${packs.map(packRow).join('')}</div>` : `<div class="empty" style="padding:14px 8px 6px">${HH.icon('pack')}<h4>Todavía no armaste ningún pack</h4><p class="small">Elegí 2 o más piezas premium y poneles un precio. Es lo que más se vende.</p></div>`}
      </div>`
      + `<div class="chips scroll" id="dashCFilters">${FILTERS.map(([id, l]) => `<button type="button" class="chip ${S.contentFilter === id ? 'active' : ''}" data-action="dashContentFilter" data-f="${id}" style="flex:none">${l}<span class="count">${counts[id]}</span></button>`).join('')}</div>`
      + `<div id="dashCGrid">${contentGrid(items)}</div>`;
  }
  function contentForm(it, premiumOk) {
    const prem = it ? !!it.isPremium : false;
    return `
      <div class="field"><label for="upTitle">Título</label><input class="input" id="upTitle" maxlength="60" value="${HH.esc(it ? it.title : '')}" placeholder="Tarde en el Malba"></div>
      <div class="field"><label for="upCaption">Descripción</label><textarea class="textarea" id="upCaption" rows="2" maxlength="160" placeholder="Qué hiciste, dónde, con quién fuiste" style="min-height:64px">${HH.esc(it ? it.caption : '')}</textarea></div>
      ${premiumOk ? '' : `<div class="notice warn">${HH.icon('lock')}<span>Tu plan no permite contenido premium. <a href="#panel.suscripcion" data-go="#panel.suscripcion" data-action="closeModal">Cambiá de plan</a> para vender fotos y videos.</span></div>`}
      <div class="switch-row" style="border:0;padding:0"><div><div class="t">Privado (pago)</div><div class="s">Privado: se ve borroso hasta que el cliente lo compra, sin límite. Las fotos y videos públicos se cargan en Mi perfil.</div></div><button type="button" class="switch" role="switch" aria-checked="${prem}" id="upPremium" data-action="dashUploadPremium" ${premiumOk ? '' : 'disabled'} aria-label="Contenido premium"></button></div>
      <div class="field" id="upPriceWrap" ${prem ? '' : 'hidden'}><label for="upPrice">Precio</label><div class="input-group" style="max-width:200px"><input class="input num" id="upPrice" type="number" min="1" step="1" value="${it && it.priceUsd ? it.priceUsd : 5}" inputmode="numeric"><span class="addon">USD</span></div><span class="hint">Mínimo USD 1. Lo que paga cada cliente por desbloquearlo.</span></div>
      <div class="field" id="upAccessWrap" ${prem ? '' : 'hidden'}><label for="upAccess">Duración del acceso</label><select class="select" id="upAccess" style="max-width:220px">${HH.ACCESS_OPTIONS.map(o => `<option value="${o.v}"${Number(it && it.accessDays || 0) === o.v ? ' selected' : ''}>${o.l}</option>`).join('')}</select><span class="hint">Cuánto tiempo puede verlo el cliente desde que lo compra. Si lo cambiás, aplica a las compras nuevas.</span></div>`;
  }
  function packModal(pack) {
    const w = me().id; const prem = HH.contentOf(w).filter(i => i.isPremium);
    const sel = new Set(pack ? pack.itemIds : []);
    const sum = HH.sum(prem.filter(i => sel.has(i.id)), i => i.priceUsd);
    HH.modal({
      title: pack ? 'Editar pack' : 'Nuevo pack', body: `
      <div class="stack" style="gap:12px">
        <div class="field"><label for="pkTitle">Título</label><input class="input" id="pkTitle" maxlength="50" value="${HH.esc(pack ? pack.title : '')}" placeholder="Pack Buenos Aires"></div>
        <div class="field"><label for="pkDesc">Descripción</label><input class="input" id="pkDesc" maxlength="120" value="${HH.esc(pack ? pack.description : '')}" placeholder="Las 4 mejores salidas del mes"></div>
        <div class="field"><label for="pkPrice">Precio del pack</label><div class="input-group" style="max-width:200px"><input class="input num" id="pkPrice" type="number" min="1" step="1" inputmode="numeric" value="${pack ? pack.priceUsd : 15}"><span class="addon">USD</span></div><span class="hint" id="pkHint">Las piezas sueltas suman ${HH.money(sum)}. Un pack conviene si sale menos.</span>${HH.commissionHint('pack')}</div>
        <div class="field"><label for="pkAccess">Duración del acceso</label><select class="select" id="pkAccess" style="max-width:220px">${HH.ACCESS_OPTIONS.filter(o => HH.PACK_ACCESS.includes(o.v)).map(o => `<option value="${o.v}"${(HH.PACK_ACCESS.includes(Number(pack && pack.accessDays || 0)) ? Number(pack && pack.accessDays || 0) : 30) === o.v ? ' selected' : ''}>${o.l}</option>`).join('')}</select><span class="hint">Cuánto tiempo ve el pack quien lo compra. Aplica a las compras nuevas.</span></div>
        <div class="field"><span class="label">Piezas incluidas <span class="muted">(mínimo 2)</span></span>
        ${prem.length < 2 ? `<div class="notice warn">${HH.icon('alert')}<span>Necesitás al menos 2 piezas premium publicadas para armar un pack. Subí contenido premium primero.</span></div>`
          : `<div class="pick-list" id="pkItems">${prem.map(it => `<label class="pick ${sel.has(it.id) ? 'active' : ''}"><input type="checkbox" class="sr-only" value="${it.id}" ${sel.has(it.id) ? 'checked' : ''} data-change="dashPackPick">${HH.contentThumb(it, { noLock: true, noTag: true, cls: 'square' })}<span class="grow" style="min-width:0"><span class="ellipsis" style="display:block;font-weight:700;font-size:14px"><span data-noi18n>${HH.esc(it.title)}</span></span><span class="tiny muted">${TYPE_LABEL[it.type]} · ${HH.money(it.priceUsd)}</span></span>${HH.icon('check')}</label>`).join('')}</div>`}</div>
      </div>`,
      actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: pack ? 'Guardar pack' : 'Crear pack', onClick: () => A.dashPackSubmit(pack ? pack.id : null) }],
    });
  }

  /* ---------- 4. Pedidos ---------- */
  function reqCard(r) {
    const c = HH.userById(r.clientId); const st = HH.REQUEST_STATES[r.status] || { label: r.status, badge: 'neutral' };
    const name = c ? c.name : 'Cliente';
    let foot = '';
    const K = r.kind && HH.REQUEST_KINDS[r.kind];
    if (r.status === 'pendiente') foot = `<div class="row between"><span class="il small" style="color:var(--ok);font-weight:700">${HH.icon('checkCircle')} Ya pagó ${HH.money(r.priceUsd)}${K ? ' · ' + K.label : ''}</span><div class="row"><button class="btn sm" data-action="dashDeliverOpen" data-id="${r.id}">${HH.icon('send')} Aceptar y enviar</button><button class="btn sm ghost" data-action="dashRejectOpen" data-id="${r.id}">Rechazar</button></div></div>`;
    else if (r.status === 'solicitado') foot = `<div class="row"><button class="btn sm" data-action="dashQuoteOpen" data-id="${r.id}">${HH.icon('check')} Aceptar y cotizar</button><button class="btn sm ghost" data-action="dashRejectOpen" data-id="${r.id}">Rechazar</button></div>`;
    else if (r.status === 'aceptado') foot = `<div class="row between"><span class="il small muted">${HH.icon('clock')} Esperando el pago del cliente</span><button class="btn sm secondary" data-action="dashQuoteOpen" data-id="${r.id}">Cambiar precio</button></div>`;
    else if (r.status === 'pagado') foot = `<div class="row between"><span class="il small" style="color:var(--ok);font-weight:700">${HH.icon('checkCircle')} Pagado · ${HH.money(r.priceUsd)}</span><button class="btn sm" data-action="dashDeliverOpen" data-id="${r.id}">${HH.icon('gift')} Entregar</button></div>`;
    else if (r.status === 'entregado' && (r.deliveredItemIds || []).length > 1) foot = `<div class="row" style="gap:6px">${r.deliveredItemIds.map(id => HH.db.content.find(x => x.id === id)).filter(Boolean).slice(0, 6).map(it => `<div style="width:56px">${HH.contentThumb(it, { noLock: true, noTag: true, cls: 'square' })}</div>`).join('')}<span class="small muted">${r.deliveredItemIds.length} piezas entregadas</span></div>`;
    else if (r.status === 'entregado') { const it = HH.db.content.find(x => x.id === r.deliveredItemId); foot = `<div class="row nowrap" style="gap:12px">${it ? `<div style="width:64px;flex:none">${HH.contentThumb(it, { noLock: true, noTag: true, cls: 'square' })}</div><div class="small" style="min-width:0"><div style="font-weight:700" class="ellipsis"><span data-noi18n>${HH.esc(it.title)}</span></div><div class="muted">Entregado el ${HH.fmtDate(r.updatedAt)} · ${HH.money(r.priceUsd)}</div></div>` : `<span class="small muted">Entregado el ${HH.fmtDate(r.updatedAt)}</span>`}</div>`; }
    else if (r.status === 'rechazado') foot = r.note ? `<div class="small muted">Motivo: <span data-noi18n>${HH.esc(r.note)}</span></div>` : '';
    return `<div class="card stack" style="gap:10px" id="rq_${r.id}">
      <div class="row between"><div class="row nowrap" style="gap:10px;min-width:0">${c ? HH.userAvatar(c, 40) : ''}<div style="min-width:0"><div style="font-weight:800" class="ellipsis">${HH.esc(name)}</div><div class="tiny muted">${r.kind && HH.REQUEST_KINDS[r.kind] ? HH.REQUEST_KINDS[r.kind].label + ' · ' : ''}Hace ${HH.timeAgo(r.createdAt)}${r.priceUsd ? ' · ' + HH.money(r.priceUsd) : ''}</div></div></div><span class="badge ${st.badge}">${st.label}</span></div>
      <p class="req-desc"><span data-noi18n>${HH.esc(r.description)}</span></p>
      ${r.status === 'aceptado' && r.note ? `<div class="small muted">Tu mensaje: “<span data-noi18n>${HH.esc(r.note)}</span>”</div>` : ''}
      ${foot}
    </div>`;
  }
  function vPedidos() {
    const w = me().id; const all = HH.requestsOf(w);
    const states = ['pendiente', 'entregado', 'rechazado'].concat(all.some(r => ['solicitado', 'aceptado', 'pagado'].includes(r.status)) ? ['solicitado', 'aceptado', 'pagado'] : []);
    const counts = {}; states.forEach(s => { counts[s] = all.filter(r => r.status === s).length; });
    const head = pageHead('Pedidos a medida', 'Pedidos', 'El cliente elige foto, video o pack según tus precios y paga al pedir. Si aceptás, le enviás el contenido desde acá; si rechazás, le devolvemos el dinero.');
    if (!all.length) return head + `<div class="empty card">${HH.icon('inbox')}<h4>Todavía no tenés pedidos a medida</h4><p class="small" style="max-width:48ch">Un pedido a medida es una foto o un video que un cliente te encarga: un saludo, una recomendación de lugares, una salida puntual. Vos decidís si lo aceptás y a qué precio. Cuando paga, lo entregás desde acá y el cobro se suma a tus ingresos.</p><a class="btn secondary sm" href="#panel.contenido" data-go="#panel.contenido">Mientras tanto, subí contenido</a></div>`;
    const f = states.includes(S.reqFilter) ? S.reqFilter : 'all';
    const list = f === 'all' ? all : all.filter(r => r.status === f);
    const chips = [['all', 'Todos', all.length], ...states.map(s => [s, STATE_SHORT[s], counts[s]])];
    return head + `<div class="chips scroll">${chips.map(([id, l, c]) => `<button type="button" class="chip ${f === id ? 'active' : ''}" data-action="dashReqFilter" data-f="${id}" style="flex:none">${l}<span class="count">${c}</span></button>`).join('')}</div>`
      + `<div class="stack" id="dashReqList">${list.length ? list.map(reqCard).join('') : `<div class="empty card">${HH.icon('inbox')}<h4>Nada en este estado</h4><p class="small">Probá con otro filtro.</p></div>`}</div>`;
  }
  function deliverNewForm() {
    return `<div class="stack" id="dvNew" style="gap:10px">
      <div class="type-grid" id="dvTypes">${['photo', 'video'].concat(HH.planFeat(me().id, 'shorts') ? ['short'] : []).map(t => `<button type="button" class="radio-card ${t === 'photo' ? 'active' : ''}" data-action="dashDeliverType" data-type="${t}">${HH.icon(TYPE_ICON[t])}<span><strong>${TYPE_LABEL[t]}</strong></span></button>`).join('')}</div>
      <label class="dropzone" id="dvDrop" for="dvFile">${HH.icon('upload')}<div>Tocá para elegir el archivo</div></label><input type="file" id="dvFile" class="sr-only" accept="image/*" data-change="dashDeliverFile">
      <div class="field" id="dvDurWrap" hidden><label for="dvDur">Duración</label><input class="input" id="dvDur" placeholder="m:ss, por ejemplo 1:20" style="max-width:200px"></div>
    </div>`;
  }

  /* ---------- 5. Mensajes ---------- */
  function quotaBanner(q) {
    if (q.unlimited) return `<div class="card pad-sm row between"><span class="il small">${HH.icon('bolt')} Respondé todo lo que quieras</span><span class="badge level-${HH.levelOf(me().id)}">Chat por sesiones · ${HH.planName(HH.levelOf(me().id))}</span></div>`;
    if (q.limit === 0) return `<div class="notice warn" style="align-items:center"><span style="display:contents">${HH.icon('lock')}</span><span class="grow">${q.level ? 'Tu plan no incluye chat. Podés leer pero no responder.' : 'Sin plan activo no podés responder mensajes.'}</span><a class="btn sm" href="#panel.suscripcion" data-go="#panel.suscripcion" style="flex:none">${q.level ? 'Cambiar plan' : 'Activar plan'}</a></div>`;
    const pct = Math.min(100, q.used / q.limit * 100);
    return `<div class="card pad-sm stack" style="gap:6px"><div class="row between small"><span>Respuestas de hoy: <strong class="num">${q.used} de ${q.limit}</strong></span><span class="muted">se renueva a las 00:00</span></div><div class="progress ${q.blocked ? 'danger' : pct > 80 ? 'warn' : ''}" role="progressbar" aria-valuenow="${q.used}" aria-valuemin="0" aria-valuemax="${q.limit}"><span style="width:${pct}%"></span></div>${q.blocked ? `<div class="small" style="color:var(--danger);font-weight:700">Llegaste al límite de hoy. <a href="#panel.suscripcion" data-go="#panel.suscripcion">Subí de plan</a> para seguir respondiendo.</div>` : ''}</div>`;
  }
  function bubble(m, w) { return `<div class="bubble ${m.senderId === w ? 'me' : 'them'}"><span data-noi18n>${HH.esc(m.content)}</span><span class="t">${HH.fmtDateTime(m.createdAt)}</span></div>`; }
  function vMensajes(otherId) {
    const u = me(), p = prof(), w = u.id; const q = HH.chatQuota(w);
    const threads = myThreads(w, p);
    const list = threads.length ? threads.map(t => {
      const o = HH.userById(t.otherId); const name = o ? o.name : 'Usuario'; const access = HH.hasChatAccess(t.otherId, w);
      return `<a class="thread ${t.otherId === otherId ? 'active' : ''}" href="#panel.mensajes.${t.otherId}" data-go="#panel.mensajes.${t.otherId}">${o ? HH.userAvatar(o, 44) : HH.avatar(null, 44)}<div class="grow" style="min-width:0"><div class="row between nowrap" style="gap:6px"><span class="ellipsis" style="font-weight:${t.unread ? 800 : 700}">${HH.esc(name)}</span><span class="tiny muted" style="flex:none">${HH.timeAgo(t.last.createdAt)}</span></div><div class="row between nowrap" style="gap:6px"><span class="preview grow">${t.last.senderId === w ? 'Vos: ' : ''}${HH.esc(t.last.content)}</span>${t.unread ? `<span class="badge ubadge">${t.unread}</span>` : ''}</div>${access ? `<span class="badge ok" style="margin-top:4px;font-size:10px;padding:1px 7px">${HH.icon('bolt')} Chat activo</span>` : ''}</div></a>`;
    }).join('') : `<div class="empty card">${HH.icon('message')}<h4>Todavía no tenés mensajes</h4><p class="small">Cuando un cliente te escriba, la conversación aparece acá.</p></div>`;

    const recent = HH.recentRow(threads.slice(0, 12).map(t => ({ id: t.otherId, go: '#panel.mensajes.' + t.otherId, dot: t.unread > 0 || HH.hasChatAccess(t.otherId, w) })));
    const search = threads.length > 3 ? `<label class="msg-search">${HH.icon('search')}<input class="input" type="search" placeholder="Buscar conversación" data-input="msgSearch" aria-label="Buscar conversación"></label>` : '';
    let convo;
    if (!otherId) {
      convo = `<div class="card convo"><div class="empty" style="padding:48px 20px">${HH.icon('message')}<h4>Elegí una conversación</h4><p class="small">Tus mensajes con clientes aparecen acá. Respondé rápido: vende más.</p></div></div>`;
    } else {
      const o = HH.userById(otherId);
      if (!o) convo = `<div class="card convo"><div class="empty">${HH.icon('alert')}<h4>No encontramos ese usuario</h4><a class="btn secondary sm" href="#panel.mensajes" data-go="#panel.mensajes">Volver a la bandeja</a></div></div>`;
      else {
        const isBlocked = blocked(p).includes(otherId);
        HH.markRead(w, otherId);
        const msgs = HH.db.messages.filter(m => (m.senderId === w && m.receiverId === otherId) || (m.senderId === otherId && m.receiverId === w)).sort(HH.by('createdAt', 1));
        const access = HH.hasChatAccess(otherId, w);
        const pu = HH.chatSessionOf(otherId, w);
        const cantSend = q.blocked || isBlocked;
        const reason = isBlocked ? 'Bloqueaste a este usuario. Si querés volver a escribirle, desbloquealo.' : q.limit === 0 ? (q.level ? 'Tu plan no incluye chat. Podés leer pero no responder.' : 'Necesitás un plan activo para responder.') : q.blocked ? `Llegaste al límite diario de ${q.limit} respuestas. Mañana a las 00:00 se renueva.` : '';
        convo = `<div class="card convo stack" style="gap:12px">
          <div class="row between nowrap"><div class="row nowrap" style="gap:10px;min-width:0"><a class="icon-btn sm hide-desktop" href="#panel.mensajes" data-go="#panel.mensajes" aria-label="Volver a la bandeja">${HH.icon('arrowLeft')}</a>${HH.userAvatar(o, 40)}<div style="min-width:0"><div style="font-weight:800" class="ellipsis">${HH.esc(o.name)}</div><div class="tiny muted ellipsis">${isBlocked ? 'Bloqueado' : access && pu ? `Chat activo · quedan <span data-countdown="${new Date(pu.endsAt || pu.expiresAt).getTime()}">${HH.mmss(new Date(pu.endsAt || pu.expiresAt) - new Date())}</span>` : 'Sin sesión de chat en curso'}</div></div></div><div class="row nowrap" style="gap:6px;flex:none"><button class="icon-btn sm" data-action="dashReportOpen" data-id="${otherId}" aria-label="Reportar usuario" title="Reportar">${HH.icon('flag')}</button><button class="icon-btn sm" data-action="dashBlock" data-id="${otherId}" aria-label="${isBlocked ? 'Desbloquear usuario' : 'Bloquear usuario'}" title="${isBlocked ? 'Desbloquear' : 'Bloquear'}" ${isBlocked ? 'style="color:var(--danger)"' : ''}>${HH.icon('ban')}</button></div></div>
          <div class="msgs" id="dashMsgs"><div class="msg-list">${msgs.length ? msgs.map(m => bubble(m, w)).join('') : `<div class="empty" style="padding:30px 10px">${HH.icon('message')}<h4>Todavía no hay mensajes</h4><p class="small">Escribile para arrancar la conversación.</p></div>`}</div></div>
          ${reason ? `<div class="notice warn">${HH.icon('alert')}<span>${reason}</span></div>` : ''}
          <form class="composer" data-submit="dashSendMessage" data-to="${otherId}">
            <textarea class="textarea grow" name="text" id="dashMsgInput" rows="1" placeholder="${cantSend ? 'No podés responder ahora' : 'Escribí tu respuesta'}" ${cantSend ? 'disabled' : ''} aria-label="Mensaje" required></textarea>
            <button class="btn" type="submit" ${cantSend ? 'disabled' : ''}>${HH.icon('send')} Enviar</button>
          </form>
          <div class="tiny muted">Acordá las salidas por acá o por WhatsApp. Siempre en lugares públicos.</div>
        </div>`;
      }
    }
    const onBtn = HH.chatEnabledFor(w) ? `<button type="button" class="btn ${p.chatOnline ? 'ok' : 'secondary'} sm" data-action="chatToggleOnline" aria-pressed="${!!p.chatOnline}">${p.chatOnline ? '● Disponible para chat' : 'No disponible para chat'}</button>` : '';
    return pageHead('Mensajes', 'Bandeja', threads.length ? `${threads.length} ${HH.plural(threads.length, 'conversación', 'conversaciones')}${unread(w, p) ? ` · ${unread(w, p)} sin leer` : ''}` : '', onBtn)
      + quotaBanner(q)
      + `<div class="chat ${otherId ? 'has-convo' : ''}"><div class="threads-wrap">${recent}${search}${list}</div><div class="convo-wrap">${convo}</div></div>`;
  }

  /* ---------- 6. Suscripción ---------- */
  function vSuscripcion() {
    const w = me().id; const sub = HH.activeSubscription(w); const level = HH.levelOf(w);
    const pp = prof();
    // Los planes y precios se ven recién con el email verificado
    if (!sub && pp && pp.emailVerified === false) return pageHead('Suscripción', 'Verificá tu email para ver los planes', '') + `<div class="card stack" style="gap:14px;max-width:560px;text-align:center;justify-items:center">
        <span class="pub-ico" style="width:56px;height:56px">${HH.icon('lock')}</span>
        <h3>Un paso antes de elegir tu plan</h3>
        <p class="small muted">Verificá tu email con un código de 6 dígitos. Después vas a ver los beneficios de cada categoría y sus precios.</p>
        <button class="btn" data-action="verifyContact" data-kind="email">${HH.icon('check')} Verificar mi email</button>
      </div>`;
    const pitch = !sub ? `<section class="stack" style="gap:14px">
        <div style="max-width:720px"><span class="eyebrow">Para acompañantes</span><h2>Cobrá por tu tiempo y tu contenido, con tus reglas</h2>
          <p class="muted" style="margin-top:8px">Publicás tu perfil, elegís qué salidas ofrecés y los clientes te escriben por WhatsApp. Además vendés fotos, videos y shorts de tus salidas o tu día a día.</p></div>
        <div class="grid-4">${HH.COMPANION_BENEFITS.map(([ic, t, d]) => `<div class="card stack" style="gap:10px"><span class="pub-ico">${HH.icon(ic)}</span><h4>${t}</h4><p class="small muted">${d}</p></div>`).join('')}</div>
        <div class="row between" style="align-items:flex-end;margin-top:6px"><div><span class="eyebrow">Planes mensuales</span><h3>Elegí cuánto querés crecer</h3></div><span class="small muted">Se renuevan cada 30 días. Cancelás cuando quieras.</span></div>
      </section>` : '';
    // Suscripciones con Mercado Pago, cambios de plan y pausa por cobro rechazado: billing.js
    if (HH.billingPanel) return HH.billingPanel({ w, pageHead, planFeatures, pitch });
    let current;
    if (sub) {
      const L = HH.LEVELS[level]; const total = new Date(sub.expiresAt) - new Date(sub.startedAt); const elapsed = Date.now() - new Date(sub.startedAt);
      const pct = total > 0 ? HH.clamp(Math.round(elapsed / total * 100), 0, 100) : 0;
      current = `<div class="card lift stack" style="gap:12px">
        <div class="row between"><div><div class="eyebrow">Plan actual</div><h3>Plan ${L.label}</h3></div>${HH.levelBadge(level, true)}</div>
        <div class="row between" style="align-items:flex-end"><div><span style="font-size:28px;font-weight:800" class="num">${HH.money(L.price_usd)}</span><span class="muted small"> / mes</span></div><div class="small muted">Se renueva el ${HH.fmtDate(sub.expiresAt)} · ${HH.daysLeft(sub.expiresAt)} ${HH.plural(HH.daysLeft(sub.expiresAt), 'día', 'días')}</div></div>
        <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Mes transcurrido"><span style="width:${pct}%"></span></div>
        <ul class="plan-feats">${planFeatures(level).map(f => `<li class="${f.ok ? '' : 'no'}">${HH.icon(f.ok ? 'check' : 'x')}<span>${f.t}</span></li>`).join('')}</ul>
      </div>`;
    } else current = pitch;

    const plans = `<div class="plans plans-6">${HH.PLAN_ORDER.map(lv => {
      const L = HH.LEVELS[lv]; const cur = lv === level;
      return `<div class="plan ${cur ? 'featured' : ''}">${cur ? `<span class="badge ribbon level-${lv}">Tu plan</span>` : lv === 'S' ? `<span class="badge ribbon gold">${HH.icon('crown')} Quedan ${HH.starSlotsFree(HH.starRegionOf(w))} en ${HH.esc(HH.starRegionOf(w) || 'tu provincia')}</span>` : ''}
        <div><div class="eyebrow">Plan</div><h3>${L.label}</h3></div>
        <div class="price">${HH.money(L.price_usd)}<small> / mes</small></div>
        <p class="small muted">${L.desc}</p>
        <ul>${planFeatures(lv).map(f => `<li class="${f.ok ? '' : 'no'}">${HH.icon(f.ok ? 'check' : 'x')}<span>${f.t}</span></li>`).join('')}</ul>
        <div>${cur ? `<button class="btn secondary block" disabled>Tu plan actual</button>` : (lv === 'S' && !HH.isStar(w) && !HH.starSlotsFree(HH.starRegionOf(w)) ? `<button class="btn secondary block" disabled>Sin lugares este mes</button>` : `<button class="btn ${lv === 'S' ? '' : 'secondary'} block" data-action="dashSubscribe" data-level="${lv}">${level ? 'Cambiar a ' + L.label : 'Activar ' + L.label}</button>`)}</div>
      </div>`;
    }).join('')}</div>`;

    const star = HH.activeStars().find(s => s.workerId === w); const myCountry = HH.starRegionOf(w); const free = HH.starSlotsFree(myCountry);
    const starHtml = `<div class="card star-card stack" style="gap:12px">
      <div class="row between"><div><div class="eyebrow" style="color:var(--gold)">Stars</div><h3>Aparecé primera en todo el sitio</h3></div>${HH.starBadge()}</div>
      <p class="small" style="color:var(--fg-2);max-width:62ch">Hay solo ${HH.STARS.slots_per_country} slots Stars por mes en ${HH.esc(myCountry || 'tu país')}. Por ${HH.money(HH.STARS.price_usd)} cada ${HH.STARS.days} días aparecés primera en el swipe, en el listado y en la sección Stars del inicio.</p>
      ${star ? `<div class="stack" style="gap:6px"><div class="row between small"><strong>Star hasta el ${HH.fmtDate(star.activeUntil)}</strong><span class="muted">${HH.daysLeft(star.activeUntil)} ${HH.plural(HH.daysLeft(star.activeUntil), 'día restante', 'días restantes')}</span></div><div class="progress" role="progressbar" aria-valuenow="${HH.STARS.days - HH.daysLeft(star.activeUntil)}" aria-valuemin="0" aria-valuemax="${HH.STARS.days}"><span style="width:${HH.clamp((HH.STARS.days - HH.daysLeft(star.activeUntil)) / HH.STARS.days * 100, 0, 100)}%"></span></div><div class="tiny muted">Cuando venza, podés volver a reservar si hay un slot libre.</div></div>`
        : `<div class="row between"><span class="small"><strong>${free} de ${HH.STARS.slots_per_country}</strong> ${HH.plural(free, 'slot libre', 'slots libres')} en ${HH.esc(myCountry || 'tu país')}</span>${free ? `<button class="btn" data-action="dashBuyStar">${HH.icon('star')} Reservar mi slot · ${HH.money(HH.STARS.price_usd)}</button>` : `<div class="col" style="gap:4px;align-items:flex-end"><button class="btn" disabled>${HH.icon('star')} Reservar mi slot</button><span class="tiny muted">Te avisamos cuando se libere uno.</span></div>`}</div>`}
    </div>`;

    const pays = HH.paymentsOf(w);
    const hist = `<div class="card stack" style="gap:10px"><div class="card-title">Historial de pagos</div>${pays.length ? `<div class="table-wrap"><table class="table" style="min-width:0"><thead><tr><th>Fecha</th><th>Concepto</th><th class="num">Monto</th></tr></thead><tbody>${pays.map(p => `<tr><td style="white-space:nowrap">${HH.fmtDate(p.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}</td><td style="white-space:nowrap">${HH.esc(p.description)}</td><td class="num" style="white-space:nowrap">${HH.money(p.amountUsd)}</td></tr>`).join('')}</tbody></table></div>` : `<p class="small muted">Todavía no hiciste pagos.</p>`}</div>`;

    return pageHead('Suscripción', level ? 'Tu plan' : 'Elegí un plan', 'Pagás un plan mensual para estar publicada. Cuanto más alto el plan, más arriba aparecés y más herramientas para ganar tenés. Podés cambiarlo cuando quieras.')
      + current + plans + hist;
  }

  /* ---------- 7. Ingresos ---------- */
  function vIngresos() {
    const w = me().id, p = prof(); const E = HH.earningsOf(w);
    const tm = thisMonth(), pm = prevMonth();
    const cur = earnMonth(w, tm), prev = earnMonth(w, pm), total = HH.sum(E, x => HH.netOf(x)), fees = HH.sum(E, x => HH.feeOf(x));
    const months = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); const k = mkey(d); months.push({ key: k, label: MONTHS[d.getMonth()], v: HH.sum(E.filter(x => monthKey(x.createdAt) === k), x => HH.netOf(x)) }); }
    const max = Math.max(1, ...months.map(m => m.v));
    const bars = `<div class="bars" aria-label="Ingresos de los últimos 6 meses">${months.map(m => `<div class="bar ${m.key === tm ? 'cur' : ''}"><span>${m.v ? HH.money(m.v).replace('USD ', '') : '0'}</span><i style="height:${Math.max(3, Math.round(m.v / max * 86))}px"></i><b>${m.label}</b></div>`).join('')}</div>`;
    const types = Object.keys(PAY_TYPE).map(t => ({ t, ...PAY_TYPE[t], v: HH.sum(E.filter(x => x.type === t), x => HH.netOf(x)) }));
    const delta = prev ? Math.round((cur - prev) / prev * 100) : null;
    const last = E.slice(0, 20);
    const payout = p.payout && p.payout.method ? p.payout : null;
    const METHOD = { payoneer: 'Payoneer', paypal: 'PayPal', transfer: 'Transferencia internacional' };
    return pageHead('Ingresos', 'Lo que cobraste', 'Todo lo que te pagaron los clientes: contenido, packs, chat y pedidos, ya descontada la comisión de packs y pedidos si corresponde. Los planes y Stars no se descuentan de acá.', `<a class="btn secondary sm" href="#panel.ajustes" data-go="#panel.ajustes">${HH.icon('settings')} Configurar cobros</a>`)
      + `<div class="grid-3">
        ${stat('Este mes', HH.money(cur), delta === null ? (cur ? 'Primer mes con cobros' : 'Todavía sin cobros') : (delta >= 0 ? '+' : '') + delta + '% vs. el mes pasado', 'accent')}
        ${stat('Mes anterior', HH.money(prev), MONTHS[new Date(pm + '-15').getMonth()] + ' completo')}
        ${stat('Total', HH.money(total), `${E.length} ${HH.plural(E.length, 'cobro', 'cobros')}${fees ? ' · comisiones ' + HH.money(fees) : ''}`)}
      </div>`
      + `<div class="grid-2" style="align-items:start">
        <div class="card stack" style="gap:8px"><div class="row between"><span class="card-title">Últimos 6 meses</span><span class="tiny muted">en USD</span></div>${total ? bars : `<div class="empty" style="padding:24px 10px">${HH.icon('trending')}<h4>Todavía sin cobros</h4><p class="small">Cuando vendas tu primer contenido, lo vas a ver acá.</p></div>`}</div>
        <div class="card stack" style="gap:12px"><span class="card-title">De dónde viene</span>${types.map(x => { const pct = total ? Math.round(x.v / total * 100) : 0; return `<div class="stack" style="gap:5px"><div class="row between small"><span class="il">${HH.icon(x.icon)} ${x.label}</span><span class="num"><strong>${HH.money(x.v)}</strong> <span class="muted">· ${pct}%</span></span></div><div class="progress"><span style="width:${pct}%"></span></div></div>`; }).join('')}</div>
      </div>`
      + `<div class="notice info">${HH.icon('info')}<span><strong>Los cobros se liquidan cada semana.</strong> Método de pago: ${payout ? `${METHOD[payout.method] || payout.method}${payout.email ? ' · ' + HH.esc(payout.email) : ''}` : 'por definir (Payoneer, PayPal o transferencia internacional)'}. <a href="#panel.ajustes" data-go="#panel.ajustes">${payout ? 'Cambiar' : 'Configurar cobros'}</a></span></div>`
      + `<div class="card stack" style="gap:10px"><div class="row between"><span class="card-title">Últimos cobros</span><span class="tiny muted">${last.length ? `los últimos ${last.length}` : ''}</span></div>${last.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Cliente</th><th>Concepto</th><th class="num">Monto</th></tr></thead><tbody>${last.map(x => { const c = HH.userById(x.userId); return `<tr><td style="white-space:nowrap">${HH.fmtDate(x.createdAt)}</td><td style="white-space:nowrap">${HH.esc(c ? c.name : 'Cliente')}</td><td>${HH.esc(x.description)}</td><td class="num" style="white-space:nowrap">${HH.money(HH.netOf(x))}${HH.feeOf(x) ? `<div class="tiny muted">de ${HH.money(x.amountUsd)} · comisión ${x.feePct}%</div>` : ''}</td></tr>`; }).join('')}</tbody></table></div>` : `<p class="small muted">Todavía no tenés cobros registrados.</p>`}</div>`;
  }

  /* ---------- 8. Ajustes ---------- */
  function vAjustes() {
    const u = me(), p = prof();
    const notif = Object.assign({ messages: true, requests: true, sales: true, renewal: true }, p.notifications || {});
    const payout = p.payout || {};
    const V = { none: { badge: 'neutral', label: 'Sin verificar' }, pending: { badge: 'warn', label: 'En revisión' }, verified: { badge: 'ok', label: 'Verificada' }, rejected: { badge: 'danger', label: 'Rechazada' } }[p.verified] || { badge: 'neutral', label: 'Sin verificar' };
    const draft = p.verifyDraft || {}; const draftSteps = ['docFront', 'selfie', 'video'].filter(k => draft[k]).length;
    const verifyBody = p.verified === 'verified' ? `<div class="notice ok">${HH.icon('verified')}<span>Tu identidad está verificada. Los clientes ven la insignia en tu perfil.</span></div>`
      : p.verified === 'pending' ? `<div class="notice info">${HH.icon('clock')}<span>Recibimos tu documento, tu selfie y tu video. Los revisamos en menos de 24 h y te avisamos por email.</span></div>`
        : `${p.verified === 'rejected' ? `<div class="notice warn">${HH.icon('alert')}<span>No pudimos validar tu verificación${p.verifyNote ? ': ' + HH.esc(p.verifyNote) : ''}. Volvé a hacerla con buena luz y el documento completo a la vista.</span></div>` : `<p class="small muted">Documento, selfie y un video corto. Es una sola vez y lleva unos minutos.</p>`}
        <div><button class="btn" data-go="#panel.verificacion">${HH.icon('shield')} ${draftSteps ? 'Continuar verificación (' + draftSteps + ' de 3)' : 'Verificar mi identidad'}</button></div>`;
    const status = p.status === 'suspended' ? 'suspended' : p.status === 'active' ? 'active' : 'pending';
    return pageHead('Ajustes', 'Tu cuenta', 'Datos de acceso, verificación, cobros y visibilidad.')
      + `<div class="settings-grid">
      <form class="card stack" style="gap:12px" data-submit="dashSaveAccount">
        <div><div class="card-title">Cuenta</div><div class="small muted">Miembro desde ${HH.fmtDate(u.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}</div></div>
        <div class="field"><label for="acName">Nombre completo</label><input class="input" id="acName" name="name" value="${HH.esc(u.name)}" required autocomplete="name"></div>
        <div class="field"><label for="acEmail">Email</label><input class="input" id="acEmail" name="email" type="email" value="${HH.esc(u.email)}" required autocomplete="email"></div>
        <div><button class="btn secondary" type="submit">Guardar cambios</button></div>
      </form>
      <form class="card stack" style="gap:12px" data-submit="dashChangePassword">
        <div class="card-title">Contraseña</div>
        <div class="field"><label for="pwCur">Contraseña actual</label><input class="input" id="pwCur" name="current" type="password" autocomplete="current-password" required></div>
        <div class="grid-2">
          <div class="field"><label for="pwNew">Nueva</label><input class="input" id="pwNew" name="next" type="password" autocomplete="new-password" minlength="8" required></div>
          <div class="field"><label for="pwNew2">Confirmar</label><input class="input" id="pwNew2" name="confirm" type="password" autocomplete="new-password" minlength="8" required></div>
        </div>
        <div class="row between"><span class="hint">Mínimo 8 caracteres.</span><button class="btn secondary" type="submit">Cambiar contraseña</button></div>
      </form>
      <div class="card stack" style="gap:12px">
        <div class="row between"><span class="card-title">Verificación de identidad</span><span class="badge ${V.badge}">${p.verified === 'verified' ? HH.icon('verified') : ''} ${V.label}</span></div>
        ${verifyBody}
      </div>
      <div class="card stack" style="gap:12px">
        <div class="card-title">Verificaciones</div>
        <div class="dash-req-list">${HH.requirementsOf(p).items.filter(it => it.key === 'email' || it.key === 'whatsapp').map(it => it.done ? `<div class="dash-req done"><span class="box">${HH.icon('check')}</span><span class="grow"><span class="t">${it.label.replace('Verificar', '')} verificado</span><span class="h">${HH.esc(it.key === 'email' ? u.email : p.whatsapp)}</span></span></div>` : `<button type="button" class="dash-req" data-action="verifyContact" data-kind="${it.kind}"><span class="box"></span><span class="grow"><span class="t">${it.label}</span><span class="h">${it.hint}</span></span>${HH.icon('chevronRight')}</button>`).join('')}</div>
      </div>
      <div class="card stack" style="gap:12px">
        <div class="row between"><span class="card-title">Passkey</span><span class="badge ${(u.passkeys || []).length ? 'ok' : 'neutral'}">${(u.passkeys || []).length ? (u.passkeys.length + ' ' + HH.plural(u.passkeys.length, 'activa', 'activas')) : 'Sin passkey'}</span></div>
        <p class="small muted">Entrá con tu huella, tu cara o el bloqueo de pantalla, sin escribir la contraseña.</p>
        ${HH.passkeySupported() ? '' : `<div class="notice info">${HH.icon('info')}<span>Las passkeys necesitan el sitio en https o localhost.</span></div>`}
        <div class="row"><button type="button" class="btn secondary sm" data-action="dashPasskeyCreate"${HH.passkeySupported() ? '' : ' disabled'}>${HH.icon('key')} ${(u.passkeys || []).length ? 'Agregar otra passkey' : 'Crear passkey'}</button>${(u.passkeys || []).length ? `<button type="button" class="btn ghost sm" data-action="dashPasskeyClear">Quitar passkeys</button>` : ''}</div>
      </div>
      <form class="card stack" style="gap:12px" data-submit="dashSavePayout">
        <div><div class="card-title">Cobros</div><div class="small muted">Adónde te transferimos lo que vendés. Se liquida cada semana.</div></div>
        <div class="field"><label for="poMethod">Método preferido</label><select class="select" id="poMethod" name="method"><option value="">Elegí uno</option><option value="payoneer" ${payout.method === 'payoneer' ? 'selected' : ''}>Payoneer</option><option value="paypal" ${payout.method === 'paypal' ? 'selected' : ''}>PayPal</option><option value="transfer" ${payout.method === 'transfer' ? 'selected' : ''}>Transferencia internacional</option></select></div>
        <div class="field"><label for="poEmail">Email de cobro</label><input class="input" id="poEmail" name="email" type="email" value="${HH.esc(payout.email || '')}" placeholder="tu@email.com"><span class="hint">La cuenta de Payoneer o PayPal, o el contacto para coordinar la transferencia.</span></div>
        <div><button class="btn secondary" type="submit">Guardar cobros</button></div>
      </form>
      <div class="card stack" style="gap:4px">
        <div class="card-title" style="margin-bottom:4px">Notificaciones</div>
        ${NOTIF.map(x => `<div class="switch-row"><div><div class="t">${x.t}</div><div class="s">${x.s}</div></div><button type="button" class="switch" role="switch" aria-checked="${!!notif[x.k]}" data-action="dashToggleNotif" data-k="${x.k}" aria-label="${x.t}"></button></div>`).join('')}
      </div>
      <div class="card stack" style="gap:12px" id="dashVisibility">
        <div class="card-title">Visibilidad</div>
        <div class="switch-row" style="border:0;padding:0"><div><div class="t">Ocultar mi cuenta</div><div class="s">${p.hidden ? 'Tu cuenta está oculta: nadie la ve en el sitio.' : 'No aparecés en el inicio, el swipe, Cerca de mí, Stars, historias ni shorts, y tu perfil no abre por link. Conservás contenido, mensajes, ventas y plan.'}</div></div><button type="button" class="switch" role="switch" aria-checked="${!!p.hidden}" data-action="dashToggleVisibility" aria-label="Ocultar mi cuenta"></button></div>
        ${p.hidden ? `<div class="notice warn">${HH.icon('eye')}<span>Oculta desde el ${HH.fmtDate(p.hiddenAt || HH.now())}. Tu plan sigue corriendo; volvé a mostrarte cuando quieras.</span></div>` : ''}
        ${p.status === 'suspended' ? `<div class="notice warn">${HH.icon('alert')}<span>Tu perfil está suspendido por administración. Escribinos a ayuda para revisarlo.</span></div>` : ''}
      </div>
      <div class="card row between">
        <div><div class="card-title">Sesión</div><div class="small muted">${HH.esc(u.email)}</div></div>
        <button class="btn danger" data-action="dashLogout">${HH.icon('logout')} Cerrar sesión</button>
      </div>
    </div>`;
  }

  /* ---------- Rutas ---------- */
  // Fallback de `inicio` SOLO para el build aislado (HH_ONLY): en el build completo views-public.js
  // registra `inicio` antes y gana, porque el router toma la primera ruta que coincide.
  HH.route('inicio', () => {
    const u = HH.me();
    if (u && u.role === 'worker') { HH.go('#panel'); return false; }
    return `<div class="container narrow section"><div class="card stack" style="gap:12px"><div class="eyebrow">Modo aislado del panel</div><h3>Entrá con una cuenta demo</h3><p class="small muted">Este build no incluye las vistas públicas. Elegí una acompañante para abrir su panel.</p><div class="row"><button class="btn" data-action="dashDemoLogin" data-id="u_vale">Valentina (plan A, Star)</button><button class="btn secondary" data-action="dashDemoLogin" data-id="u_juli">Julieta (plan C, nueva)</button></div></div></div>`;
  });
  /* ---------- Estadísticas ---------- */
  function vEstadisticas() {
    if (HH.statsEnsureDemo) HH.statsEnsureDemo();
    const u = me(), p = prof();
    const head = pageHead('Estadísticas', 'Cómo te encuentran', 'Cuántas veces aparecés, cuántos entran a tu perfil y cuántos te escriben. Solo lo ves vos.');
    if (!HH.planFeat(u.id, 'stats')) {
      const t = HH.statsSummary(p, 30).cur;
      return head + `<div class="card stack st-lock" style="gap:12px">
        <div class="row nowrap" style="gap:12px;align-items:flex-start"><span class="ag-optin-ic">${HH.icon('trending')}</span><div><h3 style="margin:0 0 4px">Estadísticas completas desde el plan Diamante</h3><p class="small muted" style="margin:0">En los últimos 30 días tu perfil tuvo <strong>${t.views.toLocaleString(HH.loc())}</strong> visitas. Con Diamante o Star ves de dónde llegan, cuántos te escriben por WhatsApp, tus mejores días y tu contenido más visto.</p></div></div>
        <a class="btn" href="#panel.suscripcion" data-go="#panel.suscripcion" style="justify-self:start">${HH.icon('card')} Ver planes</a></div>`;
    }
    const days = [7, 30, 90].includes(Number(HH.ui.stDays)) ? Number(HH.ui.stDays) : 30;
    const { cur, prev, series, byWeekday } = HH.statsSummary(p, days);
    const fmt = (n) => Math.round(n).toLocaleString(HH.loc());
    const delta = (a, b) => { if (!b) return a ? '<span class="st-d up">nuevo</span>' : ''; const d = Math.round((a - b) / b * 100); return `<span class="st-d ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d}%</span>`; };
    const contacts = cur.wa + cur.tg, contactsPrev = prev.wa + prev.tg;
    const kpi = (label, v, pv, hint) => `<div class="stat st-k"><span class="k">${label}</span><span class="v">${fmt(v)}</span><span class="d">${delta(v, pv)} <span class="muted">vs. ${days} días anteriores</span></span>${hint ? `<span class="tiny muted">${hint}</span>` : ''}</div>`;
    // Gráfico: visitas por día (barras) y contactos (puntos)
    const W = 720, H = 180, pad = 26, n = series.length, bw = (W - pad * 2) / n;
    const max = Math.max(1, ...series.map(x => x.views));
    const y = (v) => H - 22 - (v / max) * (H - 40);
    const bars = series.map((x, i) => `<rect x="${(pad + i * bw + bw * 0.15).toFixed(1)}" y="${y(x.views).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${(H - 22 - y(x.views)).toFixed(1)}" rx="2" class="st-bar"><title>${HH.fmtDay(x.ymd)}: ${x.views} visitas · ${x.wa} contactos</title></rect>`).join('');
    const line = series.map((x, i) => `${(pad + i * bw + bw / 2).toFixed(1)},${y(x.wa).toFixed(1)}`).join(' ');
    const ticks = [0, Math.floor((n - 1) / 2), n - 1].map(i => `<text x="${(pad + i * bw + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="st-t">${HH.fmtDay(series[i].ymd)}</text>`).join('');
    const chart = `<svg viewBox="0 0 ${W} ${H}" class="st-chart" role="img" aria-label="Visitas y contactos por día"><text x="${pad}" y="12" class="st-t">máx. ${max} visitas por día</text>${bars}<polyline points="${line}" class="st-line"/>${ticks}</svg>`;
    // Embudo
    const steps = [['Apariciones en listados', cur.imp], ['Visitas al perfil', cur.views], ['Me interesa', cur.interest], ['Contactos (WhatsApp y Telegram)', contacts]];
    const funnel = steps.map(([l, v], i) => { const pct = steps[0][1] ? Math.max(2, Math.round(v / steps[0][1] * 100)) : 0; const conv = i ? (steps[i - 1][1] ? Math.round(v / steps[i - 1][1] * 100) + '% del paso anterior' : '') : ''; return `<div class="st-f"><div class="row between small"><span>${l}</span><span><strong>${fmt(v)}</strong>${conv ? ` <span class="muted">· ${conv}</span>` : ''}</span></div><div class="progress"><span style="width:${pct}%"></span></div></div>`; }).join('');
    // Fuentes
    const srcTotal = Object.values(cur.src).reduce((a, x) => a + x, 0) || 1;
    const srcs = Object.entries(HH.STATS_SOURCES).map(([k, l]) => ({ l, v: cur.src[k] || 0 })).sort((a, b) => b.v - a.v);
    const srcHtml = srcs.map(x => `<div class="st-f"><div class="row between small"><span>${x.l}</span><span><strong>${fmt(x.v)}</strong> <span class="muted">· ${Math.round(x.v / srcTotal * 100)}%</span></span></div><div class="progress"><span style="width:${Math.round(x.v / srcTotal * 100)}%"></span></div></div>`).join('');
    // Mejores días
    const WD = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const wdMax = Math.max(1, ...byWeekday);
    const best = byWeekday.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v).slice(0, 2).map(x => WD[x.i].toLowerCase());
    const wdHtml = `<div class="st-wd">${[1, 2, 3, 4, 5, 6, 0].map(i => `<div class="st-wdc"><i style="height:${Math.max(4, Math.round(byWeekday[i] / wdMax * 70))}px"></i><span class="tiny muted">${WD[i].slice(0, 3)}</span></div>`).join('')}</div>`;
    // Contenido más visto
    const top = HH.contentOf(u.id).slice().sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
    const topHtml = top.length ? `<div class="list">${top.map(c => `<div class="list-item"><div style="width:44px;flex:none">${HH.contentThumb(c, { cls: 'square', noLock: true, noTag: true })}</div><div class="grow" style="min-width:0"><div class="title ellipsis"><span data-noi18n>${HH.esc(c.title)}</span></div><div class="sub">${c.type === 'photo' ? 'Foto' : c.type === 'short' ? 'Short' : 'Video'}${c.isPremium ? ' · premium' : ''}</div></div><span class="num small"><strong>${fmt(c.views || 0)}</strong> <span class="muted">vistas</span></span></div>`).join('')}</div>` : '<p class="small muted">Todavía no publicaste contenido.</p>';
    const periods = [7, 30, 90].map(d => `<button type="button" class="chip${d === days ? ' active' : ''}" data-action="dashStDays" data-d="${d}">${d} días</button>`).join('');
    return head + `<div class="chips" style="margin-bottom:12px">${periods}</div>
      <div class="grid-4 st-kpis">${kpi('Apariciones', cur.imp, prev.imp, 'Veces que tu tarjeta apareció en un listado')}${kpi('Visitas al perfil', cur.views, prev.views)}${kpi('Me interesa', cur.interest, prev.interest)}${kpi('Contactos', contacts, contactsPrev, `WhatsApp ${fmt(cur.wa)} · Telegram ${fmt(cur.tg)}`)}</div>
      <div class="card stack" style="gap:8px;margin-top:16px"><div class="row between"><span class="card-title">Visitas por día</span><span class="tiny muted st-leg"><i class="b"></i> visitas <i class="l"></i> contactos</span></div>${chart}</div>
      <div class="grid-2" style="align-items:start;margin-top:16px">
        <div class="card stack" style="gap:12px"><span class="card-title">De visita a contacto</span>${funnel}<p class="tiny muted" style="margin:0">Además: ${fmt(cur.opens)} fotos y videos abiertos · ${fmt(cur.shares)} veces compartido.</p></div>
        <div class="card stack" style="gap:12px"><span class="card-title">De dónde llegan</span>${srcHtml}</div>
        <div class="card stack" style="gap:10px"><span class="card-title">Tus mejores días</span>${wdHtml}<p class="small" style="margin:0">Más visitas los <strong>${best.join(' y ')}</strong>. Buen momento para subir una historia.</p></div>
        <div class="card stack" style="gap:10px"><span class="card-title">Tu contenido más visto</span>${topHtml}</div>
      </div>`;
  }
  /* ---------- Agenda / reservas ---------- */
  function bookingRow(b) {
    const c = HH.userById(b.clientId) || { name: 'Cliente' }; const stt = HH.BOOKING_STATUS[b.status] || { label: b.status, cls: '' };
    const past = HH.bookingAt(b) < new Date();
    let acts = '';
    if (b.status === 'solicitada' && !past) acts = `<button class="btn ok sm" data-action="dashBkConfirm" data-id="${b.id}">${HH.icon('check')} Seña recibida · confirmar</button><button class="btn ghost sm" data-action="dashBkReject" data-id="${b.id}">Rechazar</button>`;
    else if (b.status === 'confirmada' && !past) acts = `<button class="btn ghost sm" data-action="dashBkCancel" data-id="${b.id}">Cancelar</button>`;
    else if (b.status === 'confirmada' && past) acts = `<button class="btn secondary sm" data-action="dashBkDone" data-id="${b.id}">${HH.icon('check')} Marcar realizada</button>`;
    return `<article class="card stack bk-row" style="gap:8px" data-bk-row="${b.id}">
      <div class="row between" style="align-items:flex-start;gap:8px"><div class="row nowrap" style="gap:10px;min-width:0">${HH.userAvatar(c, 38)}<div style="min-width:0"><div style="font-weight:800" class="ellipsis">${HH.esc(c.name)}</div><div class="small muted">${HH.esc(HH.activity(b.activity).label)} · ${HH.esc(HH.fmtBooking(b))}</div></div></div><span class="badge ${stt.cls}">${stt.label}</span></div>
      <div class="small">${HH.icon('pin')} <span data-noi18n>${HH.esc(b.place)}</span></div>
      ${b.note ? `<div class="small muted">"<span data-noi18n>${HH.esc(b.note)}</span>"</div>` : ''}
      <div class="small">Seña: <strong>${HH.money(b.depositUsd)}</strong> <span class="muted">· por tu link de pago</span></div>
      ${acts ? `<div class="row" style="gap:8px">${acts}</div>` : ''}
    </article>`;
  }
  // Calendario semanal: horario hábil, no hábil, reservas y bloqueos (ocupado / bloqueado)
  function agendaCal(p) {
    const c = HH.bookingCfg(p); const off = Math.max(0, Number(HH.ui.agWeek) || 0); const toMin = HH.toMin;
    const days = Array.from({ length: 7 }, (_, i) => HH.localDay(HH.daysFromNow(off * 7 + i)));
    let minH = 9, maxH = 21;
    Object.values(c.availability).forEach(r => (r || []).forEach(x => { minH = Math.min(minH, Math.floor(toMin(x.from) / 60)); maxH = Math.max(maxH, Math.ceil(toMin(x.to) / 60)); }));
    days.forEach(ymd => { HH.bookingsOf(p.userId).filter(b => b.date === ymd && ['solicitada', 'confirmada'].includes(b.status)).forEach(b => { minH = Math.min(minH, Math.floor(toMin(b.start) / 60)); maxH = Math.max(maxH, Math.ceil((toMin(b.start) + b.hours * 60) / 60)); });
      HH.blocksOn(p, ymd).filter(x => !x.allDay).forEach(x => { minH = Math.min(minH, Math.floor(toMin(x.from) / 60)); maxH = Math.max(maxH, Math.ceil(toMin(x.to) / 60)); }); });
    minH = Math.max(0, minH); maxH = Math.min(24, Math.max(maxH, minH + 4));
    const span = (maxH - minH) * 60; const top = (m) => Math.max(0, Math.min(100, (m - minH * 60) / span * 100));
    const box = (from, to) => `top:${top(from).toFixed(2)}%;height:${(top(to) - top(from)).toFixed(2)}%`;
    const hours = Array.from({ length: maxH - minH }, (_, i) => minH + i);
    const today = HH.localDay();
    const col = (ymd) => {
      const d = HH.ymdDate(ymd); const av = c.availability[d.getDay()] || [];
      const free = av.map(r => `<div class="ag-free" style="${box(toMin(r.from), toMin(r.to))}"></div>`).join('');
      const bks = HH.bookingsOf(p.userId).filter(b => b.date === ymd && ['solicitada', 'confirmada'].includes(b.status)).map(b => { const cl = HH.userById(b.clientId) || { name: 'Cliente' }; const s0 = toMin(b.start);
        return `<button type="button" class="ag-ev ${b.status === 'confirmada' ? 'conf' : 'req'}" style="${box(s0, s0 + b.hours * 60)}" data-action="dashAgBooking" data-id="${b.id}" title="${HH.esc(cl.name)} · ${HH.esc(HH.fmtBooking(b))}"><strong>${b.status === 'confirmada' ? 'Reserva' : 'Solicitud'}</strong><span>${b.start}–${HH.bookingEnd(b)} · ${HH.esc(cl.name.split(' ')[0])}</span></button>`; }).join('');
      const blks = HH.blocksOn(p, ymd).map(x => { const k = HH.BLOCK_KINDS[x.kind] || HH.BLOCK_KINDS.bloqueado;
        return `<button type="button" class="ag-ev ${k.cls}" style="${box(x.allDay ? minH * 60 : toMin(x.from), x.allDay ? maxH * 60 : toMin(x.to))}" data-action="dashAgBlock" data-id="${x.id}" title="${k.label}${x.note ? ' · ' + HH.esc(x.note) : ''}"><strong>${k.label}</strong><span>${x.allDay ? 'Todo el día' : x.from + '–' + x.to}${x.note ? ' · ' + HH.esc(x.note) : ''}</span></button>`; }).join('');
      return `<div class="ag-day${ymd === today ? ' today' : ''}"><div class="ag-dh"><span>${d.toLocaleDateString(HH.loc(), { weekday: 'short' })}</span><strong>${d.getDate()}</strong></div><div class="ag-col" data-action="dashAgSlot" data-date="${ymd}" data-min="${minH * 60}" data-max="${maxH * 60}" style="height:${hours.length * 34}px">${hours.map(() => '<i></i>').join('')}${free}${bks}${blks}</div></div>`;
    };
    const range = `${HH.fmtDay(days[0])} al ${HH.fmtDay(days[6])}`;
    return `<div class="card stack ag" style="gap:12px">
      <div class="row between" style="gap:10px"><div><div class="card-title">Tu semana</div><div class="small muted">${range}. Tocá un horario para marcarlo como ocupado o bloqueado.</div></div>
        <div class="row nowrap" style="gap:6px"><button class="icon-btn sm" data-action="dashAgWeek" data-d="-1" aria-label="Semana anterior"${off ? '' : ' disabled'}>${HH.icon('chevronLeft')}</button><button class="icon-btn sm" data-action="dashAgWeek" data-d="1" aria-label="Semana siguiente"${off >= 3 ? ' disabled' : ''}>${HH.icon('chevronRight')}</button><button class="btn sm" data-action="dashAgSlot">${HH.icon('plus')} Bloquear horario</button></div></div>
      <div class="ag-scroll"><div class="ag-grid"><div class="ag-hours"><div class="ag-dh"></div><div style="height:${hours.length * 34}px">${hours.map(h => `<span>${String(h).padStart(2, '0')}:00</span>`).join('')}</div></div>${days.map(col).join('')}</div></div>
      <div class="ag-legend tiny"><span><i class="lg-free"></i>Horario hábil</span><span><i class="lg-off"></i>No hábil</span><span><i class="lg-req"></i>Solicitud</span><span><i class="lg-conf"></i>Reserva confirmada</span><span><i class="lg-busy"></i>Ocupado</span><span><i class="lg-blocked"></i>Bloqueado</span></div>
      <div class="tiny muted">Los clientes solo ven horarios libres: no ven reservas de otros, ni si estás ocupada o bloqueada.</div>
    </div>`;
  }
  function vAgenda() {
    const p = prof(); const c = HH.bookingCfg(p); const st = HH.bookingSettings(); const me = HH.me();
    const head = pageHead('Agenda', 'Reservas de salidas', `Los clientes eligen día, horario y actividad según tu disponibilidad, y te pagan la seña con tu propio link de pago. SexyRose no cobra ni retiene la seña.`);
    if (!HH.bookingPlanOk(me.id)) return head + `<div class="card"><div class="empty">${HH.icon('calendar')}<h4>Agenda disponible desde el plan Oro</h4><p class="small">Con la agenda los clientes reservan salidas en tus horarios libres y te pagan la seña por adelantado.</p><a class="btn" href="#panel.suscripcion" data-go="#panel.suscripcion">${HH.icon('card')} Ver planes</a></div></div>`;
    // Primero decide si usa la agenda o no
    if (!c.enabled) return head + `<div class="card stack ag-optin" style="gap:14px">
        <div class="row nowrap" style="gap:12px;align-items:flex-start"><span class="ag-optin-ic">${HH.icon('calendar')}</span><div><h3 style="margin:0 0 4px">¿Vas a usar la agenda?</h3><p class="small muted" style="margin:0">Es opcional. Si no la usás, los clientes te siguen contactando como hasta ahora.</p></div></div>
        <ul class="ag-optin-list small">
          <li>${HH.icon('check')}<span>Marcás tu horario hábil; el resto queda como no hábil.</span></li>
          <li>${HH.icon('check')}<span>Los clientes reservan solo en tus horarios libres y te pagan la seña con tu link.</span></li>
          <li>${HH.icon('check')}<span>Marcás como <strong>ocupado</strong> lo que coordinaste por fuera y <strong>bloqueás</strong> los horarios personales.</span></li>
          <li>${HH.icon('check')}<span>Si querés, te avisamos cada solicitud por WhatsApp y respondés desde ahí.</span></li>
        </ul>
        ${c.declined ? `<div class="notice">${HH.icon('info')}<span>Elegiste no usar la agenda. Podés activarla cuando quieras.</span></div>` : ''}
        <div class="row" style="gap:8px"><button class="btn" data-action="dashAgendaOn">${HH.icon('check')} Sí, usar la agenda</button>${c.declined ? '' : `<button class="btn ghost" data-action="dashAgendaOff">No por ahora</button>`}</div>
      </div>`;
    const issues = HH.bookingIssues(p).filter(x => x !== 'plan' && x !== 'activar');
    const label = { tarifa: 'cargá tu tarifa orientativa por hora en Mi perfil', link: 'pegá tu link de pago', horarios: 'marcá tu horario hábil (al menos un día)' };
    const notice = issues.length ? `<div class="notice warn">${HH.icon('alert')}<span>Para recibir reservas: ${issues.map(i => label[i]).join(', ')}.</span></div>` : `<div class="notice ok">${HH.icon('checkCircle')}<span>Tu perfil muestra el botón <strong>Reservar salida</strong>.</span></div>`;
    const hm = (i) => String(Math.floor(i / 2)).padStart(2, '0') + ':' + (i % 2 ? '30' : '00');
    const timeSel = (name, val, a, b, lbl) => `<select class="select sm" name="${name}" aria-label="${lbl}">${Array.from({ length: b - a + 1 }, (_, k) => hm(a + k)).map(t => `<option${t === val ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
    const dayRow = (w) => { const r = (c.availability[w.k] || [])[0]; return `<div class="bk-wk"><label class="row nowrap" style="gap:8px"><input type="checkbox" name="d${w.k}" value="1"${r ? ' checked' : ''}><span>${w.l}</span></label>${timeSel('f' + w.k, r ? r.from : '10:00', 12, 47, w.l + ' desde')}<span class="small muted">a</span>${timeSel('t' + w.k, r ? r.to : '18:00', 13, 48, w.l + ' hasta')}</div>`; };
    const ex = p.rateFrom > 0 ? `1 h → ${HH.money(HH.depositFor(p, 1))} · 2 h → ${HH.money(HH.depositFor(p, 2))}` : 'sin tarifa cargada';
    const cfg = `<form class="card stack" data-submit="dashBookingSave" id="dashBkForm">
      <div class="card-title">Configuración</div>
      <div class="field"><span class="label">Horario hábil</span><span class="hint" style="margin:-2px 0 6px">Fuera de estos horarios la agenda queda como no hábil y no se puede reservar.</span><div class="bk-week">${HH.WEEKDAYS.map(dayRow).join('')}</div></div>
      <div class="field"><label for="bkPay">Tu link de pago</label><input class="input" id="bkPay" name="payLink" type="url" inputmode="url" value="${HH.esc(c.payLink || '')}" placeholder="https://link.mercadopago.com.ar/tu-usuario"><span class="hint">Mercado Pago, PayPal, Stripe u otro. Tiene que empezar con https://. No publiques CBU ni alias en historias.</span></div>
      <div class="bk-dep"><div class="grow"><div class="small muted">Seña: ${st.depositPct}% de tu tarifa (${p.rateFrom > 0 ? HH.money(p.rateFrom) + '/h' : 'sin tarifa'}) × duración</div><div style="font-weight:800">${ex}</div></div><a class="btn ghost sm" href="#panel.perfil" data-go="#panel.perfil">Cambiar tarifa</a></div>
      <div class="field"><label for="bkNotice">Anticipación mínima</label><select class="select" id="bkNotice" name="minNoticeHours">${[2, 6, 12, 24, 48].map(h => `<option value="${h}"${Number(c.minNoticeHours) === h ? ' selected' : ''}>${h} horas</option>`).join('')}</select></div>
      ${HH.waAgendaField ? HH.waAgendaField(p) : ''}
      <div class="row between" style="gap:8px"><button class="btn ghost sm" type="button" data-action="dashAgendaStop">Dejar de usar la agenda</button><button class="btn" type="submit">${HH.icon('check')} Guardar agenda</button></div>
    </form>`;
    const all = HH.bookingsOf(p.userId).slice().sort((a, b) => HH.bookingAt(a) - HH.bookingAt(b)); const now = new Date();
    const req = all.filter(b => b.status === 'solicitada' && HH.bookingAt(b) > now);
    const up = all.filter(b => b.status === 'confirmada');
    const hist = all.filter(b => !req.includes(b) && !up.includes(b)).reverse();
    const sec = (t, list, empty) => `<div class="stack" style="gap:10px"><div class="card-title">${t}${list.length ? ` <span class="muted num">${list.length}</span>` : ''}</div>${list.length ? list.map(bookingRow).join('') : `<div class="small muted">${empty}</div>`}</div>`;
    return head + notice + agendaCal(p) + `<div class="dash-cols" style="margin-top:18px"><div class="stack" style="gap:18px">${sec('Solicitudes · esperando seña', req, 'No hay solicitudes nuevas.')}${sec('Próximas salidas', up, 'Todavía no hay salidas confirmadas.')}${hist.length ? sec('Historial', hist.slice(0, 10), '') : ''}</div><div>${cfg}</div></div>`;
  }
  /* ---------- Viajes ---------- */
  function vViajes() {
    const p = prof(); const t = HH.localDay();
    const trips = HH.tripsOf(p);
    const cur = trips.filter(tr => tr.from <= t && tr.to >= t), next = trips.filter(tr => tr.from > t), past = trips.filter(tr => tr.to < t).reverse();
    const row = (tr, state) => `<div class="list-item">${HH.icon(state === 'now' ? 'pin' : state === 'next' ? 'calendar' : 'clock')}<div class="grow"><div class="title">${HH.esc(tr.city)}${tr.country ? ', ' + HH.esc(tr.country) : ''}</div><div class="sub">Del ${HH.fmtDay(tr.from)} al ${HH.fmtDay(tr.to)} · ${Math.round((new Date(tr.to) - new Date(tr.from)) / 864e5) + 1} días${state === 'next' ? ` · aparecés en ${HH.esc(tr.city)} desde el ${HH.fmtDay(HH.localDay(new Date(new Date(tr.from + 'T12:00').getTime() - HH.TRIP_PREVIEW_DAYS * 864e5)))}` : ''}</div></div>${state === 'now' ? '<span class="badge info">Ahora</span>' : ''}${state !== 'past' ? `<button class="icon-btn sm" data-action="dashTripDelete" data-id="${tr.id}" aria-label="Cancelar viaje">${HH.icon('trash')}</button>` : ''}</div>`;
    return pageHead('Viajes', 'Tus próximos destinos', 'Si viajás, seguí trabajando: aparecés en los listados del destino ' + HH.TRIP_PREVIEW_DAYS + ' días antes de llegar y tu ubicación cambia sola durante el viaje.', `<button class="btn" data-action="dashTripOpen">${HH.icon('plus')} Programar destino</button>`)
      + (cur.length ? `<div class="notice info">${HH.icon('globe')}<span>Estás de visita en <strong>${HH.esc(cur[0].city)}</strong> hasta el ${HH.fmtDay(cur[0].to)}. Los clientes de ahí te ven primero. Después volvés a ${HH.esc(p.homeCity || 'tu ciudad')}.</span></div>` : '')
      + (trips.length ? `<div class="card stack" style="gap:10px">
          ${cur.length ? `<div class="card-title">Ahora</div><div class="list">${cur.map(tr => row(tr, 'now')).join('')}</div>` : ''}
          ${next.length ? `<div class="card-title">Próximos</div><div class="list">${next.map(tr => row(tr, 'next')).join('')}</div>` : ''}
          ${past.length ? `<div class="card-title muted">Anteriores</div><div class="list">${past.slice(0, 5).map(tr => row(tr, 'past')).join('')}</div>` : ''}
        </div>` : `<div class="card"><div class="empty">${HH.icon('globe')}<h4>No tenés viajes programados</h4><p class="small">Cargá desde cuándo y hasta cuándo vas a estar en otra ciudad. Mientras tanto, tu perfil aparece en esa ciudad.</p><button class="btn" data-action="dashTripOpen">${HH.icon('plus')} Programar destino</button></div></div>`)
      + `<div class="notice">${HH.icon('shield')}<span>Los clientes ven la ciudad y las fechas, nunca dónde te alojás. Las salidas siguen siendo en lugares públicos.</span></div>`;
  }
  /* ---------- Verificación de identidad: asistente en pasos ---------- */
  const VF_STEPS = ['intro', 'documento', 'selfie', 'video', 'enviar'];
  function vVerificacion() {
    const p = prof(); const d = p.verifyDraft || (p.verifyDraft = {});
    if (p.verified === 'verified' || p.verified === 'pending') return pageHead('Verificación', 'Verificar identidad', '') + `<div class="card">${p.verified === 'verified' ? `<div class="notice ok">${HH.icon('verified')}<span>Tu identidad ya está verificada.</span></div>` : `<div class="notice info">${HH.icon('clock')}<span>Ya recibimos tu verificación. La revisamos en menos de 24 h.</span></div>`}<div style="margin-top:12px"><button class="btn secondary" data-go="#panel">Volver al resumen</button></div></div>`;
    const step = VF_STEPS.includes(S.vfStep) ? S.vfStep : (d.docFront || d.selfie || d.video ? (!d.docFront || (d.docType !== 'pasaporte' && !d.docBack) ? 'documento' : !d.selfie ? 'selfie' : !d.video ? 'video' : 'enviar') : 'intro');
    S.vfStep = step; const n = VF_STEPS.indexOf(step);
    const bar = `<div class="vf-bar">${['Documento', 'Selfie', 'Video', 'Enviar'].map((l, k) => `<span class="${k + 1 < n ? 'done' : k + 1 === n ? 'cur' : ''}"><i></i>${l}</span>`).join('')}</div>`;
    const zone = (key, title, sub, accept, capture, icon) => { const v = d[key]; const isVid = key === 'video';
      return `<label class="dropzone vf-zone ${v ? 'has' : ''}" for="vf_${key}">${v ? (isVid ? (v.src ? `<video src="${v.src}" muted playsinline controls style="max-height:220px;margin:0 auto 8px;border-radius:14px"></video>` : `${HH.icon('video')}<div class="tiny">${HH.esc(v.name)} · ${v.seconds ? v.seconds + ' s' : ''}</div>`) : `<img src="${v}" alt="" style="max-height:220px;margin:0 auto 8px;border-radius:14px">`) : HH.icon(icon)}<div style="font-weight:700">${title}</div><div class="tiny">${v ? 'Listo · tocá para cambiar' : sub}</div></label><input type="file" id="vf_${key}" class="sr-only" accept="${accept}"${capture ? ` capture="${capture}"` : ''} data-change="dashVfFile" data-k="${key}">`; };
    const nav = (back, next, nextLabel, ok) => `<div class="row between" style="margin-top:6px">${back ? `<button class="btn ghost" data-action="dashVfGo" data-step="${back}">${HH.icon('chevronLeft')} Atrás</button>` : '<span></span>'}<button class="btn" data-action="dashVfGo" data-step="${next}"${ok ? '' : ' disabled'}>${nextLabel} ${HH.icon('chevronRight')}</button></div>`;
    let body = '';
    if (step === 'intro') body = `
      <div class="vf-hero">${HH.icon('shield')}</div>
      <h3>Verificá tu identidad</h3><p class="small muted">Necesitamos confirmar que sos vos y que sos mayor de edad. Es una sola vez y lleva unos minutos.</p>
      <div class="label" style="margin-top:4px">Qué vas a necesitar</div>
      <div class="list">
        <div class="list-item">${HH.icon('card')}<div class="grow"><div class="title">Tu documento</div><div class="sub">DNI, cédula o pasaporte vigente.</div></div></div>
        <div class="list-item">${HH.icon('sun')}<div class="grow"><div class="title">Un lugar con buena luz</div><div class="sub">Vas a sacarte una selfie y grabar un video corto.</div></div></div>
        <div class="list-item">${HH.icon('clock')}<div class="grow"><div class="title">Unos minutos</div><div class="sub">Si lo dejás a mitad, retomás desde donde quedaste.</div></div></div>
      </div>
      <div class="notice info">${HH.icon('lock')}<span>Tus documentos se guardan cifrados y solo los ve el equipo de verificación. Nunca aparecen en tu perfil.</span></div>
      ${nav(null, 'documento', 'Empezar', true)}`;
    if (step === 'documento') body = `
      <h3>Tu documento</h3><p class="small muted">Foto nítida, sin reflejos y con los cuatro bordes a la vista.</p>
      <div class="field"><label for="vfDocType">Tipo de documento</label><select class="select" id="vfDocType" data-change="dashVfDocType"><option value="dni"${d.docType !== 'pasaporte' && d.docType !== 'cedula' ? ' selected' : ''}>DNI</option><option value="cedula"${d.docType === 'cedula' ? ' selected' : ''}>Cédula de identidad</option><option value="pasaporte"${d.docType === 'pasaporte' ? ' selected' : ''}>Pasaporte</option></select></div>
      <div class="grid-2" style="gap:10px">${zone('docFront', d.docType === 'pasaporte' ? 'Página de la foto' : 'Frente', 'Tocá para sacar o subir la foto', 'image/*', 'environment', 'card')}${d.docType === 'pasaporte' ? '' : zone('docBack', 'Dorso', 'Tocá para sacar o subir la foto', 'image/*', 'environment', 'card')}</div>
      ${nav('intro', 'selfie', 'Siguiente', d.docFront && (d.docType === 'pasaporte' || d.docBack))}`;
    if (step === 'selfie') body = `
      <h3>Tu selfie</h3><p class="small muted">De frente, con buena luz y la cara descubierta: sin anteojos de sol, gorra ni filtros.</p>
      ${zone('selfie', 'Selfie', 'En el celular abre la cámara frontal', 'image/*', 'user', 'smile')}
      ${nav('documento', 'video', 'Siguiente', !!d.selfie)}`;
    if (step === 'video') body = `
      <h3>Video corto</h3><p class="small muted">Grabá unos 5 segundos mirando a la cámara y girá la cabeza despacio a un lado y al otro. Sirve para confirmar que sos una persona real en este momento.</p>
      ${zone('video', 'Video de 5 segundos', 'En el celular abre la cámara frontal', 'video/*', 'user', 'video')}
      ${nav('selfie', 'enviar', 'Siguiente', !!d.video)}`;
    if (step === 'enviar') body = `
      <h3>Revisá y enviá</h3><p class="small muted">Si algo salió borroso, volvé y cambialo.</p>
      <div class="grid-3" style="gap:10px">
        <div class="vf-thumb"><img src="${d.docFront}" alt=""><span class="tiny">Documento</span></div>
        <div class="vf-thumb"><img src="${d.selfie}" alt=""><span class="tiny">Selfie</span></div>
        <div class="vf-thumb">${d.video && d.video.src ? `<video src="${d.video.src}" muted playsinline></video>` : `<div class="vf-vid">${HH.icon('video')}</div>`}<span class="tiny">Video${d.video && d.video.seconds ? ' · ' + d.video.seconds + ' s' : ''}</span></div>
      </div>
      <label class="row nowrap small" style="gap:8px;align-items:flex-start"><input type="checkbox" id="vfConsent" style="margin-top:3px"><span>Confirmo que los datos son míos, que soy mayor de 18 años y acepto que SexyRose los use solo para verificar mi identidad.</span></label>
      <div class="row between" style="margin-top:6px"><button class="btn ghost" data-action="dashVfGo" data-step="video">${HH.icon('chevronLeft')} Atrás</button><button class="btn" data-action="dashVfSubmit">${HH.icon('shield')} Enviar para revisión</button></div>`;
    return pageHead('Verificación', 'Verificar identidad', '') + `<div class="card stack vf" style="gap:14px;max-width:620px">${n ? bar : ''}${body}</div>`;
  }
  const VIEWS = { actividad: () => { const u = me(); const html = pageHead('Actividad', 'Tu actividad', 'Me gusta, me interesa, ventas, pedidos, reservas y solicitudes de chat.') + HH.activityHtml(u, HH.ui.actFilter); HH.markActivitySeen(u); return html; }, verificacion: vVerificacion, estadisticas: vEstadisticas, agenda: vAgenda, viajes: vViajes, resumen: vResumen, perfil: vPerfil, contenido: vContenido, pedidos: vPedidos, mensajes: () => vMensajes(null), suscripcion: vSuscripcion, ingresos: vIngresos, ajustes: vAjustes };
  HH.route('panel.:tab', (params) => {
    if (!HH.requireRole('worker')) return false;
    injectCss();
    const tab = params.tab || 'resumen';
    if (!VIEWS[tab]) { HH.go('#panel'); return false; }
    if (!prof()) return `<div class="container section"><div class="empty">${HH.icon('alert')}<h4>No encontramos tu perfil</h4><p class="small">Cerrá sesión y volvé a entrar.</p><button class="btn secondary sm" data-action="dashLogout">Cerrar sesión</button></div></div>`;
    HH.ui.lastDashTab = tab;
    HH.afterRender = () => after(tab);
    return layout(tab, VIEWS[tab]());
  }, { optional: true });
  HH.route('panel.mensajes.:otherId', (params) => {
    if (!HH.requireRole('worker')) return false;
    injectCss();
    if (!prof()) { HH.go('#panel'); return false; }
    HH.afterRender = () => after('mensajes', params.otherId);
    return layout('mensajes', vMensajes(params.otherId));
  });

  /* ---------- Acciones ---------- */
  const A = {
    dashLogout() { HH.closeModal(); HH.logout(); },
    dashDemoLogin(el) { if (HH.login(el.dataset.id)) HH.go('#panel'); },

    /* Perfil */
    dashStDays(el) { HH.ui.stDays = Number(el.dataset.d) || 30; HH.save(); HH.refresh(); },
    dashToggleInt(el) {
      const on = el.getAttribute('aria-pressed') === 'true';
      if (!on && document.querySelectorAll('#dashInts .chip[aria-pressed="true"]').length >= (HH.INTERESTS_MAX || 6)) { HH.toast('Elegí hasta ' + (HH.INTERESTS_MAX || 6) + ' intereses', { type: 'warn' }); return; }
      el.setAttribute('aria-pressed', on ? 'false' : 'true');
    },
    dashToggleChip(el) {
      el.setAttribute('aria-pressed', el.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      refreshPreview();
    },
    dashProfileLive(form, ev) {
      const t = ev && ev.target; if (!t) return;
      if (t.id === 'pfHeadline') { const c = byId('pfHeadlineCount'); if (c) c.textContent = t.value.length + '/60'; }
      if (t.id === 'pfBio') { const c = byId('pfBioCount'); if (c) c.textContent = t.value.length + ' caracteres' + (t.value.length < 40 ? ' · mín. 40 recomendado' : ''); }
      if (t.id === 'pfLangs') { const c = byId('pfLangChips'); if (c) c.innerHTML = langChips(splitLangs(t.value)); }
      clearTimeout(S.liveTimer); S.liveTimer = setTimeout(refreshPreview, 180);
    },
    dashPhotoPick(el) {
      const i = Number(el.dataset.idx); const file = el.files && el.files[0]; if (!file) return;
      if (!file.type.startsWith('image/')) { HH.toast('Elegí una imagen (JPG o PNG)', { type: 'warn' }); el.value = ''; return; }
      HH.uploadMedia(file, { kind: 'image', folder: 'perfiles' }).then(({ url }) => { const p = prof(); p.photos = (p.photos || []).filter(Boolean); p.photos[i] = url; HH.save(); refreshGallery(); refreshPreview(); refreshWho(); HH.toast(i === 0 ? 'Foto principal actualizada' : 'Foto cambiada', { type: 'ok' }); });
    },
    dashPhotoAdd(el) {
      const files = el.files ? [...el.files].filter(f => f.type.startsWith('image/')) : []; if (!files.length) return;
      const p = prof(); p.photos = (p.photos || []).filter(Boolean); const LIM = HH.galleryLimits(p.userId); const room = Math.max(0, LIM.photos - p.photos.length); if (!room) { HH.toast(`Tu plan permite hasta ${LIM.photos} fotos. Subí de plan para agregar más.`, { type: 'warn' }); return; }
      if (files.length > room) HH.toast(`Tu plan permite hasta ${LIM.photos} fotos. Subimos ${room}.`, { type: 'warn' });
      Promise.all(files.slice(0, room).map(f => HH.uploadMedia(f, { kind: 'image', folder: 'perfiles' }))).then(rs => { prof().photos = (prof().photos || []).filter(Boolean).concat(rs.map(r => r.url).filter(Boolean)); HH.save(); refreshGallery(); refreshPreview(); refreshWho(); HH.toast(rs.length === 1 ? 'Foto agregada' : rs.length + ' fotos agregadas', { type: 'ok' }); });
    },
    dashPhotoMain(el) { const i = Number(el.dataset.idx); const p = prof(); const ph = (p.photos || []).filter(Boolean); const [x] = ph.splice(i, 1); ph.unshift(x); p.photos = ph; HH.save(); refreshGallery(); refreshPreview(); refreshWho(); HH.toast('Foto principal actualizada', { type: 'ok' }); },
    dashPhotoRemove(el) {
      const i = Number(el.dataset.idx); const p = prof();
      HH.confirm({ title: 'Quitar foto', text: i === 0 ? 'Es tu foto principal: la siguiente pasa a ser la principal.' : '¿Querés quitar esta foto de tu perfil?', okLabel: 'Quitar', cls: 'danger', onOk: () => { p.photos = (p.photos || []).filter(Boolean); p.photos.splice(i, 1); HH.save(); refreshGallery(); refreshPreview(); refreshWho(); HH.toast('Foto quitada'); } });
    },
    dashVideoAdd(el) {
      const file = el.files && el.files[0]; if (!file) return;
      if (!file.type.startsWith('video/')) { HH.toast('Elegí un video', { type: 'warn' }); return; }
      const p = prof(); if (HH.profileVideos(p).length >= HH.galleryLimits(p.userId).videos) { HH.toast('Tu plan permite hasta ' + HH.galleryLimits(p.userId).videos + ' videos. Quitá uno o subí de plan.', { type: 'warn' }); return; }
      const url0 = URL.createObjectURL(file); const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true;
      const go = (secs) => { URL.revokeObjectURL(url0);
        if (secs && secs > HH.PROFILE_VIDEO_MAX_S + 1) { HH.toast('El video puede durar hasta ' + HH.PROFILE_VIDEO_MAX_S + ' segundos', { type: 'warn' }); return; }
        HH.uploadMedia(file, { kind: 'video', folder: 'perfiles' }).then(({ url, tooBig }) => {
          if (tooBig) HH.toast('En la demo los videos de más de 600 KB no se guardan en el navegador: queda el lugar reservado. Con Cloudinary configurado se sube completo.', { type: 'warn', ms: 6000 });
          p.videos = HH.profileVideos(p).concat([{ id: HH.uid('pv'), src: url, name: file.name, seconds: secs ? Math.round(secs) : null, hue: Math.floor(Math.random() * 360), createdAt: HH.now() }]); HH.save(); refreshGallery(); HH.toast('Video agregado', { type: 'ok' });
        });
      };
      v.onloadedmetadata = () => go(v.duration); v.onerror = () => go(null); v.src = url0;
    },
    dashVideoRemove(el) { const i = Number(el.dataset.idx); const p = prof(); HH.confirm({ title: 'Quitar video', text: '¿Querés quitar este video de tu perfil?', okLabel: 'Quitar', cls: 'danger', onOk: () => { p.videos = HH.profileVideos(p).filter((_, k) => k !== i); HH.save(); refreshGallery(); HH.toast('Video quitado'); } }); },
    dashCopyLinks() { const t = HH.absUrl ? HH.absUrl('#links.' + prof().slug) : location.href.split('#')[0] + '#links.' + prof().slug; try { navigator.clipboard.writeText(t).then(() => HH.toast('Link copiado', { type: 'ok' }), () => HH.toast(t)); } catch (e) { HH.toast(t); } },
    dashSaveProfile(form) {
      const p = prof(); const live = liveProfile();
      const nameEl = form.querySelector('[name=displayName]');
      if (!String(nameEl.value || '').trim()) { HH.toast('Poné un nombre para mostrar', { type: 'warn' }); nameEl.focus(); return; }
      if (live.age != null && (live.age < 18 || live.age > 99)) { HH.toast('La edad tiene que estar entre 18 y 99', { type: 'warn' }); form.querySelector('[name=age]').focus(); return; }
      if (live.activities.length < 2) { HH.toast('Elegí al menos 2 tipos de salida', { type: 'warn' }); const c = byId('dashActs'); if (c) c.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
      if (live.whatsapp && !/\d{8,}/.test(live.whatsapp.replace(/\D/g, ''))) { HH.toast('Revisá el WhatsApp: necesita código de país y número', { type: 'warn' }); form.querySelector('[name=whatsapp]').focus(); return; }
      if ((live.whatsapp || '').replace(/\D/g, '') !== (p.whatsapp || '').replace(/\D/g, '')) p.whatsappVerified = false;
      if (live.city && live.city !== p.homeCity) { p.homeCity = live.city; p.homeCountry = HH.locCountry(HH.locByName(live.city)) || p.homeCountry; p.lat = null; p.lng = null; }
      live.country = p.homeCountry || live.country;
      if (HH.gender(live.gender)) p.gender = live.gender;
      p.telegram = live.telegram;
      p.requestPrices = live.requestPrices; p.chatPrices = live.chatPrices; p.requestAccessDays = live.requestAccessDays;
      const badLink = live.links.find(l => l.url && !/^https?:\/\/[^\s/]+\.[^\s]+/i.test(l.url));
      if (badLink) { HH.toast('Revisá el link "' + (badLink.label || badLink.url) + '": tiene que empezar con https://', { type: 'warn' }); return; }
      p.links = live.links.filter(l => l.url);
      Object.assign(p, { displayName: live.displayName, age: live.age, city: live.city, country: live.country, headline: live.headline, bio: live.bio, headlineEn: live.headlineEn, bioEn: live.bioEn, nationality: live.nationality, heightCm: live.heightCm, build: live.build, zone: live.zone, interests: live.interests, updatedAt: HH.now(), activities: live.activities, languages: live.languages.length ? live.languages : ['Español'], rateFrom: live.rateFrom, chatPriceUsd: live.chatPriceUsd, whatsapp: live.whatsapp ? (live.whatsapp.startsWith('+') ? '+' : '') + live.whatsapp.replace(/\D/g, '') : '' });
      if (p.status === 'pending' && HH.levelOf(p.userId)) p.status = 'active';
      HH.save(); refreshPreview(); refreshWho();
      const who = byId('dashWho'); if (who) { const nm = who.querySelector('.nm'); if (nm) nm.textContent = p.displayName; }
      HH.toast('Perfil guardado', { type: 'ok' });
    },

    /* Contenido */
    dashContentFilter(el) {
      S.contentFilter = el.dataset.f;
      const strip = byId('dashCFilters'); if (strip) strip.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.f === S.contentFilter));
      const g = byId('dashCGrid'); if (g) g.innerHTML = contentGrid(HH.contentOf(me().id));
    },
    dashDetectCity(el) {
      if (!navigator.geolocation) { HH.toast('Tu navegador no permite ubicación. Escribí la ciudad a mano.', { type: 'warn' }); return; }
      el.disabled = true;
      navigator.geolocation.getCurrentPosition((pos) => {
        const lat = Math.round(pos.coords.latitude * 100) / 100, lng = Math.round(pos.coords.longitude * 100) / 100; // ~1 km
        const near = HH.nearestCity(lat, lng); const pr = prof();
        pr.lat = lat; pr.lng = lng;
        const inp = document.getElementById('pfCity');
        if (near && near.km <= HH.NEAR_CITY_KM && inp) { inp.value = near.city; pr.city = near.city; }
        HH.save(); el.disabled = false; el.innerHTML = HH.icon('pin') + ' Ubicación de zona cargada · actualizar';
        HH.toast(near && near.km <= HH.NEAR_CITY_KM ? 'Zona detectada: ' + near.city : 'Zona guardada. Escribí tu ciudad.', { type: 'ok' });
      }, () => { el.disabled = false; HH.toast('No pudimos acceder a tu ubicación. Escribí la ciudad a mano.', { type: 'warn' }); }, { timeout: 10000 });
    },
    async dashPasskeyCreate() { const r = await HH.createPasskey(me()); if (r.ok) HH.toast('Passkey creada', { type: 'ok' }); else if (r.reason !== 'cancelled') HH.toast('No se pudo crear la passkey.', { type: 'warn' }); HH.refresh(); },
    dashPasskeyClear() { HH.confirm({ title: 'Quitar passkeys', text: 'Vas a entrar solo con email y contraseña. Podés crear otra cuando quieras.', okLabel: 'Quitar', cls: 'danger', onOk: () => { me().passkeys = []; HH.save(); HH.refresh(); } }); },
    dashPlaceRequest() {
      HH.modal({ title: 'Sumar mi localidad', body: `<p class="small">Buscala en la base de localidades. Si no está, escribila y elegí dónde queda. La revisamos y, cuando la aprobemos, tu perfil se muda ahí.</p>
        <div class="field"><label for="dpQ">Localidad</label><input class="input" id="dpQ" type="search" autocomplete="off" placeholder="Ej.: Morón"></div><div class="stack" style="gap:6px" id="dpRes"></div>`,
        actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }] });
      const q = document.getElementById('dpQ'), box = document.getElementById('dpRes');
      const pick = (name, parent) => { const loc = HH.resolvePlace({ name, parent }, me().id); if (!loc) { HH.toast('No pudimos ubicarla', { type: 'warn' }); return; } const pr = prof();
        if (loc.status === 'active') { pr.homeCity = loc.name; pr.homeCountry = HH.locCountry(loc); pr.lat = null; pr.lng = null; HH.toast('Listo: ahora figurás en ' + loc.name, { type: 'ok' }); }
        else { pr.pendingCity = loc.name; HH.toast('Pedido enviado. Te avisamos cuando aprobemos ' + loc.name, { type: 'ok' }); }
        HH.save(); HH.closeModal(); HH.refresh(); };
      const regions = (HH.db.locations || []).filter(l => l.level !== 'city' && HH.isActiveLoc(l));
      q.addEventListener('input', () => { const res = HH.searchPlaces(q.value);
        box.innerHTML = res.map(r => `<button type="button" class="list-item" data-n="${HH.esc(r.name)}" data-p="${HH.esc(r.parent)}" style="cursor:pointer;text-align:left;width:100%">${HH.icon('pin')}<span class="grow"><span class="title">${HH.esc(r.name)}</span><span class="sub">${HH.esc(HH.locLabel(HH.locByName(r.parent), { country: true }) || r.parent)}</span></span>${r.existing && r.status === 'active' ? '' : '<span class="badge warn">Nueva</span>'}</button>`).join('')
          + (q.value.trim().length >= 2 ? `<div class="card soft pad-sm stack" style="gap:8px"><div class="small">¿No aparece? Escribila a mano:</div><select class="select" id="dpPar"><option value="">¿Dentro de qué provincia, zona o país?</option>${regions.map(l => `<option value="${HH.esc(l.name)}">${' '.repeat(HH.locPath(l).length - 1)}${HH.esc(l.name)}</option>`).join('')}</select><button type="button" class="btn secondary sm" id="dpMan">Pedir "${HH.esc(q.value.trim())}"</button></div>` : '');
        box.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', () => pick(b.dataset.n, b.dataset.p)));
        const man = document.getElementById('dpMan'); if (man) man.addEventListener('click', () => { const par = document.getElementById('dpPar').value; if (!par) { HH.toast('Elegí dónde queda', { type: 'warn' }); return; } pick(q.value.trim(), par); });
      });
    },
    dashBookingSave(form, ev, v) {
      const p = prof(); const c = HH.bookingCfg(p);
      const link = String(v.payLink || '').trim();
      if (link && !HH.validPayLink(link)) { HH.toast('El link de pago tiene que empezar con https://', { type: 'warn' }); return; }
      const av = {}; let bad = false;
      HH.WEEKDAYS.forEach(w => { if (v['d' + w.k]) { const from = v['f' + w.k], to = v['t' + w.k]; if (!from || !to || from >= to) bad = w.l; else av[w.k] = [{ from, to }]; } });
      if (bad) { HH.toast(`Revisá el horario del ${bad.toLowerCase()}: el fin tiene que ser después del inicio`, { type: 'warn' }); return; }
      Object.assign(c, { payLink: link, minNoticeHours: Number(v.minNoticeHours) || 12, availability: av });
      if (HH.waAgendaSave) HH.waAgendaSave(p, v);
      HH.save(); HH.refresh();
      const iss = HH.bookingIssues(p);
      HH.toast(iss.length ? 'Agenda guardada. Falta completar datos para recibir reservas.' : 'Agenda guardada. Ya podés recibir reservas.', { type: iss.length ? 'warn' : 'ok' });
    },
    dashBkConfirm(el) { HH.updateBooking(el.dataset.id, { status: 'confirmada', confirmedAt: HH.now() }); HH.refresh(); HH.toast('Reserva confirmada', { type: 'ok' }); },
    dashBkReject(el) {
      HH.confirm({ title: 'Rechazar reserva', text: 'El cliente ve la reserva como rechazada. Si ya te pagó la seña, devolvésela por el mismo medio.', okLabel: 'Rechazar', cls: 'danger', onOk: () => { HH.updateBooking(el.dataset.id, { status: 'rechazada' }); HH.refresh(); HH.toast('Reserva rechazada'); } });
    },
    dashBkCancel(el) {
      HH.confirm({ title: 'Cancelar salida', text: 'Avisale al cliente por chat. Como la cancelás vos, corresponde devolver la seña.', okLabel: 'Cancelar salida', cls: 'danger', onOk: () => { HH.updateBooking(el.dataset.id, { status: 'cancelada', cancelledBy: 'worker' }); HH.refresh(); HH.toast('Salida cancelada'); } });
    },
    dashAgendaOn() { const c = HH.bookingCfg(prof()); c.enabled = true; c.declined = false; HH.save(); HH.refresh(); HH.toast('Agenda activada. Completá tu horario hábil y tu link de pago.', { type: 'ok' }); },
    dashAgendaOff() { const c = HH.bookingCfg(prof()); c.enabled = false; c.declined = true; HH.save(); HH.refresh(); },
    dashAgendaStop() {
      HH.confirm({ title: 'Dejar de usar la agenda', text: 'Tu perfil deja de mostrar "Reservar salida". Las reservas ya confirmadas siguen vigentes y tu configuración queda guardada por si la volvés a activar.', okLabel: 'Dejar de usarla', cls: 'danger', onOk: () => { const c = HH.bookingCfg(prof()); c.enabled = false; c.declined = true; HH.save(); HH.refresh(); HH.toast('Agenda desactivada'); } });
    },
    dashAgWeek(el) { HH.ui.agWeek = Math.max(0, Math.min(3, (Number(HH.ui.agWeek) || 0) + Number(el.dataset.d))); HH.refresh(); },
    dashAgSlot(el, ev) {
      if (ev && ev.target.closest('.ag-ev')) return;
      const p = prof(); let date = el.dataset.date || HH.localDay(); let from = '10:00';
      if (el.dataset.date && ev) { const r = el.getBoundingClientRect(); const mn = Number(el.dataset.min), mx = Number(el.dataset.max); const m = mn + (ev.clientY - r.top) / r.height * (mx - mn); from = HH.fromMin(Math.max(0, Math.min(23 * 60, Math.floor(m / 30) * 30))); }
      const to = HH.fromMin(Math.min(24 * 60, HH.toMin(from) + 120)); const t = HH.localDay();
      const hm = Array.from({ length: 49 }, (_, i) => HH.fromMin(i * 30));
      const sel = (id, val, list) => `<select class="select" id="${id}">${list.map(x => `<option${x === val ? ' selected' : ''}>${x}</option>`).join('')}</select>`;
      HH.modal({ title: 'Marcar horario', body: `<div class="stack" style="gap:12px">
          <div class="chips" role="radiogroup" aria-label="Tipo">${Object.entries(HH.BLOCK_KINDS).map(([k, x], i) => `<label class="chip ag-kind"><input type="radio" name="agKind" value="${k}"${i === 0 ? ' checked' : ''}> ${x.label}</label>`).join('')}</div>
          <p class="small muted" style="margin:0">Ocupado: una salida que coordinaste por fuera. Bloqueado: un horario personal. En los dos casos, los clientes no pueden reservar ahí.</p>
          <div class="field"><label for="agDate">Día</label><input class="input" type="date" id="agDate" min="${t}" value="${date < t ? t : date}"></div>
          <label class="row nowrap small" style="gap:8px"><input type="checkbox" id="agAll"> Todo el día</label>
          <div class="grid-2" style="gap:10px" id="agTimes"><div class="field"><label for="agFrom">Desde</label>${sel('agFrom', from, hm.slice(0, 48))}</div><div class="field"><label for="agTo">Hasta</label>${sel('agTo', to, hm.slice(1))}</div></div>
          <div class="field"><label for="agNote">Nota (solo la ves vos)</label><input class="input" id="agNote" maxlength="80" placeholder="Ej.: salida con un cliente habitual"></div>
          <div id="agErr"></div></div>`,
        actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: HH.icon('check') + ' Guardar', onClick: () => {
          const g = (id) => document.getElementById(id); const kind = (document.querySelector('input[name=agKind]:checked') || {}).value;
          const r = HH.addBlock(p, { date: g('agDate').value, from: g('agFrom').value, to: g('agTo').value, kind, note: g('agNote').value, allDay: g('agAll').checked });
          if (r.error) { g('agErr').innerHTML = `<div class="notice warn">${HH.icon('alert')}<span>${HH.esc(r.error)}</span></div>`; return; }
          const clash = HH.bookingsOf(p.userId).some(b => b.date === r.block.date && ['solicitada', 'confirmada'].includes(b.status) && HH.toMin(b.start) < HH.toMin(r.block.to) && HH.toMin(b.start) + b.hours * 60 > HH.toMin(r.block.from));
          HH.closeModal(); HH.refresh(); HH.toast(clash ? 'Guardado. Ojo: se superpone con una reserva existente.' : 'Horario marcado como ' + HH.BLOCK_KINDS[r.block.kind].label.toLowerCase(), { type: clash ? 'warn' : 'ok' });
        } }] });
      const all = document.getElementById('agAll'); if (all) all.addEventListener('change', () => { document.getElementById('agTimes').style.display = all.checked ? 'none' : ''; });
    },
    dashAgBlock(el) {
      const p = prof(); const x = HH.bookingCfg(p).blocks.find(b => b.id === el.dataset.id); if (!x) return; const k = HH.BLOCK_KINDS[x.kind] || HH.BLOCK_KINDS.bloqueado;
      HH.confirm({ title: k.label + ' · ' + HH.fmtDay(x.date), text: (x.allDay ? 'Todo el día' : x.from + ' a ' + x.to + ' h') + (x.note ? ' · ' + x.note : '') + '. ¿Lo liberás? Vuelve a quedar disponible para reservas si está dentro de tu horario hábil.', okLabel: 'Liberar horario', onOk: () => { HH.removeBlock(p, x.id); HH.refresh(); HH.toast('Horario liberado', { type: 'ok' }); } });
    },
    dashAgBooking(el) { const n = document.querySelector(`[data-bk-row="${el.dataset.id}"]`); if (n) { n.scrollIntoView({ behavior: 'smooth', block: 'center' }); n.classList.add('flash'); setTimeout(() => n.classList.remove('flash'), 1400); } },
    dashBkDone(el) { HH.updateBooking(el.dataset.id, { status: 'realizada' }); HH.refresh(); HH.toast('Salida marcada como realizada', { type: 'ok' }); },
    dashTripOpen() {
      if (!HH.planFeat(me().id, 'trips')) { HH.toast('Los viajes están disponibles desde el plan Platino', { type: 'warn' }); return; }
      const p = prof(); const t = HH.localDay();
      const cities = Object.keys(HH.CITY_COORDS).filter(c => c !== p.homeCity).sort((a, b) => a.localeCompare(b));
      HH.modal({ title: 'Programar destino', body: `
        <div class="field"><label for="trCity">Destino</label><select class="select" id="trCity"><option value="">Elegí la ciudad</option>${cities.map(c => `<option value="${HH.esc(c)}">${HH.esc(c)} · ${HH.esc(HH.CITY_COUNTRY[c] || '')}</option>`).join('')}</select></div>
        <div class="grid-2" style="gap:10px">
          <div class="field"><label for="trFrom">Llego el</label><input class="input" type="date" id="trFrom" min="${t}" value="${t}"></div>
          <div class="field"><label for="trTo">Me voy el</label><input class="input" type="date" id="trTo" min="${t}"></div>
        </div>
        <p class="small muted">Vas a aparecer en ese destino ${HH.TRIP_PREVIEW_DAYS} días antes de llegar, con la etiqueta "En {ciudad} desde el…". Durante el viaje, tu ubicación cambia sola y vuelve a tu ciudad al terminar.</p>
        <div id="trErr"></div>`,
        actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: 'Guardar', onClick: () => {
          const r = HH.addTrip(prof(), { city: document.getElementById('trCity').value, from: document.getElementById('trFrom').value, to: document.getElementById('trTo').value });
          if (r.error) { document.getElementById('trErr').innerHTML = `<div class="notice warn">${HH.icon('alert')}<span>${HH.esc(r.error)}</span></div>`; return; }
          HH.closeModal(); HH.toast('Destino programado', { type: 'ok' }); HH.refresh();
        } }] });
      const from = document.getElementById('trFrom'), to = document.getElementById('trTo');
      from.addEventListener('change', () => { to.min = from.value; if (to.value && to.value < from.value) to.value = from.value; });
    },
    dashTripDelete(el) { HH.confirm({ title: 'Cancelar viaje', text: 'Tu perfil deja de aparecer en ese destino.', okLabel: 'Cancelar viaje', cls: 'danger', onOk: () => { HH.removeTrip(prof(), el.dataset.id); HH.toast('Viaje cancelado'); HH.refresh(); } }); },
    dashStoryOpen() {
      if (HH.storiesLeftToday(me().id) <= 0) { HH.toast('Tu plan permite ' + HH.planFeat(me().id, 'stories_per_day') + ' ' + HH.plural(HH.planFeat(me().id, 'stories_per_day'), 'historia', 'historias') + ' por día. Subí de plan para publicar más.', { type: 'warn' }); return; }
      let src = null;
      HH.modal({ title: 'Nueva historia', body: `<div class="stack">
        <label class="dropzone" id="dashStoryDrop" style="cursor:pointer">${HH.icon('camera')}<div>Elegí una foto</div><div class="tiny">Se ve 24 h en tu perfil y en el inicio</div><input type="file" accept="image/*" class="sr-only" data-change="dashStoryFile"></label>
        <div class="field"><label for="dashStoryCap">Texto (opcional)</label><input class="input" id="dashStoryCap" maxlength="120" placeholder="Café de la mañana en Palermo"></div>
      </div>`, actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: 'Publicar historia', onClick: () => {
        const cap = (document.getElementById('dashStoryCap').value || '').trim(); const f = document.querySelector('#dashStoryDrop input'); const file = f && f.files && f.files[0];
        const done = (dataUrl) => { if (!HH.addStory(me().id, { src: dataUrl, caption: cap })) { HH.toast('Llegaste al límite de historias de hoy de tu plan', { type: 'warn' }); return; } HH.closeModal(); HH.toast('Historia publicada por 24 h', { type: 'ok' }); HH.refresh(); };
        if (file) HH.readFile(file, done); else if (cap) done(null); else { HH.toast('Elegí una foto o escribí un texto.', { type: 'warn' }); }
      } }] });
    },
    dashStoryFile(el) { const file = el.files && el.files[0]; if (!file) return; HH.readFile(file, (src) => { const d = document.getElementById('dashStoryDrop'); if (d) { d.innerHTML = `<img src="${src}" alt="" style="max-height:220px;margin:0 auto;border-radius:12px"><div class="tiny" style="margin-top:6px">${HH.esc(file.name)}</div>`; d.appendChild(el); } }); },
    dashStoryDelete(el) { HH.confirm({ title: 'Borrar historia', text: '¿Querés borrar esta historia?', okLabel: 'Borrar', cls: 'danger', onOk: () => { HH.removeStory(el.dataset.id); HH.toast('Historia borrada'); HH.refresh(); } }); },
    dashUploadOpen() {
      const premiumOk = !!(HH.levelOf(me().id) && HH.planFeat(me().id, 'premium_content'));
      S.upload = { type: 'photo', src: null, fileName: '' };
      HH.modal({
        title: 'Subir contenido', body: `
        <div class="stack" style="gap:12px">
          <div class="field"><span class="label">Tipo</span><div class="type-grid" id="upTypes">${['photo', 'video', 'short'].map(t => `<button type="button" class="radio-card ${t === 'photo' ? 'active' : ''}" data-action="dashUploadType" data-type="${t}" aria-pressed="${t === 'photo'}">${HH.icon(TYPE_ICON[t])}<span><strong>${TYPE_LABEL[t]}</strong><span class="tiny muted">${t === 'photo' ? 'JPG o PNG' : t === 'video' ? 'Horizontal' : 'Vertical, corto'}</span></span></button>`).join('')}</div></div>
          <div class="field"><span class="label">Archivo</span><label class="dropzone" id="upDrop" for="upFile">${HH.icon('upload')}<div id="upDropTxt">Tocá para elegir una imagen</div></label><input type="file" id="upFile" class="sr-only" accept="image/*" data-change="dashUploadFile"></div>
          <div class="field" id="upDurWrap" hidden><label for="upDur">Duración</label><input class="input" id="upDur" placeholder="m:ss, por ejemplo 0:30" style="max-width:200px"><span class="hint">En esta demo la cargás a mano.</span></div>
          ${contentForm(null, premiumOk)}
        </div>`,
        actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: 'Publicar', onClick: () => A.dashUploadSubmit() }],
      });
    },
    dashUploadType(el) {
      const t = el.dataset.type; S.upload.type = t; S.upload.src = null; S.upload.fileName = '';
      el.parentElement.querySelectorAll('.radio-card').forEach(c => { c.classList.toggle('active', c === el); c.setAttribute('aria-pressed', c === el); });
      const f = byId('upFile'); if (f) { f.value = ''; f.setAttribute('accept', t === 'photo' ? 'image/*' : 'video/*'); }
      const drop = byId('upDrop'); if (drop) { drop.classList.remove('has'); drop.innerHTML = `${HH.icon('upload')}<div id="upDropTxt">${t === 'photo' ? 'Tocá para elegir una imagen' : 'Tocá para elegir el video'}</div>`; }
      const dw = byId('upDurWrap'); if (dw) dw.hidden = t === 'photo';
    },
    dashUploadFile(el) {
      const file = el.files && el.files[0]; if (!file) return;
      const U = S.upload; const drop = byId('upDrop');
      if (U.type === 'photo' && !file.type.startsWith('image/')) { HH.toast('Para una foto elegí una imagen (JPG o PNG)', { type: 'warn' }); el.value = ''; return; }
      U.fileName = file.name;
      const title = byId('upTitle'); if (title && !title.value) title.value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 60);
      if (U.type === 'photo') {
        HH.readFile(file, (src) => { U.src = src; if (drop) { drop.classList.add('has'); drop.innerHTML = `<img src="${src}" alt=""><div class="small" style="margin-top:6px">${HH.esc(file.name)} · tocá para cambiar</div>`; } });
      } else {
        U.src = null;
        if (drop) { drop.classList.add('has'); drop.innerHTML = `${HH.icon(U.type === 'short' ? 'film' : 'video')}<div style="font-weight:700">${HH.esc(file.name)}</div><div class="tiny">En esta demo el video no se guarda: se muestra una portada generada.</div>`; }
      }
    },
    dashUploadPremium(el) {
      if (el.disabled) return;
      const on = el.getAttribute('aria-checked') !== 'true'; el.setAttribute('aria-checked', on);
      const pw = byId('upPriceWrap'); if (pw) pw.hidden = !on; const aw = byId('upAccessWrap'); if (aw) aw.hidden = !on;
      if (on) { const pr = byId('upPrice'); if (pr) pr.focus(); }
    },
    dashUploadSubmit() {
      const U = S.upload || {}; const title = val('upTitle').trim();
      if (!U.fileName) { HH.toast('Elegí un archivo para publicar', { type: 'warn' }); return; }
      if (!title) { HH.toast('Poné un título', { type: 'warn' }); const t = byId('upTitle'); if (t) t.focus(); return; }
      let duration = null;
      if (U.type !== 'photo') { duration = val('upDur').trim(); if (!/^\d{1,2}:[0-5]\d$/.test(duration)) { HH.toast('Ingresá la duración como m:ss (por ejemplo 0:30)', { type: 'warn' }); const d = byId('upDur'); if (d) d.focus(); return; } }
      const sw = byId('upPremium'); const premium = !!sw && !sw.disabled && sw.getAttribute('aria-checked') === 'true';
      const price = premium ? Number(val('upPrice')) : 0;
      if (premium && !(price >= 1)) { HH.toast('El precio mínimo es USD 1', { type: 'warn' }); return; }
      HH.db.content.push({ id: HH.uid('c'), workerId: me().id, type: U.type, title, caption: val('upCaption').trim(), isPremium: premium, priceUsd: premium ? Math.round(price * 100) / 100 : 0, accessDays: premium ? Number(val('upAccess')) || 0 : 0, duration, views: 0, sales: 0, createdAt: HH.now(), hue: Math.floor(Math.random() * 360), src: U.src });
      HH.save(); HH.closeModal(); S.upload = null;
      HH.toast(premium ? 'Publicado como premium · ' + HH.money(price) : 'Contenido publicado', { type: 'ok' });
      HH.refresh();
    },
    dashEditContent(el) {
      const it = HH.db.content.find(c => c.id === el.dataset.id); if (!it) return;
      const premiumOk = !!(HH.levelOf(me().id) && HH.planFeat(me().id, 'premium_content'));
      HH.modal({
        title: 'Editar ' + TYPE_LABEL[it.type].toLowerCase(), body: `<div class="stack" style="gap:12px"><div class="row nowrap" style="gap:12px"><div style="width:72px;flex:none">${HH.contentThumb(it, { noLock: true, noTag: true, cls: 'square' })}</div><div class="small muted">${TYPE_LABEL[it.type]}${it.duration ? ' · ' + it.duration : ''} · ${n(it.views)} vistas · ${n(it.sales)} ventas<br>Publicado el ${HH.fmtDate(it.createdAt)}</div></div>${contentForm(it, premiumOk)}</div>`,
        actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: 'Guardar', onClick: () => {
          const title = val('upTitle').trim(); if (!title) { HH.toast('Poné un título', { type: 'warn' }); return; }
          const sw = byId('upPremium'); const premium = !!sw && (sw.disabled ? !!it.isPremium : sw.getAttribute('aria-checked') === 'true');
          const price = premium ? Number(val('upPrice')) : 0; if (premium && !(price >= 1)) { HH.toast('El precio mínimo es USD 1', { type: 'warn' }); return; }
          Object.assign(it, { title, caption: val('upCaption').trim(), isPremium: premium, priceUsd: premium ? Math.round(price * 100) / 100 : 0, accessDays: premium ? Number(val('upAccess')) || 0 : 0 });
          if (!premium) HH.db.packs.forEach(pk => { if (pk.workerId === it.workerId) pk.itemIds = pk.itemIds.filter(id => id !== it.id); });
          HH.save(); HH.closeModal(); HH.toast('Cambios guardados', { type: 'ok' }); HH.refresh();
        } }],
      });
    },
    dashDeleteContent(el) {
      const it = HH.db.content.find(c => c.id === el.dataset.id); if (!it) return;
      const inPacks = HH.db.packs.filter(pk => pk.itemIds.includes(it.id)).length;
      HH.confirm({ title: 'Borrar contenido', text: `Vas a borrar “<span data-noi18n>${HH.esc(it.title)}</span>”. ${inPacks ? `También sale de ${inPacks} ${HH.plural(inPacks, 'pack', 'packs')}. ` : ''}Quien ya lo compró lo conserva. No se puede deshacer.`, okLabel: 'Borrar', cls: 'danger', onOk: () => {
        HH.db.content = HH.db.content.filter(c => c.id !== it.id);
        HH.db.packs.forEach(pk => { pk.itemIds = pk.itemIds.filter(id => id !== it.id); });
        HH.save(); HH.toast('Contenido borrado'); HH.refresh();
      } });
    },
    dashPackOpen() { if (!HH.planFeat(me().id, 'packs')) { HH.toast('Los packs están disponibles desde el plan Oro', { type: 'warn' }); return; } packModal(null); },
    dashPackEdit(el) { const pk = HH.db.packs.find(x => x.id === el.dataset.id); if (pk) packModal(pk); },
    dashPackPick(el) {
      const lab = el.closest('.pick'); if (lab) lab.classList.toggle('active', el.checked);
      const ids = [...document.querySelectorAll('#pkItems input:checked')].map(i => i.value);
      const sum = HH.sum(HH.db.content.filter(c => ids.includes(c.id)), c => c.priceUsd);
      const h = byId('pkHint'); if (h) h.textContent = `${ids.length} ${HH.plural(ids.length, 'pieza elegida', 'piezas elegidas')} · sueltas suman ${HH.money(sum)}. Un pack conviene si sale menos.`;
    },
    dashPackSubmit(id) {
      const title = val('pkTitle').trim(); const price = Number(val('pkPrice'));
      const ids = [...document.querySelectorAll('#pkItems input:checked')].map(i => i.value);
      if (!title) { HH.toast('Poné un título al pack', { type: 'warn' }); return; }
      if (!(price >= 1)) { HH.toast('El precio mínimo es USD 1', { type: 'warn' }); return; }
      if (ids.length < 2) { HH.toast('Elegí al menos 2 piezas premium', { type: 'warn' }); return; }
      if (id) { const pk = HH.db.packs.find(x => x.id === id); if (pk) Object.assign(pk, { title, description: val('pkDesc').trim(), priceUsd: price, itemIds: ids, accessDays: Number(val('pkAccess')) || 0 }); }
      else HH.db.packs.push({ id: HH.uid('pk'), workerId: me().id, title, description: val('pkDesc').trim(), itemIds: ids, priceUsd: price, accessDays: Number(val('pkAccess')) || 0, sales: 0, createdAt: HH.now() });
      HH.save(); HH.closeModal(); HH.toast(id ? 'Pack guardado' : 'Pack creado', { type: 'ok' }); HH.refresh();
    },
    dashPackDelete(el) {
      const pk = HH.db.packs.find(x => x.id === el.dataset.id); if (!pk) return;
      HH.confirm({ title: 'Borrar pack', text: `Vas a borrar “${HH.esc(pk.title)}”. Las piezas siguen publicadas por separado. Quien ya lo compró conserva el acceso hasta que venza.`, okLabel: 'Borrar', cls: 'danger', onOk: () => { HH.db.packs = HH.db.packs.filter(x => x.id !== pk.id); HH.save(); HH.toast('Pack borrado'); HH.refresh(); } });
    },

    /* Pedidos */
    dashReqFilter(el) { S.reqFilter = el.dataset.f; HH.refresh(); },
    dashQuoteOpen(el) {
      const r = HH.db.requests.find(x => x.id === el.dataset.id); if (!r) return;
      const edit = r.status === 'aceptado'; const c = HH.userById(r.clientId);
      HH.modal({
        title: edit ? 'Cambiar precio' : 'Aceptar y cotizar', body: `
        <div class="stack" style="gap:12px">
          <div class="card soft pad-sm small"><div class="muted tiny" style="margin-bottom:4px">Pedido de ${HH.esc(c ? c.name : 'cliente')}</div><span data-noi18n>${HH.esc(r.description)}</span></div>
          <div class="field"><label for="qPrice">Precio</label><div class="input-group" style="max-width:220px"><input class="input num" id="qPrice" type="number" min="1" step="1" value="${r.priceUsd || 10}" inputmode="numeric"><span class="addon">USD</span></div><span class="hint">El cliente paga por adelantado y el pedido pasa a “Pagado”. Después lo entregás desde acá.</span>${HH.commissionHint('request')}</div>
          <div class="field"><label for="qNote">Mensaje para el cliente <span class="muted">(opcional)</span></label><textarea class="textarea" id="qNote" rows="2" maxlength="200" placeholder="Lo tengo listo en 3 días. ¿Te sirve con subtítulos?" style="min-height:64px">${HH.esc(r.note || '')}</textarea></div>
        </div>`,
        actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: edit ? 'Guardar precio' : 'Aceptar pedido', onClick: () => {
          const price = Number(val('qPrice')); if (!(price >= 1)) { HH.toast('El precio mínimo es USD 1', { type: 'warn' }); return; }
          HH.updateRequest(r.id, { status: 'aceptado', priceUsd: Math.round(price * 100) / 100, note: val('qNote').trim() });
          HH.closeModal(); HH.toast(edit ? 'Precio actualizado' : 'Pedido aceptado. Le avisamos al cliente para que pague.', { type: 'ok' }); HH.refresh();
        } }],
      });
    },
    dashRejectOpen(el) {
      const r = HH.db.requests.find(x => x.id === el.dataset.id); if (!r) return;
      HH.modal({
        title: 'Rechazar pedido', body: `<div class="stack" style="gap:12px"><p class="small muted">El cliente recibe el motivo. Sé clara y amable: muchas veces vuelve a pedir otra cosa.</p><div class="field"><label for="rjNote">Motivo</label><textarea class="textarea" id="rjNote" rows="3" maxlength="200" placeholder="No hago ese tipo de salidas, pero puedo recomendarte a alguien."></textarea></div></div>`,
        actions: [{ label: 'Volver', cls: 'ghost', action: 'closeModal' }, { label: 'Rechazar pedido', cls: 'danger', onClick: () => {
          const note = val('rjNote').trim(); if (!note) { HH.toast('Contale brevemente por qué', { type: 'warn' }); return; }
          if (r.status === 'pendiente' || r.status === 'pagado') HH.refundRequest(r, note); else HH.updateRequest(r.id, { status: 'rechazado', note }); HH.closeModal(); HH.toast(r.refunded ? 'Pedido rechazado · reembolsamos al cliente' : 'Pedido rechazado'); HH.refresh();
        } }],
      });
    },
    dashDeliverOpen(el) {
      const r = HH.db.requests.find(x => x.id === el.dataset.id); if (!r) return;
      const c = HH.userById(r.clientId); const kind = r.kind || 'photo'; const isPack = kind === 'pack';
      const mine = HH.contentOf(me().id).filter(it => isPack || it.type === kind || (kind === 'video' && it.type === 'short'));
      S.deliver = { id: r.id, kind, isPack, mode: mine.length ? 'pick' : 'new', picked: [], uploads: [] };
      const K = HH.REQUEST_KINDS[kind] || { label: 'Contenido' };
      HH.modal({
        title: 'Aceptar y enviar ' + K.label.toLowerCase(), body: `
        <div class="stack" style="gap:12px">
          <div class="card soft pad-sm small"><div class="muted tiny" style="margin-bottom:4px">${K.label} para ${HH.esc(c ? c.name : 'cliente')} · ya pagó ${HH.money(r.priceUsd)}</div><span data-noi18n>${HH.esc(r.description)}</span></div>
          <div class="mode-grid" id="dvModes"><button type="button" class="radio-card ${S.deliver.mode === 'pick' ? 'active' : ''}" data-action="dashDeliverMode" data-mode="pick" ${mine.length ? '' : 'disabled'}>${HH.icon('grid')}<span>Elegir de lo que ya tengo</span></button><button type="button" class="radio-card ${S.deliver.mode === 'new' ? 'active' : ''}" data-action="dashDeliverMode" data-mode="new">${HH.icon('upload')}<span>Subir ${isPack ? 'archivos nuevos' : 'un archivo nuevo'}</span></button></div>
          <div id="dvPick" ${S.deliver.mode === 'pick' ? '' : 'hidden'}>${mine.length ? `<p class="tiny muted" style="margin-bottom:6px">${isPack ? 'Elegí 2 o más piezas.' : 'Elegí una.'}</p><div class="pick-list">${mine.map(it => `<label class="pick"><input type="${isPack ? 'checkbox' : 'radio'}" class="sr-only" name="dvItem" value="${it.id}" data-change="dashDeliverPick">${HH.contentThumb(it, { noLock: true, noTag: true, cls: 'square' })}<span class="grow tiny ellipsis"><span data-noi18n>${HH.esc(it.title)}</span></span></label>`).join('')}</div>` : ''}</div>
          <div id="dvNewWrap" ${S.deliver.mode === 'new' ? '' : 'hidden'}>
            <label class="dropzone" id="dvDrop" for="dvFile">${HH.icon('upload')}<div>Tocá para elegir ${isPack ? 'los archivos (fotos y/o videos)' : kind === 'video' ? 'el video' : 'la foto'}</div></label>
            <input type="file" id="dvFile" class="sr-only" accept="${kind === 'photo' ? 'image/*' : kind === 'video' ? 'video/*' : 'image/*,video/*'}" ${isPack ? 'multiple' : ''} data-change="dashDeliverFile">
          </div>
          <div class="notice info">${HH.icon('info')}<span>Le llega desbloqueado a su cuenta en el momento. Lo nuevo que subas queda guardado como privado en tu contenido.</span></div>
        </div>`,
        actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: 'Enviar al cliente', cls: 'ok', onClick: () => A.dashDeliverSubmit() }],
      });
    },
    dashDeliverMode(el) {
      if (el.disabled) return; const D = S.deliver; D.mode = el.dataset.mode;
      el.parentElement.querySelectorAll('.radio-card').forEach(c => c.classList.toggle('active', c === el));
      const pk = byId('dvPick'), nw = byId('dvNewWrap'); if (pk) pk.hidden = D.mode !== 'pick'; if (nw) nw.hidden = D.mode !== 'new';
    },
    dashDeliverPick() {
      S.deliver.picked = [...document.querySelectorAll('#dvPick input:checked')].map(x => x.value);
      document.querySelectorAll('#dvPick .pick').forEach(l => l.classList.toggle('active', l.querySelector('input').checked));
    },
    dashDeliverType() {},
    dashDeliverFile(el) {
      const files = el.files ? [...el.files] : []; if (!files.length) return; const D = S.deliver; const drop = byId('dvDrop');
      D.uploads = [];
      files.forEach(file => { const type = file.type.startsWith('video/') ? 'video' : 'photo'; const u = { type, fileName: file.name, src: null }; D.uploads.push(u); if (type === 'photo') HH.readFile(file, (src) => { u.src = src; }); });
      if (drop) { drop.classList.add('has'); drop.innerHTML = `${HH.icon(files.length > 1 ? 'pack' : D.uploads[0].type === 'video' ? 'video' : 'image')}<div style="font-weight:700">${files.length > 1 ? files.length + ' archivos elegidos' : HH.esc(files[0].name)}</div>`; }
    },
    dashDeliverSubmit() {
      const D = S.deliver; const r = HH.db.requests.find(x => x.id === D.id); if (!r) return;
      const c = HH.userById(r.clientId); let ids = [];
      if (D.mode === 'pick') {
        ids = D.picked.slice();
        if (!ids.length) { HH.toast(D.isPack ? 'Elegí las piezas del pack' : 'Elegí qué contenido enviar', { type: 'warn' }); return; }
        if (D.isPack && ids.length < 2) { HH.toast('Un pack lleva al menos 2 piezas', { type: 'warn' }); return; }
      } else {
        if (!D.uploads.length) { HH.toast('Elegí el archivo que vas a enviar', { type: 'warn' }); return; }
        if (D.isPack && D.uploads.length < 2) { HH.toast('Un pack lleva al menos 2 archivos', { type: 'warn' }); return; }
        D.uploads.forEach((u, k) => { const it = { id: HH.uid('c'), workerId: me().id, type: u.type, title: 'Pedido de ' + (c ? c.name.split(' ')[0] : 'cliente') + (D.uploads.length > 1 ? ' · ' + (k + 1) : ''), caption: r.description.slice(0, 120), isPremium: true, priceUsd: Math.max(1, Math.round((r.priceUsd || 1) / D.uploads.length)), duration: u.type === 'video' ? '0:30' : null, views: 0, sales: 0, createdAt: HH.now(), hue: Math.floor(Math.random() * 360), src: u.src };
          HH.db.content.push(it); ids.push(it.id); });
      }
      ids.forEach(id => { if (!HH.hasPurchased(r.clientId, 'content', id)) HH.db.purchases.push({ id: HH.uid('pu'), clientId: r.clientId, kind: 'content', refId: id, workerId: me().id, amountUsd: 0, createdAt: HH.now() }); });
      HH.updateRequest(r.id, { status: 'entregado', deliveredItemId: ids[0], deliveredItemIds: ids, accessExpiresAt: HH.purchaseExpiry(r.accessDays) });
      HH.closeModal(); S.deliver = null; HH.toast('Enviado. Ya lo tiene en su cuenta.', { type: 'ok' }); HH.refresh();
    },

    /* Mensajes */
    dashSendMessage(form, ev, v) {
      const to = form.dataset.to; const text = String(v.text || '').trim();
      if (!text) { HH.toast('Escribí un mensaje', { type: 'warn' }); return; }
      const res = HH.sendMessage(me().id, to, text);
      if (res.error) { HH.toast(res.error, { type: 'warn' }); HH.refresh(); return; }
      HH.refresh();
    },
    dashReportOpen(el) {
      const o = HH.userById(el.dataset.id); if (!o) return;
      HH.modal({
        title: 'Reportar a ' + o.name.split(' ')[0], body: `<div class="stack" style="gap:12px"><p class="small muted">Contanos qué pasó. Lo revisa el equipo de SexyRose y, si corresponde, suspende la cuenta. Si te sentís en riesgo, bloquealo también.</p><div class="field"><label for="rpReason">Motivo</label><textarea class="textarea" id="rpReason" rows="3" maxlength="400" placeholder="Insistió por WhatsApp después de que le dije que no."></textarea></div></div>`,
        actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: 'Enviar reporte', cls: 'danger', onClick: () => {
          const reason = val('rpReason').trim(); if (reason.length < 5) { HH.toast('Contanos un poco más', { type: 'warn' }); return; }
          HH.db.reports.push({ id: HH.uid('rp'), targetId: o.id, byId: me().id, reason, status: 'abierto', createdAt: HH.now() });
          HH.save(); HH.closeModal(); HH.toast('Reporte enviado. Lo revisamos en menos de 24 h', { type: 'ok' });
        } }],
      });
    },
    dashBlock(el) {
      const o = HH.userById(el.dataset.id); if (!o) return; const p = prof(); p.blocked = blocked(p);
      if (p.blocked.includes(o.id)) {
        HH.confirm({ title: 'Desbloquear a ' + o.name.split(' ')[0], text: 'Va a poder volver a escribirte y la conversación vuelve a tu bandeja.', okLabel: 'Desbloquear', onOk: () => { p.blocked = p.blocked.filter(id => id !== o.id); HH.save(); HH.toast('Usuario desbloqueado', { type: 'ok' }); HH.refresh(); } });
        return;
      }
      HH.confirm({ title: 'Bloquear a ' + o.name.split(' ')[0], text: 'No va a poder escribirte y la conversación se oculta de tu bandeja. Podés deshacerlo cuando quieras.', okLabel: 'Bloquear', cls: 'danger', onOk: () => { p.blocked.push(o.id); HH.save(); HH.toast('Usuario bloqueado'); HH.go('#panel.mensajes'); } });
    },

    /* Suscripción */
    dashSubscribe(el) { const lv = el.dataset.level; if (!HH.LEVELS[lv]) return; HH.subscribe(me().id, lv, () => { HH.toast('Plan ' + HH.planName(lv) + ' activo', { type: 'ok' }); HH.refresh(); }); },
    dashBuyStar() { HH.buyStar(me().id, () => { HH.toast('Sos Star por ' + HH.STARS.days + ' días', { type: 'ok' }); HH.refresh(); }); },

    /* Ajustes */
    dashSaveAccount(form, ev, v) {
      const u = me(); const name = String(v.name || '').trim(), email = String(v.email || '').trim();
      if (!name) { HH.toast('Poné tu nombre', { type: 'warn' }); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { HH.toast('Revisá el email', { type: 'warn' }); return; }
      if (HH.db.users.some(x => x.id !== u.id && x.email.toLowerCase() === email.toLowerCase())) { HH.toast('Ese email ya está en uso', { type: 'warn' }); return; }
      u.name = name; u.email = email; HH.save(); HH.renderShell(); HH.toast('Cuenta actualizada', { type: 'ok' });
    },
    dashChangePassword(form, ev, v) {
      const u = me();
      if (v.current !== u.password) { HH.toast('La contraseña actual no es correcta', { type: 'warn' }); form.querySelector('[name=current]').focus(); return; }
      if (String(v.next || '').length < 8) { HH.toast('La nueva contraseña necesita al menos 8 caracteres', { type: 'warn' }); return; }
      if (v.next !== v.confirm) { HH.toast('Las contraseñas no coinciden', { type: 'warn' }); form.querySelector('[name=confirm]').focus(); return; }
      if (v.next === v.current) { HH.toast('Elegí una contraseña distinta a la actual', { type: 'warn' }); return; }
      u.password = v.next; HH.save(); form.reset(); HH.toast('Contraseña actualizada', { type: 'ok' });
    },
    dashVfGo(el) { if (el.disabled) return; S.vfStep = el.dataset.step; HH.refresh(); window.scrollTo(0, 0); },
    dashVfDocType(el) { const d = prof().verifyDraft || (prof().verifyDraft = {}); d.docType = el.value; if (el.value === 'pasaporte') d.docBack = null; HH.save(); HH.refresh(); },
    dashVfFile(el) {
      const file = el.files && el.files[0]; if (!file) return; const k = el.dataset.k; const p = prof(); const d = p.verifyDraft || (p.verifyDraft = {});
      if (k === 'video') {
        if (!file.type.startsWith('video/')) { HH.toast('Elegí o grabá un video', { type: 'warn' }); return; }
        const url = URL.createObjectURL(file); const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true;
        const done = (secs) => {
          const meta = { name: file.name, size: file.size, seconds: secs ? Math.round(secs) : null, src: null };
          if (secs && (secs < 2 || secs > 30)) { HH.toast('El video tiene que durar entre 2 y 30 segundos', { type: 'warn' }); URL.revokeObjectURL(url); return; }
          if (file.size <= 600 * 1024) { HH.readFile(file, (src) => { meta.src = src; d.video = meta; HH.save(); HH.refresh(); }, { private: true }); }
          else { meta.src = null; d.video = meta; HH.save(); HH.refresh(); }
        };
        v.onloadedmetadata = () => done(v.duration); v.onerror = () => done(null); v.src = url;
        return;
      }
      if (!file.type.startsWith('image/')) { HH.toast('Elegí una foto', { type: 'warn' }); return; }
      HH.compressImage(file, (src) => { d[k] = src; try { HH.save(); } catch (e) {} HH.refresh(); });
    },
    dashVfSubmit() {
      const p = prof(); const d = p.verifyDraft || {};
      if (!d.docFront || (d.docType !== 'pasaporte' && !d.docBack) || !d.selfie || !d.video) { HH.toast('Faltan pasos por completar', { type: 'warn' }); return; }
      if (!byId('vfConsent').checked) { HH.toast('Confirmá que los datos son tuyos y que sos mayor de 18', { type: 'warn' }); return; }
      p.verification = Object.assign({}, d, { sentAt: HH.now() }); p.verifySelfie = d.selfie; p.verifySentAt = HH.now(); p.verifyDraft = null; p.verified = 'pending'; const auto = HH.onVerificationSent ? HH.onVerificationSent(p) : false; S.vfStep = null; HH.save();
      HH.toast(auto ? 'Listo: verificamos tu identidad' : 'Recibido. Lo revisamos y te avisamos', { type: 'ok' }); HH.go('#panel');
    },
    dashSavePayout(form, ev, v) {
      const p = prof(); const method = String(v.method || ''), email = String(v.email || '').trim();
      if (!method) { HH.toast('Elegí un método de cobro', { type: 'warn' }); return; }
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { HH.toast('Revisá el email de cobro', { type: 'warn' }); return; }
      p.payout = { method, email, updatedAt: HH.now() }; HH.save(); HH.toast('Datos de cobro guardados', { type: 'ok' });
    },
    dashToggleNotif(el) {
      const p = prof(); p.notifications = Object.assign({ messages: true, requests: true, sales: true, renewal: true }, p.notifications || {});
      const k = el.dataset.k; p.notifications[k] = !p.notifications[k]; el.setAttribute('aria-checked', p.notifications[k]); HH.save();
    },
    dashToggleVisibility() {
      const p = prof();
      if (p.hidden) {
        HH.confirm({ title: 'Mostrar mi cuenta', text: 'Volvés a aparecer en el sitio' + (HH.requirementsOf(p).ok && HH.levelOf(p.userId) ? '.' : ' cuando completes los requisitos y tengas un plan activo.'), okLabel: 'Mostrar', onOk: () => { p.hidden = false; p.hiddenAt = null; HH.save(); HH.toast('Tu cuenta vuelve a estar visible', { type: 'ok' }); HH.refresh(); } });
      } else {
        HH.confirm({ title: 'Ocultar mi cuenta', text: 'Nadie va a ver tu perfil, tus historias ni tus shorts, y el link a tu perfil deja de abrir. Conservás tu contenido, tus mensajes, tus ventas y tu plan. Podés volver a mostrarte cuando quieras.', okLabel: 'Ocultar', cls: 'danger', onOk: () => { p.hidden = true; p.hiddenAt = HH.now(); HH.save(); HH.toast('Tu cuenta está oculta'); HH.refresh(); } });
      }
    },
  };
  Object.assign(HH.actions, A);
})();
