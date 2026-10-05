-- 070 · Plataforma → Interno cuenta desde el reinicio de créditos (2026-10-05).
-- Decisión del dueño: "olvidamos el pasado y reseteamos de cero". Una empresa con
-- empresas.ia_creditos_desde (migración 066) muestra en Interno SOLO lo usado desde ese momento
-- (créditos, borradores, costo y tokens), igual que su contador de créditos. Las filas de ia_uso
-- no se borran: solo dejan de sumarse aquí.
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
  JOIN empresas e ON e.id = u.empresa_id
  WHERE u.fecha >= p_desde AND (e.ia_creditos_desde IS NULL OR u.fecha >= e.ia_creditos_desde)
  GROUP BY 1, 2, 3
$$;

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
  JOIN empresas e ON e.id = u.empresa_id
  LEFT JOIN users us ON us.id = u.usuario_id
  WHERE u.fecha >= p_desde AND (e.ia_creditos_desde IS NULL OR u.fecha >= e.ia_creditos_desde)
  GROUP BY 1, 2, 3, 4, 5
$$;

COMMIT;
