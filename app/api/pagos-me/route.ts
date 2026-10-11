import { NextRequest, NextResponse } from 'next/server'
import { leerHorario } from '@/lib/pagosMEComun'
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
      if (req.nextUrl.searchParams.get('traida') !== '1') return NextResponse.json(p ?? null)
      // Nueva venta (2026-10-11): además, cómo está la última traída (para "no está · última traída
      // 12:01 · Traer ahora" y para saber cuándo terminó la que se pidió desde el formulario).
      const [{ rows: [pedido] }, { rows: latidos }] = await Promise.all([
        s.db.query(`SELECT pedido_at, resultados, pedido_at > NOW() - make_interval(mins => $1) AS vigente
                    FROM me_pedidos ORDER BY pedido_at DESC LIMIT 1`, [PEDIDO_VIGENTE_MIN]),
        s.db.query(`SELECT perfil, visto_at > NOW() - make_interval(mins => $1) AS conectado FROM me_latidos`, [LATIDO_MIN]),
      ])
      const resultados = (pedido?.resultados ?? {}) as Record<string, { ok: boolean; at: string }>
      const perfiles = latidos.filter(l => l.perfil !== 'DESPERTADOR').map(l => l.perfil as string)
      const despertador = latidos.find(l => l.perfil === 'DESPERTADOR')
      const trabajando = !!pedido?.vigente && (perfiles.length
        ? perfiles.some(pf => !resultados[pf]) && (despertador ? !!despertador.conectado : latidos.some(l => l.conectado))
        : Object.keys(resultados).length === 0)
      const fin = Object.values(resultados).map(r => r.at).sort().pop() ?? null
      return NextResponse.json({
        pago: p ?? null,
        traida: pedido ? {
          pedido_at: pedido.pedido_at, trabajando, terminada_at: trabajando ? null : fin,
          con_error: Object.values(resultados).some(r => !r.ok),
        } : null,
      })
    }
    const estado = req.nextUrl.searchParams.get('estado') ?? 'pendiente'
    const filtro = ['pendiente', 'valido', 'invalido'].includes(estado) ? estado : null
    const [{ rows: pagos }, { rows: conteo }, { rows: latidos }, { rows: [pedido] }, { rows: [clave] }, { rows: [hor] }, { rows: [ahora] }] = await Promise.all([
      s.db.query(
        `${SELECT_PAGOS}
         WHERE ($1::text IS NULL OR p.verificacion = $1) AND p.fecha_orden > NOW() - INTERVAL '30 days'
         ORDER BY p.fecha_orden DESC NULLS LAST, p.id DESC LIMIT 300`, [filtro]),
      s.db.query(`SELECT verificacion, COUNT(*)::int AS n FROM me_pagos
                  WHERE fecha_orden > NOW() - INTERVAL '30 days' GROUP BY 1`),
      s.db.query(`SELECT perfil, visto_at, visto_at > NOW() - make_interval(mins => $1) AS conectado
                  FROM me_latidos ORDER BY perfil`, [LATIDO_MIN]),
      s.db.query(`SELECT id, pedido_at, resultados, pedido_por IS NULL AS automatico, pedido_at > NOW() - make_interval(mins => $1) AS vigente
                  FROM me_pedidos ORDER BY pedido_at DESC LIMIT 1`, [PEDIDO_VIGENTE_MIN]),
      s.db.query(`SELECT creado_at FROM me_vigilante`),
      s.db.query(`SELECT value FROM app_settings WHERE key = 'pagos_me_horario'`),
      // Día (1 = lunes) y hora de Venezuela (la conexión tiene el TimeZone de la empresa), para "Próximo automático".
      s.db.query(`SELECT EXTRACT(ISODOW FROM NOW())::int AS dia, to_char(NOW(), 'HH24:MI') AS hm`),
    ])
    return NextResponse.json({
      pagos,
      conteo: Object.fromEntries(conteo.map(c => [c.verificacion, c.n])),
      vigilante: { clave: !!clave, latidos, pedido: pedido ?? null },
      horario: leerHorario(hor?.value), ahora,
    })
  } catch (err) {
    return apiError(err)
  }
}
