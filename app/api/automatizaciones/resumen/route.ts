import { NextRequest, NextResponse } from 'next/server'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { apiError } from '@/lib/apiError'
import { PERIODOS, resumenAtencion } from '@/lib/resumenAtencion'

// Resumen de la atención para el Inicio de Automatizaciones (7/30/90 días contra el período anterior).
export async function GET(req: NextRequest) {
  const s = await sesionPreguntas('ver_preguntas')
  if ('error' in s) return s.error
  const d = Number(req.nextUrl.searchParams.get('dias'))
  const dias = (PERIODOS as readonly number[]).includes(d) ? d : 7
  try {
    return NextResponse.json(await resumenAtencion(s.db, dias))
  } catch (err) {
    return apiError(err)
  }
}
