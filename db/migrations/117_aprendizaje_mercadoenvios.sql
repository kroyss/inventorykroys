-- 117 · Aprendizaje: serie 'mercadoenvios' (23-10). La ven solo las empresas con el módulo pagos_me (el video de
-- cómo conectar Pagos MercadoEnvíos). Solo amplía la restricción: compatible con la versión anterior.
BEGIN;
ALTER TABLE aprendizaje_videos DROP CONSTRAINT IF EXISTS aprendizaje_videos_serie_check;
ALTER TABLE aprendizaje_videos ADD CONSTRAINT aprendizaje_videos_serie_check
  CHECK (serie IN ('automatizaciones', 'mercadoenvios', 'inventario'));
COMMIT;
