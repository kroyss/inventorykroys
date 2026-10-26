-- 127 · El catálogo (lib/catalogoML.ts) BORRABA las pausadas sin ventas ni preguntas en 90 días (pensado para la IA),
--   y Vincular / Stock en ML / Crear productos desde ML leen el mismo catálogo: una pausada vieja (que puede venir en
--   camino, o un cliente nuevo sin historial en el sistema) no aparecía en ningún lado (26-10, MLV759192516).
--   Ahora se guardan todas y se marcan: sin_movimiento = pausada sin ventas ni preguntas en 90 días. El historial de
--   preguntas para la IA no se trae para esas. Solo agrega: compatible con la versión anterior.
ALTER TABLE ml_catalogo ADD COLUMN IF NOT EXISTS sin_movimiento BOOLEAN NOT NULL DEFAULT FALSE;
