'use client'
import { useState } from 'react'
import { useSession } from 'next-auth/react'

export interface EmpresaOpcion { id: number; nombre: string; country: 'VE' | 'CO' }

// Selector de empresa: cambia la empresa de la sesión sin volver a entrar. Solo aparece
// si el usuario entra a más de una. Botones cortos: la primera empresa de cada país lleva
// el país (VE / CO, igual que antes); las demás, dos letras de su nombre (EmpresaPruebas → PR).
// El nombre completo queda en el tooltip.
function etiquetas(empresas: EmpresaOpcion[]) {
  const primera = new Map<string, number>()
  for (const e of [...empresas].sort((x, y) => x.id - y.id)) if (!primera.has(e.country)) primera.set(e.country, e.id)
  return new Map(empresas.map(e => {
    if (primera.get(e.country) === e.id) return [e.id, e.country]
    const palabra = e.nombre.replace(/^empresa\s*/i, '').replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]/g, '') || e.nombre
    return [e.id, palabra.slice(0, 2).toUpperCase()]
  }))
}

export default function CountrySwitcher({ actual, empresas }: { actual: number; empresas: EmpresaOpcion[] }) {
  const { update } = useSession()
  const [busy, setBusy] = useState(false)
  if (empresas.length < 2) return null

  const etiqueta = etiquetas(empresas)
  const cambiar = async (id: number) => {
    if (id === actual || busy) return
    setBusy(true)
    await update({ empresaId: id })
    // Recarga completa para rehacer server components y datos de la otra empresa,
    // manteniendo la sección (sin query: puede traer filtros o ids de la anterior).
    window.location.assign(window.location.pathname)
  }

  return (
    <div className="flex rounded-lg border border-neutral-200 overflow-hidden text-xs" title="Cambiar de empresa">
      {empresas.map(e => (
        <button key={e.id} onClick={() => cambiar(e.id)} disabled={busy} title={e.nombre}
          className={`px-2 py-1 font-semibold transition-colors disabled:opacity-60 ${
            actual === e.id ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-500 hover:bg-neutral-100'
          }`}>
          {etiqueta.get(e.id)}
        </button>
      ))}
    </div>
  )
}
