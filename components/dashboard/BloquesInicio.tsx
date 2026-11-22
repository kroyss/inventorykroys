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
  cuentas: { cuenta: string; moneda: string | null; ventas: number; monto: number; monto_usd?: number | null; antes_ventas: number }[] | null
  calificaciones: { positivas: number; neutrales: number; negativas: number; antes_negativas: number; contradictorias: number } | null
  historialML: boolean
  atencion: { actual: CifrasAtencion; anterior: CifrasAtencion } | null
}
const n = (x: number) => x.toLocaleString('es-VE')
/** 20-11: el monto de cada cuenta en $ (como todo el Inicio); en VE, los Bs al lado, chicos. */
function montoCuenta(k: { moneda: string | null; monto: number; monto_usd?: number | null }) {
  const f0 = (x: number) => x.toLocaleString('de-DE', { maximumFractionDigits: 0 })
  if (k.moneda === 'VES') return k.monto_usd != null ? `$${f0(k.monto_usd)} · Bs ${f0(k.monto)}` : `Bs ${f0(k.monto)}`
  return `$${f0(k.monto)}`
}

function Cambio({ ahora, antes, menosEsMejor = false }: { ahora: number | null; antes: number | null; menosEsMejor?: boolean }) {
  if (ahora == null || antes == null) return null
  if (!antes) return ahora ? <span className="text-neutral-400">antes 0</span> : null
  const c = cambio(ahora, antes)!
  if (c === 0) return <span className="text-neutral-500">igual</span>
  const bueno = menosEsMejor ? c < 0 : c > 0
  return <span className={bueno ? 'text-emerald-600' : 'text-red-600'}>{c > 0 ? '▲' : '▼'} {Math.abs(c)}%</span>
}

