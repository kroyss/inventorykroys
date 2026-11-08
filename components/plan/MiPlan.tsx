'use client'

// Mi plan (02-11-2026, migración 141): el cliente ve su estado y lo que paga según sus ventas, paga por Pago Móvil o
// Binance, adjunta la captura y la referencia, y sigue el estado de su pago. El dueño lo aprueba en Plataforma → Cobros.
// `acceso`: entra desde /renovar (cuenta vencida, sin sesión) con el acceso firmado de /api/mi-plan/entrar.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CobroFila, SituacionPlan } from '@/lib/cobros'
import { CICLOS, CICLOS_IDS, DESCUENTO_FUNDADOR, type Ciclo } from '@/lib/planes'

const fmtUsd = (n: number) => `$${n.toLocaleString('de-DE', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
const fmtBs = (n: number) => `Bs ${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const ddmm = (f: string | null) => f ? f.split('-').reverse().join('/') : '—'
const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const NOMBRE_PLAN: Record<string, string> = { esencial: 'Esencial', automatizaciones: 'Automatizaciones', completo: 'Completo' }
const METODO: Record<string, string> = { pago_movil: 'Pago Móvil', binance: 'Binance' }
const titulo = (k: CobroFila) => k.tipo === 'radar_pro' ? 'Radar PRO (1 mes)' : k.tipo === 'upgrade' ? `Cambio a ${NOMBRE_PLAN[k.plan] ?? k.plan}` : (NOMBRE_PLAN[k.plan] ?? k.plan)

function Copiar({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false)
  return (
    // 06-11 (el dueño): ícono de copiar (dos hojas) en vez de la palabra; al copiar, un ✓ verde un momento.
    <button type="button" title={ok ? 'Copiado' : 'Copiar'} aria-label={ok ? 'Copiado' : `Copiar ${texto}`}
      onClick={() => { navigator.clipboard?.writeText(texto).then(() => { setOk(true); setTimeout(() => setOk(false), 1500) }).catch(() => {}) }}
      className={`ml-2 inline-flex h-7 w-7 items-center justify-center rounded-md align-middle ${ok ? 'text-emerald-600' : 'text-neutral-400 hover:bg-sky-50 hover:text-sky-700'}`}>
      {ok
        ? <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" /></svg>
        : <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6}><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /></svg>}
    </button>
  )
}

function Dato({ etiqueta, valor, copiar = true }: { etiqueta: string; valor: string; copiar?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 border-b border-neutral-100 last:border-0">
      <span className="text-neutral-500 text-sm">{etiqueta}</span>
      <span className="flex items-center text-sm font-medium text-neutral-900 text-right">{valor}{copiar ? <Copiar texto={valor.replace(/^Bs |^\$/, '')} /> : <span className="ml-2 w-7" />}</span>
    </div>
  )
}

