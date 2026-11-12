/* ============================================================
   SexyRose — prod-sitio.js (Fase 1: sitio público real + panel de la acompañante)
   Solo se activa en el paquete "sitio" (build.py con HH_TARGET=sitio → window.HH_PROD = 'sitio').
   - El sitio público usa SOLO datos reales: GET /api/sitio/estado (perfiles publicados y verificados).
   - Las acompañantes crean su cuenta, arman su perfil, suben fotos, verificación e historias y piden
     su plan por transferencia contra /api/cuenta/… (cookie de sesión del servidor).
   - Fuera del lanzamiento del 15/11 (no se muestra nada de esto): cuentas de clientes, compras,
     contenido exclusivo, packs, pedidos a medida, reservas, shorts y videos (el chat en vivo no existe en la web).
   - En el navegador solo se guardan preferencias de la interfaz (idioma, géneros, historias vistas).
   ============================================================ */
(function () {
  'use strict';
  if (window.HH_PROD !== 'sitio') return;
  HH.PROD = 'sitio';
  const esc = HH.esc, icon = HH.icon;
  // Subida temporal (Juan, 11/11/2026): "Subí a X por 7 días", un botón por cada plan más alto que el actual
  // (Bronce → Oro y Star; Plata → Oro y Star; Oro → Star; Star → ninguno). Plata no tiene semana.
  const UPGRADE_LABEL = (planNombre) => 'Subí a ' + planNombre + ' por 7 días';
  const GENEROS = [['mujer', 'Mujer'], ['trans', 'Trans'], ['hombre', 'Hombre']];
  const ESTADO_PERFIL = {
    borrador: ['neutral', 'Borrador', 'Completá tu perfil y envialo a revisión. Nadie lo ve todavía.'],
    en_revision: ['warn', 'En revisión', 'Estamos revisando tu perfil y tu verificación. Te avisamos por email.'],
    publicado: ['ok', 'Publicado', 'Tu perfil se ve en el sitio.'],
    rechazado: ['danger', 'Rechazado', 'Revisá el motivo, corregí lo necesario y volvé a enviarlo.'],
    pausado: ['neutral', 'Pausado', 'Tu perfil no se ve en el sitio por ahora.'],
    suspendido: ['danger', 'Suspendido', 'Tu perfil fue suspendido. Escribinos a contacto@sexyrose.net.'],
  };
  const VERIF = { sin_enviar: ['neutral', 'Sin enviar'], pendiente: ['warn', 'En revisión'], verificada: ['ok', 'Verificada'], rechazada: ['danger', 'Rechazada'] };
  // Pedidos de créditos (se pagan por WhatsApp; en la web nunca hay datos bancarios)
  const PEDIDO = { pendiente: ['warn', 'Esperando pago'], confirmado: ['ok', 'Acreditado'], rechazado: ['danger', 'Rechazado'], cancelado: ['neutral', 'Cancelado'], vencido: ['neutral', 'Vencido'] };
  // Planes v2 (11/11/2026): Bronce, Plata, Oro y Star. Platino y Diamante no existen más.
  const RANK = { E: 1, D: 2, C: 3, S: 4 };
  // Etiqueta "Destacado" en la tarjeta: 'A' = arriba del nombre (por defecto), 'B' = pastilla arriba a la izquierda
  const BADGE_DESTACADO = 'A';
  const PANEL_TABS = [
    { id: 'resumen', label: 'Resumen', icon: 'dashboard' },
    { id: 'perfil', label: 'Mi perfil', icon: 'user' },
    { id: 'fotos', label: 'Fotos', icon: 'image' },
    { id: 'verificacion', label: 'Verificación', icon: 'shield' },
    { id: 'historias', label: 'Historias', icon: 'camera' },
    { id: 'plan', label: 'Plan', icon: 'card' },
    { id: 'creditos', label: 'Créditos', icon: 'wallet' },
    { id: 'destacado', label: 'Destacado', icon: 'sparkles' },
    { id: 'contenido', label: 'Contenido', icon: 'bag' }, // venta de contenido (prod-contenido.js)
    { id: 'pedidos', label: 'Pedidos', icon: 'chat' }, // pedidos personalizados con chat (prod-clientes.js)
    { id: 'avisos', label: 'Avisos', icon: 'bell' },
    { id: 'cuenta', label: 'Cuenta', icon: 'settings' },
  ];

  /* ---------- Textos del sitio real en inglés y portugués (no tocan el diccionario de la demo) ---------- */
  Object.assign(HH.I18N = HH.I18N || {}, {"Videos · {n} / {n}": ["Videos · {n} / {n}", "Vídeos · {n} / {n}"], "Hasta 30 segundos y 95 MB. Les agregamos la marca de agua y les sacamos los datos de ubicación.": ["Up to 30 seconds and 95 MB. We add the watermark and remove location data.", "Até 30 segundos e 95 MB. Adicionamos a marca d’água e removemos os dados de localização."], "Subir video": ["Upload video", "Enviar vídeo"], "Subiendo video…": ["Uploading video…", "Enviando vídeo…"], "Procesando…": ["Processing…", "Processando…"], "No se pudo procesar.": ["Could not be processed.", "Não foi possível processar."], "Todavía no subiste videos": ["You have not uploaded videos yet", "Você ainda não enviou vídeos"], "Videos cortos de tus salidas, con la cara visible. Sin desnudos.": ["Short videos of your outings, with your face visible. No nudity.", "Vídeos curtos dos seus passeios, com o rosto visível. Sem nudez."], "Recibimos el video. Lo estamos procesando.": ["We received the video. We are processing it.", "Recebemos o vídeo. Estamos processando."], "Borrar video": ["Delete video", "Apagar vídeo"], "¿Querés borrar este video? No se puede deshacer.": ["Delete this video? This cannot be undone.", "Apagar este vídeo? Não dá para desfazer."], "Video borrado.": ["Video deleted.", "Vídeo apagado."], "El video pesa más de 95 MB. Recortalo o grabalo en menor calidad.": ["The video is larger than 95 MB. Trim it or record it in lower quality.", "O vídeo tem mais de 95 MB. Corte ou grave em qualidade menor."], "Video": ["Video", "Vídeo"], "Videos": ["Videos", "Vídeos"]});
  Object.assign(HH.I18N = HH.I18N || {}, { "1 mes": ["1 month", "1 mês"], "1 semana": ["1 week", "1 semana"], "asignado": ["assigned", "atribuído"], "Te mostramos los datos para transferir.": ["We will show you the transfer details.", "Mostramos os dados para transferência."], "Del {x} al {x}": ["From {x} to {x}", "De {x} a {x}"], "(hasta 4, con https://)": [ "(up to 4, with https://)", "(até 4, com https://)" ], "(opcional, para clientes de afuera)": [ "(optional, for clients from abroad)", "(opcional, para clientes de fora)" ], "A convenir": [ "To be agreed", "A combinar" ], "Acepto los": [ "I accept the", "Aceito os" ], "Acompañantes": [ "Companions", "Acompanhantes" ], "Activas": [ "Active", "Ativas" ], "Aprobamos tu perfil y aparece en el sitio. Los clientes te escriben directo por WhatsApp o Telegram.": [ "We approve your profile and it shows on the site. Clients write to you directly on WhatsApp or Telegram.", "Aprovamos seu perfil e ele aparece no site. Os clientes escrevem direto pelo WhatsApp ou Telegram." ], "Avisar que transferí": [ "Let you know I paid", "Avisar que transferi" ], "Barrio o zona": [ "Neighborhood or area", "Bairro ou região" ], "Borrador": [ "Draft", "Rascunho" ], "Borrar foto": [ "Delete photo", "Apagar foto" ], "Cada acompañante envía una selfie con su documento y una foto del documento, que revisa el equipo de SexyRose: confirmamos que es mayor de edad y que es la persona de las fotos. Solo se publican los perfiles verificados.": [ "Each companion sends a selfie holding her ID and a photo of the ID, reviewed by the SexyRose team: we confirm she is of legal age and the person in the photos. Only verified profiles are published.", "Cada acompanhante envia uma selfie com o documento e uma foto do documento, que a equipe da SexyRose revisa: confirmamos que é maior de idade e que é a pessoa das fotos. Só os perfis verificados são publicados." ], "Cancelado": [ "Canceled", "Cancelado" ], "Completá tu perfil y envialo a revisión. Nadie lo ve todavía.": [ "Complete your profile and send it for review. Nobody can see it yet.", "Complete seu perfil e envie para revisão. Ninguém o vê ainda." ], "Completá tu perfil y subí al menos 3 fotos.": [ "Complete your profile and upload at least 3 photos.", "Complete seu perfil e envie pelo menos 3 fotos." ], "Comprobante": [ "Receipt", "Comprovante" ], "Con código de país. Es el número al que te escriben.": [ "With country code. It is the number clients write to.", "Com código do país. É o número para o qual escrevem." ], "Confirmado": [ "Confirmed", "Confirmado" ], "Confirmando tu email…": [ "Confirming your email…", "Confirmando seu e-mail…" ], "Confirmar email": [ "Confirm email", "Confirmar e-mail" ], "Confirmá tu email: te mandamos un link a": [ "Confirm your email: we sent a link to", "Confirme seu e-mail: enviamos um link para" ], "Contacto y tarifa": [ "Contact and rate", "Contato e tarifa" ], "Contanos qué pasó. Revisamos cada reporte y podemos suspender el perfil.": [ "Tell us what happened. We review every report and can suspend the profile.", "Conte o que aconteceu. Revisamos cada denúncia e podemos suspender o perfil." ], "Contraseña cambiada.": [ "Password changed.", "Senha alterada." ], "Contraseña nueva": [ "New password", "Nova senha" ], "Creá tu cuenta": [ "Create your account", "Crie sua conta" ], "Creá tu cuenta y confirmá tu email.": [ "Create your account and confirm your email.", "Crie sua conta e confirme seu e-mail." ], "Cuando transfieras, tocá \"Ya transferí\" en tus pedidos. Confirmamos el pago y se activa el plan.": [ "Once you transfer, tap \"I already paid\" in your orders. We confirm the payment and the plan is activated.", "Quando transferir, toque em \"Já transferi\" nos seus pedidos. Confirmamos o pagamento e o plano é ativado." ], "Cuenta creada. Te mandamos un email para confirmarlo.": [ "Account created. We sent you an email to confirm it.", "Conta criada. Enviamos um e-mail para confirmá-lo." ], "Cómo funciona": [ "How it works", "Como funciona" ], "Datos para transferir": [ "Transfer details", "Dados para transferência" ], "Demasiados intentos. Probá de nuevo en un rato.": [ "Too many attempts. Try again in a while.", "Muitas tentativas. Tente de novo daqui a pouco." ], "Denunciar": [ "Report", "Denunciar" ], "Duran 24 horas y aparecen en el inicio con tu anillo. Lo mejor para mostrar tu día.": [ "They last 24 hours and appear on the home page with your ring. The best way to show your day.", "Duram 24 horas e aparecem no início com o seu anel. O melhor jeito de mostrar seu dia." ], "Dónde estás": [ "Where you are", "Onde você está" ], "El archivo es demasiado grande.": [ "The file is too large.", "O arquivo é grande demais." ], "El link no es válido o ya venció.": [ "The link is not valid or has expired.", "O link não é válido ou já expirou." ], "El link no tiene el código de confirmación.": [ "The link is missing the confirmation code.", "O link não tem o código de confirmação." ], "El link no tiene el código. Pedí uno nuevo desde \"¿Olvidaste tu contraseña?\".": [ "The link is missing the code. Request a new one from \"Forgot your password?\".", "O link não tem o código. Peça um novo em \"Esqueceu sua senha?\"." ], "Elegí las dos fotos: la selfie con el documento y el frente del documento.": [ "Choose both photos: the selfie with your ID and the front of your ID.", "Escolha as duas fotos: a selfie com o documento e a frente do documento." ], "Elegí primero la provincia": [ "Choose the province first", "Escolha primeiro a província" ], "Elegí tu provincia": [ "Choose your province", "Escolha sua província" ], "Elegí tu provincia en Mi perfil para ver el cupo.": [ "Choose your province in My profile to see availability.", "Escolha sua província em Meu perfil para ver as vagas." ], "Elegí una contraseña nueva de al menos 10 caracteres. Se cierran las sesiones abiertas en otros dispositivos.": [ "Choose a new password of at least 10 characters. Sessions open on other devices will be closed.", "Escolha uma nova senha com pelo menos 10 caracteres. As sessões abertas em outros dispositivos serão encerradas." ], "Elegí una foto.": [ "Choose a photo.", "Escolha uma foto." ], "Email confirmado": [ "Email confirmed", "E-mail confirmado" ], "Email sin confirmar": [ "Email not confirmed", "E-mail não confirmado" ], "Error del servidor. Probá de nuevo en unos minutos.": [ "Server error. Try again in a few minutes.", "Erro do servidor. Tente de novo em alguns minutos." ], "Es el nombre que se ve en el sitio. No uses tu nombre completo.": [ "It is the name shown on the site. Do not use your full name.", "É o nome que aparece no site. Não use seu nome completo." ], "Escribinos a": [ "Write to us at", "Escreva para" ], "Escribí el email de tu cuenta y te mandamos un link para crear una nueva.": [ "Enter your account email and we will send you a link to create a new one.", "Digite o e-mail da sua conta e enviamos um link para criar uma nova." ], "Esperando tu transferencia": [ "Waiting for your transfer", "Aguardando sua transferência" ], "Estado": [ "Status", "Status" ], "Estado de tu perfil": [ "Your profile status", "Status do seu perfil" ], "Estamos revisando tu perfil y tu verificación. Te avisamos por email.": [ "We are reviewing your profile and your verification. We will let you know by email.", "Estamos revisando seu perfil e sua verificação. Avisamos por e-mail." ], "Estás en Bronce, gratis.": [ "You are on Bronze, free.", "Você está no Bronze, grátis." ], "Estás en Bronce, gratis. Con un plan más alto aparecés más arriba y podés subir más fotos e historias.": [ "You are on Bronze, free. With a higher plan you appear higher up and can upload more photos and stories.", "Você está no Bronze, grátis. Com um plano mais alto você aparece mais acima e pode enviar mais fotos e stories." ], "Fecha de nacimiento": [ "Date of birth", "Data de nascimento" ], "Foto borrada.": [ "Photo deleted.", "Foto apagada." ], "Fotos reales, con la cara visible y en lugares públicos. Sin desnudos.": [ "Real photos, with your face visible and in public places. No nudity.", "Fotos reais, com o rosto visível e em lugares públicos. Sem nudez." ], "Fotos subidas.": [ "Photos uploaded.", "Fotos enviadas." ], "Frente del documento": [ "Front of your ID", "Frente do documento" ], "Gracias. Recibimos tu reporte.": [ "Thank you. We received your report.", "Obrigado. Recebemos sua denúncia." ], "Guardado.": [ "Saved.", "Salvo." ], "Guardar contraseña": [ "Save password", "Salvar senha" ], "Género": [ "Gender", "Gênero" ], "Hasta {n} fotos": [ "Up to {n} photos", "Até {n} fotos" ], "Historia borrada.": [ "Story deleted.", "Story apagado." ], "Historia publicada por 24 horas.": [ "Story posted for 24 hours.", "Story publicado por 24 horas." ], "Historias ilimitadas con tu plan": [ "Unlimited stories with your plan", "Stories ilimitados com seu plano" ], "Imágenes sin consentimiento": [ "Images without consent", "Imagens sem consentimento" ], "Ingresar": [ "Log in", "Entrar" ], "Ingresá": [ "Log in", "Entre" ], "La contraseña tiene que tener al menos 10 caracteres.": [ "The password must be at least 10 characters long.", "A senha precisa ter pelo menos 10 caracteres." ], "Las dos contraseñas no coinciden.": [ "The two passwords do not match.", "As duas senhas não coincidem." ], "Las salidas se cancelan con quien las acordaste, por WhatsApp y con tiempo. Los planes de las acompañantes se pagan por mes o por semana y no se renuevan solos.": [ "Outings are canceled with the person you arranged them with, on WhatsApp and in advance. Companion plans are paid by month or by week and do not renew automatically.", "Os passeios são cancelados com quem você combinou, pelo WhatsApp e com antecedência. Os planos das acompanhantes são pagos por mês ou por semana e não se renovam sozinhos." ], "Link incompleto": [ "Incomplete link", "Link incompleto" ], "Listo, avisamos que transferiste. Te confirmamos por email.": [ "Done, we noted your transfer. We will confirm by email.", "Pronto, avisamos que você transferiu. Confirmamos por e-mail." ], "Listo, confirmaste tu email.": [ "Done, your email is confirmed.", "Pronto, você confirmou seu e-mail." ], "Listo, tu perfil está en revisión.": [ "Done, your profile is under review.", "Pronto, seu perfil está em revisão." ], "Listo, ya podés entrar con tu contraseña nueva.": [ "Done, you can now log in with your new password.", "Pronto, você já pode entrar com sua nova senha." ], "Llegaste al límite de tu plan": [ "You reached your plan limit", "Você atingiu o limite do seu plano" ], "Lo hago después": [ "I will do it later", "Faço depois" ], "Lo que ves acá es lo que se publica. Tu email, tu documento y tu fecha de nacimiento no se muestran.": [ "What you see here is what gets published. Your email, your ID and your date of birth are never shown.", "O que você vê aqui é o que é publicado. Seu e-mail, seu documento e sua data de nascimento não aparecem." ], "Lo revisamos a mano para confirmar que sos vos y que sos mayor de 18. La selfie y el documento nunca se publican ni se comparten.": [ "We review it by hand to confirm it is you and that you are over 18. The selfie and the ID are never published or shared.", "Revisamos manualmente para confirmar que é você e que você é maior de 18. A selfie e o documento nunca são publicados nem compartilhados." ], "Lo sacás del sitio cuando quieras, sin perder nada.": [ "Take it off the site whenever you want, without losing anything.", "Tire do site quando quiser, sem perder nada." ], "Los cambios se ven en el sitio apenas guardás (si tu perfil está publicado).": [ "Changes show on the site as soon as you save (if your profile is published).", "As mudanças aparecem no site assim que você salva (se seu perfil estiver publicado)." ], "Los datos para transferir te llegan por email.": [ "You will receive the transfer details by email.", "Os dados para transferência chegam por e-mail." ], "Lugar fijo arriba del inicio en tu provincia. Solo 10 por provincia.": [ "Fixed spot at the top of the home page in your province. Only 10 per province.", "Lugar fixo no topo do início na sua província. Só 10 por província." ], "Mandar de nuevo": [ "Send again", "Enviar de novo" ], "Mandar verificación": [ "Send verification", "Enviar verificação" ], "Mandarme el link": [ "Send me the link", "Me enviar o link" ], "Mandá una selfie y tu documento: los revisamos y nunca se publican.": [ "Send a selfie and your ID: we review them and they are never published.", "Envie uma selfie e seu documento: revisamos e nunca são publicados." ], "Mover antes": [ "Move earlier", "Mover para antes" ], "Mover después": [ "Move later", "Mover para depois" ], "Más arriba en el inicio, más fotos e historias ilimitadas.": [ "Higher on the home page, more photos and unlimited stories.", "Mais acima no início, mais fotos e stories ilimitados." ], "Más fotos y hasta 3 historias por día.": [ "More photos and up to 3 stories per day.", "Mais fotos e até 3 stories por dia." ], "No hay conexión. Revisá internet y probá de nuevo.": [ "No connection. Check your internet and try again.", "Sem conexão. Verifique a internet e tente de novo." ], "No quedan lugares Star en tu provincia.": [ "No Star spots left in your province.", "Não há mais vagas Star na sua província." ], "No tenés historias activas.": [ "You have no active stories.", "Você não tem stories ativos." ], "Nombre artístico": [ "Stage name", "Nome artístico" ], "Nota": [ "Note", "Nota" ], "Ocultar mi perfil": [ "Hide my profile", "Ocultar meu perfil" ], "Pagás por transferencia. Cuando la confirmamos, el plan se activa. Una semana de un plan más alto te sube 7 días y después volvés solo a tu plan.": [ "You pay by bank transfer. Once we confirm it, the plan is activated. A week of a higher plan moves you up for 7 days and then you go back to your plan automatically.", "Você paga por transferência. Quando confirmamos, o plano é ativado. Uma semana de um plano mais alto te sobe por 7 dias e depois você volta sozinha ao seu plano." ], "Para mirar perfiles y escribir por WhatsApp no hace falta cuenta.": [ "You do not need an account to browse profiles and write on WhatsApp.", "Não é preciso conta para ver perfis e escrever pelo WhatsApp." ], "Para publicar te falta": [ "To publish you still need", "Para publicar falta" ], "Pausado": [ "Paused", "Pausado" ], "Pedido cancelado.": [ "Order canceled.", "Pedido cancelado." ], "Pedido en curso": [ "Order in progress", "Pedido em andamento" ], "Pedir": [ "Order", "Pedir" ], "Pedir 1 mes · {x}": [ "Order 1 month · {x}", "Pedir 1 mês · {x}" ], "1 semana · {x}": [ "1 week · {x}", "1 semana · {x}" ], "Subí a {x} por 7 días · {x}": [ "Upgrade to {x} for 7 days · {x}", "Suba para {x} por 7 dias · {x}" ], "Perfil falso, engaño u otro": [ "Fake profile, scam or other", "Perfil falso, golpe ou outro" ], "Podés elegir hasta 6 intereses.": [ "You can choose up to 6 interests.", "Você pode escolher até 6 interesses." ], "Podés pedir un link nuevo desde tu panel.": [ "You can request a new link from your dashboard.", "Você pode pedir um novo link no seu painel." ], "Política de contenido": [ "Content policy", "Política de conteúdo" ], "Política de privacidad": [ "Privacy policy", "Política de privacidade" ], "Poné esta referencia en la transferencia": [ "Put this reference in the transfer", "Coloque esta referência na transferência" ], "Posible menor de edad": [ "Possible minor", "Possível menor de idade" ], "Posible trata o explotación": [ "Possible trafficking or exploitation", "Possível tráfico ou exploração" ], "Provincia": [ "Province", "Província" ], "Publicado": [ "Published", "Publicado" ], "Publicá tu perfil": [ "Publish your profile", "Publique seu perfil" ], "Rechazado": [ "Rejected", "Rejeitado" ], "Recibimos tu verificación.": [ "We received your verification.", "Recebemos sua verificação." ], "Recibimos tu verificación. Te avisamos por email cuando la revisemos. Si te equivocaste de archivo, podés mandarla de nuevo.": [ "We received your verification. We will email you when we review it. If you sent the wrong file, you can send it again.", "Recebemos sua verificação. Avisamos por e-mail quando revisarmos. Se você errou o arquivo, pode enviar de novo." ], "Recuperar contraseña": [ "Recover password", "Recuperar senha" ], "Reenviar": [ "Resend", "Reenviar" ], "Referencia": [ "Reference", "Referência" ], "Repetila": [ "Repeat it", "Repita" ], "Revisá el motivo, corregí lo necesario y volvé a enviarlo.": [ "Check the reason, fix what is needed and send it again.", "Veja o motivo, corrija o necessário e envie de novo." ], "Salidas que te gustan": [ "Outings you like", "Passeios de que você gosta" ], "Se publica solo tu edad.": [ "Only your age is published.", "Só sua idade é publicada." ], "Selfie con el documento": [ "Selfie with your ID", "Selfie com o documento" ], "Separalos con comas.": [ "Separate them with commas.", "Separe com vírgulas." ], "Si hay una cuenta con ese email, te mandamos un link para crear una contraseña nueva. Revisá también la carpeta de spam.": [ "If there is an account with that email, we sent you a link to create a new password. Also check your spam folder.", "Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha. Verifique também a pasta de spam." ], "Si querés, adjuntá el comprobante. Así lo confirmamos más rápido.": [ "If you want, attach the receipt. That way we confirm it faster.", "Se quiser, anexe o comprovante. Assim confirmamos mais rápido." ], "Sin confirmar": [ "Not confirmed", "Não confirmado" ], "Sin enviar": [ "Not sent", "Não enviada" ], "Sobre vos": [ "About you", "Sobre você" ], "Sobre vos en inglés": [ "About you in English", "Sobre você em inglês" ], "Solo para acompañantes mayores de 18. Con el plan Bronce publicás gratis.": [ "Only for companions over 18. With the Bronze plan you publish for free.", "Só para acompanhantes maiores de 18. Com o plano Bronze você publica grátis." ], "Soy mayor de 18 años.": [ "I am over 18 years old.", "Sou maior de 18 anos." ], "Subiendo {n} de {n}…": [ "Uploading {n} of {n}…", "Enviando {n} de {n}…" ], "Suspendido": [ "Suspended", "Suspenso" ], "Tarifa desde (USD por hora)": [ "Rate from (USD per hour)", "Tarifa a partir de (USD por hora)" ], "Te mandamos el email de nuevo.": [ "We sent the email again.", "Enviamos o e-mail de novo." ], "Te mandamos un link para confirmarlo. No se publica.": [ "We will send you a link to confirm it. It is not published.", "Enviamos um link para confirmá-lo. Não é publicado." ], "Tenés que aceptar los Términos y las políticas.": [ "You must accept the Terms and policies.", "Você precisa aceitar os Termos e as políticas." ], "Tenés que confirmar que sos mayor de 18 años.": [ "You must confirm that you are over 18.", "Você precisa confirmar que é maior de 18 anos." ], "Texto": [ "Text", "Texto" ], "Titular": [ "Headline", "Título" ], "Todavía no subiste fotos": [ "You have not uploaded photos yet", "Você ainda não enviou fotos" ], "Transferencia informada": [ "Transfer reported", "Transferência informada" ], "Transferí desde la cuenta de…": [ "I transferred from the account of…", "Transferi da conta de…" ], "Transferí para activar tu plan": [ "Transfer to activate your plan", "Transfira para ativar seu plano" ], "Tu email": [ "Your email", "Seu e-mail" ], "Tu identidad está verificada.": [ "Your identity is verified.", "Sua identidade está verificada." ], "Tu perfil está completo.": [ "Your profile is complete.", "Seu perfil está completo." ], "Tu perfil está oculto.": [ "Your profile is hidden.", "Seu perfil está oculto." ], "Tu perfil está oculto: nadie lo ve en el sitio.": [ "Your profile is hidden: nobody sees it on the site.", "Seu perfil está oculto: ninguém o vê no site." ], "Tu perfil fue suspendido. Escribinos a contacto@sexyrose.net.": [ "Your profile was suspended. Write to us at contacto@sexyrose.net.", "Seu perfil foi suspenso. Escreva para contacto@sexyrose.net." ], "Tu perfil no se ve en el sitio por ahora.": [ "Your profile is not shown on the site for now.", "Seu perfil não aparece no site por enquanto." ], "Tu perfil se ve de nuevo.": [ "Your profile is visible again.", "Seu perfil aparece de novo." ], "Tu perfil se ve en el sitio.": [ "Your profile is shown on the site.", "Seu perfil aparece no site." ], "Tus fotos": [ "Your photos", "Suas fotos" ], "Tus historias": [ "Your stories", "Seus stories" ], "Tus historias se ven en el sitio cuando tu perfil esté publicado.": [ "Your stories show on the site once your profile is published.", "Seus stories aparecem no site quando seu perfil estiver publicado." ], "Tus pedidos": [ "Your orders", "Seus pedidos" ], "Una foto del frente de tu documento (DNI o pasaporte), que se lean el nombre y la fecha de nacimiento.": [ "A photo of the front of your ID (national ID or passport), with the name and date of birth readable.", "Uma foto da frente do seu documento (RG ou passaporte), com o nome e a data de nascimento legíveis." ], "Una selfie sosteniendo tu documento al lado de la cara, con buena luz.": [ "A selfie holding your ID next to your face, in good light.", "Uma selfie segurando seu documento ao lado do rosto, com boa luz." ], "Ver mi perfil": [ "View my profile", "Ver meu perfil" ], "Verificación: {x}": [ "Verification: {x}", "Verificação: {x}" ], "Vigente hasta el {x}.": [ "Valid until {x}.", "Válido até {x}." ], "Volver a ingresar": [ "Back to log in", "Voltar para entrar" ], "WhatsApp se abre con un mensaje de presentación que podés editar antes de enviar.": [ "WhatsApp opens with an introduction message you can edit before sending.", "O WhatsApp abre com uma mensagem de apresentação que você pode editar antes de enviar." ], "Ya fue verificada con tu documento.": [ "Already verified with your ID.", "Já foi verificada com seu documento." ], "Ya transferí": [ "I already paid", "Já transferi" ], "Enviar a revisión": [ "Send for review", "Enviar para revisão" ], "Enviar verificación": [ "Send verification", "Enviar verificação" ], "Subir fotos": [ "Upload photos", "Enviar fotos" ], "¿Olvidaste tu contraseña?": [ "Forgot your password?", "Esqueceu sua senha?" ], "¿Todavía no publicaste?": [ "Not published yet?", "Ainda não publicou?" ], "Dónde": [ "Where", "Onde" ], "Quedan {n} de {n} lugares en tu provincia.": [ "{n} of {n} spots left in your province.", "Restam {n} de {n} vagas na sua província." ], "Te quedan {n} hoy": [ "{n} left today", "Restam {n} hoje" ], "Pedir {x}": [ "Order {x}", "Pedir {x}" ], "¿Querés borrar esta foto? No se puede deshacer.": [ "Delete this photo? This cannot be undone.", "Apagar esta foto? Não dá para desfazer." ], "¿Querés cancelar este pedido? Si ya transferiste, no lo canceles: tocá \"Ya transferí\".": [ "Cancel this order? If you already transferred, do not cancel it: tap \"I already paid\".", "Cancelar este pedido? Se você já transferiu, não cancele: toque em \"Já transferi\"." ], "Mínimo {n}, hasta {n} con tu plan. La primera es la principal (la del swipe y las historias). Les agregamos la marca de agua de SexyRose y les sacamos los datos de ubicación.": [ "At least {n}, up to {n} with your plan. The first one is the main photo (used in swipe and stories). We add the SexyRose watermark and remove location data.", "Mínimo {n}, até {n} com seu plano. A primeira é a principal (a do swipe e dos stories). Adicionamos a marca d’água da SexyRose e removemos os dados de localização." ], "(hasta 6)": [ "(up to 6)", "(até 6)" ], "En inglés": [ "In English", "Em inglês" ], "Agregá tu WhatsApp o tu usuario de Telegram.": [ "Add your WhatsApp or your Telegram username.", "Adicione seu WhatsApp ou seu usuário do Telegram." ], "Confirmá tu email (te mandamos un link).": [ "Confirm your email (we sent you a link).", "Confirme seu e-mail (enviamos um link)." ], "Elegí tu provincia y tu ciudad.": [ "Choose your province and your city.", "Escolha sua província e sua cidade." ], "Enviá tu verificación de identidad (selfie y documento).": [ "Send your identity verification (selfie and ID).", "Envie sua verificação de identidade (selfie e documento)." ], "Subí al menos 3 fotos (tenés {n}).": [ "Upload at least 3 photos (you have {n}).", "Envie pelo menos 3 fotos (você tem {n})." ], "Completá tu nombre artístico.": [ "Fill in your stage name.", "Preencha seu nome artístico." ], "Elegí tu género.": [ "Choose your gender.", "Escolha seu gênero." ], "Cargá tu fecha de nacimiento.": [ "Enter your date of birth.", "Informe sua data de nascimento." ], ", la": [ ", the", ", a" ], "y la": [ "and the", "e a" ], "Provincia de {x}": [ "Province of {x}", "Província de {x}" ], "tu_usuario": [ "your_username", "seu_usuario" ], "Cafés de especialidad, museos y charlas largas": [ "Specialty coffee, museums and long talks", "Cafés especiais, museus e longas conversas" ], "Acepto que SexyRose trate mi documento y mi selfie solo para verificar mi identidad. Se borran a los 3 meses.": [ "I agree that SexyRose may process my ID and my selfie only to verify my identity. They are deleted after 3 months.", "Aceito que a SexyRose trate meu documento e minha selfie só para verificar minha identidade. Eles são apagados após 3 meses." ], "Tenés que aceptar el uso de tu documento y tu selfie para verificar tu identidad.": [ "You must agree to the use of your ID and your selfie to verify your identity.", "Você precisa aceitar o uso do seu documento e da sua selfie para verificar sua identidade." ] });
  /* ---------- En el navegador solo preferencias de la interfaz ---------- */
  const UI_KEY = 'sr_ui';
  HH.save = function () { try { localStorage.setItem(UI_KEY, JSON.stringify(HH.ui || {})); } catch (e) { /* sin almacenamiento */ } };
  HH.load = function () { return false; };
  try { const u = JSON.parse(localStorage.getItem(UI_KEY) || 'null'); if (u && typeof u === 'object') HH.ui = Object.assign(HH.ui, u); } catch (e) { /* */ }
  // Fotos reales (servidor local /media o CDN): ya vienen con marca de agua
  HH.isImgSrc = (x) => typeof x === 'string' && (/^(https?:|data:|blob:)/.test(x) || x.startsWith('/media/'));
  // Funciones fuera del lanzamiento
  const FUERA = new Set(['chat', 'premium_content', 'packs', 'requests', 'bookings', 'shorts', 'trips', 'stats']);
  const planFeat0 = HH.planFeat;
  HH.planFeat = (workerId, key) => (FUERA.has(key) ? false : planFeat0(workerId, key));
  // Sin chat en vivo en la web: chat.js no entra en este build; estas funciones quedan apagadas por si algún módulo las consulta
  HH.chatEnabledFor = () => false;
  HH.chatAvailable = () => false;
  HH.chatSessionOf = () => null;
  HH.hasChatAccess = () => false;
  HH.chatStatus = () => '';
  HH.chatFrom = () => 0;
  HH.buyChat = () => {};
  HH.canTakeBookings = () => false;
  // Historias destacadas (como Instagram): las sube la acompañante desde su panel (Historias → Destacadas) y el
  // servidor manda en /api/sitio/estado solo las que entran en su plan, con sus fotos y videos (perfiles[].destacadas).
  // Acá se usa el visual de highlights.js: fila de círculos debajo de la cabecera del perfil y el visor de historias.
  // Sin "+ Nueva" ni edición desde el perfil (eso va en el panel). No vencen ni se marcan como vistas.
  const hlRow0 = HH.highlightsRow;
  HH.highlightItems = (h) => (h && h.items) || [];
  // Portada: el primer elemento; si es un video, su portada como foto (no se carga el video en el círculo)
  HH.highlightCover = (h) => { const c = HH.highlightItems(h)[0]; return c ? (c.video ? { id: c.id, src: c.poster, hue: c.hue } : c) : null; };
  HH.highlightsOf = (workerId) => HH.highlights().filter((h) => h.workerId === workerId && HH.highlightItems(h).length);
  HH.visibleHighlights = HH.highlightsOf;
  HH.highlightsRow = (p) => (hlRow0 && p ? hlRow0(p, false) : '');
  HH.openHighlight = (id) => {
    const h = HH.highlights().find((x) => x.id === id); if (!h) return;
    HH.openStories(h.workerId, 0, null, { items: HH.highlightItems(h), title: h.title });
  };
  // Descripciones de los planes sin funciones que todavía no existen (chat, estadísticas, venta de contenido)
  const DESC = { E: 'Tu perfil publicado y verificado, gratis.', D: 'Más fotos, hasta 3 historias por día y el clip de 5 segundos en tu tarjeta.', C: 'Más arriba en el inicio, tarjetas más grandes, fotos e historias casi sin límite.', S: 'Lugar fijo arriba del inicio en tu provincia. Solo 10 por provincia.' };
  // Los 4 planes v2 (solo en el sitio: la demo sigue con sus 6). Precios en créditos (1 crédito = USD 1); el servidor
  // los manda en /api/sitio/estado y en /api/cuenta/planes, estos son los de arranque.
  const PLANES_V2 = {
    S: { price_usd: 350, rank: 4, photos: 1000, videos: 500, stories_per_day: null, highlights: null },
    C: { price_usd: 90, rank: 3, photos: 500, videos: 200, stories_per_day: null, highlights: 5 },
    D: { price_usd: 35, rank: 2, photos: 30, videos: 10, stories_per_day: 3, highlights: 2 },
    E: { price_usd: 0, rank: 1, photos: 8, videos: 2, stories_per_day: 1, highlights: 1 },
  };
  // HH.seed (datos de la demo) usa Platino y Diamante: la forma vacía de HH.db se toma antes de sacarlos
  const SEED0 = HH.seed();
  delete HH.LEVELS.A; delete HH.LEVELS.B;
  Object.keys(PLANES_V2).forEach((k) => { Object.assign(HH.LEVELS[k], PLANES_V2[k], { desc: DESC[k] }); });
  HH.PLAN_ORDER = ['S', 'C', 'D', 'E'];
  const publishedProfiles0 = () => ((HH.db && HH.db.profiles) || []).filter((p) => p.status === 'active' && !p.hidden && HH.levelOf(p.userId));

  /* ---------- Rendimiento: diccionario inglés/portugués aparte ----------
     El build del sitio saca i18n-dict.js del JS principal (un tercio del peso) y lo deja en /assets/i18n.<hash>.js.
     Se baja solo si se navega en inglés o portugués. Mientras no llegó, HH.t devuelve el texto en español
     (así el índice de traducciones de i18n.js no se arma vacío) y al llegar se traduce la página. */
  const DICT_SRC = window.HH_I18N_SRC;
  let dictListo = !DICT_SRC || !!HH.I18N_BASE, dictProm = null;
  const cargarDict = () => {
    if (dictListo) return Promise.resolve();
    return (dictProm ||= new Promise((ok) => {
      const s = document.createElement('script'); s.src = DICT_SRC; s.async = true;
      s.onload = () => { dictListo = true; ok(); if (!HH.db) gateTemprano(HH.currentHash()); };
      s.onerror = () => { dictProm = null; ok(); };  // sin diccionario queda en español; se reintenta al cambiar de idioma
      document.head.appendChild(s);
    }));
  };
  HH.cargarDict = cargarDict;
  // Mismo traductor que i18n.js, pero con su índice armado recién cuando llegó el diccionario (el de i18n.js ya se
  // armó al arrancar, con el diccionario todavía sin bajar).
  const traducir = (function () {
    const IDX = { en: 0, pt: 1 };
    let exact = null, patterns = null;
    const clean = (t) => t.replace(/\s+/g, ' ').trim();
    function build() {
      const D = HH.I18N || {}; exact = new Map(); patterns = [];
      Object.keys(D).forEach(k => {
        const v = D[k];
        if (/\{[a-z]\}/.test(k)) {
          // {n} = número, {x} = cualquier texto (un nombre, una ciudad)
          const names = []; const re = new RegExp('^' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{([a-z])\\\}/g, (m, c) => { names.push(c); return c === 'n' ? '([\\d.,]+)' : '(.+?)'; }) + '$');
          // Un patrón tiene que tener texto propio suficiente; si no, se "comería" frases cualquiera ("{x} de {x}")
          const own = k.replace(/\{[a-z]\}/g, '').replace(/[^a-záéíóúüñ]/gi, '');
          if (own.length < 4 && !/^\{n\}/.test(k)) return;
          if (/^\{x\}[^a-záéíóúñ]*$/i.test(k) || /^\{x\} \S{1,3} \{x\}$/.test(k)) return;
          patterns.push({ re, names, v, k });
        } else exact.set(k, v);
      });
      // los patrones más largos primero (más específicos)
      patterns.sort((a, b) => b.k.length - a.k.length);
    }
    return function (text, lang) {
      const l = lang || HH.lang; if (l === 'es' || text == null) return text;
      if (!exact) build();
      const src = clean(String(text)); if (!src || !/[a-záéíóúñ]/i.test(src)) return text;
      const i = IDX[l]; const hit = exact.get(src);
      if (hit && hit[i]) return hit[i];
      for (const p of patterns) {
        const m = src.match(p.re); if (!m || !p.v[i]) continue;
        // {x} es un nombre, una fecha o una ciudad: corto y sin frases largas
        if (p.names.some((c, j) => c === 'x' && (m[j + 1].length > 40 || m[j + 1].split(' ').length > 6))) continue;
        let out = p.v[i]; p.names.forEach((c, j) => { out = out.replace('{' + c + '}', m[j + 1]); });
        return out;
      }
      if (HH._i18nMiss) HH._i18nMiss.add(src);
      return text;
    };
  })();
  const t0 = HH.t;
  HH.t = function (text, lang) {
    if ((lang || HH.lang) === 'es' || text == null) return text;
    if (!DICT_SRC) return t0.apply(this, arguments);
    return dictListo ? traducir(text, lang) : text;
  };
  const setLang0 = HH.setLang;
  HH.setLang = function () {
    const r = setLang0.apply(this, arguments);
    if (HH.lang !== 'es' && !dictListo) cargarDict().then(() => { if (dictListo && HH.lang !== 'es') { HH.renderShell(); HH.refresh ? HH.refresh() : HH.render(); } });
    return r;
  };

  /* ---------- Rendimiento: consultas de negocio memorizadas ----------
     Las vistas del MVP llaman miles de veces a levelOf/isStar/rankedProfiles (cada una recorre todas las
     suscripciones y Stars): con 200 perfiles el inicio tardaba segundos. Los datos del sitio cambian solo al
     recargar /api/sitio/estado (HH.db nuevo), así que se calculan una vez por HH.db y por minuto (vencimientos). */
  let memo = null;
  const M = () => {
    const min = Math.floor(Date.now() / 60000);
    if (memo && memo.db === HH.db && memo.min === min) return memo;
    memo = { db: HH.db, min, subs: null, stars: null, starSet: null, levels: new Map(), pub: null, ranked: new Map(),
      byId: null, byName: null, contains: new Map(), trips: new Map(), place: new Map() };
    return memo;
  };
  // Ubicaciones por id y por nombre (las páginas de lugares y los enlaces del pie las consultan miles de veces)
  const locIdx = (c) => {
    if (!c.byId) { c.byId = new Map(); c.byName = new Map(); ((HH.db && HH.db.locations) || []).forEach((l) => { if (!c.byId.has(l.id)) c.byId.set(l.id, l); if (!c.byName.has(l.name)) c.byName.set(l.name, l); }); }
    return c;
  };
  HH.locById = (id) => (HH.db ? locIdx(M()).byId.get(id) || null : null);
  HH.locByName = (name) => (HH.db ? locIdx(M()).byName.get(name) || null : null);
  const placeContains0 = HH.placeContains;
  HH.placeContains = function (placeName, cityName) {
    if (!placeName) return true; if (!cityName) return false; if (placeName === cityName) return true;
    const c = M(); const k = placeName + '\u0000' + cityName;
    let v = c.contains.get(k); if (v === undefined) { v = placeContains0(placeName, cityName); c.contains.set(k, v); }
    return v;
  };
  const upcomingTrip0 = HH.upcomingTrip;
  HH.upcomingTrip = (p) => {
    if (!p || !p.trips || !p.trips.length) return null;
    const c = M(); if (c.trips.has(p)) return c.trips.get(p);
    const t = upcomingTrip0(p); c.trips.set(p, t); return t;
  };
  if (HH.placeProfiles) {
    const placeProfiles0 = HH.placeProfiles;
    HH.placeProfiles = (loc, actId, g) => {
      if (!loc) return placeProfiles0(loc, actId, g);
      const c = M(); const k = [loc.id || loc.name, actId || '', g || '', HH.genderSet ? [...HH.genderSet()].sort().join(',') : ''].join('|');
      if (!c.place.has(k)) c.place.set(k, placeProfiles0(loc, actId, g));
      return c.place.get(k).slice();
    };
  }
  const activeSubscription0 = HH.activeSubscription, activeStars0 = HH.activeStars;
  HH.activeSubscription = (id) => {
    const c = M(); if (!HH.db) return activeSubscription0(id);
    if (!c.subs) { c.subs = new Map(); const now = new Date(); (HH.db.subscriptions || []).forEach((x) => { if (x.status === 'active' && new Date(x.expiresAt) > now && !c.subs.has(x.userId)) c.subs.set(x.userId, x); }); }
    return c.subs.get(id) || null;
  };
  HH.activeStars = () => { const c = M(); if (!HH.db) return activeStars0(); if (!c.stars) c.stars = activeStars0(); return c.stars; };
  HH.isStar = (id) => { const c = M(); if (!c.starSet) c.starSet = new Set(HH.activeStars().map((x) => x.workerId)); return c.starSet.has(id); };
  const levelOf0 = HH.levelOf;
  HH.levelOf = (id) => { const c = M(); if (c.levels.has(id)) return c.levels.get(id); const l = levelOf0(id); c.levels.set(id, l); return l; };
  HH.publishedProfiles = () => { const c = M(); if (!c.pub) c.pub = publishedProfiles0(); return c.pub.slice(); };
  // Destacado (planes v2): dentro de cada plan, las destacadas van primero y entre ellas el orden rota en cada visita
  // (semilla nueva por carga de página). Star no se destaca: ya tiene su lugar fijo arriba.
  const ROTA = Math.floor(Math.random() * 1e9).toString(36);
  // Hash con mezcla (prod-shorts.js, HH.hashMezcla): con el hash ×31 de siempre, cambiar la semilla solo sumaba la misma
  // constante a todas y el orden de las destacadas casi no cambiaba entre visitas.
  const rota = (id) => (HH.hashMezcla ? HH.hashMezcla(id + ROTA) : hash(id + ROTA));
  const esDest = (p) => !!(p && p.destacado) && HH.levelOf(p.userId) !== 'S';
  HH.spEsDestacado = esDest;
  HH.rankList = function (list) {
    const sc = new Map();
    const score = (p) => {
      let v = sc.get(p);
      if (v === undefined) {
        const base = (HH.LEVELS[HH.levelOf(p.userId)] || { rank: 0 }).rank * 100;
        v = esDest(p) ? base + 50 + (rota(p.userId) % 1000) / 40 : base + (p.verified === 'verified' ? 10 : 0) + ((p.stats && p.stats.views) || 0) / 1000;
        sc.set(p, v);
      }
      return v;
    };
    return list.slice().sort((a, b) => score(b) - score(a));
  };
  // Con ubicación del navegador el inicio ordena por distancia: las destacadas de la provincia de quien mira van primero
  // (las grillas del inicio separan por plan, así que quedan primeras dentro de su plan). "Cerca" sigue por distancia pura.
  const byDistance0 = HH.byDistance;
  HH.byDistance = (list) => {
    const out = byDistance0(list); if (!HH.geo || !HH.geo() || (HH.current && HH.current.name !== 'inicio')) return out;
    const reg = HH.viewerRegion ? HH.viewerRegion() : '';
    const aca = (p) => esDest(p) && (!reg || HH.inCity(p, reg));
    return out.filter(aca).sort((a, b) => rota(a.userId) - rota(b.userId)).concat(out.filter((p) => !aca(p)));
  };
  const rankedProfiles0 = HH.rankedProfiles;
  HH.rankedProfiles = () => {
    const c = M(); const k = HH.genderSet ? [...HH.genderSet()].sort().join(',') : '';
    if (!c.ranked.has(k)) c.ranked.set(k, rankedProfiles0());
    return c.ranked.get(k).slice();
  };
  // Fotos: las miniaturas (480 px) donde la imagen se ve chica y carga diferida fuera de la pantalla.
  // La foto completa solo en el visor, el swipe y la cabecera del perfil.
  const photo0 = HH.photo;
  HH.photo = function (profile, index = 0, opts = {}) {
    const raw = (profile && profile.photos || [])[index];
    if (!HH.isImgSrc(raw)) return photo0.apply(this, arguments);
    const cls = String(opts.cls || '');
    const chica = /\b(square|sm)\b/.test(cls) || opts.mini;
    const mini = (profile.photosMini || [])[index];
    const src = chica && mini ? mini : raw;
    // El swipe (fit) es lo primero que se ve: carga con prioridad; el resto, diferida.
    const lazy = opts.eager || opts.fit ? ' fetchpriority="high"' : ' loading="lazy"';
    const bg = opts.fit ? `<img class="ph-bg" src="${HH.esc(mini || raw)}" alt="" aria-hidden="true"${lazy} decoding="async">` : '';
    return `<div class="media ${cls}${opts.fit ? ' fit' : ''}${opts.noWm ? '' : ' wm'}" style="${opts.style || ''}">${bg}<img src="${HH.esc(src)}" alt="${HH.esc(profile.displayName || '')}"${lazy} decoding="async">${opts.children || ''}</div>`;
  };

  /* ---------- Videos (bunny.net): portada en las miniaturas, video solo en el visor ---------- */
  HH.videoMedia = function (v, opts = {}) {
    if (!v || !v.src) return `<div class="ph" style="background:${HH.hueGradient((v && v.hue) || 300, true)}">${HH.icon('video')}</div>`;
    const poster = v.poster ? HH.esc(v.poster) : '';
    if (!opts.controls) return poster ? `<img src="${poster}" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">` : `<video src="${HH.esc(v.src)}" muted playsinline preload="metadata" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video>`;
    return `<video src="${HH.esc(v.src)}"${poster ? ` poster="${poster}"` : ''} controls playsinline preload="metadata" controlslist="nodownload" disablepictureinpicture style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000"></video>`;
  };

  /* ---------- API ---------- */
  const err = (message, status, data) => Object.assign(new Error(message), { status, data });
  async function api(method, path, body, cacheMode) {
    const opt = { method, credentials: 'same-origin', cache: cacheMode || 'no-store', headers: { Accept: 'application/json' } };
    if (method !== 'GET') { opt.headers['Content-Type'] = 'application/json'; opt.headers['X-SR'] = '1'; opt.body = JSON.stringify(body || {}); }
    let res;
    try { res = await fetch('/api' + path, opt); } catch (e) { throw err('No hay conexión. Revisá internet y probá de nuevo.', 0); }
    let data = null; try { data = await res.json(); } catch (e) { /* sin JSON */ }
    if (!res.ok) throw err((data && data.error) || (res.status === 429 ? 'Demasiados intentos. Probá de nuevo en un rato.' : res.status >= 500 ? 'Error del servidor. Probá de nuevo en unos minutos.' : 'No se pudo completar (' + res.status + ').'), res.status, data);
    return data || {};
  }
  HH.sitioApi = api;
  // Subidas con progreso (multipart)
  function upload(path, fd, onProgress) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('POST', '/api' + path); x.withCredentials = true;
      x.setRequestHeader('X-SR', '1'); x.setRequestHeader('Accept', 'application/json');
      if (x.upload && onProgress) x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      x.onload = () => { let d = null; try { d = JSON.parse(x.responseText); } catch (e) { /* */ } if (x.status >= 200 && x.status < 300) resolve(d || {}); else reject(err((d && d.error) || (x.status === 413 ? 'El archivo es demasiado grande.' : 'No se pudo subir (' + x.status + ').'), x.status, d)); };
      x.onerror = () => reject(err('No hay conexión. Revisá internet y probá de nuevo.', 0));
      x.send(fd);
    });
  }

  /* ---------- Estado ---------- */
  const S = { estado: null, estadoErr: null, yo: null, yoLoaded: false, planes: null, planesErr: null, cred: null, credErr: null, credMas: null, dest: null, destErr: null, notif: null, notifErr: null, busy: {}, forgot: false, verif: null, prov: null, up: null, upHist: null, upVid: null, upDest: null };
  const PANEL_IS = (key) => /^panel(\.|$)/.test(key);
  const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };

  function emptyDb() {
    const s = SEED0; const db = {};
    Object.keys(s).forEach((k) => { db[k] = Array.isArray(s[k]) ? [] : (s[k] && typeof s[k] === 'object' ? JSON.parse(JSON.stringify(s[k])) : s[k]); });
    return db;
  }
  const LEVEL_OF_TIPO = { pais: 'country', provincia: 'region', zona: 'zone', ciudad: 'city' };
  // estado real → forma de HH.db que usan las vistas del MVP
  function buildDb(e) {
    const db = emptyDb();
    const ubic = e.ubicaciones || [];
    db.locations = ubic.filter((u) => u.activa !== false).map((u) => ({
      id: u.id, name: u.nombre,
      level: u.tipo === 'provincia' && /^Ciudad (de|Autónoma)/i.test(u.nombre) ? 'city' : (LEVEL_OF_TIPO[u.tipo] || 'city'),
      parentId: u.padre || null, lat: u.lat == null ? null : Number(u.lat), lng: u.lng == null ? null : Number(u.lng), status: 'active', createdAt: e.ahora,
    }));
    db.activities = (e.categorias || []).filter((c) => c.activa !== false).map((c) => ({ id: c.id, label: c.nombre, icon: c.icono || 'sparkles' }));
    db.interests = (e.intereses || []).map((i) => ({ id: i.id, label: i.nombre, en: i.nombreEn || i.nombre_en || '', pt: i.nombrePt || i.nombre_pt || '' }));
    db._interestsIds = true;
    const far = new Date(Date.now() + 3650 * 864e5).toISOString();
    const byId = new Map(db.locations.map((l) => [l.id, l]));
    (e.perfiles || []).forEach((x) => {
      const cityLoc = byId.get((x.ubicacionIds || {}).ciudad) || byId.get((x.ubicacionIds || {}).provincia) || null;
      const h = hash(x.cuentaId || x.slug || '');
      const jit = (n) => ((h % (n * 2 + 1)) - n) / 1000;
      const plan = x.plan || 'E';
      db.users.push({ id: x.cuentaId, name: x.displayName, shortName: x.displayName, email: '', role: 'worker', hue: h % 360, createdAt: x.publicadoEn || x.actualizado });
      db.profiles.push({
        userId: x.cuentaId, slug: x.slug, displayName: x.displayName, age: x.edad, gender: x.genero || 'mujer', nationality: x.nacionalidad || '',
        country: x.pais || '', city: x.ciudad || x.provincia || '', homeCity: x.ciudad || x.provincia || '', zone: x.zona || '', province: x.provincia || '',
        headline: x.titular || '', bio: x.bio || '', headlineEn: x.titularEn || '', bioEn: x.bioEn || '', languages: x.idiomas || [],
        heightCm: x.alturaCm || null, build: x.contextura || null, interests: x.intereses || [], activities: x.salidas || [], rateFrom: x.tarifaDesde == null ? null : x.tarifaDesde,
        whatsapp: (x.contacto || {}).whatsapp || '', telegram: (x.contacto || {}).telegram || '', links: x.links || [],
        photos: (x.fotos || []).map((f) => f.url), photosMini: (x.fotos || []).map((f) => f.urlMini || f.url),
        previewUrl: x.preview && x.preview.url ? x.preview.url : '',
        videos: (x.videos || []).filter((v) => v && v.url).map((v) => ({ id: v.id, src: v.url, poster: v.poster || '', seconds: v.segundos == null ? null : Math.round(Number(v.segundos)), name: '', w: v.ancho, h: v.alto, createdAt: v.creado || null })),
        verified: 'verified', emailVerified: true, whatsappVerified: true, status: 'active', hidden: false, online: false,
        lat: cityLoc && cityLoc.lat != null ? cityLoc.lat + jit(9) : null, lng: cityLoc && cityLoc.lng != null ? cityLoc.lng + jit(7) : null,
        hue: h % 360, createdAt: x.publicadoEn || x.actualizado, updatedAt: x.actualizado, stats: { views: 0, rightSwipes: 0 }, chatPriceUsd: 0,
        destacado: !!x.destacado && plan !== 'S',
      });
      db.subscriptions.push({ id: 'sub_' + x.cuentaId, userId: x.cuentaId, level: plan, status: 'active', startedAt: x.publicadoEn || e.ahora, expiresAt: far, providerRef: 'sitio' });
      if (plan === 'S' || x.star) db.stars.push({ id: 'st_' + x.cuentaId, workerId: x.cuentaId, activeUntil: far, createdAt: x.publicadoEn || e.ahora });
    });
    // Historias con foto o video (video: src = MP4, poster = portada, dur = segundos)
    db.stories = (e.historias || []).map((h) => ({ id: h.id, workerId: h.cuentaId, src: h.url, caption: h.texto || '', hue: hash(h.id) % 360, views: 0, createdAt: h.creado, expiresAt: h.expira,
      ...(h.tipo === 'video' ? { video: true, poster: h.urlMini || '', dur: Number(h.segundos) || 0, w: h.ancho || 0, h: h.alto || 0 } : {}) }));
    // Destacadas: cada elemento con la forma de una historia (video: src = MP4, poster = portada, dur = segundos)
    db.highlights = [];
    (e.perfiles || []).forEach((x) => (x.destacadas || []).forEach((d) => db.highlights.push({
      id: d.id, workerId: x.cuentaId, title: d.titulo, createdAt: d.creado,
      items: (d.items || []).map((it) => ({ id: it.id, workerId: x.cuentaId, src: it.url, caption: '', hue: hash(it.id) % 360, createdAt: it.creado, expiresAt: far,
        ...(it.tipo === 'video' ? { video: true, poster: it.urlMini || '', dur: Number(it.segundos) || 0, w: it.ancho || 0, h: it.alto || 0 } : {}) })),
    })));
    const aj = e.ajustes || {};
    const pr = aj.precios && aj.precios.mes;
    if (pr) Object.keys(HH.LEVELS).forEach((k) => { if (pr[k] != null) HH.LEVELS[k].price_usd = Number(pr[k]); });
    db._ajustes = aj;
    return db;
  }
  function addSelfToDb() {
    if (!HH.db || !S.yo) return;
    const y = S.yo; const d = (y.perfil && y.perfil.datos) || {};
    if (!HH.db.users.some((u) => u.id === y.id)) HH.db.users.push({ id: y.id, name: d.displayName || 'Mi cuenta', shortName: d.displayName || 'Mi cuenta', email: y.email, role: 'worker', hue: hash(y.id) % 360, createdAt: y.creado });
    HH.session = { userId: y.id, role: 'worker', at: new Date().toISOString() };
  }
  // La primera carga usa la caché normal del navegador: así aprovecha el <link rel="preload"> de la cáscara, que pide
  // el estado en paralelo con el JS. Las siguientes (después de un cambio) revalidan con el servidor (ETag → 304).
  let estadoCargas = 0;
  async function loadEstado() {
    try { S.estado = await api('GET', '/sitio/estado', undefined, estadoCargas++ ? 'no-cache' : 'default'); S.estadoErr = null; } catch (e) { S.estadoErr = e.message; }
    const prevSession = HH.session;
    HH.db = buildDb(S.estado || {});
    HH.session = prevSession; addSelfToDb();
  }
  // Pista local de que hay sesión (la cookie es HttpOnly): evita pedir /cuenta/yo a cada visitante
  const HINT = 'sr_sesion_hint';
  const hint = (v) => { try { if (v) localStorage.setItem(HINT, '1'); else localStorage.removeItem(HINT); } catch (e) { /* */ } };
  const hasHint = () => { try { return localStorage.getItem(HINT) === '1'; } catch (e) { return true; } };
  async function loadYo(silent, force) {
    if (!force && !hasHint() && !/^(panel|cuenta)(\.|$)/.test(HH.currentHash())) { S.yo = null; S.yoLoaded = true; return; }
    try { const r = await api('GET', '/cuenta/yo'); S.yo = (r && r.cuenta) || null; } catch (e) { if (e.status === 401) S.yo = null; else if (!silent) HH.toast(e.message, { type: 'danger' }); }
    hint(!!S.yo);
    S.yoLoaded = true;
    if (S.yo) addSelfToDb(); else { HH.session = null; if (HH.db) HH.db.users = HH.db.users.filter((u) => u.role !== 'worker' || HH.db.profiles.some((p) => p.userId === u.id)); }
  }
  async function loadPlanes() {
    try { S.planes = await api('GET', '/cuenta/planes'); S.planesErr = null; } catch (e) { S.planesErr = e.message; }
  }
  HH.me = () => (HH.session && HH.db ? HH.db.users.find((u) => u.id === HH.session.userId) || null : null);
  HH.logout = async function () {
    try { await api('POST', '/cuenta/logout'); } catch (e) { /* igual se cierra */ }
    S.yo = null; S.planes = null; S.cred = null; S.dest = null; S.notif = null; HH.session = null; hint(false); await loadEstado(); HH.renderShell(); HH.go('#inicio'); HH.toast('Sesión cerrada');
  };
  HH.requireRole = function () { if (!S.yo) { HH.go('#login'); return false; } return true; };
  HH.homeFor = () => '#panel';

  /* ---------- Limpieza: nada de lo que queda fuera del lanzamiento ---------- */
  const OUT = ['[data-action="pubWaBook"]', '[data-action="pubWaChat"]', '[data-action="pubChat"]', '[data-action="pubBook"]', '[data-action="pubRequest"]', '[data-action="pubBuyPack"]', '[data-action="pubShortBuy"]', '[data-action="clientSignup"]', '[data-action="clientLogin"]', '[data-action="pubPasskeyLogin"]', '#pubContent', '.pub-shorts', '[data-go^="#chat."]', '[data-go^="#cuenta"]'];
  const FAQ_FIX = {
    '¿Cómo funciona la verificación?': 'Cada acompañante envía una selfie con su documento y una foto del documento, que revisa el equipo de SexyRose: confirmamos que es mayor de edad y que es la persona de las fotos. Solo se publican los perfiles verificados.',
    '¿Puedo cancelar?': 'Las salidas se cancelan con quien las acordaste, por WhatsApp y con tiempo. Las acompañantes pagan su plan con créditos, por mes o por semana; la renovación automática del plan mensual se apaga cuando quieran desde su panel.',
  };
  function clean(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll(OUT.join(',')).forEach((el) => el.remove());
    root.querySelectorAll('.msg-split button.btn.tg[disabled], .msg-split button.btn.wa[disabled]').forEach((el) => el.remove());
    root.querySelectorAll('a[href]').forEach((a) => { const h = a.getAttribute('href') || ''; if (/\/chat(\/|$)/.test(h) || /^#\/?chat/.test(h)) a.remove(); });
    // Galería: la pestaña Videos aparece solo si el perfil tiene videos; sin videos no hacen falta pestañas Todo/Fotos/Videos
    root.querySelectorAll('.pf-gtabs').forEach((g) => { const v = g.querySelector('[data-tab="video"]'); if (v && /\(0\)\s*$/.test(v.textContent || '')) v.remove(); if (g.querySelectorAll('[role=tab]').length <= 2) g.remove(); });
    // Preguntas frecuentes del lanzamiento
    root.querySelectorAll('details.pub-faq').forEach((d) => {
      const q = ((d.querySelector('summary') || {}).textContent || '').trim(); const p = d.querySelector('p');
      if (/cobra el contenido/i.test(q)) { d.remove(); return; }
      if (p && FAQ_FIX[q]) p.textContent = FAQ_FIX[q];
    });
    faqPropias(root);
    // Pie: links reales a las páginas legales y al contacto
    root.querySelectorAll('nav[aria-label="Legal"]').forEach((n) => {
      n.querySelectorAll('a').forEach((a) => {
        const t = (a.textContent || '').trim(); const to = { 'Términos': '/terminos', 'Privacidad': '/privacidad', 'Ayuda': 'mailto:contacto@sexyrose.net' }[t];
        if (to) { a.removeAttribute('data-go'); a.setAttribute('href', to); }
      });
      if (!n.querySelector('a[href="/denunciar"]')) { const a = document.createElement('a'); a.href = '/denunciar'; a.textContent = 'Denunciar'; const sel = n.querySelector('.lang-sel'); n.insertBefore(a, sel || null); }
    });
    root.querySelectorAll('p.small.muted').forEach((p) => { if (/reserv(á|a) el encuentro|agenda/i.test(p.textContent || '') && /WhatsApp/.test(p.textContent || '')) p.textContent = 'WhatsApp se abre con un mensaje de presentación que podés editar antes de enviar.'; });
  }
  document.addEventListener('hh:rendered', () => clean(document.getElementById('app')));

  /* ---------- Textos del inicio (Admin → Ajustes → Textos del inicio; ajustes.textos_sitio) ----------
     { es: { heroEyebrow, heroTitulo, heroSubtitulo, faqTitulo, faq: [{ pregunta, respuesta }] }, en?: {…}, pt?: {…} }
     Sin el ajuste no cambia nada (los textos de siempre). En inglés y portugués, lo que falta usa el texto en español
     (el traductor lo pasa al idioma si es el texto por defecto). */
  const textosSitio = () => { const t = S.estado && S.estado.ajustes && S.estado.ajustes.textos_sitio; return t && t.es ? t : null; };
  const textoDe = (campo) => {
    const t = textosSitio(); if (!t) return undefined;
    const l = t[HH.lang] || {};
    return l[campo] != null && l[campo] !== '' ? l[campo] : t.es[campo];
  };
  const settings0 = HH.settings;
  HH.settings = function () {
    const st = settings0.apply(this, arguments);
    if (!textosSitio()) return st;
    const eyebrow = textoDe('heroEyebrow');
    return Object.assign({}, st, { hero: Object.assign({}, HH.DEFAULT_SETTINGS.hero, st.hero || {}, { eyebrow: eyebrow || '', title: textosSitio().es.heroTitulo, subtitle: textoDe('heroSubtitulo') || '' }) });
  };
  // Título (H1): en inglés/portugués, el que cargó Juan en ese idioma; si no, el de SEO por idioma (como hasta ahora).
  const seoH10 = HH.seoH1;
  HH.seoH1 = function (def) {
    const t = textosSitio(); const l = HH.lang;
    if (t && l !== 'es' && t[l] && t[l].heroTitulo) return t[l].heroTitulo;
    return seoH10 ? seoH10.apply(this, arguments) : def;
  };
  function faqPropias(root) {
    const t = textosSitio(); if (!t) return;
    const d = root.querySelector('details.pub-faq'); if (!d) return;
    const list = d.parentElement; const sec = list.closest('section');
    const propia = t[HH.lang] && Array.isArray(t[HH.lang].faq) && t[HH.lang].faq.length ? t[HH.lang].faq : (t.es.faq || []);
    if (!propia.length) { if (sec) sec.remove(); return; }
    const h2 = sec && sec.querySelector('h2'); const tit = textoDe('faqTitulo'); if (h2 && tit) h2.textContent = tit;
    list.innerHTML = propia.map((x) => `<details class="pub-faq"><summary>${esc(x.pregunta)}${icon('chevronDown')}</summary>${String(x.respuesta).split(/\n{2,}/).map((par) => `<p>${esc(par).replace(/\n/g, '<br>')}</p>`).join('')}</details>`).join('');
  }
  const modal0 = HH.modal;
  HH.modal = function () { const r = modal0.apply(this, arguments); clean(document.getElementById('modalBox')); return r; };

  /* ---------- Shell ---------- */
  const shell0 = HH.renderShell;
  HH.renderShell = function () {
    shell0.apply(this, arguments);
    const hi = document.getElementById('headerInner'); const bn = document.getElementById('bottomNav');
    const logged = !!S.yo; const key = HH.currentHash(); const top = key.split('.')[0];
    if (hi) {
      hi.querySelectorAll('.topnav a').forEach((a) => { const g = a.getAttribute('data-go') || ''; if (/^#(admin|cuenta)/.test(g)) a.remove(); });
      const nav = hi.querySelector('.topnav');
      if (nav && logged && !nav.querySelector('[data-go="#panel"]')) nav.insertAdjacentHTML('beforeend', `<a href="#panel" data-go="#panel"${top === 'panel' ? ' class="active"' : ''}>Mi panel${noLeidas() ? `<span class="sp-hdot" aria-label="Tenés avisos sin leer"></span>` : ''}</a>`);
      const actions = hi.querySelector('.header-actions');
      if (actions && !logged) {
        actions.querySelectorAll('a[data-go="#login"]').forEach((a) => { a.textContent = 'Ingresar'; });
        actions.querySelectorAll('a[data-go="#registro"]').forEach((a) => { a.innerHTML = `<span class="hide-mobile">${icon('user')}</span>Publicá tu perfil`; });
        // Escritorio: el ícono de usuario lleva a "Tu espacio" (favoritos, ingreso y publicar), igual que en la barra del teléfono
        if (!actions.querySelector('.sp-hdr-user')) actions.insertAdjacentHTML('afterbegin', `<a class="icon-btn hide-mobile sp-hdr-user${top === 'favoritos' ? ' active' : ''}" href="#favoritos" data-go="#favoritos" aria-label="Tu espacio" title="Tu espacio">${icon('user')}</a>`);
      }
      if (['panel', 'cuenta', 'login', 'registro'].includes(top)) { const g = hi.querySelector('.hdr-genders'); if (g) g.replaceWith(Object.assign(document.createElement('span'), { className: 'hdr-spacer' })); }
    }
    if (bn) {
      // Barra inferior estilo Instagram (móvil): cápsula flotante, solo íconos, burbuja suave en la sección activa.
      // El texto queda para lectores de pantalla (aria-label/title). Con sesión, el último ícono es la foto de la acompañante.
      let ultimo;
      if (logged) {
        const p = (S.yo && S.yo.perfil) || {}; const f = (p.fotos || [])[0];
        const avatar = f ? `<span class="bn-av"><img src="${esc(f.urlMini || f.url)}" alt="" width="26" height="26" decoding="async"></span>` : `<span class="bn-av bn-av-ini">${esc(HH.initials((yoDatos() || {}).displayName || 'SR'))}</span>`;
        // Punto de aviso: el perfil necesita algo de ella (rechazado o verificación rechazada)
        ultimo = { h: '#panel', l: 'Mi panel', html: avatar, dot: p.estado === 'rechazado' || p.verificacion === 'rechazada' || !!p.pausadoPorSaldo || noLeidas() > 0 || (S.yo.pedidosNoLeidos || 0) > 0 };
      } else ultimo = { h: '#favoritos', l: 'Tu espacio', i: 'user', dot: !!(HH.spClientes && HH.spClientes.noLeidos() > 0) };
      // Shorts en lugar de Favoritos; los favoritos quedan en "Tu espacio" (el ícono de usuario)
      const items = [{ h: '#inicio', l: 'Inicio', i: 'home' }, { h: '#swipe', l: 'Swipe', i: 'heart' }, { h: '#cerca', l: 'Cerca', i: 'pin' }, { h: '#shorts', l: 'Shorts', html: HH.iconShorts ? HH.iconShorts() : icon('film') }, ultimo];
      bn.innerHTML = items.map((n) => {
        const on = ('#' + top) === n.h || (n.h === '#inicio' && !top);
        return `<a href="${n.h}" data-go="${n.h}" aria-label="${n.l}" title="${n.l}"${on ? ' class="active" aria-current="page"' : ''}>${n.html || icon(n.i)}<span class="sr-only">${n.l}</span>${n.dot ? '<i class="bn-dot" aria-hidden="true"></i>' : ''}</a>`;
      }).join('');
    }
    if (HH.linkify) { if (hi) HH.linkify(hi); if (bn) HH.linkify(bn); }
  };

  /* ---------- Rutas propias (panel, ingreso, registro, cuenta) ---------- */
  const OWN = (key) => /^(panel|login|registro|cuenta|favoritos|shorts|compra|cliente)(\.|$)/.test(key);
  const render0 = HH.render;
  HH.render = function (forcePath) {
    if (!forcePath && HH.syncLangFromUrl) HH.syncLangFromUrl();
    const key = forcePath || HH.currentHash();
    if (!HH.db) { const app = document.getElementById('app'); if (app && !app.innerHTML) app.innerHTML = `<div class="container section"><div class="sp-skel"></div><div class="sp-skel"></div></div>`; gateTemprano(key); return; }
    if (/^chat(\.|$)/.test(key)) { HH.go('#inicio', { replace: true }); return; }
    if (!OWN(key)) return render0.call(HH, forcePath);
    const parts = key.split('.');
    let out;
    try { out = ownView(parts); } catch (e) { console.error(e); out = `<div class="container section"><div class="empty">${icon('alert')}<h4>Algo falló al mostrar esta sección</h4><p class="small">${esc(e.message)}</p></div></div>`; }
    if (out === false) return;
    HH.current = { path: key, params: {}, name: parts[0] };
    const app = document.getElementById('app');
    app.innerHTML = out;
    if (HH.linkify) HH.linkify(app);
    app.classList.remove('fade-in'); void app.offsetWidth; app.classList.add('fade-in');
    if (!forcePath) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    HH.renderShell();
    document.dispatchEvent(new CustomEvent('hh:rendered', { detail: HH.current }));
    document.title = (OWN_TITLES[parts[0]] || 'Mi panel') + ' · SexyRose';
    setRobots(parts[0] === 'shorts' ? 'noindex,follow' : 'noindex,nofollow');
    if (HH.afterRender) { const f = HH.afterRender; HH.afterRender = null; try { f(); } catch (e) { console.error(e); } }
  };
  /* Ventana de +18: no va en el panel, la cuenta, el ingreso ni el registro (ahí entra la acompañante, no un visitante).
     agegate.js es compartido con la demo y ya excluye panel/cuenta; acá se cierra también en ingreso y registro.
     Este listener se registra después del de agegate.js, así que corre después de que la ventana se dibuja y no llega
     a pintarse. En cuanto el visitante pasa a una página pública, agegate.js la vuelve a mostrar. */
  const SIN_GATE = /^(panel|cuenta|login|registro|cliente)(\.|$)/;
  const cerrarGate = () => { const r = document.getElementById('agRoot'); if (r) { r.remove(); document.body.style.overflow = ''; } };
  document.addEventListener('hh:rendered', () => { if (SIN_GATE.test(HH.currentHash())) cerrarGate(); });
  // La ventana se muestra ya con la cáscara (antes de que llegue /api/sitio/estado): así su texto es lo primero que
  // se pinta y no espera a los datos (LCP). Con pista de sesión no: puede ser la acompañante entrando a su panel.
  let gateHecho = false;
  function gateTemprano(key) {
    // En inglés/portugués espera al diccionario (si no, la ventana aparecería un instante en español)
    if (gateHecho || SIN_GATE.test(key) || !HH.ageGateShow || (HH.lang !== 'es' && !dictListo)) return; gateHecho = true;
    try { if (sessionStorage.getItem('hh_age_ok') === '1' || hasHint()) return; } catch (e) { return; }
    HH.current = { path: key, params: {}, name: key.split('.')[0] };
    HH.ageGateShow();
  }
  const OWN_TITLES = { panel: 'Mi panel', login: 'Ingresar', registro: 'Publicá tu perfil', cuenta: 'Mi cuenta', favoritos: 'Tu espacio', shorts: 'Shorts', compra: 'Tu compra', cliente: 'Tu cuenta' };
  function setRobots(v) { let m = document.querySelector('meta[name="robots"]'); if (!m) { m = document.createElement('meta'); m.name = 'robots'; document.head.appendChild(m); } m.content = v; }
  const rerender = () => { if (OWN(HH.currentHash()) && !document.getElementById('modalRoot').classList.contains('open')) HH.refresh(); };

  function ownView(parts) {
    const [a, b] = parts;
    if (a === 'favoritos') return favView();
    if (a === 'shorts') return HH.spShorts ? HH.spShorts.view() : (HH.go('#inicio', { replace: true }), false);
    if (a === 'compra') return HH.spContenido ? HH.spContenido.compra(b) : (HH.go('#inicio', { replace: true }), false);
    // Cuenta del interesado (cliente): ingreso, registro, Mis compras, Mis pedidos y el chat de cada pedido (prod-clientes.js)
    if (a === 'cliente') return HH.spClientes ? HH.spClientes.view(parts.slice(1)) : (HH.go('#inicio', { replace: true }), false);
    if (a === 'login') { if (S.yo) { HH.go('#panel', { replace: true }); return false; } return loginView(); }
    if (a === 'registro') { if (S.yo) { HH.go('#panel', { replace: true }); return false; } return registroView(); }
    if (a === 'cuenta') {
      if (b === 'verificar') return verificarView();
      if (b === 'restablecer') return restablecerView();
      HH.go(S.yo ? '#panel' : '#inicio', { replace: true }); return false;
    }
    // panel
    if (!S.yoLoaded) return `<div class="container section"><div class="sp-skel"></div></div>`;
    if (!S.yo) { HH.ui.next = HH.currentHash(); HH.save(); HH.go('#login', { replace: true }); return false; }
    const tab = PANEL_TABS.some((t) => t.id === b) ? b : 'resumen';
    const views = { resumen: panelResumen, perfil: panelPerfil, fotos: panelFotos, verificacion: panelVerif, historias: panelHistorias, plan: panelPlan, creditos: panelCreditos, destacado: panelDestacado, avisos: panelAvisos, cuenta: panelCuenta, contenido: () => (HH.spContenido ? HH.spContenido.panel() : ''), pedidos: () => (HH.spClientes ? HH.spClientes.panelPedidos(parts[2]) : '') };
    if (tab === 'fotos' || tab === 'historias') setTimeout(vigilarVideos, 0);
    return panelLayout(tab, views[tab]());
  }

  /* ---------- Vistas de ingreso ---------- */
  const fieldErr = (id) => `<div id="${id}" class="sp-err" aria-live="polite"></div>`;
  function showErr(id, msg) { const el = document.getElementById(id); if (el) el.innerHTML = msg ? `<div class="notice danger">${icon('alert')}<span>${esc(msg)}</span></div>` : ''; }
  function loginView() {
    if (S.forgot) {
      return `<div class="container"><div class="auth-wrap"><div class="auth-card">
        <div><span class="eyebrow">Recuperar contraseña</span><h2>¿Olvidaste tu contraseña?</h2><p class="small muted" style="margin-top:4px">Escribí el email de tu cuenta y te mandamos un link para crear una nueva.</p></div>
        <form data-submit="spOlvide" class="stack" novalidate>
          <div class="field"><label for="spOEmail">Email</label><input class="input" id="spOEmail" name="email" type="email" autocomplete="email" inputmode="email" required></div>
          ${fieldErr('spOErr')}
          <button type="submit" class="btn lg block">Mandarme el link</button>
        </form>
        <p class="small center muted"><a href="#" data-action="spForgot" data-v="0">Volver a ingresar</a></p>
      </div></div></div>`;
    }
    return `<div class="container"><div class="auth-wrap"><div class="auth-card">
      <div><span class="eyebrow">Acompañantes</span><h2>Entrá a tu cuenta</h2><p class="small muted" style="margin-top:4px">Para mirar perfiles y escribir por WhatsApp no hace falta cuenta.</p></div>
      <form data-submit="spLogin" class="stack" novalidate>
        <div class="field"><label for="spLEmail">Email</label><input class="input" id="spLEmail" name="email" type="email" autocomplete="email" inputmode="email" required></div>
        <div class="field"><label for="spLPass">Contraseña</label><input class="input" id="spLPass" name="password" type="password" autocomplete="current-password" required></div>
        ${fieldErr('spLErr')}
        <button type="submit" class="btn lg block">Entrar</button>
      </form>
      <p class="small center"><a href="#" data-action="spForgot" data-v="1">¿Olvidaste tu contraseña?</a></p>
      <p class="small center muted">¿Todavía no publicaste? <a href="#registro" data-go="#registro">Creá tu perfil</a></p>
    </div></div></div>`;
  }
  function registroView() {
    const max = new Date(Date.now() - 18 * 365.25 * 864e5).toISOString().slice(0, 10);
    const pr = (S.estado && S.estado.ajustes && S.estado.ajustes.precios && S.estado.ajustes.precios.mes) || {};
    return `<div class="container"><div class="auth-wrap">
      <div class="auth-card">
        <div><span class="eyebrow">Publicá tu perfil</span><h2>Creá tu cuenta</h2><p class="small muted" style="margin-top:4px">Solo para acompañantes mayores de 18. Con el plan Bronce publicás gratis.</p></div>
        <form data-submit="spRegistro" class="stack" novalidate>
          <div class="field"><label for="spRName">Nombre artístico</label><input class="input" id="spRName" name="displayName" maxlength="30" autocomplete="nickname" required><span class="hint">Es el nombre que se ve en el sitio. No uses tu nombre completo.</span></div>
          <div class="field"><label for="spREmail">Email</label><input class="input" id="spREmail" name="email" type="email" autocomplete="email" inputmode="email" required><span class="hint">Te mandamos un link para confirmarlo. No se publica.</span></div>
          <div class="field"><label for="spRPass">Contraseña</label><input class="input" id="spRPass" name="password" type="password" minlength="10" autocomplete="new-password" required><span class="hint">Mínimo 10 caracteres.</span></div>
          <div class="sp-2">
            <div class="field"><label for="spRBirth">Fecha de nacimiento</label><input class="input" id="spRBirth" name="fechaNacimiento" type="date" max="${max}" required><span class="hint">Se publica solo tu edad.</span></div>
            <div class="field"><label for="spRGen">Género</label><select class="select" id="spRGen" name="genero" required>${GENEROS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
          </div>
          <label class="row nowrap small" style="gap:8px;align-items:flex-start"><input type="checkbox" name="mayorEdad" style="margin-top:3px" required><span>Soy mayor de 18 años.</span></label>
          <label class="row nowrap small" style="gap:8px;align-items:flex-start"><input type="checkbox" name="aceptaTerminos" style="margin-top:3px" required><span>Acepto los <a href="/terminos" target="_blank" rel="noopener">Términos</a>, la <a href="/privacidad" target="_blank" rel="noopener">Política de privacidad</a> y la <a href="/contenido" target="_blank" rel="noopener">Política de contenido</a>.</span></label>
          ${fieldErr('spRErr')}
          <button type="submit" class="btn lg block">Crear cuenta</button>
        </form>
        <p class="small center muted">¿Ya tenés cuenta? <a href="#login" data-go="#login">Ingresá</a></p>
      </div>
      <div class="card stack" style="gap:10px">
        <div class="card-title">Cómo funciona</div>
        <ol class="sp-steps small">
          <li><span>Creá tu cuenta y confirmá tu email.</span></li>
          <li><span>Completá tu perfil y subí al menos 3 fotos.</span></li>
          <li><span>Mandá una selfie y tu documento: los revisamos y nunca se publican.</span></li>
          <li><span>Aprobamos tu perfil y aparece en el sitio. Los clientes te escriben directo por WhatsApp o Telegram.</span></li>
        </ol>
        <div class="sp-prices">${['E', 'D', 'C', 'S'].map((k) => { const v = Number(pr[k] != null ? pr[k] : HH.LEVELS[k].price_usd); return `<div><span class="small muted">${esc(HH.planName(k))}</span><strong>${v ? `<span class="num">${fmtCr(v)}</span> <span class="small">créditos</span>` : '<span>Gratis</span>'}</strong></div>`; }).join('')}</div>
        <p class="tiny muted">Precio por mes, en créditos (1 crédito = 1 dólar). Oro y Star también se pueden pagar por semana. Los créditos se compran por WhatsApp.</p>
      </div>
    </div></div>`;
  }
  const qToken = () => new URLSearchParams(location.search).get('token') || '';
  function verificarView() {
    const t = qToken();
    if (!S.verif || S.verif.token !== t) {
      S.verif = { token: t, state: t ? 'loading' : 'error', msg: t ? '' : 'El link no tiene el código de confirmación.' };
      if (t) api('POST', '/cuenta/verificar-email', { token: t })
        .then(() => { S.verif.state = 'ok'; return loadYo(true, true); })
        .catch((e) => { S.verif.state = 'error'; S.verif.msg = e.message; })
        .finally(() => { if (/^cuenta\.verificar/.test(HH.currentHash())) HH.refresh(); });
    }
    const v = S.verif;
    const body = v.state === 'loading' ? `<div class="sp-skel"></div><p class="muted center">Confirmando tu email…</p>`
      : v.state === 'ok' ? `<div class="notice ok">${icon('checkCircle')}<span>Listo, confirmaste tu email.</span></div><a class="btn lg block" href="#panel" data-go="#panel">Ir a mi panel</a>`
        : `<div class="notice danger">${icon('alert')}<span>${esc(v.msg || 'El link no es válido o ya venció.')}</span></div><p class="small muted">Podés pedir un link nuevo desde tu panel.</p><a class="btn secondary block" href="#panel" data-go="#panel">Ir a mi panel</a>`;
    return `<div class="container"><div class="auth-wrap"><div class="auth-card"><div><span class="eyebrow">Tu cuenta</span><h2>Confirmar email</h2></div>${body}</div></div></div>`;
  }
  function restablecerView() {
    const t = qToken();
    if (!t) return `<div class="container"><div class="auth-wrap"><div class="auth-card"><h2>Link incompleto</h2><p class="muted">El link no tiene el código. Pedí uno nuevo desde "¿Olvidaste tu contraseña?".</p><a class="btn block" href="#login" data-go="#login">Ingresar</a></div></div></div>`;
    return `<div class="container"><div class="auth-wrap"><div class="auth-card">
      <div><span class="eyebrow">Tu cuenta</span><h2>Nueva contraseña</h2><p class="small muted" style="margin-top:4px">Elegí una contraseña nueva de al menos 10 caracteres. Se cierran las sesiones abiertas en otros dispositivos.</p></div>
      <form data-submit="spRestablecer" class="stack" novalidate>
        <div class="field"><label for="spNP1">Contraseña nueva</label><input class="input" id="spNP1" name="password" type="password" minlength="10" autocomplete="new-password" required></div>
        <div class="field"><label for="spNP2">Repetila</label><input class="input" id="spNP2" name="password2" type="password" minlength="10" autocomplete="new-password" required></div>
        ${fieldErr('spNPErr')}
        <button type="submit" class="btn lg block">Guardar contraseña</button>
      </form>
    </div></div></div>`;
  }

  /* ---------- Panel ---------- */
  const yoDatos = () => (S.yo && S.yo.perfil && S.yo.perfil.datos) || {};
  const planEf = () => (S.yo && S.yo.plan && S.yo.plan.efectivo) || 'E';
  const badge = (cls, txt) => `<span class="badge ${cls}">${txt}</span>`;
  function avatarYo(size) {
    const f = (S.yo.perfil.fotos || [])[0]; const d = yoDatos();
    return `<span class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px;background:${HH.hueGradient(hash(S.yo.id) % 360)}">${f ? `<img src="${esc(f.urlMini || f.url)}" alt="">` : esc(HH.initials(d.displayName || 'SR'))}</span>`;
  }
  function panelLayout(tab, main) {
    const p = S.yo.perfil; const d = yoDatos();
    const cnt = { resumen: (p.faltantes || []).length, verificacion: p.verificacion === 'sin_enviar' || p.verificacion === 'rechazada' ? 1 : 0, fotos: (p.fotos || []).length < 3 ? 1 : 0, avisos: noLeidas(), plan: p.pausadoPorSaldo ? 1 : 0, pedidos: S.yo.pedidosNoLeidos || 0 };
    const nav = PANEL_TABS.map((t) => `<a href="#panel.${t.id}" data-go="#panel.${t.id}" class="${t.id === tab ? 'active' : ''}">${icon(t.icon)}<span>${t.label}</span>${cnt[t.id] ? `<span class="count">${cnt[t.id]}</span>` : ''}</a>`).join('');
    const chips = PANEL_TABS.map((t) => `<button type="button" class="chip ${t.id === tab ? 'active' : ''}" data-go="#panel.${t.id}">${t.label}${cnt[t.id] ? `<span class="count">${cnt[t.id]}</span>` : ''}</button>`).join('');
    const pub = p.estado === 'publicado' && !p.oculto && p.slug;
    return `<div class="container dash-wrap"><div class="dash">
      <aside class="dash-side">
        <div class="who">${avatarYo(44)}<div class="grow" style="min-width:0"><div class="nm ellipsis"><span data-noi18n>${esc(d.displayName || 'Mi cuenta')}</span></div><div class="row" style="gap:4px;margin-top:4px">${HH.levelBadge(planEf(), true)}</div>${pub ? `<a class="small pub" href="#perfil.${esc(p.slug)}" data-go="#perfil.${esc(p.slug)}">Ver mi perfil público</a>` : ''}</div></div>
        <nav class="dash-nav" aria-label="Secciones del panel">${nav}</nav>
      </aside>
      <div class="dash-tabs"><div class="chips scroll" id="spChips">${chips}</div></div>
      <div class="dash-main">${emailBanner()}${main}</div>
    </div></div>`;
  }
  HH.afterRender = null;
  document.addEventListener('hh:rendered', () => { const strip = document.getElementById('spChips'); const chip = strip && strip.querySelector('.chip.active'); if (strip && chip) strip.scrollLeft = Math.max(0, chip.offsetLeft - (strip.clientWidth - chip.offsetWidth) / 2); });
  const head = (eyebrow, title, sub, right) => `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h2>${title}</h2>${sub ? `<p class="muted small" style="margin-top:4px;max-width:62ch">${sub}</p>` : ''}</div>${right || ''}</div>`;
  function emailBanner() {
    if (!S.yo || S.yo.emailVerificado) return '';
    return `<div class="notice warn sp-banner">${icon('mail')}<span class="grow"><span>Confirmá tu email: te mandamos un link a</span> <strong data-noi18n>${esc(S.yo.email)}</strong>.</span><button type="button" class="btn sm secondary" data-action="spReenviar"${S.busy.reenviar ? ' disabled' : ''}>Reenviar</button></div>`;
  }

  function panelResumen() {
    const p = S.yo.perfil; const [cls, label, txt0] = ESTADO_PERFIL[p.estado] || ESTADO_PERFIL.borrador;
    const txt = p.pausadoPorSaldo ? 'Tu perfil no se ve porque no alcanzaron los créditos para renovar tu plan.' : txt0;
    const [vcls, vlabel] = VERIF[p.verificacion] || VERIF.sin_enviar;
    const f = p.faltantes || [];
    const canSend = ['borrador', 'rechazado'].includes(p.estado);
    const motivo = p.motivoRechazo || (p.ultimaVerificacion && p.ultimaVerificacion.estado === 'rechazada' ? p.ultimaVerificacion.motivo : '');
    const pl = planEf(); const subs = ((S.yo.plan || {}).suscripciones || []).filter((s) => s.vigente || s.estado === 'activa');
    return head('Mi panel', 'Hola, <span data-noi18n>' + esc(yoDatos().displayName || '') + '</span>', '') + `
      <div class="card stack" style="gap:12px">
        <div class="row between"><div class="card-title">Estado de tu perfil</div>${badge(cls, label)}</div>
        <p class="small muted" style="margin:0">${txt}</p>
        ${motivo && (p.estado === 'rechazado' || p.verificacion === 'rechazada' || p.estado === 'borrador') ? `<div class="notice danger">${icon('alert')}<span><strong>Motivo:</strong> <span data-noi18n>${esc(motivo)}</span></span></div>` : ''}
        <div class="row" style="gap:8px">${badge(vcls, '<span>Verificación:</span> <span>' + vlabel + '</span>')}${badge(S.yo.emailVerificado ? 'ok' : 'warn', S.yo.emailVerificado ? 'Email confirmado' : 'Email sin confirmar')}</div>
        ${p.estado === 'publicado' ? `<div class="switch-row" style="border:0;padding:0"><div><div class="t">Ocultar mi perfil</div><div class="s">${p.oculto ? 'Tu perfil está oculto: nadie lo ve en el sitio.' : 'Lo sacás del sitio cuando quieras, sin perder nada.'}</div></div><button type="button" class="switch" role="switch" aria-checked="${!!p.oculto}" data-action="spOcultar" aria-label="Ocultar mi perfil"></button></div>` : ''}
      </div>
      ${canSend || f.length ? `<div class="card stack" style="gap:10px">
        <div class="card-title">Para publicar te falta</div>
        ${f.length ? `<ul class="sp-todo">${f.map((x) => `<li>${icon('alert')}<span>${esc(x)}</span></li>`).join('')}</ul>` : `<div class="notice ok">${icon('checkCircle')}<span>Tu perfil está completo.</span></div>`}
        ${canSend ? `<button type="button" class="btn lg" data-action="spEnviarRevision"${f.length || S.busy.revision ? ' disabled' : ''}>${icon('send')} Enviar a revisión</button>` : ''}
      </div>` : ''}
      <div class="card stack" style="gap:8px">
        <div class="row between"><div class="card-title">Tu plan</div>${HH.levelBadge(pl, true)}</div>
        ${p.pausadoPorSaldo ? `<div class="notice danger">${icon('alert')}<span>Tu perfil está pausado: no alcanzaron los créditos para renovar tu plan. Cargá créditos y vuelve a publicarse solo.</span></div>` : ''}
        <p class="small muted" style="margin:0">${pl === 'E' ? 'Estás en Bronce, gratis. Con un plan más alto aparecés más arriba y podés subir más fotos e historias.' : 'Vigente hasta el ' + esc(HH.fmtDate((subs.find((s) => s.plan === pl) || subs[0] || {}).hasta || new Date().toISOString())) + '.'}</p>
        <div class="sp-saldo-row"><span class="small muted">Tu saldo</span><strong><span class="num">${fmtCr(saldoYo())}</span> <span class="small">créditos</span></strong></div>
        <div class="row" style="gap:8px;flex-wrap:wrap"><a class="btn secondary" href="#panel.plan" data-go="#panel.plan">${icon('card')} Ver planes</a><a class="btn ghost" href="#panel.creditos" data-go="#panel.creditos">${icon('wallet')} Cargar créditos</a></div>
      </div>`;
  }

  function provincias() { const u = (S.estado && S.estado.ubicaciones) || []; return u.filter((x) => x.tipo === 'provincia' && x.activa !== false).sort((a, b) => (a.orden || 0) - (b.orden || 0) || a.nombre.localeCompare(b.nombre)); }
  function ciudadesDe(provId) {
    const u = (S.estado && S.estado.ubicaciones) || []; const prov = u.find((x) => x.id === provId); if (!prov) return [];
    const kids = (id) => u.filter((x) => x.padre === id && x.activa !== false);
    const zonas = kids(provId).filter((x) => x.tipo === 'zona');
    const groups = [];
    const direct = kids(provId).filter((x) => x.tipo === 'ciudad');
    if (!direct.length && !zonas.length) groups.push({ label: '', items: [prov] });
    if (direct.length) groups.push({ label: '', items: direct });
    zonas.forEach((z) => { const it = kids(z.id).filter((x) => x.tipo === 'ciudad'); if (it.length) groups.push({ label: z.nombre, items: it }); });
    groups.forEach((g) => g.items.sort((a, b) => a.nombre.localeCompare(b.nombre)));
    return groups;
  }
  const opt = (v, l, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(l)}</option>`;
  function ciudadOptions(provId, cur) {
    const g = ciudadesDe(provId);
    if (!provId) return `<option value="">Elegí primero la provincia</option>`;
    return `<option value="">Elegí tu ciudad</option>` + g.map((x) => x.label ? `<optgroup label="${esc(x.label)}">${x.items.map((c) => opt(c.id, c.nombre, c.id === cur)).join('')}</optgroup>` : x.items.map((c) => opt(c.id, c.nombre, c.id === cur)).join('')).join('');
  }
  function panelPerfil() {
    const d = yoDatos(); const prov = S.prov != null ? S.prov : (d.provincia || '');
    const cats = (S.estado && S.estado.categorias) || []; const ints = (S.estado && S.estado.intereses) || [];
    const links = (d.links || []).concat([{}, {}, {}, {}]).slice(0, 4);
    const locked = S.yo.perfil.verificacion === 'verificada';
    const chk = (name, id, label, on) => `<label class="chip sp-chk"><input type="checkbox" name="${name}" value="${esc(id)}"${on ? ' checked' : ''}><span>${esc(label)}</span></label>`;
    return head('Mi perfil', 'Tu ficha', 'Lo que ves acá es lo que se publica. Tu email, tu documento y tu fecha de nacimiento no se muestran.') + `
      <form data-submit="spPerfil" class="stack" novalidate>
        <div class="card stack" style="gap:12px">
          <div class="card-title">Datos básicos</div>
          <div class="sp-2">
            <div class="field"><label for="spPName">Nombre artístico</label><input class="input" id="spPName" name="displayName" maxlength="30" value="${esc(d.displayName || '')}" required></div>
            <div class="field"><label for="spPGen">Género</label><select class="select" id="spPGen" name="genero">${GENEROS.map(([v, l]) => opt(v, l, d.genero === v)).join('')}</select></div>
          </div>
          <div class="sp-2">
            <div class="field"><label for="spPBirth">Fecha de nacimiento</label><input class="input" id="spPBirth" name="fechaNacimiento" type="date" value="${esc(d.fechaNacimiento || '')}"${locked ? ' readonly' : ''}><span class="hint">${locked ? 'Ya fue verificada con tu documento.' : 'Se publica solo tu edad.'}</span></div>
            <div class="field"><label for="spPNac">Nacionalidad</label><input class="input" id="spPNac" name="nacionalidad" maxlength="40" value="${esc(d.nacionalidad || '')}" placeholder="Argentina"></div>
          </div>
        </div>
        <div class="card stack" style="gap:12px">
          <div class="card-title">Dónde estás</div>
          <div class="sp-2">
            <div class="field"><label for="spPProv">Provincia</label><select class="select" id="spPProv" name="provincia" data-change="spProv"><option value="">Elegí tu provincia</option>${provincias().map((x) => opt(x.id, x.nombre, x.id === prov)).join('')}</select></div>
            <div class="field"><label for="spPCity">Ciudad</label><select class="select" id="spPCity" name="ciudad">${ciudadOptions(prov, d.ciudad)}</select></div>
          </div>
          <div class="field"><label for="spPZona">Barrio o zona <span class="muted" style="font-weight:500">(opcional)</span></label><input class="input" id="spPZona" name="zona" maxlength="40" value="${esc(d.zona || '')}" placeholder="Palermo"></div>
        </div>
        <div class="card stack" style="gap:12px">
          <div class="card-title">Presentación</div>
          <div class="field"><label for="spPTit">Titular</label><input class="input" id="spPTit" name="titular" maxlength="80" value="${esc(d.titular || '')}" placeholder="Cafés de especialidad, museos y charlas largas"></div>
          <div class="field"><label for="spPBio">Sobre vos</label><textarea class="textarea" id="spPBio" name="bio" rows="5" maxlength="1500">${esc(d.bio || '')}</textarea></div>
          <details class="sp-det"><summary>En inglés <span class="muted">(opcional, para clientes de afuera)</span></summary>
            <div class="stack" style="gap:12px;margin-top:10px">
              <div class="field"><label for="spPTitEn">Titular en inglés</label><input class="input" id="spPTitEn" name="titularEn" maxlength="80" value="${esc(d.titularEn || '')}"></div>
              <div class="field"><label for="spPBioEn">Sobre vos en inglés</label><textarea class="textarea" id="spPBioEn" name="bioEn" rows="4" maxlength="1500">${esc(d.bioEn || '')}</textarea></div>
            </div>
          </details>
        </div>
        <div class="card stack" style="gap:12px">
          <div class="card-title">Sobre mí</div>
          <div class="sp-3">
            <div class="field"><label for="spPIdi">Idiomas</label><input class="input" id="spPIdi" name="idiomas" value="${esc((d.idiomas || []).join(', '))}" placeholder="Español, Inglés"><span class="hint">Separalos con comas.</span></div>
            <div class="field"><label for="spPAlt">Altura (cm)</label><input class="input num" id="spPAlt" name="alturaCm" type="number" min="120" max="220" inputmode="numeric" value="${esc(d.alturaCm || '')}"></div>
            <div class="field"><label for="spPCon">Contextura</label><select class="select" id="spPCon" name="contextura"><option value="">Sin indicar</option>${Object.entries(HH.BUILDS).map(([k, v]) => opt(k, v, d.contextura === k)).join('')}</select></div>
          </div>
          <div class="field"><span class="label">Intereses <span class="muted" style="font-weight:500">(hasta 6)</span></span><div class="chips">${ints.map((x) => chk('intereses', x.id, x.nombre, (d.intereses || []).includes(x.id))).join('')}</div></div>
          <div class="field"><span class="label">Salidas que te gustan</span><div class="chips">${cats.filter((c) => c.activa !== false).map((x) => chk('salidas', x.id, x.nombre, (d.salidas || []).includes(x.id))).join('')}</div></div>
        </div>
        <div class="card stack" style="gap:12px">
          <div class="card-title">Contacto y tarifa</div>
          <div class="sp-3">
            <div class="field"><label for="spPWa">WhatsApp</label><input class="input num" id="spPWa" name="whatsapp" type="tel" inputmode="tel" value="${esc(d.whatsapp || '')}" placeholder="+54 9 11 1234 5678"><span class="hint">Con código de país. Es el número al que te escriben.</span></div>
            <div class="field"><label for="spPTg">Telegram <span class="muted" style="font-weight:500">(opcional)</span></label><input class="input" id="spPTg" name="telegram" value="${esc(d.telegram || '')}" placeholder="tu_usuario"></div>
            <div class="field"><label for="spPRate">Tarifa desde (USD por hora)</label><input class="input num" id="spPRate" name="tarifaDesde" type="number" min="0" inputmode="numeric" value="${esc(d.tarifaDesde == null ? '' : d.tarifaDesde)}" placeholder="A convenir"></div>
          </div>
          <div class="field"><span class="label">Links <span class="muted" style="font-weight:500">(hasta 4, con https://)</span></span>
            <div class="stack" style="gap:8px">${links.map((l, i) => `<div class="sp-link"><input class="input" name="linkLabel${i}" maxlength="30" placeholder="Nombre" value="${esc(l.label || '')}" aria-label="Nombre del link ${i + 1}"><input class="input" name="linkUrl${i}" type="url" inputmode="url" placeholder="https://" value="${esc(l.url || '')}" aria-label="Dirección del link ${i + 1}"></div>`).join('')}</div>
          </div>
        </div>
        ${fieldErr('spPErr')}
        <div class="sp-savebar"><span class="small muted">Los cambios se ven en el sitio apenas guardás (si tu perfil está publicado).</span><button type="submit" class="btn"${S.busy.perfil ? ' disabled' : ''}>${icon('check')} Guardar</button></div>
      </form>`;
  }

  function panelFotos() {
    const p = S.yo.perfil; const fotos = p.fotos || []; const lim = S.yo.limites || {}; const max = lim.fotos || 8; const min = lim.minFotos || 3;
    const up = S.up;
    return head('Fotos', 'Tus fotos', `Mínimo ${min}, hasta ${max} con tu plan. La primera es la principal (la del swipe y las historias). Les agregamos la marca de agua de SexyRose y les sacamos los datos de ubicación.`) + `
      <div class="card stack" style="gap:12px">
        <div class="row between"><div class="card-title">${fotos.length} / ${max}</div>${fotos.length < max ? `<label class="btn sm${up ? ' disabled' : ''}">${icon('upload')} Subir fotos<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple class="sr-only" data-change="spFotosFile"${up ? ' disabled' : ''}></label>` : badge('neutral', 'Llegaste al límite de tu plan')}</div>
        ${up ? `<div class="sp-prog" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(up.p * 100)}"><i style="width:${Math.round(up.p * 100)}%"></i></div><div class="small muted">Subiendo ${up.i} de ${up.n}…</div>` : ''}
        ${fotos.length ? `<div class="sp-fotos">${fotos.map((f, i) => `<div class="sp-foto${i === 0 ? ' main' : ''}">
            <div class="media square"><img src="${esc(f.urlMini || f.url)}" alt="Foto ${i + 1}" loading="lazy"></div>
            ${i === 0 ? `<span class="badge ok sp-main">Principal</span>` : ''}
            <div class="sp-fact">
              ${i > 0 ? `<button type="button" class="icon-btn sm" data-action="spFotoMover" data-id="${esc(f.id)}" data-dir="-1" aria-label="Mover antes">${icon('chevronLeft')}</button>` : '<span></span>'}
              ${i > 0 ? `<button type="button" class="btn ghost sm" data-action="spFotoPrincipal" data-id="${esc(f.id)}">Principal</button>` : '<span></span>'}
              ${i < fotos.length - 1 ? `<button type="button" class="icon-btn sm" data-action="spFotoMover" data-id="${esc(f.id)}" data-dir="1" aria-label="Mover después">${icon('chevronRight')}</button>` : '<span></span>'}
              <button type="button" class="icon-btn sm" data-action="spFotoBorrar" data-id="${esc(f.id)}" aria-label="Borrar foto" style="color:var(--danger)">${icon('trash')}</button>
            </div>
          </div>`).join('')}</div>` : `<div class="empty">${icon('image')}<h4>Todavía no subiste fotos</h4><p class="small">Fotos reales, con la cara visible y en lugares públicos. Sin desnudos.</p></div>`}
      </div>${panelVideos()}`;
  }

  // Videos de la galería: solo cuando el almacenamiento externo está configurado (videosHabilitados).
  function panelVideos() {
    if (!S.yo.videosHabilitados) return '';
    const vids = S.yo.perfil.videos || []; const max = (S.yo.limites || {}).videos || 2;
    const usados = vids.filter((v) => v.estado !== 'error').length;
    const up = S.upVid;
    const est = (v) => (v.estado === 'listo' ? '' : v.estado === 'procesando'
      ? `<div class="sp-vstate"><span class="sp-spin" aria-hidden="true"></span><span>Procesando…</span></div>`
      : `<div class="sp-vstate err">${icon('alert')}<span data-noi18n>${esc(v.error || 'No se pudo procesar.')}</span></div>`);
    const listos = vids.filter((v) => v.estado === 'listo');
    return `<div class="card stack" style="gap:12px;margin-top:14px" id="spVideos">
        <div class="row between"><div><div class="card-title">Videos · ${usados} / ${max}</div><div class="small muted">Hasta 30 segundos y 95 MB. Les agregamos la marca de agua y les sacamos los datos de ubicación.</div></div>${usados < max ? `<label class="btn sm${up ? ' disabled' : ''}">${icon('upload')} Subir video<input type="file" accept="video/mp4,video/quicktime,video/webm,video/3gpp,.mp4,.mov,.webm,.3gp" class="sr-only" data-change="spVideoFile"${up ? ' disabled' : ''}></label>` : badge('neutral', 'Llegaste al límite de tu plan')}</div>
        ${up ? `<div class="sp-prog sp-vprog" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(up.p * 100)}"><i style="width:${Math.round(up.p * 100)}%"></i></div><div class="small muted">Subiendo video… <span class="num" id="spVidPct">${Math.round(up.p * 100)}</span>%</div>` : ''}
        ${vids.length ? `<div class="sp-fotos">${vids.map((v) => { const k = listos.indexOf(v); return `<div class="sp-foto">
            <div class="media square">${v.poster ? `<img src="${esc(v.poster)}" alt="Video" loading="lazy">` : `<div class="ph" style="background:${HH.hueGradient(hash(v.id) % 360, true)}">${icon('video')}</div>`}${v.segundos ? `<span class="pub-vbadge">${icon('play')} ${Math.round(v.segundos)}s</span>` : ''}${est(v)}</div>
            <div class="sp-fact">
              ${k > 0 ? `<button type="button" class="icon-btn sm" data-action="spVideoMover" data-id="${esc(v.id)}" data-dir="-1" aria-label="Mover antes">${icon('chevronLeft')}</button>` : '<span></span>'}
              <span></span>
              ${k >= 0 && k < listos.length - 1 ? `<button type="button" class="icon-btn sm" data-action="spVideoMover" data-id="${esc(v.id)}" data-dir="1" aria-label="Mover después">${icon('chevronRight')}</button>` : '<span></span>'}
              <button type="button" class="icon-btn sm" data-action="spVideoBorrar" data-id="${esc(v.id)}" aria-label="Borrar video" style="color:var(--danger)">${icon('trash')}</button>
            </div>
          </div>`; }).join('')}</div>` : `<div class="empty">${icon('video')}<h4>Todavía no subiste videos</h4><p class="small">Videos cortos de tus salidas, con la cara visible. Sin desnudos.</p></div>`}
      </div>${panelPreview()}`;
  }
  // Duración de un video elegido (en el navegador, antes de subirlo); null si no se puede leer
  function duracionVideo(f) {
    return new Promise((res) => {
      let url = ''; try { url = URL.createObjectURL(f); } catch (e) { res(null); return; }
      const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true;
      const fin = (d) => { clearTimeout(t); try { URL.revokeObjectURL(url); } catch (e) { /* */ } v.removeAttribute('src'); res(d && isFinite(d) ? d : null); };
      const t = setTimeout(() => fin(null), 8000);
      v.onloadedmetadata = () => fin(v.duration); v.onerror = () => fin(null);
      v.src = url;
    });
  }
  // Mientras haya videos procesándose, se consulta el estado cada 3 s (solo con el panel de fotos o el de historias abierto).
  let pollVid = null;
  const PANEL_VID = /^panel\.(fotos|historias)$/;
  function vigilarVideos() {
    clearTimeout(pollVid); pollVid = null;
    const hay = S.yo && ((S.yo.perfil.videos || []).some((v) => v.estado === 'procesando') || (S.yo.perfil.preview && S.yo.perfil.preview.estado === 'procesando')
      || (S.yo.historias || []).some((h) => h.estado === 'procesando')
      || (S.yo.destacadas || []).some((d) => (d.items || []).some((x) => x.estado === 'procesando')));
    if (!hay || !PANEL_VID.test(HH.currentHash())) return;
    pollVid = setTimeout(async () => {
      pollVid = null;
      if (!PANEL_VID.test(HH.currentHash())) return;
      const firma = () => JSON.stringify([((S.yo && S.yo.perfil.videos) || []).map((v) => v.estado), S.yo && S.yo.perfil.preview && [S.yo.perfil.preview.estado, S.yo.perfil.preview.url],
        ((S.yo && S.yo.historias) || []).map((h) => h.estado), ((S.yo && S.yo.destacadas) || []).map((d) => (d.items || []).map((x) => x.estado))]);
      const antes = firma();
      await loadYo(true, true);
      const ahora = firma();
      if (antes !== ahora) { if (S.yo && S.yo.perfil.estado === 'publicado') await loadEstado(); rerender(); }
      vigilarVideos();
    }, 3000);
  }

  function panelVerif() {
    const p = S.yo.perfil; const v = p.verificacion; const [cls, label] = VERIF[v] || VERIF.sin_enviar; const u = p.ultimaVerificacion;
    const canSend = v === 'sin_enviar' || v === 'rechazada' || v === 'pendiente';
    return head('Verificación', 'Verificá tu identidad', 'Lo revisamos a mano para confirmar que sos vos y que sos mayor de 18. La selfie y el documento nunca se publican ni se comparten.') + `
      <div class="card stack" style="gap:12px">
        <div class="row between"><div class="card-title">Estado</div>${badge(cls, label)}</div>
        ${v === 'rechazada' && u && u.motivo ? `<div class="notice danger">${icon('alert')}<span><strong>Motivo:</strong> <span data-noi18n>${esc(u.motivo)}</span></span></div>` : ''}
        ${v === 'pendiente' ? `<p class="small muted" style="margin:0">Recibimos tu verificación. Te avisamos por email cuando la revisemos. Si te equivocaste de archivo, podés mandarla de nuevo.</p>` : ''}
        ${v === 'verificada' ? `<div class="notice ok">${icon('checkCircle')}<span>Tu identidad está verificada.</span></div>` : ''}
      </div>
      ${canSend ? `<form class="card stack" style="gap:12px" data-submit="spVerif" novalidate>
        <div class="card-title">${v === 'pendiente' ? 'Mandar de nuevo' : 'Mandar verificación'}</div>
        <ol class="sp-steps small"><li><span>Una selfie sosteniendo tu documento al lado de la cara, con buena luz.</span></li><li><span>Una foto del frente de tu documento (DNI o pasaporte), que se lean el nombre y la fecha de nacimiento.</span></li></ol>
        <div class="sp-2">
          <div class="field"><label for="spVSelfie">Selfie con el documento</label><input class="input" id="spVSelfie" name="selfie" type="file" accept="image/*" capture="user" required></div>
          <div class="field"><label for="spVDoc">Frente del documento</label><input class="input" id="spVDoc" name="documento" type="file" accept="image/*" required></div>
        </div>
        <label class="row nowrap small" style="gap:8px;align-items:flex-start"><input type="checkbox" name="consentimiento" style="margin-top:3px" required><span>Acepto que SexyRose trate mi documento y mi selfie solo para verificar mi identidad. Se borran a los 3 meses.</span></label>
        ${S.busy.verif ? `<div class="sp-prog"><i style="width:${Math.round((S.busy.verifP || 0) * 100)}%"></i></div>` : ''}
        ${fieldErr('spVErr')}
        <button type="submit" class="btn"${S.busy.verif ? ' disabled' : ''}>${icon('shield')} Enviar verificación</button>
      </form>` : ''}`;
  }

  function panelHistorias() {
    const hs = S.yo.historias || []; const lim = S.yo.limites || {}; const dia = lim.historiasDia; const hoy = lim.historiasHoy || 0;
    const quedan = dia == null ? null : Math.max(0, dia - hoy);
    const pub = S.yo.perfil.estado === 'publicado';
    const conVideo = !!S.yo.videosHabilitados;
    const hEst = (h) => (h.estado === 'procesando' ? `<div class="sp-vstate"><span class="sp-spin" aria-hidden="true"></span><span>Procesando…</span></div>`
      : h.estado === 'error' ? `<div class="sp-vstate err">${icon('alert')}<span data-noi18n>${esc(h.error || 'No se pudo procesar.')}</span></div>` : '');
    const hMini = (h) => (h.urlMini ? `<img src="${esc(h.urlMini)}" alt="" loading="lazy">` : `<div class="ph" style="background:${HH.hueGradient(hash(h.id) % 360, true)}"></div>`)
      + (h.tipo === 'video' && h.segundos ? `<span class="pub-vbadge">${icon('play')} ${Math.round(h.segundos)}s</span>` : '') + hEst(h);
    return head('Historias', 'Tus historias', 'Duran 24 horas y aparecen en el inicio con tu anillo. Lo mejor para mostrar tu día.') + `
      ${pub ? '' : `<div class="notice info">${icon('info')}<span>Tus historias se ven en el sitio cuando tu perfil esté publicado.</span></div>`}
      <form class="card stack" style="gap:12px" data-submit="spHistoria" novalidate>
        <div class="row between"><div class="card-title">Nueva historia</div><span class="small muted">${quedan == null ? 'Historias ilimitadas con tu plan' : `Te quedan ${quedan} hoy`}</span></div>
        <div class="sp-2">
          <div class="field"><label for="spHFoto">${conVideo ? 'Foto o video' : 'Foto'}</label><input class="input" id="spHFoto" name="foto" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif${conVideo ? ',video/mp4,video/quicktime,video/webm,video/3gpp,.mp4,.mov,.webm,.3gp' : ''}" required>${conVideo ? '<span class="hint">Videos de hasta 60 segundos y 95 MB.</span>' : ''}</div>
          <div class="field"><label for="spHText">Texto <span class="muted" style="font-weight:500">(opcional)</span></label><input class="input" id="spHText" name="texto" maxlength="120" placeholder="Café de la mañana en Palermo"></div>
        </div>
        ${S.upHist ? `<div class="sp-prog"><i style="width:${Math.round(S.upHist.p * 100)}%"></i></div>` : ''}
        ${fieldErr('spHErr')}
        <button type="submit" class="btn"${quedan === 0 || S.upHist ? ' disabled' : ''}>${icon('camera')} Publicar historia</button>
      </form>
      <div class="card stack" style="gap:12px">
        <div class="card-title">Activas</div>
        ${hs.length ? `<div class="sp-hist">${hs.map((h) => `<div class="card pad-sm sp-h"><div class="media tall">${hMini(h)}</div><div class="tiny ellipsis" data-noi18n>${esc(h.texto || '')}</div><div class="row between tiny muted"><span>${h.estado === 'listo' ? esc(HH.timeAgo(h.creado)) : ''}</span><button type="button" class="btn danger sm" data-action="spHistBorrar" data-id="${esc(h.id)}">Borrar</button></div></div>`).join('')}</div>` : `<p class="small muted" style="margin:0">No tenés historias activas.</p>`}
      </div>
      ${panelDestacadas(hMini, conVideo)}`;
  }

  /* ---- Historias destacadas (como Instagram): las sube ella desde su dispositivo; no vencen ----
     API: /api/cuenta/destacadas (lib/destacadas.js). Cantidad por plan en S.yo.limites.destacadas (null = ilimitadas).
     Si bajó de plan, las que no entran quedan guardadas y se marcan "no se ve: supera el límite de tu plan". */
  const HL_TITULO_MAX = 16;
  Object.assign(HH.I18N = HH.I18N || {}, {
    'Destacadas': ['Highlights', 'Destaques'],
    'Quedan fijas en tu perfil, como en Instagram. Subí directamente las fotos y videos que quieras mostrar.': ['They stay on your profile, like on Instagram. Upload the photos and videos you want to show.', 'Ficam fixos no seu perfil, como no Instagram. Envie as fotos e vídeos que quiser mostrar.'],
    'Tu plan permite {n} destacada': ['Your plan allows {n} highlight', 'Seu plano permite {n} destaque'],
    'Tu plan permite {n} destacadas': ['Your plan allows {n} highlights', 'Seu plano permite {n} destaques'],
    'Destacadas ilimitadas con tu plan': ['Unlimited highlights with your plan', 'Destaques ilimitados com seu plano'],
    'usás {n}': ['you use {n}', 'você usa {n}'],
    'Nombre de la destacada': ['Highlight name', 'Nome do destaque'],
    'Crear destacada': ['Create highlight', 'Criar destaque'],
    'Llegaste al límite de destacadas de tu plan.': ['You reached your plan\'s highlight limit.', 'Você chegou ao limite de destaques do seu plano.'],
    'no se ve: supera el límite de tu plan': ['not shown: over your plan limit', 'não aparece: passa do limite do seu plano'],
    'Todavía no tiene fotos ni videos.': ['It has no photos or videos yet.', 'Ainda não tem fotos nem vídeos.'],
    'Agregar foto o video': ['Add photo or video', 'Adicionar foto ou vídeo'],
    'Agregar foto': ['Add photo', 'Adicionar foto'],
    'Subir': ['Upload', 'Enviar'],
    'Guardar nombre': ['Save name', 'Salvar nome'],
    'Borrar destacada': ['Delete highlight', 'Apagar destaque'],
    '¿Querés borrar esta destacada con todas sus fotos y videos?': ['Delete this highlight with all its photos and videos?', 'Apagar este destaque com todas as fotos e vídeos?'],
    '¿Querés borrar este elemento de la destacada?': ['Delete this item from the highlight?', 'Apagar este item do destaque?'],
    'Destacada creada.': ['Highlight created.', 'Destaque criado.'],
    'Destacada borrada.': ['Highlight deleted.', 'Destaque apagado.'],
    'Nombre guardado.': ['Name saved.', 'Nome salvo.'],
    'Agregado a la destacada.': ['Added to the highlight.', 'Adicionado ao destaque.'],
    'Recibimos el video. Se suma apenas termine de procesarse.': ['We got the video. It is added as soon as it finishes processing.', 'Recebemos o vídeo. Ele entra assim que terminar o processamento.'],
    'Borrado.': ['Deleted.', 'Apagado.'],
    'Ponele un nombre a la destacada.': ['Give the highlight a name.', 'Dê um nome ao destaque.'],
    'Elegí una foto o un video.': ['Choose a photo or a video.', 'Escolha uma foto ou um vídeo.'],
    'Elegí una foto.': ['Choose a photo.', 'Escolha uma foto.'],
    'Hasta {n} caracteres.': ['Up to {n} characters.', 'Até {n} caracteres.'],
  });
  function panelDestacadas(hMini, conVideo) {
    const ds = S.yo.destacadas || []; const lim = (S.yo.limites || {}).destacadas;
    const limTxt = lim == null ? HH.t('Destacadas ilimitadas con tu plan') : HH.t(lim === 1 ? 'Tu plan permite {n} destacada' : 'Tu plan permite {n} destacadas').replace('{n}', String(lim));
    const lleno = lim != null && ds.length >= lim;
    const accept = 'image/jpeg,image/png,image/webp,image/heic,image/heif' + (conVideo ? ',video/mp4,video/quicktime,video/webm,video/3gpp,.mp4,.mov,.webm,.3gp' : '');
    const up = S.upDest;
    const card = (d) => `<div class="card stack sp-dest" style="gap:10px">
        <form class="row sp-dest-name" style="gap:8px;flex-wrap:wrap;align-items:flex-end" data-submit="spDestRenombrar" data-id="${esc(d.id)}" novalidate>
          <div class="field grow" style="min-width:160px;margin:0"><label for="spDN_${esc(d.id)}">Nombre de la destacada</label><input class="input" id="spDN_${esc(d.id)}" name="titulo" maxlength="${HL_TITULO_MAX}" value="${esc(d.titulo)}" data-noi18n></div>
          <button type="submit" class="btn secondary sm">Guardar nombre</button>
          <button type="button" class="btn danger sm" data-action="spDestBorrar" data-id="${esc(d.id)}">${icon('trash')} Borrar destacada</button>
        </form>
        ${d.visible === false ? `<div class="tiny" style="color:var(--warn)">${icon('alert')} <span>no se ve: supera el límite de tu plan</span></div>` : ''}
        ${(d.items || []).length ? `<div class="sp-hist">${d.items.map((it) => `<div class="card pad-sm sp-h"><div class="media tall">${hMini(it)}</div><div class="row between tiny muted"><span></span><button type="button" class="btn danger sm" data-action="spDestItemBorrar" data-id="${esc(it.id)}">Borrar</button></div></div>`).join('')}</div>`
          : `<p class="small muted" style="margin:0">Todavía no tiene fotos ni videos.</p>`}
        <form class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end" data-submit="spDestSubir" data-id="${esc(d.id)}" novalidate>
          <div class="field grow" style="min-width:180px;margin:0"><label for="spDF_${esc(d.id)}">${conVideo ? 'Agregar foto o video' : 'Agregar foto'}</label><input class="input" id="spDF_${esc(d.id)}" name="archivo" type="file" accept="${accept}"></div>
          <button type="submit" class="btn sm"${up ? ' disabled' : ''}>${icon('upload')} Subir</button>
        </form>
        ${up && up.id === d.id ? `<div class="sp-prog"><i style="width:${Math.round(up.p * 100)}%"></i></div>` : ''}
        ${fieldErr('spDErr_' + d.id)}
      </div>`;
    return `<div class="card stack" style="gap:12px" id="spDestacadas">
        <div class="row between" style="flex-wrap:wrap;gap:6px"><div class="card-title">${icon('star')} Destacadas</div><span class="small muted"><span>${esc(limTxt)}</span> · <span>${esc(HH.t('usás {n}').replace('{n}', String(ds.length)))}</span></span></div>
        <p class="small muted" style="margin:0">Quedan fijas en tu perfil, como en Instagram. Subí directamente las fotos y videos que quieras mostrar.</p>
        ${lleno ? `<div class="notice info">${icon('info')}<span>Llegaste al límite de destacadas de tu plan.</span></div>` : `<form class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end" data-submit="spDestCrear" novalidate>
          <div class="field grow" style="min-width:180px;margin:0"><label for="spDNueva">Nombre de la destacada</label><input class="input" id="spDNueva" name="titulo" maxlength="${HL_TITULO_MAX}" placeholder="Ej.: Viajes"><span class="hint"><span>${esc(HH.t('Hasta {n} caracteres.').replace('{n}', String(HL_TITULO_MAX)))}</span></span></div>
          <button type="submit" class="btn secondary">${icon('plus')} Crear destacada</button>
        </form>${fieldErr('spDErr')}`}
      </div>
      ${ds.map(card).join('')}`;
  }

  /* ---------- Planes v2: créditos, plan, Destacado y avisos (contrato: FASE1-CONTRATO.md, "Planes v2, créditos y destacado") ----------
     Todo se paga con créditos (1 crédito = USD 1). Los créditos se compran por WhatsApp (o Telegram): el sitio crea el
     pedido con un código y abre el chat con el mensaje armado. En la web nunca se muestran datos bancarios. */
  // Monto de la API ({ centavos, creditos }) o un número de créditos → "35" / "12,50" (según el idioma)
  function fmtCr(m) {
    const c = m && typeof m === 'object' ? Number(m.centavos) : Math.round(Number(m || 0) * 100);
    const n = (Number.isFinite(c) ? c : 0) / 100;
    return n.toLocaleString(HH.loc(), { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
  }
  const cents = (m) => (m && typeof m === 'object' ? Number(m.centavos) || 0 : Math.round(Number(m || 0) * 100));
  const crHtml = (m, cls) => `<strong class="sp-cr ${cls || ''}"><span class="num">${fmtCr(m)}</span> <span>créditos</span></strong>`;
  const saldoYo = () => (S.yo && S.yo.creditos && S.yo.creditos.saldo) || { centavos: 0 };
  const noLeidas = () => (S.yo && S.yo.notificaciones && Number(S.yo.notificaciones.noLeidas)) || 0;
  const fLarga = (iso) => HH.fmtDate(iso, { day: 'numeric', month: 'long' });
  const fHora = (iso) => HH.fmtDateTime(iso);
  const diasHasta = (iso) => Math.ceil((new Date(iso) - Date.now()) / 864e5);
  // Carga perezosa de una sección: esqueleto → datos → se vuelve a dibujar
  function cargar(key, fn) { if (S.busy[key]) return; S.busy[key] = true; fn().finally(() => { S.busy[key] = false; rerender(); }); }
  async function loadCred() { try { S.cred = await api('GET', '/cuenta/creditos'); S.credErr = null; S.credMas = null; syncSaldo(S.cred.saldo); } catch (e) { S.credErr = e.message; } }
  async function loadDest() { try { S.dest = await api('GET', '/cuenta/destacado'); S.destErr = null; syncSaldo(S.dest.saldo); } catch (e) { S.destErr = e.message; } }
  async function loadNotif() { try { S.notif = await api('GET', '/cuenta/notificaciones?limite=50'); S.notifErr = null; if (S.yo) S.yo.notificaciones = { noLeidas: S.notif.noLeidas || 0 }; } catch (e) { S.notifErr = e.message; } }
  function syncSaldo(m) { if (S.yo && m) { S.yo.creditos = { saldo: m }; } }
  const skel = (eb, tt) => head(eb, tt, '') + `<div class="sp-skel"></div><div class="sp-skel"></div>`;
  const errBox = (msg, action) => `<div class="notice danger">${icon('alert')}<span>${esc(msg)}</span></div><button type="button" class="btn secondary" data-action="${action}">Reintentar</button>`;
  // Saldo insuficiente: cuánto falta y el atajo a cargar créditos
  const faltaHtml = (faltan) => `<div class="notice warn sp-falta">${icon('wallet')}<span class="grow"><span>Te faltan</span> ${crHtml(faltan)}<span>.</span> <span>Cargá créditos y volvé a intentarlo.</span></span><a class="btn sm" href="#panel.creditos" data-go="#panel.creditos" data-action="closeModal">${icon('plus')} Cargar créditos</a></div>`;
  const saldoChip = () => `<a class="sp-saldo-chip" href="#panel.creditos" data-go="#panel.creditos" title="Cargar créditos">${icon('wallet')}<span><span class="num">${fmtCr(saldoYo())}</span> <span>créditos</span></span></a>`;
  // Errores con código: 402 saldo → aviso con lo que falta (en el modal o como aviso); el resto, el mensaje del servidor
  function errCompra(e) {
    const d = e.data || {};
    if (e.status === 402 && d.faltan) { HH.modal({ title: 'No te alcanzan los créditos', body: `<div class="stack"><p class="small muted"><span>Tu saldo:</span> ${crHtml(d.saldo)}</p>${faltaHtml(d.faltan)}</div>`, actions: [{ label: 'Cerrar', cls: 'ghost', action: 'closeModal' }] }); return; }
    HH.toast(e.message, { type: 'danger', ms: 5000 });
  }

  /* ---- Créditos ---- */
  const MOV = { compra: 'Compra de créditos', pack_bonus: 'Regalo del pack', renovacion_plan: 'Plan', semana: 'Semana', subida_temporal: 'Subida temporal', destacado: 'Destacado', ajuste_admin: 'Ajuste', comision_venta: 'Comisión' };
  function pedidoCard(x, C) {
    const canal = (C && C.canales) || {};
    const wa = x.whatsappUrl; const tg = x.telegramUrl;
    return `<div class="card stack sp-ped" style="gap:12px">
      <div class="row between"><div class="card-title">Pedido en curso</div>${badge('warn', 'Esperando pago')}</div>
      <div class="sp-ped-code"><span class="small muted">Código del pedido</span><div class="row" style="gap:8px;align-items:center"><strong class="num" data-noi18n>${esc(x.codigo)}</strong><button type="button" class="btn ghost sm" data-action="spCopiar" data-v="${esc(x.codigo)}" aria-label="Copiar código">${icon('copy')} Copiar</button></div></div>
      <div class="sp-ped-det small"><span>${esc(x.packNombre || '')}</span> · <span>Pagás ${HH.money(x.pagaUsd)}</span> · <span>Recibís ${fmtCr(x.total)} créditos</span></div>
      <p class="small muted" style="margin:0"><span>Mandanos el mensaje por WhatsApp con este código: te respondemos con el monto y cómo pagar.</span> <span>El pedido espera el pago hasta el ${esc(fHora(x.vence))}.</span></p>
      ${x.tieneComprobante ? `<div class="notice ok">${icon('checkCircle')}<span>Recibimos tu comprobante. Te avisamos cuando acreditemos los créditos.</span></div>` : ''}
      <div class="row sp-ped-acts" style="gap:8px;flex-wrap:wrap">
        ${wa ? `<a class="btn wa" href="${esc(wa)}" target="_blank" rel="noopener">${icon('whatsapp')} Abrir WhatsApp</a>` : ''}
        ${tg ? `<a class="btn secondary" href="${esc(tg)}" target="_blank" rel="noopener">${icon('send')} Telegram</a>` : ''}
        ${!wa && !tg && !(canal.whatsapp || canal.telegram) ? `<span class="small muted">Muy pronto vas a poder escribirnos desde acá.</span>` : ''}
        <button type="button" class="btn ghost" data-action="spComprobante" data-id="${esc(x.id)}">${icon('upload')} ${x.tieneComprobante ? 'Mandar otro comprobante' : 'Adjuntar comprobante'}</button>
        <button type="button" class="btn ghost" data-action="spCancelarPedidoCr" data-id="${esc(x.id)}" style="color:var(--danger)">Cancelar pedido</button>
      </div>
    </div>`;
  }
  // Fechas largas del servidor ("21 de noviembre a las 05:49 h") → cortas ("21/11 05:49 h"): así los textos se
  // traducen con el diccionario (un {x} no puede tener más de 6 palabras)
  const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
  const fechasCortas = (t) => String(t || '').replace(/(\d{1,2}) de ([a-z]+)(?: de (\d{4}))? a las (\d{1,2}:\d{2}) h/g, (m, d, mes, y, h) => (MESES[mes] ? `${d}/${MESES[mes]} ${h} h` : m));
  // Compra: "Trimestre Plata · SR-8277" → el nombre del pack se traduce, el código no
  const motivoHtml = (m) => {
    const t = fechasCortas(m.motivo);
    const k = m.tipo === 'compra' ? t.lastIndexOf(' · ') : -1;
    return k > 0 ? `<span>${esc(t.slice(0, k))}</span> · <span data-noi18n>${esc(t.slice(k + 3))}</span>` : `<span>${esc(t)}</span>`;
  };
  function movRow(m) {
    const pos = cents(m) > 0;
    return `<div class="list-item sp-mov">${icon(pos ? 'plus' : 'arrowRight')}<div class="grow" style="min-width:0"><div class="title"><span>${esc(MOV[m.tipo] || m.tipo)}</span></div>${m.motivo ? `<div class="sub ellipsis">${motivoHtml(m)}</div>` : ''}<div class="sub"><span>${esc(fHora(m.creado))}</span> · <span>Saldo: ${fmtCr(m.saldoDespues)}</span></div></div><strong class="num sp-mov-n ${pos ? 'pos' : 'neg'}">${pos ? '+' : '−'}${fmtCr(Math.abs(cents(m)) / 100)}</strong></div>`;
  }
  function panelCreditos() {
    const eb = 'Créditos', tt = 'Tus créditos';
    if (!S.cred && !S.credErr) { cargar('cred', loadCred); return skel(eb, tt); }
    if (S.credErr) return head(eb, tt, '') + errBox(S.credErr, 'spCredReload');
    const C = S.cred; const canal = C.canales || {}; const hayCanal = !!(canal.whatsapp || canal.telegram);
    const pend = (C.pedidos || []).filter((x) => x.estado === 'pendiente');
    const otros = (C.pedidos || []).filter((x) => x.estado !== 'pendiente');
    const lleno = pend.length >= 3;
    const comprar = (attrs, lbl) => hayCanal
      ? `<button type="button" class="btn ${canal.whatsapp ? 'wa' : ''} block" ${attrs}${S.busy.pedCr || lleno ? ' disabled' : ''}>${icon(canal.whatsapp ? 'whatsapp' : 'send')} ${lbl || (canal.whatsapp ? 'Comprar por WhatsApp' : 'Comprar por Telegram')}</button>`
      : `<button type="button" class="btn secondary block" disabled>Muy pronto</button>`;
    const packs = (C.packs || []).map((k) => `<div class="sp-pack${k.masElegido ? ' top' : ''}">
        ${k.masElegido ? `<span class="sp-pack-rib">Más elegido</span>` : ''}
        <div class="sp-pack-name">${esc(k.nombre)}</div>
        <div class="sp-pack-get"><strong class="num">${fmtCr(k.recibe)}</strong> <span>créditos</span></div>
        <div class="sp-pack-pay small"><span>Pagás ${HH.money(k.pagaUsd)}</span> · <span>Recibís ${fmtCr(k.recibe)} créditos</span></div>
        ${Number(k.bonus) > 0 ? `<span class="sp-gift">${icon('gift')}<span>+${fmtCr(k.bonus)} de regalo</span></span>` : '<span class="sp-gift none" aria-hidden="true"></span>'}
        ${k.alcanzaPara ? `<div class="small muted sp-pack-alc"><span>Alcanza para</span> <span>${esc(k.alcanzaPara)}</span></div>` : ''}
        ${comprar(`data-action="spComprarPack" data-id="${esc(k.id)}"`)}
      </div>`).join('');
    const movs = (C.movimientos || []).concat(S.credMas ? S.credMas.items : []);
    const sig = S.credMas ? S.credMas.siguiente : C.siguiente;
    return head(eb, tt, 'Con créditos pagás tu plan, las semanas y el Destacado. 1 crédito = 1 dólar.') + `
      <div class="card sp-saldo">
        <div><div class="small muted">Saldo disponible</div><div class="sp-saldo-n"><strong class="num">${fmtCr(C.saldo)}</strong> <span>créditos</span></div></div>
        <div class="row" style="gap:8px;flex-wrap:wrap"><a class="btn secondary sm" href="#panel.plan" data-go="#panel.plan">${icon('card')} Pagar mi plan</a><a class="btn ghost sm" href="#panel.destacado" data-go="#panel.destacado">${icon('sparkles')} Destacado</a></div>
      </div>
      ${pend.map((x) => pedidoCard(x, C)).join('')}
      ${lleno ? `<div class="notice warn">${icon('info')}<span>Tenés 3 pedidos esperando pago. Pagá o cancelá alguno antes de pedir otro.</span></div>` : ''}
      <div class="card stack" style="gap:12px">
        <div><div class="card-title">Comprar créditos</div><p class="small muted" style="margin:4px 0 0">Elegí un pack: te abrimos WhatsApp con el pedido armado y te respondemos con el monto en pesos y cómo pagar. Cuando confirmamos el pago, los créditos se acreditan en tu cuenta.</p></div>
        <div class="sp-packs">${packs}</div>
        <form class="sp-carga" data-submit="spCargaMedida" novalidate>
          <div class="grow" style="min-width:0"><label class="label" for="spCargaN">Carga a medida</label><div class="small muted">De ${fmtCr(C.cargaMinima || 10)} a ${fmtCr(C.cargaMaxima || 10000)} créditos, sin bonificación.</div></div>
          <div class="row nowrap" style="gap:8px"><input class="input num" id="spCargaN" name="creditos" type="number" inputmode="numeric" min="${C.cargaMinima || 10}" max="${C.cargaMaxima || 10000}" step="1" value="${C.cargaMinima || 10}" aria-label="Créditos"${hayCanal ? '' : ' disabled'}>
          <button type="submit" class="btn ${canal.whatsapp ? 'wa' : 'secondary'}"${!hayCanal || S.busy.pedCr || lleno ? ' disabled' : ''}>${hayCanal ? 'Pedir' : 'Muy pronto'}</button></div>
        </form>
      </div>
      ${otros.length ? `<div class="card stack" style="gap:10px"><div class="card-title">Tus pedidos</div><div class="list">${otros.slice(0, 10).map((x) => { const [cls, l] = PEDIDO[x.estado] || ['neutral', x.estado]; return `<div class="list-item">${icon('wallet')}<div class="grow" style="min-width:0"><div class="title"><span class="num" data-noi18n>${esc(x.codigo)}</span> · <span>${esc(x.packNombre || '')}</span></div><div class="sub"><span>${fmtCr(x.total)} créditos</span> · <span>${esc(HH.fmtDate(x.creado))}</span>${x.motivo ? ` · <span data-noi18n>${esc(x.motivo)}</span>` : ''}</div></div>${badge(cls, l)}</div>`; }).join('')}</div></div>` : ''}
      <div class="card stack" style="gap:10px">
        <div class="card-title">Movimientos</div>
        ${movs.length ? `<div class="list">${movs.map(movRow).join('')}</div>` : `<p class="small muted" style="margin:0">Todavía no tenés movimientos.</p>`}
        ${sig ? `<button type="button" class="btn ghost sm" data-action="spMovMas" data-id="${esc(sig)}"${S.busy.movMas ? ' disabled' : ''}>Ver más</button>` : ''}
      </div>
      <div class="card stack sp-rules" style="gap:6px">
        <div class="card-title">Cómo funcionan</div>
        <ul class="sp-todo"><li>${icon('check')}<span>Los créditos no vencen.</span></li><li>${icon('check')}<span>No se devuelven en dinero ni se pueden pasar a otra cuenta.</span></li><li>${icon('check')}<span>Un pedido espera el pago ${C.horasPedido || 48} horas; después se cancela solo.</span></li><li>${icon('shield')}<span>Nunca te vamos a pedir datos de tu tarjeta ni de tu banco en la web.</span></li></ul>
      </div>`;
  }

  /* ---- Plan ---- */
  const TIPO_COMPRA = { nuevo: 'Plan nuevo', renovacion_anticipada: 'Sumás 30 días', subida: 'Subida de plan', semana: 'Semana', subida_temporal: 'Subida por 7 días' };
  function panelPlan() {
    const eb = 'Plan', tt = 'Tu plan';
    if (!S.planes && !S.planesErr) { cargar('planes', loadPlanes); return skel(eb, tt); }
    if (S.planesErr) return head(eb, tt, '') + errBox(S.planesErr, 'spPlanesReload');
    const P = S.planes; const ef = P.efectivo || 'E'; const base = P.base; const saldo = P.saldo || saldoYo(); syncSaldo(P.saldo);
    const baseRank = base ? RANK[base.plan] || 1 : 1;
    const cupo = P.cupoStar || {};
    const pr = P.precios || {};
    const prox = base && base.proximaRenovacion;
    const banners = [];
    if (P.pausa && P.pausa.perfilPausado !== false) banners.push(`<div class="notice danger sp-banner">${icon('alert')}<span class="grow"><strong>Tu perfil está pausado.</strong> <span>No alcanzaron los créditos para renovar ${esc(P.pausa.planNombre || HH.planName(P.pausa.plan))} (${fmtCr(P.pausa.costo)} créditos). Cargá créditos y tu perfil vuelve a publicarse solo.</span></span><span class="row" style="gap:6px;flex-wrap:wrap"><a class="btn sm" href="#panel.creditos" data-go="#panel.creditos">${icon('plus')} Cargar créditos</a><button type="button" class="btn ghost sm" data-action="spRenovacion" data-v="0">Seguir gratis con Bronce</button></span></div>`);
    else if (P.pausa) banners.push(`<div class="notice warn sp-banner">${icon('alert')}<span class="grow"><span>No pudimos renovar ${esc(P.pausa.planNombre || HH.planName(P.pausa.plan))}: se renueva solo apenas cargues créditos.</span></span><a class="btn sm" href="#panel.creditos" data-go="#panel.creditos">${icon('plus')} Cargar créditos</a></div>`);
    if (prox && !prox.alcanza && !P.pausa) {
      const d = diasHasta(prox.fecha);
      if (d <= 7) banners.push(`<div class="notice ${d <= 2 ? 'danger' : 'warn'} sp-banner">${icon('wallet')}<span class="grow"><span>Tu plan se renueva el ${esc(fLarga(prox.fecha))} y te faltan ${fmtCr(prox.faltan)} créditos.</span> <span>Si no alcanzan, tu perfil se pausa hasta que cargues.</span></span><a class="btn sm" href="#panel.creditos" data-go="#panel.creditos">${icon('plus')} Cargar créditos</a></div>`);
    }
    const semanas = (P.semanas || []).filter((s) => new Date(s.hasta) > new Date());
    const card = (x) => {
      const k = x.codigo; const r = RANK[k] || 1; const isStar = k === 'S';
      const sinCupo = isStar && (!cupo.provincia || !cupo.libres) && ef !== 'S';
      const lim = x.limites || {};
      const esBase = base && base.plan === k; const esCambio = base && base.cambioProgramado === k;
      const btns = [];
      if (k === 'E') {
        if (base && base.cambioProgramado === 'E') btns.push(`<span class="badge neutral block-badge">Programado para el ${esc(fLarga(base.hasta))}</span>`);
        else if (base) btns.push(`<button type="button" class="btn ghost block" data-action="spCambio" data-plan="E">Pasar a Bronce al vencer</button>`);
        else btns.push(`<span class="badge ok block-badge">${ef === 'E' ? 'Tu plan actual' : 'Gratis'}</span>`);
      } else {
        if (esBase) btns.push(`<button type="button" class="btn secondary block" data-action="spCotizar" data-plan="${k}" data-per="mes"${S.busy.cot ? ' disabled' : ''}>Sumar 30 días · ${fmtCr(x.mes)} créditos</button>`);
        else if (r > baseRank) btns.push(`<button type="button" class="btn ${isStar ? '' : 'secondary'} block" data-action="spCotizar" data-plan="${k}" data-per="mes"${sinCupo || S.busy.cot ? ' disabled' : ''}>${base ? 'Subir a ' + esc(x.nombre) : 'Activar 1 mes · ' + fmtCr(x.mes) + ' créditos'}</button>`);
        else if (esCambio) btns.push(`<span class="badge neutral block-badge">Programado para el ${esc(fLarga(base.hasta))}</span>`);
        else btns.push(`<button type="button" class="btn ghost block" data-action="spCambio" data-plan="${k}">Pasar a ${esc(x.nombre)} al renovar</button>`);
        if (x.semana != null && r > baseRank) btns.push(`<button type="button" class="btn ghost block" data-action="spCotizar" data-plan="${k}" data-per="semana"${sinCupo || S.busy.cot ? ' disabled' : ''}>${esc(UPGRADE_LABEL(x.nombre))} · ${fmtCr(x.semana)} créditos</button>`);
      }
      const feat = [
        `Hasta ${lim.fotos} fotos y ${lim.videos} videos`,
        lim.historiasDia == null ? 'Historias ilimitadas' : lim.historiasDia === 1 ? '1 historia por día' : `Hasta ${lim.historiasDia} historias por día`,
      ];
      const li = (t, ok) => `<li class="${ok ? '' : 'no'}">${icon(ok ? 'check' : 'x')}<span>${t}</span></li>`;
      return `<div class="plan${k === 'C' ? ' featured' : ''}${ef === k ? ' sp-cur' : ''}">
        ${ef === k ? `<span class="badge ribbon sp-cur-rib">Tu plan</span>` : k === 'C' ? `<span class="badge ribbon" style="background:var(--berry);color:var(--berry-ink)">Más elegido</span>` : ''}
        <div class="row between nowrap"><strong>${esc(x.nombre)}</strong>${HH.levelBadge(k, true)}</div>
        <div class="price">${x.mes ? `<span class="num">${fmtCr(x.mes)}</span> <small>créditos / mes</small>` : '<span>Gratis</span>'}</div>
        ${x.semana != null ? `<div class="small muted" style="margin-top:-6px">o ${fmtCr(x.semana)} créditos por semana</div>` : ''}
        <p class="small muted">${esc((HH.LEVELS[k] || {}).desc || '')}</p>
        <ul>${feat.map((t) => li(t, true)).join('')}${li('Clip de 5 segundos en tu tarjeta', !!x.preview)}${isStar ? li('Lugar fijo arriba de todo en tu provincia', true) : x.destacado ? li(cents(x.destacado.dia) === 100 ? 'Destacado: 1 crédito el día' : `Destacado: ${fmtCr(x.destacado.dia)} créditos el día`, true) : ''}</ul>
        ${isStar ? `<p class="tiny ${sinCupo ? 'sp-danger' : 'muted'}">${!cupo.provincia ? 'Elegí tu provincia en Mi perfil para ver el cupo.' : cupo.libres ? `Quedan ${cupo.libres} de ${cupo.total || 10} lugares en tu provincia.` : 'No quedan lugares Star en tu provincia.'}</p>` : ''}
        <div class="stack" style="gap:8px">${btns.join('')}</div>
      </div>`;
    };
    const historial = (P.suscripciones || []).slice(0, 8);
    return head(eb, tt, 'Pagás con créditos. El plan por mes se renueva solo si te alcanzan los créditos; lo podés apagar cuando quieras. Una semana de un plan más alto te sube 7 días y después volvés solo a tu plan.', saldoChip()) + banners.join('') + `
      <div class="card stack" style="gap:12px">
        <div class="row between"><div class="card-title">Plan actual</div>${HH.levelBadge(ef, true)}</div>
        ${base ? `<div class="list">
          <div class="list-item">${icon('card')}<div class="grow"><div class="title"><span>${esc(base.planNombre || HH.planName(base.plan))}</span> · <span>por mes</span></div><div class="sub">Hasta el ${esc(fLarga(base.hasta))}</div></div></div>
          ${semanas.map((s) => `<div class="list-item">${icon('bolt')}<div class="grow"><div class="title"><span>${esc(s.planNombre || HH.planName(s.plan))}</span> · <span>1 semana</span></div><div class="sub">Del ${esc(HH.fmtDate(s.desde))} al ${esc(HH.fmtDate(s.hasta))}</div></div></div>`).join('')}
        </div>
        ${base.cambioProgramado ? `<div class="notice info">${icon('calendar')}<span class="grow"><span>${base.cambioProgramado === 'E' ? 'El ' + esc(fLarga(base.hasta)) + ' pasás a Bronce (gratis).' : 'El ' + esc(fLarga(base.hasta)) + ' pasás a ' + esc(HH.planName(base.cambioProgramado)) + '.'}</span></span><button type="button" class="btn ghost sm" data-action="spCambio" data-plan="">Deshacer</button></div>` : ''}
        <div class="switch-row" style="border:0;padding:0"><div><div class="t">Renovación automática</div><div class="s">${base.renovacionAuto ? (prox ? `<span>Se renueva el ${esc(fLarga(prox.fecha))} por ${fmtCr(prox.costo)} créditos.</span>` + (prox.alcanza ? '' : ` <span class="sp-danger">Te faltan ${fmtCr(prox.faltan)} créditos.</span>`) : '<span>Encendida.</span>') : `<span>Apagada: el ${esc(fLarga(base.hasta))} pasás a Bronce.</span>`}</div></div><button type="button" class="switch" role="switch" aria-checked="${!!base.renovacionAuto}" data-action="spRenovacion" data-v="${base.renovacionAuto ? '0' : '1'}" aria-label="Renovación automática"${S.busy.renov ? ' disabled' : ''}></button></div>`
        : semanas.length ? `<div class="list">${semanas.map((s) => `<div class="list-item">${icon('bolt')}<div class="grow"><div class="title"><span>${esc(s.planNombre || HH.planName(s.plan))}</span> · <span>1 semana</span></div><div class="sub">Del ${esc(HH.fmtDate(s.desde))} al ${esc(HH.fmtDate(s.hasta))}</div></div></div>`).join('')}</div><p class="small muted" style="margin:0">Después volvés a Bronce, gratis.</p>`
        : `<p class="small muted" style="margin:0">Estás en Bronce, gratis.</p>`}
      </div>
      <div class="plans sp-plans">${(P.planes || []).slice().sort((a, b) => (RANK[a.codigo] || 0) - (RANK[b.codigo] || 0)).map(card).join('')}</div>
      ${historial.length ? `<details class="card sp-det"><summary>Historial de planes</summary><div class="list" style="margin-top:10px">${historial.map((s) => `<div class="list-item">${icon('card')}<div class="grow"><div class="title"><span>${esc(s.planNombre || HH.planName(s.plan))}</span> · <span>${s.periodo === 'semana' ? '1 semana' : s.periodo === 'manual' ? 'asignado' : '1 mes'}</span></div><div class="sub">Del ${esc(HH.fmtDate(s.desde))} al ${esc(HH.fmtDate(s.hasta))}${s.costo ? ` · <span>${fmtCr(s.costo)} créditos</span>` : ''}</div></div>${badge(s.vigente ? 'ok' : 'neutral', s.vigente ? 'Vigente' : s.estado === 'cancelada' ? 'Cancelada' : 'Vencida')}</div>`).join('')}</div></details>` : ''}`;
  }
  // Vista previa de la compra (GET /plan/cotizar) antes de cobrar
  function cotizacionHtml(q) {
    const despues = cents(q.saldo) - cents(q.costo);
    return `<div class="stack" style="gap:12px">
      <div class="sp-amount"><span class="small muted">${esc(TIPO_COMPRA[q.tipo] || '')}</span><strong><span class="num">${fmtCr(q.costo)}</span> <span>créditos</span></strong><span class="small muted"><span>${esc(q.planNombre || HH.planName(q.plan))}</span> · <span>Del ${esc(HH.fmtDate(q.desde))} al ${esc(HH.fmtDate(q.hasta))}</span></span></div>
      ${q.tipo === 'subida' ? `<p class="small muted" style="margin:0"><span>Pagás solo la diferencia por los ${q.diasRestantes} días que le quedan a tu plan. Termina el mismo día que tu plan actual y después se renueva como ${esc(q.planNombre)}.</span></p>` : ''}
      ${q.tipo === 'subida_temporal' || q.tipo === 'semana' ? `<p class="small muted" style="margin:0">Son 7 días. Después volvés solo a tu plan.</p>` : ''}
      ${q.tipo === 'nuevo' ? `<p class="small muted" style="margin:0">Son 30 días con renovación automática (la podés apagar cuando quieras).</p>` : ''}
      ${q.detalle ? `<div class="small"><span>${esc(q.detalle)}</span></div>` : ''}
      <div class="sp-saldo-row"><span class="small muted">Tu saldo</span><span><span class="num">${fmtCr(q.saldo)}</span> <span>créditos</span></span></div>
      ${q.alcanza ? `<div class="sp-saldo-row"><span class="small muted">Te quedan</span><span><span class="num">${fmtCr(despues / 100)}</span> <span>créditos</span></span></div>` : faltaHtml(q.faltan)}
    </div>`;
  }

  /* ---- Destacado ---- */
  const EST_DEST = { activo: ['ok', 'Activo'], programado: ['info', 'Programado'], vencido: ['neutral', 'Terminado'], cancelado: ['neutral', 'Cancelado'] };
  function panelDestacado() {
    const eb = 'Destacado', tt = 'Destacá tu perfil';
    const sub = 'Tu tarjeta aparece primero dentro de tu plan en tu provincia, con la etiqueta Destacado. Si hay varias destacadas, el orden cambia en cada visita.';
    if (!S.dest && !S.destErr) { cargar('dest', loadDest); return skel(eb, tt); }
    if (S.destErr) return head(eb, tt, sub) + errBox(S.destErr, 'spDestReload');
    const D = S.dest; const mios = D.mios || [];
    const activos = mios.filter((m) => m.estado === 'activo' || m.estado === 'programado');
    const pasados = mios.filter((m) => m.estado !== 'activo' && m.estado !== 'programado').slice(0, 6);
    const pr = D.precios || {};
    const tabla = ['E', 'D', 'C'].filter((k) => pr[k]).map((k) => `<tr class="${D.plan === k ? 'on' : ''}"><td>${HH.levelBadge(k, true)}</td><td class="num">${fmtCr(pr[k].dia)}</td><td class="num">${fmtCr(pr[k].semana)}</td></tr>`).join('');
    const c = D.cupo; const lleno = c && c.ocupadosAhora >= c.cupo;
    const pf = D.proximaFechaLibre || {};
    const opcion = (dias) => {
      const precio = D.precio && (dias === 1 ? D.precio.dia : D.precio.semana);
      const libre = dias === 1 ? pf.dia : pf.semana;
      const futuro = libre && new Date(libre) > new Date(Date.now() + 60000);
      return `<div class="sp-dop">
        <div><div class="card-title">${dias === 1 ? '1 día' : '7 días'}</div><div class="sp-dop-n"><strong class="num">${fmtCr(precio)}</strong> <span>créditos</span></div>${dias === 7 && D.precio ? `<div class="tiny muted"><span>Ahorrás ${fmtCr(cents(D.precio.dia) * 7 / 100 - cents(D.precio.semana) / 100)} créditos</span></div>` : ''}</div>
        ${futuro ? `<div class="tiny muted">Próxima fecha libre: ${esc(fHora(libre))}</div>` : ''}
        <button type="button" class="btn ${dias === 7 ? '' : 'secondary'} block" data-action="spDestacar" data-dias="${dias}"${futuro ? ` data-desde="${esc(libre)}"` : ''}${S.busy.dest ? ' disabled' : ''}>${futuro ? 'Reservar ' + (dias === 1 ? '1 día' : '7 días') : 'Destacar ' + (dias === 1 ? '1 día' : '7 días')}</button>
      </div>`;
    };
    return head(eb, tt, sub, saldoChip()) + `
      ${!D.disponible ? `<div class="notice ${D.plan === 'S' ? 'info' : 'warn'}">${icon(D.plan === 'S' ? 'star' : 'info')}<span>${esc(D.motivo || 'El Destacado no está disponible para tu perfil por ahora.')}</span></div>` : ''}
      ${D.disponible ? `<div class="card stack" style="gap:12px">
        <div class="row between"><div class="card-title">Con tu plan</div>${HH.levelBadge(D.plan, true)}</div>
        <div class="sp-dops">${opcion(1)}${opcion(7)}</div>
        ${c ? `<div class="stack" style="gap:6px"><div class="row between small"><span>Lugares en tu provincia</span><span><span class="num">${Math.min(c.ocupadosAhora, c.cupo)}</span> <span>de</span> <span class="num">${c.cupo}</span> <span>ocupados ahora</span></span></div><div class="sp-prog sp-cupo${lleno ? ' full' : ''}"><i style="width:${Math.min(100, Math.round((Math.min(c.ocupadosAhora, c.cupo) / Math.max(1, c.cupo)) * 100))}%"></i></div><div class="tiny muted">Hay un lugar destacado cada 5 perfiles de tu plan en tu provincia.${lleno ? ' Ahora está completo: podés reservar la próxima fecha libre.' : ''}</div></div>` : ''}
        <p class="tiny muted" style="margin:0">El Destacado vale para el plan con el que lo comprás. Si subís de plan por mes, te devolvemos en créditos lo que no usaste.</p>
      </div>` : ''}
      ${activos.length ? `<div class="card stack" style="gap:10px"><div class="card-title">Tus Destacados</div><div class="list">${activos.map(destRow).join('')}</div></div>` : ''}
      ${tabla ? `<div class="card stack" style="gap:10px"><div class="card-title">Precios por plan</div><div class="table-wrap"><table class="table sp-dtab"><thead><tr><th>Plan</th><th class="num">1 día</th><th class="num">7 días</th></tr></thead><tbody>${tabla}</tbody></table></div><p class="tiny muted" style="margin:0">En créditos. Star no necesita Destacado: ya aparece arriba de todo.</p></div>` : ''}
      ${pasados.length ? `<details class="card sp-det"><summary>Anteriores</summary><div class="list" style="margin-top:10px">${pasados.map(destRow).join('')}</div></details>` : ''}`;
  }
  function destRow(m) {
    const [cls, l] = EST_DEST[m.estado] || ['neutral', m.estado];
    return `<div class="list-item">${icon('sparkles')}<div class="grow" style="min-width:0"><div class="title"><span>${m.dias === 7 ? '7 días' : '1 día'}</span> · <span>${esc(m.planNombre || HH.planName(m.plan))}</span></div><div class="sub"><span>Del ${esc(fHora(m.desde))} al ${esc(fHora(m.hasta))}</span> · <span>${fmtCr(m.costo)} créditos</span></div></div>${badge(cls, l)}</div>`;
  }

  /* ---- Avisos (notificaciones) ---- */
  const NOTIF = {
    creditos_acreditados: ['ok', 'wallet', 'Créditos acreditados'], pedido_rechazado: ['danger', 'alert', 'Pedido rechazado'],
    plan_comprado: ['ok', 'card', 'Plan activado'], plan_renovado: ['ok', 'refresh', 'Plan renovado'], plan_asignado: ['ok', 'gift', 'Plan asignado'],
    plan_vence: ['warn', 'clock', 'Tu plan está por terminar'], plan_vencio: ['neutral', 'clock', 'Tu plan terminó'],
    saldo_insuficiente: ['warn', 'wallet', 'Faltan créditos para renovar'], perfil_pausado: ['danger', 'alert', 'Perfil pausado'],
    renovacion_pendiente: ['warn', 'refresh', 'Renovación pendiente'], destacado: ['info', 'sparkles', 'Destacado'],
  };
  const NOTIF_LINK = { creditos_acreditados: 'creditos', pedido_rechazado: 'creditos', saldo_insuficiente: 'creditos', perfil_pausado: 'creditos', renovacion_pendiente: 'plan', plan_comprado: 'plan', plan_renovado: 'plan', plan_asignado: 'plan', plan_vence: 'plan', plan_vencio: 'plan', destacado: 'destacado' };
  function panelAvisos() {
    const eb = 'Avisos', tt = 'Tus avisos';
    if (!S.notif && !S.notifErr) { cargar('notif', loadNotif); return skel(eb, tt); }
    if (S.notifErr) return head(eb, tt, '') + errBox(S.notifErr, 'spNotifReload');
    const items = S.notif.items || []; const n = items.filter((x) => !x.leida).length;
    return head(eb, tt, 'Pagos, renovaciones de tu plan y Destacado.', n ? `<button type="button" class="btn ghost sm" data-action="spNotifLeer"${S.busy.leer ? ' disabled' : ''}>${icon('check')} Marcar todo como leído</button>` : '') + `
      ${items.length ? `<div class="card" style="padding:6px 8px"><div class="list sp-notifs">${items.map((x) => {
        const [cls, ic, tit] = NOTIF[x.tipo] || ['neutral', 'bell', 'Aviso']; const to = NOTIF_LINK[x.tipo];
        return `<button type="button" class="list-item sp-notif${x.leida ? '' : ' nueva'}" data-action="spNotifAbrir" data-id="${esc(String(x.id))}" data-to="${to || ''}"><span class="sp-notif-ic ${cls}">${icon(ic)}</span><div class="grow" style="min-width:0"><div class="title"><span>${esc(tit)}</span>${x.leida ? '' : '<i class="sp-ndot" aria-label="Sin leer"></i>'}</div><div class="sub sp-notif-t"><span>${esc(fechasCortas(x.texto))}</span></div><div class="tiny muted">${esc(fHora(x.creado))}</div></div>${to ? icon('chevronRight') : ''}</button>`;
      }).join('')}</div></div>` : `<div class="empty">${icon('bell')}<h4>No tenés avisos</h4><p class="small">Acá te avisamos cuando acreditamos tus créditos, se renueva tu plan o empieza tu Destacado.</p></div>`}`;
  }

  function panelCuenta() {
    return head('Cuenta', 'Tu cuenta', '') + `
      <div class="card stack" style="gap:10px"><div class="card-title">Email</div><p class="small" style="margin:0" data-noi18n>${esc(S.yo.email)}</p>${S.yo.emailVerificado ? badge('ok', 'Confirmado') : badge('warn', 'Sin confirmar')}</div>
      <form class="card stack" style="gap:12px" data-submit="spPass" novalidate>
        <div class="card-title">Cambiar contraseña</div>
        <div class="sp-2">
          <div class="field"><label for="spCPA">Contraseña actual</label><input class="input" id="spCPA" name="actual" type="password" autocomplete="current-password" required></div>
          <div class="field"><label for="spCPN">Contraseña nueva</label><input class="input" id="spCPN" name="nueva" type="password" minlength="10" autocomplete="new-password" required></div>
        </div>
        ${fieldErr('spCPErr')}
        <button type="submit" class="btn secondary">Cambiar contraseña</button>
      </form>
      <div class="card stack" style="gap:10px"><div class="card-title">Ayuda</div><p class="small muted" style="margin:0">Escribinos a <a href="mailto:contacto@sexyrose.net">contacto@sexyrose.net</a>.</p><button type="button" class="btn ghost" data-action="spLogout" style="color:var(--danger)">${icon('logout')} Cerrar sesión</button></div>`;
  }

  /* ---------- Acciones ---------- */
  const val = (o, k) => (o[k] == null ? '' : String(o[k]).trim());
  async function afterYoChange(msg) { await loadYo(true, true); if (S.yo && S.yo.perfil && S.yo.perfil.estado === 'publicado') await loadEstado(); if (msg) HH.toast(msg, { type: 'ok' }); rerender(); HH.renderShell(); }
  Object.assign(HH.actions, {
    spForgot(el, ev) { if (ev) ev.preventDefault(); S.forgot = el.dataset.v === '1'; HH.refresh(); },
    async spLogin(form, ev, data) {
      showErr('spLErr', ''); const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        await api('POST', '/cuenta/login', { email: val(data, 'email'), password: data.password || '' });
        await loadYo(true, true); await loadEstado(); HH.renderShell();
        const next = HH.ui.next && /^panel/.test(HH.ui.next) ? HH.ui.next : '#panel'; HH.ui.next = null; HH.save(); HH.go(next.startsWith('#') ? next : '#' + next);
      } catch (e) { showErr('spLErr', e.message); btn.disabled = false; }
    },
    async spOlvide(form, ev, data) {
      showErr('spOErr', ''); const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      try { await api('POST', '/cuenta/olvide', { email: val(data, 'email') }); form.outerHTML = `<div class="notice ok">${icon('mail')}<span>Si hay una cuenta con ese email, te mandamos un link para crear una contraseña nueva. Revisá también la carpeta de spam.</span></div>`; }
      catch (e) { showErr('spOErr', e.message); btn.disabled = false; }
    },
    async spRestablecer(form, ev, data) {
      showErr('spNPErr', '');
      if ((data.password || '').length < 10) return showErr('spNPErr', 'La contraseña tiene que tener al menos 10 caracteres.');
      if (data.password !== data.password2) return showErr('spNPErr', 'Las dos contraseñas no coinciden.');
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      try { await api('POST', '/cuenta/restablecer', { token: qToken(), password: data.password }); HH.toast('Listo, ya podés entrar con tu contraseña nueva.', { type: 'ok' }); S.forgot = false; await loadYo(true, true); HH.go(S.yo ? '#panel' : '#login', { replace: true }); }
      catch (e) { showErr('spNPErr', e.message); btn.disabled = false; }
    },
    async spRegistro(form, ev, data) {
      showErr('spRErr', '');
      const body = { displayName: val(data, 'displayName'), email: val(data, 'email'), password: data.password || '', fechaNacimiento: val(data, 'fechaNacimiento'), genero: data.genero || 'mujer', mayorEdad: !!data.mayorEdad, aceptaTerminos: !!data.aceptaTerminos };
      if (!body.mayorEdad) return showErr('spRErr', 'Tenés que confirmar que sos mayor de 18 años.');
      if (!body.aceptaTerminos) return showErr('spRErr', 'Tenés que aceptar los Términos y las políticas.');
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      try { const r = await api('POST', '/cuenta/registro', body); S.yo = r.cuenta || null; S.yoLoaded = true; if (!S.yo) await loadYo(true, true); hint(!!S.yo); addSelfToDb(); HH.renderShell(); HH.go('#panel'); HH.toast('Cuenta creada. Te mandamos un email para confirmarlo.', { type: 'ok' }); }
      catch (e) { showErr('spRErr', e.message); btn.disabled = false; }
    },
    async spReenviar() {
      S.busy.reenviar = true; rerender();
      try { await api('POST', '/cuenta/reenviar-verificacion'); HH.toast('Te mandamos el email de nuevo.', { type: 'ok' }); } catch (e) { HH.toast(e.message, { type: 'danger' }); }
      S.busy.reenviar = false; rerender();
    },
    async spEnviarRevision() {
      S.busy.revision = true; rerender();
      try { await api('POST', '/cuenta/perfil/enviar-revision'); await afterYoChange('Listo, tu perfil está en revisión.'); } catch (e) { HH.toast(e.message, { type: 'danger' }); }
      S.busy.revision = false; rerender();
    },
    async spOcultar(el) {
      const oculto = el.getAttribute('aria-checked') !== 'true';
      try { await api('POST', '/cuenta/perfil/ocultar', { oculto }); await loadYo(true); await loadEstado(); HH.toast(oculto ? 'Tu perfil está oculto.' : 'Tu perfil se ve de nuevo.', { type: 'ok' }); rerender(); } catch (e) { HH.toast(e.message, { type: 'danger' }); }
    },
    spProv(el) { S.prov = el.value; const c = document.getElementById('spPCity'); if (c) c.innerHTML = ciudadOptions(S.prov, ''); },
    async spPerfil(form) {
      showErr('spPErr', '');
      const fd = new FormData(form); const g = (k) => String(fd.get(k) == null ? '' : fd.get(k)).trim();
      const links = [0, 1, 2, 3].map((i) => ({ label: g('linkLabel' + i), url: g('linkUrl' + i) })).filter((l) => l.url);
      const intereses = fd.getAll('intereses'); if (intereses.length > 6) return showErr('spPErr', 'Podés elegir hasta 6 intereses.');
      const body = {
        displayName: g('displayName'), genero: g('genero'), nacionalidad: g('nacionalidad'), provincia: g('provincia') || null, ciudad: g('ciudad') || null, zona: g('zona'),
        titular: g('titular'), bio: g('bio'), titularEn: g('titularEn'), bioEn: g('bioEn'),
        idiomas: g('idiomas').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 6), alturaCm: g('alturaCm') ? Number(g('alturaCm')) : null, contextura: g('contextura') || null,
        intereses, salidas: fd.getAll('salidas'), whatsapp: g('whatsapp'), telegram: g('telegram'), tarifaDesde: g('tarifaDesde') === '' ? null : Number(g('tarifaDesde')), links,
      };
      if (g('fechaNacimiento') && S.yo.perfil.verificacion !== 'verificada') body.fechaNacimiento = g('fechaNacimiento');
      S.busy.perfil = true; const btn = form.querySelector('button[type=submit]'); if (btn) btn.disabled = true;
      try { await api('PUT', '/cuenta/perfil', body); S.prov = null; await afterYoChange('Guardado.'); }
      catch (e) { showErr('spPErr', e.message); const el = document.getElementById('spPErr'); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      S.busy.perfil = false; if (btn) btn.disabled = false;
    },
    async spFotosFile(el) {
      const files = [...(el.files || [])]; if (!files.length) return;
      const lim = (S.yo.limites || {}).fotos || 8; const room = Math.max(0, lim - (S.yo.perfil.fotos || []).length);
      const list = files.slice(0, room); if (files.length > room) HH.toast('Tu plan permite ' + lim + ' fotos: se suben solo ' + room + '.', { type: 'warn' });
      for (let i = 0; i < list.length; i++) {
        S.up = { i: i + 1, n: list.length, p: 0 }; rerender();
        const fd = new FormData(); fd.append('foto', list[i]);
        try { await upload('/cuenta/fotos', fd, (p) => { S.up.p = p; const bar = document.querySelector('.sp-prog i'); if (bar) bar.style.width = Math.round(p * 100) + '%'; }); }
        catch (e) { HH.toast((list[i].name ? list[i].name + ': ' : '') + e.message, { type: 'danger' }); }
      }
      S.up = null; await afterYoChange(list.length ? 'Fotos subidas.' : '');
    },
    async spVideoFile(el) {
      const f = (el.files || [])[0]; if (!f) return;
      if (f.size > 95 * 1024 * 1024) { HH.toast('El video pesa más de 95 MB. Recortalo o grabalo en menor calidad.', { type: 'danger' }); return; }
      S.upVid = { p: 0 }; rerender();
      const fd = new FormData(); fd.append('video', f);
      try {
        await upload('/cuenta/videos', fd, (p) => { if (S.upVid) S.upVid.p = p; const bar = document.querySelector('.sp-vprog i'); if (bar) bar.style.width = Math.round(p * 100) + '%'; const t = document.getElementById('spVidPct'); if (t) t.textContent = Math.round(p * 100); });
        S.upVid = null; await afterYoChange('Recibimos el video. Lo estamos procesando.');
      } catch (e) { S.upVid = null; rerender(); HH.toast(e.message, { type: 'danger' }); }
      vigilarVideos();
    },
    async spVideoBorrar(el) {
      HH.confirm({ title: 'Borrar video', text: '¿Querés borrar este video? No se puede deshacer.', okLabel: 'Borrar', cls: 'danger', onOk: async () => {
        try { await api('DELETE', '/cuenta/videos/' + encodeURIComponent(el.dataset.id)); await afterYoChange('Video borrado.'); } catch (e) { HH.toast(e.message, { type: 'danger' }); }
      } });
    },
    async spVideoMover(el) {
      const vids = S.yo.perfil.videos || []; const listos = vids.filter((v) => v.estado === 'listo').map((v) => v.id);
      const i = listos.indexOf(el.dataset.id); const j = i + Number(el.dataset.dir); if (i < 0 || j < 0 || j >= listos.length) return;
      [listos[i], listos[j]] = [listos[j], listos[i]];
      const ids = listos.concat(vids.filter((v) => v.estado !== 'listo').map((v) => v.id));
      try { await api('PUT', '/cuenta/videos/orden', { ids }); await afterYoChange(''); } catch (e) { HH.toast(e.message, { type: 'danger' }); }
    },
    async spFotoBorrar(el) {
      HH.confirm({ title: 'Borrar foto', text: '¿Querés borrar esta foto? No se puede deshacer.', okLabel: 'Borrar', cls: 'danger', onOk: async () => {
        try { await api('DELETE', '/cuenta/fotos/' + encodeURIComponent(el.dataset.id)); await afterYoChange('Foto borrada.'); } catch (e) { HH.toast(e.message, { type: 'danger' }); }
      } });
    },
    async spFotoMover(el) { const ids = (S.yo.perfil.fotos || []).map((f) => f.id); const i = ids.indexOf(el.dataset.id); const j = i + Number(el.dataset.dir); if (i < 0 || j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; await ordenar(ids); },
    async spFotoPrincipal(el) { const ids = (S.yo.perfil.fotos || []).map((f) => f.id).filter((x) => x !== el.dataset.id); await ordenar([el.dataset.id].concat(ids)); },
    async spVerif(form) {
      showErr('spVErr', ''); const s = form.selfie.files[0], d = form.documento.files[0];
      if (!s || !d) return showErr('spVErr', 'Elegí las dos fotos: la selfie con el documento y el frente del documento.');
      if (!form.consentimiento.checked) return showErr('spVErr', 'Tenés que aceptar el uso de tu documento y tu selfie para verificar tu identidad.');
      const fd = new FormData(); fd.append('selfie', s); fd.append('documento', d); fd.append('consentimiento', '1');
      S.busy.verif = true; S.busy.verifP = 0; rerender();
      try { await upload('/cuenta/verificacion', fd, (p) => { S.busy.verifP = p; const bar = document.querySelector('.sp-prog i'); if (bar) bar.style.width = Math.round(p * 100) + '%'; }); S.busy.verif = false; await afterYoChange('Recibimos tu verificación.'); }
      catch (e) { S.busy.verif = false; rerender(); showErr('spVErr', e.message); }
    },
    async spHistoria(form) {
      showErr('spHErr', ''); const f = form.foto.files[0]; if (!f) return showErr('spHErr', S.yo && S.yo.videosHabilitados ? 'Elegí una foto o un video.' : 'Elegí una foto.');
      const esVideo = /^video\//.test(f.type || '') || /\.(mp4|mov|webm|3gp)$/i.test(f.name || '');
      if (esVideo) {
        if (f.size > 95 * 1024 * 1024) return showErr('spHErr', 'El video pesa más de 95 MB. Recortalo o grabalo en menor calidad.');
        const seg = await duracionVideo(f);
        if (seg && seg > 61) return showErr('spHErr', `El video dura ${Math.round(seg)} s. Hasta 60 segundos.`);
      }
      const fd = new FormData(); fd.append(esVideo ? 'video' : 'foto', f); fd.append('texto', String(form.texto.value || '').trim());
      S.upHist = { p: 0 }; rerender();
      try {
        await upload(esVideo ? '/cuenta/historias/video' : '/cuenta/historias', fd, (p) => { if (S.upHist) S.upHist.p = p; const bar = document.querySelector('.sp-prog i'); if (bar) bar.style.width = Math.round(p * 100) + '%'; });
        S.upHist = null; await afterYoChange(esVideo ? 'Recibimos el video. Se publica apenas termine de procesarse.' : 'Historia publicada por 24 horas.');
      } catch (e) { S.upHist = null; rerender(); showErr('spHErr', e.message); }
      if (esVideo) vigilarVideos();
    },
    async spDestCrear(form) {
      showErr('spDErr', ''); const t = String(form.titulo.value || '').trim();
      if (!t) return showErr('spDErr', 'Ponele un nombre a la destacada.');
      try { await api('POST', '/cuenta/destacadas', { titulo: t }); await afterYoChange('Destacada creada.'); } catch (e) { showErr('spDErr', e.message); }
    },
    async spDestRenombrar(form) {
      const id = form.dataset.id; showErr('spDErr_' + id, ''); const t = String(form.titulo.value || '').trim();
      if (!t) return showErr('spDErr_' + id, 'Ponele un nombre a la destacada.');
      try { await api('PUT', '/cuenta/destacadas/' + encodeURIComponent(id), { titulo: t }); await afterYoChange('Nombre guardado.'); } catch (e) { showErr('spDErr_' + id, e.message); }
    },
    async spDestBorrar(el) {
      HH.confirm({ title: 'Borrar destacada', text: '¿Querés borrar esta destacada con todas sus fotos y videos?', okLabel: 'Borrar', cls: 'danger', onOk: async () => {
        try { await api('DELETE', '/cuenta/destacadas/' + encodeURIComponent(el.dataset.id)); await afterYoChange('Destacada borrada.'); } catch (e) { HH.toast(e.message, { type: 'danger' }); }
      } });
    },
    async spDestItemBorrar(el) {
      HH.confirm({ title: 'Borrar', text: '¿Querés borrar este elemento de la destacada?', okLabel: 'Borrar', cls: 'danger', onOk: async () => {
        try { await api('DELETE', '/cuenta/destacadas/items/' + encodeURIComponent(el.dataset.id)); await afterYoChange('Borrado.'); } catch (e) { HH.toast(e.message, { type: 'danger' }); }
      } });
    },
    async spDestSubir(form) {
      const id = form.dataset.id; const errId = 'spDErr_' + id; showErr(errId, '');
      const f = form.archivo.files[0]; if (!f) return showErr(errId, S.yo && S.yo.videosHabilitados ? 'Elegí una foto o un video.' : 'Elegí una foto.');
      const esVideo = /^video\//.test(f.type || '') || /\.(mp4|mov|webm|3gp)$/i.test(f.name || '');
      if (esVideo) {
        if (f.size > 95 * 1024 * 1024) return showErr(errId, 'El video pesa más de 95 MB. Recortalo o grabalo en menor calidad.');
        const seg = await duracionVideo(f);
        if (seg && seg > 61) return showErr(errId, `El video dura ${Math.round(seg)} s. Hasta 60 segundos.`);
      }
      const fd = new FormData(); fd.append(esVideo ? 'video' : 'foto', f);
      S.upDest = { id, p: 0 }; rerender();
      try {
        await upload('/cuenta/destacadas/' + encodeURIComponent(id) + (esVideo ? '/videos' : '/fotos'), fd, (p) => { if (S.upDest) S.upDest.p = p; const bar = document.querySelector('.sp-dest .sp-prog i'); if (bar) bar.style.width = Math.round(p * 100) + '%'; });
        S.upDest = null; await afterYoChange(esVideo ? 'Recibimos el video. Se suma apenas termine de procesarse.' : 'Agregado a la destacada.');
      } catch (e) { S.upDest = null; rerender(); showErr(errId, e.message); }
      if (esVideo) vigilarVideos();
    },
    async spHistBorrar(el) {
      HH.confirm({ title: 'Borrar historia', text: '¿Querés borrar esta historia?', okLabel: 'Borrar', cls: 'danger', onOk: async () => {
        try { await api('DELETE', '/cuenta/historias/' + encodeURIComponent(el.dataset.id)); await afterYoChange('Historia borrada.'); } catch (e) { HH.toast(e.message, { type: 'danger' }); }
      } });
    },
    async spPlanesReload() { S.planes = null; S.planesErr = null; rerender(); },
    spCredReload() { S.cred = null; S.credErr = null; rerender(); },
    spDestReload() { S.dest = null; S.destErr = null; rerender(); },
    spNotifReload() { S.notif = null; S.notifErr = null; rerender(); },
    async spCopiar(el) {
      const v = el.dataset.v || '';
      try { await navigator.clipboard.writeText(v); HH.toast('Código copiado.', { type: 'ok' }); }
      catch (e) { HH.toast(v); }
    },
    // Créditos: pedido de un pack o carga a medida → se abre WhatsApp (o Telegram) con el mensaje armado
    spComprarPack(el) { pedirCreditos({ packId: el.dataset.id }); },
    spCargaMedida(form, ev, data) {
      const n = Number(data.creditos); const C = S.cred || {};
      const min = C.cargaMinima || 10, max = C.cargaMaxima || 10000;
      if (!Number.isInteger(n) || n < min || n > max) { HH.toast('La carga a medida es de ' + min + ' a ' + max + ' créditos (números enteros).', { type: 'danger' }); return; }
      pedirCreditos({ creditos: n });
    },
    async spMovMas(el) {
      if (S.busy.movMas) return; S.busy.movMas = true; rerender();
      try {
        const r = await api('GET', '/cuenta/creditos?limite=50&antesDe=' + encodeURIComponent(el.dataset.id));
        S.credMas = { items: (S.credMas ? S.credMas.items : []).concat(r.movimientos || []), siguiente: r.siguiente || null };
      } catch (e) { HH.toast(e.message, { type: 'danger' }); }
      S.busy.movMas = false; rerender();
    },
    spComprobante(el) { comprobante(el.dataset.id); },
    spCancelarPedidoCr(el) {
      HH.confirm({ title: 'Cancelar pedido', text: '¿Querés cancelar este pedido? Si ya pagaste, no lo canceles: mandanos el comprobante.', okLabel: 'Cancelar pedido', cls: 'danger', onOk: async () => {
        try { await api('POST', '/cuenta/creditos/pedidos/' + encodeURIComponent(el.dataset.id) + '/cancelar'); await loadCred(); HH.toast('Pedido cancelado.'); rerender(); } catch (e) { HH.toast(e.message, { type: 'danger' }); }
      } });
    },
    // Plan: vista previa (cotizar) y confirmación; nunca se cobra sin que ella vea el costo
    async spCotizar(el) {
      const plan = el.dataset.plan, periodo = el.dataset.per; if (S.busy.cot) return;
      S.busy.cot = true; rerender();
      let q;
      try { q = await api('GET', '/cuenta/plan/cotizar?plan=' + encodeURIComponent(plan) + '&periodo=' + encodeURIComponent(periodo)); }
      catch (e) { S.busy.cot = false; rerender(); HH.toast(e.message, { type: 'danger', ms: 6000 }); return; }
      S.busy.cot = false; rerender();
      const titulo = (TIPO_COMPRA[q.tipo] || 'Plan') + ': ' + (q.planNombre || HH.planName(plan));
      HH.modal({ title: titulo, body: cotizacionHtml(q), actions: q.alcanza
        ? [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: 'Pagar ' + fmtCr(q.costo) + ' créditos', onClick: (btn) => comprarPlan(plan, periodo, btn) }]
        : [{ label: 'Cerrar', cls: 'ghost', action: 'closeModal' }] });
    },
    async spRenovacion(el) {
      const activa = el.dataset.v === '1'; if (S.busy.renov) return;
      const go = async () => {
        S.busy.renov = true; rerender();
        try { const r = await api('PUT', '/cuenta/plan/renovacion', { activa }); await loadPlanes(); if (r.reanudado) await afterYoChange(''); HH.toast(activa ? 'Renovación automática encendida.' : r.reanudado ? 'Listo: seguís con Bronce y tu perfil vuelve a verse.' : 'Renovación automática apagada.', { type: 'ok' }); }
        catch (e) { HH.toast(e.message, { type: 'danger' }); }
        S.busy.renov = false; rerender();
      };
      if (activa) return go();
      const base = S.planes && S.planes.base;
      HH.confirm({ title: 'Apagar la renovación automática', text: base ? `<span>Tu plan sigue hasta el ${esc(fLarga(base.hasta))}. Después pasás a Bronce, gratis.</span>` : '<span>Pasás a Bronce, gratis.</span>', okLabel: 'Apagar', onOk: go });
    },
    async spCambio(el) {
      const plan = el.dataset.plan || null; const base = S.planes && S.planes.base; if (!base) return;
      const go = async () => {
        try { await api('PUT', '/cuenta/plan/cambio', { plan }); await loadPlanes(); HH.toast(plan ? 'Cambio programado.' : 'Listo, se renueva el mismo plan.', { type: 'ok' }); rerender(); }
        catch (e) { HH.toast(e.message, { type: 'danger', ms: 6000 }); }
      };
      if (!plan) return go();
      HH.confirm({ title: 'Pasar a ' + HH.planName(plan), text: plan === 'E'
        ? `<span>Tu plan ${esc(base.planNombre || HH.planName(base.plan))} sigue hasta el ${esc(fLarga(base.hasta))}. Después pasás a Bronce, gratis, y no se cobra nada más.</span>`
        : `<span>Tu plan ${esc(base.planNombre || HH.planName(base.plan))} sigue hasta el ${esc(fLarga(base.hasta))}. Desde ese día se renueva como ${esc(HH.planName(plan))}, por ${fmtCr((S.planes.precios || {}).mes ? S.planes.precios.mes[plan] : HH.LEVELS[plan].price_usd)} créditos por mes.</span>`, okLabel: 'Programar', onOk: go });
    },
    // Destacado: comprar ahora (o reservar la próxima fecha libre si el cupo está lleno)
    spDestacar(el) {
      const dias = Number(el.dataset.dias); const desde = el.dataset.desde || null; const D = S.dest || {};
      const precio = D.precio && (dias === 1 ? D.precio.dia : D.precio.semana);
      const falta = cents(precio) - cents(D.saldo);
      HH.modal({ title: (desde ? 'Reservar Destacado' : 'Destacar mi perfil') + ' · ' + (dias === 1 ? '1 día' : '7 días'), body: `<div class="stack" style="gap:12px">
          <div class="sp-amount"><span class="small muted">Destacado</span><strong><span class="num">${fmtCr(precio)}</span> <span>créditos</span></strong><span class="small muted">${desde ? `<span>Desde el ${esc(fHora(desde))}</span>` : '<span>Empieza ahora</span>'}</span></div>
          <div class="sp-saldo-row"><span class="small muted">Tu saldo</span><span><span class="num">${fmtCr(D.saldo)}</span> <span>créditos</span></span></div>
          ${falta > 0 ? faltaHtml({ centavos: falta }) : ''}
        </div>`, actions: falta > 0 ? [{ label: 'Cerrar', cls: 'ghost', action: 'closeModal' }]
        : [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: 'Pagar ' + fmtCr(precio) + ' créditos', onClick: (btn) => destacar(dias, desde, btn) }] });
    },
    async spNotifLeer() {
      S.busy.leer = true; rerender();
      try { const r = await api('POST', '/cuenta/notificaciones/leer', {}); (S.notif.items || []).forEach((x) => { x.leida = true; }); if (S.yo) S.yo.notificaciones = { noLeidas: r.noLeidas || 0 }; HH.renderShell(); }
      catch (e) { HH.toast(e.message, { type: 'danger' }); }
      S.busy.leer = false; rerender();
    },
    async spNotifAbrir(el) {
      const id = el.dataset.id; const x = ((S.notif || {}).items || []).find((n) => String(n.id) === id);
      if (x && !x.leida) {
        x.leida = true; if (S.yo) S.yo.notificaciones = { noLeidas: Math.max(0, noLeidas() - 1) };
        api('POST', '/cuenta/notificaciones/leer', { ids: [x.id] }).then((r) => { if (S.yo && r) S.yo.notificaciones = { noLeidas: r.noLeidas || 0 }; HH.renderShell(); }).catch(() => {});
      }
      if (el.dataset.to) { S.planes = null; S.cred = null; S.dest = null; HH.go('#panel.' + el.dataset.to); } else { rerender(); HH.renderShell(); }
    },
    async spPass(form, ev, data) {
      showErr('spCPErr', ''); const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      try { await api('POST', '/cuenta/cambiar-password', { actual: data.actual || '', nueva: data.nueva || '' }); form.reset(); HH.toast('Contraseña cambiada.', { type: 'ok' }); } catch (e) { showErr('spCPErr', e.message); }
      btn.disabled = false;
    },
    spLogout() { HH.logout(); },
    openUserMenu() {
      const p = S.yo && S.yo.perfil; const pub = p && p.estado === 'publicado' && !p.oculto;
      HH.modal({ title: 'Mi cuenta', body: `<div class="list">
        <a class="list-item" href="#panel" data-go="#panel" data-action="closeModal">${icon('dashboard')}<span class="grow title">Mi panel</span></a>
        <a class="list-item" href="#favoritos" data-go="#favoritos" data-action="closeModal">${icon('star')}<span class="grow title">Favoritos</span></a>
        ${pub ? `<a class="list-item" href="#perfil.${esc(p.slug)}" data-go="#perfil.${esc(p.slug)}" data-action="closeModal">${icon('user')}<span class="grow title">Ver mi perfil</span></a>` : ''}
        <button class="list-item" data-action="spLogout" style="cursor:pointer;text-align:left;width:100%;color:var(--danger)">${icon('logout')}<span class="grow title">Cerrar sesión</span></button>
      </div>` });
    },
    // Reportar un perfil: va a las denuncias del sitio (las revisa el admin)
    pubReport(el) {
      const slug = el.dataset.slug; const p = HH.profileBySlug(slug); if (!p) return;
      HH.modal({ title: 'Reportar a ' + p.displayName, body: `<div class="stack">
          <p class="small muted">Contanos qué pasó. Revisamos cada reporte y podemos suspender el perfil.</p>
          <div class="field"><label for="spRepCat">Motivo</label><select class="select" id="spRepCat"><option value="otro">Perfil falso, engaño u otro</option><option value="imagen_sin_consentimiento">Imágenes sin consentimiento</option><option value="trata">Posible trata o explotación</option><option value="abuso_infantil">Posible menor de edad</option></select></div>
          <div class="field"><label for="spRepTxt">Qué pasó</label><textarea class="textarea" id="spRepTxt" rows="4" maxlength="2000"></textarea></div>
          <div class="field"><label for="spRepMail">Tu email <span class="muted" style="font-weight:500">(opcional)</span></label><input class="input" id="spRepMail" type="email" inputmode="email"></div>
        </div>`, actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: 'Enviar reporte', cls: 'danger', onClick: async () => {
          const body = { slug, categoria: document.getElementById('spRepCat').value, descripcion: document.getElementById('spRepTxt').value.trim(), email: document.getElementById('spRepMail').value.trim() };
          try { await api('POST', '/sitio/reporte', body); HH.closeModal(); HH.toast('Gracias. Recibimos tu reporte.', { type: 'ok' }); } catch (e) { HH.toast(e.message, { type: 'danger' }); }
        } }] });
    },
  });
  async function ordenar(ids) { try { await api('PUT', '/cuenta/fotos/orden', { ids }); await afterYoChange(''); } catch (e) { HH.toast(e.message, { type: 'danger' }); } }
  // Pedido de créditos: lo crea el servidor (código SR-####) y se abre el chat con el mensaje armado. Si el navegador
  // bloquea la ventana nueva, el pedido queda arriba en Créditos con el botón "Abrir WhatsApp".
  async function pedirCreditos(body) {
    if (S.busy.pedCr) return; S.busy.pedCr = true; rerender();
    // La ventana se abre ya (en el mismo toque) para que el navegador no la bloquee; después se le pone la dirección
    let w = null; try { w = window.open('', '_blank'); } catch (e) { w = null; }
    try {
      const r = await api('POST', '/cuenta/creditos/pedidos', Object.assign({ lang: HH.lang }, body));
      const ped = r.pedido || {}; const url = ped.whatsappUrl || ped.telegramUrl;
      if (url && w && !w.closed) { try { w.opener = null; w.location.href = url; } catch (e) { w.close(); } } else if (w) w.close();
      await loadCred(); S.busy.pedCr = false;
      if (!/^panel\.creditos/.test(HH.currentHash())) HH.go('#panel.creditos'); else rerender();
      HH.toast('Pedido ' + (ped.codigo || '') + ' creado. Mandanos el mensaje por WhatsApp para pagarlo.', { type: 'ok', ms: 6000 });
    } catch (e) { if (w) w.close(); S.busy.pedCr = false; rerender(); HH.toast(e.message, { type: 'danger', ms: 6000 }); }
  }
  function comprobante(id) {
    HH.modal({ title: 'Adjuntar comprobante', body: `<div class="stack">
        <p class="small muted">Si ya pagaste, mandanos el comprobante: así lo confirmamos más rápido. También podés mandarlo por WhatsApp.</p>
        <div class="field"><label for="spCompFile">Comprobante <span class="muted" style="font-weight:500">(foto o PDF, hasta 8 MB)</span></label><input class="input" id="spCompFile" type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"></div>
        <div class="field"><label for="spCompNota">Nota <span class="muted" style="font-weight:500">(opcional)</span></label><input class="input" id="spCompNota" maxlength="300" placeholder="Pagué desde la cuenta de…"></div>
      </div>`, actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: 'Enviar', onClick: async (btn) => {
        const f = document.getElementById('spCompFile').files[0]; const nota = document.getElementById('spCompNota').value.trim();
        if (!f && !nota) { HH.toast('Adjuntá el comprobante (o escribí una nota).', { type: 'warn' }); return; }
        if (btn) btn.disabled = true;
        try {
          const fd = new FormData(); if (f) fd.append('comprobante', f); if (nota) fd.append('nota', nota);
          await upload('/cuenta/creditos/pedidos/' + encodeURIComponent(id) + '/comprobante', fd);
          HH.closeModal(); await loadCred(); HH.toast('Recibimos tu comprobante. Te avisamos cuando acreditemos los créditos.', { type: 'ok' }); rerender();
        } catch (e) { if (btn) btn.disabled = false; HH.toast(e.message, { type: 'danger' }); }
      } }] });
  }
  async function comprarPlan(plan, periodo, btn) {
    if (btn) btn.disabled = true;
    try {
      const r = await api('POST', '/cuenta/plan/comprar', { plan, periodo });
      HH.closeModal(); syncSaldo(r.saldo);
      const nom = HH.planName(plan);
      const msg = { nuevo: 'Listo: activaste ' + nom + '.', renovacion_anticipada: 'Listo: sumaste 30 días de ' + nom + '.', subida: 'Listo: pasaste a ' + nom + '.', semana: 'Listo: activaste una semana de ' + nom + '.', subida_temporal: 'Listo: subiste a ' + nom + ' por 7 días.' }[r.tipo] || 'Listo.';
      S.dest = null; await loadPlanes(); await afterYoChange('');
      HH.toast(msg + (r.reanudado ? ' Tu perfil vuelve a verse.' : '') + (r.devueltoDestacado && cents(r.devueltoDestacado) > 0 ? ' Te devolvimos ' + fmtCr(r.devueltoDestacado) + ' créditos del Destacado.' : ''), { type: 'ok', ms: 6000 });
    } catch (e) {
      if (btn) btn.disabled = false;
      HH.closeModal(); errCompra(e);
      if (e.status === 409 || e.status === 402) { await loadPlanes(); rerender(); }
    }
  }
  async function destacar(dias, desde, btn) {
    if (btn) btn.disabled = true; S.busy.dest = true;
    try {
      const r = await api('POST', '/cuenta/destacado', desde ? { dias, desde } : { dias });
      HH.closeModal(); syncSaldo(r.saldo); await loadDest(); S.busy.dest = false; await afterYoChange('');
      const d = r.destacado || {};
      HH.toast(d.estado === 'programado' ? 'Reservaste el Destacado desde el ' + fHora(d.desde) + '.' : 'Tu perfil está Destacado hasta el ' + fHora(d.hasta) + '.', { type: 'ok', ms: 6000 });
    } catch (e) {
      S.busy.dest = false; if (btn) btn.disabled = false;
      const dd = e.data || {};
      if (e.status === 409 && dd.codigo === 'cupo_lleno' && dd.proximaFechaLibre) {
        HH.closeModal();
        HH.modal({ title: 'El Destacado está completo', body: `<div class="stack"><p class="small">Los lugares destacados de tu plan en tu provincia están ocupados en esas fechas. Podés reservar la próxima fecha libre: se cobra ahora y empieza ese día.</p><div class="sp-amount"><span class="small muted">Próxima fecha libre</span><strong>${esc(fHora(dd.proximaFechaLibre))}</strong></div></div>`, actions: [{ label: 'Ahora no', cls: 'ghost', action: 'closeModal' }, { label: 'Reservar esa fecha', onClick: (b) => destacar(dias, dd.proximaFechaLibre, b) }] });
        await loadDest(); rerender(); return;
      }
      HH.closeModal(); errCompra(e); await loadDest(); rerender();
    }
  }

  /* ---------- Arranque ---------- */
  HH.boot = function () {
    if (HH._booted) return; HH._booted = true;
    HH.db = null; HH.session = null;
    HH.setTheme();
    HH.render();
    Promise.all([loadEstado(), loadYo(true), HH.lang !== 'es' ? cargarDict() : null]).then(() => {
      addSelfToDb();
      HH.renderShell(); HH.render();
      if (HH.lang !== 'es' && HH.translateNode) HH.translateNode(document.body);  // lo que se dibujó antes de tener el diccionario
      if (S.estadoErr) HH.toast(S.estadoErr, { type: 'danger' });
      HH.autoLocate();
    });
  };

  /* ---------- Tarjetas grandes (foto a todo el ancho, nombre y zona abajo) + clip de 5 s + favoritos ---------- */
  // Las grillas del MVP arman <a class="pcard">; acá se reemplazan por la tarjeta nueva (sin tocar el código de la demo).
  const PREVIEW_PLANES = new Set(['D', 'C', 'S']);
  // La demo (/demo/) comparte el dominio: sus favoritos (perfiles ficticios) van aparte
  const FAV_KEY = window.HH_DEMO ? 'sr_demo_favs' : 'sr_favs';
  const favs = () => { try { const a = JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []; } catch (e) { return S.favMem || []; } };
  const setFavs = (a) => { S.favMem = a; try { localStorage.setItem(FAV_KEY, JSON.stringify(a)); } catch (e) { /* sin almacenamiento: queda en memoria */ } };
  const esFav = (id) => favs().includes(id);
  HH.spFavs = favs;
  const sinMovimiento = () => {
    try { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true; } catch (e) { /* */ }
    // Clips de las tarjetas solo con conexión rápida: no con ahorro de datos ni en 2G/3G
    const c = navigator.connection; return !!(c && (c.saveData || /(^|-)(2g|3g)$/.test(c.effectiveType || '')));
  };
  const tripCard = (p) => {
    const a = HH.activeTrip && HH.activeTrip(p); const u = !a && HH.upcomingTrip && HH.upcomingTrip(p); if (!a && !u) return '';
    const l1 = a ? 'De visita' : `<span data-noi18n>${esc(u.city)}</span>`;
    const l2 = a ? 'hasta el ' + HH.fmtDay(a.to) : 'desde el ' + HH.fmtDay(u.from);
    return `<div class="pc2-trip ${a ? 'info' : 'warn'}"><span>${l1}</span><span>${l2}</span></div>`;
  };
  const imgIO = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const im = en.target; imgIO.unobserve(im);
      if (im.dataset.srcset) { im.srcset = im.dataset.srcset; im.removeAttribute('data-srcset'); }
      if (im.dataset.src) { im.src = im.dataset.src; im.removeAttribute('data-src'); }
    });
  }, { rootMargin: '600px 400px' }) : null;
  // En las filas con desplazamiento lateral el margen no alcanza (las recorta la fila): al primer movimiento se piden todas
  const cargarFila = (ev) => {
    const fila = ev.target; if (!fila || fila.nodeType !== 1 || fila === document.documentElement || fila === document.body || fila.dataset.lzAll) return;  // solo filas, no la página
    const ims = fila.querySelectorAll('.pc2 img[data-src]'); if (!ims.length) return;
    fila.dataset.lzAll = '1';
    ims.forEach((im) => { if (imgIO) imgIO.unobserve(im); if (im.dataset.srcset) { im.srcset = im.dataset.srcset; im.removeAttribute('data-srcset'); } im.src = im.dataset.src; im.removeAttribute('data-src'); });
  };
  if (imgIO) { document.addEventListener('scroll', cargarFila, { capture: true, passive: true }); document.addEventListener('touchstart', (ev) => { const f = ev.target && ev.target.closest && ev.target.closest('.pub-hscroll'); if (f) cargarFila({ target: f }); }, { capture: true, passive: true }); }
  function card2(p, eager) {
    const mini = (p.photosMini || [])[0]; const grande = (p.photos || [])[0];
    // La miniatura (480 px) alcanza para las tarjetas chicas; las grandes piden la foto completa en pantallas densas.
    // Las que no van primero se piden cuando están por entrar en pantalla (IntersectionObserver, después del primer
    // dibujo): así no le sacan ancho de banda al JS ni a las fotos de arriba en conexiones lentas.
    const pre = !eager && imgIO ? 'data-' : '';
    const img = HH.isImgSrc(grande) ? `<img ${pre}src="${esc(mini || grande)}"${mini && mini !== grande ? ` ${pre}srcset="${esc(mini)} 480w, ${esc(grande)} 1200w" sizes="(min-width:1100px) 22vw, (min-width:720px) 30vw, 48vw"` : ''} alt=""${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">` : HH.photo(p, 0, { noWm: true });
    const vid = p.previewUrl && PREVIEW_PLANES.has(HH.levelOf(p.userId)) && !sinMovimiento()
      ? `<video class="pc2-vid" muted loop playsinline preload="none" disablepictureinpicture tabindex="-1" aria-hidden="true" data-src="${esc(p.previewUrl)}"></video>` : '';
    const lugar = p.zone || p.city || '';
    const fav = esFav(p.userId);
    // Destacado: variante A (arriba del nombre) o B (pastilla arriba a la izquierda). HH.BADGE_DESTACADO permite probar la otra.
    const dest = esDest(p); const varB = (HH.BADGE_DESTACADO || BADGE_DESTACADO) === 'B';
    return `<div class="pc2" data-pc2="${esc(p.userId)}">
      <a class="pc2-link" href="#perfil.${esc(p.slug)}" data-go="#perfil.${esc(p.slug)}" data-imp="${esc(p.userId)}" aria-label="Ver perfil de ${esc(p.displayName)}">
        <div class="pc2-media">${img}${vid}</div>
        ${p.verified === 'verified' ? `<span class="pc2-ver" title="Verificada">${icon('check')}</span>` : ''}
        ${HH.isStar(p.userId) ? `<span class="pc2-starb">${icon('star')} Star</span>` : ''}
        ${dest && varB ? `<span class="pc2-destb${p.verified === 'verified' ? '' : ' sinver'}">${icon('sparkles')}<span>Destacado</span></span>` : ''}
        <div class="pc2-info">${dest && !varB ? `<span class="pc2-dest">${icon('sparkles')}<span>Destacado</span></span>` : ''}<div class="pc2-name" data-noi18n>${esc(p.displayName)}</div>${lugar ? `<div class="pc2-loc" data-noi18n>${esc(lugar)}</div>` : ''}${tripCard(p)}</div>
      </a>
      <button type="button" class="pc2-fav${fav ? ' on' : ''}" data-action="spFav" data-id="${esc(p.userId)}" aria-pressed="${fav}" aria-label="${fav ? 'Sacar de favoritos' : 'Guardar en favoritos'}" title="Favoritos">${icon('star')}</button>
    </div>`;
  }
  function upgradeCards(root) {
    if (!root || !root.querySelectorAll || !HH.db) return;
    // Las primeras tarjetas de la página (arriba de todo) cargan con prioridad: suelen ser lo más grande que se ve.
    let n = root.querySelectorAll('.pc2').length;
    root.querySelectorAll('a.pcard[data-imp]').forEach((a) => {
      if (a.closest('.hero-cards')) return;
      const p = HH.profileOf(a.dataset.imp); if (!p) return;
      const t = document.createElement('template'); t.innerHTML = card2(p, n++ < 2).trim();
      const el = t.content.firstElementChild;
      if (HH.linkify) HH.linkify(el);
      a.replaceWith(el);
    });
    root.querySelectorAll('video.pc2-vid:not([data-io])').forEach((v) => { v.dataset.io = '1'; if (io) io.observe(v); });
    if (imgIO) root.querySelectorAll('.pc2 img[data-src]:not([data-lz])').forEach((im) => { im.dataset.lz = '1'; imgIO.observe(im); });
  }
  // Solo se reproducen los clips de las tarjetas visibles (máximo 4 a la vez); el resto muestra la foto.
  const MAX_PLAY = 4;
  const playing = new Set();
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      const v = en.target;
      if (en.isIntersecting && en.intersectionRatio >= 0.6) {
        if (playing.size >= MAX_PLAY && !playing.has(v)) return;
        if (!v.src && v.dataset.src) { v.src = v.dataset.src; }
        playing.add(v);
        const pr = v.play(); if (pr && pr.catch) pr.catch(() => { playing.delete(v); });
      } else if (playing.has(v) || !v.paused) { v.pause(); playing.delete(v); }
    });
  }, { threshold: [0, 0.6] }) : null;
  document.addEventListener('playing', (ev) => { const v = ev.target; if (v && v.classList && v.classList.contains('pc2-vid')) v.classList.add('on'); }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) playing.forEach((v) => v.pause()); });
  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches('a.pcard') || n.querySelector('a.pcard'))) { upgradeCards(document.getElementById('app')); return; }
    // tarjetas que salen de la página: soltar sus clips
    playing.forEach((v) => { if (!v.isConnected) playing.delete(v); });
  }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('hh:rendered', () => { playing.forEach((v) => { if (!v.isConnected) playing.delete(v); }); upgradeCards(document.getElementById('app')); });

  // Favoritos (se guardan en este dispositivo; los visitantes no tienen cuenta)
  // "Tu espacio" (/favoritos): el ícono de usuario de la barra. Favoritos del dispositivo + ingreso y publicar para acompañantes.
  function favView() {
    const ids = favs();
    const lista = (HH.publishedProfiles ? HH.publishedProfiles() : []).filter((p) => ids.includes(p.userId));
    const guardados = ids.length - lista.length;
    const cuenta = S.yo
      ? `<div class="sp-esp-card"><div class="grow"><strong>Mi cuenta</strong><span class="small muted">Tu perfil, tus fotos y tu plan.</span></div><a class="btn sm" href="#panel" data-go="#panel">${icon('dashboard')} Mi panel</a></div>`
      : `<div class="sp-esp-card"><div class="grow"><strong>¿Sos acompañante?</strong><span class="small muted">Publicá tu perfil o entrá a tu cuenta.</span></div><div class="sp-esp-btns"><a class="btn sm" href="#registro" data-go="#registro">Publicá tu perfil</a><a class="btn secondary sm" href="#login" data-go="#login">Ingresar</a></div></div>`;
    return `<div class="container section">
      <h2 style="margin-bottom:14px">Tu espacio</h2>
      ${HH.spClientes ? HH.spClientes.espacio() : ''}
      ${cuenta}
      <div class="row between" style="align-items:flex-end;margin:22px 0 14px"><div><h3>${icon('star')} Tus favoritos</h3><p class="small muted" style="margin-top:4px">Se guardan en este dispositivo. Tocá la estrella de una tarjeta para sumarla o sacarla.</p></div></div>
      ${lista.length ? `<div class="tier-grid lg pc2-favgrid">${lista.map((p) => HH.pcard(p)).join('')}</div>` : `<div class="empty">${icon('star')}<h4>Todavía no guardaste favoritos</h4><p class="small">Tocá la estrella de una tarjeta para guardarla acá.</p><a class="btn" href="#inicio" data-go="#inicio">Explorar perfiles</a></div>`}
      ${guardados > 0 ? `<p class="small muted" style="margin-top:12px">${guardados === 1 ? 'Un perfil que guardaste ya no está publicado.' : `<span>${guardados}</span> <span>perfiles que guardaste ya no están publicados.</span>`}</p>` : ''}
    </div>`;
  }
  // Dirección propia: /favoritos (/en/favorites, /pt/favoritos)
  const urlOf0 = HH.urlOf;
  HH.urlOf = function (key, lang) {
    const k = String(key || '').replace(/^#/, '');
    if (k === 'favoritos') { const l = lang || HH.lang || 'es'; return (l === 'es' ? '' : '/' + l) + '/' + (l === 'en' ? 'favorites' : 'favoritos'); }
    return urlOf0.apply(this, arguments);
  };
  const parseUrl0 = HH.parseUrl;
  HH.parseUrl = function (url) {
    const r = parseUrl0.apply(this, arguments);
    if (r && r.key === '404') {
      const segs = String(url || '/').split('#')[0].split('?')[0].split('/').filter(Boolean).map((x) => x.toLowerCase());
      const lang = segs[0] === 'en' || segs[0] === 'pt' ? segs.shift() : 'es';
      if (segs.length === 1 && (segs[0] === 'favoritos' || segs[0] === 'favorites')) return { key: 'favoritos', lang };
    }
    return r;
  };

  // Panel: video de la tarjeta (5 s, sin sonido; desde Plata)
  function panelPreview() {
    if (!S.yo || !S.yo.videosHabilitados) return '';
    const listos = (S.yo.perfil.videos || []).filter((v) => v.estado === 'listo');
    if (!listos.length) return '';
    const pv = S.yo.perfil.preview;
    const titulo = `<div><div class="card-title">Video de tu tarjeta</div><div class="small muted">5 segundos sin sonido que se reproducen en tu tarjeta del inicio y de las páginas de tu ciudad.</div></div>`;
    if (!S.yo.previewHabilitado) {
      return `<div class="card stack pv-card" style="gap:12px;margin-top:14px" id="spPreview">
        <div class="row between">${titulo}<span class="badge neutral">${icon('lock')} Disponible desde Plata</span></div>
        <p class="small">Con el plan Plata o más alto, tu tarjeta muestra unos segundos de uno de tus videos y llama más la atención.</p>
        <div><a class="btn sm" href="#panel.plan" data-go="#panel.plan">${icon('card')} Ver planes</a></div>
      </div>`;
    }
    if (!S.pv || !listos.some((v) => v.id === S.pv.videoId)) S.pv = { videoId: pv && pv.videoId && listos.some((v) => v.id === pv.videoId) ? pv.videoId : listos[0].id, inicio: pv && pv.videoId ? Number(pv.inicio) || 0 : 0 };
    const sel = listos.find((v) => v.id === S.pv.videoId) || listos[0];
    const max = Math.max(0, Math.floor(((Number(sel.segundos) || 0) - 5) * 10) / 10);
    if (S.pv.inicio > max) S.pv.inicio = max;
    const estado = !pv ? '' : pv.estado === 'procesando' ? `<div class="sp-vstate"><span class="sp-spin" aria-hidden="true"></span><span>Procesando…</span></div>`
      : pv.estado === 'error' ? `<div class="sp-vstate err">${icon('alert')}<span data-noi18n>${esc(pv.error || 'No se pudo armar el clip.')}</span></div>` : '';
    const actual = pv && pv.url ? `<video src="${esc(pv.url)}" muted loop playsinline autoplay preload="metadata" disablepictureinpicture></video>` : `<div class="ph" style="background:${HH.hueGradient(hash(S.yo.id) % 360, true)}">${icon('video')}</div>`;
    const fmt = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
    return `<div class="card stack pv-card" style="gap:14px;margin-top:14px" id="spPreview">
      <div class="row between">${titulo}${pv ? `<span class="badge ${pv.elegido ? 'ok' : 'neutral'}">${pv.elegido ? 'Elegido por vos' : 'Automático'}</span>` : ''}</div>
      <div class="pv-frames">
        <div class="pv-col"><span class="label">Así se ve ahora</span><div class="pv-frame">${actual}${estado}</div></div>
        <div class="pv-col"><span class="label">Tu recorte</span><div class="pv-frame"><video id="spPvVid" src="${esc(sel.url)}" muted playsinline preload="metadata" disablepictureinpicture></video></div></div>
      </div>
      <div class="pv-col pv-edit">
        ${listos.length > 1 ? `<span class="label">Elegí el video</span>
        <div class="pv-vids">${listos.map((v) => `<button type="button" class="pv-v${v.id === sel.id ? ' on' : ''}" data-action="spPvVideo" data-id="${esc(v.id)}" aria-pressed="${v.id === sel.id}" aria-label="Usar este video">${v.poster ? `<img src="${esc(v.poster)}" alt="" loading="lazy">` : icon('video')}<span>${Math.round(Number(v.segundos) || 0)}s</span></button>`).join('')}</div>` : ''}
        <label class="label" for="spPvRange">Desde qué segundo</label>
        ${max > 0 ? `<input type="range" class="pv-range" id="spPvRange" min="0" max="${max}" step="0.5" value="${S.pv.inicio}" data-input="spPvInicio">` : `<p class="small muted">Este video dura menos de 5 segundos: se usa completo.</p>`}
        <div class="small" id="spPvTxt">Del segundo <strong class="num" id="spPvA">${fmt(S.pv.inicio)}</strong> al <strong class="num" id="spPvB">${fmt(Math.min(S.pv.inicio + 5, Number(sel.segundos) || 5))}</strong></div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button type="button" class="btn sm" data-action="spPvGuardar"${S.busy.pv ? ' disabled' : ''}>${icon('check')} Guardar clip</button>
          ${pv && pv.elegido ? `<button type="button" class="btn ghost sm" data-action="spPvAuto"${S.busy.pv ? ' disabled' : ''}>Usar automático</button>` : ''}
        </div>
      </div>
    </div>`;
  }
  // Vista previa en vivo: el video del editor repite la ventana de 5 s elegida
  function montarPreview() {
    const v = document.getElementById('spPvVid'); if (!v || v.dataset.mounted) return; v.dataset.mounted = '1';
    const ir = () => { try { v.currentTime = S.pv ? S.pv.inicio : 0; } catch (e) { /* */ } const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); };
    v.addEventListener('loadedmetadata', ir);
    v.addEventListener('timeupdate', () => { const a = S.pv ? S.pv.inicio : 0; if (v.currentTime >= a + 5 || v.currentTime < a - 0.3) { try { v.currentTime = a; } catch (e) { /* */ } } });
    v.addEventListener('ended', ir);
  }
  document.addEventListener('hh:rendered', () => setTimeout(montarPreview, 0));
  Object.assign(HH.actions, {
    spFav(el) {
      const id = el.dataset.id; const a = favs(); const on = !a.includes(id);
      setFavs(on ? a.concat([id]) : a.filter((x) => x !== id));
      const sel = CSS.escape ? CSS.escape(id) : id;
      document.querySelectorAll(`.pc2-fav[data-id="${sel}"], .sh-fav[data-id="${sel}"]`).forEach((b) => {
        b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', on ? 'Sacar de favoritos' : 'Guardar en favoritos');
        b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
      });
      HH.toast(on ? 'Guardado en favoritos' : 'Sacado de favoritos', { type: on ? 'ok' : '' });
      if (HH.currentHash() === 'favoritos' && !on) setTimeout(() => HH.refresh(), 250);
    },
    spPvVideo(el) { S.pv = { videoId: el.dataset.id, inicio: 0 }; rerender(); },
    spPvInicio(el) {
      const v = Math.max(0, Number(el.value) || 0); if (!S.pv) return; S.pv.inicio = v;
      const sel = (S.yo.perfil.videos || []).find((x) => x.id === S.pv.videoId);
      const fmt = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
      const a = document.getElementById('spPvA'); const b = document.getElementById('spPvB');
      if (a) a.textContent = fmt(v); if (b) b.textContent = fmt(Math.min(v + 5, (sel && Number(sel.segundos)) || v + 5));
      const vid = document.getElementById('spPvVid'); if (vid) { try { vid.currentTime = v; } catch (e) { /* */ } const pr = vid.play(); if (pr && pr.catch) pr.catch(() => {}); }
    },
    async spPvGuardar() {
      if (!S.pv || S.busy.pv) return; S.busy.pv = true; rerender();
      try { await api('PUT', '/cuenta/preview', { videoId: S.pv.videoId, inicio: S.pv.inicio }); S.busy.pv = false; await afterYoChange('Estamos armando el clip de tu tarjeta.'); }
      catch (e) { S.busy.pv = false; rerender(); HH.toast(e.message, { type: 'danger' }); }
      vigilarVideos();
    },
    async spPvAuto() {
      if (S.busy.pv) return; S.busy.pv = true; rerender();
      try { await api('DELETE', '/cuenta/preview'); S.busy.pv = false; S.pv = null; await afterYoChange('Volvimos al clip automático.'); }
      catch (e) { S.busy.pv = false; rerender(); HH.toast(e.message, { type: 'danger' }); }
      vigilarVideos();
    },
  });
  Object.assign(HH.I18N, {
    // Historias en video
    'Foto o video': ['Photo or video', 'Foto ou vídeo'],
    'Videos de hasta 60 segundos y 95 MB.': ['Videos up to 60 seconds and 95 MB.', 'Vídeos de até 60 segundos e 95 MB.'],
    'Elegí una foto o un video.': ['Choose a photo or a video.', 'Escolha uma foto ou um vídeo.'],
    'El video dura {n} s. Hasta 60 segundos.': ['The video is {n} s long. Up to 60 seconds.', 'O vídeo dura {n} s. Até 60 segundos.'],
    'Recibimos el video. Se publica apenas termine de procesarse.': ['We got your video. It goes live as soon as it finishes processing.', 'Recebemos o vídeo. Ele é publicado assim que terminar de ser processado.'],
    'Favoritos': ['Favorites', 'Favoritos'], 'Tus favoritos': ['Your favorites', 'Seus favoritos'],
    'Mi cuenta': ['My account', 'Minha conta'], 'Tu perfil, tus fotos y tu plan.': ['Your profile, your photos and your plan.', 'Seu perfil, suas fotos e seu plano.'],
    '¿Sos acompañante?': ['Are you a companion?', 'Você é acompanhante?'], 'Publicá tu perfil o entrá a tu cuenta.': ['Publish your profile or log in to your account.', 'Publique seu perfil ou entre na sua conta.'],
    'Se guardan en este dispositivo. Tocá la estrella de una tarjeta para sumarla o sacarla.': ['They are saved on this device. Tap the star on a card to add or remove it.', 'Ficam salvos neste dispositivo. Toque na estrela de um card para adicionar ou remover.'],
    'Todavía no guardaste favoritos': ['You have not saved any favorites yet', 'Você ainda não salvou favoritos'],
    'Tocá la estrella de una tarjeta para guardarla acá.': ['Tap the star on a card to save it here.', 'Toque na estrela de um card para salvá-lo aqui.'],
    'Explorar perfiles': ['Browse profiles', 'Ver perfis'],
    'Un perfil que guardaste ya no está publicado.': ['A profile you saved is no longer published.', 'Um perfil que você salvou não está mais publicado.'],
    'perfiles que guardaste ya no están publicados.': ['profiles you saved are no longer published.', 'perfis que você salvou não estão mais publicados.'],
    'Guardado en favoritos': ['Saved to favorites', 'Salvo nos favoritos'], 'Sacado de favoritos': ['Removed from favorites', 'Removido dos favoritos'],
    'Guardar en favoritos': ['Save to favorites', 'Salvar nos favoritos'], 'Sacar de favoritos': ['Remove from favorites', 'Remover dos favoritos'],
    'Ver perfil de {x}': ['View profile of {x}', 'Ver perfil de {x}'], 'Verificada': ['Verified', 'Verificada'],
    'De visita': ['Visiting', 'De visita'], 'hasta el {x}': ['until {x}', 'até {x}'], 'desde el {x}': ['from {x}', 'a partir de {x}'],
    'Video de tu tarjeta': ['Your card video', 'Vídeo do seu card'],
    '5 segundos sin sonido que se reproducen en tu tarjeta del inicio y de las páginas de tu ciudad.': ['5 silent seconds that play on your card on the home page and your city pages.', '5 segundos sem som que tocam no seu card no início e nas páginas da sua cidade.'],
    'Ver planes': ['See plans', 'Ver planos'], 'Elegido por vos': ['Chosen by you', 'Escolhido por você'], 'Automático': ['Automatic', 'Automático'],
    'Así se ve ahora': ['How it looks now', 'Como aparece agora'], 'Elegí el video': ['Choose the video', 'Escolha o vídeo'], 'Desde qué segundo': ['Starting second', 'A partir de qual segundo'], 'Tu recorte': ['Your cut', 'Seu recorte'],
    'Usar este video': ['Use this video', 'Usar este vídeo'], 'Segundo de inicio': ['Start second', 'Segundo inicial'],
    'Este video dura menos de 5 segundos: se usa completo.': ['This video is shorter than 5 seconds: it is used in full.', 'Este vídeo tem menos de 5 segundos: é usado inteiro.'],
    'Del segundo {x} al {x}': ['From second {x} to {x}', 'Do segundo {x} ao {x}'], 'Guardar clip': ['Save clip', 'Salvar clipe'], 'Usar automático': ['Use automatic', 'Usar automático'],
    'Estamos armando el clip de tu tarjeta.': ['We are making your card clip.', 'Estamos montando o clipe do seu card.'], 'Volvimos al clip automático.': ['Back to the automatic clip.', 'Voltamos ao clipe automático.'],
    'No se pudo armar el clip.': ['The clip could not be made.', 'Não foi possível montar o clipe.'],
  });
  /* ---------- Planes v2: textos en inglés y portugués ---------- */
  (function () {
    // {P} y {Q} = nombre de un plan (se traduce: Plata → Silver/Prata); se arma una entrada por cada plan
    const PN = { Bronce: ['Bronze', 'Bronze'], Plata: ['Silver', 'Prata'], Oro: ['Gold', 'Ouro'], Star: ['Star', 'Star'] };
    const out = {};
    const add = (es, en, pt) => {
      const ps = /\{P\}/.test(es) ? Object.keys(PN) : [null]; const qs = /\{Q\}/.test(es) ? Object.keys(PN) : [null];
      ps.forEach((p) => qs.forEach((q) => {
        const r = (t, i) => t.replace(/\{P\}/g, p ? (i < 0 ? p : PN[p][i]) : '{P}').replace(/\{Q\}/g, q ? (i < 0 ? q : PN[q][i]) : '{Q}');
        out[r(es, -1)] = [r(en, 0), r(pt, 1)];
      }));
    };
    [
      // Planes
      ['Tu perfil publicado y verificado, gratis.', 'Your profile published and verified, for free.', 'Seu perfil publicado e verificado, grátis.'],
      ['Más fotos, hasta 3 historias por día y el clip de 5 segundos en tu tarjeta.', 'More photos, up to 3 stories per day and the 5-second clip on your card.', 'Mais fotos, até 3 stories por dia e o clipe de 5 segundos no seu card.'],
      ['Más arriba en el inicio, tarjetas más grandes, fotos e historias casi sin límite.', 'Higher on the home page, bigger cards, photos and stories with almost no limit.', 'Mais acima no início, cards maiores, fotos e stories quase sem limite.'],
      ['Lugar fijo arriba del inicio en tu provincia. Solo 10 por provincia.', 'Fixed spot at the top of the home page in your province. Only 10 per province.', 'Lugar fixo no topo do início na sua província. Só 10 por província.'],
      ['Precio por mes, en créditos (1 crédito = 1 dólar). Oro y Star también se pueden pagar por semana. Los créditos se compran por WhatsApp.', 'Price per month, in credits (1 credit = 1 US dollar). Gold and Star can also be paid by the week. Credits are bought on WhatsApp.', 'Preço por mês, em créditos (1 crédito = 1 dólar). Ouro e Star também podem ser pagos por semana. Os créditos são comprados pelo WhatsApp.'],
      ['Las salidas se cancelan con quien las acordaste, por WhatsApp y con tiempo. Las acompañantes pagan su plan con créditos, por mes o por semana; la renovación automática del plan mensual se apaga cuando quieran desde su panel.', 'Outings are canceled with the person you arranged them with, on WhatsApp and in advance. Companions pay their plan with credits, by the month or by the week; the monthly plan auto-renewal can be turned off anytime from their dashboard.', 'Os passeios são cancelados com quem você combinou, pelo WhatsApp e com antecedência. As acompanhantes pagam o plano com créditos, por mês ou por semana; a renovação automática do plano mensal pode ser desligada quando quiserem no painel.'],
      ['Tu plan', 'Your plan', 'Seu plano'], 'Plan actual', ['Gratis', 'Free', 'Grátis'],
      ['Pagás con créditos. El plan por mes se renueva solo si te alcanzan los créditos; lo podés apagar cuando quieras. Una semana de un plan más alto te sube 7 días y después volvés solo a tu plan.', 'You pay with credits. The monthly plan renews automatically if you have enough credits; you can turn that off anytime. A week of a higher plan moves you up for 7 days and then you go back to your plan automatically.', 'Você paga com créditos. O plano mensal se renova sozinho se os créditos forem suficientes; dá para desligar quando quiser. Uma semana de um plano mais alto te sobe por 7 dias e depois você volta sozinha ao seu plano.'],
      ['por mes', 'monthly', 'mensal'], ['Hasta el {x}', 'Until {x}', 'Até {x}'], ['Del {x} al {x}', 'From {x} to {x}', 'De {x} a {x}'],
      ['Renovación automática', 'Auto-renewal', 'Renovação automática'], ['Encendida.', 'On.', 'Ligada.'],
      ['Se renueva el {x} por {n} créditos.', 'Renews on {x} for {n} credits.', 'Renova em {x} por {n} créditos.'],
      ['Te faltan {n} créditos.', 'You are {n} credits short.', 'Faltam {n} créditos.'],
      ['Apagada: el {x} pasás a Bronce.', 'Off: on {x} you move to Bronze.', 'Desligada: em {x} você passa para o Bronze.'],
      ['El {x} pasás a Bronce (gratis).', 'On {x} you move to Bronze (free).', 'Em {x} você passa para o Bronze (grátis).'],
      ['El {x} pasás a {P}.', 'On {x} you move to {P}.', 'Em {x} você passa para o {P}.'],
      ['Deshacer', 'Undo', 'Desfazer'], ['Después volvés a Bronce, gratis.', 'Then you go back to Bronze, for free.', 'Depois você volta ao Bronze, grátis.'],
      ['Tu plan actual', 'Your current plan', 'Seu plano atual'], ['Más elegido', 'Most popular', 'Mais escolhido'],
      ['Programado para el {x}', 'Scheduled for {x}', 'Programado para {x}'], ['Pasar a Bronce al vencer', 'Move to Bronze when it ends', 'Passar para o Bronze ao terminar'],
      ['Pasar a {P} al renovar', 'Move to {P} at renewal', 'Passar para o {P} na renovação'], ['Subir a {P}', 'Upgrade to {P}', 'Subir para o {P}'],
      ['Sumar 30 días · {n} créditos', 'Add 30 days · {n} credits', 'Somar 30 dias · {n} créditos'],
      ['Activar 1 mes · {n} créditos', 'Activate 1 month · {n} credits', 'Ativar 1 mês · {n} créditos'],
      ['1 semana · {n} créditos', '1 week · {n} credits', '1 semana · {n} créditos'],
      ['Subí a {P} por 7 días · {n} créditos', 'Upgrade to {P} for 7 days · {n} credits', 'Suba para o {P} por 7 dias · {n} créditos'],
      ['créditos / mes', 'credits / month', 'créditos / mês'], ['o {n} créditos por semana', 'or {n} credits per week', 'ou {n} créditos por semana'],
      ['Hasta {n} fotos y {n} videos', 'Up to {n} photos and {n} videos', 'Até {n} fotos e {n} vídeos'], ['Historias ilimitadas', 'Unlimited stories', 'Stories ilimitados'],
      ['1 historia por día', '1 story per day', '1 story por dia'], ['Hasta {n} historias por día', 'Up to {n} stories per day', 'Até {n} stories por dia'],
      ['Clip de 5 segundos en tu tarjeta', '5-second clip on your card', 'Clipe de 5 segundos no seu card'],
      ['Lugar fijo arriba de todo en tu provincia', 'Fixed spot at the very top in your province', 'Lugar fixo no topo da sua província'],
      ['Destacado: 1 crédito el día', 'Featured: 1 credit per day', 'Destaque: 1 crédito por dia'], ['Destacado: {n} créditos el día', 'Featured: {n} credits per day', 'Destaque: {n} créditos por dia'],
      ['Historial de planes', 'Plan history', 'Histórico de planos'], ['Vigente', 'Active', 'Vigente'], ['Vencida', 'Expired', 'Vencida'], ['Cancelada', 'Canceled', 'Cancelada'],
      ['{n} créditos', '{n} credits', '{n} créditos'],
      ['Tu perfil está pausado.', 'Your profile is paused.', 'Seu perfil está pausado.'],
      ['No alcanzaron los créditos para renovar {P} ({n} créditos). Cargá créditos y tu perfil vuelve a publicarse solo.', 'You did not have enough credits to renew {P} ({n} credits). Top up and your profile is published again automatically.', 'Os créditos não foram suficientes para renovar o {P} ({n} créditos). Carregue créditos e seu perfil volta a ser publicado sozinho.'],
      ['No pudimos renovar {P}: se renueva solo apenas cargues créditos.', 'We could not renew {P}: it renews automatically as soon as you top up.', 'Não conseguimos renovar o {P}: ele renova sozinho assim que você carregar créditos.'],
      ['Seguir gratis con Bronce', 'Continue for free with Bronze', 'Seguir grátis com o Bronze'], ['Cargar créditos', 'Top up credits', 'Carregar créditos'],
      ['Tu plan se renueva el {x} y te faltan {n} créditos.', 'Your plan renews on {x} and you are {n} credits short.', 'Seu plano renova em {x} e faltam {n} créditos.'],
      ['Si no alcanzan, tu perfil se pausa hasta que cargues.', 'If they are not enough, your profile is paused until you top up.', 'Se não forem suficientes, seu perfil fica pausado até você carregar.'],
      ['Tu perfil está pausado: no alcanzaron los créditos para renovar tu plan. Cargá créditos y vuelve a publicarse solo.', 'Your profile is paused: you did not have enough credits to renew your plan. Top up and it is published again automatically.', 'Seu perfil está pausado: os créditos não foram suficientes para renovar seu plano. Carregue créditos e ele volta a ser publicado sozinho.'],
      ['Tu perfil no se ve porque no alcanzaron los créditos para renovar tu plan.', 'Your profile is not shown because you did not have enough credits to renew your plan.', 'Seu perfil não aparece porque os créditos não foram suficientes para renovar seu plano.'],
      ['Tu saldo', 'Your balance', 'Seu saldo'], ['Tu saldo:', 'Your balance:', 'Seu saldo:'], ['Te quedan', 'Left after paying', 'Restam'], ['Te faltan', 'You are short', 'Faltam'],
      ['Cargá créditos y volvé a intentarlo.', 'Top up credits and try again.', 'Carregue créditos e tente de novo.'],
      ['No te alcanzan los créditos', 'Not enough credits', 'Créditos insuficientes'],
      ['Plan nuevo', 'New plan', 'Plano novo'], ['Sumás 30 días', 'You add 30 days', 'Você soma 30 dias'], ['Subida de plan', 'Plan upgrade', 'Upgrade de plano'], ['Semana', 'Week', 'Semana'], ['Subida por 7 días', '7-day upgrade', 'Upgrade por 7 dias'],
      ['Plan nuevo: {P}', 'New plan: {P}', 'Plano novo: {P}'], ['Sumás 30 días: {P}', 'You add 30 days: {P}', 'Você soma 30 dias: {P}'], ['Subida de plan: {P}', 'Plan upgrade: {P}', 'Upgrade de plano: {P}'], ['Semana: {P}', 'Week: {P}', 'Semana: {P}'], ['Subida por 7 días: {P}', '7-day upgrade: {P}', 'Upgrade por 7 dias: {P}'],
      ['Pagás solo la diferencia por los {n} días que le quedan a tu plan. Termina el mismo día que tu plan actual y después se renueva como {P}.', 'You only pay the difference for the {n} days left on your plan. It ends on the same day as your current plan and then renews as {P}.', 'Você paga só a diferença pelos {n} dias que restam do seu plano. Termina no mesmo dia do seu plano atual e depois renova como {P}.'],
      ['Son 7 días. Después volvés solo a tu plan.', 'It is 7 days. Then you go back to your plan automatically.', 'São 7 dias. Depois você volta sozinha ao seu plano.'],
      ['Son 30 días con renovación automática (la podés apagar cuando quieras).', 'It is 30 days with auto-renewal (you can turn it off anytime).', 'São 30 dias com renovação automática (dá para desligar quando quiser).'],
      ['Pagar {n} créditos', 'Pay {n} credits', 'Pagar {n} créditos'], ['Cerrar', 'Close', 'Fechar'], ['Programar', 'Schedule', 'Programar'], ['Apagar', 'Turn off', 'Desligar'],
      ['Apagar la renovación automática', 'Turn off auto-renewal', 'Desligar a renovação automática'],
      ['Tu plan sigue hasta el {x}. Después pasás a Bronce, gratis.', 'Your plan continues until {x}. Then you move to Bronze, for free.', 'Seu plano continua até {x}. Depois você passa para o Bronze, grátis.'],
      ['Pasás a Bronce, gratis.', 'You move to Bronze, for free.', 'Você passa para o Bronze, grátis.'], ['Pasar a {P}', 'Move to {P}', 'Passar para o {P}'],
      ['Tu plan {P} sigue hasta el {x}. Después pasás a Bronce, gratis, y no se cobra nada más.', 'Your {P} plan continues until {x}. Then you move to Bronze, for free, and nothing else is charged.', 'Seu plano {P} continua até {x}. Depois você passa para o Bronze, grátis, e nada mais é cobrado.'],
      ['Tu plan {P} sigue hasta el {x}. Desde ese día se renueva como {Q}, por {n} créditos por mes.', 'Your {P} plan continues until {x}. From that day it renews as {Q}, for {n} credits per month.', 'Seu plano {P} continua até {x}. A partir desse dia renova como {Q}, por {n} créditos por mês.'],
      ['Renovación automática encendida.', 'Auto-renewal turned on.', 'Renovação automática ligada.'], ['Renovación automática apagada.', 'Auto-renewal turned off.', 'Renovação automática desligada.'],
      ['Listo: seguís con Bronce y tu perfil vuelve a verse.', 'Done: you continue with Bronze and your profile is visible again.', 'Pronto: você segue com o Bronze e seu perfil volta a aparecer.'],
      ['Cambio programado.', 'Change scheduled.', 'Mudança programada.'], ['Listo, se renueva el mismo plan.', 'Done, the same plan will renew.', 'Pronto, o mesmo plano será renovado.'],
      ['Listo: activaste {P}.', 'Done: you activated {P}.', 'Pronto: você ativou o {P}.'], ['Listo: sumaste 30 días de {P}.', 'Done: you added 30 days of {P}.', 'Pronto: você somou 30 dias de {P}.'],
      ['Listo: pasaste a {P}.', 'Done: you moved to {P}.', 'Pronto: você passou para o {P}.'], ['Listo: activaste una semana de {P}.', 'Done: you activated a week of {P}.', 'Pronto: você ativou uma semana de {P}.'],
      ['Listo: subiste a {P} por 7 días.', 'Done: you moved up to {P} for 7 days.', 'Pronto: você subiu para o {P} por 7 dias.'],
      ['Listo: activaste {P}. Tu perfil vuelve a verse.', 'Done: you activated {P}. Your profile is visible again.', 'Pronto: você ativou o {P}. Seu perfil volta a aparecer.'],
      ['Listo: sumaste 30 días de {P}. Tu perfil vuelve a verse.', 'Done: you added 30 days of {P}. Your profile is visible again.', 'Pronto: você somou 30 dias de {P}. Seu perfil volta a aparecer.'],
      ['Listo: pasaste a {P}. Te devolvimos {n} créditos del Destacado.', 'Done: you moved to {P}. We refunded {n} credits from your Featured spot.', 'Pronto: você passou para o {P}. Devolvemos {n} créditos do Destaque.'],
      // Créditos
      ['Créditos', 'Credits', 'Créditos'], ['créditos', 'credits', 'créditos'], ['Tus créditos', 'Your credits', 'Seus créditos'],
      ['Con créditos pagás tu plan, las semanas y el Destacado. 1 crédito = 1 dólar.', 'With credits you pay for your plan, weeks and Featured. 1 credit = 1 US dollar.', 'Com créditos você paga seu plano, as semanas e o Destaque. 1 crédito = 1 dólar.'],
      ['Saldo disponible', 'Available balance', 'Saldo disponível'], ['Pagar mi plan', 'Pay my plan', 'Pagar meu plano'],
      ['Comprar créditos', 'Buy credits', 'Comprar créditos'],
      ['Elegí un pack: te abrimos WhatsApp con el pedido armado y te respondemos con el monto en pesos y cómo pagar. Cuando confirmamos el pago, los créditos se acreditan en tu cuenta.', 'Choose a pack: we open WhatsApp with your order ready and reply with the amount in pesos and how to pay. Once we confirm the payment, the credits are added to your account.', 'Escolha um pacote: abrimos o WhatsApp com o pedido pronto e respondemos com o valor em pesos e como pagar. Quando confirmamos o pagamento, os créditos entram na sua conta.'],
      ['Comprar por WhatsApp', 'Buy on WhatsApp', 'Comprar pelo WhatsApp'], ['Comprar por Telegram', 'Buy on Telegram', 'Comprar pelo Telegram'], ['Muy pronto', 'Coming soon', 'Em breve'],
      ['Pagás {x}', 'You pay {x}', 'Você paga {x}'], ['Recibís {n} créditos', 'You get {n} credits', 'Você recebe {n} créditos'], ['+{n} de regalo', '+{n} bonus', '+{n} de bônus'],
      ['Alcanza para', 'Enough for', 'Dá para'], ['Destacados sueltos', 'a few Featured days', 'alguns Destaques avulsos'],
      ['{n} mes de {P}', '{n} month of {P}', '{n} mês de {P}'], ['{n} meses de {P}', '{n} months of {P}', '{n} meses de {P}'],
      ['{n} mes de {P} + {n}', '{n} month of {P} + {n}', '{n} mês de {P} + {n}'], ['{n} meses de {P} + {n}', '{n} months of {P} + {n}', '{n} meses de {P} + {n}'],
      ['{n} meses de {P}, o {n} de {Q} + {n}', '{n} months of {P}, or {n} of {Q} + {n}', '{n} meses de {P}, ou {n} de {Q} + {n}'],
      ['Inicial', 'Starter', 'Inicial'], ['Mes {P}', '{P} Month', 'Mês {P}'], ['Trimestre {P}', '{P} Quarter', 'Trimestre {P}'], ['Carga a medida', 'Custom top-up', 'Recarga personalizada'],
      ['De {n} a {n} créditos, sin bonificación.', 'From {n} to {n} credits, no bonus.', 'De {n} a {n} créditos, sem bônus.'], ['Pedir', 'Order', 'Pedir'],
      ['Tenés 3 pedidos esperando pago. Pagá o cancelá alguno antes de pedir otro.', 'You have 3 orders waiting for payment. Pay or cancel one before placing another.', 'Você tem 3 pedidos aguardando pagamento. Pague ou cancele algum antes de pedir outro.'],
      ['Pedido en curso', 'Order in progress', 'Pedido em andamento'], ['Esperando pago', 'Waiting for payment', 'Aguardando pagamento'], ['Acreditado', 'Credited', 'Creditado'],
      ['Código del pedido', 'Order code', 'Código do pedido'], ['Copiar', 'Copy', 'Copiar'], ['Copiar código', 'Copy code', 'Copiar código'], ['Código copiado.', 'Code copied.', 'Código copiado.'],
      ['Mandanos el mensaje por WhatsApp con este código: te respondemos con el monto y cómo pagar.', 'Send us the WhatsApp message with this code: we reply with the amount and how to pay.', 'Mande a mensagem pelo WhatsApp com este código: respondemos com o valor e como pagar.'],
      ['El pedido espera el pago hasta el {x}.', 'The order waits for payment until {x}.', 'O pedido aguarda o pagamento até {x}.'],
      ['Recibimos tu comprobante. Te avisamos cuando acreditemos los créditos.', 'We received your receipt. We will let you know when the credits are added.', 'Recebemos seu comprovante. Avisamos quando os créditos entrarem.'],
      ['Abrir WhatsApp', 'Open WhatsApp', 'Abrir WhatsApp'], ['Muy pronto vas a poder escribirnos desde acá.', 'Soon you will be able to message us from here.', 'Em breve você vai poder nos escrever daqui.'],
      ['Adjuntar comprobante', 'Attach receipt', 'Anexar comprovante'], ['Mandar otro comprobante', 'Send another receipt', 'Enviar outro comprovante'], ['Cancelar pedido', 'Cancel order', 'Cancelar pedido'],
      ['Si ya pagaste, mandanos el comprobante: así lo confirmamos más rápido. También podés mandarlo por WhatsApp.', 'If you already paid, send us the receipt: that way we confirm it faster. You can also send it on WhatsApp.', 'Se você já pagou, mande o comprovante: assim confirmamos mais rápido. Também dá para mandar pelo WhatsApp.'],
      ['(foto o PDF, hasta 8 MB)', '(photo or PDF, up to 8 MB)', '(foto ou PDF, até 8 MB)'], ['Pagué desde la cuenta de…', 'I paid from the account of…', 'Paguei da conta de…'], ['Enviar', 'Send', 'Enviar'],
      ['¿Querés cancelar este pedido? Si ya pagaste, no lo canceles: mandanos el comprobante.', 'Cancel this order? If you already paid, do not cancel it: send us the receipt.', 'Cancelar este pedido? Se você já pagou, não cancele: mande o comprovante.'],
      ['Pedido {x} creado. Mandanos el mensaje por WhatsApp para pagarlo.', 'Order {x} created. Send us the WhatsApp message to pay for it.', 'Pedido {x} criado. Mande a mensagem pelo WhatsApp para pagar.'],
      ['La carga a medida es de {n} a {n} créditos (números enteros).', 'Custom top-ups are from {n} to {n} credits (whole numbers).', 'A recarga personalizada é de {n} a {n} créditos (números inteiros).'],
      ['Tus pedidos', 'Your orders', 'Seus pedidos'], ['Movimientos', 'Transactions', 'Movimentações'], ['Todavía no tenés movimientos.', 'You have no transactions yet.', 'Você ainda não tem movimentações.'], ['Ver más', 'See more', 'Ver mais'],
      ['Saldo: {n}', 'Balance: {n}', 'Saldo: {n}'], ['Compra de créditos', 'Credit purchase', 'Compra de créditos'], ['Regalo del pack', 'Pack bonus', 'Bônus do pacote'],
      ['Subida temporal', 'Temporary upgrade', 'Upgrade temporário'], ['Ajuste', 'Adjustment', 'Ajuste'], ['Comisión', 'Commission', 'Comissão'], ['Plan', 'Plan', 'Plano'],
      ['Cómo funcionan', 'How they work', 'Como funcionam'], ['Los créditos no vencen.', 'Credits do not expire.', 'Os créditos não vencem.'],
      ['No se devuelven en dinero ni se pueden pasar a otra cuenta.', 'They are not refunded in cash and cannot be transferred to another account.', 'Não são devolvidos em dinheiro nem podem ser passados para outra conta.'],
      ['Un pedido espera el pago {n} horas; después se cancela solo.', 'An order waits {n} hours for payment; after that it is canceled automatically.', 'Um pedido aguarda o pagamento {n} horas; depois é cancelado sozinho.'],
      ['Nunca te vamos a pedir datos de tu tarjeta ni de tu banco en la web.', 'We will never ask for your card or bank details on the website.', 'Nunca vamos pedir dados do seu cartão ou banco no site.'],
      ['Reintentar', 'Retry', 'Tentar de novo'],
      // Movimientos (motivos del servidor)
      ['Plan {P} · 30 días', '{P} plan · 30 days', 'Plano {P} · 30 dias'], ['Plan {P} · 30 días más (desde el {x})', '{P} plan · 30 more days (from {x})', 'Plano {P} · mais 30 dias (a partir de {x})'],
      ['Subida de {P} a {Q}: {n} días (se paga la diferencia)', 'Upgrade from {P} to {Q}: {n} days (you pay the difference)', 'Upgrade de {P} para {Q}: {n} dias (paga-se a diferença)'],
      ['Semana de {P} (7 días)', '{P} week (7 days)', 'Semana de {P} (7 dias)'], ['Subida temporal a {P} (7 días)', 'Temporary upgrade to {P} (7 days)', 'Upgrade temporário para {P} (7 dias)'],
      ['Renovación automática: {P} · 30 días', 'Auto-renewal: {P} · 30 days', 'Renovação automática: {P} · 30 dias'], ['Renovación: {P} · 30 días', 'Renewal: {P} · 30 days', 'Renovação: {P} · 30 dias'],
      ['Destacado 1 día ({P}) desde el {x}', 'Featured 1 day ({P}) from {x}', 'Destaque 1 dia ({P}) a partir de {x}'], ['Destacado 7 días ({P}) desde el {x}', 'Featured 7 days ({P}) from {x}', 'Destaque 7 dias ({P}) a partir de {x}'],
      ['Devolución: Destacado de {P} ({x})', 'Refund: {P} Featured ({x})', 'Devolução: Destaque de {P} ({x})'], ['Devolución: Destacado cancelado por el admin', 'Refund: Featured canceled by the admin', 'Devolução: Destaque cancelado pelo admin'],
      ['Regalo del pack {x}', 'Pack bonus: {x}', 'Bônus do pacote {x}'],
      // Destacado
      ['Verificación:', 'Verification:', 'Verificação:'],
      ['Destacado', 'Featured', 'Destaque'], ['Destacá tu perfil', 'Feature your profile', 'Destaque seu perfil'],
      ['Tu tarjeta aparece primero dentro de tu plan en tu provincia, con la etiqueta Destacado. Si hay varias destacadas, el orden cambia en cada visita.', 'Your card shows first within your plan in your province, with the Featured label. If several profiles are featured, the order changes on every visit.', 'Seu card aparece primeiro dentro do seu plano na sua província, com a etiqueta Destaque. Se houver vários destaques, a ordem muda a cada visita.'],
      ['Con tu plan', 'With your plan', 'Com seu plano'], ['1 día', '1 day', '1 dia'], ['7 días', '7 days', '7 dias'], ['Ahorrás {n} créditos', 'You save {n} credits', 'Você economiza {n} créditos'],
      ['Próxima fecha libre: {x}', 'Next available date: {x}', 'Próxima data livre: {x}'], ['Próxima fecha libre', 'Next available date', 'Próxima data livre'],
      ['Destacar 1 día', 'Feature for 1 day', 'Destacar por 1 dia'], ['Destacar 7 días', 'Feature for 7 days', 'Destacar por 7 dias'], ['Reservar 1 día', 'Book 1 day', 'Reservar 1 dia'], ['Reservar 7 días', 'Book 7 days', 'Reservar 7 dias'],
      ['Lugares en tu provincia', 'Spots in your province', 'Vagas na sua província'], ['de', 'of', 'de'], ['ocupados ahora', 'taken now', 'ocupadas agora'],
      ['Hay un lugar destacado cada 5 perfiles de tu plan en tu provincia.', 'There is one featured spot for every 5 profiles of your plan in your province.', 'Há uma vaga de destaque a cada 5 perfis do seu plano na sua província.'],
      ['Hay un lugar destacado cada 5 perfiles de tu plan en tu provincia. Ahora está completo: podés reservar la próxima fecha libre.', 'There is one featured spot for every 5 profiles of your plan in your province. It is full right now: you can book the next available date.', 'Há uma vaga de destaque a cada 5 perfis do seu plano na sua província. Agora está completo: você pode reservar a próxima data livre.'],
      ['El Destacado vale para el plan con el que lo comprás. Si subís de plan por mes, te devolvemos en créditos lo que no usaste.', 'Featured applies to the plan you buy it with. If you upgrade your monthly plan, we refund the unused part in credits.', 'O Destaque vale para o plano com que você compra. Se você subir de plano mensal, devolvemos em créditos o que não usou.'],
      ['Tus Destacados', 'Your Featured spots', 'Seus Destaques'], ['Precios por plan', 'Prices by plan', 'Preços por plano'],
      ['En créditos. Star no necesita Destacado: ya aparece arriba de todo.', 'In credits. Star does not need Featured: it already shows at the very top.', 'Em créditos. O Star não precisa de Destaque: já aparece no topo.'],
      ['Anteriores', 'Previous', 'Anteriores'], ['Activo', 'Active', 'Ativo'], ['Programado', 'Scheduled', 'Programado'], ['Terminado', 'Ended', 'Encerrado'],
      ['El Destacado no está disponible para tu perfil por ahora.', 'Featured is not available for your profile right now.', 'O Destaque não está disponível para o seu perfil por enquanto.'],
      ['Destacar mi perfil · 1 día', 'Feature my profile · 1 day', 'Destacar meu perfil · 1 dia'], ['Destacar mi perfil · 7 días', 'Feature my profile · 7 days', 'Destacar meu perfil · 7 dias'],
      ['Reservar Destacado · 1 día', 'Book Featured · 1 day', 'Reservar Destaque · 1 dia'], ['Reservar Destacado · 7 días', 'Book Featured · 7 days', 'Reservar Destaque · 7 dias'],
      ['Empieza ahora', 'Starts now', 'Começa agora'], ['Desde el {x}', 'From {x}', 'A partir de {x}'],
      ['El Destacado está completo', 'Featured is full', 'O Destaque está completo'],
      ['Los lugares destacados de tu plan en tu provincia están ocupados en esas fechas. Podés reservar la próxima fecha libre: se cobra ahora y empieza ese día.', 'The featured spots for your plan in your province are taken on those dates. You can book the next available date: it is charged now and starts that day.', 'As vagas de destaque do seu plano na sua província estão ocupadas nessas datas. Você pode reservar a próxima data livre: é cobrado agora e começa nesse dia.'], ['Ahora no', 'Not now', 'Agora não'], ['Reservar esa fecha', 'Book that date', 'Reservar essa data'],
      ['Reservaste el Destacado desde el {x}.', 'You booked Featured from {x}.', 'Você reservou o Destaque a partir de {x}.'],
      ['Tu perfil está Destacado hasta el {x}.', 'Your profile is Featured until {x}.', 'Seu perfil está em Destaque até {x}.'],
      // Avisos
      ['Avisos', 'Notifications', 'Avisos'], ['Tus avisos', 'Your notifications', 'Seus avisos'], ['Pagos, renovaciones de tu plan y Destacado.', 'Payments, plan renewals and Featured.', 'Pagamentos, renovações do plano e Destaque.'],
      ['Marcar todo como leído', 'Mark all as read', 'Marcar tudo como lido'], ['Sin leer', 'Unread', 'Não lido'], ['Tenés avisos sin leer', 'You have unread notifications', 'Você tem avisos não lidos'],
      ['No tenés avisos', 'You have no notifications', 'Você não tem avisos'],
      ['Acá te avisamos cuando acreditamos tus créditos, se renueva tu plan o empieza tu Destacado.', 'We let you know here when your credits are added, your plan renews or your Featured spot starts.', 'Aqui avisamos quando seus créditos entram, seu plano renova ou seu Destaque começa.'],
      ['Créditos acreditados', 'Credits added', 'Créditos creditados'], ['Pedido rechazado', 'Order rejected', 'Pedido recusado'], ['Plan activado', 'Plan activated', 'Plano ativado'], ['Plan renovado', 'Plan renewed', 'Plano renovado'],
      ['Plan asignado', 'Plan assigned', 'Plano atribuído'], ['Tu plan está por terminar', 'Your plan is ending soon', 'Seu plano está terminando'], ['Tu plan terminó', 'Your plan ended', 'Seu plano terminou'],
      ['Faltan créditos para renovar', 'Not enough credits to renew', 'Faltam créditos para renovar'], ['Perfil pausado', 'Profile paused', 'Perfil pausado'], ['Renovación pendiente', 'Renewal pending', 'Renovação pendente'], ['Aviso', 'Notice', 'Aviso'],
      // Avisos (textos del servidor)
      ['Acreditamos {n} créditos (pedido {x}).', 'We added {n} credits (order {x}).', 'Creditamos {n} créditos (pedido {x}).'],
      ['El pedido {x} no se pudo confirmar.', 'Order {x} could not be confirmed.', 'O pedido {x} não pôde ser confirmado.'],
      ['El pedido {x} no se pudo confirmar. Motivo: {x}', 'Order {x} could not be confirmed. Reason: {x}', 'O pedido {x} não pôde ser confirmado. Motivo: {x}'],
      ['Activaste {P} hasta el {x}. Se descontaron {n} créditos.', 'You activated {P} until {x}. {n} credits were deducted.', 'Você ativou o {P} até {x}. Foram descontados {n} créditos.'],
      ['Sumaste 30 días de {P}: ahora llega hasta el {x}. Se descontaron {n} créditos.', 'You added 30 days of {P}: it now lasts until {x}. {n} credits were deducted.', 'Você somou 30 dias de {P}: agora vai até {x}. Foram descontados {n} créditos.'],
      ['Pasaste a {P} hasta el {x}. Se descontaron {n} créditos.', 'You moved to {P} until {x}. {n} credits were deducted.', 'Você passou para o {P} até {x}. Foram descontados {n} créditos.'],
      ['Pasaste a {P} hasta el {x}. Se descontaron {n} créditos. Te devolvimos {n} créditos del Destacado de tu plan anterior.', 'You moved to {P} until {x}. {n} credits were deducted. We refunded {n} credits from the Featured spot of your previous plan.', 'Você passou para o {P} até {x}. Foram descontados {n} créditos. Devolvemos {n} créditos do Destaque do seu plano anterior.'],
      ['Activaste una semana de {P}: del {x} al {x}. Se descontaron {n} créditos.', 'You activated a week of {P}: from {x} to {x}. {n} credits were deducted.', 'Você ativou uma semana de {P}: de {x} a {x}. Foram descontados {n} créditos.'],
      ['Subiste a {P} por 7 días: del {x} al {x}. Se descontaron {n} créditos.', 'You moved up to {P} for 7 days: from {x} to {x}. {n} credits were deducted.', 'Você subiu para o {P} por 7 dias: de {x} a {x}. Foram descontados {n} créditos.'],
      ['Renovamos tu plan {P} hasta el {x}. Se descontaron {n} créditos; te quedan {n}.', 'We renewed your {P} plan until {x}. {n} credits were deducted; you have {n} left.', 'Renovamos seu plano {P} até {x}. Foram descontados {n} créditos; restam {n}.'],
      ['Renovamos tu plan {P} hasta el {x} ({n} créditos).', 'We renewed your {P} plan until {x} ({n} credits).', 'Renovamos seu plano {P} até {x} ({n} créditos).'],
      ['No pudimos renovar tu plan {P}: cuesta {n} créditos y tenés {n}. Tu perfil quedó pausado y vuelve a verse solo apenas cargues créditos.', 'We could not renew your {P} plan: it costs {n} credits and you have {n}. Your profile was paused and becomes visible again as soon as you top up.', 'Não conseguimos renovar seu plano {P}: custa {n} créditos e você tem {n}. Seu perfil ficou pausado e volta a aparecer assim que você carregar créditos.'],
      ['No pudimos renovar tu plan {P}: cuesta {n} créditos y tenés {n}. Se renueva solo apenas cargues créditos.', 'We could not renew your {P} plan: it costs {n} credits and you have {n}. It renews automatically as soon as you top up.', 'Não conseguimos renovar seu plano {P}: custa {n} créditos e você tem {n}. Renova sozinho assim que você carregar créditos.'],
      ['Todavía faltan {n} créditos para renovar {P} ({n}).', 'You are still {n} credits short to renew {P} ({n}).', 'Ainda faltam {n} créditos para renovar o {P} ({n}).'],
      ['No quedan lugares Star libres en tu provincia. Elegí otro plan desde tu panel para que tu perfil vuelva a verse.', 'There are no free Star spots in your province. Choose another plan from your dashboard so your profile is visible again.', 'Não há vagas Star livres na sua província. Escolha outro plano no painel para seu perfil voltar a aparecer.'],
      ['Reservaste Destacado del {x} al {x}.', 'You booked Featured from {x} to {x}.', 'Você reservou Destaque de {x} a {x}.'],
      ['Cancelamos tu Destacado.', 'We canceled your Featured spot.', 'Cancelamos seu Destaque.'], ['Cancelamos tu Destacado. Te devolvimos {n} créditos.', 'We canceled your Featured spot. We refunded {n} credits.', 'Cancelamos seu Destaque. Devolvemos {n} créditos.'],
      ['Te activamos el plan {P} hasta el {x}.', 'We activated the {P} plan for you until {x}.', 'Ativamos o plano {P} para você até {x}.'],
      ['Tu plan {P} se renueva el {x} y cuesta {n} créditos: te faltan {n}. Si no cargás, tu perfil se pausa.', 'Your {P} plan renews on {x} and costs {n} credits: you are {n} short. If you do not top up, your profile is paused.', 'Seu plano {P} renova em {x} e custa {n} créditos: faltam {n}. Se você não carregar, seu perfil fica pausado.'],
      ['Tu plan {P} termina el {x}.', 'Your {P} plan ends on {x}.', 'Seu plano {P} termina em {x}.'], ['Tu semana de {P} termina el {x}.', 'Your {P} week ends on {x}.', 'Sua semana de {P} termina em {x}.'],
      ['Tu plan {P} terminó. Ahora tu perfil está en {Q}.', 'Your {P} plan ended. Your profile is now on {Q}.', 'Seu plano {P} terminou. Agora seu perfil está no {Q}.'],
      ['Tu semana de {P} terminó. Ahora tu perfil está en {Q}.', 'Your {P} week ended. Your profile is now on {Q}.', 'Sua semana de {P} terminou. Agora seu perfil está no {Q}.'],
      // Tarjetas, panel, registro
      ['Disponible desde Plata', 'Available from Silver', 'Disponível a partir do Prata'],
      ['Con el plan Plata o más alto, tu tarjeta muestra unos segundos de uno de tus videos y llama más la atención.', 'With the Silver plan or higher, your card shows a few seconds of one of your videos and stands out more.', 'Com o plano Prata ou superior, seu card mostra alguns segundos de um dos seus vídeos e chama mais atenção.'],
    ].forEach((x) => (typeof x === 'string' ? null : add(x[0], x[1], x[2])));
    add('Plan actual', 'Current plan', 'Plano atual');
    Object.assign(HH.I18N, out);
  })();
  const st2 = document.createElement('style');
  st2.textContent = `
.pc2{position:relative;min-width:0;border-radius:14px;overflow:hidden;background:var(--surface);isolation:isolate;box-shadow:0 1px 0 var(--line);container-type:inline-size}
.pc2-link{position:relative;display:block;aspect-ratio:9/16;color:#fff;text-decoration:none}
.tier-grid.md .pc2-link,.tier-grid.sm .pc2-link{aspect-ratio:2/3}
.pc2-media{position:absolute;inset:0;overflow:hidden;background:var(--surface-2)}
.pc2-media>img,.pc2-media>video,.pc2-media>.media{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:0;aspect-ratio:auto}
.pc2-media>img{transition:transform .35s ease}
.pc2-vid{opacity:0;transition:opacity .35s ease}.pc2-vid.on{opacity:1}
.pc2-media::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(8,6,12,.9) 0%,rgba(8,6,12,.5) 20%,rgba(8,6,12,0) 42%);pointer-events:none}
@media(hover:hover){.pc2:hover .pc2-media>img{transform:scale(1.035)}}
.pc2-ver{position:absolute;top:8px;left:8px;z-index:2;width:22px;height:22px;border-radius:50%;background:rgba(8,6,12,.55);border:1.5px solid rgba(255,255,255,.9);display:grid;place-items:center;color:#fff}
.pc2-ver svg{width:12px;height:12px;stroke-width:3}
.pc2-starb{position:absolute;top:8px;right:8px;z-index:2;display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:99px;background:linear-gradient(135deg,#F7D27A,#E3A93B);color:#2a1d00;font-size:11px;font-weight:800}
.pc2-starb svg{width:11px;height:11px;fill:currentColor}
/* Destacado: A = etiqueta arriba del nombre; B = pastilla arriba a la izquierda, al lado del tilde de verificada */
.pc2-dest{display:inline-flex;align-items:center;gap:4px;max-width:100%;margin-bottom:4px;padding:2px 9px 2px 7px;border-radius:99px;background:linear-gradient(135deg,var(--berry),#B4236A);color:#fff;font-size:clamp(9.5px,4cqi + 3px,11.5px);font-weight:800;letter-spacing:.04em;text-transform:uppercase;box-shadow:0 2px 10px rgba(0,0,0,.35);white-space:nowrap;overflow:hidden}
.pc2-dest svg{width:11px;height:11px;flex:none}.pc2-dest>span{overflow:hidden;text-overflow:ellipsis}
.pc2-destb{position:absolute;top:8px;left:36px;z-index:2;display:inline-flex;align-items:center;gap:4px;max-width:calc(100% - 44px);padding:3px 9px 3px 7px;border-radius:99px;background:linear-gradient(135deg,var(--berry),#B4236A);color:#fff;font-size:11px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;box-shadow:0 2px 10px rgba(0,0,0,.35);white-space:nowrap;overflow:hidden}
.pc2-destb.sinver{left:8px}.pc2-destb svg{width:11px;height:11px;flex:none}.pc2-destb>span{overflow:hidden;text-overflow:ellipsis}
/* Nombre y zona centrados abajo; la estrella de favoritos queda en la esquina inferior derecha */
.pc2-info{position:absolute;left:0;right:0;bottom:0;z-index:2;display:grid;justify-items:center;gap:1px;padding:0 34px 12px;text-align:center;min-width:0}
.pc2-name{max-width:100%;font-family:var(--font-display,inherit);font-weight:800;font-size:clamp(12px,8.5cqi + 2px,20px);line-height:1.12;text-transform:uppercase;letter-spacing:.015em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 6px rgba(0,0,0,.55)}
.pc2-loc{max-width:100%;font-size:clamp(10.5px,5cqi + 3px,13.5px);opacity:.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 4px rgba(0,0,0,.6)}
.pc2-trip{display:grid;max-width:100%;font-size:clamp(10px,4.5cqi + 3px,12px);font-weight:700;line-height:1.25;margin-top:2px}.pc2-trip>span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pc2-trip.info{color:#9CC3FF}.pc2-trip.warn{color:#F6C46B}
.pc2-fav{position:absolute;right:4px;bottom:6px;z-index:3;width:34px;height:34px;padding:0;border:0;border-radius:50%;background:transparent;color:#fff;display:grid;place-items:center;cursor:pointer;-webkit-tap-highlight-color:transparent}
.pc2-fav svg{width:21px;height:21px;filter:drop-shadow(0 1px 3px rgba(0,0,0,.6))}
.pc2-fav.on{color:#F5C451}.pc2-fav.on svg{fill:currentColor}
.pc2-fav:focus-visible,.pc2-link:focus-visible{outline:2px solid var(--berry);outline-offset:-2px}
.pc2-fav.pop svg{animation:pcPop .32s ease}@keyframes pcPop{0%{transform:scale(1)}45%{transform:scale(1.35)}100%{transform:scale(1)}}
@media(prefers-reduced-motion:reduce){.pc2-fav.pop svg{animation:none}.pc2-media>img,.pc2-vid{transition:none}}
/* Tarjetas angostas (3 por fila en el celular): el texto usa todo el ancho y la estrella baja a su propia fila */
@container (max-width:190px){
  .pc2-info{padding:0 6px 28px}
  .pc2-fav{right:1px;bottom:0;width:30px;height:30px}.pc2-fav svg{width:18px;height:18px}
  .pc2-ver{top:6px;left:6px;width:19px;height:19px}.pc2-ver svg{width:10px;height:10px}
  .pc2-starb{top:6px;right:6px;font-size:0;gap:0;padding:4px}
  .pc2-destb{top:6px;left:30px;padding:3px 6px;font-size:9px;gap:3px}.pc2-destb.sinver{left:6px}.pc2-destb svg{width:9px;height:9px}
  .pc2-dest{padding:2px 6px;gap:3px;margin-bottom:3px}.pc2-dest svg{width:9px;height:9px}
}
.pub-stars-row>.pc2{flex:0 0 44%!important;scroll-snap-align:start}
@media(min-width:720px){.pub-stars-row>.pc2{flex:0 0 200px!important}}
@media(min-width:1100px){.pub-stars-row>.pc2{flex:0 0 calc((100% - 60px)/6)!important}}
.pub-hscroll>.pc2{flex:0 0 46%;scroll-snap-align:start}
@media(min-width:720px){.pub-hscroll>.pc2{flex:auto}}
.pv-frames{display:grid;grid-template-columns:repeat(2,minmax(0,170px));gap:12px}
.pv-col{display:grid;gap:8px;align-content:start;min-width:0}
.pv-frame{position:relative;width:100%;aspect-ratio:9/16;border-radius:14px;overflow:hidden;background:#000}
.pv-frame video,.pv-frame .ph{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.pv-frame .sp-vstate{position:absolute;inset:auto 0 0 0}
.pv-vids{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;scrollbar-width:thin}
.pv-v{position:relative;flex:0 0 64px;height:88px;border-radius:10px;overflow:hidden;border:2px solid transparent;background:var(--surface-2);padding:0;cursor:pointer;color:var(--fg)}
.pv-v img{width:100%;height:100%;object-fit:cover}.pv-v.on{border-color:var(--berry)}
.pv-v span{position:absolute;right:4px;bottom:4px;font-size:10.5px;font-weight:800;padding:1px 5px;border-radius:6px;background:rgba(0,0,0,.6);color:#fff}
.pv-range{width:100%;max-width:340px;accent-color:var(--berry)}
`;
  document.head.appendChild(st2);

  /* ---------- Estilos ---------- */
  const st = document.createElement('style');
  st.textContent = `
html[data-prod="sitio"] #supFab,html[data-prod="sitio"] #supPanel{display:none!important}
.sp-skel{height:84px;border-radius:14px;margin-bottom:12px;background:linear-gradient(90deg,var(--surface) 0%,var(--surface-2) 50%,var(--surface) 100%);background-size:200% 100%;animation:spSk 1.2s linear infinite}
@keyframes spSk{to{background-position:-200% 0}}
.sp-2{display:grid;gap:12px}@media(min-width:640px){.sp-2{grid-template-columns:1fr 1fr}}
.sp-3{display:grid;gap:12px}@media(min-width:760px){.sp-3{grid-template-columns:repeat(3,minmax(0,1fr))}}
.sp-steps{margin:0;padding-left:20px;display:grid;gap:6px;color:var(--fg-2)}
.sp-prices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.sp-prices>div{display:grid;gap:2px;padding:10px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line)}
.sp-banner{margin-bottom:12px;align-items:center}.sp-banner .grow{min-width:0}
.sp-todo{list-style:none;margin:0;padding:0;display:grid;gap:8px}.sp-todo li{display:flex;gap:8px;align-items:flex-start;font-size:14px}.sp-todo svg{width:16px;height:16px;flex:none;color:var(--warn);margin-top:2px}
.sp-chk{cursor:pointer;position:relative}.sp-chk input{position:absolute;opacity:0;pointer-events:none}.sp-chk:has(input:checked){background:var(--berry);border-color:var(--berry);color:var(--berry-ink)}.sp-chk:has(input:focus-visible){outline:2px solid var(--berry);outline-offset:2px}
.sp-det summary{cursor:pointer;font-weight:700}
.sp-link{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr);gap:8px}
.sp-savebar{position:sticky;bottom:calc(var(--bottomnav-h) + 10px);z-index:5;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;padding:12px 14px;border-radius:16px;background:var(--surface-2);border:1px solid var(--line-2);box-shadow:var(--shadow)}
@media(min-width:900px){.sp-savebar{bottom:12px}}
.sp-err:empty{display:none}
.sp-prog{height:8px;border-radius:99px;background:var(--surface-2);overflow:hidden}.sp-prog i{display:block;height:100%;width:0;background:var(--berry);transition:width .2s}
.sp-fotos{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
.sp-vstate{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:6px;padding:8px;text-align:center;background:rgba(10,8,14,.72);color:#fff;font-size:12.5px;font-weight:700}.sp-vstate.err{color:#ffb3bb}.sp-vstate svg{width:20px;height:20px}
.sp-spin{width:22px;height:22px;border-radius:50%;border:3px solid rgba(255,255,255,.25);border-top-color:#fff;animation:spSpin .9s linear infinite}@keyframes spSpin{to{transform:rotate(360deg)}}
.sp-foto{position:relative;display:grid;gap:6px}.sp-foto .media{border-radius:12px}.sp-foto.main .media{outline:2px solid var(--berry);outline-offset:2px}
.sp-main{position:absolute;top:6px;left:6px;z-index:2}
.sp-fact{display:grid;grid-template-columns:auto 1fr auto auto;gap:4px;align-items:center}.sp-fact .btn{padding-inline:6px}
.sp-hist{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}.sp-h{display:grid;gap:6px}.sp-h .media{border-radius:10px}
.sp-plans .plan.sp-cur{outline:2px solid var(--berry)}
.sp-danger{color:var(--danger)}
.sp-amount{display:grid;gap:2px;padding:12px 14px;border-radius:14px;background:var(--surface-2);border:1px solid var(--line)}.sp-amount strong{font-size:22px}
label.btn.disabled{opacity:.5;pointer-events:none}
`;
  document.head.appendChild(st);
})();
