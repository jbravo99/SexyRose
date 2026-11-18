// Conexión de WhatsApp del asistente (Baileys, @whiskeysockets/baileys 7.x, versión fija en package.json): el número
// del chip prepago queda vinculado como "dispositivo" (QR escaneado una vez desde Admin → Mensajería → WhatsApp).
// - La sesión (credenciales y claves) se guarda en la base, cifrada con SECRETS_KEY (lib/secretos.js).
// - LID: WhatsApp identifica a cada usuario con un número interno (`…@lid`) además del teléfono (`…@s.whatsapp.net`).
//   Baileys 7 guarda la relación (claves `lid-mapping`) y usa UNA sola sesión de Signal por dispositivo aunque el chat
//   llegue por LID o por teléfono. Respondemos a la misma dirección por la que escribió el chat; para identificar
//   (perfil por teléfono) usamos el teléfono que da WhatsApp (remoteJidAlt) o la relación guardada.
// - Una sesión guardada por Baileys 6 (antes del 18/11/2026) no se usa: se borra y se pide QR nuevo (ver
//   FORMATO_SESION), con aviso en el admin y por Telegram.
// - Estado para el admin en asistente_whatsapp (conectado / esperando_qr / desconectado + QR + latido).
// - Se reconecta solo con espera creciente (1 s … 60 s). Si WhatsApp desvincula el dispositivo, borra la sesión y
//   vuelve a pedir QR.
// - Una sola conexión por sesión (candado de Postgres): un segundo proceso espera a que el primero la suelte.
// - Reenvíos: guarda una copia cifrada de cada mensaje enviado (asistente_wa_enviados, 30 días) y se la da a Baileys
//   (getMessage) cuando el otro teléfono no lo pudo descifrar ("Esperando mensaje"). Ver FASE1-CONTRATO.md.
// - Solo chats 1:1: ignora grupos, estados, difusiones y canales. Nunca empieza conversaciones.
// - Antes de responder: "escribiendo…" y una pausa corta, como una persona.
// - makeSocket y descargar son inyectables (las pruebas usan un socket falso).
// - Logs sin datos personales.
import crypto from 'node:crypto';
import { cifrarSecreto, descifrarSecreto, secretosDisponibles } from './secretos.js';

let baileys = null;
async function cargarBaileys() {
  if (!baileys) baileys = await import('@whiskeysockets/baileys');
  return baileys;
}

const SERVIDOR_PN = '@s.whatsapp.net';
const SERVIDOR_LID = '@lid';
const VIEJO_MS = 2 * 60 * 60 * 1000; // mensajes de más de 2 h (llegados mientras estaba apagado): no se contestan
const RETENER_ENVIADOS_DIAS = 30;   // copia cifrada de lo enviado (asistente_wa_enviados), para reenviarlo
const STUB_CIPHERTEXT = 2;           // proto.WebMessageInfo.StubType.CIPHERTEXT: mensaje que no se pudo descifrar
// Marca de la sesión guardada (fila 'formato' de asistente_auth, se escribe junto con las credenciales). Una sesión con
// credenciales y SIN esta marca es de Baileys 6: sus sesiones de Signal quedaron separadas por teléfono y por LID (el
// origen de "Esperando mensaje" del 18/11/2026) y Baileys 7 no las puede migrar → hay que volver a vincular.
export const FORMATO_SESION = 'baileys7-lid';
export const AVISO_REVINCULAR = 'Se actualizó la conexión de WhatsApp del asistente y hay que vincular el chip de nuevo: '
  + 'en el teléfono del chip, WhatsApp → Dispositivos vinculados → cerrá la sesión vieja (si sigue en la lista) y escaneá este QR.';

