'use client'
import { signIn } from 'next-auth/react'
import { useState, FormEvent } from 'react'
import { TELEGRAM_SOPORTE } from '@/lib/cuenta'
import type { Marca } from '@/lib/marca'

// Prueba gratis de 15 días (26-10, app/registro/page.tsx → POST /api/registro). Mismo formato que la entrada:
// panel negro de marca a la izquierda y el formulario a la derecha. Al crear la cuenta entra sola y va al inicio,
// donde el primer paso es conectar MercadoLibre (sin eso no funciona nada y los 15 días no arrancan).
const INCLUYE = [
  { t: 'Preguntas con IA',     d: 'Respuestas sugeridas para todas tus cuentas, en un solo lugar' },
  { t: 'Mensajes y calificaciones', d: 'Ninguna venta sin atender, calificaciones en bloque' },
  { t: 'Pagos MercadoEnvíos',  d: 'Los pagos y comprobantes traídos solos, listos para verificar' },
  { t: 'Despachos',            d: 'Las guías de todas tus cuentas en un PDF, con manifiesto y aviso al comprador' },
  { t: 'Stock y avisos por Telegram', d: 'Lo que se agota y lo pendiente del día, aunque no entres' },
]
const PASOS = [
  'Crea tu cuenta (1 minuto).',
  'Conecta tu cuenta de MercadoLibre: ahí arrancan tus 15 días.',
  'Al terminar, escríbenos para seguir sin perder nada.',
]

