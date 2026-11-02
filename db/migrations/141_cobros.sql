-- 141 · Cobros: el cliente reporta su pago en "Mi plan" y el dueño lo aprueba en Plataforma → Cobros (02-11-2026).
-- En Venezuela no hay cobro automático: el cliente paga por Pago Móvil (Bs a tasa BCV) o Binance (USDT), adjunta la
-- captura y la referencia; el dueño lo confirma a mano y al aprobar se activa/renueva el plan (misma lógica que
-- Plataforma → Plan y pagos, que deja la fila en organizacion_pagos).
-- organizacion_cobros: GLOBAL (sin empresa_id de RLS, como organizacion_pagos): la leen "Mi plan" (solo su
-- organización, filtrado en el código) y Plataforma, con dbGlobal().
-- Un solo pago "en revisión" por organización a la vez (índice único parcial).
-- Mientras haya uno en revisión reportado ANTES del vencimiento, la cuenta no se pausa (lib/planesCuenta.ts, lib/cuenta.ts).
-- plataforma_config: datos de cobro (Pago Móvil / Binance) que ve el cliente, editables en Plataforma → Cobros.
-- Solo agrega (compatible con la versión anterior). Idempotente.
CREATE TABLE IF NOT EXISTS organizacion_cobros (
  id              SERIAL PRIMARY KEY,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,          -- quién lo reportó
  plan            TEXT NOT NULL,
  escalon         SMALLINT NOT NULL,
  ciclo           TEXT NOT NULL CHECK (ciclo IN ('mensual', 'trimestral')),
  radar_pro       BOOLEAN NOT NULL DEFAULT FALSE,
  cuentas_extra   SMALLINT NOT NULL DEFAULT 0,
  ventas_30d      INTEGER,                                                   -- con qué ventas se calculó el escalón
  monto_usd       NUMERIC(10, 2) NOT NULL,
  metodo          TEXT NOT NULL CHECK (metodo IN ('pago_movil', 'binance')),
  tasa_bcv        NUMERIC(14, 4),                                            -- Pago Móvil: la tasa usada al reportar
  monto_bs        NUMERIC(14, 2),
  referencia      TEXT NOT NULL,
  fecha_pago      DATE NOT NULL,
  comprobante     TEXT,                                                      -- archivo en UPLOAD_DIR/cobros/<id>.<ext>
  estado          TEXT NOT NULL DEFAULT 'revision' CHECK (estado IN ('revision', 'aprobado', 'rechazado')),
  motivo          TEXT,                                                      -- rechazo: lo ve el cliente
  creado_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revisado_por    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  revisado_at     TIMESTAMPTZ,
  pago_id         INTEGER REFERENCES organizacion_pagos(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_organizacion_cobros ON organizacion_cobros (organizacion_id, creado_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizacion_cobros_revision ON organizacion_cobros (organizacion_id) WHERE estado = 'revision';
CREATE INDEX IF NOT EXISTS idx_organizacion_cobros_referencia ON organizacion_cobros (lower(referencia));
GRANT SELECT, INSERT, UPDATE, DELETE ON organizacion_cobros TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE organizacion_cobros_id_seq TO inventory_app;

CREATE TABLE IF NOT EXISTS plataforma_config (
  clave      TEXT PRIMARY KEY,
  valor      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
GRANT SELECT, INSERT, UPDATE ON plataforma_config TO inventory_app;
INSERT INTO plataforma_config (clave, valor) VALUES ('datos_cobro', '{
  "pago_movil": {"banco": "Bancamiga (0172)", "cedula": "16.982.769", "telefono": "0414-7133665"},
  "binance": {"id": "213358749", "nombre": "Kr0ys", "correo": "kroyss@gmail.com", "moneda": "USDT"}
}'::jsonb) ON CONFLICT (clave) DO NOTHING;
