'use client'

import { parseShippingTable, shippingThresholdVE, shippingCostVE } from '@/lib/mlShipping'
import { umbralesDe, nivelDe, NIVEL, AYUDA_RENTABILIDAD, type Umbrales } from '@/lib/salud'

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

// 14-11 (el dueño): el resultado se mide en RENTABILIDAD SOBRE COSTO (ganancia ÷ costo del producto), la misma base que el
// recargo: «le sumaste 80 %, te queda 44,7 %; el resto se lo llevan ML y el cambio». Colores con los % de la empresa
// (lib/salud.ts). Misma fórmula que el catálogo, Inicio y Reportes.
const fmtPct = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString('de-DE')} %`

function Resultado({ ganancia, rentab, recargo, u, dinero, quien, compacto }: {
  ganancia: number; rentab: number | null; recargo?: number | null; u: Umbrales; dinero: string; quien: string; compacto?: boolean
}) {
  const n = NIVEL[nivelDe(rentab ?? (ganancia >= 0 ? u.sano : -1), u)]
  const puntos = recargo != null && rentab != null ? recargo - rentab : null
  if (compacto) return (
    <div className={`rounded-lg px-3 py-2 border-2 ${n.fondo}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xl font-bold tabular-nums ${n.texto}`}><span className="mr-1.5 text-xs font-bold uppercase tracking-wide">Te queda</span>{ganancia < 0 ? '−' : ''}${dinero}</span>
        {rentab != null && (
          <span className={`text-right text-xs font-semibold ${n.texto}`} title={AYUDA_RENTABILIDAD}>
            Rentabilidad {fmtPct(rentab)} {n.icono}<span className="cursor-help font-normal text-neutral-400"> ⓘ</span>
          </span>
        )}
      </div>
      {rentab != null && puntos != null && puntos > 0.05 && (
        <p className="mt-0.5 text-[11px] leading-snug text-neutral-600">Le sumaste <b>{fmtPct(recargo!)}</b>, te queda <b>{fmtPct(rentab)}</b>: {(Math.round(puntos * 10) / 10).toLocaleString('de-DE')} puntos se los lleva{quien}.</p>
      )}
    </div>
  )
  return (
    <div className={`rounded-lg p-3 border-2 ${n.fondo} space-y-1.5`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className={`text-sm font-bold uppercase tracking-wide ${n.texto}`}>Te queda</p>
        <span className={`text-2xl font-bold tabular-nums ${n.texto}`}>{ganancia < 0 ? '−' : ''}${dinero}</span>
      </div>
      {rentab != null && <>
        <div className="flex items-baseline justify-between gap-2" title={AYUDA_RENTABILIDAD}>
          <p className="text-xs text-neutral-700">Rentabilidad sobre costo <span className="cursor-help text-neutral-400">ⓘ</span></p>
          <span className={`text-sm font-semibold ${n.texto}`}>{fmtPct(rentab)} · {n.icono} {n.nombre}</span>
        </div>
        <p className="text-[11px] leading-snug text-neutral-600">
          {rentab >= 0
            ? <>Ganas <b>${Math.abs(rentab).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b> por cada $100 que pusiste en mercancía.</>
            : <>Pierdes <b>${Math.abs(rentab).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b> por cada $100 que pusiste en mercancía.</>}
          {puntos != null && puntos > 0.05 && <> Le sumaste <b>{fmtPct(recargo!)}</b> y te queda <b>{fmtPct(rentab)}</b>: los otros {(Math.round(puntos * 10) / 10).toLocaleString('de-DE')} puntos se los lleva{quien}.</>}
        </p>
      </>}
    </div>
  )
}

function Row({ label, value, neg, sub }: { label: string; value: string; neg?: boolean; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-1 py-px">
      <span className="min-w-0 text-neutral-600">
        {label}{sub && <span className="text-neutral-400 text-[10px] ml-1">{sub}</span>}
      </span>
      <span className={`shrink-0 whitespace-nowrap ${neg ? 'text-red-500' : 'text-neutral-800'}`}>{value}</span>
    </div>
  )
}

export interface MlBreakdownProps {
  country: 'VE' | 'CO'
  totalCost: number
  ml: Record<string, string>
  // VE
  finalPriceUsd?: number
  /** Peso del producto (kg): define el mínimo de envío gratis según la tabla de MercadoEnvíos. */
  weightKg?: number | null
  veRate?: { official: number; parallel: number } | null
  priceBs?: number
  // CO
  salePrice?: number   // pesos
  coTrm?: number
  /** Recargo sobre costo (%) del producto, para «le sumaste X %, te queda Y %». Sin él no sale esa frase. */
  recargo?: number | null
  /** 14-11: ficha de solo lectura — filas apretadas, Te queda y rentabilidad en una franja, la nota en el ⓘ. */
  compacto?: boolean
}

export default function MlBreakdown(p: MlBreakdownProps) {
  const u = umbralesDe(p.ml)
  // ───────── Colombia ─────────
  if (p.country === 'CO') {
    const price = p.salePrice ?? 0
    const coTrm = p.coTrm ?? 0
    if (!(price > 0) || !(coTrm > 0)) {
      return <p className="text-xs text-neutral-400 px-1">Carga el precio de venta y la TRM para ver lo que te queda.</p>
    }
    const comisionPct = num(p.ml, 'ml_comision', 15.5)
    const retenPct    = num(p.ml, 'ml_reten', 1.91)
    const umbral      = num(p.ml, 'ml_umbral_envio', 60000)
    const comision    = price * comisionPct / 100
    const envio       = price >= umbral ? num(p.ml, 'ml_envio_alto', 8000) : num(p.ml, 'ml_envio_bajo', 2600)
    const reten       = price * retenPct / 100
    const costoPesos  = p.totalCost * coTrm
    const ganancia    = price - comision - envio - reten - costoPesos
    const rentab      = costoPesos > 0 ? ganancia / costoPesos * 100 : null   // rentabilidad sobre costo
    return (
      <div className="space-y-2">
        <div className="text-sm space-y-0.5">
          {!p.compacto && <p className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Resultado de tu venta</p>}
          <Row label="Precio publicado (pesos)" value={`$${fmtPeso(price)}`} />
          <Row label={`− Comisión MercadoLibre (${comisionPct}%)`} value={`−$${fmtPeso(comision)}`} neg />
          <Row label={`− Envío MercadoLibre (${price >= umbral ? '≥' : '<'} umbral)`} value={`−$${fmtPeso(envio)}`} neg />
          <Row label={`− Retención (${retenPct}%)`} value={`−$${fmtPeso(reten)}`} neg />
          <Row label="− Costo del producto (×TRM)" value={`−$${fmtPeso(costoPesos)}`} neg />
        </div>
        <Resultado ganancia={ganancia} rentab={rentab} recargo={p.recargo} u={u} dinero={fmtPeso(Math.abs(ganancia))} quien="n MercadoLibre y la retención" compacto={p.compacto} />
        {!p.compacto && <p className="text-[10px] text-neutral-400 px-1">Comisión, envío, retención y colores en Productos → Costos ML.</p>}
      </div>
    )
  }

  // ───────── Venezuela ─────────
  const final = p.finalPriceUsd ?? 0
  const rate  = p.veRate
  if (!rate || !(rate.parallel > 0) || !(rate.official > 0) || !(final > 0)) {
    return <p className="text-xs text-neutral-400 px-1">Carga el costo y el precio para ver lo que te queda.</p>
  }
  const comisionPct = num(p.ml, 'ml_comision', 12)
  const realUsd   = final * rate.official / rate.parallel
  const cambiario = final - realUsd
  const comision  = realUsd * comisionPct / 100
  // Envío según el mínimo de envío gratis del rango de peso del producto (tabla
  // de MercadoEnvíos); sin peso, el umbral global de Ajustes.
  const shipTable = parseShippingTable(p.ml?.ml_shipping_table)
  const envioBase = num(p.ml, 'ml_envio', 0.65)
  const umbralG   = num(p.ml, 'ml_umbral', 5)
  const { umbral, porPeso } = shippingThresholdVE(p.weightKg, shipTable, umbralG)
  const envio     = shippingCostVE(final, p.weightKg, shipTable, envioBase, umbralG)
  const neto      = realUsd - comision - envio
  const ganancia  = neto - p.totalCost
  const rentab    = p.totalCost > 0 ? ganancia / p.totalCost * 100 : null   // rentabilidad sobre costo
  return (
    <div className="space-y-2">
      <div className="text-sm space-y-0.5">
        {!p.compacto && <p className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Resultado de tu venta</p>}
        <Row label="Precio final en ML" value={`$${fmtUsd(final)}`} sub={p.priceBs ? `Bs ${fmtPeso(p.priceBs)}` : undefined} />
        <Row label="− Pérdida por cambio (Bs → $)" value={`−$${fmtUsd(cambiario)}`} neg sub="oficial → paralelo" />
        <Row label={`− Comisión MercadoLibre (${comisionPct}%)`} value={`−$${fmtUsd(comision)}`} neg />
        <Row label="− Envío MercadoLibre" value={`−$${fmtUsd(envio)}`} neg
          sub={`gratis desde $${fmtUsd(umbral)}${porPeso ? ' por peso' : ' (sin peso)'}`} />
        <Row label="− Costo del producto" value={`−$${fmtUsd(p.totalCost)}`} neg />
      </div>
      <Resultado ganancia={ganancia} rentab={rentab} recargo={p.recargo} u={u} dinero={fmtUsd(Math.abs(ganancia))} quien="n MercadoLibre y el cambio" compacto={p.compacto} />
      {!p.compacto && <p className="text-[10px] text-neutral-400 px-1">Comisión, envío y colores en Productos → Costos ML. La pérdida por cambio es lo que pierden tus bolívares al pasarlos a dólar paralelo.</p>}
    </div>
  )
}
