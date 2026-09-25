import { NextRequest, NextResponse } from 'next/server'
import { readFile, unlink } from 'fs/promises'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

type Params = { params: Promise<{ id: string; fileId: string }> }

async function findFile(req: NextRequest, { params }: Params) {
  const { id, fileId } = await params
  if (!/^\d+$/.test(id) || !/^\d+$/.test(fileId)) return { error: NextResponse.json({ error: 'ID inválido' }, { status: 400 }) }
  const { session, db } = await getSessionDb()
  if (!session || !db) return { error: unauthorized() }
  if (session.user.country !== 'VE') return { error: forbidden() }
  const { rows: [file] } = await db.query(
    `SELECT id, file_name, file_path, file_type FROM invoice_files WHERE id = $1 AND invoice_id = $2`,
    [fileId, id]
  )
  if (!file) return { error: NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 }) }
  return { file, db }
}

// GET → ver (inline) o bajar (?download=1) el comprobante.
export async function GET(req: NextRequest, ctx: Params) {
  const r = await findFile(req, ctx)
  if (r.error) return r.error
  try {
    const buf = await readFile(r.file.file_path)
    const force = req.nextUrl.searchParams.get('download') === '1'
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        'Content-Type':        r.file.file_type || 'application/octet-stream',
        'Content-Disposition': `${force ? 'attachment' : 'inline'}; filename="${encodeURIComponent(r.file.file_name)}"`,
        'Cache-Control':       'private, max-age=3600',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Archivo no encontrado en disco' }, { status: 404 })
  }
}

// DELETE → quitar un comprobante subido por error.
export async function DELETE(req: NextRequest, ctx: Params) {
  const r = await findFile(req, ctx)
  if (r.error) return r.error
  try {
    await r.db.query(`DELETE FROM invoice_files WHERE id = $1`, [r.file.id])
    try { await unlink(r.file.file_path) } catch {}
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
