/* SexyRose — paquete del mapa de "Cerca de mí" (13/11/2026). Lo arma app/scripts/build-sitio.py con esbuild
   (MapLibre GL + PMTiles + estilo de Protomaps, desde npm) en assets/mapa.<hash>.js y se baja solo al abrir la vista
   Mapa. Expone window.SRMapa.montar(el, cfg, puntos, opciones) → { actualizar, quitar }.
   - cfg: { tiles (URL del .pmtiles), glyphs, sprite (opcionales: sin ellos el mapa va sin nombres de calles),
            worker (URL del worker de MapLibre, mismo origen), lang, maxZoom }
   - puntos: [{ id, lat, lng, nombre, star, av (HTML de la foto) }] en su ubicación APROXIMADA (HH.profileCoords)
   - opciones: { yo: {lat,lng} | null (el visitante, solo en este navegador), centro: [lat,lng], km, onPick(id, el) }
   Seguridad: zoom máximo limitado (cfg.maxZoom, 14) para que nadie deduzca una cuadra. */
import { Map as MlMap, Marker, AttributionControl, NavigationControl, addProtocol, setWorkerUrl } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { layers, namedFlavor } from '@protomaps/basemaps';

const ATRIB = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> · <a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>';

// Paleta oscura del sitio sobre la base "dark" de Protomaps
function sabor() {
  const f = Object.assign({}, namedFlavor('dark'));
  Object.assign(f, {
    background: '#15131A', earth: '#1B1921', water: '#121A26',
    park_a: '#1C2420', park_b: '#1C2420', wood_a: '#1B231F', wood_b: '#1B231F', scrub_a: '#1C221F', scrub_b: '#1C221F',
    buildings: '#24212B', pedestrian: '#201D26', sand: '#221F24', beach: '#221F24',
    minor_a: '#2A2731', minor_b: '#2A2731', minor_service: '#25222C', other: '#25222C', link: '#34303D', major: '#3A3442', highway: '#4A3A48',
    boundaries: '#5A3A4C', railway: '#2E2A36',
  });
  return f;
}

let protocolo = null;
function preparar(cfg) {
  if (cfg.worker) setWorkerUrl(cfg.worker);
  if (!protocolo) { protocolo = new Protocol(); addProtocol('pmtiles', protocolo.tile); }
}

function estilo(cfg) {
  const conNombres = !!(cfg.glyphs && cfg.sprite);
  const st = {
    version: 8,
    sources: { protomaps: { type: 'vector', url: 'pmtiles://' + cfg.tiles, attribution: ATRIB } },
    layers: layers('protomaps', sabor(), conNombres ? { lang: (cfg.lang || 'es').slice(0, 2) } : undefined),
  };
  if (conNombres) { st.glyphs = cfg.glyphs; st.sprite = cfg.sprite; }
  return st;
}

// Zoom para que entre un círculo de `km` alrededor del centro (aproximado)
function zoomPara(km, lat) {
  if (!km) return 11;
  const metrosPorPx256 = 156543.03 * Math.cos(lat * Math.PI / 180);
  const z = Math.log2(metrosPorPx256 * 180 / (km * 1000));
  return Math.max(4, Math.min(13, z));
}

