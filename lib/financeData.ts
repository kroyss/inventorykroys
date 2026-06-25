import { getDb } from '@/lib/db'
import type { Pool } from 'pg'
import type { FinanceLedgerRow } from '@/lib/types'

// Finanzas global: VE es la maestra (cuentas, movimientos, settings) y además
// la operación de VE; CO aporta solo su operación (ventas, compras, inventario).
// Todo se consolida a USD: COP/rate, VES/tasa oficial BCV, USD tal cual.

export interface FinanceRates { cop: number; ves: number }

const veDb = () => getDb('VE')
const coDb = () => getDb('CO')

// Una query a CO que no rompa si CO aún no está disponible.
async function coSafe<T>(fn: (db: Pool) => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(coDb() as unknown as Pool) } catch { return fallback }
}

export async function getRates(): Promise<FinanceRates> {
  const ve = veDb()
  // COP: TRM automática (cron) desde la DB de CO. La última fila es la vigente;
  // si CO no está disponible o aún no hay tasa, cae a 4000 como último recurso.
  const cop = await coSafe(async db => {
    const { rows } = await db.query(
      `SELECT trm_rate::float AS r FROM colombia_exchange_rates ORDER BY rate_date DESC, created_at DESC LIMIT 1`
    )
    return rows[0]?.r ?? 0
  }, 0)
  const { rows: r } = await ve.query(
    `SELECT official_rate::float AS r FROM venezuela_exchange_rates ORDER BY rate_date DESC, created_at DESC LIMIT 1`
  )
  const ves = r[0]?.r ?? 0
  return { cop: cop || 4000, ves: ves || 0 }
}

export function toUsd(amount: number, currency: string, rates: FinanceRates): number {
  if (!amount) return 0
  if (currency === 'COP') return rates.cop ? amount / rates.cop : 0
  if (currency === 'VES') return rates.ves ? amount / rates.ves : 0
  return amount // USD
}

const SALES_DONE = `status IN ('DESCARGADA','DESCARGADA_LOCAL')`
const SALES_DATE = `COALESCE(processed_at, payment_verified_at, created_at)`

// ───────────────────────── Cierre mensual ─────────────────────────
// Cada línea trae el consolidado (usd) y el desglose por origen: ve, co, other
// (other = movimientos manuales sin país asignado).
export interface CloseLine { label: string; usd: number; ve: number; co: number; other: number }
export interface MonthlyClose {
  month: string
  rates: FinanceRates
  income: CloseLine[]
  expenses: CloseLine[]
  totalIncome: number; incomeVE: number; incomeCO: number; incomeOther: number
  totalExpense: number; expenseVE: number; expenseCO: number; expenseOther: number
  surplus: number; surplusVE: number; surplusCO: number
}

