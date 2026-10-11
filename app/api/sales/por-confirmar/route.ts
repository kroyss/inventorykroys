import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { tieneModulo } from '@/lib/modulos'
import { sincronizarOrdenes } from '@/lib/calificacionesML'
import { DIAS_MAX, ventasPorConfirmar } from '@/lib/porConfirmar'

// GET  /api/sales/por-confirmar → ventas de ML sin registrar (lib/porConfirmar.ts) + última búsqueda de pagos
// POST /api/sales/por-confirmar → trae ya de ML las ventas de los últimos días (sin esperar al cron)
export async function GET() {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  try {
    const { dias, filas } = await ventasPorConfirmar(s.db)
    let ultimaBusqueda: string | null = null
    if (tieneModulo(s.session.user, 'pagos_me')) {
      const { rows: [p] } = await s.db.query(`SELECT pedido_at, resultados FROM me_pedidos ORDER BY pedido_at DESC LIMIT 1`)
      const fin = Object.values((p?.resultados ?? {}) as Record<string, { at: string }>).map(r => r.at).sort().pop()
      ultimaBusqueda = fin ?? (p ? new Date(p.pedido_at).toISOString() : null)
    }
    const { rows: [sync] } = await s.db.query(`SELECT MIN(ordenes_sync_at) AS at FROM ml_conexiones WHERE estado = 'activa'`)
    return NextResponse.json({ dias, filas, ultimaBusqueda, pagosME: tieneModulo(s.session.user, 'pagos_me'), sincronizadas_at: sync?.at ?? null })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST() {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  try {
    const { rows: cuentas } = await s.db.query(`SELECT id, nickname FROM ml_conexiones WHERE estado = 'activa' ORDER BY id`)
    const errores: string[] = []
    const contar = async () => (await s.db.query(`SELECT COUNT(*)::int AS n FROM ml_ordenes`)).rows[0].n as number
    const antes = await contar()
    for (const c of cuentas) {
      try { await sincronizarOrdenes(s.db, c.id, true, 1) }
      catch (e) { errores.push(`${c.nickname}: ${e instanceof Error ? e.message : String(e)}`) }
    }
    // nuevas = ventas que ML tenía y nosotros todavía no (para el aviso "revisado recién · N nuevas").
    return NextResponse.json({ ok: !errores.length, errores, dias: DIAS_MAX, nuevas: (await contar()) - antes })
  } catch (err) {
    return apiError(err)
  }
}
