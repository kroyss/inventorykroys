-- 126 · ml_pruebas_usadas (mig 125) no dejaba eliminar en Plataforma una organización que ya conectó ML (la FK la
--   seguía apuntando). Ahora, al eliminarla, el registro de la cuenta de ML se conserva SIN dueño (organizacion_id NULL):
--   esa cuenta de ML sigue sin poder empezar otra prueba gratis. lib/registro.ts (pruebaYaUsada) ya trata NULL como usada.
-- Solo afloja restricciones: compatible con la versión anterior.
BEGIN;

ALTER TABLE ml_pruebas_usadas ALTER COLUMN organizacion_id DROP NOT NULL;
ALTER TABLE ml_pruebas_usadas DROP CONSTRAINT IF EXISTS ml_pruebas_usadas_organizacion_id_fkey;
ALTER TABLE ml_pruebas_usadas ADD CONSTRAINT ml_pruebas_usadas_organizacion_id_fkey
  FOREIGN KEY (organizacion_id) REFERENCES organizaciones(id) ON DELETE SET NULL;

COMMIT;
