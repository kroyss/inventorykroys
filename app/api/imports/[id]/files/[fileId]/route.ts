import { NextRequest, NextResponse } from 'next/server'
import { getSessionDb, unauthorized } from '@/lib/session'
import { unlink } from 'fs/promises'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id, fileId } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  const { rows: [file] } = await db.query(
    `SELECT file_path, file_name FROM import_order_files WHERE id=$1 AND import_order_id=$2`,
    [fileId, id]
  )
  if (!file) return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 })

  try { await unlink(file.file_path) } catch {}
  await db.query(`DELETE FROM import_order_files WHERE id = $1`, [fileId])

  return NextResponse.json({ ok: true, message: `Archivo '${file.file_name}' eliminado` })
}
