/* SexyRose · Suscripciones de las acompañantes (módulo 4: Pagos). En el MVP todo es una SIMULACIÓN.
   Reglas acordadas con Juan (28/10/2026, ver claude/sexyrose-pagos-suscripciones.md en el proyecto):
   - Argentina cobra con suscripciones de Mercado Pago, en pesos. Cada plan tiene su precio en USD y se pasa a pesos
     con el dólar MEP. Los demás países siguen con el procesador por definir (USD) hasta que se habiliten en Admin.
   - El bot revisa el MEP todos los días: si se movió más del X % (Admin) desde el último ajuste, actualiza el monto
     de las suscripciones (PUT /preapproval/{id} → auto_recurring.transaction_amount) y avisa por WhatsApp.
   - Cobro rechazado (después de los reintentos de Mercado Pago): pausa inmediata, el perfil se oculta y se avisa
     por WhatsApp con el link para actualizar la tarjeta. Al pagar, se reactiva.
   - Subir de plan: se paga solo la diferencia por los días que faltan, como Netflix o Stripe:
     (precio nuevo − precio actual en USD) × días que faltan ÷ 30, en pesos con el MEP del día. Es un pago único
     aparte; el plan nuevo se activa recién cuando llega el pago. Para Star el lugar se reserva 10 minutos.
   - Bajar de plan: sigue con el plan actual hasta el fin del período pago; el próximo cobro ya es del plan menor y,
     cuando llega, pasa al plan menor. Lo que no entra en la galería del plan nuevo: ella elige qué queda visible;
     el resto se oculta, queda guardado 7 días y después se borra. Si vuelve a subir antes, reaparece.
   - Concepto del cobro: el real ("SexyRose – Plan Oro (publicidad)").
   En producción: el bot corre en n8n y escucha los webhooks de Mercado Pago (subscription_preapproval,
   subscription_authorized_payment y payment), validando el header x-signature. La cotización sale de una fuente de
   dólar MEP (por definir). */
