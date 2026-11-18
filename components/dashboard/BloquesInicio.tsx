'use client'
import { useEffect, useState } from 'react'
import Link from '@/components/ui/Link'
import { cambio, textoMinutos, type CifrasAtencion } from '@/lib/resumenAtencion'
import { textoRango, type RangoInicio } from '@/lib/rangoInicio'
import { FotoProducto } from '@/components/ui/FotoProducto'

// Inicio (14-11, el dueño: "unir Inicio y Reportes → Resumen"): lo que solo estaba en el Resumen, debajo del gráfico
// y con SU MISMO período (Hoy / Mes / Trim. / Año / fechas). Carga después del resto para que el Inicio abra igual de
// rápido. Qué trae lo decide el servidor: quien ve costos, todo; el empleado con Reportes y sin costos, lo que no
// muestra plata (sin cuentas de ML), en el mes.
interface Top { id: number; nombre: string; unidades: number; monto?: number; antes: number }
interface Datos {
  rango: RangoInicio
  top: Top[] | null
  cuentas: { cuenta: string; moneda: string | null; ventas: number; monto: number; antes_ventas: number }[] | null
  calificaciones: { positivas: number; neutrales: number; negativas: number; antes_negativas: number; contradictorias: number } | null
  historialML: boolean
  atencion: { actual: CifrasAtencion; anterior: CifrasAtencion } | null
}
const n = (x: number) => x.toLocaleString('es-VE')

function Cambio({ ahora, antes, menosEsMejor = false }: { ahora: number | null; antes: number | null; menosEsMejor?: boolean }) {
  if (ahora == null || antes == null) return null
  if (!antes) return ahora ? <span className="text-neutral-400">antes 0</span> : null
  const c = cambio(ahora, antes)!
  if (c === 0) return <span className="text-neutral-500">igual que antes</span>
  const bueno = menosEsMejor ? c < 0 : c > 0
  return <span className={bueno ? 'text-emerald-600' : 'text-red-600'}>{c > 0 ? '▲' : '▼'} {Math.abs(c)}%</span>
}

function Tarjeta({ titulo, valor, ahora, antes, menosEsMejor, detalle }: {
  titulo: string; valor: string; ahora?: number | null; antes?: number | null; menosEsMejor?: boolean; detalle?: string
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-medium text-neutral-500">{titulo}</div>
      <div className="num mt-0.5 text-xl font-semibold tracking-tight text-neutral-900">{valor}</div>
      {(ahora !== undefined || detalle) && (
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs">
          {ahora !== undefined && <Cambio ahora={ahora ?? null} antes={antes ?? null} menosEsMejor={menosEsMejor} />}
          {detalle && <span className="text-neutral-500">{detalle}</span>}
        </div>
      )}
    </div>
  )
}

function Seccion({ titulo, ayuda, link, children }: { titulo: string; ayuda?: string; link?: { href: string; t: string }; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-neutral-700">{titulo}</h2>
          {ayuda && <p className="text-xs text-neutral-500">{ayuda}</p>}
        </div>
        {link && <Link href={link.href} className="text-xs font-medium text-sky-700 hover:underline">{link.t} →</Link>}
      </div>
      {children}
    </section>
  )
}

function Esqueleto() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {[0, 1].map(i => <div key={i} className="h-56 animate-pulse rounded-xl border border-neutral-200 bg-neutral-50" />)}
    </div>
  )
}

