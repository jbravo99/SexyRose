/* ============================================================
   SexyRose — prod-admin-asistente.js (admin real, 15/11/2026; Mensajería desde el 16/11/2026)
   Admin → Mensajería (antes "Asistente"), pestañas:
   - Conversaciones: los chats del asistente de cuenta por WhatsApp ("Pasar a humano" / "Devolver al asistente",
     pedidos nombrados en el chat) con el filtro "Captación".
   - WhatsApp: el único número (chip) del asistente: estado y QR para vincularlo, "Desvincular", prendido/apagado, el
     número que usa el botón de comprar créditos y la cuenta para las transferencias (pesos y, opcional, dólares).
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
  const modalAbierto = () => document.getElementById('modalRoot').classList.contains('open');
  const rerender = () => { if (enVista() && !modalAbierto()) HH.refresh(); };
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

  // En pesos (alias, titular: como siempre) y en dólares (aliasUsd, titularUsd: opcional). Con la de dólares cargada, el
  // asistente primero pregunta si va a transferir en pesos o en dólares.
  const camposCuenta = (pre, alias, titular, ph) => `<div class="grid-2" style="align-items:start"><div class="field"><label for="${pre}Alias">Alias</label><input class="input" id="${pre}Alias" maxlength="20" autocomplete="off" spellcheck="false" value="${esc(alias || '')}" placeholder="${ph}" data-noi18n><span class="hint">6 a 20 caracteres: letras, números, puntos o guiones.</span></div>
          <div class="field"><label for="${pre}Titular">Nombre del titular</label><input class="input" id="${pre}Titular" maxlength="80" autocomplete="off" value="${esc(titular || '')}" placeholder="Nombre y apellido" data-noi18n><span class="hint">Tal como aparece en la cuenta.</span></div></div>`;
  function cardCuenta(d) {
    const aj = d.ajustes || {};
    const falta = !aj.alias || !aj.titular;
    return `<section class="card stack" style="gap:12px">
        <div class="card-title">${icon('wallet')} Cuenta para las transferencias</div>
        <p class="small muted" style="margin:0">El asistente le pasa el alias, el titular y el monto a quien manda un pedido de créditos, para que verifique el nombre antes de transferir. Si cargás la cuenta en dólares, antes le pregunta si va a transferir en pesos o en dólares.</p>
        <div class="asis-cta"><div class="card-title" style="font-size:15px">En pesos</div>
        ${falta ? `<div class="notice warn">${icon('alert')}<span>Sin alias o titular, el asistente responde "En un rato te paso los datos" y te avisa por Telegram.</span></div>` : ''}
        ${camposCuenta('asis', aj.alias, aj.titular, 'mi.alias.mp')}</div>
        <div class="asis-cta"><div class="card-title" style="font-size:15px">En dólares <span class="tiny muted" style="font-weight:600">(opcional)</span></div>
        <p class="tiny muted" style="margin:0">Vacía, el asistente pasa solo los datos en pesos, sin preguntar.</p>
        ${camposCuenta('asisUsd', aj.aliasUsd, aj.titularUsd, 'mi.alias.usd')}</div>
        <div class="row"><button type="button" class="btn sm" data-action="asisGuardar">${icon('check')} Guardar</button></div>
      </section>`;
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
    whatsapp: 'El número del asistente (un solo chip para todo): conexión, prendido o apagado, botón de comprar créditos y cuenta para las transferencias',
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
    else body = `<div class="asis-top">${cardEstado(d)}${cardBoton(d)}</div>${cardCuenta(d)}`;
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
        ${(d.pedidos || []).length ? `<section class="card stack" style="gap:10px"><div class="card-title">${icon('wallet')} Pedidos nombrados en el chat</div><div class="list">${d.pedidos.map((p) => `<a class="list-item small" href="#admin.creditos.pedidos" data-go="#admin.creditos.pedidos"><div class="grow"><strong data-noi18n>${esc(p.codigo)}</strong> · <span data-noi18n>${esc(p.pack)}</span>${p.moneda ? ` <span class="tiny muted">· en ${p.moneda === 'USD' ? 'dólares' : 'pesos'}</span>` : ''}${p.comprobante ? ` <span class="tiny muted">· con comprobante</span>` : ''}</div>${P.badge(ESTADO_PED[p.estado], p.estado)}</a>`).join('')}</div></section>` : ''}`;
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
    asisGuardar() {
      const val = (id) => String((document.getElementById(id) || {}).value || '').trim();
      const alias = val('asisAlias'); const titular = val('asisTitular');
      const aliasUsd = val('asisUsdAlias'); const titularUsd = val('asisUsdTitular');
      const aliasOk = (a) => !a || /^[A-Za-z0-9.-]{6,20}$/.test(a);
      if (!aliasOk(alias)) { HH.toast('El alias tiene que tener de 6 a 20 caracteres: letras, números, puntos o guiones.', { type: 'warn' }); return; }
      if (!aliasOk(aliasUsd)) { HH.toast('El alias en dólares tiene que tener de 6 a 20 caracteres: letras, números, puntos o guiones.', { type: 'warn' }); return; }
      if (Boolean(aliasUsd) !== Boolean(titularUsd)) { HH.toast('Para la cuenta en dólares completá el alias y el nombre del titular, o dejá los dos vacíos.', { type: 'warn' }); return; }
      guardarAjustes({ alias, titular, aliasUsd, titularUsd }).then(() => HH.toast('Cuenta guardada', { type: 'ok' })).catch(fail);
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
.asis-adj{min-height:80px;max-width:260px}.asis-adj img{max-height:260px}
`;
  document.head.appendChild(st);
})();
