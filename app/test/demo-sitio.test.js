// Demo nueva (/demo/): routes/demo-sitio.js sirve la cáscara y los archivos con hash que deja
// scripts/build-demo.py (build-sitio.py --demo). No necesita base de datos.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createDemoSitioRouter } from '../routes/demo-sitio.js';

function armar(shell) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-demo-'));
  fs.mkdirSync(path.join(dir, 'assets', 'fonts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), shell);
  fs.writeFileSync(path.join(dir, 'assets', 'app.0123456789ab.js'), 'console.log(1)');
  fs.writeFileSync(path.join(dir, 'media', '0123456789abcdef.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  fs.writeFileSync(path.join(dir, 'estado.0123456789ab.json'), '{"perfiles":[]}');
  return dir;
}

async function servidor(dir) {
  const app = express();
  app.use(createDemoSitioRouter({ dir }));
  app.use((req, res) => res.status(404).send('siguiente'));
  const srv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { base, cerrar: () => new Promise((ok) => srv.close(ok)) };
}

test('demo nueva: cáscara, archivos con hash e imágenes', async () => {
  const dir = armar('<!doctype html><html><head><!--SR:DEMO--></head><body>demo</body></html>');
  const { base, cerrar } = await servidor(dir);
  try {
    let r = await fetch(base + '/demo/');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.equal(r.headers.get('cache-control'), 'no-cache');
    assert.match(r.headers.get('x-robots-tag'), /noindex/);
    assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
    assert.doesNotMatch(r.headers.get('content-security-policy'), /unsafe-eval|script-src[^;]*unsafe-inline/);
    assert.match(await r.text(), /SR:DEMO/);

    r = await fetch(base + '/demo/index.html', { redirect: 'manual' });
    assert.equal(r.status, 301);
    assert.equal(r.headers.get('location'), '/demo/');

    r = await fetch(base + '/demo/assets/app.0123456789ab.js');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('cache-control'), /immutable/);
    assert.match(r.headers.get('content-type'), /javascript/);

    r = await fetch(base + '/demo/media/0123456789abcdef.svg');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/svg+xml');
    assert.match(r.headers.get('content-security-policy'), /sandbox/);

    r = await fetch(base + '/demo/estado.0123456789ab.json');
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { perfiles: [] });

    // Lo que no es de la demo (o no tiene hash) sigue de largo
    for (const p of ['/demo/assets/app.js', '/demo/../server.js', '/demo/perfil/valentina', '/otra']) {
      r = await fetch(base + p);
      assert.equal(r.status, 404, p);
    }
    r = await fetch(base + '/demo/', { method: 'POST' });
    assert.equal(r.status, 404);
  } finally {
    await cerrar();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('demo vieja (sin la marca): la deja pasar a server.js', async () => {
  const dir = armar('<!doctype html><html><head></head><body><script>1</script></body></html>');
  const { base, cerrar } = await servidor(dir);
  try {
    assert.equal((await fetch(base + '/demo/')).status, 404);
    assert.equal((await fetch(base + '/demo/assets/app.0123456789ab.js')).status, 404);
  } finally {
    await cerrar();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
