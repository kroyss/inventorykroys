import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { AjustesSchema, CLAVE_AJUSTES, sesionPresupuestos } from '@/lib/presupuestos'

// PUT → datos del negocio que salen en el presupuesto impreso (logo, nombre, RIF/dirección, condiciones).
export async function PUT(req: NextRequest) {
  const s = await sesionPresupuestos()
  if ('error' in s) return s.error
  const p = AjustesSchema.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: p.error.message }, { status: 400 })
  try {
    await s.db.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [CLAVE_AJUSTES, JSON.stringify(p.data)])
    return NextResponse.json({ ok: true })
  } catch (err) { return apiError(err) }
}
