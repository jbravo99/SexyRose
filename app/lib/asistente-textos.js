// Mensajes fijos del asistente de cuenta por WhatsApp (español rioplatense, inglés y portugués).
// Reglas: sin actividades, sin garantías ni fechas, sin explicar cómo funciona el negocio por dentro.
// La presentación como IA va al principio de la primera respuesta de cada sesión (sin respuestas del bot en 24 h).

export const LANGS = ['es', 'en', 'pt'];
const T = {
  es: {
    presentacion: 'Hola, soy el asistente de cuenta AI de SexyRose.',
    datosPedido: ({ codigo, pack, creditos, ars, usd, alias, titular }) => `Pedido ${codigo}: ${pack}, ${creditos} créditos.\n`
      + `Monto a transferir: ARS ${ars} (USD ${usd}).\n`
      + `Alias: ${alias}\nTitular: ${titular}\n`
      + `Fijate que el titular sea ese y, si podés, poné ${codigo} como referencia.\n`
      + 'Después mandame el comprobante por acá.',
    datosPedidoUsd: ({ codigo, pack, creditos, usd, alias, titular }) => `Pedido ${codigo}: ${pack}, ${creditos} créditos.\n`
      + `Monto a transferir: USD ${usd}.\n`
      + `Alias: ${alias}\nTitular: ${titular}\n`
      + `Fijate que el titular sea ese y, si podés, poné ${codigo} como referencia.\n`
      + 'Después mandame el comprobante por acá.',
    preguntaMoneda: ({ codigo, pack, creditos }) => `Pedido ${codigo}: ${pack}, ${creditos} créditos.\n¿Vas a transferir en pesos o en dólares?`,
    datosEnUnRato: ({ codigo, pack, creditos }) => `Pedido ${codigo}: ${pack}, ${creditos} créditos. En un rato te paso el monto en pesos y los datos para transferir.`,
    pedidoNoEncontrado: ({ codigo, url }) => `No encontré el pedido ${codigo}. Revisá el código en tu panel: ${url}/panel/creditos`,
    pedidoConfirmado: ({ codigo, url }) => `El pedido ${codigo} ya está acreditado. Lo ves en ${url}/panel/creditos`,
    pedidoVencido: ({ codigo, url }) => `El pedido ${codigo} venció (esperan el pago 48 h). Hacé uno nuevo en ${url}/panel/creditos. Si ya transferiste, avisame.`,
    pedidoCancelado: ({ codigo, url }) => `El pedido ${codigo} está cancelado. Podés hacer uno nuevo desde ${url}/panel/creditos`,
    pedidoRechazadoYa: ({ codigo }) => `El pedido ${codigo} no se pudo confirmar. Si tenés dudas, contame por acá.`,
    comprobanteRecibido: ({ codigo }) => `Recibí el comprobante del pedido ${codigo}. Cuando se verifique, te acredito los créditos y te aviso.`,
    comprobanteSinPedido: 'Recibí el archivo, pero no encuentro un pedido pendiente en este chat. Mandame el código (ej. SR-1234).',
    comprobanteCual: ({ lista }) => `Tenés más de un pedido pendiente: ${lista}. ¿De cuál es el comprobante? Respondé con el código.`,
    comprobanteNoPendiente: ({ codigo }) => `El pedido ${codigo} ya no está esperando pago, así que no le puedo adjuntar el comprobante. Si tenés dudas, contame por acá.`,
    soloComprobantes: 'Por acá puedo recibir comprobantes en foto o PDF. Para lo demás, escribime.',
    archivoGrande: 'El archivo es muy pesado (máximo 10 MB). Probá con una captura de pantalla o un PDF más liviano.',
    archivoError: 'No pude abrir el archivo. Probá mandarlo de nuevo.',
    acreditados: ({ creditos, codigo, url }) => `Listo, acreditamos ${creditos} créditos en tu cuenta (pedido ${codigo}). Ya los podés usar desde ${url}/panel/plan`,
    rechazado: ({ codigo, motivo }) => `No pudimos confirmar el pago del pedido ${codigo}.${motivo ? ` Motivo: ${motivo}.` : ''} Si ya transferiste, respondé este mensaje y lo revisa una persona.`,
    derivado: 'Le paso tu consulta a una persona del equipo. Te va a responder por este chat.',
    alertaNeutral: 'Gracias por escribir. Una persona del equipo va a revisar este tema.',
    sinIa: 'Te va a responder una persona del equipo.',
    botOPersona: 'Soy un asistente de IA, no una persona. Si preferís hablar con alguien del equipo, decime.',
    codigoEnviado: 'Si ese email es de una cuenta de SexyRose, te mandé un código de 6 números. Escribímelo acá (vence en 15 minutos).',
    codigoIncorrecto: ({ quedan }) => `El código no es correcto. Te ${quedan === 1 ? 'queda 1 intento' : `quedan ${quedan} intentos`}.`,
    codigoAgotado: 'Se terminaron los intentos para ese código. Si querés, pedime uno nuevo.',
    codigoVencido: 'Ese código venció. Si querés, pedime uno nuevo.',
    identificada: ({ nombre }) => `Listo, ya sé que sos ${nombre}. ¿En qué te ayudo?`,
    identificadaSinNombre: 'Listo, ya identifiqué tu cuenta. ¿En qué te ayudo?',
    cargaMedida: 'Carga a medida',
  },
  en: {
    presentacion: "Hi, I'm SexyRose's AI account assistant.",
    datosPedido: ({ codigo, pack, creditos, ars, usd, alias, titular }) => `Order ${codigo}: ${pack}, ${creditos} credits.\n`
      + `Amount to transfer: ARS ${ars} (USD ${usd}).\n`
      + `Alias: ${alias}\nAccount holder: ${titular}\n`
      + `Check the account holder is that name and, if you can, add ${codigo} as the reference.\n`
      + 'Then send me the receipt here.',
    datosPedidoUsd: ({ codigo, pack, creditos, usd, alias, titular }) => `Order ${codigo}: ${pack}, ${creditos} credits.\n`
      + `Amount to transfer: USD ${usd}.\n`
      + `Alias: ${alias}\nAccount holder: ${titular}\n`
      + `Check the account holder is that name and, if you can, add ${codigo} as the reference.\n`
      + 'Then send me the receipt here.',
    preguntaMoneda: ({ codigo, pack, creditos }) => `Order ${codigo}: ${pack}, ${creditos} credits.\nWill you transfer in pesos or in dollars?`,
    datosEnUnRato: ({ codigo, pack, creditos }) => `Order ${codigo}: ${pack}, ${creditos} credits. I'll send you the amount in pesos and the transfer details shortly.`,
    pedidoNoEncontrado: ({ codigo, url }) => `I couldn't find order ${codigo}. Check the code in your dashboard: ${url}/panel/creditos`,
    pedidoConfirmado: ({ codigo, url }) => `Order ${codigo} has already been credited. You can see it at ${url}/panel/creditos`,
    pedidoVencido: ({ codigo, url }) => `Order ${codigo} expired (orders wait 48 h for payment). Place a new one at ${url}/panel/creditos. If you already transferred, tell me.`,
    pedidoCancelado: ({ codigo, url }) => `Order ${codigo} is canceled. You can place a new one at ${url}/panel/creditos`,
    pedidoRechazadoYa: ({ codigo }) => `Order ${codigo} could not be confirmed. If you have questions, tell me here.`,
    comprobanteRecibido: ({ codigo }) => `I received the receipt for order ${codigo}. Once it's verified, I'll add the credits and let you know.`,
    comprobanteSinPedido: "I received the file, but I can't find a pending order in this chat. Send me the code (e.g. SR-1234).",
    comprobanteCual: ({ lista }) => `You have more than one pending order: ${lista}. Which one is this receipt for? Reply with the code.`,
    comprobanteNoPendiente: ({ codigo }) => `Order ${codigo} is no longer waiting for payment, so I can't attach the receipt. If you have questions, tell me here.`,
    soloComprobantes: 'Here I can receive receipts as a photo or PDF. For anything else, write to me.',
    archivoGrande: 'The file is too large (10 MB max). Try a screenshot or a lighter PDF.',
    archivoError: "I couldn't open the file. Try sending it again.",
    acreditados: ({ creditos, codigo, url }) => `Done, we added ${creditos} credits to your account (order ${codigo}). You can use them at ${url}/panel/plan`,
    rechazado: ({ codigo, motivo }) => `We could not confirm the payment for order ${codigo}.${motivo ? ` Reason: ${motivo}.` : ''} If you already transferred, reply to this message and a person will review it.`,
    derivado: "I'm passing your question to a person from the team. They will reply in this chat.",
    alertaNeutral: 'Thank you for writing. A person from the team will review this.',
    sinIa: 'A person from the team will reply to you.',
    botOPersona: "I'm an AI assistant, not a person. If you'd rather talk to someone from the team, just tell me.",
    codigoEnviado: "If that email belongs to a SexyRose account, I sent it a 6-digit code. Type it here (it expires in 15 minutes).",
    codigoIncorrecto: ({ quedan }) => `That code is not correct. You have ${quedan} ${quedan === 1 ? 'attempt' : 'attempts'} left.`,
    codigoAgotado: 'There are no attempts left for that code. If you want, ask me for a new one.',
    codigoVencido: 'That code expired. If you want, ask me for a new one.',
    identificada: ({ nombre }) => `Done, I know you are ${nombre}. How can I help you?`,
    identificadaSinNombre: 'Done, I identified your account. How can I help you?',
    cargaMedida: 'Custom top-up',
  },
  pt: {
    presentacion: 'Olá, sou o assistente de conta AI da SexyRose.',
    datosPedido: ({ codigo, pack, creditos, ars, usd, alias, titular }) => `Pedido ${codigo}: ${pack}, ${creditos} créditos.\n`
      + `Valor a transferir: ARS ${ars} (USD ${usd}).\n`
      + `Alias: ${alias}\nTitular: ${titular}\n`
      + `Confira se o titular é esse e, se puder, coloque ${codigo} como referência.\n`
      + 'Depois me mande o comprovante por aqui.',
    datosPedidoUsd: ({ codigo, pack, creditos, usd, alias, titular }) => `Pedido ${codigo}: ${pack}, ${creditos} créditos.\n`
      + `Valor a transferir: USD ${usd}.\n`
      + `Alias: ${alias}\nTitular: ${titular}\n`
      + `Confira se o titular é esse e, se puder, coloque ${codigo} como referência.\n`
      + 'Depois me mande o comprovante por aqui.',
    preguntaMoneda: ({ codigo, pack, creditos }) => `Pedido ${codigo}: ${pack}, ${creditos} créditos.\nVocê vai transferir em pesos ou em dólares?`,
    datosEnUnRato: ({ codigo, pack, creditos }) => `Pedido ${codigo}: ${pack}, ${creditos} créditos. Daqui a pouco te passo o valor em pesos e os dados para transferir.`,
    pedidoNoEncontrado: ({ codigo, url }) => `Não encontrei o pedido ${codigo}. Confira o código no seu painel: ${url}/panel/creditos`,
    pedidoConfirmado: ({ codigo, url }) => `O pedido ${codigo} já foi creditado. Você vê em ${url}/panel/creditos`,
    pedidoVencido: ({ codigo, url }) => `O pedido ${codigo} venceu (aguardam o pagamento 48 h). Faça um novo em ${url}/panel/creditos. Se já transferiu, me avise.`,
    pedidoCancelado: ({ codigo, url }) => `O pedido ${codigo} está cancelado. Você pode fazer um novo em ${url}/panel/creditos`,
    pedidoRechazadoYa: ({ codigo }) => `O pedido ${codigo} não pôde ser confirmado. Se tiver dúvidas, me conte por aqui.`,
    comprobanteRecibido: ({ codigo }) => `Recebi o comprovante do pedido ${codigo}. Quando for verificado, credito os créditos e te aviso.`,
    comprobanteSinPedido: 'Recebi o arquivo, mas não encontro um pedido pendente neste chat. Me mande o código (ex. SR-1234).',
    comprobanteCual: ({ lista }) => `Você tem mais de um pedido pendente: ${lista}. De qual é o comprovante? Responda com o código.`,
    comprobanteNoPendiente: ({ codigo }) => `O pedido ${codigo} não está mais aguardando pagamento, então não posso anexar o comprovante. Se tiver dúvidas, me conte por aqui.`,
    soloComprobantes: 'Por aqui posso receber comprovantes em foto ou PDF. Para o resto, me escreva.',
    archivoGrande: 'O arquivo é muito pesado (máximo 10 MB). Tente uma captura de tela ou um PDF mais leve.',
    archivoError: 'Não consegui abrir o arquivo. Tente enviar de novo.',
    acreditados: ({ creditos, codigo, url }) => `Pronto, creditamos ${creditos} créditos na sua conta (pedido ${codigo}). Você já pode usar em ${url}/panel/plan`,
    rechazado: ({ codigo, motivo }) => `Não conseguimos confirmar o pagamento do pedido ${codigo}.${motivo ? ` Motivo: ${motivo}.` : ''} Se você já transferiu, responda esta mensagem e uma pessoa vai revisar.`,
    derivado: 'Vou passar sua consulta para uma pessoa da equipe. Ela vai te responder neste chat.',
    alertaNeutral: 'Obrigado por escrever. Uma pessoa da equipe vai revisar este assunto.',
    sinIa: 'Uma pessoa da equipe vai te responder.',
    botOPersona: 'Sou um assistente de IA, não uma pessoa. Se preferir falar com alguém da equipe, me diga.',
    codigoEnviado: 'Se esse e-mail for de uma conta da SexyRose, enviei um código de 6 números. Escreva aqui (vence em 15 minutos).',
    codigoIncorrecto: ({ quedan }) => `O código não está correto. ${quedan === 1 ? 'Resta 1 tentativa' : `Restam ${quedan} tentativas`}.`,
    codigoAgotado: 'Acabaram as tentativas para esse código. Se quiser, me peça um novo.',
    codigoVencido: 'Esse código venceu. Se quiser, me peça um novo.',
    identificada: ({ nombre }) => `Pronto, já sei que você é ${nombre}. Como posso ajudar?`,
    identificadaSinNombre: 'Pronto, já identifiquei sua conta. Como posso ajudar?',
    cargaMedida: 'Recarga personalizada',
  },
};

