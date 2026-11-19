// Textos fijos de ayuda del asistente de cuenta (herramienta "ayuda"). Juan los puede editar acá.
// Están armados con los textos que ya usa el sitio (panel de la acompañante, emails, preguntas frecuentes, páginas de
// Términos, Privacidad, Contenido y Denunciar): no agregan reglas nuevas. {url} se reemplaza por la dirección del sitio
// (SITE_URL). El asistente los pasa al idioma de la persona si escribe en inglés o portugués.
// Reglas de siempre: sin actividades, sin garantías ni fechas, sin explicar cómo funciona el negocio por dentro
// (comisiones, proveedores, costos, cómo se verifica o se modera). Las pruebas (test/asistente.test.js) revisan que
// ningún texto nombre cosas internas.
//
// "contenido" tiene dos textos: AYUDA.contenido (cómo empezar a vender) solo si la venta de contenido está habilitada
// en el sitio (lib/contenido.js → ajuste venta_contenido_estado, lo publica el app); si no, CONTENIDO_PROXIMAMENTE
// (decisión de Juan, 17/11/2026: "próximamente", sin fechas ni motivos).
//
// "apertura" tiene dos textos: con la home provisoria prendida (lib/prelanzamiento.js), APERTURA_PRELANZAMIENTO (decisión
// de Juan, 19/11/2026: "a partir de diciembre", igual que la invitación de captación; es la única fecha que da el
// asistente); con el sitio abierto, AYUDA.apertura.

