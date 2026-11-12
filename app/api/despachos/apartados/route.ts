import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { requestConnection } from '@/lib/requestConnection'
import { despachosForbidden } from '@/lib/despachos'
import { RESERVA_HORAS } from '@/lib/reportador'
import { SIGUE_EN_ESPERA } from '@/lib/despachosApartados'
import { sqlFacturaIncluye } from '@/lib/invoicesServer'

// Envíos apartados (20-10, migración 107): sacar un envío puntual de Despachos / Reportador sin perderlo.
//   GET  ?buscar=venta|guía → los que están "En espera" y, si se busca, los envíos que se pueden apartar.
//        ?lista=1 (12-11, el dueño) → además `disponibles`: los apartables de los últimos 15 días (sin buscar), para
//        elegirlos a dedo; primero los de jornada cerrada (los que el Reportador va a reportar).
//   POST { id, accion: 'apartar', tipo: 'espera'|'cancelado'|'enviada', nota } · { ids, accion: 'ya_enviadas' } (mig 147: ya salió por fuera, sin cancelar) · { id, accion: 'liberar' } · { id, accion: 'cancelar', nota? }
// Se puede apartar mientras no se haya reportado: en un lote sin imprimir (además se desmarca del PDF), impresa
// con la jornada abierta (no entra al manifiesto) o con la jornada ya cerrada (no lo reporta el Reportador).
// "Sale en el próximo manifiesto" de una impresa cuya jornada ya cerró: pasa a la jornada abierta de hoy (en un lote "ya impreso",
// sin PDF nuevo) para que entre a su manifiesto y se reporte con esa tanda.

const COLUMNAS = `e.id, e.venta, e.guia, COALESCE(e.guia_final, e.guia) AS guia_ver, e.carrier, e.destinatario, e.remitente, e.impresa,
  e.apartado, e.apartado_nota, e.apartado_at, u.username AS apartado_por, l.status AS lote_status, j.status AS jornada_status,
  CASE WHEN NOT e.impresa THEN 'sin_imprimir' WHEN j.status = 'CERRADA' THEN 'por_reportar' ELSE 'impresa' END AS etapa,
  -- Qué lleva (23-10, pedido de un Fundador: "si no, no sé cuál es cuál"): la venta cargada o, sin inventario, la de ML.
  COALESCE((SELECT string_agg(si.quantity || ' × ' || p.name, ' · ' ORDER BY si.id)
            FROM sales s JOIN sale_items si ON si.sale_id = s.id JOIN products p ON p.id = si.product_id
            WHERE s.ml_order_number = e.venta),
           (SELECT o.productos FROM ml_ordenes o WHERE e.venta ~ '^[0-9]{1,18}$' AND (o.id = e.venta::bigint OR o.pack_id = e.venta::bigint)
            ORDER BY (o.id = e.venta::bigint) DESC LIMIT 1)) AS productos,
  -- 12-11 (el dueño): la venta cargada en Ventas, para que «Ya no se envía» ofrezca anularla y devolver el stock.
  (SELECT json_build_object('id', s.id, 'status', s.status,
            'factura', (SELECT i.invoice_number FROM invoices i WHERE ${sqlFacturaIncluye('i', 's.id')} LIMIT 1))
   FROM sales s WHERE s.ml_order_number = e.venta LIMIT 1) AS venta_sistema`
const DESDE = `FROM despacho_etiquetas e
  JOIN despacho_lotes l ON l.id = e.lote_id
  LEFT JOIN despacho_jornadas j ON j.id = l.jornada_id
  LEFT JOIN users u ON u.id = e.apartado_por`
// Todavía se puede frenar: no reportado (o con error), no reimpresión, en un lote vivo.
const APARTABLE = `NOT e.reimpresion AND l.status <> 'DESCARTADO'
  AND (e.reporte_estado IS NULL OR e.reporte_estado IN ('RECHAZADO', 'ERROR'))
  AND (e.impresa OR (l.status = 'PENDIENTE' AND e.incluida))`

