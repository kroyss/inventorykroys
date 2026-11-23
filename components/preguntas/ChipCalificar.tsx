'use client'
// 23-11 (pedido de una usuaria, por el dueño): en la cabecera de la conversación de Mensajes, junto al comprador y el
// número, el estado de la calificación de esa venta y el botón para calificarla ahí mismo (CalificarVenta):
//   ☆ Calificar · reloj Calificar (en espera: la fecha va en el aviso al pasar el cursor) · ✓ Calificada: concretada.
// 23-11 (el dueño): chip más chico, iconos dibujados (no emoji) y la espera solo en el aviso, no en el texto.
// Quien no ve Calificaciones (permiso ver_calificaciones) no ve el chip (la API responde 403).
import { useCallback, useEffect, useState } from 'react'
import { Nuevo, vistoNuevo } from '@/components/ui/Nuevo'
import CalificarVenta, { type PlantillasCal, type VentaCal } from '@/components/preguntas/CalificarVenta'

interface OrdenCal extends VentaCal { cal_vendedor: string | null; cal_concretada: boolean | null }
const diaMes = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`
const Reloj = () => (
  <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
    <circle cx="8" cy="8" r="6" /><path d="M8 4.8V8l2.2 1.4" />
  </svg>
)
const Estrella = () => (
  <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
    <path d="M8 1.9l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.1 4.4 13l.7-4L2.2 6.2l4-.6z" />
  </svg>
)

export default function ChipCalificar({ pack, comprador }: { pack: string; comprador?: string | null }) {
  const [datos, setDatos] = useState<{ ordenes: OrdenCal[]; plantillas: PlantillasCal } | null>(null)
  const [abierta, setAbierta] = useState(false)
  const cargar = useCallback(async () => {
    const r = await fetch(`/api/calificaciones/venta?pack=${pack}`).catch(() => null)
    if (!r?.ok) { setDatos(null); return }
    setDatos(await r.json().catch(() => null))
  }, [pack])
  useEffect(() => { cargar() }, [cargar])
  if (!datos?.ordenes.length) return null

  const pendientes = datos.ordenes.filter(o => !o.cal_vendedor)
  const base = 'inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium leading-4 ring-1 ring-inset whitespace-nowrap'
  if (!pendientes.length) {
    const cerrada = datos.ordenes.every(o => o.cal_vendedor === 'cerrada_ml')
    if (cerrada) return <span className={`${base} bg-neutral-50 text-neutral-500 ring-neutral-200`} title="MercadoLibre ya no deja calificarla (pasó su plazo)">Calificación cerrada</span>
    const conc = datos.ordenes.find(o => o.cal_concretada != null)?.cal_concretada
    return (
      <span className={`${base} bg-emerald-50 text-emerald-800 ring-emerald-200`} title="Ya la calificaste en MercadoLibre">
        ✓ Calificada{conc != null ? `: ${conc ? 'concretada' : 'no concretada'}` : ''}
      </span>
    )
  }
  const espera = pendientes.find(o => o.en_espera && o.lista_el)
  return <>
    <button type="button" onClick={() => { setAbierta(true); vistoNuevo('calificar_mensajes') }}
      title={espera ? `En espera hasta el ${diaMes(espera.lista_el!)} (tus días de espera). Si ya lo recibió o retiró, puedes calificarla ahora.` : 'Calificar esta venta en MercadoLibre'}
      className={`${base} transition-colors ${espera ? 'bg-amber-50 text-amber-900 ring-amber-200 hover:bg-amber-100' : 'bg-violet-50 text-violet-800 ring-violet-200 hover:bg-violet-100'}`}>
      {espera ? <Reloj /> : <Estrella />}Calificar
      <Nuevo clave="calificar_mensajes" className="!ml-0.5" />
    </button>
    {abierta && <CalificarVenta ventas={pendientes} plantillas={datos.plantillas} comprador={comprador}
      onCerrar={() => setAbierta(false)} onListo={cargar} />}
  </>
}
