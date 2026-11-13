#!/usr/bin/env node
// Importa las ubicaciones oficiales (Georef + barrios de CABA) a la base. Lo mismo que hace el servidor solo al
// arrancar (si nunca se importó) y una vez por semana, y que el botón "Importar ahora" de Admin → Ubicaciones.
// Se puede correr las veces que haga falta: no borra ni cambia lo que ya está.
//
//   cd app && DATABASE_URL=postgres://... node scripts/importar-georef.js
//       baja todo de datos.gob.ar (necesita internet)
//   cd app && DATABASE_URL=postgres://... node scripts/importar-georef.js --dir=/ruta/carpeta
//       sin internet: lee provincias.json, departamentos.json, localidades.json y barrios.geojson de esa carpeta
//       (bajados de https://infra.datos.gob.ar/georef/… ; los que falten se saltean, salvo localidades.json)
//   cd app && DATABASE_URL=postgres://... node scripts/importar-georef.js --localidades=a.json [--provincias=b.json] [--departamentos=c.json] [--barrios=d.geojson]
//
// Si se corre con el servidor andando, el sitio toma los lugares nuevos solo en menos de un minuto.
import pg from 'pg';
import { createGeoref } from '../lib/georef.js';

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)];
}));
if (args.help || args.h) {
  console.log('Uso: DATABASE_URL=... node scripts/importar-georef.js [--dir=carpeta | --localidades=archivo [--provincias=…] [--departamentos=…] [--barrios=…]]');
  process.exit(0);
}
const url = process.env.DATABASE_URL;
if (!url) { console.error('Falta DATABASE_URL.'); process.exit(2); }
const archivos = args.dir || args.localidades
  ? { dir: typeof args.dir === 'string' ? args.dir : null, provincias: args.provincias, departamentos: args.departamentos, localidades: args.localidades, barrios: args.barrios }
  : null;

const pool = new pg.Pool({ connectionString: url, max: 2 });
const log = (...a) => console.log(new Date().toISOString(), ...a);
try {
  const geo = createGeoref({ pool, log });
  const r = await geo.importar({ motivo: 'manual', archivos });
  if (!r.ok) { console.error('No se pudo importar:', r.error); process.exitCode = 1; }
} catch (e) {
  console.error('Error:', e.code === '42P01' ? 'falta la tabla de ubicaciones o georef_importaciones: arrancá el servidor una vez para que aplique las migraciones.' : (e.message || e));
  process.exitCode = 1;
} finally {
  await pool.end();
}
