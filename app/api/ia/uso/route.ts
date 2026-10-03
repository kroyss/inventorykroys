import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { cupoIA, usoDelMes } from '@/lib/ia'
import { esDuenoPlataforma } from '@/lib/empresa'

// GET /api/ia/uso → borradores de IA de este mes y el límite de la empresa. El COSTO solo lo ve el
// dueño de la plataforma (en la fase Fundadores la IA la paga la plataforma; ver Plataforma → Interno).
export async function GET() {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  try {
    const cupo = await cupoIA(s.db, s.session.user.empresaId)
    if (!esDuenoPlataforma(s.session.user)) return NextResponse.json({ borradores: cupo.usados, limite: cupo.limite })
    const u = await usoDelMes(s.db)
    return NextResponse.json({ total: u.total, borradores: u.borradores, limite: cupo.limite })
  } catch (err) {
    return apiError(err)
  }
}
