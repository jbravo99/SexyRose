/* ============================================================
   SexyRose — prod-clientes.js (solo el sitio real): cuentas de interesados y pedidos personalizados con chat.
   - Cuenta del interesado (decisión de Juan, 12/11/2026): usuario + email + contraseña, 18+ y Términos. Para comprar
     packs o hacer pedidos tiene que confirmar el email. Sesión propia (cookie sr_cliente): nunca entra al panel de la
     acompañante. API: /api/cliente (app/routes/cliente.js).
   - Direcciones: /cliente/ingresar, /cliente/registro, /cliente/verificar?token=, /cliente/restablecer?token=,
     /cliente/compras, /cliente/pedidos, /cliente/pedido/<id>. Entrada desde "Tu espacio" (ícono de usuario) y al tocar
     Comprar o Pedido personalizado en un perfil (vuelve ahí después de ingresar).
   - Pedidos personalizados (planes Oro y Star): el cliente escribe su pedido; la acompañante acepta o rechaza en su
     panel (Pedidos). Aceptado → chat con mensajes de texto y contenido bloqueado (vista previa borrosa + precio →
     "Pagar con Mercado Pago" → se desbloquea). El chat consulta mensajes nuevos cada ~4 s mientras está abierto (más
     lento con la pestaña en segundo plano). API de la acompañante: /api/cuenta/solicitudes.
   - En la demo (/demo/) no hace nada: ahí no hay /api.
   ============================================================ */
