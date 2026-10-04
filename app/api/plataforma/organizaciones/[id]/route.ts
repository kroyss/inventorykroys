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
  const { error } = await soloDueno()
  if (error) return error
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  if (Number(id) === ORGANIZACION_PLATAFORMA) {
    return NextResponse.json({ error: 'Tu organización es la propietaria de la plataforma: no tiene prueba ni pago' }, { status: 400 })
  }
  try {
    const b = Body.parse(await req.json())
    const { rowCount } = await dbGlobal().query(
      `UPDATE organizaciones SET
         estado       = COALESCE($2, estado),
         prueba_hasta = CASE WHEN $4 THEN $3::date ELSE prueba_hasta END,
         -- una fecha cambiada a mano (o salir de prueba) manda: ya no se recalcula al conectar ML (mig. 067)
         prueba_dias  = CASE WHEN ($4 AND $3::date IS DISTINCT FROM prueba_hasta) OR $2 IN ('activo', 'vencido') THEN NULL ELSE prueba_dias END,
         fundador     = COALESCE($5, fundador)
       WHERE id = $1`,
      [id, b.estado ?? null, b.prueba_hasta ?? null, b.prueba_hasta !== undefined, b.fundador ?? null])
    if (!rowCount) return NextResponse.json({ error: 'Organización no encontrada' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
