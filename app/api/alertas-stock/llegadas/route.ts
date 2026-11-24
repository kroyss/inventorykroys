import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionStock } from '@/lib/preguntasSesion'
import { contarLlegadas } from '@/lib/alertasStock'
import { tieneModulo } from '@/lib/modulos'

// GET /api/alertas-stock/llegadas (24-11, pedido del dueño): después de recibir una compra o importación, o de cargar una
// entrada en el inventario, cuántas publicaciones pausadas o en 0 en ML ya tienen inventario por ESA entrada (la de los
// últimos minutos) → components/layout/AvisoLlegada.tsx («Activarlas →» lleva a Automatizaciones → Stock).
// Sin Stock o sin Inventario: { total: 0 } (no avisa).
const MINUTOS = 5

export async function GET() {
  const s = await sesionStock()
  if ('error' in s) return NextResponse.json({ total: 0 })
  if (!tieneModulo(s.session.user, 'inventario')) return NextResponse.json({ total: 0 })
  try {
    const c = await contarLlegadas(s.db, new Date(Date.now() - MINUTOS * 60_000))
    return NextResponse.json({ ...c, vista: c.pausadas > c.agotadas ? 'pausadas' : 'agotadas' })
  } catch (err) {
    return apiError(err)
  }
}
