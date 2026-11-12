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
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Pool } from 'pg'
import { dbGlobal } from '@/lib/db'

export const MODELO_IA = process.env.PREGUNTAS_MODELO ?? 'claude-sonnet-5-5'
// 06-11-2026 (el dueño, tras comparar 272 preguntas): Haiku 5.5 reemplaza a Haiku 4.5 en TODO el sistema (borradores
// simples, verificador, revisor de sugeridas, asistente, versión económica). Sonnet 5.5 sigue para lo complejo.
export const MODELO_SIMPLE = process.env.PREGUNTAS_MODELO_SIMPLE ?? 'claude-haiku-5-5'
// Desde cuándo rige Haiku 5.5: la pantalla de evaluación mide desde aquí (costos y acierto de las dos recetas).
export const CAMBIO_HAIKU55 = '2026-11-06T10:40:00Z'
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

// 12-11 (el dueño): lo que gastan las pruebas internas del dueño sobre la cuenta de un cliente (Competencia: nuestra
// respuesta para preguntas que ellos respondieron fuera) se guarda como módulo 'interna': no es consumo del cliente ni
// le cuenta créditos, y Plataforma → Interno lo muestra aparte.
const pruebaInterna = new AsyncLocalStorage<true>()
export const comoPruebaInterna = <T>(fn: () => Promise<T>) => pruebaInterna.run(true, fn)

/** Guarda UN borrador (o una ficha) con todas sus llamadas sumadas: una fila = un borrador, que
 *  es lo que cuenta el límite del mes. No hace fallar nada si no se puede guardar. */
