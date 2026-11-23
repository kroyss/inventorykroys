'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePrimera } from '@/lib/primera'
import { PageHeader, Tabs, EmptyState, Cargando, StatusBadge, STATUS_LABELS, ESTADOS_VENTA_VE } from '@/components/ui'
import { BotonInfo, PanelInfo } from '@/components/ui/Info'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { LoQueSeHablo } from '@/components/ventas/PagoYContexto'
import { DIA_AUTO_NO_CONCRETADA, MAX_DIAS_NO_CONCRETADA, ML_CONCRETA_SOLA_DIAS, diasParaConcretarSola } from '@/lib/noConcretada'
import { useAlActualizar } from '@/lib/useAlActualizar'
import CalificarVenta, { MOTIVOS, TIPOS, etiquetaTipo, plantillaDe, type TipoCal } from '@/components/preguntas/CalificarVenta'
import { Nuevo } from '@/components/ui/Nuevo'

interface Orden {
  id: string; fecha: string; comprador: string | null; productos: string | null; total: number; moneda: string
  cal_comprador: string | null; cuenta: string; sistema_estado: string | null; facturada: boolean
  // Lo que dijo el comprador (22-10): rating ('' = ML no dio el detalle; null = todavía no leído), concretada y comentario.
  cal_recibida?: string | null; cal_recibida_concretada?: boolean | null; cal_recibida_msg?: string | null
  // 'revisar': el sistema no puede saberlo (impresa y nunca reportada, o empresa sin Despachos): decide una persona.
  sugerencia: 'concretada' | 'no_concretada' | 'esperar' | 'revisar'
  en_espera: boolean            // todavía en los días de espera (desde el reporte o la compra): pestaña Próximas
  lista_el: string              // YYYY-MM-DD: el día en que sale de la espera
  guia_impresa: boolean; reportada_at: string | null
  // 10-11: usa Pagos ME pero no se buscaron los pagos después del plazo (va a Revisar) · tiene pago en Pagos ME.
  falta_traer?: boolean; con_pago?: boolean
  sin_traer?: boolean   // no se buscaron los pagos desde la venta
  enlazada_local?: boolean; numero_venta?: string   // mig 165: enlazada a una venta LOCAL (con inventario)
  chat?: { at: string; comprador: boolean | null } | null   // último mensaje de la venta (y si fue del comprador)
  duplicada_de?: string | null   // 23-11: posible compra duplicada (la gemela del mismo día sí se concretó)
}
interface Plantillas {
  concretada: { rating: string; mensaje: string }
  noConcretada: { rating: string; motivo: string; mensaje: string; dias: number }
  noConcretadaOk: { rating: string; motivo: string; mensaje: string }
  esperaDias: number
  auto: boolean
  hora?: number
  autoNoConcretada?: boolean
  horaNc?: number
}
const horaTxt = (h: number | undefined) => `${String(h ?? 10).padStart(2, '0')}:00`
interface Datos {
  ordenes: Orden[]; contadores: { concretadas: number; no_concretadas: number; revisar: number; proximas: number; esperando: number }
  /** Cómo decide "concretada" (lib/calificacionesML.ts): con Reportador = guía reportada; usa Despachos = imprimió guías en 30 días. */
  conReportador?: boolean; usaDespachos?: boolean; topeDias?: number; pagosME?: boolean
  plantillas: Plantillas; cuentas: { nickname: string; ordenes_sync_at: string | null }[]
  /** Empresa sin inventario: "en el sistema" = despachada (etiqueta impresa en Despachos). */
  desdeML?: boolean
  /** Última calificación automática (lib/calificacionesAuto.ts). */
  autoUltimo: { fecha: string; estado: string; at?: string; calificadas?: number; errores?: number; quitadas?: number } | null
  autoNcUltimo?: { fecha: string; estado: string; at?: string; calificadas?: number; errores?: number; quitadas?: number } | null
}
type Tipo = TipoCal
/** 'YYYY-MM-DD' → 'dd/mm' (sin pasar por Date: no se corre un día). */
const diaMes = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`

const RATING: Record<string, string> = { positive: 'positiva', neutral: 'neutral', negative: 'negativa' }

/** La sugerencia de cada venta; si el comprador dijo que SÍ se concretó, se sigue eso (22-10). */
const sugeridaDe = (o: Orden): Tipo => o.cal_recibida_concretada === true ? 'concretada'
  : o.duplicada_de ? 'no_concretada_ok'   // 23-11: la compra repetida (la otra se concretó): «sin problema»
  : (o.sugerencia === 'esperar' || o.sugerencia === 'revisar' ? 'concretada' : o.sugerencia)

/** "Te calificó: Concretada · Positiva — 'comentario'" (verde / gris / rojo según la calificación). */
function LoQueDijo({ o, leyendo }: { o: Orden; leyendo: boolean }) {
  if (leyendo) return <div className="text-xs text-neutral-400">Te calificó · leyendo…</div>
  const r = o.cal_recibida
  // 24-10: ML no deja ver la calificación, pero ya dijo que el comprador tiene el producto (rechazó la no concretada).
  if ((!r || !RATING[r]) && o.cal_recibida_concretada === true) return (
    <div className="mt-0.5 max-w-[18rem] rounded bg-amber-50 px-1.5 py-1 text-xs leading-snug text-amber-900 ring-1 ring-inset ring-amber-200">
      El comprador le dijo a ML que <b>ya tiene el producto</b>: solo se puede calificar <b>concretada</b>. Si no es así, háblale por mensaje.
    </div>
  )
  if (!r || !RATING[r]) return <div className="text-xs text-neutral-400">Ya te calificó · ML muestra qué dijo cuando tú califiques</div>
  const color = r === 'positive' ? 'text-emerald-700' : r === 'negative' ? 'text-red-700' : 'text-neutral-600'
  const conc = o.cal_recibida_concretada === true ? 'Concretada' : o.cal_recibida_concretada === false ? 'No concretada' : null
  return (
    <div className="mt-0.5 max-w-[18rem] text-xs leading-snug">
      <span className="text-neutral-500">Te calificó: </span>
      <b className={color}>{conc ? `${conc} · ` : ''}{RATING[r][0].toUpperCase() + RATING[r].slice(1)}</b>
      {o.cal_recibida_msg && <span className="text-neutral-500" title={o.cal_recibida_msg}> — “{o.cal_recibida_msg.length > 90 ? o.cal_recibida_msg.slice(0, 90) + "…" : o.cal_recibida_msg}”</span>}
    </div>
  )
}

/** Calificaciones en bloque: ventas de ML sin calificar, cruzadas con el sistema. */
export default function CalificacionesClient({ isAdmin, despachaVE = false, inicial = null }: { isAdmin: boolean; despachaVE?: boolean
  /** 12-11 (rapidez): «Por calificar», ya en el HTML. */
  inicial?: unknown }) {
  const confirm = useConfirm()
  const [vista, setVista] = useState<'listas' | 'proximas' | 'esperando' | 'config'>('listas')
  const [verInfo, setVerInfo] = useState(false)
  const [datos, setDatos] = useState<Datos | null>(null)
  const [elegidas, setElegidas] = useState<Record<string, Tipo | null>>({})
  const [filtro, setFiltro] = useState<'todas' | Tipo | 'revisar' | 'calificaron'>('todas')
  const [leyendo, setLeyendo] = useState<Set<string>>(new Set())
  const [corriendo, setCorriendo] = useState(false)
  const [progreso, setProgreso] = useState<{ hechas: number; total: number; errores: string[]; quitadas: string[] } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ya, setYa] = useState<Orden | null>(null)   // 23-11: «Calificar ya» de Próximas
  const parar = useRef(false)

  const primera = usePrimera(inicial as Datos | null)
  const cargar = useCallback(async () => {
    const pre = primera()
    let d: Datos
    if (pre && vista === 'listas') d = pre
    else {
      const r = await fetch(`/api/calificaciones?vista=${vista === 'config' ? 'listas' : vista}`)
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setAviso(j.error ?? 'No se pudo cargar'); return }
      d = j
    }
    setDatos(d)
    // Por defecto, cada una con su sugerencia marcada (salvo las que siguen en días de espera y las de
    // "Revisar": esas las decide una persona, venta por venta).
    setElegidas(Object.fromEntries((d.ordenes as Orden[]).filter(o => o.sugerencia !== 'esperar' && o.sugerencia !== 'revisar' && !o.en_espera).map(o => [o.id, sugeridaDe(o)])))
    // Lo que dijo el comprador de las que ya te calificaron sin detalle guardado: se lee de ML de a 10, una vez por venta.
    const faltan = (d.ordenes as Orden[]).filter(o => o.cal_comprador && o.cal_recibida == null && !o.en_espera).map(o => o.id)
    if (vista !== 'listas' || !faltan.length) return
    setLeyendo(new Set(faltan))
    for (let i = 0; i < faltan.length; i += 10) {
      const lote = faltan.slice(i, i + 10)
      const r2 = await fetch('/api/calificaciones/comprador', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: lote }) }).catch(() => null)
      const j = r2?.ok ? await r2.json().catch(() => null) : null
      const res = new Map<string, { rating: string | null; concretada: boolean | null; mensaje: string | null }>(
        (j?.resultados ?? []).map((x: { id: string }) => [x.id, x]))
      setDatos(x => x && { ...x, ordenes: x.ordenes.map(o => res.has(o.id)
        ? { ...o, cal_recibida: res.get(o.id)!.rating ?? '', cal_recibida_concretada: res.get(o.id)!.concretada, cal_recibida_msg: res.get(o.id)!.mensaje } : o) })
      // Si el comprador dijo que SÍ se concretó, la sugerencia lo sigue (solo si nadie la cambió a mano).
      setElegidas(x => ({ ...x, ...Object.fromEntries([...res].filter(([id, v]) => v.concretada === true && x[id] === 'no_concretada').map(([id]) => [id, 'concretada' as Tipo])) }))
      setLeyendo(x => { const n = new Set(x); lote.forEach(id => n.delete(id)); return n })
    }
  }, [vista, primera])
  useEffect(() => { cargar() }, [cargar])

  // 18-11: «Actualizar ventas» pasó a la central de actualización (botón de arriba): al terminar, se relee.
  useAlActualizar(['ventas', 'pagosme'], () => { cargar() })

  const visibles = useMemo(() => (datos?.ordenes ?? []).filter(o => filtro === 'todas' || (filtro === 'calificaron' ? !!o.cal_comprador : o.sugerencia === filtro)), [datos, filtro])
  const nCalificaron = (datos?.ordenes ?? []).filter(o => o.cal_comprador && !o.en_espera).length
  const aCalificar = visibles.filter(o => elegidas[o.id] && !o.en_espera)
  // Marcar / desmarcar del lote (casilla): al marcar vuelve la sugerencia de esa venta.
  const marcables = visibles.filter(o => !o.en_espera)
  const todas = marcables.length > 0 && marcables.every(o => elegidas[o.id])
  const sugerida = sugeridaDe
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
        TIPOS.filter(t => n(t.k)).map(t => `• ${n(t.k)} ${t.titulo.toLowerCase()} → ${RATING[plantillaDe(p, t.k).rating]}: "${plantillaDe(p, t.k).mensaje}"`).join('\n'),
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
      {/* 18-11 (el dueño, como en Stock): lo de cómo funciona va en la ⓘ; arriba solo lo que se usa. */}
      <PageHeader title={<span className="inline-flex items-center gap-2">Calificaciones<BotonInfo abierto={verInfo} onClick={() => setVerInfo(v => !v)} /></span>}
        subtitle="Ventas de MercadoLibre sin calificar, cruzadas con el sistema"
        actions={<>
          {sinc && <span className="text-xs text-neutral-400 whitespace-nowrap">actualizadas {new Date(sinc).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit' })}</span>}
        </>} />
      {verInfo && datos && (
        <PanelInfo>
          <li><b className="font-medium text-neutral-800">Concretada</b>: {datos.desdeML ? 'su guía salió en Despachos' : 'está en el sistema (procesada o facturada)'}
            {datos.conReportador ? <>{datos.desdeML ? ' y ya la reportaste' : ' y, si lleva guía, ya la reportaste'} (Reportador); la espera cuenta desde el reporte</> : ''}.</li>
          <li><b className="font-medium text-neutral-800">No concretada</b>: {datos.desdeML ? 'cancelada en MercadoLibre, o ' : ''}sin {datos.desdeML ? 'guía' : 'cargar'} después de {datos.plantillas.noConcretada.dias} días.</li>
          <li><b className="font-medium text-neutral-800">Revisar</b>: el sistema no puede saberlo{datos.conReportador ? ` (la guía se imprimió pero a los ${datos.topeDias ?? 10} días no se reportó)` : ''}{datos.pagosME ? ', o no buscaste los pagos (Traer pagos y guías) después de la venta' : ''}: decides tú. Puedes cambiar cada una antes de calificar.</li>
          {datos.plantillas.esperaDias ? <li><b className="font-medium text-neutral-800">Próximas</b>: ya se sabe cómo calificarlas, pero están en tu espera de {datos.plantillas.esperaDias} día{datos.plantillas.esperaDias === 1 ? '' : 's'}{datos.conReportador ? ' desde que se reportó la guía' : ' desde la compra'}. No tienes que hacer nada; si ya lo recibió, «Calificar ya».</li> : null}
          <li><b className="font-medium text-neutral-800">No concretada · sin problema</b>: no se concretó pero el comprador no hizo nada malo (compra duplicada, anulada de acuerdo). Solo a mano. Si es la misma compra repetida el mismo día, se sugiere sola. También puedes calificar una venta desde Mensajes.</li>
          {(datos.plantillas.auto || datos.plantillas.autoNoConcretada) && <li><b className="font-medium text-neutral-800">Automática</b>:{' '}
            {datos.plantillas.auto ? <>todos los días desde las {horaTxt(datos.plantillas.hora)} se califican solas las concretadas</> : <>las concretadas las calificas tú</>}
            {datos.plantillas.autoNoConcretada ? <>, y el día {DIA_AUTO_NO_CONCRETADA} desde las {horaTxt(datos.plantillas.horaNc)} las no concretadas que se te pasaron.</> : <>; las no concretadas esperan que las revises.</>}</li>}
        </PanelInfo>
      )}
      {aviso && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-lg text-sm">{aviso}</div>}
      {ya && datos && <CalificarVenta ventas={[ya]} plantillas={datos.plantillas} comprador={ya.comprador} verEnCalificaciones={false}
        onCerrar={() => setYa(null)} onListo={() => { cargar() }} />}

      <Tabs value={vista} onChange={setVista} items={[
        { value: 'listas', label: 'Por calificar', count: datos ? datos.contadores.concretadas + datos.contadores.no_concretadas + (datos.contadores.revisar ?? 0) : undefined },
        // Próximas: ya se sabe el resultado y salen solas al cumplir los días de espera.
        // Por definir: todavía no se sabe si se concretó (antes "Esperando", que se confundía con la espera).
        ...(datos?.plantillas.esperaDias ? [{ value: 'proximas' as const, label: 'Próximas', count: datos.contadores.proximas }] : []),
        { value: 'esperando', label: 'Por definir', count: datos?.contadores.esperando },
        ...(isAdmin ? [{ value: 'config' as const, label: 'Configuración' }] : []),
      ]} />

      {!datos ? <Cargando /> : vista === 'config' ? <Configuracion plantillas={datos.plantillas} desdeML={!!datos.desdeML} conReportador={!!datos.conReportador}
        onGuardado={pl => setDatos(d => d && { ...d, plantillas: pl })} /> : (
        <>
          {(datos.plantillas.auto || datos.plantillas.autoNoConcretada) && vista === 'listas' && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900"
              title="Cómo funciona: toca la ⓘ junto al título">
              <b>✓ Calificación automática activa</b>
              <span>· {datos.plantillas.auto ? `concretadas cada día ${horaTxt(datos.plantillas.hora)}` : 'concretadas: tú'}
                {datos.plantillas.autoNoConcretada ? ` · no concretadas el día ${DIA_AUTO_NO_CONCRETADA}` : ''}</span>
              {datos.plantillas.auto && datos.autoUltimo?.estado === 'listo' && (
                <span className="text-emerald-800">· última {new Date(datos.autoUltimo.at ?? datos.autoUltimo.fecha).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit' })}: {datos.autoUltimo.calificadas ?? 0} calificadas
                  {datos.autoUltimo.quitadas ? ` · ${datos.autoUltimo.quitadas} que ML ya no permitía` : ''}
                  {datos.autoUltimo.errores ? <span className="text-amber-800"> · {datos.autoUltimo.errores} con error (quedan en la lista)</span> : ''}</span>
              )}
            </div>
          )}
          {/* Sin Despachos el sistema no puede saber qué se concretó (2026-10-15): se dice claro y las ventas
              pasan a "Revisar" (antes salían como no concretadas y se podía calificar mal a compradores reales). */}
          {datos.desdeML && datos.usaDespachos === false && vista !== 'proximas' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              <b>No estás despachando con Despachos</b>, así que el sistema no puede saber qué ventas se concretaron.
              Para que te sugiera bien y pueda <b>calificar solo</b>, imprime las guías en <b>Despachos</b> y repórtalas con <b>Reportador</b>.
              Mientras tanto, tus ventas quedan para <b>Revisar</b>: decide tú cada una (solo las canceladas en MercadoLibre salen como no concretadas).
            </div>
          )}

          {vista === 'listas' && datos.ordenes.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 bg-white rounded-xl border border-neutral-200 shadow-sm px-4 py-3">
              {(['todas', 'concretada', 'no_concretada', 'revisar', 'calificaron'] as const).filter(f => (f !== 'revisar' || datos.contadores.revisar > 0) && (f !== 'calificaron' || nCalificaron > 0)).map(f => (
                <button key={f} onClick={() => setFiltro(f)}
                  className={`px-3 py-1 text-xs font-medium rounded-full border ${filtro === f ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-600 border-neutral-200'}`}>
                  {f === 'todas' ? `Todas ${datos.contadores.concretadas + datos.contadores.no_concretadas + (datos.contadores.revisar ?? 0)}`
                    : f === 'concretada' ? `Concretadas ${datos.contadores.concretadas}`
                    : f === 'no_concretada' ? `No concretadas ${datos.contadores.no_concretadas}`
                    : f === 'calificaron' ? `Ya te calificaron ${nCalificaron}` : `Revisar ${datos.contadores.revisar}`}
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
              <EmptyState message={datos.cuentas.length === 0 ? 'No hay cuentas de MercadoLibre conectadas (Automatiza → Cuentas de MercadoLibre).'
                : vista === 'listas' ? 'No hay ventas por calificar. Si recién conectaste las cuentas, toca ↻ Actualizar arriba (junto a Novedades).' : vista === 'proximas' ? 'Nada en espera.' : 'Nada por definir.'} />
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
                        {o.cal_comprador && <LoQueDijo o={o} leyendo={leyendo.has(o.id)} />}
                        {/* Antes de calificar: ¿el comprador escribió? Un chip que abre la conversación sin salir a ML
                            (azul = el último mensaje es del comprador; gris = tuyo; clarito = sin mensajes). */}
                        <div className="mt-1">
                          <LoQueSeHablo numero={o.id} chip
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset transition-colors ${
                              o.chat?.comprador ? 'bg-sky-50 text-sky-800 ring-sky-200 font-medium hover:bg-sky-100'
                                : o.chat ? 'bg-neutral-50 text-neutral-600 ring-neutral-200 hover:bg-neutral-100'
                                : 'text-neutral-400 ring-neutral-200 hover:text-neutral-600 hover:bg-neutral-50'}`}
                            etiqueta={<>💬 {o.chat ? <>{o.chat.comprador ? 'Escribió' : 'Mensajes'} · {new Date(o.chat.at).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' })}</> : 'Ver chat'} ›</>} />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-neutral-700 max-w-[28rem]"><span className="line-clamp-2">{o.productos}</span></td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {o.sistema_estado === 'REPORTADA' ? <span className="text-xs font-medium text-emerald-700">Guía reportada</span>
                          : o.sistema_estado === 'POR_FUERA' ? <span className="text-xs font-medium text-emerald-700" title="Marcada en Pagos ME: se despachó sin pasar por el sistema">Despachada por fuera</span>
                          : o.sistema_estado === 'DESPACHADA' ? <span className={`text-xs font-medium ${datos.conReportador ? 'text-sky-700' : 'text-emerald-700'}`}>Guía impresa</span>
                          : o.sistema_estado ? <StatusBadge status={o.sistema_estado} label={(despachaVE && ESTADOS_VENTA_VE[o.sistema_estado]) || STATUS_LABELS[o.sistema_estado]} />
                          : <span className="text-xs text-amber-700">{datos.desdeML ? 'Sin despachar' : 'No cargada'}</span>}
                        {o.facturada && <div className="text-xs text-emerald-700 mt-0.5">Facturada</div>}
                        {/* 11-11: el enlace con la venta LOCAL se hace en Ventas → Por confirmar; aquí solo se muestra. */}
                        {!datos.desdeML && o.enlazada_local && <div className="text-xs text-emerald-700 mt-0.5">Enlazada a venta LOCAL</div>}
                        {/* Con inventario: la guía en Despachos va aparte del estado de la venta. */}
                        {!datos.desdeML && o.guia_impresa && (
                          <div className={`text-xs mt-0.5 ${o.reportada_at ? 'text-emerald-700' : 'text-sky-700'}`}>{o.reportada_at ? 'Guía reportada' : 'Guía sin reportar'}</div>
                        )}
                        {/* 23-10: ML la da por concretada sola a los 7 días de la compra y cobra la comisión. */}
                        {/* También en "Por definir" (sin cargar todavía): para ver venir las que vencen. */}
                        {/* 10-11: en Por definir, qué falta para saberlo (antes no se entendía por qué estaban ahí). */}
                        {o.sugerencia === 'esperar' && (() => {
                          const falta = o.guia_impresa
                            ? (datos.conReportador && !o.reportada_at ? 'Falta reportar la guía' : null)
                            : o.sistema_estado ? null
                            : o.con_pago ? 'Pagó · falta la guía'
                            : o.sin_traer ? 'Falta traer pagos (Traer pagos y guías)'
                            : 'Sin pago todavía'
                          return falta && <div className="mt-0.5 text-xs text-neutral-600">{falta}</div>
                        })()}
                        {(o.sugerencia === 'no_concretada' || (o.sugerencia === 'revisar' && o.falta_traer) || (o.sugerencia === 'esperar' && !o.sistema_estado)) && (() => {
                          const q = diasParaConcretarSola(o.fecha)
                          return (
                            <div className={`mt-0.5 text-xs font-medium ${q <= 1 ? 'text-red-700' : 'text-amber-700'}`}
                              title={`MercadoLibre la da por concretada sola a los ${ML_CONCRETA_SOLA_DIAS} días de la compra y cobra la comisión`}>
                              {q === 0 ? '⏰ ML la concreta sola hoy' : q === 1 ? '⏰ ML la concreta sola mañana' : `ML la concreta sola en ${q} días`}
                            </div>
                          )
                        })()}
                        {o.sugerencia === 'revisar' && (
                          <div className="mt-0.5 text-xs font-medium text-violet-700"
                            title="El sistema no puede saber si se concretó: decide tú">
                            Revisar · {o.guia_impresa ? `impresa, sin reportar en ${datos.topeDias ?? 10} días`
                              : o.falta_traer ? 'no buscaste los pagos después de esta venta: toca Traer pagos y guías y luego decide'
                              : 'sin guía en el sistema'}
                          </div>
                        )}
                      </td>
                      {vista === 'listas' && (
                        <td className="px-3 py-2">
                          {o.en_espera ? null : <select value={elegidas[o.id] ?? ''} onChange={e => setElegidas(x => ({ ...x, [o.id]: (e.target.value || null) as Tipo | null }))}
                            className={`border rounded-lg px-2 py-1 text-xs ${elegidas[o.id] === 'concretada' ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                              : elegidas[o.id] === 'no_concretada' ? 'border-amber-300 bg-amber-50 text-amber-900'
                              : elegidas[o.id] === 'no_concretada_ok' ? 'border-sky-300 bg-sky-50 text-sky-900' : 'border-neutral-300'}`}>
                            {TIPOS.map(t => <option key={t.k} value={t.k}>{etiquetaTipo(datos.plantillas, t.k)}</option>)}
                            <option value="">No calificar ahora</option>
                          </select>}
                          {/* 23-11: misma compra repetida el mismo día (la otra sí se concretó): se sugiere «sin problema». */}
                          {!o.en_espera && o.duplicada_de && (
                            <p className="mt-1 max-w-[14rem] text-[11px] leading-snug text-sky-800" title={`La otra venta (${o.duplicada_de}) del mismo comprador y producto, ese mismo día, sí se concretó`}>
                              🤝 Posible compra duplicada: la otra (…{o.duplicada_de.slice(-6)}) sí se concretó.
                            </p>
                          )}
                          {/* Lo contrario de lo que dijo el comprador queda "contradictoria" en ML. */}
                          {!o.en_espera && elegidas[o.id] && o.cal_recibida_concretada != null && (elegidas[o.id] === 'concretada') !== o.cal_recibida_concretada && (
                            <p className="mt-1 max-w-[14rem] text-[11px] leading-snug text-amber-700">
                              El comprador dijo que {o.cal_recibida_concretada ? 'sí' : 'no'} se concretó: si calificas distinto queda contradictoria.
                            </p>
                          )}
                        </td>
                      )}
                      {vista === 'proximas' && (
                        <td className="px-3 py-2 whitespace-nowrap text-xs">
                          <span className={`font-medium ${o.sugerencia === 'concretada' ? 'text-emerald-700' : 'text-amber-800'}`}>
                            {o.sugerencia === 'concretada' ? 'Concretada' : o.sugerencia === 'revisar' ? 'Revisar' : 'No concretada'}
                          </span>
                          <span className="text-neutral-500"> · {o.sugerencia === 'concretada' && datos.plantillas.auto ? 'se califica sola el' : 'pasa a Por calificar el'} {diaMes(o.lista_el)}</span>
                          {/* 23-11: si el comprador ya lo recibió o retiró, no hay que esperar. */}
                          <div className="mt-1.5">
                            <button onClick={() => setYa(o)} className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-800 hover:border-neutral-400 hover:bg-neutral-50">
                              Calificar ya<Nuevo clave="calificar_mensajes" />
                            </button>
                          </div>
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


/** ⓘ que se toca (también en el celular): abre su texto debajo de la fila (no un globo que se sale de la pantalla). */
function BotonTip({ abierto, onClick, etiqueta }: { abierto: boolean; onClick: () => void; etiqueta: string }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={abierto} aria-label={etiqueta} title={etiqueta}
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold leading-none ${abierto ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-500 hover:border-neutral-500 hover:text-neutral-800'}`}>i</button>
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

