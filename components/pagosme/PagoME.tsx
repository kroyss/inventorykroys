'use client'
// Piezas de Pagos MercadoEnvíos que usan la pantalla de lote y "Nueva venta".
import { compararMonto, type PagoME } from '@/lib/pagosMEComun'

export const bs = (n: number | null | undefined) =>
  n == null ? '—' : `Bs ${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const METODO: Record<string, string> = {
  mobile_payment: 'Pago móvil', transfer: 'Transferencia', zelle: 'Zelle', binance: 'Binance',
  paypal: 'PayPal', local_dollar_transfer: 'Transf. $', international_transfer: 'Transf. internacional',
  pipol_pay: 'Pipol Pay', reserve: 'Reserve', pay_button: 'Botón de pago',
}
export const metodoPago = (m: string | null) => (m ? METODO[m] ?? m : '—')

const TONO = {
  verde:   'bg-green-100 text-green-800',
  azul:    'bg-sky-100 text-sky-800',
  naranja: 'bg-amber-100 text-amber-800',
  gris:    'bg-neutral-100 text-neutral-600',
}

/** Pagado vs. total de la orden: 🟢 coincide · 🔵 de más (o embalaje) · 🟠 de menos. */
export function Monto({ p }: { p: Pick<PagoME, 'monto_pagado' | 'total_orden'> }) {
  const c = compararMonto(p.monto_pagado, p.total_orden)
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${TONO[c.tono]}`}
      title={`Pagado ${bs(p.monto_pagado)} · total de la orden ${bs(p.total_orden)}`}>
      {c.texto}{c.dif != null && c.tono !== 'verde' ? ` (${c.dif > 0 ? '+' : ''}${bs(c.dif)})` : ''}
    </span>
  )
}

export const VERIF = {
  pendiente: { t: 'Sin verificar', c: 'bg-amber-100 text-amber-800' },
  valido:    { t: '✓ Verificado',  c: 'bg-green-100 text-green-800' },
  invalido:  { t: '✗ Inválido',    c: 'bg-red-100 text-red-800' },
} as const

/** Recuadro de "Nueva venta": el pago de esta venta traído de MercadoEnvíos. */
export function PagoVenta({ p }: { p: PagoME }) {
  const v = VERIF[p.verificacion]
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 text-xs space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-violet-900">Pago en MercadoEnvíos{p.cuenta ? ` (${p.cuenta})` : ''}</span>
        <span className={`px-2 py-0.5 rounded-full ${v.c}`}>{v.t}{p.verificado_por ? ` · ${p.verificado_por}` : ''}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-neutral-700">
        <span>{metodoPago(p.metodo_pago)}</span>
        {(p.banco_emisor || p.banco_receptor) && <span>{p.banco_emisor ?? '?'} → {p.banco_receptor ?? '?'}</span>}
        {p.referencia && <span>Ref <b className="font-mono">{p.referencia}</b></span>}
        <span><b>{bs(p.monto_pagado)}</b></span>
        <Monto p={p} />
        {p.tiene_comprobante && (
          <a href={`/api/pagos-me/${p.id}/archivo?tipo=comprobante`} target="_blank" rel="noreferrer" className="underline text-violet-800">Ver comprobante</a>
        )}
      </div>
      <p className="text-neutral-500">
        {p.verificacion === 'valido'
          ? 'Al guardar, la venta queda en Pago verificado y su guía entra al lote de Despachos.'
          : p.verificacion === 'invalido'
            ? 'Este pago se marcó INVÁLIDO en Pagos ME: revísalo antes de despachar.'
            : 'Al guardar, la guía entra al lote de Despachos, pero no se imprime hasta verificar el pago en Pagos ME.'}
        {!p.tiene_guia && ' (Todavía no tiene guía en MercadoEnvíos.)'}
      </p>
    </div>
  )
}
