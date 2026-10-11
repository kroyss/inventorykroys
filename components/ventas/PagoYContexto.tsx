'use client'
// Ventas → Nueva venta (2026-10-11): el pago de MercadoEnvíos y "lo que se habló" en el mismo
// formulario, para verificar y registrar la venta sin ir a MercadoEnvíos ni a MercadoLibre.
//   - PagoDeVenta: el pago traído por el vigilante (o "no está · última traída · Traer ahora"),
//     el comprobante con su detalle (ventana aparte) y "Pago correcto" (al guardar: pago válido,
//     venta procesada y guía a Despachos).
//   - LoQueSeHablo: botón que abre una ventana aparte con lo ofertado (foto, variante, cantidad,
//     precio), notas, mensajes y preguntas previas; se pide a ML solo al abrirla.
// Las ventanas van por portal al body (dentro del panel lateral, que tiene transform, quedaban
// encajonadas) y se cierran con Esc, con ✕ o tocando afuera.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { PagoME } from '@/lib/pagosMEComun'
import { Monto, VERIF, bs, metodoPago } from '@/components/pagosme/PagoME'

interface Traida { pedido_at: string; trabajando: boolean; terminada_at: string | null; con_error: boolean; no_respondieron?: string[] }

const hora = (s: string | null) => s ? new Date(s).toLocaleString('es-VE', {
  timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit',
}) : '—'

