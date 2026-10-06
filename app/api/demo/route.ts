import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { esDemo } from '@/lib/demo'
import { restaurarDemo, SECCIONES_DEMO, type SeccionDemo } from '@/lib/demoDatos'
import { SQL_BANDEJA_ML } from '@/lib/calificacionesML'
import { SQL_PENDIENTE, SQL_REPORTABLE } from '@/lib/reportador'
import { forbidden, getSessionDb, unauthorized } from '@/lib/session'

// Cuenta de demostración (lib/demo.ts): lo pendiente de cada sección y "Restaurar" (vuelve a como
// estaba: lo hecho en vivo se borra y se siembra todo de nuevo). Solo en una empresa en modo demo.
async function sesionDemo(admin = false) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return { error: unauthorized() }
  if (!(await esDemo(db))) return { error: NextResponse.json({ error: 'Esta empresa no es de demostración' }, { status: 404 }) }
  if (admin && session.user.role !== 'admin') return { error: forbidden() }
  return { session, db }
}

export async function GET() {
  const s = await sesionDemo()
  if ('error' in s) return s.error
  try {
    const { rows: [n] } = await s.db.query(
      `SELECT
         (SELECT COUNT(*) FROM ml_ordenes o WHERE o.id BETWEEN 2000099991000001 AND 2000099991099999
            AND NOT EXISTS (SELECT 1 FROM despacho_etiquetas e WHERE e.impresa AND e.venta = o.id::text))::int AS despachos,
         (SELECT COUNT(*) FROM despacho_etiquetas e JOIN despacho_lotes l ON l.id = e.lote_id JOIN despacho_jornadas j ON j.id = l.jornada_id
            WHERE ${SQL_REPORTABLE} AND ${SQL_PENDIENTE})::int AS reportador,
         (SELECT COUNT(*) FROM ml_preguntas WHERE estado = 'UNANSWERED')::int AS preguntas,
         (SELECT COUNT(*) FROM ml_conversaciones WHERE sin_leer > 0)::int AS mensajes,
         (SELECT COUNT(*) FROM (${SQL_BANDEJA_ML}) b WHERE b.sugerencia <> 'esperar')::int AS calificaciones,
         (SELECT COUNT(*) FROM ml_stock_alertas WHERE disponible < 3 AND actualizado_at > NOW() - INTERVAL '1 day')::int AS stock`, [3])
    return NextResponse.json({ secciones: SECCIONES_DEMO.map(x => ({ ...x, pendientes: n[x.id] as number })), esAdmin: s.session.user.role === 'admin' })
  } catch (err) {
    return apiError(err)
  }
}

const ids = SECCIONES_DEMO.map(x => x.id) as [SeccionDemo, ...SeccionDemo[]]
const Body = z.object({ secciones: z.array(z.enum(ids)).min(1) })

export async function POST(req: NextRequest) {
  const s = await sesionDemo(true)
  if ('error' in s) return s.error
  try {
    const { secciones } = Body.parse(await req.json())
    // En el orden de SECCIONES_DEMO: Despachos primero (borra lo hecho en vivo en Despachos).
    await restaurarDemo(s.db, ids.filter(x => secciones.includes(x)))
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
