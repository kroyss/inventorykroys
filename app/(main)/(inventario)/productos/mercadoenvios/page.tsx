import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { dbDeSesion } from '@/lib/session'
import { redirect } from 'next/navigation'
import { tieneModulo } from '@/lib/modulos'
import MercadoEnviosClient from '@/components/productos/MercadoEnviosClient'
import PublicacionesMLTabs from '@/components/productos/PublicacionesMLTabs'
import type { Product } from '@/lib/types'
import { puede } from '@/lib/permisos'
import { tasaYAjustes } from '@/lib/inicial'
import { PESOS_VINCULADOS, SQL_PESOS_DISTINTOS } from '@/lib/pesosML'

export const metadata = { title: 'MercadoEnvíos' }

export default async function MercadoEnviosPage() {
  const session = await getServerSession(authOptions)
  if (!session || !puede(session.user, 'ver_productos')) redirect('/dashboard')
  // Función exclusiva de VE (tabla de envíos por peso de ML Venezuela).
  if (session.user.country !== 'VE' || !tieneModulo(session.user, 'descuento_ml')) redirect('/productos')

  const db = dbDeSesion(session)
  // 12-11 (rapidez): solo las columnas que usa la pantalla (antes 17 por producto: 769 KB de HTML).
  const productsRes = await db.query(`
    SELECT
      p.id, p.code, p.name,
      COALESCE(pp.total_cost,             0)::float AS total_cost,
      pc.name                                        AS category_name,
      COALESCE(pc.profit_percentage,      0)::float AS profit_percentage,
      p.weight_kg::float                             AS weight_kg,
      p.peso_origen,
      ${SQL_PESOS_DISTINTOS}                         AS pesos_ml
    FROM products p
    LEFT JOIN product_pricing   pp  ON p.id = pp.product_id
    LEFT JOIN profit_categories pc  ON pp.profit_category_id = pc.id
    LEFT JOIN (${PESOS_VINCULADOS}) pv ON pv.product_id = p.id
    WHERE p.is_active = TRUE
    ORDER BY p.name
  `)

  // 12-11 (rapidez): tasa y Ajustes en el HTML.
  return <>
    <PublicacionesMLTabs user={session.user} actual="envios" />
    <MercadoEnviosClient initialProducts={productsRes.rows as Product[]} inicialTasa={await tasaYAjustes()} />
  </>
}
