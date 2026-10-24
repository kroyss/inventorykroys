-- 120 · "Ya la despaché por fuera" (24-10, sin inventario / Fundadores): la venta de ML se cumplió pero sin pasar por el
-- sistema (sin Pagos ME ni Despachos). Sin la marca quedaba en la lista de Ventas y, peor, el día 6 la red de seguridad
-- de Calificaciones la calificaba "no concretada" (no ve pago ni guía). Con la marca sale de la lista y Calificaciones la
-- toma como CONCRETADA (la espera cuenta desde la marca). Va en la ORDEN, como no_concretada (mig 115). Se puede deshacer.
-- La sincronización de órdenes no toca estas columnas. Solo agrega: compatible con la versión anterior. Idempotente.
ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS fuera_at  TIMESTAMPTZ;
ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS fuera_por INTEGER REFERENCES users(id) ON DELETE SET NULL;