(function () {
  'use strict';
  const esc = HH.esc; const icon = HH.icon;
  const DAY = 864e5; const MIN = 6e4;
  const r2 = (n) => Math.round(Number(n) * 100) / 100;

  /* ---------- Ajustes ---------- */
  HH.BILLING_DEFAULTS = {
    countries: ['Argentina'], // países con suscripción de Mercado Pago habilitada
    mep: 1500, // ARS por USD (cotización de demostración, no es real)
    mepAt: null, // última lectura del bot
    mepApplied: 1500, // cotización con la que están calculados los montos vigentes
    thresholdPct: 5, // el bot ajusta los montos cuando el MEP se mueve más que esto
    periodDays: 30,
    starHoldMin: 10, // reserva del lugar Star mientras paga la diferencia
    linkMin: 30, // vencimiento del link de pago de la diferencia (planes que no son Star)
    holdDays: 7, // días que queda guardado el contenido que no entra en el plan nuevo
  };
  HH.billCfg = () => Object.assign({}, HH.BILLING_DEFAULTS, (HH.settings().billing) || {});
  HH.saveBillCfg = (patch) => { HH.settings().billing = Object.assign({}, HH.settings().billing || {}, patch); HH.save(); return HH.billCfg(); };

  /* ---------- Utilidades ---------- */
  HH.ars = (n) => 'ARS ' + Math.round(Number(n) || 0).toLocaleString(HH.loc(), { maximumFractionDigits: 0 });
  HH.toArs = (usd, mep) => Math.ceil(r2(usd) * (mep || HH.billCfg().mep));
  HH.planUsd = (lv) => (HH.LEVELS[lv] || {}).price_usd || 0;
  // Lista de precios en pesos: con la cotización del último ajuste (cambia solo cuando el MEP se mueve más que el umbral)
  HH.planArs = (lv) => HH.toArs(HH.planUsd(lv), HH.billCfg().mepApplied);
  HH.billConcept = (lv) => 'SexyRose – Plan ' + HH.planName(lv) + ' (publicidad)';
  const iso = (ms) => new Date(ms).toISOString();
  const t = (x) => new Date(x).getTime();
  const fmtTime = (x) => new Date(x).toLocaleTimeString(HH.loc(), { hour: '2-digit', minute: '2-digit', hour12: false });
  HH.billCountryOn = (country) => HH.billCfg().countries.includes(country);
  // País donde vive (no el de un viaje): define con qué se cobra
  HH.billCountry = (workerId) => { const p = HH.profileOf(workerId); return p ? (p.homeCountry || p.country || '') : ''; };
  HH.billIsMp = (workerId) => HH.billCountryOn(HH.billCountry(workerId));
  // Monto en la moneda de la acompañante: pesos con Mercado Pago, USD en el resto
  HH.billFmt = (b) => b && b.provider === 'mp' ? HH.ars(b.amountArs) : HH.money(b ? b.amountUsd : 0);

  /* ---------- Datos ---------- */
  function ensure() {
    const db = HH.db; if (!db) return;
    if (!db.billing) db.billing = { events: [], holds: [] };
    if (!db.billing.events) db.billing.events = [];
    if (!db.billing.holds) db.billing.holds = [];
    const cfg = HH.billCfg();
    // Suscripciones que existían antes de este módulo: se completan con los datos de cobro
    (db.subscriptions || []).forEach(s => {
      if (s.bill) return;
      const mp = HH.billCountryOn(HH.billCountry(s.userId)); const usd = HH.planUsd(s.level);
      s.bill = { provider: mp ? 'mp' : 'otro', amountUsd: usd, amountArs: mp ? HH.toArs(usd, cfg.mepApplied) : null, periodStart: s.startedAt, mpId: mp ? 'preapproval_' + s.id : null, pending: null };
    });
  }
  HH.billEnsure = ensure;
  // Suscripción vigente o pausada de la acompañante (la más reciente que no esté cancelada)
  HH.billSub = (workerId) => { ensure(); return (HH.db.subscriptions || []).filter(s => s.userId === workerId && (s.status === 'active' || s.status === 'paused')).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0] || null; };
  HH.billState = (workerId) => { const s = HH.billSub(workerId); if (!s) return 'none'; if (s.status === 'paused') return 'paused'; return t(s.expiresAt) > Date.now() ? 'active' : 'expired'; };
  HH.billEvents = (workerId) => HH.db.billing.events.filter(e => !workerId || e.workerId === workerId).sort((a, b) => (a.at < b.at ? 1 : -1));
  function event(workerId, kind, text) { ensure(); const e = { id: HH.uid('be'), workerId, kind, text, at: HH.now() }; HH.db.billing.events.push(e); if (HH.db.billing.events.length > 400) HH.db.billing.events.splice(0, HH.db.billing.events.length - 400); return e; }
  function notify(workerId, text) { try { if (HH.waSend) HH.waSend(workerId, text, { ref: { type: 'billing' } }); } catch (e) { /* el bot de WhatsApp puede estar apagado */ } }
  function record(workerId, { amountUsd, amountArs, description, status, ref }) {
    const p = { id: HH.uid('pay'), userId: workerId, amountUsd: r2(amountUsd), currency: amountArs != null ? 'ARS' : 'USD', amountArs: amountArs != null ? amountArs : null, provider: amountArs != null ? 'mercadopago' : 'otro', type: 'subscription', status: status || 'approved', description, workerId: null, ref: ref || null, createdAt: HH.now() };
    HH.db.payments.push(p); return p;
  }
  const nameOf = (workerId) => { const p = HH.profileOf(workerId); return (p && p.displayName) || 'Acompañante'; };

  /* ---------- Stars: reserva de 10 minutos mientras paga la diferencia ---------- */
  HH.starHolds = (region) => { ensure(); const now = Date.now(); return HH.db.billing.holds.filter(h => t(h.until) > now && (!region || h.region === region)); };
  // Lugares libres: se descuentan los reservados por otras acompañantes
  HH.starSlotsFree = (region, exceptWorker) => Math.max(0, HH.STARS.slots_per_region - HH.activeStarsIn(region).length - HH.starHolds(region).filter(h => h.workerId !== exceptWorker).length);
  function holdOf(workerId) { return HH.starHolds().find(h => h.workerId === workerId) || null; }
  function releaseHold(workerId) { ensure(); HH.db.billing.holds = HH.db.billing.holds.filter(h => h.workerId !== workerId); }
  function setStar(workerId, untilIso) {
    const cur = HH.activeStars().find(s => s.workerId === workerId);
    if (cur) { cur.activeUntil = untilIso; return true; }
    if (HH.starSlotsFree(HH.starRegionOf(workerId), workerId) <= 0) return false;
    HH.db.stars.push({ id: HH.uid('st'), workerId, activeUntil: untilIso, createdAt: HH.now() }); return true;
  }
  function endStar(workerId) { HH.db.stars.forEach(x => { if (x.workerId === workerId && t(x.activeUntil) > Date.now()) x.activeUntil = HH.now(); }); }

  /* ---------- Galería: lo que no entra en el plan nuevo ---------- */
  HH.planExcess = (p, lv) => { const L = HH.LEVELS[lv]; const ph = (p.photos || []).filter(Boolean).length; const vi = HH.profileVideos(p).length; return { photos: Math.max(0, ph - L.photos), videos: Math.max(0, vi - L.videos) }; };
  HH.planHeld = (p) => ((p && p.planHold && p.planHold.items) || []);
  HH.planHeldDeleteAt = (p) => { const it = HH.planHeld(p); return it.length ? it.map(x => x.deleteAt).sort()[0] : null; };
  // Aplica los límites del plan: queda visible lo elegido (o, si no eligió, lo primero de la galería); el resto se guarda 7 días
  function applyLimits(p, lv, keep) {
    const L = HH.LEVELS[lv]; const photos = (p.photos || []).filter(Boolean); const vids = HH.profileVideos(p).slice();
    const pick = (len, max, chosen) => { const out = (chosen || []).filter(i => Number.isInteger(i) && i >= 0 && i < len); const set = [...new Set(out)].slice(0, max); for (let i = 0; i < len && set.length < Math.min(max, len); i++) if (!set.includes(i)) set.push(i); return set.sort((a, b) => a - b); };
    const kp = pick(photos.length, L.photos, keep && keep.photos);
    const kvIdx = pick(vids.length, L.videos, keep && keep.videos ? keep.videos.map(id => vids.findIndex(v => v.id === id)) : null);
    const deleteAt = HH.daysFromNow(HH.billCfg().holdDays);
    const held = [];
    photos.forEach((src, i) => { if (!kp.includes(i)) held.push({ kind: 'photo', src, deleteAt }); });
    vids.forEach((v, i) => { if (!kvIdx.includes(i)) held.push({ kind: 'video', video: v, deleteAt }); });
    p.photos = kp.map(i => photos[i]); p.videos = kvIdx.map(i => vids[i]);
    if (held.length) p.planHold = { items: HH.planHeld(p).concat(held), fromLevel: p.planHold ? p.planHold.fromLevel : null };
    return held;
  }
  // Al subir de plan dentro de la semana: vuelve todo lo que entre en el plan nuevo
  function restoreHeld(p, lv) {
    const L = HH.LEVELS[lv]; const items = HH.planHeld(p); if (!items.length) return 0;
    let back = 0; const keep = [];
    items.forEach(x => {
      if (x.kind === 'photo' && (p.photos || []).filter(Boolean).length < L.photos) { p.photos = (p.photos || []).filter(Boolean).concat([x.src]); back++; }
      else if (x.kind === 'video' && HH.profileVideos(p).length < L.videos) { p.videos = HH.profileVideos(p).concat([x.video]); back++; }
      else keep.push(x);
    });
    p.planHold = keep.length ? Object.assign({}, p.planHold, { items: keep }) : null;
    return back;
  }

  /* ---------- Cotización ---------- */
  HH.billMoveSince = () => { const c = HH.billCfg(); return c.mepApplied ? r2((c.mep - c.mepApplied) / c.mepApplied * 100) : 0; };
  // Lectura diaria del bot (en el MVP la carga el admin). Si se movió más que el umbral, ajusta todas las suscripciones de Mercado Pago.
  HH.billSetMep = function (value, opts) {
    ensure(); const v = Number(value); if (!(v > 0)) return { error: 'Cotización inválida' };
    HH.saveBillCfg({ mep: v, mepAt: HH.now() });
    const c = HH.billCfg(); const move = HH.billMoveSince();
    if (Math.abs(move) <= c.thresholdPct && !(opts && opts.force)) { event(null, 'mep', `Dólar MEP ${HH.ars(v)}: ${move >= 0 ? '+' : ''}${move}% desde el último ajuste (umbral ${c.thresholdPct}%). Sin cambios.`); HH.save(); return { applied: false, move }; }
    let n = 0;
    (HH.db.subscriptions || []).filter(s => (s.status === 'active' || s.status === 'paused') && s.bill && s.bill.provider === 'mp').forEach(s => {
      const before = s.bill.amountArs; s.bill.amountArs = HH.toArs(s.bill.amountUsd, v); n++;
      if (before !== s.bill.amountArs) notify(s.userId, `SexyRose: por la cotización del dólar MEP, desde tu próximo cobro (${HH.fmtDate(s.expiresAt)}) tu plan ${HH.planName(s.bill.pending && s.bill.pending.type === 'down' ? s.bill.pending.level : s.level)} pasa de ${HH.ars(before)} a ${HH.ars(s.bill.amountArs)} por mes. El precio en dólares no cambia (${HH.money(s.bill.amountUsd)}).`);
    });
    HH.saveBillCfg({ mepApplied: v });
    event(null, 'mep', `Dólar MEP ${HH.ars(v)}: ${move >= 0 ? '+' : ''}${move}% desde el último ajuste. Se actualizaron ${n} ${HH.plural(n, 'suscripción', 'suscripciones')} y se avisó por WhatsApp.`);
    HH.save(); return { applied: true, move, count: n };
  };

  /* ---------- Checkout (simulado) ---------- */
  // Mercado Pago (Argentina, pesos) o el procesador por definir (resto, USD). recurring = suscripción con débito automático.
  HH.billCheckout = function ({ workerId, title, concept, amountUsd, amountArs, rate, recurring, extra, onApproved, onRejected }) {
    const mp = amountArs != null;
    const amount = mp ? HH.ars(amountArs) : HH.money(amountUsd);
    const body = `<div class="stack">
      <div class="bl-mp-head">${mp ? `<span class="bl-mp-logo">${icon('wallet')}</span><div><strong>Mercado Pago</strong><div class="tiny muted">Checkout simulado</div></div>` : `<span class="bl-mp-logo">${icon('card')}</span><div><strong>Pago con tarjeta</strong><div class="tiny muted">Procesador por definir · simulado</div></div>`}</div>
      <div class="card soft pad-sm stack" style="gap:6px">
        <div class="row between nowrap" style="align-items:flex-start"><span class="muted small">Concepto</span><span class="small" style="text-align:right" data-noi18n>${esc(concept)}</span></div>
        ${extra || ''}
        <div class="row between nowrap"><strong>Total</strong><strong class="num" style="font-size:20px">${amount}</strong></div>
        ${mp ? `<div class="tiny muted" style="text-align:right">${HH.money(amountUsd)} con dólar MEP a ${HH.ars(rate || HH.billCfg().mepApplied)}</div>` : ''}
      </div>
      ${recurring ? `<div class="notice info">${icon('refresh')}<span>Débito automático cada ${HH.billCfg().periodDays} días con esta tarjeta. Podés cambiar de plan desde tu panel.</span></div>` : ''}
      <div class="grid-2" style="gap:10px">
        <div class="field" style="grid-column:1/-1"><label for="blNum">Tarjeta de crédito o débito</label><input class="input num" id="blNum" value="4509 9535 6623 3704" inputmode="numeric" autocomplete="cc-number"></div>
        <div class="field"><label for="blExp">Vence</label><input class="input" id="blExp" value="11/29" inputmode="numeric"></div>
        <div class="field"><label for="blCvv">CVV</label><input class="input" id="blCvv" value="123" inputmode="numeric"></div>
      </div>
      <label class="row small" style="gap:8px;flex-wrap:nowrap"><input type="checkbox" id="blFail"> <span>Demo: simular tarjeta rechazada</span></label>
      <div class="notice">${icon('shield')}<span><span>${mp ? 'En producción se abre el checkout de Mercado Pago: SexyRose no ve los datos de tu tarjeta.' : 'En producción se abre el checkout del procesador: SexyRose no ve los datos de tu tarjeta.'}</span> <span>Ahora no se cobra nada.</span></span></div>
    </div>`;
    HH.modal({ title, body, actions: [
      { label: 'Cancelar', cls: 'ghost', action: 'closeModal' },
      { label: 'Pagar ' + amount, id: 'blPayBtn', onClick: () => {
        const fail = !!(document.getElementById('blFail') || {}).checked;
        const btn = document.getElementById('blPayBtn'); if (btn) { btn.disabled = true; btn.textContent = 'Procesando…'; }
        setTimeout(() => {
          HH.closeModal();
          if (fail) { HH.toast((mp ? 'Mercado Pago' : 'El procesador') + ' rechazó el pago. No se cobró nada.', { type: 'danger' }); if (onRejected) onRejected(); return; }
          HH.toast('Pago aprobado · ' + amount, { type: 'ok' }); if (onApproved) onApproved();
        }, 500);
      } },
    ] });
  };

  /* ---------- Alta ---------- */
  HH.billStart = function (workerId, lv, onDone) {
    ensure(); const L = HH.LEVELS[lv]; if (!L) return;
    const st = HH.billState(workerId);
    if (st === 'active' || st === 'paused') return;
    if (lv === 'S' && !HH.isStar(workerId) && HH.starSlotsFree(HH.starRegionOf(workerId), workerId) <= 0) { HH.toast('No quedan lugares Star en ' + (HH.starRegionOf(workerId) || 'tu provincia') + '. Te avisamos cuando se libere uno.', { type: 'warn' }); return; }
    const mp = HH.billIsMp(workerId); const usd = L.price_usd; const arsAmt = mp ? HH.planArs(lv) : null;
    HH.billCheckout({ workerId, title: 'Plan ' + L.label, concept: HH.billConcept(lv), amountUsd: usd, amountArs: arsAmt, recurring: true,
      onApproved: () => {
        HH.db.subscriptions.forEach(s => { if (s.userId === workerId && s.status !== 'cancelled') s.status = 'cancelled'; });
        const sub = { id: HH.uid('sub'), userId: workerId, level: lv, status: 'active', startedAt: HH.now(), expiresAt: HH.daysFromNow(HH.billCfg().periodDays), providerRef: mp ? 'mercadopago' : 'demo',
          bill: { provider: mp ? 'mp' : 'otro', amountUsd: usd, amountArs: arsAmt, periodStart: HH.now(), mpId: mp ? HH.uid('preapproval') : null, pending: null } };
        HH.db.subscriptions.push(sub);
        record(workerId, { amountUsd: usd, amountArs: arsAmt, description: HH.billConcept(lv) + ' · primer mes', ref: lv });
        if (lv === 'S') setStar(workerId, sub.expiresAt); else endStar(workerId);
        restoreHeld(HH.profileOf(workerId) || {}, lv);
        const p = HH.profileOf(workerId); if (p && p.status === 'pending') p.status = 'active';
        event(workerId, 'alta', `${nameOf(workerId)} activó el plan ${L.label} (${HH.billFmt(sub.bill)} por mes${mp ? ', Mercado Pago' : ''}).`);
        HH.save(); if (onDone) onDone();
      } });
  };

  /* ---------- Subir de plan: diferencia por los días que faltan ---------- */
  HH.billQuote = function (workerId, lv) {
    const s = HH.billSub(workerId); if (!s) return null;
    const periodMs = HH.billCfg().periodDays * DAY;
    const daysLeft = HH.clamp(Math.ceil((t(s.expiresAt) - Date.now()) / DAY), 0, HH.billCfg().periodDays);
    const curUsd = HH.planUsd(s.level), newUsd = HH.planUsd(lv);
    const diffUsd = Math.max(0, r2((newUsd - curUsd) * daysLeft * DAY / periodMs));
    const mp = s.bill.provider === 'mp';
    return { sub: s, from: s.level, to: lv, daysLeft, curUsd, newUsd, diffUsd, diffArs: mp ? HH.toArs(diffUsd) : null, mp, nextArs: mp ? HH.planArs(lv) : null };
  };
  HH.billUpgrade = function (workerId, lv, onDone) {
    ensure(); const s = HH.billSub(workerId);
    if (!s || HH.billState(workerId) !== 'active') return;
    if (HH.LEVELS[lv].rank <= HH.LEVELS[s.level].rank) return;
    const region = HH.starRegionOf(workerId);
    if (lv === 'S' && !HH.isStar(workerId)) {
      const mine = holdOf(workerId);
      if (!mine && HH.starSlotsFree(region, workerId) <= 0) { HH.toast('No quedan lugares Star en ' + (region || 'tu provincia') + '. Te avisamos cuando se libere uno.', { type: 'warn' }); return; }
    }
    const q = HH.billQuote(workerId, lv);
    // Una baja programada se cancela: el cambio nuevo manda
    if (s.bill.pending && s.bill.pending.type === 'down') cancelPending(s, 'subida');
    const c = HH.billCfg();
    let until;
    if (lv === 'S' && !HH.isStar(workerId)) { releaseHold(workerId); until = iso(Date.now() + c.starHoldMin * MIN); HH.db.billing.holds.push({ id: HH.uid('hold'), workerId, region, until }); }
    else { releaseHold(workerId); until = iso(Date.now() + c.linkMin * MIN); }
    s.bill.pending = { type: 'up', level: lv, diffUsd: q.diffUsd, diffArs: q.diffArs, rate: q.mp ? c.mep : null, daysLeft: q.daysLeft, until, createdAt: HH.now() };
    if (lv === 'S' && !HH.isStar(workerId)) event(workerId, 'reserva_star', `${nameOf(workerId)} reservó un lugar Star en ${region} hasta las ${fmtTime(until)} para pagar la diferencia.`);
    HH.save();
    HH.billPayUpgrade(workerId, onDone);
  };
  HH.billPayUpgrade = function (workerId, onDone) {
    const s = HH.billSub(workerId); const pd = s && s.bill.pending; if (!pd || pd.type !== 'up') return;
    if (t(pd.until) <= Date.now()) { expireUpgrade(s); HH.save(); HH.toast('El link de pago venció. Volvé a elegir el plan.', { type: 'warn' }); HH.refresh(); return; }
    const extra = `<div class="row between nowrap small"><span class="muted">Cambio</span><span data-noi18n>${HH.planName(s.level)} → ${HH.planName(pd.level)}</span></div>
      <div class="row between nowrap small"><span class="muted">Cálculo por días</span><span class="num" style="text-align:right" data-noi18n>(${HH.money(HH.planUsd(pd.level))} − ${HH.money(HH.planUsd(s.level))}) × ${pd.daysLeft}/${HH.billCfg().periodDays} = ${HH.money(pd.diffUsd)}</span></div>
      ${pd.level === 'S' && holdOf(workerId) ? `<div class="row between nowrap small"><span class="muted">Lugar Star</span><span>Reservado hasta las ${fmtTime(holdOf(workerId).until)}</span></div>` : ''}`;
    HH.billCheckout({ workerId, title: 'Pagar la diferencia', concept: HH.billConcept(pd.level) + ' · diferencia por ' + pd.daysLeft + ' ' + HH.plural(pd.daysLeft, 'día', 'días'), amountUsd: pd.diffUsd, amountArs: pd.diffArs, rate: pd.rate, extra,
      onApproved: () => { HH.billUpgradePaid(workerId); if (onDone) onDone(); },
      onRejected: () => { if (onDone) onDone(); } });
  };
  // Webhook "payment approved" del pago de la diferencia
  HH.billUpgradePaid = function (workerId) {
    const s = HH.billSub(workerId); const pd = s && s.bill.pending; if (!pd || pd.type !== 'up') return false;
    if (pd.level === 'S' && !HH.isStar(workerId) && !holdOf(workerId) && HH.starSlotsFree(HH.starRegionOf(workerId), workerId) <= 0) { expireUpgrade(s); HH.save(); HH.toast('Se venció la reserva y ya no quedan lugares Star. No se cobró nada.', { type: 'warn' }); return false; }
    const from = s.level; const p = HH.profileOf(workerId);
    record(workerId, { amountUsd: pd.diffUsd, amountArs: pd.diffArs, description: `Diferencia ${HH.planName(from)} → ${HH.planName(pd.level)} · ${pd.daysLeft} ${HH.plural(pd.daysLeft, 'día', 'días')}`, ref: pd.level });
    s.level = pd.level; s.bill.amountUsd = HH.planUsd(pd.level); if (s.bill.provider === 'mp') s.bill.amountArs = HH.planArs(pd.level); s.bill.pending = null;
    if (pd.level === 'S') setStar(workerId, s.expiresAt);
    releaseHold(workerId);
    const back = p ? restoreHeld(p, pd.level) : 0;
    event(workerId, 'subida', `${nameOf(workerId)} pagó ${s.bill.provider === 'mp' ? HH.ars(pd.diffArs) : HH.money(pd.diffUsd)} y pasó de ${HH.planName(from)} a ${HH.planName(pd.level)}. Próximo cobro ${HH.billFmt(s.bill)} el ${HH.fmtDate(s.expiresAt)}.${back ? ` Volvieron ${back} ${HH.plural(back, 'archivo', 'archivos')} guardados.` : ''}`);
    notify(workerId, `SexyRose: recibimos tu pago. Ya tenés el plan ${HH.planName(pd.level)}. Tu próximo cobro es el ${HH.fmtDate(s.expiresAt)} por ${HH.billFmt(s.bill)}.`);
    HH.save(); return true;
  };
  function expireUpgrade(s) {
    const pd = s.bill.pending; if (!pd || pd.type !== 'up') return;
    s.bill.pending = null; releaseHold(s.userId);
    event(s.userId, 'subida_vencida', `Venció sin pago el link de la diferencia de ${nameOf(s.userId)} para pasar a ${HH.planName(pd.level)}. Sigue con ${HH.planName(s.level)}.${pd.level === 'S' ? ' Se liberó el lugar Star.' : ''}`);
  }

  /* ---------- Bajar de plan: al próximo cobro ---------- */
  HH.billDowngrade = function (workerId, lv, keep) {
    ensure(); const s = HH.billSub(workerId);
    if (!s || HH.billState(workerId) !== 'active') return;
    if (HH.LEVELS[lv].rank >= HH.LEVELS[s.level].rank) return;
    if (s.bill.pending && s.bill.pending.type === 'up') expireUpgrade(s);
    s.bill.pending = { type: 'down', level: lv, requestedAt: HH.now(), keep: keep || null };
    s.bill.amountUsd = HH.planUsd(lv); if (s.bill.provider === 'mp') s.bill.amountArs = HH.planArs(lv);
    event(workerId, 'baja_programada', `${nameOf(workerId)} pasa de ${HH.planName(s.level)} a ${HH.planName(lv)} el ${HH.fmtDate(s.expiresAt)}, con el cobro de ${HH.billFmt(s.bill)}.`);
    notify(workerId, `SexyRose: listo, tu plan pasa a ${HH.planName(lv)} el ${HH.fmtDate(s.expiresAt)}, cuando se cobre ${HH.billFmt(s.bill)}. Hasta entonces seguís con ${HH.planName(s.level)}.`);
    HH.save();
  };
  function cancelPending(s, why) {
    const pd = s.bill.pending; if (!pd) return;
    if (pd.type === 'up') { expireUpgrade(s); return; }
    s.bill.pending = null; s.bill.amountUsd = HH.planUsd(s.level); if (s.bill.provider === 'mp') s.bill.amountArs = HH.planArs(s.level);
    event(s.userId, 'baja_cancelada', `${nameOf(s.userId)} canceló el cambio a ${HH.planName(pd.level)}${why ? ' (' + why + ')' : ''}. Sigue con ${HH.planName(s.level)} por ${HH.billFmt(s.bill)}.`);
  }
  HH.billCancelChange = function (workerId) { const s = HH.billSub(workerId); if (!s || !s.bill.pending) return; cancelPending(s); HH.save(); };
  HH.billSetKeep = function (workerId, keep) { const s = HH.billSub(workerId); if (!s || !s.bill.pending || s.bill.pending.type !== 'down') return; s.bill.pending.keep = keep; HH.save(); };

  /* ---------- Cobro mensual (webhook subscription_authorized_payment) ---------- */
  // fail = el cobro quedó rechazado después de los reintentos de Mercado Pago
  HH.billCharge = function (s, opts) {
    ensure(); opts = opts || {}; if (!s || s.status !== 'active') return null;
    const fail = opts.fail != null ? opts.fail : !!s.bill.failNext;
    s.bill.failNext = false;
    const pd = s.bill.pending && s.bill.pending.type === 'down' ? s.bill.pending : null;
    const lvCharged = pd ? pd.level : s.level;
    if (s.bill.pending && s.bill.pending.type === 'up') expireUpgrade(s);
    if (fail) {
      record(s.userId, { amountUsd: s.bill.amountUsd, amountArs: s.bill.provider === 'mp' ? s.bill.amountArs : null, description: HH.billConcept(lvCharged) + ' · cobro rechazado', status: 'rejected', ref: lvCharged });
      s.status = 'paused'; s.bill.pausedAt = HH.now(); s.bill.pauseReason = 'Cobro rechazado';
      endStar(s.userId);
      event(s.userId, 'pausa', `Cobro rechazado de ${nameOf(s.userId)} (${HH.billFmt(s.bill)}, ${s.bill.provider === 'mp' ? 'Mercado Pago ya reintentó' : 'reintentos agotados'}). Plan pausado y perfil oculto.`);
      notify(s.userId, `SexyRose: no pudimos cobrar tu plan ${HH.planName(lvCharged)} (${HH.billFmt(s.bill)}). Tu perfil quedó oculto hasta que se regularice. Actualizá la tarjeta y pagá desde tu panel → Suscripción.`);
      HH.save(); return { ok: false };
    }
    renew(s, pd, 'cobro_ok');
    HH.save(); return { ok: true };
  };
  function renew(s, pd, kind) {
    const lvCharged = pd ? pd.level : s.level;
    record(s.userId, { amountUsd: s.bill.amountUsd, amountArs: s.bill.provider === 'mp' ? s.bill.amountArs : null, description: HH.billConcept(lvCharged) + (kind === 'reactivacion' ? ' · pago regularizado' : ' · renovación'), ref: lvCharged });
    // Renovación: el período nuevo arranca donde terminó el anterior. Reactivación: desde hoy.
    s.bill.periodStart = kind === 'reactivacion' ? HH.now() : s.expiresAt;
    s.startedAt = s.bill.periodStart; s.expiresAt = iso(t(s.bill.periodStart) + HH.billCfg().periodDays * DAY);
    s.status = 'active'; s.bill.pausedAt = null; s.bill.pauseReason = null;
    let held = [];
    const fromLv = s.level;
    if (pd) {
      s.level = pd.level; s.bill.pending = null;
      const p = HH.profileOf(s.userId); if (p) { held = applyLimits(p, pd.level, pd.keep); if (held.length && p.planHold) p.planHold.fromLevel = fromLv; }
    }
    if (s.level === 'S') { if (!setStar(s.userId, s.expiresAt)) event(s.userId, 'star_sin_lugar', `${nameOf(s.userId)} tiene plan Star pero no hay lugar libre en ${HH.starRegionOf(s.userId)}: se muestra como Diamante hasta que se libere uno.`); }
    else endStar(s.userId);
    const amount = HH.billFmt(s.bill);
    if (kind === 'reactivacion') {
      event(s.userId, 'reactivacion', `${nameOf(s.userId)} regularizó el pago (${amount}). Plan ${HH.planName(s.level)} activo y perfil visible otra vez.`);
      notify(s.userId, `SexyRose: recibimos tu pago. Tu plan ${HH.planName(s.level)} está activo de nuevo y tu perfil ya se ve. Próximo cobro: ${HH.fmtDate(s.expiresAt)}.`);
    } else event(s.userId, 'cobro_ok', `Cobro aprobado de ${nameOf(s.userId)}: ${amount}, plan ${HH.planName(s.level)}. Próximo: ${HH.fmtDate(s.expiresAt)}.`);
    if (pd) {
      const n = held.length;
      event(s.userId, 'baja_aplicada', `${nameOf(s.userId)} pasó de ${HH.planName(fromLv)} a ${HH.planName(s.level)}.${n ? ` Se ocultaron ${n} ${HH.plural(n, 'archivo', 'archivos')} de la galería; se borran el ${HH.fmtDate(held[0].deleteAt)}.` : ''}`);
      notify(s.userId, `SexyRose: ya tenés el plan ${HH.planName(s.level)}.${n ? ` Ocultamos ${n} ${HH.plural(n, 'archivo', 'archivos')} de tu galería que no entran en este plan: quedan guardados hasta el ${HH.fmtDate(held[0].deleteAt)} y después se borran. Si volvés a subir de plan antes, reaparecen.` : ''}`);
    }
  }
  // Pago de la deuda (tarjeta actualizada): reactiva desde hoy
  HH.billRetry = function (workerId, onDone) {
    const s = HH.billSub(workerId); if (!s || s.status !== 'paused') return;
    const pd = s.bill.pending && s.bill.pending.type === 'down' ? s.bill.pending : null;
    const lv = pd ? pd.level : s.level;
    if (s.bill.provider === 'mp') s.bill.amountArs = HH.planArs(lv);
    HH.billCheckout({ workerId, title: 'Actualizar tarjeta y pagar', concept: HH.billConcept(lv), amountUsd: s.bill.amountUsd, amountArs: s.bill.provider === 'mp' ? s.bill.amountArs : null, recurring: true,
      onApproved: () => { renew(s, pd, 'reactivacion'); HH.save(); if (onDone) onDone(); },
      onRejected: () => { if (onDone) onDone(); } });
  };

  /* ---------- Bot: revisión automática ---------- */
  HH.billingTick = function () {
    if (!HH.db || HH.SSR) return; ensure();
    const now = Date.now(); let changed = false;
    (HH.db.subscriptions || []).forEach(s => {
      if (!s.bill) return;
      const pd = s.bill.pending;
      if (pd && pd.type === 'up' && t(pd.until) <= now) { expireUpgrade(s); changed = true; }
      let guard = 0;
      while (s.status === 'active' && t(s.expiresAt) <= now && guard++ < 13) { HH.billCharge(s); changed = true; }
    });
    const before = HH.db.billing.holds.length; HH.db.billing.holds = HH.db.billing.holds.filter(h => t(h.until) > now); if (HH.db.billing.holds.length !== before) changed = true;
    (HH.db.profiles || []).forEach(p => {
      const items = HH.planHeld(p); if (!items.length) return;
      const gone = items.filter(x => t(x.deleteAt) <= now); if (!gone.length) return;
      const keep = items.filter(x => t(x.deleteAt) > now); p.planHold = keep.length ? Object.assign({}, p.planHold, { items: keep }) : null;
      event(p.userId, 'borrado', `Se borraron ${gone.length} ${HH.plural(gone.length, 'archivo guardado', 'archivos guardados')} de ${p.displayName} (pasaron ${HH.billCfg().holdDays} días desde el cambio de plan).`);
      notify(p.userId, `SexyRose: pasaron ${HH.billCfg().holdDays} días desde tu cambio de plan y se borraron ${gone.length} ${HH.plural(gone.length, 'archivo', 'archivos')} que no entraban en tu galería.`);
      changed = true;
    });
    if (changed) HH.save();
    return changed;
  };
  // El bot corre antes de cada render (en producción: webhooks + tarea diaria en n8n)
  const origRender = HH.render;
  HH.render = function () { try { HH.billingTick(); } catch (e) { console.error(e); } return origRender.apply(this, arguments); };

  // Acciones del bot que en el MVP se disparan a mano desde Admin → Suscripciones
  HH.billSimCharge = function (workerId, fail) { const s = HH.billSub(workerId); if (!s || s.status !== 'active') return null; s.expiresAt = HH.now(); return HH.billCharge(s, { fail: !!fail }); };
  HH.billSimWeek = function (workerId) { const p = HH.profileOf(workerId); if (!p || !HH.planHeld(p).length) return; p.planHold.items.forEach(x => { x.deleteAt = HH.now(); }); HH.billingTick(); };
  HH.billSimExpireLink = function (workerId) { const s = HH.billSub(workerId); if (!s || !s.bill.pending || s.bill.pending.type !== 'up') return; s.bill.pending.until = HH.now(); HH.db.billing.holds.forEach(h => { if (h.workerId === workerId) h.until = HH.now(); }); HH.billingTick(); };

  /* ============================================================
     Panel de la acompañante · Suscripción
     ============================================================ */
  const sameDay = (a) => HH.fmtDate(a, { day: 'numeric', month: 'long' });
  function priceLine(workerId, lv, mp) {
    return mp ? `<div class="price num">${HH.ars(HH.planArs(lv))}<small> / mes</small></div><div class="tiny muted num">${HH.money(HH.planUsd(lv))} con dólar MEP</div>`
      : `<div class="price num">${HH.money(HH.planUsd(lv))}<small> / mes</small></div>`;
  }
  function heldNotice(p) {
    const items = HH.planHeld(p); if (!items.length) return '';
    const thumbs = items.slice(0, 8).map((x, i) => `<div class="bl-held">${x.kind === 'photo' ? HH.photo({ photos: [x.src], hue: (p.hue || 330) + i * 25, displayName: p.displayName }, 0, { cls: 'square' }) : `<div class="media square">${HH.videoMedia(x.video)}</div>`}</div>`).join('');
    return `<div class="card stack bl-hold" style="gap:10px">
      <div class="row nowrap" style="align-items:flex-start;gap:10px">${icon('clock')}<div class="grow"><strong>Guardamos ${items.length} ${HH.plural(items.length, 'archivo', 'archivos')} que no entran en tu plan</strong><p class="small muted"><span>Están ocultos de tu perfil hasta el ${sameDay(HH.planHeldDeleteAt(p))}.</span> <span>Ese día se borran.</span> <span>Si subís de plan antes, reaparecen.</span></p></div></div>
      <div class="bl-held-row">${thumbs}${items.length > 8 ? `<span class="tiny muted">+${items.length - 8}</span>` : ''}</div>
    </div>`;
  }
  function statusCard(ctx, w, s) {
    const st = HH.billState(w); const b = s.bill; const pd = b.pending; const mp = b.provider === 'mp';
    const lvNow = s.level; const L = HH.LEVELS[lvNow];
    const total = t(s.expiresAt) - t(s.startedAt); const pct = total > 0 ? HH.clamp(Math.round((Date.now() - t(s.startedAt)) / total * 100), 0, 100) : 0;
    const dl = HH.daysLeft(s.expiresAt);
    let alert = '';
    if (st === 'paused') alert = `<div class="notice danger">${icon('alert')}<span class="grow"><strong>Tu perfil está oculto.</strong> <span>${b.pausedAt ? 'No pudimos cobrar tu plan el ' + sameDay(b.pausedAt) + '.' : 'No pudimos cobrar tu plan.'}</span> <span>Actualizá la tarjeta y pagá ${HH.billFmt(b)} para volver a aparecer.</span></span></div>
        <div><button class="btn" data-action="blRetry">${icon('card')} Actualizar tarjeta y pagar ${HH.billFmt(b)}</button></div>`;
    else if (pd && pd.type === 'down') {
      const ex = HH.planExcess(HH.profileOf(w) || {}, pd.level); const hasEx = ex.photos || ex.videos;
      alert = `<div class="notice warn">${icon('calendar')}<span class="grow"><span>El ${sameDay(s.expiresAt)} pasás al plan ${HH.planName(pd.level)}, con el cobro de ${HH.billFmt(b)}.</span> <span>Hasta entonces seguís con ${L.label}.</span>${hasEx ? ` <span>Ese día se oculta lo que no entra en tu galería.</span> <span>${pd.keep ? 'Ya elegiste qué queda visible.' : 'Elegí qué queda visible; si no, quedan las primeras de tu galería.'}</span>` : ''}</span></div>
        <div class="row">${hasEx ? `<button class="btn secondary sm" data-action="blKeep">${icon('image')} Elegir qué queda visible</button>` : ''}<button class="btn ghost sm" data-action="blCancelChange">${icon('x')} Seguir con ${L.label}</button></div>`;
    } else if (pd && pd.type === 'up') {
      const hold = holdOf(w);
      alert = `<div class="notice info">${icon('clock')}<span class="grow"><span>Para pasar a ${HH.planName(pd.level)} falta pagar la diferencia: ${mp ? HH.ars(pd.diffArs) : HH.money(pd.diffUsd)} por ${pd.daysLeft} ${HH.plural(pd.daysLeft, 'día', 'días')}.</span> <span>${hold ? `Tu lugar Star está reservado hasta las ${fmtTime(hold.until)}.` : `El link vence a las ${fmtTime(pd.until)}.`}</span> <span>Hasta que llegue el pago seguís con ${L.label}.</span></span></div>
        <div class="row"><button class="btn" data-action="blPayUp">${icon('card')} Pagar ${mp ? HH.ars(pd.diffArs) : HH.money(pd.diffUsd)}</button><button class="btn ghost sm" data-action="blCancelChange">Cancelar el cambio</button></div>`;
    }
    const nextLine = st === 'paused' ? `<div class="small" style="color:var(--danger)">Plan pausado</div>` : `<div class="small muted">Próximo cobro el ${sameDay(s.expiresAt)} · ${dl} ${HH.plural(dl, 'día', 'días')}</div>`;
    const lvShown = HH.levelOf(w) || lvNow;
    return `<div class="card lift stack" style="gap:12px">
      <div class="row between"><div><div class="eyebrow">Plan actual</div><h3>Plan ${HH.planName(lvShown)}</h3></div>${st === 'paused' ? '<span class="badge danger">Pausado</span>' : HH.levelBadge(lvShown, true)}</div>
      <div class="row between" style="align-items:flex-end"><div><span style="font-size:28px;font-weight:800" class="num">${mp ? HH.ars(pd && pd.type === 'down' ? HH.planArs(lvNow) : b.amountArs) : HH.money(HH.planUsd(lvNow))}</span><span class="muted small"> / mes</span>${mp ? `<div class="tiny muted num">${HH.money(HH.planUsd(lvNow))} con dólar MEP · Mercado Pago</div>` : ''}</div>${nextLine}</div>
      ${st === 'paused' ? '' : `<div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Período transcurrido"><span style="width:${pct}%"></span></div>`}
      ${mp && st !== 'paused' ? `<div class="tiny muted">${icon('refresh')} Débito automático con Mercado Pago. Si el dólar MEP se mueve, te avisamos antes del cobro.</div>` : ''}
      ${alert}
      ${lvShown !== lvNow ? `<div class="notice">${icon('info')}<span>Tenés el plan Star pero no hay lugares libres en tu provincia: te mostramos como Diamante hasta que se libere uno.</span></div>` : ''}
    </div>`;
  }
  function planCards(ctx, w, s) {
    const st = HH.billState(w); const mp = s ? s.bill.provider === 'mp' : HH.billIsMp(w);
    const cur = s ? s.level : null; const pd = s && s.bill.pending;
    const region = HH.starRegionOf(w);
    return `<div class="plans plans-6">${HH.PLAN_ORDER.map(lv => {
      const L = HH.LEVELS[lv]; const isCur = lv === cur;
      let btn;
      const starFull = lv === 'S' && !HH.isStar(w) && !holdOf(w) && HH.starSlotsFree(region, w) <= 0;
      if (isCur) btn = `<button class="btn secondary block" disabled>Tu plan actual</button>`;
      else if (starFull) btn = `<button class="btn secondary block" disabled>Sin lugares Star</button>`;
      else if (!s || st === 'expired') btn = `<button class="btn ${lv === 'S' ? '' : 'secondary'} block" data-action="blStart" data-level="${lv}">Activar ${L.label}</button>`;
      else if (st === 'paused') btn = `<button class="btn secondary block" disabled>Primero regularizá el pago</button>`;
      else if (pd && pd.level === lv) btn = `<button class="btn secondary block" disabled>${pd.type === 'down' ? 'Cambio programado' : 'Falta pagar la diferencia'}</button>`;
      else if (L.rank > HH.LEVELS[cur].rank) { const q = HH.billQuote(w, lv); btn = `<button class="btn ${lv === 'S' ? '' : 'secondary'} block" data-action="blUp" data-level="${lv}">Subir a ${L.label}</button><div class="tiny muted bl-cta-note">Hoy pagás ${mp ? HH.ars(q.diffArs) : HH.money(q.diffUsd)} por ${q.daysLeft} ${HH.plural(q.daysLeft, 'día', 'días')}</div>`; }
      else btn = `<button class="btn ghost block" data-action="blDown" data-level="${lv}">Bajar a ${L.label}</button><div class="tiny muted bl-cta-note">Desde el ${sameDay(s.expiresAt)}</div>`;
      return `<div class="plan ${isCur ? 'featured' : ''}">${isCur ? `<span class="badge ribbon level-${lv}">Tu plan</span>` : lv === 'S' ? `<span class="badge ribbon gold">${icon('crown')} Quedan ${HH.starSlotsFree(region, w)} en ${esc(region || 'tu provincia')}</span>` : ''}
        <div><div class="eyebrow">Plan</div><h3>${L.label}</h3></div>
        <div>${priceLine(w, lv, mp)}</div>
        <p class="small muted">${L.desc}</p>
        <ul>${ctx.planFeatures(lv).map(f => `<li class="${f.ok ? '' : 'no'}">${icon(f.ok ? 'check' : 'x')}<span>${f.t}</span></li>`).join('')}</ul>
        <div>${btn}</div>
      </div>`;
    }).join('')}</div>`;
  }
  function howItWorks(mp) {
    return `<div class="card soft stack bl-how" style="gap:8px"><div class="card-title">Cómo funcionan los cambios de plan</div>
      <div class="bl-how-row">${icon('trending')}<span><strong>Subir:</strong> pagás solo la diferencia por los días que faltan para tu próximo cobro. El plan nuevo se activa cuando llega el pago.</span></div>
      <div class="bl-how-row">${icon('calendar')}<span><strong>Bajar:</strong> seguís con tu plan hasta el próximo cobro, que ya es del plan menor. Si tu galería no entra, elegís qué queda visible; lo demás se guarda ${HH.billCfg().holdDays} días y después se borra.</span></div>
      <div class="bl-how-row">${icon('alert')}<span><strong>Cobro rechazado:</strong> tu perfil se oculta hasta que actualices la tarjeta y pagues.</span></div>
      ${mp ? `<div class="bl-how-row">${icon('dollar')}<span><strong>Pesos:</strong> los planes valen en dólares y se cobran en pesos con el dólar MEP. Si se mueve, te avisamos por WhatsApp antes del cobro.</span></div>` : ''}
    </div>`;
  }
  function history(w) {
    const pays = HH.paymentsOf(w);
    if (!pays.length) return `<div class="card stack" style="gap:10px"><div class="card-title">Historial de pagos</div><p class="small muted">Todavía no hiciste pagos.</p></div>`;
    return `<div class="card stack" style="gap:10px"><div class="card-title">Historial de pagos</div>
      <div class="bl-hist">${pays.slice(0, 24).map(p => `<div class="bl-hist-row"><div class="grow" style="min-width:0"><div class="small" data-noi18n>${esc(p.description)}</div><div class="tiny muted">${HH.fmtDate(p.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}${p.status === 'rejected' ? ' · <span style="color:var(--danger)">Rechazado</span>' : ''}</div></div><strong class="num" style="white-space:nowrap">${p.amountArs != null ? HH.ars(p.amountArs) : HH.money(p.amountUsd)}</strong></div>`).join('')}</div>
    </div>`;
  }
  HH.billingPanel = function (ctx) {
    ensure(); const w = ctx.w; const s = HH.billSub(w); const st = HH.billState(w); const mp = s ? s.bill.provider === 'mp' : HH.billIsMp(w);
    const p = HH.profileOf(w) || {};
    const top = s && st !== 'expired' ? statusCard(ctx, w, s) : ctx.pitch;
    const title = st === 'paused' ? 'Tu plan está pausado' : (s && st === 'active') ? 'Tu plan' : 'Elegí un plan';
    const sub = mp ? 'Pagás un plan mensual para estar publicada, con débito automático de Mercado Pago. Cuanto más alto el plan, más arriba aparecés y más herramientas tenés.' : 'Pagás un plan mensual para estar publicada. Cuanto más alto el plan, más arriba aparecés y más herramientas para ganar tenés.';
    return ctx.pageHead('Suscripción', title, sub) + top + heldNotice(p) + planCards(ctx, w, s && st !== 'expired' ? s : null) + howItWorks(mp) + history(w);
  };

  /* ---------- Elegir qué queda visible al bajar de plan ---------- */
  function keepModal(w) {
    const s = HH.billSub(w); const pd = s && s.bill.pending; if (!pd || pd.type !== 'down') return;
    const p = HH.profileOf(w); const L = HH.LEVELS[pd.level];
    const photos = (p.photos || []).filter(Boolean); const vids = HH.profileVideos(p);
    const firstN = (n, len) => Array.from({ length: Math.min(n, len) }, (_, i) => i);
    let selP = pd.keep && pd.keep.photos ? pd.keep.photos.slice() : firstN(L.photos, photos.length);
    let selV = pd.keep && pd.keep.videos ? pd.keep.videos.slice() : vids.slice(0, L.videos).map(v => v.id);
    const render = () => {
      const body = `<p class="small muted"><span>El plan ${L.label} permite ${L.photos} fotos y ${L.videos} videos.</span> <span>Marcá lo que querés que siga visible.</span> <span>El resto se oculta el ${sameDay(s.expiresAt)} y queda guardado ${HH.billCfg().holdDays} días.</span></p>
        ${photos.length > L.photos ? `<div class="row between"><strong>Fotos</strong><span class="small num ${selP.length === L.photos ? '' : 'muted'}">${selP.length} de ${L.photos}</span></div>
        <div class="bl-pick-grid">${photos.map((_, i) => `<button type="button" class="bl-pick${selP.includes(i) ? ' on' : ''}" data-kp="${i}" aria-pressed="${selP.includes(i)}" aria-label="Foto ${i + 1}">${HH.photo(p, i, { cls: 'square' })}<span class="bl-tick">${icon('check')}</span>${i === 0 ? '<span class="bl-main tiny">Principal</span>' : ''}</button>`).join('')}</div>` : ''}
        ${vids.length > L.videos ? `<div class="row between"><strong>Videos</strong><span class="small num ${selV.length === L.videos ? '' : 'muted'}">${selV.length} de ${L.videos}</span></div>
        <div class="bl-pick-grid">${vids.map((v, i) => `<button type="button" class="bl-pick${selV.includes(v.id) ? ' on' : ''}" data-kv="${esc(v.id)}" aria-pressed="${selV.includes(v.id)}" aria-label="Video ${i + 1}"><div class="media square">${HH.videoMedia(v)}</div><span class="bl-tick">${icon('check')}</span></button>`).join('')}</div>` : ''}
        <div class="tiny muted">La primera foto que quede visible pasa a ser la principal.</div>`;
      HH.modal({ title: 'Qué queda visible en ' + L.label, wide: true, body, actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: 'Guardar selección', onClick: () => { HH.billSetKeep(w, { photos: selP.slice(), videos: selV.slice() }); HH.closeModal(); HH.toast('Listo, guardamos tu selección', { type: 'ok' }); HH.refresh(); } }] });
      document.querySelectorAll('#modalBox [data-kp]').forEach(b => b.addEventListener('click', () => { const i = Number(b.dataset.kp); if (selP.includes(i)) selP = selP.filter(x => x !== i); else if (selP.length < L.photos) selP.push(i); else { HH.toast('Ya elegiste ' + L.photos + '. Desmarcá una para cambiarla.', { type: 'warn' }); return; } const sc = document.getElementById('modalBox').scrollTop; render(); document.getElementById('modalBox').scrollTop = sc; }));
      document.querySelectorAll('#modalBox [data-kv]').forEach(b => b.addEventListener('click', () => { const id = b.dataset.kv; if (selV.includes(id)) selV = selV.filter(x => x !== id); else if (selV.length < L.videos) selV.push(id); else { HH.toast('Ya elegiste ' + L.videos + '. Desmarcá uno para cambiarlo.', { type: 'warn' }); return; } const sc = document.getElementById('modalBox').scrollTop; render(); document.getElementById('modalBox').scrollTop = sc; }));
    };
    render();
  }

  const me = () => HH.me();
  Object.assign(HH.actions, {
    blStart(el) { const lv = el.dataset.level; if (!HH.LEVELS[lv]) return; HH.billStart(me().id, lv, () => { HH.toast('Plan ' + HH.planName(lv) + ' activo', { type: 'ok' }); HH.refresh(); }); },
    blUp(el) {
      const lv = el.dataset.level; const w = me().id; const q = HH.billQuote(w, lv); if (!q) return;
      const s = q.sub; const hadDown = s.bill.pending && s.bill.pending.type === 'down';
      const amt = q.mp ? HH.ars(q.diffArs) : HH.money(q.diffUsd);
      HH.confirm({ title: 'Subir a ' + HH.planName(lv), text: `<span>Pagás hoy ${amt}: la diferencia entre ${HH.planName(q.from)} y ${HH.planName(lv)} por ${q.daysLeft === 1 ? 'el día que falta' : 'los ' + q.daysLeft + ' días que faltan'} para tu próximo cobro.</span> <span>El plan nuevo se activa cuando llega el pago y desde el ${sameDay(s.expiresAt)} pagás ${q.mp ? HH.ars(q.nextArs) : HH.money(q.newUsd)} por mes.</span>${lv === 'S' && !HH.isStar(w) ? ` <span>Te reservamos el lugar Star ${HH.billCfg().starHoldMin} minutos.</span>` : ''}${hadDown ? ` <span>Se cancela el cambio a ${HH.planName(s.bill.pending.level)}.</span>` : ''}`, okLabel: 'Ir a pagar', onOk: () => HH.billUpgrade(w, lv, () => HH.refresh()) });
    },
    blPayUp() { HH.billPayUpgrade(me().id, () => HH.refresh()); },
    blDown(el) {
      const lv = el.dataset.level; const w = me().id; const s = HH.billSub(w); if (!s) return;
      const ex = HH.planExcess(HH.profileOf(w) || {}, lv); const hasEx = ex.photos || ex.videos;
      const hadUp = s.bill.pending && s.bill.pending.type === 'up';
      HH.confirm({ title: 'Bajar a ' + HH.planName(lv), text: `<span>Seguís con ${HH.planName(s.level)} hasta el ${sameDay(s.expiresAt)}.</span> <span>Ese día se cobra ${s.bill.provider === 'mp' ? HH.ars(HH.planArs(lv)) : HH.money(HH.planUsd(lv))} y pasás a ${HH.planName(lv)}.</span>${hasEx ? ` <span>Tu galería no entra en el plan ${HH.planName(lv)}: ahora elegís qué queda visible.</span> <span>Lo demás se oculta, queda guardado ${HH.billCfg().holdDays} días y después se borra.</span>` : ''}${hadUp ? ' <span>Se cancela el pago pendiente de la diferencia.</span>' : ''}`, okLabel: hasEx ? 'Programar y elegir' : 'Programar el cambio', onOk: () => { HH.billDowngrade(w, lv); HH.refresh(); if (hasEx) setTimeout(() => keepModal(w), 50); else HH.toast('Cambio programado para el ' + sameDay(s.expiresAt), { type: 'ok' }); } });
    },
    blKeep() { keepModal(me().id); },
    blCancelChange() { HH.billCancelChange(me().id); HH.toast('Listo, seguís con tu plan', { type: 'ok' }); HH.refresh(); },
    blRetry() { HH.billRetry(me().id, () => HH.refresh()); },
    // El botón viejo del panel (por si queda en algún lado) usa el flujo nuevo
    dashSubscribe(el) { HH.actions.blStart(el); },
  });

  /* ============================================================
     Admin → Suscripciones
     ============================================================ */
  const AS = { f: 'all', q: '' };
  const STATE_BADGE = { active: ['ok', 'Al día'], paused: ['danger', 'Pausada · cobro rechazado'], expired: ['warn', 'Vencida'] };
  const KIND_ICON = { alta: 'plus', cobro_ok: 'check', pausa: 'alert', reactivacion: 'refresh', subida: 'trending', subida_vencida: 'clock', reserva_star: 'star', baja_programada: 'calendar', baja_aplicada: 'calendar', baja_cancelada: 'x', mep: 'dollar', borrado: 'trash', star_sin_lugar: 'star' };
  const aStat = (k, v, d, cls) => `<div class="stat ${cls || ''}"><span class="k">${k}</span><span class="v">${v}</span>${d ? `<span class="d">${d}</span>` : ''}</div>`;
  function workerSubs() {
    ensure();
    return HH.db.profiles.map(p => ({ p, s: HH.billSub(p.userId) })).filter(x => x.s).map(x => Object.assign(x, { st: HH.billState(x.p.userId) }));
  }
  function filtered() {
    const q = HH.slugify(AS.q || '');
    return workerSubs().filter(x => {
      if (AS.f === 'ok' && x.st !== 'active') return false;
      if (AS.f === 'no' && x.st === 'active') return false;
      if (AS.f === 'chg' && !x.s.bill.pending) return false;
      if (AS.f === 'mp' && x.s.bill.provider !== 'mp') return false;
      if (q && !HH.slugify(x.p.displayName + ' ' + (x.p.city || '') + ' ' + HH.billCountry(x.p.userId)).includes(q)) return false;
      return true;
    }).sort((a, b) => (a.st === b.st ? (a.s.expiresAt > b.s.expiresAt ? 1 : -1) : a.st === 'paused' ? -1 : b.st === 'paused' ? 1 : 0));
  }
  function pendingLabel(s) {
    const pd = s.bill.pending; if (!pd) return '<span class="muted small">—</span>';
    if (pd.type === 'down') return `<span class="badge warn">${icon('calendar')} Baja a ${HH.planName(pd.level)}</span><div class="tiny muted">el ${HH.fmtDate(s.expiresAt)}${pd.keep ? ' · eligió qué queda' : ''}</div>`;
    return `<span class="badge info">${icon('clock')} Sube a ${HH.planName(pd.level)}</span><div class="tiny muted">falta pagar ${s.bill.provider === 'mp' ? HH.ars(pd.diffArs) : HH.money(pd.diffUsd)} · vence ${fmtTime(pd.until)}</div>`;
  }
  function lastPay(userId) { const p = HH.paymentsOf(userId).find(x => x.type === 'subscription'); if (!p) return '<span class="muted small">—</span>'; return `<div class="small num">${p.amountArs != null ? HH.ars(p.amountArs) : HH.money(p.amountUsd)}</div><div class="tiny ${p.status === 'rejected' ? '' : 'muted'}" ${p.status === 'rejected' ? 'style="color:var(--danger)"' : ''}>${HH.fmtDate(p.createdAt)} · ${p.status === 'rejected' ? 'rechazado' : 'aprobado'}</div>`; }
  function rows() {
    const list = filtered();
    if (!list.length) return `<div class="empty">${icon('search')}<h4>Sin resultados</h4><p class="small">Probá con otro filtro.</p></div>`;
    return `<div class="table-wrap"><table class="table bl-adm-table"><thead><tr><th>Acompañante</th><th>Plan</th><th>Estado</th><th>Próximo cobro</th><th>Último pago</th><th>Cambio</th><th>Acciones (demo)</th></tr></thead><tbody>
      ${list.map(({ p, s, st }) => { const [bc, bl] = STATE_BADGE[st] || ['neutral', st]; const held = HH.planHeld(p).length; return `<tr>
        <td><div class="adm-who">${HH.avatar(p, 32)}<div style="min-width:0"><div class="n">${esc(p.displayName)}</div><div class="s">${esc(HH.billCountry(p.userId))} · ${s.bill.provider === 'mp' ? 'Mercado Pago' : 'Por definir (USD)'}</div></div></div></td>
        <td>${HH.levelBadge(s.level, true)}${HH.levelOf(p.userId) && HH.levelOf(p.userId) !== s.level ? `<div class="tiny muted">se ve como ${HH.planName(HH.levelOf(p.userId))}</div>` : ''}</td>
        <td><span class="badge ${bc}">${bl}</span>${st === 'paused' ? `<div class="tiny muted">perfil oculto desde ${HH.fmtDate(s.bill.pausedAt)}</div>` : ''}${held ? `<div class="tiny muted">${held} ${HH.plural(held, 'archivo guardado', 'archivos guardados')} · se borran ${HH.fmtDate(HH.planHeldDeleteAt(p))}</div>` : ''}</td>
        <td>${st === 'paused' ? '<span class="muted small">Pausada</span>' : `<div class="small num">${HH.billFmt(s.bill)}</div><div class="tiny muted">${HH.fmtDate(s.expiresAt)} · ${HH.daysLeft(s.expiresAt)} d</div>`}</td>
        <td>${lastPay(p.userId)}</td>
        <td>${pendingLabel(s)}</td>
        <td><div class="row" style="gap:6px;flex-wrap:wrap">${st === 'active' ? `<button class="btn secondary sm" data-action="blaCharge" data-id="${esc(p.userId)}" title="Simula el cobro del mes ahora">${icon('check')} Cobro OK</button><button class="btn danger sm" data-action="blaFail" data-id="${esc(p.userId)}" title="Simula un cobro rechazado después de los reintentos">${icon('alert')} Rechazado</button>` : ''}${s.bill.pending && s.bill.pending.type === 'up' ? `<button class="btn ghost sm" data-action="blaExpire" data-id="${esc(p.userId)}">Vencer link</button>` : ''}${held ? `<button class="btn ghost sm" data-action="blaWeek" data-id="${esc(p.userId)}">Pasar la semana</button>` : ''}<button class="btn ghost sm" data-action="blaHist" data-id="${esc(p.userId)}">Historial</button></div></td>
      </tr>`; }).join('')}
    </tbody></table></div>`;
  }
  function prices() {
    const c = HH.billCfg();
    return `<div class="table-wrap"><table class="table" style="min-width:420px"><thead><tr><th>Plan</th><th class="num">USD</th><th class="num">Se cobra hoy</th><th class="num">Con el MEP del día</th></tr></thead><tbody>
      ${HH.PLAN_ORDER.map(lv => `<tr><td>${HH.levelBadge(lv, true)}</td><td class="num">${HH.money(HH.planUsd(lv))}</td><td class="num"><strong>${HH.ars(HH.planArs(lv))}</strong></td><td class="num muted">${HH.ars(HH.toArs(HH.planUsd(lv), c.mep))}</td></tr>`).join('')}
    </tbody></table></div>`;
  }
  function settingsCard() {
    const c = HH.billCfg(); const move = HH.billMoveSince();
    const countries = [...new Set(['Argentina'].concat(HH.db.profiles.map(p => HH.billCountry(p.userId)).filter(Boolean)))].sort((a, b) => a.localeCompare(b));
    return `<div class="card stack" style="gap:14px">
      <div class="row between"><div class="card-title">${icon('dollar')} Cobro en pesos con Mercado Pago</div><span class="badge neutral">Simulado</span></div>
      <div class="adm-stats">${aStat('Dólar MEP del día', HH.ars(c.mep), c.mepAt ? 'leído ' + HH.fmtDateTime(c.mepAt) : 'cotización de demostración')}${aStat('Último ajuste', HH.ars(c.mepApplied), (move >= 0 ? '+' : '') + move + '% desde entonces')}${aStat('Umbral', c.thresholdPct + '%', 'ajusta si el MEP se mueve más')}</div>
      <form class="bl-adm-form" data-submit="blaMep">
        <div class="field"><label for="blaMepV">Cotización MEP de hoy (ARS por USD)</label><input class="input num" id="blaMepV" name="mep" type="number" min="1" step="0.01" value="${c.mep}"><span class="hint">En producción la lee el bot todos los días. Acá la cargás para probar.</span></div>
        <div class="field"><label for="blaThr">Umbral de ajuste (%)</label><input class="input num" id="blaThr" name="thr" type="number" min="0" max="50" step="0.5" value="${c.thresholdPct}"><span class="hint">Si el MEP se mueve más que esto desde el último ajuste, el bot actualiza los montos y avisa.</span></div>
        <div class="row" style="align-self:end"><button class="btn" type="submit">${icon('refresh')} Guardar y verificar</button></div>
      </form>
      <div class="stack" style="gap:8px"><span class="label">Países con suscripción de Mercado Pago</span>
        <div class="chips">${countries.map(k => `<button type="button" class="chip${c.countries.includes(k) ? ' active' : ''}" aria-pressed="${c.countries.includes(k)}" data-action="blaCountry" data-country="${esc(k)}">${esc(k)}</button>`).join('')}</div>
        <span class="hint small muted">Los demás países siguen con el procesador por definir (USD). Habilitá uno solo cuando tengas la cuenta de Mercado Pago de ese país. Aplica a las suscripciones nuevas.</span></div>
    </div>`;
  }
  function feed() {
    const ev = HH.billEvents().slice(0, 25);
    return `<div class="card stack" style="gap:10px"><div class="card-title">${icon('whatsapp')} Lo que hizo el bot</div>${ev.length ? `<div class="list">${ev.map(e => `<div class="list-item">${icon(KIND_ICON[e.kind] || 'info')}<div class="grow"><div class="small">${esc(e.text)}</div><div class="tiny muted">${HH.fmtDateTime(e.at)}</div></div></div>`).join('')}</div>` : `<p class="small muted">Todavía no hay movimientos. Cada cobro, pausa, cambio de plan o ajuste por el MEP aparece acá. Los avisos a las acompañantes están en Admin → WhatsApp.</p>`}</div>`;
  }
  function tabSuscripciones(meU) {
    const all = workerSubs(); const ok = all.filter(x => x.st === 'active').length; const no = all.length - ok; const chg = all.filter(x => x.s.bill.pending).length;
    const week = all.filter(x => x.st === 'active' && t(x.s.expiresAt) - Date.now() < 7 * DAY);
    const weekArs = HH.sum(week.filter(x => x.s.bill.provider === 'mp'), x => x.s.bill.amountArs || 0);
    const stats = `<div class="adm-stats bl-stats4">${aStat('Al día', ok, 'publicadas con plan vigente', 'accent')}${aStat('No al día', no, no ? 'perfil oculto hasta que paguen' : 'nadie con cobro rechazado')}${aStat('Cambios de plan', chg, 'subidas por pagar o bajas programadas')}${aStat('Cobros en 7 días', week.length, weekArs ? HH.ars(weekArs) + ' en Mercado Pago' : '')}</div>`;
    const f = [['all', 'Todas'], ['ok', 'Al día'], ['no', 'No al día'], ['chg', 'Con cambio'], ['mp', 'Mercado Pago']];
    const filters = `<div class="adm-filters"><label class="sr-only" for="blaQ">Buscar</label><input class="input" id="blaQ" type="search" placeholder="Buscar por nombre, ciudad o país" value="${esc(AS.q)}" data-input="blaSearch"><div class="chips scroll" style="flex:1 1 auto;min-width:0">${f.map(([id, l]) => `<button type="button" class="chip${AS.f === id ? ' active' : ''}" aria-pressed="${AS.f === id}" data-action="blaFilter" data-f="${id}">${l}</button>`).join('')}</div></div>`;
    const intro = `<div class="notice info">${icon('info')}<span>El bot revisa solo quién está al día: con cada cobro aprobado el plan sigue; con un cobro rechazado (después de los reintentos de Mercado Pago) el plan se pausa y el perfil se oculta en el momento. Los botones de la tabla simulan lo que en producción llega por los webhooks de Mercado Pago.</span></div>`;
    return HH.adminLayout(meU, 'suscripciones', `${HH.adminHead('Suscripciones', `<span class="badge ${no ? 'danger' : 'ok'}">${no ? no + ' no al día' : 'Todas al día'}</span>`, 'Planes de las acompañantes: estado del cobro, cambios de plan y cotización.')}${stats}${intro}${filters}<div id="blaRows">${rows()}</div>${settingsCard()}<div class="card stack" style="gap:10px"><div class="row between"><div class="card-title">Precios por plan</div><span class="tiny muted">en pesos para Argentina</span></div>${prices()}</div>${feed()}`);
  }
  if (HH.adminTabs) {
    const i = HH.adminTabs.findIndex(x => x.id === 'pagos');
    HH.adminTabs.splice(i >= 0 ? i + 1 : HH.adminTabs.length, 0, { id: 'suscripciones', label: 'Suscripciones', icon: 'card' });
    HH.adminCounts.suscripciones = () => workerSubs().filter(x => x.st !== 'active').length;
    HH.adminViews.suscripciones = tabSuscripciones;
  }
  function histModal(userId) {
    const p = HH.profileOf(userId); const pays = HH.paymentsOf(userId).filter(x => x.type === 'subscription'); const ev = HH.billEvents(userId).slice(0, 30);
    HH.modal({ title: 'Historial · ' + (p ? p.displayName : ''), wide: true, body: `
      <div class="card-title">Pagos</div>
      ${pays.length ? `<div class="table-wrap"><table class="table" style="min-width:0"><tbody>${pays.map(x => `<tr><td class="small muted" style="white-space:nowrap">${HH.fmtDateTime(x.createdAt)}</td><td class="small">${esc(x.description)}</td><td class="num small" style="white-space:nowrap">${x.amountArs != null ? HH.ars(x.amountArs) : HH.money(x.amountUsd)}</td><td><span class="badge ${x.status === 'rejected' ? 'danger' : 'ok'}">${x.status === 'rejected' ? 'Rechazado' : 'Aprobado'}</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="small muted">Sin pagos de plan.</p>'}
      <div class="card-title" style="margin-top:6px">Movimientos del bot</div>
      ${ev.length ? `<div class="list">${ev.map(e => `<div class="list-item">${icon(KIND_ICON[e.kind] || 'info')}<div class="grow"><div class="small">${esc(e.text)}</div><div class="tiny muted">${HH.fmtDateTime(e.at)}</div></div></div>`).join('')}</div>` : '<p class="small muted">Sin movimientos.</p>'}` });
  }
  const reRows = () => { const el = document.getElementById('blaRows'); if (el) { el.innerHTML = rows(); if (HH.translate) try { HH.translate(el); } catch (e) { /* admin en español */ } } };
  Object.assign(HH.actions, {
    blaFilter(el) { AS.f = el.dataset.f; HH.refresh(); },
    blaSearch(el) { AS.q = el.value; reRows(); },
    blaCharge(el) { const r = HH.billSimCharge(el.dataset.id, false); if (r) HH.toast('Cobro aprobado: el plan sigue', { type: 'ok' }); HH.refresh(); },
    blaFail(el) { const r = HH.billSimCharge(el.dataset.id, true); if (r) HH.toast('Cobro rechazado: plan pausado y perfil oculto', { type: 'warn' }); HH.refresh(); },
    blaExpire(el) { HH.billSimExpireLink(el.dataset.id); HH.toast('Venció el link de la diferencia', { type: 'warn' }); HH.refresh(); },
    blaWeek(el) { HH.billSimWeek(el.dataset.id); HH.toast('Pasó la semana: se borró el contenido guardado', { type: 'warn' }); HH.refresh(); },
    blaHist(el) { histModal(el.dataset.id); },
    blaCountry(el) { const c = HH.billCfg(); const k = el.dataset.country; const list = c.countries.includes(k) ? c.countries.filter(x => x !== k) : c.countries.concat([k]); HH.saveBillCfg({ countries: list }); HH.refresh(); },
    blaMep(form, ev, v) {
      const thr = Number(v.thr); if (!(thr >= 0 && thr <= 50)) { HH.toast('Revisá el umbral', { type: 'warn' }); return; }
      HH.saveBillCfg({ thresholdPct: thr });
      const r = HH.billSetMep(v.mep);
      if (r.error) { HH.toast(r.error, { type: 'warn' }); return; }
      HH.toast(r.applied ? `El MEP se movió ${r.move}%: se actualizaron ${r.count} ${HH.plural(r.count, 'suscripción', 'suscripciones')}` : `El MEP se movió ${r.move}%: no supera el umbral, sin cambios`, { type: r.applied ? 'ok' : '' });
      HH.refresh();
    },
  });

  /* ---------- Traducciones del panel de la acompañante (el admin queda en español) ----------
     Viven acá y no en i18n/dict.json para que i18n_build.py no las pise. */
  Object.assign(HH.I18N = HH.I18N || {}, {
    "Pagás un plan mensual para estar publicada, con débito automático de Mercado Pago. Cuanto más alto el plan, más arriba aparecés y más herramientas tenés.": ["You pay a monthly plan to be listed, with automatic debit through Mercado Pago. The higher the plan, the higher you appear and the more tools you get.", "Você paga um plano mensal para ficar publicada, com débito automático pelo Mercado Pago. Quanto mais alto o plano, mais acima você aparece e mais ferramentas tem."],
    "Pagás un plan mensual para estar publicada. Cuanto más alto el plan, más arriba aparecés y más herramientas para ganar tenés.": ["You pay a monthly plan to be listed. The higher the plan, the higher you appear and the more tools you get to earn.", "Você paga um plano mensal para ficar publicada. Quanto mais alto o plano, mais acima você aparece e mais ferramentas para ganhar tem."],
    "Tu plan está pausado": ["Your plan is paused", "Seu plano está pausado"],
    "Pausado": ["Paused", "Pausado"],
    "Plan pausado": ["Plan paused", "Plano pausado"],
    "{x} con dólar MEP · Mercado Pago": ["{x} at the MEP dollar rate · Mercado Pago", "{x} com o dólar MEP · Mercado Pago"],
    "{x} con dólar MEP a {x}": ["{x} at an MEP dollar rate of {x}", "{x} com o dólar MEP a {x}"],
    "{x} con dólar MEP": ["{x} at the MEP dollar rate", "{x} com o dólar MEP"],
    "Próximo cobro el {x} · {n} días": ["Next charge on {x} · {n} days", "Próxima cobrança em {x} · {n} dias"],
    "Próximo cobro el {x} · {n} día": ["Next charge on {x} · {n} day", "Próxima cobrança em {x} · {n} dia"],
    "Período transcurrido": ["Billing period elapsed", "Período decorrido"],
    "Débito automático con Mercado Pago. Si el dólar MEP se mueve, te avisamos antes del cobro.": ["Automatic debit with Mercado Pago. If the MEP dollar rate moves, we let you know before the charge.", "Débito automático com o Mercado Pago. Se o dólar MEP mudar, avisamos antes da cobrança."],
    "Activar {x}": ["Activate {x}", "Ativar {x}"],
    "Subir a {x}": ["Upgrade to {x}", "Subir para {x}"],
    "Bajar a {x}": ["Downgrade to {x}", "Descer para {x}"],
    "Desde el {x}": ["From {x}", "A partir de {x}"],
    "Hoy pagás {x} por {n} días": ["You pay {x} today for {n} days", "Hoje você paga {x} por {n} dias"],
    "Hoy pagás {x} por {n} día": ["You pay {x} today for {n} day", "Hoje você paga {x} por {n} dia"],
    "Sin lugares Star": ["No Star spots left", "Sem vagas Star"],
    "Primero regularizá el pago": ["Settle your payment first", "Primeiro regularize o pagamento"],
    "Cambio programado": ["Change scheduled", "Mudança agendada"],
    "Falta pagar la diferencia": ["Difference still unpaid", "Falta pagar a diferença"],
    "Cómo funcionan los cambios de plan": ["How plan changes work", "Como funcionam as mudanças de plano"],
    "Subir:": ["Upgrade:", "Subir:"],
    "Bajar:": ["Downgrade:", "Descer:"],
    "Cobro rechazado:": ["Declined charge:", "Cobrança recusada:"],
    "Pesos:": ["Pesos:", "Pesos:"],
    "pagás solo la diferencia por los días que faltan para tu próximo cobro. El plan nuevo se activa cuando llega el pago.": ["you only pay the difference for the days left until your next charge. The new plan starts when the payment comes in.", "você paga só a diferença pelos dias que faltam até a próxima cobrança. O novo plano começa quando o pagamento chega."],
    "seguís con tu plan hasta el próximo cobro, que ya es del plan menor. Si tu galería no entra, elegís qué queda visible; lo demás se guarda {n} días y después se borra.": ["you keep your plan until the next charge, which is already for the lower plan. If your gallery doesn't fit, you choose what stays visible; the rest is kept for {n} days and then deleted.", "você continua com seu plano até a próxima cobrança, que já é do plano menor. Se sua galeria não couber, você escolhe o que fica visível; o resto fica guardado por {n} dias e depois é apagado."],
    "tu perfil se oculta hasta que actualices la tarjeta y pagues.": ["your profile is hidden until you update your card and pay.", "seu perfil fica oculto até você atualizar o cartão e pagar."],
    "los planes valen en dólares y se cobran en pesos con el dólar MEP. Si se mueve, te avisamos por WhatsApp antes del cobro.": ["plans are priced in dollars and charged in pesos at the MEP dollar rate. If it moves, we let you know on WhatsApp before the charge.", "os planos têm preço em dólares e são cobrados em pesos com o dólar MEP. Se mudar, avisamos pelo WhatsApp antes da cobrança."],
    "Tu perfil está oculto.": ["Your profile is hidden.", "Seu perfil está oculto."],
    "No pudimos cobrar tu plan el {x}.": ["We couldn't charge your plan on {x}.", "Não conseguimos cobrar seu plano em {x}."],
    "No pudimos cobrar tu plan.": ["We couldn't charge your plan.", "Não conseguimos cobrar seu plano."],
    "Actualizá la tarjeta y pagá {x} para volver a aparecer.": ["Update your card and pay {x} to show up again.", "Atualize o cartão e pague {x} para voltar a aparecer."],
    "Actualizar tarjeta y pagar {x}": ["Update card and pay {x}", "Atualizar cartão e pagar {x}"],
    "Actualizar tarjeta y pagar": ["Update card and pay", "Atualizar cartão e pagar"],
    "Rechazado": ["Declined", "Recusado"],
    "El {x} pasás al plan {x}, con el cobro de {x}.": ["On {x} you move to the {x} plan, with the {x} charge.", "Em {x} você passa para o plano {x}, com a cobrança de {x}."],
    "Hasta entonces seguís con {x}.": ["Until then you keep {x}.", "Até lá você continua com {x}."],
    "Ese día se oculta lo que no entra en tu galería.": ["That day, whatever doesn't fit in your gallery is hidden.", "Nesse dia, o que não couber na sua galeria fica oculto."],
    "Ya elegiste qué queda visible.": ["You already chose what stays visible.", "Você já escolheu o que fica visível."],
    "Elegí qué queda visible; si no, quedan las primeras de tu galería.": ["Choose what stays visible; otherwise the first items in your gallery stay.", "Escolha o que fica visível; se não, ficam os primeiros da sua galeria."],
    "Elegir qué queda visible": ["Choose what stays visible", "Escolher o que fica visível"],
    "Seguir con {x}": ["Keep {x}", "Continuar com {x}"],
    "Para pasar a {x} falta pagar la diferencia: {x} por {n} días.": ["To move to {x}, the difference is still unpaid: {x} for {n} days.", "Para passar para {x}, falta pagar a diferença: {x} por {n} dias."],
    "Para pasar a {x} falta pagar la diferencia: {x} por {n} día.": ["To move to {x}, the difference is still unpaid: {x} for {n} day.", "Para passar para {x}, falta pagar a diferença: {x} por {n} dia."],
    "Tu lugar Star está reservado hasta las {x}.": ["Your Star spot is held until {x}.", "Sua vaga Star está reservada até as {x}."],
    "El link vence a las {x}.": ["The payment link expires at {x}.", "O link vence às {x}."],
    "Hasta que llegue el pago seguís con {x}.": ["Until the payment comes in you keep {x}.", "Até o pagamento chegar você continua com {x}."],
    "Cancelar el cambio": ["Cancel the change", "Cancelar a mudança"],
    "Tenés el plan Star pero no hay lugares libres en tu provincia: te mostramos como Diamante hasta que se libere uno.": ["You have the Star plan but there are no free spots in your province: we show you as Diamond until one opens up.", "Você tem o plano Star, mas não há vagas livres na sua província: mostramos você como Diamante até liberar uma."],
    "Guardamos {n} archivos que no entran en tu plan": ["We kept {n} files that don't fit in your plan", "Guardamos {n} arquivos que não cabem no seu plano"],
    "Guardamos {n} archivo que no entran en tu plan": ["We kept {n} file that doesn't fit in your plan", "Guardamos {n} arquivo que não cabe no seu plano"],
    "Están ocultos de tu perfil hasta el {x}.": ["They're hidden from your profile until {x}.", "Estão ocultos do seu perfil até {x}."],
    "Ese día se borran.": ["On that day they're deleted.", "Nesse dia são apagados."],
    "Si subís de plan antes, reaparecen.": ["If you upgrade before then, they come back.", "Se você subir de plano antes, eles voltam."],
    "Qué queda visible en {x}": ["What stays visible on {x}", "O que fica visível no {x}"],
    "El plan {x} permite {n} fotos y {n} videos.": ["The {x} plan allows {n} photos and {n} videos.", "O plano {x} permite {n} fotos e {n} vídeos."],
    "Marcá lo que querés que siga visible.": ["Select what you want to keep visible.", "Marque o que você quer que continue visível."],
    "El resto se oculta el {x} y queda guardado {n} días.": ["The rest is hidden on {x} and kept for {n} days.", "O resto fica oculto em {x} e guardado por {n} dias."],
    "La primera foto que quede visible pasa a ser la principal.": ["The first visible photo becomes your main photo.", "A primeira foto visível passa a ser a principal."],
    "Guardar selección": ["Save selection", "Salvar seleção"],
    "Foto {n}": ["Photo {n}", "Foto {n}"],
    "Video {n}": ["Video {n}", "Vídeo {n}"],
    "Checkout simulado": ["Simulated checkout", "Checkout simulado"],
    "Pago con tarjeta": ["Card payment", "Pagamento com cartão"],
    "Procesador por definir · simulado": ["Processor to be defined · simulated", "Processador a definir · simulado"],
    "Cambio": ["Change", "Mudança"],
    "Cálculo por días": ["Per-day calculation", "Cálculo por dias"],
    "Lugar Star": ["Star spot", "Vaga Star"],
    "Reservado hasta las {x}": ["Held until {x}", "Reservada até as {x}"],
    "Tarjeta de crédito o débito": ["Credit or debit card", "Cartão de crédito ou débito"],
    "Demo: simular tarjeta rechazada": ["Demo: simulate a declined card", "Demo: simular cartão recusado"],
    "En producción se abre el checkout de Mercado Pago: SexyRose no ve los datos de tu tarjeta.": ["In production, Mercado Pago's checkout opens: SexyRose never sees your card details.", "Em produção abre o checkout do Mercado Pago: a SexyRose não vê os dados do seu cartão."],
    "En producción se abre el checkout del procesador: SexyRose no ve los datos de tu tarjeta.": ["In production, the processor's checkout opens: SexyRose never sees your card details.", "Em produção abre o checkout do processador: a SexyRose não vê os dados do seu cartão."],
    "Ahora no se cobra nada.": ["Nothing is charged now.", "Agora nada é cobrado."],
    "Débito automático cada {n} días con esta tarjeta. Podés cambiar de plan desde tu panel.": ["Automatic debit every {n} days on this card. You can change plans from your dashboard.", "Débito automático a cada {n} dias neste cartão. Você pode mudar de plano pelo seu painel."],
    "Pagar la diferencia": ["Pay the difference", "Pagar a diferença"],
    "Ir a pagar": ["Go to payment", "Ir para o pagamento"],
    "Programar y elegir": ["Schedule and choose", "Agendar e escolher"],
    "Programar el cambio": ["Schedule the change", "Agendar a mudança"],
    "Pagás hoy {x}: la diferencia entre {x} y {x} por los {n} días que faltan para tu próximo cobro.": ["You pay {x} today: the difference between {x} and {x} for the {n} days left until your next charge.", "Você paga {x} hoje: a diferença entre {x} e {x} pelos {n} dias que faltam até a próxima cobrança."],
    "Pagás hoy {x}: la diferencia entre {x} y {x} por el día que falta para tu próximo cobro.": ["You pay {x} today: the difference between {x} and {x} for the day left until your next charge.", "Você paga {x} hoje: a diferença entre {x} e {x} pelo dia que falta até a próxima cobrança."],
    "El plan nuevo se activa cuando llega el pago y desde el {x} pagás {x} por mes.": ["The new plan starts when the payment comes in, and from {x} you pay {x} per month.", "O novo plano começa quando o pagamento chega e a partir de {x} você paga {x} por mês."],
    "Te reservamos el lugar Star {n} minutos.": ["We hold the Star spot for you for {n} minutes.", "Reservamos a vaga Star para você por {n} minutos."],
    "Se cancela el cambio a {x}.": ["The change to {x} is cancelled.", "A mudança para {x} é cancelada."],
    "Seguís con {x} hasta el {x}.": ["You keep {x} until {x}.", "Você continua com {x} até {x}."],
    "Ese día se cobra {x} y pasás a {x}.": ["That day {x} is charged and you move to {x}.", "Nesse dia são cobrados {x} e você passa para {x}."],
    "Tu galería no entra en el plan {x}: ahora elegís qué queda visible.": ["Your gallery doesn't fit in the {x} plan: now you choose what stays visible.", "Sua galeria não cabe no plano {x}: agora você escolhe o que fica visível."],
    "Lo demás se oculta, queda guardado {n} días y después se borra.": ["The rest is hidden, kept for {n} days and then deleted.", "O resto fica oculto, guardado por {n} dias e depois é apagado."],
    "Se cancela el pago pendiente de la diferencia.": ["The pending difference payment is cancelled.", "O pagamento pendente da diferença é cancelado."],
    "Cambio programado para el {x}": ["Change scheduled for {x}", "Mudança agendada para {x}"],
    "Listo, seguís con tu plan": ["Done, you keep your plan", "Pronto, você continua com seu plano"],
    "Listo, guardamos tu selección": ["Done, we saved your selection", "Pronto, salvamos sua seleção"],
    "Plan {x} activo": ["{x} plan active", "Plano {x} ativo"],
    "Mercado Pago rechazó el pago. No se cobró nada.": ["Mercado Pago declined the payment. Nothing was charged.", "O Mercado Pago recusou o pagamento. Nada foi cobrado."],
    "El procesador rechazó el pago. No se cobró nada.": ["The processor declined the payment. Nothing was charged.", "O processador recusou o pagamento. Nada foi cobrado."],
    "El link de pago venció. Volvé a elegir el plan.": ["The payment link expired. Choose the plan again.", "O link de pagamento venceu. Escolha o plano de novo."],
    "Ya elegiste {n}. Desmarcá una para cambiarla.": ["You already chose {n}. Unselect one to swap it.", "Você já escolheu {n}. Desmarque uma para trocar."],
    "Ya elegiste {n}. Desmarcá uno para cambiarlo.": ["You already chose {n}. Unselect one to swap it.", "Você já escolheu {n}. Desmarque um para trocar."],
  });

  /* ---------- Estilos ---------- */
  const st = document.createElement('style');
  st.textContent = `
  .bl-mp-head{display:flex;align-items:center;gap:10px}.bl-mp-logo{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:#00B1EA;color:#fff;flex:none}.bl-mp-logo svg{width:20px;height:20px}
  .bl-cta-note{text-align:center;margin-top:6px}
  .bl-how-row{display:flex;gap:10px;align-items:flex-start;font-size:14px;color:var(--fg-2)}.bl-how-row svg{width:18px;height:18px;flex:none;color:var(--berry);margin-top:2px}
  .bl-hist{display:grid;gap:2px}.bl-hist-row{display:flex;gap:12px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line)}.bl-hist-row:last-child{border-bottom:0}
  .bl-hold{border-color:var(--warn)}.bl-hold>.row>svg{width:20px;height:20px;color:var(--warn);flex:none;margin-top:2px}
  .bl-held-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.bl-held{width:56px;flex:none;opacity:.7}.bl-held .media{border-radius:10px}
  .bl-pick-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}@media(min-width:640px){.bl-pick-grid{grid-template-columns:repeat(6,minmax(0,1fr))}}
  .bl-pick{position:relative;padding:0;border:2px solid transparent;border-radius:12px;background:none;overflow:hidden;opacity:.45;cursor:pointer}.bl-pick .media{border-radius:10px}
  .bl-pick.on{border-color:var(--berry);opacity:1}.bl-tick{position:absolute;right:5px;top:5px;z-index:2;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:rgba(0,0,0,.5);color:#fff}.bl-tick svg{width:13px;height:13px}.bl-pick.on .bl-tick{background:var(--berry);color:var(--berry-ink)}
  .bl-main{position:absolute;left:5px;bottom:5px;z-index:2;background:rgba(0,0,0,.55);color:#fff;padding:1px 6px;border-radius:999px;font-weight:700}
  .bl-adm-form{display:grid;gap:12px;grid-template-columns:minmax(0,1fr)}@media(min-width:720px){.bl-adm-form{grid-template-columns:1fr 1fr auto;align-items:start}.bl-adm-form .row{padding-top:24px}}
  @media(min-width:900px){.adm-stats.bl-stats4{grid-template-columns:repeat(4,minmax(0,1fr))}}
  .bl-adm-table{min-width:980px}.bl-adm-table td{vertical-align:top}`;
  document.head.appendChild(st);
})();
