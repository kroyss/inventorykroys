-- 158 · IA automática para clientes (09-11-2026, el dueño). Los planes Automatizaciones y Completo, y la prueba gratis,
-- traen Mi IA, Fotos para la IA, Preguntas automáticas y Mensajes con IA (lib/planes.ts MODULOS_IA). El módulo solo la
-- deja DISPONIBLE: queda apagada hasta que el cliente la enciende en Mi IA (y entonces cada respuesta usa 1 crédito).
-- Solo agrega módulos (compatible con la versión anterior). Idempotente.
UPDATE empresas e SET modulos = ARRAY(SELECT DISTINCT m FROM unnest(e.modulos || ARRAY['mi_ia', 'fotos_ia', 'ia_automatica', 'mensajes_ia']) m)
FROM organizaciones o
WHERE o.id = e.organizacion_id AND e.is_active
  AND (o.plan IN ('automatizaciones', 'completo') OR (o.estado = 'prueba' AND 'preguntas' = ANY(e.modulos)))
  AND NOT (e.modulos @> ARRAY['mi_ia', 'fotos_ia', 'ia_automatica', 'mensajes_ia']);
