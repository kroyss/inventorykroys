// Genera un .sql para importar a la base CO los datos exportados de Inflow.
// Uso:  node scripts/import-inflow-co.mjs "<carpeta_csv>" [anio_ventas]
//   carpeta_csv : carpeta con inFlow_Inventory_productos.csv, _Inventario.csv, inFlow_SalesOrder.csv
//   anio_ventas : año de ventas a importar (default 2026; 0 = no importar ventas)
// Salida: <carpeta_csv>/co_import.sql   y un resumen por consola.
//
// Luego en el VPS (la base CO debe tener ya el esquema clonado de VE):
//   docker exec -i -e PGPASSWORD=kroys2024 inventory_db_co psql -U postgres -d inventory_co < co_import.sql

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir       = process.argv[2] || '.'
const SALES_YEAR = process.argv[3] !== undefined ? parseInt(process.argv[3], 10) : 2026

// ── parser CSV (campos entre comillas, comas/saltos internos, "" escapado, BOM) ──
function parseCSV(text) {
  text = text.replace(/^﻿/, '')
  const rows = []; let row = []; let field = ''; let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += c
    } else {
      if (c === '"') inQ = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else field += c
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

const rowsToObjs = (rows) => {
  const head = rows[0]
  return rows.slice(1).filter(r => r.length > 1).map(r => {
    const o = {}; head.forEach((h, i) => o[h] = r[i] ?? ''); return o
  })
}

// número es-CO: "1.299.900,00" -> 1299900.00 ; "9990,00000" -> 9990 ; "" -> 0
const num = (s) => {
  if (s == null || s.trim() === '') return 0
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const sql = (s) => s == null || s === '' ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`
const sqlNum = (n) => (Math.round(n * 100) / 100).toString()

// fecha "28/05/2026 2:21:27 p. m." -> '2026-05-28 14:21:27'
const parseDate = (s) => {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*([ap])\.?\s*m\.?/i)
  if (!m) return null
  let [, d, mo, y, h, mi, se, ap] = m
  h = parseInt(h, 10)
  if (/p/i.test(ap) && h < 12) h += 12
  if (/a/i.test(ap) && h === 12) h = 0
  const p2 = (x) => String(x).padStart(2, '0')
  return `${y}-${p2(mo)}-${p2(d)} ${p2(h)}:${mi}:${se}`
}

// ── leer archivos ──
const prodRows = rowsToObjs(parseCSV(readFileSync(join(dir, 'inFlow_Inventory_productos.csv'), 'utf8')))
const invRows  = rowsToObjs(parseCSV(readFileSync(join(dir, 'inFlow_Inventory_Inventario.csv'), 'utf8')))

const stockByName = new Map()
for (const r of invRows) stockByName.set(r.Item.trim(), num(r.Quantity))

// ── productos ──
const out = []
out.push('BEGIN;')
out.push('-- ===== Productos + pricing + inventory (desde Inflow) =====')

const codeByName = new Map()
let idx = 0
for (const r of prodRows) {
  const name = r.Name.trim()
  if (!name || codeByName.has(name)) continue
  idx++
  const code = 'COD-' + String(idx).padStart(4, '0')
  codeByName.set(name, code)
  const cost  = num(r.LastPurchaseCost) || num(r.MovingAverageCost)
  const price = num(r.UnitPrice)
  const qty   = stockByName.get(name) ?? 0
  const active = /true/i.test(r.IsActive) ? 'TRUE' : 'FALSE'

  out.push(`INSERT INTO products (code, name, is_active) VALUES (${sql(code)}, ${sql(name)}, ${active});`)
  out.push(`INSERT INTO product_pricing (product_id, base_cost, shipping_cost, total_cost, base_price_usd, published_price_usd, current_discount_percent, final_price_usd, price_bolivares)
 VALUES ((SELECT id FROM products WHERE code=${sql(code)}), ${sqlNum(cost)}, 0, ${sqlNum(cost)}, ${sqlNum(price)}, ${sqlNum(price)}, 0, ${sqlNum(price)}, 0);`)
  out.push(`INSERT INTO inventory (product_id, quantity, min_stock, max_stock, sale_price) VALUES ((SELECT id FROM products WHERE code=${sql(code)}), ${Math.round(qty)}, 0, 0, ${sqlNum(price)});`)
}
const nProducts = idx

// ── ventas del año elegido ──
let nOrders = 0, nItems = 0, placeholders = 0
if (SALES_YEAR > 0) {
  const saleRows = rowsToObjs(parseCSV(readFileSync(join(dir, 'inFlow_SalesOrder.csv'), 'utf8')))
  const yr = (s) => { const m = s.match(/\/(\d{4})\s/); return m ? parseInt(m[1], 10) : 0 }
  const ofYear = saleRows.filter(r => yr(r.OrderDate) === SALES_YEAR)

  // productos vendidos que no están en el maestro -> placeholders inactivos
  const missing = new Set()
  for (const r of ofYear) {
    const n = (r.ItemName || '').trim()
    if (n && !codeByName.has(n)) missing.add(n)
  }
  if (missing.size) {
    out.push('-- ===== Productos vendidos no presentes en el maestro (placeholder inactivo) =====')
    for (const name of missing) {
      idx++
      const code = 'COD-' + String(idx).padStart(4, '0')
      codeByName.set(name, code)
      placeholders++
      out.push(`INSERT INTO products (code, name, is_active) VALUES (${sql(code)}, ${sql(name)}, FALSE);`)
      out.push(`INSERT INTO product_pricing (product_id, base_cost, shipping_cost, total_cost, base_price_usd, published_price_usd, current_discount_percent, final_price_usd, price_bolivares)
 VALUES ((SELECT id FROM products WHERE code=${sql(code)}), 0,0,0,0,0,0,0,0);`)
      out.push(`INSERT INTO inventory (product_id, quantity, min_stock, max_stock, sale_price) VALUES ((SELECT id FROM products WHERE code=${sql(code)}), 0,0,0,0);`)
    }
  }

  // agrupar por orden
  const orders = new Map()
  for (const r of ofYear) {
    const on = r.OrderNumber.trim()
    if (!orders.has(on)) orders.set(on, { customer: r.Customer, date: parseDate(r.OrderDate), items: [] })
    orders.get(on).items.push({ name: (r.ItemName || '').trim(), qty: num(r.ItemQuantity), price: num(r.ItemUnitPrice), sub: num(r.ItemSubtotal) })
  }

  out.push(`-- ===== Ventas ${SALES_YEAR} (estado DESCARGADA_LOCAL, cuentan como ingreso) =====`)
  const adminId = `(SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1)`
  for (const [on, o] of orders) {
    const total = o.items.reduce((s, i) => s + i.sub, 0)
    const dt = o.date ? `'${o.date}'` : 'NOW()'
    out.push(`INSERT INTO sales (ml_order_number, status, customer_name, total_amount, discount_percent, notes, created_by, payment_verified_at, processed_at, created_at)
 VALUES (${sql(on)}, 'DESCARGADA_LOCAL', ${sql(o.customer)}, ${sqlNum(total)}, 0, 'Importado de Inflow', ${adminId}, ${dt}, ${dt}, ${dt});`)
    nOrders++
    for (const it of o.items) {
      if (!it.name) continue
      const code = codeByName.get(it.name)
      if (!code) continue
      out.push(`INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price)
 VALUES ((SELECT id FROM sales WHERE ml_order_number=${sql(on)}), (SELECT id FROM products WHERE code=${sql(code)}), ${Math.round(it.qty)}, ${sqlNum(it.price)}, ${sqlNum(it.sub)});`)
      nItems++
    }
  }
}

out.push('COMMIT;')

const outPath = join(dir, 'co_import.sql')
writeFileSync(outPath, out.join('\n') + '\n', 'utf8')

console.error(`✓ Generado: ${outPath}`)
console.error(`  Productos maestro:        ${nProducts}`)
console.error(`  Placeholders (vendidos):  ${placeholders}`)
console.error(`  Ventas ${SALES_YEAR}:               ${nOrders} órdenes, ${nItems} líneas`)
console.error(`  Con stock inicial:        ${stockByName.size} productos`)
