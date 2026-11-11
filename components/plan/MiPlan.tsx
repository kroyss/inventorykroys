'use client'

// Mi plan (02-11-2026, migración 141): el cliente ve su estado y lo que paga según sus ventas, paga por Pago Móvil o
// Binance, adjunta la captura y la referencia, y sigue el estado de su pago. El dueño lo aprueba en Plataforma → Cobros.
// `acceso`: entra desde /renovar (cuenta vencida, sin sesión) con el acceso firmado de /api/mi-plan/entrar.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CobroFila, SituacionPlan } from '@/lib/cobros'
import { PLANES_PROXIMAMENTE, RECARGAS_IA } from '@/lib/planes'
import QueEsRadar from './QueEsRadar'

const fmtUsd = (n: number) => `$${n.toLocaleString('de-DE', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
const fmtBs = (n: number) => `Bs ${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const r2 = (n: number) => Math.round(n * 100) / 100
const ddmm = (f: string | null) => f ? f.split('-').reverse().join('/') : '—'
const TIPOS_CAPTURA = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']

// 12-11 (el dueño): pasos con número en círculo, como una página de pago.
function Titulo({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2.5 text-[15px] font-semibold text-neutral-900">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-700 text-xs font-bold text-white">{n}</span>
      {children}
    </h2>
  )
}
// Suma meses a YYYY-MM-DD (como sumarMeses del servidor): para mostrar hasta cuándo valen los créditos del plan.
const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const NOMBRE_PLAN: Record<string, string> = { esencial: 'Esencial', automatizaciones: 'Automatizaciones', completo: 'Completo' }
const METODO: Record<string, string> = { pago_movil: 'Pago Móvil', binance: 'Binance' }
const titulo = (k: CobroFila) => k.tipo === 'radar_mes' ? 'Radar mensual (PRO todos los días)' : k.tipo === 'recarga' ? 'Recarga de créditos de IA' : k.tipo === 'radar_pro' ? 'Radar PRO (1 mes)' : k.tipo === 'upgrade' ? `Cambio a ${NOMBRE_PLAN[k.plan] ?? k.plan}` : (NOMBRE_PLAN[k.plan] ?? k.plan)

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
  const [ciclo, setCiclo] = useState<'mensual' | 'trimestral'>('mensual')
  // 12-11 (el dueño): Radar PRO junto con el plan, los meses que no cubre el regalo (1er mes gratis, los demás se pagan).
  const [conPro, setConPro] = useState(false)
  // 06-11 (Plan A/B): qué paga — renovar el plan, 1 mes de Radar PRO aparte o pasar a un plan mejor.
  const [compra, setCompra] = useState<'plan' | 'radar_pro' | 'upgrade' | 'recarga' | 'radar_mes'>('plan')
  const [paquete, setPaquete] = useState(0)
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

  // Captura: botón, arrastrar o pegar (Ctrl+V), con vista previa antes de enviar (12-11).
  const [arrastrando, setArrastrando] = useState(false)
  const tomarArchivo = useCallback((f: File | null | undefined) => {
    if (!f) return
    if (!TIPOS_CAPTURA.includes(f.type)) { setError('La captura debe ser una imagen (PNG, JPG) o un PDF'); return }
    setError(null); setArchivo(f)
  }, [])
  const vista = useMemo(() => (archivo?.type.startsWith('image/') ? URL.createObjectURL(archivo) : null), [archivo])
  useEffect(() => () => { if (vista) URL.revokeObjectURL(vista) }, [vista])
  useEffect(() => {
    const pegar = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? [])[0]
      if (f) { e.preventDefault(); tomarArchivo(f) }
    }
    window.addEventListener('paste', pegar)
    return () => window.removeEventListener('paste', pegar)
  }, [tomarArchivo])

  if (error && !s) return <p className="text-sm text-red-700">{error}</p>
  if (!s) return <p className="text-sm text-neutral-500">Cargando tu plan…</p>

  const op = s.opciones.find(o => o.id === plan) ?? s.opciones[0]
  const mej = s.mejoras.find(m => m.plan === mejora) ?? s.mejoras[0]
  // 09-11 (mig. 157): recargas de créditos de IA, en prueba o con plan activo.
  const puedeRecargar = s.estado !== 'vencido'
  // 09-11 (mig. 159): cuenta de SOLO Radar → lo único que paga es el Radar mensual.
  const tipo = s.soloRadar ? 'radar_mes' : compra === 'radar_pro' && s.radarProCompra ? 'radar_pro' : compra === 'upgrade' && mej ? 'upgrade'
    : compra === 'recarga' && puedeRecargar ? 'recarga' : 'plan'
  const pq = RECARGAS_IA[paquete] ?? RECARGAS_IA[0]
  const mesesPro = op.radar ? (s.radarPro.regalo ? (ciclo === 'trimestral' ? 2 : 0) : (ciclo === 'trimestral' ? 3 : 1)) : 0
  const pro = tipo === 'plan' && conPro && mesesPro > 0 ? s.radarPro.precio * mesesPro : 0
  const total = pro + (tipo === 'radar_mes' ? s.radarMes.precio : tipo === 'recarga' ? pq.precio : tipo === 'radar_pro' ? s.radarProCompra!.precio : tipo === 'upgrade' ? mej!.monto
    : Math.round((ciclo === 'trimestral' ? op.trimestral : op.mensual) * 100) / 100)
  const bs = s.tasaBcv ? Math.round(total * s.tasaBcv * 100) / 100 : null
  const enRevision = s.ultimo?.estado === 'revision'
  const comprobante = (k: CobroFila) => `/api/mi-plan/comprobante/${k.id}${acceso ? `?acceso=${encodeURIComponent(acceso)}` : ''}`
  // Precio por mes según el ciclo elegido y lo que se ahorra con el trimestral (Fundadores: su −30% ya está en el mensual).
  const porMes = (o: { mensual: number; trimestral: number }) => r2(ciclo === 'trimestral' ? o.trimestral / 3 : o.mensual)
  const ahorro = r2(op.mensual * 3 - op.trimestral)
  const pctAhorro = op.mensual > 0 ? Math.round(ahorro / (op.mensual * 3) * 100) : 0
  const meses = ciclo === 'trimestral' ? 3 : 1
  const descCiclo = op.desc[ciclo]
  // Fundador: su −30% es mayor que el −10% del trimestral (no se suman), así que el que aplica es el suyo.
  const esDescFundador = s.fundador && descCiclo === op.desc.mensual && descCiclo > 0
  const listaMes = r2(op.base + op.extrasMes)
  // Resumen tipo factura: de dónde sale el total (12-11).
  const lineas: { t: string; usd: number }[] =
    tipo === 'radar_mes' ? [{ t: 'Radar PRO todos los días · 1 mes', usd: s.radarMes.precio }]
    : tipo === 'recarga' ? [{ t: `${pq.creditos.toLocaleString('de-DE')} créditos de IA`, usd: pq.precio }]
    : tipo === 'radar_pro' ? [{ t: 'Radar PRO fines de semana · 1 mes', usd: s.radarProCompra!.precio }]
    : tipo === 'upgrade' ? [{ t: `Cambio a ${mej!.nombre} hasta el ${ddmm(s.vence)}`, usd: mej!.monto }]
    : [
        // Las mismas líneas que se guardan en Plataforma → Cobros (desglosePlan): lista, descuento (solo el plan), cuentas extra.
        { t: `${op.nombre} · ${fmtUsd(op.base)}/mes × ${meses} ${meses === 1 ? 'mes' : 'meses'}`, usd: r2(op.base * meses) },
        ...(descCiclo > 0 ? [{ t: `Descuento ${esDescFundador ? 'Fundador' : 'trimestral'} −${descCiclo}%`, usd: -r2(op.base * meses * descCiclo / 100) }] : []),
        ...(op.extrasMes > 0 ? [{ t: `${s.cuentasExtra} cuenta${s.cuentasExtra === 1 ? '' : 's'} de ML extra × ${meses} ${meses === 1 ? 'mes' : 'meses'}`, usd: r2(op.extrasMes * meses) }] : []),
        ...(pro > 0 ? [{ t: `Radar PRO ${mesesPro === 1 ? '· 1 mes' : `× ${mesesPro} meses`}`, usd: pro }] : []),
      ]
  // Días que le quedan a la prueba o al plan (ámbar con 3 o menos).
  const dias = s.vence && !s.soloRadar && s.estado !== 'vencido' ? Math.round((Date.parse(s.vence) - Date.parse(hoyLocal())) / 864e5) : null
  const textoDias = dias == null ? null : dias <= 0 ? 'vence hoy' : dias === 1 ? 'queda 1 día' : `quedan ${dias} días`

  const enviar = async () => {
    setError(null)
    if (referencia.trim().length < 3) { setError(metodo === 'binance' ? 'Escribe el ID de la orden de Binance' : 'Escribe la referencia del pago'); return }
    if (!archivo) { setError('Adjunta la captura del pago'); return }
    setEnviando(true)
    const f = new FormData()
    f.set('tipo', tipo); f.set('plan', tipo === 'upgrade' ? mej!.plan : plan); f.set('ciclo', ciclo); f.set('metodo', metodo)
    if (tipo === 'recarga') f.set('paquete', String(paquete))
    if (pro > 0) f.set('radar_pro', '1')
    f.set('referencia', referencia.trim()); f.set('fecha_pago', fecha); f.set('archivo', archivo)
    const r = await fetch('/api/mi-plan', { method: 'POST', headers, body: f }).catch(() => null)
    setEnviando(false)
    if (!r?.ok) { setError(r ? ((await r.json().catch(() => ({}))).error ?? 'No se pudo enviar') : 'Sin conexión: vuelve a intentar'); return }
    setReferencia(''); setArchivo(null)
    await cargar()
  }

  const estadoTexto = s.soloRadar
    ? (s.radarMes.hasta ? <>Radar PRO activo hasta el <b>{ddmm(s.radarMes.hasta)}</b>. Puedes pagar el mes siguiente cuando quieras.</>
      : <>Tu Radar no está activo. Paga 1 mes para entrar con <b>Radar PRO todos los días</b>.</>)
    : s.estado === 'activo' ? <>Plan <b>{NOMBRE_PLAN[s.plan ?? ''] ?? s.plan}</b> activo hasta el <b>{ddmm(s.vence)}</b></>
    : s.estado === 'prueba' ? <>Prueba gratis hasta el <b>{ddmm(s.vence)}</b></>
    : <>Tu {s.plan ? 'plan' : 'prueba gratis'} venció{s.vence ? <> el <b>{ddmm(s.vence)}</b></> : null}. Paga para reactivar tu cuenta: tus datos se conservan.</>

  return (
    <div className="space-y-4">
      {/* Estado */}
      <section className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border px-4 py-3 text-sm shadow-sm ${s.estado === 'vencido' && !s.soloRadar ? 'bg-red-50 border-red-200 text-red-900' : 'bg-white border-neutral-200 text-neutral-800'}`}>
        <span>{estadoTexto}</span>
        {textoDias && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${dias! <= 3 ? 'bg-amber-100 text-amber-900' : 'bg-neutral-100 text-neutral-600'}`}>{textoDias}</span>
        )}
        {s.fundador && <span className="text-xs bg-lime-100 text-lime-800 rounded-full px-2.5 py-0.5 font-semibold">Fundador −30%</span>}
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

      {!enRevision && !s.conectadas && !s.soloRadar && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Primero conecta tu cuenta de MercadoLibre</p>
          <p className="mt-1">Tu plan se calcula con las ventas de tus cuentas de ML.{acceso ? '' : <> Conéctala en <a href="/cuentas-ml" className="underline">Cuentas de ML</a> y vuelve aquí.</>}</p>
        </section>
      )}

      {!enRevision && (s.conectadas > 0 || s.soloRadar) && (
        // 06-11 (el dueño): en pantalla ancha, a la izquierda el plan y a la derecha cómo pagar (antes una columna angosta).
        <div className="grid gap-4 lg:grid-cols-2 items-start">
          {/* 1 · Lo que te toca */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 shadow-sm space-y-4">
            <Titulo n={1}>{s.soloRadar ? 'Tu Radar' : s.estado === 'activo' ? 'Qué quieres pagar' : 'Elige tu plan'}</Titulo>
            {s.soloRadar && (
              <div className="space-y-2">
                <div className="rounded-lg border border-lime-200 bg-lime-50 px-3 py-2 text-sm text-neutral-800 space-y-1">
                  <p className="flex flex-wrap items-baseline justify-between gap-2">
                    <b>Radar PRO todos los días · 1 mes</b>
                    <span className="num">{s.radarMes.promo && <s className="mr-1.5 text-neutral-500">{fmtUsd(s.radarMes.lista)}</s>}<b>{fmtUsd(s.radarMes.precio)}</b></span>
                  </p>
                  {s.radarMes.promo && <p className="text-xs font-semibold text-lime-800">{s.radarMes.promo}</p>}
                  <p className="text-xs text-neutral-600">Catálogo completo con lo nuevo del mes, sellos, techo de ganancia, todos los filtros, Competencia y Tendencias.</p>
                  <p className="text-xs text-neutral-600">Cubre del {ddmm(s.radarMes.desde)} al {ddmm(s.radarMes.nuevoHasta)}{s.radarMes.hasta ? ' (a continuación del que ya tienes)' : ''}. Se activa cuando confirmamos el pago.</p>
                </div>
                <p className="text-xs text-neutral-500">¿Además quieres automatizar tus ventas de MercadoLibre? Mira los planes en <a href="/precios" target="_blank" className="text-sky-700 hover:underline">elcomerciantedigital.com/precios</a>.</p>
              </div>
            )}
            {!s.soloRadar && (s.radarProCompra || s.mejoras.length > 0 || puedeRecargar) && (
              <div className="flex flex-wrap gap-2 text-sm">
                {([['plan', s.estado === 'activo' ? 'Renovar plan' : 'Plan'], ...(s.radarProCompra ? [['radar_pro', 'Agregar Radar PRO']] : []), ...(s.mejoras.length ? [['upgrade', 'Mejorar mi plan']] : []), ...(puedeRecargar ? [['recarga', 'Créditos de IA']] : [])] as [typeof compra, string][]).map(([c, t]) => (
                  <button key={c} type="button" onClick={() => setCompra(c)}
                    className={`rounded-full border px-3 py-1 ${tipo === c ? 'border-sky-400 bg-sky-50 text-sky-900' : 'border-neutral-200 text-neutral-600'}`}>{t}</button>
                ))}
              </div>
            )}
            {tipo === 'recarga' && (
              <div className="space-y-2">
                {s.saldoIA != null && <p className="text-sm text-neutral-800">Te quedan <b className="num">{s.saldoIA.toLocaleString('de-DE')} créditos</b>.</p>}
                <p className="text-sm text-neutral-600">1 crédito = 1 respuesta de la IA (pregunta o mensaje). <b>No vencen</b> y se suman a los que tengas.</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {RECARGAS_IA.map((r, i) => (
                    <button key={r.creditos} type="button" onClick={() => setPaquete(i)}
                      className={`text-left rounded-lg border px-3 py-2 ${paquete === i ? 'border-sky-400 bg-sky-50' : 'border-neutral-200 hover:border-neutral-300'}`}>
                      <p className="text-sm font-semibold num">{r.creditos.toLocaleString('de-DE')} créditos</p>
                      <p className="text-sm num">{fmtUsd(r.precio)}</p>
                      <p className="text-xs text-neutral-500">{fmtUsd(r2(r.precio / r.creditos * 100))} cada 100</p>
                    </button>
                  ))}
                </div>
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
              <div className="flex items-start justify-between gap-3 rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-neutral-900">{op.nombre}</p>
                  <p className="mt-0.5 text-xs text-neutral-600">{op.resumen}</p>
                  <button type="button" onClick={() => setCambiarPlan(true)} className="mt-1.5 text-xs font-medium text-sky-700 hover:underline">Cambiar plan</button>
                </div>
                <div className="shrink-0 text-right">
                  {porMes(op) < listaMes && <s className="block text-xs text-neutral-400 num">{fmtUsd(listaMes)}</s>}
                  <p className="num"><span className="text-xl font-bold text-neutral-900">{fmtUsd(porMes(op))}</span><span className="text-xs text-neutral-500">/mes</span></p>
                  {esDescFundador && <span className="mt-0.5 inline-block rounded-full bg-lime-100 px-2 py-0.5 text-[10px] font-semibold text-lime-800">−{descCiclo}% Fundador</span>}
                </div>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-3">
                {s.opciones.map(o => {
                  const pronto = PLANES_PROXIMAMENTE.includes(o.id)
                  return (
                  <button key={o.id} type="button" disabled={pronto} onClick={() => { setPlan(o.id) }} aria-disabled={pronto}
                    className={`relative text-left rounded-xl border-2 px-3 py-2.5 transition ${pronto ? 'cursor-not-allowed border-neutral-200 bg-neutral-50 opacity-60' : plan === o.id ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-100' : 'border-neutral-200 hover:border-neutral-300'}`}>
                    {pronto && <span className="absolute -top-2.5 right-2 rounded-full bg-neutral-500 px-2 py-0.5 text-[10px] font-bold text-white">Próximamente</span>}
                    <p className="text-sm font-semibold">{o.nombre}{s.plan === o.id ? <span className="ml-1 text-xs font-normal text-neutral-500">(tu plan)</span> : null}</p>
                    <p className="num"><span className="text-base font-bold">{fmtUsd(porMes(o))}</span><span className="text-xs text-neutral-500">/mes</span></p>
                    <p className="text-xs text-neutral-500 mt-1">{o.resumen}</p>
                  </button>
                  )
                })}
              </div>
            )}
            {/* Mensual o trimestral (12-11): dos tarjetas con el precio por mes y lo que se ahorra. */}
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Cada cuánto pagas">
              {(['mensual', 'trimestral'] as const).map(c => {
                const sel = ciclo === c
                const pm = r2(c === 'trimestral' ? op.trimestral / 3 : op.mensual)
                return (
                  <button key={c} type="button" role="radio" aria-checked={sel} onClick={() => setCiclo(c)}
                    className={`relative rounded-xl border-2 px-3 py-2.5 text-left transition ${sel ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-100' : 'border-neutral-200 bg-white hover:border-neutral-300'}`}>
                    {c === 'trimestral' && ahorro > 0 && (
                      <span className="absolute -top-2.5 right-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">−{pctAhorro}%</span>
                    )}
                    <p className={`text-xs font-semibold ${sel ? 'text-sky-800' : 'text-neutral-500'}`}>{c === 'mensual' ? 'Mensual' : 'Trimestral'}</p>
                    <p className="num">
                      {pm < listaMes && <s className="mr-1 text-xs text-neutral-400">{fmtUsd(listaMes)}</s>}
                      <span className="text-lg font-bold text-neutral-900">{fmtUsd(pm)}</span><span className="text-xs text-neutral-500">/mes</span>
                    </p>
                    <p className="text-[11px] leading-snug text-neutral-500">
                      {c === 'mensual'
                        ? (s.fundador && op.desc.mensual > 0 ? <>Pagas mes a mes · <span className="font-semibold text-lime-700">−{op.desc.mensual}% Fundador</span></> : 'Pagas mes a mes')
                        : <>{fmtUsd(op.trimestral)} cada 3 meses{ahorro > 0
                          ? <> · <span className="font-semibold text-emerald-700">ahorras {fmtUsd(ahorro)}</span></>
                          : esDescFundador ? <> · <span className="font-semibold text-lime-700">−{op.desc.trimestral}% Fundador</span></> : null}</>}
                    </p>
                  </button>
                )
              })}
            </div>
            {/* Regalos del primer plan (créditos de IA, mig. 156 · 1 mes de Radar PRO) en un solo bloque. */}
            {(s.creditosPrimerPlan > 0 || (op.radar && s.radarPro.regalo)) && (
              <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-lime-50 px-4 py-3">
                <p className="text-xs font-semibold text-emerald-900">🎁 Tu primer plan incluye de regalo</p>
                <ul className="mt-1.5 space-y-1 text-xs text-neutral-700">
                  {s.creditosPrimerPlan > 0 && (
                    <li className="flex gap-1.5"><span className="text-emerald-600">✓</span><span><b className="num">{s.creditosPrimerPlan.toLocaleString('de-DE')} créditos de IA</b> · no vencen y se suman a los que tengas</span></li>
                  )}
                  {op.radar && s.radarPro.regalo && (
                    <li className="flex gap-1.5"><span className="text-emerald-600">✓</span><span><b>1 mes de Radar PRO</b> los fines de semana · <QueEsRadar /></span></li>
                  )}
                </ul>
                {op.radar && s.radarPro.regalo && (
                  <p className="mt-1.5 text-[11px] text-neutral-500">Después, Radar PRO cuesta {fmtUsd(s.radarPro.precio)} por mes{mesesPro > 0 ? ': puedes sumarlo abajo' : ''} o agregarlo cuando quieras en «Agregar Radar PRO».</p>
                )}
              </div>
            )}
            {mesesPro > 0 && (
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 px-4 py-3 text-sm transition ${conPro ? 'border-lime-500 bg-lime-50' : 'border-neutral-200 hover:border-lime-300'}`}>
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-lime-600" checked={conPro} onChange={e => setConPro(e.target.checked)} />
                <span className="flex-1 text-neutral-800">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span>Sumar <b>Radar PRO</b> {s.radarPro.regalo ? (mesesPro === 2 ? 'los meses 2 y 3' : '') : mesesPro === 1 ? 'este mes' : `los ${mesesPro} meses`}</span>
                    <b className="num">+{fmtUsd(s.radarPro.precio * mesesPro)}</b>
                  </span>
                  <span className="block text-xs text-neutral-500">{s.radarPro.regalo ? 'El mes 1 es de regalo. ' : ''}{fmtUsd(s.radarPro.precio)} por mes, sin descuento: Radar PRO los fines de semana. <QueEsRadar /></span>
                </span>
              </label>
            )}
            {s.cuentasExtra > 0 && <p className="text-xs text-neutral-500">Incluye {s.cuentasExtra} cuenta(s) de MercadoLibre extra (tienes {s.cuentas}; el plan trae 2).</p>}
            </>}
            {/* Resumen tipo factura (12-11): de dónde sale el total. */}
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Resumen</p>
              <ul className="mt-1.5 space-y-1 text-sm">
                {lineas.map((l, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="text-neutral-600">{l.t}</span>
                    <span className={`num whitespace-nowrap ${l.usd < 0 ? 'font-medium text-emerald-700' : 'text-neutral-800'}`}>{l.usd < 0 ? '−' : ''}{fmtUsd(Math.abs(l.usd))}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-end justify-between gap-3 border-t border-neutral-200 pt-2">
                <span className="text-sm font-semibold text-neutral-800">Total a pagar{tipo === 'plan' && ciclo === 'trimestral' ? ' (3 meses)' : ''}</span>
                <span className="text-right">
                  <span className="block text-2xl font-bold text-neutral-900 num">{fmtUsd(total)}</span>
                  {bs && <span className="block text-xs text-neutral-500 num">≈ {fmtBs(bs)} a tasa BCV</span>}
                </span>
              </div>
            </div>
            {/* 12-11 (el dueño): el Fundador conserva el −30% mientras renueve a tiempo (lib/planesCuenta.ts lo quita al pausarse). */}
            {tipo === 'plan' && esDescFundador && (
              <p className="text-[11px] leading-snug text-neutral-400">
                <b className="font-semibold text-neutral-500">Importante:</b> Conservas tu −{descCiclo}% Fundador mientras renueves a tiempo. Si tu plan vence sin pago, dejas de ser Fundador y pierdes el beneficio.
              </p>
            )}
          </section>

          <div className="space-y-4">
          {/* 2 · Paga */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 shadow-sm space-y-4">
            <Titulo n={2}>Paga</Titulo>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1 text-sm" role="radiogroup" aria-label="Cómo pagas">
              {(['pago_movil', 'binance'] as const).map(m => (
                <button key={m} type="button" role="radio" aria-checked={metodo === m} onClick={() => setMetodo(m)}
                  className={`rounded-lg px-3 py-1.5 font-medium transition ${metodo === m ? 'bg-white text-sky-800 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}>{METODO[m]}</button>
              ))}
            </div>
            {/* El monto exacto, grande y con copiar (12-11). */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
              <div>
                <p className="text-xs font-medium text-sky-800">Monto a pagar</p>
                <p className="text-2xl font-bold text-sky-950 num">
                  {metodo === 'pago_movil' ? (bs ? fmtBs(bs) : 'Sin tasa BCV hoy') : `${total} ${s.datos.binance.moneda}`}
                </p>
                {metodo === 'pago_movil' && bs && s.tasaBcv && (
                  <p className="text-[11px] text-sky-800/70 num">{fmtUsd(total)} × tasa BCV {s.tasaBcv.toLocaleString('de-DE', { maximumFractionDigits: 2 })}</p>
                )}
              </div>
              {(metodo === 'binance' || bs) && <Copiar texto={metodo === 'pago_movil' ? fmtBs(bs!).replace(/^Bs /, '') : String(total)} />}
            </div>
            {metodo === 'pago_movil' ? (
              <div>
                <Dato etiqueta="Banco" valor={s.datos.pago_movil.banco} copiar={false} />
                <Dato etiqueta="Teléfono" valor={s.datos.pago_movil.telefono} />
                <Dato etiqueta="Cédula" valor={s.datos.pago_movil.cedula} />
              </div>
            ) : (
              <div>
                <Dato etiqueta="Binance Pay ID" valor={s.datos.binance.id} />
                <Dato etiqueta="Nombre" valor={s.datos.binance.nombre} copiar={false} />
                <Dato etiqueta="Correo" valor={s.datos.binance.correo} />
                <p className="text-xs text-neutral-500 py-1">Solo {s.datos.binance.moneda}.</p>
              </div>
            )}
          </section>

          {/* 3 · Ya pagué */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 shadow-sm space-y-4">
            <Titulo n={3}>Ya pagué</Titulo>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="text-neutral-600">{metodo === 'binance' ? 'ID de la orden (Binance)' : 'Referencia del pago'}</span>
                <input value={referencia} onChange={e => setReferencia(e.target.value)} maxLength={80}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100" placeholder={metodo === 'binance' ? 'Ej.: 3189...' : 'Ej.: 001234'} />
              </label>
              <label className="text-sm">
                <span className="text-neutral-600">Fecha del pago</span>
                <input type="date" value={fecha} max={hoyLocal()} onChange={e => setFecha(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100" />
              </label>
            </div>
            <div className="text-sm">
              <span className="text-neutral-600">Captura del pago (imagen o PDF)</span>
              {archivo ? (
                // Vista previa antes de enviar: así no se manda la imagen equivocada.
                <div className="mt-1 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
                  {vista
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={vista} alt="Captura elegida" className="h-14 w-14 shrink-0 rounded-lg border border-neutral-200 bg-white object-cover" />
                    : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-xl">📄</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-neutral-900">{archivo.name}</span>
                    <span className="text-xs text-emerald-700">✓ Lista para enviar</span>
                  </span>
                  <label className="cursor-pointer text-xs font-medium text-sky-700 hover:underline">
                    Cambiar
                    <input type="file" accept={TIPOS_CAPTURA.join(',')} onChange={e => { tomarArchivo(e.target.files?.[0]); e.target.value = '' }} className="sr-only" />
                  </label>
                  <button type="button" onClick={() => setArchivo(null)} className="text-xs text-neutral-500 hover:text-red-700" aria-label="Quitar captura">Quitar</button>
                </div>
              ) : (
                <label
                  onDragOver={e => { e.preventDefault(); setArrastrando(true) }}
                  onDragLeave={() => setArrastrando(false)}
                  onDrop={e => { e.preventDefault(); setArrastrando(false); tomarArchivo(e.dataTransfer.files?.[0]) }}
                  className={`mt-1 flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-3 py-4 text-center transition ${arrastrando ? 'border-sky-500 bg-sky-50' : 'border-neutral-300 hover:border-sky-400 hover:bg-sky-50/50'}`}>
                  <span className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white">📎 Adjuntar captura</span>
                  <span className="text-xs text-neutral-500">o arrástrala aquí · también puedes pegarla con Ctrl+V</span>
                  <input type="file" accept={TIPOS_CAPTURA.join(',')} onChange={e => { tomarArchivo(e.target.files?.[0]); e.target.value = '' }} className="sr-only" />
                </label>
              )}
            </div>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button type="button" onClick={enviar} disabled={enviando}
              className="w-full rounded-xl bg-sky-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-800 disabled:opacity-50">
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
