import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { autenticarVigilante, PEDIDO_VIGENTE_MIN } from '@/lib/pagosME'

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
      `SELECT id FROM me_pedidos
       WHERE pedido_at > NOW() - make_interval(mins => $1) AND NOT (resultados ? $2)
       ORDER BY id DESC LIMIT 1`, [PEDIDO_VIGENTE_MIN, a.perfil])
    return NextResponse.json({ pedido: p ? Number(p.id) : null })
  } catch (err) {
    return apiError(err)
  }
}
