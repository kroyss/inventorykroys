-- 058 · Programa Fundadores: pregunta informativa "¿Pagas alguna herramienta o servicio para vender?"
-- (no / app / persona). Idempotente.
ALTER TABLE fundadores_solicitudes ADD COLUMN IF NOT EXISTS herramientas TEXT;
