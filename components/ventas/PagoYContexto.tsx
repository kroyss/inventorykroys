'use client'
// Ventas → Nueva venta (2026-10-11): el pago de MercadoEnvíos y "lo que se habló" en el mismo
// formulario, para verificar y registrar la venta sin ir a MercadoEnvíos ni a MercadoLibre.
//   - PagoDeVenta: el pago traído por el vigilante (o "no está · última traída · Traer ahora"),
//     el detalle completo con el comprobante, y "✓ Pago correcto" (al guardar: pago válido, venta
//     procesada y guía a Despachos).
//   - LoQueSeHablo: lo ofertado (foto, variante, cantidad, precio), notas, mensajes y preguntas
//     previas; se pide a ML solo al abrirlo.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { PagoME } from '@/lib/pagosMEComun'
import { Monto, VERIF, bs, metodoPago } from '@/components/pagosme/PagoME'

interface Traida { pedido_at: string; trabajando: boolean; terminada_at: string | null; con_error: boolean; no_respondieron?: string[] }

const hora = (s: string | null) => s ? new Date(s).toLocaleString('es-VE', {
  timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit',
}) : '—'

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

  // Traída pedida desde aquí: se consulta cada 5 s hasta que termine (máx. 4 min).
  useEffect(() => {
    if (pidiendo == null) return
    const t = setInterval(async () => {
      const d = await buscar()
      const fin = d?.traida?.terminada_at ? new Date(d.traida.terminada_at).getTime() : 0
      if ((d?.pago) || (d?.traida && !d.traida.trabajando && fin >= pidiendo - 5000) || Date.now() - pidiendo > 240000) setPidiendo(null)
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
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium text-amber-900">
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
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs space-y-1.5 ${pagoOk ? 'border-emerald-300 bg-emerald-50/70' : 'border-violet-200 bg-violet-50/60'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-violet-900">Pago en MercadoEnvíos{pago.cuenta ? ` (${pago.cuenta})` : ''}</span>
        <span className={`px-2 py-0.5 rounded-full ${v.c}`}>{v.t}{pago.verificado_por ? ` · ${pago.verificado_por}` : ''}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-neutral-700">
        <span>{metodoPago(pago.metodo_pago)}</span>
        {(pago.banco_emisor || pago.banco_receptor) && <span>{pago.banco_emisor ?? '?'} → {pago.banco_receptor ?? '?'}</span>}
        {pago.referencia && <span>Ref <b className="font-mono">{pago.referencia}</b></span>}
        <span><b>{bs(pago.monto_pagado)}</b></span>
        <Monto p={pago} />
        <button type="button" onClick={() => setDetalle(true)} className="underline text-violet-800">
          {pago.tiene_comprobante ? 'Ver comprobante y detalle' : 'Ver detalle'}
        </button>
      </div>
      {pago.verificacion === 'invalido' ? (
        <p className="text-red-700">Este pago se marcó INVÁLIDO en Pagos ME: revísalo antes de seguir.</p>
      ) : puedeVerificar ? (
        <label className="flex items-center gap-2 pt-0.5 cursor-pointer select-none">
          <input type="checkbox" checked={pagoOk} onChange={e => onPagoOk(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
          <span className={pagoOk ? 'text-emerald-800 font-medium' : 'text-neutral-700'}>
            ✓ Pago correcto (lo verifiqué contra el banco)
          </span>
        </label>
      ) : null}
      <p className="text-neutral-500">
        {pagoOk
          ? 'Al guardar: el pago queda verificado, la venta PROCESADA y su guía entra al lote de Despachos.'
          : pago.verificacion === 'valido'
            ? 'Pago ya verificado: al guardar, la venta queda en Pago verificado y su guía entra al lote de Despachos.'
            : 'Al guardar sin marcarlo, la guía entra al lote de Despachos pero no se imprime hasta verificar el pago.'}
        {!pago.tiene_guia && ' (Todavía no tiene guía en MercadoEnvíos.)'}
      </p>
      {detalle && <DetallePago p={pago} onCerrar={() => setDetalle(false)} />}
    </div>
  )
}

/** Todo lo que se trajo del pago, con el comprobante en grande. */
function DetallePago({ p, onCerrar }: { p: PagoME; onCerrar: () => void }) {
  const [esPdf, setEsPdf] = useState(false)
  const url = `/api/pagos-me/${p.id}/archivo?tipo=comprobante`
  const filas: [string, ReactNode][] = [
    ['Venta', <span key="v" className="font-mono">{p.venta}</span>],
    ['Cuenta', p.cuenta ?? '—'],
    ['Estado en MercadoEnvíos', p.estado_me ?? '—'],
    ['Fecha de la orden', hora(p.fecha_orden)],
    ['Método', metodoPago(p.metodo_pago)],
    ['Banco emisor → receptor', `${p.banco_emisor ?? '?'} → ${p.banco_receptor ?? '?'}`],
    ['Referencia', <b key="r" className="font-mono">{p.referencia ?? '—'}</b>],
    ['Fecha del pago', p.fecha_pago ?? '—'],
    ['Pagado / total de la orden', <span key="m">{bs(p.monto_pagado)} / {bs(p.total_orden)} <Monto p={p} /></span>],
    ['Envío', [p.carrier, p.envio_metodo, p.envio_opcion].filter(Boolean).join(' · ') || '—'],
    ['Guía', p.guia ?? (p.tiene_guia ? 'sí' : 'todavía no')],
  ]
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-auto p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Pago en MercadoEnvíos</h3>
          <button type="button" onClick={onCerrar} className="text-neutral-500 text-sm">Cerrar ✕</button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {filas.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-neutral-500">{k}</dt>
              <dd className="text-neutral-800">{v}</dd>
            </div>
          ))}
        </dl>
        {p.tiene_comprobante && (esPdf
          ? <iframe src={url} title="Comprobante" className="w-full h-[60vh] rounded border" />
          // eslint-disable-next-line @next/next/no-img-element
          : <img src={url} alt="Comprobante de pago" onError={() => setEsPdf(true)} className="w-full rounded border" />)}
        {p.tiene_comprobante && <a href={url} target="_blank" rel="noreferrer" className="text-xs underline text-violet-800">Abrir el comprobante en otra pestaña</a>}
      </div>
    </div>
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
    setAbierto(a => !a)
    if (ctx !== undefined || cargando) return
    setCargando(true)
    const r = await fetch(`/api/sales/ml-orden/contexto?numero=${encodeURIComponent(numero)}`).catch(() => null)
    setCtx(r?.ok ? await r.json() : null)
    setCargando(false)
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white text-xs">
      <button type="button" onClick={abrir} className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-neutral-50 rounded-lg">
        <span className="font-medium text-neutral-800">💬 Lo que se habló en MercadoLibre</span>
        <span className="text-neutral-400">{abierto ? 'Ocultar ▲' : 'Ver producto ofertado, notas y mensajes ▼'}</span>
      </button>
      {abierto && (
        <div className="border-t border-neutral-100 px-3 py-2 space-y-3">
          {cargando || ctx === undefined ? <p className="text-neutral-400">Buscando en MercadoLibre…</p>
            : ctx === null ? <p className="text-neutral-500">No se pudo traer de MercadoLibre.</p>
            : <>
              <div className="space-y-1.5">
                <div className="text-neutral-500">Lo que ofertó{ctx.cuenta ? ` (${ctx.cuenta})` : ''}</div>
                {ctx.items.map((i, k) => (
                  <div key={k} className="flex items-center gap-2">
                    <div className="w-10 h-10 shrink-0 rounded border border-neutral-200 bg-white overflow-hidden flex items-center justify-center">
                      {i.imagen
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={i.imagen} alt="" loading="lazy" className="w-full h-full object-contain" />
                        : <span className="text-neutral-300">—</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-neutral-800">
                        <b>{i.cantidad} ×</b>{' '}
                        {i.link ? <a href={i.link} target="_blank" rel="noreferrer" className="hover:underline">{i.titulo} ↗</a> : i.titulo}
                      </div>
                      <div className="text-neutral-500">
                        {i.variante && <span className="font-medium text-neutral-700">{i.variante}</span>}
                        {i.variante && i.precio != null && ' · '}
                        {i.precio != null && <span>{precio(i.precio, i.moneda)} c/u</span>}
                      </div>
                    </div>
                  </div>
                ))}
                {ctx.total != null && <div className="text-right text-neutral-600">Total de la orden: <b>{precio(ctx.total, ctx.moneda)}</b></div>}
              </div>

              <div>
                <div className="text-neutral-500 mb-0.5">Notas de la venta</div>
                {ctx.notas.length
                  ? ctx.notas.map((n, k) => <div key={k} className="rounded bg-amber-50 border border-amber-100 px-2 py-1 text-amber-900 mb-1">{n}</div>)
                  : <div className="text-neutral-400">Sin notas.</div>}
              </div>

              <div>
                <div className="text-neutral-500 mb-0.5">Últimos mensajes</div>
                {ctx.mensajes.length ? (
                  <div className="space-y-1">
                    {ctx.mensajes.map((m, k) => (
                      <div key={k} className={`rounded px-2 py-1 max-w-[90%] ${m.propio ? 'ml-auto bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-800'}`}>
                        {plano(m.texto)}
                        <div className={`text-[10px] ${m.propio ? 'text-neutral-400' : 'text-neutral-500'}`}>
                          {m.propio ? 'Tú' : 'Comprador'} · {hora(m.fecha)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <div className="text-neutral-400">Sin mensajes.</div>}
              </div>

              {ctx.preguntas.length > 0 && (
                <div>
                  <div className="text-neutral-500 mb-0.5">Preguntó antes de comprar</div>
                  {ctx.preguntas.slice(0, 5).map(p => (
                    <div key={p.id} className="mb-1">
                      <div className="text-neutral-800">“{p.texto}”{p.item_titulo && <span className="text-neutral-400"> · {p.item_titulo}</span>}</div>
                      {p.respuesta && <div className="text-neutral-500 pl-2">↳ {p.respuesta}</div>}
                    </div>
                  ))}
                </div>
              )}
            </>}
        </div>
      )}
    </div>
  )
}
