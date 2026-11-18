/* ============================================================
   SexyRose — prod-admin-eliminadas.js (admin real, 18/11/2026)
   Eliminar la cuenta de una acompañante (botón «Eliminar cuenta» en la tarjeta Cuenta de su ficha: motivo
   obligatorio y confirmación) y Acompañantes → Cuentas eliminadas (registro con búsqueda).
   API: app/routes/admin-cuentas-eliminadas.js. Usa las piezas de prod-admin.js (HH.pa).
   ============================================================ */
(function () {
  'use strict';
  if (window.HH_PROD !== 'admin' || !HH.pa) return;
  const esc = HH.esc, icon = HH.icon;
  const P = HH.pa; const S = P.S;
  const { load, layout, head, fecha, loadingCard, errorCard, actualizar } = P;
  const MIN = 10; const MAX = 500;
  const largo = (s) => [...String(s || '')].length;
  const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const fail = (e) => HH.toast(e.message, { type: 'danger' });

  /* ---------- Eliminar cuenta: motivo → confirmación → eliminar ---------- */
  // Lo que se borra (se muestra en la confirmación)
  const SE_BORRA = 'la cuenta y el perfil, fotos, videos, historias y destacadas (con sus portadas), el clip de la tarjeta, la verificación de identidad (también las fotos del documento), sus sesiones, pedidos y suscripciones, créditos (se pierden), Destacados, packs y pedidos personalizados con sus chats';
  function pedirMotivo(x, previo) {
    HH.modal({ title: 'Eliminar cuenta', body: `<div class="stack" style="gap:12px">
        <p class="small">Vas a eliminar la cuenta de <strong data-noi18n>${esc(x.nombre || 'Sin nombre')}</strong> <span class="muted" data-noi18n>(${esc(x.email)})</span>. Le avisamos por email que su cuenta fue eliminada y que, si quiere saber el motivo, nos escriba por WhatsApp.</p>
        <div class="field"><label for="elMotivo">Motivo</label>
          <textarea class="textarea" id="elMotivo" rows="4" maxlength="${MAX}" required aria-describedby="elMotivoAyuda elMotivoN">${esc(previo || '')}</textarea>
          <div class="row between" style="gap:8px;align-items:flex-start"><span class="tiny muted" id="elMotivoAyuda">Escribilo como se lo dirías a ella: si pregunta por WhatsApp, el asistente se lo puede leer.</span><span class="tiny muted nowrap" id="elMotivoN" aria-live="polite">${largo(previo)}/${MAX}</span></div>
        </div>
      </div>`, actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: 'Continuar', cls: 'danger', onClick: () => {
        const m = String(document.getElementById('elMotivo').value || '').trim();
        if (largo(m) < MIN) { HH.toast(`Escribí el motivo (mínimo ${MIN} caracteres).`, { type: 'warn' }); document.getElementById('elMotivo').focus(); return; }
        if (largo(m) > MAX) { HH.toast(`El motivo admite hasta ${MAX} caracteres.`, { type: 'warn' }); return; }
        confirmar(x, m);
      } }] });
    setTimeout(() => { const t = document.getElementById('elMotivo'); if (t) t.focus(); }, 50);
  }
  function confirmar(x, motivo) {
    HH.modal({ title: '¿Eliminar la cuenta?', body: `<div class="stack" style="gap:12px">
        <div class="notice danger">${icon('alert')}<span><strong>No se puede deshacer.</strong> Se borra todo lo de <strong data-noi18n>${esc(x.nombre || 'Sin nombre')}</strong>: ${SE_BORRA}.</span></div>
        <div class="small"><span class="muted">Motivo:</span><div class="el-motivo pa-pre" data-noi18n>${esc(motivo)}</div></div>
        <p class="tiny muted" style="margin:0">Le mandamos el email de aviso. En Cuentas eliminadas quedan la fecha, el email, el WhatsApp, los nombres y el motivo. Puede volver a registrarse con el mismo email o WhatsApp.</p>
      </div>`, actions: [{ label: 'Volver', cls: 'ghost', onClick: () => pedirMotivo(x, motivo) }, { label: 'Eliminar definitivamente', cls: 'danger', onClick: (btn) => {
        if (btn) btn.disabled = true;
        HH.api('POST', '/acompanantes/' + encodeURIComponent(x.id) + '/eliminar', { motivo })
          .then((r) => {
            HH.closeModal();
            HH.toast(r.mail ? 'Cuenta eliminada: le avisamos por email' : 'Cuenta eliminada. El email de aviso no salió.', { type: r.mail ? 'ok' : 'warn', ms: 4000 });
            ['acd:', 'acv:', 'acx:', 'cr:'].forEach((p) => { delete S[p + x.id]; });
            if (S.ac && S.ac.items) S.ac.items = S.ac.items.filter((a) => a.cuentaId !== x.id);
            load('ac', '/acompanantes', true); load('elim', '/cuentas-eliminadas', true); P.refreshResumen();
            HH.go('#admin.acompanantes');
          })
          .catch((e) => { if (btn) btn.disabled = false; fail(e); });
      } }] });
  }

  /* ---------- Acompañantes → Cuentas eliminadas ---------- */
  S.elq = S.elq || '';
  const elMatch = (r) => {
    const q = norm(S.elq).trim(); if (!q) return true;
    const dq = q.replace(/\D/g, '');
    if (dq.length >= 4 && String(r.whatsapp || '').replace(/\D/g, '').includes(dq)) return true;
    return [r.email, r.nombreArtistico, r.nombreCompleto, r.whatsapp].some((v) => norm(v).includes(q));
  };
  const wa = (n) => (n ? `<a href="https://wa.me/${esc(String(n).replace(/\D/g, ''))}" target="_blank" rel="noopener noreferrer" data-noi18n>${esc(n)}</a>` : '<span class="muted">Sin WhatsApp</span>');
  const nombres = (r) => `<strong data-noi18n>${esc(r.nombreArtistico || 'Sin nombre artístico')}</strong>${r.nombreCompleto ? `<div class="tiny muted" data-noi18n>${esc(r.nombreCompleto)}</div>` : ''}`;
  function elRows() {
    const all = (S.elim && S.elim.items) || [];
    const items = all.filter(elMatch);
    if (!items.length) return `<div class="card"><div class="empty">${icon('trash')}<h4>${all.length ? 'Sin resultados' : 'Todavía no se eliminó ninguna cuenta'}</h4><p class="small">${all.length ? 'Probá con otro email, WhatsApp o nombre.' : 'Cuando elimines una cuenta desde la ficha de la acompañante, queda registrada acá con el motivo.'}</p></div></div>`;
    const table = `<div class="card pa-table"><div class="table-wrap"><table class="table el-table"><thead><tr><th>Fecha</th><th>Nombre</th><th>Contacto</th><th>Motivo</th></tr></thead><tbody>
      ${items.map((r) => `<tr><td class="small nowrap">${fecha(r.fecha)}${r.por ? `<div class="tiny muted">por ${esc(r.por)}</div>` : ''}</td><td>${nombres(r)}</td><td class="small"><div class="pa-contact" data-noi18n>${esc(r.email)}</div><div>${wa(r.whatsapp)}</div></td><td class="small"><div class="pa-pre el-mot" data-noi18n>${esc(r.motivo)}</div></td></tr>`).join('')}
      </tbody></table></div></div>`;
    const cards = `<div class="pa-cards">${items.map((r) => `<div class="card stack" style="gap:8px">
        <div class="row between" style="gap:8px;align-items:flex-start"><div style="min-width:0">${nombres(r)}</div><span class="tiny muted nowrap">${fecha(r.fecha)}</span></div>
        <div class="small"><div class="pa-contact" data-noi18n>${esc(r.email)}</div><div>${wa(r.whatsapp)}</div></div>
        <div class="small"><span class="muted">Motivo:</span> <span class="pa-pre" data-noi18n>${esc(r.motivo)}</span></div>
        ${r.por ? `<div class="tiny muted">Eliminada por ${esc(r.por)}</div>` : ''}
      </div>`).join('')}</div>`;
    return table + cards;
  }
  function vEliminadas() {
    load('elim', '/cuentas-eliminadas');
    let body;
    if (!S.elim && S.err.elim) body = errorCard(S.err.elim, 'elim');
    else if (!S.elim) body = loadingCard(3);
    else {
      const n = (S.elim.items || []).length;
      body = `<div class="adm-filters"><label class="sr-only" for="elQ">Buscar cuenta eliminada</label><input class="input" id="elQ" type="search" placeholder="Buscar por email, WhatsApp o nombre" value="${esc(S.elq)}" data-input="elSearch" autocomplete="off"></div>
        ${S.elim.total > n ? `<p class="tiny muted" style="margin:0">Se muestran las ${n} más recientes de ${S.elim.total}.</p>` : ''}
        <div id="elRows">${elRows()}</div>`;
    }
    const total = S.elim ? S.elim.total || 0 : null;
    return layout('eliminadas', `${head('Cuentas eliminadas', actualizar('elim'), total == null ? 'Registro de las cuentas que eliminaste' : `${total} ${HH.plural(total, 'cuenta eliminada', 'cuentas eliminadas')} · la más reciente primero · el motivo queda por si preguntan`)}<div class="stack" style="gap:14px">${body}</div>`);
  }

  /* ---------- Menú, vista y acciones ---------- */
  P.views.eliminadas = vEliminadas;
  P.counts.eliminadas = () => 0;
  HH.adminViews = P.views;
  Object.assign(HH.actions, {
    elEliminar(el) { pedirMotivo({ id: el.dataset.id, nombre: el.dataset.n || '', email: el.dataset.e || '' }); },
    elSearch(el) { S.elq = el.value; const b = document.getElementById('elRows'); if (b) b.innerHTML = elRows(); },
  });
  // Contador del motivo (delegado: el textarea vive en el modal)
  document.addEventListener('input', (ev) => {
    if (!ev.target || ev.target.id !== 'elMotivo') return;
    const n = document.getElementById('elMotivoN'); if (n) n.textContent = largo(ev.target.value) + '/' + MAX;
  });

  const st = document.createElement('style');
  st.textContent = `
.el-table tbody td{vertical-align:top}.el-mot{max-width:420px}
.el-motivo{margin-top:4px;padding:8px 10px;border-radius:10px;background:var(--surface-2);max-height:180px;overflow:auto}
.pa-zona-peligro{border-top:1px solid var(--line);padding-top:12px;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
`;
  document.head.appendChild(st);
})();
