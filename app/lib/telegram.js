// Avisos internos por Telegram (para el admin) y vinculación del chat desde Admin → Ajustes.
// - El token del bot queda en el servidor (TELEGRAM_BOT_TOKEN): es un secreto y nunca va a la base ni al navegador.
// - El chat que recibe los avisos se vincula desde el admin: "Vincular Telegram" genera un código de un solo uso
//   (10 min) y un link t.me/<bot>?start=<código>. Mientras haya un código pendiente, el servidor consulta getUpdates
//   cada pocos segundos (no hace falta un webhook público); cuando llega "/start <código>", guarda el chat en
//   ajustes.telegram. TELEGRAM_CHAT_ID del servidor queda como respaldo si no hay un chat vinculado.
// - Cada aviso tiene un tipo y se puede apagar desde el admin. Los avisos nunca incluyen datos de contacto.
import crypto from 'node:crypto';

export const AVISOS = Object.freeze({
  cuenta_nueva: 'Cuenta nueva de acompañante',
  perfil_revisar: 'Perfil para revisar',
  verificacion: 'Verificación de identidad nueva',
  denuncia: 'Denuncias y reportes urgentes',
  cotizacion: 'Salto de la cotización',
  pedido_creditos: 'Pedido de créditos nuevo',
  pedido_personalizado: 'Pedido personalizado nuevo',
  venta: 'Venta de contenido pagada',
});
const API = 'https://api.telegram.org';
const CODIGO_MS = 10 * 60 * 1000;
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const nuevoCodigo = () => Array.from(crypto.randomBytes(8), (b) => ABC[b % ABC.length]).join('');

export class TelegramError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const he = (status, message) => new TelegramError(status, message);

