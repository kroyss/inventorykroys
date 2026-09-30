// Preguntas de MercadoLibre: sincronización de la bandeja, borrador con IA y envío.
//
// Reglas aprendidas contra la API real (MLV):
//   - usar siempre api_version=4; limit máximo 50; el offset muere en 1000;
//   - que ML acepte el POST /answers NO significa que se publicó: se relee la pregunta y
//     solo cuenta si quedó ANSWERED con la respuesta ACTIVE;
//   - ML descarta textos con links externos o datos de contacto: se revisan antes;
//   - las preguntas de publicaciones pausadas no salen en el panel de ML pero la API sí
//     las trae: acá se muestran con aviso para que ninguna se quede colgada.
import type { Pool } from 'pg'
import { mlFetch, CuentaDesconectada } from '@/lib/ml'

// ── Tipos de la API (lo que usamos) ────────────────────────────────────────
interface PreguntaML {
  id: number; item_id: string; status: string; text: string; date_created: string
  from?: { id?: number }
  answer?: { text: string; status: string; date_created: string } | null
}
interface BusquedaML { total: number; questions: PreguntaML[] }

// Las fechas de ML traen nanosegundos: Postgres las acepta, pero se recortan igual para
// que cualquier otro parser (JS) no falle.
const fechaML = (s?: string | null) => s ? s.replace(/(\.\d{6})\d+/, '$1') : null

async function guardar(db: Pool, conexionId: number, q: PreguntaML) {
  await db.query(
    `INSERT INTO ml_preguntas (id, conexion_id, item_id, texto, estado, fecha, comprador_id,
                               respuesta, respuesta_estado, respuesta_fecha, sincronizada_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
     ON CONFLICT (empresa_id, id) DO UPDATE SET
       estado = EXCLUDED.estado, texto = EXCLUDED.texto,
       respuesta = COALESCE(EXCLUDED.respuesta, ml_preguntas.respuesta),
       respuesta_estado = COALESCE(EXCLUDED.respuesta_estado, ml_preguntas.respuesta_estado),
       respuesta_fecha = COALESCE(EXCLUDED.respuesta_fecha, ml_preguntas.respuesta_fecha),
       sincronizada_at = NOW()`,
    [q.id, conexionId, q.item_id, q.text, q.status, fechaML(q.date_created), q.from?.id ?? null,
     q.answer?.text ?? null, q.answer?.status ?? null, fechaML(q.answer?.date_created)])
}

async function buscar(db: Pool, conexionId: number, status: string, maxPaginas: number) {
  const out: PreguntaML[] = []
  for (let p = 0; p < maxPaginas; p++) {
    const offset = p * 50
    if (offset >= 1000) break                                   // tope de la API
    const r = await mlFetch<BusquedaML>(db, conexionId,
      `/my/received_questions/search?api_version=4&status=${status}&limit=50&offset=${offset}` +
      `&sort_fields=date_created&sort_types=DESC`)
    out.push(...(r.questions ?? []))
    if ((r.questions?.length ?? 0) < 50 || out.length >= r.total) break
  }
  return out
}

/** Títulos/links/estado de las publicaciones que todavía no los tienen (multiget de 20). */
async function completarItems(db: Pool, conexionId: number) {
  const { rows } = await db.query(
    `SELECT DISTINCT item_id FROM ml_preguntas WHERE conexion_id = $1 AND item_titulo IS NULL LIMIT 200`, [conexionId])
  const ids = rows.map(r => r.item_id as string)
  for (let i = 0; i < ids.length; i += 20) {
    const lote = ids.slice(i, i + 20)
    const r = await mlFetch<{ code: number; body: { id: string; title: string; permalink: string; status: string } }[]>(
      db, conexionId, `/items?ids=${lote.join(',')}&attributes=id,title,permalink,status`)
    for (const it of r) {
      if (it.code !== 200 || !it.body) continue
      await db.query(
        `UPDATE ml_preguntas SET item_titulo = $2, item_permalink = $3, item_estado = $4 WHERE item_id = $1`,
        [it.body.id, it.body.title, it.body.permalink, it.body.status])
    }
  }
}

export interface ResultadoSync { cuenta: string; nuevas?: number; error?: string }

