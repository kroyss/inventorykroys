-- 029 · Despachos: transportista de cada etiqueta (ZOOM o TEALCA).
--
-- Las etiquetas TEALCA (pre-guía de Mercado Envíos) no traen número de venta dentro del
-- PDF (se toma del nombre del archivo) y su guía es el "NRO. PRE-GRUIA" de 6 dígitos.
-- Las existentes son todas ZOOM. El Reportador solo atiende ZOOM (sus mensajes llevan
-- "Guía ZOOM: {guia}"), por eso los envíos TEALCA quedan fuera de su cola.
--
-- Idempotente. Se aplica en AMBAS DBs (la UI de Despachos solo se muestra en VE).

ALTER TABLE despacho_etiquetas ADD COLUMN IF NOT EXISTS carrier VARCHAR(10) NOT NULL DEFAULT 'ZOOM';

-- El manifiesto sale POR TRANSPORTISTA (van a lugares distintos): manifest_path sigue siendo el
-- de ZOOM (y el de todas las jornadas anteriores); el de TEALCA va en su propia columna.
ALTER TABLE despacho_jornadas ADD COLUMN IF NOT EXISTS manifest_tealca_path TEXT;