export async function GET(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied
  try {
    // Venta, guía o nombre (con espacios y acentos); sin los comodines de ILIKE.
    const buscar = (req.nextUrl.searchParams.get('buscar') ?? '').trim().replace(/[%_\\]/g, '').slice(0, 60)
    const lista = req.nextUrl.searchParams.get('lista') === '1'
    const [{ rows: espera }, candidatos, disponibles] = await Promise.all([
      db.query(`SELECT ${COLUMNAS} ${DESDE} WHERE e.apartado = 'espera' AND ${SIGUE_EN_ESPERA} ORDER BY e.apartado_at`),
      buscar.length >= 4
        ? db.query(
            `SELECT ${COLUMNAS} ${DESDE}
             WHERE e.apartado IS NULL AND ${APARTABLE}
               AND (e.venta ILIKE $1 OR e.guia ILIKE $1 OR e.guia_final ILIKE $1 OR e.destinatario ILIKE $1)
             ORDER BY e.created_at DESC LIMIT 10`, [`%${buscar}%`]).then(r => r.rows)
        : Promise.resolve(null),
      lista
        ? db.query(
            `SELECT ${COLUMNAS} ${DESDE}
             WHERE e.apartado IS NULL AND ${APARTABLE} AND e.created_at > NOW() - INTERVAL '15 days'
             ORDER BY CASE WHEN NOT e.impresa THEN 2 WHEN j.status = 'CERRADA' THEN 0 ELSE 1 END, e.created_at DESC
             LIMIT 150`).then(r => r.rows)
        : Promise.resolve(null),
    ])
    return NextResponse.json({ espera, candidatos, disponibles })
  } catch (err) {
    return apiError(err)
  }
}

const Body = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('apartar'), id: z.number().int(), tipo: z.enum(['espera', 'cancelado', 'enviada']),
    concretada: z.boolean().optional(), anular_venta: z.boolean().optional(),
             nota: z.string().trim().max(200) })
    // 12-11 (el dueño): el motivo solo es obligatorio para «No se enviará» (no tiene vuelta atrás); «Todavía no sale», opcional.
    .refine(x => x.tipo !== 'cancelado' || x.nota.length >= 2, { message: 'Elige o escribe el motivo' }),
  z.object({ accion: z.literal('ya_enviadas'), ids: z.array(z.number().int()).min(1).max(300) }),
  z.object({ accion: z.literal('liberar'), id: z.number().int() }),
  z.object({ accion: z.literal('cancelar'), id: z.number().int(), nota: z.string().trim().max(200).optional(),
    concretada: z.boolean().optional(), anular_venta: z.boolean().optional() }),
])

// 04-11 (BUYBOOK: una venta cancelada en Despachos, con pago y reintegro, no se calificó sola y ML la iba a concretar):
// "Cancelado" en Despachos = la venta no se concretó. Se marca "No se concretó" (la marca de Por confirmar, mig 115),
// que va por delante del pago en Calificaciones y la automática respeta. Solo si nadie la marcó ni la calificó antes.
async function marcarCanceladaEnML(db: { query: (q: string, v?: unknown[]) => Promise<unknown> }, venta: string | null, userId: number, nota: string | null) {
  if (!venta) return
  await db.query(
    `UPDATE ml_ordenes SET no_concretada_at = NOW(), no_concretada_motivo = 'otro', no_concretada_por = $2,
            no_concretada_nota = $3
     WHERE (id::text = $1 OR pack_id::text = $1) AND no_concretada_at IS NULL AND cal_vendedor IS NULL
       AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.ml_order_number = $1)`,
    [venta, userId, `Cancelada en Despachos${nota ? `: ${nota}` : ''}`.slice(0, 200)])
}

