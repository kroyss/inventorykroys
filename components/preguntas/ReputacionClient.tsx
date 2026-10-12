'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Cargando, EmptyState, PageHeader } from '@/components/ui'
import type { Reputacion } from '@/lib/reputacionML'

// Automatizaciones → Reputación (lib/reputacionML.ts): el termómetro de cada cuenta, como en
// MercadoLibre, y las neutrales/negativas de los últimos 30 días (el plazo para pedir el cambio).

interface Cuenta { id: number; nickname: string; reputacion: Reputacion | null; reputacion_at: string | null }
interface Calificacion {
  id: string; pack: string; cuenta: string; nombre: string | null; nick: string | null; productos: string | null
  fecha: string; rating: string; antes: string | null; calificada_at: string; mensaje: string | null
  vista_at: string | null; dias_restantes: number; con_mensajes: boolean
  contradictoria: boolean; concretada: boolean | null
  cambio_estado: string | null; cambio_at: string | null
}
interface Datos { cuentas: Cuenta[]; calificaciones: Calificacion[]; dias: number; pais: 'VE' | 'CO'; por_revisar: number }

const NIVELES = [
  { id: '1_red', color: 'bg-red-500', nombre: 'Roja' },
  { id: '2_orange', color: 'bg-orange-500', nombre: 'Naranja' },
  { id: '3_yellow', color: 'bg-yellow-400', nombre: 'Amarilla' },
  { id: '4_light_green', color: 'bg-lime-400', nombre: 'Verde claro' },
  { id: '5_green', color: 'bg-emerald-500', nombre: 'Verde' },
]
const LIDER: Record<string, string> = { platinum: 'MercadoLíder Platinum', gold: 'MercadoLíder Gold', silver: 'MercadoLíder' }
const pct = (n: number | undefined) => n == null ? '—' : `${(n * 100).toLocaleString('es-VE', { maximumFractionDigits: n * 100 < 10 ? 1 : 0 })}%`
const miles = (n: number | undefined) => n == null ? '—' : n.toLocaleString('de-DE')
function hace(fecha: string | null) {
  if (!fecha) return ''
  const min = Math.round((Date.now() - new Date(fecha).getTime()) / 60000)
  if (min < 60) return min < 1 ? 'recién' : `hace ${min} min`
  const h = Math.round(min / 60)
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`
}

function Termometro({ nivel }: { nivel: string | null }) {
  const i = NIVELES.findIndex(n => n.id === nivel)
  return (
    <div className="flex items-end gap-1" aria-label={i >= 0 ? `Reputación ${NIVELES[i].nombre}` : 'Sin reputación todavía'}>
      {NIVELES.map((n, k) => (
        <span key={n.id} className={`w-7 rounded-sm transition-all ${n.color} ${k === i ? 'h-4 ring-2 ring-offset-1 ring-neutral-900/15' : 'h-2.5 opacity-25'}`} />
      ))}
    </div>
  )
}

function Metrica({ titulo, valor, ayuda, alerta }: { titulo: string; valor: string; ayuda?: string; alerta?: boolean }) {
  return (
    <div className="rounded-lg bg-neutral-50 px-3 py-2" title={ayuda}>
      <p className="text-[11px] text-neutral-500">{titulo}</p>
      <p className={`text-sm font-semibold num ${alerta ? 'text-red-600' : 'text-neutral-900'}`}>{valor}</p>
    </div>
  )
}

function TarjetaCuenta({ c }: { c: Cuenta }) {
  const r = c.reputacion
  const i = NIVELES.findIndex(n => n.id === r?.level_id)
  const ratings = r?.transactions?.ratings
  const m = r?.metrics ?? {}
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-900">{c.nickname}</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {i >= 0 ? `Reputación ${NIVELES[i].nombre.toLowerCase()}` : r ? 'Sin reputación todavía' : 'Todavía no se trajo'}
            {r?.power_seller_status && LIDER[r.power_seller_status] && <> · <b className="font-semibold text-amber-700">{LIDER[r.power_seller_status]}</b></>}
          </p>
        </div>
        <Termometro nivel={r?.level_id ?? null} />
      </div>
      {r && (
        <>
          {ratings && (
            <div className="mt-3">
              <div className="flex h-1.5 overflow-hidden rounded-full bg-neutral-100">
                <span className="bg-emerald-500" style={{ width: `${(ratings.positive ?? 0) * 100}%` }} />
                <span className="bg-orange-400" style={{ width: `${(ratings.neutral ?? 0) * 100}%` }} />
                <span className="bg-red-500" style={{ width: `${(ratings.negative ?? 0) * 100}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-neutral-500">
                <span className="text-emerald-700">{pct(ratings.positive)} positivas</span> ·{' '}
                <span className="text-orange-700">{pct(ratings.neutral)} neutrales</span> ·{' '}
                <span className="text-red-700">{pct(ratings.negative)} negativas</span>
                {r.transactions?.completed != null && <> · {miles(r.transactions.completed)} ventas concretadas</>}
              </p>
            </div>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Metrica titulo="Reclamos" valor={pct(m.claims?.rate)} alerta={(m.claims?.rate ?? 0) > 0.02}
              ayuda={`${miles(m.claims?.value)} en ${m.claims?.period ?? 'el período'}`} />
            <Metrica titulo="Despachos con demora" valor={pct(m.delayed_handling_time?.rate)} alerta={(m.delayed_handling_time?.rate ?? 0) > 0.15}
              ayuda={`${miles(m.delayed_handling_time?.value)} en ${m.delayed_handling_time?.period ?? 'el período'}`} />
            <Metrica titulo="Cancelaciones" valor={pct(m.cancellations?.rate)} alerta={(m.cancellations?.rate ?? 0) > 0.02}
              ayuda={`${miles(m.cancellations?.value)} en ${m.cancellations?.period ?? 'el período'}`} />
          </div>
        </>
      )}
      <p className="mt-2 text-[10px] text-neutral-400">Actualizado {hace(c.reputacion_at)} · se trae cada 6 horas</p>
    </div>
  )
}

