import { NextRequest, NextResponse } from 'next/server'
import { conEmpresa, dbGlobal } from '@/lib/db'
import { costoDe } from '@/lib/ia'
import { armarContexto, bloqueContexto, corregirBorrador, datosCompatibilidad, datosPublicacion, textoVendedor } from '@/lib/preguntas'
import { motivosRevisar } from '@/lib/iaAutomatica'
import { verificarBorrador } from '@/lib/verificadorIA'
import type { Country } from '@/lib/types'

// Medición interna (12-11, idea del dueño): ¿cuántas FRENADAS saldrían solas si la IA corrige su respuesta con lo que
// encontró el revisor? Solo las frenadas por motivos que se pueden arreglar escribiendo. No publica, no guarda.
//   curl "http://127.0.0.1:8504/api/cron/ia-corregir?key=…&empresa=1&n=10&offset=0"
const NO_ARREGLABLE = /^(Tope por comprador|Pregunta por un medio de pago|Da un monto|Pregunta precio en divisa|Confirma compatibilidad|La publicación|Publicación|Fuera de horario)/i
export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams
  if (!process.env.CRON_SECRET || q.get('key') !== process.env.CRON_SECRET) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const empresa = Number(q.get('empresa') ?? 1)
  const n = Math.max(1, Math.min(12, Number(q.get('n') ?? 10))), offset = Number(q.get('offset') ?? 0)
  const desde = q.get('desde') ?? '2026-11-07'
  const { rows: [e] } = await dbGlobal().query(`SELECT country FROM empresas WHERE id = $1`, [empresa])
  if (!e) return NextResponse.json({ error: 'Empresa no existe' }, { status: 404 })
  const resultados = await conEmpresa(empresa, e.country as Country, async db => {
    const { rows } = await db.query(
      `SELECT p.id::text, p.texto, p.item_estado, p.ia_auto FROM ml_preguntas p
       WHERE p.ia_auto->>'decision' = 'revisar' AND p.ia_auto->>'fecha' >= $3
         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(p.ia_auto->'motivos') m WHERE m ~* $4)
       ORDER BY p.ia_auto->>'fecha' OFFSET $1 LIMIT $2`, [offset, n, desde, NO_ARREGLABLE.source])
    const out = []
    for (const r of rows) {
      try {
        const a = r.ia_auto
        const c = await armarContexto(db, Number(r.id), e.country)
        const motivosAntes: string[] = a.motivos ?? []
        const k = await corregirBorrador(c, a.respuesta ?? '', motivosAntes)
        const v = k.respuesta ? await verificarBorrador(bloqueContexto(c), c.pregunta.texto, k.respuesta, undefined, true, true) : null
        const b = { respuesta: k.respuesta, confianza: k.confianza, falta_dato: k.falta_dato, verificacion: v ? (v.ok ? 'ok' : v.motivo) : null }
        const motivos = motivosRevisar(b, r.item_estado ?? 'active', c.pregunta.texto, datosPublicacion(c), true, textoVendedor(c), datosCompatibilidad(c))
        const costo = costoDe(k.llamada.modelo, k.llamada.uso) + (v ? costoDe(v.llamada.modelo, v.llamada.uso) : 0)
        out.push({ id: r.id, pregunta: r.texto, marca: a.marca ?? null, antes: a.respuesta, motivosAntes, despues: k.respuesta,
          confianza: k.confianza, decision: motivos.length ? 'revisar' : 'sola', motivos, costo })
      } catch (err) {
        out.push({ id: r.id, pregunta: r.texto, error: err instanceof Error ? err.message : String(err) })
      }
    }
    return out
  })
  return NextResponse.json({ resultados })
}
