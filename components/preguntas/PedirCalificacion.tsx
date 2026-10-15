'use client'
import { useCallback, useEffect, useState } from 'react'
import { LoQueSeHablo } from '@/components/ventas/PagoYContexto'
import { Cargando, EmptyState } from '@/components/ui'

// Mensajes → "Pedir calificación" (lib/pedirCalificacion.ts): A MANO. Ventas que calificamos concretada
// y positiva y el comprador todavía no, dentro de su plazo y sin mensajes suyos sin responder. Cada
// una con el texto ya armado (nombre + link para calificar): se revisa y se envía, una vez por venta.

interface Pedible {
  orden: string; pack: string; cuenta: string; fecha: string; nombre: string | null; nick: string | null
  productos: string | null; dias_restantes: number; con_mensajes: boolean; texto: string
}
interface Pedida {
  orden: string; pack: string; cuenta: string; productos: string | null; nombre: string | null
  pedida_at: string; pedida_por: string | null; ya_califico: boolean; rating: string | null
}
interface Datos { lista: Pedible[]; pedidas: Pedida[]; plantilla: string; inicial: string; desde: number; hasta: number; puedeEditar: boolean }

const BTN = '!px-2.5 !py-1 text-xs'
const NOMBRE: Record<string, string> = { positive: 'positiva', neutral: 'neutral', negative: 'negativa' }
const hace = (f: string) => {
  const d = Math.floor((Date.now() - new Date(f).getTime()) / 86_400_000)
  return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`
}

export default function PedirCalificacion({ onCambio }: { onCambio?: () => void }) {
  const [d, setD] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)        // orden con el texto abierto
  const [textos, setTextos] = useState<Record<string, string>>({})     // texto editado por venta
  const [enviando, setEnviando] = useState<string | null>(null)
  const [plantilla, setPlantilla] = useState<string | null>(null)       // editor del texto de la empresa

  const cargar = useCallback(async () => {
    const r = await fetch('/api/mensajes/pedir-calificacion', { cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setError(j.error ?? 'No se pudo cargar'); return }
    setD(j); setError(null)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const enviar = async (p: Pedible) => {
    setEnviando(p.orden); setError(null)
    const r = await fetch('/api/mensajes/pedir-calificacion', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orden: p.orden, texto: textos[p.orden] ?? p.texto }),
    })
    const j = await r.json().catch(() => ({}))
    setEnviando(null)
    if (!r.ok) { setError(j.error ?? 'No se pudo enviar'); return }
    setEditando(null)
    await cargar(); onCambio?.()
  }

  const noPedir = async (p: Pedible) => {
    setEnviando(p.orden)
    await fetch('/api/mensajes/pedir-calificacion', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orden: p.orden, no_pedir: true }),
    })
    setEnviando(null)
    setD(x => x && { ...x, lista: x.lista.filter(y => y.orden !== p.orden) }); onCambio?.()
  }

  const guardarPlantilla = async (texto: string) => {
    const r = await fetch('/api/mensajes/pedir-calificacion', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setError(j.error ?? 'No se pudo guardar'); return }
    setPlantilla(null); setTextos({}); await cargar()
  }

  if (!d) return error ? <p className="text-sm text-red-600">{error}</p> : <Cargando />
  const calificaron = d.pedidas.filter(p => p.ya_califico).length

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sky-200 bg-sky-50/60 px-4 py-3 text-sm text-sky-900">
        <p>
          Ventas que <b>calificaste concretada y positiva</b> y el comprador <b>todavía no te calificó</b>. En MercadoLibre Venezuela
          el comprador tiene unos {d.hasta} días desde la compra: aquí aparecen desde el día {d.desde}. No salen las que tienen un
          mensaje del comprador sin responder. <b>Nada se envía solo</b>: revisas el texto y lo envías, una vez por venta.
        </p>
        {d.puedeEditar && plantilla === null && (
          <button type="button" onClick={() => setPlantilla(d.plantilla)} className="mt-1.5 text-xs font-medium text-sky-800 hover:underline underline-offset-2">
            Cambiar el texto
          </button>
        )}
        {plantilla !== null && (
          <div className="mt-2 space-y-2 rounded-lg bg-white p-3 ring-1 ring-inset ring-sky-200">
            <textarea value={plantilla} onChange={e => setPlantilla(e.target.value.slice(0, 300))} rows={3}
              className="w-full resize-y rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-800" />
            <p className="text-xs text-neutral-500">
              <code className="rounded bg-neutral-100 px-1">{'{nombre}'}</code> = primer nombre del comprador ·{' '}
              <code className="rounded bg-neutral-100 px-1">{'{link}'}</code> = el link para calificar esa venta (obligatorio).
              Sin pedir “positiva” ni ofrecer nada a cambio: MercadoLibre no lo permite.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => guardarPlantilla(plantilla)} className={`btn-primary ${BTN}`}>Guardar texto</button>
              <button type="button" onClick={() => setPlantilla(d.inicial)} className={`btn-secondary ${BTN}`}>Volver al de ejemplo</button>
              <button type="button" onClick={() => setPlantilla(null)} className={`btn-ghost ${BTN}`}>Cancelar</button>
            </div>
          </div>
        )}
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-baseline gap-2 border-b border-neutral-100 bg-neutral-50 px-4 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Para pedir hoy</h2>
          <span className="text-xs text-neutral-400">{d.lista.length} venta{d.lista.length === 1 ? '' : 's'} · la que menos plazo le queda, primero</span>
        </div>
        {d.lista.length === 0 ? (
          <EmptyState message="Nada para pedir ahora. Aparecen solas cuando una venta calificada como positiva cumple 2 días sin que el comprador te califique." />
        ) : (
          <ul className="divide-y divide-neutral-100">
            {d.lista.map(p => {
              const abierto = editando === p.orden
              const texto = textos[p.orden] ?? p.texto
              return (
                <li key={p.orden} className="px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-700">{p.cuenta}</span>
                        <span className="truncate text-sm font-medium text-neutral-900">{p.nombre ?? p.nick ?? 'Comprador'}</span>
                        {p.nombre && p.nick && <span className="text-xs text-neutral-400">@{p.nick}</span>}
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.dias_restantes <= 1 ? 'bg-red-50 text-red-700' : 'bg-neutral-100 text-neutral-600'}`}>
                          {p.dias_restantes <= 1 ? 'Último día para calificar' : `Le quedan ${p.dias_restantes} días`}
                        </span>
                      </div>
                      {p.productos && <p className="mt-1 truncate text-xs text-neutral-600" title={p.productos}>{p.productos}</p>}
                      <p className="mt-0.5 text-[11px] text-neutral-400">Compró {hace(p.fecha)} · venta {p.pack} · la calificaste concretada y positiva</p>
                      {abierto ? (
                        <div className="mt-2">
                          <textarea value={texto} onChange={e => setTextos(t => ({ ...t, [p.orden]: e.target.value.slice(0, 350) }))} rows={3}
                            className="w-full resize-y rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
                          <p className="text-right text-[11px] text-neutral-400">{texto.length}/350</p>
                        </div>
                      ) : (
                        <p className="mt-1.5 rounded-lg bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700 ring-1 ring-inset ring-neutral-200 break-words">{texto}</p>
                      )}
                    </div>
                    {/* Columna de acciones (2026-10-15): todas del mismo ancho y en orden; en celular, en fila. */}
                    <div className="grid shrink-0 grid-cols-2 gap-1.5 sm:w-40 sm:grid-cols-1">
                      <button type="button" onClick={() => enviar(p)} disabled={enviando === p.orden || !texto.trim()} className={`btn-primary ${BTN} w-full`}>
                        {enviando === p.orden ? 'Enviando…' : 'Enviar'}
                      </button>
                      {/* La conversación en una ventana, como en Ventas → "Lo que se habló": ver si hubo un problema antes de pedir. */}
                      {p.con_mensajes
                        ? <LoQueSeHablo numero={p.pack} compacto className="w-full" />
                        : <span className="inline-flex items-center justify-center rounded-lg border border-dashed border-neutral-200 px-2.5 py-1 text-xs text-neutral-400"
                            title="El comprador no escribió nada después de comprar">Sin mensajes</span>}
                      <button type="button" onClick={() => setEditando(abierto ? null : p.orden)} className={`btn-secondary ${BTN} w-full`}>
                        {abierto ? '✓ Listo' : '✎ Editar texto'}
                      </button>
                      <button type="button" onClick={() => noPedir(p)} disabled={enviando === p.orden} title="Sacarla de la lista sin mandar nada"
                        className={`btn-secondary ${BTN} w-full !text-neutral-500 hover:!border-red-300 hover:!bg-red-50 hover:!text-red-700`}>
                        ✕ No pedir
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {d.pedidas.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-baseline gap-2 border-b border-neutral-100 bg-neutral-50 px-4 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Pedidas (últimos 14 días)</h2>
            <span className="text-xs text-neutral-500">
              {d.pedidas.length} pedida{d.pedidas.length === 1 ? '' : 's'} · <b className="text-emerald-700">{calificaron} ya calificaron</b>
              {d.pedidas.length ? ` (${Math.round(calificaron / d.pedidas.length * 100)}%)` : ''}
            </span>
          </div>
          <ul className="divide-y divide-neutral-100">
            {d.pedidas.map(p => (
              <li key={p.orden} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs">
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-700">{p.cuenta}</span>
                <span className="font-medium text-neutral-800">{p.nombre ?? 'Comprador'}</span>
                <span className="min-w-0 flex-1 truncate text-neutral-500" title={p.productos ?? ''}>{p.productos}</span>
                <span className="text-neutral-400">pedida {hace(p.pedida_at)}{p.pedida_por ? ` · ${p.pedida_por}` : ''}</span>
                {p.ya_califico
                  ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">✓ Calificó{p.rating && NOMBRE[p.rating] ? ` ${NOMBRE[p.rating]}` : ''}</span>
                  : <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-500">Esperando</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