export default function BloquesInicio({ period, dateFrom, dateTo, reportes, cayendo }: {
  period: string; dateFrom?: string; dateTo?: string
  reportes: boolean     // permiso Reportes: link «Ver todos» a Reportes → Ventas → Por producto
  cayendo: boolean      // Reportes → Stock disponible: cuántos se están cayendo
}) {
  const [d, setD] = useState<Datos | null>(null)
  const [error, setError] = useState(false)
  const [caen, setCaen] = useState<number | null>(null)

  useEffect(() => {
    let vivo = true
    const qs = period === 'custom' ? `period=custom&date_from=${dateFrom}&date_to=${dateTo}` : `period=${period}`
    fetch(`/api/dashboard/bloques?${qs}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject())
      .then(j => { if (vivo) { setD(j); setError(false) } }).catch(() => { if (vivo) setError(true) })
    return () => { vivo = false }
  }, [period, dateFrom, dateTo])

  // «Se están cayendo» no depende del período (regla de Reportes → Stock): se pide una vez y al final.
  useEffect(() => {
    if (!cayendo || !d) return
    let vivo = true
    fetch('/api/reports/stock-analysis').then(r => r.ok ? r.json() : Promise.reject())
      .then(j => { if (vivo) setCaen((j.declive ?? []).length) }).catch(() => {})
    return () => { vivo = false }
  }, [cayendo, !!d]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <p className="text-sm text-neutral-500">No se pudo cargar esta parte del Inicio. Recarga la página.</p>
  if (!d) return <Esqueleto />

  const r = d.rango
  const contra = `contra ${textoRango(r.antesDesde, r.antesHasta)}`
  const max = Math.max(1, ...(d.top ?? []).map(p => p.unidades))
  const verTodos = `/reportes?tab=ventas&vista=producto&desde=${r.desde}&hasta=${r.hasta}`
  const a = d.atencion, c = d.calificaciones

  return (
    <div className="space-y-6">
      {(d.top || (d.cuentas && d.cuentas.length > 0) || caen != null) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {d.top && (
            <Seccion titulo="Más vendidos" ayuda={`Unidades del período, ${contra}.`}>
              <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
                {!d.top.length ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm font-medium text-neutral-700">Todavía no hay ventas en este período</p>
                    <p className="mt-0.5 text-xs text-neutral-500">Se cuentan las ventas procesadas en Ventas.</p>
                  </div>
                ) : (
                  <ol className="divide-y divide-neutral-100">
                    {d.top.map((p, i) => (
                      <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold num ${i === 0 ? 'bg-amber-100 text-amber-800' : i < 3 ? 'bg-neutral-100 text-neutral-700' : 'text-neutral-400'}`}>{i + 1}</span>
                        <FotoProducto id={p.id} nombre={p.nombre} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-neutral-900" title={p.nombre}>{p.nombre}</p>
                          <div className="mt-1 h-1.5 rounded-full bg-neutral-100">
                            <div className="h-1.5 rounded-full bg-sky-500" style={{ width: `${Math.max(4, p.unidades / max * 100)}%` }} />
                          </div>
                        </div>
                        <div className="w-16 shrink-0 text-right">
                          <span className="num text-sm font-semibold text-neutral-900">{n(p.unidades)}</span>
                          <span className="block text-[11px] num">
                            {p.antes === 0 ? <span className="text-neutral-400">nuevo</span>
                              : p.antes < 5 ? <span className={p.unidades >= p.antes ? 'text-emerald-600' : 'text-red-600'}>antes {p.antes}</span>
                              : <Cambio ahora={p.unidades} antes={p.antes} />}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
                {reportes && (
                  <Link href={verTodos} className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50 px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100">
                    <span>Ver todos los productos</span><span aria-hidden>→</span>
                  </Link>
                )}
              </div>
            </Seccion>
          )}

          <div className="space-y-4">
            {d.cuentas && d.cuentas.length > 0 && (
              <Seccion titulo="Por cuenta de MercadoLibre" ayuda={`Ventas de ML no canceladas, ${contra}.${!d.historialML ? ' Las ventas de ML guardadas no llegan tan atrás: la comparación queda incompleta.' : ''}`}>
                <div className="grid grid-cols-2 gap-3">
                  {d.cuentas.map(k => (
                    <Tarjeta key={k.cuenta} titulo={k.cuenta} valor={`${n(k.ventas)} ventas`} ahora={k.ventas} antes={k.antes_ventas}
                      detalle={`${k.moneda === 'VES' ? 'Bs' : '$'} ${k.monto.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`} />
                  ))}
                </div>
              </Seccion>
            )}
            {caen != null && (
              <Link href="/inventario/reponer?sub=declive"
                className="group flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm transition hover:-translate-y-px hover:shadow-md">
                <div>
                  <div className="text-xs font-medium text-neutral-500">Se están cayendo</div>
                  <div className="text-sm text-neutral-700">
                    {caen ? <><b className="num text-xl font-semibold text-neutral-900">{n(caen)}</b> producto{caen === 1 ? '' : 's'} venden la mitad o menos que antes</> : 'Ninguno se está cayendo'}
                  </div>
                </div>
                <span className="shrink-0 text-xs font-medium text-sky-700 group-hover:underline">Ver en Stock →</span>
              </Link>
            )}
          </div>
        </div>
      )}

      {a && (
        <Seccion titulo="Atención en MercadoLibre" ayuda={`Preguntas que te hicieron, cuántas respondiste y qué tan rápido, ${contra}.`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tarjeta titulo="Preguntas recibidas" valor={n(a.actual.preguntas)} ahora={a.actual.preguntas} antes={a.anterior.preguntas}
              detalle={a.actual.preguntas ? `${Math.round(a.actual.respondidas / a.actual.preguntas * 100)}% respondidas` : undefined} />
            <Tarjeta titulo="Tiempo de respuesta (mitad)" valor={textoMinutos(a.actual.mediana)} ahora={a.actual.mediana} antes={a.anterior.mediana} menosEsMejor
              detalle={`${n(a.actual.rapidas)} en menos de 1 hora`} />
            <Tarjeta titulo="Respondió sola la IA" valor={n(a.actual.porIA)} ahora={a.actual.porIA} antes={a.anterior.porIA} />
            <Tarjeta titulo="Ventas por pregunta" valor={a.actual.preguntas ? (a.actual.ventas / a.actual.preguntas).toLocaleString('es-VE', { maximumFractionDigits: 2 }) : '—'}
              detalle={`${n(a.actual.ventas)} ventas de ML`} />
          </div>
        </Seccion>
      )}

      {c && (
        <Seccion titulo="Calificaciones recibidas" ayuda={`En MercadoLibre, ${contra}.`} link={{ href: '/reputacion', t: 'Reputación' }}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tarjeta titulo="Positivas" valor={n(c.positivas)} />
            <Tarjeta titulo="Neutrales" valor={n(c.neutrales)} />
            <Tarjeta titulo="Negativas" valor={n(c.negativas)} ahora={c.negativas} antes={c.antes_negativas} menosEsMejor />
            <Tarjeta titulo="Contradictorias" valor={n(c.contradictorias)} detalle="Dijo una cosa y tú otra: se corrigen en Reputación" />
          </div>
        </Seccion>
      )}
    </div>
  )
}
