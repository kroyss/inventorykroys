'use client'
// Envíos apartados (20-10, migración 107; API /api/despachos/apartados): el botón "En espera" junto a Historial,
// su panel al costado y el formulario para apartar. Un solo lugar para todo lo frenado, lo hayan detenido al armar
// etiquetas o cuando ya estaba por reportar.
import { useCallback, useEffect, useState } from 'react'
import { useConfirm } from '@/components/ui/ConfirmProvider'

export interface Apartado {
  id: number; venta: string | null; guia_ver: string | null; carrier: string; destinatario: string | null; remitente: string | null
  impresa: boolean; apartado: 'espera' | 'cancelado' | null; apartado_nota: string | null; apartado_at: string | null
  productos?: string | null   // qué lleva (23-10)
  apartado_por: string | null; etapa: 'sin_imprimir' | 'impresa' | 'por_reportar'
}

const ETAPA: Record<Apartado['etapa'], string> = {
  sin_imprimir: 'sin imprimir', impresa: 'etiqueta impresa, jornada abierta', por_reportar: 'jornada cerrada, sin reportar',
}
const DIAS_ALERTA = 2
const diasDesde = (f: string | null) => (f ? (Date.now() - new Date(f).getTime()) / 864e5 : 0)
const hace = (f: string | null) => {
  if (!f) return ''
  const h = (Date.now() - new Date(f).getTime()) / 36e5
  return h < 1 ? 'hace menos de 1 h' : h < 48 ? `hace ${Math.round(h)} h` : `hace ${Math.round(h / 24)} días`
}

/** Los apartados en espera (se recargan con `recargar`). */
export function useEnEspera() {
  const [lista, setLista] = useState<Apartado[]>([])
  const [disponible, setDisponible] = useState(false)   // sin Despachos (403) no se muestra nada
  const recargar = useCallback(() =>
    fetch('/api/despachos/apartados').then(r => { setDisponible(r.ok); return r.ok ? r.json() : null })
      .then(d => { if (d) setLista(d.espera) }).catch(() => {}), [])
  useEffect(() => { recargar() }, [recargar])
  return { lista, recargar, disponible }
}

/** En el Reportador (20-10): el mismo "En espera" de Despachos, para apartar una guía antes de que se reporte. */
export function EnEsperaReportador() {
  const espera = useEnEspera()
  const [abierto, setAbierto] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  if (!espera.disponible) return null
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-xs text-neutral-500">¿Una guía no debe reportarse todavía? Apártala y no se le escribe al comprador.</span>
        <button onClick={() => setAbierto(true)} className="btn-secondary text-sm">Apartar una guía…</button>
        <BotonEnEspera lista={espera.lista} onAbrir={() => setAbierto(true)} />
      </div>
      <AvisoEnEspera lista={espera.lista} onAbrir={() => setAbierto(true)} />
      {aviso && <div className="rounded border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-700">{aviso}</div>}
      {abierto && <PanelEnEspera lista={espera.lista} onCerrar={() => setAbierto(false)}
        onCambio={msg => { setAviso(msg); espera.recargar() }} />}
    </div>
  )
}

/** Botón junto a Historial: gris con 0, ámbar con alguno, rojo si alguno lleva más de 2 días. */
export function BotonEnEspera({ lista, onAbrir }: { lista: Apartado[]; onAbrir: () => void }) {
  const viejo = lista.some(a => diasDesde(a.apartado_at) > DIAS_ALERTA)
  const cls = lista.length === 0 ? 'btn-secondary'
    : viejo ? 'rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 font-medium text-red-800 hover:bg-red-100'
    : 'rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 font-medium text-amber-900 hover:bg-amber-100'
  return <button onClick={onAbrir} className={`${cls} text-sm`}>En espera ({lista.length})</button>
}

/** Línea fina arriba de la jornada mientras haya algo apartado. */
export function AvisoEnEspera({ lista, onAbrir }: { lista: Apartado[]; onAbrir: () => void }) {
  if (!lista.length) return null
  const viejos = lista.filter(a => diasDesde(a.apartado_at) > DIAS_ALERTA).length
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg border px-4 py-2 text-sm ${viejos ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
      ⏸ <b>{lista.length} envío{lista.length === 1 ? '' : 's'} en espera</b>: no sale{lista.length === 1 ? '' : 'n'} en ningún manifiesto hasta que lo{lista.length === 1 ? '' : 's'} liberes.
      {viejos > 0 && <span>{viejos} lleva{viejos === 1 ? '' : 'n'} más de {DIAS_ALERTA} días.</span>}
      <button onClick={onAbrir} className="ml-auto font-medium underline">Ver</button>
    </div>
  )
}

