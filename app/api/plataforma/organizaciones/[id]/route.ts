import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { ORGANIZACION_PLATAFORMA } from '@/lib/empresa'
import { soloDueno } from '@/lib/plataforma'

const Body = z.object({
  estado: z.enum(['prueba', 'activo', 'vencido']).optional(),
  prueba_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida').nullable().optional(),
  fundador: z.boolean().optional(),
})

// PUT /api/plataforma/organizaciones/[id] { estado?, prueba_hasta?, fundador? } → la cuenta de un
// cliente (lib/cuenta.ts). La organización de la plataforma es siempre "propietario" y no se toca;
// ningún cliente puede pasar a "propietario". Los cambios se aplican en el siguiente clic de sus
// usuarios (la sesión relee sus empresas en cada request).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await soloDueno()
  if (error) return error
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  if (Number(id) === ORGANIZACION_PLATAFORMA) {
    return NextResponse.json({ error: 'Tu organización es la propietaria de la plataforma: no tiene prueba ni pago' }, { status: 400 })
  }
  try {
    const b = Body.parse(await req.json())
    const { rows: [antes] } = await dbGlobal().query(
      `SELECT estado, to_char(prueba_hasta, 'YYYY-MM-DD') AS hasta FROM organizaciones WHERE id = $1`, [id])
    if (!antes) return NextResponse.json({ error: 'Organización no encontrada' }, { status: 404 })
    const { rowCount } = await dbGlobal().query(
      `UPDATE organizaciones SET
         estado       = COALESCE($2, estado),
         prueba_hasta = CASE WHEN $4 THEN $3::date ELSE prueba_hasta END,
         -- una fecha cambiada a mano (o salir de prueba) manda: ya no se recalcula al conectar ML (mig. 067)
         prueba_dias  = CASE WHEN ($4 AND $3::date IS DISTINCT FROM prueba_hasta) OR $2 IN ('activo', 'vencido') THEN NULL ELSE prueba_dias END,
         fundador     = COALESCE($5, fundador),
         -- Reactivada (prueba o activa): se borra el motivo de la pausa (migración 105).
         -- Pausada a mano desde Plataforma (20-10): motivo 'manual' y el día (el corte pone el suyo).
         motivo_pausa = CASE WHEN $2 IN ('prueba', 'activo') THEN NULL
                             WHEN $2 = 'vencido' AND estado <> 'vencido' THEN 'manual' ELSE motivo_pausa END,
         pausa_fecha  = CASE WHEN $2 IN ('prueba', 'activo') THEN NULL
                             WHEN $2 = 'vencido' AND estado <> 'vencido' THEN CURRENT_DATE ELSE pausa_fecha END
       WHERE id = $1`,
      [id, b.estado ?? null, b.prueba_hasta ?? null, b.prueba_hasta !== undefined, b.fundador ?? null])
    if (!rowCount) return NextResponse.json({ error: 'Organización no encontrada' }, { status: 404 })
    // Historia de la cuenta (mig. 106): qué cambió.
    const nuevo = b.estado ?? antes.estado
    const ev = nuevo === 'vencido' && antes.estado !== 'vencido' ? ['pausada', 'manual']
      : nuevo === 'prueba' && antes.estado === 'vencido' ? ['reactivada', b.prueba_hasta ?? antes.hasta]
      : nuevo === 'activo' && antes.estado !== 'activo' ? ['activa', null]
      : nuevo === 'prueba' && b.prueba_hasta !== undefined && b.prueba_hasta !== antes.hasta ? ['fecha', b.prueba_hasta]
      : null
    if (ev) {
      await dbGlobal().query(`INSERT INTO organizacion_eventos (organizacion_id, tipo, detalle, por) VALUES ($1, $2, $3, $4)`,
        [id, ev[0], ev[1], session!.user.id]).catch(e => console.error('[organizacion_eventos]', e))
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}

// GET /api/plataforma/organizaciones/[id] → la historia de la cuenta (Plataforma → ficha del cliente): cuándo se
// creó, cuándo conectó MercadoLibre y cada pausa / reactivación / cambio de fecha (organizacion_eventos, mig. 106).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await soloDueno()
  if (error) return error
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  try {
    const [{ rows: [o] }, { rows: eventos }] = await Promise.all([
      dbGlobal().query(
        `SELECT o.created_at AS creada,
                (SELECT MIN(u.conectada_at) FROM plataforma_uso_clientes() u JOIN empresas e ON e.id = u.empresa_id
                 WHERE e.organizacion_id = o.id) AS conectada
         FROM organizaciones o WHERE o.id = $1`, [id]),
      dbGlobal().query(
        `SELECT v.fecha, v.tipo, v.detalle, u.full_name AS por
         FROM organizacion_eventos v LEFT JOIN users u ON u.id = v.por
         WHERE v.organizacion_id = $1 ORDER BY v.fecha`, [id]),
    ])
    if (!o) return NextResponse.json({ error: 'Organización no encontrada' }, { status: 404 })
    return NextResponse.json({ creada: o.creada, conectada: o.conectada, eventos })
  } catch (err) {
    return apiError(err)
  }
}
