-- 188 (19-11-2026, el dueño): notas que el VENDEDOR escribe en el portal de MercadoEnvíos (campo `note` de cada
-- orden). Las manda la extensión 1.3.7 en cada traída, de TODAS las órdenes de los últimos días (también las
-- incompletas, sin pago ni guía). Por ahora solo se guardan; la pantalla («📝 Nota · ME») va después.
-- También me_pagos.bancos_me (ver abajo).
-- Por empresa: empresa_id + RLS empresa_aislada (patrón de 094). Compatible con la versión anterior (solo agrega).
-- Idempotente. Primero staging, después producción.
BEGIN;

CREATE TABLE IF NOT EXISTS me_notas (
  empresa_id     INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                   REFERENCES empresas(id),
  orden_me       TEXT NOT NULL,              -- id de la orden en el portal (_id)
  venta          TEXT,                       -- número de venta de ML, si se puede deducir
  cuenta         TEXT,                       -- cuenta de MercadoEnvíos (perfil del vigilante)
  nota           TEXT NOT NULL,
  visto_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- última traída que la vio
  cambiada_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- cuándo cambió el texto
  PRIMARY KEY (empresa_id, orden_me)
);
CREATE INDEX IF NOT EXISTS me_notas_venta ON me_notas (empresa_id, venta);

-- Bancos que trae el pago en el portal (campos con «bank» en el nombre: ruta → nombre del banco; nunca números de
-- cuenta). En transferencias el portal casi nunca daba el banco receptor donde se buscaba (461 de 466 sin él, 19-11):
-- se guardan para elegirlo en el servidor y poder corregir la regla sin otra versión de la extensión.
ALTER TABLE me_pagos ADD COLUMN IF NOT EXISTS bancos_me JSONB;

ALTER TABLE me_notas ENABLE ROW LEVEL SECURITY;
ALTER TABLE me_notas FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 WHERE c.relname = 'me_notas' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON me_notas
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON me_notas TO inventory_app;

COMMIT;
