import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { requestConnection } from '@/lib/requestConnection'
import { despachosForbidden, digitosGuiaTealca } from '@/lib/despachos'

/**
 * GET /api/despachos/tealca — envíos TEALCA impresos que aún no se reportaron, con su
 * guía final (si ya la tienen). Es la lista que usa quien escribe las guías nuevas.
 * Sin las reimpresiones (ese comprador ya fue reportado por el flujo anterior).
 */
export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied

  try {
    const { rows } = await db.query(
      `SELECT e.id, e.venta, e.guia AS pre_guia, e.guia_final, e.remitente, e.destinatario,
              e.reporte_estado, l.generated_at, (j.status = 'CERRADA') AS jornada_cerrada
       FROM despacho_etiquetas e
       JOIN despacho_lotes l ON l.id = e.lote_id
       LEFT JOIN despacho_jornadas j ON j.id = l.jornada_id
       WHERE e.carrier = 'TEALCA' AND e.impresa AND NOT e.reimpresion AND l.status = 'GENERADO'
         AND (e.reporte_estado IS NULL OR e.reporte_estado IN ('RECHAZADO', 'ERROR'))
       ORDER BY l.generated_at DESC, e.id DESC
       LIMIT 300`)
    return NextResponse.json({ digitos: await digitosGuiaTealca(db), envios: rows })
  } catch (err) {
    return apiError(err)
  }
}

const Schema = z.object({
  guias: z.array(z.object({
    id:         z.number().int().positive(),
    guia_final: z.string().trim().max(20),   // vacío = quitar la guía
  })).min(1).max(300),
})

/**
 * PUT /api/despachos/tealca — guarda guías finales. Todo o nada: si una guía no cumple
 * (solo dígitos, del largo exigido, sin repetir) no se guarda ninguna y se devuelve qué
 * fila falló.
 */
export async function PUT(req: NextRequest) {
  const { session, db: pool } = await getSessionDb()
  if (!session || !pool) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied

  try {
    const { guias } = Schema.parse(await req.json())
    const db = await requestConnection(pool)
    const digitos = await digitosGuiaTealca(db)

    const errores: { id: number; error: string }[] = []
    const vistas = new Map<string, number>()
    for (const g of guias) {
      if (g.guia_final === '') continue
      if (!/^\d+$/.test(g.guia_final))        errores.push({ id: g.id, error: 'Solo números' })
      else if (g.guia_final.length !== digitos) errores.push({ id: g.id, error: `Debe tener ${digitos} dígitos (tiene ${g.guia_final.length})` })
      else if (vistas.has(g.guia_final))      errores.push({ id: g.id, error: 'Repetida en esta lista' })
      else vistas.set(g.guia_final, g.id)
    }
    if (errores.length) return NextResponse.json({ error: 'Hay guías con problemas', errores }, { status: 400 })

    await db.query('BEGIN')
    const ids = guias.map(g => g.id)
    const { rows: actuales } = await db.query(
      `SELECT id, carrier, impresa, reporte_estado FROM despacho_etiquetas WHERE id = ANY($1) FOR UPDATE`, [ids])
    const porId = new Map(actuales.map(r => [r.id as number, r]))
    for (const g of guias) {
      const e = porId.get(g.id)
      if (!e || e.carrier !== 'TEALCA' || !e.impresa) errores.push({ id: g.id, error: 'No es un envío Tealca impreso' })
      else if (e.reporte_estado === 'ENVIADO' || e.reporte_estado === 'SIN_CHAT') errores.push({ id: g.id, error: 'Ya fue reportado: no se puede cambiar' })
    }
    if (errores.length) {
      await db.query('ROLLBACK')
      return NextResponse.json({ error: 'Hay guías con problemas', errores }, { status: 400 })
    }

    for (const g of guias) {
      try {
        await db.query(`SAVEPOINT s`)
        await db.query(`UPDATE despacho_etiquetas SET guia_final = $2 WHERE id = $1`, [g.id, g.guia_final || null])
        await db.query(`RELEASE SAVEPOINT s`)
      } catch (e) {
        if ((e as { code?: string }).code !== '23505') throw e
        await db.query(`ROLLBACK TO SAVEPOINT s`)
        errores.push({ id: g.id, error: 'Esa guía ya está asignada a otro envío' })
      }
    }
    if (errores.length) {
      await db.query('ROLLBACK')
      return NextResponse.json({ error: 'Hay guías con problemas', errores }, { status: 400 })
    }
    await db.query('COMMIT')
    return NextResponse.json({ ok: true, guardadas: guias.length })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}

const SchemaDigitos = z.object({ digitos: z.number().int().min(4).max(20) })

/** PATCH /api/despachos/tealca — largo exigido de la guía final (admin) */
export async function PATCH(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = despachosForbidden(session)
  if (denied) return denied
  if (session.user.role !== 'admin') return forbidden()

  try {
    const { digitos } = SchemaDigitos.parse(await req.json())
    await db.query(
      `INSERT INTO app_settings(key, value) VALUES ('tealca_guia_digitos', $1)
       ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value`, [String(digitos)])
    return NextResponse.json({ ok: true, digitos })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
