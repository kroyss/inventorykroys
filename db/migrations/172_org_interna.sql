-- 172 (12-11-2026, el dueño): cuentas INTERNAS (EmpresaPruebas, DEMO): no pagan ni pagarán. Nunca vencen y no suman
-- en pagos, ingresos ni clientes de Plataforma. Por dentro se ven igual que un cliente (mismos módulos y créditos).
-- Solo agrega. Idempotente.
ALTER TABLE organizaciones ADD COLUMN IF NOT EXISTS interna BOOLEAN NOT NULL DEFAULT FALSE;

-- EmpresaPruebas (org 3) y DEMO (org 9) son internas.
UPDATE organizaciones SET interna = TRUE WHERE (id = 3 AND nombre = 'EmpresaPruebas') OR (id = 9 AND nombre = 'DEMO');

-- El pago de prueba de EmpresaPruebas no entró de verdad: fuera de la lista de pagos (los créditos de IA se quedan:
-- ia_creditos.pago_id queda NULL por la FK ON DELETE SET NULL). También su cobro.
DELETE FROM organizacion_cobros WHERE organizacion_id = 3 AND EXISTS (SELECT 1 FROM organizaciones WHERE id = 3 AND interna);
DELETE FROM organizacion_pagos WHERE organizacion_id = 3 AND EXISTS (SELECT 1 FROM organizaciones WHERE id = 3 AND interna);