type Q = { query: (q: string, v?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> }   // eslint-disable-line @typescript-eslint/no-explicit-any

// 12-11 (el dueño): al cancelar el envío la persona dice si la venta se concretó (retiro, otro envío) o no (reembolso,
// anulada). Eso decide Calificaciones aunque la venta esté cargada en Ventas (antes, cargada y DESCARGADA, quedaba
// "concretada" y la automática la calificaba bien). Sin respuesta (versión anterior de la pantalla): lo de siempre.
async function marcarResultadoEnML(db: Q, venta: string | null, userId: number, concretada: boolean, nota: string | null, anulada: boolean) {
  if (!venta) return
  if (concretada) {
    await db.query(
      `UPDATE ml_ordenes SET fuera_at = COALESCE(fuera_at, NOW()), fuera_por = COALESCE(fuera_por, $2)
       WHERE (id::text = $1 OR pack_id::text = $1) AND no_concretada_at IS NULL AND cal_vendedor IS NULL`, [venta, userId])
    return
  }
  await db.query(
    `UPDATE ml_ordenes SET no_concretada_at = NOW(), no_concretada_motivo = 'otro', no_concretada_por = $2,
            no_concretada_nota = $3, fuera_at = NULL, fuera_por = NULL
     WHERE (id::text = $1 OR pack_id::text = $1) AND no_concretada_at IS NULL AND cal_vendedor IS NULL`,
    [venta, userId, `Cancelada en Despachos${anulada ? ' (venta anulada)' : ''}${nota ? `: ${nota}` : ''}`.slice(0, 200)])
}

/** Anula la venta cargada en Ventas: devuelve al inventario lo que había descontado y la borra. Con factura no se puede. */
async function anularVenta(db: Q, venta: string, userId: number): Promise<string | null> {
  const { rows: [s] } = await db.query(`SELECT id, status FROM sales WHERE ml_order_number = $1 FOR UPDATE`, [venta])
  if (!s) return null
  const { rows: [inv] } = await db.query(`SELECT invoice_number FROM invoices i WHERE ${sqlFacturaIncluye('i', '$1')} LIMIT 1`, [s.id])
  if (inv) return `La venta tiene la factura #${inv.invoice_number}: no se puede anular desde aquí. Elige «Mantener la venta registrada» y resuélvelo en Facturas.`
  if (['PROCESADA', 'DESCARGADA', 'DESCARGADA_LOCAL'].includes(s.status)) {
    const { rows: items } = await db.query(`SELECT product_id, quantity FROM sale_items WHERE sale_id = $1`, [s.id])
    for (const it of items) {
      await db.query(`UPDATE inventory SET quantity = quantity + $1, last_updated = NOW() WHERE product_id = $2`, [it.quantity, it.product_id])
      await db.query(
        `INSERT INTO inventory_movements (product_id, movement_type, quantity, reference, notes, created_by)
         VALUES ($1, 'IN', $2, $3, 'Anulada desde Despachos: ya no se envía', $4)`,
        [it.product_id, it.quantity, `Venta anulada #${s.id} (${venta})`, userId])
    }
  }
  await db.query(`UPDATE despacho_etiquetas SET sale_id = NULL WHERE sale_id = $1`, [s.id])
  await db.query(`DELETE FROM sale_items WHERE sale_id = $1`, [s.id])
  await db.query(`DELETE FROM sales WHERE id = $1`, [s.id])
  return null
}

export async function POST(req: NextRequest) {
  const { session, db: pool } = await getSessionDb()
  if (!session || !pool) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied
  const userId = parseInt(session.user.id, 10)
  const db = await requestConnection(pool)
  try {
    const b = Body.parse(await req.json())
    await db.query('BEGIN')
    // "Ya la envié" en lote (primera jornada, mig 147): salen de la jornada y del manifiesto, la venta NO se cancela.
    if (b.accion === 'ya_enviadas') {
      const { rowCount } = await db.query(
        `UPDATE despacho_etiquetas x SET apartado = 'enviada', apartado_nota = 'Ya enviada por fuera de Despachos', apartado_por = $2,
                apartado_at = NOW(), incluida = CASE WHEN x.impresa THEN x.incluida ELSE FALSE END
         FROM despacho_etiquetas e JOIN despacho_lotes l ON l.id = e.lote_id
         WHERE e.id = ANY($1::int[]) AND e.apartado IS NULL AND ${APARTABLE}
           AND x.apartado IS NULL AND (x.id = e.id OR (x.lote_id = e.lote_id AND x.venta = e.venta))`, [b.ids, userId])
      await db.query('COMMIT')
      return NextResponse.json({ ok: true, n: rowCount ?? 0 })
    }
    const { rows: [e] } = await db.query(
      `SELECT e.id, e.venta, e.impresa, e.apartado, e.lote_id, e.reimpresion, e.reporte_estado, e.incluida, l.status AS lote_status,
              (e.reporte_tomado_at > NOW() - make_interval(hours => ${RESERVA_HORAS})) AS tomado,
              j.status AS jornada_status
       FROM despacho_etiquetas e JOIN despacho_lotes l ON l.id = e.lote_id LEFT JOIN despacho_jornadas j ON j.id = l.jornada_id
       WHERE e.id = $1 FOR UPDATE OF e`, [b.id])
    if (!e) { await db.query('ROLLBACK'); return NextResponse.json({ error: 'Envío no encontrado' }, { status: 404 }) }
    // Liberar / cancelar: la etiqueta y las demás de la misma venta en su lote que siguen en espera (varias guías).
    const MISMAS = `(id = $1 OR (lote_id = ${Number(e.lote_id)} AND venta IS NOT DISTINCT FROM $9 AND apartado = 'espera'))`
    // «No se enviará» / «Ya no se envía»: anular la venta cargada (si lo pidió) y marcar en ML si se concretó o no.
    const cerrarCancelado = async (concretada: boolean | undefined, anular: boolean | undefined, nota: string | null) => {
      if (anular && e.venta) {
        const error = await anularVenta(db, e.venta, userId)
        if (error) { await db.query('ROLLBACK'); return NextResponse.json({ error }, { status: 409 }) }
      }
      if (concretada === undefined) await marcarCanceladaEnML(db, e.venta, userId, nota)
      else await marcarResultadoEnML(db, e.venta, userId, concretada, nota, !!anular)
      return null
    }

    if (b.accion === 'apartar') {
      const { rows: [ok] } = await db.query(`SELECT 1 FROM despacho_etiquetas e JOIN despacho_lotes l ON l.id = e.lote_id
                                             WHERE e.id = $1 AND e.apartado IS NULL AND ${APARTABLE}`, [b.id])
      if (!ok) { await db.query('ROLLBACK'); return NextResponse.json({ error: 'Este envío ya no se puede apartar (ya se reportó, o ya está apartado)' }, { status: 409 }) }
      // El Reportador (programa de la PC o el del sistema) lo tomó para mandarlo: apartarlo ahora no frenaría el mensaje.
      if (e.tomado) {
        await db.query('ROLLBACK')
        return NextResponse.json({ error: 'El Reportador lo está enviando en este momento: espera unos minutos y vuelve a intentar (si ya salió, no hace falta apartarlo).' }, { status: 409 })
      }
      await db.query(
        `UPDATE despacho_etiquetas SET apartado = $2, apartado_nota = $3, apartado_por = $4, apartado_at = NOW(),
                incluida = CASE WHEN impresa THEN incluida ELSE FALSE END
         WHERE id = $1`, [b.id, b.tipo, b.nota || (b.tipo === 'enviada' ? 'Ya enviada por fuera de Despachos' : null), userId])
      // Las demás etiquetas de la misma venta en ese lote (paquetes de varias guías) siguen la misma suerte.
      await db.query(
        `UPDATE despacho_etiquetas x SET apartado = $2, apartado_nota = $3, apartado_por = $4, apartado_at = NOW(),
                incluida = CASE WHEN x.impresa THEN x.incluida ELSE FALSE END
         FROM despacho_etiquetas e
         WHERE e.id = $1 AND x.lote_id = e.lote_id AND x.venta = e.venta AND x.id <> e.id AND x.apartado IS NULL`,
        [b.id, b.tipo, b.nota || (b.tipo === 'enviada' ? 'Ya enviada por fuera de Despachos' : null), userId])
      if (b.tipo === 'cancelado') {
        const r = await cerrarCancelado(b.concretada, b.anular_venta, b.nota)
        if (r) return r
      }
    } else if (b.accion === 'cancelar') {
      if (e.apartado !== 'espera') { await db.query('ROLLBACK'); return NextResponse.json({ error: 'No está en espera' }, { status: 409 }) }
      await db.query(
        `UPDATE despacho_etiquetas SET apartado = 'cancelado', apartado_por = $2, apartado_at = NOW(),
                apartado_nota = COALESCE(NULLIF($3, ''), apartado_nota)
         WHERE ${MISMAS.replace('$9', '$4')}`, [b.id, userId, b.nota ?? null, e.venta])
      const r = await cerrarCancelado(b.concretada, b.anular_venta, b.nota ?? null)
      if (r) return r
    } else {
      // Liberar ("Sale en el próximo manifiesto")
      if (e.apartado !== 'espera') { await db.query('ROLLBACK'); return NextResponse.json({ error: 'No está en espera' }, { status: 409 }) }
      if (!e.impresa) {
        // 28-10: su lote ya se imprimió sin ella (BUYBOOK: "no pasa nada" — antes pedía volver a subir el PDF y el aviso
        // quedaba arriba del panel, sin verse). Su PDF sigue guardado: pasa sola al lote pendiente (se crea si no hay).
        let lote = e.lote_id
        if (e.lote_status !== 'PENDIENTE') {
          const { rows: [p] } = await db.query(`SELECT id FROM despacho_lotes WHERE status = 'PENDIENTE' ORDER BY id DESC LIMIT 1 FOR UPDATE`)
          lote = p?.id ?? (await db.query(`INSERT INTO despacho_lotes (created_by) VALUES ($1) RETURNING id`, [userId])).rows[0].id
          const { rows: [dup] } = await db.query(
            `SELECT 1 FROM despacho_etiquetas x JOIN despacho_etiquetas e ON e.id = $1
             WHERE x.lote_id = $2 AND x.id <> e.id AND (x.sha256 = e.sha256 OR (x.guia IS NOT NULL AND x.guia = e.guia))`, [b.id, lote])
          if (dup) {
            await db.query('ROLLBACK')
            return NextResponse.json({ error: 'Esta guía ya está en el lote pendiente (se volvió a subir): sale desde ahí. Aquí márcala «Ya no se envía» para quitarla de la lista.' }, { status: 409 })
          }
        }
        await db.query(`UPDATE despacho_etiquetas SET apartado = NULL, apartado_por = $2, apartado_at = NOW(), incluida = TRUE, lote_id = $4
                        WHERE ${MISMAS.replace('$9', '$3')}`, [b.id, userId, e.venta, lote])
      } else if (e.jornada_status === 'CERRADA') {
        // Su jornada ya cerró: pasa a la jornada abierta (se abre si no hay), en un lote "ya impreso" sin PDF.
        let { rows: [jornada] } = await db.query(`SELECT id FROM despacho_jornadas WHERE status = 'ABIERTA' FOR UPDATE`)
        if (!jornada) ({ rows: [jornada] } = await db.query(`INSERT INTO despacho_jornadas (opened_by) VALUES ($1) RETURNING id`, [userId]))
        const { rows: [lote] } = await db.query(
          `INSERT INTO despacho_lotes (jornada_id, status, created_by, generated_at, generated_by, output_path, label_count, page_count)
           VALUES ($1, 'GENERADO', $2, NOW(), $2, NULL, 0, 0) RETURNING id`, [jornada.id, userId])
        const { rowCount } = await db.query(
          `UPDATE despacho_etiquetas SET lote_id = $2, apartado = NULL, apartado_por = $3, apartado_at = NOW()
           WHERE ${MISMAS.replace('$9', '$4')}`, [b.id, lote.id, userId, e.venta])
        await db.query(`UPDATE despacho_lotes SET label_count = $2 WHERE id = $1`, [lote.id, rowCount])
      } else {
        await db.query(`UPDATE despacho_etiquetas SET apartado = NULL, apartado_por = $2, apartado_at = NOW()
                        WHERE ${MISMAS.replace('$9', '$3')}`, [b.id, userId, e.venta])
      }
    }
    await db.query('COMMIT')
    return NextResponse.json({ ok: true })
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {})
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
