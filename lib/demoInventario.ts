// Demo → sección «Inventario» (16-11): la tienda ficticia con inventario de verdad para grabar videos.
// Un producto por publicación (y por variante, como en Vincular con ML), vinculado a su publicación del
// catálogo demo (la foto sale de ahí), con costo, peso y recargo; ~6 meses de ventas que crecen mes a mes
// (costo y comisión congelados como en una venta real), compras finalizadas a dos proveedores y los
// movimientos de stock que cuadran con lo que queda. Algunos agotados y bajo mínimo para que Stock
// sugiera reponer. Borra TODO el inventario de la empresa demo antes de sembrar (lo hecho en vivo también).
// Ventas en el rango 2000099997000001… (no chocan con las ml_ordenes de las otras secciones).
import type { Pool } from 'pg'
import { DEFAULT_SHIPPING_TABLE, shippingCostVE } from '@/lib/mlShipping'

// [item, variante, recargo %, peso kg, popularidad, stock final: null = sano, número = fijo]
const PRODUCTOS: [string, number, number, number, number, number | null][] = [
  ['MLV900100101', 0, 110, 0.2, 9, 3],
  ['MLV900100102', 0, 90, 0.15, 7, null],
  ['MLV900100103', 2001, 150, 0.08, 6, null],
  ['MLV900100103', 2002, 150, 0.08, 4, null],
  ['MLV900100104', 0, 70, 0.3, 6, 0],
  ['MLV900100105', 0, 140, 0.12, 4, null],
  ['MLV900100106', 0, 100, 0.15, 5, null],
  ['MLV900100107', 0, 60, 0.5, 2, null],
  ['MLV900100108', 0, 75, 0.25, 5, 2],
  ['MLV900100109', 0, 85, 0.6, 2, null],
  ['MLV900100110', 0, 80, 0.15, 3, 1],
  ['MLV900100111', 0, 120, 0.05, 4, null],
  ['MLV900100112', 0, 70, 0.6, 4, null],
  ['MLV900100113', 3001, 150, 0.05, 3, null],
  ['MLV900100113', 3002, 150, 0.05, 4, 0],
  ['MLV900100113', 3003, 150, 0.05, 2, null],
  ['MLV900100114', 0, 65, 1.5, 2, null],
]
const PROVEEDORES = ['Distribuidora TecnoMax', 'Importadora Andina C.A.']
const DIAS = 180
const RANGO_VENTAS = '20000999970'

interface Catalogo { id: string; titulo: string; precio: number; variantes?: Record<string, string> }
interface Cuenta { nickname: string }

