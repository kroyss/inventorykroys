import { getDb } from '@/lib/db'
import type { Pool } from 'pg'

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
  const { rows: s } = await ve.query(`SELECT value FROM finance_settings WHERE key='cop_usd_rate'`)
  const cop = s[0] ? parseFloat(s[0].value) : 4000
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

  // Compras locales (auto) = lo pagado, por fecha de creación
  const purchVE = (await ve.query(
    `SELECT COALESCE(SUM(total_paid),0)::float AS t FROM purchase_orders WHERE order_type='local' AND to_char(created_at,'YYYY-MM')=$1`, [month]
  )).rows[0].t as number
  const purchCO = await coSafe(async db =>
    (await db.query(`SELECT COALESCE(SUM(total_paid),0)::float AS t FROM purchase_orders WHERE order_type='local' AND to_char(created_at,'YYYY-MM')=$1`, [month])).rows[0].t as number,
    0)

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

  const coRow = await coSafe(async db => (await db.query(INV_VAL)).rows[0] as { cost: number; sale: number }, { cost: 0, sale: 0 })
  const mercanciaCO_cost_cop = coRow.cost
  const mercanciaCO_sale_cop = coRow.sale
  const mercanciaCO_cost = toUsd(mercanciaCO_cost_cop, 'COP', rates)
  const mercanciaCO_sale = toUsd(mercanciaCO_sale_cop, 'COP', rates)

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
