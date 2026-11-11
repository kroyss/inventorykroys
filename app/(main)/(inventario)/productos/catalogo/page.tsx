import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from '@/components/ui/Link'
import { authOptions } from '@/lib/auth'
import { dbDeSesion } from '@/lib/session'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'
import { PageHeader } from '@/components/ui'
import CatalogoClient, { type ProductoCatalogo, type AjustesCatalogo } from '@/components/productos/CatalogoClient'

export const metadata = { title: 'Catálogo PDF' }

// Productos → Catálogo PDF (08-11, mig 152, módulo catalogo_pdf): elegir productos, logo, con o sin precio, y
// guardarlo como PDF (imprimir → Guardar como PDF) para mandarlo por WhatsApp. La foto sale de la publicación de ML
// vinculada al producto.
export default async function CatalogoPage() {
  const session = await getServerSession(authOptions)
  const u = session!.user
  if (!tieneModulo(u, 'catalogo_pdf') || !puede(u, 'ver_productos')) redirect('/productos')
  const db = dbDeSesion(session!)
  const [{ rows }, { rows: [aj] }] = await Promise.all([
    // Fotos en una sola pasada (12-11): antes una subconsulta por producto recorría ml_catalogo entero (1,9 s → 0,05 s).
    db.query(`
      WITH fotos AS (
        SELECT DISTINCT ON (c.product_id) c.product_id, m.thumbnail
        FROM product_ml_codes c
        JOIN ml_catalogo m ON substring(m.item_id FROM 4) = split_part(c.ml_code, ':', 1)
        WHERE c.is_active AND m.thumbnail IS NOT NULL
        ORDER BY c.product_id, (m.estado = 'active') DESC, m.disponible DESC)
      SELECT p.id, p.code, p.name,
             COALESCE(inv.quantity, 0)::int AS stock,
             COALESCE(pp.final_price_usd, 0)::float AS final,
             COALESCE(pp.base_price_usd, 0)::float AS base,
             COALESCE(inv.sale_price, 0)::float AS venta,
             f.thumbnail AS foto
      FROM products p
      LEFT JOIN product_pricing pp ON pp.product_id = p.id
      LEFT JOIN inventory inv ON inv.product_id = p.id
      LEFT JOIN fotos f ON f.product_id = p.id
      WHERE p.is_active
      ORDER BY p.name`),
    db.query(`SELECT value FROM app_settings WHERE key = 'catalogo'`),
  ])
  let ajustes: AjustesCatalogo | null = null
  try { ajustes = aj ? JSON.parse(aj.value) : null } catch { ajustes = null }
  const productos: ProductoCatalogo[] = rows.map(r => ({ ...r, foto: r.foto ? String(r.foto).replace(/^http:/, 'https:').replace(/-I\.(jpg|webp)$/, '-O.$1') : null }))
  return (
    <div>
      <Link href="/productos" className="text-xs text-neutral-500 hover:text-neutral-800 print:hidden">← Productos</Link>
      <div className="print:hidden"><PageHeader title="Catálogo PDF" subtitle="Elige los productos, pon tu logo y guárdalo como PDF para mandarlo por WhatsApp" /></div>
      <CatalogoClient productos={productos} ajustes={ajustes} pais={u.country === 'CO' ? 'CO' : 'VE'} verBase={puede(u, 'costos')} />
    </div>
  )
}
