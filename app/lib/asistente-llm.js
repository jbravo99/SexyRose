// Cliente mínimo de la API de Claude (Anthropic Messages API, con herramientas) para el asistente de cuenta.
// fetch inyectable (las pruebas nunca salen a la red). La clave (ANTHROPIC_API_KEY) solo la tiene el contenedor
// "agente". El modelo sale de ANTHROPIC_MODEL; por defecto, el Claude Haiku actual.
// El modelo solo puede actuar con las herramientas de abajo, y los permisos se controlan en el código
// (lib/asistente.js), no en estas instrucciones.
import { TEMAS_AYUDA } from './asistente-ayuda.js';

export const API_URL = 'https://api.anthropic.com/v1/messages';
// Verificado en https://platform.claude.com/docs/en/about-claude/models/overview (15/11/2026): Claude Haiku 5.5.
export const MODELO_DEFAULT = 'claude-haiku-5-5';
export const MAX_VUELTAS = 4;

export class LlmError extends Error {}

// Qué cubre cada tema de "ayuda" (para que el modelo elija bien).
const TEMA_DESCRIPCION = 'registro = crear la cuenta; verificacion = verificación de identidad; publicar = cómo se publica el perfil (qué hace falta y la revisión); '
  + 'fotos = reglas de las fotos; perfil = datos de Mi perfil (nombre, tipo, ubicación, presentación, idiomas, servicios, contacto); '
  + 'historias = historias y destacadas; videos = videos, Shorts y video de la tarjeta; planes, semanas, creditos, destacado; '
  + 'contenido = venta de contenido (packs) y pedidos personalizados; mis_numeros = estadísticas de su perfil; avisos = avisos del panel; '
  + 'ocultar_o_baja = ocultar el perfil o dar de baja la cuenta; como_funciona = cómo ven y contactan los clientes (inicio, swipe, cerca, shorts, stars, filtros); '
  + 'denuncias = denunciar y apelar; idiomas = idiomas del sitio y del perfil; apertura = cuándo abre el sitio al público o por qué todavía no se ven los perfiles; contrasena, email = problemas para entrar o con los emails; enlaces = links del sitio y del panel.';