export async function sembrarInventario(
  db: Pool, catalogo: Catalogo[], cuentas: Cuenta[], compradores: string[], azar: (s: number) => () => number,
) {
  // ── Borrar lo que haya (orden de las FK) ──
  await db.query(`UPDATE despacho_etiquetas SET sale_id = NULL WHERE sale_id IS NOT NULL`)
  for (const t of ['invoice_sales', 'invoice_items', 'invoice_files', 'invoices', 'invoice_drafts', 'venta_ajustes', 'sale_items', 'sales',
                   'purchase_order_items', 'purchase_orders', 'import_order_files', 'import_order_items', 'import_orders',
                   'inventory_movements', 'inventory', 'product_pricing', 'product_ml_codes', 'ml_publicaciones', 'products', 'suppliers']) {
    await db.query(`DELETE FROM ${t}`)
  }

  const r = azar(7070)
  const cat = new Map(catalogo.map((p, i) => [p.id, { ...p, cuenta: cuentas[i % 3 === 2 ? 1 : 0].nickname }]))
  const prods = PRODUCTOS.map(([id, v, recargo, peso, pop, stock], i) => {
    const p = cat.get(id)!
    const precio = p.precio
    const costo = Math.round(precio / (1 + recargo / 100) * 100) / 100
    const variante = v ? p.variantes![String(v)].replace(/^[^:]+:\s*/, '') : null
    return {
      i, code: `COD-${String(i + 1).padStart(4, '0')}`, name: variante ? `${p.titulo} - ${variante}` : p.titulo,
      ml_code: `${id.slice(3)}${v ? `:${v}` : ''}`, cuenta: p.cuenta, precio, costo, recargo, peso, pop, stock,
      comision: Math.round((precio * 0.12 + shippingCostVE(precio, peso, DEFAULT_SHIPPING_TABLE, 0.65, 5)) * 100) / 100,
      vendidas: 0, vendidas30: 0,
    }
  })

  // ── Ventas: ~6 meses, cada mes un poco más ──
  const popTotal = prods.reduce((a, p) => a + p.pop, 0)
  const elegirProd = () => { let x = r() * popTotal; for (const p of prods) { x -= p.pop; if (x < 0) return p } return prods[0] }
  const ventas: { n: string; horas: number; cliente: string; status: string; items: { i: number; q: number }[] }[] = []
  for (let d = DIAS; d >= 0; d--) {
    const media = 2.5 + 3.5 * (1 - d / DIAS)
    const n = Math.max(0, Math.round(media + (r() - 0.5) * 3))
    for (let k = 0; k < n; k++) {
      const items: { i: number; q: number }[] = []
      const lineas = r() < 0.15 ? 2 : 1
      for (let l = 0; l < lineas; l++) {
        const p = elegirProd()
        if (items.some(x => x.i === p.i)) continue
        items.push({ i: p.i, q: r() < 0.85 ? 1 : 2 })
      }
      const horas = d * 24 + 8 + r() * 12
      if (horas < 3) continue
      ventas.push({ n: '', horas, cliente: compradores[Math.floor(r() * compradores.length)], status: 'DESCARGADA', items })
    }
  }
  ventas.sort((a, b) => b.horas - a.horas)
  // Las de hoy, todavía por procesar (no descuentan stock).
  for (const k of [0, 1, 2]) ventas.push({ n: '', horas: 0.3 + k * 0.7, cliente: compradores[(k * 11) % compradores.length], status: 'BORRADOR', items: [{ i: [0, 5, 11][k], q: 1 }] })
  ventas.forEach((v, k) => { v.n = `${RANGO_VENTAS}${String(k + 1).padStart(5, '0')}` })
  for (const v of ventas) if (v.status === 'DESCARGADA') for (const it of v.items) {
    prods[it.i].vendidas += it.q
    if (v.horas < 30 * 24) prods[it.i].vendidas30 += it.q
  }

  // ── Stock final, mínimos y lo comprado (lo comprado = lo que queda + lo vendido) ──
  for (const p of prods) {
    const mes = p.vendidas / 6
    const min = Math.max(2, Math.ceil(mes))
    const max = Math.max(min + 4, Math.ceil(mes * 3))
    const stock = p.stock ?? Math.round(min + 2 + r() * (max - min - 2))
    Object.assign(p, { min, max, final: stock, comprado: stock + p.vendidas })
  }

  // ── Insertar ──
  const { rows: provs } = await db.query(
    `INSERT INTO suppliers (name, supplier_type, is_active) SELECT unnest($1::text[]), 'local', TRUE RETURNING id`, [PROVEEDORES])
  const { rows: ins } = await db.query(
    `INSERT INTO products (code, name, weight_kg, is_active)
     SELECT x.code, x.name, x.peso, TRUE FROM jsonb_to_recordset($1::jsonb) AS x(code text, name text, peso numeric)
     RETURNING id, code`, [JSON.stringify(prods)])
  const pid = new Map(ins.map(x => [x.code as string, x.id as number]))
  const filas = prods.map(p => ({ ...p, id: pid.get(p.code)! }))
  await db.query(
    `INSERT INTO product_pricing (product_id, base_cost, shipping_cost, total_cost, base_price_usd, published_price_usd,
                                  final_price_usd, current_discount_percent, ganancia_pct)
     SELECT x.id, x.costo, 0, x.costo, x.precio, x.precio, x.precio, 0, x.recargo
     FROM jsonb_to_recordset($1::jsonb) AS x(id int, costo numeric, precio numeric, recargo numeric)`, [JSON.stringify(filas)])
  await db.query(
    `INSERT INTO product_ml_codes (product_id, ml_account, ml_code, is_active)
     SELECT x.id, x.cuenta, x.ml_code, TRUE FROM jsonb_to_recordset($1::jsonb) AS x(id int, cuenta text, ml_code text)`, [JSON.stringify(filas)])
  await db.query(
    `INSERT INTO inventory (product_id, quantity, min_stock, max_stock, sale_price, last_updated)
     SELECT x.id, x.final, x.min, x.max, x.precio, NOW()
     FROM jsonb_to_recordset($1::jsonb) AS x(id int, final int, min int, max int, precio numeric)`, [JSON.stringify(filas)])

  // Compras: 4 entradas finalizadas (40 % / 20 % / 20 % / el resto), alternando proveedor.
  const compras = [{ dias: DIAS + 3, parte: 0.4 }, { dias: 130, parte: 0.2 }, { dias: 75, parte: 0.2 }, { dias: 28, parte: 1 }]
  const resto = new Map(filas.map(p => [p.id, (p as unknown as { comprado: number }).comprado]))
  const movs: { id: number; tipo: string; q: number; ref: string; nota: string; horas: number }[] = []
  for (const [k, c] of compras.entries()) {
    const items = filas.map(p => {
      const total = (p as unknown as { comprado: number }).comprado
      const q = k === compras.length - 1 ? resto.get(p.id)! : Math.min(resto.get(p.id)!, Math.round(total * c.parte))
      resto.set(p.id, resto.get(p.id)! - q)
      return { id: p.id, q, costo: p.costo }
    }).filter(x => x.q > 0)
    const numero = `CL-${String(k + 1).padStart(4, '0')}`
    const totalUsd = Math.round(items.reduce((a, x) => a + x.q * x.costo, 0) * 100) / 100
    const { rows: [po] } = await db.query(
      `INSERT INTO purchase_orders (order_number, supplier_id, status, order_type, total_usd, total_paid, received_at, created_at, updated_at)
       VALUES ($1, $2, 'FINALIZADA', 'local', $3, $3, NOW() - make_interval(days => $4), NOW() - make_interval(days => $4 + 3),
               NOW() - make_interval(days => $4)) RETURNING id`, [numero, provs[k % 2].id, totalUsd, c.dias])
    await db.query(
      `INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, unit_cost_usd, total_cost_usd, received_qty, total_received_qty)
       SELECT $1, x.id, x.q, x.costo, x.q * x.costo, x.q, x.q FROM jsonb_to_recordset($2::jsonb) AS x(id int, q int, costo numeric)`,
      [po.id, JSON.stringify(items)])
    for (const x of items) movs.push({ id: x.id, tipo: 'IN', q: x.q, ref: numero, nota: 'Entrada de compra', horas: c.dias * 24 })
  }

  // Ventas + renglones (costo y comisión congelados como al vender).
  const { rows: vs } = await db.query(
    `INSERT INTO sales (ml_order_number, status, customer_name, total_amount, discount_percent, created_at, updated_at,
                        payment_verified_at, processed_at)
     SELECT x.n, x.status, x.cliente, x.total, 0, NOW() - make_interval(secs => x.horas * 3600), NOW() - make_interval(secs => x.horas * 3600),
            CASE WHEN x.status <> 'BORRADOR' THEN NOW() - make_interval(secs => (x.horas - 1) * 3600) END,
            CASE WHEN x.status <> 'BORRADOR' THEN NOW() - make_interval(secs => (x.horas - 2) * 3600) END
     FROM jsonb_to_recordset($1::jsonb) AS x(n text, status text, cliente text, total numeric, horas float)
     RETURNING id, ml_order_number`,
    [JSON.stringify(ventas.map(v => ({ ...v, total: Math.round(v.items.reduce((a, it) => a + prods[it.i].precio * it.q, 0) * 100) / 100 })))])
  const sid = new Map(vs.map(x => [x.ml_order_number as string, x.id as number]))
  const renglones = ventas.flatMap(v => v.items.map(it => {
    const p = filas[it.i]
    return { sale: sid.get(v.n)!, id: p.id, q: it.q, precio: p.precio, costo: p.costo, comision: p.comision }
  }))
  await db.query(
    `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price, unit_cost, unit_commission)
     SELECT x.sale, x.id, x.q, x.precio, x.q * x.precio, x.costo, x.comision
     FROM jsonb_to_recordset($1::jsonb) AS x(sale int, id int, q int, precio numeric, costo numeric, comision numeric)`,
    [JSON.stringify(renglones)])
  for (const v of ventas) if (v.status === 'DESCARGADA') for (const it of v.items) {
    movs.push({ id: filas[it.i].id, tipo: 'OUT', q: -it.q, ref: `Venta #${v.n}`, nota: 'Venta procesada', horas: v.horas - 2 })
  }
  await db.query(
    `INSERT INTO inventory_movements (product_id, movement_type, quantity, reference, notes, created_at)
     SELECT x.id, x.tipo, x.q, x.ref, x.nota, NOW() - make_interval(secs => x.horas * 3600)
     FROM jsonb_to_recordset($1::jsonb) AS x(id int, tipo text, q int, ref text, nota text, horas float)`,
    [JSON.stringify(movs)])
}
