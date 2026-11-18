// Cuentas para las transferencias de los pedidos de créditos (18/11/2026, decisión de Juan: varios alias y que el bot
// vaya rotando). Dos listas: pesos (ARS) y dólares (USD); cada cuenta = alias + titular + activa/pausada + lugar.
// Las usan el asistente (lib/asistente.js, en el contenedor "agente") y el admin (routes/admin-asistente.js).
//
// Rotación: una cuenta por pedido, por turno, entre las ACTIVAS de esa moneda. Se asigna la primera vez que se le pasan
// los datos para transferir ese pedido en esa moneda y queda copiada en el pedido (pedidos_transferencia): los pedidos
// de los datos del mismo pedido devuelven siempre la misma, aunque después la cuenta se pause, se edite o se borre.
// Seguro con pedidos a la vez: el pedido y el turno de la moneda se toman con FOR UPDATE (siempre en ese orden).
// Nada de esto se le muestra a las acompañantes: solo ven el alias y el titular de su pedido.
// Ver db/290-alias-rotacion.sql y FASE1-CONTRATO.md → "Cuentas para las transferencias".

export const MONEDAS = Object.freeze(['ARS', 'USD']);
export const MAX_CUENTAS = 20;                // por moneda
const NOMBRE = { ARS: 'pesos', USD: 'dólares' };

const str = (v, max) => (typeof v === 'string' ? v.normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, max) : '');

