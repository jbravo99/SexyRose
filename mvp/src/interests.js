/* SexyRose · Intereses de las acompañantes
   - Lista que define el admin (Admin → Categorías → Intereses), con nombre en español y, si quiere, en inglés y portugués.
   - Cada acompañante elige hasta 6 en "Tu ficha"; se muestran en su perfil, en Sobre mí → Intereses.
   - Las salidas (café, cena, museo…) siguen siendo las categorías del inicio, los filtros y las páginas SEO.
   - Solo gustos y temas de conversación: sin preferencias sexuales (lo controla el admin, que es quien arma la lista). */
(function () {
  const esc = HH.esc, icon = HH.icon;
  HH.INTERESTS_MAX = 6;

  /* ---------- Lista ---------- */
  const EN_FIX = { Viajes: 'Travel' }; // el diccionario general traduce "Viajes" como "Trips" (la sección de viajes)
  const fromLabel = (label) => ({ id: HH.slugify(label), label, en: EN_FIX[label] || (HH.t ? HH.t(label, 'en') : ''), pt: HH.t ? HH.t(label, 'pt') : '' });
  const fix = (o) => Object.assign(o, { en: o.en === o.label ? '' : o.en, pt: o.pt === o.label ? '' : o.pt });
  HH.interestList = function () {
    if (!HH.db) return [];
    if (!Array.isArray(HH.db.interests)) { HH.db.interests = HH.INTERESTS.map(fromLabel).map(fix); HH.save(); }
    return HH.db.interests;
  };
  HH.interestById = (id) => HH.interestList().find(x => x.id === id) || null;
  HH.interestLabel = (id, lang) => { const it = HH.interestById(id); if (!it) return ''; lang = lang || HH.lang; return (lang !== 'es' && it[lang]) || it.label; };
  // Intereses de un perfil (ids válidos, en el orden de la lista del admin)
  HH.interestsOf = (p) => { const set = new Set((p && p.interests) || []); return HH.interestList().filter(x => set.has(x.id)).map(x => x.id); };
  HH.interestUsage = (id) => (HH.db.profiles || []).filter(p => (p.interests || []).includes(id)).length;

  // Los perfiles guardaban los nombres ("Arte"); ahora guardan ids ("arte")
  function migrate() {
    if (!HH.db || HH.db._interestsIds) return;
    const list = HH.interestList();
    (HH.db.profiles || []).forEach(p => {
      p.interests = [...new Set((p.interests || []).map(v => { const hit = list.find(x => x.id === v || x.label === v || x.id === HH.slugify(v)); return hit ? hit.id : null; }).filter(Boolean))].slice(0, HH.INTERESTS_MAX);
    });
    HH.db._interestsIds = true; HH.save();
  }
  const _boot = HH.boot;
  HH.boot = function () { _boot.apply(this, arguments); try { migrate(); HH.refresh(); } catch (e) { console.error(e); } };
  if (HH._booted) { migrate(); }

  /* ---------- Editor de "Tu ficha" (acompañante) ---------- */
  HH.interestPicker = function (p) {
    const sel = HH.interestsOf(p); const list = HH.interestList();
    return `<div class="field"><span class="label">Intereses <span class="muted">(hasta ${HH.INTERESTS_MAX})</span></span>
      <div class="chips" id="dashInts">${list.map(x => `<button type="button" class="chip" aria-pressed="${sel.includes(x.id)}" data-action="dashToggleInt" data-id="${esc(x.id)}">${esc(x.label)}</button>`).join('')}</div>
      <span class="hint">Tus gustos y temas de conversación. Se ven en tu perfil, en Sobre mí.</span></div>`;
  };
  HH.pickedInterests = () => [...document.querySelectorAll('#dashInts .chip[aria-pressed="true"]')].map(c => c.dataset.id).slice(0, HH.INTERESTS_MAX);

  /* ---------- Admin → Categorías → Intereses ---------- */
  HH.adminInterestsCard = function () {
    const list = HH.interestList();
    return `<div class="card stack" style="gap:12px;margin-top:16px" id="admIntCard">
      <div class="row between" style="gap:8px"><div><div class="card-title">${icon('heart')} Intereses</div><div class="small muted">${list.length} ${HH.plural(list.length, 'interés', 'intereses')} · cada acompañante elige hasta ${HH.INTERESTS_MAX} y se muestran en su perfil, en Sobre mí.</div></div><button class="btn sm" data-action="admIntEdit">${icon('plus')} Nuevo interés</button></div>
      <div class="notice">${icon('shield')}<span>Solo gustos y temas de conversación (arte, viajes, vinos…). Nada de preferencias sexuales: el sitio es sin contenido sexual.</span></div>
      ${list.length ? `<div class="adm-ints">${list.map((x, i) => { const n = HH.interestUsage(x.id); return `<div class="adm-int"><div class="ord"><button type="button" data-action="admIntMove" data-id="${esc(x.id)}" data-dir="-1" aria-label="Subir ${esc(x.label)}"${i === 0 ? ' disabled' : ''}>${icon('chevronDown')}</button><button type="button" data-action="admIntMove" data-id="${esc(x.id)}" data-dir="1" aria-label="Bajar ${esc(x.label)}"${i === list.length - 1 ? ' disabled' : ''}>${icon('chevronDown')}</button></div>
        <div class="grow" style="min-width:0"><div class="nm ellipsis">${esc(x.label)}</div><div class="tiny muted ellipsis">${[x.en && 'EN ' + esc(x.en), x.pt && 'PT ' + esc(x.pt)].filter(Boolean).join(' · ') || 'Sin traducción: se muestra en español'}${n ? ` · ${n} ${HH.plural(n, 'perfil', 'perfiles')}` : ''}</div></div>
        <button type="button" class="icon-btn sm" data-action="admIntEdit" data-id="${esc(x.id)}" aria-label="Editar ${esc(x.label)}">${icon('edit')}</button><button type="button" class="icon-btn sm" data-action="admIntDelete" data-id="${esc(x.id)}" aria-label="Eliminar ${esc(x.label)}">${icon('trash')}</button></div>`; }).join('')}</div>`
        : `<div class="empty">${icon('heart')}<h4>Sin intereses</h4><p class="small">Las acompañantes no van a poder elegir intereses hasta que crees alguno.</p></div>`}
    </div>`;
  };
  Object.assign(HH.actions, {
    admIntEdit(el) {
      const x = el.dataset.id ? HH.interestById(el.dataset.id) : null;
      HH.modal({ title: x ? 'Editar interés' : 'Nuevo interés', body: `<div class="stack" style="gap:10px">
          <div class="field"><label for="intL">Nombre</label><input class="input" id="intL" maxlength="24" value="${esc(x ? x.label : '')}" placeholder="Ej.: Fotografía" autocomplete="off"><span class="hint">Corto, en español. Máximo 24 caracteres.</span></div>
          <div class="grid-2"><div class="field"><label for="intEn">En inglés <span class="muted">(opcional)</span></label><input class="input" id="intEn" maxlength="24" value="${esc(x ? x.en : '')}" placeholder="Photography"></div>
          <div class="field"><label for="intPt">En portugués <span class="muted">(opcional)</span></label><input class="input" id="intPt" maxlength="24" value="${esc(x ? x.pt : '')}" placeholder="Fotografia"></div></div></div>`,
        actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: icon('check') + ' Guardar', onClick: () => {
          const g = (id) => document.getElementById(id).value.trim().slice(0, 24);
          const label = g('intL'); if (label.length < 2) { HH.toast('Escribí el nombre', { type: 'warn' }); return; }
          if (HH.interestList().some(o => o !== x && (o.label.toLowerCase() === label.toLowerCase() || o.id === HH.slugify(label)))) { HH.toast('Ese interés ya existe', { type: 'warn' }); return; }
          if (x) Object.assign(x, { label, en: g('intEn'), pt: g('intPt') });
          else HH.interestList().push({ id: HH.slugify(label), label, en: g('intEn'), pt: g('intPt') });
          HH.save(); HH.closeModal(); HH.refresh(); HH.toast('Interés guardado', { type: 'ok' });
        } }] });
    },
    admIntDelete(el) {
      const x = HH.interestById(el.dataset.id); if (!x) return; const n = HH.interestUsage(x.id);
      HH.confirm({ title: 'Eliminar "' + x.label + '"', text: n ? `Lo tienen ${n} ${HH.plural(n, 'perfil', 'perfiles')}; se les quita de Sobre mí.` : 'Nadie lo está usando.', okLabel: 'Eliminar', cls: 'danger', onOk: () => {
        HH.db.interests = HH.interestList().filter(o => o.id !== x.id);
        (HH.db.profiles || []).forEach(p => { p.interests = (p.interests || []).filter(id => id !== x.id); });
        HH.save(); HH.refresh(); HH.toast('Interés eliminado');
      } });
    },
    admIntMove(el) {
      const list = HH.interestList(); const i = list.findIndex(o => o.id === el.dataset.id); const j = i + Number(el.dataset.dir);
      if (i < 0 || j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; HH.save(); HH.refresh();
    },
  });

  const st = document.createElement('style');
  st.textContent = `.adm-ints{display:grid;gap:6px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
  .adm-int{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
  .adm-int .nm{font-weight:700}.adm-int .ord{display:grid;gap:2px}.adm-int .ord button{width:22px;height:16px;display:grid;place-items:center;border:0;background:transparent;color:var(--muted);cursor:pointer;padding:0}
  .adm-int .ord button svg{width:14px;height:14px}.adm-int .ord button:first-child svg{transform:rotate(180deg)}.adm-int .ord button:disabled{opacity:.3;cursor:default}`;
  document.head.appendChild(st);
})();
