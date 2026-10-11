import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { tieneModulo } from '@/lib/modulos'
import { contextoDeVenta } from '@/lib/ventaContexto'

// GET /api/sales/ml-orden/contexto?numero=2000… → "Lo que se habló" de esa venta en MercadoLibre
// (lo ofertado con foto y variante, notas, últimos mensajes, preguntas previas) para Nueva venta.
// Necesita cuentas conectadas (módulo `preguntas`); sin ellas responde 404.
export async function GET(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (!tieneModulo(session.user, 'preguntas')) return NextResponse.json({ error: 'Sin cuentas de ML conectadas' }, { status: 404 })
  const numero = new URL(req.url).searchParams.get('numero')?.trim() ?? ''
  if (!/^\d{10,20}$/.test(numero)) return NextResponse.json({ error: 'Número inválido' }, { status: 400 })
  try {
    const c = await contextoDeVenta(db, numero)
    if (!c) return NextResponse.json({ error: 'No se encontró en tus cuentas de MercadoLibre' }, { status: 404 })
    return NextResponse.json(c)
  } catch (err) {
    return apiError(err)
  }
}
