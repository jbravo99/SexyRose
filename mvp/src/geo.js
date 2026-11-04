/* ============================================================
   SexyRose MVP — geo.js
   Ubicaciones anidadas: país → provincia/estado → zona (opcional) → ciudad/localidad.
   - HH.db.locations guarda las ubicaciones del sitio con estado 'active' | 'pending'.
   - HH.GEO_REF simula la base de referencia (en producción: API Georef de Argentina / GeoNames).
   - Una acompañante elige su localidad de la base de referencia (o la escribe a mano);
     si no existe en el sitio, se crea como 'pending' y el admin la aprueba, la unifica o la rechaza.
   - Los nombres de ubicación son únicos en todo el sitio (por eso "Provincia de Córdoba" vs "Córdoba").
   ============================================================ */
(function () {
  'use strict';

  /* ---------- Árbol inicial (activo) ---------- */
  // [nombre, nivel, padre, lat, lng]
  const BASE = [
    ['Argentina', 'country', null, -38.4, -63.6],
    ['Ciudad de Buenos Aires', 'city', 'Argentina', -34.6037, -58.3816],
    ['Provincia de Buenos Aires', 'region', 'Argentina', -36.6, -60.0],
    ['Zona Norte (GBA)', 'zone', 'Provincia de Buenos Aires', -34.47, -58.6],
    ['Zona Oeste (GBA)', 'zone', 'Provincia de Buenos Aires', -34.68, -58.72],
    ['Zona Sur (GBA)', 'zone', 'Provincia de Buenos Aires', -34.78, -58.35],
    ['La Plata', 'city', 'Provincia de Buenos Aires', -34.9205, -57.9536],
    ['Mar del Plata', 'city', 'Provincia de Buenos Aires', -38.0055, -57.5426],
    ['San Isidro', 'city', 'Zona Norte (GBA)', -34.4708, -58.5286],
    ['Quilmes', 'city', 'Zona Sur (GBA)', -34.7206, -58.2546],
    ['Provincia de Córdoba', 'region', 'Argentina', -31.4, -64.2],
    ['Córdoba', 'city', 'Provincia de Córdoba', -31.4201, -64.1888],
    ['Provincia de Santa Fe', 'region', 'Argentina', -31.6, -60.7],
    ['Rosario', 'city', 'Provincia de Santa Fe', -32.9442, -60.6505],
    ['Provincia de Mendoza', 'region', 'Argentina', -32.9, -68.8],
    ['Mendoza', 'city', 'Provincia de Mendoza', -32.8895, -68.8458],
    ['Uruguay', 'country', null, -32.5, -55.8],
    ['Montevideo', 'city', 'Uruguay', -34.9011, -56.1645],
    ['Chile', 'country', null, -35.7, -71.5],
    ['Región Metropolitana', 'region', 'Chile', -33.45, -70.67],
    ['Santiago', 'city', 'Región Metropolitana', -33.4489, -70.6693],
    ['Perú', 'country', null, -9.2, -75.0],
    ['Lima', 'city', 'Perú', -12.0464, -77.0428],
    ['Colombia', 'country', null, 4.6, -74.1],
    ['Bogotá', 'city', 'Colombia', 4.7110, -74.0721],
    ['México', 'country', null, 23.6, -102.5],
    ['Ciudad de México', 'city', 'México', 19.4326, -99.1332],
    ['Brasil', 'country', null, -14.2, -51.9],
    ['Estado de São Paulo', 'region', 'Brasil', -22.2, -48.7],
    ['São Paulo', 'city', 'Estado de São Paulo', -23.5505, -46.6333],
    ['España', 'country', null, 40.4, -3.7],
    ['Comunidad de Madrid', 'region', 'España', 40.42, -3.70],
    ['Madrid', 'city', 'Comunidad de Madrid', 40.4168, -3.7038],
    ['Cataluña', 'region', 'España', 41.59, 1.52],
    ['Barcelona', 'city', 'Cataluña', 41.3874, 2.1686],
    ['Estados Unidos', 'country', null, 37.1, -95.7],
    ['Florida', 'region', 'Estados Unidos', 27.66, -81.5],
    ['Miami', 'city', 'Florida', 25.7617, -80.1918],
  ];
  HH.seedLocations = function () {
    const byName = {}; const out = [];
    BASE.forEach(([name, level, parent, lat, lng]) => {
      const loc = { id: 'loc_' + HH.slugify(name), name, level, parentId: parent ? byName[parent].id : null, lat, lng, status: 'active', createdAt: HH.daysAgo(200) };
      byName[name] = loc; out.push(loc);
    });
    return out;
  };

  /* ---------- Base de referencia (muestra; en producción, Georef / GeoNames) ---------- */
  // [localidad, padre (zona/provincia), lat, lng]
  HH.GEO_REF = [
    // Conurbano: Zona Oeste
    ['Merlo', 'Zona Oeste (GBA)', -34.6653, -58.7276], ['San Antonio de Padua', 'Zona Oeste (GBA)', -34.6667, -58.7000], ['Morón', 'Zona Oeste (GBA)', -34.6534, -58.6198], ['Ituzaingó', 'Zona Oeste (GBA)', -34.6588, -58.6670], ['Castelar', 'Zona Oeste (GBA)', -34.6519, -58.6440], ['Haedo', 'Zona Oeste (GBA)', -34.6440, -58.5928], ['Ramos Mejía', 'Zona Oeste (GBA)', -34.6411, -58.5650], ['San Justo', 'Zona Oeste (GBA)', -34.6826, -58.5605], ['Moreno', 'Zona Oeste (GBA)', -34.6507, -58.7900], ['Hurlingham', 'Zona Oeste (GBA)', -34.5885, -58.6391],
    // Zona Norte
    ['Vicente López', 'Zona Norte (GBA)', -34.5265, -58.4796], ['Olivos', 'Zona Norte (GBA)', -34.5100, -58.4930], ['Martínez', 'Zona Norte (GBA)', -34.4929, -58.5045], ['Tigre', 'Zona Norte (GBA)', -34.4260, -58.5797], ['San Fernando', 'Zona Norte (GBA)', -34.4417, -58.5584], ['Pilar', 'Zona Norte (GBA)', -34.4587, -58.9142], ['San Miguel', 'Zona Norte (GBA)', -34.5434, -58.7124], ['Nordelta', 'Zona Norte (GBA)', -34.4000, -58.6400],
    // Zona Sur
    ['Avellaneda', 'Zona Sur (GBA)', -34.6627, -58.3653], ['Lanús', 'Zona Sur (GBA)', -34.7061, -58.3920], ['Banfield', 'Zona Sur (GBA)', -34.7438, -58.3954], ['Lomas de Zamora', 'Zona Sur (GBA)', -34.7616, -58.4064], ['Adrogué', 'Zona Sur (GBA)', -34.7998, -58.3842], ['Berazategui', 'Zona Sur (GBA)', -34.7626, -58.2127], ['Ezeiza', 'Zona Sur (GBA)', -34.8540, -58.5230],
    // Resto de la provincia
    ['Bahía Blanca', 'Provincia de Buenos Aires', -38.7196, -62.2724], ['Tandil', 'Provincia de Buenos Aires', -37.3217, -59.1332], ['Pinamar', 'Provincia de Buenos Aires', -37.1074, -56.8619], ['Luján', 'Provincia de Buenos Aires', -34.5703, -59.1050], ['Campana', 'Provincia de Buenos Aires', -34.1687, -58.9590], ['Necochea', 'Provincia de Buenos Aires', -38.5545, -58.7396],
    // Otras provincias
    ['Villa Carlos Paz', 'Provincia de Córdoba', -31.4241, -64.4978], ['Río Cuarto', 'Provincia de Córdoba', -33.1232, -64.3493], ['Santa Fe', 'Provincia de Santa Fe', -31.6333, -60.7000], ['San Rafael', 'Provincia de Mendoza', -34.6177, -68.3301],
    // Otros países
    ['Punta del Este', 'Uruguay', -34.9600, -54.9500], ['Viña del Mar', 'Chile', -33.0245, -71.5518], ['Valencia', 'España', 39.4699, -0.3763], ['Medellín', 'Colombia', 6.2442, -75.5812], ['Guadalajara', 'México', 20.6597, -103.3496], ['Río de Janeiro', 'Brasil', -22.9068, -43.1729], ['Orlando', 'Florida', 28.5383, -81.3792],
  ].map(([name, parent, lat, lng]) => ({ name, parent, lat, lng }));

  /* ---------- Consultas ---------- */
  const L = () => (HH.db && HH.db.locations) || [];
  HH.locById = (id) => L().find(l => l.id === id) || null;
  HH.locByName = (name) => L().find(l => l.name === name) || null;
  HH.locParent = (loc) => loc && loc.parentId ? HH.locById(loc.parentId) : null;
  HH.locPath = function (loc) { const out = []; let cur = loc; let guard = 0; while (cur && guard++ < 8) { out.unshift(cur); cur = HH.locParent(cur); } return out; };
  HH.locCountry = (loc) => { const p = HH.locPath(loc); return p.length ? p[0].name : ''; };
  HH.locLabel = (loc, opts = {}) => { if (!loc) return ''; const p = HH.locPath(loc).filter(x => x.level !== 'country' || opts.country).reverse(); return p.map(x => x.name).join(', '); };
  HH.locChildren = (id) => L().filter(l => l.parentId === id);
  HH.isActiveLoc = (loc) => !!loc && loc.status === 'active' && HH.locPath(loc).every(x => x.status === 'active');
  // ¿El lugar "placeName" (cualquier nivel) contiene a la ciudad "cityName"?
  HH.placeContains = function (placeName, cityName) {
    if (!placeName) return true; if (!cityName) return false; if (placeName === cityName) return true;
    const c = HH.locByName(cityName); return !!c && HH.locPath(c).some(x => x.name === placeName);
  };
  // Tablas derivadas (compatibles con el código anterior): solo ciudades activas
  Object.defineProperty(HH, 'CITY_COORDS', { configurable: true, get: () => { const o = {}; L().filter(l => l.level === 'city' && HH.isActiveLoc(l)).forEach(l => { o[l.name] = [l.lat, l.lng]; }); return o; } });
  Object.defineProperty(HH, 'CITY_COUNTRY', { configurable: true, get: () => { const o = {}; L().filter(l => l.level === 'city').forEach(l => { o[l.name] = HH.locCountry(l); }); return o; } });
  // Coordenadas de cualquier ubicación (si no tiene, las del padre)
  HH.locCoords = (loc) => { let cur = loc; while (cur) { if (typeof cur.lat === 'number') return [cur.lat, cur.lng]; cur = HH.locParent(cur); } return null; };

  // Generaliza "en la ciudad X" a "en el lugar X" (país, provincia, zona o ciudad)
  HH.inCity = (p, place) => !place || HH.placeContains(place, p.city) || (HH.upcomingTrip(p) && HH.placeContains(place, HH.upcomingTrip(p).city));

  // Opciones jerárquicas para selectores públicos: solo ubicaciones activas con al menos un perfil publicado debajo
  HH.placeOptions = function ({ all } = {}) {
    const pubCities = new Set((HH.publishedProfiles ? HH.publishedProfiles() : []).map(p => p.city));
    const has = (loc) => all || L().some(c => c.level === 'city' && pubCities.has(c.name) && HH.locPath(c).some(x => x.id === loc.id));
    const out = [];
    const walk = (parentId, depth) => L().filter(l => l.parentId === parentId && HH.isActiveLoc(l) && has(l)).sort((a, b) => (a.level === 'city') - (b.level === 'city') || a.name.localeCompare(b.name)).forEach(l => { out.push({ loc: l, depth }); walk(l.id, depth + 1); });
    walk(null, 0);
    return out;
  };
  HH.placeSelectOptions = (selected, opts) => HH.placeOptions(opts).map(({ loc, depth }) => `<option value="${HH.esc(loc.name)}"${loc.name === selected ? ' selected' : ''}>${' '.repeat(depth)}${HH.esc(loc.name)}</option>`).join('');

  /* ---------- Búsqueda para el alta (base de referencia + sitio) ---------- */
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  HH.searchPlaces = function (q) {
    const n = norm(q).trim(); if (n.length < 2) return [];
    const res = [];
    L().filter(l => l.level === 'city' && l.status !== 'rejected' && norm(l.name).includes(n)).forEach(l => res.push({ name: l.name, parent: (HH.locParent(l) || {}).name || '', status: l.status, existing: true }));
    HH.GEO_REF.filter(r => norm(r.name).includes(n) && !res.some(x => x.name === r.name)).forEach(r => res.push({ name: r.name, parent: r.parent, status: 'new', ref: r }));
    return res.sort((a, b) => (norm(a.name).startsWith(n) ? 0 : 1) - (norm(b.name).startsWith(n) ? 0 : 1) || a.name.localeCompare(b.name)).slice(0, 8);
  };
  // Devuelve la ubicación (ciudad) para un nombre elegido: existente, de la base de referencia (pendiente) o escrita a mano (pendiente)
  HH.resolvePlace = function ({ name, parent, lat, lng }, createdBy) {
    const ex = HH.locByName(name); if (ex && ex.level === 'city' && ex.status !== 'rejected') return ex;
    const ref = HH.GEO_REF.find(r => r.name === name);
    const parentName = parent || (ref && ref.parent);
    const par = HH.locByName(parentName); if (!par) return null;
    const loc = { id: HH.uid('loc'), name: String(name).trim(), level: 'city', parentId: par.id, lat: ref ? ref.lat : (lat ?? null), lng: ref ? ref.lng : (lng ?? null), status: 'pending', source: ref ? 'referencia' : 'manual', createdBy: createdBy || null, createdAt: HH.now() };
    HH.db.locations.push(loc); HH.save(); return loc;
  };
  HH.pendingLocations = () => L().filter(l => l.status === 'pending');
  HH.profilesAt = (name) => (HH.db.profiles || []).filter(p => p.homeCity === name || p.city === name || p.pendingCity === name);

  /* ---------- Acciones de admin ---------- */
  HH.approveLocation = function (id) {
    const loc = HH.locById(id); if (!loc) return;
    HH.locPath(loc).forEach(x => { if (x.status === 'pending') x.status = 'active'; });
    // Perfiles que pidieron mudarse a esta ubicación la toman ahora
    (HH.db.profiles || []).forEach(p => { if (p.pendingCity === loc.name) { p.homeCity = loc.name; p.homeCountry = HH.locCountry(loc); p.pendingCity = null; } });
    loc.approvedAt = HH.now(); HH.applyTrips && HH.applyTrips(); HH.save();
  };
  HH.mergeLocation = function (id, targetName) {
    const loc = HH.locById(id); const target = HH.locByName(targetName); if (!loc || !target || loc.id === target.id) return false;
    (HH.db.profiles || []).forEach(p => {
      if (p.homeCity === loc.name) { p.homeCity = target.name; p.homeCountry = HH.locCountry(target); }
      if (p.city === loc.name) p.city = target.name;
      if (p.pendingCity === loc.name) { p.pendingCity = null; p.homeCity = target.name; p.homeCountry = HH.locCountry(target); }
      (p.trips || []).forEach(t => { if (t.city === loc.name) t.city = target.name; });
    });
    HH.db.locations = L().filter(l => l.id !== loc.id); HH.applyTrips && HH.applyTrips(); HH.save(); return true;
  };
  HH.rejectLocation = function (id) {
    const loc = HH.locById(id); if (!loc) return; loc.status = 'rejected'; loc.rejectedAt = HH.now();
    (HH.db.profiles || []).forEach(p => { if (p.pendingCity === loc.name) p.pendingCity = null; });
    HH.save();
  };
  HH.addLocation = function ({ name, level, parentName, lat, lng }) {
    name = String(name || '').trim(); if (name.length < 2) return { error: 'Escribí el nombre.' };
    if (HH.locByName(name)) return { error: 'Ya existe una ubicación con ese nombre. Usá un nombre único (por ejemplo "Provincia de …").' };
    const par = parentName ? HH.locByName(parentName) : null; if (level !== 'country' && !par) return { error: 'Elegí dónde va anidada.' };
    const loc = { id: HH.uid('loc'), name, level, parentId: par ? par.id : null, lat: lat === '' || lat == null ? null : Number(lat), lng: lng === '' || lng == null ? null : Number(lng), status: 'active', source: 'admin', createdAt: HH.now() };
    HH.db.locations.push(loc); HH.save(); return { loc };
  };
  // Verificar a una acompañante también aprueba su ubicación si estaba pendiente
  HH.approveProfileVerification = function (p) {
    p.verified = 'verified';
    const loc = HH.locByName(p.homeCity || p.city); if (loc && loc.status === 'pending') HH.approveLocation(loc.id);
    HH.save();
  };
})();
