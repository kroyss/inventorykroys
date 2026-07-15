import { getPublicRates } from '@/lib/publicRates'
import TasaBoard from '@/components/tasa/TasaBoard'

export const metadata = { title: 'Tasa del día · Syncsora' }
export const dynamic = 'force-dynamic' // siempre lee la última tasa, nunca cachea el HTML

export default async function TasaPage() {
  const initial = await getPublicRates()
  return <TasaBoard initial={initial} />
}
