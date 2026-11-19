// Admin → Métricas (16/11/2026, decisión de Juan). Ver FASE1-CONTRATO.md → "Admin → Métricas".
//   - Tráfico sin datos personales: el sitio avisa (POST /api/sitio/evento) y acá se suma 1 a un contador por día.
//     Nunca se guarda IP, navegador, cookie ni ningún identificador de quien mira: solo los totales del día.
//   - metricasPeriodo(): todas las series de un período (7 d, 30 d, 90 d, 12 m) para el panel, en hora Argentina.

export const TZ = 'America/Argentina/Buenos_Aires';
export const TIPOS_EVENTO = ['pagina', 'vista', 'whatsapp', 'telegram'];

/* ---------- Tráfico ---------- */

// Navegadores automáticos (buscadores, vistas previas de links, herramientas): no cuentan. Sin user agent tampoco.
const BOT_UA = /bot\b|bot\/|crawl|spider|slurp|facebookexternalhit|embedly|preview|headless|lighthouse|pagespeed|python|curl|wget|httpclient|okhttp|java\/|go-http|node-fetch|undici|axios|phantom|selenium|puppeteer|playwright|scrapy|monitor|uptime|pingdom/i;
export const esBot = (ua) => { const s = String(ua || ''); return s.length < 10 || BOT_UA.test(s); };

const HOY = `(now() AT TIME ZONE '${TZ}')::date`;

/* De dónde vienen las visitas (solo Admin → Métricas): el navegador manda una de estas categorías y nada más (nunca la
   dirección ni el dominio de donde vino). Lo clasifica mvp/src/prod-metricas.js (HH.origenTrafico). */
export const ORIGENES = ['buscadores', 'redes', 'mensajeria', 'otros', 'directo'];
export const NOMBRE_ORIGEN = { buscadores: 'Google y buscadores', redes: 'Redes', mensajeria: 'WhatsApp y Telegram', otros: 'Otros sitios', directo: 'Directo' };

// tipo: 'pagina' (solo el sitio), 'vista' (perfil + sitio), 'whatsapp' | 'telegram' (perfil). cuentaId: el perfil.
// origen: una de ORIGENES (o null si no se sabe); cuenta solo para páginas vistas y visitas a perfiles.
export async function registrarEvento(pool, tipo, cuentaId, origen = null) {
  const org = ORIGENES.includes(origen) ? origen : null;
  if (tipo === 'pagina' || tipo === 'vista') {
    await pool.query(`INSERT INTO metricas_sitio_dia (dia, vistas) VALUES (${HOY}, 1)
                      ON CONFLICT (dia) DO UPDATE SET vistas = metricas_sitio_dia.vistas + 1`);
    if (org) {
      await pool.query(`INSERT INTO metricas_origen_dia (dia, origen, vistas) VALUES (${HOY}, $1, 1)
                        ON CONFLICT (dia, origen) DO UPDATE SET vistas = metricas_origen_dia.vistas + 1`, [org]);
    }
  }
  if (tipo === 'pagina' || !cuentaId) return;
  const col = { vista: 'vistas', whatsapp: 'whatsapp', telegram: 'telegram' }[tipo];
  await pool.query(`INSERT INTO metricas_perfil_dia (cuenta_id, dia, ${col}) VALUES ($1, ${HOY}, 1)
                    ON CONFLICT (cuenta_id, dia) DO UPDATE SET ${col} = metricas_perfil_dia.${col} + 1`, [cuentaId]);
  if (tipo === 'vista' && org) {
    await pool.query(`INSERT INTO metricas_perfil_origen_dia (cuenta_id, dia, origen, vistas) VALUES ($1, ${HOY}, $2, 1)
                      ON CONFLICT (cuenta_id, dia, origen) DO UPDATE SET vistas = metricas_perfil_origen_dia.vistas + 1`, [cuentaId, org]);
  }
}

/* ---------- Períodos ---------- */
// Cada período empieza al comienzo de un día, semana (lunes) o mes en hora Argentina y termina ahora (el último tramo
// va por la mitad). El período anterior es el de la misma duración justo antes, para comparar.
export const PERIODOS = {
  '7d': { gran: 'day', n: 7, nombre: '7 días' },
  '30d': { gran: 'day', n: 30, nombre: '30 días' },
  '90d': { gran: 'week', n: 13, nombre: '90 días' },
  '12m': { gran: 'month', n: 12, nombre: '12 meses' },
};
const GRAN_ES = { day: 'dia', week: 'semana', month: 'mes' };

