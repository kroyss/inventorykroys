-- 107 · Envíos apartados en Despachos (20-10): sacar un envío puntual sin perderlo.
--   'espera'    → hoy no sale: no entra al manifiesto ni lo reporta el Reportador; queda en "En espera"
--                 hasta que alguien lo libere ("Sale hoy") o lo cancele.
--   'cancelado' → no se enviará (desistió, pago mal, error): nunca va al manifiesto ni al Reportador.
-- Con quién, cuándo y por qué (nota). Al liberarlo vuelve a NULL (queda la última nota y quién lo liberó).
-- Solo agrega columnas: compatible con la versión anterior (que las ignora).
ALTER TABLE despacho_etiquetas ADD COLUMN IF NOT EXISTS apartado      TEXT CHECK (apartado IN ('espera', 'cancelado'));
ALTER TABLE despacho_etiquetas ADD COLUMN IF NOT EXISTS apartado_nota TEXT;
ALTER TABLE despacho_etiquetas ADD COLUMN IF NOT EXISTS apartado_por  INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE despacho_etiquetas ADD COLUMN IF NOT EXISTS apartado_at   TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_despacho_etiquetas_apartado ON despacho_etiquetas (empresa_id, apartado) WHERE apartado IS NOT NULL;
