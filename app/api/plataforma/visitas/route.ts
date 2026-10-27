import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { soloDueno } from '@/lib/plataforma'

// GET /api/plataforma/visitas → visitas a /registro (migración 128) y cuentas creadas por autoregistro:
// hoy, 7 días y total, con personas distintas y de dónde vinieron. Solo el dueño de la plataforma. Días en hora de Caracas.
export async function GET() {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const db = dbGlobal()
    const [{ rows: [t] }, { rows: origenes }] = await Promise.all([
      db.query(`
        WITH v AS (SELECT visitante, (creada_at AT TIME ZONE 'America/Caracas')::date AS dia FROM registro_visitas),
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
                FROM registro_visitas WHERE creada_at > NOW() - INTERVAL '7 days'
                GROUP BY 1 ORDER BY 2 DESC LIMIT 6`),
    ])
    return NextResponse.json({ ...t, origenes })
  } catch (err) {
    return apiError(err)
  }
}