export const TIPOS_GASTO = ['renovacion_plan', 'semana', 'subida_temporal', 'destacado', 'comision_venta'];
const RETENCION_MENSAJES_DIAS = 90; // lib/asistente-app.js borra los mensajes del asistente a los 90 días

const num = (x) => (x == null ? 0 : Number(x));

// Límites y tramos de un período (en hora Argentina): desde/hasta (instantes), días (desde_dia, hoy_dia) y tramos.
async function limites(pool, P, ahora) {
  const ah = ahora ? new Date(ahora) : new Date();
  const { rows: [L] } = await pool.query(
    `WITH x AS (SELECT $1::timestamptz AS ahora, ($1::timestamptz AT TIME ZONE '${TZ}') AS l),
          y AS (SELECT ahora, l, date_trunc($2, l) - ($3::int * ('1 ' || $2)::interval) AS dl FROM x)
     SELECT ahora, dl::text AS desde_local, (dl AT TIME ZONE '${TZ}') AS desde,
            (dl AT TIME ZONE '${TZ}') - (ahora - (dl AT TIME ZONE '${TZ}')) AS ant_desde,
            dl::date::text AS desde_dia, l::date::text AS hoy_dia,
            (SELECT array_agg(to_char(b, 'YYYY-MM-DD') ORDER BY b) FROM generate_series(dl, date_trunc($2, l), ('1 ' || $2)::interval) b) AS tramos
       FROM y`, [ah.toISOString(), P.gran, P.n - 1]);
  // Días del período (el de hoy incluido): el período anterior de las tablas por día son los mismos días justo antes
  L.nDias = Math.round((new Date(L.hoy_dia) - new Date(L.desde_dia)) / 86400000) + 1;
  return L;
}

// Tablas por día (dia = fecha argentina): suma por tramo del período y del período anterior (los mismos días justo
// antes). cols: { nombre: 'sum(x)' }; grupo: columna opcional para separar (origen). → filas { b, g, ...cols }
// (b = tramo o null si es del período anterior).
function porDia(pool, L, gran, tabla, cols, { donde = 'true', params = [], grupo = null } = {}) {
  const ks = Object.keys(cols);
  return pool.query(
    `SELECT CASE WHEN dia >= $1::date THEN to_char(date_trunc($3, dia::timestamp), 'YYYY-MM-DD') END AS b,
            ${grupo ? `${grupo}::text` : 'NULL::text'} AS g, ${ks.map((k) => `${cols[k]} AS "${k}"`).join(', ')}
       FROM ${tabla} WHERE ${donde} AND dia >= $1::date - $4::int AND dia <= $2::date GROUP BY 1, 2`,
    [L.desde_dia, L.hoy_dia, gran, L.nDias, ...params]).then((r) => r.rows);
}

// Acumula filas de porDia en { clave: { serie, total, anterior } }
function acumular(filas, claves, idx, nTramos, clave = (r, k) => k) {
  const o = {};
  const ceros = () => Array.from({ length: nTramos }, () => 0);
  for (const r of filas) {
    for (const k of claves) {
      if (!(k in r) || r[k] == null) continue;
      const dst = clave(r, k); if (dst == null) continue;
      if (!o[dst]) o[dst] = { serie: ceros(), total: 0, anterior: 0 };
      const v = num(r[k]);
      if (r.b == null) o[dst].anterior += v; else { o[dst].total += v; const i = idx.get(r.b); if (i !== undefined) o[dst].serie[i] += v; }
    }
  }
  return o;
}
const vacio = (n) => ({ serie: Array.from({ length: n }, () => 0), total: 0, anterior: 0 });
// a − b por tramo, total y anterior (sin bajar de 0): "sin dato" = lo que no tiene origen
const resta = (a, bs) => {
  const f = (x, ys) => Math.max(0, x - ys.reduce((s, y) => s + y, 0));
  return { serie: a.serie.map((v, i) => f(v, bs.map((b) => b.serie[i]))), total: f(a.total, bs.map((b) => b.total)), anterior: f(a.anterior, bs.map((b) => b.anterior)) };
};

