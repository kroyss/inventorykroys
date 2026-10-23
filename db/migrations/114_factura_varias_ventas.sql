-- 114 · Una factura con varias ventas (23-10): el mismo comprador compra en órdenes separadas (o el dueño junta
-- productos de órdenes distintas) y se factura todo en UNA hoja. La venta principal sigue en invoices.sale_id
-- (todo lo que ya existía no cambia); las demás van aquí. Una venta está facturada si es la principal o una de
-- estas de una factura EMITIDA (anular la factura las libera solas). La regla "una venta, una factura vigente" la
-- cuida POST /api/invoices dentro del candado de numeración. Solo agrega: compatible con la versión anterior.
BEGIN;

CREATE TABLE IF NOT EXISTS invoice_sales (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int REFERENCES empresas(id),
  invoice_id  INTEGER NOT NULL,
  sale_id     INTEGER NOT NULL,
  CONSTRAINT invoice_sales_unica UNIQUE (invoice_id, sale_id),
  CONSTRAINT invoice_sales_empresa_id_key UNIQUE (empresa_id, id),
  CONSTRAINT invoice_sales_invoice_fk FOREIGN KEY (empresa_id, invoice_id) REFERENCES invoices (empresa_id, id) ON DELETE CASCADE,
  CONSTRAINT invoice_sales_sale_fk    FOREIGN KEY (empresa_id, sale_id)    REFERENCES sales (empresa_id, id)
);
CREATE INDEX IF NOT EXISTS idx_invoice_sales_sale ON invoice_sales (empresa_id, sale_id);

ALTER TABLE invoice_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_sales FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 WHERE c.relname = 'invoice_sales' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON invoice_sales
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON invoice_sales TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE invoice_sales_id_seq TO inventory_app;

COMMIT;
