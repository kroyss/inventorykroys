import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { tieneModulo } from '@/lib/modulos'
import { ventaParaFormulario } from '@/lib/ventasML'

// GET /api/sales/ml-orden?numero=2000018737735322 → comprador y productos de esa venta en
// MercadoLibre, para llenar el formulario de Ventas (nombre del cliente; productos sugeridos por
// su código ML). Necesita cuentas conectadas (módulo `preguntas`); sin ellas responde 404 y el
// formulario sigue manual.
export async function GET(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (!tieneModulo(session.user, 'preguntas')) return NextResponse.json({ error: 'Sin cuentas de ML conectadas' }, { status: 404 })
  const numero = new URL(req.url).searchParams.get('numero')?.trim() ?? ''
  if (!/^\d{10,20}$/.test(numero)) return NextResponse.json({ error: 'Número inválido' }, { status: 400 })
  try {
    const v = await ventaParaFormulario(db, numero)
    if (!v) return NextResponse.json({ error: 'No se encontró en tus cuentas de MercadoLibre' }, { status: 404 })
    // Producto del sistema por su código ML (se guarda sin el prefijo: MLV768007052 → 768007052).
    const codigos = v.items.map(i => i.itemId.replace(/^[A-Z]{3}/, ''))
    const { rows } = await db.query(
      `SELECT DISTINCT ON (m.ml_code) m.ml_code, p.id AS product_id, p.code, p.name
       FROM product_ml_codes m JOIN products p ON p.id = m.product_id
       WHERE m.is_active AND m.ml_code = ANY($1::text[])
       ORDER BY m.ml_code, p.is_active DESC`, [codigos])
    const items = v.items.map(i => {
      const r = rows.find(x => x.ml_code === i.itemId.replace(/^[A-Z]{3}/, ''))
      return { ...i, producto: r ? { id: r.product_id as number, code: r.code as string, name: r.name as string } : null }
    })
    return NextResponse.json({ cuenta: v.cuenta, comprador: v.comprador, items })
  } catch (err) {
    return apiError(err)
  }
}
