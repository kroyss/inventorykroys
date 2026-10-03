import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { soloDueno } from '@/lib/plataforma'
import { RONDA_ACTUAL } from '@/lib/fundadores'

const DIAS = 21
// Día de negocio = hora Caracas (el VPS está en otra zona).
const DIA = `(v.fecha AT TIME ZONE 'America/Caracas')::date`

/**
 * GET /api/plataforma/fundadores/visitas → embudo de la página pública (migración 061):
 *   porDia: personas que entraron, empezaron el formulario y lo enviaron (últimos DIAS días).
 *   porOrigen: lo mismo según de dónde llegó cada persona la PRIMERA vez (anuncio, Instagram…).
 *   porTanda: el embudo de los días de postulación de cada ronda.
 * Persona = navegador (id al azar del navegador). Solo el dueño de la plataforma.
 */
export async function GET() {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const db = dbGlobal()
    const [{ rows: porDia }, { rows: porOrigen }, { rows: porTanda }] = await Promise.all([
      db.query(
        `SELECT to_char(${DIA}, 'YYYY-MM-DD') AS dia,
                COUNT(DISTINCT v.navegador_id) FILTER (WHERE v.evento = 'vista')::int AS personas,
                COUNT(DISTINCT v.navegador_id) FILTER (WHERE v.evento = 'empezo')::int AS empezaron,
                COUNT(DISTINCT v.navegador_id) FILTER (WHERE v.evento = 'enviado')::int AS enviaron,
                COUNT(DISTINCT v.navegador_id) FILTER (WHERE v.evento = 'vista' AND v.movil)::int AS movil
         FROM fundadores_visitas v
         WHERE v.fecha > NOW() - make_interval(days => $1)
         GROUP BY 1 ORDER BY 1 DESC`, [DIAS]),
      db.query(
        `WITH primera AS (
           SELECT DISTINCT ON (navegador_id) navegador_id, origen, campana
           FROM fundadores_visitas ORDER BY navegador_id, fecha)
         SELECT p.origen, MAX(p.campana) AS campana,
                COUNT(*)::int AS personas,
                COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM fundadores_visitas e
                                 WHERE e.navegador_id = p.navegador_id AND e.evento = 'empezo'))::int AS empezaron,
                COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM fundadores_solicitudes s
                                 WHERE s.navegador_id = p.navegador_id AND s.ronda = $1))::int AS postulaciones
         FROM primera p GROUP BY p.origen ORDER BY personas DESC`, [RONDA_ACTUAL]),
      db.query(
        `SELECT t.numero, to_char(t.inscribe_desde, 'YYYY-MM-DD') AS desde, to_char(t.inscribe_hasta, 'YYYY-MM-DD') AS hasta,
                (SELECT COUNT(DISTINCT v.navegador_id)::int FROM fundadores_visitas v
                  WHERE v.evento = 'vista' AND ${DIA} BETWEEN t.inscribe_desde AND t.inscribe_hasta) AS personas,
                (SELECT COUNT(DISTINCT v.navegador_id)::int FROM fundadores_visitas v
                  WHERE v.evento = 'empezo' AND ${DIA} BETWEEN t.inscribe_desde AND t.inscribe_hasta) AS empezaron,
                (SELECT COUNT(*)::int FROM fundadores_solicitudes s
                  WHERE s.ronda = t.ronda AND (s.created_at AT TIME ZONE 'America/Caracas')::date
                        BETWEEN t.inscribe_desde AND t.inscribe_hasta) AS postulaciones
         FROM fundadores_tandas t WHERE t.ronda = $1 ORDER BY t.numero`, [RONDA_ACTUAL]),
    ])
    return NextResponse.json({ porDia, porOrigen, porTanda })
  } catch (err) {
    return apiError(err)
  }
}
