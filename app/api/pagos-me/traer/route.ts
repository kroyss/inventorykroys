import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPagosME } from '@/lib/pagosME'
import { esDemo } from '@/lib/demo'
import { asegurarPagosDemo, traerDemo } from '@/lib/demoDatos'
import { estadoTraida, ocupada } from '@/lib/meTraida'

/** POST /api/pagos-me/traer → "Traer pagos y guías": cada perfil del vigilante lo toma en su próximo latido (~1 min). */
export async function POST() {
  const s = await sesionPagosME()
  if ('error' in s) return s.error
  try {
    // Demo: la PC sembrada "responde" al momento (lib/demoDatos.ts).
    if (await esDemo(s.db)) {
      await asegurarPagosDemo(s.db)
      return NextResponse.json({ ok: true, pedido: await traerDemo(s.db, s.userId), demo: true })
    }
    // 12-11 (el dueño): UNA traída a la vez. Si hay una corriendo (o esperando a la PC), no se crea otra: se usa esa.
    const e = await estadoTraida(s.db)
    if (ocupada(e)) return NextResponse.json({ ok: true, pedido: e!.id, reusado: true })
    const { rows: [p] } = await s.db.query(`INSERT INTO me_pedidos (pedido_por) VALUES ($1) RETURNING id`, [s.userId])
    return NextResponse.json({ ok: true, pedido: p.id })
  } catch (err) {
    return apiError(err)
  }
}
