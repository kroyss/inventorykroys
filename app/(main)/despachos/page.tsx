import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import DespachosClient, { type DespachosInicial } from '@/components/despachos/DespachosClient'
import { deApi } from '@/lib/inicial'
import { GET as resumenDespachos } from '@/app/api/despachos/route'
import { GET as detalleLote } from '@/app/api/despachos/lotes/[id]/route'
import { GET as apartados } from '@/app/api/despachos/apartados/route'
import { GET as primeraJornada } from '@/app/api/despachos/primera/route'
import SinCuentaML from '@/components/automatizaciones/SinCuentaML'
import { sinCuentasML } from '@/lib/preguntasSesion'
import NegocioSettings from '@/components/tasas/NegocioSettings'
import { redirect } from 'next/navigation'
import { tieneModulo, ventasDesdeML } from '@/lib/modulos'
import { puede } from '@/lib/permisos'
import { dbDeSesion } from '@/lib/session'

export const metadata = { title: 'Despachos' }

export default async function DespachosPage() {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'despachos') || !puede(session?.user, 'ver_despachos')) redirect('/dashboard')
  if (session!.user.country !== 'VE') {
    return <p className="text-sm text-neutral-500">Despachos solo está disponible en Venezuela.</p>
  }
  // isAdmin = "Configurar automatizaciones" (lib/permisos.ts)
  const isAdmin = puede(session!.user, 'automatizaciones_config')
  const desdeML = ventasDesdeML(session!.user)
  // Como todas las Automatizaciones: hasta conectar una cuenta de ML se explica qué gana y se ofrece conectar.
  if (tieneModulo(session!.user, 'preguntas') && await sinCuentasML(session!)) {
    return <SinCuentaML esAdmin={puede(session!.user, 'ml_cuentas')} titulo="Despachos" gancho="Imprime las etiquetas de todas tus cuentas, 4 por hoja, con el producto escrito."
      beneficios={['Subes los PDF de Mercado Envíos y salen 4 etiquetas por hoja, con el producto y la nota de la venta.',
        'Guías Tealca, cierre de jornada y manifiesto para la transportista.',
        'Las ventas y los productos salen directo de MercadoLibre: no cargas nada a mano.']} />
  }
  // 12-11 (rapidez): la primera carga viene en el HTML (mismos GET de la API). El detalle de los lotes pendientes
  // solo con inventario: sin inventario ese GET consulta ML (lo sigue pidiendo el navegador).
  const [ov, espera, primera] = await Promise.all([
    deApi<NonNullable<DespachosInicial['ov']>>(() => resumenDespachos(), '/api/despachos'),
    deApi<{ espera: DespachosInicial['espera'] }>(apartados, '/api/despachos/apartados'),
    deApi<DespachosInicial['primera']>(() => primeraJornada(), '/api/despachos/primera'),
  ])
  const lotes = ov && !desdeML ? (await Promise.all(ov.pendientes.map(p => deApi<NonNullable<DespachosInicial['lotes']>[number]>(
    req => detalleLote(req, { params: Promise.resolve({ id: String(p.id) }) }), `/api/despachos/lotes/${p.id}`)))).filter(l => l !== null) : null
  const inicial: DespachosInicial = { ov, lotes, espera: espera?.espera ?? null, primera }
  // El remitente del manifiesto (y las cuentas que lee el mismo formulario): solo esas dos claves, no todo Ajustes.
  const negocio = isAdmin ? Object.fromEntries((await dbDeSesion(session!).query(
    `SELECT key, value FROM app_settings WHERE key IN ('ml_cuentas', 'despacho_remitente')`)).rows.map(r => [r.key, r.value])) as Record<string, string> : null
  return (
    <div className="space-y-6">
      <DespachosClient inicial={inicial} isAdmin={isAdmin} reportador={tieneModulo(session!.user, 'reportador')} desdeML={desdeML} />
      {/* El remitente del manifiesto se cambia aquí, para todas las empresas (ya no está en Ajustes). */}
      {isAdmin && <NegocioSettings conDespachos soloRemitente inicial={negocio} />}
    </div>
  )
}