export function texto(lang, clave, datos = {}) {
  const l = T[lang] ? lang : 'es';
  const t = T[l][clave] !== undefined ? T[l][clave] : T.es[clave];
  return typeof t === 'function' ? t(datos) : t;
}
export const presentacion = (lang) => texto(lang, 'presentacion');

// Idioma del mensaje: es / en / pt (por palabras frecuentes). Si no hay señales claras, queda el del chat.
// Palabras que casi solo usa cada idioma (las compartidas entre español y portugués no cuentan).
const SENALES = {
  es: new Set('hola quiero quisiera necesito gracias cómo puedo tengo cuenta contraseña pedido transferí sí vos querés tenés podés qué buenas buen día el los las y pero mi estoy hice ya'.split(' ')),
  en: new Set('hi hello hey want buy need thanks thank how can have account password credits order transferred yes you your my what with the is are please profile i paid'.split(' ')),
  pt: new Set('olá oi quero queria preciso obrigado obrigada como posso tenho conta senha transferi sim você voce seu sua meu minha com uma não nao bom dia boa tarde estou fiz já e mas'.split(' ')),
};
export function detectarIdioma(txt, actual = 'es') {
  const s = String(txt || '').toLowerCase();
  if (!s.trim()) return actual;
  if (/^\s*(hi|hello),? i want to buy\b/.test(s)) return 'en';
  if (/^\s*olá,? quero comprar/.test(s)) return 'pt';
  if (/^\s*hola,? quiero comprar/.test(s)) return 'es';
  const palabras = s.split(/[^\p{L}]+/u).filter(Boolean);
  const p = { es: 0, en: 0, pt: 0 };
  for (const w of palabras) for (const l of LANGS) if (SENALES[l].has(w)) p[l]++;
  const mejor = LANGS.reduce((a, b) => (p[b] > p[a] ? b : a), actual);
  return p[mejor] >= 2 && p[mejor] > p[actual] ? mejor : actual;
}

