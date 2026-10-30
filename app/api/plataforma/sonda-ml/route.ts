import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { esDuenoPlataforma } from '@/lib/empresa'
import { mlFetch } from '@/lib/ml'

// TEMPORAL (29-10): qué datos de costos trae ML por venta (comisión real, envío, descuentos, facturación,
// publicidad) en las cuentas de la empresa abierta. Solo lectura, solo el dueño de la plataforma, sin datos
// del comprador. Borrar cuando se decida la Fase 2 de ganancias.
type Orden = {
  id: number; status: string; total_amount: number; paid_amount?: number; currency_id: string; tags?: string[]
  order_items: { unit_price: number; full_unit_price?: number; quantity: number; sale_fee?: number | null
                 listing_type_id?: string; base_exchange_rate?: number | null }[]
  payments?: { status: string; marketplace_fee?: number; shipping_cost?: number; transaction_amount?: number }[]
  shipping?: { id?: number | null }
}

export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (!esDuenoPlataforma(session.user)) return NextResponse.json({ error: 'Solo el dueño' }, { status: 403 })
  // Cada llamada por separado: un 403/404 de ML también es un dato (la API no existe en ese sitio).
  const probar = async (conexion: number, ruta: string) => {
    try { return { ok: true, datos: await mlFetch<any>(db, conexion, ruta) } }
    catch (e) { return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : String(e) } }
  }
  try {
    const { rows: cuentas } = await db.query(
      `SELECT id, nickname, site_id, ml_user_id::text AS ml_user_id FROM ml_conexiones WHERE estado = 'activa' ORDER BY id`)
    const salida = []
    for (const c of cuentas) {
      const busqueda = await probar(c.id, `/orders/search?seller=${c.ml_user_id}&sort=date_desc&limit=3`)
      const ventas = []
      for (const r of (busqueda.ok ? busqueda.datos.results ?? [] : []).slice(0, 2)) {
        const o = await probar(c.id, `/orders/${r.id}`)
        const d = o.datos as Orden | undefined
        const envioId = d?.shipping?.id
        const [envio, costos, descuentos] = await Promise.all([
          envioId ? probar(c.id, `/shipments/${envioId}`) : Promise.resolve(null),
          envioId ? probar(c.id, `/shipments/${envioId}/costs`) : Promise.resolve(null),
          probar(c.id, `/orders/${r.id}/discounts`),
        ])
        ventas.push({
          orden: d ? { id: d.id, status: d.status, total: d.total_amount, pagado: d.paid_amount, moneda: d.currency_id, tags: d.tags } : o,
          lineas: d?.order_items.map(i => ({ unit_price: i.unit_price, full_unit_price: i.full_unit_price, qty: i.quantity,
                                              sale_fee: i.sale_fee, tipo: i.listing_type_id, tasa: i.base_exchange_rate })),
          pagos: d?.payments?.map(p => ({ status: p.status, marketplace_fee: p.marketplace_fee, shipping_cost: p.shipping_cost,
                                          monto: p.transaction_amount })),
          envio: envio?.ok ? { mode: envio.datos.mode, logistica: envio.datos.logistic_type, base_cost: envio.datos.base_cost,
                               cost_components: envio.datos.cost_components, costo: envio.datos.shipping_option?.cost,
                               list_cost: envio.datos.shipping_option?.list_cost } : envio,
          costos_envio: costos?.ok ? { vendedor: costos.datos.senders, gross: costos.datos.gross_amount } : costos,
          descuentos,
        })
      }
      salida.push({
        cuenta: c.nickname, sitio: c.site_id,
        busqueda: busqueda.ok ? 'ok' : busqueda.error,
        ventas,
        facturacion: await probar(c.id, `/billing/integration/periods?group=ML&document_type=BILL&limit=2`),
        publicidad: await probar(c.id, `/advertising/advertisers?product_id=PADS`),
        comisiones_sitio: await probar(c.id, `/sites/${c.site_id}/listing_prices?price=100`),
      })
    }
    return NextResponse.json({ empresa: session.user.empresaNombre, cuentas: salida })
  } catch (err) {
    return apiError(err)
  }
}
