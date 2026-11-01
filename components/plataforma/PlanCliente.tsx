'use client'
import { useCallback, useEffect, useState } from 'react'
import { ESCALONES, PLANES, RADAR_PRO, RECARGA_IA, montoPlan, planConRadar, sumarMeses, type Plan } from '@/lib/planes'

// Plataforma → ficha del cliente → Plan y pagos (01-11-2026, migración 138): activar o renovar el plan (módulos y
// créditos del escalón salen solos), recargar créditos de IA, Radar PRO de fin de semana y el historial de pagos.

export interface DatosPlan {
  organizacion_id: number; fundador: boolean; estado: string
  plan: Plan['id'] | null; escalon: number | null; ciclo: 'mensual' | 'trimestral' | null
  plan_hasta: string | null; radar_pro_hasta: string | null
  empresas: { id: number; nombre: string }[]
}
interface Pago {
  id: number; tipo: 'plan' | 'recarga' | 'radar_pro'; fecha: string; monto: number | null; plan: string | null; escalon: number | null
  ciclo: string | null; desde: string | null; hasta: string | null; creditos: number | null; nota: string | null; empresa: string | null; por: string | null
}

const ddmmaa = (f: string) => f.split('-').reverse().join('/')
const nombrePlan = (id: string | null) => PLANES.find(p => p.id === id)?.nombre ?? id ?? '—'
const usd = (n: number) => `$${n.toLocaleString('de-DE', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`

