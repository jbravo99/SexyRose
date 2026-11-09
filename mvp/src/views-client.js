/* ============================================================
   SexyRose MVP — views-client.js
   Área de cliente: #cuenta.(compras|pedidos|mensajes|ajustes) y #chat.:workerId
   Acciones con prefijo cli*. IIFE, sin módulos.
   ============================================================ */
(function () {
  'use strict';
  const esc = HH.esc, icon = HH.icon;

  /* ---------- CSS puntual (una sola vez) ---------- */
  const CSS = `
.dash.cli-dash{grid-template-columns:minmax(0,1fr)}
@media (min-width:900px){.dash.cli-dash{grid-template-columns:240px minmax(0,1fr)}}
.cli-dash .dash-main{grid-template-columns:minmax(0,1fr)}
@media (min-width:900px){.cli-dash .media-grid{grid-template-columns:repeat(6,1fr)}}
.cli-thumb{display:grid;gap:4px;width:100%;min-width:0;padding:0;border:0;background:none;text-align:left;color:inherit;cursor:pointer;border-radius:var(--radius-sm)}
.cli-thumb .cap{font-size:12px;font-weight:600;color:var(--fg-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cli-chat-list{height:clamp(220px,calc(100vh - 470px),520px);overflow-y:auto;padding:4px 2px;overscroll-behavior:contain;align-content:start}
.cli-chat-list.locked{height:auto;max-height:min(42vh,420px)}
@media (min-width:900px){.cli-chat-list{height:clamp(260px,calc(100vh - 320px),640px)}}
.cli-chat-form{display:flex;gap:8px;align-items:flex-end}
.cli-chat-form .textarea{min-height:48px;max-height:140px;resize:none}
.cli-chat-form .btn{height:46px;flex:none}
.cli-chat-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.cli-chat-head .meta{display:flex;gap:6px;align-items:center;font-size:13px;color:var(--muted);flex-wrap:wrap}
.cli-chat-head .meta svg{width:14px;height:14px}
.stat .v.cli-v{font-size:22px}
.cli-thread{width:100%;text-align:left;background:none;border:1px solid transparent;color:inherit;font:inherit}
.cli-thread > svg{width:18px;height:18px;flex:none;color:var(--muted)}
.cli-thread .preview{min-width:0}
.cli-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.cli-stats .stat{overflow:hidden}
.cli-stats .stat .k,.cli-stats .stat .d{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media (min-width:720px){.cli-stats{gap:14px}}
.cli-thumb{position:relative}.cli-exp{position:absolute;top:6px;left:6px;display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:99px;background:rgba(0,0,0,.62);color:#fff;font-size:11px;font-weight:700}.cli-exp svg{width:11px;height:11px}.cli-exp.soon{background:#C2410C}
.cli-dead{opacity:.55}
`;
  if (!document.getElementById('cli-css')) { const s = document.createElement('style'); s.id = 'cli-css'; s.textContent = CSS; document.head.appendChild(s); }

  /* ---------- Helpers ---------- */
  const nameOf = (userId) => { const p = HH.profileOf(userId); if (p) return p.displayName; const u = HH.userById(userId); return u ? u.name : 'Usuario'; };
  const avatarOf = (userId, size) => { const p = HH.profileOf(userId); if (p) return HH.avatar(p, size); const u = HH.userById(userId); return u ? HH.userAvatar(u, size) : HH.avatar(null, size); };
  const contentById = (id) => HH.db.content.find(c => c.id === id) || null;
  const packById = (id) => HH.db.packs.find(p => p.id === id) || null;
  const typeLabel = (t) => t === 'video' ? 'Video' : t === 'short' ? 'Short' : 'Foto';
  const dias = (n) => n + ' ' + HH.plural(n, 'día', 'días');
  const profileLink = (p, label, cls) => p ? `<a class="${cls || ''}" href="#perfil.${p.slug}" data-go="#perfil.${p.slug}">${label}</a>` : `<span class="${cls || ''}">${label}</span>`;
  const when = (iso) => { const d = new Date(iso); const t = d.toLocaleTimeString(HH.loc(), { hour: '2-digit', minute: '2-digit', hour12: false }); return d.toDateString() === new Date().toDateString() ? t : HH.fmtDate(iso) + ' · ' + t; };

  // Sesiones de chat en curso (esperando o activas), una por acompañante
  function activeChats(me) {
    HH.chatTick();
    return HH.purchasesOf(me.id).filter(p => p.kind === 'chat' && ['esperando', 'activa'].includes(HH.chatStatus(p)));
  }
  const sessionLine = (c) => HH.chatStatus(c) === 'activa' ? `${c.minutes ? c.minutes + ' min · ' : ''}quedan <span data-countdown="${new Date(c.endsAt || c.expiresAt).getTime()}">${HH.mmss(new Date(c.endsAt || c.expiresAt) - new Date())}</span>` : `esperando que acepte · <span data-countdown="${new Date(c.requestedAt).getTime() + HH.CHAT_ACCEPT_MIN * 60e3}">${HH.mmss(new Date(c.requestedAt).getTime() + HH.CHAT_ACCEPT_MIN * 60e3 - Date.now())}</span>`;

  // Contenido desbloqueado: sueltos + ítems de packs + entregas de pedidos, agrupado por acompañante.
  // Cada pieza guarda su vencimiento más lejano (null = sin vencimiento). Las vencidas van aparte.
  const later = (a, b) => (a === null || b === null) ? null : (a > b ? a : b);
  function accessMap(me) {
    const live = new Map(), dead = new Map();
    const put = (item, p) => { if (!item) return; const exp = p && p.expiresAt ? p.expiresAt : null;
      if (!p || HH.purchaseActive(p)) { live.set(item.id, { item, exp: live.has(item.id) ? later(live.get(item.id).exp, exp) : exp }); dead.delete(item.id); }
      else if (!live.has(item.id)) { const prev = dead.get(item.id); if (!prev || exp > prev.exp) dead.set(item.id, { item, exp }); } };
    HH.purchasesOf(me.id).forEach(p => {
      if (p.kind === 'content') put(contentById(p.refId), p);
      else if (p.kind === 'pack') HH.packItemsOf(p).forEach(id => put(contentById(id), p));
    });
    HH.requestsByClient(me.id).forEach(r => { if (r.status === 'entregado') (r.deliveredItemIds && r.deliveredItemIds.length ? r.deliveredItemIds : [r.deliveredItemId]).forEach(id => put(contentById(id), r.accessExpiresAt ? { expiresAt: r.accessExpiresAt } : null)); });
    [...live.keys()].forEach(id => dead.delete(id));
    return { live, dead };
  }
  function groupBy(entries) {
    const byWorker = new Map();
    entries.forEach(e => { const g = byWorker.get(e.item.workerId) || []; g.push(e); byWorker.set(e.item.workerId, g); });
    return [...byWorker.entries()].map(([workerId, items]) => ({ workerId, profile: HH.profileOf(workerId), items: items.sort((a, b) => (a.item.createdAt < b.item.createdAt ? 1 : -1)) })).sort((a, b) => b.items.length - a.items.length);
  }
  const unlockedGroups = (me) => groupBy([...accessMap(me).live.values()]);
  // Packs comprados: uno por pack, priorizando la compra vigente
  function boughtPacks(me) {
    const map = new Map();
    HH.purchasesOf(me.id).filter(p => p.kind === 'pack').forEach(p => { const prev = map.get(p.refId); if (!prev || (HH.purchaseActive(p) && (!HH.purchaseActive(prev) || later(prev.expiresAt || null, p.expiresAt || null) !== (prev.expiresAt || null)))) map.set(p.refId, p); });
    return [...map.values()].map(p => ({ purchase: p, pack: packById(p.refId) || { id: p.refId, title: p.title || 'Pack', description: '', itemIds: HH.packItemsOf(p), workerId: p.workerId } }));
  }
  const expTag = (exp) => exp ? `<span class="cli-exp${new Date(exp) - new Date() < 48 * 3600e3 ? ' soon' : ''}">${icon('clock')} ${HH.timeLeft(exp)}</span>` : '';
  const thumbBtn = (e) => `<button type="button" class="cli-thumb" data-action="cliViewItem" data-id="${esc(e.item.id)}" aria-label="Ver ${esc(e.item.title)}">${HH.contentThumb(e.item, { cls: 'square', noLock: true, noTag: true })}${expTag(e.exp)}<span class="cap">${esc(e.item.title)}</span></button>`;

  /* ---------- Layout del área de cliente ---------- */
  const TABS = [
    { id: 'compras', label: 'Compras', icon: 'bag' },
    { id: 'actividad', label: 'Actividad', icon: 'bell' },
    { id: 'reservas', label: 'Reservas', icon: 'calendar' },
    { id: 'pedidos', label: 'Pedidos', icon: 'gift' },
    { id: 'mensajes', label: 'Mensajes', icon: 'chat' },
    { id: 'ajustes', label: 'Ajustes', icon: 'settings' },
  ];
  function layout(me, tab, inner) {
    const counts = {
      actividad: me.guest ? 0 : HH.activityUnread(me),
      reservas: HH.bookingsByClient(me.id).filter(b => b.status === 'solicitada' && HH.bookingAt(b) > new Date()).length,
      pedidos: HH.requestsByClient(me.id).filter(r => r.status === 'aceptado' || r.status === 'pendiente').length,
      mensajes: HH.sum(HH.threadsOf(me.id), t => t.unread),
    };
    const nav = TABS.map(t => `<a href="#cuenta.${t.id}" data-go="#cuenta.${t.id}"${t.id === tab ? ' class="active" aria-current="page"' : ''}>${icon(t.icon)}<span>${t.label}</span>${counts[t.id] ? `<span class="count">${counts[t.id]}</span>` : ''}</a>`).join('');
    const chips = TABS.map(t => `<a href="#cuenta.${t.id}" class="chip${t.id === tab ? ' active' : ''}" data-go="#cuenta.${t.id}">${icon(t.icon)} ${t.label}${counts[t.id] ? ` <span class="badge" style="padding:0 6px">${counts[t.id]}</span>` : ''}</a>`).join('');
    return `<div class="container" style="padding-block:18px 32px">
      <div class="dash cli-dash">
        <aside class="dash-side">
          <div class="who">${HH.userAvatar(me, 44)}<div class="grow"><div class="ellipsis" style="font-weight:800">${esc(me.guest ? me.shortName : me.name)}</div><div class="small muted">${me.guest ? 'Sin cuenta' : 'Cliente · alias'}</div></div></div>
          <nav class="dash-nav" aria-label="Mi cuenta">${nav}</nav>
        </aside>
        <div class="dash-main">
          <div class="dash-tabs"><div class="chips scroll">${chips}</div></div>
          ${inner}
        </div>
      </div>
    </div>`;
  }
  const head = (title, right, sub) => `<div class="page-head"><div><span class="eyebrow">Mi cuenta</span><h2>${title}</h2>${sub ? `<p class="small muted" style="margin-top:4px">${sub}</p>` : ''}</div>${right || ''}</div>`;

  /* ---------- Tab: Compras ---------- */
  function tabCompras(me) {
    const chats = activeChats(me);
    const groups = unlockedGroups(me);
    const total = HH.sum(groups, g => g.items.length);
    const packs = boughtPacks(me);

    const stats = `<div class="cli-stats">
      <div class="stat"><span class="k">Desbloqueados</span><span class="v">${total}</span><span class="d">${groups.length ? `de ${groups.length} ${HH.plural(groups.length, 'acompañante')}` : 'fotos, videos y shorts'}</span></div>
      <div class="stat"><span class="k">Chats activos</span><span class="v">${chats.length}</span><span class="d">${chats.length ? 'en curso ahora' : 'sesiones de 10, 15 o 30 min'}</span></div>
    </div>`;

    const chatsHtml = chats.length ? `<div class="list">${chats.map(c => {
      return `<div class="list-item">${avatarOf(c.refId, 42)}<div class="grow"><div class="title ellipsis">${esc(nameOf(c.refId))}</div><div class="sub">${sessionLine(c)}</div></div><a class="btn sm" href="#chat.${esc(c.refId)}" data-go="#chat.${esc(c.refId)}">${icon('chat')} Abrir chat</a></div>`;
    }).join('')}</div>`
      : `<div class="notice info">${icon('info')}<span>No tenés chats en curso. El chat en vivo se pide desde el perfil de cada acompañante, en sesiones de 10, 15 o 30 minutos.</span></div>`;

    const contentHtml = groups.length ? `<div class="stack">${groups.map(g => `<div class="card">
        <div class="row between" style="margin-bottom:12px">
          <div class="row" style="gap:10px;min-width:0">${avatarOf(g.workerId, 36)}<div class="grow"><div class="ellipsis" style="font-weight:800">${esc(nameOf(g.workerId))}</div><div class="small muted">${g.items.length} ${HH.plural(g.items.length, 'contenido')}</div></div></div>
          ${profileLink(g.profile, 'Ver perfil ' + icon('chevronRight'), 'btn ghost sm')}
        </div>
        <div class="media-grid">${g.items.map(thumbBtn).join('')}</div>
      </div>`).join('')}</div>`
      : `<div class="card"><div class="empty">${icon('image')}<h4>Todavía no desbloqueaste contenido</h4><p class="small">Las fotos, videos y shorts que compres aparecen acá, listos para ver cuando quieras.</p><a class="btn" href="#swipe" data-go="#swipe">${icon('heart')} Explorar perfiles</a></div></div>`;

    const dead = groupBy([...accessMap(me).dead.values()]);
    const deadHtml = dead.length ? `<section class="stack"><h3>Accesos vencidos</h3><p class="small muted" style="margin-top:-6px">La acompañante definió por cuánto tiempo se ve cada contenido. Podés volver a comprarlo desde su perfil.</p>${dead.map(g => `<div class="card">
        <div class="row between" style="margin-bottom:12px"><div class="row" style="gap:10px;min-width:0">${avatarOf(g.workerId, 36)}<div class="grow"><div class="ellipsis" style="font-weight:800">${esc(nameOf(g.workerId))}</div><div class="small muted">${g.items.length} ${HH.plural(g.items.length, 'contenido vencido', 'contenidos vencidos')}</div></div></div>${profileLink(g.profile, 'Volver a comprar ' + icon('chevronRight'), 'btn ghost sm')}</div>
        <div class="media-grid cli-dead">${g.items.map(e => `<div class="cli-thumb">${HH.contentThumb(e.item, { cls: 'square' })}<span class="cap">${esc(e.item.title)}</span></div>`).join('')}</div>
      </div>`).join('')}</section>` : '';
    const packsHtml = packs.length ? `<section class="stack"><h3>Packs comprados</h3><div class="grid-2">${packs.map(({ purchase, pack }) => `<div class="card">
        <div class="row between" style="align-items:flex-start">
          <div class="row" style="gap:10px;min-width:0"><span class="icon-btn" style="color:var(--berry);pointer-events:none" aria-hidden="true">${icon('pack')}</span><div class="grow"><div style="font-weight:800">${esc(pack.title)}</div><div class="small muted">de ${esc(nameOf(pack.workerId))} · ${pack.itemIds.length} ítems</div></div></div>
          ${!purchase.expiresAt ? '<span class="badge neutral">Sin vencimiento</span>' : HH.purchaseActive(purchase) ? `<span class="badge ${new Date(purchase.expiresAt) - new Date() < 48 * 3600e3 ? 'warn' : 'ok'}">Vence en ${HH.timeLeft(purchase.expiresAt)}</span>` : '<span class="badge danger">Vencido</span>'}
        </div>
        ${pack.description ? `<p class="small" style="margin-top:10px;color:var(--fg-2)">${esc(pack.description)}</p>` : ''}
        <div class="tiny muted" style="margin-top:8px">Comprado el ${HH.fmtDate(purchase.createdAt)}${purchase.expiresAt ? (HH.purchaseActive(purchase) ? ' · disponible hasta el ' : ' · venció el ') + HH.fmtDate(purchase.expiresAt) : ''}</div>
        ${!HH.purchaseActive(purchase) && HH.profileOf(pack.workerId) && HH.db.packs.some(k => k.id === pack.id) ? `<div style="margin-top:10px">${profileLink(HH.profileOf(pack.workerId), icon('refresh') + ' Volver a comprar', 'btn secondary sm')}</div>` : ''}
      </div>`).join('')}</div></section>` : '';

    return layout(me, 'compras', `${me.guest ? `<div class="notice" style="align-items:center">${icon('user')}<span class="grow">Para comprar contenido necesitás una cuenta de cliente. Solo alias, email y contraseña: sin verificación de identidad.</span><button class="btn sm" data-action="clientSignup">Crear cuenta</button></div>` : ''}
      ${head('Compras', `<a class="btn secondary sm" href="#swipe" data-go="#swipe">${icon('heart')} Explorar perfiles</a>`)}
      ${stats}
      <section class="stack"><h3>Chats activos</h3>${chatsHtml}</section>
      <section class="stack"><h3>Contenido desbloqueado</h3>${contentHtml}</section>
      ${packsHtml}
      ${deadHtml}`);
  }

  /* ---------- Tab: Pedidos ---------- */
  function requestCard(r, me) {
    const st = HH.REQUEST_STATES[r.status] || { label: r.status, badge: 'neutral' };
    const p = HH.profileOf(r.workerId);
    let actions = '';
    const kindLbl = r.kind && HH.REQUEST_KINDS[r.kind] ? HH.REQUEST_KINDS[r.kind].label : '';
    if (r.status === 'pendiente') {
      actions = `<div class="notice info">${icon('clock')}<span><strong>Pagaste ${HH.money(r.priceUsd)}.</strong> Si ${esc(nameOf(r.workerId))} acepta, te envía ${kindLbl ? 'el ' + kindLbl.toLowerCase() : 'el contenido'} directo acá. Si lo rechaza, te reembolsamos.</span></div>`;
    } else if (r.status === 'aceptado') {
      actions = `<div class="notice warn">${icon('dollar')}<span><strong>${esc(nameOf(r.workerId))} te cotizó ${HH.money(r.priceUsd)}.</strong> Cuando pagues, empieza a producirlo.</span></div>
        <div class="row"><button class="btn" data-action="cliPayRequest" data-id="${esc(r.id)}">${icon('card')} Pagar ${HH.money(r.priceUsd)}</button><button class="btn ghost sm" data-action="cliCancelRequest" data-id="${esc(r.id)}">No, gracias</button></div>`;
    } else if (r.status === 'pagado') {
      actions = `<div class="notice info">${icon('clock')}<span><strong>En producción.</strong> Pagaste ${HH.money(r.priceUsd)}. Te avisamos por mensaje cuando lo entregue.</span></div>`;
    } else if (r.status === 'entregado' && (r.deliveredItemIds || []).length > 1) {
      const items = r.deliveredItemIds.map(contentById).filter(Boolean);
      actions = `<div class="small muted">${items.length} piezas · entregado el ${HH.fmtDate(r.updatedAt)}</div><div class="media-grid">${items.map(it => `<div role="button" tabindex="0" data-action="cliViewItem" data-id="${esc(it.id)}" style="cursor:pointer">${HH.contentThumb(it, { cls: 'square', noLock: true, noTag: true })}</div>`).join('')}</div>`;
    } else if (r.status === 'entregado') {
      const item = r.deliveredItemId ? contentById(r.deliveredItemId) : null;
      actions = item ? `<div class="row" style="gap:12px">
          <div style="width:96px;flex:none">${HH.contentThumb(item, { cls: 'square', noLock: true, noTag: true })}</div>
          <div class="grow"><div style="font-weight:700"><span data-noi18n>${esc(item.title)}</span></div><div class="small muted">${typeLabel(item.type)} · entregado el ${HH.fmtDate(r.updatedAt)}</div><button class="btn secondary sm" style="margin-top:8px" data-action="cliViewItem" data-id="${esc(item.id)}">${icon('play')} Ver</button></div>
        </div>` : `<div class="notice ok">${icon('checkCircle')}<span>Entregado el ${HH.fmtDate(r.updatedAt)}.</span></div>`;
    } else if (r.status === 'rechazado') {
      actions = (r.note ? `<div class="notice">${icon('info')}<span><strong>Nota de ${esc(nameOf(r.workerId))}:</strong> <span data-noi18n>${esc(r.note)}</span></span></div>` : `<div class="small muted">La acompañante no pudo tomar este pedido.</div>`) + (r.refunded ? `<div class="small" style="color:var(--ok);font-weight:700">${icon('refresh')} Te reembolsamos ${HH.money(r.priceUsd)}</div>` : '');
    } else {
      actions = `<div class="row between"><span class="small muted">${icon('clock')} Esperando respuesta de ${esc(nameOf(r.workerId))}</span><button class="btn ghost sm" data-action="cliCancelRequest" data-id="${esc(r.id)}">Cancelar pedido</button></div>`;
    }
    if (r.status === 'entregado' && r.accessExpiresAt) {
      const live = new Date(r.accessExpiresAt) > new Date();
      actions = live ? actions + `<div class="small" style="margin-top:6px">${icon('clock')} Disponible hasta el ${HH.fmtDate(r.accessExpiresAt)} · quedan ${HH.timeLeft(r.accessExpiresAt)}</div>` : `<div class="notice">${icon('clock')}<span>El acceso a este pedido venció el ${HH.fmtDate(r.accessExpiresAt)}.</span></div>`;
    }
    return `<article class="card stack" style="gap:12px">
      <div class="row between" style="align-items:flex-start">
        <div class="row" style="gap:10px;min-width:0">${avatarOf(r.workerId, 40)}<div class="grow"><div style="font-weight:800">${profileLink(p, esc(nameOf(r.workerId)), '')}</div><div class="small muted">${kindLbl ? kindLbl + ' · ' : ''}Pedido el ${HH.fmtDate(r.createdAt)}${r.priceUsd ? ' · ' + HH.money(r.priceUsd) : ''}</div></div></div>
        <span class="badge ${st.badge}">${st.label}</span>
      </div>
      <p><span data-noi18n>${esc(r.description)}</span></p>
      ${actions}
    </article>`;
  }
  function tabReservas(me) {
    const now = new Date(); const list = HH.bookingsByClient(me.id);
    const card = (b) => {
      const p = HH.profileOf(b.workerId); const stt = HH.BOOKING_STATUS[b.status] || { label: b.status, cls: '' }; const past = HH.bookingAt(b) < now;
      let acts = '';
      if (b.status === 'solicitada' && !past) acts = `<a class="btn sm" href="${esc(b.payLink)}" target="_blank" rel="noopener noreferrer">${icon('external')} Pagar seña ${HH.money(b.depositUsd)}</a><button class="btn ghost sm" data-action="cliBkCancel" data-id="${b.id}">Cancelar</button>`;
      else if (b.status === 'confirmada' && !past) acts = `${p ? `<a class="btn secondary sm" href="#chat.${esc(b.workerId)}" data-go="#chat.${esc(b.workerId)}">${icon('chat')} Chat</a>` : ''}<button class="btn ghost sm" data-action="cliBkCancel" data-id="${b.id}">Cancelar</button>`;
      if ((b.status === 'confirmada' && past) || b.status === 'realizada') acts += `<button class="btn ghost sm" data-action="cliBkReport" data-id="${b.id}">${icon('flag')} Reportar salida</button>`;
      const info = b.status === 'solicitada' && !past ? `<div class="notice info">${icon('clock')}<span>Pagá la seña con el link de ${esc(nameOf(b.workerId))}. Cuando la reciba, confirma la reserva. El pago es fuera de SexyRose.</span></div>`
        : b.status === 'rechazada' ? `<div class="small muted">No pudo tomar esta reserva. Si ya pagaste la seña, te la devuelve por el mismo medio.</div>`
        : b.status === 'cancelada' ? `<div class="small muted">Cancelada${b.cancelledBy === 'client' ? ' por vos' : b.cancelledBy === 'worker' ? ' por la acompañante: corresponde que te devuelva la seña' : ''}.</div>` : '';
      return `<article class="card stack" style="gap:10px">
        <div class="row between" style="align-items:flex-start;gap:8px"><div class="row nowrap" style="gap:10px;min-width:0">${avatarOf(b.workerId, 40)}<div style="min-width:0"><div style="font-weight:800">${p ? `<a href="#perfil.${esc(p.slug)}" data-go="#perfil.${esc(p.slug)}">${esc(p.displayName)}</a>` : esc(nameOf(b.workerId))}</div><div class="small muted">${esc(HH.activity(b.activity).label)} · ${esc(HH.fmtBooking(b))}</div></div></div><span class="badge ${stt.cls}">${stt.label}</span></div>
        <div class="small">${b.place ? `${icon('pin')} <span data-noi18n>${esc(b.place)}</span> · ` : ''}seña ${HH.money(b.depositUsd)}</div>
        ${HH.bookingProposalHtml ? HH.bookingProposalHtml(b) : ''}${info}${acts ? `<div class="row" style="gap:8px">${acts}</div>` : ''}
      </article>`;
    };
    const body = list.length ? `<div class="stack">${list.map(card).join('')}</div>` : `<div class="card"><div class="empty">${icon('calendar')}<h4>Todavía no reservaste salidas</h4><p class="small">En el perfil de las acompañantes con agenda vas a ver el botón Reservar salida.</p><a class="btn" href="#inicio" data-go="#inicio">Explorar perfiles</a></div></div>`;
    return layout(me, 'reservas', `${head('Reservas', '', 'Elegís día, horario y actividad. La seña se paga con el link de pago de la acompañante; SexyRose no la cobra.')}${body}`);
  }
  function tabPedidos(me) {
    const list = HH.requestsByClient(me.id);
    const newBtn = `<button class="btn sm" data-action="cliNewRequest">${icon('plus')} Nuevo pedido</button>`;
    const body = list.length ? `<div class="stack">${list.map(r => requestCard(r, me)).join('')}</div>`
      : `<div class="card"><div class="empty">${icon('gift')}<h4>Todavía no pediste contenido a medida</h4><p class="small">Pedile a una acompañante fotos de una salida, un video saludo o recomendaciones de su ciudad. Te cotiza y pagás recién cuando acepta.</p><button class="btn" data-action="cliNewRequest">${icon('plus')} Nuevo pedido</button></div></div>`;
    return layout(me, 'pedidos', `${head('Pedidos a medida', newBtn, 'Contenido hecho para vos. Elegís foto, video o pack y pagás al pedir. Si la acompañante acepta, te lo envía acá; si no, te reembolsamos.')}${body}`);
  }

  /* ---------- Tab: Mensajes ---------- */
  function tabMensajes(me) {
    const threads = HH.threadsOf(me.id);
    const seen = new Set(threads.map(t => t.otherId));
    const extra = activeChats(me).filter(c => !seen.has(c.refId)); // acceso comprado sin mensajes todavía
    const rows = threads.map(t => {
      const active = HH.hasChatAccess(me.id, t.otherId);
      const mine = t.last.senderId === me.id;
      return `<button type="button" class="thread cli-thread" data-go="#chat.${esc(t.otherId)}">
        ${avatarOf(t.otherId, 46)}
        <div class="grow" style="display:grid;gap:3px">
          <div class="row between" style="gap:8px;flex-wrap:nowrap"><span class="ellipsis" style="font-weight:800">${esc(nameOf(t.otherId))}</span><span class="tiny muted" style="flex:none">${HH.timeAgo(t.last.createdAt)}</span></div>
          <div class="preview">${mine ? 'Vos: ' : ''}${esc(t.last.content)}</div>
          <div class="row" style="gap:6px">${active ? `<span class="badge ok">${icon('bolt')} Sesión activa</span>` : ''}${t.unread ? `<span class="badge">${t.unread} ${HH.plural(t.unread, 'nuevo')}</span>` : ''}</div>
        </div>
        ${icon('chevronRight')}
      </button>`;
    }).concat(extra.map(c => `<button type="button" class="thread cli-thread" data-go="#chat.${esc(c.refId)}">
        ${avatarOf(c.refId, 46)}
        <div class="grow" style="display:grid;gap:3px">
          <div class="row between" style="gap:8px;flex-wrap:nowrap"><span class="ellipsis" style="font-weight:800">${esc(nameOf(c.refId))}</span></div>
          <div class="preview">Todavía no hay mensajes.</div>
          <div class="row" style="gap:6px"><span class="badge ${HH.chatStatus(c) === 'activa' ? 'ok' : 'warn'}">${HH.CHAT_STATUS[HH.chatStatus(c)].label}</span></div>
        </div>
        ${icon('chevronRight')}
      </button>`));
    const body = rows.length ? `<div class="card pad-sm"><div class="stack" style="gap:4px">${rows.join('')}</div></div>`
      : `<div class="card"><div class="empty">${icon('chat')}<h4>Todavía no tenés conversaciones</h4><p class="small">El chat en vivo se pide desde el perfil de una acompañante, en sesiones de 10, 15 o 30 minutos. Sirve para charlar y pedirle contenido; la salida se coordina por WhatsApp.</p><a class="btn" href="#swipe" data-go="#swipe">${icon('heart')} Explorar perfiles</a></div></div>`;
    const recent = HH.recentRow(threads.map(t => ({ id: t.otherId, go: '#chat.' + t.otherId, dot: HH.hasChatAccess(me.id, t.otherId) || t.unread > 0 })).concat(extra.map(c => ({ id: c.refId, go: '#chat.' + c.refId, dot: true }))));
    return layout(me, 'mensajes', `${head('Mensajes')}${recent}${body}`);
  }

  /* ---------- Tab: Ajustes ---------- */
  function tabAjustes(me) {
    if (me.guest) return layout(me, 'ajustes', `
      ${head('Ajustes')}
      <div class="grid-2" style="align-items:start">
        <div class="card stack">
          <div class="card-title">Todavía no tenés cuenta</div>
          <p class="small">Para mirar perfiles y escribir por WhatsApp no hace falta. Para comprar fotos, videos, packs o chat necesitás una cuenta con alias, sin verificación de identidad. Lo que hiciste en este dispositivo pasa a tu cuenta.</p>
          <div class="row"><button class="btn" data-action="clientSignup">${icon('user')} Crear cuenta de cliente</button><button class="btn ghost" data-action="clientLogin">Ya tengo cuenta</button></div>
        </div>
        <div class="card stack">
          <div class="card-title">Reglas de la plataforma</div>
          <p class="small">Las salidas se coordinan por WhatsApp y son siempre en lugares públicos. El chat es para charlar y pedir contenido. Si algo te incomoda, reportalo desde el perfil o desde el chat.</p>
        </div>
      </div>`);
    const n = Object.assign({ messages: true, requests: true, news: false }, me.notif || {});
    const sw = (key, label, hint) => `<div class="row between" style="gap:12px;flex-wrap:nowrap"><div class="grow"><div style="font-weight:700;font-size:14px">${label}</div><div class="small muted">${hint}</div></div><button type="button" class="switch" role="switch" aria-checked="${n[key] ? 'true' : 'false'}" aria-label="${label}" data-action="cliToggleNotif" data-key="${key}"></button></div>`;
    return layout(me, 'ajustes', `
      ${head('Ajustes')}
      <div class="grid-2" style="align-items:start">
        <form class="card stack" data-submit="cliSaveAccount">
          <div class="card-title">Cuenta</div>
          <div class="field"><label for="accName">Nombre</label><input class="input" id="accName" name="name" value="${esc(me.name)}" required minlength="2" autocomplete="name"></div>
          <div class="field"><label for="accEmail">Email</label><input class="input" id="accEmail" name="email" type="email" value="${esc(me.email)}" required autocomplete="email"></div>
          <div class="small muted">Cliente desde el ${HH.fmtDate(me.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}.</div>
          <div><button class="btn" type="submit">Guardar cambios</button></div>
        </form>
        <form class="card stack" data-submit="cliChangePassword">
          <div class="card-title">Contraseña</div>
          <div class="field"><label for="pwCur">Contraseña actual</label><input class="input" id="pwCur" name="current" type="password" required autocomplete="current-password"></div>
          <div class="field"><label for="pwNew">Nueva contraseña</label><input class="input" id="pwNew" name="next" type="password" required minlength="8" autocomplete="new-password"><span class="hint">Mínimo 8 caracteres.</span></div>
          <div class="field"><label for="pwRep">Repetir nueva contraseña</label><input class="input" id="pwRep" name="repeat" type="password" required autocomplete="new-password"></div>
          <div><button class="btn secondary" type="submit">Cambiar contraseña</button></div>
        </form>
        <div class="card stack">
          <div class="card-title">Notificaciones</div>
          ${sw('messages', 'Mensajes nuevos', 'Cuando una acompañante te escribe.')}
          ${sw('requests', 'Pedidos a medida', 'Cotizaciones, entregas y cambios de estado.')}
          ${sw('news', 'Novedades de SexyRose', 'Perfiles nuevos en tu ciudad y promociones.')}
        </div>
        <div class="card stack">
          <div class="card-title">Sesión</div>
          <p class="small muted">Cerrás sesión en este dispositivo. Tus compras y chats quedan guardados en tu cuenta.</p>
          <div><button class="btn danger" data-action="logout">${icon('logout')} Cerrar sesión</button></div>
        </div>
      </div>`);
  }

  /* ---------- Rutas: #cuenta ---------- */
  HH.route('cuenta.:tab', ({ tab }) => {
    if (!HH.requireRole('client')) return false;
    const me = HH.viewer();
    const t = tab || 'compras';
    if (t === 'actividad') { const html = layout(me, 'actividad', `${head('Actividad', '', 'Tus compras, pedidos, reservas y chats.')}${HH.activityHtml(me, HH.ui.actFilter)}`); HH.markActivitySeen(me); return html; }
    if (t === 'reservas') return tabReservas(me);
    if (t === 'pedidos') return tabPedidos(me);
    if (t === 'mensajes') return tabMensajes(me);
    if (t === 'ajustes') return tabAjustes(me);
    if (t !== 'compras') { HH.go('#cuenta'); return false; }
    return tabCompras(me);
  }, { optional: true });

  /* ---------- Ruta: #chat.:workerId ---------- */
  function bubbles(me, workerId) {
    const msgs = HH.db.messages.filter(m => (m.senderId === me.id && m.receiverId === workerId) || (m.senderId === workerId && m.receiverId === me.id)).sort(HH.by('createdAt', 1));
    if (!msgs.length) return `<div class="empty" style="padding:28px 12px">${icon('message')}<p class="small">Todavía no hay mensajes. Contale qué te gustaría ver o preguntale por sus salidas.</p></div>`;
    return msgs.map(m => `<div class="bubble ${m.senderId === me.id ? 'me' : 'them'}"><span data-noi18n>${esc(m.content)}</span><span class="t">${when(m.createdAt)}</span></div>`).join('');
  }
  HH.route('chat.:workerId', ({ workerId }) => {
    if (!HH.requireRole('client')) return false;
    const me = HH.viewer();
    const p = HH.profileOf(workerId);
    if (!p) return `<div class="container narrow section"><div class="card"><div class="empty">${icon('alert')}<h4>No encontramos ese perfil</h4><p class="small">Puede que la acompañante ya no esté publicada.</p><a class="btn secondary" href="#cuenta.mensajes" data-go="#cuenta.mensajes">${icon('arrowLeft')} Volver a mensajes</a></div></div></div>`;
    HH.markRead(me.id, workerId);
    const sess = HH.chatSessionOf(me.id, workerId);
    const access = !!sess && HH.chatStatus(sess) === 'activa';
    const last = HH.lastChatSession(me.id, workerId);
    const noChatPlan = !HH.chatEnabledFor(workerId);
    const pr = HH.chatPrices(p);

    const headHtml = `<div class="card pad-sm cli-chat-head">
      <a class="icon-btn" href="#cuenta.mensajes" data-go="#cuenta.mensajes" aria-label="Volver a mensajes">${icon('arrowLeft')}</a>
      ${HH.avatar(p, 44)}
      <div class="grow" style="min-width:0">
        <div class="row" style="gap:6px"><span class="ellipsis" style="font-weight:800;font-size:16px">${esc(p.displayName)}</span>${p.verified === 'verified' ? HH.verifiedBadge() : ''}</div>
        <div class="meta">${p.chatOnline && !noChatPlan ? `<span style="color:var(--ok)">● Disponible para chat</span>` : `<span>No disponible ahora</span>`}<a href="#perfil.${esc(p.slug)}" data-go="#perfil.${esc(p.slug)}">Ver perfil</a></div>
      </div>
      <div class="row" style="gap:8px">
        ${access ? `<span class="badge ok">${icon('clock')} Quedan <span data-countdown="${new Date(sess.endsAt).getTime()}">${HH.mmss(new Date(sess.endsAt) - new Date())}</span></span>` : ''}
        <button class="btn ghost sm" data-action="cliReport" data-id="${esc(workerId)}">${icon('flag')} Reportar</button>
      </div>
    </div>`;

    let footer;
    if (access) {
      footer = `<form class="cli-chat-form" data-submit="cliSendMessage" data-worker="${esc(workerId)}">
        <label class="sr-only" for="chatText">Mensaje</label>
        <textarea class="textarea grow" id="chatText" name="text" rows="1" placeholder="Escribile a ${esc(p.displayName)}…" required></textarea>
        <button class="btn" type="submit" aria-label="Enviar">${icon('send')} <span class="hide-mobile">Enviar</span></button>
      </form><div class="tiny muted" style="margin-top:6px">Solo texto. No se pueden compartir teléfonos, links ni usuarios de otras redes.</div>`;
    } else if (sess) {
      const lim = new Date(sess.requestedAt).getTime() + HH.CHAT_ACCEPT_MIN * 60e3;
      footer = `<div class="card soft" style="text-align:center;display:grid;gap:10px;justify-items:center">
        <span class="icon-btn" style="color:var(--berry);pointer-events:none" aria-hidden="true">${icon('clock')}</span>
        <h4>Esperando que ${esc(p.displayName)} acepte</h4>
        <p class="small muted" style="max-width:40ch">Pagaste una sesión de ${sess.minutes} min (${HH.money(sess.amountUsd)}). Si no acepta en <strong data-countdown="${lim}">${HH.mmss(lim - Date.now())}</strong>, te reembolsamos. El tiempo empieza a correr cuando acepta.</p>
        <button class="btn ghost sm" data-action="chatCancelWait" data-id="${esc(sess.id)}">Cancelar y reembolsar</button>
      </div>`;
    } else if (noChatPlan) {
      footer = `<div class="notice warn">${icon('info')}<span>${esc(p.displayName)} no tiene el chat habilitado en su plan por ahora. Podés pedirle contenido a medida desde tus pedidos.</span></div>`;
    } else {
      const lastTxt = last ? (HH.chatStatus(last) === 'reembolsada' ? `Tu última solicitud se reembolsó (${esc(last.refundReason || 'sin respuesta')}). ` : 'Tu última sesión terminó. ') : '';
      footer = `<div class="card soft" style="text-align:center;display:grid;gap:10px;justify-items:center">
        <span class="icon-btn" style="color:var(--berry);pointer-events:none" aria-hidden="true">${icon('chat')}</span>
        <h4>${last ? 'Iniciá otra sesión' : 'Chat en vivo por sesiones'}</h4>
        <p class="small muted" style="max-width:40ch">${lastTxt}${p.chatOnline ? `Elegí 10, 15 o 30 minutos. Desde ${HH.money(HH.chatFrom(p))}.` : `${esc(p.displayName)} no está disponible para chat en este momento. Probá más tarde.`}</p>
        ${p.chatOnline ? `<div class="row" style="gap:8px;justify-content:center">${HH.CHAT_MINUTES.map(m => `<button class="btn ${m === 15 ? '' : 'secondary'} sm" data-action="chatPick" data-id="${esc(workerId)}" data-min="${m}">${m} min · ${HH.money(pr[m])}</button>`).join('')}</div>` : ''}
      </div>`;
    }

    HH.afterRender = () => {
      const list = document.getElementById('cliMsgList'); if (list) list.scrollTop = list.scrollHeight;
      const ta = document.getElementById('chatText');
      if (ta) ta.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); ta.form.requestSubmit(); } });
    };
    return `<div class="container narrow" style="padding-block:14px 24px"><div class="stack" style="gap:10px">
      ${headHtml}
      <div class="notice info" style="padding:9px 12px"><span class="small">Para coordinar la salida, usá WhatsApp. El chat es para charlar y pedir contenido.</span></div>
      <div class="card pad-sm"><div class="msg-list cli-chat-list${access ? '' : ' locked'}" id="cliMsgList" aria-live="polite">${bubbles(me, workerId)}</div></div>
      ${footer}
    </div></div>`;
  });

  /* ---------- Fallback solo para builds aislados (HH_ONLY): sin views-public no existe #inicio ---------- */
  if (!HH._isoHome) {
    HH._isoHome = true;
    HH.route('inicio', () => {
      const me = HH.viewer();
      const demo = [['u_cliente', 'Cliente demo', 'Martín Suárez'], ['u_admin', 'Admin demo', 'Administración'], ['u_vale', 'Acompañante demo', 'Valentina']];
      return `<div class="container narrow section"><div class="auth-card">
        <h3>SexyRose · build aislado</h3>
        <p class="small muted">Este build no incluye las vistas públicas. ${me ? `Sesión: <strong>${esc(me.name)}</strong>.` : 'Entrá con una cuenta demo:'}</p>
        ${me ? `<div class="row"><a class="btn" href="${HH.homeFor(me.role)}" data-go="${HH.homeFor(me.role)}">Ir a mi sección</a><button class="btn ghost" data-action="logout">Cerrar sesión</button></div>`
          : `<div class="demo-accounts">${demo.map(([id, r, n]) => `<button type="button" data-action="cliIsoLogin" data-id="${id}">${avatarOf(id, 32)}<span class="grow"><strong>${n}</strong><br><span class="r">${r}</span></span>${icon('chevronRight')}</button>`).join('')}</div>`}
      </div></div>`;
    });
  }

  /* ---------- Acciones cli* ---------- */
  Object.assign(HH.actions, {
    cliIsoLogin(el) { if (HH.login(el.dataset.id)) HH.go(HH.homeFor(HH.role())); },

    // Visor de contenido desbloqueado
    cliViewItem(el) {
      const item = contentById(el.dataset.id); if (!item) return;
      if (!accessMap(HH.viewer()).live.has(item.id)) { HH.toast('Tu acceso a este contenido venció', { type: 'warn' }); HH.refresh(); return; }
      const p = HH.profileOf(item.workerId);
      const style = item.type === 'short' ? 'max-width:280px;margin:0 auto' : item.type === 'photo' ? 'max-width:380px;margin:0 auto' : '';
      HH.modal({
        title: item.title,
        body: `<div class="stack">
          ${HH.contentThumb(item, { noLock: true, noTag: true, style })}
          ${item.caption ? `<p>${esc(item.caption)}</p>` : ''}
          <div class="row between"><span class="small muted">de ${p ? `<a href="#perfil.${esc(p.slug)}" data-go="#perfil.${esc(p.slug)}" data-action="closeModal">${esc(p.displayName)}</a>` : 'una acompañante'} · ${HH.fmtDate(item.createdAt)}</span><span class="badge neutral">${typeLabel(item.type)}${item.duration ? ' · ' + esc(item.duration) : ''}</span></div>
        </div>`,
        actions: [{ label: 'Cerrar', cls: 'ghost', action: 'closeModal' }],
      });
    },

    // Pedidos a medida
    cliNewRequest() {
      const list = HH.publishedProfiles().slice().sort((a, b) => a.displayName.localeCompare(b.displayName));
      if (!list.length) { HH.toast('No hay acompañantes publicadas por ahora', { type: 'warn' }); return; }
      HH.modal({ title: 'Nuevo pedido a medida', body: `<div class="field"><label for="rqWorker">¿A quién se lo pedís?</label><select class="select" id="rqWorker">${list.map(p => `<option value="${esc(p.userId)}">${esc(p.displayName)}${p.city ? ' · ' + esc(p.city) : ''}</option>`).join('')}</select></div>`,
        actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: 'Seguir', onClick: () => { const p = HH.profileOf(document.getElementById('rqWorker').value); if (p) HH.openRequestModal(p, () => HH.go('#cuenta.pedidos')); } }] });
    },
    cliCreateRequest(form, ev, v) {
      const me = HH.viewer(); if (!me) return;
      const text = String(v.text || '').trim();
      if (text.length < 10) { HH.toast('Contá un poco más qué querés (mínimo 10 caracteres).', { type: 'warn' }); return; }
      const p = HH.profileOf(v.workerId); if (!p) { HH.toast('Elegí una acompañante', { type: 'warn' }); return; }
      HH.createRequest(me.id, p.userId, text);
      HH.closeModal();
      HH.toast('Pedido enviado a ' + p.displayName, { type: 'ok' });
      HH.go('#cuenta.pedidos');
    },
    cliPayRequest(el) {
      const r = HH.db.requests.find(x => x.id === el.dataset.id);
      if (!r || r.status !== 'aceptado') { HH.toast('Este pedido ya no está esperando pago', { type: 'warn' }); return; }
      HH.payRequest(r, () => { HH.toast('Listo. ' + nameOf(r.workerId) + ' ya puede empezar a producirlo.', { type: 'ok' }); HH.refresh(); });
    },
    cliBkCancel(el) {
      HH.confirm({ title: 'Cancelar reserva', text: 'La acompañante ve la reserva como cancelada. Si ya pagaste la seña, coordiná con ella la devolución por chat o WhatsApp.', okLabel: 'Cancelar reserva', cls: 'danger', onOk: () => { HH.updateBooking(el.dataset.id, { status: 'cancelada', cancelledBy: 'client' }); HH.refresh(); HH.toast('Reserva cancelada'); } });
    },
    cliBkReport(el) {
      const b = (HH.db.bookings || []).find(x => x.id === el.dataset.id); if (!b) return; const me = HH.viewer();
      HH.modal({ title: 'Reportar salida', body: `<div class="stack"><p class="small muted">Contanos qué pasó en la salida del ${esc(HH.fmtBooking(b))}. Lo revisa el equipo de SexyRose.</p><div class="field"><label for="bkRep">Qué pasó</label><textarea class="textarea" id="bkRep" maxlength="800"></textarea></div></div>`,
        actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: 'Enviar reporte', cls: 'danger', onClick: () => { const t = (document.getElementById('bkRep').value || '').trim(); if (t.length < 10) { HH.toast('Contanos un poco más (mínimo 10 caracteres)', { type: 'warn' }); return; }
          HH.db.reports.push({ id: HH.uid('rp'), targetId: b.workerId, byId: me.id, reason: `Salida del ${HH.fmtBooking(b)}: ${t}`, bookingId: b.id, status: 'abierto', createdAt: HH.now() }); HH.save(); HH.closeModal(); HH.toast('Reporte enviado. Gracias por avisar.', { type: 'ok' }); } }] });
    },
    cliCancelRequest(el) {
      const r = HH.db.requests.find(x => x.id === el.dataset.id); if (!r) return;
      HH.confirm({ title: 'Cancelar pedido', text: `Se elimina el pedido a <strong>${esc(nameOf(r.workerId))}</strong>. ${r.status === 'aceptado' ? 'No se cobra nada.' : 'Podés hacer otro cuando quieras.'}`, okLabel: 'Cancelar pedido', cls: 'danger', onOk: () => {
        HH.db.requests = HH.db.requests.filter(x => x.id !== r.id); HH.save(); HH.refresh(); HH.toast('Pedido cancelado');
      } });
    },

    // Chat
    cliSendMessage(form, ev, v) {
      const me = HH.viewer(); if (!me) return;
      const workerId = form.dataset.worker;
      if (!HH.hasChatAccess(me.id, workerId)) { HH.toast('La sesión de chat terminó', { type: 'warn' }); HH.refresh(); return; }
      const res = HH.sendMessage(me.id, workerId, v.text);
      if (res.error) { HH.toast(res.error, { type: 'warn' }); return; }
      const list = document.getElementById('cliMsgList');
      if (list) { list.innerHTML = bubbles(me, workerId); list.scrollTop = list.scrollHeight; }
      const ta = form.querySelector('textarea'); if (ta) { ta.value = ''; ta.focus(); }
    },
    cliBuyChat(el) {
      const p = HH.profileOf(el.dataset.id); if (!p) return;
      HH.buyChat(p);
    },
    cliReport(el) {
      const targetId = el.dataset.id; const name = nameOf(targetId);
      HH.modal({
        title: 'Reportar a ' + name,
        body: `<form class="stack" data-submit="cliSendReport">
          <input type="hidden" name="targetId" value="${esc(targetId)}">
          <div class="field"><label for="rpReason">Motivo</label><select class="select" id="rpReason" name="reason" required>
            <option value="">Elegí un motivo</option>
            <option>Contenido inapropiado o sexual</option>
            <option>Pidió pagos fuera de la plataforma</option>
            <option>Trato irrespetuoso</option>
            <option>No cumplió lo acordado</option>
            <option>Otro</option>
          </select></div>
          <div class="field"><label for="rpDetail">Detalle</label><textarea class="textarea" id="rpDetail" name="detail" placeholder="Contanos qué pasó. Cuanto más concreto, mejor."></textarea></div>
          <div class="notice info">${icon('shield')}<span class="small">Lo revisa el equipo de SexyRose en menos de 24 horas. ${esc(name)} no ve que la reportaste.</span></div>
          <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-action="closeModal">Cancelar</button><button type="submit" class="btn danger">${icon('flag')} Enviar reporte</button></div>
        </form>`,
      });
    },
    cliSendReport(form, ev, v) {
      const me = HH.viewer(); if (!me) return;
      if (!v.reason) { HH.toast('Elegí un motivo', { type: 'warn' }); return; }
      const detail = String(v.detail || '').trim();
      HH.db.reports.push({ id: HH.uid('rp'), targetId: v.targetId, byId: me.id, reason: v.reason + (detail ? ' — ' + detail : ''), status: 'abierto', createdAt: HH.now() });
      HH.save(); HH.closeModal();
      HH.toast('Reporte enviado. Lo revisamos en menos de 24 horas.', { type: 'ok' });
    },

    // Ajustes
    cliSaveAccount(form, ev, v) {
      const me = HH.viewer(); if (!me) return;
      const name = String(v.name || '').trim(), email = String(v.email || '').trim();
      if (name.length < 2) { HH.toast('Escribí tu nombre', { type: 'warn' }); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { HH.toast('Revisá el email', { type: 'warn' }); return; }
      if (HH.db.users.some(u => u.id !== me.id && u.email.toLowerCase() === email.toLowerCase())) { HH.toast('Ese email ya está en uso', { type: 'warn' }); return; }
      me.name = name; me.email = email; HH.save(); HH.renderShell();
      HH.toast('Datos guardados', { type: 'ok' });
      HH.refresh();
    },
    cliChangePassword(form, ev, v) {
      const me = HH.viewer(); if (!me) return;
      if (v.current !== me.password) { HH.toast('La contraseña actual no es correcta', { type: 'warn' }); return; }
      if (String(v.next || '').length < 8) { HH.toast('La nueva contraseña necesita al menos 8 caracteres', { type: 'warn' }); return; }
      if (v.next !== v.repeat) { HH.toast('Las contraseñas no coinciden', { type: 'warn' }); return; }
      me.password = v.next; HH.save(); form.reset();
      HH.toast('Contraseña actualizada', { type: 'ok' });
    },
    cliToggleNotif(el) {
      const me = HH.viewer(); if (!me) return;
      me.notif = Object.assign({ messages: true, requests: true, news: false }, me.notif || {});
      const key = el.dataset.key; me.notif[key] = !me.notif[key];
      el.setAttribute('aria-checked', me.notif[key] ? 'true' : 'false');
      HH.save();
    },
  });
})();
