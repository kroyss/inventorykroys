-- 088: Recordatorios de pago (2026-10-13). lib/recordatoriosPago.ts
--
-- A quien compró y no concretó (sin pago traído de Pagos ME, sin venta registrada, sin guía, sin
-- calificar, sin cancelar y sin haber escrito) se le manda un recordatorio por mensaje de ML.
-- Solo empresas con el módulo `pagos_me` (la señal de pago es lo que lo hace seguro).
-- Una fila por venta (pack): cuántos se mandaron, el último turno (no repetir) y si se detuvo
-- ("Ya pagó, no recordar" o ML rechazó el mensaje). La configuración vive en app_settings.
-- Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS ml_recordatorios (
  empresa_id    INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                  REFERENCES empresas(id),
  pack_id       BIGINT NOT NULL,                -- la venta (pack, o la orden si no tiene pack)
  orden_id      BIGINT NOT NULL,
  enviados      INTEGER NOT NULL DEFAULT 0,
  ultimo_at     TIMESTAMPTZ,
  ultimo_turno  TEXT,                           -- 'AAAA-MM-DD#n': el turno ya atendido (no repetir)
  error         TEXT,                           -- el último error al mandar (si lo hubo)
  detenido      TEXT,                           -- 'manual' (Ya pagó) / 'ml' (ML rechazó) / 'cancelada'
  detenido_por  INTEGER REFERENCES users(id),
  detenido_at   TIMESTAMPTZ,
  creado_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, pack_id)
);

ALTER TABLE ml_recordatorios ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_recordatorios FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 WHERE c.relname = 'ml_recordatorios' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON ml_recordatorios
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON ml_recordatorios TO inventory_app;

COMMIT;
