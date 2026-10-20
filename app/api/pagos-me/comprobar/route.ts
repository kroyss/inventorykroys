import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPagosME } from '@/lib/pagosME'
import { puede } from '@/lib/permisos'

// Pagos ME → "Comprobar con el banco" (20-10; lógica en lib/conciliacionBanco.ts). El cruce se hace en el navegador:
// los estados de cuenta NO se suben ni se guardan en el servidor. Aquí solo:
//   GET → los pagos de los últimos 30 días (los pendientes se pueden aprobar; los ya verificados también entran al
//         cruce para que un crédito del banco no se le asigne a otro) y el margen de embalaje.
//   PUT { margen } → cambia el margen de embalaje (Bs por venta), solo con "Configurar Pagos ME".
// Aprobar usa /api/pagos-me/verificar (lo mismo que "Pago correcto"), con la nota del movimiento del banco.
const MARGEN_DEFECTO = 700
const CLAVE = 'conciliacion_margen_embalaje'

export async function GET() {
  const s = await sesionPagosME()
  if ('error' in s) return s.error
  try {
    const [{ rows: pagos }, { rows: [m] }] = await Promise.all([
      s.db.query(
        `SELECT p.id::int AS id, p.venta, p.cuenta, p.banco_emisor, p.banco_receptor, p.metodo_pago, p.referencia,
                p.fecha_pago, p.monto_pagado::float AS monto_pagado, p.total_orden::float AS total_orden, p.verificacion,
                p.comprobante_path IS NOT NULL AS comprobante
         FROM me_pagos p
         WHERE p.fecha_orden > NOW() - INTERVAL '30 days' AND p.verificacion <> 'invalido'
         ORDER BY p.fecha_orden DESC`),
      s.db.query(`SELECT value FROM app_settings WHERE key = $1`, [CLAVE]),
    ])
    const margen = Number(m?.value)
    return NextResponse.json({ pagos, margen: Number.isFinite(margen) && margen >= 0 ? margen : MARGEN_DEFECTO, puedeConfigurar: puede(s.session.user, 'pagos_me_config') })
  } catch (err) {
    return apiError(err)
  }
}

export async function PUT(req: NextRequest) {
  const s = await sesionPagosME()
  if ('error' in s) return s.error
  if (!puede(s.session.user, 'pagos_me_config')) return NextResponse.json({ error: 'Solo quien configura Pagos ME puede cambiar el margen' }, { status: 403 })
  try {
    const { margen } = z.object({ margen: z.number().min(0).max(100000) }).parse(await req.json())
    await s.db.query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [CLAVE, String(margen)])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
