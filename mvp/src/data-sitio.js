/* ============================================================
   SexyRose — data-sitio.js (solo en el sitio real y la demo: HH_TARGET=sitio)
   Reemplaza a data.js: el sitio usa datos reales (/api/sitio/estado) o el estado ficticio de la demo, así que la
   semilla del prototipo (perfiles, mensajes y compras de ejemplo) no viaja al navegador. HH.seed() devuelve la
   forma vacía de la base, que prod-sitio.js completa.
   ============================================================ */
HH.SEED_VERSION = 32;
HH.seed = function () {
  const settings = JSON.parse(JSON.stringify(HH.DEFAULT_SETTINGS));
  return { likes: [], version: HH.SEED_VERSION, locations: [], activities: [], settings, stories: [], highlights: [], users: [], profiles: [], subscriptions: [], stars: [], content: [], packs: [], requests: [], messages: [], payments: [], purchases: [], swipes: [], reports: [], bookings: [] };
};
