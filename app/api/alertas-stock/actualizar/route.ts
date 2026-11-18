import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionStock } from '@/lib/preguntasSesion'
import { ErrorML, mlFetch } from '@/lib/ml'
import { umbralStock } from '@/lib/alertasStock'
import { esDemo } from '@/lib/demo'
import { registrarUso } from '@/lib/usoAcciones'
import { registrarCambioStock } from '@/lib/stockML'
import { releerPublicacion } from '@/lib/catalogoML'

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
  const s = await sesionStock('reponer_stock')
  if ('error' in s) return s.error
  try {
    const { cambios } = Body.parse(await req.json())
    const umbral = await umbralStock(s.db)
    const demo = await esDemo(s.db)   // lib/demo.ts: se registra sin llamar a MercadoLibre
    const resultado: { item_id: string; variante_id: string; ok: boolean; error?: string }[] = []
    for (const c of cambios) {
      // La fila confirma que la publicación es de esta empresa (RLS) y de qué cuenta.
      const { rows: [a] } = await s.db.query(
        `SELECT a.conexion_id, c.nickname, a.disponible, a.estado FROM ml_stock_alertas a JOIN ml_conexiones c ON c.id = a.conexion_id
         WHERE a.item_id = $1 AND a.variante_id = $2::bigint`, [c.item_id, c.variante_id])
      if (!a) { resultado.push({ ...c, ok: false, error: 'No está en tu lista de Stock' }); continue }
      // 16-11: registro de cada cambio (antes → después y el estado con que quedó en ML: si se reactivó, se ve).
      const registro = { conexionId: a.conexion_id, itemId: c.item_id, varianteId: c.variante_id, antes: a.disponible ?? null,
        estadoAntes: a.estado === 'pausada' ? 'paused' : a.estado ?? null, origen: 'stock', usuarioId: Number(s.session.user.id) }
      try {
        const ruta = c.variante_id === '0' ? `/items/${c.item_id}` : `/items/${c.item_id}/variations/${c.variante_id}`
        if (!demo) await mlFetch(s.db, a.conexion_id, ruta, { method: 'PUT', body: { available_quantity: c.cantidad } })
        // 18-11 (el dueño: la venta decía «Agotada» y ya tenía 41): la relectura de después (antes solo el estado) es la
        // publicación entera y deja al día con UNA consulta el catálogo (Mis publicaciones, chips de Preguntas/Mensajes,
        // Stock vs inventario) y la fila de Stock (estado incluido: ML la reactiva al ponerle stock).
        let estadoDespues: string | null = demo ? registro.estadoAntes : null
        let releida = false
        if (!demo) {
          try { estadoDespues = (await releerPublicacion(s.db, a.conexion_id, c.item_id)).status; releida = true }
          catch { /* sin releer: queda sin estado; abajo se anota al menos la cantidad */ }
        }
        await registrarCambioStock(s.db, { ...registro, despues: c.cantidad, estadoDespues })
        if (!releida) await s.db.query(
          `UPDATE ml_stock_alertas SET disponible = $3,
             agotada_desde = CASE WHEN $3 <= 0 THEN COALESCE(agotada_desde, NOW()) END,
             bajo_desde = CASE WHEN $3 > 0 AND $3 < $4 THEN COALESCE(bajo_desde, NOW()) END
           WHERE item_id = $1 AND variante_id = $2::bigint`, [c.item_id, c.variante_id, c.cantidad, umbral])
        resultado.push({ item_id: c.item_id, variante_id: c.variante_id, ok: true })
      } catch (e) {
        const st = e instanceof ErrorML ? e.status : 0
        await registrarCambioStock(s.db, { ...registro, despues: null, estadoDespues: null, error: e instanceof Error ? e.message : String(e) })
        resultado.push({
          item_id: c.item_id, variante_id: c.variante_id, ok: false,
          error: st === 403 || st === 401
            ? `${a.nickname} no dio permiso para cambiar publicaciones: reconéctala en Cuentas de MercadoLibre`
            : e instanceof Error ? e.message : 'No se pudo',
        })
      }
    }
    await registrarUso(s.db, 'stock', resultado.filter(r => r.ok).length)
    return NextResponse.json({ resultado })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Cantidades inválidas (de 0 a 99.999, máximo 50 a la vez)' }, { status: 400 })
    return apiError(err)
  }
}
