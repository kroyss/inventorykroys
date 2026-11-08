import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { cifrar, mlFetch } from '@/lib/ml'

// DELETE /api/ml/conexiones/[id] → desconecta la cuenta: borra sus tokens y deja de
// sincronizarla. Las preguntas ya guardadas se conservan (son el histórico de la IA).
// Antes (07-11, Fase 1.4 de docs/analisis-mercasist.md) se le pide a ML que retire el permiso de la app
// (DELETE /users/{id}/applications/{app}), así queda igual que si el vendedor la quitara desde ML. Es lo mejor posible:
// si ML no responde o el token ya no sirve, igual se desconecta de nuestro lado (revocadaEnML: false).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesionPreguntas('ml_cuentas')
  if ('error' in s) return s.error
  const { id } = await params
  try {
    const { rows: [c] } = await s.db.query<{ ml_user_id: string; estado: string }>(
      `SELECT ml_user_id::text, estado FROM ml_conexiones WHERE id = $1`, [Number(id)])
    if (!c) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
    let revocadaEnML = false
    if (c.estado === 'activa' && process.env.ML_CLIENT_ID) {
      revocadaEnML = await mlFetch(s.db, Number(id), `/users/${c.ml_user_id}/applications/${process.env.ML_CLIENT_ID}`, { method: 'DELETE' })
        .then(() => true, e => { console.warn('[ml revocar]', id, e instanceof Error ? e.message : e); return false })
    }
    const { rowCount } = await s.db.query(
      `UPDATE ml_conexiones SET estado = 'desconectada', access_token_enc = $2, refresh_token_enc = $2,
              ultimo_error = 'Desconectada desde el sistema', updated_at = NOW()
       WHERE id = $1`, [Number(id), cifrar('')])
    if (!rowCount) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
    return NextResponse.json({ ok: true, revocadaEnML })
  } catch (err) { return apiError(err) }
}
