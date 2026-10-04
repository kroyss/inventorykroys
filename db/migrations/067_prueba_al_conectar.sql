-- 067 · La prueba gratis arranca al CONECTAR la primera cuenta de MercadoLibre (2026-10-04).
--
-- Antes los días contaban desde que el dueño creaba la cuenta: quien tardaba en sentarse a
-- configurar perdía días sin haber probado nada. Ahora:
--   - al crear: prueba_dias = 30 (fundador) / 15 (prueba) y prueba_hasta = hoy + 7 + prueba_dias
--     (el TOPE: si en 7 días no conecta, los días corren igual);
--   - al conectar su primera cuenta ML: prueba_hasta = LEAST(prueba_hasta, hoy + prueba_dias)
--     y prueba_dias = NULL (ya arrancó; reconectar no la alarga).
-- prueba_dias NULL = la prueba ya está corriendo (o la cuenta no está en prueba).
ALTER TABLE organizaciones ADD COLUMN IF NOT EXISTS prueba_dias INT;
