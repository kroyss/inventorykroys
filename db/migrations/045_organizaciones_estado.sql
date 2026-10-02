-- 045 · Estado de la cuenta de cada organización (cliente) + marca de Fundador.
--
--   estado:  propietario → la organización dueña de la plataforma (SolucionesMC): todo, nunca vence
--            prueba      → gratis hasta prueba_hasta (Fundadores 30 días; después 15)
--            activo      → paga
--            vencido     → no entra (sus datos se conservan)
--   Una prueba con prueba_hasta ya pasada (hora Caracas) cuenta como vencida sin que nadie la
--   cambie: no hace falta un cron.
--   fundador: marca PERMANENTE de los 10 del Programa Fundadores (precio especial al pagar).
--
-- Tabla GLOBAL (sin RLS). Idempotente.
BEGIN;

ALTER TABLE organizaciones
  ADD COLUMN IF NOT EXISTS estado       TEXT    NOT NULL DEFAULT 'prueba',
  ADD COLUMN IF NOT EXISTS prueba_hasta DATE,
  ADD COLUMN IF NOT EXISTS fundador     BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizaciones_estado_check') THEN
    ALTER TABLE organizaciones ADD CONSTRAINT organizaciones_estado_check
      CHECK (estado IN ('propietario', 'prueba', 'activo', 'vencido'));
  END IF;
END $$;

-- La organización dueña de la plataforma (PLATAFORMA_ORGANIZACION_ID, por defecto 1).
UPDATE organizaciones SET estado = 'propietario' WHERE id = 1 AND estado <> 'propietario';

GRANT SELECT, INSERT, UPDATE ON organizaciones TO inventory_app;

COMMIT;
