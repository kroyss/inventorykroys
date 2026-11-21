'use client'
import { signIn } from 'next-auth/react'
import { useEffect, useState, FormEvent } from 'react'
import { TELEGRAM_SOPORTE } from '@/lib/cuenta'
import type { Marca } from '@/lib/marca'
import { eventoPixel, iniciarPixel } from '@/lib/metaPixel'
import { LineaLegal } from '@/components/legal/PaginaLegal'

// Prueba gratis de 15 días (26-10, app/registro/page.tsx → POST /api/registro). Mismo formato que la entrada:
// panel negro de marca a la izquierda y el formulario a la derecha. Al crear la cuenta entra sola y va al inicio,
// donde el primer paso es conectar MercadoLibre (sin eso no funciona nada y los 15 días no arrancan).
// 19-11 (el dueño): título y lista al día con el anuncio (la IA responde sola, Radar incluido, Inventario como paso
// opcional); sin «Usuario para entrar» (se arma desde el correo y se entra con usuario o correo).
const TITULO = <>Automatiza tu tienda de MercadoLibre y <span className="text-lime-400">recupera tu tiempo.</span></>
const INCLUYE = [
  { t: 'Preguntas con IA',     d: 'La IA responde sola tus preguntas, a cualquier hora, en todas tus cuentas' },
  { t: 'Mensajes y calificaciones', d: 'Ninguna venta sin atender, calificaciones en bloque' },
  { t: 'Pagos MercadoEnvíos',  d: 'Los pagos y comprobantes traídos solos, listos para verificar' },
  { t: 'Despachos',            d: 'Las guías de todas tus cuentas en un PDF, con manifiesto y aviso al comprador' },
  { t: 'Stock y avisos por Telegram', d: 'Lo que se agota y lo pendiente del día, aunque no entres' },
  { t: 'Radar',                d: 'Mira qué se vende en MercadoLibre y a qué precio' },
]
const EN_CELULAR = ['La IA responde sola', 'Pagos de MercadoEnvíos', 'Guías en un clic']
const PASOS = [
  'Crea tu cuenta (1 minuto).',
  'Conecta tu cuenta de MercadoLibre: tus 15 días corren desde que te registras.',
  'Al terminar, escríbenos para seguir sin perder nada.',
]

export default function RegistroForm({ marca }: { marca: Marca }) {
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [verClave, setVerClave] = useState(false)
  const [creada, setCreada]     = useState<{ usuario: string; correo: string } | null>(null)

  // Contador de visitas (27-10, migración 128): una por carga en el navegador; de dónde vino = utm_source o el sitio.
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    let ref = ''
    try { const h = document.referrer ? new URL(document.referrer).hostname : ''; ref = h && h !== location.hostname ? h.replace(/^(www|l|lm|m)\./, '') : '' } catch {}
    const origen = q.get('utm_source') || (q.has('fbclid') ? 'facebook' : '') || ref
    fetch('/api/registro/visita', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origen }), keepalive: true }).catch(() => {})
    iniciarPixel()   // 19-11: píxel de Meta solo en esta página (lib/metaPixel.ts)
  }, [])

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true); setError('')
    const f = new FormData(e.currentTarget)
    const datos = Object.fromEntries(['negocio', 'nombre', 'correo', 'whatsapp', 'telegram', 'clave', 'sitio'].map(k => [k, String(f.get(k) ?? '')]))
    const r = await fetch('/api/registro', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'No se pudo crear la cuenta. Intenta de nuevo.'); setLoading(false); return }
    await eventoPixel('CompleteRegistration')   // Meta aprende quién se registra (sin datos personales)
    const usuario = String(d.usuario ?? '')
    const s = usuario ? await signIn('credentials', { username: usuario, password: datos.clave, redirect: false }) : null
    // Le mostramos con qué entra (no eligió usuario) y sigue solo. Navegación completa: la sesión se lee del servidor.
    setCreada({ usuario, correo: datos.correo.trim().toLowerCase() })
    setTimeout(() => window.location.assign(s?.ok ? '/' : '/login'), 4500)
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
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight">{TITULO}</h1>
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
          <p className="mt-5 flex gap-3 text-sm text-neutral-500">
            <span className="mt-1.5 w-2 h-2 rounded-full border border-neutral-500 shrink-0" aria-hidden="true" />
            <span><span className="font-semibold text-neutral-300">Cuando quieras: Inventario</span> · stock, compras, ventas y cuánto
              ganas de verdad. Se activa después y te ayudamos a cargarlo.</span>
          </p>
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
        <p className="relative mt-1 text-xl font-semibold leading-snug tracking-tight">{TITULO}</p>
        <ul className="relative mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-200">
          {EN_CELULAR.map(t => <li key={t} className="flex items-center gap-1"><span className="text-lime-400" aria-hidden="true">✓</span>{t}</li>)}
        </ul>
        <p className="relative mt-2 text-xs text-neutral-400">Sin tarjeta. Los 15 días corren desde que te registras.</p>
      </header>

      {/* Formulario */}
      <main className="flex flex-col items-center justify-center px-6 py-10 bg-neutral-50 lg:bg-white">
        <div className="w-full max-w-sm">
          {creada ? (
            <div role="status" className="rounded-2xl border border-lime-300 bg-lime-50 p-6">
              <p className="text-2xl font-semibold text-neutral-900 tracking-tight">¡Tu cuenta está lista!</p>
              <p className="mt-3 text-sm text-neutral-700">Para entrar usa tu correo <b className="break-all">{creada.correo}</b>
                {creada.usuario && <> o tu usuario <b>{creada.usuario}</b></>}, con la contraseña que elegiste.</p>
              <p className="mt-4 flex items-center gap-2 text-sm text-neutral-500">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-lime-600 border-t-transparent" aria-hidden="true" />
                Entrando a tu cuenta…
              </p>
            </div>
          ) : <>
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
            <LineaLegal accion="Al crear tu cuenta" className="text-center" />
          </form>

          <p className="text-sm text-neutral-500 mt-6">Al terminar la prueba eliges tu plan · <a href="/precios" className="font-medium text-lime-700 underline underline-offset-2">Ver planes</a></p>
          <p className="text-sm text-neutral-500 mt-2">¿Ya tienes cuenta? <a href="/login" className="font-medium text-lime-700 underline underline-offset-2">Entrar</a></p>
          <p className="text-xs text-neutral-400 mt-2">¿Dudas? <a href={TELEGRAM_SOPORTE} target="_blank" rel="noopener noreferrer" className="underline">Escríbenos por Telegram</a>.</p>
          </>}
          <p className="lg:hidden text-xs text-neutral-400 mt-10 text-center">
            © {new Date().getFullYear()} El Comerciante Digital · Todos los derechos reservados
          </p>
        </div>
      </main>
    </div>
  )
}
