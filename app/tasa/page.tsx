import { getPublicRates } from '@/lib/publicRates'
import TasaBoard from '@/components/tasa/TasaBoard'
import { marca } from '@/lib/marca'

export const metadata = { title: 'Tasa del día' }
export const dynamic = 'force-dynamic' // siempre lee la última tasa, nunca cachea el HTML

export default async function TasaPage() {
  const initial = await getPublicRates()
  const m = marca()
  return <TasaBoard initial={initial} marca={m.id === 'ecd' ? m.nombre : 'Syncsora'} />
}
