import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import { dbDeSesion } from '@/lib/session'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'
import { PageHeader } from '@/components/ui'
import { CLAVE_AJUSTES, type AjustesPresupuesto } from '@/lib/presupuestos'
import PresupuestosClient, { type ProductoPres } from '@/components/ventas/PresupuestosClient'

export const metadata = { title: 'Presupuestos' }

// Ventas → Presupuestos (08-11, mig 153, módulo presupuestos): cotizaciones imprimibles; aceptado → venta LOCAL.
export default async function PresupuestosPage() {
  const session = await getServerSession(authOptions)
  const u = session!.user
  if (!tieneModulo(u, 'presupuestos') || !puede(u, 'ver_ventas')) redirect('/ventas')
  const db = dbDeSesion(session!)
  const co = u.country === 'CO'
  const [{ rows }, { rows: [aj] }, { rows: [cat] }] = await Promise.all([
    db.query(`
      SELECT p.id, p.code, p.name, COALESCE(inv.quantity, 0)::int AS stock,
             ${co ? `COALESCE(inv.sale_price, 0)::float` : `COALESCE(NULLIF(pp.final_price_usd, 0), inv.sale_price, 0)::float`} AS precio
      FROM products p LEFT JOIN inventory inv ON inv.product_id = p.id LEFT JOIN product_pricing pp ON pp.product_id = p.id
      WHERE p.is_active ORDER BY p.name`),
    db.query(`SELECT value FROM app_settings WHERE key = $1`, [CLAVE_AJUSTES]),
    db.query(`SELECT value FROM app_settings WHERE key = 'catalogo'`),
  ])
  let ajustes: AjustesPresupuesto = { logo: null, nombre: u.empresaNombre ?? '', datos: '', condiciones: '' }
  try {
    if (aj) ajustes = { ...ajustes, ...JSON.parse(aj.value) }
    else if (cat) { const c = JSON.parse(cat.value); ajustes = { ...ajustes, logo: c.logo ?? null, nombre: c.nombre || ajustes.nombre } }
  } catch { /* se queda con lo de fábrica */ }
  return (
    <div>
      <Link href="/ventas" className="text-xs text-neutral-500 hover:text-neutral-800 print:hidden">← Ventas</Link>
      <div className="print:hidden"><PageHeader title="Presupuestos" subtitle="Cotizaciones para tus clientes, con tu logo, para mandar en PDF por WhatsApp" /></div>
      <PresupuestosClient productos={rows as ProductoPres[]} ajustes={ajustes} monedaBase={co ? 'COP' : 'USD'} />
    </div>
  )
}
