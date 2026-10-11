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
    // Productos del sistema por su código ML (se guarda sin el prefijo: MLV768007052 → 768007052).
    // Un mismo código puede estar en varios productos (combos o publicaciones repetidas): entonces
    // no se elige ninguno solo; van todos en `opciones` y la persona decide.
    const codigos = v.items.map(i => i.itemId.replace(/^[A-Z]{3}/, ''))
    const { rows } = await db.query(
      `SELECT DISTINCT m.ml_code, p.id AS product_id, p.code, p.name
       FROM product_ml_codes m JOIN products p ON p.id = m.product_id
       WHERE m.is_active AND p.is_active AND m.ml_code = ANY($1::text[])
       ORDER BY m.ml_code, p.code`, [codigos])
    const items = v.items.map(i => {
      const opciones = rows.filter(x => x.ml_code === i.itemId.replace(/^[A-Z]{3}/, ''))
        .map(r => ({ id: r.product_id as number, code: r.code as string, name: r.name as string }))
      return { ...i, producto: opciones.length === 1 ? opciones[0] : null, opciones }
    })
    return NextResponse.json({ cuenta: v.cuenta, comprador: v.comprador, fecha: v.fecha, items })
  } catch (err) {
    return apiError(err)
  }
}
