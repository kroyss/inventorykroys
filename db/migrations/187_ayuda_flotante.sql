-- 187 · Ayuda en todo el sistema (19-11-2026, el dueño): el chat de Ayuda (Preguntar + Soporte) casi no se usaba; ahora
-- vive en Aprendizaje y cada persona decide con un interruptor si lo quiere además en todas las pantallas.
-- Global (de la cuenta, como users). Empieza apagado. Solo agrega (compatible con la versión anterior). Idempotente.
ALTER TABLE users ADD COLUMN IF NOT EXISTS ayuda_flotante BOOLEAN NOT NULL DEFAULT FALSE;
