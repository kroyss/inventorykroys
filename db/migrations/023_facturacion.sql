-- 023 · Facturación (forma libre, solo VE en la UI).
--
-- Reemplaza la plantilla de Excel "FACTURA NNNN.xls": se elige a dedo qué venta se factura,
-- y la factura se guarda como registro propio (datos del cliente, ítems, tasa y montos
-- congelados) para poder reimprimirla idéntica aunque la venta cambie después.
--
--   invoice_customers = clientes con RIF/CI ya facturados (autocompletado). Guarda si es
--                       contribuyente especial y su % de retención de IVA (75/100).
--   invoices          = una fila por número de factura. Las ANULADAS nunca se borran: el
--                       correlativo no puede tener huecos. `replaced_by` apunta a la que la
--                       reemplazó cuando se reimprimió en hoja nueva.
--   invoice_items     = máx. 7 líneas (lo que entra en la hoja), montos en Bs.
--   invoice_files     = comprobante de retención (imagen/PDF) que manda el contribuyente especial.
--
-- Idempotente. Se crea en AMBAS DBs (la UI solo lo muestra en VE).

CREATE TABLE IF NOT EXISTS invoice_customers (
  id                 SERIAL PRIMARY KEY,
  doc_id             VARCHAR(20) NOT NULL UNIQUE,   -- RIF/CI normalizado (J402821280, V12345678)
  name               TEXT NOT NULL,
  address            TEXT,
  phone              VARCHAR(40),
  is_special         BOOLEAN NOT NULL DEFAULT FALSE,
  retention_percent  NUMERIC(5,2) NOT NULL DEFAULT 75,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  id                  SERIAL PRIMARY KEY,
  invoice_number      INTEGER NOT NULL UNIQUE,
  control_number      VARCHAR(30),                   -- N° de control preimpreso de la hoja (opcional)
  sale_id             INTEGER REFERENCES sales(id),
  customer_id         INTEGER REFERENCES invoice_customers(id),
  -- Snapshot de lo impreso (la venta y el cliente pueden cambiar después)
  customer_name       TEXT NOT NULL,
  customer_doc        VARCHAR(20),                   -- vacío = consumidor final
  customer_address    TEXT,
  customer_phone      VARCHAR(40),
  invoice_date        DATE NOT NULL,
  exchange_rate       NUMERIC(14,4) NOT NULL,        -- Bs por USD (BCV) usada para convertir
  with_iva            BOOLEAN NOT NULL DEFAULT TRUE,
  iva_rate            NUMERIC(5,2) NOT NULL DEFAULT 0,
  base_bs             NUMERIC(16,2) NOT NULL,
  iva_bs              NUMERIC(16,2) NOT NULL,
  total_bs            NUMERIC(16,2) NOT NULL,
  -- Retención de IVA (contribuyente especial)
  is_special          BOOLEAN NOT NULL DEFAULT FALSE,
  retention_percent   NUMERIC(5,2) NOT NULL DEFAULT 0,
  retention_bs        NUMERIC(16,2) NOT NULL DEFAULT 0,   -- calculada al emitir
  retention_status    VARCHAR(10) NOT NULL DEFAULT 'NO_APLICA'
                      CHECK (retention_status IN ('NO_APLICA', 'PENDIENTE', 'RECIBIDA')),
  retention_voucher   VARCHAR(30),                   -- N° de comprobante
  retention_date      DATE,
  retention_amount_bs NUMERIC(16,2),                 -- lo que dice el comprobante
  -- Estado
  status              VARCHAR(10) NOT NULL DEFAULT 'EMITIDA'
                      CHECK (status IN ('EMITIDA', 'ANULADA')),
  void_reason         TEXT,
  voided_at           TIMESTAMP,
  voided_by           INTEGER REFERENCES users(id),
  replaced_by         INTEGER REFERENCES invoices(id),
  print_count         INTEGER NOT NULL DEFAULT 0,
  last_printed_at     TIMESTAMP,
  notes               TEXT,
  created_by          INTEGER REFERENCES users(id),
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoices_sale     ON invoices(sale_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date     ON invoices(invoice_date);
-- Una venta tiene a lo sumo una factura vigente (las anuladas no cuentan).
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_sale_emitida
  ON invoices(sale_id) WHERE status = 'EMITIDA';

CREATE TABLE IF NOT EXISTS invoice_items (
  id             SERIAL PRIMARY KEY,
  invoice_id     INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id     INTEGER REFERENCES products(id),
  description    TEXT NOT NULL,
  quantity       NUMERIC(12,2) NOT NULL,
  unit_price_usd NUMERIC(14,2),                    -- referencia (lo impreso es Bs)
  unit_price_bs  NUMERIC(16,2) NOT NULL,
  total_bs       NUMERIC(16,2) NOT NULL,
  position       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

CREATE TABLE IF NOT EXISTS invoice_files (
  id           SERIAL PRIMARY KEY,
  invoice_id   INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  file_name    TEXT NOT NULL,
  file_path    TEXT NOT NULL,
  file_type    VARCHAR(100),
  file_size    INTEGER,
  uploaded_by  INTEGER REFERENCES users(id),
  uploaded_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoice_files_invoice ON invoice_files(invoice_id);

-- Parámetros de facturación (editables en Facturas → Configuración, admin).
--   factura_numero_inicial: número que toma la PRIMERA factura (después, último + 1).
--   factura_iva:            % de IVA por defecto al sumar IVA.
--   factura_offset_x/_y:    corrimiento en mm para calibrar la impresora.
DO $$
BEGIN
  IF to_regclass('public.app_settings') IS NOT NULL THEN
    INSERT INTO app_settings(key, value) VALUES
      ('factura_numero_inicial', '1'),
      ('factura_iva',            '16'),
      ('factura_offset_x',       '0'),
      ('factura_offset_y',       '0')
    ON CONFLICT (key) DO NOTHING;
  END IF;
END $$;
