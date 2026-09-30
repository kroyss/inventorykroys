-- 032 · Cuentas únicas de El Comerciante Digital.
--
-- `users` (global) pasa a ser LA cuenta de la persona para todos los productos:
--   username  → con qué entra (en todos los productos)
--   email     → solo registro / recuperar la clave (único si está)
--   productos → a qué productos entra: 'inventario', 'radar' (y los que vengan)
--
-- El Radar (otra app, otra base) valida contra esta cuenta con el rol `radar_auth`, que
-- NO ve ninguna tabla: solo puede llamar cuenta_para_login(). La clave de ese rol la
-- fija quien corre la migración (no vive en el repo).
--
-- Idempotente. Se corre como postgres en inventory_db / inventory (primero staging).
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS productos TEXT[] NOT NULL DEFAULT '{inventario}';
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users (lower(email)) WHERE email IS NOT NULL;

-- Busca la cuenta por usuario o por correo (el Radar pide usuario, pero quien escriba su
-- correo también entra: así nadie queda afuera en la transición).
CREATE OR REPLACE FUNCTION cuenta_para_login(p_login TEXT)
RETURNS TABLE (id INTEGER, username VARCHAR, email TEXT, full_name VARCHAR,
               password_hash VARCHAR, is_active BOOLEAN, productos TEXT[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.username, u.email, u.full_name, u.password_hash, u.is_active, u.productos
  FROM users u
  WHERE u.username = lower(trim(p_login))
     OR (u.email IS NOT NULL AND lower(u.email) = lower(trim(p_login)))
  ORDER BY (u.username = lower(trim(p_login))) DESC
  LIMIT 1
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'radar_auth') THEN
    CREATE ROLE radar_auth LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM radar_auth;
REVOKE ALL ON FUNCTION cuenta_para_login(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cuenta_para_login(TEXT) TO radar_auth;

COMMIT;