export default function RegistroForm({ marca }: { marca: Marca }) {
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [verClave, setVerClave] = useState(false)

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true); setError('')
    const f = new FormData(e.currentTarget)
    const datos = Object.fromEntries(['negocio', 'nombre', 'usuario', 'correo', 'whatsapp', 'telegram', 'clave', 'sitio'].map(k => [k, String(f.get(k) ?? '')]))
    const r = await fetch('/api/registro', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'No se pudo crear la cuenta. Intenta de nuevo.'); setLoading(false); return }
    const s = await signIn('credentials', { username: datos.usuario.trim().toLowerCase(), password: datos.clave, redirect: false })
    // Navegación completa (como la entrada): la sesión nueva se lee desde el servidor.
    window.location.assign(s?.ok ? '/' : '/login')
  }

  const campo = 'w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-lime-600 focus:ring-2 focus:ring-lime-400/50'
  const etiqueta = 'block text-sm font-medium text-neutral-700 mb-1'

  return (
    <div className="min-h-screen grid grid-rows-[auto_1fr] lg:grid-rows-1 lg:grid-cols-[1.1fr_1fr] bg-white">

      {/* Panel de marca */}
      <aside className="relative overflow-hidden bg-neutral-950 text-white px-14 py-12 hidden lg:flex flex-col">
        <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-40 w-[34rem] h-[34rem] rounded-full border border-lime-400/15" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 w-[24rem] h-[24rem] rounded-full border border-lime-400/20" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 w-[14rem] h-[14rem] rounded-full bg-lime-400/10 blur-2xl" />

        <div className="relative flex flex-col flex-1 justify-center max-w-md">
          <p className="inline-flex w-fit rounded-full bg-lime-400 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-950">15 días gratis</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight">
            Prueba todo con <span className="text-lime-400">tus propias ventas.</span>
          </h1>
          <p className="text-neutral-400 mt-3 text-sm leading-relaxed">Sin tarjeta ni pago por adelantado. {marca.lema}</p>
          <ul className="mt-8 space-y-4">
            {INCLUYE.map(p => (
              <li key={p.t} className="flex gap-3">
                <span className="mt-1.5 w-2 h-2 rounded-full bg-lime-400 shadow-[0_0_10px_2px_rgba(163,230,53,0.5)] shrink-0" />
                <span>
                  <span className="block text-sm font-semibold">{p.t}</span>
                  <span className="block text-sm text-neutral-400">{p.d}</span>
                </span>
              </li>
            ))}
          </ul>
          <ol className="mt-9 space-y-2 border-t border-white/10 pt-6">
            {PASOS.map((p, i) => (
              <li key={p} className="flex gap-3 text-sm text-neutral-300">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-lime-400/60 text-[11px] font-semibold text-lime-400">{i + 1}</span>{p}
              </li>
            ))}
          </ol>
        </div>

        <p className="relative text-xs text-neutral-500">
          © {new Date().getFullYear()} El Comerciante Digital · Todos los derechos reservados
        </p>
      </aside>

      {/* Celular: franja negra con lo esencial */}
      <header className="lg:hidden relative overflow-hidden bg-neutral-950 text-white px-6 py-6">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 w-48 h-48 rounded-full border border-lime-400/20" />
        <p className="relative text-[11px] uppercase tracking-[0.18em] text-lime-400">15 días gratis</p>
        <p className="relative mt-1 text-xl font-semibold leading-snug tracking-tight">
          Prueba todo con <span className="text-lime-400">tus propias ventas.</span>
        </p>
        <p className="relative mt-1 text-xs text-neutral-400">Los días arrancan cuando conectas MercadoLibre.</p>
      </header>

      {/* Formulario */}
      <main className="flex flex-col items-center justify-center px-6 py-10 bg-neutral-50 lg:bg-white">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold text-neutral-900 tracking-tight">Crea tu cuenta</h2>
          <p className="text-sm text-neutral-500 mt-1 mb-6">MercadoLibre Venezuela · prueba de 15 días.</p>

          <form onSubmit={enviar} className="space-y-3.5">
            <div>
              <label htmlFor="negocio" className={etiqueta}>Nombre de tu negocio</label>
              <input id="negocio" name="negocio" required maxLength={80} autoFocus className={campo} />
            </div>
            <div>
              <label htmlFor="nombre" className={etiqueta}>Tu nombre</label>
              <input id="nombre" name="nombre" required maxLength={100} autoComplete="name" className={campo} />
            </div>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div>
                <label htmlFor="whatsapp" className={etiqueta}>WhatsApp</label>
                <input id="whatsapp" name="whatsapp" inputMode="tel" placeholder="0414 1234567" maxLength={20} autoComplete="tel" className={campo} />
              </div>
              <div>
                <label htmlFor="telegram" className={etiqueta}>Telegram</label>
                <input id="telegram" name="telegram" placeholder="@usuario" maxLength={33} autoCapitalize="none" spellCheck={false} className={campo} />
              </div>
            </div>
            <p className="-mt-2 text-xs text-neutral-400">WhatsApp o Telegram: al menos uno.</p>
            <div>
              <label htmlFor="correo" className={etiqueta}>Correo</label>
              <input id="correo" name="correo" type="email" required maxLength={120} autoComplete="email" className={campo} />
            </div>
            <div>
              <label htmlFor="usuario" className={etiqueta}>Usuario para entrar</label>
              <input id="usuario" name="usuario" required minLength={3} maxLength={30} autoComplete="username" autoCapitalize="none" spellCheck={false}
                pattern="[A-Za-z0-9._\-]{3,30}" title="3 a 30 caracteres: letras, números, punto, guion o guion bajo (sin espacios)" className={campo} />
              <p className="mt-1 text-xs text-neutral-400">Sin espacios. Con esto y tu contraseña entras.</p>
            </div>
            <div>
              <label htmlFor="clave" className={etiqueta}>Contraseña</label>
              <div className="relative">
                <input id="clave" name="clave" type={verClave ? 'text' : 'password'} required minLength={8} maxLength={72}
                  autoComplete="new-password" className={`${campo} pr-11`} />
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
              <p className="mt-1 text-xs text-neutral-400">Mínimo 8 caracteres.</p>
            </div>
            {/* Trampa para bots: una persona no la ve ni la llena. */}
            <input name="sitio" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />

            {error && (
              <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-lime-400 text-neutral-950 py-2.5 rounded-lg text-sm font-semibold hover:bg-lime-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'Creando tu cuenta…' : 'Empezar mi prueba gratis'}
            </button>
          </form>

          <p className="text-sm text-neutral-500 mt-6">¿Ya tienes cuenta? <a href="/login" className="font-medium text-lime-700 underline underline-offset-2">Entrar</a></p>
          <p className="text-xs text-neutral-400 mt-2">¿Dudas? <a href={TELEGRAM_SOPORTE} target="_blank" rel="noopener noreferrer" className="underline">Escríbenos por Telegram</a>.</p>
          <p className="lg:hidden text-xs text-neutral-400 mt-10 text-center">
            © {new Date().getFullYear()} El Comerciante Digital · Todos los derechos reservados
          </p>
        </div>
      </main>
    </div>
  )
}
