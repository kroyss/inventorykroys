-- 113: el CASO REAL de la página /despegue (21-10-2026). La cuenta del dueño que empezó desde cero el 15-09-2026:
-- la página muestra "Hoy, día N: X ventas, casi una cada 2 días". El día sale de `caso_inicio` (solo); las ventas las
-- sube el dueño en Plataforma (esa cuenta no está conectada al sistema). Solo agrega; idempotente.
ALTER TABLE despegue_grupos ADD COLUMN IF NOT EXISTS caso_inicio DATE    NOT NULL DEFAULT DATE '2026-09-15';
ALTER TABLE despegue_grupos ADD COLUMN IF NOT EXISTS caso_ventas INTEGER NOT NULL DEFAULT 17 CHECK (caso_ventas >= 0);
