'use client'
import { useEffect, useRef } from 'react'
import { EVENTO_ACTUALIZADO, type Grupo } from '@/lib/actualizarGrupos'

/** La pantalla vuelve a leer sus datos cuando la central de actualización (botón de arriba) termina uno de esos grupos. */
export function useAlActualizar(grupos: Grupo[], cb: () => void) {
  const ref = useRef(cb)
  useEffect(() => { ref.current = cb })
  const clave = grupos.join(',')
  useEffect(() => {
    const lista = clave.split(',')
    const h = (e: Event) => { if (lista.includes((e as CustomEvent<{ grupo: Grupo }>).detail?.grupo)) ref.current() }
    window.addEventListener(EVENTO_ACTUALIZADO, h)
    return () => window.removeEventListener(EVENTO_ACTUALIZADO, h)
  }, [clave])
}
