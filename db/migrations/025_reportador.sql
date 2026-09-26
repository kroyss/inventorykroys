-- 025 · Reportador conectado: el Reportador de escritorio toma la cola directo del
-- sistema (sin CSV) y devuelve el resultado de CADA mensaje apenas lo envía.
--
--   reporte_estado en despacho_etiquetas:
--     NULL        pendiente
--     ENVIADO     final
--     SIN_CHAT    final (venta cancelada, chat cerrado…): no se reintenta, como el script
--     RECHAZADO   ML rechazó el texto (links): sigue pendiente, hay que corregir la plantilla
--     ERROR       sigue pendiente (se reintenta en la próxima corrida)
--     CSV         se bajó en el CSV para el Reportador viejo: ya no es asunto del conectado
--   reporte_tomado_*: reserva temporal para que dos equipos no tomen la misma cola.
--
-- Idempotente. Tablas en AMBAS DBs; la configuración inicial (cuentas/plantillas de la
-- operación actual) solo en VE.

ALTER TABLE despacho_etiquetas ADD COLUMN IF NOT EXISTS reporte_estado     VARCHAR(10);
ALTER TABLE despacho_etiquetas ADD COLUMN IF NOT EXISTS reporte_detalle    TEXT;
ALTER TABLE despacho_etiquetas ADD COLUMN IF NOT EXISTS reporte_intentos   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE despacho_etiquetas ADD COLUMN IF NOT EXISTS reportado_at       TIMESTAMP;
ALTER TABLE despacho_etiquetas ADD COLUMN IF NOT EXISTS reporte_tomado_por INTEGER;
ALTER TABLE despacho_etiquetas ADD COLUMN IF NOT EXISTS reporte_tomado_at  TIMESTAMP;

CREATE TABLE IF NOT EXISTS reportador_equipos (
  id               SERIAL PRIMARY KEY,
  nombre           TEXT,
  codigo           VARCHAR(12),      -- código de vinculación (una vez, vence)
  codigo_expira    TIMESTAMP,
  token_hash       CHAR(64),         -- sha256 del token; el token solo lo conoce el equipo
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by       INTEGER REFERENCES users(id),
  vinculado_at     TIMESTAMP,
  last_seen_at     TIMESTAMP,
  version          TEXT,
  revocado_at      TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reportador_token  ON reportador_equipos(token_hash) WHERE token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reportador_codigo ON reportador_equipos(codigo)     WHERE codigo IS NOT NULL;

DO $$
DECLARE is_co BOOLEAN := to_regclass('public.colombia_exchange_rates') IS NOT NULL;
BEGIN
  IF to_regclass('public.app_settings') IS NULL OR is_co THEN
    RETURN;
  END IF;
  -- Cuentas: el Reportador asigna cada envío a la cuenta cuyo `filtro` es el comienzo
  -- del remitente de la etiqueta (igual que CUENTAS en main_reportador.py).
  INSERT INTO app_settings(key, value) VALUES ('reportador_cuentas',
    '[{"nombre":"SOLUCION-MC","filtro":"SOLUCIONES","pagina":"https://www.mercadolibre.com.ve/pagina/soluciones_mc"},'
    '{"nombre":"PIKEKE","filtro":"MARCOS","pagina":"https://www.mercadolibre.com.ve/pagina/pikeke"}]')
  ON CONFLICT (key) DO NOTHING;
  -- Plantillas: {guia} y {pagina}. Se elige una al azar por mensaje (anti-bot).
  INSERT INTO app_settings(key, value) VALUES ('reportador_plantillas',
    '["Buenos días, hoy se realizó su envío. La guía ZOOM es: {guia}",'
    '"Buen día, su pedido fue despachado hoy. Guía ZOOM: {guia}",'
    '"Hola, su paquete fue enviado hoy. El número de guía ZOOM es: {guia}",'
    '"Buenos días, su pedido ya está en camino. Guía de rastreo ZOOM: {guia}",'
    '"Buen día, confirmamos el despacho de su pedido. Guía ZOOM: {guia}"]')
  ON CONFLICT (key) DO NOTHING;
  -- Bloque que se agrega al final de TODAS las plantillas (BLOQUE_PROMO del script).
  INSERT INTO app_settings(key, value) VALUES ('reportador_bloque',
    E'\n\nOfertas y cupones -> {pagina}\n\n¿Vendes o quieres vender en Mercadolibre? Únete a nuestra Comunidad de Vendedores ↓\nTelegram: https://t.me/comerciantedigitalve\nYoutube: https://www.youtube.com/@elcomerciantedigital')
  ON CONFLICT (key) DO NOTHING;
END $$;
