-- 137 · Respuesta automática con IA (01-11-2026, lib/iaAutomatica.ts): el cron le pide a la IA cada pregunta nueva y
-- decide si saldría sola (confianza alta + verificador OK + sin "no hay", sin otra publicación, publicación activa).
-- Modo prueba ("sombra"): no publica nada, solo guarda la decisión para que el vendedor la marque bien o mal.
--   { modo, decision: 'sola'|'revisar', motivos[], respuesta, confianza, verificacion, modelo, costo, fecha,
--     publicada?, marca?: 'bien'|'mal', marcada_at? }
-- La configuración vive en app_settings.preguntas_ia_auto = { modo: 'apagado'|'sombra'|'real', desde }.
-- Solo agrega una columna (compatible con la versión anterior). Idempotente.
ALTER TABLE ml_preguntas ADD COLUMN IF NOT EXISTS ia_auto JSONB;
CREATE INDEX IF NOT EXISTS idx_ml_preguntas_ia_auto ON ml_preguntas (empresa_id, fecha DESC) WHERE ia_auto IS NOT NULL;

-- Módulo ia_automatica (lib/modulos.ts): en prueba solo SolucionesMC VE (empresa 1). A un cliente se le prende en Plataforma.
UPDATE empresas SET modulos = array_append(modulos, 'ia_automatica') WHERE id = 1 AND NOT ('ia_automatica' = ANY (modulos));
