-- 030 · Despachos: guía FINAL de Tealca.
--
-- La etiqueta Tealca trae la PRE-GUÍA (generada por Mercado Envíos, columna `guia`).
-- La guía real que sirve para rastrear la genera Tealca después y llega por correo /
-- WhatsApp. Se escribe a mano en la pantalla "Guías Tealca" y es la que el Reportador
-- le manda al comprador. Un envío TEALCA sin guía final NO entra a la cola del
-- Reportador; los ZOOM entran como siempre (su `guia` ya es la real).
--
-- Idempotente. Se aplica en AMBAS DBs (la UI de Despachos solo se muestra en VE).

ALTER TABLE despacho_etiquetas ADD COLUMN IF NOT EXISTS guia_final VARCHAR(20);

-- Una guía final no se repite entre envíos (protege de un error de tipeo o una fila corrida).
CREATE UNIQUE INDEX IF NOT EXISTS uq_despacho_guia_final
  ON despacho_etiquetas(guia_final) WHERE guia_final IS NOT NULL;

-- Largo exigido de la guía final de Tealca (editable en la pantalla "Guías Tealca").
DO $$
BEGIN
  IF to_regclass('public.app_settings') IS NOT NULL THEN
    INSERT INTO app_settings(key, value) VALUES ('tealca_guia_digitos', '8')
    ON CONFLICT (key) DO NOTHING;
  END IF;
END $$;
