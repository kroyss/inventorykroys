'use client'
import type { InputHTMLAttributes, KeyboardEvent } from 'react'
import { blockIntKeys, blockNumberKeys } from '@/lib/inputGuards'

/**
 * Input numérico que SÍ se puede borrar.
 *
 * El patrón `value={n}` + `onChange={e => setN(Number(e.target.value) || 0)}`
 * tiene una trampa: al borrar, el input queda vacío, el parseo devuelve 0 y
 * React vuelve a escribir "0" en el campo (lo hace explícitamente para inputs
 * type="number" cuando el valor es 0 y el DOM está vacío). Resultado: el
 * retroceso "no borra" y hay que seleccionar el 0 y suprimirlo a mano.
 *
 * Acá el 0 (o el `emptyValue` que se indique) se muestra como PLACEHOLDER en
 * vez de como valor, así el campo se ve vacío, el retroceso funciona normal y
 * al escribir no hay que borrar nada antes.
 *
 * Los decimales a medio tipear ("12.") no se pierden: React compara el valor de
 * los inputs numéricos con igualdad débil, así que no pisa el punto colgante.
 */

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number
  onValueChange: (n: number) => void
  /** Cantidades enteras: bloquea también el punto y la coma. */
  int?: boolean
  /** Valor que representa "campo vacío" y se muestra como placeholder. Default 0. */
  emptyValue?: number
}

export default function NumberInput({
  value, onValueChange, int, emptyValue = 0, onKeyDown, placeholder, ...rest
}: Props) {
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    ;(int ? blockIntKeys : blockNumberKeys)(e)
    onKeyDown?.(e)
  }

  return (
    <input
      {...rest}
      type="number"
      inputMode={int ? 'numeric' : 'decimal'}
      value={value === emptyValue ? '' : value}
      placeholder={placeholder ?? String(emptyValue)}
      onKeyDown={handleKeyDown}
      onChange={e => {
        const raw = e.target.value
        if (raw.trim() === '') { onValueChange(emptyValue); return }
        const n = int ? parseInt(raw, 10) : parseFloat(raw)
        onValueChange(isNaN(n) ? emptyValue : n)
      }}
    />
  )
}
