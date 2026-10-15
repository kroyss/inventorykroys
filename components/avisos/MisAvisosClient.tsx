'use client'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { PageHeader } from '@/components/ui'
import { useConfirm } from '@/components/ui/ConfirmProvider'

// "Mis avisos" (2026-10-14): cada persona conecta SU Telegram y elige qué avisos recibir en la
// empresa actual. Avisa lo que la app de MercadoLibre no avisa (lib/avisosTelegram.ts).

interface Prefs {
  desconectada: boolean
  pregunta: boolean; pregunta_min: number
  mensaje: boolean; mensaje_min: number
  negativa: boolean; neutral: boolean
  contradictoria: boolean
  resumen: boolean; resumen_hora: number
  silencio: boolean; silencio_desde: number; silencio_hasta: number
}
interface Estado {
  bot: string | null
  conectado: { usuario: string | null; nombre: string | null; desde: string } | null
  error: string | null
  prefs: Prefs
  disponibles: { desconectada: boolean; pregunta: boolean; mensaje: boolean; negativa: boolean; resumen: boolean }
  empresa: string | null
  staging: boolean
}

const MINUTOS = [0, 15, 30, 60, 120, 240]
const minTxt = (m: number) => m === 0 ? 'al instante (cada una que entre)' : m < 60 ? `${m} minutos` : m === 60 ? '1 hora' : `${m / 60} horas`
const horaTxt = (h: number) => `${String(h).padStart(2, '0')}:00`
const HORAS = Array.from({ length: 24 }, (_, h) => h)

