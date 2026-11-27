'use client'
import { useEffect, useState } from 'react'

// Frenos de la IA automática (07-11, lib/iaFrenos.ts). 27-11 (el dueño): la pantalla se ordena por módulo. Cada tarjeta
// (Preguntas / Mensajes) trae SU frase de escape (EscapePreguntas / EscapeMensajes) y abajo quedan solo los frenos que
// de verdad son compartidos: horario y máximo por comprador (FrenosCompartidos). Un solo guardado (useFrenos).
type Horario = { dias: number[]; desde: string; hasta: string }
type Frenos = { horario: Horario | null; tope: number; escape: string | null; escapePreguntas: string | null; escapeSeguro: boolean }
// Las mismas de lib/iaFrenos.ts (ESCAPE_PREGUNTAS_FABRICA / ESCAPE_MENSAJES_FABRICA).
const ESCAPE_FABRICA = '¡Hola! Lo verificamos y te confirmamos en breve por aquí.'
const ESCAPE_MENSAJES_FABRICA = '¡Hola! Recibimos tu mensaje, en breve te respondemos por aquí.'
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
// ML no deja teléfonos, correos ni links en las respuestas de Preguntas (las rechaza o las oculta).
const CONTACTO = /\d[\d\s.-]{6,}\d|https?:|www\.|\.com|@/i

export type FrenosEstado = ReturnType<typeof useFrenos>

export function useFrenos(inicial: unknown) {
  const [f, setF] = useState<Frenos | null>((inicial as Frenos | null) ?? null)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [guardando, setGuardando] = useState(false)
  // 12-11 (rapidez): en Mi IA vienen en el HTML; si no, se piden.
  useEffect(() => { if (inicial) return; fetch('/api/ia-frenos').then(r => r.ok ? r.json() : null).then(d => d && setF(d)).catch(() => {}) }, [inicial])
  const guardar = async (n: Frenos) => {
    setF(n); setGuardando(true); setMsg(null)
    const r = await fetch('/api/ia-frenos', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(n) }).catch(() => null)
    const d = await r?.json().catch(() => null)
    setGuardando(false)
    if (r?.ok) { setF(d); setMsg({ ok: true, t: 'Guardado' }) } else setMsg({ ok: false, t: d?.error ?? 'No se pudo guardar' })
  }
  return { f, setF, guardar, guardando, msg }
}

function Estado({ fr }: { fr: FrenosEstado }) {
  if (!fr.guardando && !fr.msg) return null
  return <p className={`text-xs ${fr.guardando ? 'text-neutral-500' : fr.msg?.ok ? 'text-lime-700' : 'text-red-600'}`}>{fr.guardando ? 'Guardando…' : fr.msg?.t}</p>
}

/** Frase de escape de Preguntas: va dentro de la tarjeta de Preguntas. Sin teléfonos ni links (ML no los deja). */
export function EscapePreguntas({ fr, total }: { fr: FrenosEstado; total: boolean }) {
  const f = fr.f
  if (!f) return null
  const texto = f.escapePreguntas ?? ESCAPE_FABRICA
  return (
    <div className="space-y-1.5 border-t border-neutral-100 pt-3">
      <p className="text-sm font-medium text-neutral-800">Frase de escape</p>
      <p className="text-xs text-neutral-500">{total
        ? <>La IA contesta con esta frase la posventa (cancelar, devolver, reclamo), lo que llega fuera de tu horario o si no logró escribir nada, para que ninguna pregunta quede sin respuesta. La respuesta de la IA queda escrita para que sigas tú.</>
        : <>Solo si marcas «Usarla también en Modo Seguro»: contesta con esta frase lo que la IA deja para revisar.</>}
        {' '}MercadoLibre acepta <b>una sola respuesta</b> por pregunta y <b>no deja teléfonos ni links</b>.</p>
      <textarea rows={2} maxLength={350} value={texto} onChange={e => fr.setF({ ...f, escapePreguntas: e.target.value })}
        onBlur={() => { const t = (f.escapePreguntas ?? '').trim(); fr.guardar({ ...f, escapePreguntas: !t || t === ESCAPE_FABRICA ? null : t }) }}
        aria-label="Frase de escape en Preguntas" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
      {CONTACTO.test(texto) && <p className="text-xs text-amber-800">Parece que tiene un teléfono, correo o link: en Preguntas MercadoLibre no lo deja. Déjalo para la frase de Mensajes.</p>}
      {f.escapePreguntas != null && f.escapePreguntas.trim() !== ESCAPE_FABRICA && (
        <button type="button" onClick={() => fr.guardar({ ...f, escapePreguntas: null })} className="text-xs text-neutral-500 underline-offset-2 hover:underline">Volver a la de fábrica</button>
      )}
      {!total && (
        <label className="flex items-start gap-2 text-sm text-neutral-800">
          <input type="checkbox" className="mt-0.5" checked={f.escapeSeguro} onChange={e => fr.guardar({ ...f, escapeSeguro: e.target.checked })} />
          <span>Usarla también en <b>Modo Seguro</b> <span className="block text-xs text-neutral-500">Contesta con la frase todo lo que la IA deja para revisar (no está segura, reclamos, «no hay», fuera de horario). Sirve de noche; de día conviene responderlas tú.</span></span>
        </label>
      )}
      <Estado fr={fr} />
    </div>
  )
}

