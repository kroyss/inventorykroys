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

export async function GET(req: NextRequest) {
  const s = await sesionPagosME()
  if ('error' in s) return s.error
  try {
    // ?venta= → lo que dijo el banco de ese pago (Ventas: al lado de "Verificar pago").
    const venta = req.nextUrl.searchParams.get('venta')
    if (venta) {
      const { rows: [b] } = await s.db.query(
        `SELECT banco_nivel AS nivel, banco_motivo AS motivo, banco_mov AS mov, banco_at AS at FROM me_pagos
         WHERE (venta = $1 OR venta IN (SELECT id::text FROM ml_ordenes WHERE pack_id::text = $1)) AND banco_nivel IS NOT NULL
         ORDER BY banco_at DESC LIMIT 1`, [venta])
      return NextResponse.json({ banco: b ?? null })
    }
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

// POST { resultados: [{ ids, nivel, motivo, mov }] } → guarda lo que dijo el banco de cada pago (lo ven todos en Por
// confirmar). Solo el movimiento que le corresponde, no el estado de cuenta. "sin_estado" no se guarda (no pisa un
// resultado anterior). Lo puede hacer cualquier usuario de Por confirmar (decisión del dueño, 20-10).
const Mov = z.object({ banco: z.string().max(40), fecha: z.string().max(10), monto: z.number(), ref: z.string().max(40), concepto: z.string().max(200) })
const Resultados = z.object({ resultados: z.array(z.object({
  ids: z.array(z.number().int().positive()).min(1).max(20),
  nivel: z.enum(['seguro', 'probable', 'revisar', 'no_aparece']),
  motivo: z.string().max(300),
  mov: Mov.nullable(),
})).max(2000) })

export async function POST(req: NextRequest) {
  const s = await sesionPagosME()
  if ('error' in s) return s.error
  try {
    const { resultados } = Resultados.parse(await req.json())
    if (!resultados.length) return NextResponse.json({ ok: true, guardados: 0 })
    const { rowCount } = await s.db.query(
      `UPDATE me_pagos p SET banco_nivel = x.nivel, banco_motivo = x.motivo, banco_mov = x.mov, banco_at = NOW(), banco_por = $2
       FROM jsonb_to_recordset($1::jsonb) AS x(id bigint, nivel text, motivo text, mov jsonb)
       WHERE p.id = x.id`,
      [JSON.stringify(resultados.flatMap(r => r.ids.map(id => ({ id, nivel: r.nivel, motivo: r.motivo, mov: r.mov })))), s.userId])
    return NextResponse.json({ ok: true, guardados: rowCount })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
