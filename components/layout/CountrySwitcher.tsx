'use client'
import { useState } from 'react'
import { useSession } from 'next-auth/react'

export interface EmpresaOpcion { id: number; nombre: string; country: 'VE' | 'CO' }

// Selector de empresa: cambia la empresa de la sesión sin volver a entrar. Solo aparece
// si el usuario entra a más de una. Si sus empresas son de países distintos (SolucionesMC
// VE / CO) se muestran como VE / CO, igual que antes; si no, por nombre.
export default function CountrySwitcher({ actual, empresas }: { actual: number; empresas: EmpresaOpcion[] }) {
  const { update } = useSession()
  const [busy, setBusy] = useState(false)
  if (empresas.length < 2) return null

  const porPais = new Set(empresas.map(e => e.country)).size === empresas.length
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
          {porPais ? e.country : e.nombre}
        </button>
      ))}
    </div>
  )
}
