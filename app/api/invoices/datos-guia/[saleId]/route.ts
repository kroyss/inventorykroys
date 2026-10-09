import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { facturasHabilitadas } from '@/lib/modulos'

// GET /api/invoices/datos-guia/[saleId] → datos del comprador leídos de su guía ZOOM/TEALCA en Despachos
// (migración 075), para precargar "Facturar venta". null si la venta no tiene guía subida.
export async function GET(_: NextRequest, { params }: { params: Promise<{ saleId: string }> }) {
  const { saleId } = await params
  if (!/^\d+$/.test(saleId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (!facturasHabilitadas(session.user)) return forbidden()
  try {
    const { rows: [g] } = await db.query(
      `SELECT e.carrier, e.fac_documento AS documento, e.fac_telefono AS telefono,
              e.fac_ciudad AS ciudad, e.fac_direccion AS direccion
       FROM sales s JOIN despacho_etiquetas e ON e.venta = s.ml_order_number
       WHERE s.id = $1
       ORDER BY e.impresa DESC, e.id DESC LIMIT 1`, [saleId])
    return NextResponse.json(g ?? null)
  } catch (err) {
    return apiError(err)
  }
}
