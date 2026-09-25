import { getServerSession } from 'next-auth'
import { notFound, redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/db'
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
  if (session.user.country !== 'VE' || !/^\d+$/.test(id)) notFound()
  const db = getDb('VE')

  const [invoice, config] = await Promise.all([getInvoice(db, id), readInvoiceConfig(db)])
  if (!invoice) notFound()

  return <FacturaPrintClient invoice={invoice} offsetX={config.offset_x} offsetY={config.offset_y} autoPrint={print === '1'} />
}
