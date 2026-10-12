import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPagosME } from '@/lib/pagosME'
import { leerHorario } from '@/lib/pagosMEComun'
import { puede } from '@/lib/permisos'

const Body = z.object({
  activo: z.boolean(),
  horas: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (HH:MM)')).max(12),
  dias: z.array(z.number().int().min(1).max(7)).max(7),
})

// GET /api/pagos-me/horario → horario del "Traer automático" (sin configurar: 8, 12, 16 y 19 h, lun–sáb)
// PUT /api/pagos-me/horario { activo, horas, dias } (admin)
export async function GET() {
  const s = await sesionPagosME()
  if ('error' in s) return s.error
  try {
    const { rows: [r] } = await s.db.query(`SELECT value FROM app_settings WHERE key = 'pagos_me_horario'`)
    return NextResponse.json(leerHorario(r?.value))
  } catch (err) { return apiError(err) }
}

export async function PUT(req: NextRequest) {
  const s = await sesionPagosME()
  if ('error' in s) return s.error
  if (!puede(s.session.user, 'pagos_me_config')) return NextResponse.json({ error: 'Solo el administrador' }, { status: 403 })
  try {
    const b = Body.parse(await req.json())
    const h = leerHorario(JSON.stringify(b))   // ordena y quita repetidas
    await s.db.query(
      `INSERT INTO app_settings (key, value) VALUES ('pagos_me_horario', $1)
       ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [JSON.stringify(h)])
    return NextResponse.json(h)
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
