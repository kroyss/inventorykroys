-- 167 (12-11): Despachos · «Reimprimir igual» en una guía que ya salió en otro lote (quién y cuándo lo pidió).
-- Solo agrega columnas: compatible con la versión anterior.
ALTER TABLE despacho_etiquetas ADD COLUMN IF NOT EXISTS reimprimir_por INTEGER;
ALTER TABLE despacho_etiquetas ADD COLUMN IF NOT EXISTS reimprimir_at  TIMESTAMPTZ;