export const AYUDA = Object.freeze({
  registro: 'Para publicar tu perfil:\n'
    + '1. Creá tu cuenta en {url}/registro con tu email y una contraseña de al menos 10 caracteres, y confirmá tu email con el link que te mandamos.\n'
    + '2. Completá tus datos y subí al menos 3 fotos.\n'
    + '3. Mandá las fotos de tu documento y una selfie para verificar tu identidad: nunca se publican.\n'
    + '4. Cuando está todo completo, tu perfil pasa solo a revisión. No hace falta tocar ningún botón.\n'
    + 'La primera vez que entrás al panel te guiamos paso a paso ({url}/panel/primeros-pasos).\n'
    + 'Solo para acompañantes mayores de 18. Con el plan Bronce publicás gratis.',

  verificacion: 'La verificación de identidad se manda desde {url}/panel/verificacion con tu nombre completo, como figura en tu documento (no se publica), y tres fotos:\n'
    + '- Una foto del frente de tu documento (DNI o pasaporte), que se lean el nombre y la fecha de nacimiento.\n'
    + '- Una foto del dorso de tu documento, completo y sin reflejos.\n'
    + '- Una selfie sosteniendo tu documento al lado de la cara, con buena luz.\n'
    + 'Confirmamos que sos vos y que sos mayor de 18. La selfie y el documento nunca se publican ni se comparten, y se borran a los 3 meses. '
    + 'Te avisamos por email cuando la revisemos. Si te equivocaste de archivo, podés mandarla de nuevo.',

  publicar: 'Tu perfil pasa solo a revisión cuando está completo: nombre artístico, género, fecha de nacimiento, provincia y ciudad, '
    + 'tu WhatsApp o tu usuario de Telegram, al menos 3 fotos, tu email confirmado y la verificación de identidad enviada. No hay que tocar ningún botón. '
    + 'En {url}/panel ves qué te falta, con un botón "Completar" en cada cosa, y en {url}/panel/primeros-pasos lo hacés paso a paso. '
    + 'Revisamos tu perfil y tu verificación y te avisamos por email. '
    + 'Si lo rechazamos, revisá el motivo y corregí lo necesario: cuando guardes los cambios, vuelve solo a revisión. '
    + 'Con "Ocultar mi perfil" lo sacás del sitio cuando quieras, sin perder nada.',

  fotos: 'Fotos reales, con la cara visible. Mínimo 3; el máximo depende de tu plan. '
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

  perfil: 'Tu ficha se completa en {url}/panel/perfil. Lo que ves ahí es lo que se publica: tu email, tu documento y tu fecha de nacimiento no se muestran (de la fecha se publica solo tu edad).\n'
    + '- Datos básicos: nombre artístico, género, tipo de perfil (Acompañante, Virtual o Ambas; Virtual es sin encuentros en persona), fecha de nacimiento y nacionalidad.\n'
    + '- Dónde estás: provincia y localidad, elegida de la lista (en Capital Federal, el barrio es opcional).\n'
    + '- Presentación: un titular y "Sobre vos" (hasta 1500 caracteres). Opcional: la versión en inglés, para clientes de afuera.\n'
    + '- Sobre mí: idiomas (Español, Inglés, Portugués u "Otro" que escribís vos), altura, contextura y servicios (hasta 6 de la lista).\n'
    + '- Contacto: tu WhatsApp con código de país (es el número al que te escriben) y, si querés, tu usuario de Telegram; para publicar necesitás al menos uno. También tarifa desde (opcional) y hasta 4 links con https://.\n'
    + 'Los cambios se ven en el sitio apenas guardás (si tu perfil está publicado).',

  historias: 'Historias, desde {url}/panel/historias:\n'
    + '- Duran 24 horas y aparecen en el inicio con tu anillo. Se ven cuando tu perfil está publicado.\n'
    + '- Subís una foto (o un video de hasta 60 segundos y 95 MB, si tu panel te deja elegir video) con un texto opcional de hasta 120 caracteres.\n'
    + '- Cuántas por día depende de tu plan: Bronce 1, Plata hasta 3, Oro y Star ilimitadas. El panel te muestra cuántas te quedan hoy.\n'
    + '- Destacadas: quedan fijas en tu perfil, como en Instagram. Les ponés un nombre y les subís fotos (o videos). Cuántas podés tener depende de tu plan: lo ves en esa misma sección.',

  videos: 'Videos: si tu panel los muestra, están en {url}/panel/fotos, debajo de tus fotos.\n'
    + '- Hasta 30 segundos y 95 MB cada uno, con la cara visible. Les agregamos la marca de agua de SexyRose y les sacamos los datos de ubicación.\n'
    + '- Cuántos podés subir depende de tu plan (lo ves en {url}/panel/plan).\n'
    + '- Se ven en tu perfil y en Shorts, la sección de videos del sitio. Tus historias en video también aparecen en Shorts mientras duran.\n'
    + '- Video de tu tarjeta: desde el plan Plata, tu tarjeta del inicio y de las páginas de tu ciudad muestra 5 segundos sin sonido de uno de tus videos. Elegís el video y desde qué segundo.\n'
    + 'Mismas reglas que las fotos: {url}/contenido.',

  mis_numeros: 'En Mis números ({url}/panel/numeros) ves cuántas veces se abrió tu perfil y cuántas veces tocaron tus botones de WhatsApp y Telegram, en los últimos 7, 30 o 90 días. '
    + 'La tasa de contacto es toques ÷ visitas. Cuando se puede, cada número se compara con el mismo tiempo justo antes. '
    + 'No incluye tus propias visitas. Los números empiezan a aparecer cuando tu perfil está publicado.',

  avisos: 'En Avisos ({url}/panel/avisos) te avisamos de pagos, renovaciones de tu plan y Destacado: cuando acreditamos tus créditos o se rechaza un pedido de créditos, '
    + 'cuando se activa, se renueva, está por terminar o terminó tu plan, si faltan créditos para renovarlo o tu perfil se pausó por eso, y cuando empieza tu Destacado. '
    + 'Tocando un aviso vas a la sección que corresponde. Los que no leíste se marcan con un punto y podés marcarlos todos como leídos.',

  ocultar_o_baja: 'Ocultar tu perfil: con tu perfil publicado, en el resumen de tu panel ({url}/panel) está "Ocultar mi perfil". Lo sacás del sitio cuando quieras, sin perder nada, y lo volvés a mostrar desde el mismo lugar.\n'
    + 'Dar de baja la cuenta: se pide por email a contacto@sexyrose.net. Si pedís cerrarla, borramos tus datos, salvo lo que la ley obligue a conservar.\n'
    + 'Si eliminamos tu cuenta y querés saber el motivo, preguntalo en este chat desde el número de WhatsApp que tenías en tu perfil.',

  como_funciona: 'Así te ven los clientes en {url}:\n'
    + '- Inicio: las acompañantes de cada ciudad, las historias del día y las Stars del mes. Se puede filtrar por ciudad, género, tipo (Acompañantes o Virtuales) y servicios. Con un plan más alto aparecés más arriba.\n'
    + '- Swipe: los perfiles de a uno. Con "Me gusta" se abre tu WhatsApp; con "Paso" sigue el siguiente.\n'
    + '- Cerca: las acompañantes más cercanas a quien mira, por distancia, si comparte su ubicación.\n'
    + '- Shorts: los videos de las acompañantes, de a uno, en pantalla completa.\n'
    + '- Stars: las Star aparecen primero en el swipe, en el inicio y en los shorts de su provincia.\n'
    + 'Para mirar perfiles no hace falta cuenta. Los clientes te escriben directo a tu WhatsApp o tu Telegram desde tu perfil: lo que hablen y acuerden queda entre ustedes; SexyRose no tiene acceso a esas conversaciones ni interviene en ellas.',

  denuncias: 'Para denunciar algo: el botón Reportar de cada perfil o la página {url}/denunciar (también si alguien publica fotos tuyas sin tu permiso). '
    + 'Se puede denunciar sin cuenta y de forma anónima. Si sospechás que hay una menor o un caso de trata, llamá también a la Línea 145, gratis y las 24 horas; si alguien corre peligro en este momento, al 911.\n'
    + 'Si rechazamos o quitamos algo tuyo, o suspendemos tu cuenta, te llega el motivo y podés apelar dentro de los 14 días respondiendo el email del aviso o escribiendo a contacto@sexyrose.net. '
    + 'Los plazos están en {url}/contenido.',

  idiomas: 'El sitio está en español, inglés y portugués: cada visitante elige el idioma, y tu panel también se puede usar en los tres. '
    + 'En {url}/panel/perfil podés sumar tu presentación en inglés (opcional, para clientes de afuera): quien mira el sitio en inglés ve esa versión. '
    + 'Ahí también marcás los idiomas que hablás: Español, Inglés, Portugués u "Otro" que escribís vos.',

  contenido: 'Para vender tu contenido, desde {url}/panel/contenido:\n'
    + '1. Conectá tu cuenta de Mercado Pago con "Conectar Mercado Pago": el dinero de cada venta va directo a tu cuenta.\n'
    + '2. Tocá "Agregar pack" y cargá el título, una descripción (opcional), el precio en pesos y el link a tu pack (tiene que empezar con https://). El link lo ve solo quien lo compra, después de pagar.\n'
    + '3. Tus packs se muestran en tu perfil mientras tu Mercado Pago está conectado. Quien compra paga con Mercado Pago y, apenas se aprueba el pago, ve tu link.\n'
    + 'Cuántos packs podés tener a la venta depende de tu plan: lo ves en esa misma sección, junto con tus ventas. '
    + 'Con Oro o Star y Mercado Pago conectado, los clientes también te pueden hacer pedidos personalizados desde tu perfil: los ves en {url}/panel/pedidos.',

  apertura: 'SexyRose ya está abierto: los perfiles publicados se ven en {url}.',

  enlaces: 'Enlaces del sitio:\n'
    + '- Crear cuenta: {url}/registro\n'
    + '- Ingresar: {url}/ingresar\n'
    + '- Tu panel: {url}/panel\n'
    + '- Primeros pasos (tu perfil paso a paso): {url}/panel/primeros-pasos\n'
    + '- Mis números: {url}/panel/numeros\n'
    + '- Mi perfil: {url}/panel/perfil\n'
    + '- Fotos (y videos): {url}/panel/fotos\n'
    + '- Verificación: {url}/panel/verificacion\n'
    + '- Historias: {url}/panel/historias\n'
    + '- Plan: {url}/panel/plan\n'
    + '- Destacado: {url}/panel/destacado\n'
    + '- Créditos: {url}/panel/creditos\n'
    + '- Venta de contenido: {url}/panel/contenido\n'
    + '- Avisos: {url}/panel/avisos\n'
    + '- Cuenta (email y contraseña): {url}/panel/cuenta\n'
    + '- Términos: {url}/terminos\n'
    + '- Privacidad: {url}/privacidad\n'
    + '- Política de contenido: {url}/contenido\n'
    + '- Contra la trata: {url}/trata\n'
    + '- Denunciar: {url}/denunciar',
});

