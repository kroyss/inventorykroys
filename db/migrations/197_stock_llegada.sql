-- 197 · Automatizaciones → Stock: «Llegó mercancía» (24-11-2026, pedido del dueño). Las publicaciones pausadas o en 0 en ML
-- cuyo producto recibió mercancía (entrada en el inventario: compra, importación, ajuste) vuelven arriba de Agotadas y Pausadas
-- aunque se hubieran quitado con «No hay» o «Quitar». «Ahora no» las saca hasta la próxima entrada (llegada_vista_at).
-- Solo agrega una columna: compatible con la versión anterior. Idempotente.
ALTER TABLE ml_stock_alertas ADD COLUMN IF NOT EXISTS llegada_vista_at TIMESTAMPTZ;
