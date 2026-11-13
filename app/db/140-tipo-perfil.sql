-- Tipo de perfil (13/11/2026): 'acompanante' | 'virtual' | 'ambas', guardado en perfiles.datos.tipo.
-- Lo elige la acompañante al registrarse y lo cambia desde su panel. Los perfiles que ya existen quedan como 'acompanante'.
UPDATE perfiles SET datos = datos || '{"tipo": "acompanante"}'::jsonb
WHERE NOT (datos ? 'tipo') OR datos->>'tipo' NOT IN ('acompanante', 'virtual', 'ambas');
