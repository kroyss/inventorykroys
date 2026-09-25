import { getServerSession } from 'next-auth'
import { notFound, redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { readInvoiceConfig } from '@/lib/invoicesServer'
import FacturaPrint from '@/components/facturas/FacturaPrint'

export const metadata = { title: 'Hoja de prueba — Factura' }

// Hoja de calibración: los mismos datos de la plantilla FACTURA 1347.xls. Se imprime en papel
// blanco y se pone al trasluz sobre una impresa desde Excel; si no coinciden, se ajusta el
// corrimiento X/Y (mm) en Facturas → Configuración.
const SAMPLE = {
  invoice_number: 1347,
  invoice_date: '2018-04-17',
  customer_name: 'Multiservicios  vi-ro ca',
  customer_doc: 'J402821280',
  customer_address: 'alta vista puerto Ordaz edo bolivar',
  customer_phone: '0414-8673761',
  iva_rate: 12,
  base_bs: 44999999,
  iva_bs: 5399999.88,
  total_bs: 50399998.88,
  items: [{ description: 'GRIFERIA MONOMANDO', quantity: 1, unit_price_bs: 44999999, total_bs: 44999999 }],
}

export default async function Page() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.country !== 'VE') notFound()
  const config = await readInvoiceConfig(getDb('VE'))

  return (
    <FacturaPrint
      invoice={SAMPLE}
      offsetX={config.offset_x}
      offsetY={config.offset_y}
      copyOffsetX={config.copy_offset_x}
      copyOffsetY={config.copy_offset_y}
      toolbar={
        <span className="text-sm text-neutral-600">
          <b>Hoja de prueba</b> (datos de la factura 1347 del Excel) · hoja X {config.offset_x} / Y {config.offset_y} mm · copia X {config.copy_offset_x} / Y {config.copy_offset_y} mm
        </span>
      }
    />
  )
}