// "¿Sos un bot?" / "¿Hablo con una persona?" / "Are you a bot?" / "Você é um robô?"
const PREGUNTA_BOT = [
  /\b(sos|eres|es|será)\s+(un|una)?\s*(bot|robot|humano|humana|persona( real)?|ia|inteligencia artificial|m[aá]quina|contestador)(?![\p{L}])/iu,
  /\b(hablo|estoy hablando|chateo) con (un|una) (bot|robot|persona|humano|humana|m[aá]quina|ia)(?![\p{L}])/iu,
  /\bare you (a |an )?(bot|robot|human|real person|person|ai|machine)(?![\p{L}])/iu,
  /\bam i (talking|chatting|speaking) (to|with) (a |an )?(bot|robot|human|person|ai|machine)(?![\p{L}])/iu,
  /\bvoc[eê] [eé] (um |uma )?(rob[oô]|bot|humano|humana|pessoa|ia|m[aá]quina)(?![\p{L}])/iu,
  /\b(falo|estou falando) com (um |uma )?(rob[oô]|bot|humano|pessoa|ia)(?![\p{L}])/iu,
];
export const preguntaSiEsBot = (txt) => {
  const s = String(txt || '');
  return s.length <= 120 && PREGUNTA_BOT.some((r) => r.test(s));
};