// ── Ventana aparte (comprobante, conversación) ──────────────────────────────
function Ventana({ titulo, subtitulo, onCerrar, pie, ancho = 'max-w-4xl', children }: {
  titulo: string; subtitulo?: ReactNode; onCerrar: () => void; pie?: ReactNode; ancho?: string; children: ReactNode
}) {
  // Esc cierra solo esta ventana (en captura: no llega al formulario de atrás).
  const cerrar = useRef(onCerrar)
  useEffect(() => { cerrar.current = onCerrar })
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); cerrar.current() } }
    document.addEventListener('keydown', h, true)
    return () => document.removeEventListener('keydown', h, true)
  }, [])
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-3 sm:p-6"
      onMouseDown={e => { if (e.target === e.currentTarget) onCerrar() }} role="dialog" aria-modal="true">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${ancho} max-h-[92vh] flex flex-col overflow-hidden`}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-neutral-100">
          <div className="min-w-0">
            <h3 className="font-semibold text-neutral-900">{titulo}</h3>
            {subtitulo && <p className="text-xs text-neutral-500 truncate">{subtitulo}</p>}
          </div>
          <button type="button" onClick={onCerrar} autoFocus aria-label="Cerrar (Esc)" title="Cerrar (Esc)"
            className="shrink-0 rounded-full w-9 h-9 flex items-center justify-center text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 text-lg">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-neutral-100 bg-neutral-50">
          <span className="text-[11px] text-neutral-400">Esc para cerrar</span>
          <div className="flex gap-2">
            <button type="button" onClick={onCerrar} className="btn-secondary text-sm">Cerrar</button>
            {pie}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── El pago ─────────────────────────────────────────────────────────────────
export function PagoDeVenta({ numero, pagoOk, onPagoOk, onPago, puedeVerificar }: {
  numero: string
  pagoOk: boolean
  onPagoOk: (v: boolean) => void
  onPago: (p: PagoME | null) => void
  puedeVerificar: boolean
}) {
  // undefined = buscando · null = sin módulo (no se muestra nada)
  const [datos, setDatos] = useState<{ pago: PagoME | null; traida: Traida | null } | null | undefined>(undefined)
  const [pidiendo, setPidiendo] = useState<number | null>(null)   // hora en que se pidió traer desde aquí
  const [detalle, setDetalle] = useState(false)
  const vivo = useRef(true)
  useEffect(() => () => { vivo.current = false }, [])

  const buscar = useCallback(async () => {
    const r = await fetch(`/api/pagos-me?venta=${encodeURIComponent(numero)}&traida=1`).catch(() => null)
    if (!vivo.current) return null
    const d = r?.ok ? await r.json() : null
    setDatos(d && 'pago' in d ? d : null)
    onPago(d?.pago ?? null)
    return d as { pago: PagoME | null; traida: Traida | null } | null
  }, [numero, onPago])

  useEffect(() => {
    let cancel = false
    const t = setTimeout(() => { if (!cancel) buscar() }, 400)
    return () => { cancel = true; clearTimeout(t) }
  }, [buscar])

  // Traída pedida desde aquí: se consulta cada 5 s hasta que termine (máx. 5 min).
  useEffect(() => {
    if (pidiendo == null) return
    const t = setInterval(async () => {
      const d = await buscar()
      const fin = d?.traida?.terminada_at ? new Date(d.traida.terminada_at).getTime() : 0
      if ((d?.pago) || (d?.traida && !d.traida.trabajando && fin >= pidiendo - 5000) || Date.now() - pidiendo > 300000) setPidiendo(null)
    }, 5000)
    return () => clearInterval(t)
  }, [pidiendo, buscar])

  const traer = async () => {
    const r = await fetch('/api/pagos-me/traer', { method: 'POST' }).catch(() => null)
    if (r?.ok) setPidiendo(Date.now())
  }

  if (datos === null) return null
  if (datos === undefined) return <p className="text-[11px] text-neutral-400">Buscando el pago en Pagos ME…</p>

  const { pago, traida } = datos
  const trayendo = pidiendo != null || !!traida?.trabajando

  if (!pago) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-amber-900">
            {trayendo ? 'Trayendo pagos y guías de MercadoEnvíos…' : 'Este pago no está en Pagos ME'}
          </span>
          <button type="button" onClick={traer} disabled={trayendo} className="btn-secondary text-xs">
            {trayendo ? 'Trayendo… (1–2 min)' : 'Traer pagos ahora'}
          </button>
        </div>
        <p className="text-amber-800/80">
          {trayendo
            ? 'Se traen todos los pagos nuevos de una vez; cuando aparezca este, se muestra aquí solo.'
            : <>Última traída: <b>{traida ? hora(traida.terminada_at ?? traida.pedido_at) : 'nunca'}</b>
              {traida?.con_error && <span className="text-red-700"> (con error: revisa Pagos ME)</span>}
              {!!traida?.no_respondieron?.length && <span className="text-red-700"> ({traida.no_respondieron.join(', ')} no respondió: revisa la PC de Venezuela)</span>}.
              {' '}Si el comprador pagó después, tráelo ahora. Si pagó por otro medio, verifica desde el detalle de la venta como siempre.</>}
        </p>
      </div>
    )
  }

  const v = VERIF[pago.verificacion]
  const invalido = pago.verificacion === 'invalido'
  return (
    <div className={`rounded-xl border text-sm transition-colors ${pagoOk ? 'border-emerald-300 bg-emerald-50/60' : invalido ? 'border-red-200 bg-red-50/50' : 'border-violet-200 bg-violet-50/40'}`}>
      {/* De dónde viene y su estado */}
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
        <span className="text-xs font-medium text-violet-900">
          Pago en MercadoEnvíos{pago.cuenta ? <span className="font-normal text-violet-700/80"> · {pago.cuenta}</span> : null}
        </span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${v.c}`}>{v.t}{pago.verificado_por ? ` · ${pago.verificado_por}` : ''}</span>
      </div>

      {/* Monto y datos del pago */}
      <div className="flex items-center gap-3 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-lg font-semibold text-neutral-900 tabular-nums">{bs(pago.monto_pagado)}</span>
            <Monto p={pago} />
          </div>
          <div className="text-xs text-neutral-600 mt-0.5">
            {metodoPago(pago.metodo_pago)}
            {(pago.banco_emisor || pago.banco_receptor) && <> · {pago.banco_emisor ?? '?'} → {pago.banco_receptor ?? '?'}</>}
            {pago.referencia && <> · Ref <span className="font-mono font-medium text-neutral-800">{pago.referencia}</span></>}
          </div>
        </div>
        <button type="button" onClick={() => setDetalle(true)}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-50">
          <span aria-hidden>🧾</span>{pago.tiene_comprobante ? 'Ver comprobante' : 'Ver detalle'}
        </button>
      </div>

      {/* Verificación */}
      {invalido ? (
        <p className="px-3 pb-2.5 text-xs text-red-700">Este pago se marcó INVÁLIDO en Pagos ME: revísalo antes de seguir.</p>
      ) : puedeVerificar ? (
        <label className={`mx-3 mb-2 flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer select-none transition-colors ${
          pagoOk ? 'border-emerald-400 bg-white' : 'border-neutral-200 bg-white hover:border-emerald-300'}`}>
          <input type="checkbox" checked={pagoOk} onChange={e => onPagoOk(e.target.checked)} className="w-4 h-4 accent-emerald-600 shrink-0" />
          <span className={`text-sm ${pagoOk ? 'text-emerald-800 font-medium' : 'text-neutral-800'}`}>
            Pago correcto <span className="font-normal text-neutral-500">— lo verifiqué contra el banco</span>
          </span>
        </label>
      ) : null}
      <p className="px-3 pb-2.5 text-[11px] text-neutral-500">
        {pagoOk
          ? 'Al guardar: el pago queda verificado, la venta PROCESADA y su guía entra al lote de Despachos.'
          : pago.verificacion === 'valido'
            ? 'Pago ya verificado: al guardar, la venta queda en Pago verificado y su guía entra al lote de Despachos.'
            : 'Sin marcarlo, la guía entra al lote de Despachos pero no se imprime hasta verificar el pago.'}
        {!pago.tiene_guia && ' Todavía no tiene guía en MercadoEnvíos.'}
      </p>
      {detalle && (
        <DetallePago p={pago} onCerrar={() => setDetalle(false)}
          puedeMarcar={puedeVerificar && !invalido && !pagoOk}
          onMarcar={() => { onPagoOk(true); setDetalle(false) }} />
      )}
    </div>
  )
}

