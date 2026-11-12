import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import MensajesClient from '@/components/preguntas/MensajesClient'
import SinCuentaML from '@/components/automatizaciones/SinCuentaML'
import { sinCuentasML } from '@/lib/preguntasSesion'
import { puede } from '@/lib/permisos'
import { ORGANIZACION_PLATAFORMA } from '@/lib/empresa'
import { deApi } from '@/lib/inicial'
import { GET as listarMensajes } from '@/app/api/mensajes/route'
import { GET as seguimiento } from '@/app/api/mensajes/seguimiento/route'

export const metadata = { title: 'Mensajes' }

// Automatizaciones → Mensajes: conversaciones post-venta de MercadoLibre (módulo `preguntas`).
export default async function MensajesPage({ searchParams }: { searchParams: Promise<{ pack?: string }> }) {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'preguntas') || !puede(session?.user, 'ver_mensajes')) redirect('/automatizaciones')
  if (await sinCuentasML(session!)) {
    return <SinCuentaML esAdmin={puede(session!.user, 'ml_cuentas')} titulo="Mensajes" gancho="Todos los mensajes de tus compradores, de todas tus cuentas, en una sola bandeja."
      beneficios={['Cada conversación con el producto, el estado de la venta y lo que el comprador preguntó antes.',
        'Adjunta fotos o PDF (o pégalos con Ctrl+V) y deja notas en la venta para tu equipo.',
        'La IA te propone la respuesta; tú la revisas y la envías.']} />
  }
  const { pack } = await searchParams
  const packOk = pack && /^\d{6,20}$/.test(pack) ? pack : null
  // 12-11 (rapidez): Por atender y el seguimiento vienen en el HTML (mismos GET de la API). Con ?pack= abre Atendidas: lo pide el navegador.
  const inicial = packOk ? null : await Promise.all([
    deApi(listarMensajes, '/api/mensajes?vista=sin_leer&pagina=1'),
    deApi(seguimiento, '/api/mensajes/seguimiento?horas=12&pagina=1'),
  ]).then(([lista, seg]) => ({ lista, seg }))
  return <MensajesClient inicial={inicial} pack={packOk}
    miIA={tieneModulo(session!.user, 'mi_ia') && puede(session!.user, 'automatizaciones_config')}
    // 09-11 (el dueño): la pestaña «IA en prueba» (marcar Bien/Mal) es solo del equipo interno; los clientes
    // encienden y prueban en Mi IA y ven el borrador de la IA en cada conversación.
    iaPrueba={tieneModulo(session!.user, 'mensajes_ia') && session!.user.organizacionId === ORGANIZACION_PLATAFORMA} />
}
