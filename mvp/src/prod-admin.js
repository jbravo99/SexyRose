/* ============================================================
   SexyRose — prod-admin.js (Fase 0 de la migración a producción)
   Panel de administración real: el mismo diseño y menú del admin de la demo, con datos reales
   que trae la API del servidor (app/server.js, ADMIN_PATH + /api/…).
   Solo se activa en el paquete admin (build.py con HH_TARGET=admin → window.HH_PROD = 'admin').
   Sin datos de demo, sin cuentas de prueba y sin guardar nada en el navegador.
   ============================================================ */
(function () {
  'use strict';
  if (window.HH_PROD !== 'admin') return;
  HH.PROD = 'admin';
  const esc = HH.esc, icon = HH.icon;
  const BASE = location.pathname.replace(/\/+$/, '');
  const API = BASE + '/api';
  const MAX_VALOR = 5000;
  const DL = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>';

  /* ---------- Sin demo: nada se guarda en el navegador, idioma fijo en español ---------- */
  HH.save = function () { /* el panel real no guarda datos en el navegador */ };
  HH.load = function () { return false; };
  HH.autoLocate = function () { /* sin ubicación en el admin */ };
  HH.lang = 'es'; document.documentElement.lang = 'es-AR';
  HH.setLang = function () { /* el admin queda en español */ };

  const ADMIN = { id: 'u_admin', role: 'admin', name: 'Administración', shortName: 'Admin', email: 'Acceso protegido', hue: 330, createdAt: new Date().toISOString() };
  // Base vacía con la misma forma que la de la demo (así los helpers existentes no fallan), sin ningún dato de demo
  function emptyDb() {
    const s = HH.seed(); const db = {};
    Object.keys(s).forEach((k) => { db[k] = Array.isArray(s[k]) ? [] : s[k]; });
    db.users = [ADMIN];
    return db;
  }

  /* ---------- API ---------- */
  const err = (message, status) => Object.assign(new Error(message), { status });
  HH.api = async function (method, path, body) {
    const opt = { method, credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } };
    if (method !== 'GET') { opt.headers['Content-Type'] = 'application/json'; opt.headers['X-SR-Admin'] = '1'; opt.body = JSON.stringify(body || {}); }
    let res;
    try { res = await fetch(API + path, opt); } catch (e) { throw err('No hay conexión con el servidor. Revisá internet y probá de nuevo.', 0); }
    if (res.status === 401 || res.status === 403) throw err('Tu sesión del panel venció. Recargá la página para volver a entrar.', res.status);
    let data = null; try { data = await res.json(); } catch (e) { /* respuesta sin JSON */ }
    if (!res.ok) throw err((data && data.error) || (res.status === 503 ? 'El servidor todavía está arrancando. Probá en unos segundos.' : 'Error del servidor (' + res.status + ').'), res.status);
    return data || {};
  };

  /* ---------- Estado del panel ---------- */
  const S = { res: null, pre: null, den: null, txt: null, page: {}, loading: {}, err: {}, pf: 'all', pq: '', tf: 'all', edits: {}, curPage: null };
  const isAdminView = () => /^admin(\.|$)/.test((HH.current && HH.current.path) || '');
  const rerender = () => { if (isAdminView() && !document.getElementById('modalRoot').classList.contains('open')) HH.refresh(); else if (isAdminView()) HH._prodPending = true; };
  function load(key, path, force) {
    if (S.loading[key] || (!force && S[key] != null)) return;
    S.loading[key] = true; S.err[key] = null;
    HH.api('GET', path)
      .then((d) => { S[key] = d; })
      .catch((e) => { S.err[key] = e.message; if (force && S[key]) HH.toast(e.message, { type: 'danger' }); })
      .finally(() => { S.loading[key] = false; rerender(); });
  }
  function loadPage(id, force) {
    const k = 'page:' + id;
    if (S.loading[k] || (!force && S.page[id])) return;
    S.loading[k] = true; S.err[k] = null;
    HH.api('GET', '/textos/' + encodeURIComponent(id))
      .then((d) => { S.page[id] = d; })
      .catch((e) => { S.err[k] = e.message; })
      .finally(() => { S.loading[k] = false; rerender(); });
  }
  const refreshResumen = () => load('res', '/resumen', true);

  /* ---------- Formato ---------- */
  const GENERO = { mujer: 'Mujer', trans: 'Trans', hombre: 'Hombre' };
  const ESTADOS = [['nuevo', 'Nuevo'], ['contactado', 'Contactado'], ['invitado', 'Invitado'], ['descartado', 'Descartado']];
  const ESTADO_BADGE = { nuevo: 'warn', contactado: 'info', invitado: 'ok', descartado: 'neutral' };
  const fecha = (iso) => (iso ? HH.fmtDateTime(iso) : '');
  const ext = (href, text) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  function contactoHtml(r) {
    const c = String(r.contacto || '').trim(); const t = r.contacto_tipo;
    if (t === 'whatsapp') { const d = c.replace(/\D/g, ''); if (d.length >= 8) return `${icon('whatsapp')} ${ext('https://wa.me/' + d, esc(c))}`; }
    if (t === 'telegram') { const u = c.replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, ''); if (/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(u)) return `${icon('send')} ${ext('https://t.me/' + u, esc('@' + u))}`; return `${icon('send')} ${esc(c)}`; }
    if (t === 'email' && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(c)) return `${icon('mail')} <a href="mailto:${esc(c)}">${esc(c)}</a>`;
    return esc(c);
  }
  const loadingCard = (n = 3) => `<div class="stack" aria-busy="true" aria-label="Cargando">${Array.from({ length: n }, () => '<div class="pa-skel"></div>').join('')}</div>`;
  const errorCard = (msg, key) => `<div class="card"><div class="empty">${icon('alert')}<h4>No se pudo cargar</h4><p class="small">${esc(msg)}</p><button type="button" class="btn secondary sm" data-action="prodRetry" data-k="${esc(key)}">${icon('refresh')} Reintentar</button></div></div>`;
  const stat = (k, v, d, cls) => `<div class="stat ${cls || ''}"><span class="k">${k}</span><span class="v">${v}</span>${d ? `<span class="d">${d}</span>` : ''}</div>`;
  const head = (t, right, sub) => HH.adminHead(t, right, sub);
  const layout = (tab, inner) => HH.adminLayout(HH.me(), tab, inner);

  /* ---------- Menú: el de la demo + Pre-registros y Textos ---------- */
  const TABS = HH.adminTabs;
  if (!TABS.some((t) => t.id === 'preregistros')) TABS.splice(Math.max(0, TABS.findIndex((t) => t.id === 'resumen')) + 1, 0, { id: 'preregistros', label: 'Pre-registros', icon: 'inbox' });
  if (!TABS.some((t) => t.id === 'textos')) { const i = TABS.findIndex((t) => t.id === 'apariencia'); TABS.splice(i >= 0 ? i + 1 : TABS.length, 0, { id: 'textos', label: 'Textos', icon: 'edit' }); }
  { const i = TABS.findIndex((t) => t.id === 'apariencia'); if (i >= 0) TABS.splice(i, 1); } // la portada se edita en Ajustes
  // Planes v2: «Pagos» (transferencia por plan) pasa a «Pedidos» de créditos; se suman Renovaciones y Destacados
  { const t = TABS.find((x) => x.id === 'pagos'); if (t) Object.assign(t, { id: 'pedidos', label: 'Pedidos', icon: 'wallet' }); else if (!TABS.some((x) => x.id === 'pedidos')) TABS.push({ id: 'pedidos', label: 'Pedidos', icon: 'wallet' }); }
  if (!TABS.some((t) => t.id === 'renovaciones')) { const i = TABS.findIndex((t) => t.id === 'suscripciones'); TABS.splice(i >= 0 ? i + 1 : TABS.length, 0, { id: 'renovaciones', label: 'Renovaciones', icon: 'refresh' }); }
  if (!TABS.some((t) => t.id === 'destacados')) { const i = TABS.findIndex((t) => t.id === 'stars'); TABS.splice(i >= 0 ? i + 1 : TABS.length, 0, { id: 'destacados', label: 'Destacados', icon: 'trending' }); }
  const counts = {};
  TABS.forEach((t) => { counts[t.id] = () => 0; });
  counts.acompanantes = () => ((S.res && S.res.acompanantes ? S.res.acompanantes.enRevision : 0) || 0) + ((S.res && S.res.verificacionesPendientes) || 0);
  counts.pedidos = () => (S.res && S.res.pedidosCreditos ? S.res.pedidosCreditos.pendientes : 0) || 0;
  counts.renovaciones = () => (S.res ? (S.res.pausadasSinSaldo || 0) + ((S.res.vencen7 && S.res.vencen7.sinSaldo) || 0) : 0);
  counts.preregistros = () => (S.res && S.res.preregistros ? S.res.preregistros.nuevos : 0) || 0;
  counts.reportes = () => (S.res && S.res.denuncias ? S.res.denuncias.abiertas : 0) || 0;
  HH.adminCounts = counts;

  /* ---------- Resumen ---------- */
  function vResumen() {
    load('res', '/resumen'); load('dst', '/destacados');
    const r = S.res;
    let body;
    if (!r && S.err.res) body = errorCard(S.err.res, 'res');
    else if (!r) body = loadingCard(2);
    else {
      const p = r.preregistros || {}, d = r.denuncias || {}, t = r.textos || {};
      const ac = r.acompanantes || {}, vp = r.verificacionesPendientes || 0, pc = r.pedidosCreditos || {};
      const pa = r.pausadasSinSaldo || 0, v7 = r.vencen7 || {};
      const dAct = S.dst ? (S.dst.items || []).filter((x) => x.estado === 'activo' && x.vigente).length : null;
      const pend = [];
      if (pc.pendientes) pend.push({ ic: 'wallet', cls: 'warn', t: `${pc.pendientes} ${HH.plural(pc.pendientes, 'pedido de créditos pendiente', 'pedidos de créditos pendientes')}`, s: `${pc.conComprobante || 0} con comprobante. Confirmá cuando el pago esté en tu cuenta.`, go: '#admin.pedidos' });
      if (pa) pend.push({ ic: 'clock', cls: 'danger', t: `${pa} ${HH.plural(pa, 'perfil pausado', 'perfiles pausados')} por falta de saldo`, s: 'No les alcanzaron los créditos para renovar el plan.', go: '#admin.renovaciones' });
      if (v7.sinSaldo) pend.push({ ic: 'alert', cls: 'warn', t: `${v7.sinSaldo} ${HH.plural(v7.sinSaldo, 'plan vence', 'planes vencen')} en 7 días sin saldo para renovar`, s: 'Avisales que carguen créditos antes del vencimiento.', go: '#admin.renovaciones' });
      if (vp) pend.push({ ic: 'shield', cls: 'warn', t: `${vp} ${HH.plural(vp, 'verificación pendiente', 'verificaciones pendientes')}`, s: 'Compará la selfie con el documento y aprobá o rechazá.', go: '#admin.acompanantes' });
      if (ac.enRevision) pend.push({ ic: 'users', cls: 'info', t: `${ac.enRevision} ${HH.plural(ac.enRevision, 'perfil en revisión', 'perfiles en revisión')}`, s: 'Se publican al aprobar la identidad.', go: '#admin.acompanantes' });
      if (d.urgentes) pend.push({ ic: 'alert', cls: 'danger', t: `${d.urgentes} ${HH.plural(d.urgentes, 'denuncia urgente', 'denuncias urgentes')} sin resolver`, s: 'Abuso infantil, imágenes sin consentimiento o trata: revisar ya.', go: '#admin.reportes' });
      if (d.abiertas && d.abiertas !== d.urgentes) pend.push({ ic: 'flag', cls: 'warn', t: `${d.abiertas} ${HH.plural(d.abiertas, 'denuncia abierta', 'denuncias abiertas')}`, s: 'Marcalas como resueltas cuando las revises.', go: '#admin.reportes' });
      if (p.nuevos) pend.push({ ic: 'inbox', cls: 'info', t: `${p.nuevos} ${HH.plural(p.nuevos, 'pre-registro nuevo', 'pre-registros nuevos')}`, s: 'Contactalas y marcá el estado de cada una.', go: '#admin.preregistros' });
      body = `<div class="adm-stats">
          <a class="pa-statlink" href="#admin.acompanantes" data-go="#admin.acompanantes">${stat('Acompañantes', (ac.total || 0).toLocaleString('es-AR'), `${ac.publicadas || 0} publicadas · ${ac.enRevision || 0} en revisión`, 'accent')}</a>
          <a class="pa-statlink" href="#admin.acompanantes" data-go="#admin.acompanantes">${stat('Verificaciones', vp, vp ? 'pendientes de revisar' : 'todo al día', vp ? 'pa-warn' : '')}</a>
          <a class="pa-statlink" href="#admin.pedidos" data-go="#admin.pedidos">${stat('Pedidos pendientes', pc.pendientes || 0, `${pc.conComprobante || 0} con comprobante`, pc.pendientes ? 'pa-warn' : '')}</a>
          <a class="pa-statlink" href="#admin.renovaciones" data-go="#admin.renovaciones">${stat('Pausadas por saldo', pa, pa ? 'no les alcanzó para renovar' : 'ninguna', pa ? 'pa-danger' : '')}</a>
          <a class="pa-statlink" href="#admin.renovaciones" data-go="#admin.renovaciones">${stat('Vencen en 7 días', v7.total || 0, `${v7.sinSaldo || 0} sin saldo para renovar`, v7.sinSaldo ? 'pa-warn' : '')}</a>
          <a class="pa-statlink" href="#admin.destacados" data-go="#admin.destacados">${stat('Destacados activos', dAct == null ? '…' : dAct, 'ahora en el sitio')}</a>
          ${stat('Pre-registros', (p.total || 0).toLocaleString('es-AR'), `${p.ultimos7 || 0} en los últimos 7 días`)}
          ${stat('Por contactar', p.nuevos || 0, p.nuevos ? 'en estado nuevo' : 'todo al día')}
          ${stat('Denuncias abiertas', d.abiertas || 0, `de ${d.total || 0} recibidas`)}
          ${stat('Urgentes', d.urgentes || 0, d.urgentes ? 'revisar ya' : 'ninguna pendiente', d.urgentes ? 'pa-danger' : '')}
          ${stat('Textos modificados', t.modificados || 0, `de ${t.total || 0} textos editables`)}
        </div>
        <div class="card stack" style="gap:10px">
          <div class="card-title">Pendientes</div>
          ${pend.length ? `<div class="list">${pend.map((x) => `<a class="list-item" href="${x.go}" data-go="${x.go}"><span class="badge ${x.cls}" style="padding:6px">${icon(x.ic)}</span><div class="grow" style="min-width:0"><div class="title">${esc(x.t)}</div><div class="sub">${esc(x.s)}</div></div>${icon('chevronRight')}</a>`).join('')}</div>` : `<p class="small muted">Nada pendiente. Los pedidos de créditos, los perfiles pausados por saldo, las verificaciones, las denuncias y los pre-registros nuevos aparecen acá.</p>`}
        </div>
        <div class="card stack" style="gap:10px">
          <div class="card-title">Migración a producción</div>
          <p class="small muted">Este panel es el mismo de la demostración, conectado a los datos reales del sitio. Las secciones marcadas como «Próximamente» se activan cuando su parte del sitio tenga datos reales.</p>
          <div class="list">
            <div class="list-item">${icon('checkCircle')}<div class="grow"><div class="title">Fase 0 · En línea</div><div class="sub">Resumen, Pre-registros, Reportes (denuncias) y Textos del sitio.</div></div><span class="badge ok">Activo</span></div>
            <div class="list-item">${icon('users')}<div class="grow"><div class="title">Fase 1 · Cuentas y perfiles</div><div class="sub">Acompañantes, verificación manual, ubicaciones, categorías e intereses, portada.</div></div><span class="badge ok">Activo</span></div>
            <div class="list-item">${icon('wallet')}<div class="grow"><div class="title">Fase 2 · Planes y créditos</div><div class="sub">4 planes (Bronce, Plata, Oro y Star), créditos por WhatsApp, renovación automática, Destacado, Stars y precios.</div></div><span class="badge ok">Activo</span></div>
            <div class="list-item">${icon('film')}<div class="grow"><div class="title">Fase 3 · Historias y videos</div><div class="sub">Historias, destacadas, shorts, videos, estadísticas y soporte.</div></div><span class="badge neutral">Próximamente</span></div>
            <div class="list-item">${icon('bag')}<div class="grow"><div class="title">Fase 4 · Venta de contenido</div><div class="sub">Fotos y videos premium, packs y pedidos a medida, cuando apruebe un procesador de pagos.</div></div><span class="badge neutral">Próximamente</span></div>
          </div>
        </div>`;
    }
    const right = `<button type="button" class="btn ghost sm" data-action="prodRetry" data-k="res">${icon('refresh')} Actualizar</button>`;
    return layout('resumen', `${head('Resumen', right, r && r.generado ? 'Datos al ' + fecha(r.generado) : 'Datos reales del sitio')}<div class="stack" style="gap:16px">${body}</div>`);
  }

  /* ---------- Pre-registros ---------- */
  const preMatch = (r) => {
    if (S.pf !== 'all' && r.estado !== S.pf) return false;
    const q = S.pq.trim().toLowerCase(); if (!q) return true;
    return [r.nombre_artistico, r.ciudad, r.provincia, r.contacto].some((v) => String(v || '').toLowerCase().includes(q));
  };
  const estadoSelect = (r) => `<select class="select pa-sel" data-change="prodPreEstado" data-id="${esc(r.id)}" aria-label="Estado de ${esc(r.nombre_artistico)}">${ESTADOS.map(([k, l]) => `<option value="${k}"${r.estado === k ? ' selected' : ''}>${l}</option>`).join('')}${ESTADOS.some(([k]) => k === r.estado) ? '' : `<option value="${esc(r.estado)}" selected>${esc(r.estado)}</option>`}</select>`;
  function preRows() {
    const items = ((S.pre && S.pre.items) || []).filter(preMatch);
    if (!items.length) return `<div class="card"><div class="empty">${icon('search')}<h4>${(S.pre && S.pre.items && S.pre.items.length) ? 'Sin resultados' : 'Todavía no hay pre-registros'}</h4><p class="small">${(S.pre && S.pre.items && S.pre.items.length) ? 'Probá con otro filtro o búsqueda.' : 'Cuando una acompañante complete el formulario de la portada, aparece acá.'}</p></div></div>`;
    const loc = (r) => `${esc(r.ciudad)}${r.provincia ? `<span class="muted">, ${esc(r.provincia)}</span>` : ''}`;
    const table = `<div class="table-wrap pa-table"><table class="table"><thead><tr><th>Fecha</th><th>Nombre</th><th>Género</th><th>Ubicación</th><th>Contacto</th><th>Plan</th><th>Estado</th></tr></thead><tbody>
      ${items.map((r) => `<tr><td class="small muted">${fecha(r.creado)}</td><td><strong data-noi18n>${esc(r.nombre_artistico)}</strong></td><td class="small">${GENERO[r.genero] || esc(r.genero)}</td><td class="small">${loc(r)}</td><td class="small pa-contact">${contactoHtml(r)}</td><td class="small">${esc(r.plan_label || r.plan_interes)}</td><td>${estadoSelect(r)}</td></tr>`).join('')}
      </tbody></table></div>`;
    const cards = `<div class="pa-cards">${items.map((r) => `<article class="card stack" style="gap:8px">
        <div class="row between nowrap" style="align-items:flex-start"><div style="min-width:0"><div class="ellipsis" style="font-weight:800" data-noi18n>${esc(r.nombre_artistico)}</div><div class="small muted">${GENERO[r.genero] || esc(r.genero)} · ${loc(r)}</div></div><span class="badge ${ESTADO_BADGE[r.estado] || 'neutral'}">${esc((ESTADOS.find(([k]) => k === r.estado) || [0, r.estado])[1])}</span></div>
        <div class="small pa-contact">${contactoHtml(r)}</div>
        <div class="row between small"><span class="muted">${fecha(r.creado)}</span><span>Plan: <strong>${esc(r.plan_label || r.plan_interes)}</strong></span></div>
        ${estadoSelect(r)}
      </article>`).join('')}</div>`;
    return table + cards;
  }
  function vPre() {
    load('pre', '/preregistros');
    let body;
    if (!S.pre && S.err.pre) body = errorCard(S.err.pre, 'pre');
    else if (!S.pre) body = loadingCard(4);
    else {
      const all = S.pre.items || [];
      const n = (k) => all.filter((r) => r.estado === k).length;
      const chip = (k, l, c) => `<button type="button" class="chip${S.pf === k ? ' active' : ''}" data-action="prodPreFilter" data-f="${k}" aria-pressed="${S.pf === k}">${l}${c != null ? ` <span class="badge" style="padding:0 6px">${c}</span>` : ''}</button>`;
      body = `<div class="adm-filters">
          <label class="sr-only" for="prodPreQ">Buscar pre-registro</label><input class="input" id="prodPreQ" type="search" placeholder="Buscar por nombre, ciudad o contacto" value="${esc(S.pq)}" data-input="prodPreSearch" autocomplete="off">
          <div class="chips scroll" style="flex:1 1 auto;min-width:0">${chip('all', 'Todos', all.length)}${chip('nuevo', 'Nuevos', n('nuevo'))}${chip('contactado', 'Contactados', n('contactado'))}${chip('invitado', 'Invitados', n('invitado'))}${chip('descartado', 'Descartados', n('descartado'))}</div>
        </div>
        <div id="prodPreRows">${preRows()}</div>
        ${S.pre.total > all.length ? `<p class="small muted">Se muestran los ${all.length} más recientes de ${S.pre.total}. El CSV tiene todos.</p>` : ''}`;
    }
    const right = `<div class="row" style="gap:8px"><button type="button" class="btn ghost sm" data-action="prodRetry" data-k="pre">${icon('refresh')} Actualizar</button><a class="btn secondary sm" href="${esc(BASE)}/preregistros.csv" download>${DL} Descargar CSV</a></div>`;
    return layout('preregistros', `${head('Pre-registros', right, S.pre ? `${S.pre.total || 0} en total · formulario de la portada` : 'Formulario de la portada')}<div class="stack" style="gap:14px">${body}</div>`);
  }

  /* ---------- Reportes = denuncias reales ---------- */
  function denCard(r) {
    const open = !r.resuelto;
    return `<article class="card stack${r.urgente && open ? ' pa-urg' : ''}" style="gap:10px">
      <div class="row between" style="align-items:flex-start;gap:8px">
        <div class="row" style="gap:8px"><span class="badge ${r.urgente ? 'danger' : 'neutral'}">${r.urgente ? icon('alert') + ' ' : ''}${esc(r.categoria_label || r.categoria)}</span><span class="small muted">${fecha(r.creado)}</span></div>
        <span class="badge ${open ? 'warn' : 'ok'}">${open ? 'Abierta' : 'Resuelta' + (r.resuelto ? ' · ' + esc(HH.fmtDate(r.resuelto)) : '')}</span>
      </div>
      ${r.urgente && open ? `<div class="notice danger">${icon('alert')}<span><strong>Revisar ya.</strong> Si el contenido está en el sitio, sacalo de inmediato y guardá la evidencia.</span></div>` : ''}
      ${r.url ? `<div class="small pa-url"><span class="muted">Dirección:</span> ${/^https?:\/\//i.test(r.url) ? ext(r.url, esc(r.url)) : esc(r.url)}</div>` : ''}
      <p class="pa-pre">${esc(r.descripcion || '')}</p>
      <div class="row between small" style="gap:8px"><span>${r.email ? `<span class="muted">Contacto:</span> <a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : '<span class="muted">Sin email de contacto</span>'}</span>${open ? `<button type="button" class="btn sm" data-action="prodDenResolver" data-id="${esc(r.id)}">${icon('check')} Marcar resuelta</button>` : ''}</div>
    </article>`;
  }
  function vReportes() {
    load('den', '/denuncias');
    let body;
    if (!S.den && S.err.den) body = errorCard(S.err.den, 'den');
    else if (!S.den) body = loadingCard(3);
    else {
      const items = (S.den.items || []).slice();
      const open = items.filter((r) => !r.resuelto).sort((a, b) => (b.urgente - a.urgente) || (a.creado < b.creado ? 1 : -1));
      const done = items.filter((r) => r.resuelto).sort((a, b) => (a.resuelto < b.resuelto ? 1 : -1));
      body = `${open.length ? `<div class="stack">${open.map(denCard).join('')}</div>` : `<div class="card"><div class="empty">${icon('shield')}<h4>No hay denuncias abiertas</h4><p class="small">Las denuncias del formulario /denunciar aparecen acá. Las urgentes también llegan por Telegram.</p></div></div>`}
        ${done.length ? `<details class="card pa-done"><summary><strong>Resueltas · ${done.length}</strong></summary><div class="stack" style="margin-top:12px">${done.map(denCard).join('')}</div></details>` : ''}`;
    }
    const ab = S.den ? (S.den.items || []).filter((r) => !r.resuelto).length : 0;
    const right = `<div class="row" style="gap:8px">${S.den ? `<span class="badge ${ab ? 'warn' : 'ok'}">${ab} ${HH.plural(ab, 'abierta', 'abiertas')}</span>` : ''}<button type="button" class="btn ghost sm" data-action="prodRetry" data-k="den">${icon('refresh')} Actualizar</button><a class="btn secondary sm" href="${esc(BASE)}/denuncias.csv" download>${DL} CSV</a></div>`;
    return layout('reportes', `${head('Reportes', right, 'Denuncias recibidas por el formulario del sitio')}${body}`);
  }

  /* ---------- Textos del sitio ---------- */
  const ayudaTxt = () => String((S.txt && S.txt.ayuda) || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, ' ').trim();
  function vTextos() {
    load('txt', '/textos');
    let body;
    if (!S.txt && S.err.txt) body = errorCard(S.err.txt, 'txt');
    else if (!S.txt) body = loadingCard(4);
    else {
      const ps = S.txt.paginas || [];
      body = `${ayudaTxt() ? `<div class="notice info">${icon('info')}<span class="pa-pre">${esc(ayudaTxt())}</span></div>` : ''}
        <div class="card"><div class="list">${ps.map((p) => `<div class="list-item">${icon('list')}<div class="grow" style="min-width:0"><div class="title">${esc(p.nombre)}</div><div class="sub">${p.total || 0} ${HH.plural(p.total || 0, 'texto', 'textos')}${p.modificados ? ` · <span style="color:var(--warn)">${p.modificados} ${HH.plural(p.modificados, 'modificado', 'modificados')}</span>` : ''}</div></div><div class="row nowrap" style="gap:6px">${p.ruta ? `<a class="btn ghost sm" href="${esc(p.ruta)}" target="_blank" rel="noopener noreferrer">${icon('external')}<span class="hide-mobile">Vista previa</span></a>` : ''}<a class="btn sm" href="#admin.textos.${esc(p.id)}" data-go="#admin.textos.${esc(p.id)}">${icon('edit')} Editar</a></div></div>`).join('') || '<p class="small muted">No se encontraron páginas con textos editables.</p>'}</div></div>
        <p class="small muted">La demostración (/demo/) no se edita desde acá: sus perfiles y textos son ficticios.</p>`;
    }
    const right = `<button type="button" class="btn ghost sm" data-action="prodRetry" data-k="txt">${icon('refresh')} Actualizar</button>`;
    return layout('textos', `${head('Textos del sitio', right, 'Cambiá cualquier texto de las páginas públicas. Cada cambio guarda la versión anterior.')}<div class="stack" style="gap:14px">${body}</div>`);
  }
  const curVal = (b) => (b.valor != null ? b.valor : b.defValor);
  const editVal = (b) => (Object.prototype.hasOwnProperty.call(S.edits, b.clave) ? (S.edits[b.clave] === null ? b.defValor : S.edits[b.clave]) : curVal(b));
  // Cambios reales respecto de lo guardado: null = volver al texto original
  function pendingChanges(pg) {
    const out = {};
    ((pg && pg.bloques) || []).forEach((b) => {
      if (!Object.prototype.hasOwnProperty.call(S.edits, b.clave)) return;
      const e = S.edits[b.clave];
      const want = e === null || e === b.defValor ? null : e;
      const have = b.valor != null && b.valor !== b.defValor ? b.valor : null;
      if (want !== have) out[b.clave] = want;
    });
    return out;
  }
  const dirtyCount = () => (S.curPage && S.page[S.curPage] ? Object.keys(pendingChanges(S.page[S.curPage])).length : 0);
  function blkHtml(b, ch) {
    const v = editVal(b); const unsaved = Object.prototype.hasOwnProperty.call(ch, b.clave);
    const field = b.tipo === 'e'
      ? `<textarea class="textarea" id="tx_${esc(b.clave)}" rows="${Math.min(10, Math.max(3, Math.ceil(String(v).length / 60) + String(v).split('\n').length))}" maxlength="${MAX_VALOR}" data-input="prodTxtEdit" data-k="${esc(b.clave)}">${esc(v)}</textarea>`
      : `<input class="input" id="tx_${esc(b.clave)}" maxlength="${MAX_VALOR}" value="${esc(v)}" data-input="prodTxtEdit" data-k="${esc(b.clave)}">`;
    return `<div class="card stack pa-blk${unsaved ? ' unsaved' : ''}" style="gap:8px" data-blk="${esc(b.clave)}">
      <div class="row between" style="align-items:flex-start;gap:8px"><label for="tx_${esc(b.clave)}" style="min-width:0"><span class="pa-ctx">${esc(b.contexto || b.clave)}</span><code class="tiny muted pa-key">${esc(b.clave)}</code></label>
        <span class="row nowrap" style="gap:6px"><span class="badge berry pa-uns"${unsaved ? '' : ' hidden'}>Sin guardar</span>${b.modificado ? '<span class="badge warn">Modificado</span>' : ''}</span></div>
      ${field}
      <div class="row" style="gap:6px"><button type="button" class="btn ghost sm" data-action="prodTxtReset" data-k="${esc(b.clave)}"${(b.modificado || unsaved) && v !== b.defValor ? '' : ' disabled'}>${icon('refresh')} Restaurar original</button>${b.versiones ? `<button type="button" class="btn ghost sm" data-action="prodTxtHist" data-k="${esc(b.clave)}">${icon('clock')} Versiones (${b.versiones})</button>` : ''}</div>
    </div>`;
  }
  function vTextoPagina(id) {
    if (S.curPage !== id) { S.curPage = id; S.edits = {}; }
    load('txt', '/textos');
    loadPage(id);
    const pg = S.page[id]; const k = 'page:' + id;
    let body;
    if (!pg && S.err[k]) body = errorCard(S.err[k], k);
    else if (!pg) body = loadingCard(5);
    else {
      const ch = pendingChanges(pg); const n = Object.keys(ch).length;
      const list = (pg.bloques || []).filter((b) => S.tf === 'all' || b.modificado || Object.prototype.hasOwnProperty.call(ch, b.clave));
      body = `${ayudaTxt() ? `<details class="card"><summary class="small"><strong>Cómo dar formato</strong></summary><p class="small pa-pre" style="margin-top:8px">${esc(ayudaTxt())}</p></details>` : ''}
        <div class="chips"><button type="button" class="chip${S.tf === 'all' ? ' active' : ''}" data-action="prodTxtFilter" data-f="all">Todos · ${(pg.bloques || []).length}</button><button type="button" class="chip${S.tf === 'mod' ? ' active' : ''}" data-action="prodTxtFilter" data-f="mod">Modificados · ${(pg.bloques || []).filter((b) => b.modificado).length}</button></div>
        <div class="stack" style="gap:12px">${list.map((b) => blkHtml(b, ch)).join('') || '<div class="card"><p class="small muted">No hay textos modificados en esta página.</p></div>'}</div>
        <div class="pa-savebar" id="prodSaveBar"${n ? '' : ' hidden'}><span class="small"><strong id="prodDirtyN">${n}</strong> <span id="prodDirtyL">${HH.plural(n, 'cambio sin guardar', 'cambios sin guardar')}</span></span><span class="row nowrap" style="gap:8px"><button type="button" class="btn ghost sm" data-action="prodTxtDiscard">Descartar</button><button type="button" class="btn sm" data-action="prodTxtSave">${icon('check')} Guardar cambios</button></span></div>`;
    }
    const p = pg ? pg.pagina : ((S.txt && S.txt.paginas) || []).find((x) => x.id === id) || { nombre: id };
    const right = `<div class="row" style="gap:8px"><a class="btn ghost sm" href="#admin.textos" data-go="#admin.textos">${icon('arrowLeft')} Páginas</a>${p.ruta ? `<a class="btn secondary sm" href="${esc(p.ruta)}" target="_blank" rel="noopener noreferrer">${icon('external')} Vista previa</a>` : ''}</div>`;
    return layout('textos', `${head(esc(p.nombre || id), right, 'Textos de la página')}<div class="stack" style="gap:14px">${body}</div>`);
  }
  function updateDirtyUi() {
    const pg = S.page[S.curPage]; if (!pg) return;
    const ch = pendingChanges(pg); const n = Object.keys(ch).length;
    const bar = document.getElementById('prodSaveBar'); if (bar) bar.hidden = !n;
    const nn = document.getElementById('prodDirtyN'); if (nn) nn.textContent = n;
    const nl = document.getElementById('prodDirtyL'); if (nl) nl.textContent = HH.plural(n, 'cambio sin guardar', 'cambios sin guardar');
    document.querySelectorAll('[data-blk]').forEach((el) => {
      const k = el.getAttribute('data-blk'); const b = (pg.bloques || []).find((x) => x.clave === k); if (!b) return;
      const uns = Object.prototype.hasOwnProperty.call(ch, k);
      el.classList.toggle('unsaved', uns);
      const u = el.querySelector('.pa-uns'); if (u) u.hidden = !uns;
      const r = el.querySelector('[data-action="prodTxtReset"]'); if (r) r.disabled = !((b.modificado || uns) && editVal(b) !== b.defValor);
    });
  }

  /* ============================================================
     Fase 1+2: acompañantes, verificación, pagos, suscripciones, Stars, catálogos y ajustes
     (API del servidor: routes/admin-fase1.js)
     ============================================================ */
  // Planes v2: 4 planes. Bronce gratis; semana solo Oro y Star; Destacado solo Bronce, Plata y Oro.
  const PLAN_NOMBRE = { S: 'Star', C: 'Oro', D: 'Plata', E: 'Bronce' };
  const PLANES = ['E', 'D', 'C', 'S'];
  const PLANES_PAGOS = ['D', 'C', 'S'];
  const PLANES_SEMANA = ['C', 'S'];
  const PLANES_DEST = ['E', 'D', 'C'];
  const PERIODO = { mes: 'Mes', semana: 'Semana', manual: 'Manual' };
  const ORIGEN = { creditos: 'con créditos', manual: 'a mano', pedido: 'transferencia (anterior)' };
  const ESTADO_PC = { pendiente: ['Pendiente', 'warn'], confirmado: ['Confirmado', 'ok'], vencido: ['Vencido', 'neutral'], cancelado: ['Cancelado', 'neutral'], rechazado: ['Rechazado', 'danger'] };
  const TIPO_MOV = { compra: 'Compra de créditos', pack_bonus: 'Regalo del pack', renovacion_plan: 'Plan (mes)', semana: 'Semana', subida_temporal: 'Subida de plan', destacado: 'Destacado', ajuste_admin: 'Ajuste manual', comision_venta: 'Comisión de venta' };
  const ESTADO_DEST = { activo: ['Activo', 'ok'], programado: ['Programado', 'info'], vencido: ['Terminado', 'neutral'], cancelado: ['Cancelado', 'danger'] };
  // Créditos: la API manda { centavos, creditos: "35.00" }; 1 crédito = 1 USD
  const cnum = (m) => (m && m.centavos != null ? Number(m.centavos) / 100 : Number(m || 0));
  const cred = (m, unit = true) => { const n = cnum(m); return n.toLocaleString('es-AR', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }) + (unit ? ' ' + HH.plural(Math.abs(n) === 1 ? 1 : 2, 'crédito', 'créditos') : ''); };
  const credSig = (m) => (cnum(m) > 0 ? '+' : '') + cred(m, false);
  const ars = (n) => 'ARS ' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
  const hoyAR = (iso) => { const f = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(d); return iso ? f(new Date(iso)) === f(new Date()) : false; };
  const quedaTxt = (iso) => { const ms = new Date(iso).getTime() - Date.now(); if (!(ms > 0)) return 'vencido'; const h = Math.floor(ms / 36e5); const m = Math.floor((ms % 36e5) / 6e4); return h >= 1 ? `quedan ${h} h ${String(m).padStart(2, '0')} min` : `quedan ${m} min`; };
  const ESTADO_PERFIL = { borrador: ['Borrador', 'neutral'], en_revision: ['En revisión', 'warn'], publicado: ['Publicado', 'ok'], rechazado: ['Rechazado', 'danger'], pausado: ['Pausado', 'info'], suspendido: ['Suspendido', 'danger'] };
  const VERIF = { sin_enviar: ['Sin enviar', 'neutral'], pendiente: ['Verificación pendiente', 'warn'], verificada: ['Verificada', 'ok'], rechazada: ['Verificación rechazada', 'danger'] };
  const ESTADO_SUS = { activa: ['Activa', 'ok'], vencida: ['Vencida', 'neutral'], cancelada: ['Cancelada', 'danger'] };
  const TIPO_UBIC = { pais: 'País', provincia: 'Provincia', ciudad: 'Ciudad', zona: 'Zona' };
  const TIPOS_UBIC = ['pais', 'provincia', 'ciudad', 'zona'];
  const MOTIVOS_VERIF = ['La selfie no se ve bien (luz, foco o cara tapada).', 'El documento no se lee completo.', 'La cara de la selfie no coincide con la del documento.', 'El documento está vencido o no es válido.', 'Según el documento, no es mayor de 18 años.'];
  const MOTIVOS_PERFIL = ['Hay fotos que no cumplen las normas del sitio.', 'Los datos del perfil están incompletos o no son reales.', 'La descripción tiene contenido no permitido.', 'El perfil ofrece servicios que el sitio no permite.'];
  const DAY = 864e5;
  const badge = (pair, fallback) => (pair ? `<span class="badge ${pair[1]}">${pair[0]}</span>` : `<span class="badge neutral">${esc(fallback || '')}</span>`);
  const planBadge = (p) => HH.levelBadge(p || 'E', true);
  const money = (n) => 'USD ' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
  const dia = (iso) => (iso ? HH.fmtDate(iso, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const diasRestantes = (iso) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / DAY));
  const thumb = (url, alt, size = 44) => url ? `<img class="pa-av" src="${esc(url)}" alt="${esc(alt || '')}" style="width:${size}px;height:${size}px" loading="lazy">` : `<span class="pa-av pa-av-ph" style="width:${size}px;height:${size}px">${icon('user')}</span>`;
  const linkCuenta = (id, name) => `<a href="#admin.acompanantes.${esc(id)}" data-go="#admin.acompanantes.${esc(id)}"><strong data-noi18n>${esc(name || 'Sin nombre')}</strong></a>`;
  const edadDe = (ymd) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ''))) return null; const b = new Date(ymd + 'T12:00:00'); const n = new Date(); let e = n.getFullYear() - b.getFullYear(); if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) e--; return e; };

  // Catálogos (para mostrar nombres en vez de ids)
  const cat = { ub: () => (S.ub && S.ub.items) || [], ca: () => (S.cat && S.cat.items) || [], in: () => (S.int && S.int.items) || [] };
  const loadCatalogos = (force) => { load('ub', '/ubicaciones', force); load('cat', '/categorias', force); load('int', '/intereses', force); };
  const ubNombre = (v) => { if (!v) return ''; const u = cat.ub().find((x) => x.id === v); return u ? u.nombre : String(v); };
  const nombreDe = (list, v) => { const x = list.find((y) => y.id === v); return x ? x.nombre : String(v); };
  const lugar = (ciudad, provincia) => [ubNombre(ciudad), ubNombre(provincia)].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');

  const PATHS = { ac: '/acompanantes', sus: '/suscripciones?estado=todas', stars: '/stars', aj: '/ajustes', ub: '/ubicaciones', cat: '/categorias', int: '/intereses', ven: '/planes/vencen?dias=7', pau: '/planes/pausadas', dst: '/destacados', dstT: '/destacados?estado=todos' };
  const pathDe = (k) => (k === 'pc' ? pcPath() : k.startsWith('acd:') ? '/acompanantes/' + encodeURIComponent(k.slice(4)) : k.startsWith('cr:') ? '/creditos/' + encodeURIComponent(k.slice(3)) : PATHS[k]);
  const after = (keys) => { keys.forEach((k) => { const p = pathDe(k); if (p && (S[k] != null || S.err[k] || !/^(acd|cr):/.test(k))) load(k, k.startsWith('cr:') ? p + '?limite=20' : p, true); }); refreshResumen(); };

  // Archivos privados (selfie, documento, comprobante): fetch con la sesión del panel → blob, sin caché
  const blobs = new Map();
  async function blobUrl(path) {
    if (blobs.has(path)) return blobs.get(path);
    let res;
    try { res = await fetch(API + path, { credentials: 'same-origin', cache: 'no-store' }); } catch (e) { throw err('No hay conexión con el servidor.', 0); }
    if (!res.ok) { let m = null; try { m = (await res.json()).error; } catch (e) { /* */ } throw err(m || (res.status === 404 ? 'Archivo no encontrado.' : 'No se pudo abrir el archivo (' + res.status + ').'), res.status); }
    const b = await res.blob(); const u = URL.createObjectURL(b); const v = { url: u, type: b.type || '' };
    blobs.set(path, v); return v;
  }
  function fillBlobs(root) {
    (root || document).querySelectorAll('[data-blob]:not([data-done])').forEach((el) => {
      el.setAttribute('data-done', '1');
      blobUrl(el.getAttribute('data-blob'))
        .then((v) => {
          if (/pdf/i.test(v.type)) el.innerHTML = `<a class="btn secondary sm" href="${v.url}" target="_blank" rel="noopener">${icon('external')} Abrir PDF</a>`;
          else el.innerHTML = `<img src="${v.url}" alt="${esc(el.getAttribute('data-alt') || '')}" class="pa-priv-img" data-action="prodBlobZoom" data-url="${v.url}">`;
        })
        .catch((e) => { el.innerHTML = `<div class="small muted">${icon('alert')} ${esc(e.message)}</div>`; });
    });
  }
  document.addEventListener('hh:rendered', () => fillBlobs());

  // Ventana para pedir un motivo (predefinidos + texto libre)
  function pedirMotivo({ title, intro, motivos, okLabel, cls, requerido = true, onOk }) {
    HH.modal({ title, body: `<div class="stack" style="gap:12px">
        ${intro ? `<p class="small">${intro}</p>` : ''}
        ${motivos && motivos.length ? `<div class="field"><label for="paMotSel">Motivo</label><select class="select" id="paMotSel"><option value="">Elegí un motivo…</option>${motivos.map((m) => `<option>${esc(m)}</option>`).join('')}<option value="__otro">Otro (escribilo abajo)</option></select></div>` : ''}
        <div class="field"><label for="paMotTxt">${motivos && motivos.length ? 'Detalle (opcional si elegiste un motivo)' : 'Motivo'}</label><textarea class="textarea" id="paMotTxt" rows="3" maxlength="500" placeholder="Se lo mandamos a la acompañante por email."></textarea></div>
      </div>`, actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: okLabel || 'Confirmar', cls: cls || '', onClick: (btn) => {
        const sel = document.getElementById('paMotSel'); const t = (document.getElementById('paMotTxt').value || '').trim();
        const s = sel && sel.value && sel.value !== '__otro' ? sel.value : '';
        const motivo = [s, t].filter(Boolean).join(' ').slice(0, 500);
        if (requerido && !motivo) { HH.toast('Elegí o escribí el motivo: se lo mandamos a la acompañante.', { type: 'warn' }); return; }
        if (btn) btn.disabled = true;
        onOk(motivo, () => { if (btn) btn.disabled = false; });
      } }] });
  }
  const filtro = (arr, sel, k, l, n) => `<button type="button" class="chip${sel === k ? ' active' : ''}" data-action="${arr}" data-f="${k}" aria-pressed="${sel === k}">${l}${n != null ? ` <span class="badge" style="padding:0 6px">${n}</span>` : ''}</button>`;
  const actualizar = (k) => `<button type="button" class="btn ghost sm" data-action="prodRetry" data-k="${k}">${icon('refresh')} Actualizar</button>`;

  /* ---------- Acompañantes ---------- */
  S.af = S.af || 'all'; S.aq = S.aq || '';
  const AC_FILTROS = [['all', 'Todas'], ['en_revision', 'En revisión'], ['verif', 'Verificación pendiente'], ['publicado', 'Publicadas'], ['pausado', 'Pausadas'], ['rechazado', 'Rechazadas'], ['suspendido', 'Suspendidas'], ['borrador', 'Borradores']];
  const acMatchF = (r, f) => (f === 'all' ? true : f === 'verif' ? r.verificacion === 'pendiente' : r.estado === f);
  const acMatch = (r) => {
    if (!acMatchF(r, S.af)) return false;
    const q = S.aq.trim().toLowerCase(); if (!q) return true;
    return [r.displayName, r.email, r.slug, ubNombre(r.ciudad), ubNombre(r.provincia)].some((v) => String(v || '').toLowerCase().includes(q));
  };
  function acRows() {
    const all = (S.ac && S.ac.items) || [];
    const items = all.filter(acMatch);
    if (!items.length) return `<div class="card"><div class="empty">${icon('users')}<h4>${all.length ? 'Sin resultados' : 'Todavía no hay acompañantes'}</h4><p class="small">${all.length ? 'Probá con otro filtro o búsqueda.' : 'Cuando una acompañante cree su cuenta en el sitio, aparece acá.'}</p></div></div>`;
    const mail = (r) => `<span class="pa-contact">${esc(r.email)}</span> ${r.emailVerificado ? `<span class="pa-ok" title="Email confirmado">${icon('checkCircle')}</span>` : '<span class="tiny muted">(sin confirmar)</span>'}`;
    const table = `<div class="table-wrap pa-table"><table class="table"><thead><tr><th></th><th>Nombre</th><th>Ubicación</th><th>Plan</th><th>Estado</th><th>Verificación</th><th>Email</th><th>Alta</th></tr></thead><tbody>
      ${items.map((r) => `<tr class="pa-rowlink" data-go="#admin.acompanantes.${esc(r.cuentaId)}"><td>${thumb(r.fotoPrincipal, r.displayName, 40)}</td><td>${linkCuenta(r.cuentaId, r.displayName)}${r.oculto ? ' <span class="badge neutral">Oculta</span>' : ''}${r.cuentaEstado && r.cuentaEstado !== 'activa' ? ` <span class="badge danger">Cuenta ${esc(r.cuentaEstado)}</span>` : ''}<div class="tiny muted">${r.fotos || 0} ${HH.plural(r.fotos || 0, 'foto', 'fotos')}</div></td><td class="small">${esc(lugar(r.ciudad, r.provincia)) || '<span class="muted">—</span>'}</td><td>${planBadge(r.plan)}</td><td>${badge(ESTADO_PERFIL[r.estado], r.estado)}</td><td>${badge(VERIF[r.verificacion], r.verificacion)}</td><td class="small">${mail(r)}</td><td class="small muted">${dia(r.creado)}</td></tr>`).join('')}
      </tbody></table></div>`;
    const cards = `<div class="pa-cards">${items.map((r) => `<a class="card stack pa-accard" style="gap:8px" href="#admin.acompanantes.${esc(r.cuentaId)}" data-go="#admin.acompanantes.${esc(r.cuentaId)}">
        <div class="row nowrap" style="gap:10px">${thumb(r.fotoPrincipal, r.displayName, 52)}<div class="grow" style="min-width:0"><div class="row between nowrap" style="gap:6px"><strong class="ellipsis" data-noi18n>${esc(r.displayName || 'Sin nombre')}</strong>${planBadge(r.plan)}</div><div class="small muted ellipsis">${esc(lugar(r.ciudad, r.provincia)) || 'Sin ubicación'}</div></div></div>
        <div class="row" style="gap:6px">${badge(ESTADO_PERFIL[r.estado], r.estado)}${badge(VERIF[r.verificacion], r.verificacion)}${r.oculto ? '<span class="badge neutral">Oculta</span>' : ''}</div>
        <div class="tiny muted ellipsis">${esc(r.email)}${r.emailVerificado ? ' · email confirmado' : ' · email sin confirmar'} · alta ${dia(r.creado)}</div>
      </a>`).join('')}</div>`;
    return table + cards;
  }
  function vAcompanantes() {
    load('ac', '/acompanantes'); loadCatalogos();
    let body;
    if (!S.ac && S.err.ac) body = errorCard(S.err.ac, 'ac');
    else if (!S.ac) body = loadingCard(4);
    else {
      const all = S.ac.items || [];
      const n = (f) => all.filter((r) => acMatchF(r, f)).length;
      body = `<div class="adm-filters">
          <label class="sr-only" for="prodAcQ">Buscar acompañante</label><input class="input" id="prodAcQ" type="search" placeholder="Buscar por nombre, email o ciudad" value="${esc(S.aq)}" data-input="prodAcSearch" autocomplete="off">
          <div class="chips scroll" style="flex:1 1 auto;min-width:0">${AC_FILTROS.map(([k, l]) => filtro('prodAcFilter', S.af, k, l, n(k))).join('')}</div>
        </div>
        <div id="prodAcRows">${acRows()}</div>`;
    }
    return layout('acompanantes', `${head('Acompañantes', actualizar('ac'), S.ac ? `${(S.ac.items || []).length} ${HH.plural((S.ac.items || []).length, 'cuenta', 'cuentas')} · las que esperan revisión van primero` : 'Cuentas creadas en el sitio')}<div class="stack" style="gap:14px">${body}</div>`);
  }

  function datoRows(d) {
    const rows = [];
    const add = (k, v) => { if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) rows.push([k, v]); };
    const e = edadDe(d.fechaNacimiento);
    add('Nombre', esc(d.displayName));
    add('Género', esc(GENERO[d.genero] || d.genero || ''));
    if (d.fechaNacimiento) add('Nacimiento', `${esc(d.fechaNacimiento)}${e != null ? ` · <strong${e < 18 ? ' style="color:var(--danger)"' : ''}>${e} años</strong>` : ''}`);
    add('Nacionalidad', esc(d.nacionalidad || ''));
    add('Ubicación', esc([d.zona, ubNombre(d.ciudad), ubNombre(d.provincia), ubNombre(d.pais)].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ')));
    if (d.ciudadSugerida) add('Ciudad propuesta', `${esc(d.ciudadSugerida)} <span class="tiny muted">(no está en el catálogo: agregala en Ubicaciones si corresponde)</span>`);
    add('WhatsApp', d.whatsapp ? ext('https://wa.me/' + String(d.whatsapp).replace(/\D/g, ''), esc(d.whatsapp)) : '');
    add('Telegram', d.telegram ? ext('https://t.me/' + String(d.telegram).replace(/^@/, ''), esc('@' + String(d.telegram).replace(/^@/, ''))) : '');
    add('Tarifa desde', d.tarifaDesde != null && d.tarifaDesde !== '' ? money(d.tarifaDesde) + ' / h' : '');
    add('Idiomas', esc((d.idiomas || []).join(', ')));
    add('Altura', d.alturaCm ? esc((d.alturaCm / 100).toFixed(2).replace('.', ',') + ' m') : '');
    add('Contextura', esc((HH.BUILDS && HH.BUILDS[d.contextura]) || d.contextura || ''));
    add('Salidas', esc((d.salidas || []).map((x) => nombreDe(cat.ca(), x)).join(' · ')));
    add('Intereses', esc((d.intereses || []).map((x) => nombreDe(cat.in(), x)).join(' · ')));
    add('Titular', esc(d.titular || ''));
    add('Descripción', d.bio ? `<span class="pa-pre">${esc(d.bio)}</span>` : '');
    add('Titular (EN)', esc(d.titularEn || ''));
    add('Descripción (EN)', d.bioEn ? `<span class="pa-pre">${esc(d.bioEn)}</span>` : '');
    add('Links', (d.links || []).filter((l) => l && l.url).map((l) => ext(l.url, esc(l.label || l.url))).join('<br>'));
    return rows.length ? `<dl class="pa-dl">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd data-noi18n>${v}</dd></div>`).join('')}</dl>` : '<p class="small muted">Todavía no cargó datos.</p>';
  }
  function vAcompanante(id) {
    const k = 'acd:' + id;
    load(k, '/acompanantes/' + encodeURIComponent(id)); loadCatalogos();
    const d = S[k];
    let body;
    if (!d && S.err[k]) body = errorCard(S.err[k], k);
    else if (!d) body = loadingCard(3);
    else {
      const p = d.perfil || {}; const c = d.cuenta || {}; const datos = p.datos || {};
      const vPend = (d.verificaciones || []).find((v) => v.estado === 'pendiente');
      const vLast = vPend || (d.verificaciones || [])[0];
      const verifCard = `<section class="card stack" style="gap:12px">
          <div class="row between"><div class="card-title">${icon('shield')} Verificación de identidad</div>${badge(VERIF[p.verificacion], p.verificacion)}</div>
          ${vLast ? `<div class="small muted">Enviada el ${fecha(vLast.creado)}${vLast.revisado ? ` · revisada el ${fecha(vLast.revisado)}${vLast.revisadoPor ? ' por ' + esc(vLast.revisadoPor) : ''}` : ''}</div>
            ${vLast.motivo ? `<div class="notice warn">${icon('alert')}<span><strong>Motivo:</strong> ${esc(vLast.motivo)}</span></div>` : ''}
            <div class="pa-verif">
              <figure><figcaption class="small muted">Selfie</figcaption>${vLast.tieneSelfie ? `<div class="pa-priv" data-blob="/verificaciones/${esc(vLast.id)}/selfie" data-alt="Selfie">${loadingCard(1)}</div>` : '<div class="small muted">No hay selfie.</div>'}</figure>
              <figure><figcaption class="small muted">Documento</figcaption>${vLast.tieneDocumento ? `<div class="pa-priv" data-blob="/verificaciones/${esc(vLast.id)}/documento" data-alt="Documento">${loadingCard(1)}</div>` : '<div class="small muted">No hay documento.</div>'}</figure>
            </div>
            ${datos.fechaNacimiento ? `<div class="small">Fecha de nacimiento declarada: <strong>${esc(datos.fechaNacimiento)}</strong>${edadDe(datos.fechaNacimiento) != null ? ` (${edadDe(datos.fechaNacimiento)} años)` : ''}. Comparala con el documento.</div>` : ''}
            ${vPend ? `<div class="row" style="gap:8px"><button type="button" class="btn" data-action="prodVerif" data-id="${esc(c.id)}" data-d="aprobar">${icon('check')} Aprobar identidad</button><button type="button" class="btn danger" data-action="prodVerif" data-id="${esc(c.id)}" data-d="rechazar">${icon('x')} Rechazar</button></div><p class="tiny muted">Si el perfil está en revisión, al aprobar la identidad se publica solo. Los archivos son privados: nunca se publican.</p>` : ''}` : '<p class="small muted">Todavía no envió la selfie ni el documento.</p>'}
          ${(d.verificaciones || []).length > 1 ? `<details class="pa-done"><summary class="small"><strong>Envíos anteriores · ${(d.verificaciones || []).length - 1}</strong></summary><div class="list" style="margin-top:8px">${(d.verificaciones || []).filter((v) => v !== vLast).map((v) => `<div class="list-item small">${badge({ pendiente: ['Pendiente', 'warn'], aprobada: ['Aprobada', 'ok'], rechazada: ['Rechazada', 'danger'] }[v.estado], v.estado)}<div class="grow">${fecha(v.creado)}${v.motivo ? ' · ' + esc(v.motivo) : ''}</div></div>`).join('')}</div></details>` : ''}
        </section>`;
      const est = p.estado;
      const btnE = (to, label, ic, cls) => `<button type="button" class="btn ${cls || 'secondary'} sm" data-action="prodPerfilEstado" data-id="${esc(c.id)}" data-e="${to}">${icon(ic)} ${label}</button>`;
      const estadoCard = `<section class="card stack" style="gap:12px">
          <div class="row between"><div class="card-title">${icon('eye')} Publicación</div>${badge(ESTADO_PERFIL[est], est)}</div>
          ${p.motivoRechazo ? `<div class="notice warn">${icon('alert')}<span><strong>Motivo informado:</strong> ${esc(p.motivoRechazo)}</span></div>` : ''}
          <div class="small muted">${p.publicadoEn ? 'Publicado desde el ' + fecha(p.publicadoEn) + ' · ' : ''}Última actualización: ${fecha(p.actualizado)}${p.oculto ? ' · <strong>Ella ocultó su perfil</strong>' : ''}</div>
          <div class="row" style="gap:8px">
            ${est !== 'publicado' ? btnE('publicado', 'Publicar', 'check', p.verificacion === 'verificada' ? '' : 'secondary') : ''}
            ${est === 'publicado' ? btnE('pausado', 'Pausar', 'clock') : ''}
            ${est !== 'suspendido' ? btnE('suspendido', 'Suspender', 'ban', 'danger') : ''}
            ${est !== 'rechazado' && est !== 'publicado' ? btnE('rechazado', 'Rechazar perfil', 'x', 'ghost') : ''}
            ${est === 'publicado' && p.slug ? `<a class="btn ghost sm" href="/perfil/${esc(p.slug)}" target="_blank" rel="noopener noreferrer">${icon('external')} Ver perfil público</a>` : ''}
          </div>
          ${p.verificacion !== 'verificada' ? '<p class="tiny muted">Para publicar, primero tiene que estar verificada la identidad.</p>' : ''}
        </section>`;
      const fotos = d.fotos || [];
      const fotosCard = `<section class="card stack" style="gap:12px">
          <div class="row between"><div class="card-title">${icon('image')} Fotos</div><span class="small muted">${fotos.length}</span></div>
          ${fotos.length ? `<div class="pa-fotos">${fotos.map((f, i) => `<button type="button" class="pa-foto" data-action="prodFoto" data-url="${esc(f.url)}" aria-label="Ver foto ${i + 1}"><img src="${esc(f.urlMini || f.url)}" alt="" loading="lazy">${i === 0 ? '<span class="badge berry pa-foto-tag">Principal</span>' : ''}</button>`).join('')}</div>` : '<p class="small muted">Todavía no subió fotos.</p>'}
          ${(d.historias || []).length ? `<div class="small muted">Historias: ${(d.historias || []).length} (la última el ${fecha(d.historias[0].creado)})</div><div class="pa-fotos">${d.historias.slice(0, 8).map((h) => `<button type="button" class="pa-foto" data-action="prodFoto" data-url="${esc(h.url)}" aria-label="Ver historia"><img src="${esc(h.urlMini || h.url)}" alt="" loading="lazy">${new Date(h.expira) > new Date() ? '<span class="badge ok pa-foto-tag">Activa</span>' : ''}</button>`).join('')}</div>` : ''}
        </section>`;
      // Videos y clip de 5 s de la tarjeta (solo lectura; API: routes/admin-videos.js)
      const kv = 'acv:' + id; load(kv, '/acompanantes/' + encodeURIComponent(id) + '/videos'); const dv = S[kv];
      const VID_EST = { procesando: ['Procesando', 'warn'], listo: ['Listo', 'ok'], error: ['Error', 'danger'] };
      const seg = (n) => (n == null ? '—' : (Math.round(Number(n) * 10) / 10).toLocaleString('es-AR') + ' s');
      const mb = (n) => (n == null ? '' : ' · ' + (Number(n) / 1048576).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' MB');
      const vids = (dv && dv.videos) || []; const pv = dv && dv.preview;
      const videosCard = `<section class="card stack" style="gap:12px">
          <div class="row between"><div class="card-title">${icon('film')} Videos</div><span class="small muted">${dv ? vids.length : ''}</span></div>
          ${!dv ? (S.err[kv] ? `<div class="notice warn">${icon('alert')}<span>${esc(S.err[kv])}</span></div>` : loadingCard(1)) : vids.length ? `<div class="pa-fotos">${vids.map((v, i) => `<figure class="pa-vid" style="margin:0">${v.urlPoster ? `<img src="${esc(v.urlPoster)}" alt="Portada del video ${i + 1}" loading="lazy" style="width:100%;aspect-ratio:9/16;object-fit:cover;border-radius:10px;background:var(--surface-2)">` : `<div class="pa-av-ph" style="aspect-ratio:9/16;border-radius:10px;display:grid;place-items:center">${icon('film')}</div>`}<figcaption class="tiny" style="margin-top:4px">${badge(VID_EST[v.estado], v.estado)} <span class="muted">${seg(v.segundos)}${v.ancho && v.alto ? ' · ' + v.ancho + '×' + v.alto : ''}${mb(v.bytes)}</span>${v.error ? `<div class="tiny" style="color:var(--danger)">${esc(v.error)}</div>` : ''}${v.estado === 'listo' && v.url ? `<div><a class="tiny" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">Ver video</a></div>` : ''}</figcaption></figure>`).join('')}</div>` : '<p class="small muted">No subió videos.</p>'}
          ${dv ? `<div class="stack" style="gap:6px"><div class="small"><strong>Clip de la tarjeta (5 s)</strong> ${pv ? badge(VID_EST[pv.estado], pv.estado) : ''}</div>
            ${pv ? `${pv.estado === 'listo' && pv.url ? `<video src="${esc(pv.url)}" muted loop playsinline controls preload="metadata" style="width:140px;aspect-ratio:9/16;object-fit:cover;border-radius:10px;background:#000"></video>` : ''}
              <div class="tiny muted">${pv.elegido ? 'Elegido por ella' : 'Automático (comienzo del primer video)'} · desde el segundo ${seg(pv.inicio)}${pv.actualizado ? ' · ' + fecha(pv.actualizado) : ''}</div>${pv.error ? `<div class="tiny" style="color:var(--danger)">${esc(pv.error)}</div>` : ''}<p class="tiny muted">Se muestra en la tarjeta desde el plan Plata.</p>` : '<p class="tiny muted">Sin clip todavía.</p>'}</div>` : ''}
        </section>`;
      const subs = d.suscripciones || []; const b = d.base;
      load('dst', '/destacados');
      const misDest = S.dst ? (S.dst.items || []).filter((x) => x.cuentaId === id) : null;
      const pr = b && b.proximaRenovacion;
      const planCard = `<section class="card stack" style="gap:12px">
          <div class="row between"><div class="card-title">${icon('card')} Plan</div>${planBadge(d.plan)}</div>
          ${d.pausadoPorSaldo ? `<div class="notice danger">${icon('alert')}<span><strong>Pausado por falta de saldo.</strong> Se reactiva solo cuando cargue créditos suficientes para renovar.</span></div>` : ''}
          ${b ? `<dl class="pa-dl">
              <div><dt>Plan base</dt><dd>${planBadge(b.plan)} hasta el ${dia(b.hasta)}${new Date(b.hasta) > new Date() ? ` · <strong>quedan ${diasRestantes(b.hasta)} días</strong>` : ''}</dd></div>
              <div><dt>Renovación automática</dt><dd>${b.renovacionAuto ? '<span class="badge ok">Activada</span>' : '<span class="badge neutral">Desactivada</span>'}</dd></div>
              ${b.cambioProgramado ? `<div><dt>Cambio programado</dt><dd>Al renovar pasa a ${planBadge(b.cambioProgramado)}</dd></div>` : ''}
              ${pr ? `<div><dt>Próxima renovación</dt><dd>${dia(pr.fecha)} · ${esc(PLAN_NOMBRE[pr.plan] || pr.plan)} · ${cred(pr.costo)} ${pr.alcanza ? '<span class="badge ok">Le alcanza el saldo</span>' : `<span class="badge danger">Le faltan ${cred(pr.faltan)}</span>`}</dd></div>` : ''}
            </dl>` : '<p class="small muted">Sin plan pago: está en Bronce (gratis).</p>'}
          ${subs.length ? `<div class="small muted">Suscripciones</div><div class="list">${subs.map((s) => `<div class="list-item small">${planBadge(s.plan)}<div class="grow"><div>${esc(PERIODO[s.periodo] || s.periodo)} · ${dia(s.desde)} → ${dia(s.hasta)}${s.vigente ? ` · <strong>quedan ${diasRestantes(s.hasta)} días</strong>` : ''}</div><div class="tiny muted">${esc(ORIGEN[s.origen] || s.origen || '')}${s.costo && s.costo.centavos ? ' · ' + cred(s.costo) : ''}${s.renovacionAuto ? ' · renueva sola' : ''}${s.nota ? ' · ' + esc(s.nota) : ''}</div></div>${badge(ESTADO_SUS[s.estado], s.estado)}</div>`).join('')}</div>` : ''}
          <div class="small muted">Destacados</div>
          ${!misDest ? (S.err.dst ? `<div class="tiny muted">${esc(S.err.dst)}</div>` : '<div class="tiny muted">Cargando…</div>') : misDest.length ? `<div class="list">${misDest.map((x) => `<div class="list-item small">${icon('trending')}<div class="grow"><div>${esc(x.planNombre || PLAN_NOMBRE[x.plan] || x.plan)} · ${esc(ubNombre(x.provincia) || x.provincia || '')}</div><div class="tiny muted">${dia(x.desde)} → ${dia(x.hasta)} · ${x.dias} ${HH.plural(x.dias, 'día', 'días')} · ${cred(x.costo)}</div></div>${badge(ESTADO_DEST[x.estado], x.estado)}</div>`).join('')}</div>` : '<p class="tiny muted">Sin Destacados activos ni programados.</p>'}
          <div class="row"><button type="button" class="btn secondary sm" data-action="prodPlanManual" data-id="${esc(c.id)}" data-n="${esc(datos.displayName || '')}">${icon('plus')} Asignar plan manual</button></div>
        </section>`;
      const kc = 'cr:' + id; load(kc, '/creditos/' + encodeURIComponent(id) + '?limite=20'); const dc = S[kc];
      const movs = (dc && dc.movimientos) || [];
      const pcs = (dc && dc.pedidos) || [];
      const credCard = `<section class="card stack" id="prodCred" style="gap:12px">
          <div class="row between"><div class="card-title">${icon('dollar')} Créditos</div><strong class="pa-money" data-noi18n>${cred(dc ? dc.saldo : d.saldo)}</strong></div>
          ${!dc ? (S.err[kc] ? `<div class="notice warn">${icon('alert')}<span>${esc(S.err[kc])}</span></div>` : loadingCard(1)) : `
            ${movs.length ? `<div class="list pa-movs">${movs.map((m) => `<div class="list-item small"><div class="grow" style="min-width:0"><div><strong>${esc(TIPO_MOV[m.tipo] || m.tipo)}</strong>${m.motivo ? ` <span class="muted">· <span data-noi18n>${esc(m.motivo)}</span></span>` : ''}</div><div class="tiny muted">${fecha(m.creado)}${m.creadoPor ? ' · ' + esc(m.creadoPor) : ''} · saldo ${cred(m.saldoDespues, false)}</div></div><strong class="pa-mov ${cnum(m) < 0 ? 'neg' : 'pos'}">${credSig(m)}</strong></div>`).join('')}</div>
              ${dc.siguiente ? `<div class="row"><button type="button" class="btn ghost sm" data-action="prodMovMas" data-id="${esc(id)}">${icon('chevronDown')} Ver movimientos anteriores</button></div>` : ''}` : '<p class="small muted">Todavía no tiene movimientos de créditos.</p>'}
            ${pcs.length ? `<div class="small muted">Pedidos de créditos</div><div class="list">${pcs.slice(0, 8).map((x) => `<a class="list-item small" style="color:inherit" href="#admin.pedidos" data-action="prodPcVer" data-q="${esc(x.codigo)}"><code class="pa-ref">${esc(x.codigo)}</code><div class="grow">${esc(x.packNombre)} · ${cred(x.total)}<div class="tiny muted">${fecha(x.creado)}</div></div>${badge(ESTADO_PC[x.estado], x.estado)}</a>`).join('')}</div>` : ''}`}
          <div class="row"><button type="button" class="btn secondary sm" data-action="prodAjuste" data-id="${esc(c.id)}" data-n="${esc(datos.displayName || '')}">${icon('edit')} Ajuste manual</button></div>
        </section>`;
      const cuentaCard = `<section class="card stack" style="gap:10px">
          <div class="card-title">${icon('user')} Cuenta</div>
          <dl class="pa-dl">
            <div><dt>Email</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a> ${c.emailVerificado ? `<span class="badge ok">Confirmado</span>` : '<span class="badge warn">Sin confirmar</span>'}</dd></div>
            <div><dt>Estado de la cuenta</dt><dd>${esc(c.estado || '')}</dd></div>
            <div><dt>Alta</dt><dd>${fecha(c.creado)}</dd></div>
            <div><dt>Último ingreso</dt><dd>${c.ultimoLogin ? fecha(c.ultimoLogin) : '—'}</dd></div>
            <div><dt>Mayor de edad (declarado)</dt><dd>${c.mayorEdadDeclarada ? 'Sí' : 'No'}${c.aceptoTerminos ? ' · aceptó los términos el ' + fecha(c.aceptoTerminos) : ''}</dd></div>
            ${p.slug ? `<div><dt>Dirección</dt><dd><code>/perfil/${esc(p.slug)}</code></dd></div>` : ''}
          </dl>
        </section>`;
      body = `<div class="pa-detail">
          <div class="stack" style="gap:14px">${verifCard}${estadoCard}${fotosCard}${videosCard}</div>
          <div class="stack" style="gap:14px"><section class="card stack" style="gap:10px"><div class="card-title">${icon('edit')} Datos del perfil</div>${datoRows(datos)}</section>${credCard}${planCard}${cuentaCard}</div>
        </div>`;
    }
    const nombre = d && d.perfil && d.perfil.datos ? d.perfil.datos.displayName : '';
    const right = `<div class="row" style="gap:8px"><a class="btn ghost sm" href="#admin.acompanantes" data-go="#admin.acompanantes">${icon('arrowLeft')} Todas</a>${actualizar(k)}</div>`;
    return layout('acompanantes', `${head(esc(nombre || 'Acompañante'), right, d ? `${d.perfil && d.perfil.slug ? '/perfil/' + esc(d.perfil.slug) + ' · ' : ''}${esc((d.cuenta || {}).email || '')}` : 'Ficha completa')}${body}`);
  }

  /* ---------- Pedidos de créditos (se pagan por WhatsApp; el admin confirma y se acreditan) ---------- */
  S.pcf = S.pcf || 'pendiente'; S.pcq = S.pcq || '';
  const PC_FILTROS = [
    ['pendiente', 'Pendientes', (x) => x.estado === 'pendiente'],
    ['comprobante', 'Con comprobante', (x) => x.estado === 'pendiente' && x.tieneComprobante],
    ['vencido', 'Vencidos', (x) => x.estado === 'vencido'],
    ['confirmado', 'Confirmados', (x) => x.estado === 'confirmado'],
    ['cancelado', 'Cancelados', (x) => x.estado === 'cancelado' || x.estado === 'rechazado'],
    ['todos', 'Todos', () => true],
  ];
  const pcPath = () => '/pedidos-creditos';
  const pcFind = (id) => ((S.pc && S.pc.items) || []).find((x) => String(x.id) === String(id));
  const pcNorm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const pcMatchQ = (x) => {
    const q = pcNorm(S.pcq).trim(); if (!q) return true;
    const cod = pcNorm(x.codigo); const qc = q.replace(/^sr-?/, '');
    if (/^\d{1,4}$/.test(qc) && cod.replace(/^sr-/, '').startsWith(qc)) return true;
    const cu = x.cuenta || {};
    return [cod, cu.displayName, cu.email, cu.slug, x.packNombre].some((v) => pcNorm(v).includes(q));
  };
  const pcItems = () => {
    const all = (S.pc && S.pc.items) || [];
    // Con búsqueda se busca en todos los estados (el código es único): así aparece aunque esté en otro filtro
    if (S.pcq.trim()) return all.filter(pcMatchQ);
    const f = PC_FILTROS.find((x) => x[0] === S.pcf) || PC_FILTROS[0];
    return all.filter(f[2]);
  };
  const pcCot = () => (S.pc && S.pc.cotizacion) || {};
  function pcArs(x) {
    const c = pcCot();
    if (x.arsSugerido == null) return `<span class="tiny muted">Sin cotización: cargala en <a href="#admin.ajustes" data-go="#admin.ajustes">Ajustes</a>.</span>`;
    const vieja = !hoyAR(c.fecha);
    return `<strong data-noi18n>${ars(x.arsSugerido)}</strong><div class="tiny ${vieja ? '' : 'muted'}"${vieja ? ' style="color:var(--warn)"' : ''}>${vieja ? icon('alert') + ' ' : ''}a ${ars(c.arsPorUsd).replace('ARS ', '')} por USD · cotización del ${dia(c.fecha)}${vieja ? ' (no es de hoy)' : ''}</div>`;
  }
  function pcVence(x) {
    if (x.estado === 'pendiente') { const ms = new Date(x.vence).getTime() - Date.now(); return `<span${ms < 6 * 36e5 ? ' style="color:var(--warn)"' : ''}>${quedaTxt(x.vence)}</span><div class="tiny muted">${fecha(x.vence)}</div>`; }
    if (x.estado === 'vencido') return `<span class="muted">venció el ${fecha(x.vence)}</span>`;
    if (x.confirmado) return `<span class="muted">${x.estado === 'confirmado' ? 'confirmado' : 'cerrado'} el ${fecha(x.confirmado)}</span>`;
    return '<span class="muted">—</span>';
  }
  const pcVenceCorto = (x) => (x.estado === 'pendiente' ? ` · <span${new Date(x.vence).getTime() - Date.now() < 6 * 36e5 ? ' style="color:var(--warn)"' : ''}>${quedaTxt(x.vence)}</span> (vence el ${fecha(x.vence)})` : x.estado === 'vencido' ? ` · venció el ${fecha(x.vence)}` : x.confirmado ? ` · ${x.estado === 'confirmado' ? 'confirmado' : 'cerrado'} el ${fecha(x.confirmado)}` : '');
  const pcCreditos = (x) => `<strong data-noi18n>${cred(x.total)}</strong>${cnum(x.bonus) > 0 ? `<div class="tiny muted">${cred(x.base, false)} + ${cred(x.bonus, false)} de regalo</div>` : ''}`;
  function pcBtns(x, compact) {
    const abierto = x.estado === 'pendiente' || x.estado === 'vencido';
    const b = [];
    if (x.tieneComprobante) b.push(`<button type="button" class="btn ghost sm" data-action="prodPcComprobante" data-id="${esc(x.id)}" data-ref="${esc(x.codigo)}">${icon('image')} Comprobante</button>`);
    if (abierto && x.mensajeSugerido) b.push(`<button type="button" class="btn secondary sm" data-action="prodPcMensaje" data-id="${esc(x.id)}">${icon('copy')} Copiar mensaje</button>`);
    if (abierto) b.push(`<button type="button" class="btn sm" data-action="prodPcConfirmar" data-id="${esc(x.id)}">${icon('check')} Confirmar pago</button>`);
    if (abierto) b.push(`<button type="button" class="btn ghost sm" data-action="prodPcRechazar" data-id="${esc(x.id)}">${icon('x')} Rechazar</button>`);
    if (x.estado === 'vencido' || x.estado === 'cancelado') b.push(`<button type="button" class="btn ghost sm" data-action="prodPcReabrir" data-id="${esc(x.id)}">${icon('refresh')} Reabrir 48 h</button>`);
    return b.length ? `<div class="row pa-acts${compact ? ' pa-acts-c' : ''}" style="gap:6px">${b.join('')}</div>` : '';
  }
  const pcCod = (x) => `<span class="row nowrap" style="gap:4px;align-items:center"><code class="pa-ref" data-noi18n>${esc(x.codigo)}</code><button type="button" class="btn ghost sm pa-icbtn" data-action="prodCopy" data-v="${esc(x.codigo)}" data-l="Código" aria-label="Copiar código ${esc(x.codigo)}">${icon('copy')}</button></span>`;
  function pcRows() {
    const all = (S.pc && S.pc.items) || [];
    const items = pcItems();
    if (!items.length) {
      const q = S.pcq.trim();
      return `<div class="card"><div class="empty">${icon('wallet')}<h4>${q ? 'No hay pedidos con «' + esc(q) + '»' : S.pcf === 'pendiente' ? 'No hay pedidos pendientes' : all.length ? 'No hay pedidos en esta lista' : 'Todavía no hay pedidos de créditos'}</h4><p class="small">${q ? 'Revisá el código (por ejemplo SR-4821) o buscá por nombre o email.' : 'Cuando una acompañante pida créditos desde su panel, aparece acá con su código para que la reconozcas por WhatsApp.'}</p></div></div>`;
    }
    const sub = (x) => { const bt = pcBtns(x); const extra = [x.nota ? `<span class="small"><span class="muted">Nota de ella:</span> <span class="pa-pre" data-noi18n>${esc(x.nota)}</span></span>` : '', x.motivo ? `<span class="small"><span class="muted">Motivo:</span> ${esc(x.motivo)}</span>` : ''].filter(Boolean).join(' · '); return bt || extra ? `<tr class="pa-subrow${x.estado === 'pendiente' && x.tieneComprobante ? ' pa-hlrow' : ''}"><td colspan="6"><div class="row between" style="gap:8px;align-items:center"><div class="grow" style="min-width:0">${extra}</div>${bt}</div></td></tr>` : ''; };
    const table = `<div class="table-wrap pa-table"><table class="table pa-pctable"><thead><tr><th>Código</th><th>Acompañante</th><th>Pack</th><th>Vence</th><th>En pesos</th><th>Estado</th></tr></thead><tbody>
      ${items.map((x) => `<tr class="pa-mainrow${x.estado === 'pendiente' && x.tieneComprobante ? ' pa-hlrow' : ''}${pcBtns(x) || x.nota || x.motivo ? ' has-sub' : ''}"><td>${pcCod(x)}<div class="tiny muted">${fecha(x.creado)}</div></td><td><div class="pa-pcw">${linkCuenta(x.cuentaId, (x.cuenta || {}).displayName)}<div class="tiny muted pa-contact">${esc((x.cuenta || {}).email || '')}</div></div></td><td class="small"><div class="pa-pcw">${esc(x.packNombre)} · ${money(x.pagaUsd)}<div>${pcCreditos(x)}</div></div></td><td class="small"><div class="pa-pcw">${pcVence(x)}</div></td><td class="small"><div class="pa-pcw">${x.estado === 'pendiente' || x.estado === 'vencido' ? pcArs(x) : '<span class="muted">—</span>'}</div></td><td>${badge(ESTADO_PC[x.estado], x.estado)}${x.reaperturas ? `<div class="tiny muted">reabierto ${x.reaperturas}×</div>` : ''}</td></tr>${sub(x)}`).join('')}
      </tbody></table></div>`;
    const cards = `<div class="pa-cards">${items.map((x) => `<article class="card stack${x.estado === 'pendiente' && x.tieneComprobante ? ' pa-hl' : ''}" style="gap:10px">
        <div class="row between nowrap" style="gap:8px">${pcCod(x)}${badge(ESTADO_PC[x.estado], x.estado)}</div>
        <div class="stack" style="gap:2px;min-width:0">${linkCuenta(x.cuentaId, (x.cuenta || {}).displayName)}<span class="tiny muted ellipsis">${esc((x.cuenta || {}).email || '')}</span></div>
        <div class="row between" style="gap:8px;align-items:flex-start"><div class="small">${esc(x.packNombre)} · ${money(x.pagaUsd)}</div><div class="small" style="text-align:right">${pcCreditos(x)}</div></div>
        ${x.estado === 'pendiente' || x.estado === 'vencido' ? `<div class="small pa-ars">${pcArs(x)}</div>` : ''}
        <div class="tiny muted">Creado el ${fecha(x.creado)}${pcVenceCorto(x)}${x.reaperturas ? ` · reabierto ${x.reaperturas}×` : ''}</div>
        ${x.nota ? `<div class="small"><span class="muted">Nota de ella:</span> <span class="pa-pre" data-noi18n>${esc(x.nota)}</span></div>` : ''}
        ${x.motivo ? `<div class="small"><span class="muted">Motivo:</span> ${esc(x.motivo)}</div>` : ''}
        ${pcBtns(x)}
      </article>`).join('')}</div>`;
    return table + cards;
  }
  function vPedidos() {
    load('pc', pcPath());
    let body;
    if (!S.pc && S.err.pc) body = errorCard(S.err.pc, 'pc');
    else if (!S.pc) body = loadingCard(3);
    else {
      const all = S.pc.items || []; const c = pcCot();
      const cotTxt = c.arsPorUsd ? `Cotización: <strong>${ars(c.arsPorUsd)}</strong> por USD, cargada el ${fecha(c.fecha)}.` : 'Todavía no cargaste la cotización del dólar.';
      body = `${!c.arsPorUsd || !hoyAR(c.fecha) ? `<div class="notice warn">${icon('alert')}<span>${cotTxt} ${c.arsPorUsd ? 'No es de hoy: actualizala' : 'Cargala'} en <a href="#admin.ajustes" data-go="#admin.ajustes">Ajustes</a> para que el monto en pesos y el mensaje salgan bien.</span></div>` : `<div class="tiny muted">${cotTxt}</div>`}
        <div class="adm-filters">
          <label class="sr-only" for="prodPcQ">Buscar pedido</label><input class="input" id="prodPcQ" type="search" placeholder="Código, nombre o email" value="${esc(S.pcq)}" data-input="prodPcSearch" autocomplete="off" inputmode="search">
          <div class="chips scroll" style="flex:1 1 auto;min-width:0">${PC_FILTROS.map(([k, l, fn]) => filtro('prodPcFilter', S.pcq.trim() ? '' : S.pcf, k, l, all.filter(fn).length)).join('')}</div>
        </div>
        <div id="prodPcRows">${pcRows()}</div>`;
    }
    const pend = S.pc ? S.pc.pendientes || 0 : 0;
    const right = `<div class="row" style="gap:8px">${S.pc ? `<span class="badge ${pend ? 'warn' : 'ok'}">${pend} ${HH.plural(pend, 'pendiente', 'pendientes')}</span>` : ''}${actualizar('pc')}</div>`;
    return layout('pedidos', `${head('Pedidos de créditos', right, 'Las acompañantes piden créditos y te escriben por WhatsApp con el código. Confirmá cuando el pago esté en tu cuenta.')}<div class="stack" style="gap:14px">
      <div class="notice">${icon('info')}<span>«Copiar mensaje» copia el monto en pesos y el código, <strong>sin tus datos de pago</strong>: agregalos vos en WhatsApp. Al confirmar, los créditos (más el regalo del pack) se suman al saldo y, si estaba pausada por falta de saldo, se reintenta la renovación.</span></div>
      ${body}</div>`);
  }
  // Cupo Star por provincia (la API puede agrupar por id o por nombre: se normaliza por nombre)
  function starsPorProvincia() {
    const m = new Map();
    ((S.stars && S.stars.provincias) || []).forEach((p) => {
      const nombre = ubNombre(p.provincia) || p.provincia; const k = String(nombre).trim().toLowerCase();
      if (!m.has(k)) m.set(k, { provincia: nombre, stars: [] });
      m.get(k).stars.push(...(p.stars || []));
    });
    const cupo = (S.stars && S.stars.cupo) || 10;
    return [...m.values()].map((p) => ({ ...p, ocupadas: p.stars.length, libres: Math.max(0, cupo - p.stars.length) }));
  }
  /* ---------- Suscripciones ---------- */
  S.suf = S.suf || 'activa';
  function vSuscripciones() {
    load('sus', '/suscripciones?estado=todas');
    let body;
    if (!S.sus && S.err.sus) body = errorCard(S.err.sus, 'sus');
    else if (!S.sus) body = loadingCard(3);
    else {
      const all = S.sus.items || [];
      const F = [['activa', 'Activas'], ['vencida', 'Vencidas'], ['cancelada', 'Canceladas'], ['todas', 'Todas']];
      const items = all.filter((s) => S.suf === 'todas' || s.estado === S.suf).sort((a, b) => (S.suf === 'activa' ? (a.hasta > b.hasta ? 1 : -1) : (a.hasta < b.hasta ? 1 : -1)));
      const rest = (s) => (s.estado === 'activa' ? (s.vigente ? `${diasRestantes(s.hasta)} días` : 'empieza ' + dia(s.desde)) : '—');
      const cancel = (s) => (s.estado === 'activa' ? `<button type="button" class="btn ghost sm" data-action="prodSusCancelar" data-id="${esc(s.id)}">${icon('x')} Cancelar</button>` : '');
      body = `<div class="adm-filters"><div class="chips scroll" style="flex:1 1 auto;min-width:0">${F.map(([k, l]) => filtro('prodSusFilter', S.suf, k, l, all.filter((s) => k === 'todas' || s.estado === k).length)).join('')}</div></div>
        ${items.length ? `<div class="table-wrap pa-table"><table class="table"><thead><tr><th>Acompañante</th><th>Plan</th><th>Período</th><th>Desde</th><th>Hasta</th><th>Quedan</th><th>Estado</th><th></th></tr></thead><tbody>
          ${items.map((s) => `<tr><td>${linkCuenta(s.cuentaId, (s.cuenta || {}).displayName)}<div class="tiny muted">${esc((s.cuenta || {}).email || '')}</div></td><td>${planBadge(s.plan)}</td><td class="small">${esc(PERIODO[s.periodo] || s.periodo)}<div class="tiny muted">${esc(ORIGEN[s.origen] || s.origen || '')}${s.renovacionAuto ? ' · renueva sola' : ''}${s.cambioProgramado ? ' · pasa a ' + esc(PLAN_NOMBRE[s.cambioProgramado] || s.cambioProgramado) : ''}</div></td><td class="small">${dia(s.desde)}</td><td class="small">${dia(s.hasta)}</td><td class="small"><strong>${rest(s)}</strong></td><td>${badge(ESTADO_SUS[s.estado], s.estado)}</td><td>${cancel(s)}</td></tr>`).join('')}
          </tbody></table></div>
          <div class="pa-cards">${items.map((s) => `<article class="card stack" style="gap:8px"><div class="row between nowrap" style="gap:8px"><div style="min-width:0">${linkCuenta(s.cuentaId, (s.cuenta || {}).displayName)}<div class="tiny muted ellipsis">${esc((s.cuenta || {}).email || '')}</div></div>${badge(ESTADO_SUS[s.estado], s.estado)}</div><div class="row" style="gap:8px">${planBadge(s.plan)}<span class="small">${esc(PERIODO[s.periodo] || s.periodo)}</span><span class="small muted">${dia(s.desde)} → ${dia(s.hasta)}</span></div><div class="tiny muted">${esc(ORIGEN[s.origen] || s.origen || '')}${s.renovacionAuto ? ' · renueva sola' : ''}${s.cambioProgramado ? ' · pasa a ' + esc(PLAN_NOMBRE[s.cambioProgramado] || s.cambioProgramado) : ''}</div><div class="row between"><span class="small">Quedan: <strong>${rest(s)}</strong></span>${cancel(s)}</div></article>`).join('')}</div>`
        : `<div class="card"><div class="empty">${icon('card')}<h4>No hay suscripciones en esta lista</h4><p class="small">Se crean cuando una acompañante paga un plan con créditos o cuando asignás un plan a mano.</p></div></div>`}`;
    }
    return layout('suscripciones', `${head('Suscripciones', actualizar('sus'), 'Planes de Plata, Oro y Star. Se pagan con créditos y se renuevan solos cada 30 días si le alcanza el saldo. Una semana de Oro o Star sube el plan 7 días y después vuelve solo al que tenía.')}<div class="stack" style="gap:14px">${body}</div>`);
  }

  /* ---------- Renovaciones: vencen en 7 días y pausadas por falta de saldo ---------- */
  const nombreCu = (x) => (x.cuenta || {}).displayName || (x.cuenta || {}).email;
  const alcanzaBadge = (v) => (v == null ? '<span class="badge neutral">No renueva</span>' : v ? '<span class="badge ok">Sí</span>' : '<span class="badge danger">No</span>');
  function vRenovaciones() {
    load('ven', '/planes/vencen?dias=7'); load('pau', '/planes/pausadas');
    const vs = S.ven && S.ven.items; const ps = S.pau && S.pau.items;
    const renuevaTxt = (s) => (s.renueva ? `Sí${s.cambioProgramado ? ' · pasa a ' + esc(PLAN_NOMBRE[s.cambioProgramado] || s.cambioProgramado) : ''}` : s.periodo === 'semana' ? 'Semana: vuelve al plan base' : 'No (renovación desactivada)');
    const pauBody = !ps ? (S.err.pau ? errorCard(S.err.pau, 'pau') : loadingCard(1)) : !ps.length ? `<p class="small muted">Ninguna. Si a una acompañante no le alcanza el saldo para renovar, su perfil se pausa y aparece acá hasta que cargue créditos.</p>` : `
        <div class="table-wrap pa-table"><table class="table"><thead><tr><th>Acompañante</th><th>Plan a renovar</th><th>Pausada desde</th><th>Saldo</th><th>Cuesta</th><th>Le faltan</th><th>Perfil</th></tr></thead><tbody>
          ${ps.map((x) => `<tr><td>${linkCuenta(x.cuentaId, nombreCu(x))}<div class="tiny muted">${esc((x.cuenta || {}).email || '')}</div></td><td>${planBadge(x.plan)}</td><td class="small">${fecha(x.desde)}</td><td class="small">${cred(x.saldo)}</td><td class="small">${cred(x.costo)}</td><td class="small"><strong style="color:var(--danger)">${cred(x.faltan)}</strong></td><td>${x.pausado ? '<span class="badge danger">Pausado por saldo</span>' : badge(ESTADO_PERFIL[x.perfilEstado], x.perfilEstado)}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="pa-cards">${ps.map((x) => `<article class="card stack" style="gap:8px"><div class="row between nowrap" style="gap:8px"><div style="min-width:0">${linkCuenta(x.cuentaId, nombreCu(x))}<div class="tiny muted ellipsis">${esc((x.cuenta || {}).email || '')}</div></div>${planBadge(x.plan)}</div>
          <div class="small">Saldo ${cred(x.saldo)} · cuesta ${cred(x.costo)} · <strong style="color:var(--danger)">le faltan ${cred(x.faltan)}</strong></div>
          <div class="row between"><span class="tiny muted">Desde el ${fecha(x.desde)}</span>${x.pausado ? '<span class="badge danger">Pausado por saldo</span>' : badge(ESTADO_PERFIL[x.perfilEstado], x.perfilEstado)}</div></article>`).join('')}</div>`;
    const venBody = !vs ? (S.err.ven ? errorCard(S.err.ven, 'ven') : loadingCard(2)) : !vs.length ? '<p class="small muted">Ningún plan vence en los próximos 7 días.</p>' : `
        <div class="table-wrap pa-table"><table class="table"><thead><tr><th>Acompañante</th><th>Plan</th><th>Vence</th><th>Renueva</th><th>Cuesta</th><th>Saldo</th><th>¿Le alcanza?</th></tr></thead><tbody>
          ${vs.map((s) => `<tr><td>${linkCuenta(s.cuentaId, nombreCu(s))}<div class="tiny muted">${esc((s.cuenta || {}).email || '')}</div></td><td>${planBadge(s.plan)} <span class="tiny muted">${esc(PERIODO[s.periodo] || s.periodo)}</span></td><td class="small">${dia(s.hasta)}<div class="tiny muted">quedan ${diasRestantes(s.hasta)} días</div></td><td class="small">${renuevaTxt(s)}</td><td class="small">${s.costoRenovacion ? cred(s.costoRenovacion) : '—'}</td><td class="small">${cred(s.saldo)}</td><td>${alcanzaBadge(s.alcanza)}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="pa-cards">${vs.map((s) => `<article class="card stack${s.renueva && !s.alcanza ? ' pa-hl' : ''}" style="gap:8px"><div class="row between nowrap" style="gap:8px"><div style="min-width:0">${linkCuenta(s.cuentaId, nombreCu(s))}<div class="tiny muted ellipsis">${esc((s.cuenta || {}).email || '')}</div></div>${planBadge(s.plan)}</div>
          <div class="small">Vence el ${dia(s.hasta)} · <strong>quedan ${diasRestantes(s.hasta)} días</strong></div>
          <div class="small">Renueva: ${renuevaTxt(s)}${s.costoRenovacion ? ' · cuesta ' + cred(s.costoRenovacion) : ''}</div>
          <div class="row between"><span class="small">Saldo ${cred(s.saldo)}</span><span class="small">¿Le alcanza? ${alcanzaBadge(s.alcanza)}</span></div></article>`).join('')}</div>`;
    const right = `<div class="row" style="gap:8px"><button type="button" class="btn ghost sm" data-action="prodRetry" data-k="ren">${icon('refresh')} Actualizar</button></div>`;
    return layout('renovaciones', `${head('Renovaciones', right, 'Los planes se renuevan solos cada 30 días con los créditos del saldo. Si no alcanza, el perfil se pausa hasta que cargue.')}<div class="stack" style="gap:14px">
      <section class="card stack" style="gap:12px"><div class="row between"><div class="card-title">${icon('clock')} Pausadas por falta de saldo</div>${ps ? `<span class="badge ${ps.length ? 'danger' : 'ok'}">${ps.length}</span>` : ''}</div>${pauBody}</section>
      <section class="card stack" style="gap:12px"><div class="row between"><div class="card-title">${icon('calendar')} Vencen en 7 días</div>${vs ? `<span class="badge ${S.ven.sinSaldo ? 'warn' : 'ok'}">${vs.length}${S.ven.sinSaldo ? ` · ${S.ven.sinSaldo} sin saldo` : ''}</span>` : ''}</div>${venBody}</section>
    </div>`);
  }

  /* ---------- Destacados (Bronce, Plata y Oro, por provincia; cupo 20 % redondeado hacia arriba, mínimo 1) ---------- */
  S.dsf = S.dsf || 'vig';
  const dstEf = (x) => { const now = Date.now(); if (x.estado === 'cancelado') return 'cancelado'; if (new Date(x.hasta).getTime() <= now || x.estado === 'vencido') return 'vencido'; return new Date(x.desde).getTime() > now ? 'programado' : 'activo'; };
  const DS_FILTROS = [['vig', 'Activos y programados', (x) => ['activo', 'programado'].includes(dstEf(x))], ['activo', 'Activos', (x) => dstEf(x) === 'activo'], ['programado', 'Programados', (x) => dstEf(x) === 'programado'], ['vencido', 'Terminados', (x) => dstEf(x) === 'vencido'], ['cancelado', 'Cancelados', (x) => dstEf(x) === 'cancelado'], ['todos', 'Todos', () => true]];
  function vDestacados() {
    load('dstT', '/destacados?estado=todos'); loadCatalogos();
    let body;
    const d = S.dstT;
    if (!d && S.err.dstT) body = errorCard(S.err.dstT, 'dstT');
    else if (!d) body = loadingCard(3);
    else {
      const all = d.items || [];
      const f = DS_FILTROS.find((x) => x[0] === S.dsf) || DS_FILTROS[0];
      const items = all.filter(f[2]);
      const zonas = (d.zonas || []).slice().sort((a, b) => (PLANES.indexOf(b.plan) - PLANES.indexOf(a.plan)) || String(ubNombre(a.provincia) || a.provincia).localeCompare(String(ubNombre(b.provincia) || b.provincia), 'es'));
      const act = all.filter((x) => dstEf(x) === 'activo').length; const prog = all.filter((x) => dstEf(x) === 'programado').length;
      const cancelBtn = (x) => (['activo', 'programado'].includes(dstEf(x)) ? `<button type="button" class="btn ghost sm" data-action="prodDstCancelar" data-id="${esc(x.id)}">${icon('x')} Cancelar</button>` : '');
      const zonaCard = (z) => `<article class="card stack" style="gap:8px"><div class="row between nowrap" style="gap:8px"><div class="row nowrap" style="gap:8px;min-width:0">${planBadge(z.plan)}<strong class="ellipsis">${esc(ubNombre(z.provincia) || z.provincia)}</strong></div><span class="badge ${z.ocupadosAhora >= z.cupo ? 'danger' : 'ok'}">${z.ocupadosAhora}/${z.cupo}</span></div>
          <div class="pa-bar" aria-hidden="true"><i style="width:${Math.min(100, (z.ocupadosAhora / Math.max(1, z.cupo)) * 100)}%"></i></div>
          <div class="tiny muted">${z.ocupadosAhora} ahora de ${z.cupo} ${HH.plural(z.cupo, 'lugar', 'lugares')} · ${z.activos} ${HH.plural(z.activos, 'perfil publicado', 'perfiles publicados')} de ${esc(z.planNombre || PLAN_NOMBRE[z.plan])} · ${z.reservas} ${HH.plural(z.reservas, 'reserva vigente', 'reservas vigentes')}</div></article>`;
      body = `<div class="adm-stats">${stat('Activos ahora', act, 'en el sitio', 'accent')}${stat('Programados', prog, 'empiezan más adelante')}${stat('Zonas con Destacados', zonas.length, 'plan y provincia')}</div>
        <section class="stack" style="gap:10px"><div class="card-title">Cupo por plan y provincia</div>${zonas.length ? `<div class="pa-grid2">${zonas.map(zonaCard).join('')}</div>` : '<p class="small muted">No hay Destacados vigentes.</p>'}
          <p class="tiny muted">Cupo: el ${d.porcentaje || 20} % de las acompañantes publicadas de ese plan en la provincia, redondeado hacia arriba (mínimo 1).</p></section>
        <div class="adm-filters"><div class="chips scroll" style="flex:1 1 auto;min-width:0">${DS_FILTROS.map(([k, l, fn]) => filtro('prodDstFilter', S.dsf, k, l, all.filter(fn).length)).join('')}</div></div>
        ${items.length ? `<div class="table-wrap pa-table"><table class="table"><thead><tr><th>Acompañante</th><th>Plan</th><th>Provincia</th><th>Desde</th><th>Hasta</th><th>Pagó</th><th>Estado</th><th></th></tr></thead><tbody>
            ${items.map((x) => `<tr><td>${linkCuenta(x.cuentaId, nombreCu(x))}<div class="tiny muted">${esc((x.cuenta || {}).email || '')}</div></td><td>${planBadge(x.plan)}</td><td class="small">${esc(ubNombre(x.provincia) || x.provincia || '')}</td><td class="small">${fecha(x.desde)}</td><td class="small">${fecha(x.hasta)}<div class="tiny muted">${x.dias} ${HH.plural(x.dias, 'día', 'días')}</div></td><td class="small">${cred(x.costo)}</td><td>${badge(ESTADO_DEST[dstEf(x)], dstEf(x))}</td><td>${cancelBtn(x)}</td></tr>`).join('')}
          </tbody></table></div>
          <div class="pa-cards">${items.map((x) => `<article class="card stack" style="gap:8px"><div class="row between nowrap" style="gap:8px"><div style="min-width:0">${linkCuenta(x.cuentaId, nombreCu(x))}<div class="tiny muted ellipsis">${esc((x.cuenta || {}).email || '')}</div></div>${badge(ESTADO_DEST[dstEf(x)], dstEf(x))}</div>
            <div class="row" style="gap:8px">${planBadge(x.plan)}<span class="small">${esc(ubNombre(x.provincia) || x.provincia || '')}</span><span class="small muted">${x.dias} ${HH.plural(x.dias, 'día', 'días')} · ${cred(x.costo)}</span></div>
            <div class="row between"><span class="tiny muted">${fecha(x.desde)} → ${fecha(x.hasta)}</span>${cancelBtn(x)}</div></article>`).join('')}</div>`
        : `<div class="card"><div class="empty">${icon('trending')}<h4>No hay Destacados en esta lista</h4><p class="small">Las acompañantes de Bronce, Plata y Oro compran Destacado con créditos (1 o 7 días) desde su panel.</p></div></div>`}`;
    }
    return layout('destacados', `${head('Destacados', actualizar('dstT'), 'Arriba de su plan en su provincia, por 1 o 7 días. Se pagan con créditos.')}<div class="stack" style="gap:14px">${body}</div>`);
  }

  /* ---------- Stars ---------- */
  function vStars() {
    load('stars', '/stars'); loadCatalogos();
    let body;
    if (!S.stars && S.err.stars) body = errorCard(S.err.stars, 'stars');
    else if (!S.stars) body = loadingCard(3);
    else {
      const provs = starsPorProvincia().sort((a, b) => (b.ocupadas - a.ocupadas) || String(a.provincia).localeCompare(String(b.provincia), 'es'));
      const total = provs.reduce((n, p) => n + p.ocupadas, 0);
      const cupo = S.stars.cupo || 10;
      const con = provs.filter((p) => p.ocupadas); const sin = provs.filter((p) => !p.ocupadas);
      const card = (p) => `<article class="card stack" style="gap:8px"><div class="row between"><strong>${esc(p.provincia)}</strong><span class="badge ${p.libres ? 'ok' : 'danger'}">${p.ocupadas}/${cupo}</span></div>
          <div class="pa-bar" aria-hidden="true"><i style="width:${Math.min(100, (p.ocupadas / cupo) * 100)}%"></i></div>
          ${p.stars.length ? `<div class="list">${p.stars.map((s) => `<a class="list-item small" href="#admin.acompanantes.${esc(s.cuentaId)}" data-go="#admin.acompanantes.${esc(s.cuentaId)}">${icon('star')}<div class="grow"><strong data-noi18n>${esc(s.displayName || s.slug || '')}</strong></div><span class="tiny muted">hasta ${dia(s.hasta)}</span></a>`).join('')}</div>` : ''}
          <div class="tiny muted">${p.libres} ${HH.plural(p.libres, 'lugar libre', 'lugares libres')}</div></article>`;
      body = `<div class="adm-stats">${stat('Stars activas', total, `cupo de ${cupo} por provincia`, 'accent')}${stat('Provincias con Stars', con.length, `de ${provs.length}`)}${stat('Provincias completas', provs.filter((p) => !p.libres).length, 'sin lugar libre')}</div>
        ${con.length ? `<div class="pa-grid2">${con.map(card).join('')}</div>` : `<div class="card"><div class="empty">${icon('star')}<h4>Todavía no hay Stars</h4><p class="small">Cuando una acompañante pague Star con créditos (mes o semana) o asignes Star a mano, aparece acá.</p></div></div>`}
        ${sin.length ? `<details class="card pa-done"><summary><strong>Provincias sin Stars · ${sin.length}</strong> <span class="small muted">(10 lugares libres en cada una)</span></summary><div class="small muted" style="margin-top:10px">${sin.map((p) => esc(p.provincia)).join(' · ')}</div></details>` : ''}`;
    }
    return layout('stars', `${head('Stars', actualizar('stars'), 'Lugar fijo arriba del inicio: 10 por provincia, contando mes y semana')}<div class="stack" style="gap:14px">${body}</div>`);
  }

  /* ---------- Ubicaciones ---------- */
  S.uf = S.uf || 'all'; S.uq = S.uq || '';
  function vUbicaciones() {
    load('ub', '/ubicaciones');
    let body;
    if (!S.ub && S.err.ub) body = errorCard(S.err.ub, 'ub');
    else if (!S.ub) body = loadingCard(4);
    else {
      const all = S.ub.items || [];
      const q = S.uq.trim().toLowerCase();
      const items = all.filter((u) => (S.uf === 'all' || u.tipo === S.uf) && (!q || String(u.nombre).toLowerCase().includes(q) || String(u.id).includes(q)));
      body = `<div class="adm-filters">
          <label class="sr-only" for="prodUbQ">Buscar lugar</label><input class="input" id="prodUbQ" type="search" placeholder="Buscar lugar" value="${esc(S.uq)}" data-input="prodUbSearch" autocomplete="off">
          <div class="chips scroll" style="flex:1 1 auto;min-width:0">${filtro('prodUbFilter', S.uf, 'all', 'Todos', all.length)}${TIPOS_UBIC.map((t) => filtro('prodUbFilter', S.uf, t, TIPO_UBIC[t], all.filter((u) => u.tipo === t).length)).join('')}</div>
        </div>
        <div id="prodUbRows">${items.length ? `<div class="list card" style="padding:4px">${items.slice(0, 400).map((u) => `<div class="list-item"><span class="badge neutral" style="min-width:74px;justify-content:center">${TIPO_UBIC[u.tipo] || esc(u.tipo)}</span><div class="grow" style="min-width:0"><div class="title" data-noi18n>${esc(u.nombre)}${u.activa ? '' : ' <span class="badge warn">Inactiva</span>'}</div><div class="sub ellipsis">${u.padre ? 'en ' + esc(ubNombre(u.padre)) + ' · ' : ''}<code>${esc(u.id)}</code> · orden ${u.orden || 0}</div></div><button type="button" class="switch" role="switch" aria-checked="${!!u.activa}" aria-label="Activa" data-action="prodUbActiva" data-id="${esc(u.id)}"></button><button type="button" class="icon-btn sm" data-action="prodCatEdit" data-t="ubicaciones" data-id="${esc(u.id)}" aria-label="Editar ${esc(u.nombre)}">${icon('edit')}</button><button type="button" class="icon-btn sm" data-action="prodCatDel" data-t="ubicaciones" data-id="${esc(u.id)}" aria-label="Borrar ${esc(u.nombre)}">${icon('trash')}</button></div>`).join('')}</div>` : `<div class="card"><div class="empty">${icon('pin')}<h4>Sin resultados</h4></div></div>`}</div>`;
    }
    const right = `<div class="row" style="gap:8px">${actualizar('ub')}<button type="button" class="btn sm" data-action="prodCatEdit" data-t="ubicaciones">${icon('plus')} Nuevo lugar</button></div>`;
    return layout('ubicaciones', `${head('Ubicaciones', right, 'Países, provincias, ciudades y zonas que pueden elegir las acompañantes. Desactivar oculta el lugar sin borrarlo.')}<div class="stack" style="gap:14px">${body}</div>`);
  }

  /* ---------- Categorías (salidas) e Intereses ---------- */
  function vCategorias() {
    load('cat', '/categorias'); load('int', '/intereses');
    const catList = !S.cat ? (S.err.cat ? errorCard(S.err.cat, 'cat') : loadingCard(2)) : ((S.cat.items || []).length ? `<div class="list card" style="padding:4px">${S.cat.items.map((c) => `<div class="list-item"><span class="pa-catic">${icon(c.icono || 'sparkles')}</span><div class="grow"><div class="title">${esc(c.nombre)}${c.activa ? '' : ' <span class="badge warn">Inactiva</span>'}</div><div class="sub"><code>${esc(c.id)}</code> · orden ${c.orden || 0}</div></div><button type="button" class="switch" role="switch" aria-checked="${!!c.activa}" aria-label="Activa" data-action="prodCatActiva" data-id="${esc(c.id)}"></button><button type="button" class="icon-btn sm" data-action="prodCatEdit" data-t="categorias" data-id="${esc(c.id)}" aria-label="Editar ${esc(c.nombre)}">${icon('edit')}</button><button type="button" class="icon-btn sm" data-action="prodCatDel" data-t="categorias" data-id="${esc(c.id)}" aria-label="Borrar ${esc(c.nombre)}">${icon('trash')}</button></div>`).join('')}</div>` : '<p class="small muted">No hay categorías.</p>');
    const intList = !S.int ? (S.err.int ? errorCard(S.err.int, 'int') : loadingCard(2)) : ((S.int.items || []).length ? `<div class="list card" style="padding:4px">${S.int.items.map((i) => `<div class="list-item"><div class="grow" style="min-width:0"><div class="title">${esc(i.nombre)}</div><div class="sub ellipsis">EN: ${esc(i.nombre_en || '—')} · PT: ${esc(i.nombre_pt || '—')} · orden ${i.orden || 0}</div></div><button type="button" class="icon-btn sm" data-action="prodCatEdit" data-t="intereses" data-id="${esc(i.id)}" aria-label="Editar ${esc(i.nombre)}">${icon('edit')}</button><button type="button" class="icon-btn sm" data-action="prodCatDel" data-t="intereses" data-id="${esc(i.id)}" aria-label="Borrar ${esc(i.nombre)}">${icon('trash')}</button></div>`).join('')}</div>` : '<p class="small muted">No hay intereses.</p>');
    return layout('categorias', `${head('Categorías', actualizar('cat'), 'Tipos de salida del inicio, los filtros y las páginas por lugar, e intereses que cada acompañante elige para su ficha')}
      <div class="stack" style="gap:18px">
        <section class="stack" style="gap:10px"><div class="row between"><h3 style="font-size:17px">Salidas</h3><button type="button" class="btn sm" data-action="prodCatEdit" data-t="categorias">${icon('plus')} Nueva salida</button></div>${catList}</section>
        <section class="stack" style="gap:10px"><div class="row between"><h3 style="font-size:17px">Intereses</h3><button type="button" class="btn sm" data-action="prodCatEdit" data-t="intereses">${icon('plus')} Nuevo interés</button></div><p class="small muted">Solo gustos y temas de conversación (máximo 6 por acompañante). Los nombres en inglés y portugués se muestran cuando el visitante cambia de idioma.</p>${intList}</section>
      </div>`);
  }
  const CAT_ICONOS = ['coffee', 'icecream', 'walk', 'museum', 'cine', 'dinner', 'ticket', 'languages', 'bag', 'dumbbell', 'music', 'globe', 'heart', 'star', 'camera', 'sparkles'];
  function catForm(t, it) {
    it = it || {};
    if (t === 'ubicaciones') {
      const ub = cat.ub();
      const padres = (tipo) => ub.filter((u) => TIPOS_UBIC.indexOf(u.tipo) < TIPOS_UBIC.indexOf(tipo) && u.id !== it.id);
      const tipo = it.tipo || 'ciudad';
      return `<div class="stack" style="gap:12px">
        <div class="field"><label for="cfNombre">Nombre</label><input class="input" id="cfNombre" maxlength="80" value="${esc(it.nombre || '')}" placeholder="Ej.: Mar del Plata"></div>
        <div class="grid-2"><div class="field"><label for="cfTipo">Tipo</label><select class="select" id="cfTipo" data-change="prodUbTipo">${TIPOS_UBIC.map((x) => `<option value="${x}"${x === tipo ? ' selected' : ''}>${TIPO_UBIC[x]}</option>`).join('')}</select></div>
        <div class="field"><label for="cfOrden">Orden</label><input class="input" id="cfOrden" type="number" min="0" max="9999" value="${esc(it.orden != null ? it.orden : 0)}"></div></div>
        <div class="field"><label for="cfPadre">Pertenece a</label><select class="select" id="cfPadre">${tipo === 'pais' ? '<option value="">(ninguno)</option>' : ''}${padres(tipo).map((u) => `<option value="${esc(u.id)}"${u.id === it.padre ? ' selected' : ''}>${esc(u.nombre)} (${TIPO_UBIC[u.tipo]})</option>`).join('')}</select><span class="hint">Una ciudad pertenece a una provincia; una zona, a una ciudad.</span></div>
        <label class="row nowrap small" style="gap:8px"><input type="checkbox" id="cfActiva"${it.activa === false ? '' : ' checked'}> Activa (se puede elegir y se muestra en el sitio)</label>
        ${it.id ? `<p class="tiny muted">Identificador: <code>${esc(it.id)}</code> (no cambia)</p>` : '<p class="tiny muted">El identificador se arma solo con el nombre.</p>'}
      </div>`;
    }
    if (t === 'categorias') {
      return `<div class="stack" style="gap:12px">
        <div class="field"><label for="cfNombre">Nombre</label><input class="input" id="cfNombre" maxlength="40" value="${esc(it.nombre || '')}" placeholder="Ej.: Teatro"></div>
        <div class="field"><span class="label">Ícono</span><div class="chips">${CAT_ICONOS.map((ic) => `<button type="button" class="chip${(it.icono || 'sparkles') === ic ? ' active' : ''}" data-action="prodCatIcono" data-v="${ic}" aria-pressed="${(it.icono || 'sparkles') === ic}">${icon(ic)}</button>`).join('')}</div><input type="hidden" id="cfIcono" value="${esc(it.icono || 'sparkles')}"></div>
        <div class="field"><label for="cfOrden">Orden</label><input class="input" id="cfOrden" type="number" min="0" max="9999" value="${esc(it.orden != null ? it.orden : 0)}"></div>
        <label class="row nowrap small" style="gap:8px"><input type="checkbox" id="cfActiva"${it.activa === false ? '' : ' checked'}> Activa</label>
        ${it.id ? `<p class="tiny muted">Identificador: <code>${esc(it.id)}</code>. Cambiar el nombre no cambia las direcciones de las páginas.</p>` : ''}
      </div>`;
    }
    return `<div class="stack" style="gap:12px">
      <div class="field"><label for="cfNombre">Nombre (castellano)</label><input class="input" id="cfNombre" maxlength="40" value="${esc(it.nombre || '')}" placeholder="Ej.: Fotografía"></div>
      <div class="grid-2"><div class="field"><label for="cfEn">Inglés (opcional)</label><input class="input" id="cfEn" maxlength="40" value="${esc(it.nombre_en || '')}"></div><div class="field"><label for="cfPt">Portugués (opcional)</label><input class="input" id="cfPt" maxlength="40" value="${esc(it.nombre_pt || '')}"></div></div>
      <div class="field"><label for="cfOrden">Orden</label><input class="input" id="cfOrden" type="number" min="0" max="9999" value="${esc(it.orden != null ? it.orden : 0)}"></div>
    </div>`;
  }
  const CAT_KEY = { ubicaciones: 'ub', categorias: 'cat', intereses: 'int' };
  const CAT_TIT = { ubicaciones: ['Nuevo lugar', 'Editar lugar'], categorias: ['Nueva salida', 'Editar salida'], intereses: ['Nuevo interés', 'Editar interés'] };

  /* ---------- Ajustes → Textos del inicio (API: routes/admin-textos-sitio.js; el sitio los aplica en prod-sitio.js) ----------
     Reemplaza a la tarjeta «Portada» (su ajuste quedaba guardado pero el sitio no lo usaba): el título y el subtítulo se
     editan acá, junto con el resto de los textos. */
  const TS_LANGS = [['es', 'Español'], ['en', 'Inglés'], ['pt', 'Portugués']];
  const TS_CAMPOS = [['heroEyebrow', 'Línea de arriba del título', 60, false], ['heroTitulo', 'Título', 120, false], ['heroSubtitulo', 'Subtítulo', 300, true], ['faqTitulo', 'Título de las preguntas frecuentes', 120, false]];
  const tsVacio = () => ({ heroEyebrow: '', heroTitulo: '', heroSubtitulo: '', faqTitulo: '', faq: [] });
  function tsCopia() {
    if (S.tsEdit) return S.tsEdit;
    if (!S.ts) return null;
    // Sin textos guardados: los que muestra hoy el sitio (la vieja «Portada» de Ajustes nunca se aplicaba al sitio)
    const v = S.ts.valor; const def = JSON.parse(JSON.stringify(S.ts.defaults.es));
    const de = (l) => Object.assign(tsVacio(), (v && v[l]) || {}, { faq: ((v && v[l] && v[l].faq) || []).map((x) => ({ pregunta: x.pregunta, respuesta: x.respuesta })) });
    S.tsEdit = { es: v ? Object.assign(tsVacio(), def, de('es'), { faq: v.es && Array.isArray(v.es.faq) ? de('es').faq : def.faq }) : Object.assign(tsVacio(), def), en: de('en'), pt: de('pt') };
    return S.tsEdit;
  }
  function textosInicioCard() {
    load('ts', '/textos-sitio');
    const head0 = `<div class="row between"><div class="card-title">${icon('home')} Textos del inicio</div>${S.ts && S.ts.actualizado ? `<span class="tiny muted">Actualizado el ${fecha(S.ts.actualizado)}</span>` : ''}</div>`;
    if (!S.ts) return `<section class="card stack" style="gap:10px">${head0}${S.err.ts ? `<div class="notice warn">${icon('alert')}<span>${esc(S.err.ts)}</span></div>` : loadingCard(2)}</section>`;
    const c = tsCopia(); const lang = S.tsLang || 'es'; const t = c[lang]; const es = c.es;
    const ph = (campo) => (lang === 'es' ? '' : ` placeholder="${esc(es[campo] || '')}"`);
    const campos = TS_CAMPOS.map(([k, label, max, area]) => `<div class="field"><label for="ts_${k}">${label}${lang === 'es' && k !== 'heroEyebrow' ? '' : ' <span class="tiny muted">(opcional)</span>'}</label>${area ? `<textarea class="textarea" id="ts_${k}" rows="3" maxlength="${max}" data-input="prodTsCampo" data-k="${k}"${ph(k)}>${esc(t[k] || '')}</textarea>` : `<input class="input" id="ts_${k}" maxlength="${max}" data-input="prodTsCampo" data-k="${k}" value="${esc(t[k] || '')}"${ph(k)}>`}${k === 'heroTitulo' ? '<span class="hint">Entre asteriscos va en rosa: Compañía para tu próxima *salida*.</span>' : ''}</div>`).join('');
    const faq = t.faq || [];
    const filas = faq.map((x, i) => `<div class="card stack" style="gap:8px;padding:12px">
        <div class="row between" style="gap:6px"><strong class="small">Pregunta ${i + 1}</strong><div class="row nowrap" style="gap:4px">
          <button type="button" class="btn ghost sm" data-action="prodTsFaq" data-op="up" data-i="${i}"${i === 0 ? ' disabled' : ''} aria-label="Subir pregunta ${i + 1}"><span style="display:inline-flex;transform:rotate(180deg)">${icon('chevronDown')}</span></button>
          <button type="button" class="btn ghost sm" data-action="prodTsFaq" data-op="down" data-i="${i}"${i === faq.length - 1 ? ' disabled' : ''} aria-label="Bajar pregunta ${i + 1}">${icon('chevronDown')}</button>
          <button type="button" class="btn ghost sm" data-action="prodTsFaq" data-op="del" data-i="${i}" aria-label="Quitar pregunta ${i + 1}">${icon('trash')}</button></div></div>
        <input class="input" maxlength="160" aria-label="Pregunta ${i + 1}" data-input="prodTsFaqCampo" data-i="${i}" data-k="pregunta" value="${esc(x.pregunta)}">
        <textarea class="textarea" rows="3" maxlength="1200" aria-label="Respuesta ${i + 1}" data-input="prodTsFaqCampo" data-i="${i}" data-k="respuesta">${esc(x.respuesta)}</textarea>
      </div>`).join('');
    return `<section class="card stack" style="gap:12px">${head0}
      <p class="small muted">Título, subtítulo y preguntas frecuentes de la página de inicio. El español es obligatorio; en inglés y portugués, lo que dejes vacío usa el texto en español (si es el texto de siempre, el sitio lo muestra traducido).</p>
      <div class="chips" role="tablist" aria-label="Idioma">${TS_LANGS.map(([l, n]) => `<button type="button" class="chip${l === lang ? ' active' : ''}" role="tab" aria-selected="${l === lang}" data-action="prodTsLang" data-l="${l}">${n}</button>`).join('')}</div>
      ${campos}
      <div class="row between"><strong class="small">Preguntas frecuentes · ${faq.length}</strong><button type="button" class="btn secondary sm" data-action="prodTsFaq" data-op="add"${faq.length >= 12 ? ' disabled' : ''}>${icon('plus')} Agregar pregunta</button></div>
      ${lang !== 'es' && !faq.length ? `<p class="tiny muted">Sin preguntas en ${lang === 'en' ? 'inglés' : 'portugués'}: se muestran las de español.</p>` : ''}
      ${lang === 'es' && !faq.length ? '<p class="tiny muted">Sin preguntas: la sección no se muestra.</p>' : ''}
      <div class="stack" style="gap:10px">${filas}</div>
      <div class="row" style="gap:8px"><button type="button" class="btn sm" data-action="prodTsGuardar">${icon('check')} Guardar textos</button>${S.ts.valor ? `<button type="button" class="btn ghost sm" data-action="prodTsRestaurar">${icon('refresh')} Volver a los textos por defecto</button>` : ''}</div>
    </section>`;
  }
  Object.assign(HH.actions, {
    prodTsLang(el) { S.tsLang = el.dataset.l; HH.refresh(); },
    prodTsCampo(el) { const c = tsCopia(); if (c) c[S.tsLang || 'es'][el.dataset.k] = el.value; },
    prodTsFaqCampo(el) { const c = tsCopia(); const it = c && c[S.tsLang || 'es'].faq[Number(el.dataset.i)]; if (it) it[el.dataset.k] = el.value; },
    prodTsFaq(el) {
      const c = tsCopia(); if (!c) return; const f = c[S.tsLang || 'es'].faq; const i = Number(el.dataset.i); const op = el.dataset.op;
      if (op === 'add') { if (f.length < 12) f.push({ pregunta: '', respuesta: '' }); }
      else if (op === 'del') f.splice(i, 1);
      else if (op === 'up' && i > 0) [f[i - 1], f[i]] = [f[i], f[i - 1]];
      else if (op === 'down' && i < f.length - 1) [f[i + 1], f[i]] = [f[i], f[i + 1]];
      HH.refresh();
      if (op === 'add') setTimeout(() => { const ins = document.querySelectorAll('[data-input="prodTsFaqCampo"][data-k="pregunta"]'); const last = ins[ins.length - 1]; if (last) last.focus(); }, 0);
    },
    prodTsGuardar(el) {
      const c = tsCopia(); if (!c) return;
      const valor = { es: c.es };
      ['en', 'pt'].forEach((l) => { const t = c[l]; if (TS_CAMPOS.some(([k]) => String(t[k] || '').trim()) || (t.faq || []).some((x) => (x.pregunta + x.respuesta).trim())) valor[l] = t; });
      el.disabled = true;
      HH.api('PUT', '/textos-sitio', { valor })
        .then((r) => { S.ts = r; S.tsEdit = null; HH.toast('Textos del inicio guardados', { type: 'ok' }); HH.refresh(); })
        .catch((e) => { el.disabled = false; fail(e); });
    },
    prodTsRestaurar() {
      HH.confirm({ title: 'Volver a los textos por defecto', text: 'Se borran los textos del inicio que cargaste (en los tres idiomas) y el sitio vuelve a mostrar los de siempre.', okLabel: 'Volver a los de siempre', cls: 'danger', onOk: () => {
        HH.api('DELETE', '/textos-sitio')
          .then((r) => { S.ts = r; S.tsEdit = null; HH.toast('Se restauraron los textos por defecto', { type: 'ok' }); HH.refresh(); })
          .catch(fail);
      } });
    },
  });

  /* ---------- Ajustes ---------- */
  // «Alcanza para…» sugerido (mismo cálculo que el servidor): el plan más alto que entra al menos un mes, más el resto
  function alcanzaSug(recibe) {
    const pr = (S.aj && S.aj.precios && S.aj.precios.mes) || {};
    for (const p of ['S', 'C', 'D']) {
      const precio = Number(pr[p]); if (!precio) continue;
      const k = Math.floor(Number(recibe) / precio);
      if (k >= 1) { const resto = Math.round((Number(recibe) - k * precio) * 100) / 100; return `${k} ${k === 1 ? 'mes' : 'meses'} de ${PLAN_NOMBRE[p]}${resto > 0 ? ` + ${resto}` : ''}`; }
    }
    return 'Destacados sueltos';
  }
  const pkEdit = () => { if (!S.pkEdit) S.pkEdit = ((S.aj && S.aj.packs) || []).map((p) => ({ id: p.id, nombre: p.nombre, pagaUsd: p.pagaUsd, recibe: p.recibe, alcanzaPara: p.alcanzaPara || '', masElegido: !!p.masElegido, activo: p.activo !== false })); return S.pkEdit; };
  const pkBonus = (p) => { const b = Math.round((Number(p.recibe) - Number(p.pagaUsd)) * 100) / 100; return Number.isFinite(b) ? b : 0; };
  function packsHtml() {
    const list = pkEdit();
    const row = (p, i) => `<div class="pa-pack${p.activo ? '' : ' off'}" data-pk="${i}">
        <div class="row between nowrap" style="gap:8px"><strong class="ellipsis">${i + 1}. ${esc(p.nombre || 'Pack nuevo')}</strong><span class="row nowrap" style="gap:2px">
          <button type="button" class="icon-btn sm" data-action="prodPkMove" data-i="${i}" data-d="-1" aria-label="Subir"${i === 0 ? ' disabled' : ''}>${icon('arrowLeft', 'pa-up')}</button>
          <button type="button" class="icon-btn sm" data-action="prodPkMove" data-i="${i}" data-d="1" aria-label="Bajar"${i === list.length - 1 ? ' disabled' : ''}>${icon('arrowRight', 'pa-up')}</button>
          <button type="button" class="icon-btn sm" data-action="prodPkDel" data-i="${i}" aria-label="Quitar ${esc(p.nombre || 'pack')}">${icon('trash')}</button></span></div>
        <div class="pa-pkgrid">
          <div class="field"><label for="pk_n_${i}">Nombre</label><input class="input" id="pk_n_${i}" maxlength="40" value="${esc(p.nombre)}" data-input="prodPkField" data-i="${i}" data-f="nombre"></div>
          <div class="field"><label for="pk_p_${i}">Paga (USD)</label><input class="input" id="pk_p_${i}" type="number" min="10" step="1" value="${esc(p.pagaUsd)}" data-input="prodPkField" data-i="${i}" data-f="pagaUsd"></div>
          <div class="field"><label for="pk_r_${i}">Recibe (créditos)</label><input class="input" id="pk_r_${i}" type="number" min="10" step="1" value="${esc(p.recibe)}" data-input="prodPkField" data-i="${i}" data-f="recibe"></div>
          <div class="field pa-pkwide"><label for="pk_a_${i}">Alcanza para</label><input class="input" id="pk_a_${i}" maxlength="80" value="${esc(p.alcanzaPara)}" placeholder="Automático: ${esc(alcanzaSug(p.recibe))}" data-input="prodPkField" data-i="${i}" data-f="alcanzaPara"></div>
        </div>
        <div class="row" style="gap:14px;align-items:center">
          <span class="small" id="pk_b_${i}">${pkBonus(p) > 0 ? `<span class="badge ok">+${pkBonus(p)} de regalo</span>` : '<span class="tiny muted">sin regalo</span>'}</span>
          <label class="row nowrap small" style="gap:6px"><input type="checkbox" data-change="prodPkField" data-i="${i}" data-f="masElegido"${p.masElegido ? ' checked' : ''}> Más elegido</label>
          <label class="row nowrap small" style="gap:6px"><input type="checkbox" data-change="prodPkField" data-i="${i}" data-f="activo"${p.activo ? ' checked' : ''}> Activo</label>
        </div>
      </div>`;
    return `${list.length ? list.map(row).join('') : '<p class="small muted">No hay packs: las acompañantes solo pueden hacer cargas a medida.</p>'}
      <div class="row" style="gap:8px">${list.length < 12 ? `<button type="button" class="btn ghost sm" data-action="prodPkAdd">${icon('plus')} Agregar pack</button>` : '<span class="tiny muted">Máximo 12 packs.</span>'}<span class="grow"></span>${S.pkDirty ? `<button type="button" class="btn ghost sm" data-action="prodPkReset">Descartar cambios</button>` : ''}<button type="button" class="btn sm" data-action="prodAjSave" data-k="packs">${icon('check')} Guardar packs</button></div>`;
  }
  function vAjustes() {
    load('aj', '/ajustes');
    let body;
    if (!S.aj && S.err.aj) body = errorCard(S.err.aj, 'aj');
    else if (!S.aj) body = loadingCard(3);
    else {
      const a = S.aj; const pr = a.precios || { mes: {}, semana: {} };
      const upd = (k) => (a.actualizado && a.actualizado[k] ? `<span class="tiny muted">Actualizado el ${fecha(a.actualizado[k])}</span>` : '');
      const pin = (per, k, dis) => `<input class="input pa-num" type="number" min="0" max="100000" step="1" id="pr_${per}_${k}" value="${esc(per === 'mes' && k === 'E' ? 0 : (pr[per] && pr[per][k] != null ? pr[per][k] : ''))}"${dis ? ' disabled' : ''} data-input="prodPrecioHint" aria-label="${PLAN_NOMBRE[k]} por ${per}">`;
      const hint = (k) => { const m = Number((pr.mes || {})[k]) || 0; const s = Number((pr.semana || {})[k]) || 0; if (!m || !s) return ''; const base = m / 4; const rec = Math.round((s / base - 1) * 100); return `cuarta parte ${money(Math.round(base * 100) / 100)} · recargo ${rec}% · 4 semanas = ${money(s * 4)}`; };
      const ds = a.destacado || {};
      const dpin = (k, per) => `<input class="input pa-num" type="number" min="0.5" max="10000" step="0.5" id="ds_${k}_${per}" value="${esc(ds[k] && ds[k][per] != null ? ds[k][per] : '')}" aria-label="Destacado ${PLAN_NOMBRE[k]} por ${per === 'dia' ? '1 día' : '7 días'}">`;
      const ct = a.contacto || {}; const co = a.cotizacion || {}; const cm = a.comision || {}; const ms = a.mensajes || { whatsapp: {} };
      const cotHoy = co.arsPorUsd && hoyAR(co.fecha);
      const ph = (arr) => arr.map((x) => `<code>{${x}}</code>`).join(' ');
      body = `<section class="card stack" style="gap:12px">
          <div class="row between"><div class="card-title">${icon('dollar')} Precios de los planes (créditos = USD)</div>${upd('precios')}</div>
          <p class="small muted">Precio por mes de Plata, Oro y Star, y por semana de Oro y Star. Bronce es gratis. Conviene que la semana sea <strong>la cuarta parte del mes + 20 %</strong>, así el mes sale más barato.</p>
          <div class="table-wrap"><table class="table pa-prices"><thead><tr><th>Plan</th><th>Por mes</th><th>Por semana</th><th></th></tr></thead><tbody>
            ${PLANES.map((k) => `<tr><td>${planBadge(k)}</td><td>${pin('mes', k, k === 'E')}</td><td>${PLANES_SEMANA.includes(k) ? pin('semana', k) : '<span class="tiny muted">—</span>'}</td><td class="tiny muted" id="prh_${k}">${PLANES_SEMANA.includes(k) ? hint(k) : ''}</td></tr>`).join('')}
          </tbody></table></div>
          <div class="row"><button type="button" class="btn sm" data-action="prodAjSave" data-k="precios">${icon('check')} Guardar precios</button></div>
        </section>
        <section class="card stack" style="gap:12px">
          <div class="row between"><div class="card-title">${icon('pack')} Packs de créditos</div>${upd('packs')}</div>
          <p class="small muted">Lo que ven las acompañantes al cargar créditos. Si reciben más de lo que pagan, la diferencia es el regalo. «Alcanza para» vacío = se calcula solo con los precios.</p>
          <div class="stack" id="prodPacks" style="gap:10px">${packsHtml()}</div>
        </section>
        <section class="card stack" style="gap:12px">
          <div class="row between"><div class="card-title">${icon('trending')} Precios del Destacado (créditos)</div>${upd('destacado')}</div>
          <p class="small muted">Solo Bronce, Plata y Oro (Star ya tiene lugar fijo). El cupo es el 20 % de las publicadas del plan en la provincia, mínimo 1.</p>
          <div class="table-wrap"><table class="table pa-prices"><thead><tr><th>Plan</th><th>1 día</th><th>7 días</th></tr></thead><tbody>
            ${PLANES_DEST.map((k) => `<tr><td>${planBadge(k)}</td><td>${dpin(k, 'dia')}</td><td>${dpin(k, 'semana')}</td></tr>`).join('')}
          </tbody></table></div>
          <div class="row"><button type="button" class="btn sm" data-action="prodAjSave" data-k="destacado">${icon('check')} Guardar precios del Destacado</button></div>
        </section>
        <section class="card stack" style="gap:12px">
          <div class="row between"><div class="card-title">${icon('dollar')} Cotización del dólar</div>${co.fecha ? `<span class="tiny ${cotHoy ? 'muted' : ''}"${cotHoy ? '' : ' style="color:var(--warn)"'}>Cargada el ${fecha(co.fecha)}</span>` : ''}</div>
          <p class="small muted">Pesos por cada dólar. Se usa para sugerir el monto en pesos de cada pedido (redondeado hacia arriba a la centena). Actualizala cada día que cobres.</p>
          ${!co.arsPorUsd ? `<div class="notice warn">${icon('alert')}<span>Sin cotización: los pedidos no muestran el monto en pesos ni el mensaje para copiar.</span></div>` : !cotHoy ? `<div class="notice warn">${icon('alert')}<span>La cotización no es de hoy.</span></div>` : ''}
          <div class="grid-2"><div class="field"><label for="ajCotArs">ARS por USD</label><input class="input" id="ajCotArs" type="number" min="1" step="1" inputmode="decimal" value="${esc(co.arsPorUsd != null ? co.arsPorUsd : '')}" placeholder="Ej.: 1300"></div>
          <div class="field"><label for="ajCotNota">Nota (opcional)</label><input class="input" id="ajCotNota" maxlength="200" value="${esc(co.nota || '')}" placeholder="Ej.: dólar blue venta"></div></div>
          <div class="row"><button type="button" class="btn sm" data-action="prodAjSave" data-k="cotizacion">${icon('check')} Guardar cotización</button></div>
        </section>
        <section class="card stack" style="gap:12px">
          <div class="row between"><div class="card-title">${icon('whatsapp')} Contacto para comprar créditos</div>${upd('contacto')}</div>
          <p class="small muted">Las acompañantes te escriben a este WhatsApp con el código del pedido. Telegram es opcional.</p>
          ${!ct.whatsapp ? `<div class="notice warn">${icon('alert')}<span>Sin número de WhatsApp: el botón de pedir créditos no abre ningún chat.</span></div>` : ''}
          <div class="grid-2"><div class="field"><label for="ajWa">WhatsApp del sitio (con código de país)</label><input class="input" id="ajWa" inputmode="tel" maxlength="20" value="${esc(ct.whatsapp || '')}" placeholder="5491122334455"></div>
          <div class="field"><label for="ajTg">Usuario de Telegram</label><input class="input" id="ajTg" maxlength="40" value="${esc(ct.telegram || '')}" placeholder="sexyrose_soporte"></div></div>
          <label class="row nowrap small" style="gap:8px"><input type="checkbox" id="ajTgOn"${ct.telegramActivo ? ' checked' : ''}> Mostrar también Telegram</label>
          <div class="row"><button type="button" class="btn sm" data-action="prodAjSave" data-k="contacto">${icon('check')} Guardar contacto</button></div>
        </section>
        <section class="card stack" style="gap:12px">
          <div class="row between"><div class="card-title">${icon('message')} Mensajes</div>${upd('mensajes')}</div>
          <p class="small muted">Mensaje que la acompañante te manda por WhatsApp al pedir créditos, en su idioma. Variables: ${ph(['pack', 'creditos', 'monto', 'codigo'])}. <strong>{codigo}</strong> es obligatorio.</p>
          ${['es', 'en', 'pt'].map((l) => `<div class="field"><label for="ajMsg_${l}">WhatsApp · ${{ es: 'Español', en: 'Inglés', pt: 'Portugués' }[l]}</label><textarea class="textarea" id="ajMsg_${l}" rows="2" maxlength="500" data-noi18n>${esc((ms.whatsapp || {})[l] || '')}</textarea></div>`).join('')}
          <div class="field"><label for="ajMsgAdmin">Tu respuesta («Copiar mensaje» en Pedidos)</label><textarea class="textarea" id="ajMsgAdmin" rows="3" maxlength="1000">${esc(ms.admin || '')}</textarea><div class="tiny muted">Variables: ${ph(['codigo', 'pack', 'creditos', 'monto', 'ars', 'cotizacion', 'fecha'])}. No pongas tus datos bancarios acá: agregalos a mano en WhatsApp.</div></div>
          <div class="row"><button type="button" class="btn sm" data-action="prodAjSave" data-k="mensajes">${icon('check')} Guardar mensajes</button></div>
        </section>
        <section class="card stack" style="gap:12px">
          <div class="row between"><div class="card-title">${icon('bag')} Comisión de venta de contenido</div>${upd('comision')}</div>
          <p class="small muted">Preparado para cuando se active la venta de contenido: SexyRose descuenta este porcentaje en créditos de cada venta. El saldo puede quedar en negativo hasta el máximo indicado.</p>
          <div class="grid-2"><div class="field"><label for="ajComP">Comisión (%)</label><input class="input" id="ajComP" type="number" min="0" max="90" step="0.5" value="${esc(cm.porcentaje != null ? cm.porcentaje : '')}"></div>
          <div class="field"><label for="ajComN">Saldo negativo máximo (créditos)</label><input class="input" id="ajComN" type="number" min="0" max="10000" step="1" value="${esc(cm.saldoNegativoMax != null ? cm.saldoNegativoMax : '')}"></div></div>
          <div class="row"><button type="button" class="btn sm" data-action="prodAjSave" data-k="comision">${icon('check')} Guardar comisión</button></div>
        </section>
        ${textosInicioCard()}
        <section class="card stack" style="gap:10px">
          <div class="card-title">${icon('sparkles')} Promoción</div>
          <p class="small muted">Texto corto de la promoción vigente (se muestra en la portada y en la página de planes). Dejalo vacío para no mostrar ninguna.</p>
          <textarea class="textarea" id="ajPromo" rows="2" maxlength="500" placeholder="Ej.: Bronce gratis y precios de lanzamiento por 3 meses.">${esc(a.promo || '')}</textarea>
          <div class="row"><button type="button" class="btn sm" data-action="prodAjSave" data-k="promo">${icon('check')} Guardar promoción</button></div>
        </section>`;
    }
    return layout('ajustes', `${head('Ajustes', actualizar('aj'), 'Precios, packs de créditos, Destacado, cotización, contacto, mensajes, textos del inicio y promoción')}<div class="stack" style="gap:14px">${body}</div>`);
  }

  /* ---------- Acciones de Fase 1+2 ---------- */
  const fail = (e) => HH.toast(e.message, { type: 'danger' });
  Object.assign(HH.actions, {
    prodAcFilter(el) { S.af = el.dataset.f; HH.refresh(); },
    prodAcSearch(el) { S.aq = el.value; const box = document.getElementById('prodAcRows'); if (box) box.innerHTML = acRows(); },
    prodSusFilter(el) { S.suf = el.dataset.f; HH.refresh(); },
    prodUbFilter(el) { S.uf = el.dataset.f; HH.refresh(); },
    prodUbSearch(el) { S.uq = el.value; clearTimeout(S._ubT); S._ubT = setTimeout(() => { HH.refresh(); const i = document.getElementById('prodUbQ'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); },
    prodPcFilter(el) { S.pcf = el.dataset.f; S.pcq = ''; HH.refresh(); },
    prodPcSearch(el) {
      S.pcq = el.value; const box = document.getElementById('prodPcRows'); if (box) box.innerHTML = pcRows();
      document.querySelectorAll('[data-action="prodPcFilter"]').forEach((c) => { const on = !S.pcq.trim() && c.dataset.f === S.pcf; c.classList.toggle('active', on); c.setAttribute('aria-pressed', String(on)); });
      // Además se busca en el servidor (por si el pedido es viejo y no está entre los últimos 500)
      clearTimeout(S._pcT); const q = S.pcq.trim();
      if (q.length >= 2) S._pcT = setTimeout(() => {
        HH.api('GET', '/pedidos-creditos?q=' + encodeURIComponent(q)).then((d) => {
          if (!S.pc || S.pcq.trim() !== q) return;
          const ids = new Set((S.pc.items || []).map((x) => x.id)); const nuevos = (d.items || []).filter((x) => !ids.has(x.id));
          if (nuevos.length) { S.pc.items = (S.pc.items || []).concat(nuevos); const b = document.getElementById('prodPcRows'); if (b) b.innerHTML = pcRows(); }
        }).catch(() => { /* la búsqueda local ya se mostró */ });
      }, 350);
    },
    prodPcVer(el, ev) { if (ev) ev.preventDefault(); S.pcq = el.dataset.q || ''; HH.go('#admin.pedidos'); },
    prodCopy(el) {
      const v = el.dataset.v || ''; const l = el.dataset.l || 'Texto';
      const ok = () => HH.toast(l + ' copiado: ' + v, { type: 'ok' });
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(ok, () => HH.toast(v)); else HH.toast(v);
    },
    prodPcComprobante(el) {
      HH.modal({ title: 'Comprobante · ' + (el.dataset.ref || ''), wide: true, body: `<div class="pa-priv" data-blob="/pedidos-creditos/${esc(el.dataset.id)}/comprobante" data-alt="Comprobante">${loadingCard(1)}</div><p class="tiny muted">Privado: no se publica ni se guarda en este equipo.</p>`, actions: [{ label: 'Cerrar', cls: 'ghost', action: 'closeModal' }] });
      fillBlobs(document.getElementById('modalBox'));
    },
    prodPcMensaje(el) {
      const x = pcFind(el.dataset.id); if (!x || !x.mensajeSugerido) return;
      const v = x.mensajeSugerido;
      const vieja = !hoyAR(pcCot().fecha);
      const ok = () => HH.toast(vieja ? 'Mensaje copiado. Ojo: la cotización no es de hoy.' : 'Mensaje copiado. Agregá tus datos de pago antes de enviarlo.', { type: vieja ? 'warn' : 'ok', ms: 4000 });
      const show = () => HH.modal({ title: 'Mensaje para ' + ((x.cuenta || {}).displayName || x.codigo), body: `<textarea class="textarea" rows="5" readonly data-noi18n>${esc(v)}</textarea><p class="tiny muted">Copialo y agregá tus datos de pago a mano en WhatsApp.</p>`, actions: [{ label: 'Cerrar', cls: 'ghost', action: 'closeModal' }] });
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(ok, show); else show();
    },
    prodPcConfirmar(el) {
      const x = pcFind(el.dataset.id); if (!x) return;
      const n = esc((x.cuenta || {}).displayName || (x.cuenta || {}).email || '');
      HH.modal({ title: 'Confirmar pago · ' + x.codigo, body: `<div class="stack" style="gap:10px">
          <p>¿Ya está en tu cuenta el pago de <strong data-noi18n>${n}</strong> por <strong>${money(x.pagaUsd)}</strong>${x.arsSugerido != null ? ` (sugerido <strong>${ars(x.arsSugerido)}</strong>)` : ''}?</p>
          <div class="notice ok">${icon('wallet')}<span>Se acreditan <strong>${cred(x.total)}</strong>${cnum(x.bonus) > 0 ? ` (${cred(x.base, false)} + ${cred(x.bonus, false)} de regalo del pack ${esc(x.packNombre)})` : ` (${esc(x.packNombre)})`}.</span></div>
          ${x.estado === 'vencido' ? `<p class="small">${icon('alert')} El pedido está vencido: igual se puede confirmar si el pago llegó.</p>` : ''}
          <p class="tiny muted">Le avisamos por email. Si estaba pausada por falta de saldo, se reintenta la renovación del plan.</p>
        </div>`, actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: 'Confirmar y acreditar', onClick: (btn) => {
          if (btn) btn.disabled = true;
          HH.api('POST', '/pedidos-creditos/' + encodeURIComponent(x.id) + '/confirmar')
            .then((r) => { HH.closeModal(); HH.toast(`Acreditados ${cred({ centavos: r.total })}. Saldo: ${cred(r.saldo)}`, { type: 'ok', ms: 4000 }); after(['pc', 'cr:' + x.cuentaId, 'acd:' + x.cuentaId, 'ven', 'pau']); })
            .catch((e) => { if (btn) btn.disabled = false; fail(e); if (e.status === 409) after(['pc']); });
        } }] });
    },
    prodPcRechazar(el) {
      const x = pcFind(el.dataset.id); if (!x) return;
      pedirMotivo({ title: 'Rechazar pedido ' + x.codigo, intro: 'El pedido se cierra sin acreditar créditos. El motivo le llega por email (es opcional).', motivos: ['No recibimos el pago.', 'El monto pagado no coincide.', 'No pudimos identificar el pago.', 'Ella pidió cancelarlo.'], okLabel: 'Rechazar pedido', cls: 'danger', requerido: false, onOk: (m, re) => {
        HH.api('POST', '/pedidos-creditos/' + encodeURIComponent(x.id) + '/rechazar', { motivo: m })
          .then(() => { HH.closeModal(); HH.toast('Pedido ' + x.codigo + ' rechazado', { type: 'ok' }); after(['pc', 'cr:' + x.cuentaId]); })
          .catch((e) => { re(); fail(e); });
      } });
    },
    prodPcReabrir(el) {
      const x = pcFind(el.dataset.id); if (!x) return;
      HH.confirm({ title: 'Reabrir pedido ' + x.codigo, text: 'Vuelve a quedar pendiente por 48 horas más. Si el código ya lo usa otro pedido, recibe uno nuevo.', okLabel: 'Reabrir', onOk: () => {
        HH.api('POST', '/pedidos-creditos/' + encodeURIComponent(x.id) + '/reabrir')
          .then((r) => { const c = r && r.pedido && r.pedido.codigo; HH.toast(c && c !== x.codigo ? `Reabierto con código nuevo ${c}` : 'Pedido reabierto por 48 h', { type: 'ok' }); after(['pc', 'cr:' + x.cuentaId]); })
          .catch(fail);
      } });
    },
    prodMovMas(el) {
      const id = el.dataset.id; const k = 'cr:' + id; const d = S[k]; if (!d || !d.siguiente) return;
      el.disabled = true;
      HH.api('GET', '/creditos/' + encodeURIComponent(id) + '?limite=20&antesDe=' + encodeURIComponent(d.siguiente))
        .then((r) => { d.movimientos = (d.movimientos || []).concat(r.movimientos || []); d.siguiente = r.siguiente; HH.refresh(); })
        .catch((e) => { el.disabled = false; fail(e); });
    },
    prodAjuste(el) {
      const id = el.dataset.id; const d = S['cr:' + id];
      HH.modal({ title: 'Ajuste manual de créditos', body: `<div class="stack" style="gap:12px">
          <p class="small">Sumá (número positivo) o restá (negativo) créditos a <strong data-noi18n>${esc(el.dataset.n || 'esta cuenta')}</strong>. Saldo actual: <strong>${d ? cred(d.saldo) : '…'}</strong>. Un ajuste negativo no puede dejar el saldo por debajo de 0.</p>
          <div class="field"><label for="ajCr">Créditos (ej. 10 o -5,50)</label><input class="input" id="ajCr" inputmode="decimal" maxlength="12" placeholder="10" autocomplete="off"></div>
          <div class="field"><label for="ajMot">Motivo (obligatorio, queda en el historial)</label><input class="input" id="ajMot" maxlength="300" placeholder="Ej.: compensación por error en el sitio"></div>
        </div>`, actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: 'Aplicar ajuste', onClick: (btn) => {
          const raw = String(document.getElementById('ajCr').value || '').trim().replace(/\s/g, '');
          const motivo = String(document.getElementById('ajMot').value || '').trim();
          const n = Number(raw.replace(',', '.'));
          if (!raw || !Number.isFinite(n) || n === 0 || !/^-?\d+([.,]\d{1,2})?$/.test(raw)) { HH.toast('Escribí cuántos créditos sumar o restar (distinto de 0, hasta 2 decimales).', { type: 'warn' }); return; }
          if (motivo.length < 3) { HH.toast('Escribí el motivo del ajuste.', { type: 'warn' }); return; }
          if (btn) btn.disabled = true;
          HH.api('POST', '/creditos/' + encodeURIComponent(id) + '/ajuste', { creditos: raw, motivo })
            .then((r) => { HH.closeModal(); HH.toast(`Ajuste aplicado (${credSig({ centavos: Math.round(n * 100) })}). Saldo: ${cred(r.saldo)}`, { type: 'ok' }); after(['cr:' + id, 'acd:' + id, 'ven', 'pau']); })
            .catch((e) => { if (btn) btn.disabled = false; fail(e); });
        } }] });
      setTimeout(() => { const i = document.getElementById('ajCr'); if (i) i.focus(); }, 50);
    },
    prodDstFilter(el) { S.dsf = el.dataset.f; HH.refresh(); },
    prodDstCancelar(el) {
      const x = ((S.dstT && S.dstT.items) || []).find((d) => d.id === el.dataset.id); if (!x) return;
      const fut = new Date(x.desde) > new Date();
      HH.modal({ title: 'Cancelar Destacado', body: `<div class="stack" style="gap:10px">
          <p>Se cancela el Destacado de <strong data-noi18n>${esc(nombreCu(x) || '')}</strong> (${esc(x.planNombre || PLAN_NOMBRE[x.plan])}, ${esc(ubNombre(x.provincia) || x.provincia || '')}, ${fecha(x.desde)} → ${fecha(x.hasta)}) y deja de mostrarse.</p>
          <label class="row nowrap small" style="gap:8px;align-items:flex-start"><input type="checkbox" id="dstDev" checked> <span>Devolverle los créditos ${fut ? `(todavía no empezó: ${cred(x.costo)})` : 'proporcionales al tiempo que falta'}</span></label>
          <p class="tiny muted">Le avisamos en su panel.</p>
        </div>`, actions: [{ label: 'Volver', cls: 'ghost', action: 'closeModal' }, { label: 'Cancelar Destacado', cls: 'danger', onClick: (btn) => {
          const devolver = document.getElementById('dstDev').checked;
          if (btn) btn.disabled = true;
          HH.api('POST', '/destacados/' + encodeURIComponent(x.id) + '/cancelar', { devolver })
            .then((r) => { HH.closeModal(); HH.toast(`Destacado cancelado${r && r.devuelto && r.devuelto.centavos ? ` · devueltos ${cred(r.devuelto)}` : ''}`, { type: 'ok' }); after(['dstT', 'dst', 'cr:' + x.cuentaId]); })
            .catch((e) => { if (btn) btn.disabled = false; fail(e); });
        } }] });
    },
    prodPkField(el) {
      const i = Number(el.dataset.i); const f = el.dataset.f; const list = pkEdit(); const p = list[i]; if (!p) return;
      S.pkDirty = true;
      if (f === 'masElegido') { list.forEach((q, j) => { q.masElegido = j === i ? el.checked : false; }); document.getElementById('prodPacks').innerHTML = packsHtml(); return; }
      if (f === 'activo') { p.activo = el.checked; document.getElementById('prodPacks').innerHTML = packsHtml(); return; }
      p[f] = f === 'pagaUsd' || f === 'recibe' ? el.value : el.value;
      if (f === 'pagaUsd' || f === 'recibe') {
        const b = document.getElementById('pk_b_' + i); if (b) b.innerHTML = pkBonus(p) > 0 ? `<span class="badge ok">+${pkBonus(p)} de regalo</span>` : '<span class="tiny muted">sin regalo</span>';
        const a = document.getElementById('pk_a_' + i); if (a) a.placeholder = 'Automático: ' + alcanzaSug(p.recibe);
      }
    },
    prodPkMove(el) {
      const i = Number(el.dataset.i); const j = i + Number(el.dataset.d); const list = pkEdit(); if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]]; S.pkDirty = true; document.getElementById('prodPacks').innerHTML = packsHtml();
    },
    prodPkDel(el) { const list = pkEdit(); list.splice(Number(el.dataset.i), 1); S.pkDirty = true; document.getElementById('prodPacks').innerHTML = packsHtml(); },
    prodPkAdd() { const list = pkEdit(); if (list.length >= 12) return; list.push({ id: '', nombre: '', pagaUsd: 10, recibe: 10, alcanzaPara: '', masElegido: false, activo: true }); S.pkDirty = true; document.getElementById('prodPacks').innerHTML = packsHtml(); const n = document.getElementById('pk_n_' + (list.length - 1)); if (n) n.focus(); },
    prodPkReset() { S.pkEdit = null; S.pkDirty = false; document.getElementById('prodPacks').innerHTML = packsHtml(); },
    prodFoto(el) { HH.modal({ title: 'Foto', wide: true, body: `<img src="${esc(el.dataset.url)}" alt="" class="pa-full">`, actions: [{ label: 'Cerrar', cls: 'ghost', action: 'closeModal' }] }); },
    prodBlobZoom(el) { HH.modal({ title: 'Archivo privado', wide: true, body: `<img src="${el.dataset.url}" alt="" class="pa-full"><p class="tiny muted">Privado: no se publica ni se guarda en este equipo.</p>`, actions: [{ label: 'Cerrar', cls: 'ghost', action: 'closeModal' }] }); },
    prodVerif(el) {
      const id = el.dataset.id; const k = 'acd:' + id;
      const run = (decision, motivo, reenable) => HH.api('POST', '/acompanantes/' + encodeURIComponent(id) + '/verificacion', { decision, motivo })
        .then((r) => { HH.closeModal(); const est = r && r.perfil && r.perfil.estado; HH.toast(decision === 'aprobar' ? (est === 'publicado' ? 'Identidad aprobada: el perfil quedó publicado' : 'Identidad aprobada') : 'Verificación rechazada: le avisamos por email', { type: 'ok' }); after([k, 'ac']); })
        .catch((e) => { if (reenable) reenable(); fail(e); });
      if (el.dataset.d === 'aprobar') HH.confirm({ title: 'Aprobar identidad', text: 'Confirmás que la selfie coincide con el documento y que es mayor de 18 años. Si el perfil está en revisión, se publica.', okLabel: 'Aprobar', onOk: () => run('aprobar', '') });
      else pedirMotivo({ title: 'Rechazar verificación', intro: 'Le mandamos el motivo por email y puede volver a enviar la selfie y el documento.', motivos: MOTIVOS_VERIF, okLabel: 'Rechazar', cls: 'danger', onOk: (m, re) => run('rechazar', m, re) });
    },
    prodPerfilEstado(el) {
      const id = el.dataset.id; const to = el.dataset.e; const k = 'acd:' + id;
      const run = (motivo, reenable) => HH.api('POST', '/acompanantes/' + encodeURIComponent(id) + '/estado', { estado: to, motivo })
        .then(() => { HH.closeModal(); HH.toast({ publicado: 'Perfil publicado', pausado: 'Perfil pausado', suspendido: 'Perfil suspendido', rechazado: 'Perfil rechazado' }[to] + ': le avisamos por email', { type: 'ok' }); after([k, 'ac']); })
        .catch((e) => { if (reenable) reenable(); fail(e); });
      if (to === 'publicado') HH.confirm({ title: 'Publicar perfil', text: 'El perfil pasa a verse en el sitio.', okLabel: 'Publicar', onOk: () => run('') });
      else if (to === 'pausado') pedirMotivo({ title: 'Pausar perfil', intro: 'El perfil deja de verse en el sitio hasta que lo vuelvas a publicar. El motivo es opcional.', motivos: [], okLabel: 'Pausar', requerido: false, onOk: run });
      else if (to === 'suspendido') pedirMotivo({ title: 'Suspender perfil', intro: 'El perfil deja de verse. Usalo ante incumplimientos de las normas.', motivos: MOTIVOS_PERFIL, okLabel: 'Suspender', cls: 'danger', onOk: run });
      else pedirMotivo({ title: 'Rechazar perfil', intro: 'Le mandamos el motivo para que lo corrija y lo vuelva a enviar.', motivos: MOTIVOS_PERFIL, okLabel: 'Rechazar', cls: 'danger', onOk: run });
    },
    prodPlanManual(el) {
      const id = el.dataset.id; const k = 'acd:' + id;
      HH.modal({ title: 'Asignar plan manual', body: `<div class="stack" style="gap:12px">
          <p class="small">Activa un plan sin pago (por ejemplo, un regalo o una compensación). Si ya tiene ese plan, los días se suman al final.</p>
          <div class="grid-2"><div class="field"><label for="pmPlan">Plan</label><select class="select" id="pmPlan">${PLANES_PAGOS.map((p) => `<option value="${p}">${PLAN_NOMBRE[p]}</option>`).join('')}</select></div>
          <div class="field"><label for="pmDias">Días</label><input class="input" id="pmDias" type="number" min="1" max="366" value="30"></div></div>
          <div class="chips">${[7, 15, 30, 90].map((n) => `<button type="button" class="chip" data-action="prodPmDias" data-v="${n}">${n} días</button>`).join('')}</div>
          <div class="field"><label for="pmNota">Nota interna (opcional)</label><input class="input" id="pmNota" maxlength="300" placeholder="Ej.: compensación por error en el sitio"></div>
        </div>`, actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: 'Asignar plan', onClick: (btn) => {
          const plan = document.getElementById('pmPlan').value; const dias = Number(document.getElementById('pmDias').value);
          if (!Number.isInteger(dias) || dias < 1 || dias > 366) { HH.toast('Los días tienen que ser un número entre 1 y 366.', { type: 'warn' }); return; }
          if (btn) btn.disabled = true;
          HH.api('POST', '/acompanantes/' + encodeURIComponent(id) + '/plan', { plan, dias, nota: document.getElementById('pmNota').value })
            .then((r) => { HH.closeModal(); HH.toast(`Plan ${PLAN_NOMBRE[plan]} asignado${r && r.suscripcion && r.suscripcion.hasta ? ' hasta el ' + dia(r.suscripcion.hasta) : ''}`, { type: 'ok' }); after([k, 'ac', 'sus', 'stars']); })
            .catch((e) => { if (btn) btn.disabled = false; fail(e); });
        } }] });
    },
    prodPmDias(el) { const i = document.getElementById('pmDias'); if (i) i.value = el.dataset.v; },
    prodSusCancelar(el) {
      const id = el.dataset.id;
      HH.confirm({ title: 'Cancelar suscripción', text: 'El plan deja de valer desde ahora y no se devuelven créditos automáticamente (si corresponde, hacé un ajuste manual en su ficha). Si tiene otro plan activo, queda en ese; si no, vuelve a Bronce.', okLabel: 'Cancelar suscripción', cls: 'danger', onOk: () => {
        HH.api('POST', '/suscripciones/' + encodeURIComponent(id) + '/cancelar')
          .then(() => { HH.toast('Suscripción cancelada', { type: 'ok' }); after(['sus', 'stars', 'ac']); })
          .catch(fail);
      } });
    },
    prodUbActiva(el) { toggleActiva('ubicaciones', el); },
    prodCatActiva(el) { toggleActiva('categorias', el); },
    prodUbTipo(el) {
      const sel = document.getElementById('cfPadre'); if (!sel) return; const tipo = el.value; const cur = sel.value;
      const ub = cat.ub().filter((u) => TIPOS_UBIC.indexOf(u.tipo) < TIPOS_UBIC.indexOf(tipo));
      sel.innerHTML = `${tipo === 'pais' ? '<option value="">(ninguno)</option>' : ''}${ub.map((u) => `<option value="${esc(u.id)}"${u.id === cur ? ' selected' : ''}>${esc(u.nombre)} (${TIPO_UBIC[u.tipo]})</option>`).join('')}`;
    },
    prodCatIcono(el) { const h = document.getElementById('cfIcono'); if (h) h.value = el.dataset.v; el.parentElement.querySelectorAll('.chip').forEach((c) => { const on = c === el; c.classList.toggle('active', on); c.setAttribute('aria-pressed', String(on)); }); },
    prodCatEdit(el) {
      const t = el.dataset.t; const id = el.dataset.id; const key = CAT_KEY[t];
      const it = id ? (((S[key] && S[key].items) || []).find((x) => x.id === id)) : null;
      if (t === 'ubicaciones' && !S.ub) load('ub', '/ubicaciones');
      HH.modal({ title: CAT_TIT[t][it ? 1 : 0], body: catForm(t, it), actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: it ? 'Guardar' : 'Crear', onClick: (btn) => {
        const v = (i) => { const e = document.getElementById(i); return e ? e.value : undefined; };
        const nombre = String(v('cfNombre') || '').trim();
        if (nombre.length < 2) { HH.toast('Escribí el nombre (mínimo 2 letras).', { type: 'warn' }); return; }
        const orden = Number(v('cfOrden')) || 0;
        let data;
        if (t === 'ubicaciones') data = { nombre, tipo: v('cfTipo'), padre: v('cfPadre') || null, orden, activa: document.getElementById('cfActiva').checked };
        else if (t === 'categorias') data = { nombre, icono: v('cfIcono') || 'sparkles', orden, activa: document.getElementById('cfActiva').checked };
        else data = { nombre, nombre_en: String(v('cfEn') || '').trim(), nombre_pt: String(v('cfPt') || '').trim(), orden };
        if (btn) btn.disabled = true;
        HH.api(it ? 'PUT' : 'POST', '/' + t + (it ? '/' + encodeURIComponent(it.id) : ''), data)
          .then(() => { HH.closeModal(); HH.toast(it ? 'Cambios guardados' : 'Creado', { type: 'ok' }); after([key]); })
          .catch((e) => { if (btn) btn.disabled = false; fail(e); });
      } }] });
    },
    prodCatDel(el) {
      const t = el.dataset.t; const id = el.dataset.id; const key = CAT_KEY[t];
      const it = (((S[key] && S[key].items) || []).find((x) => x.id === id)) || { nombre: id };
      HH.confirm({ title: 'Borrar', text: `¿Borrar «${esc(it.nombre)}»? Si está en uso, el sistema no lo deja borrar (podés desactivarlo).`, okLabel: 'Borrar', cls: 'danger', onOk: () => {
        HH.api('DELETE', '/' + t + '/' + encodeURIComponent(id))
          .then(() => { HH.toast('Borrado', { type: 'ok' }); after([key]); })
          .catch((e) => HH.modal({ title: 'No se puede borrar', body: `<div class="notice warn">${icon('alert')}<span>${esc(e.message)}</span></div>`, actions: [{ label: 'Entendido', action: 'closeModal' }] }));
      } });
    },
    prodPrecioHint(el) {
      const m = /^pr_(mes|semana)_([A-Z])$/.exec(el.id || ''); if (!m) return; const k = m[2]; if (!PLANES_SEMANA.includes(k)) return;
      const mes = Number((document.getElementById('pr_mes_' + k) || {}).value) || 0; const sem = Number((document.getElementById('pr_semana_' + k) || {}).value) || 0;
      const h = document.getElementById('prh_' + k); if (!h) return;
      if (!mes || !sem) { h.textContent = ''; return; }
      const base = mes / 4; const rec = Math.round((sem / base - 1) * 100);
      h.textContent = `cuarta parte ${money(Math.round(base * 100) / 100)} · recargo ${rec}% · 4 semanas = ${money(sem * 4)}${sem * 4 <= mes ? ' · ojo: 4 semanas salen igual o más barato que el mes' : ''}`;
    },
    prodAjSave(el) {
      const k = el.dataset.k; let valor;
      const val = (id) => { const e = document.getElementById(id); return e ? e.value : ''; };
      const num = (id) => { const v = String(val(id)).trim().replace(',', '.'); const n = v === '' ? NaN : Number(v); return Number.isFinite(n) ? n : NaN; };
      const warn = (m) => HH.toast(m, { type: 'warn' });
      if (k === 'precios') {
        valor = { mes: { E: 0 }, semana: {} };
        for (const p of PLANES_PAGOS) valor.mes[p] = num('pr_mes_' + p);
        for (const p of PLANES_SEMANA) valor.semana[p] = num('pr_semana_' + p);
        const bad = [].concat(Object.entries(valor.mes), Object.entries(valor.semana)).find(([, n]) => !Number.isFinite(n) || n < 0);
        if (bad) { warn(`Revisá el precio de ${PLAN_NOMBRE[bad[0]]}: tiene que ser un número de 0 o más.`); return; }
      } else if (k === 'packs') {
        const list = pkEdit();
        for (const [i, p] of list.entries()) {
          if (String(p.nombre || '').trim().length < 2) { warn(`Pack ${i + 1}: escribí el nombre.`); return; }
          if (!(Number(p.pagaUsd) >= 10)) { warn(`Pack ${p.nombre}: el precio tiene que ser de al menos USD 10.`); return; }
          if (!(Number(p.recibe) >= Number(p.pagaUsd))) { warn(`Pack ${p.nombre}: los créditos tienen que ser iguales o mayores a lo que se paga.`); return; }
        }
        valor = list.map((p, i) => ({ ...(p.id ? { id: p.id } : {}), nombre: String(p.nombre).trim(), pagaUsd: Number(p.pagaUsd), recibe: Number(p.recibe), alcanzaPara: String(p.alcanzaPara || '').trim(), masElegido: !!p.masElegido, activo: !!p.activo, orden: i + 1 }));
      } else if (k === 'destacado') {
        valor = {};
        for (const p of PLANES_DEST) {
          valor[p] = { dia: num(`ds_${p}_dia`), semana: num(`ds_${p}_semana`) };
          if (!(valor[p].dia > 0) || !(valor[p].semana > 0)) { warn(`Revisá el Destacado de ${PLAN_NOMBRE[p]}: los precios tienen que ser mayores a 0.`); return; }
        }
      } else if (k === 'contacto') {
        valor = { whatsapp: String(val('ajWa')).replace(/\D/g, ''), telegram: String(val('ajTg')).trim(), telegramActivo: document.getElementById('ajTgOn').checked };
      } else if (k === 'cotizacion') {
        const raw = String(val('ajCotArs')).trim();
        const n = num('ajCotArs');
        if (raw && !(n > 0)) { warn('La cotización tiene que ser un número mayor a 0.'); return; }
        valor = { arsPorUsd: raw ? n : null, nota: val('ajCotNota') };
      } else if (k === 'comision') {
        valor = { porcentaje: num('ajComP'), saldoNegativoMax: num('ajComN') };
        if (!Number.isFinite(valor.porcentaje) || !Number.isFinite(valor.saldoNegativoMax)) { warn('Completá la comisión y el saldo negativo máximo.'); return; }
      } else if (k === 'mensajes') {
        valor = { whatsapp: { es: val('ajMsg_es'), en: val('ajMsg_en'), pt: val('ajMsg_pt') }, admin: val('ajMsgAdmin') };
        const sin = ['es', 'en', 'pt'].find((l) => valor.whatsapp[l].trim() && !valor.whatsapp[l].includes('{codigo}'));
        if (sin) { warn(`El mensaje de WhatsApp (${sin.toUpperCase()}) tiene que incluir {codigo}.`); return; }
        if (valor.admin.trim() && !valor.admin.includes('{codigo}')) { warn('Tu respuesta tiene que incluir {codigo}.'); return; }
      } else if (k === 'promo') valor = val('ajPromo');
      else if (k === 'portada') valor = { titulo: val('ajTit'), subtitulo: val('ajSub') };
      else return;
      el.disabled = true;
      HH.api('PUT', '/ajustes/' + k, { valor })
        .then((r) => {
          if (S.aj && r) S.aj[k] = r.valor;
          if (k === 'packs') { S.pkEdit = null; S.pkDirty = false; }
          HH.toast({ precios: 'Precios guardados', packs: 'Packs guardados', destacado: 'Precios del Destacado guardados', contacto: 'Contacto guardado', cotizacion: 'Cotización guardada', comision: 'Comisión guardada', mensajes: 'Mensajes guardados', portada: 'Portada guardada', promo: 'Promoción guardada' }[k], { type: 'ok' });
          load('aj', '/ajustes', true); if (k === 'cotizacion' || k === 'mensajes') after(['pc']);
        })
        .catch((e) => { el.disabled = false; fail(e); });
    },
  });
  function toggleActiva(t, el) {
    const key = CAT_KEY[t]; const it = ((S[key] && S[key].items) || []).find((x) => x.id === el.dataset.id); if (!it) return;
    const next = !it.activa; it.activa = next; el.setAttribute('aria-checked', String(next));
    HH.api('PUT', '/' + t + '/' + encodeURIComponent(it.id), { activa: next })
      .then((r) => { if (r && r.item) Object.assign(it, r.item); HH.toast(`${it.nombre}: ${next ? 'activa' : 'inactiva'}`, { type: 'ok' }); HH.refresh(); })
      .catch((e) => { it.activa = !next; el.setAttribute('aria-checked', String(!next)); fail(e); });
  }

  /* ---------- Secciones que llegan en las próximas fases ---------- */
  const SOON = {
    clientes: ['Clientes', 4, 'Los clientes no tienen cuenta: navegan sin registrarse para cuidar su privacidad. Esta sección va a mostrar compras y bloqueos cuando exista la venta de contenido.'],
    soporte: ['Soporte', 3, 'Consultas de las acompañantes y respuestas del asistente de soporte.'],
    whatsapp: ['Avisos automáticos', 3, 'Los avisos a las acompañantes (verificación, pagos y vencimientos) hoy salen por email. El bot de Telegram llega después: WhatsApp Business no permite este rubro.'],
    seo: ['SEO', 3, 'Títulos, descripciones y textos de las páginas por país, ciudad y tipo de salida, mapa del sitio y redirecciones de direcciones viejas.'],
  };
  function vSoon(tab) {
    const t = TABS.find((x) => x.id === tab) || { label: tab, icon: 'sparkles' };
    const s = SOON[tab] || [t.label, null, 'Esta sección se activa cuando su parte del sitio tenga datos reales.'];
    return layout(tab, `${head(esc(s[0]), '<span class="badge neutral">Próximamente</span>')}
      <div class="card stack pa-soon" style="gap:12px">
        <div class="row" style="gap:10px"><span class="pa-soon-ic">${icon(t.icon)}</span><div><div class="card-title">${esc(s[0])}</div><div class="small muted">${s[1] ? `Llega en la Fase ${s[1]} de la migración` : 'En una próxima fase'}</div></div></div>
        <p>${esc(s[2])}</p>
        <p class="small muted">Se ve igual al de la demostración interna: cuando esta parte del sitio tenga datos reales, la sección se activa acá con el mismo diseño.</p>
        <div class="row"><a class="btn ghost sm" href="#admin.resumen" data-go="#admin.resumen">${icon('arrowLeft')} Volver al resumen</a></div>
      </div>`);
  }

  // Todas las pestañas del menú pasan por acá (Object.assign sobre las vistas de la demo)
  const views = {};
  TABS.forEach((t) => { views[t.id] = () => vSoon(t.id); });
  Object.assign(views, { resumen: vResumen, preregistros: vPre, reportes: vReportes, textos: vTextos, acompanantes: vAcompanantes, pedidos: vPedidos, pagos: vPedidos, renovaciones: vRenovaciones, destacados: vDestacados, suscripciones: vSuscripciones, stars: vStars, ubicaciones: vUbicaciones, categorias: vCategorias, ajustes: vAjustes });
  HH.adminViews = views;
  HH.route('admin.textos.:pagina', ({ pagina }) => (HH.requireRole('admin') ? vTextoPagina(pagina) : false));
  HH.route('admin.acompanantes.:id', ({ id }) => (HH.requireRole('admin') ? vAcompanante(id) : false));

  /* ---------- Acciones ---------- */
  Object.assign(HH.actions, {
    prodRetry(el) {
      const k = el.dataset.k;
      if (k.startsWith('page:')) loadPage(k.slice(5), true);
      else if (k.startsWith('acd:')) { [...blobs.keys()].forEach((b) => { URL.revokeObjectURL(blobs.get(b).url); blobs.delete(b); }); load(k, '/acompanantes/' + encodeURIComponent(k.slice(4)), true); load('acv:' + k.slice(4), '/acompanantes/' + encodeURIComponent(k.slice(4)) + '/videos', true); load('cr:' + k.slice(4), '/creditos/' + encodeURIComponent(k.slice(4)) + '?limite=20', true); load('dst', '/destacados', true); }
      else if (k === 'ren') { load('ven', PATHS.ven, true); load('pau', PATHS.pau, true); }
      else { if (k === 'aj') { S.pkEdit = null; S.pkDirty = false; } load(k, { res: '/resumen', pre: '/preregistros', den: '/denuncias', txt: '/textos' }[k] || pathDe(k), true); }
      if (k === 'cat') load('int', '/intereses', true);
      if (k !== 'res') refreshResumen();
      HH.refresh();
    },
    prodPreFilter(el) { S.pf = el.dataset.f; HH.refresh(); },
    prodPreSearch(el) { S.pq = el.value; const box = document.getElementById('prodPreRows'); if (box) box.innerHTML = preRows(); },
    prodPreEstado(el) {
      const id = el.dataset.id; const it = ((S.pre && S.pre.items) || []).find((r) => String(r.id) === id); if (!it) return;
      const prev = it.estado; const next = el.value; if (prev === next) return;
      it.estado = next;
      document.querySelectorAll(`select[data-change="prodPreEstado"][data-id="${CSS.escape(id)}"]`).forEach((s) => { s.value = next; });
      HH.api('POST', '/preregistros/' + encodeURIComponent(id) + '/estado', { estado: next })
        .then((d) => { if (d && d.item) Object.assign(it, d.item); HH.toast(`${it.nombre_artistico}: ${(ESTADOS.find(([k]) => k === next) || [0, next])[1].toLowerCase()}`, { type: 'ok' }); refreshResumen(); if (S.pf !== 'all') HH.refresh(); else { const box = document.getElementById('prodPreRows'); if (box) box.innerHTML = preRows(); } })
        .catch((e) => { it.estado = prev; HH.toast(e.message, { type: 'danger' }); const box = document.getElementById('prodPreRows'); if (box) box.innerHTML = preRows(); });
    },
    prodDenResolver(el) {
      const id = el.dataset.id; const it = ((S.den && S.den.items) || []).find((r) => String(r.id) === id); if (!it) return;
      HH.confirm({ title: 'Marcar como resuelta', text: 'La denuncia pasa a «Resueltas». Hacelo cuando ya la revisaste y tomaste las medidas necesarias.', okLabel: 'Marcar resuelta', onOk: () => {
        HH.api('POST', '/denuncias/' + encodeURIComponent(id) + '/resolver')
          .then((d) => { Object.assign(it, (d && d.item) || { resuelto: new Date().toISOString(), estado: 'resuelta' }); HH.toast('Denuncia marcada como resuelta', { type: 'ok' }); refreshResumen(); HH.refresh(); })
          .catch((e) => HH.toast(e.message, { type: 'danger' }));
      } });
    },
    prodTxtFilter(el) { S.tf = el.dataset.f; HH.refresh(); },
    prodTxtEdit(el) { const k = el.dataset.k; S.edits[k] = String(el.value).slice(0, MAX_VALOR); updateDirtyUi(); },
    prodTxtReset(el) {
      const k = el.dataset.k; const pg = S.page[S.curPage]; const b = pg && (pg.bloques || []).find((x) => x.clave === k); if (!b) return;
      S.edits[k] = null;
      const f = document.getElementById('tx_' + k); if (f) f.value = b.defValor;
      updateDirtyUi();
      HH.toast('Se vuelve al texto original al guardar');
    },
    prodTxtDiscard() { S.edits = {}; HH.refresh(); },
    prodTxtSave(el) {
      const id = S.curPage; const pg = S.page[id]; if (!pg) return;
      const cambios = pendingChanges(pg); const n = Object.keys(cambios).length;
      if (!n) { HH.toast('No hay cambios para guardar'); return; }
      if (Object.values(cambios).some((v) => v != null && v.length > MAX_VALOR)) { HH.toast('Cada texto puede tener hasta ' + MAX_VALOR + ' caracteres', { type: 'warn' }); return; }
      if (el) el.disabled = true;
      HH.api('POST', '/textos/' + encodeURIComponent(id), { cambios })
        .then((d) => { S.edits = {}; HH.toast(`${(d && d.guardados) != null ? d.guardados : n} ${HH.plural((d && d.guardados) != null ? d.guardados : n, 'texto guardado', 'textos guardados')}`, { type: 'ok' }); loadPage(id, true); load('txt', '/textos', true); refreshResumen(); })
        .catch((e) => { HH.toast(e.message, { type: 'danger' }); if (el) el.disabled = false; });
    },
    prodTxtHist(el) {
      const k = el.dataset.k;
      HH.modal({ title: 'Versiones anteriores', body: loadingCard(2) });
      HH.api('GET', '/textos/historial?clave=' + encodeURIComponent(k))
        .then((h) => {
          const vs = h.versiones || [];
          HH.modal({ title: 'Versiones anteriores', wide: true, body: `<div class="stack" style="gap:12px">
              <div class="small"><span class="pa-ctx">${esc(h.contexto || k)}</span> <code class="tiny muted">${esc(h.clave || k)}</code></div>
              <div class="card soft stack" style="gap:6px"><div class="tiny muted">Texto actual</div><div class="pa-pre small">${esc(h.actual != null ? h.actual : h.defValor)}</div><div class="tiny muted" style="margin-top:6px">Por defecto</div><div class="pa-pre small">${esc(h.defValor)}</div></div>
              ${vs.length ? vs.map((v) => `<div class="card stack" style="gap:8px"><div class="row between"><span class="tiny muted">Guardada el ${esc(fecha(v.guardado))}${v.valor === h.actual ? ' · igual al texto actual' : ''}</span><button type="button" class="btn ghost sm" data-action="prodTxtRestore" data-id="${esc(v.id)}"${v.valor === h.actual ? ' disabled' : ''}>${icon('refresh')} Restaurar esta versión</button></div><div class="pa-pre small">${esc(v.valor)}</div></div>`).join('') : '<p class="small muted">Todavía no hay versiones anteriores de este texto.</p>'}
            </div>`, actions: [{ label: 'Cerrar', cls: 'ghost', action: 'closeModal' }] });
        })
        .catch((e) => { HH.closeModal(); HH.toast(e.message, { type: 'danger' }); });
    },
    prodTxtRestore(el) {
      el.disabled = true;
      HH.api('POST', '/textos/historial/' + encodeURIComponent(el.dataset.id) + '/restaurar')
        .then((d) => { HH.closeModal(); if (d && d.clave) delete S.edits[d.clave]; HH.toast('Versión restaurada', { type: 'ok' }); loadPage((d && d.pagina) || S.curPage, true); load('txt', '/textos', true); refreshResumen(); })
        .catch((e) => { el.disabled = false; HH.toast(e.message, { type: 'danger' }); });
    },
    prodLogout() {
      HH.modal({ title: 'Salir del panel', body: '<p>Para salir, cerrá todas las ventanas del navegador. El acceso está protegido por Cloudflare Access y por la contraseña del panel, y el navegador recuerda la contraseña hasta que lo cerrás.</p><p class="small muted">Este panel no guarda datos en este equipo.</p>', actions: [{ label: 'Entendido', action: 'closeModal' }] });
    },
  });

  /* ---------- Cambios sin guardar en Textos ---------- */
  const leaving = (target) => {
    if (!dirtyCount()) return false;
    const cur = 'admin.textos.' + S.curPage; const to = String(target || '').replace(/^#/, '');
    if (to === cur) return false;
    HH.confirm({ title: 'Cambios sin guardar', text: 'Tenés cambios sin guardar en esta página. Si salís, se pierden.', okLabel: 'Salir sin guardar', cls: 'danger', onOk: () => { S.edits = {}; HH.go('#' + to); } });
    return true;
  };
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-go]'); if (!a) return;
    if (leaving(a.getAttribute('data-go'))) { ev.preventDefault(); ev.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('beforeunload', (ev) => { if (dirtyCount()) { ev.preventDefault(); ev.returnValue = ''; } });

  /* ---------- Shell, rutas y arranque ---------- */
  HH.renderShell = function () {
    const hi = document.getElementById('headerInner');
    if (hi) {
      hi.innerHTML = `<a class="brand" href="#admin.resumen" data-go="#admin.resumen" aria-label="SexyRose, panel de administración"><span class="mark">${icon('heart')}</span><span>SexyRose</span></a><span class="pa-tag">Administración</span><span class="hdr-spacer"></span>
        <div class="header-actions"><a class="btn ghost sm" href="/" target="_blank" rel="noopener noreferrer">${icon('external')}<span class="hide-mobile">Ver sitio</span></a><a class="btn ghost sm" href="/demo/" target="_blank" rel="noopener noreferrer" title="Demostración con perfiles de ejemplo">${icon('sparkles')}<span class="hide-mobile">Ver demo</span></a><button type="button" class="btn secondary sm" data-action="prodLogout">${icon('logout')}<span class="hide-mobile">Salir</span></button></div>`;
      if (HH.linkify) HH.linkify(hi);
    }
    const bn = document.getElementById('bottomNav'); if (bn) bn.innerHTML = '';
    document.documentElement.setAttribute('data-gender', '');
  };
  const render0 = HH.render;
  HH.render = function (forcePath) {
    const key = forcePath || HH.currentHash();
    if (!/^admin(\.|$)/.test(key)) { HH.go('#admin.resumen', { replace: true }); return; }
    // "Atrás" del navegador con cambios sin guardar: se queda en la página y pregunta
    if (!forcePath && dirtyCount() && key !== 'admin.textos.' + S.curPage) {
      const to = key; history.replaceState(null, '', BASE + HH.href('#admin.textos.' + S.curPage)); leaving('#' + to); return;
    }
    return render0.call(HH, forcePath);
  };
  document.addEventListener('hh:rendered', () => {
    document.title = 'SexyRose — Admin';
    let m = document.querySelector('meta[name="robots"]'); if (!m) { m = document.createElement('meta'); m.name = 'robots'; document.head.appendChild(m); }
    m.content = 'noindex,nofollow';
  });
  // Si llegó un dato mientras había una ventana abierta, se redibuja al cerrarla
  const close0 = HH.closeModal;
  HH.closeModal = function () { close0.apply(HH, arguments); if (HH._prodPending) { HH._prodPending = false; if (isAdminView()) HH.refresh(); } };

  HH.boot = function () {
    if (HH._booted) return; HH._booted = true;
    HH.db = emptyDb();
    HH.session = { userId: ADMIN.id, role: 'admin', at: new Date().toISOString() };
    HH.setTheme();
    if (!/^admin(\.|$)/.test(HH.currentHash())) { try { history.replaceState(null, '', BASE + HH.href('#admin.resumen')); } catch (e) { location.hash = HH.href('#admin.resumen'); } }
    HH.renderShell();
    HH.render();
    load('res', '/resumen');
  };

  /* ---------- Estilos del panel real ---------- */
  const st = document.createElement('style');
  st.textContent = `
html[data-prod="admin"] .bottomnav{display:none!important}
html[data-prod="admin"] main#app{padding-bottom:24px;min-height:calc(100vh - var(--header-h))}
.pa-tag{font-weight:700;color:var(--muted);font-size:14px;margin-left:4px;white-space:nowrap}
@media(max-width:440px){.pa-tag{display:none}}
.pa-pre{white-space:pre-wrap;overflow-wrap:anywhere}
.pa-url{overflow-wrap:anywhere}
.pa-contact{overflow-wrap:anywhere}.pa-contact svg{width:14px;height:14px;vertical-align:-2px;color:var(--muted)}
.pa-sel{min-width:130px;padding-block:6px}
.pa-cards{display:grid;gap:10px}
@media(min-width:860px){.pa-cards{display:none}}
@media(max-width:859px){.pa-table{display:none}}
.pa-skel{height:84px;border-radius:14px;background:linear-gradient(90deg,var(--surface) 0%,var(--surface-2) 50%,var(--surface) 100%);background-size:200% 100%;animation:paSk 1.2s linear infinite}
@keyframes paSk{to{background-position:-200% 0}}
.stat.pa-danger{border-color:color-mix(in srgb,var(--danger) 55%,transparent)}.stat.pa-danger .v{color:var(--danger)}
.pa-urg{border-color:color-mix(in srgb,var(--danger) 55%,transparent)}
.pa-done summary{cursor:pointer;list-style:none}.pa-done summary::-webkit-details-marker{display:none}
.pa-ctx{font-weight:700;display:block}
.pa-key{display:block;overflow-wrap:anywhere}
.pa-blk.unsaved{border-color:color-mix(in srgb,var(--berry) 60%,transparent)}
.pa-blk textarea{resize:vertical;min-height:72px}
.badge.berry{background:var(--berry);color:var(--berry-ink)}
.pa-savebar{position:sticky;bottom:12px;z-index:5;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;padding:12px 14px;border-radius:16px;background:var(--surface-2);border:1px solid var(--line-2);box-shadow:var(--shadow)}
.pa-av{border-radius:50%;object-fit:cover;flex:none;display:inline-grid;place-items:center;background:var(--surface-2);color:var(--muted)}.pa-av-ph svg{width:45%;height:45%}
.pa-ok{color:var(--ok);display:inline-flex;vertical-align:-3px}.pa-ok svg{width:15px;height:15px}
.pa-rowlink{cursor:pointer}.pa-rowlink:hover td{background:var(--surface-2)}
.pa-accard{color:inherit;text-decoration:none}
.pa-detail{display:grid;gap:14px;grid-template-columns:minmax(0,1fr)}
@media(min-width:1100px){.pa-detail{grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);align-items:start}}
.pa-dl{display:grid;gap:8px;margin:0}.pa-dl>div{display:grid;grid-template-columns:minmax(110px,34%) minmax(0,1fr);gap:10px;font-size:14px;padding-bottom:8px;border-bottom:1px solid var(--line)}.pa-dl>div:last-child{border-bottom:0}.pa-dl dt{color:var(--muted)}.pa-dl dd{margin:0;overflow-wrap:anywhere}
.pa-verif{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.pa-verif figure{margin:0;display:grid;gap:6px}
@media(max-width:420px){.pa-verif{grid-template-columns:minmax(0,1fr)}}
.pa-priv{min-height:120px;border-radius:12px;background:var(--surface-2);overflow:hidden;display:grid;place-items:center}
.pa-priv-img{display:block;width:100%;max-height:420px;object-fit:contain;cursor:zoom-in;background:#000}
.pa-full{display:block;width:100%;max-height:75vh;object-fit:contain;border-radius:12px;background:#000}
.pa-fotos{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:8px}
.pa-foto{position:relative;padding:0;border:0;border-radius:10px;overflow:hidden;aspect-ratio:4/5;background:var(--surface-2);cursor:zoom-in}.pa-foto img{width:100%;height:100%;object-fit:cover;display:block}
.pa-foto-tag{position:absolute;left:6px;bottom:6px;font-size:11px}
.pa-grid2{display:grid;gap:12px;grid-template-columns:minmax(0,1fr)}@media(min-width:860px){.pa-grid2{grid-template-columns:repeat(2,minmax(0,1fr))}}
.pa-hl{border-color:color-mix(in srgb,var(--warn) 60%,transparent)}
.pa-money{font-size:18px}.pa-ref{font-size:14px;padding:2px 8px;border-radius:8px;background:var(--surface-2);letter-spacing:.04em;white-space:nowrap}
.pa-bar{height:6px;border-radius:99px;background:var(--surface-2);overflow:hidden}.pa-bar i{display:block;height:100%;background:var(--berry)}
.pa-catic{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:var(--berry-tint);color:var(--berry);flex:none}.pa-catic svg{width:18px;height:18px}
.pa-num{max-width:120px;padding-block:6px}
.pa-prices td{vertical-align:middle}
.pa-statlink{display:block;color:inherit;text-decoration:none}.pa-statlink .stat{height:100%}
.stat.pa-warn{border-color:color-mix(in srgb,var(--warn) 60%,transparent)}.stat.pa-warn .v{color:var(--warn)}
.pa-mov{white-space:nowrap;font-variant-numeric:tabular-nums}.pa-mov.pos{color:var(--ok)}.pa-mov.neg{color:var(--danger)}
.pa-movs{max-height:420px;overflow:auto}
.pa-icbtn{padding:4px 6px;min-height:0}.pa-icbtn svg{width:15px;height:15px}
.pa-acts .btn{white-space:nowrap}.pa-acts-c{flex-direction:column;align-items:stretch;flex-wrap:nowrap}
.pa-pctable td{vertical-align:top}.pa-pctable tr.pa-mainrow>td:first-child{white-space:nowrap}.pa-pcw{max-width:210px;overflow-wrap:anywhere;white-space:normal}.pa-subrow .pa-acts{flex-wrap:wrap;justify-content:flex-end}.pa-pctable tr.has-sub>td{border-bottom:0;padding-bottom:4px}.pa-subrow>td{padding-top:4px}
.pa-hlrow td{background:color-mix(in srgb,var(--warn) 8%,transparent)}
.pa-pack{display:grid;gap:10px;padding:12px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}.pa-pack.off{opacity:.7}
.pa-pkgrid{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr))}.pa-pkgrid .field{min-width:0}.pa-pkwide{grid-column:1/-1}
@media(min-width:860px){.pa-pkgrid{grid-template-columns:minmax(0,1.3fr) minmax(0,.7fr) minmax(0,.7fr) minmax(0,1.6fr)}.pa-pkwide{grid-column:auto}}
.ico.pa-up{transform:rotate(90deg)}
.pa-soon-ic{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:var(--berry-tint);color:var(--berry);flex:none}.pa-soon-ic svg{width:22px;height:22px}
`;
  document.head.appendChild(st);
})();
