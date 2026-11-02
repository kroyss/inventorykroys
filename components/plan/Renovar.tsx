'use client'

// /renovar (02-11-2026, migración 141): la cuenta vencida no puede iniciar sesión; aquí entra con su usuario y
// contraseña y ve solo Mi plan (acceso firmado de 2 h, lib/cobros.ts). Desde el login llega ya con el acceso.
import { useEffect, useState, type FormEvent } from 'react'
import MiPlan from './MiPlan'

export default function Renovar() {
  const [acceso, setAcceso] = useState<string | null>(null)
  const [listo, setListo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    try { setAcceso(sessionStorage.getItem('renovar')) } catch { /* sin storage */ }
    setListo(true)
  }, [])

  async function entrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setEnviando(true); setError(null)
    const f = new FormData(e.currentTarget)
    const r = await fetch('/api/mi-plan/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: f.get('usuario'), clave: f.get('clave') }) }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    setEnviando(false)
    if (!r?.ok || !d.acceso) { setError(d.error ?? 'Sin conexión: vuelve a intentar'); return }
    try { sessionStorage.setItem('renovar', d.acceso) } catch { /* sin storage */ }
    setAcceso(d.acceso)
  }

  if (!listo) return null
  if (acceso) return <MiPlan acceso={acceso} />
  const campo = 'w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-sm bg-white'
  return (
    <form onSubmit={entrar} className="space-y-3 max-w-sm">
      <p className="text-sm text-neutral-600">Entra con tu usuario y contraseña para ver tu plan y reportar tu pago.</p>
      <input name="usuario" autoComplete="username" placeholder="Usuario" className={campo} required />
      <input name="clave" type="password" autoComplete="current-password" placeholder="Contraseña" className={campo} required />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button disabled={enviando} className="w-full rounded-lg bg-lime-400 px-4 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-lime-300 disabled:opacity-50">
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  )
}
