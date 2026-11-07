import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPagosME } from '@/lib/pagosME'

// TEMPORAL (07-11-2026, pedido del dueño): cuando lo pegado del BDV NO se puede leer, se guarda una copia para que
// soporte vea qué llega y por qué falla. La pantalla lo avisa. Solo la última por empresa (app_settings
// 'soporte_pegado_bdv'). QUITAR cuando el lector funcione para todos (y borrar esas filas).
const Cuerpo = z.object({ texto: z.string().max(200_000), lineas: z.number().int().nonnegative().optional() })

export async function POST(req: NextRequest) {
  const s = await sesionPagosME()
  if ('error' in s) return s.error
  try {
    const p = Cuerpo.safeParse(await req.json())
    if (!p.success) return NextResponse.json({ error: p.error.message }, { status: 400 })
    await s.db.query(
      `INSERT INTO app_settings (key, value) VALUES ('soporte_pegado_bdv', $1)
       ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify({ at: new Date().toISOString(), usuario: s.userId, lineas: p.data.lineas ?? null, texto: p.data.texto })])
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
