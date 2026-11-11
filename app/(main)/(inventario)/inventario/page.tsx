import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { dbDeSesion } from '@/lib/session'
import InventarioClient from '@/components/inventario/InventarioClient'
import type { InventoryItem } from '@/lib/types'
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'
import { redirect } from 'next/navigation'
import { dbGlobal } from '@/lib/db'
import { COUNTRY_TZ } from '@/lib/tz'

import { deApi } from '@/lib/inicial'
import { GET as tasaUltima } from '@/app/api/rates/latest/route'
export const metadata = { title: 'Inventario' }

export default async function InventarioPage() {
  const session = await getServerSession(authOptions)
  if (!puede(session?.user, 'ver_inventario')) redirect('/dashboard')
  const db      = dbDeSesion(session!)

  const { rows } = await db.query(`
    -- Ventas de 6 meses en una sola pasada (12-11, antes subconsulta por producto).
    WITH v6 AS (
      SELECT si.product_id, SUM(si.quantity) AS q
      FROM sales s JOIN sale_items si ON s.id = si.sale_id
      WHERE s.status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL')
        AND s.created_at >= NOW() - INTERVAL '6 months'
      GROUP BY si.product_id
    ),
    v AS (
      SELECT
        p.id                                        AS product_id,
        p.code, p.name, p.is_active, p.stock_por_verificar,
        COALESCE(pp.base_cost,       0)::float      AS base_cost,
        COALESCE(pp.shipping_cost,   0)::float      AS shipping_cost,
        COALESCE(pp.total_cost,      0)::float      AS total_cost,
        COALESCE(pp.final_price_usd, 0)::float      AS final_price_usd,
        COALESCE(pc.profit_percentage, 0)::float    AS profit_percentage,
        inv.id                                      AS inventory_id,
        COALESCE(inv.quantity,   0)::int            AS quantity,
        COALESCE(inv.min_stock,  0)::int            AS min_stock,
        COALESCE(inv.max_stock,  0)::int            AS max_stock,
        COALESCE(inv.sale_price, 0)::float          AS sale_price,
        inv.last_updated,
        COALESCE(v6.q, 0)::int AS ventas_6m
      FROM products p
      LEFT JOIN v6 ON v6.product_id = p.id
      LEFT JOIN product_pricing pp  ON p.id = pp.product_id
      LEFT JOIN profit_categories pc ON pc.id = pp.profit_category_id
      LEFT JOIN inventory       inv ON p.id = inv.product_id
    )
    SELECT
      *,
      CASE
        WHEN NOT is_active         THEN 'INACTIVO'
        WHEN quantity = 0          THEN 'SIN_STOCK'
        WHEN quantity <= min_stock THEN 'BAJO'
        ELSE 'OK'
      END                                AS status,
      ROUND(ventas_6m / 6.0 * 4)::int   AS min_stock_rec,
      ROUND(ventas_6m / 6.0 * 12)::int  AS max_stock_rec
    FROM v
    ORDER BY
      CASE WHEN NOT is_active         THEN 3
           WHEN quantity = 0          THEN 2
           WHEN quantity <= min_stock THEN 1
           ELSE 0
      END DESC,
      name
  `)

  // Mig 148: si el inventario se apagó y se volvió a prender hace menos de 30 días, lo vendido mientras estuvo apagado
  // no se descontó: aviso para hacer un conteo.
  const { rows: [emp] } = await dbGlobal().query(
    `SELECT inventario_desde, inventario_hasta FROM empresas
     WHERE id = $1 AND inventario_hasta IS NOT NULL AND inventario_desde > inventario_hasta
       AND inventario_desde > NOW() - INTERVAL '30 days'`, [session!.user.empresaId])
  // 12-11 (rapidez): el % de exceso (precio ML en VE) viene en el HTML: mismo GET de /api/rates/latest.
  const exceso = session!.user.country === 'VE'
    ? (await deApi<{ excess_percentage?: number }>(tasaUltima, '/api/rates/latest'))?.excess_percentage ?? null : null
  const fecha = (d: Date) => new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', timeZone: COUNTRY_TZ[session!.user.country] }).format(d)

  return (<>
    {emp && (
      <div className="mb-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Estuviste sin inventario del <b>{fecha(new Date(emp.inventario_hasta))}</b> al <b>{fecha(new Date(emp.inventario_desde))}</b>:
          lo que vendiste en esos días no se descontó del stock. Haz un conteo para ponerlo al día
          (<a href="/hoja-inventario" className="underline">hoja de conteo</a>) y carga las diferencias como ajuste.
        </div>
      </div>
    )}
    <InventarioClient
      initialItems={rows as InventoryItem[]}
      acceso={{ config: puede(session!.user, 'inventario_config'), costos: puede(session!.user, 'costos') }}
      country={session!.user.country}
      etiquetas={tieneModulo(session!.user, 'etiquetas')}
      stockML={tieneModulo(session!.user, 'preguntas')}
      excesoInicial={exceso}
    />
  </>)
}
