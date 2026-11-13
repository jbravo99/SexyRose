// Emails transaccionales con Mailgun (API HTTP, región EU).
//
// Uso desde cualquier módulo:
//   import { sendMail, emailBasico } from './lib/mail.js';
//   await sendMail({ to, subject, ...emailBasico({ titulo, parrafos: ['...'], boton: { texto, url } }) });
//
// configurarMail(config) lo llama server.js al arrancar. Sin MAILGUN_API_KEY no envía nada: registra el asunto y el
// destinatario en el log (y, fuera de producción, también los links) y guarda el email en memoria (mailsEnviados,
// ultimoMail) para las pruebas.
import { escapeHtml } from '../textos.js';

const cfg = {
  apiKey: '',
  domain: 'mg.sexyrose.net',
  apiBase: 'https://api.eu.mailgun.net',
  from: 'SexyRose <no-responder@sexyrose.net>',
  replyTo: 'contacto@sexyrose.net',
  siteUrl: 'https://sexyrose.net',
  produccion: false,
  log: (...a) => console.log(new Date().toISOString(), ...a),
};

export const mailsEnviados = [];
export const ultimoMail = () => mailsEnviados[mailsEnviados.length - 1] || null;

export function configurarMail(config = {}) {
  cfg.apiKey = config.mailgunApiKey || '';
  cfg.domain = config.mailgunDomain || cfg.domain;
  cfg.apiBase = (config.mailgunApiBase || cfg.apiBase).replace(/\/+$/, '');
  cfg.from = config.mailFrom || cfg.from;
  cfg.replyTo = config.contactEmail || cfg.replyTo;
  cfg.siteUrl = config.siteUrl || cfg.siteUrl;
  cfg.produccion = process.env.NODE_ENV === 'production';
  if (config.log) cfg.log = config.log;
  return { activo: Boolean(cfg.apiKey) };
}
export const mailActivo = () => Boolean(cfg.apiKey);

