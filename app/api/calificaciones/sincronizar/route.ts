import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { sincronizarOrdenes } from '@/lib/calificacionesML'

// POST /api/calificaciones/sincronizar → trae ya las ventas de ML de todas las cuentas.
export async function POST() {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  try {
    const { rows: cuentas } = await s.db.query(`SELECT id, nickname FROM ml_conexiones WHERE estado = 'activa'`)
    const resultado: { cuenta: string; ventas?: number; error?: string }[] = []
    for (const c of cuentas) {
      try { resultado.push({ cuenta: c.nickname, ventas: await sincronizarOrdenes(s.db, c.id, true) }) }
      catch (e) { resultado.push({ cuenta: c.nickname, error: e instanceof Error ? e.message : String(e) }) }
    }
    return NextResponse.json({ resultado })
  } catch (err) {
    return apiError(err)
  }
}
