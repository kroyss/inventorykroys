-- 195 · Publicaciones → «Precio vs sistema» (22-11-2026, pedido del dueño): el precio de lista de cada publicación de ML
-- contra el «Precio con exceso ML» del sistema, y ponerlo en ML por la cola. Módulo `precio_vs_ml`: por ahora SOLO
-- SolucionesMC VE (empresa 1); a un cliente se le prende en Plataforma → Empresas. No crea tablas: el historial va en
-- la cola (ml_pub_lotes tipo 'precio', parametros.origen = 'precio_vs_ml'). Solo agrega: compatible con la versión
-- anterior. Idempotente.
UPDATE empresas SET modulos = array_append(modulos, 'precio_vs_ml') WHERE id = 1 AND NOT ('precio_vs_ml' = ANY (modulos));
