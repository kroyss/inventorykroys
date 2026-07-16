import { NextResponse } from 'next/server'
import { getSessionDb, unauthorized } from '@/lib/session'

// Lista de productos activos con stock y precio para el form de Ventas —
// misma forma (InventoryItem) que carga app/(main)/ventas/page.tsx en el
// server. Se expone como API para poder refrescarla sin recargar la página
// (ver useRefetchOnFocus en VentasClient): así el form abierto detecta stock
// ajustado o productos creados en paralelo.
export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  const { rows } = await db.query(`
    SELECT
      p.id AS product_id, p.code, p.name, p.is_active,
      COALESCE(inv.quantity, 0)::int AS quantity,
      COALESCE(inv.sale_price, pp.final_price_usd, 0)::float AS sale_price,
      COALESCE(pp.final_price_usd, 0)::float AS final_price_usd
    FROM products p
    LEFT JOIN inventory inv ON p.id = inv.product_id
    LEFT JOIN product_pricing pp ON p.id = pp.product_id
    WHERE p.is_active = TRUE
    ORDER BY p.name
  `)
  return NextResponse.json(rows)
}
