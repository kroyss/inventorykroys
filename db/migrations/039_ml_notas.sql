-- 039 · Notas de la venta de MercadoLibre en Mensajes (y su enlace con Ventas).
--
-- Las notas viven en ML (/orders/{id}/notes o /packs/{id}/notes); acá solo se guarda una
-- COPIA por conversación para marcar en la bandeja quién tiene nota (pestaña "Con nota").
-- Se refresca al abrir la conversación, al escribir una nota y al sincronizar sus mensajes.
-- ml_conversaciones ya es por empresa (RLS): solo se agregan columnas. Idempotente.
ALTER TABLE ml_conversaciones ADD COLUMN IF NOT EXISTS notas    TEXT;
ALTER TABLE ml_conversaciones ADD COLUMN IF NOT EXISTS notas_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_ml_conversaciones_notas ON ml_conversaciones (empresa_id) WHERE notas IS NOT NULL;
