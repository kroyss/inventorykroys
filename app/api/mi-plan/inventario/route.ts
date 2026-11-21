import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { apiError } from '@/lib/apiError'
import { forbidden, unauthorized } from '@/lib/session'
import { ORGANIZACION_PLATAFORMA } from '@/lib/empresa'
import { ErrorPrueba, activarPruebaInventario } from '@/lib/pruebaInventario'

// POST /api/mi-plan/inventario (21-11-2026, mig. 193) → el admin de la organización activa su prueba de Inventario de
// 15 días (solo si en Plataforma le prendieron «Ofrecer Inventario»; una sola vez). Prende el módulo al instante (la
// sesión relee los módulos en cada request).
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizacionId) return unauthorized()
  if (session.user.role !== 'admin' || session.user.organizacionId === ORGANIZACION_PLATAFORMA) return forbidden()
  if (session.user.verComo || session.user.soporte) return NextResponse.json({ error: 'Estás viendo como otra persona: la prueba la activa el cliente.' }, { status: 403 })
  try {
    const r = await activarPruebaInventario(session.user.organizacionId, Number(session.user.id))
    return NextResponse.json({ ok: true, hasta: r.hasta })
  } catch (err) {
    if (err instanceof ErrorPrueba) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
