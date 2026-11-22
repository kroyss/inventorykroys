'use client'
// 22-11 (el dueño: pestañas de Publicaciones tapadas): en pantallas angostas la barra se desliza de lado; al abrir una
// pestaña que quedó fuera de la vista (p. ej. «Precio vs sistema» en el celular), se la trae a la vista sola.
import { useEffect } from 'react'

export default function PestanaVisible({ nav }: { nav: string }) {
  useEffect(() => {
    const n = document.querySelector<HTMLElement>(`nav[aria-label="${nav}"]`)
    const a = n?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!n || !a) return
    const fuera = a.offsetLeft < n.scrollLeft || a.offsetLeft + a.offsetWidth > n.scrollLeft + n.clientWidth
    if (fuera) n.scrollTo({ left: a.offsetLeft - (n.clientWidth - a.offsetWidth) / 2 })
  }, [nav])
  return null
}
