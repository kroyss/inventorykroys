'use client'
import { TELEGRAM_SOPORTE } from '@/lib/cuenta'

// «¿Dudas? Escríbenos aquí · Telegram · Instagram» (25-11, el dueño): en los avisos de la prueba gratis, para que
// quien se traba en el proceso nos escriba. «Escríbenos aquí» abre la burbuja de Ayuda en Soporte con el mensaje
// nuevo listo (te llega a Plataforma → Soporte y al Telegram del dueño, con el contexto de la pantalla).
export const EVENTO_ABRIR_SOPORTE = 'abrir-soporte'
export const INSTAGRAM = 'https://www.instagram.com/comerciantedigital.ve/'

export function LogoTelegram({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#229ED9" />
      <path fill="#fff" d="M5.4 11.8 16.9 7.4c.5-.2 1 .1.8.9l-2 9.3c-.1.6-.5.8-1 .5l-3-2.2-1.4 1.4c-.2.2-.3.3-.6.3l.2-3.1 5.6-5c.2-.2 0-.3-.3-.1l-6.9 4.3-3-.9c-.6-.2-.6-.6.1-.9z" />
    </svg>
  )
}

export function LogoInstagram({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="ig-degrade" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#feda75" /><stop offset=".35" stopColor="#fa7e1e" />
          <stop offset=".6" stopColor="#d62976" /><stop offset="1" stopColor="#4f5bd5" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6.5" fill="url(#ig-degrade)" />
      <rect x="5" y="5" width="14" height="14" rx="4.2" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3.3" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="16.3" cy="7.7" r="1" fill="#fff" />
    </svg>
  )
}

export default function ContactoDudas({ texto = '¿Dudas?' }: { texto?: string }) {
  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 align-middle">
      <span>{texto}</span>
      <button type="button" onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_SOPORTE))}
        className="font-semibold underline whitespace-nowrap">Escríbenos aquí</button>
      <span aria-hidden="true">·</span>
      <a href={TELEGRAM_SOPORTE} target="_blank" rel="noreferrer" title="Escríbenos por Telegram" aria-label="Escríbenos por Telegram"
        className="inline-flex items-center gap-1 hover:opacity-80"><LogoTelegram /><span className="text-xs">Telegram</span></a>
      <a href={INSTAGRAM} target="_blank" rel="noreferrer" title="Escríbenos por Instagram" aria-label="Escríbenos por Instagram"
        className="inline-flex items-center gap-1 hover:opacity-80"><LogoInstagram /><span className="text-xs">Instagram</span></a>
    </span>
  )
}
