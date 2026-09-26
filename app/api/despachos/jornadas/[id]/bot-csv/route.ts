import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { despachosForbidden, remitenteConfigurado } from '@/lib/despachos'
import { SQL_PENDIENTE } from '@/lib/reportador'

// Mismo formato que escribía EtiquetasML (append_to_bot_csv): el Reportador lo usa
// sin cambios. Remitente tal cual el PDF: el Reportador filtra por su comienzo
// ("SOLUCIONES…" / "MARCOS…").
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/** GET /api/despachos/jornadas/[id]/bot-csv — envios_bot.csv para el Reportador */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied

  try {
    // Sin reimpresiones: esas ventas ya estaban DESCARGADA (flujo viejo o reimpresión),
    // su comprador ya fue reportado. Sin remitente → el default, como el script: si
    // quedara vacío el Reportador saltaría el envío sin avisar.
    // Solo lo pendiente, y queda marcado CSV: desde ahora lo reporta el Reportador viejo
    // y el conectado no lo toma (si no, el comprador recibiría dos mensajes).
    const { rows } = await db.query(
      `UPDATE despacho_etiquetas e SET reporte_estado = 'CSV', reporte_tomado_por = NULL, reporte_tomado_at = NULL
       FROM despacho_lotes l
       WHERE l.id = e.lote_id AND l.jornada_id = $1 AND l.status = 'GENERADO'
         AND e.impresa AND NOT e.reimpresion AND ${SQL_PENDIENTE}
       RETURNING e.venta, e.guia, COALESCE(NULLIF(e.remitente, ''), $2) AS remitente,
                 l.generated_at, e.original_name, e.id`,
      [id, await remitenteConfigurado(db)])
    if (rows.length === 0) return NextResponse.json({ error: 'La jornada no tiene envíos pendientes de reportar' }, { status: 404 })
    rows.sort((a, b) => (+a.generated_at - +b.generated_at) || String(a.original_name).localeCompare(String(b.original_name)) || a.id - b.id)
    await db.query(`UPDATE despacho_jornadas SET bot_csv_at = NOW() WHERE id = $1`, [id])

    const csv = '﻿' + ['order_id,guia,remitente',
      ...rows.map(r => [r.venta, r.guia, r.remitente].map(csvCell).join(','))].join('\n') + '\n'
    return new NextResponse(csv, {
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="envios_bot.csv"',
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    return apiError(err)
  }
}