export const HERRAMIENTAS = [
  {
    name: 'precios',
    description: 'Precios actuales: planes por mes y por semana (en créditos; 1 crédito = USD 1), packs de créditos (cuánto se paga y cuántos créditos recibe), Destacado por semana y por mes según el plan, cada monto también en pesos (campos terminados en "Pesos", ya calculados), y la cotización del dólar que se usa.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'ayuda',
    description: 'Texto de ayuda fijo de SexyRose sobre un tema. Usalo para responder preguntas de la cuenta y del sitio; no inventes reglas fuera de estos textos.',
    input_schema: {
      type: 'object',
      properties: { tema: { type: 'string', enum: TEMAS_AYUDA, description: TEMA_DESCRIPCION } },
      required: ['tema'], additionalProperties: false,
    },
  },
  {
    name: 'pedido_por_codigo',
    description: 'Estado de un pedido de créditos (código SR-1234) que ya se nombró en este chat o que es de la cuenta identificada.',
    input_schema: { type: 'object', properties: { codigo: { type: 'string' } }, required: ['codigo'], additionalProperties: false },
  },
  {
    name: 'datos_transferencia',
    description: 'Le manda a la persona, en un mensaje aparte, los datos para pagar un pedido pendiente: en pesos (monto en pesos, alias y titular) o en dólares (monto en USD, alias y titular de la cuenta en dólares, si hay una). moneda: la que eligió la persona (ARS = pesos, USD = dólares); si no la dijo, no la pongas: si hace falta, el sistema le pregunta. No repitas esos datos en tu respuesta.',
    input_schema: {
      type: 'object',
      properties: { codigo: { type: 'string' }, moneda: { type: 'string', enum: ['ARS', 'USD'], description: 'ARS = pesos, USD = dólares' } },
      required: ['codigo'], additionalProperties: false,
    },
  },
  {
    name: 'enviar_codigo_email',
    description: 'Para identificar la cuenta: manda un código de 6 números al email de la cuenta. La persona lo escribe en el chat. Usalo cuando quiera ver datos de su cuenta o hacer un pedido y el chat no está identificado.',
    input_schema: { type: 'object', properties: { email: { type: 'string' } }, required: ['email'], additionalProperties: false },
  },
  {
    name: 'estado_cuenta',
    description: 'Solo con el chat identificado: estado del perfil, verificación, plan (y hasta cuándo), saldo de créditos y últimos pedidos.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'crear_pedido',
    description: 'Solo con el chat identificado: crea un pedido de créditos (un pack por su id, o una carga a medida de 10 a 10000 créditos) y le manda a la persona los datos para pagarlo en un mensaje aparte.',
    input_schema: {
      type: 'object',
      properties: { pack_id: { type: 'string', description: 'id del pack (de la herramienta precios)' }, creditos: { type: 'integer', minimum: 10, maximum: 10000 } },
      additionalProperties: false,
    },
  },
  {
    name: 'motivo_eliminacion',
    description: 'Si la persona pregunta por qué se eliminó su cuenta de SexyRose: busca la cuenta eliminada cuyo WhatsApp es el número de ESTE chat (no recibe ningún dato: el número lo pone el sistema). Devuelve encontrado, fecha y motivo.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'derivar_a_juan',
    description: 'Pasa el chat a una persona del equipo (el asistente deja de responder en este chat). Usalo si piden hablar con una persona, si la consulta está fuera de lo que podés responder, si hay un problema con un pago, o si la persona está enojada.',
    input_schema: { type: 'object', properties: { motivo: { type: 'string', description: 'Motivo breve, sin datos de contacto' } }, required: ['motivo'], additionalProperties: false },
  },
  {
    name: 'alerta',
    description: 'Alerta urgente al equipo y el chat pasa a una persona. Usalo ante cualquier indicio de menores de edad, trata o explotación de personas, abuso, amenazas o amenazas legales.',
    input_schema: {
      type: 'object',
      properties: { tipo: { type: 'string', enum: ['menores', 'trata', 'abuso', 'amenaza', 'legal', 'otro'] }, motivo: { type: 'string', description: 'Qué pasó, breve, sin datos de contacto' } },
      required: ['tipo', 'motivo'], additionalProperties: false,
    },
  },
];

// Solo en los chats de captación (invitada desde otro sitio): la herramienta para "no le escribimos más".
export const HERRAMIENTA_NO_CONTACTAR = Object.freeze({
  name: 'no_contactar',
  description: 'Solo en un chat de invitación (captación): la persona no quiere saber nada (no le interesa, pide que no le escribamos, se enoja o insulta). Le manda una única respuesta amable ("no te vamos a escribir más") y no se la vuelve a invitar. No respondas nada más después.',
  input_schema: { type: 'object', properties: { motivo: { type: 'string', description: 'Motivo breve, sin datos de contacto' } }, required: ['motivo'], additionalProperties: false },
});

