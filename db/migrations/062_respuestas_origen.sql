-- 062 · De dónde sale cada respuesta publicada desde el sistema (decidido con el dueño, 2026-10-03).
--
-- Solo para conocimiento y mejora del sistema (sin pantalla): por cada respuesta a una pregunta o
-- mensaje de MercadoLibre, si salió de la IA, de una respuesta parecida (las verdes), de una
-- respuesta rápida o la escribió la persona, y si la EDITÓ antes de publicar (base = el texto
-- propuesto; texto = lo publicado). Sirve para medir qué tanto acierta cada ayuda y en qué la corrigen.
--
-- POR EMPRESA (empresa_id + RLS empresa_aislada). Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS respuestas_origen (
  id          SERIAL  PRIMARY KEY,
  empresa_id  INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                REFERENCES empresas(id),
  fecha       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modulo      TEXT    NOT NULL,                  -- preguntas / mensajes
  ref         TEXT    NOT NULL,                  -- id de la pregunta o pack de la conversación
  fuente      TEXT    NOT NULL,                  -- ia / parecida / rapida / propia
  editada     BOOLEAN NOT NULL DEFAULT FALSE,    -- lo publicado difiere de lo propuesto
  base        TEXT,                              -- lo propuesto (null si la escribió la persona)
  texto       TEXT    NOT NULL,                  -- lo publicado
  usuario_id  INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_respuestas_origen_fecha ON respuestas_origen (empresa_id, modulo, fecha);

ALTER TABLE respuestas_origen ENABLE ROW LEVEL SECURITY;
ALTER TABLE respuestas_origen FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 WHERE c.relname = 'respuestas_origen' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON respuestas_origen
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;
GRANT SELECT, INSERT ON respuestas_origen TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE respuestas_origen_id_seq TO inventory_app;

COMMIT;
