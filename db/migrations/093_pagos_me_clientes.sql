-- 093 · Pagos MercadoEnvíos para clientes (2026-10-15, decidido con el dueño). Hasta ahora era solo de
-- la empresa de la plataforma; ahora se prende a clientes (Fundadores) desde Plataforma, también SIN
-- inventario (las guías van a Despachos con las ventas de MercadoLibre, ver lib/pagosME.ts).
--
-- Conectar una PC sin copiar claves largas: en Pagos ME se genera un CÓDIGO corto (vale 60 min). El
-- programa de la PC y la extensión de cada perfil lo cambian por su propia clave (me_claves). La clave
-- de siempre (me_vigilante) sigue valiendo: la PC que ya estaba conectada no se toca.
--   me_codigos   códigos de conexión (solo el hash), con vencimiento
--   me_claves    claves emitidas al canjear un código (solo el hash); "Desconectar PCs" las borra
--   me_latidos.cuenta  nombre de la cuenta de MercadoEnvíos de ese perfil (para mostrarlo en pantalla)
-- Compatible con la versión anterior (solo agrega). Idempotente. Primero staging, después producción.
BEGIN;

CREATE TABLE IF NOT EXISTS me_codigos (
  codigo_hash TEXT PRIMARY KEY,
  empresa_id  INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                REFERENCES empresas(id),
  vence_at    TIMESTAMPTZ NOT NULL,
  usos        INTEGER NOT NULL DEFAULT 0,
  creado_por  INTEGER REFERENCES users(id),
  creado_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_me_codigos_empresa ON me_codigos (empresa_id);

CREATE TABLE IF NOT EXISTS me_claves (
  token_hash  TEXT PRIMARY KEY,
  empresa_id  INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                REFERENCES empresas(id),
  creado_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_me_claves_empresa ON me_claves (empresa_id);

ALTER TABLE me_latidos ADD COLUMN IF NOT EXISTS cuenta TEXT;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['me_codigos', 'me_claves'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                   WHERE c.relname = t AND p.polname = 'empresa_aislada') THEN
      EXECUTE format($p$CREATE POLICY empresa_aislada ON %I
        USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
        WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)$p$, t);
    END IF;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO inventory_app', t);
  END LOOP;
END $$;

-- La clave del vigilante dice la empresa: la de siempre (me_vigilante) o una emitida con código (me_claves).
CREATE OR REPLACE FUNCTION me_vigilante_empresa(p_hash TEXT)
  RETURNS TABLE (empresa_id INTEGER, country TEXT, modulos TEXT[])
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT e.id, e.country::text, e.modulos::text[] FROM empresas e
   WHERE e.id IN (SELECT v.empresa_id FROM me_vigilante v WHERE v.token_hash = p_hash
                  UNION ALL
                  SELECT k.empresa_id FROM me_claves k WHERE k.token_hash = p_hash)
   LIMIT 1 $$;
REVOKE ALL ON FUNCTION me_vigilante_empresa(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION me_vigilante_empresa(TEXT) TO inventory_app;

-- Canjear un código (sin sesión: lo llama el programa de la PC). Vale hasta su vencimiento y para pocas
-- PCs/perfiles (20 usos); devuelve la empresa para emitir la clave en ella.
CREATE OR REPLACE FUNCTION me_canjear_codigo(p_hash TEXT)
  RETURNS TABLE (empresa_id INTEGER, country TEXT, modulos TEXT[])
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS
$$ WITH c AS (
     UPDATE me_codigos SET usos = usos + 1
     WHERE codigo_hash = p_hash AND vence_at > NOW() AND usos < 20
     RETURNING me_codigos.empresa_id)
   SELECT e.id, e.country::text, e.modulos::text[] FROM empresas e JOIN c ON c.empresa_id = e.id $$;
REVOKE ALL ON FUNCTION me_canjear_codigo(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION me_canjear_codigo(TEXT) TO inventory_app;

COMMIT;
