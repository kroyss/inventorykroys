'use client'
import { useCallback, useEffect, useState } from 'react'

// Plataforma → Cobros (02-11-2026, migración 141): los pagos que los clientes reportan en Mi plan. Se confirma a mano
// en el banco o en Binance y se aprueba (activa/renueva el plan como Plan y pagos) o se rechaza con un motivo que el
// cliente ve. Abajo: quién vence en 7 días (y si ya reportó), lo último revisado y los datos de cobro.

interface Pendiente {
  id: number; organizacion_id: number; organizacion: string; persona: string | null; plan: string; escalon: number; ciclo: string
  radar_pro: boolean; cuentas_extra: number; ventas_30d: number | null; monto_usd: number; metodo: string; tasa_bcv: number | null
  monto_bs: number | null; referencia: string; fecha_pago: string; creado_at: string; tiene_comprobante: boolean
  org_estado: string; vence: string | null; repetida: number
  // 06-11 (mig. 143): qué se paga, su desglose, qué fechas cubre y lo que la cuenta tiene vigente hoy.
  tipo: 'plan' | 'radar_pro' | 'upgrade' | 'recarga' | 'radar_mes'; lineas: { texto: string; usd: number }[]; desde: string | null; hasta: string | null
  radar_pro_hasta: string | null; estado: string; motivo: string | null; revisado_at: string
}
interface Registro { whatsapp?: string; telegram?: string; correo?: string }
interface Vence { id: number; nombre: string; estado: string; plan: string | null; vence: string; ultimo_cobro: string | null
  ultima: string | null; registro: Registro | null; fundador: boolean; con_ml: boolean }
interface Pagando { id: number; nombre: string; plan: string | null; escalon: number | null; ciclo: string | null; fundador: boolean
  hasta: string | null; ultima: string | null; monto: number | null }
type Reciente = Pendiente
interface DatosCobro { pago_movil: { banco: string; cedula: string; telefono: string }; binance: { id: string; nombre: string; correo: string; moneda: string } }
interface Datos { pendientes: Pendiente[]; vencen: Vence[]; recientes: Reciente[]; datos: DatosCobro
  pagando?: Pagando[]; ingresos?: { mes: number; pagos_mes: number; anterior: number } }

