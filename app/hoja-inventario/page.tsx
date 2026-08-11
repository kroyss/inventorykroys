import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { redirect } from 'next/navigation'
import HojaInventario, { type HojaRow } from '@/components/inventario/HojaInventario'
import { localCostFactor } from '@/lib/localCost'
import { COUNTRY_TZ, DEFAULT_TZ, currentDate } from '@/lib/tz'

export const metadata = { title: 'Hoja de inventario' }

export default async function HojaInventarioPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  // Solo admin genera la hoja (mismo criterio que el reporte de inventario).
  if (session.user.role !== 'admin') redirect('/inventario')

  const db = getDb(session.user.country)
  // CO: el costo (USD) se expresa en pesos (×TRM), igual que en /api/reports/inventory.
  const costFactor = await localCostFactor(session.user.country)

  const { rows } = await db.query(`
    SELECT
      p.code, p.name,
      COALESCE(i.quantity,  0)::int                       AS quantity,
      COALESCE(i.min_stock, 0)::int                       AS min_stock,
      COALESCE(i.max_stock, 0)::int                       AS max_stock,
      COALESCE(pp.total_cost, 0)::float                   AS total_cost,
      COALESCE(i.sale_price, pp.final_price_usd, 0)::float AS sale_price,
      COALESCE((
        SELECT SUM(si.quantity)
        FROM sales s
        JOIN sale_items si ON s.id = si.sale_id
        WHERE si.product_id = p.id
          AND s.status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL')
          AND s.created_at >= NOW() - INTERVAL '6 months'
      ), 0)::int                                          AS ventas_6m
    FROM products p
    LEFT JOIN product_pricing pp ON p.id = pp.product_id
    LEFT JOIN inventory i        ON p.id = i.product_id
    WHERE p.is_active = TRUE
    ORDER BY p.name
  `)

  const items: HojaRow[] = rows.map(r => {
    const quantity  = r.quantity as number
    const minStock  = r.min_stock as number
    const totalCost = Math.round((r.total_cost as number) * costFactor * 100) / 100
    const salePrice = r.sale_price as number
    return {
      code:        r.code as string,
      name:        r.name as string,
      quantity,
      min_stock:   minStock,
      max_stock:   r.max_stock as number,
      ventas_6m:   r.ventas_6m as number,
      total_cost:  totalCost,
      sale_price:  Math.round(salePrice * 100) / 100,
      valor_costo: Math.round(quantity * totalCost * 100) / 100,
      valor_venta: Math.round(quantity * salePrice * 100) / 100,
      status:      quantity === 0 ? 'SIN_STOCK' : (minStock > 0 && quantity <= minStock ? 'BAJO' : 'OK'),
    }
  })

  return (
    <HojaInventario
      items={items}
      country={session.user.country}
      fecha={currentDate(COUNTRY_TZ[session.user.country] ?? DEFAULT_TZ)}
    />
  )
}
