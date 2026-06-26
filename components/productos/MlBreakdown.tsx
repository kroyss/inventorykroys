'use client'

// Cascada "lo que realmente te queda" después de ML — una sola fuente de verdad
// para Productos (nuevo/edición/vista) y la calculadora de Ajustes, así nunca
// se desincronizan. Cada país con su lógica:
//   VE: precio publicado (oficial) → dólares reales (paralelo) → − comisión − envío − costo.
//   CO: precio publicado (pesos) → − comisión − envío − retención − costo (×TRM).

const fmtUsd  = (n: number) => Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtPeso = (n: number) => Math.round(Number(n || 0)).toLocaleString('de-DE')

const num = (ml: Record<string, string>, k: string, d: number) => {
  const v = parseFloat(ml?.[k]); return isNaN(v) ? d : v
}

// Color/estado del margen NETO sobre venta: sano ≥20%, ajustado ≥8%, muy fino ≥0, pérdida <0.
const netColor = (m: number) => m >= 20 ? 'text-green-600' : m >= 8 ? 'text-amber-600' : m >= 0 ? 'text-amber-600' : 'text-red-600'
const netBg    = (m: number) => m >= 20 ? 'bg-emerald-50 border-emerald-300' : m >= 8 ? 'bg-amber-50 border-amber-300' : m >= 0 ? 'bg-amber-50 border-amber-300' : 'bg-red-50 border-red-300'
const netFlag  = (m: number) => m >= 20 ? '✅ Sano' : m >= 8 ? '⚠️ Ajustado' : m >= 0 ? '⚠️ Muy fino' : '🔴 Pérdida'

function Row({ label, value, neg, sub }: { label: string; value: string; neg?: boolean; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between px-1 py-0.5">
      <span className="text-neutral-600">
        {label}{sub && <span className="text-neutral-400 text-[10px] ml-1">{sub}</span>}
      </span>
      <span className={neg ? 'text-red-500' : 'text-neutral-800'}>{value}</span>
    </div>
  )
}

export interface MlBreakdownProps {
  country: 'VE' | 'CO'
  totalCost: number
  ml: Record<string, string>
  // VE
  finalPriceUsd?: number
  veRate?: { official: number; parallel: number } | null
  priceBs?: number
  // CO
  salePrice?: number   // pesos
  coTrm?: number
}

export default function MlBreakdown(p: MlBreakdownProps) {
  // ───────── Colombia ─────────
  if (p.country === 'CO') {
    const price = p.salePrice ?? 0
    const coTrm = p.coTrm ?? 0
    if (!(price > 0) || !(coTrm > 0)) {
      return <p className="text-xs text-neutral-400 px-1">Cargá precio de venta y TRM para ver la ganancia neta.</p>
    }
    const comisionPct = num(p.ml, 'ml_comision', 15.5)
    const retenPct    = num(p.ml, 'ml_reten', 1.91)
    const umbral      = num(p.ml, 'ml_umbral_envio', 60000)
    const comision    = price * comisionPct / 100
    const envio       = price >= umbral ? num(p.ml, 'ml_envio_alto', 8000) : num(p.ml, 'ml_envio_bajo', 2600)
    const reten       = price * retenPct / 100
    const costoPesos  = p.totalCost * coTrm
    const ganancia    = price - comision - envio - reten - costoPesos
    const margen      = ganancia / price * 100
    const costPct     = costoPesos > 0 ? ganancia / costoPesos * 100 : 0   // ganancia sobre el costo (compra+envío)
    return (
      <div className="space-y-2">
        <div className="text-sm space-y-0.5">
          <Row label="Precio publicado (pesos)" value={`$${fmtPeso(price)}`} />
          <Row label={`− Comisión ML (${comisionPct}%)`} value={`−$${fmtPeso(comision)}`} neg />
          <Row label={`− Envío ML (${price >= umbral ? '≥' : '<'} umbral)`} value={`−$${fmtPeso(envio)}`} neg />
          <Row label={`− Retención (${retenPct}%)`} value={`−$${fmtPeso(reten)}`} neg />
          <Row label="− Tu costo (×TRM)" value={`−$${fmtPeso(costoPesos)}`} neg />
        </div>
        <div className={`rounded-lg p-2.5 border-2 ${netBg(margen)} flex items-center justify-between`}>
          <div>
            <p className={`text-xs font-semibold ${netColor(margen)}`}>Ganancia neta · {netFlag(margen)}</p>
            <p className="text-[10px] text-neutral-500">{margen >= 0 ? '+' : ''}{margen.toFixed(1)}% sobre venta · {costPct >= 0 ? '+' : ''}{costPct.toFixed(1)}% sobre costo</p>
          </div>
          <span className={`text-lg font-bold ${netColor(margen)}`}>${fmtPeso(ganancia)}</span>
        </div>
        <p className="text-[10px] text-neutral-400 px-1">Comisión, envío y retención ajustables en Ajustes.</p>
      </div>
    )
  }

  // ───────── Venezuela ─────────
  const final = p.finalPriceUsd ?? 0
  const rate  = p.veRate
  if (!rate || !(rate.parallel > 0) || !(rate.official > 0) || !(final > 0)) {
    return <p className="text-xs text-neutral-400 px-1">Cargá precio y tasa para ver la ganancia neta.</p>
  }
  const comisionPct = num(p.ml, 'ml_comision', 12)
  const realUsd   = final * rate.official / rate.parallel
  const cambiario = final - realUsd
  const comision  = realUsd * comisionPct / 100
  const envio     = num(p.ml, 'ml_envio', 0.65) * Math.min(1, final / num(p.ml, 'ml_umbral', 5))
  const neto      = realUsd - comision - envio
  const ganancia  = neto - p.totalCost
  const margen    = realUsd > 0 ? ganancia / realUsd * 100 : 0
  const costPct   = p.totalCost > 0 ? ganancia / p.totalCost * 100 : 0   // ganancia sobre el costo (compra+envío)
  return (
    <div className="space-y-2">
      <div className="text-sm space-y-0.5">
        <Row label="Venta con descuento aplicado en ML" value={`$${fmtUsd(final)}`} sub={p.priceBs ? `Bs ${fmtPeso(p.priceBs)}` : undefined} />
        <Row label="En dólares reales (paralelo)" value={`$${fmtUsd(realUsd)}`} sub={`−$${fmtUsd(cambiario)} cambiario`} />
        <Row label={`− Comisión ML (${comisionPct}%)`} value={`−$${fmtUsd(comision)}`} neg />
        <Row label="− Envío ML" value={`−$${fmtUsd(envio)}`} neg />
        <Row label="− Tu costo" value={`−$${fmtUsd(p.totalCost)}`} neg />
      </div>
      <div className={`rounded-lg p-2.5 border-2 ${netBg(margen)} flex items-center justify-between`}>
        <div>
          <p className={`text-xs font-semibold ${netColor(margen)}`}>Ganancia neta · {netFlag(margen)}</p>
          <p className="text-[10px] text-neutral-500">{margen >= 0 ? '+' : ''}{margen.toFixed(1)}% sobre venta · {costPct >= 0 ? '+' : ''}{costPct.toFixed(1)}% sobre costo</p>
        </div>
        <span className={`text-lg font-bold ${netColor(margen)}`}>${fmtUsd(ganancia)}</span>
      </div>
      <p className="text-[10px] text-neutral-400 px-1">Comisión y envío ajustables en Ajustes. El cambiario es el spread oficial→paralelo.</p>
    </div>
  )
}
