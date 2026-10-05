import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { mlConfigurado } from '@/lib/ml'
import { sesionPreguntas } from '@/lib/preguntasSesion'

// GET /api/ml/conexiones → las cuentas de MercadoLibre de la empresa (pantalla Cuentas de MercadoLibre).
export async function GET() {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  try {
    const { rows } = await s.db.query(
      `SELECT id, nickname, estado, ultima_sync, ultimo_error FROM ml_conexiones ORDER BY nickname`)
    return NextResponse.json({ cuentas: rows, mlListo: mlConfigurado(), esAdmin: s.session.user.role === 'admin' })
  } catch (err) {
    return apiError(err)
  }
}
