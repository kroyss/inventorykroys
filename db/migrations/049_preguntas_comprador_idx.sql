-- 049 · Índice para ver las preguntas anteriores de un comprador (Preguntas y Mensajes). Idempotente.
CREATE INDEX IF NOT EXISTS idx_ml_preguntas_comprador ON ml_preguntas (empresa_id, comprador_id, fecha DESC);
