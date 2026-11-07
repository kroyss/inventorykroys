-- 149 (07-11-2026): Mensajes con IA AUTOMÁTICOS (pedido del dueño). Las de decisión 'sola' (confianza alta y sin motivo
-- de revisión) se mandan solas si la empresa tiene app_settings 'mensajes_ia_auto' = {"modo":"real"}.
-- Solo agrega (compatible con la versión anterior).
ALTER TABLE ml_mensajes_ia ADD COLUMN IF NOT EXISTS enviada_at timestamptz;
ALTER TABLE ml_mensajes_ia ADD COLUMN IF NOT EXISTS envio_error text;
