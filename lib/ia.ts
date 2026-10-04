// Llamadas a Claude (Preguntas y Mensajes) y registro de lo que cuesta cada una.
//
// Precios por millón de tokens (USD). Sonnet 5.5: $3 entrada / $15 salida; Haiku 4.5: $1 / $5;
// leer de la caché cuesta 0,1× y escribirla 1,25× la entrada; cada búsqueda web, $0,01; la API de
// lotes (fichas, sin nadie esperando) cobra la mitad.
//
// Modelos (2026-10-03): Sonnet por defecto (prueba con 22 preguntas reales: Haiku inventó en 5
// —puertos que el producto no tiene, carrito de compras, disponibilidad de una pausada—; Sonnet en
// ninguna). Haiku solo para las preguntas SIMPLES (disponible, precio, envío, ubicación, pago), y si
// no queda seguro ("alta") se vuelve a pedir a Sonnet. Se pueden cambiar por env (PREGUNTAS_MODELO,
// PREGUNTAS_MODELO_SIMPLE); un modelo que no está en la tabla se calcula como Sonnet.
import type { Pool } from 'pg'
import { dbGlobal } from '@/lib/db'

export const MODELO_IA = process.env.PREGUNTAS_MODELO ?? 'claude-sonnet-5-5'
export const MODELO_SIMPLE = process.env.PREGUNTAS_MODELO_SIMPLE ?? 'claude-haiku-4-5-20251001'
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

/** Una llamada hecha: con qué modelo y cuánto usó (un borrador puede tener dos: Haiku y Sonnet). */
export interface LlamadaIA { modelo: string; uso: UsoIA; lote?: boolean }

export function costoDe(modelo: string, u: UsoIA, lote = false) {
  const p = PRECIOS[modelo] ?? PRECIOS['claude-sonnet-5-5']
  const entrada = (u.input_tokens ?? 0) + 1.25 * (u.cache_creation_input_tokens ?? 0) + 0.1 * (u.cache_read_input_tokens ?? 0)
  return ((entrada * p.entrada + (u.output_tokens ?? 0) * p.salida) / 1e6) * (lote ? 0.5 : 1)
    + 0.01 * (u.server_tool_use?.web_search_requests ?? 0)
}

/** Guarda UN borrador (o una ficha) con todas sus llamadas sumadas: una fila = un borrador, que
 *  es lo que cuenta el límite del mes. No hace fallar nada si no se puede guardar. */
