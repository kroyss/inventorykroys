'use client'
import { useEffect, useMemo, useState } from 'react'
import { money, int } from '@/components/ui'

export interface HojaRow {
  code: string
  name: string
  quantity: number
  min_stock: number
  max_stock: number
  ventas_6m: number
  total_cost: number
  sale_price: number
  valor_costo: number
  valor_venta: number
  status: 'OK' | 'BAJO' | 'SIN_STOCK'
}

type ColKey =
  | 'code' | 'name' | 'quantity' | 'min_stock' | 'max_stock' | 'ventas_6m'
  | 'total_cost' | 'sale_price' | 'valor_costo' | 'valor_venta' | 'status'
  | 'fisico' | 'diferencia' | 'notas'

interface ColDef {
  key: ColKey
  label: string
  align?: 'left' | 'right' | 'center'
  width?: string          // ancho fijo (clases tailwind) para columnas cortas
  blank?: boolean         // columna en blanco para escribir a mano
  text: (r: HojaRow) => string | number
  excel?: (r: HojaRow) => string | number
  sum?: (r: HojaRow) => number
  xls: number             // ancho de la columna en Excel (caracteres)
  fmt?: 'money' | 'int'   // formato numérico en Excel
}

const STATUS_LABEL: Record<HojaRow['status'], string> = {
  OK: 'OK', BAJO: 'BAJO', SIN_STOCK: 'SIN STOCK',
}

const COLS: ColDef[] = [
  { key: 'code',        label: 'Código',        width: 'w-20',   xls: 12, text: r => r.code },
  { key: 'name',        label: 'Producto',                       xls: 48, text: r => r.name },
  { key: 'quantity',    label: 'Stock sistema', align: 'right',  width: 'w-16', xls: 13, fmt: 'int',   text: r => r.quantity, sum: r => r.quantity },
  { key: 'fisico',      label: 'Stock físico',  align: 'center', width: 'w-24', xls: 13, blank: true, text: () => '' },
  { key: 'diferencia',  label: 'Diferencia',    align: 'center', width: 'w-20', xls: 12, blank: true, text: () => '' },
  { key: 'notas',       label: 'Notas',         align: 'left',   width: 'w-40', xls: 30, blank: true, text: () => '' },
  { key: 'min_stock',   label: 'Mín',           align: 'right',  width: 'w-12', xls: 7,  fmt: 'int',   text: r => r.min_stock },
  { key: 'max_stock',   label: 'Máx',           align: 'right',  width: 'w-12', xls: 7,  fmt: 'int',   text: r => r.max_stock },
  { key: 'ventas_6m',   label: 'Ventas 6m',     align: 'right',  width: 'w-16', xls: 11, fmt: 'int',   text: r => r.ventas_6m, sum: r => r.ventas_6m },
  { key: 'total_cost',  label: 'Costo unit.',   align: 'right',  width: 'w-20', xls: 12, fmt: 'money', text: r => money(r.total_cost),  excel: r => r.total_cost },
  { key: 'sale_price',  label: 'P. venta',      align: 'right',  width: 'w-20', xls: 12, fmt: 'money', text: r => money(r.sale_price),  excel: r => r.sale_price },
  { key: 'valor_costo', label: 'Valor costo',   align: 'right',  width: 'w-24', xls: 14, fmt: 'money', text: r => money(r.valor_costo), excel: r => r.valor_costo, sum: r => r.valor_costo },
  { key: 'valor_venta', label: 'Valor venta',   align: 'right',  width: 'w-24', xls: 14, fmt: 'money', text: r => money(r.valor_venta), excel: r => r.valor_venta, sum: r => r.valor_venta },
  { key: 'status',      label: 'Estado',        align: 'center', width: 'w-20', xls: 11, text: r => STATUS_LABEL[r.status] },
]

const PRESETS: { label: string; cols: ColKey[] }[] = [
  { label: 'Conteo físico', cols: ['name', 'quantity', 'fisico'] },
  { label: 'Conteo + notas', cols: ['code', 'name', 'quantity', 'fisico', 'diferencia', 'notas'] },
  { label: 'Valuación',      cols: ['code', 'name', 'quantity', 'total_cost', 'sale_price', 'valor_costo', 'valor_venta'] },
  { label: 'Reposición',     cols: ['code', 'name', 'quantity', 'min_stock', 'max_stock', 'ventas_6m', 'status'] },
  { label: 'Todo',           cols: COLS.map(c => c.key) },
]