export async function getMonthlyClose(month: string): Promise<MonthlyClose> {
  const ve = veDb()
  const rates = await getRates()

  // Ventas (auto) por país
  const salesVE = (await ve.query(
    `SELECT COALESCE(SUM(total_amount),0)::float AS t FROM sales WHERE ${SALES_DONE} AND to_char(${SALES_DATE},'YYYY-MM')=$1`, [month]
  )).rows[0].t as number
  const salesCO = await coSafe(async db =>
    (await db.query(`SELECT COALESCE(SUM(total_amount),0)::float AS t FROM sales WHERE ${SALES_DONE} AND to_char(${SALES_DATE},'YYYY-MM')=$1`, [month])).rows[0].t as number,
    0)

  // Compras locales (auto) = lo pagado (total_paid), por fecha de creación
  const purchQ = `SELECT COALESCE(SUM(total_paid),0)::float AS t FROM purchase_orders WHERE order_type='local' AND total_paid > 0 AND to_char(created_at,'YYYY-MM')=$1`
  const purchVE = (await ve.query(purchQ, [month])).rows[0].t as number
  const purchCO = await coSafe(async db =>
    (await db.query(purchQ, [month])).rows[0].t as number, 0)

  // Importaciones (auto) = pagos 50%/100% en el mes
  const impSql = `
    SELECT COALESCE(SUM(CASE WHEN to_char(paid_50_at,'YYYY-MM')=$1  THEN paid_50_amount  ELSE 0 END),0)::float
         + COALESCE(SUM(CASE WHEN to_char(paid_100_at,'YYYY-MM')=$1 THEN paid_100_amount ELSE 0 END),0)::float AS t
    FROM import_orders`
  const impVE = (await ve.query(impSql, [month])).rows[0].t as number
  const impCO = await coSafe(async db => (await db.query(impSql, [month])).rows[0].t as number, 0)

  // Movimientos manuales por categoría/moneda/país (en VE maestra)
  const { rows: mov } = await ve.query(`
    SELECT COALESCE(c.name,'Sin categoría') AS category, m.kind, m.currency, m.country,
           COALESCE(SUM(m.amount),0)::float AS amount
    FROM finance_movements m
    LEFT JOIN finance_categories c ON c.id = m.category_id
    WHERE to_char(m.date,'YYYY-MM')=$1
    GROUP BY c.name, m.kind, m.currency, m.country
  `, [month])

  // Construir líneas con desglose ve/co/other
  type Bucket = 've' | 'co' | 'other'
  type Cell = { usd: number; ve: number; co: number; other: number }
  const incomeMap = new Map<string, Cell>()
  const expenseMap = new Map<string, Cell>()
  const add = (map: Map<string, Cell>, label: string, usd: number, b: Bucket) => {
    const c = map.get(label) ?? { usd: 0, ve: 0, co: 0, other: 0 }
    c.usd += usd; c[b] += usd
    map.set(label, c)
  }

  // Auto (origen claro por país)
  add(incomeMap, 'Ventas', salesVE, 've');  add(incomeMap, 'Ventas', toUsd(salesCO, 'COP', rates), 'co')
  add(expenseMap, 'Compras locales', purchVE, 've'); add(expenseMap, 'Compras locales', toUsd(purchCO, 'COP', rates), 'co')
  add(expenseMap, 'Importaciones', impVE, 've'); add(expenseMap, 'Importaciones', toUsd(impCO, 'COP', rates), 'co')

  // Manuales (por su etiqueta de país; sin país → other)
  for (const r of mov) {
    const usd = toUsd(r.amount, r.currency, rates)
    const b: Bucket = r.country === 'VE' ? 've' : r.country === 'CO' ? 'co' : 'other'
    add(r.kind === 'income' ? incomeMap : expenseMap, r.category, usd, b)
  }

  const toLines = (m: Map<string, Cell>): CloseLine[] =>
    [...m].map(([label, c]) => ({ label, ...c })).filter(l => l.usd !== 0).sort((a, b) => b.usd - a.usd)

  const income = toLines(incomeMap)
  const expenses = toLines(expenseMap)
  const sum = (ls: CloseLine[], k: keyof Cell) => ls.reduce((s, l) => s + l[k], 0)

  const totalIncome = sum(income, 'usd'), incomeVE = sum(income, 've'), incomeCO = sum(income, 'co'), incomeOther = sum(income, 'other')
  const totalExpense = sum(expenses, 'usd'), expenseVE = sum(expenses, 've'), expenseCO = sum(expenses, 'co'), expenseOther = sum(expenses, 'other')

  return {
    month, rates, income, expenses,
    totalIncome, incomeVE, incomeCO, incomeOther,
    totalExpense, expenseVE, expenseCO, expenseOther,
    surplus: totalIncome - totalExpense,
    surplusVE: incomeVE - expenseVE,
    surplusCO: incomeCO - expenseCO,
  }
}

// ───────────────────────── Libro de movimientos del mes ─────────────────────────
// Lista, por mes, el detalle tipo "Excel": cada compra local e importación (auto,
// desde el módulo de compras), las ventas como ingreso, y los movimientos manuales.
// Todo consolidado a USD (COP por tasa manual, VES por oficial BCV).
export interface MonthlyMovements {
  month: string
  rates: FinanceRates
  rows: FinanceLedgerRow[]
  totalIncome: number
  totalExpense: number
  surplus: number
}

const isoDate = (d: unknown): string | null => (d ? new Date(d as string).toISOString() : null)

