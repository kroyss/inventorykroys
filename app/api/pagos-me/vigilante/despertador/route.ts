import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { autenticarVigilante, PEDIDO_VIGENTE_MIN } from '@/lib/pagosME'

/**
 * POST /api/pagos-me/vigilante/despertador (clave del vigilante, x-perfil: DESPERTADOR) → cada ~1 min
 * desde el script de la PC (tools/vigilante-pagos-me/despertador.ps1). Chrome queda cerrado: si hay un
 * "Traer pagos y guías" vigente, el script abre los perfiles que todavía no lo hicieron (`hechos`), la
 * extensión trabaja y cierra su ventana.
 */
export async function POST(req: NextRequest) {
  const a = await autenticarVigilante(req)
  if ('error' in a) return a.error
  try {
    await a.db.query(
      `INSERT INTO me_latidos (perfil, visto_at) VALUES ($1, NOW())
       ON CONFLICT (empresa_id, perfil) DO UPDATE SET visto_at = NOW()`, [a.perfil])
    const { rows: [p] } = await a.db.query(
      `SELECT id, resultados FROM me_pedidos
       WHERE pedido_at > NOW() - make_interval(mins => $1)
       ORDER BY id DESC LIMIT 1`, [PEDIDO_VIGENTE_MIN])
    return NextResponse.json({ pedido: p ? Number(p.id) : null, hechos: p ? Object.keys(p.resultados ?? {}) : [] })
  } catch (err) {
    return apiError(err)
  }
}
