-- 115 · "No se concretó" desde Por confirmar (23-10): la venta de ML se pagó pero no se pudo cumplir (sin stock, el
-- comprador se arrepintió…) y se devolvió el dinero. ML no avisa la cancelación hasta que alguien califica, así que la
-- marca la persona. Va en la ORDEN (ml_ordenes), no en el pago: el pago fue bueno y Pagos ME lo sigue viendo así.
-- Con la marca la orden sale de Por confirmar y Calificaciones la sugiere "no concretada". Se puede deshacer.
-- La sincronización de órdenes no toca estas columnas. Solo agrega: compatible con la versión anterior.
ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS no_concretada_at     TIMESTAMPTZ;
ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS no_concretada_motivo TEXT;   -- sin_stock · arrepentido · otro
ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS no_concretada_nota   TEXT;
ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS no_concretada_por    INTEGER REFERENCES users(id) ON DELETE SET NULL;
