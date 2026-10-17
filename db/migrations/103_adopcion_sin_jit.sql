-- 103 · Plataforma → Clientes (2026-10-17): plataforma_adopcion tardaba ~1,6 s y casi todo era el JIT de
-- PostgreSQL compilando la consulta (estimación alta por las subconsultas por empresa). Sin JIT: ~0,04 s.
-- Compatible con la versión anterior. Idempotente.
ALTER FUNCTION plataforma_adopcion(integer) SET jit = off;
ALTER FUNCTION plataforma_uso_clientes() SET jit = off;
