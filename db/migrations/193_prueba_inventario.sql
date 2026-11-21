-- 193 (21-11-2026, el dueño): PRUEBA DE INVENTARIO 15 días para clientes que ya pagan (piloto: SHOPIT_VE).
--   · organizaciones.inventario_oferta: el dueño de la plataforma la prende en Plataforma → «Ofrecer Inventario»; solo
--     esas cuentas ven la oferta arriba y pueden contratar el plan Completo (para el resto sigue «Próximamente»).
--   · inventario_prueba_desde / _hasta: la prueba que el cliente activó él mismo (una sola vez por organización). Al
--     día siguiente de _hasta, sin plan Completo, el módulo se apaga solo (lib/pruebaInventario.ts, cron de preguntas);
--     los datos quedan guardados.
-- Solo agrega columnas (compatible con la versión anterior). Idempotente.
BEGIN;

ALTER TABLE organizaciones ADD COLUMN IF NOT EXISTS inventario_oferta       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE organizaciones ADD COLUMN IF NOT EXISTS inventario_prueba_desde DATE;
ALTER TABLE organizaciones ADD COLUMN IF NOT EXISTS inventario_prueba_hasta DATE;

COMMIT;
