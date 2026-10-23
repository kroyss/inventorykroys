'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Country } from '@/lib/types'
import BonusPipeline from './BonusPipeline'
import SalesMiniChart from './SalesMiniChart'
import { parseLocalDate } from '@/lib/tz'
import AvisoStockVerificar from './AvisoStockVerificar'
import { usePorConfirmar, pendientesPorConfirmar } from '@/components/ventas/PorConfirmar'

interface Summary {
  active_products: number
  sales_count_month: number
  sales_amount_month: number
  low_stock_alerts: number
  no_stock: number
  pending_sales: number
  in_transit: number
}

interface SaleStateCounts {
  borrador: number
  verificado: number
  procesada: number
}

interface ReceptionCounts {
  local: number
  imports: number
  imports_boxes: number
  por_finalizar: number
}

interface Rate {
  official_rate: number
  parallel_rate: number
  spread_percentage: number
  rate_date: string | null
}

const fmt = (n: number) =>
  Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })

export default function DashboardUser({ country, bonos, importaciones, verificarPagos = true, etapas = true, porConfirmar = false, despachos = false }: {
  despachos?: boolean        // módulo y permiso de Despachos: "Por descargar" lleva ahí (las guías por generar)
  country: Country; bonos: boolean; importaciones: boolean
  porConfirmar?: boolean     // cuentas de ML conectadas: tarjeta "Por confirmar" (lo normal) antes de "Nueva venta"
  verificarPagos?: boolean   // módulo verificar_pagos: sin él (Inventario simple) no hay "Pago verificado" ni "Por descargar"
  etapas?: boolean           // módulo compras_etapas: sin él no hay recepciones en camino
}) {
  const pc = usePorConfirmar(porConfirmar)
  const pendientesPC = pendientesPorConfirmar(pc.datos)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [saleCounts, setSaleCounts] = useState<SaleStateCounts>({ borrador: 0, verificado: 0, procesada: 0 })
  const [recv, setRecv] = useState<ReceptionCounts>({ local: 0, imports: 0, imports_boxes: 0, por_finalizar: 0 })
  const [rate, setRate] = useState<Rate | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/summary').then(r => r.json()).then(setSummary)

    // Conteos por estado vienen del endpoint paginado de ventas (campo counts)
    fetch('/api/sales?pageSize=1').then(r => r.json()).then(res => {
      const c = res?.counts
      if (c) setSaleCounts({
        borrador:   c.BORRADOR ?? 0,
        verificado: c.PAGO_VERIFICADO ?? 0,
        procesada:  c.PROCESADA ?? 0,
      })
    })

    fetch('/api/dashboard/reception-counts').then(r => r.json()).then(c => {
      if (c && typeof c.local === 'number') {
        setRecv({
          local:         c.local,
          imports:       c.imports,
          imports_boxes: c.imports_boxes,
          por_finalizar: c.por_finalizar,
        })
      }
    })

    if (country === 'VE') {
      fetch('/api/rates/latest').then(r => r.json()).then(setRate)
    }
  }, [country])

  if (!summary) return <div className="p-8 text-neutral-500">Cargando…</div>

  return (
    <div className="space-y-4">
      <AvisoStockVerificar n={(summary as { por_verificar?: number }).por_verificar ?? 0} />
      {/* ───────── Ventas ───────── */}
      <Panel title="Ventas">
        {/* Todas iguales (borde gris): "Nueva venta" se distingue por el + verde y "Por confirmar" por su número ámbar. */}
        <div className={`grid grid-cols-2 gap-3 ${porConfirmar ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
          {porConfirmar && (
            <StatCard label="Por confirmar" value={pc.datos ? pendientesPC : '·'}
              accent="text-amber-600" href="/ventas?vista=confirmar" />
          )}
          <StatCard label="Nueva venta" value="+" accent="text-green-600" href="/ventas?new=1" />
          <StatCard label="Borrador"        value={saleCounts.borrador}
            accent={saleCounts.borrador   > 0 ? 'text-amber-600' : undefined}
            href="/ventas?estado=BORRADOR" />
          {/* Lo procesado sigue en Despachos (ahí se generan las guías); sin Despachos, en Ventas. */}
          <StatCard label={!verificarPagos ? 'Procesadas' : country === 'VE' ? 'Por despachar' : 'Por descargar'} value={saleCounts.procesada}
            accent={saleCounts.procesada  > 0 ? 'text-green-600' : undefined}
            href={despachos ? '/despachos' : '/ventas?estado=PROCESADA'} />
        </div>
        {country === 'VE' && bonos && (
          <div className="mt-4">
            <BonusPipeline />
          </div>
        )}
      </Panel>

      {/* ───────── Recepciones (solo con compras por etapas) ───────── */}
      {etapas && <Panel title="Recepciones">
        <div className={`grid grid-cols-1 gap-3 ${importaciones ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
          {/* Cada card filtra por los MISMOS estados que cuenta (ver
              /api/dashboard/reception-counts), para que la lista de destino
              muestre exactamente las órdenes del número. */}
          <StatCard label="Local en camino"  value={recv.local}
            accent={recv.local   > 0 ? 'text-neutral-900' : undefined}
            href="/compras?tab=local&estado=EN_CAMINO" />
          {importaciones && <StatCard label={`Import en camino${recv.imports_boxes > 0 ? ` · ${recv.imports_boxes} cajas` : ''}`} value={recv.imports}
            accent={recv.imports > 0 ? 'text-neutral-900' : undefined}
            href="/compras?tab=import&estado=EN_CAMINO" />}
          {/* "Por finalizar" suma locales + importaciones: abre en locales y el
              mismo filtro queda aplicado al cambiar de pestaña. */}
          <StatCard label="Por finalizar"    value={recv.por_finalizar}
            accent={recv.por_finalizar > 0 ? 'text-amber-600' : undefined}
            href="/compras?tab=local&estado=RECIBIDA,PARCIAL" />
        </div>
      </Panel>}

      {/* ───────── Gráfico ventas del mes ───────── */}
      <SalesMiniChart />

      {/* ───────── Tasas (VE) ───────── */}
      {country === 'VE' && rate && (
        <Panel title="Tasas de Cambio">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <RateCard label="Oficial BCV" value={fmt(rate.official_rate)}    sub="Bs/$"   accent="text-neutral-900" />
            <RateCard label="Paralelo"    value={fmt(rate.parallel_rate)}    sub="Bs/$"   accent="text-amber-600" />
            <RateCard label="Diferencial" value={`${rate.spread_percentage}%`} sub="spread" accent="text-amber-600" />
          </div>
          {rate.rate_date && (
            <div className="text-right text-xs text-neutral-400 mt-3">
              Actualizado: {parseLocalDate(rate.rate_date).toLocaleDateString('es-VE')}
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}

// ─── helpers ───
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
      <h2 className="text-sm font-semibold text-neutral-700 mb-3">
        {title}
      </h2>
      {children}
    </section>
  )
}

function StatCard({ label, value, accent, href }: {
  label: string; value: number | string; accent?: string; href?: string
}) {
  const inner = (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 text-center hover:border-neutral-400 hover:shadow-sm transition">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${accent ?? 'text-neutral-900'}`}>{value}</div>
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

function RateCard({ label, value, sub, accent }: {
  label: string; value: string; sub: string; accent?: string
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 text-center">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`text-xl font-bold mt-1 ${accent ?? 'text-neutral-900'}`}>{value}</div>
      <div className="text-[11px] text-neutral-400 mt-0.5">{sub}</div>
    </div>
  )
}
