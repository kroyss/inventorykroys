-- 041 · Mensajes: nick y nombre del comprador (de la orden de ML) para identificarlo en la
-- bandeja. Se llenan al sincronizar y al abrir la conversación; las viejas, de a poco. Idempotente.
ALTER TABLE ml_conversaciones ADD COLUMN IF NOT EXISTS comprador_nick   TEXT;
ALTER TABLE ml_conversaciones ADD COLUMN IF NOT EXISTS comprador_nombre TEXT;