/** Frase de escape de Mensajes: va dentro de la tarjeta de Mensajes. Aquí sí puede llevar teléfono o web. */
export function EscapeMensajes({ fr, total }: { fr: FrenosEstado; total: boolean }) {
  const f = fr.f
  if (!f) return null
  return (
    <div className="space-y-1.5 border-t border-neutral-100 pt-3">
      <p className="text-sm font-medium text-neutral-800">Frase de escape {!total && <span className="font-normal text-neutral-400">(opcional)</span>}</p>
      <p className="text-xs text-neutral-500">{total
        ? <>En <b>garantías, reclamos, devoluciones o pedidos distintos a lo publicado</b> la IA no responde: manda siempre esta frase y te deja la conversación en «Por atender». Te recomendamos poner un <b>contacto directo</b> (WhatsApp o teléfono) para que el comprador te escriba y resuelvas tú cualquier duda, cambio o inconveniente.</>
        : <>Cuando la IA deja un mensaje para tu equipo (reclamos, pagos, dudas), manda al momento esta frase corta para que el comprador no quede sin contestar. La conversación sigue en «Por atender» con la respuesta de la IA escrita. Vacía = no se manda nada.</>}
        {' '}Una vez por conversación cada 24 h.</p>
      <textarea rows={2} maxLength={200} value={f.escape ?? ''} onChange={e => fr.setF({ ...f, escape: e.target.value })}
        onBlur={() => fr.guardar({ ...f, escape: f.escape?.trim() || null })}
        aria-label="Frase de escape en Mensajes"
        placeholder={total ? 'Ej.: Para garantías, cambios o pedidos especiales escríbenos al WhatsApp 0414-0000000 y te atendemos directo.' : 'Ej.: ¡Recibido! En un momento te confirmamos.'}
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
      {total && !f.escape && <p className="text-xs text-amber-800">Vacía: en Modo Total se manda la de fábrica («{ESCAPE_MENSAJES_FABRICA}»).</p>}
      <Estado fr={fr} />
    </div>
  )
}

/** Lo que vale para los dos módulos: horario y máximo por comprador. */
export function FrenosCompartidos({ fr }: { fr: FrenosEstado }) {
  const f = fr.f
  if (!f) return null
  const h = f.horario
  const guardar = fr.guardar
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 space-y-4">
      <div>
        <p className="font-semibold text-neutral-900">Frenos para Preguntas y Mensajes</p>
        <p className="text-xs text-neutral-500">Valen para los dos y solo actúan con la IA automática encendida. Lo que frenan queda con la respuesta ya escrita para tu equipo.</p>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-neutral-800">
          <input type="checkbox" checked={!!h} onChange={e => guardar({ ...f, horario: e.target.checked ? { dias: [0, 1, 2, 3, 4, 5, 6], desde: '19:00', hasta: '08:00' } : null })} />
          Responder sola solo en un horario
        </label>
        {!h && <p className="text-xs text-neutral-500 pl-6">Sin horario: responde a cualquier hora.</p>}
        {h && (
          <div className="pl-6 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {DIAS.map((d, i) => (
                <button key={d} type="button" onClick={() => {
                  const dias = h.dias.includes(i) ? h.dias.filter(x => x !== i) : [...h.dias, i].sort()
                  if (dias.length) guardar({ ...f, horario: { ...h, dias } })
                }}
                  className={`px-2.5 py-1 rounded-full text-xs border ${h.dias.includes(i) ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white border-neutral-300 text-neutral-600'}`}>{d}</button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-sm text-neutral-700">
              de <input type="time" value={h.desde} onChange={e => e.target.value && guardar({ ...f, horario: { ...h, desde: e.target.value } })} className="rounded border border-neutral-300 px-2 py-1" />
              a <input type="time" value={h.hasta} onChange={e => e.target.value && guardar({ ...f, horario: { ...h, hasta: e.target.value } })} className="rounded border border-neutral-300 px-2 py-1" />
            </div>
            <p className="text-xs text-neutral-500">Si la hora de fin es menor (ej. 19:00 a 08:00) cruza la medianoche: la madrugada cuenta para el día en que empezó.</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-800">
        Máximo
        <input inputMode="numeric" value={f.tope} onChange={e => fr.setF({ ...f, tope: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
          onBlur={() => guardar({ ...f, tope: Math.max(1, f.tope) })} className="w-14 rounded border border-neutral-300 px-2 py-1" />
        respuestas automáticas por comprador en 24 horas
        <span className="w-full text-xs text-neutral-500">La siguiente queda para una persona.</span>
      </div>
      <Estado fr={fr} />
    </section>
  )
}

/** Fuera de Mi IA (pantallas viejas de Preguntas / Mensajes): los compartidos y la frase del módulo. */
export function FrenosIA({ preguntas = false, mensajes = false, total = false, inicial = null }: { preguntas?: boolean; mensajes?: boolean; total?: boolean; inicial?: unknown }) {
  const fr = useFrenos(inicial)
  if (!fr.f) return null
  return (
    <div className="space-y-3">
      <FrenosCompartidos fr={fr} />
      {(preguntas || mensajes) && <section className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3">
        {preguntas && <EscapePreguntas fr={fr} total={total} />}
        {mensajes && <EscapeMensajes fr={fr} total={total} />}
      </section>}
    </div>
  )
}
