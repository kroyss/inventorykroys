-- 176 · WhatsApp de cada persona (13-11-2026, el dueño): «Mi cuenta → Mis datos» deja que cada uno ponga su
-- correo, WhatsApp y Telegram para que soporte pueda contactarlo. users es global (sin RLS); solo agrega.
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp TEXT;
COMMIT;
