-- 038 · Reportador: guarda el TEXTO que se le envió a cada comprador (historial del Reportador).
--
-- Lo llena el Reportador por API al enviar (o, si el comprador ya tenía su guía, el mensaje
-- que se encontró en la conversación). Los reportes anteriores quedan sin texto (está en ML).
-- despacho_etiquetas ya es por empresa (RLS): solo se agrega la columna. Idempotente.
ALTER TABLE despacho_etiquetas ADD COLUMN IF NOT EXISTS reporte_mensaje TEXT;
