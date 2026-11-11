// Admin → ficha de la acompañante: sus videos (portada, duración, estado) y el clip de 5 s de la tarjeta.
// Solo lectura. Se monta dentro del router admin, bajo `${A}/api` (mismo Basic Auth):
//   GET /acompanantes/:id/videos → { videos: [...], preview: {...} | null }
import express from 'express';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createAdminVideosRouter({ pool }) {
  const r = express.Router();
  r.get('/acompanantes/:id/videos', (req, res, next) => {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'No encontrado.' });
    const id = req.params.id;
    Promise.all([
      pool.query('SELECT id, orden, estado, url, url_poster, segundos, ancho, alto, bytes, error, creado FROM videos WHERE cuenta_id = $1 ORDER BY orden, creado', [id]),
      pool.query('SELECT video_id, inicio, elegido, estado, url, error, actualizado FROM previews WHERE cuenta_id = $1', [id]),
    ]).then(([v, p]) => {
      const x = p.rows[0];
      res.set('Cache-Control', 'no-store');
      res.json({
        videos: v.rows.map((f) => ({ id: f.id, orden: f.orden, estado: f.estado, url: f.url, urlPoster: f.url_poster, segundos: f.segundos == null ? null : Number(f.segundos), ancho: f.ancho, alto: f.alto, bytes: f.bytes == null ? null : Number(f.bytes), error: f.error, creado: f.creado })),
        preview: x ? { videoId: x.video_id, inicio: Number(x.inicio), elegido: x.elegido, estado: x.estado, url: x.url, error: x.error, actualizado: x.actualizado } : null,
      });
    }).catch(next);
  });
  return r;
}
