-- 051 · Aprendizaje: videos de YouTube (no listados) que cada usuario ve DENTRO del sistema, en
-- orden, con su avance. Al completar todos aparece "Agenda tu configuración". Los videos los
-- administra el dueño en Plataforma → Aprendizaje.
--
-- GLOBALES (de la plataforma, sin RLS, como `users`): los videos son los mismos para todas las
-- empresas y el avance es de la PERSONA (users es global). Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS aprendizaje_videos (
  id          SERIAL  PRIMARY KEY,
  orden       INTEGER NOT NULL DEFAULT 0,
  titulo      TEXT    NOT NULL,
  descripcion TEXT,
  youtube_id  TEXT    NOT NULL,          -- el id del video (11 caracteres), no el link
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aprendizaje_progreso (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id      INTEGER NOT NULL REFERENCES aprendizaje_videos(id) ON DELETE CASCADE,
  visto_seg     INTEGER NOT NULL DEFAULT 0,   -- segundos REALMENTE reproducidos (saltar no suma)
  duracion_seg  INTEGER NOT NULL DEFAULT 0,
  posicion_seg  INTEGER NOT NULL DEFAULT 0,   -- dónde quedó (para seguir desde ahí al volver)
  completado_at TIMESTAMPTZ,                  -- al llegar al 80%
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, video_id)
);

ALTER TABLE aprendizaje_progreso ADD COLUMN IF NOT EXISTS posicion_seg INTEGER NOT NULL DEFAULT 0;

-- Ajustes de la plataforma (globales): p. ej. el link de "Agenda tu configuración".
CREATE TABLE IF NOT EXISTS plataforma_ajustes (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON aprendizaje_videos, aprendizaje_progreso, plataforma_ajustes TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE aprendizaje_videos_id_seq TO inventory_app;

COMMIT;
