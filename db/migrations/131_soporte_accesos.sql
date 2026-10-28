-- 131 · "Ver como cliente" (28-10-2026): el dueño de la plataforma mira una empresa cliente como la ve uno de sus
-- usuarios, en solo lectura (lib/auth.ts, proxy.ts). Cada entrada queda registrada. GLOBAL (sin empresa_id ni RLS):
-- solo la lee Plataforma; el cliente NO ve este registro (pedido del dueño).
CREATE TABLE IF NOT EXISTS soporte_accesos (
  id           BIGSERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  empresa_id   INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  como_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  como_nombre  TEXT,
  inicio_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fin_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS soporte_accesos_empresa_idx ON soporte_accesos (empresa_id, inicio_at DESC);
GRANT SELECT, INSERT, UPDATE ON soporte_accesos TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE soporte_accesos_id_seq TO inventory_app;
