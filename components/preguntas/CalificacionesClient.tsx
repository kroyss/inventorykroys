'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PageHeader, Tabs, EmptyState, Cargando, StatusBadge, STATUS_LABELS } from '@/components/ui'
import { useConfirm } from '@/components/ui/ConfirmProvider'

interface Orden {
  id: string; fecha: string; comprador: string | null; productos: string | null; total: number; moneda: string
  cal_comprador: string | null; cuenta: string; sistema_estado: string | null; facturada: boolean
  sugerencia: 'concretada' | 'no_concretada' | 'esperar'
}
interface Plantillas {
  concretada: { rating: string; mensaje: string }
  noConcretada: { rating: string; motivo: string; mensaje: string; dias: number }
}
interface Datos {
  ordenes: Orden[]; contadores: { concretadas: number; no_concretadas: number; esperando: number }
  plantillas: Plantillas; cuentas: { nickname: string; ordenes_sync_at: string | null }[]
  /** Empresa sin inventario: "en el sistema" = despachada (etiqueta impresa en Despachos). */
  desdeML?: boolean
}
type Tipo = 'concretada' | 'no_concretada'

const RATING: Record<string, string> = { positive: 'positiva', neutral: 'neutral', negative: 'negativa' }
const MOTIVOS: Record<string, string> = {
  BUYER_NOT_ENOUGH_MONEY: 'El comprador no pagó / no tenía el dinero',
  BUYER_REGRETS: 'El comprador se arrepintió',
  THEY_DIDNT_ANSWER: 'El comprador no respondió',
  OUT_OF_STOCK: 'No tenía el producto (sin stock)',
  THEY_NOT_HONORING_POLICIES: 'El comprador no respetó las condiciones',
}

