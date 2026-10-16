-- 096 · Pagos ME: a qué cuenta de MercadoLibre corresponde cada perfil de la extensión (2026-10-16, pedido
-- del dueño). La extensión manda las ventas que ve en el portal de MercadoEnvíos; el sistema las cruza con
-- ml_ordenes de las cuentas conectadas: si coinciden, el perfil queda unido a esa cuenta (y se muestra
-- "PIKEKE" en vez del nombre del portal); si no coincide ninguna, no se guarda nada y se avisa.
-- Compatible con la versión anterior (solo agrega). Idempotente. Primero staging, después producción.
ALTER TABLE me_latidos ADD COLUMN IF NOT EXISTS conexion_id INTEGER;
ALTER TABLE me_latidos ADD COLUMN IF NOT EXISTS verificacion TEXT;        -- ok · distinta · sin_datos
ALTER TABLE me_latidos ADD COLUMN IF NOT EXISTS verificado_at TIMESTAMPTZ;
