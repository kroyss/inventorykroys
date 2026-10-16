-- 094 · Promociones de MercadoLibre, Fase 1: SOLO LECTURA (2026-10-16, decidido con el dueño).
-- Módulo `promociones` (Inventario → Productos → Promociones), solo empresas con inventario, VE.
--
--   me_productos           publicaciones del portal de MercadoEnvíos con su PESO (el que manda para el
--                          envío gratis) y transportistas; las trae la extensión de Pagos ME en cada traída
--   ml_promociones_cache   foto de las campañas de ML y sus publicaciones (seller-promotions), por cuenta;
--                          se renueva con "Actualizar desde MercadoLibre" (no hay que pegarle a ML en cada vista)
-- Envío gratis por transportista (ZOOM / TEALCA): tablas en lib/mlShipping.ts.
-- Compatible con la versión anterior (solo agrega). Idempotente. Primero staging, después producción.
BEGIN;

CREATE TABLE IF NOT EXISTS me_productos (
  empresa_id     INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                   REFERENCES empresas(id),
  publicacion    TEXT NOT NULL,              -- MLV1029708738 (como lo da el portal)
  cuenta         TEXT,                       -- cuenta de MercadoEnvíos (perfil del vigilante)
  titulo         TEXT,
  peso_kg        NUMERIC(10,3),
  estado         TEXT,                       -- active / paused / … del portal
  agencias       TEXT[],                     -- transportistas habilitados en el portal (ZOOM, Tealca, …)
  actualizado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, publicacion)
);

CREATE TABLE IF NOT EXISTS ml_promociones_cache (
  empresa_id     INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                   REFERENCES empresas(id),
  conexion_id    INTEGER NOT NULL,
  datos          JSONB NOT NULL,             -- { campanas: [...], items: [...] } (lib/promocionesML.ts)
  error          TEXT,
  actualizado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, conexion_id)
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['me_productos', 'ml_promociones_cache'] LOOP
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

-- Pesos en la traída de Pagos ME: la primera del día los trae (o la pedida con "Actualizar pesos").
ALTER TABLE me_pedidos ADD COLUMN IF NOT EXISTS pesos BOOLEAN NOT NULL DEFAULT FALSE;

-- Módulo prendido solo para la empresa de la plataforma (SolucionesMC VE).
UPDATE empresas SET modulos = array_append(modulos, 'promociones')
WHERE id = 1 AND NOT ('promociones' = ANY (modulos));

COMMIT;
