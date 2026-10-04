-- 066 · Créditos de IA: punto de partida por empresa + el dueño también con tope (2026-10-04).
--
-- El dueño de la plataforma pidió usar el MISMO sistema de créditos que los Fundadores (100 al
-- mes) para ver cómo funciona, contando desde ahora: lo gastado antes en el mes (fichas y pruebas)
-- no se le descuenta. ia_creditos_desde = desde cuándo cuentan los créditos de este mes (NULL =
-- desde el día 1). cupoIA cuenta desde el MAYOR entre el día 1 del mes y este valor, así que el
-- mes que viene vuelve solo al día 1. El tope del dueño ya no se ignora (se edita en Plataforma →
-- Empresas como el de cualquiera; vacío = sin límite).
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS ia_creditos_desde TIMESTAMPTZ;

UPDATE empresas SET ia_creditos_desde = NOW(), ia_limite_mes = COALESCE(ia_limite_mes, 100)
WHERE organizacion_id = (SELECT id FROM organizaciones WHERE estado = 'propietario' ORDER BY id LIMIT 1);
