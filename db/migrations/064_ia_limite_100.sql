-- 064 · Tope de borradores con IA: 200 -> 100 por mes (etapa Fundadores, 2026-10-04).
--
-- Compartido entre Preguntas y Mensajes; cada vez que se presiona "Proponer con IA" cuenta,
-- se use o no la respuesta (el gasto de tokens ya ocurrió). Costo medido: ~$0,004 (Haiku) a
-- ~$0,03 (Sonnet) por borrador -> tope real ~$1,80-2,50 por cliente al mes con las fichas.
-- Se sube por cuenta desde Plataforma (columna IA/mes). El dueño de la plataforma sigue sin
-- límite (cupoIA devuelve NULL para la organización 'propietario', sin mirar este valor).
-- Solo baja las que estaban en el default viejo (200): un tope puesto a mano no se toca.
ALTER TABLE empresas ALTER COLUMN ia_limite_mes SET DEFAULT 100;
UPDATE empresas SET ia_limite_mes = 100 WHERE ia_limite_mes = 200;
