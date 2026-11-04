/* SexyRose · Actividad (notificaciones) y fila de contactos recientes
   Se arma a partir de los datos existentes: me gusta, "me interesa", compras, pedidos, reservas y chat. */
(function () {
  const esc = HH.esc;
  const nameOf = (id) => { const p = HH.profileOf(id); if (p) return p.displayName; const u = HH.userById(id); return u ? u.name : 'Alguien'; };
  const avatarOf = (id, size) => { const p = HH.profileOf(id); if (p) return HH.avatar(p, size); const u = HH.userById(id); return u ? HH.userAvatar(u, size) : `<span class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px;background:${HH.hueGradient(250)}">?</span>`; };
  const titleOf = (c) => c ? '"' + c.title + '"' : 'tu contenido';
  HH.ACTIVITY_FILTERS = {
    worker: [['all', 'Toda la actividad', 'bell'], ['like', 'Me gusta', 'heart'], ['interest', 'Me interesa', 'sparkles'], ['sale', 'Ventas', 'dollar'], ['request', 'Pedidos a medida', 'gift'], ['booking', 'Reservas', 'calendar'], ['chat', 'Chat', 'chat']],
    client: [['all', 'Toda la actividad', 'bell'], ['sale', 'Compras', 'bag'], ['request', 'Pedidos a medida', 'gift'], ['booking', 'Reservas', 'calendar'], ['chat', 'Chat', 'chat']],
  };

  HH.activityFor = function (user) {
    if (!user) return [];
    const db = HH.db; const out = []; const push = (e) => { if (e.at) out.push(e); };
    const content = (id) => db.content.find(c => c.id === id);
    if (user.role === 'worker') {
      const w = user.id;
      (db.likes || []).filter(l => l.workerId === w).forEach(l => push({ type: 'like', at: l.createdAt, actor: l.userId, text: `le dio me gusta a tu short ${esc(titleOf(content(l.contentId)))}`, go: '#panel.contenido', thumb: content(l.contentId) }));
      (db.swipes || []).filter(s => s.workerId === w && s.dir === 'right' && s.at).forEach(s => push({ type: 'interest', at: s.at, actor: s.clientId, text: 'marcó <strong>Me interesa</strong> en tu perfil', go: '#panel.resumen' }));
      db.purchases.filter(p => p.workerId === w && (p.kind === 'content' || p.kind === 'pack') && p.amountUsd > 0).forEach(p => { const c = p.kind === 'content' ? content(p.refId) : null; const pk = p.kind === 'pack' ? (db.packs.find(k => k.id === p.refId) || { title: p.title || 'un pack' }) : null;
        push({ type: 'sale', at: p.createdAt, actor: p.clientId, text: `compró ${c ? esc(titleOf(c)) : 'el pack "' + esc(pk.title) + '"'} · <strong>${HH.money(p.amountUsd)}</strong>`, go: '#panel.ingresos', thumb: c }); });
      db.requests.filter(r => r.workerId === w).forEach(r => push({ type: 'request', at: r.createdAt, actor: r.clientId, text: `te pidió ${r.kind && HH.REQUEST_KINDS[r.kind] ? 'un ' + HH.REQUEST_KINDS[r.kind].label.toLowerCase() : 'contenido'} a medida`, go: '#panel.pedidos' }));
      (db.bookings || []).filter(b => b.workerId === w).forEach(b => push({ type: 'booking', at: b.createdAt, actor: b.clientId, text: `solicitó una reserva: ${esc(HH.activity(b.activity).label)} · ${esc(HH.fmtBooking(b))}`, go: '#panel.agenda' }));
      db.purchases.filter(p => p.kind === 'chat' && p.refId === w && p.requestedAt).forEach(p => push({ type: 'chat', at: p.requestedAt, actor: p.clientId, text: `pidió una sesión de chat de ${p.minutes || ''} min${HH.chatStatus(p) === 'reembolsada' ? ' (reembolsada)' : ''}`, go: '#panel.mensajes.' + p.clientId }));
    } else {
      const c = user.id;
      db.purchases.filter(p => p.clientId === c && (p.kind === 'content' || p.kind === 'pack') && p.amountUsd > 0).forEach(p => { const it = p.kind === 'content' ? content(p.refId) : null;
        push({ type: 'sale', at: p.createdAt, actor: p.workerId, text: `Compraste ${it ? esc(titleOf(it)) : 'un pack'} de`, go: '#cuenta.compras', thumb: it, self: true }); });
      db.requests.filter(r => r.clientId === c && ['entregado', 'rechazado'].includes(r.status)).forEach(r => push({ type: 'request', at: r.updatedAt, actor: r.workerId, text: r.status === 'entregado' ? 'te envió tu pedido a medida' : 'no pudo tomar tu pedido' + (r.refunded ? ' · te reembolsamos' : ''), go: '#cuenta.pedidos' }));
      (db.bookings || []).filter(b => b.clientId === c && b.status !== 'solicitada').forEach(b => push({ type: 'booking', at: b.updatedAt, actor: b.workerId, text: `${b.status === 'confirmada' ? 'confirmó' : b.status === 'rechazada' ? 'rechazó' : b.status === 'cancelada' ? 'tiene cancelada' : 'marcó como realizada'} tu reserva del ${esc(HH.fmtBooking(b))}`, go: '#cuenta.reservas' }));
      db.purchases.filter(p => p.kind === 'chat' && p.clientId === c && (p.acceptedAt || HH.chatStatus(p) === 'reembolsada')).forEach(p => push({ type: 'chat', at: p.acceptedAt || p.endedAt || p.createdAt, actor: p.refId, text: p.acceptedAt ? `aceptó tu sesión de chat de ${p.minutes || ''} min` : 'no respondió tu solicitud de chat · te reembolsamos', go: '#chat.' + p.refId }));
    }
    return out.filter(e => new Date(e.at) <= new Date()).sort((a, b) => (a.at < b.at ? 1 : -1));
  };
  HH.activitySeenKey = (uid) => 'act_' + uid;
  HH.activityUnread = function (user) {
    if (!user) return 0; const seen = (HH.ui.actSeen || {})[user.id];
    return HH.activityFor(user).filter(e => !seen || e.at > seen).length;
  };
  HH.markActivitySeen = function (user) { HH.ui.actSeen = Object.assign({}, HH.ui.actSeen, { [user.id]: HH.now() }); HH.save(); };

  const bucket = (iso) => { const d = new Date(iso); const t = new Date(); t.setHours(0, 0, 0, 0); const y = new Date(t); y.setDate(t.getDate() - 1); const w = new Date(t); w.setDate(t.getDate() - 7);
    return d >= t ? 'Hoy' : d >= y ? 'Ayer' : d >= w ? 'Esta semana' : 'Antes'; };
  // Lista de actividad con filtro desplegable (como "All Activity")
  HH.activityHtml = function (user, filter) {
    const kinds = HH.ACTIVITY_FILTERS[user.role === 'worker' ? 'worker' : 'client'];
    const cur = kinds.find(k => k[0] === filter) || kinds[0];
    const seen = (HH.ui.actSeen || {})[user.id];
    const list = HH.activityFor(user).filter(e => cur[0] === 'all' || e.type === cur[0]).slice(0, 80);
    const groups = []; list.forEach(e => { const b = bucket(e.at); let g = groups.find(x => x.b === b); if (!g) groups.push(g = { b, items: [] }); g.items.push(e); });
    const row = (e) => `<a class="act-row${!seen || e.at > seen ? ' new' : ''}" href="${e.go}" data-go="${e.go}">${avatarOf(e.actor, 44)}<div class="grow" style="min-width:0"><div class="small">${e.self ? `${e.text} <strong>${esc(nameOf(e.actor))}</strong>` : `<strong>${esc(nameOf(e.actor))}</strong> ${e.text}`}</div><div class="tiny muted">${HH.timeAgo(e.at)}</div></div>${e.thumb ? `<div class="act-thumb">${HH.contentThumb(e.thumb, { cls: 'square', noLock: true, noTag: true })}</div>` : `<span class="act-ic">${HH.icon((kinds.find(k => k[0] === e.type) || cur)[2])}</span>`}</a>`;
    return `<div class="act">
      <div class="act-head"><details class="act-filter"><summary>${HH.icon(cur[2])} ${cur[1]} ${HH.icon('chevronDown')}</summary><div class="act-menu">${kinds.map(k => `<button type="button" data-action="actFilter" data-f="${k[0]}" class="${k[0] === cur[0] ? 'on' : ''}">${HH.icon(k[2])}<span>${k[1]}</span>${k[0] === cur[0] ? HH.icon('check') : ''}</button>`).join('')}</div></details></div>
      ${groups.length ? groups.map(g => `<section><h4 class="act-day">${g.b}</h4><div class="act-list">${g.items.map(row).join('')}</div></section>`).join('') : `<div class="empty card">${HH.icon('bell')}<h4>Sin actividad todavía</h4><p class="small">Acá vas a ver ${user.role === 'worker' ? 'me gusta, ventas, pedidos, reservas y solicitudes de chat' : 'tus compras, pedidos, reservas y chats'}.</p></div>`}
    </div>`;
  };
  Object.assign(HH.actions, { actFilter(el) { HH.ui.actFilter = el.dataset.f; HH.save(); HH.refresh(); } });

  // Fila de contactos recientes (bandeja de mensajes)
  HH.recentRow = function (items) {
    if (!items.length) return '';
    return `<div class="recent-row" aria-label="Recientes"><div class="tiny muted" style="font-weight:700;margin-bottom:8px">Recientes</div><div class="recent-scroll">${items.slice(0, 12).map(it => `<a class="recent-it" href="${it.go}" data-go="${it.go}"><span class="ra">${avatarOf(it.id, 54)}${it.dot ? '<i class="dot"></i>' : ''}</span><span class="tiny ellipsis">${esc(nameOf(it.id).split(' ')[0])}</span></a>`).join('')}</div></div>`;
  };
})();