export async function getMonthlyMovements(month: string): Promise<MonthlyMovements> {
  const ve = veDb()
  const rates = await getRates()
  const rows: FinanceLedgerRow[] = []

  // ── Ventas (auto, agregado por país: como el "INGRESO BRUTO DEL MES") ──
  const salesQ = `SELECT COALESCE(SUM(total_amount),0)::float AS t FROM sales WHERE ${SALES_DONE} AND to_char(${SALES_DATE},'YYYY-MM')=$1`
  const salesVE = (await ve.query(salesQ, [month])).rows[0].t as number
  const salesCO = await coSafe(async db => (await db.query(salesQ, [month])).rows[0].t as number, 0)
  if (salesVE) rows.push({ key: 'sales-ve', id: null, date: null, description: 'Ventas del mes', category_name: 'Ventas', account_name: null, category_id: null, account_id: null, kind: 'income', amount: salesVE, currency: 'USD', usd: salesVE, country: 'VE', source: 'auto' })
  if (salesCO) rows.push({ key: 'sales-co', id: null, date: null, description: 'Ventas del mes', category_name: 'Ventas', account_name: null, category_id: null, account_id: null, kind: 'income', amount: salesCO, currency: 'COP', usd: toUsd(salesCO, 'COP', rates), country: 'CO', source: 'auto' })

  // ── Compras locales (auto, una fila por orden pagada en el mes) ──
  // total_paid es la fuente de verdad del dinero que salió (se setea al pagar).
  const purchSql = `
    SELECT po.id, po.order_number, po.total_paid::float AS amt, po.created_at AS date, s.name AS supplier
    FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id
    WHERE po.order_type = 'local' AND po.total_paid > 0
      AND to_char(po.created_at,'YYYY-MM') = $1
    ORDER BY po.created_at`
  const pushPurch = (list: Array<Record<string, unknown>>, country: 'VE' | 'CO', currency: string) => {
    for (const p of list) {
      const amt = (p.amt as number) ?? 0
      if (!amt) continue
      rows.push({
        key: `po-${country.toLowerCase()}-${p.id}`, id: null, date: isoDate(p.date),
        description: `${p.order_number}${p.supplier ? ' · ' + p.supplier : ''}`,
        category_name: 'Compras locales', account_name: null, category_id: null, account_id: null,
        kind: 'expense', amount: amt, currency, usd: toUsd(amt, currency, rates), country, source: 'auto',
      })
    }
  }
  pushPurch((await ve.query(purchSql, [month])).rows, 'VE', 'USD')
  pushPurch(await coSafe(async db => (await db.query(purchSql, [month])).rows, []), 'CO', 'COP')

  // ── Importaciones (auto, una fila por pago 50%/100% en el mes) ──
  const impSql = `
    SELECT id, order_number, supplier, amt::float AS amt, dt, step FROM (
      SELECT io.id, io.order_number, s.name AS supplier, io.paid_50_amount AS amt, io.paid_50_at AS dt, '50' AS step
      FROM import_orders io LEFT JOIN suppliers s ON s.id = io.supplier_id
      WHERE io.paid_50_done AND to_char(io.paid_50_at,'YYYY-MM') = $1
      UNION ALL
      SELECT io.id, io.order_number, s.name, io.paid_100_amount, io.paid_100_at, '100'
      FROM import_orders io LEFT JOIN suppliers s ON s.id = io.supplier_id
      WHERE io.paid_100_done AND to_char(io.paid_100_at,'YYYY-MM') = $1
    ) x ORDER BY dt`
  const pushImp = (list: Array<Record<string, unknown>>, country: 'VE' | 'CO', currency: string) => {
    for (const p of list) {
      const amt = (p.amt as number) ?? 0
      if (!amt) continue
      rows.push({
        key: `imp-${country.toLowerCase()}-${p.id}-${p.step}`, id: null, date: isoDate(p.dt),
        description: `${p.order_number}${p.supplier ? ' · ' + p.supplier : ''} · Pago ${p.step}%`,
        category_name: 'Importaciones', account_name: null, category_id: null, account_id: null,
        kind: 'expense', amount: amt, currency, usd: toUsd(amt, currency, rates), country, source: 'auto',
      })
    }
  }
  pushImp((await ve.query(impSql, [month])).rows, 'VE', 'USD')
  pushImp(await coSafe(async db => (await db.query(impSql, [month])).rows, []), 'CO', 'COP')

  // ── Movimientos manuales (en VE maestra) ──
  const { rows: mov } = await ve.query(`
    SELECT m.id, m.date, m.description, m.amount::float AS amount, m.kind, m.currency,
           m.category_id, c.name AS category_name, m.account_id, a.name AS account_name, m.country
    FROM finance_movements m
    LEFT JOIN finance_categories c ON c.id = m.category_id
    LEFT JOIN finance_accounts   a ON a.id = m.account_id
    WHERE to_char(m.date,'YYYY-MM') = $1
  `, [month])
  for (const m of mov) {
    rows.push({
      key: `mov-${m.id}`, id: m.id as number, date: isoDate(m.date),
      description: m.description as string | null,
      category_name: m.category_name as string | null, account_name: m.account_name as string | null,
      category_id: m.category_id as number | null, account_id: m.account_id as number | null,
      kind: m.kind as FinanceLedgerRow['kind'], amount: m.amount as number, currency: m.currency as string,
      usd: toUsd(m.amount as number, m.currency as string, rates),
      country: m.country as string | null, source: 'manual',
    })
  }

  // Orden: agregados sin fecha arriba, luego por fecha desc
  rows.sort((a, b) => {
    if (!a.date && !b.date) return 0
    if (!a.date) return -1
    if (!b.date) return 1
    return a.date < b.date ? 1 : a.date > b.date ? -1 : 0
  })

  const totalIncome  = rows.filter(r => r.kind === 'income').reduce((s, r) => s + r.usd, 0)
  const totalExpense = rows.filter(r => r.kind === 'expense').reduce((s, r) => s + r.usd, 0)
  return { month, rates, rows, totalIncome, totalExpense, surplus: totalIncome - totalExpense }
}

