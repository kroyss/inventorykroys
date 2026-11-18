import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { dbGlobal } from '@/lib/db'
import { radarUrl } from '@/lib/espacios'
import { esDuenoPlataforma } from '@/lib/empresa'

// GET /api/radar/ver?u=<id de la cuenta> (18-11, el dueño): «Ver su Radar» desde Plataforma → el ojo. Como «Ver como»
// del Sistema pero en el Radar: firma un pase de 60 s (RADAR_ENTRAR_SECRETO, el mismo de /api/radar/entrar) con SU
// usuario (el dueño, que en el Radar es admin) y el usuario a mirar (v). El Radar entra como el dueño y le muestra el Radar
// tal como lo ve esa persona, en solo lectura (no guarda nada ni le gasta búsquedas). Solo el dueño de la plataforma.
export async function GET(req: NextRequest) {
  const destino = radarUrl()
  const secreto = process.env.RADAR_ENTRAR_SECRETO
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !esDuenoPlataforma(session.user)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  const id = Number(req.nextUrl.searchParams.get('u'))
  if (!secreto || !(id > 0)) return NextResponse.redirect(destino)
  try {
    const { rows } = await dbGlobal().query(
      `SELECT id, username FROM users WHERE id = ANY($1::int[]) AND is_active`, [[Number(session.user.id), id]])
    const yo = rows.find(r => Number(r.id) === Number(session.user.id))?.username
    const otro = rows.find(r => Number(r.id) === id)?.username
    if (!yo || !otro) return NextResponse.redirect(destino)
    const datos = Buffer.from(JSON.stringify({ u: yo, v: otro, e: Date.now() + 60_000, n: crypto.randomBytes(8).toString('hex') })).toString('base64url')
    const firma = crypto.createHmac('sha256', secreto).update(datos).digest('base64url')
    return NextResponse.redirect(`${destino}/entrar?t=${datos}.${firma}`)
  } catch (e) {
    console.error('[radar ver]', e instanceof Error ? e.message : e)
    return NextResponse.redirect(destino)
  }
}
