// Créditos (Planes v2, 11/11/2026): libro de movimientos, packs, pedidos de créditos por WhatsApp, notificaciones y
// comisión de venta de contenido (solo preparada).
//
// 1 crédito = USD 1 de lista. Todo se guarda en CENTÉSIMOS (enteros): 35 créditos = 3500. En la API cada importe sale
// como { centavos: 3500, creditos: "35.00" } (ver montoJson).
// Saldo = SUM(creditos_movimientos.centavos). creditos_cuentas tiene el mismo número y se bloquea con FOR UPDATE en
// cada movimiento (dos débitos simultáneos no se pasan del saldo).
// Los créditos no vencen, no se devuelven en dinero y no se transfieren entre cuentas (no hay endpoint para eso).
import crypto from 'node:crypto';

export class CreditoError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.expose = true; Object.assign(this, extra); }
}
const err = (status, msg, extra) => new CreditoError(status, msg, extra);

export const TIPOS_MOV = ['compra', 'pack_bonus', 'renovacion_plan', 'semana', 'subida_temporal', 'destacado', 'ajuste_admin', 'comision_venta'];
export const MIN_CARGA = 10;          // créditos, carga a medida
export const MAX_CARGA = 10000;
export const HORAS_PEDIDO = 48;
export const MAX_PEDIDOS_ABIERTOS = 3;

export const aCentavos = (creditos) => Math.round(Number(creditos) * 100);
export const fmtCreditos = (centavos) => (Number(centavos) / 100).toFixed(2);
export const montoJson = (centavos) => ({ centavos: Number(centavos), creditos: fmtCreditos(centavos) });

export const PACKS_DEFAULT = Object.freeze([
  { id: 'inicial', nombre: 'Inicial', pagaUsd: 10, recibe: 10, alcanzaPara: 'Destacados sueltos', masElegido: false, orden: 1, activo: true },
  { id: 'mes-plata', nombre: 'Mes Plata', pagaUsd: 35, recibe: 35, alcanzaPara: '1 mes de Plata', masElegido: false, orden: 2, activo: true },
  { id: 'trimestre-plata', nombre: 'Trimestre Plata', pagaUsd: 95, recibe: 105, alcanzaPara: '3 meses de Plata, o 1 de Oro + 15', masElegido: true, orden: 3, activo: true },
  { id: 'trimestre-oro', nombre: 'Trimestre Oro', pagaUsd: 240, recibe: 280, alcanzaPara: '3 meses de Oro + 10', masElegido: false, orden: 4, activo: true },
  { id: 'trimestre-star', nombre: 'Trimestre Star', pagaUsd: 980, recibe: 1150, alcanzaPara: '3 meses de Star + 100', masElegido: false, orden: 5, activo: true },
]);
export const CONTACTO_DEFAULT = Object.freeze({ whatsapp: '', telegram: '', telegramActivo: false });
export const COTIZACION_DEFAULT = Object.freeze({ arsPorUsd: null, fecha: null, nota: '' });
// Venta de packs y contenido (Juan, 13/11/2026): 'porcentaje' es el descuento TOTAL a la acompañante (comisión de
// SexyRose + costo de Mercado Pago). 'costoMp' es lo que se estima que cobra Mercado Pago, con IVA (7,61 % = 6,29 % + IVA,
// plazo "al instante", el más caro; mercadopago.com.ar, 13/11/2026). SexyRose cobra la diferencia (comisionPlataforma).
export const COMISION_DEFAULT = Object.freeze({ porcentaje: 10, costoMp: 7.61, saldoNegativoMax: 20 });
// % que va como marketplace_fee: total − costo de Mercado Pago (nunca negativo), con 2 decimales
export function comisionPlataforma(cfg) {
  const c = { ...COMISION_DEFAULT, ...(cfg && typeof cfg === 'object' ? cfg : {}) };
  const total = Number(c.porcentaje); const mp = Number(c.costoMp);
  if (!Number.isFinite(total) || !Number.isFinite(mp)) return Math.round((COMISION_DEFAULT.porcentaje - COMISION_DEFAULT.costoMp) * 100) / 100;
  return Math.max(0, Math.round((total - mp) * 100) / 100);
}
export const MENSAJES_DEFAULT = Object.freeze({
  whatsapp: Object.freeze({
    es: 'Hola, quiero comprar {pack} ({creditos} créditos, USD {monto}). Pedido {codigo}',
    en: 'Hi, I want to buy {pack} ({creditos} credits, USD {monto}). Order {codigo}',
    pt: 'Olá, quero comprar {pack} ({creditos} créditos, USD {monto}). Pedido {codigo}',
  }),
  admin: '¡Hola! Tu pedido {codigo}: {pack} ({creditos} créditos). El total a transferir es ARS {ars} (USD {monto} a {cotizacion} '
    + 'por dólar, cotización del {fecha}). Cuando transfieras, mandame el comprobante por acá con el código {codigo}.',
});
export const NOMBRE_CARGA = { es: 'Carga a medida', en: 'Custom top-up', pt: 'Recarga personalizada' };
const LANGS = ['es', 'en', 'pt'];

