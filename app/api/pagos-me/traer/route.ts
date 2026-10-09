import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPagosME } from '@/lib/pagosME'

/** POST /api/pagos-me/traer → "Traer pagos y guías": cada perfil del vigilante lo toma en su próximo latido (~1 min). */
export async function POST() {
  const s = await sesionPagosME()
  if ('error' in s) return s.error
  try {
    // Doble clic o dos personas a la vez: si hay uno de hace menos de 2 minutos, se reusa.
    const { rows: [ya] } = await s.db.query(
      `SELECT id FROM me_pedidos WHERE pedido_at > NOW() - INTERVAL '2 minutes' ORDER BY id DESC LIMIT 1`)
    if (ya) return NextResponse.json({ ok: true, pedido: ya.id, reusado: true })
    const { rows: [p] } = await s.db.query(`INSERT INTO me_pedidos (pedido_por) VALUES ($1) RETURNING id`, [s.userId])
    return NextResponse.json({ ok: true, pedido: p.id })
  } catch (err) {
    return apiError(err)
  }
}
