/* ============================================================
   SexyRose — prod-admin-seo.js (panel de administración real)
   Admin → SEO: títulos y descripciones para Google de la portada y de las páginas de país, lugar, hombres y perfil,
   en español, inglés y portugués; el texto de presentación de país y lugar; el bloque al pie de la portada y el
   mínimo de perfiles para que una página entre en Google. Se guarda en el servidor (GET/PUT/DELETE ${API}/seo,
   app/routes/admin-seo.js) y pisa las plantillas por defecto en el servidor y en el sitio.
   Un campo igual al texto por defecto no se guarda: queda el por defecto (y sigue sus cambios futuros).
   ============================================================ */
(function () {
  'use strict';
  if (window.HH_PROD !== 'admin') return;
  const esc = HH.esc, icon = HH.icon;
  const LANGS = ['es', 'en', 'pt'];
  const LN = { es: 'Español', en: 'Inglés', pt: 'Portugués' };
  const TIPOS = [
    ['country', 'Página de país', '/argentina'],
    ['place', 'Página de lugar (provincia, zona o ciudad)', '/argentina/san-isidro'],
    ['countryMen', 'Página de hombres por país', '/argentina/hombres'],
    ['placeMen', 'Página de hombres por lugar', '/argentina/san-isidro/hombres'],
    ['profile', 'Perfil', '/perfil/valentina'],
  ];
  const CAMPO = { title: 'Título (pestaña y Google)', description: 'Descripción (Google)', intro: 'Texto de presentación (arriba de los perfiles)', blockTitle: 'Título del bloque al pie', blockText: 'Texto del bloque al pie' };
  // Valores de ejemplo para la vista previa (la página real usa los de cada lugar y perfil)
  const EJ = { pais: 'Argentina', lugar: 'San Isidro', ciudad: 'San Isidro', cantidad: 12, nombre: 'Valentina', edad: 27, bio: 'Texto de su perfil, recortado a 110 caracteres.' };
  const PREF = { es: '', en: '/en', pt: '/pt' };
  const fill = (t, v) => String(t || '').replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m)).replace(/\s+/g, ' ').replace(/\s([.,:;])/g, '$1').trim();
  const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'; };
  const clone = (o) => JSON.parse(JSON.stringify(o || {}));

  const A = { d: null, err: null, loading: false, lang: 'es', draft: null, dirty: false, saving: false, open: null };
  const fail = (e) => HH.toast(e.message, { type: 'danger' });
  const rerender = () => { if (/^admin\.seo/.test((HH.current && HH.current.path) || '')) HH.refresh(); };
  function cargar(force) {
    if (A.loading || (A.d && !force)) return;
    A.loading = true; A.err = null;
    HH.api('GET', '/seo')
      .then((d) => { A.d = d; A.draft = clone(d.valor); A.dirty = false; })
      .catch((e) => { A.err = e.message; })
      .finally(() => { A.loading = false; rerender(); });
  }

  // path: 'home.title' | 'tpl.place.description'
  const def = (path, lang) => {
    const p = path.split('.'); const d = (A.d && A.d.defaults) || {};
    return p[0] === 'home' ? ((d.home || {})[lang] || {})[p[1]] || '' : (((d.tpl || {})[lang] || {})[p[1]] || {})[p[2]] || '';
  };
  const guardado = (path, lang) => {
    const p = path.split('.'); const g = A.draft || {};
    const v = p[0] === 'home' ? ((g.home || {})[lang] || {})[p[1]] : (((g.tpl || {})[lang] || {})[p[1]] || {})[p[2]];
    return typeof v === 'string' && v.trim() ? v : '';
  };
  const efectivo = (path, lang) => guardado(path, lang) || def(path, lang);
  function setDraft(path, lang, val) {
    const p = path.split('.'); const g = A.draft = A.draft || {};
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const v = norm(val) === norm(def(path, lang)) ? '' : String(val || '');
    if (p[0] === 'home') {
      g.home = g.home || {}; g.home[lang] = g.home[lang] || {};
      if (v.trim()) g.home[lang][p[1]] = v; else delete g.home[lang][p[1]];
      if (!Object.keys(g.home[lang]).length) delete g.home[lang];
      if (!Object.keys(g.home).length) delete g.home;
    } else {
      g.tpl = g.tpl || {}; g.tpl[lang] = g.tpl[lang] || {}; g.tpl[lang][p[1]] = g.tpl[lang][p[1]] || {};
      if (v.trim()) g.tpl[lang][p[1]][p[2]] = v; else delete g.tpl[lang][p[1]][p[2]];
      if (!Object.keys(g.tpl[lang][p[1]]).length) delete g.tpl[lang][p[1]];
      if (!Object.keys(g.tpl[lang]).length) delete g.tpl[lang];
      if (!Object.keys(g.tpl).length) delete g.tpl;
    }
    A.dirty = true;
  }

  const largo = (campo) => ((A.d && A.d.reglas && A.d.reglas.largo) || {})[campo] || { rec: 160, max: 300 };
  const contador = (id, campo, n) => { const L = largo(campo); const cls = n > L.max ? 'danger' : n > L.rec ? 'warn' : ''; return `<span class="tiny num seo-cnt ${cls}" id="${id}_n">${n} / ${L.rec}${n > L.rec ? ' · Google lo puede cortar' : ''}</span>`; };
  const varsDe = (tipo) => (((A.d && A.d.reglas && A.d.reglas.vars) || {})[tipo] || []);
  function campoHtml(path, lang, tipo, campo) {
    const id = 'seo_' + path.replace(/\./g, '_');
    const val = efectivo(path, lang); const propio = !!guardado(path, lang);
    const L = largo(campo); const multi = campo === 'description' || campo === 'intro' || campo === 'blockText';
    const attrs = `id="${id}" maxlength="${L.max}" data-input="seoAdmInput" data-path="${path}" data-tipo="${tipo}" data-campo="${campo}"`;
    return `<div class="field">
      <div class="row between" style="gap:8px"><label for="${id}">${esc(CAMPO[campo])}</label><span class="badge ${propio ? 'accent' : 'neutral'}" id="${id}_b">${propio ? 'Editado' : 'Por defecto'}</span></div>
      ${multi ? `<textarea class="textarea" ${attrs} rows="${campo === 'blockText' ? 6 : campo === 'intro' ? 3 : 2}">${esc(val)}</textarea>` : `<input class="input" ${attrs} value="${esc(val)}">`}
      <div class="row between" style="gap:8px;flex-wrap:wrap">${contador(id, campo, val.length)}<button type="button" class="btn ghost sm" data-action="seoAdmReset" data-path="${path}"${propio ? '' : ' hidden'} id="${id}_r">${icon('refresh')} Volver al texto por defecto</button></div>
    </div>`;
  }
  const serp = (id, url, t, d) => `<div class="seo-serp" id="${id}" aria-label="Vista previa en Google"><div class="seo-serp-u">${esc(url)}</div><div class="seo-serp-t">${esc(t)}</div><div class="seo-serp-d">${esc(d)}</div></div>`;
  const urlBonita = (u) => ((A.d && A.d.defaults && A.d.defaults.siteUrl) || 'https://sexyrose.net').replace(/^https?:\/\//, '') + (u === '/' ? '' : u).split('/').join(' › ');
  const urlDe = (tipo, lang) => { if (tipo === 'home') return urlBonita(PREF[lang] || '/'); const t = TIPOS.find((x) => x[0] === tipo); let u = t ? t[2] : '/'; if (lang !== 'es') u = PREF[lang] + u.replace('/hombres', lang === 'en' ? '/men' : '/homens').replace('/perfil/', lang === 'en' ? '/profile/' : '/perfil/'); return urlBonita(u); };
  const previa = (tipo, lang) => {
    const base = tipo === 'home' ? 'home' : 'tpl.' + tipo;
    const t = tipo === 'home' ? efectivo('home.title', lang) : fill(efectivo(base + '.title', lang), EJ);
    const d = tipo === 'home' ? efectivo('home.description', lang) : clip(fill(efectivo(base + '.description', lang), EJ), 160);
    return { t, d, u: urlDe(tipo, lang) };
  };

  function vSeo() {
    cargar(false);
    const head = HH.adminHead('SEO', A.dirty ? '<span class="badge warn">Cambios sin guardar</span>' : '', 'Cómo aparece el sitio en Google: títulos, descripciones y textos de las páginas de país, lugar y perfil, en los tres idiomas.');
    if (!A.d) {
      const body = A.err ? `<div class="card"><div class="empty">${icon('alert')}<h4>No se pudo cargar</h4><p class="small">${esc(A.err)}</p><button type="button" class="btn secondary sm" data-action="seoAdmRetry">${icon('refresh')} Reintentar</button></div></div>` : '<div class="stack" aria-busy="true" aria-label="Cargando"><div class="pa-skel"></div><div class="pa-skel"></div><div class="pa-skel"></div></div>';
      return HH.adminLayout(HH.me(), 'seo', head + body);
    }
    if (!A.d.defaults) {
      return HH.adminLayout(HH.me(), 'seo', head + `<div class="card"><div class="empty">${icon('alert')}<h4>Faltan las plantillas del sitio</h4><p class="small">El servidor no encuentra seo-datos.json, que se arma junto con el sitio. Hacé el deploy de nuevo y volvé a entrar.</p></div></div>`);
    }
    const lang = A.lang; const D = A.d.defaults;
    const chips = `<div class="chips" role="group" aria-label="Idioma de los textos">${LANGS.map((l) => `<button type="button" class="chip${lang === l ? ' active' : ''}" data-action="seoAdmLang" data-l="${l}" aria-pressed="${lang === l}">${LN[l]}</button>`).join('')}</div>`;
    const minG = (A.draft && A.draft.minProfiles) || '';
    const indexa = `<div class="card stack" style="gap:10px"><div class="card-title">${icon('globe')} Google</div>
      <div class="grid-2" style="align-items:start">
        <div class="field"><label for="seoAdmMin">Mínimo de perfiles para que una página de lugar entre en Google</label><input class="input" id="seoAdmMin" type="number" min="1" max="20" step="1" inputmode="numeric" value="${esc(String(minG || D.minProfiles))}" data-input="seoAdmMin"><span class="hint">Las páginas con menos perfiles se ven igual, pero Google no las guarda. Por defecto: ${esc(String(D.minProfiles))}.</span></div>
        <div class="field"><label>Dirección del sitio</label><div class="input" style="opacity:.8" aria-readonly="true">${esc(D.siteUrl || '')}</div><span class="hint">Se usa en las direcciones que ve Google y en el mapa del sitio (sitemap.xml).</span></div>
      </div></div>`;
    const ph = previa('home', lang);
    const portada = `<div class="card stack" style="gap:12px"><div class="row between" style="gap:8px;flex-wrap:wrap"><div class="card-title">${icon('home')} Portada</div>${chips}</div>
      ${campoHtml('home.title', lang, 'home', 'title')}
      ${campoHtml('home.description', lang, 'home', 'description')}
      ${serp('seoPrev_home', ph.u, ph.t, ph.d)}
      ${campoHtml('home.blockTitle', lang, 'home', 'blockTitle')}
      ${campoHtml('home.blockText', lang, 'home', 'blockText')}
      <span class="hint">El título grande de la portada se edita en Ajustes → Textos del inicio. En el texto del bloque, una línea en blanco separa párrafos; debajo se agregan solos los enlaces a ciudades.</span>
    </div>`;
    const plantillas = `<div class="card stack" style="gap:12px"><div class="row between" style="gap:8px;flex-wrap:wrap"><div class="card-title">${icon('edit')} Plantillas</div>${chips}</div>
      <p class="small muted">Cada página completa sola las variables entre llaves con sus datos. La vista previa usa datos de ejemplo.</p>
      ${TIPOS.map(([tipo, label]) => {
        const pv = previa(tipo, lang); const vars = varsDe(tipo);
        const campos = ((A.d.reglas && A.d.reglas.campos) || {})[tipo] || ['title', 'description'];
        return `<details class="seo-adm-tpl" data-t="${tipo}"${A.open === tipo ? ' open' : ''}><summary><strong>${esc(label)}</strong>${icon('chevronDown')}</summary><div class="stack" style="gap:10px;padding-top:10px">
          <div class="small muted">Variables: ${vars.map((v) => `<code>{${v}}</code>`).join(' ')}</div>
          ${campos.filter((c) => c !== 'intro').map((c) => campoHtml('tpl.' + tipo + '.' + c, lang, tipo, c)).join('')}
          ${serp('seoPrev_' + tipo, pv.u, pv.t, pv.d)}
          ${campos.includes('intro') ? campoHtml('tpl.' + tipo + '.intro', lang, tipo, 'intro') : ''}
        </div></details>`;
      }).join('')}
    </div>`;
    const acciones = `<div class="card row between seo-adm-bar" style="gap:10px;flex-wrap:wrap"><button type="button" class="btn ghost sm" data-action="seoAdmResetAll"${A.d.valor ? '' : ' disabled'}>${icon('refresh')} Volver todo a los textos por defecto</button>
      <button type="button" class="btn" data-action="seoAdmSave"${A.dirty && !A.saving ? '' : ' disabled'}>${icon('check')} ${A.saving ? 'Guardando…' : 'Guardar cambios'}</button></div>`;
    return HH.adminLayout(HH.me(), 'seo', `${head}<div class="stack" style="gap:16px">${indexa}${portada}${plantillas}${acciones}</div>`);
  }

  // Actualiza contador, marca, botón y vista previa sin redibujar (no se pierde el foco)
  function refrescarCampo(path, lang, el) {
    const id = 'seo_' + path.replace(/\./g, '_'); const campo = el.dataset.campo;
    const n = document.getElementById(id + '_n'); if (n) n.outerHTML = contador(id, campo, el.value.length);
    const propio = !!guardado(path, lang);
    const b = document.getElementById(id + '_b'); if (b) { b.textContent = propio ? 'Editado' : 'Por defecto'; b.className = 'badge ' + (propio ? 'accent' : 'neutral'); }
    const r = document.getElementById(id + '_r'); if (r) r.hidden = !propio;
    const tipo = el.dataset.tipo; const box = document.getElementById('seoPrev_' + tipo);
    if (box && (campo === 'title' || campo === 'description')) { const pv = previa(tipo, lang); box.querySelector('.seo-serp-t').textContent = pv.t; box.querySelector('.seo-serp-d').textContent = pv.d; }
    const save = document.querySelector('[data-action="seoAdmSave"]'); if (save) save.disabled = !A.dirty || A.saving;
  }
  const abierto = () => { const o = document.querySelector('details.seo-adm-tpl[open]'); A.open = o ? o.dataset.t : null; };

  Object.assign(HH.actions, {
    seoAdmRetry() { cargar(true); },
    seoAdmLang(el) { abierto(); A.lang = el.dataset.l; HH.refresh(); },
    seoAdmInput(el) { setDraft(el.dataset.path, A.lang, el.value); refrescarCampo(el.dataset.path, A.lang, el); },
    seoAdmMin(el) {
      const n = Number(el.value); const D = A.d.defaults;
      A.draft = A.draft || {};
      if (!el.value || n === D.minProfiles) delete A.draft.minProfiles; else A.draft.minProfiles = n;
      A.dirty = true; const save = document.querySelector('[data-action="seoAdmSave"]'); if (save) save.disabled = false;
    },
    seoAdmReset(el) {
      const path = el.dataset.path; setDraft(path, A.lang, '');
      const f = document.getElementById('seo_' + path.replace(/\./g, '_'));
      if (f) { f.value = def(path, A.lang); refrescarCampo(path, A.lang, f); f.focus(); }
    },
    seoAdmSave() {
      if (A.saving) return; abierto(); A.saving = true; HH.refresh();
      HH.api('PUT', '/seo', { valor: A.draft || {} })
        .then((d) => { A.d = d; A.draft = clone(d.valor); A.dirty = false; HH.toast('SEO guardado. El sitio ya usa los textos nuevos.', { type: 'ok' }); })
        .catch(fail)
        .finally(() => { A.saving = false; rerender(); });
    },
    seoAdmResetAll() {
      HH.confirm({ title: 'Volver todo a los textos por defecto', text: 'Se borran todos los textos editados en SEO, en los tres idiomas, y el mínimo de perfiles vuelve al valor por defecto.', okLabel: 'Volver a los textos por defecto', cls: 'danger', onOk: () => {
        HH.api('DELETE', '/seo')
          .then((d) => { A.d = d; A.draft = clone(d.valor); A.dirty = false; HH.toast('Listo: todo volvió a los textos por defecto.', { type: 'ok' }); rerender(); })
          .catch(fail);
      } });
    },
  });

  // Reemplaza el "Próximamente" de prod-admin.js
  if (HH.adminViews) HH.adminViews.seo = vSeo;

  const css = `
  .seo-serp{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:var(--surface-2);display:grid;gap:3px;overflow-wrap:anywhere}
  .seo-serp-u{font-size:12px;color:var(--muted)}.seo-serp-t{font-size:17px;color:#8ab4f8;line-height:1.3}.seo-serp-d{font-size:13px;color:var(--fg-2);line-height:1.45}
  .seo-adm-tpl{border:1px solid var(--line);border-radius:12px;padding:10px 12px}
  .seo-adm-tpl summary{display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;list-style:none}
  .seo-adm-tpl summary::-webkit-details-marker{display:none}.seo-adm-tpl[open] summary svg{transform:rotate(180deg)}
  .seo-cnt{color:var(--muted)}.seo-cnt.warn{color:var(--warn)}.seo-cnt.danger{color:var(--danger)}
  .seo-adm-bar{position:sticky;bottom:12px;z-index:5}
  @media(max-width:719px){.seo-adm-bar{position:static}}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
})();
