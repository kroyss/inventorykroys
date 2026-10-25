-- Medición de respuestas a preguntas (25-10, Fase A de respuestas automáticas). Solo lectura.
-- Por empresa y origen de la respuesta (rápida, sugerida, IA, propia, automática): cuántas, en cuánto tiempo,
-- cuántos compradores VOLVIERON a preguntar en esa publicación en 24 h (la respuesta no alcanzó) y cuántas
-- publicaciones se vendieron en las 48 h siguientes. Es la vara para decidir la Fase B (automáticas).
--   docker exec -i inventory_db psql -U postgres -d inventory -v dias=7 -v empresa=1 < scripts/medir-respuestas.sql
\if :{?dias} \else \set dias 7 \endif
\if :{?empresa} \else \set empresa 1 \endif

WITH r AS (
  SELECT DISTINCT ON (o.ref) o.ref, o.fuente, o.editada
  FROM respuestas_origen o
  WHERE o.empresa_id = :empresa AND o.modulo = 'preguntas' AND o.fecha > NOW() - make_interval(days => :dias)
  ORDER BY o.ref, o.fecha DESC
), q AS (
  SELECT p.*, COALESCE(r.fuente, 'sin registro') AS fuente, r.editada
  FROM ml_preguntas p LEFT JOIN r ON r.ref = p.id::text
  WHERE p.empresa_id = :empresa AND p.respuesta IS NOT NULL AND p.fecha > NOW() - make_interval(days => :dias)
)
SELECT fuente,
       count(*) AS respuestas,
       count(*) FILTER (WHERE editada) AS editadas,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM respuesta_fecha - fecha) / 60))::int AS min_mediana,
       round(100.0 * count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM ml_preguntas p2 WHERE p2.empresa_id = q.empresa_id AND p2.item_id = q.item_id
           AND p2.comprador_id = q.comprador_id AND p2.fecha > q.respuesta_fecha AND p2.fecha < q.respuesta_fecha + interval '24 hours'))
         / count(*), 1) AS pct_repregunta_24h,
       round(100.0 * count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM ml_ordenes o WHERE o.empresa_id = q.empresa_id AND q.item_id = ANY (o.items)
           AND o.fecha BETWEEN q.fecha AND q.fecha + interval '48 hours'))
         / count(*), 1) AS pct_venta_48h
FROM q GROUP BY 1 ORDER BY 2 DESC;
