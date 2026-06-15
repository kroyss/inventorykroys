import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { mkdir, writeFile, unlink, rmdir } from 'fs/promises'
import path from 'path'

const UPLOAD_DIR   = process.env.UPLOAD_DIR ?? './uploads'
const ALLOWED_EXTS = new Set(['.jpg','.jpeg','.png','.gif','.webp','.pdf','.xlsx','.xls','.doc','.docx'])
const MAX_SIZE     = 10 * 1024 * 1024 // 10 MB

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  const { rows } = await db.query(`
    SELECT f.id, f.file_name, f.file_path, f.file_type,
           f.file_size, f.uploaded_at, u.username AS uploaded_by
    FROM import_order_files f
    LEFT JOIN users u ON f.uploaded_by = u.id
    WHERE f.import_order_id = $1
    ORDER BY f.uploaded_at DESC
  `, [id])

  return NextResponse.json(rows.map(r => ({
    id:           r.id,
    file_name:    r.file_name,
    file_type:    r.file_type,
    file_size_kb: r.file_size ? Math.round(r.file_size / 1024 * 10) / 10 : 0,
    uploaded_at:  r.uploaded_at,
    uploaded_by:  r.uploaded_by,
  })))
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  try {
    const formData = await req.formData()
    const file     = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

    const ext = path.extname(file.name).toLowerCase()
    if (!ALLOWED_EXTS.has(ext)) {
      return NextResponse.json({ error: `Tipo de archivo no permitido: ${ext}` }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    if (buffer.byteLength > MAX_SIZE) {
      return NextResponse.json({ error: 'Archivo muy grande. Máximo 10MB' }, { status: 400 })
    }

    const userId     = parseInt(session.user.id, 10)
    const uploadPath = path.join(UPLOAD_DIR, id)
    await mkdir(uploadPath, { recursive: true })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
    const safeName  = `${timestamp}_${file.name.replace(/\s/g, '_')}`
    const filePath  = path.join(uploadPath, safeName)
    await writeFile(filePath, buffer)

    const { rows: [row] } = await db.query(
      `INSERT INTO import_order_files
         (import_order_id, file_name, file_path, file_type, file_size, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [id, file.name, filePath, file.type, buffer.byteLength, userId]
    )

    return NextResponse.json({
      id:        row.id,
      file_name: file.name,
      file_size: buffer.byteLength,
      message:   'Archivo subido exitosamente',
    }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  const { rows: files } = await db.query(
    `SELECT file_path FROM import_order_files WHERE import_order_id = $1`, [id]
  )
  for (const { file_path } of files) {
    try { await unlink(file_path) } catch {}
  }
  await db.query(`DELETE FROM import_order_files WHERE import_order_id = $1`, [id])
  try {
    const folder = path.join(UPLOAD_DIR, id)
    await rmdir(folder)
  } catch {}

  return NextResponse.json({ ok: true, message: 'Archivos eliminados' })
}