export default function MiPlan({ acceso }: { acceso?: string }) {
  const [s, setS] = useState<SituacionPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<string>('automatizaciones')
  const [ciclo, setCiclo] = useState<Ciclo>('mensual')
  // 06-11 (Plan A/B): qué paga — renovar el plan, 1 mes de Radar PRO aparte o pasar a un plan mejor.
  const [compra, setCompra] = useState<'plan' | 'radar_pro' | 'upgrade'>('plan')
  const [mejora, setMejora] = useState<string>('')
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
    setS(d); setPlan(d.planSugerido); setMejora(d.mejoras[0]?.plan ?? '')
  }, [headers])
  useEffect(() => { cargar() }, [cargar])

  if (error && !s) return <p className="text-sm text-red-700">{error}</p>
  if (!s) return <p className="text-sm text-neutral-500">Cargando tu plan…</p>

  const op = s.opciones.find(o => o.id === plan) ?? s.opciones[0]
  const mej = s.mejoras.find(m => m.plan === mejora) ?? s.mejoras[0]
  const tipo = compra === 'radar_pro' && s.radarProCompra ? 'radar_pro' : compra === 'upgrade' && mej ? 'upgrade' : 'plan'
  const total = tipo === 'radar_pro' ? s.radarProCompra!.precio : tipo === 'upgrade' ? mej!.monto
    : Math.round(op.porCiclo[ciclo] * 100) / 100
  const bs = s.tasaBcv ? Math.round(total * s.tasaBcv * 100) / 100 : null
  const enRevision = s.ultimo?.estado === 'revision'
  const comprobante = (k: CobroFila) => `/api/mi-plan/comprobante/${k.id}${acceso ? `?acceso=${encodeURIComponent(acceso)}` : ''}`

  const enviar = async () => {
    setError(null)
    if (referencia.trim().length < 3) { setError(metodo === 'binance' ? 'Escribe el ID de la orden de Binance' : 'Escribe la referencia del pago'); return }
    if (!archivo) { setError('Adjunta la captura del pago'); return }
    setEnviando(true)
    const f = new FormData()
    f.set('tipo', tipo); f.set('plan', tipo === 'upgrade' ? mej!.plan : plan); f.set('ciclo', ciclo); f.set('metodo', metodo)
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
    <div className="space-y-4">
      {/* Estado */}
      <section className={`rounded-xl border px-4 py-3 text-sm ${s.estado === 'vencido' ? 'bg-red-50 border-red-200 text-red-900' : 'bg-white border-neutral-200 text-neutral-800'}`}>
        {estadoTexto}
        {s.fundador && <span className="ml-2 text-xs bg-lime-100 text-lime-800 rounded px-1.5 py-0.5">Fundador −30%</span>}
      </section>

      {/* Último pago */}
      {s.ultimo && (s.ultimo.estado === 'revision' ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">⏳ Tu pago está en revisión</p>
          <p className="mt-1">{titulo(s.ultimo)} · {fmtUsd(s.ultimo.monto_usd)}{s.ultimo.monto_bs ? ` (${fmtBs(s.ultimo.monto_bs)})` : ''} · {METODO[s.ultimo.metodo]} ref. {s.ultimo.referencia}</p>
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
          <p className="mt-1">{titulo(s.ultimo)} · {fmtUsd(s.ultimo.monto_usd)} · {METODO[s.ultimo.metodo]} ref. {s.ultimo.referencia}{s.ultimo.hasta ? ` · activo hasta el ${ddmm(s.ultimo.hasta)}` : ''}</p>
        </section>
      ))}

      {!enRevision && !s.conectadas && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Primero conecta tu cuenta de MercadoLibre</p>
          <p className="mt-1">Tu plan se calcula con las ventas de tus cuentas de ML.{acceso ? '' : <> Conéctala en <a href="/cuentas-ml" className="underline">Cuentas de ML</a> y vuelve aquí.</>}</p>
        </section>
      )}

      {!enRevision && s.conectadas > 0 && (
        // 06-11 (el dueño): en pantalla ancha, a la izquierda el plan y a la derecha cómo pagar (antes una columna angosta).
        <div className="grid gap-4 lg:grid-cols-2 items-start">
          {/* 1 · Lo que te toca */}
          <section className="rounded-xl border border-neutral-200 bg-white px-4 py-4 space-y-3">
            <h2 className="text-sm font-semibold text-neutral-800">1 · {s.estado === 'activo' ? 'Qué quieres pagar' : 'Elige tu plan'}</h2>
            {(s.radarProCompra || s.mejoras.length > 0) && (
              <div className="flex flex-wrap gap-2 text-sm">
                {([['plan', 'Renovar plan'], ...(s.radarProCompra ? [['radar_pro', 'Agregar Radar PRO']] : []), ...(s.mejoras.length ? [['upgrade', 'Mejorar mi plan']] : [])] as [typeof compra, string][]).map(([c, t]) => (
                  <button key={c} type="button" onClick={() => setCompra(c)}
                    className={`rounded-full border px-3 py-1 ${tipo === c ? 'border-sky-400 bg-sky-50 text-sky-900' : 'border-neutral-200 text-neutral-600'}`}>{t}</button>
                ))}
              </div>
            )}
            {tipo === 'radar_pro' && s.radarProCompra && (
              <div className="rounded-lg border border-lime-200 bg-lime-50 px-3 py-2 text-sm text-neutral-800 space-y-1">
                <p><b>Radar PRO los fines de semana · 1 mes · {fmtUsd(s.radarProCompra.precio)}</b></p>
                <p className="text-xs text-neutral-600">Sellos, filtros, productos nuevos, competencia y tendencias. Precio completo, sin descuento.</p>
                <p className="text-xs text-neutral-600">Cubre del {ddmm(s.radarProCompra.desde)} al {ddmm(s.radarProCompra.hasta)}{s.radarProHasta && s.radarProHasta >= s.radarProCompra.desde && s.radarProHasta === s.radarProCompra.desde ? ' (a continuación del que ya tienes)' : ''}. Puedes agregar otro mes cuando quieras.</p>
              </div>
            )}
            {tipo === 'upgrade' && mej && (
              <div className="space-y-2">
                {s.mejoras.length > 1 && (
                  <div className="flex flex-wrap gap-2 text-sm">
                    {s.mejoras.map(m => (
                      <button key={m.plan} type="button" onClick={() => setMejora(m.plan)}
                        className={`rounded-lg border px-3 py-1 ${mej.plan === m.plan ? 'border-sky-400 bg-sky-50' : 'border-neutral-200'}`}>{m.nombre}</button>
                    ))}
                  </div>
                )}
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm">
                  <p className="font-semibold">Pasar a {mej.nombre} desde hoy</p>
                  <ul className="mt-1 space-y-0.5 text-xs text-neutral-700">
                    {mej.lineas.map((l, i) => (
                      <li key={i} className="flex justify-between gap-3"><span>{l.texto}</span><span className="num whitespace-nowrap">{l.usd < 0 ? '−' : ''}{fmtUsd(Math.abs(l.usd))}</span></li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-neutral-600">Tu plan sigue venciendo el {ddmm(s.vence)}; ahí renuevas ya con {mej.nombre}. Para bajar de plan, elige el otro al renovar.</p>
                </div>
              </div>
            )}
            {tipo === 'plan' && <>
            <p className="text-sm text-neutral-600">
              Con tus <b className="num">{s.ventasMes.toLocaleString('de-DE')}</b> ventas de {s.mes} en MercadoLibre (todas tus cuentas, del 1 al último día)
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
                  <button key={o.id} type="button" onClick={() => { setPlan(o.id) }}
                    className={`text-left rounded-lg border px-3 py-2 ${plan === o.id ? 'border-sky-400 bg-sky-50' : 'border-neutral-200 hover:border-neutral-300'}`}>
                    <p className="text-sm font-semibold">{o.nombre}{s.plan === o.id ? <span className="ml-1 text-xs font-normal text-neutral-500">(tu plan)</span> : null}</p>
                    <p className="text-sm num">{fmtUsd(o.mensual)}<span className="text-xs text-neutral-500">/mes</span></p>
                    <p className="text-xs text-neutral-500 mt-1">{o.resumen}</p>
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2 text-sm">
              {/* 07-11 (Fase 1.3): 1, 3, 6 o 12 meses; el descuento se muestra solo si mejora el de Fundador (no se suman). */}
              {CICLOS_IDS.map(c => {
                const d = CICLOS[c].descuento
                const ver = d > 0 && (!s.fundador || d > DESCUENTO_FUNDADOR)
                return (
                  <button key={c} type="button" onClick={() => setCiclo(c)}
                    className={`rounded-full border px-3 py-1 ${ciclo === c ? 'border-sky-400 bg-sky-50 text-sky-900' : 'border-neutral-200 text-neutral-600'}`}>
                    {c === 'mensual' ? 'Mensual' : CICLOS[c].nombre}{ver && <span className="text-lime-700"> (−{d}%)</span>}
                  </button>
                )
              })}
            </div>
            {op.radar && s.radarPro.regalo && (
              <p className="text-xs text-lime-700">
                Tu primer plan trae <b>1 mes de Radar PRO</b> los fines de semana <b>de regalo</b> (una sola vez). Después cuesta {fmtUsd(s.radarPro.precio)} por mes y lo agregas cuando quieras desde aquí.
              </p>
            )}
            {s.cuentasExtra > 0 && <p className="text-xs text-neutral-500">Incluye {s.cuentasExtra} cuenta(s) de MercadoLibre extra (tienes {s.cuentas}; el plan trae 2).</p>}
            </>}
            <div className="flex items-baseline justify-between border-t border-neutral-100 pt-3">
              <span className="text-sm text-neutral-600">Total a pagar{tipo === 'plan' && ciclo !== 'mensual' ? ` (${CICLOS[ciclo].nombre})` : ''}</span>
              <span className="text-lg font-semibold num">{fmtUsd(total)}</span>
            </div>
          </section>

          <div className="space-y-4">
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
            <div className="text-sm">
              <span className="text-neutral-600">Captura del pago (imagen o PDF)</span>
              {/* El input de archivo sin estilo quedaba invisible (un espacio vacío clickeable): botón visible + nombre. */}
              <label className="mt-1 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-neutral-300 px-3 py-2.5 hover:border-sky-500 hover:bg-sky-50">
                <span className="shrink-0 rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white">📎 Adjuntar captura</span>
                <span className={`truncate ${archivo ? 'text-neutral-900' : 'text-neutral-500'}`}>{archivo ? archivo.name : 'Ningún archivo elegido'}</span>
                <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={e => setArchivo(e.target.files?.[0] ?? null)}
                  className="sr-only" />
              </label>
            </div>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button type="button" onClick={enviar} disabled={enviando}
              className="w-full sm:w-auto rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50">
              {enviando ? 'Enviando…' : `Enviar pago de ${fmtUsd(total)}`}
            </button>
            <p className="text-xs text-neutral-500">Lo confirmamos a mano y te avisamos. Si lo reportas antes de que venza, tu cuenta no se corta mientras lo revisamos.</p>
          </section>
          </div>
        </div>
      )}

      {/* Anteriores */}
      {(s.anteriores.length > 0 || (s.ultimo && s.ultimo.estado !== 'revision')) && (
        <details className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm">
          <summary className="cursor-pointer text-neutral-600">Pagos anteriores</summary>
          <ul className="mt-2 space-y-1">
            {[...(s.ultimo ? [s.ultimo] : []), ...s.anteriores].map(k => (
              <li key={k.id} className="flex flex-wrap justify-between gap-2 border-b border-neutral-100 py-1 last:border-0">
                <span>{ddmm(k.fecha_pago)} · {titulo(k)} · {fmtUsd(k.monto_usd)} · {METODO[k.metodo]} ref. {k.referencia}</span>
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