function geo(puntos) {
  return {
    type: 'FeatureCollection',
    features: (puntos || []).filter((p) => isFinite(p.lat) && isFinite(p.lng)).map((p) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { id: String(p.id), nombre: p.nombre || '', star: p.star ? 1 : 0, av: p.av || '' },
    })),
  };
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function montar(el, cfg, puntos, o) {
  preparar(cfg);
  o = o || {};
  // Traductor del sitio (HH.t): los rótulos se arman en español y se pasan al idioma del visitante
  const t = typeof cfg.t === 'function' ? cfg.t : (s) => s;
  const maxZoom = Math.min(14, cfg.maxZoom || 14);
  const c = (o.centro && o.centro.length === 2) ? o.centro : (o.yo ? [o.yo.lat, o.yo.lng] : [-38.4, -63.6]);
  const map = new MlMap({
    container: el, style: estilo(cfg), center: [c[1], c[0]], zoom: o.centro ? zoomPara(o.km, c[0]) : 4,
    minZoom: 3, maxZoom, attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false,
    renderWorldCopies: false, cooperativeGestures: false,
    // Textos de los controles en español (el traductor del sitio los pasa a EN/PT)
    locale: { 'Map.Title': t('Mapa'), 'NavigationControl.ZoomIn': t('Acercar'), 'NavigationControl.ZoomOut': t('Alejar'),
      'AttributionControl.ToggleAttribution': t('Créditos del mapa') },
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new AttributionControl({ compact: true }), 'bottom-right');
  map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

  let datos = geo(puntos);
  const marcas = new Map(); // clave → Marker
  let yo = null;

  function ponerYo(p) {
    if (yo) { yo.remove(); yo = null; }
    if (!p) return;
    const d = document.createElement('div');
    d.className = 'srm-yo'; d.setAttribute('aria-hidden', 'true');
    yo = new Marker({ element: d }).setLngLat([p.lng, p.lat]).addTo(map);
  }

  function sincronizar() {
    if (!map.getSource('p') || !map.isSourceLoaded('p')) return;
    const vistos = new Set();
    for (const f of map.querySourceFeatures('p')) {
      const pr = f.properties || {};
      const clave = pr.cluster ? 'c' + pr.cluster_id : 'p' + pr.id;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      if (marcas.has(clave)) continue;
      const b = document.createElement('button');
      b.type = 'button';
      if (pr.cluster) {
        const n = pr.point_count || 0;
        b.className = 'srm-grupo';
        b.textContent = n > 99 ? '99+' : String(n);
        b.setAttribute('aria-label', t(n + ' perfiles'));
        const id = pr.cluster_id;
        const ll = f.geometry.coordinates.slice();
        b.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          let z = map.getZoom() + 2;
          try { z = await map.getSource('p').getClusterExpansionZoom(id); } catch (e) { /* */ }
          map.easeTo({ center: ll, zoom: Math.min(maxZoom, z + 0.2) });
        });
      } else {
        b.className = 'srm-punto' + (pr.star ? ' star' : '');
        b.setAttribute('aria-label', t(pr.nombre ? 'Perfil de ' + pr.nombre : 'Ver perfil'));
        b.innerHTML = pr.av || '';
        const id = pr.id;
        b.addEventListener('click', (ev) => { ev.stopPropagation(); if (o.onPick) o.onPick(id, b); });
      }
      const m = new Marker({ element: b }).setLngLat(f.geometry.coordinates).addTo(map);
      marcas.set(clave, m);
    }
    for (const [k, m] of marcas) if (!vistos.has(k)) { m.remove(); marcas.delete(k); }
  }

  map.on('load', () => {
    map.addSource('p', { type: 'geojson', data: datos, cluster: true, clusterRadius: 46, clusterMaxZoom: maxZoom - 1 });
    // Capa invisible: hace que la fuente se procese (los marcadores son HTML, con la foto de cada una)
    map.addLayer({ id: 'p-oculta', type: 'circle', source: 'p', paint: { 'circle-radius': 1, 'circle-opacity': 0 } });
    ponerYo(o.yo);
    sincronizar();
  });
  map.on('data', (e) => { if (e.sourceId === 'p' && e.isSourceLoaded) sincronizar(); });
  map.on('moveend', sincronizar);

  return {
    actualizar(nuevos, o2) {
      o = Object.assign({}, o, o2 || {});
      datos = geo(nuevos);
      for (const m of marcas.values()) m.remove();
      marcas.clear();
      const s = map.getSource('p');
      if (s) s.setData(datos);
      if (map.loaded()) ponerYo(o.yo);
    },
    quitar() { try { map.remove(); } catch (e) { /* */ } },
    mapa: map,
  };
}

window.SRMapa = { montar, _esc: esc };