/**
 * Trae las preguntas de todas las cuentas activas de la empresa de `db`:
 *   - todas las sin responder (UNANSWERED);
 *   - las que teníamos sin responder y ya no lo están (se respondieron desde ML, se
 *     borraron…): se relee cada una para dejarla al día;
 *   - la primera vez, el histórico respondido (hasta el tope de 1000) para que la IA
 *     aprenda del tono y las políticas del vendedor.
 */
export async function sincronizarEmpresa(db: Pool): Promise<ResultadoSync[]> {
  const { rows: cuentas } = await db.query(
    `SELECT id, nickname, ultima_sync FROM ml_conexiones WHERE estado = 'activa' ORDER BY id`)
  const res: ResultadoSync[] = []
  for (const c of cuentas) {
    try {
      const { rows: [{ n: antes }] } = await db.query(`SELECT COUNT(*)::int AS n FROM ml_preguntas WHERE conexion_id = $1`, [c.id])
      const pendientes = await buscar(db, c.id, 'UNANSWERED', 20)
      for (const q of pendientes) await guardar(db, c.id, q)

      const vivas = new Set(pendientes.map(q => q.id))
      const { rows: viejas } = await db.query(
        `SELECT id FROM ml_preguntas WHERE conexion_id = $1 AND estado = 'UNANSWERED' ORDER BY fecha LIMIT 100`, [c.id])
      for (const v of viejas) {
        if (vivas.has(Number(v.id))) continue
        try {
          await guardar(db, c.id, await mlFetch<PreguntaML>(db, c.id, `/questions/${v.id}?api_version=4`))
        } catch (e) {
          // Borrada del todo en ML: se marca para que no siga como pendiente.
          if ((e as { status?: number }).status === 404) {
            await db.query(`UPDATE ml_preguntas SET estado = 'DELETED', sincronizada_at = NOW() WHERE id = $1`, [v.id])
          } else throw e
        }
      }

      if (!c.ultima_sync) {
        for (const q of await buscar(db, c.id, 'ANSWERED', 20)) await guardar(db, c.id, q)
      }
      await completarItems(db, c.id)
      await db.query(`UPDATE ml_conexiones SET ultima_sync = NOW(), ultimo_error = NULL WHERE id = $1`, [c.id])
      const { rows: [{ n: despues }] } = await db.query(`SELECT COUNT(*)::int AS n FROM ml_preguntas WHERE conexion_id = $1`, [c.id])
      res.push({ cuenta: c.nickname, nuevas: despues - antes })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!(e instanceof CuentaDesconectada)) {
        await db.query(`UPDATE ml_conexiones SET ultimo_error = $2 WHERE id = $1`, [c.id, msg.slice(0, 500)])
      }
      res.push({ cuenta: c.nickname, error: msg })
    }
  }
  return res
}

// Revisión del texto: lib/preguntasTexto.ts (se usa también en el navegador).
export { problemasDelTexto } from '@/lib/preguntasTexto'

// ── Contexto para la IA ─────────────────────────────────────────────────────
interface ItemML {
  id: string; title: string; price: number; currency_id: string; available_quantity: number
  condition: string; status: string; permalink: string
  attributes?: { name: string; value_name: string | null }[]
  shipping?: { free_shipping?: boolean }
  warranty?: string | null
}

export interface Contexto {
  pregunta: { id: number; texto: string; item_id: string; fecha: string }
  item: ItemML | null
  descripcion: string | null
  producto: { code: string; name: string; stock: number; precio_usd: number | null } | null
  tasa: number | null
  politicas: string
  notas: string[]
  mismoItem: { p: string; r: string }[]
  parecidas: { p: string; r: string }[]
}

