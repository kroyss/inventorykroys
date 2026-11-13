'use client'
// «¿Olvidaste tu contraseña?» (13-11-2026, el dueño, mig. 175). Paso 1: usuario o correo → código de 6 números al correo
// y al Telegram vinculado; la pantalla dice por dónde salió (tapado) o, si no tiene ninguno, a quién pedirle ayuda.
// Paso 2: código + clave nueva. Paso 3: listo → Entrar. API: /api/recuperar-clave (ResultadoPedido en lib/recuperarClave).
import { useEffect, useState, type FormEvent } from 'react'
import { TELEGRAM_SOPORTE } from '@/lib/cuenta'
import type { ResultadoPedido } from '@/lib/recuperarClave'

type Paso = 'pedir' | 'codigo' | 'sin_canal' | 'listo'
const ERROR_PEDIDO: Record<'no_existe' | 'frenado' | 'fallo', string> = {
  no_existe: 'No encontramos ese usuario o correo. Revisa cómo lo escribiste.',
  frenado: 'Pediste varios códigos seguidos. Espera una hora o escríbenos.',
  fallo: 'No pudimos enviar el código ahora. Prueba en unos minutos o escríbenos.',
}
const ESPERA_REENVIO = 60
const campo = `w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-sm text-neutral-900 bg-white
  focus:outline-none focus:ring-2 focus:ring-lime-400 focus:border-lime-400`

