import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPromociones } from '@/lib/promocionesSesion'

// Promociones → «Tus campañas vencidas» (22-11, pedido del dueño). Las campañas propias que vencieron siguen a la vista
// para volver a crearlas (↻ Volver a crear = Renovar). POST { conexionId, id } → «Quitar de la lista»: ya no se muestra
// (app_settings promo_vencidas_ocultas, lista de «conexión|campaña»). No toca nada en MercadoLibre.
const Body = z.object({ conexionId: z.number().int().positive(), id: z.string().regex(/^C-MLV\d+$/) })

export async function POST(req: NextRequest) {
  const s = await sesionPromociones()
  if ('error' in s) return s.error
  const b = Body.safeParse(await req.json().catch(() => null))
  if (!b.success) return NextResponse.json({ error: 'Campaña no válida' }, { status: 400 })
  try {
    const { rows: [r] } = await s.db.query(`SELECT value FROM app_settings WHERE key = 'promo_vencidas_ocultas'`)
    let lista: string[] = []
    try { lista = r ? JSON.parse(r.value) : [] } catch { /* se rehace */ }
    const k = `${b.data.conexionId}|${b.data.id}`
    if (!lista.includes(k)) lista.push(k)
    await s.db.query(
      `INSERT INTO app_settings (key, value) VALUES ('promo_vencidas_ocultas', $1)
       ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(lista.slice(-500))])
    return NextResponse.json({ ok: true })
  } catch (err) { return apiError(err) }
}
