import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { requestConnection } from '@/lib/requestConnection'
import { despachosForbidden } from '@/lib/despachos'
import { RESERVA_HORAS } from '@/lib/reportador'

// Envíos apartados (20-10, migración 107): sacar un envío puntual de Despachos / Reportador sin perderlo.
//   GET  ?buscar=venta|guía → los que están "En espera" y, si se busca, los envíos que se pueden apartar.
//   POST { id, accion: 'apartar', tipo: 'espera'|'cancelado', nota } · { id, accion: 'liberar' } · { id, accion: 'cancelar', nota? }
// Se puede apartar mientras no se haya reportado: en un lote sin imprimir (además se desmarca del PDF), impresa
// con la jornada abierta (no entra al manifiesto) o con la jornada ya cerrada (no lo reporta el Reportador).
// "Sale hoy" de una impresa cuya jornada ya cerró: pasa a la jornada abierta de hoy (en un lote "ya impreso",
// sin PDF nuevo) para que entre a su manifiesto y se reporte con esa tanda.

const COLUMNAS = `e.id, e.venta, e.guia, COALESCE(e.guia_final, e.guia) AS guia_ver, e.carrier, e.destinatario, e.remitente, e.impresa,
  e.apartado, e.apartado_nota, e.apartado_at, u.username AS apartado_por, l.status AS lote_status, j.status AS jornada_status,
  CASE WHEN NOT e.impresa THEN 'sin_imprimir' WHEN j.status = 'CERRADA' THEN 'por_reportar' ELSE 'impresa' END AS etapa`
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
    const buscar = (req.nextUrl.searchParams.get('buscar') ?? '').trim().replace(/[^\w-]/g, '')
    const [{ rows: espera }, candidatos] = await Promise.all([
      db.query(`SELECT ${COLUMNAS} ${DESDE} WHERE e.apartado = 'espera' ORDER BY e.apartado_at`),
      buscar.length >= 4
        ? db.query(
            `SELECT ${COLUMNAS} ${DESDE}
             WHERE e.apartado IS NULL AND ${APARTABLE}
               AND (e.venta ILIKE $1 OR e.guia ILIKE $1 OR e.guia_final ILIKE $1 OR e.destinatario ILIKE $1)
             ORDER BY e.created_at DESC LIMIT 10`, [`%${buscar}%`]).then(r => r.rows)
        : Promise.resolve(null),
    ])
    return NextResponse.json({ espera, candidatos })
  } catch (err) {
    return apiError(err)
  }
}

const Body = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('apartar'), id: z.number().int(), tipo: z.enum(['espera', 'cancelado']),
             nota: z.string().trim().min(2, 'Escribe el motivo (corto)').max(200) }),
  z.object({ accion: z.literal('liberar'), id: z.number().int() }),
  z.object({ accion: z.literal('cancelar'), id: z.number().int(), nota: z.string().trim().max(200).optional() }),
])

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
    const { rows: [e] } = await db.query(
      `SELECT e.id, e.venta, e.impresa, e.apartado, e.lote_id, e.reimpresion, e.reporte_estado, e.incluida, l.status AS lote_status,
              (e.reporte_tomado_at > NOW() - make_interval(hours => ${RESERVA_HORAS})) AS tomado,
              j.status AS jornada_status
       FROM despacho_etiquetas e JOIN despacho_lotes l ON l.id = e.lote_id LEFT JOIN despacho_jornadas j ON j.id = l.jornada_id
       WHERE e.id = $1 FOR UPDATE OF e`, [b.id])
    if (!e) { await db.query('ROLLBACK'); return NextResponse.json({ error: 'Envío no encontrado' }, { status: 404 }) }
    // Liberar / cancelar: la etiqueta y las demás de la misma venta en su lote que siguen en espera (varias guías).
    const MISMAS = `(id = $1 OR (lote_id = ${Number(e.lote_id)} AND venta IS NOT DISTINCT FROM $9 AND apartado = 'espera'))`

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
         WHERE id = $1`, [b.id, b.tipo, b.nota, userId])
      // Las demás etiquetas de la misma venta en ese lote (paquetes de varias guías) siguen la misma suerte.
      await db.query(
        `UPDATE despacho_etiquetas x SET apartado = $2, apartado_nota = $3, apartado_por = $4, apartado_at = NOW(),
                incluida = CASE WHEN x.impresa THEN x.incluida ELSE FALSE END
         FROM despacho_etiquetas e
         WHERE e.id = $1 AND x.lote_id = e.lote_id AND x.venta = e.venta AND x.id <> e.id AND x.apartado IS NULL`,
        [b.id, b.tipo, b.nota, userId])
    } else if (b.accion === 'cancelar') {
      if (e.apartado !== 'espera') { await db.query('ROLLBACK'); return NextResponse.json({ error: 'No está en espera' }, { status: 409 }) }
      await db.query(
        `UPDATE despacho_etiquetas SET apartado = 'cancelado', apartado_por = $2, apartado_at = NOW(),
                apartado_nota = COALESCE(NULLIF($3, ''), apartado_nota)
         WHERE ${MISMAS.replace('$9', '$4')}`, [b.id, userId, b.nota ?? null, e.venta])
    } else {
      // Liberar ("Sale hoy")
      if (e.apartado !== 'espera') { await db.query('ROLLBACK'); return NextResponse.json({ error: 'No está en espera' }, { status: 409 }) }
      if (!e.impresa) {
        if (e.lote_status !== 'PENDIENTE') {
          await db.query('ROLLBACK')
          return NextResponse.json({ error: 'Su lote ya se imprimió sin esta guía: vuelve a subir su PDF en Despachos y sale en el lote nuevo. Aquí puedes marcarla "Ya no se envía" para quitarla de la lista.' }, { status: 409 })
        }
        await db.query(`UPDATE despacho_etiquetas SET apartado = NULL, apartado_por = $2, apartado_at = NOW(), incluida = TRUE
                        WHERE ${MISMAS.replace('$9', '$3')}`, [b.id, userId, e.venta])
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
