import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { despachosForbidden, impresionEtiqueta } from '@/lib/despachos'
import { puede } from '@/lib/permisos'

// GET/PUT /api/despachos/config → qué se imprime en la etiqueta (empresas sin inventario): el título
// de la publicación y la nota, cada uno prendido o apagado para toda la empresa. Cambiarlo es de admin.
export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied
  try {
    return NextResponse.json(await impresionEtiqueta(db))
  } catch (err) { return apiError(err) }
}

const Body = z.object({ sin_titulo: z.boolean().optional(), sin_nota: z.boolean().optional() })
const CLAVE = { sin_titulo: 'despacho_sin_titulo', sin_nota: 'despacho_sin_nota' } as const

export async function PUT(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied
  if (!puede(session.user, 'automatizaciones_config')) return forbidden()
  try {
    const b = Body.parse(await req.json())
    for (const k of ['sin_titulo', 'sin_nota'] as const) {
      if (b[k] === undefined) continue
      await db.query(
        `INSERT INTO app_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [CLAVE[k], String(b[k])])
    }
    return NextResponse.json(await impresionEtiqueta(db))
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
