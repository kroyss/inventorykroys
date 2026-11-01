-- 140 · Créditos de IA atados a la activación (01-11-2026)
--
-- Hasta acá los créditos incluidos se contaban por MES CALENDARIO (desde el día 1): el 01-11 todas las cuentas
-- en prueba vieron sus créditos completos otra vez. Regla del dueño desde ahora:
--   · prueba  → los créditos incluidos son para TODA la prueba, desde que se activó (o reactivó);
--   · plan    → por mes de plan, desde el día en que se activó (renueva cada mes en esa fecha);
--   · propietario → por mes calendario (como antes);
--   · recargas compradas → no vencen nunca: se gastan después de los incluidos y lo que sobra sigue.
-- Los incluidos que no se usan desaparecen al terminar su período.
--
-- organizaciones.creditos_desde = inicio de la activación vigente (lo mueven el alta, la reactivación y el
-- primer pago de un plan; renovar un plan vigente NO lo mueve). ia_uso.creditos_recarga = cuántos créditos
-- de esa fila salieron de las recargas (libro de recargas: saldo = compradas − usadas).
--
-- "Ya quedó así" (dueño): los que se renovaron el 01-11 se quedan con eso → piso de conteo el 01-11 para
-- todas las empresas de clientes (empresas.ia_creditos_desde, que ya se usa como piso).
-- Compatible con la versión anterior: solo agrega columnas.

ALTER TABLE organizaciones ADD COLUMN IF NOT EXISTS creditos_desde TIMESTAMPTZ;
UPDATE organizaciones SET creditos_desde = created_at
 WHERE creditos_desde IS NULL AND estado <> 'propietario';
ALTER TABLE organizaciones ALTER COLUMN creditos_desde SET DEFAULT NOW();

ALTER TABLE ia_uso ADD COLUMN IF NOT EXISTS creditos_recarga INTEGER NOT NULL DEFAULT 0;

UPDATE empresas e SET ia_creditos_desde = '2026-11-01 00:00:00-04'
  FROM organizaciones o
 WHERE o.id = e.organizacion_id AND o.estado <> 'propietario'
   AND (e.ia_creditos_desde IS NULL OR e.ia_creditos_desde < '2026-11-01 00:00:00-04');
