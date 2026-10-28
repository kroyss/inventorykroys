-- 130 · Cuándo el sistema detectó la calificación del comprador (27-10-2026).
-- ML esconde la calificación del comprador hasta que el vendedor califica: la fecha de ML (cal_recibida_at) puede
-- ser días antes de que se pueda ver. Los avisos de Telegram usan esta fecha para avisar de las detectadas recién.
-- Solo agrega (compatible con la versión anterior). NULL en las ya existentes = se usa cal_recibida_at.
ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS cal_recibida_detectada_at TIMESTAMPTZ;
