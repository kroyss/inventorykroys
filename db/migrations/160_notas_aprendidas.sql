-- 160 · Datos del producto aprendidos (10-11-2026, el dueño): cuando la IA dejó una pregunta con «No encontré: …» y el
-- vendedor publicó su propia respuesta, la IA saca de ella SOLO el dato fijo del producto (material, medida,
-- compatibilidad…) y lo guarda sola en ml_item_notas. aprendida_de = la pregunta de la que salió (NULL = la anotó una
-- persona). Solo agrega una columna: compatible con la versión anterior. Idempotente.
ALTER TABLE ml_item_notas ADD COLUMN IF NOT EXISTS aprendida_de BIGINT;
