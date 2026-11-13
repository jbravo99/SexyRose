/* Radar de "Cerca de mí" (13/11/2026): anillos con escala real y burbujas ubicadas por distancia y dirección.
   Funciones puras (sin DOM): las usa views-public.js para ubicar las burbujas y los tests de la app (vm).
   Las coordenadas de las acompañantes son aproximadas a propósito (HH.profileCoords: centro del barrio o la ciudad
   corrido 1 a 4 km); el radar solo las convierte en distancia y dirección desde el visitante. */
(function (root) {
  const HH = (root.HH = root.HH || {});

  // Anillos para cada rango (km). El último siempre es el rango elegido.
  const ANILLOS = { 5: [1, 2, 5], 10: [2, 5, 10], 15: [2, 5, 10, 15], 25: [5, 10, 25], 50: [10, 25, 50], 100: [25, 50, 100] };
  function anillos(km) {
    const k = Number(km) || 15;
    if (ANILLOS[k]) return ANILLOS[k].slice();
    const out = [k / 4, k / 2, k].map((x) => Math.round(x * 10) / 10);
    return out.filter((x, i) => x > 0 && out.indexOf(x) === i);
  }

  // Distancia (km) → radio (px). Escala de raíz cuadrada: lo cercano se separa más que lo lejano.
  const radio = (d, km, R) => {
    const k = Math.max(0.1, Number(km) || 15);
    const x = Math.max(0, Math.min(1, (Number(d) || 0) / k));
    return Math.sqrt(x) * R;
  };

  // Dirección (radianes, 0 = este, sentido antihorario como en el plano) de a → b, ambos [lat, lng].
  function rumbo(a, b) {
    if (!a || !b) return 0;
    const dy = b[0] - a[0];
    const dx = (b[1] - a[1]) * Math.cos(((a[0] + b[0]) / 2) * Math.PI / 180);
    if (!dx && !dy) return 0;
    return Math.atan2(dy, dx);
  }

  /* Ubica las burbujas.
     items: [{ d (km), a (rumbo en radianes), s (diámetro de la foto, px), lw (ancho del rótulo), lh (alto del rótulo) }]
     o: { w, h (tamaño del radar), km, centro (diámetro libre en el medio para "Vos"), margen, iter }
     Devuelve [{ x, y }] = centro de la foto de cada burbuja, en px desde la esquina superior izquierda.
     Cada burbuja arranca en su lugar real (distancia y rumbo) y después se separa de las que la pisan, sin salirse
     del radar ni tapar el centro; un resorte suave la tira de vuelta hacia su lugar real. */
  function ubicar(items, o) {
    const w = Math.max(1, o.w), h = Math.max(1, o.h);
    const cx = w / 2, cy = h / 2;
    const margen = o.margen == null ? 6 : o.margen;
    const maxS = items.reduce((m, it) => Math.max(m, it.s || 0), 0);
    const R = Math.max(10, Math.min(w, h) / 2 - maxS / 2 - margen);
    const centro = (o.centro || 0) / 2;
    const caja = (it) => {
      const s = it.s || 50, lw = Math.max(s, it.lw || 0), lh = it.lh || 0;
      return { hw: lw / 2, top: s / 2, bot: s / 2 + lh };
    };
    const pos = items.map((it, i) => {
      // Rumbo exacto repetido (misma zona): se abre un poco el ángulo para que no arranquen encimadas
      const a = (Number(it.a) || 0) + (i % 7) * 0.0001;
      const r = Math.max(centro + (it.s || 50) / 2 + 4, radio(it.d, o.km, R));
      return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a), tx: 0, ty: 0 };
    });
    pos.forEach((p) => { p.tx = p.x; p.ty = p.y; });
    const cajas = items.map(caja);
    const iter = o.iter || 400;
    const lim = (p, c) => {
      p.x = Math.max(c.hw + margen, Math.min(w - c.hw - margen, p.x));
      p.y = Math.max(c.top + margen, Math.min(h - c.bot - margen, p.y));
    };
    for (let k = 0; k < iter; k++) {
      let mov = 0;
      for (let i = 0; i < pos.length; i++) {
        for (let j = i + 1; j < pos.length; j++) {
          const a = pos[i], b = pos[j], ca = cajas[i], cb = cajas[j];
          // Superposición de las cajas (foto + rótulo)
          const ox = (ca.hw + cb.hw + 4) - Math.abs(a.x - b.x);
          const ay1 = a.y - ca.top, ay2 = a.y + ca.bot, by1 = b.y - cb.top, by2 = b.y + cb.bot;
          const oy = Math.min(ay2, by2) - Math.max(ay1, by1) + 4;
          if (ox > 0 && oy > 0) {
            // Se separan en la dirección que las une (así pueden escapar en diagonal si una está contra un borde)
            let dx = b.x - a.x, dy = (b.y + (cb.bot - cb.top) / 2) - (a.y + (ca.bot - ca.top) / 2);
            let dd = Math.hypot(dx, dy);
            if (dd < 0.01) { const t = (i * 7 + j * 13) % 360 * Math.PI / 180; dx = Math.cos(t); dy = Math.sin(t); dd = 1; }
            const m = Math.min(ox, oy) / 2 + 0.5;
            a.x -= dx / dd * m; a.y -= dy / dd * m;
            b.x += dx / dd * m; b.y += dy / dd * m;
            mov++;
          }
        }
      }
      for (let i = 0; i < pos.length; i++) {
        const p = pos[i], c = cajas[i];
        // Lejos del centro ("Vos")
        const dx = p.x - cx, dy = p.y - cy, dist = Math.hypot(dx, dy) || 0.001;
        const minD = centro + (items[i].s || 50) / 2 + 4;
        if (dist < minD) { p.x = cx + dx / dist * minD; p.y = cy + dy / dist * minD; mov++; }
        // Resorte hacia el lugar real (más fuerte al principio; en la segunda mitad solo se separan)
        const kf = k < iter / 2 ? 0.05 * (1 - (2 * k) / iter) : 0;
        p.x += (p.tx - p.x) * kf; p.y += (p.ty - p.y) * kf;
        lim(p, c);
      }
      if (!mov && k > iter / 2) break;
    }
    const out = pos.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
    out.R = R; // radio útil del radar (para dibujar los anillos con la misma escala)
    return out;
  }

  // ¿Se pisan dos cajas? (lo usan los tests)
  function seSuperponen(items, pos) {
    const out = [];
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const a = items[i], b = items[j];
        const ahw = Math.max(a.s, a.lw || 0) / 2, bhw = Math.max(b.s, b.lw || 0) / 2;
        const ox = ahw + bhw - Math.abs(pos[i].x - pos[j].x);
        const oy = Math.min(pos[i].y + a.s / 2 + (a.lh || 0), pos[j].y + b.s / 2 + (b.lh || 0)) - Math.max(pos[i].y - a.s / 2, pos[j].y - b.s / 2);
        if (ox > 0.5 && oy > 0.5) out.push([i, j]);
      }
    }
    return out;
  }

  HH.radar = { anillos, radio, rumbo, ubicar, seSuperponen };
})(typeof window !== 'undefined' ? window : globalThis);
