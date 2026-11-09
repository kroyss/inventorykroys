import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { cupoIA, renuevaTexto, usoDelMes } from '@/lib/ia'
import { esDuenoPlataforma } from '@/lib/empresa'

// GET /api/ia/uso → CRÉDITOS de IA usados este mes y el límite de la empresa. El COSTO solo lo ve el
// dueño de la plataforma (en la fase Fundadores la IA la paga la plataforma; ver Plataforma → Interno).
export async function GET() {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  try {
    const cupo = await cupoIA(s.db, s.session.user.empresaId)
    // 09-11 (mig. 156): clientes = saldo que no vence; la propietaria, tope por mes.
    const datos = { creditos: cupo.usados, limite: cupo.limite, quedan: cupo.quedan, periodo: cupo.periodo, renueva: renuevaTexto(cupo) }
    if (!esDuenoPlataforma(s.session.user)) return NextResponse.json(datos)
    const u = await usoDelMes(s.db)
    return NextResponse.json({ total: u.total, ...datos })
  } catch (err) {
    return apiError(err)
  }
}
