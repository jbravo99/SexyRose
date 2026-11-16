/* ============================================================
   SexyRose — graficos.js (16/11/2026): gráficos propios en SVG compartidos por Admin → Métricas
   (prod-admin-metricas.js) y Mis números del panel de la acompañante (prod-sitio.js). Sin bibliotecas ni CDN (la CSP
   del admin solo deja scripts con nonce). Columnas (apiladas con 2 px de separación) y líneas, dibujadas al ancho real
   de su caja; tooltip con mouse, toque y teclado; leyenda con 2+ series; "Ver tabla" con los mismos números.
   Paleta categórica validada (skill dataviz) para la superficie oscura del sitio y del admin (#221F28).
   En el sitio, números y fechas van en el idioma elegido (HH.loc) y los textos pasan por el diccionario (HH.t);
   el admin queda en español.
   ============================================================ */
(function () {
  'use strict';
  if (!window.HH || HH.graficos) return;
  const esc = HH.esc, icon = HH.icon;
  const enSitio = () => window.HH_PROD === 'sitio';
  const loc = () => (enSitio() && HH.loc ? HH.loc() : 'es-AR');
  const tr = (s) => (enSitio() && HH.t ? HH.t(s) : s);

  /* ---------- Formato ---------- */
  const nf = (max = 0) => new Intl.NumberFormat(loc(), { maximumFractionDigits: max });
  const entero = (n) => nf(0).format(Math.round(n || 0));
  const usd = (n) => 'US$ ' + nf(n >= 1000 ? 0 : 2).format(n || 0);
  const ars = (n) => '$ ' + nf(n >= 1000 ? 0 : 2).format(n || 0);
  const pct = (n) => nf(1).format(n) + ' %';
  const compacto = (n) => {
    const a = Math.abs(n);
    if (a >= 1e6) return nf(1).format(n / 1e6) + ' M';
    if (a >= 1e4) return nf(a >= 1e5 ? 0 : 1).format(n / 1e3) + (loc() === 'es-AR' ? ' mil' : 'k');
    return nf(0).format(n);
  };
  const MESES = {
    'es-AR': ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
    'en-US': ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    'pt-BR': ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  };
  const mes = (m) => (MESES[loc()] || MESES['es-AR'])[m - 1];
  const parte = (k) => { const [y, m, d] = String(k).split('-').map(Number); return { y, m, d }; };
  const p2 = (n) => String(n).padStart(2, '0');
  // dd/mm (mm/dd en inglés)
  const dm = (k) => { const x = parte(k); return loc() === 'en-US' ? `${p2(x.m)}/${p2(x.d)}` : `${p2(x.d)}/${p2(x.m)}`; };
  const dma = (k) => `${dm(k)}/${parte(k).y}`;
  const etiquetaCorta = (k, g) => (g === 'mes' ? mes(parte(k).m) : dm(k));
  const etiquetaLarga = (k, g) => {
    const x = parte(k);
    if (g === 'mes') return `${mes(x.m)} ${x.y}`;
    if (g === 'semana') return tr(`Semana del ${dm(k)}`);
    return dma(k);
  };
  // El último tramo termina ahora (va por la mitad): se aclara en el tooltip y en la tabla para no leerlo como una caída.
  const etiquetaTramo = (tramos, i, g) => etiquetaLarga(tramos[i], g) + (i === tramos.length - 1 ? ' ' + tr('(en curso)') : '');

  /* ---------- Colores (paleta categórica validada para la superficie oscura, #221F28) ---------- */
  const C = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];
  const GRIS = '#7d7585'; // "sin dato": de-énfasis, no es una serie más

  /* ---------- Stat tile con comparación ---------- */
  // bueno: 'arriba' (subir es bueno), 'abajo' (subir es malo) o null (neutro)
  function delta(cur, ant, bueno = 'arriba', esTasa = false) {
    if (ant == null) return '';
    if (!cur && !ant) return '<span class="mt-dl">Sin movimiento en los dos períodos</span>';
    if (!ant) return '<span class="mt-dl">Nuevo: el período anterior fue 0</span>';
    const dif = esTasa ? cur - ant : ((cur - ant) / ant) * 100;
    if (Math.abs(dif) < 0.05) return '<span class="mt-dl">Igual que el período anterior</span>';
    const sube = dif > 0;
    const cls = bueno ? ((sube === (bueno === 'arriba')) ? 'up' : 'down') : '';
    return `<span class="mt-dl ${cls}"><span aria-hidden="true">${sube ? '▲' : '▼'}</span> ${sube ? 'subió' : 'bajó'} ${nf(1).format(Math.abs(dif))}${esTasa ? ' p.p.' : ' %'}</span>`;
  }
  const tile = (k, v, d, extra) => `<div class="stat mt-stat"><span class="k">${k}</span><span class="v">${v}</span>${d ? `<span class="d">${d}</span>` : ''}${extra ? `<span class="d mt-ex">${extra}</span>` : ''}</div>`;
  const tileM = (k, m, fmt, bueno, extra) => tile(k, fmt(m.total), delta(m.total, m.anterior, bueno), extra || `Antes: ${fmt(m.anterior)}`);

  /* ---------- Gráficos ---------- */
  // Registro de los gráficos de la vista actual: id → configuración. Se dibujan después de cada render, al ancho real.
  let CH = {};
  let nCh = 0;
  const reset = () => { CH = {}; nCh = 0; };
  const vacia = (series) => series.every((s) => s.datos.every((v) => !v));
  /* tipo: 'columnas' (apiladas si hay varias series) | 'lineas'. series: [{ nombre, datos, color }]. fmt: valores.
     resumen: texto para lectores de pantalla. sinDatosHasta: índice del primer tramo con datos (los anteriores no se
     midieron: se dibujan vacíos, no en cero). */
  function grafico({ titulo, tipo = 'columnas', series: s0, tramos, gran, fmt = entero, resumen, vacioTxt, sinDatosHasta = 0 }) {
    const id = 'mtc' + (nCh++);
    const series = s0.map((s) => ({ ...s, datos: s.datos.map((v, i) => (i < sinDatosHasta ? null : v)) }));
    const hay = !vacia(series);
    CH[id] = { tipo, series, tramos, gran, fmt, sinDatosHasta };
    const leyenda = series.length > 1 ? `<div class="mt-leg" aria-hidden="true">${series.map((s) => `<span><i class="${tipo === 'lineas' ? 'ln' : 'sq'}" style="--c:${s.color}"></i>${esc(s.nombre)}</span>`).join('')}</div>` : '';
    const tabla = `<details class="mt-tabla"><summary>Ver tabla</summary><div class="table-wrap"><table class="table"><thead><tr><th scope="col">${gran === 'mes' ? 'Mes' : gran === 'semana' ? 'Semana' : 'Día'}</th>${series.map((s) => `<th scope="col" class="num">${esc(s.nombre)}</th>`).join('')}</tr></thead><tbody>${tramos.map((t, i) => `<tr><th scope="row" data-noi18n>${esc(etiquetaTramo(tramos, i, gran))}</th>${series.map((s) => `<td class="num">${s.datos[i] == null ? '<span class="muted">sin medir</span>' : esc(fmt(s.datos[i]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
    return `<figure class="mt-fig"><figcaption class="mt-ft">${esc(titulo)}</figcaption>
      ${hay ? `${leyenda}<div class="mt-chart" id="${id}" tabindex="0" role="img" aria-label="${esc(tr(titulo) + '. ' + (resumen || ''))}" data-noi18n></div>${tabla}`
        : `<div class="mt-vacio">${icon('activity')}<span>${esc(vacioTxt || 'Todavía no hay datos en este período.')}</span></div>`}
    </figure>`;
  }

  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, at, padre) => { const n = document.createElementNS(NS, tag); for (const k in at) n.setAttribute(k, at[k]); if (padre) padre.appendChild(n); return n; };
  function escala(max) {
    if (max <= 0) return { tope: 1, paso: 1 };
    const crudo = max / 4; const p10 = Math.pow(10, Math.floor(Math.log10(crudo)));
    const paso = [1, 2, 2.5, 5, 10].map((m) => m * p10).find((s) => s >= crudo) || 10 * p10;
    const pasoOk = max < 4 ? 1 : paso;
    return { tope: Math.ceil(max / pasoOk) * pasoOk, paso: pasoOk };
  }
  function dibujar(caja) {
    const cfg = CH[caja.id]; if (!cfg) return;
    const W = Math.max(260, Math.floor(caja.clientWidth)); const angosto = W < 520;
    const H = angosto ? 200 : 230;
    const { tipo, series, tramos, gran, fmt, sinDatosHasta } = cfg;
    const n = tramos.length;
    const totales = tramos.map((_, i) => series.reduce((a, s) => a + (s.datos[i] || 0), 0));
    const max = tipo === 'lineas' ? Math.max(...series.flatMap((s) => s.datos)) : Math.max(...totales);
    const { tope, paso } = escala(max);
    const ticks = []; for (let v = 0; v <= tope + 1e-9; v += paso) ticks.push(v);
    const anchoTick = Math.max(...ticks.map((v) => compacto(v).length)) * 6.6 + 10;
    const etiquetasFin = tipo === 'lineas' && series.length > 1 && series.length <= 4 && !angosto;
    const m = { t: 10, r: etiquetasFin ? 92 : 12, b: 26, l: Math.max(28, anchoTick) };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const banda = pw / n;
    const x = (i) => m.l + banda * i + banda / 2;
    const y = (v) => m.t + ph - (v / tope) * ph;
    caja.textContent = '';
    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true', focusable: 'false' }, caja);
    // Grilla y eje Y
    for (const v of ticks) {
      el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v === 0 ? 'mt-base' : 'mt-grid' }, svg);
      const t = el('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'mt-tick' }, svg); t.textContent = compacto(v);
    }
    // Eje X: solo las etiquetas que entran sin pisarse (siempre la última)
    const cada = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / (gran === 'mes' ? 34 : 46)))));
    tramos.forEach((t, i) => {
      if ((n - 1 - i) % cada !== 0) return;
      const tx = el('text', { x: x(i), y: H - 8, 'text-anchor': 'middle', class: 'mt-tick' }, svg); tx.textContent = etiquetaCorta(t, gran);
    });
    if (sinDatosHasta > 0 && banda * sinDatosHasta >= 70) {
      const t = el('text', { x: m.l + (banda * sinDatosHasta) / 2, y: m.t + ph / 2, 'text-anchor': 'middle', class: 'mt-tick' }, svg); t.textContent = tr('Sin medición');
    }
    const marca = el('rect', { x: 0, y: m.t, width: Math.max(2, banda), height: ph, class: 'mt-hover', visibility: 'hidden' }, svg);
    if (tipo === 'columnas') {
      const ancho = Math.max(2, Math.min(24, banda * 0.62));
      tramos.forEach((_, i) => {
        let base = 0; const vis = series.map((s) => s.datos[i] || 0);
        const ultima = vis.reduce((u, v, k) => (v > 0 ? k : u), -1);
        series.forEach((s, k) => {
          const v = vis[k]; if (!(v > 0)) return;
          const y0 = y(base), y1 = y(base + v); base += v;
          const gap = k > 0 && base - v > 0 ? 2 : 0; // separación de 2 px entre segmentos apilados
          const alto = Math.max(1, y0 - y1 - gap); const top = y0 - gap - alto;
          const r = k === ultima ? Math.min(4, alto, ancho / 2) : 0;
          const x0 = x(i) - ancho / 2;
          el('path', { d: `M${x0},${top + alto}V${top + r}${r ? `Q${x0},${top} ${x0 + r},${top}` : ''}H${x0 + ancho - r}${r ? `Q${x0 + ancho},${top} ${x0 + ancho},${top + r}` : ''}V${top + alto}Z`, fill: s.color }, svg);
        });
      });
    } else {
      const i0 = Math.min(n - 1, sinDatosHasta || 0);
      series.forEach((s) => {
        const pts = s.datos.map((v, i) => `${x(i)},${y(v || 0)}`).slice(i0);
        el('polyline', { points: pts.join(' '), fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
        if (series.length === 1) {
          const area = `M${x(i0)},${y(0)}L${pts.join('L')}L${x(n - 1)},${y(0)}Z`;
          el('path', { d: area, fill: s.color, opacity: 0.1 }, svg);
        }
        el('circle', { cx: x(n - 1), cy: y(s.datos[n - 1] || 0), r: 4, fill: s.color, class: 'mt-dot' }, svg);
      });
      if (etiquetasFin) { // nombres al final de cada línea, salvo que se pisen (ahí quedan la leyenda y el tooltip)
        const ys = series.map((s) => y(s.datos[n - 1] || 0));
        const orden = ys.slice().sort((a, b) => a - b);
        if (orden.every((v, i) => i === 0 || v - orden[i - 1] >= 13)) {
          series.forEach((s, k) => { const nm = tr(s.nombre); const t = el('text', { x: x(n - 1) + 9, y: ys[k] + 4, class: 'mt-lbl' }, svg); t.textContent = nm.length > 13 ? nm.slice(0, 12) + '…' : nm; });
        }
      }
    }
    // Tooltip: el tramo entero es el blanco (mouse, toque o flechas del teclado)
    const tip = document.createElement('div'); tip.className = 'mt-tip'; tip.hidden = true; caja.appendChild(tip);
    let activo = -1;
    function mostrar(i) {
      if (i < 0 || i >= n) return;
      activo = i;
      if (tipo === 'lineas') { marca.setAttribute('x', x(i) - 0.5); marca.setAttribute('width', 1); marca.setAttribute('class', 'mt-cross'); }
      else { marca.setAttribute('x', m.l + banda * i); marca.setAttribute('width', Math.max(2, banda)); }
      marca.setAttribute('visibility', 'visible');
      tip.textContent = '';
      const h = document.createElement('div'); h.className = 'mt-tip-h'; h.textContent = etiquetaTramo(tramos, i, gran); tip.appendChild(h);
      series.slice().reverse().forEach((s) => {
        const f = document.createElement('div'); f.className = 'mt-tip-f';
        const k = document.createElement('i'); k.style.setProperty('--c', s.color);
        const v = document.createElement('strong'); v.textContent = s.datos[i] == null ? tr('sin medir') : fmt(s.datos[i]);
        const nm = document.createElement('span'); nm.textContent = tr(s.nombre);
        f.append(k, v, nm); tip.appendChild(f);
      });
      if (tipo === 'columnas' && series.length > 1) {
        const f = document.createElement('div'); f.className = 'mt-tip-f mt-tip-t';
        const v = document.createElement('strong'); v.textContent = series.every((s) => s.datos[i] == null) ? tr('sin medir') : fmt(totales[i]); const nm = document.createElement('span'); nm.textContent = tr('Total');
        f.append(document.createElement('i'), v, nm); tip.appendChild(f);
      }
      tip.hidden = false;
      const tw = tip.offsetWidth; let left = x(i) + 12; if (left + tw > W - 4) left = x(i) - tw - 12; if (left < 4) left = 4;
      tip.style.left = left + 'px'; tip.style.top = m.t + 'px';
    }
    const ocultar = () => { tip.hidden = true; marca.setAttribute('visibility', 'hidden'); };
    const indice = (ev) => { const r = svg.getBoundingClientRect(); return Math.min(n - 1, Math.max(0, Math.floor((ev.clientX - r.left - m.l) / banda))); };
    svg.addEventListener('pointermove', (ev) => mostrar(indice(ev)));
    svg.addEventListener('pointerdown', (ev) => mostrar(indice(ev)));
    svg.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') ocultar(); });
    caja.onkeydown = (ev) => {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') { ev.preventDefault(); mostrar(activo < 0 ? n - 1 : activo + (ev.key === 'ArrowRight' ? 1 : -1)); }
      else if (ev.key === 'Home') { ev.preventDefault(); mostrar(0); } else if (ev.key === 'End') { ev.preventDefault(); mostrar(n - 1); } else if (ev.key === 'Escape') ocultar();
    };
    caja.onfocus = () => mostrar(activo < 0 ? n - 1 : activo);
    caja.onblur = ocultar;
  }
  function dibujarTodo() { document.querySelectorAll('.mt-chart').forEach((c) => { try { dibujar(c); } catch (e) { /* un gráfico roto no tapa los demás */ } }); }
  const hayGraficos = () => Boolean(document.querySelector('.mt-chart'));
  document.addEventListener('hh:rendered', () => { if (hayGraficos()) dibujarTodo(); });
  let rt = null; let anchoPrev = window.innerWidth;
  window.addEventListener('resize', () => { if (!hayGraficos() || window.innerWidth === anchoPrev) return; anchoPrev = window.innerWidth; clearTimeout(rt); rt = setTimeout(dibujarTodo, 120); });

  HH.graficos = { C, GRIS, nf, entero, usd, ars, pct, compacto, parte, dm, dma, etiquetaCorta, etiquetaLarga, etiquetaTramo, delta, tile, tileM, grafico, reset, dibujarTodo };

  /* ---------- Estilos (tokens del tema: los mismos en el sitio y en el admin) ---------- */
  const st = document.createElement('style');
  st.textContent = `
.mt-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}
.mt-stat{background:var(--bg-2)}
.mt-stat .v{font-variant-numeric:normal;font-size:24px;overflow-wrap:anywhere}
.mt-stat .mt-ex{color:var(--muted)}
.mt-dl{color:var(--fg-2)}.mt-dl.up{color:var(--ok)}.mt-dl.down{color:var(--danger)}
.mt-fig{margin:0;min-width:0;border:1px solid var(--line);border-radius:var(--radius-sm);padding:12px 12px 8px;display:grid;gap:8px;align-content:start}
.mt-ft{font-weight:800;font-size:14px}
.mt-leg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--fg-2)}
.mt-leg span{display:inline-flex;align-items:center;gap:6px}
.mt-leg i{display:inline-block;background:var(--c)}
.mt-leg i.sq{width:10px;height:10px;border-radius:3px}
.mt-leg i.ln{width:14px;height:2px;border-radius:2px}
.mt-chart{position:relative;min-width:0;border-radius:8px;outline-offset:3px}
.mt-chart:focus-visible{outline:2px solid var(--berry)}
.mt-chart svg{display:block;touch-action:pan-y}
.mt-chart .mt-grid{stroke:var(--line);stroke-width:1}
.mt-chart .mt-base{stroke:var(--line-2);stroke-width:1}
.mt-chart .mt-tick{fill:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}
.mt-chart .mt-lbl{fill:var(--fg-2);font-size:12px;font-weight:700}
.mt-chart .mt-hover{fill:var(--fg);opacity:.06}
.mt-chart .mt-cross{fill:var(--fg-2);opacity:.5}
.mt-chart .mt-dot{stroke:var(--surface);stroke-width:2}
.mt-tip{position:absolute;z-index:3;pointer-events:none;background:var(--bg);border:1px solid var(--line-2);border-radius:10px;padding:8px 10px;box-shadow:var(--shadow-sm);font-size:12px;min-width:120px;max-width:230px;display:grid;gap:3px}
.mt-tip-h{color:var(--muted);font-weight:700;margin-bottom:2px}
.mt-tip-f{display:grid;grid-template-columns:12px auto 1fr;align-items:center;gap:6px;white-space:nowrap}
.mt-tip-f i{width:12px;height:2px;border-radius:2px;background:var(--c,transparent)}
.mt-tip-f strong{font-variant-numeric:tabular-nums;color:var(--fg)}
.mt-tip-f span{color:var(--fg-2);overflow:hidden;text-overflow:ellipsis}
.mt-tip-t{border-top:1px solid var(--line);padding-top:3px}
.mt-tabla summary{cursor:pointer;font-size:12px;color:var(--muted);font-weight:700}
.mt-tabla .table-wrap{margin-top:6px;max-height:260px;overflow:auto}
.mt-tabla table{font-size:12px}
.mt-tabla .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.mt-tabla table.table{min-width:0}
.mt-vacio{display:flex;align-items:center;gap:10px;min-height:120px;justify-content:center;color:var(--muted);font-size:13px;text-align:center;border:1px dashed var(--line-2);border-radius:10px;padding:14px}
.mt-vacio .ico{flex:none;width:18px;height:18px}
@media(max-width:520px){.mt-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.mt-stat{padding:12px}.mt-stat .v{font-size:20px}.mt-fig{padding:10px 8px 6px}}
`;
  document.head.appendChild(st);
})();