export async function metricasPeriodo(pool, { periodo = '30d', ahora = null, planes = null } = {}) {
  const P = PERIODOS[periodo] || PERIODOS['30d'];
  const g = P.gran;
  const L = await limites(pool, P, ahora);
  const desde = L.desde, hasta = L.ahora, antDesde = L.ant_desde;
  const tramos = L.tramos;
  const idx = new Map(tramos.map((t, i) => [t, i]));
  const ceros = () => tramos.map(() => 0);

  /* Una medida = una consulta. De: tabla(s) y condiciones; col: la fecha que la ubica; aggs: { nombre: 'sum(x)' }
     (todas sumables); grupo: expresión opcional para separar (moneda, tipo…). Devuelve, por grupo y total: la serie
     del período, el total del período y el del período anterior. */
  async function medir({ de, donde = 'true', col, aggs = { n: 'count(*)' }, grupo = null }) {
    const ks = Object.keys(aggs);
    const { rows } = await pool.query(
      `SELECT CASE WHEN ${col} >= $1 THEN to_char(date_trunc($4, ${col} AT TIME ZONE '${TZ}'), 'YYYY-MM-DD') END AS b,
              ${grupo ? `(${grupo})::text` : 'NULL::text'} AS g,
              ${ks.map((k) => `${aggs[k]} AS "${k}"`).join(', ')}
         FROM ${de}
        WHERE ${donde} AND ${col} >= $3 AND ${col} < $2
        GROUP BY 1, 2`, [desde, hasta, antDesde, g]);
    const out = { grupos: {} };
    const nuevo = () => Object.fromEntries(ks.map((k) => [k, { serie: ceros(), total: 0, anterior: 0 }]));
    const tot = nuevo();
    for (const r of rows) {
      const gk = r.g == null ? '' : r.g;
      if (!out.grupos[gk]) out.grupos[gk] = nuevo();
      for (const k of ks) {
        const v = num(r[k]);
        for (const dst of [tot[k], out.grupos[gk][k]]) {
          if (r.b == null) dst.anterior += v;
          else { dst.total += v; const i = idx.get(r.b); if (i !== undefined) dst.serie[i] += v; }
        }
      }
    }
    Object.assign(out, tot);
    return out;
  }
  const G = (m, gk, k) => (m.grupos[gk] ? m.grupos[gk][k] : { serie: ceros(), total: 0, anterior: 0 });
  const redondear = (o, f) => ({ serie: o.serie.map(f), total: f(o.total), anterior: f(o.anterior) });
  const usd = (x) => Math.round(x * 100) / 100;
  const cent = (x) => Math.round(x) / 100;

  // Tráfico: tablas por día (dia = fecha argentina). Anterior: la misma cantidad de días justo antes.
  async function trafico() {
    const nDias = L.nDias;
    const [sitio, perf, org, orgPerf] = await Promise.all([
      porDia(pool, L, g, 'metricas_sitio_dia', { sitio: 'sum(vistas)' }),
      porDia(pool, L, g, 'metricas_perfil_dia', { vistas: 'sum(vistas)', whatsapp: 'sum(whatsapp)', telegram: 'sum(telegram)' }),
      porDia(pool, L, g, 'metricas_origen_dia', { v: 'sum(vistas)' }, { grupo: 'origen' }),
      porDia(pool, L, g, 'metricas_perfil_origen_dia', { v: 'sum(vistas)' }, { grupo: 'origen' }),
    ]);
    const base = acumular(sitio.concat(perf), ['sitio', 'vistas', 'whatsapp', 'telegram'], idx, tramos.length);
    const o = {};
    for (const k of ['sitio', 'vistas', 'whatsapp', 'telegram']) o[k] = base[k] || vacio(tramos.length);
    // De dónde vienen: páginas vistas (todo el sitio) y visitas a perfiles por categoría; "sinDato" = sin origen
    // (lo de antes de medir el origen o lo que el navegador no pudo saber).
    const porOrigen = (filas, total) => {
      const a = acumular(filas, ['v'], idx, tramos.length, (r) => (ORIGENES.includes(r.g) ? r.g : null));
      const out = Object.fromEntries(ORIGENES.map((k) => [k, a[k] || vacio(tramos.length)]));
      out.sinDato = resta(total, ORIGENES.map((k) => out[k]));
      return out;
    };
    const top = async (orden) => (await pool.query(
      `SELECT m.cuenta_id, p.slug, p.datos->>'displayName' AS nombre,
              sum(m.vistas)::int AS vistas, sum(m.whatsapp)::int AS whatsapp, sum(m.telegram)::int AS telegram
         FROM metricas_perfil_dia m LEFT JOIN perfiles p ON p.cuenta_id = m.cuenta_id
        WHERE m.dia >= $1::date AND m.dia <= $2::date
        GROUP BY m.cuenta_id, p.slug, p.datos->>'displayName'
       HAVING ${orden} > 0
        ORDER BY ${orden} DESC, m.cuenta_id LIMIT 10`, [L.desde_dia, L.hoy_dia])).rows.map((r) => ({
      cuentaId: r.cuenta_id, slug: r.slug || '', nombre: r.nombre || '', vistas: r.vistas, whatsapp: r.whatsapp, telegram: r.telegram,
      clics: r.whatsapp + r.telegram,
    }));
    const [porVistas, porClics, ini] = await Promise.all([top('sum(m.vistas)'), top('sum(m.whatsapp) + sum(m.telegram)'),
      pool.query(`SELECT LEAST((SELECT min(dia) FROM metricas_sitio_dia), (SELECT min(dia) FROM metricas_perfil_dia))::text AS d,
                         (SELECT min(dia) FROM metricas_origen_dia)::text AS o,
                         ($1::date - $2::int)::text AS ant`, [L.desde_dia, nDias])]);
    // Primer día con datos: antes no se medía (no son ceros). Si el período anterior empieza antes, no se compara.
    const desdeMedicion = ini.rows[0].d;
    const anteriorDesde = ini.rows[0].ant;
    const desdeOrigen = ini.rows[0].o;
    return {
      ...o, topVistas: porVistas, topClics: porClics, desdeMedicion,
      comparable: Boolean(desdeMedicion && desdeMedicion <= anteriorDesde),
      dias: { desde: L.desde_dia, hasta: L.hoy_dia, anteriorDesde },
      origenes: { paginas: porOrigen(org, o.sitio), perfiles: porOrigen(orgPerf, o.vistas), desde: desdeOrigen,
        comparable: Boolean(desdeOrigen && desdeOrigen <= anteriorDesde) },
    };
  }

  // Cuentas con plan pago vigente al cierre de cada tramo (el último: ahora). Las canceladas no cuentan (no se sabe
  // cuándo se cancelaron). Plan de cada cuenta = el de mayor rango vigente (igual que el sitio).
  async function planesEnElTiempo() {
    const { rows } = await pool.query(
      `WITH t AS (
         SELECT to_char(b, 'YYYY-MM-DD') AS k,
                LEAST(((b + ('1 ' || $2)::interval) AT TIME ZONE '${TZ}') - interval '1 microsecond', $3::timestamptz) AS corte
           FROM generate_series($1::timestamp, date_trunc($2, $3::timestamptz AT TIME ZONE '${TZ}'), ('1 ' || $2)::interval) b)
       SELECT t.k, x.plan, count(*)::int AS n
         FROM t CROSS JOIN LATERAL (
           SELECT DISTINCT ON (s.cuenta_id) s.cuenta_id, s.plan FROM suscripciones s
            WHERE s.estado IN ('activa', 'vencida') AND s.plan IN ('D', 'C', 'S') AND s.desde <= t.corte AND s.hasta > t.corte
            ORDER BY s.cuenta_id, CASE s.plan WHEN 'S' THEN 4 WHEN 'C' THEN 3 ELSE 2 END DESC) x
        GROUP BY 1, 2`, [L.desde_local, g, hasta]);
    const o = { D: ceros(), C: ceros(), S: ceros() };
    for (const r of rows) { const i = idx.get(r.k); if (i !== undefined && o[r.plan]) o[r.plan][i] = r.n; }
    return o;
  }

  async function foto() {
    const [{ rows: [c] }, { rows: pub }, { rows: [pz] }] = await Promise.all([
      pool.query(`SELECT count(*) FILTER (WHERE c.estado = 'activa')::int AS activas,
                         count(*) FILTER (WHERE c.estado = 'activa' AND p.verificacion = 'verificada')::int AS verificadas,
                         count(*) FILTER (WHERE c.estado = 'activa' AND p.estado = 'publicado' AND NOT p.oculto)::int AS publicadas
                    FROM cuentas c LEFT JOIN perfiles p ON p.cuenta_id = c.id`),
      pool.query(`SELECT p.cuenta_id FROM perfiles p JOIN cuentas c ON c.id = p.cuenta_id
                   WHERE p.estado = 'publicado' AND NOT p.oculto AND c.estado = 'activa'`),
      pool.query('SELECT count(*)::int AS n FROM renovaciones_pendientes'),
    ]);
    const plan = { E: 0, D: 0, C: 0, S: 0 };
    const ids = pub.map((r) => r.cuenta_id);
    let efect = new Map();
    if (ids.length && planes && typeof planes.planesEfectivos === 'function') efect = await planes.planesEfectivos(ids);
    for (const id of ids) { const p = efect.get(id) || 'E'; plan[plan[p] === undefined ? 'E' : p]++; }
    return { activas: c.activas, verificadas: c.verificadas, publicadas: c.publicadas, porPlan: plan, pausadasAhora: pz.n };
  }

  const [cred, venta, regs, verif, gasto, renov, pausas, termin, cli, sol, conv, msj, traf, planesT, ft, cot] = await Promise.all([
    medir({ de: 'pedidos_creditos', donde: "estado = 'confirmado'", col: 'confirmado', aggs: { usd: 'sum(paga_usd)', n: 'count(*)' }, grupo: "COALESCE(moneda_asistente, 'sin')" }),
    medir({ de: 'ventas_contenido', donde: "estado = 'aprobada'", col: 'pagado', aggs: { n: 'count(*)', monto: 'sum(monto_centavos)', comision: 'sum(comision_centavos)' }, grupo: 'tipo' }),
    medir({ de: 'cuentas', col: 'creado' }),
    medir({ de: "(SELECT cuenta_id, min(revisado) AS t FROM verificaciones WHERE estado = 'aprobada' AND revisado IS NOT NULL GROUP BY cuenta_id) v", col: 't' }),
    medir({ de: 'creditos_movimientos', donde: `tipo IN (${TIPOS_GASTO.map((t) => `'${t}'`).join(', ')})`, col: 'creado', aggs: { c: '-sum(centavos)' }, grupo: 'tipo' }),
    medir({ de: 'suscripciones', donde: "origen = 'creditos' AND (nota LIKE 'Renovación automática%' OR nota LIKE 'Renovación al cargar créditos%')", col: 'creado',
      grupo: "CASE WHEN nota LIKE 'Renovación automática (cambio de%' THEN 'baja' ELSE 'igual' END" }),
    medir({ de: 'avisos_plan', donde: "tipo = 'pausa'", col: 'enviado' }),
    medir({ de: 'suscripciones s', col: 's.hasta',
      donde: `s.periodo IN ('mes', 'manual') AND s.estado = 'vencida'
              AND NOT EXISTS (SELECT 1 FROM suscripciones r WHERE r.cuenta_id = s.cuenta_id AND r.id <> s.id AND r.estado <> 'cancelada'
                              AND r.periodo IN ('mes', 'manual') AND r.desde <= s.hasta + interval '1 minute' AND r.hasta > s.hasta)
              AND NOT EXISTS (SELECT 1 FROM avisos_plan a WHERE a.suscripcion_id = s.id AND a.tipo = 'pausa')` }),
    medir({ de: 'clientes', col: 'creado' }),
    medir({ de: 'solicitudes', col: 'creado' }),
    medir({ de: 'asistente_conversaciones', col: 'creado' }),
    medir({ de: 'asistente_mensajes', donde: "dir = 'in'", col: 'creado' }),
    trafico(),
    planesEnElTiempo(),
    foto(),
    pool.query("SELECT valor FROM ajustes WHERE clave = 'cotizacion'"),
  ]);

  const cotV = cot.rows[0] && cot.rows[0].valor;
  const arsPorUsd = cotV && Number(cotV.arsPorUsd) > 0 ? Number(cotV.arsPorUsd) : null;
  const corteMensajes = new Date(hasta.getTime() - RETENCION_MENSAJES_DIAS * 86400000);
  const gastoPorTipo = Object.fromEntries(TIPOS_GASTO.map((t) => [t, redondear(G(gasto, t, 'c'), cent)]));

  return {
    periodo: Object.keys(PERIODOS).find((k) => PERIODOS[k] === P),
    nombre: P.nombre,
    granularidad: GRAN_ES[g],
    tramos,
    desde, hasta, anteriorDesde: antDesde,
    generado: new Date().toISOString(),
    ingresos: {
      creditosUsd: redondear(cred.usd, usd),
      pedidos: cred.n,
      porMoneda: { ARS: redondear(G(cred, 'ARS', 'usd'), usd), USD: redondear(G(cred, 'USD', 'usd'), usd), sin: redondear(G(cred, 'sin', 'usd'), usd) },
      // Los pedidos no guardan los pesos que se transfirieron: es solo una referencia a la cotización de hoy.
      cotizacionHoy: arsPorUsd,
      contenido: { ventas: venta.n, monto: redondear(venta.monto, cent), comision: redondear(venta.comision, cent) },
    },
    acompanantes: {
      registros: regs.n,
      verificadas: verif.n,
      ahora: { activas: ft.activas, verificadas: ft.verificadas, publicadas: ft.publicadas },
      porPlan: ft.porPlan,
      planesPagos: planesT,
    },
    creditos: {
      gastados: redondear(gasto.c, cent),
      porTipo: gastoPorTipo,
      renovaciones: renov.n,
      bajasAlRenovar: G(renov, 'baja', 'n'),
      pausas: pausas.n,
      pausadasAhora: ft.pausadasAhora,
      terminados: termin.n,
    },
    interesados: {
      registros: cli.n,
      packs: G(venta, 'pack', 'n'),
      pedidosCreados: sol.n,
      pedidosPagados: G(venta, 'pedido', 'n'),
      conversaciones: conv.n,
      mensajes: msj.n,
      // Los mensajes del asistente se borran a los 90 días: antes de esta fecha no hay datos (no son ceros).
      mensajesDesde: desde < corteMensajes ? corteMensajes.toISOString() : null,
    },
    trafico: traf,
  };
}

