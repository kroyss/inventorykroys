-- 138 · Planes y recargas en Plataforma (01-11-2026, pedido del dueño: "no veo dónde activo planes ni recargo créditos").
-- organizaciones: el plan vigente (lib/planes.ts: esencial / automatizaciones / completo × escalón 0..3), el ciclo
-- (mensual / trimestral), hasta cuándo está pagado y hasta cuándo tiene el Radar PRO de fin de semana.
-- Al día siguiente de plan_hasta el cron la pausa (estado 'vencido', motivo_pausa 'plan', lib/planesCuenta.ts).
-- organizacion_pagos: historial de pagos de plan, recargas de créditos de IA (no vencen: suman al tope del mes) y
-- Radar PRO. Tabla GLOBAL (sin empresa_id de RLS): la lee y escribe solo Plataforma con dbGlobal().
-- Solo agrega (compatible con la versión anterior). Idempotente.
ALTER TABLE organizaciones ADD COLUMN IF NOT EXISTS plan TEXT;
ALTER TABLE organizaciones ADD COLUMN IF NOT EXISTS escalon SMALLINT;
ALTER TABLE organizaciones ADD COLUMN IF NOT EXISTS ciclo TEXT;
ALTER TABLE organizaciones ADD COLUMN IF NOT EXISTS plan_hasta DATE;
ALTER TABLE organizaciones ADD COLUMN IF NOT EXISTS radar_pro_hasta DATE;

CREATE TABLE IF NOT EXISTS organizacion_pagos (
  id              SERIAL PRIMARY KEY,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  empresa_id      INTEGER REFERENCES empresas(id) ON DELETE CASCADE,     -- recargas: la empresa que recibe los créditos
  tipo            TEXT NOT NULL CHECK (tipo IN ('plan', 'recarga', 'radar_pro')),
  fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  monto           NUMERIC(10, 2),
  plan            TEXT,
  escalon         SMALLINT,
  ciclo           TEXT,
  desde           DATE,
  hasta           DATE,
  creditos        INTEGER,
  nota            TEXT,
  por             INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_organizacion_pagos ON organizacion_pagos (organizacion_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_organizacion_pagos_recargas ON organizacion_pagos (empresa_id) WHERE tipo = 'recarga';
GRANT SELECT, INSERT, UPDATE, DELETE ON organizacion_pagos TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE organizacion_pagos_id_seq TO inventory_app;