// Estado del pedido de cambio, como lo informa ML (purchase.change_request.status).
const CAMBIO: Record<string, string> = { pending: 'esperando respuesta del comprador', rejected: 'el comprador no la cambió',
  accepted: 'el comprador aceptó', expired: 'el comprador no respondió' }

function FilaCalificacion({ c, pais, onVista, onPedido, ocupado }: {
  c: Calificacion; pais: 'VE' | 'CO'; onVista: (c: Calificacion, v: boolean) => void; onPedido: (c: Calificacion) => void; ocupado: boolean
}) {
  const cambio = !!c.antes && c.rating !== c.antes
  // Neutral o negativa sin cambiar: se puede pedir el cambio (una positiva solo aparece si es contradictoria).
  const pedido = !!c.cambio_estado
  const pedible = !cambio && !pedido && (c.rating === 'neutral' || c.rating === 'negative')
  const negativa = c.rating === 'negative'
  const urgente = c.dias_restantes <= 5
  const etiqueta = cambio
    ? { txt: `La cambió: era ${c.antes === 'negative' ? 'negativa' : 'neutral'}${c.rating === 'positive' ? ', ahora positiva' : ''}`, cls: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' }
    : negativa ? { txt: 'Negativa', cls: 'bg-red-50 text-red-700', dot: 'bg-red-500' }
    : c.rating === 'positive' ? { txt: 'Positiva', cls: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' }
    : { txt: 'Neutral', cls: 'bg-orange-50 text-orange-700', dot: 'bg-orange-500' }
  const urlML = `https://www.mercadolibre.com.${pais === 'CO' ? 'co' : 've'}/ventas/${c.id}/detalle`
  // "Solicitar cambio de calificación" de ML: no está en su API, es su propia página (la misma del menú ⋮ de la
  // venta). Se pide UNA sola vez: si el comprador no responde, ML la borra a los pocos días; si responde y no
  // la cambia, queda. Por eso se confirma antes de abrirla.
  const urlCambio = `https://feedback.mercadolibre.com.${pais === 'CO' ? 'co' : 've'}/changeRequest?orderId=${c.id}`
  const confirmarCambio = (e: React.MouseEvent) => {
    if (!window.confirm(`Pedir el cambio de calificación a ${c.nombre ?? c.nick ?? 'este comprador'}.\n\n`
      + `MercadoLibre deja pedirlo UNA sola vez por venta. Se abre en MercadoLibre: tienes que estar dentro con la cuenta ${c.cuenta}.\n\n¿Abrir?`)) e.preventDefault()
    else onPedido(c)
  }
  return (
    <li className={`px-4 py-3 ${c.vista_at || cambio ? 'bg-neutral-50/60' : ''}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${etiqueta.cls}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${etiqueta.dot}`} />{etiqueta.txt}
            </span>
            {c.contradictoria && (
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700"
                title={`Contradictoria: el comprador dijo que la venta ${c.concretada ? 'SÍ' : 'NO'} se concretó y tú dijiste lo contrario`}>
                Contradictoria
              </span>
            )}
            <span className="truncate text-sm font-medium text-neutral-900">{c.nombre ?? c.nick ?? 'Comprador'}</span>
            {c.nombre && c.nick && <span className="text-xs text-neutral-400">@{c.nick}</span>}
          </div>
          {c.productos && <p className="mt-1 truncate text-xs text-neutral-600" title={c.productos}>{c.productos}</p>}
          {c.mensaje && <p className="mt-1.5 border-l-2 border-neutral-200 pl-2 text-xs italic text-neutral-600">“{c.mensaje}”</p>}
          <p className="mt-1 text-[11px] text-neutral-400">Calificó {hace(c.calificada_at)} · {c.cuenta} · venta {c.pack}</p>
          {pedido && !cambio && (
            <p className="mt-1 text-[11px] text-sky-700">
              Cambio pedido {hace(c.cambio_at ?? c.calificada_at)}: {CAMBIO[c.cambio_estado!] ?? c.cambio_estado}.
              {c.cambio_estado === 'pending' && ' Si no responde en 5 días, ML quita la calificación.'}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          {pedido && !cambio && (
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">Cambio pedido</span>
          )}
          {pedible && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${urgente ? 'bg-red-50 text-red-700' : 'bg-neutral-100 text-neutral-600'}`}
              title="ML deja pedir el cambio hasta 30 días después de recibirla">
              {c.dias_restantes > 0 ? `Quedan ${c.dias_restantes} ${c.dias_restantes === 1 ? 'día' : 'días'} para pedir el cambio` : 'Vence hoy'}
            </span>
          )}
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            {pedible && c.dias_restantes > 0 && (
              <a href={urlCambio} target="_blank" rel="noreferrer" onClick={confirmarCambio} className="btn-primary text-xs"
                title="Abre en MercadoLibre la solicitud de cambio de calificación (se pide una sola vez)">Pedir cambio</a>
            )}
            {c.con_mensajes
              ? <Link href={`/mensajes?pack=${c.pack}`} className="btn-secondary text-xs">Escribirle</Link>
              : <a href={urlML} target="_blank" rel="noreferrer" className="btn-secondary text-xs" title="Abre la venta en MercadoLibre para escribirle">Escribirle en ML</a>}
            {!cambio && !pedido && (
              <button type="button" onClick={() => onVista(c, !c.vista_at)} disabled={ocupado} className="btn-secondary text-xs">
                {c.vista_at ? 'Volver a avisar' : 'Ya la vi'}
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

export default function ReputacionClient() {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/reputacion', { cache: 'no-store' })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'No se pudo cargar'); return }
    setDatos(d)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const marcar = async (c: Calificacion, vista: boolean) => {
    setOcupado(c.id)
    const r = await fetch('/api/reputacion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, vista }) })
    setOcupado(null)
    if (!r.ok) { setError('No se pudo guardar'); return }
    setDatos(d => d && { ...d, calificaciones: d.calificaciones.map(x => x.id === c.id ? { ...x, vista_at: vista ? new Date().toISOString() : null } : x) })
  }
  // Abrió "Pedir cambio": queda como pedido (el cron lo confirma con ML en la próxima pasada).
  const pedir = (c: Calificacion) => {
    fetch('/api/reputacion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, pedido: true }) }).catch(() => {})
    setDatos(d => d && { ...d, calificaciones: d.calificaciones.map(x => x.id === c.id
      ? { ...x, cambio_estado: x.cambio_estado ?? 'pending', cambio_at: x.cambio_at ?? new Date().toISOString() } : x) })
  }

  const lista = datos?.calificaciones ?? []
  const cambiadas = lista.filter(c => c.antes && c.rating !== c.antes)
  // Atendidas: cambiadas, con el cambio pedido o marcadas "Ya la vi".
  const pedidas = lista.filter(c => !cambiadas.includes(c) && c.cambio_estado)
  const pendientes = lista.filter(c => !cambiadas.includes(c) && !pedidas.includes(c) && !c.vista_at)
  const vistas = lista.filter(c => !cambiadas.includes(c) && !pedidas.includes(c) && c.vista_at)
  const negativas = pendientes.filter(c => c.rating === 'negative').length
  const neutrales = pendientes.filter(c => c.rating === 'neutral').length
  const contradictorias = pendientes.filter(c => c.contradictoria).length

  return (
    <div className="space-y-4">
      <PageHeader title="Calificaciones"
        subtitle={`Las que te dieron los compradores: tu termómetro en MercadoLibre y las neutrales o negativas de los últimos ${datos?.dias ?? 30} días, para intentar que las cambien`} />
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {!datos ? <Cargando /> : (
        <>
          <div className={`grid gap-3 ${datos.cuentas.length > 1 ? 'md:grid-cols-2' : ''}`}>
            {datos.cuentas.map(c => <TarjetaCuenta key={c.id} c={c} />)}
          </div>

          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-baseline gap-2 border-b border-neutral-100 bg-neutral-50 px-4 py-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Para atender</h2>
              <span className="text-xs text-neutral-400">
                {negativas} {negativas === 1 ? 'negativa' : 'negativas'} · {neutrales} {neutrales === 1 ? 'neutral' : 'neutrales'}
                {contradictorias > 0 && ` · ${contradictorias} ${contradictorias === 1 ? 'contradictoria' : 'contradictorias'}`}
              </span>
              {datos.por_revisar > 0 && (
                <span className="ml-auto text-[11px] text-neutral-400">Revisando {datos.por_revisar} calificaciones recientes en MercadoLibre…</span>
              )}
            </div>
            {pendientes.length ? (
              <ul className="divide-y divide-neutral-100">
                {pendientes.map(c => <FilaCalificacion key={c.id} c={c} pais={datos.pais} onVista={marcar} onPedido={pedir} ocupado={ocupado === c.id} />)}
              </ul>
            ) : (
              <EmptyState message={`Ninguna neutral ni negativa por atender en los últimos ${datos.dias} días.`} />
            )}
          </div>

          {(cambiadas.length > 0 || pedidas.length > 0 || vistas.length > 0) && (
            <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
              <div className="border-b border-neutral-100 bg-neutral-50 px-4 py-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Atendidas: cambio pedido, cambiadas o vistas</h2>
              </div>
              <ul className="divide-y divide-neutral-100">
                {[...pedidas, ...cambiadas, ...vistas].map(c => <FilaCalificacion key={c.id} c={c} pais={datos.pais} onVista={marcar} onPedido={pedir} ocupado={ocupado === c.id} />)}
              </ul>
            </div>
          )}
          <p className="text-[11px] text-neutral-400">
            Cada calificación avisa {datos.dias} días desde que la dieron (lo que da ML para pedir el cambio) y después sale sola.
            Si el comprador la cambia, aparece como cambiada.
          </p>
        </>
      )}
    </div>
  )
}