export async function registrarUso(db: Pool, modulo: 'preguntas' | 'mensajes' | 'fichas', llamadas: LlamadaIA[], usuarioId?: number | string | null) {
  if (!llamadas.length) return
  const suma = (f: (u: UsoIA) => number) => llamadas.reduce((a, l) => a + f(l.uso), 0)
  try {
    await db.query(
      `INSERT INTO ia_uso (modulo, modelo, entrada, salida, busquedas, costo, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [modulo, [...new Set(llamadas.map(l => l.modelo + (l.lote ? ' (lote)' : '')))].join(' → '),
       suma(u => (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)),
       suma(u => u.output_tokens ?? 0), suma(u => u.server_tool_use?.web_search_requests ?? 0),
       llamadas.reduce((a, l) => a + costoDe(l.modelo, l.uso, l.lote), 0),
       usuarioId ? Number(usuarioId) : null])
  } catch (e) { console.error('[ia_uso]', e) }
}

type Herramienta = { name: string; description: string; input_schema: object }
interface Pedido { sistema: string; contenido: string; herramienta: Herramienta; web?: boolean; maxTokens?: number; modelo?: string }

const CABECERAS = () => ({
  'x-api-key': process.env.ANTHROPIC_API_KEY!,
  'anthropic-version': '2023-06-01',
  'content-type': 'application/json',
})

/** El cuerpo de un pedido a Claude (lo usan la llamada directa y los lotes). */
export function cuerpoClaude(o: Pedido) {
  const modelo = o.modelo ?? MODELO_IA
  const tools: unknown[] = [o.herramienta]
  if (o.web) tools.unshift({ type: 'web_search_20250305', name: 'web_search', max_uses: CREDITOS_WEB_MAX - 1 })
  return {
    model: modelo,
    max_tokens: o.maxTokens ?? 1024,
    // Instrucciones + herramienta = el mismo prefijo en TODAS las empresas: se cachean (Sonnet 5.5
    // cachea desde 512 tokens; Haiku 4.5 desde 4.096, ahí la marca no hace nada y no cuesta).
    system: [{ type: 'text', text: o.sistema, cache_control: { type: 'ephemeral' } }],
    tools,
    // Sonnet 5.5 no acepta forzar la herramienta: va en auto (las instrucciones piden usarla siempre).
    tool_choice: o.web || !modelo.includes('haiku') ? { type: 'auto' } : { type: 'tool', name: o.herramienta.name },
    messages: [{ role: 'user', content: o.contenido }],
  }
}

/** El `input` de la herramienta en una respuesta de Claude. */
export function inputDeHerramienta<T>(content: { type: string; name?: string; input?: T }[] | undefined, nombre: string): T {
  const bloque = (content ?? []).filter(b => b.type === 'tool_use' && b.name === nombre).pop()
  if (!bloque?.input) throw new Error('La IA no devolvió un borrador')
  return bloque.input
}

/** Una llamada a Claude que termina en una herramienta (el borrador). Devuelve su `input` y el uso. */
export async function llamarClaude<T>(o: Pedido): Promise<{ resultado: T; uso: UsoIA; modelo: string }> {
  const cuerpo = cuerpoClaude(o)
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: CABECERAS(), body: JSON.stringify(cuerpo), cache: 'no-store',
  })
  const d = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`IA ${r.status}: ${d?.error?.message ?? 'sin detalle'}`)
  return { resultado: inputDeHerramienta<T>(d.content, o.herramienta.name), uso: d.usage ?? {}, modelo: cuerpo.model }
}

// ── API de lotes (Message Batches): mitad de precio, responde en minutos u horas ─────────────

export interface ResultadoLote { custom_id: string; result: { type: string; message?: { content: { type: string; name?: string; input?: unknown }[]; usage: UsoIA; model: string } } }

/** Manda un lote de pedidos ({custom_id → pedido}). Devuelve el id del lote. */
export async function enviarLote(pedidos: { id: string; pedido: Pedido }[]) {
  const r = await fetch('https://api.anthropic.com/v1/messages/batches', {
    method: 'POST', headers: CABECERAS(), cache: 'no-store',
    body: JSON.stringify({ requests: pedidos.map(p => ({ custom_id: p.id, params: cuerpoClaude(p.pedido) })) }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.id) throw new Error(`IA lote ${r.status}: ${d?.error?.message ?? 'sin detalle'}`)
  return d.id as string
}

/** Estado de un lote: null si sigue procesando; si terminó, sus resultados. */
export async function leerLote(id: string): Promise<ResultadoLote[] | null> {
  const r = await fetch(`https://api.anthropic.com/v1/messages/batches/${id}`, { headers: CABECERAS(), cache: 'no-store' })
  const d = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`IA lote ${r.status}: ${d?.error?.message ?? 'sin detalle'}`)
  if (d.processing_status !== 'ended') return null
  if (!d.results_url) return []
  const res = await fetch(d.results_url, { headers: CABECERAS(), cache: 'no-store' })
  if (!res.ok) throw new Error(`IA lote resultados ${res.status}`)
  return (await res.text()).split('\n').filter(l => l.trim()).map(l => JSON.parse(l) as ResultadoLote)
}

// ── Límite de borradores por mes ──────────────────────────────────────────────────────────────

/** CRÉDITOS de IA del mes (2026-10-04). El cliente ve "N de 100 créditos" y cada botón dice lo
 *  que cuesta ANTES de presionarlo:
 *    · "Proponer con IA" (Preguntas o Mensajes) = 1 crédito, se use o no la respuesta;
 *    · "Buscar en internet" = 1 + 1 por cada búsqueda que haga la IA (máx. 3) = hasta 4.
 *  Un crédito ≈ $0,02-0,03 (una búsqueda cuesta $0,01 + las páginas que lee ≈ un borrador difícil).
 *  usados = filas de ia_uso (un borrador por fila) + sus búsquedas. Límite null = sin límite (desde
 *  la migración 066 el dueño también tiene tope, por decisión propia). Las fichas no cuentan (apagadas, migración 063). */
export const CREDITOS_WEB_MAX = 4

export async function cupoIA(db: Pool, empresaId: number) {
  const { rows: [e] } = await dbGlobal().query(
    `SELECT ia_limite_mes AS limite, ia_creditos_desde AS desde FROM empresas WHERE id = $1`, [empresaId])
  // Cuenta desde el día 1 del mes, o desde ia_creditos_desde si es más reciente (migración 066:
  // el dueño arrancó sus créditos a mitad de mes, sin descontarse lo de antes).
  const { rows: [u] } = await db.query(
    `SELECT (COUNT(*) + COALESCE(SUM(busquedas), 0))::int AS usados FROM ia_uso
     WHERE modulo IN ('preguntas', 'mensajes')
       AND fecha >= GREATEST(date_trunc('month', NOW()), COALESCE($1::timestamptz, '-infinity'))`, [e?.desde ?? null])
  const limite: number | null = e?.limite ?? null
  const usados = u.usados as number
  return { usados, limite, quedan: limite === null ? null : Math.max(0, limite - usados), agotado: limite !== null && usados >= limite }
}

export const mensajeCupoAgotado = (limite: number) =>
  `Usaste los ${limite} créditos de IA de este mes. Las respuestas parecidas y las respuestas rápidas siguen funcionando; los créditos se renuevan el día 1.`

export const mensajeSinCreditosWeb = (quedan: number) =>
  `Buscar en internet usa hasta ${CREDITOS_WEB_MAX} créditos y te ${quedan === 1 ? 'queda 1' : `quedan ${quedan}`}. Puedes usar «Proponer con IA» (1 crédito) o anotar el dato del producto.`

/** Lo gastado en IA en el mes actual (por módulo), para mostrarlo en pantalla. */
export async function usoDelMes(db: Pool) {
  const { rows } = await db.query(
    `SELECT modulo, COUNT(*)::int AS borradores, COALESCE(SUM(costo), 0)::float AS costo
     FROM ia_uso WHERE fecha >= date_trunc('month', NOW()) GROUP BY modulo`)
  const total = rows.reduce((a, r) => a + r.costo, 0)
  return { total, borradores: rows.filter(r => r.modulo !== 'fichas').reduce((a, r) => a + r.borradores, 0), porModulo: rows }
}