// ---------- Ajustes: lectura con defaults y validación de los PUT del admin ----------
const esObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const numOk = (v, min, max) => { const n = Number(v); return v !== null && v !== '' && v !== undefined && Number.isFinite(n) && n >= min && n <= max ? n : null; };
const str = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, max) : '');

// "Alcanza para…" sugerido cuando el admin lo deja vacío: el plan más alto que entra al menos un mes, más el resto.
export function alcanzaParaSugerido(recibe, precios) {
  const nombres = { S: 'Star', C: 'Oro', D: 'Plata' };
  for (const p of ['S', 'C', 'D']) {
    const precio = Number(precios && precios.mes && precios.mes[p]);
    if (!precio) continue;
    const k = Math.floor(recibe / precio);
    if (k >= 1) {
      const resto = Math.round((recibe - k * precio) * 100) / 100;
      return `${k} ${k === 1 ? 'mes' : 'meses'} de ${nombres[p]}${resto > 0 ? ` + ${resto}` : ''}`;
    }
  }
  return 'Destacados sueltos';
}

export function validarPacks(v) {
  if (!Array.isArray(v)) return { error: 'Los packs tienen que ser una lista.' };
  if (v.length > 12) return { error: 'Máximo 12 packs.' };
  const ids = new Set();
  const out = [];
  for (const [i, p] of v.entries()) {
    if (!esObj(p)) return { error: `Pack ${i + 1}: formato inválido.` };
    const nombre = str(p.nombre, 40);
    if (nombre.length < 2) return { error: `Pack ${i + 1}: falta el nombre.` };
    const id = str(p.id, 40) || nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(id)) return { error: `Pack ${i + 1}: identificador inválido.` };
    if (ids.has(id)) return { error: `Pack repetido: ${id}.` };
    ids.add(id);
    const pagaUsd = numOk(p.pagaUsd, MIN_CARGA, 100000);
    const recibe = numOk(p.recibe, 1, 1000000);
    if (pagaUsd === null) return { error: `Pack ${nombre}: el precio tiene que ser de al menos USD ${MIN_CARGA}.` };
    if (recibe === null || recibe < pagaUsd) return { error: `Pack ${nombre}: los créditos tienen que ser iguales o mayores a lo que se paga.` };
    out.push({
      id, nombre, pagaUsd: Math.round(pagaUsd * 100) / 100, recibe: Math.round(recibe * 100) / 100,
      alcanzaPara: str(p.alcanzaPara, 80), masElegido: p.masElegido === true,
      orden: Number.isInteger(Number(p.orden)) ? Number(p.orden) : i + 1, activo: p.activo !== false,
    });
  }
  return { valor: out.sort((a, b) => a.orden - b.orden) };
}

export function validarContacto(v) {
  if (!esObj(v)) return { error: 'Formato inválido: {whatsapp, telegram, telegramActivo}.' };
  const wa = str(v.whatsapp, 30).replace(/[^\d+]/g, '');
  const digitos = wa.replace(/\D/g, '');
  if (digitos && (digitos.length < 8 || digitos.length > 15)) return { error: 'El WhatsApp tiene que tener entre 8 y 15 dígitos, con código de país (ej. 5491122334455).' };
  const tg = str(v.telegram, 40).replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '');
  if (tg && !/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(tg)) return { error: 'Usuario de Telegram inválido (5 a 32 letras, números o _).' };
  const telegramActivo = v.telegramActivo === true;
  if (telegramActivo && !tg) return { error: 'Para activar Telegram cargá el usuario.' };
  return { valor: { whatsapp: digitos, telegram: tg, telegramActivo } };
}

export function validarCotizacion(v) {
  if (!esObj(v)) return { error: 'Formato inválido: {arsPorUsd, nota}.' };
  const n = v.arsPorUsd === null || v.arsPorUsd === '' ? null : numOk(v.arsPorUsd, 1, 100000000);
  if (v.arsPorUsd !== null && v.arsPorUsd !== '' && n === null) return { error: 'La cotización tiene que ser un número mayor a 0.' };
  return { valor: { arsPorUsd: n === null ? null : Math.round(n * 100) / 100, fecha: n === null ? null : new Date().toISOString(), nota: str(v.nota, 200) } };
}

