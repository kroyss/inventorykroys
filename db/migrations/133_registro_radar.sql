-- 133 · Radar como MÓDULO de la empresa (29-10-2026, decisión del dueño: se vende por módulos que se prenden según
-- el pago). Se registra desde el Radar (/registro?para=radar) → organización origen 'radar' + empresa con SOLO el
-- módulo 'radar' (sin prueba del Sistema). El Radar sigue preguntando lo mismo a cuenta_para_login(), que ahora
-- devuelve en productos, además de lo marcado a mano en users.productos (dueño, Despegue):
--   'radar'        si alguna empresa suya (encendida y al día) tiene el módulo radar y él es su admin o tiene el
--                  permiso ver_radar (Usuarios → Permisos; lib/permisos.ts);
--   'radar_prueba' si se registró desde el Radar → el Radar lo mete solo en su grupo de entrada (el día de prueba).
-- Misma firma y mismos permisos (radar_auth). Solo agrega (compatible con la versión anterior). Idempotente.
BEGIN;

CREATE OR REPLACE FUNCTION cuenta_para_login(p_login TEXT)
RETURNS TABLE (id INTEGER, username VARCHAR, email TEXT, full_name VARCHAR,
               password_hash VARCHAR, is_active BOOLEAN, productos TEXT[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.username, u.email, u.full_name, u.password_hash, u.is_active,
         ARRAY(SELECT DISTINCT p FROM unnest(
           u.productos
           || CASE WHEN EXISTS (
                SELECT 1 FROM usuario_empresas ue
                JOIN empresas e ON e.id = ue.empresa_id
                JOIN organizaciones o ON o.id = e.organizacion_id
                WHERE ue.user_id = u.id AND e.is_active AND 'radar' = ANY (e.modulos)
                  AND (ue.role = 'admin' OR 'ver_radar' = ANY (COALESCE(ue.permisos, '{}')))
                  AND (o.estado IN ('propietario', 'activo')
                       OR (o.estado = 'prueba' AND (o.prueba_hasta IS NULL OR o.prueba_hasta >= (NOW() AT TIME ZONE 'America/Caracas')::date))))
              THEN ARRAY['radar'] ELSE ARRAY[]::text[] END
           || CASE WHEN EXISTS (
                SELECT 1 FROM usuario_empresas ue
                JOIN empresas e ON e.id = ue.empresa_id
                JOIN organizaciones o ON o.id = e.organizacion_id
                WHERE ue.user_id = u.id AND o.origen = 'radar')
              THEN ARRAY['radar_prueba'] ELSE ARRAY[]::text[] END
         ) AS p)
  FROM users u
  WHERE u.username = lower(trim(p_login))
     OR (u.email IS NOT NULL AND lower(u.email) = lower(trim(p_login)))
  ORDER BY (u.username = lower(trim(p_login))) DESC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION cuenta_para_login(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cuenta_para_login(TEXT) TO radar_auth;

COMMIT;
