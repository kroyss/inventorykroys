import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sesionPublicaciones } from '@/lib/preguntasSesion'
import { apiError } from '@/lib/apiError'
import { seleccion } from '@/lib/publicacionesLista'
import { cambiarEstadoML, type Resultado } from '@/lib/stockML'
import { crearLote } from '@/lib/lotesPublicaciones'
import { registrarUso } from '@/lib/usoAcciones'

// POST /api/publicaciones/estado (18-11, el dueño): pausar o activar desde Mis publicaciones, una o las elegidas.
// Usa lo mismo que Stock vs inventario (cambiarEstadoML): al pausar queda marcada «pausada a mano», así el stock
// automático no la reactiva sola; al activar se borra la marca. 18-11 (el dueño): lo elegido en lote va SIEMPRE por la
// cola de ML (avance abajo a la derecha e Historial de tareas); directo solo el botón de una fila.
const MOTIVO = 'Desde Mis publicaciones'
const Filtro = z.object({ q: z.string().max(100).optional(), cuenta: z.number().int().positive().nullable().optional(), estado: z.string().nullable().optional() })
const Body = z.object({
  estado: z.enum(['active', 'paused']),
  items: z.array(z.string().regex(/^[A-Z]{3}\d+$/)).min(1).max(3000).optional(),
  filtro: Filtro.optional(),
  lote: z.boolean().optional(),   // desde la barra de abajo (selección): siempre por la cola
}).refine(b => b.items || b.filtro, 'Elige al menos una publicación')

export async function POST(req: NextRequest) {
  const s = await sesionPublicaciones()
  if ('error' in s) return s.error
  const r = Body.safeParse(await req.json().catch(() => null))
  if (!r.success) return NextResponse.json({ error: r.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  const b = r.data
  try {
    const filas = await seleccion(s.db, { items: b.items, filtro: b.filtro })
    const cambiar = filas.filter(f => f.estado !== b.estado).map(f => f.item_id as string)
    const yaEstaban = filas.length - cambiar.length
    if (!cambiar.length) return NextResponse.json({ resultados: [], yaEstaban })
    const usuario = Number(s.session.user.id)
    if (b.lote || b.filtro || cambiar.length > 1) {
      const id = await crearLote(s.db, 'estado', `${b.estado === 'paused' ? 'Pausar' : 'Activar'} ${cambiar.length} publicaciones`,
        { estado: b.estado, motivo: MOTIVO }, cambiar.map(item => ({ item })), usuario)
      return NextResponse.json({ lote: { id, total: cambiar.length }, yaEstaban })
    }
    const resultados: Resultado[] = []
    for (const item of cambiar) resultados.push(await cambiarEstadoML(s.db, item, b.estado, { usuarioId: usuario, motivo: MOTIVO }))
    const hechos = resultados.filter(x => x.ok).length
    if (hechos) await registrarUso(s.db, 'stock', hechos)
    return NextResponse.json({ resultados, yaEstaban })
  } catch (err) {
    return apiError(err)
  }
}
