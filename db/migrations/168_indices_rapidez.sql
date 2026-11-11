-- 168 · Índices para rapidez (12-11-2026, fase 1 del plan de rapidez). Solo agrega índices: no cambia datos ni
-- columnas. Los vínculos producto ↔ publicación de ML se buscan por el número de publicación (split_part del código
-- "123:456") desde Alertas de stock, Stock en ML, Inventario y la vinculación; sin índice se recorría la tabla entera
-- por cada fila (Alertas → Pausadas: 0,43 s). ml_catalogo se cruza por el número sin prefijo (substring desde 4).
CREATE INDEX IF NOT EXISTS idx_product_ml_codes_pub ON product_ml_codes (empresa_id, (split_part(ml_code, ':', 1)));
CREATE INDEX IF NOT EXISTS idx_product_ml_codes_code ON product_ml_codes (empresa_id, ml_code);
CREATE INDEX IF NOT EXISTS idx_product_ml_codes_product ON product_ml_codes (empresa_id, product_id);
CREATE INDEX IF NOT EXISTS idx_ml_catalogo_num ON ml_catalogo (empresa_id, (substring(item_id FROM 4)));
ANALYZE product_ml_codes;
ANALYZE ml_catalogo;
