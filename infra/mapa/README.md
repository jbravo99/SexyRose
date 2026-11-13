## Mapa de Cerca de mí (vista "Mapa")

Cerca de mí tiene dos vistas: **Radar** (siempre) y **Mapa** (solo si está configurado). El mapa es un único archivo
`argentina.pmtiles` (recorte de Argentina del mapa de OpenStreetMap que publica Protomaps) guardado en bunny.net.
El navegador pide solo los pedacitos que necesita (pedidos con `Range`), así que no hace falta ningún servidor de mapas.

- Sin `MAP_TILES_URL` el botón "Mapa" no aparece y Cerca queda solo con el radar (como hasta ahora).
- El paquete del mapa (MapLibre, ~1,1 MB) se baja **solo cuando alguien abre la vista Mapa**: no pesa en el inicio.
- Zoom máximo 14 y las acompañantes en su ubicación **aproximada** (centro de su zona corrido 1 a 4 km): nadie
  puede deducir una cuadra. La ubicación del visitante nunca sale de su navegador.
- Créditos visibles en el mapa: © OpenStreetMap · Protomaps (obligatorio por la licencia ODbL de OpenStreetMap).

### 1) Instalar `pmtiles` (una sola vez, en la Mac)

```bash
brew install pmtiles
```

### 2) Generar el mapa

Desde la raíz del repo:

```bash
bash infra/mapa/generar-mapa.sh
```

Hace esto y deja todo en `./mapa-salida/` (no se sube al repo):

1. Busca el último build diario de Protomaps (`https://build.protomaps.com/AAAAMMDD.pmtiles`, los guardan pocos días;
   la lista está en https://maps.protomaps.com/builds/). Si no encuentra uno, pasale la fecha: `--fecha 20261110`.
2. Recorta Argentina (`--bbox=-73.6,-55.2,-53.5,-21.7 --maxzoom=14`) **sin bajar el planeta entero**: pide solo los
   pedazos de Argentina. Tarda varios minutos. Tamaño esperable: alrededor de 1 a 3 GB.
3. Baja las fuentes (Noto Sans) y los íconos (sprites `v4/dark`) de `protomaps/basemaps-assets`, para que el mapa
   muestre nombres de calles, barrios y ciudades.

### 3) Subirlo a bunny.net

Con las mismas claves que ya usa el sitio para las fotos (`BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_KEY`,
`BUNNY_STORAGE_HOST` y `BUNNY_CDN_URL` del `.env`):

```bash
bash infra/mapa/generar-mapa.sh --subir
```

Sube `argentina.pmtiles`, `fonts/` y `sprites/` a la carpeta `mapa/` de la zona de almacenamiento (si el recorte ya
existe no lo vuelve a generar) y al final imprime las tres variables para el `.env`.

A mano (si preferís): en bunny.net → Storage → tu zona → crear la carpeta `mapa` y subir ahí `argentina.pmtiles`,
la carpeta `fonts` y la carpeta `sprites` tal como quedaron en `mapa-salida/`.

### 4) Pull Zone de bunny.net (una sola vez)

En la Pull Zone que sirve esa zona (la de `BUNNY_CDN_URL`):

- **Headers → Add CORS headers**: activado, y en la lista de extensiones agregar `pmtiles`, `pbf`, `json` y `png`
  (además de las que ya tenga).
- **Caching**: dejar que respete los pedidos con `Range` (bunny los acepta por defecto). No activar opciones que
  reescriban o compriman el `.pmtiles`.

Probarlo:

```bash
bash infra/mapa/generar-mapa.sh --verificar https://TU-CDN/mapa/argentina.pmtiles
```

Tiene que responder `206` y traer `Access-Control-Allow-Origin`.

### 5) Variables del servidor

En el `.env` del servidor (los nombres ya están en `.env.example`):

```
MAP_TILES_URL=https://TU-CDN/mapa/argentina.pmtiles
MAP_GLYPHS_URL=https://TU-CDN/mapa/fonts/{fontstack}/{range}.pbf
MAP_SPRITE_URL=https://TU-CDN/mapa/sprites/v4/dark
```

- Solo `https` y el archivo tiene que terminar en `.pmtiles`; si no, el servidor lo ignora.
- `MAP_GLYPHS_URL` y `MAP_SPRITE_URL` van juntas: sin alguna de las dos el mapa funciona igual, pero sin nombres.
- La dirección del CDN se suma sola a la CSP (`connect-src`). Después de cambiar el `.env`: reiniciar el app
  (`docker compose up -d app`, o `infra/server/deploy.sh`).

### Demo (/demo/)

La demo es estática: muestra el mapa solo si la imagen se arma con las direcciones del mapa como argumentos de build
(y el servidor tiene las mismas en el `.env`, para la CSP). Sin eso, la demo tiene solo el radar:

```bash
docker compose -f infra/docker-compose.yml build \
  --build-arg MAP_TILES_URL=https://TU-CDN/mapa/argentina.pmtiles \
  --build-arg MAP_GLYPHS_URL='https://TU-CDN/mapa/fonts/{fontstack}/{range}.pbf' \
  --build-arg MAP_SPRITE_URL=https://TU-CDN/mapa/sprites/v4/dark app
```

### Actualizar el mapa

No hace falta seguido (las calles cambian poco). Para regenerarlo: borrar `mapa-salida/argentina.pmtiles`, correr de
nuevo `generar-mapa.sh --subir` y purgar la caché de la Pull Zone en bunny.net.
