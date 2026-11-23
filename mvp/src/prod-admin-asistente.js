/* ============================================================
   SexyRose — prod-admin-asistente.js (admin real, 15/11/2026; Mensajería desde el 16/11/2026)
   Admin → Mensajería (antes "Asistente"), pestañas:
   - Conversaciones: los chats del asistente de cuenta por WhatsApp ("Pasar a humano" / "Devolver al asistente",
     pedidos nombrados en el chat) con el filtro "Captación".
   - WhatsApp: el único número (chip) del asistente: estado y QR para vincularlo, "Desvincular", prendido/apagado y el
     número que usa el botón de comprar créditos. Las cuentas para las transferencias (listas en pesos y, opcional, en
     dólares, con rotación) se cargan en Créditos → Banco desde el 18/11/2026 (HH.adminBanco.cuentaCard, la arma este
     archivo); acá queda un aviso.
   - Telegram: vincular tu Telegram (avisos y botones), qué avisos llegan, y el usuario de Telegram para comprar créditos.
   - Mensajes: el mensaje del pedido de créditos (es/en/pt) y el mensaje de captación.
   La pestaña Captación la arma prod-admin-captacion.js. API: app/routes/admin-asistente.js (bajo ${API}/asistente).
   ============================================================ */
(function () {
  'use strict';
  if (window.HH_PROD !== 'admin' || !HH.pa) return;
  const esc = HH.esc, icon = HH.icon;
  const P = HH.pa; const S = P.S;
  const { load, layout, head, fecha, loadingCard, linkCuenta } = P;
  const errorCard = (msg, k) => `<div class="card"><div class="empty">${icon('alert')}<h4>No se pudo cargar</h4><p class="small">${esc(msg)}</p><button type="button" class="btn secondary sm" data-action="asisRecargar" data-k="${esc(k)}">${icon('refresh')} Reintentar</button></div></div>`;

  /* ---------- Menú: Cobros → Mensajería (prod-admin.js); el contador sale de S.asis ---------- */
  // El contador del menú (chats que esperan a una persona) se carga al abrir el panel, no recién al entrar.
  const boot0 = HH.boot;
  HH.boot = function () { const r = boot0.apply(this, arguments); load('asis', '/asistente'); return r; };

  const fail = (e) => HH.toast(e.message, { type: 'danger' });
  const enVista = () => /^admin\.mensajeria/.test((HH.current && HH.current.path) || '');
  const enBanco = () => /^admin\.creditos\.banco$/.test((HH.current && HH.current.path) || '');
  const modalAbierto = () => document.getElementById('modalRoot').classList.contains('open');
  const rerender = () => { if ((enVista() || enBanco()) && !modalAbierto()) HH.refresh(); };
  S.asf = S.asf || 'todas'; S.asq = S.asq || '';
  const recargar = (k) => `<button type="button" class="btn ghost sm" data-action="asisRecargar" data-k="${esc(k)}">${icon('refresh')} Actualizar</button>`;

  const ESTADO_WA = {
    conectado: ['Conectado', 'ok'], esperando_qr: ['Esperando QR', 'warn'], conectando: ['Conectando…', 'info'],
    desconectado: ['Desconectado', 'danger'], apagado: ['Apagado', 'neutral'],
  };
  const ORIGEN = { bot: 'Asistente', juan: 'Vos (desde el teléfono)', captacion: 'Invitación (captación)', usuario: '' };
  const CAP_ESTADO = { pendiente: 'Pendiente', abierto: 'Abierto', enviado: 'Enviado', respondio: 'Respondió', se_registro: 'Se registró', no_escribir: 'No escribir', revisar: 'Revisar', descartado: 'Descartado', en_sitio: 'Ya está en el sitio', no_disponible: 'No disponible' };
  const ESTADO_PED = { pendiente: ['Esperando pago', 'warn'], confirmado: ['Acreditado', 'ok'], vencido: ['Vencido', 'neutral'], cancelado: ['Cancelado', 'neutral'], rechazado: ['Rechazado', 'danger'] };
  const estadoChat = (c) => (c.estado === 'humano' ? ['Persona', 'warn'] : c.silenciadoHasta ? ['En silencio', 'info'] : ['Asistente', 'ok']);
  const chip = (c) => { const [l, cls] = estadoChat(c); return `<span class="badge ${cls}">${l}</span>`; };

  // Mientras se espera el QR o la conexión, el estado se consulta cada 3 s.
  let poll = null;
  function vigilar() {
    // Varios chips (19/11/2026): mientras alguno espera el QR o se conecta
    const chs = (S.asis && S.asis.chips) || [];
    const hace = S.asis && S.asis.ajustes && S.asis.ajustes.activo && chs.some((c) => ['esperando_qr', 'conectando', 'desconectado'].includes(c.estado) || (c.recuperar && c.recuperar.vigente));
    if (hace && !poll) {
      poll = setInterval(() => {
        if (!enVista()) { clearInterval(poll); poll = null; return; }
        HH.api('GET', '/asistente').then((d) => {
          const antes = new Map(((S.asis && S.asis.chips) || []).map((c) => [c.id, c.estado])); S.asis = d;
          (d.chips || []).forEach((c) => { if (antes.get(c.id) && antes.get(c.id) !== 'conectado' && c.estado === 'conectado') HH.toast(`Chip ${c.letra} conectado`, { type: 'ok' }); });
          if (/^admin\.mensajeria\.(whatsapp|conversaciones)$/.test(HH.current.path)) rerender();
          vigilar();
        }).catch(() => {});
      }, 3000);
    } else if (!hace && poll) { clearInterval(poll); poll = null; }
  }

  /* ---------- Estado y ajustes ---------- */
  // Prendido/apagado (para todos los chips) e IA
  function cardEstado(d) {
    const aj = d.ajustes || {}; const ia = d.ia || {};
    const chs = d.chips || [];
    const sinAgente = aj.activo && chs.length && !chs.some((c) => c.agente);
    return `<section class="card stack" style="gap:12px" id="asisEstado">
        <div class="row between" style="gap:12px;flex-wrap:nowrap"><div class="grow"><div class="card-title">${icon('whatsapp')} Asistente de cuenta</div><div class="small muted">${aj.activo ? 'Prendido en todos los chips' : 'Apagado: no se conecta a WhatsApp y no responde'}</div></div>
          <button type="button" class="switch" role="switch" aria-checked="${!!aj.activo}" aria-label="Asistente prendido" data-action="asisActivo"></button></div>
        ${sinAgente ? `<div class="notice danger">${icon('alert')}<span>El asistente no está corriendo en el servidor (contenedor <code>agente</code>). Revisá el deploy y los logs.</span></div>` : ''}
        <div class="small muted">IA: ${ia.configurada ? `activa (<code>${esc(ia.modelo || '')}</code>)` : 'sin <code>ANTHROPIC_API_KEY</code>: responde solo los pedidos y comprobantes; lo demás te lo pasa a vos.'}</div>
      </section>`;
  }
  /* Varios chips (19/11/2026): cada uno con su letra, su rol (captación o créditos), su cupo de invitaciones por día,
     pausa a mano (restringido o bloqueado) y su QR. API: /asistente/chips. */
  const ROL_TXT = { captacion: 'Captación', creditos: 'Créditos' };
  function chipCard(c, aj) {
    const [lb, cls] = ESTADO_WA[c.estado] || ESTADO_WA.desconectado;
    let cuerpo = '';
    if (!aj.activo) cuerpo = '';
    else if (c.estado === 'esperando_qr' && c.qrSvg) {
      cuerpo = `<div class="asis-qr-wrap"><img class="asis-qr" src="${esc(c.qrSvg)}" alt="Código QR para vincular el chip ${esc(c.letra)}" width="240" height="240">
          <ol class="small asis-pasos"><li>Abrí WhatsApp en el teléfono del <strong>chip ${esc(c.letra)}</strong>.</li><li>Tocá <strong>Dispositivos vinculados</strong> → <strong>Vincular un dispositivo</strong>.</li><li>Escaneá este código. Se renueva solo cada pocos segundos.</li></ol></div>`;
    } else if (c.estado === 'esperando_qr' || c.estado === 'conectando') {
      cuerpo = '<p class="small muted" style="margin:0">Preparando la conexión… esta pantalla se actualiza sola.</p>';
    } else if (c.estado === 'conectado') {
      cuerpo = `<div class="small">Conectado${c.numero ? ` con <strong data-noi18n>${esc(c.numero)}</strong>` : ''}. Abrí WhatsApp en ese teléfono al menos cada 14 días para que no se desvincule.</div>`;
    }
    const cap = c.rol === 'captacion';
    // Responder lo que llegó sin conexión (20/11/2026): estado del pedido
    const rc = c.recuperar;
    const recTxt = rc && rc.vigente ? `<div class="notice info">${icon('refresh')}<span>${c.estado === 'conectado' ? `Respondiendo lo que llegó desde el ${esc(fecha(rc.desde))}: <strong>${rc.respondidos}</strong> ${HH.plural(rc.respondidos, 'chat respondido', 'chats respondidos')}. Va de a uno, espaciados.` : `Para responder lo que llegó desde el ${esc(fecha(rc.desde))}, escaneá el QR del chip ${esc(c.letra)}.`}</span></div>`
      : rc && rc.respondidos ? `<p class="small muted" style="margin:0">Última recuperación: ${rc.respondidos} ${HH.plural(rc.respondidos, 'chat respondido', 'chats respondidos')} (desde el ${esc(fecha(rc.desde))}).</p>` : '';
    return `<section class="card stack asis-chip${c.pausado ? ' pausado' : ''}" style="gap:12px" id="asisChip${esc(c.letra)}">
        <div class="row between" style="gap:10px;flex-wrap:wrap"><div class="row" style="gap:8px;align-items:center"><span class="asis-letra" aria-hidden="true">${esc(c.letra)}</span><div><div class="card-title">Chip ${esc(c.letra)}</div><div class="small muted">${ROL_TXT[c.rol] || c.rol} · ${badgeHtml(lb, cls)}${c.pausado ? ' · <span class="badge neutral">Pausado</span>' : ''}</div></div></div>
          <label class="row small" style="gap:8px;align-items:center">Activo <button type="button" class="switch" role="switch" aria-checked="${!c.pausado}" aria-label="Chip ${esc(c.letra)} activo" data-action="asisChipPausa" data-id="${c.id}"></button></label></div>
        ${c.pausado ? `<p class="small muted" style="margin:0">${cap ? 'No aparece para mandar invitaciones.' : 'El botón de comprar créditos usa otro chip.'} El asistente igual contesta si está vinculado.</p>` : ''}
        ${c.error ? `<div class="notice warn">${icon('alert')}<span>${esc(c.error)}</span></div>` : ''}
        ${recTxt}
        ${cuerpo}
        <div class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end">
          <div class="field" style="margin:0"><label for="asisRol${c.id}">Rol</label><select class="select" id="asisRol${c.id}" data-change="asisChipRol" data-id="${c.id}"><option value="captacion"${cap ? ' selected' : ''}>Captación</option><option value="creditos"${cap ? '' : ' selected'}>Créditos</option></select></div>
          ${cap ? `<div class="field" style="margin:0"><label for="asisPd${c.id}">Invitaciones por día</label><div class="row" style="gap:6px"><input class="input pa-num" id="asisPd${c.id}" type="number" min="1" max="200" step="1" value="${esc(c.porDia)}" style="width:80px"><button type="button" class="btn ghost sm" data-action="asisChipPorDia" data-id="${c.id}">Guardar</button></div></div>` : ''}
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          ${aj.activo ? `<button type="button" class="btn secondary sm" data-action="asisRecuperar" data-id="${c.id}" data-l="${esc(c.letra)}" data-v="${esc(c.ultimoVisto || '')}">${icon('refresh')} Responder lo que llegó sin conexión</button>` : ''}
          ${c.estado === 'conectado' || c.estado === 'esperando_qr' ? `<button type="button" class="btn ghost sm pa-danger" data-action="asisDesvincular" data-id="${c.id}" data-l="${esc(c.letra)}">${icon('x')} Desvincular</button>` : ''}
          ${c.id !== 1 ? `<button type="button" class="btn ghost sm pa-danger" data-action="asisChipQuitar" data-id="${c.id}" data-l="${esc(c.letra)}">${icon('trash')} Quitar chip</button>` : ''}
        </div>
      </section>`;
  }
  function cardChips(d) {
    const aj = d.ajustes || {}; const chs = d.chips || [];
    return `<section class="stack" style="gap:12px" id="asisChips">
        <div class="row between" style="gap:8px;flex-wrap:wrap"><div class="card-title">${icon('phone')} Chips</div>
          <div class="row" style="gap:6px;flex-wrap:wrap"><button type="button" class="btn secondary sm" data-action="asisChipNuevo" data-rol="captacion">${icon('plus')} Chip de captación</button><button type="button" class="btn ghost sm" data-action="asisChipNuevo" data-rol="creditos">${icon('plus')} Chip de créditos</button></div></div>
        <p class="small muted" style="margin:0">Cada chip se vincula con su QR y el asistente atiende todos. Los de <strong>captación</strong> mandan invitaciones (cada uno con su cupo por día) y atienden las respuestas; si hay un chip de <strong>créditos</strong> activo, el botón de comprar créditos usa ese y en los de captación el asistente pasa el link para comprar. Si un chip queda restringido o bloqueado, pausalo.</p>
        <div class="asis-chips">${chs.map((c) => chipCard(c, aj)).join('')}</div>
      </section>`;
  }
  const badgeHtml = (l, cls) => `<span class="badge ${cls}">${l}</span>`;

  // El botón "comprar créditos" del panel de las acompañantes abre WhatsApp con el número vinculado (sin campo a mano)
  function cardBoton(d) {
    const b = d.botonCreditos || {};
    let txt;
    if (b.usa === 'vinculado') txt = `<div class="list-item">${icon('check')}<div class="grow"><div class="title">Usa el número vinculado: <span data-noi18n>${esc(b.vinculado)}</span></div><div class="sub">El del chip de créditos activo; si no hay, el del chip A. Si ese está desvinculado, el de otro chip conectado hasta que vuelva. Cambia solo.</div></div></div>`;
    else if (b.usa === 'guardado') txt = `<div class="notice info">${icon('info')}<span>Hasta que vincules el chip, el botón usa el número que tenías cargado: <strong data-noi18n>${esc(b.guardado)}</strong>.</span></div>`;
    else txt = `<div class="notice warn">${icon('alert')}<span>Todavía no hay número: vinculá el chip del asistente para que el botón de comprar créditos abra WhatsApp.</span></div>`;
    return `<section class="card stack" style="gap:12px" id="asisBoton">
        <div class="card-title">${icon('wallet')} Botón de comprar créditos</div>
        <p class="small muted" style="margin:0">Cuando una acompañante pide créditos desde su panel, se abre WhatsApp con este número y el mensaje del pedido (lo editás en Mensajes).</p>
        ${txt}
        ${b.usa ? `<div class="row">${HH.adminInt ? HH.adminInt.botonProbarWa() : ''}</div>` : ''}
      </section>`;
  }

  // Créditos → Banco (antes en Mensajería → WhatsApp; varias cuentas con rotación desde el 18/11/2026): dos listas,
  // en pesos y en dólares (opcional). Cada cuenta: alias + titular + activa/pausada + lugar (Subir/Bajar). El asistente
  // le pasa a cada pedido nuevo la siguiente cuenta activa de la moneda (por turno) y el pedido se queda con esa.
  // Con alguna activa en dólares, antes pregunta si va a transferir en pesos o en dólares. API: /asistente/cuentas.
  const MONEDA_TXT = { ARS: 'pesos', USD: 'dólares' };
  const activas = (lista) => (lista || []).filter((c) => c.activo);
  function filaCuenta(c, i, n) {
    const nombre = esc(c.alias);
    const estado = !c.activo ? '<span class="badge neutral">Pausada</span>' : c.siguiente && n > 1 ? '<span class="badge info">Le toca al próximo pedido</span>' : '';
    return `<div class="list-item tc-item${c.activo ? '' : ' tc-pausada'}" data-cuenta="${esc(c.id)}">
        <span class="tc-pos" aria-hidden="true">${i + 1}</span>
        <div class="grow tc-datos"><div class="title"><code class="tc-alias" data-noi18n>${nombre}</code> ${estado}</div>
          <div class="sub"><span data-noi18n>${esc(c.titular)}</span> · ${c.pedidos} ${HH.plural(c.pedidos, 'pedido', 'pedidos')}</div></div>
        <div class="row tc-acts">
          <button type="button" class="btn ghost sm pa-icbtn tc-sube" data-action="asisCtaMover" data-id="${esc(c.id)}" data-dir="arriba" aria-label="Subir ${nombre}"${i === 0 ? ' disabled' : ''}>${icon('chevronDown')}</button>
          <button type="button" class="btn ghost sm pa-icbtn" data-action="asisCtaMover" data-id="${esc(c.id)}" data-dir="abajo" aria-label="Bajar ${nombre}"${i === n - 1 ? ' disabled' : ''}>${icon('chevronDown')}</button>
          <label class="tc-sw small"><button type="button" class="switch" role="switch" aria-checked="${!!c.activo}" aria-label="${nombre} activa" data-action="asisCtaActivo" data-id="${esc(c.id)}"></button><span>${c.activo ? 'Activa' : 'Pausada'}</span></label>
          <button type="button" class="btn ghost sm pa-icbtn" data-action="asisCtaEditar" data-id="${esc(c.id)}" aria-label="Editar ${nombre}">${icon('edit')}</button>
          <button type="button" class="btn ghost sm pa-icbtn pa-danger" data-action="asisCtaBorrar" data-id="${esc(c.id)}" aria-label="Borrar ${nombre}">${icon('trash')}</button>
        </div></div>`;
  }
  function bloqueMoneda(d, m) {
    const lista = (d.cuentas && d.cuentas[m]) || [];
    const nAct = activas(lista).length;
    const titulo = m === 'ARS' ? 'En pesos' : 'En dólares <span class="tiny muted" style="font-weight:600">(opcional)</span>';
    const aviso = m === 'ARS'
      ? (!nAct ? `<div class="notice warn">${icon('alert')}<span>${lista.length ? 'Todas las cuentas en pesos están pausadas' : 'No hay cuentas en pesos'}: el asistente responde "En un rato te paso los datos" y te avisa por Telegram.</span></div>` : '')
      : `<p class="tiny muted" style="margin:0">${nAct ? 'Con alguna activa, el asistente primero pregunta si va a transferir en pesos o en dólares.' : 'Sin cuentas activas en dólares, el asistente pasa solo los datos en pesos, sin preguntar.'}</p>`;
    return `<div class="asis-cta" id="bancoCuentas${m}">
        <div class="row between" style="gap:8px"><div class="card-title" style="font-size:15px">${titulo}</div>${lista.length ? `<span class="small muted">${nAct} ${HH.plural(nAct, 'activa', 'activas')} de ${lista.length}</span>` : ''}</div>
        ${aviso}
        ${lista.length ? `<div class="list tc-lista">${lista.map((c, i) => filaCuenta(c, i, lista.length)).join('')}</div>` : ''}
        <div class="row"><button type="button" class="btn secondary sm" data-action="asisCtaNueva" data-m="${m}">${icon('plus')} Agregar cuenta en ${MONEDA_TXT[m]}</button></div>
      </div>`;
  }
  function cardCuenta(d) {
    return `<section class="card stack" style="gap:12px" id="bancoCuenta">
        <div class="card-title">${icon('wallet')} Cuentas para las transferencias</div>
        <p class="small muted" style="margin:0">El asistente le pasa el alias, el titular y el monto a quien manda un pedido de créditos, para que verifique el nombre antes de transferir. Cada pedido nuevo recibe la siguiente cuenta activa, por turno, y se queda con esa aunque después la pauses o la borres. Las acompañantes solo ven el alias y el titular de su pedido.</p>
        ${bloqueMoneda(d, 'ARS')}
        ${bloqueMoneda(d, 'USD')}
      </section>`;
  }
  const cuentaPorId = (id) => { const c = (S.asis && S.asis.cuentas) || {}; return [...(c.ARS || []), ...(c.USD || [])].find((x) => x.id === id) || null; };
  const camposCuenta = (alias, titular, ph) => `<div class="field"><label for="asisCtaAlias">Alias</label><input class="input" id="asisCtaAlias" maxlength="20" autocomplete="off" spellcheck="false" value="${esc(alias || '')}" placeholder="${ph}" data-noi18n><span class="hint">6 a 20 caracteres: letras, números, puntos o guiones.</span></div>
          <div class="field"><label for="asisCtaTitular">Nombre del titular</label><input class="input" id="asisCtaTitular" maxlength="80" autocomplete="off" value="${esc(titular || '')}" placeholder="Nombre y apellido" data-noi18n><span class="hint">Tal como aparece en la cuenta.</span></div>`;
  function formCuenta(m, c) {
    const nueva = !c;
    HH.modal({
      title: nueva ? `Agregar cuenta en ${MONEDA_TXT[m]}` : `Editar cuenta en ${MONEDA_TXT[c.moneda]}`,
      body: `<div class="stack" style="gap:12px">${camposCuenta(c && c.alias, c && c.titular, m === 'USD' ? 'mi.alias.usd' : 'mi.alias.mp')}
          ${nueva ? '<p class="tiny muted" style="margin:0">Entra activa, al final de la lista.</p>' : '<p class="tiny muted" style="margin:0">Los pedidos que ya recibieron esta cuenta siguen mostrando los datos de antes.</p>'}</div>`,
      actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: nueva ? 'Agregar' : 'Guardar cambios', onClick: () => {
        const val = (id) => String((document.getElementById(id) || {}).value || '').trim();
        const alias = val('asisCtaAlias'); const titular = val('asisCtaTitular');
        if (!alias || !titular) { HH.toast('Completá el alias y el nombre del titular.', { type: 'warn' }); return; }
        if (!/^[A-Za-z0-9.-]{6,20}$/.test(alias)) { HH.toast('El alias tiene que tener de 6 a 20 caracteres: letras, números, puntos o guiones.', { type: 'warn' }); return; }
        if (titular.length < 3) { HH.toast('El nombre del titular tiene que tener entre 3 y 80 caracteres.', { type: 'warn' }); return; }
        (nueva ? HH.api('POST', '/asistente/cuentas', { moneda: m, alias, titular }) : HH.api('PUT', '/asistente/cuentas/' + encodeURIComponent(c.id), { alias, titular }))
          .then((d) => { S.asis = d; HH.closeModal(); HH.toast(nueva ? 'Cuenta agregada' : 'Cuenta guardada', { type: 'ok' }); P.refreshResumen(); rerender(); })
          .catch(fail);
      } }],
    });
  }

  // Créditos → Banco: la tarjeta con su carga (S.asis ya se pide al abrir el panel)
  function cuentaCard() {
    load('asis', '/asistente');
    const d = S.asis;
    if (!d && S.err.asis) return errorCard(S.err.asis, 'asis');
    if (!d) return loadingCard(2);
    return cardCuenta(d);
  }
  HH.adminBanco = { cuentaCard };
  // Mensajería → WhatsApp: en lugar de la tarjeta, una línea que lleva a Créditos → Banco (aviso si no hay ninguna cuenta
  // activa en pesos)
  function lineaCuenta(d) {
    const ir = '<a href="#admin.creditos.banco" data-go="#admin.creditos.banco">Créditos → Banco</a>';
    return !activas(d.cuentas && d.cuentas.ARS).length
      ? `<div class="notice warn" id="asisCuentaFalta">${icon('alert')}<span>Falta una cuenta activa en pesos para las transferencias: sin ella, el asistente responde "En un rato te paso los datos" y te avisa por Telegram. Cargala en ${ir}.</span></div>`
      : `<p class="small muted" style="margin:0" id="asisCuentaLink">${icon('wallet')} Las cuentas para las transferencias que pasa el asistente se configuran en ${ir}.</p>`;
  }

  /* ---------- Conversaciones ---------- */
  const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function filtradas() {
    const items = (S.asc && S.asc.items) || [];
    const q = norm(S.asq.trim());
    return items.filter((c) => {
      if (S.asf === 'humano' && estadoChat(c)[0] === 'Asistente') return false;
      if (S.asf === 'bot' && estadoChat(c)[0] !== 'Asistente') return false;
      if (S.asf === 'captacion' && !c.captacion) return false;
      if (!q) return true;
      return [c.telefono, c.cuenta && c.cuenta.nombre, c.cuenta && c.cuenta.email].some((v) => norm(v).includes(q));
    });
  }
  const ultimoHtml = (u) => {
    if (!u) return '<span class="muted">—</span>';
    const quien = u.dir === 'in' ? '' : (u.origen === 'juan' ? 'Vos: ' : u.origen === 'captacion' ? 'Invitación: ' : 'Asistente: ');
    const t = u.texto ? u.texto.replace(/\s+/g, ' ') : ({ imagen: 'Foto', documento: 'Archivo', audio: 'Audio', video: 'Video' }[u.tipo] || 'Mensaje');
    return `<span class="asis-ult"><span class="muted">${quien}</span><span data-noi18n>${esc(t)}</span></span>`;
  };
  const cuentaHtml = (c) => (c.cuenta ? `<span data-noi18n>${esc(c.cuenta.nombre || 'Sin nombre')}</span>` : '<span class="muted">Sin identificar</span>');
  function filas() {
    const items = filtradas();
    if (!items.length) {
      const hay = S.asc && S.asc.items && S.asc.items.length;
      return `<div class="card"><div class="empty">${icon('chat')}<h4>${hay ? 'Sin resultados' : 'Todavía no hay conversaciones'}</h4><p class="small">${hay ? 'Probá con otro filtro o búsqueda.' : 'Cuando una acompañante le escriba al número del asistente, aparece acá.'}</p></div></div>`;
    }
    const go = (c) => `#admin.mensajeria.conversaciones.${esc(c.id)}`;
    const capB = (c) => (c.captacion ? ` <span class="badge info" title="${esc(CAP_ESTADO[c.captacion.estado] || '')}">Captación</span>` : '');
    const chipB = (c) => (c.chip ? `<span class="asis-letra sm" title="Chip ${esc(c.chip)}">${esc(c.chip)}</span> ` : '');
    const tabla = `<div class="table-wrap pa-table"><table class="table"><thead><tr><th>Teléfono</th><th>Cuenta</th><th>Último mensaje</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>
      ${items.map((c) => `<tr class="asis-fila" data-go="${go(c)}"><td class="nowrap">${chipB(c)}<a href="${go(c)}" data-go="${go(c)}" data-noi18n>${esc(c.telefono)}</a></td><td>${cuentaHtml(c)}</td><td class="small">${ultimoHtml(c.ultimo)}</td><td class="nowrap">${chip(c)}${capB(c)}</td><td class="small muted nowrap">${fecha(c.ultimoMensaje || c.creado)}</td></tr>`).join('')}
      </tbody></table></div>`;
    const tarjetas = `<div class="pa-cards">${items.map((c) => `<a class="card stack asis-card" style="gap:6px" href="${go(c)}" data-go="${go(c)}">
        <div class="row between nowrap"><strong data-noi18n>${chipB(c)}${esc(c.telefono)}</strong><span class="nowrap">${chip(c)}${capB(c)}</span></div>
        <div class="small">${cuentaHtml(c)}</div>
        <div class="small">${ultimoHtml(c.ultimo)}</div>
        <div class="tiny muted">${fecha(c.ultimoMensaje || c.creado)}</div></a>`).join('')}</div>`;
    return tabla + tarjetas;
  }

  const RIGHT = (k) => `<div class="row" style="gap:8px">${recargar(k)}</div>`;
  const vista = (sub, inner) => layout('mensajeria', `${head('Mensajería', RIGHT(sub === 'conversaciones' || sub === 'whatsapp' ? 'todo' : sub), SUBTITULO[sub])}<div class="stack" style="gap:16px">${inner}</div>`);
  const SUBTITULO = {
    conversaciones: 'Chats del asistente de WhatsApp con las acompañantes: pedidos de créditos, comprobantes, preguntas y respuestas a las invitaciones',
    whatsapp: 'Los chips del asistente: captación y créditos, conexión, cupos, prendido o apagado y botón de comprar créditos',
    telegram: 'Tus avisos por Telegram y el usuario de Telegram para comprar créditos',
    mensajes: 'El mensaje del pedido de créditos y el de la invitación de captación',
  };

  function vConversaciones() {
    load('asis', '/asistente'); load('asc', '/asistente/conversaciones');
    const d = S.asis;
    let body;
    if (!d && S.err.asis) body = errorCard(S.err.asis, 'asis');
    else if (!d) body = loadingCard(3);
    else {
      const items = (S.asc && S.asc.items) || [];
      const nH = items.filter((c) => estadoChat(c)[0] !== 'Asistente').length;
      const nC = items.filter((c) => c.captacion).length;
      const f = (k, l, n) => `<button type="button" class="chip${S.asf === k ? ' active' : ''}" data-action="asisFiltro" data-f="${k}" aria-pressed="${S.asf === k}">${l}${n != null ? ` <span class="badge" style="padding:0 6px">${n}</span>` : ''}</button>`;
      const w = d.whatsapp || {}; const aj = d.ajustes || {};
      const aviso = !aj.activo ? `<div class="notice warn">${icon('alert')}<span>El asistente está apagado: no responde los chats. Prendelo en <a href="#admin.mensajeria.whatsapp" data-go="#admin.mensajeria.whatsapp">WhatsApp</a>.</span></div>`
        : (d.chips || []).some((c) => c.estado !== 'conectado') ? `<div class="notice warn">${icon('alert')}<span>${(d.chips || []).filter((c) => c.estado !== 'conectado').map((c) => 'Chip ' + esc(c.letra)).join(', ')}: sin conectar. Revisalo en <a href="#admin.mensajeria.whatsapp" data-go="#admin.mensajeria.whatsapp">WhatsApp</a>.</span></div>` : '';
      const conv = !S.asc && S.err.asc ? errorCard(S.err.asc, 'asc') : !S.asc ? loadingCard(2) : `<div class="adm-filters">
            <label class="sr-only" for="asisQ">Buscar conversación</label><input class="input" id="asisQ" type="search" placeholder="Buscar por nombre o últimos números" value="${esc(S.asq)}" data-input="asisBuscar" autocomplete="off">
            <div class="chips scroll" style="flex:1 1 auto;min-width:0">${f('todas', 'Todas', items.length)}${f('humano', 'Con una persona', nH)}${f('bot', 'Con el asistente', items.length - nH)}${f('captacion', 'Captación', nC)}</div>
          </div>
          <div id="asisFilas">${filas()}</div>`;
      body = `${aviso}<section class="stack" style="gap:12px">${conv}</section>`;
    }
    setTimeout(vigilar, 0);
    return vista('conversaciones', body);
  }

  function vWhatsApp() {
    load('asis', '/asistente');
    const d = S.asis;
    let body;
    if (!d && S.err.asis) body = errorCard(S.err.asis, 'asis');
    else if (!d) body = loadingCard(3);
    else body = `<div class="asis-top">${cardEstado(d)}${cardBoton(d)}</div>${cardChips(d)}${lineaCuenta(d)}`;
    setTimeout(vigilar, 0);
    return vista('whatsapp', body);
  }

  function vTelegram() {
    return vista('telegram', `${HH.adminInt ? HH.adminInt.telegramCard() : ''}${P.telegramContactoCard()}`);
  }

  function vMensajes() {
    return vista('mensajes', `${P.mensajesCreditosCard()}${HH.adminCap ? HH.adminCap.mensajeCard() : ''}`);
  }

  /* ---------- Una conversación ---------- */
  function vConversacion(id) {
    const k = 'asd:' + id; load(k, '/asistente/conversaciones/' + encodeURIComponent(id));
    const d = S[k];
    let body;
    if (!d && S.err[k]) body = errorCard(S.err[k], k);
    else if (!d) body = loadingCard(4);
    else {
      const c = d.conversacion;
      const msgs = (d.mensajes || []).map((m) => {
        const quien = m.dir === 'in' ? (c.cuenta && c.cuenta.nombre ? c.cuenta.nombre : c.telefono) : ORIGEN[m.origen];
        const archivo = m.archivo ? `<div class="pa-priv asis-adj" data-blob="/asistente/conversaciones/${esc(c.id)}/mensajes/${esc(m.id)}/archivo" data-alt="Comprobante">${loadingCard(1)}</div>` : '';
        const tipo = !m.archivo && m.tipo !== 'texto' ? `<div class="small muted">${esc({ imagen: 'Foto', documento: 'Archivo', audio: 'Audio', video: 'Video' }[m.tipo] || 'Mensaje')} (no se guarda${m.tipo === 'audio' ? ': escuchalo en el teléfono del chip' : ''})</div>` : '';
        // Audio (23/11/2026): Juan escribe lo que dijo y el agente responde con eso
        const audio = m.dir === 'in' && m.tipo === 'audio';
        const cuerpo = audio
          ? (m.texto
            ? `<div class="tiny muted">Lo que dijo (lo escribiste vos):</div><div class="pa-pre" data-noi18n>${esc(m.texto)}</div>`
            : `<div class="field" style="margin-top:6px"><label class="tiny muted" for="asisAudio${esc(m.id)}">Lo que dijo en el audio</label><textarea class="textarea" id="asisAudio${esc(m.id)}" rows="3" maxlength="2000" placeholder="Escribí lo que dijo y el agente le responde con eso"></textarea></div>
               <div class="row" style="margin-top:6px"><button type="button" class="btn sm" data-action="asisAudio" data-id="${esc(c.id)}" data-m="${esc(m.id)}">${icon('send')} Guardar y que responda el agente</button></div>`)
          : (m.texto ? `<div class="pa-pre" data-noi18n>${esc(m.texto)}</div>` : '');
        return `<div class="mod-msg ${m.dir === 'in' ? 'cli' : 'aco'}${m.origen === 'juan' ? ' asis-juan' : ''}"><div class="small"><strong data-noi18n>${esc(quien)}</strong> <span class="tiny muted">${fecha(m.creado)}</span></div>
          ${archivo}${tipo}${cuerpo}</div>`;
      }).join('');
      const chat = `<section class="card stack" style="gap:10px"><div class="row between"><div class="card-title">${icon('chat')} Chat</div><span class="small muted">${(d.mensajes || []).length} mensajes</span></div>
          <div class="mod-chat">${msgs || '<p class="small muted">Sin mensajes.</p>'}</div>
          <p class="tiny muted">Los mensajes y archivos se borran a los 90 días. Para escribirle, usá el teléfono del asistente.</p></section>`;
      const humano = c.estado === 'humano';
      const lado = `<section class="card stack" style="gap:12px">
          <div class="row between"><div class="card-title">${icon('user')} Datos</div>${chip(c)}</div>
          <dl class="pa-dl">
            <div><dt>Teléfono</dt><dd data-noi18n>${esc(c.telefono)}</dd></div>
            <div><dt>Cuenta</dt><dd>${c.cuenta ? `${linkCuenta(c.cuenta.id, c.cuenta.nombre || 'Sin nombre')} <span class="tiny muted">${c.identificadoPor === 'email' ? 'por email' : 'por el teléfono del perfil'}</span>` : '<span class="muted">Sin identificar</span>'}</dd></div>
            <div><dt>Idioma</dt><dd>${esc({ es: 'Español', en: 'Inglés', pt: 'Portugués' }[c.idioma] || c.idioma)}</dd></div>
            ${humano && c.motivoHumano ? `<div><dt>Motivo</dt><dd data-noi18n>${esc(c.motivoHumano)}</dd></div>` : ''}
            ${c.captacion ? `<div><dt>Captación</dt><dd><a href="#admin.mensajeria.captacion" data-go="#admin.mensajeria.captacion">${esc(CAP_ESTADO[c.captacion.estado] || c.captacion.estado)}</a> <span class="tiny muted">(la invitaste desde Captación)</span></dd></div>` : ''}
            ${c.silenciadoHasta ? `<div><dt>En silencio hasta</dt><dd>${fecha(c.silenciadoHasta)} <span class="tiny muted">(escribiste desde el teléfono)</span></dd></div>` : ''}
          </dl>
          ${(() => { const ms = d.mensajes || []; const ult = ms[ms.length - 1]; return ult && ult.dir === 'in'
            ? `<div class="row" style="gap:8px"><button type="button" class="btn sm" data-action="asisResponder" data-id="${esc(c.id)}">${icon('refresh')} Agente responda último mensaje</button></div>
               <p class="tiny muted">El agente contesta ahora el último mensaje, leyendo todo el chat (también lo que escribiste vos), y sigue él con este chat.</p>`
            : ''; })()}
          <div class="row" style="gap:8px">${humano || c.silenciadoHasta
            ? `<button type="button" class="btn sm" data-action="asisHumano" data-id="${esc(c.id)}" data-v="0">${icon('refresh')} Devolver al asistente</button>`
            : `<button type="button" class="btn secondary sm" data-action="asisHumano" data-id="${esc(c.id)}" data-v="1">${icon('user')} Pasar a humano</button>`}</div>
          <p class="tiny muted">Con una persona, el asistente no responde en este chat hasta que lo devuelvas.</p>
        </section>
        ${(d.pedidos || []).length ? `<section class="card stack" style="gap:10px"><div class="card-title">${icon('wallet')} Pedidos nombrados en el chat</div><div class="list">${d.pedidos.map((p) => `<a class="list-item small" href="#admin.creditos.pedidos" data-go="#admin.creditos.pedidos"><div class="grow"><strong data-noi18n>${esc(p.codigo)}</strong> · <span data-noi18n>${esc(p.pack)}</span>${p.moneda ? ` <span class="tiny muted">· en ${p.moneda === 'USD' ? 'dólares' : 'pesos'}</span>` : ''}${p.cuenta ? ` <span class="tiny muted">· alias <span data-noi18n>${esc(p.cuenta.alias)}</span> (${esc(p.cuenta.titular)})</span>` : ''}${p.comprobante ? ` <span class="tiny muted">· con comprobante</span>` : ''}</div>${P.badge(ESTADO_PED[p.estado], p.estado)}</a>`).join('')}</div></section>` : ''}`;
      body = `<div class="pa-detail"><div class="stack" style="gap:14px">${chat}</div><div class="stack" style="gap:14px">${lado}</div></div>`;
    }
    const right = `<div class="row" style="gap:8px"><a class="btn ghost sm" href="#admin.mensajeria.conversaciones" data-go="#admin.mensajeria.conversaciones">${icon('arrowLeft')} Todas</a>${recargar(k)}</div>`;
    return layout('mensajeria', `${head('Conversación', right, d ? esc(d.conversacion.telefono) : '')}${body}`);
  }

  /* ---------- Vistas, rutas y acciones ---------- */
  Object.assign(P.subvistas, {
    'mensajeria.conversaciones': vConversaciones, 'mensajeria.whatsapp': vWhatsApp, 'mensajeria.telegram': vTelegram, 'mensajeria.mensajes': vMensajes,
  });
  HH.route('admin.mensajeria.conversaciones.:id', ({ id }) => (HH.requireRole('admin') ? vConversacion(id) : false));

  const cuentaApi = (metodo, id, sufijo, datos, ok) => HH.api(metodo, '/asistente/cuentas/' + encodeURIComponent(id) + sufijo, datos)
    .then((d) => { S.asis = d; if (ok) HH.toast(ok, { type: 'ok' }); P.refreshResumen(); rerender(); }).catch(fail);
  const guardarAjustes = (cambios) => {
    const aj = { ...((S.asis && S.asis.ajustes) || {}), ...cambios };
    return HH.api('PUT', '/asistente/ajustes', aj).then((d) => { S.asis = d; P.refreshResumen(); rerender(); vigilar(); return d; });
  };
  Object.assign(HH.actions, {
    asisRecargar(el) {
      const k = el.dataset.k;
      if (k === 'todo' || k === 'asis' || k === 'asc') { load('asis', '/asistente', true); load('asc', '/asistente/conversaciones', true); }
      else if (k === 'telegram') { if (HH.actions.intTgRecargar) HH.actions.intTgRecargar(); load('aj', '/ajustes', true); }
      else if (k === 'mensajes') { load('aj', '/ajustes', true); load('cap', '/captacion', true); }
      else load(k, '/asistente/conversaciones/' + encodeURIComponent(k.slice(4)), true);
    },
    asisFiltro(el) { S.asf = el.dataset.f; HH.refresh(); },
    asisBuscar(el) { S.asq = el.value; const box = document.getElementById('asisFilas'); if (box) box.innerHTML = filas(); },
    asisActivo(el) {
      const prender = el.getAttribute('aria-checked') !== 'true';
      el.disabled = true;
      guardarAjustes({ activo: prender }).then(() => HH.toast(prender ? 'Asistente prendido' : 'Asistente apagado', { type: 'ok' })).catch(fail).finally(() => { el.disabled = false; });
    },
    // Cuentas para las transferencias (Créditos → Banco)
    asisCtaNueva(el) { formCuenta(el.dataset.m === 'USD' ? 'USD' : 'ARS', null); },
    asisCtaEditar(el) { const c = cuentaPorId(el.dataset.id); if (c) formCuenta(c.moneda, c); },
    asisCtaActivo(el) {
      const c = cuentaPorId(el.dataset.id); if (!c) return;
      el.disabled = true;
      cuentaApi('PUT', c.id, '', { activo: !c.activo }, c.activo ? 'Cuenta pausada: no se pasa a pedidos nuevos' : 'Cuenta activa otra vez').finally(() => { el.disabled = false; });
    },
    asisCtaMover(el) { cuentaApi('POST', el.dataset.id, '/mover', { dir: el.dataset.dir === 'arriba' ? 'arriba' : 'abajo' }, null); },
    asisCtaBorrar(el) {
      const c = cuentaPorId(el.dataset.id); if (!c) return;
      HH.confirm({ title: 'Borrar ' + c.alias, text: '<span>Deja de pasarse a pedidos nuevos.</span> <span>Los pedidos que ya la recibieron siguen mostrando este alias y titular. Si solo querés dejar de usarla un tiempo, pausala.</span>', okLabel: 'Borrar', cls: 'danger', onOk: () => {
        cuentaApi('DELETE', c.id, '', {}, 'Cuenta borrada');
      } });
    },
    asisDesvincular(el) {
      const chip = Number(el.dataset.id) || 1; const l = el.dataset.l || 'A';
      HH.confirm({ title: `Desvincular el chip ${l}`, text: `<span>Se cierra la sesión del asistente en el teléfono del chip ${l}.</span> <span>Para volver a conectarlo hay que escanear el QR de nuevo.</span>`, okLabel: 'Desvincular', cls: 'danger', onOk: () => {
        HH.api('POST', '/asistente/desvincular', { chip }).then((d) => { S.asis = d; HH.toast('Desvinculando…', { type: 'ok' }); rerender(); vigilar(); }).catch(fail);
      } });
    },
    // Responder lo que llegó sin conexión (20/11/2026): elige desde cuándo; se desvincula y al escanear el QR responde
    asisRecuperar(el) {
      const id = el.dataset.id; const l = el.dataset.l;
      const local = (d) => { const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return x.toISOString().slice(0, 16); };
      const base = el.dataset.v ? new Date(el.dataset.v) : new Date(Date.now() - 24 * 3600 * 1000);
      HH.modal({ title: `Responder lo que llegó sin conexión · chip ${l}`, body: `<div class="stack" style="gap:12px">
          <p class="small" style="margin:0">Los mensajes que llegaron mientras el chip no estaba vinculado no le llegan al asistente. WhatsApp los manda cuando se vincula de nuevo: por eso <strong>se desvincula el chip ${esc(l)}</strong> y tenés que <strong>escanear el QR otra vez</strong>.</p>
          <p class="small muted" style="margin:0">Después, el asistente contesta los chats cuyo último mensaje es de la otra persona y llegó desde la fecha que elijas, de a uno y espaciados (alrededor de un minuto entre chat y chat), con una disculpa breve por la demora. Los chats que ya respondiste vos se saltean. Puede que WhatsApp no mande todos los mensajes viejos.</p>
          <div class="field"><label for="asisRecDesde">Desde</label><input class="input" id="asisRecDesde" type="datetime-local" value="${esc(local(base))}" max="${esc(local(new Date()))}"></div>
          <p class="tiny muted" style="margin:0">Sugerido: el último mensaje que vio el asistente en este chip.</p>
        </div>`, actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: 'Desvincular y responder', onClick: (btn) => {
          const v = (document.getElementById('asisRecDesde') || {}).value;
          const d = v ? new Date(v) : null;
          if (!d || Number.isNaN(d.getTime())) { HH.toast('Elegí desde cuándo.', { type: 'warn' }); return; }
          if (btn) btn.disabled = true;
          HH.api('POST', '/asistente/chips/' + encodeURIComponent(id) + '/recuperar', { desde: d.toISOString() })
            .then((r) => { S.asis = r; HH.closeModal(); HH.toast(`Chip ${l} desvinculado: escaneá el QR`, { type: 'ok' }); rerender(); vigilar(); })
            .catch((e) => { if (btn) btn.disabled = false; fail(e); });
        } }] });
    },
    // Chips (19/11/2026)
    asisChipNuevo(el) {
      const rol = el.dataset.rol === 'creditos' ? 'creditos' : 'captacion';
      HH.confirm({ title: rol === 'creditos' ? 'Agregar chip de créditos' : 'Agregar chip de captación', text: '<span>Se agrega con la letra siguiente y aparece su QR para vincularlo.</span> <span>Antes de usarlo para invitar, conviene usarlo unos días de forma normal.</span>', okLabel: 'Agregar', onOk: () => {
        HH.api('POST', '/asistente/chips', { rol }).then((d) => { S.asis = d; const c = (d.chips || []).slice(-1)[0]; HH.toast(`Chip ${c ? c.letra : ''} agregado`, { type: 'ok' }); rerender(); vigilar(); }).catch(fail);
      } });
    },
    asisChipPausa(el) {
      const id = el.dataset.id; const pausar = el.getAttribute('aria-checked') === 'true';
      el.disabled = true;
      HH.api('PUT', '/asistente/chips/' + encodeURIComponent(id), { pausado: pausar }).then((d) => { S.asis = d; HH.toast(pausar ? 'Chip pausado' : 'Chip activo', { type: 'ok' }); rerender(); }).catch(fail).finally(() => { el.disabled = false; });
    },
    asisChipPorDia(el) {
      const id = el.dataset.id; const n = Number((document.getElementById('asisPd' + id) || {}).value);
      if (!Number.isInteger(n) || n < 1 || n > 200) { HH.toast('Por día: un número entero de 1 a 200.', { type: 'warn' }); return; }
      HH.api('PUT', '/asistente/chips/' + encodeURIComponent(id), { porDia: n }).then((d) => { S.asis = d; HH.toast(`${n} invitaciones por día`, { type: 'ok' }); rerender(); }).catch(fail);
    },
    asisChipRol(el) {
      const id = el.dataset.id;
      HH.api('PUT', '/asistente/chips/' + encodeURIComponent(id), { rol: el.value }).then((d) => { S.asis = d; HH.toast('Rol guardado', { type: 'ok' }); rerender(); }).catch(fail);
    },
    asisChipQuitar(el) {
      const id = el.dataset.id; const l = el.dataset.l;
      HH.confirm({ title: `Quitar el chip ${l}`, text: '<span>El asistente se desconecta de ese chip y se borra su sesión.</span> <span>Sus chats quedan en Conversaciones. La letra no se vuelve a usar.</span>', okLabel: 'Quitar chip', cls: 'danger', onOk: () => {
        HH.api('DELETE', '/asistente/chips/' + encodeURIComponent(id), {}).then((d) => { S.asis = d; HH.toast(`Chip ${l} quitado`, { type: 'ok' }); rerender(); }).catch(fail);
      } });
    },
    asisAudio(el) {
      const id = el.dataset.id; const mid = el.dataset.m;
      const ta = document.getElementById('asisAudio' + mid);
      const texto = ta ? ta.value.trim() : '';
      if (!texto) { HH.toast('Escribí lo que dijo en el audio.', { type: 'warn' }); return; }
      const recargar = () => { load('asd:' + id, '/asistente/conversaciones/' + encodeURIComponent(id), true); load('asc', '/asistente/conversaciones', true); };
      el.disabled = true;
      HH.api('POST', '/asistente/conversaciones/' + encodeURIComponent(id) + '/mensajes/' + encodeURIComponent(mid) + '/audio', { texto })
        .then((r) => {
          if (r && r.responde) { HH.toast('Guardado: el agente está respondiendo', { type: 'ok' }); setTimeout(recargar, 6000); setTimeout(recargar, 15000); }
          else HH.toast(`Guardado. ${(r && r.aviso) || 'El agente no pudo responder ahora.'}`, { type: 'warn' });
          recargar();
        }).catch((x) => { el.disabled = false; fail(x); });
    },
    asisResponder(el) {
      const id = el.dataset.id;
      const recargar = () => { load('asd:' + id, '/asistente/conversaciones/' + encodeURIComponent(id), true); load('asc', '/asistente/conversaciones', true); };
      el.disabled = true;
      HH.api('POST', '/asistente/conversaciones/' + encodeURIComponent(id) + '/responder', {})
        .then(() => {
          HH.toast('El agente está respondiendo este chat', { type: 'ok' });
          recargar();
          // La respuesta tarda unos segundos (escribiendo… + la IA): se vuelve a mirar
          setTimeout(recargar, 6000); setTimeout(recargar, 15000);
        }).catch((x) => { el.disabled = false; fail(x); });
    },
    asisHumano(el) {
      const id = el.dataset.id; const humano = el.dataset.v === '1';
      HH.api('POST', '/asistente/conversaciones/' + encodeURIComponent(id) + '/humano', { humano })
        .then(() => {
          HH.toast(humano ? 'El asistente no responde más en este chat' : 'El asistente vuelve a responder en este chat', { type: 'ok' });
          load('asd:' + id, '/asistente/conversaciones/' + encodeURIComponent(id), true); load('asc', '/asistente/conversaciones', true); load('asis', '/asistente', true);
        }).catch(fail);
    },
  });

  /* ---------- Estilos ---------- */
  const st = document.createElement('style');
  st.textContent = `
.asis-top{display:grid;gap:14px;grid-template-columns:minmax(0,1fr)}
@media(min-width:1100px){.asis-top{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start}}
.asis-qr-wrap{display:flex;gap:16px;flex-wrap:wrap;align-items:center}
.asis-chips{display:grid;gap:14px;grid-template-columns:minmax(0,1fr)}
@media(min-width:1100px){.asis-chips{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start}}
.asis-chip.pausado{opacity:.75}
.asis-letra{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:10px;background:var(--accent-soft,rgba(255,92,138,.15));color:var(--accent,#ff5c8a);font-weight:800;font-size:16px;flex:0 0 auto}
.asis-letra.sm{width:22px;height:22px;border-radius:6px;font-size:12px;vertical-align:middle}
.asis-qr{width:240px;height:240px;max-width:100%;background:#fff;border-radius:12px;padding:8px;box-sizing:border-box}
.asis-pasos{margin:0;padding-left:18px;display:grid;gap:6px;flex:1 1 200px}
.asis-ult{display:inline-block;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom}
.asis-fila{cursor:pointer}
.asis-card{color:inherit;text-decoration:none}.asis-card .asis-ult{max-width:100%}
.asis-juan{border-style:dashed}
.asis-cta{display:grid;gap:10px;padding-top:12px;border-top:1px solid var(--line)}
.tc-lista{display:grid;gap:8px}
.tc-item{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.tc-pos{flex:none;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:700;background:var(--line);color:var(--ink-2,inherit)}
.tc-datos{min-width:0;flex:1 1 220px}.tc-alias{overflow-wrap:anywhere}
.tc-pausada .tc-datos{opacity:.65}
.tc-acts{gap:4px;flex-wrap:nowrap;align-items:center;margin-left:auto}
.tc-sube svg{transform:rotate(180deg)}
.tc-sw{display:inline-flex;align-items:center;gap:6px;margin:0 6px;cursor:pointer}.tc-sw span{min-width:56px}
@media(max-width:640px){.tc-acts{width:100%;justify-content:flex-end;padding-left:34px}}
.asis-adj{min-height:80px;max-width:260px}.asis-adj img{max-height:260px}
`;
  document.head.appendChild(st);
})();
