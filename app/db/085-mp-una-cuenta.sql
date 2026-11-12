-- Una sola cuenta de Mercado Pago por acompañante (decisión de Juan, 12/11/2026): la misma cuenta de Mercado Pago
-- (mp_user_id) no puede quedar conectada a dos acompañantes en la misma aplicación. El código además lo controla entre
-- aplicaciones (lib/contenido.js, completarOAuth).
CREATE UNIQUE INDEX IF NOT EXISTS mp_conexiones_app_usuario_uq ON mp_conexiones (app_id, mp_user_id) WHERE mp_user_id IS NOT NULL;
