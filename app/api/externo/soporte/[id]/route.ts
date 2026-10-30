import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { externoAutorizado, noAutorizado } from '@/lib/externo'

// PUT /api/externo/soporte/[id] { user_id, accion: 'visto' | 'resuelto' } → como /api/soporte/[id], para el Radar.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!externoAutorizado(req)) return noAutorizado()
  const { id } = await params
  const b = await req.json().catch(() => null) as { user_id?: number; accion?: string } | null
  if (b?.accion !== 'visto' && b?.accion !== 'resuelto') return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  try {
    await dbGlobal().query(
      b.accion === 'visto'
        ? `UPDATE soporte_casos SET cliente_visto_at = NOW() WHERE id = $1 AND user_id = $2 AND origen = 'radar'`
        : `UPDATE soporte_casos SET estado = 'resuelto', updated_at = NOW(), cliente_visto_at = NOW() WHERE id = $1 AND user_id = $2 AND origen = 'radar'`,
      [Number(id), Number(b.user_id)])
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
