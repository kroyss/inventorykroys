import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { autenticarEquipo, ESTADOS_RESULTADO } from '@/lib/reportador'

const Schema = z.object({
  etiqueta_id: z.number().int().positive(),
  estado:      z.enum(ESTADOS_RESULTADO),
  detalle:     z.string().max(500).optional(),
})

/**
 * POST /api/reportador/resultado — el equipo informa UN mensaje apenas termina con él.
 * Informar uno por uno (y no al final de la cuenta como el CSV) hace que un corte a
 * mitad de camino no provoque mensajes repetidos en la próxima corrida.
 * Un resultado final (ENVIADO / SIN_CHAT / CSV) nunca se pisa: si el equipo reintenta
 * el aviso por un corte de red, no cambia nada.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await autenticarEquipo(req)
    if ('error' in auth) return auth.error
    const { db } = auth
    const b = Schema.parse(await req.json())
    const final = b.estado === 'ENVIADO' || b.estado === 'SIN_CHAT'

    const { rowCount } = await db.query(
      `UPDATE despacho_etiquetas
       SET reporte_estado     = $2,
           reporte_detalle    = $3,
           reporte_intentos   = reporte_intentos + 1,
           reportado_at       = CASE WHEN $4 THEN NOW() ELSE reportado_at END,
           reporte_tomado_por = CASE WHEN $4 THEN NULL ELSE reporte_tomado_por END,
           reporte_tomado_at  = CASE WHEN $4 THEN NULL ELSE reporte_tomado_at END
       WHERE id = $1 AND impresa
         AND (reporte_estado IS NULL OR reporte_estado IN ('RECHAZADO', 'ERROR'))`,
      [b.etiqueta_id, b.estado, b.detalle ?? null, final])

    return NextResponse.json({ ok: true, actualizado: rowCount === 1 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
