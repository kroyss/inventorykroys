import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { sesionAvisos } from '@/lib/avisosSesion'
import { avisoDePrueba, resumenAhora } from '@/lib/avisosTelegram'
import { ENTORNO, TelegramBloqueado } from '@/lib/telegram'

// POST /api/avisos-telegram/prueba → un aviso de ejemplo a su Telegram ({ tipo: 'resumen' }: su resumen de hoy).
export async function POST(req: NextRequest) {
  const s = await sesionAvisos()
  if ('error' in s) return s.error
  try {
    const { rows: [t] } = await dbGlobal().query(
      `SELECT chat_id::text AS chat FROM telegram_usuarios WHERE user_id = $1 AND chat_id IS NOT NULL AND entorno = $2`, [s.userId, ENTORNO])
    if (!t) return NextResponse.json({ error: 'Primero conecta tu Telegram' }, { status: 409 })
    try {
      const { tipo } = await req.json().catch(() => ({}))
      if (tipo === 'resumen') await resumenAhora(s.userId, s.empresaId)
      else await avisoDePrueba(t.chat, s.user.name ?? '')
    } catch (e) {
      if (!(e instanceof TelegramBloqueado)) throw e
      await dbGlobal().query(`UPDATE telegram_usuarios SET chat_id = NULL, error = $2 WHERE user_id = $1`,
        [s.userId, 'Bloqueaste el bot o borraste el chat: vuelve a conectarlo'])
      return NextResponse.json({ error: 'No llegó: bloqueaste el bot o borraste el chat. Vuelve a conectarlo.' }, { status: 409 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
