import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { dbGlobal } from '@/lib/db'
import { radarUrl } from '@/lib/espacios'

// GET /api/radar/entrar → entra al Radar sin volver a escribir la clave (12-11, el dueño). Firma un pase de 60 s con el
// usuario de la sesión (RADAR_ENTRAR_SECRETO, el mismo en el Radar) y manda a radar…/entrar?t=…; el Radar lo valida y
// aplica las MISMAS reglas que su login (solo lectura sin plan, grupos, PRO). Sin secreto, sin sesión o si algo
// falla: va al Radar normal (pide login como siempre).
export async function GET() {
  const destino = radarUrl()
  const secreto = process.env.RADAR_ENTRAR_SECRETO
  const session = await getServerSession(authOptions)
  if (!secreto || !session?.user?.id) return NextResponse.redirect(destino)
  try {
    const { rows: [u] } = await dbGlobal().query(
      `SELECT username FROM users WHERE id = $1 AND is_active`, [session.user.id])
    if (!u?.username) return NextResponse.redirect(destino)
    const datos = Buffer.from(JSON.stringify({ u: u.username, e: Date.now() + 60_000, n: crypto.randomBytes(8).toString('hex') })).toString('base64url')
    const firma = crypto.createHmac('sha256', secreto).update(datos).digest('base64url')
    return NextResponse.redirect(`${destino}/entrar?t=${datos}.${firma}`)
  } catch (e) {
    console.error('[radar entrar]', e instanceof Error ? e.message : e)
    return NextResponse.redirect(destino)
  }
}
