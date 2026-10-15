'use client'
// Ventas → Nueva venta (2026-10-11): el pago de MercadoEnvíos y "lo que se habló" en el mismo
// formulario, para verificar y registrar la venta sin ir a MercadoEnvíos ni a MercadoLibre.
//   - PagoDeVenta: el pago traído por el vigilante (o, si no está, cuál es el caso + "Buscar pago"),
//     el comprobante con su detalle (ventana aparte) y "Pago correcto" (al guardar: pago válido,
//     venta procesada y guía a Despachos).
//   - LoQueSeHablo: botón que abre en una ventana aparte la conversación de Mensajes de esa venta
//     (mensajes con fotos, responder, notas, variante y preguntas previas).
// Las ventanas van por portal al body (dentro del panel lateral, que tiene transform, quedaban
// encajonadas) y se cierran con Esc, con ✕ o tocando afuera.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { esRetiroEnTienda, type PagoME } from '@/lib/pagosMEComun'
import { Hilo, type Conversacion } from '@/components/preguntas/MensajesClient'
import type { MensajeRapido } from '@/lib/mensajesRapidos'
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

// ── Botón "Buscar pago" ─────────────────────────────────────────────────────
function IconoBuscar({ girando }: { girando: boolean }) {
  return girando ? (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  ) : (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 5v6h-6" />
    </svg>
  )
}

