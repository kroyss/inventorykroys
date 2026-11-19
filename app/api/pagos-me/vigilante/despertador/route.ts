import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { autenticarVigilante, INTENTOS_ME, PEDIDO_VIGENTE_MIN } from '@/lib/pagosME'

// 14-11 (el dueño): con Chrome abierto se consultaba en 2 lados — la extensión tomaba el pedido sola y el despertador
// abría además una ventana nueva. Ahora el despertador solo despierta lo que está DORMIDO: si todos los perfiles que
// faltan dieron señal hace poco (Chrome abierto, la extensión lo toma en ≤ 1 min), no se le pasa el pedido. Si a los
// ESPERA_VIVOS_MIN siguen sin terminar, se le pasa igual (por si la extensión se trabó). Sin perfiles conocidos, como antes.
// 19-11: si todos ya leyeron BIEN no se pasa nunca; si uno leyó con error, la extensión reintenta una vez (INTENTOS_ME) y
// el despertador solo entra si ese perfil tampoco está vivo.
const VIVO_MIN = 2
const ESPERA_VIVOS_MIN = 3

/**
 * POST /api/pagos-me/vigilante/despertador (clave del vigilante, x-perfil: DESPERTADOR) → cada ~1 min
 * desde el script de la PC (tools/vigilante-pagos-me/despertador.ps1). Chrome queda cerrado: si hay un
 * "Traer pagos y guías" vigente (SOLO a demanda desde el 24-10: no hay traída automática por horario), el script abre los perfiles que todavía no lo hicieron (`hechos`), la
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
      `SELECT id, resultados, pedido_at < NOW() - make_interval(mins => $2) AS viejo FROM me_pedidos
       WHERE pedido_at > NOW() - make_interval(mins => $1)
       ORDER BY id DESC LIMIT 1`, [PEDIDO_VIGENTE_MIN, ESPERA_VIVOS_MIN])
    if (!p) return NextResponse.json({ pedido: null, hechos: [] })
    // 19-11 (el dueño): el despertador es RESPALDO del navegador. «Hecho» = el perfil leyó bien (ok); si respondió con
    // error, cuenta como pendiente mientras le queden intentos. Si todos los perfiles de la empresa ya leyeron
    // bien, no hay nada que despertar aunque el pedido tenga más de ESPERA_VIVOS_MIN (antes se pasaba igual y el script
    // abría los Chrome de la PC que no figuraban en el pedido, p. ej. los de otra empresa).
    const res = (p.resultados ?? {}) as Record<string, { ok?: boolean; intentos?: number }>
    // Leyó bien, o falló y ya agotó sus intentos (no se insiste más: el error queda a la vista en Pagos ME).
    const hechos = Object.keys(res).filter(k => res[k]?.ok !== false || (res[k]?.intentos ?? 1) >= INTENTOS_ME)
    // Perfiles vigentes (uno por cuenta, el más reciente), como /api/promociones/pesos.
    const { rows: perfiles } = await a.db.query(
      `SELECT DISTINCT ON (COALESCE(conexion_id::text, cuenta, perfil)) perfil, visto_at > NOW() - make_interval(mins => $1) AS vivo
       FROM me_latidos WHERE perfil <> 'DESPERTADOR' AND visto_at > NOW() - INTERVAL '1 day'
       ORDER BY COALESCE(conexion_id::text, cuenta, perfil), visto_at DESC`, [VIVO_MIN])
    const faltan = perfiles.filter(x => !hechos.includes(x.perfil))
    if (perfiles.length && !faltan.length) return NextResponse.json({ pedido: null, hechos: [] })
    // Con Chrome abierto la extensión lo toma sola en ≤ 1 min (también el reintento si falló): se le da ESPERA_VIVOS_MIN.
    if (!p.viejo && perfiles.length && faltan.every(x => x.vivo)) return NextResponse.json({ pedido: null, hechos: [] })
    return NextResponse.json({ pedido: Number(p.id), hechos })
  } catch (err) {
    return apiError(err)
  }
}
