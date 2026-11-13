/* ============================================================
   SexyRose MVP — views-admin.js
   Panel de administración: #admin.(resumen|acompanantes|stars|pagos|reportes|clientes)
   Acciones con prefijo adm*. IIFE, sin módulos.
   ============================================================ */
(function () {
  'use strict';
  const esc = HH.esc, icon = HH.icon;

  /* ---------- CSS puntual (una sola vez) ---------- */
  const CSS = `
.dash.adm-dash{grid-template-columns:minmax(0,1fr)}
@media (min-width:900px){.dash.adm-dash{grid-template-columns:216px minmax(0,1fr);gap:22px}}
.adm-who .n svg{width:14px;height:14px;color:var(--gold);vertical-align:-2px;fill:var(--gold)}
.adm-dash .dash-main{grid-template-columns:minmax(0,1fr)}
.adm-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
@media (min-width:720px){.adm-stats{grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}}
.adm-stats .stat .v{font-size:22px}
@media (min-width:720px){.adm-stats .stat .v{font-size:26px}}
.adm-stats .stat{overflow:hidden}
.adm-stats .stat .d{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.adm-dash .list-item > svg{width:20px;height:20px;flex:none;color:var(--berry)}
.adm-dash .list-item > svg:last-child{color:var(--muted);width:18px;height:18px}
.adm-row{cursor:pointer}
.adm-row:hover td{background:var(--surface-2)}
.adm-acts{display:flex;gap:6px;flex-wrap:nowrap;align-items:center}
.adm-acts .btn{padding-inline:10px;gap:5px}
.adm-acts .btn svg{width:15px;height:15px;flex:none}
.adm-wtable td.c-verif{white-space:normal;min-width:118px;max-width:140px}
.adm-wtable .adm-vcell .badge{white-space:normal;line-height:1.25;text-align:left}
.adm-wtable .adm-who > div{max-width:150px}.adm-wtable .adm-who .n,.adm-wtable .adm-who .s{overflow:hidden;text-overflow:ellipsis}
@media (max-width:1231px){.adm-wtable td:last-child,.adm-wtable th:last-child{position:sticky;right:0;z-index:1;box-shadow:-10px 0 12px -10px rgba(0,0,0,.7)}.adm-wtable td:last-child{background:var(--surface)}.adm-wtable tr.adm-row:hover td:last-child{background:var(--surface-2)}}
.adm-acts .btn.ghost{border:1px solid var(--line)}
.adm-acts .btn span{display:none}.adm-acts .btn{width:34px;height:34px;padding:0;justify-content:center}

.adm-who{display:flex;gap:10px;align-items:center;min-width:0}
.adm-who .n{font-weight:700;white-space:nowrap}
.adm-who .s{font-size:12px;color:var(--muted);white-space:nowrap}
.adm-filters{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.adm-filters .input{max-width:320px}
.adm-bars .bar i{width:100%;max-width:38px}
.adm-vf-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.adm-vf{display:grid;gap:4px}
.adm-slots{display:grid;gap:14px;grid-template-columns:1fr}
@media (min-width:720px){.adm-slots{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:1100px){.adm-slots{grid-template-columns:repeat(3,minmax(0,1fr))}}
.adm-slot{display:grid;gap:10px;align-content:start}
.adm-photos{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;max-width:440px}
.adm-mini{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
@media (min-width:720px){.adm-mini{grid-template-columns:repeat(6,1fr)}}
.adm-dash .chip{white-space:nowrap;flex:none}
.adm-dash table.table{font-size:13px}
.adm-dash table.table th,.adm-dash table.table td{padding:9px 8px}
.adm-dash table.table th:first-child,.adm-dash table.table td:first-child{padding-left:12px}
.adm-dash table.table td{white-space:nowrap}
.adm-dash table.table td.wrap{white-space:normal;min-width:200px;max-width:320px}
/* Categorías */
.adm-cats{display:grid;gap:8px}
.adm-cat{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:var(--radius-sm);background:var(--surface);min-width:0}
.adm-cat .ic{width:40px;height:40px;border-radius:12px;background:var(--berry-tint);color:var(--berry);display:grid;place-items:center;flex:none}
.adm-cat .ic svg{width:21px;height:21px}
.adm-cat .nm{font-weight:700;line-height:1.2}
.adm-cat .id{font-size:12px;color:var(--muted);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.adm-cat .use{font-size:12px;color:var(--muted);white-space:nowrap}
.adm-cat .ord{display:flex;flex-direction:column;gap:3px;flex:none}
.adm-cat .ord button{width:28px;height:22px;border-radius:7px;border:1px solid var(--line);background:var(--surface);color:var(--fg-2);display:grid;place-items:center;cursor:pointer}
.adm-cat .ord button svg{width:14px;height:14px}
.adm-cat .ord button:first-child svg{transform:rotate(180deg)}
.adm-cat .ord button:hover:not(:disabled){border-color:var(--berry);color:var(--berry)}
.adm-cat .ord button:disabled{opacity:.35;cursor:default}
.adm-cat .acts{display:flex;gap:6px;flex:none}
.adm-cat .acts .btn{padding-inline:9px}
@media (max-width:719px){.adm-cat .acts .btn span{display:none}.adm-cat .use{display:none}}
.adm-icons{display:grid;grid-template-columns:repeat(auto-fill,minmax(46px,1fr));gap:6px}
.adm-icons button{height:46px;border-radius:11px;border:1.5px solid var(--line);background:var(--surface);display:grid;place-items:center;color:var(--fg-2);cursor:pointer}
.adm-icons button svg{width:21px;height:21px}
.adm-icons button:hover{border-color:var(--line-2);color:var(--berry)}
.adm-icons button.active{border-color:var(--berry);background:var(--berry-tint);color:var(--berry)}
.adm-cat-prev{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--radius-sm);background:var(--surface-2)}
.adm-mail{white-space:pre-wrap;font-size:13px;line-height:1.5;padding:12px 14px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);color:var(--fg-2);max-height:220px;overflow:auto;margin-top:4px}
/* Portada */
.adm-ap{display:grid;gap:16px;align-items:start}
@media (min-width:900px){.adm-ap{grid-template-columns:minmax(0,1fr) 340px}}
@media (min-width:1100px){.adm-ap{grid-template-columns:minmax(0,1fr) 400px}}
.adm-ap .dropzone{padding:16px}
.adm-ap .textarea{min-height:130px}
.adm-ap .dropzone.has{border-style:solid;border-color:var(--berry);color:var(--fg)}
.adm-ap .dropzone img{max-height:150px;width:auto;margin:0 auto;border-radius:10px}
.adm-hero-prev{position:relative;overflow:hidden;border-radius:var(--radius-sm);border:1px solid var(--line);background:var(--surface-2);padding:18px;display:grid;gap:10px}
.adm-hero-prev .blob{position:absolute;border-radius:50%;filter:blur(40px);opacity:.5;pointer-events:none}
.adm-hero-prev > *{position:relative}
.adm-hero-prev .t{font-family:var(--font-display);font-size:24px;line-height:1.12;font-weight:700;letter-spacing:-.01em;overflow-wrap:anywhere}
.adm-hero-prev .t em{font-style:italic;color:var(--berry);font-weight:500}
.adm-hero-prev .s{font-size:13px;color:var(--fg-2);line-height:1.45;overflow-wrap:anywhere}
.adm-hero-prev .media{margin-top:4px}
.adm-hero-prev .btn{pointer-events:none}
@media (min-width:900px){.adm-ap .adm-sticky{position:sticky;top:84px}}
/* Ubicaciones */
.adm-vcell{display:flex;flex-direction:column;align-items:flex-start;gap:4px}
.adm-pend{display:grid;gap:12px;grid-template-columns:minmax(0,1fr)}
@media (min-width:1100px){.adm-pend{grid-template-columns:repeat(2,minmax(0,1fr))}.adm-pend.one{grid-template-columns:minmax(0,1fr)}.adm-pend.one .adm-kv{grid-template-columns:repeat(4,minmax(0,1fr))}}
.adm-pcard{display:grid;gap:12px;align-content:start;border-color:var(--line-2)}
.adm-pcard .hd{display:flex;align-items:center;gap:10px;min-width:0}
.adm-pcard .hd .ic{width:40px;height:40px;border-radius:12px;background:var(--warn-tint);color:var(--warn);display:grid;place-items:center;flex:none}
.adm-pcard .hd .ic svg{width:20px;height:20px}
.adm-pcard .hd .nm{font-weight:800;font-size:17px;line-height:1.2;overflow-wrap:anywhere}
.adm-path{display:flex;flex-wrap:wrap;align-items:center;gap:2px 4px;font-size:13px;color:var(--fg-2)}
.adm-path svg{width:13px;height:13px;color:var(--muted);flex:none}
.adm-path b{color:var(--fg)}
.adm-kv{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.adm-kv > div{background:var(--surface-2);border-radius:10px;padding:8px 10px;min-width:0}
.adm-kv .k{font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.05em}
.adm-kv .v{font-size:13px;font-weight:700;overflow-wrap:anywhere}
.adm-kv .v a{font-weight:700}
.adm-pcard .acts{display:flex;flex-wrap:wrap;gap:8px}
.adm-tree-card{padding:12px}
@media (min-width:720px){.adm-tree-card{padding:16px}}
.adm-tree ul{list-style:none;margin:0;padding:0}
.adm-tree ul ul{margin-left:14px;padding-left:9px;border-left:1px solid var(--line)}
@media (min-width:720px){.adm-tree ul ul{margin-left:18px;padding-left:14px}}
.adm-tree ul ul > li{position:relative}
.adm-tree ul ul > li::before{content:'';position:absolute;left:-9px;top:21px;width:7px;border-top:1px solid var(--line)}
@media (min-width:720px){.adm-tree ul ul > li::before{left:-14px;width:11px}}
.adm-node{display:flex;align-items:center;gap:9px;padding:6px 6px;border-radius:10px;min-width:0}
.adm-node:hover{background:var(--surface-2)}
.adm-node .ic{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;flex:none;background:var(--bg-2);color:var(--fg-2)}
.adm-node .ic svg{width:16px;height:16px}
.adm-node.lvl-country .ic{background:var(--berry-tint);color:var(--berry)}
.adm-node.lvl-city .ic{background:transparent;color:var(--pink)}
.adm-node.is-pending .ic{background:var(--warn-tint);color:var(--warn)}
.adm-node .tx{min-width:0;flex:1 1 auto}
.adm-node .nm{font-weight:700;line-height:1.25;overflow-wrap:anywhere}
.adm-node.lvl-country .nm{font-size:15px;font-weight:800}
.adm-node.lvl-city .nm{font-weight:600}
.adm-node .bd{display:flex;flex-wrap:wrap;gap:4px;margin-top:2px}
.adm-node .bd .badge{font-size:11px;padding:1px 7px}
.adm-node .cnt{font-size:12px;color:var(--muted);white-space:nowrap;text-align:right}
.adm-node .cnt strong{color:var(--fg);font-size:13px}
.adm-node .cnt.zero{opacity:.6}
.adm-node .acts{display:flex;gap:4px;flex:none;justify-content:flex-end;min-width:36px}
@media (min-width:720px){.adm-node .acts{min-width:142px}}
.adm-node .acts .btn{padding:6px 9px;font-size:12px}
.adm-node .acts .btn svg{width:14px;height:14px}
@media (max-width:719px){.adm-node .acts .btn span{display:none}.adm-node .cnt .l{display:none}}
.adm-hl{background:var(--berry-tint);color:var(--berry);border-radius:4px;padding:0 2px}
.adm-tree-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
.adm-tree-bar .input{max-width:320px;flex:1 1 200px}
.adm-legend{display:flex;flex-wrap:wrap;gap:10px;font-size:12px;color:var(--muted)}
.adm-legend span{display:inline-flex;align-items:center;gap:4px}
.adm-legend svg{width:13px;height:13px}
.adm-ref{display:grid;gap:4px}
.adm-ref button{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:8px 10px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--fg);cursor:pointer;min-width:0}
.adm-ref button:hover:not(:disabled){border-color:var(--berry)}
.adm-ref button:disabled{opacity:.55;cursor:default}
.adm-ref button svg{width:15px;height:15px;color:var(--pink);flex:none}
.adm-ref .p{font-size:12px;color:var(--muted)}
.adm-ref .grow{min-width:0}
`;
  if (!document.getElementById('adm-css')) { const s = document.createElement('style'); s.id = 'adm-css'; s.textContent = CSS; document.head.appendChild(s); }

  /* ---------- Estado de filtros (vive mientras dura la sesión de la pestaña) ---------- */
  const S = { wq: '', wf: 'all', pq: '', pf: 'all', plimit: 100, cq: '', lq: '' };

  /* ---------- Helpers ---------- */
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const TYPE_LABEL = { subscription: 'Suscripción', star: 'Stars', one_time: 'Contenido', pack: 'Pack', chat: 'Chat', request: 'Pedido' };
  const TYPE_BADGE = { subscription: 'level-B', star: 'gold', one_time: 'info', pack: 'neutral', chat: 'ok', request: 'warn' };
  const nameOf = (userId) => { const p = HH.profileOf(userId); if (p) return p.displayName; const u = HH.userById(userId); return u ? u.name : 'Usuario'; };
  const avatarOf = (userId, size) => { const p = HH.profileOf(userId); if (p) return HH.avatar(p, size); const u = HH.userById(userId); return u ? HH.userAvatar(u, size) : HH.avatar(null, size); };
  const shortDate = (iso) => { try { return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch (e) { return iso; } };
  const dias = (n) => n + ' ' + HH.plural(n, 'día', 'días');
  const ym = (iso) => String(iso || '').slice(0, 7);
  const thisMonth = () => HH.today().slice(0, 7);
  const approved = () => HH.db.payments.filter(p => p.status === 'approved');
  const platformPays = () => approved().filter(p => !p.workerId);
  const workerPays = () => approved().filter(p => p.workerId);
  const pendingVerif = () => HH.db.profiles.filter(p => p.verified === 'pending');
  const openReports = () => HH.db.reports.filter(r => r.status === 'abierto');
  const clients = () => HH.db.users.filter(u => u.role === 'client');
  const salesOf = (workerId) => HH.db.purchases.filter(p => p.workerId === workerId);
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const matches = (q, ...fields) => { const n = norm(q).trim(); return !n || fields.some(f => norm(f).includes(n)); };

  const verifBadge = (p) => p.verified === 'verified' ? `<span class="badge info"${p.verifiedBy === 'ai' ? ' title="Verificada automáticamente"' : ''}>${icon('verified')} Verificada${p.verifiedBy === 'ai' ? ' · AI' : ''}</span>`
    : p.verified === 'pending' ? `<span class="badge warn">${icon('clock')} Pendiente</span>`
    : p.verified === 'rejected' ? `<span class="badge danger">Rechazada</span>` : `<span class="badge neutral">Sin verificar</span>`;
  const statusBadge = (p) => p.status === 'suspended' ? `<span class="badge danger">${icon('ban')} Suspendida</span>`
    : p.status === 'active' ? (!HH.levelOf(p.userId) ? `<span class="badge neutral">Sin plan</span>` : HH.requirementsOf(p).ok ? `<span class="badge ok">Publicada</span>` : `<span class="badge neutral">Sin publicar</span>`)
    : `<span class="badge neutral">Sin publicar</span>`;
  const who = (userId, size = 34, sub) => { const p = HH.profileOf(userId); const u = HH.userById(userId); const s = sub != null ? sub : (p ? (p.city || '') : (u ? u.email : '')); return `<div class="adm-who">${avatarOf(userId, size)}<div style="min-width:0"><div class="n">${esc(nameOf(userId))}${p && HH.isStar(userId) ? ' ' + icon('star') : ''}</div>${s ? `<div class="s">${esc(s)}</div>` : ''}</div></div>`; };
  // Ubicación nueva (pendiente) de una acompañante, si la tiene
  const newLocOf = (p) => { const l = HH.locByName(p.homeCity || p.city); return l && l.status === 'pending' ? l : null; };
  const newLocBadge = (p) => { const l = newLocOf(p); return l ? `<span class="badge warn">${icon('pin')} Ubicación nueva: ${esc(l.name)}</span>` : ''; };
  const pendingLocs = () => HH.pendingLocations();
  const chip = (label, active, action, data) => `<button type="button" class="chip${active ? ' active' : ''}" aria-pressed="${active ? 'true' : 'false'}" data-action="${action}" ${data}>${label}</button>`;

  /* ---------- Layout ---------- */
  const TABS = [
    { id: 'resumen', label: 'Resumen', icon: 'dashboard' },
    { id: 'acompanantes', label: 'Acompañantes', icon: 'users' },
    { id: 'ubicaciones', label: 'Ubicaciones', icon: 'pin' },
    { id: 'stars', label: 'Stars', icon: 'star' },
    { id: 'pagos', label: 'Pagos', icon: 'wallet' },
    { id: 'reportes', label: 'Reportes', icon: 'flag' },
    { id: 'clientes', label: 'Clientes', icon: 'user' },
    { id: 'categorias', label: 'Categorías', icon: 'grid' },
    { id: 'apariencia', label: 'Portada', icon: 'image' },
  ];
  // Otros módulos (ops.js) suman pestañas, vistas y contadores
  HH.adminTabs = TABS; HH.adminViews = HH.adminViews || {}; HH.adminCounts = HH.adminCounts || {};
  HH.adminLayout = (me, tab, inner) => layout(me, tab, inner);
  function layout(me, tab, inner) {
    const counts = { acompanantes: pendingVerif().length, ubicaciones: pendingLocs().length, reportes: openReports().length };
    Object.keys(HH.adminCounts).forEach(k => { counts[k] = HH.adminCounts[k](); });
    const nav = TABS.map(t => `<a href="#admin.${t.id}" data-go="#admin.${t.id}"${t.id === tab ? ' class="active" aria-current="page"' : ''}>${icon(t.icon)}<span>${t.label}</span>${counts[t.id] ? `<span class="count">${counts[t.id]}</span>` : ''}</a>`).join('');
    const chips = TABS.map(t => `<a href="#admin.${t.id}" class="chip${t.id === tab ? ' active' : ''}" data-go="#admin.${t.id}">${icon(t.icon)} ${t.label}${counts[t.id] ? ` <span class="badge" style="padding:0 6px">${counts[t.id]}</span>` : ''}</a>`).join('');
    return `<div class="container" style="padding-block:18px 32px">
      <div class="dash adm-dash">
        <aside class="dash-side">
          <div class="who">${HH.userAvatar(me, 44)}<div class="grow"><div class="ellipsis" style="font-weight:800">Administración</div><div class="small muted ellipsis">${esc(me.email)}</div></div></div>
          <nav class="dash-nav" aria-label="Panel admin">${nav}</nav>
        </aside>
        <div class="dash-main">
          <div class="dash-tabs"><div class="chips scroll">${chips}</div></div>
          ${inner}
        </div>
      </div>
    </div>`;
  }
  const head = HH.adminHead = (title, right, sub) => `<div class="page-head"><div><span class="eyebrow">Administración</span><h2>${title}</h2>${sub ? `<p class="small muted" style="margin-top:4px">${sub}</p>` : ''}</div>${right || ''}</div>`;
  const stat = (k, v, d, cls) => `<div class="stat ${cls || ''}"><span class="k">${k}</span><span class="v">${v}</span>${d ? `<span class="d">${d}</span>` : ''}</div>`;

  /* ---------- Tab: Resumen ---------- */
  function tabResumen(me) {
    const m = thisMonth();
    const platMonth = HH.sum(platformPays().filter(p => ym(p.createdAt) === m), p => p.amountUsd) + HH.sum(workerPays().filter(p => ym(p.createdAt) === m), p => HH.feeOf(p));
    const workMonth = HH.sum(workerPays().filter(p => ym(p.createdAt) === m), p => p.amountUsd);
    const stars = HH.activeStars();
    const stats = `<div class="adm-stats">
      ${stat('Ingresos del mes', HH.money(platMonth), 'plataforma: planes, Stars y comisiones', 'accent')}
      ${stat('Ventas del mes', HH.money(workMonth), 'de las acompañantes')}
      ${stat('Publicadas', HH.publishedProfiles().length, `de ${HH.db.profiles.length} acompañantes`)}
      ${stat('Por verificar', pendingVerif().length, pendingVerif().length ? 'esperan revisión' : 'todo al día')}
      ${stat('Clientes', clients().length, `${clients().filter(c => c.blocked).length} bloqueados`)}
      ${stat('Stars activas', `${stars.length}`, `${HH.STARS.slots_per_region} por provincia/estado · ${HH.starRegions().length} regiones`)}
    </div>`;

    // Gráfico: ingresos de la plataforma en los últimos 6 meses
    const now = new Date(); const months = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); months.push({ key, label: MONTHS[d.getMonth()], total: HH.sum(platformPays().filter(p => ym(p.createdAt) === key), p => p.amountUsd) }); }
    const max = Math.max(1, ...months.map(x => x.total));
    const chart = `<div class="card"><div class="row between"><div class="card-title">Ingresos de la plataforma</div><span class="small muted">últimos 6 meses</span></div>
      <div class="bars adm-bars" role="img" aria-label="Ingresos por mes: ${months.map(x => x.label + ' ' + HH.money(x.total)).join(', ')}">${months.map(x => `<div class="bar${x.key === m ? ' cur' : ''}"><span>${HH.money(x.total)}</span><i style="height:${Math.max(3, Math.round(84 * x.total / max))}px"></i><b>${x.label}</b></div>`).join('')}</div>
    </div>`;

    const last = approved().slice().sort(HH.by('createdAt')).slice(0, 10);
    const table = `<div class="card"><div class="row between" style="margin-bottom:10px"><div class="card-title">Últimos movimientos</div><a class="btn ghost sm" href="#admin.pagos" data-go="#admin.pagos">Ver todos ${icon('chevronRight')}</a></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Usuario</th><th>Tipo</th><th>Concepto</th><th class="num">Monto</th></tr></thead><tbody>
      ${last.map(p => `<tr><td class="small muted">${HH.fmtDateTime(p.createdAt)}</td><td>${esc(nameOf(p.userId))}</td><td><span class="badge ${TYPE_BADGE[p.type] || 'neutral'}">${TYPE_LABEL[p.type] || esc(p.type)}</span></td><td class="wrap small">${esc(p.description)}</td><td class="num"><strong>${HH.money(p.amountUsd)}</strong></td></tr>`).join('')}
      </tbody></table></div></div>`;

    const pend = [];
    if (pendingVerif().length) pend.push({ icon: 'shield', title: `${pendingVerif().length} ${HH.plural(pendingVerif().length, 'perfil espera', 'perfiles esperan')} verificación`, sub: pendingVerif().map(p => p.displayName).join(', '), go: '#admin.acompanantes', action: 'admGoPending' });
    const pl = pendingLocs();
    if (pl.length) pend.push({ icon: 'pin', title: `${pl.length} ${HH.plural(pl.length, 'ubicación nueva', 'ubicaciones nuevas')} para aprobar`, sub: pl.map(l => l.name + (HH.locParent(l) ? ' (' + HH.locParent(l).name + ')' : '')).join(', '), go: '#admin.ubicaciones' });
    if (openReports().length) pend.push({ icon: 'flag', title: `${openReports().length} ${HH.plural(openReports().length, 'reporte abierto', 'reportes abiertos')}`, sub: 'Revisá y resolvé antes de 24 h', go: '#admin.reportes' });
    stars.filter(s => HH.daysLeft(s.activeUntil) < 7).forEach(s => pend.push({ icon: 'star', title: `Slot Star de ${nameOf(s.workerId)} vence en ${dias(HH.daysLeft(s.activeUntil))}`, sub: 'Avisale para renovar o liberá el slot', go: '#admin.stars' }));
    const quick = [
      { icon: 'grid', title: 'Categorías de salidas', sub: `${HH.ACTIVITIES.length} ${HH.plural(HH.ACTIVITIES.length, 'categoría')} · crear, editar y ordenar`, go: '#admin.categorias' },
      { icon: 'image', title: 'Portada de inicio', sub: HH.settings().hero.image ? 'Textos, botones e imagen de portada' : 'Textos y botones · sin imagen (muestra tarjetas)', go: '#admin.apariencia' },
    ];
    const item = (x) => `<a class="list-item" href="${x.go}" data-go="${x.go}"${x.action ? ` data-action="${x.action}"` : ''} style="color:inherit">${icon(x.icon)}<div class="grow"><div class="title">${x.title}</div><div class="sub ellipsis">${esc(x.sub)}</div></div>${icon('chevronRight')}</a>`;
    const pendHtml = `<div class="card"><div class="card-title" style="margin-bottom:10px">Acciones pendientes</div>${pend.length ? `<div class="list">${pend.map(item).join('')}</div>` : `<div class="notice ok">${icon('checkCircle')}<span>Todo al día. No hay verificaciones, ubicaciones nuevas, reportes ni slots por vencer.</span></div>`}
      <div class="card-title" style="margin:14px 0 10px">Configuración del sitio</div><div class="list">${quick.map(item).join('')}</div></div>`;

    return layout(me, 'resumen', `${head('Resumen', `<span class="small muted">${HH.fmtDate(HH.now(), { day: 'numeric', month: 'long', year: 'numeric' })}</span>`)}${stats}<div class="grid-2" style="align-items:start">${chart}${pendHtml}</div>${table}`);
  }

  /* ---------- Tab: Acompañantes ---------- */
  function workerRows() {
    let list = HH.db.profiles.slice().sort(HH.by('createdAt'));
    if (S.wf === 'pending') list = list.filter(p => p.verified === 'pending');
    if (S.wf === 'suspended') list = list.filter(p => p.status === 'suspended');
    if (S.wf === 'noplan') list = list.filter(p => !HH.levelOf(p.userId));
    list = list.filter(p => matches(S.wq, p.displayName, p.city, p.country, (HH.userById(p.userId) || {}).name));
    if (!list.length) return `<div class="empty">${icon('search')}<h4>Sin resultados</h4><p class="small">Probá con otro nombre o quitá los filtros.</p></div>`;
    return `<div class="table-wrap"><table class="table adm-wtable"><thead><tr><th>Acompañante</th><th>Plan</th><th>Verificación</th><th>Estado</th><th class="num">Visitas</th><th class="num c-ventas">Ventas</th><th class="c-alta">Alta</th><th>Acciones</th></tr></thead><tbody>
      ${list.map(p => `<tr class="adm-row" data-action="admWorkerDetail" data-id="${esc(p.userId)}" tabindex="0">
        <td>${who(p.userId, 34)}</td>
        <td>${HH.levelBadge(HH.levelOf(p.userId), true)}</td>
        <td class="c-verif"><div class="adm-vcell">${verifBadge(p)}${newLocBadge(p)}</div></td>
        <td>${statusBadge(p)}</td>
        <td class="num">${(p.stats && p.stats.views || 0).toLocaleString('es-AR')}</td>
        <td class="num c-ventas">${salesOf(p.userId).length}</td>
        <td class="small muted c-alta">${shortDate(p.createdAt)}</td>
        <td><div class="adm-acts">${workerActions(p)}<a class="icon-btn sm" href="#perfil.${esc(p.slug)}" data-go="#perfil.${esc(p.slug)}" aria-label="Ver perfil público" title="Ver perfil público">${icon('eye')}</a></div></td>
      </tr>`).join('')}
    </tbody></table></div><div class="small muted" style="margin-top:8px">${list.length} ${HH.plural(list.length, 'perfil', 'perfiles')}. Tocá una fila para ver el detalle.</div>`;
  }
  // En la tabla: verificación pendiente → Verificar / Rechazar; si no → Suspender / Reactivar. Siempre: Eliminar cuenta y Ver perfil.
  // Botones con ícono + texto corto; el texto se oculta en pantallas angostas (queda el ícono con su tooltip).
  const actBtn = (cls, action, id, ic, label, title) => `<button type="button" class="btn ${cls} sm" data-action="${action}" data-id="${esc(id)}" title="${esc(title || label)}" aria-label="${esc(title || label)}">${icon(ic)}<span>${label}</span></button>`;
  const workerActions = (p) => (p.verified === 'pending'
    ? actBtn('ok', 'admVerify', p.userId, 'check', 'Verificar', newLocOf(p) ? 'Verificar y aprobar ubicación nueva' : 'Verificar') + actBtn('danger', 'admRejectVerif', p.userId, 'x', 'Rechazar', 'Rechazar verificación')
    : p.status === 'suspended' ? actBtn('secondary', 'admReactivate', p.userId, 'refresh', 'Reactivar') : actBtn('ghost', 'admSuspend', p.userId, 'ban', 'Suspender'))
    + actBtn('danger', 'admReportDelete', p.userId, 'trash', 'Eliminar', 'Eliminar cuenta');
  function tabAcompanantes(me) {
    const f = (id, label, count) => chip(label + (count != null ? ` <span class="badge" style="padding:0 6px">${count}</span>` : ''), S.wf === id, 'admWorkerFilter', `data-filter="${id}"`);
    const filters = `<div class="adm-filters">
      <label class="sr-only" for="admWq">Buscar acompañante</label><input class="input" id="admWq" type="search" placeholder="Buscar por nombre o ciudad" value="${esc(S.wq)}" data-input="admWorkerSearch">
      <div class="chips scroll" style="flex:1 1 auto;min-width:0">${f('all', 'Todas')}${f('pending', 'Por verificar', pendingVerif().length)}${f('suspended', 'Suspendidas')}${f('noplan', 'Sin plan')}</div>
    </div>`;
    return layout(me, 'acompanantes', `${head('Acompañantes', null, `${HH.db.profiles.length} registradas · ${HH.publishedProfiles().length} publicadas`)}${filters}<div id="admWorkersTable">${workerRows()}</div>`);
  }
  HH.adminWorkerDetail = (p) => workerDetailModal(p);
  function workerDetailModal(p) {
    const u = HH.userById(p.userId) || {};
    const earnings = HH.earningsOf(p.userId); const total = HH.sum(earnings, x => x.amountUsd);
    const items = HH.contentOf(p.userId); const packs = HH.packsOf(p.userId);
    const sub = HH.activeSubscription(p.userId);
    const nl = newLocOf(p);
    const locNote = nl ? `<div class="notice warn">${icon('pin')}<span>Se registró en <strong>${esc(nl.name)}</strong>, una ubicación que todavía no está en el sitio (${esc(HH.locLabel(nl, { country: true }))}).${p.verified === 'pending' ? ' Al verificarla, la ubicación queda aprobada.' : ' Aprobala desde <a href="#admin.ubicaciones" data-go="#admin.ubicaciones" data-action="closeModal">Ubicaciones</a>.'}</span></div>` : '';
    const body = `<div class="stack">
      <div class="row nowrap" style="gap:12px;align-items:flex-start">${HH.avatar(p, 56)}<div class="grow">
        <div class="row" style="gap:6px"><strong style="font-size:17px">${esc(p.displayName)}${p.age ? ', ' + p.age : ''}</strong>${HH.isStar(p.userId) ? HH.starBadge() : ''}</div>
        <div class="small muted">${esc([p.city, p.country].filter(Boolean).join(', ') || 'Sin ciudad')} · ${esc(u.email || '')}</div>
        <div class="row" style="gap:6px;margin-top:6px">${HH.levelBadge(HH.levelOf(p.userId))}${verifBadge(p)}${statusBadge(p)}${newLocBadge(p)}</div>
        <div style="margin-top:8px"><button type="button" class="btn secondary sm" data-go="#perfil.${esc(p.slug)}" data-action="closeModal">${icon('eye')} Ver perfil público</button></div>
      </div></div>
      ${locNote}
      ${p.headline ? `<div style="font-weight:700">${esc(p.headline)}</div>` : ''}
      <p class="small" style="color:var(--fg-2)">${p.bio ? esc(p.bio) : '<span class="muted">Sin presentación todavía.</span>'}</p>
      <div class="chips">${p.activities && p.activities.length ? HH.activityChips(p.activities) : '<span class="small muted">Sin actividades elegidas.</span>'}</div>
      <div class="grid-2" style="gap:10px">
        <div class="card soft pad-sm"><div class="tiny muted">WhatsApp</div><div style="font-weight:700">${p.whatsapp ? `<a href="${HH.whatsappLink(p.whatsapp)}" target="_blank" rel="noopener">${esc(p.whatsapp)}</a>` : '<span class="muted">No cargado</span>'}</div></div>
        <div class="card soft pad-sm"><div class="tiny muted">Tarifa orientativa · chat</div><div style="font-weight:700">${p.rateFrom ? HH.money(p.rateFrom) + '/h' : 'Sin tarifa'} · chat desde ${HH.money(HH.chatFrom(p))}</div></div>
        <div class="card soft pad-sm"><div class="tiny muted">Plan</div><div style="font-weight:700">${sub ? `Plan ${HH.planName(HH.levelOf(p.userId) || sub.level)} · vence ${HH.fmtDate(sub.expiresAt)}` : 'Sin plan activo'}</div></div>
        <div class="card soft pad-sm"><div class="tiny muted">Ingresos generados</div><div style="font-weight:700">${HH.money(total)} <span class="small muted">· ${earnings.length} ${HH.plural(earnings.length, 'venta')}</span></div></div>
      </div>
      ${(() => { const v = p.verification || (p.verifySelfie ? { selfie: p.verifySelfie, sentAt: p.verifySentAt } : null); if (!v && p.verified !== 'pending') return '';
        const box = (src, label, isVid) => `<div class="adm-vf"><div class="media square" style="border-radius:12px">${src ? (isVid ? `<video src="${src}" controls muted playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video>` : `<img src="${src}" alt="${label}">`) : `<div class="ph" style="background:var(--surface-2);color:var(--muted)">${icon(isVid ? 'video' : 'image')}</div>`}</div><span class="tiny muted">${label}</span></div>`;
        return `<div><div class="label" style="margin-bottom:6px">Verificación de identidad${v && v.sentAt ? ' · enviada ' + HH.timeAgo(v.sentAt) : ''}${v && v.docType ? ' · ' + ({ dni: 'DNI', cedula: 'Cédula', pasaporte: 'Pasaporte' }[v.docType] || v.docType) : ''}</div>
          ${v ? `<div class="adm-vf-grid">${box(v.docFront, 'Documento · frente')}${v.docType !== 'pasaporte' ? box(v.docBack, 'Documento · dorso') : ''}${box(v.selfie, 'Selfie')}${box(v.video && v.video.src, 'Video' + (v.video && v.video.seconds ? ' · ' + v.video.seconds + ' s' : ''), true)}</div>` : '<p class="small muted">Sin archivos (dato de demo).</p>'}
          <p class="small muted" style="margin-top:6px">Chequeá: documento vigente y legible, mayor de 18, la selfie y el video coinciden con la foto del documento y con las fotos del perfil, y en el video la persona gira la cabeza.</p></div>`; })()}
      ${HH.aiReviewHtml ? HH.aiReviewHtml(p) : ''}
      <div><div class="label" style="margin-bottom:6px">Fotos de perfil <span class="muted num">${(p.photos || []).filter(Boolean).length}/${HH.galleryLimits(p.userId).photos}</span> · Videos <span class="muted num">${HH.profileVideos(p).length}/${HH.galleryLimits(p.userId).videos}</span></div><div class="adm-photos">${(p.photos || []).filter(Boolean).map((_, i) => HH.photo(p, i, { cls: 'square' })).join('') || '<span class="small muted">Sin fotos</span>'}${HH.profileVideos(p).map(v => `<div class="media square" style="position:relative">${HH.videoMedia(v, { controls: !!v.src })}</div>`).join('')}</div></div>
      <div><div class="label" style="margin-bottom:6px">Contenido publicado · ${items.length} ${HH.plural(items.length, 'ítem', 'ítems')}${packs.length ? ` · ${packs.length} ${HH.plural(packs.length, 'pack')}` : ''}</div>${items.length ? `<div class="adm-mini">${items.slice(0, 12).map(it => HH.contentThumb(it, { cls: 'square', noLock: true, noTag: true })).join('')}</div>` : '<div class="small muted">Todavía no publicó contenido.</div>'}</div>
      <div class="small muted">Visitas: ${(p.stats && p.stats.views || 0).toLocaleString('es-AR')} · Swipes a la derecha: ${(p.stats && p.stats.rightSwipes || 0).toLocaleString('es-AR')} · Alta: ${shortDate(p.createdAt)}</div>
    </div>`;
    const actions = [];
    if (p.verified === 'pending') { actions.push({ label: icon('check') + (nl ? ' Verificar y aprobar ubicación' : ' Verificar'), cls: 'ok', onClick: () => HH.actions.admVerify({ dataset: { id: p.userId } }) }); actions.push({ label: 'Rechazar', cls: 'danger', onClick: () => HH.actions.admRejectVerif({ dataset: { id: p.userId } }) }); }
    if (p.status === 'suspended') actions.push({ label: icon('refresh') + ' Reactivar', cls: 'secondary', onClick: () => HH.actions.admReactivate({ dataset: { id: p.userId } }) });
    else actions.push({ label: icon('ban') + ' Suspender', cls: 'danger', onClick: () => HH.actions.admSuspend({ dataset: { id: p.userId } }) });
    actions.push({ label: icon('trash') + ' Eliminar cuenta', cls: 'danger', onClick: () => deleteAccountModal(p) });
    actions.push({ label: 'Cerrar', cls: 'ghost', action: 'closeModal' });
    HH.modal({ title: 'Detalle de ' + p.displayName, body, actions, wide: true });
  }

  /* ---------- Eliminar cuenta por incumplimiento ---------- */
  const DEL = { userId: null };
  const delPreviewHtml = (p, reason, text) => { const u = HH.userById(p.userId) || {}; const m = HH.removalEmail(p, u, reason, text || '[tu escrito]');
    return `<div class="tiny muted">Para: ${esc(m.to)} · Asunto: ${esc(m.subject)}</div><div class="adm-mail">${esc(m.body)}</div>`; };
  function deleteAccountModal(p, reportId) {
    DEL.userId = p.userId; DEL.reportId = reportId || null;
    const items = HH.contentOf(p.userId).length; const pend = HH.requestsOf(p.userId).filter(r => r.status === 'pendiente' || r.status === 'pagado').length;
    const body = `<form class="stack" id="admDelForm" data-submit="admDeleteAccount" novalidate>
      <div class="notice danger">${icon('alert')}<span>Se elimina la cuenta de <strong>${esc(p.displayName)}</strong> y no se puede deshacer: perfil, fotos, videos, ${items} ${HH.plural(items, 'contenido')}, historias, Star y chats.${pend ? ` ${pend} ${HH.plural(pend, 'pedido pago pendiente', 'pedidos pagos pendientes')} se reembolsan.` : ''} Pagos y compras quedan registrados por contabilidad.</span></div>
      <div class="field"><label for="admDelReason">Motivo</label><select class="select" id="admDelReason" name="reason" data-change="admDelPreview">${Object.entries(HH.POLICY_REASONS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
      <div class="field"><label for="admDelText">Tu escrito (se envía tal cual en el email)</label><textarea class="textarea" id="admDelText" name="text" rows="5" maxlength="2000" data-input="admDelPreview" placeholder="Explicá qué política incumplió y qué se detectó."></textarea><span class="hint">Mínimo 30 caracteres.</span></div>
      <div><div class="label" style="margin-bottom:6px">Vista previa del email</div><div id="admDelPrev">${delPreviewHtml(p, 'contenido', '')}</div></div>
      <label class="row nowrap" style="gap:8px;align-items:flex-start"><input type="checkbox" id="admDelOk" name="ok" value="1"><span class="small">Entiendo que la cuenta se elimina de forma definitiva.</span></label>
    </form>`;
    HH.modal({ title: 'Eliminar cuenta', body, actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: icon('trash') + ' Eliminar y enviar email', cls: 'danger', id: 'admDelBtn', onClick: () => HH.actions.admDeleteAccount() }] });
  }
  HH.adminDeleteAccountModal = deleteAccountModal;

  /* ---------- Tab: Stars ---------- */
  function tabStars(me) {
    const countries = HH.starRegions();
    if (S.starCountry === undefined || (S.starCountry && !countries.includes(S.starCountry))) S.starCountry = countries.find(c => c === 'Capital Federal (CABA)' || c === 'Ciudad de Buenos Aires') || countries[0] || '';
    const country = S.starCountry;
    const active = HH.activeStarsIn(country).slice().sort(HH.by('activeUntil', 1));
    const candidates = HH.publishedProfiles().filter(p => !HH.isStar(p.userId) && HH.starRegionOf(p.userId) === country).sort((a, b) => a.displayName.localeCompare(b.displayName));
    const countryBar = `<div class="card pad-sm row" style="gap:10px"><label for="admStarCountry" class="small" style="font-weight:700">Provincia / estado</label><select class="select" id="admStarCountry" data-change="admStarCountry" style="max-width:260px">${countries.map(c => `<option value="${esc(c)}"${c === country ? ' selected' : ''}>${esc(c)} · ${HH.activeStarsIn(c).length}/${HH.STARS.slots_per_country}</option>`).join('')}</select><span class="small muted">Cada país tiene ${HH.STARS.slots_per_country} slots por mes.</span></div>`;
    const slots = [];
    for (let i = 0; i < HH.STARS.slots_per_region; i++) {
      const s = active[i];
      if (s) {
        const left = HH.daysLeft(s.activeUntil); const pct = Math.round(HH.clamp(left / HH.STARS.days, 0, 1) * 100);
        slots.push(`<div class="card adm-slot">
          <div class="row between"><span class="eyebrow">Slot ${i + 1}</span>${HH.starBadge()}</div>
          ${who(s.workerId, 48)}
          <div class="small">Hasta el <strong>${HH.fmtDate(s.activeUntil, { day: 'numeric', month: 'long' })}</strong> · ${dias(left)} restantes</div>
          <div class="progress${left < 7 ? ' warn' : ''}"><span style="width:${pct}%"></span></div>
          <div class="row"><button class="btn danger sm" data-action="admFreeStar" data-id="${esc(s.id)}">${icon('x')} Liberar slot</button><a class="btn ghost sm" href="#perfil.${esc((HH.profileOf(s.workerId) || {}).slug || '')}" data-go="#perfil.${esc((HH.profileOf(s.workerId) || {}).slug || '')}">Ver perfil</a></div>
        </div>`);
      } else {
        slots.push(`<div class="card adm-slot" style="border-style:dashed">
          <div class="row between"><span class="eyebrow">Slot ${i + 1}</span><span class="badge ok">Libre</span></div>
          <p class="small muted">Asignalo sin cobro (cortesía o acuerdo comercial). La acompañante aparece destacada ${HH.STARS.days} días.</p>
          <div class="field"><label for="admStarSel${i}">Acompañante</label><select class="select" id="admStarSel${i}">${candidates.length ? candidates.map(p => `<option value="${esc(p.userId)}">${esc(p.displayName)}${p.city ? ' · ' + esc(p.city) : ''} · ${HH.planName(HH.levelOf(p.userId))}</option>`).join('') : '<option value="">No hay perfiles publicados disponibles</option>'}</select></div>
          <div><button class="btn sm" data-action="admAssignStar" data-select="admStarSel${i}"${candidates.length ? '' : ' disabled'}>${icon('star')} Asignar ${HH.STARS.days} días</button></div>
        </div>`);
      }
    }
    const history = HH.db.stars.slice().sort(HH.by('createdAt'));
    const table = `<div class="card"><div class="card-title" style="margin-bottom:10px">Historial de slots</div>${history.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Acompañante</th><th>Desde</th><th>Hasta</th><th class="num">Restan</th><th>Estado</th></tr></thead><tbody>
      ${history.map(s => { const on = new Date(s.activeUntil) > new Date(); return `<tr><td>${who(s.workerId, 30, '')}</td><td class="small muted">${s.createdAt ? shortDate(s.createdAt) : '—'}</td><td class="small muted">${shortDate(s.activeUntil)}</td><td class="num">${on ? dias(HH.daysLeft(s.activeUntil)) : '—'}</td><td>${on ? '<span class="badge ok">Activo</span>' : '<span class="badge neutral">Vencido</span>'}</td></tr>`; }).join('')}
      </tbody></table></div>` : `<div class="small muted">Todavía no se asignó ningún slot.</div>`}</div>`;
    return layout(me, 'stars', `${head('Stars', `<span class="badge gold">${icon('star')} ${active.length}/${HH.STARS.slots_per_region} ocupados en ${esc(country)}${HH.starVisitorsIn(country).length ? ' · +' + HH.starVisitorsIn(country).length + ' de viaje' : ''}</span>`, `${HH.STARS.slots_per_region} lugares por provincia/estado, por mes (las Stars de viaje se suman sin ocupar lugar) · ${HH.money(HH.STARS.price_usd)} por ${HH.STARS.days} días cuando lo compra la acompañante.`)}${countryBar}<div class="adm-slots">${slots.join('')}</div>${table}`);
  }

  /* ---------- Tab: Pagos ---------- */
  function payRows() {
    let list = approved().slice().sort(HH.by('createdAt'));
    if (S.pf !== 'all') list = list.filter(p => p.type === S.pf);
    list = list.filter(p => matches(S.pq, nameOf(p.userId), p.workerId ? nameOf(p.workerId) : 'Plataforma', p.description, p.ref));
    const shown = list.slice(0, S.plimit);
    if (!list.length) return `<div class="empty">${icon('wallet')}<h4>Sin pagos para ese filtro</h4><p class="small">Probá con otro tipo o quitá la búsqueda.</p></div>`;
    return `<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Pagó</th><th>Cobra</th><th>Tipo</th><th>Concepto</th><th class="num">Monto</th><th>Estado</th></tr></thead><tbody>
      ${shown.map(p => `<tr><td class="small muted">${HH.fmtDateTime(p.createdAt)}</td><td>${esc(nameOf(p.userId))}</td><td>${p.workerId ? esc(nameOf(p.workerId)) : `<span class="badge">${icon('home')} Plataforma</span>`}</td><td><span class="badge ${TYPE_BADGE[p.type] || 'neutral'}">${TYPE_LABEL[p.type] || esc(p.type)}</span></td><td class="wrap small">${esc(p.description)}</td><td class="num"><strong>${HH.money(p.amountUsd)}</strong>${HH.feeOf(p) ? `<div class="tiny muted">comisión ${p.feePct}% · ${HH.money(HH.feeOf(p))}</div>` : ''}</td><td><span class="badge ok">Aprobado</span></td></tr>`).join('')}
    </tbody></table></div>
    <div class="row between" style="margin-top:8px"><span class="small muted">Mostrando ${shown.length} de ${list.length}</span>${list.length > shown.length ? `<button class="btn secondary sm" data-action="admMorePays">Ver más</button>` : ''}</div>`;
  }
  function tabPagos(me) {
    const all = approved(); const plat = HH.sum(platformPays(), p => p.amountUsd); const work = HH.sum(workerPays(), p => p.amountUsd); const fees = HH.sum(workerPays(), p => HH.feeOf(p));
    const stats = `<div class="adm-stats">${stat('Total procesado', HH.money(plat + work), `${all.length} pagos`)}${stat('Plataforma', HH.money(plat + fees), `planes y Stars${fees ? ' + ' + HH.money(fees) + ' de comisiones' : ''}`, 'accent')}${stat('Acompañantes', HH.money(work - fees), 'neto: contenido, chat y pedidos')}</div>`;
    const types = [['all', 'Todos'], ['subscription', 'Suscripciones'], ['star', 'Stars'], ['one_time', 'Contenido'], ['pack', 'Packs'], ['chat', 'Chat'], ['request', 'Pedidos']];
    const filters = `<div class="adm-filters">
      <label class="sr-only" for="admPq">Buscar pago</label><input class="input" id="admPq" type="search" placeholder="Buscar por usuario o concepto" value="${esc(S.pq)}" data-input="admPaySearch">
      <div class="chips scroll" style="flex:1 1 auto;min-width:0">${types.map(([id, l]) => chip(l, S.pf === id, 'admPayFilter', `data-filter="${id}"`)).join('')}</div>
    </div>`;
    return layout(me, 'pagos', `${head('Pagos', null, 'Checkout de demostración: todos los pagos figuran aprobados.')}${stats}${filters}<div id="admPaysTable">${payRows()}</div>`);
  }

  /* ---------- Tab: Reportes ---------- */
  function tabReportes(me) {
    const list = HH.db.reports.slice().sort((a, b) => (a.status === b.status ? (a.createdAt < b.createdAt ? 1 : -1) : a.status === 'abierto' ? -1 : 1));
    const cards = list.map(r => {
      const tp = HH.profileOf(r.targetId); const tu = HH.userById(r.targetId);
      const kind = tp ? 'Acompañante' : (tu && tu.role === 'client' ? 'Cliente' : 'Usuario');
      const sanctioned = tp ? tp.status === 'suspended' : !!(tu && tu.blocked);
      const open = r.status === 'abierto';
      return `<article class="card stack" style="gap:10px">
        <div class="row between" style="align-items:flex-start">
          <div class="adm-who">${avatarOf(r.targetId, 40)}<div style="min-width:0"><div class="n">${esc(nameOf(r.targetId))} <span class="badge neutral">${kind}</span>${sanctioned ? ` <span class="badge danger">${tp ? 'Suspendida' : 'Bloqueado'}</span>` : ''}</div><div class="s">Reportado por ${esc(nameOf(r.byId))} · ${HH.timeAgo(r.createdAt)}</div></div></div>
          <span class="badge ${open ? 'warn' : 'ok'}">${open ? 'Abierto' : 'Resuelto'}</span>
        </div>
        <p>${esc(r.reason)}</p>
        ${open ? `<div class="row">${sanctioned ? '' : `<button class="btn danger sm" data-action="admSanction" data-id="${esc(r.id)}">${icon('ban')} ${tp ? 'Suspender acompañante' : 'Bloquear cliente'}</button>`}${tp ? `<button class="btn danger sm" data-action="admReportDelete" data-id="${esc(tp.userId)}">${icon('trash')} Eliminar cuenta</button>` : ''}<button class="btn ok sm" data-action="admResolveReport" data-id="${esc(r.id)}">${icon('check')} Marcar resuelto</button></div>` : `<div class="small muted">Resuelto${r.resolvedAt ? ' el ' + HH.fmtDate(r.resolvedAt) : ''}.</div>`}
      </article>`;
    });
    const body = cards.length ? `<div class="stack">${cards.join('')}</div>` : `<div class="card"><div class="empty">${icon('shield')}<h4>No hay reportes</h4><p class="small">Cuando una acompañante o un cliente reporte a alguien, aparece acá.</p></div></div>`;
    const rms = (HH.db.removals || []).slice().sort(HH.by('createdAt'));
    const removals = rms.length ? `<div class="card" style="margin-top:16px"><div class="card-title" style="margin-bottom:8px">${icon('trash')} Cuentas eliminadas · ${rms.length}</div>${rms.map(x => `<button type="button" class="list-item" style="width:100%;background:none;border:0;text-align:left;color:inherit;font:inherit;cursor:pointer" data-action="admRemovalView" data-id="${esc(x.id)}"><div class="grow"><div class="title ellipsis">${esc(x.name)} <span class="small muted">· ${esc(x.email)}</span></div><div class="sub">${esc(HH.POLICY_REASONS[x.reason] || x.reason)} · ${HH.fmtDate(x.createdAt)} · email enviado</div></div>${icon('chevronRight')}</button>`).join('')}</div>` : '';
    return layout(me, 'reportes', `${head('Reportes', `<span class="badge ${openReports().length ? 'warn' : 'ok'}">${openReports().length} ${HH.plural(openReports().length, 'abierto')}</span>`)}${body}${removals}`);
  }

  /* ---------- Tab: Clientes ---------- */
  function clientRows() {
    const list = clients().filter(u => matches(S.cq, u.name, u.email)).sort(HH.by('createdAt'));
    if (!list.length) return `<div class="empty">${icon('search')}<h4>Sin resultados</h4></div>`;
    return `<div class="table-wrap"><table class="table"><thead><tr><th>Cliente</th><th>Email</th><th>Alta</th><th class="num">Compras</th><th class="num">Pedidos</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
      ${list.map(u => { const pu = HH.purchasesOf(u.id); const spent = HH.sum(pu, p => p.amountUsd); const rq = HH.requestsByClient(u.id).length; return `<tr>
        <td>${who(u.id, 32, '')}</td><td class="small">${esc(u.email)}</td><td class="small muted">${shortDate(u.createdAt)}</td>
        <td class="num">${pu.length} <span class="small muted">· ${HH.money(spent)}</span></td><td class="num">${rq}</td>
        <td>${u.blocked ? `<span class="badge danger">${icon('ban')} Bloqueado</span>` : '<span class="badge ok">Activo</span>'}</td>
        <td>${u.blocked ? `<button class="btn secondary sm" data-action="admUnblock" data-id="${esc(u.id)}">${icon('refresh')} Desbloquear</button>` : `<button class="btn ghost sm" data-action="admBlock" data-id="${esc(u.id)}">${icon('ban')} Bloquear</button>`}</td>
      </tr>`; }).join('')}
    </tbody></table></div>`;
  }
  function tabClientes(me) {
    const filters = `<div class="adm-filters"><label class="sr-only" for="admCq">Buscar cliente</label><input class="input" id="admCq" type="search" placeholder="Buscar por nombre o email" value="${esc(S.cq)}" data-input="admClientSearch"></div>`;
    return layout(me, 'clientes', `${head('Clientes', null, `${clients().length} registrados · ${clients().filter(c => c.blocked).length} bloqueados`)}${filters}<div id="admClientsTable">${clientRows()}</div>`);
  }

  /* ---------- Tab: Categorías de salidas ---------- */
  const catUsage = (id) => HH.activityUsage(id);
  function catRows() {
    const list = HH.ACTIVITIES;
    if (!list.length) return `<div class="empty">${icon('grid')}<h4>No hay categorías</h4><p class="small">Sin categorías, las acompañantes no pueden elegir qué salidas ofrecen.</p><button class="btn sm" data-action="admCatNew">${icon('plus')} Nueva categoría</button></div>`;
    return `<div class="adm-cats" role="list">${list.map((a, i) => { const n = catUsage(a.id); return `<div class="adm-cat" role="listitem">
      <div class="ord"><button type="button" data-action="admCatMove" data-id="${esc(a.id)}" data-dir="-1" aria-label="Subir ${esc(a.label)}" title="Subir"${i === 0 ? ' disabled' : ''}>${icon('chevronDown')}</button><button type="button" data-action="admCatMove" data-id="${esc(a.id)}" data-dir="1" aria-label="Bajar ${esc(a.label)}" title="Bajar"${i === list.length - 1 ? ' disabled' : ''}>${icon('chevronDown')}</button></div>
      <span class="ic">${icon(a.icon)}</span>
      <div class="grow" style="min-width:0"><div class="nm ellipsis">${esc(a.label)}</div><div class="ellipsis"><span class="id">${esc(a.id)}</span><span class="tiny muted hide-desktop"> · ${n ? `${n} ${HH.plural(n, 'perfil', 'perfiles')}` : 'sin uso'}</span></div></div>
      <span class="use">${n ? `<span class="badge neutral">${n} ${HH.plural(n, 'perfil', 'perfiles')}</span>` : 'Sin uso'}</span>
      <div class="acts"><button type="button" class="btn ghost sm" data-action="admCatEdit" data-id="${esc(a.id)}" aria-label="Editar ${esc(a.label)}" title="Editar">${icon('edit')}<span>Editar</span></button><button type="button" class="btn ghost sm" data-action="admCatDelete" data-id="${esc(a.id)}" aria-label="Eliminar ${esc(a.label)}" title="Eliminar">${icon('trash')}<span>Eliminar</span></button></div>
    </div>`; }).join('')}</div>`;
  }
  function tabCategorias(me) {
    const n = HH.ACTIVITIES.length;
    const right = `<div class="row" style="gap:8px"><button class="btn secondary sm" data-action="admCatRestore">${icon('refresh')} Restaurar las 11 por defecto</button><button class="btn sm" data-action="admCatNew">${icon('plus')} Nueva categoría</button></div>`;
    return layout(me, 'categorias', `${head('Categorías de salidas', right, `${n} ${HH.plural(n, 'categoría')} · el orden de acá es el que ve todo el mundo`)}
      <div class="notice info">${icon('info')}<span>Estas categorías aparecen en el swipe, en los perfiles y en el editor de perfil de las acompañantes.</span></div>
      <div id="admCatList">${catRows()}</div>
      ${HH.adminInterestsCard ? HH.adminInterestsCard() : ''}`);
  }
  function catModal(a) {
    const editing = !!a; const cur = { label: a ? a.label : '', icon: a ? a.icon : 'sparkles' };
    const body = `<form data-submit="admCatSubmit" id="admCatForm" class="stack">
      <input type="hidden" name="id" value="${esc(a ? a.id : '')}"><input type="hidden" name="icon" id="admCatIcon" value="${esc(cur.icon)}">
      <div class="field"><label for="admCatName">Nombre</label><input class="input" id="admCatName" name="label" maxlength="24" required placeholder="Ej.: Teatro" value="${esc(cur.label)}" data-input="admCatPreview" autocomplete="off"><span class="hint">Corto y en singular. Máximo 24 caracteres.${editing ? ` El id <strong>${esc(a.id)}</strong> no cambia.` : ''}</span></div>
      <div class="field"><span class="label">Ícono</span><div class="adm-icons" id="admCatIcons" role="radiogroup" aria-label="Ícono">${HH.ACTIVITY_ICONS.map(ic => `<button type="button" class="${ic === cur.icon ? 'active' : ''}" role="radio" aria-checked="${ic === cur.icon}" data-action="admCatIconPick" data-icon="${ic}" aria-label="${ic}" title="${ic}">${icon(ic)}</button>`).join('')}</div></div>
      <div class="adm-cat-prev"><span class="small muted">Vista previa</span><span class="chip" id="admCatPrev" style="cursor:default">${icon(cur.icon)} ${esc(cur.label) || 'Nombre'}</span></div>
      <button type="submit" class="sr-only" tabindex="-1" aria-hidden="true">Guardar</button>
    </form>`;
    HH.modal({ title: editing ? 'Editar categoría' : 'Nueva categoría', body, actions: [
      { label: 'Cancelar', cls: 'ghost', action: 'closeModal' },
      { label: editing ? 'Guardar cambios' : 'Crear categoría', cls: '', onClick: () => catSave() },
    ] });
  }
  function catPreview() {
    const name = (document.getElementById('admCatName') || {}).value || ''; const ic = (document.getElementById('admCatIcon') || {}).value || 'sparkles';
    const prev = document.getElementById('admCatPrev'); if (prev) prev.innerHTML = `${icon(ic)} ${esc(name.trim()) || 'Nombre'}`;
  }
  function catSave() {
    const f = document.getElementById('admCatForm'); if (!f) return;
    const id = f.id.value, label = f.label.value.trim(), ic = f.icon.value || 'sparkles';
    const input = document.getElementById('admCatName');
    if (!label) { HH.toast('Escribí un nombre para la categoría', { type: 'warn' }); input && input.focus(); return; }
    if (label.length > 24) { HH.toast('El nombre no puede superar 24 caracteres', { type: 'warn' }); input && input.focus(); return; }
    const dup = HH.ACTIVITIES.find(x => x.id !== id && norm(x.label).trim() === norm(label));
    if (dup) { HH.toast(`Ya existe una categoría "${dup.label}"`, { type: 'warn' }); input && input.focus(); return; }
    if (id) { HH.updateActivity(id, { label, icon: ic }); HH.toast('Categoría actualizada', { type: 'ok' }); }
    else { HH.addActivity({ label, icon: ic }); HH.toast(`Categoría "${label}" creada`, { type: 'ok' }); }
    HH.closeModal(); HH.refresh();
  }

  /* ---------- Tab: Portada de inicio ---------- */
  // Borrador de la portada (vive mientras dura la pestaña). null → se carga de HH.settings() al abrir la tab.
  const AP = { draft: null, saved: false };
  const heroDraft = () => { if (!AP.draft) { const st = HH.settings(); AP.draft = Object.assign({}, HH.DEFAULT_SETTINGS.hero, st.hero, { defaultCity: HH.defaultCity() || HH.DEFAULT_SETTINGS.nearby.defaultCity }); } return AP.draft; };
  const heroTitle = (t) => esc(t || '').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  function heroPreview(d) {
    return `<div class="adm-hero-prev" aria-live="polite">
      <span class="blob" style="width:160px;height:160px;right:-50px;top:-60px;background:var(--pink)"></span>
      <span class="blob" style="width:120px;height:120px;left:-40px;bottom:-50px;background:var(--berry-tint)"></span>
      ${d.eyebrow ? `<span class="eyebrow">${esc(d.eyebrow)}</span>` : ''}
      <div class="t">${heroTitle(d.title) || '<span class="muted">Sin título</span>'}</div>
      ${d.subtitle ? `<p class="s">${esc(d.subtitle)}</p>` : ''}
      <div class="row" style="gap:8px"><span class="btn sm">${esc(d.ctaPrimary || 'Explorar perfiles')} ${icon('arrowRight')}</span><span class="btn secondary sm">${esc(d.ctaSecondary || 'Publicá tu perfil')}</span></div>
      ${d.image ? `<div class="media wide"><img src="${d.image}" alt="Imagen de portada"></div>` : `<div class="tiny muted" style="margin-top:2px">${icon('image')} Sin imagen: el inicio muestra la composición de tarjetas de perfiles.</div>`}
    </div>`;
  }
  function tabApariencia(me) {
    const d = heroDraft(); const saved = AP.saved; AP.saved = false;
    const cities = [...new Set(HH.publishedProfiles().map(p => p.city).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (d.defaultCity && !cities.includes(d.defaultCity)) cities.unshift(d.defaultCity);
    const fld = (name, label, val, hint, attrs = '') => `<div class="field"><label for="admAp_${name}">${label}</label><input class="input" id="admAp_${name}" name="${name}" value="${esc(val || '')}" data-input="admHeroInput" ${attrs}>${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
    const form = `<form class="card stack" data-submit="admHeroSave" id="admHeroForm">
      ${saved ? `<div class="notice ok">${icon('checkCircle')}<span>Portada guardada. <a href="#inicio" data-go="#inicio" style="font-weight:700">Ver inicio</a></span></div>` : ''}
      ${fld('eyebrow', 'Texto chico de arriba', d.eyebrow, 'Una etiqueta corta sobre el título.', 'maxlength="40"')}
      ${fld('title', 'Título', d.title, 'Usá *asteriscos* para resaltar una parte en rosa. Ej.: Planes simples, *mejor acompañados*.', 'maxlength="80" required')}
      <div class="field"><label for="admAp_subtitle">Subtítulo</label><textarea class="textarea" id="admAp_subtitle" name="subtitle" maxlength="320" data-input="admHeroInput">${esc(d.subtitle || '')}</textarea><span class="hint">Dos o tres frases: qué es SexyRose y cómo funciona.</span></div>
      <div class="grid-2">${fld('ctaPrimary', 'Botón principal', d.ctaPrimary, 'Lleva al swipe.', 'maxlength="28" required')}${fld('ctaSecondary', 'Botón secundario', d.ctaSecondary, 'Lleva al registro de acompañantes.', 'maxlength="28" required')}</div>
      <div class="field"><label for="admAp_defaultCity">Ciudad por defecto de "Cerca de mí"</label><select class="select" id="admAp_defaultCity" name="defaultCity" data-input="admHeroInput">${cities.map(c => `<option value="${esc(c)}"${c === d.defaultCity ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select><span class="hint">Se usa cuando el visitante todavía no eligió ciudad. Solo ciudades con perfiles publicados.</span></div>
      <div class="field"><span class="label">Imagen de portada</span>
        <label class="dropzone${d.image ? ' has' : ''}" for="admApImage" id="admApDrop">${d.image ? `<img src="${d.image}" alt=""><div class="small" style="margin-top:6px">Tocá para cambiar la imagen</div>` : `${icon('upload')}<div style="font-weight:700">Tocá para elegir una imagen</div><div class="tiny">JPG o PNG, horizontal. Si no hay imagen, el inicio muestra las tarjetas de perfiles.</div>`}</label>
        <input type="file" id="admApImage" class="sr-only" accept="image/*" data-change="admHeroImage">
        ${d.image ? `<div><button type="button" class="btn ghost sm" data-action="admHeroImageClear">${icon('trash')} Quitar imagen</button></div>` : ''}
      </div>
      <div class="divider"></div>
      <div class="row between" style="gap:8px"><button type="button" class="btn ghost sm" data-action="admHeroDefaults">${icon('refresh')} Restaurar textos por defecto</button><button type="submit" class="btn">${icon('check')} Guardar portada</button></div>
    </form>`;
    const prev = `<div class="card adm-sticky"><div class="row between" style="margin-bottom:10px"><div class="card-title">Vista previa</div><span class="small muted">se actualiza mientras escribís</span></div><div id="admHeroPrev">${heroPreview(d)}</div></div>`;
    const m = HH.mediaConfig(); const on = HH.cloudinaryOn();
    const media = `<form class="card stack" data-submit="admMediaSave" id="admMediaForm" style="margin-top:16px">
      <div class="row between"><div class="card-title">${icon('image')} Almacenamiento de imágenes y videos (Cloudinary)</div><span class="badge ${on ? 'ok' : ''}">${on ? 'Activo' : 'Modo demo'}</span></div>
      <div class="small muted">Fotos y videos del perfil, contenido y portada se suben a tu cuenta de Cloudinary. Sin configurar, la demo los guarda comprimidos en este navegador.</div>
      <div class="grid-2" style="align-items:start"><div class="field"><label for="admMd_cloud">Cloud name</label><input class="input" id="admMd_cloud" name="cloudName" value="${esc(m.cloudName)}" maxlength="60" autocomplete="off"></div>
      <div class="field"><label for="admMd_preset">Upload preset (unsigned)</label><input class="input" id="admMd_preset" name="uploadPreset" value="${esc(m.uploadPreset)}" maxlength="80" autocomplete="off"><span class="hint">Cloudinary → Settings → Upload → Upload presets → modo Unsigned.</span></div></div>
      <div class="grid-2" style="align-items:start"><div class="field"><label for="admMd_folder">Carpeta</label><input class="input" id="admMd_folder" name="folder" value="${esc(m.folder)}" maxlength="60"></div>
      <div class="field"><label for="admMd_wm">Logo para la marca de agua (public id)</label><input class="input" id="admMd_wm" name="watermarkId" value="${esc(m.watermarkId)}" maxlength="120"><span class="hint">Subí el logo en PNG blanco con fondo transparente a Cloudinary con este nombre. Se imprime grande y centrado en todas las fotos y videos.</span></div></div>
      <div class="notice">${icon('shield')}<span>Los documentos y selfies de verificación <b>no</b> se suben a Cloudinary público: quedan solo para revisión interna. En producción conviene firmar las subidas desde el servidor (preset firmado) en lugar de unsigned.</span></div>
      <div class="row" style="justify-content:flex-end"><button type="submit" class="btn">${icon('check')} Guardar</button></div>
    </form>`;
    const bs = HH.bookingSettings();
    const bkCard = `<form class="card stack" data-submit="admBookingSave" id="admBkForm" style="margin-top:16px">
      <div class="card-title">${icon('calendar')} Reservas de salidas</div>
      <div class="small muted">Las acompañantes de planes ${HH.BOOKING_PLANS.join(', ')} reciben reservas en su agenda. La seña la cobra cada una con su propio link de pago; SexyRose no la procesa.</div>
      <div class="grid-2" style="align-items:start"><div class="field"><label for="admBkPct">Seña (% de la tarifa por hora × duración)</label><input class="input" id="admBkPct" name="depositPct" type="number" min="5" max="100" step="5" value="${bs.depositPct}"></div>
      <div class="field"><label for="admBkMax">Duración máxima de una salida (horas)</label><input class="input" id="admBkMax" name="maxHours" type="number" min="1" max="12" value="${bs.maxHours}"></div></div>
      <div class="row" style="justify-content:flex-end"><button type="submit" class="btn">${icon('check')} Guardar</button></div>
    </form>`;
    return layout(me, 'apariencia', `${head('Portada de inicio', `<a class="btn ghost sm" href="#inicio" data-go="#inicio">${icon('eye')} Ver inicio</a>`, 'Lo primero que ve cualquier visitante al entrar al sitio.')}<div class="adm-ap">${form}${prev}</div>${media}${bkCard}`);
  }
  const heroRerender = () => { const el = document.getElementById('admHeroPrev'); if (el) el.innerHTML = heroPreview(heroDraft()); };

  /* ---------- Tab: Ubicaciones ---------- */
  const LV = {
    country: { label: 'País', opt: 'País', icon: 'globe', rank: 0 },
    region: { label: 'Provincia/Estado', opt: 'Provincia o estado', icon: 'grid', rank: 1 },
    zone: { label: 'Zona', opt: 'Zona', icon: 'list', rank: 2 },
    city: { label: 'Ciudad', opt: 'Ciudad o localidad', icon: 'pin', rank: 3 },
  };
  const NEXT_LEVEL = { country: 'region', region: 'city', zone: 'city' };
  const locs = () => HH.db.locations || [];
  const sortLocs = (a, b) => (a.level === 'city') - (b.level === 'city') || a.name.localeCompare(b.name, 'es');
  // Recorre el árbol en orden (padres antes que hijos) con los nodos que pasan el filtro
  const walkLocs = (filter, cb) => { const rec = (pid, depth) => locs().filter(l => (l.parentId || null) === pid && filter(l)).sort(sortLocs).forEach(l => { cb(l, depth); rec(l.id, depth + 1); }); rec(null, 0); };
  const pad = (depth) => '   '.repeat(depth);
  const pathHtml = (loc) => `<div class="adm-path">${HH.locPath(loc).map((x, i, a) => (i ? icon('chevronRight') : '') + (i === a.length - 1 ? `<b>${esc(x.name)}</b>` : `<span>${esc(x.name)}</span>`)).join('')}</div>`;
  const fmtCoord = (loc) => typeof loc.lat === 'number' && typeof loc.lng === 'number' ? `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}` : null;
  const ago = (iso) => { const t = HH.timeAgo(iso); return t === 'ahora' ? 'recién' : t === 'ayer' ? 'ayer' : 'hace ' + t; };
  const publishedIn = (name, pubs) => pubs.filter(p => HH.placeContains(name, p.city)).length;

  function pendingCards() {
    const list = pendingLocs().slice().sort(HH.by('createdAt'));
    if (!list.length) return `<div class="card"><div class="empty">${icon('checkCircle')}<h4>No hay ubicaciones pendientes</h4><p class="small">Cuando una acompañante se registre en una localidad que todavía no está en el sitio, aparece acá para que la apruebes.</p></div></div>`;
    return `<div class="adm-pend${list.length === 1 ? ' one' : ''}">${list.map(loc => {
      const u = loc.createdBy ? HH.userById(loc.createdBy) : null; const pr = loc.createdBy ? HH.profileOf(loc.createdBy) : null;
      const users = HH.profilesAt(loc.name); const n = users.length;
      const coords = fmtCoord(loc);
      const reqBy = u ? `${esc(pr ? pr.displayName : u.name)}${pr ? ` · <a href="#perfil.${esc(pr.slug)}" data-go="#perfil.${esc(pr.slug)}">Ver perfil</a>` : ''}` : '<span class="muted">Sin datos</span>';
      const waiting = users.filter(p => p.verified === 'pending');
      return `<article class="card adm-pcard">
        <div class="hd"><span class="ic">${icon('pin')}</span><div style="min-width:0;flex:1"><div class="nm">${esc(loc.name)}</div><div class="small muted">Pedida ${ago(loc.createdAt)}</div></div><span class="badge warn">${icon('clock')} Pendiente</span></div>
        ${pathHtml(loc)}
        <div class="adm-kv">
          <div><div class="k">Origen</div><div class="v">${loc.source === 'referencia' ? 'Base de referencia' : loc.source === 'manual' ? 'Escrita a mano' : 'Admin'}</div></div>
          <div><div class="k">La pidió</div><div class="v">${reqBy}</div></div>
          <div><div class="k">Acompañantes</div><div class="v">${n ? `${n} ${HH.plural(n, 'la usa', 'la usan')}` : 'Ninguna'}</div></div>
          <div><div class="k">Coordenadas</div><div class="v">${coords ? esc(coords) : '<span class="muted">Usa las de ' + esc((HH.locParent(loc) || {}).name || 'su zona') + '</span>'}</div></div>
        </div>
        ${waiting.length ? `<div class="small muted">${icon('shield')} ${esc(waiting.map(p => p.displayName).join(', '))} ${HH.plural(waiting.length, 'tiene', 'tienen')} la verificación de identidad pendiente: aprobar la ubicación no ${HH.plural(waiting.length, 'la publica', 'las publica')}. <a href="#admin.acompanantes" data-go="#admin.acompanantes" data-action="admGoPending">Ir a verificar</a></div>` : ''}
        <div class="acts">
          <button class="btn ok sm" data-action="admLocApprove" data-id="${esc(loc.id)}">${icon('check')} Aprobar</button>
          <button class="btn secondary sm" data-action="admLocMerge" data-id="${esc(loc.id)}">${icon('arrowRight')} Unificar con…</button>
          <button class="btn ghost sm" data-action="admLocReject" data-id="${esc(loc.id)}">${icon('x')} Rechazar</button>
        </div>
      </article>`;
    }).join('')}</div>`;
  }

  function treeHtml() {
    const all = locs().filter(l => l.status !== 'rejected');
    const pubs = HH.publishedProfiles();
    const q = norm(S.lq).trim();
    let show = null;
    if (q) {
      show = new Set();
      all.filter(l => norm(l.name).includes(q)).forEach(l => HH.locPath(l).forEach(x => show.add(x.id)));
      if (!show.size) return `<div class="empty">${icon('search')}<h4>Sin resultados para "${esc(S.lq.trim())}"</h4><p class="small">Probá con otro nombre o creala con "Nueva ubicación".</p></div>`;
    }
    const hl = (name) => {
      if (!q) return esc(name);
      const i = norm(name).indexOf(q); if (i < 0) return esc(name);
      return esc(name.slice(0, i)) + `<mark class="adm-hl">${esc(name.slice(i, i + q.length))}</mark>` + esc(name.slice(i + q.length));
    };
    const node = (l) => {
      const lv = LV[l.level] || LV.city; const pending = l.status === 'pending';
      const n = publishedIn(l.name, pubs);
      const canRemove = l.level === 'city' && !pending && HH.profilesAt(l.name).length === 0;
      const kids = all.filter(c => c.parentId === l.id && (!show || show.has(c.id))).sort(sortLocs);
      return `<li>
        <div class="adm-node lvl-${l.level}${pending ? ' is-pending' : ''}">
          <span class="ic" aria-hidden="true">${icon(lv.icon)}</span>
          <div class="tx"><div class="nm">${hl(l.name)}</div><div class="bd"><span class="badge neutral">${lv.label}</span>${pending ? `<span class="badge warn">Pendiente</span>` : ''}</div></div>
          <span class="cnt${n ? '' : ' zero'}" title="Acompañantes publicadas"><strong>${n}</strong> <span class="l">${HH.plural(n, 'publicada', 'publicadas')}</span></span>
          <div class="acts">
            ${l.level !== 'city' && !pending ? `<button type="button" class="btn ghost sm" data-action="admLocAddIn" data-name="${esc(l.name)}" aria-label="Agregar dentro de ${esc(l.name)}" title="Agregar dentro">${icon('plus')}<span>Agregar dentro</span></button>` : ''}
            ${canRemove ? `<button type="button" class="btn ghost sm" data-action="admLocRemove" data-id="${esc(l.id)}" aria-label="Quitar ${esc(l.name)}" title="Quitar">${icon('trash')}<span>Quitar</span></button>` : ''}
          </div>
        </div>
        ${kids.length ? `<ul>${kids.map(node).join('')}</ul>` : ''}
      </li>`;
    };
    const roots = all.filter(l => !l.parentId && (!show || show.has(l.id))).sort(sortLocs);
    return `<div class="adm-tree"><ul aria-label="Árbol de ubicaciones">${roots.map(node).join('')}</ul></div>`;
  }

  function tabUbicaciones(me) {
    const all = locs().filter(l => l.status !== 'rejected');
    const nCountries = all.filter(l => l.level === 'country').length, nCities = all.filter(l => l.level === 'city' && l.status === 'active').length;
    const pl = pendingLocs().length;
    const right = `<button class="btn sm" data-action="admLocNew">${icon('plus')} Nueva ubicación</button>`;
    const legend = `<div class="adm-legend" aria-hidden="true"><span>${icon('globe')} País</span><span>${icon('grid')} Provincia/Estado</span><span>${icon('list')} Zona</span><span>${icon('pin')} Ciudad</span></div>`;
    const tree = `<div class="card adm-tree-card">
      <div class="row between" style="margin-bottom:10px;gap:8px"><div class="card-title">Árbol de ubicaciones</div>${legend}</div>
      <div class="adm-tree-bar"><label class="sr-only" for="admLq">Buscar ubicación</label><input class="input" id="admLq" type="search" placeholder="Buscar ubicación: Merlo, Córdoba, Florida…" value="${esc(S.lq)}" data-input="admLocSearch" autocomplete="off"><span class="small muted" id="admLocPendHint">Las pendientes no aparecen en los filtros públicos.</span></div>
      <div id="admLocTree">${treeHtml()}</div>
    </div>`;
    return layout(me, 'ubicaciones', `${head('Ubicaciones', right, `${nCountries} ${HH.plural(nCountries, 'país', 'países')} · ${nCities} ${HH.plural(nCities, 'ciudad activa', 'ciudades activas')} · ${pl} ${HH.plural(pl, 'pendiente')}`)}
      <section class="stack" aria-labelledby="admPendTitle"><div class="row between"><h3 id="admPendTitle" style="font-size:17px">Pendientes de aprobación</h3>${pl ? `<span class="badge warn">${pl} ${HH.plural(pl, 'por revisar')}</span>` : ''}</div>${pendingCards()}</section>
      ${tree}`);
  }

  /* Modal: unificar */
  function mergeModal(loc) {
    const c = HH.locCoords(loc); let best = null, bestD = Infinity;
    const groups = []; const byParent = {};
    walkLocs(l => l.id !== loc.id && HH.isActiveLoc(l), (l) => {
      if (l.level !== 'city') return;
      const lc = HH.locCoords(l); if (c && lc) { const d = (lc[0] - c[0]) ** 2 + (lc[1] - c[1]) ** 2; if (d < bestD) { bestD = d; best = l.name; } }
      const par = HH.locParent(l); const key = par ? par.id : '_';
      if (!byParent[key]) { byParent[key] = { label: par ? HH.locPath(par).map(x => x.name).join(' › ') : 'Sin ubicación superior', items: [] }; groups.push(byParent[key]); }
      byParent[key].items.push(l);
    });
    const n = HH.profilesAt(loc.name).length;
    const body = `<p class="small" style="color:var(--fg-2)">Unificar <strong>${esc(loc.name)}</strong> con una ciudad que ya está en el sitio. ${n ? `${n === 1 ? 'La acompañante que la usa pasa' : `Las ${n} acompañantes que la usan pasan`} a la ubicación que elijas` : 'Ninguna acompañante la usa todavía'}, y "${esc(loc.name)}" deja de existir como ubicación.</p>
      <div class="field"><label for="admLocMergeSel">Ciudad destino</label><select class="select" id="admLocMergeSel">${groups.map(g => `<optgroup label="${esc(g.label)}">${g.items.map(l => `<option value="${esc(l.name)}"${l.name === best ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</optgroup>`).join('')}</select>${best ? `<span class="hint">Preseleccionamos la más cercana: ${esc(best)}.</span>` : ''}</div>
      <div class="notice info">${icon('info')}<span>Usalo cuando la localidad es un barrio o un nombre alternativo de una ciudad que ya tenés (por ejemplo, un barrio dentro de Ciudad de Buenos Aires).</span></div>`;
    HH.modal({ title: 'Unificar ubicación', body, actions: [
      { label: 'Cancelar', cls: 'ghost', action: 'closeModal' },
      { label: 'Unificar', cls: '', onClick: () => {
        const sel = document.getElementById('admLocMergeSel'); const target = sel && sel.value;
        if (!target) { HH.toast('Elegí una ciudad destino', { type: 'warn' }); return; }
        const ok = HH.mergeLocation(loc.id, target);
        HH.closeModal(); HH.refresh();
        HH.toast(ok ? `${loc.name} quedó unificada con ${target}` : 'No se pudo unificar', { type: ok ? 'ok' : 'warn' });
      } },
    ] });
  }

  /* Modal: nueva ubicación */
  const parentOptions = (level, selected) => {
    const rank = (LV[level] || LV.city).rank; const out = [];
    walkLocs(l => l.level !== 'city' && HH.isActiveLoc(l), (l, depth) => { if ((LV[l.level] || LV.city).rank < rank) out.push(`<option value="${esc(l.name)}"${l.name === selected ? ' selected' : ''}>${pad(depth)}${esc(l.name)}</option>`); });
    return `<option value=""${selected ? '' : ' selected'}>Elegí dónde va</option>` + out.join('');
  };
  function locModal({ parentName = '', level } = {}) {
    const par = parentName ? HH.locByName(parentName) : null;
    const lvl = level || (par ? NEXT_LEVEL[par.level] || 'city' : 'city');
    const body = `<form id="admLocForm" data-submit="admLocSubmit" class="stack" novalidate>
      <div class="card soft pad-sm stack" style="gap:8px">
        <label for="admLocRefQ" class="label">Elegir de la base de referencia</label>
        <input class="input" id="admLocRefQ" type="search" placeholder="Buscá una localidad: Morón, Tigre, Tandil…" data-input="admLocRefSearch" autocomplete="off">
        <div id="admLocRefRes" class="adm-ref" aria-live="polite"><span class="hint">Completa nombre, ubicación y coordenadas. Después podés ajustar lo que quieras.</span></div>
      </div>
      <div id="admLocErr"></div>
      <div class="field"><label for="admLocName">Nombre</label><input class="input" id="admLocName" name="name" maxlength="60" required placeholder="Ej.: Morón" autocomplete="off"><span class="hint">Único en todo el sitio. Para provincias usá "Provincia de …".</span></div>
      <div class="grid-2" style="gap:12px">
        <div class="field"><label for="admLocLevel">Nivel</label><select class="select" id="admLocLevel" name="level" data-change="admLocLevel">${Object.keys(LV).map(k => `<option value="${k}"${k === lvl ? ' selected' : ''}>${LV[k].opt}</option>`).join('')}</select></div>
        <div class="field" id="admLocParentField"${lvl === 'country' ? ' hidden' : ''}><label for="admLocParent">Va dentro de</label><select class="select" id="admLocParent" name="parentName">${parentOptions(lvl, parentName)}</select></div>
      </div>
      <div class="grid-2" style="gap:12px">
        <div class="field"><label for="admLocLat">Latitud <span class="muted">(opcional)</span></label><input class="input" id="admLocLat" name="lat" inputmode="decimal" placeholder="-34.6534" autocomplete="off"></div>
        <div class="field"><label for="admLocLng">Longitud <span class="muted">(opcional)</span></label><input class="input" id="admLocLng" name="lng" inputmode="decimal" placeholder="-58.6198" autocomplete="off"></div>
      </div>
      <span class="hint" style="margin-top:-6px">Si las dejás vacías, usamos las de la ubicación que la contiene.</span>
      <button type="submit" class="sr-only" tabindex="-1" aria-hidden="true">Guardar</button>
    </form>`;
    HH.modal({ title: par ? 'Nueva ubicación en ' + par.name : 'Nueva ubicación', body, actions: [
      { label: 'Cancelar', cls: 'ghost', action: 'closeModal' },
      { label: 'Guardar ubicación', cls: '', onClick: () => locSave() },
    ] });
  }
  function refResults(q) {
    const n = norm(q).trim();
    if (n.length < 2) return `<span class="hint">Completa nombre, ubicación y coordenadas. Después podés ajustar lo que quieras.</span>`;
    const res = HH.GEO_REF.filter(r => norm(r.name).includes(n) || norm(r.parent).includes(n))
      .sort((a, b) => (norm(a.name).includes(n) ? 0 : 1) - (norm(b.name).includes(n) ? 0 : 1) || (norm(a.name).startsWith(n) ? 0 : 1) - (norm(b.name).startsWith(n) ? 0 : 1) || a.name.localeCompare(b.name, 'es')).slice(0, 8);
    if (!res.length) return `<span class="hint">No está en la base de referencia. Cargala a mano con los campos de abajo.</span>`;
    return res.map(r => {
      const ex = HH.locByName(r.name); const inSite = ex && ex.status !== 'rejected';
      return `<button type="button" data-action="admLocRefPick" data-name="${esc(r.name)}"${inSite ? ' disabled' : ''}>${icon('pin')}<span class="grow"><strong>${esc(r.name)}</strong> <span class="p">· ${esc(r.parent)}</span></span>${inSite ? `<span class="badge ${ex.status === 'pending' ? 'warn' : 'neutral'}">${ex.status === 'pending' ? 'Pendiente' : 'Ya está'}</span>` : ''}</button>`;
    }).join('');
  }
  const locErr = (msg) => { const el = document.getElementById('admLocErr'); if (el) el.innerHTML = msg ? `<div class="notice warn" role="alert">${icon('alert')}<span>${esc(msg)}</span></div>` : ''; };
  const parseCoord = (v, max) => { const s = String(v == null ? '' : v).trim().replace(',', '.'); if (!s) return { v: '' }; const x = Number(s); return Number.isFinite(x) && Math.abs(x) <= max ? { v: x } : { error: true }; };
  function locSave() {
    const f = document.getElementById('admLocForm'); if (!f) return;
    const name = f.name.value.trim(), level = f.level.value, parentName = level === 'country' ? '' : f.parentName.value;
    const lat = parseCoord(f.lat.value, 90), lng = parseCoord(f.lng.value, 180);
    if (lat.error || lng.error) { locErr('Revisá las coordenadas: la latitud va de -90 a 90 y la longitud de -180 a 180.'); return; }
    if ((lat.v === '') !== (lng.v === '')) { locErr('Completá latitud y longitud, o dejá las dos vacías.'); return; }
    const par = parentName ? HH.locByName(parentName) : null;
    if (par && (LV[par.level] || LV.city).rank >= (LV[level] || LV.city).rank) { locErr(`Un nivel "${LV[level].opt}" no puede ir dentro de "${par.name}".`); return; }
    // Una ubicación quitada antes (rechazada) con el mismo nombre se reactiva en lugar de duplicarse
    const old = HH.locByName(name);
    if (old && old.status === 'rejected' && name.length >= 2 && (level === 'country' || par)) {
      Object.assign(old, { level, parentId: par ? par.id : null, lat: lat.v === '' ? null : lat.v, lng: lng.v === '' ? null : lng.v, status: 'active', source: 'admin', rejectedAt: null, approvedAt: HH.now() });
      HH.save(); HH.closeModal(); S.lq = ''; HH.refresh(); HH.toast(`${name} vuelve a estar disponible en el sitio`, { type: 'ok' }); return;
    }
    const r = HH.addLocation({ name, level, parentName, lat: lat.v, lng: lng.v });
    if (r.error) { locErr(r.error); const el = document.getElementById(/nombre/i.test(r.error) ? 'admLocName' : 'admLocParent'); el && el.focus(); return; }
    HH.closeModal(); HH.refresh();
    HH.toast(`${r.loc.name} agregada${par ? ' en ' + par.name : ''}`, { type: 'ok' });
  }

  /* ---------- Rutas ---------- */
  HH.route('admin.:tab', ({ tab }) => {
    if (!HH.requireRole('admin')) return false;
    const me = HH.me();
    const t = tab || 'resumen';
    const views = { resumen: tabResumen, acompanantes: tabAcompanantes, ubicaciones: tabUbicaciones, stars: tabStars, pagos: tabPagos, reportes: tabReportes, clientes: tabClientes, categorias: tabCategorias, apariencia: tabApariencia };
    Object.assign(views, HH.adminViews);
    if (!views[t]) { HH.go('#admin'); return false; }
    return views[t](me);
  }, { optional: true });

  /* ---------- Fallback solo para builds aislados (HH_ONLY): sin views-public no existe #inicio ---------- */
  if (!HH._isoHome) {
    HH._isoHome = true;
    HH.route('inicio', () => {
      const me = HH.me();
      const demo = [['u_admin', 'Admin demo', 'Administración'], ['u_cliente', 'Cliente demo', 'Martín Suárez'], ['u_vale', 'Acompañante demo', 'Valentina']];
      return `<div class="container narrow section"><div class="auth-card">
        <h3>SexyRose · build aislado</h3>
        <p class="small muted">Este build no incluye las vistas públicas. ${me ? `Sesión: <strong>${esc(me.name)}</strong>.` : 'Entrá con una cuenta demo:'}</p>
        ${me ? `<div class="row"><a class="btn" href="${HH.homeFor(me.role)}" data-go="${HH.homeFor(me.role)}">Ir a mi sección</a><button class="btn ghost" data-action="logout">Cerrar sesión</button></div>`
          : `<div class="demo-accounts">${demo.map(([id, r, n]) => `<button type="button" data-action="admIsoLogin" data-id="${id}">${avatarOf(id, 32)}<span class="grow"><strong>${n}</strong><br><span class="r">${r}</span></span>${icon('chevronRight')}</button>`).join('')}</div>`}
      </div></div>`;
    });
  }

  /* ---------- Acciones adm* ---------- */
  const profileById = (id) => HH.profileOf(id);
  const rerender = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  Object.assign(HH.actions, {
    admIsoLogin(el) { if (HH.login(el.dataset.id)) HH.go(HH.homeFor(HH.role())); },
    admGoPending() { S.wf = 'pending'; S.wq = ''; },

    // Acompañantes
    admWorkerSearch(el) { S.wq = el.value; rerender('admWorkersTable', workerRows()); },
    admWorkerFilter(el) { S.wf = el.dataset.filter; HH.refresh(); },
    admWorkerDetail(el) { const p = profileById(el.dataset.id); if (p) workerDetailModal(p); },
    admVerify(el) {
      const p = profileById(el.dataset.id); if (!p) return;
      const nl = newLocOf(p);
      HH.approveProfileVerification(p); HH.closeModal(); HH.refresh();
      HH.toast(p.displayName + ' quedó verificada' + (nl ? ' y ' + nl.name + ' ya está disponible en el sitio' : ''), { type: 'ok' });
    },
    admRejectVerif(el) {
      const p = profileById(el.dataset.id); if (!p) return;
      HH.closeModal();
      HH.confirm({ title: 'Rechazar verificación', text: `La verificación de <strong>${esc(p.displayName)}</strong> queda rechazada. Va a poder volver a enviarla desde su panel.`, okLabel: 'Rechazar', cls: 'danger', onOk: () => {
        p.verified = 'rejected'; HH.save(); HH.refresh(); HH.toast('Verificación rechazada', { type: 'warn' });
      } });
    },
    admSuspend(el) {
      const p = profileById(el.dataset.id); if (!p) return;
      HH.closeModal();
      HH.confirm({ title: 'Suspender perfil', text: `<strong>${esc(p.displayName)}</strong> deja de aparecer en el sitio hasta que la reactives. Sus compras y chats no se borran.`, okLabel: 'Suspender', cls: 'danger', onOk: () => {
        p.status = 'suspended'; HH.save(); HH.refresh(); HH.toast(p.displayName + ' suspendida', { type: 'warn' });
      } });
    },
    admReactivate(el) {
      const p = profileById(el.dataset.id); if (!p) return;
      p.status = 'active'; HH.save(); HH.closeModal(); HH.refresh();
      HH.toast(p.displayName + ' reactivada' + (HH.levelOf(p.userId) ? '' : ' (necesita un plan para publicarse)'), { type: 'ok' });
    },

    // Ubicaciones
    admLocSearch(el) { S.lq = el.value; rerender('admLocTree', treeHtml()); },
    admLocApprove(el) {
      const loc = HH.locById(el.dataset.id); if (!loc) return;
      HH.approveLocation(loc.id); HH.refresh();
      HH.toast(loc.name + ' ya está disponible en el sitio', { type: 'ok' });
    },
    admLocMerge(el) { const loc = HH.locById(el.dataset.id); if (loc) mergeModal(loc); },
    admLocReject(el) {
      const loc = HH.locById(el.dataset.id); if (!loc) return;
      const users = HH.profilesAt(loc.name); const names = users.map(p => '<strong>' + esc(p.displayName) + '</strong>').join(', ');
      HH.confirm({ title: 'Rechazar ubicación', text: `<strong>${esc(loc.name)}</strong> no se suma al sitio. ${users.length ? `${names} ${users.length === 1 ? 'va a tener' : 'van a tener'} que elegir otra ubicación desde su panel.` : 'Ninguna acompañante la usa.'}`, okLabel: 'Rechazar', cls: 'danger', onOk: () => {
        HH.rejectLocation(loc.id); HH.refresh(); HH.toast(loc.name + ' rechazada', { type: 'warn' });
      } });
    },
    admLocRemove(el) {
      const loc = HH.locById(el.dataset.id); if (!loc) return;
      if (HH.profilesAt(loc.name).length) { HH.toast('No se puede quitar: hay acompañantes en ' + loc.name, { type: 'warn' }); return; }
      HH.confirm({ title: 'Quitar ubicación', text: `<strong>${esc(loc.name)}</strong> deja de aparecer en el sitio y en los selectores. Ninguna acompañante la usa. Si la necesitás de nuevo, creala desde "Nueva ubicación".`, okLabel: 'Quitar', cls: 'danger', onOk: () => {
        HH.rejectLocation(loc.id); HH.refresh(); HH.toast(loc.name + ' quitada', { type: 'warn' });
      } });
    },
    admLocNew() { locModal(); },
    admLocAddIn(el) { locModal({ parentName: el.dataset.name }); },
    admLocLevel(el) {
      const field = document.getElementById('admLocParentField'); const sel = document.getElementById('admLocParent');
      if (field) field.hidden = el.value === 'country';
      if (sel) { const cur = sel.value; sel.innerHTML = parentOptions(el.value, cur); }
    },
    admLocRefSearch(el) { rerender('admLocRefRes', refResults(el.value)); },
    admLocRefPick(el) {
      const r = HH.GEO_REF.find(x => x.name === el.dataset.name); const f = document.getElementById('admLocForm'); if (!r || !f) return;
      f.name.value = r.name; f.level.value = 'city';
      const field = document.getElementById('admLocParentField'); if (field) field.hidden = false;
      f.parentName.innerHTML = parentOptions('city', r.parent);
      f.lat.value = r.lat; f.lng.value = r.lng; locErr('');
      const q = document.getElementById('admLocRefQ'); if (q) q.value = '';
      rerender('admLocRefRes', `<div class="notice ok">${icon('checkCircle')}<span>Cargamos <strong>${esc(r.name)}</strong> dentro de ${esc(r.parent)}, con sus coordenadas. Revisá y guardá.</span></div>`);
    },
    admLocSubmit() { locSave(); },

    // Stars
    admFreeStar(el) {
      const s = HH.db.stars.find(x => x.id === el.dataset.id); if (!s) return;
      HH.confirm({ title: 'Liberar slot Star', text: `<strong>${esc(nameOf(s.workerId))}</strong> deja de estar destacada ahora mismo. No hay reembolso automático.`, okLabel: 'Liberar slot', cls: 'danger', onOk: () => {
        HH.db.stars = HH.db.stars.filter(x => x.id !== s.id); HH.save(); HH.refresh(); HH.toast('Slot liberado', { type: 'ok' });
      } });
    },
    admStarCountry(el) { S.starCountry = el.value; HH.refresh(); },
    admAssignStar(el) {
      const sel = document.getElementById(el.dataset.select); const workerId = sel && sel.value; const p = workerId && HH.profileOf(workerId);
      if (!p) { HH.toast('Elegí una acompañante', { type: 'warn' }); return; }
      if (HH.starSlotsFree(HH.starRegionOf(p.userId)) <= 0) { HH.toast('No quedan lugares libres en ' + (HH.starRegionOf(p.userId) || 'esa provincia'), { type: 'warn' }); HH.refresh(); return; }
      if (HH.isStar(workerId)) { HH.toast(p.displayName + ' ya es Star', { type: 'warn' }); return; }
      HH.db.stars.push({ id: HH.uid('st'), workerId, activeUntil: HH.daysFromNow(HH.STARS.days), createdAt: HH.now() });
      HH.pay({ userId: workerId, amountUsd: 0, type: 'star', description: 'Asignado por admin', workerId: null, ref: workerId });
      HH.save(); HH.refresh();
      HH.toast(p.displayName + ' es Star por ' + HH.STARS.days + ' días', { type: 'ok' });
    },

    // Pagos
    admPaySearch(el) { S.pq = el.value; S.plimit = 100; rerender('admPaysTable', payRows()); },
    admPayFilter(el) { S.pf = el.dataset.filter; S.plimit = 100; HH.refresh(); },
    admMorePays() { S.plimit += 100; rerender('admPaysTable', payRows()); },

    // Reportes
    admSanction(el) {
      const r = HH.db.reports.find(x => x.id === el.dataset.id); if (!r) return;
      const tp = HH.profileOf(r.targetId); const tu = HH.userById(r.targetId);
      if (!tp && !tu) { HH.toast('El usuario reportado ya no existe', { type: 'warn' }); return; }
      HH.confirm({ title: tp ? 'Suspender acompañante' : 'Bloquear cliente', text: tp ? `<strong>${esc(tp.displayName)}</strong> deja de aparecer en el sitio hasta que la reactives.` : `<strong>${esc(tu.name)}</strong> no va a poder comprar ni chatear hasta que lo desbloquees.`, okLabel: tp ? 'Suspender' : 'Bloquear', cls: 'danger', onOk: () => {
        if (tp) tp.status = 'suspended'; else tu.blocked = true;
        HH.save(); HH.refresh(); HH.toast(tp ? tp.displayName + ' suspendida' : tu.name + ' bloqueado', { type: 'warn' });
      } });
    },
    admResolveReport(el) {
      const r = HH.db.reports.find(x => x.id === el.dataset.id); if (!r) return;
      r.status = 'resuelto'; r.resolvedAt = HH.now(); HH.save(); HH.refresh();
      HH.toast('Reporte marcado como resuelto', { type: 'ok' });
    },

    // Clientes
    admClientSearch(el) { S.cq = el.value; rerender('admClientsTable', clientRows()); },
    admBlock(el) {
      const u = HH.userById(el.dataset.id); if (!u) return;
      HH.confirm({ title: 'Bloquear cliente', text: `<strong>${esc(u.name)}</strong> no va a poder comprar ni chatear hasta que lo desbloquees.`, okLabel: 'Bloquear', cls: 'danger', onOk: () => {
        u.blocked = true; HH.save(); HH.refresh(); HH.toast(u.name + ' bloqueado', { type: 'warn' });
      } });
    },
    admUnblock(el) {
      const u = HH.userById(el.dataset.id); if (!u) return;
      u.blocked = false; HH.save(); HH.refresh(); HH.toast(u.name + ' desbloqueado', { type: 'ok' });
    },

    // Categorías de salidas
    admCatNew() { catModal(null); },
    admCatEdit(el) { const a = HH.ACTIVITIES.find(x => x.id === el.dataset.id); if (a) catModal(a); },
    admCatIconPick(el) {
      const ic = el.dataset.icon; const hid = document.getElementById('admCatIcon'); if (hid) hid.value = ic;
      el.parentElement.querySelectorAll('button').forEach(b => { const on = b === el; b.classList.toggle('active', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
      catPreview();
    },
    admCatPreview() { catPreview(); },
    admCatSubmit() { catSave(); },
    admCatMove(el) {
      const list = HH.db.activities; const i = list.findIndex(x => x.id === el.dataset.id); const j = i + Number(el.dataset.dir);
      if (i < 0 || j < 0 || j >= list.length) return;
      const [a] = list.splice(i, 1); list.splice(j, 0, a); HH.save();
      rerender('admCatList', catRows());
      const btn = [...document.querySelectorAll('.adm-cat [data-action="admCatMove"]')].find(b => b.dataset.id === a.id && b.dataset.dir === el.dataset.dir); if (btn && !btn.disabled) btn.focus();
    },
    admCatDelete(el) {
      const a = HH.ACTIVITIES.find(x => x.id === el.dataset.id); if (!a) return;
      const n = catUsage(a.id);
      HH.confirm({ title: 'Eliminar categoría', text: `Vas a eliminar <strong>${esc(a.label)}</strong>. ${n ? `La ${n === 1 ? 'usa' : 'usan'} <strong>${n} ${HH.plural(n, 'perfil', 'perfiles')}</strong>; se les va a quitar.` : 'Ningún perfil la usa.'} Esta acción no se puede deshacer.`, okLabel: 'Eliminar', cls: 'danger', onOk: () => {
        HH.removeActivity(a.id); HH.refresh(); HH.toast(`Categoría "${a.label}" eliminada`, { type: 'warn' });
      } });
    },
    admCatRestore() {
      HH.confirm({ title: 'Restaurar categorías por defecto', text: `Se reemplazan las ${HH.ACTIVITIES.length} categorías actuales por las 11 originales (Café, Helado, Paseo, Museo, Cine, Cena, Evento, Idiomas, Compras, Deporte y Música). Las categorías que no estén en esa lista se quitan de los perfiles que las usen.`, okLabel: 'Restaurar', cls: 'danger', onOk: () => {
        HH.db.activities = HH.DEFAULT_ACTIVITIES.map(a => Object.assign({}, a));
        const ids = new Set(HH.db.activities.map(a => a.id));
        HH.db.profiles.forEach(p => { p.activities = (p.activities || []).filter(x => ids.has(x)); });
        HH.save(); HH.refresh(); HH.toast('Categorías restauradas', { type: 'ok' });
      } });
    },

    // Portada de inicio
    admHeroInput(el) { const d = heroDraft(); d[el.name] = el.value; heroRerender(); },
    admHeroImage(el) {
      const file = el.files && el.files[0]; if (!file) return;
      if (!file.type.startsWith('image/')) { HH.toast('Elegí un archivo de imagen (JPG o PNG)', { type: 'warn' }); el.value = ''; return; }
      HH.readFile(file, (src) => {
        heroDraft().image = src; heroRerender();
        const drop = document.getElementById('admApDrop');
        if (drop) { drop.classList.add('has'); drop.innerHTML = `<img src="${src}" alt=""><div class="small" style="margin-top:6px">${esc(file.name)} · tocá para cambiar</div>`; }
        if (!document.querySelector('[data-action="admHeroImageClear"]') && drop) drop.insertAdjacentHTML('afterend', `<div><button type="button" class="btn ghost sm" data-action="admHeroImageClear">${icon('trash')} Quitar imagen</button></div>`);
        HH.toast('Imagen cargada. Guardá la portada para aplicarla.', { type: 'ok' });
      });
    },
    admHeroImageClear() {
      heroDraft().image = null; heroRerender();
      const drop = document.getElementById('admApDrop'); const inp = document.getElementById('admApImage'); if (inp) inp.value = '';
      if (drop) { drop.classList.remove('has'); drop.innerHTML = `${icon('upload')}<div style="font-weight:700">Tocá para elegir una imagen</div><div class="tiny">JPG o PNG, horizontal. Si no hay imagen, el inicio muestra las tarjetas de perfiles.</div>`; }
      const clr = document.querySelector('[data-action="admHeroImageClear"]'); if (clr) clr.parentElement.remove();
    },
    admHeroDefaults() {
      const d = heroDraft(); Object.assign(d, HH.DEFAULT_SETTINGS.hero, { image: d.image });
      HH.refresh(); HH.toast('Textos por defecto cargados. Guardá para aplicarlos.', { type: 'ok' });
    },
    admReportDelete(el) { const p = HH.profileOf(el.dataset.id); if (p) deleteAccountModal(p); },
    admDelPreview() {
      const p = HH.profileOf(DEL.userId); const box = document.getElementById('admDelPrev'); if (!p || !box) return;
      box.innerHTML = delPreviewHtml(p, document.getElementById('admDelReason').value, document.getElementById('admDelText').value);
    },
    admDeleteAccount() {
      const p = HH.profileOf(DEL.userId); if (!p) return;
      const reason = document.getElementById('admDelReason').value; const text = document.getElementById('admDelText').value.trim();
      if (text.length < 30) { HH.toast('Escribí el motivo para la acompañante (mínimo 30 caracteres)', { type: 'warn' }); document.getElementById('admDelText').focus(); return; }
      if (!document.getElementById('admDelOk').checked) { HH.toast('Confirmá que entendés que es definitivo', { type: 'warn' }); return; }
      const name = p.displayName;
      const r = HH.deleteWorkerAccount(p.userId, { reason, text, adminId: HH.me() && HH.me().id });
      if (r.error) { HH.toast(r.error, { type: 'danger' }); return; }
      HH.closeModal(); DEL.userId = null; HH.refresh();
      HH.toast(`Cuenta de ${name} eliminada. Email enviado a ${r.email.to}.`, { type: 'ok', ms: 4000 });
    },
    admRemovalView(el) {
      const rm = (HH.db.removals || []).find(x => x.id === el.dataset.id); if (!rm) return;
      const m = (HH.db.emails || []).find(x => x.id === rm.emailId);
      HH.modal({ title: 'Baja de ' + rm.name, body: `<div class="small muted">${HH.fmtDate(rm.createdAt)} · ${esc(HH.POLICY_REASONS[rm.reason] || rm.reason)} · ${rm.contentRemoved} ${HH.plural(rm.contentRemoved, 'contenido')} eliminados</div>${m ? `<div class="tiny muted">Para: ${esc(m.to)} · Asunto: ${esc(m.subject)} · ${esc(m.status)}</div><div class="adm-mail">${esc(m.body)}</div>` : ''}`, actions: [{ label: 'Cerrar', cls: 'ghost', action: 'closeModal' }] });
    },
    admBookingSave(form, ev, v) {
      const pct = Math.round(Number(v.depositPct)); const mx = Math.round(Number(v.maxHours));
      if (!(pct >= 5 && pct <= 100)) { HH.toast('El porcentaje tiene que estar entre 5 y 100', { type: 'warn' }); return; }
      if (!(mx >= 1 && mx <= 12)) { HH.toast('La duración máxima va de 1 a 12 horas', { type: 'warn' }); return; }
      HH.saveSettings({ booking: { depositPct: pct, maxHours: mx } }); HH.refresh(); HH.toast('Reservas: seña ' + pct + '% · hasta ' + mx + ' h', { type: 'ok' });
    },
    admMediaSave(form, ev, v) {
      const clean = (x, max) => String(x == null ? '' : x).trim().slice(0, max);
      const cloudName = clean(v.cloudName, 60), uploadPreset = clean(v.uploadPreset, 80);
      if (cloudName && !/^[a-z0-9_-]+$/i.test(cloudName)) { HH.toast('El cloud name solo admite letras, números, guiones', { type: 'warn' }); return; }
      if (!!cloudName !== !!uploadPreset) { HH.toast('Completá cloud name y upload preset (o dejá los dos vacíos)', { type: 'warn' }); return; }
      HH.saveSettings({ media: { cloudName, uploadPreset, folder: clean(v.folder, 60) || 'sexyrose', watermarkId: clean(v.watermarkId, 120) || 'sexyrose_watermark' } });
      HH.refresh(); HH.toast(cloudName ? 'Cloudinary activado' : 'Modo demo (sin Cloudinary)', { type: 'ok' });
    },
    admHeroSave(form, ev, v) {
      const d = heroDraft();
      const clean = (s, max) => String(s == null ? '' : s).trim().slice(0, max);
      const hero = { eyebrow: clean(v.eyebrow, 40), title: clean(v.title, 80), subtitle: clean(v.subtitle, 320), ctaPrimary: clean(v.ctaPrimary, 28) || HH.DEFAULT_SETTINGS.hero.ctaPrimary, ctaSecondary: clean(v.ctaSecondary, 28) || HH.DEFAULT_SETTINGS.hero.ctaSecondary, image: d.image || null };
      if (!hero.title) { HH.toast('El título no puede quedar vacío', { type: 'warn' }); return; }
      HH.saveSettings({ hero, nearby: { defaultCity: clean(v.defaultCity, 60) || HH.DEFAULT_SETTINGS.nearby.defaultCity } });
      AP.draft = null; AP.saved = true; HH.refresh();
      HH.toast('Portada guardada', { type: 'ok' });
    },
  });
})();
