// Cotización del dólar para sugerir el monto en pesos de cada pedido de créditos (Admin → Pedidos).
// Modo automático: dólar blue de DolarApi (https://dolarapi.com, principal) o Bluelytics (respaldo), cada 3 horas
// (DolarApi recomienda ~1 consulta cada 3 h por serie) y con el botón "Actualizar ahora" del admin.
// Se usa el valor de VENTA por defecto: es lo que cuesta comprar un dólar, o sea lo que vale en pesos un precio en USD.
// Guardia: si el valor nuevo difiere más de 25 % del que está en uso, no se aplica (queda el anterior y una alerta).
// Modo manual: el admin carga el valor a mano; la tarea igual guarda compra/venta del blue como referencia.
import { COTIZACION_DEFAULT } from './creditos.js';

export const COTIZACION_URL = 'https://dolarapi.com/v1/dolares/blue';
export const COTIZACION_FALLBACK_URL = 'https://api.bluelytics.com.ar/v2/latest';
export const INTERVALO_MS = 3 * 60 * 60 * 1000;
export const MAX_SALTO = 0.25;
const TIMEOUT_MS = 8000;

const valido = (x) => { const n = Number(x); return Number.isFinite(n) && n > 100 && n < 100000 ? Math.round(n * 100) / 100 : null; };
const fechaIso = (x) => { const d = new Date(x); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

export function parseDolarApi(j) {
  if (!j || typeof j !== 'object') return null;
  const compra = valido(j.compra), venta = valido(j.venta);
  if (compra === null || venta === null) return null;
  return { compra, venta, fechaFuente: fechaIso(j.fechaActualizacion) || new Date().toISOString(), fuente: 'DolarApi' };
}
export function parseBluelytics(j) {
  const b = j && j.blue;
  if (!b || typeof b !== 'object') return null;
  const compra = valido(b.value_buy), venta = valido(b.value_sell);
  if (compra === null || venta === null) return null;
  return { compra, venta, fechaFuente: fechaIso(j.last_update) || new Date().toISOString(), fuente: 'Bluelytics' };
}

// Normaliza lo guardado (formato viejo {arsPorUsd, fecha, nota} = manual).
export function normalizar(v) {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const viejo = !('modo' in o) && o.arsPorUsd != null;
  return {
    ...COTIZACION_DEFAULT,
    modo: o.modo === 'manual' || viejo ? 'manual' : 'auto',
    valor: o.valor === 'compra' ? 'compra' : 'venta',
    arsPorUsd: o.arsPorUsd ?? null,
    compra: o.compra ?? null,
    venta: o.venta ?? null,
    fuenteBlue: o.fuenteBlue || null,
    fechaBlue: o.fechaBlue || null,
    fuente: o.fuente || (o.arsPorUsd != null ? 'manual' : null),
    fechaFuente: o.fechaFuente || o.fecha || null,
    fecha: o.fecha || null,
    alerta: o.alerta || null,
    nota: typeof o.nota === 'string' ? o.nota : '',
  };
}

// Valida lo que manda el admin. Compatible con el formato viejo: {arsPorUsd, nota} sin modo = carga manual.
export function validarCotizacionV2(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { error: 'Formato inválido: {modo, valor, arsPorUsd, nota}.' };
  let modo = v.modo;
  if (modo === undefined) modo = v.arsPorUsd !== undefined && v.arsPorUsd !== null && v.arsPorUsd !== '' ? 'manual' : 'auto';
  if (!['auto', 'manual'].includes(modo)) return { error: 'El modo tiene que ser automático o manual.' };
  const valor = v.valor === undefined ? undefined : v.valor;
  if (valor !== undefined && !['venta', 'compra'].includes(valor)) return { error: 'Elegí si se usa el valor de compra o de venta.' };
  let ars;
  if (modo === 'manual') {
    if (v.arsPorUsd === null || v.arsPorUsd === '' || v.arsPorUsd === undefined) ars = null;
    else {
      const n = Number(v.arsPorUsd);
      if (!Number.isFinite(n) || n <= 0 || n > 100000000) return { error: 'La cotización tiene que ser un número mayor a 0.' };
      ars = Math.round(n * 100) / 100;
    }
  }
  const nota = typeof v.nota === 'string' ? v.nota.trim().slice(0, 200) : undefined;
  return { valor: { modo, valor, arsPorUsd: ars, nota } };
}

export function createCotizacion({ pool, log = () => {}, notify = async () => {}, fetchImpl = null, url, fallbackUrl, now = () => Date.now() } = {}) {
  const urlA = url || process.env.COTIZACION_URL || COTIZACION_URL;
  const urlB = fallbackUrl || process.env.COTIZACION_FALLBACK_URL || COTIZACION_FALLBACK_URL;
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  let timer = null;
  let enCurso = null;
  let ultimaAlertaAvisada = null;
  let ultimoManual = 0;

  const leer = async () => {
    const { rows } = await pool.query("SELECT valor FROM ajustes WHERE clave = 'cotizacion'");
    return normalizar(rows[0] ? rows[0].valor : null);
  };
  const guardar = async (c) => {
    await pool.query(
      "INSERT INTO ajustes (clave, valor, actualizado) VALUES ('cotizacion', $1::jsonb, now()) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado = now()",
      [JSON.stringify(c)]);
    return c;
  };

  const traer = async (u, parse) => {
    if (!doFetch) throw new Error('sin fetch');
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const r = await doFetch(u, { signal: ctl.signal, headers: { 'User-Agent': 'SexyRose/1.0', Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = parse(await r.json());
      if (!d) throw new Error('respuesta inválida');
      return d;
    } finally { clearTimeout(t); }
  };

  // Consulta las fuentes y aplica según el modo. Nunca lanza por un error de red: devuelve la cotización vigente.
  const actualizar = async () => {
    if (enCurso) return enCurso;
    enCurso = (async () => {
      let d = null;
      try { d = await traer(urlA, parseDolarApi); } catch (e) {
        log('cotización: DolarApi no respondió (' + (e.name === 'AbortError' ? 'timeout' : e.message) + '), pruebo Bluelytics');
        try { d = await traer(urlB, parseBluelytics); } catch (e2) {
          log('cotización: Bluelytics tampoco (' + (e2.name === 'AbortError' ? 'timeout' : e2.message) + '); queda la anterior');
        }
      }
      const actual = await leer();
      if (!d) return { cotizacion: actual, actualizada: false, error: 'No se pudo consultar el dólar blue. Queda la cotización anterior.' };
      const nuevo = { ...actual, compra: d.compra, venta: d.venta, fuenteBlue: d.fuente, fechaBlue: d.fechaFuente };
      if (actual.modo === 'manual') {
        // Solo referencia: no se toca el valor en uso.
        await guardar(nuevo);
        return { cotizacion: nuevo, actualizada: false };
      }
      const valorNuevo = actual.valor === 'compra' ? d.compra : d.venta;
      const enUso = Number(actual.arsPorUsd);
      if (enUso > 0 && Math.abs(valorNuevo - enUso) / enUso > MAX_SALTO) {
        const alerta = `El dólar blue informado (${d.fuente}: ${valorNuevo}) difiere más de 25 % del que está en uso (${enUso}). No se aplicó: revisalo y, si es correcto, tocá «Actualizar ahora» para aplicarlo igual (o pasá a manual).`;
        const c = { ...nuevo, alerta };
        await guardar(c);
        const clave = `${d.fuente}:${valorNuevo}`;
        if (ultimaAlertaAvisada !== clave) {
          ultimaAlertaAvisada = clave;
          try { await notify(`Cotización: salto mayor a 25 %\n${d.fuente} ${actual.valor} ${valorNuevo} (en uso ${enUso}).\nNo se aplicó. Revisar en Admin → Ajustes.`); } catch { /* */ }
        }
        return { cotizacion: c, actualizada: false, alerta };
      }
      const c = { ...nuevo, arsPorUsd: valorNuevo, fuente: d.fuente, fechaFuente: d.fechaFuente, fecha: new Date(now()).toISOString(), alerta: null };
      await guardar(c);
      ultimaAlertaAvisada = null;
      return { cotizacion: c, actualizada: true };
    })();
    try { return await enCurso; } finally { enCurso = null; }
  };

  // Guarda lo que manda el admin (ya validado con validarCotizacionV2) y, si queda en automático, actualiza al toque.
  const aplicarAdmin = async (v) => {
    const actual = await leer();
    const c = { ...actual, modo: v.modo };
    if (v.valor) c.valor = v.valor;
    if (v.nota !== undefined) c.nota = v.nota;
    if (v.modo === 'manual') {
      c.arsPorUsd = v.arsPorUsd;
      c.fuente = 'manual';
      c.fecha = v.arsPorUsd === null ? null : new Date(now()).toISOString();
      c.fechaFuente = c.fecha;
      c.alerta = null;
      await guardar(c);
      return c;
    }
    c.alerta = null;
    // En automático, si ya hay compra/venta guardadas, se aplica el valor elegido sin esperar a la red.
    const ref = c.valor === 'compra' ? c.compra : c.venta;
    if (ref) { c.arsPorUsd = ref; c.fuente = c.fuenteBlue || 'DolarApi'; c.fechaFuente = c.fechaBlue || c.fechaFuente; c.fecha = new Date(now()).toISOString(); }
    await guardar(c);
    if (doFetch) {
      // Con el salto de 25 % comparado contra el valor manual previo podría bloquearse: en el cambio a automático se
      // parte del último blue guardado (si existe) para que la guardia compare contra algo comparable.
      const r = await actualizar();
      return r.cotizacion;
    }
    return c;
  };

  // Botón "Actualizar ahora": como máximo uno cada 5 minutos.
  const actualizarManual = async () => {
    const t = now();
    if (t - ultimoManual < 5 * 60 * 1000) {
      const espera = Math.ceil((5 * 60 * 1000 - (t - ultimoManual)) / 60000);
      const e = new Error(`Ya se actualizó hace poco. Probá de nuevo en ${espera} min.`); e.status = 429; throw e;
    }
    ultimoManual = t;
    // "Actualizar ahora" en automático con alerta: el admin lo pidió, se aplica aunque supere el 25 %.
    const actual = await leer();
    if (actual.modo === 'auto' && actual.alerta) {
      await guardar({ ...actual, arsPorUsd: null });
    }
    return actualizar();
  };

  const iniciarTarea = ({ listo = () => true, intervaloMs = INTERVALO_MS } = {}) => {
    if (!doFetch || timer) return;
    const tick = async () => {
      if (!listo()) return;
      try { await actualizar(); } catch (e) { log('cotización: error al actualizar:', e.code || e.message); }
    };
    // Primera consulta apenas la base esté lista.
    const arranque = setInterval(() => { if (listo()) { clearInterval(arranque); tick(); } }, 2000);
    arranque.unref?.();
    timer = setInterval(tick, intervaloMs);
    timer.unref?.();
    timer._arranque = arranque;
  };
  const detenerTarea = () => { if (timer) { clearInterval(timer._arranque); clearInterval(timer); timer = null; } };

  return { leer, actualizar, actualizarManual, aplicarAdmin, iniciarTarea, detenerTarea };
}
