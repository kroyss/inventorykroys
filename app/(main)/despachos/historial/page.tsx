import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import DespachosHistorial from '@/components/despachos/DespachosHistorial'
import { deApi } from '@/lib/inicial'
import { GET as historial } from '@/app/api/despachos/historial/route'

export const metadata = { title: 'Historial de despachos' }

export default async function DespachosHistorialPage() {
  const session = await getServerSession(authOptions)
  if (session!.user.country !== 'VE') {
    return <p className="text-sm text-neutral-500">Despachos solo está disponible en Venezuela.</p>
  }
  // 12-11 (rapidez): la primera carga viene en el HTML (mismo GET de la API).
  return <DespachosHistorial inicial={await deApi(historial, '/api/despachos/historial?page=1')} />
}
