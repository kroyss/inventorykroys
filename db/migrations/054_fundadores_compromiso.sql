-- 054 · Fundadores: pregunta nueva "¿Llevarías tus ventas y tu stock dentro del sistema?"
-- (compromiso de uso completo, da los puntos) y la de inventario pasa a ser "¿Hoy usas algún
-- sistema?" (solo informativa). Las solicitudes viejas quedan con compromiso NULL. Idempotente.
ALTER TABLE fundadores_solicitudes ADD COLUMN IF NOT EXISTS compromiso TEXT;
