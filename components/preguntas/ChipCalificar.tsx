'use client'
// 23-11 (pedido de una usuaria, por el dueño): en la cabecera de la conversación de Mensajes, junto al comprador y el
// número, el estado de la calificación de esa venta y el botón para calificarla ahí mismo (CalificarVenta):
//   ☆ Calificar · ⏳ Calificar (en espera hasta dd/mm) · ✓ Calificada: concretada.
// Quien no ve Calificaciones (permiso ver_calificaciones) no ve el chip (la API responde 403).
import { useCallback, useEffect, useState } from 'react'
import { Nuevo, vistoNuevo } from '@/components/ui/Nuevo'
import CalificarVenta, { type PlantillasCal, type VentaCal } from '@/components/preguntas/CalificarVenta'

interface OrdenCal extends VentaCal { cal_vendedor: string | null; cal_concretada: boolean | null }
const diaMes = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`

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
  const base = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap'
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
      title={espera ? `Está en tus días de espera hasta el ${diaMes(espera.lista_el!)}: si ya lo recibió o retiró, puedes calificarla ahora` : 'Calificar esta venta en MercadoLibre'}
      className={`${base} transition-colors ${espera ? 'bg-amber-50 text-amber-900 ring-amber-200 hover:bg-amber-100' : 'bg-violet-50 text-violet-800 ring-violet-200 hover:bg-violet-100'}`}>
      {espera ? <>⏳ Calificar <span className="font-normal">(en espera hasta {diaMes(espera.lista_el!)})</span></> : <>☆ Calificar</>}
      <Nuevo clave="calificar_mensajes" className="!ml-0.5" />
    </button>
    {abierta && <CalificarVenta ventas={pendientes} plantillas={datos.plantillas} comprador={comprador}
      onCerrar={() => setAbierta(false)} onListo={cargar} />}
  </>
}
