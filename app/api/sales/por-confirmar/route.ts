import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { tieneModulo } from '@/lib/modulos'
import { sincronizarOrdenes } from '@/lib/calificacionesML'
import { DIAS_MAX, cargadasConPago, marcarNoConcretada, noConcretadas, ventasPorConfirmar } from '@/lib/porConfirmar'
import { MOTIVOS_NO_CONCRETADA } from '@/lib/noConcretada'

// GET  /api/sales/por-confirmar → ventas de ML sin registrar (lib/porConfirmar.ts) + última búsqueda de pagos
//      + (con Pagos ME e inventario, 22-10) las YA CARGADAS en borrador cuyo pago trajo Pagos ME: 'cargadas'
// POST /api/sales/por-confirmar → trae ya de ML las ventas de los últimos días (sin esperar al cron)
// PUT  /api/sales/por-confirmar { numero, motivo, nota } → "No se concretó" (mig 115); motivo null = deshacer
export async function GET() {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  try {
    const [{ dias, filas }, noConc] = await Promise.all([ventasPorConfirmar(s.db), noConcretadas(s.db)])
    let ultimaBusqueda: string | null = null
    // Solo con inventario: sin inventario (Fundadores) no hay ventas cargadas.
    const cargadas = tieneModulo(s.session.user, 'pagos_me') && tieneModulo(s.session.user, 'inventario') ? await cargadasConPago(s.db) : []
    if (tieneModulo(s.session.user, 'pagos_me')) {
      // La última búsqueda TERMINADA (un pedido recién hecho, sin resultados, no cuenta: "Traer ME" espera la nueva).
      const { rows: [p] } = await s.db.query(`SELECT pedido_at, resultados FROM me_pedidos WHERE resultados <> '{}'::jsonb ORDER BY pedido_at DESC LIMIT 1`)
      const fin = Object.values((p?.resultados ?? {}) as Record<string, { at: string }>).map(r => r.at).sort().pop()
      ultimaBusqueda = fin ?? (p ? new Date(p.pedido_at).toISOString() : null)
    }
    const { rows: [sync] } = await s.db.query(`SELECT MIN(ordenes_sync_at) AS at FROM ml_conexiones WHERE estado = 'activa'`)
    return NextResponse.json({ dias, filas, cargadas, noConcretadas: noConc, ultimaBusqueda, pagosME: tieneModulo(s.session.user, 'pagos_me'), sincronizadas_at: sync?.at ?? null })
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

const NoConcretadaSchema = z.object({
  numero: z.string().regex(/^\d+$/),
  motivo: z.enum(Object.keys(MOTIVOS_NO_CONCRETADA) as [keyof typeof MOTIVOS_NO_CONCRETADA]).nullable(),
  nota:   z.string().trim().max(300).nullable().optional(),
})

export async function PUT(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  try {
    const b = NoConcretadaSchema.parse(await req.json())
    if (b.motivo === 'otro' && !b.nota) return NextResponse.json({ error: 'Escribe qué pasó' }, { status: 400 })
    const n = await marcarNoConcretada(s.db, b.numero, parseInt(s.session.user.id, 10), b.motivo, b.motivo ? b.nota || null : null)
    if (!n) return NextResponse.json({ error: 'No se encontró la venta (o ya está registrada en el sistema)' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
