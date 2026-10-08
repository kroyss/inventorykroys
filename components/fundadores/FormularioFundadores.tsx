'use client'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  CUPOS_ESPERA, FECHA_LIMITE_ACTIVACION, fechaTanda, MENSAJE_MAX, PREGUNTAS, saltaAContacto, type Pregunta,
} from '@/lib/fundadores'

type Campo = Pregunta['campo']

// Id al azar guardado en el navegador: para notar a la misma persona mandando varias
// solicitudes con otro Telegram (no bloquea; marca la solicitud para revisarla).
function navegadorId() {
  try {
    let id = localStorage.getItem('ecd_nav')
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('ecd_nav', id) }
    return id
  } catch { return undefined }
}

/** Anota un paso del embudo (vista / empezó / envió) con el origen de la visita. Sin esperar
 *  respuesta: si falla, no afecta nada. La vista previa (?vista=previa) no se cuenta. */
function medir(evento: 'vista' | 'empezo' | 'enviado') {
  try {
    const q = new URLSearchParams(window.location.search)
    if (q.get('vista') === 'previa') return
    const id = navegadorId()
    if (!id) return
    // El origen de la PRIMERA visita queda guardado: si vuelve más tarde por el link directo,
    // sigue contando para el anuncio que lo trajo.
    let o: { utm_source?: string; utm_campaign?: string; referrer?: string } = {}
    const guardado = localStorage.getItem('ecd_origen')
    if (guardado) o = JSON.parse(guardado)
    else {
      o = { utm_source: q.get('utm_source') ?? undefined, utm_campaign: q.get('utm_campaign') ?? undefined,
            referrer: document.referrer || undefined }
      localStorage.setItem('ecd_origen', JSON.stringify(o))
    }
    fetch('/api/fundadores', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ navegador_id: id, evento, ...o }),
    }).catch(() => {})
  } catch { /* sin localStorage: no se mide */ }
}

interface Props {
  abierta: boolean            // hoy cae en los días de inscripción de una tanda
  previa?: boolean            // /fundadores?vista=previa: se ve el formulario completo pero no se envía
  proxima: string | null      // "domingo 11 y lunes 12 de octubre" (próxima inscripción)
  resultados: string | null   // "martes 6 de octubre" (cuándo se anuncia la selección)
}

// Un paso por pregunta (las de una opción avanzan solas al elegir) y un último paso de contacto.
const PASOS = PREGUNTAS.length + 1

