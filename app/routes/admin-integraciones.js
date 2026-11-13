// Admin → Ajustes → integraciones. Se monta bajo `${A}/api` (Basic Auth del admin; lo que modifica, con apiPost).
//   GET    /integraciones/telegram                → estado del bot, chat vinculado, código pendiente y avisos
//   POST   /integraciones/telegram/vincular       → genera el código de un solo uso y el link t.me/<bot>?start=<código>
//   POST   /integraciones/telegram/cancelar       → descarta el código pendiente
//   POST   /integraciones/telegram/desvincular    → quita el chat vinculado (queda TELEGRAM_CHAT_ID del servidor si existe)
//   POST   /integraciones/telegram/probar         → manda un mensaje de prueba
//   PUT    /integraciones/telegram/avisos         {avisos: {tipo: bool}} → qué avisos llegan
//   GET    /integraciones/mp                      → cuentas de comisión (del admin y del servidor), sin secretos
//   POST   /integraciones/mp                      {nombre, clientId, clientSecret, webhookSecret} → agrega una cuenta
//   PUT    /integraciones/mp/:id                  {nombre, clientSecret?, webhookSecret?} (vacío = conservar)
//   DELETE /integraciones/mp/:id
//   POST   /integraciones/mp/:id/probar           → pide un token a Mercado Pago con esas credenciales
//   GET    /integraciones/whatsapp/ejemplo        → el mensaje de ejemplo del pedido de créditos (para "Probar")
import express from 'express';
import { TelegramError } from '../lib/telegram.js';
import { MpCuentasError } from '../lib/mp-cuentas.js';

export function createAdminIntegracionesRouter({ telegram, mpCuentas, creditos, apiPost, log = () => {} }) {
  const r = express.Router();
  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const body = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});
  r.use('/integraciones', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  r.get('/integraciones/telegram', ah(async (req, res) => res.json(await telegram.estado())));
  r.post('/integraciones/telegram/vincular', apiPost, ah(async (req, res) => res.json(await telegram.vincular())));
  r.post('/integraciones/telegram/cancelar', apiPost, ah(async (req, res) => res.json(await telegram.cancelar())));
  r.post('/integraciones/telegram/desvincular', apiPost, ah(async (req, res) => res.json(await telegram.desvincular())));
  r.post('/integraciones/telegram/probar', apiPost, ah(async (req, res) => res.json(await telegram.probar())));
  r.put('/integraciones/telegram/avisos', apiPost, ah(async (req, res) => res.json(await telegram.guardarAvisos(body(req).avisos))));

  const mpId = (req) => String(req.params.id || '').slice(0, 64);
  r.get('/integraciones/mp', ah(async (req, res) => res.json(mpCuentas.listar())));
  r.post('/integraciones/mp', apiPost, ah(async (req, res) => res.status(201).json(await mpCuentas.crear(body(req)))));
  r.put('/integraciones/mp/:id', apiPost, ah(async (req, res) => res.json(await mpCuentas.editar(mpId(req), body(req)))));
  r.delete('/integraciones/mp/:id', apiPost, ah(async (req, res) => res.json(await mpCuentas.borrar(mpId(req)))));
  r.post('/integraciones/mp/:id/probar', apiPost, ah(async (req, res) => res.json(await mpCuentas.probar(mpId(req)))));

  r.get('/integraciones/whatsapp/ejemplo', ah(async (req, res) => res.json(await creditos.mensajeEjemplo())));

  // eslint-disable-next-line no-unused-vars
  r.use('/integraciones', (err, req, res, next) => {
    if (err instanceof TelegramError || err instanceof MpCuentasError) return res.status(err.status).json({ error: err.message });
    log('error: integraciones (admin):', err.code || '', err.message);
    res.status(500).json({ error: 'Ocurrió un error. Probá de nuevo en unos minutos.' });
  });
  return r;
}
