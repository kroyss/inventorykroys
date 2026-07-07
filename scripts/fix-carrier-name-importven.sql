-- Corrección puntual de nombre de transportista mal tipeado: IMPORTVEN → IMPORT2VEN
-- Afecta import_orders.origin_country (campo "Transportista" en la UI) y, por si
-- se llegó a usar ahí también, import_containers.origin_country.
-- Idempotente (WHERE exacto; correr de nuevo no hace nada si ya no queda "IMPORTVEN").
-- Correr en la DB donde exista el dato (probablemente solo VE).

UPDATE import_orders     SET origin_country = 'IMPORT2VEN' WHERE origin_country = 'IMPORTVEN';
UPDATE import_containers SET origin_country = 'IMPORT2VEN' WHERE origin_country = 'IMPORTVEN';
