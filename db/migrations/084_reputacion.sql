-- 084: Reputación (2026-10-12, pedido de Gerardo). lib/reputacionML.ts
--
-- * ml_conexiones.reputacion: el termómetro de ML de cada cuenta (/users/{id} → seller_reputation:
--   nivel/color, MercadoLíder, % de calificaciones y métricas de reclamos, demoras y cancelaciones).
-- * ml_ordenes.cal_recibida*: la calificación que NOS dejó el comprador (/orders/{id}/feedback →
--   purchase). La búsqueda de ventas solo dice que existe (cal_comprador = 'calificada'); el tipo sale
--   de a una por venta, solo de las recién calificadas. '' = ML no la tiene.
--   Neutrales y negativas avisan 30 días desde que se dieron (el plazo para pedir el cambio); se
--   revisan una vez al día por si el comprador la cambió.
-- Idempotente.

ALTER TABLE ml_conexiones ADD COLUMN IF NOT EXISTS reputacion    JSONB;
ALTER TABLE ml_conexiones ADD COLUMN IF NOT EXISTS reputacion_at TIMESTAMPTZ;

ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS cal_recibida            TEXT;
ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS cal_recibida_at         TIMESTAMPTZ;   -- cuándo la dio el comprador
ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS cal_recibida_msg        TEXT;
ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS cal_recibida_revisada_at TIMESTAMPTZ;  -- última vez que se le preguntó a ML
ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS cal_recibida_vista_at   TIMESTAMPTZ;   -- "Ya la vi": deja de contar en el menú
ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS cal_recibida_antes      TEXT;          -- si la cambió: lo que era (neutral/negative)

CREATE INDEX IF NOT EXISTS idx_ml_ordenes_cal_recibida ON ml_ordenes (empresa_id, cal_recibida_at)
  WHERE cal_recibida IN ('neutral', 'negative') OR cal_recibida_antes IS NOT NULL;
