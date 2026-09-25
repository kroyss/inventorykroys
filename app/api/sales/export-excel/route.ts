import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import * as XLSX from 'xlsx'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  // Support token via header or query param (for direct browser download links)
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  const url      = new URL(req.url)
  const idsParam = url.searchParams.get('ids') ?? ''
  // Re-descarga: permite volver a bajar el Excel de ventas YA descargadas
  // (por si la descarga anterior falló). En modo normal solo toma PROCESADA
  // y las marca DESCARGADA; en re-descarga también toma DESCARGADA y no
  // cambia el estado de las que ya lo estaban.
  const redownload = url.searchParams.get('redownload') === '1'
  const allowedStatuses = redownload ? ['PROCESADA', 'DESCARGADA'] : ['PROCESADA']

  // Re-descarga por filtro de fechas: todas las DESCARGADA del rango en una sola
  // consulta, sin tocar ningún estado. Existe porque marcar ~1000 ventas a mano
  // es inviable, y la lista pagina de a 100 (no se pueden juntar los ids en el cliente).
  const byFilter = url.searchParams.get('by_filter') === '1'
  const dateFrom = url.searchParams.get('date_from') ?? ''
  const dateTo   = url.searchParams.get('date_to') ?? ''

  const saleIds  = idsParam.split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n) && n > 0)

  if (byFilter) {
    if (!redownload || !DATE_RE.test(dateFrom) || !DATE_RE.test(dateTo)) {
      return NextResponse.json({ error: 'La re-descarga por filtro requiere modo RE y rango de fechas' }, { status: 400 })
    }
  } else if (saleIds.length === 0) {
    return NextResponse.json({ error: 'No se especificaron ventas' }, { status: 400 })
  }

  try {
    const rows: { PRODUCTO: string; CANTIDAD: number; VENTA: string; NOTA: string }[] = []

    if (byFilter) {
      const { rows: items } = await db.query(
        `SELECT s.ml_order_number, s.notes AS sale_notes, p.name, si.quantity, si.notes
         FROM sales s
         JOIN sale_items si ON si.sale_id = s.id
         JOIN products p    ON p.id = si.product_id
         WHERE s.status = 'DESCARGADA'
           AND s.created_at >= $1::date
           AND s.created_at <  ($2::date + INTERVAL '1 day')
         ORDER BY s.created_at, s.id, si.id`,
        [dateFrom, dateTo]
      )
      for (const item of items) {
        rows.push({
          PRODUCTO:  item.name,
          CANTIDAD:  item.quantity,
          VENTA:     item.ml_order_number,
          NOTA:      item.sale_notes || item.notes || '',
        })
      }
    }

    for (const saleId of byFilter ? [] : saleIds) {
      const { rows: [sale] } = await db.query(
        `SELECT ml_order_number, notes FROM sales WHERE id = $1 AND status = ANY($2)`,
        [saleId, allowedStatuses]
      )
      if (!sale) continue

      const { rows: items } = await db.query(
        `SELECT p.name, si.quantity, si.notes
         FROM sale_items si
         JOIN products p ON si.product_id = p.id
         WHERE si.sale_id = $1`,
        [saleId]
      )
      for (const item of items) {
        rows.push({
          PRODUCTO:  item.name,
          CANTIDAD:  item.quantity,
          VENTA:     sale.ml_order_number,
          NOTA:      sale.notes || item.notes || '',
        })
      }
    }

    // Mark PROCESADA → DESCARGADA (la re-descarga por filtro no toca estados)
    for (const saleId of byFilter ? [] : saleIds) {
      await db.query(
        `UPDATE sales SET status='DESCARGADA', updated_at=NOW()
         WHERE id=$1 AND status='PROCESADA'`,
        [saleId]
      )
    }

    const wb = XLSX.utils.book_new()

    // Build sheet manually to force VENTA column as text (xlsx auto-converts
    // long numeric strings like ML order numbers to number type, losing digits).
    const wsData = [
      ['PRODUCTO', 'CANTIDAD', 'VENTA', 'NOTA'],
      ...rows.map(r => [r.PRODUCTO, r.CANTIDAD, r.VENTA, r.NOTA]),
    ]
    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // Force VENTA column (col C = index 2) to text type so Excel keeps all digits
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
    for (let row = 1; row <= range.e.r; row++) {
      const cell = ws[XLSX.utils.encode_cell({ r: row, c: 2 })]
      if (cell) { cell.t = 's'; cell.z = '@' }
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Etiquetas')
    const rawBuf: Uint8Array = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    const buf = Buffer.from(rawBuf)

    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename=datos.xlsx',
      },
    })
  } catch (err) {
    return apiError(err)
  }
}