export async function registrarUso(db: Pool, modulo: 'preguntas' | 'mensajes' | 'fichas' | 'revisor' | 'simulacion', llamadas: LlamadaIA[], usuarioId?: number | string | null) {
  if (!llamadas.length) return
  const mod: string = pruebaInterna.getStore() ? 'interna' : modulo
  const suma = (f: (u: UsoIA) => number) => llamadas.reduce((a, l) => a + f(l.uso), 0)
  try {
    // 09-11 (mig. 156): un solo saldo; creditos_recarga queda en 0 (era el reparto incluidos/recargas de la mig. 140).
    const deRecarga = 0
    await db.query(
      `INSERT INTO ia_uso (modulo, modelo, entrada, salida, busquedas, costo, usuario_id, cache_lectura, cache_escritura, creditos_recarga)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [mod, [...new Set(llamadas.map(l => l.modelo + (l.lote ? ' (lote)' : '')))].join(' → '),
       suma(u => (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)),
       suma(u => u.output_tokens ?? 0), suma(u => u.server_tool_use?.web_search_requests ?? 0),
       llamadas.reduce((a, l) => a + costoDe(l.modelo, l.uso, l.lote), 0),
       usuarioId ? Number(usuarioId) : null,
       // Cuánto de la entrada salió de la caché (0,1×) y cuánto se escribió en ella (1,25×): migración 129.
       suma(u => u.cache_read_input_tokens ?? 0), suma(u => u.cache_creation_input_tokens ?? 0), deRecarga])
  } catch (e) { console.error('[ia_uso]', e) }
}

type Herramienta = { name: string; description: string; input_schema: object }
interface Pedido { sistema: string; contenido: string | unknown[]; herramienta: Herramienta; web?: boolean; maxTokens?: number; modelo?: string }

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
  let resultado: T
  try { resultado = inputDeHerramienta<T>(d.content, o.herramienta.name) } catch (e) { anotarGasto(cuerpo.model, d.usage ?? {}, true); throw e }
  anotarGasto(cuerpo.model, d.usage ?? {}, false)
  return { resultado, uso: d.usage ?? {}, modelo: cuerpo.model }
}

/** 12-11 (mig. 169): cada llamada pagada suma en ia_gasto, sea de quien sea. Es el total real contra el que se
 *  cuadra lo asignado a las cuentas. No espera ni hace fallar nada. */
function anotarGasto(modelo: string, u: UsoIA, fallida: boolean) {
  const tipo = pruebaInterna.getStore() ? 'interna' : 'cuenta'
  dbGlobal().query(
    `INSERT INTO ia_gasto (dia, modelo, tipo, llamadas, entrada, salida, busquedas, fallidas, costo)
     VALUES (CURRENT_DATE, $1, $2, 1, $3, $4, $5, $6, $7)
     ON CONFLICT (dia, modelo, tipo) DO UPDATE SET llamadas = ia_gasto.llamadas + 1, entrada = ia_gasto.entrada + EXCLUDED.entrada,
       salida = ia_gasto.salida + EXCLUDED.salida, busquedas = ia_gasto.busquedas + EXCLUDED.busquedas,
       fallidas = ia_gasto.fallidas + EXCLUDED.fallidas, costo = ia_gasto.costo + EXCLUDED.costo`,
    [modelo, tipo, (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
     u.output_tokens ?? 0, u.server_tool_use?.web_search_requests ?? 0, fallida ? 1 : 0, costoDe(modelo, u)],
  ).catch(e => console.error('[ia_gasto]', e))
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

// ── Créditos de IA ─────────────────────────────────────────────────────────────────────────────

/** CRÉDITOS de IA. Cada botón dice lo que cuesta ANTES de presionarlo:
 *    · "Proponer con IA" (Preguntas o Mensajes) y cada respuesta automática = 1 crédito, se use o no la respuesta;
 *    · "Buscar en internet" = 1 + 1 por cada búsqueda que haga la IA (máx. 3) = hasta 4.
 *  usados = filas de ia_uso de preguntas y mensajes (un borrador por fila) + sus búsquedas. */
export const CREDITOS_WEB_MAX = 4
/** 09-11 (el dueño): se avisa cuando queda el 10% de los créditos y cuando se acaban (contador, aviso arriba y Telegram). */
export const AVISO_CREDITOS_PCT = 0.1
/** Nivel de aviso de un saldo: 'agotado', 'poco' (≤ 10%) o null. Solo clientes (periodo 'saldo'). */
export function nivelCreditos(c: Pick<CupoIA, 'periodo' | 'limite' | 'quedan'>): 'agotado' | 'poco' | null {
  if (c.periodo !== 'saldo' || c.limite == null || c.quedan == null) return null
  if (c.quedan <= 0) return 'agotado'
  return c.quedan <= c.limite * AVISO_CREDITOS_PCT ? 'poco' : null
}

/** 09-11-2026 (el dueño, mig. 156): los créditos son UN SALDO que no vence.
 *   · 'saldo' → clientes: lo otorgado en ia_creditos (prueba 500, primer plan según escalón una sola vez, recargas,
 *               regalos) − lo usado desde empresas.ia_saldo_desde. No se renueva ni vence.
 *   · 'mes'   → la propietaria: su tope por mes calendario (ia_limite_mes).
 *  ia_limite_mes NULL = sin límite (en clientes cualquier número = usa su saldo; el valor ya no importa). */
export type PeriodoIA = 'saldo' | 'mes'
export interface CupoIA {
  usados: number; limite: number | null; quedan: number | null; agotado: boolean
  periodo: PeriodoIA
  /** 'mes': cuándo se renuevan (YYYY-MM-DD); 'saldo': null. */
  renueva: string | null
}

export async function cupoIA(db: Pool, empresaId: number): Promise<CupoIA> {
  const { rows: [e] } = await dbGlobal().query(
    `SELECT e.ia_limite_mes AS limite, e.ia_saldo_desde AS desde, o.estado = 'propietario' AS propietaria,
            (SELECT COALESCE(SUM(c.creditos), 0) FROM ia_creditos c WHERE c.empresa_id = e.id)::int AS otorgados
     FROM empresas e JOIN organizaciones o ON o.id = e.organizacion_id WHERE e.id = $1`, [empresaId])
  const mes = !e || e.limite == null || e.propietaria
  const { rows: [u] } = await db.query(
    `SELECT COALESCE(SUM(1 + busquedas), 0)::int AS usados FROM ia_uso
     WHERE modulo IN ('preguntas', 'mensajes') AND fecha >= COALESCE($1::timestamptz, date_trunc('month', NOW()))`,
    [mes ? null : (e.desde ?? '-infinity')])
  const usados: number = u.usados
  if (!e || e.limite == null) return { usados, limite: null, quedan: null, agotado: false, periodo: 'mes', renueva: null }
  if (e.propietaria) {
    const quedan = Math.max(0, Number(e.limite) - usados)
    const h = new Date(); const sig = new Date(Date.UTC(h.getFullYear(), h.getMonth() + 1, 1)).toISOString().slice(0, 10)
    return { usados, limite: Number(e.limite), quedan, agotado: quedan <= 0, periodo: 'mes', renueva: sig }
  }
  const quedan = Math.max(0, Number(e.otorgados) - usados)
  return { usados, limite: usados + quedan, quedan, agotado: quedan <= 0, periodo: 'saldo', renueva: null }
}

const ddmm = (f: string) => f.split('-').reverse().slice(0, 2).join('/')

/** Cómo funcionan, en palabras; encaja después de «Tus créditos …». */
export const renuevaTexto = (c: Pick<CupoIA, 'periodo' | 'renueva'>) =>
  c.periodo === 'saldo' ? 'no vencen: los usas cuando quieras y se suman con las recargas'
    : c.renueva ? `se renuevan el ${ddmm(c.renueva)}` : 'se renuevan cada mes'

export const mensajeCupoAgotado = (c: CupoIA) =>
  `Se acabaron tus créditos de IA. Las respuestas parecidas y las respuestas rápidas siguen funcionando; `
  + (c.periodo === 'saldo' ? 'para seguir usando la IA, el administrador de la cuenta compra una recarga en Mi plan (no vencen).'
    : `los créditos ${renuevaTexto(c)}.`)

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
