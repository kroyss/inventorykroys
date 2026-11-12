import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { tieneModulo } from '@/lib/modulos'
import { estadoTraida } from '@/lib/meTraida'

// GET /api/pagos-me/traida → cómo va la última traída de MercadoEnvíos (lib/meTraida.ts). La usan los botones «Traer» de
// Por confirmar y Promociones para quedar inhabilitados mientras corre una (también después de recargar la página).
export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (!tieneModulo(session.user, 'pagos_me')) return NextResponse.json({ traida: null })
  try {
    return NextResponse.json({ traida: await estadoTraida(db) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) { return apiError(err) }
}
