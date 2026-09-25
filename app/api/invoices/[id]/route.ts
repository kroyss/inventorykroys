import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { getInvoice } from '@/lib/invoicesServer'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.country !== 'VE') return forbidden()

  try {
    const inv = await getInvoice(db, id)
    if (!inv) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
    const { rows: files } = await db.query(`
      SELECT f.id, f.file_name, f.file_type, f.file_size, f.uploaded_at, u.username AS uploaded_by
      FROM invoice_files f LEFT JOIN users u ON u.id = f.uploaded_by
      WHERE f.invoice_id = $1 ORDER BY f.uploaded_at
    `, [id])
    inv.files = files.map(f => ({
      id: f.id, file_name: f.file_name, file_type: f.file_type,
      file_size_kb: f.file_size ? Math.round(f.file_size / 1024 * 10) / 10 : 0,
      uploaded_at: f.uploaded_at, uploaded_by: f.uploaded_by,
    }))
    return NextResponse.json(inv)
  } catch (err) {
    return apiError(err)
  }
}

// PUT /api/invoices/[id] → datos que se completan después de emitir: N° de control,
// notas y el comprobante de retención. No toca montos ni cliente (eso es reemitir).
const EditSchema = z.object({
  control_number: z.string().max(30).nullable().optional(),
  notes:          z.string().nullable().optional(),
  retention: z.object({
    voucher:   z.string().trim().max(30),
    date:      z.string().regex(DATE_RE).nullable(),
    amount_bs: z.number().nonnegative().nullable(),
  }).optional(),
})

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.country !== 'VE') return forbidden()

  try {
    const body = EditSchema.parse(await req.json())
    const { rows: [inv] } = await db.query(
      `SELECT id, retention_status FROM invoices WHERE id = $1`, [id]
    )
    if (!inv) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })

    const sets: string[] = []
    const vals: unknown[] = []
    const set = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`) }

    if (body.control_number !== undefined) set('control_number', body.control_number?.trim() || null)
    if (body.notes !== undefined)          set('notes', body.notes?.trim() || null)
    if (body.retention) {
      if (inv.retention_status === 'NO_APLICA') {
        return NextResponse.json({ error: 'Esta factura no tiene retención' }, { status: 400 })
      }
      const voucher = body.retention.voucher
      set('retention_voucher', voucher || null)
      set('retention_date', body.retention.date)
      set('retention_amount_bs', body.retention.amount_bs)
      // Con N° de comprobante se da por recibida; borrarlo la vuelve a PENDIENTE.
      set('retention_status', voucher ? 'RECIBIDA' : 'PENDIENTE')
    }
    if (sets.length === 0) return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })

    vals.push(id)
    await db.query(`UPDATE invoices SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals)
    return NextResponse.json(await getInvoice(db, id))
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