// Moneda en la respuesta a "¿Vas a transferir en pesos o en dólares?" (o "mejor en dólares"), sin importar mayúsculas
// ni tildes: 'ARS' (pesos, peso, ars, $), 'USD' (dólares, dólar, dollars, usd, u$s, us$), 'ambas' si nombra las dos, o
// null. Con una negación ("no tengo dólares") no se decide acá: devuelve 'ambas' y lo resuelve la IA.
export function monedaEnTexto(txt) {
  let s = ' ' + String(txt || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + ' ';
  let usd = false; let ars = false;
  if (/(u\$s|us\$|u\$d)/.test(s)) { usd = true; s = s.replace(/u\$s|us\$|u\$d/g, ' '); }
  if (/(^|[^a-z0-9])(usd|dolar|dolares|dollar|dollars)(?![a-z0-9])/.test(s)) usd = true;
  if (/(^|[^a-z0-9])(ars|peso|pesos)(?![a-z0-9])/.test(s) || s.includes('$')) ars = true;
  if (!usd && !ars) return null;
  if (usd && ars) return 'ambas';
  if (/(^|[^a-z0-9])(no|sin|nao|not|dont|don't)(?![a-z0-9])/.test(s)) return 'ambas';
  return usd ? 'USD' : 'ARS';
}

// Cierre de la charla (21/11/2026, Juan: "deberíamos entender cuando alguien ya cerró la conversación"): un mensaje
// corto, sin pregunta, hecho solo de palabras de agradecimiento, confirmación o despedida y/o emojis ("listo", "dale",
// "gracias", "igualmente", "te hablo", "❤", "👍"). Un saludo ("hola", "buenas tardes") NO es cierre. El asistente no
// lo contesta si su último mensaje no era una pregunta (lib/asistente.js).
const PALABRAS_CIERRE = new Set(('ok oka okey okay oki okis okk dale dalee listo lista listoo perfecto perfecta perfect genial buenisimo buenisima barbaro joya '
  + 'gracias graciass graciasss gracia mil muchas muchisimas igualmente vos tambien chau chao besos beso besito besitos abrazo abrazos saludos '
  + 'bueno buenisimo si sii siii sip claro de nada te lo la hablo hablamos aviso escribo despues luego mas tarde veo vemos nos re bien todo '
  + 'ahi un una amor linda lindo dia divina genia igual entonces seguro cuando pueda puedo quiera quieras thanks thank you thx bye obrigado obrigada valeu tchau beijos').split(' '));
export function esCierre(txt) {
  const s = String(txt || '').trim();
  if (!s || s.length > 60 || s.includes('?') || s.includes('¿')) return false;
  const limpio = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const palabras = limpio.split(/[^a-zñ]+/).filter(Boolean);
  if (!palabras.length) return /[\p{Extended_Pictographic}]/u.test(s); // solo emojis
  // al menos una palabra de cierre "fuerte" (no alcanzan "te", "lo", "un"…)
  const FUERTES = /^(ok|oka|okey|okay|oki|okis|okk|dale+|listo+|lista|perfect[oa]?|genial|buenisim[oa]|barbaro|joya|gracia|gracias+|igualmente|chau|chao|beso|besos|besito|besitos|abrazos?|saludos|bueno|s[i]+|sip|claro|hablo|hablamos|aviso|escribo|veo|vemos|thanks|thank|thx|bye|obrigad[oa]|valeu|tchau|beijos|igual|seguro)$/;
  return palabras.every((w) => PALABRAS_CIERRE.has(w)) && palabras.some((w) => FUERTES.test(w));
}

// Código de pedido de créditos: SR-1234 (también "sr 1234" o "SR1234").
export function codigoEnTexto(txt) {
  const m = /\bSR[\s-]?(\d{4})\b/i.exec(String(txt || ''));
  return m ? 'SR-' + m[1] : null;
}
