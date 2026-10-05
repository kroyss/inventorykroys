-- 069 · Última actividad de cada usuario (2026-10-05).
-- La usa el cron de MercadoLibre para bajar la frecuencia de las empresas inactivas: si ningún usuario
-- de la empresa usó el sistema en 7 días, se sincroniza cada 30 minutos en vez de cada minuto.
-- last_login no sirve para esto: la sesión dura semanas sin volver a poner la clave. La marca la
-- sesión (lib/auth.ts) como máximo una vez por hora.
ALTER TABLE users ADD COLUMN IF NOT EXISTS ultima_actividad TIMESTAMPTZ;
UPDATE users SET ultima_actividad = last_login WHERE ultima_actividad IS NULL AND last_login IS NOT NULL;
