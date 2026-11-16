// Asistente de cuenta por WhatsApp: piezas compartidas por el agente (app/agente.js) y el app (server.js).
// Ver FASE1-CONTRATO.md → "Asistente de cuenta por WhatsApp".
import crypto from 'node:crypto';
import pg from 'pg';

// alias/titular = cuenta en pesos (como siempre); aliasUsd/titularUsd = cuenta en dólares (opcional, 16/11/2026).
export const AJUSTES_DEFAULT = Object.freeze({ activo: false, alias: '', titular: '', aliasUsd: '', titularUsd: '' });
export const CODIGO_EMAIL_MIN = 15;          // vence a los 15 minutos
export const CODIGO_EMAIL_INTENTOS = 5;
export const RETENCION_DIAS = 90;            // mensajes y archivos del chat
export const SILENCIO_JUAN_HORAS = 12;       // Juan escribió desde el teléfono: el bot calla en ese chat
export const LIMITE_HORA = 20;               // mensajes por hora por número; después pasa a una persona
export const MAX_MEDIA = 10 * 1024 * 1024;   // 10 MB
export const LATIDO_VIVO_MS = 90 * 1000;

const esObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const str = (v, max) => (typeof v === 'string' ? v.normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function mezclarAjustes(v) {
  const o = esObj(v) ? v : {};
  const s = (k) => (typeof o[k] === 'string' ? o[k] : '');
  return { activo: o.activo === true, alias: s('alias'), titular: s('titular'), aliasUsd: s('aliasUsd'), titularUsd: s('titularUsd') };
}
// La cuenta en dólares cuenta como cargada con los dos datos (si no, el asistente pasa solo los datos en pesos, como antes).
export const hayCuentaUsd = (aj) => Boolean(aj && aj.aliasUsd && aj.titularUsd);

// Alias de la cuenta para transferir: 6 a 20 caracteres, letras, números, puntos y guiones (regla de los bancos).
// Titular: nombre de la persona o empresa dueña de la cuenta (lo ve la acompañante para comprobarlo antes de transferir).
// Las mismas reglas para la cuenta en pesos (alias, titular) y para la de dólares (aliasUsd, titularUsd; opcional).
function validarCuenta(aliasRaw, titularRaw, deQue) {
  const alias = str(aliasRaw, 40);
  if (alias && !/^[A-Za-z0-9.-]{6,20}$/.test(alias)) return { error: `El alias${deQue} tiene que tener de 6 a 20 caracteres: letras, números, puntos o guiones (sin espacios).` };
  const titular = str(titularRaw, 120);
  if (titular && (titular.length < 3 || titular.length > 80)) return { error: `El nombre del titular${deQue} tiene que tener entre 3 y 80 caracteres.` };
  if (titular && !/^[\p{L}\p{M} .,'&-]+$/u.test(titular)) return { error: `El nombre del titular${deQue} solo puede tener letras, espacios, puntos, comas, guiones y &.` };
  return { alias, titular };
}
export function validarAjustes(v) {
  if (!esObj(v)) return { error: 'Formato inválido: {activo, alias, titular, aliasUsd, titularUsd}.' };
  const ars = validarCuenta(v.alias, v.titular, '');
  if (ars.error) return ars;
  const usd = validarCuenta(v.aliasUsd, v.titularUsd, ' en dólares');
  if (usd.error) return usd;
  if (Boolean(usd.alias) !== Boolean(usd.titular)) return { error: 'Para la cuenta en dólares completá el alias y el nombre del titular, o dejá los dos vacíos.' };
  if (v.activo !== undefined && typeof v.activo !== 'boolean') return { error: 'activo tiene que ser verdadero o falso.' };
  return { valor: { activo: v.activo === true, alias: ars.alias, titular: ars.titular, aliasUsd: usd.alias, titularUsd: usd.titular } };
}

export async function leerAjustes(db) {
  const { rows } = await db.query("SELECT valor FROM ajustes WHERE clave = 'asistente'");
  return mezclarAjustes(rows[0] && rows[0].valor);
}

export const hashCodigo = (id, codigo) => crypto.createHash('sha256').update(`${id}:${codigo}`, 'utf8').digest();
export const hashToken = (t) => crypto.createHash('sha256').update(String(t), 'utf8').digest();

// Teléfono para comparar: solo dígitos y, en Argentina, sin el 9 de los celulares (WhatsApp usa 549…, la gente
// escribe 54 9 11… o 54 11…).
export function telefonoComparable(s) {
  let d = String(s || '').replace(/\D/g, '');
  if (d.startsWith('549')) d = '54' + d.slice(3);
  return d;
}
// +54 9 11 ****-1234 (nunca el número completo en el admin)
export function telefonoOculto(d) {
  const x = String(d || '').replace(/\D/g, '');
  if (x.length < 8) return 'Número oculto';
  const fin = x.slice(-4);
  if (x.startsWith('549') && x.length >= 12) return `+54 9 ${x.slice(3, 5)} ****-${fin}`;
  if (x.startsWith('54') && x.length >= 11) return `+54 ${x.slice(2, 4)} ****-${fin}`;
  const cc = x.length > 11 ? x.slice(0, 2) : x.slice(0, 1);
  return `+${cc} ****-${fin}`;
}

// Saca de un texto lo que parezca un email o un teléfono (los avisos de Telegram nunca llevan datos de contacto).
export const sinContacto = (s) => String(s || '')
  .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]')
  .replace(/\+?\d[\d\s().-]{6,}\d/g, '[número]');

// Escucha NOTIFY sr_asistente_<destino> con una conexión propia (se reconecta sola) y además revisa cada `cadaMs`
// por si se perdió algún aviso. alAvisar() nunca corre dos veces a la vez.
export function escucharSalida({ databaseUrl, destino, alAvisar, log = () => {}, cadaMs = 30000, conectar = null }) {
  let cliente = null; let parado = false; let espera = 1000; let reintento = null; let corriendo = false; let otraVez = false;
  const disparar = () => {
    if (parado) return;
    if (corriendo) { otraVez = true; return; }
    corriendo = true;
    Promise.resolve().then(alAvisar).catch((e) => log(`asistente: salida ${destino} falló:`, e.code || e.message))
      .finally(() => { corriendo = false; if (otraVez) { otraVez = false; disparar(); } });
  };
  async function abrir() {
    if (parado) return;
    try {
      const c = conectar ? await conectar() : new pg.Client({ connectionString: databaseUrl || undefined });
      c.on('error', () => {});
      c.on('end', () => { if (cliente === c) { cliente = null; programar(); } });
      c.on('notification', () => disparar());
      await c.connect();
      await c.query(`LISTEN sr_asistente_${destino}`);
      if (parado) { c.end().catch(() => {}); return; }
      cliente = c; espera = 1000;
      disparar();
    } catch (e) {
      log(`asistente: no se pudo escuchar la base (${destino}):`, e.code || e.message);
      programar();
    }
  }
  function programar() {
    if (parado || reintento) return;
    reintento = setTimeout(() => { reintento = null; abrir(); }, espera);
    if (reintento.unref) reintento.unref();
    espera = Math.min(60000, espera * 2);
  }
  const timer = setInterval(disparar, cadaMs);
  if (timer.unref) timer.unref();
  abrir();
  return {
    disparar,
    async cerrar() {
      parado = true; clearInterval(timer); if (reintento) clearTimeout(reintento);
      const c = cliente; cliente = null;
      if (c) await c.end().catch(() => {});
      for (let i = 0; i < 100 && corriendo; i++) await new Promise((r) => setTimeout(r, 20));
    },
  };
}
