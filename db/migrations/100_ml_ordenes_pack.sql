-- 100 · Índice para buscar una venta por su paquete (2026-10-17). Mensajes, Reportador y Pagos ME buscan
-- la venta "por número y, si no, por paquete"; sin este índice la parte del paquete recorría la tabla.
-- Compatible con la versión anterior (solo agrega). Idempotente.
CREATE INDEX IF NOT EXISTS idx_ml_ordenes_pack ON ml_ordenes (empresa_id, pack_id) WHERE pack_id IS NOT NULL;