export default function PlanCliente({ d, hoy, onCambio, onError }: { d: DatosPlan; hoy: string; onCambio: (msg: string) => void; onError: (e: string) => void }) {
  const [pagos, setPagos] = useState<Pago[] | null>(null)
  const [abierto, setAbierto] = useState<null | 'plan' | 'recarga' | 'radar'>(null)
  const [guardando, setGuardando] = useState(false)
  const cargar = useCallback(() => {
    fetch(`/api/plataforma/organizaciones/${d.organizacion_id}/pagos`).then(r => r.ok ? r.json() : null).then(x => setPagos(x?.pagos ?? []))
  }, [d.organizacion_id])
  useEffect(() => { cargar() }, [cargar])

  // Formulario del plan: por defecto el plan que tiene (o Automatizaciones), desde el día que vence (o hoy).
  const vigente = d.plan_hasta && d.plan_hasta >= hoy
  const [f, setF] = useState({
    plan: (d.plan ?? 'automatizaciones') as Plan['id'], escalon: d.escalon ?? 0, ciclo: (d.ciclo ?? 'mensual') as 'mensual' | 'trimestral',
    extras: 0, monto: '', nota: '',
  })
  const calc = montoPlan(f.plan, f.escalon, f.ciclo, d.fundador, f.extras)
  const hastaPlan = sumarMeses(vigente ? d.plan_hasta! : hoy, calc.meses)
  const [hasta, setHasta] = useState<string | null>(null)
  const [recarga, setRecarga] = useState({ empresa: d.empresas[0]?.id ?? 0, creditos: String(RECARGA_IA.creditos), monto: String(RECARGA_IA.precio), nota: '' })
  const radarVigente = d.radar_pro_hasta && d.radar_pro_hasta >= hoy
  const [radar, setRadar] = useState({ hasta: '', monto: String(RADAR_PRO.precio), nota: '' })

  const enviar = async (body: object) => {
    setGuardando(true)
    const r = await fetch(`/api/plataforma/organizaciones/${d.organizacion_id}/pagos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const x = await r.json().catch(() => null)
    setGuardando(false)
    if (!r.ok) { onError(x?.error ?? 'No se pudo guardar'); return }
    setAbierto(null); cargar(); onCambio(x?.mensaje ?? 'Guardado')
  }
  const num = (v: string) => Number(v.replace(',', '.'))

  const quedan = d.plan_hasta ? Math.round((Date.parse(`${d.plan_hasta}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86_400_000) : null
  return (
    <div className="space-y-2.5">
      {d.plan ? (
        <div className="rounded-lg border border-neutral-200 px-3 py-2 text-xs space-y-0.5">
          <div><b className="text-neutral-900">{nombrePlan(d.plan)}</b> · {ESCALONES[d.escalon ?? 0]?.ventas} ventas/mes · {d.ciclo}</div>
          {d.plan_hasta && <div className={quedan !== null && quedan < 0 ? 'text-red-700' : quedan !== null && quedan <= 3 ? 'text-amber-700' : 'text-neutral-600'}>
            Pagado hasta el <b>{ddmmaa(d.plan_hasta)}</b>{quedan !== null && (quedan < 0 ? ' · vencido' : quedan === 0 ? ' · vence hoy' : ` · quedan ${quedan} días`)}
          </div>}
          <div className="text-neutral-600">{planConRadar(d.plan) ? <>Radar: Gratis{radarVigente ? <> · <b>PRO fines de semana</b> hasta el {ddmmaa(d.radar_pro_hasta!)}</> : ''}</> : 'Sin Radar (Esencial)'}</div>
        </div>
      ) : <p className="text-xs text-neutral-500">Sin plan todavía. Al activarlo pasa a «Pagando», se prenden los módulos del plan y los créditos de su escalón. Automatizaciones y Completo traen el Radar Gratis y 1 mes de Radar PRO de fin de semana de regalo; Esencial no trae Radar.</p>}

      <div className="flex flex-wrap gap-1.5">
        {d.estado !== 'propietario' && <button onClick={() => setAbierto(abierto === 'plan' ? null : 'plan')} className="btn-primary text-xs">{d.plan ? 'Registrar pago / renovar' : 'Activar plan'}</button>}
        <button onClick={() => setAbierto(abierto === 'recarga' ? null : 'recarga')} className="btn-secondary text-xs">Recargar créditos IA</button>
        {d.estado !== 'propietario' && planConRadar(d.plan) && <button onClick={() => setAbierto(abierto === 'radar' ? null : 'radar')} className="btn-secondary text-xs">Radar PRO</button>}
      </div>

      {abierto === 'plan' && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs space-y-2">
          <label className="block">Plan
            <select value={f.plan} onChange={e => setF({ ...f, plan: e.target.value as Plan['id'] })} className="mt-0.5 w-full border border-neutral-300 rounded px-2 py-1 bg-white">
              {PLANES.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
          <label className="block">Ventas al mes (escalón)
            <select value={f.escalon} onChange={e => setF({ ...f, escalon: Number(e.target.value) })} className="mt-0.5 w-full border border-neutral-300 rounded px-2 py-1 bg-white">
              {ESCALONES.map((e, i) => <option key={i} value={i}>{e.nombre ? `${e.nombre} · ` : ''}{e.ventas} · {usd(e.precios[f.plan])} · {e.creditos} créditos IA</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-3">
            {(['mensual', 'trimestral'] as const).map(c => (
              <label key={c} className="flex items-center gap-1"><input type="radio" checked={f.ciclo === c} onChange={() => setF({ ...f, ciclo: c })} />{c === 'mensual' ? 'Mensual' : 'Trimestral (−10%)'}</label>
            ))}
            <label className="flex items-center gap-1">Cuentas ML extra
              <input type="number" min={0} value={f.extras} onChange={e => setF({ ...f, extras: Number(e.target.value) || 0 })} className="w-12 border border-neutral-300 rounded px-1 py-0.5" />
            </label>
          </div>
          <p className="text-neutral-600">
            {usd(calc.base)}/mes × {calc.meses}{calc.descuento ? ` − ${calc.descuento}%${d.fundador && calc.descuento === 30 ? ' Fundador' : ''}` : ''} = <b className="text-neutral-900">{usd(calc.total)}</b>
          </p>
          <div className="flex flex-wrap gap-3">
            <label className="block">Pagado hasta
              <input type="date" value={hasta ?? hastaPlan} min={hoy} onChange={e => setHasta(e.target.value)} className="mt-0.5 block border border-neutral-300 rounded px-2 py-1" />
            </label>
            <label className="block">Cobrado ($)
              <input inputMode="decimal" value={f.monto} placeholder={String(calc.total)} onChange={e => setF({ ...f, monto: e.target.value })} className="mt-0.5 block w-24 border border-neutral-300 rounded px-2 py-1" />
            </label>
          </div>
          <input value={f.nota} onChange={e => setF({ ...f, nota: e.target.value })} placeholder="Nota (opcional): forma de pago, referencia…" className="w-full border border-neutral-300 rounded px-2 py-1" />
          <p className="text-neutral-500">Al día siguiente del vencimiento la cuenta se pausa sola; 3 días antes le llega el aviso en el sistema y por Telegram.</p>
          <button disabled={guardando} onClick={() => enviar({ tipo: 'plan', plan: f.plan, escalon: f.escalon, ciclo: f.ciclo, hasta: hasta ?? hastaPlan, monto: f.monto ? num(f.monto) : calc.total, nota: f.nota })}
            className="btn-primary text-xs">{guardando ? 'Guardando…' : 'Guardar pago'}</button>
        </div>
      )}

      {abierto === 'recarga' && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs space-y-2">
          {d.empresas.length > 1 && (
            <select value={recarga.empresa} onChange={e => setRecarga({ ...recarga, empresa: Number(e.target.value) })} className="w-full border border-neutral-300 rounded px-2 py-1 bg-white">
              {d.empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          )}
          <div className="flex flex-wrap gap-3">
            <label className="block">Créditos<input inputMode="numeric" value={recarga.creditos} onChange={e => setRecarga({ ...recarga, creditos: e.target.value })} className="mt-0.5 block w-20 border border-neutral-300 rounded px-2 py-1" /></label>
            <label className="block">Cobrado ($)<input inputMode="decimal" value={recarga.monto} onChange={e => setRecarga({ ...recarga, monto: e.target.value })} className="mt-0.5 block w-20 border border-neutral-300 rounded px-2 py-1" /></label>
          </div>
          <input value={recarga.nota} onChange={e => setRecarga({ ...recarga, nota: e.target.value })} placeholder="Nota (opcional)" className="w-full border border-neutral-300 rounded px-2 py-1" />
          <p className="text-neutral-500">No vencen: se suman a los del mes y se gastan después de esos. Precio de lista: {RECARGA_IA.creditos} créditos {usd(RECARGA_IA.precio)}.</p>
          <button disabled={guardando || !(num(recarga.creditos) > 0)} onClick={() => enviar({ tipo: 'recarga', empresa_id: recarga.empresa, creditos: Math.round(num(recarga.creditos)), monto: num(recarga.monto) || 0, nota: recarga.nota })}
            className="btn-primary text-xs">{guardando ? 'Guardando…' : 'Guardar recarga'}</button>
        </div>
      )}

      {abierto === 'radar' && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs space-y-2">
          <p className="text-neutral-600">Radar PRO solo sábados y domingos ({usd(RADAR_PRO.precio)}/mes). Entre semana sigue en Radar Gratis.</p>
          <div className="flex flex-wrap gap-3">
            <label className="block">Hasta
              <input type="date" min={hoy} value={radar.hasta || sumarMeses(radarVigente ? d.radar_pro_hasta! : hoy, 1)} onChange={e => setRadar({ ...radar, hasta: e.target.value })} className="mt-0.5 block border border-neutral-300 rounded px-2 py-1" />
            </label>
            <label className="block">Cobrado ($)<input inputMode="decimal" value={radar.monto} onChange={e => setRadar({ ...radar, monto: e.target.value })} className="mt-0.5 block w-20 border border-neutral-300 rounded px-2 py-1" /></label>
          </div>
          <button disabled={guardando} onClick={() => enviar({ tipo: 'radar_pro', hasta: radar.hasta || sumarMeses(radarVigente ? d.radar_pro_hasta! : hoy, 1), monto: num(radar.monto) || 0, nota: radar.nota })}
            className="btn-primary text-xs">{guardando ? 'Guardando…' : 'Guardar Radar PRO'}</button>
        </div>
      )}

      {pagos && pagos.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer select-none text-neutral-500">Historial de pagos ({pagos.length})</summary>
          <ul className="mt-1.5 space-y-1">
            {pagos.map(p => (
              <li key={p.id} className="flex justify-between gap-2 border-b border-neutral-100 pb-1">
                <span>
                  <span className="text-neutral-400">{new Date(p.fecha).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Caracas' })}</span>{' '}
                  {p.tipo === 'plan' ? <>{nombrePlan(p.plan)} · {p.ciclo}{p.hasta ? ` · hasta ${ddmmaa(p.hasta)}` : ''}</>
                    : p.tipo === 'recarga' ? <>Recarga {p.creditos} créditos{p.empresa && d.empresas.length > 1 ? ` · ${p.empresa}` : ''}</>
                    : <>Radar PRO{p.hasta ? ` hasta ${ddmmaa(p.hasta)}` : ''}</>}
                  {p.nota && <span className="text-neutral-400"> · {p.nota}</span>}
                </span>
                <span className="font-medium whitespace-nowrap">{p.monto != null ? usd(p.monto) : '—'}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
