// Cliente mínimo de Mercado Pago (Argentina) para la venta de contenido: OAuth de las vendedoras (marketplace),
// preferencias de Checkout Pro, consulta de pagos y firma de las notificaciones (webhooks).
// Documentación: https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/how-tos/integrate-marketplace
//               https://www.mercadopago.com.ar/developers/es/docs/security/oauth
//               https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
// fetchImpl se inyecta en las pruebas (nunca se sale a la red en los tests).
import crypto from 'node:crypto';

export const MP_AUTH_URL = 'https://auth.mercadopago.com.ar/authorization';
export const MP_API = 'https://api.mercadopago.com';
const TIMEOUT_MS = 10000;

export class MpError extends Error {
  constructor(message, { status = 0, code = null, data = null } = {}) {
    super(message); this.status = status; this.code = code; this.data = data;
  }
}

// Cuentas de comisión del .env: MP_CUENTA_<n>_NOMBRE, _CLIENT_ID, _CLIENT_SECRET, _WEBHOOK_SECRET (n = 1..9).
// id = client_id (el número de la aplicación): los tokens de las vendedoras quedan atados a esa aplicación.
export function cuentasDesdeEnv(env = process.env) {
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const out = [];
  for (let n = 1; n <= 9; n++) {
    const p = `MP_CUENTA_${n}_`;
    const clientId = str(env[p + 'CLIENT_ID']);
    const nombre = str(env[p + 'NOMBRE']);
    if (!clientId && !nombre) continue;
    out.push({ id: clientId || `cuenta-${n}`, nombre: nombre || `Cuenta ${n}`, clientId, clientSecret: str(env[p + 'CLIENT_SECRET']), webhookSecret: str(env[p + 'WEBHOOK_SECRET']) });
  }
  return out;
}
// Lista para usar: con client_id, client_secret y secreto de webhooks.
export const cuentaCompleta = (c) => !!(c && c.clientId && c.clientSecret && c.webhookSecret);

// Firma de las notificaciones: cabecera x-signature "ts=<seg>,v1=<hmac hex>" y x-request-id.
// Plantilla: "id:<data.id de la URL>;request-id:<x-request-id>;ts:<ts>;" (data.id en minúsculas si es alfanumérico;
// se omite cada parte que no venga). HMAC-SHA256 con el secreto de la aplicación.
export function manifiestoFirma({ dataId, requestId, ts }) {
  let m = '';
  if (dataId) m += `id:${/^[a-z0-9]+$/i.test(dataId) ? String(dataId).toLowerCase() : dataId};`;
  if (requestId) m += `request-id:${requestId};`;
  if (ts) m += `ts:${ts};`;
  return m;
}
export function parseFirma(header) {
  const out = {};
  String(header || '').split(',').forEach((p) => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
  return { ts: out.ts || null, v1: out.v1 || null };
}
export function firmar(secret, datos) {
  return crypto.createHmac('sha256', secret).update(manifiestoFirma(datos)).digest('hex');
}
// toleranciaSeg: descarta notificaciones con ts muy viejo (repetición). 0 = sin control de tiempo.
export function firmaValida({ secret, header, requestId, dataId, ahora = Date.now(), toleranciaSeg = 0 }) {
  if (!secret) return false;
  const { ts, v1 } = parseFirma(header);
  if (!ts || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  if (toleranciaSeg > 0) {
    const t = Number(ts); const ms = t > 1e12 ? t : t * 1000;
    if (!Number.isFinite(ms) || Math.abs(ahora - ms) > toleranciaSeg * 1000) return false;
  }
  const esperado = Buffer.from(firmar(secret, { dataId, requestId, ts }), 'hex');
  const recibido = Buffer.from(v1.toLowerCase(), 'hex');
  return esperado.length === recibido.length && crypto.timingSafeEqual(esperado, recibido);
}

export function createMercadoPago({ fetchImpl = null, authUrl = MP_AUTH_URL, apiBase = MP_API } = {}) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);

  async function pedir(method, path, { token = null, form = null, json = null, idem = null } = {}) {
    if (!doFetch) throw new MpError('Sin conexión a Mercado Pago.');
    const headers = { Accept: 'application/json' };
    let body;
    if (token) headers.Authorization = 'Bearer ' + token;
    if (form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
    if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (idem) headers['X-Idempotency-Key'] = idem;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    let r;
    try {
      r = await doFetch(apiBase + path, { method, headers, body, signal: ctl.signal });
    } catch (e) {
      throw new MpError(e.name === 'AbortError' ? 'Mercado Pago no respondió a tiempo.' : 'No se pudo conectar con Mercado Pago.', { code: 'red' });
    } finally { clearTimeout(t); }
    let data = null;
    try { data = await r.json(); } catch { /* sin JSON */ }
    if (!r.ok) {
      const code = data && (data.error || data.code || data.message) ? String(data.error || data.code || data.message) : null;
      throw new MpError(`Mercado Pago respondió ${r.status}${code ? ' (' + code + ')' : ''}.`, { status: r.status, code, data });
    }
    return data || {};
  }

  return {
    // Dirección a la que se manda a la vendedora para que autorice a la aplicación.
    urlAutorizacion({ clientId, redirectUri, estado }) {
      const u = new URL(authUrl);
      u.searchParams.set('client_id', clientId);
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('platform_id', 'mp');
      u.searchParams.set('state', estado);
      u.searchParams.set('redirect_uri', redirectUri);
      return u.toString();
    },
    // code → { access_token, refresh_token, expires_in, user_id, public_key, ... }
    canjearCodigo({ clientId, clientSecret, code, redirectUri }) {
      return pedir('POST', '/oauth/token', { form: { client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code, redirect_uri: redirectUri } });
    },
    // Renovación: devuelve un access_token y un refresh_token NUEVOS (el viejo deja de servir).
    renovar({ clientId, clientSecret, refreshToken }) {
      return pedir('POST', '/oauth/token', { form: { client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken } });
    },
    // Admin → "Probar": pide un token de la propia aplicación (client_credentials). Si responde, las credenciales sirven.
    probarCredenciales({ clientId, clientSecret }) {
      return pedir('POST', '/oauth/token', { form: { client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' } });
    },
    crearPreferencia(token, preferencia, idem) {
      return pedir('POST', '/checkout/preferences', { token, json: preferencia, idem });
    },
    pago(token, id) {
      return pedir('GET', '/v1/payments/' + encodeURIComponent(id), { token });
    },
    // Pagos de una venta (external_reference), por si la notificación todavía no llegó.
    buscarPagos(token, externalReference) {
      return pedir('GET', '/v1/payments/search?sort=date_created&criteria=desc&external_reference=' + encodeURIComponent(externalReference), { token });
    },
  };
}
