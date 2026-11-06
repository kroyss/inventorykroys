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
// 06-11-2026 (el dueño, tras comparar 272 preguntas): Haiku 5.5 reemplaza a Haiku 4.5 en TODO el sistema (borradores
// simples, verificador, revisor de sugeridas, asistente, versión económica). Sonnet 5.5 sigue para lo complejo.
export const MODELO_SIMPLE = process.env.PREGUNTAS_MODELO_SIMPLE ?? 'claude-haiku-5-5'
// Desde cuándo rige Haiku 5.5: la pantalla de evaluación mide desde aquí (costos y acierto de las dos recetas).
export const CAMBIO_HAIKU55 = '2026-11-06T15:45:00Z'
// Haiku 5.5 (06-11): 10× más barato que Haiku 4.5; corre EN PARALELO como "eco55" (lib/iaEconomica.ts) para compararlo.
export const MODELO_ECO55 = process.env.PREGUNTAS_MODELO_ECO55 ?? 'claude-haiku-5-5'
export const iaConfigurada = () => !!process.env.ANTHROPIC_API_KEY

// USD por millón de tokens (página oficial, 06-11-2026). lectura = multiplicador de la entrada leída de la caché
// (Sonnet 5.5: 0,05×; el resto 0,1×). Sonnet 5.5 estaba cargado a $3/$15: los gastos mostrados salían 50% de más.
const PRECIOS: Record<string, { entrada: number; salida: number; lectura: number }> = {
  'claude-haiku-4-5-20251001': { entrada: 1, salida: 5, lectura: 0.1 },
  'claude-haiku-5-5': { entrada: 0.1, salida: 0.5, lectura: 0.1 },
  'claude-sonnet-5-5': { entrada: 2, salida: 10, lectura: 0.05 },
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
  const entrada = (u.input_tokens ?? 0) + 1.25 * (u.cache_creation_input_tokens ?? 0) + p.lectura * (u.cache_read_input_tokens ?? 0)
  return ((entrada * p.entrada + (u.output_tokens ?? 0) * p.salida) / 1e6) * (lote ? 0.5 : 1)
    + 0.01 * (u.server_tool_use?.web_search_requests ?? 0)
}

/** Guarda UN borrador (o una ficha) con todas sus llamadas sumadas: una fila = un borrador, que
 *  es lo que cuenta el límite del mes. No hace fallar nada si no se puede guardar. */
