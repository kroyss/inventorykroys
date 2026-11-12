-- 169 · Gasto TOTAL de IA (12-11-2026, pedido del dueño: "tener a detalle lo que pago de tokens").
-- Cada llamada que se hace a Anthropic (lib/ia.ts → llamarClaude) suma aquí, ANTES de leer la respuesta: así cuenta
-- también lo que no termina guardado en ia_uso (borradores que fallan, pruebas internas, Ayuda). Plataforma → Interno
-- lo compara con lo asignado a cada cuenta (ia_uso + ayuda_consultas) para ver si algo se escapa.
-- GLOBAL (sin empresa_id/RLS, como ayuda_consultas). Solo agrega una tabla: compatible con la versión anterior.
CREATE TABLE IF NOT EXISTS ia_gasto (
  dia       DATE NOT NULL,
  modelo    TEXT NOT NULL,
  tipo      TEXT NOT NULL,              -- 'cuenta' (uso normal) | 'interna' (pruebas del dueño: Competencia, comparadores)
  llamadas  INTEGER NOT NULL DEFAULT 0,
  entrada   BIGINT NOT NULL DEFAULT 0,
  salida    BIGINT NOT NULL DEFAULT 0,
  busquedas INTEGER NOT NULL DEFAULT 0,
  fallidas  INTEGER NOT NULL DEFAULT 0, -- respondió pero sin borrador utilizable (igual se paga)
  costo     NUMERIC(12,6) NOT NULL DEFAULT 0,
  primera   TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- cuándo se anotó la primera llamada de la fila (inicio del registro)
  PRIMARY KEY (dia, modelo, tipo)
);
GRANT SELECT, INSERT, UPDATE ON ia_gasto TO inventory_app;

-- Detalle del COSTO real por empresa (Plataforma → Interno). Igual que plataforma_uso_ia_detalle (mig. 070) pero SIN
-- cortar en ia_creditos_desde: ese corte es para los créditos del cliente; para lo que se paga cuenta todo.
CREATE OR REPLACE FUNCTION plataforma_ia_costo_detalle(p_desde DATE)
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
  WHERE u.fecha >= (p_desde::timestamp AT TIME ZONE 'America/Caracas')
  GROUP BY 1, 2, 3, 4, 5
$$;
REVOKE ALL ON FUNCTION plataforma_ia_costo_detalle(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plataforma_ia_costo_detalle(DATE) TO inventory_app;

-- Lo asignado en ia_uso desde un instante, separado en cuentas e internas: para cuadrar contra ia_gasto.
CREATE OR REPLACE FUNCTION plataforma_ia_asignado(p_desde TIMESTAMPTZ)
RETURNS TABLE (tipo TEXT, costo NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN modulo = 'interna' THEN 'interna' ELSE 'cuenta' END, COALESCE(SUM(costo), 0)
  FROM ia_uso WHERE fecha >= p_desde GROUP BY 1
$$;
REVOKE ALL ON FUNCTION plataforma_ia_asignado(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plataforma_ia_asignado(TIMESTAMPTZ) TO inventory_app;
