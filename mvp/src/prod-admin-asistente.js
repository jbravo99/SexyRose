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
  const CAP_ESTADO = { pendiente: 'Pendiente', abierto: 'Abierto', enviado: 'Enviado', respondio: 'Respondió', se_registro: 'Se registró', no_escribir: 'No escribir', revisar: 'Revisar', descartado: 'Descartado', en_sitio: 'Ya está en el sitio' };
  const ESTADO_PED = { pendiente: ['Esperando pago', 'warn'], confirmado: ['Acreditado', 'ok'], vencido: ['Vencido', 'neutral'], cancelado: ['Cancelado', 'neutral'], rechazado: ['Rechazado', 'danger'] };
  const estadoChat = (c) => (c.estado === 'humano' ? ['Persona', 'warn'] : c.silenciadoHasta ? ['En silencio', 'info'] : ['Asistente', 'ok']);
  const chip = (c) => { const [l, cls] = estadoChat(c); return `<span class="badge ${cls}">${l}</span>`; };

  // Mientras se espera el QR o la conexión, el estado se consulta cada 3 s.
  let poll = null;
  function vigilar() {
    const e = S.asis && S.asis.whatsapp && S.asis.whatsapp.estado;
    const hace = S.asis && S.asis.ajustes && S.asis.ajustes.activo && (e === 'esperando_qr' || e === 'conectando' || e === 'desconectado');
    if (hace && !poll) {
      poll = setInterval(() => {
        if (!enVista()) { clearInterval(poll); poll = null; return; }
        HH.api('GET', '/asistente').then((d) => {
          const antes = S.asis && S.asis.whatsapp.estado; S.asis = d;
          if (antes !== 'conectado' && d.whatsapp.estado === 'conectado') HH.toast('WhatsApp conectado', { type: 'ok' });
          if (/^admin\.mensajeria\.(whatsapp|conversaciones)$/.test(HH.current.path)) rerender();
          vigilar();
        }).catch(() => {});
      }, 3000);
    } else if (!hace && poll) { clearInterval(poll); poll = null; }
  }

  /* ---------- Estado y ajustes ---------- */
  function cardEstado(d) {
    const w = d.whatsapp || {}; const aj = d.ajustes || {};
    const [lb, cls] = ESTADO_WA[w.estado] || ESTADO_WA.desconectado;
    let cuerpo = '';
    if (aj.activo && !w.agente) {
      cuerpo = `<div class="notice danger">${icon('alert')}<span>El asistente no está corriendo en el servidor (contenedor <code>agente</code>). Revisá el deploy y los logs.</span></div>`;
    } else if (w.estado === 'esperando_qr' && w.qrSvg) {
      cuerpo = `<div class="asis-qr-wrap"><img class="asis-qr" src="${esc(w.qrSvg)}" alt="Código QR para vincular WhatsApp" width="240" height="240">
          <ol class="small asis-pasos"><li>Abrí WhatsApp en el teléfono del chip del asistente.</li><li>Tocá <strong>Dispositivos vinculados</strong> → <strong>Vincular un dispositivo</strong>.</li><li>Escaneá este código. Se renueva solo cada pocos segundos.</li></ol></div>`;
    } else if (w.estado === 'esperando_qr' || w.estado === 'conectando') {
      cuerpo = `<p class="small muted" style="margin:0">Preparando la conexión… esta pantalla se actualiza sola.</p>`;
    } else if (w.estado === 'conectado') {
      cuerpo = `<div class="list-item">${icon('check')}<div class="grow"><div class="title">Conectado${w.numero ? ` con <span data-noi18n>${esc(w.numero)}</span>` : ''}</div><div class="sub">Responde los chats de las acompañantes. Abrí WhatsApp en ese teléfono al menos cada 14 días para que no se desvincule.</div></div></div>`;
    } else if (!aj.activo) {
      cuerpo = `<p class="small muted" style="margin:0">Apagado: no se conecta a WhatsApp y no responde. Al prenderlo aparece el QR para vincular el chip (si no estaba vinculado).</p>`;
    }
    const ia = d.ia || {};
    return `<section class="card stack" style="gap:12px" id="asisEstado">
        <div class="row between" style="gap:12px;flex-wrap:nowrap"><div class="grow"><div class="card-title">${icon('whatsapp')} Asistente de cuenta</div><div class="small muted">${aj.activo ? 'Prendido' : 'Apagado'} · ${badgeHtml(lb, cls)}</div></div>
          <button type="button" class="switch" role="switch" aria-checked="${!!aj.activo}" aria-label="Asistente prendido" data-action="asisActivo"></button></div>
        ${w.error ? `<div class="notice warn">${icon('alert')}<span>${esc(w.error)}</span></div>` : ''}
        ${cuerpo}
        <div class="small muted">IA: ${ia.configurada ? `activa (<code>${esc(ia.modelo || '')}</code>)` : 'sin <code>ANTHROPIC_API_KEY</code>: responde solo los pedidos y comprobantes; lo demás te lo pasa a vos.'}</div>
        ${w.estado === 'conectado' || w.estado === 'esperando_qr' ? `<div class="row"><button type="button" class="btn ghost sm pa-danger" data-action="asisDesvincular">${icon('x')} Desvincular</button></div>` : ''}
      </section>`;
  }
  const badgeHtml = (l, cls) => `<span class="badge ${cls}">${l}</span>`;

  // El botón "comprar créditos" del panel de las acompañantes abre WhatsApp con el número vinculado (sin campo a mano)
  function cardBoton(d) {
    const b = d.botonCreditos || {};
    let txt;
    if (b.usa === 'vinculado') txt = `<div class="list-item">${icon('check')}<div class="grow"><div class="title">Usa el número vinculado: <span data-noi18n>${esc(b.vinculado)}</span></div><div class="sub">Se toma solo del chip del asistente. Si vinculás otro chip, el botón cambia solo.</div></div></div>`;
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
    const tabla = `<div class="table-wrap pa-table"><table class="table"><thead><tr><th>Teléfono</th><th>Cuenta</th><th>Último mensaje</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>
      ${items.map((c) => `<tr class="asis-fila" data-go="${go(c)}"><td class="nowrap"><a href="${go(c)}" data-go="${go(c)}" data-noi18n>${esc(c.telefono)}</a></td><td>${cuentaHtml(c)}</td><td class="small">${ultimoHtml(c.ultimo)}</td><td class="nowrap">${chip(c)}${capB(c)}</td><td class="small muted nowrap">${fecha(c.ultimoMensaje || c.creado)}</td></tr>`).join('')}
      </tbody></table></div>`;
    const tarjetas = `<div class="pa-cards">${items.map((c) => `<a class="card stack asis-card" style="gap:6px" href="${go(c)}" data-go="${go(c)}">
        <div class="row between nowrap"><strong data-noi18n>${esc(c.telefono)}</strong><span class="nowrap">${chip(c)}${capB(c)}</span></div>
        <div class="small">${cuentaHtml(c)}</div>
        <div class="small">${ultimoHtml(c.ultimo)}</div>
        <div class="tiny muted">${fecha(c.ultimoMensaje || c.creado)}</div></a>`).join('')}</div>`;
    return tabla + tarjetas;
  }

  const RIGHT = (k) => `<div class="row" style="gap:8px">${recargar(k)}</div>`;
  const vista = (sub, inner) => layout('mensajeria', `${head('Mensajería', RIGHT(sub === 'conversaciones' || sub === 'whatsapp' ? 'todo' : sub), SUBTITULO[sub])}<div class="stack" style="gap:16px">${inner}</div>`);
  const SUBTITULO = {
    conversaciones: 'Chats del asistente de WhatsApp con las acompañantes: pedidos de créditos, comprobantes, preguntas y respuestas a las invitaciones',
    whatsapp: 'El número del asistente (un solo chip para todo): conexión, prendido o apagado y botón de comprar créditos',
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
        : w.estado !== 'conectado' ? `<div class="notice warn">${icon('alert')}<span>WhatsApp no está conectado. Revisalo en <a href="#admin.mensajeria.whatsapp" data-go="#admin.mensajeria.whatsapp">WhatsApp</a>.</span></div>` : '';
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
    else body = `<div class="asis-top">${cardEstado(d)}${cardBoton(d)}</div>${lineaCuenta(d)}`;
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
        const tipo = !m.archivo && m.tipo !== 'texto' ? `<div class="small muted">${esc({ imagen: 'Foto', documento: 'Archivo', audio: 'Audio', video: 'Video' }[m.tipo] || 'Mensaje')} (no se guarda)</div>` : '';
        return `<div class="mod-msg ${m.dir === 'in' ? 'cli' : 'aco'}${m.origen === 'juan' ? ' asis-juan' : ''}"><div class="small"><strong data-noi18n>${esc(quien)}</strong> <span class="tiny muted">${fecha(m.creado)}</span></div>
          ${archivo}${tipo}${m.texto ? `<div class="pa-pre" data-noi18n>${esc(m.texto)}</div>` : ''}</div>`;
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
    asisDesvincular() {
      HH.confirm({ title: 'Desvincular WhatsApp', text: '<span>Se cierra la sesión del asistente en el teléfono del chip.</span> <span>Para volver a conectarlo hay que escanear el QR de nuevo.</span>', okLabel: 'Desvincular', cls: 'danger', onOk: () => {
        HH.api('POST', '/asistente/desvincular', {}).then((d) => { S.asis = d; HH.toast('Desvinculando…', { type: 'ok' }); rerender(); vigilar(); }).catch(fail);
      } });
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
