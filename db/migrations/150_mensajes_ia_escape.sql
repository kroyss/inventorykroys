-- 150 (07-11-2026): frase de escape de Mensajes con IA (Fase 2 de docs/analisis-mercasist.md, lib/iaFrenos.ts).
-- Cuándo se mandó el acuse corto en vez de la respuesta (la conversación sigue en «Por atender» para el equipo).
-- Solo agrega (compatible con la versión anterior).
ALTER TABLE ml_mensajes_ia ADD COLUMN IF NOT EXISTS escape_at timestamptz;
