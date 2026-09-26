import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { REMITENTE_DEFAULT } from '@/lib/despachos'
import {
  autenticarEquipo, leerConfig, RESERVA_HORAS, SQL_PENDIENTE, SQL_REPORTABLE,
} from '@/lib/reportador'

const Schema = z.object({ cuenta: z.string().min(1) })

/**
 * POST /api/reportador/tomar — reserva para ESTE equipo los envíos pendientes de una
 * cuenta y los devuelve. Otro equipo no los recibe mientras dure la reserva
 * (RESERVA_HORAS), así dos PCs no le escriben dos veces al mismo comprador.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await autenticarEquipo(req)
    if ('error' in auth) return auth.error
    const { db, equipo } = auth
    const { cuenta: nombre } = Schema.parse(await req.json())

    const cuenta = (await leerConfig(db)).cuentas.find(c => c.nombre === nombre)
    if (!cuenta) return NextResponse.json({ error: `La cuenta ${nombre} no está configurada` }, { status: 400 })

    const { rows } = await db.query(
      `UPDATE despacho_etiquetas t
       SET reporte_tomado_por = $1, reporte_tomado_at = NOW()
       FROM (
         SELECT e.id, j.closed_at, l.generated_at, e.original_name
         FROM despacho_etiquetas e
         JOIN despacho_lotes l    ON l.id = e.lote_id
         JOIN despacho_jornadas j ON j.id = l.jornada_id
         WHERE ${SQL_REPORTABLE} AND ${SQL_PENDIENTE}
           AND starts_with(UPPER(COALESCE(NULLIF(TRIM(e.remitente), ''), $2)), UPPER(TRIM($3)))
           AND (e.reporte_tomado_at IS NULL
                OR e.reporte_tomado_por = $1
                OR e.reporte_tomado_at < NOW() - make_interval(hours => $4))
         FOR UPDATE OF e SKIP LOCKED
       ) s
       WHERE t.id = s.id
       RETURNING t.id AS etiqueta_id, t.venta AS order_id, t.guia, t.reporte_estado AS estado_previo,
                 s.closed_at, s.generated_at, s.original_name`,
      [equipo.id, REMITENTE_DEFAULT, cuenta.filtro, RESERVA_HORAS])

    // Orden de la jornada: lo más viejo primero, como la cola del CSV.
    rows.sort((a, b) =>
      (+a.closed_at - +b.closed_at) || (+a.generated_at - +b.generated_at) ||
      String(a.original_name).localeCompare(String(b.original_name)))
    return NextResponse.json({
      cuenta: cuenta.nombre,
      envios: rows.map(r => ({ etiqueta_id: r.etiqueta_id, order_id: r.order_id, guia: r.guia, estado_previo: r.estado_previo })),
    })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
