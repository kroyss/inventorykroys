import { getServerSession } from 'next-auth'
import { PESOS_VINCULADOS, SQL_PESOS_DISTINTOS } from '@/lib/pesosML'
import { authOptions } from '@/lib/auth'
import { dbDeSesion } from '@/lib/session'
import { redirect } from 'next/navigation'
import ProductosClient from '@/components/productos/ProductosClient'
import { cuentasML } from '@/lib/mlCuentas'
import { tieneModulo } from '@/lib/modulos'
import type { Product, ProfitCategory } from '@/lib/types'
import { puede } from '@/lib/permisos'
import { tasaYAjustes } from '@/lib/inicial'
import { AvisoNuevasML } from '@/components/productos/AvisosML'

export const metadata = { title: 'Productos' }

export default async function ProductosPage() {
  const session = await getServerSession(authOptions)
  if (!session || !puede(session.user, 'ver_productos')) redirect('/dashboard')

  const db = dbDeSesion(session)
  const [productsRes, catsRes] = await Promise.all([
    db.query(`
      SELECT
        p.id, p.code, p.name, p.is_active, p.costo_estimado,
        COALESCE(pp.base_cost,              0)::float AS base_cost,
        COALESCE(pp.shipping_cost,          0)::float AS shipping_cost,
        COALESCE(pp.total_cost,             0)::float AS total_cost,
        COALESCE(pp.base_price_usd,         0)::float AS base_price_usd,
        COALESCE(pp.published_price_usd,    0)::float AS published_price_usd,
        COALESCE(pp.final_price_usd,        0)::float AS final_price_usd,
        COALESCE(pp.price_bolivares,        0)::float AS price_bolivares,
        COALESCE(pp.current_discount_percent,0)::float AS discount_percent,
        pc.name                                        AS category_name,
        COALESCE(pp.ganancia_pct, pc.profit_percentage,      0)::float AS profit_percentage,
        pp.profit_category_id,
        pp.ganancia_pct::float AS ganancia_pct,
        p.weight_kg::float                             AS weight_kg,
        p.peso_origen,
        ${SQL_PESOS_DISTINTOS}                         AS pesos_ml,
        -- 14-11 (el dueño): columna Peso ME; cuándo se leyó del portal (la publicación vinculada más reciente).
        (SELECT to_char(MAX(mp.actualizado_at) AT TIME ZONE 'America/Caracas', 'DD/MM/YYYY') FROM product_ml_codes pm
          JOIN me_productos mp ON mp.publicacion = 'MLV' || split_part(pm.ml_code, ':', 1) AND mp.peso_kg > 0
          WHERE pm.product_id = p.id AND pm.is_active AND pm.unidades = 1) AS peso_me_at,
        COALESCE(inv.sale_price,            0)::float AS sale_price,
        COALESCE(inv.quantity,              0)::int   AS quantity
      FROM products p
      LEFT JOIN product_pricing   pp  ON p.id = pp.product_id
      LEFT JOIN profit_categories pc  ON pp.profit_category_id = pc.id
      LEFT JOIN inventory         inv ON p.id = inv.product_id
      LEFT JOIN (${PESOS_VINCULADOS}) pv ON pv.product_id = p.id
      ORDER BY p.is_active DESC, p.name
    `),
    db.query(`
      SELECT id, name, profit_percentage, color, description, display_order
      FROM profit_categories WHERE is_active = TRUE ORDER BY display_order
    `),
  ])

  const conML = puede(session.user, 'importar_ml') && tieneModulo(session.user, 'preguntas')
  return (
    <div className="space-y-3">
    {conML && <AvisoNuevasML />}
    <ProductosClient
      inicialTasa={await tasaYAjustes()}
      initialProducts={productsRes.rows as Product[]}
      profitCategories={catsRes.rows as ProfitCategory[]}
      country={session.user.country}
      mlAccounts={await cuentasML(db)}
      descuento={tieneModulo(session.user, 'descuento_ml')}
      importarML={puede(session.user, 'importar_ml') && tieneModulo(session.user, 'preguntas')}
      catalogo={tieneModulo(session.user, 'catalogo_pdf')}
      categorias={tieneModulo(session.user, 'precios_categorias')}
      promociones={tieneModulo(session.user, 'promociones') && puede(session.user, 'promociones')}
      publicarML={tieneModulo(session.user, 'publicaciones') && tieneModulo(session.user, 'preguntas') && puede(session.user, 'editar_publicaciones')}
      costosML={puede(session.user, 'costos_ml_config')}
      completarCostos={puede(session.user, 'costos')}
    />
    </div>
  )
}
