/* ============================================================
   SexyRose — prod-admin-captacion.js (admin real, 16/11/2026, decisión de Juan)
   Admin → Mensajería → Captación: invitar a acompañantes que publican en otros sitios, de a poco y a mano.
   - Importar la planilla (sexyrose-contactos.xlsx, hoja "Contactos", o un .csv): una fila por teléfono, sin duplicar.
   - "Los N del día": cada fila con "Abrir chat" (wa.me con el mensaje listo; Juan toca Enviar en WhatsApp Web con el
     chip del asistente). Al tocarlo queda "Abierto"; pasa a "Enviado" cuando el asistente ve el mensaje (o con
     "Marcar enviado"). Si responde, la atiende el asistente con el contexto de la invitación.
   - "Para revisar": nombres o notas que sugieren una menor o alguien muy joven, números extranjeros o inválidos.
     Nunca entran en la cola hasta que Juan los revise uno por uno.
   - Toda la lista con filtros y "Vaciar lista".
   También arma la tarjeta del mensaje de captación (Mensajería → Mensajes). API: app/routes/admin-captacion.js.
   ============================================================ */
(function () {
  'use strict';
  if (window.HH_PROD !== 'admin' || !HH.pa) return;
  const esc = HH.esc, icon = HH.icon;
  const P = HH.pa; const S = P.S;
  const { load, layout, head, fecha, loadingCard, stat } = P;
  const fail = (e) => HH.toast(e.message, { type: 'danger' });
  const errorCard = (msg, k) => `<div class="card"><div class="empty">${icon('alert')}<h4>No se pudo cargar</h4><p class="small">${esc(msg)}</p><button type="button" class="btn secondary sm" data-action="capRecargar" data-k="${esc(k)}">${icon('refresh')} Reintentar</button></div></div>`;
  const enVista = () => /^admin\.mensajeria\.(captacion|mensajes)$/.test((HH.current && HH.current.path) || '');
  const modalAbierto = () => document.getElementById('modalRoot').classList.contains('open');
  const rerender = () => { if (enVista() && !modalAbierto()) HH.refresh(); };
  S.capf = S.capf || 'todos'; S.capq = S.capq || '';

  const ESTADO = {
    pendiente: ['Pendiente', 'neutral'], abierto: ['Abierto', 'info'], enviado: ['Enviado', 'info'], respondio: ['Respondió', 'warn'],
    se_registro: ['Se registró', 'ok'], no_escribir: ['No escribir', 'danger'], revisar: ['Revisar', 'warn'], descartado: ['Descartado', 'neutral'],
    en_sitio: ['Ya está en el sitio', 'ok'],
  };
  const badgeE = (e) => { const [l, c] = ESTADO[e] || [e, 'neutral']; return `<span class="badge ${c}">${esc(l)}</span>`; };
  const nombre = (c) => (c.nombres && c.nombres.length ? c.nombres.slice(0, 3).join(' · ') + (c.nombres.length > 3 ? ` +${c.nombres.length - 3}` : '') : 'Sin nombre');
  const donde = (c) => [c.ciudades && c.ciudades.length ? c.ciudades.slice(0, 2).join(', ') : '', c.categorias && c.categorias.length ? c.categorias.join(', ') : ''].filter(Boolean).join(' · ');
  const sitios = (c) => `${c.sitios && c.sitios.length ? esc(c.sitios.join(', ')) : 'Sin sitio'} · ${c.avisos} ${HH.plural(c.avisos, 'aviso', 'avisos')}`;
  const listaPath = () => `/captacion/contactos?estado=${encodeURIComponent(S.capf)}${S.capq ? '&q=' + encodeURIComponent(S.capq) : ''}`;
  const listaKey = () => 'capl:' + S.capf + ':' + S.capq;
  const recargarTodo = () => { load('cap', '/captacion', true); load(listaKey(), listaPath(), true); };

  /* ---------- Los N del día ---------- */
  function filaCola(c) {
    return `<div class="list-item cap-item" style="align-items:flex-start;flex-wrap:wrap">
        <div class="grow" style="min-width:0;flex:1 1 220px">
          <div class="title" data-noi18n>${esc(nombre(c))} ${c.estado === 'abierto' ? badgeE('abierto') : ''}</div>
          <div class="sub" data-noi18n>${esc(donde(c) || 'Sin ciudad')}</div>
          <div class="tiny muted" data-noi18n>${sitios(c)} · ${esc(c.telefono)}</div>
        </div>
        <div class="row cap-acc" style="gap:6px;flex-wrap:wrap">
          ${c.waUrl ? `<a class="btn sm" href="${esc(c.waUrl)}" target="_blank" rel="noopener noreferrer" data-cap-abrir="${esc(c.id)}">${icon('whatsapp')} Abrir chat</a>` : ''}
          <button type="button" class="btn ghost sm" data-action="capEstado" data-id="${esc(c.id)}" data-e="enviado">${icon('check')} Marcar enviado</button>
        </div>
      </div>`;
  }
  function cardCola(d) {
    const k = d.cola || { items: [] };
    const hay = (d.numeros && d.numeros.total) || 0;
    let cuerpo;
    if (!hay) cuerpo = `<div class="empty">${icon('upload')}<h4>Todavía no hay contactos</h4><p class="small">Importá tu planilla abajo para armar la cola del día.</p></div>`;
    else if (!k.cupo) cuerpo = `<div class="notice ok">${icon('checkCircle')}<span>Listo por hoy: ya enviaste ${k.enviadosHoy} de ${k.porDia}. Mañana se arma la cola nueva.</span></div>`;
    else if (!k.items.length) cuerpo = `<div class="notice">${icon('info')}<span>No quedan contactos pendientes. Revisá los de "Para revisar" o importá una planilla nueva.</span></div>`;
    else cuerpo = `<div class="list">${k.items.map(filaCola).join('')}</div>`;
    return `<section class="card stack" style="gap:12px" id="capCola">
        <div class="row between" style="gap:10px;flex-wrap:wrap"><div class="card-title">${icon('send')} Los ${k.porDia} del día</div>
          <div class="row" style="gap:6px;align-items:center"><label class="small muted" for="capPorDia">Por día</label><input class="input pa-num" id="capPorDia" type="number" min="1" max="200" step="1" value="${esc(k.porDia)}" style="width:76px"><button type="button" class="btn ghost sm" data-action="capPorDia">Guardar</button></div></div>
        <p class="small muted" style="margin:0">Abrí WhatsApp Web con el chip del asistente. "Abrir chat" abre la conversación con el mensaje listo: solo tocás Enviar. Cuando el asistente ve el mensaje, pasa a Enviado; si te responde, contesta el asistente. Hoy: <strong>${k.enviadosHoy}</strong> de ${k.porDia} enviados.</p>
        ${cuerpo}
      </section>`;
  }

  /* ---------- Para revisar ---------- */
  function cardRevisar(d) {
    const items = d.revisar || [];
    if (!items.length) return '';
    return `<section class="card stack" style="gap:12px" id="capRevisar">
        <div class="row between"><div class="card-title">${icon('shield')} Para revisar <span class="badge warn" style="padding:0 7px">${items.length}</span></div></div>
        <p class="small muted" style="margin:0">No entran en la cola hasta que los revises uno por uno. Si hay cualquier duda sobre la edad, descartalo.</p>
        <div class="list">${items.map((c) => `<div class="list-item" style="align-items:flex-start;flex-wrap:wrap">
            <div class="grow" style="min-width:0;flex:1 1 240px">
              <div class="title" data-noi18n>${esc(nombre(c))}</div>
              <div class="sub" data-noi18n>${esc(donde(c) || 'Sin ciudad')} · ${sitios(c)} · ${esc(c.telefono)}</div>
              <div class="small ${c.tipoMotivo === 'joven' ? 'pa-danger' : ''}" style="margin-top:4px">${icon('alert')} ${esc(c.motivo || 'Revisar')}</div>
              ${c.nota ? `<div class="tiny muted" data-noi18n>Nota: ${esc(c.nota)}</div>` : ''}
              ${(c.urls || []).length ? `<div class="tiny cap-urls">${c.urls.slice(0, 3).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer nofollow">${esc(u.replace(/^https?:\/\//, '').slice(0, 60))}</a>`).join(' ')}</div>` : ''}
            </div>
            <div class="row" style="gap:6px;flex-wrap:wrap">
              <button type="button" class="btn secondary sm" data-action="capEstado" data-id="${esc(c.id)}" data-e="revisado" data-joven="${c.tipoMotivo === 'joven' ? '1' : ''}">${icon('check')} ${c.tipoMotivo === 'joven' ? 'Revisado: es mayor de edad' : 'Revisado: se puede escribir'}</button>
              <button type="button" class="btn ghost sm pa-danger" data-action="capEstado" data-id="${esc(c.id)}" data-e="descartado">${icon('x')} Descartar</button>
            </div></div>`).join('')}</div>
      </section>`;
  }

  /* ---------- Importar ---------- */
  function cardImportar() {
    const r = S.capImp;
    const res = r ? `<div class="notice ok">${icon('checkCircle')}<span>${r.telefonos} ${HH.plural(r.telefonos, 'teléfono', 'teléfonos')} de ${r.filasLeidas} ${HH.plural(r.filasLeidas, 'fila', 'filas')}${r.hoja ? ` (hoja ${esc(r.hoja)})` : ''}: ${r.nuevos} ${HH.plural(r.nuevos, 'nuevo', 'nuevos')}, ${r.actualizados} ya ${HH.plural(r.actualizados, 'estaba', 'estaban')}${r.repetidosEnArchivo ? `, ${r.repetidosEnArchivo} ${HH.plural(r.repetidosEnArchivo, 'repetido unido', 'repetidos unidos')}` : ''}${r.enSitio ? `, ${r.enSitio} ya ${HH.plural(r.enSitio, 'está', 'están')} en el sitio` : ''}${r.revisar ? `, ${r.revisar} para revisar` : ''}${r.sinTelefono ? `, ${r.sinTelefono} sin teléfono` : ''}.</span></div>` : '';
    return `<section class="card stack" style="gap:12px" id="capImportar">
        <div class="card-title">${icon('upload')} Importar planilla</div>
        <p class="small muted" style="margin:0">La hoja <strong>Contactos</strong> de tu Excel (o un .csv) con Nombres, Teléfono, Categoría, Ciudad, Sitios, Cantidad de avisos… Una fila por teléfono: los repetidos se unen. Si la volvés a subir, se suma sin duplicar y cada contacto conserva su estado. Los números que ya son de un perfil del sitio quedan como "Ya está en el sitio".</p>
        <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><label class="sr-only" for="capArchivo">Planilla</label><input class="input" id="capArchivo" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style="max-width:340px">
          <button type="button" class="btn sm" data-action="capImportar">${icon('upload')} Importar</button></div>
        ${res}
      </section>`;
  }

  /* ---------- Toda la lista ---------- */
  function filasLista() {
    const d = S[listaKey()];
    if (!d && S.err[listaKey()]) return errorCard(S.err[listaKey()], 'lista');
    if (!d) return loadingCard(2);
    const items = d.items || [];
    if (!items.length) return `<div class="card"><div class="empty">${icon('search')}<h4>Sin contactos</h4><p class="small">Probá con otro filtro o búsqueda.</p></div></div>`;
    const acc = (c) => {
      const b = [];
      if (c.conversacion) b.push(`<a class="btn ghost sm" href="#admin.mensajeria.conversaciones.${esc(c.conversacion)}" data-go="#admin.mensajeria.conversaciones.${esc(c.conversacion)}">${icon('chat')} Chat</a>`);
      if (c.cuenta) b.push(`<a class="btn ghost sm" href="#admin.acompanantes.${esc(c.cuenta.id)}" data-go="#admin.acompanantes.${esc(c.cuenta.id)}">${icon('user')} Perfil</a>`);
      if (['pendiente', 'abierto', 'enviado', 'respondio'].includes(c.estado)) b.push(`<button type="button" class="btn ghost sm" data-action="capEstado" data-id="${esc(c.id)}" data-e="no_escribir">No escribir</button>`);
      return b.join('');
    };
    const tabla = `<div class="table-wrap pa-table"><table class="table"><thead><tr><th>Nombre</th><th>Ciudad</th><th>Sitios</th><th>Estado</th><th>Actualizado</th><th></th></tr></thead><tbody>
      ${items.map((c) => `<tr><td><strong data-noi18n>${esc(nombre(c))}</strong><div class="tiny muted" data-noi18n>${esc(c.telefono)}</div></td><td class="small" data-noi18n>${esc(donde(c))}</td><td class="small" data-noi18n>${sitios(c)}</td><td>${badgeE(c.estado)}</td><td class="small muted nowrap">${fecha(c.respondio || c.enviado || c.abierto || c.registrado || '') || '—'}</td><td class="cap-acc-td"><div class="row" style="gap:4px;flex-wrap:wrap;justify-content:flex-end">${acc(c)}</div></td></tr>`).join('')}
      </tbody></table></div>`;
    const tarjetas = `<div class="pa-cards">${items.map((c) => `<div class="card stack" style="gap:6px">
        <div class="row between nowrap"><strong data-noi18n>${esc(nombre(c))}</strong>${badgeE(c.estado)}</div>
        <div class="small" data-noi18n>${esc(donde(c) || 'Sin ciudad')}</div>
        <div class="tiny muted" data-noi18n>${sitios(c)} · ${esc(c.telefono)}</div>
        ${acc(c) ? `<div class="row" style="gap:6px;flex-wrap:wrap">${acc(c)}</div>` : ''}</div>`).join('')}</div>`;
    return `${tabla}${tarjetas}${d.total > items.length ? `<p class="tiny muted">Se muestran ${items.length} de ${d.total}. Usá la búsqueda o los filtros para ver otros.</p>` : ''}`;
  }
  function cardLista(d) {
    const e = d.estados || {};
    const tot = (d.numeros && d.numeros.total) || 0;
    const f = (k, l, n) => `<button type="button" class="chip${S.capf === k ? ' active' : ''}" data-action="capFiltro" data-f="${k}" aria-pressed="${S.capf === k}">${l}${n != null ? ` <span class="badge" style="padding:0 6px">${n}</span>` : ''}</button>`;
    const chips = [f('todos', 'Todos', tot)].concat(Object.keys(ESTADO).filter((k) => e[k]).map((k) => f(k, ESTADO[k][0], e[k]))).join('');
    return `<section class="stack" style="gap:12px" id="capLista">
        <div class="card-title">${icon('users')} Toda la lista</div>
        <div class="adm-filters"><label class="sr-only" for="capQ">Buscar contacto</label><input class="input" id="capQ" type="search" placeholder="Buscar por nombre, ciudad, sitio o últimos números" value="${esc(S.capq)}" data-input="capBuscar" autocomplete="off">
          <div class="chips scroll" style="flex:1 1 auto;min-width:0">${chips}</div></div>
        <div id="capFilas">${filasLista()}</div>
      </section>`;
  }

  function vCaptacion() {
    load('cap', '/captacion'); load(listaKey(), listaPath());
    const d = S.cap;
    let body;
    if (!d && S.err.cap) body = errorCard(S.err.cap, 'cap');
    else if (!d) body = loadingCard(3);
    else {
      const n = d.numeros || {}; const e = d.estados || {};
      const stats = `<div class="adm-stats">
          ${stat('Enviados hoy', `${n.enviadosHoy || 0}<span class="cap-de"> / ${(d.cola && d.cola.porDia) || 0}</span>`, `${n.enviadosSemana || 0} esta semana`, 'accent')}
          ${stat('Pendientes', ((e.pendiente || 0) + (e.abierto || 0)).toLocaleString('es-AR'), `${e.abierto || 0} ${HH.plural(e.abierto || 0, 'abierto', 'abiertos')} sin enviar`)}
          ${stat('Respondieron', (n.respondieron || 0).toLocaleString('es-AR'), n.tasaRespuesta != null ? `${String(n.tasaRespuesta).replace('.', ',')} % de ${n.contactados} ${HH.plural(n.contactados, 'contactado', 'contactados')}` : 'todavía sin envíos')}
          ${stat('Se registraron', (n.registrados || 0).toLocaleString('es-AR'), `${n.registradosInvitados || 0} después de la invitación`, n.registrados ? 'pa-ok' : '')}
          ${stat('Para revisar', (e.revisar || 0).toLocaleString('es-AR'), e.revisar ? 'no entran en la cola' : 'ninguno', e.revisar ? 'pa-warn' : '')}
          ${stat('No escribir', (e.no_escribir || 0).toLocaleString('es-AR'), `${e.descartado || 0} ${HH.plural(e.descartado || 0, 'descartado', 'descartados')} · ${e.en_sitio || 0} ya en el sitio`)}
        </div>`;
      const vaciar = n.total ? `<section class="card stack" style="gap:10px"><div class="card-title">${icon('trash')} Vaciar lista</div>
          <p class="small muted" style="margin:0">Borra todos los contactos que no se registraron (${(n.total - (n.registrados || 0)).toLocaleString('es-AR')}). No se puede deshacer.</p>
          <div class="row"><button type="button" class="btn ghost sm pa-danger" data-action="capVaciar">${icon('trash')} Vaciar lista</button></div></section>` : '';
      body = n.total
        ? `${stats}${cardCola(d)}${cardRevisar(d)}${cardImportar()}${cardLista(d)}${vaciar}`
        : `${stats}${cardImportar()}${cardCola(d)}`;
    }
    const right = `<div class="row" style="gap:8px"><button type="button" class="btn ghost sm" data-action="capRecargar" data-k="todo">${icon('refresh')} Actualizar</button></div>`;
    return layout('mensajeria', `${head('Mensajería', right, 'Invitá de a poco a acompañantes que publican en otros sitios: vos tocás Enviar, el asistente responde')}<div class="stack" style="gap:16px">${body}</div>`);
  }

  /* ---------- Mensajería → Mensajes: el mensaje de captación ---------- */
  function mensajeCard() {
    load('cap', '/captacion');
    const d = S.cap;
    if (!d && S.err.cap) return errorCard(S.err.cap, 'cap');
    if (!d) return loadingCard(1);
    const aj = d.ajustes || {};
    const esDefault = aj.mensaje === aj.mensajeDefault;
    return `<section class="card stack" style="gap:12px" id="capMensaje">
        <div class="row between"><div class="card-title">${icon('send')} Invitación de captación</div>${esDefault ? '<span class="badge ok">Texto aprobado</span>' : '<span class="badge info">Editado</span>'}</div>
        <p class="small muted" style="margin:0">Es el mensaje que se abre con "Abrir chat" en Captación. En WhatsApp, lo que va entre *asteriscos* se ve en negrita. Si lo cambiás, el asistente reconoce igual los envíos que ya hiciste.</p>
        <div class="field"><label for="capMsg">Mensaje</label><textarea class="textarea" id="capMsg" rows="9" maxlength="1000" data-noi18n>${esc(aj.mensaje || '')}</textarea></div>
        <div class="row" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn sm" data-action="capMsgGuardar">${icon('check')} Guardar invitación</button>
          ${esDefault ? '' : `<button type="button" class="btn ghost sm" data-action="capMsgDefault">${icon('refresh')} Volver al texto aprobado</button>`}</div>
      </section>`;
  }

  /* ---------- Rutas y acciones ---------- */
  P.subvistas['mensajeria.captacion'] = vCaptacion;
  HH.adminCap = { mensajeCard };

  const guardarAj = (cambios, ok) => HH.api('PUT', '/captacion/ajustes', cambios).then((r) => { S.cap = r; HH.toast(ok, { type: 'ok' }); load(listaKey(), listaPath(), true); rerender(); }).catch(fail);
  let tBuscar = null;
  Object.assign(HH.actions, {
    capRecargar(el) {
      const k = el.dataset.k;
      if (k === 'lista') load(listaKey(), listaPath(), true);
      else recargarTodo();
    },
    capFiltro(el) { S.capf = el.dataset.f; load(listaKey(), listaPath()); HH.refresh(); },
    capBuscar(el) {
      S.capq = el.value.trim().slice(0, 60);
      clearTimeout(tBuscar);
      tBuscar = setTimeout(() => {
        load(listaKey(), listaPath());
        const box = document.getElementById('capFilas'); if (box) box.innerHTML = filasLista();
      }, 300);
    },
    capEstado(el) {
      const id = el.dataset.id; const e = el.dataset.e;
      const hacer = () => {
        el.disabled = true;
        HH.api('POST', '/captacion/' + encodeURIComponent(id) + '/estado', { estado: e })
          .then(() => { HH.toast({ enviado: 'Marcado como enviado', revisado: 'Revisado: vuelve a la cola', descartado: 'Descartado', no_escribir: 'No se le va a escribir más', pendiente: 'Vuelve a la cola' }[e] || 'Listo', { type: 'ok' }); recargarTodo(); })
          .catch((x) => { el.disabled = false; fail(x); });
      };
      if (e === 'revisado' && el.dataset.joven) {
        HH.confirm({ title: 'Confirmar que es mayor de edad', text: '<span>Revisaste el aviso y es una persona mayor de edad.</span> <span>Vuelve a la cola de invitaciones. Ante cualquier duda, descartalo.</span>', okLabel: 'Sí, es mayor de edad', onOk: hacer });
      } else if (e === 'no_escribir') {
        HH.confirm({ title: 'No escribirle más', text: 'Sale de la cola y no se le vuelve a invitar.', okLabel: 'No escribir', cls: 'danger', onOk: hacer });
      } else hacer();
    },
    capPorDia() {
      const n = Number((document.getElementById('capPorDia') || {}).value);
      if (!Number.isInteger(n) || n < 1 || n > 200) { HH.toast('Por día: un número entero de 1 a 200.', { type: 'warn' }); return; }
      guardarAj({ porDia: n }, `Cola de ${n} por día`);
    },
    capMsgGuardar() {
      const t = String((document.getElementById('capMsg') || {}).value || '').trim();
      if (t && t.length < 20) { HH.toast('El mensaje es muy corto.', { type: 'warn' }); return; }
      guardarAj({ mensaje: t }, 'Invitación guardada');
    },
    capMsgDefault() {
      HH.confirm({ title: 'Volver al texto aprobado', text: 'Se reemplaza el mensaje por el texto que aprobaste.', okLabel: 'Volver al aprobado', onOk: () => guardarAj({ mensaje: '' }, 'Volvió el texto aprobado') });
    },
    capImportar(el) {
      const inp = document.getElementById('capArchivo');
      const f = inp && inp.files && inp.files[0];
      if (!f) { HH.toast('Elegí la planilla (.xlsx o .csv).', { type: 'warn' }); return; }
      if (f.size > 8 * 1024 * 1024) { HH.toast('El archivo pesa más de 8 MB.', { type: 'warn' }); return; }
      el.disabled = true; const antes = el.innerHTML; el.innerHTML = 'Importando…';
      f.arrayBuffer().then((buf) => fetch(P.API + '/captacion/importar?nombre=' + encodeURIComponent(f.name), {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', body: buf,
        headers: { 'Content-Type': 'application/octet-stream', 'X-SR-Admin': '1', Accept: 'application/json' },
      })).then(async (res) => {
        let data = null; try { data = await res.json(); } catch (e) { /* sin JSON */ }
        if (res.status === 401 || res.status === 403) throw new Error((data && data.error) || 'Tu sesión del panel venció. Recargá la página.');
        if (!res.ok) throw new Error((data && data.error) || 'Error del servidor (' + res.status + ').');
        S.capImp = data; S.cap = data.resumen;
        HH.toast(`Planilla importada: ${data.telefonos} ${HH.plural(data.telefonos, 'teléfono', 'teléfonos')}`, { type: 'ok' });
        load(listaKey(), listaPath(), true); rerender();
      }).catch(fail).finally(() => { el.disabled = false; el.innerHTML = antes; });
    },
    capVaciar() {
      const n = S.cap && S.cap.numeros ? S.cap.numeros.total - (S.cap.numeros.registrados || 0) : 0;
      HH.confirm({ title: 'Vaciar lista de captación', text: `<span>Se borran ${n.toLocaleString('es-AR')} ${HH.plural(n, 'contacto', 'contactos')} (todos menos los que se registraron).</span> <span>No se puede deshacer.</span>`, okLabel: 'Vaciar lista', cls: 'danger', onOk: () => {
        HH.api('POST', '/captacion/vaciar', { confirmar: true }).then((r) => { S.cap = r.resumen; S.capImp = null; HH.toast(`Lista vaciada: ${r.borrados} ${HH.plural(r.borrados, 'contacto borrado', 'contactos borrados')}`, { type: 'ok' }); Object.keys(S).filter((k) => k.startsWith('capl:')).forEach((k) => { S[k] = null; }); load(listaKey(), listaPath(), true); rerender(); }).catch(fail);
      } });
    },
  });
  // "Abrir chat": el enlace abre WhatsApp en otra pestaña (sin data-action, así el navegador lo abre solo) y acá se marca
  // "Abierto". Pasa a "Enviado" cuando el asistente ve el mensaje.
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest && ev.target.closest('[data-cap-abrir]');
    if (!a) return;
    const id = a.getAttribute('data-cap-abrir');
    const it = S.cap && S.cap.cola && (S.cap.cola.items || []).find((x) => x.id === id);
    if (it) it.estado = 'abierto';
    HH.api('POST', '/captacion/' + encodeURIComponent(id) + '/abierto', {}).then(() => { setTimeout(() => { if (enVista()) recargarTodo(); }, 400); }).catch(() => {});
  });

  const st = document.createElement('style');
  st.textContent = `
.cap-acc{justify-content:flex-end;margin-left:auto}
.cap-urls a{margin-right:8px;overflow-wrap:anywhere}
.cap-acc-td{min-width:150px}
.cap-de{font-size:.55em;color:var(--muted);font-weight:700}
@media(max-width:560px){.cap-acc{margin-left:0;width:100%}.cap-acc .btn{flex:1 1 auto;justify-content:center}}
`;
  document.head.appendChild(st);
})();
