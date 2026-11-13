'use client'
// Mi cuenta (13-11-2026, el dueño). Pestañas: Mis datos (todos: nombre, correo, WhatsApp, Telegram y su clave) ·
// Mi equipo (admin: los usuarios de la empresa, lo que antes era /usuarios) · Mi negocio (admin: nombre del negocio).
// API: /api/mi-cuenta (y /api/users para el equipo).
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import Link from '@/components/ui/Link'
import UsuariosClient from '@/components/usuarios/UsuariosClient'
import type { Country } from '@/lib/types'

export type Pestana = 'datos' | 'equipo' | 'negocio'

interface Datos {
  username: string; full_name: string | null; email: string | null; whatsapp: string | null
  telegram: boolean; tg_usuario: string | null; avisos: boolean; admin: boolean; negocio: string | null
}

const campo = 'mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-lime-400 focus:border-lime-400'

async function guardar(cuerpo: object): Promise<string | null> {
  const r = await fetch('/api/mi-cuenta', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }).catch(() => null)
  const d = await r?.json().catch(() => ({}))
  return r?.ok ? null : (d?.error ?? 'No se pudo guardar. Prueba de nuevo.')
}

function Tarjeta({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-sm font-semibold text-neutral-900">{titulo}</h2>
      {ayuda && <p className="mt-0.5 text-xs text-neutral-500">{ayuda}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Mensaje({ ok, texto }: { ok: boolean; texto: string }) {
  return <p role="status" className={`rounded-lg px-3 py-2 text-sm ${ok ? 'border border-lime-200 bg-lime-50 text-lime-900' : 'border border-red-200 bg-red-50 text-red-700'}`}>{texto}</p>
}

export default function MiCuentaClient({ admin, country, inicial }: { admin: boolean; country: Country; inicial: Pestana }) {
  const router = useRouter()
  const [pestana, setPestana] = useState<Pestana>(inicial)
  const [d, setD] = useState<Datos | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/mi-cuenta').then(async r => {
      const x = await r.json().catch(() => null)
      if (!vivo) return
      if (r.ok && x) setD(x); else setErrorCarga('No se pudieron cargar tus datos. Recarga la página.')
    }).catch(() => vivo && setErrorCarga('No se pudieron cargar tus datos. Recarga la página.'))
    return () => { vivo = false }
  }, [])

  const ir = (p: Pestana) => {
    setPestana(p)
    router.replace(p === 'datos' ? '/mi-cuenta' : `/mi-cuenta?ver=${p}`, { scroll: false })
  }

  const PESTANAS: [Pestana, string][] = admin
    ? [['datos', 'Mis datos'], ['equipo', 'Mi equipo'], ['negocio', 'Mi negocio']]
    : [['datos', 'Mis datos']]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Mi cuenta</h1>
        <p className="text-sm text-neutral-500">
          {admin ? 'Tus datos, tu equipo y tu negocio.' : 'Tus datos y tu contraseña.'}
        </p>
      </div>

      {PESTANAS.length > 1 && (
        <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-neutral-200">
          {PESTANAS.map(([k, t]) => (
            <button key={k} role="tab" aria-selected={pestana === k} onClick={() => ir(k)}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${pestana === k ? 'border-lime-500 text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}>
              {t}
            </button>
          ))}
        </div>
      )}

      {pestana === 'equipo' && admin && <UsuariosClient country={country} embebido />}

      {pestana !== 'equipo' && (errorCarga ? <Mensaje ok={false} texto={errorCarga} />
        : !d ? <div className="h-64 animate-pulse rounded-xl bg-neutral-100" />
        : pestana === 'negocio' && admin ? <MiNegocio d={d} onGuardado={nombre => { setD({ ...d, negocio: nombre }); router.refresh() }} />
        : <div className="grid gap-4 lg:grid-cols-2">
            <MisDatos d={d} onGuardado={x => setD({ ...d, ...x })} />
            <MiClave />
          </div>)}
    </div>
  )
}

function MisDatos({ d, onGuardado }: { d: Datos; onGuardado: (x: Partial<Datos>) => void }) {
  const [f, setF] = useState({ full_name: d.full_name ?? '', email: d.email ?? '', whatsapp: d.whatsapp ?? '' })
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const cambio = f.full_name.trim() !== (d.full_name ?? '') || f.email.trim().toLowerCase() !== (d.email ?? '') || f.whatsapp.trim() !== (d.whatsapp ?? '')

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault()
    setOcupado(true); setMsg(null)
    const err = await guardar({ accion: 'datos', ...f })
    setOcupado(false)
    if (err) { setMsg({ ok: false, texto: err }); return }
    onGuardado({ full_name: f.full_name.trim(), email: f.email.trim().toLowerCase() || null, whatsapp: f.whatsapp.trim() || null })
    setMsg({ ok: true, texto: 'Listo, tus datos quedaron guardados.' })
  }

  return (
    <Tarjeta titulo="Mis datos" ayuda="Con ellos recuperas tu clave y soporte puede ayudarte por WhatsApp o Telegram.">
      <form onSubmit={enviar} className="space-y-3">
        <div className="text-xs text-neutral-500">Usuario para entrar: <b className="font-mono text-neutral-800">{d.username}</b> <span className="text-neutral-400">(no se cambia)</span></div>
        <label className="block text-xs font-medium text-neutral-600">Nombre
          <input value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} autoComplete="name" className={campo} />
        </label>
        <label className="block text-xs font-medium text-neutral-600">Correo
          <input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} autoComplete="email" placeholder="tucorreo@gmail.com" className={campo} />
          <span className={`mt-1 block text-[11px] font-normal ${d.email || f.email ? 'text-neutral-400' : 'text-amber-700'}`}>
            {d.email || f.email ? 'Con él recuperas tu clave si la olvidas.' : 'Sin correo no puedes recuperar tu clave solo.'}
          </span>
        </label>
        <label className="block text-xs font-medium text-neutral-600">WhatsApp
          <input inputMode="tel" value={f.whatsapp} onChange={e => setF({ ...f, whatsapp: e.target.value })} autoComplete="tel" placeholder="0412 1234567" className={campo} />
        </label>
        <div className="text-xs font-medium text-neutral-600">Telegram
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
            {d.telegram
              ? <span className="text-sm font-normal text-neutral-800">Vinculado{d.tg_usuario ? <> · <b>@{d.tg_usuario}</b></> : ''} <span className="text-emerald-600">✓</span></span>
              : <span className="text-sm font-normal text-neutral-500">Sin vincular</span>}
            {d.avisos && <Link href="/mis-avisos" className="text-xs font-semibold text-sky-700 hover:underline">{d.telegram ? 'Ver mis avisos →' : 'Vincular →'}</Link>}
          </div>
          <span className="mt-1 block text-[11px] font-normal text-neutral-400">También te llega ahí el código para recuperar la clave.</span>
        </div>
        {msg && <Mensaje {...msg} />}
        <div className="flex justify-end">
          <button type="submit" disabled={ocupado || !cambio} className="btn-primary text-sm disabled:opacity-50">{ocupado ? 'Guardando…' : 'Guardar mis datos'}</button>
        </div>
      </form>
    </Tarjeta>
  )
}

