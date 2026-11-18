import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { existsSync, statSync } from 'fs'
import path from 'path'
import { authOptions } from '@/lib/auth'
import { tieneModulo, llevaInventario, type Modulo } from '@/lib/modulos'
import { manualAutomatizaciones, plano } from '@/lib/manual'
import { videosDeUsuario } from '@/lib/aprendizaje'
import ManualVista, { type VideoApoyo } from '@/components/aprendizaje/ManualVista'
import { conAutomatizaciones } from '@/lib/manualAcceso'
import { VistoNuevo } from '@/components/ui/Nuevo'

export const metadata = { title: 'Manual de Automatizaciones' }
export const dynamic = 'force-dynamic'

// Aprendizaje → Manuales → Automatizaciones (18-11, el dueño): sale de docs/ayuda/sistema.md como el de Inventario; el
// manual manda (está al día con las pantallas) y cada capítulo enlaza sus videos grabados como demostración de apoyo.
export default async function ManualAutomatizacionesPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (!conAutomatizaciones(session.user)) redirect('/aprendizaje')
  const u = session.user
  const [capitulos, videos] = await Promise.all([
    manualAutomatizaciones(m => tieneModulo(u, m as Modulo)),
    videosDeUsuario(u.id, llevaInventario(u), tieneModulo(u, 'pagos_me')).catch(() => []),
  ])
  const capturas: Record<string, number> = {}
  const deCapitulo: Record<string, VideoApoyo[]> = {}
  for (const c of capitulos) {
    const f = path.join(process.cwd(), 'public', 'manual', 'automatizaciones', `${c.id}.png`)
    if (existsSync(f)) capturas[c.id] = Math.round(statSync(f).mtimeMs)
    const vs = videos.filter(v => v.serie !== 'inventario' && c.videos.some(k => plano(v.titulo).includes(k)))
    if (vs.length) deCapitulo[c.id] = vs.map(v => ({ id: v.id, titulo: v.titulo, segundos: v.duracion_video ?? (v.duracion_seg || null), visto: v.completado }))
  }
  return <><VistoNuevo clave="manual_automatizaciones" /><ManualVista titulo="Manual de Automatizaciones" capitulos={capitulos} capturas={capturas} base="/manual/automatizaciones"
    reabrirGuia={false} videos={deCapitulo} /></>
}
