import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { soloDueno } from '@/lib/plataforma'
import { RONDA_ACTUAL } from '@/lib/fundadores'

const Body = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('aprobar'), tanda: z.number().int().optional() }),
  z.object({ accion: z.literal('rechazar') }),
  z.object({ accion: z.literal('espera') }),                 // lista de espera (Ronda 2: se confirma el lunes 19)
  z.object({ accion: z.literal('reconsiderar') }),           // volver a "calificado" (incluso un descartado)
  z.object({ accion: z.literal('nota'), notas: z.string().max(1000) }),
])

// PUT /api/plataforma/fundadores/[id] → aprobar (a una tanda con cupo), rechazar, lista de espera, reconsiderar o anotar.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await soloDueno()
  if (error) return error
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })
  try {
    const b = Body.parse(await req.json())
    const db = dbGlobal()
    if (b.accion === 'nota') {
      await db.query(`UPDATE fundadores_solicitudes SET notas = NULLIF(TRIM($2), '') WHERE id = $1`, [id, b.notas])
      return NextResponse.json({ ok: true })
    }
    if (b.accion === 'rechazar' || b.accion === 'reconsiderar' || b.accion === 'espera') {
      await db.query(
        `UPDATE fundadores_solicitudes SET estado = $2, tanda = NULL, revisada_at = NOW() WHERE id = $1`,
        [id, b.accion === 'rechazar' ? 'rechazado' : b.accion === 'espera' ? 'espera' : 'calificado'])
      return NextResponse.json({ ok: true })
    }
    // Aprobar: a la tanda indicada, o a aquella en cuyos días se inscribió (hora Caracas); si esa ya
    // está llena, a la primera ABIERTA con cupo. Sin cupo, no se aprueba.
    const { rows: [sol] } = await db.query(
      `SELECT to_char((created_at AT TIME ZONE 'America/Caracas')::date, 'YYYY-MM-DD') AS dia
       FROM fundadores_solicitudes WHERE id = $1`, [id])
    if (!sol) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
    const { rows: tandas } = await db.query(
      `SELECT t.numero, t.cupos, t.abierta,
              to_char(t.inscribe_desde, 'YYYY-MM-DD') AS desde,
              to_char(COALESCE(t.inscribe_hasta, t.inscribe_desde), 'YYYY-MM-DD') AS hasta,
              (SELECT COUNT(*)::int FROM fundadores_solicitudes s WHERE s.tanda = t.numero AND s.estado = 'aprobado' AND s.id <> $2) AS tomados
       FROM fundadores_tandas t WHERE t.ronda = $1 ORDER BY t.numero`, [RONDA_ACTUAL, id])
    const destino = b.tanda != null
      ? tandas.find(t => t.numero === b.tanda)
      : tandas.find(t => t.abierta && t.tomados < t.cupos && t.desde && t.desde <= sol.dia && sol.dia <= t.hasta)
        ?? tandas.find(t => t.abierta && t.tomados < t.cupos)
    if (!destino) return NextResponse.json({ error: 'No hay una ronda abierta con cupo. Abre la siguiente ronda primero.' }, { status: 409 })
    if (destino.tomados >= destino.cupos) return NextResponse.json({ error: `La ronda ${destino.numero} ya está completa` }, { status: 409 })
    await db.query(
      `UPDATE fundadores_solicitudes SET estado = 'aprobado', tanda = $2, revisada_at = NOW() WHERE id = $1`, [id, destino.numero])
    return NextResponse.json({ ok: true, tanda: destino.numero })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
