/* ============================================================
   SexyRose — prod-admin-integraciones.js (admin de producción)
   Admin → Ajustes: vincular Telegram (avisos internos), cargar las cuentas de Mercado Pago que cobran la comisión
   y probar el WhatsApp del sitio. Usa la API de app/routes/admin-integraciones.js.
   prod-admin.js llama a HH.adminInt.telegramCard(), HH.adminInt.mpCuentas(vc, err) y HH.adminInt.botonProbarWa().
   ============================================================ */
(function () {
  'use strict';
  if (window.HH_PROD !== 'admin') return;
  const esc = HH.esc, icon = HH.icon;
  const S = { tg: null, tgErr: null, tgLoading: false, mp: null, mpErr: null, mpLoading: false, prueba: {} };
  const enAjustes = () => /^admin\.ajustes$|^admin$/.test((HH.current && HH.current.path) || '') && document.getElementById('prodTg');
  const modalAbierto = () => document.getElementById('modalRoot').classList.contains('open');
  const rerender = () => { if (!modalAbierto()) HH.refresh(); };
  const fecha = (iso) => (iso ? HH.fmtDateTime(iso) : '');
  const hora = (iso) => { try { return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
  const fail = (e) => HH.toast(e.message, { type: 'danger' });

  function cargarTg(force) {
    if (S.tgLoading || (!force && S.tg)) return;
    S.tgLoading = true;
    HH.api('GET', '/integraciones/telegram')
      .then((d) => { S.tg = d; S.tgErr = null; })
      .catch((e) => { S.tgErr = e.message; })
      .finally(() => { S.tgLoading = false; rerender(); vigilar(); });
  }
  function cargarMp(force) {
    if (S.mpLoading || (!force && S.mp)) return;
    S.mpLoading = true;
    HH.api('GET', '/integraciones/mp')
      .then((d) => { S.mp = d; S.mpErr = null; })
      .catch((e) => { S.mpErr = e.message; })
      .finally(() => { S.mpLoading = false; rerender(); });
  }
  // Mientras hay un código pendiente, se consulta el estado cada 3 s hasta que quede vinculado o venza.
  let poll = null;
  function vigilar() {
    const pend = S.tg && S.tg.pendiente;
    if (pend && !poll) {
      poll = setInterval(() => {
        if (!S.tg || !S.tg.pendiente) { clearInterval(poll); poll = null; return; }
        HH.api('GET', '/integraciones/telegram').then((d) => {
          const antes = !!(S.tg && S.tg.vinculado); S.tg = d;
          if (!antes && d.vinculado) HH.toast('Telegram vinculado', { type: 'ok' });
          if (!d.pendiente) { clearInterval(poll); poll = null; }
          if (enAjustes()) rerender();
        }).catch(() => {});
      }, 3000);
    } else if (!pend && poll) { clearInterval(poll); poll = null; }
  }

  /* ---------- Telegram ---------- */
  function telegramCard() {
    cargarTg();
    const t = S.tg;
    let body;
    if (!t && S.tgErr) body = `<div class="notice danger">${icon('alert')}<span>${esc(S.tgErr)}</span></div>`;
    else if (!t) body = '<div class="pa-skel"></div>';
    else if (!t.botConfigurado) {
      body = `<div class="notice warn">${icon('alert')}<span>Falta el bot en el servidor. Creá un bot con <strong>@BotFather</strong> en Telegram, copiá el token en el archivo <code>.env</code> del servidor (<code>TELEGRAM_BOT_TOKEN</code>) y hacé deploy. Después lo vinculás desde acá.</span></div>`;
    } else {
      const v = t.vinculado; const p = t.pendiente;
      let estado;
      if (p) {
        estado = `<div class="notice info stack" style="gap:8px">${icon('send')}<div class="stack" style="gap:8px">
            <span>Abrí el link en el teléfono o la computadora donde usás Telegram y tocá <strong>Iniciar</strong>. El código vence a las ${esc(hora(p.expira))}.</span>
            <div class="row" style="gap:8px;flex-wrap:wrap"><code style="font-size:18px;letter-spacing:.12em">${esc(p.codigo)}</code>
              <a class="btn sm" href="${esc(p.link)}" target="_blank" rel="noopener noreferrer">${icon('send')} Abrir Telegram</a>
              <button type="button" class="btn ghost sm" data-action="intTgCancelar">Cancelar</button></div>
            <span class="tiny muted">Esperando… esta pantalla se actualiza sola.</span></div></div>`;
      } else if (v) {
        estado = `<div class="list-item">${icon('check')}<div class="grow" style="min-width:0"><div class="title">Vinculado con ${esc(v.nombre || 'tu chat')}${v.usuario ? ` <span class="muted">@${esc(v.usuario)}</span>` : ''}</div><div class="sub">Desde el ${esc(fecha(v.desde))}</div></div></div>
          <div class="row" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn secondary sm" data-action="intTgProbar">${icon('send')} Enviar prueba</button>
            <button type="button" class="btn ghost sm" data-action="intTgVincular">Vincular otro chat</button>
            <button type="button" class="btn ghost sm pa-danger" data-action="intTgDesvincular">Desvincular</button></div>`;
      } else {
        estado = `${t.respaldoServidor ? `<div class="notice">${icon('info')}<span>Hoy los avisos van al chat cargado en el servidor (<code>TELEGRAM_CHAT_ID</code>). Si vinculás uno desde acá, se usa ese.</span></div>` : `<p class="small muted" style="margin:0">Todavía no hay un chat vinculado: los avisos no llegan a ningún lado.</p>`}
          <div class="row" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn sm" data-action="intTgVincular">${icon('send')} Vincular Telegram</button>
            ${t.respaldoServidor ? `<button type="button" class="btn ghost sm" data-action="intTgProbar">Enviar prueba</button>` : ''}</div>`;
      }
      const avisos = (t.avisos || []).map((a) => `<label class="row nowrap small" style="gap:8px"><input type="checkbox" id="intAv_${esc(a.id)}" data-aviso="${esc(a.id)}"${a.activo ? ' checked' : ''}> ${esc(a.nombre)}</label>`).join('');
      body = `${t.bot ? `<div class="small muted">Bot: <strong>@${esc(t.bot.usuario)}</strong></div>` : ''}
        ${t.error ? `<div class="notice warn">${icon('alert')}<span>${esc(t.error)}</span></div>` : ''}
        ${estado}
        <div class="card-title" style="font-size:15px">Qué avisos te llegan</div>
        <div class="grid-2" style="gap:6px 16px">${avisos}</div>
        <div class="row"><button type="button" class="btn secondary sm" data-action="intTgAvisos">${icon('check')} Guardar avisos</button></div>`;
    }
    return `<section class="card stack" style="gap:12px" id="prodTg">
        <div class="row between"><div class="card-title">${icon('bell')} Avisos por Telegram</div><button type="button" class="btn ghost sm" data-action="intTgRecargar" aria-label="Actualizar">${icon('refresh')}</button></div>
        <p class="small muted">Te avisa al instante de lo que tenés que revisar. Los avisos nunca incluyen datos de contacto ni el texto de las denuncias o de los pedidos.</p>
        ${body}
      </section>`;
  }

  /* ---------- Mercado Pago: cuentas que cobran la comisión ---------- */
  function mpCuentas(vc, errVc) {
    cargarMp();
    const m = S.mp;
    if (!vc && errVc) return `<div class="notice danger">${icon('alert')}<span>${esc(errVc)}</span></div>`;
    if (!vc || (!m && !S.mpErr)) return '<div class="pa-skel"></div>';
    const secretos = !!(m && m.secretos);
    const lista = (vc.cuentas || []).length ? `<div class="list">${vc.cuentas.map((c) => {
      const deAca = c.origen === 'admin';
      const pr = S.prueba[c.id];
      return `<div class="list-item" style="align-items:flex-start;flex-wrap:wrap">
          <div class="grow" style="min-width:0;flex:1 1 240px"><div class="title">${esc(c.nombre)} ${c.activa ? `<span class="badge ok">${icon('check')} Recibe la comisión</span>` : ''} <span class="badge neutral">${deAca ? 'Cargada acá' : 'Desde el servidor'}</span></div>
            <div class="sub">${c.conectadas} ${HH.plural(c.conectadas, 'acompañante conectada', 'acompañantes conectadas')} · Client ID <code>${esc(c.clientId || '—')}</code>${c.secretoFin ? ` · Secret <code>${esc(c.secretoFin)}</code>` : ''}${c.webhookFin ? ` · Webhook <code>${esc(c.webhookFin)}</code>` : ''}${c.completa ? '' : ` · <span class="pa-danger">faltan datos</span>`}</div>
            ${pr ? `<div class="tiny ${pr.ok ? '' : 'pa-danger'}" style="margin-top:4px">${esc(pr.mensaje)}</div>` : ''}</div>
          <div class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end;margin-left:auto">
            ${c.activa ? '' : `<button type="button" class="btn secondary sm" data-action="prodVcActivar" data-id="${esc(c.id)}"${c.completa ? '' : ' disabled'}>Usar esta cuenta</button>`}
            <button type="button" class="btn ghost sm" data-action="intMpProbar" data-id="${esc(c.id)}">Probar</button>
            ${deAca ? `<button type="button" class="btn ghost sm" data-action="intMpEditar" data-id="${esc(c.id)}" aria-label="Editar ${esc(c.nombre)}">${icon('edit')}</button>
            <button type="button" class="btn ghost sm pa-danger" data-action="intMpBorrar" data-id="${esc(c.id)}" aria-label="Borrar ${esc(c.nombre)}">${icon('trash')}</button>` : ''}
          </div></div>`;
    }).join('')}</div>` : `<div class="notice">${icon('info')}<span>Todavía no hay cuentas de Mercado Pago. Mientras no haya una completa, la venta de contenido no se muestra en el sitio.</span></div>`;
    const ilegibles = m && (m.ilegibles || []).length ? `<div class="notice warn">${icon('alert')}<span>Hay ${m.ilegibles.length} ${HH.plural(m.ilegibles.length, 'cuenta guardada', 'cuentas guardadas')} que no se ${m.ilegibles.length === 1 ? 'puede' : 'pueden'} leer (${m.ilegibles.map((x) => esc(x.nombre)).join(', ')}): falta o cambió <code>SECRETS_KEY</code> en el servidor. ${m.ilegibles.map((x) => `<button type="button" class="btn ghost sm" data-action="intMpBorrar" data-id="${esc(x.id)}">Borrar ${esc(x.nombre)}</button>`).join(' ')}</span></div>` : '';
    const agregar = secretos
      ? `<div class="row"><button type="button" class="btn secondary sm" data-action="intMpNueva">${icon('plus')} Agregar cuenta de Mercado Pago</button></div>`
      : `<div class="notice warn">${icon('lock')}<span>Para cargar cuentas desde acá falta la variable <code>SECRETS_KEY</code> en el servidor (una clave larga al azar: <code>openssl rand -hex 32</code>). Se usa para guardar las claves cifradas.</span></div>`;
    return `${lista}${ilegibles}${agregar}
      <p class="tiny muted" style="margin:0;overflow-wrap:anywhere">En cada aplicación de Mercado Pago: dirección de redirección <code>${esc(vc.redirectUri)}</code> y notificaciones (webhooks, evento «Pagos») <code>${esc(vc.webhookUrl)}</code>.</p>`;
  }

  function formMp(c) {
    const nueva = !c;
    HH.modal({
      title: nueva ? 'Agregar cuenta de Mercado Pago' : 'Editar ' + c.nombre,
      body: `<div class="stack" style="gap:12px">
          <p class="small muted" style="margin:0">Datos de la aplicación en Mercado Pago (Tus integraciones → tu aplicación → Credenciales de producción). Se guardan cifrados y nunca se vuelven a mostrar.</p>
          <div class="field"><label for="intMpNombre">Nombre (quién cobra)</label><input class="input" id="intMpNombre" maxlength="60" value="${esc(c ? c.nombre : '')}" placeholder="Juan"></div>
          <div class="field"><label for="intMpId">Client ID</label><input class="input" id="intMpId" maxlength="64" autocomplete="off" spellcheck="false" value="${esc(c ? c.clientId : '')}"${nueva ? '' : ' disabled'}>${nueva ? '' : '<span class="hint">Para cambiar de aplicación, borrá esta cuenta y cargá la nueva.</span>'}</div>
          <div class="field"><label for="intMpSecret">Client Secret</label><input class="input" id="intMpSecret" type="password" maxlength="200" autocomplete="new-password" spellcheck="false" placeholder="${nueva ? '' : 'Vacío = no cambia (' + esc(c.secretoFin) + ')'}">${nueva ? '' : '<span class="hint">Si lo cambiás, las acompañantes conectadas a esta cuenta tienen que volver a conectar Mercado Pago.</span>'}</div>
          <div class="field"><label for="intMpWebhook">Clave secreta de las notificaciones (webhooks)</label><input class="input" id="intMpWebhook" type="password" maxlength="200" autocomplete="new-password" spellcheck="false" placeholder="${nueva ? '' : 'Vacío = no cambia (' + esc(c.webhookFin) + ')'}"></div>
        </div>`,
      actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: nueva ? 'Guardar cuenta' : 'Guardar cambios', onClick: () => {
        const val = (id) => (document.getElementById(id) || {}).value || '';
        const datos = { nombre: val('intMpNombre'), clientSecret: val('intMpSecret'), webhookSecret: val('intMpWebhook') };
        if (nueva) datos.clientId = val('intMpId');
        (nueva ? HH.api('POST', '/integraciones/mp', datos) : HH.api('PUT', '/integraciones/mp/' + encodeURIComponent(c.id), datos))
          .then((r) => { S.mp = r; HH.closeModal(); HH.toast(nueva ? 'Cuenta agregada' : 'Cuenta guardada', { type: 'ok' }); if (HH.adminRecargar) HH.adminRecargar('vc'); rerender(); })
          .catch(fail);
      } }],
    });
  }

  /* ---------- WhatsApp: probar el número del sitio ---------- */
  const botonProbarWa = () => `<button type="button" class="btn ghost sm" data-action="intWaProbar">${icon('whatsapp')} Probar</button>`;

  /* ---------- Acciones ---------- */
  const cuentaVc = (id) => (HH.adminVc && HH.adminVc() && (HH.adminVc().cuentas || []).find((x) => x.id === id)) || null;
  Object.assign(HH.actions, {
    intTgRecargar() { cargarTg(true); },
    intTgVincular() {
      HH.api('POST', '/integraciones/telegram/vincular', {}).then((d) => { S.tg = d; rerender(); vigilar(); }).catch(fail);
    },
    intTgCancelar() { HH.api('POST', '/integraciones/telegram/cancelar', {}).then((d) => { S.tg = d; rerender(); vigilar(); }).catch(fail); },
    intTgProbar() { HH.api('POST', '/integraciones/telegram/probar', {}).then(() => HH.toast('Mensaje de prueba enviado: fijate en Telegram', { type: 'ok' })).catch(fail); },
    intTgDesvincular() {
      HH.confirm({ title: 'Desvincular Telegram', text: 'Los avisos dejan de llegar a ese chat.', okLabel: 'Desvincular', cls: 'danger', onOk: () => {
        HH.api('POST', '/integraciones/telegram/desvincular', {}).then((d) => { S.tg = d; HH.toast('Telegram desvinculado', { type: 'ok' }); rerender(); }).catch(fail);
      } });
    },
    intTgAvisos() {
      const avisos = {};
      document.querySelectorAll('#prodTg [data-aviso]').forEach((el) => { avisos[el.dataset.aviso] = el.checked; });
      HH.api('PUT', '/integraciones/telegram/avisos', { avisos }).then((d) => { S.tg = d; HH.toast('Avisos guardados', { type: 'ok' }); rerender(); }).catch(fail);
    },
    intMpNueva() { formMp(null); },
    intMpEditar(el) { const c = cuentaVc(el.dataset.id); if (c) formMp(c); },
    intMpBorrar(el) {
      const id = el.dataset.id; const c = cuentaVc(id) || ((S.mp && S.mp.ilegibles) || []).find((x) => x.id === id) || { nombre: id };
      HH.confirm({ title: 'Borrar ' + c.nombre, text: '<span>Se borran sus datos guardados.</span> <span>Si era la cuenta que recibe la comisión, pasa a la siguiente y las acompañantes conectadas a esta tienen que volver a conectar Mercado Pago.</span>', okLabel: 'Borrar', cls: 'danger', onOk: () => {
        HH.api('DELETE', '/integraciones/mp/' + encodeURIComponent(id), {}).then((r) => { S.mp = r; HH.toast('Cuenta borrada', { type: 'ok' }); if (HH.adminRecargar) HH.adminRecargar('vc'); rerender(); }).catch(fail);
      } });
    },
    intMpProbar(el) {
      const id = el.dataset.id; S.prueba[id] = { ok: true, mensaje: 'Probando…' }; rerender();
      HH.api('POST', '/integraciones/mp/' + encodeURIComponent(id) + '/probar', {}).then((r) => { S.prueba[id] = r; rerender(); }).catch((e) => { S.prueba[id] = { ok: false, mensaje: e.message }; rerender(); });
    },
    intWaProbar() {
      const num = String((document.getElementById('ajWa') || {}).value || '').replace(/\D/g, '');
      if (num.length < 8) { HH.toast('Cargá el número de WhatsApp con código de país (ej. 5491122334455).', { type: 'warn' }); return; }
      // La ventana se abre ya (en el mismo toque) para que el navegador no la bloquee; después se le pone la dirección.
      const w = window.open('', '_blank');
      HH.api('GET', '/integraciones/whatsapp/ejemplo').then((r) => {
        const url = 'https://wa.me/' + num + '?text=' + encodeURIComponent(r.mensaje || '');
        if (w) { try { w.opener = null; } catch (e) { /* nada */ } w.location.href = url; } else location.href = url;
      }).catch((e) => { if (w) w.close(); fail(e); });
    },
  });

  HH.adminInt = { telegramCard, mpCuentas, botonProbarWa };
})();
