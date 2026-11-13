import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { ORGANIZACION_PLATAFORMA } from '@/lib/empresa'
import { soloDueno } from '@/lib/plataforma'
import { MODULOS_PRUEBA } from '@/lib/registro'
import { DIAS_PRUEBA } from '@/lib/cuenta'
import { CREDITOS_PRUEBA } from '@/lib/planes'

const Body = z.object({ inventario: z.boolean().default(false) })

// POST /api/plataforma/organizaciones/[id]/prueba { inventario } (13-11-2026, el dueño) → «Dar prueba de 15 días» a una
// cuenta que entró por otro lado (ej. registrada desde el Radar) o cuya prueba venció: estado prueba hasta hoy + 15,
// los módulos de la prueba gratis (+ Inventario si se pide) SIN quitar los que tiene (Radar sigue), y los 500 créditos
// de prueba si nunca los recibió. No se usa con cuentas que ya pagan.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await soloDueno()
  if (error) return error
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  if (Number(id) === ORGANIZACION_PLATAFORMA) return NextResponse.json({ error: 'Es tu organización' }, { status: 400 })
  const db = await dbGlobal().connect()
  try {
    const b = Body.parse(await req.json().catch(() => ({})))
    await db.query('BEGIN')
    const { rows: [o] } = await db.query(`SELECT estado FROM organizaciones WHERE id = $1 FOR UPDATE`, [id])
    if (!o) { await db.query('ROLLBACK'); return NextResponse.json({ error: 'Organización no encontrada' }, { status: 404 }) }
    if (o.estado === 'activo' || o.estado === 'propietario') {
      await db.query('ROLLBACK')
      return NextResponse.json({ error: 'Esta cuenta ya tiene plan: no necesita prueba' }, { status: 400 })
    }
    const { rows: [h] } = await db.query(
      `UPDATE organizaciones SET estado = 'prueba',
         prueba_hasta = (NOW() AT TIME ZONE 'America/Caracas')::date + $2::int, prueba_dias = NULL,
         creditos_desde = NOW(), motivo_pausa = NULL, pausa_fecha = NULL
       WHERE id = $1 RETURNING to_char(prueba_hasta, 'YYYY-MM-DD') AS hasta`, [id, DIAS_PRUEBA.normal])
    const agregar = [...MODULOS_PRUEBA, ...(b.inventario ? ['inventario'] : [])]
    const { rows: empresas } = await db.query(
      `UPDATE empresas SET modulos = ARRAY(SELECT DISTINCT unnest(modulos || $2::text[])),
         ia_limite_mes = CASE WHEN COALESCE(ia_limite_mes, 0) = 0 THEN 100 ELSE ia_limite_mes END
       WHERE organizacion_id = $1 RETURNING id`, [id, agregar])
    for (const e of empresas) {
      await db.query(
        `INSERT INTO ia_creditos (empresa_id, motivo, creditos, nota) VALUES ($1, 'prueba', $2, 'Prueba gratis (dada en Plataforma)')
         ON CONFLICT (empresa_id) WHERE motivo = 'prueba' DO NOTHING`, [e.id, CREDITOS_PRUEBA])
    }
    await db.query(`INSERT INTO organizacion_eventos (organizacion_id, tipo, detalle, por) VALUES ($1, 'reactivada', $2, $3)`,
      [id, h.hasta, session!.user.id])
    await db.query('COMMIT')
    return NextResponse.json({ ok: true, hasta: h.hasta })
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {})
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  } finally {
    db.release()
  }
}
