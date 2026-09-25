import { NextRequest, NextResponse } from 'next/server'
import { unlink } from 'fs/promises'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { currentDate } from '@/lib/tz'
import {
  armarManifiesto, despachosForbidden, guardarArchivo, remitenteConfigurado, respuestaServicio,
} from '@/lib/despachos'

const Schema = z.object({ forzar: z.boolean().optional() })

/**
 * POST /api/despachos/jornadas/cerrar — genera el manifiesto de la jornada abierta
 * (todos sus lotes generados) y la cierra. Equivale a correr Manifiesto.exe.
 * Si hay lotes PENDIENTE sin generar, avisa (409) salvo `forzar`; esos lotes siguen
 * pendientes y entran en la próxima jornada al generarse.
 */
export async function POST(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied

  const userId = parseInt(session.user.id, 10)
  const client = await db.connect()
  let manifestPath: string | null = null
  try {
    const { forzar } = Schema.parse(await req.json().catch(() => ({})))
    await client.query('BEGIN')
    const { rows: [jornada] } = await client.query(
      `SELECT id FROM despacho_jornadas WHERE status = 'ABIERTA' FOR UPDATE`)
    if (!jornada) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'No hay una jornada abierta' }, { status: 400 })
    }

    const { rows: [{ n: pendientes }] } = await client.query(
      `SELECT COUNT(*)::int AS n FROM despacho_lotes WHERE status = 'PENDIENTE'`)
    if (pendientes > 0 && !forzar) {
      await client.query('ROLLBACK')
      return NextResponse.json({
        error: `Hay ${pendientes} lote(s) pendiente(s) sin generar: no entrarán en este manifiesto.`,
        pendientes,
      }, { status: 409 })
    }

    const remitente = await remitenteConfigurado(client)

    const { rows: envios } = await client.query(
      `SELECT to_char(l.generated_at, 'YYYY-MM-DD') AS fecha,
              COALESCE(NULLIF(e.remitente_limpio, ''), $2) AS remitente,
              e.venta, e.guia, COALESCE(e.destinatario, '') AS destinatario
       FROM despacho_etiquetas e
       JOIN despacho_lotes l ON l.id = e.lote_id
       WHERE l.jornada_id = $1 AND l.status = 'GENERADO' AND e.impresa
       ORDER BY l.generated_at, e.original_name, e.id`,
      [jornada.id, remitente])
    if (envios.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'La jornada no tiene envíos' }, { status: 400 })
    }

    const pdf = await armarManifiesto(remitente, currentDate('America/Caracas'), envios)
    manifestPath = await guardarArchivo('manifiestos', `manifiesto_jornada_${jornada.id}.pdf`, pdf)

    await client.query(
      `UPDATE despacho_jornadas
       SET status = 'CERRADA', closed_at = NOW(), closed_by = $2, manifest_path = $3, total_envios = $4
       WHERE id = $1`,
      [jornada.id, userId, manifestPath, envios.length])
    await client.query('COMMIT')
    return NextResponse.json({ ok: true, jornada_id: jornada.id, envios: envios.length })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    if (manifestPath) await unlink(manifestPath).catch(() => {})
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return respuestaServicio(err) ?? apiError(err)
  } finally {
    client.release()
  }
}
