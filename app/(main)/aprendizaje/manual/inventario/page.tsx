import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { existsSync, statSync } from 'fs'
import path from 'path'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'
import { manualInventario } from '@/lib/manual'
import ManualVista from '@/components/aprendizaje/ManualVista'

export const metadata = { title: 'Manual de Inventario' }
export const dynamic = 'force-dynamic'

// Aprendizaje → Manuales → Inventario (14-11): sale de docs/ayuda/sistema.md (la misma fuente del asistente), así el
// manual web y el chat dicen siempre lo mismo. Las capturas las genera scripts/capturas-manual.js.
export default async function ManualInventarioPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (!tieneModulo(session.user, 'inventario')) redirect('/aprendizaje')
  const capitulos = await manualInventario()
  const capturas: Record<string, number> = {}
  for (const c of capitulos) {
    const f = path.join(process.cwd(), 'public', 'manual', 'inventario', `${c.id}.png`)
    if (existsSync(f)) capturas[c.id] = Math.round(statSync(f).mtimeMs)   // versión: cambia al recapturar (sin caché vieja)
  }
  return <ManualVista titulo="Manual de Inventario" capitulos={capitulos} capturas={capturas} base="/manual/inventario"
    reabrirGuia={puede(session.user, 'ver_productos')} />
}
