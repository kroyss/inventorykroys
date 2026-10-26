-- 123 · Stock en ML, Fase 1 (26-10; Inventario → «Stock en ML», lib/stockConML.ts): una publicación vinculada se
-- puede marcar «No sincronizar» (rifas, encargos, lo que se maneja aparte) y la pantalla no la toca.
-- «Trae N u.» usa product_ml_codes.unidades (migración 098), que ya existe.
-- Solo agrega: compatible con la versión anterior. Idempotente.
ALTER TABLE product_ml_codes ADD COLUMN IF NOT EXISTS sin_sincronizar BOOLEAN NOT NULL DEFAULT FALSE;
