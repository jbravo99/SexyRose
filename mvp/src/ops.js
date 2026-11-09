/* SexyRose · Operación: comisiones, asistente AI de soporte, bot de WhatsApp y revisión AI de fotos.
   En el MVP todo corre en el navegador y es una SIMULACIÓN:
   - El asistente responde con la base de conocimiento que carga el admin (búsqueda por palabras clave).
     En producción se conecta al modelo elegido (Claude, GPT o Gemini) desde el servidor, con esa misma base.
   - El bot de WhatsApp se ve en un simulador (Admin → WhatsApp). En producción usa WhatsApp Business Cloud API.
   - La revisión AI de fotos sugiere; la decisión final siempre es de un admin. */
(function () {
  const esc = HH.esc; const icon = HH.icon;

  /* ---------- Ajustes ---------- */
  HH.OPS_DEFAULTS = {
    commission: { pack: 0, request: 0 },
    ai: { enabled: true, provider: 'anthropic', model: '', instructions: 'Respondé en el idioma del usuario, con tono cálido y breve. SexyRose es compañía para salidas en lugares públicos, sin contenido sexual. No des datos de contacto de las acompañantes. Si no sabés la respuesta o el usuario pide una persona, escalá.', escalateEmail: 'soporte@sexyrose.net', minScore: 2, autoVerify: true, matchMin: 90 },
    wa: { enabled: true, number: '+54 9 11 0000-0000', support: true, bookings: true, onboarding: true },
  };
  HH.AI_PROVIDERS = { anthropic: 'Claude (Anthropic)', openai: 'GPT (OpenAI)', google: 'Gemini (Google)' };
  HH.opsCfg = (k) => Object.assign({}, HH.OPS_DEFAULTS[k], (HH.settings()[k]) || {});

  /* ---------- Base de conocimiento por defecto ---------- */
  const KB_DEFAULT = [
    { id: 'kb_que', title: '¿Qué es SexyRose?', keywords: 'que es, sexyrose, sexy rose, como funciona, para que sirve, servicio, plataforma', answer: 'SexyRose es un directorio de acompañantes para salidas en lugares públicos: un café, un museo, el cine o un evento. Es compañía, sin contenido sexual de ningún tipo. Elegís un perfil, marcás "Me interesa" y coordinan por WhatsApp, Telegram o el chat en vivo.' },
    { id: 'kb_contacto', title: 'Cómo contactar a una acompañante', keywords: 'contactar, contacto, whatsapp, telegram, numero, telefono, me interesa, match, escribir', answer: 'Marcá "Me interesa" en su perfil o en Swipe. Se abre la ventana "Contactá con…" con WhatsApp, Telegram, Coordinar encuentro y Chat en vivo. Su número solo lo ve quien marcó "Me interesa".' },
    { id: 'kb_reserva', title: 'Reservas y seña', keywords: 'reserva, reservar, seña, sena, agenda, horario, turno, coordinar encuentro, cancelar reserva, devolucion', answer: 'Si la acompañante usa la agenda, en su perfil ves "Reservar salida": elegís actividad, día y horario libre. La seña se paga con el link de pago de ella (SexyRose no la cobra) y, cuando la recibe, confirma la reserva. Si ella cancela, corresponde que te devuelva la seña.' },
    { id: 'kb_chat', title: 'Chat en vivo y reembolsos', keywords: 'chat en vivo, chat, sesion, minutos, reembolso, no respondio, no acepto, devolucion chat', answer: 'El chat en vivo se paga por sesión de 10, 15 o 30 minutos. Ella tiene 5 minutos para aceptar; si no lo hace, te reembolsamos automáticamente. El tiempo empieza a correr cuando acepta. Por seguridad no se pueden compartir teléfonos ni links.' },
    { id: 'kb_compras', title: 'Compras de contenido y vencimientos', keywords: 'compra, compre, contenido, pack, foto, video, vencimiento, vence, acceso, mis compras', answer: 'Lo que comprás queda en Mi cuenta → Compras. Algunos ítems tienen acceso por tiempo limitado (lo define cada acompañante y se muestra antes de pagar). Los packs pueden ser sin vencimiento o por un mes.' },
    { id: 'kb_pedidos', title: 'Pedidos a medida', keywords: 'pedido, a medida, personalizado, encargo, pedido rechazado', answer: 'Elegís el tipo de pedido y lo pagás al pedirlo. Si la acompañante lo rechaza o no lo entrega, te reembolsamos. Lo recibís en Mi cuenta → Pedidos.' },
    { id: 'kb_verif', title: 'Verificación de acompañantes', keywords: 'verificacion, verificar, verificada, documento, selfie, identidad, registro, registrarme, alta, postulante', answer: 'Para publicar un perfil hay que verificar el email, el WhatsApp y la identidad (documento, selfie y un video corto). Una revisión automática ayuda a detectar problemas, pero un admin confirma cada verificación, en general en menos de 24 h.' },
    { id: 'kb_planes', title: 'Planes para acompañantes', keywords: 'plan, planes, precio, suscripcion, star, diamante, platino, oro, plata, bronce, cuanto cuesta, publicar perfil', answer: 'Hay planes mensuales con distintas funciones (galería, shorts, packs, agenda, chat, viajes y lugar destacado). Los ves con precios en tu panel, en Suscripción, después de registrarte y verificar tu email.' },
    { id: 'kb_seguridad', title: 'Seguridad y reportes', keywords: 'seguridad, reportar, denunciar, problema, acoso, incomodo, peligro, fraude, estafa', answer: 'Las salidas son siempre en lugares públicos. Si algo te incomoda, usá "Reportar" en el perfil, el chat o la reserva: lo revisa el equipo. Si estás en peligro, llamá a emergencias de tu país.' },
    { id: 'kb_baja', title: 'Eliminar mi cuenta', keywords: 'eliminar cuenta, borrar cuenta, eliminar mi cuenta, borrar mi cuenta, darme de baja, dar de baja, baja, cerrar cuenta, borrar, eliminar', answer: 'Podés pedir la baja escribiendo "hablar con una persona" acá: el equipo la gestiona y te confirma por email.' },
    { id: 'kb_privacidad', title: 'Privacidad y ubicación', keywords: 'privacidad, ubicacion, datos, cerca de mi, distancia, gps, anonimo', answer: 'En "Cerca de mí" tu ubicación se usa solo en tu dispositivo, nunca se envía. Las acompañantes figuran con precisión de barrio. Para comprar o chatear alcanza con un alias y un email.' },
    { id: 'kb_cobros', title: 'Cobros de las acompañantes', keywords: 'cobro, cobrar, ingresos, liquidacion, pago semanal, payoneer, paypal, comision', answer: 'Lo que vendés (contenido, packs, chat y pedidos) se liquida cada semana por el método que elijas en Ajustes. En packs y pedidos a medida puede aplicarse una comisión de la plataforma, que ves antes de publicar.' },
    { id: 'kb_idioma', title: 'Idioma', keywords: 'idioma, ingles, portugues, espanol, language, lingua', answer: 'La web se muestra en español, inglés o portugués según tu navegador. Podés cambiarlo desde el selector de idioma en la barra superior.' },
  ];

  /* ---------- Estado en la base local (se crea solo si falta) ---------- */
  function ensure() {
    const db = HH.db; if (!db) return;
    if (!db.kb) db.kb = KB_DEFAULT.map(a => Object.assign({}, a));
    if (!db.support) db.support = seedTickets();
    if (!db.wa) { db.wa = { threads: [] }; seedWa(); }
  }
  HH.opsEnsure = ensure;
  const nowMinus = (min) => new Date(Date.now() - min * 60e3).toISOString();
  function seedTickets() {
    return [
      { id: 'tk_1', channel: 'web', userId: 'u_cliente', name: 'Martín', email: 'cliente@sexyrose.demo', status: 'abierto', reason: 'Pidió hablar con una persona', createdAt: nowMinus(95), updatedAt: nowMinus(95), messages: [
        { from: 'user', text: 'Pagué la seña de una reserva pero todavía figura "esperando seña".', at: nowMinus(97) },
        { from: 'bot', text: 'Si la acompañante usa la agenda, en su perfil ves "Reservar salida"… Cuando recibe la seña, confirma la reserva.', at: nowMinus(97) },
        { from: 'user', text: 'Ya pasó un día, quiero hablar con una persona.', at: nowMinus(96) },
        { from: 'bot', text: 'Le pasé tu consulta al equipo. Te respondemos acá y por email.', at: nowMinus(95) },
      ] },
    ];
  }

  /* ---------- Motor del asistente (simulado) ---------- */
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const STOP = new Set('que como para por con una uno los las del de la el en mi me tu su es son hay esta este esto quiero puedo tengo hola buenas'.split(' '));
  const HUMAN = /(humano|persona|agente|operador|alguien del equipo|reclamo|queja|human|pessoa|atendente)/;
  const POLICY = /(sexo|sexual|desnud|intim|nude|nsfw)/;
  HH.supportMatch = function (text) {
    ensure(); const q = norm(text); const cfg = HH.opsCfg('ai');
    if (!q) return { type: 'none' };
    if (POLICY.test(q)) return { type: 'policy' };
    if (HUMAN.test(q)) return { type: 'escalate', reason: 'Pidió hablar con una persona' };
    const words = q.split(' ').filter(w => w.length >= 3 && !STOP.has(w));
    if (!words.length || /^(hola|buenas|buen dia|buenas tardes|buenas noches|hi|hello|ola|oi|gracias|ok)( .*)?$/.test(q) && words.length <= 2) return { type: 'greet' };
    let best = null, bestScore = 0;
    HH.db.kb.forEach(a => {
      let sc = 0;
      String(a.keywords || '').split(',').map(k => norm(k)).filter(Boolean).forEach(k => { if (q.includes(k)) sc += k.includes(' ') ? 3 : 2; });
      const tw = norm(a.title).split(' ').filter(w => w.length >= 4 && !STOP.has(w));
      words.forEach(w => { if (tw.some(t => t.startsWith(w.slice(0, 5)))) sc += 1; });
      // Variantes de una misma palabra (reservo / reserva, reembolsan / reembolso)
      const kw1 = String(a.keywords || '').split(',').map(k => norm(k)).filter(k => k && !k.includes(' ') && k.length >= 5);
      words.forEach(w => { if (w.length >= 5 && kw1.some(k => k.slice(0, 5) === w.slice(0, 5) && !q.includes(k))) sc += 1; });
      if (sc > bestScore) { bestScore = sc; best = a; }
    });
    if (best && bestScore >= (Number(cfg.minScore) || 2)) return { type: 'answer', article: best, score: bestScore };
    return { type: 'escalate', reason: 'No encontró la respuesta en la base' };
  };
  const GREET_TEXT = '¡Hola! Preguntame lo que necesites: reservas, chat en vivo, compras, verificación o tu cuenta. Si hace falta, te paso con una persona del equipo.';
  const POLICY_TEXT = 'SexyRose es solo compañía para salidas en lugares públicos: no se ofrecen ni se aceptan servicios sexuales. Si alguien te propuso algo así, reportalo desde su perfil o el chat.';

  HH.createTicket = function ({ channel, userId, name, email, phone, messages, reason }) {
    ensure();
    const t = { id: 'tk_' + Math.random().toString(36).slice(2, 7), channel: channel || 'web', userId: userId || null, name: name || 'Visitante', email: email || '', phone: phone || '', status: 'abierto', reason: reason || '', createdAt: HH.now(), updatedAt: HH.now(), messages: (messages || []).map(m => Object.assign({}, m)) };
    HH.db.support.unshift(t); HH.save(); return t;
  };
  const openTickets = () => { ensure(); return HH.db.support.filter(t => t.status === 'abierto'); };

  /* ---------- Widget de ayuda (web) ---------- */
  const SUP = () => { if (!HH.ui.sup) HH.ui.sup = { open: false, msgs: [], ticketId: null, askEmail: false }; return HH.ui.sup; };
  const TOPICS = [['Reservas y seña', 'reserva'], ['Chat en vivo', 'chat en vivo reembolso'], ['Mis compras', 'compras vencimiento'], ['Verificación', 'verificacion'], ['Eliminar mi cuenta', 'eliminar cuenta'], ['Hablar con una persona', 'hablar con una persona']];
  const hiddenOn = (path) => /^(admin|chat|shorts|swipe|panel\.mensajes|links)/.test(path || '');
  function supMount() {
    let fab = document.getElementById('supFab');
    if (!fab) {
      fab = document.createElement('button'); fab.id = 'supFab'; fab.type = 'button'; fab.className = 'sup-fab'; fab.setAttribute('data-action', 'supToggle'); fab.setAttribute('aria-label', 'Ayuda');
      fab.innerHTML = icon('help') + '<span>Ayuda</span>';
      const pn = document.createElement('section'); pn.id = 'supPanel'; pn.className = 'sup-panel'; pn.setAttribute('aria-label', 'Asistente de ayuda'); pn.hidden = true;
      document.body.appendChild(fab); document.body.appendChild(pn);
    }
    const cfg = HH.opsCfg('ai'); const path = (HH.current && HH.current.path) || '';
    const hide = !cfg.enabled || hiddenOn(path) || (HH.me() && HH.me().role === 'admin');
    fab.hidden = hide || SUP().open;
    const pn = document.getElementById('supPanel'); pn.hidden = hide || !SUP().open;
    if (!pn.hidden) supRender();
  }
  function ticketOf() { const s = SUP(); return s.ticketId ? (HH.db.support || []).find(t => t.id === s.ticketId) : null; }
  function supRender() {
    const s = SUP(); const pn = document.getElementById('supPanel'); if (!pn) return;
    const tk = ticketOf();
    // Si hay ticket, las respuestas del equipo se suman a la conversación
    const msgs = s.msgs.slice(); if (tk) tk.messages.filter(m => m.from === 'admin' && !s.msgs.some(x => x.at === m.at && x.from === 'admin')).forEach(m => msgs.push(m));
    msgs.sort((a, b) => (a.at < b.at ? -1 : 1));
    const bubble = (m) => `<div class="sup-msg ${m.from}">${m.from === 'admin' ? '<span class="tiny sup-who">Equipo SexyRose</span>' : ''}<div class="sup-b">${esc(m.text)}</div>${m.kb ? `<div class="sup-fb"><span class="tiny muted">¿Te sirvió?</span><button type="button" class="chip sm" data-action="supYes">Sí</button><button type="button" class="chip sm" data-action="supHuman">No, hablar con una persona</button></div>` : ''}</div>`;
    const me = HH.me();
    const emailForm = s.askEmail ? `<form class="sup-email" data-submit="supEmail"><label class="small" for="supEm">Tu email para responderte</label><div class="row nowrap" style="gap:6px"><input class="input" id="supEm" name="email" type="email" required placeholder="nombre@email.com" value="${esc(me && me.email || '')}"><button class="btn sm" type="submit">Enviar</button></div></form>` : '';
    pn.innerHTML = `<header class="sup-head"><span class="sup-av">${icon('sparkles')}</span><div class="grow"><strong>Asistente SexyRose</strong><div class="tiny muted">${tk ? (tk.status === 'cerrado' ? 'Consulta cerrada' : 'Consulta #' + esc(tk.id.slice(3)) + ' con el equipo') : 'Respuestas al instante · te pasa con una persona si hace falta'}</div></div><button class="icon-btn sm" type="button" data-action="supToggle" aria-label="Cerrar">${icon('x')}</button></header>
      <div class="sup-body" id="supBody">
        <div class="sup-msg bot"><div class="sup-b">Hola${me ? ' ' + esc((me.name || '').split(' ')[0]) : ''}. ¿En qué te ayudo?</div></div>
        ${!msgs.length ? `<div class="sup-topics">${TOPICS.map(([l, q]) => `<button type="button" class="chip sm" data-action="supTopic" data-q="${esc(q)}">${esc(l)}</button>`).join('')}</div>` : ''}
        ${msgs.map(bubble).join('')}
        ${emailForm}
      </div>
      <form class="sup-input" data-submit="supSend"><label class="sr-only" for="supTxt">Escribí tu consulta</label><input class="input" id="supTxt" name="text" maxlength="500" autocomplete="off" placeholder="Escribí tu consulta"><button class="icon-btn" type="submit" aria-label="Enviar">${icon('send')}</button></form>
      <div class="sup-foot tiny muted">Demo: responde con la base de conocimiento. En producción, ${esc(HH.AI_PROVIDERS[HH.opsCfg('ai').provider] || 'el modelo elegido')}.</div>`;
    const body = document.getElementById('supBody'); if (body) body.scrollTop = body.scrollHeight;
  }
  function supHandle(text) {
    const s = SUP(); const at = HH.now(); s.msgs.push({ from: 'user', text, at });
    const tk = ticketOf();
    if (tk && tk.status !== 'cerrado') { tk.messages.push({ from: 'user', text, at }); tk.status = 'abierto'; tk.updatedAt = at; HH.save(); supRender(); return; }
    const r = HH.supportMatch(text); const at2 = new Date(Date.now() + 1).toISOString();
    if (r.type === 'policy') s.msgs.push({ from: 'bot', text: POLICY_TEXT, at: at2 });
    else if (r.type === 'greet') s.msgs.push({ from: 'bot', text: GREET_TEXT, at: at2 });
    else if (r.type === 'answer') s.msgs.push({ from: 'bot', text: r.article.answer, at: at2, kb: r.article.id });
    else escalate(r.reason || 'Pidió hablar con una persona');
    HH.save(); supRender();
  }
  function escalate(reason) {
    const s = SUP(); const me = HH.me(); s.msgs.forEach(m => { m.kb = null; });
    if (!me && !s.pendingEmail) { s.askEmail = true; s.escReason = reason; s.msgs.push({ from: 'bot', text: 'Te paso con una persona del equipo. Dejame tu email para responderte.', at: HH.now() }); return; }
    const t = HH.createTicket({ channel: 'web', userId: me ? me.id : null, name: me ? me.name : 'Visitante', email: me ? me.email : s.pendingEmail, reason, messages: s.msgs });
    s.ticketId = t.id; s.askEmail = false;
    s.msgs.push({ from: 'bot', text: 'Le pasé tu consulta al equipo (#' + t.id.slice(3) + '). Te respondemos acá y por email.', at: new Date(Date.now() + 2).toISOString() });
    t.messages = s.msgs.map(m => ({ from: m.from, text: m.text, at: m.at }));
  }
  Object.assign(HH.actions, {
    supToggle() { const s = SUP(); s.open = !s.open; HH.save(); supMount(); if (s.open) setTimeout(() => { const i = document.getElementById('supTxt'); if (i) i.focus(); }, 30); },
    supTopic(el) { supHandle(el.dataset.q); },
    supSend(form, ev, v) { const t = String(v.text || '').trim(); if (!t) return; form.reset(); supHandle(t); setTimeout(() => { const i = document.getElementById('supTxt'); if (i) i.focus(); }, 10); },
    supYes() { const s = SUP(); s.msgs.forEach(m => { m.kb = null; }); s.msgs.push({ from: 'bot', text: 'Buenísimo. Si necesitás algo más, escribime.', at: HH.now() }); HH.save(); supRender(); },
    supHuman() { const s = SUP(); s.msgs.push({ from: 'user', text: 'Quiero hablar con una persona', at: HH.now() }); escalate('La respuesta automática no le sirvió'); HH.save(); supRender(); },
    supEmail(form, ev, v) { const s = SUP(); const em = String(v.email || '').trim(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { HH.toast('Revisá el email', { type: 'warn' }); return; } s.pendingEmail = em; s.askEmail = false; escalate(s.escReason); HH.save(); supRender(); },
    supNew() { HH.ui.sup = { open: true, msgs: [], ticketId: null, askEmail: false }; HH.save(); supRender(); },
  });
  document.addEventListener('hh:rendered', supMount);

  /* ---------- WhatsApp (simulado) ---------- */
  const wa = () => { ensure(); return HH.db.wa; };
  HH.waThread = function (contactId, info) {
    let t = wa().threads.find(x => x.contactId === contactId);
    if (!t) { const p = HH.profileOf(contactId); const u = HH.userById(contactId);
      t = Object.assign({ id: 'wt_' + Math.random().toString(36).slice(2, 8), contactId, name: (p && p.displayName) || (u && u.name) || 'Contacto', phone: (p && p.whatsapp) || '', kind: p ? (p.verified === 'verified' ? 'acompanante' : 'postulante') : 'cliente', messages: [], updatedAt: HH.now() }, info || {});
      wa().threads.unshift(t); }
    return t;
  };
  HH.waSend = function (contactId, text, opts) {
    const cfg = HH.opsCfg('wa'); if (!cfg.enabled) return null;
    const t = HH.waThread(contactId, opts && opts.info); const m = { id: HH.uid('wm'), dir: 'out', text, at: HH.now(), buttons: (opts && opts.buttons) || null, ref: (opts && opts.ref) || null };
    t.messages.push(m); t.updatedAt = m.at; t.unread = true; HH.save(); return m;
  };
  const BK_BTNS = () => [{ id: 'bk_ok', label: 'Seña recibida · confirmar' }, { id: 'bk_alt', label: 'Proponer otro horario' }, { id: 'bk_no', label: 'Rechazar' }];
  const fmtB = (b) => `${HH.activity(b.activity).label} · ${HH.fmtBooking(b)}${b.place ? ' · ' + b.place : ''}`;
  // Botones vigentes de un mensaje (los de una reserva caducan cuando cambia su estado)
  function liveButtons(m) {
    if (!m.buttons) return null;
    if (m.answered) return null;
    if (m.ref && m.ref.type === 'booking') { const b = (HH.db.bookings || []).find(x => x.id === m.ref.id); if (!b || b.status !== 'solicitada' || (b.proposal && !m.ref.alt)) return null; }
    if (m.ref && m.ref.type === 'agendaOptIn') { const p = HH.profileOf(m.ref.id); if (!p || HH.bookingCfg(p).enabled) return null; }
    return m.buttons;
  }
  HH.waNotifyBooking = function (b) {
    const cfg = HH.opsCfg('wa'); const p = HH.profileOf(b.workerId); if (!cfg.enabled || !cfg.bookings || !p || !HH.bookingCfg(p).waNotify) return;
    const c = HH.userById(b.clientId) || { name: 'Un cliente' };
    HH.waSend(b.workerId, `Nueva solicitud de reserva de ${c.name.split(' ')[0]}: ${fmtB(b)}. Seña ${HH.money(b.depositUsd)} por tu link de pago.${b.note ? ' Mensaje: "' + b.note + '"' : ''}`, { ref: { type: 'booking', id: b.id }, buttons: BK_BTNS() });
  };
  function freeAlternatives(b, n) {
    const p = HH.profileOf(b.workerId); const out = []; const st = HH.bookingSettings();
    const keep = b.status; b.status = '_tmp';
    try { for (let i = 0; i < st.daysAhead && out.length < n; i++) { const ymd = HH.localDay(HH.daysFromNow(i)); HH.bookingSlots(p, ymd, b.hours).filter(s => !(ymd === b.date && s === b.start)).filter((s, k) => k % 2 === 0).slice(0, 2).forEach(s => { if (out.length < n) out.push({ date: ymd, start: s }); }); } } finally { b.status = keep; }
    return out;
  }
  const fmtSlot = (x, hours) => HH.fmtBooking({ date: x.date, start: x.start, hours });
  // Respuesta de la acompañante (o de quien escribe) a un botón o con texto libre
  HH.waReply = function (threadId, msgId, btnId, freeText) {
    const t = wa().threads.find(x => x.id === threadId); if (!t) return;
    const m = msgId ? t.messages.find(x => x.id === msgId) : null; const btn = m && m.buttons ? m.buttons.find(x => x.id === btnId) : null;
    t.messages.push({ id: HH.uid('wm'), dir: 'in', text: freeText || (btn ? btn.label : ''), at: HH.now() }); t.updatedAt = HH.now();
    if (m && btn) m.answered = btn.id;
    const ref = m && m.ref;
    if (ref && ref.type === 'booking') {
      const b = (HH.db.bookings || []).find(x => x.id === ref.id); if (!b) return HH.save();
      if (btnId === 'bk_ok') { HH.updateBooking(b.id, { status: 'confirmada', confirmedAt: HH.now(), via: 'whatsapp' }); HH.waSend(t.contactId, 'Listo, la reserva quedó confirmada. Te recordamos el día anterior.'); }
      else if (btnId === 'bk_no') { HH.updateBooking(b.id, { status: 'rechazada', via: 'whatsapp' }); HH.waSend(t.contactId, 'Reserva rechazada. Le avisamos al cliente. Si ya te pagó la seña, devolvésela por el mismo medio.'); }
      else if (btnId === 'bk_alt') {
        const alts = freeAlternatives(b, 4);
        if (!alts.length) HH.waSend(t.contactId, 'No encontré otros horarios libres en tu agenda para esa duración. Podés liberar horarios desde tu panel.');
        else HH.waSend(t.contactId, 'Estos horarios están libres en tu agenda. ¿Cuál le propongo?', { ref: { type: 'booking', id: b.id, alt: true }, buttons: alts.map(x => ({ id: 'alt:' + x.date + '|' + x.start, label: fmtSlot(x, b.hours) })).concat([{ id: 'alt:none', label: 'Ninguno' }]) });
      } else if (btnId && btnId.startsWith('alt:')) {
        if (btnId === 'alt:none') HH.waSend(t.contactId, 'Ok, la solicitud sigue como estaba. Podés responderla desde tu panel.');
        else { const [date, start] = btnId.slice(4).split('|'); HH.updateBooking(b.id, { proposal: { date, start, at: HH.now() } }); HH.waSend(t.contactId, `Le propusimos al cliente ${fmtSlot({ date, start }, b.hours)}. Te aviso cuando responda.`); }
      }
    } else if (ref && ref.type === 'agendaOptIn') {
      const p = HH.profileOf(ref.id); const c = p && HH.bookingCfg(p);
      if (btnId === 'ag_yes' && c) { c.enabled = true; c.declined = false; c.waNotify = true;
        HH.waSend(t.contactId, '¡Genial! ¿Cuál es tu horario hábil? Después lo podés ajustar en tu panel → Agenda.', { ref: { type: 'agendaHours', id: ref.id }, buttons: [{ id: 'h_wk_10_18', label: 'Lun a vie · 10 a 18 h' }, { id: 'h_wk_15_21', label: 'Lun a vie · 15 a 21 h' }, { id: 'h_we_11_19', label: 'Sáb y dom · 11 a 19 h' }, { id: 'h_panel', label: 'Lo cargo en el panel' }] }); }
      else if (btnId === 'ag_no' && c) { c.enabled = false; c.declined = true; HH.waSend(t.contactId, 'Perfecto, no usás la agenda. Si cambiás de idea, la activás desde tu panel.'); }
    } else if (ref && ref.type === 'agendaHours') {
      const p = HH.profileOf(ref.id); const c = p && HH.bookingCfg(p);
      const set = (from, to, days) => { const av = {}; days.forEach(k => { av[k] = [{ from, to }]; }); c.availability = av; };
      if (c && btnId === 'h_wk_10_18') set('10:00', '18:00', [1, 2, 3, 4, 5]);
      if (c && btnId === 'h_wk_15_21') set('15:00', '21:00', [1, 2, 3, 4, 5]);
      if (c && btnId === 'h_we_11_19') set('11:00', '19:00', [6, 0]);
      const miss = p ? HH.bookingIssues(p).filter(x => x !== 'activar' && x !== 'horarios') : [];
      HH.waSend(t.contactId, (btnId === 'h_panel' ? 'Dale, lo cargás en Agenda.' : 'Horario guardado. Fuera de ese horario tu agenda queda como no hábil.') + (miss.includes('link') ? ' Te falta pegar tu link de pago para recibir reservas.' : ''));
    } else if (freeText) {
      // Texto libre: lo responde el asistente con la misma base de conocimiento
      const cfg = HH.opsCfg('wa');
      if (!cfg.support) { HH.save(); return; }
      const r = HH.supportMatch(freeText);
      if (r.type === 'policy') HH.waSend(t.contactId, POLICY_TEXT);
      else if (r.type === 'greet') HH.waSend(t.contactId, GREET_TEXT);
      else if (r.type === 'answer') HH.waSend(t.contactId, r.article.answer);
      else { const tk = HH.createTicket({ channel: 'whatsapp', userId: HH.userById(t.contactId) ? t.contactId : null, name: t.name, phone: t.phone, reason: r.reason, messages: [{ from: 'user', text: freeText, at: HH.now() }] }); t.ticketId = tk.id;
        HH.waSend(t.contactId, 'Le pasé tu consulta a una persona del equipo (#' + tk.id.slice(3) + '). Te respondemos por acá.'); }
    }
    HH.save();
  };
  HH.waAskAgenda = function (p) {
    if (!p || !HH.bookingPlanOk(p.userId) || HH.bookingCfg(p).enabled) return;
    HH.waSend(p.userId, '¿Vas a usar la agenda de reservas? Los clientes reservan en tus horarios libres y te avisamos por acá cada solicitud. Es opcional.', { ref: { type: 'agendaOptIn', id: p.userId }, buttons: [{ id: 'ag_yes', label: 'Sí, usar la agenda' }, { id: 'ag_no', label: 'No por ahora' }] });
  };
  function seedWa() {
    const add = (contactId, msgs, info) => { const t = HH.waThread(contactId, info); msgs.forEach(([dir, text, min, extra]) => t.messages.push(Object.assign({ id: HH.uid('wm'), dir, text, at: nowMinus(min) }, extra || {}))); t.updatedAt = t.messages.length ? t.messages[t.messages.length - 1].at : HH.now(); };
    const vale = HH.profileOf('u_vale'); if (vale) HH.bookingCfg(vale).waNotify = true;
    const b1 = (HH.db.bookings || []).find(b => b.id === 'bk_1');
    if (b1) add('u_vale', [['out', `Nueva solicitud de reserva de Martín: ${fmtB(b1)}. Seña ${HH.money(b1.depositUsd)} por tu link de pago. Mensaje: "${b1.note}"`, 1440, { ref: { type: 'booking', id: 'bk_1' }, buttons: [{ id: 'bk_ok', label: 'Seña recibida · confirmar' }, { id: 'bk_alt', label: 'Proponer otro horario' }, { id: 'bk_no', label: 'Rechazar' }] }]]);
    add('u_juli', [
      ['out', '¡Hola Julieta! Soy el asistente de SexyRose. Te acompaño en el alta: 1) verificar email, 2) verificar WhatsApp, 3) documento, selfie y video corto, 4) fotos de perfil.', 3000],
      ['out', 'Recibimos tu documentación. La verificación automática necesita una revisión manual; te aviso por acá apenas esté.', 200],
    ]);
    add('u_mica', [
      ['out', '¡Hola Micaela! Soy el asistente de SexyRose. Te acompaño en el alta: 1) verificar email, 2) verificar WhatsApp, 3) documento, selfie y video corto, 4) fotos de perfil.', 2800],
      ['out', 'Recibimos tu documentación. La verificación automática necesita una revisión manual; te aviso por acá apenas esté.', 120],
    ]);
    add('wa_demo', [['in', 'Hola, ¿cómo funciona el chat en vivo?', 30], ['out', KB_DEFAULT[3].answer, 29]], { name: '+54 9 11 5555-0101', phone: '+54 9 11 5555-0101', kind: 'cliente' });
  }

  // Ganchos: reservas nuevas, alta de postulantes, verificación
  const _createBooking = HH.createBooking;
  HH.createBooking = function (args) { const r = _createBooking.apply(this, arguments); if (r && r.ok) HH.waNotifyBooking(r.booking); return r; };
  const _register = HH.register;
  HH.register = function (args) {
    const r = _register.apply(this, arguments);
    try { const u = r && (r.user || r); if (args && args.role === 'worker' && u && u.id && HH.opsCfg('wa').onboarding) HH.waSend(u.id, `¡Hola ${String(args.name || '').split(' ')[0]}! Soy el asistente de SexyRose. Te acompaño en el alta: 1) verificar email, 2) verificar WhatsApp, 3) documento, selfie y video corto, 4) fotos de perfil. Si te trabás en algún paso, escribime.`, { info: { kind: 'postulante' } }); } catch (e) { /* sin bot */ }
    return r;
  };
  HH.onVerificationSent = function (p) {
    const auto = HH.autoVerify(p);
    if (!auto && HH.opsCfg('wa').onboarding) HH.waSend(p.userId, 'Recibimos tu documentación. La verificación automática necesita una revisión manual; te aviso por acá apenas esté.');
    return auto;
  };
  if (HH.approveProfileVerification) {
    const _ap = HH.approveProfileVerification;
    HH.approveProfileVerification = function (p) { const r = _ap.apply(this, arguments); try { const t = HH.waThread(p.userId); t.kind = 'acompanante'; HH.waSend(p.userId, (p.verifiedBy === 'ai' ? 'Listo: la verificación automática confirmó tu identidad.' : '¡Listo! Tu identidad quedó verificada.') + (HH.levelOf(p.userId) ? '' : ' Elegí tu plan en el panel para publicar el perfil.')); HH.waAskAgenda(p); } catch (e) { /* */ } return r; };
  }
  // Recordatorios a postulantes con pasos pendientes
  HH.waRemindApplicants = function () {
    let n = 0;
    HH.db.profiles.filter(p => p.verified !== 'verified' && p.verified !== 'pending').forEach(p => { const steps = HH.publishSteps ? HH.publishSteps(p).filter(s => !s.done).map(s => s.label) : []; HH.waSend(p.userId, 'Te falta poco para publicar tu perfil' + (steps.length ? ': ' + steps.slice(0, 3).join(', ').toLowerCase() : '') + '. Cuando quieras, seguimos desde el panel.', { info: { kind: 'postulante' } }); n++; });
    return n;
  };

  /* ---------- Propuesta de cambio de horario (cliente) ---------- */
  HH.bookingProposalHtml = function (b) {
    if (!b.proposal || b.status !== 'solicitada') return '';
    const p = HH.profileOf(b.workerId);
    return `<div class="notice warn">${icon('calendar')}<span>${esc(p ? p.displayName : 'La acompañante')} te propone cambiar a <strong>${esc(fmtSlot(b.proposal, b.hours))}</strong>.</span></div><div class="row" style="gap:8px"><button class="btn sm" data-action="cliBkPropOk" data-id="${b.id}">${icon('check')} Aceptar cambio</button><button class="btn ghost sm" data-action="cliBkPropNo" data-id="${b.id}">Mantener el horario original</button></div>`;
  };
  Object.assign(HH.actions, {
    cliBkPropOk(el) {
      const b = (HH.db.bookings || []).find(x => x.id === el.dataset.id); if (!b || !b.proposal) return; const p = HH.profileOf(b.workerId);
      const keep = b.status; b.status = '_tmp'; const ok = HH.bookingSlots(p, b.proposal.date, b.hours).includes(b.proposal.start); b.status = keep;
      if (!ok) { HH.updateBooking(b.id, { proposal: null }); HH.toast('Ese horario ya no está libre. Se mantiene el original.', { type: 'warn' }); HH.refresh(); return; }
      const pr = b.proposal; HH.updateBooking(b.id, { date: pr.date, start: pr.start, proposal: null });
      HH.waSend(b.workerId, `El cliente aceptó el cambio: ${fmtB(b)}. Cuando recibas la seña, confirmala.`, { ref: { type: 'booking', id: b.id }, buttons: BK_BTNS() }); HH.toast('Listo, cambiaste el horario', { type: 'ok' }); HH.refresh();
    },
    cliBkPropNo(el) { const b = (HH.db.bookings || []).find(x => x.id === el.dataset.id); if (!b) return; HH.updateBooking(b.id, { proposal: null }); HH.waSend(b.workerId, `El cliente prefiere mantener el horario original: ${fmtB(b)}.`, { ref: { type: 'booking', id: b.id }, buttons: BK_BTNS() }); HH.toast('Mantenés el horario original'); HH.refresh(); },
  });

  /* ---------- Campo de WhatsApp en la agenda de la acompañante ---------- */
  HH.waAgendaField = function (p) {
    const cfg = HH.opsCfg('wa'); if (!cfg.enabled || !cfg.bookings) return '';
    const c = HH.bookingCfg(p);
    return `<div class="field"><span class="label">Avisos por WhatsApp</span><label class="row nowrap small" style="gap:8px;align-items:flex-start"><input type="checkbox" name="waNotify" value="1"${c.waNotify ? ' checked' : ''} style="margin-top:3px"><span>Avisarme cada solicitud al ${p.whatsapp ? '<strong>' + esc(p.whatsapp) + '</strong>' : 'WhatsApp de mi perfil'} y responder desde ahí: confirmar, rechazar o proponer otro horario.</span></label><button type="button" class="btn ghost sm" data-action="waPreview" style="justify-self:start">${icon('whatsapp')} Ver cómo te llegan</button></div>`;
  };
  HH.waAgendaSave = function (p, v) { HH.bookingCfg(p).waNotify = !!v.waNotify; };

  /* ---------- Vista de conversación estilo WhatsApp ---------- */
  function waConv(t, opts) {
    const o = opts || {};
    const msg = (m) => { const btns = m.dir === 'out' ? liveButtons(m) : null;
      return `<div class="wa-m ${m.dir}"><div class="wa-b">${esc(m.text)}<span class="wa-t">${HH.fmtDateTime(m.at).split(' ').pop()}</span></div>${btns ? `<div class="wa-btns">${btns.map(b => `<button type="button" data-action="waBtn" data-t="${t.id}" data-m="${m.id}" data-b="${esc(b.id)}">${esc(b.label)}</button>`).join('')}</div>` : (m.answered && m.buttons ? `<div class="tiny muted wa-ans">Respondido: ${esc((m.buttons.find(b => b.id === m.answered) || {}).label || '')}</div>` : '')}</div>`; };
    return `<div class="wa-sim">
      <div class="wa-head"><span class="wa-av">${icon('whatsapp')}</span><div class="grow"><strong>${o.title ? esc(o.title) : esc(t.name)}</strong><div class="tiny">${o.sub ? esc(o.sub) : esc(t.phone || '')}</div></div></div>
      <div class="wa-body" id="waBody">${t.messages.length ? t.messages.map(msg).join('') : '<div class="tiny muted" style="text-align:center;padding:20px">Sin mensajes todavía.</div>'}</div>
      <form class="wa-input" data-submit="waType" data-t="${t.id}"><input class="input" name="text" maxlength="400" autocomplete="off" placeholder="${o.placeholder || 'Escribir como ' + esc(t.name) + ' (simulación)'}" aria-label="Mensaje"><button class="icon-btn" type="submit" aria-label="Enviar">${icon('send')}</button></form>
    </div>`;
  }
  const scrollWa = () => setTimeout(() => { const b = document.getElementById('waBody'); if (b) b.scrollTop = b.scrollHeight; }, 0);
  function waPreviewModal(userId) {
    const t = HH.waThread(userId);
    HH.modal({ title: 'Avisos por WhatsApp', body: `<p class="small muted" style="margin-top:0">Así te llegan los avisos del asistente de SexyRose (${esc(HH.opsCfg('wa').number)}). En esta demo podés tocar los botones como si respondieras desde tu teléfono.</p>${waConv(t, { title: 'SexyRose', sub: 'Asistente · cuenta de empresa', placeholder: 'Escribí como si fueras vos (simulación)' })}`, actions: [{ label: 'Cerrar', action: 'closeModal' }] });
    t.unread = false; HH.save(); scrollWa();
  }
  Object.assign(HH.actions, {
    waPreview() { const me = HH.me(); if (me) waPreviewModal(me.id); },
    waBtn(el) {
      HH.waReply(el.dataset.t, el.dataset.m, el.dataset.b);
      const modalOpen = document.querySelector('#modalRoot.open .wa-sim');
      const t = wa().threads.find(x => x.id === el.dataset.t);
      if (modalOpen && t) waPreviewModal(t.contactId); else HH.refresh();
      scrollWa();
    },
    waType(form, ev, v) {
      const text = String(v.text || '').trim(); if (!text) return; const t = wa().threads.find(x => x.id === form.dataset.t); if (!t) return;
      // "ok" / "1" responde al último mensaje con botones vigentes
      const last = t.messages.slice().reverse().find(m => m.dir === 'out' && liveButtons(m));
      const quick = last && /^(ok|si|sí|dale|1)$/i.test(text) ? last.buttons[0].id : null;
      if (quick) HH.waReply(t.id, last.id, quick); else HH.waReply(t.id, null, null, text);
      const modalOpen = document.querySelector('#modalRoot.open .wa-sim');
      if (modalOpen) waPreviewModal(t.contactId); else HH.refresh();
      scrollWa();
    },
  });

  /* ---------- Verificación automática de identidad (simulada) ----------
     Compara la selfie y el video con la foto del documento. Además, como parte del mismo control:
     prueba de vida (que no sea una foto de una foto) y mayoría de edad según la fecha de nacimiento del documento.
     Si todo da bien, la cuenta queda verificada sola; si algo no da, pasa a revisión del admin. */
  const hash = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };
  HH.runAiReview = function (p) {
    const h = hash(p.userId); const v = p.verification || {}; const cfg = HH.opsCfg('ai');
    const age = Number(p.age) || null;
    const match = p.userId === 'u_mica' ? 74 : 91 + (h % 8); // Micaela: ejemplo de coincidencia baja en la demo
    const hasVideo = !!(v.video || p.verified === 'pending');
    const checks = [
      { k: 'face', label: 'Misma persona en la selfie y el documento', status: match >= cfg.matchMin ? 'ok' : 'warn', detail: `Coincidencia ${match}% (mínimo ${cfg.matchMin}%)` },
      { k: 'live', label: 'Prueba de vida', status: hasVideo ? 'ok' : 'warn', detail: hasVideo ? 'El video es de una persona real, no de una foto o pantalla' : 'Falta el video' },
      { k: 'age', label: 'Mayor de 18 según el documento', status: age && age < 18 ? 'fail' : (!age ? 'warn' : 'ok'), detail: age ? `Fecha de nacimiento: ${age} años` : 'No se pudo leer la fecha de nacimiento' },
    ];
    const worst = checks.some(c => c.status === 'fail') ? 'fail' : checks.some(c => c.status === 'warn') ? 'warn' : 'ok';
    p.aiReview = { at: HH.now(), checks, result: worst, match };
    HH.save(); return p.aiReview;
  };
  // Se llama al enviar la verificación: si da todo bien y está activa la verificación automática, aprueba sola
  HH.autoVerify = function (p) {
    const cfg = HH.opsCfg('ai'); const r = HH.runAiReview(p);
    if (cfg.autoVerify && r.result === 'ok' && HH.approveProfileVerification) { p.verifiedBy = 'ai'; HH.approveProfileVerification(p); HH.save(); return true; }
    return false;
  };
  HH.aiReviewHtml = function (p) {
    if (!p.aiReview && (p.verified === 'pending' || p.verification)) HH.runAiReview(p);
    const r = p.aiReview; if (!r) return '';
    const ic = { ok: 'checkCircle', warn: 'alert', fail: 'xCircle' };
    const sug = p.verifiedBy === 'ai' ? ['ok', 'Verificada automáticamente'] : { ok: ['ok', 'Todo coincide: se puede aprobar'], warn: ['warn', 'Revisión manual: algo no coincide o no se pudo leer'], fail: ['danger', 'No aprobar: el documento indica menor de 18'] }[r.result];
    return `<div class="ai-rev"><div class="row between" style="gap:8px"><div class="label" style="margin:0">${icon('sparkles')} Verificación automática · ${HH.timeAgo(r.at) === 'ahora' ? 'recién' : 'hace ' + HH.timeAgo(r.at)}</div><button type="button" class="btn ghost sm" data-action="admAiRerun" data-id="${esc(p.userId)}">${icon('refresh')} Volver a analizar</button></div>
      <ul>${r.checks.map(c => `<li class="${c.status}">${icon(ic[c.status])}<div><strong>${esc(c.label)}</strong><span class="small muted">${esc(c.detail)}</span></div></li>`).join('')}</ul>
      <div class="badge ${sug[0]}">${sug[1]}</div>
      <p class="tiny muted" style="margin:6px 0 0">Demo con resultados simulados. En producción lo hace el proveedor de verificación de identidad.</p></div>`;
  };
  Object.assign(HH.actions, {
    admAiRerun(el) { const p = HH.profileOf(el.dataset.id); if (!p) return; HH.runAiReview(p); if (HH.adminWorkerDetail) HH.adminWorkerDetail(p); HH.toast('Verificación analizada de nuevo'); },
  });
  // Si el admin verifica a mano algo que la AI marcó, pide confirmación explícita
  if (HH.actions.admVerify) {
    const _v = HH.actions.admVerify;
    HH.actions.admVerify = function (el) {
      const p = HH.profileOf(el.dataset.id); const r = p ? (p.aiReview || HH.runAiReview(p)) : null;
      if (!r || r.result === 'ok' || el.dataset.force) return _v.apply(this, arguments);
      const txt = r.result === 'fail' ? 'El documento indica menor de 18. Verificá solo si comprobaste a mano que el documento fue mal leído y es mayor de edad.' : 'La verificación automática marcó: ' + r.checks.filter(c => c.status !== 'ok').map(c => c.detail).join('; ') + '. ¿Lo revisaste en el documento, la selfie y el video?';
      HH.confirm({ title: 'Verificar a ' + p.displayName, text: txt, okLabel: r.result === 'fail' ? 'Revisé: es mayor de 18' : 'Sí, lo revisé', cls: r.result === 'fail' ? 'danger' : '', onOk: () => _v.call(this, { dataset: { id: p.userId, force: '1' } }) });
    };
  }

  /* ---------- Admin: pestañas Soporte, WhatsApp y Ajustes ---------- */
  if (HH.adminTabs) {
    HH.adminTabs.push({ id: 'soporte', label: 'Soporte', icon: 'help' }, { id: 'whatsapp', label: 'WhatsApp', icon: 'whatsapp' }, { id: 'ajustes', label: 'Ajustes', icon: 'settings' });
    HH.adminCounts.soporte = () => openTickets().length;
    HH.adminCounts.whatsapp = () => wa().threads.filter(t => t.messages.length && t.messages[t.messages.length - 1].dir === 'in' && t.ticketId && (HH.db.support.find(k => k.id === t.ticketId) || {}).status === 'abierto').length;
    const A = HH.ui.admOps = HH.ui.admOps || {};

    HH.adminViews.soporte = function (me) {
      ensure(); const f = A.tf || 'abierto'; const list = HH.db.support.filter(t => f === 'todos' || t.status === f).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
      const sel = list.find(t => t.id === A.tk) || list[0];
      const chip = (id, l) => `<button type="button" class="chip${f === id ? ' active' : ''}" data-action="opsTf" data-f="${id}">${l}${id === 'abierto' && openTickets().length ? ` <span class="badge" style="padding:0 6px">${openTickets().length}</span>` : ''}</button>`;
      const row = (t) => `<button type="button" class="list-item ops-tk${sel && sel.id === t.id ? ' on' : ''}" data-action="opsTk" data-id="${t.id}"><span class="ops-ch">${icon(t.channel === 'whatsapp' ? 'whatsapp' : 'chat')}</span><span class="grow" style="min-width:0"><span class="title ellipsis">${esc(t.name)}</span><span class="sub ellipsis">${esc((t.messages.filter(m => m.from === 'user').slice(-1)[0] || {}).text || t.reason)}</span></span><span class="tiny muted">${HH.timeAgo(t.updatedAt)}</span></button>`;
      const who = (m) => m.from === 'user' ? esc(sel.name) : m.from === 'bot' ? 'Asistente' : 'Equipo';
      const detail = sel ? `<div class="card stack" style="gap:10px">
          <div class="row between" style="gap:8px"><div><div class="card-title">${esc(sel.name)} <span class="badge ${sel.status === 'abierto' ? 'warn' : sel.status === 'respondido' ? 'info' : 'neutral'}">${sel.status}</span></div><div class="small muted">${sel.channel === 'whatsapp' ? 'WhatsApp ' + esc(sel.phone) : 'Web' + (sel.email ? ' · ' + esc(sel.email) : '')} · #${esc(sel.id.slice(3))} · ${esc(sel.reason || '')}</div></div>${sel.status !== 'cerrado' ? `<button class="btn ghost sm" data-action="opsTkClose" data-id="${sel.id}">${icon('check')} Cerrar</button>` : ''}</div>
          <div class="ops-tr">${sel.messages.map(m => `<div class="ops-m ${m.from}"><span class="tiny muted">${who(m)} · ${HH.fmtDateTime(m.at)}</span><div>${esc(m.text)}</div></div>`).join('')}</div>
          ${sel.status !== 'cerrado' ? `<form class="stack" style="gap:8px" data-submit="opsTkReply" data-id="${sel.id}"><label class="sr-only" for="opsRep">Respuesta</label><textarea class="textarea" id="opsRep" name="text" rows="3" maxlength="1000" required placeholder="Tu respuesta"></textarea><div class="row between" style="gap:8px"><span class="tiny muted">${sel.channel === 'whatsapp' ? 'Se envía por WhatsApp.' : 'Le aparece en el asistente' + (sel.email ? ' y le llega por email a ' + esc(sel.email) : '') + '.'}</span><button class="btn sm" type="submit">${icon('send')} Responder</button></div></form>` : ''}
        </div>` : `<div class="card"><div class="empty">${icon('inbox')}<h4>Sin consultas ${f === 'abierto' ? 'abiertas' : ''}</h4><p class="small">Cuando el asistente no puede resolver algo, la consulta aparece acá.</p></div></div>`;
      const kb = HH.db.kb;
      const kbCard = `<div class="card stack" style="gap:10px"><div class="row between" style="gap:8px"><div><div class="card-title">${icon('bulb')} Base de conocimiento</div><div class="small muted">El asistente responde solo con esto. Si no encuentra la respuesta, escala a una persona.</div></div><button class="btn sm" data-action="opsKbEdit">${icon('plus')} Agregar</button></div>
        <form class="row nowrap" style="gap:6px" data-submit="opsKbTest"><input class="input" name="q" placeholder="Probá una pregunta" aria-label="Probar una pregunta" value="${esc(A.kbq || '')}"><button class="btn secondary sm" type="submit">Probar</button></form>
        ${A.kbr ? `<div class="notice ${A.kbr.type === 'answer' ? 'ok' : 'warn'}">${icon(A.kbr.type === 'answer' ? 'checkCircle' : 'alert')}<span>${A.kbr.type === 'answer' ? 'Responde con <strong>' + esc(A.kbr.title) + '</strong>' : A.kbr.type === 'policy' ? 'Responde con el aviso de normas (sin contenido sexual)' : A.kbr.type === 'greet' ? 'Responde con un saludo' : 'Escala a una persona: ' + esc(A.kbr.reason)}</span></div>` : ''}
        <div class="list">${kb.map(a => `<div class="list-item"><div class="grow" style="min-width:0"><div class="title">${esc(a.title)}</div><div class="sub ellipsis">${esc(a.keywords)}</div></div><button class="icon-btn sm" data-action="opsKbEdit" data-id="${a.id}" aria-label="Editar">${icon('edit')}</button><button class="icon-btn sm" data-action="opsKbDel" data-id="${a.id}" aria-label="Borrar">${icon('trash')}</button></div>`).join('')}</div></div>`;
      return HH.adminLayout(me, 'soporte', `${HH.adminHead('Soporte', '', 'Consultas que el asistente escaló a una persona (web y WhatsApp), y la base de conocimiento con la que responde.')}
        <div class="chips" style="margin-bottom:12px">${chip('abierto', 'Abiertas')}${chip('respondido', 'Respondidas')}${chip('cerrado', 'Cerradas')}${chip('todos', 'Todas')}</div>
        <div class="ops-sup"><div class="card pad-sm"><div class="list">${list.length ? list.map(row).join('') : '<div class="small muted" style="padding:10px">Nada por acá.</div>'}</div></div>${detail}</div>
        <div style="margin-top:16px">${kbCard}</div>`);
    };

    HH.adminViews.whatsapp = function (me) {
      const cfg = HH.opsCfg('wa'); const th = wa().threads.slice().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
      const sel = th.find(t => t.id === A.wt) || th[0];
      const KIND = { acompanante: ['Acompañante', 'ok'], postulante: ['Postulante', 'warn'], cliente: ['Cliente', 'info'] };
      const row = (t) => { const last = t.messages[t.messages.length - 1]; const k = KIND[t.kind] || KIND.cliente; return `<button type="button" class="list-item ops-tk${sel && sel.id === t.id ? ' on' : ''}" data-action="opsWt" data-id="${t.id}"><span class="ops-ch wa-g">${icon('whatsapp')}</span><span class="grow" style="min-width:0"><span class="title ellipsis">${esc(t.name)} <span class="badge ${k[1]}" style="padding:0 6px">${k[0]}</span></span><span class="sub ellipsis">${last ? (last.dir === 'out' ? 'Bot: ' : '') + esc(last.text) : ''}</span></span></button>`; };
      return HH.adminLayout(me, 'whatsapp', `${HH.adminHead('WhatsApp', `<div class="row" style="gap:8px"><button class="btn secondary sm" data-action="opsWaRemind">${icon('bell')} Recordar pasos a postulantes</button><button class="btn sm" data-action="opsWaNew">${icon('plus')} Probar como cliente</button></div>`, 'Simulador del asistente en WhatsApp: avisos de reservas a las acompañantes, alta de postulantes y soporte. Tocá los botones para responder como el contacto.')}
        ${cfg.enabled ? '' : `<div class="notice warn">${icon('alert')}<span>El bot está apagado. Activalo en Ajustes.</span></div>`}
        <div class="notice">${icon('info')}<span>Número de empresa: <strong>${esc(cfg.number)}</strong>. En producción: WhatsApp Business Cloud API, con plantillas aprobadas por Meta para los avisos que inicia el bot.</span></div>
        <div class="ops-sup" style="margin-top:12px"><div class="card pad-sm"><div class="list">${th.map(row).join('') || '<div class="small muted" style="padding:10px">Sin conversaciones.</div>'}</div></div><div>${sel ? waConv(sel) : ''}</div></div>`);
    };

    HH.adminViews.ajustes = function (me) {
      const c = HH.opsCfg('commission'), ai = HH.opsCfg('ai'), w = HH.opsCfg('wa');
      const sw = (name, on, label, hint) => `<label class="row nowrap small ops-sw" style="gap:10px;align-items:flex-start"><input type="checkbox" name="${name}" value="1"${on ? ' checked' : ''} style="margin-top:3px"><span><strong>${label}</strong>${hint ? `<span class="muted"> · ${hint}</span>` : ''}</span></label>`;
      const fees = HH.sum(HH.db.payments.filter(p => p.status === 'approved'), p => HH.feeOf(p));
      const comm = `<form class="card stack" data-submit="opsCommSave"><div class="card-title">${icon('dollar')} Comisiones</div><div class="small muted">Porcentaje que retiene SexyRose en cada venta. Se aplica a las ventas nuevas: cada venta guarda el porcentaje vigente en ese momento. Las acompañantes lo ven antes de publicar y en Ingresos.</div>
        <div class="grid-2" style="align-items:start">${Object.entries(HH.COMMISSION_TYPES).map(([k, l]) => `<div class="field"><label for="opsC_${k}">${l}</label><div class="input-group" style="max-width:180px"><input class="input num" id="opsC_${k}" name="${k}" type="number" min="0" max="80" step="1" value="${c[k] || 0}" inputmode="numeric"><span class="addon">%</span></div></div>`).join('')}</div>
        <div class="row between" style="gap:8px"><span class="tiny muted">Comisiones cobradas hasta hoy: <strong>${HH.money(fees)}</strong>. Las reservas, el chat y el contenido suelto no tienen comisión.</span><button class="btn" type="submit">${icon('check')} Guardar</button></div></form>`;
      const aiCard = `<form class="card stack" data-submit="opsAiSave"><div class="card-title">${icon('sparkles')} Asistente AI de soporte</div>
        ${sw('enabled', ai.enabled, 'Asistente activo en la web', 'botón Ayuda en todas las páginas, menos admin, chat y shorts')}
        <div class="grid-2" style="align-items:start"><div class="field"><label for="opsProv">Modelo</label><select class="select" id="opsProv" name="provider">${Object.entries(HH.AI_PROVIDERS).map(([k, l]) => `<option value="${k}"${ai.provider === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="opsModel">Versión del modelo</label><input class="input" id="opsModel" name="model" value="${esc(ai.model)}" maxlength="60" placeholder="La que elijas al integrarlo"></div></div>
        <div class="field"><label for="opsIns">Instrucciones para el asistente</label><textarea class="textarea" id="opsIns" name="instructions" rows="4" maxlength="1500">${esc(ai.instructions)}</textarea></div>
        <div class="grid-2" style="align-items:start"><div class="field"><label for="opsEsc">Email del equipo (escalamientos)</label><input class="input" id="opsEsc" name="escalateEmail" type="email" value="${esc(ai.escalateEmail)}"></div>
        <div class="field"><label for="opsMin">Exigencia para responder solo</label><select class="select" id="opsMin" name="minScore">${[[1, 'Baja · responde más, escala menos'], [2, 'Media'], [4, 'Alta · ante la duda, escala']].map(([v, l]) => `<option value="${v}"${Number(ai.minScore) === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div></div>
        <div class="notice">${icon('lock')}<span>La clave de API del modelo se configura en el servidor, nunca en el navegador. El asistente solo usa la base de conocimiento de Soporte y no ve datos de pago.</span></div>
        <div class="row" style="justify-content:flex-end"><button class="btn" type="submit">${icon('check')} Guardar</button></div></form>`;
      const waCard = `<form class="card stack" data-submit="opsWaSave"><div class="card-title">${icon('whatsapp')} Bot de WhatsApp</div>
        ${sw('enabled', w.enabled, 'Bot activo')}
        <div class="field"><label for="opsNum">Número de empresa</label><input class="input" id="opsNum" name="number" value="${esc(w.number)}" maxlength="30" style="max-width:260px"></div>
        <div class="stack" style="gap:8px">${sw('support', w.support, 'Soporte', 'responde consultas con la base de conocimiento y escala a Soporte')}${sw('bookings', w.bookings, 'Avisos de reservas', 'a las acompañantes que usan la agenda y lo activan; responden confirmar, rechazar o proponer horario')}${sw('onboarding', w.onboarding, 'Alta de postulantes', 'pasos, recordatorios y aviso cuando queda verificada; ofrece activar la agenda')}</div>
        <div class="row" style="justify-content:flex-end"><button class="btn" type="submit">${icon('check')} Guardar</button></div></form>`;
      const ver = `<form class="card stack" data-submit="opsVerSave"><div class="card-title">${icon('shield')} Verificación automática de identidad</div><div class="small muted">Compara la selfie y el video con la foto del documento, confirma que es una persona real (prueba de vida) y que el documento indica 18 años o más. Si todo coincide, la cuenta queda verificada sin intervención. Si algo no coincide o no se lee, pasa a Acompañantes → Por verificar.</div>
        ${sw('autoVerify', ai.autoVerify, 'Aprobar automáticamente cuando todo coincide')}
        <div class="field"><label for="opsMatch">Coincidencia mínima de rostro</label><select class="select" id="opsMatch" name="matchMin" style="max-width:260px">${[85, 90, 95].map(v => `<option value="${v}"${Number(ai.matchMin) === v ? ' selected' : ''}>${v}%${v === 90 ? ' (recomendado)' : ''}</option>`).join('')}</select></div>
        <div class="row" style="justify-content:flex-end"><button class="btn" type="submit">${icon('check')} Guardar</button></div></form>`;
      return HH.adminLayout(me, 'ajustes', `${HH.adminHead('Ajustes', '', 'Comisiones, verificación automática, asistente de soporte y bot de WhatsApp.')}<div class="stack" style="gap:16px">${comm}${ver}${aiCard}${waCard}</div>`);
    };

    Object.assign(HH.actions, {
      opsTf(el) { A.tf = el.dataset.f; A.tk = null; HH.save(); HH.refresh(); },
      opsTk(el) { A.tk = el.dataset.id; HH.save(); HH.refresh(); },
      opsTkClose(el) { const t = HH.db.support.find(x => x.id === el.dataset.id); if (t) { t.status = 'cerrado'; t.updatedAt = HH.now(); HH.save(); HH.toast('Consulta cerrada'); HH.refresh(); } },
      opsTkReply(form, ev, v) {
        const t = HH.db.support.find(x => x.id === form.dataset.id); const text = String(v.text || '').trim(); if (!t || !text) return;
        const m = { from: 'admin', text, at: HH.now() }; t.messages.push(m); t.status = 'respondido'; t.updatedAt = m.at;
        if (t.channel === 'whatsapp') { const th = wa().threads.find(x => x.ticketId === t.id); if (th) HH.waSend(th.contactId, text); }
        HH.save(); HH.toast('Respuesta enviada', { type: 'ok' }); HH.refresh();
      },
      opsKbTest(form, ev, v) { A.kbq = String(v.q || ''); const r = HH.supportMatch(A.kbq); A.kbr = { type: r.type, title: r.article && r.article.title, reason: r.reason }; HH.save(); HH.refresh(); },
      opsKbDel(el) { HH.confirm({ title: 'Borrar artículo', text: 'El asistente deja de usarlo para responder.', okLabel: 'Borrar', cls: 'danger', onOk: () => { HH.db.kb = HH.db.kb.filter(a => a.id !== el.dataset.id); HH.save(); HH.refresh(); } }); },
      opsKbEdit(el) {
        const a = HH.db.kb.find(x => x.id === el.dataset.id) || { title: '', keywords: '', answer: '' };
        HH.modal({ title: a.id ? 'Editar artículo' : 'Nuevo artículo', body: `<div class="stack" style="gap:10px">
            <div class="field"><label for="kbT">Título</label><input class="input" id="kbT" maxlength="80" value="${esc(a.title)}"></div>
            <div class="field"><label for="kbK">Palabras clave</label><input class="input" id="kbK" maxlength="300" value="${esc(a.keywords)}"><span class="hint">Separadas por coma. Son las palabras con las que la gente pregunta.</span></div>
            <div class="field"><label for="kbA">Respuesta</label><textarea class="textarea" id="kbA" rows="5" maxlength="1200">${esc(a.answer)}</textarea></div></div>`,
          actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: icon('check') + ' Guardar', onClick: () => {
            const g = (id) => document.getElementById(id).value.trim(); if (g('kbT').length < 3 || g('kbA').length < 10) { HH.toast('Completá título y respuesta', { type: 'warn' }); return; }
            if (a.id) Object.assign(a, { title: g('kbT'), keywords: g('kbK'), answer: g('kbA') }); else HH.db.kb.push({ id: HH.uid('kb'), title: g('kbT'), keywords: g('kbK'), answer: g('kbA') });
            HH.save(); HH.closeModal(); HH.refresh(); HH.toast('Artículo guardado', { type: 'ok' }); } }] });
      },
      opsWt(el) { A.wt = el.dataset.id; HH.save(); HH.refresh(); scrollWa(); },
      opsWaNew() { const id = 'wa_' + Math.random().toString(36).slice(2, 7); const n = '+54 9 11 5' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0').replace(/(\d{3})(\d{4})/, '$1-$2'); const t = HH.waThread(id, { name: n, phone: n, kind: 'cliente' }); A.wt = t.id; HH.save(); HH.refresh(); setTimeout(() => { const i = document.querySelector('.wa-input input'); if (i) i.focus(); }, 30); },
      opsWaRemind() { const n = HH.waRemindApplicants(); HH.toast(n ? `Recordatorio enviado a ${n} ${HH.plural(n, 'postulante')}` : 'No hay postulantes con pasos pendientes', { type: n ? 'ok' : '' }); HH.refresh(); },
      opsCommSave(form, ev, v) { const pack = Math.round(Number(v.pack)), request = Math.round(Number(v.request)); if ([pack, request].some(x => !(x >= 0 && x <= 80))) { HH.toast('Usá un porcentaje entre 0 y 80', { type: 'warn' }); return; } HH.saveSettings({ commission: { pack, request } }); HH.toast(`Comisiones: packs ${pack}% · pedidos ${request}%`, { type: 'ok' }); HH.refresh(); },
      opsAiSave(form, ev, v) { HH.saveSettings({ ai: { enabled: !!v.enabled, provider: v.provider, model: String(v.model || '').trim(), instructions: String(v.instructions || '').trim(), escalateEmail: String(v.escalateEmail || '').trim(), minScore: Number(v.minScore) || 2 } }); HH.toast('Asistente guardado', { type: 'ok' }); HH.refresh(); },
      opsVerSave(form, ev, v) { HH.saveSettings({ ai: { autoVerify: !!v.autoVerify, matchMin: Number(v.matchMin) || 90 } }); HH.toast('Verificación automática ' + (v.autoVerify ? 'activa' : 'apagada'), { type: 'ok' }); HH.refresh(); },
      opsWaSave(form, ev, v) { HH.saveSettings({ wa: { enabled: !!v.enabled, number: String(v.number || '').trim(), support: !!v.support, bookings: !!v.bookings, onboarding: !!v.onboarding } }); HH.toast('Bot de WhatsApp guardado', { type: 'ok' }); HH.refresh(); },
    });
  }

  /* ---------- Estilos ---------- */
  const css = `
  .sup-fab{position:fixed;right:16px;bottom:calc(var(--bottomnav-h) + 14px + env(safe-area-inset-bottom,0px));z-index:70;display:flex;align-items:center;gap:6px;height:44px;padding:0 16px 0 12px;border-radius:999px;border:1px solid var(--line-2);background:var(--surface-2);color:var(--fg);font-weight:700;box-shadow:var(--shadow);cursor:pointer}
  .sup-fab svg{width:20px;height:20px;color:var(--berry)}
  @media (min-width:900px){.sup-fab{bottom:24px;right:24px}}
  @media (max-width:560px){.sup-fab span{display:none}.sup-fab{width:44px;padding:0;justify-content:center}}
  .sup-panel{position:fixed;z-index:90;right:16px;bottom:calc(var(--bottomnav-h) + 14px + env(safe-area-inset-bottom,0px));width:min(380px,calc(100vw - 32px));height:min(560px,calc(100dvh - var(--header-h) - var(--bottomnav-h) - 40px));display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--line-2);border-radius:20px;box-shadow:var(--shadow);overflow:hidden}
  .sup-panel[hidden]{display:none}
  @media (min-width:900px){.sup-panel{bottom:24px;right:24px;height:min(600px,calc(100dvh - 120px))}}
  .sup-head{display:flex;gap:10px;align-items:center;padding:12px 12px 12px 14px;border-bottom:1px solid var(--line)}
  .sup-av{width:34px;height:34px;border-radius:12px;background:var(--berry-tint);color:var(--berry);display:grid;place-items:center;flex:none}.sup-av svg{width:18px;height:18px}
  .sup-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}
  .sup-msg{display:flex;flex-direction:column;gap:4px;max-width:88%}
  .sup-msg .sup-b{padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.45;background:var(--surface-2);white-space:pre-wrap}
  .sup-msg.user{align-self:flex-end}.sup-msg.user .sup-b{background:var(--berry);color:var(--berry-ink)}
  .sup-msg.admin .sup-b{background:var(--info-tint)}.sup-who{color:var(--info);font-weight:700}
  .sup-fb{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  .sup-topics{display:flex;flex-wrap:wrap;gap:6px}
  .chip.sm{padding:5px 10px;font-size:12px;min-height:0}
  .sup-email{display:grid;gap:6px;padding:10px;border-radius:12px;background:var(--surface-2)}
  .sup-input{display:flex;gap:8px;padding:10px;border-top:1px solid var(--line)}.sup-input .input{min-height:42px}
  .sup-foot{padding:0 12px 10px}
  .ops-sup{display:grid;gap:12px;grid-template-columns:minmax(0,1fr)}
  @media (min-width:1000px){.ops-sup{grid-template-columns:300px minmax(0,1fr);align-items:start}}
  .ops-tk{width:100%;text-align:left;cursor:pointer;border-radius:12px;overflow:hidden}.ops-tk .grow{overflow:hidden}.ops-tk .title,.ops-tk .sub{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ops-tk.on{background:var(--surface-2)}
  .ops-ch{width:34px;height:34px;border-radius:11px;background:var(--surface-2);display:grid;place-items:center;flex:none;color:var(--fg-2)}.ops-ch svg{width:17px;height:17px}.ops-ch.wa-g{color:#25D366}
  .ops-tr{display:grid;gap:8px;max-height:420px;overflow:auto}
  .ops-m{padding:8px 12px;border-radius:12px;background:var(--surface-2);font-size:14px;display:grid;gap:2px}.ops-m.user{background:var(--berry-tint)}.ops-m.admin{background:var(--info-tint)}
  .ops-sw input{accent-color:var(--berry)}
  .wa-sim{display:flex;flex-direction:column;border-radius:16px;overflow:hidden;border:1px solid var(--line);background:#0b141a;min-height:420px}
  .wa-head{display:flex;gap:10px;align-items:center;padding:10px 12px;background:#202c33;color:#e9edef}.wa-head .tiny{color:#8696a0}
  .wa-av{width:34px;height:34px;border-radius:50%;background:#25D366;color:#fff;display:grid;place-items:center}.wa-av svg{width:18px;height:18px}
  .wa-body{flex:1;padding:12px;display:flex;flex-direction:column;gap:8px;overflow-y:auto;max-height:460px;background:#0b141a}
  .wa-m{display:flex;flex-direction:column;gap:4px;max-width:85%}.wa-m.in{align-self:flex-end}
  .wa-b{padding:7px 10px 18px;border-radius:10px;font-size:14px;line-height:1.4;color:#e9edef;background:#202c33;position:relative;white-space:pre-wrap;min-width:64px}
  .wa-m.in .wa-b{background:#005c4b}
  .wa-t{position:absolute;right:8px;bottom:3px;font-size:10px;color:#8696a0}
  .wa-btns{display:grid;gap:4px}
  .wa-btns button{background:#202c33;color:#53bdeb;border:0;border-radius:10px;padding:9px 10px;font-weight:600;font-size:13px;cursor:pointer;text-align:center}
  .wa-btns button:hover{background:#2a3942}
  .wa-ans{padding-left:4px;color:#8696a0}
  .wa-input{display:flex;gap:8px;padding:8px;background:#202c33}.wa-input .input{background:#2a3942;border-color:transparent;color:#e9edef;min-height:40px}
  .wa-input .icon-btn{background:#00a884;border-color:transparent;color:#fff}
  .ai-rev{border:1px solid var(--line-2);border-radius:14px;padding:12px;display:grid;gap:10px;background:var(--surface-2)}
  .ai-rev ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}
  .ai-rev li{display:flex;gap:8px;align-items:flex-start}.ai-rev li > svg{width:18px;height:18px;flex:none;margin-top:1px}
  .ai-rev li div{display:grid}.ai-rev li.ok > svg{color:var(--ok)}.ai-rev li.warn > svg{color:var(--warn)}.ai-rev li.fail > svg{color:var(--danger)}
  .ai-rev .badge{justify-self:start}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
})();
