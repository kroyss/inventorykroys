import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { dbGlobal } from '@/lib/db'

// POST /api/actividad → la persona está usando el sistema de verdad (tocó, escribió o cambió de pantalla),
// no solo una pestaña abierta. Lo manda components/layout/ActividadReal.tsx (como mucho cada 2 minutos).
// Para "En línea" en Plataforma (migración 092).
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new NextResponse(null, { status: 204 })
  // "Ver como otro usuario" no cuenta como uso de esa persona.
  if (!session.user.verComo) {
    await dbGlobal().query(
      `UPDATE users SET ultimo_uso = NOW() WHERE id = $1 AND (ultimo_uso IS NULL OR ultimo_uso < NOW() - INTERVAL '1 minute')`,
      [session.user.id]).catch(() => {})
  }
  return new NextResponse(null, { status: 204 })
}
