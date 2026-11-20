import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { resumenAtencion } from '@/lib/resumenAtencion'

// GET /api/automatizaciones/semana (20-11, el dueño): la línea chica de la tarjeta Preguntas del Inicio de Automatizaciones
// («7 días: N respondidas · tiempo típico X · Y % por la IA»), últimos 7 días contra los 7 anteriores. Mismo cálculo que
// Reportes → Atención ML (lib/resumenAtencion.ts), pero para todas las empresas y solo esas cifras. Se pide después de
// dibujar el Inicio (no lo hace más lento).
export async function GET() {
  const s = await sesionPreguntas('ver_preguntas')
  if ('error' in s) return s.error
  try {
    const { actual: a, anterior: b } = await resumenAtencion(s.db, 7)
    const c = (x: typeof a) => ({ respondidas: x.respondidas, mediana: x.mediana, porIA: x.porIA })
    return NextResponse.json({ actual: c(a), anterior: c(b) })
  } catch (err) { return apiError(err) }
}
