-- 157 · Recargas de créditos de IA desde Mi plan (09-11-2026, el dueño: "que sea como se paga el plan").
-- organizacion_cobros.tipo suma 'recarga' (el paquete va en detalle: creditos). Al aprobar: organizacion_pagos
-- tipo 'recarga' + ia_creditos (mig. 156). Solo agrega (compatible con la versión anterior). Idempotente.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizacion_cobros_tipo_check'
             AND pg_get_constraintdef(oid) NOT LIKE '%recarga%') THEN
    ALTER TABLE organizacion_cobros DROP CONSTRAINT organizacion_cobros_tipo_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizacion_cobros_tipo_check') THEN
    ALTER TABLE organizacion_cobros ADD CONSTRAINT organizacion_cobros_tipo_check CHECK (tipo IN ('plan', 'radar_pro', 'upgrade', 'recarga'));
  END IF;
END $$;
