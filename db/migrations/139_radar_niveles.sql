-- 139 · Niveles del Radar (01-11-2026, plan acordado con el dueño): cuenta_para_login() devuelve además
--   'radar_plan'            si alguna empresa suya con el módulo radar es de una organización con plan pagado (activo) o
--                           la propietaria: el Radar lo saca de los grupos de prueba y le da Gratis todos los días;
--   'radar_pro_fds:AAAA-MM-DD' hasta cuándo tiene Radar PRO de fin de semana (organizaciones.radar_pro_hasta, mig 138).
-- Va como etiqueta en productos[] para no cambiar la firma (el Radar la lee en lib/auth.ts). Misma firma y permisos
-- que la 135. Solo agrega (compatible con la versión anterior). Idempotente.
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
           -- 139: plan pagado (o propietaria) con el módulo radar.
           || CASE WHEN EXISTS (
                SELECT 1 FROM usuario_empresas ue JOIN empresas e ON e.id = ue.empresa_id
                JOIN organizaciones o ON o.id = e.organizacion_id
                WHERE ue.user_id = u.id AND e.is_active AND 'radar' = ANY (e.modulos) AND o.estado IN ('propietario', 'activo'))
              THEN ARRAY['radar_plan'] ELSE ARRAY[]::text[] END
           -- 139: Radar PRO de fin de semana vigente (la fecha más lejana entre sus organizaciones).
           || COALESCE((
                SELECT ARRAY['radar_pro_fds:' || to_char(max(o.radar_pro_hasta), 'YYYY-MM-DD')]
                FROM usuario_empresas ue JOIN empresas e ON e.id = ue.empresa_id
                JOIN organizaciones o ON o.id = e.organizacion_id
                WHERE ue.user_id = u.id AND e.is_active AND 'radar' = ANY (e.modulos)
                  AND o.radar_pro_hasta >= (NOW() AT TIME ZONE 'America/Caracas')::date
                HAVING max(o.radar_pro_hasta) IS NOT NULL), ARRAY[]::text[])
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
