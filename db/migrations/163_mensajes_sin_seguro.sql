-- 163 · «Responder todo» en Mensajes (10-11-2026, el dueño): la respuesta salió sin modo seguro (iría a revisión y se mandó
-- igual). Los motivos quedan en `motivos` (lo que la habría frenado) para revisar y corregir a la IA.
-- Solo agrega una columna (compatible con la versión anterior). Idempotente.
ALTER TABLE ml_mensajes_ia ADD COLUMN IF NOT EXISTS sin_seguro BOOLEAN NOT NULL DEFAULT FALSE;
