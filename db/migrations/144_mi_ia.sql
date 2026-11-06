-- 144 · Mi IA (06-11-2026, lib/miIA.ts): las reglas del negocio para la IA de Preguntas y Mensajes, contestadas en un
-- cuestionario paso a paso. Se guardan en app_settings.mi_ia (JSON por empresa; app_settings ya es por empresa, sin
-- tabla nueva). Módulo 'mi_ia' en prueba solo con SolucionesMC VE (empresa 1); a un cliente se le prende en Plataforma.
-- Solo agrega (compatible con la versión anterior). Idempotente.
UPDATE empresas SET modulos = array_append(modulos, 'mi_ia') WHERE id = 1 AND NOT ('mi_ia' = ANY (modulos));
