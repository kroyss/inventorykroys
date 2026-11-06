-- 142 · Pagos ME: aviso de la misma referencia de pago en otras ventas (06-11-2026, pregunta de Gerardo).
-- Índice por los dígitos de la referencia (la consulta compara solo dígitos). Solo agrega. Idempotente.
CREATE INDEX IF NOT EXISTS idx_me_pagos_ref_digitos
  ON me_pagos (empresa_id, (regexp_replace(referencia, '[^0-9]', '', 'g')));