export function validarComision(v) {
  if (!esObj(v)) return { error: 'Formato inválido: {porcentaje, costoMp, saldoNegativoMax}.' };
  const p = numOk(v.porcentaje, 0, 90);
  const mp = numOk(v.costoMp == null ? COMISION_DEFAULT.costoMp : v.costoMp, 0, 90);
  const neg = numOk(v.saldoNegativoMax, 0, 10000);
  if (p === null) return { error: 'El descuento total tiene que estar entre 0 y 90 %.' };
  if (mp === null) return { error: 'El costo de Mercado Pago tiene que estar entre 0 y 90 %.' };
  if (mp > p) return { error: 'El costo de Mercado Pago no puede ser mayor que el descuento total.' };
  if (neg === null) return { error: 'El saldo negativo máximo tiene que ser un número entre 0 y 10000.' };
  return { valor: { porcentaje: Math.round(p * 100) / 100, costoMp: Math.round(mp * 100) / 100, saldoNegativoMax: Math.round(neg * 100) / 100 } };
}

export function validarMensajes(v) {
  if (!esObj(v)) return { error: 'Formato inválido: {whatsapp: {es, en, pt}, admin}.' };
  const wa = esObj(v.whatsapp) ? v.whatsapp : {};
  const out = { whatsapp: {}, admin: str(v.admin, 1000) || MENSAJES_DEFAULT.admin };
  for (const l of LANGS) {
    const t = str(wa[l], 500) || MENSAJES_DEFAULT.whatsapp[l];
    if (!t.includes('{codigo}')) return { error: `El mensaje de WhatsApp (${l.toUpperCase()}) tiene que incluir {codigo}.` };
    out.whatsapp[l] = t;
  }
  if (!out.admin.includes('{codigo}')) return { error: 'El mensaje para copiar tiene que incluir {codigo}.' };
  return { valor: out };
}

export const rellenar = (tpl, datos) => String(tpl).replace(/\{(\w+)\}/g, (m, k) => (k in datos && datos[k] !== null && datos[k] !== undefined ? String(datos[k]) : m));
const fmtNum = (n) => { const x = Math.round(Number(n) * 100) / 100; return Number.isInteger(x) ? String(x) : x.toFixed(2); };
const fmtArs = (n) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n);
const fmtFechaCorta = (d) => (d ? new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'numeric', year: 'numeric' }).format(new Date(d)) : '');

// Monto sugerido en pesos: USD × cotización, redondeado HACIA ARRIBA a la centena (ej. 34.230 → 34.300).
export const arsSugerido = (usd, arsPorUsd) => (arsPorUsd ? Math.ceil((Number(usd) * Number(arsPorUsd)) / 100) * 100 : null);

export function nuevoCodigo() { return 'SR-' + String(1000 + crypto.randomInt(9000)); }

