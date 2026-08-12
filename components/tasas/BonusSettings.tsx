'use client'
import { useEffect, useState } from 'react'
import { int } from '@/components/ui'
import { parseBonusPhases, DEFAULT_BONUS_METAS, DEFAULT_BONUS_MONTOS } from '@/lib/bonus'

/**
 * Bonos por ventas del mes — metas y montos editables (3 fases).
 * Se guardan en app_settings del país de la sesión (`bono_meta_N` / `bono_monto_N`)
 * y los lee el pipeline del dashboard vía /api/dashboard/my-bonus.
 */
export default function BonusSettings() {
  const [metas,  setMetas]  = useState(DEFAULT_BONUS_METAS.map(String))
  const [montos, setMontos] = useState(DEFAULT_BONUS_MONTOS.map(String))
  const [busy,   setBusy]   = useState(false)
  const [error,  setError]  = useState<string | null>(null)
  const [okMsg,  setOkMsg]  = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(s => {
      const phases = parseBonusPhases(s)
      setMetas(phases.map(p => String(p.end)))
      setMontos(phases.map(p => String(p.bonus)))
    }).catch(() => {})
  }, [])

  const setAt = (arr: string[], i: number, v: string) => arr.map((x, j) => (j === i ? v : x))

  const nums   = metas.map(Number)
  const totalM = montos.reduce((s, m) => s + (Number(m) || 0), 0)

  const save = async () => {
    setError(null); setOkMsg(null)
    if (nums.some(n => !Number.isFinite(n) || n <= 0) || montos.some(m => !Number.isFinite(Number(m)) || Number(m) < 0)) {
      setError('Las metas deben ser mayores a 0 y los montos no pueden ser negativos'); return
    }
    if (!nums.every((n, i) => i === 0 || n > nums[i - 1])) {
      setError('Cada meta debe ser mayor que la anterior'); return
    }
    setBusy(true)
    const body: Record<string, string> = {}
    metas.forEach((m, i)  => { body[`bono_meta_${i + 1}`]  = m })
    montos.forEach((m, i) => { body[`bono_monto_${i + 1}`] = m })
    const res = await fetch('/api/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    setBusy(false)
    if (!res.ok) { setError((await res.json()).error ?? 'Error al guardar'); return }
    setOkMsg('Bonos guardados'); setTimeout(() => setOkMsg(null), 2500)
  }

  return (
    <div className="mt-1 border-t border-neutral-100 pt-4">
      <p className="text-sm font-semibold text-neutral-700 mb-1">Bonos por ventas del mes</p>
      <p className="text-[11px] text-neutral-500 mb-2">
        Ventas del mes necesarias para cobrar cada bono. Son <b>acumulativas</b>: al llegar a la
        meta 2 ya se cobró también el bono 1. Es lo que muestra la barra de bonos del dashboard.
      </p>

      <div className="grid grid-cols-[auto_1fr_1fr] gap-x-2 gap-y-1.5 items-center">
        <div />
        <div className="text-[11px] text-neutral-500">Meta de ventas $</div>
        <div className="text-[11px] text-neutral-500">Bono $</div>
        {metas.map((m, i) => (
          <div key={i} className="contents">
            <span className="text-[11px] text-neutral-500 whitespace-nowrap pr-1">Fase {i + 1}</span>
            <input type="number" step="100" min="1" value={m}
              onChange={e => setMetas(a => setAt(a, i, e.target.value))}
              className="border rounded px-2 py-1.5 text-sm" />
            <input type="number" step="10" min="0" value={montos[i]}
              onChange={e => setMontos(a => setAt(a, i, e.target.value))}
              className="border rounded px-2 py-1.5 text-sm" />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 mt-3">
        <span className="text-[11px] text-neutral-500">
          Máximo por mes: <b>${int(totalM)}</b>
        </span>
        <button onClick={save} disabled={busy}
          className="text-xs px-3 py-1.5 rounded-lg border-2 border-neutral-900/40 font-semibold text-neutral-800 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 transition-colors disabled:opacity-60 whitespace-nowrap">
          {busy ? 'Guardando…' : '💾 Guardar bonos'}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {okMsg && <p className="mt-2 text-xs text-green-600">{okMsg}</p>}
    </div>
  )
}
