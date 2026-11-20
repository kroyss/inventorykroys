'use client'
import { useEffect, useState } from 'react'
import Link from '@/components/ui/Link'
import RateBar from './RateBar'
import { usePorConfirmar, pendientesPorConfirmar } from '@/components/ventas/PorConfirmar'

// 20-11 (el dueño: «uniformar: un sistema para todas las personas»): el bloque de arriba del Inicio es EL MISMO para el
// admin y el empleado. Cada fila es un área del trabajo diario con sus TAREAS (solo las que tienen algo; se terminan,
// llegan a 0) y su botón para empezar algo nuevo:
//   Ventas    Por confirmar › Por despachar › Borradores                [+ Nueva venta]
//   Compras   Por finalizar · Compras en camino · Importaciones · cajas [+ Nueva compra]
//   Inventario: N sin stock · N por reponer · Ver en Reponer →          Bs/$ 919 · 1.066 · 16%
// Qué sale lo decide lo que puede el USUARIO (módulos de la empresa + permisos), no el rol: el admin que trabaja solo
// ve todo; el empleado, lo suyo. Lo que es estado del inventario (no baja a 0) va en la línea gris, no como tarea.
export interface AccionesInicioConfig {
  country: 'VE' | 'CO'
  ventas: boolean            // ver_ventas: fila Ventas y «+ Nueva venta»
  porConfirmar: boolean      // cuentas de ML + ver_ventas
  despachos: boolean         // módulo + permiso Despachos: «Por despachar» lleva ahí
  verificarPagos: boolean    // sin él (Inventario simple) lo procesado se llama «Procesadas»
  compras: boolean           // ver_compras + módulo compras_etapas: fila Compras
  comprasEditar: boolean     // compras_editar: «+ Nueva compra»
  importaciones: boolean
  inventario: boolean        // ver_inventario: línea gris
  reponer: boolean           // módulo analisis_stock: «por reponer» y el enlace a Reponer
  tasa: { puedeActualizar: boolean; descuento: boolean; exceso: boolean; ajustes: boolean } | null   // solo VE
}
interface Stock { no_stock: number; reposicion_count?: number; low_stock_alerts: number }
interface Item { k: string; label: string; n: number | null; href: string; ayuda: string; info?: boolean }

const n0 = (n: number) => n.toLocaleString('es-VE')