const LINK_RE = /https?:\/\/[^\s"'<>]+/g;

export async function sendMail({ to, subject, text, html }) {
  const registro = { to, subject, text, html, links: String(text || '').match(LINK_RE) || [], fecha: new Date().toISOString() };
  mailsEnviados.push(registro);
  if (mailsEnviados.length > 50) mailsEnviados.shift();
  if (!cfg.apiKey) {
    cfg.log(`[mail] (sin MAILGUN_API_KEY, no se envía) asunto="${subject}"`
      + (cfg.produccion ? '' : ` para=${to} links=${registro.links.join(' ')}`));
    return { ok: false, simulado: true };
  }
  const body = new URLSearchParams();
  body.set('from', cfg.from);
  body.set('to', to);
  body.set('subject', subject);
  if (text) body.set('text', text);
  if (html) body.set('html', html);
  body.set('h:Reply-To', cfg.replyTo);
  body.set('o:tracking', 'no');
  try {
    const r = await fetch(`${cfg.apiBase}/v3/${encodeURIComponent(cfg.domain)}/messages`, {
      method: 'POST',
      headers: { authorization: 'Basic ' + Buffer.from('api:' + cfg.apiKey).toString('base64') },
      body,
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) {
      cfg.log(`[mail] Mailgun respondió ${r.status} (asunto="${subject}")`);
      return { ok: false, status: r.status };
    }
    return { ok: true };
  } catch (e) {
    cfg.log('[mail] no se pudo enviar:', e.name, e.cause?.code || '');
    return { ok: false };
  }
}

// Email simple con la estética del sitio: título, párrafos, botón opcional y pie.
export function emailBasico({ titulo, parrafos = [], boton = null, pie = '' }) {
  const pieTxt = pie || 'Este es un mensaje automático de SexyRose. Si no fuiste vos, ignoralo o escribinos a contacto@sexyrose.net.';
  const text = [titulo, '', ...parrafos.flatMap((p) => [p, '']), ...(boton ? [`${boton.texto}: ${boton.url}`, ''] : []), '—', pieTxt].join('\n');
  const e = escapeHtml;
  const html = `<!doctype html><html lang="es"><body style="margin:0;padding:0;background:#15131A">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#15131A;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#1F1C26;border-radius:16px;padding:28px;font-family:Arial,Helvetica,sans-serif;color:#F7F3F6">
<tr><td style="padding-bottom:4px"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="padding-right:8px;vertical-align:middle"><img src="${e(urlSitio('/logo-email.png'))}" width="32" height="32" alt="" style="display:block;border:0;border-radius:9px"></td><td style="font-size:20px;font-weight:bold;color:#F7F3F6;vertical-align:middle;font-family:Poppins,Arial,Helvetica,sans-serif;letter-spacing:-0.3px">SexyRose</td></tr></table></td></tr>
<tr><td style="font-size:18px;font-weight:bold;padding:12px 0 8px">${e(titulo)}</td></tr>
${parrafos.map((p) => `<tr><td style="font-size:15px;line-height:1.5;color:#D9D2DC;padding:4px 0">${e(p)}</td></tr>`).join('\n')}
${boton ? `<tr><td style="padding:18px 0 8px"><a href="${e(boton.url)}" style="display:inline-block;background:#FF5C8A;color:#15131A;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">${e(boton.texto)}</a></td></tr>
<tr><td style="font-size:12px;color:#9A91A0;padding-top:6px;word-break:break-all">Si el botón no funciona, copiá este link: ${e(boton.url)}</td></tr>` : ''}
<tr><td style="font-size:12px;color:#9A91A0;padding-top:22px;border-top:1px solid #34303D">${e(pieTxt)}</td></tr>
</table></td></tr></table></body></html>`;
  return { text, html };
}

// Plantillas de Fase 1 (cuenta). Los links apuntan al sitio (el SPA maneja /cuenta/verificar y /cuenta/restablecer).
export const plantillas = {
  verificar: ({ nombre, url }) => ({
    subject: 'Confirmá tu email en SexyRose',
    ...emailBasico({
      titulo: `Hola${nombre ? ', ' + nombre : ''}: confirmá tu email`,
      parrafos: ['Tocá el botón para confirmar que este email es tuyo. El link vence en 48 horas.'],
      boton: { texto: 'Confirmar email', url },
    }),
  }),
  restablecer: ({ url }) => ({
    subject: 'Cambiá tu contraseña de SexyRose',
    ...emailBasico({
      titulo: 'Cambiar tu contraseña',
      parrafos: ['Pediste cambiar la contraseña de tu cuenta. El link vence en 1 hora y sirve una sola vez.', 'Si no lo pediste, ignorá este email: tu contraseña sigue igual.'],
      boton: { texto: 'Elegir una contraseña nueva', url },
    }),
  }),
  // Cuentas de interesados (clientes): links a /cliente/verificar y /cliente/restablecer
  verificarCliente: ({ usuario, url }) => ({
    subject: 'Confirmá tu email en SexyRose',
    ...emailBasico({
      titulo: `Hola${usuario ? ', ' + usuario : ''}: confirmá tu email`,
      parrafos: ['Tocá el botón para confirmar que este email es tuyo. El link vence en 48 horas.'],
      boton: { texto: 'Confirmar email', url },
    }),
  }),
  restablecerCliente: ({ url }) => ({
    subject: 'Cambiá tu contraseña de SexyRose',
    ...emailBasico({
      titulo: 'Cambiar tu contraseña',
      parrafos: ['Pediste cambiar la contraseña de tu cuenta. El link vence en 1 hora y sirve una sola vez.', 'Si no lo pediste, ignorá este email: tu contraseña sigue igual.'],
      boton: { texto: 'Elegir una contraseña nueva', url },
    }),
  }),
  // Registro con un email que ya tiene cuenta: no se revela en el sitio; se le avisa al dueño del email.
  intentoRegistro: ({ urlIngresar, urlRecuperar }) => ({
    subject: 'Alguien intentó crear una cuenta con tu email en SexyRose',
    ...emailBasico({
      titulo: 'Ya tenés una cuenta con este email',
      parrafos: [
        'Alguien intentó crear una cuenta nueva en SexyRose con este email. Como ya tenés una, no se creó otra.',
        'Si fuiste vos, ingresá con tu contraseña. Si no la recordás, podés elegir una nueva.',
        ...(urlRecuperar ? [`Recuperar la contraseña: ${urlRecuperar}`] : []),
        'Si no fuiste vos, ignorá este email: tu cuenta sigue igual.',
      ],
      boton: { texto: 'Ingresar', url: urlIngresar },
    }),
  }),
  perfilAprobado: ({ nombre, url }) => ({
    subject: 'Tu perfil de SexyRose ya está publicado',
    ...emailBasico({
      titulo: `¡Listo${nombre ? ', ' + nombre : ''}! Tu perfil ya se ve en SexyRose`,
      parrafos: ['Revisamos tus datos y tu verificación. Tu perfil ya está publicado.'],
      boton: url ? { texto: 'Ver mi perfil', url } : null,
    }),
  }),
  perfilRechazado: ({ nombre, motivo, url }) => ({
    subject: 'Tu perfil de SexyRose necesita cambios',
    ...emailBasico({
      titulo: `Hola${nombre ? ', ' + nombre : ''}: tu perfil necesita cambios`,
      parrafos: ['Revisamos tu perfil y todavía no lo podemos publicar.', ...(motivo ? [`Motivo: ${motivo}`] : []), 'Corregí lo que haga falta desde tu panel y volvé a enviarlo a revisión.'],
      boton: url ? { texto: 'Ir a mi panel', url } : null,
    }),
  }),
};

export const urlSitio = (ruta) => cfg.siteUrl.replace(/\/+$/, '') + ruta;
