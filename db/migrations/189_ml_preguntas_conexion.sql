-- 189 (19-11-2026, el dueño: «revisa tiempos de carga»): el robot de preguntas cuenta las preguntas de cada cuenta
-- (SELECT COUNT(*) FROM ml_preguntas WHERE conexion_id = $1) y sin índice recorría toda la tabla (hasta 2,7 s).
-- Solo agrega un índice. CONCURRENTLY: no bloquea la tabla mientras se crea (por eso sin BEGIN/COMMIT).
-- Idempotente. Primero staging, después producción.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ml_preguntas_conexion ON ml_preguntas (empresa_id, conexion_id);
