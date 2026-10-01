-- 040 · Mensajes: cuántos no leídos dice ML (aparte de los que muestra la bandeja).
--
-- ML a veces cuenta como "sin leer" un mensaje que no muestra (moderado/oculto): no se puede
-- marcar y la conversación volvía a "Sin leer" cada minuto. Ahora `sin_leer` (la bandeja) solo
-- cuenta si hay mensajes del comprador VISIBLES sin leer; `sin_leer_ml` guarda lo que dice ML
-- para no releer la conversación si no cambió. Idempotente.
ALTER TABLE ml_conversaciones ADD COLUMN IF NOT EXISTS sin_leer_ml INTEGER;
