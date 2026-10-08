-- 074: Fundadores Ronda 2 (2026-10-08) -- lista de espera, Instagram como contacto y preguntas de compromiso.
--   tipo        "¿Vendes en MercadoLibre o haces marketing?" (marketing sin cuenta = descartado)
--   activacion  cuándo iniciaría la activación si queda (desde el 13; plazo hasta el domingo 18)
--   instagram   contacto alternativo a Telegram (al menos uno de los dos)
--   acepta_plazo marcó "inicio mi activación antes del domingo 18"
--   estado 'espera' = lista de espera (se confirma el lunes 19 con los cupos que queden libres)
-- Idempotente. Primero staging (inventory_db_staging / inventory_multi), después producción.

ALTER TABLE fundadores_solicitudes ADD COLUMN IF NOT EXISTS tipo         text;
ALTER TABLE fundadores_solicitudes ADD COLUMN IF NOT EXISTS activacion   text;
ALTER TABLE fundadores_solicitudes ADD COLUMN IF NOT EXISTS instagram    text;
ALTER TABLE fundadores_solicitudes ADD COLUMN IF NOT EXISTS acepta_plazo boolean;
-- dolor_otro: "¿Qué te quita más tiempo hoy?" escrito por él (opcional). Quien marca "hago marketing" salta
-- directo al contacto: sus respuestas de venta quedan vacías ('').
ALTER TABLE fundadores_solicitudes ADD COLUMN IF NOT EXISTS dolor_otro   text;
ALTER TABLE fundadores_solicitudes ALTER COLUMN telegram DROP NOT NULL;

ALTER TABLE fundadores_solicitudes DROP CONSTRAINT IF EXISTS fundadores_estado_check;
ALTER TABLE fundadores_solicitudes ADD CONSTRAINT fundadores_estado_check
  CHECK (estado = ANY (ARRAY['descartado', 'calificado', 'aprobado', 'rechazado', 'espera']));

ALTER TABLE fundadores_solicitudes DROP CONSTRAINT IF EXISTS fundadores_contacto_check;
ALTER TABLE fundadores_solicitudes ADD CONSTRAINT fundadores_contacto_check
  CHECK (telegram IS NOT NULL OR instagram IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fundadores_instagram ON fundadores_solicitudes (ronda, instagram) WHERE instagram IS NOT NULL;
