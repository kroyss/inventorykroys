-- 183 (17-11-2026, el dueño): Por confirmar → «Sin inventario». El vendedor que todavía no lleva inventario (o lleva
-- unos productos sí y otros no) quita de pendientes las ventas que no va a registrar: dejan de pedir registro y de
-- restar al disponible en Stock en ML. NO es «despachada por fuera» (mig 120): Calificaciones no la toma como
-- concretada. Las ventas nuevas siguen llegando a pendientes (la idea es que cargue su inventario). Se puede deshacer.
-- Solo agrega columnas (compatible con la versión anterior). La sincronización de órdenes no las toca.
ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS sin_inv_at  TIMESTAMPTZ;
ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS sin_inv_por INTEGER REFERENCES users(id) ON DELETE SET NULL;
