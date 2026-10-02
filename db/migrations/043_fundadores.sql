-- 043 · Programa Fundadores: solicitudes de vendedores para los 10 primeros cupos.
--
-- Página pública /fundadores (sin login) con 5 preguntas + contacto por Telegram. Cada
-- solicitud se puntúa sola; las de menos de 30 ventas al mes quedan DESCARTADAS en la ronda
-- (el aviso al vendedor es el mismo para todos: así nadie sabe qué respuesta lo dejó afuera).
-- El dueño de la plataforma aprueba desde Plataforma → Fundadores, por tandas (4 + 3 + 3).
--
-- GLOBALES (de la plataforma, no de una empresa): sin empresa_id ni RLS, como `users`.
-- Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS fundadores_tandas (
  numero     INTEGER PRIMARY KEY,           -- 1, 2, 3
  ronda      INTEGER NOT NULL DEFAULT 1,
  cupos      INTEGER NOT NULL,
  abierta    BOOLEAN NOT NULL DEFAULT FALSE,
  abre_texto TEXT                           -- "próxima semana", para la página pública
);
INSERT INTO fundadores_tandas (numero, cupos, abierta, abre_texto) VALUES
  (1, 4, TRUE,  NULL),
  (2, 3, FALSE, 'la semana siguiente'),
  (3, 3, FALSE, 'en dos semanas')
ON CONFLICT (numero) DO NOTHING;

CREATE TABLE IF NOT EXISTS fundadores_solicitudes (
  id           SERIAL PRIMARY KEY,
  ronda        INTEGER NOT NULL DEFAULT 1,
  nombre       TEXT    NOT NULL,
  telegram     TEXT    NOT NULL,            -- sin @, en minúsculas (clave anti-duplicados)
  nick_ml      TEXT,                        -- opcional (+1 punto)
  ventas_mes   TEXT    NOT NULL,            -- '<30' | '30-100' | '100-300' | '300+'
  cuentas      TEXT    NOT NULL,            -- '1' | '2-3' | '4+'
  despacho     TEXT    NOT NULL,            -- 'zoom_tealca' | 'retiro' | 'delivery' | 'otro'
  dolor        TEXT    NOT NULL,            -- varias, separadas por coma: 'preguntas,mensajes_guias,stock,que_vender'
  inventario   TEXT    NOT NULL,            -- 'excel' | 'nada' | 'sistema_basico' | 'facturacion_oficial'
  puntaje      INTEGER NOT NULL,
  estado       TEXT    NOT NULL,            -- 'descartado' | 'calificado' | 'aprobado' | 'rechazado'
  tanda        INTEGER REFERENCES fundadores_tandas(numero),
  sospechosa   TEXT,                        -- motivo si parece la misma persona con otros datos
  ip_hash      TEXT,                        -- sha256 de la IP (no se guarda la IP)
  navegador_id TEXT,                        -- id al azar guardado en el navegador
  user_agent   TEXT,
  ml_verificado JSONB,                      -- lo que devolvió ML al verificar el nick
  notas        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revisada_at  TIMESTAMPTZ,
  CONSTRAINT fundadores_estado_check CHECK (estado IN ('descartado', 'calificado', 'aprobado', 'rechazado'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fundadores_telegram ON fundadores_solicitudes (ronda, telegram);
CREATE INDEX IF NOT EXISTS idx_fundadores_ip ON fundadores_solicitudes (ronda, ip_hash);
CREATE INDEX IF NOT EXISTS idx_fundadores_nav ON fundadores_solicitudes (ronda, navegador_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON fundadores_tandas, fundadores_solicitudes TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE fundadores_solicitudes_id_seq TO inventory_app;

COMMIT;
