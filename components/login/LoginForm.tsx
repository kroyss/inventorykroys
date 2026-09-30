'use client'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState, FormEvent } from 'react'

import type { Marca } from '@/lib/marca'

// Formulario de entrada. La marca (logo, nombre) llega del servidor: app/login/page.tsx.
// En El Comerciante Digital no se pide país: el usuario entra a su empresa (y si tiene
// más de una, cambia arriba a la derecha).
export default function LoginForm({ marca }: { marca: Marca }) {
  const router              = useRouter()
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const form    = new FormData(e.currentTarget)
    const result  = await signIn('credentials', {
      username: form.get('username'),
      password: form.get('password'),
      country:  form.get('country') ?? undefined,
      redirect: false,
    })

    if (result?.ok) {
      router.push('/')
      router.refresh()
    } else {
      setError(marca.id === 'syncsora' ? 'Usuario, contraseña o país incorrectos' : 'Usuario o contraseña incorrectos')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-100">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-md border border-neutral-200 p-8">

        <div className="flex flex-col items-center gap-1 mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={marca.logo} alt={marca.nombre} className={`h-14 w-auto ${marca.logoRedondo ? 'rounded-xl' : ''}`} />
          {marca.id === 'ecd' && <p className="text-base font-semibold text-neutral-900 mt-1">{marca.nombre}</p>}
          <p className="text-xs text-neutral-400 leading-tight text-center">{marca.lema}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {marca.id === 'syncsora' && (
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">País</label>
            <select
              name="country"
              required
              defaultValue="VE"
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-neutral-800 bg-white"
            >
              <option value="VE">🇻🇪 Venezuela</option>
              <option value="CO">🇨🇴 Colombia</option>
            </select>
          </div>
          )}

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Usuario</label>
            <input
              name="username"
              type="text"
              required
              autoComplete="username"
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-neutral-800"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Contraseña</label>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-neutral-800"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-neutral-900 text-white py-2 rounded-lg text-sm font-medium
                       hover:bg-neutral-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
