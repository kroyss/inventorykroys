'use client'
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { bs, MAX_INVOICE_LINES } from '@/lib/invoices'

/**
 * Hoja de factura en forma libre: réplica 1:1 de la plantilla de Excel "FACTURA NNNN.xls".
 *
 * Todas las coordenadas están en PUNTOS del Excel (Columns.Width / Rows.Top leídos por COM)
 * y se transforman igual que lo hace Excel al imprimir:
 *   A4 vertical · márgenes izq 2,0 cm / sup 2,5 cm · zoom 90 %.
 * Original (filas 6–25) y copia (filas 41–60) van en la misma hoja; la copia está 417,75 pt
 * más abajo (medido fila a fila; el texto va anclado abajo como en Excel).
 * Si la impresora corre la hoja, se calibra con offset_x/offset_y (mm) en Configuración; si
 * además la copia queda corrida respecto del original, copyOffX/copyOffY la mueven solo a ella.
 */

const ZOOM = 0.9
const MARGIN_LEFT_PT = 56.6929   // 2,0 cm
const MARGIN_TOP_PT  = 70.8661   // 2,5 cm
const PT_PER_MM = 72 / 25.4
const COPY_OFFSET_PT = 417.75
const CELL_PAD_PT = 1.6          // relleno horizontal de celda de Excel (~2 px)
const BORDER_PT = 0.6            // línea fina (xlThin)

// Bordes izquierdos de columna (pt, sin zoom). B..H; I = borde derecho de H.
const COL = { B: 37.5, C: 118.5, D: 185.25, E: 244.5, F: 291, G: 368.25, H: 380.25, I: 431.25 }
// Top y alto de cada fila del original (pt, sin zoom).
const ROW: Record<number, [number, number]> = {
  6: [63.75, 11.25], 7: [75, 12.75], 8: [87.75, 12.75], 9: [100.5, 12.75], 10: [113.25, 12.75],
  11: [126, 12.75], 12: [138.75, 12.75], 13: [151.5, 2.25], 14: [153.75, 12.75], 15: [166.5, 11.25],
  16: [177.75, 11.25], 17: [189, 11.25], 18: [200.25, 11.25], 19: [211.5, 11.25], 20: [222.75, 11.25],
  21: [234, 11.25], 22: [245.25, 11.25], 23: [256.5, 11.25], 24: [267.75, 11.25], 25: [279, 11.25],
}
const FIRST_ITEM_ROW = 16   // la fila 15 queda en blanco (así estaba la plantilla)

export interface PrintableInvoice {
  invoice_number: number
  invoice_date: string          // YYYY-MM-DD
  customer_name: string
  customer_doc: string | null
  customer_address: string | null
  customer_phone: string | null
  iva_rate: number
  base_bs: number
  iva_bs: number
  total_bs: number
  status?: string
  items: { description: string; quantity: number; unit_price_bs: number; total_bs: number }[]
}

