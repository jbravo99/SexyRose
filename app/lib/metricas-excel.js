// Admin → Métricas → Exportar (16/11/2026, decisión de Juan): el período elegido en una planilla de Excel.
// Una hoja por sección con los mismos números que la pantalla: filas = tramos (día, semana o mes), columnas = las series
// de los gráficos y los indicadores de esa sección, con la unidad en el encabezado. Primera hoja "Resumen": período,
// granularidad, fecha de generación y los indicadores (período vs. período anterior). Ver FASE1-CONTRATO.md.
import { crearXlsx } from './xlsx.js';
import { NOMBRE_ORIGEN, ORIGENES, TZ } from './metricas.js';

const B = (v) => ({ v, b: true });
const ent = (v) => (v == null ? null : { v: Number(v) || 0, f: 'entero' });
const dec = (v) => (v == null ? null : { v: Math.round((Number(v) || 0) * 100) / 100, f: 'decimal' });
const pct = (v) => (v == null ? null : { v: Math.round(v * 10000) / 10000, f: 'pct' }); // fracción
const fechaHora = (iso) => new Date(iso).toLocaleString('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const diaAr = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD en hora Argentina

export const NOMBRE_GRAN = { dia: 'Por día', semana: 'Por semana (de lunes a domingo)', mes: 'Por mes' };
const COL_TRAMO = { dia: 'Día', semana: 'Semana (desde el lunes)', mes: 'Mes' };

// Nombre del archivo: sexyrose-metricas-30d-2026-11-16.xlsx (fecha argentina de generación)
export const nombreArchivo = (d) => `sexyrose-metricas-${d.periodo}-${diaAr(d.generado)}.xlsx`;

/* Hoja de series: [{ titulo, serie, fmt, total? }] → encabezado, una fila por tramo, fila Total y notas.
   sinMedir: índice del primer tramo medido (antes, celdas vacías: no se midió). */
function hojaSeries(nombre, d, cols, { notas = [], sinMedir = 0, extra = [] } = {}) {
  const T = d.tramos;
  const filas = [[B(COL_TRAMO[d.granularidad]), ...cols.map((c) => B(c.titulo))]];
  T.forEach((t, i) => filas.push([{ fecha: t }, ...cols.map((c) => (i < sinMedir && c.medido ? null : c.fmt(c.serie[i])))]));
  filas.push([B('Total del período'), ...cols.map((c) => {
    if (c.total === null) return null;
    const v = c.total !== undefined ? c.total : c.serie.reduce((a, x) => a + (x || 0), 0);
    const cel = c.fmt(v); return cel && cel.f !== 'pct' ? { ...cel, b: true } : cel;
  })]);
  filas.push([]);
  filas.push([`El último tramo (${T.length ? T[T.length - 1].split('-').reverse().join('/') : ''}) está en curso: termina en el momento de generar el archivo.`]);
  for (const n of notas) filas.push([n]);
  for (const f of extra) filas.push(f);
  return { nombre, filas, anchos: [24, ...cols.map((c) => Math.max(14, Math.min(34, c.titulo.length + 2)))], fijarFilas: 1 };
}

export function libroMetricas(d) {
  const I = d.ingresos, A = d.acompanantes, K = d.creditos, N = d.interesados, F = d.trafico;
  const T = d.tramos;
  const comparable = F.comparable;
  // Variación: (actual − anterior) ÷ anterior; vacía si el anterior es 0 o no se puede comparar
  const filaInd = (sec, nombre, unidad, m, { fmt = ent, sinAnterior = false } = {}) => {
    const ant = sinAnterior || m.anterior == null ? null : m.anterior;
    const varia = ant ? (m.total - ant) / ant : null;
    return [sec, nombre, unidad, fmt(m.total), ant == null ? null : fmt(ant), pct(varia)];
  };
  const foto = (sec, nombre, unidad, v) => [sec, nombre, unidad, ent(v), null, null];
  const clics = { total: F.whatsapp.total + F.telegram.total, anterior: F.whatsapp.anterior + F.telegram.anterior };
  const tasa = (c, v) => (v ? c / v : null);
  const O = F.origenes;

  const resumen = {
    nombre: 'Resumen',
    anchos: [26, 40, 14, 16, 18, 16],
    filas: [
      [B('SexyRose — Métricas')],
      [],
      ['Período', d.nombre],
      ['Desde', { fecha: T[0] }],
      ['Hasta', { fecha: F.dias.hasta }, '(hasta el momento de generar el archivo)'],
      ['Período anterior (para comparar)', `Desde el ${fechaHora(d.anteriorDesde)} hasta el ${fechaHora(d.desde)}`],
      ['Granularidad', NOMBRE_GRAN[d.granularidad]],
      ['Generado', `${fechaHora(d.generado)} (hora Argentina)`],
      [],
      [B('Sección'), B('Indicador'), B('Unidad'), B('Período'), B('Período anterior'), B('Variación (%)')],
      filaInd('Ingresos', 'Créditos vendidos', 'USD', I.creditosUsd, { fmt: dec }),
      filaInd('Ingresos', 'Pedidos de créditos confirmados', 'cantidad', I.pedidos),
      filaInd('Ingresos', 'Venta de contenido', 'ARS', I.contenido.monto, { fmt: dec }),
      filaInd('Ingresos', 'Comisión de SexyRose', 'ARS', I.contenido.comision, { fmt: dec }),
      filaInd('Ingresos', 'Ventas de contenido', 'cantidad', I.contenido.ventas),
      filaInd('Acompañantes', 'Registros nuevos', 'cantidad', A.registros),
      filaInd('Acompañantes', 'Verificadas nuevas', 'cantidad', A.verificadas),
      foto('Acompañantes', 'Publicadas ahora', 'cantidad', A.ahora.publicadas),
      foto('Acompañantes', 'Verificadas ahora', 'cantidad', A.ahora.verificadas),
      foto('Acompañantes', 'Cuentas activas ahora', 'cantidad', A.ahora.activas),
      filaInd('Créditos y renovaciones', 'Créditos gastados', 'créditos', K.gastados, { fmt: dec }),
      filaInd('Créditos y renovaciones', 'Renovaciones automáticas', 'cantidad', K.renovaciones),
      filaInd('Créditos y renovaciones', 'Bajas de plan al renovar', 'cantidad', K.bajasAlRenovar),
      filaInd('Créditos y renovaciones', 'Pausas por falta de saldo', 'cantidad', K.pausas),
      foto('Créditos y renovaciones', 'Siguen en pausa ahora', 'cantidad', K.pausadasAhora),
      filaInd('Créditos y renovaciones', 'Planes terminados', 'cantidad', K.terminados),
      filaInd('Interesados y contenido', 'Interesados nuevos', 'cantidad', N.registros),
      filaInd('Interesados y contenido', 'Packs vendidos', 'cantidad', N.packs),
      filaInd('Interesados y contenido', 'Pedidos personalizados', 'cantidad', N.pedidosCreados),
      filaInd('Interesados y contenido', 'Contenidos de pedidos pagados', 'cantidad', N.pedidosPagados),
      filaInd('Interesados y contenido', 'Chats nuevos con el asistente', 'cantidad', N.conversaciones),
      filaInd('Interesados y contenido', 'Mensajes al asistente', 'cantidad', N.mensajes, { sinAnterior: Boolean(N.mensajesDesde) }),
      filaInd('Tráfico', 'Páginas vistas', 'cantidad', F.sitio, { sinAnterior: !comparable }),
      filaInd('Tráfico', 'Visitas a perfiles', 'cantidad', F.vistas, { sinAnterior: !comparable }),
      filaInd('Tráfico', 'Clics en WhatsApp', 'cantidad', F.whatsapp, { sinAnterior: !comparable }),
      filaInd('Tráfico', 'Clics en Telegram', 'cantidad', F.telegram, { sinAnterior: !comparable }),
      ['Tráfico', 'Contacto (clics ÷ visitas a perfiles)', '%', pct(tasa(clics.total, F.vistas.total)), comparable ? pct(tasa(clics.anterior, F.vistas.anterior)) : null, null],
      ...ORIGENES.map((k) => filaInd('De dónde vienen las visitas', `Páginas vistas: ${NOMBRE_ORIGEN[k]}`, 'cantidad', O.paginas[k], { sinAnterior: !O.comparable })),
      filaInd('De dónde vienen las visitas', 'Páginas vistas: sin dato', 'cantidad', O.paginas.sinDato, { sinAnterior: !O.comparable }),
      [],
      ['Variación vacía: el período anterior fue 0 o no se puede comparar (todavía no se medía, o los mensajes del asistente ya se borraron).'],
      ['Los montos en ARS de la venta de contenido son pesos; los créditos vendidos son dólares pagados (USD).'],
    ],
  };

  const ingresos = hojaSeries('Ingresos', d, [
    { titulo: 'Créditos vendidos (USD)', serie: I.creditosUsd.serie, fmt: dec },
    { titulo: 'Transferidos en pesos (USD)', serie: I.porMoneda.ARS.serie, fmt: dec },
    { titulo: 'Transferidos en dólares (USD)', serie: I.porMoneda.USD.serie, fmt: dec },
    { titulo: 'Moneda sin dato (USD)', serie: I.porMoneda.sin.serie, fmt: dec },
    { titulo: 'Pedidos confirmados (cantidad)', serie: I.pedidos.serie, fmt: ent },
    { titulo: 'Venta de contenido (ARS)', serie: I.contenido.monto.serie, fmt: dec },
    { titulo: 'Comisión de SexyRose (ARS)', serie: I.contenido.comision.serie, fmt: dec },
    { titulo: 'Ventas de contenido (cantidad)', serie: I.contenido.ventas.serie, fmt: ent },
  ], { notas: [
    'Créditos vendidos: pedidos confirmados, en dólares pagados, por fecha de confirmación. Moneda: la que eligió con el asistente de WhatsApp.',
    'Venta de contenido: ventas aprobadas por Mercado Pago (packs y pedidos personalizados), en pesos, por fecha de pago.',
    ...(I.cotizacionHoy ? [`Cotización de hoy (referencia): ${I.cotizacionHoy} ARS por USD.`] : []),
  ] });

  const nTr = T.length;
  const acomp = hojaSeries('Acompañantes', d, [
    { titulo: 'Registros (cantidad)', serie: A.registros.serie, fmt: ent },
    { titulo: 'Verificadas (cantidad)', serie: A.verificadas.serie, fmt: ent },
    { titulo: 'Con plan Plata al cierre (cantidad)', serie: A.planesPagos.D, fmt: ent, total: null },
    { titulo: 'Con plan Oro al cierre (cantidad)', serie: A.planesPagos.C, fmt: ent, total: null },
    { titulo: 'Con plan Star al cierre (cantidad)', serie: A.planesPagos.S, fmt: ent, total: null },
  ], { notas: ['Planes al cierre: cuentas con ese plan vigente al cierre de cada tramo (el último, ahora); no se suman.'],
    extra: [[], [B('Perfiles publicados por plan (ahora)'), B('Cantidad')],
      ...[['E', 'Bronce'], ['D', 'Plata'], ['C', 'Oro'], ['S', 'Star']].map(([k, nm]) => [nm, ent(A.porPlan[k] || 0)]),
      [], [B('Ahora'), B('Cantidad')], ['Cuentas activas', ent(A.ahora.activas)], ['Verificadas', ent(A.ahora.verificadas)], ['Publicadas', ent(A.ahora.publicadas)]] });

  const NG = { renovacion_plan: 'Planes', semana: 'Semanas', subida_temporal: 'Subidas de plan', destacado: 'Destacados', comision_venta: 'Comisión de ventas' };
  const creditos = hojaSeries('Créditos y renovaciones', d, [
    { titulo: 'Créditos gastados (créditos)', serie: K.gastados.serie, fmt: dec },
    ...Object.keys(NG).map((k) => ({ titulo: `${NG[k]} (créditos)`, serie: K.porTipo[k].serie, fmt: dec })),
    { titulo: 'Renovaciones automáticas (cantidad)', serie: K.renovaciones.serie, fmt: ent },
    { titulo: 'Bajas de plan al renovar (cantidad)', serie: K.bajasAlRenovar.serie, fmt: ent },
    { titulo: 'Pausas por falta de saldo (cantidad)', serie: K.pausas.serie, fmt: ent },
    { titulo: 'Planes terminados (cantidad)', serie: K.terminados.serie, fmt: ent },
  ], { notas: [`Siguen en pausa ahora: ${K.pausadasAhora}.`, 'Créditos gastados: neto de devoluciones; no incluye los ajustes a mano del admin.'] });

  const interes = hojaSeries('Interesados y contenido', d, [
    { titulo: 'Interesados nuevos (cantidad)', serie: N.registros.serie, fmt: ent },
    { titulo: 'Pedidos personalizados (cantidad)', serie: N.pedidosCreados.serie, fmt: ent },
    { titulo: 'Packs vendidos (cantidad)', serie: N.packs.serie, fmt: ent },
    { titulo: 'Contenidos de pedidos pagados (cantidad)', serie: N.pedidosPagados.serie, fmt: ent },
    { titulo: 'Chats nuevos con el asistente (cantidad)', serie: N.conversaciones.serie, fmt: ent },
    { titulo: 'Mensajes al asistente (cantidad)', serie: N.mensajes.serie, fmt: ent },
  ], { notas: N.mensajesDesde ? [`Los mensajes del asistente se borran a los 90 días: cuentan desde el ${fechaHora(N.mensajesDesde)}.`] : [] });

  // Tráfico: antes del primer día medido, celdas vacías (no se medía; no son ceros)
  let sdh = 0; if (F.desdeMedicion) T.forEach((t, i) => { if (t <= F.desdeMedicion) sdh = i; });
  if (!F.desdeMedicion) sdh = nTr;
  const contactoSerie = F.vistas.serie.map((v, i) => tasa(F.whatsapp.serie[i] + F.telegram.serie[i], v));
  const trafico = hojaSeries('Tráfico', d, [
    { titulo: 'Páginas vistas (cantidad)', serie: F.sitio.serie, fmt: ent, medido: true },
    { titulo: 'Visitas a perfiles (cantidad)', serie: F.vistas.serie, fmt: ent, medido: true },
    { titulo: 'Clics en WhatsApp (cantidad)', serie: F.whatsapp.serie, fmt: ent, medido: true },
    { titulo: 'Clics en Telegram (cantidad)', serie: F.telegram.serie, fmt: ent, medido: true },
    { titulo: 'Contacto (%)', serie: contactoSerie, fmt: pct, total: tasa(clics.total, F.vistas.total), medido: true },
  ], { sinMedir: sdh, notas: [
    F.desdeMedicion ? `Se mide desde el ${F.desdeMedicion.split('-').reverse().join('/')}: antes, las celdas quedan vacías (no son ceros).` : 'Todavía no se midió nada.',
    'Contacto = clics en WhatsApp y Telegram ÷ visitas a perfiles. Sin datos personales: solo totales por día.',
  ] });

  const origenCols = (o, que) => [...ORIGENES.map((k) => ({ titulo: `${que}: ${NOMBRE_ORIGEN[k]} (cantidad)`, serie: o[k].serie, fmt: ent, medido: true })),
    { titulo: `${que}: sin dato (cantidad)`, serie: o.sinDato.serie, fmt: ent, medido: true }];
  const origenes = hojaSeries('De dónde vienen', d, [...origenCols(O.paginas, 'Páginas vistas'), ...origenCols(O.perfiles, 'Visitas a perfiles')], {
    sinMedir: sdh, notas: [
      'Categoría de llegada de cada pestaña del navegador: Google y buscadores, Redes, WhatsApp y Telegram, Otros sitios o Directo (sin sitio de origen). La navegación dentro del sitio no cambia el origen.',
      O.desde ? `El origen se mide desde el ${O.desde.split('-').reverse().join('/')}. "Sin dato": visitas de antes o sin origen conocido.` : 'Todavía no se midió el origen: todo figura como "sin dato".',
    ] });

  const top = (nombre, items) => ({
    nombre,
    anchos: [6, 30, 30, 18, 18, 18, 18, 16],
    fijarFilas: 1,
    filas: [
      [B('#'), B('Perfil'), B('Dirección'), B('Visitas (cantidad)'), B('WhatsApp (cantidad)'), B('Telegram (cantidad)'), B('Clics (cantidad)'), B('Contacto (%)')],
      ...items.map((x, i) => [ent(i + 1), x.nombre || x.slug || 'Sin nombre', x.slug ? `/perfil/${x.slug}` : '', ent(x.vistas), ent(x.whatsapp), ent(x.telegram), ent(x.clics), pct(tasa(x.clics, x.vistas))]),
      ...(items.length ? [] : [['', 'Sin datos en este período.']]),
    ],
  });

  return [resumen, ingresos, acomp, creditos, interes, trafico, origenes, top('Top 10 por visitas', F.topVistas), top('Top 10 por clics', F.topClics)];
}

export function excelMetricas(d) {
  return crearXlsx(libroMetricas(d), { fecha: new Date(d.generado) });
}
