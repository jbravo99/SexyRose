// "Ver más <plan>" en el inicio (26/11/2026, Juan: "cuando presiono ver más, no hace nada, solo me muestra seis"):
// el inicio reiniciaba S.tierShown en cada redibujo (faltaban las llaves del if), así que el botón no mostraba más.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'mvp', 'src', 'views-public.js');

test('el inicio no borra lo que abrió "Ver más" en cada redibujo', async () => {
  const s = await fs.readFile(SRC, 'utf8');
  assert.doesNotMatch(s, /if \(!S\.gridShown\) S\.gridShown = GRID_PAGE; S\.tierShown = \{\};/);
  assert.match(s, /if \(!S\.gridShown\) \{ S\.gridShown = GRID_PAGE; S\.tierShown = \{\}; \}/);
  // El botón suma de a dos páginas del plan y redibuja
  assert.match(s, /S\.tierShown\[lv\] = \(S\.tierShown\[lv\] \|\| t\[2\]\) \+ t\[2\] \* 2;/);
});