/* ---------- Mis números (panel de la acompañante, 16/11/2026) ----------
   Solo los números de SU perfil (metricas_perfil_dia): visitas, toques en WhatsApp y en Telegram, por día (7 y 30 días)
   o por semana (90 días), con el período anterior de la misma duración. Sin orígenes (solo admin), sin datos de otras
   cuentas ni posiciones. Antes de que se midiera (el primer día con datos del sitio) o antes de que existiera su cuenta,
   los tramos no se midieron: no se compara si el período anterior no se midió entero. */
export const PERIODOS_CUENTA = ['7d', '30d', '90d'];

export async function numerosCuenta(pool, cuentaId, { periodo = '30d', ahora = null } = {}) {
  const per = PERIODOS_CUENTA.includes(periodo) ? periodo : '30d';
  const P = PERIODOS[per];
  const L = await limites(pool, P, ahora);
  const tramos = L.tramos;
  const idx = new Map(tramos.map((t, i) => [t, i]));
  const [filas, { rows: [x] }] = await Promise.all([
    porDia(pool, L, P.gran, 'metricas_perfil_dia', { vistas: 'sum(vistas)', whatsapp: 'sum(whatsapp)', telegram: 'sum(telegram)' },
      { donde: 'cuenta_id = $5', params: [cuentaId] }),
    pool.query(`SELECT LEAST((SELECT min(dia) FROM metricas_sitio_dia), (SELECT min(dia) FROM metricas_perfil_dia))::text AS ini,
                       (SELECT (creado AT TIME ZONE '${TZ}')::date::text FROM cuentas WHERE id = $1) AS alta,
                       EXISTS (SELECT 1 FROM metricas_perfil_dia WHERE cuenta_id = $1) AS hay,
                       ($2::date - $3::int)::text AS ant`, [cuentaId, L.desde_dia, L.nDias]),
  ]);
  const a = acumular(filas, ['vistas', 'whatsapp', 'telegram'], idx, tramos.length);
  const vistas = a.vistas || vacio(tramos.length);
  const whatsapp = a.whatsapp || vacio(tramos.length);
  const telegram = a.telegram || vacio(tramos.length);
  const clics = { serie: whatsapp.serie.map((v, i) => v + telegram.serie[i]), total: whatsapp.total + telegram.total, anterior: whatsapp.anterior + telegram.anterior };
  const desdeMedicion = x.ini ? (x.alta && x.alta > x.ini ? x.alta : x.ini) : null;
  const comparable = Boolean(desdeMedicion && desdeMedicion <= x.ant);
  const tasa = (c, v) => (v ? Math.round((c / v) * 1000) / 10 : null);
  return {
    periodo: per,
    granularidad: GRAN_ES[P.gran],
    tramos,
    desde: L.desde_dia,
    hasta: L.hoy_dia,
    anteriorDesde: x.ant,
    vistas, whatsapp, telegram, clics,
    // Tasa de contacto: toques ÷ visitas, en % (null sin visitas)
    contacto: { total: tasa(clics.total, vistas.total), anterior: comparable ? tasa(clics.anterior, vistas.anterior) : null },
    comparable,
    desdeMedicion,
    hayDatos: Boolean(x.hay),
  };
}
