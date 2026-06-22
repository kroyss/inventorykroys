'use client'
import { useState, useEffect, useCallback } from 'react'
import type { FinanceAccount, FinanceCategory, FinanceMovement, FinanceKind } from '@/lib/types'
import { money } from '@/components/ui'
import { useConfirm } from '@/components/ui/ConfirmProvider'

const ACCOUNT_TYPES = ['banco', 'efectivo', 'cripto', 'paypal', 'otro'] as const
const CURRENCIES = ['USD', 'COP', 'VES'] as const

const todayISO = () => new Date().toISOString().slice(0, 10)
const thisMonth = () => new Date().toISOString().slice(0, 7)

interface CloseLine { label: string; usd: number }
interface Summary {
  month: string; rates: { cop: number; ves: number }
  income: CloseLine[]; expenses: CloseLine[]
  totalIncome: number; totalExpense: number; surplus: number
}
interface CapAccount { id: number; name: string; currency: string; balance: number; usd: number; is_reserve: boolean }
interface Capital {
  rates: { cop: number; ves: number }
  mercanciaVE: number; mercanciaCO_cop: number; mercanciaCO: number
  accounts: CapAccount[]; liquidez: number; reservas: number; total: number
}

type Tab = 'movimientos' | 'cierre' | 'capital' | 'cuentas'
const TAB_LABELS: Record<Tab, string> = {
  movimientos: 'Movimientos',
  cierre:      'Cierre mensual',
  capital:     'Capital / Liquidez',
  cuentas:     'Cuentas',
}

