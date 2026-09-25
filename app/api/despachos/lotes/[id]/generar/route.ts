import { NextRequest, NextResponse } from 'next/server'
import { unlink } from 'fs/promises'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import {
  armarLote, despachosForbidden, esGuiaDuplicada, etiquetasValidadas, filasDeVentas, guardarArchivo,
  IMPRIMIBLE, leerOriginal, MAX_POR_LOTE, respuestaServicio,
} from '@/lib/despachos'

/**
 * POST /api/despachos/lotes/[id]/generar — arma el PDF 4xA4 del lote.
 *
 * Todo o nada: si CUALQUIER código de barras / Data Matrix de una etiqueta no se lee
 * igual en el PDF armado, no se guarda nada y se devuelven las etiquetas con problema.
 * Si sale bien: el lote entra a la jornada abierta (se abre una si no hay), las guías
 * quedan impresas y las ventas PROCESADA pasan a DESCARGADA (como el export del Excel).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied

  const userId = parseInt(session.user.id, 10)
  const client = await db.connect()
  let outputPath: string | null = null
  try {
    await client.query('BEGIN')
    // Bloquea el lote: un doble clic no genera dos veces.
    const { rows: [lote] } = await client.query(
      `SELECT id, status FROM despacho_lotes WHERE id = $1 FOR UPDATE`, [id])
    if (!lote) { await client.query('ROLLBACK'); return NextResponse.json({ error: 'Lote no encontrado' }, { status: 404 }) }
    if (lote.status !== 'PENDIENTE') {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'El lote ya fue generado o descartado' }, { status: 400 })
    }

    const aImprimir = (await etiquetasValidadas(db, lote.id))
      .filter(e => e.incluida && IMPRIMIBLE[e.estado])
    if (aImprimir.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'No hay etiquetas listas para imprimir en este lote' }, { status: 400 })
    }
    if (aImprimir.length > MAX_POR_LOTE) {
      await client.query('ROLLBACK')
      return NextResponse.json({
        error: `Máximo ${MAX_POR_LOTE} etiquetas por lote (hay ${aImprimir.length}). Destilda algunas y genéralas en otro lote.`,
      }, { status: 400 })
    }

    // Bloquea las ventas y confirma que siguen imprimibles (nadie las reabrió entre la
    // revisión y este clic). Si algo cambió, se pide revalidar en vez de imprimir.
    const saleIds = [...new Set(aImprimir.map(e => e.sale_id!))]
    const { rows: ventasAhora } = await client.query(
      `SELECT id, status FROM sales WHERE id = ANY($1) FOR UPDATE`, [saleIds])
    const cambiadas = ventasAhora.filter(v => v.status !== 'PROCESADA' && v.status !== 'DESCARGADA')
    if (ventasAhora.length !== saleIds.length || cambiadas.length > 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({
        error: 'Alguna venta cambió de estado mientras revisabas. Toca "Revalidar" y vuelve a generar.',
      }, { status: 409 })
    }

    const pdfs  = await Promise.all(aImprimir.map(e => leerOriginal(e.file_path, e.sha256)))
    const filas = filasDeVentas(aImprimir)
    const { pdf, paginas, verificacion } = await armarLote(pdfs, filas)

    const fallas = verificacion
      .filter(v => v.esperados === 0 || v.faltan.length > 0)
      .map(v => {
        const e = aImprimir[v.indice]
        return {
          etiqueta_id: e.id,
          original_name: e.original_name,
          venta: e.venta,
          detalle: v.esperados === 0
            ? 'No se encontraron códigos en la etiqueta original'
            : `Códigos que no se leen en el PDF armado: ${v.faltan.join(', ')}`,
        }
      })
    if (fallas.length > 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({
        error: `${fallas.length} etiqueta(s) no pasaron la verificación de códigos. No se generó nada.`,
        fallas,
      }, { status: 422 })
    }

    // Jornada abierta (o se abre una)
    let { rows: [jornada] } = await client.query(
      `SELECT id FROM despacho_jornadas WHERE status = 'ABIERTA' FOR UPDATE`)
    if (!jornada) {
      ({ rows: [jornada] } = await client.query(
        `INSERT INTO despacho_jornadas (opened_by) VALUES ($1) RETURNING id`, [userId]))
    }

    outputPath = await guardarArchivo('lotes', `lote_${lote.id}.pdf`, pdf)

    await client.query(
      `UPDATE despacho_lotes
       SET status = 'GENERADO', jornada_id = $2, generated_at = NOW(), generated_by = $3,
           output_path = $4, label_count = $5, page_count = $6
       WHERE id = $1`,
      [lote.id, jornada.id, userId, outputPath, aImprimir.length, paginas])

    for (const e of aImprimir) {
      await client.query(
        `UPDATE despacho_etiquetas SET impresa = TRUE, sale_id = $2, reimpresion = $3 WHERE id = $1`,
        [e.id, e.sale_id, e.estado === 'REIMPRESION'])
    }
    await client.query(
      `UPDATE sales SET status = 'DESCARGADA', updated_at = NOW()
       WHERE id = ANY($1) AND status = 'PROCESADA'`,
      [saleIds])

    await client.query('COMMIT')
    return NextResponse.json({ ok: true, lote_id: lote.id, jornada_id: jornada.id, etiquetas: aImprimir.length, paginas })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    if (outputPath) await unlink(outputPath).catch(() => {})
    if (esGuiaDuplicada(err)) {
      return NextResponse.json({
        error: 'Una de las guías se acaba de imprimir en otro lote. Toca "Revalidar" y vuelve a generar.',
      }, { status: 409 })
    }
    return respuestaServicio(err) ?? apiError(err)
  } finally {
    client.release()
  }
}