export async function registrarUso(db: Pool, modulo: 'preguntas' | 'mensajes' | 'fichas' | 'revisor' | 'simulacion', llamadas: LlamadaIA[], usuarioId?: number | string | null) {
  if (!llamadas.length) return
  const suma = (f: (u: UsoIA) => number) => llamadas.reduce((a, l) => a + f(l.uso), 0)
  try {
    // Créditos de este uso que salen de las RECARGAS (mig. 140): lo que no entra en los incluidos del período,
    // hasta lo que quede de recargas. Así las recargas llevan su propio saldo y nunca vencen.
    let deRecarga = 0
    if (modulo === 'preguntas' || modulo === 'mensajes') {
      const { rows: [x] } = await db.query(`SELECT NULLIF(current_setting('app.empresa_id', true), '')::int AS id`)
      if (x?.id) {
        const c = await cupoIA(db, x.id)
        if (c.base !== null) {
          const n = 1 + suma(u => u.server_tool_use?.web_search_requests ?? 0)
          deRecarga = Math.min(c.recarga, Math.max(0, n - Math.max(0, c.base - c.incluidos)))
        }
      }
    }
    await db.query(
      `INSERT INTO ia_uso (modulo, modelo, entrada, salida, busquedas, costo, usuario_id, cache_lectura, cache_escritura, creditos_recarga)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [modulo, [...new Set(llamadas.map(l => l.modelo + (l.lote ? ' (lote)' : '')))].join(' → '),
       suma(u => (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)),
       suma(u => u.output_tokens ?? 0), suma(u => u.server_tool_use?.web_search_requests ?? 0),
       llamadas.reduce((a, l) => a + costoDe(l.modelo, l.uso, l.lote), 0),
       usuarioId ? Number(usuarioId) : null,
       // Cuánto de la entrada salió de la caché (0,1×) y cuánto se escribió en ella (1,25×): migración 129.
       suma(u => u.cache_read_input_tokens ?? 0), suma(u => u.cache_creation_input_tokens ?? 0), deRecarga])
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

/** De qué período son los créditos incluidos (migración 140, 01-11-2026; regla del dueño):
 *   · 'prueba' → para TODA la prueba, desde que se activó o reactivó (no se renuevan);
 *   · 'plan'   → por mes de plan desde el día de la activación (organizaciones.creditos_desde): renueva ese día;
 *   · 'mes'    → la propietaria: mes calendario.
 *  Los incluidos que no se usan desaparecen con su período. Las RECARGAS compradas no vencen: se gastan después
 *  de los incluidos (ia_uso.creditos_recarga) y lo que sobra sigue de un período al otro. */
export type PeriodoIA = 'prueba' | 'plan' | 'mes'
export interface CupoIA {
  usados: number; limite: number | null; quedan: number | null; agotado: boolean
  /** Recargas compradas que quedan (no vencen). */
  recarga: number
  periodo: PeriodoIA
  /** Cuándo se renuevan los incluidos (YYYY-MM-DD); null en prueba. */
  renueva: string | null
  /** Incluidos: el tope del período y lo usado de ellos (para repartir un uso entre incluidos y recargas). */
  base: number | null; incluidos: number
}

export async function cupoIA(db: Pool, empresaId: number): Promise<CupoIA> {
  // Inicio del período: plan = el último "aniversario" de la activación; prueba = la activación; propietaria = día 1.
  // ia_creditos_desde (mig. 066/140) es un piso: nunca se cuenta antes de esa fecha.
  const { rows: [e] } = await dbGlobal().query(
    `WITH x AS (
       SELECT e.ia_limite_mes AS limite, e.ia_creditos_desde,
              CASE WHEN o.estado = 'propietario' OR o.creditos_desde IS NULL THEN 'mes'
                   WHEN o.estado = 'prueba' THEN 'prueba' ELSE 'plan' END AS periodo,
              o.creditos_desde AS ancla,
              (SELECT COALESCE(SUM(p.creditos), 0) FROM organizacion_pagos p WHERE p.empresa_id = e.id AND p.tipo = 'recarga')::int AS recargas
       FROM empresas e JOIN organizaciones o ON o.id = e.organizacion_id WHERE e.id = $1),
     y AS (
       SELECT x.*, CASE x.periodo
                     WHEN 'mes' THEN date_trunc('month', NOW())
                     WHEN 'prueba' THEN x.ancla
                     ELSE x.ancla + make_interval(months => (EXTRACT(YEAR FROM age(NOW(), x.ancla)) * 12
                                                             + EXTRACT(MONTH FROM age(NOW(), x.ancla)))::int) END AS inicio
       FROM x)
     SELECT limite, periodo, recargas, GREATEST(inicio, COALESCE(ia_creditos_desde, '-infinity')) AS desde,
            CASE WHEN periodo = 'prueba' THEN NULL
                 ELSE to_char((inicio + INTERVAL '1 month') AT TIME ZONE 'America/Caracas', 'YYYY-MM-DD') END AS renueva
     FROM y`, [empresaId])
  // Lo usado en el período (de los incluidos y de las recargas) y lo usado de las recargas desde siempre.
  const { rows: [u] } = await db.query(
    `SELECT COALESCE(SUM(1 + busquedas - creditos_recarga) FILTER (WHERE fecha >= $1), 0)::int AS incluidos,
            COALESCE(SUM(creditos_recarga) FILTER (WHERE fecha >= $1), 0)::int AS recarga_periodo,
            COALESCE(SUM(creditos_recarga), 0)::int AS recarga_total
     FROM ia_uso WHERE modulo IN ('preguntas', 'mensajes')`, [e?.desde ?? null])
  const base: number | null = e?.limite ?? null
  const recarga = Math.max(0, (e?.recargas ?? 0) - u.recarga_total)
  const usados = u.incluidos + u.recarga_periodo
  const periodo = (e?.periodo ?? 'mes') as PeriodoIA
  const renueva = e?.renueva ?? null
  if (base === null) return { usados, limite: null, quedan: null, agotado: false, recarga, periodo, renueva, base, incluidos: u.incluidos }
  const quedan = Math.max(0, base - u.incluidos) + recarga
  return { usados, limite: usados + quedan, quedan, agotado: quedan <= 0, recarga, periodo, renueva, base, incluidos: u.incluidos }
}

const ddmm = (f: string) => f.split('-').reverse().slice(0, 2).join('/')

/** Cuándo vuelven los créditos, en palabras (para avisos y ayudas). */
export const renuevaTexto = (c: Pick<CupoIA, 'periodo' | 'renueva'>) =>
  c.periodo === 'prueba' ? 'los de la prueba son para toda la prueba (no se renuevan)'
    : c.renueva ? `se renuevan el ${ddmm(c.renueva)}` : 'se renuevan cada mes'

export const mensajeCupoAgotado = (c: CupoIA) =>
  `Usaste los ${c.limite} créditos de IA ${c.periodo === 'prueba' ? 'de tu prueba' : 'de este período'}. Las respuestas parecidas y las respuestas rápidas siguen funcionando; `
  + (c.periodo === 'prueba' ? 'para seguir usando la IA, activa un plan o compra una recarga.' : `los créditos ${renuevaTexto(c)}, o puedes comprar una recarga.`)

export const mensajeSinCreditosWeb = (quedan: number) =>
  `Buscar en internet usa hasta ${CREDITOS_WEB_MAX} créditos y te ${quedan === 1 ? 'queda 1' : `quedan ${quedan}`}. Puedes usar «Proponer con IA» (1 crédito) o anotar el dato del producto.`

/** Lo gastado en IA en el mes actual (por módulo), para mostrarlo en pantalla. */
export async function usoDelMes(db: Pool) {
  const { rows } = await db.query(
    `SELECT modulo, COUNT(*)::int AS borradores, COALESCE(SUM(costo), 0)::float AS costo
     FROM ia_uso WHERE fecha >= date_trunc('month', NOW()) GROUP BY modulo`)
  const total = rows.reduce((a, r) => a + r.costo, 0)
  return { total, borradores: rows.filter(r => !['fichas', 'revisor', 'simulacion'].includes(r.modulo)).reduce((a, r) => a + r.borradores, 0), porModulo: rows }
}
