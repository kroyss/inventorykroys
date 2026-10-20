import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { esDuenoPlataforma } from '@/lib/empresa'
import { forbidden, unauthorized } from '@/lib/session'

/** Guardia de las rutas de Plataforma: solo el dueño de la plataforma. */
export async function soloDueno() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.empresaId) return { error: unauthorized() }
  if (!esDuenoPlataforma(session.user)) return { error: forbidden() }
  return { session }
}

/** "En línea ahora" en Plataforma: usó el sistema en estos minutos (users.ultima_actividad se marca como
 *  máximo cada 2 minutos, lib/auth.ts). Con la página abierta los avisos la mantienen al día. */
export const EN_LINEA_MINUTOS = 5

/** Puede entrar (20-10, Plataforma muestra solo a estos; los inactivos quedan plegados en Clientes): empresa
 *  encendida y cuenta en prueba vigente, pagando o propietaria. Alias: e = empresas, o = organizaciones. */
export const SQL_PUEDE_ENTRAR = `(e.is_active AND (o.estado IN ('activo', 'propietario')
  OR (o.estado = 'prueba' AND (o.prueba_hasta IS NULL OR o.prueba_hasta >= (NOW() AT TIME ZONE 'America/Caracas')::date))))`