/** d/mm/yyyy — mismo formato de celda que el Excel (G7). */
const excelDate = (ymd: string) => {
  const [y, m, d] = ymd.slice(0, 10).split('-')
  return `${parseInt(d, 10)}/${m}/${y}`
}
/** RIF para imprimir: J402821280 → J-40282128-0 cuando tiene la forma estándar. */
const prettyDoc = (doc: string | null) => {
  if (!doc) return ''
  const m = doc.match(/^([VEJGPC])(\d{8})(\d)$/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : doc
}

interface CellProps {
  from: keyof typeof COL
  to: keyof typeof COL          // columna donde TERMINA (borde izquierdo de la siguiente)
  row: number
  rows?: number                 // celdas combinadas verticalmente
  h?: 'left' | 'center' | 'right'
  v?: 'top' | 'center' | 'bottom'
  size?: 8 | 9 | 10
  bold?: boolean
  wrap?: boolean
  children?: ReactNode
}

function Sheet({ inv, offX, offY, copyOffX, copyOffY }: {
  inv: PrintableInvoice; offX: number; offY: number; copyOffX: number; copyOffY: number
}) {
  // c = 0 original, 1 copia. La copia suma su propio ajuste encima del de la hoja.
  const x = (pt: number, c: number) => MARGIN_LEFT_PT + pt * ZOOM + (offX + c * copyOffX) * PT_PER_MM
  const y = (pt: number, c: number) => MARGIN_TOP_PT + (pt + c * COPY_OFFSET_PT) * ZOOM + (offY + c * copyOffY) * PT_PER_MM

  const ivaLabel = `IVA ( ${String(inv.iva_rate).replace('.', ',')} % ):`
  const items = inv.items.slice(0, MAX_INVOICE_LINES)

  const copy = (c: number) => {
    const Cell = ({ from, to, row, rows = 1, h = 'left', v = 'bottom', size = 9, bold, wrap, children }: CellProps) => {
      const [top] = ROW[row]
      const [lastTop, lastH] = ROW[row + rows - 1]
      const style: CSSProperties = {
        position: 'absolute',
        left: `${x(COL[from], c)}pt`, width: `${(COL[to] - COL[from]) * ZOOM}pt`,
        top: `${y(top, c)}pt`, height: `${(lastTop + lastH - top) * ZOOM}pt`,
        padding: `0 ${CELL_PAD_PT}pt`,
        display: 'flex',
        alignItems: v === 'top' ? 'flex-start' : v === 'center' ? 'center' : 'flex-end',
        justifyContent: h === 'left' ? 'flex-start' : h === 'center' ? 'center' : 'flex-end',
        textAlign: h,
        fontSize: `${size * ZOOM}pt`,
        fontWeight: bold ? 700 : 400,
        lineHeight: 1.15,
        whiteSpace: wrap ? 'normal' : 'nowrap',
        overflow: 'hidden',
      }
      return <div style={style}>{children}</div>
    }
    const HLine = ({ x1, x2, at }: { x1: number; x2: number; at: number }) => (
      <div style={{ position: 'absolute', left: `${x(x1, c)}pt`, width: `${(x2 - x1) * ZOOM}pt`,
        top: `${y(at, c) - BORDER_PT / 2}pt`, borderTop: `${BORDER_PT}pt solid #000` }} />
    )
    const VLine = ({ at, y1, y2 }: { at: number; y1: number; y2: number }) => (
      <div style={{ position: 'absolute', left: `${x(at, c) - BORDER_PT / 2}pt`, top: `${y(y1, c)}pt`,
        height: `${(y2 - y1) * ZOOM}pt`, borderLeft: `${BORDER_PT}pt solid #000` }} />
    )

    const tableTop = ROW[14][0], headBottom = ROW[15][0], bodyBottom = ROW[23][0], totalsBottom = ROW[25][0] + ROW[25][1]
    return (
      <div key={c}>
        <Cell from="F" to="G" row={6} h="right" bold>FACTURA</Cell>
        <Cell from="G" to="I" row={6} h="center" bold>{inv.invoice_number}</Cell>
        <Cell from="F" to="G" row={7} h="right" bold>FECHA:</Cell>
        <Cell from="G" to="I" row={7} h="center" bold>{excelDate(inv.invoice_date)}</Cell>

        <Cell from="B" to="C" row={8} bold>NOMBRE:</Cell>
        <Cell from="C" to="I" row={8}>{inv.customer_name}</Cell>
        <Cell from="B" to="C" row={9} bold>DIRECCION:</Cell>
        <Cell from="C" to="I" row={9} rows={2} v="top" wrap>{inv.customer_address ?? ''}</Cell>
        <Cell from="B" to="C" row={11} bold>RIF:</Cell>
        <Cell from="C" to="I" row={11} size={10}>{prettyDoc(inv.customer_doc)}</Cell>
        <Cell from="B" to="C" row={12} bold>TELEFONO:</Cell>
        <Cell from="C" to="I" row={12} size={10}>{inv.customer_phone ?? ''}</Cell>

        <Cell from="B" to="E" row={14} bold>DESCRIPCION</Cell>
        <Cell from="E" to="F" row={14} h="center" bold>CANTIDAD</Cell>
        <Cell from="F" to="G" row={14} h="center" bold>PRECIO UNITARIO</Cell>
        <Cell from="G" to="I" row={14} h="center" bold>PRECIO TOTAL</Cell>

        {items.map((it, k) => (
          <div key={k}>
            <Cell from="B" to="E" row={FIRST_ITEM_ROW + k} size={8}>{it.description}</Cell>
            <Cell from="E" to="F" row={FIRST_ITEM_ROW + k} h="right" v="center" size={8}>{bs(it.quantity)}</Cell>
            <Cell from="F" to="G" row={FIRST_ITEM_ROW + k} h="right">{bs(it.unit_price_bs)}</Cell>
            <Cell from="G" to="I" row={FIRST_ITEM_ROW + k} h="right" v="center">{bs(it.total_bs)}</Cell>
          </div>
        ))}

        <Cell from="F" to="G" row={23} bold>MONTO BASE:</Cell>
        <Cell from="G" to="I" row={23} h="right">{bs(inv.base_bs)}</Cell>
        <Cell from="F" to="G" row={24} bold>{ivaLabel}</Cell>
        <Cell from="G" to="I" row={24} h="right">{bs(inv.iva_bs)}</Cell>
        <Cell from="F" to="G" row={25} bold>TOTAL A PAGAR:</Cell>
        <Cell from="G" to="I" row={25} h="right">{bs(inv.total_bs)}</Cell>

        {/* Bordes: encabezado + cuerpo del detalle (filas 14–22) */}
        <HLine x1={COL.B} x2={COL.I} at={tableTop} />
        <HLine x1={COL.B} x2={COL.I} at={headBottom} />
        <HLine x1={COL.B} x2={COL.I} at={bodyBottom} />
        {[COL.B, COL.E, COL.F, COL.G, COL.I].map(at => (
          <VLine key={at} at={at} y1={tableTop} y2={bodyBottom} />
        ))}
        {/* Bordes: recuadro de totales (filas 23–25, columnas F y G:H) */}
        {[ROW[24][0], ROW[25][0], totalsBottom].map(at => (
          <HLine key={at} x1={COL.F} x2={COL.I} at={at} />
        ))}
        {[COL.F, COL.G, COL.I].map(at => (
          <VLine key={at} at={at} y1={bodyBottom} y2={totalsBottom} />
        ))}
      </div>
    )
  }

  return (
    <div className="factura-page" style={{
      position: 'relative', width: '210mm', height: '296mm', background: '#fff', color: '#000',
      fontFamily: 'Arial, Helvetica, sans-serif', overflow: 'hidden',
    }}>
      {copy(0)}
      {copy(1)}
    </div>
  )
}

interface Props {
  invoice: PrintableInvoice
  offsetX: number
  offsetY: number
  copyOffsetX?: number
  copyOffsetY?: number
  /** Se llama cuando se abre el diálogo de impresión (cuenta reimpresiones). */
  onPrint?: () => void
  toolbar?: ReactNode
  autoPrint?: boolean
}

export default function FacturaPrint({ invoice, offsetX, offsetY, copyOffsetX = 0, copyOffsetY = 0, onPrint, toolbar, autoPrint }: Props) {
  const onPrintRef = useRef(onPrint)
  useEffect(() => { onPrintRef.current = onPrint }, [onPrint])

  useEffect(() => {
    const h = () => onPrintRef.current?.()
    window.addEventListener('beforeprint', h)
    return () => window.removeEventListener('beforeprint', h)
  }, [])

  useEffect(() => {
    if (!autoPrint) return
    const t = setTimeout(() => window.print(), 400)
    return () => clearTimeout(t)
  }, [autoPrint])

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          .no-print { display: none !important; }
          .factura-wrap { padding: 0 !important; background: #fff !important; }
          .factura-page-shadow { box-shadow: none !important; }
        }
      `}</style>
      <div className="no-print sticky top-0 z-10 bg-white border-b border-neutral-200 px-4 py-3">
        <div className="max-w-[210mm] mx-auto flex flex-wrap items-center gap-3">
          <button onClick={() => window.print()} className="btn-primary text-sm">Imprimir</button>
          {toolbar}
          <p className="text-xs text-neutral-500 w-full">
            En el diálogo de impresión: <b>Márgenes: Ninguno</b> · <b>Escala: 100 %</b> (no “Ajustar”) ·
            sin encabezados ni pies de página · papel <b>A4</b>.
          </p>
        </div>
      </div>
      <div className="factura-wrap bg-neutral-100 py-6 min-h-screen">
        <div className="mx-auto w-fit shadow-lg factura-page-shadow">
          <Sheet inv={invoice} offX={offsetX} offY={offsetY} copyOffX={copyOffsetX} copyOffY={copyOffsetY} />
        </div>
      </div>
    </>
  )
}
