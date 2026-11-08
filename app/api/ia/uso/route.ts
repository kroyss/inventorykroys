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
    // periodo/renueva (mig. 140): los créditos van atados a la prueba o al mes de plan, no al día 1.
    const datos = { creditos: cupo.usados, limite: cupo.limite, periodo: cupo.periodo, renueva: renuevaTexto(cupo), recarga: cupo.recarga,
      vence: cupo.periodo === 'plan' && cupo.renueva ? cupo.renueva.split('-').reverse().slice(0, 2).join('/') : undefined }
    if (!esDuenoPlataforma(s.session.user)) return NextResponse.json(datos)
    const u = await usoDelMes(s.db)
    return NextResponse.json({ total: u.total, ...datos })
  } catch (err) {
    return apiError(err)
  }
}
