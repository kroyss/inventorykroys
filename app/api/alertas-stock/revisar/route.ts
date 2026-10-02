import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { revisarStockCuenta } from '@/lib/alertasStock'

// POST /api/alertas-stock/revisar → revisa YA el stock publicado de todas las cuentas conectadas
// (sin esperar la hora del cron). Solo lee de MercadoLibre.
export async function POST() {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  try {
    // Como máximo una vez cada 10 minutos por empresa (cuida las llamadas a MercadoLibre).
    const { rows: [u] } = await s.db.query(
      `SELECT MAX(stock_alertas_at) > NOW() - INTERVAL '10 minutes' AS reciente FROM ml_conexiones WHERE estado = 'activa'`)
    if (u?.reciente) return NextResponse.json({ error: 'Ya se revisó hace menos de 10 minutos' }, { status: 429 })
    const { rows: cuentas } = await s.db.query(`SELECT id, nickname FROM ml_conexiones WHERE estado = 'activa' ORDER BY id`)
    const res: { cuenta: string; publicaciones?: number; error?: string }[] = []
    for (const c of cuentas) {
      try {
        res.push({ cuenta: c.nickname, ...(await revisarStockCuenta(s.db, c.id)) })
      } catch (e) {
        res.push({ cuenta: c.nickname, error: e instanceof Error ? e.message : String(e) })
      }
    }
    return NextResponse.json({ ok: true, cuentas: res })
  } catch (err) {
    return apiError(err)
  }
}
