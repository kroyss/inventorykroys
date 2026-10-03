// Ficha de conocimiento por publicación (migración 059): la IA lee TODO lo que el vendedor ya
// respondió en una publicación y lo resume en pocos datos confirmados. Así cada borrador recibe
// mucho conocimiento con pocos tokens (5–10 líneas en vez de cientos de conversaciones).
//
// Incluye las CORRECCIONES: si el vendedor cambió el borrador de la IA antes de publicar, lo que
// publicó manda (y queda en la ficha para no repetir el error). Las contradicciones (p. ej. el
// mínimo para envío gratis dicho de dos formas) van aparte en "dudas", para revisarlas.
//
// Solo publicaciones ACTIVAS (a las pausadas no les llegan preguntas). Se rehace SOLO cuando la
// publicación suma 3+ respuestas nuevas (sin respuestas nuevas no hay nada que cambie; rehacerlas
// cada 30 días costaba ~$2/mes por las ~360 fichas sin aportar nada).
// La corre el cron de preguntas en segundo plano por la API de LOTES (mitad de precio; nadie
// espera la respuesta): un lote abierto por empresa a la vez (tabla ia_lotes, migración 060).
import type { Pool } from 'pg'
import { enviarLote, inputDeHerramienta, leerLote, registrarUso } from '@/lib/ia'

const MINIMO_RESPUESTAS = 3
const FICHAS_POR_LOTE = 50
const MAX_PARES = 150                      // las más recientes (la ficha sale de ahí)

const SISTEMA = `Resumes lo que un vendedor venezolano de MercadoLibre ya respondió sobre UNA publicación, para que otra IA responda las próximas preguntas con su conocimiento.

Escribe "datos": viñetas cortas ("- ") con hechos CONFIRMADOS por el vendedor sobre el producto y cómo lo vende: qué incluye y qué no, compatibilidades, medidas, para qué sirve y para qué no, si tiene otra versión o modelo que recomienda (con su link si lo dio), condiciones de envío y pago que repite. Máximo 12 viñetas y 1.200 caracteres. Sin saludos ni frases de cortesía.
- Si el vendedor dijo cosas distintas en distintas fechas, manda lo MÁS RECIENTE.
- Si corrigió un borrador de la IA, lo que publicó es lo correcto: inclúyelo.
- No inventes nada que no esté en las respuestas.

Escribe "dudas": las contradicciones que no se pueden resolver por fecha (p. ej. dos montos distintos para el envío gratis), en una frase cada una; o null si no hay.

Siempre termina llamando a la herramienta guardar_ficha.`

const HERRAMIENTA = {
  name: 'guardar_ficha',
  description: 'Guarda la ficha de conocimiento de la publicación.',
  input_schema: {
    type: 'object',
    properties: {
      datos: { type: 'string', description: 'Viñetas con los hechos confirmados (máximo 1.200 caracteres).' },
      dudas: { type: ['string', 'null'], description: 'Contradicciones para que el vendedor revise, o null.' },
    },
    required: ['datos', 'dudas'],
  },
}

/** Avanza las fichas de la empresa de `db`: si hay un lote abierto y terminó, guarda sus fichas;
 *  si no hay ninguno abierto, manda uno nuevo con las pendientes. Devuelve cuántas guardó. */
