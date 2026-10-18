import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { facturasHabilitadas } from '@/lib/modulos'
import { readInvoiceConfig } from '@/lib/invoicesServer'

// Membrete de la hoja preimpresa (18-10), por empresa: un escaneo de la hoja en blanco que la vista previa
// muestra de fondo, semitransparente, para ver cómo va a quedar la factura. NUNCA se imprime.
// La imagen (data URL, ya achicada en el navegador) vive en app_settings.membrete_factura_img; los ajustes en
// factura_membrete ({ v, opacidad, x, y, escala }). Cambiar de formato = subir otra imagen.
const IMG_KEY = 'membrete_factura_img'
const AJUSTE_KEY = 'factura_membrete'

export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (!facturasHabilitadas(session.user)) return forbidden()
  try {
    const { rows: [r] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [IMG_KEY])
    const m = typeof r?.value === 'string' ? r.value.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/) : null
    if (!m) return NextResponse.json({ error: 'Sin membrete' }, { status: 404 })
    return new NextResponse(Buffer.from(m[2], 'base64'), {
      headers: { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=31536000, immutable' },
    })
  } catch (err) {
    return apiError(err)
  }
}

const PutSchema = z.object({
  imagen:   z.string().regex(/^data:image\/(jpeg|png|webp);base64,/, 'Formato de imagen no válido').max(4_000_000, 'La imagen es muy pesada').optional(),
  opacidad: z.number().min(0.05).max(1),
  x:        z.number().min(-50).max(50),
  y:        z.number().min(-50).max(50),
  escala:   z.number().min(50).max(150),
})

export async function PUT(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (!facturasHabilitadas(session.user)) return forbidden()
  try {
    const body = PutSchema.parse(await req.json())
    const guardar = (key: string, value: string) => db.query(`
      INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
      ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, [key, value])
    let v: string | null = null
    if (body.imagen) {
      await guardar(IMG_KEY, body.imagen)
      v = String(Date.now())   // la URL cambia con cada imagen nueva (la vieja queda en caché del navegador)
    } else {
      const { rows: [r] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [AJUSTE_KEY])
      try { v = r ? JSON.parse(r.value).v ?? null : null } catch { v = null }
      if (!v) return NextResponse.json({ error: 'Primero sube la imagen del membrete' }, { status: 400 })
    }
    await guardar(AJUSTE_KEY, JSON.stringify({ v, opacidad: body.opacidad, x: body.x, y: body.y, escala: body.escala }))
    return NextResponse.json(await readInvoiceConfig(db))
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}

export async function DELETE() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (!facturasHabilitadas(session.user)) return forbidden()
  try {
    await db.query(`DELETE FROM app_settings WHERE key IN ($1, $2)`, [IMG_KEY, AJUSTE_KEY])
    return NextResponse.json(await readInvoiceConfig(db))
  } catch (err) {
    return apiError(err)
  }
}
