-- 102 · Índice para contar preguntas respondidas por empresa en un período (2026-10-17). Plataforma → Clientes
-- (función plataforma_adopcion) las contaba recorriendo toda la tabla por cada empresa: ~2,3 s.
-- Compatible con la versión anterior (solo agrega). Idempotente.
CREATE INDEX IF NOT EXISTS idx_ml_preguntas_respuesta_fecha ON ml_preguntas (empresa_id, respuesta_fecha) WHERE respuesta_fecha IS NOT NULL;
