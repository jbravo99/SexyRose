// SexyRose — asistente de cuenta por WhatsApp (contenedor "agente", misma imagen que el app: `node agente.js`).
// Proceso aparte del sitio: si se cae o WhatsApp falla, el sitio sigue igual. Ver FASE1-CONTRATO.md →
// "Asistente de cuenta por WhatsApp" e infra/README.md.
//
// Variables (las reparte infra/server/separar-env.sh a .env.agente): DATABASE_URL, SECRETS_KEY (cifra la sesión de
// WhatsApp), ANTHROPIC_API_KEY (sin ella responde solo lo automático), ANTHROPIC_MODEL (opcional), TELEGRAM_BOT_TOKEN
// y TELEGRAM_CHAT_ID (avisos a Juan; solo envía, nunca lee getUpdates: eso lo hace el app), SITE_URL, DATA_DIR.
// No manda emails: el código de identificación lo manda el app (pedido por la base, asistente_salida).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createTelegram } from './lib/telegram.js';
import { createCreditos } from './lib/creditos.js';
import { createPlanes } from './lib/planes.js';
import { createPrivado } from './lib/privado.js';
import { createLlm } from './lib/asistente-llm.js';
import { createAsistente } from './lib/asistente.js';
import { createWhatsApp } from './lib/asistente-whatsapp.js';
import { escucharSalida, leerAjustes } from './lib/asistente-comun.js';
import { instalarConsolaSegura } from './lib/consola-segura.js';
import { letraDe } from './lib/chips.js';
import { createInvitacionesIa } from './lib/invitaciones-ia.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function configAgente(env = process.env) {
  const s = (v) => (typeof v === 'string' ? v.trim() : '');
  return {
    databaseUrl: s(env.DATABASE_URL),
    secretsKey: s(env.SECRETS_KEY),
    anthropicKey: s(env.ANTHROPIC_API_KEY),
    anthropicModel: s(env.ANTHROPIC_MODEL),
    telegramToken: s(env.TELEGRAM_BOT_TOKEN),
    telegramChatId: s(env.TELEGRAM_CHAT_ID),
    siteUrl: (s(env.SITE_URL) || 'https://sexyrose.net').replace(/\/+$/, ''),
    dataDir: path.resolve(s(env.DATA_DIR) || path.join(HERE, '..', 'data')),
    latidoArchivo: s(env.AGENTE_LATIDO) || '/tmp/agente-latido',
    log: (...a) => console.log(new Date().toISOString(), ...a),
  };
}

