'use client'
import { useState, type FormEvent } from 'react'
import { PREGUNTAS, type Pregunta } from '@/lib/fundadores'

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

export default function FormularioFundadores() {
  const [resp, setResp] = useState<Partial<Record<Campo, string>>>({})
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<{ nombre: string; telegram: string; repetida: boolean } | null>(null)

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const f = new FormData(e.currentTarget)
    const faltan = PREGUNTAS.filter(p => !resp[p.campo])
    if (faltan.length) { setError(`Falta responder: ${faltan[0].texto}`); return }
    setEnviando(true)
    try {
      const body = {
        nombre: String(f.get('nombre') ?? ''), telegram: String(f.get('telegram') ?? ''),
        nick_ml: String(f.get('nick_ml') ?? ''), sitio: String(f.get('sitio') ?? ''),
        navegador_id: navegadorId(), ...resp,
      }
      const r = await fetch('/api/fundadores', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? 'No se pudo enviar. Intenta de nuevo.'); return }
      setHecho({ nombre: body.nombre.trim().split(' ')[0], telegram: body.telegram.trim().replace(/^@/, ''), repetida: !!d.repetida })
    } finally { setEnviando(false) }
  }

  if (hecho) {
    return (
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8 shadow-sm self-start">
        <div className="w-11 h-11 rounded-full bg-lime-100 text-lime-700 grid place-items-center text-xl">✓</div>
        <h2 className="mt-4 text-xl font-semibold text-neutral-900">
          {hecho.repetida ? 'Ya tenemos tu solicitud' : `¡Listo, ${hecho.nombre}!`}
        </h2>
        <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
          {hecho.repetida
            ? <>Ya recibimos una solicitud de <b>@{hecho.telegram}</b> en esta ronda. No hace falta enviarla de nuevo.</>
            : <>Recibimos tu solicitud. Si quedas seleccionado te escribimos por Telegram a <b>@{hecho.telegram}</b>.</>}
        </p>
        <p className="mt-3 text-sm text-neutral-500 leading-relaxed">
          Si esta vez no se da, te avisamos cuando abramos nuevos cupos para tu perfil.
        </p>
      </section>
    )
  }

  const campo = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-lime-600 focus:ring-2 focus:ring-lime-400/50'
  return (
    <form id="solicitud" onSubmit={enviar} className="scroll-mt-6 rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8 shadow-sm space-y-6 self-start">
      <div>
        <h2 className="text-xl font-semibold text-neutral-900">Solicitud</h2>
        <p className="mt-1 text-sm text-neutral-500">Toma 2 minutos. Una solicitud por persona.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="nombre" className="block text-sm font-medium text-neutral-700 mb-1">Tu nombre</label>
          <input id="nombre" name="nombre" required maxLength={80} autoComplete="name" className={campo} />
        </div>
        <div>
          <label htmlFor="telegram" className="block text-sm font-medium text-neutral-700 mb-1">Usuario de Telegram</label>
          <input id="telegram" name="telegram" required maxLength={80} placeholder="@tuusuario"
            autoCapitalize="none" spellCheck={false} className={campo} />
          <p className="mt-1 text-xs text-neutral-400">Por aquí te escribimos si quedas.</p>
        </div>
        <div>
          <label htmlFor="nick_ml" className="block text-sm font-medium text-neutral-700 mb-1">
            Nick de MercadoLibre <span className="font-normal text-neutral-400">(opcional)</span>
          </label>
          <input id="nick_ml" name="nick_ml" maxLength={40} autoCapitalize="none" spellCheck={false} className={campo} />
          <p className="mt-1 text-xs text-neutral-400">Solo para ver tu reputación pública. No accedemos a tu cuenta.</p>
        </div>
      </div>

      {/* Trampa para bots: invisible para personas */}
      <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
        <label>Sitio web <input name="sitio" tabIndex={-1} autoComplete="off" /></label>
      </div>

      {PREGUNTAS.map((p, i) => (
        <fieldset key={p.campo}>
          <legend className="text-sm font-medium text-neutral-800">{i + 1}. {p.texto}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {p.opciones.map(o => {
              const on = resp[p.campo] === o.valor
              return (
                <label key={o.valor}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                    on ? 'border-lime-500 bg-lime-50 text-neutral-900' : 'border-neutral-200 text-neutral-700 hover:border-neutral-400'}`}>
                  <input type="radio" name={p.campo} value={o.valor} checked={on}
                    onChange={() => setResp(r => ({ ...r, [p.campo]: o.valor }))}
                    className="accent-lime-600" />
                  {o.texto}
                </label>
              )
            })}
          </div>
        </fieldset>
      ))}

      {error && <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <button type="submit" disabled={enviando}
        className="w-full bg-lime-400 text-neutral-950 py-3 rounded-lg text-sm font-semibold hover:bg-lime-300 transition-colors disabled:opacity-50">
        {enviando ? 'Enviando…' : 'Enviar solicitud'}
      </button>
    </form>
  )
}