// ---------- Sesión de Baileys en la base (cifrada) ----------
// Todas las claves de Signal (pre-key, session, sender-key, sender-key-memory, app-state-sync-key,
// app-state-sync-version, …) y las credenciales van a asistente_auth, cifradas.
// - Escrituras EN ORDEN (una cola): una escritura vieja nunca pisa a una nueva. Si dos llegaran a la base al revés, la
//   sesión de Signal guardada queda atrasada; al reiniciar (o cuando vence la caché de 5 min de Baileys) el agente
//   cifra con claves que el teléfono del otro lado ya usó, y ahí ve "Esperando mensaje".
// - Cada keys.set es UNA sentencia (todo o nada): un corte a mitad nunca deja la mitad de las claves.
// - El valor se toma al momento de la llamada (no al escribir).
// - vaciar(): espera a que se escriba todo lo pendiente (al cerrar, al reconectar y antes de borrar la sesión).
// - descartar(): ignora lo que llegue después (sesión desvinculada: no se vuelve a crear la fila borrada).
// - Baileys 7 agrega categorías (`lid-mapping`, `device-list`, `tctoken`, `identity-key`): se guardan igual que las demás.
// - formatoViejo: hay credenciales de un dispositivo ya vinculado pero sin la marca FORMATO_SESION (sesión de Baileys 6).
export async function authEnBase({ pool, secretsKey, BufferJSON, initAuthCreds, proto }) {
  const enc = (v) => cifrarSecreto(secretsKey, JSON.stringify(v, BufferJSON.replacer));
  const dec = (s) => { const t = descifrarSecreto(secretsKey, s); return t === null ? null : JSON.parse(t, BufferJSON.reviver); };
  const clave = (tipo, id) => `${tipo}-${String(id).replace(/\//g, '__').replace(/:/g, '-')}`;
  const leer = async (k) => { const { rows } = await pool.query('SELECT valor FROM asistente_auth WHERE clave = $1', [k]); return rows[0] ? dec(rows[0].valor) : null; };
  let cola = Promise.resolve();
  let descartada = false;
  const encolar = (fn) => {
    const p = cola.then(() => (descartada ? undefined : fn()));
    cola = p.catch(() => {});
    return p;
  };
  // filas: Map clave → valor cifrado (o null = borrar)
  const escribir = (filas) => {
    const claves = []; const valores = []; const borrar = [];
    for (const [k, v] of filas) { if (v === null) borrar.push(k); else { claves.push(k); valores.push(v); } }
    if (!claves.length && !borrar.length) return Promise.resolve();
    return encolar(() => pool.query(
      `WITH borradas AS (DELETE FROM asistente_auth WHERE clave = ANY($3::text[]))
       INSERT INTO asistente_auth (clave, valor, actualizado) SELECT c, v, now() FROM unnest($1::text[], $2::text[]) AS t(c, v)
       ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado = now()`, [claves, valores, borrar]));
  };
  const guardadas = await leer('creds');
  const creds = guardadas || initAuthCreds();
  const formatoViejo = Boolean(guardadas && (guardadas.me || guardadas.registered)) && (await leer('formato')) !== FORMATO_SESION;
  return {
    formatoViejo,
    state: {
      creds,
      keys: {
        async get(tipo, ids) {
          const out = {};
          if (!ids.length) return out;
          await cola; // lo que ya se pidió escribir se lee escrito
          const claves = ids.map((id) => clave(tipo, id));
          const { rows } = await pool.query('SELECT clave, valor FROM asistente_auth WHERE clave = ANY($1)', [claves]);
          const mapa = new Map(rows.map((r) => [r.clave, r.valor]));
          for (const id of ids) {
            let v = mapa.has(clave(tipo, id)) ? dec(mapa.get(clave(tipo, id))) : null;
            if (v && tipo === 'app-state-sync-key' && proto) v = proto.Message.AppStateSyncKeyData.fromObject(v);
            if (v) out[id] = v;
          }
          return out;
        },
        set(data) {
          const filas = new Map();
          for (const tipo of Object.keys(data || {})) {
            for (const id of Object.keys(data[tipo] || {})) {
              const v = data[tipo][id];
              filas.set(clave(tipo, id), v ? enc(v) : null);
            }
          }
          return escribir(filas);
        },
      },
    },
    guardarCreds: () => escribir(new Map([['creds', enc(creds)], ['formato', enc(FORMATO_SESION)]])),
    async vaciar() { let c; do { c = cola; await c; } while (c !== cola); },
    descartar() { descartada = true; },
  };
}

// ---------- Una sola conexión por sesión ----------
// Dos procesos con las mismas credenciales (un contenedor viejo que todavía no terminó, otro agente apuntando a la
// misma base) avanzan la misma sesión de Signal cada uno por su lado y WhatsApp los echa por turnos (440): los
// mensajes salen cifrados con claves repetidas y el otro teléfono no los puede leer. Candado de Postgres
// (pg_try_advisory_lock) en una conexión propia: lo tiene quien está conectado; si el proceso muere, Postgres lo suelta.
export const CANDADO_WHATSAPP = 7262701;
export function crearCandado(pool, { id = CANDADO_WHATSAPP, log = () => {} } = {}) {
  let cliente = null; let onErr = null; let alPerder = () => {};
  function perder(c, motivo) {
    if (cliente !== c) return;
    cliente = null;
    try { c.removeListener('error', onErr); c.on('error', () => {}); c.release(true); } catch { /* ya cerrada */ }
    log('asistente: se perdió el candado de la sesión de WhatsApp (', motivo, '): se corta la conexión');
    alPerder();
  }
  return {
    async tomar() {
      if (cliente) return true;
      const c = await pool.connect();
      let ok = false;
      try { ok = (await c.query('SELECT pg_try_advisory_lock($1) AS ok', [id])).rows[0].ok === true; } catch (e) { c.release(true); throw e; }
      if (!ok) { c.release(); return false; }
      cliente = c;
      onErr = (e) => perder(c, (e && (e.code || e.message)) || 'error');
      c.on('error', onErr);
      return true;
    },
    // Revisa que la conexión del candado siga viva (la llama el latido).
    async verificar() {
      const c = cliente;
      if (!c) return false;
      try { await c.query('SELECT 1'); return true; } catch (e) { perder(c, e.code || e.message); return false; }
    },
    async soltar() {
      const c = cliente; cliente = null;
      if (!c) return;
      try { c.removeListener('error', onErr); } catch { /* nada */ }
      try { await c.query('SELECT pg_advisory_unlock($1)', [id]); c.release(); } catch { c.release(true); }
    },
    get tomado() { return Boolean(cliente); },
    alPerder(fn) { alPerder = typeof fn === 'function' ? fn : () => {}; },
  };
}

