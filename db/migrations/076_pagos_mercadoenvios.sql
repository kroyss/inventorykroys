-- 076 · Pagos MercadoEnvíos (2026-10-09, decidido con el dueño). Módulo `pagos_me`, SOLO para la
-- empresa de la plataforma (SolucionesMC VE, id 1); apagado para clientes y Fundadores.
--
-- Un "vigilante" (extensión de Chrome en la PC del antiguo Reportador, un perfil por cuenta:
-- PIKEKE y SOLUCION-MC) lee del portal de MercadoEnvíos, con la sesión del propio perfil, las
-- órdenes pagadas de los últimos 7 días: datos del pago, imagen del comprobante y guía PDF. Corre
-- solo cuando alguien toca "Traer pagos y guías" en el sistema (no cada X minutos).
--   me_pagos      un pago por venta: se verifica por lote ("Pagos por verificar")
--   me_pedidos    cada toque de "Traer pagos y guías" (cada perfil anota su resultado)
--   me_latidos    último contacto de cada perfil del vigilante (¿está conectado?)
--   me_vigilante  clave del vigilante (solo el hash; se genera en la pantalla del módulo)
-- Despachos: la guía de una venta con pago SIN verificar no entra al PDF (pago_forzado_* = "Despachar
-- igual", con registro de quién). Idempotente. Primero staging, después producción.
BEGIN;

CREATE TABLE IF NOT EXISTS me_pagos (
  id               BIGSERIAL PRIMARY KEY,
  empresa_id       INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                     REFERENCES empresas(id),
  venta            TEXT NOT NULL,              -- número de venta de MercadoLibre
  cuenta           TEXT,                       -- cuenta de MercadoEnvíos que la trajo (perfil del vigilante)
  estado_me        TEXT,                       -- pending / completed / … (no dice si ya salió: no se usa para filtrar)
  fecha_orden      TIMESTAMPTZ,
  total_orden      NUMERIC(16,2),              -- total de la orden (Bs)
  total_orden_usd  NUMERIC(12,2),
  metodo_pago      TEXT,                       -- mobile_payment / transfer / zelle / binance / …
  banco_emisor     TEXT,
  banco_receptor   TEXT,
  referencia       TEXT,
  fecha_pago       TEXT,
  monto_pagado     NUMERIC(16,2),              -- lo que el portal registra como pagado
  envio_metodo     TEXT,                       -- Envío Gratis / Cobro a destino
  envio_opcion     TEXT,                       -- Retiro en agencia / Entrega a domicilio
  carrier          TEXT,                       -- ZOOM / TEALCA
  guia             TEXT,
  comprobante_path TEXT,
  guia_path        TEXT,
  verificacion     TEXT NOT NULL DEFAULT 'pendiente' CHECK (verificacion IN ('pendiente', 'valido', 'invalido')),
  verificado_por   INTEGER REFERENCES users(id),
  verificado_at    TIMESTAMPTZ,
  nota             TEXT,
  creado_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, venta)
);
CREATE INDEX IF NOT EXISTS idx_me_pagos_verif ON me_pagos (empresa_id, verificacion, fecha_orden DESC);

CREATE TABLE IF NOT EXISTS me_pedidos (
  id          BIGSERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                REFERENCES empresas(id),
  pedido_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pedido_por  INTEGER REFERENCES users(id),
  resultados  JSONB NOT NULL DEFAULT '{}'      -- { perfil: { ok, cuenta, nuevas, error, at } }
);
CREATE INDEX IF NOT EXISTS idx_me_pedidos ON me_pedidos (empresa_id, pedido_at DESC);

CREATE TABLE IF NOT EXISTS me_latidos (
  empresa_id  INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                REFERENCES empresas(id),
  perfil      TEXT NOT NULL,
  visto_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, perfil)
);

CREATE TABLE IF NOT EXISTS me_vigilante (
  empresa_id  INTEGER PRIMARY KEY DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                REFERENCES empresas(id),
  token_hash  TEXT NOT NULL UNIQUE,
  creado_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creado_por  INTEGER REFERENCES users(id)
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['me_pagos', 'me_pedidos', 'me_latidos', 'me_vigilante'] LOOP
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
GRANT USAGE, SELECT ON SEQUENCE me_pagos_id_seq, me_pedidos_id_seq TO inventory_app;

-- El vigilante no tiene sesión: su clave dice de qué empresa es (como el Reportador, 04_funciones.sql).
CREATE OR REPLACE FUNCTION me_vigilante_empresa(p_hash TEXT)
  RETURNS TABLE (empresa_id INTEGER, country TEXT, modulos TEXT[])
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT e.id, e.country::text, e.modulos::text[] FROM me_vigilante v JOIN empresas e ON e.id = v.empresa_id
   WHERE v.token_hash = p_hash $$;
REVOKE ALL ON FUNCTION me_vigilante_empresa(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION me_vigilante_empresa(TEXT) TO inventory_app;

-- "Despachar igual" una guía cuyo pago no está verificado.
ALTER TABLE despacho_etiquetas ADD COLUMN IF NOT EXISTS pago_forzado_por INTEGER REFERENCES users(id);
ALTER TABLE despacho_etiquetas ADD COLUMN IF NOT EXISTS pago_forzado_at  TIMESTAMPTZ;

-- Módulo prendido solo para la empresa de la plataforma.
UPDATE empresas SET modulos = array_append(modulos, 'pagos_me')
WHERE id = 1 AND NOT ('pagos_me' = ANY (modulos));

COMMIT;
