// Demo → sección «Inventario» (16-11): la tienda ficticia con inventario de verdad para grabar videos.
// Un producto por publicación (y por variante, como en Vincular con ML), vinculado a su publicación del
// catálogo demo (la foto sale de ahí), con costo, peso y recargo; ~6 meses de ventas que crecen mes a mes
// (costo y comisión congelados como en una venta real), compras finalizadas a dos proveedores y los
// movimientos de stock que cuadran con lo que queda. Algunos agotados y bajo mínimo para que Stock
// sugiera reponer. Borra TODO el inventario de la empresa demo antes de sembrar (lo hecho en vivo también).
//
// Siempre «de hoy» (16-11, el dueño): el cron de preguntas llama a rellenarInventarioDemo() y cada ~15 min se
// suman las ventas que «entraron» desde la última vez (más de día, todos los días, unos mejores que otros),
// con su venta de ML (cuenta y calificación positiva recibida a los 2 días), el stock que bajan y una compra
// que repone lo que cae al mínimo. Los agotados/bajo mínimo elegidos quedan así (no se venden más).
// Ventas en el rango 2000099997000001… (no chocan con las ml_ordenes de las otras secciones).
import type { Pool } from 'pg'
import datos from '@/lib/demo/datos.json'
import { DEFAULT_SHIPPING_TABLE, shippingCostVE } from '@/lib/mlShipping'

// [item, variante, recargo %, peso kg, popularidad, stock final: null = sano, número = fijo]
const PRODUCTOS: [string, number, number, number, number, number | null][] = [
  ['MLV900100101', 0, 110, 0.2, 9, 3],
  ['MLV900100102', 0, 100, 0.15, 7, null],
  ['MLV900100103', 2001, 150, 0.08, 6, null],
  ['MLV900100103', 2002, 150, 0.08, 4, null],
  ['MLV900100104', 0, 95, 0.3, 6, 0],
  ['MLV900100105', 0, 140, 0.12, 4, null],
  ['MLV900100106', 0, 110, 0.15, 5, null],
  ['MLV900100107', 0, 90, 0.5, 2, null],
  ['MLV900100108', 0, 100, 0.25, 5, 2],
  ['MLV900100109', 0, 100, 0.6, 2, null],
  ['MLV900100110', 0, 100, 0.15, 3, 1],
  ['MLV900100111', 0, 130, 0.05, 4, null],
  ['MLV900100112', 0, 95, 0.6, 4, null],
  ['MLV900100113', 3001, 150, 0.05, 3, null],
  ['MLV900100113', 3002, 150, 0.05, 4, 0],
  ['MLV900100113', 3003, 150, 0.05, 2, null],
  ['MLV900100114', 0, 100, 1.5, 2, null],
]
const PROVEEDORES = ['Distribuidora TecnoMax', 'Importadora Andina C.A.']
const DIAS = 180
const RANGO = '20000999970'
const EN_RANGO = (col: string) => `${col} BETWEEN ${RANGO}00001 AND ${RANGO}99999`
const HASTA = 'demo_inv_hasta'     // app_settings: hasta cuándo hay ventas generadas
const INICIO = 'demo_inv_inicio'   // app_settings: día 0 de la curva de crecimiento (ms)
const HORA = 3_600_000, DIA = 24 * HORA
const TZ = -4 * HORA               // Venezuela, sin horario de verano

interface Catalogo { id: string; titulo: string; precio: number; variantes?: Record<string, string> }
const D = datos as unknown as { catalogo: Catalogo[]; cuentas: { nickname: string }[]; compradores: string[] }
const CAT = new Map(D.catalogo.map((p, i) => [p.id, { ...p, cuenta: D.cuentas[i % 3 === 2 ? 1 : 0].nickname }]))

