-- 177 (14-11-2026): Reportes → Stock con reglas por empresa (app_settings.stock_reglas, JSON; lib/stockReglas.ts).
-- Quien no tiene reglas guardadas usa las recomendadas (compras locales). SolucionesMC VE (1) y CO (2) importan:
-- se les guardan los valores con los que trabajaron siempre (antes fijos en el código). Idempotente: no pisa
-- reglas ya editadas. Solo agrega filas (compatible con la versión anterior).
INSERT INTO app_settings (empresa_id, key, value, updated_at)
SELECT e.id, 'stock_reglas',
       '{"llegada":4,"urgente":2,"objetivo":6,"historia":6,"minimo":1,"paradoUnidades":6,"paradoMeses":6,"nuevo":3,"cayendo":4}',
       NOW()
FROM empresas e
WHERE e.id IN (1, 2)
ON CONFLICT (empresa_id, key) DO NOTHING;
