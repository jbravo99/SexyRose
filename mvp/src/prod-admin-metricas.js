/* ============================================================
   SexyRose — prod-admin-metricas.js (panel de administración real, 16/11/2026)
   Admin → Métricas (grupo General, debajo de Resumen): los KPIs del sitio con gráficos (decisión de Juan: "En general
   quiero poder visualizar los KPIs con gráficos en lo posible"). Ingresos, Acompañantes, Uso de créditos y
   renovaciones, Interesados y contenido, y Tráfico (contadores sin datos personales). Período 7 d / 30 d / 90 d / 12 m
   en la dirección (#admin.metricas.30d). Una sola consulta: GET ${API}/metricas?periodo=… (app/routes/admin-metricas.js).
   Gráficos propios en SVG (graficos.js, compartido con Mis números del panel de la acompañante; sin bibliotecas ni CDN),
   dibujados al ancho real de su caja; tooltip con mouse y teclado, leyenda y tabla con los mismos números.
   Exportar: el período en una planilla de Excel (GET ${API}/metricas/exportar?periodo=…, app/lib/metricas-excel.js).
   ============================================================ */
(function () {
  'use strict';
  if (window.HH_PROD !== 'admin' || !HH.pa) return;
  const esc = HH.esc, icon = HH.icon;
  const P = HH.pa;
  const { layout, head } = P;

  /* ---------- Menú: General → Métricas, debajo de Resumen ---------- */
  const PERS = [['7d', '7 días'], ['30d', '30 días'], ['90d', '90 días'], ['12m', '12 meses']];
  const M = { per: '30d', d: {}, loading: {}, err: {} };
  if (!HH.adminTabs.some((t) => t.id === 'metricas')) {
    const i = HH.adminTabs.findIndex((t) => t.id === 'resumen');
    HH.adminTabs.splice(i >= 0 ? i + 1 : 0, 0, { id: 'metricas', label: 'Métricas', icon: 'activity' });
  }
  const general = (HH.adminMenu || []).find((g) => g.grupo === 'General');
  if (general && !general.tabs.some((t) => t.id === 'metricas')) {
    general.tabs.push({ id: 'metricas', label: 'Métricas', icon: 'activity', get go() { return '#admin.metricas.' + M.per; } });
  }

  const enVista = () => /^admin\.metricas/.test((HH.current && HH.current.path) || '');
  function cargar(per, force) {
    if (M.loading[per] || (M.d[per] && !force)) return;
    M.loading[per] = true; M.err[per] = null;
    HH.api('GET', '/metricas?periodo=' + encodeURIComponent(per))
      .then((d) => { M.d[per] = d; })
      .catch((e) => { M.err[per] = e.message; if (force && M.d[per]) HH.toast(e.message, { type: 'danger' }); })
      .finally(() => { M.loading[per] = false; if (enVista()) HH.refresh(); });
  }

  /* ---------- Formato, tiles y gráficos: graficos.js (compartido con Mis números del panel de la acompañante) ---------- */
  const G = HH.graficos;
  const { nf, entero, usd, ars, pct, parte, dm, C, GRIS, tile, tileM, delta, grafico } = G;
  const API = location.pathname.replace(/\/+$/, '') + '/api';
  const DL = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>';
  const fechaAr = (iso) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' });

  /* ---------- Piezas ---------- */
  const seccion = (id, titulo, que, cuerpo) => `<section class="card mt-sec" aria-labelledby="${id}">
      <div class="mt-sec-h"><h3 id="${id}">${titulo}</h3></div>
      <details class="mt-que"><summary>${icon('info')} ¿Qué cuenta?</summary><ul>${que.map((q) => `<li>${q}</li>`).join('')}</ul></details>
      ${cuerpo}
    </section>`;
  const tiles = (arr) => `<div class="mt-tiles">${arr.join('')}</div>`;
  const grilla = (arr) => `<div class="mt-grid2">${arr.join('')}</div>`;
  const suma = (a) => a.reduce((x, v) => x + (v || 0), 0);
  // Barras horizontales en el orden natural de los planes, un solo color (parte de un todo)
  function barrasPlan(porPlan, total) {
    const filas = [['E', 'Bronce'], ['D', 'Plata'], ['C', 'Oro'], ['S', 'Star']];
    if (!total) return `<figure class="mt-fig"><figcaption class="mt-ft">Perfiles publicados por plan (ahora)</figcaption><div class="mt-vacio">${icon('activity')}<span>No hay perfiles publicados.</span></div></figure>`;
    return `<figure class="mt-fig"><figcaption class="mt-ft">Perfiles publicados por plan (ahora)</figcaption>
      <ul class="mt-meter" aria-label="Perfiles publicados por plan">${filas.map(([k, nm]) => {
        const v = porPlan[k] || 0; const p = (v / total) * 100;
        return `<li><span class="mt-mn">${nm}</span><span class="mt-mb" aria-hidden="true"><span style="width:${v ? Math.max(1.5, p) : 0}%"></span></span><span class="mt-mv">${entero(v)} <span class="muted">· ${pct(p)}</span></span></li>`;
      }).join('')}</ul></figure>`;
  }
  function topTabla(titulo, items, por) {
    if (!items.length) return `<figure class="mt-fig"><figcaption class="mt-ft">${titulo}</figcaption><div class="mt-vacio">${icon('activity')}<span>Todavía no hay ${por === 'vistas' ? 'visitas' : 'clics'} en este período.</span></div></figure>`;
    const tasa = (x) => (x.vistas ? pct((x.clics / x.vistas) * 100) : '—');
    return `<figure class="mt-fig"><figcaption class="mt-ft">${titulo}</figcaption><div class="table-wrap"><table class="table mt-top">
      <thead><tr><th scope="col">#</th><th scope="col">Perfil</th><th scope="col" class="num">Visitas</th><th scope="col" class="num"><span class="mt-l">WhatsApp</span><abbr class="mt-c" title="WhatsApp">WA</abbr></th><th scope="col" class="num"><span class="mt-l">Telegram</span><abbr class="mt-c" title="Telegram">TG</abbr></th><th scope="col" class="num"><span class="mt-l">Contacto</span><abbr class="mt-c" title="Contacto: clics ÷ visitas">%</abbr></th></tr></thead>
      <tbody>${items.map((x, i) => {
        const go = '#admin.acompanantes.' + encodeURIComponent(x.cuentaId);
        return `<tr><td class="muted">${i + 1}</td><td><a href="${go}" data-go="${go}" data-noi18n>${esc(x.nombre || x.slug || 'Sin nombre')}</a>${x.slug ? `<div class="tiny muted mt-l">/perfil/${esc(x.slug)}</div>` : ''}</td><td class="num">${entero(x.vistas)}</td><td class="num">${entero(x.whatsapp)}</td><td class="num">${entero(x.telegram)}</td><td class="num">${tasa(x)}</td></tr>`;
      }).join('')}</tbody></table></div></figure>`;
  }

  /* De dónde vienen las visitas: columnas apiladas por categoría (páginas vistas de todo el sitio) y un tile por
     categoría con el total del período (y cuántas de esas fueron visitas a perfiles). "Sin dato" en gris. */
  const ORIGENES = [['buscadores', 'Google y buscadores'], ['redes', 'Redes'], ['mensajeria', 'WhatsApp y Telegram'], ['otros', 'Otros sitios'], ['directo', 'Directo']];
  function origenes(F, T, g, sdh) {
    const O = F.origenes;
    if (!O) return '';
    const Pg = O.paginas, Pf = O.perfiles;
    const series = ORIGENES.map(([k, nm], i) => ({ nombre: nm, datos: Pg[k].serie, color: C[i] })).concat([{ nombre: 'Sin dato', datos: Pg.sinDato.serie, color: GRIS }]);
    const nota = O.desde ? `Origen medido desde el ${dm(O.desde)}/${parte(O.desde).y}` : 'Todavía no se midió el origen';
    const t = (nm, m, mp) => (O.comparable ? tileM(nm, m, entero, null, `${entero(mp.total)} a perfiles · antes ${entero(m.anterior)}`) : tile(nm, entero(m.total), null, `${entero(mp.total)} a perfiles`));
    return `<div class="mt-origen"><h4 class="mt-sub">De dónde vienen las visitas</h4>
      ${tiles(ORIGENES.map(([k, nm]) => t(nm, Pg[k], Pf[k])).concat([tile('Sin dato', entero(Pg.sinDato.total), null, `${entero(Pf.sinDato.total)} a perfiles · ${nota}`)]))}
      ${grafico({ titulo: 'De dónde vienen las visitas (páginas vistas)', tipo: 'columnas', series, tramos: T, gran: g, sinDatosHasta: sdh,
        resumen: series.map((s) => `${s.nombre}: ${entero(suma(s.datos))}`).join('; ') + `. ${nota}.`,
        vacioTxt: 'Todavía no hay visitas registradas en este período.' })}</div>`;
  }

  /* ---------- Vista ---------- */
  function vMetricas(perArg) {
    if (perArg && PERS.some(([k]) => k === perArg)) M.per = perArg;
    const per = M.per;
    cargar(per);
    G.reset();
    // Mientras carga otro período, queda el anterior atenuado (sin saltos)
    const d = M.d[per] || M.ultimo || null;
    const cargando = !M.d[per] && M.loading[per];
    const selector = `<nav class="pa-subtabs mt-per" aria-label="Período">${PERS.map(([k, l]) => `<a href="#admin.metricas.${k}" data-go="#admin.metricas.${k}"${k === per ? ' class="on" aria-current="page"' : ''}><span class="pa-subtabs-l">${l}</span></a>`).join('')}</nav>`;
    // Exportar: descarga el .xlsx del período elegido (mismo Basic Auth del panel; el servidor arma la planilla)
    const right = `<div class="row" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn ghost sm" data-action="mtRecargar">${icon('refresh')} Actualizar</button><a class="btn secondary sm" href="${esc(API)}/metricas/exportar?periodo=${encodeURIComponent(per)}" download data-noi18n>${DL} Exportar</a></div>`;
    let cuerpo;
    if (!d && M.err[per]) cuerpo = `<div class="card"><div class="empty">${icon('alert')}<h4>No se pudo cargar</h4><p class="small">${esc(M.err[per])}</p><button type="button" class="btn secondary sm" data-action="mtRecargar">${icon('refresh')} Reintentar</button></div></div>`;
    else if (!d) cuerpo = P.loadingCard(3);
    else cuerpo = `<div class="stack mt-cuerpo${cargando ? ' mt-cargando' : ''}" style="gap:16px"${cargando ? ' aria-busy="true"' : ''}>${secciones(d)}</div>`;
    if (M.d[per]) M.ultimo = M.d[per];
    const sub = d && M.d[per]
      ? `Del ${fechaAr(d.desde)} al ${fechaAr(d.hasta)} (hasta ahora), ${d.granularidad === 'dia' ? 'por día' : d.granularidad === 'semana' ? 'por semana (de lunes a domingo)' : 'por mes'}. Cada número se compara con el mismo tiempo justo antes.`
      : 'Cargando el período…';
    return layout('metricas', `${head('Métricas', right, sub)}${selector}${cuerpo}`);
  }

  function secciones(d) {
    const T = d.tramos, g = d.granularidad;
    const I = d.ingresos, A = d.acompanantes, K = d.creditos, N = d.interesados, F = d.trafico;
    const gr = (o) => grafico({ tramos: T, gran: g, ...o });

    const refArs = I.cotizacionHoy && I.creditosUsd.total ? `≈ ${ars(I.creditosUsd.total * I.cotizacionHoy)} a la cotización de hoy (referencia)` : null;
    const ingresos = seccion('mtIng', 'Ingresos', [
      '<strong>Créditos vendidos</strong>: pedidos de créditos confirmados, en dólares pagados (no los créditos de regalo), según la fecha en que los confirmaste.',
      '<strong>Moneda de transferencia</strong>: la que eligió con el asistente de WhatsApp (pesos o dólares). «Sin dato» si no se le preguntó.',
      'Los pedidos no guardan los pesos transferidos: el equivalente en pesos usa la cotización de hoy y es solo una referencia.',
      '<strong>Venta de contenido</strong>: ventas aprobadas por Mercado Pago (packs y pedidos personalizados), en pesos, por fecha de pago. La comisión es la parte de SexyRose. Las reembolsadas no cuentan.',
    ], tiles([
      tileM('Créditos vendidos', I.creditosUsd, usd, 'arriba', refArs),
      tileM('Pedidos confirmados', I.pedidos, entero, 'arriba'),
      tileM('Venta de contenido', I.contenido.monto, ars, 'arriba', `${entero(I.contenido.ventas.total)} ${HH.plural(I.contenido.ventas.total, 'venta', 'ventas')} · antes ${ars(I.contenido.monto.anterior)}`),
      tileM('Comisión de SexyRose', I.contenido.comision, ars, 'arriba'),
    ]) + grilla([
      gr({ titulo: 'Créditos vendidos por moneda de transferencia (US$)', tipo: 'columnas', fmt: usd,
        series: [{ nombre: 'Pesos', datos: I.porMoneda.ARS.serie, color: C[0] }, { nombre: 'Dólares', datos: I.porMoneda.USD.serie, color: C[1] }, { nombre: 'Sin dato', datos: I.porMoneda.sin.serie, color: GRIS }],
        resumen: `Total ${usd(I.creditosUsd.total)}: ${usd(I.porMoneda.ARS.total)} transferidos en pesos, ${usd(I.porMoneda.USD.total)} en dólares y ${usd(I.porMoneda.sin.total)} sin dato.`,
        vacioTxt: 'Todavía no hay pedidos de créditos confirmados en este período.' }),
      gr({ titulo: 'Comisión por venta de contenido ($)', tipo: 'columnas', fmt: ars,
        series: [{ nombre: 'Comisión', datos: I.contenido.comision.serie, color: C[0] }],
        resumen: `Comisión total ${ars(I.contenido.comision.total)} sobre ${ars(I.contenido.monto.total)} vendidos.`,
        vacioTxt: 'Todavía no hay ventas de contenido aprobadas en este período.' }),
    ]));

    const ah = A.ahora;
    const pagos = ['D', 'C', 'S'].map((k) => A.planesPagos[k][T.length - 1] || 0);
    const acomp = seccion('mtAco', 'Acompañantes', [
      '<strong>Registros</strong>: cuentas de acompañantes creadas en el período (las cuentas borradas ya no aparecen).',
      '<strong>Verificadas</strong>: cuentas cuya identidad aprobaste por primera vez en el período.',
      '<strong>Publicadas ahora</strong>: foto de hoy (incluye las publicadas que todavía tienen plazo para verificarse). No hay historial exacto de cuándo un perfil dejó de publicarse, así que no se dibuja una curva inventada.',
      '<strong>Por plan</strong>: plan vigente de cada perfil publicado ahora (sin plan pago = Bronce).',
      '<strong>Cuentas con plan pago</strong>: Plata, Oro o Star vigente al cierre de cada tramo (el último, ahora), según las suscripciones. Las canceladas a mano no cuentan porque no se guarda cuándo se cancelaron.',
    ], tiles([
      tileM('Registros nuevos', A.registros, entero, 'arriba'),
      tileM('Verificadas nuevas', A.verificadas, entero, 'arriba'),
      tile('Publicadas ahora', entero(ah.publicadas), `de ${entero(ah.activas)} ${HH.plural(ah.activas, 'cuenta activa', 'cuentas activas')}`),
      tile('Verificadas ahora', entero(ah.verificadas), 'cuentas activas con identidad aprobada'),
    ]) + grilla([
      gr({ titulo: 'Registros y verificaciones', tipo: 'lineas',
        series: [{ nombre: 'Registros', datos: A.registros.serie, color: C[0] }, { nombre: 'Verificadas', datos: A.verificadas.serie, color: C[1] }],
        resumen: `${entero(A.registros.total)} registros y ${entero(A.verificadas.total)} verificaciones en el período.`,
        vacioTxt: 'Todavía no hay registros ni verificaciones en este período.' }),
      barrasPlan(A.porPlan, ah.publicadas),
      gr({ titulo: 'Cuentas con plan pago al cierre de cada tramo', tipo: 'columnas',
        series: [{ nombre: 'Plata', datos: A.planesPagos.D, color: C[0] }, { nombre: 'Oro', datos: A.planesPagos.C, color: C[1] }, { nombre: 'Star', datos: A.planesPagos.S, color: C[2] }],
        resumen: `Ahora: ${pagos[0]} Plata, ${pagos[1]} Oro y ${pagos[2]} Star.`,
        vacioTxt: 'Ninguna cuenta tuvo un plan pago en este período.' }),
    ]));

    const NOMBRE_GASTO = { renovacion_plan: 'Planes', semana: 'Semanas', subida_temporal: 'Subidas de plan', destacado: 'Destacados', comision_venta: 'Comisión de ventas' };
    const gastoSeries = Object.keys(NOMBRE_GASTO).map((k, i) => ({ nombre: NOMBRE_GASTO[k], datos: K.porTipo[k].serie, color: C[i] }));
    const cr = (n) => nf(n % 1 ? 2 : 0).format(n) + ' cr.';
    const creditos = seccion('mtCre', 'Uso de créditos y renovaciones', [
      '<strong>Créditos gastados</strong>: lo que se descontó de los saldos por planes (compra y renovación), semanas, subidas de plan, Destacados y comisión de ventas, menos las devoluciones. No cuenta los ajustes a mano del admin.',
      '<strong>Renovaciones automáticas</strong>: planes renovados solos con créditos, incluidos los que se renovaron al cargar créditos después de una pausa.',
      '<strong>Bajas de plan al renovar</strong>: renovaciones automáticas que pasaron al plan más bajo que la acompañante había programado.',
      '<strong>Pausas por falta de saldo</strong>: renovaciones que no se pudieron cobrar y dejaron el perfil en pausa. «Ahora» es cuántas siguen esperando créditos.',
      '<strong>Planes terminados</strong>: planes mensuales o asignados a mano que llegaron a su fin sin renovarse ni seguir con otro (pasan a Bronce o al plan que quede). No incluye las semanas sueltas ni las pausas.',
    ], tiles([
      tileM('Créditos gastados', K.gastados, cr, null),
      tileM('Renovaciones automáticas', K.renovaciones, entero, 'arriba', `${entero(K.bajasAlRenovar.total)} con baja de plan · antes ${entero(K.renovaciones.anterior)}`),
      tileM('Pausas por falta de saldo', K.pausas, entero, 'abajo', `${entero(K.pausadasAhora)} ${HH.plural(K.pausadasAhora, 'sigue', 'siguen')} en pausa ahora · antes ${entero(K.pausas.anterior)}`),
      tileM('Planes terminados', K.terminados, entero, 'abajo'),
    ]) + grilla([
      gr({ titulo: 'Créditos gastados por tipo', tipo: 'columnas', fmt: cr, series: gastoSeries,
        resumen: gastoSeries.map((s) => `${s.nombre}: ${cr(suma(s.datos))}`).join('; ') + '.',
        vacioTxt: 'Todavía no se gastaron créditos en este período.' }),
      gr({ titulo: 'Renovaciones, pausas y planes terminados', tipo: 'lineas',
        series: [{ nombre: 'Renovaciones', datos: K.renovaciones.serie, color: C[0] }, { nombre: 'Pausas', datos: K.pausas.serie, color: C[1] }, { nombre: 'Terminados', datos: K.terminados.serie, color: C[2] }],
        resumen: `${entero(K.renovaciones.total)} renovaciones automáticas, ${entero(K.pausas.total)} pausas y ${entero(K.terminados.total)} planes terminados.`,
        vacioTxt: 'Todavía no hubo renovaciones, pausas ni planes terminados en este período.' }),
    ]));

    const notaMsj = N.mensajesDesde ? `Los mensajes se borran a los 90 días: cuenta desde el ${fechaAr(N.mensajesDesde)}` : null;
    const interes = seccion('mtInt', 'Interesados y contenido', [
      '<strong>Interesados</strong>: cuentas de interesados (clientes) creadas en el período.',
      '<strong>Packs vendidos</strong> y <strong>contenidos de pedidos pagados</strong>: ventas aprobadas por Mercado Pago, por fecha de pago. Cada contenido pagado dentro de un pedido personalizado cuenta una vez.',
      '<strong>Pedidos personalizados</strong>: pedidos creados por interesados (aceptados o no).',
      '<strong>Asistente</strong>: chats nuevos de WhatsApp con el asistente y mensajes recibidos. Los mensajes se borran a los 90 días, así que para períodos más largos solo cuentan los últimos 90 días (sin comparación).',
    ], tiles([
      tileM('Interesados nuevos', N.registros, entero, 'arriba'),
      tileM('Packs vendidos', N.packs, entero, 'arriba'),
      tileM('Pedidos personalizados', N.pedidosCreados, entero, 'arriba', `${entero(N.pedidosPagados.total)} ${HH.plural(N.pedidosPagados.total, 'contenido pagado', 'contenidos pagados')} · antes ${entero(N.pedidosCreados.anterior)}`),
      tileM('Chats nuevos con el asistente', N.conversaciones, entero, null),
      notaMsj ? tile('Mensajes al asistente', entero(N.mensajes.total), null, notaMsj) : tileM('Mensajes al asistente', N.mensajes, entero, null),
    ]) + grilla([
      gr({ titulo: 'Interesados nuevos y pedidos personalizados', tipo: 'lineas',
        series: [{ nombre: 'Interesados', datos: N.registros.serie, color: C[0] }, { nombre: 'Pedidos', datos: N.pedidosCreados.serie, color: C[1] }],
        resumen: `${entero(N.registros.total)} interesados nuevos y ${entero(N.pedidosCreados.total)} pedidos personalizados.`,
        vacioTxt: 'Todavía no hay interesados ni pedidos en este período.' }),
      gr({ titulo: 'Ventas de contenido (cantidad)', tipo: 'columnas',
        series: [{ nombre: 'Packs', datos: N.packs.serie, color: C[0] }, { nombre: 'Contenidos de pedidos', datos: N.pedidosPagados.serie, color: C[1] }],
        resumen: `${entero(N.packs.total)} packs y ${entero(N.pedidosPagados.total)} contenidos de pedidos pagados.`,
        vacioTxt: 'Todavía no hay ventas de contenido en este período.' }),
      gr({ titulo: 'Chats nuevos con el asistente', tipo: 'columnas',
        series: [{ nombre: 'Chats nuevos', datos: N.conversaciones.serie, color: C[0] }],
        resumen: `${entero(N.conversaciones.total)} chats nuevos.`,
        vacioTxt: 'Todavía no hay chats nuevos con el asistente en este período.' }),
    ]));

    const clics = { total: F.whatsapp.total + F.telegram.total, anterior: F.whatsapp.anterior + F.telegram.anterior };
    // Antes del primer día medido no hay datos (no son ceros): esos tramos van vacíos y, si el período anterior no se
    // midió entero, no se compara.
    const ini = F.desdeMedicion;
    let sdh = 0; if (ini) { T.forEach((t, i) => { if (t <= ini) sdh = i; }); }
    const notaIni = ini ? `Se mide desde el ${dm(ini)}/${parte(ini).y}` : 'Todavía no se midió nada';
    const tileF = (k, mm, fmt) => (F.comparable ? tileM(k, mm, fmt, 'arriba') : tile(k, fmt(mm.total), null, notaIni + ': sin comparación'));
    const tasa = (c, v) => (v ? (c / v) * 100 : 0);
    const tasaCur = tasa(clics.total, F.vistas.total), tasaAnt = tasa(clics.anterior, F.vistas.anterior);
    const trafico = seccion('mtTra', 'Tráfico', [
      '<strong>Páginas vistas</strong>: inicio, páginas de país y de lugar y perfiles del sitio real. No cuenta la demo, el panel de la acompañante, el admin ni buscadores u otros robots.',
      '<strong>Visitas a perfiles</strong>: una por perfil y por pestaña del navegador (recargar no suma). No cuenta cuando la acompañante mira su propio perfil.',
      '<strong>Clics</strong>: toques en los botones de WhatsApp y Telegram de un perfil. <strong>Contacto</strong> = clics ÷ visitas a perfiles.',
      'Sin datos personales: solo se guardan totales por día (sin IP, navegador ni cookies). Se cuenta desde que se activó la medición.',
      '<strong>De dónde vienen las visitas</strong>: cómo llegó cada pestaña del navegador al sitio (la primera vez): Google y buscadores, Redes (Instagram, Facebook, X, TikTok, Reddit…), WhatsApp y Telegram, Otros sitios o Directo (sin sitio de origen: link escrito, favoritos, apps que no lo informan). Si el link trae utm_source, manda ese dato. La navegación dentro del sitio no cambia el origen. Solo se guarda la categoría, nunca la dirección de donde vino. <strong>Sin dato</strong>: visitas de antes de medir el origen o sin origen conocido. Las acompañantes no ven esto.',
    ], tiles([
      tileF('Páginas vistas', F.sitio, entero),
      tileF('Visitas a perfiles', F.vistas, entero),
      tileF('Clics en WhatsApp', F.whatsapp, entero),
      tileF('Clics en Telegram', F.telegram, entero),
      tile('Contacto', F.vistas.total ? pct(tasaCur) : '—', F.comparable && F.vistas.total && F.vistas.anterior ? delta(tasaCur, tasaAnt, 'arriba', true) : '', F.comparable ? `Antes: ${F.vistas.anterior ? pct(tasaAnt) : '—'}` : 'clics ÷ visitas a perfiles'),
    ]) + grilla([
      gr({ titulo: 'Páginas vistas y visitas a perfiles', tipo: 'lineas',
        series: [{ nombre: 'Páginas vistas', datos: F.sitio.serie, color: C[0] }, { nombre: 'Visitas a perfiles', datos: F.vistas.serie, color: C[1] }],
        resumen: `${entero(F.sitio.total)} páginas vistas y ${entero(F.vistas.total)} visitas a perfiles. ${notaIni}.`, sinDatosHasta: sdh,
        vacioTxt: 'Todavía no hay visitas registradas en este período.' }),
      gr({ titulo: 'Clics de contacto', tipo: 'columnas',
        series: [{ nombre: 'WhatsApp', datos: F.whatsapp.serie, color: C[0] }, { nombre: 'Telegram', datos: F.telegram.serie, color: C[1] }],
        resumen: `${entero(F.whatsapp.total)} clics en WhatsApp y ${entero(F.telegram.total)} en Telegram. ${notaIni}.`, sinDatosHasta: sdh,
        vacioTxt: 'Todavía no hay clics de contacto en este período.' }),
    ]) + origenes(F, T, g, sdh) + `<div class="mt-tops">${topTabla('Top 10 perfiles por visitas', F.topVistas, 'vistas')}${topTabla('Top 10 perfiles por clics', F.topClics, 'clics')}</div>`);

    return ingresos + acomp + creditos + interes + trafico;
  }

  HH.adminViews.metricas = () => vMetricas(null);
  HH.route('admin.metricas.:per', ({ per }) => (HH.requireRole('admin') ? vMetricas(per) : false));
  Object.assign(HH.actions, {
    mtRecargar() { cargar(M.per, true); HH.refresh(); },
  });

  /* ---------- Estilos ---------- */
  const st = document.createElement('style');
  st.textContent = `
.mt-per{margin:0 0 16px}
.mt-cargando{opacity:.55;transition:opacity .2s}
.mt-sec{display:grid;gap:14px;min-width:0}
.mt-sec-h h3{margin:0;font-size:18px}
.mt-que{font-size:13px;color:var(--fg-2)}
.mt-que summary{cursor:pointer;display:inline-flex;align-items:center;gap:6px;color:var(--muted);font-weight:700;list-style:none}
.mt-que summary::-webkit-details-marker{display:none}
.mt-que summary .ico{width:15px;height:15px}
.mt-que ul{margin:8px 0 0;padding-left:18px;display:grid;gap:4px;line-height:1.45}
.mt-grid2{display:grid;grid-template-columns:minmax(0,1fr);gap:14px}
@media(min-width:1100px){.mt-grid2{grid-template-columns:repeat(2,minmax(0,1fr))}}
.mt-top{font-size:12px}
.mt-top .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.mt-meter{list-style:none;margin:4px 0 0;padding:0;display:grid;gap:12px}
.mt-meter li{display:grid;grid-template-columns:64px minmax(0,1fr) auto;align-items:center;gap:10px;font-size:13px}
.mt-mn{font-weight:700}
.mt-mb{height:10px;border-radius:99px;background:var(--surface-2);overflow:hidden}
.mt-mb span{display:block;height:100%;border-radius:99px;background:${C[0]}}
.mt-mv{font-variant-numeric:tabular-nums;white-space:nowrap}
.mt-tops{display:grid;gap:14px}
.mt-origen{display:grid;gap:12px;min-width:0}
.mt-sub{margin:4px 0 0;font-size:15px}
table.table.mt-top{min-width:0}
.mt-top td,.mt-top th{padding:7px 8px}
.mt-top .mt-c{display:none;text-decoration:none}
.mt-top a{font-weight:700}
@media(max-width:520px){.mt-top .mt-l{display:none}.mt-top .mt-c{display:inline}.mt-top td,.mt-top th{padding:7px 5px}.mt-meter li{grid-template-columns:52px minmax(0,1fr) auto}}
`;
  document.head.appendChild(st);
})();