export async function generarFichasPendientes(db: Pool) {
  let guardadas = 0
  const { rows: [abierto] } = await db.query(
    `SELECT id, batch_id, datos FROM ia_lotes WHERE modulo = 'fichas' AND estado = 'enviado' ORDER BY id LIMIT 1`)
  if (abierto) {
    const resultados = await leerLote(abierto.batch_id)
    if (!resultados) return 0                                    // sigue procesando
    const totales = abierto.datos as Record<string, number>
    for (const r of resultados) {
      const msg = r.result.type === 'succeeded' ? r.result.message : null
      try {
        if (!msg) throw new Error(r.result.type)
        await registrarUso(db, 'fichas', [{ modelo: msg.model, uso: msg.usage, lote: true }])
        const f = inputDeHerramienta<{ datos: string; dudas: string | null }>(
          msg.content as { type: string; name?: string; input?: { datos: string; dudas: string | null } }[], HERRAMIENTA.name)
        const datos = String(f.datos ?? '').trim().slice(0, 1500)
        if (!datos) throw new Error('ficha vacía')
        await db.query(
          `INSERT INTO ml_item_fichas (item_id, texto, dudas, n_preguntas, generada_at) VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (empresa_id, item_id) DO UPDATE SET texto = EXCLUDED.texto, dudas = EXCLUDED.dudas,
             n_preguntas = EXCLUDED.n_preguntas, generada_at = NOW()`,
          [r.custom_id, datos, f.dudas?.trim() || null, totales[r.custom_id] ?? 0])
        guardadas++
      } catch (e) {
        // Queda libre para el próximo lote.
        await db.query(`UPDATE ml_catalogo SET ficha_pedida_at = NULL WHERE item_id = $1`, [r.custom_id])
        console.error('[fichas IA]', r.custom_id, e instanceof Error ? e.message : e)
      }
    }
    await db.query(`UPDATE ia_lotes SET estado = 'terminado', terminado_at = NOW() WHERE id = $1`, [abierto.id])
  }

  // Reserva atómica: publicaciones del catálogo con suficientes respuestas y ficha vieja o sin ficha.
  // Un lote puede tardar hasta 24 h: la reserva vence a las 26 h por si el lote se perdió.
  const { rows } = await db.query(
    `UPDATE ml_catalogo SET ficha_pedida_at = NOW()
     WHERE (empresa_id, item_id) IN (
       SELECT c.empresa_id, c.item_id FROM ml_catalogo c
       JOIN LATERAL (SELECT COUNT(*)::int AS n FROM ml_preguntas q
                     WHERE q.item_id = c.item_id AND q.estado = 'ANSWERED' AND q.respuesta IS NOT NULL) r ON TRUE
       LEFT JOIN ml_item_fichas f ON f.item_id = c.item_id
       WHERE r.n >= ${MINIMO_RESPUESTAS} AND c.estado = 'active'
         AND (c.ficha_pedida_at IS NULL OR c.ficha_pedida_at < NOW() - INTERVAL '26 hours')
         AND (f.item_id IS NULL OR r.n >= f.n_preguntas + 3)
       ORDER BY (f.item_id IS NULL) DESC, r.n DESC
       LIMIT ${FICHAS_POR_LOTE} FOR UPDATE OF c SKIP LOCKED)
     RETURNING item_id, titulo, ficha`)
  if (!rows.length) return guardadas
  // n_preguntas guarda el TOTAL respondido (no solo las MAX_PARES leídas): si no, una publicación
  // con más de MAX_PARES respuestas se rehace en cada pasada.
  const totales: Record<string, number> = {}
  const pedidos = []
  for (const it of rows) {
    const { rows: [{ total }] } = await db.query(
      `SELECT COUNT(*)::int AS total FROM ml_preguntas WHERE item_id = $1 AND estado = 'ANSWERED' AND respuesta IS NOT NULL`,
      [it.item_id])
    const { rows: pares } = await db.query(
      `SELECT to_char(fecha, 'YYYY-MM-DD') AS f, texto, respuesta, borrador
       FROM ml_preguntas WHERE item_id = $1 AND estado = 'ANSWERED' AND respuesta IS NOT NULL
       ORDER BY fecha DESC LIMIT ${MAX_PARES}`, [it.item_id])
    const L = [`PUBLICACIÓN: ${it.titulo}`]
    if (it.ficha) L.push(`FICHA TÉCNICA: ${it.ficha}`)
    L.push(`\nPREGUNTAS Y RESPUESTAS DEL VENDEDOR (de la más nueva a la más vieja, ${pares.length}):`)
    for (const p of pares) {
      const corrigio = p.borrador && p.borrador.trim() !== p.respuesta.trim()
      L.push(`[${p.f}] P: ${p.texto.slice(0, 300)}\nR: ${p.respuesta.slice(0, 400)}` +
        (corrigio ? `\n(la IA había propuesto: "${p.borrador.slice(0, 300)}"; el vendedor lo corrigió)` : ''))
    }
    totales[it.item_id] = total
    pedidos.push({ id: it.item_id, pedido: { sistema: SISTEMA, contenido: L.join('\n'), herramienta: HERRAMIENTA, maxTokens: 900 } })
  }
  try {
    const batchId = await enviarLote(pedidos)
    await db.query(`INSERT INTO ia_lotes (batch_id, modulo, datos) VALUES ($1, 'fichas', $2)`, [batchId, JSON.stringify(totales)])
  } catch (e) {
    await db.query(`UPDATE ml_catalogo SET ficha_pedida_at = NULL WHERE item_id = ANY($1)`, [rows.map(r => r.item_id)])
    throw e
  }
  return guardadas
}
