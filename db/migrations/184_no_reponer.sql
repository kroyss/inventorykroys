-- 184 (17-11, el dueño): Reportes → Stock → Reponer · «No volver a pedir».
-- Marca del producto: sale de Reponer para siempre; con stock 0, nada en camino y sin ventas de ML por registrar se
-- desactiva (al marcarlo o después, solo, cuando se termina de vender). Una compra o importación NUEVA lo vuelve a la
-- lista (cambiaste de idea). Reactivarlo en Productos o «Devolver» borra la marca. Solo agrega columnas.
ALTER TABLE products ADD COLUMN IF NOT EXISTS no_reponer_at  TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS no_reponer_por INTEGER REFERENCES users(id) ON DELETE SET NULL;
