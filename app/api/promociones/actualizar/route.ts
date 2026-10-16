import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { actualizarPromociones, anotarErrorPromociones } from '@/lib/promocionesML'
import { sesionPromociones } from '@/lib/promocionesSesion'

export const maxDuration = 120

/** POST /api/promociones/actualizar → relee de MercadoLibre las campañas y precios de cada cuenta (solo lectura en ML). */
export async function POST() {
  const s = await sesionPromociones()
  if ('error' in s) return s.error
  try {
    const { rows: cuentas } = await s.db.query(`SELECT id, nickname FROM ml_conexiones WHERE estado = 'activa' ORDER BY id`)
    const resultado: { cuenta: string; ok: boolean; publicaciones?: number; campanas?: number; error?: string }[] = []
    for (const c of cuentas) {
      try {
        const f = await actualizarPromociones(s.db, c.id)
        resultado.push({ cuenta: c.nickname, ok: true, publicaciones: f.items.length, campanas: f.campanas.length })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        await anotarErrorPromociones(s.db, c.id, msg).catch(() => {})
        resultado.push({ cuenta: c.nickname, ok: false, error: msg.slice(0, 200) })
      }
    }
    return NextResponse.json({ resultado })
  } catch (err) {
    return apiError(err)
  }
}
