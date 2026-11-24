-- 199 · «Pendiente de la IA» en Mensajes (24-11, el dueño): cuando la IA responde SOLA y en esa respuesta deja algo para el
-- equipo (pedido especial, cambio, factura, pago…), ML marca la conversación como leída y salía de «Por atender»: la nota
-- quedaba en la venta pero nadie se enteraba. Ahora la conversación queda en Por atender hasta que alguien del equipo
-- escribe en ella o toca «Listo».
--   pendiente_ia_at  cuándo la IA dejó lo pendiente (NULL = nada pendiente / ya atendido)
--   pendiente_ia     qué quedó pendiente (lo mismo que fue a la nota)
-- Compatible con la versión anterior (solo agrega). Idempotente.
ALTER TABLE ml_conversaciones ADD COLUMN IF NOT EXISTS pendiente_ia_at TIMESTAMPTZ;
ALTER TABLE ml_conversaciones ADD COLUMN IF NOT EXISTS pendiente_ia TEXT;
