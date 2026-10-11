import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { despachosForbidden, sinTituloEnEtiqueta } from '@/lib/despachos'

// GET/PUT /api/despachos/config → opciones de Despachos de la empresa (por ahora: imprimir o no el
// título de la publicación en la etiqueta, para empresas sin inventario). Cambiarla es de admin.
export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied
  try {
    return NextResponse.json({ sin_titulo: await sinTituloEnEtiqueta(db) })
  } catch (err) { return apiError(err) }
}

const Body = z.object({ sin_titulo: z.boolean() })

export async function PUT(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied
  if (session.user.role !== 'admin') return forbidden()
  try {
    const b = Body.parse(await req.json())
    await db.query(
      `INSERT INTO app_settings (key, value) VALUES ('despacho_sin_titulo', $1)
       ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [String(b.sin_titulo)])
    return NextResponse.json({ sin_titulo: b.sin_titulo })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
