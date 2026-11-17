// Idiomas del perfil: Español, Inglés y Portugués en una tarjeta, más uno "Otro" escrito a mano (pedido de Juan, 17/11/2026)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validarDatos, IDIOMAS } from '../lib/perfiles.js';

test('idiomas: los de la lista en orden, sin repetir, y uno solo escrito a mano', () => {
  assert.deepEqual(validarDatos({ idiomas: ['Portugués', 'Español', 'Español'] }, {}, {}).datos.idiomas, ['Español', 'Portugués']);
  assert.deepEqual(validarDatos({ idiomas: ['Italiano', 'Inglés'] }, {}, {}).datos.idiomas, ['Inglés', 'Italiano']);
  assert.match(validarDatos({ idiomas: ['Italiano', 'Francés'] }, {}, {}).error, /un solo idioma en "Otro"/);
  assert.match(validarDatos({ idiomas: ['x'.repeat(21)] }, {}, {}).error, /hasta 20 caracteres/);
  assert.match(validarDatos({ idiomas: 'Español' }, {}, {}).error, /hasta 6 idiomas/);
  assert.deepEqual(validarDatos({ idiomas: [] }, {}, {}).datos.idiomas, []);
});

test('idiomas: la lista del panel es la misma que la del servidor', () => {
  const src = fs.readFileSync(new URL('../../mvp/src/prod-sitio.js', import.meta.url), 'utf8');
  const m = src.match(/const IDIOMAS = (\[[^\]]+\]);/);
  assert.ok(m, 'IDIOMAS en prod-sitio.js');
  assert.deepEqual(JSON.parse(m[1].replace(/'/g, '"')), IDIOMAS);
});
