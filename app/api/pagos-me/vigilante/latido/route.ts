import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { autenticarVigilante, PEDIDO_VIGENTE_MIN, SQL_PERFIL_PENDIENTE } from '@/lib/pagosME'

/** Cada cuánto se lee completo (7 días) aunque haya fecha de corte: atrapa lo que la lectura corta pudiera saltarse. */
const COMPLETA_CADA_H = 20
/** Margen hacia atrás de la fecha de corte (reloj del portal vs el nuestro, órdenes modificadas mientras se leía). */
const MARGEN_CORTE_MIN = 30

/**
 * POST /api/pagos-me/vigilante/latido (clave del vigilante + x-perfil) → cada ~1 min desde la extensión.
 * Solo toca este servidor (nunca MercadoEnvíos). Responde si hay un "Traer pagos y guías" vigente que
 * este perfil todavía no hizo.
 */
export async function POST(req: NextRequest) {
  const a = await autenticarVigilante(req)
  if ('error' in a) return a.error
  try {
    await a.db.query(
      `INSERT INTO me_latidos (perfil, visto_at) VALUES ($1, NOW())
       ON CONFLICT (empresa_id, perfil) DO UPDATE SET visto_at = NOW()`, [a.perfil])
    const { rows: [p] } = await a.db.query(
      `SELECT id, pesos FROM me_pedidos
       WHERE pedido_at > NOW() - make_interval(mins => $1) AND ${SQL_PERFIL_PENDIENTE('$2')}   -- 19-11: si leyó con error, reintenta una vez
       ORDER BY id DESC LIMIT 1`, [PEDIDO_VIGENTE_MIN, a.perfil])
    // Pesos del portal (Promociones, migración 094): la primera traída del día de cada cuenta, o la
    // pedida con "Actualizar pesos". La extensión 1.3.2+ los lee; las anteriores ignoran el dato.
    let pesos = false
    // 13-11 (mig. 174): también con Inventario (los pesos pasan a los productos: precios, margen, Costos ML).
    if (p && (a.modulos.includes('promociones') || a.modulos.includes('inventario'))) {
      if (p.pesos) pesos = true
      else {
        const { rows: [f] } = await a.db.query(
          `SELECT MAX(m.actualizado_at) > NOW() - INTERVAL '20 hours' AS fresco
           FROM me_latidos l LEFT JOIN me_productos m ON m.cuenta = l.cuenta
           WHERE l.perfil = $1`, [a.perfil])
        pesos = !f?.fresco
      }
    }
    // 19-11 (extensión 1.3.9): fecha de corte. Si este perfil hizo una lectura COMPLETA (7 días) buena en las últimas
    // COMPLETA_CADA_H horas, solo lee lo modificado en el portal desde su última lectura buena y entera (menos un margen):
    // casi siempre 1 página en vez de 6 (cada orden pesa ~17 KB; la línea de la PC de SolucionesMC bajaba a ~10 KB/s).
    // Sin eso (primera del día, perfil nuevo, la última se cortó), desde = null → lectura completa. Las versiones
    // anteriores ignoran el dato y leen siempre los 7 días.
    let desde: string | null = null
    if (p) {
      const { rows: [u] } = await a.db.query(
        `SELECT MAX(pedido_at) FILTER (WHERE r->>'modo' = 'completa') > NOW() - make_interval(hours => $2) AS completa_reciente,
                MAX(pedido_at) - make_interval(mins => $3) AS desde
         FROM me_pedidos, LATERAL (SELECT resultados->$1::text AS r) x
         WHERE pedido_at > NOW() - INTERVAL '2 days' AND r->>'ok' = 'true' AND r->>'modo' IN ('completa', 'corta')`,
        [a.perfil, COMPLETA_CADA_H, MARGEN_CORTE_MIN])
      if (u?.completa_reciente && u.desde) desde = new Date(u.desde).toISOString()
    }
    return NextResponse.json({ pedido: p ? Number(p.id) : null, pesos, desde })
  } catch (err) {
    return apiError(err)
  }
}
