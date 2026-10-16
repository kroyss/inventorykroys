-- 095 · Novedades (2026-10-16, decidido con el dueño): lo que mejoramos en el sistema, para que los clientes
-- se enteren sin interrumpirlos. Megáfono en la barra de arriba (en el celular, "Más" → Novedades) con un
-- puntito cuando hay algo que esa persona no vio; panel con las novedades de la más nueva a la más vieja.
--   novedades                 GLOBAL (las escribe el dueño en Plataforma → Interno → Novedades); `modulo`
--                             dice a quién le sirve (NULL = a todos): solo la ven las empresas con ese módulo
--   users.novedades_vistas_at hasta cuándo vio cada persona (el puntito sale con lo publicado después)
-- Compatible con la versión anterior (solo agrega). Idempotente. Primero staging, después producción.
BEGIN;

CREATE TABLE IF NOT EXISTS novedades (
  id            SERIAL PRIMARY KEY,
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,     -- la que se muestra
  titulo        TEXT NOT NULL,                          -- la sección: "Mensajes", "Telegram", …
  texto         TEXT NOT NULL,                          -- una o dos líneas
  modulo        TEXT,                                   -- NULL = todos; si no, solo empresas con ese módulo
  enlace        TEXT,                                   -- a qué pantalla lleva ("/mensajes")
  publicada_at  TIMESTAMPTZ,                            -- NULL = borrador (solo se ve en Plataforma)
  creada_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_novedades_publicada ON novedades (publicada_at DESC) WHERE publicada_at IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON novedades TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE novedades_id_seq TO inventory_app;

ALTER TABLE users ADD COLUMN IF NOT EXISTS novedades_vistas_at TIMESTAMPTZ;

-- Borradores con lo de la semana del 12 al 16 de octubre (el dueño los revisa y publica).
INSERT INTO novedades (fecha, titulo, texto, modulo, enlace)
SELECT v.fecha::date, v.titulo, v.texto, v.modulo, v.enlace
FROM (VALUES
  ('2026-10-13', 'Mensajes', 'Ahora ves la foto del producto en cada conversación y en la lista. El sobre azul marca lo que no has leído.', 'preguntas', '/mensajes'),
  ('2026-10-14', 'Mensajes', 'El buscador también encuentra palabras dentro de lo que se habló y en tus notas.', 'preguntas', '/mensajes'),
  ('2026-10-14', 'Mensajes', 'Ves el precio en dólares junto a los Bs, y la ficha de la publicación (fotos, stock y variantes) sin salir del chat.', 'preguntas', '/mensajes'),
  ('2026-10-15', 'Mensajes', 'Nuevo botón para pedirle la calificación al comprador.', 'preguntas', '/mensajes'),
  ('2026-10-13', 'Respuestas rápidas', 'Escribe #palabra para poner el link de otra publicación tuya. Y las rápidas aprenden solas qué palabras llevan a cada una.', 'preguntas', '/preguntas'),
  ('2026-10-15', 'Calificaciones', 'En «Me calificaron» ves negativas y neutrales por separado, puedes pedir el cambio y ver cómo terminó.', 'preguntas', '/calificaciones'),
  ('2026-10-15', 'Calificaciones', 'Elige a qué hora se hace la calificación automática del día.', 'preguntas', '/calificaciones'),
  ('2026-10-13', 'Stock', 'El aviso cuenta solo lo agotado de los últimos 7 días, y con «No hay, quitar» lo sacas de la lista.', 'alertas_stock', '/alertas-stock'),
  ('2026-10-13', 'Reportador', 'Botón «Restablecer» en cada mensaje para volver al texto guardado.', 'reportador', '/reportador'),
  ('2026-10-16', 'Telegram', 'El sistema te avisa al celular: preguntas y mensajes sin responder, negativas, agotadas, guías sin reportar y un resumen cada mañana. Actívalo en tu nombre → Mis avisos.', NULL, '/mis-avisos'),
  ('2026-10-13', 'Más rápido y sin cortes', 'Las actualizaciones ya no cortan tu trabajo: si hay una versión nueva te avisamos para recargar.', NULL, NULL)
) AS v(fecha, titulo, texto, modulo, enlace)
WHERE NOT EXISTS (SELECT 1 FROM novedades);

COMMIT;
