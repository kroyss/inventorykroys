-- 162 · Competencia (10-11-2026, el dueño): medir la IA nueva contra lo ya marcado.
--   origen: 'bot' (respondida por Mercasist fuera del sistema) o 'equipo' (corrección de una persona a lo que propuso nuestra IA).
--   *_antes: la respuesta anterior de nuestra IA y su marca al «Regenerar con la IA de hoy».
-- Solo agrega columnas (compatible con la versión anterior). Idempotente.
ALTER TABLE ia_competencia ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'bot';
ALTER TABLE ia_competencia ADD COLUMN IF NOT EXISTS respuesta_antes TEXT;
ALTER TABLE ia_competencia ADD COLUMN IF NOT EXISTS decision_antes TEXT;
ALTER TABLE ia_competencia ADD COLUMN IF NOT EXISTS motivos_antes JSONB;
ALTER TABLE ia_competencia ADD COLUMN IF NOT EXISTS marca_antes TEXT;
