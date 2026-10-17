import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { agregarACampana, cambiarPrecioEnCampana, estadoCampana, quitarDeCampana } from '@/lib/promocionesML'
import { sesionPromociones } from '@/lib/promocionesSesion'

export const maxDuration = 120

const Campana = z.object({ id: z.string().min(3).max(40), tipo: z.string().min(3).max(40), nombre: z.string().max(120).nullable(),
  estado: z.string().max(20).optional() })
const Body = z.discriminatedUnion('accion', [
  z.object({
    accion: z.literal('agregar'), conexionId: z.number().int().positive(), campana: Campana,
    items: z.array(z.object({ id: z.string().regex(/^MLV\d+$/), precio: z.number().positive(), precioAntes: z.number().positive() })).min(1).max(100),
  }),
  z.object({   // las que YA están en la campaña: otro precio (p. ej. de 10% a 15%)
    accion: z.literal('cambiar'), conexionId: z.number().int().positive(), campana: Campana,
    items: z.array(z.object({ id: z.string().regex(/^MLV\d+$/), precio: z.number().positive(), precioAntes: z.number().positive() })).min(1).max(100),
  }),
  z.object({
    accion: z.literal('quitar'), conexionId: z.number().int().positive(), campana: Campana,
    items: z.array(z.object({ id: z.string().regex(/^MLV\d+$/) })).min(1).max(100),
  }),
])

/**
 * POST /api/promociones/acciones → agregar publicaciones a una campaña (de ML o propia) a un precio, o
 * sacarlas. De a una (ML no tiene "en lote"); cada una queda registrada con su resultado.
 */
export async function POST(req: NextRequest) {
  const s = await sesionPromociones()
  if ('error' in s) return s.error
  try {
    const b = Body.parse(await req.json())
    // ML responde "ok" pero NO guarda ofertas en campañas que todavía no empezaron (probado el 16-10).
    // El estado se pregunta a ML en el momento (la foto guardada puede decir "pending" de una que ya empezó).
    const estado = b.accion === 'agregar' ? (await estadoCampana(s.db, b.conexionId, b.campana.id, b.campana.tipo)) ?? b.campana.estado : null
    if (b.accion === 'agregar' && estado && estado !== 'started') {
      return NextResponse.json({ error: 'Esta campaña todavía no empezó: MercadoLibre no guarda publicaciones antes del inicio. Agrégalas el día que empiece.' }, { status: 400 })
    }
    const resultados: { id: string; ok: boolean; precio?: number; manda?: number | null; error?: string; noCreible?: boolean; precioTarda?: boolean }[] = []
    for (const it of b.items) {
      if (b.accion === 'cambiar') {
        const r = await cambiarPrecioEnCampana(s.db, b.conexionId, s.userId, it as { id: string; precio: number; precioAntes: number }, b.campana)
        resultados.push(r.ok ? { id: it.id, ok: true, precio: r.datos.precio } : { id: it.id, ok: false, error: r.error, noCreible: /rebaja real/.test(r.error) })
      } else if (b.accion === 'agregar') {
        const r = await agregarACampana(s.db, b.conexionId, s.userId, it as { id: string; precio: number; precioAntes: number }, b.campana)
        resultados.push(r.ok ? { id: it.id, ok: true, precio: r.datos.precio, manda: r.datos.manda } : { id: it.id, ok: false, error: r.error, noCreible: /rebaja real/.test(r.error) })
      } else {
        const r = await quitarDeCampana(s.db, b.conexionId, s.userId, it.id, b.campana)
        resultados.push(r.ok ? { id: it.id, ok: true, precioTarda: r.datos.precioTarda } : { id: it.id, ok: false, error: r.error })
      }
    }
    return NextResponse.json({ resultados, ok: resultados.filter(r => r.ok).length, error: resultados.filter(r => !r.ok).length })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
