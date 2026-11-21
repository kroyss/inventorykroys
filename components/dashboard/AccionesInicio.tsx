'use client'
import { useEffect, useState } from 'react'
import Link from '@/components/ui/Link'
import RateBar from './RateBar'
import { usePorConfirmar, pendientesPorConfirmar } from '@/components/ventas/PorConfirmar'

// 20-11 (el dueño: «uniformar: un sistema para todas las personas»): el bloque de arriba del Inicio es EL MISMO para el
// admin y el empleado. Cada fila es un área del trabajo diario con sus TAREAS (solo las que tienen algo; se terminan,
// llegan a 0) y su botón para empezar algo nuevo:
// 21-11 (el dueño: «flota sobre el fondo y rompe el diseño»): una tarjeta «Para hoy» como las demás, con la tasa en su
// encabezado y tres columnas iguales: Ventas › [+] · Compras › [+] · Inventario ›. El título lleva a la sección, el «+»
// (con su etiqueta al pasar el mouse) crea algo nuevo y debajo van SOLO las tareas con algo (sin nada: «✓ Al día»).
// Qué sale lo decide lo que puede el USUARIO (módulos de la empresa + permisos), no el rol: el admin que trabaja solo
// ve todo; el empleado, lo suyo. Lo que es estado del inventario (no baja a 0) va en la línea gris, no como tarea.
export interface AccionesInicioConfig {
  country: 'VE' | 'CO'
  ventas: boolean            // ver_ventas: fila Ventas y «+ Nueva venta»
  porConfirmar: boolean      // cuentas de ML + ver_ventas
  despachos: boolean         // módulo + permiso Despachos: «Por despachar» lleva ahí
  verificarPagos: boolean    // sin él (Inventario simple) lo procesado se llama «Procesadas»
  compras: boolean           // ver_compras: columna Compras (21-11: también con Compras básicas)
  comprasEtapas: boolean     // módulo compras_etapas: hay pendientes (por finalizar, en camino). Sin él la compra nace
                             // finalizada («Entró mercancía»): la columna queda «Al día» con su «+»
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
    if (!cfg.compras || !cfg.comprasEtapas) return
    let vivo = true
    fetch('/api/dashboard/reception-counts').then(r => r.ok ? r.json() : Promise.reject()).then(c => {
      if (vivo) setRecv(c && typeof c.local === 'number' ? c : { local: 0, imports: 0, imports_boxes: 0, por_finalizar: 0 })
    }).catch(() => { if (vivo) setRecv({ local: 0, imports: 0, imports_boxes: 0, por_finalizar: 0 }) })
    return () => { vivo = false }
  }, [cfg.compras, cfg.comprasEtapas])

  // Lo procesado sigue en Despachos (ahí se generan las guías); sin Despachos, en Ventas.
  const nombreProcesadas = cfg.despachos || (cfg.country === 'VE' && cfg.verificarPagos) ? 'Por despachar' : !cfg.verificarPagos ? 'Procesadas' : 'Por descargar'
  const itemsVentas: Item[] = [
    ...(cfg.porConfirmar ? [{ k: 'conf', label: 'Por confirmar', n: pc.datos ? pendientesPorConfirmar(pc.datos) : null, href: '/ventas?vista=confirmar', ayuda: 'Ventas de MercadoLibre que todavía no registraste' }] : []),
    { k: 'desp', label: nombreProcesadas, n: ventas?.procesada ?? null, href: cfg.despachos ? '/despachos' : '/ventas?estado=PROCESADA', ayuda: cfg.despachos ? 'Ventas procesadas: falta generar la guía en Despachos' : 'Ventas procesadas' },
    { k: 'borr', label: 'Borradores', n: ventas?.borrador ?? null, href: '/ventas?estado=BORRADOR', ayuda: 'Ventas sin terminar de cargar' },
  ]
  // Cada uno filtra por los MISMOS estados que cuenta /api/dashboard/reception-counts.
  const itemsCompras: Item[] = !cfg.comprasEtapas ? [] : [
    { k: 'fin', label: 'Por finalizar', n: recv?.por_finalizar ?? null, href: '/compras?tab=local&estado=RECIBIDA,PARCIAL', ayuda: 'Compras recibidas que falta cerrar (locales e importaciones)' },
    { k: 'loc', label: 'Compras en camino', n: recv?.local ?? null, href: '/compras?tab=local&estado=EN_CAMINO', ayuda: 'Compras locales en camino', info: true },
    ...(cfg.importaciones ? [{ k: 'imp', label: recv && recv.imports_boxes > 0 ? `Importaciones en camino · ${n0(recv.imports_boxes)} cajas` : 'Importaciones en camino', n: recv?.imports ?? null, href: '/compras?tab=import&estado=EN_CAMINO', ayuda: 'Importaciones en camino', info: true }] : []),
  ]

  // Inventario: estado del stock (no son tareas del día, por eso van sin punto naranja).
  const itemsInventario: Item[] = stock ? [
    { k: 'sin', label: 'Sin stock', n: stock.no_stock, href: '/inventario?estado=SIN_STOCK', ayuda: 'Productos activos en 0', info: true },
    ...(cfg.reponer
      ? [{ k: 'rep', label: 'Por reponer', n: stock.reposicion_count ?? 0, href: '/inventario/reponer?sub=reposicion', ayuda: 'Lo que tienes no alcanza para lo que tarda en llegar', info: true }]
      : [{ k: 'baj', label: 'Stock bajo', n: stock.low_stock_alerts, href: '/inventario?estado=BAJO', ayuda: 'Por debajo del mínimo', info: true }]),
  ] : [{ k: 'sin', label: 'Sin stock', n: null, href: '', ayuda: '' }]

  // Sin etapas, crear una compra es registrar lo que ya llegó: el botón lo dice así, como en Compras.
  const nuevaCompra = cfg.comprasEtapas ? 'Nueva compra' : 'Entró mercancía'
  const columnas = [cfg.ventas, cfg.compras, cfg.inventario].filter(Boolean).length
  if (!columnas && !cfg.tasa) return null
  const gridCls = columnas === 3 ? 'sm:grid-cols-3' : columnas === 2 ? 'sm:grid-cols-2' : ''

  return (
    <section aria-labelledby="hoy-t" className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-4 py-2.5 sm:px-5">
        <h2 id="hoy-t" className="font-semibold text-neutral-900">Para hoy</h2>
        {cfg.tasa && <RateBar {...cfg.tasa} />}
      </div>
      {columnas > 0 && (
        <div className={`grid divide-y divide-neutral-100 sm:divide-x sm:divide-y-0 ${gridCls}`}>
          {cfg.ventas && (
            <Columna titulo="Ventas" href="/ventas" items={itemsVentas} boton={
              <BotonMas etiqueta="Nueva venta" href="/ventas?new=1" />} />
          )}
          {cfg.compras && (
            <Columna titulo="Compras" href="/compras" items={itemsCompras} boton={cfg.comprasEditar ? (
              !cfg.importaciones ? <BotonMas etiqueta={nuevaCompra} href="/compras?new=1" /> : (
                <div className="relative">
                  <BotonMas etiqueta={nuevaCompra} abierto={compraMenu} onClick={() => setCompraMenu(v => !v)} />
                  {compraMenu && <>
                    <div className="fixed inset-0 z-10" onClick={() => setCompraMenu(false)} />
                    <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
                      <Link href="/compras?new=1" className="block px-3 py-2 text-sm hover:bg-neutral-50">{cfg.comprasEtapas ? 'Compra local' : 'Entró mercancía'}</Link>
                      <Link href="/compras?tab=import&new=1" className="block border-t border-neutral-100 px-3 py-2 text-sm hover:bg-neutral-50">Importación</Link>
                    </div>
                  </>}
                </div>
              )) : null} />
          )}
          {cfg.inventario && (
            <Columna titulo="Inventario" href={cfg.reponer ? '/inventario/reponer?sub=reposicion' : '/inventario'} items={itemsInventario} />
          )}
        </div>
      )}
    </section>
  )
}

