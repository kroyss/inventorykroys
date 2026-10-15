import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { sesionAvisos } from '@/lib/avisosSesion'
import { nombreBot } from '@/lib/telegram'

// POST /api/avisos-telegram/conectar → link t.me/<bot>?start=CODIGO (de un solo uso, 15 minutos).
// Al tocar "Iniciar" en Telegram, el bot recibe "/start CODIGO" y lib/avisosTelegram lo conecta.
export async function POST() {
  const s = await sesionAvisos()
  if ('error' in s) return s.error
  try {
    const codigo = randomBytes(18).toString('base64url')
    await dbGlobal().query(
      `INSERT INTO telegram_usuarios (user_id, codigo, codigo_expira) VALUES ($1, $2, NOW() + INTERVAL '15 minutes')
       ON CONFLICT (user_id) DO UPDATE SET codigo = EXCLUDED.codigo, codigo_expira = EXCLUDED.codigo_expira, actualizado_at = NOW()`,
      [s.userId, codigo])
    const bot = await nombreBot()
    return NextResponse.json({ link: `https://t.me/${bot}?start=${codigo}`, bot })
  } catch (err) {
    return apiError(err)
  }
}
