-- ════════════════════════════════════════════════════════════════════════════
-- Multiempresa · 04 · Funciones para accesos SIN sesión
--
-- El Reportador de escritorio no tiene sesión: se identifica con su token (o, al
-- vincularse, con un código de un solo uso). Antes de saber de qué empresa es, hay que
-- buscarlo en reportador_equipos, que tiene RLS. Estas funciones hacen SOLO esa búsqueda
-- con permisos del dueño (SECURITY DEFINER, saltan RLS) y devuelven la empresa; todo lo
-- demás se hace después con la conexión de esa empresa.
--
-- Idempotente (CREATE OR REPLACE). Se corre como postgres.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION reportador_empresa_por_token(p_token_hash TEXT)
RETURNS TABLE (empresa_id INTEGER, country VARCHAR)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT q.empresa_id, e.country
  FROM reportador_equipos q JOIN empresas e ON e.id = q.empresa_id
  WHERE q.token_hash = p_token_hash AND q.revocado_at IS NULL AND e.is_active
$$;

CREATE OR REPLACE FUNCTION reportador_empresa_por_codigo(p_codigo TEXT)
RETURNS TABLE (empresa_id INTEGER, country VARCHAR)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT q.empresa_id, e.country
  FROM reportador_equipos q JOIN empresas e ON e.id = q.empresa_id
  WHERE q.codigo = p_codigo AND q.codigo_expira > NOW() AND q.revocado_at IS NULL
    AND q.token_hash IS NULL AND e.is_active
$$;

REVOKE ALL ON FUNCTION reportador_empresa_por_token(TEXT), reportador_empresa_por_codigo(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reportador_empresa_por_token(TEXT), reportador_empresa_por_codigo(TEXT) TO inventory_app;

COMMIT;