export async function armarContexto(db: Pool, preguntaId: number, country: string): Promise<Contexto & { conexionId: number }> {
  const { rows: [q] } = await db.query(
    `SELECT id, conexion_id, item_id, texto, fecha FROM ml_preguntas WHERE id = $1`, [preguntaId])
  if (!q) throw new Error('Pregunta no encontrada')

  let item: ItemML | null = null
  let descripcion: string | null = null
  try { item = await mlFetch<ItemML>(db, q.conexion_id, `/items/${q.item_id}`) } catch { /* sin datos de ML */ }
  try {
    const d = await mlFetch<{ plain_text?: string }>(db, q.conexion_id, `/items/${q.item_id}/description`)
    descripcion = d.plain_text?.trim() || null
  } catch { /* publicación sin descripción */ }

  // Producto propio: el código ML se guarda sin el prefijo del sitio (MLV768007052 → 768007052).
  const codigo = String(q.item_id).replace(/^[A-Z]{3}/, '')
  const { rows: [prod] } = await db.query(
    `SELECT p.code, p.name, COALESCE(i.quantity, 0)::int AS stock, pp.final_price_usd::float AS precio_usd
     FROM product_ml_codes m
     JOIN products p ON p.id = m.product_id
     LEFT JOIN inventory i ON i.product_id = p.id
     LEFT JOIN product_pricing pp ON pp.product_id = p.id
     WHERE m.ml_code = $1 AND p.is_active
     LIMIT 1`, [codigo])
  const { rows: [tasa] } = await db.query(
    `SELECT official_rate::float AS r FROM venezuela_exchange_rates ORDER BY rate_date DESC, created_at DESC LIMIT 1`)
  const { rows: [pol] } = await db.query(`SELECT value FROM app_settings WHERE key = 'preguntas_politicas'`)
  const { rows: notas } = await db.query(
    `SELECT texto FROM ml_item_notas WHERE item_id = $1 ORDER BY created_at DESC LIMIT 20`, [q.item_id])
  const { rows: mismo } = await db.query(
    `SELECT texto AS p, respuesta AS r FROM ml_preguntas
     WHERE item_id = $1 AND id <> $2 AND respuesta IS NOT NULL AND estado = 'ANSWERED'
     ORDER BY similarity(texto, $3) DESC, fecha DESC LIMIT 6`, [q.item_id, q.id, q.texto])
  const { rows: parecidas } = await db.query(
    `SELECT texto AS p, respuesta AS r FROM ml_preguntas
     WHERE item_id <> $1 AND respuesta IS NOT NULL AND estado = 'ANSWERED' AND texto % $2
     ORDER BY similarity(texto, $2) DESC, fecha DESC LIMIT 8`, [q.item_id, q.texto])

  return {
    conexionId: q.conexion_id,
    pregunta: { id: Number(q.id), texto: q.texto, item_id: q.item_id, fecha: q.fecha },
    item, descripcion,
    producto: prod ?? null,
    tasa: country === 'VE' ? tasa?.r ?? null : null,   // Bs solo aplica en Venezuela
    politicas: pol?.value ?? '',
    notas: notas.map(n => n.texto),
    mismoItem: mismo, parecidas,
  }
}

// ── Borrador con Claude ─────────────────────────────────────────────────────
export const MODELO_PREGUNTAS = process.env.PREGUNTAS_MODELO ?? 'claude-haiku-4-5-20251001'

export function iaConfigurada() { return !!process.env.ANTHROPIC_API_KEY }

const SISTEMA = `Eres quien responde las preguntas de los compradores en las publicaciones de MercadoLibre de un vendedor venezolano. Escribes el BORRADOR; una persona lo revisa antes de publicarlo.

Cómo responder:
- Español de Venezuela, cordial y breve (1 a 3 frases). Saluda corto ("¡Hola!") y cierra corto si el vendedor suele hacerlo.
- Copia el tono, las frases y las políticas de las RESPUESTAS ANTERIORES DEL VENDEDOR: son su voz real. Adáptalas, no las inventes de cero.
- Usa SOLO los datos que te doy: ficha y descripción de la publicación, stock real, políticas y notas. El stock de la publicación en MercadoLibre no es confiable: manda el STOCK REAL del sistema.
- Si el stock real es 0, no digas que hay disponible.
- Nunca inventes medidas, compatibilidades, garantías, precios ni tiempos de envío. Si el dato no está, dilo en "falta_dato" y deja una respuesta prudente (o vacía) con confianza "baja".
- Prohibido: links, páginas web, correos, teléfonos, redes sociales, "escríbeme al…". MercadoLibre borra esas respuestas.
- No prometas descuentos ni cosas fuera de las políticas.

Siempre termina llamando a la herramienta proponer_respuesta.`

