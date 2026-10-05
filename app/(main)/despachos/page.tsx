import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import DespachosClient from '@/components/despachos/DespachosClient'
import SinCuentaML from '@/components/automatizaciones/SinCuentaML'
import { sinCuentasML } from '@/lib/preguntasSesion'
import NegocioSettings from '@/components/tasas/NegocioSettings'
import { redirect } from 'next/navigation'
import { llevaInventario, tieneModulo } from '@/lib/modulos'

export const metadata = { title: 'Despachos' }

export default async function DespachosPage() {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'despachos')) redirect('/dashboard')
  if (session!.user.country !== 'VE') {
    return <p className="text-sm text-neutral-500">Despachos solo está disponible en Venezuela.</p>
  }
  const isAdmin = session!.user.role === 'admin'
  const desdeML = !llevaInventario(session!.user)
  // Sin inventario las etiquetas salen con el producto de MercadoLibre: sin cuenta conectada no hay de dónde.
  if (desdeML && tieneModulo(session!.user, 'preguntas') && await sinCuentasML(session!)) {
    return <SinCuentaML esAdmin={isAdmin} titulo="Despachos" gancho="Imprime las etiquetas de todas tus cuentas, 4 por hoja, con el producto escrito."
      beneficios={['Subes los PDF de Mercado Envíos y salen 4 etiquetas por hoja, con el producto y la nota de la venta.',
        'Guías Tealca, cierre de jornada y manifiesto para la transportista.',
        'Las ventas y los productos salen directo de MercadoLibre: no cargas nada a mano.']} />
  }
  return (
    <div className="space-y-6">
      <DespachosClient isAdmin={isAdmin} reportador={tieneModulo(session!.user, 'reportador')} desdeML={desdeML} />
      {/* Sin inventario no hay Ajustes: el remitente del manifiesto se cambia aquí. */}
      {isAdmin && desdeML && <NegocioSettings conDespachos soloRemitente />}
    </div>
  )
}
