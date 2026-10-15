'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PageHeader, Tabs, EmptyState, Cargando, StatusBadge, STATUS_LABELS } from '@/components/ui'
import { useConfirm } from '@/components/ui/ConfirmProvider'

interface Orden {
  id: string; fecha: string; comprador: string | null; productos: string | null; total: number; moneda: string
  cal_comprador: string | null; cuenta: string; sistema_estado: string | null; facturada: boolean
  sugerencia: 'concretada' | 'no_concretada' | 'esperar'
  en_espera: boolean            // más nueva que los días de espera: todavía no se califica (pestaña Próximas)
  lista_el: string              // YYYY-MM-DD: el día en que sale de la espera
}
interface Plantillas {
  concretada: { rating: string; mensaje: string }
  noConcretada: { rating: string; motivo: string; mensaje: string; dias: number }
  esperaDias: number
  auto: boolean
  hora?: number
}
const horaTxt = (h: number | undefined) => `${String(h ?? 10).padStart(2, '0')}:00`
interface Datos {
  ordenes: Orden[]; contadores: { concretadas: number; no_concretadas: number; proximas: number; esperando: number }
  plantillas: Plantillas; cuentas: { nickname: string; ordenes_sync_at: string | null }[]
  /** Empresa sin inventario: "en el sistema" = despachada (etiqueta impresa en Despachos). */
  desdeML?: boolean
  /** Última calificación automática (lib/calificacionesAuto.ts). */
  autoUltimo: { fecha: string; estado: string; at?: string; calificadas?: number; errores?: number; quitadas?: number } | null
}
type Tipo = 'concretada' | 'no_concretada'
/** 'YYYY-MM-DD' → 'dd/mm' (sin pasar por Date: no se corre un día). */
const diaMes = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`

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
  const [vista, setVista] = useState<'listas' | 'proximas' | 'esperando' | 'config'>('listas')
  const [datos, setDatos] = useState<Datos | null>(null)
  const [elegidas, setElegidas] = useState<Record<string, Tipo | null>>({})
  const [filtro, setFiltro] = useState<'todas' | Tipo>('todas')
  const [corriendo, setCorriendo] = useState(false)
  const [progreso, setProgreso] = useState<{ hechas: number; total: number; errores: string[]; quitadas: string[] } | null>(null)
  const [actualizando, setActualizando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const parar = useRef(false)

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/calificaciones?vista=${vista === 'config' ? 'listas' : vista}`)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setAviso(d.error ?? 'No se pudo cargar'); return }
    setDatos(d)
    // Por defecto, cada una con su sugerencia marcada (salvo las que siguen en días de espera).
    setElegidas(Object.fromEntries((d.ordenes as Orden[]).filter(o => o.sugerencia !== 'esperar' && !o.en_espera).map(o => [o.id, o.sugerencia as Tipo])))
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
  const aCalificar = visibles.filter(o => elegidas[o.id] && !o.en_espera)
  // Marcar / desmarcar del lote (casilla): al marcar vuelve la sugerencia de esa venta.
  const marcables = visibles.filter(o => !o.en_espera)
  const todas = marcables.length > 0 && marcables.every(o => elegidas[o.id])
  const sugerida = (o: Orden): Tipo => (o.sugerencia === 'esperar' ? 'concretada' : o.sugerencia)
  const marcar = (o: Orden, si: boolean) => setElegidas(x => ({ ...x, [o.id]: si ? sugerida(o) : null }))
  const marcarTodas = (si: boolean) =>
    setElegidas(x => ({ ...x, ...Object.fromEntries(marcables.map(o => [o.id, si ? (x[o.id] ?? sugerida(o)) : null])) }))
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
    const quitadas: string[] = []   // ML ya no permitía calificarlas: no es un error, salen de la lista
    setProgreso({ hechas: 0, total: cola.length, errores, quitadas })
    try {
      for (let i = 0; i < cola.length && !parar.current; i += 5) {
        const r = await fetch('/api/calificaciones/calificar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ordenes: cola.slice(i, i + 5) }),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) { errores.push(d.error ?? 'Se cortó'); break }
        for (const x of d.resultados as { id: string; ok: boolean; detalle?: string; quitada?: boolean }[]) {
          if (x.quitada) quitadas.push(`${x.id}: ${x.detalle}`)
          else if (!x.ok) errores.push(`${x.id}: ${x.detalle}`)
        }
        setProgreso({ hechas: Math.min(i + 5, cola.length), total: cola.length, errores: [...errores], quitadas: [...quitadas] })
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
        // Próximas: ya se sabe el resultado y salen solas al cumplir los días de espera.
        // Por definir: todavía no se sabe si se concretó (antes "Esperando", que se confundía con la espera).
        ...(datos?.plantillas.esperaDias ? [{ value: 'proximas' as const, label: 'Próximas', count: datos.contadores.proximas }] : []),
        { value: 'esperando', label: 'Por definir', count: datos?.contadores.esperando },
        ...(isAdmin ? [{ value: 'config' as const, label: 'Configuración' }] : []),
      ]} />

      {!datos ? <Cargando /> : vista === 'config' ? <Configuracion plantillas={datos.plantillas} desdeML={!!datos.desdeML} onGuardado={cargar} /> : (
        <>
          {datos.plantillas.auto && vista === 'listas' && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              <b>Calificación automática activa:</b> todos los días desde las {horaTxt(datos.plantillas.hora)} se califican solas las <b>concretadas</b>; las no concretadas siguen esperando que las revises.
              {datos.autoUltimo?.estado === 'listo' && (
                <> Última: {new Date(datos.autoUltimo.at ?? datos.autoUltimo.fecha).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {datos.autoUltimo.calificadas ?? 0} calificadas
                  {datos.autoUltimo.quitadas ? ` · ${datos.autoUltimo.quitadas} que ML ya no permitía` : ''}
                  {datos.autoUltimo.errores ? <span className="text-amber-800"> · {datos.autoUltimo.errores} con error (quedan en la lista)</span> : ''}.</>
              )}
            </div>
          )}
          <p className="text-xs text-neutral-500">
            {datos.desdeML ? (vista === 'listas'
              ? <>Despachada (su etiqueta salió en Despachos) → <b>concretada</b>. Sin despachar después de {datos.plantillas.noConcretada.dias} días, o cancelada en MercadoLibre → <b>no concretada</b>. Puedes cambiar cada una antes de calificar.</>
              : vista === 'proximas' ? null
              : <>Todavía no se sabe si se concretaron: no se han despachado. Al imprimir su etiqueta pasan a concretadas; si a los {datos.plantillas.noConcretada.dias} días no salieron, a no concretadas.</>)
            : vista === 'listas'
              ? <>En el sistema (cargada o facturada) → <b>concretada</b>. Sin cargar después de {datos.plantillas.noConcretada.dias} días → <b>no concretada</b>. Puedes cambiar cada una antes de calificar.</>
              : vista === 'proximas' ? null
              : <>Todavía no se sabe si se concretaron: no están en el sistema o están en borrador. Si se cargan, pasan a concretadas; si a los {datos.plantillas.noConcretada.dias} días no aparecen, a no concretadas.</>}
            {vista === 'proximas' && <>Ya se sabe cómo calificarlas, pero son de los últimos <b>{datos.plantillas.esperaDias} día{datos.plantillas.esperaDias === 1 ? '' : 's'}</b> (tu espera).
              {datos.plantillas.auto ? ' Las concretadas se califican solas ese día; las no concretadas pasan a Por calificar.' : ' Ese día pasan a Por calificar.'} No tienes que hacer nada.</>}
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

          {progreso && (() => {
            const calificadas = progreso.hechas - progreso.errores.length - progreso.quitadas.length
            return <>
            {(corriendo || calificadas > 0 || progreso.errores.length > 0 || progreso.quitadas.length === 0) && (
            <div className={`px-4 py-2.5 rounded-lg text-sm border ${progreso.errores.length ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
              {corriendo ? `Calificando: ${progreso.hechas} de ${progreso.total}` : `Listo: ${Math.max(0, calificadas)} calificada${calificadas === 1 ? '' : 's'}`}
              {progreso.errores.length > 0 && <> · {progreso.errores.length} con problema
                <ul className="mt-1 text-xs list-disc pl-5 max-h-32 overflow-y-auto">{progreso.errores.map((e, i) => <li key={i}>{e}</li>)}</ul></>}
            </div>
            )}
            {progreso.quitadas.length > 0 && (
              <div className="px-4 py-2.5 rounded-lg text-sm border bg-neutral-50 border-neutral-200 text-neutral-700">
                {progreso.quitadas.length} quitada{progreso.quitadas.length === 1 ? '' : 's'} de la lista: MercadoLibre ya no permitía calificarla{progreso.quitadas.length === 1 ? '' : 's'}. No tienes que hacer nada.
                <ul className="mt-1 text-xs text-neutral-500 list-disc pl-5 max-h-32 overflow-y-auto">{progreso.quitadas.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </div>
            )}
            </>
          })()}

          {visibles.length === 0 ? (
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm">
              <EmptyState message={datos.cuentas.length === 0 ? 'No hay cuentas de MercadoLibre conectadas (Automatizaciones → Cuentas de MercadoLibre).'
                : vista === 'listas' ? 'No hay ventas por calificar. Si recién conectaste las cuentas, dale "Actualizar ventas".' : vista === 'proximas' ? 'Nada en espera.' : 'Nada por definir.'} />
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
              <table className="w-full text-sm [&_th]:whitespace-nowrap">
                <thead className="bg-neutral-50 text-xs text-neutral-500">
                  <tr className="border-b border-neutral-100">
                    {vista === 'listas' && (
                      <th className="pl-3 py-2 w-8">
                        <input type="checkbox" checked={todas} onChange={e => marcarTodas(e.target.checked)} disabled={marcables.length === 0}
                          aria-label="Marcar o desmarcar todas" title="Marcar o desmarcar todas" className="w-4 h-4 accent-neutral-900" />
                      </th>
                    )}
                    <th className="px-3 py-2 text-left">Venta</th>
                    <th className="px-3 py-2 text-left">Comprador</th>
                    <th className="px-3 py-2 text-left">Productos</th>
                    <th className="px-3 py-2 text-left">En el sistema</th>
                    {vista === 'listas' && <th className="px-3 py-2 text-left">Calificar como</th>}
                    {vista === 'proximas' && <th className="px-3 py-2 text-left">Cuándo</th>}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map(o => (
                    <tr key={o.id} className={`border-b border-neutral-50 align-top ${vista === 'listas' && !elegidas[o.id] ? 'opacity-60' : ''}`}>
                      {vista === 'listas' && (
                        <td className="pl-3 py-2">
                          <input type="checkbox" checked={!!elegidas[o.id] && !o.en_espera} disabled={o.en_espera}
                            onChange={e => marcar(o, e.target.checked)} aria-label={`Calificar la venta ${o.id}`}
                            title={o.en_espera ? `En días de espera (${datos.plantillas.esperaDias}): todavía no se califica` : undefined}
                            className="w-4 h-4 mt-0.5 accent-neutral-900" />
                        </td>
                      )}
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
                          {o.en_espera ? null : <select value={elegidas[o.id] ?? ''} onChange={e => setElegidas(x => ({ ...x, [o.id]: (e.target.value || null) as Tipo | null }))}
                            className={`border rounded-lg px-2 py-1 text-xs ${elegidas[o.id] === 'concretada' ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                              : elegidas[o.id] === 'no_concretada' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-neutral-300'}`}>
                            <option value="concretada">Concretada · {RATING[datos.plantillas.concretada.rating]}</option>
                            <option value="no_concretada">No concretada · {RATING[datos.plantillas.noConcretada.rating]}</option>
                            <option value="">No calificar ahora</option>
                          </select>}
                        </td>
                      )}
                      {vista === 'proximas' && (
                        <td className="px-3 py-2 whitespace-nowrap text-xs">
                          <span className={`font-medium ${o.sugerencia === 'concretada' ? 'text-emerald-700' : 'text-amber-800'}`}>
                            {o.sugerencia === 'concretada' ? 'Concretada' : 'No concretada'}
                          </span>
                          <span className="text-neutral-500"> · {o.sugerencia === 'concretada' && datos.plantillas.auto ? 'se califica sola el' : 'pasa a Por calificar el'} {diaMes(o.lista_el)}</span>
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

function Configuracion({ plantillas, desdeML, onGuardado }: { plantillas: Plantillas; desdeML: boolean; onGuardado: () => void }) {
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
      <section className={`lg:col-span-2 rounded-xl border shadow-sm p-4 space-y-2 ${p.auto ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-neutral-200'}`}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={p.auto} onChange={e => setP({ ...p, auto: e.target.checked })} className="mt-1 w-4 h-4" />
          <span>
            <span className="font-semibold text-neutral-900">Calificar automáticamente las concretadas</span>
            <span className="block text-sm text-neutral-600">
              Una vez al día el sistema califica solo, con el texto de &quot;Venta concretada&quot;, las ventas que ya
              {' '}están en el sistema o despachadas y pasaron los días de espera. Las <b>no concretadas nunca</b> se califican solas.
            </span>
          </span>
        </label>
        {/* Desde qué hora (del país). Fuera del label: tocar la hora no prende/apaga el automático. */}
        <div className="flex flex-wrap items-center gap-2 pl-7 text-sm text-neutral-700">
          Calificar todos los días desde las
          <select value={p.hora ?? 10} onChange={e => setP({ ...p, hora: Number(e.target.value) })}
            className="border border-neutral-300 rounded-lg bg-white px-2 py-1 text-sm font-medium">
            {Array.from({ length: 17 }, (_, i) => i + 6).map(h => <option key={h} value={h}>{horaTxt(h)}</option>)}
          </select>
          <span className="text-xs text-neutral-500">
            Si eliges una hora que ya pasó y hoy todavía no corrió, califica en el próximo minuto; si ya corrió hoy, la nueva hora vale desde mañana.
          </span>
        </div>
        <p className="pl-7 text-xs text-neutral-500">
          Las calificaciones son públicas en MercadoLibre y salen a tu nombre: al prenderlo aceptas que se publiquen sin revisarlas una por una.
        </p>
      </section>
      <section className="lg:col-span-2 bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-1">
        <h2 className="font-semibold text-neutral-900">Días de espera</h2>
        <label className="text-sm text-neutral-700 flex flex-wrap items-center gap-2">
          Esperar
          <input type="number" min={0} max={60} value={p.esperaDias}
            onChange={e => setP({ ...p, esperaDias: Math.max(0, Math.min(60, Math.round(Number(e.target.value) || 0))) })}
            className="w-16 border border-neutral-300 rounded-lg px-2 py-1.5 text-sm" />
          días desde la compra antes de calificar
        </label>
        <p className="text-xs text-neutral-500">Ej.: con 3, una venta del lunes se califica desde el jueves. 0 = sin esperar.</p>
      </section>
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
              className="w-16 border border-neutral-300 rounded-lg px-2 py-1.5 text-sm" /> días {desdeML ? 'sin despachar en Despachos' : 'sin cargar en Ventas'}
          </label>
        </div>
        <input value={p.noConcretada.mensaje} maxLength={160} onChange={e => setP({ ...p, noConcretada: { ...p.noConcretada, mensaje: e.target.value } })}
          className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
      </section>
      <div className="lg:col-span-2 flex items-center justify-end gap-3">
        {msg && <span className="text-xs text-neutral-600">{msg}</span>}
        <button onClick={guardar} className="btn-primary text-sm">Guardar configuración</button>
      </div>
    </div>
  )
}
