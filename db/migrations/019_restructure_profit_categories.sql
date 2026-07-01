-- 019 · Reestructura de categorías de ganancia (markup) a escala pareja de 20
-- Nueva escala:  ULTRA 120 · SUPER 100 · ALTO 80 · MEDIO 60 · BAJO 40 · REMATE 20
--   · ULTRA sube 100→120
--   · SUPER se REACTIVA (estaba desactivada en 91 desde la simplificación 014) en 100
--   · ALTO 75→80 · MEDIO 50→60 · BAJO 40 (deja algo de ganancia) · REMATE 20
--   · BIEN (71) y MUERTE (11) siguen desactivadas.
--
-- Approach A (igual que 014): NO se recalculan precios. Solo cambia el % de cada
-- categoría (guía/etiqueta); cada producto sigue en su misma categoría y hereda
-- el % nuevo en el precio SUGERIDO. Los precios guardados se re-precian a mano.
--
-- Idempotente (setea valores absolutos por nombre). Correr en AMBAS DBs.

UPDATE profit_categories SET profit_percentage = 120, is_active = TRUE WHERE name = 'ULTRA';
UPDATE profit_categories SET profit_percentage = 100, is_active = TRUE WHERE name = 'SUPER';
UPDATE profit_categories SET profit_percentage =  80, is_active = TRUE WHERE name = 'ALTO';
UPDATE profit_categories SET profit_percentage =  60, is_active = TRUE WHERE name = 'MEDIO';
UPDATE profit_categories SET profit_percentage =  40, is_active = TRUE WHERE name = 'BAJO';
UPDATE profit_categories SET profit_percentage =  20, is_active = TRUE WHERE name = 'REMATE';
