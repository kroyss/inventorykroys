// Ficha de conocimiento por publicación (migración 059): la IA lee TODO lo que el vendedor ya
// respondió en una publicación y lo resume en pocos datos confirmados. Así cada borrador recibe
// mucho conocimiento con pocos tokens (5–10 líneas en vez de cientos de conversaciones).
//
// Incluye las CORRECCIONES: si el vendedor cambió el borrador de la IA antes de publicar, lo que
// publicó manda (y queda en la ficha para no repetir el error). Las contradicciones (p. ej. el
// mínimo para envío gratis dicho de dos formas) van aparte en "dudas", para revisarlas.
//
// Se rehace cuando la publicación suma 3+ respuestas nuevas o la ficha tiene más de 30 días.
// La corre el cron de preguntas en segundo plano, de a pocas por pasada.
import type { Pool } from 'pg'
import { llamarClaude, registrarUso } from '@/lib/ia'

const MINIMO_RESPUESTAS = 3
const FICHAS_POR_PASADA = 2
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

/** Genera (o rehace) unas pocas fichas pendientes de la empresa de `db`. Devuelve cuántas. */
export async function generarFichasPendientes(db: Pool) {
  // Reserva atómica: publicaciones del catálogo con suficientes respuestas y ficha vieja o sin ficha.
  const { rows } = await db.query(
    `UPDATE ml_catalogo SET ficha_pedida_at = NOW()
     WHERE (empresa_id, item_id) IN (
       SELECT c.empresa_id, c.item_id FROM ml_catalogo c
       JOIN LATERAL (SELECT COUNT(*)::int AS n FROM ml_preguntas q
                     WHERE q.item_id = c.item_id AND q.estado = 'ANSWERED' AND q.respuesta IS NOT NULL) r ON TRUE
       LEFT JOIN ml_item_fichas f ON f.item_id = c.item_id
       WHERE r.n >= ${MINIMO_RESPUESTAS}
         AND (c.ficha_pedida_at IS NULL OR c.ficha_pedida_at < NOW() - INTERVAL '15 minutes')
         AND (f.item_id IS NULL OR r.n >= f.n_preguntas + 3 OR f.generada_at < NOW() - INTERVAL '30 days')
       ORDER BY (f.item_id IS NULL) DESC, r.n DESC
       LIMIT ${FICHAS_POR_PASADA} FOR UPDATE OF c SKIP LOCKED)
     RETURNING item_id, titulo, ficha`)
  // n_preguntas guarda el TOTAL respondido (no solo las MAX_PARES leídas): si no, una publicación
  // con más de MAX_PARES respuestas se rehace en cada pasada.
  let hechas = 0
  for (const it of rows) {
    try {
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
      const { resultado, uso, modelo } = await llamarClaude<{ datos: string; dudas: string | null }>({
        sistema: SISTEMA, contenido: L.join('\n'), herramienta: HERRAMIENTA, maxTokens: 900,
      })
      await registrarUso(db, 'fichas', modelo, uso)
      const datos = String(resultado.datos ?? '').trim().slice(0, 1500)
      if (!datos) continue
      await db.query(
        `INSERT INTO ml_item_fichas (item_id, texto, dudas, n_preguntas, generada_at) VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (empresa_id, item_id) DO UPDATE SET texto = EXCLUDED.texto, dudas = EXCLUDED.dudas,
           n_preguntas = EXCLUDED.n_preguntas, generada_at = NOW()`,
        [it.item_id, datos, resultado.dudas?.trim() || null, total])
      hechas++
    } catch (e) {
      console.error('[fichas IA]', it.item_id, e instanceof Error ? e.message : e)
    }
  }
  return hechas
}
