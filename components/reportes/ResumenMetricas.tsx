'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js'
import type { ResumenMetricas as R } from '@/lib/metricas'
import { cambio, textoMinutos, type ResumenAtencion } from '@/lib/resumenAtencion'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

// Reportes → Resumen (08-11, módulo metricas): las cifras que estaban regadas (Inicio, Top productos, Atención ML,
// Reputación) en una sola pantalla, con período elegible y siempre contra el período anterior del mismo largo.
type Datos = R & { atencion: ResumenAtencion | null; verCostos: boolean; moneda: string }
const PERIODOS = [[7, '7 días'], [30, '30 días'], [90, '90 días'], [365, '1 año']] as const
const n = (x: number) => x.toLocaleString('es-VE')

function Cambio({ ahora, antes, menosEsMejor = false }: { ahora: number | null; antes: number | null; menosEsMejor?: boolean }) {
  if (ahora == null || antes == null) return <span className="text-neutral-400">sin dato anterior</span>
  const c = cambio(ahora, antes)
  if (c == null) return null
  if (c === 0) return <span className="text-neutral-500">igual que antes</span>
  const bueno = menosEsMejor ? c < 0 : c > 0
  return <span className={bueno ? 'text-emerald-600' : 'text-red-600'}>{c > 0 ? '▲' : '▼'} {Math.abs(c)}%</span>
}

function Tarjeta({ titulo, valor, antes, ahora, antesN, menosEsMejor, detalle }: {
  titulo: string; valor: string; antes?: string; ahora?: number | null; antesN?: number | null; menosEsMejor?: boolean; detalle?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm px-4 py-3">
      <div className="text-xs font-medium text-neutral-500">{titulo}</div>
      <div className="text-xl font-semibold tracking-tight num mt-0.5 text-neutral-900">{valor}</div>
      <div className="text-xs mt-0.5 flex flex-wrap gap-x-2">
        {ahora !== undefined && <Cambio ahora={ahora ?? null} antes={antesN ?? null} menosEsMejor={menosEsMejor} />}
        {antes && <span className="text-neutral-400">antes {antes}</span>}
      </div>
      {detalle && <div className="text-[11px] text-neutral-500 mt-0.5">{detalle}</div>}
    </div>
  )
}

function Bloque({ titulo, ayuda, children, link }: { titulo: string; ayuda?: string; children: React.ReactNode; link?: { href: string; t: string } }) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div><h2 className="text-sm font-semibold text-neutral-700">{titulo}</h2>{ayuda && <p className="text-xs text-neutral-500">{ayuda}</p>}</div>
        {link && <Link href={link.href} className="text-xs text-sky-700 hover:underline">{link.t} →</Link>}
      </div>
      {children}
    </section>
  )
}