type Fila = 'concretada' | 'no_concretada' | 'no_concretada_ok' | 'cuando_c' | 'cuando_nc'
const TOPE_DIAS_TXT = 10

/** 23-11 (el dueño: «no quiero saturar»): dos bloques compactos. 1) Mensajes de calificación: una línea por tipo con
 *  «Editar» que la abre en su lugar. 2) Cuándo y automático: una fila por caso con sus interruptores. Lo explicativo va
 *  en ⓘ y el aviso legal solo junto a lo automático prendido. Cada fila se guarda sola («✓ Guardado»). */
function Configuracion({ plantillas, desdeML, conReportador, onGuardado }: {
  plantillas: Plantillas; desdeML: boolean; conReportador: boolean; onGuardado: (p: Plantillas) => void
}) {
  const [p, setP] = useState(plantillas)
  const [editando, setEditando] = useState<TipoCal | null>(null)
  const [borrador, setBorrador] = useState<{ rating: string; motivo: string; mensaje: string } | null>(null)
  const [estado, setEstado] = useState<{ fila: Fila; ok: boolean; guardando?: boolean } | null>(null)
  const [tip, setTip] = useState<string | null>(null)
  const quitar = useRef<ReturnType<typeof setTimeout> | null>(null)

  const guardar = async (nuevo: Plantillas, fila: Fila) => {
    const antes = p
    setP(nuevo); setEstado({ fila, ok: true, guardando: true })
    const r = await fetch('/api/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ calificaciones_plantillas: JSON.stringify(nuevo) }),
    }).catch(() => null)
    if (!r?.ok) { setP(antes); setEstado({ fila, ok: false }); return false }
    setEstado({ fila, ok: true }); onGuardado(nuevo)
    if (quitar.current) clearTimeout(quitar.current)
    quitar.current = setTimeout(() => setEstado(e => e?.fila === fila && e.ok ? null : e), 2500)
    return true
  }
  const guardado = (fila: Fila) => estado?.fila !== fila ? null
    : estado.guardando ? <span className="text-xs text-neutral-400">Guardando…</span>
    : estado.ok ? <span className="text-xs font-medium text-emerald-700">✓ Guardado</span>
    : <span className="text-xs font-medium text-red-700">No se pudo guardar</span>
  const tipBoton = (k: string) => <BotonTip abierto={tip === k} onClick={() => setTip(t => t === k ? null : k)} etiqueta="Más información" />
  const tipTexto = (k: string, children: ReactNode) => tip !== k ? null
    : <p className="mt-2 rounded-lg bg-neutral-50 px-3 py-2 text-xs leading-relaxed text-neutral-600">{children}</p>

  const sel = 'rounded-lg border border-neutral-300 bg-white px-2 py-1 text-sm'
  const horas = Array.from({ length: 17 }, (_, i) => i + 6).map(h => <option key={h} value={h}>{horaTxt(h)}</option>)
  const ratings = <><option value="positive">Positiva</option><option value="neutral">Neutral</option><option value="negative">Negativa</option></>
  const diasEspera = [...new Set([...Array.from({ length: 16 }, (_, i) => i), p.esperaDias])].sort((a, b) => a - b)
  const plantilla = (t: TipoCal) => plantillaDe(p, t) as { rating: string; motivo?: string; mensaje: string }

  const abrir = (t: TipoCal) => { const x = plantilla(t); setEditando(t); setBorrador({ rating: x.rating, motivo: x.motivo ?? 'BUYER_REGRETS', mensaje: x.mensaje }) }
  const guardarTipo = async () => {
    if (!editando || !borrador || !borrador.mensaje.trim()) return
    const m = borrador.mensaje.trim().slice(0, 160)
    const nuevo: Plantillas = editando === 'concretada' ? { ...p, concretada: { rating: borrador.rating, mensaje: m } }
      : editando === 'no_concretada' ? { ...p, noConcretada: { ...p.noConcretada, rating: borrador.rating, motivo: borrador.motivo, mensaje: m } }
      : { ...p, noConcretadaOk: { rating: borrador.rating, motivo: borrador.motivo, mensaje: m } }
    if (await guardar(nuevo, editando)) setEditando(null)
  }

  const caja = 'rounded-xl border border-neutral-200 bg-white shadow-sm'
  const legal = <p className="mt-2 text-[11px] leading-snug text-neutral-500">Las calificaciones son públicas y salen a tu nombre: con esto prendido se publican sin revisarlas una por una.</p>

  return (
    <div className="space-y-4">
      {/* 1) Mensajes de calificación */}
      <section className={caja}>
        <h2 className="border-b border-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-900">Mensajes de calificación</h2>
        <ul className="divide-y divide-neutral-100">
          {TIPOS.map(t => {
            const x = plantilla(t.k)
            const b = editando === t.k ? borrador : null
            return (
              <li key={t.k} className="px-4 py-3">
                {!b ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:flex-nowrap">
                    <span className="shrink-0 text-sm font-medium text-neutral-900">{t.icono} {t.titulo}
                      {t.k === 'no_concretada_ok' && <Nuevo clave="calificar_mensajes" />}</span>
                    <span className="shrink-0 text-xs text-neutral-500">{RATING[x.rating] ?? x.rating}{t.k !== 'concretada' && x.motivo ? ` · ${MOTIVOS[x.motivo] ?? x.motivo}` : ''}</span>
                    <span className="min-w-0 flex-1 basis-full truncate text-sm text-neutral-600 sm:basis-auto" title={x.mensaje}>“{x.mensaje}”</span>
                    <span className="ml-auto flex shrink-0 items-center gap-2">
                      {guardado(t.k)}
                      <button onClick={() => abrir(t.k)} className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50">Editar</button>
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-neutral-900">{t.icono} {t.titulo}</p>
                    {t.k === 'no_concretada_ok' && (
                      <p className="text-xs text-neutral-500">Para cuando no se concretó pero el comprador no hizo nada malo (compra duplicada por error, se anuló de acuerdo). Solo a mano: lo automático nunca lo usa.</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <select value={b.rating} onChange={e => setBorrador({ ...b, rating: e.target.value })} className={sel} aria-label="Calificación">{ratings}</select>
                      {t.k !== 'concretada' && (
                        <select value={b.motivo} onChange={e => setBorrador({ ...b, motivo: e.target.value })} className={`${sel} min-w-0 max-w-full`} aria-label="Motivo">
                          {Object.entries(MOTIVOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      )}
                    </div>
                    <div className="relative">
                      <input value={b.mensaje} maxLength={160} onChange={e => setBorrador({ ...b, mensaje: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') guardarTipo(); if (e.key === 'Escape') setEditando(null) }} autoFocus
                        aria-label="Mensaje" className="w-full rounded-lg border border-neutral-300 px-3 py-2 pr-14 text-sm" />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-neutral-400">{b.mensaje.length}/160</span>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      {guardado(t.k)}
                      <button onClick={() => setEditando(null)} className="btn-ghost text-sm">Cancelar</button>
                      <button onClick={guardarTipo} disabled={!b.mensaje.trim() || !!estado?.guardando} className="btn-primary text-sm">Guardar</button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {/* 2) Cuándo y automático */}
      <section className={caja}>
        <h2 className="border-b border-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-900">Cuándo y automático</h2>
        <div className="divide-y divide-neutral-100">
          <div className="px-4 py-3">
            <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-6">
              <span className="w-36 shrink-0 text-sm font-medium text-neutral-900">✅ Concretadas</span>
              <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-700">
                <Interruptor on={p.auto} onCambio={v => guardar({ ...p, auto: v }, 'cuando_c')} etiqueta="Calificar solas las concretadas" />
                <span>Calificarlas solas a las</span>
                <select value={p.hora ?? 10} onChange={e => guardar({ ...p, hora: Number(e.target.value) }, 'cuando_c')} className={sel} aria-label="Hora">{horas}</select>
                {tipBoton('auto')}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-sm text-neutral-700">
                <select value={p.esperaDias} onChange={e => guardar({ ...p, esperaDias: Number(e.target.value) }, 'cuando_c')} className={sel} aria-label="Días de espera">
                  {diasEspera.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <span>{p.esperaDias === 1 ? 'día' : 'días'} después de {conReportador ? 'reportar la guía' : desdeML ? 'imprimir la guía' : 'la venta'}</span>
                {tipBoton('espera')}
              </div>
              <span className="lg:ml-auto">{guardado('cuando_c')}</span>
            </div>
            {tipTexto('auto', <>
              Una vez al día, a la hora elegida, califica las que el sistema sabe concretadas y ya cumplieron la espera. Sin Despachos
              {conReportador ? ' y Reportador' : ''} el sistema no sabe cuáles se concretaron y no califica nada solo. Las de «Revisar» y
              las «sin problema» nunca se califican solas.
            </>)}
            {tipTexto('espera', <>
              Ej.: con 2, una guía reportada el lunes se califica el miércoles (cuando ya le llegó). 0 = el mismo día. Las ventas sin guía
              (retiro en tienda) cuentan desde la compra. A los {TOPE_DIAS_TXT} días de la compra se califica igual. Si el comprador ya lo
              tiene antes, usa «Calificar ya» en Próximas o «Calificar» en Mensajes.
            </>)}
            {p.auto && legal}
          </div>

          <div className="px-4 py-3">
            <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-6">
              <span className="w-36 shrink-0 text-sm font-medium text-neutral-900">⛔ No concretadas</span>
              <div className="flex flex-wrap items-center gap-1.5 text-sm text-neutral-700">
                <span>Aparecen en Por calificar a los</span>
                <select value={p.noConcretada.dias} onChange={e => guardar({ ...p, noConcretada: { ...p.noConcretada, dias: Number(e.target.value) } }, 'cuando_nc')} className={sel} aria-label="Días">
                  {Array.from({ length: MAX_DIAS_NO_CONCRETADA }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <span>días</span>
                {tipBoton('nc_dias')}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-700">
                <Interruptor on={!!p.autoNoConcretada} onCambio={v => guardar({ ...p, autoNoConcretada: v }, 'cuando_nc')} etiqueta="Red de seguridad de no concretadas" />
                <span>Red de seguridad: calificar solas el día {DIA_AUTO_NO_CONCRETADA} a las</span>
                <select value={p.horaNc ?? 10} onChange={e => guardar({ ...p, horaNc: Number(e.target.value) }, 'cuando_nc')} className={sel} aria-label="Hora">{horas}</select>
                {tipBoton('red')}
              </div>
              <span className="lg:ml-auto">{guardado('cuando_nc')}</span>
            </div>
            {p.noConcretada.dias >= MAX_DIAS_NO_CONCRETADA && (
              <p className="mt-2 text-xs font-medium text-red-700">Con {MAX_DIAS_NO_CONCRETADA} te queda muy poco tiempo para revisarlas: mejor 3 o 4.</p>
            )}
            {tipTexto('nc_dias', <>
              Las que nunca {desdeML ? 'despachaste' : 'cargaste en Ventas'} (no pagó o no se hizo). Ahí no se califican solas: las revisas tú.
              Máximo {MAX_DIAS_NO_CONCRETADA}; recomendado 3 o 4.
            </>)}
            {tipTexto('red', <>
              MercadoLibre las da por concretadas solas el día {ML_CONCRETA_SOLA_DIAS} y cobra la comisión. Las que nadie calificó se califican
              solas el día {DIA_AUTO_NO_CONCRETADA}, solo si no tienen pago traído ni {desdeML ? 'guía en Despachos' : 'venta cargada ni guía en Despachos'}.
              Ojo: una venta cobrada por fuera del sistema (cobro a destino, una venta personal) también quedaría como no concretada.
            </>)}
            {p.autoNoConcretada && legal}
          </div>
        </div>
      </section>
    </div>
  )
}
