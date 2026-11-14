import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'
import { CLAVE_REGLAS, IMPORTACION, RECOMENDADAS, ReglasStock, leerReglas } from '@/lib/stockReglas'

/** Reportes → Stock → Reglas (14-11): GET las de la empresa; PUT las cambia (permiso Configurar inventario). */
export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (!puede(session.user, 'ver_reportes') || !tieneModulo(session.user, 'analisis_stock')) return forbidden()
  try {
    const { reglas, propias } = await leerReglas(db)
    return NextResponse.json({ reglas, propias, recomendadas: RECOMENDADAS, importacion: IMPORTACION, editar: puede(session.user, 'inventario_config') })
  } catch (err) { return apiError(err) }
}

export async function PUT(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (!tieneModulo(session.user, 'analisis_stock') || !puede(session.user, 'inventario_config')) return forbidden()
  try {
    const reglas = ReglasStock.parse(await req.json())
    await db.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [CLAVE_REGLAS, JSON.stringify(reglas)])
    return NextResponse.json({ ok: true, reglas })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? 'Reglas inválidas' }, { status: 400 })
    return apiError(err)
  }
}