export function createTelegram({ pool, token = '', chatIdEnv = '', fetchImpl = null, log = () => {}, now = () => Date.now(), cadaMs = 3000 }) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const configurado = Boolean(token);
  let bot = null;          // { username, nombre } (getMe)
  let pendiente = null;    // { codigo, expira }
  let offset = 0;
  let timer = null;
  let ultimoError = null;

  async function api(metodo, params = {}) {
    if (!configurado) throw he(409, 'Falta TELEGRAM_BOT_TOKEN en el servidor.');
    if (!doFetch) throw he(503, 'Sin conexión con Telegram.');
    let r;
    try {
      r = await doFetch(`${API}/bot${token}/${metodo}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params), signal: AbortSignal.timeout(10000),
      });
    } catch (e) { throw he(503, 'No se pudo conectar con Telegram.'); }
    let d = null; try { d = await r.json(); } catch { /* sin JSON */ }
    if (!r.ok || !d || d.ok !== true) {
      const desc = d && d.description ? String(d.description) : `respuesta ${r.status}`;
      const e = he(r.status === 401 || r.status === 404 ? 409 : 502, r.status === 401 || r.status === 404 ? 'Telegram rechazó el token del bot (TELEGRAM_BOT_TOKEN).' : 'Telegram respondió: ' + desc);
      e.telegramStatus = r.status;
      throw e;
    }
    return d.result;
  }

  // ---------- Ajuste guardado ----------
  async function leer() {
    const { rows } = await pool.query("SELECT valor FROM ajustes WHERE clave = 'telegram'");
    const v = rows[0] && rows[0].valor && typeof rows[0].valor === 'object' ? rows[0].valor : {};
    const avisos = {};
    for (const k of Object.keys(AVISOS)) avisos[k] = !(v.avisos && v.avisos[k] === false);
    return { chatId: v.chatId ? String(v.chatId) : null, chatNombre: v.chatNombre || '', chatUsuario: v.chatUsuario || '', vinculado: v.vinculado || null, avisos };
  }
  async function guardar(v) {
    await pool.query(
      `INSERT INTO ajustes (clave, valor, actualizado) VALUES ('telegram', $1::jsonb, now())
       ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado = now()`, [JSON.stringify(v)]);
  }

  async function botInfo() {
    if (bot || !configurado) return bot;
    try { const me = await api('getMe'); bot = { username: me.username || '', nombre: me.first_name || '' }; } catch (e) { ultimoError = e.message; }
    return bot;
  }

  async function estado() {
    const v = await leer();
    if (pendiente && pendiente.expira <= now()) { pendiente = null; detener(); }
    const b = configurado ? await botInfo() : null;
    return {
      botConfigurado: configurado,
      bot: b ? { usuario: b.username } : null,
      vinculado: v.chatId ? { nombre: v.chatNombre, usuario: v.chatUsuario, desde: v.vinculado } : null,
      respaldoServidor: !v.chatId && Boolean(chatIdEnv),
      pendiente: pendiente && b ? { codigo: pendiente.codigo, link: `https://t.me/${b.username}?start=${pendiente.codigo}`, expira: new Date(pendiente.expira).toISOString() } : null,
      avisos: Object.entries(AVISOS).map(([id, nombre]) => ({ id, nombre, activo: v.avisos[id] })),
      error: ultimoError,
    };
  }

  // ---------- Vinculación ----------
  async function vincular() {
    if (!configurado) throw he(409, 'Falta TELEGRAM_BOT_TOKEN en el servidor. Creá el bot con @BotFather y cargá su token.');
    ultimoError = null;
    const b = await botInfo();
    if (!b || !b.username) throw he(502, ultimoError || 'No se pudo leer el bot de Telegram.');
    // Con un webhook configurado, getUpdates no funciona: se avisa en vez de pisarlo.
    const wh = await api('getWebhookInfo');
    if (wh && wh.url) throw he(409, `El bot tiene un webhook configurado (${wh.url}). Quitalo (deleteWebhook) para poder vincular desde acá.`);
    pendiente = { codigo: nuevoCodigo(), expira: now() + CODIGO_MS };
    arrancar();
    return estado();
  }
  function cancelar() { pendiente = null; detener(); return estado(); }

  async function procesar(updates) {
    for (const u of updates || []) {
      if (typeof u.update_id === 'number') offset = Math.max(offset, u.update_id + 1);
      const m = u.message || u.edited_message;
      if (!m || typeof m.text !== 'string' || !m.chat) continue;
      const t = m.text.trim().match(/^\/start(?:@\w+)?\s+([A-Z0-9]{4,32})$/i);
      if (!t) continue;
      const ok = pendiente && pendiente.expira > now() && t[1].toUpperCase() === pendiente.codigo;
      if (!ok) {
        api('sendMessage', { chat_id: m.chat.id, text: 'Ese código no es válido o ya venció. Generá uno nuevo desde el admin de SexyRose.' }).catch(() => {});
        continue;
      }
      const v = await leer();
      const nombre = m.chat.title || [m.chat.first_name, m.chat.last_name].filter(Boolean).join(' ') || '';
      await guardar({ ...v, chatId: String(m.chat.id), chatNombre: nombre, chatUsuario: m.chat.username || '', vinculado: new Date(now()).toISOString() });
      pendiente = null; detener();
      api('sendMessage', { chat_id: m.chat.id, text: 'Listo: este chat recibe los avisos de SexyRose.' }).catch(() => {});
      log('telegram: chat vinculado desde el admin');
    }
  }
  async function revisar() {
    if (!pendiente) return;
    if (pendiente.expira <= now()) { pendiente = null; detener(); return; }
    try {
      const ups = await api('getUpdates', { offset, timeout: 0, allowed_updates: ['message'] });
      await procesar(ups);
    } catch (e) {
      ultimoError = e.message;
      if (e.telegramStatus === 409) { pendiente = null; detener(); }
      log('telegram: no se pudieron leer los mensajes del bot:', e.message);
    }
  }
  function arrancar() {
    if (timer) return;
    timer = setInterval(() => { revisar().catch(() => {}); }, cadaMs);
    if (timer.unref) timer.unref();
  }
  function detener() { if (timer) clearInterval(timer); timer = null; }

  async function desvincular() {
    const v = await leer();
    await guardar({ avisos: v.avisos });
    return estado();
  }
  async function guardarAvisos(avisos) {
    if (!avisos || typeof avisos !== 'object' || Array.isArray(avisos)) throw he(400, 'Formato inválido.');
    const v = await leer();
    for (const k of Object.keys(AVISOS)) if (typeof avisos[k] === 'boolean') v.avisos[k] = avisos[k];
    await guardar({ ...(v.chatId ? { chatId: v.chatId, chatNombre: v.chatNombre, chatUsuario: v.chatUsuario, vinculado: v.vinculado } : {}), avisos: v.avisos });
    return estado();
  }
  const destino = (v) => v.chatId || chatIdEnv || null;
  async function probar() {
    if (!configurado) throw he(409, 'Falta TELEGRAM_BOT_TOKEN en el servidor.');
    const chat = destino(await leer());
    if (!chat) throw he(409, 'Todavía no hay un chat vinculado.');
    await api('sendMessage', { chat_id: chat, text: 'Prueba de los avisos de SexyRose. Si ves este mensaje, está todo bien.', disable_web_page_preview: true });
    return { ok: true };
  }

  // Aviso interno. tipo: una de las claves de AVISOS (si está apagada, no se manda). Nunca lanza.
  async function notify(text, tipo = null) {
    if (!configurado) return;
    try {
      const v = await leer();
      if (tipo && v.avisos[tipo] === false) return;
      const chat = destino(v);
      if (!chat) return;
      await api('sendMessage', { chat_id: chat, text, disable_web_page_preview: true });
    } catch (e) {
      log('telegram: no se pudo enviar el aviso:', e.message);
    }
  }

  return { notify, estado, vincular, cancelar, desvincular, guardarAvisos, probar, revisar, detener, configurado };
}
