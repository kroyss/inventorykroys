import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { despachosForbidden, remitenteConfigurado } from '@/lib/despachos'

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
    const { rows } = await db.query(
      `SELECT e.venta, e.guia, COALESCE(NULLIF(e.remitente, ''), $2) AS remitente
       FROM despacho_etiquetas e
       JOIN despacho_lotes l ON l.id = e.lote_id
       WHERE l.jornada_id = $1 AND l.status = 'GENERADO' AND e.impresa AND NOT e.reimpresion
       ORDER BY l.generated_at, e.original_name, e.id`, [id, await remitenteConfigurado(db)])
    if (rows.length === 0) return NextResponse.json({ error: 'La jornada no tiene envíos para reportar' }, { status: 404 })
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
