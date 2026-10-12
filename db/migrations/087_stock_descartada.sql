-- 087: Stock "en caliente" y "No hay, quitar" (2026-10-12, pedido de Gerardo). lib/alertasStock.ts
--
-- El aviso del menú cuenta solo lo agotado / por agotarse en los últimos 7 días (agotada_desde /
-- bajo_desde). Lo más viejo pasa a "En el olvido" (se ve, pero no suma). "No hay, quitar" lo manda
-- al olvido al instante: descartada_at. Si se repone y vuelve a caer, la fecha nueva es posterior a
-- descartada_at y vuelve a avisar.
-- Idempotente.

ALTER TABLE ml_stock_alertas ADD COLUMN IF NOT EXISTS descartada_at TIMESTAMPTZ;
