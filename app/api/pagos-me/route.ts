import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { LATIDO_MIN, PEDIDO_VIGENTE_MIN, SELECT_PAGOS, sesionPagosME } from '@/lib/pagosME'

/**
 * GET /api/pagos-me?estado=pendiente|valido|invalido|todos  → pagos traídos por el vigilante + su estado
 * GET /api/pagos-me?venta=2000…                              → el pago de una venta (Nueva venta)
 */
export async function GET(req: NextRequest) {
  const s = await sesionPagosME()
  if ('error' in s) return s.error
  try {
    const venta = req.nextUrl.searchParams.get('venta')
    if (venta) {
      if (!/^\d{6,20}$/.test(venta)) return NextResponse.json(null)
      const { rows: [p] } = await s.db.query(`${SELECT_PAGOS} WHERE p.venta = $1`, [venta])
      return NextResponse.json(p ?? null)
    }
    const estado = req.nextUrl.searchParams.get('estado') ?? 'pendiente'
    const filtro = ['pendiente', 'valido', 'invalido'].includes(estado) ? estado : null
    const [{ rows: pagos }, { rows: conteo }, { rows: latidos }, { rows: [pedido] }, { rows: [clave] }] = await Promise.all([
      s.db.query(
        `${SELECT_PAGOS}
         WHERE ($1::text IS NULL OR p.verificacion = $1) AND p.fecha_orden > NOW() - INTERVAL '30 days'
         ORDER BY p.fecha_orden DESC NULLS LAST, p.id DESC LIMIT 300`, [filtro]),
      s.db.query(`SELECT verificacion, COUNT(*)::int AS n FROM me_pagos
                  WHERE fecha_orden > NOW() - INTERVAL '30 days' GROUP BY 1`),
      s.db.query(`SELECT perfil, visto_at, visto_at > NOW() - make_interval(mins => $1) AS conectado
                  FROM me_latidos ORDER BY perfil`, [LATIDO_MIN]),
      s.db.query(`SELECT id, pedido_at, resultados, pedido_at > NOW() - make_interval(mins => $1) AS vigente
                  FROM me_pedidos ORDER BY pedido_at DESC LIMIT 1`, [PEDIDO_VIGENTE_MIN]),
      s.db.query(`SELECT creado_at FROM me_vigilante`),
    ])
    return NextResponse.json({
      pagos,
      conteo: Object.fromEntries(conteo.map(c => [c.verificacion, c.n])),
      vigilante: { clave: !!clave, latidos, pedido: pedido ?? null },
    })
  } catch (err) {
    return apiError(err)
  }
}