function azar(semilla: number) {
  let a = semilla
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const red = (x: number) => Math.round(x * 100) / 100

// Producto de la demo armado desde su item:variante (sirve para sembrar y para rellenar).
function ficha(itemId: string, v: number) {
  const p = CAT.get(itemId)!
  const variante = v ? p.variantes![String(v)] : null
  return { item: v ? `${itemId}:${v}` : itemId, titulo: p.titulo, variante, cuenta: p.cuenta, precio: p.precio }
}
const comisionDe = (precio: number, peso: number) => red(precio * 0.12 + shippingCostVE(precio, peso, DEFAULT_SHIPPING_TABLE, 0.65, 5))

// Peso por hora del día (Venezuela): de madrugada casi nada, el pico a media tarde y en la noche.
const PESO_HORA = [0.2, 0.1, 0.05, 0.05, 0.05, 0.1, 0.3, 0.6, 1, 1.3, 1.5, 1.6, 1.5, 1.4, 1.5, 1.7, 1.8, 1.7, 1.6, 1.7, 1.8, 1.5, 1, 0.5]
const SUMA_HORAS = PESO_HORA.reduce((a, x) => a + x, 0)
/** Ventas del día (siempre varias; unos días mejores que otros): crece de 3 a 8 en 6 meses y después sigue, despacio. */
function ventasDelDia(dia: number, inicio: number) {
  const x = (dia - inicio) / DIAS
  const base = x <= 1 ? 3 + 5 * Math.max(0, x) : 8 + 0.03 * (dia - inicio - DIAS)
  const r = azar(dia * 7 + 11)
  return base * (0.75 + 0.6 * r()) * ([0.9, 1, 1, 1.05, 1.1, 1.15, 0.95][((dia % 7) + 7) % 7])
}
/** Momentos de las ventas entre dos instantes (ms), determinístico por hora: rellenar dos veces da lo mismo. */
function momentos(desde: number, hasta: number, inicio: number): number[] {
  const out: number[] = []
  for (let h = Math.floor(desde / HORA) * HORA; h < hasta; h += HORA) {
    const local = h + TZ
    const dia = Math.floor(local / DIA)
    const r = azar(Math.floor(h / HORA))
    const esperado = ventasDelDia(dia, inicio) * PESO_HORA[Math.floor((local - dia * DIA) / HORA)] / SUMA_HORAS
    const n = Math.floor(esperado + r())
    for (let k = 0; k < n; k++) {
      const t = h + Math.floor(r() * HORA)
      if (t > desde && t <= hasta) out.push(t)
    }
  }
  return out.sort((a, b) => a - b)
}

interface Prod { id: number; code: string; item: string; titulo: string; variante: string | null; cuenta: string
  precio: number; costo: number; comision: number; pop: number; fijo: boolean; q: number; min: number; max: number }
interface Venta { n: string; t: number; cliente: string; status: 'DESCARGADA' | 'BORRADOR'; items: { p: Prod; q: number }[] }

function elegirItems(r: () => number, prods: Prod[]): { p: Prod; q: number }[] {
  const tot = prods.reduce((a, p) => a + p.pop, 0)
  const uno = () => { let x = r() * tot; for (const p of prods) { x -= p.pop; if (x < 0) return p } return prods[0] }
  const items: { p: Prod; q: number }[] = []
  for (let l = 0, lineas = r() < 0.15 ? 2 : 1; l < lineas; l++) {
    const p = uno()
    if (!items.some(x => x.p.id === p.id)) items.push({ p, q: r() < 0.85 ? 1 : 2 })
  }
  return items
}

// ── Inserciones compartidas ──
async function insertarVentas(db: Pool, ventas: Venta[], cx: Map<string, number>) {
  if (!ventas.length) return
  const fila = (v: Venta) => ({
    n: v.n, status: v.status, cliente: v.cliente, t: new Date(v.t).toISOString(),
    pagada: new Date(v.t + 0.5 * HORA).toISOString(), procesada: new Date(Math.min(Date.now(), v.t + 1.5 * HORA)).toISOString(),
    total: red(v.items.reduce((a, it) => a + it.p.precio * it.q, 0)),
  })
  const { rows } = await db.query(
    `INSERT INTO sales (ml_order_number, status, customer_name, total_amount, discount_percent, created_at, updated_at, payment_verified_at, processed_at)
     SELECT x.n, x.status, x.cliente, x.total, 0, x.t, x.t,
            CASE WHEN x.status <> 'BORRADOR' THEN x.pagada END, CASE WHEN x.status <> 'BORRADOR' THEN x.procesada END
     FROM jsonb_to_recordset($1::jsonb) AS x(n text, status text, cliente text, total numeric, t timestamptz, pagada timestamptz, procesada timestamptz)
     RETURNING id, ml_order_number`, [JSON.stringify(ventas.map(fila))])
  const sid = new Map(rows.map(x => [x.ml_order_number as string, x.id as number]))
  await db.query(
    `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price, unit_cost, unit_commission)
     SELECT x.sale, x.id, x.q, x.precio, x.q * x.precio, x.costo, x.comision
     FROM jsonb_to_recordset($1::jsonb) AS x(sale int, id int, q int, precio numeric, costo numeric, comision numeric)`,
    [JSON.stringify(ventas.flatMap(v => v.items.map(it => ({ sale: sid.get(v.n), id: it.p.id, q: it.q, precio: it.p.precio, costo: it.p.costo, comision: it.p.comision }))))])
  // La venta de ML (cuenta, monto, calificaciones): ya calificada por el vendedor; la del comprador llega a los 2 días.
  await db.query(
    `INSERT INTO ml_ordenes (id, conexion_id, fecha, comprador, productos, total, moneda, estado, items, detalle, notas_at,
                             cal_vendedor, cal_concretada, cal_recibida, cal_recibida_at, cal_recibida_concretada,
                             cal_recibida_detectada_at, cal_recibida_vista_at, cal_recibida_revisada_at)
     SELECT x.n::bigint, x.cx, x.t, x.cliente, x.productos, x.total, 'USD', 'paid', ARRAY(SELECT jsonb_array_elements_text(x.items)), x.detalle,
            NOW() + INTERVAL '10 years', 'positive', TRUE,
            c.cal, CASE WHEN c.cal IS NOT NULL THEN x.t + INTERVAL '2 days' END, CASE WHEN c.cal IS NOT NULL THEN TRUE END,
            CASE WHEN c.cal IS NOT NULL THEN x.t + INTERVAL '2 days' END, CASE WHEN c.cal IS NOT NULL THEN NOW() END, CASE WHEN c.cal IS NOT NULL THEN NOW() END
     FROM jsonb_to_recordset($1::jsonb) AS x(n text, cx int, t timestamptz, cliente text, productos text, total numeric, items jsonb, detalle jsonb)
     CROSS JOIN LATERAL (SELECT CASE WHEN x.t < NOW() - INTERVAL '2 days' THEN 'positive' END AS cal) c
     ON CONFLICT DO NOTHING`,
    [JSON.stringify(ventas.map(v => ({
      ...fila(v), cx: cx.get(v.items[0].p.cuenta),
      productos: v.items.map(it => `${it.q} × ${it.p.titulo}`).join(' · '),
      items: v.items.map(it => it.p.item), detalle: v.items.map(it => ({ titulo: it.p.titulo, cantidad: it.q, variante: it.p.variante })),
    })))])
}
interface Mov { id: number; tipo: 'IN' | 'OUT'; q: number; ref: string; nota: string; t: number }
async function insertarMovs(db: Pool, movs: Mov[]) {
  if (!movs.length) return
  await db.query(
    `INSERT INTO inventory_movements (product_id, movement_type, quantity, reference, notes, created_at)
     SELECT x.id, x.tipo, x.q, x.ref, x.nota, x.t FROM jsonb_to_recordset($1::jsonb) AS x(id int, tipo text, q int, ref text, nota text, t timestamptz)`,
    [JSON.stringify(movs.map(m => ({ ...m, t: new Date(m.t).toISOString() })))])
}
async function insertarCompra(db: Pool, numero: string, proveedor: number, t: number, items: { p: Prod; q: number }[]): Promise<Mov[]> {
  const total = red(items.reduce((a, x) => a + x.q * x.p.costo, 0))
  const { rows: [po] } = await db.query(
    `INSERT INTO purchase_orders (order_number, supplier_id, status, order_type, total_usd, total_paid, received_at, created_at, updated_at)
     VALUES ($1, $2, 'FINALIZADA', 'local', $3, $3, $4::timestamptz, $4::timestamptz - INTERVAL '3 days', $4::timestamptz) RETURNING id`,
    [numero, proveedor, total, new Date(t).toISOString()])
  await db.query(
    `INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, unit_cost_usd, total_cost_usd, received_qty, total_received_qty)
     SELECT $1, x.id, x.q, x.costo, x.q * x.costo, x.q, x.q FROM jsonb_to_recordset($2::jsonb) AS x(id int, q int, costo numeric)`,
    [po.id, JSON.stringify(items.map(x => ({ id: x.p.id, q: x.q, costo: x.p.costo })))])
  return items.map(x => ({ id: x.p.id, tipo: 'IN', q: x.q, ref: numero, nota: 'Entrada de compra', t }))
}
async function conexiones(db: Pool) {
  const { rows } = await db.query(`SELECT nickname, id FROM ml_conexiones`)
  return new Map(rows.map(x => [x.nickname as string, x.id as number]))
}
/** Ventas de hoy por procesar: las de días anteriores se van y entran 3 nuevas (desde las 8 am). */
async function borradoresDeHoy(db: Pool, prods: Prod[], cx: Map<string, number>, siguiente: () => string) {
  await db.query(`DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE status = 'BORRADOR' AND ${EN_RANGO('ml_order_number::bigint')} AND created_at < CURRENT_DATE)`)
  await db.query(`DELETE FROM ml_ordenes o WHERE ${EN_RANGO('o.id')} AND EXISTS (SELECT 1 FROM sales s WHERE s.ml_order_number = o.id::text AND s.status = 'BORRADOR' AND s.created_at < CURRENT_DATE)`)
  await db.query(`DELETE FROM sales WHERE status = 'BORRADOR' AND ${EN_RANGO('ml_order_number::bigint')} AND created_at < CURRENT_DATE`)
  const { rows: [h] } = await db.query(
    `SELECT EXISTS (SELECT 1 FROM sales WHERE status = 'BORRADOR' AND ${EN_RANGO('ml_order_number::bigint')}) AS hay, EXTRACT(HOUR FROM LOCALTIMESTAMP)::int AS hora`)
  if (h.hay || h.hora < 8) return
  const vendibles = prods.filter(p => !p.fijo)
  const ahora = Date.now(), r = azar(Math.floor(ahora / DIA))
  await insertarVentas(db, [8, 26, 47].map((min, k) => ({
    n: siguiente(), t: ahora - min * 60_000, cliente: D.compradores[Math.floor(r() * D.compradores.length)], status: 'BORRADOR' as const,
    items: [{ p: vendibles[(Math.floor(r() * vendibles.length) + k) % vendibles.length], q: 1 }],
  })), cx)
}

// ── Sembrar (Demo → Restaurar «Inventario») ──
export async function sembrarInventario(db: Pool) {
  await db.query(`UPDATE despacho_etiquetas SET sale_id = NULL WHERE sale_id IS NOT NULL`)
  await db.query(`DELETE FROM ml_ordenes WHERE ${EN_RANGO('id')}`)
  for (const t of ['invoice_sales', 'invoice_items', 'invoice_files', 'invoices', 'invoice_drafts', 'venta_ajustes', 'sale_items', 'sales',
                   'purchase_order_items', 'purchase_orders', 'import_order_files', 'import_order_items', 'import_orders',
                   'inventory_movements', 'inventory', 'product_pricing', 'product_ml_codes', 'ml_publicaciones', 'products', 'suppliers']) {
    await db.query(`DELETE FROM ${t}`)
  }
  const ahora = Date.now()
  const inicio = Math.floor((ahora + TZ) / DIA) - DIAS
  const r = azar(7070)

  const { rows: provs } = await db.query(
    `INSERT INTO suppliers (name, supplier_type, is_active) SELECT unnest($1::text[]), 'local', TRUE RETURNING id`, [PROVEEDORES])
  const base = PRODUCTOS.map(([id, v, recargo, peso, pop, stock], i) => {
    const f = ficha(id, v)
    return { ...f, code: `COD-${String(i + 1).padStart(4, '0')}`, name: f.variante ? `${f.titulo} - ${f.variante.replace(/^[^:]+:\s*/, '')}` : f.titulo,
             ml_code: f.item.slice(3), costo: red(f.precio / (1 + recargo / 100)), recargo, peso, pop, stock }
  })
  const { rows: ins } = await db.query(
    `INSERT INTO products (code, name, weight_kg, is_active)
     SELECT x.code, x.name, x.peso, TRUE FROM jsonb_to_recordset($1::jsonb) AS x(code text, name text, peso numeric) RETURNING id, code`,
    [JSON.stringify(base)])
  const pid = new Map(ins.map(x => [x.code as string, x.id as number]))
  const prods: (Prod & { stock: number | null; recargo: number; peso: number; ml_code: string; name: string })[] = base.map(b => ({
    ...b, id: pid.get(b.code)!, comision: comisionDe(b.precio, b.peso), fijo: b.stock != null, q: 0, min: 0, max: 0,
  }))

  // Ventas de los últimos 6 meses (la curva de ventasDelDia) y 3 de hoy por procesar.
  let n = 0
  const siguiente = () => `${RANGO}${String(++n).padStart(5, '0')}`
  const ventas: Venta[] = momentos(ahora - DIAS * DIA, ahora - 20 * 60_000, inicio).map(t => ({
    n: siguiente(), t, cliente: D.compradores[Math.floor(r() * D.compradores.length)], status: 'DESCARGADA', items: elegirItems(r, prods),
  }))
  const vendidas = new Map<number, number>()
  for (const v of ventas) for (const it of v.items) vendidas.set(it.p.id, (vendidas.get(it.p.id) ?? 0) + it.q)

  // Stock final, mínimos y lo comprado (lo comprado = lo que queda + lo vendido).
  for (const p of prods) {
    const mes = (vendidas.get(p.id) ?? 0) / 6
    p.min = Math.max(2, Math.ceil(mes))
    p.max = Math.max(p.min + 4, Math.ceil(mes * 3))
    p.q = p.stock ?? Math.round(p.min + 3 + r() * (p.max - p.min - 3))
  }
  await db.query(
    `INSERT INTO product_pricing (product_id, base_cost, shipping_cost, total_cost, base_price_usd, published_price_usd,
                                  final_price_usd, current_discount_percent, ganancia_pct)
     SELECT x.id, x.costo, 0, x.costo, x.precio, x.precio, x.precio, 0, x.recargo
     FROM jsonb_to_recordset($1::jsonb) AS x(id int, costo numeric, precio numeric, recargo numeric)`, [JSON.stringify(prods)])
  await db.query(
    `INSERT INTO product_ml_codes (product_id, ml_account, ml_code, is_active)
     SELECT x.id, x.cuenta, x.ml_code, TRUE FROM jsonb_to_recordset($1::jsonb) AS x(id int, cuenta text, ml_code text)`, [JSON.stringify(prods)])
  await db.query(
    `INSERT INTO inventory (product_id, quantity, min_stock, max_stock, sale_price, last_updated)
     SELECT x.id, x.q, x.min, x.max, x.precio, NOW() FROM jsonb_to_recordset($1::jsonb) AS x(id int, q int, min int, max int, precio numeric)`,
    [JSON.stringify(prods)])

  // Compras: 4 entradas finalizadas (40 % / 20 % / 20 % / el resto), alternando proveedor.
  const movs: Mov[] = []
  const resto = new Map(prods.map(p => [p.id, p.q + (vendidas.get(p.id) ?? 0)]))
  const total = new Map(resto)
  for (const [k, c] of [{ dias: DIAS + 3, parte: 0.4 }, { dias: 130, parte: 0.2 }, { dias: 75, parte: 0.2 }, { dias: 28, parte: 1 }].entries()) {
    const items = prods.map(p => {
      const q = k === 3 ? resto.get(p.id)! : Math.min(resto.get(p.id)!, Math.round(total.get(p.id)! * c.parte))
      resto.set(p.id, resto.get(p.id)! - q)
      return { p, q }
    }).filter(x => x.q > 0)
    movs.push(...await insertarCompra(db, `CL-${String(k + 1).padStart(4, '0')}`, provs[k % 2].id, ahora - c.dias * DIA, items))
  }
  const cx = await conexiones(db)
  await insertarVentas(db, ventas, cx)
  for (const v of ventas) for (const it of v.items) movs.push({ id: it.p.id, tipo: 'OUT', q: -it.q, ref: `Venta #${v.n}`, nota: 'Venta procesada', t: v.t + 1.5 * HORA })
  await insertarMovs(db, movs)
  await borradoresDeHoy(db, prods, cx, siguiente)
  for (const [k, v] of [[HASTA, String(ahora - 20 * 60_000)], [INICIO, String(inicio)], ['guia_inventario_oculta', '1']]) {
    await db.query(`INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value`, [k, v])
  }
}

// ── Rellenar (cron): lo que «se vendió» desde la última vez ──
/** Suma a la demo las ventas desde la última pasada (como mucho, cada 15 min y hasta 30 días atrás). Devuelve cuántas. */
export async function rellenarInventarioDemo(db: Pool): Promise<number> {
  const { rows: [a] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [HASTA])
  if (!a || Date.now() - Number(a.value) < 15 * 60_000) return 0
  await db.query('BEGIN')
  try {
    // Con candado: las dos copias de la app corren el cron; solo una rellena.
    const { rows: [s] } = await db.query(
      `SELECT h.value AS hasta, (SELECT value FROM app_settings WHERE key = $2) AS inicio FROM app_settings h WHERE h.key = $1 FOR UPDATE SKIP LOCKED`, [HASTA, INICIO])
    const ahora = Date.now()
    if (!s || ahora - Number(s.hasta) < 15 * 60_000) { await db.query('ROLLBACK'); return 0 }
    const desde = Math.max(Number(s.hasta), ahora - 30 * DIA)
    const inicio = Number(s.inicio) || Math.floor((ahora + TZ) / DIA) - DIAS

    const { rows } = await db.query(
      `SELECT p.id, p.code, m.ml_code, pp.total_cost::float AS costo, i.sale_price::float AS precio, p.weight_kg::float AS peso,
              i.quantity AS q, i.min_stock AS min, i.max_stock AS max
       FROM products p JOIN inventory i ON i.product_id = p.id JOIN product_pricing pp ON pp.product_id = p.id
       JOIN product_ml_codes m ON m.product_id = p.id AND m.is_active
       WHERE p.is_active AND p.code ~ '^COD-[0-9]{4}$' ORDER BY p.code`)
    const prods: Prod[] = []
    for (const x of rows) {
      const [num, v] = String(x.ml_code).split(':')
      const k = PRODUCTOS.findIndex(([id, vv]) => id === `MLV${num}` && vv === Number(v ?? 0))
      if (k < 0 || !CAT.has(`MLV${num}`)) continue
      const f = ficha(`MLV${num}`, Number(v ?? 0))
      prods.push({ ...f, id: x.id, code: x.code, precio: x.precio || f.precio, costo: x.costo, comision: comisionDe(x.precio || f.precio, x.peso ?? PRODUCTOS[k][3]),
                   pop: PRODUCTOS[k][4], fijo: PRODUCTOS[k][5] != null, q: x.q, min: x.min, max: x.max })
    }
    const vendibles = () => prods.filter(p => !p.fijo && p.q > 0)
    if (!vendibles().length) { await db.query('ROLLBACK'); return 0 }

    const { rows: [u] } = await db.query(
      `SELECT COALESCE(MAX(ml_order_number::bigint) - ${RANGO}00000, 0)::int AS n FROM sales WHERE ml_order_number ~ '^[0-9]{16}$' AND ${EN_RANGO('ml_order_number::bigint')}`)
    let n = u.n
    const siguiente = () => `${RANGO}${String(++n).padStart(5, '0')}`
    const { rows: provs } = await db.query(`SELECT id FROM suppliers WHERE is_active ORDER BY id`)
    const { rows: [c] } = await db.query(`SELECT COALESCE(MAX(SUBSTRING(order_number FROM 4)::int), 0)::int AS n FROM purchase_orders WHERE order_number ~ '^CL-[0-9]+$'`)
    let compras = c.n

    const ventas: Venta[] = [], movs: Mov[] = []
    for (const t of momentos(desde, ahora, inicio)) {
      const r = azar(Math.floor(t / 1000))
      const items = elegirItems(r, vendibles()).map(it => ({ p: it.p, q: Math.min(it.q, it.p.q) })).filter(it => it.q > 0)
      if (!items.length) continue
      const v: Venta = { n: siguiente(), t, cliente: D.compradores[Math.floor(r() * D.compradores.length)], status: 'DESCARGADA', items }
      ventas.push(v)
      for (const it of items) {
        it.p.q -= it.q
        movs.push({ id: it.p.id, tipo: 'OUT', q: -it.q, ref: `Venta #${v.n}`, nota: 'Venta procesada', t: Math.min(ahora, t + 1.5 * HORA) })
      }
      // Lo que cae al mínimo se repone con una compra (el stock nunca se acaba solo).
      const bajos = prods.filter(p => !p.fijo && p.q <= p.min)
      if (bajos.length && provs.length) {
        const items = bajos.map(p => ({ p, q: p.max - p.q }))
        movs.push(...await insertarCompra(db, `CL-${String(++compras).padStart(4, '0')}`, provs[compras % provs.length].id, Math.min(ahora, t + 2 * HORA), items))
        for (const x of items) x.p.q += x.q
      }
    }
    const cx = await conexiones(db)
    await insertarVentas(db, ventas, cx)
    await insertarMovs(db, movs)
    for (const p of prods) await db.query(`UPDATE inventory SET quantity = $1, last_updated = NOW() WHERE product_id = $2 AND quantity <> $1`, [p.q, p.id])
    // Calificaciones de los compradores: llegan a los 2 días (positivas).
    await db.query(
      `UPDATE ml_ordenes SET cal_recibida = 'positive', cal_recibida_at = fecha + INTERVAL '2 days', cal_recibida_concretada = TRUE,
              cal_recibida_detectada_at = fecha + INTERVAL '2 days', cal_recibida_vista_at = NOW(), cal_recibida_revisada_at = NOW()
       WHERE ${EN_RANGO('id')} AND cal_recibida IS NULL AND fecha < NOW() - INTERVAL '2 days'
         AND EXISTS (SELECT 1 FROM sales s WHERE s.ml_order_number = ml_ordenes.id::text AND s.status <> 'BORRADOR')`)
    await borradoresDeHoy(db, prods, cx, siguiente)
    await db.query(`UPDATE app_settings SET value = $2 WHERE key = $1`, [HASTA, String(ahora)])
    await db.query('COMMIT')
    return ventas.length
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {})
    throw e
  }
}