function Tarjeta({ titulo, valor, ahora, antes, menosEsMejor, detalle, detalleTitulo, conNumero = false }: {
  titulo: string; valor: string; ahora?: number | null; antes?: number | null; menosEsMejor?: boolean; detalle?: string; detalleTitulo?: string
  /** 19-11: «antes N» en vez de % (con bases chicas el % engaña: de 8 a 62 es «▲675 %»). */
  conNumero?: boolean
}) {
  return (
    <div className="min-w-0 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 shadow-sm">
      <div className="truncate text-xs font-medium text-neutral-500">{titulo}</div>
      <div className="num mt-0.5 truncate text-lg font-semibold tracking-tight text-neutral-900">{valor}</div>
      {(ahora !== undefined || detalle) && (
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs">
          {ahora !== undefined && (conNumero && ahora != null && antes != null
            ? <span className={ahora === antes ? 'text-neutral-500' : ahora > antes ? 'text-emerald-700' : 'text-red-600'}>
                {ahora === antes ? '' : ahora > antes ? '▲ ' : '▼ '}antes {n(antes)}</span>
            : <Cambio ahora={ahora ?? null} antes={antes ?? null} menosEsMejor={menosEsMejor} />)}
          {detalle && <span className="num text-neutral-500" title={detalleTitulo}>{detalle}</span>}
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
    <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
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
  // 20-11: si todos vendieron lo mismo, las barras salen todas llenas y no dicen nada: entonces no se dibujan.
  const conBarras = (d.top ?? []).some(p => p.unidades !== max)
  const verTodos = `/reportes?tab=ventas&vista=producto&desde=${r.desde}&hasta=${r.hasta}`
  const a = d.atencion, c = d.calificaciones
  // 19-11 (el dueño): con cuentas impares (1, 3…) las calificaciones van como tarjeta en el hueco al lado de la
  // última cuenta; con pares, en su línea de abajo como antes.
  const califEnGrilla = !!c && !!d.cuentas && d.cuentas.length % 2 === 1
  const tituloCalif = `Calificaciones recibidas en MercadoLibre, ${contra}. Toca cada número para verlas en Calificaciones. Contradictorias: el comprador dijo que la venta SÍ se concretó y tú que NO (se corrigen ahí).`

  return (
    <div className="space-y-6">
      {(d.top || (d.cuentas && d.cuentas.length > 0) || caen != null || a || c) && (
        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
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
                          {conBarras && <div className="mt-1.5 h-1 rounded-full bg-neutral-100">
                            <div className="h-1 rounded-full bg-sky-500" style={{ width: `${Math.max(4, p.unidades / max * 100)}%` }} />
                          </div>}
                        </div>
                        <div className="w-16 shrink-0 text-right">
                          <span className="num text-sm font-semibold text-neutral-900">{n(p.unidades)}</span>
                          <span className="block text-[11px] num">
                            {p.antes === 0 ? <span className="text-neutral-400" title="En el período anterior no vendió">antes 0</span>
                              : p.antes < 5 ? <span className={p.unidades === p.antes ? 'text-neutral-500' : p.unidades > p.antes ? 'text-emerald-600' : 'text-red-600'}>
                                  {p.unidades === p.antes ? '' : p.unidades > p.antes ? '▲ ' : '▼ '}antes {p.antes}</span>
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
                    <Tarjeta key={k.cuenta} titulo={k.cuenta} valor={`${n(k.ventas)} ventas`} ahora={k.ventas} antes={k.antes_ventas} conNumero
                      detalle={montoCuenta(k)} detalleTitulo={k.moneda === 'VES' && k.monto_usd != null
                        ? `Bs ${k.monto.toLocaleString('de-DE', { maximumFractionDigits: 0 })} pasados a $ con la tasa oficial de cada día` : undefined} />
                  ))}
                  {califEnGrilla && c && (
                    <div title={tituloCalif} className="min-w-0 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 shadow-sm">
                      <Ir a="" className="block truncate text-xs font-medium text-neutral-500">Calificaciones</Ir>
                      <div className="num mt-0.5 truncate text-lg font-semibold tracking-tight text-neutral-900"><Ir a="">{n(c.positivas)} positivas</Ir></div>
                      <div className="num mt-0.5 flex flex-wrap gap-x-2 text-xs text-neutral-500">
                        <Ir a="neutrales">{n(c.neutrales)} neutrales</Ir>
                        <Ir a="negativas" className={c.negativas ? 'font-medium text-red-700' : ''}>
                          {c.negativas > 0 && <span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" />}
                          {n(c.negativas)} negativas{c.negativas > 0 && c.antes_negativas != null && ` (antes ${n(c.antes_negativas)})`}</Ir>
                        {c.contradictorias > 0 && <Ir a="contradictorias" className="font-medium text-amber-800">
                          <span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />{n(c.contradictorias)} contradictorias</Ir>}
                      </div>
                    </div>
                  )}
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
            {a && (
              <Seccion titulo="Atención en MercadoLibre" ayuda={`Preguntas que te hicieron, cuántas respondiste y qué tan rápido (la mitad se respondió en menos de ese tiempo), ${contra}.`}>
                <div className="grid grid-cols-2 gap-2.5">
                  <Tarjeta titulo="Preguntas" valor={n(a.actual.preguntas)} ahora={a.actual.preguntas} antes={a.anterior.preguntas}
                    detalle={a.actual.preguntas ? `${Math.round(a.actual.respondidas / a.actual.preguntas * 100)}% respondidas` : undefined} />
                  <Tarjeta titulo="Tiempo de respuesta" valor={textoMinutos(a.actual.mediana)} ahora={a.actual.mediana} antes={a.anterior.mediana} menosEsMejor
                    detalle={`${n(a.actual.rapidas)} en menos de 1 hora`} />
                  <Tarjeta titulo="Respondió la IA" valor={n(a.actual.porIA)} ahora={a.actual.porIA} antes={a.anterior.porIA} />
                  <Tarjeta titulo="Ventas por pregunta" valor={a.actual.preguntas ? (a.actual.ventas / a.actual.preguntas).toLocaleString('es-VE', { maximumFractionDigits: 2 }) : '—'}
                    detalle={`${n(a.actual.ventas)} ventas de ML`} />
                </div>
              </Seccion>
            )}

            {/* 19-11: las calificaciones en una sola línea (casi siempre «8 · 0 · 0 · 0»); lo malo se pinta solo si hay. */}
            {c && !califEnGrilla && (
              <div title={tituloCalif}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm shadow-sm">
                <Ir a="" className="font-semibold text-neutral-700">Calificaciones</Ir>
                <Ir a="" className="num text-neutral-700"><b className="font-semibold text-neutral-900">{n(c.positivas)}</b> positivas</Ir>
                <Ir a="neutrales" className="num text-neutral-500"><b className="font-semibold text-neutral-700">{n(c.neutrales)}</b> neutrales</Ir>
                <Ir a="negativas" className={`num ${c.negativas ? 'font-medium text-red-700' : 'text-neutral-500'}`}>
                  {c.negativas > 0 && <span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" />}
                  <b className={`font-semibold ${c.negativas ? '' : 'text-neutral-700'}`}>{n(c.negativas)}</b> negativas
                  {c.negativas > 0 && c.antes_negativas != null && <span className="ml-1 text-xs font-normal text-neutral-500">(antes {n(c.antes_negativas)})</span>}</Ir>
                {c.contradictorias > 0 && <Ir a="contradictorias" className="num font-medium text-amber-800">
                  <span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" /><b>{n(c.contradictorias)}</b> contradictorias</Ir>}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

/** 21-11 (el dueño): cada número de Calificaciones lleva a su lista, de forma discreta (sin color de enlace: solo un
 *  subrayado suave al pasar). `a` = el filtro de Calificaciones → Me calificaron ('' = la página completa, arriba). */
function Ir({ a, className = '', children }: { a: '' | 'neutrales' | 'negativas' | 'contradictorias'; className?: string; children: React.ReactNode }) {
  return <Link href={`/calificaciones?ver=recibidas${a ? `&tipo=${a}` : ''}`}
    className={`${className} rounded decoration-neutral-400/70 underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none`}>{children}</Link>
}
