import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { soloDueno } from '@/lib/plataforma'

// GET /api/plataforma/visitas → visitas a /registro (migración 128) y cuentas creadas por autoregistro:
// hoy, 7 días y total, con personas distintas y de dónde vinieron. Solo el dueño de la plataforma. Días en hora de Caracas.
// 23-11 (mig. 196): `embudo` = por anuncio (origen + campaña) en 7 días: llegaron, tocaron el formulario, tuvieron un
// error, se registraron, cuánto se quedaron los que se fueron y en qué campo se fueron más.
export async function GET() {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const db = dbGlobal()
    const [{ rows: [t] }, { rows: origenes }, { rows: embudo }] = await Promise.all([
      db.query(`
        WITH v AS (SELECT visitante, (creada_at AT TIME ZONE 'America/Caracas')::date AS dia FROM registro_visitas WHERE evento = 'vista'),
             c AS (SELECT (created_at AT TIME ZONE 'America/Caracas')::date AS dia FROM organizaciones WHERE origen = 'autoregistro'),
             hoy AS (SELECT (NOW() AT TIME ZONE 'America/Caracas')::date AS d)
        SELECT
          (SELECT COUNT(*) FROM v, hoy WHERE dia = hoy.d)::int AS visitas_hoy,
          (SELECT COUNT(DISTINCT visitante) FROM v, hoy WHERE dia = hoy.d)::int AS personas_hoy,
          (SELECT COUNT(*) FROM c, hoy WHERE dia = hoy.d)::int AS cuentas_hoy,
          (SELECT COUNT(*) FROM v, hoy WHERE dia > hoy.d - 7)::int AS visitas_7d,
          (SELECT COUNT(DISTINCT visitante) FROM v, hoy WHERE dia > hoy.d - 7)::int AS personas_7d,
          (SELECT COUNT(*) FROM c, hoy WHERE dia > hoy.d - 7)::int AS cuentas_7d,
          (SELECT COUNT(*) FROM v)::int AS visitas_total,
          (SELECT COUNT(DISTINCT visitante) FROM v)::int AS personas_total,
          (SELECT COUNT(*) FROM c WHERE dia >= (SELECT MIN(dia) FROM v))::int AS cuentas_total`),
      db.query(`SELECT COALESCE(origen, 'directo') AS origen, COUNT(DISTINCT visitante)::int AS personas
                FROM registro_visitas WHERE evento = 'vista' AND creada_at > NOW() - INTERVAL '7 days'
                GROUP BY 1 ORDER BY 2 DESC LIMIT 6`),
      // Cada visitante se cuenta en el anuncio de su PRIMERA vista de la semana (si vuelve por otro lado, no se duplica).
      db.query(`
        WITH ev AS (SELECT * FROM registro_visitas WHERE creada_at > NOW() - INTERVAL '7 days'),
             primera AS (SELECT DISTINCT ON (visitante) visitante, COALESCE(origen, 'directo') AS origen, campana
                           FROM ev WHERE evento = 'vista' ORDER BY visitante, creada_at),
             por AS (SELECT p.origen, p.campana, p.visitante,
                            bool_or(e.evento = 'empezo') AS empezo, bool_or(e.evento = 'error') AS error,
                            bool_or(e.evento = 'registro') AS registro,
                            max(e.segundos) FILTER (WHERE e.evento = 'salio') AS segundos,
                            (array_agg(e.detalle ORDER BY e.creada_at DESC) FILTER (WHERE e.evento = 'salio' AND e.detalle IS NOT NULL))[1] AS campo
                       FROM primera p JOIN ev e ON e.visitante = p.visitante GROUP BY 1, 2, 3)
        SELECT origen, campana, COUNT(*)::int AS personas,
               COUNT(*) FILTER (WHERE empezo)::int AS empezaron,
               COUNT(*) FILTER (WHERE error)::int AS con_error,
               COUNT(*) FILTER (WHERE registro)::int AS registros,
               (percentile_cont(0.5) WITHIN GROUP (ORDER BY segundos) FILTER (WHERE NOT registro AND segundos IS NOT NULL))::int AS seg_mediana,
               mode() WITHIN GROUP (ORDER BY campo) FILTER (WHERE empezo AND NOT registro AND campo IS NOT NULL) AS campo_abandono
          FROM por GROUP BY 1, 2 ORDER BY personas DESC LIMIT 12`),
    ])
    return NextResponse.json({ ...t, origenes, embudo })
  } catch (err) {
    return apiError(err)
  }
}
