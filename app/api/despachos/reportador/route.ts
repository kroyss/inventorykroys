import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { despachosForbidden } from '@/lib/despachos'
import { leerConfig, LIMITE_CARACTERES, problemasConfig } from '@/lib/reportador'

/** GET /api/despachos/reportador — equipos vinculados + configuración de mensajes */
export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied

  try {
    const [{ rows: equipos }, config] = await Promise.all([
      db.query(
        `SELECT id, nombre, vinculado_at, last_seen_at, version,
                CASE WHEN token_hash IS NULL THEN codigo END AS codigo,
                CASE WHEN token_hash IS NULL THEN codigo_expira END AS codigo_expira
         FROM reportador_equipos
         WHERE revocado_at IS NULL AND (token_hash IS NOT NULL OR codigo_expira > NOW())
         ORDER BY id`),
      leerConfig(db),
    ])
    return NextResponse.json({ equipos, config, problemas: problemasConfig(config), limite: LIMITE_CARACTERES })
  } catch (err) {
    return apiError(err)
  }
}

const Schema = z.object({
  cuentas: z.array(z.object({
    nombre: z.string().trim().min(1).max(40),
    filtro: z.string().trim().min(2).max(40),
    pagina: z.string().trim().max(200),
  })).min(1).max(5),
  plantillas: z.array(z.string().trim().min(1).max(LIMITE_CARACTERES)).min(1).max(10),
  bloque: z.string().max(LIMITE_CARACTERES),
})

/** PUT /api/despachos/reportador — guarda cuentas/plantillas (admin). Rechaza la config si
 *  algún mensaje pasaría de 350 caracteres: ML lo cortaría sin avisar. */
export async function PUT(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied
  if (session.user.role !== 'admin') return forbidden()

  try {
    const config = Schema.parse(await req.json())
    const problemas = problemasConfig(config)
    if (problemas.length) return NextResponse.json({ error: problemas.join(' · '), problemas }, { status: 400 })

    for (const [key, value] of [
      ['reportador_cuentas', JSON.stringify(config.cuentas)],
      ['reportador_plantillas', JSON.stringify(config.plantillas)],
      ['reportador_bloque', config.bloque],
    ]) {
      await db.query(
        `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [key, value])
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
