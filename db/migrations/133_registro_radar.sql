-- 133 · Registro desde el Radar (29-10-2026, prueba del Radar el sábado 31-10): /registro?para=radar crea la cuenta
-- central SOLO con el Radar (productos {radar, radar_prueba}), sin empresa ni prueba del Sistema. Lo que dejó en el
-- formulario (negocio, WhatsApp, Telegram, correo) queda en users.registro, para contactarlo y para crearle la empresa
-- con esos datos si después pide el Sistema. Global (users no tiene RLS). Solo agrega (compatible con la versión anterior).
ALTER TABLE users ADD COLUMN IF NOT EXISTS registro JSONB;
CREATE INDEX IF NOT EXISTS idx_users_registro_ip ON users ((registro->>'ip_hash')) WHERE registro IS NOT NULL;
