-- 190 (19-11-2026, el dueño): traída de MercadoEnvíos más inteligente (extensión 1.3.9).
--  * me_pedidos.avance: cada perfil cuenta cómo va mientras trabaja ({perfil: {fase, hechas, total, faltan_s, at}}),
--    para que el aviso muestre «leyendo 40 de ~120 · bajando guías 3 de 20 · faltan ~30 s».
--    La 1.3.6–1.3.8 no lo mandan: el aviso sigue con «trabajando…» como antes.
-- La «fecha de corte» (leer solo lo modificado desde la última traída buena) sale de me_pedidos.resultados: no
-- necesita columna. Compatible con la versión anterior (solo agrega). Idempotente. Primero staging, después producción.
ALTER TABLE me_pedidos ADD COLUMN IF NOT EXISTS avance JSONB NOT NULL DEFAULT '{}'::jsonb;
