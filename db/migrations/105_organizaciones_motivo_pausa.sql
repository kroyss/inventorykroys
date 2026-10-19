-- 105 · Por qué está pausada (vencida) una cuenta (19-10), para decírselo al intentar entrar con el motivo
-- correcto y un botón a Telegram (components/login/LoginForm.tsx):
--   'corte_fundadores' → no conectó MercadoLibre a tiempo (lib/fundadoresCorte.ts)
--   'plan'             → venció su plan pago (a futuro; pausa_fecha = el día que venció)
--   NULL               → prueba gratis terminada (lo de siempre)
-- Al reactivar la cuenta en Plataforma se limpia. Solo agrega columnas: compatible con la versión anterior.
ALTER TABLE organizaciones ADD COLUMN IF NOT EXISTS motivo_pausa TEXT;
ALTER TABLE organizaciones ADD COLUMN IF NOT EXISTS pausa_fecha DATE;