/** Comprobante en grande y todo lo que se trajo del pago. */
function DetallePago({ p, onCerrar, puedeMarcar, onMarcar }: {
  p: PagoME; onCerrar: () => void; puedeMarcar: boolean; onMarcar: () => void
}) {
  const [esPdf, setEsPdf] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const url = `/api/pagos-me/${p.id}/archivo?tipo=comprobante`
  const copiar = async () => {
    if (!p.referencia) return
    await navigator.clipboard.writeText(p.referencia).catch(() => {})
    setCopiado(true); setTimeout(() => setCopiado(false), 1500)
  }
  const filas: [string, ReactNode][] = [
    ['Método', metodoPago(p.metodo_pago)],
    ['Bancos', `${p.banco_emisor ?? '?'} → ${p.banco_receptor ?? '?'}`],
    ['Referencia', <>
      <span className="font-mono font-medium">{p.referencia ?? '—'}</span>
      {p.referencia && <button type="button" onClick={copiar} className="ml-2 text-xs text-violet-700 hover:underline">{copiado ? 'copiada ✓' : 'copiar'}</button>}
    </>],
    ['Fecha del pago', p.fecha_pago ?? '—'],
    ['Fecha de la orden', hora(p.fecha_orden)],
    ['Envío', [p.carrier, p.envio_metodo, p.envio_opcion].filter(Boolean).join(' · ') || '—'],
    ['Guía', p.guia ?? (p.tiene_guia ? 'sí' : 'todavía no')],
  ]
  return (
    <Ventana titulo="Comprobante de pago" onCerrar={onCerrar}
      subtitulo={<>Venta <span className="font-mono">{p.venta}</span>{p.cuenta ? ` · ${p.cuenta}` : ''}</>}
      pie={puedeMarcar ? <button type="button" onClick={onMarcar} className="btn-primary text-sm">✓ Pago correcto</button> : null}>
      <div className="grid md:grid-cols-[1fr_20rem] min-h-full">
        <div className="bg-neutral-50 p-4 flex items-start justify-center min-h-[16rem]">
          {p.tiene_comprobante ? (esPdf
            ? <iframe src={url} title="Comprobante" className="w-full h-[68vh] rounded-lg border bg-white" />
            : <a href={url} target="_blank" rel="noreferrer" title="Abrir en otra pestaña">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="Comprobante de pago" onError={() => setEsPdf(true)}
                  className="max-h-[68vh] w-auto max-w-full rounded-lg border bg-white shadow-sm" />
              </a>)
            : <p className="text-sm text-neutral-400 self-center">MercadoEnvíos no trajo imagen del comprobante.</p>}
        </div>
        <div className="p-5 space-y-4">
          <div>
            <div className="text-xs text-neutral-500">Pagado</div>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">{bs(p.monto_pagado)}</span>
              <Monto p={p} />
            </div>
            <div className="text-xs text-neutral-500">Total de la orden: {bs(p.total_orden)}</div>
          </div>
          <dl>
            {filas.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3 py-1.5 border-b border-neutral-100 last:border-0">
                <dt className="text-xs text-neutral-500 shrink-0">{k}</dt>
                <dd className="text-sm text-neutral-900 text-right min-w-0 break-words">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Ventana>
  )
}

// ── Lo que se habló ─────────────────────────────────────────────────────────
interface Contexto {
  cuenta: string | null
  items: { id: string; titulo: string; variante: string | null; cantidad: number; precio: number | null; moneda: string | null; imagen: string | null; link: string | null }[]
  total: number | null; moneda: string | null
  notas: string[]
  mensajes: { propio: boolean; texto: string; fecha: string }[]
  preguntas: { id: string; item_titulo: string | null; texto: string; respuesta: string | null; fecha: string }[]
}

const plano = (t: string) => t.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
const precio = (n: number | null, m: string | null) =>
  n == null ? '' : `${m === 'VES' ? 'Bs' : m === 'COP' ? '$' : 'US$'} ${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function LoQueSeHablo({ numero }: { numero: string }) {
  const [abierto, setAbierto] = useState(false)
  const [ctx, setCtx] = useState<Contexto | null | undefined>(undefined)   // undefined = sin pedir
  const [cargando, setCargando] = useState(false)

  const abrir = async () => {
    setAbierto(true)
    if (ctx !== undefined || cargando) return
    setCargando(true)
    const r = await fetch(`/api/sales/ml-orden/contexto?numero=${encodeURIComponent(numero)}`).catch(() => null)
    setCtx(r?.ok ? await r.json() : null)
    setCargando(false)
  }

  return (
    <>
      <button type="button" onClick={abrir}
        className="w-full flex items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-left hover:border-sky-300 hover:bg-sky-50/40 transition-colors">
        <span className="text-sm font-medium text-neutral-800">💬 Lo que se habló en MercadoLibre</span>
        <span className="text-xs text-sky-700">Ver producto ofertado, notas y mensajes →</span>
      </button>
      {abierto && (
        <Ventana titulo="Lo que se habló en MercadoLibre" ancho="max-w-2xl" onCerrar={() => setAbierto(false)}
          subtitulo={<>Venta <span className="font-mono">{numero}</span>{ctx?.cuenta ? ` · ${ctx.cuenta}` : ''}</>}>
          <div className="p-5 space-y-5 text-sm">
            {cargando || ctx === undefined ? <p className="text-neutral-400">Buscando en MercadoLibre…</p>
              : ctx === null ? <p className="text-neutral-500">No se pudo traer de MercadoLibre.</p>
              : <>
                <section className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Lo que ofertó</h4>
                  {ctx.items.map((i, k) => (
                    <div key={k} className="flex items-center gap-3 rounded-lg border border-neutral-200 p-2">
                      <div className="w-14 h-14 shrink-0 rounded-md border border-neutral-200 bg-white overflow-hidden flex items-center justify-center">
                        {i.imagen
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={i.imagen} alt="" loading="lazy" className="w-full h-full object-contain" />
                          : <span className="text-neutral-300">—</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-neutral-900">
                          <b>{i.cantidad} ×</b>{' '}
                          {i.link ? <a href={i.link} target="_blank" rel="noreferrer" className="hover:underline">{i.titulo} ↗</a> : i.titulo}
                        </div>
                        <div className="text-xs text-neutral-500 mt-0.5">
                          {i.variante && <span className="inline-block rounded bg-sky-50 border border-sky-100 px-1.5 py-0.5 font-medium text-sky-900 mr-2">{i.variante}</span>}
                          {i.precio != null && <span>{precio(i.precio, i.moneda)} c/u</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                  {ctx.total != null && <div className="text-right text-xs text-neutral-600">Total de la orden: <b>{precio(ctx.total, ctx.moneda)}</b></div>}
                </section>

                <section className="space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Notas de la venta</h4>
                  {ctx.notas.length
                    ? ctx.notas.map((n, k) => <div key={k} className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-amber-900">{n}</div>)
                    : <p className="text-neutral-400">Sin notas.</p>}
                </section>

                <section className="space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Últimos mensajes</h4>
                  {ctx.mensajes.length ? (
                    <div className="space-y-1.5">
                      {ctx.mensajes.map((m, k) => (
                        <div key={k} className={`rounded-lg px-3 py-2 max-w-[85%] ${m.propio ? 'ml-auto bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-900'}`}>
                          {plano(m.texto)}
                          <div className={`text-[10px] mt-0.5 ${m.propio ? 'text-neutral-400' : 'text-neutral-500'}`}>
                            {m.propio ? 'Tú' : 'Comprador'} · {hora(m.fecha)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-neutral-400">Sin mensajes.</p>}
                </section>

                {ctx.preguntas.length > 0 && (
                  <section className="space-y-1.5">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Preguntó antes de comprar</h4>
                    {ctx.preguntas.slice(0, 5).map(p => (
                      <div key={p.id} className="rounded-lg border border-neutral-200 px-3 py-2">
                        <div className="text-neutral-900">“{p.texto}”</div>
                        {p.item_titulo && <div className="text-[11px] text-neutral-400">{p.item_titulo}</div>}
                        {p.respuesta && <div className="text-xs text-neutral-600 mt-1">↳ {p.respuesta}</div>}
                      </div>
                    ))}
                  </section>
                )}
              </>}
          </div>
        </Ventana>
      )}
    </>
  )
}