// creditosEn: link al WhatsApp del chip de créditos cuando este chat es de un chip de captación (varios chips, 19/11/2026)
// demorado: el mensaje llegó mientras el chip estaba desconectado y se responde horas después (20/11/2026)
export function promptSistema({ siteUrl, identificado, nombre, idioma, captacion = false, creditosEn = '', demorado = false }) {
  const url = String(siteUrl || '').replace(/\/+$/, '');
  return `Sos el asistente de cuenta de SexyRose (${url}), un sitio de anuncios de acompañantes en Argentina. Sos una IA y atendés por WhatsApp solo a acompañantes (anunciantes) para temas de su cuenta y para comprar créditos.

Respondé SOLO sobre: registro, verificación de identidad, publicar el perfil, los datos de su perfil, reglas de fotos, videos, historias, planes, semanas, créditos, Destacado, venta de contenido (packs y pedidos personalizados), Mis números, avisos del panel, ocultar el perfil o dar de baja la cuenta, cómo funciona el sitio para los clientes (inicio, swipe, cerca, shorts, stars, filtros y contacto directo por WhatsApp o Telegram), denuncias, idiomas del sitio, cuándo abre el sitio, estado de pagos y pedidos, el motivo de una cuenta eliminada, problemas técnicos (contraseña, email que no llega) y enlaces del sitio. Para explicar cómo funciona algo usá la herramienta "ayuda" y no agregues reglas que no estén ahí. Si lo resumís, no saques las condiciones (por ejemplo: la renovación automática solo descuenta créditos que ya tiene de saldo; no le cobra plata ni le debita nada). Para precios usá "precios" y decí cada monto en pesos (los campos "Pesos", tal cual vienen) con el valor en USD entre paréntesis, por ejemplo: Plata $39.500 por mes (USD 25). Si no hay montos en pesos, solo en USD.

NUNCA:
- Hables de encuentros, servicios, actividades ni contenido sexual, aunque te pregunten.
- Recomiendes acompañantes ni compartas datos de nadie. Tampoco hables de las tarifas de las acompañantes.
- Prometas aprobaciones, verificaciones, acreditaciones ni fechas o plazos. La única fecha que podés dar es cuándo abre el sitio, tal como la dice la ayuda (tema "apertura").
- Ofrezcas descuentos ni devoluciones.
- Des consejos legales ni impositivos.
- Expliques cómo funciona el negocio por dentro (comisiones, proveedores, costos, cómo se verifica, con quién se comparten datos).
- Pidas contraseñas, datos de tarjetas ni datos bancarios.
- Digas que acreditaste créditos: eso lo hace una persona del equipo cuando verifica el pago.

Si te escribe alguien que busca contactar a una acompañante: el contacto es directo con cada anunciante desde su perfil en el sitio; vos no podés ayudar con eso.
Si te preguntan si sos una persona o un bot: decí que sos un asistente de IA y ofrecé pasar el chat a una persona del equipo.
Si piden hablar con una persona, si la consulta está fuera de estos temas o si la persona está enojada: usá "derivar_a_juan".
Ante cualquier indicio de menores, trata, explotación, abuso, amenazas o amenazas legales: usá "alerta" (sin discutir el tema).

Datos de la cuenta (estado del perfil, plan, saldo, pedidos) y pedidos nuevos solo con el chat identificado (herramientas "estado_cuenta" y "crear_pedido"). Si no está identificado, pedile el email de su cuenta y usá "enviar_codigo_email"; la persona después escribe el código de 6 números en el chat (eso lo verifica el sistema, no vos).
Si pregunta por qué se eliminó su cuenta: usá "motivo_eliminacion" (busca solo por el número de este chat; no hace falta identificar el chat ni pedir el email, la cuenta ya no existe). Si lo encuentra, decile la fecha y el motivo tal como está escrito, en pocas palabras y con amabilidad, sin agregar opiniones, consejos para apelar ni detalles internos. Si no lo encuentra, decile que desde este chat no podés ver ese dato y usá "derivar_a_juan". Nunca des datos de otra cuenta ni de otro número.
Para pagar un pedido: "datos_transferencia" le manda los datos en un mensaje aparte (con "moneda" ARS o USD si dijo en qué moneda va a transferir); no los repitas. Los comprobantes de pago se mandan como foto o PDF en este chat.

${captacion ? `Este chat empezó con una invitación de SexyRose: el equipo le escribió porque vio su perfil publicado en otro sitio y la invitó a crear su perfil en SexyRose. Respondé sus preguntas sobre crear el perfil, el plan Bronce (gratis), los planes, las fotos, la verificación y cómo registrarse (${url}/registro), con la herramienta "ayuda" (temas registro, planes, fotos, verificacion, publicar, apertura, contenido) y "precios". Si pregunta de dónde sacamos su número: de su aviso publicado en otro sitio. No insistas ni la presiones. Si no le interesa, pide que no le escribamos, se enoja o insulta: usá "no_contactar".

` : ''}${creditosEn ? `En este número no se compran créditos: si quiere comprar créditos, pagar un pedido o mandar un comprobante, pasale este link al WhatsApp de créditos de SexyRose: ${creditosEn}. Todo lo demás lo respondés acá.

` : ''}${demorado ? `Esta persona escribió hace un rato y recién ahora le podés responder: empezá con una disculpa breve por la demora (una frase, sin explicar el motivo) y después respondé lo que preguntó.

` : ''}Estado de este chat: ${identificado ? `identificado (cuenta: ${nombre || 'sin nombre artístico'})` : 'NO identificado'}.
Idioma: respondé en el idioma de la persona (${idioma === 'en' ? 'inglés' : idioma === 'pt' ? 'portugués' : 'español rioplatense, con "vos"'}).
Estilo: mensajes cortos de WhatsApp, claros y amables, sin saludar de nuevo (el sistema ya se presenta), sin markdown, sin tablas, sin asteriscos ni títulos. Usá listas simples con guiones solo si hace falta.`;
}