// Caché simple con vencimiento (la forma CacheStore de Baileys: get/set/del/flushAll). Una sola por proceso: el contador
// de reintentos sobrevive a las reconexiones (como en el ejemplo de Baileys).
export function cacheConVencimiento(ms = 60 * 60 * 1000, max = 5000) {
  const m = new Map();
  return {
    get(k) { const e = m.get(k); if (!e) return undefined; if (e.vence < Date.now()) { m.delete(k); return undefined; } return e.v; },
    set(k, v) { m.delete(k); m.set(k, { v, vence: Date.now() + ms }); if (m.size > max) m.delete(m.keys().next().value); },
    del(k) { m.delete(k); },
    flushAll() { m.clear(); },
  };
}

// Para los logs: sin números (teléfonos, ids de dispositivos) y corto.
export const sinDatos = (s) => String(s == null ? '' : s).split('\n')[0].replace(/\d{6,}/g, '#').slice(0, 160);
const idCorto = (id) => '…' + String(id || '?').slice(-6);

// Logger con la forma que pide Baileys (pino), sin datos personales: errores (con el motivo, sin números) y los avisos
// que sirven para diagnosticar reintentos y fallas de cifrado; nunca objetos ni contenido.
const AVISOS_UTILES = /retry|resend|decrypt|session|commit|sent too many|message not available|bad mac|prekey|pre-key|lid mapping|lid-pn/i;
export function loggerMudo(log) {
  const motivo = (obj) => {
    if (!obj || typeof obj !== 'object') return '';
    const e = obj.err || obj.error;
    if (e && e.message) return e.message;
    if (typeof obj.trace === 'string') return obj.trace;
    return '';
  };
  const linea = (obj, msg) => {
    const texto = typeof obj === 'string' ? obj : String(msg || '');
    const m = motivo(obj);
    return sinDatos(texto + (m ? ': ' + m : '')) || 'error';
  };
  const l = {
    level: 'info',
    child: () => l,
    trace() {}, debug() {},
    info(obj, msg) { const t = typeof obj === 'string' ? obj : String(msg || ''); if (AVISOS_UTILES.test(t)) log('asistente: whatsapp (baileys):', linea(obj, msg)); },
    warn(obj, msg) { const t = typeof obj === 'string' ? obj : String(msg || ''); if (AVISOS_UTILES.test(t)) log('asistente: whatsapp (baileys) aviso:', linea(obj, msg)); },
    error(obj, msg) {
      const t = linea(obj, msg);
      // Consultas que Baileys hace al conectar (props, bloqueados, privacidad): si WhatsApp no contesta en 60 s quedan
      // los valores por defecto. No afecta mandar ni recibir mensajes.
      if (/init queries/i.test(t) && /timed out/i.test(t)) { log('asistente: whatsapp: las consultas iniciales (ajustes de WhatsApp, bloqueados, privacidad) no respondieron en 60 s; se usan los valores por defecto (no afecta los mensajes)'); return; }
      log('asistente: whatsapp (baileys):', t);
    },
    fatal(obj, msg) { l.error(obj, msg); },
  };
  return l;
}

