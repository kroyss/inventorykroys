import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { conEmpresa, dbGlobal } from '@/lib/db'
import { cupoIA } from '@/lib/ia'
import type { Country } from '@/lib/types'
import { soloDueno } from '@/lib/plataforma'
import { CLAVE_IA_AUTO } from '@/lib/iaAutomatica'
import { CLAVE_AUTO } from '@/lib/mensajesIAPrueba'

// GET /api/plataforma/ia-clientes → Plataforma → Interno → IA automática (09-11, el dueño: "hay que llevar ese control").
// Por cada cliente con la IA automática disponible: si la encendió en Preguntas y en Mensajes, cuántas respondió la IA
// en los últimos 30 días y cuántas salieron solas, créditos usados y saldo. Solo el dueño de la plataforma.
// Cada empresa con conEmpresa (RLS), de a una: se devuelve la conexión al terminar con ella.
export async function GET() {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const { rows: empresas } = await dbGlobal().query(
      `SELECT e.id, e.nombre, e.country, o.estado, o.plan FROM empresas e JOIN organizaciones o ON o.id = e.organizacion_id
       WHERE e.is_active AND o.estado <> 'propietario' AND e.modulos && ARRAY['ia_automatica', 'mensajes_ia']
       ORDER BY e.nombre`)
    const filas = []
    for (const e of empresas) {
      const f = await conEmpresa(e.id, e.country as Country, async db => {
        const { rows: cfg } = await db.query(`SELECT key, value FROM app_settings WHERE key = ANY($1::text[])`, [[CLAVE_IA_AUTO, CLAVE_AUTO]])
        const leer = (k: string) => { try { return JSON.parse(cfg.find(c => c.key === k)?.value ?? '{}') } catch { return {} } }
        const p = leer(CLAVE_IA_AUTO), m = leer(CLAVE_AUTO)
        const { rows: [q] } = await db.query(
          `SELECT count(*)::int AS total, count(*) FILTER (WHERE ia_auto->>'publicada' = 'true')::int AS solas
           FROM ml_preguntas WHERE ia_auto IS NOT NULL AND ia_auto->>'modo' = 'real' AND fecha > NOW() - INTERVAL '30 days'`)
        const { rows: [x] } = await db.query(
          `SELECT count(*) FILTER (WHERE estado = 'listo')::int AS total, count(enviada_at)::int AS solas, count(escape_at)::int AS acuses
           FROM ml_mensajes_ia WHERE mensaje_at > NOW() - INTERVAL '30 days'`)
        const cupo = await cupoIA(db, e.id)
        return {
          id: e.id, nombre: e.nombre, estado: e.estado, plan: e.plan,
          preguntas: { modo: ['sombra', 'real'].includes(p.modo) ? p.modo : 'apagado', desde: p.at ?? p.desde ?? null, total: q.total, solas: q.solas },
          mensajes: { encendido: m.modo === 'real', desde: m.modo === 'real' ? m.at ?? null : null, total: x.total, solas: x.solas, acuses: x.acuses },
          creditos: { usados: cupo.usados, quedan: cupo.quedan },
        }
      }).catch(err => ({ id: e.id, nombre: e.nombre, estado: e.estado, plan: e.plan, error: err instanceof Error ? err.message : String(err) }))
      filas.push(f)
    }
    return NextResponse.json({ filas })
  } catch (err) { return apiError(err) }
}
