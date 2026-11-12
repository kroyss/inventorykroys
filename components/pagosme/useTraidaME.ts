'use client'
import { useCallback, useEffect, useState } from 'react'
import type { EstadoTraida } from '@/lib/meTraida'

/** Estado de la traída de MercadoEnvíos desde el servidor (lib/meTraida.ts): al abrir la pantalla y, mientras corre una,
 *  cada 5 s. `recargar()` después de pedir una (y avisa al aviso de tareas de abajo con el evento 'cola-ml'). */
export function useTraidaME(activo: boolean) {
  const [traida, setTraida] = useState<EstadoTraida | null>(null)
  const [vuelta, setVuelta] = useState(0)
  const recargar = useCallback(() => {
    setVuelta(v => v + 1)
    try { window.dispatchEvent(new Event('cola-ml')) } catch { /* sin ventana */ }
  }, [])
  useEffect(() => {
    if (!activo) return
    let vivo = true
    let t: ReturnType<typeof setTimeout> | null = null
    const leer = async () => {
      const d = await fetch('/api/pagos-me/traida', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null)
      if (!vivo) return
      const e = (d?.traida ?? null) as EstadoTraida | null
      setTraida(e)
      if (e && (e.en_curso || e.esperando_pc)) t = setTimeout(leer, 5000)
    }
    leer()
    return () => { vivo = false; if (t) clearTimeout(t) }
  }, [activo, vuelta])
  const ocupada = !!traida && (traida.en_curso || traida.esperando_pc)
  return { traida, ocupada, recargar }
}
