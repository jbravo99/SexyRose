// Cuentas de comisión de Mercado Pago (cada una = una aplicación de Mercado Pago de Juan o de su socio).
// Se cargan desde Admin → Ajustes → Venta de contenido y se guardan cifradas en la tabla mp_cuentas (lib/secretos.js,
// clave SECRETS_KEY del servidor). Las del .env (MP_CUENTA_<n>_*) siguen funcionando y se muestran como
// "desde el servidor" (solo lectura).
// `lista` es el mismo arreglo que usa lib/contenido.js: se actualiza en el lugar (primero las del admin, después las
// del servidor), así la venta de contenido, el webhook y la renovación de tokens ven los cambios sin reiniciar.
// Los secretos nunca salen hacia el navegador: listar() devuelve solo los últimos 4 caracteres.
import { cifrarSecreto, descifrarSecreto, secretosDisponibles, ultimos4 } from './secretos.js';

export class MpCuentasError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const he = (status, message) => new MpCuentasError(status, message);
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max + 1) : '');
const ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

export function createMpCuentas({ pool, secretsKey = '', envCuentas = [], lista = [], mp = null, log = () => {}, onChange = () => {} }) {
  const conClave = secretosDisponibles(secretsKey);
  const env = envCuentas.map((c) => ({ ...c, origen: 'servidor' }));
  let ilegibles = []; // filas guardadas que no se pueden descifrar (falta SECRETS_KEY o cambió)

  function publicar(desdeDb) {
    // Primero las del .env y después las del admin (por fecha): si nunca se eligió la activa, sigue siendo la primera
    // del .env y agregar una cuenta nueva desde el admin no cambia a quién le llega la comisión.
    lista.splice(0, lista.length, ...env.filter((e) => !desdeDb.some((d) => d.id === e.id)), ...desdeDb);
  }
  async function cargar() {
    const { rows } = await pool.query('SELECT * FROM mp_cuentas ORDER BY creado');
    const ok = []; const malas = [];
    for (const r of rows) {
      const clientSecret = descifrarSecreto(secretsKey, r.client_secret_cifrado);
      const webhookSecret = descifrarSecreto(secretsKey, r.webhook_secret_cifrado);
      if (clientSecret == null || webhookSecret == null) { malas.push({ id: r.client_id, nombre: r.nombre }); continue; }
      ok.push({ id: r.client_id, nombre: r.nombre, clientId: r.client_id, clientSecret, webhookSecret, origen: 'admin', creado: r.creado, actualizado: r.actualizado });
    }
    ilegibles = malas;
    if (malas.length) log(`mercado pago: ${malas.length} cuenta(s) guardada(s) en el admin no se pueden leer (¿falta o cambió SECRETS_KEY?)`);
    publicar(ok);
    return lista;
  }

  function listar() {
    return {
      secretos: conClave,
      cuentas: lista.map((c) => ({
        id: c.id, nombre: c.nombre, clientId: c.clientId, origen: c.origen || 'servidor',
        secretoFin: ultimos4(c.clientSecret), webhookFin: ultimos4(c.webhookSecret),
        completa: Boolean(c.clientId && c.clientSecret && c.webhookSecret),
      })),
      ilegibles,
    };
  }

  function validar(b, { nueva }) {
    const nombre = str(b.nombre, 60);
    if (!nombre || nombre.length > 60) throw he(400, 'Poné un nombre de hasta 60 caracteres (por ejemplo, el de quien cobra).');
    const out = { nombre };
    if (nueva) {
      const clientId = str(b.clientId, 64);
      if (!ID_RE.test(clientId)) throw he(400, 'El Client ID no es válido. Copialo de la aplicación en Mercado Pago (Tus integraciones → Credenciales de producción).');
      out.clientId = clientId;
    }
    for (const [k, etiqueta] of [['clientSecret', 'El Client Secret'], ['webhookSecret', 'La clave secreta de las notificaciones']]) {
      const v = str(b[k], 200);
      if (!v) { if (nueva) throw he(400, `${etiqueta} es obligatorio.`); continue; }
      if (v.length < 8 || v.length > 200 || /\s/.test(v)) throw he(400, `${etiqueta} no es válido.`);
      out[k] = v;
    }
    return out;
  }
  const exigirClave = () => {
    if (!conClave) throw he(409, 'Para guardar cuentas desde el admin falta la variable SECRETS_KEY en el servidor.');
  };
  const delAdmin = (id) => lista.find((c) => c.id === id && c.origen === 'admin') || null;

  async function crear(body) {
    exigirClave();
    const v = validar(body || {}, { nueva: true });
    if (lista.some((c) => c.id === v.clientId) || ilegibles.some((c) => c.id === v.clientId)) throw he(409, 'Esa aplicación de Mercado Pago ya está cargada.');
    await pool.query(
      `INSERT INTO mp_cuentas (client_id, nombre, client_secret_cifrado, webhook_secret_cifrado) VALUES ($1, $2, $3, $4)`,
      [v.clientId, v.nombre, cifrarSecreto(secretsKey, v.clientSecret), cifrarSecreto(secretsKey, v.webhookSecret)]);
    await cargar(); onChange();
    return listar();
  }
  // Dejar un secreto vacío = conservar el que estaba. El Client ID no se cambia (es la aplicación): borrar y cargar de nuevo.
  async function editar(id, body) {
    exigirClave();
    if (!delAdmin(id)) throw he(404, 'Esa cuenta no existe o está configurada en el servidor (no se edita desde acá).');
    const v = validar(body || {}, { nueva: false });
    await pool.query(
      `UPDATE mp_cuentas SET nombre = $2,
              client_secret_cifrado = COALESCE($3, client_secret_cifrado),
              webhook_secret_cifrado = COALESCE($4, webhook_secret_cifrado), actualizado = now()
        WHERE client_id = $1`,
      [id, v.nombre, v.clientSecret ? cifrarSecreto(secretsKey, v.clientSecret) : null, v.webhookSecret ? cifrarSecreto(secretsKey, v.webhookSecret) : null]);
    await cargar(); onChange();
    return listar();
  }
  async function borrar(id) {
    const existe = delAdmin(id) || ilegibles.find((c) => c.id === id);
    if (!existe) throw he(404, 'Esa cuenta no existe o está configurada en el servidor (no se borra desde acá).');
    await pool.query('DELETE FROM mp_cuentas WHERE client_id = $1', [id]);
    await cargar(); onChange();
    return listar();
  }
  // Pide un token de la aplicación a Mercado Pago. No dice nada de la clave del webhook (esa se comprueba con la
  // primera notificación).
  async function probar(id) {
    const c = lista.find((x) => x.id === id);
    if (!c) throw he(404, 'Esa cuenta no existe.');
    if (!c.clientId || !c.clientSecret) return { ok: false, mensaje: 'Faltan el Client ID o el Client Secret.' };
    if (!mp) return { ok: false, mensaje: 'Sin conexión con Mercado Pago.' };
    try {
      const t = await mp.probarCredenciales({ clientId: c.clientId, clientSecret: c.clientSecret });
      if (t && t.access_token) return { ok: true, mensaje: 'Mercado Pago aceptó el Client ID y el Client Secret.' };
      return { ok: false, mensaje: 'Mercado Pago no devolvió un token.' };
    } catch (e) {
      const st = e && e.status;
      if (st === 400 || st === 401 || st === 403) return { ok: false, mensaje: 'Mercado Pago rechazó el Client ID o el Client Secret. Revisá que sean las credenciales de producción de esa aplicación.' };
      return { ok: false, mensaje: (e && e.message) || 'No se pudo conectar con Mercado Pago.' };
    }
  }

  publicar([]);
  return { cargar, listar, crear, editar, borrar, probar, secretos: conClave };
}
