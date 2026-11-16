// Textos fijos de ayuda del asistente de cuenta (herramienta "ayuda"). Juan los puede editar acá.
// Están armados con los textos que ya usa el sitio (panel de la acompañante, emails, preguntas frecuentes): no
// agregan reglas nuevas. {url} se reemplaza por la dirección del sitio (SITE_URL). El asistente los pasa al idioma
// de la persona si escribe en inglés o portugués.
// Reglas de siempre: sin actividades, sin garantías ni fechas, sin explicar cómo funciona el negocio por dentro.

export const AYUDA = Object.freeze({
  registro: 'Para publicar tu perfil:\n'
    + '1. Creá tu cuenta en {url}/registro con tu email y una contraseña de al menos 10 caracteres, y confirmá tu email con el link que te mandamos.\n'
    + '2. Completá tu perfil y subí al menos 3 fotos.\n'
    + '3. Mandá una selfie y tu documento para verificar tu identidad: nunca se publican.\n'
    + '4. Enviá tu perfil a revisión.\n'
    + 'Solo para acompañantes mayores de 18. Con el plan Bronce publicás gratis.',

  verificacion: 'La verificación de identidad se manda desde {url}/panel/verificacion con dos fotos:\n'
    + '- Una selfie sosteniendo tu documento al lado de la cara, con buena luz.\n'
    + '- Una foto del frente de tu documento (DNI o pasaporte), que se lean el nombre y la fecha de nacimiento.\n'
    + 'Confirmamos que sos vos y que sos mayor de 18. La selfie y el documento nunca se publican ni se comparten, y se borran a los 3 meses. '
    + 'Te avisamos por email cuando la revisemos. Si te equivocaste de archivo, podés mandarla de nuevo.',

  publicar: 'Para enviar tu perfil a revisión tiene que estar completo: nombre artístico, género, fecha de nacimiento, provincia y ciudad, '
    + 'tu WhatsApp o tu usuario de Telegram, al menos 3 fotos, tu email confirmado y la verificación de identidad enviada. '
    + 'En {url}/panel ves qué te falta y el botón "Enviar a revisión". Revisamos tu perfil y tu verificación y te avisamos por email. '
    + 'Si lo rechazamos, revisá el motivo, corregí lo necesario y volvé a enviarlo. '
    + 'Con "Ocultar mi perfil" lo sacás del sitio cuando quieras, sin perder nada.',

  fotos: 'Fotos reales, con la cara visible. Sin desnudos. Mínimo 3; el máximo depende de tu plan. '
    + 'La primera es la principal (la del swipe y las historias). Les agregamos la marca de agua de SexyRose y les sacamos los datos de ubicación. '
    + 'Las reglas completas están en {url}/contenido.',

  planes: 'Hay 4 planes: Bronce (gratis), Plata, Oro y Star. Con un plan más alto aparecés más arriba y podés subir más fotos e historias. '
    + 'Star tiene lugar fijo arriba del inicio en tu provincia (solo 10 por provincia). '
    + 'Los planes se pagan con créditos desde {url}/panel/plan, por mes (30 días). Con la renovación automática encendida, '
    + 'el plan se renueva solo al vencer si tenés créditos; si no te alcanzan, tu perfil se pausa hasta que cargues. '
    + 'La renovación automática se puede apagar desde el mismo lugar. Los precios actuales te los paso si me los pedís.',

  creditos: '1 crédito = USD 1. Con los créditos pagás tu plan, las semanas y el Destacado. '
    + 'Se compran desde {url}/panel/creditos: elegís un pack (algunos traen créditos de regalo) o una carga a medida '
    + '(de 10 a 10000 créditos) y se abre WhatsApp con el pedido; por acá te paso el monto en pesos y los datos para transferir. '
    + 'Un pedido espera el pago 48 horas; después se cancela solo. Se acreditan cuando se verifica el pago. '
    + 'Los créditos no vencen. No se devuelven en dinero ni se pueden pasar a otra cuenta. '
    + 'Nunca te vamos a pedir datos de tu tarjeta ni de tu banco en la web.',

  semanas: 'Oro y Star también se compran por semana (7 días), con créditos, desde {url}/panel/plan. '
    + 'Una semana de un plan más alto te sube 7 días y después volvés sola a tu plan. Las semanas no se renuevan solas.',

  destacado: 'Con el Destacado tu tarjeta aparece primero dentro de tu plan en tu provincia, con la etiqueta Destacado. '
    + 'Si hay varias destacadas, el orden cambia en cada visita. Se compra con créditos, por semana o por mes, desde {url}/panel/destacado. '
    + 'Los lugares son limitados en cada provincia: si no hay lugar, el panel te muestra la próxima fecha libre y la podés reservar. '
    + 'Con Star ya aparecés arriba de todo, así que no hace falta.',

  contrasena: 'Para cambiar la contraseña: en {url}/ingresar tocá "¿Olvidaste tu contraseña?", escribí el email de tu cuenta y te mandamos '
    + 'un link para crear una nueva. El link vence en 1 hora y sirve una sola vez. Revisá también la carpeta de spam. '
    + 'Si ya entraste, la cambiás desde la sección Cuenta de tu panel. Nunca mandes tu contraseña por este chat.',

  email: 'Si no te llega un email nuestro (confirmación de la cuenta o cambio de contraseña): revisá la carpeta de spam o correo no deseado '
    + 'y que el email esté bien escrito. El link para confirmar el email vence en 48 horas: desde tu panel podés pedirlo de nuevo '
    + 'con "Mandar de nuevo". El de la contraseña se pide otra vez desde "¿Olvidaste tu contraseña?".',

  enlaces: 'Enlaces del sitio:\n'
    + '- Crear cuenta: {url}/registro\n'
    + '- Ingresar: {url}/ingresar\n'
    + '- Tu panel: {url}/panel\n'
    + '- Plan: {url}/panel/plan\n'
    + '- Créditos: {url}/panel/creditos\n'
    + '- Destacado: {url}/panel/destacado\n'
    + '- Verificación: {url}/panel/verificacion\n'
    + '- Términos: {url}/terminos\n'
    + '- Privacidad: {url}/privacidad\n'
    + '- Política de contenido: {url}/contenido\n'
    + '- Denunciar: {url}/denunciar',
});

export const TEMAS_AYUDA = Object.freeze(Object.keys(AYUDA));
export const textoAyuda = (tema, siteUrl) => (AYUDA[tema] ? AYUDA[tema].replace(/\{url\}/g, String(siteUrl || '').replace(/\/+$/, '')) : null);
