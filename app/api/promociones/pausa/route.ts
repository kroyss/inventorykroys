import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { publicacionesDeCampana } from '@/lib/promocionesML'
import { sesionPromociones } from '@/lib/promocionesSesion'

// Pausar / Reanudar / Renovar una campaña propia (11-11, pedido del dueño). MercadoLibre no tiene "pausa": pausar = sacar
// todas las publicaciones (con /api/promociones/acciones, de a 10) recordando cuáles eran; reanudar = volver a agregarlas
// con el mismo % (la ventana de agregar, con sus protecciones). Renovar = campaña nueva + las mismas publicaciones.
// GET    ?conexion=&id=  → { items } las publicaciones que tiene (o tuvo) la campaña
// POST   { conexionId, id, items } → guarda cuáles eran antes de sacarlas (app_settings promo_pausa:<conexion>:<id>)
// DELETE ?conexion=&id=  → olvida la pausa (ya se reanudó)
const llave = (conexion: number, id: string) => `promo_pausa:${conexion}:${id}`
const CAMPANA = /^C-MLV\d+$/

export async function GET(req: NextRequest) {
  const s = await sesionPromociones()
  if ('error' in s) return s.error
  const conexion = Number(req.nextUrl.searchParams.get('conexion'))
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!conexion || !CAMPANA.test(id)) return NextResponse.json({ error: 'Campaña no válida' }, { status: 400 })
  try {
    const { rows: [p] } = await s.db.query(`SELECT value FROM app_settings WHERE key = $1`, [llave(conexion, id)])
    let pausadas: string[] = []
    try { pausadas = p ? (JSON.parse(p.value).items ?? []) : [] } catch { /* ignorado */ }
    const ahora = await publicacionesDeCampana(s.db, conexion, id, 'SELLER_CAMPAIGN')
    return NextResponse.json({ items: [...new Set([...ahora, ...pausadas])] })
  } catch (err) {
    return apiError(err)
  }
}

const Guardar = z.object({ conexionId: z.number().int().positive(), id: z.string().regex(CAMPANA), items: z.array(z.string().regex(/^MLV\d+$/)).min(1).max(2000) })

export async function POST(req: NextRequest) {
  const s = await sesionPromociones()
  if ('error' in s) return s.error
  try {
    const b = Guardar.parse(await req.json())
    await s.db.query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value`,
      [llave(b.conexionId, b.id), JSON.stringify({ items: b.items, at: new Date().toISOString() })])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}

export async function DELETE(req: NextRequest) {
  const s = await sesionPromociones()
  if ('error' in s) return s.error
  const conexion = Number(req.nextUrl.searchParams.get('conexion'))
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!conexion || !CAMPANA.test(id)) return NextResponse.json({ error: 'Campaña no válida' }, { status: 400 })
  try {
    await s.db.query(`DELETE FROM app_settings WHERE key = $1`, [llave(conexion, id)])
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
