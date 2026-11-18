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
  // Transferencias: la misma tarjeta, con la carga de S.asis y el guardado de siempre (PUT /asistente/ajustes)
  assert.match(cuerpo(ASIS, 'cuentaCard'), /cardCuenta\(d\)/);
  assert.match(ASIS, /HH\.adminBanco = \{ cuentaCard \}/);
  const cc = cuerpo(ASIS, 'cardCuenta');
  assert.match(cc, /Cuenta para las transferencias/);
  assert.match(cc, /En pesos/); assert.match(cc, /En dólares/);
  assert.match(cc, /En un rato te paso los datos/, 'aviso si falta el alias');
  assert.match(cc, /data-action="asisGuardar"/);
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
  assert.match(srv, /Falta cargar el alias o el titular en pesos \(Admin → Créditos → Banco\)/);
});