function BotonBuscar({ trayendo, onClick, principal, texto = 'Buscar pago' }: {
  trayendo: boolean; onClick: () => void; principal?: boolean; texto?: string
}) {
  return (
    <button type="button" onClick={onClick} disabled={trayendo}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:cursor-wait ${
        principal
          ? 'bg-sky-600 text-white shadow-sm hover:bg-sky-700 disabled:bg-sky-400'
          : 'border border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50 disabled:text-neutral-400'}`}>
      <IconoBuscar girando={trayendo} />
      {trayendo ? 'Buscando…' : texto}
    </button>
  )
}

// Sin pago en Pagos ME (2026-10-12): dice cuál de los casos es, comparando la hora de la compra con la
// de la última búsqueda. La extensión solo trae pagos con referencia y comprobante, así que "no pagó"
// y "no subió el comprobante" no se distinguen; "todavía no se buscó" sí.
function SinPago({ trayendo, traida, compraAt, onBuscar }: {
  trayendo: boolean; traida: Traida | null; compraAt: string | null; onBuscar: () => void
}) {
  const ultima = traida ? (traida.terminada_at ?? traida.pedido_at) : null
  const fallo = !trayendo && !!traida && (traida.con_error || !!traida.no_respondieron?.length)
  const caso: 'buscando' | 'fallo' | 'sin_buscar' | 'esperando' | 'no_esta' =
    trayendo ? 'buscando'
    : fallo ? 'fallo'
    : compraAt && (!ultima || new Date(ultima) < new Date(compraAt)) ? 'sin_buscar'
    : compraAt ? 'esperando'
    : 'no_esta'
  const estilo = {
    buscando: 'border-sky-200 bg-sky-50 text-sky-900',
    fallo: 'border-red-200 bg-red-50 text-red-900',
    sin_buscar: 'border-sky-200 bg-sky-50 text-sky-900',
    esperando: 'border-amber-200 bg-amber-50 text-amber-900',
    no_esta: 'border-amber-200 bg-amber-50 text-amber-900',
  }[caso]
  const titulo = {
    buscando: 'Buscando el pago en MercadoEnvíos…',
    fallo: 'La última búsqueda no terminó bien',
    sin_buscar: 'Todavía no se ha buscado este pago',
    esperando: 'El cliente todavía no ha pagado',
    no_esta: 'Este pago no está en Pagos ME',
  }[caso]
  const detalle = {
    buscando: <>Se traen todos los pagos nuevos de una vez (1–2 min). Si aparece este, se muestra aquí solo.</>,
    fallo: traida?.no_respondieron?.length
      ? <>{traida.no_respondieron.join(', ')} no respondió: revisa que la PC de Venezuela esté prendida y vuelve a buscar.</>
      : <>Hubo un error al traer los pagos. Vuelve a buscar; si se repite, revisa Pagos ME.</>,
    sin_buscar: <>La compra fue el <b>{hora(compraAt)}</b> y la última búsqueda, {ultima ? <>el <b>{hora(ultima)}</b></> : 'nunca'}. Búscalo ahora.</>,
    esperando: <>Se buscó el <b>{hora(ultima)}</b>, después de la compra, y no apareció: el cliente no ha pagado o no ha subido el comprobante. Escríbele o espera; si pagó por otro medio, verifica desde el detalle de la venta.</>,
    no_esta: <>Última búsqueda: <b>{ultima ? hora(ultima) : 'nunca'}</b>. Si el cliente pagó después, búscalo ahora.</>,
  }[caso]
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${estilo}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{titulo}</span>
        {caso !== 'buscando' && (
          <BotonBuscar trayendo={false} onClick={onBuscar} principal={caso === 'sin_buscar' || caso === 'fallo'}
            texto={caso === 'esperando' ? 'Buscar de nuevo' : 'Buscar pago'} />
        )}
        {caso === 'buscando' && <span className="text-sky-700"><IconoBuscar girando /></span>}
      </div>
      <p className="mt-1 text-xs opacity-80 leading-relaxed">{detalle}</p>
    </div>
  )
}

// ── El pago ─────────────────────────────────────────────────────────────────
export function PagoDeVenta({ numero, compraAt, pagoOk, onPagoOk, onPago, puedeVerificar }: {
  numero: string
  compraAt?: string | null   // cuándo se compró en ML: separa "todavía no se buscó" de "el cliente no ha pagado"
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

  if (!pago) return <SinPago trayendo={trayendo} traida={traida} compraAt={compraAt ?? null} onBuscar={traer} />

  const v = VERIF[pago.verificacion]
  const invalido = pago.verificacion === 'invalido'
  const retiro = esRetiroEnTienda(pago)
  return (
    <div className={`rounded-xl border text-sm transition-colors ${pagoOk ? 'border-emerald-300 bg-emerald-50/60' : invalido ? 'border-red-200 bg-red-50/50' : 'border-violet-200 bg-violet-50/40'}`}>
      {/* De dónde viene y su estado */}
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
        <span className="text-xs font-medium text-violet-900">
          Pago en MercadoEnvíos{pago.cuenta ? <span className="font-normal text-violet-700/80"> · {pago.cuenta}</span> : null}
        </span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${v.c}`}>{v.t}{pago.verificado_por ? ` · ${pago.verificado_por}` : ''}</span>
      </div>

      {retiro && (
        <div className="mx-3 mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          <b>🏪 Retiro en tienda</b> — el comprador pasa a buscarlo. No lleva guía: no pasa por Despachos.
        </div>
      )}

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
        {retiro
          ? (pagoOk || pago.verificacion === 'valido'
            ? 'Al guardar: el pago queda verificado y la venta queda CERRADA (se descuenta el stock). Solo falta que la retire.'
            : 'Sin marcarlo, la venta queda en borrador hasta verificar el pago.')
          : pagoOk
          ? 'Al guardar: el pago queda verificado, la venta PROCESADA y su guía entra al lote de Despachos.'
          : pago.verificacion === 'valido'
            ? 'Pago ya verificado: al guardar, la venta queda en Pago verificado y su guía entra al lote de Despachos.'
            : 'Sin marcarlo, la guía entra al lote de Despachos pero no se imprime hasta verificar el pago.'}
        {!retiro && !pago.tiene_guia && ' Todavía no tiene guía en MercadoEnvíos.'}
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
// 2026-10-12: es la MISMA conversación de Mensajes (components/preguntas/MensajesClient → Hilo): mensajes
// con fotos, responder y adjuntar, notas editables, producto con su variante y lo que preguntó antes.
type ConversacionVenta = { conversacion: Conversacion; rapidas: MensajeRapido[]; puedeEscribir: boolean }

/** `compacto` (2026-10-15): botón chico "Ver conversación" para listas (Mensajes → Pedir calificación). */
export function LoQueSeHablo({ numero, compacto, className = '', etiqueta }: { numero: string; compacto?: boolean; className?: string; etiqueta?: ReactNode }) {
  const [abierto, setAbierto] = useState(false)
  const [conv, setConv] = useState<ConversacionVenta | string | undefined>(undefined)   // string = error; undefined = sin pedir

  const abrir = async () => {
    setAbierto(true)
    if (conv !== undefined && typeof conv !== 'string') return
    setConv(undefined)
    const r = await fetch(`/api/mensajes/de-venta?numero=${encodeURIComponent(numero)}`).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    setConv(r?.ok && d.conversacion ? d : (d.error ?? 'No se pudo abrir la conversación'))
  }

  return (
    <>
      {compacto ? (
        <button type="button" onClick={abrir} className={`btn-secondary !px-2.5 !py-1 text-xs ${className}`}
          title="Ver lo que se habló con el comprador (mensajes, notas y preguntas) antes de escribirle"
          aria-label="Ver conversación">
          {etiqueta ?? '💬 Ver conversación'}
        </button>
      ) : (
        <button type="button" onClick={abrir}
          className="w-full flex items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-left hover:border-sky-300 hover:bg-sky-50/40 transition-colors">
          <span className="text-sm font-medium text-neutral-800">💬 Lo que se habló en MercadoLibre</span>
          <span className="text-xs text-sky-700">Mensajes, notas, variante y preguntas →</span>
        </button>
      )}
      {abierto && (
        <Ventana titulo="Lo que se habló en MercadoLibre" ancho="max-w-3xl" onCerrar={() => setAbierto(false)}
          subtitulo={<>Venta <span className="font-mono">{numero}</span></>}>
          <div className="p-3">
            {conv === undefined ? <p className="p-4 text-sm text-neutral-400">Abriendo la conversación…</p>
              : typeof conv === 'string' ? <p className="p-4 text-sm text-neutral-500">{conv}</p>
              : <Hilo c={conv.conversacion} rapidas={conv.rapidas} onCambio={() => {}} soloLectura={!conv.puedeEscribir} sinNotas />}
          </div>
        </Ventana>
      )}
    </>
  )
}
