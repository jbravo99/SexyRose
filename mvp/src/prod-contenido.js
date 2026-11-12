/* ============================================================
   SexyRose — prod-contenido.js (solo el sitio real): venta de contenido con Mercado Pago.
   - Panel → Contenido: conectar/desconectar Mercado Pago, cargar contenidos (título, descripción, precio en pesos y
     el link de la acompañante) y ver las ventas. API: /api/cuenta/contenido (app/routes/cuenta-contenido.js).
   - Perfil público: sección "Contenido" con "Comprar" → Checkout Pro de Mercado Pago. Desde el 12/11/2026 (Juan) hay
     que tener cuenta de cliente con el email confirmado (prod-clientes.js): sin sesión, "Comprar" lleva a ingresar y
     vuelve al perfil. Si el cliente ya lo compró, el perfil muestra "Ver pack" (sale de Mis compras).
   - /compra/<token>: estado del pago y, cuando se aprueba, el link. Solo la ve el cliente que compró (con su sesión).
   - Debajo, "Pedido personalizado" (planes Oro y Star): prod-clientes.js.
   - En la demo (/demo/) no hace nada: ahí no hay /api.
   ============================================================ */
(function () {
  'use strict';
  if (window.HH_PROD !== 'sitio' || !window.HH || window.HH_DEMO) return;
  const HH = window.HH;
  const esc = HH.esc, icon = HH.icon;
  const api = (m, p, b) => HH.sitioApi(m, p, b);
  const S = { panel: null, panelErr: null, cargando: false, editar: null, nuevo: false, compra: null, compraTk: null, compraErr: null, poll: null, perfil: new Map(), busy: {}, mis: null };

  Object.assign(HH.I18N = HH.I18N || {}, {
    'Contenido': ['Content', 'Conteúdo'],
    'Vendé tus packs': ['Sell your packs', 'Venda seus packs'],
    'Cargá el link a tu pack y su precio. Quien lo compra paga con Mercado Pago y, apenas se aprueba el pago, ve tu link.': ['Add the link to your pack and its price. Buyers pay with Mercado Pago and see your link as soon as the payment is approved.', 'Adicione o link do seu conteúdo e o preço. Quem compra paga com Mercado Pago e vê seu link assim que o pagamento é aprovado.'],
    'La venta de contenido todavía no está disponible.': ['Content sales are not available yet.', 'A venda de conteúdo ainda não está disponível.'],
    'Conectada': ['Connected', 'Conectada'],
    'Desde el {x}': ['Since {x}', 'Desde {x}'],
    'El dinero de cada venta se acredita en tu cuenta de Mercado Pago.': ['The money from each sale goes to your Mercado Pago account.', 'O dinheiro de cada venda é creditado na sua conta do Mercado Pago.'],
    'Conectá tu cuenta de Mercado Pago para cobrar tus ventas. El dinero de cada venta va directo a tu cuenta.': ['Connect your Mercado Pago account to get paid. The money from each sale goes straight to your account.', 'Conecte sua conta do Mercado Pago para receber suas vendas. O dinheiro de cada venda vai direto para sua conta.'],
    'Volvé a conectar Mercado Pago para seguir vendiendo. Mientras tanto, tus packs no se pueden comprar.': ['Reconnect Mercado Pago to keep selling. Until then, your packs cannot be bought.', 'Conecte o Mercado Pago de novo para continuar vendendo. Enquanto isso, seus conteúdos não podem ser comprados.'],
    'Conectar Mercado Pago': ['Connect Mercado Pago', 'Conectar Mercado Pago'],
    'Desconectar': ['Disconnect', 'Desconectar'],
    'Desconectar Mercado Pago': ['Disconnect Mercado Pago', 'Desconectar Mercado Pago'],
    'Tus packs dejan de poder comprarse hasta que vuelvas a conectar.': ['Your packs can no longer be bought until you reconnect.', 'Seus packs não poderão ser comprados até você conectar de novo.'],
    'Por cada venta, SexyRose cobra una comisión del {n} % y Mercado Pago descuenta su costo; el resto se acredita en tu cuenta.': ['For each sale, SexyRose charges a {n} % commission and Mercado Pago deducts its fee; the rest goes to your account.', 'Em cada venda, a SexyRose cobra uma comissão de {n} % e o Mercado Pago desconta a sua taxa; o restante vai para sua conta.'],
    'Tus packs': ['Your packs', 'Seus packs'],
    'Todavía no cargaste packs': ['You have not added packs yet', 'Você ainda não adicionou packs'],
    'Tu plan no incluye la venta de packs.': ['Your plan does not include selling packs.', 'Seu plano não inclui a venda de packs.'],
    'Tu plan permite {n} pack': ['Your plan allows {n} pack', 'Seu plano permite {n} pack'],
    'Tu plan permite {n} packs': ['Your plan allows {n} packs', 'Seu plano permite {n} packs'],
    'Tu plan permite packs ilimitados': ['Your plan allows unlimited packs', 'Seu plano permite packs ilimitados'],
    'No está a la venta: supera el límite de tu plan': ['Not on sale: over your plan limit', 'Não está à venda: passa do limite do seu plano'],
    'Se muestran en tu perfil cuando tu cuenta de Mercado Pago está conectada.': ['They show on your profile while your Mercado Pago account is connected.', 'Aparecem no seu perfil enquanto sua conta do Mercado Pago estiver conectada.'],
    'Agregar pack': ['Add pack', 'Adicionar pack'],
    'Editar pack': ['Edit pack', 'Editar pack'],
    'Título': ['Title', 'Título'],
    'Descripción (opcional)': ['Description (optional)', 'Descrição (opcional)'],
    'Precio (pesos argentinos)': ['Price (Argentine pesos)', 'Preço (pesos argentinos)'],
    'Link a tu pack': ['Link to your pack', 'Link do seu pack'],
    'Lo ve solo quien lo compra, después de pagar. Tiene que empezar con https://': ['Only the buyer sees it, after paying. It must start with https://', 'Só quem compra vê, depois de pagar. Tem que começar com https://'],
    'Guardar': ['Save', 'Salvar'],
    'Cancelar': ['Cancel', 'Cancelar'],
    'Editar': ['Edit', 'Editar'],
    'Borrar': ['Delete', 'Apagar'],
    'Borrar pack': ['Delete pack', 'Apagar pack'],
    '¿Querés borrar este pack? Quien ya lo compró lo sigue viendo.': ['Delete this pack? People who already bought it can still see it.', 'Apagar este pack? Quem já comprou continua vendo.'],
    'Pack guardado.': ['Pack saved.', 'Pack salvo.'],
    'Pack borrado.': ['Pack deleted.', 'Pack apagado.'],
    'Ventas': ['Sales', 'Vendas'],
    'Todavía no tenés ventas': ['No sales yet', 'Ainda não há vendas'],
    'Aprobada': ['Approved', 'Aprovada'],
    'En proceso': ['In process', 'Em processamento'],
    'Rechazada': ['Rejected', 'Recusada'],
    'Devuelta': ['Refunded', 'Devolvida'],
    'Mercado Pago conectado.': ['Mercado Pago connected.', 'Mercado Pago conectado.'],
    'No se pudo conectar Mercado Pago. Probá de nuevo.': ['Could not connect Mercado Pago. Please try again.', 'Não foi possível conectar o Mercado Pago. Tente de novo.'],
    'Cancelaste la conexión con Mercado Pago.': ['You cancelled the Mercado Pago connection.', 'Você cancelou a conexão com o Mercado Pago.'],
    'Esa cuenta de Mercado Pago ya está conectada a otra acompañante.': ['That Mercado Pago account is already connected to another companion.', 'Essa conta do Mercado Pago já está conectada a outra acompanhante.'],
    'Mercado Pago desconectado.': ['Mercado Pago disconnected.', 'Mercado Pago desconectado.'],
    'Comprar': ['Buy', 'Comprar'],
    'Ver pack': ['View pack', 'Ver pack'],
    'Pagás con Mercado Pago. Apenas se aprueba el pago, ves el contenido.': ['You pay with Mercado Pago. As soon as the payment is approved, you see the content.', 'Você paga com Mercado Pago. Assim que o pagamento é aprovado, você vê o conteúdo.'],
    'Tu compra': ['Your purchase', 'Sua compra'],
    'Tu contenido': ['Your content', 'Seu conteúdo'],
    'Abrir pack': ['Open pack', 'Abrir pack'],
    'También lo tenés en Tu espacio → Mis compras.': ['You also have it in Your space → My purchases.', 'Você também tem em Seu espaço → Minhas compras.'],
    'Iniciá sesión con la cuenta con la que compraste.': ['Log in with the account you used to buy.', 'Entre com a conta que você usou para comprar.'],
    'Ingresar': ['Log in', 'Entrar'],
    'Estamos esperando la confirmación del pago.': ['We are waiting for the payment confirmation.', 'Estamos aguardando a confirmação do pagamento.'],
    'Apenas se apruebe, vas a ver el contenido acá.': ['As soon as it is approved, you will see the content here.', 'Assim que for aprovado, você verá o conteúdo aqui.'],
    'Actualizar': ['Refresh', 'Atualizar'],
    'El pago no se aprobó.': ['The payment was not approved.', 'O pagamento não foi aprovado.'],
    'Podés volver al perfil e intentarlo de nuevo.': ['You can go back to the profile and try again.', 'Você pode voltar ao perfil e tentar de novo.'],
    'El pago fue devuelto. El contenido ya no está disponible.': ['The payment was refunded. The content is no longer available.', 'O pagamento foi devolvido. O conteúdo não está mais disponível.'],
    'No encontramos esta compra': ['We could not find this purchase', 'Não encontramos esta compra'],
    'Revisá que la dirección esté completa.': ['Check that the address is complete.', 'Confira se o endereço está completo.'],
    'Volver al perfil': ['Back to the profile', 'Voltar ao perfil'],
    'Ir al inicio': ['Go to home', 'Ir para o início'],
    'de {x}': ['by {x}', 'de {x}'],
  });

  const money = (m) => {
    const n = m && typeof m === 'object' ? Number(m.centavos) / 100 : Number(m || 0);
    try { return '$ ' + n.toLocaleString(HH.loc ? HH.loc() : 'es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); } catch (e) { return '$ ' + n; }
  };
  const head = (eyebrow, title, sub) => `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h2>${title}</h2>${sub ? `<p class="muted small" style="margin-top:4px;max-width:62ch">${sub}</p>` : ''}</div></div>`;
  const skel = () => `<div class="sp-skel"></div><div class="sp-skel"></div>`;
  const ESTADO = { aprobada: ['ok', 'Aprobada'], en_proceso: ['warn', 'En proceso'], rechazada: ['danger', 'Rechazada'], reembolsada: ['neutral', 'Devuelta'], pendiente: ['neutral', 'En proceso'] };
  const enPanel = () => /^panel\.contenido$/.test(HH.currentHash());
  const enCompra = () => /^compra\./.test(HH.currentHash());
  const refrescar = (si) => { if (si() && !document.getElementById('modalRoot').classList.contains('open')) HH.refresh(); };

  // Packs que el cliente con sesión ya compró: { itemId: token } (de Mis compras, aprobadas)
  const compras = () => (S.mis && S.mis.map) || {};
  function cargarMis(slug) {
    if (!HH.spClientes || !HH.spClientes.logged()) { S.mis = null; return; }
    if (S.mis && Date.now() - S.mis.at < 60 * 1000) return;
    S.mis = { at: Date.now(), map: (S.mis && S.mis.map) || {} };
    api('GET', '/cliente/compras').then((d) => {
      const m = {}; (d.items || []).forEach((x) => { if (x.estado === 'aprobada' && x.itemId) m[x.itemId] = x.token; });
      S.mis = { at: Date.now(), map: m }; pintarPerfil(slug);
    }, () => {});
  }

  /* ---------- Dirección propia: /compra/<token> ---------- */
  const parseUrl0 = HH.parseUrl;
  HH.parseUrl = function (url) {
    const r = parseUrl0.apply(this, arguments);
    if (r && r.key === '404') {
      const segs = String(url || '/').split('#')[0].split('?')[0].split('/').filter(Boolean);
      const lang = segs[0] === 'en' || segs[0] === 'pt' ? segs.shift() : 'es';
      if (segs.length === 2 && segs[0].toLowerCase() === 'compra' && /^[0-9a-f]{64}$/.test(segs[1])) return { key: 'compra.' + segs[1], lang };
    }
    return r;
  };

  /* ---------- Panel → Contenido ---------- */
  function cargarPanel(force) {
    if (S.cargando || (S.panel && !force)) return;
    S.cargando = true;
    api('GET', '/cuenta/contenido').then((d) => { S.panel = d; S.panelErr = null; }, (e) => { S.panelErr = e.message; })
      .finally(() => { S.cargando = false; refrescar(enPanel); });
  }
  // Vuelta de Mercado Pago: /panel/contenido?mp=ok|error|cancelado|en_uso
  function avisoVuelta() {
    let q; try { q = new URLSearchParams(location.search).get('mp'); } catch (e) { q = null; }
    if (!q) return;
    try { history.replaceState(history.state, '', location.pathname + location.hash); } catch (e) { /* */ }
    if (q === 'ok') HH.toast('Mercado Pago conectado.', { type: 'ok' });
    else if (q === 'cancelado') HH.toast('Cancelaste la conexión con Mercado Pago.');
    else if (q === 'en_uso') HH.toast('Esa cuenta de Mercado Pago ya está conectada a otra acompañante.', { type: 'danger' });
    else HH.toast('No se pudo conectar Mercado Pago. Probá de nuevo.', { type: 'danger' });
    S.panel = null;
  }
  function formItem(it) {
    const v = it || { titulo: '', descripcion: '', precio: null, link: '' };
    return `<form class="card stack ct-form" style="gap:10px" data-submit="ctGuardar" data-id="${it ? esc(it.id) : ''}" novalidate>
      <div class="card-title">${it ? 'Editar pack' : 'Agregar pack'}</div>
      <div class="field"><label for="ctTit">Título</label><input class="input" id="ctTit" name="titulo" maxlength="80" required value="${esc(v.titulo)}"></div>
      <div class="field"><label for="ctDesc">Descripción (opcional)</label><textarea class="textarea" id="ctDesc" name="descripcion" rows="2" maxlength="300">${esc(v.descripcion || '')}</textarea></div>
      <div class="field"><label for="ctPrecio">Precio (pesos argentinos)</label><input class="input" id="ctPrecio" name="precio" type="number" inputmode="decimal" min="100" max="10000000" step="0.01" required value="${v.precio ? esc(v.precio.pesos) : ''}"></div>
      <div class="field"><label for="ctLink">Link a tu pack</label><input class="input" id="ctLink" name="link" type="url" inputmode="url" maxlength="500" required placeholder="https://" value="${esc(v.link || '')}"><div class="tiny muted">Lo ve solo quien lo compra, después de pagar. Tiene que empezar con https://</div></div>
      <div id="ctErr" class="sp-err" aria-live="polite"></div>
      <div class="row" style="gap:8px"><button type="submit" class="btn"${S.busy.guardar ? ' disabled' : ''}>${icon('check')} Guardar</button><button type="button" class="btn ghost" data-action="ctCancelar">Cancelar</button></div>
    </form>`;
  }
  function panel() {
    avisoVuelta();
    cargarPanel();
    const titulo = head('Contenido', 'Vendé tus packs', 'Cargá el link a tu pack y su precio. Quien lo compra paga con Mercado Pago y, apenas se aprueba el pago, ve tu link.');
    if (!S.panel && S.panelErr) return titulo + `<div class="notice danger">${icon('alert')}<span>${esc(S.panelErr)}</span></div><button type="button" class="btn secondary" data-action="ctRecargar">Actualizar</button>`;
    if (!S.panel) return titulo + skel();
    const d = S.panel;
    if (!d.disponible) return titulo + `<div class="notice">${icon('info')}<span>La venta de contenido todavía no está disponible.</span></div>`;
    const c = d.conexion || { estado: 'sin_conectar' };
    // Packs por plan: max = los que permite su plan (null = ilimitados, 0 = su plan no incluye la venta de packs)
    const max = d.max === undefined ? null : d.max;
    const nItems = (d.items || []).length;
    if (max === 0 && !nItems) return titulo + `<div class="notice">${icon('info')}<span>Tu plan no incluye la venta de packs.</span></div>`;
    const puedeSumar = max === null || nItems < max;
    const limiteTxt = max === null ? HH.t('Tu plan permite packs ilimitados') : max === 0 ? HH.t('Tu plan no incluye la venta de packs.') : HH.t(max === 1 ? 'Tu plan permite {n} pack' : 'Tu plan permite {n} packs').replace('{n}', String(max));
    const mpCard = c.estado === 'conectada'
      ? `<div class="row between"><div class="card-title">${icon('wallet')} Mercado Pago</div><span class="badge ok">${icon('check')} Conectada</span></div>
         ${c.desde ? `<p class="small muted" style="margin:0">Desde el <span data-noi18n>${esc(HH.fmtDate(c.desde, { day: 'numeric', month: 'long', year: 'numeric' }))}</span></p>` : ''}
         <p class="small" style="margin:0">El dinero de cada venta se acredita en tu cuenta de Mercado Pago.</p>
         <div class="row"><button type="button" class="btn ghost sm" data-action="ctDesconectar"${S.busy.mp ? ' disabled' : ''}>Desconectar</button></div>`
      : `<div class="card-title">${icon('wallet')} Mercado Pago</div>
         ${c.estado === 'reconectar' ? `<div class="notice warn">${icon('alert')}<span>Volvé a conectar Mercado Pago para seguir vendiendo. Mientras tanto, tus packs no se pueden comprar.</span></div>` : '<p class="small" style="margin:0">Conectá tu cuenta de Mercado Pago para cobrar tus ventas. El dinero de cada venta va directo a tu cuenta.</p>'}
         <div class="row"><button type="button" class="btn" data-action="ctConectar"${S.busy.mp ? ' disabled' : ''}>${icon('wallet')} Conectar Mercado Pago</button></div>`;
    const items = d.items || [];
    const itemRow = (it) => S.editar === it.id ? formItem(it) : `<div class="list-item ct-item" style="flex-wrap:wrap;gap:8px">
        <div class="grow" style="min-width:0;flex-basis:100%"><div class="title"><span data-noi18n>${esc(it.titulo)}</span></div>
          ${it.descripcion ? `<div class="sub"><span data-noi18n>${esc(it.descripcion)}</span></div>` : ''}
          <div class="tiny muted ellipsis" data-noi18n>${esc(it.link)}</div>
          ${it.aLaVenta === false ? `<div class="tiny" style="color:var(--warn)">No está a la venta: supera el límite de tu plan</div>` : ''}</div>
        <strong class="num" style="white-space:nowrap" data-noi18n>${esc(money(it.precio))}</strong>
        <div class="row" style="gap:6px;margin-left:auto"><button type="button" class="btn ghost sm" data-action="ctEditar" data-id="${esc(it.id)}">Editar</button><button type="button" class="btn ghost sm" data-action="ctBorrar" data-id="${esc(it.id)}" aria-label="Borrar">${icon('trash')}</button></div>
      </div>`;
    const ventas = d.ventas || [];
    return titulo + `
      <div class="card stack" style="gap:10px">${mpCard}
        <p class="tiny muted" style="margin:0"><span>Por cada venta, SexyRose cobra una comisión del ${esc(String(d.comisionPct))} % y Mercado Pago descuenta su costo; el resto se acredita en tu cuenta.</span></p>
      </div>
      <div class="card stack" style="gap:10px">
        <div class="row between"><div class="card-title">${icon('bag')} Tus packs</div><span class="tiny muted">${limiteTxt}</span></div>
        ${c.estado !== 'conectada' && items.length ? `<p class="small muted" style="margin:0">Se muestran en tu perfil cuando tu cuenta de Mercado Pago está conectada.</p>` : ''}
        ${items.length ? `<div class="list">${items.map(itemRow).join('')}</div>` : (S.nuevo ? '' : `<div class="empty">${icon('bag')}<h4>Todavía no cargaste packs</h4></div>`)}
        ${S.nuevo && puedeSumar ? formItem(null) : (puedeSumar && !S.editar ? `<div class="row"><button type="button" class="btn secondary" data-action="ctNuevo">${icon('plus')} Agregar pack</button></div>` : '')}
      </div>
      <div class="card stack" style="gap:10px">
        <div class="card-title">${icon('card')} Ventas</div>
        ${ventas.length ? `<div class="list">${ventas.map((v) => { const [cls, lb] = ESTADO[v.estado] || ESTADO.pendiente; return `<div class="list-item"><div class="grow" style="min-width:0"><div class="title ellipsis">${v.tipo === 'pedido' ? '<span>Pedido personalizado</span>' : `<span data-noi18n>${esc(v.titulo)}</span>`}</div><div class="sub" data-noi18n>${esc(HH.fmtDateTime(v.pagado || v.creado))}</div></div><strong class="num" style="white-space:nowrap" data-noi18n>${esc(money(v.monto))}</strong><span class="badge ${cls}">${lb}</span></div>`; }).join('')}</div>` : `<p class="small muted" style="margin:0">Todavía no tenés ventas</p>`}
      </div>`;
  }

  /* ---------- /compra/<token> ---------- */
  function cargarCompra(tk, conPago) {
    let pid = null;
    if (conPago) { try { const q = new URLSearchParams(location.search); pid = q.get('payment_id') || q.get('collection_id'); } catch (e) { /* */ } }
    api('GET', '/sitio/compra/' + tk + (pid && /^\d{1,30}$/.test(pid) ? '?payment_id=' + pid : ''))
      .then((d) => { S.compra = d; S.compraErr = null; S.compraTk = tk; }, (e) => { S.compraErr = e; S.compraTk = tk; })
      .finally(() => {
        if (S.compra && S.compra.estado === 'aprobada') { try { if (location.search) history.replaceState(history.state, '', location.pathname); } catch (e) { /* */ } }
        refrescar(enCompra);
        programarPoll(tk);
      });
  }
  function programarPoll(tk) {
    clearTimeout(S.poll);
    const abierta = S.compra && ['pendiente', 'en_proceso'].includes(S.compra.estado);
    if (!abierta || S.compraTk !== tk) return;
    S.pollN = (S.pollN || 0) + 1;
    if (S.pollN > 40) return; // unos 3 minutos; después, con el botón "Actualizar"
    S.poll = setTimeout(() => { if (enCompra() && HH.currentHash() === 'compra.' + tk) cargarCompra(tk, true); }, 4500);
  }
  function compraView(tk) {
    if (!/^[0-9a-f]{64}$/.test(tk || '')) { HH.go('#inicio', { replace: true }); return false; }
    if (S.compraTk !== tk) { S.compra = null; S.compraErr = null; S.pollN = 0; S.compraTk = tk; cargarCompra(tk, true); }
    const wrap = (inner) => `<div class="container section" style="max-width:640px"><div class="card stack ct-compra" style="gap:14px">${inner}</div></div>`;
    if (!S.compra && S.compraErr) {
      if (S.compraErr.status === 401) return wrap(`<div class="empty">${icon('user')}<h4>Iniciá sesión con la cuenta con la que compraste.</h4><button type="button" class="btn" data-action="ctCompraLogin">Ingresar</button></div>`);
      if (S.compraErr.status === 404) return wrap(`<div class="empty">${icon('search')}<h4>No encontramos esta compra</h4><p class="small">Revisá que la dirección esté completa.</p><a class="btn" href="#inicio" data-go="#inicio">Ir al inicio</a></div>`);
      return wrap(`<div class="notice danger">${icon('alert')}<span>${esc(S.compraErr.message)}</span></div><div class="row"><button type="button" class="btn secondary" data-action="ctCompraActualizar">Actualizar</button></div>`);
    }
    if (!S.compra) return wrap(skel());
    const d = S.compra;
    const v = d.vendedora;
    const perfil = v && v.slug ? `<a href="#perfil.${esc(v.slug)}" data-go="#perfil.${esc(v.slug)}"><span>de ${esc(v.nombre)}</span></a>` : '';
    const resumen = `<div class="row between" style="gap:10px;align-items:flex-start"><div style="min-width:0"><div class="eyebrow">Tu compra</div><h2 style="margin:2px 0" data-noi18n>${esc(d.titulo)}</h2><div class="small muted">${perfil}</div></div><strong class="num" style="font-size:20px;white-space:nowrap" data-noi18n>${esc(money(d.monto))}</strong></div>`;
    if (d.estado === 'aprobada' && d.link) {
      return wrap(`${resumen}<span class="badge ok" style="align-self:flex-start">${icon('check')} Aprobada</span>
        <a class="btn lg" href="${esc(d.link)}" target="_blank" rel="noopener noreferrer nofollow">${icon('external')} Abrir pack</a>
        <p class="small muted" style="margin:0">También lo tenés en Tu espacio → Mis compras.</p>`);
    }
    if (d.estado === 'rechazada') return wrap(`${resumen}<div class="notice danger">${icon('alert')}<span><strong>El pago no se aprobó.</strong> <span>Podés volver al perfil e intentarlo de nuevo.</span></span></div>${v && v.slug ? `<div class="row"><a class="btn secondary" href="#perfil.${esc(v.slug)}" data-go="#perfil.${esc(v.slug)}">Volver al perfil</a></div>` : ''}`);
    if (d.estado === 'reembolsada') return wrap(`${resumen}<div class="notice">${icon('info')}<span>El pago fue devuelto. El contenido ya no está disponible.</span></div>`);
    return wrap(`${resumen}<div class="notice warn">${icon('clock')}<span><strong>Estamos esperando la confirmación del pago.</strong> <span>Apenas se apruebe, vas a ver el contenido acá.</span></span></div>
      <div class="row"><button type="button" class="btn secondary" data-action="ctCompraActualizar">${icon('refresh')} Actualizar</button></div>`);
  }

  /* ---------- Perfil público: sección Contenido ---------- */
  function seccionPerfil(slug, d) {
    const items = (d && d.items) || [];
    if (!items.length) return '';
    const ya = compras();
    return `<section class="card stack ct-perfil" style="gap:10px" aria-label="Contenido">
      <div class="card-title">${icon('bag')} Contenido</div>
      <div class="list">${items.map((it) => `<div class="list-item">
        <div class="grow" style="min-width:0"><div class="title"><span data-noi18n>${esc(it.titulo)}</span></div>${it.descripcion ? `<div class="sub"><span data-noi18n>${esc(it.descripcion)}</span></div>` : ''}</div>
        ${ya[it.id] ? `<a class="btn sm secondary" href="#compra.${esc(ya[it.id])}" data-go="#compra.${esc(ya[it.id])}">Ver pack</a>`
          : `<strong class="num" style="white-space:nowrap" data-noi18n>${esc(money(it.precio))}</strong><button type="button" class="btn sm" data-action="ctComprar" data-id="${esc(it.id)}" data-slug="${esc(slug)}">Comprar</button>`}
      </div>`).join('')}</div>
      <p class="tiny muted" style="margin:0">Pagás con Mercado Pago. Apenas se aprueba el pago, ves el contenido.</p>
    </section>`;
  }
  function pintarPerfil(slug) {
    const root = document.querySelector('#app .pf2');
    if (!root || HH.currentHash() !== 'perfil.' + slug) return;
    root.querySelectorAll('.ct-perfil, .cl-ped-perfil').forEach((el) => el.remove());
    const hit = S.perfil.get(slug);
    const html = (hit ? seccionPerfil(slug, hit.d) : '') + (hit && hit.d && hit.d.pedidos && HH.spClientes ? HH.spClientes.pedidoPerfil(slug) : '');
    if (!html) return;
    root.insertAdjacentHTML('beforeend', html);
    root.querySelectorAll('.ct-perfil, .cl-ped-perfil').forEach((el) => { if (HH.linkify) HH.linkify(el); if (HH.lang !== 'es' && HH.translateNode) HH.translateNode(el); });
  }
  document.addEventListener('hh:rendered', (ev) => {
    const cur = (ev && ev.detail) || HH.current || {};
    const key = HH.currentHash();
    if (!/^perfil\./.test(key)) return;
    const slug = (cur.params && cur.params.slug) || key.split('.')[1];
    if (!slug) return;
    cargarMis(slug);
    const hit = S.perfil.get(slug);
    if (hit && Date.now() - hit.at < 60 * 1000) { pintarPerfil(slug); return; }
    api('GET', '/sitio/contenido/perfil/' + encodeURIComponent(slug))
      .then((d) => { S.perfil.set(slug, { d, at: Date.now() }); pintarPerfil(slug); }, () => { S.perfil.set(slug, { d: null, at: Date.now() }); });
  });

  /* ---------- Acciones ---------- */
  const conBusy = async (k, fn) => { if (S.busy[k]) return; S.busy[k] = true; try { await fn(); } finally { S.busy[k] = false; refrescar(enPanel); } };
  Object.assign(HH.actions, {
    ctRecargar() { S.panel = null; S.panelErr = null; cargarPanel(true); HH.refresh(); },
    ctConectar() {
      conBusy('mp', async () => {
        try { const r = await api('POST', '/cuenta/contenido/mp/conectar', {}); if (r && r.url) location.href = r.url; } catch (e) { HH.toast(e.message, { type: 'danger' }); }
      });
    },
    ctDesconectar() {
      HH.confirm({ title: 'Desconectar Mercado Pago', text: 'Tus packs dejan de poder comprarse hasta que vuelvas a conectar.', okLabel: 'Desconectar', cls: 'danger', onOk: () => conBusy('mp', async () => {
        try { await api('POST', '/cuenta/contenido/mp/desconectar', {}); HH.toast('Mercado Pago desconectado.'); S.panel = null; cargarPanel(true); } catch (e) { HH.toast(e.message, { type: 'danger' }); }
      }) });
    },
    ctNuevo() { S.nuevo = true; S.editar = null; HH.refresh(); setTimeout(() => { const el = document.getElementById('ctTit'); if (el) el.focus(); }, 0); },
    ctEditar(el) { S.editar = el.dataset.id; S.nuevo = false; HH.refresh(); setTimeout(() => { const f = document.getElementById('ctTit'); if (f) f.focus(); }, 0); },
    ctCancelar() { S.editar = null; S.nuevo = false; HH.refresh(); },
    ctGuardar(form, ev, data) {
      // Sin volver a dibujar la vista hasta que se guarde: si hay un error, el formulario queda como estaba
      const id = form.dataset.id;
      const btn = form.querySelector('button[type="submit"]');
      if (S.busy.guardar) return;
      S.busy.guardar = true; if (btn) btn.disabled = true;
      const body = { titulo: data.titulo, descripcion: data.descripcion, precio: data.precio, link: data.link };
      api(id ? 'PUT' : 'POST', '/cuenta/contenido/items' + (id ? '/' + id : ''), body)
        .then(() => {
          S.busy.guardar = false; S.editar = null; S.nuevo = false; HH.toast('Pack guardado.', { type: 'ok' });
          S.panel = null; cargarPanel(true);
        }, (e) => {
          S.busy.guardar = false; if (btn) btn.disabled = false;
          const el = document.getElementById('ctErr'); if (el) el.innerHTML = `<div class="notice danger">${icon('alert')}<span>${esc(e.message)}</span></div>`;
        });
    },
    ctBorrar(el) {
      const id = el.dataset.id;
      HH.confirm({ title: 'Borrar pack', text: '¿Querés borrar este pack? Quien ya lo compró lo sigue viendo.', okLabel: 'Borrar', cls: 'danger', onOk: () => conBusy('borrar', async () => {
        try { await api('DELETE', '/cuenta/contenido/items/' + id); HH.toast('Pack borrado.'); S.panel = null; cargarPanel(true); } catch (e) { HH.toast(e.message, { type: 'danger' }); }
      }) });
    },
    ctComprar(el) {
      const id = el.dataset.id; if (el.disabled) return;
      const next = el.dataset.slug ? '#perfil.' + el.dataset.slug : HH.currentHash();
      // Hay que tener cuenta de cliente con el email confirmado (prod-clientes.js)
      if (HH.spClientes && !HH.spClientes.asegurar(next)) return;
      el.disabled = true;
      api('POST', '/sitio/contenido/' + id + '/comprar', {})
        .then((r) => { if (r && r.url) location.href = r.url; else el.disabled = false; })
        .catch((e) => { el.disabled = false; if (!(HH.spClientes && HH.spClientes.errAuth(e, next))) HH.toast(e.message, { type: 'danger' }); });
    },
    ctCompraLogin() { if (HH.spClientes) HH.spClientes.pedirLogin(HH.currentHash()); },
    ctCompraActualizar() { const tk = S.compraTk; if (!tk) return; S.pollN = 0; cargarCompra(tk, true); },
  });

  HH.spContenido = { panel, compra: compraView };
})();
