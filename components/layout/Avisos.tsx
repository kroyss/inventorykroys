'use client'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

// Numeritos del menú: preguntas sin responder, mensajes sin leer y guías por reportar.
// Se piden cada minuto (el cron trae lo nuevo de ML cada minuto) y al volver a la pestaña.
// El total urgente (preguntas + mensajes) también va en el título de la pestaña: "(5) Ventas".
// negativas / neutrales: calificaciones recibidas de los últimos 30 días sin ver (Reputación): rojo y naranja.
export interface Avisos { preguntas: number; mensajes: number; reportador: number; calificaciones: number; despachos: number; alertas: number
                          negativas: number; neutrales: number }
const VACIO: Avisos = { preguntas: 0, mensajes: 0, reportador: 0, calificaciones: 0, despachos: 0, alertas: 0, negativas: 0, neutrales: 0 }
const Ctx = createContext<Avisos>(VACIO)

export function useAvisos() { return useContext(Ctx) }

/** Cuántos avisos tiene cada página del menú. Dos estilos (2026-10-12):
 *  urgente = ALERTA (rojo): preguntas y mensajes sin responder, calificaciones negativas.
 *  si no = TRABAJO del día (gris): despachos, reportador, por calificar, stock; y las neutrales. */
export const AVISO_DE_RUTA: Record<string, { clave: keyof Avisos; urgente: boolean }> = {
  '/preguntas':  { clave: 'preguntas',  urgente: true },
  '/mensajes':   { clave: 'mensajes',   urgente: true },
  '/despachos':  { clave: 'despachos',  urgente: false },
  '/reportador': { clave: 'reportador', urgente: false },
  '/calificaciones': { clave: 'calificaciones', urgente: false },
  '/alertas-stock': { clave: 'alertas', urgente: false },
}

const tope = (n: number) => (n > 99 ? '99+' : n)
const PILDORA = 'inline-flex items-center justify-center min-w-[1.15rem] h-[1.15rem] px-1 text-[11px] font-semibold leading-none num'

/** Me calificaron: una sola cápsula partida, negativas (rojo, alerta) | neutrales (naranja suave, no alerta).
 *  Solo aparece la parte que tenga algo. */
export function NumeritosReputacion({ avisos, className = '' }: { avisos: Avisos; className?: string }) {
  const { negativas: neg, neutrales: neu } = avisos
  if (neg <= 0 && neu <= 0) return null
  return (
    <span className={`inline-flex overflow-hidden rounded-full ${className}`}>
      {neg > 0 && <span className={`${PILDORA} bg-red-500 text-white`} title="Negativas nuevas">{tope(neg)}</span>}
      {neu > 0 && <span className={`${PILDORA} bg-orange-100 text-orange-700`} title="Neutrales nuevas">{tope(neu)}</span>}
    </span>
  )
}

/** ¿Hay alguna alerta (rojo) en estas rutas? Para el punto de "Más" y del espacio. */
export function hayAlerta(avisos: Avisos, rutas: string[]) {
  return rutas.some(r => (AVISO_DE_RUTA[r]?.urgente && avisos[AVISO_DE_RUTA[r].clave] > 0) || (r === '/calificaciones' && avisos.negativas > 0))
}

export function AvisosProvider({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<Avisos>(VACIO)
  const tituloBase = useRef<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/avisos', { cache: 'no-store' })
      if (r.ok) setAvisos(await r.json())
    } catch { /* sin red: se reintenta en el próximo minuto */ }
  }, [])

  useEffect(() => {
    cargar()
    const t = setInterval(cargar, 60_000)
    const alVolver = () => { if (document.visibilityState === 'visible') cargar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver) }
  }, [cargar])

  // "(N) " delante del título de la página, sin pisar el título que pone Next.
  useEffect(() => {
    const urgentes = avisos.preguntas + avisos.mensajes
    const quitar = (t: string) => t.replace(/^\(\d+\)\s/, '')
    const aplicar = () => {
      const base = quitar(document.title)
      tituloBase.current = base
      const nuevo = urgentes > 0 ? `(${urgentes}) ${base}` : base
      if (document.title !== nuevo) document.title = nuevo
    }
    aplicar()
    const head = document.querySelector('title')
    const obs = head ? new MutationObserver(aplicar) : null
    if (head && obs) obs.observe(head, { childList: true })
    return () => obs?.disconnect()
  }, [avisos])

  return <Ctx.Provider value={avisos}>{children}</Ctx.Provider>
}

export function Numerito({ n, urgente, className = '' }: { n: number; urgente: boolean; className?: string }) {
  if (n <= 0) return null
  return (
    <span className={`${PILDORA} rounded-full ${urgente ? 'bg-red-500 text-white' : 'bg-neutral-200 text-neutral-700'} ${className}`}>
      {tope(n)}
    </span>
  )
}
