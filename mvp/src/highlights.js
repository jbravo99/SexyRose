/* Historias destacadas (como Instagram): la acompañante junta historias suyas (activas o vencidas) en círculos
   con nombre que quedan fijos en su perfil. Solo se arman con historias ya publicadas. Cantidad por plan: LEVELS.highlights
   (null = ilimitadas); si baja de plan, en el perfil se ven las primeras que entran y el resto queda guardado. */
(function () {
  const esc = (s) => HH.esc(s);
  HH.HL_MAX_ITEMS = 100;
  HH.HL_TITLE_MAX = 16;

  HH.highlights = () => { if (!HH.db.highlights) HH.db.highlights = []; return HH.db.highlights; };
  // Archivo de historias: todas las que publicó, vencidas incluidas, de la más nueva a la más vieja
  HH.storyArchiveOf = (workerId) => (HH.db.stories || []).filter((s) => s.workerId === workerId).sort(HH.by('createdAt'));
  HH.highlightItems = (h) => { const all = HH.db.stories || []; return (h.storyIds || []).map((id) => all.find((s) => s.id === id)).filter(Boolean); };
  HH.highlightCover = (h) => { const its = HH.highlightItems(h); return its.find((s) => s.id === h.coverId) || its[0] || null; };
  // Más nuevas primero (como Instagram); se ignoran las que quedaron sin historias
  HH.highlightsOf = (workerId) => HH.highlights().filter((h) => h.workerId === workerId && HH.highlightItems(h).length).sort(HH.by('createdAt'));
  HH.highlightLimit = (workerId) => { const l = HH.planFeat(workerId, 'highlights'); return l === undefined ? 1 : l; };
  HH.visibleHighlights = (workerId) => { const l = HH.highlightLimit(workerId); const all = HH.highlightsOf(workerId); return l === null ? all : all.slice(0, l); };
  HH.canAddHighlight = (workerId) => { const l = HH.highlightLimit(workerId); return l === null || HH.highlightsOf(workerId).length < l; };
  HH.highlightLimitText = (l) => (l === null ? 'Destacadas ilimitadas' : l + ' ' + HH.plural(l, 'destacada', 'destacadas'));

  const coverHtml = (h, p) => { const c = HH.highlightCover(h); return c ? HH.storyMedia(c, p) : ''; };
  // Fila de círculos del perfil. mine: muestra "Nueva" al principio aunque no tenga destacadas.
  HH.highlightsRow = function (p, mine) {
    const list = mine ? HH.highlightsOf(p.userId) : HH.visibleHighlights(p.userId);
    if (!list.length && !mine) return '';
    const vis = new Set(HH.visibleHighlights(p.userId).map((h) => h.id));
    const add = mine ? `<div class="hl-it"><button type="button" class="hl-c hl-new" data-action="hlNew" aria-label="Nueva destacada">${HH.icon('plus')}</button><span class="hl-n">Nueva</span></div>` : '';
    return `<section class="hl-row" aria-label="Historias destacadas">${add}${list.map((h) => `<div class="hl-it${vis.has(h.id) ? '' : ' hl-off'}"><button type="button" class="hl-c" data-action="hlOpen" data-id="${h.id}" aria-label="Ver destacada ${esc(h.title)}"><span class="hl-in">${coverHtml(h, p)}</span></button><span class="hl-n" data-noi18n>${esc(h.title)}</span></div>`).join('')}</section>`;
  };
  HH.openHighlight = function (id) {
    const h = HH.highlights().find((x) => x.id === id); if (!h) return;
    HH.openStories(h.workerId, 0, null, { items: HH.highlightItems(h), title: h.title, highlightId: h.id });
  };

  /* ---------- Crear / editar ---------- */
  const ED = { id: null, title: '', sel: [], cover: null };
  function editorBody() {
    const me = HH.me(); const p = HH.profileOf(me.id);
    const arch = HH.storyArchiveOf(me.id);
    if (!arch.length) return `<div class="empty">${HH.icon('image')}<h4>Todavía no tenés historias</h4><p class="small">Las destacadas se arman con tus historias. Publicá una desde tu panel y después sumala acá.</p></div>`;
    const cover = ED.sel.includes(ED.cover) ? ED.cover : ED.sel[0];
    return `<div class="stack" style="gap:12px">
      <div class="field"><label for="hlTitle">Nombre</label><input class="input" id="hlTitle" maxlength="${HH.HL_TITLE_MAX}" value="${esc(ED.title)}" data-input="hlField" placeholder="Ej.: Viajes"><span class="hint">Hasta ${HH.HL_TITLE_MAX} caracteres. Podés usar emojis.</span></div>
      <div class="row between"><span class="label" style="margin:0">Elegí historias</span><span class="tiny muted" id="hlCount">${ED.sel.length} ${HH.plural(ED.sel.length, 'elegida', 'elegidas')}</span></div>
      <p class="tiny muted" style="margin:-6px 0 0">Tocá para sumar o sacar. Con la estrella elegís la portada.</p>
      <div class="hl-pick">${arch.map((s) => { const k = ED.sel.indexOf(s.id); return `<div class="hl-pi${k >= 0 ? ' on' : ''}"><button type="button" class="hl-pb" data-action="hlToggle" data-id="${s.id}" aria-pressed="${k >= 0}" aria-label="Historia del ${HH.fmtDate(s.createdAt)}"><span class="media tall">${HH.storyMedia(s, p)}</span><span class="hl-k">${k >= 0 ? k + 1 : ''}</span><span class="hl-d tiny">${HH.fmtDate(s.createdAt, { day: 'numeric', month: 'short' })}</span></button>${k >= 0 ? `<button type="button" class="hl-cv${s.id === cover ? ' on' : ''}" data-action="hlCover" data-id="${s.id}" aria-pressed="${s.id === cover}" aria-label="Usar de portada" title="Portada">${HH.icon('star')}</button>` : ''}</div>`; }).join('')}</div>
    </div>`;
  }
  function renderEditor() {
    const me = HH.me();
    const has = HH.storyArchiveOf(me.id).length;
    const actions = [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }];
    if (ED.id) actions.unshift({ label: HH.icon('trash') + ' Borrar', cls: 'ghost danger-text', onClick: () => HH.actions.hlDelete() });
    if (has) actions.push({ label: ED.id ? 'Guardar' : 'Crear destacada', onClick: () => HH.actions.hlSave() });
    else actions.push({ label: 'Ir a mis historias', onClick: () => { HH.closeModal(); HH.go('#panel.perfil'); } });
    const box = document.getElementById('modalBox'); const y = box ? box.scrollTop : 0; const open = document.getElementById('modalRoot') && document.getElementById('modalRoot').classList.contains('open') && document.getElementById('hlTitle');
    HH.modal({ title: ED.id ? 'Editar destacada' : 'Nueva destacada', body: editorBody(), actions });
    if (open) { const b2 = document.getElementById('modalBox'); if (b2) b2.scrollTop = y; }
  }
  HH.openHighlightEditor = function (id) {
    const me = HH.me(); if (!me) return;
    const h = id ? HH.highlights().find((x) => x.id === id && x.workerId === me.id) : null;
    if (!h && !HH.canAddHighlight(me.id)) {
      const l = HH.highlightLimit(me.id);
      HH.toast('Tu plan permite ' + l + ' ' + HH.plural(l, 'destacada', 'destacadas') + '. Subí de plan para sumar más.', { type: 'warn' }); return;
    }
    Object.assign(ED, h ? { id: h.id, title: h.title, sel: HH.highlightItems(h).map((s) => s.id), cover: h.coverId } : { id: null, title: '', sel: [], cover: null });
    renderEditor();
  };

  Object.assign(HH.actions, {
    hlOpen(el) { HH.openHighlight(el.dataset.id); },
    hlNew() { HH.openHighlightEditor(null); },
    hlEdit(el) { HH.openHighlightEditor(el.dataset.id); },
    hlField(el) { ED.title = el.value; },
    hlToggle(el) {
      const id = el.dataset.id; const k = ED.sel.indexOf(id);
      if (k >= 0) ED.sel.splice(k, 1);
      else { if (ED.sel.length >= HH.HL_MAX_ITEMS) { HH.toast('Una destacada puede tener hasta ' + HH.HL_MAX_ITEMS + ' historias.', { type: 'warn' }); return; } ED.sel.push(id); }
      renderEditor();
    },
    hlCover(el) { ED.cover = el.dataset.id; renderEditor(); },
    hlSave() {
      const me = HH.me(); const title = String(ED.title || '').trim().slice(0, HH.HL_TITLE_MAX);
      if (!title) { HH.toast('Ponele un nombre a la destacada', { type: 'warn' }); const i = document.getElementById('hlTitle'); if (i) i.focus(); return; }
      if (!ED.sel.length) { HH.toast('Elegí al menos una historia', { type: 'warn' }); return; }
      const cover = ED.sel.includes(ED.cover) ? ED.cover : ED.sel[0];
      if (ED.id) {
        const h = HH.highlights().find((x) => x.id === ED.id && x.workerId === me.id); if (!h) return;
        Object.assign(h, { title, storyIds: ED.sel.slice(), coverId: cover, updatedAt: HH.now() });
      } else {
        if (!HH.canAddHighlight(me.id)) { HH.toast('Llegaste al límite de destacadas de tu plan', { type: 'warn' }); return; }
        HH.highlights().push({ id: HH.uid('hl'), workerId: me.id, title, storyIds: ED.sel.slice(), coverId: cover, createdAt: HH.now(), updatedAt: HH.now() });
      }
      HH.save(); HH.closeModal(); HH.toast(ED.id ? 'Destacada guardada' : 'Destacada creada', { type: 'ok' }); HH.refresh();
    },
    hlDelete(el) {
      const id = (el && el.dataset && el.dataset.id) || ED.id; const me = HH.me();
      HH.confirm({ title: 'Borrar destacada', text: 'Se borra la destacada de tu perfil. Las historias siguen en tu archivo.', okLabel: 'Borrar', cls: 'danger', onOk: () => {
        HH.db.highlights = HH.highlights().filter((h) => !(h.id === id && h.workerId === me.id)); HH.save(); HH.toast('Destacada borrada'); HH.refresh();
      } });
    },
  });

  // Bloque del panel (Mi perfil → Historias)
  HH.highlightsPanel = function (workerId) {
    const p = HH.profileOf(workerId); if (!p) return '';
    const all = HH.highlightsOf(workerId); const vis = new Set(HH.visibleHighlights(workerId).map((h) => h.id));
    const l = HH.highlightLimit(workerId);
    return `<div class="stack" style="gap:10px;border-top:1px solid var(--line);padding-top:12px">
      <div class="row between"><div><div style="font-weight:800">Destacadas</div><div class="small muted"><span>Quedan fijas en tu perfil.</span> <span>${HH.highlightLimitText(l)}</span> · <span>usás ${all.length}</span></div></div><button class="btn secondary sm" data-action="hlNew">${HH.icon('plus')} Nueva destacada</button></div>
      ${all.length ? `<div class="list">${all.map((h) => { const n = HH.highlightItems(h).length; return `<div class="list-item"><span class="hl-c sm"><span class="hl-in">${coverHtml(h, p)}</span></span><div class="grow" style="min-width:0"><div class="title ellipsis" data-noi18n>${esc(h.title)}</div><div class="sub">${n} ${HH.plural(n, 'historia', 'historias')}${vis.has(h.id) ? '' : ' · <span style="color:var(--warn)">no se ve: supera el límite de tu plan</span>'}</div></div><button class="btn ghost sm" data-action="hlEdit" data-id="${h.id}">${HH.icon('edit')} Editar</button><button class="btn danger sm" data-action="hlDelete" data-id="${h.id}" aria-label="Borrar destacada">${HH.icon('trash')}</button></div>`; }).join('')}</div>` : `<div class="small muted">Todavía no armaste destacadas. Juntá tus mejores historias para que se vean siempre en tu perfil.</div>`}
    </div>`;
  };

  if (typeof document !== 'undefined' && !document.getElementById('hl-css')) {
    const st = document.createElement('style'); st.id = 'hl-css';
    st.textContent = `
.hl-row{display:flex;gap:14px;overflow-x:auto;padding:4px 2px 6px;margin:2px 0 4px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.hl-row::-webkit-scrollbar{display:none}
.hl-it{flex:none;width:76px;display:grid;justify-items:center;gap:6px}
.hl-it.hl-off{opacity:.45}
.hl-c{width:72px;height:72px;border-radius:50%;padding:4px;border:2px solid var(--line-2);background:transparent;cursor:pointer;display:grid;place-items:center;color:var(--fg)}
.hl-c.sm{width:44px;height:44px;padding:2px;flex:none;cursor:default}
.hl-c:focus-visible{outline:2px solid var(--berry);outline-offset:2px}
.hl-in{display:block;width:100%;height:100%;border-radius:50%;overflow:hidden;position:relative;background:var(--surface)}
.hl-in>img,.hl-in>.ph{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.hl-in .ph .silhouette{width:60%}
.hl-new{border:1.5px solid var(--fg);padding:0}
.hl-new svg{width:30px;height:30px;stroke-width:1.5}
.hl-n{font-size:12.5px;line-height:1.2;max-width:76px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--fg)}
@media(min-width:720px){.hl-it{width:88px}.hl-c{width:80px;height:80px}.hl-n{max-width:88px}}
.hl-pick{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}
.hl-pi{position:relative}
.hl-pb{display:block;width:100%;padding:0;border:2px solid transparent;border-radius:12px;background:none;cursor:pointer;position:relative;overflow:hidden}
.hl-pb .media{display:block;width:100%;border-radius:10px}
.hl-pb .media .ph{position:absolute;inset:0}
.hl-pi.on .hl-pb{border-color:var(--berry)}
.hl-pi:not(.on) .hl-pb .media{opacity:.75}
.hl-k{position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:50%;border:2px solid #fff;background:rgba(0,0,0,.35);color:#fff;font-size:12px;font-weight:800;display:grid;place-items:center}
.hl-pi.on .hl-k{background:var(--berry);border-color:var(--berry);color:var(--berry-ink)}
.hl-d{position:absolute;left:6px;bottom:6px;padding:2px 6px;border-radius:99px;background:rgba(0,0,0,.55);color:#fff}
.hl-cv{position:absolute;top:6px;left:6px;width:26px;height:26px;border-radius:50%;border:0;background:rgba(0,0,0,.55);color:#fff;display:grid;place-items:center;cursor:pointer;padding:0}
.hl-cv svg{width:15px;height:15px}
.hl-cv.on{background:#F5C451;color:#2a1d00}
.danger-text{color:var(--danger)!important}
`;
    document.head.appendChild(st);
  }
})();
