-- 073 · Plataforma → uso de cada cliente: si conectó MercadoLibre y cuánto usa cada herramienta.
--
-- uso_acciones (POR EMPRESA, RLS): lo que hace el cliente desde el sistema y no queda registrado en
-- otra tabla: calificar ventas y cambiar stock en MercadoLibre. Lo demás ya existe:
--   preguntas respondidas y mensajes enviados desde el sistema → respuestas_origen
--   etiquetas impresas → despacho_etiquetas.impresa · guías reportadas → reporte_estado 'ENVIADO'
--
-- plataforma_uso_clientes(): una fila por empresa con los totales y lo de los últimos 7 días
-- (SECURITY DEFINER, como plataforma_uso_ia: lo lee solo el dueño de la plataforma). Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS uso_acciones (
  id         BIGSERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
               REFERENCES empresas(id),
  tipo       TEXT    NOT NULL CHECK (tipo IN ('calificacion', 'stock')),
  cantidad   INTEGER NOT NULL DEFAULT 1,
  fecha      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_uso_acciones ON uso_acciones (empresa_id, fecha);

ALTER TABLE uso_acciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE uso_acciones FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 WHERE c.relname = 'uso_acciones' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON uso_acciones
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;
GRANT SELECT, INSERT ON uso_acciones TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE uso_acciones_id_seq TO inventory_app;

CREATE OR REPLACE FUNCTION plataforma_uso_clientes()
RETURNS TABLE (empresa_id INTEGER, cuentas TEXT, conectada_at TIMESTAMPTZ,
               preguntas INTEGER, preguntas_7d INTEGER, mensajes INTEGER, mensajes_7d INTEGER,
               etiquetas INTEGER, etiquetas_7d INTEGER, reportadas INTEGER, reportadas_7d INTEGER,
               calificadas INTEGER, calificadas_7d INTEGER, stock INTEGER, stock_7d INTEGER,
               ultima_actividad TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH r AS (
    SELECT o.empresa_id,
           COUNT(*) FILTER (WHERE o.modulo = 'preguntas')::int AS preguntas,
           COUNT(*) FILTER (WHERE o.modulo = 'preguntas' AND o.fecha > NOW() - INTERVAL '7 days')::int AS preguntas_7d,
           COUNT(*) FILTER (WHERE o.modulo = 'mensajes')::int AS mensajes,
           COUNT(*) FILTER (WHERE o.modulo = 'mensajes' AND o.fecha > NOW() - INTERVAL '7 days')::int AS mensajes_7d,
           MAX(o.fecha) AS ultima
    FROM respuestas_origen o GROUP BY 1
  ), d AS (
    SELECT e.empresa_id,
           COUNT(*) FILTER (WHERE e.impresa)::int AS etiquetas,
           COUNT(*) FILTER (WHERE e.impresa AND e.created_at > NOW() - INTERVAL '7 days')::int AS etiquetas_7d,
           COUNT(*) FILTER (WHERE e.reporte_estado = 'ENVIADO')::int AS reportadas,
           COUNT(*) FILTER (WHERE e.reporte_estado = 'ENVIADO' AND e.reportado_at > NOW() - INTERVAL '7 days')::int AS reportadas_7d,
           GREATEST(MAX(e.created_at), MAX(e.reportado_at)) AS ultima
    FROM despacho_etiquetas e GROUP BY 1
  ), a AS (
    SELECT u.empresa_id,
           COALESCE(SUM(u.cantidad) FILTER (WHERE u.tipo = 'calificacion'), 0)::int AS calificadas,
           COALESCE(SUM(u.cantidad) FILTER (WHERE u.tipo = 'calificacion' AND u.fecha > NOW() - INTERVAL '7 days'), 0)::int AS calificadas_7d,
           COALESCE(SUM(u.cantidad) FILTER (WHERE u.tipo = 'stock'), 0)::int AS stock,
           COALESCE(SUM(u.cantidad) FILTER (WHERE u.tipo = 'stock' AND u.fecha > NOW() - INTERVAL '7 days'), 0)::int AS stock_7d,
           MAX(u.fecha) AS ultima
    FROM uso_acciones u GROUP BY 1
  ), c AS (
    SELECT x.empresa_id,
           string_agg(x.nickname || CASE WHEN x.estado = 'activa' THEN '' ELSE ' (' || x.estado || ')' END, ', ' ORDER BY x.created_at) AS cuentas,
           MIN(x.created_at) AS conectada_at
    FROM ml_conexiones x GROUP BY 1
  )
  SELECT e.id, c.cuentas, c.conectada_at,
         COALESCE(r.preguntas, 0), COALESCE(r.preguntas_7d, 0), COALESCE(r.mensajes, 0), COALESCE(r.mensajes_7d, 0),
         COALESCE(d.etiquetas, 0), COALESCE(d.etiquetas_7d, 0), COALESCE(d.reportadas, 0), COALESCE(d.reportadas_7d, 0),
         COALESCE(a.calificadas, 0), COALESCE(a.calificadas_7d, 0), COALESCE(a.stock, 0), COALESCE(a.stock_7d, 0),
         GREATEST(r.ultima, d.ultima, a.ultima)
  FROM empresas e
  LEFT JOIN c ON c.empresa_id = e.id
  LEFT JOIN r ON r.empresa_id = e.id
  LEFT JOIN d ON d.empresa_id = e.id
  LEFT JOIN a ON a.empresa_id = e.id
$$;
REVOKE ALL ON FUNCTION plataforma_uso_clientes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plataforma_uso_clientes() TO inventory_app;

COMMIT;