// Alias: 6 a 20 caracteres, letras, números, puntos y guiones (regla de los bancos). Titular: 3 a 80, letras, espacios,
// puntos, comas, guiones y & (lo ve la acompañante para comprobarlo antes de transferir). Los dos obligatorios.
export function validarCuenta(v) {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const alias = str(o.alias, 40);
  const titular = str(o.titular, 120);
  if (!alias || !titular) return { error: 'Completá el alias y el nombre del titular.' };
  if (!/^[A-Za-z0-9.-]{6,20}$/.test(alias)) return { error: 'El alias tiene que tener de 6 a 20 caracteres: letras, números, puntos o guiones (sin espacios).' };
  if (titular.length < 3 || titular.length > 80) return { error: 'El nombre del titular tiene que tener entre 3 y 80 caracteres.' };
  if (!/^[\p{L}\p{M} .,'&-]+$/u.test(titular)) return { error: 'El nombre del titular solo puede tener letras, espacios, puntos, comas, guiones y &.' };
  return { valor: { alias, titular } };
}

class CuentaError extends Error { constructor(status, message) { super(message); this.status = status; this.expose = true; } }
const ce = (s, m) => new CuentaError(s, m);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cuentaJson = (r) => ({
  id: r.id, moneda: r.moneda, alias: r.alias, titular: r.titular, activo: r.activo, orden: r.orden,
  pedidos: Number(r.pedidos || 0), creado: r.creado, actualizado: r.actualizado,
});

// Las dos listas en orden, con cuántos pedidos recibieron cada cuenta y cuál toca a continuación (solo para el admin).
export async function listarCuentas(db) {
  const [{ rows }, rot] = await Promise.all([
    db.query(`SELECT tc.*, (SELECT count(*) FROM pedidos_transferencia pt WHERE pt.cuenta_id = tc.id) AS pedidos
              FROM transferencia_cuentas tc ORDER BY tc.moneda, tc.orden, tc.creado`),
    db.query('SELECT moneda, ultimo_orden FROM transferencia_rotacion'),
  ]);
  const ult = Object.fromEntries(rot.rows.map((r) => [r.moneda, r.ultimo_orden]));
  const out = { ARS: [], USD: [] };
  for (const r of rows) out[r.moneda].push(cuentaJson(r));
  for (const m of MONEDAS) {
    const sig = siguiente(out[m].filter((c) => c.activo), ult[m]);
    for (const c of out[m]) c.siguiente = Boolean(sig && c.id === sig.id);
  }
  return out;
}

// La primera activa después de la última que se pasó; al final de la lista, vuelve a la primera.
function siguiente(activas, ultimoOrden) {
  if (!activas.length) return null;
  if (ultimoOrden === null || ultimoOrden === undefined) return activas[0];
  return activas.find((c) => c.orden > ultimoOrden) || activas[0];
}

export async function hayCuentaActiva(db, moneda) {
  const { rows } = await db.query('SELECT 1 FROM transferencia_cuentas WHERE moneda = $1 AND activo LIMIT 1', [moneda]);
  return Boolean(rows[0]);
}

const snapJson = (r) => (r ? { moneda: r.moneda, cuentaId: r.cuenta_id, alias: r.alias, titular: r.titular, asignado: r.asignado } : null);

// La cuenta que ya se le pasó a un pedido en esa moneda (o null). Sin moneda: { ARS, USD }.
export async function cuentaDelPedido(db, pedidoId, moneda = null) {
  const { rows } = await db.query('SELECT * FROM pedidos_transferencia WHERE pedido_id = $1', [pedidoId]);
  if (moneda) return snapJson(rows.find((r) => r.moneda === moneda));
  return { ARS: snapJson(rows.find((r) => r.moneda === 'ARS')), USD: snapJson(rows.find((r) => r.moneda === 'USD')) };
}

// Las de varios pedidos (lista del admin): Map pedidoId → { ARS, USD }.
export async function cuentasDePedidos(db, ids) {
  const m = new Map();
  if (!ids.length) return m;
  const { rows } = await db.query('SELECT * FROM pedidos_transferencia WHERE pedido_id = ANY($1::uuid[])', [ids]);
  for (const r of rows) {
    if (!m.has(r.pedido_id)) m.set(r.pedido_id, { ARS: null, USD: null });
    m.get(r.pedido_id)[r.moneda] = snapJson(r);
  }
  return m;
}

// La cuenta para transferir ese pedido en esa moneda: la que ya tenía o, la primera vez, la que toca por turno.
// null = no hay ninguna cuenta activa en esa moneda (el asistente responde "En un rato te paso los datos").
export async function asignarCuenta(pool, pedidoId, moneda) {
  if (!MONEDAS.includes(moneda)) throw new Error('moneda inválida');
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const p = await c.query('SELECT id FROM pedidos_creditos WHERE id = $1 FOR UPDATE', [pedidoId]);
    if (!p.rows[0]) { await c.query('ROLLBACK'); return null; }
    const ya = await c.query('SELECT * FROM pedidos_transferencia WHERE pedido_id = $1 AND moneda = $2', [pedidoId, moneda]);
    if (ya.rows[0]) { await c.query('COMMIT'); return snapJson(ya.rows[0]); }
    await c.query('INSERT INTO transferencia_rotacion (moneda) VALUES ($1) ON CONFLICT DO NOTHING', [moneda]);
    const rot = await c.query('SELECT ultimo_orden FROM transferencia_rotacion WHERE moneda = $1 FOR UPDATE', [moneda]);
    const act = await c.query('SELECT id, alias, titular, orden FROM transferencia_cuentas WHERE moneda = $1 AND activo ORDER BY orden, creado', [moneda]);
    const sig = siguiente(act.rows, rot.rows[0].ultimo_orden);
    if (!sig) { await c.query('COMMIT'); return null; }
    await c.query('UPDATE transferencia_rotacion SET ultimo_orden = $2 WHERE moneda = $1', [moneda, sig.orden]);
    const { rows } = await c.query(
      `INSERT INTO pedidos_transferencia (pedido_id, moneda, cuenta_id, alias, titular) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [pedidoId, moneda, sig.id, sig.alias, sig.titular]);
    await c.query('COMMIT');
    return snapJson(rows[0]);
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

// ---------- Admin: agregar, editar, pausar/reanudar, borrar y ordenar ----------
const idOk = (id) => { if (!UUID_RE.test(String(id || ''))) throw ce(404, 'Cuenta no encontrada.'); return id; };
const duplicado = (e, moneda) => {
  if (e && e.code === '23505') return ce(400, `Ese alias ya está en la lista de ${NOMBRE[moneda]}.`);
  return e;
};

export async function crearCuenta(db, body) {
  const b = body && typeof body === 'object' ? body : {};
  if (!MONEDAS.includes(b.moneda)) throw ce(400, 'Elegí la moneda: pesos (ARS) o dólares (USD).');
  const v = validarCuenta(b);
  if (v.error) throw ce(400, v.error);
  if (b.activo !== undefined && typeof b.activo !== 'boolean') throw ce(400, 'activo tiene que ser verdadero o falso.');
  const n = await db.query('SELECT count(*)::int AS n, COALESCE(max(orden), 0)::int AS max FROM transferencia_cuentas WHERE moneda = $1', [b.moneda]);
  if (n.rows[0].n >= MAX_CUENTAS) throw ce(400, `Ya hay ${MAX_CUENTAS} cuentas en ${NOMBRE[b.moneda]}: borrá alguna para agregar otra.`);
  try {
    const { rows } = await db.query(
      'INSERT INTO transferencia_cuentas (moneda, alias, titular, activo, orden) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [b.moneda, v.valor.alias, v.valor.titular, b.activo !== false, n.rows[0].max + 1]);
    return cuentaJson(rows[0]);
  } catch (e) { throw duplicado(e, b.moneda); }
}

// Cambios parciales: { alias, titular } (los dos juntos) y/o { activo }. La moneda no cambia.
export async function editarCuenta(db, id, body) {
  idOk(id);
  const b = body && typeof body === 'object' ? body : {};
  const { rows: act } = await db.query('SELECT * FROM transferencia_cuentas WHERE id = $1', [id]);
  if (!act[0]) throw ce(404, 'Cuenta no encontrada.');
  const sets = []; const args = [id];
  if (b.alias !== undefined || b.titular !== undefined) {
    const v = validarCuenta({ alias: b.alias ?? act[0].alias, titular: b.titular ?? act[0].titular });
    if (v.error) throw ce(400, v.error);
    args.push(v.valor.alias); sets.push(`alias = $${args.length}`);
    args.push(v.valor.titular); sets.push(`titular = $${args.length}`);
  }
  if (b.activo !== undefined) {
    if (typeof b.activo !== 'boolean') throw ce(400, 'activo tiene que ser verdadero o falso.');
    args.push(b.activo); sets.push(`activo = $${args.length}`);
  }
  if (!sets.length) throw ce(400, 'No hay nada para cambiar.');
  try {
    const { rows } = await db.query(`UPDATE transferencia_cuentas SET ${sets.join(', ')}, actualizado = now() WHERE id = $1 RETURNING *`, args);
    return cuentaJson(rows[0]);
  } catch (e) { throw duplicado(e, act[0].moneda); }
}

// Los pedidos que ya la recibieron la conservan (copia en pedidos_transferencia).
export async function borrarCuenta(db, id) {
  idOk(id);
  const { rowCount } = await db.query('DELETE FROM transferencia_cuentas WHERE id = $1', [id]);
  if (!rowCount) throw ce(404, 'Cuenta no encontrada.');
}

// Subir / bajar un lugar dentro de su lista (intercambia el orden con la vecina). En el borde no hace nada.
export async function moverCuenta(pool, id, dir) {
  idOk(id);
  if (dir !== 'arriba' && dir !== 'abajo') throw ce(400, 'dir tiene que ser "arriba" o "abajo".');
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const { rows } = await c.query('SELECT id, moneda, orden FROM transferencia_cuentas WHERE id = $1', [id]);
    if (!rows[0]) throw ce(404, 'Cuenta no encontrada.');
    const { moneda } = rows[0];
    const lista = (await c.query('SELECT id, orden FROM transferencia_cuentas WHERE moneda = $1 ORDER BY orden, creado FOR UPDATE', [moneda])).rows;
    const i = lista.findIndex((x) => x.id === id);
    const j = dir === 'arriba' ? i - 1 : i + 1;
    if (j >= 0 && j < lista.length) {
      // Renumera 1..n con las dos cambiadas de lugar (deja el orden prolijo aunque hubiera huecos o empates)
      [lista[i], lista[j]] = [lista[j], lista[i]];
      for (let k = 0; k < lista.length; k++) {
        if (lista[k].orden !== k + 1) await c.query('UPDATE transferencia_cuentas SET orden = $2, actualizado = now() WHERE id = $1', [lista[k].id, k + 1]);
      }
    }
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
