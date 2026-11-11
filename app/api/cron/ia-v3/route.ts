import { NextRequest, NextResponse } from 'next/server'
import { conEmpresa, dbGlobal } from '@/lib/db'
import { costoDe } from '@/lib/ia'
import { armarContexto, bloqueContexto, datosCompatibilidad, datosPublicacion, textoVendedor } from '@/lib/preguntas'
import { motivosRevisar } from '@/lib/iaAutomatica'
import { verificarBorrador } from '@/lib/verificadorIA'
import type { Country } from '@/lib/types'

// Medición interna (11-11, pedido del dueño): el verificador v3 (por tipo de afirmación) sobre las preguntas que la IA
// automática ya procesó y el dueño MARCÓ. Se vuelve a verificar LA MISMA respuesta guardada (no se pide otra) y se
// recalculan los frenos: así se compara solo el verificador. No publica, no guarda, no descuenta créditos.
//   curl "http://127.0.0.1:8504/api/cron/ia-v3?key=…&empresa=1&n=10&offset=0&desde=2026-11-07"
export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams
  if (!process.env.CRON_SECRET || q.get('key') !== process.env.CRON_SECRET) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const empresa = Number(q.get('empresa') ?? 1)
  const n = Math.max(1, Math.min(15, Number(q.get('n') ?? 10))), offset = Number(q.get('offset') ?? 0)
  const desde = q.get('desde') ?? '2026-11-07'
  const { rows: [e] } = await dbGlobal().query(`SELECT country FROM empresas WHERE id = $1`, [empresa])
  if (!e) return NextResponse.json({ error: 'Empresa no existe' }, { status: 404 })
  const resultados = await conEmpresa(empresa, e.country as Country, async db => {
    const { rows } = await db.query(
      `SELECT p.id::text, p.texto, p.item_estado, p.ia_auto FROM ml_preguntas p
       WHERE p.ia_auto->>'marca' IS NOT NULL AND p.ia_auto->>'fecha' >= $3 AND COALESCE(p.ia_auto->>'respuesta', '') <> ''
       ORDER BY p.ia_auto->>'fecha' OFFSET $1 LIMIT $2`, [offset, n, desde])
    return Promise.all(rows.map(async r => {
      try {
        const a = r.ia_auto
        const c = await armarContexto(db, Number(r.id), e.country)
        const v = await verificarBorrador(bloqueContexto(c), c.pregunta.texto, a.respuesta, undefined, true, true)
        // Frenos que no dependen del momento: el tope por comprador y el horario no se recalculan (se quitan).
        const b = { respuesta: a.respuesta, confianza: a.confianza, falta_dato: null, verificacion: v.ok ? 'ok' : v.motivo }
        // La publicación: el estado de CUANDO se procesó (hoy puede estar pausada).
        const motivos = motivosRevisar(b, r.item_estado ?? 'active', c.pregunta.texto, datosPublicacion(c), true, textoVendedor(c), datosCompatibilidad(c))
        return { id: r.id, pregunta: r.texto, respuesta: a.respuesta, marca: a.marca, antes: a.decision,
          antesMotivos: (a.motivos ?? []).filter((m: string) => !m.startsWith('Tope por comprador')),
          v3: motivos.length ? 'revisar' : 'sola', motivos, costo: costoDe(v.llamada.modelo, v.llamada.uso) }
      } catch (err) {
        return { id: r.id, pregunta: r.texto, error: err instanceof Error ? err.message : String(err) }
      }
    }))
  })
  return NextResponse.json({ resultados })
}