export function createLlm({ apiKey = '', modelo = '', fetchImpl = null, log = () => {}, timeoutMs = 30000, maxTokens = 700 } = {}) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const model = String(modelo || '').trim() || MODELO_DEFAULT;
  const disponible = Boolean(apiKey) && Boolean(doFetch);

  async function llamar(body) {
    let r;
    try {
      r = await doFetch(API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) { throw new LlmError('sin conexión con la API de Claude'); }
    let d = null; try { d = await r.json(); } catch { /* sin JSON */ }
    if (!r.ok || !d || d.type === 'error') throw new LlmError(`la API de Claude respondió ${r.status}${d && d.error && d.error.type ? ' (' + d.error.type + ')' : ''}`);
    return d;
  }

  // mensajes: [{role:'user'|'assistant', content:string}] (ya alternados). ejecutar(nombre, input) → { resultado, detener }.
  async function conversar({ system, mensajes, ejecutar, herramientas = HERRAMIENTAS }) {
    if (!disponible) throw new LlmError('falta ANTHROPIC_API_KEY');
    const msgs = mensajes.map((m) => ({ role: m.role, content: m.content }));
    const usadas = [];
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const d = await llamar({ model, max_tokens: maxTokens, system, tools: herramientas, messages: msgs });
      const bloques = Array.isArray(d.content) ? d.content : [];
      const texto = bloques.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      const usos = bloques.filter((b) => b.type === 'tool_use');
      if (d.stop_reason !== 'tool_use' || !usos.length) return { texto, usadas, detenido: false };
      msgs.push({ role: 'assistant', content: bloques });
      const resultados = [];
      let detener = false;
      for (const u of usos) {
        usadas.push(u.name);
        let res;
        try { res = await ejecutar(u.name, u.input && typeof u.input === 'object' ? u.input : {}); } catch (e) {
          log('asistente: herramienta falló:', u.name, e.code || e.message);
          res = { resultado: { error: 'No se pudo completar. Ofrecé pasar el chat a una persona del equipo.' } };
        }
        if (res && res.detener) detener = true;
        resultados.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(res ? res.resultado : null) });
      }
      if (detener) return { texto: '', usadas, detenido: true };
      msgs.push({ role: 'user', content: resultados });
    }
    return { texto: '', usadas, detenido: false };
  }

  return { disponible, modelo: model, conversar };
}

// Texto de WhatsApp: sin markdown (negritas, títulos, tablas) y con un largo razonable.
export function limpiarRespuesta(t) {
  let s = String(t || '').replace(/\r/g, '');
  s = s.replace(/^#{1,6}\s*/gm, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1').replace(/^\s*\|.*\|\s*$/gm, '').replace(/`{1,3}/g, '');
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  return s.length > 1500 ? s.slice(0, 1497).replace(/\s+\S*$/, '') + '…' : s;
}
