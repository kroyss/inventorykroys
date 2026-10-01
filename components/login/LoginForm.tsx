'use client'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState, FormEvent, KeyboardEvent } from 'react'

import type { Marca } from '@/lib/marca'

// Formulario de entrada. La marca (logo, nombre) llega del servidor: app/login/page.tsx.
// No se pide país ni empresa: se entra a la primera empresa del usuario y, si tiene más
// de una (VE / CO), se cambia arriba a la derecha.
export default function LoginForm({ marca }: { marca: Marca }) {
  const router                  = useRouter()
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [verClave, setVerClave] = useState(false)
  const [mayus, setMayus]       = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const form    = new FormData(e.currentTarget)
    const result  = await signIn('credentials', {
      username: form.get('username'),
      password: form.get('password'),
      redirect: false,
    })

    if (result?.ok) {
      router.push('/')
      router.refresh()
    } else {
      setError('Usuario o contraseña incorrectos')
      setLoading(false)
    }
  }

  const revisarMayus = (e: KeyboardEvent<HTMLInputElement>) => setMayus(e.getModifierState('CapsLock'))
  const campo = 'w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-lime-600 focus:ring-2 focus:ring-lime-400/50'
  const productos = [
    { t: 'Inventario',       d: 'Stock, ventas, compras, facturas y márgenes reales' },
    { t: 'Automatizaciones', d: 'Preguntas con IA, mensajes, despachos, guías y calificaciones de todas tus cuentas' },
    { t: 'Radar',            d: 'Qué se vende en MercadoLibre y dónde está la oportunidad' },
  ]

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-white">

      {/* Panel de marca (en el celular se reduce a una franja arriba) */}
      <aside className="relative overflow-hidden bg-neutral-950 text-white px-6 py-8 lg:px-14 lg:py-12 flex flex-col">
        <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-40 w-[34rem] h-[34rem] rounded-full border border-lime-400/15" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 w-[24rem] h-[24rem] rounded-full border border-lime-400/20" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 w-[14rem] h-[14rem] rounded-full bg-lime-400/10 blur-2xl" />

        <div className="relative flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={marca.logo} alt="" className={`h-11 w-11 ${marca.logoRedondo ? 'rounded-xl' : ''}`} />
          <span className="text-lg font-semibold tracking-tight">{marca.nombre}</span>
        </div>

        <div className="relative hidden lg:flex flex-col flex-1 justify-center max-w-md">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Tu negocio en MercadoLibre, <span className="text-lime-400">bajo control.</span>
          </h1>
          <p className="text-neutral-400 mt-3 text-sm leading-relaxed">{marca.lema}</p>
          <ul className="mt-10 space-y-5">
            {productos.map(p => (
              <li key={p.t} className="flex gap-3">
                <span className="mt-1.5 w-2 h-2 rounded-full bg-lime-400 shadow-[0_0_10px_2px_rgba(163,230,53,0.5)] shrink-0" />
                <span>
                  <span className="block text-sm font-semibold">{p.t}</span>
                  <span className="block text-sm text-neutral-400">{p.d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative hidden lg:block text-xs text-neutral-500">
          © {new Date().getFullYear()} El Comerciante Digital · Todos los derechos reservados
        </p>
      </aside>

      {/* Formulario */}
      <main className="flex flex-col items-center justify-center px-6 py-10 bg-neutral-50 lg:bg-white">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold text-neutral-900 tracking-tight">Entrar</h2>
          <p className="text-sm text-neutral-500 mt-1 mb-7">Una sola cuenta para Inventario, Automatizaciones y Radar.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-neutral-700 mb-1">Usuario</label>
              <input id="username" name="username" type="text" required autoFocus
                autoComplete="username" autoCapitalize="none" spellCheck={false}
                className={campo} />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-neutral-700 mb-1">Contraseña</label>
              <div className="relative">
                <input id="password" name="password" type={verClave ? 'text' : 'password'} required
                  autoComplete="current-password" onKeyUp={revisarMayus} onKeyDown={revisarMayus}
                  className={`${campo} pr-11`} />
                <button type="button" onClick={() => setVerClave(v => !v)}
                  aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'} title={verClave ? 'Ocultar' : 'Mostrar'}
                  className="absolute inset-y-0 right-0 px-3 flex items-center text-neutral-400 hover:text-neutral-700">
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8}
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
                    {verClave && <path d="M4 4l16 16" />}
                  </svg>
                </button>
              </div>
              {mayus && <p className="text-xs text-amber-700 mt-1">Tienes activadas las mayúsculas</p>}
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-lime-400 text-neutral-950 py-2.5 rounded-lg text-sm font-semibold
                         hover:bg-lime-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          <p className="text-xs text-neutral-400 mt-6">¿Olvidaste tu contraseña? Escríbele a tu administrador.</p>
          <p className="lg:hidden text-xs text-neutral-400 mt-10 text-center">
            © {new Date().getFullYear()} El Comerciante Digital · Todos los derechos reservados
          </p>
        </div>
      </main>
    </div>
  )
}
