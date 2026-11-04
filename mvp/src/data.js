/* ============================================================
   SexyRose MVP — data.js
   Datos semilla de demostración. HH.seed() devuelve la base completa.
   ============================================================ */
HH.SEED_VERSION = 31;
HH.seed = function () {
  const d = HH.daysAgo, f = HH.daysFromNow, now = HH.now();
  const users = [];
  const profiles = [];
  const subscriptions = [];
  const content = [];
  const packs = [];
  const u = (id, name, email, role, extra = {}) => { users.push(Object.assign({ id, name, email, password: 'demo1234', role, createdAt: d(extra.days || 90), hue: extra.hue || 200 }, extra)); return id; };
  const w = (id, p) => {
    u(id, p.fullName || p.displayName, p.email || (HH.slugify(p.displayName) + '@sexyrose.demo'), 'worker', { days: p.days || 60 });
    const prof = Object.assign({ userId: id, slug: HH.slugify(p.displayName), gender: 'mujer', photos: ['seed', 'seed', 'seed', 'seed'], online: Math.random() < 0.6, lat: null, lng: null, languages: ['Español'], verified: 'verified', emailVerified: true, whatsappVerified: true, status: 'active', createdAt: d(p.days || 60), stats: { views: 0, rightSwipes: 0 }, chatPriceUsd: 5 }, p);
    delete prof.fullName; delete prof.email; delete prof.level; delete prof.days; delete prof.items; delete prof.pack;
    profiles.push(prof);
    if (p.level) subscriptions.push({ id: 'sub_' + id, userId: id, level: p.level, status: 'active', startedAt: d(p.subDays || 20), expiresAt: f(30 - (p.subDays || 20)), providerRef: 'demo' });
    (p.items || []).forEach((it, i) => content.push(Object.assign({ id: 'c_' + id + '_' + i, workerId: id, views: 40 + Math.floor(Math.random() * 400), sales: it.isPremium ? Math.floor(Math.random() * 12) : 0, createdAt: d(it.days != null ? it.days : (p.days || 30) - i * 3), hue: ((p.hue || 330) + i * 37) % 360, src: null }, it)));
    if (p.pack) packs.push(Object.assign({ id: 'pk_' + id, workerId: id, itemIds: p.pack.idx.map(i => 'c_' + id + '_' + i), sales: p.pack.sales || 0, createdAt: d(10) }, p.pack));
    return id;
  };
  const ph = (title, caption, price, days) => ({ type: 'photo', title, caption, isPremium: price != null, priceUsd: price || 0, days });
  const vi = (title, caption, price, duration, days) => ({ type: 'video', title, caption, isPremium: price != null, priceUsd: price || 0, duration, days });
  const sh = (title, caption, price, duration, days) => ({ type: 'short', title, caption, isPremium: price != null, priceUsd: price || 0, duration, days });

  // --- Acompañantes ---
  w('u_vale', { photos: Array(24).fill('seed'), videos: [{ id: 'pv_v1', src: null, name: 'Paseo por Palermo', seconds: 14, hue: 330 }, { id: 'pv_v2', src: null, name: 'Café en Villa Crespo', seconds: 9, hue: 20 }], displayName: 'Valentina', fullName: 'Valentina Ríos', email: 'vale@sexyrose.demo', age: 27, city: 'Ciudad de Buenos Aires', country: 'Argentina', hue: 335, level: 'S', subDays: 12, days: 240,
    headline: 'Cafés de especialidad, museos y charlas largas', bio: 'Soy Vale. Me gusta descubrir cafeterías nuevas en Palermo y Villa Crespo, recorrer el Malba sin apuro y terminar el día con un helado en la costanera. Si venís de visita a Buenos Aires, armo el recorrido con vos. Hablo inglés y portugués.',
    activities: ['cafe', 'museo', 'helado', 'paseo', 'idiomas'], languages: ['Español', 'Inglés', 'Portugués'], rateFrom: 35, chatPriceUsd: 8, whatsapp: '+54 9 11 0000 0001', stats: { views: 4820, rightSwipes: 612 },
    items: [ph('Tarde en el Malba', 'Recorrido por la muestra nueva', null, 2), sh('Café con vista', 'Mi lugar favorito en Villa Crespo', null, '0:24', 3), vi('Paseo por la costanera', 'Atardecer y helado de pistacho', 6, '2:10', 5), ph('Librería de la avenida', 'Encontré una primera edición', 4, 7), ph('Picnic en los bosques', 'Domingo de sol en Palermo', 5, 9), sh('Ruta del helado', 'Tres heladerías en una tarde', 3, '0:41', 12), vi('Detrás de escena', 'Preparando la salida al teatro', 9, '4:05', 14), ph('Brunch de sábado', 'Pancakes y charla', null, 18)],
    pack: { title: 'Pack Buenos Aires', description: 'Las 4 mejores salidas del mes en fotos y video', priceUsd: 15, idx: [2, 3, 4, 6], sales: 23 } });
  w('u_juli', { displayName: 'Julieta', fullName: 'Julieta Paz', email: 'juli@sexyrose.demo', age: 24, city: 'Córdoba', country: 'Argentina', hue: 350, level: 'C', subDays: 3, days: 4, verified: 'pending',
    photos: [null, null, null, null], whatsappVerified: false, headline: 'Nueva en SexyRose', bio: 'Me gusta el cine y caminar.', activities: ['cine', 'paseo'], rateFrom: null, chatPriceUsd: 5, whatsapp: '+54 9 351 000 0002', stats: { views: 86, rightSwipes: 9 },
    items: [sh('Primer short', 'Hola, soy Juli', null, '0:15', 1)] });
  w('u_cami', { displayName: 'Camila', age: 29, city: 'Montevideo', country: 'Uruguay', hue: 300, level: 'S', subDays: 8, days: 150,
    headline: 'Rambla, ferias y mate al atardecer', bio: 'Montevideana de toda la vida. Te llevo a la feria de Tristán Narvaja, a tomar mate en la rambla y a probar el mejor chivito de la ciudad. Ideal para quien visita la ciudad por trabajo y quiere conocerla de verdad.',
    activities: ['paseo', 'compras', 'cena', 'cafe'], rateFrom: 30, chatPriceUsd: 6, whatsapp: '+598 00 000 003', stats: { views: 2210, rightSwipes: 240 },
    items: [ph('Rambla al atardecer', 'Mate y viento', null, 1), sh('Feria de domingo', 'Tristán Narvaja en 30 segundos', null, '0:30', 4), vi('Tour de chivitos', 'Tres lugares, un ganador', 5, '3:12', 6), ph('Ciudad Vieja', 'Caminata entre galerías', 4, 8), ph('Mercado del Puerto', 'Almuerzo de viernes', 4, 11)],
    pack: { title: 'Pack Montevideo', description: 'Rambla, feria y Ciudad Vieja', priceUsd: 10, idx: [2, 3, 4], sales: 9 } });
  w('u_sofi', { displayName: 'Sofía', age: 31, city: 'Santiago', country: 'Chile', hue: 20, level: 'S', subDays: 25, days: 300,
    headline: 'Vinos, cerros y conversación', bio: 'Guía de corazón. Subimos el cerro San Cristóbal, probamos vinos en Lastarria y cerramos con un café en Providencia. También acompaño a eventos corporativos y cenas de trabajo. Inglés fluido.',
    activities: ['paseo', 'cena', 'evento', 'cafe', 'idiomas'], languages: ['Español', 'Inglés'], rateFrom: 45, chatPriceUsd: 10, whatsapp: '+56 9 0000 0004', stats: { views: 3990, rightSwipes: 505 },
    items: [ph('Cerro San Cristóbal', 'Vista de toda la ciudad', null, 2), vi('Cata en Lastarria', 'Tres cepas, tres historias', 8, '5:20', 4), ph('Noche de gala', 'Evento corporativo en Las Condes', 6, 6), sh('Café de Providencia', 'Mi rincón de las mañanas', null, '0:22', 9), ph('Mercado Central', 'Mariscos y risas', 4, 13)] });
  w('u_marti', { displayName: 'Martina', age: 26, city: 'Madrid', country: 'España', hue: 280, level: 'B', subDays: 15, days: 120,
    headline: 'Tapas, Retiro y planes de domingo', bio: 'Madrileña de adopción. Si tienes una tarde libre, te enseño el Madrid de los vermuts, el Rastro y los atardeceres en el Templo de Debod. Acompaño también a conciertos y obras de teatro.',
    activities: ['cena', 'paseo', 'evento', 'musica'], rateFrom: 40, chatPriceUsd: 8, whatsapp: '+34 600 000 005', stats: { views: 2780, rightSwipes: 361 },
    items: [sh('Vermut de domingo', 'La Latina a mediodía', null, '0:28', 1), ph('Templo de Debod', 'Atardecer de octubre', 5, 3), vi('Concierto en Malasaña', 'Sala pequeña, banda enorme', 7, '2:45', 6), ph('El Retiro', 'Paseo entre castaños', null, 10)] });
  w('u_lu', { displayName: 'Lucía', age: 28, city: 'Ciudad de México', country: 'México', hue: 45, level: 'D', subDays: 5, days: 80,
    headline: 'Museos, mercados y café de Coyoacán', bio: 'Chilanga y curiosa. Vamos al Museo de Antropología, comemos en el mercado de Coyoacán y terminamos con un café de olla. Si estás de paso por la ciudad, te ayudo a moverte sin perderte.',
    activities: ['museo', 'cafe', 'compras', 'paseo'], rateFrom: 25, chatPriceUsd: 5, whatsapp: '+52 55 0000 0006', stats: { views: 1650, rightSwipes: 188 },
    items: [ph('Coyoacán', 'Plaza y café de olla', null, 2), ph('Antropología', 'Sala mexica', 4, 5), sh('Mercado de Jamaica', 'Flores por todos lados', null, '0:19', 8), vi('Xochimilco', 'Trajinera y música', 6, '3:40', 12)] });
  w('u_agus', { displayName: 'Agustina', age: 25, city: 'Rosario', country: 'Argentina', hue: 190, level: 'S', subDays: 10, days: 45,
    headline: 'Río, bici y helado', bio: 'Rosarina. Me gusta andar en bici por la costanera, tomar algo en el Parque España y comer helado mirando el río. Planes simples y buena charla.',
    activities: ['paseo', 'helado', 'deporte'], rateFrom: 20, chatPriceUsd: 5, whatsapp: '+54 9 341 000 0007', stats: { views: 720, rightSwipes: 64 },
    items: [sh('Costanera en bici', 'Mañana de sol', null, '0:33', 2), ph('Parque España', 'Río Paraná de fondo', null, 6), sh('Helado del río', 'Dulce de leche granizado', null, '0:17', 9)] });
  w('u_flor', { displayName: 'Florencia', age: 33, city: 'Barcelona', country: 'España', hue: 160, level: 'S', subDays: 2, days: 400,
    headline: 'Gràcia, playa y arquitectura', bio: 'Argentina en Barcelona desde hace ocho años. Te muestro la ciudad fuera del circuito turístico: Gràcia, el Born, la Barceloneta temprano. Acompaño a ferias, congresos y cenas de negocios. Inglés y catalán.',
    activities: ['paseo', 'museo', 'evento', 'cena', 'idiomas'], languages: ['Español', 'Inglés', 'Catalán'], rateFrom: 50, chatPriceUsd: 12, whatsapp: '+34 600 000 008', stats: { views: 5100, rightSwipes: 690 },
    items: [ph('Plaça del Sol', 'Tarde en Gràcia', null, 1), vi('Ruta modernista', 'Tres edificios que no salen en las guías', 9, '6:10', 3), ph('Barceloneta a las 8', 'Playa vacía', 5, 5), sh('Congreso en Fira', 'Día de evento', null, '0:26', 7), ph('Cena en el Born', 'Tapas y vermut', 5, 10), vi('Montjuïc', 'Subida en teleférico', 7, '2:55', 14)],
    pack: { title: 'Pack Barcelona completo', description: 'Rutas, playa y cenas en 4 piezas', priceUsd: 18, idx: [1, 2, 4, 5], sales: 31 } });
  w('u_cata', { displayName: 'Catalina', age: 27, city: 'Bogotá', country: 'Colombia', hue: 120, level: 'A', subDays: 18, days: 100,
    headline: 'Café colombiano y Monserrate', bio: 'Bogotana amante del café. Subimos a Monserrate, recorremos La Candelaria y probamos café de origen en Chapinero. También acompaño a eventos y ferias.',
    activities: ['cafe', 'paseo', 'museo', 'evento'], rateFrom: 25, chatPriceUsd: 6, whatsapp: '+57 300 000 0009', stats: { views: 1980, rightSwipes: 230 },
    items: [ph('Monserrate', 'La ciudad desde arriba', null, 2), sh('Cata de café', 'Origen Huila', null, '0:35', 4), ph('La Candelaria', 'Murales y color', 4, 7), vi('Museo del Oro', 'Recorrido guiado', 6, '4:30', 11)] });
  w('u_rena', { gender: 'trans', displayName: 'Renata', age: 30, city: 'Lima', country: 'Perú', hue: 25, level: 'C', subDays: 9, days: 70,
    headline: 'Barranco, ceviche y atardeceres', bio: 'Limeña. Te llevo a comer el mejor ceviche de Barranco, a caminar por el malecón de Miraflores y a ver el atardecer desde el Parque del Amor. Planes relajados y buena comida.',
    activities: ['cena', 'paseo', 'cafe'], rateFrom: 25, chatPriceUsd: 5, whatsapp: '+51 900 000 010', stats: { views: 1320, rightSwipes: 150 },
    items: [ph('Malecón de Miraflores', 'Atardecer de verano', null, 1), vi('Ruta del ceviche', 'Tres cevicherías de Barranco', 6, '3:50', 5), ph('Puente de los Suspiros', 'Barranco de noche', 4, 9)] });
  w('u_isa', { gender: 'trans', displayName: 'Isabella', age: 26, city: 'Miami', country: 'Estados Unidos', hue: 205, level: 'S', subDays: 20, days: 180,
    headline: 'Wynwood, brunch y eventos', bio: 'Venezolana en Miami. Acompaño a brunchs en Wynwood, galerías en el Design District y eventos de networking. Inglés nativo, español de casa. Flexible con horarios.',
    activities: ['evento', 'cafe', 'museo', 'compras', 'idiomas'], languages: ['Español', 'Inglés'], rateFrom: 60, chatPriceUsd: 15, whatsapp: '+1 305 000 0011', stats: { views: 3400, rightSwipes: 410 },
    items: [ph('Wynwood Walls', 'Colores de sábado', null, 2), vi('Design District', 'Galerías y café', 8, '2:20', 4), ph('Brunch en Brickell', 'Domingo largo', 5, 6), sh('Networking night', 'Evento de startups', null, '0:21', 8), ph('South Pointe', 'Amanecer en la playa', 5, 12)] });
  w('u_anto', { displayName: 'Antonella', age: 24, city: 'Mendoza', country: 'Argentina', hue: 95, level: 'E', subDays: 4, days: 30,
    headline: 'Bodegas y montaña', bio: 'Mendocina. Me gustan las bodegas de Luján de Cuyo, el Parque San Martín y las tardes de café en la Arístides. Si venís por el vino, te armo la ruta.',
    activities: ['paseo', 'cena', 'cafe'], rateFrom: 25, chatPriceUsd: 5, whatsapp: '+54 9 261 000 0012', stats: { views: 410, rightSwipes: 38 },
    items: [sh('Bodega de domingo', 'Luján de Cuyo', null, '0:29', 3), ph('Cerro de la Gloria', 'Vista de la ciudad', null, 7)] });
  w('u_tomas', { gender: 'hombre', displayName: 'Tomás', fullName: 'Tomás Ibarra', age: 29, city: 'Ciudad de Buenos Aires', country: 'Argentina', hue: 215, level: 'S', subDays: 11, days: 90,
    headline: 'Fútbol, parrilla y rock', bio: 'Porteño. Acompaño a ver partidos, a comer asado en San Telmo y a recitales en el Movistar Arena. Si viajás solo y querés ir a la cancha con alguien que la conoce, hablame.',
    activities: ['evento', 'cena', 'deporte', 'musica'], rateFrom: 30, chatPriceUsd: 6, whatsapp: '+54 9 11 0000 0013', stats: { views: 1540, rightSwipes: 170 },
    items: [ph('Día de partido', 'La Bombonera a pleno', null, 2), sh('Asado de domingo', 'Fuego lento', null, '0:32', 5), vi('Recital en el Arena', 'Noche de rock', 6, '3:05', 8), ph('San Telmo', 'Feria de antigüedades', 4, 11)] });
  w('u_joaco', { gender: 'hombre', displayName: 'Joaquín', fullName: 'Joaquín Vera', age: 32, city: 'Santiago', country: 'Chile', hue: 250, level: 'D', subDays: 6, days: 60,
    headline: 'Trekking, café y librerías', bio: 'Santiaguino. Salidas tranquilas: trekking corto en el Cajón del Maipo, librerías de Lastarria y café de filtro. También acompaño a eventos culturales.',
    activities: ['deporte', 'cafe', 'paseo', 'museo'], rateFrom: 30, chatPriceUsd: 5, whatsapp: '+56 9 0000 0014', stats: { views: 980, rightSwipes: 102 },
    items: [ph('Cajón del Maipo', 'Mañana de trekking', null, 3), sh('Librería de Lastarria', 'Tarde de lluvia', null, '0:18', 6), ph('Café de filtro', 'Barrio Italia', 4, 9)] });
  w('u_emi', { displayName: 'Emilia', age: 28, city: 'São Paulo', country: 'Brasil', hue: 10, level: 'A', subDays: 14, days: 110,
    headline: 'Vila Madalena, arte y café', bio: 'Paulistana. Caminamos por el Beco do Batman, visitamos la Pinacoteca y tomamos café en la Avenida Paulista. Hablo portugués, español e inglés.',
    activities: ['museo', 'cafe', 'paseo', 'idiomas'], languages: ['Portugués', 'Español', 'Inglés'], rateFrom: 35, chatPriceUsd: 7, whatsapp: '+55 11 00000 0015', stats: { views: 2050, rightSwipes: 260 },
    items: [ph('Beco do Batman', 'Grafitis de Vila Madalena', null, 1), vi('Pinacoteca', 'Recorrido por la colección', 6, '4:15', 4), ph('Paulista de domingo', 'Avenida peatonal', null, 7), sh('Café en Pinheiros', 'Especialidad', null, '0:25', 10)] });

  w('u_mica', { displayName: 'Micaela', fullName: 'Micaela Sosa', email: 'mica@sexyrose.demo', age: 26, city: 'Merlo', country: 'Argentina', hue: 315, level: 'C', subDays: 2, days: 2, verified: 'pending',
    headline: 'Plaza, café y paseos por Padua', bio: 'Soy de Merlo, en la zona oeste del conurbano. Me gustan los cafés tranquilos, caminar por la plaza y las ferias de fin de semana.',
    activities: ['cafe', 'paseo', 'compras'], rateFrom: 20, chatPriceUsd: 5, whatsapp: '+54 9 11 0000 0016', stats: { views: 12, rightSwipes: 2 },
    items: [ph('Plaza de Merlo', 'Domingo de feria', null, 1)] });

  // --- Clientes y admin ---
  u('u_cliente', 'Martín Suárez', 'cliente@sexyrose.demo', 'client', { days: 40, hue: 210 });
  u('u_c2', 'Lucas Pereyra', 'lucas@sexyrose.demo', 'client', { days: 70, hue: 150 });
  u('u_c3', 'Nicolás Ferreira', 'nico@sexyrose.demo', 'client', { days: 55, hue: 30 });
  u('u_c4', 'Federico Ortiz', 'fede@sexyrose.demo', 'client', { days: 20, hue: 260 });
  u('u_c5', 'Diego Lamas', 'diego@sexyrose.demo', 'client', { days: 12, hue: 90 });
  u('u_admin', 'Administración', 'admin@sexyrose.demo', 'admin', { days: 400, hue: 340 });

  // --- Stars: hasta 10 por provincia/estado (Argentina 3, España 1, Estados Unidos 1, Chile 1, Uruguay 1) ---
  const stars = [
    { id: 'st_1', workerId: 'u_vale', activeUntil: f(18), createdAt: d(12) },
    { id: 'st_2', workerId: 'u_flor', activeUntil: f(6), createdAt: d(24) },
    { id: 'st_3', workerId: 'u_isa', activeUntil: f(27), createdAt: d(3) },
    { id: 'st_4', workerId: 'u_tomas', activeUntil: f(22), createdAt: d(8) },
    { id: 'st_5', workerId: 'u_agus', activeUntil: f(12), createdAt: d(18) },
    { id: 'st_6', workerId: 'u_sofi', activeUntil: f(25), createdAt: d(5) },
    { id: 'st_7', workerId: 'u_cami', activeUntil: f(9), createdAt: d(21) },
  ];

  // --- Pedidos a medida ---
  const requests = [
    { id: 'rq_1', clientId: 'u_c2', workerId: 'u_vale', kind: 'video', description: 'Un video corto recomendando 3 cafeterías de Palermo para una visita de dos días. Voy en noviembre.', status: 'pendiente', priceUsd: 15, createdAt: d(0.2), updatedAt: d(0.2), deliveredItemId: null, deliveredItemIds: [] },
    { id: 'rq_2', clientId: 'u_cliente', workerId: 'u_vale', kind: 'pack', description: 'Fotos y un video del recorrido por el Malba, con la muestra nueva.', status: 'pendiente', priceUsd: 25, createdAt: d(1), updatedAt: d(1), deliveredItemId: null, deliveredItemIds: [] },
    { id: 'rq_3', clientId: 'u_c3', workerId: 'u_vale', kind: 'video', description: 'Video saludo de cumpleaños para mi hermano, que se llama Pedro y le gusta el helado.', status: 'pendiente', priceUsd: 15, createdAt: d(3), updatedAt: d(3), deliveredItemId: null, deliveredItemIds: [] },
    { id: 'rq_4', clientId: 'u_c4', workerId: 'u_vale', kind: 'video', description: 'Un video de la librería de la avenida con recomendaciones de novelas argentinas.', status: 'entregado', priceUsd: 15, createdAt: d(12), updatedAt: d(9), deliveredItemId: 'c_u_vale_6', deliveredItemIds: ['c_u_vale_6'] },
    { id: 'rq_5', clientId: 'u_c5', workerId: 'u_vale', kind: 'photo', description: 'Fotos en la cancha de River.', status: 'rechazado', priceUsd: 8, refunded: true, createdAt: d(15), updatedAt: d(14), deliveredItemId: null, deliveredItemIds: [], note: 'No hago salidas a la cancha, pero Tomás sí.' },
    { id: 'rq_6', clientId: 'u_c2', workerId: 'u_juli', kind: 'video', description: 'Un short recomendando qué ver en el centro de Córdoba.', status: 'pendiente', priceUsd: 15, createdAt: d(1), updatedAt: d(1), deliveredItemId: null, deliveredItemIds: [] },
    { id: 'rq_7', clientId: 'u_cliente', workerId: 'u_cami', kind: 'pack', description: 'Fotos de la feria de Tristán Narvaja del próximo domingo.', status: 'entregado', priceUsd: 25, createdAt: d(20), updatedAt: d(16), deliveredItemId: 'c_u_cami_3', deliveredItemIds: ['c_u_cami_3', 'c_u_cami_4'] },
  ];

  // --- Mensajes ---
  const messages = [];
  const msg = (from, to, text, daysAgo, read = true) => messages.push({ id: HH.uid('m'), senderId: from, receiverId: to, content: text, createdAt: d(daysAgo), read });
  msg('u_cliente', 'u_vale', 'Hola Vale, viajo a Buenos Aires el 14. ¿Tenés disponible una tarde para recorrer museos?', 1.2);
  msg('u_vale', 'u_cliente', '¡Hola Martín! Sí, el 14 a la tarde estoy libre. Podemos arrancar por el Malba y después un café en Villa Crespo.', 1.1);
  msg('u_cliente', 'u_vale', 'Perfecto. ¿Qué horario te queda cómodo?', 1.0);
  msg('u_vale', 'u_cliente', 'A las 15 en la puerta del museo. Te paso el punto exacto por acá el día anterior.', 0.9);
  msg('u_cliente', 'u_vale', 'Genial, gracias. Te pedí también unas fotos del recorrido.', 0.3, false);
  msg('u_c2', 'u_vale', 'Hola, ¿acompañás a eventos corporativos? Tengo una cena el jueves en Puerto Madero.', 0.15, false);
  msg('u_c3', 'u_vale', '¿Cómo viene el video para Pedro? Es el domingo el cumple.', 0.08, false);
  msg('u_c4', 'u_vale', 'Llegó el video de la librería, gracias. Compré dos de las novelas.', 9);
  msg('u_vale', 'u_c4', '¡Qué bueno! Contame cuál te gustó más cuando la termines.', 8.9);
  msg('u_c2', 'u_juli', 'Hola Juli, vi tu perfil. ¿Hacés salidas al cine entre semana?', 0.5, false);
  msg('u_cliente', 'u_cami', 'Las fotos de la feria quedaron buenísimas.', 15);
  msg('u_cami', 'u_cliente', 'Me alegro. Cuando vuelvas a Montevideo avisame y vamos a la rambla.', 14.8);
  // Mensajes de hoy enviados por Vale (para mostrar uso del día)
  for (let i = 0; i < 4; i++) messages.push({ id: HH.uid('m'), senderId: 'u_vale', receiverId: ['u_c2', 'u_c3', 'u_c4', 'u_c5'][i], content: ['Buen día, te confirmo el horario.', 'Hoy te envío el video.', 'Gracias a vos.', 'Dale, hablamos.'][i], createdAt: new Date(Date.now() - (5 + i) * 60000).toISOString(), read: true });
  for (let i = 0; i < 6; i++) messages.push({ id: HH.uid('m'), senderId: 'u_juli', receiverId: 'u_c2', content: 'Mensaje de hoy ' + (i + 1), createdAt: new Date(Date.now() - (30 + i) * 60000).toISOString(), read: true });

  // --- Pagos y compras ---
  const payments = [];
  const purchases = [];
  const pay = (userId, amount, type, desc, daysAgo, workerId, ref) => payments.push({ id: HH.uid('pay'), userId, amountUsd: amount, currency: 'USD', type, status: 'approved', description: desc, workerId: workerId || null, ref: ref || null, createdAt: d(daysAgo) });
  // Suscripciones históricas de Vale (6 meses)
  [162, 132, 102, 72, 42, 12].forEach(n => pay('u_vale', 40, 'subscription', 'Plan A · Máximo', n, null, 'A'));
  pay('u_vale', 150, 'star', 'Slot Stars · 30 días', 12, null, 'u_vale');
  pay('u_flor', 150, 'star', 'Slot Stars · 30 días', 24, null, 'u_flor');
  pay('u_isa', 150, 'star', 'Slot Stars · 30 días', 3, null, 'u_isa');
  profiles.forEach(p => { const s = subscriptions.find(x => x.userId === p.userId); if (!s || p.userId === 'u_vale') return; const since = (Date.now() - new Date(p.createdAt)) / 864e5; let ago = (Date.now() - new Date(s.startedAt)) / 864e5; while (ago < since) { pay(p.userId, HH.LEVELS[s.level].price_usd, 'subscription', 'Plan ' + s.level + ' · ' + HH.LEVELS[s.level].label, ago, null, s.level); ago += 30; } });
  // Ventas de contenido de Vale distribuidas en 6 meses
  const buyers = ['u_c2', 'u_c3', 'u_c4', 'u_c5', 'u_cliente'];
  const valeItems = content.filter(c => c.workerId === 'u_vale' && c.isPremium);
  let k = 0;
  for (let day = 170; day > 0; day -= 2.7) {
    const it = valeItems[k % valeItems.length]; const buyer = buyers[k % buyers.length]; k++;
    if (k % 5 === 0) { pay(buyer, 15, 'pack', 'Pack Buenos Aires', day, 'u_vale', 'pk_u_vale'); purchases.push({ id: HH.uid('pu'), clientId: buyer, kind: 'pack', refId: 'pk_u_vale', workerId: 'u_vale', amountUsd: 15, createdAt: d(day) }); }
    else { pay(buyer, it.priceUsd, 'one_time', it.title, day, 'u_vale', it.id); purchases.push({ id: HH.uid('pu'), clientId: buyer, kind: 'content', refId: it.id, workerId: 'u_vale', amountUsd: it.priceUsd, createdAt: d(day) }); }
    if (k % 7 === 0) { pay(buyer, 8, 'chat', 'Chat en vivo · 7 días', day, 'u_vale', 'u_vale'); }
  }
  pay('u_c4', 15, 'request', 'Pedido a medida · video librería', 10, 'u_vale', 'rq_4');
  pay('u_c3', 15, 'request', 'Video a medida de Valentina', 3, 'u_vale', 'rq_3');
  pay('u_c2', 15, 'request', 'Video a medida de Valentina', 0.2, 'u_vale', 'rq_1');
  pay('u_cliente', 25, 'request', 'Pack a medida de Valentina', 1, 'u_vale', 'rq_2');
  pay('u_c2', 15, 'request', 'Video a medida de Julieta', 1, 'u_juli', 'rq_6');
  pay('u_cliente', 25, 'request', 'Pack a medida de Camila', 18, 'u_cami', 'rq_7');
  // Compras del cliente demo
  pay('u_cliente', 8, 'chat', 'Chat con Valentina · 10 minutos', 1.5, 'u_vale', 'u_vale');
  purchases.push({ id: HH.uid('pu'), clientId: 'u_cliente', kind: 'chat', refId: 'u_vale', workerId: 'u_vale', amountUsd: 8, minutes: 10, status: 'finalizada', requestedAt: d(1.5), acceptedAt: d(1.5), endsAt: d(1.49), expiresAt: d(1.49), createdAt: d(1.5) });
  pay('u_cliente', 6, 'one_time', 'Paseo por la costanera', 2, 'u_vale', 'c_u_vale_2');
  purchases.push({ id: HH.uid('pu'), clientId: 'u_cliente', kind: 'content', refId: 'c_u_vale_2', workerId: 'u_vale', amountUsd: 6, createdAt: d(2) });
  pay('u_cliente', 10, 'pack', 'Pack Montevideo', 16, 'u_cami', 'pk_u_cami');
  purchases.push({ id: HH.uid('pu'), clientId: 'u_cliente', kind: 'pack', refId: 'pk_u_cami', workerId: 'u_cami', amountUsd: 10, createdAt: d(16) });
  purchases.push({ id: HH.uid('pu'), clientId: 'u_cliente', kind: 'request', refId: 'rq_7', workerId: 'u_cami', amountUsd: 25, createdAt: d(18) });
  purchases.push({ id: HH.uid('pu'), clientId: 'u_cliente', kind: 'request', refId: 'rq_2', workerId: 'u_vale', amountUsd: 25, createdAt: d(1) });
  ['c_u_cami_3', 'c_u_cami_4'].forEach(id => purchases.push({ id: HH.uid('pu'), clientId: 'u_cliente', kind: 'content', refId: id, workerId: 'u_cami', amountUsd: 0, createdAt: d(16) }));
  // Vencimientos: piezas con acceso por 7 días (una vigente, una vencida)
  const inPacks = new Set(packs.flatMap(k => k.itemIds)); const bought = new Set(purchases.filter(x => x.clientId === 'u_cliente').map(x => x.refId));
  const cand = content.filter(c => c.isPremium && !inPacks.has(c.id) && !bought.has(c.id));
  const valeItem = (k) => cand[k];
  const v1 = valeItem(0), v2 = valeItem(1);
  if (v1 && v2) {
    v1.accessDays = 7; v2.accessDays = 7;
    purchases.push({ id: HH.uid('pu'), clientId: 'u_cliente', kind: 'content', refId: v1.id, workerId: v1.workerId, amountUsd: v1.priceUsd, accessDays: 7, expiresAt: f(1.5), createdAt: d(5.5) });
    purchases.push({ id: HH.uid('pu'), clientId: 'u_cliente', kind: 'content', refId: v2.id, workerId: v2.workerId, amountUsd: v2.priceUsd, accessDays: 7, expiresAt: d(3), createdAt: d(10) });
  }
  purchases.push({ id: HH.uid('pu'), clientId: 'u_c3', kind: 'request', refId: 'rq_3', workerId: 'u_vale', amountUsd: 15, createdAt: d(3) });
  purchases.push({ id: HH.uid('pu'), clientId: 'u_c4', kind: 'request', refId: 'rq_4', workerId: 'u_vale', amountUsd: 15, createdAt: d(10) });

  // --- Viajes demo: Sofía (Santiago) está de visita en Buenos Aires; Martina (Madrid) llega a Barcelona en 4 días ---
  const ymd = (n) => HH.localDay(new Date(Date.now() + n * 864e5));
  profiles.find(x => x.userId === 'u_sofi').trips = [{ id: 'tr_1', city: 'Ciudad de Buenos Aires', country: 'Argentina', from: ymd(-2), to: ymd(5), createdAt: d(10) }];
  profiles.find(x => x.userId === 'u_marti').trips = [{ id: 'tr_2', city: 'Barcelona', country: 'España', from: ymd(4), to: ymd(9), createdAt: d(3) }];
  profiles.find(x => x.userId === 'u_vale').trips = [{ id: 'tr_3', city: 'Montevideo', country: 'Uruguay', from: ymd(20), to: ymd(24), createdAt: d(1) }];

  // --- Historias (24 h) ---
  const stories = [];
  const story = (w, caption, hoursAgo, hue) => stories.push({ id: HH.uid('st'), workerId: w, src: null, caption, hue, views: 20 + Math.floor(Math.random() * 300), createdAt: new Date(Date.now() - hoursAgo * 3600e3).toISOString(), expiresAt: new Date(Date.now() + (24 - hoursAgo) * 3600e3).toISOString() });
  story('u_vale', 'Mañana de café en Villa Crespo. ¿Alguien se suma a la tarde de museo?', 2, 335); story('u_vale', 'Atardecer en la costanera', 1, 20);
  story('u_flor', 'Barceloneta a las 8, playa vacía', 5, 160); story('u_flor', 'Vermut en el Born', 3, 200);
  story('u_isa', 'Networking night en Wynwood', 4, 205);
  story('u_cami', 'Feria de Tristán Narvaja, domingo de sol', 6, 300);
  story('u_sofi', 'Subida al cerro San Cristóbal', 8, 20); story('u_sofi', 'Cata en Lastarria', 7, 50);
  story('u_marti', 'Templo de Debod, atardecer', 10, 280);
  story('u_tomas', 'Día de partido en la Bombonera', 3, 215);
  story('u_lu', 'Café de olla en Coyoacán', 12, 45);
  story('u_emi', 'Beco do Batman, grafitis nuevos', 9, 10);
  story('u_cata', 'Café de origen en Chapinero', 14, 120);

  // --- Swipes históricos (para stats) ---
  const swipes = [];
  [['u_c2', 0.05], ['u_c3', 0.4], ['u_c4', 1.3], ['u_c5', 3]].forEach(([c, t]) => swipes.push({ clientId: c, workerId: 'u_vale', dir: 'right', at: d(t) }));

  // --- Reportes / moderación (admin) ---
  const reports = [
    { id: 'rp_1', targetId: 'u_c5', byId: 'u_vale', reason: 'Insistió por WhatsApp después de que le dije que no.', status: 'abierto', createdAt: d(1) },
  ];

  const activities = HH.DEFAULT_ACTIVITIES.map(a => ({ ...a }));
  const locations = HH.seedLocations();
  // Ubicación pedida por una acompañante nueva, pendiente de aprobación del admin
  locations.push({ id: 'loc_merlo', name: 'Merlo', level: 'city', parentId: 'loc_' + HH.slugify('Zona Oeste (GBA)'), lat: -34.6653, lng: -58.7276, status: 'pending', source: 'referencia', createdBy: 'u_mica', createdAt: d(2) });
  const settings = JSON.parse(JSON.stringify(HH.DEFAULT_SETTINGS));

  // --- Links (página tipo "link en bio"). URLs de ejemplo.
  { const p = profiles.find(x => x.userId === 'u_vale'); if (p) p.links = [{ label: 'Instagram', url: 'https://example.com/instagram-valentina' }, { label: 'TikTok', url: 'https://example.com/tiktok-valentina' }, { label: 'Mi blog de salidas por Buenos Aires', url: 'https://example.com/blog-valentina' }]; }
  { const p = profiles.find(x => x.userId === 'u_vale'); if (p) p.requestAccessDays = 30; }

  // --- Telegram (demo)
  [['u_vale', '@sexyrose_demo_vale'], ['u_cami', '@sexyrose_demo_cami'], ['u_tomas', '+54 9 11 0000 0013']].forEach(([id, t]) => { const p = profiles.find(x => x.userId === id); if (p) p.telegram = t; });

  // --- Chat en vivo: disponibles ahora (demo)
  ['u_vale', 'u_cami', 'u_sofi', 'u_marti', 'u_isa', 'u_tomas', 'u_juli'].forEach(id => { const p = profiles.find(x => x.userId === id); if (p) p.chatOnline = true; });

  // --- Reservas: agenda con link de pago propio (SexyRose no cobra la seña) ---
  const wk = (from, to, days) => { const a = {}; days.forEach(k => { a[k] = [{ from, to }]; }); return a; };
  const setBk = (id, cfg) => { const p = profiles.find(x => x.userId === id); if (p) p.booking = Object.assign({ enabled: true, minNoticeHours: 12 }, cfg); };
  setBk('u_vale', { payLink: 'https://link.mercadopago.com.ar/valentina-demo', availability: Object.assign(wk('15:00', '21:00', [1, 2, 3, 4, 5]), wk('11:00', '19:00', [6])) });
  setBk('u_cami', { payLink: 'https://pay.example.com/camila-demo', availability: wk('10:00', '18:00', [1, 3, 5, 6]) });
  setBk('u_sofi', { payLink: 'https://pay.example.com/sofia-demo', availability: wk('12:00', '20:00', [2, 4, 6, 0]), minNoticeHours: 24 });
  const day = (n) => HH.localDay(n >= 0 ? f(n) : d(-n));
  // Ficha de cada perfil (datos neutros)
  const ZONES = { 'Ciudad de Buenos Aires': ['Palermo', 'Recoleta', 'Belgrano', 'Villa Crespo', 'San Telmo'], 'Córdoba': ['Nueva Córdoba', 'Güemes'], 'Rosario': ['Centro', 'Pichincha'], 'Montevideo': ['Pocitos', 'Ciudad Vieja'], 'Santiago': ['Providencia', 'Lastarria'], 'Madrid': ['Malasaña', 'Chamberí'], 'Barcelona': ['Gràcia', 'Eixample'], 'Ciudad de México': ['Roma Norte', 'Condesa'], 'Bogotá': ['Chapinero', 'Usaquén'], 'Lima': ['Miraflores', 'Barranco'], 'São Paulo': ['Pinheiros', 'Vila Madalena'], 'Miami': ['Brickell', 'Wynwood'], 'Mendoza': ['Quinta Sección'] };
  const INT = ['Arte', 'Música', 'Cine', 'Teatro', 'Lectura', 'Historia', 'Gastronomía', 'Vinos', 'Viajes', 'Naturaleza', 'Deporte', 'Fotografía', 'Moda', 'Tecnología', 'Idiomas', 'Negocios'];
  const NAT = { 'Argentina': 'Argentina', 'Uruguay': 'Uruguaya', 'Chile': 'Chilena', 'España': 'Española', 'México': 'Mexicana', 'Colombia': 'Colombiana', 'Perú': 'Peruana', 'Brasil': 'Brasileña', 'Estados Unidos': 'Estadounidense' };
  profiles.forEach((p, k) => {
    const z = ZONES[p.city] || []; if (p.nationality === undefined) p.nationality = NAT[p.country] || '';
    if (p.zone === undefined) p.zone = z.length ? z[k % z.length] : '';
    if (p.heightCm === undefined) p.heightCm = (p.gender === 'hombre' ? 172 : 160) + (k * 7) % 14;
    if (p.build === undefined) p.build = ['delgada', 'atletica', 'mediana', 'delgada'][k % 4];
    if (p.interests === undefined) p.interests = [0, 1, 2, 3].map(i => INT[(k * 3 + i * 5) % INT.length]).filter((v, i, a) => a.indexOf(v) === i);
    if (p.updatedAt === undefined) p.updatedAt = d(Math.max(0.5, (k % 9) + 0.5));
  });
  // Bloqueos de ejemplo en la agenda de Valentina
  (profiles.find(x => x.userId === 'u_vale') || {}).booking.blocks = [
    { id: 'blk_1', date: day(2), from: '15:00', to: '17:00', kind: 'ocupado', note: 'Salida coordinada por fuera', allDay: false, createdAt: d(1) },
    { id: 'blk_2', date: day(5), from: '00:00', to: '24:00', kind: 'bloqueado', note: 'Día libre', allDay: true, createdAt: d(1) },
  ];
  const bk = (id, clientId, workerId, activity, place, n, start, hours, status, extra) => ({ id, clientId, workerId, activity, place, note: '', date: day(n), start, hours, depositUsd: Math.round(35 * hours * 0.3), depositPct: 30, payLink: 'https://link.mercadopago.com.ar/valentina-demo', status, createdAt: d(1), updatedAt: d(0.5), ...(extra || {}) });
  const bookings = [
    bk('bk_1', 'u_cliente', 'u_vale', 'museo', 'Entrada del Malba, Av. Figueroa Alcorta', 4, '16:00', 2, 'solicitada', { note: 'Me interesa la muestra nueva y después un café.' }),
    bk('bk_2', 'u_c2', 'u_vale', 'cafe', 'Café de la esquina de Gurruchaga y Honduras', 6, '17:30', 1, 'confirmada'),
    bk('bk_3', 'u_c4', 'u_vale', 'paseo', 'Plaza Serrano', -9, '15:00', 2, 'realizada'),
  ];
  const likes = [];
  content.filter(c => c.workerId === 'u_vale' && c.type === 'short').forEach((c, i) => [['u_cliente', 0.02 + i * 0.3], ['u_c3', 0.6 + i], ['u_c4', 2 + i]].forEach(([u, t]) => likes.push({ id: HH.uid('lk'), contentId: c.id, workerId: 'u_vale', userId: u, createdAt: d(t) })));
  return { likes, version: HH.SEED_VERSION, locations, activities, settings, stories, users, profiles, subscriptions, stars, content, packs, requests, messages, payments, purchases, swipes, reports, bookings };
};
