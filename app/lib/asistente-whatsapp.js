// Conexión de WhatsApp del asistente (Baileys, @whiskeysockets/baileys, versión fija en package.json): el número del
// chip prepago queda vinculado como "dispositivo" (QR escaneado una vez desde Admin → Asistente).
// - La sesión (credenciales y claves) se guarda en la base, cifrada con SECRETS_KEY (lib/secretos.js).
// - Estado para el admin en asistente_whatsapp (conectado / esperando_qr / desconectado + QR + latido).
// - Se reconecta solo con espera creciente (1 s … 60 s). Si WhatsApp desvincula el dispositivo, borra la sesión y
//   vuelve a pedir QR.
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

// ---------- Sesión de Baileys en la base (cifrada) ----------
export async function authEnBase({ pool, secretsKey, BufferJSON, initAuthCreds, proto }) {
  const enc = (v) => cifrarSecreto(secretsKey, JSON.stringify(v, BufferJSON.replacer));
  const dec = (s) => { const t = descifrarSecreto(secretsKey, s); return t === null ? null : JSON.parse(t, BufferJSON.reviver); };
  const clave = (tipo, id) => `${tipo}-${String(id).replace(/\//g, '__').replace(/:/g, '-')}`;
  const leer = async (k) => { const { rows } = await pool.query('SELECT valor FROM asistente_auth WHERE clave = $1', [k]); return rows[0] ? dec(rows[0].valor) : null; };
  const escribir = (k, v) => pool.query(
    `INSERT INTO asistente_auth (clave, valor, actualizado) VALUES ($1, $2, now())
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado = now()`, [k, enc(v)]);
  const creds = (await leer('creds')) || initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        async get(tipo, ids) {
          const out = {};
          if (!ids.length) return out;
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
        async set(data) {
          for (const tipo of Object.keys(data)) {
            for (const id of Object.keys(data[tipo])) {
              const v = data[tipo][id];
              if (v) await escribir(clave(tipo, id), v);
              else await pool.query('DELETE FROM asistente_auth WHERE clave = $1', [clave(tipo, id)]);
            }
          }
        },
      },
    },
    guardarCreds: () => escribir('creds', creds),
  };
}

