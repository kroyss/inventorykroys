import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'

// Ajuste de la impresora de etiquetas (18-10), por empresa y por tamaño de rollo: tamaño de la página que
// espera el driver y dónde cae la etiqueta (mm). Ver lib/etiquetasProducto.ts (AjusteImpresora).
const KEY = 'etiquetas_ajuste'

export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  try {
    const { rows: [r] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [KEY])
    let v: unknown = {}
    try { v = r ? JSON.parse(r.value) : {} } catch { v = {} }
    return NextResponse.json(v)
  } catch (err) {
    return apiError(err)
  }
}

const Ajuste = z.object({
  ancho: z.number().min(10).max(150),
  alto:  z.number().min(10).max(150),
  x:     z.number().min(-30).max(30),
  y:     z.number().min(-30).max(30),
})
const Schema = z.object({ tamano: z.enum(['50x25', '57x32']), ajuste: Ajuste.nullable() })

export async function PUT(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  try {
    const { tamano, ajuste } = Schema.parse(await req.json())
    const { rows: [r] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [KEY])
    let todo: Record<string, unknown> = {}
    try { todo = r ? JSON.parse(r.value) : {} } catch { todo = {} }
    if (ajuste) todo[tamano] = ajuste; else delete todo[tamano]
    await db.query(`
      INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
      ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, [KEY, JSON.stringify(todo)])
    return NextResponse.json(todo)
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