const DIA = 864e5
const hoyVE = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })
const diasA = (f: string) => Math.round((Date.parse(`${f}T12:00:00Z`) - Date.parse(`${hoyVE()}T12:00:00Z`)) / DIA)
const entro = (f: string | null) => {
  if (!f) return { t: 'nunca entró', mal: true }
  const d = (Date.now() - new Date(f).getTime()) / DIA
  return { t: d < 1 ? 'entró hoy' : d < 2 ? 'entró ayer' : `entró hace ${Math.round(d)} días`, mal: d > 7 }
}
const wa = (n: string) => `https://wa.me/${n.replace(/\D/g, '').replace(/^0/, '58')}`
const cuando = (d: number) => (d < 0 ? 'venció' : d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`)

const PLAN: Record<string, string> = { esencial: 'Esencial', automatizaciones: 'Automatizaciones', completo: 'Completo' }
const METODO: Record<string, string> = { pago_movil: 'Pago Móvil', binance: 'Binance' }
const ESCALON = ['hasta 50', '51–300', '301–1.000', '+1.000']
const ddmm = (f: string | null) => f ? f.split('-').reverse().join('/') : '—'
const hora = (s: string) => new Date(s).toLocaleString('es-VE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Caracas' })
const usd = (n: number) => `$${n.toLocaleString('de-DE', { maximumFractionDigits: 2 })}`
const TIPO: Record<string, string> = { plan: 'Plan', radar_pro: 'Radar PRO aparte', upgrade: 'Mejora de plan', recarga: 'Recarga de créditos IA', radar_mes: 'Radar mensual' }

/** Qué contrató: cada línea con su monto, el total y las fechas que cubre; abajo lo que tiene vigente la cuenta. */
function Desglose({ k }: { k: Pendiente }) {
  return (
    <div className="rounded-lg bg-neutral-50 border border-neutral-100 px-2.5 py-1.5 text-xs space-y-0.5">
      <p className="font-semibold text-neutral-800">{TIPO[k.tipo] ?? k.tipo}{k.tipo !== 'radar_pro' && k.tipo !== 'recarga' ? ` · ${PLAN[k.plan] ?? k.plan} · ${k.ciclo}` : ''}
        {k.desde && k.hasta ? <span className="font-normal text-neutral-600"> · cubre del {ddmm(k.desde)} al {ddmm(k.hasta)}</span> : null}</p>
      {k.lineas.map((l, i) => (
        <p key={i} className="flex justify-between gap-3 text-neutral-700"><span>{l.texto}</span><span className="num whitespace-nowrap">{l.usd < 0 ? '−' : ''}{usd(Math.abs(l.usd))}</span></p>
      ))}
      <p className="flex justify-between gap-3 border-t border-neutral-200 pt-0.5 font-semibold"><span>Total</span><span className="num">{usd(k.monto_usd)}</span></p>
      <p className="text-neutral-500">Vigente hoy: {k.org_estado}{k.vence ? ` hasta ${ddmm(k.vence)}` : ''} · Radar PRO {k.radar_pro_hasta ? `hasta ${ddmm(k.radar_pro_hasta)}` : 'no'}</p>
    </div>
  )
}
const bs = (n: number) => `Bs ${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Plataforma → Cuentas y cobros (12-11, el dueño): cuánto entra, quién paga, quién vence (y si usa el sistema) y los pagos. */
export default function CobrosPanel({ inicial = null, onCambio }: { inicial?: unknown; onCambio?: () => void }) {
  const [d, setD] = useState<Datos | null>((inicial as Datos | null) ?? null)
  const [busy, setBusy] = useState<number | null>(null)
  const [rechazo, setRechazo] = useState<{ id: number; motivo: string } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editarDatos, setEditarDatos] = useState<DatosCobro | null>(null)

  const cargar = useCallback(() => {
    fetch('/api/plataforma/cobros', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(x => x && setD(x)).catch(() => {})
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function revisar(id: number, cuerpo: { accion: 'aprobar' } | { accion: 'rechazar'; motivo: string }) {
    setBusy(id); setError(null); setAviso(null)
    const r = await fetch(`/api/plataforma/cobros/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }).catch(() => null)
    const x = await r?.json().catch(() => null)
    setBusy(null)
    if (!r?.ok) { setError(x?.error ?? 'No se pudo guardar'); return }
    setAviso(x?.mensaje ?? 'Listo'); setRechazo(null); cargar(); onCambio?.()
  }

  async function guardarDatos() {
    if (!editarDatos) return
    setError(null)
    const r = await fetch('/api/plataforma/cobros', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editarDatos) }).catch(() => null)
    const x = await r?.json().catch(() => null)
    if (!r?.ok) { setError(x?.error ?? 'No se pudo guardar'); return }
    setEditarDatos(null); setAviso('Datos de cobro guardados: los clientes ya los ven así.'); cargar()
  }

  if (!d) return <p className="text-sm text-neutral-500">Cargando…</p>
  const campo = 'w-full border border-neutral-300 rounded px-2 py-1 text-sm'
  const pagando = d.pagando ?? []
  // Lo que entra por mes con lo que paga cada uno hoy (trimestral = su pago ÷ 3).
  const recurrente = pagando.reduce((a, p) => a + (p.monto ?? 0) / (p.ciclo === 'trimestral' ? 3 : 1), 0)
  const ing = d.ingresos

  return (
    <div className="space-y-6">
      {aviso && <p className="text-sm bg-lime-50 border border-lime-200 text-lime-900 rounded px-3 py-2">{aviso}</p>}
      {error && <p className="text-sm bg-red-50 border border-red-200 text-red-800 rounded px-3 py-2">{error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra titulo="Cobrado este mes" valor={ing ? usd(ing.mes) : '—'} detalle={ing ? `${ing.pagos_mes} pago${ing.pagos_mes === 1 ? '' : 's'} · mes anterior ${usd(ing.anterior)}` : ''} />
        <Cifra titulo="Pagando" valor={String(pagando.length)} detalle={`≈ ${usd(recurrente)} al mes con sus planes`} />
        <Cifra titulo="Vencen en 7 días" valor={String(d.vencen.length)} detalle={`${d.vencen.filter(v => v.estado === 'activo').length} planes · ${d.vencen.filter(v => v.estado !== 'activo').length} pruebas`} alerta={d.vencen.some(v => diasA(v.vence) <= 1)} />
        <Cifra titulo="Pagos por revisar" valor={String(d.pendientes.length)} detalle={d.pendientes.length ? 'revísalos abajo' : 'nada pendiente'} alerta={d.pendientes.length > 0} />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-neutral-800">Por revisar ({d.pendientes.length})</h2>
        {!d.pendientes.length && <p className="text-sm text-neutral-500">No hay pagos por revisar.</p>}
        {d.pendientes.map(k => (
          <div key={k.id} className="rounded-xl border border-amber-200 bg-white p-3 flex flex-col sm:flex-row gap-3">
            {k.tiene_comprobante && (
              <a href={`/api/mi-plan/comprobante/${k.id}`} target="_blank" rel="noopener noreferrer" className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/mi-plan/comprobante/${k.id}`} alt="Captura del pago" className="h-32 w-32 object-cover rounded border border-neutral-200 bg-neutral-50"
                  onError={e => { (e.currentTarget as HTMLImageElement).replaceWith(Object.assign(document.createElement('span'), { textContent: '📄 Ver PDF', className: 'text-sm text-sky-700' })) }} />
              </a>
            )}
            <div className="flex-1 min-w-0 text-sm space-y-1">
              <p><b>{k.organizacion}</b> <span className="text-neutral-500">· {k.persona ?? '—'} · {hora(k.creado_at)}</span></p>
              <p className="text-xs text-neutral-600">Escalón {ESCALON[k.escalon]}{k.ventas_30d != null ? ` (${k.ventas_30d} ventas el mes pasado)` : ''}</p>
              <Desglose k={k} />
              <p className="text-base font-semibold">{usd(k.monto_usd)}{k.monto_bs ? <span className="font-normal text-neutral-600"> = {bs(k.monto_bs)} (BCV {k.tasa_bcv?.toLocaleString('de-DE', { maximumFractionDigits: 2 })})</span> : null}</p>
              <p>{METODO[k.metodo]} · ref. <b>{k.referencia}</b> · pagado el {ddmm(k.fecha_pago)}</p>
              {k.repetida > 0 && <p className="text-red-700">⚠️ Esa referencia ya se reportó {k.repetida} vez/veces antes.</p>}
              {rechazo?.id === k.id ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  <input autoFocus value={rechazo.motivo} onChange={e => setRechazo({ id: k.id, motivo: e.target.value })} maxLength={300}
                    placeholder="Motivo (lo ve el cliente). Ej.: no aparece en el banco" className={`${campo} flex-1 min-w-[12rem]`} />
                  <button disabled={busy === k.id} onClick={() => revisar(k.id, { accion: 'rechazar', motivo: rechazo.motivo })}
                    className="rounded bg-red-600 px-3 py-1 text-sm text-white disabled:opacity-50">Rechazar</button>
                  <button onClick={() => setRechazo(null)} className="text-sm text-neutral-500">Cancelar</button>
                </div>
              ) : (
                <div className="flex gap-2 pt-1">
                  <button disabled={busy === k.id} onClick={() => revisar(k.id, { accion: 'aprobar' })}
                    className="rounded bg-lime-500 px-3 py-1 text-sm font-semibold text-neutral-950 hover:bg-lime-400 disabled:opacity-50">
                    {busy === k.id ? 'Aprobando…' : 'Aprobar'}
                  </button>
                  <button onClick={() => setRechazo({ id: k.id, motivo: '' })} className="rounded border border-neutral-300 px-3 py-1 text-sm">Rechazar</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-neutral-800">Vencen en los próximos 7 días ({d.vencen.length})</h2>
        <p className="text-xs text-neutral-500">Primero los que usan el sistema: a esos vale la pena escribirles.</p>
        {!d.vencen.length ? <p className="text-sm text-neutral-500">Ninguna.</p> : (
          <ul className="text-sm divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
            {[...d.vencen].sort((a, b) => Number(entro(a.ultima).mal) - Number(entro(b.ultima).mal) || a.vence.localeCompare(b.vence)).map(v => {
              const e = entro(v.ultima), dd = diasA(v.vence)
              return (
                <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <b>{v.nombre}</b>{v.fundador && <span className="ml-1 text-amber-700" title="Fundador">⭐</span>}
                    <span className="text-neutral-500"> · {v.estado === 'prueba' ? 'prueba' : PLAN[v.plan ?? ''] ?? v.plan}</span>
                    <span className="block text-[11px] text-neutral-500">
                      <span className={e.mal ? 'text-red-600' : 'text-emerald-700'}>{e.t}</span>{!v.con_ml && ' · sin ML'}
                    </span>
                  </span>
                  <span className={`text-xs ${dd <= 1 ? 'font-semibold text-red-700' : 'text-neutral-700'}`}>vence {cuando(dd)} ({ddmm(v.vence)})</span>
                  <span className="text-xs">{v.ultimo_cobro === 'revision' ? <span className="text-amber-700">reportó pago (por revisar)</span>
                    : v.ultimo_cobro === 'aprobado' && v.estado === 'activo' ? <span className="text-neutral-500">pagó antes</span>
                    : <span className="text-neutral-500">no ha reportado</span>}</span>
                  {v.registro?.whatsapp
                    ? <a href={wa(v.registro.whatsapp)} target="_blank" rel="noreferrer" className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100">WhatsApp</a>
                    : v.registro?.telegram ? <a href={`https://t.me/${v.registro.telegram}`} target="_blank" rel="noreferrer" className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-800 ring-1 ring-inset ring-sky-200">Telegram</a> : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-neutral-800">Pagando ({pagando.length})</h2>
        {!pagando.length ? <p className="text-sm text-neutral-500">Nadie todavía.</p> : (
          <ul className="text-sm divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
            {pagando.map(p => {
              const e = entro(p.ultima), dd = p.hasta ? diasA(p.hasta) : null
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <b>{p.nombre}</b>{p.fundador && <span className="ml-1 text-amber-700" title="Fundador">⭐</span>}
                    <span className="text-neutral-500"> · {PLAN[p.plan ?? ''] ?? p.plan ?? '—'}{p.escalon != null ? ` · ${ESCALON[p.escalon]}` : ''}{p.ciclo ? ` · ${p.ciclo}` : ''}</span>
                    <span className={`block text-[11px] ${e.mal ? 'text-red-600' : 'text-neutral-500'}`}>{e.t}</span>
                  </span>
                  <span className="num text-xs text-neutral-700">{p.monto != null ? usd(p.monto) : '—'}</span>
                  <span className={`text-xs ${dd != null && dd <= 3 ? 'font-semibold text-amber-700' : 'text-neutral-500'}`}>
                    {p.hasta ? `hasta ${ddmm(p.hasta)}${dd != null && dd <= 7 ? ` (${cuando(dd)})` : ''}` : 'sin fecha'}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <details className="group space-y-2">
        <summary className="cursor-pointer select-none text-sm font-semibold text-neutral-800">Últimos pagos revisados ({d.recientes.length})</summary>
        {!d.recientes.length ? <p className="text-sm text-neutral-500">Todavía ninguno.</p> : (
          <ul className="text-sm divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
            {d.recientes.map(k => (
              <li key={k.id} className="px-3 py-1.5">
                <details>
                  <summary className="flex flex-wrap justify-between gap-2 cursor-pointer list-none">
                    <span><b>{k.organizacion}</b> · {k.tipo === 'plan' ? (PLAN[k.plan] ?? k.plan) : TIPO[k.tipo]} · {usd(k.monto_usd)}
                      {k.desde && k.hasta ? <span className="text-neutral-500"> · {ddmm(k.desde)} → {ddmm(k.hasta)}</span> : null}
                      <span className="text-neutral-400"> · ver detalle</span></span>
                    <span className={k.estado === 'aprobado' ? 'text-lime-700' : 'text-red-700'} title={k.motivo ?? undefined}>
                      {k.estado === 'aprobado' ? 'Aprobado' : `Rechazado${k.motivo ? `: ${k.motivo}` : ''}`} · {hora(k.revisado_at)}
                    </span>
                  </summary>
                  <div className="mt-1.5 space-y-1">
                    <Desglose k={k} />
                    <p className="text-xs text-neutral-600">{METODO[k.metodo]} ref. {k.referencia} · pagado el {ddmm(k.fecha_pago)}{k.monto_bs ? ` · ${bs(k.monto_bs)}` : ''}
                      {k.tiene_comprobante && <a href={`/api/mi-plan/comprobante/${k.id}`} target="_blank" rel="noopener noreferrer" className="ml-2 text-sky-700 hover:underline">captura</a>}</p>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </details>

      <details className="space-y-2" open={!!editarDatos}>
        <summary className="cursor-pointer select-none text-sm font-semibold text-neutral-800">Datos de cobro (los ve el cliente en Mi plan)</summary>
        <div className="flex items-baseline justify-end">
          {!editarDatos && <button onClick={() => setEditarDatos(d.datos)} className="text-sm text-sky-700 hover:underline">Editar</button>}
        </div>
        {editarDatos ? (
          <div className="grid gap-3 sm:grid-cols-2 rounded-xl border border-neutral-200 bg-white p-3 text-sm">
            <div className="space-y-1">
              <p className="font-medium">Pago Móvil</p>
              {(['banco', 'telefono', 'cedula'] as const).map(c => (
                <input key={c} value={editarDatos.pago_movil[c]} placeholder={c} className={campo}
                  onChange={e => setEditarDatos({ ...editarDatos, pago_movil: { ...editarDatos.pago_movil, [c]: e.target.value } })} />
              ))}
            </div>
            <div className="space-y-1">
              <p className="font-medium">Binance</p>
              {(['id', 'nombre', 'correo', 'moneda'] as const).map(c => (
                <input key={c} value={editarDatos.binance[c]} placeholder={c} className={campo}
                  onChange={e => setEditarDatos({ ...editarDatos, binance: { ...editarDatos.binance, [c]: e.target.value } })} />
              ))}
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <button onClick={guardarDatos} className="rounded bg-neutral-900 px-3 py-1 text-sm text-white">Guardar</button>
              <button onClick={() => setEditarDatos(null)} className="text-sm text-neutral-500">Cancelar</button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-neutral-200 bg-white p-3 text-sm grid gap-1 sm:grid-cols-2">
            <p><b>Pago Móvil:</b> {d.datos.pago_movil.banco} · {d.datos.pago_movil.telefono} · C.I. {d.datos.pago_movil.cedula}</p>
            <p><b>Binance:</b> ID {d.datos.binance.id} ({d.datos.binance.nombre}) · {d.datos.binance.correo} · {d.datos.binance.moneda}</p>
          </div>
        )}
      </details>
    </div>
  )
}

function Cifra({ titulo, valor, detalle, alerta = false }: { titulo: string; valor: string; detalle: string; alerta?: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl border bg-white px-4 py-3 shadow-sm ${alerta ? 'border-amber-300' : 'border-neutral-200'}`}>
      <div className="text-xs text-neutral-500">{titulo}</div>
      <div className="num text-2xl font-semibold text-neutral-900">{valor}</div>
      <div className="truncate text-xs text-neutral-400" title={detalle}>{detalle}</div>
    </div>
  )
}
