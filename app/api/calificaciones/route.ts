import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { leerPlantillasCal, sqlBandeja, sqlLista, sqlListaEl, TOPE_DIAS } from '@/lib/calificacionesML'
import { ventasDesdeML } from '@/lib/modulos'

// GET /api/calificaciones?vista=listas|proximas|esperando
//   listas    → "Por calificar": con sugerencia (concretada / no concretada) y fuera de los días de espera
//   proximas  → "Próximas": ya se sabe el resultado, pero siguen en los días de espera (salen solas)
//   esperando → "Por definir": todavía no se sabe (recién vendida, sin cargar/despachar, o en borrador)
export async function GET(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const v = new URL(req.url).searchParams.get('vista')
  const vista = v === 'esperando' || v === 'proximas' ? v : 'listas'
  try {
    const { rows: [pl] } = await s.db.query(`SELECT value FROM app_settings WHERE key = 'calificaciones_plantillas'`)
    const plantillas = leerPlantillasCal(pl?.value)
    const dias = plantillas.noConcretada.dias
    // Sin inventario: "en el sistema" = despachada (etiqueta impresa), ver SQL_BANDEJA_ML.
    const desdeML = ventasDesdeML(s.session.user)
    const SQL_BANDEJA = sqlBandeja(desdeML)
    // en_espera: todavía en los días de espera de la empresa, contados desde `base` (el reporte de la guía
    // con Reportador; si no, la compra) con el tope de TOPE_DIAS (lib/calificacionesML.ts). Fecha del país
    // (la conexión tiene su TimeZone). Desde 2026-10-14 va aparte ("Próximas") y no cuenta en el aviso.
    // 23-10: la espera es para las concretadas (que le llegue al comprador). Una NO concretada no espera: ML la concreta
    // sola a los 7 días y cobra la comisión, así que se puede calificar apenas se sugiere.
    const espera = `(b.sugerencia <> 'no_concretada' AND NOT ${sqlLista(plantillas.esperaDias)})`
    const { rows } = await s.db.query(
      `SELECT b.*, ${espera} AS en_espera, ${sqlListaEl(plantillas.esperaDias)} AS lista_el,
              -- Si hubo mensajes en la venta (2026-10-17, pedido de un usuario): antes de calificar una no
              -- concretada se ve si el comprador dio señales de vida, sin salir a MercadoLibre.
              (SELECT json_build_object('at', c.ultimo_at, 'comprador', c.ultimo_de_comprador)
               FROM ml_ordenes oo JOIN ml_conversaciones c ON c.pack_id = COALESCE(oo.pack_id, oo.id)
               WHERE oo.id = b.id::bigint AND c.ultimo_at IS NOT NULL LIMIT 1) AS chat
       FROM (${SQL_BANDEJA}) b
       WHERE ${vista === 'esperando' ? `sugerencia = 'esperar'` : vista === 'proximas' ? `sugerencia <> 'esperar' AND ${espera}` : `sugerencia <> 'esperar' AND NOT ${espera}`}
       -- La más vieja primero (2026-10-13): es la que menos plazo le queda para calificar en ML.
       ORDER BY fecha ASC LIMIT 1000`, [dias])
    const { rows: [n] } = await s.db.query(
      `SELECT COUNT(*) FILTER (WHERE sugerencia = 'concretada' AND NOT ${espera})::int AS concretadas,
              COUNT(*) FILTER (WHERE sugerencia = 'no_concretada' AND NOT ${espera})::int AS no_concretadas,
              COUNT(*) FILTER (WHERE sugerencia = 'revisar' AND NOT ${espera})::int AS revisar,
              COUNT(*) FILTER (WHERE sugerencia <> 'esperar' AND ${espera})::int AS proximas,
              COUNT(*) FILTER (WHERE sugerencia = 'esperar')::int AS esperando
       FROM (${SQL_BANDEJA}) b`, [dias])
    const { rows: [ua] } = await s.db.query(`SELECT value FROM app_settings WHERE key = 'calificaciones_auto_ultimo'`)
    let autoUltimo: unknown = null
    try { autoUltimo = ua ? JSON.parse(ua.value) : null } catch { /* ignorado */ }
    const { rows: cuentas } = await s.db.query(
      `SELECT nickname, ordenes_sync_at FROM ml_conexiones WHERE estado = 'activa' ORDER BY nickname`)
    // Cómo decide "concretada" esta empresa (para el aviso de la pantalla).
    const { rows: [modo] } = await s.db.query(
      `SELECT COALESCE((SELECT 'reportador' = ANY(modulos) FROM empresas WHERE id = NULLIF(current_setting('app.empresa_id', true), '')::int), FALSE) AS con_reportador,
              EXISTS (SELECT 1 FROM despacho_etiquetas WHERE impresa AND created_at > NOW() - INTERVAL '30 days') AS usa_despachos`)
    return NextResponse.json({ ordenes: rows, contadores: n, plantillas, cuentas, desdeML, autoUltimo,
      conReportador: !!modo?.con_reportador, usaDespachos: !!modo?.usa_despachos, topeDias: TOPE_DIAS })
  } catch (err) {
    return apiError(err)
  }
}
