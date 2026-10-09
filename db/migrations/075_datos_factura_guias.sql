-- 075: datos del comprador para facturar, leídos de la guía ZOOM/TEALCA al subirla en Despachos (2026-10-09).
--   fac_documento  solo números del RIF/C.I. (ZOOM "V-12649394" → 12649394; TEALCA ya viene sin letra)
--   fac_telefono   el primero, formato 04XXXXXXXXX (TEALCA "58-0412…" → 0412…)
--   fac_ciudad     ZOOM: el bloque antes del estado ("…; CIUDAD; ESTADO; VENEZUELA"); TEALCA: CIUDAD DESTINO
--   fac_direccion  ZOOM: entre "Destino:" y "; PARROQUIA" (sin "- N/D" ni la repetición); TEALCA: Dirección
-- Vacío (NULL) = no se pudo leer con seguridad: se revisa a mano en "Facturar venta".
-- Idempotente. Primero staging, después producción.

ALTER TABLE despacho_etiquetas ADD COLUMN IF NOT EXISTS fac_documento text;
ALTER TABLE despacho_etiquetas ADD COLUMN IF NOT EXISTS fac_telefono  text;
ALTER TABLE despacho_etiquetas ADD COLUMN IF NOT EXISTS fac_ciudad    text;
ALTER TABLE despacho_etiquetas ADD COLUMN IF NOT EXISTS fac_direccion text;