export default function ResumenMetricas() {
  const [dias, setDias] = useState(30)
  const [d, setD] = useState<Datos | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let vivo = true
    fetch(`/api/reports/resumen?dias=${dias}`).then(x => x.ok ? x.json() : Promise.reject())
      .then(j => { if (vivo) { setD(j); setError(false) } }).catch(() => { if (vivo) setError(true) })
    return () => { vivo = false }
  }, [dias])

  const m = d?.moneda ?? 'USD'
  const dinero = (x: number) => (m === 'COP' ? '$ ' : '$ ') + x.toLocaleString('de-DE', { maximumFractionDigits: m === 'COP' ? 0 : 0 })
  const v = d?.ventas, a = d?.atencion
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-500">Últimos {dias === 365 ? '12 meses' : `${dias} días`} comparados con {dias === 365 ? 'los 12 meses' : `los ${dias} días`} anteriores.</p>
        <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-0.5 text-xs">
          {PERIODOS.map(([p, t]) => (
            <button key={p} type="button" onClick={() => setDias(p)}
              className={`px-2.5 py-1 rounded-md ${dias === p ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:text-neutral-900'}`}>{t}</button>
          ))}
        </div>
      </div>
      {error ? <p className="text-sm text-neutral-500">No se pudo cargar el resumen. Prueba de nuevo.</p> : !d ? (
        <div className="grid gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl border border-neutral-200 bg-neutral-50 animate-pulse" />)}</div>
      ) : <>
        {v && (
          <Bloque titulo="Ventas" ayuda="Las ventas procesadas del sistema (las mismas del Inicio)." link={{ href: '/reportes?tab=ventas', t: 'Detalle de ventas' }}>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Tarjeta titulo="Vendido" valor={dinero(v.actual.monto)} ahora={v.actual.monto} antesN={v.anterior.monto} antes={dinero(v.anterior.monto)} />
              <Tarjeta titulo="Ventas" valor={n(v.actual.ventas)} ahora={v.actual.ventas} antesN={v.anterior.ventas} antes={n(v.anterior.ventas)} detalle={`${n(v.actual.unidades)} unidades`} />
              <Tarjeta titulo="Ticket promedio" valor={dinero(v.actual.ticket)} ahora={v.actual.ticket} antesN={v.anterior.ticket} antes={dinero(v.anterior.ticket)} />
              {d.verCostos
                ? <Tarjeta titulo="Ganancia" valor={dinero(v.actual.ganancia)} ahora={v.actual.ganancia} antesN={v.anterior.ganancia} antes={dinero(v.anterior.ganancia)}
                    detalle={v.actual.monto ? `${Math.round(v.actual.ganancia / v.actual.monto * 100)}% de lo vendido (después de costo y comisión ML)` : undefined} />
                : <Tarjeta titulo="Unidades" valor={n(v.actual.unidades)} ahora={v.actual.unidades} antesN={v.anterior.unidades} antes={n(v.anterior.unidades)} />}
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-3 h-56">
              <Line data={{
                labels: v.serie.map(x => String(x.dia + 1)),
                datasets: [
                  { label: 'Este período', data: v.serie.map(x => x.actual), borderColor: '#16a34a', backgroundColor: '#16a34a', pointRadius: 0, borderWidth: 2, tension: 0.25 },
                  { label: 'Período anterior', data: v.serie.map(x => x.anterior), borderColor: 'rgba(99,102,241,0.5)', backgroundColor: 'rgba(99,102,241,0.5)', pointRadius: 0, borderWidth: 1.5, tension: 0.25, borderDash: [4, 3] },
                ],
              }} options={{
                responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
                scales: { x: { ticks: { maxTicksLimit: 10, font: { size: 10 } }, grid: { display: false }, title: { display: true, text: 'Día del período', font: { size: 10 } } },
                  y: { ticks: { font: { size: 10 } }, beginAtZero: true } },
              }} />
            </div>
          </Bloque>
        )}

        {d.cuentas && d.cuentas.length > 0 && (
          <Bloque titulo="Por cuenta de MercadoLibre" ayuda={`Ventas de ML no canceladas.${!d.historialML ? ' Las ventas de ML guardadas no llegan tan atrás: la comparación queda incompleta.' : ''}`}>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              {d.cuentas.map(c => (
                <Tarjeta key={c.cuenta} titulo={c.cuenta} valor={`${n(c.ventas)} ventas`} ahora={c.ventas} antesN={c.antes_ventas} antes={n(c.antes_ventas)}
                  detalle={`${c.moneda === 'COP' ? '$' : c.moneda === 'VES' ? 'Bs' : '$'} ${c.monto.toLocaleString('de-DE', { maximumFractionDigits: 0 })} en ${c.moneda ?? ''}`} />
              ))}
            </div>
          </Bloque>
        )}

        {a && (
          <Bloque titulo="Atención" ayuda="Preguntas de ML y cómo se respondieron." link={{ href: '/reportes?tab=atencion', t: 'Atención ML' }}>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Tarjeta titulo="Preguntas recibidas" valor={n(a.actual.preguntas)} ahora={a.actual.preguntas} antesN={a.anterior.preguntas} antes={n(a.anterior.preguntas)}
                detalle={a.actual.preguntas ? `${Math.round(a.actual.respondidas / a.actual.preguntas * 100)}% respondidas` : undefined} />
              <Tarjeta titulo="Tiempo de respuesta (mitad)" valor={textoMinutos(a.actual.mediana)} ahora={a.actual.mediana} antesN={a.anterior.mediana} menosEsMejor antes={textoMinutos(a.anterior.mediana)}
                detalle={`${n(a.actual.rapidas)} en menos de 1 hora`} />
              <Tarjeta titulo="Respondió sola la IA" valor={n(a.actual.porIA)} ahora={a.actual.porIA} antesN={a.anterior.porIA} antes={n(a.anterior.porIA)} />
              <Tarjeta titulo="Ventas por pregunta" valor={a.actual.preguntas ? (a.actual.ventas / a.actual.preguntas).toLocaleString('es-VE', { maximumFractionDigits: 2 }) : '—'}
                detalle={`${n(a.actual.ventas)} ventas de ML / ${n(a.actual.preguntas)} preguntas`} />
            </div>
          </Bloque>
        )}

        {d.calificaciones && (
          <Bloque titulo="Calificaciones recibidas" link={{ href: '/reputacion', t: 'Reputación' }}>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Tarjeta titulo="Positivas" valor={n(d.calificaciones.positivas)} />
              <Tarjeta titulo="Neutrales" valor={n(d.calificaciones.neutrales)} />
              <Tarjeta titulo="Negativas" valor={n(d.calificaciones.negativas)} ahora={d.calificaciones.negativas} antesN={d.calificaciones.antes_negativas} menosEsMejor antes={n(d.calificaciones.antes_negativas)} />
              <Tarjeta titulo="Contradictorias" valor={n(d.calificaciones.contradictorias)} detalle="El comprador dijo una cosa y tú otra: se corrigen en Reputación" />
            </div>
          </Bloque>
        )}

        {d.top && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Bloque titulo="Más vendidos" ayuda="Unidades en el período (y en el anterior)." link={{ href: '/reportes?tab=top', t: 'Top productos' }}>
              {!d.top.length ? <p className="text-sm text-neutral-500">Sin ventas en el período.</p> : (
                <ol className="bg-white rounded-xl border border-neutral-200 shadow-sm divide-y divide-neutral-100 text-sm">
                  {d.top.map((p, i) => (
                    <li key={p.id} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="w-5 text-xs text-neutral-400 num">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                      <span className="num font-medium">{n(p.unidades)}</span>
                      <span className="w-20 text-right text-xs"><Cambio ahora={p.unidades} antes={p.antes} /></span>
                    </li>
                  ))}
                </ol>
              )}
            </Bloque>
            <Bloque titulo="Los que cayeron" ayuda="Vendían y ahora venden mucho menos (40% menos o más). Revisa precio, stock o la publicación.">
              {!d.caidas?.length ? <p className="text-sm text-neutral-500 bg-white rounded-xl border border-neutral-200 px-3 py-4">Ninguno cayó fuerte. 👍</p> : (
                <ul className="bg-white rounded-xl border border-neutral-200 shadow-sm divide-y divide-neutral-100 text-sm">
                  {d.caidas.map(p => (
                    <li key={p.id} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                      <span className="text-xs text-neutral-500 num">{n(p.antes)} → <b className="text-neutral-800">{n(p.unidades)}</b></span>
                    </li>
                  ))}
                </ul>
              )}
            </Bloque>
          </div>
        )}
      </>}
    </div>
  )
}