/** Calificaciones en bloque: ventas de ML sin calificar, cruzadas con el sistema. */
export default function CalificacionesClient({ isAdmin }: { isAdmin: boolean }) {
  const confirm = useConfirm()
  const [vista, setVista] = useState<'listas' | 'esperando' | 'textos'>('listas')
  const [datos, setDatos] = useState<Datos | null>(null)
  const [elegidas, setElegidas] = useState<Record<string, Tipo | null>>({})
  const [filtro, setFiltro] = useState<'todas' | Tipo>('todas')
  const [corriendo, setCorriendo] = useState(false)
  const [progreso, setProgreso] = useState<{ hechas: number; total: number; errores: string[] } | null>(null)
  const [actualizando, setActualizando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const parar = useRef(false)

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/calificaciones?vista=${vista === 'esperando' ? 'esperando' : 'listas'}`)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setAviso(d.error ?? 'No se pudo cargar'); return }
    setDatos(d)
    // Por defecto, cada una con su sugerencia marcada.
    setElegidas(Object.fromEntries((d.ordenes as Orden[]).filter(o => o.sugerencia !== 'esperar').map(o => [o.id, o.sugerencia as Tipo])))
  }, [vista])
  useEffect(() => { cargar() }, [cargar])

  const actualizar = async () => {
    setActualizando(true); setAviso(null)
    try {
      const r = await fetch('/api/calificaciones/sincronizar', { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      const errores = (d.resultado ?? []).filter((x: { error?: string }) => x.error)
      if (!r.ok || errores.length) setAviso(errores.map((e: { cuenta: string; error: string }) => `${e.cuenta}: ${e.error}`).join(' · ') || d.error)
      await cargar()
    } finally { setActualizando(false) }
  }

  const visibles = useMemo(() => (datos?.ordenes ?? []).filter(o => filtro === 'todas' || o.sugerencia === filtro), [datos, filtro])
  const aCalificar = visibles.filter(o => elegidas[o.id])
  const n = (t: Tipo) => aCalificar.filter(o => elegidas[o.id] === t).length

  const calificar = async () => {
    if (!datos || aCalificar.length === 0) return
    const p = datos.plantillas
    const ok = await confirm({
      title: `Calificar ${aCalificar.length} ventas`,
      message: `Es público en MercadoLibre y no se puede deshacer desde aquí.\n\n` +
        (n('concretada') ? `• ${n('concretada')} concretadas → ${RATING[p.concretada.rating]}: "${p.concretada.mensaje}"\n` : '') +
        (n('no_concretada') ? `• ${n('no_concretada')} no concretadas → ${RATING[p.noConcretada.rating]}: "${p.noConcretada.mensaje}"` : ''),
      confirmText: 'Calificar',
    })
    if (!ok) return
    setCorriendo(true); parar.current = false
    const cola = aCalificar.map(o => ({ id: o.id, tipo: elegidas[o.id] as Tipo }))
    const errores: string[] = []
    setProgreso({ hechas: 0, total: cola.length, errores })
    try {
      for (let i = 0; i < cola.length && !parar.current; i += 5) {
        const r = await fetch('/api/calificaciones/calificar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ordenes: cola.slice(i, i + 5) }),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) { errores.push(d.error ?? 'Se cortó'); break }
        for (const x of d.resultados as { id: string; ok: boolean; detalle?: string }[]) if (!x.ok) errores.push(`${x.id}: ${x.detalle}`)
        setProgreso({ hechas: Math.min(i + 5, cola.length), total: cola.length, errores: [...errores] })
      }
    } finally {
      setCorriendo(false)
      cargar()
    }
  }

  const sinc = datos?.cuentas.map(c => c.ordenes_sync_at).filter(Boolean).sort()[0]
  return (
    <div className="space-y-4">
      <PageHeader title="Calificaciones" subtitle="Ventas de MercadoLibre sin calificar, cruzadas con el sistema: lo cargado se concretó, lo que nunca entró no"
        actions={<button onClick={actualizar} disabled={actualizando || corriendo} className="btn-secondary text-sm">{actualizando ? 'Trayendo ventas…' : 'Actualizar ventas'}</button>} />
      {aviso && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-lg text-sm">{aviso}</div>}

      <Tabs value={vista} onChange={setVista} items={[
        { value: 'listas', label: 'Por calificar', count: datos ? datos.contadores.concretadas + datos.contadores.no_concretadas : undefined },
        { value: 'esperando', label: 'Esperando', count: datos?.contadores.esperando },
        ...(isAdmin ? [{ value: 'textos' as const, label: 'Textos' }] : []),
      ]} />

      {!datos ? <Cargando /> : vista === 'textos' ? <Textos plantillas={datos.plantillas} onGuardado={cargar} /> : (
        <>
          <p className="text-xs text-neutral-500">
            {datos.desdeML ? (vista === 'listas'
              ? <>Despachada (su etiqueta salió en Despachos) → <b>concretada</b>. Sin despachar después de {datos.plantillas.noConcretada.dias} días, o cancelada en MercadoLibre → <b>no concretada</b>. Puedes cambiar cada una antes de calificar.</>
              : <>Ventas recientes que todavía no se despacharon: al imprimir su etiqueta pasan a concretadas; si a los {datos.plantillas.noConcretada.dias} días no salieron, a no concretadas.</>)
            : vista === 'listas'
              ? <>En el sistema (cargada o facturada) → <b>concretada</b>. Sin cargar después de {datos.plantillas.noConcretada.dias} días → <b>no concretada</b>. Puedes cambiar cada una antes de calificar.</>
              : <>Ventas recientes que todavía no están en el sistema: si se cargan, pasan a concretadas; si a los {datos.plantillas.noConcretada.dias} días no aparecen, a no concretadas.</>}
            {sinc && <> · Ventas actualizadas {new Date(sinc).toLocaleString('es-VE')}</>}
          </p>

          {vista === 'listas' && datos.ordenes.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 bg-white rounded-xl border border-neutral-200 shadow-sm px-4 py-3">
              {(['todas', 'concretada', 'no_concretada'] as const).map(f => (
                <button key={f} onClick={() => setFiltro(f)}
                  className={`px-3 py-1 text-xs font-medium rounded-full border ${filtro === f ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-600 border-neutral-200'}`}>
                  {f === 'todas' ? `Todas ${datos.contadores.concretadas + datos.contadores.no_concretadas}` : f === 'concretada' ? `Concretadas ${datos.contadores.concretadas}` : `No concretadas ${datos.contadores.no_concretadas}`}
                </button>
              ))}
              <span className="ml-auto text-sm text-neutral-600">{aCalificar.length} marcadas</span>
              {corriendo
                ? <button onClick={() => { parar.current = true }} className="btn-ghost text-sm text-red-600">Detener</button>
                : <button onClick={calificar} disabled={aCalificar.length === 0} className="btn-primary text-sm">Calificar {aCalificar.length}</button>}
            </div>
          )}

          {progreso && (
            <div className={`px-4 py-2.5 rounded-lg text-sm border ${progreso.errores.length ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
              {corriendo ? 'Calificando' : 'Listo'}: {progreso.hechas} de {progreso.total}
              {progreso.errores.length > 0 && <> · {progreso.errores.length} con problema
                <ul className="mt-1 text-xs list-disc pl-5 max-h-32 overflow-y-auto">{progreso.errores.map((e, i) => <li key={i}>{e}</li>)}</ul></>}
            </div>
          )}

          {visibles.length === 0 ? (
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm">
              <EmptyState message={datos.cuentas.length === 0 ? 'No hay cuentas de MercadoLibre conectadas (Preguntas → Cuentas y políticas).'
                : vista === 'listas' ? 'No hay ventas por calificar. Si recién conectaste las cuentas, dale "Actualizar ventas".' : 'Nada esperando.'} />
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
              <table className="w-full text-sm [&_th]:whitespace-nowrap">
                <thead className="bg-neutral-50 text-xs text-neutral-500">
                  <tr className="border-b border-neutral-100">
                    <th className="px-3 py-2 text-left">Venta</th>
                    <th className="px-3 py-2 text-left">Comprador</th>
                    <th className="px-3 py-2 text-left">Productos</th>
                    <th className="px-3 py-2 text-left">En el sistema</th>
                    {vista === 'listas' && <th className="px-3 py-2 text-left">Calificar como</th>}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map(o => (
                    <tr key={o.id} className="border-b border-neutral-50 align-top">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="font-mono text-xs text-neutral-700">{o.id}</div>
                        <div className="text-xs text-neutral-400">{o.cuenta} · {new Date(o.fecha).toLocaleDateString('es-VE')}</div>
                      </td>
                      <td className="px-3 py-2 text-neutral-700">{o.comprador ?? '—'}
                        {o.cal_comprador && <div className="text-xs text-neutral-400">te calificó {RATING[o.cal_comprador] ?? o.cal_comprador}</div>}
                      </td>
                      <td className="px-3 py-2 text-neutral-700 max-w-[28rem]"><span className="line-clamp-2">{o.productos}</span></td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {o.sistema_estado === 'DESPACHADA' ? <span className="text-xs font-medium text-emerald-700">Despachada</span>
                          : o.sistema_estado ? <StatusBadge status={o.sistema_estado} label={STATUS_LABELS[o.sistema_estado]} />
                          : <span className="text-xs text-amber-700">{datos.desdeML ? 'Sin despachar' : 'No cargada'}</span>}
                        {o.facturada && <div className="text-xs text-emerald-700 mt-0.5">Facturada</div>}
                      </td>
                      {vista === 'listas' && (
                        <td className="px-3 py-2">
                          <select value={elegidas[o.id] ?? ''} onChange={e => setElegidas(x => ({ ...x, [o.id]: (e.target.value || null) as Tipo | null }))}
                            className={`border rounded-lg px-2 py-1 text-xs ${elegidas[o.id] === 'concretada' ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                              : elegidas[o.id] === 'no_concretada' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-neutral-300'}`}>
                            <option value="concretada">Concretada · {RATING[datos.plantillas.concretada.rating]}</option>
                            <option value="no_concretada">No concretada · {RATING[datos.plantillas.noConcretada.rating]}</option>
                            <option value="">No calificar ahora</option>
                          </select>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Textos({ plantillas, onGuardado }: { plantillas: Plantillas; onGuardado: () => void }) {
  const [p, setP] = useState(plantillas)
  const [msg, setMsg] = useState<string | null>(null)
  const guardar = async () => {
    const r = await fetch('/api/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ calificaciones_plantillas: JSON.stringify(p) }),
    })
    setMsg(r.ok ? 'Guardado' : 'No se pudo guardar'); if (r.ok) onGuardado()
  }
  const sel = 'border border-neutral-300 rounded-lg px-2 py-1.5 text-sm'
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-2">
        <h2 className="font-semibold text-neutral-900">Venta concretada</h2>
        <select value={p.concretada.rating} onChange={e => setP({ ...p, concretada: { ...p.concretada, rating: e.target.value } })} className={sel}>
          <option value="positive">Positiva</option><option value="neutral">Neutral</option><option value="negative">Negativa</option>
        </select>
        <input value={p.concretada.mensaje} maxLength={160} onChange={e => setP({ ...p, concretada: { ...p.concretada, mensaje: e.target.value } })}
          className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
      </section>
      <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-2">
        <h2 className="font-semibold text-neutral-900">Venta no concretada</h2>
        <div className="flex flex-wrap gap-2">
          <select value={p.noConcretada.rating} onChange={e => setP({ ...p, noConcretada: { ...p.noConcretada, rating: e.target.value } })} className={sel}>
            <option value="positive">Positiva</option><option value="neutral">Neutral</option><option value="negative">Negativa</option>
          </select>
          <select value={p.noConcretada.motivo} onChange={e => setP({ ...p, noConcretada: { ...p.noConcretada, motivo: e.target.value } })} className={sel}>
            {Object.entries(MOTIVOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <label className="text-sm text-neutral-600 flex items-center gap-1">a los
            <input type="number" min={1} max={60} value={p.noConcretada.dias}
              onChange={e => setP({ ...p, noConcretada: { ...p.noConcretada, dias: Math.max(1, Number(e.target.value) || 3) } })}
              className="w-16 border border-neutral-300 rounded-lg px-2 py-1.5 text-sm" /> días sin cargar
          </label>
        </div>
        <input value={p.noConcretada.mensaje} maxLength={160} onChange={e => setP({ ...p, noConcretada: { ...p.noConcretada, mensaje: e.target.value } })}
          className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
      </section>
      <div className="lg:col-span-2 flex items-center justify-end gap-3">
        {msg && <span className="text-xs text-neutral-600">{msg}</span>}
        <button onClick={guardar} className="btn-primary text-sm">Guardar textos</button>
      </div>
    </div>
  )
}
