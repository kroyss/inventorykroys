'use client'
// Último plazo de los Fundadores sin MercadoLibre (18-10, solo para este tránsito; borrar junto con
// lib/fundadoresCorte.ts). Franja fija arriba + ventana al entrar (una vez por sesión del navegador).
// Desaparece sola a la hora del corte (y el servidor deja de mandarla).
import { useEffect, useState } from 'react'

const CLAVE = 'aviso_corte_visto'

function horasQuedan(hasta: string) {
  return Math.max(0, Math.ceil((Date.parse(hasta) - Date.now()) / 3_600_000))
}

export default function AvisoCorte({ hasta, esAdmin }: { hasta: string; esAdmin: boolean }) {
  const [quedan, setQuedan] = useState<number | null>(null)
  const [abierta, setAbierta] = useState(false)

  useEffect(() => {
    setQuedan(horasQuedan(hasta))
    const t = setInterval(() => setQuedan(horasQuedan(hasta)), 60_000)
    try { if (!sessionStorage.getItem(CLAVE)) setAbierta(true) } catch { setAbierta(true) }
    return () => clearInterval(t)
  }, [hasta])

  const cerrar = () => {
    setAbierta(false)
    try { sessionStorage.setItem(CLAVE, '1') } catch { /* sin almacenamiento: vuelve a salir */ }
  }
  if (quedan === 0) return null

  const conectar = esAdmin
    ? <a href="/conectar" className="underline font-semibold whitespace-nowrap">Conectar ahora →</a>
    : <span className="whitespace-nowrap">Pídele al administrador de tu cuenta que la conecte.</span>

  return (
    <>
      <div className="bg-red-50 border-b border-red-200 text-red-900 text-center text-sm py-2 px-4">
        ⏰ Tienes hasta el <b>lunes 19/10 a las 11:00 p. m.</b> para conectar tu MercadoLibre, o tu cupo pasa a la lista de espera.{' '}
        {conectar}
      </div>
      {abierta && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={cerrar} />
          <div className="relative w-full max-w-md space-y-3 rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold">⏰ Último plazo para conectar tu MercadoLibre</h2>
            <p className="text-sm text-neutral-700">
              Tienes hasta el <b>lunes 19 de octubre a las 11:00 p. m.</b> (hora de Venezuela) para conectar tu cuenta de MercadoLibre.
            </p>
            <p className="text-sm text-neutral-700">
              Si a esa hora no está conectada, tu cupo de Fundador pasa a la lista de espera y ya no podrás entrar al sistema.
            </p>
            <p className="text-sm text-neutral-700">Conectarla toma solo un par de minutos.</p>
            {quedan != null && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-center text-sm font-semibold text-red-800">
                Quedan {quedan} {quedan === 1 ? 'hora' : 'horas'}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button onClick={cerrar} className="btn-secondary text-sm">Más tarde</button>
              {esAdmin
                ? <a href="/conectar" onClick={cerrar} className="btn-primary text-sm">Conectar MercadoLibre ahora</a>
                : <button onClick={cerrar} className="btn-primary text-sm">Entendido, le aviso al administrador</button>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
