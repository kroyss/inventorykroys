'use client'

// Mi plan (02-11-2026, migración 141): el cliente ve su estado y lo que paga según sus ventas, paga por Pago Móvil o
// Binance, adjunta la captura y la referencia, y sigue el estado de su pago. El dueño lo aprueba en Plataforma → Cobros.
// `acceso`: entra desde /renovar (cuenta vencida, sin sesión) con el acceso firmado de /api/mi-plan/entrar.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CobroFila, SituacionPlan } from '@/lib/cobros'

const fmtUsd = (n: number) => `$${n.toLocaleString('de-DE', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
const fmtBs = (n: number) => `Bs ${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const ddmm = (f: string | null) => f ? f.split('-').reverse().join('/') : '—'
const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const NOMBRE_PLAN: Record<string, string> = { esencial: 'Esencial', automatizaciones: 'Automatizaciones', completo: 'Completo' }
const METODO: Record<string, string> = { pago_movil: 'Pago Móvil', binance: 'Binance' }

function Copiar({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button type="button" onClick={() => { navigator.clipboard?.writeText(texto).then(() => { setOk(true); setTimeout(() => setOk(false), 1500) }).catch(() => {}) }}
      className="ml-2 text-xs text-sky-700 hover:underline">{ok ? '✓ copiado' : 'copiar'}</button>
  )
}

function Dato({ etiqueta, valor, copiar = true }: { etiqueta: string; valor: string; copiar?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 border-b border-neutral-100 last:border-0">
      <span className="text-neutral-500 text-sm">{etiqueta}</span>
      <span className="text-sm font-medium text-neutral-900 text-right">{valor}{copiar && <Copiar texto={valor.replace(/^Bs |^\$/, '')} />}</span>
    </div>
  )
}

export default function MiPlan({ acceso }: { acceso?: string }) {
  const [s, setS] = useState<SituacionPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<string>('automatizaciones')
  const [ciclo, setCiclo] = useState<'mensual' | 'trimestral'>('mensual')
  const [radarPro, setRadarPro] = useState(false)
  const [metodo, setMetodo] = useState<'pago_movil' | 'binance'>('pago_movil')
  const [referencia, setReferencia] = useState('')
  const [fecha, setFecha] = useState(hoyLocal())
  const [archivo, setArchivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [cambiarPlan, setCambiarPlan] = useState(false)
  const headers = useMemo((): Record<string, string> => (acceso ? { 'x-renovar': acceso } : {}), [acceso])

  const cargar = useCallback(async () => {
    const r = await fetch('/api/mi-plan', { headers, cache: 'no-store' }).catch(() => null)
    if (!r?.ok) { setError(r ? ((await r.json().catch(() => ({}))).error ?? 'No se pudo cargar tu plan') : 'Sin conexión'); return }
    const d = await r.json() as SituacionPlan
    setS(d); setPlan(d.planSugerido)
  }, [headers])
  useEffect(() => { cargar() }, [cargar])

  if (error && !s) return <p className="text-sm text-red-700">{error}</p>
  if (!s) return <p className="text-sm text-neutral-500">Cargando tu plan…</p>

  const op = s.opciones.find(o => o.id === plan) ?? s.opciones[0]
  const meses = ciclo === 'trimestral' ? 3 : 1
  const pro = radarPro && op.radar && s.radarPro.disponible ? s.radarPro.precio * meses : 0
  const total = Math.round(((ciclo === 'trimestral' ? op.trimestral : op.mensual) + pro) * 100) / 100
  const bs = s.tasaBcv ? Math.round(total * s.tasaBcv * 100) / 100 : null
  const enRevision = s.ultimo?.estado === 'revision'
  const comprobante = (k: CobroFila) => `/api/mi-plan/comprobante/${k.id}${acceso ? `?acceso=${encodeURIComponent(acceso)}` : ''}`

  const enviar = async () => {
    setError(null)
    if (referencia.trim().length < 3) { setError(metodo === 'binance' ? 'Escribe el ID de la orden de Binance' : 'Escribe la referencia del pago'); return }
    if (!archivo) { setError('Adjunta la captura del pago'); return }
    setEnviando(true)
    const f = new FormData()
    f.set('plan', plan); f.set('ciclo', ciclo); f.set('radar_pro', pro ? '1' : '0'); f.set('metodo', metodo)
    f.set('referencia', referencia.trim()); f.set('fecha_pago', fecha); f.set('archivo', archivo)
    const r = await fetch('/api/mi-plan', { method: 'POST', headers, body: f }).catch(() => null)
    setEnviando(false)
    if (!r?.ok) { setError(r ? ((await r.json().catch(() => ({}))).error ?? 'No se pudo enviar') : 'Sin conexión: vuelve a intentar'); return }
    setReferencia(''); setArchivo(null)
    await cargar()
  }

  const estadoTexto = s.estado === 'activo' ? <>Plan <b>{NOMBRE_PLAN[s.plan ?? ''] ?? s.plan}</b> activo hasta el <b>{ddmm(s.vence)}</b></>
    : s.estado === 'prueba' ? <>Prueba gratis hasta el <b>{ddmm(s.vence)}</b></>
    : <>Tu {s.plan ? 'plan' : 'prueba gratis'} venció{s.vence ? <> el <b>{ddmm(s.vence)}</b></> : null}. Paga para reactivar tu cuenta: tus datos se conservan.</>

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Estado */}
      <section className={`rounded-xl border px-4 py-3 text-sm ${s.estado === 'vencido' ? 'bg-red-50 border-red-200 text-red-900' : 'bg-white border-neutral-200 text-neutral-800'}`}>
        {estadoTexto}
        {s.fundador && <span className="ml-2 text-xs bg-lime-100 text-lime-800 rounded px-1.5 py-0.5">Fundador −30%</span>}
      </section>

      {/* Último pago */}
      {s.ultimo && (s.ultimo.estado === 'revision' ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">⏳ Tu pago está en revisión</p>
          <p className="mt-1">{NOMBRE_PLAN[s.ultimo.plan]} · {fmtUsd(s.ultimo.monto_usd)}{s.ultimo.monto_bs ? ` (${fmtBs(s.ultimo.monto_bs)})` : ''} · {METODO[s.ultimo.metodo]} ref. {s.ultimo.referencia}</p>
          <p className="mt-1 text-xs">Lo confirmamos a mano en el banco o en Binance y te avisamos. Mientras tanto tu cuenta sigue funcionando.</p>
        </section>
      ) : s.ultimo.estado === 'rechazado' ? (
        <section className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-semibold">No pudimos confirmar tu último pago</p>
          <p className="mt-1">{s.ultimo.motivo}</p>
          <p className="mt-1 text-xs">Revisa los datos y vuelve a reportarlo abajo.</p>
        </section>
      ) : (
        <section className="rounded-xl border border-lime-200 bg-lime-50 px-4 py-3 text-sm text-lime-900">
          <p className="font-semibold">✓ Pago aprobado</p>
          <p className="mt-1">{NOMBRE_PLAN[s.ultimo.plan]} · {fmtUsd(s.ultimo.monto_usd)} · {METODO[s.ultimo.metodo]} ref. {s.ultimo.referencia}{s.ultimo.hasta ? ` · activo hasta el ${ddmm(s.ultimo.hasta)}` : ''}</p>
        </section>
      ))}

      {!enRevision && (
        <>
          {/* 1 · Lo que te toca */}
          <section className="rounded-xl border border-neutral-200 bg-white px-4 py-4 space-y-3">
            <h2 className="text-sm font-semibold text-neutral-800">1 · {s.estado === 'activo' ? 'Renueva tu plan' : 'Elige tu plan'}</h2>
            <p className="text-sm text-neutral-600">
              Con tus <b className="num">{s.ventas30.toLocaleString('de-DE')}</b> ventas de los últimos 30 días en MercadoLibre (todas tus cuentas)
              te corresponde el escalón <b>{s.escalonNombre} ventas al mes</b>.
            </p>
            {!cambiarPlan ? (
              <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{op.nombre}</p>
                  <p className="text-xs text-neutral-600">{op.resumen}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold num">{fmtUsd(op.mensual)}<span className="text-xs font-normal text-neutral-500">/mes</span></p>
                  <button type="button" onClick={() => setCambiarPlan(true)} className="text-xs text-sky-700 hover:underline">cambiar plan</button>
                </div>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-3">
                {s.opciones.map(o => (
                  <button key={o.id} type="button" onClick={() => { setPlan(o.id); if (!o.radar) setRadarPro(false) }}
                    className={`text-left rounded-lg border px-3 py-2 ${plan === o.id ? 'border-sky-400 bg-sky-50' : 'border-neutral-200 hover:border-neutral-300'}`}>
                    <p className="text-sm font-semibold">{o.nombre}{s.plan === o.id ? <span className="ml-1 text-xs font-normal text-neutral-500">(tu plan)</span> : null}</p>
                    <p className="text-sm num">{fmtUsd(o.mensual)}<span className="text-xs text-neutral-500">/mes</span></p>
                    <p className="text-xs text-neutral-500 mt-1">{o.resumen}</p>
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2 text-sm">
              {(['mensual', 'trimestral'] as const).map(c => (
                <button key={c} type="button" onClick={() => setCiclo(c)}
                  className={`rounded-full border px-3 py-1 ${ciclo === c ? 'border-sky-400 bg-sky-50 text-sky-900' : 'border-neutral-200 text-neutral-600'}`}>
                  {c === 'mensual' ? 'Mensual' : `Trimestral${s.fundador ? '' : ' (−10%)'}`}
                </button>
              ))}
            </div>
            {op.radar && s.radarPro.disponible && (
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input type="checkbox" checked={radarPro} onChange={e => setRadarPro(e.target.checked)} />
                Radar PRO los fines de semana (+{fmtUsd(s.radarPro.precio)}/mes)
              </label>
            )}
            {op.radar && s.radarPro.regalo && <p className="text-xs text-lime-700">Incluye 1 mes de Radar PRO los fines de semana de regalo.</p>}
            {s.cuentasExtra > 0 && <p className="text-xs text-neutral-500">Incluye {s.cuentasExtra} cuenta(s) de MercadoLibre extra (tienes {s.cuentas}; el plan trae 2).</p>}
            <div className="flex items-baseline justify-between border-t border-neutral-100 pt-3">
              <span className="text-sm text-neutral-600">Total a pagar{ciclo === 'trimestral' ? ' (3 meses)' : ''}</span>
              <span className="text-lg font-semibold num">{fmtUsd(total)}</span>
            </div>
          </section>

          {/* 2 · Paga */}
          <section className="rounded-xl border border-neutral-200 bg-white px-4 py-4 space-y-3">
            <h2 className="text-sm font-semibold text-neutral-800">2 · Paga</h2>
            <div className="flex gap-2 text-sm">
              {(['pago_movil', 'binance'] as const).map(m => (
                <button key={m} type="button" onClick={() => setMetodo(m)}
                  className={`rounded-full border px-3 py-1 ${metodo === m ? 'border-sky-400 bg-sky-50 text-sky-900' : 'border-neutral-200 text-neutral-600'}`}>{METODO[m]}</button>
              ))}
            </div>
            {metodo === 'pago_movil' ? (
              <div>
                <Dato etiqueta="Monto" valor={bs ? fmtBs(bs) : 'sin tasa BCV hoy'} copiar={!!bs} />
                {s.tasaBcv && <p className="text-xs text-neutral-500 py-1">{fmtUsd(total)} a tasa BCV de hoy ({s.tasaBcv.toLocaleString('de-DE', { maximumFractionDigits: 2 })} Bs/$)</p>}
                <Dato etiqueta="Banco" valor={s.datos.pago_movil.banco} copiar={false} />
                <Dato etiqueta="Teléfono" valor={s.datos.pago_movil.telefono} />
                <Dato etiqueta="Cédula" valor={s.datos.pago_movil.cedula} />
              </div>
            ) : (
              <div>
                <Dato etiqueta="Monto" valor={`${total} ${s.datos.binance.moneda}`} />
                <Dato etiqueta="Binance Pay ID" valor={s.datos.binance.id} />
                <Dato etiqueta="Nombre" valor={s.datos.binance.nombre} copiar={false} />
                <Dato etiqueta="Correo" valor={s.datos.binance.correo} />
                <p className="text-xs text-neutral-500 py-1">Solo {s.datos.binance.moneda}.</p>
              </div>
            )}
          </section>

          {/* 3 · Ya pagué */}
          <section className="rounded-xl border border-neutral-200 bg-white px-4 py-4 space-y-3">
            <h2 className="text-sm font-semibold text-neutral-800">3 · Ya pagué</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="text-neutral-600">{metodo === 'binance' ? 'ID de la orden (Binance)' : 'Referencia del pago'}</span>
                <input value={referencia} onChange={e => setReferencia(e.target.value)} maxLength={80}
                  className="mt-1 w-full border border-neutral-300 rounded px-2 py-1.5" placeholder={metodo === 'binance' ? 'Ej.: 3189...' : 'Ej.: 001234'} />
              </label>
              <label className="text-sm">
                <span className="text-neutral-600">Fecha del pago</span>
                <input type="date" value={fecha} max={hoyLocal()} onChange={e => setFecha(e.target.value)}
                  className="mt-1 w-full border border-neutral-300 rounded px-2 py-1.5" />
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-neutral-600">Captura del pago (imagen o PDF)</span>
              <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={e => setArchivo(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-sm" />
            </label>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button type="button" onClick={enviar} disabled={enviando}
              className="w-full sm:w-auto rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50">
              {enviando ? 'Enviando…' : `Enviar pago de ${fmtUsd(total)}`}
            </button>
            <p className="text-xs text-neutral-500">Lo confirmamos a mano y te avisamos. Si lo reportas antes de que venza, tu cuenta no se corta mientras lo revisamos.</p>
          </section>
        </>
      )}

      {/* Anteriores */}
      {(s.anteriores.length > 0 || (s.ultimo && s.ultimo.estado !== 'revision')) && (
        <details className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm">
          <summary className="cursor-pointer text-neutral-600">Pagos anteriores</summary>
          <ul className="mt-2 space-y-1">
            {[...(s.ultimo ? [s.ultimo] : []), ...s.anteriores].map(k => (
              <li key={k.id} className="flex flex-wrap justify-between gap-2 border-b border-neutral-100 py-1 last:border-0">
                <span>{ddmm(k.fecha_pago)} · {NOMBRE_PLAN[k.plan]} · {fmtUsd(k.monto_usd)} · {METODO[k.metodo]} ref. {k.referencia}</span>
                <span className={k.estado === 'aprobado' ? 'text-lime-700' : k.estado === 'rechazado' ? 'text-red-700' : 'text-amber-700'}>
                  {k.estado === 'aprobado' ? 'Aprobado' : k.estado === 'rechazado' ? 'Rechazado' : 'En revisión'}
                  {k.tiene_comprobante && <a href={comprobante(k)} target="_blank" rel="noopener noreferrer" className="ml-2 text-sky-700 hover:underline">captura</a>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
