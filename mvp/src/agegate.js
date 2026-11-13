/* SexyRose · Ventana de entrada (v56)
   - En cada visita (cada pestaña nueva) pide confirmar que es mayor de 18 y qué busca: Mujeres, Trans u Hombres.
     Se puede elegir más de una; vienen marcadas Mujeres y Trans (o lo que eligió la última vez). Después se cambia
     con los íconos de la barra.
   - No aparece en el servidor (ssr/), ni a acompañantes o admin con sesión iniciada, ni en el panel.
   - "Soy menor de 18" no deja entrar en esa pestaña.
   - Sus textos se traducen acá (HH.I18N) y se escriben ya traducidos con HH.t. */
(function () {
  'use strict';
  const esc = HH.esc; const icon = HH.icon;
  const KEY = 'hh_age_ok';
  let okMem = false; let blocked = false; let sel = null; let open = false;
  const isOk = () => { if (okMem) return true; try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
  const setOk = () => { okMem = true; try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* sin storage: vale para esta carga */ } };
  const T = (s) => (HH.t ? HH.t(s) : s);
  const PRIVATE = ['panel', 'admin', 'cuenta', 'chat'];
  const curKey = () => String((HH.current && HH.current.path) || (HH.currentHash && HH.currentHash()) || 'inicio').replace(/^#/, '');
  function shouldShow() {
    if (HH.SSR || isOk()) return false;
    const me = HH.me && HH.me(); if (me && (me.role === 'worker' || me.role === 'admin')) return false;
    if (PRIVATE.includes(curKey().split('.')[0])) return false;
    return true;
  }
  function initialSel() {
    // Si entra directo a una página de hombres, viene marcado Hombres
    const k = curKey(); if (HH.GENDER_PAGE && new RegExp('\\.' + HH.GENDER_PAGE.key + '$').test(k)) return [HH.GENDER_PAGE.gender];
    return HH.genderSet();
  }
  function html() {
    if (blocked) return `<div class="ag-box" data-noi18n><span class="ag-18">18+</span><h2 id="agT">${esc(T('SexyRose es solo para mayores de 18 años.'))}</h2><p class="muted">${esc(T('Cerrá esta pestaña para salir.'))}</p></div>`;
    return `<div class="ag-box" data-noi18n>
      <div class="ag-top"><span class="brand"><span class="mark">${icon('heart')}</span><span>SexyRose</span></span>${HH.langSelect ? HH.langSelect() : ''}</div>
      <div class="ag-head"><span class="ag-18">18+</span><h2 id="agT">${esc(T('Antes de entrar'))}</h2></div>
      <p class="small muted">${esc(T('SexyRose es un sitio de anuncios para mayores de 18 años. Cada anunciante es responsable de su aviso.'))}</p>
      <div class="ag-q" id="agQ">${esc(T('¿Qué buscás?'))}</div>
      <div class="ag-opts" role="group" aria-labelledby="agQ">${HH.GENDERS.map(g => `<button type="button" class="ag-opt${sel.includes(g.id) ? ' on' : ''}" data-ag="${g.id}" aria-pressed="${sel.includes(g.id)}">${icon(g.icon)}<span>${esc(T(g.plural))}</span><span class="ag-tick">${icon('check')}</span></button>`).join('')}</div>
      <span class="tiny muted">${esc(T('Podés elegir más de una y cambiarlo después desde la barra.'))}</span>
      <button type="button" class="btn lg block" id="agEnter"${sel.length ? '' : ' disabled'}>${esc(T('Soy mayor de 18 · Entrar'))}</button>
      <button type="button" class="btn ghost block" id="agExit">${esc(T('Soy menor de 18 · Salir'))}</button>
    </div>`;
  }
  function draw() {
    let root = document.getElementById('agRoot');
    if (!root) { root = document.createElement('div'); root.id = 'agRoot'; root.className = 'ag-root'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'agT'); document.body.appendChild(root); }
    root.innerHTML = html(); document.body.style.overflow = 'hidden';
    root.querySelectorAll('[data-ag]').forEach(b => b.addEventListener('click', () => { const g = b.dataset.ag; sel = sel.includes(g) ? sel.filter(x => x !== g) : sel.concat([g]); draw(); const nb = document.querySelector(`#agRoot [data-ag="${g}"]`); if (nb) nb.focus(); }));
    const enter = document.getElementById('agEnter'); if (enter) { enter.addEventListener('click', accept); if (!document.activeElement || !root.contains(document.activeElement)) setTimeout(() => enter.focus({ preventScroll: true }), 30); }
    const exit = document.getElementById('agExit'); if (exit) exit.addEventListener('click', () => { blocked = true; draw(); });
  }
  function accept() {
    if (!sel.length) return;
    HH.setGenders(sel); setOk(); close(); HH.refresh();
  }
  function close() { open = false; const r = document.getElementById('agRoot'); if (r) r.remove(); document.body.style.overflow = ''; }
  function mount() {
    if (open) { draw(); return; } // re-render (por ejemplo, al cambiar el idioma desde la ventana)
    if (!shouldShow()) return;
    open = true; sel = initialSel(); draw();
  }
  HH.ageGateShow = () => { okMem = false; try { sessionStorage.removeItem(KEY); } catch (e) { /* */ } mount(); };
  document.addEventListener('hh:rendered', mount);
  // La ventana no se cierra con Escape ni tocando afuera
  document.addEventListener('keydown', (ev) => { if (open && ev.key === 'Tab') { const r = document.getElementById('agRoot'); const f = r ? [...r.querySelectorAll('button:not([disabled]),select')] : []; if (!f.length) return; const i = f.indexOf(document.activeElement); if (ev.shiftKey && i <= 0) { ev.preventDefault(); f[f.length - 1].focus(); } else if (!ev.shiftKey && i === f.length - 1) { ev.preventDefault(); f[0].focus(); } } }, true);

  /* ---------- Traducciones (v56) ---------- */
  Object.assign(HH.I18N = HH.I18N || {}, {
    "Antes de entrar": ["Before you enter", "Antes de entrar"],
    "SexyRose es un sitio de anuncios para mayores de 18 años. Cada anunciante es responsable de su aviso.": ["SexyRose is an ads site for adults 18 and over. Each advertiser is responsible for their own ad.", "O SexyRose é um site de anúncios para maiores de 18 anos. Cada anunciante é responsável pelo seu anúncio."],
    "¿Qué buscás?": ["What are you looking for?", "O que você procura?"],
    "Podés elegir más de una y cambiarlo después desde la barra.": ["You can choose more than one and change it later from the top bar.", "Você pode escolher mais de uma e mudar depois pela barra."],
    "Soy mayor de 18 · Entrar": ["I'm 18 or older · Enter", "Tenho 18 anos ou mais · Entrar"],
    "Soy menor de 18 · Salir": ["I'm under 18 · Leave", "Tenho menos de 18 · Sair"],
    "SexyRose es solo para mayores de 18 años.": ["SexyRose is only for adults 18 and over.", "A SexyRose é só para maiores de 18 anos."],
    "Cerrá esta pestaña para salir.": ["Close this tab to leave.", "Feche esta aba para sair."],
    "Elegí al menos un tipo de perfil": ["Choose at least one type of profile", "Escolha pelo menos um tipo de perfil"],
    "Mujeres y Trans": ["Women and Trans", "Mulheres e Trans"],
    "Mujeres y Hombres": ["Women and Men", "Mulheres e Homens"],
    "Trans y Hombres": ["Trans and Men", "Trans e Homens"],
    "Mujeres y Trans · Perfiles cerca tuyo": ["Women and Trans · Profiles near you", "Mulheres e Trans · Perfis perto de você"],
    "Mujeres y Hombres · Perfiles cerca tuyo": ["Women and Men · Profiles near you", "Mulheres e Homens · Perfis perto de você"],
    "Trans y Hombres · Perfiles cerca tuyo": ["Trans and Men · Profiles near you", "Trans e Homens · Perfis perto de você"],
  });

  const st = document.createElement('style');
  st.textContent = `
  .ag-root{position:fixed;inset:0;z-index:300;display:grid;place-items:center;padding:max(16px,env(safe-area-inset-top,0px)) 16px max(16px,env(safe-area-inset-bottom,0px));background:rgba(12,8,14,.92);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);overflow:auto}
  .ag-box{width:100%;max-width:420px;display:grid;gap:14px;padding:22px;border-radius:24px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow)}
  .ag-top{display:flex;align-items:center;justify-content:space-between;gap:10px}.ag-top .brand{font-size:19px}
  .ag-head{display:flex;align-items:center;gap:10px}.ag-head h2{font-size:24px}
  .ag-18{display:inline-grid;place-items:center;min-width:48px;height:32px;padding:0 10px;border-radius:999px;background:var(--berry-tint);color:var(--berry);font-weight:800;font-size:15px;flex:none}
  .ag-q{font-weight:800;font-size:16px;margin-top:2px}
  .ag-opts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
  .ag-opt{position:relative;display:grid;justify-items:center;gap:6px;padding:16px 6px 12px;border-radius:16px;border:1.5px solid var(--line-2);background:var(--surface-2);color:var(--fg-2);font:inherit;font-weight:700;font-size:14px;cursor:pointer}
  .ag-opt svg{width:24px;height:24px;color:var(--pink)}.ag-opt .ag-tick{position:absolute;right:7px;top:7px;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;border:1.5px solid var(--line-2)}.ag-opt .ag-tick svg{width:11px;height:11px;color:transparent}
  .ag-opt.on{border-color:var(--berry);background:var(--berry-tint);color:var(--fg)}.ag-opt.on .ag-tick{background:var(--berry);border-color:var(--berry)}.ag-opt.on .ag-tick svg{color:var(--berry-ink)}
  .ag-opt[data-ag="hombre"] svg{color:#8CCBF3}.ag-opt:not(.on) .ag-tick svg{display:none}`;
  document.head.appendChild(st);
})();
