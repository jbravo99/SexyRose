// Mi perfil de la acompañante (17/11/2026, pedido de Juan): "lo que quiero es que abajo en la barra flotante esté el
// perfil de uno mismo como Instagram". /panel/mi-perfil (prod-sitio.js) dibuja su perfil con la vista pública y los
// datos de la vista previa (GET /api/cuenta/vista-previa); ahí sube y borra historias. La barra inferior (su foto)
// lleva ahí; la vista previa queda solo para mirar; su perfil público lleva a Mi perfil. Las garantías del servidor
// (solo lo suyo, sin caché, noindex, sin métricas) están en vista-previa.test.js; el dibujo, en historias-perfil.test.js.
//   DATABASE_URL=postgres://... node --test test/mi-perfil.test.js
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', '..', 'mvp', 'src');
const leer = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const sitio = leer('prod-sitio.js');
// Un trozo de prod-sitio.js, desde `desde` hasta el final de esa línea o función (hasta `hasta`)
const trozo = (desde, hasta) => { const i = sitio.indexOf(desde); assert.ok(i >= 0, desde); const j = sitio.indexOf(hasta, i); assert.ok(j > i, hasta); return sitio.slice(i, j + hasta.length); };

describe('Mi perfil: ruta, barra inferior, menú y su perfil público (prod-sitio.js)', () => {
  test('ruta del panel: /panel/mi-perfil con los datos de la vista previa', () => {
    assert.ok(sitio.includes("const YO_GO = '#panel.mi-perfil';"));
    assert.ok(sitio.includes("if (b === 'mi-perfil' && parts.length === 2) return miPerfilView();"));
    assert.ok(sitio.includes('const usaVP = (key) => esVP(key) || esYo(key);'), 'mismos datos (VP) que la vista previa');
    assert.ok(sitio.includes("return HH.profileView(VP.data.perfil.slug, { own: true, aviso: yoAviso(), acciones });"));
    assert.match(sitio, /<a class="btn secondary sm" href="#panel\.perfil" data-go="#panel\.perfil">Editar perfil<\/a>/, 'Editar perfil → Panel → Mi perfil');
    assert.match(sitio, /<a class="btn secondary sm" href="#panel" data-go="#panel">Mi panel/, 'Mi panel → Resumen');
    assert.match(sitio, /esVP\(key\) \? 'Vista previa' : esYo\(key\) \? 'Mi perfil'/, 'título');
  });

  test('barra inferior: con sesión, su foto lleva a Mi perfil (marcada ahí); sin sesión, igual que antes', () => {
    assert.ok(sitio.includes("ultimo = { h: YO_GO, l: 'Mi perfil', html: avatar, dot: yoDot(), on: esYo(key) };"));
    assert.ok(sitio.includes("} else ultimo = { h: '#favoritos', l: 'Tu espacio', i: 'user'"), 'sin sesión: Tu espacio');
    assert.ok(sitio.includes("const on = n.on != null ? n.on : ('#' + top) === n.h || (n.h === '#inicio' && !top);"));
  });

  test('menú de su foto: Mi panel, Mi perfil y Ver vista previa', () => {
    const m = trozo('    openUserMenu() {', '    },');
    const i = (s) => { const k = m.indexOf(s); assert.ok(k >= 0, s); return k; };
    assert.ok(i('<span class="grow title">Mi panel</span>') < i('href="${YO_GO}" data-go="${YO_GO}"'));
    assert.ok(i('<span class="grow title">Mi perfil</span>') < i('<span class="grow title">Ver vista previa</span>'));
    assert.ok(m.includes('href="${VP_GO}" data-go="${VP_GO}"'));
    assert.doesNotMatch(m, /#perfil\./, 'ya no lleva a su perfil público (ese trae a Mi perfil)');
  });

  test('su perfil público (/perfil/<su-slug>) lleva a Mi perfil; el de otra, no', () => {
    const linea = trozo('  const esSuPerfilPublico = ', '};');
    const S = { yo: null };
    const ctx = { S }; vm.createContext(ctx); vm.runInContext(linea + '; this.f = esSuPerfilPublico;', ctx);
    assert.equal(ctx.f('perfil.ana'), false, 'sin sesión');
    S.yo = { id: 'A', perfil: { slug: 'ana' } };
    assert.equal(ctx.f('perfil.ana'), true);
    assert.equal(ctx.f('perfil.anabel'), false);
    assert.equal(ctx.f('perfil.bea'), false);
    assert.equal(ctx.f('panel.mi-perfil'), false);
    S.yo = { id: 'A', perfil: { slug: null } };
    assert.equal(ctx.f('perfil.null'), false, 'sin slug todavía');
    assert.ok(sitio.includes('if (esSuPerfilPublico(key)) { HH.go(YO_GO, { replace: true }); return; }'));
  });

  test('aviso cuando hoy no se ve: los textos del panel; con la home provisoria, "abrimos muy pronto"', () => {
    const f = trozo('  function yoAviso() {', '\n  }\n');
    const ESTADO_PERFIL = trozo('  const ESTADO_PERFIL = {', '\n  };\n');
    const ctx = { S: { yo: { perfil: {} } }, VP: { data: { publico: false } }, pre: false, icon: () => '', esc: (x) => String(x), GUIA_GO: '#panel.primeros-pasos',
      completarBtn: (clave, fuera) => (clave && fuera ? '<a>Completar</a>' : '') };
    vm.createContext(ctx);
    const faltaLista = trozo('  const faltaLista = ', ';\n'); const guiaAplica = trozo('  const guiaAplica = ', ';\n');
    vm.runInContext(ESTADO_PERFIL + 'const preOn = () => this.pre;\n' + faltaLista + guiaAplica + f + '\nthis.aviso = yoAviso;', ctx);
    const txt = (perfil, publico = false, pre = false) => { ctx.S.yo.perfil = perfil; ctx.VP.data.publico = publico; ctx.pre = pre; return ctx.aviso().replace(/<[^>]+>/g, ''); };
    assert.equal(txt({ estado: 'publicado' }, true), '', 'se ve: sin aviso');
    assert.equal(txt({ estado: 'publicado' }, false, true), 'Todavía no se ve en el sitio: abrimos muy pronto.');
    assert.equal(txt({ estado: 'borrador' }, false, true), 'Completá lo que falta y tu perfil pasa solo a revisión. Nadie lo ve todavía.', 'lo que tiene que hacer va primero');
    // Con algo pendiente (18/11/2026): además, qué falta (con "Completar") y "Seguir con los pasos"
    ctx.S.yo.perfil = { estado: 'borrador', faltantes: ['Subí al menos 3 fotos (tenés 1).'], faltantesClaves: ['fotos'] }; ctx.VP.data.publico = false;
    const conFalta = ctx.aviso();
    assert.ok(conFalta.includes('<li>') && conFalta.includes('Subí al menos 3 fotos (tenés 1).') && conFalta.includes('Completar') && conFalta.includes('Seguir con los pasos'));
    assert.equal(txt({ estado: 'en_revision' }), 'Estamos revisando tu perfil. Te avisamos por email.');
    // Pausado por no mandar la verificación dentro de los 7 días (19/11/2026)
    ctx.PAUSA_VERIF = 'pausa-verif';
    vm.runInContext('var PAUSA_VERIF = this.PAUSA_VERIF;', ctx);
    assert.equal(txt({ estado: 'pausado', pausadoPorVerificacion: true }), 'pausa-verif');
    assert.equal(txt({ estado: 'publicado', oculto: true }), 'Tu perfil está oculto: nadie lo ve en el sitio.');
    assert.equal(txt({ estado: 'publicado', pausadoPorSaldo: true }), 'Tu perfil no se ve porque no alcanzaron los créditos para renovar tu plan.');
    assert.equal(txt({ estado: 'publicado' }), 'Tu perfil no se ve en el sitio por ahora.');
    // Todos con inglés y portugués (los del panel ya estaban en el diccionario)
    for (const t of ['Tu perfil está oculto: nadie lo ve en el sitio.', 'Tu perfil no se ve en el sitio por ahora.']) assert.ok(sitio.includes('"' + t + '": ['), t);
    assert.ok(sitio.includes("'Completá lo que falta y tu perfil pasa solo a revisión. Nadie lo ve todavía.': ['"));
    assert.ok(sitio.includes("['Tu perfil no se ve porque no alcanzaron los créditos para renovar tu plan.', '"));
  });

  test('textos nuevos en inglés y portugués', () => {
    const ini = sitio.indexOf("  Object.assign(HH.I18N = HH.I18N || {}, {\n    'Mi perfil'");
    assert.ok(ini > 0);
    const ctx = { HH: {} }; vm.createContext(ctx);
    vm.runInContext(sitio.slice(ini, sitio.indexOf('});', ini) + 3), ctx);
    for (const k of ['Mi perfil', 'Editar perfil', 'Ver mi perfil', 'No pudimos mostrar tu perfil', 'Todavía no se ve en el sitio: abrimos muy pronto.']) {
      const v = ctx.HH.I18N[k]; assert.ok(v && v[0] && v[1], k);
    }
  });
});

describe('home provisoria: la barra queda con Inicio y Mi perfil solo con la sesión de una acompañante (prod-prelanzamiento.js)', () => {
  function cargar() {
    const anclas = [];
    const bn = {
      set innerHTML(v) { anclas.length = 0; this._html = v; }, get innerHTML() { return this._html; },
      querySelector: (sel) => { const m = sel.match(/data-go="([^"]+)"/); return anclas.find((a) => a.go === m[1]) || null; },
      querySelectorAll: () => anclas.slice(),
    };
    const pintar = (gos) => { anclas.length = 0; gos.forEach((g) => anclas.push({ go: g, getAttribute: () => g, remove() { anclas.splice(anclas.indexOf(this), 1); } })); };
    const HH = { db: { _ajustes: { prelanzamiento: true } }, I18N: {}, esc: (s) => s, icon: () => '', render() {}, renderShell() {} };
    const window = { HH_PROD: 'sitio', HH };
    const document = { getElementById: (id) => (id === 'bottomNav' ? bn : null), addEventListener() {}, documentElement: { toggleAttribute() {} }, querySelectorAll: () => [] };
    const ctx = { window, document, HH, CustomEvent: function () {} }; vm.createContext(ctx);
    vm.runInContext(leer('prod-prelanzamiento.js'), ctx);
    return { HH, anclas, pintar };
  }
  test('acompañante con sesión: Inicio y Mi perfil (Swipe, Cerca y Shorts vuelven al inicio)', () => {
    const { HH, anclas, pintar } = cargar();
    pintar(['#inicio', '#swipe', '#cerca', '#shorts', '#panel.mi-perfil']);
    HH.renderShell();
    assert.deepEqual(anclas.map((a) => a.go), ['#inicio', '#panel.mi-perfil']);
  });
  test('visitante o cliente: sin barra, como antes', () => {
    const { HH, anclas, pintar } = cargar();
    pintar(['#inicio', '#swipe', '#cerca', '#shorts', '#favoritos']);
    HH.renderShell();
    assert.deepEqual(anclas.map((a) => a.go), []);
  });
});
