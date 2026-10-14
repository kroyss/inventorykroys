import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { leerPlantillasCal, sqlBandeja } from '@/lib/calificacionesML'
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
    // en_espera: más nueva que los días de espera de la empresa (fecha del país de la empresa: la
    // conexión tiene su TimeZone). Desde 2026-10-14 va aparte ("Próximas") y no cuenta en el aviso.
    const espera = `(b.fecha::date > CURRENT_DATE - ${plantillas.esperaDias})`
    const { rows } = await s.db.query(
      `SELECT b.*, ${espera} AS en_espera, to_char(b.fecha::date + ${plantillas.esperaDias}, 'YYYY-MM-DD') AS lista_el
       FROM (${SQL_BANDEJA}) b
       WHERE ${vista === 'esperando' ? `sugerencia = 'esperar'` : vista === 'proximas' ? `sugerencia <> 'esperar' AND ${espera}` : `sugerencia <> 'esperar' AND NOT ${espera}`}
       -- La más vieja primero (2026-10-13): es la que menos plazo le queda para calificar en ML.
       ORDER BY fecha ASC LIMIT 1000`, [dias])
    const { rows: [n] } = await s.db.query(
      `SELECT COUNT(*) FILTER (WHERE sugerencia = 'concretada' AND NOT ${espera})::int AS concretadas,
              COUNT(*) FILTER (WHERE sugerencia = 'no_concretada' AND NOT ${espera})::int AS no_concretadas,
              COUNT(*) FILTER (WHERE sugerencia <> 'esperar' AND ${espera})::int AS proximas,
              COUNT(*) FILTER (WHERE sugerencia = 'esperar')::int AS esperando
       FROM (${SQL_BANDEJA}) b`, [dias])
    const { rows: [ua] } = await s.db.query(`SELECT value FROM app_settings WHERE key = 'calificaciones_auto_ultimo'`)
    let autoUltimo: unknown = null
    try { autoUltimo = ua ? JSON.parse(ua.value) : null } catch { /* ignorado */ }
    const { rows: cuentas } = await s.db.query(
      `SELECT nickname, ordenes_sync_at FROM ml_conexiones WHERE estado = 'activa' ORDER BY nickname`)
    return NextResponse.json({ ordenes: rows, contadores: n, plantillas, cuentas, desdeML, autoUltimo })
  } catch (err) {
    return apiError(err)
  }
}