function MiClave() {
  const [f, setF] = useState({ actual: '', nueva: '', repetir: '' })
  const [ver, setVer] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [listo, setListo] = useState(false)

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault()
    if (f.nueva !== f.repetir) { setError('Las dos claves nuevas no coinciden'); return }
    setOcupado(true); setError(null)
    const err = await guardar({ accion: 'clave', actual: f.actual, nueva: f.nueva })
    setOcupado(false)
    if (err) { setError(err); return }
    setListo(true)
    // Se cerraron todas sus sesiones (también esta): vuelve a entrar con la nueva.
    setTimeout(() => signOut({ callbackUrl: '/login' }), 2500)
  }

  const tipo = ver ? 'text' : 'password'
  return (
    <Tarjeta titulo="Mi contraseña" ayuda="Al cambiarla se cierran tus sesiones en todos los equipos.">
      {listo ? <Mensaje ok texto="Listo, tu contraseña cambió. Te llevamos a entrar con la nueva…" /> : (
        <form onSubmit={enviar} className="space-y-3">
          <label className="block text-xs font-medium text-neutral-600">Contraseña actual
            <input type={tipo} value={f.actual} onChange={e => setF({ ...f, actual: e.target.value })} autoComplete="current-password" className={campo} />
          </label>
          <label className="block text-xs font-medium text-neutral-600">Contraseña nueva
            <input type={tipo} value={f.nueva} onChange={e => setF({ ...f, nueva: e.target.value })} autoComplete="new-password" className={campo} />
            <span className="mt-1 block text-[11px] font-normal text-neutral-400">Mínimo 8 caracteres.</span>
          </label>
          <label className="block text-xs font-medium text-neutral-600">Repite la nueva
            <input type={tipo} value={f.repetir} onChange={e => setF({ ...f, repetir: e.target.value })} autoComplete="new-password" className={campo} />
          </label>
          <label className="flex items-center gap-2 text-xs text-neutral-600">
            <input type="checkbox" checked={ver} onChange={e => setVer(e.target.checked)} /> Ver las contraseñas
          </label>
          {error && <Mensaje ok={false} texto={error} />}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href="/login/recuperar" className="text-xs text-neutral-500 hover:text-neutral-800 hover:underline">¿No recuerdas la actual?</Link>
            <button type="submit" disabled={ocupado || !f.actual || !f.nueva || !f.repetir} className="btn-primary text-sm disabled:opacity-50">{ocupado ? 'Cambiando…' : 'Cambiar contraseña'}</button>
          </div>
        </form>
      )}
    </Tarjeta>
  )
}

function MiNegocio({ d, onGuardado }: { d: Datos; onGuardado: (nombre: string) => void }) {
  const [nombre, setNombre] = useState(d.negocio ?? '')
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault()
    setOcupado(true); setMsg(null)
    const err = await guardar({ accion: 'negocio', nombre })
    setOcupado(false)
    if (err) { setMsg({ ok: false, texto: err }); return }
    onGuardado(nombre.trim())
    setMsg({ ok: true, texto: 'Listo, tu negocio ahora se llama así en el sistema.' })
  }

  return (
    <div className="max-w-xl">
      <Tarjeta titulo="Nombre del negocio" ayuda="Es el que se ve arriba en el menú y en tu cuenta. No cambia tus cuentas de MercadoLibre.">
        <form onSubmit={enviar} className="space-y-3">
          <label className="block text-xs font-medium text-neutral-600">Nombre
            <input value={nombre} onChange={e => setNombre(e.target.value)} maxLength={80} className={campo} />
          </label>
          {msg && <Mensaje {...msg} />}
          <div className="flex justify-end">
            <button type="submit" disabled={ocupado || nombre.trim().length < 2 || nombre.trim() === (d.negocio ?? '')} className="btn-primary text-sm disabled:opacity-50">
              {ocupado ? 'Guardando…' : 'Guardar nombre'}
            </button>
          </div>
        </form>
      </Tarjeta>
    </div>
  )
}
