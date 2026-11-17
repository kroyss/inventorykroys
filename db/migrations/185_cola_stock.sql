-- 185 (17-11, el dueño: «si es masivo, por la cola»): Stock en ML manda lo masivo (poner stock y pausar/activar más de
-- 10 publicaciones) por la cola común de MercadoLibre (lib/colaML.ts). Solo agrega dos tipos de tarea al CHECK.
ALTER TABLE ml_pub_lotes DROP CONSTRAINT IF EXISTS ml_pub_lotes_tipo_check;
ALTER TABLE ml_pub_lotes ADD CONSTRAINT ml_pub_lotes_tipo_check
  CHECK (tipo IN ('descripcion', 'precio', 'leer', 'promocion', 'stock', 'estado'));
