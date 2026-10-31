-- 136 · Revisor IA de las respuestas ya escritas (31-10-2026, lib/revisorSugeridas.ts): antes de mostrar una sugerida,
-- Haiku separa la pregunta en partes y revisa que la respuesta las conteste todas (o agrega una frase con un dato de la
-- publicación). El resultado queda guardado en la pregunta para no volver a pagarlo en cada carga:
--   { plantilla, ok, texto?, partes[], motivo, modelo, fecha }
-- Solo agrega una columna (compatible con la versión anterior). Idempotente.
ALTER TABLE ml_preguntas ADD COLUMN IF NOT EXISTS sugerida_revision JSONB;
