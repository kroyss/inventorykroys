-- 196 · Embudo de /registro (23-11-2026, pedido del dueño: «saber qué pasa al llegar a la web»). Sobre la tabla de
--   visitas de la 128 (GLOBAL, sin empresa): cada fila pasa a ser un EVENTO del visitante, no solo la vista.
--   evento: 'vista' (abrió la página; lo de antes) · 'empezo' (tocó el formulario) · 'error' (envió y el sistema dijo
--   que no; detalle = el mensaje, nunca lo que escribió) · 'salio' (se fue sin registrarse; detalle = el último campo
--   que tocó, segundos = cuánto estuvo) · 'registro' (creó la cuenta).
--   campana = utm_campaign del link (qué anuncio). Lo ve solo el dueño en Plataforma → Hoy.
-- Solo agrega, con default 'vista': la versión anterior sigue insertando vistas igual. Idempotente.
BEGIN;

ALTER TABLE registro_visitas ADD COLUMN IF NOT EXISTS evento   TEXT NOT NULL DEFAULT 'vista';
ALTER TABLE registro_visitas ADD COLUMN IF NOT EXISTS campana  TEXT;
ALTER TABLE registro_visitas ADD COLUMN IF NOT EXISTS detalle  TEXT;
ALTER TABLE registro_visitas ADD COLUMN IF NOT EXISTS segundos INT;
CREATE INDEX IF NOT EXISTS registro_visitas_visitante_idx ON registro_visitas (visitante, creada_at);

COMMIT;
