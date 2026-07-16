import { useEffect } from 'react'

// Vuelve a pedir datos cuando la pestaña/ventana recupera el foco (o se vuelve
// visible). Sirve para que un formulario ya abierto (venta, compra) refleje
// cambios hechos EN PARALELO en otra pestaña —ajuste de stock, producto nuevo,
// cambio de precio— sin tener que refrescar toda la página: volvés a la
// pestaña de la venta/compra y la lista de productos/inventario se actualiza sola.
//
// `refetch` debería ser estable (envuelto en useCallback) para no re-suscribir
// los listeners en cada render. `enabled` permite escuchar solo cuando hace
// falta (p.ej. mientras el formulario está abierto).
export function useRefetchOnFocus(refetch: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const onFocus = () => refetch()
    const onVisible = () => { if (document.visibilityState === 'visible') refetch() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refetch, enabled])
}
