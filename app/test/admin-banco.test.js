// Admin → Créditos → Banco (18/11/2026, pedido de Juan: el alias estaba en Mensajería y la cuenta de Mercado Pago en
// Ajustes, "poco práctico"). Revisión estática del admin (mvp/src): la pestaña Banco arma las dos tarjetas y los lugares
// de antes ya no las muestran (solo un enlace a Créditos → Banco).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const leer = (f) => fs.readFileSync(new URL('../../mvp/src/' + f, import.meta.url), 'utf8');
const ADMIN = leer('prod-admin.js');
const ASIS = leer('prod-admin-asistente.js');
const INT = leer('prod-admin-integraciones.js');

// Cuerpo de `function nombre(...) { ... }` (llaves balanceadas; las de los textos y plantillas también lo están)
function cuerpo(src, nombre) {
  const i = src.indexOf(`function ${nombre}(`);
  assert.ok(i >= 0, `falta function ${nombre}`);
  let j = src.indexOf('{', i); let n = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') n++;
    else if (src[k] === '}' && --n === 0) return src.slice(j, k + 1);
  }
  throw new Error('llaves sin cerrar en ' + nombre);
}
const llamadas = (src, fn) => (src.match(new RegExp(`\\b${fn}\\(`, 'g')) || []).length;