export function createCreditos({ pool, log = () => {}, sendMail = null, siteUrl = 'https://sexyrose.net' } = {}) {
  let alAcreditar = async () => {};   // lo setea planes: reintenta renovaciones pendientes cuando entran créditos
  const url = String(siteUrl || 'https://sexyrose.net').replace(/\/+$/, '');
  async function mail(cuentaId, subject, text) {
    if (!sendMail) return false;
    try {
      const { rows } = await pool.query("SELECT email FROM cuentas WHERE id = $1 AND estado <> 'baja'", [cuentaId]);
      if (!rows[0]) return false;
      await sendMail({ to: rows[0].email, subject, text, html: textoAHtml(text) });
      return true;
    } catch (e) {
      log('creditos: no se pudo enviar el email:', e.code || e.message);
      return false;
    }
  }

  async function leerAjuste(clave, def, db = pool) {
    const { rows } = await db.query('SELECT valor, actualizado FROM ajustes WHERE clave = $1', [clave]);
    return rows[0] ? rows[0].valor : def;
  }
  // crudo: tal como lo cargó el admin (alcanzaPara puede estar vacío) + alcanzaParaSugerido; si no, alcanzaPara ya
  // viene completado con la sugerencia cuando el admin lo dejó vacío.
  async function packs({ soloActivos = false, precios = null, crudo = false } = {}) {
    let v = await leerAjuste('packs', null);
    const ok = validarPacks(v);
    v = ok.valor || PACKS_DEFAULT.map((p) => ({ ...p }));
    return v.filter((p) => !soloActivos || p.activo).map((p) => {
      const sug = precios ? alcanzaParaSugerido(p.recibe, precios) : '';
      const base = { ...p, bonus: Math.round((p.recibe - p.pagaUsd) * 100) / 100 };
      return crudo ? { ...base, alcanzaParaSugerido: sug } : { ...base, alcanzaPara: p.alcanzaPara || sug };
    });
  }
  const contacto = async () => ({ ...CONTACTO_DEFAULT, ...((await leerAjuste('contacto', {})) || {}) });
  const cotizacion = async () => ({ ...COTIZACION_DEFAULT, ...((await leerAjuste('cotizacion', {})) || {}) });
  const comision = async (db = pool) => ({ ...COMISION_DEFAULT, ...((await leerAjuste('comision', {}, db)) || {}) });
  async function mensajes() {
    const v = (await leerAjuste('mensajes', {})) || {};
    return { whatsapp: { ...MENSAJES_DEFAULT.whatsapp, ...(esObj(v.whatsapp) ? v.whatsapp : {}) }, admin: v.admin || MENSAJES_DEFAULT.admin };
  }

  // ---------- Libro ----------
  async function saldo(cuentaId, db = pool) {
    const { rows } = await db.query('SELECT COALESCE(SUM(centavos), 0)::bigint AS s FROM creditos_movimientos WHERE cuenta_id = $1', [cuentaId]);
    return Number(rows[0].s);
  }

  // Movimiento dentro de una transacción ya abierta (db = client). Bloquea la fila de saldo de la cuenta.
  //   minimo: saldo mínimo permitido DESPUÉS del movimiento (centavos). 0 = no se puede quedar en negativo.
  async function mover(db, { cuentaId, tipo, centavos, refTipo = null, refId = null, motivo = null, por = null, minimo = 0 }) {
    if (!TIPOS_MOV.includes(tipo)) throw err(500, 'Tipo de movimiento inválido.');
    const c = Math.trunc(Number(centavos));
    if (!c) throw err(400, 'El importe no puede ser 0.');
    await db.query('INSERT INTO creditos_cuentas (cuenta_id) VALUES ($1) ON CONFLICT (cuenta_id) DO NOTHING', [cuentaId]);
    const { rows } = await db.query('SELECT centavos FROM creditos_cuentas WHERE cuenta_id = $1 FOR UPDATE', [cuentaId]);
    const antes = Number(rows[0].centavos);
    const despues = antes + c;
    if (c < 0 && despues < minimo) {
      throw err(402, `No te alcanzan los créditos: necesitás ${fmtCreditos(-c)} y tenés ${fmtCreditos(antes)}.`,
        { codigo: 'saldo_insuficiente', faltan: montoJson(minimo - despues), saldo: montoJson(antes) });
    }
    const { rows: m } = await db.query(
      `INSERT INTO creditos_movimientos (cuenta_id, tipo, centavos, saldo_despues, ref_tipo, ref_id, motivo, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [cuentaId, tipo, c, despues, refTipo, refId === null ? null : String(refId), motivo, por]);
    await db.query('UPDATE creditos_cuentas SET centavos = $2, actualizado = now() WHERE cuenta_id = $1', [cuentaId, despues]);
    return movimientoJson(m[0]);
  }

  async function enTransaccion(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await fn(client);
      await client.query('COMMIT');
      return r;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async function movimientos(cuentaId, { limite = 50, antesDe = null } = {}) {
    const lim = Math.min(200, Math.max(1, Number(limite) || 50));
    const args = [cuentaId, lim + 1];
    let cond = '';
    if (antesDe && /^\d+$/.test(String(antesDe))) { args.push(String(antesDe)); cond = 'AND id < $3'; }
    const { rows } = await pool.query(`SELECT * FROM creditos_movimientos WHERE cuenta_id = $1 ${cond} ORDER BY id DESC LIMIT $2`, args);
    const items = rows.slice(0, lim).map(movimientoJson);
    return { items, siguiente: rows.length > lim ? String(items[items.length - 1].id) : null };
  }

  // Ajuste manual del admin (positivo o negativo, con motivo). Un ajuste negativo no puede dejar saldo negativo.
  async function ajusteAdmin(cuentaId, { centavos, motivo, por = 'admin' }) {
    const c = Math.trunc(Number(centavos));
    if (!Number.isFinite(c) || !c || Math.abs(c) > 100000000) throw err(400, 'Importe inválido (centésimos de crédito, distinto de 0).');
    const m = str(motivo, 300);
    if (m.length < 3) throw err(400, 'Escribí el motivo del ajuste.');
    const ex = await pool.query('SELECT 1 FROM cuentas WHERE id = $1', [cuentaId]);
    if (!ex.rows[0]) throw err(404, 'Cuenta no encontrada.');
    const mov = await enTransaccion((db) => mover(db, { cuentaId, tipo: 'ajuste_admin', centavos: c, motivo: m, por, refTipo: 'admin' }));
    if (c > 0) await alAcreditar(cuentaId).catch((e) => log('creditos: reintento de renovación falló:', e.message));
    return mov;
  }

  // ---------- Venta de contenido (solo preparado) ----------
  // Cuando se acredite una venta, la acompañante ve el monto completo como ganancia y SexyRose descuenta su comisión en
  // créditos (movimiento comision_venta). Se permite quedar en negativo hasta −saldoNegativoMax créditos; más allá,
  // error 402 (la venta tiene que pausarse o la comisión cobrarse al liquidar: a definir cuando haya procesador).
  async function registrarComisionVenta(cuentaId, ventaCentavos, ref = null) {
    const venta = Math.trunc(Number(ventaCentavos));
    if (!Number.isFinite(venta) || venta <= 0) throw err(400, 'Importe de venta inválido.');
    return enTransaccion(async (db) => {
      const cfg = await comision(db);
      const pct = comisionPlataforma(cfg);
      const comi = Math.round((venta * pct) / 100);
      if (!comi) return null;
      return mover(db, {
        cuentaId, tipo: 'comision_venta', centavos: -comi, refTipo: 'venta', refId: ref,
        motivo: `Comisión ${pct} % sobre una venta de ${fmtCreditos(venta)}`, minimo: -aCentavos(cfg.saldoNegativoMax),
      });
    });
  }

  // ---------- Notificaciones ----------
  async function notificar(cuentaId, tipo, texto, db = pool) {
    await db.query('INSERT INTO notificaciones (cuenta_id, tipo, texto) VALUES ($1, $2, $3)', [cuentaId, tipo, String(texto).slice(0, 500)]);
  }
  async function notificaciones(cuentaId, { limite = 30 } = {}) {
    const { rows } = await pool.query('SELECT * FROM notificaciones WHERE cuenta_id = $1 ORDER BY id DESC LIMIT $2', [cuentaId, Math.min(100, Number(limite) || 30)]);
    const n = await pool.query('SELECT count(*)::int AS n FROM notificaciones WHERE cuenta_id = $1 AND NOT leida', [cuentaId]);
    return { items: rows.map((x) => ({ id: String(x.id), tipo: x.tipo, texto: x.texto, leida: x.leida, creado: x.creado })), noLeidas: n.rows[0].n };
  }
  async function noLeidas(cuentaId) {
    const n = await pool.query('SELECT count(*)::int AS n FROM notificaciones WHERE cuenta_id = $1 AND NOT leida', [cuentaId]);
    return n.rows[0].n;
  }
  async function marcarLeidas(cuentaId, ids = null) {
    if (Array.isArray(ids) && ids.length) {
      const lista = ids.map(String).filter((x) => /^\d{1,18}$/.test(x)).slice(0, 200);
      await pool.query('UPDATE notificaciones SET leida = true WHERE cuenta_id = $1 AND id = ANY($2::bigint[])', [cuentaId, lista]);
    } else {
      await pool.query('UPDATE notificaciones SET leida = true WHERE cuenta_id = $1 AND NOT leida', [cuentaId]);
    }
    return noLeidas(cuentaId);
  }

  // ---------- Pedidos de créditos por WhatsApp ----------
  async function urlsContacto(p) {
    const [c, msj] = await Promise.all([contacto(), mensajes()]);
    const lang = LANGS.includes(p.lang) ? p.lang : 'es';
    const total = Number(p.base_centavos) + Number(p.bonus_centavos);
    const nombre = p.pack_id ? p.pack_nombre : (NOMBRE_CARGA[lang] || p.pack_nombre);
    const texto = rellenar(msj.whatsapp[lang] || MENSAJES_DEFAULT.whatsapp[lang], {
      pack: nombre, creditos: fmtNum(total / 100), monto: fmtNum(p.paga_usd), codigo: p.codigo,
    });
    return {
      mensaje: texto,
      whatsappUrl: c.whatsapp ? `https://wa.me/${c.whatsapp}?text=${encodeURIComponent(texto)}` : null,
      telegramUrl: c.telegramActivo && c.telegram ? `https://t.me/${c.telegram}` : null,
    };
  }

  function pedidoJson(r) {
    const total = Number(r.base_centavos) + Number(r.bonus_centavos);
    return {
      id: r.id, codigo: r.codigo, cuentaId: r.cuenta_id, packId: r.pack_id, packNombre: r.pack_nombre,
      pagaUsd: Number(r.paga_usd), base: montoJson(r.base_centavos), bonus: montoJson(r.bonus_centavos), total: montoJson(total),
      estado: r.estado, lang: r.lang, tieneComprobante: Boolean(r.comprobante_ruta), nota: r.nota, motivo: r.motivo,
      creado: r.creado, vence: r.vence, confirmado: r.confirmado, reaperturas: r.reaperturas,
    };
  }
  const pedidoConContacto = async (r) => ({ ...pedidoJson(r), ...(await urlsContacto(r)) });
  // Admin → Ajustes → Contacto → "Probar": el mismo mensaje que arma un pedido real, con el primer pack activo y un
  // código de ejemplo (no crea ningún pedido).
  async function mensajeEjemplo() {
    const lista = await packs({ soloActivos: true });
    const p = lista[0] || PACKS_DEFAULT[0];
    const r = await urlsContacto({
      lang: 'es', pack_id: p.id, pack_nombre: p.nombre, paga_usd: p.pagaUsd,
      base_centavos: Math.round(p.pagaUsd * 100), bonus_centavos: Math.round((p.recibe - p.pagaUsd) * 100), codigo: 'SR-0000',
    });
    return { mensaje: r.mensaje, whatsappUrl: r.whatsappUrl };
  }

  // body: { packId } o { creditos } (carga a medida, entero ≥ 10, sin bonificación). lang = idioma del panel.
  async function crearPedido(cuentaId, { packId = null, creditos = null, lang = 'es' } = {}) {
    const c = await pool.query('SELECT estado FROM cuentas WHERE id = $1', [cuentaId]);
    if (!c.rows[0]) throw err(404, 'Cuenta no encontrada.');
    if (c.rows[0].estado !== 'activa') throw err(403, 'Tu cuenta no está activa.');
    const abiertos = await pool.query("SELECT count(*)::int AS n FROM pedidos_creditos WHERE cuenta_id = $1 AND estado = 'pendiente'", [cuentaId]);
    if (abiertos.rows[0].n >= MAX_PEDIDOS_ABIERTOS) throw err(409, `Tenés ${abiertos.rows[0].n} pedidos esperando pago. Pagá o cancelá alguno antes de pedir otro.`);
    let pack = null; let paga; let base; let bonus = 0; let nombre;
    if (packId) {
      pack = (await packs({ soloActivos: true })).find((p) => p.id === String(packId));
      if (!pack) throw err(400, 'Ese pack no existe o ya no está disponible.');
      paga = pack.pagaUsd; base = aCentavos(pack.pagaUsd); bonus = Math.max(0, aCentavos(pack.recibe) - base); nombre = pack.nombre;
    } else {
      const n = Number(creditos);
      if (!Number.isInteger(n) || n < MIN_CARGA || n > MAX_CARGA) throw err(400, `La carga a medida es de ${MIN_CARGA} a ${MAX_CARGA} créditos (números enteros).`);
      paga = n; base = n * 100; nombre = NOMBRE_CARGA.es;
    }
    const l = LANGS.includes(lang) ? lang : 'es';
    for (let i = 0; i < 12; i++) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO pedidos_creditos (codigo, cuenta_id, pack_id, pack_nombre, paga_usd, base_centavos, bonus_centavos, lang, vence)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + make_interval(hours => $9)) RETURNING *`,
          [nuevoCodigo(), cuentaId, pack ? pack.id : null, nombre, paga, base, bonus, l, HORAS_PEDIDO]);
        return pedidoConContacto(rows[0]);
      } catch (e) {
        if (e.code === '23505') continue; // código repetido entre los pendientes: otro
        throw e;
      }
    }
    throw err(503, 'No se pudo generar el código del pedido. Probá de nuevo.');
  }

  async function pedidoDe(cuentaId, id) {
    const { rows } = await pool.query('SELECT * FROM pedidos_creditos WHERE id = $1 AND cuenta_id = $2', [id, cuentaId]);
    if (!rows[0]) throw err(404, 'Pedido no encontrado.');
    return rows[0];
  }
  async function pedidosDeCuenta(cuentaId, { limite = 20 } = {}) {
    const { rows } = await pool.query('SELECT * FROM pedidos_creditos WHERE cuenta_id = $1 ORDER BY creado DESC LIMIT $2', [cuentaId, limite]);
    return Promise.all(rows.map((r) => (r.estado === 'pendiente' ? pedidoConContacto(r) : pedidoJson(r))));
  }

  async function adjuntarComprobante(cuentaId, id, { comprobanteRuta, nota = null }) {
    const p = await pedidoDe(cuentaId, id);
    if (p.estado !== 'pendiente') throw err(409, 'Este pedido ya no está esperando pago.');
    const { rows } = await pool.query(
      'UPDATE pedidos_creditos SET comprobante_ruta = COALESCE($3, comprobante_ruta), nota = COALESCE($4, nota) WHERE id = $1 AND cuenta_id = $2 RETURNING *',
      [id, cuentaId, comprobanteRuta, nota]);
    return pedidoConContacto(rows[0]);
  }

  async function cancelarPedido(cuentaId, id) {
    const p = await pedidoDe(cuentaId, id);
    if (p.estado !== 'pendiente') throw err(409, 'Este pedido ya no se puede cancelar.');
    const { rows } = await pool.query("UPDATE pedidos_creditos SET estado = 'cancelado' WHERE id = $1 RETURNING *", [id]);
    return pedidoJson(rows[0]);
  }

  // Admin: confirma el pago → acredita (compra + pack_bonus) y avisa. Se puede confirmar también un pedido vencido
  // (pagó tarde): se acredita igual.
  async function confirmarPedido(id, { por = 'admin' } = {}) {
    const res = await enTransaccion(async (db) => {
      const { rows } = await db.query('SELECT * FROM pedidos_creditos WHERE id = $1 FOR UPDATE', [id]);
      const p = rows[0];
      if (!p) throw err(404, 'Pedido no encontrado.');
      if (!['pendiente', 'vencido'].includes(p.estado)) throw err(409, `El pedido ya está ${p.estado}.`);
      const movs = [await mover(db, { cuentaId: p.cuenta_id, tipo: 'compra', centavos: p.base_centavos, refTipo: 'pedido_creditos', refId: p.id, motivo: `${p.pack_nombre} · ${p.codigo}`, por })];
      if (Number(p.bonus_centavos) > 0) {
        movs.push(await mover(db, { cuentaId: p.cuenta_id, tipo: 'pack_bonus', centavos: p.bonus_centavos, refTipo: 'pedido_creditos', refId: p.id, motivo: `Regalo del pack ${p.pack_nombre}`, por }));
      }
      const { rows: up } = await db.query(
        "UPDATE pedidos_creditos SET estado = 'confirmado', confirmado = now(), confirmado_por = $2 WHERE id = $1 RETURNING *", [id, por]);
      const total = Number(p.base_centavos) + Number(p.bonus_centavos);
      await notificar(p.cuenta_id, 'creditos_acreditados', `Acreditamos ${fmtCreditos(total)} créditos (pedido ${p.codigo}).`, db);
      return { pedido: up[0], movimientos: movs, total };
    });
    const s = await saldo(res.pedido.cuenta_id);
    await mail(res.pedido.cuenta_id, `Acreditamos ${fmtNum(res.total / 100)} créditos en tu cuenta`,
      `Hola:\n\nConfirmamos tu pago del pedido ${res.pedido.codigo} (${res.pedido.pack_nombre}) y acreditamos `
      + `${fmtNum(res.total / 100)} créditos. Tu saldo ahora es de ${fmtCreditos(s)} créditos.\n\n`
      + `Con tus créditos podés pagar tu plan, semanas y Destacado desde ${url}/panel/plan\n\n`
      + 'Recordá: los créditos no vencen, no se devuelven en dinero y no se pueden pasar a otra cuenta.\n\nSexyRose');
    await alAcreditar(res.pedido.cuenta_id).catch((e) => log('creditos: reintento de renovación falló:', e.message));
    return { pedido: pedidoJson(res.pedido), movimientos: res.movimientos, saldo: montoJson(await saldo(res.pedido.cuenta_id)), total: res.total };
  }

  async function rechazarPedido(id, { motivo = '', por = 'admin' } = {}) {
    const m = str(motivo, 300);
    const { rows } = await pool.query(
      "UPDATE pedidos_creditos SET estado = 'rechazado', motivo = $2, confirmado_por = $3 WHERE id = $1 AND estado IN ('pendiente', 'vencido') RETURNING *",
      [id, m || null, por]);
    if (!rows[0]) {
      const ex = await pool.query('SELECT estado FROM pedidos_creditos WHERE id = $1', [id]);
      if (!ex.rows[0]) throw err(404, 'Pedido no encontrado.');
      throw err(409, `El pedido ya está ${ex.rows[0].estado}.`);
    }
    await notificar(rows[0].cuenta_id, 'pedido_rechazado', `El pedido ${rows[0].codigo} no se pudo confirmar.${m ? ' Motivo: ' + m : ''}`);
    await mail(rows[0].cuenta_id, `Tu pedido de créditos ${rows[0].codigo} no se pudo confirmar`,
      `Hola:\n\nNo pudimos confirmar el pago del pedido ${rows[0].codigo}.${m ? `\nMotivo: ${m}` : ''}\n\n`
      + `Si ya pagaste, escribinos por WhatsApp con el código del pedido. Podés ver tus pedidos en ${url}/panel/creditos\n\nSexyRose`);
    return pedidoJson(rows[0]);
  }

  // Admin: un pedido vencido o cancelado vuelve a pendiente por 48 h más. Si su código ya lo usa otro pendiente, recibe uno nuevo.
  async function reabrirPedido(id) {
    const { rows } = await pool.query('SELECT * FROM pedidos_creditos WHERE id = $1', [id]);
    const p = rows[0];
    if (!p) throw err(404, 'Pedido no encontrado.');
    if (!['vencido', 'cancelado'].includes(p.estado)) throw err(409, 'Solo se reabren pedidos vencidos o cancelados.');
    for (let i = 0; i < 12; i++) {
      const codigo = i === 0 ? p.codigo : nuevoCodigo();
      try {
        const { rows: up } = await pool.query(
          `UPDATE pedidos_creditos SET estado = 'pendiente', codigo = $2, vence = now() + make_interval(hours => $3), reaperturas = reaperturas + 1
           WHERE id = $1 RETURNING *`, [id, codigo, HORAS_PEDIDO]);
        return pedidoConContacto(up[0]);
      } catch (e) {
        if (e.code === '23505') continue;
        throw e;
      }
    }
    throw err(503, 'No se pudo reabrir el pedido. Probá de nuevo.');
  }

  async function vencerPedidos() {
    const r = await pool.query("UPDATE pedidos_creditos SET estado = 'vencido' WHERE estado = 'pendiente' AND vence <= now()");
    return r.rowCount;
  }

  // Admin: lista con filtros y datos para contestar por WhatsApp (pesos sugeridos y mensaje listo para copiar).
  async function pedidosAdmin({ estado = '', q = '' } = {}) {
    const args = []; const conds = [];
    if (['pendiente', 'confirmado', 'vencido', 'cancelado', 'rechazado'].includes(estado)) { args.push(estado); conds.push(`pc.estado = $${args.length}`); }
    const qq = String(q || '').trim().toUpperCase().slice(0, 40);
    if (qq) {
      const cod = qq.replace(/^SR-?/, '');
      args.push('%' + qq.replace(/[\\%_]/g, (c) => '\\' + c) + '%'); const i = args.length;
      args.push(/^\d{1,4}$/.test(cod) ? 'SR-' + cod + '%' : null); const j = args.length;
      conds.push(`(pc.codigo ILIKE $${i} OR pc.codigo LIKE $${j}::text OR c.email ILIKE $${i} OR p.datos->>'displayName' ILIKE $${i})`);
    }
    const { rows } = await pool.query(
      `SELECT pc.*, c.email, p.slug, p.datos->>'displayName' AS display_name
       FROM pedidos_creditos pc JOIN cuentas c ON c.id = pc.cuenta_id LEFT JOIN perfiles p ON p.cuenta_id = pc.cuenta_id
       ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
       ORDER BY (pc.estado = 'pendiente') DESC, pc.creado DESC LIMIT 500`, args);
    const [cot, msj] = await Promise.all([cotizacion(), mensajes()]);
    const items = rows.map((r) => {
      const ars = arsSugerido(r.paga_usd, cot.arsPorUsd);
      const total = Number(r.base_centavos) + Number(r.bonus_centavos);
      return {
        ...pedidoJson(r),
        cuenta: { email: r.email, slug: r.slug, displayName: r.display_name || '' },
        arsSugerido: ars,
        mensajeSugerido: ars === null ? null : rellenar(msj.admin, {
          codigo: r.codigo, pack: r.pack_nombre, creditos: fmtNum(total / 100), monto: fmtNum(r.paga_usd),
          ars: fmtArs(ars), cotizacion: fmtArs(cot.arsPorUsd), fecha: fmtFechaCorta(cot.fecha),
        }),
      };
    });
    const n = await pool.query("SELECT count(*) FILTER (WHERE estado = 'pendiente')::int AS pendientes, count(*) FILTER (WHERE estado = 'pendiente' AND comprobante_ruta IS NOT NULL)::int AS con_comprobante FROM pedidos_creditos");
    return { items, total: items.length, pendientes: n.rows[0].pendientes, conComprobante: n.rows[0].con_comprobante, cotizacion: cot };
  }

  return {
    saldo, mover, enTransaccion, movimientos, ajusteAdmin, registrarComisionVenta,
    packs, contacto, cotizacion, comision, mensajes, leerAjuste,
    notificar, notificaciones, noLeidas, marcarLeidas,
    crearPedido, pedidosDeCuenta, adjuntarComprobante, cancelarPedido, confirmarPedido, rechazarPedido, reabrirPedido, vencerPedidos, pedidosAdmin,
    pedidoJson, mail, mensajeEjemplo,
    setAlAcreditar(fn) { alAcreditar = typeof fn === 'function' ? fn : async () => {}; },
  };
}

export function textoAHtml(text) {
  const esc = String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  return `<div style="font:15px/1.5 system-ui,sans-serif;color:#222">${esc.replace(/(https:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, '<br>')}</div>`;
}

export function movimientoJson(r) {
  return {
    id: String(r.id), tipo: r.tipo, ...montoJson(r.centavos), saldoDespues: montoJson(r.saldo_despues),
    refTipo: r.ref_tipo, refId: r.ref_id, motivo: r.motivo, creado: r.creado, creadoPor: r.creado_por,
  };
}
