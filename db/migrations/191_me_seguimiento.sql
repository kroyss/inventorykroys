-- 191 (20-11-2026, el dueño): lista de SEGUIMIENTO de órdenes de MercadoEnvíos que esperan pago o guía.
-- Antes las pendientes salían solo de la última traída (resultados.saltadas del último pedido bueno) y la extensión
-- 1.4.0 perdía las que quedaban en la última página leída pero eran más viejas que la fecha de corte (las marcaba
-- «vistas» y no las pedía aparte): p. ej. la venta 2000019671715396 (pagó al día siguiente y nunca entró).
-- Ahora cada orden queda aquí hasta que llega con pago Y guía (o vence a los 7 días), sin depender de una sola traída.
--   · enviada_pedido / vista_pedido: en qué traída se pidió revisar y en cuál volvió. Si se pidió y no volvió
--     (caída de la 1.4.0), caida_at: el latido corre la fecha de corte para que la lista la procese.
-- Rescate: se carga con las saltadas (sin pago ni guía / no leídas) de los pedidos de los últimos 7 días que no
-- están en me_pagos: las que la 1.4.0 dejó caer se vuelven a revisar en la próxima traída.
-- Por empresa: empresa_id + RLS empresa_aislada. Compatible con la versión anterior (solo agrega). Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS me_seguimiento (
  empresa_id      INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                    REFERENCES empresas(id),
  cuenta          TEXT NOT NULL,             -- cuenta de MercadoEnvíos (nombre en el portal; si no se sabe, el perfil)
  orden           TEXT NOT NULL,             -- id de la orden en el portal (_id)
  venta           TEXT,
  fecha_orden     TIMESTAMPTZ,               -- creación de la orden en el portal
  motivo          TEXT NOT NULL,             -- sin_pago_ni_guia | no_leida | nueva_orden
  enviada_pedido  BIGINT,                    -- último pedido en que el latido la mandó a revisar
  vista_pedido    BIGINT,                    -- último pedido en que la extensión la devolvió
  caida_at        TIMESTAMPTZ,               -- se mandó a revisar y no volvió (1.4.0)
  creado_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, cuenta, orden)
);
CREATE INDEX IF NOT EXISTS me_seguimiento_orden ON me_seguimiento (empresa_id, orden);

ALTER TABLE me_seguimiento ENABLE ROW LEVEL SECURITY;
ALTER TABLE me_seguimiento FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 WHERE c.relname = 'me_seguimiento' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON me_seguimiento
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON me_seguimiento TO inventory_app;

-- Avisos del portal que leyó la extensión 1.4.1 (la campanita: «Tienes una nueva orden», «Tienes un nuevo pago»).
-- Para el VIGÍA: si MercadoLibre tiene ventas nuevas de la cuenta y el portal no publicó NINGÚN aviso de ellas, los
-- avisos dejaron de funcionar → la extensión vuelve sola a leer la lista y se avisa al dueño por Telegram.
-- Se guardan 10 días.
CREATE TABLE IF NOT EXISTS me_avisos (
  empresa_id     INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                   REFERENCES empresas(id),
  cuenta         TEXT NOT NULL,
  orden          TEXT NOT NULL,
  tipo           TEXT NOT NULL,             -- pago | orden | otro
  publicado_at   TIMESTAMPTZ,
  visto_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, cuenta, orden, tipo)
);
ALTER TABLE me_avisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE me_avisos FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 WHERE c.relname = 'me_avisos' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON me_avisos
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON me_avisos TO inventory_app;
-- Cuándo el vigía vio que los avisos de ese perfil no funcionan (24 h sin leer por avisos; NULL = funcionan).
ALTER TABLE me_latidos ADD COLUMN IF NOT EXISTS avisos_fallan_at TIMESTAMPTZ;

-- Rescate (corre como postgres, sin RLS): saltadas de los últimos 7 días que todavía no están en me_pagos.
INSERT INTO me_seguimiento (empresa_id, cuenta, orden, venta, fecha_orden, motivo, vista_pedido, caida_at)
SELECT DISTINCT ON (p.empresa_id, COALESCE(NULLIF(v->>'cuenta', ''), e.k), s->>'orden')
       p.empresa_id, COALESCE(NULLIF(v->>'cuenta', ''), e.k), s->>'orden', NULLIF(s->>'venta', ''),
       CASE WHEN s->>'fecha' ~ '^\d{4}-\d{2}-\d{2}T' THEN (s->>'fecha')::timestamptz END,
       s->>'motivo', p.id, NULL::timestamptz
FROM me_pedidos p
CROSS JOIN LATERAL jsonb_each(p.resultados) AS e(k, v)
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(v->'saltadas') = 'array' THEN v->'saltadas' ELSE '[]'::jsonb END) AS s
WHERE p.pedido_at > NOW() - INTERVAL '7 days'
  AND s->>'motivo' IN ('sin_pago_ni_guia', 'no_leida')
  AND s->>'orden' IS NOT NULL
  AND (s->>'fecha' IS NULL OR s->>'fecha' !~ '^\d{4}-\d{2}-\d{2}T' OR (s->>'fecha')::timestamptz > NOW() - INTERVAL '7 days')
  AND NOT EXISTS (SELECT 1 FROM me_pagos m WHERE m.empresa_id = p.empresa_id
                  AND m.venta IN (s->>'orden', COALESCE(s->>'venta', '')) AND m.guia_path IS NOT NULL AND m.comprobante_path IS NOT NULL)
ORDER BY p.empresa_id, COALESCE(NULLIF(v->>'cuenta', ''), e.k), s->>'orden', p.id DESC
ON CONFLICT (empresa_id, cuenta, orden) DO NOTHING;

COMMIT;
