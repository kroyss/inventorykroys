// Del lado del navegador (12-11, rapidez fase 3). Los datos de la primera carga vienen en el HTML (lib/inicial.ts):
// el primer cargar() del componente los toma en vez de pedirlos; los siguientes (refresco, cambio de pestaña) piden
// como siempre. Si la página no los trajo (null), el primer cargar() pide normal.
import { useCallback, useRef } from 'react'

export function usePrimera<T>(inicial: T | null | undefined): () => T | null {
  const ref = useRef<T | null>(inicial ?? null)
  return useCallback(() => { const v = ref.current; ref.current = null; return v }, [])
}
