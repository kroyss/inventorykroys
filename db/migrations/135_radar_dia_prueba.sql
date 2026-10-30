-- 135 · Radar "solo el día de prueba" (30-10-2026, pedido del dueño): al prender el módulo radar en Plataforma se
-- elige acceso completo o solo el día de prueba (módulo radar_dia junto con radar). cuenta_para_login() devuelve
-- además 'radar_dia' y el Radar mete a esa persona en el grupo de prueba vigente (AnalisisMercadoML lib/auth.ts).
-- Misma firma y permisos que la 133. Solo agrega (compatible con la versión anterior). Idempotente.
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
           -- 135: 'radar_dia' si TODO su Radar viene de empresas con el módulo radar_dia (prendido como "solo el día
           -- de prueba"). Si alguna empresa suya le da el Radar completo, gana el completo.
           || CASE WHEN EXISTS (
                SELECT 1 FROM usuario_empresas ue JOIN empresas e ON e.id = ue.empresa_id
                WHERE ue.user_id = u.id AND e.is_active AND 'radar' = ANY (e.modulos) AND 'radar_dia' = ANY (e.modulos))
              AND NOT EXISTS (
                SELECT 1 FROM usuario_empresas ue JOIN empresas e ON e.id = ue.empresa_id
                WHERE ue.user_id = u.id AND e.is_active AND 'radar' = ANY (e.modulos) AND NOT ('radar_dia' = ANY (e.modulos)))
              THEN ARRAY['radar_dia'] ELSE ARRAY[]::text[] END
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
