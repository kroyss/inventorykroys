import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { tieneModulo } from '@/lib/modulos'
import { sesionPromociones } from '@/lib/promocionesSesion'

/** POST /api/promociones/pesos → pide al programa de la PC (Pagos ME) una traída que también lea los
 *  pesos del portal de MercadoEnvíos. La toma en ~1 min si la PC está prendida. */
export async function POST() {
  const s = await sesionPromociones()
  if ('error' in s) return s.error
  if (!tieneModulo(s.session.user, 'pagos_me')) {
    return NextResponse.json({ error: 'Los pesos los trae el programa de Pagos ME, que no está activo en esta empresa' }, { status: 400 })
  }
  try {
    const { rows: [ya] } = await s.db.query(
      `SELECT id FROM me_pedidos WHERE pedido_at > NOW() - INTERVAL '2 minutes' ORDER BY id DESC LIMIT 1`)
    if (ya) {
      await s.db.query(`UPDATE me_pedidos SET pesos = TRUE WHERE id = $1`, [ya.id])
      return NextResponse.json({ ok: true, pedido: ya.id })
    }
    const { rows: [p] } = await s.db.query(
      `INSERT INTO me_pedidos (pedido_por, pesos) VALUES ($1, TRUE) RETURNING id`, [s.userId])
    return NextResponse.json({ ok: true, pedido: p.id })
  } catch (err) {
    return apiError(err)
  }
}
