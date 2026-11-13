// Secretos guardados en la base (hoy: las cuentas de Mercado Pago que se cargan desde el admin).
// AES-256-GCM con una clave derivada de SECRETS_KEY (variable del servidor, nunca en la base ni en el navegador).
// Sin SECRETS_KEY no se puede guardar ni leer ningún secreto: el admin lo avisa y deshabilita el formulario.
import crypto from 'node:crypto';

const PREFIJO = 'v1:';
export const secretosDisponibles = (secretsKey) => typeof secretsKey === 'string' && secretsKey.trim().length >= 16;
const clave = (secretsKey) => Buffer.from(crypto.hkdfSync('sha256', Buffer.from(secretsKey.trim(), 'utf8'), Buffer.from('sexyrose-secretos'), Buffer.from('admin'), 32));

export function cifrarSecreto(secretsKey, plano) {
  if (!secretosDisponibles(secretsKey)) throw new Error('Falta SECRETS_KEY.');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', clave(secretsKey), iv);
  const enc = Buffer.concat([c.update(String(plano), 'utf8'), c.final()]);
  return PREFIJO + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}

// null si no hay clave, si el texto no es nuestro o si la clave no es la misma con la que se guardó.
export function descifrarSecreto(secretsKey, guardado) {
  if (!secretosDisponibles(secretsKey) || !guardado || !String(guardado).startsWith(PREFIJO)) return null;
  try {
    const b = Buffer.from(String(guardado).slice(PREFIJO.length), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', clave(secretsKey), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch { return null; }
}

// Para mostrar sin revelar: "••••1234"
export const ultimos4 = (s) => (s ? '••••' + String(s).slice(-4) : '');
