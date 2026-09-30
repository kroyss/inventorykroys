import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { cifrar } from '@/lib/ml'

// DELETE /api/ml/conexiones/[id] → desconecta la cuenta: borra sus tokens y deja de
// sincronizarla. Las preguntas ya guardadas se conservan (son el histórico de la IA).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesionPreguntas(true)
  if ('error' in s) return s.error
  const { id } = await params
  try {
    const { rowCount } = await s.db.query(
      `UPDATE ml_conexiones SET estado = 'desconectada', access_token_enc = $2, refresh_token_enc = $2,
              ultimo_error = 'Desconectada desde el sistema', updated_at = NOW()
       WHERE id = $1`, [Number(id), cifrar('')])
    if (!rowCount) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) { return apiError(err) }
}
