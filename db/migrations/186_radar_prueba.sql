-- 186 · Prueba del Radar para cuentas nuevas (18-11-2026, el dueño): quien se registre DESDE HOY (en el Radar o en
-- /registro) tiene en el Radar una vista de prueba bloqueada: 10 búsquedas en 7 días, solo la primera página, datos sin
-- lo nuevo del mes. La prueba la controla el Radar; aquí:
--   · cuenta_para_login devuelve además 'radar_prueba7' para esas cuentas nuevas;
--   · radar_pruebas guarda el avance que el Radar reporta (radar_prueba_reportar, para el rol radar_auth), así Plataforma →
--     Programas y promos → Prueba Radar muestra quién probó, cuántas búsquedas usó y si pagó.
-- Solo agrega (compatible con la versión anterior). Idempotente.
BEGIN;

-- Global (de la cuenta central, no de una empresa): sin empresa_id ni RLS, como users.
CREATE TABLE IF NOT EXISTS radar_pruebas (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  desde       TIMESTAMPTZ NOT NULL,
  hasta       TIMESTAMPTZ NOT NULL,
  busquedas   INTEGER NOT NULL DEFAULT 0,
  repetida    BOOLEAN NOT NULL DEFAULT FALSE,   -- mismo equipo/conexión que otra prueba reciente: no recibió búsquedas
  ultima_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION radar_prueba_reportar(p_user INTEGER, p_desde TIMESTAMPTZ, p_hasta TIMESTAMPTZ,
                                                 p_busquedas INTEGER, p_repetida BOOLEAN)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO radar_pruebas (user_id, desde, hasta, busquedas, repetida, ultima_at)
  SELECT p_user, p_desde, p_hasta, GREATEST(0, LEAST(p_busquedas, 1000)), p_repetida, NOW()
  WHERE EXISTS (SELECT 1 FROM users WHERE id = p_user)
  ON CONFLICT (user_id) DO UPDATE SET busquedas = GREATEST(radar_pruebas.busquedas, EXCLUDED.busquedas),
                                      repetida = EXCLUDED.repetida, ultima_at = NOW()
$$;
REVOKE ALL ON FUNCTION radar_prueba_reportar(INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION radar_prueba_reportar(INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, BOOLEAN) TO radar_auth;
GRANT SELECT ON radar_pruebas TO inventory_app;

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
           -- 186 (18-11, el dueño): cuenta NUEVA (desde el 18-11-2026) registrada en el Radar o en /registro: el Radar le
           -- da su prueba de 10 búsquedas en 7 días (una sola vez, la lleva el Radar). Las de antes no la tienen.
           || CASE WHEN EXISTS (
                SELECT 1 FROM usuario_empresas ue JOIN empresas e ON e.id = ue.empresa_id
                JOIN organizaciones o ON o.id = e.organizacion_id
                WHERE ue.user_id = u.id AND o.origen IN ('radar', 'autoregistro')
                  AND o.created_at >= TIMESTAMPTZ '2026-11-18 00:00:00-04')
              THEN ARRAY['radar_prueba7'] ELSE ARRAY[]::text[] END
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
