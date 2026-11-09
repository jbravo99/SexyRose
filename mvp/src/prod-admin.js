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
  const counts = {};
  TABS.forEach((t) => { counts[t.id] = () => 0; });
  counts.preregistros = () => (S.res && S.res.preregistros ? S.res.preregistros.nuevos : 0) || 0;
  counts.reportes = () => (S.res && S.res.denuncias ? S.res.denuncias.abiertas : 0) || 0;
  HH.adminCounts = counts;

  /* ---------- Resumen ---------- */
  function vResumen() {
    load('res', '/resumen');
    const r = S.res;
    let body;
    if (!r && S.err.res) body = errorCard(S.err.res, 'res');
    else if (!r) body = loadingCard(2);
    else {
      const p = r.preregistros || {}, d = r.denuncias || {}, t = r.textos || {};
      const pend = [];
      if (d.urgentes) pend.push({ ic: 'alert', cls: 'danger', t: `${d.urgentes} ${HH.plural(d.urgentes, 'denuncia urgente', 'denuncias urgentes')} sin resolver`, s: 'Abuso infantil, imágenes sin consentimiento o trata: revisar ya.', go: '#admin.reportes' });
      if (d.abiertas && d.abiertas !== d.urgentes) pend.push({ ic: 'flag', cls: 'warn', t: `${d.abiertas} ${HH.plural(d.abiertas, 'denuncia abierta', 'denuncias abiertas')}`, s: 'Marcalas como resueltas cuando las revises.', go: '#admin.reportes' });
      if (p.nuevos) pend.push({ ic: 'inbox', cls: 'info', t: `${p.nuevos} ${HH.plural(p.nuevos, 'pre-registro nuevo', 'pre-registros nuevos')}`, s: 'Contactalas y marcá el estado de cada una.', go: '#admin.preregistros' });
      body = `<div class="adm-stats">
          ${stat('Pre-registros', (p.total || 0).toLocaleString('es-AR'), `${p.ultimos7 || 0} en los últimos 7 días`, 'accent')}
          ${stat('Por contactar', p.nuevos || 0, p.nuevos ? 'en estado nuevo' : 'todo al día')}
          ${stat('Denuncias abiertas', d.abiertas || 0, `de ${d.total || 0} recibidas`)}
          ${stat('Urgentes', d.urgentes || 0, d.urgentes ? 'revisar ya' : 'ninguna pendiente', d.urgentes ? 'pa-danger' : '')}
          ${stat('Textos modificados', t.modificados || 0, `de ${t.total || 0} textos editables`)}
          ${stat('Sitio', 'En línea', 'pre-registro, legales y denuncias')}
        </div>
        <div class="card stack" style="gap:10px">
          <div class="card-title">Pendientes</div>
          ${pend.length ? `<div class="list">${pend.map((x) => `<a class="list-item" href="${x.go}" data-go="${x.go}"><span class="badge ${x.cls}" style="padding:6px">${icon(x.ic)}</span><div class="grow" style="min-width:0"><div class="title">${esc(x.t)}</div><div class="sub">${esc(x.s)}</div></div>${icon('chevronRight')}</a>`).join('')}</div>` : `<p class="small muted">Nada pendiente. Las denuncias y los pre-registros nuevos aparecen acá.</p>`}
        </div>
        <div class="card stack" style="gap:10px">
          <div class="card-title">Migración a producción</div>
          <p class="small muted">Este panel es el mismo de la demostración, conectado a los datos reales del sitio. Las secciones marcadas como «Próximamente» se activan a medida que cada parte del sitio real esté lista.</p>
          <div class="list">
            <div class="list-item">${icon('checkCircle')}<div class="grow"><div class="title">Fase 0 · En línea</div><div class="sub">Resumen, Pre-registros, Reportes (denuncias) y Textos del sitio.</div></div><span class="badge ok">Activo</span></div>
            <div class="list-item">${icon('users')}<div class="grow"><div class="title">Fase 1 · Cuentas y perfiles</div><div class="sub">Alta y login de acompañantes, perfiles reales, verificación manual, ubicaciones, categorías, portada y SEO.</div></div><span class="badge neutral">Próximamente</span></div>
            <div class="list-item">${icon('wallet')}<div class="grow"><div class="title">Fase 2 · Planes y cobro por transferencia</div><div class="sub">Pagos, suscripciones, vencimientos y Stars.</div></div><span class="badge neutral">Próximamente</span></div>
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

  /* ---------- Secciones que llegan en las próximas fases ---------- */
  const SOON = {
    acompanantes: ['Acompañantes', 1, 'Lista de acompañantes con búsqueda y filtros (por verificar, suspendidas, sin plan), revisión manual de selfie y documento para verificarlas, ficha completa, suspender o reactivar perfiles.'],
    ubicaciones: ['Ubicaciones', 1, 'Países, provincias, zonas y ciudades del sitio. Aprobar las ubicaciones nuevas que propongan las acompañantes y activar las páginas por lugar.'],
    stars: ['Stars', 2, 'Cupo de 10 Stars por provincia o estado: quién ocupa cada lugar, desde cuándo y cuándo vence.'],
    pagos: ['Pagos', 2, 'Registro de las transferencias de los planes: quién pagó, cuánto y cuándo. Al confirmar un pago se activa o renueva el plan.'],
    clientes: ['Clientes', 4, 'Los clientes no tienen cuenta: navegan y compran sin registrarse para cuidar su privacidad. Esta sección va a mostrar compras y bloqueos cuando exista la venta de contenido.'],
    categorias: ['Categorías', 1, 'Tipos de salida (café, cena, museo…) e Intereses: crear, renombrar, ordenar y borrar, con nombres en inglés y portugués.'],
    apariencia: ['Portada', 1, 'Imagen, título y textos de la portada del sitio con perfiles reales.'],
    suscripciones: ['Suscripciones', 2, 'Quién está al día y quién no, cobros de los próximos 7 días, pausa automática al vencer, subir o bajar de plan y precios por plan.'],
    soporte: ['Soporte', 3, 'Consultas de las acompañantes y respuestas del asistente de soporte.'],
    whatsapp: ['Avisos automáticos', 3, 'Los avisos a las acompañantes (vencimientos, verificación, reservas) van a ir por email y por un bot de Telegram: WhatsApp Business no permite este rubro.'],
    ajustes: ['Ajustes', 2, 'Comisiones, umbral del dólar MEP para reajustar precios, límites y opciones generales del sitio.'],
    seo: ['SEO', 1, 'Títulos, descripciones y textos de las páginas por país, ciudad y tipo de salida, mapa del sitio y redirecciones de direcciones viejas.'],
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
  Object.assign(views, { resumen: vResumen, preregistros: vPre, reportes: vReportes, textos: vTextos });
  HH.adminViews = views;
  HH.route('admin.textos.:pagina', ({ pagina }) => (HH.requireRole('admin') ? vTextoPagina(pagina) : false));

  /* ---------- Acciones ---------- */
  Object.assign(HH.actions, {
    prodRetry(el) {
      const k = el.dataset.k;
      if (k.startsWith('page:')) loadPage(k.slice(5), true);
      else load(k, { res: '/resumen', pre: '/preregistros', den: '/denuncias', txt: '/textos' }[k], true);
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
        <div class="header-actions"><a class="btn ghost sm" href="/" target="_blank" rel="noopener noreferrer">${icon('external')}<span class="hide-mobile">Ver sitio</span></a><button type="button" class="btn secondary sm" data-action="prodLogout">${icon('logout')}<span class="hide-mobile">Salir</span></button></div>`;
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
.pa-soon-ic{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:var(--berry-tint);color:var(--berry);flex:none}.pa-soon-ic svg{width:22px;height:22px}
`;
  document.head.appendChild(st);
})();
