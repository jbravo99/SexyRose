/* ============================================================
   SexyRose — prod-admin-mod.js (admin real, 13/11/2026)
   Secciones nuevas del panel: Pedidos personalizados (moderación de chats), Créditos (todas las cuentas),
   Interesados (clientes con cuenta) y, en la ficha de cada acompañante, Destacadas, Packs, Mercado Pago y
   sus pedidos personalizados. Limpieza del menú: sin Soporte ni «WhatsApp / Avisos automáticos»; Categorías → Intereses.
   Usa las piezas de prod-admin.js (HH.pa). API: app/routes/admin-moderacion.js (+ /creditos de admin-creditos.js).
   ============================================================ */
(function () {
  'use strict';
  if (window.HH_PROD !== 'admin' || !HH.pa) return;
  const esc = HH.esc, icon = HH.icon;
  const P = HH.pa; const S = P.S;
  const { load, layout, head, fecha, dia, badge, loadingCard, stat, filtro, blobUrl, cred, cnum, credSig, planBadge, linkCuenta, pesosAr } = P;

  /* ---------- Menú ---------- */
  const TABS = HH.adminTabs;
  const quitar = (id) => { const i = TABS.findIndex((t) => t.id === id); if (i >= 0) TABS.splice(i, 1); };
  quitar('soporte'); quitar('whatsapp'); // WhatsApp y Telegram se configuran en Ajustes
  { const t = TABS.find((x) => x.id === 'categorias'); if (t) Object.assign(t, { label: 'Intereses', icon: 'heart' }); }
  { const t = TABS.find((x) => x.id === 'clientes'); if (t) Object.assign(t, { label: 'Interesados', icon: 'user' }); }
  const insertarDespues = (despues, tab) => { if (TABS.some((t) => t.id === tab.id)) return; const i = TABS.findIndex((t) => t.id === despues); TABS.splice(i >= 0 ? i + 1 : TABS.length, 0, tab); };
  insertarDespues('ventas', { id: 'solicitudes', label: 'Pedidos personalizados', icon: 'chat' });
  insertarDespues('pedidos', { id: 'creditos', label: 'Créditos', icon: 'dollar' });
  P.counts.solicitudes = () => (S.res && S.res.pedidosPersonalizados ? S.res.pedidosPersonalizados.pendientes : 0) || 0;
  P.counts.creditos = () => 0; P.counts.clientes = () => 0;

  const fail = (e) => HH.toast(e.message, { type: 'danger' });
  const err = (msg, k) => `<div class="card"><div class="empty">${icon('alert')}<h4>No se pudo cargar</h4><p class="small">${esc(msg)}</p><button type="button" class="btn secondary sm" data-action="modRetry" data-k="${esc(k)}">${icon('refresh')} Reintentar</button></div></div>`;
  const recargar = (k) => `<button type="button" class="btn ghost sm" data-action="modRetry" data-k="${esc(k)}">${icon('refresh')} Actualizar</button>`;
  const PATH = (k) => {
    if (k === 'sol') return '/solicitudes';
    if (k === 'cli') return '/clientes';
    if (k === 'crl') return '/creditos';
    if (k === 'crr') return '/creditos-resumen?dias=' + (S.crDias || 30);
    if (k.startsWith('sold:')) return '/solicitudes/' + encodeURIComponent(k.slice(5));
    if (k.startsWith('clid:')) return '/clientes/' + encodeURIComponent(k.slice(5));
    if (k.startsWith('acx:')) return '/acompanantes/' + encodeURIComponent(k.slice(4)) + '/extra';
    if (k.startsWith('cr:')) return '/creditos/' + encodeURIComponent(k.slice(3)) + '?limite=50';
    return null;
  };
  const cargar = (k, force) => load(k, PATH(k), force);
  const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Ventana con motivo obligatorio (queda registrado; no se le manda a nadie)
  function pedirMotivo({ title, intro, okLabel, cls, onOk }) {
    HH.modal({ title, body: `<div class="stack" style="gap:12px">${intro ? `<p class="small">${intro}</p>` : ''}
        <div class="field"><label for="modMot">Motivo (queda en el registro del admin)</label><textarea class="textarea" id="modMot" rows="3" maxlength="500"></textarea></div></div>`,
    actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: okLabel, cls: cls || '', onClick: (btn) => {
      const m = String(document.getElementById('modMot').value || '').trim();
      if (m.length < 3) { HH.toast('Escribí el motivo.', { type: 'warn' }); return; }
      if (btn) btn.disabled = true;
      onOk(m, () => { if (btn) btn.disabled = false; });
    } }] });
    setTimeout(() => { const t = document.getElementById('modMot'); if (t) t.focus(); }, 50);
  }
  const ACCION = { cerrar_pedido: 'Cerró el pedido', borrar_mensaje: 'Borró un mensaje', borrar_contenido: 'Borró un contenido', bloquear_cliente: 'Bloqueó al interesado', desbloquear_cliente: 'Desbloqueó al interesado', reenviar_verificacion: 'Reenvió el email de confirmación', borrar_destacada: 'Borró una destacada', borrar_destacada_item: 'Borró un elemento de una destacada', borrar_pack: 'Borró un pack' };
  const accionesHtml = (acc) => (acc && acc.length ? `<section class="card stack" style="gap:10px"><div class="card-title">${icon('list')} Registro del admin</div><div class="list">${acc.map((a) => `<div class="list-item small"><div class="grow" style="min-width:0"><div><strong>${esc(ACCION[a.accion] || a.accion)}</strong>${a.detalle && a.detalle.motivo ? ` <span class="muted">· <span data-noi18n>${esc(a.detalle.motivo)}</span></span>` : ''}</div><div class="tiny muted">${fecha(a.creado)} · ${esc(a.por)}</div></div></div>`).join('')}</div></section>` : '');

  /* ============================================================
     Pedidos personalizados (moderación)
     ============================================================ */
  S.solf = S.solf || 'todos'; S.solq = S.solq || '';
  const SOL_ESTADO = { pendiente: ['Sin responder', 'warn'], aceptada: ['Con chat', 'info'], rechazada: ['Rechazado', 'neutral'], cerrada: ['Cerrado', 'neutral'] };
  const SOL_FILTROS = [['todos', 'Todos'], ['pendiente', 'Sin responder'], ['aceptada', 'Con chat'], ['rechazada', 'Rechazados'], ['cerrada', 'Cerrados']];
  const solItems = () => {
    const all = (S.sol && S.sol.items) || [];
    const q = norm(S.solq).trim();
    return all.filter((x) => (S.solf === 'todos' || x.estado === S.solf) && (!q || [x.acompanante.nombre, x.cliente.usuario, x.texto].some((v) => norm(v).includes(q))));
  };
  const ultimo = (u) => (!u ? '<span class="muted">Sin mensajes</span>' : `<span class="muted">${u.autor === 'cliente' ? 'Interesado' : 'Acompañante'}:</span> ${u.contenido ? `${icon('lock')} contenido bloqueado` : `<span data-noi18n>${esc(String(u.texto || '').slice(0, 90))}</span>`}`);
  const pagadoTxt = (x) => (x.pagados ? `${x.pagados} · ${pesosAr(x.montoPagado)}` : (x.items ? `0 de ${x.items}` : '—'));
  const usuarioHtml = (c) => `<a href="#admin.clientes.${esc(c.id)}" data-go="#admin.clientes.${esc(c.id)}" data-noi18n>@${esc(c.usuario)}</a>${c.bloqueado ? ' <span class="badge danger">Bloqueado</span>' : ''}`;
  function solRows() {
    const items = solItems();
    const all = (S.sol && S.sol.items) || [];
    if (!items.length) return `<div class="card"><div class="empty">${icon('chat')}<h4>${all.length ? 'Sin resultados' : 'Todavía no hay pedidos personalizados'}</h4><p class="small">${all.length ? 'Probá con otro filtro o búsqueda.' : 'Cuando un interesado le pida algo a una acompañante, aparece acá.'}</p></div></div>`;
    const table = `<div class="table-wrap pa-table"><table class="table"><thead><tr><th>Último movimiento</th><th>Acompañante</th><th>Interesado</th><th>Estado</th><th>Último mensaje</th><th>Pagado</th></tr></thead><tbody>
      ${items.map((x) => `<tr class="pa-rowlink" data-go="#admin.solicitudes.${esc(x.id)}"><td class="small muted nowrap">${fecha(x.actividad)}</td><td>${linkCuenta(x.acompanante.id, x.acompanante.nombre)}</td><td class="small">${usuarioHtml(x.cliente)}</td><td>${badge(SOL_ESTADO[x.estado], x.estado)}</td><td class="small mod-ult">${ultimo(x.ultimoMensaje)}</td><td class="small nowrap">${pagadoTxt(x)}</td></tr>`).join('')}
      </tbody></table></div>`;
    const cards = `<div class="pa-cards">${items.map((x) => `<a class="card stack pa-accard" style="gap:8px" href="#admin.solicitudes.${esc(x.id)}" data-go="#admin.solicitudes.${esc(x.id)}">
        <div class="row between nowrap" style="gap:8px"><strong class="ellipsis" data-noi18n>${esc(x.acompanante.nombre || 'Sin nombre')}</strong>${badge(SOL_ESTADO[x.estado], x.estado)}</div>
        <div class="small"><span data-noi18n>@${esc(x.cliente.usuario)}</span>${x.cliente.bloqueado ? ' <span class="badge danger">Bloqueado</span>' : ''}</div>
        <div class="small mod-ult">${ultimo(x.ultimoMensaje)}</div>
        <div class="row between tiny muted"><span>${fecha(x.actividad)}</span><span>Pagado: ${pagadoTxt(x)}</span></div>
      </a>`).join('')}</div>`;
    return table + cards;
  }
  function vSolicitudes() {
    cargar('sol');
    let body;
    if (!S.sol && S.err.sol) body = err(S.err.sol, 'sol');
    else if (!S.sol) body = loadingCard(4);
    else {
      const n = S.sol.conteo || {};
      const cnt = (k) => (k === 'todos' ? n.total : n[k]) || 0;
      body = `<div class="adm-filters">
          <label class="sr-only" for="modSolQ">Buscar pedido</label><input class="input" id="modSolQ" type="search" placeholder="Acompañante, usuario o texto" value="${esc(S.solq)}" data-input="modSolSearch" autocomplete="off">
          <div class="chips scroll" style="flex:1 1 auto;min-width:0">${SOL_FILTROS.map(([k, l]) => filtro('modSolFilter', S.solf, k, l, cnt(k))).join('')}</div>
        </div>
        <div id="modSolRows">${solRows()}</div>`;
    }
    return layout('solicitudes', `${head('Pedidos personalizados', recargar('sol'), 'Pedidos de los interesados a las acompañantes y sus chats. Podés leerlos, cerrarlos, borrar mensajes o contenidos y bloquear a un interesado.')}<div class="stack" style="gap:14px">${body}</div>`);
  }

  function itemHtml(sid, it) {
    if (!it) return '<div class="small muted">Contenido borrado.</div>';
    const precio = `<strong data-noi18n>${esc(pesosAr(it.precio))}</strong>`;
    const est = it.estado === 'vencido' ? '<span class="badge neutral">Vencido o borrado</span>'
      : it.estado === 'procesando' ? '<span class="badge warn">Procesando</span>'
        : it.estado === 'error' ? `<span class="badge danger">Error</span> <span class="tiny">${esc(it.error || '')}</span>` : '';
    const pago = it.pagado ? '<span class="badge ok">Pagado</span>' : it.venta === 'en_proceso' ? '<span class="badge warn">Pago en proceso</span>' : '<span class="badge neutral">Sin pagar</span>';
    const media = it.archivo
      ? `<div class="mod-media"><div class="pa-priv mod-prev" data-blob="/solicitudes/items/${esc(it.id)}/archivo?preview=1" data-alt="Vista previa borrosa">${loadingCard(1)}</div>
          <button type="button" class="btn ghost sm" data-action="modVerOriginal" data-id="${esc(it.id)}" data-t="${esc(it.tipo)}">${icon('eye')} Ver ${it.tipo === 'video' ? 'video' : 'foto'} original</button></div>` : '';
    return `<div class="mod-item stack" style="gap:6px">${media}<div class="row" style="gap:6px;flex-wrap:wrap;align-items:center">${icon(it.tipo === 'video' ? 'film' : 'image')} ${precio} ${pago} ${est}${it.vence ? ` <span class="tiny muted">vence ${dia(it.vence)}</span>` : ''}</div>
      <div><button type="button" class="btn ghost sm mod-del" data-action="modBorrarItem" data-sid="${esc(sid)}" data-id="${esc(it.id)}">${icon('trash')} Borrar contenido</button></div></div>`;
  }
  const SISTEMA = (t) => (t === 'aceptada' ? 'La acompañante aceptó el pedido.' : t === 'rechazada' ? 'La acompañante rechazó el pedido.' : t === 'cerrada:admin' ? 'El admin cerró el pedido.' : t === 'cerrada:cliente' ? 'El interesado cerró el pedido.' : t === 'cerrada:acompanante' ? 'La acompañante cerró el pedido.' : String(t || ''));
  function vSolicitud(id) {
    const k = 'sold:' + id; cargar(k);
    const d = S[k];
    let body;
    if (!d && S.err[k]) body = err(S.err[k], k);
    else if (!d) body = loadingCard(4);
    else {
      const s = d.solicitud; const items = new Map((d.items || []).map((i) => [i.id, i]));
      const abierto = s.estado === 'pendiente' || s.estado === 'aceptada';
      const cab = `<section class="card stack" style="gap:12px">
          <div class="row between"><div class="card-title">${icon('chat')} Pedido</div>${badge(SOL_ESTADO[s.estado], s.estado)}</div>
          <dl class="pa-dl">
            <div><dt>Acompañante</dt><dd>${linkCuenta(s.acompanante.id, s.acompanante.nombre)}</dd></div>
            <div><dt>Interesado</dt><dd>${usuarioHtml(s.cliente)} <span class="tiny muted">${esc(s.cliente.email || '')}</span></dd></div>
            <div><dt>Pedido</dt><dd class="pa-pre" data-noi18n>${esc(s.texto)}</dd></div>
            <div><dt>Creado</dt><dd>${fecha(s.creado)}${s.respondida ? ` · respondido el ${fecha(s.respondida)}` : ''}</dd></div>
            ${s.cerrada ? `<div><dt>Cerrado</dt><dd>${fecha(s.cerrada)} por ${esc({ admin: 'el admin', cliente: 'el interesado', acompanante: 'la acompañante' }[s.cerradaPor] || s.cerradaPor || '')}${s.motivoCierre ? ` · <span data-noi18n>${esc(s.motivoCierre)}</span>` : ''}</dd></div>` : ''}
          </dl>
          <div class="row" style="gap:8px">
            ${abierto ? `<button type="button" class="btn danger sm" data-action="modCerrar" data-id="${esc(s.id)}">${icon('x')} Cerrar pedido</button>` : ''}
            ${s.cliente.bloqueado ? `<button type="button" class="btn secondary sm" data-action="modDesbloquear" data-id="${esc(s.cliente.id)}" data-u="${esc(s.cliente.usuario)}" data-back="${esc(k)}">${icon('unlock')} Desbloquear a @${esc(s.cliente.usuario)}</button>` : `<button type="button" class="btn ghost sm" data-action="modBloquear" data-id="${esc(s.cliente.id)}" data-u="${esc(s.cliente.usuario)}" data-back="${esc(k)}">${icon('ban')} Bloquear a @${esc(s.cliente.usuario)}</button>`}
          </div>
          <p class="tiny muted">Cerrar deja el chat de solo lectura para los dos. Bloquear impide que el interesado entre, compre o pida, y sus chats quedan de solo lectura. Nada de esto se le avisa a nadie.</p>
        </section>`;
      const msgs = (d.mensajes || []).map((m) => {
        if (m.autor === 'sistema') return `<div class="mod-sys"><span>${esc(SISTEMA(m.texto))}</span><span class="tiny muted">${fecha(m.creado)}</span></div>`;
        const quien = m.autor === 'cliente' ? `@${esc(s.cliente.usuario)}` : esc(s.acompanante.nombre || 'Acompañante');
        const cuerpo = m.itemId ? itemHtml(s.id, items.get(m.itemId)) : `<div class="pa-pre" data-noi18n>${esc(m.texto || '')}</div>`;
        return `<div class="mod-msg ${m.autor === 'cliente' ? 'cli' : 'aco'}"><div class="row between" style="gap:8px"><span class="small"><strong data-noi18n>${quien}</strong> <span class="tiny muted">${fecha(m.creado)}</span></span>${m.itemId ? '' : `<button type="button" class="icon-btn sm" data-action="modBorrarMsg" data-sid="${esc(s.id)}" data-id="${esc(m.id)}" aria-label="Borrar mensaje" title="Borrar mensaje">${icon('trash')}</button>`}</div>${cuerpo}</div>`;
      }).join('');
      const chat = `<section class="card stack" style="gap:10px"><div class="row between"><div class="card-title">${icon('chat')} Chat</div><span class="small muted">${(d.mensajes || []).filter((m) => m.autor !== 'sistema').length} mensajes · ${(d.items || []).length} ${HH.plural((d.items || []).length, 'contenido', 'contenidos')}</span></div>
          <div class="mod-chat">${msgs || '<p class="small muted">Todavía no hay mensajes.</p>'}</div>
          <p class="tiny muted">El contenido bloqueado es privado: solo lo ven quien lo pagó, la acompañante y vos desde este panel.</p></section>`;
      body = `<div class="pa-detail"><div class="stack" style="gap:14px">${chat}</div><div class="stack" style="gap:14px">${cab}${accionesHtml(d.acciones)}</div></div>`;
    }
    const right = `<div class="row" style="gap:8px"><a class="btn ghost sm" href="#admin.solicitudes" data-go="#admin.solicitudes">${icon('arrowLeft')} Todos</a>${recargar(k)}</div>`;
    return layout('solicitudes', `${head('Pedido personalizado', right, d ? `${esc(d.solicitud.acompanante.nombre || '')} · @${esc(d.solicitud.cliente.usuario)}` : '')}${body}`);
  }

  /* ============================================================
     Interesados (clientes con cuenta)
     ============================================================ */
  S.clf = S.clf || 'todos'; S.clq = S.clq || '';
  const CL_FILTROS = [['todos', 'Todos', () => true], ['bloqueados', 'Bloqueados', (c) => c.bloqueado], ['sinconfirmar', 'Sin confirmar el email', (c) => !c.emailVerificado], ['compradores', 'Con compras', (c) => c.compras > 0]];
  const clItems = () => {
    const all = (S.cli && S.cli.items) || []; const f = CL_FILTROS.find((x) => x[0] === S.clf) || CL_FILTROS[0]; const q = norm(S.clq).trim();
    return all.filter(f[2]).filter((c) => !q || [c.usuario, c.email].some((v) => norm(v).includes(q)));
  };
  const clEstado = (c) => (c.bloqueado ? '<span class="badge danger">Bloqueado</span>' : c.estado === 'baja' ? '<span class="badge neutral">Baja</span>' : '<span class="badge ok">Activo</span>');
  function cliRows() {
    const items = clItems(); const all = (S.cli && S.cli.items) || [];
    if (!items.length) return `<div class="card"><div class="empty">${icon('user')}<h4>${all.length ? 'Sin resultados' : 'Todavía no hay interesados con cuenta'}</h4><p class="small">${all.length ? 'Probá con otro filtro o búsqueda.' : 'Cuando alguien cree su cuenta para comprar o pedir, aparece acá.'}</p></div></div>`;
    const mail = (c) => `<span class="pa-contact">${esc(c.email)}</span> ${c.emailVerificado ? '<span class="pa-ok" title="Email confirmado">' + icon('checkCircle') + '</span>' : '<span class="tiny muted">(sin confirmar)</span>'}`;
    const table = `<div class="table-wrap pa-table"><table class="table"><thead><tr><th>Usuario</th><th>Email</th><th>Alta</th><th>Compras</th><th>Pedidos</th><th>Estado</th></tr></thead><tbody>
      ${items.map((c) => `<tr class="pa-rowlink" data-go="#admin.clientes.${esc(c.id)}"><td><a href="#admin.clientes.${esc(c.id)}" data-go="#admin.clientes.${esc(c.id)}"><strong data-noi18n>@${esc(c.usuario)}</strong></a></td><td class="small">${mail(c)}</td><td class="small muted">${dia(c.creado)}</td><td class="small nowrap">${c.compras} · ${pesosAr(c.gastado)}</td><td class="small">${c.pedidos}</td><td>${clEstado(c)}</td></tr>`).join('')}
      </tbody></table></div>`;
    const cards = `<div class="pa-cards">${items.map((c) => `<a class="card stack pa-accard" style="gap:6px" href="#admin.clientes.${esc(c.id)}" data-go="#admin.clientes.${esc(c.id)}"><div class="row between nowrap" style="gap:8px"><strong class="ellipsis" data-noi18n>@${esc(c.usuario)}</strong>${clEstado(c)}</div><div class="small ellipsis">${esc(c.email)}${c.emailVerificado ? '' : ' · sin confirmar'}</div><div class="tiny muted">Alta ${dia(c.creado)} · ${c.compras} ${HH.plural(c.compras, 'compra', 'compras')} (${pesosAr(c.gastado)}) · ${c.pedidos} ${HH.plural(c.pedidos, 'pedido', 'pedidos')}</div></a>`).join('')}</div>`;
    return table + cards;
  }
  function vClientes() {
    cargar('cli');
    let body;
    if (!S.cli && S.err.cli) body = err(S.err.cli, 'cli');
    else if (!S.cli) body = loadingCard(4);
    else {
      const all = S.cli.items || [];
      body = `<div class="adm-filters">
          <label class="sr-only" for="modCliQ">Buscar interesado</label><input class="input" id="modCliQ" type="search" placeholder="Buscar por usuario o email" value="${esc(S.clq)}" data-input="modCliSearch" autocomplete="off">
          <div class="chips scroll" style="flex:1 1 auto;min-width:0">${CL_FILTROS.map(([k, l, f]) => filtro('modCliFilter', S.clf, k, l, all.filter(f).length)).join('')}</div>
        </div><div id="modCliRows">${cliRows()}</div>`;
    }
    const n = S.cli && S.cli.conteo;
    return layout('clientes', `${head('Interesados', recargar('cli'), n ? `${n.total} ${HH.plural(n.total, 'cuenta', 'cuentas')} · ${n.bloqueados} ${HH.plural(n.bloqueados, 'bloqueada', 'bloqueadas')} · el email solo se ve acá` : 'Cuentas para comprar contenido y hacer pedidos')}<div class="stack" style="gap:14px">${body}</div>`);
  }
  const VC = { aprobada: ['Aprobada', 'ok'], en_proceso: ['En proceso', 'warn'], rechazada: ['Rechazada', 'danger'], reembolsada: ['Devuelta', 'neutral'] };
  function vCliente(id) {
    const k = 'clid:' + id; cargar(k); const d = S[k];
    let body;
    if (!d && S.err[k]) body = err(S.err[k], k);
    else if (!d) body = loadingCard(3);
    else {
      const c = d.cliente;
      const datos = `<section class="card stack" style="gap:12px">
          <div class="row between"><div class="card-title">${icon('user')} Cuenta</div>${clEstado(c)}</div>
          ${c.bloqueado ? `<div class="notice danger">${icon('ban')}<span><strong>Bloqueado</strong> desde el ${fecha(c.bloqueadoDesde)}${c.motivoBloqueo ? ` · <span data-noi18n>${esc(c.motivoBloqueo)}</span>` : ''}</span></div>` : ''}
          <dl class="pa-dl">
            <div><dt>Usuario</dt><dd data-noi18n>@${esc(c.usuario)}</dd></div>
            <div><dt>Email</dt><dd><span class="pa-contact">${esc(c.email)}</span> ${c.emailVerificado ? '<span class="badge ok">Confirmado</span>' : '<span class="badge warn">Sin confirmar</span>'}</dd></div>
            <div><dt>Alta</dt><dd>${fecha(c.creado)}</dd></div>
            <div><dt>Último ingreso</dt><dd>${c.ultimoLogin ? fecha(c.ultimoLogin) : '—'}</dd></div>
            <div><dt>Mayor de edad (declarado)</dt><dd>${c.mayorEdadDeclarada ? 'Sí' : 'No'}${c.aceptoTerminos ? ' · aceptó los términos el ' + fecha(c.aceptoTerminos) : ''}</dd></div>
          </dl>
          <div class="row" style="gap:8px">
            ${c.bloqueado ? `<button type="button" class="btn secondary sm" data-action="modDesbloquear" data-id="${esc(c.id)}" data-u="${esc(c.usuario)}" data-back="${esc(k)}">${icon('unlock')} Desbloquear</button>` : (c.estado === 'activa' ? `<button type="button" class="btn danger sm" data-action="modBloquear" data-id="${esc(c.id)}" data-u="${esc(c.usuario)}" data-back="${esc(k)}">${icon('ban')} Bloquear</button>` : '')}
            ${!c.emailVerificado && c.estado === 'activa' ? `<button type="button" class="btn ghost sm" data-action="modReenviar" data-id="${esc(c.id)}">${icon('mail')} Reenviar email de confirmación</button>` : ''}
          </div>
          <p class="tiny muted">Bloquear cierra sus sesiones; no puede entrar, comprar ni pedir, y sus chats quedan de solo lectura.</p>
        </section>`;
      const compras = `<section class="card stack" style="gap:10px"><div class="row between"><div class="card-title">${icon('bag')} Compras</div><span class="small muted">${(d.compras || []).length}</span></div>
          ${(d.compras || []).length ? `<div class="list">${d.compras.map((v) => `<div class="list-item small"><div class="grow" style="min-width:0"><div><span class="badge ${v.tipo === 'pedido' ? 'info' : 'neutral'}">${v.tipo === 'pedido' ? 'Pedido' : 'Pack'}</span> <span data-noi18n>${esc(v.titulo || '')}</span> · ${pesosAr(v.monto)}</div><div class="tiny muted">${fecha(v.pagado || v.creado)} · ${v.acompanante.id ? linkCuenta(v.acompanante.id, v.acompanante.nombre) : ''}</div></div>${badge(VC[v.estado], v.estado)}</div>`).join('')}</div>` : '<p class="small muted">No compró nada todavía.</p>'}</section>`;
      const pedidos = `<section class="card stack" style="gap:10px"><div class="row between"><div class="card-title">${icon('chat')} Pedidos personalizados</div><span class="small muted">${(d.pedidos || []).length}</span></div>
          ${(d.pedidos || []).length ? `<div class="list">${d.pedidos.map((s) => `<a class="list-item small" style="color:inherit" href="#admin.solicitudes.${esc(s.id)}" data-go="#admin.solicitudes.${esc(s.id)}"><div class="grow" style="min-width:0"><div class="ellipsis" data-noi18n>${esc(s.acompanante.nombre || '')} · ${esc(String(s.texto || '').slice(0, 80))}</div><div class="tiny muted">${fecha(s.actividad)}</div></div>${badge(SOL_ESTADO[s.estado], s.estado)}${icon('chevronRight')}</a>`).join('')}</div>` : '<p class="small muted">No hizo pedidos.</p>'}</section>`;
      body = `<div class="pa-detail"><div class="stack" style="gap:14px">${datos}${accionesHtml(d.acciones)}</div><div class="stack" style="gap:14px">${compras}${pedidos}</div></div>`;
    }
    const right = `<div class="row" style="gap:8px"><a class="btn ghost sm" href="#admin.clientes" data-go="#admin.clientes">${icon('arrowLeft')} Todos</a>${recargar(k)}</div>`;
    return layout('clientes', `${head(d ? '@' + esc(d.cliente.usuario) : 'Interesado', right, d ? esc(d.cliente.email) : '')}${body}`);
  }

  /* ============================================================
     Créditos (todas las cuentas)
     ============================================================ */
  S.crq = S.crq || ''; S.crDias = S.crDias || 30;
  const crItems = () => {
    const all = (S.crl && S.crl.items) || []; const q = norm(S.crq).trim();
    return all.filter((x) => !q || [x.displayName, x.email, x.slug].some((v) => norm(v).includes(q)));
  };
  const ultMov = (u) => (u ? `<span>${esc(P.TIPO_MOV[u.tipo] || u.tipo)}</span> <strong class="pa-mov ${cnum(u.centavos) < 0 ? 'neg' : 'pos'}">${credSig(u.centavos)}</strong><div class="tiny muted">${fecha(u.creado)}</div>` : '<span class="muted">Sin movimientos</span>');
  function crRows() {
    const items = crItems(); const ult = (S.crr && S.crr.ultimos) || {};
    if (!items.length) return `<div class="card"><div class="empty">${icon('dollar')}<h4>${((S.crl && S.crl.items) || []).length ? 'Sin resultados' : 'Todavía no hay cuentas'}</h4></div></div>`;
    const table = `<div class="table-wrap pa-table"><table class="table"><thead><tr><th>Acompañante</th><th>Plan</th><th>Saldo</th><th>Último movimiento</th><th></th></tr></thead><tbody>
      ${items.map((x) => `<tr class="pa-rowlink" data-go="#admin.creditos.${esc(x.cuentaId)}"><td><a href="#admin.creditos.${esc(x.cuentaId)}" data-go="#admin.creditos.${esc(x.cuentaId)}"><strong data-noi18n>${esc(x.displayName || 'Sin nombre')}</strong></a><div class="tiny muted">${esc(x.email)}</div></td><td>${planBadge(x.plan)}</td><td class="nowrap"><strong>${cred(x.saldo)}</strong></td><td class="small">${ultMov(ult[x.cuentaId])}</td><td>${x.pausadoPorSaldo ? '<span class="badge danger">Pausada por saldo</span>' : ''}</td></tr>`).join('')}
      </tbody></table></div>`;
    const cards = `<div class="pa-cards">${items.map((x) => `<a class="card stack pa-accard" style="gap:6px" href="#admin.creditos.${esc(x.cuentaId)}" data-go="#admin.creditos.${esc(x.cuentaId)}"><div class="row between nowrap" style="gap:8px"><strong class="ellipsis" data-noi18n>${esc(x.displayName || 'Sin nombre')}</strong>${planBadge(x.plan)}</div><div class="row between small"><strong>${cred(x.saldo)}</strong>${x.pausadoPorSaldo ? '<span class="badge danger">Pausada por saldo</span>' : ''}</div><div class="small">${ultMov(ult[x.cuentaId])}</div></a>`).join('')}</div>`;
    return table + cards;
  }
  function vCreditos() {
    if (S.crlStale) { S.crlStale = false; cargar('crl', true); cargar('crr', true); }
    cargar('crl'); cargar('crr');
    let body;
    if (!S.crl && S.err.crl) body = err(S.err.crl, 'crl');
    else if (!S.crl) body = loadingCard(4);
    else {
      const r = S.crr; const pr = r && r.periodo;
      const dias = [[7, '7 días'], [30, '30 días'], [90, '90 días'], [365, '1 año']];
      body = `<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><span class="small muted">Período:</span>${dias.map(([n, l]) => `<button type="button" class="chip${S.crDias === n ? ' active' : ''}" data-action="modCrDias" data-n="${n}" aria-pressed="${S.crDias === n}">${l}</button>`).join('')}</div>
        <div class="adm-stats">
          ${stat('Créditos emitidos', pr ? cred(pr.emitidos, false) : '…', `en ${S.crDias} días (compras, regalos y ajustes a favor)`, 'accent')}
          ${stat('Créditos consumidos', pr ? cred(pr.consumidos, false) : '…', 'planes, semanas, subidas y Destacados')}
          ${stat('Comprados', pr ? cred(pr.comprados, false) : '…', 'pedidos confirmados y regalos de pack')}
          ${stat('Saldo total', r ? cred(r.saldoTotal, false) : '…', r ? `${r.conSaldo} ${HH.plural(r.conSaldo, 'cuenta', 'cuentas')} con saldo` : '')}
        </div>
        ${S.err.crr ? `<div class="notice warn">${icon('alert')}<span>${esc(S.err.crr)}</span></div>` : ''}
        <div class="adm-filters"><label class="sr-only" for="modCrQ">Buscar acompañante</label><input class="input" id="modCrQ" type="search" placeholder="Buscar por nombre o email" value="${esc(S.crq)}" data-input="modCrSearch" autocomplete="off"></div>
        <div id="modCrRows">${crRows()}</div>`;
    }
    return layout('creditos', `${head('Créditos', `<div class="row" style="gap:8px">${recargar('crl')}</div>`, 'Saldo y movimientos de todas las acompañantes. 1 crédito = 1 USD.')}<div class="stack" style="gap:14px">${body}</div>`);
  }
  function vCredito(id) {
    S.crlStale = true;
    const k = 'cr:' + id; cargar(k); const d = S[k];
    let body;
    if (!d && S.err[k]) body = err(S.err[k], k);
    else if (!d) body = loadingCard(3);
    else {
      const movs = d.movimientos || [];
      body = `<div class="pa-detail"><div class="stack" style="gap:14px"><section class="card stack" style="gap:12px">
          <div class="row between"><div class="card-title">${icon('dollar')} Movimientos</div><strong class="pa-money">${cred(d.saldo)}</strong></div>
          ${movs.length ? `<div class="list">${movs.map((m) => `<div class="list-item small"><div class="grow" style="min-width:0"><div><strong>${esc(P.TIPO_MOV[m.tipo] || m.tipo)}</strong>${m.motivo ? ` <span class="muted">· <span data-noi18n>${esc(m.motivo)}</span></span>` : ''}</div><div class="tiny muted">${fecha(m.creado)}${m.creadoPor ? ' · ' + esc(m.creadoPor) : ''} · saldo ${cred(m.saldoDespues, false)}</div></div><strong class="pa-mov ${cnum(m) < 0 ? 'neg' : 'pos'}">${credSig(m)}</strong></div>`).join('')}</div>
            ${d.siguiente ? `<div class="row"><button type="button" class="btn ghost sm" data-action="prodMovMas" data-id="${esc(id)}">${icon('chevronDown')} Ver movimientos anteriores</button></div>` : ''}` : '<p class="small muted">Todavía no tiene movimientos de créditos.</p>'}
          <div class="row" style="gap:8px"><button type="button" class="btn secondary sm" data-action="prodAjuste" data-id="${esc(id)}" data-n="${esc(d.cuenta.displayName || '')}">${icon('edit')} Ajuste manual</button><a class="btn ghost sm" href="#admin.acompanantes.${esc(id)}" data-go="#admin.acompanantes.${esc(id)}">${icon('user')} Ver ficha</a></div>
          <p class="tiny muted">El ajuste pide un motivo y no puede dejar el saldo por debajo de 0.</p>
        </section></div>
        <div class="stack" style="gap:14px"><section class="card stack" style="gap:10px"><div class="card-title">${icon('card')} Plan</div><div class="row" style="gap:8px">${planBadge(d.plan)}${d.base ? `<span class="small muted">hasta el ${dia(d.base.hasta)}${d.base.renovacionAuto ? ' · renueva sola' : ''}</span>` : '<span class="small muted">Bronce (gratis)</span>'}</div></section></div></div>`;
    }
    const nombre = d && d.cuenta ? d.cuenta.displayName : '';
    const right = `<div class="row" style="gap:8px"><a class="btn ghost sm" href="#admin.creditos" data-go="#admin.creditos">${icon('arrowLeft')} Todas</a>${recargar(k)}</div>`;
    return layout('creditos', `${head(esc(nombre || 'Créditos'), right, d ? esc(d.cuenta.email || '') : '')}${body}`);
  }

  /* ============================================================
     Ficha de la acompañante: destacadas, packs, Mercado Pago y pedidos
     ============================================================ */
  const MP_ESTADO = { conectada: ['Conectada', 'ok'], reconectar: ['Tiene que volver a conectar', 'warn'], sin_conectar: ['Sin conectar', 'neutral'] };
  HH.paFichaExtra = function (id) {
    const k = 'acx:' + id; cargar(k); const x = S[k];
    if (!x) return S.err[k] ? `<div class="notice warn">${icon('alert')}<span>${esc(S.err[k])}</span></div>` : loadingCard(1);
    const ds = (x.destacadas && x.destacadas.destacadas) || []; const lim = x.destacadas ? x.destacadas.limite : null;
    const thumbIt = (it) => `<div class="pa-hist">${it.estado === 'listo' && it.urlMini ? `<button type="button" class="pa-foto" data-action="${it.tipo === 'video' ? 'prodHistVideo' : 'prodFoto'}" data-url="${esc(it.url || '')}" data-poster="${esc(it.urlMini || '')}" aria-label="Ver"><img src="${esc(it.urlMini)}" alt="" loading="lazy">${it.tipo === 'video' ? `<span class="badge neutral" style="position:absolute;right:4px;bottom:4px">${icon('film')}</span>` : ''}</button>` : `<div class="pa-foto" style="display:grid;place-items:center;text-align:center;padding:6px"><span class="tiny">${it.estado === 'procesando' ? 'Procesando' : esc(it.error || 'Error')}</span></div>`}<button type="button" class="pa-hist-del" data-action="modDestItemDel" data-id="${esc(id)}" data-i="${esc(it.id)}" aria-label="Borrar elemento" title="Borrar elemento">${icon('trash')}</button></div>`;
    const destCard = `<section class="card stack" style="gap:12px">
        <div class="row between"><div class="card-title">${icon('star')} Destacadas</div><span class="small muted">${ds.length} de ${lim === null ? 'ilimitadas' : lim}</span></div>
        ${ds.length ? ds.map((d) => `<div class="stack" style="gap:6px"><div class="row between" style="gap:8px"><span class="small"><strong data-noi18n>${esc(d.titulo)}</strong> · ${d.items.length} ${HH.plural(d.items.length, 'elemento', 'elementos')}${d.visible ? '' : ' <span class="badge warn">No se ve: supera el límite de su plan</span>'}</span><button type="button" class="btn ghost sm" data-action="modDestDel" data-id="${esc(id)}" data-d="${esc(d.id)}" data-t="${esc(d.titulo)}">${icon('trash')} Borrar</button></div>${d.items.length ? `<div class="pa-fotos">${d.items.map(thumbIt).join('')}</div>` : '<p class="tiny muted">Sin elementos.</p>'}</div>`).join('') : '<p class="small muted">No tiene destacadas.</p>'}
      </section>`;
    const pk = x.packs || { items: [], max: 0 };
    const packsCard = `<section class="card stack" style="gap:12px">
        <div class="row between"><div class="card-title">${icon('bag')} Packs</div><span class="small muted">${pk.items.length} · su plan permite ${pk.max === null ? 'ilimitados' : pk.max}</span></div>
        ${pk.items.length ? `<div class="list">${pk.items.map((p) => `<div class="list-item small"><div class="grow" style="min-width:0"><div><strong data-noi18n>${esc(p.titulo)}</strong> · ${pesosAr(p.precio)} ${p.aLaVenta ? '<span class="badge ok">A la venta</span>' : '<span class="badge warn">No está a la venta (supera su plan)</span>'}</div><div class="tiny muted ellipsis">${p.link ? P.ext(p.link, esc(p.link)) : ''} · ${dia(p.creado)}</div></div><button type="button" class="icon-btn sm" data-action="modPackDel" data-id="${esc(id)}" data-p="${esc(p.id)}" data-t="${esc(p.titulo)}" aria-label="Borrar pack" title="Borrar pack">${icon('trash')}</button></div>`).join('')}</div>` : '<p class="small muted">No tiene packs.</p>'}
      </section>`;
    const mp = x.mercadoPago || {};
    const mpCard = `<section class="card stack" style="gap:10px">
        <div class="row between"><div class="card-title">${icon('wallet')} Mercado Pago</div>${badge(MP_ESTADO[mp.estado], mp.estado)}</div>
        ${!mp.disponible ? '<p class="small muted">La venta de contenido todavía no está activa: falta una cuenta de comisión completa.</p>' : `<div class="small">Cuenta que recibe la comisión: <strong>${esc(mp.cuentaActiva || '—')}</strong>${mp.desde ? ` · conectada desde el ${dia(mp.desde)}` : ''}</div>`}
        ${(mp.conexiones || []).length ? `<div class="list">${mp.conexiones.map((c) => `<div class="list-item small"><div class="grow">${esc(c.cuenta)}<div class="tiny muted">${c.conectada ? 'conectada el ' + dia(c.conectada) : ''}${c.vence ? ' · vence ' + dia(c.vence) : ''}</div></div><span class="badge ${c.estado === 'activa' ? 'ok' : 'neutral'}">${esc(c.estado)}</span></div>`).join('')}</div>` : ''}
      </section>`;
    const pe = x.pedidos || {};
    const nombre = (S['acd:' + id] && S['acd:' + id].perfil && S['acd:' + id].perfil.datos && S['acd:' + id].perfil.datos.displayName) || '';
    const pedCard = `<section class="card stack" style="gap:10px">
        <div class="row between"><div class="card-title">${icon('chat')} Pedidos personalizados</div><span class="small muted">${pe.total || 0} en total · ${pe.abiertos || 0} ${HH.plural(pe.abiertos || 0, 'abierto', 'abiertos')}</span></div>
        ${pe.total ? `<div class="row"><button type="button" class="btn ghost sm" data-action="modVerPedidosDe" data-n="${esc(nombre)}">${icon('chevronRight')} Ver sus pedidos</button></div>` : '<p class="small muted">No recibió pedidos.</p>'}
      </section>`;
    return destCard + packsCard + mpCard + pedCard;
  };

  /* ---------- Vistas y rutas ---------- */
  Object.assign(P.views, { solicitudes: vSolicitudes, clientes: vClientes, creditos: vCreditos });
  HH.adminViews = P.views;
  HH.route('admin.solicitudes.:id', ({ id }) => (HH.requireRole('admin') ? vSolicitud(id) : false));
  HH.route('admin.clientes.:id', ({ id }) => (HH.requireRole('admin') ? vCliente(id) : false));
  HH.route('admin.creditos.:id', ({ id }) => (HH.requireRole('admin') ? vCredito(id) : false));

  /* ---------- Acciones ---------- */
  const tras = (keys) => { keys.forEach((k) => { if (k && (S[k] != null || S.err[k])) cargar(k, true); }); P.refreshResumen(); };
  Object.assign(HH.actions, {
    modRetry(el) { const k = el.dataset.k; cargar(k, true); if (k === 'crl') cargar('crr', true); HH.refresh(); },
    modSolFilter(el) { S.solf = el.dataset.f; HH.refresh(); },
    modSolSearch(el) { S.solq = el.value; const b = document.getElementById('modSolRows'); if (b) b.innerHTML = solRows(); },
    modCliFilter(el) { S.clf = el.dataset.f; HH.refresh(); },
    modCliSearch(el) { S.clq = el.value; const b = document.getElementById('modCliRows'); if (b) b.innerHTML = cliRows(); },
    modCrSearch(el) { S.crq = el.value; const b = document.getElementById('modCrRows'); if (b) b.innerHTML = crRows(); },
    modCrDias(el) { S.crDias = Number(el.dataset.n) || 30; cargar('crr', true); HH.refresh(); },
    modVerPedidosDe(el) { S.solq = el.dataset.n || ''; S.solf = 'todos'; HH.go('#admin.solicitudes'); },
    modCerrar(el) {
      const id = el.dataset.id;
      pedirMotivo({ title: 'Cerrar pedido', intro: 'El chat queda de solo lectura para los dos. No se le avisa a nadie.', okLabel: 'Cerrar pedido', cls: 'danger', onOk: (motivo, rehab) => {
        HH.api('POST', '/solicitudes/' + encodeURIComponent(id) + '/cerrar', { motivo })
          .then(() => { HH.closeModal(); HH.toast('Pedido cerrado', { type: 'ok' }); tras(['sold:' + id, 'sol']); })
          .catch((e) => { rehab(); fail(e); });
      } });
    },
    modBorrarMsg(el) {
      const sid = el.dataset.sid; const mid = el.dataset.id;
      HH.confirm({ title: 'Borrar mensaje', text: 'El mensaje deja de verse en el chat para los dos. Queda registrado que lo borraste. No se puede deshacer.', okLabel: 'Borrar', cls: 'danger', onOk: () => {
        HH.api('DELETE', '/solicitudes/' + encodeURIComponent(sid) + '/mensajes/' + encodeURIComponent(mid))
          .then(() => { HH.toast('Mensaje borrado', { type: 'ok' }); tras(['sold:' + sid, 'sol']); })
          .catch(fail);
      } });
    },
    modBorrarItem(el) {
      const sid = el.dataset.sid; const iid = el.dataset.id;
      HH.confirm({ title: 'Borrar contenido', text: 'Se borran la foto o el video y su vista previa, y deja de verse en el chat (también para quien lo pagó). Queda registrado. No se puede deshacer.', okLabel: 'Borrar', cls: 'danger', onOk: () => {
        HH.api('DELETE', '/solicitudes/items/' + encodeURIComponent(iid))
          .then(() => { HH.toast('Contenido borrado', { type: 'ok' }); tras(['sold:' + sid, 'sol']); })
          .catch(fail);
      } });
    },
    modVerOriginal(el) {
      const id = el.dataset.id; const video = el.dataset.t === 'video';
      HH.modal({ title: video ? 'Video original' : 'Foto original', wide: true, body: loadingCard(1) });
      blobUrl('/solicitudes/items/' + encodeURIComponent(id) + '/archivo')
        .then((v) => HH.modal({ title: video ? 'Video original' : 'Foto original', wide: true, body: `${video ? `<video src="${v.url}" controls playsinline preload="metadata" class="pa-full" style="max-height:75vh;background:#000"></video>` : `<img src="${v.url}" alt="" class="pa-full">`}<p class="tiny muted">Privado: no se publica ni se guarda en este equipo.</p>`, actions: [{ label: 'Cerrar', cls: 'ghost', action: 'closeModal' }] }))
        .catch((e) => { HH.closeModal(); fail(e); });
    },
    modBloquear(el) {
      const id = el.dataset.id; const back = el.dataset.back;
      pedirMotivo({ title: 'Bloquear a @' + (el.dataset.u || ''), intro: 'Se cierran sus sesiones. No va a poder entrar, comprar ni hacer pedidos, y sus chats quedan de solo lectura. No se le avisa.', okLabel: 'Bloquear', cls: 'danger', onOk: (motivo, rehab) => {
        HH.api('POST', '/clientes/' + encodeURIComponent(id) + '/bloquear', { motivo })
          .then(() => { HH.closeModal(); HH.toast('Interesado bloqueado', { type: 'ok' }); tras([back, 'cli', 'clid:' + id, 'sol']); })
          .catch((e) => { rehab(); fail(e); });
      } });
    },
    modDesbloquear(el) {
      const id = el.dataset.id; const back = el.dataset.back;
      HH.confirm({ title: 'Desbloquear a @' + (el.dataset.u || ''), text: 'Vuelve a poder entrar, comprar y hacer pedidos.', okLabel: 'Desbloquear', onOk: () => {
        HH.api('POST', '/clientes/' + encodeURIComponent(id) + '/desbloquear')
          .then(() => { HH.toast('Interesado desbloqueado', { type: 'ok' }); tras([back, 'cli', 'clid:' + id, 'sol']); })
          .catch(fail);
      } });
    },
    modReenviar(el) {
      el.disabled = true;
      HH.api('POST', '/clientes/' + encodeURIComponent(el.dataset.id) + '/reenviar-verificacion')
        .then(() => { HH.toast('Email de confirmación reenviado', { type: 'ok' }); tras(['clid:' + el.dataset.id]); })
        .catch((e) => { el.disabled = false; fail(e); });
    },
    modDestDel(el) {
      const id = el.dataset.id; const did = el.dataset.d;
      HH.confirm({ title: 'Borrar destacada', text: `Se borra «${esc(el.dataset.t || '')}» con todos sus elementos y sus archivos. No se puede deshacer.`, okLabel: 'Borrar', cls: 'danger', onOk: () => {
        HH.api('DELETE', '/acompanantes/' + encodeURIComponent(id) + '/destacadas/' + encodeURIComponent(did))
          .then(() => { HH.toast('Destacada borrada', { type: 'ok' }); tras(['acx:' + id]); })
          .catch(fail);
      } });
    },
    modDestItemDel(el) {
      const id = el.dataset.id; const iid = el.dataset.i;
      HH.confirm({ title: 'Borrar elemento', text: 'Se borra la foto o el video de la destacada y su archivo. No se puede deshacer.', okLabel: 'Borrar', cls: 'danger', onOk: () => {
        HH.api('DELETE', '/acompanantes/' + encodeURIComponent(id) + '/destacadas/items/' + encodeURIComponent(iid))
          .then(() => { HH.toast('Elemento borrado', { type: 'ok' }); tras(['acx:' + id]); })
          .catch(fail);
      } });
    },
    modPackDel(el) {
      const id = el.dataset.id; const pid = el.dataset.p;
      HH.confirm({ title: 'Borrar pack', text: `«${esc(el.dataset.t || '')}» deja de estar a la venta y desaparece de su perfil. Las compras ya hechas no cambian. No se puede deshacer.`, okLabel: 'Borrar', cls: 'danger', onOk: () => {
        HH.api('DELETE', '/acompanantes/' + encodeURIComponent(id) + '/packs/' + encodeURIComponent(pid))
          .then(() => { HH.toast('Pack borrado', { type: 'ok' }); tras(['acx:' + id]); })
          .catch(fail);
      } });
    },
  });

  /* ---------- Estilos ---------- */
  const st = document.createElement('style');
  st.textContent = `
.mod-ult{max-width:320px;overflow-wrap:anywhere}.mod-ult svg{width:13px;height:13px;vertical-align:-2px}
.mod-chat{display:flex;flex-direction:column;gap:10px;max-height:70vh;overflow:auto;padding:4px}
.mod-msg{display:grid;gap:6px;padding:10px 12px;border-radius:14px;border:1px solid var(--line);max-width:min(560px,92%)}
.mod-msg.cli{align-self:flex-start;background:var(--surface)}
.mod-msg.aco{align-self:flex-end;background:var(--surface-2)}
.mod-sys{align-self:center;display:flex;gap:8px;align-items:center;font-size:12.5px;color:var(--muted);padding:4px 10px;border-radius:99px;background:var(--surface-2)}
.mod-media{display:grid;gap:6px;justify-items:start}
.mod-prev{min-height:120px;max-width:260px;width:100%}.mod-prev img{max-height:260px}
`;
  document.head.appendChild(st);
})();