export default function FormularioFundadores({ abierta, previa = false, proxima, resultados }: Props) {
  const [paso, setPaso] = useState(0)
  const [resp, setResp] = useState<Partial<Record<Campo, string[]>>>({})
  const [contacto, setContacto] = useState({ nombre: '', telegram: '', instagram: '', nick_ml: '', mensaje: '' })
  const [acepta, setAcepta] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<{ nombre: string; contacto: string; repetida: boolean } | null>(null)
  const caja = useRef<HTMLFormElement>(null)
  const avance = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Al cambiar de paso, si el inicio del formulario quedó fuera de la pantalla (celular), volver a él.
  useEffect(() => {
    const el = caja.current
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [paso])
  useEffect(() => () => clearTimeout(avance.current), [])
  useEffect(() => { medir('vista') }, [])
  // "Empezó" = respondió la primera pregunta.
  const empezo = useRef(false)
  useEffect(() => {
    if (!empezo.current && Object.keys(resp).length > 0) { empezo.current = true; medir('empezo') }
  }, [resp])

  const ir = (n: number) => { clearTimeout(avance.current); setError(null); setPaso(Math.max(0, Math.min(PASOS - 1, n))) }

  function elegir(p: Pregunta, valor: string) {
    const ya = resp[p.campo] ?? []
    if (p.multiple) {
      // "No, ninguna" (exclusiva) no se combina con las demás: marcar una desmarca la otra.
      const excl = new Set(p.opciones.filter(o => o.exclusiva).map(o => o.valor))
      const nuevo = ya.includes(valor) ? ya.filter(v => v !== valor)
        : excl.has(valor) ? [valor] : [...ya.filter(v => !excl.has(v)), valor]
      setResp(r => ({ ...r, [p.campo]: nuevo }))
      return
    }
    setResp(r => ({ ...r, [p.campo]: [valor] }))
    clearTimeout(avance.current)
    // "Hago marketing, sin cuenta": directo al contacto (no tiene ventas que contar).
    const marketing = saltaAContacto({ [p.campo]: valor })
    avance.current = setTimeout(() => setPaso(n => marketing ? PASOS - 1 : Math.min(PASOS - 1, n + 1)), 220)
  }

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const faltan = saltaAContacto(resp) ? -1 : PREGUNTAS.findIndex(p => !resp[p.campo]?.length)
    if (faltan >= 0) { setPaso(faltan); setError('Falta responder esta pregunta'); return }
    if (!contacto.telegram.trim() && !contacto.instagram.trim()) { setError('Escribe tu usuario de Telegram o de Instagram (al menos uno)'); return }
    if (!acepta) { setError(`Marca que inicias tu activación antes del ${fechaTanda(FECHA_LIMITE_ACTIVACION)}`); return }
    if (previa) { setError('Vista previa: la postulación no se envía.'); return }
    setEnviando(true)
    try {
      const body = {
        ...contacto,
        acepta_plazo: acepta,
        sitio: String(new FormData(e.currentTarget).get('sitio') ?? ''),
        navegador_id: navegadorId(),
        ...Object.fromEntries(PREGUNTAS.filter(p => !saltaAContacto(resp) || p.campo === 'tipo')
          .map(p => [p.campo, p.multiple ? resp[p.campo] : resp[p.campo]?.[0]])),
      }
      const r = await fetch('/api/fundadores', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? 'No se pudo enviar. Intenta de nuevo.'); return }
      medir('enviado')
      setHecho({ nombre: body.nombre.trim().split(' ')[0], contacto: (body.telegram || body.instagram).trim().replace(/^@/, ''), repetida: !!d.repetida })
    } finally { setEnviando(false) }
  }

  if (hecho) {
    return (
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8 shadow-sm self-start">
        <div className="w-11 h-11 rounded-full bg-lime-100 text-lime-700 grid place-items-center text-xl">✓</div>
        <h2 className="mt-4 text-xl font-semibold text-neutral-900">
          {hecho.repetida ? 'Ya tenemos tu postulación' : `¡Listo, ${hecho.nombre}!`}
        </h2>
        <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
          {hecho.repetida
            ? <>Ya recibimos una postulación de <b>@{hecho.contacto}</b>. No hace falta enviarla de nuevo.</>
            : <>Recibimos tu postulación. Los seleccionados y la lista de espera se anuncian el <b>{resultados ?? 'día siguiente al cierre'}</b> en
              esta página y en nuestra Comunidad de Vendedores de Telegram, con tu usuario <b>@{hecho.contacto}</b>.</>}
        </p>
        <p className="mt-3 text-sm text-neutral-500 leading-relaxed">
          Si esta vez no se da, no te preocupes: se abrirán nuevas oportunidades para tu perfil.
        </p>
        <a href="https://t.me/comerciantedigitalve" target="_blank" rel="noopener noreferrer"
          className="mt-4 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-900 hover:bg-sky-100">
          <span aria-hidden="true">✈️</span>
          <span>Mientras tanto, únete a nuestra <b>Comunidad de Vendedores</b> en Telegram: <span className="underline underline-offset-2">t.me/comerciantedigitalve</span></span>
        </a>
      </section>
    )
  }

  if (!abierta && !previa) {
    return (
      <section id="solicitud" className="scroll-mt-6 rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8 shadow-sm self-start">
        <h2 className="text-xl font-semibold text-neutral-900">Postúlate</h2>
        {proxima ? <>
          <p className="mt-3 text-sm text-neutral-600 leading-relaxed">
            Las postulaciones son el <b className="text-neutral-900">{proxima}</b>. Esos días aparece aquí mismo el
            formulario: toma 2 minutos.
          </p>
          <p className="mt-3 text-sm text-neutral-500 leading-relaxed">
            Ten a mano tu usuario de Telegram o de Instagram y, si quieres, tu nick de MercadoLibre.
          </p>
        </> : (
          <p className="mt-3 text-sm text-neutral-600 leading-relaxed">
            Las postulaciones de esta ronda están cerradas. Pronto abriremos nuevos cupos.
          </p>
        )}
      </section>
    )
  }

  const pregunta = PREGUNTAS[paso] as Pregunta | undefined
  const listo = pregunta ? !!resp[pregunta.campo]?.length : true
  const campo = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-lime-600 focus:ring-2 focus:ring-lime-400/50'
  const set = (k: keyof typeof contacto) => (e: { target: { value: string } }) => setContacto(c => ({ ...c, [k]: e.target.value }))

  return (
    <form ref={caja} id="solicitud" onSubmit={enviar}
      className="scroll-mt-6 rounded-2xl border border-neutral-200 bg-white shadow-sm self-start overflow-hidden">
      {/* Progreso */}
      <div className="h-1 bg-neutral-100" aria-hidden="true">
        <div className="h-full bg-lime-400 transition-[width] duration-300" style={{ width: `${((paso + 1) / PASOS) * 100}%` }} />
      </div>

      {previa && (
        <p className="bg-amber-50 border-b border-amber-200 text-amber-800 text-xs px-6 py-2">
          Vista previa: puedes recorrer todas las preguntas, pero la postulación no se envía.
        </p>
      )}
      <div className="p-6 sm:p-8">
        <div className="flex items-center justify-between text-xs text-neutral-400">
          <span className="font-semibold uppercase tracking-[0.15em] text-neutral-500">Postulación</span>
          <span className="num">Paso {paso + 1} de {PASOS}</span>
        </div>

        {/* Trampa para bots: invisible para personas */}
        <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
          <label>Sitio web <input name="sitio" tabIndex={-1} autoComplete="off" /></label>
        </div>

        {pregunta ? (
          <fieldset key={pregunta.campo} className="mt-4">
            <legend className="text-lg font-semibold text-neutral-900 leading-snug">{pregunta.texto}</legend>
            {pregunta.multiple && !pregunta.ayuda ? (
              <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-lime-700">
                <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="1.5" y="1.5" width="6" height="6" rx="1.5" /><path d="m3 4.5 1.2 1.2L6.2 3.4" />
                  <rect x="8.5" y="8.5" width="6" height="6" rx="1.5" /><path d="m10 11.5 1.2 1.2 2-2.3" />
                </svg>
                Puedes marcar varias
              </p>
            ) : <p className="mt-1 text-sm text-neutral-400">
              {pregunta.ayuda ?? (paso === 0 ? `Toma 2 minutos.${resultados ? ` La selección se anuncia el ${resultados}.` : ''}` : 'Elige una.')}
            </p>}
            <div className="mt-5 space-y-2" role={pregunta.multiple ? 'group' : 'radiogroup'}>
              {pregunta.opciones.map(o => {
                const on = !!resp[pregunta.campo]?.includes(o.valor)
                return (
                  <button key={o.valor} type="button" onClick={() => elegir(pregunta, o.valor)}
                    role={pregunta.multiple ? 'checkbox' : 'radio'} aria-checked={on}
                    className={`w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-[15px] transition-colors ${
                      on ? 'border-lime-500 bg-lime-50 text-neutral-900 font-medium' : 'border-neutral-200 text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50'}`}>
                    {o.texto}
                    <span aria-hidden="true" className={`grid place-items-center w-5 h-5 shrink-0 border transition-colors ${
                      pregunta.multiple ? 'rounded-md' : 'rounded-full'} ${on ? 'bg-lime-500 border-lime-500 text-white' : 'border-neutral-300'}`}>
                      {on && <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3.5 8.5 3 3 6-7" /></svg>}
                    </span>
                  </button>
                )
              })}
            </div>
          </fieldset>
        ) : (
          <div className="mt-4">
            <h3 className="text-lg font-semibold text-neutral-900">¿Dónde te escribimos?</h3>
            <p className="mt-1 text-sm text-neutral-400">
              Toda la atención y la Comunidad de Vendedores están en <b className="font-medium text-neutral-600">Telegram</b>. Si no
              lo usas, déjanos tu Instagram y te escribimos por ahí. Los seleccionados se anuncian con ese usuario en esta página.
            </p>
            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="nombre" className="block text-sm font-medium text-neutral-700 mb-1">Tu nombre</label>
                <input id="nombre" value={contacto.nombre} onChange={set('nombre')} required maxLength={80} autoComplete="name" className={campo} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="telegram" className="block text-sm font-medium text-neutral-700 mb-1">Usuario de Telegram <span className="font-normal text-lime-700">(recomendado)</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400" aria-hidden="true">@</span>
                    <input id="telegram" value={contacto.telegram} onChange={set('telegram')} maxLength={80} placeholder="tuusuario"
                      autoCapitalize="none" spellCheck={false} className={`${campo} pl-7`} />
                  </div>
                </div>
                <div>
                  <label htmlFor="instagram" className="block text-sm font-medium text-neutral-700 mb-1">¿No usas Telegram? Tu Instagram</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400" aria-hidden="true">@</span>
                    <input id="instagram" value={contacto.instagram} onChange={set('instagram')} maxLength={120} placeholder="tuusuario"
                      autoCapitalize="none" spellCheck={false} className={`${campo} pl-7`} />
                  </div>
                </div>
                <div>
                  <label htmlFor="nick_ml" className="flex items-baseline justify-between gap-2 whitespace-nowrap text-sm font-medium text-neutral-700 mb-1">
                    Nick de MercadoLibre <span className="text-xs font-normal text-neutral-400">opcional</span>
                  </label>
                  <input id="nick_ml" value={contacto.nick_ml} onChange={set('nick_ml')} maxLength={40}
                    autoCapitalize="none" spellCheck={false} className={campo} />
                </div>
              </div>
              <a href="https://t.me/comerciantedigitalve" target="_blank" rel="noopener noreferrer"
                className="-mt-1 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 hover:bg-sky-100">
                <span aria-hidden="true">✈️</span>
                <span>¿Aún no estás en nuestra <b>Comunidad de Vendedores</b>? Únete en Telegram: <span className="underline underline-offset-2">t.me/comerciantedigitalve</span></span>
              </a>
              <div>
                <label htmlFor="mensaje" className="flex items-baseline justify-between gap-2 text-sm font-medium text-neutral-700 mb-1">
                  ¿Algo más que quieras contarnos? <span className="text-xs font-normal text-neutral-400 whitespace-nowrap">opcional</span>
                </label>
                <textarea id="mensaje" rows={3} maxLength={MENSAJE_MAX} value={contacto.mensaje} onChange={set('mensaje')}
                  placeholder="Qué vendes, qué te gustaría resolver, por qué quieres ser Fundador…"
                  className={`${campo} resize-none`} />
                <p className={`mt-1 text-right text-xs num ${contacto.mensaje.length >= MENSAJE_MAX ? 'text-amber-600' : 'text-neutral-400'}`}>
                  {contacto.mensaje.length}/{MENSAJE_MAX}
                </p>
              </div>
              <label className="flex items-start gap-3 rounded-lg border border-lime-300 bg-lime-50 px-3 py-2.5 text-sm text-neutral-800 cursor-pointer">
                <input type="checkbox" checked={acepta} onChange={e => setAcepta(e.target.checked)} className="mt-0.5 w-4 h-4 accent-lime-600 shrink-0" />
                <span>
                  Si quedo seleccionado, <b>inicio mi activación antes del {fechaTanda(FECHA_LIMITE_ACTIVACION)}</b>. Si no, mi cupo pasa
                  a la lista de espera ({CUPOS_ESPERA} cupos).
                </span>
              </label>
            </div>
          </div>
        )}

        {error && <p role="alert" className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="mt-6 flex items-center justify-between gap-3">
          {paso > 0
            ? <button type="button" onClick={() => ir(!pregunta && saltaAContacto(resp) ? 0 : paso - 1)} className="text-sm text-neutral-500 hover:text-neutral-900 px-1 py-2">← Atrás</button>
            : <span />}
          {pregunta ? (
            (pregunta.multiple || listo) && (
              <button type="button" disabled={!listo} onClick={() => ir(paso + 1)}
                className="bg-neutral-900 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-neutral-700 transition-colors disabled:opacity-30">
                Continuar
              </button>
            )
          ) : (
            <button type="submit" disabled={enviando}
              className="bg-lime-400 text-neutral-950 px-6 py-3 rounded-lg text-sm font-semibold hover:bg-lime-300 transition-colors disabled:opacity-50">
              {enviando ? 'Enviando…' : 'Enviar postulación'}
            </button>
          )}
        </div>
      </div>
    </form>
  )
}