// Contenido de un mensaje → { tipo, texto, media } (o null si no es algo para responder: reacciones, borrados, etc.)
export function leerContenido(message) {
  let m = message || null;
  for (let i = 0; i < 4 && m; i++) {
    const inner = (m.ephemeralMessage && m.ephemeralMessage.message) || (m.viewOnceMessage && m.viewOnceMessage.message)
      || (m.viewOnceMessageV2 && m.viewOnceMessageV2.message) || (m.documentWithCaptionMessage && m.documentWithCaptionMessage.message)
      || (m.editedMessage && m.editedMessage.message);
    if (!inner) break;
    m = inner;
  }
  if (!m) return null;
  if (typeof m.conversation === 'string') return { tipo: 'texto', texto: m.conversation };
  if (m.extendedTextMessage && typeof m.extendedTextMessage.text === 'string') return { tipo: 'texto', texto: m.extendedTextMessage.text };
  if (m.imageMessage) return { tipo: 'imagen', texto: m.imageMessage.caption || '', media: { mime: m.imageMessage.mimetype || '', tamano: Number(m.imageMessage.fileLength || 0) } };
  if (m.documentMessage) return { tipo: 'documento', texto: m.documentMessage.caption || '', media: { mime: m.documentMessage.mimetype || '', tamano: Number(m.documentMessage.fileLength || 0) } };
  if (m.audioMessage) return { tipo: 'audio', texto: '' };
  if (m.videoMessage || m.ptvMessage) return { tipo: 'video', texto: (m.videoMessage && m.videoMessage.caption) || '' };
  if (m.stickerMessage || m.contactMessage || m.locationMessage || m.contactsArrayMessage || m.liveLocationMessage || m.pollCreationMessage) return { tipo: 'otro', texto: '' };
  return null; // protocolMessage, reactionMessage, senderKeyDistributionMessage, etc.
}

