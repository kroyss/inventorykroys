-- 024 · Borradores de factura: lo que se va llenando en "Facturar venta" se guarda solo,
-- para continuar después (otra PC u otro usuario) sin perder los datos del cliente.
-- Uno por venta; se borra al emitir la factura (o con "Descartar borrador").
-- Idempotente. Se crea en AMBAS DBs (la UI solo lo muestra en VE).

CREATE TABLE IF NOT EXISTS invoice_drafts (
  sale_id     INTEGER PRIMARY KEY REFERENCES sales(id) ON DELETE CASCADE,
  data        JSONB NOT NULL,
  updated_by  INTEGER REFERENCES users(id),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
