import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { apiError } from '@/lib/apiError'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'

// Catálogo PDF (mig 152): lo que se recuerda de un catálogo a otro (logo, nombre, pie, opciones). app_settings 'catalogo'.
const Ajustes = z.object({
  logo: z.string().max(400_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).nullable(),
  nombre: z.string().max(80),
  subtitulo: z.string().max(120),
  pie: z.string().max(500),
  precio: z.enum(['final', 'base', 'venta', 'ninguno']),
  columnas: z.number().int().min(2).max(4),
  codigo: z.boolean(),
})

export async function PUT(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (!tieneModulo(session.user, 'catalogo_pdf') || !puede(session.user, 'ver_productos')) return forbidden()
  const p = Ajustes.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: p.error.message }, { status: 400 })
  if (p.data.precio === 'base' && !puede(session.user, 'costos')) p.data.precio = 'final'
  try {
    await db.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ('catalogo', $1, NOW())
       ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [JSON.stringify(p.data)])
    return NextResponse.json({ ok: true })
  } catch (err) { return apiError(err) }
}
