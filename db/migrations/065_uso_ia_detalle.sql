-- 065 · Plataforma → Interno: DETALLE del consumo de IA (2026-10-04).
--
-- plataforma_uso_ia (044) da totales por empresa/mes/módulo. Para evaluar y ajustar el gasto de
-- cada Fundador (y el del dueño) hace falta más: por DÍA, por MODELO (Haiku/Sonnet, lote o no) y
-- por USUARIO. Mismo patrón: SECURITY DEFINER (ia_uso tiene RLS por empresa), devuelve solo
-- agregados, y el control de quién la llama está en la API (/api/plataforma/uso-ia: solo el dueño).
-- Idempotente.
BEGIN;

CREATE OR REPLACE FUNCTION plataforma_uso_ia_detalle(p_desde DATE)
RETURNS TABLE (empresa_id INTEGER, dia DATE, modulo TEXT, modelo TEXT, usuario TEXT, usos INTEGER,
               entrada BIGINT, salida BIGINT, busquedas BIGINT, costo NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.empresa_id,
         (u.fecha AT TIME ZONE 'America/Caracas')::date,
         u.modulo, u.modelo,
         COALESCE(us.full_name, us.username, CASE WHEN u.usuario_id IS NULL THEN 'Sistema' ELSE '#' || u.usuario_id END),
         COUNT(*)::int,
         COALESCE(SUM(u.entrada), 0)::bigint,
         COALESCE(SUM(u.salida), 0)::bigint,
         COALESCE(SUM(u.busquedas), 0)::bigint,
         COALESCE(SUM(u.costo), 0)
  FROM ia_uso u
  LEFT JOIN users us ON us.id = u.usuario_id
  WHERE u.fecha >= p_desde
  GROUP BY 1, 2, 3, 4, 5
$$;

REVOKE ALL ON FUNCTION plataforma_uso_ia_detalle(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plataforma_uso_ia_detalle(DATE) TO inventory_app;

COMMIT;
