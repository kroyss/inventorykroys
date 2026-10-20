-- 110 · Lo que dijo el banco de cada pago (20-10): "Comprobar con el banco" ahora vive en Ventas → Por confirmar
-- (y en Pagos ME → Ventas sin inventario). Cualquier usuario sube los estados de cuenta, el cruce se hace en su
-- navegador (lib/conciliacionBanco.ts) y aquí queda SOLO el movimiento que le corresponde a cada pago (no el estado
-- de cuenta completo), para que todo el equipo lo vea en la venta al verificar.
--   banco_nivel: seguro / probable / revisar / no_aparece   (sin_estado no se guarda)
--   banco_mov:   { banco, fecha, monto, ref, concepto }     (null si no apareció)
-- Solo agrega columnas a me_pagos: compatible con la versión anterior.
ALTER TABLE me_pagos ADD COLUMN IF NOT EXISTS banco_nivel  TEXT CHECK (banco_nivel IN ('seguro', 'probable', 'revisar', 'no_aparece'));
ALTER TABLE me_pagos ADD COLUMN IF NOT EXISTS banco_motivo TEXT;
ALTER TABLE me_pagos ADD COLUMN IF NOT EXISTS banco_mov    JSONB;
ALTER TABLE me_pagos ADD COLUMN IF NOT EXISTS banco_at     TIMESTAMPTZ;
ALTER TABLE me_pagos ADD COLUMN IF NOT EXISTS banco_por    INTEGER REFERENCES users(id) ON DELETE SET NULL;