export default function FinanzasClient() {
  const confirm = useConfirm()
  const [tab, setTab] = useState<Tab>('movimientos')

  const [accounts,   setAccounts]   = useState<FinanceAccount[]>([])
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [movements,  setMovements]  = useState<FinanceMovement[]>([])
  const [month,      setMonth]      = useState(thisMonth())
  const [summary,    setSummary]    = useState<Summary | null>(null)
  const [capital,    setCapital]    = useState<Capital | null>(null)
  const [rateInput,  setRateInput]  = useState('')
  const [error,      setError]      = useState<string | null>(null)
  const [busy,       setBusy]       = useState(false)

  // ── modales ──
  const [accModal, setAccModal] = useState<null | FinanceAccount>(null)  // null=cerrado; objeto vacío=nuevo
  const [movModal, setMovModal] = useState<null | FinanceMovement>(null)
  const [showAcc,  setShowAcc]  = useState(false)
  const [showMov,  setShowMov]  = useState(false)

  const loadStatic = useCallback(async () => {
    const [a, c] = await Promise.all([
      fetch('/api/finance/accounts').then(r => r.json()),
      fetch('/api/finance/categories').then(r => r.json()),
    ])
    setAccounts(Array.isArray(a) ? a : [])
    setCategories(Array.isArray(c) ? c : [])
  }, [])

  const loadMovements = useCallback(async () => {
    const r = await fetch(`/api/finance/movements?month=${month}`).then(r => r.json())
    setMovements(r.rows ?? [])
  }, [month])

  const loadSummary = useCallback(async () => {
    const r = await fetch(`/api/finance/summary?month=${month}`).then(r => r.json())
    setSummary(r)
  }, [month])

  const loadCapital = useCallback(async () => {
    const r = await fetch('/api/finance/capital').then(r => r.json())
    setCapital(r)
    setRateInput(String(r?.rates?.cop ?? ''))
  }, [])

  useEffect(() => { loadStatic() }, [loadStatic])
  useEffect(() => { loadMovements() }, [loadMovements])
  useEffect(() => { loadSummary() }, [loadSummary])
  useEffect(() => { loadCapital() }, [loadCapital])

  const saveRate = async () => {
    const v = parseFloat(rateInput)
    if (!v || v <= 0) return
    const r = await fetch('/api/finance/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cop_usd_rate: v }),
    })
    if (r.ok) { loadCapital(); loadSummary() }
    else setError((await r.json()).error ?? 'Error')
  }

  // ── resumen del mes (sin conversión de moneda; el cierre consolidado llega en A2/A3) ──
  const ingresos = movements.filter(m => m.kind === 'income').reduce((s, m) => s + m.amount, 0)
  const gastos   = movements.filter(m => m.kind === 'expense').reduce((s, m) => s + m.amount, 0)
  const neto     = ingresos - gastos

  // ── totales de cuentas por moneda ──
  const liquidezPorMoneda: Record<string, number> = {}
  const reservasPorMoneda: Record<string, number> = {}
  for (const a of accounts) {
    const bucket = a.is_reserve ? reservasPorMoneda : liquidezPorMoneda
    bucket[a.currency] = (bucket[a.currency] ?? 0) + a.balance
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-neutral-900">Finanzas <span className="text-sm font-normal text-neutral-400">global · VE + CO</span></h1>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl border border-neutral-200 shadow-sm p-1 w-fit overflow-x-auto">
        {(['movimientos', 'cierre', 'capital', 'cuentas'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-100'
            }`}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* ════════ MOVIMIENTOS ════════ */}
      {tab === 'movimientos' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800" />
            <button onClick={() => { setMovModal(null); setShowMov(true) }} className="btn-primary text-sm">+ Movimiento</button>
          </div>

          {/* Resumen del mes */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-neutral-200 p-3 shadow-sm">
              <div className="text-xs text-neutral-500 mb-1">Ingresos</div>
              <div className="text-xl font-bold text-green-600">${money(ingresos)}</div>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-3 shadow-sm">
              <div className="text-xs text-neutral-500 mb-1">Gastos</div>
              <div className="text-xl font-bold text-red-600">${money(gastos)}</div>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-3 shadow-sm">
              <div className="text-xs text-neutral-500 mb-1">Sobrante</div>
              <div className={`text-xl font-bold ${neto >= 0 ? 'text-neutral-900' : 'text-red-600'}`}>${money(neto)}</div>
            </div>
          </div>
          <p className="text-xs text-neutral-400 -mt-2">Montos sumados sin conversión de moneda. El cierre consolidado (COP→USD) llega en la siguiente fase.</p>

          {/* Tabla */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500">
                  <tr className="border-b border-neutral-100">
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-left">Categoría</th>
                    <th className="px-3 py-2 text-left">Descripción</th>
                    <th className="px-3 py-2 text-left">Cuenta</th>
                    <th className="px-3 py-2 text-right">Monto</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {movements.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-neutral-400">Sin movimientos este mes</td></tr>
                  )}
                  {movements.map((m, i) => (
                    <tr key={m.id} className={`border-b border-neutral-50 hover:bg-neutral-50 ${i % 2 ? 'bg-neutral-50/40' : ''}`}>
                      <td className="px-3 py-2 whitespace-nowrap text-neutral-600">{new Date(m.date).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' })}</td>
                      <td className="px-3 py-2">
                        {m.category_name ?? <span className="text-neutral-300">—</span>}
                        {m.source === 'auto' && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">auto</span>}
                      </td>
                      <td className="px-3 py-2 text-neutral-500 max-w-[16rem] truncate">{m.description ?? ''}</td>
                      <td className="px-3 py-2 text-neutral-500">{m.account_name ?? <span className="text-neutral-300">—</span>}</td>
                      <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${m.kind === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                        {m.kind === 'income' ? '+' : '−'}{money(m.amount)} <span className="text-neutral-400 text-xs">{m.currency}</span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {m.source === 'manual' && (
                          <>
                            <button onClick={() => { setMovModal(m); setShowMov(true) }}
                              className="text-xs px-2 py-1 rounded hover:bg-neutral-100 text-neutral-500">Editar</button>
                            <button onClick={async () => {
                              if (!await confirm({ title: 'Eliminar movimiento', message: '¿Eliminar este movimiento?', confirmText: 'Eliminar', danger: true })) return
                              const r = await fetch(`/api/finance/movements/${m.id}`, { method: 'DELETE' })
                              if (r.ok) loadMovements()
                            }} className="text-xs px-2 py-1 rounded hover:bg-red-50 text-neutral-400 hover:text-red-600">Eliminar</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════ CIERRE MENSUAL ════════ */}
      {tab === 'cierre' && summary && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800" />
            <span className="text-xs text-neutral-400">
              Consolidado en USD · COP/USD {summary.rates.cop} · VES/USD {summary.rates.ves || '—'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-neutral-200 p-3 shadow-sm">
              <div className="text-xs text-neutral-500 mb-1">Ingresos</div>
              <div className="text-xl font-bold text-green-600">${money(summary.totalIncome)}</div>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-3 shadow-sm">
              <div className="text-xs text-neutral-500 mb-1">Gastos</div>
              <div className="text-xl font-bold text-red-600">${money(summary.totalExpense)}</div>
            </div>
            <div className={`rounded-xl border p-3 shadow-sm ${summary.surplus >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="text-xs text-neutral-500 mb-1">Sobrante</div>
              <div className={`text-xl font-bold ${summary.surplus >= 0 ? 'text-green-700' : 'text-red-600'}`}>${money(summary.surplus)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
              <div className="px-4 py-2 border-b bg-neutral-50 text-sm font-semibold text-green-700">Ingresos</div>
              <table className="w-full text-sm">
                <tbody>
                  {summary.income.length === 0 && <tr><td className="px-4 py-3 text-neutral-400">Sin ingresos</td></tr>}
                  {summary.income.map(l => (
                    <tr key={l.label} className="border-t border-neutral-50">
                      <td className="px-4 py-2 text-neutral-700">{l.label}</td>
                      <td className="px-4 py-2 text-right font-medium text-green-600">${money(l.usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
              <div className="px-4 py-2 border-b bg-neutral-50 text-sm font-semibold text-red-700">Gastos</div>
              <table className="w-full text-sm">
                <tbody>
                  {summary.expenses.length === 0 && <tr><td className="px-4 py-3 text-neutral-400">Sin gastos</td></tr>}
                  {summary.expenses.map(l => (
                    <tr key={l.label} className="border-t border-neutral-50">
                      <td className="px-4 py-2 text-neutral-700">{l.label}</td>
                      <td className="px-4 py-2 text-right font-medium text-red-600">${money(l.usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-neutral-400">
            Ventas (ingreso) y Compras locales / Importaciones (gastos) se traen automáticamente del sistema (VE + CO). El resto son tus movimientos manuales.
          </p>
        </div>
      )}

      {/* ════════ CAPITAL / LIQUIDEZ ════════ */}
      {tab === 'capital' && capital && (
        <div className="space-y-4">
          <div className="rounded-xl border border-neutral-900 bg-neutral-900 text-white p-4 shadow-sm">
            <div className="text-xs text-white/60 mb-1">Capital total (USD)</div>
            <div className="text-3xl font-bold">${money(capital.total)}</div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-neutral-200 p-3 shadow-sm">
              <div className="text-xs text-neutral-500 mb-1">Mercancía VE</div>
              <div className="text-lg font-bold text-neutral-900">${money(capital.mercanciaVE)}</div>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-3 shadow-sm">
              <div className="text-xs text-neutral-500 mb-1">Mercancía CO</div>
              <div className="text-lg font-bold text-neutral-900">${money(capital.mercanciaCO)}</div>
              <div className="text-[10px] text-neutral-400">COP {money(capital.mercanciaCO_cop)}</div>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-3 shadow-sm">
              <div className="text-xs text-neutral-500 mb-1">Liquidez</div>
              <div className="text-lg font-bold text-green-700">${money(capital.liquidez)}</div>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-3 shadow-sm">
              <div className="text-xs text-neutral-500 mb-1">Reservas (−)</div>
              <div className="text-lg font-bold text-orange-600">${money(capital.reservas)}</div>
            </div>
          </div>

          {/* Tasa COP/USD */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Tasa COP por USD (para consolidar Colombia)</label>
              <input type="number" step="1" value={rateInput} onChange={e => setRateInput(e.target.value)}
                className="border border-neutral-300 rounded-lg px-3 py-2 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-neutral-800" />
            </div>
            <button onClick={saveRate} className="btn-secondary text-sm">Actualizar tasa</button>
            {capital.rates.ves > 0 && (
              <span className="text-xs text-neutral-400 ml-auto">VES/USD (oficial BCV): {money(capital.rates.ves)}</span>
            )}
          </div>

          {/* Cuentas con su valor en USD */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
            <div className="px-4 py-2 border-b bg-neutral-50 text-sm font-semibold text-neutral-700">Cuentas de liquidez</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500">
                  <tr className="border-b border-neutral-100">
                    <th className="px-3 py-2 text-left">Cuenta</th>
                    <th className="px-3 py-2 text-center">Moneda</th>
                    <th className="px-3 py-2 text-right">Saldo</th>
                    <th className="px-3 py-2 text-right">En USD</th>
                  </tr>
                </thead>
                <tbody>
                  {capital.accounts.length === 0 && (
                    <tr><td colSpan={4} className="px-3 py-6 text-center text-neutral-400">Sin cuentas (agrégalas en la pestaña Cuentas)</td></tr>
                  )}
                  {capital.accounts.map((a, i) => (
                    <tr key={a.id} className={`border-b border-neutral-50 ${i % 2 ? 'bg-neutral-50/40' : ''}`}>
                      <td className="px-3 py-2 text-neutral-800">
                        {a.name}{a.is_reserve && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600">reserva</span>}
                      </td>
                      <td className="px-3 py-2 text-center text-neutral-500">{a.currency}</td>
                      <td className="px-3 py-2 text-right text-neutral-600">{money(a.balance)}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${a.is_reserve ? 'text-orange-600' : 'text-neutral-900'}`}>${money(a.usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════ CUENTAS ════════ */}
      {tab === 'cuentas' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-neutral-600 flex flex-wrap gap-x-4 gap-y-1">
              {Object.entries(liquidezPorMoneda).map(([cur, v]) => (
                <span key={cur}>Liquidez {cur}: <span className="font-semibold text-neutral-900">{money(v)}</span></span>
              ))}
              {Object.entries(reservasPorMoneda).map(([cur, v]) => (
                <span key={cur}>Reserva {cur}: <span className="font-semibold text-orange-600">{money(v)}</span></span>
              ))}
            </div>
            <button onClick={() => { setAccModal(null); setShowAcc(true) }} className="btn-primary text-sm">+ Cuenta</button>
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500">
                  <tr className="border-b border-neutral-100">
                    <th className="px-3 py-2 text-left">Cuenta</th>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-center">Moneda</th>
                    <th className="px-3 py-2 text-right">Saldo</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {accounts.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-neutral-400">Sin cuentas. Agrega tus cuentas de liquidez.</td></tr>
                  )}
                  {accounts.map((a, i) => (
                    <tr key={a.id} className={`border-b border-neutral-50 hover:bg-neutral-50 ${i % 2 ? 'bg-neutral-50/40' : ''}`}>
                      <td className="px-3 py-2 font-medium text-neutral-900">
                        {a.name}
                        {a.is_reserve && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600">reserva</span>}
                      </td>
                      <td className="px-3 py-2 text-neutral-500 capitalize">{a.type}</td>
                      <td className="px-3 py-2 text-center text-neutral-500">{a.currency}</td>
                      <td className="px-3 py-2 text-right font-semibold text-neutral-900 whitespace-nowrap">{money(a.balance)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button onClick={() => { setAccModal(a); setShowAcc(true) }}
                          className="text-xs px-2 py-1 rounded hover:bg-neutral-100 text-neutral-500">Editar</button>
                        <button onClick={async () => {
                          if (!await confirm({ title: 'Eliminar cuenta', message: `¿Eliminar la cuenta "${a.name}"? Si tiene movimientos, se desactiva.`, confirmText: 'Eliminar', danger: true })) return
                          const r = await fetch(`/api/finance/accounts/${a.id}`, { method: 'DELETE' })
                          if (r.ok) loadStatic()
                        }} className="text-xs px-2 py-1 rounded hover:bg-red-50 text-neutral-400 hover:text-red-600">Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal cuenta ── */}
      {showAcc && (
        <AccountModal
          initial={accModal}
          busy={busy}
          onClose={() => setShowAcc(false)}
          onSave={async (body) => {
            setBusy(true); setError(null)
            const url = accModal ? `/api/finance/accounts/${accModal.id}` : '/api/finance/accounts'
            const method = accModal ? 'PUT' : 'POST'
            const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            setBusy(false)
            if (!r.ok) { setError((await r.json()).error ?? 'Error'); return }
            setShowAcc(false); loadStatic()
          }}
        />
      )}

      {/* ── Modal movimiento ── */}
      {showMov && (
        <MovementModal
          initial={movModal}
          categories={categories}
          accounts={accounts}
          busy={busy}
          onClose={() => setShowMov(false)}
          onSave={async (body) => {
            setBusy(true); setError(null)
            const url = movModal ? `/api/finance/movements/${movModal.id}` : '/api/finance/movements'
            const method = movModal ? 'PUT' : 'POST'
            const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            setBusy(false)
            if (!r.ok) { setError((await r.json()).error ?? 'Error'); return }
            setShowMov(false); loadMovements()
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────── Modal de cuenta ───────────────────────────
function AccountModal({ initial, busy, onClose, onSave }: {
  initial: FinanceAccount | null
  busy: boolean
  onClose: () => void
  onSave: (b: Record<string, unknown>) => void
}) {
  const [name, setName]         = useState(initial?.name ?? '')
  const [type, setType]         = useState(initial?.type ?? 'banco')
  const [currency, setCurrency] = useState(initial?.currency ?? 'USD')
  const [balance, setBalance]   = useState(String(initial?.balance ?? ''))
  const [isReserve, setReserve] = useState(initial?.is_reserve ?? false)
  const [notes, setNotes]       = useState(initial?.notes ?? '')

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b flex justify-between">
          <h3 className="font-semibold">{initial ? 'Editar cuenta' : 'Nueva cuenta'}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Nombre</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="BOA, PayPal, Binance USDT…"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Tipo</label>
              <select value={type} onChange={e => setType(e.target.value)} className="w-full border rounded-lg px-2 py-2 text-sm bg-white capitalize">
                {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Moneda</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} className="w-full border rounded-lg px-2 py-2 text-sm bg-white">
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Saldo</label>
              <input type="number" step="0.01" value={balance} onChange={e => setBalance(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isReserve} onChange={e => setReserve(e.target.checked)} className="rounded" />
            <span>Es reserva (se resta del total de capital)</span>
          </label>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Notas</label>
            <input value={notes ?? ''} onChange={e => setNotes(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800" />
          </div>
        </div>
        <div className="p-5 border-t flex justify-end gap-2 bg-neutral-50">
          <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
          <button disabled={busy || !name.trim()} className="btn-primary text-sm"
            onClick={() => onSave({
              name: name.trim(), type, currency,
              balance: parseFloat(balance) || 0,
              is_reserve: isReserve, notes: notes || null,
            })}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────── Modal de movimiento ───────────────────────────
function MovementModal({ initial, categories, accounts, busy, onClose, onSave }: {
  initial: FinanceMovement | null
  categories: FinanceCategory[]
  accounts: FinanceAccount[]
  busy: boolean
  onClose: () => void
  onSave: (b: Record<string, unknown>) => void
}) {
  const [kind, setKind]         = useState<FinanceKind>(initial?.kind ?? 'expense')
  const [date, setDate]         = useState(initial?.date?.slice(0, 10) ?? todayISO())
  const [categoryId, setCatId]  = useState<string>(initial?.category_id ? String(initial.category_id) : '')
  const [amount, setAmount]     = useState(String(initial?.amount ?? ''))
  const [currency, setCurrency] = useState(initial?.currency ?? 'USD')
  const [accountId, setAccId]   = useState<string>(initial?.account_id ? String(initial.account_id) : '')
  const [country, setCountry]   = useState<string>(initial?.country ?? '')
  const [description, setDesc]  = useState(initial?.description ?? '')

  const cats = categories.filter(c => c.kind === kind)

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b flex justify-between">
          <h3 className="font-semibold">{initial ? 'Editar movimiento' : 'Nuevo movimiento'}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-3">
          {/* tipo */}
          <div className="grid grid-cols-2 gap-2">
            {(['expense', 'income'] as const).map(k => (
              <button key={k} onClick={() => { setKind(k); setCatId('') }}
                className={`py-2 rounded-lg text-sm font-medium border ${
                  kind === k
                    ? k === 'income' ? 'bg-green-600 border-green-600 text-white' : 'bg-red-600 border-red-600 text-white'
                    : 'bg-white border-neutral-200 text-neutral-600'
                }`}>
                {k === 'income' ? 'Ingreso' : 'Gasto'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Fecha</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800" />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Categoría</label>
              <select value={categoryId} onChange={e => setCatId(e.target.value)} className="w-full border rounded-lg px-2 py-2 text-sm bg-white">
                <option value="">Sin categoría</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Monto</label>
              <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800" />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Moneda</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} className="w-full border rounded-lg px-2 py-2 text-sm bg-white">
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">País</label>
              <select value={country} onChange={e => setCountry(e.target.value)} className="w-full border rounded-lg px-2 py-2 text-sm bg-white">
                <option value="">—</option>
                <option value="VE">VE</option>
                <option value="CO">CO</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Cuenta (de dónde sale / entra)</label>
            <select value={accountId} onChange={e => setAccId(e.target.value)} className="w-full border rounded-lg px-2 py-2 text-sm bg-white">
              <option value="">Sin cuenta</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Descripción</label>
            <input value={description ?? ''} onChange={e => setDesc(e.target.value)} placeholder="Sueldo Tía Mote, comisiones ML…"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800" />
          </div>
        </div>
        <div className="p-5 border-t flex justify-end gap-2 bg-neutral-50">
          <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
          <button disabled={busy || !amount || parseFloat(amount) <= 0} className="btn-primary text-sm"
            onClick={() => onSave({
              date, kind,
              amount: parseFloat(amount) || 0,
              currency,
              category_id: categoryId ? Number(categoryId) : null,
              account_id:  accountId ? Number(accountId) : null,
              country:     country || null,
              description: description || undefined,
            })}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
