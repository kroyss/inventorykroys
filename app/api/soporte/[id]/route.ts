import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { apiError } from '@/lib/apiError'
import { unauthorized } from '@/lib/session'
import { dbGlobal } from '@/lib/db'

// PUT /api/soporte/[id] { accion: 'visto' | 'resuelto' } → el cliente vio la respuesta o da el caso por resuelto.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return unauthorized()
  const { id } = await params
  const b = await req.json().catch(() => null) as { accion?: string } | null
  if (b?.accion !== 'visto' && b?.accion !== 'resuelto') return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  if (session.user.soporte || session.user.verComo) return NextResponse.json({ ok: true })
  try {
    await dbGlobal().query(
      b.accion === 'visto'
        ? `UPDATE soporte_casos SET cliente_visto_at = NOW() WHERE id = $1 AND user_id = $2`
        : `UPDATE soporte_casos SET estado = 'resuelto', updated_at = NOW(), cliente_visto_at = NOW() WHERE id = $1 AND user_id = $2`,
      [Number(id), Number(session.user.id)])
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
