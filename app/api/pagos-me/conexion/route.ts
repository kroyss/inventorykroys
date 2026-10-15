import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { CODIGO_VIGENTE_MIN, hashCodigo, nuevoCodigo, sesionPagosME } from '@/lib/pagosME'
import { puede } from '@/lib/permisos'

/**
 * POST /api/pagos-me/conexion (admin) → código corto para conectar una PC (migración 093). Vale
 * CODIGO_VIGENTE_MIN minutos: se escribe en el instalador y en la extensión de cada perfil de Chrome.
 * Las PCs ya conectadas siguen funcionando.
 */
export async function POST() {
  const s = await sesionPagosME()
  if ('error' in s) return s.error
  if (!puede(s.session.user, 'pagos_me_config')) return NextResponse.json({ error: 'Solo un administrador' }, { status: 403 })
  try {
    const codigo = nuevoCodigo()
    const { rows: [c] } = await s.db.query(
      `INSERT INTO me_codigos (codigo_hash, vence_at, creado_por)
       VALUES ($1, NOW() + make_interval(mins => $2), $3) RETURNING vence_at`,
      [hashCodigo(codigo), CODIGO_VIGENTE_MIN, s.userId])
    // Los vencidos no sirven para nada: se limpian de paso.
    await s.db.query(`DELETE FROM me_codigos WHERE vence_at < NOW() - INTERVAL '1 day'`)
    return NextResponse.json({ codigo, vence_at: c.vence_at })
  } catch (err) {
    return apiError(err)
  }
}

/** DELETE /api/pagos-me/conexion (admin) → desconecta TODAS las PCs (borra sus claves). Para volver a
 *  usarlo hay que conectarlas de nuevo con un código. */
export async function DELETE() {
  const s = await sesionPagosME()
  if ('error' in s) return s.error
  if (!puede(s.session.user, 'pagos_me_config')) return NextResponse.json({ error: 'Solo un administrador' }, { status: 403 })
  try {
    await s.db.query(`DELETE FROM me_claves`)
    await s.db.query(`DELETE FROM me_vigilante`)
    await s.db.query(`DELETE FROM me_codigos`)
    await s.db.query(`DELETE FROM me_latidos`)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
