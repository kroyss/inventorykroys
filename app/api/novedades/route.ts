import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { apiError } from '@/lib/apiError'
import { unauthorized } from '@/lib/session'
import { novedadesDe } from '@/lib/novedades'

/** GET /api/novedades → las novedades publicadas que le sirven a esta empresa, y cuántas no vio. */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return unauthorized()
  try {
    return NextResponse.json(await novedadesDe(parseInt(session.user.id, 10), session.user.modulos ?? []))
  } catch (err) {
    return apiError(err)
  }
}
