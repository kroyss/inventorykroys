'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * Lee un parámetro de la URL (deep-link desde el dashboard) y lo devuelve ya
 * validado, junto con una función para limpiarlo.
 *
 * Se usa `useSearchParams()` en vez de leer `window.location.search` una sola
 * vez al montar: con el App Router, al navegar entre pantallas el componente
 * puede seguir montado y el efecto de montaje no vuelve a correr, así que el
 * filtro no se aplicaba. Con el hook, cualquier cambio de URL lo re-aplica.
 */
export function useDeepLinkParam<T extends string>(
  key: string,
  valid: readonly T[],
): [T | null, () => void] {
  const params = useSearchParams()
  const raw = params.get(key) ?? ''
  const [value, setValue] = useState<T | null>(null)

  useEffect(() => {
    const v = raw.trim().toUpperCase()
    setValue(valid.includes(v as T) ? (v as T) : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw])

  return [value, () => setValue(null)]
}

/**
 * Igual que el anterior pero para una lista separada por comas
 * (ej. `?estado=RECIBIDA,PARCIAL`). Devuelve null si no queda ninguno válido.
 */
export function useDeepLinkList<T extends string>(
  key: string,
  valid: readonly T[],
): [T[] | null, () => void] {
  const params = useSearchParams()
  const raw = params.get(key) ?? ''
  const [value, setValue] = useState<T[] | null>(null)

  useEffect(() => {
    const list = raw.split(',')
      .map(s => s.trim().toUpperCase())
      .filter((s): s is T => valid.includes(s as T))
    setValue(list.length > 0 ? list : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw])

  return [value, () => setValue(null)]
}