export function createWhatsApp({
  pool, secretsKey = '', log = () => {}, makeSocket = null, descargar = null, alMensaje = async () => {},
  demora = (t) => Math.min(4000, 900 + String(t || '').length * 20), dormir = (ms) => new Promise((r) => setTimeout(r, ms)),
  ia = { configurada: false, modelo: null },
  candado = undefined,   // undefined = candado de Postgres (crearCandado); null = sin candado
  crearAuth = null,      // pruebas: ({ B }) => auth (con socket falso, por defecto no hay sesión)
  esperaCandadoMs = 3000,
  avisar = async () => {}, // aviso a Juan por Telegram (agente.js: telegram.notify(…, 'asistente_alerta'))
}) {
  let sock = null;
  let estado = 'apagado';
  let activo = false;
  let espera = 1000;
  let reintento = null;
  let propio = '';            // número del chip (dígitos)
  let propioLid = '';         // LID del chip (dígitos)
  let avisoRevincular = null; // texto para el admin mientras falta volver a vincular (sesión de Baileys 6 descartada)
  let generacion = 0;         // cada conexión nueva invalida los eventos de la anterior
  let authActual = null;      // sesión en uso (para vaciar sus escrituras pendientes)
  let avisoCandado = false;
  let ultimaLimpieza = 0;
  const enviados = new Set(); // ids de mensajes que mandó el bot (para no confundirlos con los de Juan)
  const recientes = new Map(); // id → proto.IMessage de lo último enviado (además de la base)
  const guardando = new Map(); // id → promesa: el mensaje se está mandando/guardando
  // Dirección por la que escribió cada chat (clave del chat → `…@lid` o `…@s.whatsapp.net`): se responde por ahí.
  const direcciones = new Map();
  const contadorReintentos = cacheConVencimiento(); // msgRetryCounterCache: uno por proceso
  if (candado === undefined) candado = pool && typeof pool.connect === 'function' ? crearCandado(pool, { log }) : null;
  if (candado) candado.alPerder(() => { perderCandado().catch(() => {}); });

  async function guardarEstado(e, extra = {}) {
    estado = e;
    const qr = extra.qr || null;
    if (!extra.error && avisoRevincular && e !== 'conectado' && e !== 'apagado') extra = { ...extra, error: avisoRevincular };
    await pool.query(
      `UPDATE asistente_whatsapp SET estado = $1, qr = $2, qr_creado = CASE WHEN $2::text IS NULL THEN NULL ELSE now() END,
         numero = COALESCE($3, numero), error = $4, ia = $5, modelo = $6, latido = now(), actualizado = now() WHERE id = 1`,
      [e, qr, extra.numero || null, extra.error || null, Boolean(ia.configurada), ia.modelo || null]).catch((err) => log('asistente: no se pudo guardar el estado:', err.code || err.message));
  }
  async function latido() {
    await pool.query('UPDATE asistente_whatsapp SET latido = now(), ia = $1, modelo = $2 WHERE id = 1', [Boolean(ia.configurada), ia.modelo || null]).catch(() => {});
    if (candado && candado.tomado) await candado.verificar();
    if (Date.now() - ultimaLimpieza > 60 * 60 * 1000) {
      ultimaLimpieza = Date.now();
      await pool.query(`DELETE FROM asistente_wa_enviados WHERE creado < now() - interval '${RETENER_ENVIADOS_DIAS} days'`)
        .catch((e) => log('asistente: no se pudo limpiar la copia de mensajes enviados:', e.code || e.message));
    }
  }

  function programar(msFijo = 0) {
    if (!activo || reintento) return;
    const ms = msFijo || espera;
    if (!msFijo) espera = Math.min(60000, espera * 2);
    reintento = setTimeout(() => { reintento = null; conectar().catch((e) => { log('asistente: conexión falló:', e.message); programar(); }); }, ms);
    if (reintento.unref) reintento.unref();
  }

  // Termina lo que la sesión anterior tenía por escribir (antes de releerla de la base o de borrarla).
  async function vaciarAuth({ descartar = false } = {}) {
    const a = authActual;
    if (!a) return;
    if (descartar) { if (a.descartar) a.descartar(); authActual = null; }
    if (a.vaciar) await a.vaciar().catch((e) => log('asistente: no se pudo terminar de guardar la sesión:', e.code || e.message));
  }

  async function conectar() {
    if (!activo) return;
    if (!secretosDisponibles(secretsKey)) {
      await guardarEstado('desconectado', { error: 'Falta SECRETS_KEY en el servidor: sin esa clave no se puede guardar la sesión de WhatsApp.' });
      return;
    }
    if (candado) {
      let ok = false;
      try { ok = await candado.tomar(); } catch (e) { log('asistente: no se pudo pedir el candado de la sesión:', e.code || e.message); }
      if (!ok) {
        if (!avisoCandado) log('asistente: otra instancia del agente tiene la sesión de WhatsApp abierta; espero a que la suelte');
        avisoCandado = true;
        programar(esperaCandadoMs);
        return;
      }
      if (avisoCandado) log('asistente: candado de la sesión de WhatsApp tomado');
      avisoCandado = false;
      if (!activo) { await candado.soltar(); return; }
    }
    await vaciarAuth();
    const B = await cargarBaileys();
    const gen = ++generacion;
    let auth;
    if (crearAuth) auth = await crearAuth({ B });
    else if (makeSocket) auth = { state: { creds: {}, keys: {} }, guardarCreds: async () => {} }; // pruebas: socket falso, sin sesión
    else auth = await authEnBase({ pool, secretsKey, BufferJSON: B.BufferJSON, initAuthCreds: B.initAuthCreds, proto: B.proto });
    if (auth.formatoViejo) {
      // Sesión de Baileys 6: no se usa (sus sesiones de Signal quedaron partidas entre teléfono y LID). Se borra y se
      // pide QR nuevo. Si no se puede borrar, se reintenta más tarde (nunca se conecta con la vieja).
      log('asistente: la sesión de WhatsApp guardada es de la versión anterior (Baileys 6): se borra y hay que vincular el chip de nuevo');
      await pool.query('DELETE FROM asistente_auth');
      avisoRevincular = AVISO_REVINCULAR;
      Promise.resolve().then(() => avisar('Asistente de WhatsApp: se actualizó la conexión y hay que vincular el chip de nuevo. '
        + 'Admin → Mensajería → WhatsApp: escaneá el QR con el teléfono del chip (Dispositivos vinculados).')).catch(() => {});
      if (crearAuth) auth = await crearAuth({ B, nueva: true });
      else auth = await authEnBase({ pool, secretsKey, BufferJSON: B.BufferJSON, initAuthCreds: B.initAuthCreds, proto: B.proto });
      if (auth.formatoViejo) throw new Error('la sesión vieja de WhatsApp no se pudo borrar');
    }
    authActual = auth;
    await guardarEstado('conectando');
    // Configuración como el ejemplo de Baileys: getMessage (reenvíos cuando el otro teléfono no pudo descifrar),
    // msgRetryCounterCache compartida entre reconexiones y claves con caché (makeCacheableSignalKeyStore).
    const opciones = {
      getMessage: (key) => paraReenviar(key),
      msgRetryCounterCache: contadorReintentos,
      markOnlineOnConnect: false,   // así el teléfono sigue recibiendo las notificaciones
      syncFullHistory: false, emitOwnEvents: false, generateHighQualityLinkPreview: false,
      shouldIgnoreJid: (jid) => !esChat(jid),
    };
    let s;
    if (makeSocket) s = await makeSocket({ ...opciones, auth: auth.state });
    else {
      let version;
      try { ({ version } = await B.fetchLatestBaileysVersion()); } catch { version = undefined; }
      const logger = loggerMudo(log);
      s = B.makeWASocket({
        ...(version ? { version } : {}),
        ...opciones,
        auth: { creds: auth.state.creds, keys: B.makeCacheableSignalKeyStore(auth.state.keys, logger) },
        logger, browser: B.Browsers.ubuntu('Chrome'),
      });
    }
    sock = s;
    s.ev.on('creds.update', () => { auth.guardarCreds().catch((e) => log('asistente: no se pudo guardar la sesión:', e.code || e.message)); });
    s.ev.on('connection.update', (u) => { if (gen === generacion) alActualizar(u, s, auth).catch((e) => log('asistente: estado de conexión:', e.message)); });
    s.ev.on('messages.upsert', (ev) => { if (gen === generacion) alLlegar(ev).catch((e) => log('asistente: mensaje entrante falló:', e.code || e.message)); });
    s.ev.on('messages.update', (ups) => {
      for (const u of ups || []) {
        const k = (u && u.key) || {};
        if (k.id && enviados.has(k.id) && u.update && u.update.status === 0) log(`asistente: whatsapp: un mensaje enviado quedó con error (${idCorto(k.id)})`);
      }
    });
    // Recibo de reintento: el teléfono del otro lado recibió un mensaje nuestro y NO lo pudo descifrar ("Esperando
    // mensaje"). Baileys lo reenvía con una sesión nueva (getMessage); acá solo queda en el log.
    if (s.ws && typeof s.ws.on === 'function') {
      s.ws.on('CB:receipt', (node) => {
        try {
          if (!node || !node.attrs || node.attrs.type !== 'retry') return;
          const r = Array.isArray(node.content) ? node.content.find((c) => c && c.tag === 'retry') : null;
          log(`asistente: whatsapp: el otro teléfono no pudo descifrar el mensaje ${idCorto(node.attrs.id)} y pidió reenvío (intento ${(r && r.attrs && r.attrs.count) || '?'})`);
        } catch { /* solo log */ }
      });
    }
  }

  async function alActualizar(u, s, auth) {
    if (u.qr) await guardarEstado('esperando_qr', { qr: u.qr });
    if (u.connection === 'open') {
      espera = 1000;
      const id = String((s.user && s.user.id) || '');
      propio = id.split('@')[0].split(':')[0].replace(/\D/g, '');
      propioLid = usuario((s.user && s.user.lid) || (auth.state && auth.state.creds && auth.state.creds.me && auth.state.creds.me.lid) || '');
      if (avisoRevincular) log('asistente: WhatsApp vinculado de nuevo');
      avisoRevincular = null;
      await guardarEstado('conectado', { numero: propio || null });
      log('asistente: WhatsApp conectado');
    }
    if (u.connection === 'close') {
      const code = u.lastDisconnect && u.lastDisconnect.error && u.lastDisconnect.error.output ? u.lastDisconnect.error.output.statusCode : 0;
      sock = null;
      if (code === 401) { // loggedOut: el teléfono desvinculó el dispositivo (o WhatsApp lo hizo)
        if (authActual === auth) await vaciarAuth({ descartar: true });
        await pool.query('DELETE FROM asistente_auth');
        await guardarEstado('desconectado', { error: 'WhatsApp desvinculó este dispositivo. Escaneá el QR de nuevo.' });
        log('asistente: WhatsApp desvinculado; se pide QR nuevo');
        espera = 1000;
      } else {
        await vaciarAuth();
        await guardarEstado(activo ? 'conectando' : 'apagado');
        if (code === 440) {
          // connectionReplaced: otra conexión con esta misma sesión (otro proceso). No pelear: esperar el máximo.
          log('asistente: WhatsApp: otra conexión con la misma sesión reemplazó a esta (440); reintento en 60 s');
          espera = 60000;
        } else log('asistente: WhatsApp se cortó (código', code || '?', '); reintento');
      }
      if (code === 515) espera = 1000; // restartRequired: enseguida
      programar();
    }
  }

  // El candado se perdió (se cayó la conexión a la base que lo tenía): se corta WhatsApp y se vuelve a pedir.
  async function perderCandado() {
    if (!activo) return;
    generacion++;
    const s = sock; sock = null;
    if (s) { try { s.end(undefined); } catch { /* ya cerrado */ } }
    await vaciarAuth();
    await guardarEstado('conectando');
    programar(esperaCandadoMs);
  }

  // `5491155550001:3@s.whatsapp.net` → `5491155550001@s.whatsapp.net` (sin dispositivo)
  const sinDispositivo = (jid) => String(jid || '').replace(/:\d+@/, '@');
  const usuario = (jid) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
  const esPn = (jid) => String(jid || '').endsWith(SERVIDOR_PN);
  const esLid = (jid) => String(jid || '').endsWith(SERVIDOR_LID);
  const esPropio = (jid) => { const u = usuario(jid); return Boolean(u) && ((propio && u === propio) || (propioLid && u === propioLid)); };
  const relacionLid = () => (sock && sock.signalRepository && sock.signalRepository.lidMapping) || null;

  // Teléfono (`…@s.whatsapp.net`) de un chat que llegó por LID: el que manda WhatsApp con el mensaje
  // (key.remoteJidAlt; key.senderPn en Baileys 6) o la relación LID↔teléfono que guarda Baileys.
  async function telefonoDeLid(k, jidLid) {
    if (!k.fromMe) { // en los mensajes propios el "alt" puede ser el número del chip
      for (const alt of [k.remoteJidAlt, k.senderPn]) if (esPn(alt) && !esPropio(alt)) return sinDispositivo(alt);
    }
    const rel = relacionLid();
    if (rel && typeof rel.getPNForLID === 'function') {
      try { const pn = await rel.getPNForLID(jidLid); if (esPn(pn) && !esPropio(pn)) return sinDispositivo(pn); } catch { /* sin relación */ }
    }
    return null;
  }

  function esChat(jid) {
    const j = String(jid || '');
    return (j.endsWith(SERVIDOR_PN) || j.endsWith(SERVIDOR_LID)) && !j.startsWith('status@') && !j.includes('broadcast');
  }

  async function alLlegar({ messages, type }) {
    if (type !== 'notify' && type !== 'append') return;
    for (const m of messages || []) {
      const k = m.key || {};
      let jid = String(k.remoteJid || '');
      if (!esChat(jid)) continue; // grupos (@g.us), estados, difusiones, canales (@newsletter)
      if (Number(m.messageStubType) === STUB_CIPHERTEXT) {
        // No se pudo descifrar: Baileys ya le pidió al remitente que lo reenvíe (si lo reenvía, llega de nuevo).
        const motivo = Array.isArray(m.messageStubParameters) && m.messageStubParameters[0] ? sinDatos(m.messageStubParameters[0]) : '?';
        log(`asistente: whatsapp: llegó un mensaje que no se pudo descifrar (${idCorto(k.id)}: ${motivo}); se pidió reenvío`);
        continue;
      }
      // El chat se guarda con su teléfono si se conoce (así se identifica el perfil y siguen los chats de antes); se
      // responde por la dirección por la que escribió (LID o teléfono), como recomienda Baileys 7.
      const direccion = sinDispositivo(jid);
      if (esPropio(direccion)) continue; // chat con uno mismo
      let lid = null;
      if (esLid(direccion)) { lid = direccion; jid = (await telefonoDeLid(k, direccion)) || direccion; } else jid = direccion;
      const tel = esPn(jid) ? usuario(jid) : null;
      if (tel && propio && tel === propio) continue;
      direcciones.delete(jid); direcciones.set(jid, direccion);
      if (direcciones.size > 5000) direcciones.delete(direcciones.keys().next().value);
      const t0 = m.messageTimestamp;
      const ts = (t0 && typeof t0 === 'object' && typeof t0.toNumber === 'function' ? t0.toNumber() : Number(t0)) * 1000;
      if (ts && Date.now() - ts > VIEJO_MS) continue;
      const c = leerContenido(m.message);
      if (!c) continue;
      const ev = {
        jid, lid: lid && lid !== jid ? lid : null, telefono: tel, waId: k.id || null, deMi: Boolean(k.fromMe), porBot: Boolean(k.fromMe && k.id && enviados.has(k.id)),
        tipo: c.tipo, texto: c.texto || '',
        media: c.media ? { ...c.media, descargar: () => bajar(m) } : null,
      };
      await alMensaje(ev);
    }
  }

  async function bajar(m) {
    if (descargar) return descargar(m);
    const B = await cargarBaileys();
    return B.downloadMediaMessage(m, 'buffer', {}, { logger: loggerMudo(log), reuploadRequest: sock ? sock.updateMediaMessage : undefined });
  }

  // ---------- Copia de lo enviado (para reenviar) ----------
  async function guardarEnviado(id, message) {
    if (!id || !message) return;
    recientes.set(id, message);
    if (recientes.size > 300) recientes.delete(recientes.keys().next().value);
    const B = await cargarBaileys();
    const bytes = B.proto.Message.encode(B.proto.Message.fromObject(message)).finish();
    await pool.query('INSERT INTO asistente_wa_enviados (wa_id, contenido) VALUES ($1, $2) ON CONFLICT (wa_id) DO NOTHING',
      [id, cifrarSecreto(secretsKey, Buffer.from(bytes).toString('base64'))]);
  }
  async function buscarEnviado(id) {
    if (!id) return undefined;
    const p = guardando.get(id);
    if (p) { // el reintento llegó mientras el mensaje todavía se estaba mandando: esperarlo (como mucho 10 s)
      let t; await Promise.race([p.catch(() => {}), new Promise((r) => { t = setTimeout(r, 10000); if (t.unref) t.unref(); })]); clearTimeout(t);
    }
    if (recientes.has(id)) return recientes.get(id);
    const { rows } = await pool.query('SELECT contenido FROM asistente_wa_enviados WHERE wa_id = $1', [id]);
    if (!rows[0]) return undefined;
    const t = descifrarSecreto(secretsKey, rows[0].contenido);
    if (t === null) return undefined;
    const B = await cargarBaileys();
    return B.proto.Message.decode(Buffer.from(t, 'base64'));
  }
  // getMessage de Baileys: contenido original de un mensaje nuestro (o undefined si no es nuestro / no está).
  async function paraReenviar(key) {
    const id = key && key.id;
    let m;
    try { m = await buscarEnviado(id); } catch (e) { log('asistente: whatsapp: no se pudo leer la copia del mensaje:', e.code || e.message); }
    if (m) log(`asistente: whatsapp: se reenvía el mensaje ${idCorto(id)} con una sesión nueva`);
    else log(`asistente: whatsapp: pidieron reenviar el mensaje ${idCorto(id)} pero no hay copia: en ese teléfono queda "Esperando mensaje"`);
    return m || undefined;
  }

  // Dirección para responder a un chat (clave guardada: teléfono o LID): la última por la que escribió; si no se sabe
  // (p. ej. un aviso después de reiniciar), el LID que WhatsApp tiene para ese teléfono; si no hay, el teléfono.
  async function direccionPara(jid) {
    const j = sinDispositivo(jid);
    if (direcciones.has(j)) return direcciones.get(j);
    const rel = relacionLid();
    if (esPn(j) && rel && typeof rel.getLIDForPN === 'function') {
      try { const lid = await rel.getLIDForPN(j); if (esLid(lid)) return sinDispositivo(lid); } catch { /* sin relación: por teléfono */ }
    }
    return j;
  }

  async function enviar(jidChat, texto) {
    const s = sock;
    if (!s || estado !== 'conectado') { const e = new Error('WhatsApp no está conectado'); e.code = 'NO_CONECTADO'; throw e; }
    const jid = await direccionPara(jidChat);
    const id = '3EB0' + crypto.randomBytes(9).toString('hex').toUpperCase();
    enviados.add(id);
    if (enviados.size > 5000) enviados.delete(enviados.values().next().value);
    try { await s.presenceSubscribe(jid); } catch { /* no importa */ }
    try { await s.sendPresenceUpdate('composing', jid); } catch { /* no importa */ }
    await dormir(demora(texto));
    try { await s.sendPresenceUpdate('paused', jid); } catch { /* no importa */ }
    let listo; const p = new Promise((r) => { listo = r; });
    guardando.set(id, p);
    try {
      const r = await s.sendMessage(jid, { text: String(texto) }, { messageId: id });
      const real = (r && r.key && r.key.id) || id;
      enviados.add(real);
      if (r && r.message) {
        await guardarEnviado(real, r.message).catch((e) => log('asistente: whatsapp: no se pudo guardar la copia del mensaje enviado:', e.code || e.message));
      }
      return real;
    } finally {
      listo();
      guardando.delete(id);
    }
  }

  async function iniciar() {
    if (activo) return;
    activo = true; espera = 1000;
    await conectar().catch((e) => { log('asistente: conexión falló:', e.message); programar(); });
  }
  // Cierra la conexión, termina de guardar la sesión y suelta el candado (también al recibir SIGTERM).
  async function detener(e = 'apagado') {
    activo = false; generacion++;
    if (reintento) clearTimeout(reintento); reintento = null;
    const s = sock; sock = null;
    if (s) { try { s.end(undefined); } catch { /* ya cerrado */ } }
    await vaciarAuth();
    if (candado) await candado.soltar().catch(() => {});
    await guardarEstado(e);
  }
  // Admin → "Desvincular": cierra la sesión en WhatsApp, borra la guardada y (si está prendido) pide QR nuevo.
  async function desvincular() {
    const s = sock;
    if (s) { try { await s.logout('desvinculado desde el admin'); } catch { /* ya cerrado */ } }
    generacion++; sock = null;
    await vaciarAuth({ descartar: true });
    await pool.query('DELETE FROM asistente_auth');
    await guardarEstado('desconectado', { error: null });
    log('asistente: WhatsApp desvinculado desde el admin');
    if (activo) { espera = 1000; await conectar().catch((e) => { log('asistente: conexión falló:', e.message); programar(); }); }
  }

  return {
    iniciar, detener, desvincular, enviar, latido,
    get activo() { return activo; },
    get estado() { return estado; },
    conectado: () => estado === 'conectado' && Boolean(sock),
    _alLlegar: alLlegar,
    _paraReenviar: paraReenviar,
    _direccionPara: direccionPara,
  };
}
