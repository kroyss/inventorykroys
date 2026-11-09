import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPromociones } from '@/lib/promocionesSesion'
import { crearLote } from '@/lib/lotesPublicaciones'

const Campana = z.object({ id: z.string().min(3).max(40), tipo: z.string().min(3).max(40), nombre: z.string().max(120).nullable() })
const Body = z.object({
  // La campaña de cada cuenta (las de varias cuentas se juntan por nombre en la pantalla).
  campanas: z.array(z.object({ conexionId: z.number().int().positive(), campana: Campana })).min(1).max(20),
  items: z.array(z.object({
    id: z.string().regex(/^MLV\d+$/), conexionId: z.number().int().positive(),
    precio: z.number().positive(), precioAntes: z.number().positive(), cambio: z.boolean().optional(),
  })).min(1).max(3000),
})

/**
 * POST /api/promociones/cola → deja en la cola de MercadoLibre (lib/colaML.ts) las publicaciones a agregar a una
 * campaña (o a cambiarles el precio). Responde al instante con el lote; el servidor las procesa solo y la pantalla
 * puede cerrarse. El avance se ve con GET /api/cola-ml?lote=ID.
 */
export async function POST(req: NextRequest) {
  const s = await sesionPromociones()
  if ('error' in s) return s.error
  try {
    const b = Body.parse(await req.json())
    const campDe = new Map(b.campanas.map(c => [c.conexionId, c.campana]))
    // Solo cuentas de la empresa (RLS) y con su campaña.
    const { rows } = await s.db.query<{ id: number }>(`SELECT id FROM ml_conexiones WHERE id = ANY($1::int[]) AND estado = 'activa'`,
      [[...campDe.keys()]])
    const validas = new Set(rows.map(r => r.id))
    const items = b.items.filter(x => validas.has(x.conexionId) && campDe.has(x.conexionId))
    if (!items.length) return NextResponse.json({ error: 'Ninguna publicación de una cuenta conectada.' }, { status: 400 })
    const nombre = b.campanas[0].campana.nombre ?? 'campaña'
    const loteId = await crearLote(s.db, 'promocion', `«${nombre}»: ${items.length} publicacion${items.length === 1 ? '' : 'es'}`,
      { campana: nombre },
      items.map(x => ({ item: x.id, conexionId: x.conexionId,
        datos: { conexionId: x.conexionId, campana: campDe.get(x.conexionId), precio: x.precio, precioAntes: x.precioAntes, cambio: !!x.cambio } })),
      s.userId)
    return NextResponse.json({ loteId, total: items.length })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
