-- 055 · Limpieza automática de Despachos: los PDF en disco (etiquetas, lotes, manifiestos) se
-- borran a los 6 meses (lib/limpiezaDespachos.ts, una vez al día desde el cron de preguntas).
-- En la base queda todo; esta marca dice qué lote/jornada ya no tiene sus archivos. Idempotente.
ALTER TABLE despacho_lotes    ADD COLUMN IF NOT EXISTS archivos_borrados_at TIMESTAMPTZ;
ALTER TABLE despacho_jornadas ADD COLUMN IF NOT EXISTS archivos_borrados_at TIMESTAMPTZ;
