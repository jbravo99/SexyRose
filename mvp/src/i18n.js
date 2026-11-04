/* SexyRose · Idiomas (español, inglés, portugués)
   - Se elige solo según el idioma del navegador y se puede cambiar desde la barra; queda recordado.
   - Las vistas se escriben en español. Después de cada render se traducen los textos de la interfaz
     con el diccionario (src/i18n-dict.js). El panel de admin queda en español.
   - Los textos que escriben las acompañantes no se traducen (data-noi18n); pueden cargar una versión en inglés. */
(function () {
  HH.LANGS = { es: 'Español', en: 'English', pt: 'Português' };
  const LOCALES = { es: 'es-AR', en: 'en-US', pt: 'pt-BR' };
  const KEY = 'hh_lang';
  function detect() {
    // 1) El idioma de la dirección (/en/…, #/pt/…) manda: así cada versión es una página propia para Google
    const path = document.documentElement.getAttribute('data-routing') === 'path' ? location.pathname : (location.hash.indexOf('#/') === 0 ? location.hash.slice(1) : null);
    if (path != null) { const m = path.match(/^\/(en|pt)(\/|$)/i); return m ? m[1].toLowerCase() : 'es'; }
    try { const saved = localStorage.getItem(KEY); if (saved && HH.LANGS[saved]) return saved; } catch (e) { /* sin storage */ }
    const list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'es']).map(l => String(l).toLowerCase().slice(0, 2));
    const hit = list.find(l => HH.LANGS[l]);
    return hit || 'en';
  }
  HH.lang = detect();
  HH.loc = () => LOCALES[HH.lang] || 'es-AR';
  // Texto escrito por la acompañante, en inglés si lo cargó y el visitante navega en inglés
  HH.pText = (p, k) => (p && HH.lang === 'en' && p[k + 'En'] ? p[k + 'En'] : (p ? p[k] : '')) || '';

  /* ---------- Diccionario ---------- */
  const IDX = { en: 0, pt: 1 };
  let exact = null, patterns = null;
  const clean = (t) => t.replace(/\s+/g, ' ').trim();
  function build() {
    const D = HH.I18N || {}; exact = new Map(); patterns = [];
    Object.keys(D).forEach(k => {
      const v = D[k];
      if (/\{[a-z]\}/.test(k)) {
        // {n} = número, {x} = cualquier texto (un nombre, una ciudad)
        const names = []; const re = new RegExp('^' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{([a-z])\\\}/g, (m, c) => { names.push(c); return c === 'n' ? '([\\d.,]+)' : '(.+?)'; }) + '$');
        // Un patrón tiene que tener texto propio suficiente; si no, se "comería" frases cualquiera ("{x} de {x}")
        const own = k.replace(/\{[a-z]\}/g, '').replace(/[^a-záéíóúüñ]/gi, '');
        if (own.length < 4 && !/^\{n\}/.test(k)) return;
        if (/^\{x\}[^a-záéíóúñ]*$/i.test(k) || /^\{x\} \S{1,3} \{x\}$/.test(k)) return;
        patterns.push({ re, names, v, k });
      } else exact.set(k, v);
    });
    // los patrones más largos primero (más específicos)
    patterns.sort((a, b) => b.k.length - a.k.length);
  }
  HH.t = function (text, lang) {
    const l = lang || HH.lang; if (l === 'es' || text == null) return text;
    if (!exact) build();
    const src = clean(String(text)); if (!src || !/[a-záéíóúñ]/i.test(src)) return text;
    const i = IDX[l]; const hit = exact.get(src);
    if (hit && hit[i]) return hit[i];
    for (const p of patterns) {
      const m = src.match(p.re); if (!m || !p.v[i]) continue;
      // {x} es un nombre, una fecha o una ciudad: corto y sin frases largas
      if (p.names.some((c, j) => c === 'x' && (m[j + 1].length > 40 || m[j + 1].split(' ').length > 6))) continue;
      let out = p.v[i]; p.names.forEach((c, j) => { out = out.replace('{' + c + '}', m[j + 1]); });
      return out;
    }
    if (HH._i18nMiss) HH._i18nMiss.add(src);
    return text;
  };

  /* ---------- Aplicación sobre el DOM ---------- */
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  const skip = (el) => !el || el.closest('[data-noi18n],script,style,textarea,code,pre,.wa-sim,.ops-tr') || (el.isContentEditable);
  const inAdmin = () => /^admin/.test((HH.current && HH.current.path) || '') ;
  function translateNode(root) {
    if (HH.lang === 'es' || !root) return;
    const adminScope = inAdmin();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const nodes = []; let n; while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(t => {
      const el = t.parentElement; if (skip(el)) return;
      if (adminScope && el.closest('#app')) return;
      const raw = t.nodeValue; if (!raw || !raw.trim()) return;
      const tr = HH.t(raw); if (tr === raw) return;
      // conserva los espacios de los bordes (texto partido por <strong>, enlaces, etc.)
      const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
      t.nodeValue = lead + tr + trail;
    });
    const els = root.querySelectorAll ? root.querySelectorAll('[placeholder],[title],[aria-label]') : [];
    els.forEach(el => { if (skip(el) || (adminScope && el.closest('#app'))) return; ATTRS.forEach(a => { const v = el.getAttribute(a); if (v) { const tr = HH.t(v); if (tr !== v) el.setAttribute(a, tr); } }); });
  }
  HH.translateNode = translateNode;
  let pending = false; const queue = new Set();
  const obs = new MutationObserver(muts => {
    if (HH.lang === 'es') return;
    muts.forEach(m => { if (m.type === 'childList') m.addedNodes.forEach(x => queue.add(x.nodeType === 1 ? x : x.parentElement)); else if (m.type === 'characterData') queue.add(m.target.parentElement); });
    if (pending) return; pending = true;
    // se aplica antes del próximo pintado
    queueMicrotask(() => { pending = false; obs.disconnect(); queue.forEach(x => { if (x && x.isConnected) translateNode(x); }); queue.clear(); observe(); });
  });
  function observe() { obs.observe(document.body, { childList: true, subtree: true, characterData: true }); }
  HH.setLang = function (l) {
    if (!HH.LANGS[l]) return;
    HH.lang = l; try { localStorage.setItem(KEY, l); } catch (e) { /* */ }
    document.documentElement.lang = l;
    if (HH.closeModal) HH.closeModal();
    // misma página, en la dirección del idioma elegido (/en/…, /pt/…)
    if (HH.go && HH.urlOf) { HH.go(HH.currentHash(), { replace: true }); return; }
    HH.renderShell(); HH.refresh();
  };
  function start() { document.documentElement.lang = HH.lang; translateNode(document.body); observe(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  /* ---------- Selector de idioma ---------- */
  HH.langSelect = (cls) => `<label class="lang-sel ${cls || ''}" data-noi18n><span class="sr-only">Idioma / Language</span>${HH.icon('languages')}<select data-change="setLang" aria-label="Idioma / Language">${Object.entries(HH.LANGS).map(([k, v]) => `<option value="${k}"${k === HH.lang ? ' selected' : ''}>${k.toUpperCase()}</option>`).join('')}</select></label>`;
  const st = document.createElement('style');
  st.textContent = '.lang-sel{display:inline-flex;align-items:center;gap:4px;height:36px;padding:0 4px 0 9px;border:1px solid var(--line);border-radius:999px;background:var(--surface);color:var(--fg-2);font-weight:700;font-size:12px}.lang-sel svg{width:15px;height:15px;flex:none}.lang-sel select{appearance:none;-webkit-appearance:none;background:transparent;border:0;color:var(--fg);font:inherit;padding:0 6px 0 2px;cursor:pointer}.lang-sel select:focus-visible{outline:2px solid var(--berry);border-radius:6px}.lang-sel option{color:#000}';
  document.head.appendChild(st);
  HH.actions = HH.actions || {};
  HH.actions.setLang = (el) => HH.setLang(el.value);
})();
