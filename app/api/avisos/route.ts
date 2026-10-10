import { NextResponse } from 'next/server'
import { SQL_MENSAJE_VIGENTE } from '@/lib/mensajesML'
import { getSessionDb, unauthorized } from '@/lib/session'
import { tieneModulo } from '@/lib/modulos'
import { SQL_PENDIENTE, SQL_REPORTABLE } from '@/lib/reportador'
import { leerPlantillasCal, sqlBandeja } from '@/lib/calificacionesML'
import { contarAlertas } from '@/lib/alertasStock'

// GET /api/avisos → contadores para los numeritos del menú (se piden cada minuto).
//   preguntas: sin responder · mensajes: conversaciones con mensajes sin leer
//   reportador: guías de jornadas cerradas que todavía no se le avisaron al comprador
//   calificaciones: ventas de ML listas para calificar
//   stock: productos a reponer en ML o publicados de más (stock real vs publicado)
//   alertas: publicaciones/variantes de ML agotadas o por agotarse (Alertas de stock)
//   despachos: envíos ya impresos en la jornada ABIERTA (falta cerrar jornada → manifiesto;
//              hasta entonces el Reportador no tiene nada que avisar)
// Solo cuenta lo de los módulos que tiene la empresa. Nunca falla en voz alta: con un
// error devuelve ceros (es un adorno del menú, no puede romper la página).
export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const u = session.user
  const out = { preguntas: 0, mensajes: 0, reportador: 0, calificaciones: 0, despachos: 0, alertas: 0 }
  try {
    if (tieneModulo(u, 'preguntas')) {
      const { rows: [r] } = await db.query(
        `SELECT (SELECT COUNT(*) FROM ml_preguntas WHERE estado = 'UNANSWERED')::int AS p,
                (SELECT COUNT(*) FROM ml_conversaciones WHERE sin_leer > 0 AND ${SQL_MENSAJE_VIGENTE})::int AS m`)
      out.preguntas = r.p; out.mensajes = r.m
      if (tieneModulo(u, 'alertas_stock')) { out.alertas = (await contarAlertas(db)).agotadas }  // solo agotadas (= pestaña Agotadas)
      {
        const { rows: [pl] } = await db.query(`SELECT value FROM app_settings WHERE key = 'calificaciones_plantillas'`)
        const { rows: [c] } = await db.query(
          `SELECT COUNT(*)::int AS n FROM (${sqlBandeja(!tieneModulo(u, 'inventario'))}) b WHERE sugerencia <> 'esperar'`,
          [leerPlantillasCal(pl?.value).noConcretada.dias])
        out.calificaciones = c.n
      }
    }
    if (u.country === 'VE' && tieneModulo(u, 'despachos')) {
      const { rows: [d] } = await db.query(
        `SELECT COUNT(*)::int AS n FROM despacho_etiquetas e
         JOIN despacho_lotes l ON l.id = e.lote_id AND l.status = 'GENERADO'
         JOIN despacho_jornadas j ON j.id = l.jornada_id AND j.status = 'ABIERTA'
         WHERE e.impresa`)
      out.despachos = d.n
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
