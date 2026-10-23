import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { LATIDO_MIN, SELECT_PAGOS, TRAIDA_EN_CURSO_MIN, sesionPagosME } from '@/lib/pagosME'
import { esDemo } from '@/lib/demo'

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
                    FROM me_pedidos ORDER BY pedido_at DESC LIMIT 1`, [TRAIDA_EN_CURSO_MIN]),
        s.db.query(`SELECT DISTINCT ON (COALESCE(conexion_id::text, cuenta, perfil)) perfil,
                           visto_at > NOW() - make_interval(mins => $1) AS conectado
                    FROM me_latidos WHERE visto_at > NOW() - INTERVAL '3 days'
                    ORDER BY COALESCE(conexion_id::text, cuenta, perfil), visto_at DESC`, [LATIDO_MIN]),
      ])
      const resultados = (pedido?.resultados ?? {}) as Record<string, { ok: boolean; at: string }>
      const perfiles = latidos.filter(l => l.perfil !== 'DESPERTADOR').map(l => l.perfil as string)
      const despertador = latidos.find(l => l.perfil === 'DESPERTADOR')
      const trabajando = !!pedido?.vigente && (perfiles.length
        ? perfiles.some(pf => !resultados[pf]) && (despertador ? !!despertador.conectado : latidos.some(l => l.conectado))
        : Object.keys(resultados).length === 0)
      const fin = Object.values(resultados).map(r => r.at).sort().pop() ?? null
      const noRespondieron = trabajando ? [] : perfiles.filter(pf => pedido && !resultados[pf])
      return NextResponse.json({
        pago: p ?? null,
        traida: pedido ? {
          pedido_at: pedido.pedido_at, trabajando, terminada_at: trabajando ? null : fin,
          con_error: Object.values(resultados).some(r => !r.ok),
          no_respondieron: noRespondieron,
        } : null,
      })
    }
    // Demo (19-10): no hay PC de verdad; la sembrada se ve siempre con señal.
    if (await esDemo(s.db)) await s.db.query(`UPDATE me_latidos SET visto_at = NOW()`)
    const estado = req.nextUrl.searchParams.get('estado') ?? 'pendiente'
    const filtro = ['pendiente', 'valido', 'invalido'].includes(estado) ? estado : null
    const [{ rows: pagos }, { rows: conteo }, { rows: latidos }, { rows: [pedido] }, { rows: [clave] }] = await Promise.all([
      s.db.query(
        `${SELECT_PAGOS}
         WHERE ($1::text IS NULL OR p.verificacion = $1) AND p.fecha_orden > NOW() - INTERVAL '30 days'
         ORDER BY p.fecha_orden DESC NULLS LAST, p.id DESC LIMIT 300`, [filtro]),
      s.db.query(`SELECT verificacion, COUNT(*)::int AS n FROM me_pagos
                  WHERE fecha_orden > NOW() - INTERVAL '30 days' GROUP BY 1`),
      // Perfiles con señal en los últimos 3 días: uno que ya no se usa (extensión quitada, perfil viejo) no
      // queda para siempre como "no respondió".
      // Nombre a mostrar: la cuenta de ML a la que quedó unido (PIKEKE) o, si no, el del portal (migración 096).
      // Un perfil por cuenta: el más reciente (al reconectar una extensión queda un perfil nuevo para la misma cuenta).
      s.db.query(`SELECT * FROM (
                    SELECT DISTINCT ON (COALESCE(l.conexion_id::text, l.cuenta, l.perfil)) l.perfil,
                           COALESCE(x.nickname, l.cuenta) AS cuenta, l.cuenta AS cuenta_portal, l.verificacion,
                           l.visto_at, l.visto_at > NOW() - make_interval(mins => $1) AS conectado
                    FROM me_latidos l LEFT JOIN ml_conexiones x ON x.id = l.conexion_id
                    WHERE l.visto_at > NOW() - INTERVAL '3 days'
                    ORDER BY COALESCE(l.conexion_id::text, l.cuenta, l.perfil), l.visto_at DESC) t
                  ORDER BY cuenta NULLS LAST, perfil`, [LATIDO_MIN]),
      // vigente (para la pantalla) = todavía "trayendo"; pasado TRAIDA_EN_CURSO_MIN se muestra incompleta.
      s.db.query(`SELECT id, pedido_at, resultados, pedido_por IS NULL AS automatico, pedido_at > NOW() - make_interval(mins => $1) AS vigente
                  FROM me_pedidos ORDER BY pedido_at DESC LIMIT 1`, [TRAIDA_EN_CURSO_MIN]),
      s.db.query(`SELECT (SELECT creado_at FROM me_vigilante) AS creado_at, EXISTS (SELECT 1 FROM me_claves) AS con_codigo`),
    ])
    return NextResponse.json({
      pagos,
      conteo: Object.fromEntries(conteo.map(c => [c.verificacion, c.n])),
      vigilante: { clave: !!clave?.creado_at || !!clave?.con_codigo, latidos, pedido: pedido ?? null },
      desdeML: s.desdeML,
    })
  } catch (err) {
    return apiError(err)
  }
}
