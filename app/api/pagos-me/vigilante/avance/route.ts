import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { autenticarVigilante } from '@/lib/pagosME'

const Body = z.object({
  pedido: z.number().int().positive(),
  // leyendo = recorriendo la lista de órdenes del portal; bajando = guías y comprobantes de las nuevas; pesos = productos.
  fase: z.enum(['leyendo', 'revisando', 'bajando', 'pesos']),
  hechas: z.number().int().min(0).max(100000),
  total: z.number().int().min(0).max(100000).nullish(),     // null = todavía no se sabe (lectura corta)
  faltan_s: z.number().int().min(0).max(36000).nullish(),   // estimado con lo que viene tardando
  modo: z.enum(['completa', 'corta', 'avisos']).nullish(),   // 1.4.1: 'avisos'
})

/**
 * POST /api/pagos-me/vigilante/avance (extensión 1.3.9, migración 190) → cómo va este perfil en la traída en curso.
 * El aviso de abajo a la derecha lo muestra («leyendo 40 de ~120 · faltan ~30 s»). Se borra al llegar el fin.
 * La extensión lo manda como mucho cada pocos segundos; si falla no pasa nada (es solo para mostrar).
 */
export async function POST(req: NextRequest) {
  const a = await autenticarVigilante(req)
  if ('error' in a) return a.error
  try {
    const b = Body.parse(await req.json())
    await a.db.query(
      `UPDATE me_pedidos SET avance = avance || jsonb_build_object($2::text, jsonb_build_object(
         'fase', $3::text, 'hechas', $4::int, 'total', $5::int, 'faltan_s', $6::int, 'modo', $7::text, 'at', NOW()))
       WHERE id = $1 AND NOT (resultados ? $2::text)`,
      [b.pedido, a.perfil, b.fase, b.hechas, b.total ?? null, b.faltan_s ?? null, b.modo ?? null])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