/** Panel al costado: lo que está en espera (Sale en el próximo manifiesto / Ya no se envía) y buscar un envío para apartarlo. */
export function PanelEnEspera({ lista, preseleccion, onCerrar, onCambio, conInventario = false }: {
  lista: Apartado[]; preseleccion?: Apartado | null; onCerrar: () => void; onCambio: (aviso: string) => void
  conInventario?: boolean   // con Inventario: "Corregir pedido" (Ventas, mig. 108) en cada envío en espera
}) {
  const [buscar, setBuscar] = useState('')
  const [candidatos, setCandidatos] = useState<Apartado[] | null>(null)
  const [apartando, setApartando] = useState<Apartado | null>(preseleccion ?? null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [hecho, setHecho] = useState<string | null>(null)   // confirmación de lo último que se hizo (sin dudas de "¿falta algo?")
  const confirm = useConfirm()

  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onCerrar])

  useEffect(() => {
    const q = buscar.trim()
    if (q.length < 4) return
    const t = setTimeout(() => {
      fetch(`/api/despachos/apartados?buscar=${encodeURIComponent(q)}`).then(r => r.ok ? r.json() : null).then(d => setCandidatos(d?.candidatos ?? []))
    }, 300)
    return () => clearTimeout(t)
  }, [buscar])

  const accion = async (body: Record<string, unknown>, aviso: string) => {
    setOcupado(true); setError(null)
    const r = await fetch('/api/despachos/apartados', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    setOcupado(false)
    if (!r.ok) { setError(d.error ?? 'No se pudo'); setHecho(null); return false }
    setHecho(aviso)
    onCambio(aviso)
    return true
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/20" onClick={onCerrar} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">En espera</h2>
            <p className="text-xs text-neutral-500">Envíos apartados: no entran al manifiesto ni los reporta el Reportador hasta que los liberes.</p>
          </div>
          <button onClick={onCerrar} className="text-xl leading-none text-neutral-400 hover:text-neutral-700" aria-label="Cerrar">✕</button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm">
          {error && <div className="sticky top-0 z-10 rounded border border-red-200 bg-red-50 px-3 py-2 text-red-700 shadow-sm">{error}</div>}
          {hecho && !error && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-green-800">
              <b>✓ Listo.</b> {hecho} No tienes que hacer nada más ahora.
            </div>
          )}

          {apartando ? (
            <FormApartar e={apartando} ocupado={ocupado} onCancelar={() => setApartando(null)}
              onApartar={async (tipo, nota) => {
                const ok = await accion({ accion: 'apartar', id: apartando.id, tipo, nota },
                  `${apartando.venta ?? 'Envío'}: ${tipo === 'espera' ? 'quedó en espera (cuando vaya a salir, toca «Sale en el próximo manifiesto»).' : 'cancelado, no se enviará.'}`)
                if (ok) { setApartando(null); setBuscar(''); setCandidatos(null) }
              }} />
          ) : (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Apartar un envío</h3>
              <input type="search" value={buscar} onChange={ev => setBuscar(ev.target.value)} placeholder="Número de venta, guía o comprador…"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              {buscar.trim().length >= 4 && candidatos && (candidatos.length === 0
                ? <p className="text-xs text-neutral-400">Nada para apartar con eso (puede que ya se haya reportado).</p>
                : <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                    {candidatos.map(c => (
                      <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-xs">{c.venta ?? '—'} · {c.guia_ver ?? '—'} <span className="font-sans text-neutral-400">{c.carrier}</span></div>
                          <div className="truncate text-xs text-neutral-500">{c.destinatario ?? ''} · {ETAPA[c.etapa]}</div>
                          {c.productos && <div className="truncate text-xs text-neutral-700">📦 {c.productos}</div>}
                        </div>
                        <button onClick={() => setApartando(c)} className="btn-secondary text-xs">Apartar…</button>
                      </li>
                    ))}
                  </ul>)}
            </section>
          )}

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">En espera ({lista.length})</h3>
            {lista.length === 0 ? <p className="text-xs text-neutral-400">Nada apartado.</p> : (
              <ul className="space-y-2">
                {lista.map(a => {
                  const viejo = diasDesde(a.apartado_at) > DIAS_ALERTA
                  return (
                    <li key={a.id} className={`rounded-lg border px-3 py-2.5 ${viejo ? 'border-red-200 bg-red-50/50' : 'border-neutral-200'}`}>
                      <div className="font-mono text-xs">{a.venta ?? '—'} · {a.guia_ver ?? '—'} <span className="font-sans text-neutral-400">{a.carrier}</span></div>
                      <div className="text-xs text-neutral-600">{a.destinatario ?? ''}</div>
                      {a.productos && <div className="mt-0.5 line-clamp-2 text-xs font-medium text-neutral-800">📦 {a.productos}</div>}
                      <div className="mt-1 text-xs text-neutral-700">“{a.apartado_nota}”</div>
                      {conInventario && a.venta && (
                        <a href={`/ventas?venta=${encodeURIComponent(a.venta)}`} className="mt-1 inline-block text-xs font-medium text-sky-700 hover:underline"
                          title="Cambio de última hora: corrige los productos de la venta y el inventario se ajusta solo">Corregir pedido →</a>
                      )}
                      <div className={`text-[11px] ${viejo ? 'font-medium text-red-700' : 'text-neutral-400'}`}>
                        {a.apartado_por ?? '—'} · {hace(a.apartado_at)} · {ETAPA[a.etapa]}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button disabled={ocupado} onClick={async () => {
                          // 20-10: "Sale en el próximo manifiesto" lo suma a la jornada abierta (o abre una): sale en el próximo manifiesto y esa
                          // noche se reporta. Si en realidad sale otro día, que lo deje en espera y lo toque ese día.
                          if (!await confirm({ title: '¿Este paquete sale en el próximo manifiesto?', confirmText: 'Sí, va en el próximo', cancelText: 'No, sigue en espera',
                            message: `Entra en la jornada abierta: sale en el manifiesto que se genere al cerrarla (normalmente el de hoy) y en ese momento se le reporta la guía al comprador.${a.impresa ? ' La etiqueta ya está impresa: no se vuelve a imprimir.' : ''} Si el paquete sale otro día, déjalo en espera y tócalo ese día.` })) return
                          accion({ accion: 'liberar', id: a.id }, `${a.venta ?? 'Envío'}: va en el próximo manifiesto (entra en la jornada abierta y se reporta al cerrarla).`)
                        }}
                          className="btn-secondary text-xs disabled:opacity-50">Sale en el próximo manifiesto</button>
                        <button disabled={ocupado} onClick={async () => {
                          // No tiene vuelta atrás: nunca se despacha ni se reporta (queda en el historial como cancelado).
                          if (!await confirm({ title: `Cancelar el envío ${a.venta ?? ''}`, confirmText: 'Sí, no se envía', danger: true,
                            message: 'No va a salir nunca ni se le mandará la guía al comprador. Queda en el historial como "envío cancelado". Esto no se puede deshacer.' })) return
                          accion({ accion: 'cancelar', id: a.id }, `${a.venta ?? 'Envío'}: cancelado, queda en el historial.`)
                        }}
                          className="btn-secondary text-xs disabled:opacity-50">Ya no se envía</button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
        <div className="flex justify-end border-t bg-neutral-50 px-5 py-3">
          <button onClick={onCerrar} className="btn-primary text-sm">Listo, cerrar</button>
        </div>
      </aside>
    </div>
  )
}

function FormApartar({ e, ocupado, onCancelar, onApartar }: {
  e: Apartado; ocupado: boolean; onCancelar: () => void; onApartar: (tipo: 'espera' | 'cancelado', nota: string) => void
}) {
  const [tipo, setTipo] = useState<'espera' | 'cancelado'>('espera')
  const [nota, setNota] = useState('')
  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 p-3">
      <h3 className="font-semibold">Apartar {e.venta ?? 'envío'}</h3>
      <p className="text-xs text-neutral-500">{e.destinatario ?? ''} · guía {e.guia_ver ?? '—'} · {ETAPA[e.etapa]}</p>
      {e.productos && <p className="text-xs font-medium text-neutral-800">📦 {e.productos}</p>}
      <div className="space-y-1.5">
        {([['espera', 'Todavía no sale', 'Queda en espera; sale en el próximo manifiesto cuando lo liberes.'], ['cancelado', 'No se enviará', 'Desistió, pago mal o error: nunca se despacha ni se reporta.']] as const).map(([v, t, d]) => (
          <label key={v} className={`flex cursor-pointer gap-2 rounded-lg border px-3 py-2 ${tipo === v ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200'}`}>
            <input type="radio" checked={tipo === v} onChange={() => setTipo(v)} className="mt-0.5" />
            <span><b className="text-sm">{t}</b><span className="block text-xs text-neutral-500">{d}</span></span>
          </label>
        ))}
      </div>
      <input value={nota} onChange={ev => setNota(ev.target.value)} maxLength={200} placeholder="Motivo (ej.: el cliente pidió para el lunes)"
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
      {e.impresa && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          ⚠️ La etiqueta ya está impresa: <b>separa el paquete físico</b> para que no salga con el resto.
          {e.etapa === 'por_reportar' && ' Si el paquete ya se entregó al transportista, apartarlo solo evita el mensaje al comprador.'}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={onCancelar} className="btn-secondary text-xs">Cancelar</button>
        <button disabled={ocupado || nota.trim().length < 2} onClick={() => onApartar(tipo, nota.trim())}
          className={`text-xs disabled:opacity-50 ${tipo === 'cancelado' ? 'btn-primary !bg-red-600 hover:!bg-red-700' : 'btn-primary'}`}>
          {tipo === 'espera' ? 'Apartar: todavía no sale' : 'Cancelar el envío'}
        </button>
      </div>
    </section>
  )
}
