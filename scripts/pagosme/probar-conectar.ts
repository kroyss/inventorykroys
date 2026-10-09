// Prueba en STAGING: venta registrada + pago verificado → PAGO_VERIFICADO y guía al lote; Despachos
// marca "Pago sin verificar" y "Despachar igual" lo libera. Usa la orden de prueba 2000099990000101
// (la sube antes el vigilante de prueba) y deja todo como estaba al final.
import { Client } from 'pg'
import type { Pool } from 'pg'
import { conectarVenta } from '@/lib/pagosME'
import { etiquetasValidadas } from '@/lib/despachos'

const VENTA = '2000099990000101'

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()
  await c.query(`SELECT set_config('app.empresa_id', '1', false), set_config('TimeZone', 'America/Caracas', false)`)
  const db = { query: c.query.bind(c), connect: async () => ({ query: c.query.bind(c), release() {} }) } as unknown as Pool
  const ok = (cond: boolean, t: string) => console.log(cond ? '✓' : '✗ FALLÓ', t)
  let saleId: number | null = null
  try {
    const { rows: [s] } = await c.query(
      `INSERT INTO sales (ml_order_number, status, customer_name, total_amount) VALUES ($1, 'BORRADOR', 'PRUEBA PAGOS ME', 10) RETURNING id`, [VENTA])
    saleId = s.id
    const { rows: [prod] } = await c.query(`SELECT id FROM products WHERE is_active LIMIT 1`)
    await c.query(`INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price) VALUES ($1, $2, 1, 10, 10)`, [saleId, prod.id])

    // 1) Pago sin verificar: la guía entra al lote, la venta sigue en BORRADOR
    await c.query(`UPDATE me_pagos SET verificacion = 'pendiente' WHERE venta = $1`, [VENTA])
    const r1 = await conectarVenta(db, VENTA, 1)
    ok('guia' in r1 && r1.guia === 'agregada', `guía al lote con pago sin verificar (${JSON.stringify(r1)})`)
    const { rows: [e] } = await c.query(`SELECT id, lote_id, fac_documento FROM despacho_etiquetas WHERE venta = $1`, [VENTA])
    ok(!!e, `etiqueta en el lote ${e?.lote_id} · cédula leída: ${e?.fac_documento ? 'sí' : 'no'}`)

    // 2) Venta PROCESADA + pago sin verificar → estado PAGO (no se imprime)
    await c.query(`UPDATE sales SET status = 'PROCESADA' WHERE id = $1`, [saleId])
    let et = (await etiquetasValidadas(db, e.lote_id, false, true)).find(x => x.id === e.id)!
    ok(et.estado === 'PAGO', `Despachos: ${et.estado} — ${et.detalle}`)
    const sinModulo = (await etiquetasValidadas(db, e.lote_id, false, false)).find(x => x.id === e.id)!
    ok(sinModulo.estado !== 'PAGO', `sin el módulo (clientes) no cambia nada: ${sinModulo.estado}`)

    // 3) Despachar igual → se imprime
    await c.query(`UPDATE despacho_etiquetas SET pago_forzado_por = 1, pago_forzado_at = NOW() WHERE id = $1`, [e.id])
    et = (await etiquetasValidadas(db, e.lote_id, false, true)).find(x => x.id === e.id)!
    ok(et.estado === 'OK', `Despachar igual: ${et.estado}`)
    await c.query(`UPDATE despacho_etiquetas SET pago_forzado_por = NULL, pago_forzado_at = NULL WHERE id = $1`, [e.id])

    // 4) Pago válido + venta en BORRADOR → PAGO_VERIFICADO, y la guía no se duplica
    await c.query(`UPDATE sales SET status = 'BORRADOR' WHERE id = $1`, [saleId])
    await c.query(`UPDATE me_pagos SET verificacion = 'valido' WHERE venta = $1`, [VENTA])
    const r2 = await conectarVenta(db, VENTA, 1)
    const { rows: [s2] } = await c.query(`SELECT status FROM sales WHERE id = $1`, [saleId])
    ok(s2.status === 'PAGO_VERIFICADO' && 'guia' in r2 && r2.guia === 'ya_estaba', `pago válido → ${s2.status}, guía ${'guia' in r2 ? r2.guia : '?'}`)
  } finally {
    await c.query(`DELETE FROM despacho_etiquetas WHERE venta = $1`, [VENTA])
    await c.query(`DELETE FROM despacho_lotes l WHERE status = 'PENDIENTE' AND created_at > NOW() - INTERVAL '10 minutes'
                   AND NOT EXISTS (SELECT 1 FROM despacho_etiquetas e WHERE e.lote_id = l.id)`)
    if (saleId) { await c.query(`DELETE FROM sale_items WHERE sale_id = $1`, [saleId]); await c.query(`DELETE FROM sales WHERE id = $1`, [saleId]) }
    await c.query(`UPDATE me_pagos SET verificacion = 'pendiente', verificado_por = NULL, verificado_at = NULL WHERE venta = $1`, [VENTA])
    await c.end()
    console.log('limpio')
  }
}
main().catch(e => { console.error(e); process.exit(1) })
