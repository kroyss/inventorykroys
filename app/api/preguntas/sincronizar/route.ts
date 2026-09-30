import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { sincronizarEmpresa } from '@/lib/preguntas'

// POST /api/preguntas/sincronizar → trae ya las preguntas de las cuentas de la empresa
// (además del cron de cada minuto). La primera vez también baja el histórico respondido.
export async function POST() {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  try {
    return NextResponse.json({ resultado: await sincronizarEmpresa(s.db) })
  } catch (err) {
    return apiError(err)
  }
}