function bloqueContexto(c: Contexto) {
  const L: string[] = []
  L.push(`PREGUNTA DEL COMPRADOR: "${c.pregunta.texto}"`)
  if (c.item) {
    L.push(`\nPUBLICACIÓN: ${c.item.title}`)
    L.push(`Precio publicado: ${c.item.price} ${c.item.currency_id} · condición: ${c.item.condition} · estado: ${c.item.status}` +
      (c.item.shipping?.free_shipping ? ' · envío gratis' : '') + (c.item.warranty ? ` · garantía: ${c.item.warranty}` : ''))
    const attrs = (c.item.attributes ?? []).filter(a => a.value_name).map(a => `${a.name}: ${a.value_name}`)
    if (attrs.length) L.push(`Ficha técnica: ${attrs.join(' · ')}`)
  }
  if (c.descripcion) L.push(`\nDESCRIPCIÓN:\n${c.descripcion.slice(0, 4000)}`)
  if (c.producto) {
    L.push(`\nSTOCK REAL (sistema): ${c.producto.stock} unidades (${c.producto.code} · ${c.producto.name})`)
    if (c.producto.precio_usd && c.tasa) {
      L.push(`Precio final: $${c.producto.precio_usd.toFixed(2)} ≈ Bs ${(c.producto.precio_usd * c.tasa).toFixed(2)} a tasa BCV ${c.tasa}`)
    }
  } else {
    L.push('\nSTOCK REAL: esta publicación no está vinculada a un producto del sistema (no afirmes disponibilidad sin verla).')
  }
  if (c.politicas.trim()) L.push(`\nPOLÍTICAS DEL VENDEDOR:\n${c.politicas.trim()}`)
  if (c.notas.length) L.push(`\nDATOS QUE EL VENDEDOR ANOTÓ DE ESTA PUBLICACIÓN:\n- ${c.notas.join('\n- ')}`)
  const par = (xs: { p: string; r: string }[]) => xs.map(x => `P: ${x.p}\nR: ${x.r}`).join('\n\n')
  if (c.mismoItem.length) L.push(`\nRESPUESTAS ANTERIORES DEL VENDEDOR EN ESTA MISMA PUBLICACIÓN:\n${par(c.mismoItem)}`)
  if (c.parecidas.length) L.push(`\nRESPUESTAS ANTERIORES DEL VENDEDOR A PREGUNTAS PARECIDAS (otras publicaciones):\n${par(c.parecidas)}`)
  return L.join('\n')
}

export interface Borrador { respuesta: string; confianza: 'alta' | 'media' | 'baja'; falta_dato: string | null; web: boolean }

const HERRAMIENTA = {
  name: 'proponer_respuesta',
  description: 'Entrega el borrador de respuesta para que el vendedor lo revise.',
  input_schema: {
    type: 'object',
    properties: {
      respuesta: { type: 'string', description: 'Texto listo para publicar (vacío si no se puede responder sin inventar).' },
      confianza: { type: 'string', enum: ['alta', 'media', 'baja'], description: 'alta = todo sale de los datos dados; baja = falta información.' },
      falta_dato: { type: ['string', 'null'], description: 'Qué dato faltó para responder bien, o null.' },
    },
    required: ['respuesta', 'confianza', 'falta_dato'],
  },
}

/** Pide el borrador a Claude. Con `web`, puede buscar en internet (el borrador queda marcado para verificar). */
export async function pedirBorrador(c: Contexto, web: boolean): Promise<Borrador> {
  const tools: unknown[] = [HERRAMIENTA]
  if (web) tools.unshift({ type: 'web_search_20250305', name: 'web_search', max_uses: 3 })
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODELO_PREGUNTAS,
      max_tokens: 1024,
      system: SISTEMA + (web
        ? '\n\nPuedes buscar en internet SOLO datos técnicos del producto (medidas, compatibilidad, especificaciones del fabricante). Nunca precios, stock ni envíos: eso sale solo de los datos del vendedor.'
        : ''),
      tools,
      tool_choice: web ? { type: 'auto' } : { type: 'tool', name: 'proponer_respuesta' },
      messages: [{ role: 'user', content: bloqueContexto(c) }],
    }),
    cache: 'no-store',
  })
  const d = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`IA ${r.status}: ${d?.error?.message ?? 'sin detalle'}`)
  const uso = (d.content as { type: string; name?: string; input?: Borrador }[])
    .filter(b => b.type === 'tool_use' && b.name === 'proponer_respuesta').pop()
  if (!uso?.input) throw new Error('La IA no devolvió un borrador')
  const b = uso.input
  return {
    respuesta: String(b.respuesta ?? '').trim(),
    confianza: ['alta', 'media', 'baja'].includes(b.confianza) ? b.confianza : 'baja',
    falta_dato: b.falta_dato || null,
    web,
  }
}