// Logger con la forma que pide Baileys (pino), sin datos personales: solo errores, sin objetos.
function loggerMudo(log) {
  const l = {
    level: 'error',
    child: () => l,
    trace() {}, debug() {}, info() {}, warn() {},
    error(obj, msg) { log('asistente: whatsapp (baileys):', typeof obj === 'string' ? obj.slice(0, 120) : String(msg || (obj && obj.err && obj.err.message) || 'error').slice(0, 120)); },
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
}) {
  let sock = null;
  let estado = 'apagado';
  let activo = false;
  let espera = 1000;
  let reintento = null;
  let propio = '';            // número del chip (dígitos)
  let generacion = 0;         // cada conexión nueva invalida los eventos de la anterior
  const enviados = new Set(); // ids de mensajes que mandó el bot (para no confundirlos con los de Juan)

  async function guardarEstado(e, extra = {}) {
    estado = e;
    const qr = extra.qr || null;
    await pool.query(
      `UPDATE asistente_whatsapp SET estado = $1, qr = $2, qr_creado = CASE WHEN $2::text IS NULL THEN NULL ELSE now() END,
         numero = COALESCE($3, numero), error = $4, ia = $5, modelo = $6, latido = now(), actualizado = now() WHERE id = 1`,
      [e, qr, extra.numero || null, extra.error || null, Boolean(ia.configurada), ia.modelo || null]).catch((err) => log('asistente: no se pudo guardar el estado:', err.code || err.message));
  }
  const latido = () => pool.query('UPDATE asistente_whatsapp SET latido = now(), ia = $1, modelo = $2 WHERE id = 1', [Boolean(ia.configurada), ia.modelo || null]).catch(() => {});

  function programar() {
    if (!activo || reintento) return;
    const ms = espera;
    espera = Math.min(60000, espera * 2);
    reintento = setTimeout(() => { reintento = null; conectar().catch((e) => { log('asistente: conexión falló:', e.message); programar(); }); }, ms);
    if (reintento.unref) reintento.unref();
  }

  async function conectar() {
    if (!activo) return;
    if (!secretosDisponibles(secretsKey)) {
      await guardarEstado('desconectado', { error: 'Falta SECRETS_KEY en el servidor: sin esa clave no se puede guardar la sesión de WhatsApp.' });
      return;
    }
    const B = makeSocket ? null : await cargarBaileys();
    const gen = ++generacion;
    let auth;
    if (makeSocket) {
      auth = { state: { creds: {}, keys: {} }, guardarCreds: async () => {} }; // pruebas: socket falso, sin sesión
    } else {
      auth = await authEnBase({ pool, secretsKey, BufferJSON: B.BufferJSON, initAuthCreds: B.initAuthCreds, proto: B.proto });
    }
    await guardarEstado('conectando');
    let s;
    if (makeSocket) s = await makeSocket({ auth: auth.state });
    else {
      let version;
      try { ({ version } = await B.fetchLatestBaileysVersion()); } catch { version = undefined; }
      const logger = loggerMudo(log);
      s = B.makeWASocket({
        ...(version ? { version } : {}),
        auth: { creds: auth.state.creds, keys: B.makeCacheableSignalKeyStore(auth.state.keys, logger) },
        logger, browser: B.Browsers.ubuntu('Chrome'),
        markOnlineOnConnect: false,   // así el teléfono sigue recibiendo las notificaciones
        syncFullHistory: false, emitOwnEvents: false, generateHighQualityLinkPreview: false,
        shouldIgnoreJid: (jid) => !esChat(jid),
        getMessage: async () => undefined,
      });
    }
    sock = s;
    s.ev.on('creds.update', () => { auth.guardarCreds().catch((e) => log('asistente: no se pudo guardar la sesión:', e.code || e.message)); });
    s.ev.on('connection.update', (u) => { if (gen === generacion) alActualizar(u, s).catch((e) => log('asistente: estado de conexión:', e.message)); });
    s.ev.on('messages.upsert', (ev) => { if (gen === generacion) alLlegar(ev).catch((e) => log('asistente: mensaje entrante falló:', e.code || e.message)); });
  }

  async function alActualizar(u, s) {
    if (u.qr) await guardarEstado('esperando_qr', { qr: u.qr });
    if (u.connection === 'open') {
      espera = 1000;
      const id = String((s.user && s.user.id) || '');
      propio = id.split('@')[0].split(':')[0].replace(/\D/g, '');
      await guardarEstado('conectado', { numero: propio || null });
      log('asistente: WhatsApp conectado');
    }
    if (u.connection === 'close') {
      const code = u.lastDisconnect && u.lastDisconnect.error && u.lastDisconnect.error.output ? u.lastDisconnect.error.output.statusCode : 0;
      sock = null;
      if (code === 401) { // loggedOut: el teléfono desvinculó el dispositivo (o WhatsApp lo hizo)
        await pool.query('DELETE FROM asistente_auth');
        await guardarEstado('desconectado', { error: 'WhatsApp desvinculó este dispositivo. Escaneá el QR de nuevo.' });
        log('asistente: WhatsApp desvinculado; se pide QR nuevo');
        espera = 1000;
      } else {
        await guardarEstado(activo ? 'conectando' : 'apagado');
        log('asistente: WhatsApp se cortó (código', code || '?', '); reintento');
      }
      if (code === 515) espera = 1000; // restartRequired: enseguida
      programar();
    }
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
      if (jid.endsWith(SERVIDOR_LID) && k.senderPn && String(k.senderPn).endsWith(SERVIDOR_PN)) jid = String(k.senderPn).replace(/:\d+@/, '@');
      jid = jid.replace(/:\d+@/, '@');
      const tel = jid.endsWith(SERVIDOR_PN) ? jid.split('@')[0].replace(/\D/g, '') : null;
      if (tel && propio && tel === propio) continue; // chat con uno mismo
      const t0 = m.messageTimestamp;
      const ts = (t0 && typeof t0 === 'object' && typeof t0.toNumber === 'function' ? t0.toNumber() : Number(t0)) * 1000;
      if (ts && Date.now() - ts > VIEJO_MS) continue;
      const c = leerContenido(m.message);
      if (!c) continue;
      const ev = {
        jid, telefono: tel, waId: k.id || null, deMi: Boolean(k.fromMe), porBot: Boolean(k.fromMe && k.id && enviados.has(k.id)),
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

  async function enviar(jid, texto) {
    const s = sock;
    if (!s || estado !== 'conectado') { const e = new Error('WhatsApp no está conectado'); e.code = 'NO_CONECTADO'; throw e; }
    const id = '3EB0' + crypto.randomBytes(9).toString('hex').toUpperCase();
    enviados.add(id);
    if (enviados.size > 5000) enviados.delete(enviados.values().next().value);
    try { await s.presenceSubscribe(jid); } catch { /* no importa */ }
    try { await s.sendPresenceUpdate('composing', jid); } catch { /* no importa */ }
    await dormir(demora(texto));
    try { await s.sendPresenceUpdate('paused', jid); } catch { /* no importa */ }
    const r = await s.sendMessage(jid, { text: String(texto) }, { messageId: id });
    const real = (r && r.key && r.key.id) || id;
    enviados.add(real);
    return real;
  }

  async function iniciar() {
    if (activo) return;
    activo = true; espera = 1000;
    await conectar().catch((e) => { log('asistente: conexión falló:', e.message); programar(); });
  }
  async function detener(e = 'apagado') {
    activo = false; generacion++;
    if (reintento) clearTimeout(reintento); reintento = null;
    const s = sock; sock = null;
    if (s) { try { s.end(undefined); } catch { /* ya cerrado */ } }
    await guardarEstado(e);
  }
  // Admin → "Desvincular": cierra la sesión en WhatsApp, borra la guardada y (si está prendido) pide QR nuevo.
  async function desvincular() {
    const s = sock;
    if (s) { try { await s.logout('desvinculado desde el admin'); } catch { /* ya cerrado */ } }
    generacion++; sock = null;
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
  };
}