export default function RecuperarClave() {
  const [paso, setPaso] = useState<Paso>('pedir')
  const [usuario, setUsuario] = useState('')
  const [codigo, setCodigo] = useState('')
  const [clave, setClave] = useState('')
  const [repetir, setRepetir] = useState('')
  const [verClave, setVerClave] = useState(false)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [espera, setEspera] = useState(0)
  const [destino, setDestino] = useState<{ correo: string | null; telegram: string | null }>({ correo: null, telegram: null })
  const [esAdmin, setEsAdmin] = useState(false)

  useEffect(() => {
    if (espera <= 0) return
    const t = setTimeout(() => setEspera(e => e - 1), 1000)
    return () => clearTimeout(t)
  }, [espera])

  async function llamar(cuerpo: object): Promise<{ error: string | null; datos: Record<string, unknown> }> {
    const r = await fetch('/api/recuperar-clave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }).catch(() => null)
    const d = await r?.json().catch(() => ({})) ?? {}
    return { error: r?.ok ? null : (d?.error ?? 'No se pudo conectar. Prueba de nuevo.'), datos: d }
  }
  const enviar = async (cuerpo: object) => (await llamar(cuerpo)).error

  async function pedir(e?: FormEvent) {
    e?.preventDefault()
    if (!usuario.trim()) { setError('Escribe tu usuario o tu correo'); return }
    setCargando(true); setError('')
    const { error: err, datos } = await llamar({ paso: 'pedir', usuario })
    setCargando(false)
    if (err) { setError(err); return }
    const res = datos as ResultadoPedido
    if (res.estado === 'enviado') {
      setDestino({ correo: res.correo, telegram: res.telegram })
      setPaso('codigo'); setEspera(ESPERA_REENVIO); setCodigo('')
    } else if (res.estado === 'sin_canal') {
      setEsAdmin(res.admin); setPaso('sin_canal')
    } else {
      setError(ERROR_PEDIDO[res.estado] ?? ERROR_PEDIDO.fallo)
    }
  }

  async function cambiar(e: FormEvent) {
    e.preventDefault()
    if (clave !== repetir) { setError('Las dos claves no coinciden'); return }
    setCargando(true); setError('')
    const err = await enviar({ paso: 'cambiar', usuario, codigo, clave })
    setCargando(false)
    if (err) { setError(err); return }
    setPaso('listo')
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-lime-100 text-lime-700" aria-hidden>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 9.2-9.2M17 6l3 3M14 9l2 2" /></svg>
          </div>

          {paso === 'pedir' && (
            <form onSubmit={pedir} className="space-y-4">
              <div>
                <h1 className="text-xl font-semibold text-neutral-900">Recuperar tu clave</h1>
                <p className="mt-1 text-sm text-neutral-500">Te mandamos un código a tu correo y a tu Telegram (si lo vinculaste).</p>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-neutral-600">Usuario o correo</span>
                <input autoFocus value={usuario} onChange={e => setUsuario(e.target.value)} autoComplete="username"
                  autoCapitalize="none" spellCheck={false} className={campo} />
              </label>
              {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <button type="submit" disabled={cargando}
                className="w-full rounded-lg bg-lime-400 py-2.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-lime-300 disabled:opacity-50">
                {cargando ? 'Enviando…' : 'Enviarme el código'}
              </button>
            </form>
          )}

          {paso === 'codigo' && (
            <form onSubmit={cambiar} className="space-y-4">
              <div>
                <h1 className="text-xl font-semibold text-neutral-900">
                  {destino.correo && destino.telegram !== null ? 'Revisa tu correo o Telegram' : destino.correo ? 'Revisa tu correo' : 'Revisa tu Telegram'}
                </h1>
                <p className="mt-1 text-sm text-neutral-500">Te mandamos un código de 6 números:</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {destino.correo && (
                    <li className="flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-neutral-700">
                      <span aria-hidden>✉️</span><span>a tu correo <b className="font-mono">{destino.correo}</b></span>
                    </li>
                  )}
                  {destino.telegram !== null && (
                    <li className="flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-neutral-700">
                      <span aria-hidden>💬</span><span>a tu Telegram{destino.telegram && <> <b className="font-mono">{destino.telegram}</b></>}</span>
                    </li>
                  )}
                </ul>
                {destino.correo && <p className="mt-2 text-xs text-neutral-400">Si no ves el correo, mira en spam o promociones.</p>}
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-neutral-600">Código</span>
                <input autoFocus value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric" autoComplete="one-time-code" placeholder="000000"
                  className={`${campo} text-center font-mono text-2xl tracking-[0.5em]`} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-neutral-600">Clave nueva</span>
                <div className="relative">
                  <input type={verClave ? 'text' : 'password'} value={clave} onChange={e => setClave(e.target.value)}
                    autoComplete="new-password" minLength={8} className={`${campo} pr-16`} />
                  <button type="button" onClick={() => setVerClave(v => !v)}
                    className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-neutral-500 hover:text-neutral-800">{verClave ? 'Ocultar' : 'Ver'}</button>
                </div>
                <span className="mt-1 block text-[11px] text-neutral-400">Mínimo 8 caracteres.</span>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-neutral-600">Repite la clave nueva</span>
                <input type={verClave ? 'text' : 'password'} value={repetir} onChange={e => setRepetir(e.target.value)}
                  autoComplete="new-password" className={campo} />
              </label>
              {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <button type="submit" disabled={cargando || codigo.length !== 6 || !clave || !repetir}
                className="w-full rounded-lg bg-lime-400 py-2.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-lime-300 disabled:opacity-50">
                {cargando ? 'Guardando…' : 'Cambiar mi clave'}
              </button>
              <div className="flex items-center justify-between text-xs">
                <button type="button" onClick={() => { setPaso('pedir'); setError('') }} className="text-neutral-500 hover:text-neutral-800">← Otro usuario</button>
                <button type="button" onClick={() => pedir()} disabled={espera > 0 || cargando}
                  className="font-medium text-lime-700 hover:text-lime-900 disabled:text-neutral-400">
                  {espera > 0 ? `Reenviar en ${espera} s` : 'Reenviar código'}
                </button>
              </div>
            </form>
          )}

          {paso === 'sin_canal' && (
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-semibold text-neutral-900">Tu cuenta no tiene correo ni Telegram</h1>
                <p className="mt-1 text-sm text-neutral-500">
                  {esAdmin
                    ? 'No tenemos a dónde mandarte el código. Escríbenos por Telegram y te ayudamos a recuperar tu clave.'
                    : 'No tenemos a dónde mandarte el código. Pídele al administrador de tu empresa que te ponga una clave nueva (en Usuarios → Cambiar contraseña).'}
                </p>
              </div>
              {esAdmin
                ? <a href={TELEGRAM_SOPORTE} target="_blank" rel="noopener noreferrer"
                    className="block w-full rounded-lg bg-sky-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-sky-500">Escribir a soporte por Telegram</a>
                : <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">Pídele también que agregue tu correo (o vincula tu Telegram en Mis avisos cuando entres) para recuperarla solo la próxima vez.</p>}
              <button type="button" onClick={() => { setPaso('pedir'); setError('') }}
                className="w-full rounded-lg border border-neutral-300 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">← Probar con otro usuario</button>
            </div>
          )}

          {paso === 'listo' && (
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-semibold text-neutral-900">Listo, tu clave cambió</h1>
                <p className="mt-1 text-sm text-neutral-500">Entra con tu usuario y la clave nueva. Por seguridad se cerraron tus sesiones abiertas en otros equipos.</p>
              </div>
              <a href="/login" className="block w-full rounded-lg bg-lime-400 py-2.5 text-center text-sm font-semibold text-neutral-950 hover:bg-lime-300">Entrar</a>
            </div>
          )}
        </div>

        {(paso === 'pedir' || paso === 'codigo') && <>
          <p className="mt-5 text-center text-xs text-neutral-500">
            ¿No te llega el código o tu cuenta no tiene correo?{' '}
            <a href={TELEGRAM_SOPORTE} target="_blank" rel="noopener noreferrer" className="font-medium text-sky-700 hover:underline">Escríbenos</a>
          </p>
          <p className="mt-2 text-center text-xs"><a href="/login" className="text-neutral-500 hover:text-neutral-800">← Volver a entrar</a></p>
        </>}
      </div>
    </div>
  )
}
