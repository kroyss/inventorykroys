import type { KeyboardEvent } from 'react'

/**
 * Guards para inputs numéricos. Los `<input type="number">` del navegador igual
 * permiten teclear `e`, `E`, `+` y `-` (notación científica/signo), lo que deja
 * pasar caracteres que no deberían. Estos handlers los bloquean, replicando el
 * comportamiento del sistema legacy.
 */

/** Bloquea e/E/+/- — para montos decimales (costo, precio, descuento). */
export const blockNumberKeys = (e: KeyboardEvent<HTMLInputElement>) => {
  if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault()
}

/** Bloquea e/E/+/- y el punto/coma — para cantidades enteras. */
export const blockIntKeys = (e: KeyboardEvent<HTMLInputElement>) => {
  if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault()
}

/** Deja solo dígitos en una cadena (Nº de orden ML). */
export const digitsOnly = (s: string) => s.replace(/\D/g, '')
