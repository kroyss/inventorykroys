'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Reproductor, type Video } from './AprendizajeClient'

// Al entrar, mientras el usuario no haya completado el PRIMER video de Aprendizaje, se le abre en una
// ventana. "Verlo después" la cierra mientras dure este ingreso (sessionStorage, que el login borra):
// vuelve a salir al iniciar sesión o abrir el navegador, hasta que lo complete (80%, como en Aprendizaje).
const POSPUESTO = 'bienvenida_pospuesta'

export default function BienvenidaVideo() {
  const pathname = usePathname()
  const [video, setVideo] = useState<Video | null>(null)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    if (pathname.startsWith('/aprendizaje')) return
    try { if (sessionStorage.getItem(POSPUESTO)) return } catch { /* sin storage: se muestra */ }
    let vivo = true
    fetch('/api/aprendizaje', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const primero: Video | undefined = d?.videos?.[0]
        if (vivo && primero && !primero.completado && !d.exento && !d.demo) setVideo(primero)
      })
      .catch(() => {})
    return () => { vivo = false }
    // Solo al cargar el sistema (no en cada navegación).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!video) return null
  const despues = () => {
    try { sessionStorage.setItem(POSPUESTO, '1') } catch { /* sin storage */ }
    setVideo(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={video.titulo}>
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-lime-700">Empieza aquí</p>
            <h2 className="text-lg font-semibold text-neutral-900">{video.titulo}</h2>
          </div>
        </div>
        <Reproductor video={video} onAvance={(_id, _v, _d, completado) => { if (completado) setListo(true) }} />
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-sm text-neutral-500">
            {listo ? '✓ Listo. Los siguientes videos están en Aprendizaje.' : 'Te volverá a aparecer al entrar hasta que lo veas completo.'}
          </p>
          {listo
            ? <button onClick={() => setVideo(null)} className="btn-primary text-sm">Empezar</button>
            : <button onClick={despues} className="btn-secondary text-sm">Verlo después</button>}
        </div>
      </div>
    </div>
  )
}
