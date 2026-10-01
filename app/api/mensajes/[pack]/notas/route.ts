import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { notasDeVenta } from '@/lib/mensajesML'

// GET /api/mensajes/[pack]/notas → notas de la venta en MercadoLibre (solo lectura, por ahora).
// Devuelve también qué consulta respondió (pack u orden), para confirmar cuál usa MLV.
export async function GET(_req: Request, { params }: { params: Promise<{ pack: string }> }) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const { pack } = await params
  if (!/^\d+$/.test(pack)) return NextResponse.json({ error: 'Venta inválida' }, { status: 400 })
  try {
    const { rows: [c] } = await s.db.query(`SELECT conexion_id FROM ml_conversaciones WHERE pack_id = $1`, [pack])
    if (!c) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })
    return NextResponse.json(await notasDeVenta(s.db, c.conexion_id, pack))
  } catch (err) {
    return apiError(err)
  }
}
