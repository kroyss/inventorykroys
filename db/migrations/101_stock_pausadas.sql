-- 101 · Stock: pausadas a mano (2026-10-17, pedido del dueño). La revisión de stock antes descartaba las
-- publicaciones pausadas a mano (con stock); ahora se guardan con estado 'pausada' y la fecha en que el sistema
-- las vio pausadas, para la pestaña "Pausadas" de Stock. Al reactivarlas salen solas de la lista.
-- Compatible con la versión anterior (solo agrega). Idempotente.
ALTER TABLE ml_stock_alertas ADD COLUMN IF NOT EXISTS pausada_desde TIMESTAMPTZ;
