-- 121 · Notificaciones de ML, paso 1b (24-10): de cada aviso de MENSAJE se lee el mensaje en ML y se guarda QUIÉN lo
-- escribió (vendedor / comprador), en qué conversación y con qué aplicación (client_id), sin el texto. Para saber qué
-- son los ~218 avisos de mensajes que la consulta de cada minuto no guardó (¿respuestas del vendedor desde otra app o
-- desde la de ML, o mensajes de compradores que se están perdiendo?). Solo agrega: compatible. Idempotente.
ALTER TABLE ml_notificaciones ADD COLUMN IF NOT EXISTS detalle  JSONB;
ALTER TABLE ml_notificaciones ADD COLUMN IF NOT EXISTS leido_at TIMESTAMPTZ;
GRANT UPDATE ON ml_notificaciones TO inventory_app;
