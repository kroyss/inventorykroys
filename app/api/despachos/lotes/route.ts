import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { currentYearMonth } from '@/lib/tz'
import {
  despachosForbidden, guardarArchivo, leerEtiquetas, respuestaServicio, sha256,
  MAX_PDF_SIZE, MAX_PDFS_POR_SUBIDA,
} from '@/lib/despachos'

/**
 * POST /api/despachos/lotes — sube PDFs crudos de Mercado Envíos.
 * multipart: files[] (solo .pdf), lote_id opcional (agregar a un lote PENDIENTE).
 * Los PDFs se guardan byte a byte (sha256) y el servicio solo LEE sus datos.
 */
export async function POST(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied

  try {
    const form  = await req.formData()
    const files = form.getAll('files').filter((f): f is File => f instanceof File)
    if (files.length === 0) return NextResponse.json({ error: 'No se recibieron archivos' }, { status: 400 })
    if (files.length > MAX_PDFS_POR_SUBIDA) {
      return NextResponse.json({ error: `Máximo ${MAX_PDFS_POR_SUBIDA} PDFs por envío` }, { status: 400 })
    }

    // Regla: solo PDF crudo, tal cual se descarga. Nada de imágenes.
    const datos: { name: string; data: Buffer }[] = []
    const rechazados: string[] = []
    for (const f of files) {
      const data = Buffer.from(await f.arrayBuffer())
      const esPdf = f.name.toLowerCase().endsWith('.pdf') && data.subarray(0, 5).toString('latin1') === '%PDF-'
      if (!esPdf)                         rechazados.push(`${f.name}: no es un PDF`)
      else if (data.byteLength > MAX_PDF_SIZE) rechazados.push(`${f.name}: pesa más de 2 MB`)
      else                                datos.push({ name: f.name, data })
    }
    if (datos.length === 0) {
      return NextResponse.json({ error: 'Ningún archivo válido', rechazados }, { status: 400 })
    }

    const loteParam = form.get('lote_id')
    if (loteParam !== null && !/^\d+$/.test(String(loteParam))) {
      return NextResponse.json({ error: 'Lote inválido' }, { status: 400 })
    }

    const leidas = await leerEtiquetas(datos.map(d => d.data))

    // Archivos primero (fuera de la transacción); si la transacción falla quedan
    // huérfanos en disco, que es inofensivo.
    const sub = `originales/${currentYearMonth('America/Caracas')}`
    const paths = await Promise.all(datos.map(d => guardarArchivo(sub, `${randomUUID()}.pdf`, d.data)))

    const userId = parseInt(session.user.id, 10)
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      let loteId: number
      if (loteParam !== null) {
        loteId = parseInt(String(loteParam), 10)
        // FOR UPDATE: espera si el lote se está generando y después ve que ya no está PENDIENTE.
        const { rows: [l] } = await client.query(
          `SELECT status FROM despacho_lotes WHERE id = $1 FOR UPDATE`, [loteId])
        if (!l || l.status !== 'PENDIENTE') {
          await client.query('ROLLBACK')
          return NextResponse.json({ error: 'Ese lote ya no está pendiente: sube los PDFs como un lote nuevo' }, { status: 400 })
        }
      } else {
        const { rows: [l] } = await client.query(
          `INSERT INTO despacho_lotes (created_by) VALUES ($1) RETURNING id`, [userId])
        loteId = l.id
      }

      for (let i = 0; i < datos.length; i++) {
        const e = leidas[i]
        await client.query(
          `INSERT INTO despacho_etiquetas
             (lote_id, original_name, file_path, sha256, page_count, venta, guia,
              remitente, remitente_limpio, destinatario, read_error)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [loteId, datos[i].name, paths[i], sha256(datos[i].data), e.paginas ?? null, e.venta ?? null,
           e.guia ?? null, e.remitente ?? null, e.remitente_limpio ?? null, e.destinatario_limpio ?? null, e.error],
        )
      }
      await client.query('COMMIT')
      return NextResponse.json({ lote_id: loteId, subidas: datos.length, rechazados }, { status: 201 })
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    return respuestaServicio(err) ?? apiError(err)
  }
}
