import { getServerSession } from 'next-auth'
import { facturasHabilitadas, tieneModulo, ventasDesdeML } from '@/lib/modulos'
import { authOptions } from '@/lib/auth'
import { dbDeSesion } from '@/lib/session'
import VentasClient from '@/components/ventas/VentasClient'
import type { InventoryItem } from '@/lib/types'
import { puede } from '@/lib/permisos'
import { redirect } from 'next/navigation'
import { deApi } from '@/lib/inicial'
import { GET as listarVentas } from '@/app/api/sales/route'
import type { SalesResponse } from '@/components/ventas/VentasClient'

export const metadata = { title: 'Ventas' }

export default async function VentasPage() {
  const session = await getServerSession(authOptions)
  if (!puede(session?.user, 'ver_ventas')) redirect('/dashboard')
  const db      = dbDeSesion(session!)

  // Sales are fetched client-side with server pagination (10/page) via /api/sales.
  // Here we only load the active product list for the create/edit form.
  // 12-11 (rapidez): la 1ª página de ventas (la que se ve al abrir) viene en el HTML, en paralelo con los productos.
  const [productsRes, inicial] = await Promise.all([db.query(`
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
  `), deApi<SalesResponse>(listarVentas, '/api/sales?page=1&pageSize=15&sort_by=created_at&sort_dir=desc')])

  return (
    <VentasClient
      inicial={inicial}
      products={productsRes.rows as InventoryItem[]}
      userRole={session!.user.role}
      country={session!.user.country}
      facturas={facturasHabilitadas(session!.user)}
      porConfirmar={tieneModulo(session!.user, 'preguntas')}
      verificarPagos={tieneModulo(session!.user, 'verificar_pagos')}
      // 25-10: donde las guías van solas a Despachos al verificar (clientes), el pago también se verifica aquí.
      presupuestos={tieneModulo(session!.user, 'presupuestos')}
      pagoEnFila={ventasDesdeML(session!.user) && tieneModulo(session!.user, 'pagos_me') && puede(session!.user, 'ver_pagos_me')}
    />
  )
}