test('Créditos tiene tres pestañas: Pedidos, Movimientos y Banco (#admin.creditos.banco → vBanco)', () => {
  assert.match(ADMIN, /creditos: \[\['pedidos', 'Pedidos'\], \['movimientos', 'Movimientos'\], \['banco', 'Banco'\]\]/);
  assert.match(ADMIN, /'creditos\.banco': vBanco\b/);
  // Las secciones registran #admin.<sección>.:sub para todas sus pestañas; Banco no cae en el alias de Movimientos
  assert.match(ADMIN, /HH\.route\(`admin\.\$\{sec\}\.:sub`/);
  assert.match(ADMIN, /if \(t === 'creditos' && !esSub\('creditos', resto\[0\]\)\)/);
});

test('Banco arma las dos tarjetas: Cuenta para las transferencias y Cuenta que recibe la comisión', () => {
  const v = cuerpo(ADMIN, 'vBanco');
  assert.match(v, /layout\('creditos'/);
  assert.match(v, /HH\.adminBanco\.cuentaCard\(\)/);
  assert.match(v, /comisionCuentaCard\(\)/);
  // Transferencias: la tarjeta con la carga de S.asis; desde el 18/11/2026, dos listas de cuentas (pesos y dólares)
  assert.match(cuerpo(ASIS, 'cuentaCard'), /cardCuenta\(d\)/);
  assert.match(ASIS, /HH\.adminBanco = \{ cuentaCard \}/);
  const cc = cuerpo(ASIS, 'cardCuenta');
  assert.match(cc, /Cuentas para las transferencias/);
  assert.match(cc, /bloqueMoneda\(d, 'ARS'\)/); assert.match(cc, /bloqueMoneda\(d, 'USD'\)/);
  const bm = cuerpo(ASIS, 'bloqueMoneda');
  assert.match(bm, /En pesos/); assert.match(bm, /En dólares/);
  assert.match(bm, /En un rato te paso los datos/, 'aviso si no hay ninguna activa en pesos');
  assert.match(ASIS, /HH\.api\('PUT', '\/asistente\/ajustes'/);
  // Guardar desde Banco vuelve a dibujar la pestaña
  assert.match(ASIS, /enBanco = \(\) => \/\^admin\\\.creditos\\\.banco\$\//);
  assert.match(ASIS, /if \(\(enVista\(\) \|\| enBanco\(\)\) && !modalAbierto\(\)\) HH\.refresh\(\)/);
  // Comisión: las cuentas de Mercado Pago (lista, Probar, Usar esta cuenta, Agregar/Editar/Borrar, URLs, SECRETS_KEY)
  const cm = cuerpo(ADMIN, 'comisionCuentaCard');
  assert.match(cm, /Cuenta que recibe la comisión/);
  assert.match(cm, /HH\.adminInt\.mpCuentas\(vc, S\.err\.vc\)/);
  const mp = cuerpo(INT, 'mpCuentas');
  for (const x of ['intMpProbar', 'prodVcActivar', 'intMpNueva', 'intMpEditar', 'intMpBorrar', 'SECRETS_KEY', 'vc.redirectUri', 'vc.webhookUrl']) assert.ok(mp.includes(x), x);
});

test('cada tarjeta se dibuja en un solo lugar: Banco', () => {
  assert.equal(llamadas(ASIS, 'cardCuenta'), 2, 'la definición y cuentaCard');
  assert.equal(llamadas(ADMIN, 'comisionCuentaCard'), 2, 'la definición y vBanco');
  assert.ok(!/ventaContenidoCard/.test(ADMIN), 'la tarjeta "Venta de contenido" de Ajustes ya no existe');
  assert.equal(llamadas(ADMIN, 'mpCuentas'), 1, 'mpCuentas solo desde comisionCuentaCard');
});

test('Mensajería → WhatsApp y Ajustes ya no tienen las tarjetas; queda un enlace a Créditos → Banco', () => {
  const wa = cuerpo(ASIS, 'vWhatsApp');
  assert.ok(!/cardCuenta|cuentaCard/.test(wa));
  assert.match(wa, /lineaCuenta\(d\)/);
  const linea = cuerpo(ASIS, 'lineaCuenta');
  assert.match(linea, /href="#admin\.creditos\.banco"/);
  assert.match(linea, /notice warn/, 'si falta el alias, sigue el aviso');
  const aj = cuerpo(ADMIN, 'vAjustes');
  assert.ok(!/Mercado Pago|comisionCuentaCard|mpCuentas/.test(aj));
  // Los textos que nombraban el lugar viejo
  assert.ok(!/se elige en <a href="#admin\.ajustes"/.test(ADMIN));
  assert.match(cuerpo(ADMIN, 'comisionCard'), /href="#admin\.creditos\.banco"[^>]*>Créditos → Banco</);
  assert.match(cuerpo(ADMIN, 'vVentasContenido'), /href="#admin\.creditos\.banco"/);
  assert.ok(!/cuenta para las transferencias'/.test(ASIS), 'el subtítulo de WhatsApp ya no la nombra');
  const srv = fs.readFileSync(new URL('../lib/asistente.js', import.meta.url), 'utf8');
  assert.match(srv, /No hay ninguna cuenta activa en pesos \(Admin → Créditos → Banco\)/);
});

// Varias cuentas con rotación (18/11/2026): cada lista con Agregar, Subir/Bajar, Activa/Pausada, Editar y Borrar
test('Banco: listas de cuentas en pesos y dólares con sus acciones contra /asistente/cuentas', () => {
  const fila = cuerpo(ASIS, 'filaCuenta');
  for (const a of ['asisCtaMover', 'asisCtaActivo', 'asisCtaEditar', 'asisCtaBorrar']) assert.ok(fila.includes(`data-action="${a}"`), a);
  assert.match(fila, /data-dir="arriba"/); assert.match(fila, /data-dir="abajo"/);
  assert.match(fila, /role="switch"/);
  assert.match(fila, /Pausada/); assert.match(fila, /Le toca al próximo pedido/);
  assert.match(cuerpo(ASIS, 'bloqueMoneda'), /data-action="asisCtaNueva" data-m="\$\{m\}"/);
  assert.match(ASIS, /HH\.api\('POST', '\/asistente\/cuentas'/);
  assert.match(ASIS, /HH\.api\('PUT', '\/asistente\/cuentas\/' \+ encodeURIComponent\(c\.id\)/);
  assert.match(ASIS, /'\/asistente\/cuentas\/' \+ encodeURIComponent\(id\) \+ sufijo/);
  assert.match(ASIS, /cuentaApi\('DELETE'/); assert.match(ASIS, /'\/mover'/);
  assert.ok(!/asisGuardar|asisUsdAlias/.test(ASIS), 'el formulario de una sola cuenta ya no existe');
  // Pedidos: la cuenta que se le pasó a cada pedido, en la tabla y en las tarjetas (vía pcMoneda)
  assert.match(ADMIN, /\+ pcCuentaT\(x\)/);
  assert.match(cuerpo(ADMIN, 'pcRows'), /pcMoneda\(x\)[\s\S]*pcMoneda\(x\)/);
});

test('a las acompañantes nunca se les nombra la rotación ni las otras cuentas', () => {
  for (const f of ['asistente-textos.js', 'asistente-ayuda.js', 'asistente-llm.js']) {
    const t = fs.readFileSync(new URL('../lib/' + f, import.meta.url), 'utf8');
    assert.ok(!/rotaci|por turno|varias cuentas|otro alias|otros alias|cuenta pausada/i.test(t), f);
  }
});
