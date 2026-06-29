'use client'
import { useState, useEffect, useCallback } from 'react'

// Recuerda la pestaña activa para que un F5 (recarga) no devuelva siempre a la
// primera. Usa sessionStorage: sobrevive al refresh y a navegar dentro de la
// app, pero al abrir el sistema de cero vuelve al valor por defecto.
//
// Patrón SSR-safe: arranca con `initial` (igual en server y cliente, sin
// hydration mismatch) y restaura el valor guardado en un effect tras montar.
export function usePersistedTab<T extends string>(
  key: string, initial: T,
): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial)

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(key)
      if (saved) setValue(saved as T)
    } catch { /* sessionStorage no disponible: ignora */ }
  }, [key])

  const set = useCallback((v: T) => {
    setValue(v)
    try { window.sessionStorage.setItem(key, v) } catch { /* ignora */ }
  }, [key])

  return [value, set]
}
