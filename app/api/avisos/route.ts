import { NextResponse } from 'next/server'
import { getSessionDb, unauthorized } from '@/lib/session'
import { tieneModulo } from '@/lib/modulos'
import { SQL_PENDIENTE, SQL_REPORTABLE } from '@/lib/reportador'

// GET /api/avisos → contadores para los numeritos del menú (se piden cada minuto).
//   preguntas: sin responder · mensajes: conversaciones con mensajes sin leer
//   reportador: guías de jornadas cerradas que todavía no se le avisaron al comprador
// Solo cuenta lo de los módulos que tiene la empresa. Nunca falla en voz alta: con un
// error devuelve ceros (es un adorno del menú, no puede romper la página).
export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const u = session.user
  const out = { preguntas: 0, mensajes: 0, reportador: 0 }
  try {
    if (tieneModulo(u, 'preguntas')) {
      const { rows: [r] } = await db.query(
        `SELECT (SELECT COUNT(*) FROM ml_preguntas WHERE estado = 'UNANSWERED')::int AS p,
                (SELECT COUNT(*) FROM ml_conversaciones WHERE sin_leer > 0)::int AS m`)
      out.preguntas = r.p; out.mensajes = r.m
    }
    if (u.country === 'VE' && tieneModulo(u, 'despachos') && tieneModulo(u, 'reportador')) {
      const { rows: [r] } = await db.query(
        `SELECT COUNT(*)::int AS n FROM despacho_etiquetas e
         JOIN despacho_lotes l ON l.id = e.lote_id
         JOIN despacho_jornadas j ON j.id = l.jornada_id
         WHERE ${SQL_REPORTABLE} AND ${SQL_PENDIENTE}`)
      out.reportador = r.n
    }
  } catch (e) {
    console.error('[avisos]', e instanceof Error ? e.message : e)
  }
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } })
}
