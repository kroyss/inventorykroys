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
export interface CloseLine { label: string; usd: number }
export interface MonthlyClose {
  month: string
  rates: FinanceRates
  income: CloseLine[]
  expenses: CloseLine[]
  totalIncome: number
  totalExpense: number
  surplus: number
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

  // Movimientos manuales por categoría/moneda (en VE maestra)
  const { rows: mov } = await ve.query(`
    SELECT COALESCE(c.name,'Sin categoría') AS category, m.kind, m.currency,
           COALESCE(SUM(m.amount),0)::float AS amount
    FROM finance_movements m
    LEFT JOIN finance_categories c ON c.id = m.category_id
    WHERE to_char(m.date,'YYYY-MM')=$1
    GROUP BY c.name, m.kind, m.currency
  `, [month])

  // Construir líneas
  const incomeMap = new Map<string, number>()
  const expenseMap = new Map<string, number>()
  const add = (map: Map<string, number>, label: string, usd: number) =>
    map.set(label, (map.get(label) ?? 0) + usd)

  // Auto
  add(incomeMap, 'Ventas', salesVE + toUsd(salesCO, 'COP', rates))
  add(expenseMap, 'Compras locales', purchVE + toUsd(purchCO, 'COP', rates))
  add(expenseMap, 'Importaciones', impVE + toUsd(impCO, 'COP', rates))

  // Manuales
  for (const r of mov) {
    const usd = toUsd(r.amount, r.currency, rates)
    if (r.kind === 'income') add(incomeMap, r.category, usd)
    else add(expenseMap, r.category, usd)
  }

  const income   = [...incomeMap].map(([label, usd]) => ({ label, usd })).filter(l => l.usd !== 0)
  const expenses = [...expenseMap].map(([label, usd]) => ({ label, usd })).filter(l => l.usd !== 0)
  const totalIncome  = income.reduce((s, l) => s + l.usd, 0)
  const totalExpense = expenses.reduce((s, l) => s + l.usd, 0)

  return {
    month, rates,
    income:   income.sort((a, b) => b.usd - a.usd),
    expenses: expenses.sort((a, b) => b.usd - a.usd),
    totalIncome, totalExpense,
    surplus: totalIncome - totalExpense,
  }
}

// ───────────────────────── Capital / Patrimonio ─────────────────────────
export interface CapitalAccount { id: number; name: string; currency: string; balance: number; usd: number; is_reserve: boolean }
export interface Capital {
  rates: FinanceRates
  mercanciaVE: number       // USD
  mercanciaCO_cop: number   // COP
  mercanciaCO: number       // USD
  accounts: CapitalAccount[]
  liquidez: number          // USD (no reservas)
  reservas: number          // USD
  total: number             // USD
}

const INV_VAL = `
  SELECT COALESCE(SUM(i.quantity * pp.total_cost),0)::float AS t
  FROM inventory i
  JOIN product_pricing pp ON pp.product_id = i.product_id
  JOIN products p ON p.id = i.product_id
  WHERE p.is_active = TRUE`

export async function getCapital(): Promise<Capital> {
  const ve = veDb()
  const rates = await getRates()

  const mercanciaVE   = (await ve.query(INV_VAL)).rows[0].t as number
  const mercanciaCO_cop = await coSafe(async db => (await db.query(INV_VAL)).rows[0].t as number, 0)
  const mercanciaCO   = toUsd(mercanciaCO_cop, 'COP', rates)

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
  const total = mercanciaVE + mercanciaCO + liquidez - reservas

  return { rates, mercanciaVE, mercanciaCO_cop, mercanciaCO, accounts, liquidez, reservas, total }
}
