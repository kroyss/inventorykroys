'use client'
// Lo que dijo el banco de un pago (20-10, migración 110; se llena con "Comprobar con el banco" en Por confirmar).
// Una línea en la venta para decidir "Pago correcto" / "Verificar pago" sabiendo qué llegó de verdad.
import { useEffect, useState } from 'react'
import type { BancoPago } from '@/lib/porConfirmar'

const bs = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`

const TONO: Record<BancoPago['nivel'], string> = {
  seguro:     'bg-green-50 text-green-800 ring-green-200',
  probable:   'bg-lime-50 text-lime-800 ring-lime-200',
  revisar:    'bg-amber-50 text-amber-900 ring-amber-200',
  no_aparece: 'bg-red-50 text-red-800 ring-red-200',
}
const TITULO: Record<BancoPago['nivel'], string> = {
  seguro: '🏦 En el banco', probable: '🏦 Probable en el banco', revisar: '🏦 Revisar', no_aparece: '🏦 No aparece en el banco',
}

export default function LineaBanco({ b }: { b: BancoPago }) {
  const m = b.mov
  return (
    <div className={`rounded-lg px-2.5 py-1 text-xs ring-1 ring-inset ${TONO[b.nivel]}`} title={`${b.motivo}${m?.concepto ? ` · ${m.concepto}` : ''}`}>
      <b>{TITULO[b.nivel]}</b>
      {m && <>: Bs {bs(m.monto)} · {m.banco} · {dm(m.fecha)}{m.ref ? ` · ref ${m.ref}` : ''}</>}
      {(b.nivel === 'revisar' || b.nivel === 'probable' || !m) && b.motivo && <span className="opacity-80"> — {b.motivo}</span>}
    </div>
  )
}

/** En la venta (Ventas, con Pagos ME): busca lo que dijo el banco de su pago. Sin dato no muestra nada. */
export function LineaBancoVenta({ venta }: { venta: string }) {
  const [b, setB] = useState<BancoPago | null>(null)
  useEffect(() => {
    let vivo = true
    fetch(`/api/pagos-me/comprobar?venta=${encodeURIComponent(venta)}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (vivo) setB(d?.banco ?? null) }).catch(() => {})
    return () => { vivo = false }
  }, [venta])
  return b ? <div className="mb-3"><LineaBanco b={b} /></div> : null
}
