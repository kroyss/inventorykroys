-- 148 (07-11-2026): fechas de prender/apagar el módulo inventario por empresa.
-- inventario_desde: última vez que se prendió. Por confirmar solo pide "Registrar venta" de ventas posteriores
--   (al prenderlo, primera vez o de nuevo, no caen de golpe las ventas viejas ya despachadas desde Pagos ME).
-- inventario_hasta: última vez que se apagó (para avisar "estuviste sin inventario: haz un conteo").
-- Las mantiene un trigger: valen para cualquier camino que cambie empresas.modulos (Plataforma, cobros, alta…).
-- Solo agrega (compatible con la versión anterior). Las empresas actuales quedan en NULL = sin filtro, como hoy.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS inventario_desde timestamptz;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS inventario_hasta timestamptz;

CREATE OR REPLACE FUNCTION empresas_fechas_inventario() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF 'inventario' = ANY(NEW.modulos) AND NOT ('inventario' = ANY(COALESCE(OLD.modulos, '{}'))) THEN
    NEW.inventario_desde := NOW();
  ELSIF NOT ('inventario' = ANY(NEW.modulos)) AND 'inventario' = ANY(COALESCE(OLD.modulos, '{}')) THEN
    NEW.inventario_hasta := NOW();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_empresas_fechas_inventario ON empresas;
CREATE TRIGGER trg_empresas_fechas_inventario BEFORE UPDATE OF modulos ON empresas
  FOR EACH ROW EXECUTE FUNCTION empresas_fechas_inventario();
