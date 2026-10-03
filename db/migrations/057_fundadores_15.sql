-- 057 · Programa Fundadores: 15 pioneros, 5 en la primera tanda y 10 en la segunda (decidido con
-- el dueño el 2026-10-03: la mayoría arrancará solo con Herramientas, que se configuran más rápido,
-- y la primera tanda sirve de sondeo). Idempotente.
UPDATE fundadores_tandas SET cupos = 10 WHERE ronda = 1 AND numero = 2 AND cupos = 5;
