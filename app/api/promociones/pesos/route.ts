import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { tieneModulo } from '@/lib/modulos'
import { sesionPromociones } from '@/lib/promocionesSesion'

// Perfiles vigentes de la PC: UNO por cuenta de ML, el más reciente (19-10: al reconectar la extensión queda un
// perfil nuevo para la misma cuenta y el viejo sigue en me_latidos; se contaban los dos → "2 de 4 cuentas").
// Igual que la lista de Pagos ME (app/api/pagos-me/route.ts).
const PERFILES_VIGENTES = `
  SELECT DISTINCT ON (COALESCE(conexion_id::text, cuenta, perfil)) perfil
  FROM me_latidos WHERE perfil <> 'DESPERTADOR' AND visto_at > NOW() - INTERVAL '1 day'
  ORDER BY COALESCE(conexion_id::text, cuenta, perfil), visto_at DESC`

/** POST /api/promociones/pesos → pide al programa de la PC (Pagos ME) una traída que también lea los
 *  pesos del portal de MercadoEnvíos. La toma en ~1 min si la PC está prendida. */
export async function POST() {
  const s = await sesionPromociones()
  if ('error' in s) return s.error
  if (!tieneModulo(s.session.user, 'pagos_me')) {
    return NextResponse.json({ error: 'Los pesos los trae el programa de Pagos ME, que no está activo en esta empresa' }, { status: 400 })
  }
  try {
    // El último pedido de los últimos 15 min que todavía no terminaron todas las cuentas: se suma a ese.
    const { rows: [ya] } = await s.db.query(
      `SELECT p.id FROM me_pedidos p
       WHERE p.pedido_at > NOW() - INTERVAL '15 minutes'
         AND EXISTS (SELECT 1 FROM (${PERFILES_VIGENTES}) v WHERE NOT p.resultados ? v.perfil)
       ORDER BY p.id DESC LIMIT 1`)
    if (ya) {
      await s.db.query(`UPDATE me_pedidos SET pesos = TRUE WHERE id = $1`, [ya.id])
      return NextResponse.json({ ok: true, pedido: ya.id })
    }
    const { rows: [p] } = await s.db.query(
      `INSERT INTO me_pedidos (pedido_por, pesos) VALUES ($1, TRUE) RETURNING id`, [s.userId])
    return NextResponse.json({ ok: true, pedido: p.id })
  } catch (err) {
    return apiError(err)
  }
}

/** GET /api/promociones/pesos?pedido=ID → cuántos perfiles de la PC ya terminaron ese pedido y cuántos hay
 *  (los vistos en el último día; el DESPERTADOR no trae nada). "Traer ME y ML" espera a todos antes de leer MercadoLibre. */
export async function GET(req: NextRequest) {
  const s = await sesionPromociones()
  if ('error' in s) return s.error
  try {
    const pedido = Number(req.nextUrl.searchParams.get('pedido'))
    if (!Number.isInteger(pedido) || pedido <= 0) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
    const { rows: [p] } = await s.db.query(`SELECT resultados FROM me_pedidos WHERE id = $1`, [pedido])
    const { rows: vigentes } = await s.db.query(PERFILES_VIGENTES)
    const resultados = (p?.resultados ?? {}) as Record<string, { ok?: boolean; cuenta?: string | null; error?: string | null }>
    const res = Object.values(resultados)
    // Hechos = cuentas vigentes que ya respondieron (un perfil viejo que respondió no suma de más).
    const hechos = vigentes.length ? vigentes.filter(v => resultados[v.perfil]).length : res.length
    return NextResponse.json({ hechos, perfiles: Math.max(1, vigentes.length),
      errores: res.filter(r => !r.ok).map(r => `${r.cuenta ?? 'un perfil'}: ${r.error ?? 'error'}`) })
  } catch (err) {
    return apiError(err)
  }
}
