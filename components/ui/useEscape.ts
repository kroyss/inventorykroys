import { useEffect } from 'react'

/**
 * Calls `onClose` when Escape is pressed, but only while `active` is true.
 * For stacked overlays, give the topmost one its own hook and disable the
 * lower ones, or use a single handler with priority ordering.
 */
export function useEscape(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [active, onClose])
}
