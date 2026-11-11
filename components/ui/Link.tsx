'use client'
import NextLink from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, type ComponentProps } from 'react'

// Link del sistema (12-11, rapidez fase 1). El de Next precarga TODAS las páginas cuyos enlaces se ven en
// pantalla: el menú y las listas disparaban 20–50 pedidos al servidor al abrir cada pantalla, que competían con
// los de la pantalla misma. Este precarga solo la que el usuario va a abrir: al pasar el mouse, tocar o enfocar
// el enlace (unos 100–300 ms antes del clic). Con prefetch explícito se comporta como el de Next.
export default function Link({ prefetch, onMouseEnter, onTouchStart, onFocus, ...props }: ComponentProps<typeof NextLink>) {
  const router = useRouter()
  const hecho = useRef(false)
  if (prefetch !== undefined) return <NextLink prefetch={prefetch} onMouseEnter={onMouseEnter} onTouchStart={onTouchStart} onFocus={onFocus} {...props} />
  const precargar = () => {
    if (hecho.current || typeof props.href !== 'string' || !props.href.startsWith('/')) return
    hecho.current = true
    try { router.prefetch(props.href) } catch { /* sin precarga: navega igual */ }
  }
  return (
    <NextLink
      prefetch={false}
      onMouseEnter={e => { precargar(); onMouseEnter?.(e) }}
      onTouchStart={e => { precargar(); onTouchStart?.(e) }}
      onFocus={e => { precargar(); onFocus?.(e) }}
      {...props}
    />
  )
}
