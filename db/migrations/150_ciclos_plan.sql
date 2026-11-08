-- 150 (07-11-2026): pagar el plan por 6 o 12 meses (Fase 1.3 de docs/analisis-mercasist.md): −20 % y −30 %.
-- Amplía los valores permitidos de organizacion_cobros.ciclo (organizaciones y organizacion_pagos no tienen CHECK).
-- Solo agrega valores (compatible con la versión anterior). Idempotente.
ALTER TABLE organizacion_cobros DROP CONSTRAINT IF EXISTS organizacion_cobros_ciclo_check;
ALTER TABLE organizacion_cobros ADD CONSTRAINT organizacion_cobros_ciclo_check
  CHECK (ciclo = ANY (ARRAY['mensual', 'trimestral', 'semestral', 'anual']));
