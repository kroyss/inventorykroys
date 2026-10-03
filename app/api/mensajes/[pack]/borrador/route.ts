import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { cupoIA, iaConfigurada, mensajeCupoAgotado, registrarUso } from '@/lib/ia'
import { borradorMensaje } from '@/lib/mensajesIA'
import { llevaInventario } from '@/lib/modulos'

// POST /api/mensajes/[pack]/borrador → la IA propone una respuesta para la conversación (no envía nada).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ pack: string }> }) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  if (!iaConfigurada()) return NextResponse.json({ error: 'Falta configurar la IA en el servidor' }, { status: 503 })
  const { pack } = await params
  if (!/^\d+$/.test(pack)) return NextResponse.json({ error: 'Conversación inválida' }, { status: 400 })
  try {
    const cupo = await cupoIA(s.db, s.session.user.empresaId)
    if (cupo.agotado) return NextResponse.json({ error: mensajeCupoAgotado(cupo.limite!), cupo }, { status: 429 })
    const { rows: [c] } = await s.db.query(
      `SELECT c.conexion_id, x.ml_user_id FROM ml_conversaciones c JOIN ml_conexiones x ON x.id = c.conexion_id WHERE c.pack_id = $1`, [pack])
    if (!c) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })
    const b = await borradorMensaje(s.db, c.conexion_id, Number(c.ml_user_id), pack, s.session.user.country,
      llevaInventario(s.session.user))
    await registrarUso(s.db, 'mensajes', [{ modelo: b.modelo, uso: b.uso }], s.session.user.id)
    return NextResponse.json({ borrador: { respuesta: b.respuesta, confianza: b.confianza, falta_dato: b.falta_dato }, ejemplos: b.ejemplos, cupo: { usados: cupo.usados + 1, limite: cupo.limite } })
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('IA ')) {
      return NextResponse.json({ error: `La IA no respondió: ${err.message}` }, { status: 502 })
    }
    return apiError(err)
  }
}
