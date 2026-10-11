-- 079: Despachos sin inventario (2026-10-11) — la nota de cada paquete se puede escribir o corregir en el
-- lote pendiente. La que se escribe aquí manda sobre la nota de la venta en MercadoLibre
-- ('' = sin nota, a propósito). Se guarda en todas las etiquetas de la misma venta del lote.
-- El interruptor "imprimir el título" es app_settings `despacho_sin_titulo` ('true' = no se imprime).
-- Idempotente.

ALTER TABLE despacho_etiquetas ADD COLUMN IF NOT EXISTS nota_despacho TEXT;
ALTER TABLE despacho_etiquetas ADD COLUMN IF NOT EXISTS nota_por INTEGER REFERENCES users(id);
ALTER TABLE despacho_etiquetas ADD COLUMN IF NOT EXISTS nota_at TIMESTAMPTZ;
