-- 044 · Plataforma → Interno: consumo de IA por empresa y por mes. + módulo `stock_ml`.
--
-- Módulo `stock_ml` (Stock en ML, en pruebas): antes colgaba de `preguntas`; ahora es propio,
-- para liberarlo por cliente. Se prende en las empresas de la organización de la plataforma
-- (SolucionesMC, id 1) que ya tenían `preguntas`; los clientes quedan sin él.
--
-- ia_uso es POR EMPRESA (RLS empresa_aislada): la app (rol inventory_app) solo ve la de la
-- sesión. Para que el dueño de la plataforma vea el consumo de TODAS las empresas (y saber
-- cuánto cobrar por la IA), esta función devuelve SOLO totales agregados, con permisos del
-- dueño de la base (SECURITY DEFINER, mismo patrón que db/multiempresa/04_funciones.sql).
-- El control de quién la llama está en la API (/api/plataforma/uso-ia: solo el dueño).
-- Idempotente.
BEGIN;

CREATE OR REPLACE FUNCTION plataforma_uso_ia(p_desde DATE)
RETURNS TABLE (empresa_id INTEGER, mes TEXT, modulo TEXT, borradores INTEGER,
               entrada BIGINT, salida BIGINT, busquedas BIGINT, costo NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.empresa_id,
         to_char(date_trunc('month', u.fecha AT TIME ZONE 'America/Caracas'), 'YYYY-MM') AS mes,
         u.modulo,
         COUNT(*)::int,
         COALESCE(SUM(u.entrada), 0)::bigint,
         COALESCE(SUM(u.salida), 0)::bigint,
         COALESCE(SUM(u.busquedas), 0)::bigint,
         COALESCE(SUM(u.costo), 0)
  FROM ia_uso u
  WHERE u.fecha >= p_desde
  GROUP BY 1, 2, 3
$$;

REVOKE ALL ON FUNCTION plataforma_uso_ia(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plataforma_uso_ia(DATE) TO inventory_app;

UPDATE empresas SET modulos = array_append(modulos, 'stock_ml')
WHERE organizacion_id = 1 AND 'preguntas' = ANY(modulos) AND NOT 'stock_ml' = ANY(modulos);

COMMIT;
