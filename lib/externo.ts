// Pedidos de servidor a servidor desde los otros productos de El Comerciante Digital (hoy el Radar, 30-10-2026):
// su ayuda con IA y su soporte usan los de aquí (mismo conteo de gasto y misma bandeja, con origen 'radar').
// Clave compartida AYUDA_RADAR_SECRETO (en el .env.production de los dos; nunca en el repo). El Radar ya
// autenticó a la persona: manda el id de su cuenta central (users.id).
import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { dbGlobal } from '@/lib/db'

export function externoAutorizado(req: Request) {
  const secreto = process.env.AYUDA_RADAR_SECRETO
  const dado = req.headers.get('x-ayuda-secreto') ?? ''
  if (!secreto || dado.length !== secreto.length) return false
  return timingSafeEqual(Buffer.from(dado), Buffer.from(secreto))
}

export const noAutorizado = () => NextResponse.json({ error: 'No autorizado' }, { status: 401 })

/** La cuenta central existe y está activa. */
export async function cuentaValida(userId: number) {
  if (!Number.isInteger(userId) || userId <= 0) return false
  const { rowCount } = await dbGlobal().query(`SELECT 1 FROM users WHERE id = $1 AND is_active`, [userId])
  return !!rowCount
}
