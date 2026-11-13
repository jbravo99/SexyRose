/* Selector de ubicación al estilo distintas.net (13/11/2026): funciones puras (sin DOM) que usa views-public.js
   y prueban los tests de la app (vm).
   - Hermanos en orden alfabético sin importar el nivel (antes las ciudades iban después de provincias y zonas, y
     "Ciudad de Buenos Aires" quedaba última), sin distinguir acentos ni mayúsculas.
   - Los lugares sin perfiles no se muestran, salvo los del camino elegido.
   - El camino elegido (país ✓, provincia ✓, ciudad ✓…) va arriba; abajo, los hijos del último lugar del camino que
     tiene hijos (si el elegido no tiene hijos, se ven sus hermanos). */
(function (root) {
  const HH = (root.HH = root.HH || {});
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function ordenar(locs) {
    return locs.slice().sort((a, b) => {
      const x = norm(a.name), y = norm(b.name);
      return x < y ? -1 : x > y ? 1 : 0;
    });
  }

  // Camino desde la raíz hasta loc (incluido), con un tope por si hubiera un ciclo en los datos
  function camino(locs, id) {
    const byId = new Map(locs.map((l) => [l.id, l]));
    const out = [];
    let cur = id ? byId.get(id) : null; let guard = 0;
    while (cur && guard++ < 10) { out.unshift(cur); cur = cur.parentId ? byId.get(cur.parentId) : null; }
    return out;
  }

  // Hijos activos de un lugar (parentId null = raíz), en orden alfabético
  function hijos(locs, parentId, activo) {
    return ordenar(locs.filter((l) => (l.parentId || null) === (parentId || null) && (!activo || activo(l))));
  }

  /* Vista del selector:
     sel     id elegido (null = todas las ubicaciones)
     locs    lista de lugares {id, name, parentId}
     activo  (loc) => bool  lugares habilitados
     contar  (loc) => número de perfiles del lugar
     → { camino: [loc…], nivel: id | null (padre de la lista), lista: [{loc, n, tieneHijos, elegido}], vacia } */
  function vista(locs, sel, activo, contar) {
    const path = camino(locs, sel);
    const enCamino = new Set(path.map((l) => l.id));
    const elegido = path[path.length - 1] || null;
    const conHijos = (l) => hijos(locs, l.id, activo).some((k) => contar(k) > 0 || enCamino.has(k.id));
    let nivel = null;
    if (elegido) nivel = conHijos(elegido) ? elegido.id : (elegido.parentId || null);
    const todos = hijos(locs, nivel, activo).filter((l) => !enCamino.has(l.id) || l.id === (elegido && elegido.id));
    const lista = todos
      .map((l) => ({ loc: l, n: contar(l), tieneHijos: conHijos(l), elegido: !!elegido && l.id === elegido.id }))
      .filter((r) => r.n > 0 || r.elegido);
    // En el camino de arriba van los antepasados del nivel que se lista (y el elegido si es el propio nivel)
    const arriba = nivel ? camino(locs, nivel) : [];
    return { camino: arriba, nivel, lista, vacia: !lista.length };
  }

  /* Lugar del estado del servidor → lugar del sitio. Si el nombre se repite entre los lugares con perfiles (dos
     "Santa Rosa"), el servidor manda una aclaración (la provincia) y el nombre del sitio queda "Santa Rosa · Mendoza":
     así cada lugar tiene un nombre único y lo que busca por nombre (selector, contadores, Cerca, filtros) no junta
     dos lugares distintos. base y extra sirven para mostrar la aclaración como texto secundario. */
  function lugarDeEstado(u) {
    const extra = u.aclaracion ? String(u.aclaracion) : '';
    return { name: extra ? u.nombre + ' · ' + extra : u.nombre, base: u.nombre, extra };
  }
  // Ciudad del perfil por id (ubicacionIds), no por nombre: byId Map(id → lugar del sitio)
  function lugarDePerfil(x, byId) {
    const ids = x.ubicacionIds || {};
    return byId.get(ids.ciudad) || byId.get(ids.provincia) || null;
  }

  HH.ubic = { norm, ordenar, camino, hijos, vista, lugarDeEstado, lugarDePerfil };
})(typeof window !== 'undefined' ? window : globalThis);
