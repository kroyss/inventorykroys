import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { despachosForbidden } from '@/lib/despachos'
import { LARGO_NOTA, sincronizarNotaDeVenta } from '@/lib/notasML'

// incluida: incluir/excluir del PDF · forzar_pago: "Despachar igual" con el pago sin verificar (Pagos ME)
// nota: la nota del paquete escrita en Despachos (sin inventario). null = volver a la de ML, '' = sin nota
// (solo en la etiqueta: la de ML no se borra). Se guarda en todas las etiquetas de esa venta del lote (mig. 079).
// Desde 01-11 una nota con texto se guarda TAMBIÉN en MercadoLibre (una sola nota en todos lados: Despachos,
// Pagos ME, Mensajes y ML); si ML falla, queda solo en la etiqueta (nota_despacho) y se avisa.
const Schema = z.object({
  incluida: z.boolean().optional(), forzar_pago: z.boolean().optional(),
  reimprimir: z.boolean().optional(),   // 12-11: «Reimprimir igual» una guía que ya salió en otro lote
  nota: z.string().trim().max(LARGO_NOTA, `Máximo ${LARGO_NOTA} caracteres`).nullable().optional(),
})

/** Escribe la nota en ML (máx. ~8 s, para no colgar la pantalla). true = quedó en ML. */
async function notaEnML(db: import('pg').Pool, venta: string, texto: string) {
  const { rows: [o] } = await db.query(
    `SELECT o.conexion_id FROM ml_ordenes o JOIN ml_conexiones x ON x.id = o.conexion_id AND x.estado = 'activa'
     WHERE o.id = $1::bigint OR o.pack_id = $1::bigint LIMIT 1`, [venta])
  const tope = new Promise<false>(r => setTimeout(() => r(false), 8000))
  const ok = await Promise.race([
    sincronizarNotaDeVenta(db, venta, texto, o?.conexion_id).catch(e => { console.error('[despachos nota ML]', venta, e); return false }),
    tope])
  if (ok) {
    // Copias locales con lo escrito (ML tarda en mostrarlo; notas_at evita releerlo enseguida).
    await db.query(`UPDATE ml_ordenes SET notas = $2, notas_at = NOW() WHERE id = $1::bigint OR pack_id = $1::bigint`, [venta, texto])
    await db.query(`UPDATE sales SET notes = $2, updated_at = NOW() WHERE ml_order_number = $1`, [venta, texto])
  }
  return ok
}

/** PATCH /api/despachos/lotes/[id]/etiquetas/[eid] — incluir/excluir una etiqueta de un lote pendiente, o "Despachar igual" */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; eid: string }> }) {
  const { id, eid } = await params
  if (!/^\d+$/.test(id) || !/^\d+$/.test(eid)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied

  try {
    const b = Schema.parse(await req.json())
    const userId = parseInt(session.user.id, 10)
    let ml: boolean | undefined
    if (b.nota !== undefined) {
      const { rows: [et] } = await db.query(
        `SELECT e.venta FROM despacho_etiquetas e JOIN despacho_lotes l ON l.id = e.lote_id
         WHERE e.id = $1 AND e.lote_id = $2 AND l.status = 'PENDIENTE'`, [eid, id])
      if (!et) return NextResponse.json({ error: 'Etiqueta no encontrada en un lote pendiente' }, { status: 400 })
      if (b.nota && /^\d{1,18}$/.test(et.venta ?? '')) ml = await notaEnML(db, et.venta, b.nota)
      // Quedó en ML → la etiqueta usa la de ML (la misma en todos lados); si no, la escrita aquí.
      const local = ml ? null : b.nota
      await db.query(
        `UPDATE despacho_etiquetas e SET nota_despacho = $1, nota_por = $4, nota_at = NOW()
         FROM despacho_lotes l
         WHERE e.lote_id = $3 AND l.id = e.lote_id AND l.status = 'PENDIENTE'
           AND (e.id = $2 OR e.venta = (SELECT venta FROM despacho_etiquetas WHERE id = $2 AND lote_id = $3))`,
        [local, eid, id, userId])
      if (b.incluida === undefined && b.forzar_pago === undefined && b.reimprimir === undefined) return NextResponse.json({
        ok: true, ml: ml ?? null,
        ...(ml === false ? { aviso: 'No se pudo guardar la nota en MercadoLibre: quedó solo en esta etiqueta. Vuelve a intentarlo en un rato.' } : {}),
      })
    }
    const { rowCount } = await db.query(
      `UPDATE despacho_etiquetas e SET
         incluida = CASE WHEN e.apartado IS NULL THEN COALESCE($1, e.incluida) ELSE e.incluida END,   -- apartado: se libera en "En espera"
         pago_forzado_por = CASE WHEN $4::boolean IS NULL THEN e.pago_forzado_por WHEN $4 THEN $5::int ELSE NULL END,
         pago_forzado_at  = CASE WHEN $4::boolean IS NULL THEN e.pago_forzado_at  WHEN $4 THEN NOW() ELSE NULL END,
         reimprimir_por   = CASE WHEN $6::boolean IS NULL THEN e.reimprimir_por   WHEN $6 THEN $5::int ELSE NULL END,
         reimprimir_at    = CASE WHEN $6::boolean IS NULL THEN e.reimprimir_at    WHEN $6 THEN NOW() ELSE NULL END
       FROM despacho_lotes l
       WHERE e.id = $2 AND e.lote_id = $3 AND l.id = e.lote_id AND l.status = 'PENDIENTE'`,
      [b.reimprimir ? true : (b.incluida ?? null), eid, id, b.forzar_pago ?? null, userId, b.reimprimir ?? null])
    if (!rowCount) return NextResponse.json({ error: 'Etiqueta no encontrada en un lote pendiente' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}

/** DELETE /api/despachos/lotes/[id]/etiquetas/[eid] — «Quitar del lote» (12-11): saca una etiqueta de un lote pendiente
 *  (p.ej. una guía que ya salió en otro lote). Solo la fila: el PDF queda en disco (puede ser el mismo de Pagos ME). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; eid: string }> }) {
  const { id, eid } = await params
  if (!/^\d+$/.test(id) || !/^\d+$/.test(eid)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied
  try {
    const { rowCount } = await db.query(
      `DELETE FROM despacho_etiquetas e USING despacho_lotes l
       WHERE e.id = $1 AND e.lote_id = $2 AND l.id = e.lote_id AND l.status = 'PENDIENTE' AND NOT e.impresa`, [eid, id])
    if (!rowCount) return NextResponse.json({ error: 'Etiqueta no encontrada en un lote pendiente' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
