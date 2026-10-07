import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { reportadorForbidden } from '@/lib/despachos'
import {
  avisosConfig, cuentaPorVenta, EN_LINEA_SEGUNDOS, leerConfig, LIMITE_CARACTERES, plantillasSugeridas, problemasConfig,
  SQL_PENDIENTE, SQL_REPORTABLE,
} from '@/lib/reportador'

/** GET /api/despachos/reportador — equipos vinculados (en línea, qué hacen, última orden),
 *  envíos pendientes de reportar y configuración de mensajes */
export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = reportadorForbidden(session)
  if (denied) return denied

  try {
    const [{ rows: equipos }, config, { rows: [{ pendientes }] }] = await Promise.all([
      db.query(
        `SELECT q.id, q.nombre, q.vinculado_at, q.last_seen_at, q.version, q.auto_reportar,
                q.last_seen_at > NOW() - make_interval(secs => $1) AS en_linea,
                CASE WHEN q.actividad_at > NOW() - INTERVAL '10 minutes' THEN q.actividad END AS actividad,
                CASE WHEN q.token_hash IS NULL THEN q.codigo END AS codigo,
                CASE WHEN q.token_hash IS NULL THEN q.codigo_expira END AS codigo_expira,
                o.orden
         FROM reportador_equipos q
         LEFT JOIN LATERAL (
           SELECT json_build_object(
                    'id', o.id, 'origen', o.origen, 'estado', o.estado, 'created_at', o.created_at,
                    'tomada_at', o.tomada_at, 'terminada_at', o.terminada_at,
                    'detener', o.detener_at IS NOT NULL, 'resumen', o.resumen,
                    'pedida_por', (SELECT COALESCE(u.full_name, u.username) FROM users u WHERE u.id = o.created_by)
                  ) AS orden
           FROM reportador_ordenes o WHERE o.equipo_id = q.id ORDER BY o.id DESC LIMIT 1
         ) o ON TRUE
         WHERE q.revocado_at IS NULL AND (q.token_hash IS NOT NULL OR q.codigo_expira > NOW())
         ORDER BY q.id`, [EN_LINEA_SEGUNDOS]),
      leerConfig(db),
      db.query(
        `SELECT COUNT(*)::int AS pendientes
         FROM despacho_etiquetas e
         JOIN despacho_lotes l    ON l.id = e.lote_id
         JOIN despacho_jornadas j ON j.id = l.jornada_id
         WHERE ${SQL_REPORTABLE} AND ${SQL_PENDIENTE}`),
    ])
    const { rows: conectadas } = await db.query(`SELECT nickname FROM ml_conexiones WHERE estado = 'activa' ORDER BY nickname`)
    return NextResponse.json({
      equipos, config, pendientes, problemas: problemasConfig(config), avisos: avisosConfig(config), limite: LIMITE_CARACTERES,
      // Sin cuentas configuradas, cada envío sale desde la cuenta de su venta (estas son las conectadas).
      porVenta: cuentaPorVenta(config), conectadas: conectadas.map(c => c.nickname as string),
      // Mensajes listos para quien todavía no tiene: los revisa y los guarda antes del primer reporte.
      sugeridas: plantillasSugeridas(session.user.empresaNombre ?? 'nuestra tienda', conectadas[0]?.nickname),
    })
  } catch (err) {
    return apiError(err)
  }
}

const Schema = z.object({
  cuentas: z.array(z.object({
    nombre: z.string().trim().min(1).max(40),
    filtro: z.string().trim().min(2).max(40),
    pagina: z.string().trim().max(200),
  })).max(5),   // vacío = la cuenta de cada envío sale de su venta (lib/reportador.ts cuentaPorVenta)
  plantillas: z.array(z.string().trim().min(1).max(LIMITE_CARACTERES)).min(1).max(10),
  bloque: z.string().max(LIMITE_CARACTERES),
})

/** PUT /api/despachos/reportador — guarda cuentas/plantillas (admin). Rechaza la config si
 *  algún mensaje pasaría de 350 caracteres: ML lo cortaría sin avisar. */
export async function PUT(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = reportadorForbidden(session)
  if (denied) return denied
  if (session.user.role !== 'admin') return forbidden()

  try {
    const config = Schema.parse(await req.json())
    const problemas = problemasConfig(config)
    if (problemas.length) return NextResponse.json({ error: problemas.join(' · '), problemas }, { status: 400 })

    for (const [key, value] of [
      ['reportador_cuentas', JSON.stringify(config.cuentas)],
      ['reportador_plantillas', JSON.stringify(config.plantillas)],
      ['reportador_bloque', config.bloque],
    ]) {
      await db.query(
        `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [key, value])
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
