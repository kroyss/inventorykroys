-- 147 · Despachos: "Ya la envié" (07-11-2026, caso Urdaneta). Un envío que se despachó por fuera del sistema (p. ej.
-- antes de empezar a usar Despachos) sale de la jornada y del manifiesto SIN cancelar la venta (a diferencia de
-- 'cancelado', no la marca "No se concretó"). Nuevo valor de despacho_etiquetas.apartado: 'enviada'.
-- Solo agrega un valor permitido: compatible con la versión anterior. Idempotente.
BEGIN;
ALTER TABLE despacho_etiquetas DROP CONSTRAINT IF EXISTS despacho_etiquetas_apartado_check;
ALTER TABLE despacho_etiquetas ADD CONSTRAINT despacho_etiquetas_apartado_check
  CHECK (apartado = ANY (ARRAY['espera'::text, 'cancelado'::text, 'enviada'::text]));
COMMIT;
