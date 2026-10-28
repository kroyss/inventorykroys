import { NextRequest, NextResponse } from 'next/server'
import { unlink } from 'fs/promises'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import {
  armarLote, despachosForbidden, esGuiaDuplicada, etiquetasValidadas, filasDeVentas, guardarArchivo,
  IMPRIMIBLE, leerOriginal, MAX_POR_LOTE, respuestaServicio,
  refrescarVentasML, impresionEtiqueta,
} from '@/lib/despachos'
import { tieneModulo, ventasDesdeML } from '@/lib/modulos'

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
  // Sin inventario: las ventas son las de MercadoLibre; no hay venta del sistema que bloquear
  // ni pasar a DESCARGADA. Todo lo demás (armado, jornada, manifiesto, Reportador) es igual.
  const desdeML = ventasDesdeML(session.user)
  if (desdeML) await refrescarVentasML(db, parseInt(id, 10)).catch(() => {})
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

    const aImprimir = (await etiquetasValidadas(db, lote.id, desdeML, tieneModulo(session.user, 'pagos_me')))
      .filter(e => e.incluida && !e.apartado && IMPRIMIBLE[e.estado])   // apartado (mig. 107): nunca se imprime
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
    const saleIds = desdeML ? [] : [...new Set(aImprimir.map(e => e.sale_id!))]
    const { rows: ventasAhora } = desdeML ? { rows: [] as { id: number; status: string }[] } : await client.query(
      `SELECT id, status FROM sales WHERE id = ANY($1) FOR UPDATE`, [saleIds])
    const cambiadas = ventasAhora.filter(v => v.status !== 'PROCESADA' && v.status !== 'DESCARGADA')
    if (ventasAhora.length !== saleIds.length || cambiadas.length > 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({
        error: 'Alguna venta cambió de estado mientras revisabas. Toca "Revalidar" y vuelve a generar.',
      }, { status: 409 })
    }

    const pdfs  = await Promise.all(aImprimir.map(e => leerOriginal(e.file_path, e.sha256)))
    // Sin inventario: la empresa puede apagar el título y/o la nota en la etiqueta (la cantidad va siempre).
    const imp = desdeML ? await impresionEtiqueta(client) : { sin_titulo: false, sin_nota: false }
    const filas = filasDeVentas(aImprimir).map(f => ({
      ...f, producto: imp.sin_titulo ? '' : f.producto, nota: imp.sin_nota ? '' : f.nota,
    }))
    const { pdf, paginas, verificacion } = await armarLote(pdfs, filas, aImprimir.map(e => e.venta ?? ''))

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

    // Las que NO se imprimieron (pago sin verificar, destildadas, con error) pasan al lote pendiente (26-10): antes
    // quedaban dentro de este lote ya generado y no se veían en ningún lado (BUYBOOK: 14 guías). Las apartadas siguen
    // en "En espera", como siempre.
    // Las destildadas que ya se completaron en MercadoEnvíos (despachadas por otro lado, 28-10) se quedan en este lote.
    const impresas = aImprimir.map(e => e.id)
    const otroLado = `NOT (NOT incluida AND EXISTS (SELECT 1 FROM me_pagos p WHERE p.venta = despacho_etiquetas.venta AND p.estado_me = 'completed'))`
    const { rows: [quedan] } = await client.query(
      `SELECT COUNT(*)::int AS n FROM despacho_etiquetas
       WHERE lote_id = $1 AND NOT impresa AND apartado IS NULL AND NOT (id = ANY($2)) AND ${otroLado}`, [lote.id, impresas])
    let siguiente: number | null = null
    if (quedan.n > 0) {
      const { rows: [p] } = await client.query(
        `SELECT id FROM despacho_lotes WHERE status = 'PENDIENTE' AND id <> $1 ORDER BY id DESC LIMIT 1 FOR UPDATE`, [lote.id])
      siguiente = p?.id ?? (await client.query(
        `INSERT INTO despacho_lotes (created_by) VALUES ($1) RETURNING id`, [userId])).rows[0].id
      await client.query(
        `UPDATE despacho_etiquetas SET lote_id = $2
         WHERE lote_id = $1 AND NOT impresa AND apartado IS NULL AND NOT (id = ANY($3)) AND ${otroLado}`, [lote.id, siguiente, impresas])
    }

    await client.query('COMMIT')
    return NextResponse.json({ ok: true, lote_id: lote.id, jornada_id: jornada.id, etiquetas: aImprimir.length, paginas,
                               pasaron: quedan.n, lote_siguiente: siguiente })
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
