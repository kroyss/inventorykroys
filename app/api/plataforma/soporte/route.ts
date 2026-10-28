import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { esDuenoPlataforma } from '@/lib/empresa'
import { forbidden, unauthorized } from '@/lib/session'

// GET /api/plataforma/soporte?empresa=ID → "Ver como cliente" (28-10): los usuarios activos de esa empresa (a quién
// mirar) y las últimas entradas registradas (soporte_accesos). Solo el dueño de la plataforma; el cliente no lo ve.
// Entrar y salir van por la sesión: update({ soporte: { empresaId, usuarioId } }) / update({ soporte: null }) (lib/auth.ts).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.empresaId) return unauthorized()
  if (!esDuenoPlataforma(session.user)) return forbidden()
  const empresa = Number(req.nextUrl.searchParams.get('empresa'))
  if (!(empresa > 0)) return NextResponse.json({ error: 'Empresa inválida' }, { status: 400 })
  try {
    const [usuarios, accesos] = await Promise.all([
      dbGlobal().query(
        `SELECT u.id, u.username, NULLIF(u.full_name, '') AS nombre, ue.role
         FROM usuario_empresas ue JOIN users u ON u.id = ue.user_id
         WHERE ue.empresa_id = $1 AND u.is_active
         ORDER BY ue.role = 'admin' DESC, u.username`, [empresa]),
      dbGlobal().query(
        `SELECT a.inicio_at, a.fin_at, a.como_nombre, COALESCE(NULLIF(u.full_name, ''), u.username) AS quien
         FROM soporte_accesos a JOIN users u ON u.id = a.user_id
         WHERE a.empresa_id = $1 ORDER BY a.inicio_at DESC LIMIT 10`, [empresa]),
    ])
    return NextResponse.json({ usuarios: usuarios.rows, accesos: accesos.rows })
  } catch (err) {
    return apiError(err)
  }
}
