import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPublicaciones } from '@/lib/preguntasSesion'
import { puede } from '@/lib/permisos'
import { contarLlegadas } from '@/lib/alertasStock'
import { tieneModulo } from '@/lib/modulos'

// GET /api/alertas-stock/llegadas (24-11, pedido del dueño): después de recibir una compra o importación, o de cargar una
// entrada en el inventario, cuántas publicaciones pausadas o en 0 en ML ya tienen inventario por ESA entrada (la de los
// últimos minutos) → components/layout/AvisoLlegada.tsx («Ver y activar →» lleva a Mis publicaciones, filtro «Para activar»).
// Sin Mis publicaciones o sin Inventario: { total: 0 } (no avisa).
const MINUTOS = 5

export async function GET() {
  const s = await sesionPublicaciones()   // el aviso lleva a Mis publicaciones: solo quien entra ahí
  if ('error' in s) return NextResponse.json({ total: 0 })
  if (!tieneModulo(s.session.user, 'inventario') || !puede(s.session.user, 'ver_inventario')) return NextResponse.json({ total: 0 })
  try {
    const c = await contarLlegadas(s.db, new Date(Date.now() - MINUTOS * 60_000))
    return NextResponse.json(c)
  } catch (err) {
    return apiError(err)
  }
}
