import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { hashClave, nuevaClave, sesionPagosME } from '@/lib/pagosME'

/** POST /api/pagos-me/clave (admin) → clave nueva del vigilante. Se muestra UNA vez; la anterior deja de valer. */
export async function POST() {
  const s = await sesionPagosME()
  if ('error' in s) return s.error
  if (s.session.user.role !== 'admin') return NextResponse.json({ error: 'Solo un administrador' }, { status: 403 })
  try {
    const clave = nuevaClave()
    await s.db.query(
      `INSERT INTO me_vigilante (token_hash, creado_por) VALUES ($1, $2)
       ON CONFLICT (empresa_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, creado_por = EXCLUDED.creado_por, creado_at = NOW()`,
      [hashClave(clave), s.userId])
    return NextResponse.json({ clave })
  } catch (err) {
    return apiError(err)
  }
}
