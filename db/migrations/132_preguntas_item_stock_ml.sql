-- 132 · Stock de la publicación en ML al momento de la pregunta (28-10-2026, respuesta ya escrita para
-- «¿disponible N unidades?»: solo si ML deja comprar N). Lo llena completarItems (lib/preguntas.ts) con
-- available_quantity, en la misma lectura de la publicación. Solo agrega (compatible con la versión anterior).
ALTER TABLE ml_preguntas ADD COLUMN IF NOT EXISTS item_stock_ml INTEGER;
