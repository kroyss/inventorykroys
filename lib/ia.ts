// Llamadas a Claude (Preguntas y Mensajes) y registro de lo que cuesta cada una.
//
// Precios por millón de tokens (USD). Sonnet 5.5: $3 entrada / $15 salida; Haiku 4.5: $1 / $5;
// leer de la caché cuesta 0,1× y escribirla 1,25× la entrada; cada búsqueda web, $0,01.
// Modelo: Sonnet desde 2026-10-03 (prueba con 22 preguntas reales: Haiku inventó en 5 —puertos
// que el producto no tiene, carrito de compras, disponibilidad de una pausada—; Sonnet en ninguna).
// Se puede cambiar por env (PREGUNTAS_MODELO); si no está en la tabla, se calcula como Sonnet.
import type { Pool } from 'pg'

export const MODELO_IA = process.env.PREGUNTAS_MODELO ?? 'claude-sonnet-5-5'
export const iaConfigurada = () => !!process.env.ANTHROPIC_API_KEY

const PRECIOS: Record<string, { entrada: number; salida: number }> = {
  'claude-haiku-4-5-20251001': { entrada: 1, salida: 5 },
  'claude-sonnet-5-5': { entrada: 3, salida: 15 },
}

export interface UsoIA {
  input_tokens?: number; output_tokens?: number
  cache_creation_input_tokens?: number; cache_read_input_tokens?: number
  server_tool_use?: { web_search_requests?: number }
}

export function costoDe(modelo: string, u: UsoIA) {
  const p = PRECIOS[modelo] ?? PRECIOS['claude-sonnet-5-5']
  const entrada = (u.input_tokens ?? 0) + 1.25 * (u.cache_creation_input_tokens ?? 0) + 0.1 * (u.cache_read_input_tokens ?? 0)
  return (entrada * p.entrada + (u.output_tokens ?? 0) * p.salida) / 1e6 + 0.01 * (u.server_tool_use?.web_search_requests ?? 0)
}

/** Guarda una llamada a la IA (no hace fallar nada si no se puede guardar). */
export async function registrarUso(db: Pool, modulo: 'preguntas' | 'mensajes' | 'fichas', modelo: string, u: UsoIA, usuarioId?: number | string | null) {
  try {
    await db.query(
      `INSERT INTO ia_uso (modulo, modelo, entrada, salida, busquedas, costo, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [modulo, modelo,
       (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
       u.output_tokens ?? 0, u.server_tool_use?.web_search_requests ?? 0, costoDe(modelo, u),
       usuarioId ? Number(usuarioId) : null])
  } catch (e) { console.error('[ia_uso]', e) }
}

/** Una llamada a Claude que termina en una herramienta (el borrador). Devuelve su `input` y el uso. */
export async function llamarClaude<T>(o: {
  sistema: string; contenido: string; herramienta: { name: string; description: string; input_schema: object }
  web?: boolean; maxTokens?: number
}): Promise<{ resultado: T; uso: UsoIA; modelo: string }> {
  const tools: unknown[] = [o.herramienta]
  if (o.web) tools.unshift({ type: 'web_search_20250305', name: 'web_search', max_uses: 3 })
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODELO_IA,
      max_tokens: o.maxTokens ?? 1024,
      // Las instrucciones son siempre iguales: se cachean (más barato si hay varias seguidas).
      system: [{ type: 'text', text: o.sistema, cache_control: { type: 'ephemeral' } }],
      tools,
      // Sonnet 5.5 no acepta forzar la herramienta: va en auto (las instrucciones piden usarla siempre).
      tool_choice: o.web || !MODELO_IA.includes('haiku') ? { type: 'auto' } : { type: 'tool', name: o.herramienta.name },
      messages: [{ role: 'user', content: o.contenido }],
    }),
    cache: 'no-store',
  })
  const d = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`IA ${r.status}: ${d?.error?.message ?? 'sin detalle'}`)
  const bloque = (d.content as { type: string; name?: string; input?: T }[])
    .filter(b => b.type === 'tool_use' && b.name === o.herramienta.name).pop()
  if (!bloque?.input) throw new Error('La IA no devolvió un borrador')
  return { resultado: bloque.input, uso: d.usage ?? {}, modelo: MODELO_IA }
}

/** Lo gastado en IA en el mes actual (por módulo), para mostrarlo en pantalla. */
export async function usoDelMes(db: Pool) {
  const { rows } = await db.query(
    `SELECT modulo, COUNT(*)::int AS borradores, COALESCE(SUM(costo), 0)::float AS costo
     FROM ia_uso WHERE fecha >= date_trunc('month', NOW()) GROUP BY modulo`)
  const total = rows.reduce((a, r) => a + r.costo, 0)
  return { total, borradores: rows.reduce((a, r) => a + r.borradores, 0), porModulo: rows }
}
