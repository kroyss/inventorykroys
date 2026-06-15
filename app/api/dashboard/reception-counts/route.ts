import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'

// Conteos de recepción para el dashboard (sin datos financieros sensibles).
// Accesible a cualquier usuario autenticado — el rol user maneja recepciones.
export async function GET(_: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  try {
    const [{ rows: [local] }, { rows: [imp] }, { rows: [fin] }] = await Promise.all([
      // Compras locales en camino
      db.query(`
        SELECT COUNT(*) AS count
        FROM purchase_orders
        WHERE order_type = 'local' AND status = 'EN_CAMINO'
      `),
      // Importaciones en camino (+ cajas)
      db.query(`
        SELECT COUNT(*) AS count, COALESCE(SUM(box_count), 0) AS boxes
        FROM import_orders
        WHERE status = 'EN_CAMINO'
      `),
      // Por finalizar (recibidas/parciales) en locales + importaciones
      db.query(`
        SELECT
          (SELECT COUNT(*) FROM purchase_orders WHERE order_type = 'local' AND status IN ('RECIBIDA','PARCIAL'))
          +
          (SELECT COUNT(*) FROM import_orders WHERE status IN ('RECIBIDA','PARCIAL'))
          AS count
      `),
    ])

    return NextResponse.json({
      local:         parseInt(local.count, 10) || 0,
      imports:       parseInt(imp.count, 10) || 0,
      imports_boxes: parseInt(imp.boxes, 10) || 0,
      por_finalizar: parseInt(fin.count, 10) || 0,
    })
  } catch (err) {
    return apiError(err)
  }
}
