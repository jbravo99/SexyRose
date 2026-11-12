// Genera los PNG del logo (ícono de la pantalla de inicio de iPhone y el del encabezado de los emails) a partir de
// app/public/favicon.svg, que es el logo único del sitio (cuadrado rosa con el corazón, igual que el del encabezado).
//   node app/scripts/generar-logos.mjs
// Los PNG quedan en app/public y se suben al repo (no hace falta correrlo en el deploy).
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const svg = await readFile(path.join(PUB, 'favicon.svg'));
const salidas = [
  ['apple-touch-icon.png', 180, false],  // iOS recorta las esquinas solo: fondo lleno, sin redondeo propio
  ['logo-email.png', 96, true],          // se muestra a 32 px en los emails (96 para pantallas densas)
  ['icon-192.png', 192, true],
  ['icon-512.png', 512, true],
];
for (const [nombre, lado, redondeado] of salidas) {
  let fuente = svg;
  if (!redondeado) fuente = Buffer.from(String(svg).replace('rx="18"', 'rx="0"'));
  await sharp(fuente, { density: Math.ceil(72 * lado / 64) }).resize(lado, lado).png({ compressionLevel: 9 }).toFile(path.join(PUB, nombre));
  console.log('ok', nombre, lado);
}
