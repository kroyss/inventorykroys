-- 156 · Créditos de IA = UN saldo que no vence (09-11-2026, decisión del dueño).
-- Antes (mig. 140 y regla 08-11): bolsas por período (prueba / contrato / mes) que vencían, más recargas aparte.
-- Ahora: cada empresa tiene un saldo = lo otorgado (ia_creditos) − lo usado desde ia_saldo_desde. Se otorga:
--   · prueba     → 500, una vez, al registrarse (lib/altaCuenta.ts)
--   · plan       → con el PRIMER plan contratado, según el escalón (500 / 1.000 / 1.500 / 2.000), una sola vez
--                  (lib/cobros.ts registrarPlan); renovar, cambiar de plan o reactivar NO vuelve a dar
--   · recarga    → lo que compra (Plataforma → Plan y pagos; la fila del pago sigue en organizacion_pagos)
--   · regalo     → lo que el dueño regala a mano (Plataforma, recarga con monto 0)
--   · transicion → el cambio de hoy (recargas que quedaban sin usar)
-- La propietaria (SolucionesMC) sigue con su tope por mes calendario (ia_limite_mes); NULL = sin límite.
-- Tabla GLOBAL (sin empresa_id de RLS, como organizacion_pagos): la leen cupoIA (dbGlobal) y Plataforma.
-- Solo agrega (compatible con la versión anterior, que sigue leyendo ia_limite_mes). Idempotente.

CREATE TABLE IF NOT EXISTS ia_creditos (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  motivo      TEXT NOT NULL CHECK (motivo IN ('prueba', 'plan', 'recarga', 'regalo', 'transicion')),
  creditos    INTEGER NOT NULL,
  pago_id     INTEGER REFERENCES organizacion_pagos(id) ON DELETE SET NULL,
  nota        TEXT,
  fecha       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  por         INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_ia_creditos_empresa ON ia_creditos (empresa_id);
-- Prueba y primer plan: una sola vez por empresa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ia_creditos_prueba ON ia_creditos (empresa_id) WHERE motivo = 'prueba';
CREATE UNIQUE INDEX IF NOT EXISTS uq_ia_creditos_plan ON ia_creditos (empresa_id) WHERE motivo = 'plan';
GRANT SELECT, INSERT, UPDATE, DELETE ON ia_creditos TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE ia_creditos_id_seq TO inventory_app;

-- Desde cuándo cuenta lo usado contra el saldo (NULL en la propietaria: ella sigue por mes).
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS ia_saldo_desde TIMESTAMPTZ;

-- Transición, UNA vez (si la tabla está vacía):
--   · con plan pagado alguna vez → los créditos de su escalón (como si fuera su primer plan)
--   · en prueba o activa sin plan → 500 de prueba (las de solo Radar tienen ia_limite_mes = 0: nada)
--   · vencidas sin plan → nada (si vuelven con un plan, reciben los del primer plan)
--   · recargas que quedaban sin usar → 'transicion'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ia_creditos) THEN
    INSERT INTO ia_creditos (empresa_id, motivo, creditos, nota)
    SELECT e.id, 'transicion', r.quedan, 'Recargas sin usar al pasar a saldo (09-11)'
    FROM empresas e JOIN organizaciones o ON o.id = e.organizacion_id
    JOIN LATERAL (
      SELECT (SELECT COALESCE(SUM(p.creditos), 0) FROM organizacion_pagos p WHERE p.empresa_id = e.id AND p.tipo = 'recarga')
           - (SELECT COALESCE(SUM(u.creditos_recarga), 0) FROM ia_uso u WHERE u.empresa_id = e.id) AS quedan) r ON TRUE
    WHERE o.estado <> 'propietario' AND r.quedan > 0;

    INSERT INTO ia_creditos (empresa_id, motivo, creditos, nota)
    SELECT e.id, 'plan', CASE COALESCE(o.escalon, 0) WHEN 0 THEN 500 WHEN 1 THEN 1000 WHEN 2 THEN 1500 ELSE 2000 END,
           'Primer plan (al pasar a saldo, 09-11)'
    FROM empresas e JOIN organizaciones o ON o.id = e.organizacion_id
    WHERE o.estado <> 'propietario'
      AND EXISTS (SELECT 1 FROM organizacion_pagos p WHERE p.organizacion_id = o.id AND p.tipo = 'plan');

    INSERT INTO ia_creditos (empresa_id, motivo, creditos, nota)
    SELECT e.id, 'prueba', 500, 'Prueba (al pasar a saldo, 09-11)'
    FROM empresas e JOIN organizaciones o ON o.id = e.organizacion_id
    WHERE o.estado IN ('prueba', 'activo') AND COALESCE(e.ia_limite_mes, 1) > 0
      AND NOT EXISTS (SELECT 1 FROM organizacion_pagos p WHERE p.organizacion_id = o.id AND p.tipo = 'plan');

    UPDATE empresas e SET ia_saldo_desde = NOW()
    FROM organizaciones o WHERE o.id = e.organizacion_id AND o.estado <> 'propietario' AND e.ia_saldo_desde IS NULL;
  END IF;
END $$;
