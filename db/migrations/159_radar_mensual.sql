-- 159 · Radar mensual (09-11-2026, el dueño): quien se registra en el Radar paga para entrar: $20 al mes (−50% en
-- noviembre = $10), con Radar PRO todos los días del mes pagado. Se paga como el plan (Mi plan / /renovar → Plataforma →
-- Cobros). organizaciones.radar_mes_hasta = hasta cuándo lo tiene. cuenta_para_login devuelve además
--   'radar_mes:AAAA-MM-DD'  si lo tiene vigente (el Radar le da PRO hasta esa fecha);
--   'radar_promo'           si se registró desde el Radar con un link de promoción (registro.promo): solo esos entran
--                           al grupo de prueba de un día (la lógica de los sábados queda para próximas promos).
-- Solo agrega (compatible con la versión anterior). Idempotente.
BEGIN;

ALTER TABLE organizaciones ADD COLUMN IF NOT EXISTS radar_mes_hasta DATE;

ALTER TABLE organizacion_cobros DROP CONSTRAINT IF EXISTS organizacion_cobros_tipo_check;
ALTER TABLE organizacion_cobros ADD CONSTRAINT organizacion_cobros_tipo_check CHECK (tipo IN ('plan', 'radar_pro', 'upgrade', 'recarga', 'radar_mes'));
ALTER TABLE organizacion_pagos DROP CONSTRAINT IF EXISTS organizacion_pagos_tipo_check2;
ALTER TABLE organizacion_pagos DROP CONSTRAINT IF EXISTS organizacion_pagos_tipo_check3;
ALTER TABLE organizacion_pagos ADD CONSTRAINT organizacion_pagos_tipo_check3 CHECK (tipo IN ('plan', 'recarga', 'radar_pro', 'upgrade', 'radar_mes'));

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
           -- 159: Radar mensual pagado (solo Radar, PRO todos los días) vigente: la fecha más lejana.
           || COALESCE((
                SELECT ARRAY['radar_mes:' || to_char(max(o.radar_mes_hasta), 'YYYY-MM-DD')]
                FROM usuario_empresas ue JOIN empresas e ON e.id = ue.empresa_id
                JOIN organizaciones o ON o.id = e.organizacion_id
                WHERE ue.user_id = u.id AND e.is_active AND 'radar' = ANY (e.modulos)
                  AND o.radar_mes_hasta >= (NOW() AT TIME ZONE 'America/Caracas')::date
                HAVING max(o.radar_mes_hasta) IS NOT NULL), ARRAY[]::text[])
           -- 159: se registró desde el Radar con un link de promoción (?promo=…): entra al grupo de prueba vigente.
           -- Sin promo, el registro del Radar ya no da días de prueba: paga para entrar.
           || CASE WHEN EXISTS (
                SELECT 1 FROM usuario_empresas ue JOIN empresas e ON e.id = ue.empresa_id
                JOIN organizaciones o ON o.id = e.organizacion_id
                WHERE ue.user_id = u.id AND o.origen = 'radar' AND COALESCE(o.registro->>'promo', '') <> '')
              THEN ARRAY['radar_promo'] ELSE ARRAY[]::text[] END
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