// overrides (pruebas): pool, makeSocket, descargar, llmFetch, telegramFetch, demora, dormir, supervisarMs, escuchar, invitacionesIa (false: no se escriben solas)
export async function startAgente(overrides = {}) {
  const config = { ...configAgente(), ...overrides };
  const log = config.log;
  const pool = config.pool || new pg.Pool({ connectionString: config.databaseUrl || undefined, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 15000 });
  if (!config.pool) pool.on('error', (e) => log('pg: error en conexión inactiva:', e.code || e.message));
  let parado = false;

  // La base la prepara el app (migraciones): acá solo se espera a que exista la tabla.
  for (let intento = 1; !parado; intento++) {
    try {
      const { rows } = await pool.query("SELECT to_regclass('public.asistente_salida') AS t");
      if (rows[0].t) break;
      log('agente: esperando que el app cree las tablas del asistente…');
    } catch (e) { log(`agente: base no disponible (${e.code || e.message})`); }
    await new Promise((r) => setTimeout(r, Math.min(30000, 1000 * 2 ** Math.min(intento - 1, 5))));
  }

  const telegram = createTelegram({
    pool, token: config.telegramToken, chatIdEnv: config.telegramChatId, log,
    fetchImpl: config.telegramFetch !== undefined ? config.telegramFetch : globalThis.fetch,
  });
  const creditos = createCreditos({ pool, log, siteUrl: config.siteUrl });
  const planes = createPlanes({ pool, log, siteUrl: config.siteUrl, creditos });
  const privado = createPrivado({ dataDir: config.dataDir });
  const llm = createLlm({ apiKey: config.anthropicKey, modelo: config.anthropicModel, fetchImpl: config.llmFetch !== undefined ? config.llmFetch : globalThis.fetch, log });
  if (!llm.disponible) log('agente: sin ANTHROPIC_API_KEY: responde solo lo automático (pedidos y comprobantes) y deriva lo demás.');
  const asistente = createAsistente({ pool, creditos, planes, privado, telegram, llm, siteUrl: config.siteUrl, log,
    ...(config.pausaRecuperar ? { pausaRecuperar: config.pausaRecuperar } : {}) });
  // Varios chips (19/11/2026, lib/chips.js): una conexión de WhatsApp por fila de asistente_whatsapp. Los chips que
  // agrega o quita Juan desde el admin se toman en la próxima supervisión.
  const chips = new Map(); // id → conexión
  const crearChip = (id) => createWhatsApp({
    chip: id, pool, secretsKey: config.secretsKey, log, makeSocket: config.makeSocket || null, descargar: config.descargar || null,
    alMensaje: (ev) => asistente.recibir(ev), alRecuperar: (lista, chip) => asistente.recuperar(lista, chip),
    ia: { configurada: llm.disponible, modelo: llm.modelo },
    avisar: (texto) => telegram.notify(id === 1 ? texto : `Chip ${letraDe(id)}: ${texto}`, 'asistente_alerta'),
    ...(config.demora ? { demora: config.demora } : {}), ...(config.dormir ? { dormir: config.dormir } : {}),
  });
  chips.set(1, crearChip(1));
  // Invitaciones de captación escritas por la IA (22/11/2026): se adelantan en cada supervisión
  const invitaciones = createInvitacionesIa({ pool, llm, log });
  asistente.setEnviar((jid, texto, chip = 1) => {
    const w = chips.get(Number(chip) || 1);
    if (!w) { const e = new Error('WhatsApp no está conectado'); e.code = 'NO_CONECTADO'; throw e; }
    return w.enviar(jid, texto);
  });

  const procesarSalida = () => asistente.procesarSalida({
    desvincular: async (chip = 1) => { const w = chips.get(Number(chip) || 1); if (w) await w.desvincular(); },
    conectado: (chip = 1) => { const w = chips.get(Number(chip) || 1); return Boolean(w && w.conectado()); },
  });

  // Prendido/apagado desde el admin (ajustes.asistente.activo): se revisa cada pocos segundos, para todos los chips.
  async function supervisar() {
    if (parado) return;
    try {
      const aj = await leerAjustes(pool);
      const { rows } = await pool.query('SELECT id FROM asistente_whatsapp ORDER BY id');
      const ids = new Set(rows.map((r) => Number(r.id)));
      for (const id of ids) if (!chips.has(id)) { chips.set(id, crearChip(id)); log(`agente: chip ${letraDe(id)} agregado`); }
      for (const [id, w] of chips) {
        if (ids.has(id) || id === 1) continue;
        chips.delete(id);
        await w.detener('apagado').catch(() => {});
        log(`agente: chip ${letraDe(id)} quitado`);
      }
      let alguno = false;
      for (const [id, w] of chips) {
        if (!ids.has(id)) continue;
        if (aj.activo && !w.activo) { log(`agente: asistente prendido (chip ${letraDe(id)})`); await w.iniciar(); }
        else if (!aj.activo && w.activo) { log(`agente: asistente apagado (chip ${letraDe(id)})`); await w.detener('apagado'); }
        else if (!aj.activo) await pool.query("UPDATE asistente_whatsapp SET estado = 'apagado', qr = NULL, latido = now(), ia = $1, modelo = $2 WHERE id = $3", [llm.disponible, llm.modelo, id]);
        await w.latido();
        if (w.conectado()) alguno = true;
      }
      await fs.writeFile(config.latidoArchivo, String(Date.now())).catch(() => {});
      if (alguno) await procesarSalida();
      if (aj.activo && config.invitacionesIa !== false) invitaciones.completar().catch((e) => log('agente: invitaciones con IA:', e.code || e.message));
    } catch (e) { log('agente: supervisión falló:', e.code || e.message); }
  }
  await supervisar();
  const timer = setInterval(supervisar, config.supervisarMs || 10000);
  if (timer.unref) timer.unref();
  const escucha = config.escuchar === false ? null : escucharSalida({ databaseUrl: config.databaseUrl, destino: 'whatsapp', alAvisar: procesarSalida, log, cadaMs: 30000 });

  // Cierre ordenado (SIGTERM en cada deploy): 1) terminar las respuestas en curso (como mucho esperaMs), 2) cerrar
  // WhatsApp, terminar de escribir la sesión en la base y soltar el candado, 3) cerrar la base. Si se corta a mitad,
  // la sesión guardada puede quedar atrás de lo que ya se mandó y el próximo mensaje no se puede descifrar del otro lado.
  async function cerrar({ esperaMs = 15000 } = {}) {
    parado = true;
    clearInterval(timer);
    if (escucha) await escucha.cerrar();
    let t;
    await Promise.race([asistente.esperar().catch(() => {}), new Promise((r) => { t = setTimeout(r, esperaMs); if (t.unref) t.unref(); })]);
    clearTimeout(t);
    for (const w of chips.values()) await w.detener('apagado').catch((e) => log('agente: al cerrar WhatsApp:', e.code || e.message));
    if (!config.pool) await pool.end().catch(() => {});
    log('agente: cerrado');
  }
  // wa: el chip 1 (las pruebas de siempre); chips: todas las conexiones
  return { pool, asistente, get wa() { return chips.get(1); }, chips, telegram, llm, invitaciones, procesarSalida, supervisar, cerrar };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  // libsignal imprime sesiones enteras (claves privadas incluidas) con console.*: se resumen en una línea sin claves.
  instalarConsolaSegura(console);
  process.on('unhandledRejection', (e) => console.log(new Date().toISOString(), 'agente: error sin manejar:', (e && (e.code || e.message)) || e));
  const inst = await startAgente();
  let cerrando = false;
  const onSignal = (sig) => {
    if (cerrando) return;
    cerrando = true;
    console.log(new Date().toISOString(), `agente: ${sig} recibido: cerrando...`);
    setTimeout(() => process.exit(1), 25000).unref(); // docker compose: stop_grace_period 30s (infra/docker-compose.yml)
    inst.cerrar().then(() => process.exit(0), () => process.exit(1));
  };
  process.on('SIGTERM', () => onSignal('SIGTERM'));
  process.on('SIGINT', () => onSignal('SIGINT'));
}
