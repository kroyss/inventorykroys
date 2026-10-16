-- 099 · Promociones: editar campañas propias desde el sistema (2026-10-16).
-- El registro de acciones acepta 'editar_campana' (cambio de nombre/fechas en ML).
-- Compatible con la versión anterior (solo amplía los valores permitidos). Idempotente.
ALTER TABLE ml_promociones_acciones DROP CONSTRAINT IF EXISTS ml_promociones_acciones_accion_check;
ALTER TABLE ml_promociones_acciones ADD CONSTRAINT ml_promociones_acciones_accion_check
  CHECK (accion IN ('crear_campana', 'editar_campana', 'borrar_campana', 'agregar', 'quitar'));
