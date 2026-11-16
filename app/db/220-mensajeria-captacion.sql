-- Mensajería y captación (16/11/2026, decisión de Juan). Ver FASE1-CONTRATO.md → "Mensajería".
-- Admin → Mensajería junta lo que estaba en Admin → Asistente y en Ajustes (contacto, Telegram, mensajes) y suma la
-- captación: contactos de acompañantes que publican en otros sitios, importados de la planilla de Juan, a los que él
-- les manda la invitación desde WhatsApp Web (con el chip del asistente). Ningún ajuste se pierde: 'contacto',
-- 'mensajes' y 'asistente' siguen en la tabla ajustes con la misma forma.
-- Idempotente: se vuelve a aplicar en cada arranque.

-- Teléfono para comparar (igual que telefonoComparable en lib/asistente-comun.js): solo dígitos y, en Argentina, sin
-- el 9 de los celulares (549… → 54…).
CREATE OR REPLACE FUNCTION captacion_comparable(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN d LIKE '549%' THEN '54' || substr(d, 4) ELSE d END
    FROM (SELECT regexp_replace(COALESCE(t, ''), '\D', '', 'g') AS d) s
$$;

-- Un contacto por teléfono (E.164, +549… para Argentina).
--   pendiente   → en la cola del día            abierto     → Juan tocó "Abrir chat" (todavía no se vio el envío)
--   enviado     → el agente vio la invitación   respondio   → contestó (la atiende el asistente)
--   se_registro → un perfil del sitio usa ese teléfono (automático)
--   no_escribir → pidió que no le escriban (nunca más vuelve a la cola)
--   revisar     → palabras de alguien muy joven, número extranjero o inválido: nunca entra en la cola hasta que Juan
--                 lo revise ("Revisado: es mayor de edad" → pendiente, o "Descartar")
--   descartado  → Juan lo descartó               en_sitio    → al importar, ya era el WhatsApp de un perfil
CREATE TABLE IF NOT EXISTS captacion_contactos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefono      text NOT NULL UNIQUE,
  comparable    text NOT NULL,
  nombres       text[] NOT NULL DEFAULT '{}',
  ciudades      text[] NOT NULL DEFAULT '{}',
  categorias    text[] NOT NULL DEFAULT '{}',
  sitios        text[] NOT NULL DEFAULT '{}',
  urls          text[] NOT NULL DEFAULT '{}',
  avisos        int NOT NULL DEFAULT 1,
  fecha_aviso   text,
  nota          text,
  estado        text NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente', 'abierto', 'enviado', 'respondio', 'se_registro', 'no_escribir', 'revisar', 'descartado', 'en_sitio')),
  motivo        text,                                    -- por qué está en "revisar" (se muestra a Juan)
  tipo_motivo   text CHECK (tipo_motivo IN ('joven', 'telefono', 'planilla')),
  revisado      timestamptz,                             -- Juan confirmó "es mayor de edad"
  cuenta_id     uuid REFERENCES cuentas(id) ON DELETE SET NULL,
  abierto       timestamptz,
  enviado       timestamptz,
  respondio     timestamptz,
  registrado    timestamptz,
  no_escribir   timestamptz,
  creado        timestamptz NOT NULL DEFAULT now(),
  actualizado   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS captacion_comparable_idx ON captacion_contactos (comparable);
CREATE INDEX IF NOT EXISTS captacion_cola_idx ON captacion_contactos (estado, avisos DESC);
CREATE INDEX IF NOT EXISTS captacion_enviado_idx ON captacion_contactos (enviado) WHERE enviado IS NOT NULL;

-- Chat del asistente que nació de una invitación de captación (el asistente responde con ese contexto).
ALTER TABLE asistente_conversaciones ADD COLUMN IF NOT EXISTS captacion_id uuid REFERENCES captacion_contactos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS asistente_conv_captacion_idx ON asistente_conversaciones (captacion_id) WHERE captacion_id IS NOT NULL;

-- La invitación que Juan manda desde WhatsApp Web queda en el chat con origen 'captacion' (no silencia al bot).
ALTER TABLE asistente_mensajes DROP CONSTRAINT IF EXISTS asistente_mensajes_origen_check;
ALTER TABLE asistente_mensajes ADD CONSTRAINT asistente_mensajes_origen_check CHECK (origen IN ('bot', 'juan', 'usuario', 'captacion'));

-- "Se registró": cuando un perfil del sitio guarda un WhatsApp que está en la lista de captación (al registrarse o al
-- completar el perfil), el contacto pasa a 'se_registro' solo.
CREATE OR REPLACE FUNCTION captacion_registro() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(NEW.datos->>'whatsapp', '') = '' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (OLD.datos->>'whatsapp') IS NOT DISTINCT FROM (NEW.datos->>'whatsapp') THEN RETURN NEW; END IF;
  UPDATE captacion_contactos SET estado = 'se_registro', cuenta_id = NEW.cuenta_id, registrado = now(), actualizado = now()
   WHERE comparable = captacion_comparable(NEW.datos->>'whatsapp') AND estado NOT IN ('se_registro', 'en_sitio');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS captacion_registro_tg ON perfiles;
CREATE TRIGGER captacion_registro_tg AFTER INSERT OR UPDATE OF datos ON perfiles FOR EACH ROW EXECUTE FUNCTION captacion_registro();

-- Ajuste 'captacion' = { mensaje, porDia } (Admin → Mensajería → Mensajes y Captación). Sin fila = el mensaje aprobado
-- por Juan y 30 por día (lib/captacion.js tiene los valores por defecto).
