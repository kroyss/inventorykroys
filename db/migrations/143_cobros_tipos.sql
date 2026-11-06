-- 143 · Cobros: Radar PRO aparte y mejora de plan a mitad de período (06-11-2026, el dueño).
-- organizacion_cobros.tipo: 'plan' (elegir/renovar), 'radar_pro' (1 mes de Radar PRO, $6, cuando quiera con plan
-- activo que traiga Radar) o 'upgrade' (pasar a un plan más caro pagando la diferencia proporcional a los días que le
-- quedan; no cambia la fecha de vencimiento). detalle: el desglose (líneas con su monto) y las fechas que cubre, para
-- que el dueño vea en Plataforma → Cobros qué contrató cada cliente.
-- organizacion_pagos.tipo suma 'upgrade'.
-- Solo agrega (compatible con la versión anterior: sin tipo = 'plan'). Idempotente.
ALTER TABLE organizacion_cobros ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'plan';
ALTER TABLE organizacion_cobros ADD COLUMN IF NOT EXISTS detalle JSONB;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizacion_cobros_tipo_check') THEN
    ALTER TABLE organizacion_cobros ADD CONSTRAINT organizacion_cobros_tipo_check CHECK (tipo IN ('plan', 'radar_pro', 'upgrade'));
  END IF;
END $$;

DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'organizacion_pagos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%tipo%'
             AND pg_get_constraintdef(oid) NOT LIKE '%upgrade%'
  LOOP
    EXECUTE format('ALTER TABLE organizacion_pagos DROP CONSTRAINT %I', c);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizacion_pagos_tipo_check2') THEN
    ALTER TABLE organizacion_pagos ADD CONSTRAINT organizacion_pagos_tipo_check2 CHECK (tipo IN ('plan', 'recarga', 'radar_pro', 'upgrade'));
  END IF;
END $$;
