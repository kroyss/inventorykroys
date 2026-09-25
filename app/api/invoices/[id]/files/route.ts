import { NextRequest, NextResponse } from 'next/server'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { UPLOAD_DIR } from '@/lib/uploads'

const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'])
const MAX_SIZE     = 10 * 1024 * 1024 // 10 MB

// POST /api/invoices/[id]/files (multipart "file") → adjunta el comprobante de retención.
// Se guarda en UPLOAD_DIR/facturas/{id}/ (mismo volumen que las fotos de importaciones).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.country !== 'VE') return forbidden()

  try {
    const { rows: [inv] } = await db.query(`SELECT id FROM invoices WHERE id = $1`, [id])
    if (!inv) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })

    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })
    // Una imagen pegada con Ctrl+V llega como "image.png": se respeta su extensión.
    const ext = path.extname(file.name).toLowerCase()
    if (!ALLOWED_EXTS.has(ext)) {
      return NextResponse.json({ error: `Tipo de archivo no permitido: ${ext || 'sin extensión'} (solo imagen o PDF)` }, { status: 400 })
    }
    const buffer = Buffer.from(await file.arrayBuffer())
    if (buffer.byteLength > MAX_SIZE) {
      return NextResponse.json({ error: 'Archivo muy grande. Máximo 10MB' }, { status: 400 })
    }

    const dir = path.join(UPLOAD_DIR, 'facturas', id)
    await mkdir(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
    const filePath = path.join(dir, `${stamp}_${path.basename(file.name).replace(/[^\w.\-]/g, '_')}`)
    await writeFile(filePath, buffer)

    const { rows: [row] } = await db.query(`
      INSERT INTO invoice_files (invoice_id, file_name, file_path, file_type, file_size, uploaded_by)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
    `, [id, file.name, filePath, file.type || null, buffer.byteLength, parseInt(session.user.id, 10)])
    return NextResponse.json({ id: row.id, file_name: file.name }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