// ───────────────────────── Capital / Patrimonio ─────────────────────────
export interface CapitalAccount { id: number; name: string; currency: string; balance: number; usd: number; is_reserve: boolean }
export interface Capital {
  rates: FinanceRates
  // Mercancía en DOS valuaciones: a costo y a precio de venta. Todo en USD,
  // salvo los *_cop que son el bruto de Colombia antes de convertir.
  mercanciaVE_cost: number;  mercanciaVE_sale: number
  mercanciaCO_cost_cop: number; mercanciaCO_sale_cop: number
  mercanciaCO_cost: number;  mercanciaCO_sale: number
  mercanciaCost: number;     mercanciaSale: number      // VE+CO consolidado USD
  accounts: CapitalAccount[]
  liquidez: number           // USD (no reservas)
  reservas: number           // USD
  totalCost: number          // mercancía a costo + liquidez − reservas
  totalSale: number          // mercancía a venta  + liquidez − reservas
}

// Valoriza inventario activo a costo y a precio de venta a la vez.
const INV_VAL = `
  SELECT
    COALESCE(SUM(i.quantity * COALESCE(pp.total_cost, 0)),0)::float AS cost,
    COALESCE(SUM(i.quantity * COALESCE(NULLIF(i.sale_price,0), pp.final_price_usd, 0)),0)::float AS sale
  FROM inventory i
  LEFT JOIN product_pricing pp ON pp.product_id = i.product_id
  JOIN products p ON p.id = i.product_id
  WHERE p.is_active = TRUE`

export async function getCapital(): Promise<Capital> {
  const ve = veDb()
  const rates = await getRates()

  const veRow = (await ve.query(INV_VAL)).rows[0]
  const mercanciaVE_cost = veRow.cost as number
  const mercanciaVE_sale = veRow.sale as number

  // CO híbrido: el COSTO del inventario ya está en USD (total_cost en USD), no se
  // divide. El PRECIO DE VENTA sigue en pesos (sale_price) → ese sí se convierte.
  const coRow = await coSafe(async db => (await db.query(INV_VAL)).rows[0] as { cost: number; sale: number }, { cost: 0, sale: 0 })
  const mercanciaCO_cost = coRow.cost                                  // USD nativo
  const mercanciaCO_sale_cop = coRow.sale                              // pesos nativo
  const mercanciaCO_sale = toUsd(coRow.sale, 'COP', rates)             // pesos → USD
  const mercanciaCO_cost_cop = rates.cop ? mercanciaCO_cost * rates.cop : 0  // USD → pesos (referencia)

  const mercanciaCost = mercanciaVE_cost + mercanciaCO_cost
  const mercanciaSale = mercanciaVE_sale + mercanciaCO_sale

  const { rows: acc } = await ve.query(
    `SELECT id, name, currency, balance::float AS balance, is_reserve
     FROM finance_accounts WHERE is_active = TRUE
     ORDER BY is_reserve, display_order, name`
  )
  const accounts: CapitalAccount[] = acc.map(a => ({
    id: a.id, name: a.name, currency: a.currency, balance: a.balance,
    is_reserve: a.is_reserve, usd: toUsd(a.balance, a.currency, rates),
  }))

  const liquidez = accounts.filter(a => !a.is_reserve).reduce((s, a) => s + a.usd, 0)
  const reservas = accounts.filter(a =>  a.is_reserve).reduce((s, a) => s + a.usd, 0)

  return {
    rates,
    mercanciaVE_cost, mercanciaVE_sale,
    mercanciaCO_cost_cop, mercanciaCO_sale_cop,
    mercanciaCO_cost, mercanciaCO_sale,
    mercanciaCost, mercanciaSale,
    accounts, liquidez, reservas,
    totalCost: mercanciaCost + liquidez - reservas,
    totalSale: mercanciaSale + liquidez - reservas,
  }
}