type Filtro = 'todos' | 'con_stock' | 'sin_stock' | 'bajo'
const FILTROS: { val: Filtro; label: string }[] = [
  { val: 'todos',     label: 'Todos' },
  { val: 'con_stock', label: 'Con stock' },
  { val: 'sin_stock', label: 'Sin stock' },
  { val: 'bajo',      label: 'Stock bajo' },
]

type Orden = 'name' | 'code' | 'quantity_desc' | 'valor_venta_desc'
const ORDENES: { val: Orden; label: string }[] = [
  { val: 'name',             label: 'Nombre (A-Z)' },
  { val: 'code',             label: 'Código' },
  { val: 'quantity_desc',    label: 'Stock (mayor primero)' },
  { val: 'valor_venta_desc', label: 'Valor venta (mayor primero)' },
]

const LS_KEY = 'hoja-inventario-config'

// Nombre de archivo a partir del título de la hoja.
const slug = (s: string) =>
  s.normalize('NFD').replace(/[^\x20-\x7E]/g, '')   // sin acentos ni símbolos raros
   .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

interface Props {
  items: HojaRow[]
  country: 'VE' | 'CO'
  fecha: string
}

export default function HojaInventario({ items, country, fecha }: Props) {
  const [cols,      setCols]      = useState<ColKey[]>(PRESETS[0].cols)
  const [filtro,    setFiltro]    = useState<Filtro>('todos')
  const [orden,     setOrden]     = useState<Orden>('name')
  const [horizontal, setHorizontal] = useState(false)
  const [titulo,    setTitulo]    = useState('Conteo físico de inventario')
  const [loaded,    setLoaded]    = useState(false)

  // La configuración se recuerda en el navegador para no re-armarla cada vez.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) {
        const c = JSON.parse(raw)
        if (Array.isArray(c.cols) && c.cols.length) setCols(c.cols)
        if (c.filtro)     setFiltro(c.filtro)
        if (c.orden)      setOrden(c.orden)
        if (c.titulo)     setTitulo(c.titulo)
        setHorizontal(!!c.horizontal)
      }
    } catch { /* config corrupta: se ignora */ }
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    localStorage.setItem(LS_KEY, JSON.stringify({ cols, filtro, orden, horizontal, titulo }))
  }, [loaded, cols, filtro, orden, horizontal, titulo])

  const toggleCol = (k: ColKey) =>
    setCols(prev => prev.includes(k) ? prev.filter(c => c !== k) : [...prev, k])

  // El orden de las columnas en la hoja es el de COLS, no el de selección.
  const activeCols = useMemo(() => COLS.filter(c => cols.includes(c.key)), [cols])

  const rows = useMemo(() => {
    let r = items
    if (filtro === 'con_stock') r = r.filter(i => i.quantity > 0)
    if (filtro === 'sin_stock') r = r.filter(i => i.quantity === 0)
    if (filtro === 'bajo')      r = r.filter(i => i.status === 'BAJO')
    const sorted = [...r]
    sorted.sort((a, b) => {
      if (orden === 'code')             return a.code.localeCompare(b.code)
      if (orden === 'quantity_desc')    return b.quantity - a.quantity
      if (orden === 'valor_venta_desc') return b.valor_venta - a.valor_venta
      return a.name.localeCompare(b.name)
    })
    return sorted
  }, [items, filtro, orden])

  const totales = useMemo(() => {
    const t: Partial<Record<ColKey, number>> = {}
    activeCols.forEach(c => { if (c.sum) t[c.key] = rows.reduce((s, r) => s + c.sum!(r), 0) })
    return t
  }, [activeCols, rows])
  const hayTotales = activeCols.some(c => c.sum)

  // Excel con las MISMAS columnas elegidas: anchos por columna, números como
  // números (con formato), fila de totales y autofiltro en el encabezado.
  const exportExcel = async () => {
    if (rows.length === 0 || activeCols.length === 0) return
    const XLSX = await import('xlsx')

    const aoa: (string | number)[][] = [activeCols.map(c => c.label)]
    rows.forEach(r => {
      aoa.push(activeCols.map(c => (c.blank ? '' : (c.excel ? c.excel(r) : c.text(r)))))
    })
    if (hayTotales) {
      aoa.push(activeCols.map((c, i) =>
        c.sum ? Math.round((totales[c.key] ?? 0) * 100) / 100 : (i === 0 ? 'TOTAL' : '')
      ))
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = activeCols.map(c => ({ wch: c.xls }))
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: activeCols.length - 1 } }),
    }
    activeCols.forEach((c, ci) => {
      if (!c.fmt) return
      for (let ri = 1; ri < aoa.length; ri++) {
        const cell = ws[XLSX.utils.encode_cell({ r: ri, c: ci })]
        if (cell && typeof cell.v === 'number') {
          cell.t = 'n'
          cell.z = c.fmt === 'money' ? '#,##0.00' : '#,##0'
        }
      }
    })

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
    XLSX.writeFile(wb, `${slug(titulo) || 'inventario'}_${fecha}.xlsx`)
  }

  return (
    <div className="hoja-root min-h-screen bg-neutral-100 print:bg-white">
      <style>{`
        @media print {
          /* Márgenes mínimos: se aprovecha casi toda la hoja */
          @page { size: A4 ${horizontal ? 'landscape' : 'portrait'}; margin: 6mm; }
          .no-print { display: none !important; }
          body { background: white !important; }
          /* Las extensiones del navegador (buscadores de imágenes, traductores,
             etc.) inyectan botones flotantes en el <body> y salen impresos:
             en impresión solo se muestra la hoja. */
          body > *:not(.hoja-root) { display: none !important; }
          .hoja { font-size: 10px; }
          .hoja tr { break-inside: avoid; }
          /* El encabezado de la tabla se repite en cada hoja */
          .hoja thead { display: table-header-group; }
          .hoja td, .hoja th { padding-top: 2px !important; padding-bottom: 2px !important; }
        }
      `}</style>

      {/* Panel de configuración — no sale en la impresión */}
      <div className="no-print bg-white border-b border-neutral-200 shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <h1 className="font-semibold text-neutral-800">
            Hoja de inventario · {country} · {rows.length} productos
          </h1>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Descargar en</span>
            <button onClick={() => window.print()} disabled={activeCols.length === 0}
              title="Abre el diálogo de impresión: elegí “Guardar como PDF” o mandalo a la impresora"
              className="px-4 py-1.5 bg-neutral-900 text-white text-sm rounded hover:bg-neutral-700 disabled:opacity-40">
              🖨 PDF
            </button>
            <button onClick={exportExcel} disabled={rows.length === 0 || activeCols.length === 0}
              title="Descarga un .xlsx con exactamente las columnas elegidas"
              className="px-4 py-1.5 bg-white border border-neutral-300 text-neutral-700 text-sm rounded hover:bg-neutral-100 disabled:opacity-40">
              ↓ Excel
            </button>
            <button onClick={() => window.close()}
              className="px-4 py-1.5 bg-white border border-neutral-300 text-neutral-700 text-sm rounded hover:bg-neutral-100">
              Cerrar
            </button>
          </div>
        </div>

        <div className="px-4 pb-3 space-y-2.5 text-sm">
          {/* Presets */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-neutral-500 w-20">Plantilla</span>
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => setCols(p.cols)}
                className="px-2.5 py-1 text-xs border border-neutral-300 rounded-lg text-neutral-700 hover:bg-neutral-100">
                {p.label}
              </button>
            ))}
          </div>

          {/* Columnas */}
          <div className="flex items-start gap-2 flex-wrap">
            <span className="text-xs text-neutral-500 w-20 pt-1">Columnas</span>
            <div className="flex gap-1.5 flex-wrap flex-1">
              {COLS.map(c => {
                const on = cols.includes(c.key)
                return (
                  <button key={c.key} onClick={() => toggleCol(c.key)}
                    title={c.blank ? 'Columna en blanco para llenar a mano' : undefined}
                    className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                      on ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-100'
                    }`}>
                    {c.label}{c.blank && ' ✎'}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Filtro · orden · orientación · título */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-neutral-500 w-20">Productos</span>
            <select value={filtro} onChange={e => setFiltro(e.target.value as Filtro)}
              className="border border-neutral-300 rounded-lg px-2 py-1 text-xs">
              {FILTROS.map(f => <option key={f.val} value={f.val}>{f.label}</option>)}
            </select>
            <select value={orden} onChange={e => setOrden(e.target.value as Orden)}
              className="border border-neutral-300 rounded-lg px-2 py-1 text-xs">
              {ORDENES.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-neutral-700">
              <input type="checkbox" checked={horizontal} onChange={e => setHorizontal(e.target.checked)} />
              Horizontal
            </label>
            <input value={titulo} onChange={e => setTitulo(e.target.value)}
              placeholder="Título de la hoja"
              className="border border-neutral-300 rounded-lg px-2 py-1 text-xs flex-1 min-w-[180px]" />
          </div>
        </div>
      </div>

      {/* Área de impresión */}
      <div className="hoja max-w-5xl mx-auto bg-white p-6 my-6 shadow-sm print:shadow-none print:my-0 print:p-0 print:max-w-none">
        <div className="flex justify-between items-end border-b-2 border-neutral-900 pb-1.5 mb-2">
          <div>
            <h1 className="text-lg font-bold tracking-tight leading-tight">
              {titulo || 'Inventario'} · {country}
            </h1>
            <p className="text-[11px] text-neutral-600">
              {rows.length} productos · {int(rows.reduce((s, r) => s + r.quantity, 0))} unidades en sistema · Generado {fecha}
            </p>
          </div>
          <div className="text-[11px] text-right leading-tight">
            <div>Realizado por: <span className="inline-block border-b border-neutral-400 w-40">&nbsp;</span></div>
            <div className="mt-1">Fecha: <span className="inline-block border-b border-neutral-400 w-40">&nbsp;</span></div>
          </div>
        </div>

        {activeCols.length === 0 ? (
          <p className="text-sm text-neutral-400 py-6 text-center">Elegí al menos una columna.</p>
        ) : (
          <table className="w-full text-xs border-collapse border border-neutral-400">
            <thead>
              <tr className="bg-neutral-100">
                <th className="border border-neutral-400 px-1.5 py-1 text-left w-8">#</th>
                {activeCols.map(c => (
                  <th key={c.key}
                    className={`border border-neutral-400 px-1.5 py-1 ${c.width ?? ''} ${
                      c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'
                    }`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={r.code}>
                  <td className="border border-neutral-400 px-1.5 py-1 text-neutral-500">{idx + 1}</td>
                  {activeCols.map(c => (
                    <td key={c.key}
                      className={`border border-neutral-400 px-1.5 py-1 ${
                        c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'
                      } ${c.key === 'quantity' ? 'font-semibold' : ''} ${c.key === 'code' ? 'font-mono' : ''}`}>
                      {c.blank ? ' ' : c.text(r)}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={activeCols.length + 1} className="border border-neutral-400 px-1.5 py-3 text-center text-neutral-400">
                    Sin productos
                  </td>
                </tr>
              )}
              {hayTotales && rows.length > 0 && (
                <tr className="bg-neutral-100 font-semibold">
                  <td className="border border-neutral-400 px-1.5 py-1" />
                  {activeCols.map((c, i) => (
                    <td key={c.key}
                      className={`border border-neutral-400 px-1.5 py-1 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                      {c.sum
                        ? (c.key === 'quantity' || c.key === 'ventas_6m' ? int(totales[c.key] ?? 0) : money(totales[c.key] ?? 0))
                        : (i === 0 ? 'TOTAL' : '')}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        )}

        {cols.includes('fisico') && (
          <p className="mt-1.5 text-[10px] text-neutral-500">
            Anote el conteo real en “Stock físico”. Solo las filas con diferencia se ajustan en el sistema (Inventario → Ajustar stock).
          </p>
        )}
      </div>
    </div>
  )
}
