// Consola sin claves para el proceso del agente (WhatsApp).
// libsignal (la librería de cifrado que usa Baileys) escribe directo con console.* y, por ejemplo,
// `console.info("Closing session:", session)` imprime el objeto de la sesión ENTERO: claves privadas (privKey,
// rootKey, chainKey, ephemeralKeyPair…) y registrationId. Con eso cualquiera que lea los logs puede descifrar
// mensajes. Acá se reemplazan console.log/info/warn/error/debug/trace:
// - Los mensajes conocidos de libsignal quedan en UNA línea corta, sin objetos ni números ("signal: se cerró una sesión").
// - Cualquier otro llamado conserva el texto, pero los Buffer/Uint8Array y los objetos que traen bytes o campos de
//   claves se reemplazan por "[bytes]" / "[objeto omitido]"; los Error quedan en su primera línea (sin stack).
// Ver FASE1-CONTRATO.md → "Asistente de cuenta por WhatsApp" → Logs.

const METODOS = ['log', 'info', 'warn', 'error', 'debug', 'trace'];

// Mensajes de libsignal (src/session_record.js, session_builder.js, session_cipher.js, curve.js, queue_job.js)
const SIGNAL = [
  [/^Closing session/, 'signal: se cerró una sesión (queda como anterior)'],
  [/^Opening session/, 'signal: se abrió una sesión'],
  [/^Removing old closed session/, 'signal: se borró una sesión vieja ya cerrada'],
  [/^Session already closed/, 'signal: la sesión ya estaba cerrada'],
  [/^Session already open/, 'signal: la sesión ya estaba abierta'],
  [/^Closing open session in favor of incoming prekey bundle/, 'signal: el otro dispositivo empezó una sesión nueva; se cierra la anterior'],
  [/^Closing stale open session/, 'signal: se cierra una sesión vieja para empezar una nueva'],
  [/^Failed to decrypt message with any known session/, 'signal: no se pudo descifrar con ninguna sesión conocida'],
  [/^Session error/, null], // "Session error:Error: Bad MAC" + stack → solo el motivo
  [/^Decrypted message with closed session/, 'signal: se descifró con una sesión ya cerrada'],
  [/^Migrating session to/, 'signal: se actualizó el formato de una sesión guardada'],
  [/^V1 session storage migration error/, 'signal: no se pudo actualizar el formato de una sesión guardada'],
  [/^WARNING: Expected pubkey of length 33/, 'signal: clave pública con largo inesperado'],
  [/^Unhandled bucket type/, 'signal: cola con nombre inesperado'],
];

const CAMPOS_CLAVE = /^(priv|pub)Key$|^(private|public)$|rootKey|chainKey|ephemeralKey|baseKey|identityKey|signedKey|preKey|registrationId|indexInfo|currentRatchet|pendingPreKey|_chains|noiseKey|advSecretKey|macKey|cipherKey|keyData/i;

const sinNumeros = (s) => String(s).replace(/\d{6,}/g, '#');
const primeraLinea = (s) => String(s == null ? '' : s).split('\n')[0];
const esBytes = (v) => Buffer.isBuffer(v) || ArrayBuffer.isView(v) || v instanceof ArrayBuffer;

// ¿El objeto (hasta 4 niveles) tiene bytes o campos de claves?
function tieneClaves(v, prof = 0, vistos = new Set()) {
  if (v === null || typeof v !== 'object') return false;
  if (esBytes(v)) return true;
  if (vistos.has(v) || prof > 4) return prof > 4; // demasiado profundo: no arriesgar
  vistos.add(v);
  if (Array.isArray(v)) return v.some((x) => tieneClaves(x, prof + 1, vistos));
  if (v instanceof Map) return [...v.entries()].some(([k, x]) => CAMPOS_CLAVE.test(String(k)) || tieneClaves(x, prof + 1, vistos));
  for (const k of Object.keys(v)) {
    if (CAMPOS_CLAVE.test(k)) return true;
    if (tieneClaves(v[k], prof + 1, vistos)) return true;
  }
  const nombre = v.constructor && v.constructor.name;
  return /Session|Record|Ratchet|KeyPair|Chain/i.test(nombre || '');
}

// Un argumento cualquiera → algo seguro para imprimir.
export function argumentoSeguro(a) {
  if (a == null || typeof a === 'string' || typeof a === 'number' || typeof a === 'boolean' || typeof a === 'bigint') return a;
  if (typeof a === 'function' || typeof a === 'symbol') return '[función]';
  if (esBytes(a)) return '[bytes]';
  if (a instanceof Error) return `${a.name || 'Error'}: ${primeraLinea(a.message)}`;
  if (tieneClaves(a)) return '[objeto omitido]';
  return a;
}

// Línea de libsignal → resumen sin claves (o null si no es de libsignal).
export function resumenSignal(args) {
  const primero = args[0];
  if (typeof primero !== 'string') return null;
  for (const [re, texto] of SIGNAL) {
    if (!re.test(primero)) continue;
    if (texto) return texto;
    // "Session error:" + e → el motivo (Bad MAC, …) sin stack ni números
    const motivo = primeraLinea(primero.replace(/^Session error:?\s*/, '')).replace(/^Error:\s*/, '') || 'error';
    return 'signal: error de sesión: ' + sinNumeros(motivo).slice(0, 120);
  }
  return null;
}

// Devuelve las versiones seguras de los métodos (sin tocar la consola). escribir(metodo, args) imprime de verdad.
export function crearConsolaSegura(escribir, { ahora = () => new Date().toISOString() } = {}) {
  const out = {};
  for (const m of METODOS) {
    out[m] = (...args) => {
      const r = resumenSignal(args);
      if (r) { escribir(m === 'error' ? 'error' : 'log', [ahora(), r]); return; }
      escribir(m, args.map(argumentoSeguro));
    };
  }
  return out;
}

// Reemplaza console.* del proceso. Devuelve una función que deja la consola como estaba.
export function instalarConsolaSegura(consola = console) {
  const originales = {};
  for (const m of METODOS) originales[m] = consola[m];
  const segura = crearConsolaSegura((m, args) => (originales[m] || originales.log).apply(consola, args));
  for (const m of METODOS) consola[m] = segura[m];
  return () => { for (const m of METODOS) consola[m] = originales[m]; };
}
