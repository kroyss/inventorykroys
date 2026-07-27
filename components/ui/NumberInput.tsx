'use client'
import { useEffect, useState } from 'react'
import type { InputHTMLAttributes, KeyboardEvent } from 'react'
import { blockIntKeys, blockNumberKeys } from '@/lib/inputGuards'

/**
 * Input numérico que se puede borrar Y en el que se puede escribir "0,15".
 *
 * El patrón `value={n}` + `onChange={e => setN(Number(e.target.value) || 0)}`
 * tiene una trampa: al borrar, el input queda vacío, el parseo devuelve 0 y
 * React vuelve a escribir "0" en el campo (tiene un caso especial para los
 * inputs type="number"). Resultado: el retroceso "no borra".
 *
 * Por eso el texto se guarda ACÁ como string y el número se emite aparte. Así:
 *   - el campo vacío se queda vacío (y muestra el placeholder),
 *   - el "0" que se escribe como parte de "0.15" se ve y no se lo come nadie,
 *   - los decimales a medio tipear ("0.", "12.") sobreviven.
 *
 * El valor de afuera (reset del form, "usar sugerido", otra fila) pisa el texto
 * solo cuando de verdad representa otro número, no mientras se está tipeando.
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
  const parse = (s: string) => {
    if (s.trim() === '') return emptyValue
    const n = int ? parseInt(s, 10) : parseFloat(s)
    return isNaN(n) ? emptyValue : n
  }
  const toText = (n: number) => (n === emptyValue ? '' : String(n))

  const [text, setText] = useState(() => toText(value))

  // Sincroniza cuando el número cambia desde afuera. Si el texto actual ya vale
  // ese número (ej. "0." o "0" cuando el valor es 0) no se toca, para no pelear
  // con lo que la persona está escribiendo.
  useEffect(() => {
    if (parse(text) !== value) setText(toText(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    ;(int ? blockIntKeys : blockNumberKeys)(e)
    onKeyDown?.(e)
  }

  return (
    <input
      {...rest}
      type="number"
      inputMode={int ? 'numeric' : 'decimal'}
      value={text}
      // El placeholder muestra el valor que se va a asumir si se deja vacío.
      // Cuando el "vacío" es un centinela negativo (ej. el ajuste de stock, donde
      // el 0 es un dato real) no tiene sentido mostrarlo: se muestra 0.
      placeholder={placeholder ?? (emptyValue >= 0 ? String(emptyValue) : '0')}
      onKeyDown={handleKeyDown}
      onChange={e => {
        setText(e.target.value)
        onValueChange(parse(e.target.value))
      }}
    />
  )
}
