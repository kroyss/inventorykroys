'use client'
// «Entró mercancía» (24-11, pedido del dueño): después de recibir una compra o importación, o de cargar una entrada en el
// inventario, si alguna publicación pausada o en 0 en MercadoLibre ya tiene inventario por esa entrada, sale un aviso abajo
// a la izquierda con «Ver y activar →» (24-11: Publicaciones → Mis publicaciones con el filtro «Para activar», donde se ve
// cada variante y cada cuenta como está en ML). Lo despierta avisarLlegada()
// (lib/avisoLlegada.ts) desde las pantallas que cargan mercancía; si no hay nada que activar, no se ve nada.
import { useEffect, useState } from 'react'
import Link from '@/components/ui/Link'
import { EVENTO_LLEGADA } from '@/lib/avisoLlegada'

interface Llegadas { total: number; agotadas?: number; pausadas?: number }

export default function AvisoLlegada() {
  const [d, setD] = useState<Llegadas | null>(null)
  useEffect(() => {
    const mirar = () => {
      fetch('/api/alertas-stock/llegadas', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null))
        .then((x: Llegadas | null) => { if (x && x.total > 0) setD(x) }).catch(() => {})
    }
    window.addEventListener(EVENTO_LLEGADA, mirar)
    return () => window.removeEventListener(EVENTO_LLEGADA, mirar)
  }, [])
  if (!d) return null
  const n = d.total
  return (
    <div role="status" className="fixed bottom-24 left-4 right-4 z-40 sm:right-auto sm:max-w-sm md:bottom-4">
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 shadow-lg">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8" /></svg>
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold text-neutral-900">Entró mercancía</p>
          <p className="text-neutral-600">
            {n} publicaci{n === 1 ? 'ón' : 'ones'} pausada{n === 1 ? '' : 's'} o en 0 en MercadoLibre ya tiene{n === 1 ? '' : 'n'} inventario.
          </p>
          <Link href="/publicaciones?aviso=activar" onClick={() => setD(null)}
            className="mt-1 inline-block font-medium text-emerald-700 underline-offset-2 hover:underline">Ver y activar →</Link>
        </div>
        <button type="button" onClick={() => setD(null)} aria-label="Cerrar" className="-mr-1 -mt-1 px-1.5 text-lg leading-none text-neutral-400 hover:text-neutral-700">×</button>
      </div>
    </div>
  )
}