/** «+» cuadrado de 28 px con su etiqueta al pasar el mouse o con el foco del teclado (en el celular se entiende por
 *  estar al lado del título). Enlace, o botón si abre un menú (Compras con importaciones). */
function BotonMas({ etiqueta, href, onClick, abierto }: { etiqueta: string; href?: string; onClick?: () => void; abierto?: boolean }) {
  const cls = 'inline-flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 shadow-sm transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60'
  const icono = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
  return (
    <span className="group relative inline-flex">
      {href
        ? <Link href={href} aria-label={etiqueta} className={cls}>{icono}</Link>
        : <button type="button" onClick={onClick} aria-label={etiqueta} aria-expanded={abierto} className={cls}>{icono}</button>}
      {!abierto && (
        <span role="tooltip" className="pointer-events-none absolute bottom-full right-0 z-30 mb-1.5 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-sm transition-opacity delay-100 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100">
          {etiqueta}
        </span>
      )}
    </span>
  )
}

/** Una columna: el título lleva a la sección (›), el «+» crea algo nuevo y debajo SOLO las tareas que tienen algo
 *  (el dueño, 21-11: los ceros no se muestran); sin ninguna, «✓ Al día». */
function Columna({ titulo, href, items, boton }: { titulo: string; href: string; items: Item[]; boton?: React.ReactNode }) {
  const cargando = items.some(i => i.n == null)
  const conAlgo = items.filter(i => (i.n ?? 0) > 0)
  return (
    <div className="min-w-0 px-4 py-3 sm:px-5">
      <div className="mb-1.5 flex h-7 items-center justify-between gap-2">
        <Link href={href} className="group/t inline-flex items-center gap-0.5 text-sm font-medium text-neutral-800 hover:text-neutral-950">
          {titulo}<span aria-hidden className="text-neutral-400 transition-transform group-hover/t:translate-x-0.5">›</span>
        </Link>
        {boton}
      </div>
      {conAlgo.length > 0 ? (
        <ul className="-mx-2">
          {conAlgo.map(i => (
            <li key={i.k}>
              <Link href={i.href} title={i.ayuda}
                className="group/f flex items-center justify-between gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-neutral-50">
                <span className="flex min-w-0 items-center gap-2 text-[13px] text-neutral-600">
                  <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${i.info ? 'bg-neutral-300' : 'bg-amber-500'}`} />
                  <span className="truncate">{i.label}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="num text-base font-semibold tabular-nums text-neutral-900">{n0(i.n ?? 0)}</span>
                  <span aria-hidden className="w-2 text-neutral-300 opacity-0 transition-opacity group-hover/f:opacity-100">›</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : cargando ? (
        <div className="space-y-1.5 py-1" aria-hidden>
          <div className="h-5 w-full animate-pulse rounded bg-neutral-100" />
          <div className="h-5 w-3/4 animate-pulse rounded bg-neutral-100" />
        </div>
      ) : (
        <p className="flex items-center gap-1.5 py-1 text-[13px] text-emerald-700">
          <span aria-hidden className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">✓</span>
          Al día
        </p>
      )}
    </div>
  )
}
