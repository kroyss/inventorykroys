-- 178 (14-11-2026): permiso nuevo 'ver_bono' (lib/permisos.ts, encendido por defecto): la barra de bonos del Inicio
-- pasa a ser por empleado. Para que nadie la pierda con el cambio, se agrega a los empleados que ya tenían su lista
-- de permisos guardada, en las empresas con el módulo Bonos (los que nunca se tocaron lo reciben por defecto; el
-- admin lo tiene siempre). Después el dueño se lo quita a quien no deba verla en Usuarios → Permisos.
-- Solo agrega (compatible con la versión anterior). Idempotente.
BEGIN;
UPDATE usuario_empresas ue SET permisos = array_append(ue.permisos, 'ver_bono')
FROM empresas e
WHERE e.id = ue.empresa_id AND 'bonos' = ANY(e.modulos)
  AND ue.role <> 'admin' AND ue.permisos IS NOT NULL AND NOT ('ver_bono' = ANY(ue.permisos));
COMMIT;
