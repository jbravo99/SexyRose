/* ============================================================
   SexyRose — prod-sitio.js (Fase 1: sitio público real + panel de la acompañante)
   Solo se activa en el paquete "sitio" (build.py con HH_TARGET=sitio → window.HH_PROD = 'sitio').
   - El sitio público usa SOLO datos reales: GET /api/sitio/estado (perfiles publicados y verificados).
   - Las acompañantes crean su cuenta, arman su perfil, suben fotos, verificación e historias y piden
     su plan por transferencia contra /api/cuenta/… (cookie de sesión del servidor).
   - Fuera del lanzamiento del 15/11 (no se muestra nada de esto): cuentas de clientes, compras,
     contenido exclusivo, packs, pedidos a medida, chat en vivo, reservas, shorts y videos.
   - En el navegador solo se guardan preferencias de la interfaz (idioma, géneros, historias vistas).
   ============================================================ */
(function () {
  'use strict';
  if (window.HH_PROD !== 'sitio') return;
  HH.PROD = 'sitio';
  const esc = HH.esc, icon = HH.icon;
  // Nombre comercial de la subida temporal de plan (Juan todavía no eligió el nombre: se cambia acá)
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
  const PEDIDO = { pendiente: ['warn', 'Esperando tu transferencia'], informado: ['info', 'Transferencia informada'], confirmado: ['ok', 'Confirmado'], rechazado: ['danger', 'Rechazado'], cancelado: ['neutral', 'Cancelado'], vencido: ['neutral', 'Vencido'] };
  const RANK = { E: 1, D: 2, C: 3, B: 4, A: 5, S: 6 };
  const PANEL_TABS = [
    { id: 'resumen', label: 'Resumen', icon: 'dashboard' },
    { id: 'perfil', label: 'Mi perfil', icon: 'user' },
    { id: 'fotos', label: 'Fotos', icon: 'image' },
    { id: 'verificacion', label: 'Verificación', icon: 'shield' },
    { id: 'historias', label: 'Historias', icon: 'camera' },
    { id: 'plan', label: 'Plan', icon: 'card' },
    { id: 'cuenta', label: 'Cuenta', icon: 'settings' },
  ];

  /* ---------- Textos del sitio real en inglés y portugués (no tocan el diccionario de la demo) ---------- */
  Object.assign(HH.I18N = HH.I18N || {}, {"Videos · {n} / {n}": ["Videos · {n} / {n}", "Vídeos · {n} / {n}"], "Hasta 30 segundos y 95 MB. Les agregamos la marca de agua y les sacamos los datos de ubicación.": ["Up to 30 seconds and 95 MB. We add the watermark and remove location data.", "Até 30 segundos e 95 MB. Adicionamos a marca d’água e removemos os dados de localização."], "Subir video": ["Upload video", "Enviar vídeo"], "Subiendo video…": ["Uploading video…", "Enviando vídeo…"], "Procesando…": ["Processing…", "Processando…"], "No se pudo procesar.": ["Could not be processed.", "Não foi possível processar."], "Todavía no subiste videos": ["You have not uploaded videos yet", "Você ainda não enviou vídeos"], "Videos cortos de tus salidas, con la cara visible. Sin desnudos.": ["Short videos of your outings, with your face visible. No nudity.", "Vídeos curtos dos seus passeios, com o rosto visível. Sem nudez."], "Recibimos el video. Lo estamos procesando.": ["We received the video. We are processing it.", "Recebemos o vídeo. Estamos processando."], "Borrar video": ["Delete video", "Apagar vídeo"], "¿Querés borrar este video? No se puede deshacer.": ["Delete this video? This cannot be undone.", "Apagar este vídeo? Não dá para desfazer."], "Video borrado.": ["Video deleted.", "Vídeo apagado."], "El video pesa más de 95 MB. Recortalo o grabalo en menor calidad.": ["The video is larger than 95 MB. Trim it or record it in lower quality.", "O vídeo tem mais de 95 MB. Corte ou grave em qualidade menor."], "Video": ["Video", "Vídeo"], "Videos": ["Videos", "Vídeos"]});
  Object.assign(HH.I18N = HH.I18N || {}, { "1 mes": ["1 month", "1 mês"], "1 semana": ["1 week", "1 semana"], "asignado": ["assigned", "atribuído"], "Te mostramos los datos para transferir.": ["We will show you the transfer details.", "Mostramos os dados para transferência."], "Del {x} al {x}": ["From {x} to {x}", "De {x} a {x}"], "(hasta 4, con https://)": [ "(up to 4, with https://)", "(até 4, com https://)" ], "(opcional, para clientes de afuera)": [ "(optional, for clients from abroad)", "(opcional, para clientes de fora)" ], "A convenir": [ "To be agreed", "A combinar" ], "Acepto los": [ "I accept the", "Aceito os" ], "Acompañantes": [ "Companions", "Acompanhantes" ], "Activas": [ "Active", "Ativas" ], "Aprobamos tu perfil y aparece en el sitio. Los clientes te escriben directo por WhatsApp o Telegram.": [ "We approve your profile and it shows on the site. Clients write to you directly on WhatsApp or Telegram.", "Aprovamos seu perfil e ele aparece no site. Os clientes escrevem direto pelo WhatsApp ou Telegram." ], "Avisar que transferí": [ "Let you know I paid", "Avisar que transferi" ], "Barrio o zona": [ "Neighborhood or area", "Bairro ou região" ], "Borrador": [ "Draft", "Rascunho" ], "Borrar foto": [ "Delete photo", "Apagar foto" ], "Cada acompañante envía una selfie con su documento y una foto del documento, que revisa el equipo de SexyRose: confirmamos que es mayor de edad y que es la persona de las fotos. Solo se publican los perfiles verificados.": [ "Each companion sends a selfie holding her ID and a photo of the ID, reviewed by the SexyRose team: we confirm she is of legal age and the person in the photos. Only verified profiles are published.", "Cada acompanhante envia uma selfie com o documento e uma foto do documento, que a equipe da SexyRose revisa: confirmamos que é maior de idade e que é a pessoa das fotos. Só os perfis verificados são publicados." ], "Cancelado": [ "Canceled", "Cancelado" ], "Completá tu perfil y envialo a revisión. Nadie lo ve todavía.": [ "Complete your profile and send it for review. Nobody can see it yet.", "Complete seu perfil e envie para revisão. Ninguém o vê ainda." ], "Completá tu perfil y subí al menos 3 fotos.": [ "Complete your profile and upload at least 3 photos.", "Complete seu perfil e envie pelo menos 3 fotos." ], "Comprobante": [ "Receipt", "Comprovante" ], "Con código de país. Es el número al que te escriben.": [ "With country code. It is the number clients write to.", "Com código do país. É o número para o qual escrevem." ], "Confirmado": [ "Confirmed", "Confirmado" ], "Confirmando tu email…": [ "Confirming your email…", "Confirmando seu e-mail…" ], "Confirmar email": [ "Confirm email", "Confirmar e-mail" ], "Confirmá tu email: te mandamos un link a": [ "Confirm your email: we sent a link to", "Confirme seu e-mail: enviamos um link para" ], "Contacto y tarifa": [ "Contact and rate", "Contato e tarifa" ], "Contanos qué pasó. Revisamos cada reporte y podemos suspender el perfil.": [ "Tell us what happened. We review every report and can suspend the profile.", "Conte o que aconteceu. Revisamos cada denúncia e podemos suspender o perfil." ], "Contraseña cambiada.": [ "Password changed.", "Senha alterada." ], "Contraseña nueva": [ "New password", "Nova senha" ], "Creá tu cuenta": [ "Create your account", "Crie sua conta" ], "Creá tu cuenta y confirmá tu email.": [ "Create your account and confirm your email.", "Crie sua conta e confirme seu e-mail." ], "Cuando transfieras, tocá \"Ya transferí\" en tus pedidos. Confirmamos el pago y se activa el plan.": [ "Once you transfer, tap \"I already paid\" in your orders. We confirm the payment and the plan is activated.", "Quando transferir, toque em \"Já transferi\" nos seus pedidos. Confirmamos o pagamento e o plano é ativado." ], "Cuenta creada. Te mandamos un email para confirmarlo.": [ "Account created. We sent you an email to confirm it.", "Conta criada. Enviamos um e-mail para confirmá-lo." ], "Cómo funciona": [ "How it works", "Como funciona" ], "Datos para transferir": [ "Transfer details", "Dados para transferência" ], "Demasiados intentos. Probá de nuevo en un rato.": [ "Too many attempts. Try again in a while.", "Muitas tentativas. Tente de novo daqui a pouco." ], "Denunciar": [ "Report", "Denunciar" ], "Duran 24 horas y aparecen en el inicio con tu anillo. Lo mejor para mostrar tu día.": [ "They last 24 hours and appear on the home page with your ring. The best way to show your day.", "Duram 24 horas e aparecem no início com o seu anel. O melhor jeito de mostrar seu dia." ], "Dónde estás": [ "Where you are", "Onde você está" ], "El archivo es demasiado grande.": [ "The file is too large.", "O arquivo é grande demais." ], "El link no es válido o ya venció.": [ "The link is not valid or has expired.", "O link não é válido ou já expirou." ], "El link no tiene el código de confirmación.": [ "The link is missing the confirmation code.", "O link não tem o código de confirmação." ], "El link no tiene el código. Pedí uno nuevo desde \"¿Olvidaste tu contraseña?\".": [ "The link is missing the code. Request a new one from \"Forgot your password?\".", "O link não tem o código. Peça um novo em \"Esqueceu sua senha?\"." ], "Elegí las dos fotos: la selfie con el documento y el frente del documento.": [ "Choose both photos: the selfie with your ID and the front of your ID.", "Escolha as duas fotos: a selfie com o documento e a frente do documento." ], "Elegí primero la provincia": [ "Choose the province first", "Escolha primeiro a província" ], "Elegí tu provincia": [ "Choose your province", "Escolha sua província" ], "Elegí tu provincia en Mi perfil para ver el cupo.": [ "Choose your province in My profile to see availability.", "Escolha sua província em Meu perfil para ver as vagas." ], "Elegí una contraseña nueva de al menos 10 caracteres. Se cierran las sesiones abiertas en otros dispositivos.": [ "Choose a new password of at least 10 characters. Sessions open on other devices will be closed.", "Escolha uma nova senha com pelo menos 10 caracteres. As sessões abertas em outros dispositivos serão encerradas." ], "Elegí una foto.": [ "Choose a photo.", "Escolha uma foto." ], "Email confirmado": [ "Email confirmed", "E-mail confirmado" ], "Email sin confirmar": [ "Email not confirmed", "E-mail não confirmado" ], "Error del servidor. Probá de nuevo en unos minutos.": [ "Server error. Try again in a few minutes.", "Erro do servidor. Tente de novo em alguns minutos." ], "Es el nombre que se ve en el sitio. No uses tu nombre completo.": [ "It is the name shown on the site. Do not use your full name.", "É o nome que aparece no site. Não use seu nome completo." ], "Escribinos a": [ "Write to us at", "Escreva para" ], "Escribí el email de tu cuenta y te mandamos un link para crear una nueva.": [ "Enter your account email and we will send you a link to create a new one.", "Digite o e-mail da sua conta e enviamos um link para criar uma nova." ], "Esperando tu transferencia": [ "Waiting for your transfer", "Aguardando sua transferência" ], "Estado": [ "Status", "Status" ], "Estado de tu perfil": [ "Your profile status", "Status do seu perfil" ], "Estamos revisando tu perfil y tu verificación. Te avisamos por email.": [ "We are reviewing your profile and your verification. We will let you know by email.", "Estamos revisando seu perfil e sua verificação. Avisamos por e-mail." ], "Estás en Bronce, gratis.": [ "You are on Bronze, free.", "Você está no Bronze, grátis." ], "Estás en Bronce, gratis. Con un plan más alto aparecés más arriba y podés subir más fotos e historias.": [ "You are on Bronze, free. With a higher plan you appear higher up and can upload more photos and stories.", "Você está no Bronze, grátis. Com um plano mais alto você aparece mais acima e pode enviar mais fotos e stories." ], "Fecha de nacimiento": [ "Date of birth", "Data de nascimento" ], "Foto borrada.": [ "Photo deleted.", "Foto apagada." ], "Fotos reales, con la cara visible y en lugares públicos. Sin desnudos.": [ "Real photos, with your face visible and in public places. No nudity.", "Fotos reais, com o rosto visível e em lugares públicos. Sem nudez." ], "Fotos subidas.": [ "Photos uploaded.", "Fotos enviadas." ], "Frente del documento": [ "Front of your ID", "Frente do documento" ], "Gracias. Recibimos tu reporte.": [ "Thank you. We received your report.", "Obrigado. Recebemos sua denúncia." ], "Guardado.": [ "Saved.", "Salvo." ], "Guardar contraseña": [ "Save password", "Salvar senha" ], "Género": [ "Gender", "Gênero" ], "Hasta {n} fotos": [ "Up to {n} photos", "Até {n} fotos" ], "Historia borrada.": [ "Story deleted.", "Story apagado." ], "Historia publicada por 24 horas.": [ "Story posted for 24 hours.", "Story publicado por 24 horas." ], "Historias ilimitadas con tu plan": [ "Unlimited stories with your plan", "Stories ilimitados com seu plano" ], "Imágenes sin consentimiento": [ "Images without consent", "Imagens sem consentimento" ], "Ingresar": [ "Log in", "Entrar" ], "Ingresá": [ "Log in", "Entre" ], "La contraseña tiene que tener al menos 10 caracteres.": [ "The password must be at least 10 characters long.", "A senha precisa ter pelo menos 10 caracteres." ], "Las dos contraseñas no coinciden.": [ "The two passwords do not match.", "As duas senhas não coincidem." ], "Las salidas se cancelan con quien las acordaste, por WhatsApp y con tiempo. Los planes de las acompañantes se pagan por mes o por semana y no se renuevan solos.": [ "Outings are canceled with the person you arranged them with, on WhatsApp and in advance. Companion plans are paid by month or by week and do not renew automatically.", "Os passeios são cancelados com quem você combinou, pelo WhatsApp e com antecedência. Os planos das acompanhantes são pagos por mês ou por semana e não se renovam sozinhos." ], "Link incompleto": [ "Incomplete link", "Link incompleto" ], "Listo, avisamos que transferiste. Te confirmamos por email.": [ "Done, we noted your transfer. We will confirm by email.", "Pronto, avisamos que você transferiu. Confirmamos por e-mail." ], "Listo, confirmaste tu email.": [ "Done, your email is confirmed.", "Pronto, você confirmou seu e-mail." ], "Listo, tu perfil está en revisión.": [ "Done, your profile is under review.", "Pronto, seu perfil está em revisão." ], "Listo, ya podés entrar con tu contraseña nueva.": [ "Done, you can now log in with your new password.", "Pronto, você já pode entrar com sua nova senha." ], "Llegaste al límite de tu plan": [ "You reached your plan limit", "Você atingiu o limite do seu plano" ], "Lo hago después": [ "I will do it later", "Faço depois" ], "Lo que ves acá es lo que se publica. Tu email, tu documento y tu fecha de nacimiento no se muestran.": [ "What you see here is what gets published. Your email, your ID and your date of birth are never shown.", "O que você vê aqui é o que é publicado. Seu e-mail, seu documento e sua data de nascimento não aparecem." ], "Lo revisamos a mano para confirmar que sos vos y que sos mayor de 18. La selfie y el documento nunca se publican ni se comparten.": [ "We review it by hand to confirm it is you and that you are over 18. The selfie and the ID are never published or shared.", "Revisamos manualmente para confirmar que é você e que você é maior de 18. A selfie e o documento nunca são publicados nem compartilhados." ], "Lo sacás del sitio cuando quieras, sin perder nada.": [ "Take it off the site whenever you want, without losing anything.", "Tire do site quando quiser, sem perder nada." ], "Los cambios se ven en el sitio apenas guardás (si tu perfil está publicado).": [ "Changes show on the site as soon as you save (if your profile is published).", "As mudanças aparecem no site assim que você salva (se seu perfil estiver publicado)." ], "Los datos para transferir te llegan por email.": [ "You will receive the transfer details by email.", "Os dados para transferência chegam por e-mail." ], "Lugar fijo arriba del inicio en tu provincia. Solo 10 por provincia.": [ "Fixed spot at the top of the home page in your province. Only 10 per province.", "Lugar fixo no topo do início na sua província. Só 10 por província." ], "Mandar de nuevo": [ "Send again", "Enviar de novo" ], "Mandar verificación": [ "Send verification", "Enviar verificação" ], "Mandarme el link": [ "Send me the link", "Me enviar o link" ], "Mandá una selfie y tu documento: los revisamos y nunca se publican.": [ "Send a selfie and your ID: we review them and they are never published.", "Envie uma selfie e seu documento: revisamos e nunca são publicados." ], "Mover antes": [ "Move earlier", "Mover para antes" ], "Mover después": [ "Move later", "Mover para depois" ], "Más arriba en el inicio, más fotos e historias ilimitadas.": [ "Higher on the home page, more photos and unlimited stories.", "Mais acima no início, mais fotos e stories ilimitados." ], "Más fotos y hasta 3 historias por día.": [ "More photos and up to 3 stories per day.", "Mais fotos e até 3 stories por dia." ], "No hay conexión. Revisá internet y probá de nuevo.": [ "No connection. Check your internet and try again.", "Sem conexão. Verifique a internet e tente de novo." ], "No quedan lugares Star en tu provincia.": [ "No Star spots left in your province.", "Não há mais vagas Star na sua província." ], "No tenés historias activas.": [ "You have no active stories.", "Você não tem stories ativos." ], "Nombre artístico": [ "Stage name", "Nome artístico" ], "Nota": [ "Note", "Nota" ], "Ocultar mi perfil": [ "Hide my profile", "Ocultar meu perfil" ], "Pagás por transferencia. Cuando la confirmamos, el plan se activa. Una semana de un plan más alto te sube 7 días y después volvés solo a tu plan.": [ "You pay by bank transfer. Once we confirm it, the plan is activated. A week of a higher plan moves you up for 7 days and then you go back to your plan automatically.", "Você paga por transferência. Quando confirmamos, o plano é ativado. Uma semana de um plano mais alto te sobe por 7 dias e depois você volta sozinha ao seu plano." ], "Para mirar perfiles y escribir por WhatsApp no hace falta cuenta.": [ "You do not need an account to browse profiles and write on WhatsApp.", "Não é preciso conta para ver perfis e escrever pelo WhatsApp." ], "Para publicar te falta": [ "To publish you still need", "Para publicar falta" ], "Pausado": [ "Paused", "Pausado" ], "Pedido cancelado.": [ "Order canceled.", "Pedido cancelado." ], "Pedido en curso": [ "Order in progress", "Pedido em andamento" ], "Pedir": [ "Order", "Pedir" ], "Pedir 1 mes · {x}": [ "Order 1 month · {x}", "Pedir 1 mês · {x}" ], "1 semana · {x}": [ "1 week · {x}", "1 semana · {x}" ], "Subí a {x} por 7 días · {x}": [ "Upgrade to {x} for 7 days · {x}", "Suba para {x} por 7 dias · {x}" ], "Perfil falso, engaño u otro": [ "Fake profile, scam or other", "Perfil falso, golpe ou outro" ], "Podés elegir hasta 6 intereses.": [ "You can choose up to 6 interests.", "Você pode escolher até 6 interesses." ], "Podés pedir un link nuevo desde tu panel.": [ "You can request a new link from your dashboard.", "Você pode pedir um novo link no seu painel." ], "Política de contenido": [ "Content policy", "Política de conteúdo" ], "Política de privacidad": [ "Privacy policy", "Política de privacidade" ], "Poné esta referencia en la transferencia": [ "Put this reference in the transfer", "Coloque esta referência na transferência" ], "Posible menor de edad": [ "Possible minor", "Possível menor de idade" ], "Posible trata o explotación": [ "Possible trafficking or exploitation", "Possível tráfico ou exploração" ], "Precio por mes, en dólares. Platino, Diamante y Star también se pueden pedir por una semana. Pagás por transferencia.": [ "Price per month, in US dollars. Platinum, Diamond and Star can also be ordered for one week. You pay by bank transfer.", "Preço por mês, em dólares. Platina, Diamante e Star também podem ser pedidos por uma semana. Você paga por transferência." ], "Provincia": [ "Province", "Província" ], "Publicado": [ "Published", "Publicado" ], "Publicá tu perfil": [ "Publish your profile", "Publique seu perfil" ], "Rechazado": [ "Rejected", "Rejeitado" ], "Recibimos tu verificación.": [ "We received your verification.", "Recebemos sua verificação." ], "Recibimos tu verificación. Te avisamos por email cuando la revisemos. Si te equivocaste de archivo, podés mandarla de nuevo.": [ "We received your verification. We will email you when we review it. If you sent the wrong file, you can send it again.", "Recebemos sua verificação. Avisamos por e-mail quando revisarmos. Se você errou o arquivo, pode enviar de novo." ], "Recuperar contraseña": [ "Recover password", "Recuperar senha" ], "Reenviar": [ "Resend", "Reenviar" ], "Referencia": [ "Reference", "Referência" ], "Repetila": [ "Repeat it", "Repita" ], "Revisá el motivo, corregí lo necesario y volvé a enviarlo.": [ "Check the reason, fix what is needed and send it again.", "Veja o motivo, corrija o necessário e envie de novo." ], "Salidas que te gustan": [ "Outings you like", "Passeios de que você gosta" ], "Se publica solo tu edad.": [ "Only your age is published.", "Só sua idade é publicada." ], "Sección Diamante, la primera debajo de Stars, con tarjetas grandes.": [ "Diamond section, the first one below Stars, with large cards.", "Seção Diamante, a primeira abaixo de Stars, com cards grandes." ], "Sección Platino en el inicio y hasta 50 fotos.": [ "Platinum section on the home page and up to 50 photos.", "Seção Platina no início e até 50 fotos." ], "Selfie con el documento": [ "Selfie with your ID", "Selfie com o documento" ], "Separalos con comas.": [ "Separate them with commas.", "Separe com vírgulas." ], "Si hay una cuenta con ese email, te mandamos un link para crear una contraseña nueva. Revisá también la carpeta de spam.": [ "If there is an account with that email, we sent you a link to create a new password. Also check your spam folder.", "Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha. Verifique também a pasta de spam." ], "Si querés, adjuntá el comprobante. Así lo confirmamos más rápido.": [ "If you want, attach the receipt. That way we confirm it faster.", "Se quiser, anexe o comprovante. Assim confirmamos mais rápido." ], "Sin confirmar": [ "Not confirmed", "Não confirmado" ], "Sin enviar": [ "Not sent", "Não enviada" ], "Sobre vos": [ "About you", "Sobre você" ], "Sobre vos en inglés": [ "About you in English", "Sobre você em inglês" ], "Solo para acompañantes mayores de 18. Con el plan Bronce publicás gratis.": [ "Only for companions over 18. With the Bronze plan you publish for free.", "Só para acompanhantes maiores de 18. Com o plano Bronze você publica grátis." ], "Soy mayor de 18 años.": [ "I am over 18 years old.", "Sou maior de 18 anos." ], "Subiendo {n} de {n}…": [ "Uploading {n} of {n}…", "Enviando {n} de {n}…" ], "Suspendido": [ "Suspended", "Suspenso" ], "Tarifa desde (USD por hora)": [ "Rate from (USD per hour)", "Tarifa a partir de (USD por hora)" ], "Te mandamos el email de nuevo.": [ "We sent the email again.", "Enviamos o e-mail de novo." ], "Te mandamos un link para confirmarlo. No se publica.": [ "We will send you a link to confirm it. It is not published.", "Enviamos um link para confirmá-lo. Não é publicado." ], "Tenés que aceptar los Términos y las políticas.": [ "You must accept the Terms and policies.", "Você precisa aceitar os Termos e as políticas." ], "Tenés que confirmar que sos mayor de 18 años.": [ "You must confirm that you are over 18.", "Você precisa confirmar que é maior de 18 anos." ], "Texto": [ "Text", "Texto" ], "Titular": [ "Headline", "Título" ], "Todavía no subiste fotos": [ "You have not uploaded photos yet", "Você ainda não enviou fotos" ], "Transferencia informada": [ "Transfer reported", "Transferência informada" ], "Transferí desde la cuenta de…": [ "I transferred from the account of…", "Transferi da conta de…" ], "Transferí para activar tu plan": [ "Transfer to activate your plan", "Transfira para ativar seu plano" ], "Tu email": [ "Your email", "Seu e-mail" ], "Tu identidad está verificada.": [ "Your identity is verified.", "Sua identidade está verificada." ], "Tu perfil está completo.": [ "Your profile is complete.", "Seu perfil está completo." ], "Tu perfil está oculto.": [ "Your profile is hidden.", "Seu perfil está oculto." ], "Tu perfil está oculto: nadie lo ve en el sitio.": [ "Your profile is hidden: nobody sees it on the site.", "Seu perfil está oculto: ninguém o vê no site." ], "Tu perfil fue suspendido. Escribinos a contacto@sexyrose.net.": [ "Your profile was suspended. Write to us at contacto@sexyrose.net.", "Seu perfil foi suspenso. Escreva para contacto@sexyrose.net." ], "Tu perfil no se ve en el sitio por ahora.": [ "Your profile is not shown on the site for now.", "Seu perfil não aparece no site por enquanto." ], "Tu perfil se ve de nuevo.": [ "Your profile is visible again.", "Seu perfil aparece de novo." ], "Tu perfil se ve en el sitio.": [ "Your profile is shown on the site.", "Seu perfil aparece no site." ], "Tus fotos": [ "Your photos", "Suas fotos" ], "Tus historias": [ "Your stories", "Seus stories" ], "Tus historias se ven en el sitio cuando tu perfil esté publicado.": [ "Your stories show on the site once your profile is published.", "Seus stories aparecem no site quando seu perfil estiver publicado." ], "Tus pedidos": [ "Your orders", "Seus pedidos" ], "Una foto del frente de tu documento (DNI o pasaporte), que se lean el nombre y la fecha de nacimiento.": [ "A photo of the front of your ID (national ID or passport), with the name and date of birth readable.", "Uma foto da frente do seu documento (RG ou passaporte), com o nome e a data de nascimento legíveis." ], "Una selfie sosteniendo tu documento al lado de la cara, con buena luz.": [ "A selfie holding your ID next to your face, in good light.", "Uma selfie segurando seu documento ao lado do rosto, com boa luz." ], "Ver mi perfil": [ "View my profile", "Ver meu perfil" ], "Verificación: {x}": [ "Verification: {x}", "Verificação: {x}" ], "Vigente hasta el {x}.": [ "Valid until {x}.", "Válido até {x}." ], "Volver a ingresar": [ "Back to log in", "Voltar para entrar" ], "WhatsApp se abre con un mensaje de presentación que podés editar antes de enviar.": [ "WhatsApp opens with an introduction message you can edit before sending.", "O WhatsApp abre com uma mensagem de apresentação que você pode editar antes de enviar." ], "Ya fue verificada con tu documento.": [ "Already verified with your ID.", "Já foi verificada com seu documento." ], "Ya transferí": [ "I already paid", "Já transferi" ], "Enviar a revisión": [ "Send for review", "Enviar para revisão" ], "Enviar verificación": [ "Send verification", "Enviar verificação" ], "Subir fotos": [ "Upload photos", "Enviar fotos" ], "¿Olvidaste tu contraseña?": [ "Forgot your password?", "Esqueceu sua senha?" ], "¿Todavía no publicaste?": [ "Not published yet?", "Ainda não publicou?" ], "Dónde": [ "Where", "Onde" ], "Quedan {n} de {n} lugares en tu provincia.": [ "{n} of {n} spots left in your province.", "Restam {n} de {n} vagas na sua província." ], "Te quedan {n} hoy": [ "{n} left today", "Restam {n} hoje" ], "Pedir {x}": [ "Order {x}", "Pedir {x}" ], "¿Querés borrar esta foto? No se puede deshacer.": [ "Delete this photo? This cannot be undone.", "Apagar esta foto? Não dá para desfazer." ], "¿Querés cancelar este pedido? Si ya transferiste, no lo canceles: tocá \"Ya transferí\".": [ "Cancel this order? If you already transferred, do not cancel it: tap \"I already paid\".", "Cancelar este pedido? Se você já transferiu, não cancele: toque em \"Já transferi\"." ], "Mínimo {n}, hasta {n} con tu plan. La primera es la principal (la del swipe y las historias). Les agregamos la marca de agua de SexyRose y les sacamos los datos de ubicación.": [ "At least {n}, up to {n} with your plan. The first one is the main photo (used in swipe and stories). We add the SexyRose watermark and remove location data.", "Mínimo {n}, até {n} com seu plano. A primeira é a principal (a do swipe e dos stories). Adicionamos a marca d’água da SexyRose e removemos os dados de localização." ], "(hasta 6)": [ "(up to 6)", "(até 6)" ], "En inglés": [ "In English", "Em inglês" ], "Agregá tu WhatsApp o tu usuario de Telegram.": [ "Add your WhatsApp or your Telegram username.", "Adicione seu WhatsApp ou seu usuário do Telegram." ], "Confirmá tu email (te mandamos un link).": [ "Confirm your email (we sent you a link).", "Confirme seu e-mail (enviamos um link)." ], "Elegí tu provincia y tu ciudad.": [ "Choose your province and your city.", "Escolha sua província e sua cidade." ], "Enviá tu verificación de identidad (selfie y documento).": [ "Send your identity verification (selfie and ID).", "Envie sua verificação de identidade (selfie e documento)." ], "Subí al menos 3 fotos (tenés {n}).": [ "Upload at least 3 photos (you have {n}).", "Envie pelo menos 3 fotos (você tem {n})." ], "Completá tu nombre artístico.": [ "Fill in your stage name.", "Preencha seu nome artístico." ], "Elegí tu género.": [ "Choose your gender.", "Escolha seu gênero." ], "Cargá tu fecha de nacimiento.": [ "Enter your date of birth.", "Informe sua data de nascimento." ], ", la": [ ", the", ", a" ], "y la": [ "and the", "e a" ], "Provincia de {x}": [ "Province of {x}", "Província de {x}" ], "tu_usuario": [ "your_username", "seu_usuario" ], "Cafés de especialidad, museos y charlas largas": [ "Specialty coffee, museums and long talks", "Cafés especiais, museus e longas conversas" ] });
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
  HH.chatEnabledFor = () => false;
  HH.chatAvailable = () => false;
  HH.canTakeBookings = () => false;
  // Destacadas: fuera del lanzamiento (ni el "+ Nueva" de la dueña)
  HH.highlightsRow = () => '';
  // Descripciones de los planes sin funciones que todavía no existen (chat, estadísticas, venta de contenido)
  const DESC = { E: 'Tu perfil publicado y verificado, para empezar.', D: 'Más fotos y hasta 3 historias por día.', C: 'Más arriba en el inicio, más fotos e historias ilimitadas.', B: 'Sección Platino en el inicio y hasta 50 fotos.', A: 'Sección Diamante, la primera debajo de Stars, con tarjetas grandes.', S: 'Lugar fijo arriba del inicio en tu provincia. Solo 10 por provincia.' };
  Object.keys(DESC).forEach((k) => { if (HH.LEVELS[k]) HH.LEVELS[k].desc = DESC[k]; });
  HH.publishedProfiles = () => ((HH.db && HH.db.profiles) || []).filter((p) => p.status === 'active' && !p.hidden && HH.levelOf(p.userId));

  /* ---------- Videos (bunny.net): portada en las miniaturas, video solo en el visor ---------- */
  HH.videoMedia = function (v, opts = {}) {
    if (!v || !v.src) return `<div class="ph" style="background:${HH.hueGradient((v && v.hue) || 300, true)}">${HH.icon('video')}</div>`;
    const poster = v.poster ? HH.esc(v.poster) : '';
    if (!opts.controls) return poster ? `<img src="${poster}" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">` : `<video src="${HH.esc(v.src)}" muted playsinline preload="metadata" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video>`;
    return `<video src="${HH.esc(v.src)}"${poster ? ` poster="${poster}"` : ''} controls playsinline preload="metadata" controlslist="nodownload" disablepictureinpicture style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000"></video>`;
  };

  /* ---------- API ---------- */
  const err = (message, status, data) => Object.assign(new Error(message), { status, data });
  async function api(method, path, body) {
    const opt = { method, credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } };
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
  const S = { estado: null, estadoErr: null, yo: null, yoLoaded: false, planes: null, planesErr: null, busy: {}, forgot: false, verif: null, prov: null, up: null, upHist: null, upVid: null };
  const PANEL_IS = (key) => /^panel(\.|$)/.test(key);
  const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };

  function emptyDb() {
    const s = HH.seed(); const db = {};
    Object.keys(s).forEach((k) => { db[k] = Array.isArray(s[k]) ? [] : s[k]; });
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
        videos: (x.videos || []).filter((v) => v && v.url).map((v) => ({ id: v.id, src: v.url, poster: v.poster || '', seconds: v.segundos == null ? null : Math.round(Number(v.segundos)), name: '', w: v.ancho, h: v.alto })),
        verified: 'verified', emailVerified: true, whatsappVerified: true, status: 'active', hidden: false, online: false,
        lat: cityLoc && cityLoc.lat != null ? cityLoc.lat + jit(9) : null, lng: cityLoc && cityLoc.lng != null ? cityLoc.lng + jit(7) : null,
        hue: h % 360, createdAt: x.publicadoEn || x.actualizado, updatedAt: x.actualizado, stats: { views: 0, rightSwipes: 0 }, chatPriceUsd: 0,
      });
      db.subscriptions.push({ id: 'sub_' + x.cuentaId, userId: x.cuentaId, level: plan, status: 'active', startedAt: x.publicadoEn || e.ahora, expiresAt: far, providerRef: 'sitio' });
      if (plan === 'S' || x.star) db.stars.push({ id: 'st_' + x.cuentaId, workerId: x.cuentaId, activeUntil: far, createdAt: x.publicadoEn || e.ahora });
    });
    db.stories = (e.historias || []).map((h) => ({ id: h.id, workerId: h.cuentaId, src: h.url, caption: h.texto || '', hue: hash(h.id) % 360, views: 0, createdAt: h.creado, expiresAt: h.expira }));
    db.highlights = [];
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
  async function loadEstado() {
    try { S.estado = await api('GET', '/sitio/estado'); S.estadoErr = null; } catch (e) { S.estadoErr = e.message; }
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
    S.yo = null; S.planes = null; HH.session = null; hint(false); await loadEstado(); HH.renderShell(); HH.go('#inicio'); HH.toast('Sesión cerrada');
  };
  HH.requireRole = function () { if (!S.yo) { HH.go('#login'); return false; } return true; };
  HH.homeFor = () => '#panel';

  /* ---------- Limpieza: nada de lo que queda fuera del lanzamiento ---------- */
  const OUT = ['[data-action="pubWaBook"]', '[data-action="pubWaChat"]', '[data-action="pubChat"]', '[data-action="pubBook"]', '[data-action="pubRequest"]', '[data-action="pubBuyPack"]', '[data-action="pubShortBuy"]', '[data-action="clientSignup"]', '[data-action="clientLogin"]', '[data-action="pubPasskeyLogin"]', '[data-go="#shorts"]', '#pubContent', '.pub-shorts', '[data-go^="#chat."]', '[data-go^="#cuenta"]'];
  const FAQ_FIX = {
    '¿Cómo funciona la verificación?': 'Cada acompañante envía una selfie con su documento y una foto del documento, que revisa el equipo de SexyRose: confirmamos que es mayor de edad y que es la persona de las fotos. Solo se publican los perfiles verificados.',
    '¿Puedo cancelar?': 'Las salidas se cancelan con quien las acordaste, por WhatsApp y con tiempo. Los planes de las acompañantes se pagan por mes o por semana y no se renuevan solos.',
  };
  function clean(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll(OUT.join(',')).forEach((el) => el.remove());
    root.querySelectorAll('.msg-split button.btn.tg[disabled], .msg-split button.btn.wa[disabled]').forEach((el) => el.remove());
    root.querySelectorAll('a[href]').forEach((a) => { const h = a.getAttribute('href') || ''; if (/\/(shorts|chat)(\/|$)/.test(h) || /^#\/?(shorts|chat)/.test(h)) a.remove(); });
    // Galería: la pestaña Videos aparece solo si el perfil tiene videos; sin videos no hacen falta pestañas Todo/Fotos/Videos
    root.querySelectorAll('.pf-gtabs').forEach((g) => { const v = g.querySelector('[data-tab="video"]'); if (v && /\(0\)\s*$/.test(v.textContent || '')) v.remove(); if (g.querySelectorAll('[role=tab]').length <= 2) g.remove(); });
    // Preguntas frecuentes del lanzamiento
    root.querySelectorAll('details.pub-faq').forEach((d) => {
      const q = ((d.querySelector('summary') || {}).textContent || '').trim(); const p = d.querySelector('p');
      if (/cobra el contenido/i.test(q)) { d.remove(); return; }
      if (p && FAQ_FIX[q]) p.textContent = FAQ_FIX[q];
    });
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
  const modal0 = HH.modal;
  HH.modal = function () { const r = modal0.apply(this, arguments); clean(document.getElementById('modalBox')); return r; };

  /* ---------- Shell ---------- */
  const shell0 = HH.renderShell;
  HH.renderShell = function () {
    shell0.apply(this, arguments);
    const hi = document.getElementById('headerInner'); const bn = document.getElementById('bottomNav');
    const logged = !!S.yo; const key = HH.currentHash(); const top = key.split('.')[0];
    if (hi) {
      hi.querySelectorAll('.topnav a').forEach((a) => { const g = a.getAttribute('data-go') || ''; if (/^#(shorts|admin|cuenta)/.test(g)) a.remove(); });
      const nav = hi.querySelector('.topnav');
      if (nav && !nav.querySelector('[data-go="#favoritos"]')) nav.insertAdjacentHTML('beforeend', `<a href="#favoritos" data-go="#favoritos"${top === 'favoritos' ? ' class="active"' : ''}>Favoritos</a>`);
      if (nav && logged && !nav.querySelector('[data-go="#panel"]')) nav.insertAdjacentHTML('beforeend', `<a href="#panel" data-go="#panel"${top === 'panel' ? ' class="active"' : ''}>Mi panel</a>`);
      const actions = hi.querySelector('.header-actions');
      if (actions && !logged) {
        actions.querySelectorAll('a[data-go="#login"]').forEach((a) => { a.textContent = 'Ingresar'; });
        actions.querySelectorAll('a[data-go="#registro"]').forEach((a) => { a.innerHTML = `<span class="hide-mobile">${icon('user')}</span>Publicá tu perfil`; });
      }
      if (['panel', 'cuenta', 'login', 'registro'].includes(top)) { const g = hi.querySelector('.hdr-genders'); if (g) g.replaceWith(Object.assign(document.createElement('span'), { className: 'hdr-spacer' })); }
    }
    if (bn) {
      const act = (h) => (('#' + top) === h ? ' class="active"' : '');
      const items = [{ h: '#inicio', l: 'Inicio', i: 'home' }, { h: '#swipe', l: 'Swipe', i: 'heart' }, { h: '#cerca', l: 'Cerca', i: 'pin' }, { h: '#favoritos', l: 'Favoritos', i: 'star' },
        logged ? { h: '#panel', l: 'Mi panel', i: 'dashboard' } : { h: '#registro', l: 'Publicar', i: 'user' }];
      bn.innerHTML = items.map((n) => `<a href="${n.h}" data-go="${n.h}"${act(n.h)}>${icon(n.i)}<span>${n.l}</span></a>`).join('');
    }
    if (HH.linkify) { if (hi) HH.linkify(hi); if (bn) HH.linkify(bn); }
  };

  /* ---------- Rutas propias (panel, ingreso, registro, cuenta) ---------- */
  const OWN = (key) => /^(panel|login|registro|cuenta|favoritos)(\.|$)/.test(key);
  const render0 = HH.render;
  HH.render = function (forcePath) {
    if (!forcePath && HH.syncLangFromUrl) HH.syncLangFromUrl();
    const key = forcePath || HH.currentHash();
    if (!HH.db) { const app = document.getElementById('app'); if (app && !app.innerHTML) app.innerHTML = `<div class="container section"><div class="sp-skel"></div><div class="sp-skel"></div></div>`; return; }
    if (/^(shorts|chat)(\.|$)/.test(key)) { HH.go('#inicio', { replace: true }); return; }
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
    setRobots('noindex,nofollow');
    if (HH.afterRender) { const f = HH.afterRender; HH.afterRender = null; try { f(); } catch (e) { console.error(e); } }
  };
  const OWN_TITLES = { panel: 'Mi panel', login: 'Ingresar', registro: 'Publicá tu perfil', cuenta: 'Mi cuenta', favoritos: 'Favoritos' };
  function setRobots(v) { let m = document.querySelector('meta[name="robots"]'); if (!m) { m = document.createElement('meta'); m.name = 'robots'; document.head.appendChild(m); } m.content = v; }
  const rerender = () => { if (OWN(HH.currentHash()) && !document.getElementById('modalRoot').classList.contains('open')) HH.refresh(); };

  function ownView(parts) {
    const [a, b] = parts;
    if (a === 'favoritos') return favView();
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
    const views = { resumen: panelResumen, perfil: panelPerfil, fotos: panelFotos, verificacion: panelVerif, historias: panelHistorias, plan: panelPlan, cuenta: panelCuenta };
    if (tab === 'fotos') setTimeout(vigilarVideos, 0);
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
        <div class="sp-prices">${['E', 'D', 'C', 'B', 'A', 'S'].map((k) => `<div><span class="small muted">${esc(HH.planName(k))}</span><strong class="num">${Number(pr[k] != null ? pr[k] : HH.LEVELS[k].price_usd) ? HH.money(pr[k] != null ? pr[k] : HH.LEVELS[k].price_usd) : '<span>Gratis</span>'}</strong></div>`).join('')}</div>
        <p class="tiny muted">Precio por mes, en dólares. Platino, Diamante y Star también se pueden pedir por una semana. Pagás por transferencia.</p>
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
    const cnt = { resumen: (p.faltantes || []).length, verificacion: p.verificacion === 'sin_enviar' || p.verificacion === 'rechazada' ? 1 : 0, fotos: (p.fotos || []).length < 3 ? 1 : 0 };
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
    const p = S.yo.perfil; const [cls, label, txt] = ESTADO_PERFIL[p.estado] || ESTADO_PERFIL.borrador;
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
        <p class="small muted" style="margin:0">${pl === 'E' ? 'Estás en Bronce, gratis. Con un plan más alto aparecés más arriba y podés subir más fotos e historias.' : 'Vigente hasta el ' + esc(HH.fmtDate((subs.find((s) => s.plan === pl) || subs[0] || {}).hasta || new Date().toISOString())) + '.'}</p>
        <a class="btn secondary" href="#panel.plan" data-go="#panel.plan">${icon('card')} Ver planes</a>
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
  // Mientras haya videos procesándose, se consulta el estado cada 3 s (solo con el panel de fotos abierto).
  let pollVid = null;
  function vigilarVideos() {
    clearTimeout(pollVid); pollVid = null;
    const hay = S.yo && ((S.yo.perfil.videos || []).some((v) => v.estado === 'procesando') || (S.yo.perfil.preview && S.yo.perfil.preview.estado === 'procesando'));
    if (!hay || !/^panel\.fotos$/.test(HH.currentHash())) return;
    pollVid = setTimeout(async () => {
      pollVid = null;
      if (!/^panel\.fotos$/.test(HH.currentHash())) return;
      const firma = () => JSON.stringify([((S.yo && S.yo.perfil.videos) || []).map((v) => v.estado), S.yo && S.yo.perfil.preview && [S.yo.perfil.preview.estado, S.yo.perfil.preview.url]]);
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
        ${S.busy.verif ? `<div class="sp-prog"><i style="width:${Math.round((S.busy.verifP || 0) * 100)}%"></i></div>` : ''}
        ${fieldErr('spVErr')}
        <button type="submit" class="btn"${S.busy.verif ? ' disabled' : ''}>${icon('shield')} Enviar verificación</button>
      </form>` : ''}`;
  }

  function panelHistorias() {
    const hs = S.yo.historias || []; const lim = S.yo.limites || {}; const dia = lim.historiasDia; const hoy = lim.historiasHoy || 0;
    const quedan = dia == null ? null : Math.max(0, dia - hoy);
    const pub = S.yo.perfil.estado === 'publicado';
    return head('Historias', 'Tus historias', 'Duran 24 horas y aparecen en el inicio con tu anillo. Lo mejor para mostrar tu día.') + `
      ${pub ? '' : `<div class="notice info">${icon('info')}<span>Tus historias se ven en el sitio cuando tu perfil esté publicado.</span></div>`}
      <form class="card stack" style="gap:12px" data-submit="spHistoria" novalidate>
        <div class="row between"><div class="card-title">Nueva historia</div><span class="small muted">${quedan == null ? 'Historias ilimitadas con tu plan' : `Te quedan ${quedan} hoy`}</span></div>
        <div class="sp-2">
          <div class="field"><label for="spHFoto">Foto</label><input class="input" id="spHFoto" name="foto" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" required></div>
          <div class="field"><label for="spHText">Texto <span class="muted" style="font-weight:500">(opcional)</span></label><input class="input" id="spHText" name="texto" maxlength="120" placeholder="Café de la mañana en Palermo"></div>
        </div>
        ${S.upHist ? `<div class="sp-prog"><i style="width:${Math.round(S.upHist.p * 100)}%"></i></div>` : ''}
        ${fieldErr('spHErr')}
        <button type="submit" class="btn"${quedan === 0 || S.upHist ? ' disabled' : ''}>${icon('camera')} Publicar historia</button>
      </form>
      <div class="card stack" style="gap:12px">
        <div class="card-title">Activas</div>
        ${hs.length ? `<div class="sp-hist">${hs.map((h) => `<div class="card pad-sm sp-h"><div class="media tall"><img src="${esc(h.urlMini || h.url)}" alt="" loading="lazy"></div><div class="tiny ellipsis" data-noi18n>${esc(h.texto || '')}</div><div class="row between tiny muted"><span>${esc(HH.timeAgo(h.creado))}</span><button type="button" class="btn danger sm" data-action="spHistBorrar" data-id="${esc(h.id)}">Borrar</button></div></div>`).join('')}</div>` : `<p class="small muted" style="margin:0">No tenés historias activas.</p>`}
      </div>`;
  }

  function panelPlan() {
    if (!S.planes && !S.planesErr) { if (!S.busy.planes) { S.busy.planes = true; loadPlanes().finally(() => { S.busy.planes = false; rerender(); }); } return head('Plan', 'Tu plan', '') + `<div class="sp-skel"></div><div class="sp-skel"></div>`; }
    if (S.planesErr) return head('Plan', 'Tu plan', '') + `<div class="notice danger">${icon('alert')}<span>${esc(S.planesErr)}</span></div><button type="button" class="btn secondary" data-action="spPlanesReload">Reintentar</button>`;
    const P = S.planes; const ef = P.efectivo || 'E';
    const subs = (P.suscripciones || []).filter((s) => s.estado === 'activa' && new Date(s.hasta) > new Date());
    const monthly = subs.filter((s) => s.periodo === 'mes' || s.periodo === 'manual');
    const baseRank = Math.max(1, ...monthly.map((s) => RANK[s.plan] || 1));
    const abiertos = (P.pedidos || []).filter((x) => x.estado === 'pendiente' || x.estado === 'informado');
    const cupo = P.cupoStar || {};
    const planes = (P.planes || []).filter((x) => x.codigo !== 'E');
    const card = (x) => {
      const isStar = x.codigo === 'S'; const sinCupo = isStar && (!cupo.provincia || !cupo.libres);
      const open = (per) => abiertos.some((o) => o.plan === x.codigo && o.periodo === per);
      const weekLabel = x.semana != null ? ((RANK[x.codigo] > baseRank && monthly.length) ? UPGRADE_LABEL(x.nombre) : '1 semana') : '';
      return `<div class="plan${x.codigo === 'B' ? ' featured' : ''}${ef === x.codigo ? ' sp-cur' : ''}">
        <div class="row between nowrap"><strong>${esc(x.nombre)}</strong>${HH.levelBadge(x.codigo, true)}</div>
        <div class="price">${HH.money(x.mes)} <small>/ mes</small></div>
        <p class="small muted">${esc((HH.LEVELS[x.codigo] || {}).desc || '')}</p>
        <ul><li>${icon('check')}<span>Hasta ${HH.LEVELS[x.codigo].photos} fotos</span></li><li>${icon('check')}<span>${HH.LEVELS[x.codigo].stories_per_day == null ? 'Historias ilimitadas' : HH.LEVELS[x.codigo].stories_per_day + ' ' + HH.plural(HH.LEVELS[x.codigo].stories_per_day, 'historia', 'historias') + ' por día'}</span></li></ul>
        ${isStar ? `<p class="tiny ${sinCupo ? 'sp-danger' : 'muted'}">${!cupo.provincia ? 'Elegí tu provincia en Mi perfil para ver el cupo.' : cupo.libres ? `Quedan ${cupo.libres} de ${cupo.total || 10} lugares en tu provincia.` : 'No quedan lugares Star en tu provincia.'}</p>` : ''}
        <div class="stack" style="gap:8px">
          <button type="button" class="btn ${x.codigo === 'B' ? '' : 'secondary'} block" data-action="spPedir" data-plan="${x.codigo}" data-per="mes"${sinCupo || open('mes') || S.busy.pedir ? ' disabled' : ''}>${open('mes') ? 'Pedido en curso' : 'Pedir 1 mes · ' + HH.money(x.mes)}</button>
          ${x.semana != null ? `<button type="button" class="btn ghost block" data-action="spPedir" data-plan="${x.codigo}" data-per="semana"${sinCupo || open('semana') || S.busy.pedir ? ' disabled' : ''}>${open('semana') ? 'Pedido en curso' : esc(weekLabel) + ' · ' + HH.money(x.semana)}</button>` : ''}
        </div>
      </div>`;
    };
    return head('Plan', 'Tu plan', 'Pagás por transferencia. Cuando la confirmamos, el plan se activa. Una semana de un plan más alto te sube 7 días y después volvés solo a tu plan.') + `
      <div class="card stack" style="gap:10px">
        <div class="row between"><div class="card-title">Plan actual</div>${HH.levelBadge(ef, true)}</div>
        ${subs.length ? `<div class="list">${subs.map((s) => `<div class="list-item">${icon('card')}<div class="grow"><div class="title"><span>${esc(s.planNombre || HH.planName(s.plan))}</span> · <span>${s.periodo === 'semana' ? '1 semana' : s.periodo === 'manual' ? 'asignado' : '1 mes'}</span></div><div class="sub">Del ${esc(HH.fmtDate(s.desde))} al ${esc(HH.fmtDate(s.hasta))}</div></div></div>`).join('')}</div>` : `<p class="small muted" style="margin:0">Estás en Bronce, gratis.</p>`}
      </div>
      ${(P.pedidos || []).length ? `<div class="card stack" style="gap:10px"><div class="card-title">Tus pedidos</div><div class="list">${P.pedidos.slice(0, 12).map(pedidoRow).join('')}</div></div>` : ''}
      <div class="plans plans-6 sp-plans">${planes.map(card).join('')}</div>`;
  }
  function pedidoRow(x) {
    const [cls, l] = PEDIDO[x.estado] || ['neutral', x.estado];
    const actions = x.estado === 'pendiente' ? `<div class="row" style="gap:6px;margin-top:6px"><button type="button" class="btn sm" data-action="spInformar" data-id="${esc(x.id)}">Ya transferí</button><button type="button" class="btn ghost sm" data-action="spDatosPago" data-id="${esc(x.id)}">Datos para transferir</button><button type="button" class="btn ghost sm" data-action="spCancelarPedido" data-id="${esc(x.id)}">Cancelar</button></div>` : '';
    return `<div class="list-item" style="align-items:flex-start">${icon('card')}<div class="grow" style="min-width:0"><div class="title"><span>${esc(x.planNombre || HH.planName(x.plan))}</span> · <span>${x.periodo === 'semana' ? '1 semana' : '1 mes'}</span> · <span>${HH.money(x.montoUsd)}</span></div><div class="sub"><span>Referencia</span> <strong class="num" data-noi18n>${esc(x.referencia || '')}</strong> · <span>${esc(HH.fmtDate(x.creado))}</span>${x.motivo ? ` · <span data-noi18n>${esc(x.motivo)}</span>` : ''}</div>${actions}</div>${badge(cls, l)}</div>`;
  }
  function transferHtml(x) {
    const t = (S.planes && S.planes.transferencia) || '';
    return `<div class="stack" style="gap:12px">
      <div class="sp-amount"><span class="small muted">Monto</span><strong class="num">${HH.money(x.montoUsd)}</strong><span class="small muted"><span>${esc(x.planNombre || HH.planName(x.plan))}</span> · <span>${x.periodo === 'semana' ? '1 semana' : '1 mes'}</span></span></div>
      <div class="sp-amount"><span class="small muted">Poné esta referencia en la transferencia</span><strong class="num" data-noi18n>${esc(x.referencia || '')}</strong></div>
      ${t ? `<div class="card soft"><div class="small" style="white-space:pre-wrap" data-noi18n>${esc(t)}</div></div>` : `<div class="notice info">${icon('mail')}<span>Los datos para transferir te llegan por email.</span></div>`}
      <p class="tiny muted">Cuando transfieras, tocá "Ya transferí" en tus pedidos. Confirmamos el pago y se activa el plan.</p>
    </div>`;
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
      const fd = new FormData(); fd.append('selfie', s); fd.append('documento', d);
      S.busy.verif = true; S.busy.verifP = 0; rerender();
      try { await upload('/cuenta/verificacion', fd, (p) => { S.busy.verifP = p; const bar = document.querySelector('.sp-prog i'); if (bar) bar.style.width = Math.round(p * 100) + '%'; }); S.busy.verif = false; await afterYoChange('Recibimos tu verificación.'); }
      catch (e) { S.busy.verif = false; rerender(); showErr('spVErr', e.message); }
    },
    async spHistoria(form) {
      showErr('spHErr', ''); const f = form.foto.files[0]; if (!f) return showErr('spHErr', 'Elegí una foto.');
      const fd = new FormData(); fd.append('foto', f); fd.append('texto', String(form.texto.value || '').trim());
      S.upHist = { p: 0 }; rerender();
      try { await upload('/cuenta/historias', fd, (p) => { if (S.upHist) S.upHist.p = p; const bar = document.querySelector('.sp-prog i'); if (bar) bar.style.width = Math.round(p * 100) + '%'; }); S.upHist = null; await afterYoChange('Historia publicada por 24 horas.'); }
      catch (e) { S.upHist = null; rerender(); showErr('spHErr', e.message); }
    },
    async spHistBorrar(el) {
      HH.confirm({ title: 'Borrar historia', text: '¿Querés borrar esta historia?', okLabel: 'Borrar', cls: 'danger', onOk: async () => {
        try { await api('DELETE', '/cuenta/historias/' + encodeURIComponent(el.dataset.id)); await afterYoChange('Historia borrada.'); } catch (e) { HH.toast(e.message, { type: 'danger' }); }
      } });
    },
    async spPlanesReload() { S.planes = null; S.planesErr = null; rerender(); },
    async spPedir(el) {
      const plan = el.dataset.plan, periodo = el.dataset.per; const x = ((S.planes || {}).planes || []).find((p) => p.codigo === plan); if (!x) return;
      const monto = periodo === 'semana' ? x.semana : x.mes;
      HH.confirm({ title: 'Pedir ' + x.nombre, text: `<span>${esc(x.nombre)}</span> · <span>${periodo === 'semana' ? '1 semana' : '1 mes'}</span>: <strong>${HH.money(monto)}</strong>. <span>Te mostramos los datos para transferir.</span>`, okLabel: 'Pedir', onOk: async () => {
        S.busy.pedir = true; rerender();
        try { const r = await api('POST', '/cuenta/pedidos', { plan, periodo }); await loadPlanes(); S.busy.pedir = false; rerender(); const ped = r.pedido || {}; HH.modal({ title: 'Transferí para activar tu plan', body: transferHtml(ped), actions: [{ label: 'Lo hago después', cls: 'ghost', action: 'closeModal' }, { label: 'Ya transferí', onClick: () => informar(ped.id) }] }); }
        catch (e) { S.busy.pedir = false; rerender(); HH.toast(e.message, { type: 'danger' }); }
      } });
    },
    spDatosPago(el) { const x = ((S.planes || {}).pedidos || []).find((p) => p.id === el.dataset.id); if (x) HH.modal({ title: 'Datos para transferir', body: transferHtml(x), actions: [{ label: 'Cerrar', cls: 'ghost', action: 'closeModal' }, { label: 'Ya transferí', onClick: () => informar(x.id) }] }); },
    spInformar(el) { informar(el.dataset.id); },
    async spCancelarPedido(el) {
      HH.confirm({ title: 'Cancelar pedido', text: '¿Querés cancelar este pedido? Si ya transferiste, no lo canceles: tocá "Ya transferí".', okLabel: 'Cancelar pedido', cls: 'danger', onOk: async () => {
        try { await api('POST', '/cuenta/pedidos/' + encodeURIComponent(el.dataset.id) + '/cancelar'); await loadPlanes(); HH.toast('Pedido cancelado.'); rerender(); } catch (e) { HH.toast(e.message, { type: 'danger' }); }
      } });
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
  function informar(id) {
    HH.modal({ title: 'Ya transferí', body: `<div class="stack">
        <p class="small muted">Si querés, adjuntá el comprobante. Así lo confirmamos más rápido.</p>
        <div class="field"><label for="spInfFile">Comprobante <span class="muted" style="font-weight:500">(opcional)</span></label><input class="input" id="spInfFile" type="file" accept="image/*,application/pdf"></div>
        <div class="field"><label for="spInfNota">Nota <span class="muted" style="font-weight:500">(opcional)</span></label><input class="input" id="spInfNota" maxlength="300" placeholder="Transferí desde la cuenta de…"></div>
      </div>`, actions: [{ label: 'Cancelar', cls: 'ghost', action: 'closeModal' }, { label: 'Avisar que transferí', onClick: async (btn) => {
        const f = document.getElementById('spInfFile').files[0]; const nota = document.getElementById('spInfNota').value.trim();
        if (btn) btn.disabled = true;
        try {
          if (f) { const fd = new FormData(); fd.append('comprobante', f); fd.append('nota', nota); await upload('/cuenta/pedidos/' + encodeURIComponent(id) + '/informar', fd); }
          else await api('POST', '/cuenta/pedidos/' + encodeURIComponent(id) + '/informar', { nota });
          HH.closeModal(); await loadPlanes(); HH.toast('Listo, avisamos que transferiste. Te confirmamos por email.', { type: 'ok' }); rerender();
        } catch (e) { if (btn) btn.disabled = false; HH.toast(e.message, { type: 'danger' }); }
      } }] });
  }

  /* ---------- Arranque ---------- */
  HH.boot = function () {
    if (HH._booted) return; HH._booted = true;
    HH.db = null; HH.session = null;
    HH.setTheme();
    HH.render();
    Promise.all([loadEstado(), loadYo(true)]).then(() => {
      addSelfToDb();
      HH.renderShell(); HH.render();
      if (S.estadoErr) HH.toast(S.estadoErr, { type: 'danger' });
      HH.autoLocate();
    });
  };

  /* ---------- Tarjetas grandes (foto a todo el ancho, nombre y zona abajo) + clip de 5 s + favoritos ---------- */
  // Las grillas del MVP arman <a class="pcard">; acá se reemplazan por la tarjeta nueva (sin tocar el código de la demo).
  const PREVIEW_PLANES = new Set(['C', 'B', 'A', 'S']);
  const FAV_KEY = 'sr_favs';
  const favs = () => { try { const a = JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []; } catch (e) { return S.favMem || []; } };
  const setFavs = (a) => { S.favMem = a; try { localStorage.setItem(FAV_KEY, JSON.stringify(a)); } catch (e) { /* sin almacenamiento: queda en memoria */ } };
  const esFav = (id) => favs().includes(id);
  HH.spFavs = favs;
  const sinMovimiento = () => {
    try { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true; } catch (e) { /* */ }
    const c = navigator.connection; return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || '')));
  };
  const tripCard = (p) => {
    const a = HH.activeTrip && HH.activeTrip(p); const u = !a && HH.upcomingTrip && HH.upcomingTrip(p); if (!a && !u) return '';
    const l1 = a ? 'De visita' : `<span data-noi18n>${esc(u.city)}</span>`;
    const l2 = a ? 'hasta el ' + HH.fmtDay(a.to) : 'desde el ' + HH.fmtDay(u.from);
    return `<div class="pc2-trip ${a ? 'info' : 'warn'}"><span>${l1}</span><span>${l2}</span></div>`;
  };
  function card2(p) {
    const mini = (p.photosMini || [])[0]; const grande = (p.photos || [])[0];
    // La miniatura (480 px) alcanza para las tarjetas chicas; las grandes piden la foto completa en pantallas densas.
    const img = HH.isImgSrc(grande) ? `<img src="${esc(mini || grande)}"${mini && mini !== grande ? ` srcset="${esc(mini)} 360w, ${esc(grande)} 1200w" sizes="(min-width:1100px) 22vw, (min-width:720px) 30vw, 48vw"` : ''} alt="" loading="lazy" decoding="async">` : HH.photo(p, 0, { noWm: true });
    const vid = p.previewUrl && PREVIEW_PLANES.has(HH.levelOf(p.userId)) && !sinMovimiento()
      ? `<video class="pc2-vid" muted loop playsinline preload="none" disablepictureinpicture tabindex="-1" aria-hidden="true" data-src="${esc(p.previewUrl)}"></video>` : '';
    const lugar = p.zone || p.city || '';
    const fav = esFav(p.userId);
    return `<div class="pc2" data-pc2="${esc(p.userId)}">
      <a class="pc2-link" href="#perfil.${esc(p.slug)}" data-go="#perfil.${esc(p.slug)}" data-imp="${esc(p.userId)}" aria-label="Ver perfil de ${esc(p.displayName)}">
        <div class="pc2-media">${img}${vid}</div>
        ${p.verified === 'verified' ? `<span class="pc2-ver" title="Verificada">${icon('check')}</span>` : ''}
        ${HH.isStar(p.userId) ? `<span class="pc2-starb">${icon('star')} Star</span>` : ''}
        <div class="pc2-info"><div class="pc2-name" data-noi18n>${esc(p.displayName)}</div>${lugar ? `<div class="pc2-loc" data-noi18n>${esc(lugar)}</div>` : ''}${tripCard(p)}</div>
      </a>
      <button type="button" class="pc2-fav${fav ? ' on' : ''}" data-action="spFav" data-id="${esc(p.userId)}" aria-pressed="${fav}" aria-label="${fav ? 'Sacar de favoritos' : 'Guardar en favoritos'}" title="Favoritos">${icon('star')}</button>
    </div>`;
  }
  function upgradeCards(root) {
    if (!root || !root.querySelectorAll || !HH.db) return;
    root.querySelectorAll('a.pcard[data-imp]').forEach((a) => {
      if (a.closest('.hero-cards')) return;
      const p = HH.profileOf(a.dataset.imp); if (!p) return;
      const t = document.createElement('template'); t.innerHTML = card2(p).trim();
      const el = t.content.firstElementChild;
      if (HH.linkify) HH.linkify(el);
      a.replaceWith(el);
    });
    root.querySelectorAll('video.pc2-vid:not([data-io])').forEach((v) => { v.dataset.io = '1'; if (io) io.observe(v); });
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
  function favView() {
    const ids = favs();
    const lista = (HH.publishedProfiles ? HH.publishedProfiles() : []).filter((p) => ids.includes(p.userId));
    const guardados = ids.length - lista.length;
    return `<div class="container section">
      <div class="row between" style="align-items:flex-end;margin-bottom:14px"><div><span class="eyebrow">Favoritos</span><h2>Tus favoritos</h2><p class="small muted" style="margin-top:4px">Se guardan en este dispositivo. Tocá la estrella de una tarjeta para sumarla o sacarla.</p></div></div>
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

  // Panel: video de la tarjeta (5 s, sin sonido; desde Oro)
  function panelPreview() {
    if (!S.yo || !S.yo.videosHabilitados) return '';
    const listos = (S.yo.perfil.videos || []).filter((v) => v.estado === 'listo');
    if (!listos.length) return '';
    const pv = S.yo.perfil.preview;
    const titulo = `<div><div class="card-title">Video de tu tarjeta</div><div class="small muted">5 segundos sin sonido que se reproducen en tu tarjeta del inicio y de las páginas de tu ciudad.</div></div>`;
    if (!S.yo.previewHabilitado) {
      return `<div class="card stack pv-card" style="gap:12px;margin-top:14px" id="spPreview">
        <div class="row between">${titulo}<span class="badge neutral">${icon('lock')} Disponible desde Oro</span></div>
        <p class="small">Con el plan Oro o más alto, tu tarjeta muestra unos segundos de uno de tus videos y llama más la atención.</p>
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
      document.querySelectorAll(`.pc2-fav[data-id="${CSS.escape ? CSS.escape(id) : id}"]`).forEach((b) => {
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
    'Favoritos': ['Favorites', 'Favoritos'], 'Tus favoritos': ['Your favorites', 'Seus favoritos'],
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
    'Disponible desde Oro': ['Available from Gold', 'Disponível a partir do Ouro'],
    'Con el plan Oro o más alto, tu tarjeta muestra unos segundos de uno de tus videos y llama más la atención.': ['With the Gold plan or higher, your card shows a few seconds of one of your videos and stands out more.', 'Com o plano Ouro ou superior, seu card mostra alguns segundos de um dos seus vídeos e chama mais atenção.'],
    'Ver planes': ['See plans', 'Ver planos'], 'Elegido por vos': ['Chosen by you', 'Escolhido por você'], 'Automático': ['Automatic', 'Automático'],
    'Así se ve ahora': ['How it looks now', 'Como aparece agora'], 'Elegí el video': ['Choose the video', 'Escolha o vídeo'], 'Desde qué segundo': ['Starting second', 'A partir de qual segundo'], 'Tu recorte': ['Your cut', 'Seu recorte'],
    'Usar este video': ['Use this video', 'Usar este vídeo'], 'Segundo de inicio': ['Start second', 'Segundo inicial'],
    'Este video dura menos de 5 segundos: se usa completo.': ['This video is shorter than 5 seconds: it is used in full.', 'Este vídeo tem menos de 5 segundos: é usado inteiro.'],
    'Del segundo {x} al {x}': ['From second {x} to {x}', 'Do segundo {x} ao {x}'], 'Guardar clip': ['Save clip', 'Salvar clipe'], 'Usar automático': ['Use automatic', 'Usar automático'],
    'Estamos armando el clip de tu tarjeta.': ['We are making your card clip.', 'Estamos montando o clipe do seu card.'], 'Volvimos al clip automático.': ['Back to the automatic clip.', 'Voltamos ao clipe automático.'],
    'No se pudo armar el clip.': ['The clip could not be made.', 'Não foi possível montar o clipe.'],
  });
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
