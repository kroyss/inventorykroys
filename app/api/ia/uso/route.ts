import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { usoDelMes } from '@/lib/ia'

// GET /api/ia/uso → lo gastado en IA este mes (solo administradores).
export async function GET() {
  const s = await sesionPreguntas(true)
  if ('error' in s) return s.error
  try {
    return NextResponse.json(await usoDelMes(s.db))
  } catch (err) {
    return apiError(err)
  }
}