export default function MisAvisosClient() {
  const confirmar = useConfirm()
  const [e, setE] = useState<Estado | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [esperando, setEsperando] = useState<string | null>(null)      // link mientras espera "Iniciar"
  const [guardado, setGuardado] = useState<'guardando' | 'listo' | null>(null)
  const [prueba, setPrueba] = useState<'enviando' | 'ok' | string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cargar = useCallback(async (revisar = false) => {
    const r = await fetch(`/api/avisos-telegram${revisar ? '?revisar=1' : ''}`, { cache: 'no-store' })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'No se pudo cargar'); return null }
    setE(d); setError(null)
    return d as Estado
  }, [])
  useEffect(() => { cargar() }, [cargar])

  // Esperando que toque "Iniciar" en Telegram: revisa cada 2,5 s (hasta 15 min, lo que dura el código).
  useEffect(() => {
    if (!esperando) return
    const inicio = Date.now()
    const t = setInterval(async () => {
      const d = await cargar(true)
      if (d?.conectado || Date.now() - inicio > 15 * 60_000) { setEsperando(null); clearInterval(t) }
    }, 2500)
    return () => clearInterval(t)
  }, [esperando, cargar])

  const conectar = async () => {
    // La pestaña se abre YA (si se abre después del fetch, el navegador la bloquea como ventana emergente).
    const ventana = window.open('', '_blank')
    setOcupado(true); setError(null)
    try {
      const r = await fetch('/api/avisos-telegram/conectar', { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { ventana?.close(); setError(d.error ?? 'No se pudo generar el link'); return }
      if (ventana) ventana.location.href = d.link
      setEsperando(d.link)
    } finally { setOcupado(false) }
  }

  const desconectar = async () => {
    if (!await confirmar({ title: 'Desconectar Telegram', message: 'Ya no te llegarán avisos a este Telegram (en ninguna de tus empresas). Puedes volver a conectarlo cuando quieras.', confirmText: 'Desconectar', danger: true })) return
    setOcupado(true)
    await fetch('/api/avisos-telegram', { method: 'DELETE' })
    await cargar(); setOcupado(false); setPrueba(null)
  }

  const mandarPrueba = async (tipo: 'prueba' | 'resumen' = 'prueba') => {
    setPrueba('enviando')
    const r = await fetch('/api/avisos-telegram/prueba', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo }) })
    const d = await r.json().catch(() => ({}))
    setPrueba(r.ok ? 'ok' : d.error ?? 'No se pudo enviar')
    if (!r.ok) cargar()
  }

  // Cada cambio se guarda solo (con una pausa corta para agrupar los cambios seguidos).
  const cambiar = (parcial: Partial<Prefs>) => {
    if (!e) return
    const prefs = { ...e.prefs, ...parcial }
    setE({ ...e, prefs }); setGuardado('guardando')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const r = await fetch('/api/avisos-telegram', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(prefs) })
      if (r.ok) { setGuardado('listo'); setTimeout(() => setGuardado(g => g === 'listo' ? null : g), 2500) }
      else { setGuardado(null); setError((await r.json().catch(() => ({}))).error ?? 'No se pudo guardar') }
    }, 450)
  }

  if (error && !e) return <><Cabecera /><p className="text-sm text-red-600">{error}</p></>
  if (!e) return <><Cabecera /><div className="space-y-4 max-w-3xl">{[0, 1].map(i => <div key={i} className="h-40 rounded-2xl bg-neutral-100 animate-pulse" />)}</div></>

  const p = e.prefs, d = e.disponibles
  const ocultos = !d.pregunta || !d.mensaje || !d.negativa

  return (
    <>
      <Cabecera />
      <div className="max-w-3xl space-y-4">
        {e.staging && (
          <p className="text-xs rounded-lg bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 px-3 py-2">
            Copia de pruebas: los avisos de aquí salen con los datos de staging. Lo que conectes aquí no se conecta en el sistema real.
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* ── Conexión ── */}
        <section className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-5">
          {e.conectado ? (
            <div className="flex flex-wrap items-center gap-4">
              <span className="relative shrink-0">
                <LogoTelegram className="h-12 w-12" />
                <span className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-emerald-500 ring-2 ring-white flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-neutral-900">Telegram conectado</p>
                <p className="text-sm text-neutral-500 truncate">
                  {e.conectado.usuario ? `@${e.conectado.usuario}` : e.conectado.nombre ?? 'Tu cuenta'}
                  {e.conectado.usuario && e.conectado.nombre ? ` · ${e.conectado.nombre}` : ''}
                  {' · desde el '}{new Date(e.conectado.desde).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </p>
                {prueba && prueba !== 'enviando' && (
                  <p className={`text-xs mt-1 ${prueba === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
                    {prueba === 'ok' ? '✓ Enviado. Revisa tu Telegram.' : prueba}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button onClick={() => mandarPrueba()} disabled={prueba === 'enviando'} className="btn-secondary text-sm flex-1 sm:flex-none">
                  {prueba === 'enviando' ? 'Enviando…' : 'Mandar aviso de prueba'}
                </button>
                <button onClick={desconectar} disabled={ocupado} className="btn-ghost text-sm text-neutral-500 hover:text-red-700 hover:bg-red-50">Desconectar</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-5">
              <LogoTelegram className="h-14 w-14 shrink-0" />
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <p className="font-semibold text-neutral-900 text-lg">Conecta tu Telegram</p>
                  <p className="text-sm text-neutral-500 mt-0.5">
                    Te avisamos al instante de lo que MercadoLibre no te avisa. El bot solo te escribe a ti, y solo lo que elijas abajo.
                  </p>
                </div>
                {e.error && <p className="text-xs rounded-lg bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 px-3 py-2">{e.error}</p>}
                {esperando ? (
                  <div className="rounded-xl bg-sky-50 ring-1 ring-inset ring-sky-200 p-4 space-y-2">
                    <p className="flex items-center gap-2 text-sm font-medium text-sky-900">
                      <span className="h-4 w-4 rounded-full border-2 border-sky-300 border-t-sky-600 animate-spin" />
                      Esperando que toques <b>Iniciar</b> en Telegram…
                    </p>
                    <p className="text-xs text-sky-800">
                      ¿No se abrió Telegram? <a href={esperando} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">Ábrelo aquí</a>.
                      En el teléfono se abre la app; en la computadora, Telegram Desktop o la web.
                    </p>
                    <button onClick={() => setEsperando(null)} className="text-xs text-sky-700 hover:underline">Cancelar</button>
                  </div>
                ) : (
                  <>
                    <ol className="grid gap-2 sm:grid-cols-3 text-sm">
                      {['Toca “Conectar Telegram”', 'En Telegram, toca “Iniciar”', 'Listo: vuelve aquí'].map((t, i) => (
                        <li key={i} className="flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-neutral-700">
                          <span className="h-5 w-5 shrink-0 rounded-full bg-neutral-900 text-white text-[11px] font-semibold flex items-center justify-center">{i + 1}</span>
                          {t}
                        </li>
                      ))}
                    </ol>
                    <button onClick={conectar} disabled={ocupado || !e.bot}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-[#229ED9] hover:bg-[#1b8cc2] shadow-sm transition-colors disabled:opacity-50 w-full sm:w-auto">
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true"><path d="M21.5 4.3 18.4 19c-.2 1-.8 1.3-1.7.8l-4.6-3.4-2.2 2.1c-.2.2-.5.4-1 .4l.3-4.7 8.6-7.8c.4-.3-.1-.5-.6-.2L6.6 12.9 2 11.5c-1-.3-1-1 .2-1.5L20.2 3c.8-.3 1.6.2 1.3 1.3Z" /></svg>
                      {ocupado ? 'Abriendo…' : 'Conectar Telegram'}
                    </button>
                    {!e.bot && <p className="text-xs text-red-600">El bot no responde en este momento. Prueba en unos minutos.</p>}
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ── Qué avisar ── */}
        <section className="bg-white rounded-2xl border border-neutral-200 shadow-sm">
          <header className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-neutral-100">
            <div>
              <h2 className="font-semibold text-neutral-900">Qué te avisamos</h2>
              <p className="text-xs text-neutral-500">
                {e.empresa ? <>En <b className="font-medium text-neutral-700">{e.empresa}</b>. </> : null}
                {!e.conectado && 'Se aplican cuando conectes tu Telegram.'}
              </p>
            </div>
            <EstadoGuardado estado={guardado} />
          </header>
          <ul className="divide-y divide-neutral-100">
            {d.desconectada && (
              <Fila icono="⚠️" titulo="Cuenta de MercadoLibre desconectada" etiqueta="Recomendado" on={p.desconectada} onCambio={v => cambiar({ desconectada: v })}
                ejemplo={'⚠️ PIKEKE se desconectó de MercadoLibre\n\nMientras no la reconectes no entran preguntas, mensajes ni ventas de esa cuenta.\n\n[ 🔌 Reconectar ahora ]'}>
                Si una cuenta pierde la conexión (por ejemplo, cambiaron la clave de ML), no entra nada de esa cuenta hasta reconectarla. MercadoLibre no avisa de esto.
              </Fila>
            )}
            {d.pregunta && (
              <Fila icono="❓" titulo="Pregunta sin responder" on={p.pregunta} onCambio={v => cambiar({ pregunta: v })}
                ejemplo={'❓ Pregunta sin responder · SOLUCIONES_MC · hace 35 min\n📦 Cable USB C 120w Carga Rápida 1m\n\n💬 “Buenas, ¿tendrás 2 disponibles?”\n\n[ Responder en el sistema ]'}>
                Avisarme <Selector valor={p.pregunta_min} opciones={MINUTOS} texto={v => v ? `si lleva ${minTxt(v)} sin respuesta` : minTxt(v)} onCambio={v => cambiar({ pregunta_min: v })} disabled={!p.pregunta} />.{' '}
                {p.pregunta_min ? 'Si el equipo responde antes, no te llega nada.' : 'Te llega cada pregunta apenas entra (en menos de un minuto).'} Si entran varias juntas, llegan en un solo aviso.
              </Fila>
            )}
            {d.mensaje && (
              <Fila icono="✉️" titulo="Mensaje de comprador sin responder" on={p.mensaje} onCambio={v => cambiar({ mensaje: v })}
                ejemplo={'✉️ Mensaje sin responder · PIKEKE · hace 1 h\n👤 Juan Pérez · 📦 Audífonos Bluetooth\n\n💬 “Buenas, ya hice el pago móvil”\n\n[ Abrir conversación ]'}>
                Avisarme <Selector valor={p.mensaje_min} opciones={MINUTOS} texto={v => v ? `si lleva ${minTxt(v)} sin respuesta` : minTxt(v)} onCambio={v => cambiar({ mensaje_min: v })} disabled={!p.mensaje} />{' '}
                cuando un comprador escribe después de la venta. {p.mensaje_min ? 'Si alguien le responde o lo lee antes, no te llega nada.' : 'Te llega cada mensaje apenas entra.'}
              </Fila>
            )}
            {d.negativa && (
              <Fila icono="👎" titulo="Calificación negativa recibida" on={p.negativa} onCambio={v => cambiar({ negativa: v })}
                ejemplo={'👎 Calificación NEGATIVA recibida · PIKEKE\n👤 Juan Pérez · venta 2000018974287326\n📦 Audífonos Bluetooth\n\n💬 “Llegó tarde”\n\n[ Ver en Reputación ]'}>
                Apenas un comprador te califica negativo, con su comentario, para que puedas responderle a tiempo.
                <label className="mt-2 flex items-center gap-2 text-neutral-600">
                  <input type="checkbox" checked={p.neutral} onChange={ev => cambiar({ neutral: ev.target.checked })} className="h-4 w-4 accent-neutral-900" />
                  Avisarme también las neutrales
                </label>
              </Fila>
            )}
            {d.negativa && (
              <Fila icono="🟣" titulo="Calificación contradictoria" on={p.contradictoria} onCambio={v => cambiar({ contradictoria: v })}
                ejemplo={'🟣 Calificación contradictoria · PIKEKE\n👤 DOUGLAJSA · venta 2000018742658414\n📦 Termómetro Digital Lcd\n\nEl comprador dijo que la venta SÍ se concretó (te calificó positiva) y tú la marcaste como no concretada.\n\n[ Corregir en Reputación ]'}>
                Cuando el comprador dice que la venta se concretó y tú la marcaste como no concretada. Se arregla con <b className="font-medium text-neutral-700">Corregir</b> en Reputación.
              </Fila>
            )}
            <Fila icono="☀️" titulo="Resumen diario" on={p.resumen} onCambio={v => cambiar({ resumen: v })}
              ejemplo={'☀️ Buenos días, Marcos. Tu resumen:\n\nAyer\n🛒 42 ventas en MercadoLibre\n❓ 61 preguntas, 59 respondidas · la mitad en menos de 18 min\n\nLo que hizo el sistema por ti\n✅ Calificó 31 ventas concretadas\n\nPendiente hoy\n⭐ 8 ventas por calificar\n📦 2 variantes agotadas'}>
              Todos los días a las <Selector valor={p.resumen_hora} opciones={HORAS.filter(h => h >= 5 && h <= 21)} texto={horaTxt} onCambio={v => cambiar({ resumen_hora: v })} disabled={!p.resumen} />:
              cómo te fue ayer, lo que hizo el sistema solo y lo que queda pendiente.
              {e.conectado && (
                <button type="button" onClick={() => mandarPrueba('resumen')} disabled={prueba === 'enviando'}
                  className="block mt-1.5 text-xs text-sky-700 hover:underline underline-offset-2 disabled:opacity-50">
                  Mandarme el resumen ahora
                </button>
              )}
            </Fila>
          </ul>
          {ocultos && (
            <p className="px-5 py-3 border-t border-neutral-100 text-xs text-neutral-400">
              Algunos avisos no aparecen porque tu usuario no tiene acceso a esa sección (Preguntas, Mensajes o Calificaciones).
            </p>
          )}
        </section>

        {/* ── Silencio ── */}
        <section className="bg-white rounded-2xl border border-neutral-200 shadow-sm">
          <ul><Fila icono="🌙" titulo="Horario de silencio" on={p.silencio} onCambio={v => cambiar({ silencio: v })}>
            De <Selector valor={p.silencio_desde} opciones={HORAS} texto={horaTxt} onCambio={v => cambiar({ silencio_desde: v })} disabled={!p.silencio} /> a{' '}
            <Selector valor={p.silencio_hasta} opciones={HORAS} texto={horaTxt} onCambio={v => cambiar({ silencio_hasta: v })} disabled={!p.silencio} /> no te llega nada.
            Lo que siga pendiente te llega al terminar el silencio.
          </Fila></ul>
        </section>
      </div>
    </>
  )
}

function Cabecera() {
  return <PageHeader title="Mis avisos" subtitle="Avisos en tu Telegram de lo que MercadoLibre no te avisa. Cada persona del equipo elige los suyos." />
}

function EstadoGuardado({ estado }: { estado: 'guardando' | 'listo' | null }) {
  if (!estado) return null
  return (
    <span className={`text-xs ${estado === 'listo' ? 'text-emerald-700' : 'text-neutral-400'}`}>
      {estado === 'listo' ? '✓ Guardado' : 'Guardando…'}
    </span>
  )
}

function Fila({ icono, titulo, etiqueta, on, onCambio, ejemplo, children }: {
  icono: string; titulo: string; etiqueta?: string; on: boolean; onCambio: (v: boolean) => void; ejemplo?: string; children: ReactNode
}) {
  const [ver, setVer] = useState(false)
  return (
    <li className="px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="text-xl leading-none mt-0.5 shrink-0" aria-hidden="true">{icono}</span>
        <div className={`min-w-0 flex-1 transition-opacity ${on ? '' : 'opacity-60'}`}>
          <p className="text-sm font-semibold text-neutral-900 flex flex-wrap items-center gap-2">
            {titulo}
            {etiqueta && <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-50 ring-1 ring-inset ring-emerald-200 rounded-full px-1.5 py-0.5">{etiqueta}</span>}
          </p>
          <div className="text-sm text-neutral-500 mt-0.5 leading-relaxed">{children}</div>
          {ejemplo && (
            <button type="button" onClick={() => setVer(v => !v)} className="mt-1.5 text-xs text-sky-700 hover:underline underline-offset-2">
              {ver ? 'Ocultar ejemplo' : 'Ver cómo llega'}
            </button>
          )}
          {ver && ejemplo && <Burbuja texto={ejemplo} />}
        </div>
        <Interruptor on={on} onCambio={onCambio} etiqueta={titulo} />
      </div>
    </li>
  )
}

/** Un mensaje como se ve en Telegram (los [ botones ] van aparte). */
function Burbuja({ texto }: { texto: string }) {
  const lineas = texto.split('\n')
  const botones = lineas.filter(l => /^\[ .* \]$/.test(l)).map(l => l.slice(2, -2))
  const cuerpo = lineas.filter(l => !/^\[ .* \]$/.test(l)).join('\n').trim()
  return (
    <div className="mt-2 rounded-xl bg-[#d9e7c8] p-3 max-w-md">
      <div className="rounded-lg rounded-tl-sm bg-white px-3 py-2 shadow-sm">
        <p className="text-[13px] text-neutral-800 whitespace-pre-line leading-snug">{cuerpo}</p>
      </div>
      {botones.map(b => (
        <div key={b} className="mt-1 rounded-lg bg-white/70 text-center text-[13px] font-medium text-sky-700 py-1.5">{b}</div>
      ))}
    </div>
  )
}

function Interruptor({ on, onCambio, etiqueta }: { on: boolean; onCambio: (v: boolean) => void; etiqueta: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={etiqueta} onClick={() => onCambio(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 ${on ? 'bg-emerald-500' : 'bg-neutral-300'}`}>
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

function Selector({ valor, opciones, texto, onCambio, disabled }: {
  valor: number; opciones: number[]; texto: (v: number) => string; onCambio: (v: number) => void; disabled?: boolean
}) {
  return (
    <select value={valor} onChange={ev => onCambio(Number(ev.target.value))} disabled={disabled}
      className="mx-0.5 inline-block rounded-md border border-neutral-300 bg-white px-1.5 py-0.5 text-sm font-medium text-neutral-800 disabled:opacity-60">
      {opciones.map(o => <option key={o} value={o}>{texto(o)}</option>)}
    </select>
  )
}

function LogoTelegram({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <circle cx="24" cy="24" r="24" fill="#229ED9" />
      <path fill="#fff" d="M35.6 14.3 31.9 33c-.3 1.3-1 1.6-2.1 1l-5.8-4.3-2.8 2.7c-.3.3-.6.6-1.2.6l.4-5.9 10.8-9.8c.5-.4-.1-.7-.7-.3l-13.4 8.4-5.7-1.8c-1.2-.4-1.3-1.2.3-1.8l22.4-8.6c1-.4 2 .2 1.5 1.9Z" />
    </svg>
  )
}
