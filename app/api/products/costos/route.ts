import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { requestConnection } from '@/lib/requestConnection'
import { puede } from '@/lib/permisos'
import { localCostFactor } from '@/lib/localCost'

// Productos → Completar costos (mig 180, 16-11-2026). Los productos importados con "costo estimado" (% del precio),
// ordenados por lo que más se vendió en 30 días: con pocos costos reales se cubre casi toda la plata.
// Al guardar el costo real, el trigger de product_pricing corrige solas las ventas hechas con el estimado.
async function sesion() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return { error: unauthorized() } as const
  if (!puede(session.user, 'ver_productos') || !puede(session.user, 'costos')) return { error: forbidden() } as const
  return { session, db } as const
}

export async function GET() {
  const s = await sesion()
  if ('error' in s) return s.error
  try {
    const { rows } = await s.db.query(`
      SELECT p.id, p.code, p.name,
             COALESCE(pp.total_cost, 0)::float AS costo,
             COALESCE(inv.sale_price, 0)::float AS precio,
             COALESCE(v.unidades, 0)::int AS unidades_30d,
             COALESCE(v.vendido, 0)::float AS vendido_30d,
             COALESCE(e.lineas, 0)::int AS ventas_estimadas
      FROM products p
      LEFT JOIN product_pricing pp ON pp.product_id = p.id
      LEFT JOIN inventory inv ON inv.product_id = p.id
      LEFT JOIN (
        SELECT si.product_id, SUM(si.quantity) AS unidades, SUM(si.total_price) AS vendido
        FROM sale_items si JOIN sales s ON s.id = si.sale_id
        WHERE s.status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL')
          AND COALESCE(s.processed_at, s.created_at) > NOW() - INTERVAL '30 days'
        GROUP BY si.product_id
      ) v ON v.product_id = p.id
      LEFT JOIN (SELECT product_id, COUNT(*) AS lineas FROM sale_items WHERE costo_estimado GROUP BY product_id) e
        ON e.product_id = p.id
      WHERE p.is_active AND p.costo_estimado
      ORDER BY vendido_30d DESC, unidades_30d DESC, p.name`)
    const factor = await localCostFactor(s.session.user.country)   // CO: precio en pesos → USD
    return NextResponse.json({ productos: rows, pais: s.session.user.country, trm: factor })
  } catch (err) {
    return apiError(err)
  }
}

const Body = z.object({
  items: z.array(z.object({
    product_id: z.number().int().positive(),
    costo: z.number().positive('El costo debe ser mayor que 0').max(1_000_000),
  })).min(1).max(500),
})

/** PUT → guarda costos reales. Igual al estimado = "está bien así" (solo quita la marca). */
export async function PUT(req: NextRequest) {
  const s = await sesion()
  if ('error' in s) return s.error
  const db = await requestConnection(s.db)
  try {
    const { items } = Body.parse(await req.json())
    await db.query('BEGIN')
    let guardados = 0
    for (const it of items) {
      const { rows: [pp] } = await db.query(
        `SELECT COALESCE(pp.shipping_cost, 0)::float AS envio FROM products p
         JOIN product_pricing pp ON pp.product_id = p.id
         WHERE p.id = $1 AND p.costo_estimado FOR UPDATE OF pp`, [it.product_id])
      if (!pp) continue   // ya no era estimado (otra pestaña, una compra lo cambió)
      // El costo que se escribe es el total; el envío ya cargado (si hay) se respeta mientras quepa.
      const envio = pp.envio > 0 && pp.envio < it.costo ? pp.envio : 0
      await db.query(
        `UPDATE product_pricing SET base_cost = $2, shipping_cost = $3, total_cost = $4 WHERE product_id = $1`,
        [it.product_id, Math.round((it.costo - envio) * 100) / 100, envio, it.costo])
      // Si el costo no cambió, el trigger no hace nada: se confirma a mano.
      await db.query(`UPDATE sale_items SET costo_estimado = false WHERE product_id = $1 AND costo_estimado`, [it.product_id])
      await db.query(`UPDATE products SET costo_estimado = false WHERE id = $1`, [it.product_id])
      guardados++
    }
    await db.query('COMMIT')
    return NextResponse.json({ ok: true, guardados })
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {})
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
