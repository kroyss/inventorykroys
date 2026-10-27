import { NextRequest, NextResponse } from 'next/server'
import { conEmpresa, dbGlobal } from '@/lib/db'
import { costoDe } from '@/lib/ia'
import { armarContexto, bloqueContexto, CONTEXTO_ACTUAL, CONTEXTO_RECORTADO, pedirBorrador } from '@/lib/preguntas'
import type { Country } from '@/lib/types'

// Prueba interna (27-10): ¿la IA responde igual de bien con MENOS contexto (CONTEXTO_RECORTADO) que con el de siempre?
// Toma preguntas ya respondidas de una empresa, pide el borrador con los dos contextos y devuelve las dos respuestas,
// la real del vendedor, los tokens y el costo. No publica nada ni descuenta créditos (no se registra en ia_uso).
// Solo con CRON_SECRET, desde el servidor:
//   curl "http://127.0.0.1:8504/api/cron/ia-comparar?key=…&empresa=1&n=10&offset=0"
export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams
  if (!process.env.CRON_SECRET || q.get('key') !== process.env.CRON_SECRET) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const empresa = Number(q.get('empresa') ?? 1)
  const n = Math.min(10, Number(q.get('n') ?? 5)), offset = Number(q.get('offset') ?? 0)
  const { rows: [e] } = await dbGlobal().query(`SELECT country FROM empresas WHERE id = $1`, [empresa])
  if (!e) return NextResponse.json({ error: 'Empresa no existe' }, { status: 404 })
  const resultados = await conEmpresa(empresa, e.country as Country, async db => {
    // Respondidas a mano en los últimos 30 días (no las de respuesta rápida tal cual: esas no usan IA).
    const { rows } = await db.query(
      `SELECT p.id, p.texto, p.respuesta FROM ml_preguntas p
       WHERE p.estado = 'ANSWERED' AND p.respuesta IS NOT NULL AND p.fecha > NOW() - INTERVAL '30 days'
         AND NOT EXISTS (SELECT 1 FROM respuestas_origen o WHERE o.modulo = 'preguntas' AND o.ref = p.id::text AND o.fuente IN ('rapida', 'sugerida', 'automatica'))
       ORDER BY p.fecha DESC OFFSET $1 LIMIT $2`, [offset, n])
    const out = []
    for (const r of rows) {
      try {
        const c = await armarContexto(db, Number(r.id), e.country)
        const lado = async (rec: typeof CONTEXTO_ACTUAL) => {
          const b = await pedirBorrador(c, false, rec)
          const ent = b.llamadas.reduce((a, l) => a + (l.uso.input_tokens ?? 0) + (l.uso.cache_read_input_tokens ?? 0) + (l.uso.cache_creation_input_tokens ?? 0), 0)
          return { respuesta: b.respuesta, confianza: b.confianza, falta: b.falta_dato, modelo: b.modelo, entrada: ent,
            caracteres: bloqueContexto(c, rec).length, costo: b.llamadas.reduce((a, l) => a + costoDe(l.modelo, l.uso, l.lote), 0) }
        }
        out.push({ id: r.id, pregunta: r.texto, real: r.respuesta, actual: await lado(CONTEXTO_ACTUAL), recortado: await lado(CONTEXTO_RECORTADO) })
      } catch (err) {
        out.push({ id: r.id, pregunta: r.texto, error: err instanceof Error ? err.message : String(err) })
      }
    }
    return out
  })
  return NextResponse.json({ resultados })
}
