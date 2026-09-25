-- 022 · Módulo Despachos: jornadas, lotes y etiquetas de Mercado Envíos (solo VE en la UI).
--
-- Reemplaza el ciclo de los scripts de mote (datos.xlsx → EtiquetasML → UnirGuias →
-- Manifiesto): el operador sube los PDFs crudos de Mercado Envíos, el sistema los cruza
-- con sus propias ventas (nombre interno + nota) y arma el PDF 4xA4 con el servicio
-- `inventory_etiquetas` (mismo código que EtiquetasML, validado pixel a pixel).
--
--   jornada  = lo que hoy acumula ENVIO_ACTIVO.csv hasta que se genera el manifiesto.
--   lote     = cada tanda de impresión (16h, 20h, 7h…). PENDIENTE mientras se revisa; al
--              GENERAR entra a la jornada abierta (jornada_id NULL hasta entonces).
--   etiqueta = un PDF de Mercado Envíos. `impresa` + índice único parcial por guía
--              reemplaza el control de duplicados de los CSV.
--
-- Idempotente. Se crea en AMBAS DBs (la UI solo lo muestra en VE).

CREATE TABLE IF NOT EXISTS despacho_jornadas (
  id             SERIAL PRIMARY KEY,
  status         VARCHAR(10) NOT NULL DEFAULT 'ABIERTA'
                 CHECK (status IN ('ABIERTA', 'CERRADA')),
  opened_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  opened_by      INTEGER REFERENCES users(id),
  closed_at      TIMESTAMP,
  closed_by      INTEGER REFERENCES users(id),
  manifest_path  TEXT,
  total_envios   INTEGER
);
-- Una sola jornada abierta a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS uq_despacho_jornada_abierta
  ON despacho_jornadas ((TRUE)) WHERE status = 'ABIERTA';

CREATE TABLE IF NOT EXISTS despacho_lotes (
  id            SERIAL PRIMARY KEY,
  jornada_id    INTEGER REFERENCES despacho_jornadas(id),
  status        VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE'
                CHECK (status IN ('PENDIENTE', 'GENERADO', 'DESCARTADO')),
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by    INTEGER REFERENCES users(id),
  generated_at  TIMESTAMP,
  generated_by  INTEGER REFERENCES users(id),
  output_path   TEXT,
  label_count   INTEGER,
  page_count    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_despacho_lotes_jornada ON despacho_lotes(jornada_id);
CREATE INDEX IF NOT EXISTS idx_despacho_lotes_status  ON despacho_lotes(status);

CREATE TABLE IF NOT EXISTS despacho_etiquetas (
  id                SERIAL PRIMARY KEY,
  lote_id           INTEGER NOT NULL REFERENCES despacho_lotes(id) ON DELETE CASCADE,
  original_name     TEXT NOT NULL,
  file_path         TEXT NOT NULL,
  sha256            CHAR(64) NOT NULL,
  page_count        INTEGER,
  venta             VARCHAR(30),
  guia              VARCHAR(30),
  remitente         TEXT,          -- tal cual el PDF (va al CSV del Reportador)
  remitente_limpio  TEXT,          -- sin acentos (va al manifiesto)
  destinatario      TEXT,          -- sin acentos (va al manifiesto)
  read_error        TEXT,
  incluida          BOOLEAN NOT NULL DEFAULT TRUE,
  impresa           BOOLEAN NOT NULL DEFAULT FALSE,
  sale_id           INTEGER REFERENCES sales(id),   -- se fija al generar
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_despacho_etiquetas_lote  ON despacho_etiquetas(lote_id);
CREATE INDEX IF NOT EXISTS idx_despacho_etiquetas_venta ON despacho_etiquetas(venta);
-- Una guía se imprime una sola vez (la reimpresión es volver a bajar el PDF del lote).
CREATE UNIQUE INDEX IF NOT EXISTS uq_despacho_guia_impresa
  ON despacho_etiquetas(guia) WHERE impresa;

-- reimpresion: la venta ya estaba DESCARGADA al generar (p.ej. salió por el flujo viejo de
--   Excel, cuyo Reportador ya le escribió al comprador). No va al CSV del Reportador, igual
--   que EtiquetasML no re-encolaba guías ya reportadas.
ALTER TABLE despacho_etiquetas ADD COLUMN IF NOT EXISTS reimpresion BOOLEAN NOT NULL DEFAULT FALSE;
-- bot_csv_at: cuándo se bajó el CSV del Reportador (bajarlo dos veces = mensajes repetidos).
ALTER TABLE despacho_jornadas  ADD COLUMN IF NOT EXISTS bot_csv_at TIMESTAMP;

-- Nombre del remitente en el encabezado del manifiesto (antes fijo en el script).
DO $$
BEGIN
  IF to_regclass('public.app_settings') IS NOT NULL THEN
    INSERT INTO app_settings(key, value) VALUES ('despacho_remitente', 'Marcos Contreras')
    ON CONFLICT (key) DO NOTHING;
  END IF;
END $$;
