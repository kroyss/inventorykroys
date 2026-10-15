-- 092: "En línea" de verdad (2026-10-15). components/layout/ActividadReal.tsx · app/api/actividad
--
-- users.ultima_actividad se marca con CUALQUIER pedido con sesión, y la campanita de avisos consulta
-- cada minuto: una pestaña abierta y olvidada salía "en línea" todo el día. ultimo_uso se marca solo
-- cuando la persona hace algo (toca, escribe, cambia de pantalla) con la pestaña a la vista.
-- Plataforma muestra "En línea" con ultimo_uso y "Abierto (sin usar)" si solo hay ultima_actividad.
-- Idempotente.

ALTER TABLE users ADD COLUMN IF NOT EXISTS ultimo_uso TIMESTAMPTZ;

-- Adopción por cliente (Plataforma → Clientes): de cada cosa, cuánto se hace EN el sistema y cuánto hay en
-- total en MercadoLibre, en los últimos p_dias. SECURITY DEFINER como plataforma_uso_clientes (073): lee
-- todas las empresas saltando RLS; solo la llama la ruta de Plataforma (dueño de la plataforma).
CREATE OR REPLACE FUNCTION plataforma_adopcion(p_dias INTEGER)
RETURNS TABLE (empresa_id INTEGER, ventas INTEGER, preguntas INTEGER, preguntas_sistema INTEGER,
               guias INTEGER, reportadas INTEGER, calificadas INTEGER, calificadas_sistema INTEGER,
               mensajes_sistema INTEGER, stock INTEGER, ia INTEGER, usuarios_7d INTEGER,
               ultimo_uso TIMESTAMPTZ, abierta_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH desde AS (SELECT NOW() - make_interval(days => p_dias) AS t)
  SELECT e.id,
    (SELECT COUNT(*) FROM ml_ordenes o, desde WHERE o.empresa_id = e.id AND o.fecha > desde.t AND COALESCE(o.estado, '') <> 'cancelled')::int,
    (SELECT COUNT(*) FROM ml_preguntas p, desde WHERE p.empresa_id = e.id AND p.respuesta_fecha > desde.t)::int,
    (SELECT COUNT(*) FROM ml_preguntas p, desde WHERE p.empresa_id = e.id AND p.respuesta_fecha > desde.t AND p.respondida_por IS NOT NULL)::int,
    (SELECT COUNT(*) FROM despacho_etiquetas g, desde WHERE g.empresa_id = e.id AND g.impresa AND g.created_at > desde.t)::int,
    (SELECT COUNT(*) FROM despacho_etiquetas g, desde WHERE g.empresa_id = e.id AND g.reportado_at > desde.t)::int,
    (SELECT COUNT(*) FROM ml_ordenes o, desde WHERE o.empresa_id = e.id AND o.fecha > desde.t AND o.cal_vendedor IS NOT NULL)::int,
    (SELECT COALESCE(SUM(u.cantidad), 0) FROM uso_acciones u, desde WHERE u.empresa_id = e.id AND u.tipo = 'calificacion' AND u.fecha > desde.t)::int,
    (SELECT COUNT(*) FROM respuestas_origen r, desde WHERE r.empresa_id = e.id AND r.modulo = 'mensajes' AND r.fecha > desde.t)::int,
    (SELECT COALESCE(SUM(u.cantidad), 0) FROM uso_acciones u, desde WHERE u.empresa_id = e.id AND u.tipo = 'stock' AND u.fecha > desde.t)::int,
    (SELECT COUNT(*) FROM ia_uso i, desde WHERE i.empresa_id = e.id AND i.fecha > desde.t AND i.modulo IN ('preguntas', 'mensajes'))::int,
    (SELECT COUNT(DISTINCT x.id) FROM usuario_empresas ue JOIN users x ON x.id = ue.user_id
      WHERE ue.empresa_id = e.id AND x.is_active AND x.ultimo_uso > NOW() - INTERVAL '7 days')::int,
    (SELECT MAX(x.ultimo_uso) FROM usuario_empresas ue JOIN users x ON x.id = ue.user_id WHERE ue.empresa_id = e.id),
    (SELECT MAX(x.ultima_actividad) FROM usuario_empresas ue JOIN users x ON x.id = ue.user_id WHERE ue.empresa_id = e.id)
  FROM empresas e
  WHERE e.is_active
$$;
REVOKE ALL ON FUNCTION plataforma_adopcion(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plataforma_adopcion(INTEGER) TO inventory_app;
