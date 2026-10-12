'use client'
import Link from 'next/link'
import { useAvisos } from '@/components/layout/Avisos'

/** Las dos vistas de Calificaciones con su número (los mismos avisos del menú):
 *  por calificar (gris) · negativas (rojo) y neutrales (naranja) nuevas. */
export default function VistasCalificaciones({ recibidas }: { recibidas: boolean }) {
  const a = useAvisos()
  const opcion = (activa: boolean) =>
    `inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
      activa ? 'bg-white font-semibold text-neutral-900 shadow-sm' : 'font-medium text-neutral-500 hover:text-neutral-800'}`
  const COLOR = { gris: 'bg-neutral-200 text-neutral-700', rojo: 'bg-red-500 text-white', naranja: 'bg-orange-500 text-white' }
  const numero = (n: number, color: keyof typeof COLOR = 'gris', title?: string) => n > 0 && (
    <span title={title} className={`min-w-[1.15rem] rounded-full px-1.5 text-center text-[11px] font-semibold leading-[1.15rem] num ${COLOR[color]}`}>
      {n > 99 ? '99+' : n}
    </span>
  )
  return (
    <div className="inline-flex rounded-lg bg-neutral-100 p-0.5" role="tablist">
      <Link href="/calificaciones" role="tab" aria-selected={!recibidas} className={opcion(!recibidas)}>
        Calificar mis ventas{numero(a.calificaciones)}
      </Link>
      <Link href="/calificaciones?ver=recibidas" role="tab" aria-selected={recibidas} className={opcion(recibidas)}>
        Me calificaron{numero(a.negativas, 'rojo', 'Negativas nuevas')}{numero(a.neutrales, 'naranja', 'Neutrales nuevas')}
      </Link>
    </div>
  )
}
