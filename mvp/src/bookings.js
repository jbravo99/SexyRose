/* SexyRose · Reservas de salidas (agenda)
   - SexyRose NO cobra ni procesa la seña: la acompañante deja su propio link de pago.
   - La plataforma aporta el calendario: disponibilidad, horarios libres, estado de cada reserva.
   - Seña = porcentaje fijo (lo define el admin) de la tarifa orientativa por hora × duración.
   - Disponible para planes Star, A, B y C. */
(function () {
  const esc = HH.esc;
  HH.BOOKING_PLANS = ['S', 'A', 'B', 'C'];
  HH.BOOKING_DEFAULTS = { depositPct: 30, maxHours: 4, slotMinutes: 30, daysAhead: 21 };
  HH.bookingSettings = () => Object.assign({}, HH.BOOKING_DEFAULTS, (HH.settings().booking) || {});
  HH.WEEKDAYS = [{ k: 1, l: 'Lunes' }, { k: 2, l: 'Martes' }, { k: 3, l: 'Miércoles' }, { k: 4, l: 'Jueves' }, { k: 5, l: 'Viernes' }, { k: 6, l: 'Sábado' }, { k: 0, l: 'Domingo' }];
  HH.BOOKING_STATUS = {
    solicitada: { label: 'Esperando seña', cls: 'warn' },
    confirmada: { label: 'Confirmada', cls: 'ok' },
    rechazada: { label: 'Rechazada', cls: 'danger' },
    cancelada: { label: 'Cancelada', cls: 'neutral' },
    realizada: { label: 'Realizada', cls: 'info' },
  };
  HH.BOOKING_TERMS = 'Reservo una salida de compañía en un lugar público, sin contenido sexual de ningún tipo. Si alguna de las partes propone otra cosa, la cuenta se da de baja. La seña se paga directo a la acompañante: SexyRose no la cobra ni la gestiona.';

  const toMin = (hm) => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + (m || 0); };
  const fromMin = (t) => String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  const ymdDate = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d); };
  HH.bookingAt = (b) => { const d = ymdDate(b.date); const t = toMin(b.start); d.setHours(Math.floor(t / 60), t % 60, 0, 0); return d; };
  HH.bookingEnd = (b) => fromMin(toMin(b.start) + Math.round(b.hours * 60));
  HH.fmtBooking = (b) => `${ymdDate(b.date).toLocaleDateString(HH.loc(), { weekday: 'short', day: 'numeric', month: 'short' })} · ${b.start} a ${HH.bookingEnd(b)} h`;

  HH.bookingCfg = (p) => { if (!p.booking) p.booking = { enabled: false, payLink: '', minNoticeHours: 12, availability: {} }; if (!p.booking.availability) p.booking.availability = {}; if (!p.booking.blocks) p.booking.blocks = []; return p.booking; };
  HH.ymdDate = ymdDate; HH.toMin = toMin; HH.fromMin = fromMin;
  // Bloqueos puntuales de la agenda: "ocupado" (salida coordinada por fuera, con un cliente) o "bloqueado" (personal).
  // El cliente nunca ve el motivo: para él ese horario simplemente no está disponible.
  HH.BLOCK_KINDS = { ocupado: { label: 'Ocupado', cls: 'busy', hint: 'Una salida que coordinaste por fuera de la agenda' }, bloqueado: { label: 'Bloqueado', cls: 'blocked', hint: 'Un horario personal en el que no trabajás' } };
  HH.blocksOn = (p, ymd) => HH.bookingCfg(p).blocks.filter(x => x.date === ymd);
  HH.addBlock = function (p, { date, from, to, kind, note, allDay }) {
    const c = HH.bookingCfg(p);
    if (!date) return { error: 'Elegí el día' };
    if (allDay) { from = '00:00'; to = '24:00'; }
    if (!from || !to || toMin(from) >= toMin(to)) return { error: 'El fin tiene que ser después del inicio' };
    const b = { id: HH.uid('blk'), date, from, to, kind: HH.BLOCK_KINDS[kind] ? kind : 'bloqueado', note: String(note || '').trim().slice(0, 80), allDay: !!allDay, createdAt: HH.now() };
    c.blocks.push(b); c.blocks = c.blocks.filter(x => x.date >= HH.localDay(HH.daysFromNow(-1))); HH.save(); return { ok: true, block: b };
  };
  HH.removeBlock = function (p, id) { const c = HH.bookingCfg(p); c.blocks = c.blocks.filter(x => x.id !== id); HH.save(); };
  // Rangos no disponibles de un día (reservas activas + bloqueos), en minutos
  HH.busyRanges = (p, ymd) => HH.bookingsOf(p.userId).filter(b => b.date === ymd && (b.status === 'solicitada' || b.status === 'confirmada')).map(b => [toMin(b.start), toMin(b.start) + Math.round(b.hours * 60)])
    .concat(HH.blocksOn(p, ymd).map(x => [toMin(x.from), toMin(x.to)]));
  HH.validPayLink = (s) => /^https:\/\/[^\s/]+\.[^\s]{2,}/i.test(String(s || '').trim());
  HH.bookingPlanOk = (workerId) => HH.BOOKING_PLANS.includes(HH.levelOf(workerId));
  // Qué le falta a una acompañante para recibir reservas (vacío = puede)
  HH.bookingIssues = function (p) {
    if (!p) return ['perfil'];
    const c = HH.bookingCfg(p); const out = [];
    if (!HH.bookingPlanOk(p.userId)) out.push('plan');
    if (!(p.rateFrom > 0)) out.push('tarifa');
    if (!HH.validPayLink(c.payLink)) out.push('link');
    if (!Object.values(c.availability).some(r => r && r.length)) out.push('horarios');
    if (!c.enabled) out.push('activar');
    return out;
  };
  HH.canTakeBookings = (p) => !!p && HH.bookingIssues(p).length === 0 && HH.publishedProfiles().some(x => x.userId === p.userId);
  HH.depositFor = (p, hours) => Math.round((p.rateFrom || 0) * hours * HH.bookingSettings().depositPct / 100);

  HH.bookingsOf = (workerId) => (HH.db.bookings || []).filter(b => b.workerId === workerId);
  HH.bookingsByClient = (clientId) => (HH.db.bookings || []).filter(b => b.clientId === clientId).sort((a, b) => HH.bookingAt(b) - HH.bookingAt(a));
  HH.pendingBookings = (workerId) => HH.bookingsOf(workerId).filter(b => b.status === 'solicitada' && HH.bookingAt(b) > new Date());

  // Horarios de inicio libres para una fecha y duración
  HH.bookingSlots = function (p, ymd, hours) {
    const c = HH.bookingCfg(p); const st = HH.bookingSettings();
    const ranges = c.availability[ymdDate(ymd).getDay()] || [];
    const dur = Math.round(hours * 60);
    const busy = HH.busyRanges(p, ymd);
    const minStart = Date.now() + (Number(c.minNoticeHours) || 0) * 3600e3;
    const out = [];
    ranges.forEach(r => {
      for (let t = toMin(r.from); t + dur <= toMin(r.to); t += st.slotMinutes) {
        const at = ymdDate(ymd); at.setHours(Math.floor(t / 60), t % 60, 0, 0);
        if (at.getTime() < minStart) continue;
        if (busy.some(([a, b]) => t < b && t + dur > a)) continue;
        out.push(fromMin(t));
      }
    });
    return out;
  };
  HH.bookingDays = function (p, hours) {
    const out = []; const st = HH.bookingSettings();
    for (let i = 0; i < st.daysAhead; i++) { const ymd = HH.localDay(HH.daysFromNow(i)); if (HH.bookingSlots(p, ymd, hours).length) out.push(ymd); }
    return out;
  };

  HH.createBooking = function ({ workerId, clientId, activity, place, date, start, hours, note }) {
    const p = HH.profileOf(workerId);
    if (!p || !HH.canTakeBookings(p)) return { error: 'Esta acompañante no está tomando reservas' };
    if (!HH.bookingSlots(p, date, hours).includes(start)) return { error: 'Ese horario ya no está disponible' };
    if (String(place || '').trim().length < 4) return { error: 'Indicá el punto de encuentro' };
    if (!HH.db.bookings) HH.db.bookings = [];
    const b = { id: HH.uid('bk'), workerId, clientId, activity, place: String(place).trim().slice(0, 120), note: String(note || '').trim().slice(0, 400), date, start, hours, depositUsd: HH.depositFor(p, hours), depositPct: HH.bookingSettings().depositPct, payLink: HH.bookingCfg(p).payLink, status: 'solicitada', createdAt: HH.now(), updatedAt: HH.now() };
    HH.db.bookings.push(b); HH.save();
    return { ok: true, booking: b };
  };
  HH.updateBooking = function (id, patch) { const b = (HH.db.bookings || []).find(x => x.id === id); if (!b) return null; Object.assign(b, patch, { updatedAt: HH.now() }); HH.save(); return b; };

  /* ---------- Modal de reserva (cliente) ---------- */
  const BK = { p: null, hours: 1, date: null, start: null, activity: null, place: '', note: '', terms: false };
  function bookingBody() {
    const p = BK.p; const st = HH.bookingSettings();
    const days = HH.bookingDays(p, BK.hours);
    if (!days.includes(BK.date)) { BK.date = days[0] || null; BK.start = null; }
    const slots = BK.date ? HH.bookingSlots(p, BK.date, BK.hours) : [];
    if (!slots.includes(BK.start)) BK.start = null;
    const acts = (p.activities && p.activities.length ? p.activities : HH.ACTIVITIES.map(a => a.id));
    if (!acts.includes(BK.activity)) BK.activity = acts[0];
    const dep = HH.depositFor(p, BK.hours);
    const dayChip = (ymd) => { const d = ymdDate(ymd); return `<button type="button" class="bk-day${ymd === BK.date ? ' on' : ''}" data-action="bkDate" data-v="${ymd}"><span class="tiny">${d.toLocaleDateString(HH.loc(), { weekday: 'short' })}</span><strong>${d.getDate()}</strong><span class="tiny">${d.toLocaleDateString(HH.loc(), { month: 'short' })}</span></button>`; };
    return `<div class="stack bk" style="gap:14px">
      <div class="row nowrap" style="gap:10px">${HH.avatar(p, 40)}<div class="grow"><div style="font-weight:800">${esc(p.displayName)}</div><div class="small muted">${esc(p.city || '')} · tarifa orientativa ${HH.money(p.rateFrom)}/h</div></div></div>
      <div class="field"><span class="label">Actividad</span><div class="chips">${acts.map(a => { const x = HH.activity(a); return `<button type="button" class="chip${a === BK.activity ? ' active' : ''}" data-action="bkAct" data-v="${esc(a)}">${HH.icon(x.icon)} ${esc(x.label)}</button>`; }).join('')}</div></div>
      <div class="field"><span class="label">Duración</span><div class="chips">${Array.from({ length: st.maxHours }, (_, i) => i + 1).map(h => `<button type="button" class="chip${h === BK.hours ? ' active' : ''}" data-action="bkHours" data-v="${h}">${h} h</button>`).join('')}</div></div>
      <div class="field"><span class="label">Día</span>${days.length ? `<div class="bk-days">${days.map(dayChip).join('')}</div>` : '<div class="small muted">No tiene horarios libres para esa duración en las próximas semanas. Probá con menos horas.</div>'}</div>
      ${BK.date ? `<div class="field"><span class="label">Horario de inicio</span><div class="chips">${slots.map(s => `<button type="button" class="chip${s === BK.start ? ' active' : ''}" data-action="bkTime" data-v="${s}">${s}</button>`).join('')}</div></div>` : ''}
      <div class="field"><label for="bkPlace">Punto de encuentro</label><input class="input" id="bkPlace" maxlength="120" value="${esc(BK.place)}" data-input="bkField" data-k="place" placeholder="Un lugar público. Ej.: entrada del Malba"><span class="hint">Siempre en un lugar público. Nunca domicilios ni hoteles.</span></div>
      <div class="field"><label for="bkNote">Mensaje (opcional)</label><textarea class="textarea" id="bkNote" rows="2" maxlength="400" data-input="bkField" data-k="note" placeholder="Contale qué te gustaría hacer.">${esc(BK.note)}</textarea></div>
      <div class="bk-dep"><div class="grow"><div class="small muted">Seña (${st.depositPct}% de ${HH.money(p.rateFrom)} × ${BK.hours} h)</div><div style="font-weight:800;font-size:20px">${HH.money(dep)}</div></div><div class="tiny muted" style="max-width:220px">Se paga con el link de pago de ${esc(p.displayName)}. SexyRose no la cobra.</div></div>
      <label class="row nowrap small" style="gap:8px;align-items:flex-start"><input type="checkbox" id="bkTerms" data-change="bkField" data-k="terms"${BK.terms ? ' checked' : ''} style="margin-top:3px"><span>${esc(HH.BOOKING_TERMS)}</span></label>
    </div>`;
  }
  function renderBooking() {
    HH.modal({ title: 'Reservar salida', body: bookingBody(), actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: HH.icon('calendar') + ' Solicitar reserva', id: 'bkSend', onClick: () => HH.actions.bkSend() }] });
  }
  HH.openBookingModal = function (p) {
    Object.assign(BK, { p, hours: 1, date: null, start: null, activity: null, place: '', note: '', terms: false });
    renderBooking();
  };
  const keepScroll = (fn) => { const box = document.getElementById('modalBox'); const y = box ? box.scrollTop : 0; fn(); const b2 = document.getElementById('modalBox'); if (b2) b2.scrollTop = y; };
  Object.assign(HH.actions, {
    bkAct(el) { BK.activity = el.dataset.v; keepScroll(renderBooking); },
    bkHours(el) { BK.hours = Number(el.dataset.v) || 1; keepScroll(renderBooking); },
    bkDate(el) { BK.date = el.dataset.v; BK.start = null; keepScroll(renderBooking); },
    bkTime(el) { BK.start = el.dataset.v; keepScroll(renderBooking); },
    bkField(el) { const k = el.dataset.k; BK[k] = el.type === 'checkbox' ? el.checked : el.value; },
    bkSend() {
      const me = HH.me(); if (!me || me.role !== 'client') { HH.toast('Las reservas son para cuentas de cliente', { type: 'warn' }); return; }
      if (!BK.date || !BK.start) { HH.toast('Elegí día y horario', { type: 'warn' }); return; }
      if (BK.place.trim().length < 4) { HH.toast('Indicá el punto de encuentro (un lugar público)', { type: 'warn' }); const i = document.getElementById('bkPlace'); if (i) i.focus(); return; }
      if (!BK.terms) { HH.toast('Tenés que aceptar las condiciones de la salida', { type: 'warn' }); return; }
      const r = HH.createBooking({ workerId: BK.p.userId, clientId: me.id, activity: BK.activity, place: BK.place, date: BK.date, start: BK.start, hours: BK.hours, note: BK.note });
      if (r.error) { HH.toast(r.error, { type: 'danger' }); keepScroll(renderBooking); return; }
      const b = r.booking; const p = BK.p;
      HH.modal({ title: 'Reserva solicitada', body: `<div class="stack" style="gap:12px">
          <div class="notice ok">${HH.icon('calendar')}<span>Reservaste <strong>${esc(HH.activity(b.activity).label)}</strong> con ${esc(p.displayName)} el ${esc(HH.fmtBooking(b))}.</span></div>
          <p class="small">Para confirmarla, pagá la seña de <strong>${HH.money(b.depositUsd)}</strong> con su link de pago. Cuando ${esc(p.displayName)} la reciba, marca la reserva como confirmada y la ves en <strong>Mi cuenta → Reservas</strong>.</p>
          <a class="btn" href="${esc(b.payLink)}" target="_blank" rel="noopener noreferrer">${HH.icon('external')} Pagar seña</a>
          <p class="tiny muted">El pago se hace fuera de SexyRose. Ante cualquier problema, reportalo desde la reserva.</p>
        </div>`, actions: [{ label: 'Ver mis reservas', cls: 'secondary', onClick: () => { HH.closeModal(); HH.go('#cuenta.reservas'); } }, { label: 'Listo', action: 'closeModal' }] });
    },
  });
})();
