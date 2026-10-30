-- 134 · Ayuda con IA + Soporte (30-10-2026, docs/ayuda/sistema.md, lib/ayuda.ts, lib/soporte.ts).
-- La burbuja "¿En qué te ayudo?" responde con el manual (IA barata, costo nuestro) y deja escribir a soporte con
-- capturas. TODO cae en una sola bandeja (Plataforma → Soporte) con su ORIGEN (sistema / radar) y al Telegram del
-- dueño. GLOBALES (sin empresa_id/RLS, como soporte_accesos): las APIs filtran por el usuario de la sesión y solo el
-- dueño de la plataforma ve todo. Solo agrega tablas: compatible con la versión anterior.

-- Cada pregunta a la IA: lo que costó (conteo de gasto, pedido del dueño) y si sirvió.
CREATE TABLE IF NOT EXISTS ayuda_consultas (
  id              BIGSERIAL PRIMARY KEY,
  origen          TEXT NOT NULL DEFAULT 'sistema',
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  empresa_id      INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
  pantalla        TEXT,
  pregunta        TEXT NOT NULL,
  respuesta       TEXT,
  sabia           BOOLEAN,              -- false = el manual no lo cubre (lista de lo que falta en el manual)
  video_id        INTEGER,
  util            SMALLINT,             -- 1 = 👍, -1 = 👎
  modelo          TEXT,
  entrada         INTEGER NOT NULL DEFAULT 0,
  salida          INTEGER NOT NULL DEFAULT 0,
  cache_lectura   INTEGER NOT NULL DEFAULT 0,
  cache_escritura INTEGER NOT NULL DEFAULT 0,
  costo           NUMERIC(10,5) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ayuda_consultas_fecha_idx ON ayuda_consultas (created_at DESC);
CREATE INDEX IF NOT EXISTS ayuda_consultas_user_idx ON ayuda_consultas (user_id, created_at DESC);

-- Un caso de soporte = una conversación con el cliente.
CREATE TABLE IF NOT EXISTS soporte_casos (
  id               BIGSERIAL PRIMARY KEY,
  origen           TEXT NOT NULL DEFAULT 'sistema',
  empresa_id       INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
  user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  pantalla         TEXT,
  navegador        TEXT,
  estado           TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'respondido', 'resuelto')),
  cliente_visto_at TIMESTAMPTZ,         -- la última vez que el cliente abrió el caso (para el punto de "respuesta nueva")
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS soporte_casos_user_idx ON soporte_casos (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS soporte_casos_estado_idx ON soporte_casos (estado, updated_at DESC);

CREATE TABLE IF NOT EXISTS soporte_mensajes (
  id            BIGSERIAL PRIMARY KEY,
  caso_id       BIGINT NOT NULL REFERENCES soporte_casos(id) ON DELETE CASCADE,
  autor         TEXT NOT NULL CHECK (autor IN ('cliente', 'soporte')),
  autor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  texto         TEXT NOT NULL DEFAULT '',
  adjuntos      TEXT[] NOT NULL DEFAULT '{}',   -- nombres de archivo en UPLOAD_DIR/soporte/<caso_id>/
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS soporte_mensajes_caso_idx ON soporte_mensajes (caso_id, id);

-- Qué mensaje de Telegram (del dueño) es de qué caso: al "Responder" en Telegram se sabe a qué caso va.
CREATE TABLE IF NOT EXISTS soporte_telegram (
  chat_id    BIGINT NOT NULL,
  message_id BIGINT NOT NULL,
  caso_id    BIGINT NOT NULL REFERENCES soporte_casos(id) ON DELETE CASCADE,
  PRIMARY KEY (chat_id, message_id)
);

GRANT SELECT, INSERT, UPDATE ON ayuda_consultas, soporte_casos, soporte_mensajes TO inventory_app;
GRANT SELECT, INSERT, DELETE ON soporte_telegram TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE ayuda_consultas_id_seq, soporte_casos_id_seq, soporte_mensajes_id_seq TO inventory_app;
