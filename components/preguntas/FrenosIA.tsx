'use client'
import { useEffect, useState } from 'react'

// Frenos de la IA automática (07-11, lib/iaFrenos.ts): horario, tope por comprador y (en Mensajes) frase de escape.
// Valen para Preguntas y Mensajes a la vez (mismo guardado). Solo actúan con la IA automática ACTIVA.
type Horario = { dias: number[]; desde: string; hasta: string }
type Frenos = { horario: Horario | null; tope: number; escape: string | null; escapePreguntas: string | null; escapeSeguro: boolean }
// La misma de lib/iaFrenos.ts (ESCAPE_PREGUNTAS_FABRICA): viene escrita para que se vea cuál se usa si no la cambian.
const ESCAPE_FABRICA = '¡Hola! Lo verificamos y te confirmamos en breve por aquí.'
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

// 10-11: se edita solo en Mi IA, con la frase de cada lado que esté disponible.
export function FrenosIA({ preguntas = false, mensajes = false, total = false }: { preguntas?: boolean; mensajes?: boolean; total?: boolean }) {
  const [f, setF] = useState<Frenos | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { fetch('/api/ia-frenos').then(r => r.ok ? r.json() : null).then(d => d && setF(d)).catch(() => {}) }, [])
  if (!f) return null

  const guardar = async (n: Frenos) => {
    setF(n); setGuardando(true); setMsg(null)
    const r = await fetch('/api/ia-frenos', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(n) }).catch(() => null)
    const d = await r?.json().catch(() => null)
    setGuardando(false)
    if (r?.ok) { setF(d); setMsg({ ok: true, t: 'Guardado' }) } else setMsg({ ok: false, t: d?.error ?? 'No se pudo guardar' })
  }
  const h = f.horario
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 space-y-4">
      <div>
        <p className="font-semibold text-neutral-900">Frenos de la IA automática</p>
        <p className="text-xs text-neutral-500">Valen para Preguntas y Mensajes. Solo actúan con la IA automática activa; lo que frenan te queda con la respuesta ya escrita.</p>
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
        <input inputMode="numeric" value={f.tope} onChange={e => setF({ ...f, tope: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
          onBlur={() => guardar({ ...f, tope: Math.max(1, f.tope) })} className="w-14 rounded border border-neutral-300 px-2 py-1" />
        respuestas automáticas por comprador en 24 horas
        <span className="w-full text-xs text-neutral-500">La siguiente queda para una persona.</span>
      </div>

      {mensajes && (
        <div className="space-y-1.5">
          <p className="text-sm text-neutral-800">Frase de escape en Mensajes <span className="text-neutral-400">(opcional, Modo Seguro)</span></p>
          <p className="text-xs text-neutral-500">Cuando la IA no manda la respuesta sola, manda esta frase corta para que el comprador no quede sin contestar. La conversación sigue en «Por atender» con la respuesta de la IA escrita. Una vez por conversación cada 24 h. Vacía = no se manda nada.</p>
          <textarea rows={2} maxLength={200} value={f.escape ?? ''} onChange={e => setF({ ...f, escape: e.target.value })}
            onBlur={() => guardar({ ...f, escape: f.escape?.trim() || null })}
            placeholder="Ej.: ¡Recibido! En un momento te confirmamos." className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
        </div>
      )}
      {preguntas && (
        // 12-11 (el dueño): precargada con la de fábrica. Modo Total la usa siempre; Modo Seguro solo si se marca.
        <div className="space-y-1.5">
          <p className="text-sm text-neutral-800">Frase de escape en Preguntas</p>
          <p className="text-xs text-neutral-500">Cuando la IA no responde sola, contesta al momento con esta frase para que ninguna pregunta quede sin respuesta. <b>Modo Total:</b> se usa siempre, en posventa (cancelar, devolver, reclamo), fuera de tu horario o si la IA no logró escribir nada. Ojo: MercadoLibre acepta <b>una sola respuesta</b> por pregunta, así que queda respondida con la frase; la respuesta de la IA queda escrita para que sigas tú. No se usa con el tope por comprador ni con publicaciones pausadas.</p>
          <textarea rows={2} maxLength={350} value={f.escapePreguntas ?? ESCAPE_FABRICA} onChange={e => setF({ ...f, escapePreguntas: e.target.value })}
            onBlur={() => { const t = (f.escapePreguntas ?? '').trim(); guardar({ ...f, escapePreguntas: !t || t === ESCAPE_FABRICA ? null : t }) }}
            aria-label="Frase de escape en Preguntas" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
          {f.escapePreguntas != null && f.escapePreguntas.trim() !== ESCAPE_FABRICA && (
            <button type="button" onClick={() => guardar({ ...f, escapePreguntas: null })} className="text-xs text-neutral-500 underline-offset-2 hover:underline">Volver a la de fábrica</button>
          )}
          <label className="flex items-start gap-2 text-sm text-neutral-800">
            <input type="checkbox" className="mt-0.5" checked={f.escapeSeguro} onChange={e => guardar({ ...f, escapeSeguro: e.target.checked })} />
            <span>Usarla también en <b>Modo Seguro</b> <span className="block text-xs text-neutral-500">Ahí contesta con la frase todo lo que la IA deja para revisar (no está segura, reclamos, «no hay», fuera de horario). Sirve de noche; de día conviene dejarlas para responderlas tú.</span></span>
          </label>
        </div>
      )}
      {(guardando || msg) && <p className={`text-xs ${guardando ? 'text-neutral-500' : msg?.ok ? 'text-lime-700' : 'text-red-600'}`}>{guardando ? 'Guardando…' : msg?.t}</p>}
    </section>
  )
}
