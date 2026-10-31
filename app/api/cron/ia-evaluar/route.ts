import { NextRequest, NextResponse } from 'next/server'
import { conEmpresa, dbGlobal } from '@/lib/db'
import { costoDe, llamarClaude, MODELO_IA } from '@/lib/ia'
import { armarContexto, pedirBorrador } from '@/lib/preguntas'
import type { Country } from '@/lib/types'

// Evaluación interna (31-10, pedido del dueño): "si la IA hubiese respondido sola mis preguntas de octubre, ¿cómo me
// habría ido?". Toma preguntas ya respondidas (al azar, con semilla), pide el borrador como lo pediría el botón y un
// evaluador (Sonnet) lo compara con lo que respondió el vendedor. No publica nada ni descuenta créditos (no va a ia_uso).
// Solo con CRON_SECRET, desde el servidor:
//   curl "http://127.0.0.1:8504/api/cron/ia-evaluar?key=…&empresa=1&desde=2026-10-01&hasta=2026-11-01&n=10&offset=0&semilla=0.31"
const JUEZ = `Evalúas una respuesta escrita por una IA a una pregunta de un comprador en MercadoLibre Venezuela, comparándola con la respuesta REAL que publicó el vendedor (que conoce su negocio). La IA no vio la respuesta real.

Veredicto:
- "equivalente": dice lo mismo en lo importante (puede estar redactada distinto).
- "correcta_distinta": no dice lo mismo, pero es correcta y útil (no contradice al vendedor ni inventa).
- "incompleta": no contesta alguna parte de la pregunta, o la esquiva, pero no dice nada falso.
- "incorrecta": contradice al vendedor o afirma algo falso o inventado (disponible cuando no hay, envío gratis que no aplica, medida, compatibilidad, precio, plazo).
- "vacia": la IA no propuso respuesta.
grave = true si publicarla habría causado un problema real (venta perdida, reclamo, promesa falsa).
Ten en cuenta que el stock, precio y políticas pudieron cambiar desde la fecha de la pregunta: si la IA contradice al vendedor solo por eso, márcalo en el comentario.

Siempre termina llamando a la herramienta evaluar.`

const HERRAMIENTA = {
  name: 'evaluar',
  description: 'Entrega la evaluación.',
  input_schema: {
    type: 'object',
    properties: {
      veredicto: { type: 'string', enum: ['equivalente', 'correcta_distinta', 'incompleta', 'incorrecta', 'vacia'] },
      grave: { type: 'boolean' },
      por_cambio: { type: 'boolean', description: 'La diferencia se explica porque el stock, precio o política cambió desde entonces.' },
      comentario: { type: 'string', description: 'Una frase.' },
    },
    required: ['veredicto', 'grave', 'por_cambio', 'comentario'],
  },
}

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams
  if (!process.env.CRON_SECRET || q.get('key') !== process.env.CRON_SECRET) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const empresa = Number(q.get('empresa') ?? 1)
  const n = Math.min(10, Number(q.get('n') ?? 5)), offset = Number(q.get('offset') ?? 0)
  const semilla = Math.max(-1, Math.min(1, Number(q.get('semilla') ?? 0.31)))
  const { rows: [e] } = await dbGlobal().query(`SELECT country FROM empresas WHERE id = $1`, [empresa])
  if (!e) return NextResponse.json({ error: 'Empresa no existe' }, { status: 404 })
  const resultados = await conEmpresa(empresa, e.country as Country, async db => {
    // Orden al azar pero fijo (la misma semilla en cada tanda): así offset recorre la misma muestra.
    await db.query(`SELECT setseed($1)`, [semilla])
    const { rows } = await db.query(
      `WITH m AS (SELECT p.id, p.texto, p.respuesta, random() AS r FROM ml_preguntas p
                  WHERE p.estado = 'ANSWERED' AND p.respuesta IS NOT NULL AND p.fecha >= $1::date AND p.fecha < $2::date ORDER BY p.id)
       SELECT m.id, m.texto, m.respuesta,
              (SELECT o.fuente FROM respuestas_origen o WHERE o.modulo = 'preguntas' AND o.ref = m.id::text ORDER BY o.fecha DESC LIMIT 1) AS fuente
       FROM m ORDER BY m.r OFFSET $3 LIMIT $4`,
      [q.get('desde') ?? '2026-10-01', q.get('hasta') ?? '2026-11-01', offset, n])
    const out = []
    for (const r of rows) {
      try {
        const c = await armarContexto(db, Number(r.id), e.country)
        const b = await pedirBorrador(c, false)
        const costo = b.llamadas.reduce((a, l) => a + costoDe(l.modelo, l.uso, l.lote), 0)
        const { resultado: j, uso, modelo } = await llamarClaude<{ veredicto: string; grave: boolean; por_cambio: boolean; comentario: string }>({
          sistema: JUEZ, herramienta: HERRAMIENTA, modelo: MODELO_IA, maxTokens: 300,
          contenido: `PREGUNTA:\n${r.texto}\n\nRESPUESTA REAL DEL VENDEDOR:\n${r.respuesta}\n\nRESPUESTA DE LA IA (confianza ${b.confianza}):\n${b.respuesta || '(vacía)'}`,
        })
        out.push({ id: r.id, fuente: r.fuente ?? 'sin registro', pregunta: r.texto, real: r.respuesta, ia: b.respuesta, confianza: b.confianza, verificacion: b.verificacion,
          modelo: b.modelo, costo, costo_juez: costoDe(modelo, uso), ...j })
      } catch (err) {
        out.push({ id: r.id, pregunta: r.texto, error: err instanceof Error ? err.message : String(err) })
      }
    }
    return out
  })
  return NextResponse.json({ resultados })
}
