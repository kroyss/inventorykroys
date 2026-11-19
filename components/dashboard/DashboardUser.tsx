'use client'
import { useEffect, useState } from 'react'
import Link from '@/components/ui/Link'
import type { Country } from '@/lib/types'
import BonusPipeline from './BonusPipeline'
import BloquesInicio from './BloquesInicio'
import SalesMiniChart from './SalesMiniChart'
import RateBar from './RateBar'
import Pendientes, { type Pendiente } from './Pendientes'
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

export default function DashboardUser({ country, bonos, importaciones, verificarPagos = true, etapas = true, porConfirmar = false, despachos = false, reportes = false, cayendo = false }: {
  reportes?: boolean         // 14-11: con permiso Reportes (sin costos) ve abajo lo que no muestra plata, del mes
  cayendo?: boolean          // y Reportes → Stock disponible
  despachos?: boolean        // módulo y permiso de Despachos: "Por despachar" lleva ahí (las guías por generar)
  country: Country; bonos: boolean; importaciones: boolean
  porConfirmar?: boolean     // cuentas de ML conectadas: pendiente "Por confirmar"
  verificarPagos?: boolean   // módulo verificar_pagos: sin él (Inventario simple) no hay "Pago verificado" ni "Por descargar"
  etapas?: boolean           // módulo compras_etapas: sin él no hay recepciones en camino
}) {
  const pc = usePorConfirmar(porConfirmar)
  const [summary, setSummary] = useState<Summary | null>(null)
  // null = cargando (así no sale «Nada pendiente» un instante antes de que lleguen los números)
  const [saleCounts, setSaleCounts] = useState<SaleStateCounts | null>(null)
  const [recv, setRecv] = useState<ReceptionCounts | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/summary').then(r => r.json()).then(setSummary)

    // Conteos por estado vienen del endpoint paginado de ventas (campo counts)
    fetch('/api/sales?pageSize=1').then(r => r.json()).then(res => {
      const c = res?.counts
      setSaleCounts({ borrador: c?.BORRADOR ?? 0, verificado: c?.PAGO_VERIFICADO ?? 0, procesada: c?.PROCESADA ?? 0 })
    }).catch(() => setSaleCounts({ borrador: 0, verificado: 0, procesada: 0 }))

    if (etapas) fetch('/api/dashboard/reception-counts').then(r => r.json()).then(c => {
      setRecv(c && typeof c.local === 'number'
        ? { local: c.local, imports: c.imports, imports_boxes: c.imports_boxes, por_finalizar: c.por_finalizar }
        : { local: 0, imports: 0, imports_boxes: 0, por_finalizar: 0 })
    }).catch(() => setRecv({ local: 0, imports: 0, imports_boxes: 0, por_finalizar: 0 }))
  }, [etapas])

  if (!summary) return <div className="p-8 text-neutral-500">Cargando…</div>

  // 19-11 (el dueño: «al usuario normal también mejorarle cómo luce»): mismo Inicio que el completo, sin plata.
  // Lo procesado sigue en Despachos (ahí se generan las guías); sin Despachos, en Ventas.
  const nombreProcesadas = country === 'VE' && (verificarPagos || despachos) ? 'Por despachar' : !verificarPagos ? 'Procesadas' : 'Por descargar'
  const pendientes: Pendiente[] = [
    ...(porConfirmar ? [{ label: 'Por confirmar', n: pc.datos ? pendientesPorConfirmar(pc.datos) : null, tono: 'atencion' as const, href: '/ventas?vista=confirmar', ayuda: 'Ventas de MercadoLibre que todavía no registraste' }] : []),
    { label: 'Borradores', n: saleCounts?.borrador ?? null, tono: 'atencion', href: '/ventas?estado=BORRADOR', ayuda: 'Ventas sin terminar de cargar' },
    { label: nombreProcesadas, n: saleCounts?.procesada ?? null, tono: 'atencion', href: despachos ? '/despachos' : '/ventas?estado=PROCESADA', ayuda: despachos ? 'Ventas procesadas: falta generar la guía en Despachos' : 'Ventas procesadas' },
    // Cada pendiente de recepciones filtra por los MISMOS estados que cuenta /api/dashboard/reception-counts.
    ...(etapas ? [
      { label: 'Por finalizar', n: recv?.por_finalizar ?? null, tono: 'atencion' as const, href: '/compras?tab=local&estado=RECIBIDA,PARCIAL', ayuda: 'Compras recibidas que falta cerrar (locales e importaciones)' },
      { label: 'Compra en camino', n: recv?.local ?? null, tono: 'info' as const, href: '/compras?tab=local&estado=EN_CAMINO', ayuda: 'Compras locales en camino' },
      ...(importaciones ? [{ label: recv && recv.imports_boxes > 0 ? `Importación en camino · ${recv.imports_boxes} cajas` : 'Importación en camino', n: recv?.imports ?? null, tono: 'info' as const, href: '/compras?tab=import&estado=EN_CAMINO', ayuda: 'Importaciones en camino' }] : []),
    ] : []),
  ]

  return (
    <div className="space-y-5">
      <h1 className="sr-only">Inicio</h1>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="order-2 min-w-0 basis-full sm:order-1 sm:flex-1 sm:basis-auto">
          <Pendientes items={pendientes} titulo={false} />
        </div>
        <div className="order-1 flex w-full flex-wrap items-center justify-between gap-2 sm:order-2 sm:w-auto sm:justify-end">
          {country === 'VE' && <RateBar descuento={false} exceso={false} />}
          <Link href="/ventas?new=1" className="btn-primary text-sm whitespace-nowrap">+ Nueva venta</Link>
        </div>
      </div>

      <AvisoStockVerificar n={(summary as { por_verificar?: number }).por_verificar ?? 0} />

      {country === 'VE' && bonos && <BonusPipeline />}

      <SalesMiniChart />

      {reportes && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-500">Este mes</p>
          <BloquesInicio period="month" reportes cayendo={cayendo} />
        </div>
      )}
    </div>
  )
}
