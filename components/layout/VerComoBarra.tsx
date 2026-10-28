'use client'
import { useState } from 'react'
import { useSession } from 'next-auth/react'

/** Franja de "Ver como este usuario" (lib/auth.ts): arriba de todo, mientras el admin mira el sistema
 *  como otra persona. Solo lectura (proxy.ts). "Volver a mi cuenta" lo deja de nuevo en Usuarios.
 *  Con `empresa` es "Ver como cliente" (Plataforma, 28-10): vuelve a su empresa y a Plataforma. */
export default function VerComoBarra({ nombre, empresa }: { nombre: string; empresa?: string }) {
  const { update } = useSession()
  const [volviendo, setVolviendo] = useState(false)
  const volver = async () => {
    setVolviendo(true)
    await update(empresa ? { soporte: null } : { verComo: null })
    window.location.assign(empresa ? '/plataforma' : '/usuarios')
  }
  return (
    <div className="bg-neutral-900 text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-2 text-sm">
        <p className="flex min-w-0 items-center gap-2">
          <svg className="h-4 w-4 shrink-0 text-amber-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />
          </svg>
          <span className="truncate">
            Estás viendo como <b className="font-semibold">{nombre}</b>{empresa && <> en <b className="font-semibold">{empresa}</b></>}
            <span className="text-neutral-400"> · solo lectura: no se guarda ningún cambio</span>
          </span>
        </p>
        <button type="button" onClick={volver} disabled={volviendo}
          className="shrink-0 rounded-md bg-white px-3 py-1 text-xs font-semibold text-neutral-900 transition-colors hover:bg-neutral-200 disabled:opacity-60">
          {volviendo ? 'Volviendo…' : 'Volver a mi cuenta'}
        </button>
      </div>
    </div>
  )
}