export default function AccionesInicio({ cfg, stock }: { cfg: AccionesInicioConfig; stock: Stock | null }) {
  const pc = usePorConfirmar(cfg.porConfirmar)
  const [ventas, setVentas] = useState<{ borrador: number; procesada: number } | null>(null)
  const [recv, setRecv] = useState<{ local: number; imports: number; imports_boxes: number; por_finalizar: number } | null>(null)
  const [compraMenu, setCompraMenu] = useState(false)

  useEffect(() => {
    if (!cfg.ventas) return
    let vivo = true
    fetch('/api/sales?pageSize=1').then(r => r.ok ? r.json() : Promise.reject()).then(j => {
      if (vivo) setVentas({ borrador: j?.counts?.BORRADOR ?? 0, procesada: j?.counts?.PROCESADA ?? 0 })
    }).catch(() => { if (vivo) setVentas({ borrador: 0, procesada: 0 }) })
    return () => { vivo = false }
  }, [cfg.ventas])

  useEffect(() => {
    if (!cfg.compras) return
    let vivo = true
    fetch('/api/dashboard/reception-counts').then(r => r.ok ? r.json() : Promise.reject()).then(c => {
      if (vivo) setRecv(c && typeof c.local === 'number' ? c : { local: 0, imports: 0, imports_boxes: 0, por_finalizar: 0 })
    }).catch(() => { if (vivo) setRecv({ local: 0, imports: 0, imports_boxes: 0, por_finalizar: 0 }) })
    return () => { vivo = false }
  }, [cfg.compras])

  // Lo procesado sigue en Despachos (ahí se generan las guías); sin Despachos, en Ventas.
  const nombreProcesadas = cfg.despachos || (cfg.country === 'VE' && cfg.verificarPagos) ? 'Por despachar' : !cfg.verificarPagos ? 'Procesadas' : 'Por descargar'
  const itemsVentas: Item[] = [
    ...(cfg.porConfirmar ? [{ k: 'conf', label: 'Por confirmar', n: pc.datos ? pendientesPorConfirmar(pc.datos) : null, href: '/ventas?vista=confirmar', ayuda: 'Ventas de MercadoLibre que todavía no registraste' }] : []),
    { k: 'desp', label: nombreProcesadas, n: ventas?.procesada ?? null, href: cfg.despachos ? '/despachos' : '/ventas?estado=PROCESADA', ayuda: cfg.despachos ? 'Ventas procesadas: falta generar la guía en Despachos' : 'Ventas procesadas' },
    { k: 'borr', label: 'Borradores', n: ventas?.borrador ?? null, href: '/ventas?estado=BORRADOR', ayuda: 'Ventas sin terminar de cargar' },
  ]
  // Cada uno filtra por los MISMOS estados que cuenta /api/dashboard/reception-counts.
  const itemsCompras: Item[] = [
    { k: 'fin', label: 'Por finalizar', n: recv?.por_finalizar ?? null, href: '/compras?tab=local&estado=RECIBIDA,PARCIAL', ayuda: 'Compras recibidas que falta cerrar (locales e importaciones)' },
    { k: 'loc', label: 'Compras en camino', n: recv?.local ?? null, href: '/compras?tab=local&estado=EN_CAMINO', ayuda: 'Compras locales en camino', info: true },
    ...(cfg.importaciones ? [{ k: 'imp', label: recv && recv.imports_boxes > 0 ? `Importaciones en camino · ${n0(recv.imports_boxes)} cajas` : 'Importaciones en camino', n: recv?.imports ?? null, href: '/compras?tab=import&estado=EN_CAMINO', ayuda: 'Importaciones en camino', info: true }] : []),
  ]

  const stockTxt = cfg.inventario && stock ? [
    stock.no_stock > 0 && `${n0(stock.no_stock)} sin stock`,
    cfg.reponer && (stock.reposicion_count ?? 0) > 0 && `${n0(stock.reposicion_count ?? 0)} por reponer`,
    !cfg.reponer && stock.low_stock_alerts > 0 && `${n0(stock.low_stock_alerts)} con stock bajo`,
  ].filter(Boolean) as string[] : []

  return (
    <section aria-label="Lo de hoy" className="space-y-2">
      {cfg.ventas && (
        <Fila titulo="Ventas" items={itemsVentas} flujo boton={
          <Link href="/ventas?new=1" className="btn-primary whitespace-nowrap px-3 py-1.5 text-sm">
            + <span className="hidden sm:inline">Nueva venta</span><span className="sm:hidden">Venta</span>
          </Link>} />
      )}
      {cfg.compras && (
        <Fila titulo="Compras" items={itemsCompras} boton={cfg.comprasEditar ? (
          !cfg.importaciones ? (
            <Link href="/compras?new=1" className="btn-secondary whitespace-nowrap px-3 py-1.5 text-sm">
              + <span className="hidden sm:inline">Nueva compra</span><span className="sm:hidden">Compra</span>
            </Link>
          ) : (
            <div className="relative">
              <button type="button" onClick={() => setCompraMenu(v => !v)} aria-expanded={compraMenu} className="btn-secondary whitespace-nowrap px-3 py-1.5 text-sm">
                + <span className="hidden sm:inline">Nueva compra</span><span className="sm:hidden">Compra</span> ▾
              </button>
              {compraMenu && <>
                <div className="fixed inset-0 z-10" onClick={() => setCompraMenu(false)} />
                <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
                  <Link href="/compras?new=1" className="block px-3 py-2 text-sm hover:bg-neutral-50">Compra local</Link>
                  <Link href="/compras?tab=import&new=1" className="block border-t border-neutral-100 px-3 py-2 text-sm hover:bg-neutral-50">Importación</Link>
                </div>
              </>}
            </div>
          )) : null} />
      )}
      {(stockTxt.length > 0 || cfg.tasa) && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 pt-0.5">
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-neutral-500">
            {stockTxt.length > 0 && <>
              <span>Inventario: <span className="num">{stockTxt.join(' · ')}</span></span>
              <Link href={cfg.reponer ? '/inventario/reponer?sub=reposicion' : '/inventario?estado=SIN_STOCK'}
                className="font-medium text-sky-700 hover:underline">{cfg.reponer ? 'Ver en Reponer →' : 'Ver en Inventario →'}</Link>
            </>}
          </p>
          {cfg.tasa && <RateBar {...cfg.tasa} />}
        </div>
      )}
    </section>
  )
}

/** Una fila: título fijo, las tareas con algo dentro de un solo recuadro (› marca el orden del flujo) y su botón. */
function Fila({ titulo, items, boton, flujo = false }: { titulo: string; items: Item[]; boton: React.ReactNode; flujo?: boolean }) {
  const cargando = items.some(i => i.n == null)
  const conAlgo = items.filter(i => (i.n ?? 0) > 0)
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <span className="w-16 shrink-0 text-xs font-medium text-neutral-500 sm:w-[4.5rem]">{titulo}</span>
      <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]">
        {conAlgo.length > 0 ? (
          <div className="inline-flex items-stretch whitespace-nowrap rounded-lg border border-neutral-200 bg-white shadow-sm">
            {conAlgo.map((i, x) => (
              <span key={i.k} className="inline-flex items-center">
                {x > 0 && (flujo
                  ? <span aria-hidden className="px-0.5 text-xs text-neutral-300">›</span>
                  : <span aria-hidden className="h-4 w-px bg-neutral-200" />)}
                <Link href={i.href} title={i.ayuda}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-colors hover:bg-neutral-50">
                  <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${i.info ? 'bg-neutral-400' : 'bg-amber-500'}`} />
                  <span className="text-[13px] text-neutral-600">{i.label}</span>
                  <span className="num text-sm font-semibold tabular-nums text-neutral-900">{n0(i.n ?? 0)}</span>
                </Link>
              </span>
            ))}
          </div>
        ) : cargando ? (
          <span className="inline-block h-7 w-48 max-w-full animate-pulse rounded-lg bg-neutral-100 align-middle" aria-hidden />
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
            <span aria-hidden className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">✓</span>
            Al día
          </span>
        )}
      </div>
      {boton && <div className="shrink-0">{boton}</div>}
    </div>
  )
}
