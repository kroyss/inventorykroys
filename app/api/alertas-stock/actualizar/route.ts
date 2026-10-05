import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionStock } from '@/lib/preguntasSesion'
import { ErrorML, mlFetch } from '@/lib/ml'
import { umbralStock } from '@/lib/alertasStock'

const Body = z.object({
  cambios: z.array(z.object({
    item_id: z.string().regex(/^[A-Z]{3}\d+$/),
    variante_id: z.string().regex(/^\d+$/),
    cantidad: z.number().int().min(0).max(99999),
  })).min(1).max(50),
})

/**
 * POST /api/alertas-stock/actualizar (admin) → cambia la CANTIDAD disponible en MercadoLibre de las
 * publicaciones o variantes elegidas en Stock. Solo la cantidad: nunca precio, título ni estado.
 * Necesita el permiso "Publicación y sincronización: lectura y escritura" de la app (desde
 * 2026-10-05); una cuenta conectada antes de eso debe reconectarse para darlo.
 * Variante: PUT /items/{id}/variations/{vid} (no se manda el arreglo de variantes, que pisaría las demás).
 */
export async function POST(req: NextRequest) {
  const s = await sesionStock(true)
  if ('error' in s) return s.error
  try {
    const { cambios } = Body.parse(await req.json())
    const umbral = await umbralStock(s.db)
    const resultado: { item_id: string; variante_id: string; ok: boolean; error?: string }[] = []
    for (const c of cambios) {
      // La fila confirma que la publicación es de esta empresa (RLS) y de qué cuenta.
      const { rows: [a] } = await s.db.query(
        `SELECT a.conexion_id, c.nickname FROM ml_stock_alertas a JOIN ml_conexiones c ON c.id = a.conexion_id
         WHERE a.item_id = $1 AND a.variante_id = $2::bigint`, [c.item_id, c.variante_id])
      if (!a) { resultado.push({ ...c, ok: false, error: 'No está en tu lista de Stock' }); continue }
      try {
        const ruta = c.variante_id === '0' ? `/items/${c.item_id}` : `/items/${c.item_id}/variations/${c.variante_id}`
        await mlFetch(s.db, a.conexion_id, ruta, { method: 'PUT', body: { available_quantity: c.cantidad } })
        await s.db.query(
          `UPDATE ml_stock_alertas SET disponible = $3,
             agotada_desde = CASE WHEN $3 <= 0 THEN COALESCE(agotada_desde, NOW()) END,
             bajo_desde = CASE WHEN $3 > 0 AND $3 < $4 THEN COALESCE(bajo_desde, NOW()) END
           WHERE item_id = $1 AND variante_id = $2::bigint`, [c.item_id, c.variante_id, c.cantidad, umbral])
        resultado.push({ item_id: c.item_id, variante_id: c.variante_id, ok: true })
      } catch (e) {
        const st = e instanceof ErrorML ? e.status : 0
        resultado.push({
          item_id: c.item_id, variante_id: c.variante_id, ok: false,
          error: st === 403 || st === 401
            ? `${a.nickname} no dio permiso para cambiar publicaciones: reconéctala en Cuentas de MercadoLibre`
            : e instanceof Error ? e.message : 'No se pudo',
        })
      }
    }
    return NextResponse.json({ resultado })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Cantidades inválidas (de 0 a 99.999, máximo 50 a la vez)' }, { status: 400 })
    return apiError(err)
  }
}