// "contenido" mientras la venta de contenido no está habilitada en el sitio.
export const CONTENIDO_PROXIMAMENTE = 'La venta de contenido todavía no está disponible en SexyRose: va a estar próximamente.';

// "apertura" mientras la home provisoria está prendida (el sitio todavía no muestra perfiles al público).
export const APERTURA_PRELANZAMIENTO = 'SexyRose abre al público a partir de diciembre. Mientras tanto ya podés crear tu perfil en {url}/registro y dejarlo listo para estar desde el primer día. '
  + 'Hasta que abramos, los perfiles no se ven en el sitio: vos podés ver cómo queda el tuyo con la vista previa de tu panel.';

export const TEMAS_AYUDA = Object.freeze(Object.keys(AYUDA));
// contenidoDisponible: solo cuenta para el tema "contenido" (sin el dato, "próximamente").
// prelanzamiento: solo cuenta para el tema "apertura" (sin el dato, el texto de la home provisoria).
export function textoAyuda(tema, siteUrl, { contenidoDisponible = false, prelanzamiento = true } = {}) {
  if (!Object.hasOwn(AYUDA, tema)) return null;
  let t = AYUDA[tema];
  if (tema === 'contenido' && contenidoDisponible !== true) t = CONTENIDO_PROXIMAMENTE;
  if (tema === 'apertura' && prelanzamiento !== false) t = APERTURA_PRELANZAMIENTO;
  return t.replace(/\{url\}/g, String(siteUrl || '').replace(/\/+$/, ''));
}