(function () {
  'use strict';
  if (window.HH_PROD !== 'sitio' || !window.HH || window.HH_DEMO) return;
  const HH = window.HH;
  const esc = HH.esc, icon = HH.icon;
  const api = (m, p, b) => HH.sitioApi(m, p, b);
  const C = { yo: null, loaded: false, verif: null, forgot: false, compras: null, comprasErr: null, lista: null, listaErr: null, chat: null, chatErr: null, chatKey: null, poll: null, busy: {}, up: null };
  const HINT = 'sr_cli_hint';
  const NEXT = 'sr_cli_next';
  const hint = (v) => { try { if (v) localStorage.setItem(HINT, '1'); else localStorage.removeItem(HINT); } catch (e) { /* */ } };
  const hasHint = () => { try { return localStorage.getItem(HINT) === '1'; } catch (e) { return false; } };
  const setNext = (k) => { try { if (k) sessionStorage.setItem(NEXT, k); else sessionStorage.removeItem(NEXT); } catch (e) { /* */ } };
  const getNext = () => { try { return sessionStorage.getItem(NEXT) || ''; } catch (e) { return ''; } };

  Object.assign(HH.I18N = HH.I18N || {}, {
    'Tu cuenta': ['Your account', 'Sua conta'],
    'Entrá a tu cuenta': ['Log in to your account', 'Entre na sua conta'],
    'Para comprar packs y hacer pedidos personalizados.': ['To buy packs and make custom requests.', 'Para comprar packs e fazer pedidos personalizados.'],
    'Creá tu cuenta': ['Create your account', 'Crie sua conta'],
    'Nombre de usuario': ['Username', 'Nome de usuário'],
    'Es lo que ven las acompañantes. Nunca ven tu email.': ['This is what companions see. They never see your email.', 'É o que as acompanhantes veem. Elas nunca veem seu email.'],
    'De 3 a 20 caracteres: letras, números, punto, guion o guion bajo.': ['3 to 20 characters: letters, numbers, dot, hyphen or underscore.', 'De 3 a 20 caracteres: letras, números, ponto, hífen ou sublinhado.'],
    'Te mandamos un link para confirmarlo.': ['We will send you a link to confirm it.', 'Enviamos um link para confirmar.'],
    'Soy mayor de 18 años.': ['I am over 18.', 'Tenho mais de 18 anos.'],
    'Acepto los': ['I accept the', 'Aceito os'],
    'Términos': ['Terms', 'Termos'],
    'y la': ['and the', 'e a'],
    'Política de privacidad': ['Privacy policy', 'Política de privacidade'],
    'Crear cuenta': ['Create account', 'Criar conta'],
    '¿Ya tenés cuenta?': ['Already have an account?', 'Já tem conta?'],
    'Ingresá': ['Log in', 'Entre'],
    '¿No tenés cuenta?': ['No account yet?', 'Não tem conta?'],
    'Creala gratis': ['Create one for free', 'Crie grátis'],
    'Entrar': ['Log in', 'Entrar'],
    'Email': ['Email', 'Email'],
    'Contraseña': ['Password', 'Senha'],
    'Mínimo 10 caracteres.': ['At least 10 characters.', 'Mínimo 10 caracteres.'],
    '¿Olvidaste tu contraseña?': ['Forgot your password?', 'Esqueceu sua senha?'],
    'Escribí el email de tu cuenta y te mandamos un link para crear una nueva.': ['Enter your account email and we will send you a link to create a new one.', 'Digite o email da sua conta e enviaremos um link para criar uma nova.'],
    'Mandarme el link': ['Send me the link', 'Enviar o link'],
    'Volver a ingresar': ['Back to log in', 'Voltar para entrar'],
    '¿Sos acompañante?': ['Are you a companion?', 'Você é acompanhante?'],
    'Entrá a tu panel': ['Go to your panel', 'Entre no seu painel'],
    'Confirmar email': ['Confirm email', 'Confirmar email'],
    'Confirmando tu email…': ['Confirming your email…', 'Confirmando seu email…'],
    'Listo, confirmaste tu email.': ['Done, you confirmed your email.', 'Pronto, você confirmou seu email.'],
    'Seguir': ['Continue', 'Continuar'],
    'Nueva contraseña': ['New password', 'Nova senha'],
    'Contraseña nueva': ['New password', 'Nova senha'],
    'Repetila': ['Repeat it', 'Repita'],
    'Guardar contraseña': ['Save password', 'Salvar senha'],
    'Las dos contraseñas no coinciden.': ['The passwords do not match.', 'As senhas não coincidem.'],
    'Listo, ya podés seguir con tu contraseña nueva.': ['Done, you can continue with your new password.', 'Pronto, você pode continuar com sua nova senha.'],
    'Cuenta creada. Te mandamos un email para confirmarla.': ['Account created. We sent you an email to confirm it.', 'Conta criada. Enviamos um email para confirmar.'],
    'Confirmá tu email: te mandamos un link a': ['Confirm your email: we sent a link to', 'Confirme seu email: enviamos um link para'],
    'Reenviar': ['Resend', 'Reenviar'],
    'Te mandamos el email de nuevo.': ['We sent the email again.', 'Enviamos o email de novo.'],
    'Confirmá tu email para seguir.': ['Confirm your email to continue.', 'Confirme seu email para continuar.'],
    'Mis compras': ['My purchases', 'Minhas compras'],
    'Mis pedidos': ['My requests', 'Meus pedidos'],
    'Cerrar sesión': ['Log out', 'Sair'],
    'Sesión cerrada': ['Logged out', 'Sessão encerrada'],
    'Para dar de baja tu cuenta, escribinos a contacto@sexyrose.net desde el email de la cuenta.': ['To delete your account, email contacto@sexyrose.net from your account email.', 'Para excluir sua conta, escreva para contacto@sexyrose.net pelo email da conta.'],
    'Comprá packs y hacé pedidos personalizados': ['Buy packs and make custom requests', 'Compre packs e faça pedidos personalizados'],
    'Creá tu cuenta o ingresá.': ['Create your account or log in.', 'Crie sua conta ou entre.'],
    'Ingresar': ['Log in', 'Entrar'],
    'Todavía no compraste packs': ['You have not bought packs yet', 'Você ainda não comprou packs'],
    'Abrir pack': ['Open pack', 'Abrir pack'],
    'Ver': ['View', 'Ver'],
    'Todavía no hiciste pedidos': ['You have not made requests yet', 'Você ainda não fez pedidos'],
    'Pedidos': ['Requests', 'Pedidos'],
    'Pedidos personalizados': ['Custom requests', 'Pedidos personalizados'],
    'Pedido personalizado': ['Custom request', 'Pedido personalizado'],
    'Pedile algo a medida. Si acepta, se abre un chat con ella.': ['Ask her for something custom. If she accepts, a chat opens with her.', 'Peça algo sob medida. Se ela aceitar, abre um chat com ela.'],
    'Hacer un pedido': ['Make a request', 'Fazer um pedido'],
    '¿Qué querés pedir?': ['What would you like to request?', 'O que você quer pedir?'],
    'Contale qué querés. Hasta 500 caracteres.': ['Tell her what you want. Up to 500 characters.', 'Conte o que você quer. Até 500 caracteres.'],
    'Enviar pedido': ['Send request', 'Enviar pedido'],
    'Pedido enviado.': ['Request sent.', 'Pedido enviado.'],
    'Esperando respuesta': ['Waiting for a reply', 'Aguardando resposta'],
    'Aceptado': ['Accepted', 'Aceito'],
    'Rechazado': ['Declined', 'Recusado'],
    'Cerrado': ['Closed', 'Encerrado'],
    'Nuevo': ['New', 'Novo'],
    'Tu pedido': ['Your request', 'Seu pedido'],
    'Pedido de': ['Request from', 'Pedido de'],
    'Aceptar': ['Accept', 'Aceitar'],
    'Rechazar': ['Decline', 'Recusar'],
    'Rechazar pedido': ['Decline request', 'Recusar pedido'],
    '¿Querés rechazar este pedido? No se abre el chat.': ['Decline this request? No chat will open.', 'Recusar este pedido? O chat não será aberto.'],
    'Esperando que la acompañante responda.': ['Waiting for the companion to reply.', 'Aguardando a resposta da acompanhante.'],
    'La acompañante rechazó el pedido.': ['The companion declined the request.', 'A acompanhante recusou o pedido.'],
    'Rechazaste este pedido.': ['You declined this request.', 'Você recusou este pedido.'],
    'Pedido aceptado. Ya pueden hablar por acá.': ['Request accepted. You can now talk here.', 'Pedido aceito. Agora vocês podem conversar aqui.'],
    'Este pedido está cerrado.': ['This request is closed.', 'Este pedido está encerrado.'],
    'El pedido se cerró.': ['The request was closed.', 'O pedido foi encerrado.'],
    'Escribí un mensaje': ['Write a message', 'Escreva uma mensagem'],
    'Enviar': ['Send', 'Enviar'],
    'Cerrar pedido': ['Close request', 'Encerrar pedido'],
    '¿Querés cerrar este pedido? El chat queda de solo lectura.': ['Close this request? The chat becomes read-only.', 'Encerrar este pedido? O chat fica somente leitura.'],
    'Enviar contenido bloqueado': ['Send locked content', 'Enviar conteúdo bloqueado'],
    'Foto o video (hasta 60 segundos)': ['Photo or video (up to 60 seconds)', 'Foto ou vídeo (até 60 segundos)'],
    'Precio (pesos argentinos)': ['Price (Argentine pesos)', 'Preço (pesos argentinos)'],
    'Se ve borroso hasta que paga. Calidad máxima 720p. Vence a 1 mes del pago.': ['It looks blurred until paid. Max quality 720p. Expires 1 month after payment.', 'Aparece borrado até o pagamento. Qualidade máxima 720p. Vence 1 mês após o pagamento.'],
    'Subiendo…': ['Uploading…', 'Enviando…'],
    'Procesando…': ['Processing…', 'Processando…'],
    'Contenido enviado.': ['Content sent.', 'Conteúdo enviado.'],
    'Recibimos el video. Se manda apenas termine de procesarse.': ['We received the video. It will be sent as soon as it is processed.', 'Recebemos o vídeo. Ele será enviado assim que for processado.'],
    'Este contenido venció': ['This content has expired', 'Este conteúdo venceu'],
    'Pagar con Mercado Pago': ['Pay with Mercado Pago', 'Pagar com Mercado Pago'],
    'Pago en proceso': ['Payment in process', 'Pagamento em processamento'],
    'Pagado': ['Paid', 'Pago'],
    'Sin pagar': ['Not paid', 'Não pago'],
    'Vence el {x}': ['Expires on {x}', 'Vence em {x}'],
    'Actualizar': ['Refresh', 'Atualizar'],
    'Volver': ['Back', 'Voltar'],
    'Tus pedidos': ['Your requests', 'Seus pedidos'],
    'Todavía no te llegaron pedidos': ['No requests yet', 'Ainda não chegaram pedidos'],
    'Con tu plan y Mercado Pago conectado, los clientes te pueden hacer pedidos personalizados desde tu perfil.': ['With your plan and Mercado Pago connected, clients can send you custom requests from your profile.', 'Com seu plano e o Mercado Pago conectado, os clientes podem fazer pedidos personalizados pelo seu perfil.'],
    'Los pedidos personalizados son para los planes Oro y Star con Mercado Pago conectado.': ['Custom requests are for the Gold and Star plans with Mercado Pago connected.', 'Os pedidos personalizados são para os planos Ouro e Star com o Mercado Pago conectado.'],
    'Iniciá sesión para seguir.': ['Log in to continue.', 'Entre para continuar.'],
  });

  /* ---------- Direcciones propias: /cliente/... (/en/cliente/..., /pt/cliente/...) ---------- */
  const parseUrl0 = HH.parseUrl;
  HH.parseUrl = function (url) {
    const r = parseUrl0.apply(this, arguments);
    if (r && r.key === '404') {
      const segs = String(url || '/').split('#')[0].split('?')[0].split('/').filter(Boolean);
      const lang = segs[0] === 'en' || segs[0] === 'pt' ? segs.shift() : 'es';
      if (segs[0] && segs[0].toLowerCase() === 'cliente' && segs.length <= 3 && segs.every((x) => /^[A-Za-z0-9-]{1,40}$/.test(x))) return { key: ['cliente'].concat(segs.slice(1)).join('.'), lang };
    }
    return r;
  };

  /* ---------- Sesión ---------- */
  async function loadYo(force) {
    if (!force && !hasHint() && !/^cliente(\.|$)/.test(HH.currentHash())) { C.yo = null; C.loaded = true; return; }
    try { const r = await api('GET', '/cliente/yo'); C.yo = (r && r.cliente) || null; } catch (e) { if (e.status === 401) C.yo = null; }
    hint(!!C.yo); C.loaded = true;
  }
  const logged = () => !!C.yo;
  const verificado = () => !!(C.yo && C.yo.emailVerificado);
  const noLeidos = () => (C.yo && C.yo.pedidosNoLeidos) || 0;
  const enCliente = () => /^cliente(\.|$)/.test(HH.currentHash());
  const rerender = () => { if (!document.getElementById('modalRoot').classList.contains('open')) HH.refresh(); };
  const irNext = (def) => { const n = getNext(); setNext(''); HH.go(n || def || '#favoritos'); };
  // Pide ingresar y vuelve a "next" (clave del SPA) después.
  function pedirLogin(next) {
    setNext(next || HH.currentHash());
    HH.toast('Iniciá sesión para seguir.');
    HH.go('#cliente.ingresar');
  }
  function avisoVerificar() {
    HH.modal({ title: 'Confirmar email', body: `<p class="small" style="margin:0"><span>Confirmá tu email: te mandamos un link a</span> <strong data-noi18n>${esc(C.yo ? C.yo.email : '')}</strong>.</p>`,
      actions: [{ label: 'Cerrar', cls: 'ghost', action: 'closeModal' }, { label: 'Reenviar', onClick: () => { HH.closeModal(); HH.actions.clReenviar(); } }] });
  }
  // Antes de comprar o pedir: sesión + email confirmado. true = puede seguir.
  function asegurar(next) {
    if (!logged()) { pedirLogin(next); return false; }
    if (!verificado()) { avisoVerificar(); return false; }
    return true;
  }
  // Errores de la API: 401 → ingresar; 403 con requiereVerificacion → aviso
  function errAuth(e, next) {
    if (e && e.status === 401) { C.yo = null; hint(false); pedirLogin(next); return true; }
    if (e && e.data && e.data.requiereVerificacion) { avisoVerificar(); return true; }
    return false;
  }

  /* ---------- Vistas de cuenta ---------- */
  const fieldErr = (id) => `<div id="${id}" class="sp-err" aria-live="polite"></div>`;
  const showErr = (id, msg) => { const el = document.getElementById(id); if (el) el.innerHTML = msg ? `<div class="notice danger">${icon('alert')}<span>${esc(msg)}</span></div>` : ''; };
  const val = (d, k) => String(d[k] == null ? '' : d[k]).trim();
  const wrapAuth = (inner) => `<div class="container"><div class="auth-wrap"><div class="auth-card">${inner}</div></div></div>`;
  function loginView() {
    if (C.forgot) {
      return wrapAuth(`<div><span class="eyebrow">Tu cuenta</span><h2>¿Olvidaste tu contraseña?</h2><p class="small muted" style="margin-top:4px">Escribí el email de tu cuenta y te mandamos un link para crear una nueva.</p></div>
        <form data-submit="clOlvide" class="stack" novalidate>
          <div class="field"><label for="clOEmail">Email</label><input class="input" id="clOEmail" name="email" type="email" autocomplete="email" inputmode="email" required></div>
          ${fieldErr('clOErr')}
          <button type="submit" class="btn lg block">Mandarme el link</button>
        </form>
        <p class="small center muted"><a href="#" data-action="clForgot" data-v="0">Volver a ingresar</a></p>`);
    }
    return wrapAuth(`<div><span class="eyebrow">Tu cuenta</span><h2>Entrá a tu cuenta</h2><p class="small muted" style="margin-top:4px">Para comprar packs y hacer pedidos personalizados.</p></div>
      <form data-submit="clLogin" class="stack" novalidate>
        <div class="field"><label for="clLEmail">Email</label><input class="input" id="clLEmail" name="email" type="email" autocomplete="email" inputmode="email" required></div>
        <div class="field"><label for="clLPass">Contraseña</label><input class="input" id="clLPass" name="password" type="password" autocomplete="current-password" required></div>
        ${fieldErr('clLErr')}
        <button type="submit" class="btn lg block">Entrar</button>
      </form>
      <p class="small center"><a href="#" data-action="clForgot" data-v="1">¿Olvidaste tu contraseña?</a></p>
      <p class="small center muted"><span>¿No tenés cuenta?</span> <a href="#cliente.registro" data-go="#cliente.registro">Creala gratis</a></p>
      <p class="tiny center muted"><span>¿Sos acompañante?</span> <a href="#login" data-go="#login">Entrá a tu panel</a></p>`);
  }
  function registroView() {
    return wrapAuth(`<div><span class="eyebrow">Tu cuenta</span><h2>Creá tu cuenta</h2><p class="small muted" style="margin-top:4px">Para comprar packs y hacer pedidos personalizados.</p></div>
      <form data-submit="clRegistro" class="stack" novalidate>
        <div class="field"><label for="clRUser">Nombre de usuario</label><input class="input" id="clRUser" name="usuario" minlength="3" maxlength="20" autocomplete="username" pattern="[A-Za-z0-9][A-Za-z0-9._\\-]{2,19}" required><span class="hint">Es lo que ven las acompañantes. Nunca ven tu email.</span><span class="hint">De 3 a 20 caracteres: letras, números, punto, guion o guion bajo.</span></div>
        <div class="field"><label for="clREmail">Email</label><input class="input" id="clREmail" name="email" type="email" autocomplete="email" inputmode="email" required><span class="hint">Te mandamos un link para confirmarlo.</span></div>
        <div class="field"><label for="clRPass">Contraseña</label><input class="input" id="clRPass" name="password" type="password" minlength="10" autocomplete="new-password" required><span class="hint">Mínimo 10 caracteres.</span></div>
        <label class="row nowrap small" style="gap:8px;align-items:flex-start"><input type="checkbox" name="mayorEdad" style="margin-top:3px" required><span>Soy mayor de 18 años.</span></label>
        <label class="row nowrap small" style="gap:8px;align-items:flex-start"><input type="checkbox" name="aceptaTerminos" style="margin-top:3px" required><span><span>Acepto los</span> <a href="/terminos" target="_blank" rel="noopener">Términos</a> <span>y la</span> <a href="/privacidad" target="_blank" rel="noopener">Política de privacidad</a>.</span></label>
        ${fieldErr('clRErr')}
        <button type="submit" class="btn lg block">Crear cuenta</button>
      </form>
      <p class="small center muted"><span>¿Ya tenés cuenta?</span> <a href="#cliente.ingresar" data-go="#cliente.ingresar">Ingresá</a></p>`);
  }
  const qParam = (k) => { try { return new URLSearchParams(location.search).get(k) || ''; } catch (e) { return ''; } };
  function verificarView() {
    const t = qParam('token');
    if (!C.verif || C.verif.token !== t) {
      C.verif = { token: t, state: t ? 'loading' : 'error', msg: t ? '' : 'El link no tiene el código de confirmación.' };
      if (t) api('POST', '/cliente/verificar-email', { token: t })
        .then(() => { C.verif.state = 'ok'; return loadYo(true); })
        .catch((e) => { C.verif.state = 'error'; C.verif.msg = e.message; })
        .finally(() => { if (/^cliente\.verificar/.test(HH.currentHash())) { HH.renderShell(); HH.refresh(); } });
    }
    const v = C.verif;
    const body = v.state === 'loading' ? `<div class="sp-skel"></div><p class="muted center">Confirmando tu email…</p>`
      : v.state === 'ok' ? `<div class="notice ok">${icon('checkCircle')}<span>Listo, confirmaste tu email.</span></div><button type="button" class="btn lg block" data-action="clSeguir">Seguir</button>`
        : `<div class="notice danger">${icon('alert')}<span>${esc(v.msg || 'El link no es válido o ya venció.')}</span></div><a class="btn secondary block" href="#favoritos" data-go="#favoritos">Tu espacio</a>`;
    return wrapAuth(`<div><span class="eyebrow">Tu cuenta</span><h2>Confirmar email</h2></div>${body}`);
  }
  function restablecerView() {
    if (!qParam('token')) return wrapAuth(`<h2>Nueva contraseña</h2><div class="notice danger">${icon('alert')}<span>El link no es válido o ya venció.</span></div><a class="btn block" href="#cliente.ingresar" data-go="#cliente.ingresar">Ingresar</a>`);
    return wrapAuth(`<div><span class="eyebrow">Tu cuenta</span><h2>Nueva contraseña</h2></div>
      <form data-submit="clRestablecer" class="stack" novalidate>
        <div class="field"><label for="clNP1">Contraseña nueva</label><input class="input" id="clNP1" name="password" type="password" minlength="10" autocomplete="new-password" required><span class="hint">Mínimo 10 caracteres.</span></div>
        <div class="field"><label for="clNP2">Repetila</label><input class="input" id="clNP2" name="password2" type="password" minlength="10" autocomplete="new-password" required></div>
        ${fieldErr('clNPErr')}
        <button type="submit" class="btn lg block">Guardar contraseña</button>
      </form>`);
  }
  const bannerVerif = () => (C.yo && !C.yo.emailVerificado
    ? `<div class="notice warn sp-banner">${icon('mail')}<span class="grow"><span>Confirmá tu email: te mandamos un link a</span> <strong data-noi18n>${esc(C.yo.email)}</strong>.</span><button type="button" class="btn sm secondary" data-action="clReenviar"${C.busy.reenviar ? ' disabled' : ''}>Reenviar</button></div>` : '');

  /* ---------- Tu espacio (favoritos): bloque de la cuenta del interesado ---------- */
  function espacio() {
    if (!C.loaded && hasHint()) return `<div class="sp-skel"></div>`;
    if (!C.yo) {
      return `<div class="sp-esp-card"><div class="grow"><strong>Comprá packs y hacé pedidos personalizados</strong><span class="small muted">Creá tu cuenta o ingresá.</span></div><div class="sp-esp-btns"><a class="btn sm" href="#cliente.registro" data-go="#cliente.registro">Crear cuenta</a><a class="btn secondary sm" href="#cliente.ingresar" data-go="#cliente.ingresar">Ingresar</a></div></div>`;
    }
    const n = noLeidos();
    return `${bannerVerif()}<div class="sp-esp-card cl-esp"><div class="grow"><strong data-noi18n>${esc(C.yo.usuario)}</strong><span class="small muted" data-noi18n>${esc(C.yo.email)}</span></div>
      <div class="sp-esp-btns"><a class="btn sm" href="#cliente.compras" data-go="#cliente.compras">${icon('bag')} Mis compras</a><a class="btn sm secondary" href="#cliente.pedidos" data-go="#cliente.pedidos">${icon('chat')} Mis pedidos${n ? `<span class="count">${n}</span>` : ''}</a><button type="button" class="btn ghost sm" data-action="clLogout">${icon('logout')} Cerrar sesión</button></div></div>
      <p class="tiny muted" style="margin:6px 2px 0">Para dar de baja tu cuenta, escribinos a contacto@sexyrose.net desde el email de la cuenta.</p>`;
  }

  /* ---------- Mis compras ---------- */
  const money = (m) => {
    const n = m && typeof m === 'object' ? Number(m.centavos) / 100 : Number(m || 0);
    try { return '$ ' + n.toLocaleString(HH.loc ? HH.loc() : 'es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); } catch (e) { return '$ ' + n; }
  };
  const head = (eyebrow, title, right) => `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h2>${title}</h2></div>${right || ''}</div>`;
  const skel = () => `<div class="sp-skel"></div><div class="sp-skel"></div>`;
  const ESTADO_V = { aprobada: ['ok', 'Aprobada'], en_proceso: ['warn', 'En proceso'], rechazada: ['danger', 'Rechazada'], reembolsada: ['neutral', 'Devuelta'], pendiente: ['neutral', 'En proceso'] };
  function cargar(k, path, map) {
    if (C.busy[k]) return; C.busy[k] = true;
    api('GET', path).then((d) => { C[k] = map ? map(d) : d; C[k + 'Err'] = null; }, (e) => { if (e.status === 401) { C.yo = null; hint(false); } C[k + 'Err'] = e.message; })
      .finally(() => { C.busy[k] = false; if (enCliente()) rerender(); });
  }
  function comprasView() {
    if (!C.compras && !C.comprasErr) cargar('compras', '/cliente/compras', (d) => d.items || []);
    const back = `<a class="small" href="#favoritos" data-go="#favoritos">${icon('arrowLeft')} Tu espacio</a>`;
    if (!C.compras) return `<div class="container section" style="max-width:720px">${back}${head('Tu cuenta', 'Mis compras')}${C.comprasErr ? `<div class="notice danger">${icon('alert')}<span>${esc(C.comprasErr)}</span></div>` : skel()}</div>`;
    const items = C.compras;
    return `<div class="container section" style="max-width:720px">${back}${head('Tu cuenta', 'Mis compras', `<button type="button" class="btn ghost sm" data-action="clRecargar" data-k="compras">${icon('refresh')} Actualizar</button>`)}${bannerVerif()}
      ${items.length ? `<div class="card"><div class="list">${items.map((x) => { const [cls, lb] = ESTADO_V[x.estado] || ESTADO_V.pendiente; return `<div class="list-item" style="flex-wrap:wrap;gap:8px">
        <div class="grow" style="min-width:0"><div class="title"><span data-noi18n>${esc(x.titulo)}</span></div><div class="sub">${x.vendedora ? `<a href="#perfil.${esc(x.vendedora.slug)}" data-go="#perfil.${esc(x.vendedora.slug)}" data-noi18n>${esc(x.vendedora.nombre)}</a> · ` : ''}<span data-noi18n>${esc(HH.fmtDateTime(x.pagado || x.creado))}</span></div></div>
        <strong class="num" data-noi18n>${esc(money(x.monto))}</strong><span class="badge ${cls}">${lb}</span>
        ${x.estado === 'aprobada' && x.link ? `<a class="btn sm" href="${esc(x.link)}" target="_blank" rel="noopener noreferrer nofollow">${icon('external')} Abrir pack</a>` : `<a class="btn sm secondary" href="#compra.${esc(x.token)}" data-go="#compra.${esc(x.token)}">Ver</a>`}
      </div>`; }).join('')}</div></div>` : `<div class="empty">${icon('bag')}<h4>Todavía no compraste packs</h4></div>`}
    </div>`;
  }

  /* ---------- Pedidos: listas ---------- */
  const ESTADO_P = { pendiente: ['warn', 'Esperando respuesta'], aceptada: ['ok', 'Aceptado'], rechazada: ['danger', 'Rechazado'], cerrada: ['neutral', 'Cerrado'] };
  function filaPedido(x, rol) {
    const [cls, lb] = ESTADO_P[x.estado] || ESTADO_P.pendiente;
    const quien = rol === 'cliente' ? (x.acompanante && x.acompanante.nombre) || '' : '@' + ((x.cliente && x.cliente.usuario) || '');
    const href = rol === 'cliente' ? '#cliente.pedido.' + x.id : '#panel.pedidos.' + x.id;
    return `<a class="list-item cl-row" href="${href}" data-go="${href}">
      <span class="grow"><span class="title row" style="gap:6px"><span data-noi18n>${esc(quien)}</span>${x.noLeidos ? `<span class="count">${x.noLeidos}</span>` : ''}</span><span class="sub ellipsis" data-noi18n>${esc(x.texto)}</span><span class="tiny muted" data-noi18n>${esc(HH.fmtDateTime(x.actividad))}</span></span>
      <span class="badge ${cls}">${lb}</span></a>`;
  }
  function pedidosView() {
    if (!C.lista && !C.listaErr) cargar('lista', '/cliente/pedidos');
    const back = `<a class="small" href="#favoritos" data-go="#favoritos">${icon('arrowLeft')} Tu espacio</a>`;
    const right = `<button type="button" class="btn ghost sm" data-action="clRecargar" data-k="lista">${icon('refresh')} Actualizar</button>`;
    if (!C.lista) return `<div class="container section" style="max-width:720px">${back}${head('Tu cuenta', 'Mis pedidos', right)}${C.listaErr ? `<div class="notice danger">${icon('alert')}<span>${esc(C.listaErr)}</span></div>` : skel()}</div>`;
    const items = C.lista.items || [];
    return `<div class="container section" style="max-width:720px">${back}${head('Tu cuenta', 'Mis pedidos', right)}${bannerVerif()}
      ${items.length ? `<div class="card"><div class="list">${items.map((x) => filaPedido(x, 'cliente')).join('')}</div></div>` : `<div class="empty">${icon('chat')}<h4>Todavía no hiciste pedidos</h4></div>`}</div>`;
  }

  /* ---------- Chat del pedido (cliente y acompañante) ---------- */
  const base = (rol) => (rol === 'cliente' ? '/cliente/pedidos' : '/cuenta/solicitudes');
  const archivo = (rol, id, prev) => '/api' + base(rol) + '/items/' + encodeURIComponent(id) + '/archivo' + (prev ? '?preview=1' : '');
  function cargarChat(rol, id, primera) {
    const key = rol + ':' + id;
    const since = C.chat && C.chatKey === key ? C.chat.ultimo || 0 : 0;
    return api('GET', base(rol) + '/' + encodeURIComponent(id) + (since ? '?since=' + since : ''))
      .then((d) => {
        if (C.chatKey !== key) return;
        const antes = C.chat;
        if (!antes || primera) { C.chat = d; C.chatErr = null; if (enChat(rol, id)) rerender(); return; }
        const nuevos = d.mensajes || [];
        const cambioEstado = antes.solicitud.estado !== d.solicitud.estado || antes.puedeEnviarContenido !== d.puedeEnviarContenido;
        const itemsAntes = JSON.stringify(antes.items); const itemsAhora = JSON.stringify(d.items);
        antes.mensajes = antes.mensajes.concat(nuevos.filter((m) => !antes.mensajes.some((x) => x.id === m.id)));
        antes.items = d.items; antes.solicitud = d.solicitud; antes.ultimo = Math.max(antes.ultimo || 0, d.ultimo || 0); antes.puedeEnviarContenido = d.puedeEnviarContenido;
        if (!enChat(rol, id)) return;
        if (cambioEstado) { rerender(); return; }
        if (nuevos.length || itemsAntes !== itemsAhora) pintarMensajes(rol);
      }, (e) => {
        if (C.chatKey !== key) return;
        if (e.status === 401) { if (rol === 'cliente') { C.yo = null; hint(false); pedirLogin(); } return; }
        if (!C.chat) { C.chatErr = e; if (enChat(rol, id)) rerender(); }
      })
      .finally(() => programar(rol, id));
  }
  function enChat(rol, id) { const k = HH.currentHash(); return rol === 'cliente' ? k === 'cliente.pedido.' + id : k === 'panel.pedidos.' + id; }
  function programar(rol, id) {
    clearTimeout(C.poll);
    if (!enChat(rol, id) || C.chatKey !== rol + ':' + id) return;
    C.poll = setTimeout(() => { if (enChat(rol, id)) cargarChat(rol, id, false); }, document.hidden ? 15000 : 4000);
  }
  // Volver a la pestaña: consulta enseguida
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !C.chatKey) return;
    const [rol, id] = C.chatKey.split(':');
    if (enChat(rol, id)) { clearTimeout(C.poll); cargarChat(rol, id, false); }
  });
  function sistema(texto, rol) {
    if (texto === 'aceptada') return 'Pedido aceptado. Ya pueden hablar por acá.';
    if (texto === 'rechazada') return rol === 'cliente' ? 'La acompañante rechazó el pedido.' : 'Rechazaste este pedido.';
    if (/^cerrada/.test(texto)) return 'El pedido se cerró.';
    return '';
  }
  function itemHtml(rol, it) {
    if (!it) return '';
    const precio = `<strong class="num" data-noi18n>${esc(money(it.precio))}</strong>`;
    if (it.estado === 'vencido') return `<div class="ch-item ch-vencido">${icon('clock')} <span>Este contenido venció</span></div>`;
    if (it.estado === 'procesando') return `<div class="ch-item"><div class="sp-skel" style="height:120px"></div><span class="small muted">Procesando…</span> ${precio}</div>`;
    if (it.estado === 'error') return `<div class="ch-item"><div class="notice danger">${icon('alert')}<span data-noi18n>${esc(it.error || '')}</span></div></div>`;
    const ar = it.ancho && it.alto ? `aspect-ratio:${it.ancho}/${it.alto};` : '';
    if (it.desbloqueado) {
      const media = it.tipo === 'video'
        ? `<video src="${esc(archivo(rol, it.id))}" controls playsinline preload="metadata" controlslist="nodownload" disablepictureinpicture style="${ar}"></video>`
        : `<img src="${esc(archivo(rol, it.id))}" alt="" loading="lazy" decoding="async" style="${ar}">`;
      const pie = rol === 'acompanante'
        ? `<span class="badge ${it.pagado ? 'ok' : 'neutral'}">${it.pagado ? 'Pagado' : 'Sin pagar'}</span> ${precio}`
        : `<span class="badge ok">${icon('check')} Pagado</span>`;
      const vence = it.vence ? `<span class="tiny muted"><span>Vence el {x}</span></span>`.replace('{x}', `<span data-noi18n>${esc(HH.fmtDate(it.vence, { day: 'numeric', month: 'long' }))}</span>`) : '';
      return `<div class="ch-item">${media}<div class="row" style="gap:8px;flex-wrap:wrap">${pie} ${vence}</div></div>`;
    }
    const prev = it.preview ? `<img class="ch-blur" src="${esc(archivo(rol, it.id, true))}" alt="" loading="lazy" decoding="async" style="${ar}">` : '';
    const lock = `<span class="ch-lock">${icon('lock')}${it.tipo === 'video' ? icon('play') : ''}</span>`;
    const accion = it.pagoEnProceso
      ? `<span class="badge warn">${icon('clock')} Pago en proceso</span><button type="button" class="btn ghost sm" data-action="clVerificarPagos">${icon('refresh')} Actualizar</button>`
      : `<button type="button" class="btn sm" data-action="clPagar" data-id="${esc(it.id)}">${icon('wallet')} Pagar con Mercado Pago</button>`;
    return `<div class="ch-item"><div class="ch-prev">${prev}${lock}</div><div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">${precio} ${accion}</div></div>`;
  }
  function mensajesHtml(rol) {
    const d = C.chat; if (!d) return '';
    const items = new Map((d.items || []).map((i) => [i.id, i]));
    return (d.mensajes || []).map((m) => {
      if (m.autor === 'sistema') { const t = sistema(m.texto, rol); return t ? `<div class="ch-sys"><span>${t}</span></div>` : ''; }
      const mio = m.autor === rol;
      const cuerpo = m.itemId ? itemHtml(rol, items.get(m.itemId)) : `<div class="ch-txt" data-noi18n>${esc(m.texto || '').replace(/\n/g, '<br>')}</div>`;
      return `<div class="ch-msg${mio ? ' mio' : ''}">${cuerpo}<span class="ch-hora" data-noi18n>${esc(HH.fmtDateTime(m.creado))}</span></div>`;
    }).join('');
  }
  function pintarMensajes(rol) {
    const box = document.getElementById('chMsgs'); if (!box) return;
    const abajo = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.innerHTML = mensajesHtml(rol);
    if (HH.lang !== 'es' && HH.translateNode) HH.translateNode(box);
    if (abajo) box.scrollTop = box.scrollHeight;
  }
  function chatView(rol, id) {
    if (!/^[0-9a-f-]{36}$/i.test(id || '')) { HH.go(rol === 'cliente' ? '#cliente.pedidos' : '#panel.pedidos', { replace: true }); return false; }
    const key = rol + ':' + id;
    if (C.chatKey !== key) {
      C.chatKey = key; C.chat = null; C.chatErr = null; clearTimeout(C.poll);
      const pid = rol === 'cliente' ? qParam('payment_id') || qParam('collection_id') : '';
      const inicio = rol === 'cliente' && (pid || qParam('external_reference') || qParam('status'))
        ? api('POST', '/cliente/pedidos/' + id + '/verificar-pagos', { paymentId: /^\d{1,30}$/.test(pid) ? pid : null }).catch(() => {}).then(() => { try { history.replaceState(history.state, '', location.pathname); } catch (e) { /* */ } })
        : Promise.resolve();
      inicio.then(() => cargarChat(rol, id, true));
    } else if (!C.poll) programar(rol, id);
    const volver = rol === 'cliente' ? `<a class="small" href="#cliente.pedidos" data-go="#cliente.pedidos">${icon('arrowLeft')} Mis pedidos</a>` : `<a class="small" href="#panel.pedidos" data-go="#panel.pedidos">${icon('arrowLeft')} Pedidos</a>`;
    const wrap = (inner) => (rol === 'cliente' ? `<div class="container section cl-chat-wrap" style="max-width:760px">${volver}${inner}</div>` : `${volver}${inner}`);
    if (!C.chat) {
      if (C.chatErr) return wrap(`<div class="notice danger" style="margin-top:12px">${icon('alert')}<span>${esc(C.chatErr.message)}</span></div>`);
      return wrap(skel());
    }
    const d = C.chat; const s = d.solicitud;
    const [cls, lb] = ESTADO_P[s.estado] || ESTADO_P.pendiente;
    const titulo = rol === 'cliente' ? `<span>Tu pedido</span> · ${s.acompanante && s.acompanante.slug ? `<a href="#perfil.${esc(s.acompanante.slug)}" data-go="#perfil.${esc(s.acompanante.slug)}" data-noi18n>${esc(s.acompanante.nombre)}</a>` : ''}`
      : `<span>Pedido de</span> <span data-noi18n>@${esc((s.cliente && s.cliente.usuario) || '')}</span>`;
    const pedido = `<div class="ch-pedido"><div class="tiny muted" data-noi18n>${esc(HH.fmtDateTime(s.creado))}</div><div data-noi18n>${esc(s.texto).replace(/\n/g, '<br>')}</div></div>`;
    let pie = '';
    if (s.estado === 'pendiente') {
      pie = rol === 'acompanante'
        ? `<div class="row" style="gap:8px"><button type="button" class="btn" data-action="clResponder" data-v="1"${C.busy.resp ? ' disabled' : ''}>${icon('check')} Aceptar</button><button type="button" class="btn ghost" data-action="clResponder" data-v="0"${C.busy.resp ? ' disabled' : ''}>${icon('x')} Rechazar</button></div>`
        : `<div class="notice">${icon('clock')}<span>Esperando que la acompañante responda.</span></div>`;
    } else if (s.estado === 'aceptada') {
      const up = C.up ? `<div class="sp-prog"><i style="width:${Math.round((C.up.p || 0) * 100)}%"></i></div><span class="small muted">Subiendo…</span>` : '';
      pie = `<form class="ch-form" data-submit="clEnviar" novalidate><label class="sr-only" for="chTxt">Escribí un mensaje</label><textarea class="textarea" id="chTxt" name="texto" rows="1" maxlength="1000" placeholder="Escribí un mensaje" autocomplete="off"></textarea><button type="submit" class="btn" aria-label="Enviar" title="Enviar">${icon('send')}</button></form>
        ${up}
        <div class="row" style="gap:8px;flex-wrap:wrap">${rol === 'acompanante' && d.puedeEnviarContenido ? `<button type="button" class="btn secondary sm" data-action="clItemNuevo"${C.up ? ' disabled' : ''}>${icon('lock')} Enviar contenido bloqueado</button>` : ''}<button type="button" class="btn ghost sm" data-action="clCerrar">Cerrar pedido</button></div>`;
    } else if (s.estado === 'cerrada') {
      pie = `<div class="notice">${icon('info')}<span>Este pedido está cerrado.</span></div>`;
    }
    return wrap(`<div class="card stack cl-chat" style="gap:10px;margin-top:10px">
      <div class="row between" style="gap:8px;align-items:center"><div class="card-title" style="min-width:0">${titulo}</div><span class="badge ${cls}">${lb}</span></div>
      ${pedido}
      <div id="chMsgs" class="ch-msgs" aria-live="polite">${mensajesHtml(rol)}</div>
      ${pie}
    </div>`);
  }
  // Abajo de todo al abrir
  document.addEventListener('hh:rendered', () => { const b = document.getElementById('chMsgs'); if (b) b.scrollTop = b.scrollHeight; });

  /* ---------- Panel de la acompañante: Pedidos ---------- */
  const P = { lista: null, err: null, busy: false };
  function panelPedidos(sub) {
    if (sub) return chatView('acompanante', sub);
    if (C.chatKey) { C.chatKey = null; C.chat = null; clearTimeout(C.poll); }
    if (!P.lista && !P.err && !P.busy) {
      P.busy = true;
      api('GET', '/cuenta/solicitudes').then((d) => { P.lista = d; P.err = null; }, (e) => { P.err = e.message; })
        .finally(() => { P.busy = false; if (/^panel\.pedidos$/.test(HH.currentHash())) rerender(); });
    }
    const h = `<div class="page-head"><div><div class="eyebrow">Pedidos personalizados</div><h2>Tus pedidos</h2><p class="muted small" style="margin-top:4px;max-width:62ch">Con tu plan y Mercado Pago conectado, los clientes te pueden hacer pedidos personalizados desde tu perfil.</p></div><button type="button" class="btn ghost sm" data-action="clPanelRecargar">${icon('refresh')} Actualizar</button></div>`;
    if (!P.lista) return h + (P.err ? `<div class="notice danger">${icon('alert')}<span>${esc(P.err)}</span></div>` : skel());
    const items = P.lista.items || [];
    return h + (items.length ? `<div class="card"><div class="list">${items.map((x) => filaPedido(x, 'acompanante')).join('')}</div></div>`
      : `<div class="empty">${icon('chat')}<h4>Todavía no te llegaron pedidos</h4><p class="small">Los pedidos personalizados son para los planes Oro y Star con Mercado Pago conectado.</p></div>`);
  }
  // Al salir del panel de pedidos, la lista se vuelve a pedir la próxima vez
  document.addEventListener('hh:rendered', () => { const k = HH.currentHash(); if (!/^panel\.pedidos/.test(k)) P.lista = null; if (!/^(cliente\.pedido\.|panel\.pedidos\.)/.test(k) && C.chatKey) { C.chatKey = null; C.chat = null; clearTimeout(C.poll); } if (!/^cliente\.pedidos$/.test(k)) C.lista = null; if (!/^cliente\.compras$/.test(k)) C.compras = null; });

  /* ---------- Perfil: "Pedido personalizado" ---------- */
  function pedidoPerfil(slug) {
    return `<section class="card stack cl-ped-perfil" style="gap:8px" aria-label="Pedido personalizado">
      <div class="card-title">${icon('gift')} Pedido personalizado</div>
      <p class="small muted" style="margin:0">Pedile algo a medida. Si acepta, se abre un chat con ella.</p>
      <div class="row"><button type="button" class="btn sm" data-action="clPedir" data-slug="${esc(slug)}">${icon('chat')} Hacer un pedido</button></div>
    </section>`;
  }

  /* ---------- Rutas ---------- */
  function view(sub) {
    const [a, b] = sub;
    if (a === 'ingresar') { if (C.yo) { irNext('#favoritos'); return false; } return loginView(); }
    if (a === 'registro') { if (C.yo) { irNext('#favoritos'); return false; } return registroView(); }
    if (a === 'verificar') return verificarView();
    if (a === 'restablecer') return restablecerView();
    if (!C.loaded) return `<div class="container section">${skel()}</div>`;
    if (!C.yo) { setNext(HH.currentHash()); HH.go('#cliente.ingresar', { replace: true }); return false; }
    if (a === 'compras') return comprasView();
    if (a === 'pedidos') return pedidosView();
    if (a === 'pedido') return chatView('cliente', b);
    HH.go('#favoritos', { replace: true }); return false;
  }

  /* ---------- Acciones ---------- */
  Object.assign(HH.actions, {
    clForgot(el) { C.forgot = el.dataset.v === '1'; HH.refresh(); },
    async clLogin(form, ev, data) {
      showErr('clLErr', ''); const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      try { const r = await api('POST', '/cliente/login', { email: val(data, 'email'), password: data.password || '' }); C.yo = r.cliente || null; hint(!!C.yo); HH.renderShell(); irNext('#favoritos'); }
      catch (e) { showErr('clLErr', e.message); btn.disabled = false; }
    },
    async clRegistro(form, ev, data) {
      showErr('clRErr', '');
      const body = { usuario: val(data, 'usuario'), email: val(data, 'email'), password: data.password || '', mayorEdad: !!data.mayorEdad, aceptaTerminos: !!data.aceptaTerminos };
      if (!body.mayorEdad) return showErr('clRErr', 'Tenés que confirmar que sos mayor de 18 años.');
      if (!body.aceptaTerminos) return showErr('clRErr', 'Tenés que aceptar los Términos y la Política de privacidad.');
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      try { const r = await api('POST', '/cliente/registro', body); C.yo = r.cliente || null; hint(!!C.yo); HH.renderShell(); HH.toast('Cuenta creada. Te mandamos un email para confirmarla.', { type: 'ok', ms: 5000 }); irNext('#favoritos'); }
      catch (e) { showErr('clRErr', e.message); btn.disabled = false; }
    },
    async clOlvide(form, ev, data) {
      showErr('clOErr', ''); const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      try { const r = await api('POST', '/cliente/olvide', { email: val(data, 'email') }); form.outerHTML = `<div class="notice ok">${icon('mail')}<span>${esc(r.mensaje || '')}</span></div>`; }
      catch (e) { showErr('clOErr', e.message); btn.disabled = false; }
    },
    async clRestablecer(form, ev, data) {
      showErr('clNPErr', '');
      if ((data.password || '').length < 10) return showErr('clNPErr', 'La contraseña tiene que tener al menos 10 caracteres.');
      if (data.password !== data.password2) return showErr('clNPErr', 'Las dos contraseñas no coinciden.');
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      try { const r = await api('POST', '/cliente/restablecer', { token: qParam('token'), password: data.password }); C.yo = r.cliente || null; hint(!!C.yo); C.forgot = false; HH.renderShell(); HH.toast('Listo, ya podés seguir con tu contraseña nueva.', { type: 'ok' }); irNext('#favoritos'); }
      catch (e) { showErr('clNPErr', e.message); btn.disabled = false; }
    },
    clSeguir() { irNext('#favoritos'); },
    async clReenviar() {
      if (C.busy.reenviar) return; C.busy.reenviar = true;
      try { await api('POST', '/cliente/reenviar-verificacion', {}); HH.toast('Te mandamos el email de nuevo.', { type: 'ok' }); } catch (e) { HH.toast(e.message, { type: 'danger' }); }
      C.busy.reenviar = false;
    },
    async clLogout() {
      try { await api('POST', '/cliente/logout', {}); } catch (e) { /* igual se cierra */ }
      C.yo = null; hint(false); C.compras = null; C.lista = null; HH.renderShell(); HH.toast('Sesión cerrada'); if (enCliente()) HH.go('#favoritos'); else HH.refresh();
    },
    clRecargar(el) { const k = el.dataset.k; C[k] = null; C[k + 'Err'] = null; HH.refresh(); },
    clPanelRecargar() { P.lista = null; P.err = null; HH.refresh(); },
    clPedir(el) {
      const slug = el.dataset.slug;
      if (!asegurar('#perfil.' + slug)) return;
      HH.modal({ title: 'Pedido personalizado', body: `<form id="clPedForm" class="stack" style="gap:8px" novalidate data-submit="clPedirEnviar" data-slug="${esc(slug)}">
          <label for="clPedTxt" class="small"><strong>¿Qué querés pedir?</strong></label>
          <textarea class="textarea" id="clPedTxt" name="texto" rows="5" maxlength="500" required></textarea>
          <span class="tiny muted">Contale qué querés. Hasta 500 caracteres.</span>
          <div id="clPedErr" class="sp-err" aria-live="polite"></div>
          <button type="submit" class="btn block">${icon('send')} Enviar pedido</button>
        </form>`, actions: [] });
      setTimeout(() => { const t = document.getElementById('clPedTxt'); if (t) t.focus(); }, 30);
    },
    async clPedirEnviar(form, ev, data) {
      const slug = form.dataset.slug; showErr('clPedErr', '');
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        const r = await api('POST', '/cliente/pedidos', { slug, texto: String(data.texto || '').trim() });
        HH.closeModal(); HH.toast('Pedido enviado.', { type: 'ok' }); HH.go('#cliente.pedido.' + r.id);
      } catch (e) {
        btn.disabled = false;
        if (e.data && e.data.solicitudId) { HH.closeModal(); HH.toast(e.message); HH.go('#cliente.pedido.' + e.data.solicitudId); return; }
        if (errAuth(e, '#perfil.' + slug)) { HH.closeModal(); return; }
        showErr('clPedErr', e.message);
      }
    },
    async clEnviar(form, ev, data) {
      const [rol, id] = (C.chatKey || '').split(':'); if (!id) return;
      const txt = String(data.texto || '').trim(); if (!txt) return;
      const ta = form.querySelector('textarea'); const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        const r = await api('POST', base(rol) + '/' + id + '/mensajes', { texto: txt });
        if (ta) { ta.value = ''; ta.style.height = ''; }
        if (C.chat && r.mensaje && !C.chat.mensajes.some((m) => m.id === r.mensaje.id)) { C.chat.mensajes.push(r.mensaje); }
        pintarMensajes(rol); const box = document.getElementById('chMsgs'); if (box) box.scrollTop = box.scrollHeight;
      } catch (e) { if (!errAuth(e)) HH.toast(e.message, { type: 'danger' }); }
      btn.disabled = false; if (ta) ta.focus();
    },
    clResponder(el) {
      const [rol, id] = (C.chatKey || '').split(':'); if (rol !== 'acompanante') return;
      const acepta = el.dataset.v === '1';
      const go = async () => {
        C.busy.resp = true; rerender();
        try { await api('POST', '/cuenta/solicitudes/' + id + (acepta ? '/aceptar' : '/rechazar'), {}); C.chat = null; await cargarChat(rol, id, true); } catch (e) { HH.toast(e.message, { type: 'danger', ms: 6000 }); }
        C.busy.resp = false; rerender();
      };
      if (acepta) go(); else HH.confirm({ title: 'Rechazar pedido', text: '¿Querés rechazar este pedido? No se abre el chat.', okLabel: 'Rechazar', cls: 'danger', onOk: go });
    },
    clCerrar() {
      const [rol, id] = (C.chatKey || '').split(':'); if (!id) return;
      HH.confirm({ title: 'Cerrar pedido', text: '¿Querés cerrar este pedido? El chat queda de solo lectura.', okLabel: 'Cerrar pedido', cls: 'danger', onOk: async () => {
        try { await api('POST', base(rol) + '/' + id + '/cerrar', {}); C.chat = null; await cargarChat(rol, id, true); } catch (e) { HH.toast(e.message, { type: 'danger' }); }
      } });
    },
    clItemNuevo() {
      HH.modal({ title: 'Enviar contenido bloqueado', body: `<form class="stack" style="gap:10px" novalidate data-submit="clItemEnviar">
          <div class="field"><label for="clItFile">Foto o video (hasta 60 segundos)</label><input class="input" id="clItFile" name="archivo" type="file" accept="image/*,video/mp4,video/quicktime,video/webm,video/3gpp" required></div>
          <div class="field"><label for="clItPrecio">Precio (pesos argentinos)</label><input class="input" id="clItPrecio" name="precio" type="number" inputmode="decimal" min="100" max="10000000" step="0.01" required></div>
          <p class="tiny muted" style="margin:0">Se ve borroso hasta que paga. Calidad máxima 720p. Vence a 1 mes del pago.</p>
          <div id="clItErr" class="sp-err" aria-live="polite"></div>
          <button type="submit" class="btn block">${icon('lock')} Enviar contenido bloqueado</button>
        </form>`, actions: [] });
    },
    async clItemEnviar(form) {
      const [rol, id] = (C.chatKey || '').split(':'); if (rol !== 'acompanante') return;
      showErr('clItErr', '');
      const f = form.archivo.files[0]; const precio = String(form.precio.value || '').trim();
      if (!f) return showErr('clItErr', 'Elegí una foto o un video.');
      if (!precio) return showErr('clItErr', 'Poné el precio.');
      const esVideo = /^video\//.test(f.type || '') || /\.(mp4|mov|webm|3gp)$/i.test(f.name || '');
      if (esVideo && f.size > 95 * 1024 * 1024) return showErr('clItErr', 'El video pesa más de 95 MB. Recortalo o grabalo en menor calidad.');
      if (!esVideo && f.size > 12 * 1024 * 1024) return showErr('clItErr', 'La foto pesa más de 12 MB.');
      HH.closeModal();
      const fd = new FormData(); fd.append('precio', precio); fd.append('archivo', f);
      C.up = { p: 0 }; pintarPie();
      try {
        await new Promise((resolve, reject) => {
          const x = new XMLHttpRequest();
          x.open('POST', '/api/cuenta/solicitudes/' + id + '/items'); x.withCredentials = true;
          x.setRequestHeader('X-SR', '1'); x.setRequestHeader('Accept', 'application/json');
          if (x.upload) x.upload.onprogress = (e) => { if (e.lengthComputable && C.up) { C.up.p = e.loaded / e.total; const bar = document.querySelector('.cl-chat .sp-prog i'); if (bar) bar.style.width = Math.round(C.up.p * 100) + '%'; } };
          x.onload = () => { let d = null; try { d = JSON.parse(x.responseText); } catch (e) { /* */ } if (x.status >= 200 && x.status < 300) resolve(d || {}); else reject(new Error((d && d.error) || 'No se pudo subir (' + x.status + ').')); };
          x.onerror = () => reject(new Error('No hay conexión. Revisá internet y probá de nuevo.'));
          x.send(fd);
        });
        HH.toast(esVideo ? 'Recibimos el video. Se manda apenas termine de procesarse.' : 'Contenido enviado.', { type: 'ok' });
      } catch (e) { HH.toast(e.message, { type: 'danger', ms: 6000 }); }
      C.up = null; rerender(); clearTimeout(C.poll); cargarChat(rol, id, false);
    },
    async clPagar(el) {
      if (!asegurar(HH.currentHash())) return;
      if (el.disabled) return; el.disabled = true;
      try { const r = await api('POST', '/cliente/pedidos/items/' + el.dataset.id + '/pagar', {}); if (r && r.url) { location.href = r.url; return; } }
      catch (e) { if (!errAuth(e)) HH.toast(e.message, { type: 'danger' }); }
      el.disabled = false;
    },
    async clVerificarPagos() {
      const [rol, id] = (C.chatKey || '').split(':'); if (rol !== 'cliente') return;
      try { await api('POST', '/cliente/pedidos/' + id + '/verificar-pagos', {}); } catch (e) { /* */ }
      clearTimeout(C.poll); cargarChat(rol, id, false);
    },
  });
  function pintarPie() { rerender(); }
  // El textarea del chat crece con el texto (hasta 5 renglones) y Enter manda (Shift+Enter = renglón nuevo)
  document.addEventListener('input', (ev) => { const t = ev.target; if (t && t.id === 'chTxt') { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 140) + 'px'; } });
  document.addEventListener('keydown', (ev) => {
    const t = ev.target;
    if (t && t.id === 'chTxt' && ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing && window.matchMedia('(hover: hover)').matches) { ev.preventDefault(); const f = t.closest('form'); if (f) f.requestSubmit(); }
  });

  /* ---------- Arranque: sesión del cliente ---------- */
  const boot0 = HH.boot;
  HH.boot = function () {
    const r = boot0.apply(this, arguments);
    loadYo(false).then(() => { HH.renderShell(); if (enCliente() || HH.currentHash() === 'favoritos' || /^perfil\./.test(HH.currentHash())) HH.refresh(); });
    return r;
  };

  HH.spClientes = { view, espacio, panelPedidos, pedidoPerfil, logged, verificado, asegurar, pedirLogin, errAuth, noLeidos, loadYo };
})();
