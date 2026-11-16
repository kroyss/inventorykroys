-- 181 (16-11-2026, el dueño): el personal de bodega maneja lo que muestra MercadoLibre sin tocar el inventario.
--   product_ml_codes.pausa_mano_*: pausada A MANO desde Stock en ML (quién, cuándo, por qué). Mientras siga pausada,
--     «Igualar y reactivar» no la reactiva sola. Al activarla se borra.
--   products.sin_fisico_*: «Se acabó» (bodega no lo encuentra aunque el sistema diga que hay): todas sus publicaciones
--     van a 0 y quedan en 0 hasta que entre mercancía o se ajuste el inventario (o alguien toque «Ya hay»).
--   ml_stock_cambios.motivo: lo que escribió la persona al pausar.
-- Solo agrega columnas (compatible con la versión anterior). Tablas ya con RLS.
ALTER TABLE product_ml_codes ADD COLUMN IF NOT EXISTS pausa_mano_at TIMESTAMPTZ;
ALTER TABLE product_ml_codes ADD COLUMN IF NOT EXISTS pausa_mano_por INTEGER;
ALTER TABLE product_ml_codes ADD COLUMN IF NOT EXISTS pausa_mano_motivo TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sin_fisico_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sin_fisico_por INTEGER;
ALTER TABLE ml_stock_cambios ADD COLUMN IF NOT EXISTS motivo TEXT;
CREATE INDEX IF NOT EXISTS ml_stock_cambios_fecha ON ml_stock_cambios (empresa_id, creado_at DESC);
