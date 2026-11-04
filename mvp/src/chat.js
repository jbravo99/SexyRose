/* SexyRose · Chat en vivo por sesiones (10, 15 o 30 minutos)
   - Cada acompañante fija el precio de cada duración y se marca "Disponible para chat".
   - El cliente paga y la sesión queda "esperando"; si ella no acepta en HH.CHAT_ACCEPT_MIN minutos, se reembolsa sola.
   - El reloj arranca cuando ella acepta. Solo texto: no se pueden compartir teléfonos ni links. */
(function () {
  const esc = HH.esc;
  HH.CHAT_MINUTES = [10, 15, 30];
  HH.CHAT_ACCEPT_MIN = 5;
  HH.CHAT_STATUS = {
    esperando: { label: 'Esperando que acepte', cls: 'warn' },
    activa: { label: 'Sesión activa', cls: 'ok' },
    finalizada: { label: 'Finalizada', cls: 'neutral' },
    reembolsada: { label: 'Reembolsada', cls: 'info' },
  };
  HH.chatPrices = (p) => {
    const base = (p && p.chatPriceUsd) || 5; const cp = (p && p.chatPrices) || {};
    return { 10: cp[10] || base, 15: cp[15] || Math.round(base * 1.4), 30: cp[30] || Math.round(base * 2.5) };
  };
  HH.chatFrom = (p) => Math.min(...Object.values(HH.chatPrices(p)));
  HH.chatEnabledFor = (workerId) => !!HH.levelOf(workerId) && !!HH.planFeat(workerId, 'chat');
  HH.chatAvailable = (p) => !!p && !!p.chatOnline && HH.chatEnabledFor(p.userId);

  // Estado de una compra de chat (compatibilidad con compras viejas por días)
  const statusOf = (s) => s.status || (new Date(s.expiresAt || 0) > new Date() ? 'activa' : 'finalizada');
  HH.chatSessionsAll = () => HH.db.purchases.filter(x => x.kind === 'chat');
  HH.refundChat = function (s, reason) {
    HH.db.payments.forEach(x => { if (x.id === s.payId) x.status = 'refunded'; });
    Object.assign(s, { status: 'reembolsada', refundReason: reason || '', endedAt: HH.now(), expiresAt: null });
  };
  // Vencimientos: sin respuesta → reembolso; tiempo cumplido → finalizada
  HH.chatTick = function () {
    let changed = false; const now = Date.now();
    HH.chatSessionsAll().forEach(s => {
      const st = statusOf(s);
      if (st === 'esperando' && now - new Date(s.requestedAt).getTime() > HH.CHAT_ACCEPT_MIN * 60e3) { HH.refundChat(s, 'No respondió a tiempo'); changed = true; }
      else if (st === 'activa' && s.endsAt && now > new Date(s.endsAt).getTime()) { s.status = 'finalizada'; s.endedAt = s.endsAt; changed = true; }
    });
    if (changed) HH.save();
  };
  HH.chatSessionOf = function (clientId, workerId) {
    HH.chatTick();
    return HH.chatSessionsAll().filter(s => s.clientId === clientId && s.refId === workerId && ['esperando', 'activa'].includes(statusOf(s))).sort(HH.by('createdAt'))[0] || null;
  };
  HH.lastChatSession = (clientId, workerId) => HH.chatSessionsAll().filter(s => s.clientId === clientId && s.refId === workerId).sort(HH.by('createdAt'))[0] || null;
  HH.hasChatAccess = function (clientId, workerId) { if (!clientId) return false; const s = HH.chatSessionOf(clientId, workerId); return !!s && statusOf(s) === 'activa'; };
  HH.pendingChats = function (workerId) { HH.chatTick(); return HH.chatSessionsAll().filter(s => s.refId === workerId && statusOf(s) === 'esperando').sort(HH.by('requestedAt', 1)); };
  HH.activeChatsOfWorker = function (workerId) { HH.chatTick(); return HH.chatSessionsAll().filter(s => s.refId === workerId && statusOf(s) === 'activa'); };
  HH.chatStatus = statusOf;

  HH.acceptChat = function (id) {
    const s = HH.db.purchases.find(x => x.id === id); if (!s || statusOf(s) !== 'esperando') return null;
    const now = new Date(); const ends = new Date(now.getTime() + s.minutes * 60e3).toISOString();
    Object.assign(s, { status: 'activa', acceptedAt: now.toISOString(), endsAt: ends, expiresAt: ends }); HH.save(); return s;
  };
  HH.declineChat = function (id, reason) { const s = HH.db.purchases.find(x => x.id === id); if (!s) return; HH.refundChat(s, reason || 'Rechazada'); HH.save(); };

  // Contenido no permitido en el chat: teléfonos, links, mails y @usuarios
  HH.CHAT_BLOCK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|ar|me|tv|ly|io|link)\b|[\w.+-]+@[\w-]+\.\w+|(^|\s)@[a-z0-9_.]{3,}|(\+?\d[\d\s().-]{7,}\d))/i;
  HH.chatBlocked = (text) => HH.CHAT_BLOCK.test(String(text || ''));

  // Compra de una sesión
  HH.buyChat = function (profile, onDone) {
    const me = HH.me();
    if (!me) { HH.clientAuth({ reason: 'Para chatear necesitás una cuenta de cliente. Sin verificación de identidad.', onDone: () => HH.buyChat(profile, onDone) }); return; }
    const cur = HH.chatSessionOf(me.id, profile.userId);
    if (cur) { HH.go('#chat.' + profile.userId); return; }
    if (!HH.chatEnabledFor(profile.userId)) { HH.toast(profile.displayName + ' no tiene el chat habilitado', { type: 'warn' }); return; }
    if (!profile.chatOnline) { HH.toast(profile.displayName + ' no está disponible para chat ahora', { type: 'warn' }); return; }
    const pr = HH.chatPrices(profile);
    HH.modal({ title: 'Chat en vivo con ' + profile.displayName, body: `<div class="stack" style="gap:12px">
        <p class="small muted">Elegí cuánto tiempo. ${esc(profile.displayName)} tiene ${HH.CHAT_ACCEPT_MIN} minutos para aceptar; si no, te reembolsamos. El tiempo empieza a correr cuando acepta.</p>
        <div class="chat-opts">${HH.CHAT_MINUTES.map(m => `<button type="button" class="chat-opt" data-action="chatPick" data-id="${esc(profile.userId)}" data-min="${m}"><strong>${m} min</strong><span class="num">${HH.money(pr[m])}</span></button>`).join('')}</div>
        <div class="notice">${HH.icon('shield')}<span>Solo texto. Por seguridad no se pueden compartir teléfonos, links ni usuarios de otras redes. Si algo te incomoda, reportalo.</span></div>
      </div>`, actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }] });
    HH._chatDone = onDone;
  };
  Object.assign(HH.actions, {
    chatPick(el) {
      const p = HH.profileOf(el.dataset.id); const m = Number(el.dataset.min); if (!p || !HH.CHAT_MINUTES.includes(m)) return;
      const price = HH.chatPrices(p)[m]; const done = HH._chatDone;
      HH.closeModal();
      HH.checkout({ title: 'Chat en vivo · ' + m + ' min', amount: price, description: 'Chat con ' + p.displayName + ' · ' + m + ' minutos', meta: { type: 'chat', workerId: p.userId, ref: p.userId }, onSuccess: (pay) => {
        HH.db.purchases.push({ id: HH.uid('pu'), clientId: pay.userId, kind: 'chat', refId: p.userId, workerId: p.userId, amountUsd: price, minutes: m, status: 'esperando', requestedAt: HH.now(), payId: pay.id, expiresAt: null, createdAt: HH.now() });
        HH.save();
        if (done) done(); else HH.go('#chat.' + p.userId);
      } });
    },
    chatAccept(el) { const s = HH.acceptChat(el.dataset.id); if (!s) { HH.toast('La solicitud ya no está disponible', { type: 'warn' }); HH.refresh(); return; } HH.toast('Sesión de ' + s.minutes + ' min iniciada', { type: 'ok' }); HH.go('#panel.mensajes.' + s.clientId); },
    chatDecline(el) { HH.declineChat(el.dataset.id, 'Rechazada por la acompañante'); HH.toast('Solicitud rechazada. Se reembolsa al cliente.'); HH.refresh(); },
    chatCancelWait(el) { const s = HH.db.purchases.find(x => x.id === el.dataset.id); if (s && statusOf(s) === 'esperando') { HH.refundChat(s, 'Cancelada por el cliente'); HH.save(); HH.toast('Solicitud cancelada. Te reembolsamos.', { type: 'ok' }); } HH.refresh(); },
    chatToggleOnline() { const p = HH.myProfile(); if (!p) return; p.chatOnline = !p.chatOnline; HH.save(); HH.refresh(); HH.toast(p.chatOnline ? 'Estás disponible para chat' : 'No disponible para chat'); },
  });

  // Banner de solicitudes para la acompañante (se muestra en todo el panel)
  const mmss = (ms) => { const t = Math.max(0, Math.round(ms / 1000)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  HH.chatRequestsBanner = function (workerId) {
    const list = HH.pendingChats(workerId); if (!list.length) return '';
    return `<div class="chat-reqs">${list.map(s => { const c = HH.userById(s.clientId) || { name: 'Cliente' }; const left = new Date(s.requestedAt).getTime() + HH.CHAT_ACCEPT_MIN * 60e3;
      return `<div class="chat-req">${HH.userAvatar(c, 36)}<div class="grow" style="min-width:0"><div style="font-weight:800" class="ellipsis">${esc(c.name)} quiere chatear ${s.minutes} min</div><div class="small muted">${HH.money(s.amountUsd)} · pagado · quedan <span data-countdown="${left}">${mmss(left - Date.now())}</span> para aceptar</div></div><div class="row nowrap" style="gap:6px"><button class="btn ok sm" data-action="chatAccept" data-id="${s.id}">Aceptar</button><button class="btn ghost sm" data-action="chatDecline" data-id="${s.id}">Rechazar</button></div></div>`; }).join('')}</div>`;
  };
  // Cuentas regresivas: cualquier [data-countdown="<ms epoch>"] se actualiza; al llegar a 0 se refresca la vista
  let timer = null;
  HH.startCountdowns = function () {
    clearInterval(timer);
    if (!document.querySelector('[data-countdown]')) return;
    timer = setInterval(() => {
      const els = document.querySelectorAll('[data-countdown]'); if (!els.length) { clearInterval(timer); return; }
      let done = false;
      els.forEach(el => { const ms = Number(el.dataset.countdown) - Date.now(); el.textContent = mmss(ms); if (ms <= 0) done = true; });
      if (done) { clearInterval(timer); HH.chatTick(); if (!document.querySelector('#modalRoot.open')) HH.refresh(); }
    }, 1000);
  };
  HH.mmss = mmss;
})();
