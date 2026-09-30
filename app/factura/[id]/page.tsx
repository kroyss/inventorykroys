import { getServerSession } from 'next-auth'
import { notFound, redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { dbDeSesion } from '@/lib/session'
import { tieneModulo } from '@/lib/modulos'
import { getInvoice, readInvoiceConfig } from '@/lib/invoicesServer'
import FacturaPrintClient from '@/components/facturas/FacturaPrintClient'

export const metadata = { title: 'Factura' }

export default async function Page({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ print?: string }>
}) {
  const { id } = await params
  const { print } = await searchParams
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.country !== 'VE' || !tieneModulo(session.user, 'facturas') || !/^\d+$/.test(id)) notFound()
  const db = dbDeSesion(session)

  const [invoice, config] = await Promise.all([getInvoice(db, id), readInvoiceConfig(db)])
  if (!invoice) notFound()

  return <FacturaPrintClient invoice={invoice} offsetX={config.offset_x} offsetY={config.offset_y}
    copyOffsetX={config.copy_offset_x} copyOffsetY={config.copy_offset_y} autoPrint={print === '1'} />
}
