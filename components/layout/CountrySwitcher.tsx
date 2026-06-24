'use client'
import { useState } from 'react'
import { useSession } from 'next-auth/react'

// Selector VE/CO para admin: cambia el país de la sesión sin re-loguear.
// El backend (callback jwt) re-resuelve el id del admin en la DB destino.
export default function CountrySwitcher({ current }: { current: 'VE' | 'CO' }) {
  const { update } = useSession()
  const [busy, setBusy] = useState(false)

  const switchTo = async (c: 'VE' | 'CO') => {
    if (c === current || busy) return
    setBusy(true)
    await update({ country: c })
    // Recarga completa: server components y datos por país se rehacen limpios.
    window.location.assign('/dashboard')
  }

  return (
    <div className="flex rounded-lg border border-neutral-200 overflow-hidden text-xs" title="Cambiar de país">
      {(['VE', 'CO'] as const).map(c => (
        <button key={c} onClick={() => switchTo(c)} disabled={busy}
          className={`px-2 py-1 font-semibold transition-colors disabled:opacity-60 ${
            current === c ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-500 hover:bg-neutral-100'
          }`}>
          {c}
        </button>
      ))}
    </div>
  )
}
