import { NextRequest, NextResponse } from 'next/server'
import { getSessionDb, unauthorized } from '@/lib/session'
import { readFile } from 'fs/promises'
import { resolveUploadPath } from '@/lib/uploads'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id, fileId } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  const { rows: [file] } = await db.query(
    `SELECT file_path, file_name, file_type, visible_to_user FROM import_order_files WHERE id=$1 AND import_order_id=$2`,
    [fileId, id]
  )
  if (!file) return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 })

  // El usuario normal no puede descargar fotos no marcadas como visibles
  // (p.ej. comprobantes de pago) aunque adivine la URL.
  if (session.user.role !== 'admin' && !file.visible_to_user) {
    return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 })
  }

  // El file_path en DB puede venir roto entre entornos (ruta legacy /app/uploads,
  // backslashes, etc.). Resolver físicamente desde UPLOAD_DIR + orden + nombre.
  const realPath = await resolveUploadPath(file.file_path, id)
  if (!realPath) return NextResponse.json({ error: 'Archivo no encontrado en disco' }, { status: 404 })

  try {
    const buf = await readFile(realPath)
    const isImage = (file.file_type || '').startsWith('image/')
    // ?download=1 forces attachment even for images
    const force = req.nextUrl.searchParams.get('download') === '1'
    const disposition = (isImage && !force) ? 'inline' : 'attachment'
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type':        file.file_type || 'application/octet-stream',
        'Content-Disposition': `${disposition}; filename="${encodeURIComponent(file.file_name)}"`,
        'Cache-Control':       'private, max-age=3600',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Archivo no encontrado en disco' }, { status: 404 })
  }
}
